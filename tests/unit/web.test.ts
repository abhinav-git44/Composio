import { describe, expect, it } from "vitest";
import { assertPublicUrl, FetchBlockedError, htmlToText, isPublicIp, safeFetch } from "@/lib/web/safe-fetch";
import { parseDuckDuckGo, parseMojeek, webSearch } from "@/lib/web/search";

const resolveTo = (map: Record<string, string[]>) => async (h: string) => map[h] ?? [];

describe("isPublicIp", () => {
  it("blocks private, loopback, link-local, metadata, CGNAT, multicast and v6 equivalents", () => {
    for (const ip of ["10.1.2.3", "127.0.0.1", "169.254.169.254", "172.16.5.4", "172.31.255.255", "192.168.1.1", "100.64.0.1", "0.0.0.0", "224.0.0.1", "::1", "::", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1"]) {
      expect(isPublicIp(ip), ip).toBe(false);
    }
  });
  it("allows public addresses", () => {
    for (const ip of ["8.8.8.8", "172.32.0.1", "140.82.112.3", "2606:4700::1111"]) expect(isPublicIp(ip), ip).toBe(true);
  });
});

describe("assertPublicUrl", () => {
  const resolve = resolveTo({ "docs.example.org": ["93.184.216.34"], "evil.example.org": ["127.0.0.1"], "mixed.example.org": ["93.184.216.34", "10.0.0.5"] });
  it("accepts public hosts", async () => {
    await expect(assertPublicUrl("https://docs.example.org/a", resolve)).resolves.toBeInstanceOf(URL);
  });
  it.each([
    ["file:///etc/passwd"],
    ["ftp://docs.example.org"],
    ["https://user:pw@docs.example.org"],
    ["https://docs.example.org:8080/"],
    ["http://localhost/"],
    ["http://127.0.0.1/"],
    ["http://[::1]/"],
    ["http://169.254.169.254/latest/meta-data"],
    ["https://evil.example.org/"],
    ["https://mixed.example.org/"],
    ["https://nxdomain.example.org/"],
    ["https://db.internal/"],
  ])("rejects %s", async (u) => {
    await expect(assertPublicUrl(u, resolve)).rejects.toBeInstanceOf(FetchBlockedError);
  });
});

describe("safeFetch", () => {
  const resolve = resolveTo({ "docs.example.org": ["93.184.216.34"], "evil.example.org": ["10.0.0.1"] });
  const html = `<html><head><title>OAuth apps</title><script>steal()</script></head><body><nav>menu</nav><main><h1>Create an OAuth app</h1><p>Register your app &amp; set the redirect URI.</p>${"<p>More text about scopes and review.</p>".repeat(20)}</main></body></html>`;

  it("follows redirects only to public hosts and extracts text", async () => {
    const f = (async (url: string) => {
      if (url === "https://docs.example.org/old") return new Response(null, { status: 301, headers: { location: "/new" } });
      return new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
    }) as unknown as typeof fetch;
    const p = await safeFetch("https://docs.example.org/old", { fetchImpl: f, resolve });
    expect(p.url).toBe("https://docs.example.org/new");
    expect(p.title).toBe("OAuth apps");
    expect(p.text).toContain("Register your app & set the redirect URI.");
    expect(p.text).not.toContain("steal");
    expect(p.text).not.toContain("menu");
  });

  it("refuses a redirect into a private network", async () => {
    const f = (async () => new Response(null, { status: 302, headers: { location: "https://evil.example.org/admin" } })) as unknown as typeof fetch;
    await expect(safeFetch("https://docs.example.org/x", { fetchImpl: f, resolve })).rejects.toBeInstanceOf(FetchBlockedError);
  });

  it("rejects non-HTML content, HTTP errors and near-empty pages", async () => {
    const pdf = (async () => new Response("%PDF", { status: 200, headers: { "content-type": "application/pdf" } })) as unknown as typeof fetch;
    await expect(safeFetch("https://docs.example.org/a.pdf", { fetchImpl: pdf, resolve })).rejects.toThrow(/content type/);
    const nf = (async () => new Response("no", { status: 404 })) as unknown as typeof fetch;
    await expect(safeFetch("https://docs.example.org/x", { fetchImpl: nf, resolve })).rejects.toThrow(/HTTP 404/);
    const spa = (async () => new Response("<html><body><div id=root></div></body></html>", { headers: { "content-type": "text/html" } })) as unknown as typeof fetch;
    await expect(safeFetch("https://docs.example.org/app", { fetchImpl: spa, resolve })).rejects.toThrow(/JavaScript/);
  });

  it("stops after too many redirects", async () => {
    const loop = (async () => new Response(null, { status: 302, headers: { location: "https://docs.example.org/loop" } })) as unknown as typeof fetch;
    await expect(safeFetch("https://docs.example.org/loop", { fetchImpl: loop, resolve })).rejects.toThrow(/too many redirects/);
  });
});

describe("htmlToText", () => {
  it("decodes entities and keeps list structure", () => {
    const { text } = htmlToText("<ul><li>One &lt;b&gt;</li><li>Two&#39;s &#x2014; ok</li></ul>");
    expect(text).toContain("- One <b>");
    expect(text).toContain("- Two's — ok");
  });
});

describe("search parsers", () => {
  it("parses DuckDuckGo HTML results, unwrapping redirect links and skipping ads", () => {
    const html = `
      <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Flinear.app%2Fdevelopers%2Foauth&amp;rut=x">Linear <b>OAuth</b></a>
      <a class="result__a" href="https://duckduckgo.com/y.js?ad=1">Ad</a>
      <a class="result__a" href="https://developers.linear.app/docs">Direct</a>`;
    expect(parseDuckDuckGo(html)).toEqual([
      { url: "https://linear.app/developers/oauth", title: "Linear OAuth" },
      { url: "https://developers.linear.app/docs", title: "Direct" },
    ]);
  });
  it("parses Mojeek results", () => {
    const html = `<ul class="results-standard"><li><a class="ob" href="https://linear.app/developers/oauth-2-0-authentication">OAuth 2.0 authentication</a></li></ul>`;
    expect(parseMojeek(html)).toEqual([{ url: "https://linear.app/developers/oauth-2-0-authentication", title: "OAuth 2.0 authentication" }]);
  });
  it("falls back to Mojeek when DuckDuckGo blocks, and reports both failures", async () => {
    const calls: string[] = [];
    const f = (async (url: string) => {
      calls.push(url);
      if (url.includes("duckduckgo")) return new Response("blocked", { status: 202 });
      return new Response(`<a class="ob" href="https://x.example.org/a">A</a>`, { status: 200 });
    }) as unknown as typeof fetch;
    const r = await webSearch("q", { fetchImpl: f });
    expect(r.engine).toBe("mojeek");
    expect(r.hits).toHaveLength(1);
    const none = (async () => new Response("", { status: 503 })) as unknown as typeof fetch;
    const r2 = await webSearch("q", { fetchImpl: none });
    expect(r2.hits).toEqual([]);
    expect(r2.error).toMatch(/duckduckgo: HTTP 503; mojeek: HTTP 503/);
  });
});
