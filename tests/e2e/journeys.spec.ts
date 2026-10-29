import { expect, test, type Page } from "@playwright/test";

const SHOTS = process.env.E2E_SCREENSHOTS;

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "page should not scroll horizontally").toBeLessThanOrEqual(0);
}

test.describe("library and curated guides", () => {
  test("home lists curated guides and the evidence legend", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("How long until");
    for (const slug of ["github", "notion", "slack", "google-gmail"]) await expect(page.getByTestId(`card-${slug}`)).toBeVisible();
    await expect(page.getByRole("heading", { name: "How to read the evidence labels" })).toBeVisible();
    await shot(page, "desktop-home");
  });

  test("search 'google' finds Gmail and opens a hard guide with a sourced wait", async ({ page }) => {
    await page.goto("/");
    await page.getByPlaceholder(/App name or website/).fill("google");
    await expect(page.getByTestId("card-google-gmail")).toBeVisible();
    await expect(page.getByTestId("card-slack")).toHaveCount(0);
    await page.getByTestId("card-google-gmail").click();
    await expect(page).toHaveURL(/\/guides\/google-gmail$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Gmail (Google): OAuth app setup");
    await expect(page.getByTestId("verdict")).toContainText("hard");
    await expect(page.getByTestId("wait")).toContainText("several weeks");
    await expect(page.getByTestId("wait")).toContainText("Sourced");
    await expect(page.locator("ol.sources > li")).toHaveCount(9);
    await shot(page, "desktop-gmail");
  });

  test("search 'github' + Enter jumps straight to the single match", async ({ page }) => {
    await page.goto("/");
    const input = page.getByPlaceholder(/App name or website/);
    await input.fill("github");
    await input.press("Enter");
    await expect(page).toHaveURL(/\/guides\/github$/);
    await expect(page.getByTestId("verdict")).toContainText("easy");
    await expect(page.getByText("Since August 2026, OAuth apps can register up to 10 redirect")).toBeVisible();
  });

  test("search 'slack' opens the guide; citations link to sources", async ({ page }) => {
    await page.goto("/");
    await page.getByPlaceholder(/App name or website/).fill("Slack");
    await page.getByTestId("card-slack").click();
    await expect(page.getByTestId("wait")).toContainText("10 weeks");
    const cite = page.locator("a.cite").first();
    const href = await cite.getAttribute("href");
    expect(href).toMatch(/^#source-\d+$/);
    await cite.click();
    await expect(page.locator(href!)).toBeVisible();
    // External source links open safely in a new tab.
    const ext = page.locator("ol.sources a").first();
    await expect(ext).toHaveAttribute("target", "_blank");
    await expect(ext).toHaveAttribute("rel", /noopener/);
  });

  test("recommender checkboxes change the recommendation", async ({ page }) => {
    await page.goto("/guides/slack");
    const head = page.getByTestId("rec-headline");
    await expect(head).toHaveAttribute("data-choice", "check-availability");
    await expect(head).toContainText("Check whether Composio offers managed auth");
    await page.getByLabel("Users must see my app name on the consent screen").check();
    await expect(head).toContainText("Plan for your own Slack OAuth app");
    await expect(page.getByTestId("recommender")).toContainText("Composio's");
    await page.getByLabel("Users must see my app name on the consent screen").uncheck();
    await expect(head).toContainText("Check whether Composio offers managed auth");
  });

  test("prerequisite checklist persists across reloads", async ({ page }) => {
    await page.goto("/guides/google-gmail");
    await expect(page.getByTestId("checklist-count")).toHaveText("0 of 3 ready");
    await page.locator(".checklist input").first().check();
    await expect(page.getByTestId("checklist-count")).toHaveText("1 of 3 ready");
    await page.reload();
    await expect(page.getByTestId("checklist-count")).toHaveText("1 of 3 ready");
    await expect(page.locator(".checklist input").first()).toBeChecked();
  });

  test("copy link, copy markdown, share fallback and print", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/guides/notion");
    await page.evaluate(() => {
      (window as unknown as { __printed: number }).__printed = 0;
      window.print = () => {
        (window as unknown as { __printed: number }).__printed++;
      };
    });

    await page.getByRole("button", { name: "Copy link" }).click();
    await expect(page.locator(".toast")).toHaveText("Link copied");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("http://localhost:3100/guides/notion");

    await page.getByRole("button", { name: "Copy as Markdown" }).click();
    await expect(page.locator(".toast")).toHaveText("Markdown copied");
    const md = await page.evaluate(() => navigator.clipboard.readText());
    expect(md).toContain("# Notion: OAuth app setup guide");
    expect(md).toContain("http://localhost:3100/guides/notion");
    expect(md).not.toContain("{{URL}}");
    expect(md).toContain("## Sources");

    await page.getByRole("button", { name: "Share" }).click();
    await expect(page.locator(".toast")).toContainText("Link copied");

    await page.getByRole("button", { name: "Print / PDF" }).click();
    expect(await page.evaluate(() => (window as unknown as { __printed: number }).__printed)).toBe(1);
  });

  test("header navigation works", async ({ page }) => {
    await page.goto("/guides/github");
    await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "How it works" }).click();
    await expect(page).toHaveURL(/\/about$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("How OAuth Compass works");
    await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Library" }).click();
    await expect(page).toHaveURL(/\/#library$/);
    await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Generate" }).click();
    await expect(page).toHaveURL(/\/#generate$/);
    await page.getByRole("link", { name: "OAuth Compass home" }).click();
    await expect(page).toHaveURL("http://localhost:3100/");
    await page.goto("/guides/github");
    await page.getByRole("link", { name: "← All guides" }).click();
    await expect(page).toHaveURL("http://localhost:3100/");
  });

  test("unknown and malformed guide URLs show a not-found page", async ({ page }) => {
    for (const p of ["/guides/does-not-exist", "/guides/BAD_SLUG!!"]) {
      const res = await page.goto(p);
      expect(res?.status()).toBe(404);
      await expect(page.getByRole("heading", { name: "Guide not found" })).toBeVisible();
    }
  });
});

test.describe("live generation (fixture client — scripted, not real research)", () => {
  test("generates a guide, shows progress, persists it and survives refresh and a fresh browser", async ({ page, browser }) => {
    await page.goto("/");
    await expect(page.getByText("Test mode: generation replays a scripted fixture")).toBeVisible();
    await page.getByPlaceholder(/App name or website/).fill("Acme Notes");
    await expect(page.getByText(/No curated guide matches/)).toBeVisible();
    await page.getByRole("button", { name: /Generate guide for/ }).click();
    await expect(page.getByTestId("progress")).toContainText("Searching");
    await page.waitForURL(/\/guides\/acme-notes-fixture-[a-f0-9]{6}$/);
    const url = page.url();

    await expect(page.getByText("Test fixture.", { exact: false })).toBeVisible();
    await expect(page.getByTestId("research-trace")).toContainText("1 searches");
    const corrections = page.getByTestId("corrections");
    await expect(corrections).toContainText("Dropped source [s9]");
    await expect(corrections).toContainText("Approval wait: unsourced estimate removed");
    await expect(corrections).toContainText("Composio managed auth");
    await expect(page.getByTestId("wait")).toContainText("Unknown");
    await expect(page.getByText("Composio lists Acme as managed.", { exact: true })).toHaveCount(0);
    await expect(page.locator("ol.sources")).toContainText("search result only");
    await shot(page, "desktop-generated");

    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Acme Notes (fixture)");

    const fresh = await browser.newContext();
    const p2 = await fresh.newPage();
    await p2.goto(url);
    await expect(p2.getByRole("heading", { level: 1 })).toContainText("Acme Notes (fixture)");
    const api = await p2.request.get(url.replace("/guides/", "/api/guides/"));
    expect(api.status()).toBe(200);
    expect((await api.json()).origin).toBe("fixture");
    await fresh.close();

    // Appears under "Recently generated" and a repeat request reuses it.
    await page.goto("/");
    await expect(page.locator(".card", { hasText: "Acme Notes (fixture)" }).first()).toBeVisible();
    await page.getByPlaceholder(/App name or website/).fill("acme notes!");
    await page.getByRole("button", { name: /Generate guide for/ }).click();
    await page.waitForURL(/\/guides\/acme-notes-fixture-/);
  });

  test("ambiguous names offer candidates", async ({ page }) => {
    await page.goto("/");
    await page.getByPlaceholder(/App name or website/).fill("Mercury");
    await page.getByRole("button", { name: /Generate guide for/ }).click();
    const box = page.getByTestId("ambiguous");
    await expect(box).toContainText("Which one did you mean?");
    await expect(box.getByRole("button")).toHaveCount(2);
    await box.getByRole("button").first().click();
    await page.waitForURL(/\/guides\//);
  });

  test("invalid input shows a clear error and does not navigate", async ({ page }) => {
    await page.goto("/");
    for (const [input, msg] of [
      ["http://localhost:3000", "no custom ports"],
      ["http://localhost", "public website"],
      ["javascript:alert(1)", "http(s)"],
      ["<script>", "simple punctuation"],
    ]) {
      await page.getByPlaceholder(/App name or website/).fill(input);
      await page.getByRole("button", { name: /Generate guide for/ }).click();
      await expect(page.locator(".error-box")).toContainText(msg);
      await expect(page).toHaveURL("http://localhost:3100/");
    }
  });

  test("generate API rejects GET and bad payloads", async ({ request }) => {
    expect((await request.get("/api/generate")).status()).toBe(405);
    expect((await request.post("/api/generate", { data: "nope", headers: { "content-type": "text/plain" } })).status()).toBe(415);
    expect((await request.post("/api/generate", { data: { query: "" } })).status()).toBe(400);
  });
});

test.describe("unconfigured server (no AI provider key)", () => {
  test("library works, generation is disabled with an explanation", async ({ page, request }) => {
    await page.goto("http://localhost:3101/");
    await expect(page.getByText("Live generation is off on this deployment")).toBeVisible();
    await page.getByPlaceholder(/App name or website/).fill("Linear");
    await expect(page.getByRole("button", { name: /Generate guide for/ })).toBeDisabled();
    await page.goto("http://localhost:3101/guides/slack");
    await expect(page.getByTestId("verdict")).toBeVisible();
    const res = await request.post("http://localhost:3101/api/generate", { data: { query: "Linear" } });
    expect(res.status()).toBe(503);
    expect((await res.json()).error).toBe("not_configured");
  });
});

test.describe("responsive layout @mobile", () => {
  test("home and guides fit a phone without horizontal scroll @mobile", async ({ page }) => {
    for (const [path, name] of [
      ["/", "mobile-home"],
      ["/guides/google-gmail", "mobile-gmail"],
      ["/guides/slack", "mobile-slack"],
      ["/about", "mobile-about"],
    ]) {
      await page.goto(path);
      await noHorizontalScroll(page);
      await shot(page, name);
    }
    // Primary actions remain reachable at phone width.
    await page.goto("/guides/github");
    await expect(page.getByRole("button", { name: "Copy link" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Share" })).toBeVisible();
  });
});
