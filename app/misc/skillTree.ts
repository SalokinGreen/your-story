/**
 * Skill Tree System Utilities
 *
 * Handles skill tree operations including:
 * - Node unlocking and validation
 * - Effect application (stats, resources, abilities, items)
 * - Respec (reset all nodes and remove effects)
 * - Tree traversal and prerequisite checking
 */

import { StoryData, SkillTree, SkillNode, NodeEffects } from "./structs";

// ============================================
// NODE STATE HELPERS
// ============================================

/**
 * Get the full ID for a node (treeId:nodeId format)
 */
export function getFullNodeId(treeId: string, nodeId: string): string {
  return `${treeId}:${nodeId}`;
}

/**
 * Parse a full node ID into tree and node components
 */
export function parseFullNodeId(
  fullId: string
): { treeId: string; nodeId: string } | null {
  const parts = fullId.split(":");
  if (parts.length !== 2) return null;
  return { treeId: parts[0], nodeId: parts[1] };
}

/**
 * Check if a node is unlocked
 */
export function isNodeUnlocked(
  storyData: StoryData,
  treeId: string,
  nodeId: string
): boolean {
  const fullId = getFullNodeId(treeId, nodeId);
  return storyData.unlockedNodes?.includes(fullId) ?? false;
}

/**
 * Check if all prerequisites for a node are met
 */
export function arePrerequisitesMet(
  storyData: StoryData,
  tree: SkillTree,
  node: SkillNode
): boolean {
  // Root nodes (no prerequisites) are always available
  if (node.prerequisites.length === 0) return true;

  // Check each prerequisite
  return node.prerequisites.every((prereqId) =>
    isNodeUnlocked(storyData, tree.id, prereqId)
  );
}

/**
 * Get the state of a node: locked, available, or unlocked
 */
export type NodeState = "locked" | "available" | "unlocked";

export function getNodeState(
  storyData: StoryData,
  tree: SkillTree,
  node: SkillNode
): NodeState {
  if (isNodeUnlocked(storyData, tree.id, node.id)) {
    return "unlocked";
  }
  if (arePrerequisitesMet(storyData, tree, node)) {
    return "available";
  }
  return "locked";
}

/**
 * Get all nodes in a tree with their current states
 */
export function getNodesWithStates(
  storyData: StoryData,
  tree: SkillTree
): Array<{ node: SkillNode; state: NodeState }> {
  return tree.nodes.map((node) => ({
    node,
    state: getNodeState(storyData, tree, node),
  }));
}

// ============================================
// NODE UNLOCKING
// ============================================

/**
 * Initialize node effects if not present
 */
function ensureNodeEffects(storyData: StoryData): NodeEffects {
  if (!storyData.nodeEffects) {
    storyData.nodeEffects = {
      statBonuses: [],
      resourceBonuses: [],
      passives: [],
    };
  }
  return storyData.nodeEffects;
}

/**
 * Initialize unlocked nodes if not present
 */
function ensureUnlockedNodes(storyData: StoryData): string[] {
  if (!storyData.unlockedNodes) {
    storyData.unlockedNodes = [];
  }
  return storyData.unlockedNodes;
}

/**
 * Apply the effects of unlocking a node
 */
