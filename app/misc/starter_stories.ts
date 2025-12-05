import { StoryData } from "./structs";

const kids_on_machines: StoryData = {
  story_name: "Kids on Machines",
  premise:
    "Kids on motorcycles explore a futuristic city filled with neon lights and towering skyscrapers.",
  player_name: "Alex",
  player_summary:
    "You are a daring teenager who tries to make his dead pa proud by taking over the gang.",
  intro:
    "You rev your motorcycle's engine as you and your friends speed through the neon-lit streets of Neo City. The wind rushes past you, carrying the scent of rain and electricity. Ahead, the towering skyscrapers loom like giants, their windows glowing with vibrant colors. Suddenly, a rival gang appears, blocking your path. What do you do?",
  memory: [],
  max_chapters: 0,
  currentChapter: 0,
  chapters: [],
  scene: { parts: [] },
  stats: [],
  resources: [],
  inventory: [],
  achievements: [],
  lore: [],
  momentum: 3,
  maxMomentum: 5,
  points: 0,
  level: 1,
  upgradesSpent: 0,
  earnedPointsFromChapters: [],
  quests: [],
  earnedPointsFromQuests: [],
  relationships: [],
  conditions: [],
  abilities: [],
};
const goblin_layer: StoryData = {
  story_name: "Goblin Layer",
  premise:
    "In a dark fantasy world, a lone adventurer delves into a goblin-infested dungeon to retrieve a stolen artifact and lay with the goblins!",
  player_name: "Eldrin",
  player_summary:
    "You are a skilled rogue with a mysterious past, driven by a desire for justice and treasure.",
  intro:
    "You find yourself at the entrance of a rancid village. You see it has been looted and partly burned. The villagers look at you with a mix of fear and hope, whispering about the goblin lair that lies ahead.",
  memory: [],
  max_chapters: 26,
  currentChapter: 0,
  chapters: [
    {
      title: "The Quest Begins",
      summary:
        "Eldrin accepts the quest from the village elder and prepares to enter the goblin lair.",
      scene: { parts: [] },
      notes: [],
    },
  ],
  scene: { parts: [] },
  stats: [
    {
      name: "Stealth",
      value: 25,
      description: "Your ability to move unseen and unheard.",
      symbol: "Moon",
    },
    {
      name: "Combat",
      value: 22,
      description: "Your skill in fighting and defending yourself.",
      symbol: "Swords",
    },
    {
      name: "Perception",
      value: 18,
      description: "Your awareness of your surroundings.",
      symbol: "Eye",
    },
    {
      name: "Sex Appeal",
      value: 30,
      description: "Your attractiveness and charm and ability in the sheets.",
      symbol: "Heart",
    },
  ],
  resources: [
    {
      name: "Health",
      value: 100,
      maxValue: 100,
      description: "Your overall health and vitality.",
      symbol: "Heart",
    },
    {
      name: "Stamina",
      value: 80,
      maxValue: 100,
      description: "Your energy levels for physical activities.",
      symbol: "Zap",
    },
    {
      name: "Mana",
      value: 50,
      maxValue: 100,
      description: "Your magical energy for casting spells.",
      symbol: "Sparkles",
    },
  ],
  inventory: [
    {
      name: "Gold Coins",
      description: "Currency used for trading and purchasing items.",
      quantity: 150,
      symbol: "Coins",
      type: "misc",
      stat: "",
      resource: "",
    },
    {
      name: "Dagger",
      description:
        "A small, sharp blade useful for close combat and stealth attacks.",
      quantity: 1,
      symbol: "Sword",
      type: "normal",
      stat: "",
      resource: "",
    },
    {
      name: "Dick Potion",
      description: "A potion that increases your dick size and stamina.",
      quantity: 3,
      symbol: "Flask",
      type: "consumable",
      stat: "",
      resource: "",
    },
  ],
  achievements: [
    {
      title: "Goblin Slayer",
      description: "Defeat your first goblin in the lair.",
      symbol: "Sword",
      dateAchieved: null,
      points: 10,
    },
    {
      title: "Stealth Master",
      description:
        "Successfully sneak past 10 goblin guards without being detected.",
      symbol: "Ghost",
      dateAchieved: null,
      points: 20,
    },
  ],
  lore: [],
  momentum: 3,
  maxMomentum: 5,
  points: 0,
  level: 1,
  upgradesSpent: 0,
  earnedPointsFromChapters: [],
  quests: [],
  earnedPointsFromQuests: [],
  relationships: [],
  conditions: [],
  abilities: [],
  author_notes:
    "Mind the Layer in Goblin Layer. The player doesn't only kill but he also lays with monsters! Sex baby!",
  player_notes: "",
};

export { kids_on_machines, goblin_layer };
