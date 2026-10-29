import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { Guide } from "./schema";
import { SLUG_RE } from "./slug";

/** Persistence for generated guides. Curated guides live in the repo and never go through this. */
export interface GuideStore {
  readonly kind: "file" | "upstash";
  /** False when data is lost on restart/redeploy (e.g. /tmp on serverless). */
  readonly durable: boolean;
  get(slug: string): Promise<Guide | null>;
  put(guide: Guide, queryKey?: string): Promise<void>;
  findByQuery(queryKey: string): Promise<string | null>;
  recent(limit: number): Promise<Guide[]>;
}

class FileStore implements GuideStore {
  readonly kind = "file" as const;
  constructor(
    private dir: string,
    readonly durable: boolean,
  ) {}
  private file(slug: string) {
    if (!SLUG_RE.test(slug)) throw new Error("bad slug");
    return path.join(this.dir, `${slug}.json`);
  }
  async get(slug: string) {
    if (!SLUG_RE.test(slug)) return null;
    try {
      const raw = await fs.readFile(this.file(slug), "utf8");
      const parsed = Guide.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }
  async put(guide: Guide, queryKey?: string) {
    await fs.mkdir(this.dir, { recursive: true });
    const tmp = `${this.file(guide.slug)}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(guide, null, 2));
    await fs.rename(tmp, this.file(guide.slug));
    if (queryKey) {
      const idx = await this.readIndex();
      idx[queryKey] = guide.slug;
      await fs.writeFile(path.join(this.dir, "_index.json"), JSON.stringify(idx, null, 2));
    }
  }
  private async readIndex(): Promise<Record<string, string>> {
    try {
      return JSON.parse(await fs.readFile(path.join(this.dir, "_index.json"), "utf8"));
    } catch {
      return {};
    }
  }
  async findByQuery(queryKey: string) {
    const slug = (await this.readIndex())[queryKey];
    return slug && (await this.get(slug)) ? slug : null;
  }
  async recent(limit: number) {
    let names: string[] = [];
    try {
      names = (await fs.readdir(this.dir)).filter((n) => n.endsWith(".json") && !n.startsWith("_"));
    } catch {
      return [];
    }
    const guides = (await Promise.all(names.map((n) => this.get(n.slice(0, -5))))).filter(
      (g): g is Guide => !!g,
    );
    return guides.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
  }
}

class UpstashStore implements GuideStore {
  readonly kind = "upstash" as const;
  readonly durable = true;
  constructor(
    private url: string,
    private token: string,
  ) {}
  private async cmd<T>(...args: (string | number)[]): Promise<T> {
    const res = await fetch(this.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(args),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Store error ${res.status}`);
    return ((await res.json()) as { result: T }).result;
  }
  async get(slug: string) {
    if (!SLUG_RE.test(slug)) return null;
    const raw = await this.cmd<string | null>("GET", `guide:${slug}`);
    if (!raw) return null;
    const parsed = Guide.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  }
  async put(guide: Guide, queryKey?: string) {
    await this.cmd("SET", `guide:${guide.slug}`, JSON.stringify(guide));
    await this.cmd("LPUSH", "guides:recent", guide.slug);
    await this.cmd("LTRIM", "guides:recent", 0, 99);
    if (queryKey) await this.cmd("SET", `query:${queryKey}`, guide.slug);
  }
  async findByQuery(queryKey: string) {
    return this.cmd<string | null>("GET", `query:${queryKey}`);
  }
  async recent(limit: number) {
    const slugs = [...new Set(await this.cmd<string[]>("LRANGE", "guides:recent", 0, limit * 2))];
    const guides = await Promise.all(slugs.slice(0, limit).map((s) => this.get(s)));
    return guides.filter((g): g is Guide => !!g);
  }
}

let cached: GuideStore | null = null;

export function getStore(): GuideStore {
  if (cached) return cached;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    cached = new UpstashStore(url, token);
  } else if (process.env.COMPASS_DATA_DIR) {
    cached = new FileStore(process.env.COMPASS_DATA_DIR, true);
  } else if (process.env.VERCEL) {
    // Vercel's filesystem is read-only except /tmp, which does not survive cold starts.
    cached = new FileStore(path.join(os.tmpdir(), "oauth-compass"), false);
  } else {
    cached = new FileStore(path.join(process.cwd(), ".data", "guides"), true);
  }
  return cached;
}

/** For tests. */
export function createFileStore(dir: string): GuideStore {
  return new FileStore(dir, true);
}
