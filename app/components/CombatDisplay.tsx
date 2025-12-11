"use client";

import React, { useState } from "react";
import { CombatState, Combatant, CombatCondition } from "../misc/structs";
import { DynamicIcon } from "./DynamicIcon";

interface CombatDisplayProps {
  combatState: CombatState;
  expanded?: boolean;
  onToggleExpand?: () => void;
}

/**
 * Get stat color based on stat name and value
 */
function getStatColor(statName: string, _value: number, _max?: number): string {
  const lowercaseName = statName.toLowerCase();

  // Health-related stats
  if (
    lowercaseName.includes("hp") ||
    lowercaseName.includes("health") ||
    lowercaseName.includes("life")
  ) {
    return "text-red-400";
  }

  // Defense-related stats
  if (
    lowercaseName.includes("armor") ||
    lowercaseName.includes("defence") ||
    lowercaseName.includes("defense") ||
    lowercaseName.includes("ac")
  ) {
    return "text-blue-400";
  }

  // Attack-related stats
  if (
    lowercaseName.includes("attack") ||
    lowercaseName.includes("damage") ||
    lowercaseName.includes("strength")
  ) {
    return "text-orange-400";
  }

  // Magic-related stats
  if (
    lowercaseName.includes("mana") ||
    lowercaseName.includes("magic") ||
    lowercaseName.includes("spell")
  ) {
    return "text-purple-400";
  }

  // Default color
  return "text-gray-300";
}

/**
 * Get icon for combatant type
 */
function getCombatantIcon(type: Combatant["type"]): string {
  switch (type) {
    case "player":
      return "User";
    case "ally":
      return "Users";
    case "enemy":
      return "Skull";
    case "neutral":
      return "Circle";
    default:
      return "Circle";
  }
}

/**
 * Get color classes for combatant type
 */
function getCombatantTypeColor(type: Combatant["type"]): string {
  switch (type) {
    case "player":
      return "text-green-400 bg-green-900/30 border-green-700/50";
    case "ally":
      return "text-blue-400 bg-blue-900/30 border-blue-700/50";
    case "enemy":
      return "text-red-400 bg-red-900/30 border-red-700/50";
    case "neutral":
      return "text-yellow-400 bg-yellow-900/30 border-yellow-700/50";
    default:
      return "text-gray-400 bg-gray-900/30 border-gray-700/50";
  }
}

/**
 * Render a condition badge
 */
function ConditionBadge({ condition }: { condition: CombatCondition }) {
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs rounded bg-amber-900/40 text-amber-300 border border-amber-700/30">
      <span>{condition.name}</span>
      {condition.duration !== undefined && (
        <span className="text-amber-400/60">({condition.duration})</span>
      )}
    </span>
  );
}

/**
 * Render a single combatant row
 */
