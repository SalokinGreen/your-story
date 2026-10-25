// Feedback: the submission endpoint, the admin routes and retention.
// Design: docs/feedback-design.md (decisions 190-194). Nothing here logs or
// stores an IP address or a request body.
//
// The binding types are declared structurally (not as the Workers globals) so
// the tests, which the root tsconfig checks, can import this file without
// @cloudflare/workers-types.

import { ADMIN_CSS, ADMIN_HTML, ADMIN_JS } from "./adminPage";

export interface D1StatementLike {
  bind(...values: unknown[]): D1StatementLike;
  run(): Promise<unknown>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
}
export interface D1Like {
  prepare(sql: string): D1StatementLike;
}
export interface RateLimitLike {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}
export interface KVLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

export interface FeedbackEnv {
  FEEDBACK_DB?: D1Like;
  FEEDBACK_RATE_LIMITER?: RateLimitLike;
  FEEDBACK_ENABLED?: string;
  FEEDBACK_DAILY_CAP?: string;
  FEEDBACK_ADMIN_TOKEN?: string;
}

export const MAX_BODY_BYTES = 16_384;
export const DEFAULT_DAILY_CAP = 300;
export const RETENTION_DAYS = 180;
export const DAY_ROW_RETENTION_DAYS = 2;
const DAY_MS = 86_400_000;

const KINDS = ["turn", "system", "starter", "session", "app"] as const;
const PLATFORMS = ["desktop", "android", "ios", "web"] as const;
const ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export interface FeedbackTurn {
  playerLine: string;
  prose: string;
  rolls: string[];
  models: string[];
}
export interface FeedbackSubmission {
  v: 1;
  id: string;
  kind: (typeof KINDS)[number];
  systemId?: string;
  starterId?: string;
  rating?: 1 | 2 | 3 | 4 | 5;
  text: string;
  app: { version: string; platform: (typeof PLATFORMS)[number] };
  session?: number;
  turn?: FeedbackTurn;
}

type Parsed = { ok: true; value: FeedbackSubmission } | { ok: false; field: string };

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** First key of `obj` not in `allowed`, or null. */
function unknownKey(obj: Record<string, unknown>, allowed: readonly string[]): string | null {
  for (const key of Object.keys(obj)) if (!allowed.includes(key)) return key;
  return null;
}

function strField(v: unknown, max: number, min = 0): v is string {
  return typeof v === "string" && v.length >= min && v.length <= max;
}

function stringList(v: unknown, maxItems: number, maxLen: number): v is string[] {
  return Array.isArray(v) && v.length <= maxItems && v.every((s) => strField(s, maxLen));
}

/** Strict validation. The `field` of a refusal is the first offending path. */
export function parseSubmission(raw: unknown): Parsed {
  if (!isObject(raw)) return { ok: false, field: "body" };
  const topKeys = ["v", "id", "kind", "systemId", "starterId", "rating", "text", "app", "session", "turn"];
  const extra = unknownKey(raw, topKeys);
  if (extra !== null) return { ok: false, field: extra };

  if (raw.v !== 1) return { ok: false, field: "v" };
  if (typeof raw.id !== "string" || !ID_PATTERN.test(raw.id)) return { ok: false, field: "id" };
  if (!KINDS.includes(raw.kind as (typeof KINDS)[number])) return { ok: false, field: "kind" };
  if (raw.systemId !== undefined && !strField(raw.systemId, 64, 1)) return { ok: false, field: "systemId" };
  if (raw.starterId !== undefined && !strField(raw.starterId, 128, 1)) return { ok: false, field: "starterId" };
  if (raw.rating !== undefined && !(Number.isInteger(raw.rating) && (raw.rating as number) >= 1 && (raw.rating as number) <= 5)) {
    return { ok: false, field: "rating" };
  }
  if (!strField(raw.text, 2000)) return { ok: false, field: "text" };
  if (raw.rating === undefined && (raw.text as string).trim() === "") return { ok: false, field: "text" };

  if (!isObject(raw.app)) return { ok: false, field: "app" };
  const appExtra = unknownKey(raw.app, ["version", "platform"]);
  if (appExtra !== null) return { ok: false, field: `app.${appExtra}` };
  if (!strField(raw.app.version, 32, 1)) return { ok: false, field: "app.version" };
  if (!PLATFORMS.includes(raw.app.platform as (typeof PLATFORMS)[number])) return { ok: false, field: "app.platform" };

  if (raw.session !== undefined) {
    const s = raw.session;
    if (!(Number.isInteger(s) && (s as number) >= 1 && (s as number) <= 10_000)) return { ok: false, field: "session" };
  }

  if (raw.turn !== undefined) {
    const t = raw.turn;
    if (!isObject(t)) return { ok: false, field: "turn" };
    const turnExtra = unknownKey(t, ["playerLine", "prose", "rolls", "models"]);
    if (turnExtra !== null) return { ok: false, field: `turn.${turnExtra}` };
    if (!strField(t.playerLine, 1000)) return { ok: false, field: "turn.playerLine" };
    if (!strField(t.prose, 4000)) return { ok: false, field: "turn.prose" };
    if (!stringList(t.rolls, 12, 200)) return { ok: false, field: "turn.rolls" };
    if (!stringList(t.models, 4, 80)) return { ok: false, field: "turn.models" };
  }

  return { ok: true, value: raw as unknown as FeedbackSubmission };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function respond(body: unknown, status: number, headers: HeadersInit, extra?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, ...extra, "Content-Type": "application/json" },
  });
}

