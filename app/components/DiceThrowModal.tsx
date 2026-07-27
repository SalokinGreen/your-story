"use client";

import React, { useEffect, useRef, useState } from "react";
import type DiceBox from "@3d-dice/dice-box";
import type { DieResult, RollNotation } from "@3d-dice/dice-box";
import type { DiceThrowRequest } from "../misc/gmExecutor";
import { colorsForGroups } from "../misc/diceColors";
import { DiceControlChannel } from "../misc/diceControlChannel";
import {
  GRAB_MAX_SPEED,
  GRAB_SPREAD,
  GRAB_STIFFNESS,
  gentleThrowSpeed,
  holdPointFromPointer,
  throwFromRelease,
  velocityFromSamples,
  type PointerSample,
  type TraySize,
} from "../misc/diceThrow";
import { DynamicIcon } from "./DynamicIcon";

interface DiceThrowModalProps {
  // The pending physical dice request, or null when nothing is being asked
  request: DiceThrowRequest | null;
  // Called with the settled face values - one array per requested group, in
  // the same order - or null if the player skipped, in which case the GM
  // executor falls back to a fully digital roll.
  onResolve: (faces: number[][] | null) => void;
}

// dice-box ships models for these standard die sizes only. A formula can
// technically ask for other sides (e.g. "1d3" from a homebrew mechanics
// note) - those can't be thrown physically, so fall straight back to a
// digital roll rather than showing a tray that can't render the die.
const SUPPORTED_SIDES = new Set([4, 6, 8, 10, 12, 20, 100]);

/**
 * Every group in a request is thrown together, so dice-box gets one notation
 * entry per group. Objects rather than "2d6" strings, because that is the only
 * form that carries a per-pool `themeColor` - which is what puts the d6 and
 * the d10s of "1d6+2d10" in the tray as visibly different dice. The colour
 * rides along on the die objects dice-box hands back, so it survives a reroll.
 *
 * Fresh objects every call: dice-box writes its own bookkeeping (`rolls`,
 * `id`) onto the notation it is given.
 */
function notationFor(
  groups: { sides: number; count: number }[],
  colors: string[]
): RollNotation[] {
  return groups.map((group, i) => ({
    qty: group.count,
    sides: group.sides,
    themeColor: colors[i],
  }));
}

/**
 * Regroups dice-box's flat results back into one face array per requested
 * group, so "2d6+1d4" comes home as [[3, 5], [2]] rather than one merged
 * list. Every die carries the groupId of the notation entry it came from, so
 * bucketing by that in first-seen order lines the results up with the
 * requested groups.
 *
 * If the groupIds don't come back cleanly (an older dice-box, or a reroll
 * that reshuffled them), fall back to matching each requested group against
 * dice of the same size - the sizes are what the caller actually needs to be
 * right, since a group short of faces fails the roll in rollDiceGroupAsync.
 */
function splitFacesByGroup(
  groups: { sides: number; count: number }[],
  results: DieResult[]
): number[][] {
  const buckets = new Map<number, number[]>();
  for (const die of results) {
    if (typeof die.groupId !== "number") continue;
    const bucket = buckets.get(die.groupId);
    if (bucket) bucket.push(die.value);
    else buckets.set(die.groupId, [die.value]);
  }

  const byGroupId = [...buckets.values()];
  const groupIdsUsable =
    byGroupId.length === groups.length &&
    groups.every((group, i) => byGroupId[i].length >= group.count);
  if (groupIdsUsable) return byGroupId;

  const remaining = [...results];
  return groups.map((group) => {
    const faces: number[] = [];
    for (let i = 0; i < group.count; i++) {
      const at = remaining.findIndex((r) => Number(r.sides) === group.sides);
      // Take the next die of any size rather than leaving the group short.
      const die = remaining.splice(at === -1 ? 0 : at, 1)[0];
      if (die) faces.push(die.value);
    }
    return faces;
  });
}

