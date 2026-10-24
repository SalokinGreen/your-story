// The feedback endpoint in the sync Worker (docs/feedback-design.md, section 3).
// The D1 stand-in is node:sqlite running the real migration, so the SQL the
// Worker sends is executed, not pattern-matched.

import { readFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

import worker, { type Env } from "../sync-worker/src/index";
import { ADMIN_HTML, ADMIN_JS } from "../sync-worker/src/adminPage";
import { MAX_BODY_BYTES, type D1StatementLike } from "../sync-worker/src/feedback";

// @types/node here predates node:sqlite, so it is loaded untyped and described.
interface SqliteStatement {
  run(...args: unknown[]): unknown;
  get(...args: unknown[]): unknown;
  all(...args: unknown[]): unknown[];
}
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as {
  DatabaseSync: new (location: string) => { exec(sql: string): void; prepare(sql: string): SqliteStatement };
};

const MIGRATION = readFileSync(
  path.join(__dirname, "../sync-worker/migrations/0001_feedback.sql"),
  "utf8",
);
const ORIGIN = "https://your-story.io";
const TOKEN = "admin-token-for-tests-1234567890";

type Row = Record<string, unknown>;

function makeDb() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(MIGRATION);
  const statement = (sql: string, args: unknown[] = []) => ({
    bind: (...values: unknown[]) => statement(sql, values),
    run: async () => {
      sqlite.prepare(sql).run(...(args as never[]));
      return {};
    },
    first: async () => (sqlite.prepare(sql).get(...(args as never[])) as Row | undefined) ?? null,
    all: async () => ({ results: sqlite.prepare(sql).all(...(args as never[])) as Row[] }),
  });
  return {
    prepare: (sql: string) => statement(sql) as unknown as D1StatementLike,
    rows: (sql: string, ...args: unknown[]) => sqlite.prepare(sql).all(...(args as never[])) as Row[],
    exec: (sql: string) => sqlite.exec(sql),
  };
}

function makeEnv(over: Partial<Env> = {}) {
  const db = makeDb();
  const env: Env = {
    SYNC_KV: { get: async () => null, put: async () => undefined },
    ALLOWED_ORIGINS: `http://localhost:3000,${ORIGIN}`,
    FEEDBACK_DB: db,
    FEEDBACK_ENABLED: "true",
    FEEDBACK_DAILY_CAP: "300",
    FEEDBACK_ADMIN_TOKEN: TOKEN,
    ...over,
  };
  return { env, db };
}

let counter = 0;
function submission(over: Record<string, unknown> = {}) {
  counter += 1;
  return {
    v: 1,
    id: `fb-test-${String(counter).padStart(6, "0")}`,
    kind: "turn",
    text: "The roll felt unfair",
    rating: 3,
    app: { version: "1.2.3", platform: "desktop" },
    ...over,
  };
}

function post(body: unknown, init: RequestInit = {}, headers: Record<string, string> = {}) {
  return new Request("https://w.example/feedback", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { Origin: ORIGIN, "CF-Connecting-IP": "203.0.113.9", ...headers },
    ...init,
  });
}

async function send(env: Env, req: Request) {
  const res = await worker.fetch(req, env);
  const text = await res.text();
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(text);
  } catch {
    /* not JSON (the admin page) */
  }
  return { res, body, text };
}

async function sendOk(env: Env, over: Record<string, unknown> = {}) {
  const sub = submission(over);
  const out = await send(env, post(sub));
  expect(out.res.status).toBe(200);
  return sub;
}

function admin(pathAndQuery: string, init: RequestInit = {}, token: string | null = TOKEN) {
  return new Request(`https://w.example${pathAndQuery}`, {
    ...init,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers as object) },
  });
}

