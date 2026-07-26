import { describe, expect, it } from "vitest";
import {
  MIN_DRAG_PX,
  clampToTrayFloor,
  powerFromDragDistance,
  roomInDirection,
  throwFromDrag,
  trayFloorLimits,
  trayPointToWorld,
  type TraySize,
} from "@/app/misc/diceThrow";

// A portrait, phone-sized tray and a landscape, desktop-sized one - the two
// shapes the modal actually renders at.
const PHONE: TraySize = { width: 390, height: 520 };
const DESKTOP: TraySize = { width: 900, height: 500 };

describe("trayPointToWorld", () => {
  it("maps the middle of the tray to the middle of the physics world", () => {
    for (const tray of [PHONE, DESKTOP]) {
      const mid = trayPointToWorld(tray.width / 2, tray.height / 2, tray);
      expect(mid.x).toBeCloseTo(0);
      expect(mid.z).toBeCloseTo(0);
    }
  });

  // dice-box's top-down camera views the physics world mirrored in X, so
  // dragging right has to move dice toward -X or the throw goes the wrong way.
  it("maps screen right to world -X and screen down to world +Z", () => {
    const right = trayPointToWorld(PHONE.width - 1, PHONE.height / 2, PHONE);
    expect(right.x).toBeLessThan(0);
    expect(right.z).toBeCloseTo(0);

    const down = trayPointToWorld(PHONE.width / 2, PHONE.height - 1, PHONE);
    expect(down.z).toBeGreaterThan(0);
    expect(down.x).toBeCloseTo(0);
  });

  it("uses the same scale on both axes, so a diagonal drag stays diagonal", () => {
    const across = trayPointToWorld(PHONE.width / 2 + 100, PHONE.height / 2, PHONE);
    const down = trayPointToWorld(PHONE.width / 2, PHONE.height / 2 + 100, PHONE);
    expect(Math.abs(across.x)).toBeCloseTo(Math.abs(down.z));
  });

  it("keeps the visible tray corners inside the physics walls", () => {
    for (const tray of [PHONE, DESKTOP]) {
      const corner = trayPointToWorld(0, 0, tray);
      const clamped = clampToTrayFloor(corner.x, corner.z, tray);
      // Pressing in the very corner should barely be clamped - if the mapping
      // scale were wrong, the corner would land far outside the walls and every
      // edge throw would spawn from the same clamped point.
      expect(Math.abs(clamped.x - corner.x)).toBeLessThan(1.5);
      expect(Math.abs(clamped.z - corner.z)).toBeLessThan(1.5);
    }
  });
});

describe("roomInDirection", () => {
  it("measures the distance to the wall the throw is aimed at", () => {
    const limits = trayFloorLimits(PHONE);
    expect(roomInDirection(0, 0, 0, 1, PHONE)).toBeCloseTo(limits.z);
    expect(roomInDirection(0, 0, 0, -1, PHONE)).toBeCloseTo(limits.z);
    expect(roomInDirection(0, 0, 1, 0, PHONE)).toBeCloseTo(limits.x);
  });

  it("gives a point near a wall little room toward it and lots away from it", () => {
    const limits = trayFloorLimits(PHONE);
    const nearFar = limits.z - 0.2;
    expect(roomInDirection(0, nearFar, 0, 1, PHONE)).toBeCloseTo(0.2);
    expect(roomInDirection(0, nearFar, 0, -1, PHONE)).toBeCloseTo(2 * limits.z - 0.2);
  });

  it("never returns a negative distance for a point already outside the walls", () => {
    expect(roomInDirection(99, 99, 0, 1, PHONE)).toBeGreaterThanOrEqual(0);
  });

  it("is limited by whichever wall a diagonal throw reaches first", () => {
    const diagonal = roomInDirection(0, 0, Math.SQRT1_2, Math.SQRT1_2, PHONE);
    expect(diagonal).toBeLessThan(roomInDirection(0, 0, 0, 1, PHONE));
  });
});

describe("clampToTrayFloor", () => {
  it("pulls out-of-bounds points inside the walls", () => {
    const clamped = clampToTrayFloor(50, -50, PHONE);
    expect(Math.abs(clamped.x)).toBeLessThan(4);
    expect(Math.abs(clamped.z)).toBeLessThan(4);
  });

  it("leaves in-bounds points alone", () => {
    const clamped = clampToTrayFloor(0.5, -1, PHONE);
    expect(clamped.x).toBeCloseTo(0.5);
    expect(clamped.z).toBeCloseTo(-1);
  });

  it("allows a wider spread of X on a landscape tray than a portrait one", () => {
    expect(clampToTrayFloor(50, 0, DESKTOP).x).toBeGreaterThan(
      clampToTrayFloor(50, 0, PHONE).x
    );
  });

  it("never returns a point outside the tray even when the tray is degenerate", () => {
    const clamped = clampToTrayFloor(10, 10, { width: 0, height: 0 });
    expect(Number.isFinite(clamped.x)).toBe(true);
    expect(Number.isFinite(clamped.z)).toBe(true);
  });
});

