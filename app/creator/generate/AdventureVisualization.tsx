"use client";

import { useMemo, useState } from "react";
import { BigAdventureResult } from "@/app/misc/big_adventure_ai";

interface RelationshipGraphProps {
  relationships: Array<{
    name: string;
    value: number;
    description?: string;
    symbol?: string;
  }>;
  playerName?: string;
}

/**
 * Relationship Graph - Displays NPC relationships as a radial graph
 */
export function RelationshipGraph({
  relationships,
  playerName = "Player",
}: RelationshipGraphProps) {
  const [hoveredRelation, setHoveredRelation] = useState<string | null>(null);

  if (!relationships || relationships.length === 0) {
    return (
      <div className="text-center text-blue-300/50 py-8">
        No relationships to display
      </div>
    );
  }

  // Calculate positions in a circle
  const nodePositions = useMemo(() => {
    const centerX = 150;
    const centerY = 150;
    const radius = 100;

    return relationships.map((rel, i) => {
      const angle = (i / relationships.length) * 2 * Math.PI - Math.PI / 2;
      return {
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
        ...rel,
      };
    });
  }, [relationships]);

  // Get color based on relationship value
  const getRelationColor = (value: number) => {
    if (value >= 50) return "#22c55e"; // green
    if (value >= 20) return "#84cc16"; // lime
    if (value > -20) return "#94a3b8"; // gray
    if (value > -50) return "#f97316"; // orange
    return "#ef4444"; // red
  };

  // Get line thickness based on relationship strength
  const getLineWidth = (value: number) => {
    return Math.max(1, Math.abs(value) / 25);
  };

  return (
    <div className="relative">
      <svg width="300" height="300" viewBox="0 0 300 300" className="mx-auto">
        {/* Background circle */}
        <circle
          cx="150"
          cy="150"
          r="100"
          fill="none"
          stroke="rgba(59, 130, 246, 0.2)"
          strokeWidth="1"
          strokeDasharray="5,5"
        />

        {/* Connection lines */}
        {nodePositions.map((node, i) => (
          <line
            key={`line-${i}`}
            x1="150"
            y1="150"
            x2={node.x}
            y2={node.y}
            stroke={getRelationColor(node.value)}
            strokeWidth={getLineWidth(node.value)}
            strokeOpacity={hoveredRelation === node.name ? 1 : 0.6}
            className="transition-all duration-200"
          />
        ))}

        {/* Center node (Player) */}
        <circle
          cx="150"
          cy="150"
          r="20"
          fill="rgba(139, 92, 246, 0.8)"
          stroke="rgba(139, 92, 246, 1)"
          strokeWidth="2"
        />
        <text
          x="150"
          y="155"
          textAnchor="middle"
          className="text-xs fill-white font-medium"
        >
          {playerName.substring(0, 3)}
        </text>

        {/* Relationship nodes */}
        {nodePositions.map((node, i) => (
          <g
            key={`node-${i}`}
            className="cursor-pointer"
            onMouseEnter={() => setHoveredRelation(node.name)}
            onMouseLeave={() => setHoveredRelation(null)}
          >
            <circle
              cx={node.x}
              cy={node.y}
              r="15"
              fill={getRelationColor(node.value)}
              fillOpacity={hoveredRelation === node.name ? 1 : 0.8}
              stroke="white"
              strokeWidth="1"
              className="transition-all duration-200"
            />
            <text
              x={node.x}
              y={node.y + 4}
              textAnchor="middle"
              className="text-xs fill-white font-medium"
            >
              {node.symbol || node.name.substring(0, 2)}
            </text>
          </g>
        ))}
      </svg>

      {/* Hover tooltip */}
      {hoveredRelation && (
        <div className="absolute top-0 left-full ml-4 bg-blue-900/90 p-3 rounded-lg border border-blue-700/50 w-48 z-10">
          {nodePositions
            .filter((n) => n.name === hoveredRelation)
            .map((node) => (
              <div key={node.name}>
                <div className="font-medium text-white flex items-center gap-2">
                  {node.symbol && <span>{node.symbol}</span>}
                  {node.name}
                </div>
                <div
                  className="text-sm mt-1"
                  style={{ color: getRelationColor(node.value) }}
                >
                  Relationship: {node.value > 0 ? "+" : ""}
                  {node.value}
                </div>
                {node.description && (
                  <div className="text-xs text-blue-300/60 mt-1">
                    {node.description}
                  </div>
                )}
              </div>
            ))}
        </div>
      )}

      {/* Legend */}
      <div className="flex justify-center gap-4 mt-2 text-xs">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-green-500" />
          <span className="text-blue-300/60">Friendly</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-slate-400" />
          <span className="text-blue-300/60">Neutral</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-red-500" />
          <span className="text-blue-300/60">Hostile</span>
        </div>
      </div>
    </div>
  );
}

interface GoalFlowProps {
  goals: Array<{
    id?: string;
    title: string;
    shortDescription?: string;
    description?: string;
    active?: boolean;
    fulfilled?: boolean;
  }>;
}

/**
 * Goal Flow - Displays goals as a flow diagram
 */