function applyNodeEffects(
  storyData: StoryData,
  tree: SkillTree,
  node: SkillNode
): void {
  const nodeEffects = ensureNodeEffects(storyData);
  const fullNodeId = getFullNodeId(tree.id, node.id);

  // Process each effect in the effects array
  for (const effect of node.effects) {
    switch (effect.type) {
      case "stat_bonus": {
        const stat = storyData.stats.find((s) => s.name === effect.target);
        if (stat && effect.value) {
          stat.value += effect.value;
        }
        nodeEffects.statBonuses.push({
          stat: effect.target,
          amount: effect.value || 0,
          nodeId: fullNodeId,
        });
        break;
      }

      case "resource_bonus": {
        const resource = storyData.resources.find(
          (r) => r.name === effect.target
        );
        if (resource && effect.value) {
          resource.maxValue += effect.value;
          // Also restore to full when upgrading
          resource.value = Math.min(
            resource.value + effect.value,
            resource.maxValue
          );
        }
        nodeEffects.resourceBonuses.push({
          resource: effect.target,
          amount: effect.value || 0,
          nodeId: fullNodeId,
        });
        break;
      }

      case "grant_ability": {
        if (!storyData.abilities) {
          storyData.abilities = [];
        }
        // If full ability data is provided, use it; otherwise create minimal ability
        if (effect.abilityData) {
          storyData.abilities.push({ ...effect.abilityData });
        } else {
          // Create minimal ability from name
          storyData.abilities.push({
            name: effect.target,
            description: `Unlocked from skill tree: ${node.name}`,
            symbol: "Sparkles",
            grade: "novice",
            cost: [],
            cooldown: 0,
            currentCooldown: 0,
          });
        }
        break;
      }

      case "grant_item": {
        const quantity = effect.quantity || 1;
        if (effect.itemData) {
          const existingItem = storyData.inventory.find(
            (i) => i.name === effect.itemData!.name
          );
          if (existingItem) {
            existingItem.quantity += quantity;
          } else {
            storyData.inventory.push({ ...effect.itemData, quantity });
          }
        } else {
          // Create minimal item from name
          const existingItem = storyData.inventory.find(
            (i) => i.name === effect.target
          );
          if (existingItem) {
            existingItem.quantity += quantity;
          } else {
            storyData.inventory.push({
              name: effect.target,
              description: `Unlocked from skill tree: ${node.name}`,
              symbol: "Package",
              type: "normal",
              quantity,
            });
          }
        }
        break;
      }

      case "passive": {
        nodeEffects.passives.push({
          name: effect.target,
          description: effect.target,
          nodeId: fullNodeId,
        });
        break;
      }
    }
  }
}

/**
 * Attempt to unlock a node
 * Returns true if successful, false if prerequisites not met or already unlocked
 */
export function unlockNode(
  storyData: StoryData,
  treeId: string,
  nodeId: string
): { success: boolean; message: string } {
  // Find the tree
  const tree = storyData.skillTrees?.find((t) => t.id === treeId);
  if (!tree) {
    return { success: false, message: "Skill tree not found" };
  }

  // Find the node
  const node = tree.nodes.find((n) => n.id === nodeId);
  if (!node) {
    return { success: false, message: "Node not found" };
  }

  // Check if already unlocked
  if (isNodeUnlocked(storyData, treeId, nodeId)) {
    return { success: false, message: "Node already unlocked" };
  }

  // Check prerequisites
  if (!arePrerequisitesMet(storyData, tree, node)) {
    return { success: false, message: "Prerequisites not met" };
  }

  // Unlock the node
  const unlockedNodes = ensureUnlockedNodes(storyData);
  unlockedNodes.push(getFullNodeId(treeId, nodeId));

  // Apply effects
  applyNodeEffects(storyData, tree, node);

  return { success: true, message: `Unlocked: ${node.name}` };
}

// ============================================
// RESPEC SYSTEM
// ============================================

/**
 * Remove effects from a specific node
 */
