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
  isPartial?: boolean; // For PbtA partial success
  isTie?: boolean; // For Fate tie
  isStyle?: boolean; // For Fate success with style
  isCritical?: boolean;
  hasAdvantage?: boolean;
  hasDisadvantage?: boolean;
  onComplete?: () => void;
  diceRolls?: number[][]; // Individual dice for each roll (for 3d6 system)
  rpgSystem?: "3d6" | "1d20" | "1d100" | "percentile" | "pbta" | "fate" | "yze"; // RPG system type
  // YZE-specific
  baseDice?: number[]; // Base dice from stat
  stressDice?: number[]; // Stress dice added
  successes?: number; // Count of 6s
  panicTriggered?: boolean;
  panicEffect?: string;
  stressLevel?: number;
  stressRelief?: boolean;
}

export function DiceVisualizer({
  rolls,
  finalRoll,
  skillName,
  skillBonus,
  dc,
  isSuccess,
  isPartial,
  isTie,
  isStyle,
  isCritical,
  hasAdvantage,
  hasDisadvantage,
  onComplete,
  diceRolls,
  rpgSystem = "3d6",
  baseDice,
  stressDice,
  successes,
  panicTriggered,
  panicEffect,
  stressLevel,
  stressRelief,
}: DiceVisualizerProps) {
  // Determine dice system configuration
  const is3d6 = rpgSystem === "3d6";
  const is1d20 = rpgSystem === "1d20";
  const is1d100 = rpgSystem === "1d100";
  const isPercentile = rpgSystem === "percentile";
  const isYZE = rpgSystem === "yze";
  const diceCount = is3d6 ? 3 : 1;
  const diceSides = is3d6 ? 6 : is1d20 ? 20 : 100;
  const minRoll = is3d6 ? 3 : 1;
  const maxRoll = is3d6 ? 18 : is1d20 ? 20 : 100;

  const [currentNumber, setCurrentNumber] = useState(minRoll);
  const [currentDice, setCurrentDice] = useState<number[]>(() => {
    if (isYZE) {
      const totalDice = (baseDice?.length || 0) + (stressDice?.length || 0);
      return Array(totalDice).fill(1);
    }
    return is3d6 ? [1, 1, 1] : [1];
  });
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
      if (isYZE) {
        // Animate YZE dice pool (base + stress dice)
        const baseCount = baseDice?.length || 0;
        const stressCount = stressDice?.length || 0;
        const totalCount = baseCount + stressCount;
        const randomDice: number[] = [];
        for (let i = 0; i < totalCount; i++) {
          randomDice.push(Math.floor(Math.random() * 6) + 1);
        }
        setCurrentDice(randomDice);
        setCurrentNumber(randomDice.reduce((a, b) => a + b, 0));
      } else if (is3d6) {
        // Animate 3 dice
        const randomDice = [
          Math.floor(Math.random() * diceSides) + 1,
          Math.floor(Math.random() * diceSides) + 1,
          Math.floor(Math.random() * diceSides) + 1,
        ];
        setCurrentDice(randomDice);
        setCurrentNumber(randomDice.reduce((a, b) => a + b, 0));
      } else {
        // Animate single die
        const randomRoll = Math.floor(Math.random() * diceSides) + 1;
        setCurrentDice([randomRoll]);
        setCurrentNumber(randomRoll);
      }
      if (elapsed >= DURATIONS.rolling) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = null;

        if (isYZE) {
          // YZE: Set final dice (base + stress combined)
          const finalDice = [...(baseDice || []), ...(stressDice || [])];
          setCurrentDice(finalDice);
          setCurrentNumber(finalDice.reduce((a, b) => a + b, 0));
        } else {
          setCurrentNumber(finalRoll);
          // Set the actual final dice if available
          if (is3d6 && diceRolls && diceRolls[rolls.length - 1]) {
            setCurrentDice(diceRolls[rolls.length - 1]);
          } else {
            setCurrentDice([finalRoll]);
          }
        }

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
  }, [
    finalRoll,
    is3d6,
    isYZE,
    baseDice,
    stressDice,
    diceSides,
    diceRolls,
    rolls.length,
  ]);

  const skipAnimation = useCallback(() => {
    if (skippedRef.current) return;
    skippedRef.current = true;
    clearAllTimers();

    if (isYZE) {
      // YZE: Set final dice (base + stress combined)
      const finalDice = [...(baseDice || []), ...(stressDice || [])];
      setCurrentDice(finalDice);
      setCurrentNumber(finalDice.reduce((a, b) => a + b, 0));
    } else {
      setCurrentNumber(finalRoll);
      // Set the actual final dice if available
      if (is3d6 && diceRolls && diceRolls[rolls.length - 1]) {
        setCurrentDice(diceRolls[rolls.length - 1]);
      } else {
        setCurrentDice([finalRoll]);
      }
    }

    setAnimationPhase("result");
    setShowResult(true);
    // Shorter hold after skip
    scheduleTimeout(() => {
      onCompleteRef.current?.();
    }, 800);
  }, [finalRoll, is3d6, isYZE, baseDice, stressDice, diceRolls, rolls.length]);

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

  // For roll-under percentile system, we don't add the stat/skill bonus to the roll.
  const isRollUnder = isPercentile;
  const effectiveStat = isRollUnder ? skillBonus : skillBonus; // same var for clarity
  const total = isRollUnder ? finalRoll : finalRoll + skillBonus;

  // Colors based on animation phase
  const isResultPhase = animationPhase === "result";
  const isCalculating = animationPhase === "calculating";
  const isStopped = animationPhase === "stopped";
  const isRolling = animationPhase === "rolling";

  const resultColor =
    isRolling || isStopped || isCalculating
      ? "text-blue-500"
      : isCritical
      ? "text-purple-500"
      : isStyle
      ? "text-amber-500"
      : isPartial
      ? "text-orange-500"
      : isTie
      ? "text-blue-400"
      : isSuccess
      ? "text-green-500"
      : "text-red-500";

  const bgColor =
    isRolling || isStopped || isCalculating
      ? "bg-linear-to-br from-blue-500/20 to-cyan-500/20 border-blue-500"
      : isCritical
      ? "bg-linear-to-br from-purple-500/20 to-violet-500/20 border-purple-500"
      : isStyle
      ? "bg-linear-to-br from-amber-500/20 to-yellow-500/20 border-amber-500"
      : isPartial
      ? "bg-linear-to-br from-orange-500/20 to-yellow-500/20 border-orange-500"
      : isTie
      ? "bg-linear-to-br from-blue-400/20 to-cyan-400/20 border-blue-400"
      : isSuccess
      ? "bg-linear-to-br from-green-500/20 to-emerald-500/20 border-green-500"
      : "bg-linear-to-br from-red-500/20 to-rose-500/20 border-red-500";

  const diceColor =
    isRolling || isStopped || isCalculating
      ? "text-blue-400"
      : isCritical
      ? "text-purple-400"
      : isStyle
      ? "text-amber-400"
      : isPartial
      ? "text-orange-400"
      : isTie
      ? "text-blue-300"
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
          {isYZE ? (
            // YZE System
            <>
              {isRolling || isStopped || isCalculating ? (
                // Rolling phase: show pooled animated dice
                <div className="flex flex-col items-center gap-3 mb-4">
                  <p className="text-xs text-red-300 font-bold uppercase tracking-wide">
                    Rolling Stress Dice Pool
                  </p>
                  <div className="flex gap-2 flex-wrap justify-center">
                    {currentDice.length === 0 && (
                      <span className="text-gray-400 text-sm">
                        No dice to roll
                      </span>
                    )}
                    {currentDice.map((die, i) => (
                      <div
                        key={`yze-rolling-${i}`}
                        className="w-10 h-10 rounded-lg border-2 border-red-500 bg-red-900/60 flex items-center justify-center text-lg font-bold text-red-100 animate-pulse"
                      >
                        {die}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                // Result phase: show split base/stress dice with styling
                <div className="flex flex-col gap-4">
                  {/* Base Dice */}
                  {baseDice && baseDice.length > 0 && (
                    <div className="flex flex-col items-center">
                      <p className="text-xs text-blue-400 mb-2 font-bold uppercase tracking-wide">
                        Base Dice
                      </p>
                      <div className="flex gap-2 flex-wrap justify-center">
                        {baseDice.map((die, i) => (
                          <div
                            key={`base-${i}`}
                            className={`w-14 h-14 rounded-lg border-2 flex items-center justify-center font-black text-xl transition-all ${
                              die === 6
                                ? "bg-green-500 border-green-700 text-white shadow-lg shadow-green-500/50 scale-110"
                                : "bg-blue-200 dark:bg-blue-800 border-blue-500 text-blue-900 dark:text-blue-100"
                            }`}
                          >
                            {die}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Stress Dice */}
                  {stressDice && stressDice.length > 0 && (
                    <div className="flex flex-col items-center">
                      <p className="text-xs text-red-400 mb-2 font-bold uppercase tracking-wide">
                        Stress Dice
                      </p>
                      <div className="flex gap-2 flex-wrap justify-center">
                        {stressDice.map((die, i) => (
                          <div
                            key={`stress-${i}`}
                            className={`w-14 h-14 rounded-lg border-2 flex items-center justify-center font-black text-xl transition-all relative ${
                              die === 6
                                ? "bg-green-500 border-green-700 text-white shadow-lg shadow-green-500/50 scale-110"
                                : die === 1
                                ? "bg-red-900 border-red-500 text-red-200 animate-pulse shadow-lg shadow-red-500/50"
                                : "bg-red-200 dark:bg-red-900/50 border-red-500 text-red-900 dark:text-red-100"
                            }`}
                          >
                            {die}
                            {die === 1 && (
                              <DynamicIcon
                                name="Skull"
                                className="w-5 h-5 absolute -top-2 -right-2 text-red-400 animate-pulse"
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Success Count */}
                  <div className="bg-gray-900/50 rounded-lg p-4 border-2 border-gray-600">
                    <div className="flex items-center justify-center gap-3">
                      <DynamicIcon
                        name="Target"
                        className="w-6 h-6 text-yellow-400"
                      />
                      <span className="text-4xl font-black text-white">
                        {successes || 0}
                      </span>
                      <span className="text-gray-400 text-2xl">/</span>
                      <span className="text-3xl font-bold text-gray-300">
                        {dc}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-2 uppercase tracking-wide">
                      Successes (6s rolled)
                    </p>
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center justify-center gap-4 mb-4">
                {is3d6 ? (
                  // 3d6 System: Show 3 individual dice
                  <div className="flex gap-3 items-center">
                    {currentDice.map((die, index) => (
                      <div
                        key={index}
                        className={`relative ${
                          animationPhase === "rolling" ? "animate-spin" : ""
                        }`}
                      >
                        <DynamicIcon
                          name="Dice6"
                          className={`w-16 h-16 ${diceColor} drop-shadow-lg`}
                        />
                        {animationPhase !== "rolling" && (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-2xl font-bold text-white drop-shadow-md">
                              {die}
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  // 1d20 System: Show single die
                  <div
                    className={`relative ${
                      animationPhase === "rolling" ? "animate-spin" : ""
                    }`}
                  >
                    <DynamicIcon
                      name="Dices"
                      className={`w-20 h-20 ${diceColor} drop-shadow-lg`}
                    />
                    {animationPhase === "result" && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-2xl font-bold text-white drop-shadow-md">
                          {currentDice[0]}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Advantage/Disadvantage Label */}
          {!isYZE && (hasAdvantage || hasDisadvantage) && (
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

          {!isYZE && (
            <>
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
                    {isRollUnder ? (
                      <div className="flex items-center gap-4 text-6xl font-bold text-white">
                        <span
                          className={`${resultColor} transition-all duration-500 ${
                            isResultPhase ? "scale-150" : "scale-100"
                          }`}
                        >
                          {finalRoll}
                        </span>
                        <span className="text-gray-300 text-4xl">vs</span>
                        <span
                          className={`text-blue-300 transition-all duration-500 ${
                            isResultPhase ? "scale-150" : "scale-100"
                          }`}
                        >
                          {effectiveStat}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-4 text-6xl font-bold text-white">
                        <span
                          className={`${resultColor} transition-all duration-500 ${
                            isResultPhase
                              ? "scale-0 w-0 opacity-0"
                              : "scale-100"
                          }`}
                        >
                          {finalRoll}
                        </span>
                        <span
                          className={`text-blue-300 transition-all duration-500 ${
                            isResultPhase
                              ? "scale-0 w-0 opacity-0"
                              : "scale-100"
                          }`}
                        >
                          +{skillBonus}
                        </span>
                        <span
                          className={`transition-all duration-500 ${
                            isResultPhase
                              ? "scale-150"
                              : "scale-0 opacity-0 w-0"
                          } ${resultColor}`}
                        >
                          {total}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Skill Name & DC */}
          <div className="flex flex-col items-center gap-1 mb-2">
            <div className="text-2xl font-semibold text-white">{skillName}</div>
            {isRollUnder ? (
              <div className="flex items-center gap-2 text-white/80 bg-black/20 px-3 py-1 rounded-full">
                <span className="text-sm uppercase tracking-wider font-bold">
                  Stat
                </span>
                <span className="text-xl font-bold text-blue-300">
                  {effectiveStat}
                </span>
                <span className="text-xs text-gray-300 ml-2">
                  Roll ≤ Stat to succeed
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-white/80 bg-black/20 px-3 py-1 rounded-full">
                <span className="text-sm uppercase tracking-wider font-bold">
                  DC
                </span>
                <span className="text-xl font-bold text-purple-300">{dc}</span>
              </div>
            )}
          </div>
        </div>

        {/* Result Breakdown */}
        {showResult && (
          <div className="space-y-3 animate-slideUp">
            {/* Success/Failure Message */}
            <div
              className={`text-center py-3 px-4 rounded-xl font-bold text-xl ${
                isCritical
                  ? "bg-purple-500/20 text-purple-200 border-2 border-purple-400"
                  : isStyle
                  ? "bg-amber-500/20 text-amber-200 border-2 border-amber-400"
                  : isPartial
                  ? "bg-orange-500/20 text-orange-200 border-2 border-orange-400"
                  : isTie
                  ? "bg-blue-400/20 text-blue-200 border-2 border-blue-400"
                  : isSuccess
                  ? "bg-green-500/20 text-green-200 border-2 border-green-400"
                  : "bg-red-500/20 text-red-200 border-2 border-red-400"
              }`}
            >
              {isCritical ? (
                <div className="flex items-center justify-center gap-2">
                  <DynamicIcon name="Sparkles" className="w-6 h-6" />
                  Critical Success!
                  <DynamicIcon name="Sparkles" className="w-6 h-6" />
                </div>
              ) : isStyle ? (
                <div className="flex items-center justify-center gap-2">
                  <DynamicIcon name="Sparkles" className="w-6 h-6" />
                  Success with Style!
                </div>
              ) : isPartial ? (
                <div className="flex items-center justify-center gap-2">
                  <DynamicIcon name="AlertTriangle" className="w-6 h-6" />
                  Partial Success
                </div>
              ) : isTie ? (
                <div className="flex items-center justify-center gap-2">
                  <DynamicIcon name="Scale" className="w-6 h-6" />
                  Tie
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

            {/* YZE: Panic Display */}
            {isYZE && panicTriggered && panicEffect && (
              <div className="bg-red-900/50 border-2 border-red-500 rounded-xl p-4 animate-pulse mt-4">
                <div className="flex items-center justify-center gap-2 mb-3">
                  <DynamicIcon name="Skull" className="w-7 h-7 text-red-300" />
                  <h3 className="text-2xl font-black text-red-100 uppercase tracking-wide">
                    💀 PANIC!
                  </h3>
                  <DynamicIcon name="Skull" className="w-7 h-7 text-red-300" />
                </div>
                <div className="text-center">
                  <p className="text-sm text-red-300 mb-2">
                    Stress dice showed 1s!
                  </p>
                  <div className="bg-red-950 rounded-lg p-4 border border-red-700">
                    <p className="text-white font-bold text-base leading-relaxed">
                      {panicEffect}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* YZE: Stress Relief */}
            {isYZE && stressRelief && (
              <div className="bg-green-900/50 border-2 border-green-500 rounded-xl p-3 mt-4">
                <div className="flex items-center justify-center gap-2">
                  <DynamicIcon
                    name="Heart"
                    className="w-6 h-6 text-green-300"
                  />
                  <p className="text-green-100 font-bold text-lg">
                    Strong Success! -1 Stress
                  </p>
                  <DynamicIcon
                    name="TrendingDown"
                    className="w-6 h-6 text-green-300"
                  />
                </div>
              </div>
            )}

            {/* YZE: Stress Level */}
            {isYZE && stressLevel !== undefined && (
              <div className="bg-gray-900/50 rounded-lg p-4 border-2 border-gray-600 mt-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-white font-bold">Stress Level</span>
                  <span
                    className={`font-bold text-xl ${
                      stressLevel >= 8
                        ? "text-red-300 animate-pulse"
                        : stressLevel >= 5
                        ? "text-orange-300"
                        : "text-yellow-300"
                    }`}
                  >
                    {stressLevel}/10
                  </span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-4">
                  <div
                    className={`h-4 rounded-full transition-all ${
                      stressLevel >= 8
                        ? "bg-red-600 animate-pulse"
                        : stressLevel >= 5
                        ? "bg-orange-500"
                        : "bg-yellow-500"
                    }`}
                    style={{ width: `${(stressLevel / 10) * 100}%` }}
                  />
                </div>
                {stressLevel >= 8 && (
                  <p className="text-xs text-red-300 mt-2 text-center animate-pulse">
                    ⚠️ High stress! Severe panic risk!
                  </p>
                )}
              </div>
            )}
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
