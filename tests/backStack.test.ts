import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  pushBackHandler,
  removeBackHandler,
  popBackHandler,
  setRouteBack,
  clearRouteBack,
  runRouteBack,
  resetBackStackForTests,
} from "@/app/misc/backStack";

describe("backStack", () => {
  beforeEach(() => resetBackStackForTests());

  it("returns false when nothing is open", () => {
    expect(popBackHandler()).toBe(false);
    expect(runRouteBack()).toBe(false);
  });

  it("calls the top entry only, last in first out", () => {
    const a = vi.fn();
    const b = vi.fn();
    pushBackHandler(Symbol("a"), a);
    pushBackHandler(Symbol("b"), b);
    expect(popBackHandler()).toBe(true);
    expect(b).toHaveBeenCalledTimes(1);
    expect(a).not.toHaveBeenCalled();
  });

  it("falls back to the entry below when the top is removed", () => {
    const a = vi.fn();
    const b = vi.fn();
    const ta = Symbol("a");
    const tb = Symbol("b");
    pushBackHandler(ta, a);
    pushBackHandler(tb, b);
    removeBackHandler(tb);
    popBackHandler();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();
  });

  it("removes out of order without disturbing the rest", () => {
    const calls: string[] = [];
    const ta = Symbol("a");
    const tb = Symbol("b");
    const tc = Symbol("c");
    pushBackHandler(ta, () => calls.push("a"));
    pushBackHandler(tb, () => calls.push("b"));
    pushBackHandler(tc, () => calls.push("c"));
    removeBackHandler(tb);
    popBackHandler();
    removeBackHandler(tc);
    popBackHandler();
    expect(calls).toEqual(["c", "a"]);
    removeBackHandler(ta);
    expect(popBackHandler()).toBe(false);
  });

  it("keeps one entry for a token pushed twice, with the latest function and its place", () => {
    const first = vi.fn();
    const second = vi.fn();
    const lower = vi.fn();
    const t = Symbol("t");
    pushBackHandler(t, first);
    const tu = Symbol("upper");
    pushBackHandler(tu, lower);
    pushBackHandler(t, second);
    // t did not move above "upper": upper is still the top.
    popBackHandler();
    expect(lower).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
    removeBackHandler(tu);
    popBackHandler();
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });

  it("uses the latest function when a token is re-pushed", () => {
    const first = vi.fn();
    const second = vi.fn();
    const t = Symbol("t");
    pushBackHandler(t, first);
    pushBackHandler(t, second);
    popBackHandler();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    removeBackHandler(t);
    expect(popBackHandler()).toBe(false);
  });

  it("runs the route back, and clears it only when it is still the one set", () => {
    const a = vi.fn();
    const b = vi.fn();
    setRouteBack(a);
    expect(runRouteBack()).toBe(true);
    expect(a).toHaveBeenCalledTimes(1);
    setRouteBack(b);
    clearRouteBack(a);
    expect(runRouteBack()).toBe(true);
    expect(b).toHaveBeenCalledTimes(1);
    clearRouteBack(b);
    expect(runRouteBack()).toBe(false);
    setRouteBack(a);
    setRouteBack(null);
    expect(runRouteBack()).toBe(false);
  });
});
