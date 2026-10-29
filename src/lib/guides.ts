import "server-only";
import { CURATED, getCurated } from "@/data";
import type { Guide } from "./schema";
import { getStore } from "./store";

export async function getGuide(slug: string): Promise<Guide | null> {
  return getCurated(slug) ?? (await getStore().get(slug).catch(() => null));
}

export interface GuideCard {
  slug: string;
  appName: string;
  vendor: string;
  origin: Guide["origin"];
  difficulty: Guide["difficulty"]["level"];
  effort: string;
  wait: string;
  waitEvidence: Guide["approval"]["wait"]["evidence"];
  approvalRequired: Guide["approval"]["required"];
  createdAt: string;
}

export function toCard(g: Guide): GuideCard {
  return {
    slug: g.slug,
    appName: g.appName,
    vendor: g.vendor,
    origin: g.origin,
    difficulty: g.difficulty.level,
    effort: g.handsOnEffort.text,
    wait: g.approval.wait.text,
    waitEvidence: g.approval.wait.evidence,
    approvalRequired: g.approval.required,
    createdAt: g.createdAt,
  };
}

export async function libraryCards(): Promise<{ curated: GuideCard[]; generated: GuideCard[] }> {
  const recent = await getStore()
    .recent(12)
    .catch(() => []);
  return { curated: CURATED.map(toCard), generated: recent.map(toCard) };
}
