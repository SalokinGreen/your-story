"use client";

import { useState, useEffect } from "react";
import { DynamicIcon } from "./DynamicIcon";

export interface DiceRollData {
  type: "advantage" | "disadvantage" | "normal" | "reroll";
  rolls: number[];
  finalRoll: number;
  statName: string;
  statValue: number;
  dc: number;
  total: number;
  success: boolean;
  partial?: boolean; // For PbtA partial success
  tie?: boolean; // For Fate tie
  style?: boolean; // For Fate success with style
  critical?: boolean;
  penalty?: number;
  itemUsed?: string;
  resourceUsed?: string;
  momentumUsed?: "reroll" | "guarantee";
  diceRolls?: number[][]; // Individual dice rolls for each attempt (for 3d6 system)
  rpgSystem?: "3d6" | "1d20" | "1d100" | "percentile" | "pbta" | "fate" | "yze";
  // Advantage/Disadvantage stacking
  advantageCount?: number;
  disadvantageCount?: number;
  netAdvantage?: number;
  advantageSources?: string;
  disadvantageSources?: string;
  // YZE-specific
  baseDice?: number[]; // Base dice from stat
  stressDice?: number[]; // Stress dice added by player
  successes?: number; // Count of 6s rolled
  panicTriggered?: boolean; // If any stress dice showed 1
  panicRoll?: number; // d6 + stress level
  panicEffect?: string; // Panic table result
  stressLevel?: number; // Current stress (0-10)
  stressRelief?: boolean; // Strong success reduces stress
}

interface Props {
  rollData: DiceRollData;
  onComplete: () => void;
}

