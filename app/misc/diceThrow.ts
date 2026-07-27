// Maps a player's grab-and-throw gesture on the 3D dice tray onto physical
// state for @3d-dice/dice-box: where the dice are held while the pointer drags
// them around, and how they leave the hand when it lets go. Kept out of the
// component so the geometry is unit-testable (see tests/diceThrow.test.ts) -
// DiceThrowModal only measures the gesture and feeds the result into dice-box.
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

// Height of dice-box's camera above the tray floor. Dice held up off the floor
// sit closer to the lens than the floor does, so the screen point under the
// pointer maps to a *smaller* world offset the higher they are held - see
// trayPointToWorld's `height`.
const CAMERA_HEIGHT = 36.5;
// Half the world-space depth of the tray floor visible on screen.
const WORLD_HALF_DEPTH = CAMERA_HEIGHT * Math.tan(0.125);
// dice-box's default `size` config - the depth of the physics box.
const PHYSICS_SIZE = 9.5;
// How far dice-box insets its walls from the box bounds.
const WALL_INSET = 0.5;
// Roughly the half-width of a die at the tray's `scale: 6` (measured: a die at
// rest is ~1.1 world units across). Keeping a die's *centre* this far from a
// wall is the difference between a throw that ends against the wall and one
// that is born intersecting it, which Bullet resolves by flinging it back out.
const DIE_HALF_WIDTH = 0.7;

// How high above the floor the dice ride while the player is dragging them.
// High enough that they read as held rather than shoved along the felt, low
// enough that letting go is a short drop rather than a long fall.
export const HOLD_HEIGHT = 3;
// How hard the physics worker's servo pulls a held die toward the hand, in
// 1/sec: the die's velocity each step is (target - position) * this. High
// enough to track a fast drag, low enough that the dice lag and swing behind
// the pointer like a real handful instead of being nailed to it.
export const GRAB_STIFFNESS = 14;
// Ceiling on that servo velocity, in units/sec, so yanking the pointer across
// the tray can't fire the dice through a wall.
export const GRAB_MAX_SPEED = 40;
// How far apart, in world units, the held dice are spaced around the hand.
// Every die in a roll spawns at the same startPosition, so without a spread
// they would be born inside each other; this is also what makes a handful
// look like a handful.
export const GRAB_SPREAD = 1.5;

// Below this release speed the throw is a drop: the dice simply let go and
// fall where the hand left them. In tray-heights per second, so the same flick
// means the same thing on a phone tray and a desktop one.
const MIN_RELEASE_TRAY_HEIGHTS_PER_SEC = 0.25;
// ...and at this speed the throw is at full strength. A hard flick clears it
// easily; a deliberate carry across the tray does not.
const FULL_RELEASE_TRAY_HEIGHTS_PER_SEC = 2;

// How far back from the release to measure the hand's speed. Long enough to
// smooth out jittery pointer sampling, short enough that only the last flick
// counts - drag the dice around for a second and then stop dead, and they drop
// rather than remembering the motion.
export const VELOCITY_WINDOW_MS = 90;

