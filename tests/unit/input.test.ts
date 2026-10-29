import { describe, expect, it } from "vitest";
import { parseQuery, queryKey } from "@/lib/input";

const ok = (raw: string) => {
  const r = parseQuery(raw);
  if (!r.ok) throw new Error(`expected ok for ${raw}: ${r.error}`);
  return r;
};
const bad = (raw: unknown) => {
  const r = parseQuery(raw);
  expect(r.ok, `expected rejection for ${String(raw)}`).toBe(false);
};

describe("parseQuery", () => {
  it("accepts plain app names", () => {
    expect(ok("Slack").kind).toBe("name");
    expect(ok("  Google   Calendar ").value).toBe("Google Calendar");
    expect(ok("Monday.com").kind).toBe("url"); // domain-shaped names are treated as websites
    expect(ok("AT&T").kind).toBe("name");
    expect(ok("Yahoo!").kind).toBe("name");
    expect(ok("Zoho CRM (EU)").kind).toBe("name");
  });

  it("normalises websites", () => {
    const r = ok("https://www.Linear.app/");
    expect(r.kind).toBe("url");
    if (r.kind === "url") {
      expect(r.value).toBe("https://www.linear.app");
      expect(r.display).toBe("linear.app");
    }
    expect(ok("linear.app/docs").value).toBe("https://linear.app/docs");
  });

  it("drops query strings and fragments from URLs", () => {
    expect(ok("https://example.org/a?token=secret#x").value).toBe("https://example.org/a");
  });

  it("rejects non-strings, empty, too long and control characters", () => {
    bad(undefined);
    bad(42);
    bad({ q: "x" });
    bad("");
    bad(" a ");
    bad("x".repeat(201));
    bad("Slack\u0000");
    bad("Sla\nck");
  });

  it("rejects dangerous or private URLs", () => {
    bad("javascript:alert(1)");
    bad("file:///etc/passwd");
    bad("ftp://example.org");
    bad("http://localhost:3000");
    bad("http://127.0.0.1/admin");
    bad("http://169.254.169.254/latest/meta-data");
    bad("http://2130706433/");
    bad("http://0x7f000001/");
    bad("http://[::1]/");
    bad("https://user:pass@example.org");
    bad("https://example.org:8443");
    bad("https://printer.local");
    bad("https://db.internal");
    bad("https://intranet/");
  });

  it("rejects names with markup", () => {
    bad("<script>alert(1)</script>");
    bad("Slack; DROP TABLE");
  });

  it("builds stable cache keys", () => {
    const a = parseQuery("https://www.linear.app");
    const b = parseQuery("linear.app");
    if (!a.ok || !b.ok) throw new Error();
    expect(queryKey(a)).toBe(queryKey(b));
    const c = parseQuery("Google  Calendar");
    const d = parseQuery("google calendar");
    if (!c.ok || !d.ok) throw new Error();
    expect(queryKey(c)).toBe(queryKey(d));
  });
});

describe("parseQuery scheme handling", () => {
  it("gives a clear error for non-http schemes without //", async () => {
    for (const s of ["javascript:alert(1)", "data:text/html,hi", "mailto:a@b.co", "vbscript:x"]) {
      const r = parseQuery(s);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/http\(s\)/);
    }
  });
});
