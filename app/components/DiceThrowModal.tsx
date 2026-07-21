"use client";

import React, { useEffect, useRef, useState } from "react";
import type DiceBox from "@3d-dice/dice-box";
import type { DiceThrowRequest } from "../misc/gmExecutor";
import { DynamicIcon } from "./DynamicIcon";

interface DiceThrowModalProps {
  // The pending physical dice request, or null when nothing is being asked
  request: DiceThrowRequest | null;
  // Called with the settled face values, or null if the player skipped -
  // the GM executor falls back to a fully digital roll in that case.
  onResolve: (faces: number[] | null) => void;
}

// dice-box ships models for these standard die sizes only. A formula can
// technically ask for other sides (e.g. "1d3" from a homebrew mechanics
// note) - those can't be thrown physically, so fall straight back to a
// digital roll rather than showing a tray that can't render the die.
const SUPPORTED_SIDES = new Set([4, 6, 8, 10, 12, 20, 100]);

interface DragState {
  startX: number;
  startY: number;
  startTime: number;
}

// Converts a screen-space drag gesture into a world-space throw. Tuned by
// eye against the default dice-box camera/tray - see app/dev/dice-spike
// for how this was validated against the patched physics worker.
function throwFromDrag(dx: number, dy: number, dtMs: number) {
  const dtSec = Math.max(dtMs, 16) / 1000;
  const dist = Math.hypot(dx, dy) || 1;
  const speed = Math.min(dist / dtSec, 4000); // px/sec, clamped
  const dirX = dx / dist;
  const dirZ = dy / dist;
  const forceScale = speed / 200;

  const velocity: [number, number, number] = [
    dirX * forceScale,
    2 + forceScale * 0.3,
    dirZ * forceScale,
  ];
  const spin: [number, number, number] = [
    forceScale,
    forceScale * 0.6,
    forceScale,
  ];
  return { velocity, spin };
}

type Phase = "loading" | "aiming" | "rolling" | "settled";

/**
 * Physical dice mode: the GM's formula_roll/opposed_formula/
 * formula_challenge_check can be thrown on a 3D dice tray instead of
 * resolved silently. Drag anywhere on the tray and release to throw - the
 * result comes from @3d-dice/dice-box's real physics (see
 * scripts/patchDiceBox.mjs for how the throw itself is gesture-driven
 * rather than the library's own randomized toss).
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
  // Guards against a stale throw resolving after the request changed
  // (e.g. the player skipped while dice were mid-air) or the modal closed.
  const requestTokenRef = useRef(0);

  const [phase, setPhase] = useState<Phase>("loading");
  const [settledFaces, setSettledFaces] = useState<number[] | null>(null);

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

    if (!SUPPORTED_SIDES.has(request.sides)) {
      // Can't render this die type - skip straight to a digital fallback
      // rather than showing a tray that can't display the roll.
      onResolve(null);
      return;
    }

    setPhase("loading");
    getDiceBox()
      .then(() => {
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
    if (phase !== "aiming") return;
    dragRef.current = { startX: e.clientX, startY: e.clientY, startTime: performance.now() };
  };

  const onPointerUp = async (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag || phase !== "aiming" || !request) return;

    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    const dtMs = performance.now() - drag.startTime;
    if (Math.hypot(dx, dy) < 20) return; // require an actual drag, not a tap

    const token = requestTokenRef.current;
    try {
      const diceBox = await getDiceBox();
      if (requestTokenRef.current !== token) return;

      setPhase("rolling");
      const { velocity, spin } = throwFromDrag(dx, dy, dtMs);
      await diceBox.updateConfig({
        customThrowVelocity: velocity,
        customThrowSpin: spin,
      });
      const results = await diceBox.roll(`${request.count}d${request.sides}`);
      if (requestTokenRef.current !== token) return;

      const faces = results.map((r) => r.value);
      setSettledFaces(faces);
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
          <div className="flex items-center justify-center gap-2 text-sm mt-2">
            <span className="px-3 py-1.5 rounded-lg bg-purple-900/60 border border-purple-600/40 text-purple-100 font-mono font-semibold">
              🎲 {request.count}d{request.sides}
            </span>
            {request.dc !== undefined && (
              <span className="px-3 py-1.5 rounded-lg bg-blue-900/60 border border-blue-600/40 text-blue-100 font-semibold">
                vs DC {request.dc}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Dice tray */}
      <div
        id="dice-throw-canvas"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        className="flex-1 relative"
        style={{ touchAction: "none", cursor: phase === "aiming" ? "grab" : "default" }}
      >
        {request && phase === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center text-blue-200/70 text-sm">
            Loading dice...
          </div>
        )}
        {request && phase === "aiming" && (
          <div className="absolute inset-x-0 bottom-6 text-center text-blue-200/60 text-sm pointer-events-none">
            Drag and release to throw
          </div>
        )}
      </div>

      {/* Footer */}
      {request && (
        <div className="px-5 pb-5 pt-3 bg-linear-to-t from-blue-950 to-transparent">
          {phase === "settled" && settledFaces && (
            <div className="text-center mb-3">
              <span className="text-white font-bold text-lg">
                [{settledFaces.join(", ")}]
              </span>
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
