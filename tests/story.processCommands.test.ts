import { describe, it, expect, vi, beforeEach } from "vitest";
import { processCommands } from "@/app/story/page";
import { StoryData, UPGRADE_COSTS } from "@/app/misc/structs";

describe("processCommands", () => {
  let mockStoryData: StoryData;
  let mockNotification: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockNotification = vi.fn();
    mockStoryData = {
      story_name: "Test Story",
      premise: "Test premise",
      player_name: "Hero",
      player_summary: "A brave hero",
      starting_content: "The adventure begins...",
      plot_beats: [
        {
          title: "First Beat",
          content: "First beat content",
          fulfilled: false,
          points: 30,
        },
        {
          title: "Second Beat",
          content: "Second beat content",
          fulfilled: false,
        },
      ],
      memory: [],
      max_chapters: 8,
      currentChapter: 0,
      chapters: [],
      scene: { parts: [] },
      stats: [
        {
          name: "Strength",
          value: 50,
          description: "Physical power",
          symbol: "💪",
        },
      ],
      resources: [
        {
          name: "Health",
          value: 100,
          maxValue: 100,
          description: "Life force",
          symbol: "❤️",
        },
      ],
      inventory: [],
      achievements: [
        {
          title: "First Victory",
          description: "Win your first battle",
          symbol: "🏆",
          points: 25,
          dateAchieved: null,
        },
      ],
      lore: [],
      quests: [],
      earnedPointsFromQuests: [],
      momentum: 0,
      maxMomentum: 3,
      points: 0,
      earnedPointsFromBeats: [],
      earnedPointsFromChapters: [],
      author_notes: "",
      selected_preset: "custom",
      presets: [],
      upgradeSettings: {
        enabled: false,
        allowStatUpgrade: false,
        statUpgradeCost: 10,
        statUpgradeAmount: 5,
        allowResourceUpgrade: false,
        resourceUpgradeCost: 10,
        resourceUpgradeAmount: 10,
        allowAddItem: false,
        addItemCost: 15,
        statShopEnabled: false,
        resourceShopEnabled: false,
        itemShopEnabled: false,
        statShop: [],
        resourceShop: [],
        itemShop: [],
      },
    };
  });

  describe("/add_item command", () => {
    it("should add a new item to inventory", () => {
      processCommands(
        ["/add_item: Health Potion | Restores health | consumable | 3"],
        mockStoryData,
        mockNotification
      );

      expect(mockStoryData.inventory).toHaveLength(1);
      expect(mockStoryData.inventory[0]).toMatchObject({
        name: "Health Potion",
        description: "Restores health",
        type: "consumable",
        quantity: 3,
      });
      expect(mockNotification).toHaveBeenCalledWith(
        "Added 3 Health Potion to inventory",
        "success"
      );
    });

    it("should add to existing item quantity", () => {
      mockStoryData.inventory = [
        {
          name: "Health Potion",
          quantity: 2,
          description: "Restores health",
          type: "consumable",
          stat: "",
          resource: "",
          symbol: "📦",
        },
      ];

      processCommands(
        ["/add_item: Health Potion | Restores health | consumable | 3"],
        mockStoryData,
        mockNotification
      );

      expect(mockStoryData.inventory).toHaveLength(1);
      expect(mockStoryData.inventory[0].quantity).toBe(5);
      expect(mockNotification).toHaveBeenCalledWith(
        "Added 3 Health Potion (5 total)",
        "info"
      );
    });

    it("should support all item types", () => {
      const types = ["normal", "consumable", "story", "misc"] as const;

      types.forEach((type) => {
        const freshData = {
          ...mockStoryData,
          inventory: Array.from(mockStoryData.inventory),
        };
        processCommands(
          [`/add_item: Test Item | Description | ${type} | 1`],
          freshData,
          mockNotification
        );

        expect(freshData.inventory[0].type).toBe(type);
      });
    });
  });

  describe("/modify_item command", () => {
    beforeEach(() => {
      mockStoryData.inventory = [
        {
          name: "Health Potion",
          quantity: 5,
          description: "Restores health",
          type: "consumable",
          stat: "",
          resource: "",
          symbol: "📦",
        },
      ];
    });

    it("should increase item quantity", () => {
      processCommands(
        ["/modify_item: Health Potion(3)"],
        mockStoryData,
        mockNotification
      );

      expect(mockStoryData.inventory[0].quantity).toBe(8);
      expect(mockNotification).toHaveBeenCalledWith(
        "Added 3 Health Potion",
        "info"
      );
    });

    it("should decrease item quantity", () => {
      processCommands(
        ["/modify_item: Health Potion(-2)"],
        mockStoryData,
        mockNotification
      );

      expect(mockStoryData.inventory[0].quantity).toBe(3);
      expect(mockNotification).toHaveBeenCalledWith(
        "Removed 2 Health Potion",
        "info"
      );
    });

    it("should remove item when quantity reaches 0 or below", () => {
      processCommands(
        ["/modify_item: Health Potion(-5)"],
        mockStoryData,
        mockNotification
      );

      expect(mockStoryData.inventory).toHaveLength(0);
      expect(mockNotification).toHaveBeenCalledWith(
        "Removed Health Potion from inventory",
        "info"
      );
    });

    it("should create new item if adding positive quantity to non-existent item", () => {
      processCommands(
        ["/modify_item: New Item(3)"],
        mockStoryData,
        mockNotification
      );

      expect(mockStoryData.inventory).toHaveLength(2);
      expect(mockStoryData.inventory[1]).toMatchObject({
        name: "New Item",
        quantity: 3,
      });
    });
  });

  describe("/trigger_achievement command", () => {
    it("should unlock achievement and award points", () => {
      processCommands(
        ["/trigger_achievement: First Victory"],
        mockStoryData,
        mockNotification
      );

      expect(mockStoryData.achievements[0].dateAchieved).toBeInstanceOf(Date);
      expect(mockStoryData.points).toBe(25);
      expect(mockNotification).toHaveBeenCalledWith(
        "🏆 Achievement Unlocked: First Victory",
        "success"
      );
      expect(mockNotification).toHaveBeenCalledWith(
        "💰 Earned 25 points! Total: 25",
        "success"
      );
    });

    it("should not unlock achievement twice", () => {
      mockStoryData.achievements[0].dateAchieved = new Date();
      const initialDate = mockStoryData.achievements[0].dateAchieved;

      processCommands(
        ["/trigger_achievement: First Victory"],
        mockStoryData,
        mockNotification
      );

      expect(mockStoryData.achievements[0].dateAchieved).toBe(initialDate);
      expect(mockStoryData.points).toBe(0);
    });

    it("should handle non-existent achievement", () => {
      processCommands(
        ["/trigger_achievement: Non Existent"],
        mockStoryData,
        mockNotification
      );

      expect(mockStoryData.points).toBe(0);
    });
  });

  describe("/modify_momentum command", () => {
    it("should increase momentum", () => {
      processCommands(["/modify_momentum: 2"], mockStoryData, mockNotification);

      expect(mockStoryData.momentum).toBe(2);
      expect(mockNotification).toHaveBeenCalledWith(
        "⚡ Momentum: 0 → 2/3",
        "success"
      );
    });

    it("should decrease momentum", () => {
      mockStoryData.momentum = 2;

      processCommands(
        ["/modify_momentum: -1"],
        mockStoryData,
        mockNotification
      );

      expect(mockStoryData.momentum).toBe(1);
      expect(mockNotification).toHaveBeenCalledWith(
        "⚡ Momentum: 2 → 1/3",
        "warning"
      );
    });

    it("should not exceed max momentum", () => {
      mockStoryData.momentum = 2;

      processCommands(["/modify_momentum: 5"], mockStoryData, mockNotification);

      expect(mockStoryData.momentum).toBe(3);
    });

    it("should not go below 0 momentum", () => {
      mockStoryData.momentum = 1;

      processCommands(
        ["/modify_momentum: -5"],
        mockStoryData,
        mockNotification
      );

      expect(mockStoryData.momentum).toBe(0);
    });
  });

  describe("/mark_beat command", () => {
    it("should mark beat as fulfilled and award custom points", () => {
      processCommands(["/mark_beat: 1"], mockStoryData, mockNotification);

      expect(mockStoryData.plot_beats[0].fulfilled).toBe(true);
      expect(mockStoryData.points).toBe(30);
      expect(mockStoryData.earnedPointsFromBeats).toContain(0);
      expect(mockNotification).toHaveBeenCalledWith(
        "📖 Story beat 1 completed",
        "success"
      );
      expect(mockNotification).toHaveBeenCalledWith(
        "💰 Earned 30 points! Total: 30",
        "success"
      );
    });

    it("should award default points if no custom points set", () => {
      processCommands(["/mark_beat: 2"], mockStoryData, mockNotification);

      expect(mockStoryData.plot_beats[1].fulfilled).toBe(true);
      expect(mockStoryData.points).toBe(UPGRADE_COSTS.BEAT_REWARD);
      expect(mockStoryData.earnedPointsFromBeats).toContain(1);
    });

    it("should not award points twice for same beat", () => {
      processCommands(["/mark_beat: 1"], mockStoryData, mockNotification);
      const firstPoints = mockStoryData.points;

      processCommands(["/mark_beat: 1"], mockStoryData, mockNotification);

      expect(mockStoryData.points).toBe(firstPoints);
      expect(mockStoryData.earnedPointsFromBeats).toHaveLength(1);
    });

    it("should handle invalid beat index", () => {
      processCommands(["/mark_beat: 99"], mockStoryData, mockNotification);

      expect(mockStoryData.points).toBe(0);
    });
  });

  describe("/create_quest command", () => {
    it("should create new quest", () => {
      processCommands(
        [
          "/create_quest: Find the Amulet | Locate amulet | Search ruins for the amulet | 50",
        ],
        mockStoryData,
        mockNotification
      );

      expect(mockStoryData.quests).toHaveLength(1);
      expect(mockStoryData.quests![0]).toMatchObject({
        title: "Find the Amulet",
        shortDescription: "Locate amulet",
        description: "Search ruins for the amulet",
        points: 50,
        active: true,
        fulfilled: false,
      });
      expect(mockNotification).toHaveBeenCalledWith(
        "📜 New quest: Find the Amulet",
        "success"
      );
    });

    it("should initialize quest arrays if not present", () => {
      delete (mockStoryData as any).quests;
      delete (mockStoryData as any).earnedPointsFromQuests;

      processCommands(
        ["/create_quest: Test | Short | Long | 10"],
        mockStoryData,
        mockNotification
      );

      expect(mockStoryData.quests).toBeDefined();
      expect(mockStoryData.earnedPointsFromQuests).toBeDefined();
    });
  });

  describe("/activate_quest command", () => {
    beforeEach(() => {
      mockStoryData.quests = [
        {
          id: "quest_1",
          title: "Test Quest",
          shortDescription: "Short",
          description: "Long description",
          active: false,
          fulfilled: false,
          points: 10,
          createdAt: new Date(),
        },
      ];
    });

    it("should activate inactive quest", () => {
      processCommands(
        ["/activate_quest: Test Quest"],
        mockStoryData,
        mockNotification
      );

      expect(mockStoryData.quests![0].active).toBe(true);
      expect(mockNotification).toHaveBeenCalledWith(
        "📜 Quest activated: Test Quest",
        "info"
      );
    });

    it("should handle non-existent quest", () => {
      processCommands(
        ["/activate_quest: Non Existent"],
        mockStoryData,
        mockNotification
      );

      expect(mockStoryData.quests![0].active).toBe(false);
    });
  });

  describe("/complete_quest command", () => {
    beforeEach(() => {
      mockStoryData.quests = [
        {
          id: "quest_1",
          title: "Test Quest",
          shortDescription: "Short",
          description: "Long description",
          active: true,
          fulfilled: false,
          points: 50,
          createdAt: new Date(),
        },
      ];
      mockStoryData.earnedPointsFromQuests = [];
    });

    it("should complete quest and award points", () => {
      processCommands(
        ["/complete_quest: Test Quest"],
        mockStoryData,
        mockNotification
      );

      expect(mockStoryData.quests![0].fulfilled).toBe(true);
      expect(mockStoryData.points).toBe(50);
      expect(mockStoryData.earnedPointsFromQuests).toContain("quest_1");
      expect(mockNotification).toHaveBeenCalledWith(
        "✅ Quest completed: Test Quest",
        "success"
      );
      expect(mockNotification).toHaveBeenCalledWith(
        "💰 Earned 50 points! Total: 50",
        "success"
      );
    });

    it("should not award points twice for same quest", () => {
      mockStoryData.earnedPointsFromQuests = ["quest_1"];
      mockStoryData.quests![0].fulfilled = false;

      processCommands(
        ["/complete_quest: Test Quest"],
        mockStoryData,
        mockNotification
      );

      expect(mockStoryData.quests![0].fulfilled).toBe(true);
      expect(mockStoryData.points).toBe(0);
    });

    it("should not complete already fulfilled quest", () => {
      mockStoryData.quests![0].fulfilled = true;

      processCommands(
        ["/complete_quest: Test Quest"],
        mockStoryData,
        mockNotification
      );

      expect(mockStoryData.points).toBe(0);
    });
  });

  describe("/deactivate_quest command", () => {
    beforeEach(() => {
      mockStoryData.quests = [
        {
          id: "quest_1",
          title: "Test Quest",
          shortDescription: "Short",
          description: "Long description",
          active: true,
          fulfilled: false,
          points: 10,
          createdAt: new Date(),
        },
      ];
    });

    it("should deactivate active quest", () => {
      processCommands(
        ["/deactivate_quest: Test Quest"],
        mockStoryData,
        mockNotification
      );

      expect(mockStoryData.quests![0].active).toBe(false);
      expect(mockNotification).toHaveBeenCalledWith(
        "📜 Quest deactivated: Test Quest",
        "info"
      );
    });

    it("should handle non-existent quest", () => {
      processCommands(
        ["/deactivate_quest: Non Existent"],
        mockStoryData,
        mockNotification
      );

      expect(mockStoryData.quests![0].active).toBe(true);
    });
  });

  describe("Multiple commands", () => {
    it("should process multiple commands in sequence", () => {
      processCommands(
        [
          "/add_item: Sword | A sharp blade | normal | 1",
          "/trigger_achievement: First Victory",
          "/mark_beat: 1",
          "/modify_momentum: 2",
        ],
        mockStoryData,
        mockNotification
      );

      expect(mockStoryData.inventory).toHaveLength(1);
      expect(mockStoryData.achievements[0].dateAchieved).toBeInstanceOf(Date);
      expect(mockStoryData.plot_beats[0].fulfilled).toBe(true);
      expect(mockStoryData.momentum).toBe(2);
      expect(mockStoryData.points).toBe(55); // 25 (achievement) + 30 (beat)
    });
  });

  describe("/create_lore command", () => {
    it("should create a new lore entry with triggers", () => {
      processCommands(
        ["/create_lore: Ancient Order | A secret society of mages | ancient,order | disbanded"],
        mockStoryData,
        mockNotification
      );

      expect(mockStoryData.lore).toHaveLength(1);
      const newLore = mockStoryData.lore[0];
      expect(newLore.title).toBe("Ancient Order");
      expect(newLore.content).toBe("A secret society of mages");
      expect(newLore.on_triggers).toEqual(["ancient", "order"]);
      expect(newLore.off_triggers).toEqual(["disbanded"]);
      expect(newLore.on).toBe(false); // Has triggers, so starts hidden
      expect(mockNotification).toHaveBeenCalledWith(
        "📚 New lore entry created: Ancient Order",
        "success"
      );
    });

    it("should create lore entry visible from start if no on_triggers", () => {
      processCommands(
        ["/create_lore: Basic Knowledge | Common information | | "],
        mockStoryData,
        mockNotification
      );

      expect(mockStoryData.lore).toHaveLength(1);
      const newLore = mockStoryData.lore[0];
      expect(newLore.title).toBe("Basic Knowledge");
      expect(newLore.on).toBe(true); // No triggers, visible from start
      expect(newLore.on_triggers).toEqual([]);
      expect(newLore.off_triggers).toEqual([]);
    });

    it("should handle empty trigger strings properly", () => {
      processCommands(
        ["/create_lore: Test Lore | Test content |  | hidden"],
        mockStoryData,
        mockNotification
      );

      const newLore = mockStoryData.lore[0];
      expect(newLore.on_triggers).toEqual([]);
      expect(newLore.off_triggers).toEqual(["hidden"]);
      expect(newLore.on).toBe(true); // No on_triggers, visible from start
    });

    it("should warn if lore with same title already exists", () => {
      processCommands(
        ["/create_lore: Test Lore | Initial content | test | "],
        mockStoryData,
        mockNotification
      );
      processCommands(
        ["/create_lore: Test Lore | Duplicate content | test | "],
        mockStoryData,
        mockNotification
      );

      expect(mockStoryData.lore).toHaveLength(1); // Only one entry added
      expect(mockNotification).toHaveBeenCalledWith(
        '📚 Lore "Test Lore" already exists',
        "warning"
      );
    });

    it("should trim whitespace from triggers", () => {
      processCommands(
        ["/create_lore: Trimmed Lore | Test content | sword , shield , armor | lost , broken "],
        mockStoryData,
        mockNotification
      );

      const newLore = mockStoryData.lore[0];
      expect(newLore.on_triggers).toEqual(["sword", "shield", "armor"]);
      expect(newLore.off_triggers).toEqual(["lost", "broken"]);
    });

    it("should initialize lore array if undefined", () => {
      mockStoryData.lore = undefined as any;
      processCommands(
        ["/create_lore: New Lore | Content | trigger | "],
        mockStoryData,
        mockNotification
      );

      expect(mockStoryData.lore).toBeDefined();
      expect(mockStoryData.lore).toHaveLength(1);
    });
  });
});