describe("POST /feedback: schema", () => {
  const refusals: Array<[string, Record<string, unknown>, string]> = [
    ["an unknown key", { extra: 1 }, "extra"],
    ["an unknown nested key (app)", { app: { version: "1", platform: "web", extra: 1 } }, "app.extra"],
    ["an unknown nested key (turn)", { turn: { playerLine: "", prose: "", rolls: [], models: [], extra: 1 } }, "turn.extra"],
    ["a fractional rating", { rating: 3.5 }, "rating"],
    ["rating 0", { rating: 0 }, "rating"],
    ["rating 6", { rating: 6 }, "rating"],
    ["neither a rating nor text", { rating: undefined, text: "   " }, "text"],
    ["text over 2000 characters", { text: "x".repeat(2001) }, "text"],
    ["a bad platform", { app: { version: "1", platform: "toaster" } }, "app.platform"],
    ["an over-long version", { app: { version: "v".repeat(33), platform: "web" } }, "app.version"],
    ["a short id", { id: "abc" }, "id"],
    ["an id with a bad character", { id: "has space in it" }, "id"],
    ["a bad kind", { kind: "other" }, "kind"],
    ["v other than 1", { v: 2 }, "v"],
    ["an over-long systemId", { systemId: "s".repeat(65) }, "systemId"],
    ["a session of 0", { session: 0 }, "session"],
    ["prose over 4000", { turn: { playerLine: "", prose: "p".repeat(4001), rolls: [], models: [] } }, "turn.prose"],
    ["a player line over 1000", { turn: { playerLine: "p".repeat(1001), prose: "", rolls: [], models: [] } }, "turn.playerLine"],
    ["13 rolls", { turn: { playerLine: "", prose: "", rolls: Array(13).fill("r"), models: [] } }, "turn.rolls"],
    ["a roll over 200", { turn: { playerLine: "", prose: "", rolls: ["r".repeat(201)], models: [] } }, "turn.rolls"],
    ["5 models", { turn: { playerLine: "", prose: "", rolls: [], models: Array(5).fill("m") } }, "turn.models"],
  ];
  for (const [name, over, field] of refusals) {
    it(`refuses ${name} with the field named`, async () => {
      const { env, db } = makeEnv();
      const { res, body } = await send(env, post(submission(over)));
      expect(res.status).toBe(400);
      expect(body).toEqual({ error: "invalid", field });
      expect(db.rows("SELECT * FROM feedback")).toHaveLength(0);
    });
  }

  it("accepts a rating alone, text alone and the largest allowed fields", async () => {
    const { env } = makeEnv();
    await sendOk(env, { text: "", rating: 5 });
    await sendOk(env, { rating: undefined, text: "just words" });
    await sendOk(env, {
      text: "t".repeat(2000),
      systemId: "s".repeat(64),
      starterId: "q".repeat(128),
      session: 10000,
      turn: { playerLine: "p".repeat(1000), prose: "x".repeat(4000), rolls: Array(12).fill("r".repeat(200)), models: Array(4).fill("m".repeat(80)) },
    });
  });

  it("refuses malformed JSON and a non-object body", async () => {
    const { env } = makeEnv();
    expect((await send(env, post("{nope"))).body).toEqual({ error: "invalid_json" });
    const arr = await send(env, post("[1]"));
    expect(arr.res.status).toBe(400);
  });

  it("counts the 2,000 text cap in characters, not bytes", async () => {
    const { env, db } = makeEnv();
    const text = "é".repeat(2000); // 4,000 bytes
    await sendOk(env, { text });
    expect((db.rows("SELECT text FROM feedback")[0].text as string).length).toBe(2000);
  });
});

describe("POST /feedback: body size", () => {
  it("refuses early on a Content-Length over the cap", async () => {
    const { env } = makeEnv();
    const { res, body } = await send(env, post("{}", {}, { "Content-Length": String(MAX_BODY_BYTES + 1) }));
    expect(res.status).toBe(413);
    expect(body).toEqual({ error: "too_large" });
  });

  it("measures the stream when Content-Length lies", async () => {
    const { env } = makeEnv();
    const big = JSON.stringify(submission({ text: "a".repeat(20_000) }));
    const { res } = await send(env, post(big, {}, { "Content-Length": "10" }));
    expect(res.status).toBe(413);
  });

  it("measures the stream when Content-Length is absent and stops reading past the cap", async () => {
    const { env } = makeEnv();
    let pulled = 0;
    const chunk = new TextEncoder().encode("x".repeat(4096));
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        if (pulled > 100) return controller.close();
        controller.enqueue(chunk);
      },
    });
    const req = new Request("https://w.example/feedback", {
      method: "POST",
      body: stream,
      headers: { Origin: ORIGIN },
      duplex: "half",
    } as RequestInit);
    const { res } = await send(env, req);
    expect(res.status).toBe(413);
    expect(pulled).toBeLessThan(20);
  });

  it("counts multibyte text in bytes for the body cap", async () => {
    const { env } = makeEnv();
    // 2,000 characters of a 3-byte glyph in text, plus a 4,000-char 3-byte prose,
    // is over 16 KB of UTF-8 although every field is within its character cap.
    const heavy = submission({
      text: "€".repeat(2000),
      turn: { playerLine: "€".repeat(1000), prose: "€".repeat(4000), rolls: [], models: [] },
    });
    const bytes = new TextEncoder().encode(JSON.stringify(heavy)).byteLength;
    expect(bytes).toBeGreaterThan(MAX_BODY_BYTES);
    expect(JSON.stringify(heavy).length).toBeLessThan(MAX_BODY_BYTES);
    const { res } = await send(env, post(heavy));
    expect(res.status).toBe(413);
  });
});