function removeNodeEffects(
  storyData: StoryData,
  tree: SkillTree,
  node: SkillNode,
  fullNodeId: string
): void {
  // Process each effect in the effects array
  for (const effect of node.effects) {
    switch (effect.type) {
      case "stat_bonus": {
        const stat = storyData.stats.find((s) => s.name === effect.target);
        if (stat && effect.value) {
          stat.value -= effect.value;
        }
        break;
      }

      case "resource_bonus": {
        const resource = storyData.resources.find(
          (r) => r.name === effect.target
        );
        if (resource && effect.value) {
          resource.maxValue -= effect.value;
          // Cap current value to new max
          resource.value = Math.min(resource.value, resource.maxValue);
        }
        break;
      }

      case "grant_ability": {
        const abilityName = effect.abilityData?.name || effect.target;
        const abilityIndex = storyData.abilities?.findIndex(
          (a) => a.name === abilityName
        );
        if (abilityIndex !== undefined && abilityIndex >= 0) {
          storyData.abilities?.splice(abilityIndex, 1);
        }
        break;
      }

      case "grant_item": {
        const itemName = effect.itemData?.name || effect.target;
        const quantity = effect.quantity || 1;
        const itemIndex = storyData.inventory.findIndex(
          (i) => i.name === itemName
        );
        if (itemIndex >= 0) {
          const item = storyData.inventory[itemIndex];
          item.quantity -= quantity;
          if (item.quantity <= 0) {
            storyData.inventory.splice(itemIndex, 1);
          }
        }
        break;
      }

      // Passives are tracked in nodeEffects, removed below
    }
  }

  // Remove from nodeEffects tracking
  if (storyData.nodeEffects) {
    storyData.nodeEffects.statBonuses =
      storyData.nodeEffects.statBonuses.filter((b) => b.nodeId !== fullNodeId);
    storyData.nodeEffects.resourceBonuses =
      storyData.nodeEffects.resourceBonuses.filter(
        (b) => b.nodeId !== fullNodeId
      );
    storyData.nodeEffects.passives = storyData.nodeEffects.passives.filter(
      (p) => p.nodeId !== fullNodeId
    );
  }
}

/**
 * Respec a single tree - remove all unlocked nodes and their effects
 * Returns the number of upgrade points refunded
 */
export function respecTree(
  storyData: StoryData,
  treeId: string
): { success: boolean; refunded: number; message: string } {
  const tree = storyData.skillTrees?.find((t) => t.id === treeId);
  if (!tree) {
    return { success: false, refunded: 0, message: "Skill tree not found" };
  }

  const unlockedNodes = storyData.unlockedNodes || [];
  let refunded = 0;

  // Find all nodes from this tree that are unlocked
  const treePrefix = `${treeId}:`;
  const nodesToRemove = unlockedNodes.filter((id) => id.startsWith(treePrefix));

  // Remove effects for each node
  for (const fullNodeId of nodesToRemove) {
    const parsed = parseFullNodeId(fullNodeId);
    if (!parsed) continue;

    const node = tree.nodes.find((n) => n.id === parsed.nodeId);
    if (node) {
      removeNodeEffects(storyData, tree, node, fullNodeId);
      refunded++;
    }
  }

  // Remove from unlocked nodes list
  storyData.unlockedNodes = unlockedNodes.filter(
    (id) => !id.startsWith(treePrefix)
  );

  return {
    success: true,
    refunded,
    message: `Reset ${tree.name}. Refunded ${refunded} upgrade point${
      refunded !== 1 ? "s" : ""
    }.`,
  };
}

/**
 * Respec all trees - complete reset
 */
export function respecAllTrees(storyData: StoryData): {
  success: boolean;
  refunded: number;
  message: string;
} {
  const trees = storyData.skillTrees || [];
  let totalRefunded = 0;

  for (const tree of trees) {
    const result = respecTree(storyData, tree.id);
    totalRefunded += result.refunded;
  }

  return {
    success: true,
    refunded: totalRefunded,
    message: `Reset all skill trees. Refunded ${totalRefunded} upgrade point${
      totalRefunded !== 1 ? "s" : ""
    }.`,
  };
}

// ============================================
// TREE UTILITIES
// ============================================

/**
 * Count total unlocked nodes across all trees
 */
export function getTotalUnlockedNodes(storyData: StoryData): number {
  return storyData.unlockedNodes?.length ?? 0;
}

/**
 * Count unlocked nodes in a specific tree
 */
export function getTreeUnlockedCount(
  storyData: StoryData,
  treeId: string
): number {
  const prefix = `${treeId}:`;
  return (
    storyData.unlockedNodes?.filter((id) => id.startsWith(prefix)).length ?? 0
  );
}

/**
 * Get all available (unlockable) nodes across all trees
 */
export function getAllAvailableNodes(
  storyData: StoryData
): Array<{ tree: SkillTree; node: SkillNode }> {
  const trees = storyData.skillTrees || [];
  const available: Array<{ tree: SkillTree; node: SkillNode }> = [];

  for (const tree of trees) {
    for (const node of tree.nodes) {
      if (getNodeState(storyData, tree, node) === "available") {
        available.push({ tree, node });
      }
    }
  }

  return available;
}

