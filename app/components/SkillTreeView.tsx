"use client";

import { useState, useRef, useEffect } from "react";
import { SkillTree, SkillNode, StoryData } from "../misc/structs";
import { getNodeState, NodeState, unlockNode } from "../misc/skillTree";
import { DynamicIcon } from "./DynamicIcon";

interface SkillTreeViewProps {
  tree: SkillTree;
  storyData: StoryData;
  availableUpgrades: number;
  onUnlock: (treeId: string, nodeId: string) => void;
  onNodeHover?: (node: SkillNode | null) => void;
  readOnly?: boolean;
}

// Node colors based on type
const NODE_COLORS: Record<
  SkillNode["type"],
  { bg: string; border: string; glow: string }
> = {
  stat: {
    bg: "bg-blue-600",
    border: "border-blue-400",
    glow: "shadow-blue-500/50",
  },
  ability: {
    bg: "bg-purple-600",
    border: "border-purple-400",
    glow: "shadow-purple-500/50",
  },
  item: {
    bg: "bg-amber-600",
    border: "border-amber-400",
    glow: "shadow-amber-500/50",
  },
  passive: {
    bg: "bg-green-600",
    border: "border-green-400",
    glow: "shadow-green-500/50",
  },
  resource: {
    bg: "bg-teal-600",
    border: "border-teal-400",
    glow: "shadow-teal-500/50",
  },
};

// State-based styles
const STATE_STYLES: Record<
  NodeState,
  { opacity: string; scale: string; cursor: string }
> = {
  locked: {
    opacity: "opacity-40",
    scale: "scale-100",
    cursor: "cursor-not-allowed",
  },
  available: {
    opacity: "opacity-100",
    scale: "scale-100 hover:scale-110",
    cursor: "cursor-pointer",
  },
  unlocked: {
    opacity: "opacity-100",
    scale: "scale-100",
    cursor: "cursor-default",
  },
};

interface NodePosition {
  node: SkillNode;
  x: number; // Actual pixel position
  y: number;
  state: NodeState;
}