describe("powerFromDragDistance", () => {
  it("scores a tap-length drag at zero", () => {
    expect(powerFromDragDistance(MIN_DRAG_PX, PHONE)).toBe(0);
    expect(powerFromDragDistance(0, PHONE)).toBe(0);
  });

  it("ramps up with distance and saturates at 1", () => {
    const short = powerFromDragDistance(40, PHONE);
    const medium = powerFromDragDistance(100, PHONE);
    expect(short).toBeGreaterThan(0);
    expect(medium).toBeGreaterThan(short);
    expect(powerFromDragDistance(10000, PHONE)).toBe(1);
  });

  // The whole reason power felt broken on mobile: dice spawn where you press,
  // so the longest drag available is roughly the tray's own shorter side. A
  // desktop-tuned fixed threshold puts full power out of reach on a phone.
  it("makes full power reachable within the tray on a phone-sized tray", () => {
    const reachable = Math.min(PHONE.width, PHONE.height) * 0.5;
    expect(powerFromDragDistance(reachable, PHONE)).toBe(1);
  });

  it("scales the ramp to the tray, so the same fraction of each tray throws about as hard", () => {
    const quarterOfTray = (tray: TraySize) =>
      powerFromDragDistance(Math.min(tray.width, tray.height) * 0.25, tray);
    // Not exactly equal - the tap deadzone is a fixed number of px, so it eats
    // a slightly larger share of a small tray - but close enough that the same
    // gesture feels the same on a phone and a desktop.
    expect(quarterOfTray(PHONE)).toBeCloseTo(quarterOfTray(DESKTOP), 1);
  });
});