/**
 * Check if any skill trees are defined
 */
export function hasSkillTrees(storyData: StoryData): boolean {
  return (storyData.skillTrees?.length ?? 0) > 0;
}

/**
 * Get total passive bonuses from all unlocked nodes
 */
export function getActivePassives(
  storyData: StoryData
): Array<{ name: string; description: string }> {
  return (
    storyData.nodeEffects?.passives.map((p) => ({
      name: p.name,
      description: p.description,
    })) ?? []
  );
}

/**
 * Get total stat bonus from skill tree nodes for a specific stat
 */
export function getStatBonusFromNodes(
  storyData: StoryData,
  statName: string
): number {
  return (
    storyData.nodeEffects?.statBonuses
      .filter((b) => b.stat === statName)
      .reduce((sum, b) => sum + b.amount, 0) ?? 0
  );
}

/**
 * Get total resource max bonus from skill tree nodes for a specific resource
 */
export function getResourceBonusFromNodes(
  storyData: StoryData,
  resourceName: string
): number {
  return (
    storyData.nodeEffects?.resourceBonuses
      .filter((b) => b.resource === resourceName)
      .reduce((sum, b) => sum + b.amount, 0) ?? 0
  );
}

// ============================================
// VALIDATION
// ============================================

/**
 * Validate a skill tree structure
 */
export function validateSkillTree(tree: SkillTree): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!tree.id || tree.id.trim() === "") {
    errors.push("Tree must have an ID");
  }

  if (!tree.name || tree.name.trim() === "") {
    errors.push("Tree must have a name");
  }

  if (!tree.nodes || tree.nodes.length === 0) {
    errors.push("Tree must have at least one node");
  }

  // Check for duplicate node IDs
  const nodeIds = new Set<string>();
  for (const node of tree.nodes || []) {
    if (nodeIds.has(node.id)) {
      errors.push(`Duplicate node ID: ${node.id}`);
    }
    nodeIds.add(node.id);
  }

  // Check prerequisite references
  for (const node of tree.nodes || []) {
    for (const prereq of node.prerequisites) {
      if (!nodeIds.has(prereq)) {
        errors.push(
          `Node "${node.name}" references unknown prerequisite: ${prereq}`
        );
      }
    }
  }

  // Check for at least one root node (node with no prerequisites)
  const hasRoot = tree.nodes?.some((n) => n.prerequisites.length === 0);
  if (!hasRoot) {
    errors.push("Tree must have at least one root node (no prerequisites)");
  }

  // Check for circular dependencies
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  function hasCycle(nodeId: string): boolean {
    if (recursionStack.has(nodeId)) return true;
    if (visited.has(nodeId)) return false;

    visited.add(nodeId);
    recursionStack.add(nodeId);

    const node = tree.nodes?.find((n) => n.id === nodeId);
    if (node) {
      for (const prereq of node.prerequisites) {
        if (hasCycle(prereq)) return true;
      }
    }

    recursionStack.delete(nodeId);
    return false;
  }

  for (const node of tree.nodes || []) {
    if (hasCycle(node.id)) {
      errors.push(`Circular dependency detected involving node: ${node.name}`);
      break;
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Generate a unique ID for a new node
 */
export function generateNodeId(): string {
  return `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Generate a unique ID for a new tree
 */
export function generateTreeId(): string {
  return `tree_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create an empty skill tree template
 */
export function createEmptyTree(name: string = "New Skill Tree"): SkillTree {
  return {
    id: generateTreeId(),
    name,
    description: "",
    symbol: "GitBranch",
    nodes: [],
  };
}

/**
 * Create a new node with default values
 */
export function createEmptyNode(
  position: { x: number; y: number },
  type: SkillNode["type"] = "stat"
): SkillNode {
  return {
    id: generateNodeId(),
    name: "New Node",
    description: "",
    symbol: "Circle",
    type,
    position,
    prerequisites: [],
    effects: [],
  };
}
