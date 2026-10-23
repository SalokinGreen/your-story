/**
 * There is no DOM test setup in this repo, so React's two hooks are replaced
 * by a tiny harness: refs persist per "component", an effect re-runs when its
 * deps change (cleanup first) and its cleanup runs on unmount.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

interface Harness {
  refs: { current: unknown }[];
  effects: { deps: unknown[] | undefined; cleanup?: void | (() => void) }[];
  refIdx: number;
  effIdx: number;
}
let h: Harness;

vi.mock("react", () => ({
  useRef: (init: unknown) => {
    if (h.refs.length <= h.refIdx) h.refs.push({ current: init });
    return h.refs[h.refIdx++];
  },
  useEffect: (fn: () => void | (() => void), deps?: unknown[]) => {
    const i = h.effIdx++;
    const prev = h.effects[i];
    const same =
      prev &&
      deps &&
      prev.deps &&
      deps.length === prev.deps.length &&
      deps.every((d, k) => Object.is(d, prev.deps![k]));
    if (same) return;
    if (prev && typeof prev.cleanup === "function") prev.cleanup();
    h.effects[i] = { deps, cleanup: fn() };
  },
}));

import { useBackHandler, useRouteBack } from "@/app/misc/useBackHandler";
import {
  popBackHandler,
  runRouteBack,
  resetBackStackForTests,
} from "@/app/misc/backStack";

function newComponent() {
  const state: Harness = { refs: [], effects: [], refIdx: 0, effIdx: 0 };
  return {
    render(hook: () => void) {
      h = state;
      state.refIdx = 0;
      state.effIdx = 0;
      hook();
    },
    unmount() {
      for (const e of state.effects) {
        if (e && typeof e.cleanup === "function") e.cleanup();
      }
      state.effects = [];
    },
  };
}

describe("useBackHandler", () => {
  beforeEach(() => resetBackStackForTests());

  it("registers while active and not before", () => {
    const c = newComponent();
    const fn = vi.fn();
    c.render(() => useBackHandler(false, fn));
    expect(popBackHandler()).toBe(false);
    c.render(() => useBackHandler(true, fn));
    expect(popBackHandler()).toBe(true);
    expect(fn).toHaveBeenCalledTimes(1);
    c.render(() => useBackHandler(false, fn));
    expect(popBackHandler()).toBe(false);
  });

  it("keeps one entry across rerenders and calls the latest callback", () => {
    const c = newComponent();
    const first = vi.fn();
    const second = vi.fn();
    c.render(() => useBackHandler(true, first));
    c.render(() => useBackHandler(true, second));
    c.render(() => useBackHandler(true, second));
    popBackHandler();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    c.unmount();
    expect(popBackHandler()).toBe(false);
  });

  it("a rerender of the lower surface does not move it above a newer one", () => {
    const parent = newComponent();
    const child = newComponent();
    const p = vi.fn();
    const k = vi.fn();
    parent.render(() => useBackHandler(true, p));
    child.render(() => useBackHandler(true, k));
    parent.render(() => useBackHandler(true, p));
    popBackHandler();
    expect(k).toHaveBeenCalledTimes(1);
    expect(p).not.toHaveBeenCalled();
    child.unmount();
    popBackHandler();
    expect(p).toHaveBeenCalledTimes(1);
  });

  it("route back is set while a function is given and cleared on unmount", () => {
    const c = newComponent();
    const fn = vi.fn();
    c.render(() => useRouteBack(fn));
    expect(runRouteBack()).toBe(true);
    c.render(() => useRouteBack(null));
    expect(runRouteBack()).toBe(false);
    c.render(() => useRouteBack(fn));
    c.unmount();
    expect(runRouteBack()).toBe(false);
  });
});
