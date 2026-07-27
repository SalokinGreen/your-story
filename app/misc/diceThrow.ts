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

/**
 * The tray's physics material, passed to the DiceBox constructor (so it
 * reaches the physics worker's `init`, which is what builds the floor and wall
 * bodies with it).
 *
 * dice-box's own defaults are tuned for dice that drop in and stop, and they
 * are what made a thrown die shed its momentum the instant it left the hand:
 * `linearDamping: 0.5` bleeds half a die's speed every second *in mid-air*
 * (Bullet applies `v *= (1 - damping)^dt`), `angularDamping: 0.4` does the
 * same to its tumble, and `friction: 0.8` on both the die and the floor is
 * grabbier than rubber. Worst of all is `restitution: 0.1`: Bullet takes the
 * *product* of the two bodies' restitution, so die-on-floor came out at 0.01
 * and dice landed like wet clay.
 *
 * Measured on a phone-sized tray (8.5 world units deep), the same flick used
 * to carry the dice ~1.9 units and now carries them ~5.7 - about a third of
 * that gain is the release keeping the hand's speed, the rest is this.
 *
 * The values below are a felt-lined tray: near-zero air drag, enough friction
 * that a die tumbles rather than skates (0.65 * 0.65 ≈ 0.42 combined), and
 * enough bounce to carry a throw across the tray (0.5 * 0.5 = 0.25 combined).
 *
 * `settleTimeout` is the backstop for a die that never quiets down; it is not
 * how long a roll takes. `settleSpeed`/`settleSpin`/`settleSteps` are read by
 * the patched physics worker (scripts/patchDiceBox.mjs) and are what normally
 * ends a roll: a die is done once it has stayed under those speeds for that
 * many physics steps (~0.2s at 90Hz). dice-box's own check - an instantaneous
 * |v| < 0.01 - is tighter than the solver's resting jitter, so it essentially
 * never fired and every roll ran out the full timeout instead, which is why
 * the tray used to sit on motionless dice for five seconds before showing a
 * result.
 *
 * Deliberately no `gravity` or `mass` here, however tempting: dice-box derives
 * both from the raw config on *every* `updateConfig` call, and its worker
 * derives gravity from the already-derived value (`gravity + mass/3`), so
 * setting either one makes gravity creep upward on every config update - and
 * the tray updates its config on every grab.
 */
export const TRAY_PHYSICS = {
  friction: 0.65,
  restitution: 0.5,
  linearDamping: 0.05,
  angularDamping: 0.1,
  settleTimeout: 8000,
  // A fifth of a second under these speeds moves a die by 4% of its own width
  // and turns it by ~4 degrees, so nothing that passes this check can still be
  // on its way to a different face.
  settleSpeed: 0.2,
  settleSpin: 0.35,
  settleSteps: 20,
} as const;

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

// A throw leaves the hand at the speed the hand was moving, converted into
// world units through the same tray geometry the hold point uses. Continuity
// is the whole point: while the dice are held, the physics worker's servo is
// already carrying them at roughly the hand's speed, so *any* other release
// speed shows up as the dice abruptly changing pace at the exact moment the
// player lets go - which is what "the dice don't take on any momentum" looks
// like.
//
// An earlier version spent the throw's power on travel *distance* instead,
// budgeted against the room left in the tray so that even a full-strength
// flick stopped short of the far wall. That made throws legible and dead: on a
// phone tray it capped every throw at ~6.7 units/sec against a hand carrying
// the dice at ~7.7, so letting go was always a deceleration. Dice are supposed
// to reach the walls of a tray; TRAY_PHYSICS above is what makes arriving
// there read as dice bouncing rather than as a glitch.

// Pointer samples are averaged over VELOCITY_WINDOW_MS, which clips the peak
// of a flick - a hand is fastest in the last few ms before it opens. This gain
// puts back roughly what that averaging takes off.
const THROW_GAIN = 1.2;
// Safety clamps, in units/sec. The floor only bites on a degenerate tray -
// powerFromReleaseSpeed's drop threshold already lands near it - and the
// ceiling keeps a wild flick from crossing the tray faster than the physics
// step can resolve it. The ceiling stays below GRAB_MAX_SPEED so that letting
// go can never be *faster* than the hand was able to carry the dice.
const MIN_SPEED = 2.5;
const MAX_SPEED = 24;
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
 * Converts a hand speed in CSS px/sec into world units/sec at hold height -
 * how fast the dice themselves were actually moving while the hand carried
 * them. This is what a release has to preserve for the throw to look like
 * letting go rather than like the dice hitting an invisible brake.
 */
export function trayPxPerSecToWorld(pxPerSec: number, tray: TraySize): number {
  const unitsPerPx = (2 * WORLD_HALF_DEPTH) / Math.max(tray.height, 1);
  return pxPerSec * unitsPerPx * ((CAMERA_HEIGHT - HOLD_HEIGHT) / CAMERA_HEIGHT);
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
 * release: they leave the hand along the drag, carrying the speed the hand was
 * carrying them at, so the moment of letting go is invisible in their motion.
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

  // The dice keep going at the speed the hand was already moving them.
  const speed = Math.min(
    Math.max(trayPxPerSecToWorld(speedPx, tray) * THROW_GAIN, MIN_SPEED),
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
