"use client";

// Manual test harness for the 3D dice tray's throw gesture. Drives the exact
// same math the real tray uses (app/misc/diceThrow.ts, consumed by
// app/components/DiceThrowModal.tsx) against a bare dice-box instance, and
// prints the resulting spawn point / velocity / spin so a throw that misbehaves
// can be traced back to either the gesture math or the physics patch
// (scripts/patchDiceBox.mjs).
//
// Not part of the game. Useful for retuning the constants in diceThrow.ts,
// since the tray is the whole viewport here and the roll happens without a GM
// turn behind it.

import { useEffect, useRef, useState } from "react";
import type DiceBox from "@3d-dice/dice-box";
import { powerFromDragDistance, throwFromDrag, type TraySize } from "@/app/misc/diceThrow";

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  rectLeft: number;
  rectTop: number;
  tray: TraySize;
}

export default function DiceSpikePage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const diceBoxRef = useRef<DiceBox | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const [notation, setNotation] = useState("2d6");
  const [status, setStatus] = useState("loading dice-box...");
  const [result, setResult] = useState<string>("");
  const [lastThrow, setLastThrow] = useState<string>("");
  const [power, setPower] = useState(0);

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
      // Debug hook - lets a test script drive the tray directly without going
      // through the gesture handlers.
      (window as unknown as { __diceBox?: DiceBox }).__diceBox = diceBox;
      setStatus("ready");
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // dice-box only measures the container during init(), and its own resize
  // handler is what pushes a new size through to the physics bounds - so nudge
  // it once the canvas has been stretched to fill the tray by the CSS below.
  useEffect(() => {
    if (status !== "ready") return;
    window.dispatchEvent(new Event("resize"));
  }, [status]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current) return;
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
    setPower(0);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    setPower(
      powerFromDragDistance(
        Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY),
        drag.tray
      )
    );
  };

  const onPointerUp = async (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    dragRef.current = null;
    setPower(0);

    const gesture = throwFromDrag(
      drag.startX - drag.rectLeft,
      drag.startY - drag.rectTop,
      e.clientX - drag.rectLeft,
      e.clientY - drag.rectTop,
      drag.tray
    );
    if (!gesture) {
      setLastThrow("(too short - treated as a tap)");
      return;
    }

    const diceBox = diceBoxRef.current;
    if (!diceBox) return;

    const fmt = (v: number[]) => v.map((n) => n.toFixed(1)).join(", ");
    setLastThrow(
      `power ${gesture.power.toFixed(2)} | spawn [${fmt(gesture.startPosition)}] | ` +
        `velocity [${fmt(gesture.velocity)}] | spin [${fmt(gesture.spin)}]`
    );

    setStatus("rolling (gesture)...");
    await diceBox.updateConfig({
      startPosition: gesture.startPosition,
      customThrowVelocity: gesture.velocity,
      customThrowSpin: gesture.spin,
    });
    const results = await diceBox.roll(notation, { newStartPoint: false });
    setResult(JSON.stringify(results.map((r) => ({ sides: r.sides, value: r.value }))));
    setStatus("ready");
  };

  // Compare against dice-box's unaided throw: random rim spawn point, randomized
  // force. This is what the tray used to do for every roll.
  const autoRoll = async () => {
    const diceBox = diceBoxRef.current;
    if (!diceBox) return;
    setStatus("rolling...");
    setLastThrow("(auto - dice-box's own randomized throw)");
    await diceBox.updateConfig({ customThrowVelocity: null, customThrowSpin: null });
    const results = await diceBox.roll(notation);
    setResult(JSON.stringify(results.map((r) => ({ sides: r.sides, value: r.value }))));
    setStatus("ready");
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "#222" }}>
      <style>{`#dice-spike-canvas canvas{width:100%!important;height:100%!important;display:block}`}</style>
      <div
        id="dice-spike-canvas"
        ref={containerRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          dragRef.current = null;
          setPower(0);
        }}
        style={{ position: "absolute", inset: 0, cursor: "grab", touchAction: "none" }}
      />
      <div
        style={{
          position: "absolute",
          top: 12,
          left: 12,
          right: 12,
          color: "white",
          fontFamily: "monospace",
          fontSize: 12,
          background: "rgba(0,0,0,0.6)",
          padding: 12,
          borderRadius: 8,
          pointerEvents: "none",
        }}
      >
        <div>status: {status}</div>
        <div>result: {result}</div>
        <div>last throw: {lastThrow}</div>
        <div>drag power: {power.toFixed(2)}</div>
        <div style={{ marginTop: 8, display: "flex", gap: 8, pointerEvents: "auto" }}>
          {["1d6", "2d6", "1d20", "4d6"].map((n) => (
            <button
              key={n}
              onClick={() => setNotation(n)}
              style={{ fontWeight: n === notation ? "bold" : "normal" }}
            >
              {n}
            </button>
          ))}
          <button onClick={autoRoll}>auto roll (no gesture)</button>
        </div>
        <div style={{ marginTop: 8 }}>
          Drag from where the dice should launch, in the direction they should
          travel - the longer the drag, the harder the throw.
        </div>
      </div>
    </div>
  );
}