function CombatantRow({
  combatant,
  isCurrentTurn,
}: {
  combatant: Combatant;
  isCurrentTurn: boolean;
}) {
  const typeColor = getCombatantTypeColor(combatant.type);
  const icon = getCombatantIcon(combatant.type);

  return (
    <div
      className={`flex items-center gap-2 px-2 py-1.5 rounded border transition-all ${typeColor} ${
        isCurrentTurn ? "ring-2 ring-yellow-400/50 scale-[1.02]" : ""
      } ${!combatant.isActive ? "opacity-40" : ""}`}
    >
      {/* Turn indicator */}
      {isCurrentTurn && (
        <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
      )}

      {/* Combatant icon */}
      <DynamicIcon name={icon} className="w-4 h-4 shrink-0" />

      {/* Name and initiative */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">{combatant.name}</span>
          {combatant.initiativeRoll !== undefined && (
            <span className="text-xs opacity-60">
              Init: {combatant.initiativeRoll}
            </span>
          )}
        </div>

        {/* Conditions */}
        {combatant.conditions.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-0.5">
            {combatant.conditions.map((condition, idx) => (
              <ConditionBadge key={idx} condition={condition} />
            ))}
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="flex items-center gap-2 text-sm">
        {Object.entries(combatant.stats).map(([statName, value]) => (
          <span
            key={statName}
            className={`font-mono ${getStatColor(statName, value)}`}
            title={statName}
          >
            {statName.substring(0, 3).toUpperCase()}: {value}
          </span>
        ))}
      </div>

      {/* Inactive indicator */}
      {!combatant.isActive && (
        <span className="text-xs text-gray-500 italic">Out</span>
      )}
    </div>
  );
}

/**
 * Main combat display component
 */
export default function CombatDisplay({
  combatState,
  expanded = true,
  onToggleExpand,
}: CombatDisplayProps) {
  const [showLog, setShowLog] = useState(false);

  if (!combatState.active) {
    return null;
  }

  // Get current combatant
  const currentTurnId = combatState.turnOrder[combatState.currentTurnIndex];
  const currentCombatant = combatState.combatants.find(
    (c) => c.id === currentTurnId
  );

  // Group combatants by type
  const activeCombatants = combatState.combatants.filter((c) => c.isActive);
  const inactiveCombatants = combatState.combatants.filter((c) => !c.isActive);

  // Sort by turn order
  const sortedCombatants = [...activeCombatants].sort((a, b) => {
    const aIndex = combatState.turnOrder.indexOf(a.id);
    const bIndex = combatState.turnOrder.indexOf(b.id);
    return aIndex - bIndex;
  });

  return (
    <div className="border-b border-red-800/30 bg-red-950/20">
      {/* Combat Header - always visible */}
      <button
        onClick={onToggleExpand}
        className="w-full flex items-center justify-between px-4 py-2 bg-red-900/30 hover:bg-red-900/40 transition-colors"
      >
        <div className="flex items-center gap-2">
          <DynamicIcon name="Swords" className="w-4 h-4 text-red-400" />
          <span className="text-sm font-bold text-red-300">
            ⚔️ COMBAT: {combatState.name || "Battle"}
          </span>
          <span className="text-xs text-red-400/60 ml-2">
            Round {combatState.round}
            {currentCombatant && ` • ${currentCombatant.name}'s Turn`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-red-400/80">
            {activeCombatants.length} combatants
          </span>
          <DynamicIcon
            name={expanded ? "ChevronUp" : "ChevronDown"}
            className="w-4 h-4 text-red-400"
          />
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 py-3 space-y-3">
          {/* Turn Order Bar */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1">
            <span className="text-xs text-gray-500 mr-1 shrink-0">
              Turn Order:
            </span>
            {combatState.turnOrder.map((id, index) => {
              const combatant = combatState.combatants.find((c) => c.id === id);
              if (!combatant) return null;
              const isCurrentTurn = index === combatState.currentTurnIndex;
              const typeColor = getCombatantTypeColor(combatant.type);

              return (
                <span
                  key={id}
                  className={`px-2 py-0.5 text-xs rounded ${typeColor} ${
                    isCurrentTurn
                      ? "ring-2 ring-yellow-400/50 font-bold"
                      : "opacity-70"
                  } ${!combatant.isActive ? "line-through opacity-30" : ""}`}
                  title={`${combatant.name} (Init: ${combatant.initiativeRoll})`}
                >
                  {combatant.name.split(" ")[0]}
                </span>
              );
            })}
          </div>

          {/* Combatants List */}
          <div className="space-y-1">
            {sortedCombatants.map((combatant) => (
              <CombatantRow
                key={combatant.id}
                combatant={combatant}
                isCurrentTurn={combatant.id === currentTurnId}
              />
            ))}

            {/* Inactive combatants (collapsed) */}
            {inactiveCombatants.length > 0 && (
              <div className="mt-2 pt-2 border-t border-red-800/20">
                <span className="text-xs text-gray-500 mb-1 block">
                  Out of combat ({inactiveCombatants.length}):
                </span>
                <div className="space-y-1">
                  {inactiveCombatants.map((combatant) => (
                    <CombatantRow
                      key={combatant.id}
                      combatant={combatant}
                      isCurrentTurn={false}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Combat Log (collapsible) */}
          {combatState.log && combatState.log.length > 0 && (
            <div className="border-t border-red-800/20 pt-2">
              <button
                onClick={() => setShowLog(!showLog)}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-400 transition-colors"
              >
                <DynamicIcon
                  name={showLog ? "ChevronDown" : "ChevronRight"}
                  className="w-3 h-3"
                />
                Combat Log ({combatState.log.length})
              </button>
              {showLog && (
                <div className="mt-1 max-h-32 overflow-y-auto space-y-0.5">
                  {combatState.log.slice(-10).map((entry, idx) => (
                    <div key={idx} className="text-xs text-gray-400 font-mono">
                      {entry}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
