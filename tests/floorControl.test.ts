import { describe, expect, it } from "vitest";
import {
  createFloor,
  isLockedOut,
  lockedOutIds,
  pruneLockouts,
  releaseFloor,
  takeFloor,
  FLOOR_STEAL_COOLDOWN_MS,
} from "../app/misc/multiplayer/floorControl";

describe("floorControl", () => {
  it("grants a free floor with no lockouts", () => {
    const floor = createFloor();
    const result = takeFloor(floor, "alice", 1000);
    expect(result).toEqual({ granted: true, changed: true });
    expect(floor.holderId).toBe("alice");
    expect(lockedOutIds(floor, 1000)).toEqual([]);
  });

  it("locks out the interrupted holder when someone steals the floor", () => {
    const floor = createFloor();
    takeFloor(floor, "alice", 1000);
    const steal = takeFloor(floor, "bob", 2000);

    expect(steal.granted).toBe(true);
    expect(floor.holderId).toBe("bob");
    // Alice, just interrupted, can't grab it right back.
    expect(isLockedOut(floor, "alice", 2000)).toBe(true);
    expect(isLockedOut(floor, "alice", 2000 + FLOOR_STEAL_COOLDOWN_MS - 1)).toBe(true);
  });

  it("denies the just-interrupted player from stealing it right back", () => {
    const floor = createFloor();
    takeFloor(floor, "alice", 1000);
    takeFloor(floor, "bob", 2000); // bob interrupts alice

    // Alice immediately tries to reclaim - denied, floor unchanged.
    const stealBack = takeFloor(floor, "alice", 2100);
    expect(stealBack).toEqual({ granted: false, changed: false });
    expect(floor.holderId).toBe("bob");
  });

  it("lets the interrupted player back in once the cooldown expires", () => {
    const floor = createFloor();
    takeFloor(floor, "alice", 1000);
    takeFloor(floor, "bob", 2000);

    const after = 2000 + FLOOR_STEAL_COOLDOWN_MS + 1;
    expect(isLockedOut(floor, "alice", after)).toBe(false);
    const reclaim = takeFloor(floor, "alice", after);
    expect(reclaim.granted).toBe(true);
    expect(floor.holderId).toBe("alice");
    // Bob is now the interrupted one and gets locked out instead.
    expect(isLockedOut(floor, "bob", after)).toBe(true);
  });

  it("taking a floor you already hold is a no-op, not a self-lockout", () => {
    const floor = createFloor();
    takeFloor(floor, "alice", 1000);
    const again = takeFloor(floor, "alice", 1500);
    expect(again).toEqual({ granted: true, changed: false });
    expect(isLockedOut(floor, "alice", 1500)).toBe(false);
  });

  it("a voluntary release carries no lockout", () => {
    const floor = createFloor();
    takeFloor(floor, "alice", 1000);
    const released = releaseFloor(floor, "alice");
    expect(released.changed).toBe(true);
    expect(floor.holderId).toBeNull();
    expect(isLockedOut(floor, "alice", 1001)).toBe(false);
    // And alice can immediately take it again since she wasn't interrupted.
    expect(takeFloor(floor, "alice", 1002).granted).toBe(true);
  });

  it("ignores a release from a player who doesn't hold the floor", () => {
    const floor = createFloor();
    takeFloor(floor, "alice", 1000);
    const released = releaseFloor(floor, "bob");
    expect(released.changed).toBe(false);
    expect(floor.holderId).toBe("alice");
  });

  it("prunes expired lockouts", () => {
    const floor = createFloor();
    takeFloor(floor, "alice", 1000);
    takeFloor(floor, "bob", 2000); // alice locked out until 2000+cooldown

    expect(pruneLockouts(floor, 2100)).toBe(false); // not expired yet
    expect(pruneLockouts(floor, 2000 + FLOOR_STEAL_COOLDOWN_MS + 1)).toBe(true);
    expect(floor.lockouts.size).toBe(0);
  });
});
