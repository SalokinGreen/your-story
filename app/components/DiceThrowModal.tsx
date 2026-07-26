"use client";

import React, { useEffect, useRef, useState } from "react";
import type DiceBox from "@3d-dice/dice-box";
import type { DieResult } from "@3d-dice/dice-box";
import type { DiceThrowRequest } from "../misc/gmExecutor";
import {
  powerFromDragDistance,
  throwFromDrag,
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

// Every group in a request is thrown together, so dice-box gets one notation
// per group: ["2d6", "1d4"]. It returns a flat DieResult[] carrying each
// die's own `sides`, which is what splitFacesByGroup below matches back up.
function notationFor(groups: { sides: number; count: number }[]): string[] {
  return groups.map((g) => `${g.count}d${g.sides}`);
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
  // Which pointer owns the drag, so a second finger landing on the tray
  // mid-gesture can't hijack or cancel it.
  pointerId: number;
  // Drag start and the tray's size, both in tray-local CSS px, captured at
  // drag-start so the throw-vector line and the throw itself can be computed
  // without re-measuring on every move.
  startX: number;
  startY: number;
  rectLeft: number;
  rectTop: number;
  tray: TraySize;
}

interface DragVisual {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  // 0..1 gesture strength, so the aiming line can show how hard this throw
  // will land before the player commits to it.
  power: number;
}

// The gesture drives the throw completely: the dice spawn where the player
// pressed, fly along the drag, and fly harder the further it went. See
// app/misc/diceThrow.ts for the screen -> tray-world geometry, and
// scripts/patchDiceBox.mjs for the dice-box physics-worker patch that lets a
// caller set a die's initial velocity/spin at all.
//
// An earlier version only scaled dice-box's own throwForce/spinForce and let
// the library aim the throw. That could not work: dice-box respawns the dice
// at a *random* point on the tray rim before every roll and aims them inward
// from there, so the drag direction was ignored outright, and its throw
// velocity is lerp(halfForce, fullForce, Math.random()) from a spawn point
// whose distance from the middle also varies - which buried the drag's
// contribution to power under two layers of randomness. Pinning startPosition
// (with `newStartPoint: false`) and setting the velocity outright fixes both.
//
// Power comes from how FAR the player dragged, not how fast: a slow,
// deliberate drag should throw as hard as a quick flick across the same
// distance (a speed-based version scored near-zero force on a real ~1s
// human drag).

type Phase = "loading" | "aiming" | "rolling" | "settled";

/**
 * Physical dice mode: the GM's formula_roll/opposed_formula rolls can be
 * thrown on a 3D dice tray instead of resolved silently. The dice spawn in
 * and settle as soon as the tray opens, sitting visible at rest; press
 * anywhere on the tray and drag (a line shows the throw vector), and on
 * release the dice are thrown from the point you pressed, along the drag, as
 * hard as the drag was long - the result comes from @3d-dice/dice-box's real
 * physics (see scripts/patchDiceBox.mjs for how the throw itself is
 * gesture-driven rather than the library's own randomized toss).
 *
 * Every pool in the roll is thrown in the same toss: "2d6+1d4" puts three
 * dice in the tray at once, and Starforged's 1d6 action die lands alongside
 * its 2d10 challenge dice - the way a real handful works. Faces are split
 * back out per pool on the way home (splitFacesByGroup).
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
  const dragRef = useRef<DragState | null>(null);
  // The dice currently sitting in the tray (from the initial spawn-in toss,
  // then replaced by each reroll's results) - passed back into reroll() so
  // the player's throw gesture re-tosses those same dice rather than
  // spawning a new set on top of them.
  const diceGroupRef = useRef<DieResult[] | null>(null);
  // Guards against a stale throw resolving after the request changed
  // (e.g. the player skipped while dice were mid-air) or the modal closed.
  const requestTokenRef = useRef(0);

  const [phase, setPhase] = useState<Phase>("loading");
  // Settled faces per requested group, matching DiceThrowRequest.groups.
  const [settledFaces, setSettledFaces] = useState<number[][] | null>(null);
  const [dragVisual, setDragVisual] = useState<DragVisual | null>(null);

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
        return box;
      })();
    }
    return initPromiseRef.current;
  }

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
    diceGroupRef.current = null;
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

        // Show the dice sitting in the tray immediately, before the player
        // does anything - a gentle toss-in (soft force so they settle near
        // the middle rather than scattering to the corners). The player's
        // own drag/release later re-throws this same group via reroll()
        // rather than spawning a second set on top of it.
        await diceBox.updateConfig({
          throwForce: 2.5,
          spinForce: 3,
          customThrowVelocity: null,
          customThrowSpin: null,
        });
        const results = await diceBox.roll(notationFor(request.groups));
        if (requestTokenRef.current !== token) return;
        diceGroupRef.current = results;
        setPhase("aiming");
      })
      .catch((err) => {
        // WebGL/asset load failure, etc - don't hang the GM loop waiting
        // for a tray that will never render, fall back to a digital roll.
        console.error("[DiceThrowModal] failed to load dice-box:", err);
        if (requestTokenRef.current === token) onResolve(null);
      });
    // onResolve is a fresh closure each render from page.tsx - only
    // request identity should re-trigger this setup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (phase !== "aiming" || dragRef.current) return;
    // Capture so the gesture keeps reporting once the finger/cursor leaves the
    // tray - a throw aimed at an edge naturally overshoots past it, and
    // without capture the drag would silently die at the boundary.
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      rectLeft: rect.left,
      rectTop: rect.top,
      tray: { width: rect.width, height: rect.height },
    };
    setDragVisual({
      x1: e.clientX - rect.left,
      y1: e.clientY - rect.top,
      x2: e.clientX - rect.left,
      y2: e.clientY - rect.top,
      power: 0,
    });
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId || phase !== "aiming") return;
    setDragVisual({
      x1: drag.startX - drag.rectLeft,
      y1: drag.startY - drag.rectTop,
      x2: e.clientX - drag.rectLeft,
      y2: e.clientY - drag.rectTop,
      power: powerFromDragDistance(
        Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY),
        drag.tray
      ),
    });
  };

  const onPointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== e.pointerId) return;
    dragRef.current = null;
    setDragVisual(null);
  };

  const onPointerUp = async (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    dragRef.current = null;
    setDragVisual(null);
    if (phase !== "aiming" || !request) return;

    // Everything the throw needs, in tray-local px: dice spawn at the press
    // point, fly along the drag, and fly harder the longer it was. Returns
    // null for a tap.
    const gesture = throwFromDrag(
      drag.startX - drag.rectLeft,
      drag.startY - drag.rectTop,
      e.clientX - drag.rectLeft,
      e.clientY - drag.rectTop,
      drag.tray
    );
    if (!gesture) return;

    const token = requestTokenRef.current;
    try {
      const diceBox = await getDiceBox();
      if (requestTokenRef.current !== token) return;

      setPhase("rolling");
      await diceBox.updateConfig({
        startPosition: gesture.startPosition,
        customThrowVelocity: gesture.velocity,
        customThrowSpin: gesture.spin,
      });
      const group = diceGroupRef.current;
      // newStartPoint: false is what makes the startPosition above stick -
      // dice-box otherwise overwrites it with a random point on the tray rim
      // just before spawning the dice.
      const results = group
        ? await diceBox.reroll(group, { remove: true, newStartPoint: false })
        : await diceBox.roll(notationFor(request.groups), {
            newStartPoint: false,
          });
      if (requestTokenRef.current !== token) return;

      diceGroupRef.current = results;
      setSettledFaces(splitFacesByGroup(request.groups, results));
      setPhase("settled");
    } catch (err) {
      console.error("[DiceThrowModal] throw failed:", err);
      if (requestTokenRef.current === token) onResolve(null);
    }
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
          {/* One chip per pool, so a multi-pool roll reads as the separate
              handfuls it is rather than a single summed formula. */}
          <div className="flex items-center justify-center flex-wrap gap-2 text-sm mt-2">
            {request.groups.map((group, i) => (
              <span
                key={`${group.count}d${group.sides}-${i}`}
                className="px-3 py-1.5 rounded-lg bg-purple-900/60 border border-purple-600/40 text-purple-100 font-mono font-semibold"
              >
                🎲 {group.count}d{group.sides}
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
        style={{ touchAction: "none", cursor: phase === "aiming" ? "grab" : "default" }}
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
        {request && phase === "aiming" && !dragVisual && (
          <div className="absolute inset-x-0 bottom-6 text-center text-blue-200/60 text-sm pointer-events-none">
            Drag from where you want to throw - the further, the harder
          </div>
        )}
        {dragVisual && (
          // The line runs from the spawn point (where the player pressed) along
          // the throw; it thickens and brightens with the power the release
          // will actually use, so the drag-distance-is-power rule is visible
          // before committing to the throw.
          <svg className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true">
            <line
              x1={dragVisual.x1}
              y1={dragVisual.y1}
              x2={dragVisual.x2}
              y2={dragVisual.y2}
              stroke="rgb(196 181 253)"
              strokeOpacity={0.45 + dragVisual.power * 0.55}
              strokeWidth={3 + dragVisual.power * 6}
              strokeLinecap="round"
            />
            <circle cx={dragVisual.x1} cy={dragVisual.y1} r={7} fill="rgb(196 181 253)" fillOpacity={0.6} />
            <circle
              cx={dragVisual.x2}
              cy={dragVisual.y2}
              r={9 + dragVisual.power * 9}
              fill="rgb(196 181 253)"
              fillOpacity={0.25 + dragVisual.power * 0.35}
            />
          </svg>
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
                  // separate pools is that their numbers don't merge.
                >
                  {request.groups.length > 1 && (
                    <span className="text-blue-300/60 font-normal text-sm mr-1 font-mono">
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
