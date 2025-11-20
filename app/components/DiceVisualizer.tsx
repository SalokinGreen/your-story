"use client";

import { useEffect, useState } from "react";
import { DynamicIcon } from "./DynamicIcon";

interface DiceVisualizerProps {
  rolls: number[]; // Array of dice rolls (1 for normal, 2 for advantage/disadvantage)
  finalRoll: number;
  skillName: string;
  skillBonus: number;
  dc: number;
  isSuccess: boolean;
  isCritical?: boolean;
  hasAdvantage?: boolean;
  hasDisadvantage?: boolean;
  onComplete?: () => void;
}

export function DiceVisualizer({
  rolls,
  finalRoll,
  skillName,
  skillBonus,
  dc,
  isSuccess,
  isCritical,
  hasAdvantage,
  hasDisadvantage,
  onComplete,
}: DiceVisualizerProps) {
  const [currentNumber, setCurrentNumber] = useState(1);
  const [showResult, setShowResult] = useState(false);
  const [animationPhase, setAnimationPhase] = useState<"rolling" | "result">(
    "rolling"
  );

  useEffect(() => {
    // Rolling animation - count up rapidly
    const rollDuration = 1500; // 1.5 seconds of rolling
    const interval = 50; // Update every 50ms
    const steps = rollDuration / interval;
    let step = 0;

    const rollInterval = setInterval(() => {
      step++;
      // Random numbers during roll
      setCurrentNumber(Math.floor(Math.random() * 100) + 1);

      if (step >= steps) {
        clearInterval(rollInterval);
        // Show final result
        setCurrentNumber(finalRoll);
        setAnimationPhase("result");

        // Show full result breakdown after a delay
        setTimeout(() => {
          setShowResult(true);
          setTimeout(() => {
            onComplete?.();
          }, 2000);
        }, 500);
      }
    }, interval);

    return () => clearInterval(rollInterval);
  }, [finalRoll, onComplete]);

  const total = finalRoll + skillBonus;
  const resultColor = isCritical
    ? "text-yellow-500"
    : isSuccess
    ? "text-green-500"
    : "text-red-500";

  const bgColor = isCritical
    ? "bg-gradient-to-br from-yellow-500/20 to-amber-500/20 border-yellow-500"
    : isSuccess
    ? "bg-gradient-to-br from-green-500/20 to-emerald-500/20 border-green-500"
    : "bg-gradient-to-br from-red-500/20 to-rose-500/20 border-red-500";

  const diceColor = isCritical
    ? "text-yellow-400"
    : isSuccess
    ? "text-green-400"
    : "text-red-400";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div
        className={`${bgColor} border-4 rounded-3xl p-8 max-w-md w-full mx-4 shadow-2xl animate-scaleIn`}
      >
        {/* Dice Rolling Display */}
        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-4 mb-4">
            {/* Show multiple dice for advantage/disadvantage */}
            {rolls.map((roll, index) => (
              <div
                key={index}
                className={`relative ${
                  animationPhase === "rolling" ? "animate-spin" : ""
                } ${
                  rolls.length > 1 && roll !== finalRoll
                    ? "opacity-50 scale-90"
                    : "scale-110"
                }`}
              >
                <DynamicIcon
                  name="Dices"
                  className={`w-20 h-20 ${diceColor} drop-shadow-lg`}
                />
                {animationPhase === "result" && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-2xl font-bold text-white drop-shadow-md">
                      {roll}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Advantage/Disadvantage Label */}
          {(hasAdvantage || hasDisadvantage) && (
            <div className="mb-3">
              <span
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold ${
                  hasAdvantage
                    ? "bg-blue-500/30 text-blue-200 border border-blue-400"
                    : "bg-orange-500/30 text-orange-200 border border-orange-400"
                }`}
              >
                <DynamicIcon
                  name={hasAdvantage ? "TrendingUp" : "TrendingDown"}
                  className="w-4 h-4"
                />
                {hasAdvantage ? "Advantage" : "Disadvantage"}
              </span>
            </div>
          )}

          {/* Rolling Number */}
          <div className="mb-4">
            <div
              className={`text-8xl font-bold ${resultColor} ${
                animationPhase === "rolling"
                  ? "animate-pulse"
                  : "animate-bounce"
              } drop-shadow-2xl`}
            >
              {currentNumber}
            </div>
          </div>

          {/* Skill Name */}
          <div className="text-2xl font-semibold text-white mb-2">
            {skillName}
          </div>
        </div>

        {/* Result Breakdown */}
        {showResult && (
          <div className="space-y-3 animate-slideUp">
            {/* Calculation */}
            <div className="bg-black/30 rounded-xl p-4 backdrop-blur-sm border border-white/10">
              <div className="flex items-center justify-center gap-3 text-xl font-mono">
                <span className={`${resultColor} font-bold text-3xl`}>
                  {finalRoll}
                </span>
                <span className="text-white/60">+</span>
                <span className="text-blue-300 font-semibold">
                  {skillBonus}
                </span>
                <span className="text-white/60">=</span>
                <span className={`${resultColor} font-bold text-3xl`}>
                  {total}
                </span>
              </div>
              <div className="text-center mt-2 text-sm text-white/70">
                Roll + Skill Bonus = Total
              </div>
            </div>

            {/* DC Comparison */}
            <div className="bg-black/30 rounded-xl p-4 backdrop-blur-sm border border-white/10">
              <div className="flex items-center justify-center gap-3 text-xl">
                <span className={`${resultColor} font-bold text-2xl`}>
                  {total}
                </span>
                <span className="text-white/60">{isSuccess ? "≥" : "<"}</span>
                <span className="text-purple-300 font-bold text-2xl">{dc}</span>
              </div>
              <div className="text-center mt-2 text-sm text-white/70">
                Total vs DC
              </div>
            </div>

            {/* Success/Failure Message */}
            <div
              className={`text-center py-3 px-4 rounded-xl font-bold text-xl ${
                isCritical
                  ? "bg-yellow-500/20 text-yellow-200 border-2 border-yellow-400"
                  : isSuccess
                  ? "bg-green-500/20 text-green-200 border-2 border-green-400"
                  : "bg-red-500/20 text-red-200 border-2 border-red-400"
              }`}
            >
              {isCritical ? (
                <div className="flex items-center justify-center gap-2">
                  <DynamicIcon name="Zap" className="w-6 h-6" />
                  Critical Success!
                  <DynamicIcon name="Zap" className="w-6 h-6" />
                </div>
              ) : isSuccess ? (
                <div className="flex items-center justify-center gap-2">
                  <DynamicIcon name="CheckCircle" className="w-6 h-6" />
                  Success!
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2">
                  <DynamicIcon name="XCircle" className="w-6 h-6" />
                  Failure
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <style jsx global>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes scaleIn {
          from {
            transform: scale(0.8);
            opacity: 0;
          }
          to {
            transform: scale(1);
            opacity: 1;
          }
        }

        @keyframes slideUp {
          from {
            transform: translateY(20px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }

        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }

        .animate-scaleIn {
          animation: scaleIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        .animate-slideUp {
          animation: slideUp 0.4s ease-out;
        }
      `}</style>
    </div>
  );
}