interface DragState {
  // Which pointer owns the gesture, so a second finger landing on the tray
  // mid-drag can't hijack or cancel it.
  pointerId: number;
  // The tray's position and size in CSS px, captured at press so pointer
  // positions can be made tray-local without re-measuring every move.
  rectLeft: number;
  rectTop: number;
  tray: TraySize;
  // Recent pointer positions, oldest first. Only the tail matters (see
  // velocityFromSamples), but keeping the drag is cheap and makes the release
  // measurement independent of how the browser batches move events.
  samples: PointerSample[];
  // Resolves true once the dice are actually in hand: the press has to close
  // the hand and start the roll before a release can throw anything, and a
  // fast tap can beat that. False means the tray is running without the held
  // phase and the release has to throw the dice itself.
  ready: Promise<boolean>;
  // Latest hand position waiting to be sent to the physics worker, coalesced
  // to one message per frame - pointermove can fire well above frame rate.
  pendingTarget: [number, number, number] | null;
  frame: number | null;
  // Set when the gesture is torn down rather than completed (skip, close, a
  // new request) - distinct from simply having been released, which still
  // wants the throw to go through.
  abandoned: boolean;
}

// The gesture drives the throw completely: press and the dice are in your
// hand, drag and they follow it around the tray, let go and they leave the
// hand as fast as it was moving. See app/misc/diceThrow.ts for the screen ->
// tray-world geometry, app/misc/diceControlChannel.ts for the channel into the
// physics worker, and scripts/patchDiceBox.mjs for the worker patch that makes
// holding a die possible at all.
//
// Power is how FAST the hand was moving when it let go, measured over the last
// ~90ms rather than the whole drag: carry the dice slowly across the tray and
// they drop where you left them, flick and they fly. Two earlier versions got
// this wrong in opposite directions - dice-box's own throwForce/spinForce
// couldn't work at all (it respawns dice at a *random* rim point and aims them
// inward from there, so the gesture's direction was ignored outright), and
// scaling power by drag *distance* meant a long, careful carry across the tray
// threw as hard as a flick.

type Phase = "loading" | "ready" | "held" | "rolling" | "settled";

/**
 * Physical dice mode: the GM's formula_roll/opposed_formula rolls can be
 * thrown on a 3D dice tray instead of resolved silently. The dice drop into
 * the tray as soon as it opens and sit there at rest; press anywhere and they
 * come into your hand, drag and they follow the pointer - knocking against
 * each other and the walls, since they are the real physics bodies, not a
 * preview - and on release they leave the hand along the drag, as hard as the
 * hand was moving. The result comes from @3d-dice/dice-box's real physics.
 *
 * Every pool in the roll is thrown in the same toss: "2d6+1d4" puts three
 * dice in the tray at once, and Starforged's 1d6 action die lands alongside
 * its 2d10 challenge dice - the way a real handful works. Each pool gets its
 * own colour (app/misc/diceColors.ts) so a mixed handful can be read at a
 * glance, and faces are split back out per pool on the way home
 * (splitFacesByGroup).
 *
 * The dice-box/Babylon.js instance is created once and kept alive across
 * requests (re-initializing WebGL/physics per roll would be slow and
 * janky) - only the overlay UI mounts/unmounts per request.
 */
