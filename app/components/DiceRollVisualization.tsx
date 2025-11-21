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
  const [displayDice, setDisplayDice] = useState<number[]>([1, 1, 1]);

  // Determine dice system and configuration
  const rpgSystem = rollData.rpgSystem || "3d6";
  const is3d6 = rpgSystem === "3d6";
  const is1d20 = rpgSystem === "1d20";
  const is1d100 = rpgSystem === "1d100";
  const isPercentile = rpgSystem === "percentile";
  const isYZE = rpgSystem === "yze";
  const diceCount = is3d6 ? 3 : 1;
  const diceSides = is3d6 ? 6 : is1d20 ? 20 : 100;
  const minRoll = is3d6 ? 3 : 1;
  const maxRoll = is3d6 ? 18 : is1d20 ? 20 : 100;

  useEffect(() => {
    // Animate the dice rolling
    const rollDuration = 1200;
    const rollInterval = 50;
    const rollIterations = rollDuration / rollInterval;

    let iteration = 0;
    const interval = setInterval(() => {
      iteration++;
      // Random number animation
      if (is3d6) {
        // Animate 3 dice individually
        const randomDice = [
          Math.floor(Math.random() * diceSides) + 1,
          Math.floor(Math.random() * diceSides) + 1,
          Math.floor(Math.random() * diceSides) + 1,
        ];
        setDisplayDice(randomDice);
        setDisplayRoll(randomDice.reduce((a, b) => a + b, 0));
      } else {
        // Animate single die
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
            // If there are more rolls (advantage/disadvantage/reroll), show next
            setShowingRollIndex(showingRollIndex + 1);
          } else {
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
          {is3d6 ? (
            // 3d6 System: Show 3 dice
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
                      {phase === "complete"
                        ? (rollData.diceRolls &&
                            rollData.diceRolls[rollData.rolls.length - 1]?.[
                              idx
                            ]) ||
                          die
                        : die}
                    </span>
                  </div>
                </div>
              ))}
              {/* Plus signs between dice */}
              {phase !== "rolling" && (
                <>
                  <span
                    className="text-2xl text-gray-400 absolute"
                    style={{ left: "28%" }}
                  >
                    +
                  </span>
                  <span
                    className="text-2xl text-gray-400 absolute"
                    style={{ left: "62%" }}
                  >
                    +
                  </span>
                </>
              )}
            </div>
          ) : (
            // 1d20 System: Show single die
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
                    phase === "rolling" ? "scale-110 opacity-70" : "scale-125"
                  }`}
                >
                  {phase === "complete" ? rollData.finalRoll : displayRoll}
                </span>
              </div>
            </div>
          )}

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
                    {rollData.dc}
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
                      {rollData.dc}
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
