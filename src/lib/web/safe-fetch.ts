import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Server-side page fetching with SSRF protection. Used when the AI provider's own web tools are
 * unavailable (e.g. Gemini free tier). Rules:
 * - http(s) only, default ports only, no credentials in URLs
 * - hostname must resolve only to public unicast addresses (checked on every redirect hop)
 * - at most 4 redirects, 10 s timeout, 1.5 MB body cap, HTML/text only
 * Residual risk: DNS rebinding between our lookup and fetch's own lookup (documented in README).
 */

export interface FetchedPage {
  url: string; // final URL after redirects
  title: string;
  text: string;
  /** Absolute http(s) links found on the page, with their anchor text. */
  links?: { url: string; text: string }[];
}

export function extractLinks(html: string, base: string): { url: string; text: string }[] {
  const out: { url: string; text: string }[] = [];
  const seen = new Set<string>();
  const re = /<a\b[^>]*href\s*=\s*["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && out.length < 400) {
    try {
      const u = new URL(m[1], base);
      if (u.protocol !== "https:" && u.protocol !== "http:") continue;
      u.hash = "";
      const key = u.toString();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ url: key, text: m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 120) });
    } catch {
      /* skip */
    }
  }
  return out;
}

export class FetchBlockedError extends Error {}

const MAX_BYTES = 1_500_000;
const MAX_REDIRECTS = 4;
const UA = "OAuthCompassBot/1.0 (+https://github.com/abhinav-git44/Composio; research for OAuth setup guides)";

function ipv4ToInt(ip: string) {
  return ip.split(".").reduce((a, o) => (a << 8) + Number(o), 0) >>> 0;
}

const V4_BLOCKS: [string, number][] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

export function isPublicIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const n = ipv4ToInt(ip);
    return !V4_BLOCKS.some(([base, bits]) => {
      const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
      return (n & mask) === (ipv4ToInt(base) & mask);
    });
  }
  if (v === 6) {
    const s = ip.toLowerCase();
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(s);
    if (mapped) return isPublicIp(mapped[1]);
    if (s === "::" || s === "::1") return false;
    if (/^(fc|fd)/.test(s)) return false; // unique local
    if (/^fe[89ab]/.test(s)) return false; // link local
    if (/^ff/.test(s)) return false; // multicast
    if (s.startsWith("2001:db8")) return false; // documentation
    if (s.startsWith("64:ff9b:")) return false; // NAT64
    return true;
  }
  return false;
}

type Resolver = (host: string) => Promise<string[]>;
const defaultResolver: Resolver = async (host) => (await lookup(host, { all: true, verbatim: true })).map((a) => a.address);

export async function assertPublicUrl(raw: string, resolve: Resolver = defaultResolver): Promise<URL> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new FetchBlockedError("invalid URL");
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new FetchBlockedError("scheme not allowed");
  if (u.username || u.password) throw new FetchBlockedError("credentials in URL");
  if (u.port && u.port !== "80" && u.port !== "443") throw new FetchBlockedError("non-default port");
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new FetchBlockedError("private host");
  }
  const addrs = isIP(host) ? [host] : await resolve(host).catch(() => [] as string[]);
  if (!addrs.length) throw new FetchBlockedError("host did not resolve");
  if (!addrs.every(isPublicIp)) throw new FetchBlockedError("host resolves to a private address");
  return u;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function htmlToText(html: string): { title: string; text: string } {
  const title = (/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "").replace(/\s+/g, " ").trim();
  let body = html
    .replace(/<(script|style|noscript|svg|template|iframe)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(nav|footer|header|aside)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  const main = /<main[\s\S]*?<\/main>/i.exec(body)?.[0] ?? /<article[\s\S]*?<\/article>/i.exec(body)?.[0];
  if (main && main.length > 500) body = main;
  const text = body
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)[^>]*>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === "#") {
        const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) && code < 0x110000 ? String.fromCodePoint(code) : " ";
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/[ \t\f\v\r]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
  return { title, text };
}

async function readCapped(res: Response): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel().catch(() => {});
      break;
    }
    chunks.push(value);
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(Buffer.concat(chunks));
}

export async function safeFetch(
  raw: string,
  opts: { signal?: AbortSignal; fetchImpl?: typeof fetch; resolve?: Resolver; maxChars?: number } = {},
): Promise<FetchedPage> {
  const f = opts.fetchImpl ?? fetch;
  let url = await assertPublicUrl(raw, opts.resolve);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const signal = opts.signal ? AbortSignal.any([opts.signal, AbortSignal.timeout(10_000)]) : AbortSignal.timeout(10_000);
    const res = await f(url.toString(), {
      redirect: "manual",
      signal,
      headers: { "User-Agent": UA, Accept: "text/html,text/plain;q=0.9,*/*;q=0.1", "Accept-Language": "en" },
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) throw new Error(`redirect without location (${res.status})`);
      url = await assertPublicUrl(new URL(loc, url).toString(), opts.resolve);
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const ctype = res.headers.get("content-type") ?? "";
    if (ctype && !/text\/html|text\/plain|application\/xhtml/i.test(ctype)) throw new Error(`unsupported content type ${ctype.split(";")[0]}`);
    const body = await readCapped(res);
    const isPlain = /text\/plain/i.test(ctype);
    const { title, text } = isPlain ? { title: "", text: body } : htmlToText(body);
    if (text.length < 200) throw new Error("page has almost no text (may need JavaScript)");
    return {
      url: url.toString(),
      title: title || url.hostname,
      text: text.slice(0, opts.maxChars ?? 14_000),
      links: isPlain ? [] : extractLinks(body, url.toString()),
    };
  }
  throw new Error("too many redirects");
}
