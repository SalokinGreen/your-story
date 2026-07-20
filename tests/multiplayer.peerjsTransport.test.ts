import { afterEach, describe, expect, it, vi } from "vitest";

// vi.hoisted is required here (not a plain top-level const) because vi.mock
// factories are hoisted above all imports - a normal const declared below
// wouldn't exist yet when the factory runs.
const { FakePeer, peerState } = vi.hoisted(() => {
  type Handler = (...args: unknown[]) => void;

  class FakeDataConnection {
    peer: string;
    private handlers: Record<string, Handler[]> = {};
    constructor(peer: string) {
      this.peer = peer;
    }
    on(event: string, cb: Handler) {
      (this.handlers[event] ??= []).push(cb);
    }
    emit(event: string, ...args: unknown[]) {
      (this.handlers[event] || []).forEach((cb) => cb(...args));
    }
    send() {}
    close() {}
  }

  const peerState = {
    // Controls what every FakePeer constructed from here on does once its
    // (simulated, async) connection to the broker settles.
    behavior: "open" as "open" | "unavailable-id" | "other-error",
    instances: [] as InstanceType<typeof FakePeerImpl>[],
  };

  class FakePeerImpl {
    id: string;
    open = false;
    private handlers: Record<string, Handler[]> = {};
    private destroyed = false;

    constructor(id?: string) {
      this.id = id ?? `auto-${Math.random().toString(36).slice(2, 8)}`;
      peerState.instances.push(this);
      // Async, like the real broker handshake, so tests exercise the same
      // "wait for open/error" wiring the adapter actually relies on.
      setTimeout(() => {
        if (this.destroyed) return;
        if (peerState.behavior === "open") {
          this.open = true;
          this.emit("open", this.id);
        } else if (peerState.behavior === "unavailable-id") {
          this.emit("error", Object.assign(new Error("ID taken"), { type: "unavailable-id" }));
        } else {
          this.emit("error", Object.assign(new Error("boom"), { type: "network" }));
        }
      }, 0);
    }

    on(event: string, cb: Handler) {
      (this.handlers[event] ??= []).push(cb);
    }
    emit(event: string, ...args: unknown[]) {
      (this.handlers[event] || []).forEach((cb) => cb(...args));
    }
    connect(id: string) {
      const conn = new FakeDataConnection(id);
      setTimeout(() => conn.emit("open"), 0);
      return conn;
    }
    destroy() {
      this.destroyed = true;
      this.open = false;
    }
  }

  return { FakePeer: FakePeerImpl, peerState };
});

vi.mock("peerjs", () => ({ default: FakePeer }));

const { createPeerjsTransport } = await import("../app/misc/multiplayer/transports/peerjs");

afterEach(() => {
  peerState.behavior = "open";
  peerState.instances.length = 0;
});

describe("PeerJS transport role handling", () => {
  it("host role claims the room code as its own peer id", async () => {
    const transport = createPeerjsTransport();
    await transport.join("ROOMCODE", "host");
    expect(transport.selfId()).toBe("ROOMCODE");
  });

  it("host role rejects clearly on a room code collision, instead of silently becoming a guest", async () => {
    peerState.behavior = "unavailable-id";
    const transport = createPeerjsTransport();

    await expect(transport.join("TAKEN1", "host")).rejects.toThrow(/already in use/);

    // Must not have quietly reconnected as a guest under a different id -
    // this is the exact failure mode being guarded against: a NetSession
    // that still thinks it's the host, sitting on a transport that never
    // actually became the star center.
    expect(transport.selfId()).toBeNull();
    expect(() => transport.send({ type: "presence_activity", playerId: "x", state: "idle" })).toThrow(
      /not joined yet/,
    );
  });

  it("guest role always connects out, never tries to claim the room code", async () => {
    const transport = createPeerjsTransport();
    await transport.join("ROOMCODE", "guest");

    // The guest's own id is auto-assigned, not the room code.
    expect(transport.selfId()).not.toBe("ROOMCODE");
    expect(transport.selfId()).toMatch(/^auto-/);
  });

  it("guest role rejects if its own connection to the broker fails", async () => {
    peerState.behavior = "other-error";
    const transport = createPeerjsTransport();

    await expect(transport.join("ROOMCODE", "guest")).rejects.toThrow("boom");
  });
});
