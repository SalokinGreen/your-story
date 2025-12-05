"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  SkillTree,
  SkillNode,
  SkillNodeEffect,
  Stat,
  Resource,
  Ability,
} from "../misc/structs";
import {
  createEmptyTree,
  createEmptyNode,
  validateSkillTree,
} from "../misc/skillTree";
import { DynamicIcon } from "./DynamicIcon";
import { IconPicker } from "./IconPicker";

interface SkillTreeEditorProps {
  tree: SkillTree;
  onChange: (tree: SkillTree) => void;
  availableStats: Stat[];
  availableResources: Resource[];
  availableAbilities: Ability[];
  onDelete?: () => void;
}

// Node colors based on type
const NODE_COLORS: Record<
  SkillNode["type"],
  { bg: string; border: string; text: string }
> = {
  stat: { bg: "bg-blue-600", border: "border-blue-400", text: "text-blue-400" },
  ability: {
    bg: "bg-purple-600",
    border: "border-purple-400",
    text: "text-purple-400",
  },
  item: {
    bg: "bg-amber-600",
    border: "border-amber-400",
    text: "text-amber-400",
  },
  passive: {
    bg: "bg-green-600",
    border: "border-green-400",
    text: "text-green-400",
  },
  resource: {
    bg: "bg-teal-600",
    border: "border-teal-400",
    text: "text-teal-400",
  },
};

const NODE_TYPE_ICONS: Record<SkillNode["type"], string> = {
  stat: "BarChart2",
  ability: "Sparkles",
  item: "Package",
  passive: "Shield",
  resource: "Zap",
};

interface DragState {
  nodeId: string | null;
  startX: number;
  startY: number;
  startNodeX: number;
  startNodeY: number;
}

// Hook to get responsive canvas dimensions - uses actual element dimensions
function useCanvasSize(canvasRef: React.RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState({ width: 800, height: 500 });

  useEffect(() => {
    const updateSize = () => {
      if (canvasRef.current) {
        // Get actual rendered dimensions of the canvas element
        const rect = canvasRef.current.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          setSize({ width: rect.width, height: rect.height });
        }
      }
    };

    // Initial size calculation after mount
    const timeoutId = setTimeout(updateSize, 50);

    // Update on resize
    window.addEventListener("resize", updateSize);

    // Also observe the element for size changes
    const resizeObserver = new ResizeObserver(updateSize);
    if (canvasRef.current) {
      resizeObserver.observe(canvasRef.current);
    }

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener("resize", updateSize);
      resizeObserver.disconnect();
    };
  }, [canvasRef]);

  return size;
}

