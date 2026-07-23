export interface Env {
  SYNC_KV: KVNamespace;
  ALLOWED_ORIGINS: string;
}

const BUCKETS = ["stories", "adventures", "notes", "folders", "settings"] as const;
type Bucket = (typeof BUCKETS)[number];

interface StoredBlob {
  ciphertext: string;
  iv: string;
  updatedAt: string;
}

const RATE_LIMIT_MAX = 60; // requests per window per sync key
const RATE_LIMIT_WINDOW_SECONDS = 60;

async function hashKey(syncKey: string): Promise<string> {
  const data = new TextEncoder().encode(syncKey);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function corsHeaders(origin: string | null, allowedOrigins: string[]): HeadersInit {
  const allowOrigin =
    origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0] ?? "null";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    Vary: "Origin",
  };
}

function json(body: unknown, status: number, headers: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

async function checkRateLimit(env: Env, hashedKey: string, ip: string): Promise<boolean> {
  const windowStart = Math.floor(Date.now() / 1000 / RATE_LIMIT_WINDOW_SECONDS);
  const rlKey = `rl:${hashedKey}:${ip}:${windowStart}`;
  const current = await env.SYNC_KV.get(rlKey);
  const count = current ? parseInt(current, 10) : 0;
  if (count >= RATE_LIMIT_MAX) return false;
  await env.SYNC_KV.put(rlKey, String(count + 1), {
    expirationTtl: RATE_LIMIT_WINDOW_SECONDS * 2,
  });
  return true;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const allowedOrigins = env.ALLOWED_ORIGINS.split(",").map((o) => o.trim());
    const origin = request.headers.get("Origin");
    const headers = corsHeaders(origin, allowedOrigins);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean); // ["sync", ...]

    if (parts[0] !== "sync") {
      return json({ error: "not_found" }, 404, headers);
    }

    const authHeader = request.headers.get("Authorization") ?? "";
    const syncKey = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    if (!syncKey || syncKey.length < 16) {
      return json({ error: "missing_or_invalid_sync_key" }, 401, headers);
    }

    const hashedKey = await hashKey(syncKey);
    const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
    const allowed = await checkRateLimit(env, hashedKey, ip);
    if (!allowed) {
      return json({ error: "rate_limited" }, 429, headers);
    }

    // GET /sync/manifest
    if (parts.length === 2 && parts[1] === "manifest" && request.method === "GET") {
      const manifest: Partial<Record<Bucket, string>> = {};
      await Promise.all(
        BUCKETS.map(async (bucket) => {
          const raw = await env.SYNC_KV.get(`${hashedKey}:${bucket}`);
          if (raw) {
            const stored = JSON.parse(raw) as StoredBlob;
            manifest[bucket] = stored.updatedAt;
          }
        }),
      );
      return json(manifest, 200, headers);
    }

    // /sync/:bucket
    if (parts.length === 2) {
      const bucket = parts[1] as Bucket;
      if (!BUCKETS.includes(bucket)) {
        return json({ error: "unknown_bucket" }, 404, headers);
      }
      const kvKey = `${hashedKey}:${bucket}`;

      if (request.method === "GET") {
        const raw = await env.SYNC_KV.get(kvKey);
        if (!raw) return json({ error: "not_found" }, 404, headers);
        return json(JSON.parse(raw), 200, headers);
      }

      if (request.method === "PUT") {
        let body: StoredBlob;
        try {
          body = await request.json();
        } catch {
          return json({ error: "invalid_json" }, 400, headers);
        }
        if (!body.ciphertext || !body.iv || !body.updatedAt) {
          return json({ error: "missing_fields" }, 400, headers);
        }
        await env.SYNC_KV.put(kvKey, JSON.stringify(body));
        return json({ ok: true }, 200, headers);
      }

      return json({ error: "method_not_allowed" }, 405, headers);
    }

    return json({ error: "not_found" }, 404, headers);
  },
};
