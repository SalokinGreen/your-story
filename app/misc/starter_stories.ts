import { StoryData } from "./structs";

const kids_on_machines: StoryData = {
  story_name: "Kids on Machines",
  premise:
    "Kids on motorcycles explore a futuristic city filled with neon lights and towering skyscrapers.",
  player_name: "Alex",
  player_summary:
    "You are a daring teenager who tries to make his dead pa proud by taking over the gang.",
  starting_content:
    "You rev your motorcycle's engine as you and your friends speed through the neon-lit streets of Neo City. The wind rushes past you, carrying the scent of rain and electricity. Ahead, the towering skyscrapers loom like giants, their windows glowing with vibrant colors. Suddenly, a rival gang appears, blocking your path. What do you do?",
  plot_beats: [],
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
  earnedPointsFromBeats: [],
  earnedPointsFromChapters: [],
  quests: [],
  earnedPointsFromQuests: [],
};
const goblin_layer: StoryData = {
  story_name: "Goblin Layer",
  premise:
    "In a dark fantasy world, a lone adventurer delves into a goblin-infested dungeon to retrieve a stolen artifact and lay with the goblins!",
  player_name: "Eldrin",
  player_summary:
    "You are a skilled rogue with a mysterious past, driven by a desire for justice and treasure.",
  starting_content:
    "You find yourself at the entrance of a rancid village. You see it has been looted and partly burned. The villagers look at you with a mix of fear and hope, whispering about the goblin lair that lies ahead.",
  plot_beats: [
    {
      title: "Prologue",
      content:
        "Eldrin receives a quest from a village elder to retrieve a stolen artifact from a goblin lair.",
      fulfilled: false,
    },
    {
      title: "Opening Image",
      content:
        "Eldrin approaches the entrance of a dark cave, the rumored goblin lair.",
      fulfilled: false,
    },
    {
      title: "First Plot Point",
      content:
        "Eldrin encounters the first wave of goblin guards and must use stealth or combat to proceed.",
      fulfilled: false,
    },
  ],
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
      symbol: "🌘",
    },
    {
      name: "Combat",
      value: 22,
      description: "Your skill in fighting and defending yourself.",
      symbol: "⚔️",
    },
    {
      name: "Perception",
      value: 18,
      description: "Your awareness of your surroundings.",
      symbol: "👁️",
    },
    {
      name: "Sex Appeal",
      value: 30,
      description: "Your attractiveness and charm and ability in the sheets.",
      symbol: "💋",
    },
  ],
  resources: [
    {
      name: "Health",
      value: 100,
      maxValue: 100,
      description: "Your overall health and vitality.",
      symbol: "❤️",
    },
    {
      name: "Stamina",
      value: 80,
      maxValue: 100,
      description: "Your energy levels for physical activities.",
      symbol: "⚡",
    },
    {
      name: "Mana",
      value: 50,
      maxValue: 100,
      description: "Your magical energy for casting spells.",
      symbol: "🔮",
    },
  ],
  inventory: [
    {
      name: "Gold Coins",
      description: "Currency used for trading and purchasing items.",
      quantity: 150,
      symbol: "🪙",
      type: "misc",
      stat: "",
      resource: "",
    },
    {
      name: "Dagger",
      description:
        "A small, sharp blade useful for close combat and stealth attacks.",
      quantity: 1,
      symbol: "🗡️",
      type: "normal",
      stat: "",
      resource: "",
    },
    {
      name: "Dick Potion",
      description: "A potion that increases your dick size and stamina.",
      quantity: 3,
      symbol: "🧪",
      type: "consumable",
      stat: "",
      resource: "",
    },
  ],
  achievements: [
    {
      title: "Goblin Slayer",
      description: "Defeat your first goblin in the lair.",
      symbol: "🗡️",
      dateAchieved: null,
      points: 10,
    },
    {
      title: "Stealth Master",
      description:
        "Successfully sneak past 10 goblin guards without being detected.",
      symbol: "🕵️‍♂️",
      dateAchieved: null,
      points: 20,
    },
  ],
  lore: [],
  momentum: 3,
  maxMomentum: 5,
  points: 0,
  earnedPointsFromBeats: [],
  earnedPointsFromChapters: [],
  quests: [],
  earnedPointsFromQuests: [],
  author_notes:
    "Mind the Layer in Goblin Layer. The player doesn't only kill but he also lays with monsters! Sex baby!",
  player_notes: "",
};

export { kids_on_machines, goblin_layer };