// Power is spent on *travel distance*, not on raw launch speed. The tray is
// only ~8.5 world units deep and, in portrait, under 4 wide - a launch speed
// picked to feel strong just slams the dice into a wall, and once they start
// ricocheting neither the throw's direction nor its strength is readable in
// where they end up. Budgeting the throw against the room actually available
// in the direction thrown keeps both legible whatever shape the tray is.
//
// The travel -> speed conversion is empirical, measured by launching dice at
// known speeds down the tray and finding where they settled (~0.68 units of
// travel per unit/sec, offset by the ~1.6 units/sec that dies to friction
// before the die goes anywhere).
const SPEED_PER_TRAVEL = 1.5;
const SPEED_BASE = 1.4;
// Travel for the weakest throw that still counts, in world units - enough that
// dice visibly leave the hand.
const MIN_TRAVEL = 1;
// Safety clamps, in units/sec: the floor keeps a throw into a nearby wall from
// being a dead drop, the ceiling keeps a pathological tray aspect from
// launching dice hard enough to ricochet.
const MIN_SPEED = 3;
const MAX_SPEED = 16;
// Constant downward bias on a thrown (not dropped) release, so a hard throw
// drives the dice down onto the felt instead of skimming at hand height across
// the whole tray.
const SINK_SPEED = 2.5;
// Angular speed for a body rolling without slipping is |v|/r, so ~1.8|v| for a
// die ~0.55 units in radius. Matching that (rather than exceeding it) matters:
// overspin makes friction *drive* the die forward, which decouples how far it
// travels from how hard it was thrown.
//
// There is deliberately no floor on this. A gentle throw barely turns the die
// over, but that doesn't bias the result: dice-box spawns every die with a
// randomized orientation (a random quaternion in its createRigidBody), so the
// starting face is already random before the physics runs, and a dropped die
// keeps whatever tumble it picked up being jostled around in the hand.
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
  /**
   * dice-box `startPosition`: where dice that have not spawned yet are born.
   * Dice already in hand are thrown from wherever the hand actually left them.
   */
  startPosition: Vector3;
  /** Initial linear velocity for every die let go of. */
  velocity: Vector3;
  /**
   * Initial angular velocity, or null to leave the dice tumbling however the
   * hand left them - which is what a drop should look like.
   */
  spin: Vector3 | null;
  /** 0..1 gesture strength. 0 is a drop, 1 is as hard as the tray allows. */
  power: number;
}

/** A pointer position and the time it was sampled at, in CSS px and ms. */
export interface PointerSample {
  x: number;
  y: number;
  t: number;
}

/**
 * Converts a point in tray-local CSS px into the tray's world-space X/Z, at a
 * given height above the floor.
 *
 * The camera is a perspective one looking straight down, so a die held at
 * `height` is nearer the lens than the floor is: to stay under the same screen
 * point it has to sit proportionally closer to the middle of the tray. Without
 * that correction held dice visibly drift away from the pointer toward the
 * edges of the tray.
 */