export default function DiceThrowModal({
  request,
  onResolve,
}: DiceThrowModalProps) {
  const diceBoxRef = useRef<DiceBox | null>(null);
  const initPromiseRef = useRef<Promise<DiceBox> | null>(null);
  // The channel into the physics worker, or null where the dice can't be held
  // (no BroadcastChannel, or an unpatched dice-box) - see onPointerUp for the
  // throw-on-release fallback that covers that case.
  const controlRef = useRef<DiceControlChannel | null>(null);
  const dragRef = useRef<DragState | null>(null);
  // The roll started when the hand closed. It resolves with the settled faces
  // once the thrown dice come to rest, so the release doesn't start a roll of
  // its own - it just opens the hand and waits on this.
  const rollPromiseRef = useRef<Promise<DieResult[]> | null>(null);
  // Guards against a stale throw resolving after the request changed
  // (e.g. the player skipped while dice were mid-air) or the modal closed.
  const requestTokenRef = useRef(0);

  const [phase, setPhase] = useState<Phase>("loading");
  // Settled faces per requested group, matching DiceThrowRequest.groups.
  const [settledFaces, setSettledFaces] = useState<number[][] | null>(null);

  // One colour per pool, stable for as long as this request is on screen.
  const groups = request?.groups;
  const colors = React.useMemo(
    () => colorsForGroups(groups ?? []),
    [groups]
  );

  async function getDiceBox(): Promise<DiceBox> {
    if (diceBoxRef.current) return diceBoxRef.current;
    if (!initPromiseRef.current) {
      initPromiseRef.current = (async () => {
        const { default: DiceBoxCtor } = await import("@3d-dice/dice-box");
        const box = new DiceBoxCtor({
          container: "#dice-throw-canvas",
          assetPath: "/assets/",
          theme: "default",
          scale: 6,
        });
        await box.init();
        diceBoxRef.current = box;
        // Only meaningful once the physics worker exists, which is what init()
        // waits on.
        controlRef.current = await DiceControlChannel.open();
        return box;
      })();
    }
    return initPromiseRef.current;
  }

  // Abandons any gesture in progress and makes sure the physics worker's hand
  // is open again. Whether the hand is closed is worker state that outlives a
  // single request, so this has to run on every way a throw can end early -
  // otherwise the next roll's dice spawn held and never fall.
  const abandonGesture = () => {
    const drag = dragRef.current;
    if (drag) {
      drag.abandoned = true;
      if (drag.frame !== null) cancelAnimationFrame(drag.frame);
      dragRef.current = null;
    }
    rollPromiseRef.current = null;
    controlRef.current?.openHand();
  };

  useEffect(() => {
    if (!request) return;

    const token = ++requestTokenRef.current;
    setSettledFaces(null);

    if (
      request.groups.length === 0 ||
      !request.groups.every((g) => SUPPORTED_SIDES.has(g.sides))
    ) {
      // Can't render one of these die types - skip straight to a digital
      // fallback rather than showing a tray that can't display the roll.
      // All-or-nothing on purpose: half the handful thrown physically and
      // half rolled in code would be worse than either.
      onResolve(null);
      return;
    }

    setPhase("loading");
    rollPromiseRef.current = null;
    getDiceBox()
      .then(async (diceBox) => {
        if (requestTokenRef.current !== token) return;
        // dice-box only reads the container's real size for its physics
        // worker's bounds during init() - the Babylon camera/canvas itself
        // stays at whatever size it last measured until dice-box's own
        // (already correct) window "resize" handler fires. The tray's
        // layout can differ from that (default 300x150 on the very first
        // load, or a different height once the header/footer chrome is
        // back for a later roll), so nudge it every time the tray opens
        // rather than waiting on an incidental real resize.
        window.dispatchEvent(new Event("resize"));
        // Let the resize handler's debounce and the resulting layout pass
        // land before dice spawn in, so they drop into a correctly-sized
        // tray instead of the stale/default bounds.
        await new Promise(requestAnimationFrame);
        if (requestTokenRef.current !== token) return;

        // Belt and braces: a hand left closed by a gesture that ended badly
        // would make the spawn-in below hang, since held dice never settle.
        controlRef.current?.openHand();

        // Show the dice sitting in the tray before the player does anything -
        // a gentle toss-in (soft force so they settle near the middle rather
        // than scattering to the corners). This is what the player picks up:
        // pressing re-rolls the same pools into their hand, so the colours and
        // the size of the handful are readable before committing to a throw.
        await diceBox.updateConfig({
          throwForce: 2.5,
          spinForce: 3,
          startPosition: null,
          customThrowVelocity: null,
          customThrowSpin: null,
        });
        await diceBox.roll(notationFor(request.groups, colors));
        if (requestTokenRef.current !== token) return;
        setPhase("ready");
      })
      .catch((err) => {
        // WebGL/asset load failure, etc - don't hang the GM loop waiting
        // for a tray that will never render, fall back to a digital roll.
        console.error("[DiceThrowModal] failed to load dice-box:", err);
        if (requestTokenRef.current === token) onResolve(null);
      });

    // Runs however the request ends - the throw resolving, the player
    // skipping, a new request replacing this one.
    return () => {
      // Reading the ref at cleanup time is the point here, not a stale-capture
      // bug: this is a counter that invalidates whatever is still in flight,
      // so it has to be bumped from its current value.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      requestTokenRef.current++;
      abandonGesture();
    };
    // onResolve is a fresh closure each render from page.tsx - only
    // request identity should re-trigger this setup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  useEffect(() => {
    return () => {
      abandonGesture();
      controlRef.current?.close();
      controlRef.current = null;
    };
  }, []);

  const localPoint = (drag: DragState, e: React.PointerEvent) => ({
    x: e.clientX - drag.rectLeft,
    y: e.clientY - drag.rectTop,
  });

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (phase !== "ready" || dragRef.current || !request) return;
    // Capture so the gesture keeps reporting once the finger/cursor leaves the
    // tray - a throw aimed at an edge naturally overshoots past it, and
    // without capture the drag would silently die at the boundary.
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    const tray: TraySize = { width: rect.width, height: rect.height };
    const at = { x: e.clientX - rect.left, y: e.clientY - rect.top };

    const token = requestTokenRef.current;
    const drag: DragState = {
      pointerId: e.pointerId,
      rectLeft: rect.left,
      rectTop: rect.top,
      tray,
      samples: [{ x: at.x, y: at.y, t: e.timeStamp }],
      pendingTarget: null,
      frame: null,
      abandoned: false,
      // Filled in immediately below - it reads `drag`, so it can't be part of
      // the literal that defines it.
      ready: Promise.resolve(false),
    };
    // Closing the hand and starting the roll are both async, and a quick tap
    // can release before either lands - so the release awaits this rather than
    // guessing.
    drag.ready = (async () => {
      const diceBox = await getDiceBox();
      const control = controlRef.current;
      if (!control || drag.abandoned || requestTokenRef.current !== token) {
        return false;
      }

      const hold = holdPointFromPointer(at.x, at.y, tray);
      const grabbed = await control.grab(hold, {
        stiffness: GRAB_STIFFNESS,
        maxSpeed: GRAB_MAX_SPEED,
        spread: GRAB_SPREAD,
      });
      if (!grabbed) return false;
      // The gesture can be torn down while the grab is in flight, and by then
      // the hand is closed - open it back up rather than leaving it shut for
      // the next roll.
      if (drag.abandoned || requestTokenRef.current !== token) {
        control.openHand();
        return false;
      }

      // The dice are born where the hand is. `newStartPoint: false` is what
      // makes that stick - dice-box otherwise overwrites startPosition with
      // a random point on the tray rim just before spawning.
      await diceBox.updateConfig({ startPosition: hold });
      rollPromiseRef.current = diceBox.roll(notationFor(request.groups, colors), {
        newStartPoint: false,
      });
      return true;
    })().catch((err) => {
      console.error("[DiceThrowModal] could not pick up the dice:", err);
      // The hand may have closed before whatever failed - leaving it shut
      // would make the release's fallback roll spawn dice that never fall.
      controlRef.current?.openHand();
      return false;
    });
    dragRef.current = drag;
    setPhase("held");
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const at = localPoint(drag, e);
    drag.samples.push({ x: at.x, y: at.y, t: e.timeStamp });
    // Only the last VELOCITY_WINDOW_MS of the drag decides the throw, but a
    // few frames of slack keeps the estimate stable when moves batch up.
    if (drag.samples.length > 32) drag.samples.splice(0, drag.samples.length - 32);

    drag.pendingTarget = holdPointFromPointer(at.x, at.y, drag.tray);
    if (drag.frame !== null) return;
    drag.frame = requestAnimationFrame(() => {
      drag.frame = null;
      if (dragRef.current !== drag || !drag.pendingTarget) return;
      controlRef.current?.move(drag.pendingTarget);
    });
  };

  const throwDice = async (drag: DragState, at: { x: number; y: number }) => {
    const { vx, vy } = velocityFromSamples(drag.samples);
    const thrown = throwFromRelease(at.x, at.y, vx, vy, drag.tray);
    if (!request) return;

    setPhase("rolling");
    const token = requestTokenRef.current;
    try {
      const held = await drag.ready;
      const diceBox = await getDiceBox();
      if (requestTokenRef.current !== token) return;

      let results: DieResult[];
      if (held && controlRef.current && rollPromiseRef.current) {
        // The roll has been running since the hand closed - opening the hand
        // is the whole throw, and the promise resolves when the dice settle.
        controlRef.current.release({
          position: thrown.startPosition,
          velocity: thrown.velocity,
          spin: thrown.spin,
        });
        results = await rollPromiseRef.current;
      } else {
        // No held phase available, so the dice have to be thrown into the tray
        // from scratch. A drop isn't an option here: with nothing to have
        // spread the handful out first, every die would be born at the same
        // point with no velocity to separate them, so the softest release
        // still gets a gentle toss.
        const soft =
          thrown.power > 0
            ? thrown
            : throwFromRelease(at.x, at.y, 0, gentleThrowSpeed(drag.tray), drag.tray);
        await diceBox.updateConfig({
          startPosition: soft.startPosition,
          customThrowVelocity: soft.velocity,
          customThrowSpin: soft.spin,
        });
        results = await diceBox.roll(notationFor(request.groups, colors), {
          newStartPoint: false,
        });
      }
      if (requestTokenRef.current !== token) return;

      setSettledFaces(splitFacesByGroup(request.groups, results));
      setPhase("settled");
    } catch (err) {
      console.error("[DiceThrowModal] throw failed:", err);
      if (requestTokenRef.current === token) onResolve(null);
    } finally {
      rollPromiseRef.current = null;
    }
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return null;
    dragRef.current = null;
    if (drag.frame !== null) cancelAnimationFrame(drag.frame);
    return drag;
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = endDrag(e);
    if (!drag) return;
    const at = localPoint(drag, e);
    drag.samples.push({ x: at.x, y: at.y, t: e.timeStamp });
    void throwDice(drag, at);
  };

  // A cancelled pointer (the OS took the gesture, the finger was lifted off
  // screen) still has to open the hand, or the dice would hang in mid-air with
  // the roll never resolving. Treat it as letting go on the spot: no velocity
  // sample is added, so the dice simply drop.
  const onPointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = endDrag(e);
    if (!drag) return;
    const last = drag.samples[drag.samples.length - 1];
    void throwDice(drag, last);
  };

  const confirm = () => {
    if (!settledFaces) return;
    onResolve(settledFaces);
  };

  // The tray container below (#dice-throw-canvas) is kept mounted at all
  // times rather than returning null when there's no request. dice-box
  // appends its <canvas> into that container once and the DiceBox instance
  // is reused across requests (see getDiceBox above) - if the container
  // unmounted between rolls, that canvas would be removed from the DOM and
  // the reused instance would keep pointing at the detached node, leaving
  // every roll after the first invisible. Hiding via CSS instead of
  // unmounting keeps the canvas attached and its measured size stable.
  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col bg-black/80 backdrop-blur-sm ${
        request ? "" : "invisible pointer-events-none"
      }`}
      aria-hidden={!request}
    >
      {/* Header */}
      {request && (
        <div className="px-5 pt-5 pb-4 bg-linear-to-b from-blue-950 to-transparent text-center pointer-events-none">
          <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-linear-to-br from-purple-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-950/50">
            <DynamicIcon name="Dices" className="w-6 h-6 text-white" />
          </div>
          <p className="text-sm text-blue-100 max-w-sm mx-auto">
            {request.reason}
          </p>
          {/* One chip per pool, tinted to match that pool's dice in the tray,
              so a multi-pool roll reads as the separate handfuls it is rather
              than a single summed formula. */}
          <div className="flex items-center justify-center flex-wrap gap-2 text-sm mt-2">
            {request.groups.map((group, i) => (
              <span
                key={`${group.count}d${group.sides}-${i}`}
                className="px-3 py-1.5 rounded-lg border font-mono font-semibold text-white/95"
                style={{
                  backgroundColor: `${colors[i]}33`,
                  borderColor: `${colors[i]}99`,
                }}
              >
                <span
                  className="inline-block w-2.5 h-2.5 rounded-sm mr-2 align-middle"
                  style={{ backgroundColor: colors[i] }}
                />
                {group.count}d{group.sides}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Dice tray - dice-box appends its own <canvas> into this container.
          The canvas ships no sizing CSS of its own (only an opacity
          transition), so without the rule below it renders at the browser's
          default 300x150 in the corner instead of filling the tray. */}
      <div
        id="dice-throw-canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        // min-h-0 overrides the flex default of min-height:auto - without it,
        // a <canvas> child's intrinsic size (its width/height attributes,
        // which dice-box sets to match this container's last measured size)
        // becomes this flex item's content-based minimum, so it never
        // shrinks back down when the footer grows on settle (the result
        // line + bigger Continue button), pushing the footer off the
        // bottom of the screen.
        className="flex-1 min-h-0 relative"
        style={{
          touchAction: "none",
          cursor:
            phase === "ready" ? "grab" : phase === "held" ? "grabbing" : "default",
        }}
      >
        <style jsx>{`
          #dice-throw-canvas :global(canvas) {
            width: 100% !important;
            height: 100% !important;
            display: block;
          }
        `}</style>
        {request && phase === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center text-blue-200/70 text-sm">
            Loading dice...
          </div>
        )}
        {request && (phase === "ready" || phase === "held") && (
          <div className="absolute inset-x-0 bottom-6 text-center text-blue-200/60 text-sm pointer-events-none px-6">
            {phase === "ready"
              ? "Press anywhere to pick up the dice"
              : "Let go to throw - the faster you flick, the harder they land"}
          </div>
        )}
      </div>

      {/* Footer */}
      {request && (
        <div className="px-5 pb-5 pt-3 bg-linear-to-t from-blue-950 to-transparent">
          {phase === "settled" && settledFaces && (
            <div className="text-center mb-3 flex items-center justify-center flex-wrap gap-x-3 gap-y-1">
              {settledFaces.map((faces, i) => (
                <span
                  key={i}
                  className="text-white font-bold text-lg"
                  // Each pool keeps its own bracket - the whole point of
                  // separate pools is that their numbers don't merge - and its
                  // own colour, matching the dice it came from.
                >
                  {request.groups.length > 1 && (
                    <span
                      className="font-normal text-sm mr-1 font-mono"
                      style={{ color: colors[i] }}
                    >
                      {request.groups[i]?.count}d{request.groups[i]?.sides}
                    </span>
                  )}
                  [{faces.join(", ")}]
                </span>
              ))}
            </div>
          )}
          {phase === "settled" ? (
            <button
              onClick={confirm}
              className="w-full py-3 rounded-xl bg-linear-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 active:scale-[0.99] text-white font-semibold transition-all flex items-center justify-center gap-2"
            >
              <DynamicIcon name="Check" className="w-4 h-4" />
              Continue
            </button>
          ) : (
            <button
              onClick={() => onResolve(null)}
              className="w-full py-2 text-xs text-blue-300/50 hover:text-blue-200 transition-colors"
            >
              Skip - let the GM roll for me
            </button>
          )}
        </div>
      )}
    </div>
  );
}