export default function SkillTreeEditor({
  tree,
  onChange,
  availableStats,
  availableResources,
  availableAbilities,
  onDelete,
}: SkillTreeEditorProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const [showNodeModal, setShowNodeModal] = useState(false);
  const [editingNode, setEditingNode] = useState<SkillNode | null>(null);
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLDivElement>(null);

  // Responsive canvas dimensions
  const { width: CANVAS_WIDTH, height: CANVAS_HEIGHT } =
    useCanvasSize(canvasRef);
  // Scale node size for mobile (smaller screens = smaller nodes), then apply zoom
  const BASE_NODE_SIZE = CANVAS_WIDTH < 400 ? 44 : CANVAS_WIDTH < 600 ? 52 : 60;
  const NODE_SIZE = BASE_NODE_SIZE * zoom;

  // Validation errors
  const validation = validateSkillTree(tree);

  // Get selected node
  const selectedNode = selectedNodeId
    ? tree.nodes.find((n) => n.id === selectedNodeId)
    : null;

  // Update tree name
  const handleNameChange = (name: string) => {
    onChange({ ...tree, name });
  };

  // Update tree description
  const handleDescriptionChange = (description: string) => {
    onChange({ ...tree, description });
  };

  // Add new node at center or clicked position
  const handleAddNode = (type: SkillNode["type"] = "stat") => {
    const position = {
      x: 40 + Math.random() * 20,
      y: 40 + Math.random() * 20,
    };
    const newNode = createEmptyNode(position, type);
    onChange({
      ...tree,
      nodes: [...tree.nodes, newNode],
    });
    setSelectedNodeId(newNode.id);
  };

  // Delete selected node
  const handleDeleteNode = (nodeId: string) => {
    const updatedNodes = tree.nodes
      .filter((n) => n.id !== nodeId)
      .map((n) => ({
        ...n,
        prerequisites: (n.prerequisites || []).filter((p) => p !== nodeId),
      }));
    onChange({ ...tree, nodes: updatedNodes });
    setSelectedNodeId(null);
  };

  // Update node
  const handleUpdateNode = (nodeId: string, updates: Partial<SkillNode>) => {
    const updatedNodes = tree.nodes.map((n) =>
      n.id === nodeId ? { ...n, ...updates } : n
    );
    onChange({ ...tree, nodes: updatedNodes });
  };

  // Handle mouse/touch down on node for dragging
  const handleNodePointerDown = (
    e: React.MouseEvent | React.TouchEvent,
    nodeId: string
  ) => {
    if (connectingFrom) {
      // We're in connection mode - add prerequisite
      if (connectingFrom !== nodeId) {
        const targetNode = tree.nodes.find((n) => n.id === nodeId);
        const prereqs = targetNode?.prerequisites || [];
        if (targetNode && !prereqs.includes(connectingFrom)) {
          handleUpdateNode(nodeId, {
            prerequisites: [...prereqs, connectingFrom],
          });
        }
      }
      setConnectingFrom(null);
      return;
    }

    e.preventDefault();
    const node = tree.nodes.find((n) => n.id === nodeId);
    if (!node) return;

    // Get coordinates from mouse or touch event
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

    setSelectedNodeId(nodeId);
    setDragState({
      nodeId,
      startX: clientX,
      startY: clientY,
      startNodeX: node.position.x,
      startNodeY: node.position.y,
    });
  };

  // Handle mouse/touch move for dragging nodes or panning
  const handlePointerMove = useCallback(
    (e: MouseEvent | TouchEvent) => {
      // Get coordinates from mouse or touch event
      const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
      const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

      // Handle panning (with reduced sensitivity)
      if (isPanning) {
        const deltaX = (clientX - panStart.x) * 0.4;
        const deltaY = (clientY - panStart.y) * 0.4;
        setPanOffset((prev) => ({
          x: prev.x + deltaX,
          y: prev.y + deltaY,
        }));
        setPanStart({ x: clientX, y: clientY });
        return;
      }

      // Handle node dragging
      if (!dragState || !canvasRef.current) return;

      const rect = canvasRef.current.getBoundingClientRect();
      const deltaX = ((clientX - dragState.startX) / rect.width) * 100;
      const deltaY = ((clientY - dragState.startY) / rect.height) * 100;

      const newX = Math.max(5, Math.min(95, dragState.startNodeX + deltaX));
      const newY = Math.max(5, Math.min(95, dragState.startNodeY + deltaY));

      handleUpdateNode(dragState.nodeId!, {
        position: { x: newX, y: newY },
      });
    },
    [dragState, isPanning, panStart]
  );

  // Handle mouse/touch up to end dragging or panning
  const handlePointerUp = useCallback(() => {
    setDragState(null);
    setIsPanning(false);
  }, []);

  // Add/remove event listeners for dragging and panning (mouse and touch)
  useEffect(() => {
    if (dragState || isPanning) {
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
  }, [dragState, isPanning, handlePointerMove, handlePointerUp]);

  // Start connection mode
  const handleStartConnection = (nodeId: string) => {
    setConnectingFrom(nodeId);
    setSelectedNodeId(null);
  };

  // Remove connection
  const handleRemoveConnection = (fromId: string, toId: string) => {
    const targetNode = tree.nodes.find((n) => n.id === toId);
    if (targetNode) {
      handleUpdateNode(toId, {
        prerequisites: (targetNode.prerequisites || []).filter((p) => p !== fromId),
      });
    }
  };

  // Open node edit modal
  const handleEditNode = (node: SkillNode) => {
    setEditingNode({ ...node });
    setShowNodeModal(true);
  };

  // Save node edits
  const handleSaveNodeEdit = () => {
    if (editingNode) {
      handleUpdateNode(editingNode.id, editingNode);
      setShowNodeModal(false);
      setEditingNode(null);
    }
  };

  // Calculate pixel positions
  const getNodePixelPos = (node: SkillNode) => ({
    x: (node.position.x / 100) * CANVAS_WIDTH,
    y: (node.position.y / 100) * CANVAS_HEIGHT,
  });

  return (
    <div className="space-y-4">
      {/* Tree Header */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-sm font-medium text-gray-400 mb-1">
            Tree Name
          </label>
          <input
            type="text"
            value={tree.name}
            onChange={(e) => handleNameChange(e.target.value)}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            placeholder="e.g., Combat Skills, Magic Mastery"
          />
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="block text-sm font-medium text-gray-400 mb-1">
            Description
          </label>
          <input
            type="text"
            value={tree.description || ""}
            onChange={(e) => handleDescriptionChange(e.target.value)}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            placeholder="What this skill tree offers"
          />
        </div>
        {onDelete && (
          <button
            onClick={onDelete}
            className="px-3 py-2 mt-6 bg-red-900/40 hover:bg-red-800/50 text-red-400 rounded-lg transition-colors"
          >
            <DynamicIcon name="Trash2" className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Validation Errors */}
      {!validation.valid && (
        <div className="p-3 bg-red-900/30 border border-red-700/50 rounded-lg">
          <p className="text-sm font-medium text-red-400 mb-1">
            Validation Issues:
          </p>
          <ul className="text-xs text-red-300 space-y-1">
            {validation.errors.map((error, i) => (
              <li key={i}>• {error}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex gap-2 flex-wrap">
        <span className="text-sm text-gray-400 self-center mr-2 hidden sm:inline">
          Add Node:
        </span>
        {(Object.keys(NODE_COLORS) as SkillNode["type"][]).map((type) => (
          <button
            key={type}
            onClick={() => handleAddNode(type)}
            className={`px-2 sm:px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors flex items-center gap-1 sm:gap-1.5 ${NODE_COLORS[type].bg} hover:opacity-80 text-white`}
          >
            <DynamicIcon name={NODE_TYPE_ICONS[type]} className="w-4 h-4" />
            <span className="hidden xs:inline">
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </span>
          </button>
        ))}

        {connectingFrom && (
          <span className="ml-2 sm:ml-4 px-2 sm:px-3 py-1.5 bg-yellow-500/20 text-yellow-400 rounded-lg text-xs sm:text-sm animate-pulse">
            Tap node to connect •{" "}
            <button
              onClick={() => setConnectingFrom(null)}
              className="underline"
            >
              Cancel
            </button>
          </span>
        )}
      </div>

      {/* Zoom Controls */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm text-gray-400">Zoom:</span>
        <button
          onClick={() => setZoom(Math.max(0.5, zoom - 0.25))}
          disabled={zoom <= 0.5}
          className="p-1.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed rounded transition-colors"
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
          className="p-1.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed rounded transition-colors"
          title="Zoom in"
        >
          <DynamicIcon name="ZoomIn" className="w-4 h-4 text-white" />
        </button>
        <button
          onClick={() => {
            setZoom(1);
            setPanOffset({ x: 0, y: 0 });
          }}
          className="px-2 py-1 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded transition-colors"
        >
          Reset View
        </button>
        <span className="text-xs text-gray-500 ml-2 hidden sm:inline">
          Drag empty space to pan
        </span>
      </div>

      {/* Canvas */}
      <div
        ref={canvasRef}
        className="relative bg-gray-900/50 border border-gray-700 rounded-lg overflow-hidden w-full cursor-grab active:cursor-grabbing"
        style={{ aspectRatio: "8 / 5", minHeight: "300px" }}
        onMouseDown={(e) => {
          // Start panning unless clicking on a node
          if (!(e.target as HTMLElement).closest(".skill-tree-node")) {
            e.preventDefault();
            setIsPanning(true);
            setPanStart({ x: e.clientX, y: e.clientY });
          }
        }}
        onTouchStart={(e) => {
          // Start panning unless touching a node
          if (!(e.target as HTMLElement).closest(".skill-tree-node")) {
            e.preventDefault();
            setIsPanning(true);
            setPanStart({ x: e.touches[0].clientX, y: e.touches[0].clientY });
          }
        }}
      >
        {/* Grid pattern */}
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
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ transform: `translate(${panOffset.x}px, ${panOffset.y}px)` }}
        >
          <defs>
            <marker
              id="arrowhead"
              markerWidth="10"
              markerHeight="7"
              refX="9"
              refY="3.5"
              orient="auto"
            >
              <polygon points="0 0, 10 3.5, 0 7" fill="#666" />
            </marker>
          </defs>

          {/* Draw connections */}
          {tree.nodes.map((node) =>
            (node.prerequisites || []).map((prereqId) => {
              const prereqNode = tree.nodes.find((n) => n.id === prereqId);
              if (!prereqNode) return null;

              const from = getNodePixelPos(prereqNode);
              const to = getNodePixelPos(node);

              // Calculate edge points (from edge of nodes, not centers)
              const angle = Math.atan2(to.y - from.y, to.x - from.x);
              const fromX = from.x + Math.cos(angle) * (NODE_SIZE / 2);
              const fromY = from.y + Math.sin(angle) * (NODE_SIZE / 2);
              const toX = to.x - Math.cos(angle) * (NODE_SIZE / 2 + 8);
              const toY = to.y - Math.sin(angle) * (NODE_SIZE / 2 + 8);

              return (
                <g key={`${prereqId}-${node.id}`}>
                  <line
                    x1={fromX}
                    y1={fromY}
                    x2={toX}
                    y2={toY}
                    stroke="#666"
                    strokeWidth="2"
                    markerEnd="url(#arrowhead)"
                    className="pointer-events-auto cursor-pointer hover:stroke-red-500"
                    onClick={() => handleRemoveConnection(prereqId, node.id)}
                  />
                </g>
              );
            })
          )}
        </svg>

        {/* Nodes */}
        <div
          className="absolute inset-0"
          style={{ transform: `translate(${panOffset.x}px, ${panOffset.y}px)` }}
        >
        {tree.nodes.map((node) => {
          const pos = getNodePixelPos(node);
          const isSelected = selectedNodeId === node.id;
          const colors = NODE_COLORS[node.type];

          return (
            <div
              key={node.id}
              className={`skill-tree-node absolute rounded-full border-2 flex items-center justify-center cursor-move select-none touch-none ${
                colors.bg
              } ${colors.border} ${
                isSelected
                  ? "ring-2 ring-white ring-offset-2 ring-offset-gray-900 scale-110"
                  : ""
              }`}
              style={{
                width: NODE_SIZE,
                height: NODE_SIZE,
                left: pos.x - NODE_SIZE / 2,
                top: pos.y - NODE_SIZE / 2,
              }}
              onMouseDown={(e) => handleNodePointerDown(e, node.id)}
              onTouchStart={(e) => handleNodePointerDown(e, node.id)}
              onDoubleClick={() => handleEditNode(node)}
              title={`${node.name}\nDouble-click to edit`}
            >
              <DynamicIcon
                name={node.symbol || NODE_TYPE_ICONS[node.type]}
                className="w-6 h-6 text-white"
              />

              {/* Node name label */}
              <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs text-white whitespace-nowrap bg-gray-900/80 px-1 rounded">
                {node.name}
              </div>
            </div>
          );
        })}
        </div>

        {/* Empty state */}
        {tree.nodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-500">
            <div className="text-center">
              <DynamicIcon
                name="GitBranch"
                className="w-12 h-12 mx-auto mb-2 opacity-50"
              />
              <p>
                Click &quot;Add Node&quot; to start building your skill tree
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Selected Node Panel */}
      {selectedNode && (
        <div className="p-3 sm:p-4 bg-gray-800/50 border border-gray-700 rounded-lg">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
            <h4 className="font-bold text-white flex items-center gap-2 text-sm sm:text-base">
              <DynamicIcon
                name={selectedNode.symbol || NODE_TYPE_ICONS[selectedNode.type]}
                className={`w-4 h-4 sm:w-5 sm:h-5 ${
                  NODE_COLORS[selectedNode.type].text
                }`}
              />
              {selectedNode.name}
            </h4>
            <div className="flex gap-1.5 sm:gap-2">
              <button
                onClick={() => handleStartConnection(selectedNode.id)}
                className="px-2 py-1 text-xs bg-yellow-600/50 hover:bg-yellow-600/70 text-yellow-200 rounded transition-colors flex items-center gap-1"
                title="Connect to another node as prerequisite"
              >
                <DynamicIcon name="Link" className="w-4 h-4" />
                <span className="hidden sm:inline">Connect</span>
              </button>
              <button
                onClick={() => handleEditNode(selectedNode)}
                className="px-2 py-1 text-xs bg-blue-600/50 hover:bg-blue-600/70 text-blue-200 rounded transition-colors flex items-center gap-1"
              >
                <DynamicIcon name="Edit" className="w-4 h-4" />
                <span className="hidden sm:inline">Edit</span>
              </button>
              <button
                onClick={() => handleDeleteNode(selectedNode.id)}
                className="px-2 py-1 text-xs bg-red-600/50 hover:bg-red-600/70 text-red-200 rounded transition-colors flex items-center gap-1"
              >
                <DynamicIcon name="Trash2" className="w-4 h-4" />
                <span className="hidden sm:inline">Delete</span>
              </button>
            </div>
          </div>

          <p className="text-xs sm:text-sm text-gray-400 mb-2">
            {selectedNode.description || (
              <span className="italic">No description</span>
            )}
          </p>

          <div className="text-xs text-gray-500 flex flex-wrap gap-x-3 gap-y-1">
            <span>
              Type:{" "}
              <span className={NODE_COLORS[selectedNode.type].text}>
                {selectedNode.type}
              </span>
            </span>
            <span>
              Prerequisites: {(selectedNode.prerequisites || []).length || "None"}
            </span>
            <span>Effects: {selectedNode.effects.length}</span>
          </div>
        </div>
      )}

      {/* Node Edit Modal */}
      {showNodeModal && editingNode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-gray-900 rounded-xl p-4 sm:p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-gray-700">
            <h3 className="text-lg sm:text-xl font-bold text-white mb-4 flex items-center gap-2">
              <DynamicIcon
                name={NODE_TYPE_ICONS[editingNode.type]}
                className={`w-5 h-5 sm:w-6 sm:h-6 ${
                  NODE_COLORS[editingNode.type].text
                }`}
              />
              Edit Node
            </h3>

            <div className="space-y-4">
              {/* Basic Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">
                    Name
                  </label>
                  <input
                    type="text"
                    value={editingNode.name}
                    onChange={(e) =>
                      setEditingNode({ ...editingNode, name: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">
                    Icon
                  </label>
                  <IconPicker
                    value={
                      editingNode.symbol || NODE_TYPE_ICONS[editingNode.type]
                    }
                    onChange={(iconName) =>
                      setEditingNode({ ...editingNode, symbol: iconName })
                    }
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">
                  Description
                </label>
                <textarea
                  value={editingNode.description}
                  onChange={(e) =>
                    setEditingNode({
                      ...editingNode,
                      description: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                  rows={2}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">
                  Node Type
                </label>
                <select
                  value={editingNode.type}
                  onChange={(e) =>
                    setEditingNode({
                      ...editingNode,
                      type: e.target.value as SkillNode["type"],
                    })
                  }
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                >
                  <option value="stat">Stat - Boosts a stat value</option>
                  <option value="ability">Ability - Grants an ability</option>
                  <option value="item">Item - Grants an item</option>
                  <option value="passive">Passive - Narrative bonus</option>
                  <option value="resource">
                    Resource - Boosts resource max
                  </option>
                </select>
              </div>

              {/* Effects Section */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-400">
                    Effects
                  </label>
                  <button
                    onClick={() => {
                      const newEffect: SkillNodeEffect = {
                        type:
                          editingNode.type === "stat"
                            ? "stat_bonus"
                            : editingNode.type === "resource"
                            ? "resource_bonus"
                            : editingNode.type === "ability"
                            ? "grant_ability"
                            : editingNode.type === "item"
                            ? "grant_item"
                            : "passive",
                        target: "",
                        value:
                          editingNode.type === "stat" ||
                          editingNode.type === "resource"
                            ? 5
                            : undefined,
                      };
                      setEditingNode({
                        ...editingNode,
                        effects: [...editingNode.effects, newEffect],
                      });
                    }}
                    className="px-2 py-1 text-xs bg-purple-600 hover:bg-purple-500 text-white rounded"
                  >
                    + Add Effect
                  </button>
                </div>

                <div className="space-y-2">
                  {editingNode.effects.map((effect, idx) => (
                    <div
                      key={idx}
                      className="flex flex-wrap gap-2 items-center p-2 bg-gray-800/50 rounded-lg"
                    >
                      <select
                        value={effect.type}
                        onChange={(e) => {
                          const newEffects = [...editingNode.effects];
                          newEffects[idx] = {
                            ...effect,
                            type: e.target.value as SkillNodeEffect["type"],
                          };
                          setEditingNode({
                            ...editingNode,
                            effects: newEffects,
                          });
                        }}
                        className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-xs sm:text-sm shrink-0"
                      >
                        <option value="stat_bonus">Stat Bonus</option>
                        <option value="resource_bonus">Resource Bonus</option>
                        <option value="grant_ability">Grant Ability</option>
                        <option value="grant_item">Grant Item</option>
                        <option value="passive">Passive</option>
                      </select>

                      {/* Target selection based on effect type */}
                      {effect.type === "stat_bonus" && (
                        <select
                          value={effect.target}
                          onChange={(e) => {
                            const newEffects = [...editingNode.effects];
                            newEffects[idx] = {
                              ...effect,
                              target: e.target.value,
                            };
                            setEditingNode({
                              ...editingNode,
                              effects: newEffects,
                            });
                          }}
                          className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-sm flex-1"
                        >
                          <option value="">Select Stat</option>
                          {availableStats.map((stat) => (
                            <option key={stat.name} value={stat.name}>
                              {stat.name}
                            </option>
                          ))}
                        </select>
                      )}

                      {effect.type === "resource_bonus" && (
                        <select
                          value={effect.target}
                          onChange={(e) => {
                            const newEffects = [...editingNode.effects];
                            newEffects[idx] = {
                              ...effect,
                              target: e.target.value,
                            };
                            setEditingNode({
                              ...editingNode,
                              effects: newEffects,
                            });
                          }}
                          className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-sm flex-1"
                        >
                          <option value="">Select Resource</option>
                          {availableResources.map((res) => (
                            <option key={res.name} value={res.name}>
                              {res.name}
                            </option>
                          ))}
                        </select>
                      )}

                      {effect.type === "grant_ability" && (
                        <select
                          value={effect.target}
                          onChange={(e) => {
                            const newEffects = [...editingNode.effects];
                            newEffects[idx] = {
                              ...effect,
                              target: e.target.value,
                            };
                            setEditingNode({
                              ...editingNode,
                              effects: newEffects,
                            });
                          }}
                          className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-sm flex-1"
                        >
                          <option value="">Select Ability</option>
                          {availableAbilities.map((ability) => (
                            <option key={ability.name} value={ability.name}>
                              {ability.name}
                            </option>
                          ))}
                        </select>
                      )}

                      {(effect.type === "grant_item" ||
                        effect.type === "passive") && (
                        <input
                          type="text"
                          value={effect.target}
                          onChange={(e) => {
                            const newEffects = [...editingNode.effects];
                            newEffects[idx] = {
                              ...effect,
                              target: e.target.value,
                            };
                            setEditingNode({
                              ...editingNode,
                              effects: newEffects,
                            });
                          }}
                          className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-sm flex-1"
                          placeholder={
                            effect.type === "grant_item"
                              ? "Item name"
                              : "Passive description"
                          }
                        />
                      )}

                      {/* Value for stat/resource bonuses */}
                      {(effect.type === "stat_bonus" ||
                        effect.type === "resource_bonus") && (
                        <input
                          type="number"
                          value={effect.value || 0}
                          onChange={(e) => {
                            const newEffects = [...editingNode.effects];
                            newEffects[idx] = {
                              ...effect,
                              value: parseInt(e.target.value) || 0,
                            };
                            setEditingNode({
                              ...editingNode,
                              effects: newEffects,
                            });
                          }}
                          className="w-16 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-sm"
                          placeholder="Value"
                        />
                      )}

                      {/* Quantity for items */}
                      {effect.type === "grant_item" && (
                        <input
                          type="number"
                          value={effect.quantity || 1}
                          onChange={(e) => {
                            const newEffects = [...editingNode.effects];
                            newEffects[idx] = {
                              ...effect,
                              quantity: parseInt(e.target.value) || 1,
                            };
                            setEditingNode({
                              ...editingNode,
                              effects: newEffects,
                            });
                          }}
                          className="w-16 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-sm"
                          placeholder="Qty"
                        />
                      )}

                      <button
                        onClick={() => {
                          const newEffects = editingNode.effects.filter(
                            (_, i) => i !== idx
                          );
                          setEditingNode({
                            ...editingNode,
                            effects: newEffects,
                          });
                        }}
                        className="p-1 text-red-400 hover:text-red-300"
                      >
                        <DynamicIcon name="X" className="w-4 h-4" />
                      </button>
                    </div>
                  ))}

                  {editingNode.effects.length === 0 && (
                    <p className="text-sm text-gray-500 italic">
                      No effects. Add an effect to make this node useful.
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex gap-3 mt-6 pt-4 border-t border-gray-700">
              <button
                onClick={() => {
                  setShowNodeModal(false);
                  setEditingNode(null);
                }}
                className="flex-1 px-4 py-2 font-medium rounded-lg bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveNodeEdit}
                className="flex-1 px-4 py-2 font-medium rounded-lg bg-purple-600 text-white hover:bg-purple-500 transition-colors"
              >
                Save Node
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Instructions */}
      <div className="p-3 bg-gray-800/30 rounded-lg text-xs text-gray-500">
        <p className="font-medium mb-1">Quick Guide:</p>
        <ul className="space-y-0.5">
          <li>
            • <strong>Drag</strong> nodes to reposition them
          </li>
          <li>
            • <strong>Double-click</strong> a node to edit its properties
          </li>
          <li>
            • <strong>Click &quot;Connect&quot;</strong> then click another node
            to make it require this node
          </li>
          <li>
            • <strong>Click a connection line</strong> to remove it
          </li>
          <li>• Root nodes (no prerequisites) can be unlocked immediately</li>
        </ul>
      </div>
    </div>
  );
}
