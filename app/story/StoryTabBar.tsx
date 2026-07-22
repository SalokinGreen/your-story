"use client";

import { motion, useReducedMotion } from "framer-motion";
import { DynamicIcon } from "../components/DynamicIcon";

export interface StoryTab {
  /** StoryState enum value, passed back verbatim to onSelect */
  state: string;
  /** DynamicIcon name (Lucide PascalCase) */
  icon: string;
  label: string;
}

interface StoryTabBarProps {
  tabs: StoryTab[];
  currentState: string;
  onSelect: (state: string) => void;
}

export function StoryTabBar({ tabs, currentState, onSelect }: StoryTabBarProps) {
  const reduceMotion = useReducedMotion();
  const pillTransition = reduceMotion
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 500, damping: 34 };
  const iconTransition = reduceMotion
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 600, damping: 20 };
  const labelTransition = reduceMotion
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 500, damping: 38 };

  return (
    <nav
      aria-label="Story sections"
      className="relative z-30 bg-white/[0.04] backdrop-blur-xl rounded-none sm:rounded-xl border-x-0 sm:border border-white/10 p-2"
    >
      <div className="flex items-center justify-center gap-1 sm:gap-1.5">
        {tabs.map((tab) => {
          const active = currentState === tab.state;
          return (
            <button
              key={tab.state}
              type="button"
              onClick={() => onSelect(tab.state)}
              aria-current={active ? "page" : undefined}
              title={tab.label}
              className={`focus-ring relative flex items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 sm:px-3.5 sm:py-2 min-h-[44px] text-sm font-medium touch-manipulation transition-colors duration-200 ${
                active
                  ? "text-white"
                  : "text-blue-200/70 hover:text-white hover:bg-white/5 active:bg-white/10"
              }`}
            >
              {/* Morphing active pill - shared layoutId animates across tabs */}
              {active && (
                <motion.span
                  layoutId="activeTabPill"
                  className="absolute inset-0 -z-10 rounded-lg bg-linear-to-r from-purple-600 to-pink-600 shadow-[0_2px_12px_rgba(147,51,234,0.45)] ring-1 ring-purple-400/40"
                  transition={pillTransition}
                />
              )}

              {/* Icon with a small pop when it becomes active */}
              <motion.span
                className="flex items-center"
                animate={reduceMotion ? undefined : { scale: active ? 1.12 : 1 }}
                transition={iconTransition}
              >
                <DynamicIcon name={tab.icon} className="w-5 h-5 sm:w-4 sm:h-4" />
              </motion.span>

              {/* Desktop label: always visible, matches previous behavior */}
              <span className="hidden sm:inline">{tab.label}</span>

              {/* Mobile label: only the active tab reveals its label */}
              <span className="sm:hidden overflow-hidden">
                <motion.span
                  initial={false}
                  animate={{
                    width: active ? "auto" : 0,
                    opacity: active ? 1 : 0,
                    marginLeft: active ? 2 : 0,
                  }}
                  transition={labelTransition}
                  className="inline-block overflow-hidden whitespace-nowrap"
                >
                  {tab.label}
                </motion.span>
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export default StoryTabBar;