describe("POST /feedback: switches and limits", () => {
  it("refuses with 503 when FEEDBACK_ENABLED is false, or the database is missing", async () => {
    const off = makeEnv({ FEEDBACK_ENABLED: "false" });
    const a = await send(off.env, post(submission()));
    expect(a.res.status).toBe(503);
    expect(a.body).toEqual({ error: "disabled" });
    const noDb = makeEnv({ FEEDBACK_DB: undefined });
    expect((await send(noDb.env, post(submission()))).res.status).toBe(503);
  });

  it("refuses when the burst limiter refuses, keyed on the IP", async () => {
    const keys: string[] = [];
    const { env, db } = makeEnv({
      FEEDBACK_RATE_LIMITER: {
        limit: async ({ key }) => {
          keys.push(key);
          return { success: false };
        },
      },
    });
    const { res, body } = await send(env, post(submission()));
    expect(res.status).toBe(429);
    expect(body).toEqual({ error: "rate_limited" });
    expect(keys).toEqual(["203.0.113.9"]);
    expect(db.rows("SELECT * FROM feedback")).toHaveLength(0);
  });

  it("continues when the limiter binding is absent", async () => {
    const { env } = makeEnv({ FEEDBACK_RATE_LIMITER: undefined });
    expect((await send(env, post(submission()))).res.status).toBe(200);
  });

  it("refuses at the daily cap + 1", async () => {
    const { env, db } = makeEnv({ FEEDBACK_DAILY_CAP: "2" });
    await sendOk(env);
    await sendOk(env);
    const third = await send(env, post(submission()));
    expect(third.res.status).toBe(429);
    expect(third.body).toEqual({ error: "daily_cap" });
    expect(db.rows("SELECT * FROM feedback")).toHaveLength(2);
  });

  it("stores a duplicate id once, returns the same ref, and does not burn the cap", async () => {
    const { env, db } = makeEnv({ FEEDBACK_DAILY_CAP: "2" });
    const sub = submission();
    const first = await send(env, post(sub));
    const again = await send(env, post(sub));
    const thrice = await send(env, post(sub));
    expect(first.body).toEqual({ ok: true, ref: (sub.id as string).slice(0, 8) });
    expect(again.body).toEqual(first.body);
    expect(thrice.res.status).toBe(200);
    expect(db.rows("SELECT * FROM feedback")).toHaveLength(1);
    expect(db.rows("SELECT n FROM feedback_day")[0].n).toBe(1);
  });

  it("never stores the IP or the body", async () => {
    const { env, db } = makeEnv();
    const sub = await sendOk(env, { text: "hello there" });
    const dump = JSON.stringify([...db.rows("SELECT * FROM feedback"), ...db.rows("SELECT * FROM feedback_day")]);
    expect(dump).not.toContain("203.0.113.9");
    expect(Object.keys(db.rows("SELECT * FROM feedback")[0]).sort()).toEqual(
      ["app_version", "handled", "id", "kind", "platform", "rating", "received_at", "session", "starter_id", "system_id", "text", "turn_json"],
    );
    expect(db.rows("SELECT * FROM feedback")[0].id).toBe(sub.id);
    expect(dump).not.toContain('"v":1');
  });

  it("stores the turn as JSON, the session and server time", async () => {
    const { env, db } = makeEnv();
    const turn = { playerLine: "I open the door", prose: "It creaks.", rolls: ["Face Danger: weak hit"], models: ["glm"] };
    const before = Date.now();
    await sendOk(env, { kind: "session", session: 4, turn, systemId: "blood-and-bone" });
    const row = db.rows("SELECT * FROM feedback")[0];
    expect(JSON.parse(row.turn_json as string)).toEqual(turn);
    expect(row.session).toBe(4);
    expect(row.system_id).toBe("blood-and-bone");
    expect(row.received_at as number).toBeGreaterThanOrEqual(before);
  });
});