describe("throwFromDrag", () => {
  const mid = { x: PHONE.width / 2, y: PHONE.height / 2 };

  it("rejects a tap", () => {
    expect(throwFromDrag(mid.x, mid.y, mid.x + 4, mid.y + 4, PHONE)).toBeNull();
  });

  it("spawns the dice where the player pressed, not at a random rim point", () => {
    const nearTopLeft = throwFromDrag(30, 40, 200, 300, PHONE);
    const nearBottomRight = throwFromDrag(
      PHONE.width - 30,
      PHONE.height - 40,
      200,
      200,
      PHONE
    );
    expect(nearTopLeft).not.toBeNull();
    expect(nearBottomRight).not.toBeNull();
    // Top-left of the screen is +X / -Z; bottom-right is -X / +Z.
    expect(nearTopLeft!.startPosition[0]).toBeGreaterThan(0);
    expect(nearTopLeft!.startPosition[2]).toBeLessThan(0);
    expect(nearBottomRight!.startPosition[0]).toBeLessThan(0);
    expect(nearBottomRight!.startPosition[2]).toBeGreaterThan(0);
  });

  it("spawns above the floor but below the tray walls", () => {
    const thrown = throwFromDrag(mid.x, mid.y, mid.x, mid.y + 150, PHONE)!;
    expect(thrown.startPosition[1]).toBeGreaterThan(0);
    expect(thrown.startPosition[1]).toBeLessThan(8);
  });

  it("throws along the drag direction", () => {
    const cases: Array<[string, number, number, (v: number[]) => void]> = [
      ["down the screen", 0, 150, (v) => expect(v[2]).toBeGreaterThan(0)],
      ["up the screen", 0, -150, (v) => expect(v[2]).toBeLessThan(0)],
      ["right", 150, 0, (v) => expect(v[0]).toBeLessThan(0)],
      ["left", -150, 0, (v) => expect(v[0]).toBeGreaterThan(0)],
    ];
    for (const [, dx, dy, assert] of cases) {
      const thrown = throwFromDrag(mid.x, mid.y, mid.x + dx, mid.y + dy, PHONE)!;
      assert(thrown.velocity);
    }
  });

  it("keeps the throw heading proportional to the drag, independent of length", () => {
    const shortDrag = throwFromDrag(mid.x, mid.y, mid.x + 30, mid.y + 30, PHONE)!;
    const longDrag = throwFromDrag(mid.x, mid.y, mid.x + 150, mid.y + 150, PHONE)!;
    const heading = (v: number[]) => Math.atan2(v[2], v[0]);
    expect(heading(shortDrag.velocity)).toBeCloseTo(heading(longDrag.velocity), 5);
  });

  it("throws harder the further the drag went", () => {
    const speeds = [30, 60, 120, 240].map((d) => {
      const thrown = throwFromDrag(mid.x, mid.y, mid.x, mid.y + d, PHONE)!;
      return Math.hypot(thrown.velocity[0], thrown.velocity[2]);
    });
    for (let i = 1; i < speeds.length; i++) {
      expect(speeds[i]).toBeGreaterThanOrEqual(speeds[i - 1]);
    }
    expect(speeds.at(-1)!).toBeGreaterThan(speeds[0] * 1.5);
  });

  it("always throws with some downward bias so a throw can't skim the tray", () => {
    for (const d of [30, 100, 400]) {
      const thrown = throwFromDrag(mid.x, mid.y, mid.x + d, mid.y, PHONE)!;
      expect(thrown.velocity[1]).toBeLessThan(0);
    }
  });

  it("tumbles about an axis perpendicular to the throw, in the direction of travel", () => {
    const thrown = throwFromDrag(mid.x, mid.y, mid.x, mid.y + 150, PHONE)!;
    const [vx, , vz] = thrown.velocity;
    const [sx, , sz] = thrown.spin;
    // For rolling without slipping, spin ∝ (vz, 0, -vx): perpendicular to the
    // velocity in the XZ plane (zero dot product), not anti-parallel to it.
    expect(vx * sx + vz * sz).toBeCloseTo(0, 5);
    expect(sx).toBeGreaterThan(0); // thrown toward +Z tumbles about +X
  });

  it("spins faster on a harder throw", () => {
    const soft = throwFromDrag(mid.x, mid.y, mid.x + 30, mid.y, PHONE)!;
    const hard = throwFromDrag(mid.x, mid.y, mid.x + 240, mid.y, PHONE)!;
    const mag = (v: number[]) => Math.hypot(...v);
    expect(mag(hard.spin)).toBeGreaterThan(mag(soft.spin));
  });

  // The reason a "full power" throw used to be unreadable: it outran the tray,
  // hit a wall and rebounded, so where the dice ended up said nothing about
  // either the direction or the length of the drag.
  it("budgets even a full-power throw to the room available, so dice don't rebound", () => {
    const limits = trayFloorLimits(PHONE);
    for (const [dx, dy] of [
      [0, 400],
      [0, -400],
      [400, 0],
      [-400, 0],
      [300, 300],
    ]) {
      const thrown = throwFromDrag(mid.x, mid.y, mid.x + dx, mid.y + dy, PHONE)!;
      expect(thrown.power).toBe(1);
      const [vx, , vz] = thrown.velocity;
      const speed = Math.hypot(vx, vz);
      const room = roomInDirection(
        thrown.startPosition[0],
        thrown.startPosition[2],
        vx / speed,
        vz / speed,
        PHONE
      );
      // Travel is the speed budget run backwards through the empirical
      // travel -> speed fit; it should land inside the tray, not past a wall.
      const travel = (speed - 1.4) / 1.5;
      expect(travel).toBeLessThanOrEqual(room + 0.5);
      expect(travel).toBeGreaterThan(0);
      // Sanity: the tray really is much tighter across than along in portrait,
      // which is why a single speed range cannot serve both.
      expect(limits.x).toBeLessThan(limits.z);
    }
  });

  it("throws a cross-tray drag more gently than a lengthwise one, since there is less room", () => {
    const across = throwFromDrag(mid.x, mid.y, mid.x + 400, mid.y, PHONE)!;
    const along = throwFromDrag(mid.x, mid.y, mid.x, mid.y + 400, PHONE)!;
    expect(across.power).toBe(along.power);
    expect(Math.abs(across.velocity[0])).toBeLessThan(Math.abs(along.velocity[2]));
  });

  it("still throws when the player presses against a wall and drags into it", () => {
    const thrown = throwFromDrag(4, mid.y, 4 - 200, mid.y, PHONE);
    expect(thrown).not.toBeNull();
    expect(Math.hypot(thrown!.velocity[0], thrown!.velocity[2])).toBeGreaterThan(0);
  });

  it("reports the same power the aiming UI shows for that drag", () => {
    const thrown = throwFromDrag(mid.x, mid.y, mid.x, mid.y + 90, PHONE)!;
    expect(thrown.power).toBeCloseTo(powerFromDragDistance(90, PHONE), 5);
  });

  it("never spawns dice outside the walls, however far off-tray the press was", () => {
    for (const [px, py] of [
      [-500, -500],
      [PHONE.width + 500, PHONE.height + 500],
      [0, PHONE.height],
    ]) {
      const thrown = throwFromDrag(px, py, px + 120, py + 120, PHONE)!;
      expect(Math.abs(thrown.startPosition[0])).toBeLessThan(4.75);
      expect(Math.abs(thrown.startPosition[2])).toBeLessThan(4.75);
    }
  });
});