export function GoalFlow({ goals }: GoalFlowProps) {
  const [expandedGoal, setExpandedGoal] = useState<string | null>(null);

  if (!goals || goals.length === 0) {
    return (
      <div className="text-center text-blue-300/50 py-8">
        No goals to display
      </div>
    );
  }

  // Group goals by status
  const mainGoals = goals.filter((g) => g.active);
  const sideGoals = goals.filter((g) => !g.active);

  return (
    <div className="space-y-4">
      {/* Main Goals */}
      {mainGoals.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-amber-400 mb-2 flex items-center gap-2">
            <span>⚔️</span> Main Goals
          </h4>
          <div className="grid gap-2">
            {mainGoals.map((goal, i) => (
              <div
                key={goal.id || i}
                className={`bg-amber-900/30 rounded-lg p-3 border border-amber-700/30 cursor-pointer transition-all hover:border-amber-600/50 ${
                  expandedGoal === (goal.id || `main-${i}`)
                    ? "border-amber-500/50"
                    : ""
                }`}
                onClick={() =>
                  setExpandedGoal(
                    expandedGoal === (goal.id || `main-${i}`)
                      ? null
                      : goal.id || `main-${i}`
                  )
                }
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-white text-sm">
                    {goal.title}
                  </span>
                </div>
                {goal.shortDescription && (
                  <p className="text-xs text-amber-300/60 mt-1">
                    {goal.shortDescription}
                  </p>
                )}
                {expandedGoal === (goal.id || `main-${i}`) &&
                  goal.description && (
                    <p className="text-sm text-amber-200/70 mt-2 pt-2 border-t border-amber-700/30 animate-in slide-in-from-top-1">
                      {goal.description}
                    </p>
                  )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Side Goals */}
      {sideGoals.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-blue-400 mb-2 flex items-center gap-2">
            <span>📜</span> Side Goals
          </h4>
          <div className="grid gap-2">
            {sideGoals.map((goal, i) => (
              <div
                key={goal.id || i}
                className={`bg-blue-900/30 rounded-lg p-3 border border-blue-700/30 cursor-pointer transition-all hover:border-blue-600/50 ${
                  expandedGoal === (goal.id || `side-${i}`)
                    ? "border-blue-500/50"
                    : ""
                }`}
                onClick={() =>
                  setExpandedGoal(
                    expandedGoal === (goal.id || `side-${i}`)
                      ? null
                      : goal.id || `side-${i}`
                  )
                }
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-white text-sm">
                    {goal.title}
                  </span>
                </div>
                {goal.shortDescription && (
                  <p className="text-xs text-blue-300/60 mt-1">
                    {goal.shortDescription}
                  </p>
                )}
                {expandedGoal === (goal.id || `side-${i}`) &&
                  goal.description && (
                    <p className="text-sm text-blue-200/70 mt-2 pt-2 border-t border-blue-700/30 animate-in slide-in-from-top-1">
                      {goal.description}
                    </p>
                  )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface AdventureVisualizationProps {
  result: BigAdventureResult;
}

/**
 * Adventure Visualization Panel - Combined view of relationships and goals
 */
export function AdventureVisualization({
  result,
}: AdventureVisualizationProps) {
  const [activeTab, setActiveTab] = useState<"relationships" | "goals">(
    "relationships"
  );

  const hasRelationships =
    result.storyTemplate?.relationships &&
    result.storyTemplate.relationships.length > 0;
  const hasGoals =
    result.storyTemplate?.goals && result.storyTemplate.goals.length > 0;

  if (!hasRelationships && !hasGoals) {
    return null;
  }

  // Auto-select first available tab
  const availableTabs = [
    hasRelationships && "relationships",
    hasGoals && "goals",
  ].filter(Boolean) as ("relationships" | "goals")[];

  if (!availableTabs.includes(activeTab)) {
    // Switch to first available if current tab not available
    if (availableTabs.length > 0 && activeTab !== availableTabs[0]) {
      setActiveTab(availableTabs[0]);
    }
  }

  return (
    <div className="bg-blue-950/50 rounded-xl p-6 border border-blue-700/30">
      <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
        <span>📊</span> Adventure Visualization
      </h3>

      {/* Tab buttons */}
      <div className="flex gap-2 mb-4">
        {hasRelationships && (
          <button
            onClick={() => setActiveTab("relationships")}
            className={`px-4 py-2 rounded-lg text-sm transition-colors ${
              activeTab === "relationships"
                ? "bg-purple-600 text-white"
                : "bg-blue-900/40 text-blue-300 hover:bg-blue-800/50"
            }`}
          >
            💕 Relationships
          </button>
        )}
        {hasGoals && (
          <button
            onClick={() => setActiveTab("goals")}
            className={`px-4 py-2 rounded-lg text-sm transition-colors ${
              activeTab === "goals"
                ? "bg-purple-600 text-white"
                : "bg-blue-900/40 text-blue-300 hover:bg-blue-800/50"
            }`}
          >
            ⚔️ Goal Flow
          </button>
        )}
      </div>

      {/* Tab content */}
      <div className="min-h-[300px]">
        {activeTab === "relationships" && hasRelationships && (
          <RelationshipGraph
            relationships={result.storyTemplate!.relationships!}
            playerName={result.storyTemplate?.player_name || "Player"}
          />
        )}
        {activeTab === "goals" && hasGoals && (
          <GoalFlow goals={result.storyTemplate!.goals!} />
        )}
      </div>
    </div>
  );
}