describe("CORS", () => {
  it("echoes an allowed origin and lists POST", async () => {
    const { env } = makeEnv();
    const { res } = await send(env, post(submission()));
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
    const pre = await send(env, new Request("https://w.example/feedback", { method: "OPTIONS", headers: { Origin: ORIGIN } }));
    expect(pre.res.status).toBe(204);
    expect(pre.res.headers.get("Access-Control-Allow-Methods")).toBe("GET, PUT, POST, OPTIONS");
  });

  it("gives an unknown origin no allow header, on feedback, sync and preflight", async () => {
    const { env } = makeEnv();
    const evil = { Origin: "https://evil.example" };
    const a = await send(env, post(submission(), {}, evil));
    expect(a.res.headers.get("Access-Control-Allow-Origin")).toBeNull();
    const b = await send(env, new Request("https://w.example/sync/manifest", { headers: { ...evil, Authorization: "Bearer short" } }));
    expect(b.res.status).toBe(401);
    expect(b.res.headers.get("Access-Control-Allow-Origin")).toBeNull();
    const c = await send(env, new Request("https://w.example/sync/stories", { method: "OPTIONS", headers: evil }));
    expect(c.res.headers.get("Access-Control-Allow-Origin")).toBeNull();
    const d = await send(env, new Request("https://w.example/sync/stories", { method: "OPTIONS" }));
    expect(d.res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("leaves a sync route as it was for an allowed origin", async () => {
    const { env } = makeEnv();
    const res = await worker.fetch(new Request("https://w.example/sync/stories", { method: "OPTIONS", headers: { Origin: ORIGIN } }), env);
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
    expect(res.headers.get("Access-Control-Allow-Headers")).toBe("Authorization, Content-Type");
    const miss = await send(env, new Request("https://w.example/sync/manifest", { headers: { Origin: ORIGIN } }));
    expect(miss.res.status).toBe(401);
    expect(miss.body).toEqual({ error: "missing_or_invalid_sync_key" });
  });
});

describe("admin", () => {
  const routes = [
    "/feedback/api/list",
    "/feedback/api/item?id=x",
  ];

  it("refuses a missing or wrong token with 401, and no-store", async () => {
    const { env } = makeEnv();
    for (const r of routes) {
      const none = await send(env, admin(r, {}, null));
      expect(none.res.status).toBe(401);
      expect(none.res.headers.get("Cache-Control")).toBe("no-store");
      const wrong = await send(env, admin(r, {}, "wrong-token"));
      expect(wrong.res.status).toBe(401);
    }
    const handled = await send(env, admin("/feedback/api/handled", { method: "POST", body: "{}" }, "wrong"));
    expect(handled.res.status).toBe(401);
  });

  it("refuses everything when the secret is not set", async () => {
    const { env } = makeEnv({ FEEDBACK_ADMIN_TOKEN: undefined });
    const a = await send(env, admin("/feedback/api/list", {}, "anything"));
    expect(a.res.status).toBe(503);
    const b = await send(env, admin("/feedback/api/list", {}, ""));
    expect([401, 503]).toContain(b.res.status);
    // An empty secret is also "not set".
    const { env: e2 } = makeEnv({ FEEDBACK_ADMIN_TOKEN: "" });
    expect((await send(e2, admin("/feedback/api/list", {}, "x"))).res.status).toBe(503);
  });

  it("lists newest first with a before cursor and filters, with summaries", async () => {
    const { env, db } = makeEnv();
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const sub = await sendOk(env, {
        kind: i % 2 === 0 ? "system" : "turn",
        text: `entry ${i} ` + "z".repeat(200),
        rating: (i % 5) + 1,
        systemId: "blood-and-bone",
        turn: i === 4 ? { playerLine: "a", prose: "b", rolls: [], models: [] } : undefined,
      });
      ids.push(sub.id as string);
      db.exec(`UPDATE feedback SET received_at = ${1000 + i} WHERE id = '${sub.id}'`);
    }
    const all = await send(env, admin("/feedback/api/list?limit=2"));
    expect(all.res.headers.get("Cache-Control")).toBe("no-store");
    const items = all.body.items as Array<Record<string, unknown>>;
    expect(items.map((i) => i.id)).toEqual([ids[4], ids[3]]);
    expect(items[0]).toMatchObject({ ref: ids[4].slice(0, 8), kind: "system", has_turn: true, platform: "desktop", app_version: "1.2.3", handled: false, session: null });
    expect((items[0].text as string).length).toBe(120);
    expect(items[1].has_turn).toBe(false);
    expect(all.body.next).toBe(1003);

    const page2 = await send(env, admin(`/feedback/api/list?before=${all.body.next}&limit=2`));
    expect((page2.body.items as Array<Record<string, unknown>>).map((i) => i.id)).toEqual([ids[2], ids[1]]);

    const filtered = await send(env, admin("/feedback/api/list?kind=turn&rating=4"));
    expect((filtered.body.items as Array<Record<string, unknown>>).map((i) => i.id)).toEqual([ids[3]]);
    const none = await send(env, admin("/feedback/api/list?system=nope"));
    expect(none.body.items).toEqual([]);
    expect(none.body.next).toBeNull();
    const big = await send(env, admin("/feedback/api/list?limit=5000"));
    expect((big.body.items as unknown[]).length).toBe(5);
  });

  it("returns an item in full with the turn parsed, and 404 for an unknown id", async () => {
    const { env } = makeEnv();
    const turn = { playerLine: "go", prose: "went", rolls: ["r"], models: ["m"] };
    const sub = await sendOk(env, { turn });
    const got = await send(env, admin(`/feedback/api/item?id=${sub.id}`));
    expect(got.res.headers.get("Cache-Control")).toBe("no-store");
    expect(got.body.turn).toEqual(turn);
    expect(got.body.text).toBe(sub.text);
    expect(got.body.turn_json).toBeUndefined();
    expect((await send(env, admin("/feedback/api/item?id=missing"))).res.status).toBe(404);
  });

  it("toggles handled, and filters on it", async () => {
    const { env } = makeEnv();
    const sub = await sendOk(env);
    const set = (handled: unknown) =>
      send(env, admin("/feedback/api/handled", { method: "POST", body: JSON.stringify({ id: sub.id, handled }) }));
    const on = await set(true);
    expect(on.res.status).toBe(200);
    expect(on.res.headers.get("Cache-Control")).toBe("no-store");
    const handledList = await send(env, admin("/feedback/api/list?handled=1"));
    expect((handledList.body.items as unknown[]).length).toBe(1);
    expect(((await send(env, admin("/feedback/api/list?handled=0"))).body.items as unknown[]).length).toBe(0);
    await set(false);
    expect(((await send(env, admin("/feedback/api/list?handled=0"))).body.items as unknown[]).length).toBe(1);
    expect((await set("yes")).res.status).toBe(400);
  });

  it("serves the page with the hardening headers and the assets under the same policy", async () => {
    const { env } = makeEnv();
    for (const p of ["/feedback/admin", "/feedback/admin.js", "/feedback/admin.css"]) {
      const { res } = await send(env, new Request(`https://w.example${p}`));
      expect(res.status).toBe(200);
      const csp = res.headers.get("Content-Security-Policy") ?? "";
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("script-src 'self'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).not.toContain("unsafe-inline");
      expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect(res.headers.get("Referrer-Policy")).toBe("no-referrer");
      expect(res.headers.get("Cache-Control")).toBe("no-store");
    }
    const page = await send(env, new Request("https://w.example/feedback/admin"));
    expect(page.text).toBe(ADMIN_HTML);
    expect(page.text).not.toMatch(/<script>|onclick=|<img|<a /i);
  });
});

describe("the admin page renders submitted text as text", () => {
  it("never assigns data to innerHTML (or any HTML sink) and uses textContent", () => {
    expect(ADMIN_JS).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function|\.href\s*=|\.src\s*=/);
    expect(ADMIN_JS).toContain("textContent");
    expect(ADMIN_JS).toContain("createElement");
  });

  it("puts a hostile string on the page through textContent only", async () => {
    // Run the page script against a tiny DOM to see where a hostile string lands.
    const hostile = "<img src=x onerror=alert(1)>";
    type FakeNode = { tag: string; children: FakeNode[]; textContent: string; className: string; listeners: Record<string, () => void>; [k: string]: unknown };
    const make = (tag: string): FakeNode => ({
      tag, children: [], textContent: "", className: "", listeners: {}, value: "", hidden: false, tabIndex: 0,
      get firstChild() { return (this as FakeNode).children[0] ?? null; },
      appendChild(c: FakeNode) { (this as FakeNode).children.push(c); return c; },
      removeChild(c: FakeNode) { (this as FakeNode).children.splice((this as FakeNode).children.indexOf(c), 1); },
      addEventListener(n: string, f: () => void) { (this as FakeNode).listeners[n] = f; },
      scrollIntoView() {},
    } as unknown as FakeNode);
    const byId: Record<string, FakeNode> = {};
    const innerHtmlWrites: unknown[] = [];
    const document = {
      getElementById: (id: string) => (byId[id] ??= make("div")),
      createElement: (tag: string) => {
        const n = make(tag);
        return new Proxy(n, { set(t, k, v) { if (k === "innerHTML") innerHtmlWrites.push(v); (t as Record<string | symbol, unknown>)[k] = v; return true; } });
      },
    };
    const item = { received_at: 1, ref: "abcd1234", id: "abcd1234xyz", kind: "app", system_id: hostile, starter_id: null, rating: 2, text: hostile, has_turn: true, platform: hostile, app_version: "1", handled: false, session: null };
    const full = { ...item, turn: { playerLine: hostile, prose: hostile, rolls: [hostile], models: [hostile] } };
    const fetchStub = async (url: string) => ({
      ok: true,
      status: 200,
      json: async () => (url.includes("/item") ? full : { items: [item], next: null }),
    });
    const run = new Function("document", "fetch", "URLSearchParams", "Date", "Object", "encodeURIComponent", "JSON", "Promise", "Error", "String", ADMIN_JS);
    run(document, fetchStub, URLSearchParams, Date, Object, encodeURIComponent, JSON, Promise, Error, String);
    byId["token"].value = "t";
    byId["enter"].listeners["click"]();
    await new Promise((r) => setTimeout(r, 20));
    const list = byId["list"];
    expect(list.children).toHaveLength(1);
    const texts: string[] = [];
    const walk = (n: FakeNode) => { texts.push(n.textContent); n.children.forEach(walk); };
    walk(list);
    expect(texts.some((t) => t === hostile)).toBe(true);
    list.children[0].listeners["click"]();
    await new Promise((r) => setTimeout(r, 20));
    const detail = byId["detail"];
    walk(detail);
    expect(texts.filter((t) => t === hostile).length).toBeGreaterThanOrEqual(4);
    expect(innerHtmlWrites).toEqual([]);
    const tags: string[] = [];
    const walkTags = (n: FakeNode) => { tags.push(n.tag); n.children.forEach(walkTags); };
    walkTags(list);
    walkTags(detail);
    expect(tags).not.toContain("img");
    expect(tags).not.toContain("a");
  });
});

describe("retention", () => {
  it("deletes submissions older than 180 days and day counters older than 2 days only", async () => {
    const { env, db } = makeEnv();
    const { runRetention } = await import("../sync-worker/src/feedback");
    const now = Date.UTC(2026, 9, 24, 3, 0, 0);
    const day = 86_400_000;
    const insert = (id: string, at: number) =>
      db.exec(`INSERT INTO feedback (id, received_at, kind, text, app_version, platform) VALUES ('${id}', ${at}, 'app', 't', '1', 'web')`);
    insert("old-181-days", now - 181 * day);
    insert("edge-179-days", now - 179 * day);
    insert("new-today", now);
    db.exec("INSERT INTO feedback_day VALUES ('2026-10-20', 9), ('2026-10-21', 9), ('2026-10-22', 9), ('2026-10-24', 1)");
    await runRetention(env, now);
    expect(db.rows("SELECT id FROM feedback ORDER BY id").map((r) => r.id)).toEqual(["edge-179-days", "new-today"]);
    expect(db.rows("SELECT day FROM feedback_day ORDER BY day").map((r) => r.day)).toEqual(["2026-10-22", "2026-10-24"]);
    // The cron entry point runs the same sweep.
    await expect(worker.scheduled(undefined, env)).resolves.toBeUndefined();
  });
});
