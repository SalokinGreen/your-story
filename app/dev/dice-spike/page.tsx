"use client";

// Manual test harness for the 3D dice tray's grab-and-throw gesture. Drives
// the exact same math and control channel the real tray uses
// (app/misc/diceThrow.ts, app/misc/diceControlChannel.ts, consumed by
// app/components/DiceThrowModal.tsx) against a bare dice-box instance, and
// prints the resulting hold point / release velocity / spin so a throw that
// misbehaves can be traced back to either the gesture math or the physics
// patch (scripts/patchDiceBox.mjs).
//
// Not part of the game. Useful for retuning the constants in diceThrow.ts,
// since the tray is the whole viewport here and the roll happens without a GM
// turn behind it.

import { useEffect, useRef, useState } from "react";
import type DiceBox from "@3d-dice/dice-box";
import type { DieResult } from "@3d-dice/dice-box";
import { colorsForGroups } from "@/app/misc/diceColors";
import { DiceControlChannel } from "@/app/misc/diceControlChannel";
import {
  GRAB_MAX_SPEED,
  GRAB_SPREAD,
  GRAB_STIFFNESS,
  TRAY_PHYSICS,
  holdPointFromPointer,
  throwFromRelease,
  velocityFromSamples,
  type PointerSample,
  type TraySize,
} from "@/app/misc/diceThrow";

interface DragState {
  pointerId: number;
  rectLeft: number;
  rectTop: number;
  tray: TraySize;
  samples: PointerSample[];
  ready: Promise<boolean>;
}

// Each entry is one pool, the way a real request arrives - the second one
// exercises the mixed-pool colouring (a green d6 thrown alongside two red
// d10s, Starforged style).
const PRESETS: { label: string; groups: { sides: number; count: number }[] }[] = [
  { label: "2d6", groups: [{ sides: 6, count: 2 }] },
  { label: "1d20", groups: [{ sides: 20, count: 1 }] },
  { label: "1d6+2d10", groups: [{ sides: 6, count: 1 }, { sides: 10, count: 2 }] },
  {
    label: "1d20 vs 1d20",
    groups: [{ sides: 20, count: 1 }, { sides: 20, count: 1 }],
  },
];

