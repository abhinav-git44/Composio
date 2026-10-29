/**
 * Keyless web search for the self-retrieval research path. Uses DuckDuckGo's HTML endpoint, then
 * Mojeek as a fallback. Both are HTML scrapes and can change or rate-limit; failures are reported
 * in the research trace and the agent still has its own candidate URLs to verify.
 */

export interface SearchHit {
  url: string;
  title: string;
}

const UA = "Mozilla/5.0 (compatible; OAuthCompassBot/1.0; +https://github.com/abhinav-git44/Composio)";

function decode(s: string) {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanUrl(u: string): string | null {
  try {
    const url = new URL(u);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

export function parseDuckDuckGo(html: string): SearchHit[] {
  const hits: SearchHit[] = [];
  const re = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    let href = decode(m[1]);
    if (href.startsWith("//")) href = `https:${href}`;
    try {
      const u = new URL(href);
      const target = u.hostname.endsWith("duckduckgo.com") ? u.searchParams.get("uddg") : href;
      if (u.hostname.endsWith("duckduckgo.com") && u.pathname.startsWith("/y.js")) continue; // ads
      const clean = target ? cleanUrl(target) : null;
      if (clean) hits.push({ url: clean, title: decode(m[2]) });
    } catch {
      /* skip */
    }
  }
  return hits;
}

export function parseMojeek(html: string): SearchHit[] {
  const hits: SearchHit[] = [];
  const re = /<a[^>]+class="[^"]*\bob\b[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const clean = cleanUrl(decode(m[1]));
    if (clean) hits.push({ url: clean, title: decode(m[2]) || clean });
  }
  if (hits.length) return hits;
  // Fallback: result titles inside <h2><a href=...>
  const re2 = /<h2[^>]*>\s*<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  while ((m = re2.exec(html))) {
    const clean = cleanUrl(decode(m[1]));
    if (clean && !/mojeek\.com/.test(clean)) hits.push({ url: clean, title: decode(m[2]) || clean });
  }
  return hits;
}

export async function webSearch(
  q: string,
  opts: { signal?: AbortSignal; fetchImpl?: typeof fetch; limit?: number } = {},
): Promise<{ hits: SearchHit[]; engine: string; error?: string }> {
  const f = opts.fetchImpl ?? fetch;
  const limit = opts.limit ?? 6;
  const errors: string[] = [];
  const engines: [string, () => Promise<Response>, (h: string) => SearchHit[]][] = [
    [
      "duckduckgo",
      () =>
        f("https://html.duckduckgo.com/html/", {
          method: "POST",
          headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ q, kl: "us-en" }).toString(),
          signal: opts.signal ? AbortSignal.any([opts.signal, AbortSignal.timeout(10_000)]) : AbortSignal.timeout(10_000),
        }),
      parseDuckDuckGo,
    ],
    [
      "mojeek",
      () =>
        f(`https://www.mojeek.com/search?q=${encodeURIComponent(q)}`, {
          headers: { "User-Agent": UA },
          signal: opts.signal ? AbortSignal.any([opts.signal, AbortSignal.timeout(10_000)]) : AbortSignal.timeout(10_000),
        }),
      parseMojeek,
    ],
  ];
  for (const [name, run, parse] of engines) {
    try {
      const res = await run();
      if (!res.ok) {
        errors.push(`${name}: HTTP ${res.status}`);
        continue;
      }
      const hits = parse(await res.text());
      if (hits.length) {
        const seen = new Set<string>();
        return { hits: hits.filter((h) => !seen.has(h.url) && seen.add(h.url)).slice(0, limit), engine: name };
      }
      errors.push(`${name}: no results parsed`);
    } catch (e) {
      errors.push(`${name}: ${(e as Error).message}`);
    }
  }
  return { hits: [], engine: "none", error: errors.join("; ") };
}
