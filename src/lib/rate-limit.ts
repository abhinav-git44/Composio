/**
 * Best-effort in-memory limiter. Per server instance only — on serverless each instance has its
 * own memory, so this bounds abuse per instance rather than globally (documented in README).
 */
const WINDOW_MS = 10 * 60 * 1000;
const PER_IP = Number(process.env.COMPASS_RATE_LIMIT ?? 6);
const MAX_CONCURRENT = Number(process.env.COMPASS_MAX_CONCURRENT ?? 3);

const hits = new Map<string, number[]>();
let active = 0;

export function checkRate(ip: string, now = Date.now()): { ok: true } | { ok: false; retryAfterSec: number; reason: string } {
  if (active >= MAX_CONCURRENT) {
    return { ok: false, retryAfterSec: 30, reason: "Too many guides are being generated right now." };
  }
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= PER_IP) {
    return {
      ok: false,
      retryAfterSec: Math.ceil((WINDOW_MS - (now - recent[0])) / 1000),
      reason: "Generation limit reached for now.",
    };
  }
  recent.push(now);
  hits.set(ip, recent);
  return { ok: true };
}

export function acquire() {
  active++;
  let released = false;
  return () => {
    if (!released) {
      released = true;
      active--;
    }
  };
}

export function resetRateLimits() {
  hits.clear();
  active = 0;
}
