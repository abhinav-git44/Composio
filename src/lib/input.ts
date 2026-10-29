/**
 * Validation for the "app name or website" a developer submits.
 *
 * The server never fetches the submitted URL itself: research runs through Anthropic's
 * server-side web_search / web_fetch tools, which refuse private addresses. We still reject
 * anything that is not a plain public http(s) website so the input cannot be used to point
 * the agent at internal hosts, credentials or odd schemes.
 */
export type ParsedQuery =
  | { ok: true; kind: "name"; value: string; display: string }
  | { ok: true; kind: "url"; value: string; display: string; host: string }
  | { ok: false; error: string };

const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} .&+'’()!\-_/]{0,79}$/u;
const BLOCKED_HOST_SUFFIXES = [".local", ".localhost", ".internal", ".lan", ".home", ".corp", ".test", ".invalid", ".example"];

export function parseQuery(raw: unknown): ParsedQuery {
  if (typeof raw !== "string") return { ok: false, error: "Enter an app name or website." };
  if (/[\u0000-\u001f\u007f]/.test(raw)) return { ok: false, error: "The input contains control characters." };
  const value = raw.trim().replace(/\s+/g, " ");
  if (value.length < 2) return { ok: false, error: "Enter at least 2 characters." };
  if (value.length > 200) return { ok: false, error: "Keep it under 200 characters." };

  // Any "scheme:" prefix (javascript:, data:, mailto:, file:...) is treated as a URL attempt.
  const looksLikeUrl = /^[a-z][a-z0-9+.-]*:/i.test(value) || /^[^\s/]+\.[a-z]{2,}(\/|$)/i.test(value);
  if (looksLikeUrl) return parseUrl(value);

  if (!NAME_RE.test(value)) {
    return { ok: false, error: "Use letters, numbers and simple punctuation for an app name." };
  }
  return { ok: true, kind: "name", value, display: value };
}

function parseUrl(value: string): ParsedQuery {
  const scheme = /^([a-z][a-z0-9+.-]*):(?!\d)/i.exec(value)?.[1]?.toLowerCase();
  if (scheme && scheme !== "http" && scheme !== "https") {
    return { ok: false, error: "Only http(s) website addresses are supported." };
  }
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`;
  let u: URL;
  try {
    u = new URL(withScheme);
  } catch {
    return { ok: false, error: "That doesn't look like a valid website address." };
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") {
    return { ok: false, error: "Only http(s) website addresses are supported." };
  }
  if (u.username || u.password) return { ok: false, error: "Remove credentials from the URL." };
  if (u.port && u.port !== "443" && u.port !== "80") {
    return { ok: false, error: "Use the app's public website (no custom ports)." };
  }
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (isIpLiteral(host)) return { ok: false, error: "Use a domain name, not an IP address." };
  if (host === "localhost" || !host.includes(".") || BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s))) {
    return { ok: false, error: "Use a public website address." };
  }
  if (!/^[a-z0-9.-]+$/.test(host) && !host.startsWith("xn--")) {
    return { ok: false, error: "That domain contains unsupported characters." };
  }
  const path = u.pathname === "/" ? "" : u.pathname.replace(/\/+$/, "");
  const clean = `https://${host}${path}`;
  if (clean.length > 200) return { ok: false, error: "That URL is too long." };
  return { ok: true, kind: "url", value: clean, display: host.replace(/^www\./, ""), host };
}

function isIpLiteral(host: string) {
  if (/^\[.*\]$/.test(host) || host.includes(":")) return true; // IPv6
  if (/^\d+(\.\d+){0,3}$/.test(host)) return true; // dotted / decimal IPv4
  if (/^0x[0-9a-f]+$/i.test(host)) return true;
  return false;
}

/** Cache key for "have we already generated this?" lookups. */
export function queryKey(q: Extract<ParsedQuery, { ok: true }>): string {
  return q.kind === "url"
    ? `url:${q.host.replace(/^www\./, "")}`
    : `name:${q.value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}`;
}
