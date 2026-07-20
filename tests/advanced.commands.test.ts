import { describe, it, expect, beforeEach } from "vitest";
import type { Resource, Stat, Goal } from "@/app/misc/structs";

// Mock functions
const mockNotifications: Array<{ message: string; type: string }> = [];
const mockAddNotification = (message: string, type: string) => {
  mockNotifications.push({ message, type });
};

const mockLogger = {
  action: (msg: string, data?: any) => {},
  warn: (msg: string, data?: any) => {},
  info: (msg: string, data?: any) => {},
};

// Simplified fuzzy matching for tests
function findResourceMatch(name: string, resources: Resource[]) {
  const exact = resources.find((r) => r.name === name);
  if (exact) return { item: exact, name: exact.name, score: 1, isExact: true };
  return null;
}

function findStatMatch(name: string, stats: Stat[]) {
  const exact = stats.find((s) => s.name === name);
  if (exact) return { item: exact, name: exact.name, score: 1, isExact: true };
  return null;
}

function findGoalMatch(title: string, goals: Goal[]) {
  const exact = goals.find((g) => g.title === title);
  if (exact) return { item: exact, name: exact.title, score: 1, isExact: true };
  return null;
}

// Command processor (simplified for testing)
function processAdvancedCommands(
  commands: string[],
  storyData: any,
  addNotification: typeof mockAddNotification,
  logger: typeof mockLogger
): void {
  for (const command of commands) {
    const trimmed = command.trim();

    // /add_resource: name | description | current | max
    const addResourceMatch = trimmed.match(
      /^\/add_resource:\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(\d+)\s*\|\s*(\d+)$/i
    );
    if (addResourceMatch) {
      const name = addResourceMatch[1].trim();
      const description = addResourceMatch[2].trim();
      const current = parseInt(addResourceMatch[3], 10);
      const max = parseInt(addResourceMatch[4], 10);
      const existing = storyData.resources.find(
        (r: Resource) => r.name === name
      );

      if (existing) {
        addNotification(`⚠️ Resource "${name}" already exists`, "warning");
      } else {
        storyData.resources.push({
          name,
          value: current,
          maxValue: max,
          description,
          symbol: "💎",
        });
        addNotification(`✨ New resource: ${name}`, "success");
      }
      continue;
    }

    // /modify_resource: name | current_delta | max_delta
    const modifyResourceMatch = trimmed.match(
      /^\/modify_resource:\s*(.+?)\s*\|\s*(-?\d+)\s*\|\s*(-?\d+)$/i
    );
    if (modifyResourceMatch) {
      const name = modifyResourceMatch[1].trim();
      const currentDelta = parseInt(modifyResourceMatch[2], 10);
      const maxDelta = parseInt(modifyResourceMatch[3], 10);
      const matchResult = findResourceMatch(name, storyData.resources);
      const resource = matchResult?.item;

      if (!resource) {
        addNotification(`⚠️ Resource "${name}" not found`, "warning");
      } else {
        resource.maxValue = Math.max(1, resource.maxValue + maxDelta);
        resource.value = Math.max(
          0,
          Math.min(resource.maxValue, resource.value + currentDelta)
        );
        addNotification(
          `✨ ${resource.name}: ${resource.value}/${resource.maxValue} (${
            currentDelta > 0 ? "+" : ""
          }${currentDelta}/${maxDelta > 0 ? "+" : ""}${maxDelta})`,
          "success"
        );
      }
      continue;
    }

    // /remove_resource: name
    const removeResourceMatch = trimmed.match(/^\/remove_resource:\s*(.+)$/i);
    if (removeResourceMatch) {
      const name = removeResourceMatch[1].trim();
      const matchResult = findResourceMatch(name, storyData.resources);
      const resource = matchResult?.item;

      if (!resource) {
        addNotification(`⚠️ Resource "${name}" not found`, "warning");
      } else {
        storyData.resources = storyData.resources.filter(
          (r: Resource) => r.name !== resource.name
        );
        addNotification(`✨ Removed resource: ${resource.name}`, "success");
      }
      continue;
    }

    // /add_stat: name | description | value
    const addStatMatch = trimmed.match(
      /^\/add_stat:\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(\d+)$/i
    );
    if (addStatMatch) {
      const name = addStatMatch[1].trim();
      const description = addStatMatch[2].trim();
      const value = parseInt(addStatMatch[3], 10);
      const existing = storyData.stats.find((s: Stat) => s.name === name);

      if (existing) {
        addNotification(`⚠️ Stat "${name}" already exists`, "warning");
      } else {
        storyData.stats.push({ name, value, description, symbol: "⭐" });
        addNotification(`✨ New stat: ${name}`, "success");
      }
      continue;
    }

    // /modify_stat: name | value_delta
    const modifyStatMatch = trimmed.match(
      /^\/modify_stat:\s*(.+?)\s*\|\s*(-?\d+)$/i
    );
    if (modifyStatMatch) {
      const name = modifyStatMatch[1].trim();
      const valueDelta = parseInt(modifyStatMatch[2], 10);
      const matchResult = findStatMatch(name, storyData.stats);
      const stat = matchResult?.item;

      if (!stat) {
        addNotification(`⚠️ Stat "${name}" not found`, "warning");
      } else {
        const oldValue = stat.value;
        stat.value = Math.max(0, stat.value + valueDelta);
        addNotification(
          `✨ ${stat.name}: ${oldValue} → ${stat.value} (${
            valueDelta > 0 ? "+" : ""
          }${valueDelta})`,
          "success"
        );
      }
      continue;
    }

    // /remove_stat: name
    const removeStatMatch = trimmed.match(/^\/remove_stat:\s*(.+)$/i);
    if (removeStatMatch) {
      const name = removeStatMatch[1].trim();
      const matchResult = findStatMatch(name, storyData.stats);
      const stat = matchResult?.item;

      if (!stat) {
        addNotification(`⚠️ Stat "${name}" not found`, "warning");
      } else {
        storyData.stats = storyData.stats.filter(
          (s: Stat) => s.name !== stat.name
        );
        addNotification(`✨ Removed stat: ${stat.name}`, "success");
      }
      continue;
    }

    // /update_goal_description: goal title | new description
    const updateGoalDescMatch = trimmed.match(
      /^\/update_goal_description:\s*(.+?)\s*\|\s*(.+)$/i
    );
    if (updateGoalDescMatch) {
      const goalTitle = updateGoalDescMatch[1].trim();
      const newDescription = updateGoalDescMatch[2].trim();
      const matchResult = findGoalMatch(goalTitle, storyData.goals);
      const goal = matchResult?.item;

      if (!goal) {
        addNotification(`⚠️ Goal "${goalTitle}" not found`, "warning");
      } else {
        goal.description = newDescription;
        addNotification(
          `✨ Goal "${goal.title}" description updated`,
          "success"
        );
      }
      continue;
    }

    // /update_goal_short_description: goal title | new short description
    const updateGoalShortDescMatch = trimmed.match(
      /^\/update_goal_short_description:\s*(.+?)\s*\|\s*(.+)$/i
    );
    if (updateGoalShortDescMatch) {
      const goalTitle = updateGoalShortDescMatch[1].trim();
      const newShortDescription = updateGoalShortDescMatch[2].trim();
      const matchResult = findGoalMatch(goalTitle, storyData.goals);
      const goal = matchResult?.item;

      if (!goal) {
        addNotification(`⚠️ Goal "${goalTitle}" not found`, "warning");
      } else {
        goal.shortDescription = newShortDescription;
        addNotification(`✨ Goal "${goal.title}" summary updated`, "success");
      }
      continue;
    }
  }
}

