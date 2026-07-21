"use client";

// Throwaway spike for evaluating @3d-dice/dice-box (physics-based 3D dice).
// Not wired into the game - just confirming the canvas/physics loop works
// end-to-end, that dice-box's genuine physics settle to a real result, and
// that a drag/flick gesture (not dice-box's internal Math.random() throw)
// can drive the toss via the scripts/patchDiceBox.mjs patch.
// Safe to delete once the dice-box spike is finished.

import { useEffect, useRef, useState } from "react";
import type DiceBox from "@3d-dice/dice-box";

interface DragState {
  startX: number;
  startY: number;
  startTime: number;
}

// Converts a screen-space drag gesture into a world-space throw. Tuned by
// eye against the default dice-box camera/tray, not derived from anything
// physical - expect to retune once this is used against the real UI.
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

export default function DiceSpikePage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const diceBoxRef = useRef<DiceBox | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const [status, setStatus] = useState("loading dice-box...");
  const [result, setResult] = useState<string>("");
  const [lastThrow, setLastThrow] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { default: DiceBox } = await import("@3d-dice/dice-box");
      if (cancelled || !containerRef.current) return;

      const diceBox = new DiceBox({
        container: "#dice-spike-canvas",
        assetPath: "/assets/",
        theme: "default",
        scale: 6,
      });
      diceBoxRef.current = diceBox;

      await diceBox.init();
      if (cancelled) return;
      // Debug hook for the spike only - lets test scripts drive the patch
      // plumbing directly without going through the drag heuristic.
      (window as unknown as { __diceBox?: DiceBox }).__diceBox = diceBox;
      setStatus("ready");
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const roll = async (notation: string) => {
    const diceBox = diceBoxRef.current;
    if (!diceBox) return;
    setStatus("rolling...");
    setLastThrow("(auto - dice-box's own randomized throw)");
    // Clear any leftover gesture override from a previous drag throw.
    await diceBox.updateConfig({ customThrowVelocity: null, customThrowSpin: null });
    const results = await diceBox.roll(notation);
    setResult(JSON.stringify(results.map((r) => ({ sides: r.sides, value: r.value }))));
    setStatus("ready");
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = { startX: e.clientX, startY: e.clientY, startTime: performance.now() };
  };

  const onPointerUp = async (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;

    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    const dtMs = performance.now() - drag.startTime;
    // Ignore a plain click - require an actual drag to throw.
    if (Math.hypot(dx, dy) < 20) return;

    const diceBox = diceBoxRef.current;
    if (!diceBox) return;

    const { velocity, spin } = throwFromDrag(dx, dy, dtMs);
    setLastThrow(
      `drag dx=${dx.toFixed(0)} dy=${dy.toFixed(0)} dt=${dtMs.toFixed(0)}ms -> velocity=[${velocity
        .map((n) => n.toFixed(1))
        .join(",")}] spin=[${spin.map((n) => n.toFixed(1)).join(",")}]`
    );

    setStatus("rolling (gesture)...");
    await diceBox.updateConfig({ customThrowVelocity: velocity, customThrowSpin: spin });
    const results = await diceBox.roll("2d6");
    setResult(JSON.stringify(results.map((r) => ({ sides: r.sides, value: r.value }))));
    setStatus("ready");
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "#222" }}>
      <div
        id="dice-spike-canvas"
        ref={containerRef}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        style={{ position: "absolute", inset: 0, cursor: "grab", touchAction: "none" }}
      />
      <div
        style={{
          position: "absolute",
          top: 12,
          left: 12,
          color: "white",
          fontFamily: "monospace",
          background: "rgba(0,0,0,0.6)",
          padding: 12,
          borderRadius: 8,
          maxWidth: 500,
          pointerEvents: "none",
        }}
      >
        <div>status: {status}</div>
        <div>result: {result}</div>
        <div>last throw: {lastThrow}</div>
        <div style={{ marginTop: 8, display: "flex", gap: 8, pointerEvents: "auto" }}>
          <button onClick={() => roll("1d6")}>auto roll 1d6</button>
          <button onClick={() => roll("1d10")}>auto roll 1d10</button>
          <button onClick={() => roll("1d20")}>auto roll 1d20</button>
          <button onClick={() => roll("2d6+3")}>auto roll 2d6+3</button>
        </div>
        <div style={{ marginTop: 8 }}>Drag anywhere on the canvas and release to throw 2d6 via gesture.</div>
      </div>
    </div>
  );
}
