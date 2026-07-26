// Maps a player's drag gesture on the 3D dice tray onto a physical throw for
// @3d-dice/dice-box: where the dice spawn, which way they fly, how hard, and
// how they tumble. Kept out of the component so the geometry is unit-testable
// (see tests/diceThrow.test.ts) - DiceThrowModal only measures the gesture and
// feeds the result into dice-box's config.
//
// All of the constants below describe dice-box's own fixed scene, derived from
// its bundled worker code and verified by dropping dice at known positions and
// screenshotting the tray:
//
// - The tray camera is a top-down TargetCamera at (0, 36.5, 0) with a 0.25rad
//   *vertical* field of view, so the floor plane always spans
//   ±36.5*tan(0.125) ≈ ±4.59 world units top-to-bottom no matter how big the
//   canvas is, and ±(that * aspect) left-to-right.
// - Screen +x is world -X and screen +y is world +Z (the top-down camera views
//   the physics world mirrored in X).
// - The physics box is `size` (9.5) deep by size*aspect wide, with its walls
//   inset 0.5 from those bounds.

// Half the world-space depth of the tray floor visible on screen.
const WORLD_HALF_DEPTH = 36.5 * Math.tan(0.125);
// dice-box's default `size` config - the depth of the physics box.
const PHYSICS_SIZE = 9.5;
// How far dice-box insets its walls from the box bounds.
const WALL_INSET = 0.5;
// Roughly the half-width of a die at the tray's `scale: 6` (measured: a die at
// rest is ~1.1 world units across). Keeping a die's *centre* this far from a
// wall is the difference between a throw that ends against the wall and one
// that is born intersecting it, which Bullet resolves by flinging it back out.
const DIE_HALF_WIDTH = 0.7;

// A drag shorter than this is a tap, not a throw. In CSS px - a deliberate
// gesture clears it easily on both a mouse and a thumb.
export const MIN_DRAG_PX = 18;
// Full-strength throws have to be reachable *inside the tray*: the dice spawn
// where the player pressed, so the longest drag actually available is roughly
// the distance from there to the far edge. Ramping to full power over a
// fraction of the tray's shorter side keeps the whole power range usable on a
// phone-sized tray as well as a desktop one (a fixed px threshold tuned on
// desktop is unreachable on mobile, which makes power feel like it does
// nothing).
const FULL_POWER_TRAY_FRACTION = 0.45;

// Power is spent on *travel distance*, not on raw launch speed. The tray is
// only ~8.5 world units deep and, in portrait, under 4 wide - a launch speed
// picked to feel strong just slams the dice into a wall, and once they start
// ricocheting neither the drag's direction nor its length is readable in where
// they end up. Budgeting the throw against the room actually available in the
// direction thrown keeps both legible whatever shape the tray is.
//
// The travel -> speed conversion is empirical, measured by launching dice at
// known speeds down the tray and finding where they settled (~0.68 units of
// travel per unit/sec, offset by the ~1.6 units/sec that dies to friction
// before the die goes anywhere).
const SPEED_PER_TRAVEL = 1.5;
const SPEED_BASE = 1.4;
// Travel for the weakest throw that still counts, in world units - enough that
// dice visibly leave the spawn point.
const MIN_TRAVEL = 1;
// Safety clamps, in units/sec: the floor keeps a throw into a nearby wall from
// being a dead drop, the ceiling keeps a pathological tray aspect from
// launching dice hard enough to ricochet.
const MIN_SPEED = 3;
const MAX_SPEED = 16;
// Constant downward bias on every throw. The dice are launched from above the
// floor, and dice-box's box is closed, but sinking them as they fly keeps a
// throw from skimming at spawn height across the whole tray.
const SINK_SPEED = 2.5;
// Height above the floor that dice are launched from - high enough to read as
// a throw rather than a slide, low enough that they land almost immediately.
const SPAWN_HEIGHT = 2.2;
// Angular speed for a body rolling without slipping is |v|/r, so ~1.8|v| for a
// die ~0.55 units in radius. Matching that (rather than exceeding it) matters:
// overspin makes friction *drive* the die forward, which decouples how far it
// travels from how hard it was thrown.
//
// There is deliberately no floor on this. A gentle throw barely turns the die
// over, but that doesn't bias the result: dice-box spawns every die with a
// randomized orientation (a random quaternion in its createRigidBody), so the
// starting face is already random before the physics runs. Forcing extra spin
// would only make friction drive the die further than the throw asked for.
const SPIN_PER_SPEED = 1.8;
// Extra yaw (spin about the vertical axis) as a fraction of the tumble rate,
// so dice twist as they travel instead of rolling like a wheel.
const YAW_FRACTION = 0.25;

/** The dice tray's on-screen size, in CSS px. */
export interface TraySize {
  width: number;
  height: number;
}

export type Vector3 = [number, number, number];

export interface DiceThrow {
  /** dice-box `startPosition`: where the dice are launched from. */
  startPosition: Vector3;
  /** dice-box `customThrowVelocity` (patched in): initial linear velocity. */
  velocity: Vector3;
  /** dice-box `customThrowSpin` (patched in): initial angular velocity. */
  spin: Vector3;
  /** 0..1 gesture strength, for the aiming UI. */
  power: number;
}

