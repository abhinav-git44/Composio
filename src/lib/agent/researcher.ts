import "server-only";
import { GoogleGenAI } from "@google/genai";
import type { ParsedQuery } from "../input";
import { createAnthropicClient } from "./anthropic";
import { createFixtureClient } from "./fixture";
import { DEFAULT_GEMINI_MODEL, runGeminiAgent, type GeminiLike } from "./gemini";
import { runSelfResearch, SELF_MODELS, type SelfResearchDeps } from "./self-research";
import { DEFAULT_MODEL, runAgent } from "./run";
import type { AgentEvent, AgentOutcome, ModelClient } from "./types";

export type Provider = "anthropic" | "gemini" | "fixture";

/** One research backend. `label` and `model` are recorded on the guide; keys never are. */
export interface Researcher {
  provider: Provider;
  model: string;
  run(query: Extract<ParsedQuery, { ok: true }>, opts: { emit: (e: AgentEvent) => void; signal?: AbortSignal }): Promise<AgentOutcome>;
}

/**
 * Picks the backend from env. COMPASS_PROVIDER forces one; otherwise Anthropic if its key is set,
 * then Gemini. COMPASS_AGENT_MODE=fixture overrides everything (tests only).
 */
export function activeProvider(env: NodeJS.ProcessEnv = process.env): Provider | null {
  if (env.COMPASS_AGENT_MODE === "fixture") return "fixture";
  const forced = env.COMPASS_PROVIDER;
  if (forced === "anthropic") return env.ANTHROPIC_API_KEY ? "anthropic" : null;
  if (forced === "gemini") return env.GEMINI_API_KEY ? "gemini" : null;
  if (env.ANTHROPIC_API_KEY) return "anthropic";
  if (env.GEMINI_API_KEY) return "gemini";
  return null;
}

export function anthropicResearcher(client: ModelClient, model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL): Researcher {
  const provider: Provider = client.label === "fixture" ? "fixture" : "anthropic";
  return {
    provider,
    model: provider === "fixture" ? "fixture (no model)" : model,
    run: (q, o) => runAgent(client, q, { ...o, model }),
  };
}

export function geminiResearcher(ai: GeminiLike, model = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL, fetchImpl?: typeof fetch): Researcher {
  const researchModels = (process.env.GEMINI_RESEARCH_MODELS ?? "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  return {
    provider: "gemini",
    model,
    run: (q, o) => runGeminiAgent(ai, q, { ...o, model, researchModels: researchModels.length ? researchModels : undefined, fetchImpl }),
  };
}

/**
 * Gemini without provider-side search: the server searches and downloads pages itself.
 * Default for Gemini because the free tier has no Search grounding on current models.
 */
export function geminiSelfResearcher(ai: GeminiLike, deps?: SelfResearchDeps): Researcher {
  const models = [...new Set([process.env.GEMINI_MODEL, ...SELF_MODELS].filter((m): m is string => !!m))];
  return { provider: "gemini", model: `${models[0]} (server-side search + fetch)`, run: (q, o) => runSelfResearch(ai, q, { ...o, models, deps }) };
}

export function getResearcher(): Researcher | null {
  switch (activeProvider()) {
    case "fixture":
      return anthropicResearcher(createFixtureClient());
    case "anthropic":
      return anthropicResearcher(createAnthropicClient(process.env.ANTHROPIC_API_KEY as string));
    case "gemini": {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string }) as unknown as GeminiLike;
      return process.env.GEMINI_RESEARCH_MODE === "grounding" ? geminiResearcher(ai) : geminiSelfResearcher(ai);
    }
    default:
      return null;
  }
}
