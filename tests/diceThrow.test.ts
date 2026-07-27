import { describe, expect, it } from "vitest";
import {
  HOLD_HEIGHT,
  GRAB_MAX_SPEED,
  TRAY_PHYSICS,
  clampToTrayFloor,
  gentleThrowSpeed,
  holdPointFromPointer,
  powerFromReleaseSpeed,
  throwFromRelease,
  trayFloorLimits,
  trayPointToWorld,
  trayPxPerSecToWorld,
  velocityFromSamples,
  type TraySize,
} from "@/app/misc/diceThrow";

// A portrait, phone-sized tray and a landscape, desktop-sized one - the two
// shapes the modal actually renders at.
const PHONE: TraySize = { width: 390, height: 520 };
const DESKTOP: TraySize = { width: 900, height: 500 };

// Speeds in px/sec that land either side of the drop/throw threshold on the
// phone tray - a slow carry and a real flick.
const CARRY_SPEED = 0.1 * PHONE.height;
const FLICK_SPEED = 4 * PHONE.height;

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

  // The camera is a perspective one looking straight down, so dice held up off
  // the floor are nearer the lens - they have to sit closer to the middle of
  // the tray to stay under the same screen point. Without this the handful
  // visibly drifts away from the pointer toward the tray edges.
  it("pulls a raised point toward the middle, in proportion to its height", () => {
    const px = PHONE.width / 2 + 120;
    const onFloor = trayPointToWorld(px, PHONE.height / 2 + 90, PHONE);
    const raised = trayPointToWorld(px, PHONE.height / 2 + 90, PHONE, HOLD_HEIGHT);
    expect(Math.abs(raised.x)).toBeLessThan(Math.abs(onFloor.x));
    expect(Math.abs(raised.z)).toBeLessThan(Math.abs(onFloor.z));
    // Same proportion on both axes, so a raised point doesn't shear.
    expect(raised.x / onFloor.x).toBeCloseTo(raised.z / onFloor.z, 5);
  });

  it("leaves the middle of the tray put however high the dice are held", () => {
    const raised = trayPointToWorld(PHONE.width / 2, PHONE.height / 2, PHONE, HOLD_HEIGHT);
    expect(raised.x).toBeCloseTo(0);
    expect(raised.z).toBeCloseTo(0);
  });
});

describe("trayPxPerSecToWorld", () => {
  // The conversion a release depends on: a hand crossing the tray in a second
  // is moving the dice across the tray's world depth in a second.
  it("converts a hand speed into the world speed the dice were carried at", () => {
    for (const tray of [PHONE, DESKTOP]) {
      const trayHeightPerSec = trayPxPerSecToWorld(tray.height, tray);
      // The visible floor spans ~9.17 world units top to bottom, less a little
      // for the dice being held nearer the lens than the floor is.
      expect(trayHeightPerSec).toBeGreaterThan(8);
      expect(trayHeightPerSec).toBeLessThan(9.2);
    }
  });

  it("scales linearly and reports a still hand as still", () => {
    expect(trayPxPerSecToWorld(0, PHONE)).toBe(0);
    expect(trayPxPerSecToWorld(600, PHONE)).toBeCloseTo(
      2 * trayPxPerSecToWorld(300, PHONE),
      6
    );
  });

  it("survives a degenerate tray without dividing by zero", () => {
    expect(Number.isFinite(trayPxPerSecToWorld(500, { width: 0, height: 0 }))).toBe(true);
  });
});

