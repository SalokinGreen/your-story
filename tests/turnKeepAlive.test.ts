import { beforeEach, describe, expect, it, vi } from "vitest";

const native = vi.hoisted(() => ({
  platform: "android",
  begin: vi.fn(),
  end: vi.fn(),
  notifyReady: vi.fn(),
  notifyAttention: vi.fn(),
  requestNotificationPermission: vi.fn(),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: { getPlatform: () => native.platform },
  registerPlugin: () => ({
    begin: native.begin,
    end: native.end,
    notifyReady: native.notifyReady,
    notifyAttention: native.notifyAttention,
    requestNotificationPermission: native.requestNotificationPermission,
  }),
}));

const logged = vi.hoisted(() => ({ warn: vi.fn() }));
vi.mock("@/app/misc/logger", () => ({ logger: { warn: logged.warn } }));

import {
  PERMISSION_ASKED_KEY,
  beginTurnKeepAlive,
  endTurnKeepAlive,
  newTurnId,
  notifyPlayerNeeded,
} from "@/app/misc/turnKeepAlive";

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

beforeEach(() => {
  native.platform = "android";
  for (const fn of [
    native.begin,
    native.end,
    native.notifyReady,
    native.notifyAttention,
    native.requestNotificationPermission,
    logged.warn,
  ]) {
    fn.mockReset();
    fn.mockResolvedValue(undefined);
  }
  vi.stubGlobal("localStorage", memoryStorage());
});

describe("turnKeepAlive", () => {
  it.each(["web", "ios"])("is a no-op on %s", (platform) => {
    native.platform = platform;
    beginTurnKeepAlive("t1");
    endTurnKeepAlive("t1", "ready", "Story");
    expect(native.begin).not.toHaveBeenCalled();
    expect(native.end).not.toHaveBeenCalled();
    expect(native.notifyReady).not.toHaveBeenCalled();
    expect(native.requestNotificationPermission).not.toHaveBeenCalled();
  });

  it("passes the turn id to begin and end", () => {
    beginTurnKeepAlive("t1");
    endTurnKeepAlive("t1", "stopped");
    expect(native.begin).toHaveBeenCalledWith({ turnId: "t1" });
    expect(native.end).toHaveBeenCalledWith({ turnId: "t1" });
  });

  it("asks for a ready ping only on the ready outcome, after end", () => {
    const order: string[] = [];
    native.end.mockImplementation(async () => void order.push("end"));
    native.notifyReady.mockImplementation(async () => void order.push("ready"));
    endTurnKeepAlive("t1", "stopped");
    endTurnKeepAlive("t2", "failed");
    expect(native.notifyReady).not.toHaveBeenCalled();
    endTurnKeepAlive("t3", "ready", "The Hollow Hour");
    expect(native.notifyReady).toHaveBeenCalledWith({
      turnId: "t3",
      title: "Your turn is ready",
      body: "The Hollow Hour",
    });
    expect(order.slice(-2)).toEqual(["end", "ready"]);
  });

  it("asks for the notification permission once per device", () => {
    beginTurnKeepAlive("t1");
    beginTurnKeepAlive("t2");
    expect(native.requestNotificationPermission).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(PERMISSION_ASKED_KEY)).toBe("1");
    expect(native.begin).toHaveBeenCalledTimes(2);
  });

  it("starts the service without waiting for the permission prompt", () => {
    native.requestNotificationPermission.mockReturnValue(
      new Promise<void>(() => {}), // never settles
    );
    beginTurnKeepAlive("t1");
    expect(native.begin).toHaveBeenCalledWith({ turnId: "t1" });
  });

  it("does not ask when storage is unavailable", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    });
    expect(() => beginTurnKeepAlive("t1")).not.toThrow();
    expect(native.begin).toHaveBeenCalled();
    expect(native.requestNotificationPermission).not.toHaveBeenCalled();
  });

  it("never throws when a native call rejects or throws, and logs it", async () => {
    native.begin.mockRejectedValue(new Error("boom"));
    native.end.mockImplementation(() => {
      throw new Error("sync boom");
    });
    native.notifyReady.mockRejectedValue(new Error("nope"));
    expect(() => beginTurnKeepAlive("t1")).not.toThrow();
    expect(() => endTurnKeepAlive("t1", "ready")).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
    expect(logged.warn).toHaveBeenCalledTimes(3);
  });

  it("makes distinct turn ids", () => {
    expect(newTurnId()).not.toBe(newTurnId());
  });
});

describe("notifyPlayerNeeded", () => {
  it("asks native to post a question ping with the question as its body", () => {
    notifyPlayerNeeded("question", "  Do you open the door?  ");
    expect(native.notifyAttention).toHaveBeenCalledWith({
      title: "The GM has a question for you",
      body: "Do you open the door?",
    });
  });

  it("names a roll, and falls back to the app name with no detail", () => {
    notifyPlayerNeeded("roll");
    expect(native.notifyAttention).toHaveBeenCalledWith({
      title: "The GM needs a roll from you",
      body: "Endless Adventure",
    });
  });

  it.each(["web", "ios"])("is a no-op on %s", (platform) => {
    native.platform = platform;
    notifyPlayerNeeded("question", "Q");
    expect(native.notifyAttention).not.toHaveBeenCalled();
  });

  it("never throws when native rejects", async () => {
    native.notifyAttention.mockRejectedValue(new Error("boom"));
    expect(() => notifyPlayerNeeded("roll", "Stealth")).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
    expect(logged.warn).toHaveBeenCalled();
  });
});
