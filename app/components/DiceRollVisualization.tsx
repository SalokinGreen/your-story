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
  critical?: boolean;
  penalty?: number;
  itemUsed?: string;
  resourceUsed?: string;
  momentumUsed?: "reroll" | "guarantee";
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

  useEffect(() => {
    // Animate the dice rolling
    const rollDuration = 1200;
    const rollInterval = 50;
    const rollIterations = rollDuration / rollInterval;

    let iteration = 0;
    const interval = setInterval(() => {
      iteration++;
      // Random number animation
      setDisplayRoll(Math.floor(Math.random() * 100) + 1);

      if (iteration >= rollIterations) {
        clearInterval(interval);
        // Show actual roll result
        setDisplayRoll(rollData.rolls[showingRollIndex]);
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
  }, [showingRollIndex]);

  const getRollTypeLabel = () => {
    if (rollData.momentumUsed === "reroll") return "Reroll";
    if (rollData.type === "advantage") return "Advantage";
    if (rollData.type === "disadvantage") return "Disadvantage";
    if (rollData.type === "reroll") return "Momentum Reroll";
    return "Roll";
  };

  const getRollTypeColor = () => {
    if (rollData.type === "advantage" || rollData.momentumUsed === "reroll")
      return "text-green-500";
    if (rollData.type === "disadvantage") return "text-red-500";
    return "text-blue-500";
  };

  const getDiceColor = () => {
    if (phase === "rolling") return "text-gray-400 dark:text-gray-500";
    if (rollData.critical) return "text-purple-500";
    if (rollData.success) return "text-green-500";
    return "text-red-500";
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-gradient-to-b from-gray-800 to-gray-900 rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4 border-2 border-gray-700 animate-scale-in">
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

        {/* D20 Dice Visual */}
        <div className="flex justify-center mb-6">
          <div className="relative">
            {/* Dice Icon */}
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

            {/* Roll Number Overlay */}
            <div className="absolute inset-0 flex items-center justify-center">
              <span
                className={`text-5xl font-black text-white drop-shadow-lg transition-all duration-300 ${
                  phase === "rolling" ? "scale-110 opacity-70" : "scale-125"
                }`}
              >
                {phase === "complete" ? rollData.finalRoll : displayRoll}
              </span>
            </div>

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
                    <>
                      <span className="text-red-400">- {rollData.penalty}</span>
                    </>
                  )}
                  <span className="text-gray-500">+</span>
                  <span className="text-blue-400">{rollData.statValue}</span>
                  <span className="text-gray-500">=</span>
                  <span className="text-white font-black">
                    {rollData.total}
                  </span>
                </div>

                {/* DC Display */}
                <div className="flex items-center justify-center gap-2 pt-2 border-t border-gray-700">
                  <span className="text-gray-400 text-sm">DC</span>
                  <span className="text-orange-400 font-bold text-xl">
                    {rollData.dc}
                  </span>
                </div>
              </div>
            </div>

            {/* Result Badge */}
            <div className="text-center">
              <div
                className={`inline-flex items-center gap-2 px-6 py-3 rounded-full font-black text-lg uppercase tracking-wider ${
                  rollData.critical
                    ? "bg-purple-500/20 text-purple-400 border-2 border-purple-500"
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