// The tray's physics material. The numbers themselves are a feel judgement,
// but two properties are load-bearing and easy to regress by "just tuning".
describe("TRAY_PHYSICS", () => {
  it("keeps damping low enough that a throw doesn't die in flight", () => {
    // Bullet applies v *= (1 - damping)^dt, so damping is the fraction of
    // speed lost per second. dice-box's 0.5 default halved a throw every
    // second in mid-air, which is most of what "the dice carry no momentum"
    // was.
    expect(TRAY_PHYSICS.linearDamping).toBeLessThan(0.15);
    expect(TRAY_PHYSICS.angularDamping).toBeLessThan(0.2);
  });

  it("leaves the dice enough bounce to reach a wall", () => {
    // Bullet multiplies the two bodies' restitution, so this is what a die
    // actually gets off the floor and walls - dice-box's 0.1 default came out
    // at 0.01.
    expect(TRAY_PHYSICS.restitution ** 2).toBeGreaterThan(0.15);
  });

  // dice-box re-derives gravity from its own already-derived value on every
  // updateConfig call, and the tray updates its config on every grab - so
  // setting either of these would make the tray's gravity climb as the player
  // rolls.
  it("sets neither gravity nor mass", () => {
    expect(TRAY_PHYSICS).not.toHaveProperty("gravity");
    expect(TRAY_PHYSICS).not.toHaveProperty("mass");
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

describe("holdPointFromPointer", () => {
  it("holds the dice above the floor but below the tray walls", () => {
    const hold = holdPointFromPointer(100, 100, PHONE);
    expect(hold[1]).toBe(HOLD_HEIGHT);
    expect(hold[1]).toBeGreaterThan(0);
    expect(hold[1]).toBeLessThan(8);
  });

  it("never holds the dice outside the walls, however far off-tray the pointer is", () => {
    for (const [px, py] of [
      [-500, -500],
      [PHONE.width + 500, PHONE.height + 500],
      [0, PHONE.height],
    ]) {
      const hold = holdPointFromPointer(px, py, PHONE);
      expect(Math.abs(hold[0])).toBeLessThan(4.75);
      expect(Math.abs(hold[2])).toBeLessThan(4.75);
    }
  });

  it("follows the pointer across the tray", () => {
    const left = holdPointFromPointer(60, 260, PHONE);
    const right = holdPointFromPointer(330, 260, PHONE);
    // Screen right is world -X.
    expect(right[0]).toBeLessThan(left[0]);
  });
});

describe("velocityFromSamples", () => {
  it("reports no motion for a hand that never moved", () => {
    expect(velocityFromSamples([{ x: 10, y: 10, t: 0 }])).toEqual({ vx: 0, vy: 0 });
    expect(
      velocityFromSamples([
        { x: 10, y: 10, t: 0 },
        { x: 10, y: 10, t: 50 },
      ])
    ).toEqual({ vx: 0, vy: 0 });
  });

  it("measures px/sec over the sampled motion", () => {
    const { vx, vy } = velocityFromSamples([
      { x: 0, y: 0, t: 0 },
      { x: 30, y: -60, t: 50 },
    ]);
    expect(vx).toBeCloseTo(600);
    expect(vy).toBeCloseTo(-1200);
  });

  // The whole reason power is measured this way: a player who carries the dice
  // deliberately across the tray and then lets go is dropping them, not
  // throwing them, however far the hand travelled getting there.
  it("ignores everything before the window, so a long carry doesn't count as a throw", () => {
    const carry: { x: number; y: number; t: number }[] = [];
    for (let t = 0; t <= 800; t += 16) carry.push({ x: t / 2, y: 0, t });
    const flicked = velocityFromSamples([
      ...carry,
      { x: 400, y: -300, t: 830 },
      { x: 500, y: -400, t: 846 },
    ]);
    // The tail is what's left: ~100px in 16ms, not the carry's ~500px/sec.
    expect(Math.hypot(flicked.vx, flicked.vy)).toBeGreaterThan(4000);

    const stopped = velocityFromSamples([...carry, { x: 400, y: 0, t: 1400 }]);
    expect(Math.hypot(stopped.vx, stopped.vy)).toBeLessThan(200);
  });

  it("still measures something when the only samples straddle the window", () => {
    const { vx } = velocityFromSamples([
      { x: 0, y: 0, t: 0 },
      { x: 100, y: 0, t: 500 },
    ]);
    expect(vx).toBeCloseTo(200);
  });
});

describe("powerFromReleaseSpeed", () => {
  it("scores a slow release at zero, so letting go gently is a drop", () => {
    expect(powerFromReleaseSpeed(0, PHONE)).toBe(0);
    expect(powerFromReleaseSpeed(CARRY_SPEED, PHONE)).toBe(0);
  });

  it("ramps up with speed and saturates at 1", () => {
    const slow = powerFromReleaseSpeed(0.6 * PHONE.height, PHONE);
    const brisk = powerFromReleaseSpeed(1.2 * PHONE.height, PHONE);
    expect(slow).toBeGreaterThan(0);
    expect(brisk).toBeGreaterThan(slow);
    expect(powerFromReleaseSpeed(FLICK_SPEED, PHONE)).toBe(1);
  });

  // A flick is a gesture at screen scale, so the same fraction of a tray per
  // second has to mean the same thing on a phone and on a desktop.
  it("scales the ramp to the tray, so the same flick throws about as hard on either", () => {
    const sameFlick = (tray: TraySize) =>
      powerFromReleaseSpeed(tray.height, tray);
    expect(sameFlick(PHONE)).toBeCloseTo(sameFlick(DESKTOP), 5);
  });

  it("puts the fallback's gentle toss inside the throwing range", () => {
    for (const tray of [PHONE, DESKTOP]) {
      const power = powerFromReleaseSpeed(gentleThrowSpeed(tray), tray);
      expect(power).toBeGreaterThan(0);
      expect(power).toBeLessThan(1);
    }
  });
});

describe("throwFromRelease", () => {
  const mid = { x: PHONE.width / 2, y: PHONE.height / 2 };

  it("drops the dice where the hand left them when it was barely moving", () => {
    const dropped = throwFromRelease(mid.x, mid.y, 0, CARRY_SPEED, PHONE);
    expect(dropped.power).toBe(0);
    expect(dropped.velocity).toEqual([0, 0, 0]);
    // No imposed spin either - a dropped die keeps whatever tumble the hand
    // gave it, which is what letting go actually looks like.
    expect(dropped.spin).toBeNull();
  });

  it("lets go of the dice where the hand is, not at a random rim point", () => {
    const nearTopLeft = throwFromRelease(30, 40, 0, FLICK_SPEED, PHONE);
    const nearBottomRight = throwFromRelease(
      PHONE.width - 30,
      PHONE.height - 40,
      0,
      -FLICK_SPEED,
      PHONE
    );
    // Top-left of the screen is +X / -Z; bottom-right is -X / +Z.
    expect(nearTopLeft.startPosition[0]).toBeGreaterThan(0);
    expect(nearTopLeft.startPosition[2]).toBeLessThan(0);
    expect(nearBottomRight.startPosition[0]).toBeLessThan(0);
    expect(nearBottomRight.startPosition[2]).toBeGreaterThan(0);
  });

  it("lets go above the floor but below the tray walls", () => {
    const thrown = throwFromRelease(mid.x, mid.y, 0, FLICK_SPEED, PHONE);
    expect(thrown.startPosition[1]).toBeGreaterThan(0);
    expect(thrown.startPosition[1]).toBeLessThan(8);
  });

  it("throws the way the hand was moving", () => {
    const cases: Array<[number, number, (v: number[]) => void]> = [
      [0, FLICK_SPEED, (v) => expect(v[2]).toBeGreaterThan(0)], // down the screen
      [0, -FLICK_SPEED, (v) => expect(v[2]).toBeLessThan(0)], // up the screen
      [FLICK_SPEED, 0, (v) => expect(v[0]).toBeLessThan(0)], // right
      [-FLICK_SPEED, 0, (v) => expect(v[0]).toBeGreaterThan(0)], // left
    ];
    for (const [vx, vy, assert] of cases) {
      assert(throwFromRelease(mid.x, mid.y, vx, vy, PHONE).velocity);
    }
  });

  it("keeps the throw heading proportional to the hand's, independent of speed", () => {
    const gentle = throwFromRelease(mid.x, mid.y, 400, 400, PHONE);
    const hard = throwFromRelease(mid.x, mid.y, 3000, 3000, PHONE);
    const heading = (v: number[]) => Math.atan2(v[2], v[0]);
    expect(heading(gentle.velocity)).toBeCloseTo(heading(hard.velocity), 5);
  });

  // The headline behaviour: power comes from the hand's speed, nothing else.
  it("throws harder the faster the hand was moving", () => {
    const speeds = [0.4, 0.8, 1.2, 1.8].map((perTrayHeight) => {
      const thrown = throwFromRelease(
        mid.x,
        mid.y,
        0,
        perTrayHeight * PHONE.height,
        PHONE
      );
      return Math.hypot(thrown.velocity[0], thrown.velocity[2]);
    });
    for (let i = 1; i < speeds.length; i++) {
      expect(speeds[i]).toBeGreaterThanOrEqual(speeds[i - 1]);
    }
    expect(speeds.at(-1)!).toBeGreaterThan(speeds[0] * 1.5);
  });

  it("throws with a downward bias so a throw can't skim the tray", () => {
    for (const speed of [0.6, 1.2, 4].map((s) => s * PHONE.height)) {
      expect(throwFromRelease(mid.x, mid.y, speed, 0, PHONE).velocity[1]).toBeLessThan(0);
    }
  });

  it("tumbles about an axis perpendicular to the throw, in the direction of travel", () => {
    const thrown = throwFromRelease(mid.x, mid.y, 0, FLICK_SPEED, PHONE);
    const [vx, , vz] = thrown.velocity;
    const [sx, , sz] = thrown.spin!;
    // For rolling without slipping, spin ∝ (vz, 0, -vx): perpendicular to the
    // velocity in the XZ plane (zero dot product), not anti-parallel to it.
    expect(vx * sx + vz * sz).toBeCloseTo(0, 5);
    expect(sx).toBeGreaterThan(0); // thrown toward +Z tumbles about +X
  });

  it("spins faster on a harder throw", () => {
    const soft = throwFromRelease(mid.x, mid.y, 0.5 * PHONE.height, 0, PHONE);
    const hard = throwFromRelease(mid.x, mid.y, 4 * PHONE.height, 0, PHONE);
    const mag = (v: number[]) => Math.hypot(...v);
    expect(mag(hard.spin!)).toBeGreaterThan(mag(soft.spin!));
  });

  // The headline fix: the dice leave the hand at the speed the hand was
  // carrying them, so nothing about their motion changes at the moment of
  // release. Anything slower reads as the dice hitting an invisible brake -
  // which is exactly what the old travel-distance budget did, capping a phone
  // throw at ~6.7 units/sec against a hand moving at ~7.7.
  it("throws at the speed the hand was already moving the dice", () => {
    for (const perTrayHeight of [0.5, 0.9, 1.4]) {
      const handPx = perTrayHeight * PHONE.height;
      const thrown = throwFromRelease(mid.x, mid.y, 0, handPx, PHONE);
      const speed = Math.hypot(thrown.velocity[0], thrown.velocity[2]);
      const hand = trayPxPerSecToWorld(handPx, PHONE);
      expect(speed).toBeGreaterThanOrEqual(hand);
      // ...and not so much more that the release is a catapult.
      expect(speed).toBeLessThan(hand * 1.5);
    }
  });

  it("never throws faster than the hand could have carried the dice", () => {
    // GRAB_MAX_SPEED is the servo's ceiling while the dice are held, so a
    // release above it would speed them up as they left the hand.
    const wild = throwFromRelease(mid.x, mid.y, 40 * PHONE.height, 0, PHONE);
    expect(Math.hypot(...wild.velocity)).toBeLessThan(GRAB_MAX_SPEED);
  });

  // The tray is much tighter across than along in portrait, and a throw is
  // no longer budgeted against that - the dice reach the wall and bounce off
  // it like dice in a real tray, rather than being launched more softly
  // sideways than forwards for the same flick.
  it("throws a cross-tray flick as hard as a lengthwise one", () => {
    const across = throwFromRelease(mid.x, mid.y, FLICK_SPEED, 0, PHONE);
    const along = throwFromRelease(mid.x, mid.y, 0, FLICK_SPEED, PHONE);
    expect(trayFloorLimits(PHONE).x).toBeLessThan(trayFloorLimits(PHONE).z);
    expect(Math.abs(across.velocity[0])).toBeCloseTo(
      Math.abs(along.velocity[2]),
      5
    );
  });

  it("still throws when the hand lets go against a wall while moving into it", () => {
    const thrown = throwFromRelease(4, mid.y, -FLICK_SPEED, 0, PHONE);
    expect(Math.hypot(thrown.velocity[0], thrown.velocity[2])).toBeGreaterThan(0);
  });

  it("reports the same power powerFromReleaseSpeed does for that hand speed", () => {
    const speed = 1.1 * PHONE.height;
    const thrown = throwFromRelease(mid.x, mid.y, 0, speed, PHONE);
    expect(thrown.power).toBeCloseTo(powerFromReleaseSpeed(speed, PHONE), 5);
  });

  it("never lets go of dice outside the walls, however far off-tray the hand is", () => {
    for (const [px, py] of [
      [-500, -500],
      [PHONE.width + 500, PHONE.height + 500],
      [0, PHONE.height],
    ]) {
      const thrown = throwFromRelease(px, py, FLICK_SPEED, FLICK_SPEED, PHONE);
      expect(Math.abs(thrown.startPosition[0])).toBeLessThan(4.75);
      expect(Math.abs(thrown.startPosition[2])).toBeLessThan(4.75);
    }
  });
});
