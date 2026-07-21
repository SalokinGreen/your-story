"use client";

// Throwaway spike for evaluating @3d-dice/dice-box (physics-based 3D dice).
// Not wired into the game - just confirming the canvas/physics loop works
// end-to-end and that a roll() call resolves with real results.
// Safe to delete once the dice-box spike is finished.

import { useEffect, useRef, useState } from "react";
import type DiceBox from "@3d-dice/dice-box";

export default function DiceSpikePage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const diceBoxRef = useRef<DiceBox | null>(null);
  const [status, setStatus] = useState("loading dice-box...");
  const [result, setResult] = useState<string>("");

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
    const results = await diceBox.roll(notation);
    setResult(JSON.stringify(results.map((r) => ({ sides: r.sides, value: r.value }))));
    setStatus("ready");
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "#222" }}>
      <div
        id="dice-spike-canvas"
        ref={containerRef}
        style={{ position: "absolute", inset: 0 }}
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
        }}
      >
        <div>status: {status}</div>
        <div>result: {result}</div>
        <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
          <button onClick={() => roll("1d6")}>roll 1d6</button>
          <button onClick={() => roll("1d10")}>roll 1d10</button>
          <button onClick={() => roll("1d20")}>roll 1d20</button>
          <button onClick={() => roll("2d6+3")}>roll 2d6+3</button>
        </div>
      </div>
    </div>
  );
}