export default function DiceSpikePage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const diceBoxRef = useRef<DiceBox | null>(null);
  const controlRef = useRef<DiceControlChannel | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const rollPromiseRef = useRef<Promise<DieResult[]> | null>(null);
  const presetRef = useRef(PRESETS[0]);
  const [presetLabel, setPresetLabel] = useState(PRESETS[0].label);
  const [status, setStatus] = useState("loading dice-box...");
  const [held, setHeld] = useState(false);
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
        // Same tray material the real modal uses, or this harness would be
        // retuning the gesture against physics the game doesn't have.
        ...TRAY_PHYSICS,
      });
      diceBoxRef.current = diceBox;

      await diceBox.init();
      if (cancelled) return;
      controlRef.current = await DiceControlChannel.open();
      // Debug hook - lets a test script drive the tray directly without going
      // through the gesture handlers.
      (window as unknown as { __diceBox?: DiceBox }).__diceBox = diceBox;
      setStatus(controlRef.current ? "ready (dice can be held)" : "ready (no control channel - throw only)");
    })();

    return () => {
      cancelled = true;
      controlRef.current?.close();
      controlRef.current = null;
    };
  }, []);

  // dice-box only measures the container during init(), and its own resize
  // handler is what pushes a new size through to the physics bounds - so nudge
  // it once the canvas has been stretched to fill the tray by the CSS below.
  useEffect(() => {
    if (!status.startsWith("ready")) return;
    window.dispatchEvent(new Event("resize"));
  }, [status]);

  const notation = () => {
    const { groups } = presetRef.current;
    const colors = colorsForGroups(groups);
    return groups.map((group, i) => ({
      qty: group.count,
      sides: group.sides,
      themeColor: colors[i],
    }));
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    const tray: TraySize = { width: rect.width, height: rect.height };
    const at = { x: e.clientX - rect.left, y: e.clientY - rect.top };

    dragRef.current = {
      pointerId: e.pointerId,
      rectLeft: rect.left,
      rectTop: rect.top,
      tray,
      samples: [{ x: at.x, y: at.y, t: e.timeStamp }],
      ready: (async () => {
        const diceBox = diceBoxRef.current;
        const control = controlRef.current;
        if (!diceBox || !control) return false;
        const hold = holdPointFromPointer(at.x, at.y, tray);
        const grabbed = await control.grab(hold, {
          stiffness: GRAB_STIFFNESS,
          maxSpeed: GRAB_MAX_SPEED,
          spread: GRAB_SPREAD,
        });
        if (!grabbed) return false;
        await diceBox.updateConfig({ startPosition: hold });
        rollPromiseRef.current = diceBox.roll(notation(), { newStartPoint: false });
        return true;
      })(),
    };
    setHeld(true);
    setStatus("dice in hand");
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const at = { x: e.clientX - drag.rectLeft, y: e.clientY - drag.rectTop };
    drag.samples.push({ x: at.x, y: at.y, t: e.timeStamp });
    controlRef.current?.move(holdPointFromPointer(at.x, at.y, drag.tray));
  };

  const onPointerUp = async (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    dragRef.current = null;
    setHeld(false);

    const at = { x: e.clientX - drag.rectLeft, y: e.clientY - drag.rectTop };
    drag.samples.push({ x: at.x, y: at.y, t: e.timeStamp });
    const { vx, vy } = velocityFromSamples(drag.samples);
    const thrown = throwFromRelease(at.x, at.y, vx, vy, drag.tray);

    const fmt = (v: number[] | null) =>
      v ? v.map((n) => n.toFixed(1)).join(", ") : "none";
    setLastThrow(
      `power ${thrown.power.toFixed(2)} | hand ${Math.hypot(vx, vy).toFixed(0)}px/s | ` +
        `from [${fmt(thrown.startPosition)}] | velocity [${fmt(thrown.velocity)}] | spin [${fmt(thrown.spin)}]`
    );

    const diceBox = diceBoxRef.current;
    if (!diceBox) return;

    setStatus("thrown, settling...");
    let results: DieResult[];
    if ((await drag.ready) && controlRef.current && rollPromiseRef.current) {
      controlRef.current.release({
        position: thrown.startPosition,
        velocity: thrown.velocity,
        spin: thrown.spin,
      });
      results = await rollPromiseRef.current;
    } else {
      await diceBox.updateConfig({
        startPosition: thrown.startPosition,
        customThrowVelocity: thrown.velocity,
        customThrowSpin: thrown.spin,
      });
      results = await diceBox.roll(notation(), { newStartPoint: false });
    }
    rollPromiseRef.current = null;
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
    await diceBox.updateConfig({
      startPosition: null,
      customThrowVelocity: null,
      customThrowSpin: null,
    });
    const results = await diceBox.roll(notation());
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
        onPointerCancel={onPointerUp}
        style={{
          position: "absolute",
          inset: 0,
          cursor: held ? "grabbing" : "grab",
          touchAction: "none",
        }}
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
        <div style={{ marginTop: 8, display: "flex", gap: 8, pointerEvents: "auto" }}>
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              onClick={() => {
                presetRef.current = preset;
                setPresetLabel(preset.label);
              }}
              style={{ fontWeight: preset.label === presetLabel ? "bold" : "normal" }}
            >
              {preset.label}
            </button>
          ))}
          <button onClick={autoRoll}>auto roll (no gesture)</button>
        </div>
        <div style={{ marginTop: 8 }}>
          Press to take the dice in hand, drag them around the tray, and let go
          to throw - the faster the hand is moving when it lets go, the harder
          they land. Release slowly and they just drop.
        </div>
      </div>
    </div>
  );
}
