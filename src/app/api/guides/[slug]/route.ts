import { getGuide } from "@/lib/guides";
import { SLUG_RE } from "@/lib/slug";

export const dynamic = "force-dynamic";

/** Public JSON for a guide (for agents and integrations). Contains only guide content. */
export async function GET(_req: Request, ctx: RouteContext<"/api/guides/[slug]">) {
  const { slug } = await ctx.params;
  if (!SLUG_RE.test(slug)) return Response.json({ error: "invalid_slug" }, { status: 400 });
  const g = await getGuide(slug);
  if (!g) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json(g, { headers: { "Cache-Control": "public, max-age=60" } });
}
