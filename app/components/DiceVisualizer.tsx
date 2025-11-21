"use client";

import { useEffect, useState, useRef, useCallback } from "react";
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
  const [animationPhase, setAnimationPhase] = useState<
    "rolling" | "stopped" | "calculating" | "result"
  >("rolling");

  // Tunable durations (ms)
  const DURATIONS = {
    rolling: 1500,
    stopped: 500,
    calculating: 800,
    resultHold: 1900, // time after result appears
    numberInterval: 50,
  } as const;

  const onCompleteRef = useRef(onComplete);
  const intervalRef = useRef<number | null>(null);
  const timeoutsRef = useRef<number[]>([]);
  const skippedRef = useRef(false);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const clearAllTimers = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    timeoutsRef.current.forEach((id) => clearTimeout(id));
    timeoutsRef.current = [];
  };

  const scheduleTimeout = (fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    timeoutsRef.current.push(id);
  };

  const startSequence = useCallback(() => {
    // Rolling phase
    let elapsed = 0;
    intervalRef.current = window.setInterval(() => {
      elapsed += DURATIONS.numberInterval;
      setCurrentNumber(Math.floor(Math.random() * 100) + 1);
      if (elapsed >= DURATIONS.rolling) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = null;
        setCurrentNumber(finalRoll);
        setAnimationPhase("stopped");
        // Stopped -> calculating
        scheduleTimeout(() => {
          if (skippedRef.current) return;
          setAnimationPhase("calculating");
          // Calculating -> result
          scheduleTimeout(() => {
            if (skippedRef.current) return;
            setAnimationPhase("result");
            setShowResult(true);
            // Result hold then complete
            scheduleTimeout(() => {
              onCompleteRef.current?.();
            }, DURATIONS.resultHold);
          }, DURATIONS.calculating);
        }, DURATIONS.stopped);
      }
    }, DURATIONS.numberInterval);
  }, [finalRoll]);

  const skipAnimation = useCallback(() => {
    if (skippedRef.current) return;
    skippedRef.current = true;
    clearAllTimers();
    setCurrentNumber(finalRoll);
    setAnimationPhase("result");
    setShowResult(true);
    // Shorter hold after skip
    scheduleTimeout(() => {
      onCompleteRef.current?.();
    }, 800);
  }, [finalRoll]);

  useEffect(() => {
    startSequence();
    return () => clearAllTimers();
  }, [startSequence]);

  // Keyboard skip
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (["Enter", " ", "Spacebar", "Escape"].includes(e.key)) {
        skipAnimation();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [skipAnimation]);

  const total = finalRoll + skillBonus;

  // Colors based on animation phase
  const isResultPhase = animationPhase === "result";
  const isCalculating = animationPhase === "calculating";
  const isStopped = animationPhase === "stopped";
  const isRolling = animationPhase === "rolling";

  const resultColor =
    isRolling || isStopped || isCalculating
      ? "text-blue-500"
      : isCritical
      ? "text-yellow-500"
      : isSuccess
      ? "text-green-500"
      : "text-red-500";

  const bgColor =
    isRolling || isStopped || isCalculating
      ? "bg-linear-to-br from-blue-500/20 to-cyan-500/20 border-blue-500"
      : isCritical
      ? "bg-linear-to-br from-yellow-500/20 to-amber-500/20 border-yellow-500"
      : isSuccess
      ? "bg-linear-to-br from-green-500/20 to-emerald-500/20 border-green-500"
      : "bg-linear-to-br from-red-500/20 to-rose-500/20 border-red-500";

  const diceColor =
    isRolling || isStopped || isCalculating
      ? "text-blue-400"
      : isCritical
      ? "text-yellow-400"
      : isSuccess
      ? "text-green-400"
      : "text-red-400";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fadeIn"
      onClick={skipAnimation}
      role="button"
      aria-label="Skip dice animation"
      tabIndex={0}
      onKeyDown={(e) => {
        if (["Enter", " ", "Spacebar", "Escape"].includes(e.key)) {
          e.preventDefault();
          skipAnimation();
        }
      }}
    >
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
          <div className="mb-4 relative h-32 flex items-center justify-center">
            {/* Main Number */}
            <div
              className={`absolute inset-0 flex items-center justify-center text-8xl font-bold ${resultColor} transition-all duration-500 ${
                isRolling
                  ? "animate-pulse"
                  : isStopped
                  ? "scale-100 opacity-100"
                  : "scale-50 opacity-0"
              } drop-shadow-2xl`}
            >
              {currentNumber}
            </div>

            {/* Calculation Animation */}
            {(isCalculating || isResultPhase) && (
              <div className="absolute inset-0 flex items-center justify-center animate-fadeIn">
                <div className="flex items-center gap-4 text-6xl font-bold text-white">
                  <span
                    className={`${resultColor} transition-all duration-500 ${
                      isResultPhase ? "scale-0 w-0 opacity-0" : "scale-100"
                    }`}
                  >
                    {finalRoll}
                  </span>
                  <span
                    className={`text-blue-300 transition-all duration-500 ${
                      isResultPhase ? "scale-0 w-0 opacity-0" : "scale-100"
                    }`}
                  >
                    +{skillBonus}
                  </span>
                  <span
                    className={`transition-all duration-500 ${
                      isResultPhase ? "scale-150" : "scale-0 opacity-0 w-0"
                    } ${resultColor}`}
                  >
                    {total}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Skill Name & DC */}
          <div className="flex flex-col items-center gap-1 mb-2">
            <div className="text-2xl font-semibold text-white">{skillName}</div>
            <div className="flex items-center gap-2 text-white/80 bg-black/20 px-3 py-1 rounded-full">
              <span className="text-sm uppercase tracking-wider font-bold">
                DC
              </span>
              <span className="text-xl font-bold text-purple-300">{dc}</span>
            </div>
          </div>
        </div>

        {/* Result Breakdown */}
        {showResult && (
          <div className="space-y-3 animate-slideUp">
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