export default function SkillTreeView({
  tree,
  storyData,
  availableUpgrades,
  onUnlock,
  onNodeHover,
  readOnly = false,
}: SkillTreeViewProps) {
  const [selectedNode, setSelectedNode] = useState<SkillNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<SkillNode | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({
    width: 600,
    height: 400,
  });

  // Responsive container sizing - uses actual element dimensions
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          setContainerSize({
            width: rect.width,
            height: rect.height,
          });
        }
      }
    };

    // Initial size calculation after mount
    const timeoutId = setTimeout(updateSize, 50);

    // Update on resize
    window.addEventListener("resize", updateSize);

    // Also observe the element for size changes
    const resizeObserver = new ResizeObserver(updateSize);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener("resize", updateSize);
      resizeObserver.disconnect();
    };
  }, []);

  // Use responsive dimensions
  const containerWidth = containerSize.width;
  const containerHeight = containerSize.height;
  // Scale node size based on container width
  const nodeSize = containerWidth < 350 ? 36 : containerWidth < 450 ? 42 : 48;
  const padding = containerWidth < 400 ? 24 : 40;

  const nodePositions: NodePosition[] = tree.nodes.map((node) => ({
    node,
    x:
      padding +
      (node.position.x / 100) * (containerWidth - padding * 2 - nodeSize),
    y:
      padding +
      (node.position.y / 100) * (containerHeight - padding * 2 - nodeSize),
    state: getNodeState(storyData, tree, node),
  }));

  // Generate SVG paths for prerequisite connections
  const connections: Array<{ from: NodePosition; to: NodePosition }> = [];
  for (const pos of nodePositions) {
    for (const prereqId of pos.node.prerequisites) {
      const prereqPos = nodePositions.find((p) => p.node.id === prereqId);
      if (prereqPos) {
        connections.push({ from: prereqPos, to: pos });
      }
    }
  }

  const handleNodeClick = (node: SkillNode, state: NodeState) => {
    if (readOnly) {
      setSelectedNode(node);
      return;
    }

    if (state === "available" && availableUpgrades > 0) {
      setSelectedNode(node);
    } else if (state === "unlocked") {
      setSelectedNode(node);
    }
  };

  const handleUnlock = () => {
    if (selectedNode && !readOnly) {
      onUnlock(tree.id, selectedNode.id);
      setSelectedNode(null);
    }
  };

  const handleMouseEnter = (node: SkillNode) => {
    setHoveredNode(node);
    onNodeHover?.(node);
  };

  const handleMouseLeave = () => {
    setHoveredNode(null);
    onNodeHover?.(null);
  };

  const getConnectionColor = (from: NodePosition, to: NodePosition) => {
    if (from.state === "unlocked" && to.state === "unlocked") {
      return "stroke-green-400";
    }
    if (from.state === "unlocked" && to.state === "available") {
      return "stroke-yellow-400";
    }
    return "stroke-gray-600";
  };

  return (
    <div className="relative w-full">
      {/* Tree Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg bg-linear-to-br from-purple-500/30 to-blue-500/30 border border-purple-400/50 flex items-center justify-center">
          <DynamicIcon name={tree.symbol} className="w-6 h-6 text-purple-300" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-white">{tree.name}</h3>
          <p className="text-sm text-blue-200/60">{tree.description}</p>
        </div>
      </div>

      {/* Tree Visualization */}
      <div
        ref={containerRef}
        className="relative bg-linear-to-br from-gray-900/80 to-blue-950/80 rounded-xl border border-blue-800/30 overflow-hidden w-full"
        style={{ maxWidth: 600, aspectRatio: "3 / 2" }}
      >
        {/* SVG for connections */}
        <svg
          className="absolute inset-0 pointer-events-none"
          width={containerWidth}
          height={containerHeight}
        >
          <defs>
            {/* Glow filter for active connections */}
            <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {connections.map((conn, i) => {
            const fromX = conn.from.x + nodeSize / 2;
            const fromY = conn.from.y + nodeSize / 2;
            const toX = conn.to.x + nodeSize / 2;
            const toY = conn.to.y + nodeSize / 2;

            // Calculate control points for curved line
            const midX = (fromX + toX) / 2;
            const midY = (fromY + toY) / 2;

            return (
              <g key={i}>
                {/* Background line */}
                <line
                  x1={fromX}
                  y1={fromY}
                  x2={toX}
                  y2={toY}
                  className={`${getConnectionColor(
                    conn.from,
                    conn.to
                  )} transition-all duration-300`}
                  strokeWidth={conn.from.state === "unlocked" ? 3 : 2}
                  strokeDasharray={
                    conn.from.state === "unlocked" ? "none" : "4 4"
                  }
                  filter={
                    conn.from.state === "unlocked" &&
                    conn.to.state === "available"
                      ? "url(#glow)"
                      : "none"
                  }
                />
                {/* Arrow marker at midpoint */}
                {conn.from.state === "unlocked" && (
                  <circle
                    cx={midX}
                    cy={midY}
                    r={3}
                    className="fill-yellow-400"
                  />
                )}
              </g>
            );
          })}
        </svg>

        {/* Nodes */}
        {nodePositions.map((pos) => {
          const colors = NODE_COLORS[pos.node.type];
          const styles = STATE_STYLES[pos.state];
          const isHovered = hoveredNode?.id === pos.node.id;
          const isSelected = selectedNode?.id === pos.node.id;

          return (
            <div
              key={pos.node.id}
              className={`absolute transition-all duration-200 ${styles.cursor}`}
              style={{
                left: pos.x,
                top: pos.y,
                width: nodeSize,
                height: nodeSize,
              }}
              onClick={() => handleNodeClick(pos.node, pos.state)}
              onMouseEnter={() => handleMouseEnter(pos.node)}
              onMouseLeave={handleMouseLeave}
            >
              <div
                className={`
                  w-full h-full rounded-lg border-2 flex items-center justify-center
                  transition-all duration-200
                  ${styles.opacity} ${styles.scale}
                  ${pos.state === "unlocked" ? colors.bg : "bg-gray-800"}
                  ${
                    pos.state === "unlocked"
                      ? colors.border
                      : pos.state === "available"
                      ? "border-yellow-400"
                      : "border-gray-600"
                  }
                  ${
                    pos.state === "available" && !readOnly
                      ? `shadow-lg ${colors.glow} animate-pulse`
                      : ""
                  }
                  ${
                    isHovered || isSelected
                      ? "ring-2 ring-white ring-offset-2 ring-offset-gray-900"
                      : ""
                  }
                `}
              >
                <DynamicIcon
                  name={pos.node.symbol}
                  className={`w-6 h-6 ${
                    pos.state === "unlocked"
                      ? "text-white"
                      : pos.state === "available"
                      ? "text-yellow-400"
                      : "text-gray-500"
                  }`}
                />
              </div>

              {/* Unlocked checkmark */}
              {pos.state === "unlocked" && (
                <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-green-500 border-2 border-green-300 flex items-center justify-center">
                  <DynamicIcon name="Check" className="w-3 h-3 text-white" />
                </div>
              )}

              {/* Node name tooltip */}
              {isHovered && (
                <div className="absolute left-1/2 -translate-x-1/2 -bottom-8 whitespace-nowrap px-2 py-1 bg-gray-900 rounded text-xs text-white border border-gray-700 z-10">
                  {pos.node.name}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Node Details Panel */}
      {selectedNode && (
        <div className="mt-4 p-4 bg-gray-900/80 rounded-lg border border-blue-800/30">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div
                className={`w-12 h-12 rounded-lg ${
                  NODE_COLORS[selectedNode.type].bg
                } ${
                  NODE_COLORS[selectedNode.type].border
                } border-2 flex items-center justify-center`}
              >
                <DynamicIcon
                  name={selectedNode.symbol}
                  className="w-7 h-7 text-white"
                />
              </div>
              <div>
                <h4 className="text-lg font-bold text-white">
                  {selectedNode.name}
                </h4>
                <p className="text-sm text-blue-200/60 mb-2">
                  {selectedNode.description}
                </p>
                <div className="flex flex-wrap gap-2">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      NODE_COLORS[selectedNode.type].bg
                    } ${
                      NODE_COLORS[selectedNode.type].border
                    } border text-white`}
                  >
                    {selectedNode.type}
                  </span>
                  {/* Effect preview */}
                  {selectedNode.effects.map((effect, idx) => {
                    if (effect.type === "stat_bonus") {
                      return (
                        <span
                          key={idx}
                          className="text-xs px-2 py-0.5 rounded-full bg-blue-900/50 border border-blue-700 text-blue-300"
                        >
                          +{effect.value} {effect.target}
                        </span>
                      );
                    }
                    if (effect.type === "resource_bonus") {
                      return (
                        <span
                          key={idx}
                          className="text-xs px-2 py-0.5 rounded-full bg-teal-900/50 border border-teal-700 text-teal-300"
                        >
                          +{effect.value} max {effect.target}
                        </span>
                      );
                    }
                    if (effect.type === "grant_ability") {
                      return (
                        <span
                          key={idx}
                          className="text-xs px-2 py-0.5 rounded-full bg-purple-900/50 border border-purple-700 text-purple-300"
                        >
                          Ability: {effect.abilityData?.name || effect.target}
                        </span>
                      );
                    }
                    if (effect.type === "grant_item") {
                      return (
                        <span
                          key={idx}
                          className="text-xs px-2 py-0.5 rounded-full bg-amber-900/50 border border-amber-700 text-amber-300"
                        >
                          Item: {effect.itemData?.name || effect.target}
                        </span>
                      );
                    }
                    if (effect.type === "passive") {
                      return (
                        <span
                          key={idx}
                          className="text-xs px-2 py-0.5 rounded-full bg-green-900/50 border border-green-700 text-green-300"
                        >
                          Passive: {effect.target}
                        </span>
                      );
                    }
                    return null;
                  })}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              {!readOnly &&
                getNodeState(storyData, tree, selectedNode) === "available" && (
                  <button
                    onClick={handleUnlock}
                    disabled={availableUpgrades <= 0}
                    className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
                  >
                    {availableUpgrades > 0 ? "Unlock" : "No Points"}
                  </button>
                )}
              {getNodeState(storyData, tree, selectedNode) === "unlocked" && (
                <span className="px-4 py-2 bg-green-600/50 text-green-300 font-semibold rounded-lg text-center">
                  ✓ Unlocked
                </span>
              )}
              {getNodeState(storyData, tree, selectedNode) === "locked" && (
                <span className="px-4 py-2 bg-gray-700/50 text-gray-400 font-semibold rounded-lg text-center">
                  🔒 Locked
                </span>
              )}
              <button
                onClick={() => setSelectedNode(null)}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>

          {/* Prerequisites info */}
          {selectedNode.prerequisites.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-700">
              <p className="text-xs text-gray-400">
                <span className="font-semibold">Requires:</span>{" "}
                {selectedNode.prerequisites
                  .map((id) => tree.nodes.find((n) => n.id === id)?.name || id)
                  .join(", ")}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="mt-4 flex flex-wrap gap-2 sm:gap-3 text-xs text-gray-400">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 sm:w-4 sm:h-4 rounded bg-yellow-600 border border-yellow-400 animate-pulse" />
          <span>Available</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 sm:w-4 sm:h-4 rounded bg-green-600 border border-green-400" />
          <span>Unlocked</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 sm:w-4 sm:h-4 rounded bg-gray-800 border border-gray-600 opacity-40" />
          <span>Locked</span>
        </div>
        <span className="mx-1 sm:mx-2 hidden sm:inline">|</span>
        <div className="basis-full sm:basis-auto" />
        {Object.entries(NODE_COLORS).map(([type, colors]) => (
          <div key={type} className="flex items-center gap-1">
            <div className={`w-2 h-2 sm:w-3 sm:h-3 rounded ${colors.bg}`} />
            <span className="capitalize">{type}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