describe("Advanced AI Commands", () => {
  let storyData: any;

  beforeEach(() => {
    mockNotifications.length = 0;
    storyData = {
      resources: [
        {
          name: "Health",
          value: 80,
          maxValue: 100,
          description: "Life force",
          symbol: "❤️",
        },
        {
          name: "Mana",
          value: 50,
          maxValue: 50,
          description: "Magic energy",
          symbol: "✨",
        },
      ],
      stats: [
        {
          name: "Strength",
          value: 60,
          description: "Physical power",
          symbol: "💪",
        },
        {
          name: "Intelligence",
          value: 75,
          description: "Mental acuity",
          symbol: "🧠",
        },
      ],
      goals: [
        {
          id: "q1",
          title: "Save the Village",
          shortDescription: "Help villagers",
          description: "The village needs saving",
          active: true,
          fulfilled: false,
        },
      ],
    };
  });

  describe("Resource Management", () => {
    it("should add new resources", () => {
      processAdvancedCommands(
        ["/add_resource: Stamina | Physical energy | 100 | 100"],
        storyData,
        mockAddNotification,
        mockLogger
      );
      expect(
        storyData.resources.find((r: Resource) => r.name === "Stamina")
      ).toBeDefined();
    });

    it("should modify resource values", () => {
      processAdvancedCommands(
        ["/modify_resource: Health | -20 | 10"],
        storyData,
        mockAddNotification,
        mockLogger
      );
      const health = storyData.resources.find(
        (r: Resource) => r.name === "Health"
      );
      expect(health?.value).toBe(60);
      expect(health?.maxValue).toBe(110);
    });

    it("should cap resource value at max", () => {
      processAdvancedCommands(
        ["/modify_resource: Health | 50 | 0"],
        storyData,
        mockAddNotification,
        mockLogger
      );
      const health = storyData.resources.find(
        (r: Resource) => r.name === "Health"
      );
      expect(health?.value).toBe(100); // Capped at max
    });

    it("should remove resources", () => {
      processAdvancedCommands(
        ["/remove_resource: Mana"],
        storyData,
        mockAddNotification,
        mockLogger
      );
      expect(
        storyData.resources.find((r: Resource) => r.name === "Mana")
      ).toBeUndefined();
    });
  });

  describe("Stat Management", () => {
    it("should add new stats", () => {
      processAdvancedCommands(
        ["/add_stat: Charisma | Force of personality | 50"],
        storyData,
        mockAddNotification,
        mockLogger
      );
      expect(
        storyData.stats.find((s: Stat) => s.name === "Charisma")
      ).toBeDefined();
    });

    it("should modify stat values", () => {
      processAdvancedCommands(
        ["/modify_stat: Strength | 10"],
        storyData,
        mockAddNotification,
        mockLogger
      );
      expect(
        storyData.stats.find((s: Stat) => s.name === "Strength")?.value
      ).toBe(70);
    });

    it("should handle negative stat delta", () => {
      processAdvancedCommands(
        ["/modify_stat: Intelligence | -25"],
        storyData,
        mockAddNotification,
        mockLogger
      );
      expect(
        storyData.stats.find((s: Stat) => s.name === "Intelligence")?.value
      ).toBe(50);
    });

    it("should remove stats", () => {
      processAdvancedCommands(
        ["/remove_stat: Strength"],
        storyData,
        mockAddNotification,
        mockLogger
      );
      expect(
        storyData.stats.find((s: Stat) => s.name === "Strength")
      ).toBeUndefined();
    });
  });

  describe("Goal Management", () => {
    it("should update goal description", () => {
      processAdvancedCommands(
        [
          "/update_goal_description: Save the Village | The village is under attack by dragons",
        ],
        storyData,
        mockAddNotification,
        mockLogger
      );
      expect(storyData.goals[0].description).toBe(
        "The village is under attack by dragons"
      );
    });

    it("should update goal short description", () => {
      processAdvancedCommands(
        ["/update_goal_short_description: Save the Village | Dragon attack!"],
        storyData,
        mockAddNotification,
        mockLogger
      );
      expect(storyData.goals[0].shortDescription).toBe("Dragon attack!");
    });
  });

  describe("Error Handling", () => {
    it("should prevent duplicate resource names", () => {
      processAdvancedCommands(
        ["/add_resource: Health | Duplicate | 50 | 50"],
        storyData,
        mockAddNotification,
        mockLogger
      );
      expect(mockNotifications).toContainEqual({
        message: '⚠️ Resource "Health" already exists',
        type: "warning",
      });
    });

    it("should prevent duplicate stat names", () => {
      processAdvancedCommands(
        ["/add_stat: Strength | Duplicate | 50"],
        storyData,
        mockAddNotification,
        mockLogger
      );
      expect(mockNotifications).toContainEqual({
        message: '⚠️ Stat "Strength" already exists',
        type: "warning",
      });
    });
  });

  describe("Combined Operations", () => {
    it("should handle multiple commands in sequence", () => {
      const commands = [
        "/modify_stat: Strength | 10",
        "/modify_resource: Health | -20 | 0",
        "/update_goal_description: Save the Village | New goal details",
      ];
      processAdvancedCommands(
        commands,
        storyData,
        mockAddNotification,
        mockLogger
      );

      expect(
        storyData.stats.find((s: Stat) => s.name === "Strength")?.value
      ).toBe(70);
      expect(
        storyData.resources.find((r: Resource) => r.name === "Health")?.value
      ).toBe(60);
      expect(storyData.goals[0].description).toBe("New goal details");
    });
  });
});
