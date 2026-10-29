import { randomBytes } from "node:crypto";

export function slugify(s: string): string {
  return (
    s
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50) || "app"
  );
}

/** Generated guides get a random suffix so they never collide with curated slugs. */
export function generatedSlug(appName: string): string {
  return `${slugify(appName)}-${randomBytes(3).toString("hex")}`;
}

export const SLUG_RE = /^[a-z0-9-]{2,80}$/;