export default function DiceRollVisualization({ rollData, onComplete }: Props) {
  const [phase, setPhase] = useState<"rolling" | "result" | "complete">(
    "rolling"
  );
  const [displayRoll, setDisplayRoll] = useState(1);
  const [showingRollIndex, setShowingRollIndex] = useState(0);
  // Initialize dice array based on system (Fate dice start at 0, others at 1)
  const initialDice = (() => {
    switch (rollData.rpgSystem) {
      case "fate":
        return [0, 0, 0, 0];
      case "pbta":
        return [1, 1];
      case "3d6":
        return [1, 1, 1];
      default:
        return [1];
    }
  })();
  const [displayDice, setDisplayDice] = useState<number[]>(initialDice);

  // Determine dice system and configuration
  const rpgSystem = rollData.rpgSystem || "3d6";
  const is3d6 = rpgSystem === "3d6";
  const is1d20 = rpgSystem === "1d20";
  const is1d100 = rpgSystem === "1d100";
  const isPercentile = rpgSystem === "percentile";
  // (Removed duplicate declarations)
  const isYZE = rpgSystem === "yze";
  const isPbta = rpgSystem === "pbta";
  const isFate = rpgSystem === "fate";
  const diceCount = is3d6 ? 3 : isPbta ? 2 : isFate ? 4 : 1;
  const diceSides = is3d6
    ? 6
    : isPbta
    ? 6
    : is1d20
    ? 20
    : is1d100 || isPercentile
    ? 100
    : isFate
    ? 3
    : 100;
  // min/max not used for UI currently; keep for potential future logic
  const minRoll = is3d6 ? 3 : isPbta ? 2 : isFate ? -4 : 1;
  const maxRoll = is3d6 ? 18 : isPbta ? 12 : isFate ? 4 : is1d20 ? 20 : 100;

  const [completedSets, setCompletedSets] = useState<number[][]>([]);

  useEffect(() => {
    // Animate the dice rolling
    const rollDuration = 1200;
    const rollInterval = 50;
    const rollIterations = rollDuration / rollInterval;

    let iteration = 0;
    const interval = setInterval(() => {
      iteration++;
      // Random number animation
      if (is3d6 || isPbta || isFate) {
        // Animate multi-die systems
        const randomDice = Array.from({ length: diceCount }).map(() => {
          if (isFate) {
            // Fudge dice: -1, 0, +1
            return Math.floor(Math.random() * 3) - 1;
          }
          // Standard d6
          return Math.floor(Math.random() * diceSides) + 1;
        });
        setDisplayDice(randomDice as number[]);
        const total = randomDice.reduce((a, b) => a + b, 0);
        setDisplayRoll(total);
      } else {
        // Animate single-die systems
        const randomRoll = Math.floor(Math.random() * diceSides) + 1;
        setDisplayRoll(randomRoll);
      }

      if (iteration >= rollIterations) {
        clearInterval(interval);
        // Show actual roll result
        const currentRoll = rollData.rolls[showingRollIndex];
        setDisplayRoll(currentRoll);

        // If we have individual dice rolls for 3d6, show them
        if (
          is3d6 &&
          rollData.diceRolls &&
          rollData.diceRolls[showingRollIndex]
        ) {
          setDisplayDice(rollData.diceRolls[showingRollIndex]);
        }

        setTimeout(() => {
          if (showingRollIndex < rollData.rolls.length - 1) {
            // Accumulate finished set (multi-die systems only)
            if (
              (is3d6 || isPbta || isFate) &&
              rollData.diceRolls &&
              rollData.diceRolls[showingRollIndex]
            ) {
              setCompletedSets((prev) => [
                ...prev,
                rollData.diceRolls![showingRollIndex],
              ]);
            }
            // Proceed to next attempt
            setShowingRollIndex(showingRollIndex + 1);
          } else {
            // Finalize last set accumulation for multi-die systems
            if (
              (is3d6 || isPbta || isFate) &&
              rollData.diceRolls &&
              rollData.diceRolls[showingRollIndex]
            ) {
              setCompletedSets((prev) => [
                ...prev,
                rollData.diceRolls![showingRollIndex],
              ]);
            }
            // All rolls shown, move to result phase
            setPhase("result");
            setTimeout(() => {
              setPhase("complete");
              setTimeout(onComplete, 1500);
            }, 2000);
          }
        }, 600);
      }
    }, rollInterval);

    return () => clearInterval(interval);
  }, [showingRollIndex, is3d6, diceSides]);

  const getRollTypeLabel = () => {
    if (rollData.momentumUsed === "reroll") return "Reroll";
    if (rollData.netAdvantage !== undefined && rollData.netAdvantage !== 0) {
      const absNet = Math.abs(rollData.netAdvantage);
      if (rollData.netAdvantage > 0) {
        return absNet > 1 ? `Advantage x${absNet}` : "Advantage";
      } else {
        return absNet > 1 ? `Disadvantage x${absNet}` : "Disadvantage";
      }
    }
    if (rollData.type === "advantage") return "Advantage";
    if (rollData.type === "disadvantage") return "Disadvantage";
    if (rollData.type === "reroll") return "Momentum Reroll";
    return "Roll";
  };

  const getRollTypeColor = () => {
    if (phase === "rolling") return "text-blue-500";
    if (rollData.type === "advantage" || rollData.momentumUsed === "reroll")
      return "text-green-500";
    if (rollData.type === "disadvantage") return "text-red-500";
    return "text-blue-500";
  };

  const getDiceColor = () => {
    if (phase === "rolling") return "text-blue-500";
    if (phase === "result") {
      if (rollData.critical) return "text-purple-500";
      if (rollData.style) return "text-amber-500"; // Success with style = gold/amber
      if (rollData.partial) return "text-yellow-500"; // Partial success = yellow
      if (rollData.tie) return "text-blue-400"; // Tie = light blue
      if (rollData.success) return "text-green-500";
      return "text-red-500";
    }
    if (rollData.critical) return "text-purple-500";
    if (rollData.style) return "text-amber-500"; // Success with style = gold/amber
    if (rollData.partial) return "text-yellow-500"; // Partial success = yellow
    if (rollData.tie) return "text-blue-400"; // Tie = light blue
    if (rollData.success) return "text-green-500";
    return "text-red-500";
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-linear-to-b from-gray-800 to-gray-900 rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4 border-2 border-gray-700 animate-scale-in">
        {/* Roll Type Badge */}
        <div className="text-center mb-6">
          <div
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gray-700/50 border border-gray-600 ${getRollTypeColor()}`}
          >
            {rollData.momentumUsed === "reroll" && (
              <DynamicIcon name="Zap" className="w-4 h-4" />
            )}
            {rollData.itemUsed && !rollData.momentumUsed && (
              <DynamicIcon name="Package" className="w-4 h-4" />
            )}
            <span className="font-bold text-sm uppercase tracking-wide">
              {getRollTypeLabel()}
            </span>
          </div>
        </div>

        {/* Dice Visual */}
        <div className="flex justify-center mb-6">
          {is3d6 && !isYZE ? (
            // 3d6 pooled advantage/disadvantage: diceRolls[0] may contain more than 3 dice
            <div className="flex flex-col gap-4 items-center">
              {rollData.diceRolls &&
              rollData.diceRolls.length > 0 &&
              rollData.diceRolls[0].length > 3 &&
              phase !== "rolling" ? (
                (() => {
                  const pool = rollData.diceRolls![0];
                  // Find kept dice by matching finalRoll sum across combinations of 3
                  let kept: number[] = [];
                  for (let a = 0; a < pool.length && kept.length === 0; a++) {
                    for (
                      let b = a + 1;
                      b < pool.length && kept.length === 0;
                      b++
                    ) {
                      for (
                        let c = b + 1;
                        c < pool.length && kept.length === 0;
                        c++
                      ) {
                        if (
                          pool[a] + pool[b] + pool[c] ===
                          rollData.finalRoll
                        ) {
                          kept = [a, b, c];
                        }
                      }
                    }
                  }
                  if (kept.length === 0) {
                    // Fallback: choose highest or lowest 3 based on closeness to finalRoll
                    const high = [...pool].sort((a, b) => b - a).slice(0, 3);
                    if (
                      high.reduce((s, v) => s + v, 0) === rollData.finalRoll
                    ) {
                      kept = high.map((v) => pool.indexOf(v));
                    } else {
                      const low = [...pool].sort((a, b) => a - b).slice(0, 3);
                      kept = low.map((v) => pool.indexOf(v));
                    }
                  }
                  return (
                    <div className="flex flex-col items-center gap-3">
                      <div className="flex flex-wrap gap-2 justify-center">
                        {pool.map((die, idx) => {
                          const selected = kept.includes(idx);
                          return (
                            <div key={idx} className="relative">
                              <DynamicIcon
                                name="Dice6"
                                className={`w-14 h-14 ${
                                  selected ? getDiceColor() : "text-gray-600"
                                } transition-colors`}
                              />
                              <div className="absolute inset-0 flex items-center justify-center">
                                <span
                                  className={`text-xl font-black ${
                                    selected ? "text-white" : "text-gray-500"
                                  } drop-shadow`}
                                >
                                  {die}
                                </span>
                              </div>
                              {!selected && (
                                <div className="absolute -top-1 -right-1 text-[10px] font-bold text-gray-500">
                                  X
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <div className="text-xs text-gray-400 font-semibold">
                        Kept total {rollData.finalRoll} from [{pool.join(",")}]
                      </div>
                    </div>
                  );
                })()
              ) : (
                <div className="flex gap-4 items-center">
                  {displayDice.map((die, idx) => (
                    <div key={idx} className="relative">
                      <div
                        className={`transition-all duration-300 ${
                          phase === "rolling" ? "animate-spin-slow" : ""
                        }`}
                      >
                        <DynamicIcon
                          name="Dice6"
                          className={`w-20 h-20 ${getDiceColor()} transition-colors duration-500`}
                        />
                      </div>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span
                          className={`text-3xl font-black text-white drop-shadow-lg transition-all duration-300 ${
                            phase === "rolling"
                              ? "scale-110 opacity-70"
                              : "scale-125"
                          }`}
                        >
                          {die}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : !isYZE && isPbta ? (
            // PbtA System (2d6 + modifier): show sets of 2 dice when stacked
            <div className="flex flex-col gap-4 items-center">
              {rollData.netAdvantage !== undefined &&
                rollData.netAdvantage !== 0 && (
                  <div className="text-center mb-2">
                    <p
                      className={`text-sm font-bold ${
                        rollData.netAdvantage > 0
                          ? "text-green-400"
                          : "text-red-400"
                      }`}
                    >
                      {rollData.netAdvantage > 0
                        ? `Rolling ${rollData.diceRolls?.length || 1} set${
                            (rollData.diceRolls?.length || 1) > 1 ? "s" : ""
                          }; keeping best total`
                        : `Rolling ${rollData.diceRolls?.length || 1} set${
                            (rollData.diceRolls?.length || 1) > 1 ? "s" : ""
                          }; keeping worst total`}
                    </p>
                    {(rollData.advantageSources ||
                      rollData.disadvantageSources) && (
                      <p className="text-xs text-gray-400 mt-1">
                        {rollData.netAdvantage > 0
                          ? rollData.advantageSources
                          : rollData.disadvantageSources}
                      </p>
                    )}
                  </div>
                )}
              {rollData.diceRolls && rollData.diceRolls.length > 1 ? (
                <div className="flex flex-wrap gap-4 justify-center">
                  {completedSets.map((diceSet, setIdx) => {
                    const setTotal = diceSet.reduce((a, b) => a + b, 0);
                    const isUsed =
                      phase !== "rolling" && setTotal === rollData.finalRoll;
                    return (
                      <div
                        key={`pbta-done-${setIdx}`}
                        className={`flex flex-col gap-2 ${
                          isUsed
                            ? ""
                            : phase === "rolling"
                            ? "opacity-70"
                            : "opacity-40"
                        }`}
                      >
                        <div className="flex gap-2 items-center">
                          {diceSet.map((die, idx) => (
                            <div key={idx} className="relative">
                              <DynamicIcon
                                name="Dice6"
                                className={`w-16 h-16 ${
                                  isUsed ? getDiceColor() : "text-gray-500"
                                } transition-colors duration-500`}
                              />
                              <div className="absolute inset-0 flex items-center justify-center">
                                <span
                                  className={`text-2xl font-black ${
                                    isUsed ? "text-white" : "text-gray-600"
                                  } drop-shadow-lg`}
                                >
                                  {die}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="text-center">
                          <span
                            className={`text-sm font-bold ${
                              isUsed ? "text-white" : "text-gray-500"
                            }`}
                          >
                            = {setTotal}
                          </span>
                          {isUsed && (
                            <div className="flex items-center justify-center gap-1 mt-1">
                              <DynamicIcon
                                name="Check"
                                className="w-3 h-3 text-green-400"
                              />
                              <span className="text-xs text-green-400 font-bold">
                                USED
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {phase === "rolling" &&
                    showingRollIndex < rollData.rolls.length && (
                      <div className="flex flex-col gap-2 animate-pulse">
                        <div className="flex gap-2 items-center">
                          {displayDice.slice(0, 2).map((die, idx) => (
                            <div key={idx} className="relative">
                              <DynamicIcon
                                name="Dice6"
                                className="w-16 h-16 text-blue-500"
                              />
                              <div className="absolute inset-0 flex items-center justify-center">
                                <span className="text-2xl font-black text-white drop-shadow-lg">
                                  {die}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="text-center text-xs text-blue-400 font-bold">
                          Rolling...
                        </div>
                      </div>
                    )}
                  {phase === "rolling" &&
                    rollData.diceRolls &&
                    Array.from({
                      length: Math.max(
                        0,
                        rollData.diceRolls.length - completedSets.length - 1
                      ),
                    }).map((_, idx) => (
                      <div
                        key={`pbta-placeholder-${idx}`}
                        className="flex flex-col gap-2 opacity-30"
                      >
                        <div className="flex gap-2 items-center">
                          {Array.from({ length: 2 }).map((_, dIdx) => (
                            <div key={dIdx} className="relative">
                              <DynamicIcon
                                name="Dice6"
                                className="w-16 h-16 text-gray-600"
                              />
                              <div className="absolute inset-0 flex items-center justify-center">
                                <span className="text-2xl font-black text-gray-500">
                                  ?
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <div className="flex gap-4 items-center">
                  {displayDice.slice(0, 2).map((die, idx) => (
                    <div key={idx} className="relative">
                      <div
                        className={`transition-all duration-300 ${
                          phase === "rolling" ? "animate-spin-slow" : ""
                        }`}
                      >
                        <DynamicIcon
                          name="Dice6"
                          className={`w-20 h-20 ${getDiceColor()} transition-colors duration-500`}
                        />
                      </div>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span
                          className={`text-3xl font-black text-white drop-shadow-lg transition-all duration-300 ${
                            phase === "rolling"
                              ? "scale-110 opacity-70"
                              : "scale-125"
                          }`}
                        >
                          {die}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : !isYZE && isFate ? (
            // Fate System (4dF): show sets of 4 fudge dice when stacked (-1/0/+1)
            <div className="flex flex-col gap-4 items-center">
              {rollData.netAdvantage !== undefined &&
                rollData.netAdvantage !== 0 && (
                  <div className="text-center mb-2">
                    <p
                      className={`text-sm font-bold ${
                        rollData.netAdvantage > 0
                          ? "text-green-400"
                          : "text-red-400"
                      }`}
                    >
                      {rollData.netAdvantage > 0
                        ? `Rolling ${rollData.diceRolls?.length || 1} set${
                            (rollData.diceRolls?.length || 1) > 1 ? "s" : ""
                          }; keeping best total`
                        : `Rolling ${rollData.diceRolls?.length || 1} set${
                            (rollData.diceRolls?.length || 1) > 1 ? "s" : ""
                          }; keeping worst total`}
                    </p>
                    {(rollData.advantageSources ||
                      rollData.disadvantageSources) && (
                      <p className="text-xs text-gray-400 mt-1">
                        {rollData.netAdvantage > 0
                          ? rollData.advantageSources
                          : rollData.disadvantageSources}
                      </p>
                    )}
                  </div>
                )}
              {rollData.diceRolls && rollData.diceRolls.length > 1 ? (
                <div className="flex flex-wrap gap-4 justify-center">
                  {completedSets.map((diceSet, setIdx) => {
                    const setTotal = diceSet.reduce((a, b) => a + b, 0);
                    const isUsed =
                      phase !== "rolling" && setTotal === rollData.finalRoll;
                    return (
                      <div
                        key={`fate-done-${setIdx}`}
                        className={`flex flex-col gap-2 ${
                          isUsed
                            ? ""
                            : phase === "rolling"
                            ? "opacity-70"
                            : "opacity-40"
                        }`}
                      >
                        <div className="flex gap-2 items-center">
                          {diceSet.map((die, idx) => {
                            const dieColor =
                              die === 1
                                ? "text-green-400"
                                : die === -1
                                ? "text-red-400"
                                : "text-gray-400";
                            return (
                              <div key={idx} className="relative">
                                <DynamicIcon
                                  name="Dice6"
                                  className={`w-14 h-14 ${
                                    isUsed ? dieColor : "text-gray-600"
                                  } transition-colors duration-500`}
                                />
                                <div className="absolute inset-0 flex items-center justify-center">
                                  <span
                                    className={`text-xl font-black ${
                                      isUsed ? "text-white" : "text-gray-500"
                                    } drop-shadow-lg`}
                                  >
                                    {die > 0 ? `+${die}` : die}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <div className="text-center">
                          <span
                            className={`text-sm font-bold ${
                              isUsed ? "text-white" : "text-gray-500"
                            }`}
                          >
                            = {setTotal}
                          </span>
                          {isUsed && (
                            <div className="flex items-center justify-center gap-1 mt-1">
                              <DynamicIcon
                                name="Check"
                                className="w-3 h-3 text-green-400"
                              />
                              <span className="text-xs text-green-400 font-bold">
                                USED
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {phase === "rolling" &&
                    showingRollIndex < rollData.rolls.length && (
                      <div className="flex flex-col gap-2 animate-pulse">
                        <div className="flex gap-2 items-center">
                          {displayDice.slice(0, 4).map((die, idx) => {
                            const dieColor =
                              die === 1
                                ? "text-green-400"
                                : die === -1
                                ? "text-red-400"
                                : "text-gray-400";
                            return (
                              <div key={idx} className="relative">
                                <DynamicIcon
                                  name="Dice6"
                                  className={`w-14 h-14 ${dieColor}`}
                                />
                                <div className="absolute inset-0 flex items-center justify-center">
                                  <span className="text-xl font-black text-white drop-shadow-lg">
                                    {die > 0 ? `+${die}` : die}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <div className="text-center text-xs text-blue-400 font-bold">
                          Rolling...
                        </div>
                      </div>
                    )}
                  {phase === "rolling" &&
                    rollData.diceRolls &&
                    Array.from({
                      length: Math.max(
                        0,
                        rollData.diceRolls.length - completedSets.length - 1
                      ),
                    }).map((_, idx) => (
                      <div
                        key={`fate-placeholder-${idx}`}
                        className="flex flex-col gap-2 opacity-30"
                      >
                        <div className="flex gap-2 items-center">
                          {Array.from({ length: 4 }).map((_, dIdx) => (
                            <div key={dIdx} className="relative">
                              <DynamicIcon
                                name="Dice6"
                                className="w-14 h-14 text-gray-600"
                              />
                              <div className="absolute inset-0 flex items-center justify-center">
                                <span className="text-xl font-black text-gray-500">
                                  ?
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <div className="flex gap-2 items-center">
                  {displayDice.slice(0, 4).map((die, idx) => {
                    const dieColor =
                      die === 1
                        ? "text-green-400"
                        : die === -1
                        ? "text-red-400"
                        : "text-gray-400";
                    return (
                      <div key={idx} className="relative">
                        <div
                          className={`transition-all duration-300 ${
                            phase === "rolling" ? "animate-spin-slow" : ""
                          }`}
                        >
                          <DynamicIcon
                            name="Dice6"
                            className={`w-16 h-16 ${dieColor} transition-colors duration-500`}
                          />
                        </div>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span
                            className={`text-2xl font-black text-white drop-shadow-lg transition-all duration-300 ${
                              phase === "rolling"
                                ? "scale-110 opacity-70"
                                : "scale-125"
                            }`}
                          >
                            {die > 0 ? `+${die}` : die}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : !isYZE && (is1d20 || is1d100 || isPercentile) ? (
            // 1d20 System: Show single die with advantage/disadvantage
            <div className="flex flex-col gap-4 items-center">
              {/* Show advantage/disadvantage info */}
              {rollData.netAdvantage !== undefined &&
                rollData.netAdvantage !== 0 && (
                  <div className="text-center mb-2">
                    <p
                      className={`text-sm font-bold ${
                        rollData.netAdvantage > 0
                          ? "text-green-400"
                          : "text-red-400"
                      }`}
                    >
                      {(() => {
                        const baseText = `Rolling ${
                          Math.abs(rollData.netAdvantage) + 1
                        } dice, taking`;
                        // Roll-under systems (percentile) reverse advantage semantics
                        const isRollUnder = isPercentile; // 1d100 currently roll-over; percentile roll-under
                        if (rollData.netAdvantage > 0) {
                          return isRollUnder
                            ? `${baseText} lowest`
                            : `${baseText} highest`;
                        } else {
                          return isRollUnder
                            ? `${baseText} highest`
                            : `${baseText} lowest`;
                        }
                      })()}
                    </p>
                    {(rollData.advantageSources ||
                      rollData.disadvantageSources) && (
                      <p className="text-xs text-gray-400 mt-1">
                        {rollData.netAdvantage > 0
                          ? rollData.advantageSources
                          : rollData.disadvantageSources}
                      </p>
                    )}
                  </div>
                )}

              {rollData.rolls && rollData.rolls.length > 1 ? (
                <div className="flex flex-wrap gap-4 justify-center">
                  {rollData.rolls.map((roll, rollIdx) => {
                    const isUsed =
                      phase !== "rolling" && roll === rollData.finalRoll;
                    const isCurrent =
                      phase === "rolling" && rollIdx === showingRollIndex;
                    return (
                      <div
                        key={rollIdx}
                        className={`flex flex-col items-center gap-2 ${
                          isUsed
                            ? ""
                            : isCurrent
                            ? "animate-pulse"
                            : phase === "rolling"
                            ? "opacity-70"
                            : "opacity-40"
                        }`}
                      >
                        <div className="relative">
                          <DynamicIcon
                            name="Dices"
                            className={`w-20 h-20 ${
                              isUsed
                                ? getDiceColor()
                                : isCurrent
                                ? "text-blue-500"
                                : "text-gray-500"
                            } transition-colors duration-500`}
                          />
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span
                              className={`text-3xl font-black ${
                                isUsed
                                  ? "text-white"
                                  : isCurrent
                                  ? "text-blue-100"
                                  : "text-gray-600"
                              } drop-shadow-lg`}
                            >
                              {isCurrent ? displayRoll : roll}
                            </span>
                          </div>
                        </div>
                        {isUsed && (
                          <div className="flex items-center gap-1">
                            <DynamicIcon
                              name="Check"
                              className="w-3 h-3 text-green-400"
                            />
                            <span className="text-xs text-green-400 font-bold">
                              USED
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="relative">
                  <div
                    className={`transition-all duration-300 ${
                      phase === "rolling" ? "animate-spin-slow" : ""
                    }`}
                  >
                    <DynamicIcon
                      name="Dices"
                      className={`w-32 h-32 ${getDiceColor()} transition-colors duration-500`}
                    />
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span
                      className={`text-5xl font-black text-white drop-shadow-lg transition-all duration-300 ${
                        phase === "rolling"
                          ? "scale-110 opacity-70"
                          : "scale-125"
                      }`}
                    >
                      {phase === "complete" ? rollData.finalRoll : displayRoll}
                    </span>
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {/* YZE System: Show base dice + stress dice */}
          {isYZE && rollData.baseDice && (
            <div className="flex flex-col gap-4 items-center w-full">
              {/* Base Dice (Blue) */}
              {rollData.baseDice.length > 0 && (
                <div className="flex flex-col items-center">
                  <p className="text-xs text-blue-400 mb-2 font-bold uppercase tracking-wide">
                    Base Dice
                  </p>
                  <div className="flex gap-2 flex-wrap justify-center">
                    {rollData.baseDice.map((die, i) => (
                      <div
                        key={`base-${i}`}
                        className={`w-12 h-12 rounded-lg border-2 flex items-center justify-center font-black text-lg transition-all ${
                          die === 6
                            ? "bg-green-500 border-green-700 text-white shadow-lg shadow-green-500/50 scale-110"
                            : "bg-blue-100 dark:bg-blue-900 border-blue-500 text-blue-900 dark:text-blue-100"
                        }`}
                      >
                        {die}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Stress Dice (Red) */}
              {rollData.stressDice && rollData.stressDice.length > 0 && (
                <div className="flex flex-col items-center">
                  <p className="text-xs text-red-400 mb-2 font-bold uppercase tracking-wide">
                    Stress Dice
                  </p>
                  <div className="flex gap-2 flex-wrap justify-center">
                    {rollData.stressDice.map((die, i) => (
                      <div
                        key={`stress-${i}`}
                        className={`w-12 h-12 rounded-lg border-2 flex items-center justify-center font-black text-lg transition-all ${
                          die === 6
                            ? "bg-green-500 border-green-700 text-white shadow-lg shadow-green-500/50 scale-110"
                            : die === 1
                            ? "bg-red-900 border-red-500 text-red-200 animate-pulse shadow-lg shadow-red-500/50"
                            : "bg-red-100 dark:bg-red-900/50 border-red-500 text-red-900 dark:text-red-100"
                        }`}
                      >
                        {die}
                        {die === 1 && (
                          <DynamicIcon
                            name="Skull"
                            className="w-4 h-4 absolute -top-1 -right-1 text-red-500 animate-pulse"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Success Count */}
              <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700 w-full">
                <div className="flex items-center justify-center gap-3">
                  <DynamicIcon
                    name="Target"
                    className="w-5 h-5 text-yellow-400"
                  />
                  <span className="text-2xl font-black text-white">
                    {rollData.successes || 0}
                  </span>
                  <span className="text-gray-400">/</span>
                  <span className="text-xl font-bold text-gray-300">
                    {rollData.rpgSystem === "pbta" ? "7-9, 10+" : rollData.dc}
                  </span>
                  <span className="text-xs text-gray-500 uppercase tracking-wide">
                    Successes
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Critical Success Sparkles */}
          {rollData.critical && phase !== "rolling" && (
            <div className="absolute -inset-4 flex items-center justify-center pointer-events-none">
              <DynamicIcon
                name="Sparkles"
                className="w-12 h-12 text-yellow-400 animate-pulse absolute -top-6 -right-6"
              />
              <DynamicIcon
                name="Sparkles"
                className="w-8 h-8 text-yellow-400 animate-pulse absolute -bottom-4 -left-4"
              />
            </div>
          )}
        </div>

        {/* Roll Information */}
        {phase !== "rolling" && (
          <div className="space-y-3 animate-fade-in">
            {/* Multiple Rolls Display */}
            {rollData.rolls.length > 1 && (
              <div className="text-center text-sm text-gray-400">
                <span className="font-semibold">Rolls: </span>
                {rollData.rolls.map((roll, idx) => (
                  <span
                    key={idx}
                    className={`mx-1 ${
                      roll === rollData.finalRoll
                        ? "text-white font-bold underline"
                        : "line-through opacity-50"
                    }`}
                  >
                    {roll}
                  </span>
                ))}
              </div>
            )}

            {/* Skill Check Calculation */}
            <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
              {isPercentile ? (
                // Roll-under percentile system display
                <div className="text-center space-y-3">
                  <div className="text-gray-400 text-sm uppercase tracking-wide">
                    {rollData.statName} Roll-Under
                  </div>
                  <div className="flex items-center justify-center gap-3 text-2xl font-bold text-white">
                    <span
                      className={
                        rollData.critical
                          ? "text-purple-400"
                          : rollData.success
                          ? "text-green-400"
                          : "text-red-400"
                      }
                    >
                      {rollData.finalRoll}
                    </span>
                    <span className="text-gray-500">vs</span>
                    <span className="text-blue-400">
                      {rollData.penalty && rollData.penalty > 0
                        ? `${Math.max(
                            1,
                            rollData.statValue - rollData.penalty
                          )} (−${rollData.penalty})`
                        : rollData.statValue}
                    </span>
                  </div>
                  <div className="text-xs text-gray-400">
                    Roll ≤ Stat to succeed. Penalties reduce effective stat.
                  </div>
                </div>
              ) : (
                // Standard roll-over systems display (add stat to roll)
                <div className="text-center space-y-2">
                  <div className="text-gray-400 text-sm uppercase tracking-wide">
                    {rollData.statName} Check
                  </div>
                  <div className="flex items-center justify-center gap-2 text-2xl font-bold text-white">
                    <span
                      className={
                        rollData.critical
                          ? "text-purple-400"
                          : rollData.success
                          ? "text-green-400"
                          : "text-red-400"
                      }
                    >
                      {rollData.finalRoll}
                    </span>
                    {rollData.penalty && rollData.penalty > 0 && (
                      <span className="text-red-400">- {rollData.penalty}</span>
                    )}
                    <span className="text-gray-500">+</span>
                    <span className="text-blue-400">{rollData.statValue}</span>
                    <span className="text-gray-500">=</span>
                    <span className="text-white font-black">
                      {rollData.total}
                    </span>
                  </div>
                  <div className="flex items-center justify-center gap-2 pt-2 border-t border-gray-700">
                    <span className="text-gray-400 text-sm">DC</span>
                    <span className="text-orange-400 font-bold text-xl">
                      {rollData.rpgSystem === "pbta" ? "7-9, 10+" : rollData.dc}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Result Badge */}
            <div className="text-center">
              <div
                className={`inline-flex items-center gap-2 px-6 py-3 rounded-full font-black text-lg uppercase tracking-wider ${
                  rollData.critical
                    ? "bg-purple-500/20 text-purple-400 border-2 border-purple-500"
                    : rollData.style
                    ? "bg-amber-500/20 text-amber-400 border-2 border-amber-500"
                    : rollData.partial
                    ? "bg-yellow-500/20 text-yellow-400 border-2 border-yellow-500"
                    : rollData.tie
                    ? "bg-blue-400/20 text-blue-300 border-2 border-blue-400"
                    : rollData.success
                    ? "bg-green-500/20 text-green-400 border-2 border-green-500"
                    : "bg-red-500/20 text-red-400 border-2 border-red-500"
                }`}
              >
                {rollData.critical ? (
                  <>
                    <DynamicIcon name="Sparkles" className="w-5 h-5" />
                    Critical Success!
                  </>
                ) : rollData.style ? (
                  <>
                    <DynamicIcon name="Sparkles" className="w-5 h-5" />
                    Success with Style!
                  </>
                ) : rollData.partial ? (
                  <>
                    <DynamicIcon name="AlertTriangle" className="w-5 h-5" />
                    Partial Success
                  </>
                ) : rollData.tie ? (
                  <>
                    <DynamicIcon name="Scale" className="w-5 h-5" />
                    Tie
                  </>
                ) : rollData.success ? (
                  <>
                    <DynamicIcon name="Check" className="w-5 h-5" />
                    Success
                  </>
                ) : (
                  <>
                    <DynamicIcon name="X" className="w-5 h-5" />
                    Failure
                  </>
                )}
              </div>
            </div>

            {/* YZE: Panic Display */}
            {isYZE && rollData.panicTriggered && rollData.panicEffect && (
              <div className="bg-red-900/50 border-2 border-red-500 rounded-lg p-4 animate-pulse">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <DynamicIcon name="Skull" className="w-6 h-6 text-red-400" />
                  <h3 className="text-xl font-black text-red-200 uppercase tracking-wide">
                    💀 PANIC!
                  </h3>
                  <DynamicIcon name="Skull" className="w-6 h-6 text-red-400" />
                </div>
                <div className="text-center">
                  <p className="text-sm text-red-300 mb-1">
                    Stress dice showed 1s!
                  </p>
                  <div className="bg-red-950 rounded p-3 border border-red-700">
                    <p className="text-white font-bold text-base leading-relaxed">
                      {rollData.panicEffect}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* YZE: Stress Relief */}
            {isYZE && rollData.stressRelief && (
              <div className="bg-green-900/50 border-2 border-green-500 rounded-lg p-3 animate-fade-in">
                <div className="flex items-center justify-center gap-2">
                  <DynamicIcon
                    name="Heart"
                    className="w-5 h-5 text-green-400"
                  />
                  <p className="text-green-200 font-bold">
                    Strong Success! -1 Stress
                  </p>
                  <DynamicIcon
                    name="TrendingDown"
                    className="w-5 h-5 text-green-400"
                  />
                </div>
              </div>
            )}

            {/* YZE: Stress Level Display */}
            {isYZE && rollData.stressLevel !== undefined && (
              <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-white font-bold text-sm">
                    Stress Level
                  </span>
                  <span
                    className={`font-bold text-lg ${
                      rollData.stressLevel >= 8
                        ? "text-red-400 animate-pulse"
                        : rollData.stressLevel >= 5
                        ? "text-orange-400"
                        : "text-yellow-400"
                    }`}
                  >
                    {rollData.stressLevel}/10
                  </span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-3">
                  <div
                    className={`h-3 rounded-full transition-all ${
                      rollData.stressLevel >= 8
                        ? "bg-red-600 animate-pulse"
                        : rollData.stressLevel >= 5
                        ? "bg-orange-500"
                        : "bg-yellow-500"
                    }`}
                    style={{ width: `${(rollData.stressLevel / 10) * 100}%` }}
                  />
                </div>
                {rollData.stressLevel >= 8 && (
                  <p className="text-xs text-red-400 mt-2 text-center animate-pulse">
                    ⚠️ High stress! Severe panic risk!
                  </p>
                )}
              </div>
            )}

            {/* Item/Resource Used */}
            {(rollData.itemUsed || rollData.resourceUsed) && (
              <div className="text-center text-sm text-gray-400 space-y-1">
                {rollData.itemUsed && (
                  <div className="flex items-center justify-center gap-2">
                    <DynamicIcon name="Package" className="w-4 h-4" />
                    <span>Used: {rollData.itemUsed}</span>
                  </div>
                )}
                {rollData.resourceUsed && (
                  <div className="flex items-center justify-center gap-2">
                    <DynamicIcon name="Droplet" className="w-4 h-4" />
                    <span>Resource: {rollData.resourceUsed}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes fade-in {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes scale-in {
          from {
            transform: scale(0.8);
            opacity: 0;
          }
          to {
            transform: scale(1);
            opacity: 1;
          }
        }
        @keyframes spin-slow {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }
        .animate-scale-in {
          animation: scale-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .animate-spin-slow {
          animation: spin-slow 1.2s linear;
        }
      `}</style>
    </div>
  );
}
