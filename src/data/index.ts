import { Guide } from "@/lib/schema";
import { github } from "./guides/github";
import { gmail } from "./guides/gmail";
import { notion } from "./guides/notion";
import { slack } from "./guides/slack";

/** Curated, human-source-checked guides. Validated at load so a bad edit fails the build. */
export const CURATED: Guide[] = [github, notion, slack, gmail].map((g) => Guide.parse(g));

export function getCurated(slug: string): Guide | undefined {
  return CURATED.find((g) => g.slug === slug);
}