const NO_STORE = { "Cache-Control": "no-store" };

/** Reads at most MAX_BODY_BYTES from the stream; null when it is longer. */
async function readCapped(request: Request): Promise<string | null | "invalid"> {
  const declared = request.headers.get("Content-Length");
  if (declared !== null) {
    const n = Number(declared);
    if (Number.isFinite(n) && n > MAX_BODY_BYTES) return null;
  }
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    return "invalid";
  }
}

function dayOf(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

async function sha256(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}

/** Constant-time comparison: both sides are hashed to equal length first. */
export async function tokensMatch(given: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all([sha256(given), sha256(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// ---------------------------------------------------------------------------
// POST /feedback
// ---------------------------------------------------------------------------

async function handleSubmit(request: Request, env: FeedbackEnv, headers: HeadersInit, now: number): Promise<Response> {
  if (env.FEEDBACK_ENABLED === "false" || !env.FEEDBACK_DB) {
    return respond({ error: "disabled" }, 503, headers);
  }
  const db = env.FEEDBACK_DB;

  const body = await readCapped(request);
  if (body === null) return respond({ error: "too_large" }, 413, headers);

  // The burst limiter keys on the IP and keeps nothing of it here. An absent
  // binding (an old local dev config) allows and continues.
  if (env.FEEDBACK_RATE_LIMITER) {
    const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
    const { success } = await env.FEEDBACK_RATE_LIMITER.limit({ key: ip });
    if (!success) return respond({ error: "rate_limited" }, 429, headers);
  }

  if (body === "invalid") return respond({ error: "invalid_json" }, 400, headers);
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return respond({ error: "invalid_json" }, 400, headers);
  }
  const parsed = parseSubmission(raw);
  if (!parsed.ok) return respond({ error: "invalid", field: parsed.field }, 400, headers);
  const s = parsed.value;
  const ref = s.id.slice(0, 8);

  // A retry of a stored submission is answered before it can burn the cap.
  const existing = await db.prepare("SELECT 1 AS present FROM feedback WHERE id = ?").bind(s.id).first();
  if (existing) return respond({ ok: true, ref }, 200, headers);

  const capRaw = Number(env.FEEDBACK_DAILY_CAP);
  const cap = Number.isFinite(capRaw) && capRaw > 0 ? capRaw : DEFAULT_DAILY_CAP;
  const day = await db
    .prepare("INSERT INTO feedback_day(day, n) VALUES(?, 1) ON CONFLICT(day) DO UPDATE SET n = n + 1 RETURNING n")
    .bind(dayOf(now))
    .first<{ n: number }>();
  if (day && day.n > cap) return respond({ error: "daily_cap" }, 429, headers);

  await db
    .prepare(
      "INSERT OR IGNORE INTO feedback (id, received_at, kind, system_id, starter_id, rating, text, app_version, platform, turn_json, session, handled) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)",
    )
    .bind(
      s.id,
      now,
      s.kind,
      s.systemId ?? null,
      s.starterId ?? null,
      s.rating ?? null,
      s.text,
      s.app.version,
      s.app.platform,
      s.turn ? JSON.stringify(s.turn) : null,
      s.session ?? null,
    )
    .run();
  return respond({ ok: true, ref }, 200, headers);
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

const PAGE_HEADERS = {
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Cache-Control": "no-store",
};

function pageResponse(body: string, type: string): Response {
  return new Response(body, { status: 200, headers: { ...PAGE_HEADERS, "Content-Type": type } });
}

async function authorize(request: Request, env: FeedbackEnv, headers: HeadersInit): Promise<Response | null> {
  const expected = env.FEEDBACK_ADMIN_TOKEN;
  if (!expected) return respond({ error: "admin_disabled" }, 503, headers, NO_STORE);
  const auth = request.headers.get("Authorization") ?? "";
  const given = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!given || !(await tokensMatch(given, expected))) {
    return respond({ error: "unauthorized" }, 401, headers, NO_STORE);
  }
  return null;
}

async function handleAdminApi(
  request: Request,
  env: FeedbackEnv,
  headers: HeadersInit,
  url: URL,
  route: string,
): Promise<Response> {
  const denied = await authorize(request, env, headers);
  if (denied) return denied;
  const db = env.FEEDBACK_DB;
  if (!db) return respond({ error: "disabled" }, 503, headers, NO_STORE);

  if (route === "list" && request.method === "GET") {
    const q = url.searchParams;
    const where: string[] = [];
    const args: unknown[] = [];
    const before = q.get("before");
    if (before !== null && before !== "") {
      const n = Number(before);
      if (!Number.isFinite(n)) return respond({ error: "invalid", field: "before" }, 400, headers, NO_STORE);
      where.push("received_at < ?");
      args.push(n);
    }
    const exact: Array<[string, string]> = [
      ["kind", "kind"],
      ["system", "system_id"],
      ["starter", "starter_id"],
    ];
    for (const [param, column] of exact) {
      const v = q.get(param);
      if (v) {
        where.push(`${column} = ?`);
        args.push(v);
      }
    }
    const rating = q.get("rating");
    if (rating) {
      const n = Number(rating);
      if (!Number.isInteger(n)) return respond({ error: "invalid", field: "rating" }, 400, headers, NO_STORE);
      where.push("rating = ?");
      args.push(n);
    }
    const handled = q.get("handled");
    if (handled === "0" || handled === "1") {
      where.push("handled = ?");
      args.push(Number(handled));
    }
    const limitRaw = Number(q.get("limit") ?? 50);
    const limit = Number.isInteger(limitRaw) && limitRaw >= 1 ? Math.min(limitRaw, 50) : 50;
    const sql =
      "SELECT received_at, id, kind, system_id, starter_id, rating, substr(text, 1, 120) AS text, " +
      "turn_json IS NOT NULL AS has_turn, platform, app_version, handled, session FROM feedback" +
      (where.length ? ` WHERE ${where.join(" AND ")}` : "") +
      " ORDER BY received_at DESC, id DESC LIMIT ?";
    const { results } = await db.prepare(sql).bind(...args, limit).all<Record<string, unknown>>();
    const items = results.map((r) => ({
      received_at: r.received_at,
      ref: String(r.id).slice(0, 8),
      id: r.id,
      kind: r.kind,
      system_id: r.system_id,
      starter_id: r.starter_id,
      rating: r.rating,
      text: r.text,
      has_turn: Boolean(r.has_turn),
      platform: r.platform,
      app_version: r.app_version,
      handled: Boolean(r.handled),
      session: r.session,
    }));
    const next = items.length === limit ? items[items.length - 1].received_at : null;
    return respond({ items, next }, 200, headers, NO_STORE);
  }

  if (route === "item" && request.method === "GET") {
    const id = url.searchParams.get("id") ?? "";
    const row = await db.prepare("SELECT * FROM feedback WHERE id = ?").bind(id).first<Record<string, unknown>>();
    if (!row) return respond({ error: "not_found" }, 404, headers, NO_STORE);
    let turn: unknown = null;
    if (typeof row.turn_json === "string") {
      try {
        turn = JSON.parse(row.turn_json);
      } catch {
        turn = null;
      }
    }
    const { turn_json: _unused, ...rest } = row;
    void _unused;
    return respond({ ...rest, ref: String(row.id).slice(0, 8), handled: Boolean(row.handled), turn }, 200, headers, NO_STORE);
  }

  if (route === "handled" && request.method === "POST") {
    let body: unknown;
    try {
      body = JSON.parse((await request.text()).slice(0, 2048));
    } catch {
      return respond({ error: "invalid_json" }, 400, headers, NO_STORE);
    }
    if (!isObject(body) || typeof body.id !== "string" || typeof body.handled !== "boolean") {
      return respond({ error: "invalid", field: "body" }, 400, headers, NO_STORE);
    }
    await db.prepare("UPDATE feedback SET handled = ? WHERE id = ?").bind(body.handled ? 1 : 0, body.id).run();
    return respond({ ok: true }, 200, headers, NO_STORE);
  }

  return respond({ error: "not_found" }, 404, headers, NO_STORE);
}

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

/** Routes everything under /feedback. `parts` is the split pathname. */
export async function handleFeedback(
  request: Request,
  env: FeedbackEnv,
  headers: HeadersInit,
  url: URL,
  parts: string[],
  now: number = Date.now(),
): Promise<Response> {
  if (parts.length === 1 && request.method === "POST") return handleSubmit(request, env, headers, now);

  if (parts[1] === "admin" && request.method === "GET") {
    if (parts.length === 2) return pageResponse(ADMIN_HTML, "text/html; charset=utf-8");
  }
  if (parts.length === 2 && request.method === "GET") {
    if (parts[1] === "admin.js") return pageResponse(ADMIN_JS, "text/javascript; charset=utf-8");
    if (parts[1] === "admin.css") return pageResponse(ADMIN_CSS, "text/css; charset=utf-8");
  }

  if (parts[1] === "api" && parts.length === 3) {
    return handleAdminApi(request, env, headers, url, parts[2]);
  }

  return respond({ error: "not_found" }, 404, headers);
}

/** Daily retention: submissions after 180 days, day counters after 2. */
export async function runRetention(env: FeedbackEnv, now: number = Date.now()): Promise<void> {
  const db = env.FEEDBACK_DB;
  if (!db) return;
  await db.prepare("DELETE FROM feedback WHERE received_at < ?").bind(now - RETENTION_DAYS * DAY_MS).run();
  await db.prepare("DELETE FROM feedback_day WHERE day < ?").bind(dayOf(now - DAY_ROW_RETENTION_DAYS * DAY_MS)).run();
}
