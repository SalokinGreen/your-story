"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { SkillTree, SkillNode, StoryData } from "../misc/structs";
import { getNodeState, NodeState } from "../misc/skillTree";
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
    scale: "scale-100 hover:scale-105",
    cursor: "cursor-pointer",
  },
  available: {
    opacity: "opacity-100",
    scale: "scale-100 hover:scale-110",
    cursor: "cursor-pointer",
  },
  unlocked: {
    opacity: "opacity-100",
    scale: "scale-100 hover:scale-105",
    cursor: "cursor-pointer",
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

  // Zoom and pan state
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

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
  // Scale node size based on container width and zoom
  const baseNodeSize =
    containerWidth < 350 ? 28 : containerWidth < 450 ? 34 : 44;
  const nodeSize = baseNodeSize * zoom;
  // Increase padding on mobile for more spacing between nodes
  const basePadding =
    containerWidth < 400 ? 55 : containerWidth < 500 ? 65 : 70;
  const padding = basePadding * zoom;

  const nodePositions: NodePosition[] = tree.nodes.map((node) => ({
    node,
    x:
      padding +
      (node.position.x / 100) *
        (containerWidth * zoom - padding * 2 - nodeSize),
    y:
      padding +
      (node.position.y / 100) *
        (containerHeight * zoom - padding * 2 - nodeSize),
    state: getNodeState(storyData, tree, node),
  }));

  // Generate SVG paths for prerequisite connections
  const connections: Array<{ from: NodePosition; to: NodePosition }> = [];
  for (const pos of nodePositions) {
    for (const prereqId of pos.node.prerequisites || []) {
      const prereqPos = nodePositions.find((p) => p.node.id === prereqId);
      if (prereqPos) {
        connections.push({ from: prereqPos, to: pos });
      }
    }
  }

  const handleNodeClick = (node: SkillNode, state: NodeState) => {
    // Always allow selecting a node to view its details
    setSelectedNode(node);
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
    return "stroke-white/15";
  };

  // Handle panning
  const handlePointerMove = useCallback(
    (e: MouseEvent | TouchEvent) => {
      if (!isPanning) return;

      // Prevent page scrolling on touch devices
      if ("touches" in e) {
        e.preventDefault();
      }

      const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
      const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

      const deltaX = (clientX - panStart.x) * 0.5;
      const deltaY = (clientY - panStart.y) * 0.5;

      setPanOffset((prev) => ({
        x: prev.x + deltaX,
        y: prev.y + deltaY,
      }));
      setPanStart({ x: clientX, y: clientY });
    },
    [isPanning, panStart]
  );

  const handlePointerUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  // Touch start handler - needs to be attached with passive: false
  const handleTouchStart = useCallback((e: TouchEvent) => {
    // Start panning unless touching a node
    if (!(e.target as HTMLElement).closest(".skill-node")) {
      e.preventDefault();
      setIsPanning(true);
      setPanStart({ x: e.touches[0].clientX, y: e.touches[0].clientY });
    }
  }, []);

  // Attach touch start listener with passive: false to allow preventDefault
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener("touchstart", handleTouchStart, {
      passive: false,
    });
    return () => {
      container.removeEventListener("touchstart", handleTouchStart);
    };
  }, [handleTouchStart]);

  // Add/remove event listeners for panning
  useEffect(() => {
    if (isPanning) {
      window.addEventListener("mousemove", handlePointerMove);
      window.addEventListener("mouseup", handlePointerUp);
      window.addEventListener("touchmove", handlePointerMove, {
        passive: false,
      });
      window.addEventListener("touchend", handlePointerUp);
    }
    return () => {
      window.removeEventListener("mousemove", handlePointerMove);
      window.removeEventListener("mouseup", handlePointerUp);
      window.removeEventListener("touchmove", handlePointerMove);
      window.removeEventListener("touchend", handlePointerUp);
    };
  }, [isPanning, handlePointerMove, handlePointerUp]);

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

      {/* Zoom Controls */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm text-blue-300/60">Zoom:</span>
        <button
          onClick={() => setZoom(Math.max(0.5, zoom - 0.25))}
          disabled={zoom <= 0.5}
          className="p-1.5 bg-white/5 hover:bg-white/10 border border-white/10 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors"
          title="Zoom out"
        >
          <DynamicIcon name="ZoomOut" className="w-4 h-4 text-white" />
        </button>
        <span className="text-sm text-white min-w-12 text-center">
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={() => setZoom(Math.min(2, zoom + 0.25))}
          disabled={zoom >= 2}
          className="p-1.5 bg-white/5 hover:bg-white/10 border border-white/10 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors"
          title="Zoom in"
        >
          <DynamicIcon name="ZoomIn" className="w-4 h-4 text-white" />
        </button>
        <button
          onClick={() => {
            setZoom(1);
            setPanOffset({ x: 0, y: 0 });
          }}
          className="px-2 py-1 text-xs bg-white/5 hover:bg-white/10 border border-white/10 text-blue-200 rounded-lg transition-colors"
        >
          Reset
        </button>
        <span className="text-xs text-blue-300/40 ml-2 hidden sm:inline">
          Drag to pan
        </span>
      </div>

      {/* Tree Visualization */}
      <div
        ref={containerRef}
        className="relative bg-white/[0.03] backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden w-full cursor-grab active:cursor-grabbing touch-none"
        style={{ minHeight: "400px", aspectRatio: "4 / 3" }}
        onMouseDown={(e) => {
          // Start panning unless clicking on a node
          if (!(e.target as HTMLElement).closest(".skill-node")) {
            e.preventDefault();
            setIsPanning(true);
            setPanStart({ x: e.clientX, y: e.clientY });
          }
        }}
      >
        {/* Grid pattern background */}
        <div
          className="canvas-background absolute inset-0 opacity-10 pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(circle, #666 1px, transparent 1px)",
            backgroundSize: `${20 * zoom}px ${20 * zoom}px`,
            backgroundPosition: `${panOffset.x}px ${panOffset.y}px`,
          }}
        />

        {/* SVG for connections */}
        <svg
          className="absolute inset-0 pointer-events-none"
          width={containerWidth}
          height={containerHeight}
          style={{ transform: `translate(${panOffset.x}px, ${panOffset.y}px)` }}
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
                  className={getConnectionColor(conn.from, conn.to)}
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
        <div
          className="absolute inset-0"
          style={{ transform: `translate(${panOffset.x}px, ${panOffset.y}px)` }}
        >
          {nodePositions.map((pos) => {
            const colors = NODE_COLORS[pos.node.type];
            const styles = STATE_STYLES[pos.state];
            const isHovered = hoveredNode?.id === pos.node.id;
            const isSelected = selectedNode?.id === pos.node.id;

            return (
              <div
                key={pos.node.id}
                className={`skill-node absolute transition-all duration-200 ${styles.cursor}`}
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
                  ${pos.state === "unlocked" ? colors.bg : "bg-white/5"}
                  ${
                    pos.state === "unlocked"
                      ? colors.border
                      : pos.state === "available"
                      ? "border-yellow-400"
                      : "border-white/15"
                  }
                  ${
                    pos.state === "available" && !readOnly
                      ? `shadow-lg ${colors.glow} animate-pulse`
                      : ""
                  }
                  ${
                    isHovered || isSelected
                      ? "ring-2 ring-white ring-offset-2 ring-offset-[#0d1829]"
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
                        : "text-blue-300/40"
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
                  <div className="absolute left-1/2 -translate-x-1/2 -bottom-8 whitespace-nowrap px-2 py-1 bg-[#0d1829]/95 backdrop-blur-md rounded-lg text-xs text-white border border-white/10 z-10">
                    {pos.node.name}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Node Details Panel */}
      {selectedNode && (
        <div className="mt-4 p-4 bg-white/[0.03] backdrop-blur-md rounded-lg border border-white/10">
          <div className="flex flex-col gap-4">
            {/* Node info */}
            <div className="flex items-start gap-3">
              <div
                className={`w-12 h-12 rounded-lg shrink-0 ${
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
              <div className="flex-1 min-w-0">
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

            {/* Prerequisites info */}
            {selectedNode.prerequisites.length > 0 && (
              <div className="pt-3 border-t border-white/10">
                <p className="text-xs text-blue-300/60">
                  <span className="font-semibold">Requires:</span>{" "}
                  {selectedNode.prerequisites
                    .map(
                      (id) => tree.nodes.find((n) => n.id === id)?.name || id
                    )
                    .join(", ")}
                </p>
              </div>
            )}

            {/* Action buttons - always at bottom, full width on mobile */}
            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              {!readOnly &&
                getNodeState(storyData, tree, selectedNode) === "available" && (
                  <button
                    onClick={handleUnlock}
                    disabled={availableUpgrades <= 0}
                    className="flex-1 px-4 py-2 bg-linear-to-r from-yellow-600 to-amber-600 hover:from-yellow-500 hover:to-amber-500 disabled:from-white/10 disabled:to-white/10 disabled:cursor-not-allowed text-white font-semibold rounded-lg shadow-md shadow-amber-950/40 disabled:shadow-none transition-all"
                  >
                    {availableUpgrades > 0 ? "✓ Unlock" : "No Points"}
                  </button>
                )}
              {getNodeState(storyData, tree, selectedNode) === "unlocked" && (
                <span className="flex-1 px-4 py-2 bg-green-600/50 text-green-300 font-semibold rounded-lg text-center">
                  ✓ Unlocked
                </span>
              )}
              {getNodeState(storyData, tree, selectedNode) === "locked" && (
                <span className="flex-1 px-4 py-2 bg-white/5 border border-white/10 text-blue-300/50 font-semibold rounded-lg text-center">
                  🔒 Locked
                </span>
              )}
              <button
                onClick={() => setSelectedNode(null)}
                className="flex-1 sm:flex-none px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="mt-4 flex flex-wrap gap-2 sm:gap-3 text-xs text-blue-300/60">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 sm:w-4 sm:h-4 rounded bg-yellow-600 border border-yellow-400 animate-pulse" />
          <span>Available</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 sm:w-4 sm:h-4 rounded bg-green-600 border border-green-400" />
          <span>Unlocked</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 sm:w-4 sm:h-4 rounded bg-white/5 border border-white/15 opacity-40" />
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
