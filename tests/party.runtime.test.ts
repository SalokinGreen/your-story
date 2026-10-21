/**
 * PartyRuntime (app/misc/party/partyRuntime.ts) against a fake LAN server:
 * what actually goes over the wire to each phone, the turn reaching the GM
 * loop, rolls and questions routed to the right phone, the roster written
 * into the story, and the server torn down. The phone/desktop protocol is
 * exercised as JSON text, exactly as Rust relays it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PartyRuntime, type PartyTable, type RosterChange } from "@/app/misc/party/partyRuntime";
import type { PartyBridge, PartyInfo, PartyServerEvent, PartyTarget } from "@/app/misc/party/partyBridge";
import type { DesktopMessage, PlayerView } from "@/app/misc/party/protocol";
import type { CouchPlayer, StoryData } from "@/app/misc/structs";

const TOKEN = "tok3n";
const SECRET = "LEAK_THE_BUTLER_DID_IT";
const PLAN = "LEAK_CAMPAIGN_PLAN";

const INFO: PartyInfo = {
  url: `http://192.168.0.85:8787/party?t=${TOKEN}`,
  ip: "192.168.0.85",
  port: 8787,
  token: TOKEN,
  interfaces: [{ name: "Ethernet", ip: "192.168.0.85", isDefault: true }],
};

function story(): StoryData {
  const note = (title: string, content: string, extra = {}) => ({
    title,
    content,
    relatedCharacters: [],
    relatedLocations: [],
    secrtet: false,
    keys: [],
    ...extra,
  });
  return {
    story_name: "The Drowned Bell",
    premise: "x",
    memory: [],
    npcs: [],
    lore: [
      note("The butler", SECRET, { type: "secret" }),
      note("Campaign Plan", PLAN, { type: "gm_plan" }),
      note("Character: Mara", "Mara is a ranger.", { type: "character_sheet" }),
    ],
    scene: {
      parts: [
        {
          content: "Rain on the bell tower.",
          imageUrl: "",
          user: false,
          role: "assistant",
          choices: [{ text: "Climb" }],
        },
      ],
    },
    multiplayer: { enabled: true, couchPlayers: [{ id: "ada", name: "Ada", color: "#ec4899" }] },
  } as unknown as StoryData;
}

class FakeBridge implements PartyBridge {
  onEvent: (e: PartyServerEvent) => void = () => {};
  sent: { to: PartyTarget; json: string }[] = [];
  kicked: string[] = [];
  stopped = 0;
  started = 0;
  async start(_opts: unknown, onEvent: (e: PartyServerEvent) => void) {
    this.onEvent = onEvent;
    this.started++;
    return INFO;
  }
  async send(to: PartyTarget, json: string) {
    this.sent.push({ to, json });
  }
  async kick(id: string) {
    this.kicked.push(id);
  }
  async stop() {
    this.stopped++;
  }
  // What a given client has been told, in order.
  messagesTo(clientId: string): DesktopMessage[] {
    return this.sent
      .filter((s) => s.to.kind === "client" && s.to.id === clientId)
      .map((s) => JSON.parse(s.json) as DesktopMessage);
  }
  lastView(clientId: string): PlayerView {
    const views = this.messagesTo(clientId).filter(
      (m): m is Extract<DesktopMessage, { type: "view" | "welcome" }> => m.type === "view" || m.type === "welcome",
    );
    return views[views.length - 1].view;
  }
  toasts(clientId: string): string[] {
    return this.messagesTo(clientId).flatMap((m) => (m.type === "toast" ? [m.text] : []));
  }
  phone(clientId: string, msg: object) {
    this.onEvent({ kind: "message", clientId, json: JSON.stringify(msg) });
  }
}

interface Rig {
  bridge: FakeBridge;
  runtime: PartyRuntime;
  story: StoryData;
  roster: RosterChange[];
  turns: { text: string; speakerIds: string[]; kind: string }[];
  tables: (PartyTable | null)[];
  timers: { fn: () => void; ms: number }[];
  clock: { now: number };
  transcribe: ReturnType<typeof vi.fn>;
  errors: { code: string; message: string }[];
}

function rig(): Rig {
  const bridge = new FakeBridge();
  const clock = { now: 1_000_000 };
  const r: Rig = {
    bridge,
    story: story(),
    roster: [],
    turns: [],
    tables: [],
    timers: [],
    clock,
    transcribe: vi.fn(async () => "I whistle a tune"),
    errors: [],
    runtime: null as unknown as PartyRuntime,
  };
  let n = 0;
  r.runtime = new PartyRuntime({
    bridge,
    getStory: () => r.story,
    applyRoster: (c) => r.roster.push(c),
    submitTurn: async (text, speakerIds, kind) => {
      r.turns.push({ text, speakerIds, kind });
    },
    transcribe: r.transcribe as unknown as (chunks: string[], mime: string) => Promise<string>,
    onTable: (t) => r.tables.push(t),
    onError: (e) => r.errors.push(e),
    cooldownMs: 15000,
    now: () => clock.now,
    newId: () => `id${++n}x`,
    setTimer: (fn, ms) => {
      r.timers.push({ fn, ms });
      return r.timers.length;
    },
    clearTimer: () => {},
  });
  return r;
}

async function seat(r: Rig, clientId: string, name: string, color: string) {
  r.bridge.onEvent({ kind: "connected", clientId, userAgent: "test" });
  r.bridge.phone(clientId, { type: "hello", token: TOKEN });
  r.bridge.phone(clientId, { type: "join", name, color });
  return r.bridge.lastView(clientId).me!.id;
}

describe("PartyRuntime", () => {
  let r: Rig;
  beforeEach(async () => {
    r = rig();
    await r.runtime.start({}, r.story.multiplayer!.couchPlayers!);
  });

  it("welcomes a phone with a lobby view that offers the story's open seats", () => {
    r.bridge.onEvent({ kind: "connected", clientId: "c1", userAgent: "x" });
    r.bridge.phone("c1", { type: "hello", token: TOKEN });
    const [welcome] = r.bridge.messagesTo("c1");
    expect(welcome.type).toBe("welcome");
    const view = (welcome as Extract<DesktopMessage, { type: "welcome" }>).view;
    expect(view.me).toBeNull();
    expect(view.join?.openSeats.map((s) => s.name)).toEqual(["Ada"]);
  });

  it("drops a phone with the wrong token and ignores garbage", () => {
    r.bridge.onEvent({ kind: "connected", clientId: "c1", userAgent: "x" });
    r.bridge.phone("c1", { type: "hello", token: "wrong" });
    expect(r.bridge.kicked).toEqual(["c1"]);
    // A bad token is not told why.
    expect(r.bridge.toasts("c1")).toEqual([]);
    r.bridge.onEvent({ kind: "message", clientId: "c1", json: "{not json" });
    r.bridge.onEvent({ kind: "message", clientId: "c1", json: JSON.stringify({ type: "nuke" }) });
    expect(r.turns).toEqual([]);
  });

  it("writes a joining player into the story's roster", async () => {
    const id = await seat(r, "c1", "Mara", "#22c55e");
    const change = r.roster[r.roster.length - 1];
    expect(change.removedIds).toEqual([]);
    expect(change.players.map((p) => p.id)).toContain(id);
    expect(change.players.find((p) => p.id === id)).toMatchObject({ name: "Mara", color: "#22c55e" });
  });

  it("never puts a secret on the wire, to anyone, at any point", async () => {
    const mara = await seat(r, "c1", "Mara", "#22c55e");
    r.bridge.onEvent({ kind: "connected", clientId: "c2", userAgent: "x" });
    r.bridge.phone("c2", { type: "hello", token: TOKEN });
    r.bridge.phone("c1", { type: "spotlight_take" });
    r.bridge.phone("c1", { type: "line", text: "I climb.", kind: "typed" });
    r.runtime.refreshViews();
    r.runtime.go();

    expect(r.bridge.sent.length).toBeGreaterThan(5);
    for (const { json } of r.bridge.sent) {
      expect(json).not.toContain(SECRET);
      expect(json).not.toContain(PLAN);
      expect(json).not.toContain("premise");
    }
    // Mara sees her own sheet and the narration; the lobby phone sees neither.
    expect(r.bridge.lastView("c1").sheet?.content).toBe("Mara is a ranger.");
    expect(r.bridge.lastView("c1").narration).toBe("Rain on the bell tower.");
    expect(r.bridge.lastView("c2").sheet).toBeNull();
    expect(r.bridge.lastView("c2").narration).toBe("");
    expect(mara).toBeTruthy();
  });

  it("broadcasts the spotlight to every phone and refuses a line without it", async () => {
    await seat(r, "c1", "Mara", "#22c55e");
    await seat(r, "c2", "Tom", "#3b82f6");
    r.bridge.phone("c2", { type: "line", text: "Hello", kind: "typed" });
    expect(r.bridge.toasts("c2")).toEqual(["Take the spotlight first."]);

    r.bridge.phone("c1", { type: "spotlight_take" });
    const holder = r.bridge.lastView("c1").me!.id;
    expect(r.bridge.lastView("c2").spotlightHolderId).toBe(holder);
    expect(r.tables[r.tables.length - 1]?.holderId).toBe(holder);
  });

  it("sends the queue as one couch-shaped turn, and locks until the turn ends", async () => {
    const mara = await seat(r, "c1", "Mara", "#22c55e");
    const tom = await seat(r, "c2", "Tom", "#3b82f6");
    r.bridge.phone("c1", { type: "spotlight_take" });
    r.bridge.phone("c1", { type: "line", text: "I open the door.", kind: "typed" });
    r.bridge.phone("c2", { type: "spotlight_take" });
    r.bridge.phone("c2", { type: "line", text: "I keep watch.", kind: "choice" });

    r.bridge.phone("c1", { type: "go" });
    expect(r.turns).toEqual([
      { text: "> Mara: I open the door.\n> Tom: I keep watch.", speakerIds: [mara, tom], kind: "freeform" },
    ]);
    expect(r.bridge.lastView("c1").turn).toBe("generating");

    // A second Go and a new line are refused while the GM works.
    r.bridge.phone("c2", { type: "go" });
    r.bridge.phone("c2", { type: "line", text: "More", kind: "typed" });
    expect(r.turns).toHaveLength(1);
    expect(r.bridge.lastView("c2").queue).toEqual([]);

    r.runtime.setTurnBusy(false);
    expect(r.bridge.lastView("c1").turn).toBe("idle");
    r.bridge.phone("c2", { type: "line", text: "More", kind: "typed" });
    expect(r.bridge.lastView("c2").queue.map((l) => l.text)).toEqual(["More"]);
  });

  it("lets the desktop tap Go", async () => {
    await seat(r, "c1", "Mara", "#22c55e");
    r.bridge.phone("c1", { type: "spotlight_take" });
    r.bridge.phone("c1", { type: "line", text: "Hi", kind: "typed" });
    r.runtime.go();
    expect(r.turns.map((t) => t.text)).toEqual(["> Mara: Hi"]);
  });

  it("unlocks the queue if the turn never started", async () => {
    r.runtime = new PartyRuntime({
      bridge: r.bridge,
      getStory: () => r.story,
      applyRoster: () => {},
      submitTurn: async () => {
        throw new Error("no story loaded");
      },
      transcribe: async () => "",
      onTable: (t) => r.tables.push(t),
      cooldownMs: 15000,
      now: () => r.clock.now,
      newId: (() => {
        let n = 0;
        return () => `z${++n}`;
      })(),
    });
    await r.runtime.start({}, []);
    await seat(r, "c1", "Mara", "#22c55e");
    r.bridge.phone("c1", { type: "spotlight_take" });
    r.bridge.phone("c1", { type: "line", text: "Hi", kind: "typed" });
    r.bridge.phone("c1", { type: "go" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(r.bridge.lastView("c1").turn).toBe("idle");
  });

  it("transcribes a phone's recorded take into a voice line", async () => {
    const mara = await seat(r, "c1", "Mara", "#22c55e");
    r.bridge.phone("c1", { type: "spotlight_take" });
    r.bridge.phone("c1", { type: "voice_chunk", takeId: "t1", seq: 0, base64: "AAAA", last: false, mimeType: "audio/mp4" });
    r.bridge.phone("c1", { type: "voice_chunk", takeId: "t1", seq: 1, base64: "BBBB", last: true });
    expect(r.transcribe).toHaveBeenCalledWith(["AAAA", "BBBB"], "audio/mp4");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(r.bridge.lastView("c1").queue).toMatchObject([{ playerId: mara, text: "I whistle a tune", kind: "voice" }]);
    r.runtime.go();
    expect(r.turns[0]).toMatchObject({ text: "> Mara: I whistle a tune", kind: "voice" });
  });

  it("tells the phone when a recording couldn't be transcribed", async () => {
    r.transcribe.mockRejectedValueOnce(new Error("The desktop has no Mistral key for speech-to-text"));
    await seat(r, "c1", "Mara", "#22c55e");
    r.bridge.phone("c1", { type: "spotlight_take" });
    r.bridge.phone("c1", { type: "voice_chunk", takeId: "t1", seq: 0, base64: "AAAA", last: true });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(r.bridge.toasts("c1")).toEqual(["The desktop has no Mistral key for speech-to-text"]);
  });

  describe("rolls and questions", () => {
    it("routes a roll to the named player's phone and resolves it from there", async () => {
      const mara = await seat(r, "c1", "Mara", "#22c55e");
      await seat(r, "c2", "Tom", "#3b82f6");
      const answers: unknown[] = [];
      const id = r.runtime.offerRoll(
        { title: "Climb the tower", description: "Roll 1d20", formula: "1d20", playerName: "mara" },
        (a) => answers.push(a),
      );
      expect(id).not.toBeNull();
      expect(r.bridge.lastView("c1").requests).toMatchObject([{ requestId: id, kind: "roll", title: "Climb the tower" }]);
      expect(r.bridge.lastView("c2").requests).toEqual([]);
      expect(r.tables[r.tables.length - 1]?.pending).toMatchObject([{ requestId: id, playerId: mara, playerName: "Mara" }]);

      // Tom can't answer Mara's roll.
      r.bridge.phone("c2", { type: "roll_result", requestId: id, value: "20" });
      expect(answers).toEqual([]);
      r.bridge.phone("c1", { type: "roll_result", requestId: id, value: "17" });
      expect(answers).toEqual([{ rawText: "17" }]);
      expect(r.bridge.lastView("c1").requests).toEqual([]);
    });

    it("turns 'Roll for me' into the skipped answer the GM already handles", async () => {
      await seat(r, "c1", "Mara", "#22c55e");
      const answers: unknown[] = [];
      const id = r.runtime.offerRoll({ title: "t", description: "", playerName: "Mara" }, (a) => answers.push(a));
      r.bridge.phone("c1", { type: "roll_result", requestId: id, value: null });
      expect(answers).toEqual([null]);
    });

    it("leaves a roll for someone who isn't on a phone to the desktop", async () => {
      await seat(r, "c1", "Mara", "#22c55e");
      expect(r.runtime.offerRoll({ title: "t", description: "", playerName: "Ada" }, () => {})).toBeNull();
      expect(r.runtime.offerRoll({ title: "t", description: "", playerName: "Nobody" }, () => {})).toBeNull();
    });

    it("sends an untargeted roll to whoever holds the spotlight, else the desktop", async () => {
      await seat(r, "c1", "Mara", "#22c55e");
      expect(r.runtime.offerRoll({ title: "t", description: "" }, () => {})).toBeNull();
      r.bridge.phone("c1", { type: "spotlight_take" });
      expect(r.runtime.offerRoll({ title: "t", description: "" }, () => {})).not.toBeNull();
    });

    it("routes a question batch to one phone, and keeps mixed targets on the desktop", async () => {
      await seat(r, "c1", "Mara", "#22c55e");
      await seat(r, "c2", "Tom", "#3b82f6");
      const q = (target?: string) => ({
        question: "Which way?",
        options: [{ label: "Left" }, { label: "Right" }],
        target_player_name: target,
      });
      expect(r.runtime.offerQuestion({ questions: [q("Mara"), q("Tom")] }, () => {})).toBeNull();

      const answers: unknown[] = [];
      const id = r.runtime.offerQuestion({ questions: [q("Tom"), q()] }, (a) => answers.push(a))!;
      const view = r.bridge.lastView("c2");
      expect(view.requests[0]).toMatchObject({ kind: "question", requestId: id });
      r.bridge.phone("c2", {
        type: "answer",
        requestId: id,
        answers: [
          { selectedLabel: "Right", skipped: false },
          { customText: "I'd rather not", skipped: false },
        ],
      });
      expect(answers).toEqual([
        { answers: [{ selectedLabel: "Right", skipped: false }, { customText: "I'd rather not", skipped: false }] },
      ]);
    });

    it("takes a prompt back from the phone when the desktop answers it", async () => {
      await seat(r, "c1", "Mara", "#22c55e");
      const answers: unknown[] = [];
      const id = r.runtime.offerRoll({ title: "t", description: "", playerName: "Mara" }, (a) => answers.push(a))!;
      r.runtime.cancelRequest(id);
      expect(r.bridge.lastView("c1").requests).toEqual([]);
      r.bridge.phone("c1", { type: "roll_result", requestId: id, value: "9" });
      expect(answers).toEqual([]);
    });
  });

  it("wakes up when a lockout ends and tells the phones", async () => {
    await seat(r, "c1", "Mara", "#22c55e");
    await seat(r, "c2", "Tom", "#3b82f6");
    r.bridge.phone("c1", { type: "spotlight_take" });
    r.bridge.phone("c2", { type: "spotlight_take" });
    expect(r.bridge.lastView("c1").seats.find((s) => s.name === "Mara")?.lockoutMs).toBe(15000);
    const timer = r.timers[r.timers.length - 1];
    expect(timer.ms).toBeGreaterThanOrEqual(15000);
    r.clock.now += 15100;
    timer.fn();
    expect(r.bridge.lastView("c1").seats.find((s) => s.name === "Mara")?.lockoutMs).toBe(0);
    expect(r.tables[r.tables.length - 1]?.lockedUntil).toEqual({});
  });

  it("follows the cooldown setting for the next steal", async () => {
    r.runtime.setCooldownMs(5000);
    await seat(r, "c1", "Mara", "#22c55e");
    await seat(r, "c2", "Tom", "#3b82f6");
    r.bridge.phone("c1", { type: "spotlight_take" });
    r.bridge.phone("c2", { type: "spotlight_take" });
    expect(r.bridge.lastView("c1").seats.find((s) => s.name === "Mara")?.lockoutMs).toBe(5000);
  });

  it("writes a seat back to the story when an undo dropped it, and follows a rename", async () => {
    const mara = await seat(r, "c1", "Mara", "#22c55e");
    r.roster.length = 0;
    const undone: CouchPlayer[] = [{ id: "ada", name: "Ada", color: "#ec4899" }];
    r.runtime.syncRoster(undone);
    expect(r.roster).toHaveLength(1);
    expect(r.roster[0].players.map((p) => p.id)).toEqual([mara]);
    // Mara is still seated and was not kicked.
    expect(r.bridge.kicked).toEqual([]);
    expect(r.tables[r.tables.length - 1]?.players.find((p) => p.id === mara)?.connected).toBe(true);

    r.runtime.syncRoster([{ id: "ada", name: "Ada", color: "#ec4899" }, { id: mara, name: "Marina", color: "#22c55e" }]);
    expect(r.bridge.lastView("c1").me?.name).toBe("Marina");
  });

  it("removes a player on purpose, kicking their phone and clearing them from the story", async () => {
    const mara = await seat(r, "c1", "Mara", "#22c55e");
    r.roster.length = 0;
    r.runtime.removePlayer(mara);
    expect(r.bridge.kicked).toEqual(["c1"]);
    expect(r.bridge.toasts("c1")).toEqual(["Disconnected: removed by the host."]);
    expect(r.roster[0].removedIds).toEqual([mara]);
  });

  it("keeps a seat across a reconnect with its seat key", async () => {
    const mara = await seat(r, "c1", "Mara", "#22c55e");
    const seatKey = r.bridge.lastView("c1").me!.seatKey;
    r.bridge.onEvent({ kind: "disconnected", clientId: "c1" });
    expect(r.tables[r.tables.length - 1]?.players.find((p) => p.id === mara)?.connected).toBe(false);
    r.bridge.onEvent({ kind: "connected", clientId: "c7", userAgent: "x" });
    r.bridge.phone("c7", { type: "hello", token: TOKEN, playerId: mara, seatKey });
    expect(r.bridge.lastView("c7").me?.id).toBe(mara);
  });

  it("stops the server, hands waiting prompts back to the desktop, and clears the table", async () => {
    await seat(r, "c1", "Mara", "#22c55e");
    const answers: unknown[] = [];
    r.runtime.offerRoll({ title: "t", description: "", playerName: "Mara" }, (a) => answers.push(a));
    await r.runtime.stop();
    expect(r.bridge.stopped).toBeGreaterThanOrEqual(1);
    expect(answers).toEqual([null]);
    expect(r.tables[r.tables.length - 1]).toBeNull();
    expect(r.runtime.running).toBe(false);
  });

  it("reports a server that died and shuts down", async () => {
    r.bridge.onEvent({ kind: "error", code: "SERVER_FAILED", message: "listener closed" });
    expect(r.errors).toEqual([{ code: "SERVER_FAILED", message: "listener closed" }]);
    expect(r.runtime.running).toBe(false);
  });

  it("buffers events that arrive before the server has returned its token", async () => {
    const early = rig();
    const bridge = early.bridge;
    // A phone connects while start() is still awaiting.
    bridge.start = async (_o, onEvent) => {
      bridge.onEvent = onEvent;
      onEvent({ kind: "connected", clientId: "c1", userAgent: "x" });
      onEvent({ kind: "message", clientId: "c1", json: JSON.stringify({ type: "hello", token: TOKEN }) });
      return INFO;
    };
    await early.runtime.start({}, []);
    expect(bridge.messagesTo("c1")[0]?.type).toBe("welcome");
  });
});