export function trayPointToWorld(
  px: number,
  py: number,
  tray: TraySize,
  height = 0
): { x: number; z: number } {
  // The camera's fov is vertical-fixed, so both axes scale by the tray's
  // *height* - which is exactly why the horizontal extent is aspect-scaled.
  const unitsPerPx = (2 * WORLD_HALF_DEPTH) / tray.height;
  const perspective = (CAMERA_HEIGHT - height) / CAMERA_HEIGHT;
  return {
    x: -(px - tray.width / 2) * unitsPerPx * perspective,
    z: (py - tray.height / 2) * unitsPerPx * perspective,
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
 * How far a die let go at `(x, z)` can travel along the unit direction
 * `(dirX, dirZ)` before it reaches a wall. This is the throw's budget:
 * spending full power on exactly this distance lands a full-strength throw
 * against the far wall instead of ricocheting off it.
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
 * Where the hand should hold the dice for a pointer at `(px, py)` in
 * tray-local CSS px: inside the walls, at hold height.
 */
export function holdPointFromPointer(
  px: number,
  py: number,
  tray: TraySize
): Vector3 {
  const at = trayPointToWorld(px, py, tray, HOLD_HEIGHT);
  const inside = clampToTrayFloor(at.x, at.z, tray);
  return [inside.x, HOLD_HEIGHT, inside.z];
}

/**
 * How hard a release at `pxPerSec` throws, as 0..1. Scaled to the tray so the
 * same flick means the same thing whatever size the tray is rendered at, and
 * deliberately zero at the bottom: letting go slowly is a drop, not a weak
 * throw.
 */
export function powerFromReleaseSpeed(
  pxPerSec: number,
  tray: TraySize
): number {
  const perTrayHeight = pxPerSec / Math.max(tray.height, 1);
  const ramp =
    (perTrayHeight - MIN_RELEASE_TRAY_HEIGHTS_PER_SEC) /
    (FULL_RELEASE_TRAY_HEIGHTS_PER_SEC - MIN_RELEASE_TRAY_HEIGHTS_PER_SEC);
  return Math.min(Math.max(ramp, 0), 1);
}

/**
 * A soft but real throw speed for this tray, in CSS px/sec.
 *
 * Only needed where the dice can't be held (see diceControlChannel): a true
 * drop relies on the hand having already spread the dice out, so without one
 * the whole handful would be born at a single point with no velocity to
 * separate them. The softest release still gets a gentle toss instead.
 */
export function gentleThrowSpeed(tray: TraySize): number {
  return FULL_RELEASE_TRAY_HEIGHTS_PER_SEC * 0.45 * tray.height;
}

/**
 * The hand's speed at the moment it let go, in CSS px/sec, measured over the
 * last `windowMs` of pointer samples rather than the whole drag - what the
 * throw should carry is the final flick, not the average of a long carry.
 *
 * Samples are assumed to be in chronological order, with the release itself
 * appended as the last one. A hand that stopped moving before letting go
 * reports a low speed for free: its last two samples are far apart in time.
 */
export function velocityFromSamples(
  samples: PointerSample[],
  windowMs = VELOCITY_WINDOW_MS
): { vx: number; vy: number } {
  if (samples.length < 2) return { vx: 0, vy: 0 };

  const end = samples[samples.length - 1];
  // Walk back to the oldest sample still inside the window, but never past
  // having two samples to measure between.
  let first = samples.length - 1;
  while (first > 0 && end.t - samples[first - 1].t <= windowMs) first--;
  if (first === samples.length - 1) first = samples.length - 2;

  const start = samples[first];
  const dt = end.t - start.t;
  if (dt <= 0) return { vx: 0, vy: 0 };
  return { vx: ((end.x - start.x) * 1000) / dt, vy: ((end.y - start.y) * 1000) / dt };
}

/**
 * Builds the throw for letting go at `(px, py)` in tray-local CSS px while the
 * hand was moving at `(vxPxPerSec, vyPxPerSec)`.
 *
 * Slow release: the dice simply fall out of the hand where it left them. Fast
 * release: they are thrown the way the hand was moving, as hard as it was
 * moving - budgeted so that even a full-strength flick spends itself on the
 * room available rather than rebounding off the far wall.
 */
export function throwFromRelease(
  px: number,
  py: number,
  vxPxPerSec: number,
  vyPxPerSec: number,
  tray: TraySize
): DiceThrow {
  const startPosition = holdPointFromPointer(px, py, tray);
  const speedPx = Math.hypot(vxPxPerSec, vyPxPerSec);
  const power = powerFromReleaseSpeed(speedPx, tray);

  if (power <= 0) {
    // A drop. No launch velocity at all, and no imposed spin either - the dice
    // keep whatever tumble they picked up jostling around in the hand, which
    // reads far more like letting go than a stage-managed spin would.
    return { startPosition, velocity: [0, 0, 0], spin: null, power: 0 };
  }

  // Screen +x is world -X, screen +y is world +Z.
  const dirX = -vxPxPerSec / speedPx;
  const dirZ = vyPxPerSec / speedPx;

  // Spend the release's power on distance: a nudge at the low end, right up
  // against the far wall at full strength. `reach` guards the case where the
  // player let go next to a wall while moving at it, leaving no room - the
  // throw is then a short bump rather than nothing at all.
  const reach = Math.max(
    roomInDirection(startPosition[0], startPosition[2], dirX, dirZ, tray),
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
    startPosition,
    velocity: [vx, -SINK_SPEED, vz],
    spin: [dirZ * tumble, tumble * YAW_FRACTION, -dirX * tumble],
    power,
  };
}