/**
 * Converts a point in tray-local CSS px into the tray's world-space X/Z.
 */
export function trayPointToWorld(
  px: number,
  py: number,
  tray: TraySize
): { x: number; z: number } {
  // The camera's fov is vertical-fixed, so both axes scale by the tray's
  // *height* - which is exactly why the horizontal extent is aspect-scaled.
  const unitsPerPx = (2 * WORLD_HALF_DEPTH) / tray.height;
  return {
    x: -(px - tray.width / 2) * unitsPerPx,
    z: (py - tray.height / 2) * unitsPerPx,
  };
}

/**
 * Half-extents of the region a die's centre can occupy: dice-box's physics box
 * (`size` deep by `size * aspect` wide), less its wall inset and the die's own
 * half-width.
 */
export function trayFloorLimits(tray: TraySize): { x: number; z: number } {
  const aspect = tray.height > 0 ? tray.width / tray.height : 1;
  const limit = (extent: number) =>
    Math.max(extent / 2 - WALL_INSET - DIE_HALF_WIDTH, 0);
  return { x: limit(PHYSICS_SIZE * aspect), z: limit(PHYSICS_SIZE) };
}

/**
 * Pulls a world-space X/Z inside the walls of dice-box's physics box, leaving
 * room for the die itself.
 */
export function clampToTrayFloor(
  x: number,
  z: number,
  tray: TraySize
): { x: number; z: number } {
  const limit = trayFloorLimits(tray);
  return {
    x: Math.min(Math.max(x, -limit.x), limit.x),
    z: Math.min(Math.max(z, -limit.z), limit.z),
  };
}

/**
 * How far a die launched from `(x, z)` can travel along the unit direction
 * `(dirX, dirZ)` before it reaches a wall. This is the throw's budget: spending
 * full power on exactly this distance lands a full-strength throw against the
 * far wall instead of ricocheting off it.
 */
export function roomInDirection(
  x: number,
  z: number,
  dirX: number,
  dirZ: number,
  tray: TraySize
): number {
  const limit = trayFloorLimits(tray);
  // Standard ray/box exit distance, per axis, ignoring axes the throw doesn't
  // move along.
  const along = (pos: number, dir: number, max: number) => {
    if (Math.abs(dir) < 1e-6) return Infinity;
    return Math.max((dir > 0 ? max - pos : -max - pos) / dir, 0);
  };
  return Math.min(along(x, dirX, limit.x), along(z, dirZ, limit.z));
}

/**
 * How hard a drag of `distancePx` throws, as 0..1. Scaled to the tray so the
 * full range is reachable whatever size the tray is rendered at.
 */
export function powerFromDragDistance(
  distancePx: number,
  tray: TraySize
): number {
  const fullPowerPx = Math.max(
    Math.min(tray.width, tray.height) * FULL_POWER_TRAY_FRACTION,
    MIN_DRAG_PX + 1
  );
  const ramp = (distancePx - MIN_DRAG_PX) / (fullPowerPx - MIN_DRAG_PX);
  return Math.min(Math.max(ramp, 0), 1);
}

/**
 * Builds the throw for a drag from `(startX, startY)` to `(endX, endY)`, both
 * in tray-local CSS px: the dice launch from where the player pressed, travel
 * along the drag, and travel further the further they dragged.
 *
 * Returns null for a gesture too short to count as a throw.
 */
export function throwFromDrag(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  tray: TraySize
): DiceThrow | null {
  const dx = endX - startX;
  const dy = endY - startY;
  const distance = Math.hypot(dx, dy);
  if (distance < MIN_DRAG_PX) return null;

  const power = powerFromDragDistance(distance, tray);

  // Screen +x is world -X, screen +y is world +Z.
  const dirX = -dx / distance;
  const dirZ = dy / distance;

  // The dice launch from the point the player pressed.
  const pressed = trayPointToWorld(startX, startY, tray);
  const spawn = clampToTrayFloor(pressed.x, pressed.z, tray);

  // Spend the drag's power on distance: a nudge at the low end, right up
  // against the far wall at full strength. `reach` guards the case where the
  // player pressed next to a wall and threw straight at it, leaving no room -
  // the throw is then a short bump rather than nothing at all.
  const reach = Math.max(
    roomInDirection(spawn.x, spawn.z, dirX, dirZ, tray),
    MIN_TRAVEL
  );
  const travel = MIN_TRAVEL + power * (reach - MIN_TRAVEL);
  const speed = Math.min(
    Math.max(SPEED_BASE + travel * SPEED_PER_TRAVEL, MIN_SPEED),
    MAX_SPEED
  );

  const vx = dirX * speed;
  const vz = dirZ * speed;
  // A body rolling without slipping along (vx, 0, vz) spins about
  // (vz, 0, -vx)/r - Ammo's world is right-handed with +Y up, so this is what
  // makes dice tumble *forwards* along the throw rather than backspin.
  const tumble = speed * SPIN_PER_SPEED;
  return {
    startPosition: [spawn.x, SPAWN_HEIGHT, spawn.z],
    velocity: [vx, -SINK_SPEED, vz],
    spin: [dirZ * tumble, tumble * YAW_FRACTION, -dirX * tumble],
    power,
  };
}
