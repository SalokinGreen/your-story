"use client";

import {
  Scene,
  StoryData,
  Choices,
  Choice,
  UPGRADE_COSTS,
  Preset,
} from "../misc/structs";
import Story from "./story";
import StatsPage from "./stats";
import LorePage from "./lore";
import QuestsPage from "./quests";
import MenuPage from "./menu";
import UpgradesPage from "./upgrades";
import { useState, useEffect, useRef, Suspense } from "react";
import { useNotification } from "../misc/NotificationContext";
import { useAuth } from "../misc/AuthContext";
import { supabase } from "../misc/supabase";
import { useSearchParams, useRouter } from "next/navigation";
import { DEFAULT_PRESET } from "../misc/presets";
import ConfirmDialog from "../components/ConfirmDialog";
import { authenticatedFetch } from "../misc/getAuthToken";
import {
  encryptStoryData,
  decryptStoryData,
  isEncrypted,
} from "../misc/encryption";
import { getModelConfig } from "../misc/ai_prices";
import { processLoreTriggers } from "../misc/lore";

// Cryptographically secure random number generator
// Returns a random integer between min (inclusive) and max (inclusive)
function getSecureRandomInt(min: number, max: number): number {
  const range = max - min + 1;
  const bytesNeeded = Math.ceil(Math.log2(range) / 8);
  const maxValue = Math.pow(256, bytesNeeded);
  const randomValues = new Uint8Array(bytesNeeded);

  // Rejection sampling to avoid modulo bias
  let randomNumber;
  do {
    crypto.getRandomValues(randomValues);
    randomNumber = randomValues.reduce(
      (acc, val, i) => acc + val * Math.pow(256, i),
      0
    );
  } while (randomNumber >= maxValue - (maxValue % range));

  return min + (randomNumber % range);
}

enum StoryState {
  STORY = "STORY",
  STATS = "STATS",
  INVENTORY = "INVENTORY",
  LORE = "LORE",
  QUESTS = "QUESTS",
  ACHIEVEMENTS = "ACHIEVEMENTS",
  UPGRADES = "UPGRADES",
  MENU = "MENU",
}

export function processCommands(
  commands: string[],
  storyData: StoryData,
  addNotification: (
    message: string,
    type: "success" | "failure" | "info" | "warning"
  ) => void
) {
  for (const command of commands) {
    const trimmed = command.trim();

    // /add_item: item name | description | type | quantity
    const addItemMatch = trimmed.match(
      /^\/add_item:\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(normal|consumable|story|misc)\s*\|\s*(\d+)$/i
    );
    if (addItemMatch) {
      const itemName = addItemMatch[1].trim();
      const description = addItemMatch[2].trim();
      const itemType = addItemMatch[3].trim().toLowerCase() as
        | "normal"
        | "consumable"
        | "story"
        | "misc";
      const quantity = parseInt(addItemMatch[4], 10);

      const existingItem = storyData.inventory.find((i) => i.name === itemName);
      if (existingItem) {
        existingItem.quantity += quantity;
        addNotification(
          `Added ${quantity} ${itemName} (${existingItem.quantity} total)`,
          "info"
        );
      } else {
        storyData.inventory.push({
          name: itemName,
          quantity: quantity,
          description: description,
          type: itemType,
          stat: "",
          resource: "",
          symbol: "📦",
        });
        addNotification(
          `Added ${quantity} ${itemName} to inventory`,
          "success"
        );
      }
      continue;
    }

    // /modify_item: item name(amount)
    const itemMatch = trimmed.match(/^\/modify_item:\s*(.+?)\(([+-]?\d+)\)$/i);
    if (itemMatch) {
      const itemName = itemMatch[1].trim();
      const amount = parseInt(itemMatch[2], 10);

      const itemIndex = storyData.inventory.findIndex(
        (i) => i.name === itemName
      );
      if (itemIndex !== -1) {
        storyData.inventory[itemIndex].quantity += amount;
        if (storyData.inventory[itemIndex].quantity <= 0) {
          storyData.inventory.splice(itemIndex, 1);
          addNotification(`Removed ${itemName} from inventory`, "info");
        } else {
          addNotification(
            `${amount > 0 ? "Added" : "Removed"} ${Math.abs(
              amount
            )} ${itemName}`,
            "info"
          );
        }
      } else if (amount > 0) {
        storyData.inventory.push({
          name: itemName,
          quantity: amount,
          description: "",
          type: "misc",
          stat: "",
          resource: "",
          symbol: "📦",
        });
        addNotification(`Added ${amount} ${itemName} to inventory`, "info");
      }
      continue;
    }

    // /trigger_achievement: achievement title
    const achievementMatch = trimmed.match(/^\/trigger_achievement:\s*(.+)$/i);
    if (achievementMatch) {
      const achievementTitle = achievementMatch[1].trim();

      const existing = storyData.achievements.find(
        (a) => a.title === achievementTitle
      );
      if (existing && !existing.dateAchieved) {
        existing.dateAchieved = new Date();
        storyData.points += existing.points;
        addNotification(
          `🏆 Achievement Unlocked: ${achievementTitle}`,
          "success"
        );
        addNotification(
          `💰 Earned ${existing.points} points! Total: ${storyData.points}`,
          "success"
        );
      }
      continue;
    }

    // /modify_momentum: amount
    const momentumMatch = trimmed.match(/^\/modify_momentum:\s*([+-]?\d+)$/i);
    if (momentumMatch) {
      const amount = parseInt(momentumMatch[1], 10);
      const oldValue = storyData.momentum;
      storyData.momentum = Math.max(
        0,
        Math.min(storyData.maxMomentum, storyData.momentum + amount)
      );
      addNotification(
        `⚡ Momentum: ${oldValue} → ${storyData.momentum}/${storyData.maxMomentum}`,
        amount > 0 ? "success" : "warning"
      );
      continue;
    }

    // /mark_beat: beat index
    const markBeatMatch = trimmed.match(/^\/mark_beat:\s*(\d+)$/i);
    if (markBeatMatch) {
      const beatIndex = parseInt(markBeatMatch[1], 10) - 1;
      if (beatIndex >= 0 && beatIndex < storyData.plot_beats.length) {
        storyData.plot_beats[beatIndex].fulfilled = true;
        addNotification(`📖 Story beat ${beatIndex + 1} completed`, "success");

        // Award points for completing a new beat (use custom points if set, otherwise default)
        if (!storyData.earnedPointsFromBeats.includes(beatIndex)) {
          storyData.earnedPointsFromBeats.push(beatIndex);
          const pointsAwarded =
            storyData.plot_beats[beatIndex].points ?? UPGRADE_COSTS.BEAT_REWARD;
          storyData.points += pointsAwarded;
          addNotification(
            `💰 Earned ${pointsAwarded} points! Total: ${storyData.points}`,
            "success"
          );
        }
      }
      continue;
    }

    // /create_quest: title | short description | full description | points
    const createQuestMatch = trimmed.match(
      /^\/create_quest:\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(\d+)$/i
    );
    if (createQuestMatch) {
      const title = createQuestMatch[1].trim();
      const shortDesc = createQuestMatch[2].trim();
      const fullDesc = createQuestMatch[3].trim();
      const points = parseInt(createQuestMatch[4], 10);

      if (!storyData.quests) storyData.quests = [];
      if (!storyData.earnedPointsFromQuests)
        storyData.earnedPointsFromQuests = [];

      const newQuest = {
        id: `quest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        title,
        shortDescription: shortDesc,
        description: fullDesc,
        active: true,
        fulfilled: false,
        points,
        createdAt: new Date(),
      };

      storyData.quests.push(newQuest);
      addNotification(`📜 New quest: ${title}`, "success");
      continue;
    }

    // /activate_quest: quest title
    const activateQuestMatch = trimmed.match(/^\/activate_quest:\s*(.+)$/i);
    if (activateQuestMatch) {
      const questTitle = activateQuestMatch[1].trim();
      if (!storyData.quests) storyData.quests = [];

      const quest = storyData.quests.find((q) => q.title === questTitle);
      if (quest) {
        quest.active = true;
        addNotification(`📜 Quest activated: ${questTitle}`, "info");
      }
      continue;
    }

    // /complete_quest: quest title
    const completeQuestMatch = trimmed.match(/^\/complete_quest:\s*(.+)$/i);
    if (completeQuestMatch) {
      const questTitle = completeQuestMatch[1].trim();
      if (!storyData.quests) storyData.quests = [];
      if (!storyData.earnedPointsFromQuests)
        storyData.earnedPointsFromQuests = [];

      const quest = storyData.quests.find((q) => q.title === questTitle);
      if (quest && !quest.fulfilled) {
        quest.fulfilled = true;

        // Award points if not already awarded
        if (!storyData.earnedPointsFromQuests.includes(quest.id)) {
          storyData.earnedPointsFromQuests.push(quest.id);
          storyData.points += quest.points;
          addNotification(`✅ Quest completed: ${questTitle}`, "success");
          addNotification(
            `💰 Earned ${quest.points} points! Total: ${storyData.points}`,
            "success"
          );
        } else {
          addNotification(`✅ Quest completed: ${questTitle}`, "success");
        }
      }
      continue;
    }

    // /deactivate_quest: quest title
    const deactivateQuestMatch = trimmed.match(/^\/deactivate_quest:\s*(.+)$/i);
    if (deactivateQuestMatch) {
      const questTitle = deactivateQuestMatch[1].trim();
      if (!storyData.quests) storyData.quests = [];

      const quest = storyData.quests.find((q) => q.title === questTitle);
      if (quest) {
        quest.active = false;
        addNotification(`📜 Quest deactivated: ${questTitle}`, "info");
      }
      continue;
    }

    // /create_lore: title | content | on_triggers | off_triggers
    const createLoreMatch = trimmed.match(
      /^\/create_lore:\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.*?)\s*\|\s*(.*)$/i
    );
    if (createLoreMatch) {
      const loreTitle = createLoreMatch[1].trim();
      const loreContent = createLoreMatch[2].trim();
      const onTriggers = createLoreMatch[3].trim();
      const offTriggers = createLoreMatch[4].trim();

      if (!storyData.lore) storyData.lore = [];

      // Check if lore entry already exists
      const existingLore = storyData.lore.find((l) => l.title === loreTitle);
      if (existingLore) {
        addNotification(`📚 Lore "${loreTitle}" already exists`, "warning");
      } else {
        const onTriggerArray = onTriggers
          ? onTriggers
              .split(",")
              .map((t) => t.trim())
              .filter((t) => t.length > 0)
          : [];
        const offTriggerArray = offTriggers
          ? offTriggers
              .split(",")
              .map((t) => t.trim())
              .filter((t) => t.length > 0)
          : [];

        storyData.lore.push({
          title: loreTitle,
          content: loreContent,
          relatedCharacters: [],
          relatedLocations: [],
          secrtet: false,
          keys: [],
          on_triggers: onTriggerArray,
          off_triggers: offTriggerArray,
          on: onTriggerArray.length === 0, // If no triggers, show from start
        });
        addNotification(`📚 New lore entry created: ${loreTitle}`, "success");
      }
      continue;
    }

    // /edit_beat_title: new title (index)
    const editBeatTitleMatch = trimmed.match(
      /^\/edit_beat_title:\s*(.+?)\((\d+)\)$/i
    );
    if (editBeatTitleMatch) {
      const newTitle = editBeatTitleMatch[1].trim();
      const beatIndex = parseInt(editBeatTitleMatch[2], 10);
      if (beatIndex >= 0 && beatIndex < storyData.plot_beats.length) {
        storyData.plot_beats[beatIndex].title = newTitle;
        addNotification(`📖 Story beat ${beatIndex + 1} title updated`, "info");
      }
      continue;
    }

    // /edit_beat_content: new content (index)
    const editBeatContentMatch = trimmed.match(
      /^\/edit_beat_content:\s*(.+?)\((\d+)\)$/i
    );
    if (editBeatContentMatch) {
      const newContent = editBeatContentMatch[1].trim();
      const beatIndex = parseInt(editBeatContentMatch[2], 10);
      if (beatIndex >= 0 && beatIndex < storyData.plot_beats.length) {
        storyData.plot_beats[beatIndex].content = newContent;
        addNotification(
          `📖 Story beat ${beatIndex + 1} content updated`,
          "info"
        );
      }
      continue;
    }

    // /add_beat: title | content
    const addBeatMatch = trimmed.match(/^\/add_beat:\s*(.+?)\|(.+)$/i);
    if (addBeatMatch) {
      const title = addBeatMatch[1].trim();
      const content = addBeatMatch[2].trim();
      storyData.plot_beats.push({
        title: title,
        content: content,
        fulfilled: false,
      });
      addNotification(`📖 New story beat added: ${title}`, "success");
      continue;
    }

    // /remove_beat: beat index
    const removeBeatMatch = trimmed.match(/^\/remove_beat:\s*(\d+)$/i);
    if (removeBeatMatch) {
      const beatIndex = parseInt(removeBeatMatch[1], 10);
      if (beatIndex >= 0 && beatIndex < storyData.plot_beats.length) {
        const removed = storyData.plot_beats.splice(beatIndex, 1)[0];
        addNotification(`📖 Story beat removed: ${removed.content}`, "warning");
      }
      continue;
    }
  }
}

// Utility: trim scene history to prevent bloat
function trimStoryData(data: StoryData): StoryData {
  const MAX_PERSISTED_PARTS = 10; // Keep last 10 scene parts
  return {
    ...data,
    scene: {
      ...data.scene,
      parts: data.scene.parts.slice(-MAX_PERSISTED_PARTS),
    },
  };
}

function StoryPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const storyId = searchParams.get("storyId");

  const { addNotification } = useNotification();
  const { user, getEncryptionPassword } = useAuth();
  const [currentState, setCurrentState] = useState<StoryState>(
    StoryState.STORY
  );
  const [storyData, setStoryData] = useState<StoryData | null>(null);
  const [storyDbId, setStoryDbId] = useState<string | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const [choices, setChoices] = useState<Choices>({ choices: [] });
  const [input, setInput] = useState<Record<string, boolean>>({});
  const [storyText, setStoryText] = useState("");
  const [loading, setLoading] = useState(false);
  const [momentumMode, setMomentumMode] = useState<
    "none" | "reroll" | "guarantee"
  >("none");
  const [pendingChoice, setPendingChoice] = useState<number | null>(null);
  const [loadingStory, setLoadingStory] = useState(true);
  const [started, setStarted] = useState(false);
  const [canRetry, setCanRetry] = useState(false);
  const [showPresetSelection, setShowPresetSelection] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<Preset | null>(null);
  const [tokenBalance, setTokenBalance] = useState<number | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    icon?: string;
    confirmText?: string;
    confirmButtonClass?: string;
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });

  // Fetch token balance on mount
  useEffect(() => {
    async function fetchBalance() {
      try {
        const response = await authenticatedFetch("/api/tokens/balance", {
          headers: {
            "Content-Type": "application/json",
          },
        });
        if (response.ok) {
          const data = await response.json();
          setTokenBalance(data.balance.total);
        }
      } catch (error) {
        console.error("Failed to fetch token balance:", error);
      }
    }
    fetchBalance();
  }, []);

  // Load story from database on mount
  useEffect(() => {
    if (!storyId) {
      addNotification("No story ID provided", "failure");
      setLoadingStory(false);
      return;
    }

    // Wait for user to be loaded before attempting to load story
    if (!user) {
      return;
    }

    async function loadStory() {
      try {
        // Check if this is a local story
        if (storyId?.startsWith("local_")) {
          const { getLocalStory } = await import(
            "@/app/misc/localStoryManager"
          );
          const localStory = await getLocalStory(storyId);

          if (!localStory) {
            throw new Error("Local story not found");
          }

          console.log("Local story loaded:", localStory);
          setStoryDbId(localStory.id);
          setStoryData(localStory.storyData);

          // Initialize story if no parts yet - show preset selection
          if (localStory.storyData.scene.parts.length === 0) {
            setShowPresetSelection(true);
            setLoadingStory(false);
            return;
          }

          // Set up UI state from loaded story
          const lastPart =
            localStory.storyData.scene.parts[
              localStory.storyData.scene.parts.length - 1
            ];
          setStoryText(lastPart.content);
          setChoices({ choices: lastPart.choices || [] });

          const inputs =
            lastPart.choices?.reduce(
              (acc, choice) => ({ ...acc, [choice.text]: false }),
              {} as Record<string, boolean>
            ) || {};
          setInput(inputs);
          setStarted(true);
          setLoadingStory(false);
          return;
        }

        // Get auth token
        const {
          data: { session },
        } = await supabase.auth.getSession();

        const headers: HeadersInit = {
          "Content-Type": "application/json",
        };

        if (session?.access_token) {
          headers["Authorization"] = `Bearer ${session.access_token}`;
        }

        const response = await fetch(`/api/stories/${storyId}`, { headers });
        console.log("Story fetch response status:", response.status);

        if (!response.ok) {
          const errorData = await response
            .json()
            .catch(() => ({ error: "Unknown error" }));
          console.error("Story fetch failed:", errorData);
          throw new Error(errorData.error || "Failed to load story");
        }

        const { story } = await response.json();
        console.log("Story loaded:", story);
        setStoryDbId(story.id);

        // Check if story data is encrypted
        let loadedStoryData: StoryData;
        if (isEncrypted(story.storyData)) {
          console.log("Story is encrypted, attempting decryption...");

          // Get user credentials for decryption
          const password = getEncryptionPassword();
          const email = user?.email;

          if (!password || !email) {
            throw new Error(
              "Cannot decrypt story: credentials not available. Please sign out and sign back in."
            );
          }

          try {
            // Decrypt the story data
            loadedStoryData = await decryptStoryData(
              story.storyData,
              email,
              password
            );
            console.log("Story decrypted successfully");
          } catch (decryptError) {
            console.error("Decryption failed:", decryptError);
            throw new Error(
              "Failed to decrypt story. Your credentials may have changed."
            );
          }
        } else {
          // Story is not encrypted, use as-is
          loadedStoryData = story.storyData;
        }

        // Initialize quest arrays if they don't exist (for backwards compatibility)
        if (!loadedStoryData.quests) loadedStoryData.quests = [];
        if (!loadedStoryData.earnedPointsFromQuests)
          loadedStoryData.earnedPointsFromQuests = [];

        // Process lore triggers on load to initialize lore visibility
        processLoreTriggers(loadedStoryData, addNotification);

        setStoryData(loadedStoryData);

        // Initialize story if no parts yet - show preset selection
        if (loadedStoryData.scene.parts.length === 0) {
          setShowPresetSelection(true);
          setLoadingStory(false);
          return;
        }

        // Set up UI state from loaded story
        const lastPart =
          loadedStoryData.scene.parts[loadedStoryData.scene.parts.length - 1];
        setStoryText(lastPart.content);
        setChoices({ choices: lastPart.choices || [] });

        const inputs =
          lastPart.choices?.reduce(
            (acc, choice) => ({ ...acc, [choice.text]: false }),
            {} as Record<string, boolean>
          ) || {};
        setInput(inputs);
        setStarted(true);
        setLoadingStory(false);
      } catch (error: any) {
        console.error("Error loading story:", error);
        addNotification(error.message || "Failed to load story", "failure");
        setLoadingStory(false);
      }
    }

    loadStory();
  }, [storyId, addNotification, user, getEncryptionPassword]);

  // Apply preset and start story
  const handlePresetSelect = async (preset: Preset) => {
    if (!storyData) return;

    const updatedStoryData = { ...storyData };

    // Apply preset to story data (skip if custom)
    if (preset.id !== "custom") {
      if (preset.playerSummary)
        updatedStoryData.player_summary = preset.playerSummary;
      if (preset.stats.length > 0)
        updatedStoryData.stats = JSON.parse(JSON.stringify(preset.stats));
      if (preset.resources.length > 0)
        updatedStoryData.resources = JSON.parse(
          JSON.stringify(preset.resources)
        );
      if (preset.inventory.length > 0)
        updatedStoryData.inventory = JSON.parse(
          JSON.stringify(preset.inventory)
        );
      if (preset.authorNotes)
        updatedStoryData.author_notes = preset.authorNotes;
    }

    // Add starting scene part
    updatedStoryData.scene.parts.push({
      content: updatedStoryData.starting_content,
      imageUrl: "",
      user: false,
      role: "assistant",
      choices: [{ text: "Start Story" }],
    });

    // Update story in database with preset applied
    if (storyDbId) {
      try {
        if (storyDbId.startsWith("local_")) {
          const { saveLocalStory } = await import(
            "@/app/misc/localStoryManager"
          );
          updatedStoryData.selected_preset = preset.id;
          await saveLocalStory(storyDbId, updatedStoryData);
        } else {
          const {
            data: { session },
          } = await supabase.auth.getSession();
          const headers: HeadersInit = {
            "Content-Type": "application/json",
          };
          if (session?.access_token) {
            headers["Authorization"] = `Bearer ${session.access_token}`;
          }

          const response = await fetch(`/api/stories/${storyDbId}`, {
            method: "PATCH",
            headers,
            body: JSON.stringify({
              storyData: updatedStoryData,
              selectedPreset: preset.id,
            }),
          });

          if (!response.ok) {
            console.error("Failed to save preset selection");
          }
        }
      } catch (error) {
        console.error("Error saving preset:", error);
      }
    }

    // Update local state
    setStoryData(updatedStoryData);
    setStoryText(updatedStoryData.starting_content);
    setChoices({ choices: [{ text: "Start Story" }] });
    setInput({ "Start Story": false });
    setStarted(true);
    setShowPresetSelection(false);
    setSelectedPreset(preset);

    addNotification(`Character preset "${preset.name}" applied! 🎭`, "success");
  };

  // Save story progress to database (debounced)
  async function saveProgress(updatedStoryData: StoryData) {
    if (!storyDbId) return;

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Debounce: only save after 3 seconds of no activity
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        // Handle local story saving
        if (storyDbId.startsWith("local_")) {
          const { saveLocalStory } = await import(
            "@/app/misc/localStoryManager"
          );
          // Trim scene history before saving to reduce data size
          const trimmedData = trimStoryData(updatedStoryData);
          await saveLocalStory(storyDbId, trimmedData);
          console.log("Local story saved");
          return;
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) return;

        // Check for encryption credentials
        const password = getEncryptionPassword();
        const email = user?.email;

        if (!password || !email) {
          // No credentials available - require user to re-login for security
          console.error(
            "Cannot save story: encryption credentials not available"
          );
          addNotification(
            "🔒 Please sign out and sign back in to enable encrypted story saving",
            "warning"
          );
          return; // Abort save to prevent unencrypted data storage
        }

        // Trim scene history before saving to reduce data size
        const trimmedData = trimStoryData(updatedStoryData);

        // Encrypt the story data before saving
        let dataToSave: any;
        try {
          dataToSave = await encryptStoryData(trimmedData, email, password);
          console.log("Story data encrypted for saving");
        } catch (encryptError) {
          console.error("Encryption failed:", encryptError);
          addNotification(
            "❌ Failed to encrypt story data. Please sign out and sign back in.",
            "failure"
          );
          return; // Abort save on encryption failure
        }

        await fetch(`/api/stories/${storyDbId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            storyData: dataToSave,
          }),
        });
      } catch (error) {
        console.error("Error saving progress:", error);
        addNotification(
          "Failed to save story progress. Please try again.",
          "failure"
        );
      }
    }, 3000); // 3 second debounce
  }

  // Update story data in state
  function updateStoryData(updates: Partial<StoryData>) {
    if (!storyData) return;

    // Get current model config for dynamic memory cap
    const modelKey =
      typeof window !== "undefined"
        ? localStorage.getItem("aiModel") || "deep-seek/deepseek-chat"
        : "deep-seek/deepseek-chat";
    const modelConfig = getModelConfig(modelKey);

    // Dynamic memory cap: 1/4 of context window (approx 4 chars per token)
    const CHARS_PER_TOKEN = 4;
    const memory_cap = modelConfig.maxTokens * 0.25 * CHARS_PER_TOKEN;

    // Remove duplicate entries from memory
    let addedItems = new Set<string>();
    const new_memory = storyData.memory.filter((item, index) => {
      if (addedItems.has(item)) {
        return false;
      } else {
        addedItems.add(item);
        return true;
      }
    });
    storyData.memory = new_memory;
    // Trim memory if too large
    let totalMemoryLength = storyData.memory.reduce(
      (acc, entry) => acc + entry.length,
      0
    );
    while (totalMemoryLength > memory_cap && storyData.memory.length > 0) {
      const removed = storyData.memory.shift();
      if (removed) {
        totalMemoryLength -= removed.length;
      }
    }
    const updatedStory = { ...storyData, ...updates };
    setStoryData(updatedStory);
  }

  async function handleCustomInput(customText: string) {
    if (!storyData) return;
    if (!user) {
      addNotification("Please sign in to continue the story", "warning");
      return;
    }

    setLoading(true);

    // Add user's custom input to scene
    storyData.scene.parts.push({
      content: "> " + customText,
      imageUrl: "",
      user: true,
      role: "user",
      choices: [],
    });

    // Process lore triggers after user input
    processLoreTriggers(storyData, addNotification);

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      addNotification("Session expired. Please sign in again.", "failure");
      setLoading(false);
      return;
    }

    // Build minimal payload for AI
    const MAX_CONTENT_LENGTH = 50000; // Increased limit per part

    // Get current model config to estimate needed context
    const modelKey =
      typeof window !== "undefined"
        ? localStorage.getItem("aiModel") || "deep-seek/deepseek-chat"
        : "deep-seek/deepseek-chat";
    const modelConfig = getModelConfig(modelKey);

    // Estimate needed characters (tokens * 4). Send a bit more to be safe.
    const neededChars = modelConfig.maxTokens * 5;

    let currentChars = 0;
    const partsToSend = [];

    // Iterate backwards to gather enough context
    for (let i = storyData.scene.parts.length - 1; i >= 0; i--) {
      const part = storyData.scene.parts[i];
      const content = part.content.substring(0, MAX_CONTENT_LENGTH);

      partsToSend.unshift({
        content: content,
        user: part.user,
        role: part.role,
        raw: part.raw,
      });

      currentChars += content.length;
      if (currentChars > neededChars) break;
    }

    const minimalStoryData: any = {
      story_name: storyData.story_name,
      premise: storyData.premise?.substring(0, 1500) || "",
      player_name: storyData.player_name,
      player_summary: storyData.player_summary?.substring(0, 800) || "",
      starting_content: storyData.starting_content?.substring(0, 1500) || "",
      stats: storyData.stats,
      resources: storyData.resources,
      inventory: storyData.inventory,
      achievements: storyData.achievements,
      momentum: storyData.momentum,
      maxMomentum: storyData.maxMomentum,
      points: storyData.points,
      plot_beats: storyData.plot_beats.map((beat) => ({
        title: beat.title.substring(0, 100),
        content: beat.content.substring(0, 300),
        fulfilled: beat.fulfilled,
      })),
      memory: storyData.memory, // Send full memory, server truncates
      lore: storyData.lore
        .filter((l) => l.on !== false)
        .map((l) => ({
          title: l.title.substring(0, 100),
          content: l.content.substring(0, 500),
          on: l.on,
        })),
      author_notes: storyData.author_notes?.substring(0, 1500) || "",
      player_notes: storyData.player_notes?.substring(0, 800) || "",
      chapters: storyData.chapters,
      currentChapter: storyData.currentChapter,
      scene: {
        parts: partsToSend,
      },
    };

    const payload = {
      storyData: minimalStoryData,
      userChoice: null, // No specific choice, just custom text
      model:
        typeof window !== "undefined"
          ? localStorage.getItem("aiModel") || undefined
          : undefined,
      useRawContext:
        typeof window !== "undefined"
          ? localStorage.getItem("useRawContext") === "true"
          : false,
      openRouterKey:
        typeof window !== "undefined"
          ? localStorage.getItem("openRouterKey") || undefined
          : undefined,
    };

    const payloadSize = JSON.stringify(payload).length;
    console.log(
      `Custom input payload size: ${(payloadSize / 1024).toFixed(2)} KB`
    );

    if (payloadSize > 4 * 1024 * 1024) {
      addNotification("❌ Story data too large for generation.", "failure");
      console.error("Payload exceeds 4MB limit:", payloadSize);
      setLoading(false);
      return;
    }

    await fetch("/api/story/next", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(payload),
    })
      .then(async (res) => {
        const contentType = res.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
          addNotification(
            `❌ Invalid response from server (expected JSON)`,
            "failure"
          );
          setLoading(false);
          return;
        }

        const text = await res.text();
        if (!text || text.trim() === "") {
          addNotification(`❌ Empty response from server`, "failure");
          setLoading(false);
          return;
        }

        let data;
        try {
          data = JSON.parse(text);
        } catch (e) {
          console.error("Failed to parse response:", text);
          addNotification(`❌ Invalid JSON response from server`, "failure");
          setLoading(false);
          return;
        }

        if (res.status === 402) {
          addNotification(`❌ ${data.error}`, "failure");
          if (data.balance) {
            addNotification(
              `Your balance: ${data.balance.tradable} tradable, ${data.balance.locked} locked`,
              "info"
            );
          }
          setLoading(false);
          return;
        }

        if (res.status === 401) {
          addNotification(
            `🔒 ${data.error || "Authentication required"}`,
            "failure"
          );
          setLoading(false);
          return;
        }

        if (!res.ok) {
          addNotification(
            `Error: ${data.error || "Failed to generate story"}`,
            "failure"
          );
          setLoading(false);
          return;
        }

        if (data.meta?.tokensDeducted) {
          addNotification(
            `✓ Used ${data.meta.tokensDeducted} tokens`,
            "success"
          );
          if (data.meta.remainingBalance) {
            addNotification(
              `Balance: ${data.meta.remainingBalance.total} tokens remaining (${data.meta.remainingBalance.tradable} tradable)`,
              "info"
            );
          }
        }

        if (data.part.commands && data.part.commands.length > 0) {
          processCommands(data.part.commands, storyData, addNotification);
        }

        if (data.part.memoryEntries && data.part.memoryEntries.length > 0) {
          storyData.memory.push(...data.part.memoryEntries);
        }

        processLoreTriggers(storyData, addNotification);

        storyData.scene.parts.push(data.part);
        setStoryData({ ...storyData });
        setCanRetry(true);
        setChoices({ choices: data.part.choices || [] });
        setLoading(false);
      })
      .catch((err) => {
        console.error("Custom input error:", err);
        addNotification(`❌ Error generating story: ${err.message}`, "failure");
        setLoading(false);
      });
  }

  async function handleChoice() {
    if (!storyData) return;
    const choice = choices.choices.find((c) => input[c.text]);
    if (!choice) return;
    const key = choices.choices.indexOf(choice);

    if (!user) {
      addNotification("Please sign in to continue the story", "warning");
      return;
    }

    setLoading(true);

    // Handle momentum spending
    if (momentumMode === "reroll" && storyData.momentum >= 1) {
      storyData.momentum--;
      addNotification(
        `⚡ Spent 1 Momentum for Reroll! (${storyData.momentum}/${storyData.maxMomentum} remaining)`,
        "info"
      );
    } else if (momentumMode === "guarantee" && storyData.momentum >= 2) {
      storyData.momentum -= 2;
      addNotification(
        `⚡ Spent 2 Momentum for Guaranteed Success! (${storyData.momentum}/${storyData.maxMomentum} remaining)`,
        "success"
      );
    }

    let dice_roll = getSecureRandomInt(1, 100);

    // Build detailed RPG-style choice text with brackets
    let choiceDetails: string[] = [];

    // Track state changes for display
    let itemQuantityBefore = 0;
    let itemQuantityAfter = 0;
    let itemBroken = false;
    let resourceUsedBefore = 0;
    let resourceUsedAfter = 0;
    let insufficientResource = false;
    let skillCheckResult = "";

    // Process item usage
    if (choice.item_used) {
      const item = storyData.inventory.find((i) => i.name === choice.item_used);
      const item_exists = item !== undefined;

      if (item_exists && item) {
        itemQuantityBefore = item.quantity;
        const itemType = item.type || "normal";

        // Handle advantage based on item type
        if (itemType === "misc") {
          // Misc items don't give advantage, but prevent disadvantage
          addNotification(
            `Used item: ${choice.item_used} (No disadvantage)`,
            "info"
          );
        } else {
          // Normal, consumable, and story items give advantage
          addNotification(
            `Used item: ${choice.item_used} (Advantage!)`,
            "info"
          );
          const second_roll = getSecureRandomInt(1, 100);
          if (second_roll < dice_roll) {
            dice_roll = second_roll;
          }
        }

        if (momentumMode === "reroll") {
          // Reroll: roll two more times and take the best
          const reroll1 = getSecureRandomInt(1, 100);
          const reroll2 = getSecureRandomInt(1, 100);
          dice_roll = Math.min(dice_roll, reroll1, reroll2);
          addNotification(
            `🎲 Reroll used! Best of 3 rolls: ${dice_roll}`,
            "success"
          );
        }

        // Handle item consumption based on type
        // Consumable: Always consumed when used
        if (itemType === "consumable") {
          const itemIndex = storyData.inventory.findIndex(
            (i) => i.name === choice.item_used
          );
          if (itemIndex !== -1) {
            if (storyData.inventory[itemIndex].quantity > 1) {
              storyData.inventory[itemIndex].quantity--;
              itemQuantityAfter = storyData.inventory[itemIndex].quantity;
            } else {
              storyData.inventory.splice(itemIndex, 1);
              itemQuantityAfter = 0;
              itemBroken = true;
            }
          }
        } else {
          // Normal, story, misc: Not consumed on use (but normal can break on failure)
          itemQuantityAfter = itemQuantityBefore;
        }
      } else {
        // Item missing - disadvantage
        addNotification(
          `Missing item: ${choice.item_used} (Disadvantage!)`,
          "warning"
        );
        const second_roll = getSecureRandomInt(1, 100);
        if (second_roll > dice_roll) {
          dice_roll = second_roll;
        }
        if (momentumMode === "reroll") {
          // Reroll still helps with disadvantage
          const reroll1 = getSecureRandomInt(1, 100);
          const reroll2 = getSecureRandomInt(1, 100);
          dice_roll = Math.min(dice_roll, reroll1, reroll2);
          addNotification(
            `🎲 Reroll used! Best of 3 rolls: ${dice_roll}`,
            "success"
          );
        }
      }
    } else if (momentumMode === "reroll") {
      // No item - just reroll
      const reroll = getSecureRandomInt(1, 100);
      if (reroll < dice_roll) {
        dice_roll = reroll;
      }
      addNotification(`🎲 Reroll used! Better roll: ${dice_roll}`, "success");
    }

    // Process resource usage (resource is automatically at risk on skill check failure)
    if (choice.resource_used) {
      const resource = storyData.resources.find(
        (r) => r.name === choice.resource_used
      );
      if (resource) {
        const dc = choice.skill_dc || 0;
        const requiredAmount = Math.max(5, Math.floor(dc / 10)); // DC ÷ 10, minimum 5

        resourceUsedBefore = resource.value;

        // Check if player has enough resource
        if (resource.value < requiredAmount) {
          insufficientResource = true;
          const penalty = Math.max(5, Math.floor(dc / 10)); // DC ÷ 10, minimum 5
          addNotification(
            `⚠️ Insufficient ${resource.name}! Need ${requiredAmount}, have ${resource.value}. Roll penalty: -${penalty}`,
            "warning"
          );
        }
      } else {
        addNotification(
          `⚠️ Resource not found: ${choice.resource_used}`,
          "warning"
        );
      }
    }

    // Handle skill check
    if (choice.skill_used) {
      const statValue =
        storyData.stats.find((stat) => stat.name === choice.skill_used)
          ?.value || 0;
      const dc = choice.skill_dc || 0;

      // Calculate dice penalty if insufficient resource
      const dicePenalty = insufficientResource
        ? Math.max(5, Math.floor(dc / 10))
        : 0;
      const effectiveDiceRoll = Math.max(1, dice_roll - dicePenalty);

      // Handle guaranteed success
      if (momentumMode === "guarantee") {
        skillCheckResult = "success";
        addNotification(
          `✓ Guaranteed Success! (${choice.skill_used}: Auto-success with 2 Momentum)`,
          "success"
        );
      } else {
        const total = effectiveDiceRoll + statValue;
        const dc_passed = dice_roll === 100 || total >= dc;

        if (dc_passed) {
          skillCheckResult = "success";
          const penaltyText = insufficientResource
            ? ` (-${dicePenalty} dice penalty from insufficient resource)`
            : "";
          addNotification(
            `✓ Check Passed! (${choice.skill_used}: ${dice_roll}${
              insufficientResource ? ` - ${dicePenalty}` : ""
            } + ${statValue} = ${total} ≥ ${dc})${penaltyText}`,
            "success"
          );

          // Recover resource on success
          if (choice.resource_used) {
            const resource = storyData.resources.find(
              (r) => r.name === choice.resource_used
            );
            if (resource) {
              const recovery = Math.max(1, Math.floor(dc / 20)); // DC ÷ 20, minimum 1
              const beforeRecovery = resource.value;
              resource.value = Math.min(
                resource.maxValue,
                resource.value + recovery
              );
              resourceUsedAfter = resource.value;
              addNotification(
                `✨ ${resource.name} recovered: ${beforeRecovery} → ${resourceUsedAfter} (+${recovery})`,
                "success"
              );
            }
          }

          // Earn momentum on success (not when using guarantee or reroll)
          if (momentumMode === "none") {
            if (dice_roll === 100) {
              // Critical success: earn 2 momentum
              if (storyData.momentum < storyData.maxMomentum) {
                const earned = Math.min(
                  2,
                  storyData.maxMomentum - storyData.momentum
                );
                storyData.momentum += earned;
                addNotification(
                  `⚡ Critical Success! Earned ${earned} Momentum! (${storyData.momentum}/${storyData.maxMomentum})`,
                  "success"
                );
              }
            } else if (total >= dc + 20) {
              // Strong success (beat DC by 20+): earn 1 momentum
              if (storyData.momentum < storyData.maxMomentum) {
                storyData.momentum++;
                addNotification(
                  `⚡ Strong Success! Earned 1 Momentum! (${storyData.momentum}/${storyData.maxMomentum})`,
                  "success"
                );
              }
            }
          }
        } else {
          skillCheckResult = "failure";
          const penaltyText = insufficientResource
            ? ` (-${dicePenalty} dice penalty from insufficient resource)`
            : "";
          addNotification(
            `✗ Check Failed! (${choice.skill_used}: ${dice_roll}${
              insufficientResource ? ` - ${dicePenalty}` : ""
            } + ${statValue} = ${total} < ${dc})${penaltyText}`,
            "failure"
          );

          // On failure: lose additional resource if one was used (DC-based penalty)
          if (choice.resource_used) {
            const resource = storyData.resources.find(
              (r) => r.name === choice.resource_used
            );
            if (resource) {
              const lossBefore = resource.value;
              const penalty = Math.max(5, Math.floor(dc / 10)); // DC ÷ 10, minimum 5
              resource.value = Math.max(0, resource.value - penalty);
              const lossAfter = resource.value;
              addNotification(
                `💔 ${resource.name} lost from failure: ${lossBefore} → ${lossAfter} (-${penalty})`,
                "failure"
              );
            }
          }

          // Handle item breakage on failure (only for 'normal' type items)
          if (choice.item_used) {
            const item = storyData.inventory.find(
              (i) => i.name === choice.item_used
            );
            const itemType = item?.type || "normal";

            // Only normal items break on failure (not consumable, story, or misc)
            if (itemType === "normal" && item) {
              const itemIndex = storyData.inventory.findIndex(
                (i) => i.name === choice.item_used
              );
              if (
                itemIndex !== -1 &&
                itemQuantityAfter === itemQuantityBefore
              ) {
                // Only break if not already consumed
                if (storyData.inventory[itemIndex].quantity > 1) {
                  storyData.inventory[itemIndex].quantity--;
                  itemQuantityAfter = storyData.inventory[itemIndex].quantity;
                } else {
                  storyData.inventory.splice(itemIndex, 1);
                  itemQuantityAfter = 0;
                  itemBroken = true;
                }
                addNotification(
                  `${choice.item_used} broke from failure!`,
                  "failure"
                );
              }
            }
          }
        }
      }

      // Build skill check line
      const insufficientText = insufficientResource ? " ⚠️ NO SKILL BONUS" : "";
      choiceDetails.push(
        `[ ${choice.skill_used}: ${skillCheckResult}${insufficientText} ]`
      );
    }

    // Build item usage line
    if (choice.item_used && itemQuantityBefore > 0) {
      if (itemBroken) {
        choiceDetails.push(
          `[ Item used: ${choice.item_used}; x${itemQuantityBefore} → broken ]`
        );
      } else if (choice.item_loss) {
        choiceDetails.push(
          `[ Item used: ${choice.item_used}; x${itemQuantityBefore} → ${itemQuantityAfter} ]`
        );
      } else {
        choiceDetails.push(
          `[ Item used: ${choice.item_used}; x${itemQuantityBefore} ]`
        );
      }
    }

    // Build resource usage line (includes any additional loss from failure)
    if (choice.resource_used && resourceUsedBefore > 0) {
      const resource = storyData.resources.find(
        (r) => r.name === choice.resource_used
      );
      const maxValue = resource?.maxValue || 100;
      const currentValue = resource?.value || 0;
      choiceDetails.push(
        `[ Resource: ${choice.resource_used} ${resourceUsedBefore} → ${currentValue}/${maxValue} ]`
      );
    }

    // Construct final choice text
    let text = "";
    if (choiceDetails.length > 0) {
      text = choiceDetails.join("\n") + "\n";
    }
    text += "> " + choices.choices[key].text;
    console.log("Final choice text:", text);
    // Reset momentum mode after use
    setMomentumMode("none");

    storyData.scene.parts.push({
      content: text,
      imageUrl: "",
      user: true,
      role: "user",
      choices: [...choices.choices],
    });

    setChoices({ choices: [] });

    // Process lore triggers after user choice
    processLoreTriggers(storyData, addNotification);

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      addNotification("Session expired. Please sign in again.", "failure");
      setLoading(false);
      return;
    }

    // Build minimal payload - only send what the AI needs to generate the next part
    // The AI uses buildMessages() which only needs recent context + current state
    const MAX_CONTENT_LENGTH = 50000;

    // Get current model config to estimate needed context
    const modelKey =
      typeof window !== "undefined"
        ? localStorage.getItem("aiModel") || "deep-seek/deepseek-chat"
        : "deep-seek/deepseek-chat";
    const modelConfig = getModelConfig(modelKey);

    // Estimate needed characters (tokens * 4). Send a bit more to be safe.
    const neededChars = modelConfig.maxTokens * 5;

    let currentChars = 0;
    const partsToSend = [];

    // Iterate backwards to gather enough context
    for (let i = storyData.scene.parts.length - 1; i >= 0; i--) {
      const part = storyData.scene.parts[i];
      const content = part.content.substring(0, MAX_CONTENT_LENGTH);

      partsToSend.unshift({
        content: content,
        user: part.user,
        role: part.role,
        raw: part.raw,
      });

      currentChars += content.length;
      if (currentChars > neededChars) break;
    }

    // Build minimal story data object
    const minimalStoryData: any = {
      story_name: storyData.story_name,
      premise: storyData.premise?.substring(0, 1500) || "",
      player_name: storyData.player_name,
      player_summary: storyData.player_summary?.substring(0, 800) || "",
      starting_content: storyData.starting_content?.substring(0, 1500) || "",
      // Current game state - send as-is
      stats: storyData.stats,
      resources: storyData.resources,
      inventory: storyData.inventory,
      achievements: storyData.achievements,
      momentum: storyData.momentum,
      maxMomentum: storyData.maxMomentum,
      points: storyData.points,
      // Trimmed narrative context
      plot_beats: storyData.plot_beats.map((beat) => ({
        title: beat.title.substring(0, 100),
        content: beat.content.substring(0, 300),
        fulfilled: beat.fulfilled,
      })),
      memory: storyData.memory, // Send full memory
      lore: storyData.lore
        .filter((l) => l.on !== false) // Only send lore that is ON
        .map((l) => ({
          title: l.title.substring(0, 100),
          content: l.content.substring(0, 500),
          on: l.on,
        })),
      author_notes: storyData.author_notes?.substring(0, 1500) || "",
      player_notes: storyData.player_notes?.substring(0, 800) || "",
      // Chapter info
      chapters: storyData.chapters,
      currentChapter: storyData.currentChapter,
      // Recent scene parts only
      scene: {
        parts: partsToSend,
      },
    };

    const payload = {
      storyData: minimalStoryData,
      userChoice: choices.choices[key],
      model:
        typeof window !== "undefined"
          ? localStorage.getItem("aiModel") || undefined
          : undefined,
      useRawContext:
        typeof window !== "undefined"
          ? localStorage.getItem("useRawContext") === "true"
          : false,
      openRouterKey:
        typeof window !== "undefined"
          ? localStorage.getItem("openRouterKey") || undefined
          : undefined,
    };

    const payloadSize = JSON.stringify(payload).length;
    console.log(`Payload size: ${(payloadSize / 1024).toFixed(2)} KB`);

    if (payloadSize > 4 * 1024 * 1024) {
      addNotification("❌ Story data too large for generation.", "failure");
      console.error("Payload exceeds 4MB limit:", payloadSize);
      setLoading(false);
      return;
    }

    await fetch("/api/story/next", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(payload),
    })
      .then(async (res) => {
        // Check if response has content before parsing JSON
        const contentType = res.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
          addNotification(
            `❌ Invalid response from server (expected JSON)`,
            "failure"
          );
          setLoading(false);
          setChoices({
            choices:
              storyData.scene.parts[storyData.scene.parts.length - 1].choices ||
              [],
          });
          return;
        }

        const text = await res.text();
        if (!text || text.trim() === "") {
          addNotification(`❌ Empty response from server`, "failure");
          setLoading(false);
          setChoices({
            choices:
              storyData.scene.parts[storyData.scene.parts.length - 1].choices ||
              [],
          });
          return;
        }

        let data;
        try {
          data = JSON.parse(text);
        } catch (e) {
          console.error("Failed to parse response:", text);
          addNotification(`❌ Invalid JSON response from server`, "failure");
          setLoading(false);
          setChoices({
            choices:
              storyData.scene.parts[storyData.scene.parts.length - 1].choices ||
              [],
          });
          return;
        }

        if (res.status === 402) {
          addNotification(`❌ ${data.error}`, "failure");
          if (data.balance) {
            addNotification(
              `Your balance: ${data.balance.tradable} tradable, ${data.balance.locked} locked`,
              "info"
            );
          }
          setLoading(false);
          setChoices({
            choices:
              storyData.scene.parts[storyData.scene.parts.length - 1].choices ||
              [],
          });
          return;
        }

        if (res.status === 401) {
          addNotification(
            `🔒 ${data.error || "Authentication required"}`,
            "failure"
          );
          setLoading(false);
          return;
        }

        if (!res.ok) {
          addNotification(
            `Error: ${data.error || "Failed to generate story"}`,
            "failure"
          );
          setLoading(false);
          setChoices({
            choices:
              storyData.scene.parts[storyData.scene.parts.length - 1].choices ||
              [],
          });
          return;
        }

        // Update token balance
        if (data.meta?.remainingBalance?.total !== undefined) {
          setTokenBalance(data.meta.remainingBalance.total);
        }

        if (data.part.commands && data.part.commands.length > 0) {
          processCommands(data.part.commands, storyData, addNotification);
        }

        if (data.part.memoryEntries && data.part.memoryEntries.length > 0) {
          storyData.memory.push(...data.part.memoryEntries);
        }

        // Process lore triggers based on new content
        processLoreTriggers(storyData, addNotification);

        storyData.scene.parts.push(data.part);

        // Check for chapter completion and award points
        if (data.part.content.includes("!!! END CHAPTER !!!")) {
          const currentChapter = storyData.chapters.length;
          if (!storyData.earnedPointsFromChapters.includes(currentChapter)) {
            storyData.earnedPointsFromChapters.push(currentChapter);
            storyData.points += UPGRADE_COSTS.CHAPTER_REWARD;
            addNotification(
              `🎉 Chapter ${currentChapter} Complete! Earned ${UPGRADE_COSTS.CHAPTER_REWARD} points! Total: ${storyData.points}`,
              "success"
            );
          }
        }

        setStoryData({ ...storyData });
        setStoryText(data.part.content);
        setChoices({ choices: data.part.choices || [] });
        setLoading(false);
        setCanRetry(true); // Enable retry after successful AI response

        // Save progress to database
        await saveProgress(storyData);
      })
      .catch((error) => {
        console.error("Error fetching next story part:", error);
        addNotification("Network error. Please try again.", "failure");
        setLoading(false);
        setChoices({
          choices:
            storyData.scene.parts[storyData.scene.parts.length - 1].choices ||
            [],
        });
      });
  }

  function handleSelect(index: number): void {
    const key = choices.choices[index]?.text;
    if (!key) return;
    let newInput = input;
    if (!newInput[key]) {
      newInput[key] = true;
    }
    Object.keys(newInput).forEach((k) => {
      if (k !== key) {
        newInput[k] = false;
      }
    });
    setInput({ ...newInput });
  }

  async function handleRetry() {
    if (!storyData || loading) return;

    // Check if last part is an AI response
    const lastPart = storyData.scene.parts[storyData.scene.parts.length - 1];
    if (!lastPart || lastPart.user) {
      addNotification("Nothing to retry", "warning");
      return;
    }

    // Find the user's choice (second to last part)
    if (storyData.scene.parts.length < 2) {
      addNotification("Cannot retry initial story", "warning");
      return;
    }

    setLoading(true);
    setCanRetry(false);

    // Remove the last AI response
    storyData.scene.parts.pop();

    // Get the user choice part
    const userChoicePart =
      storyData.scene.parts[storyData.scene.parts.length - 1];

    // Restore choices from user's choice part
    if (userChoicePart.choices) {
      setChoices({ choices: userChoicePart.choices });
    }

    addNotification("Regenerating response...", "info");

    // Regenerate from current state
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      addNotification("Session expired. Please sign in again.", "failure");
      setLoading(false);
      return;
    }

    // Build minimal payload
    const MAX_CONTENT_LENGTH = 50000;

    // Get current model config to estimate needed context
    const modelKey =
      typeof window !== "undefined"
        ? localStorage.getItem("aiModel") || "deep-seek/deepseek-chat"
        : "deep-seek/deepseek-chat";
    const modelConfig = getModelConfig(modelKey);

    // Estimate needed characters (tokens * 4). Send a bit more to be safe.
    const neededChars = modelConfig.maxTokens * 5;

    let currentChars = 0;
    const partsToSend = [];

    // Iterate backwards to gather enough context
    for (let i = storyData.scene.parts.length - 1; i >= 0; i--) {
      const part = storyData.scene.parts[i];
      const content = part.content.substring(0, MAX_CONTENT_LENGTH);

      partsToSend.unshift({
        content: content,
        user: part.user,
        role: part.role,
        raw: part.raw,
      });

      currentChars += content.length;
      if (currentChars > neededChars) break;
    }

    const minimalStoryData: any = {
      story_name: storyData.story_name,
      premise: storyData.premise?.substring(0, 1500) || "",
      player_name: storyData.player_name,
      player_summary: storyData.player_summary?.substring(0, 800) || "",
      starting_content: storyData.starting_content?.substring(0, 1500) || "",
      stats: storyData.stats,
      resources: storyData.resources,
      inventory: storyData.inventory,
      achievements: storyData.achievements,
      momentum: storyData.momentum,
      maxMomentum: storyData.maxMomentum,
      points: storyData.points,
      plot_beats: storyData.plot_beats.map((beat) => ({
        title: beat.title.substring(0, 100),
        content: beat.content.substring(0, 300),
        fulfilled: beat.fulfilled,
      })),
      memory: storyData.memory, // Send full memory
      lore: storyData.lore
        .filter((l) => l.on !== false)
        .map((l) => ({
          title: l.title.substring(0, 100),
          content: l.content.substring(0, 500),
          on: l.on,
        })),
      author_notes: storyData.author_notes?.substring(0, 1500) || "",
      player_notes: storyData.player_notes?.substring(0, 800) || "",
      chapters: storyData.chapters,
      currentChapter: storyData.currentChapter,
      scene: { parts: partsToSend },
    };

    const payload = {
      storyData: minimalStoryData,
      model:
        typeof window !== "undefined"
          ? localStorage.getItem("aiModel") || undefined
          : undefined,
      useRawContext:
        typeof window !== "undefined"
          ? localStorage.getItem("useRawContext") === "true"
          : false,
    };

    await fetch("/api/story/next", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(payload),
    })
      .then(async (res) => {
        const contentType = res.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
          addNotification(`❌ Invalid response from server`, "failure");
          setLoading(false);
          setCanRetry(true);
          return;
        }

        const text = await res.text();
        if (!text || text.trim() === "") {
          addNotification(`❌ Empty response from server`, "failure");
          setLoading(false);
          setCanRetry(true);
          return;
        }

        let data;
        try {
          data = JSON.parse(text);
        } catch (e) {
          addNotification(`❌ Invalid JSON response`, "failure");
          setLoading(false);
          setCanRetry(true);
          return;
        }

        if (!res.ok) {
          addNotification(
            `Error: ${data.error || "Failed to generate story"}`,
            "failure"
          );
          setLoading(false);
          setCanRetry(true);
          return;
        }

        // Update token balance
        if (data.meta?.remainingBalance?.total !== undefined) {
          setTokenBalance(data.meta.remainingBalance.total);
        }

        if (data.part.commands && data.part.commands.length > 0) {
          processCommands(data.part.commands, storyData, addNotification);
        }

        if (data.part.memoryEntries && data.part.memoryEntries.length > 0) {
          storyData.memory.push(...data.part.memoryEntries);
        }

        processLoreTriggers(storyData, addNotification);
        storyData.scene.parts.push(data.part);

        if (data.part.content.includes("!!! END CHAPTER !!!")) {
          const currentChapter = storyData.chapters.length;
          if (!storyData.earnedPointsFromChapters.includes(currentChapter)) {
            storyData.earnedPointsFromChapters.push(currentChapter);
            storyData.points += UPGRADE_COSTS.CHAPTER_REWARD;
            addNotification(
              `🎉 Chapter ${currentChapter} Complete! Earned ${UPGRADE_COSTS.CHAPTER_REWARD} points! Total: ${storyData.points}`,
              "success"
            );
          }
        }

        setStoryData({ ...storyData });
        setStoryText(data.part.content);
        setChoices({ choices: data.part.choices || [] });
        setLoading(false);
        setCanRetry(true);
        addNotification("✓ Response regenerated", "success");

        await saveProgress(storyData);
      })
      .catch((error) => {
        console.error("Error retrying story:", error);
        addNotification("Network error. Please try again.", "failure");
        setLoading(false);
        setCanRetry(true);
      });
  }

  async function handlePurchase(cost: number, callback: () => void) {
    if (!storyData) return;

    if (storyData.points >= cost) {
      storyData.points -= cost;
      callback(); // Execute the upgrade
      setStoryData({ ...storyData });
      addNotification(
        `✨ Upgrade purchased! (${storyData.points} points remaining)`,
        "success"
      );
      await saveProgress(storyData);
    } else {
      addNotification(
        `❌ Not enough points! Need ${cost}, have ${storyData.points}`,
        "failure"
      );
    }
  }

  if (loadingStory) {
    return (
      <div className="min-h-screen bg-linear-to-br from-blue-50 via-purple-50 to-pink-50 dark:from-gray-900 dark:via-purple-900 dark:to-blue-900 font-sans py-8 px-4 sm:px-8">
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-purple-600 mx-auto"></div>
            <p className="mt-4 text-lg text-gray-600 dark:text-gray-400">
              Loading your story...
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Check for game over state
  const isGameOver =
    storyData?.scene.parts.some((part) => part.gameOver) || false;

  if (!storyData) {
    return (
      <div className="min-h-screen bg-linear-to-br from-blue-50 via-purple-50 to-pink-50 dark:from-gray-900 dark:via-purple-900 dark:to-blue-900 font-sans py-8 px-4 sm:px-8">
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <p className="text-lg text-gray-600 dark:text-gray-400">
              Story not found
            </p>
            <button
              onClick={() => router.push("/explorer")}
              className="mt-4 px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
            >
              Browse Adventures
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Game Over Screen
  if (isGameOver && storyData) {
    const achievedCount = storyData.achievements.filter(
      (a) => a.dateAchieved
    ).length;
    const totalAchievements = storyData.achievements.length;
    const completedBeats = storyData.plot_beats.filter(
      (b) => b.fulfilled
    ).length;
    const totalBeats = storyData.plot_beats.length;
    const completedQuests =
      storyData.quests?.filter((q) => q.fulfilled).length || 0;
    const totalQuests = storyData.quests?.length || 0;

    return (
      <div className="min-h-screen bg-linear-to-br from-blue-50 via-purple-50 to-pink-50 dark:from-gray-900 dark:via-purple-900 dark:to-blue-900 font-sans py-8 px-4 sm:px-8">
        <div className="max-w-4xl mx-auto">
          {/* Game Over Header */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 border border-gray-200 dark:border-gray-700 mb-6 text-center">
            <h1 className="text-5xl font-bold mb-4">🎭 Game Over 🎭</h1>
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
              {storyData.story_name}
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-400">
              {storyData.player_name}'s journey has concluded
            </p>
          </div>

          {/* Stats Summary */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 border border-gray-200 dark:border-gray-700 mb-6">
            <h3 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">
              📊 Final Statistics
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-3xl">🏆</span>
                  <span className="text-lg font-semibold text-gray-900 dark:text-white">
                    Achievements
                  </span>
                </div>
                <div className="text-3xl font-bold text-purple-600 dark:text-purple-400">
                  {achievedCount} / {totalAchievements}
                </div>
                <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                  {totalAchievements > 0
                    ? Math.round((achievedCount / totalAchievements) * 100)
                    : 0}
                  % Complete
                </div>
              </div>

              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-3xl">📖</span>
                  <span className="text-lg font-semibold text-gray-900 dark:text-white">
                    Story Beats
                  </span>
                </div>
                <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                  {completedBeats} / {totalBeats}
                </div>
                <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                  {totalBeats > 0
                    ? Math.round((completedBeats / totalBeats) * 100)
                    : 0}
                  % Complete
                </div>
              </div>

              <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-3xl">🎯</span>
                  <span className="text-lg font-semibold text-gray-900 dark:text-white">
                    Quests
                  </span>
                </div>
                <div className="text-3xl font-bold text-green-600 dark:text-green-400">
                  {completedQuests} / {totalQuests}
                </div>
                <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                  {totalQuests > 0
                    ? Math.round((completedQuests / totalQuests) * 100)
                    : 0}
                  % Complete
                </div>
              </div>

              <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-3xl">💰</span>
                  <span className="text-lg font-semibold text-gray-900 dark:text-white">
                    Total Points
                  </span>
                </div>
                <div className="text-3xl font-bold text-yellow-600 dark:text-yellow-400">
                  {storyData.points}
                </div>
                <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                  Progression Points Earned
                </div>
              </div>
            </div>
          </div>

          {/* Recent Achievements */}
          {achievedCount > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 border border-gray-200 dark:border-gray-700 mb-6">
              <h3 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">
                🏆 Achievements Earned
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {storyData.achievements
                  .filter((a) => a.dateAchieved)
                  .map((achievement, idx) => (
                    <div
                      key={idx}
                      className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800"
                    >
                      <div className="flex items-start gap-3">
                        <span className="text-3xl">{achievement.symbol}</span>
                        <div>
                          <div className="font-bold text-gray-900 dark:text-white">
                            {achievement.title}
                          </div>
                          <div className="text-sm text-gray-600 dark:text-gray-400">
                            {achievement.description}
                          </div>
                          <div className="text-xs text-amber-600 dark:text-amber-400 font-semibold mt-1">
                            +{achievement.points} points
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 border border-gray-200 dark:border-gray-700">
            <h3 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white text-center">
              What's Next?
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                onClick={() => {
                  setConfirmDialog({
                    isOpen: true,
                    title: "Replay Story",
                    message:
                      "Start this adventure from the beginning? All progress will be lost.",
                    icon: "🔄",
                    confirmText: "Replay",
                    confirmButtonClass: "bg-blue-600 hover:bg-blue-700",
                    onConfirm: async () => {
                      setConfirmDialog({ ...confirmDialog, isOpen: false });
                      // Replay same story - reset to beginning
                      if (!storyDbId) return;
                      try {
                        const {
                          data: { session },
                        } = await supabase.auth.getSession();
                        if (!session) {
                          addNotification(
                            "Please sign in to replay",
                            "warning"
                          );
                          return;
                        }

                        // Reset story to initial state but keep adventure template
                        const resetStoryData: StoryData = {
                          ...storyData,
                          scene: { parts: [] },
                          memory: [],
                          currentChapter: 0,
                          chapters: [],
                          momentum: storyData.momentum,
                          points: 0,
                          earnedPointsFromBeats: [],
                          earnedPointsFromChapters: [],
                          earnedPointsFromQuests: [],
                          plot_beats: storyData.plot_beats.map((b) => ({
                            ...b,
                            fulfilled: false,
                          })),
                          achievements: storyData.achievements.map((a) => ({
                            ...a,
                            dateAchieved: null,
                          })),
                          quests:
                            storyData.quests?.map((q) => ({
                              ...q,
                              fulfilled: false,
                              active: false,
                            })) || [],
                          lore: storyData.lore.map((l) => ({
                            ...l,
                            on:
                              l.on_triggers && l.on_triggers.length > 0
                                ? false
                                : true,
                          })),
                        };

                        await fetch(`/api/stories/${storyDbId}`, {
                          method: "PATCH",
                          headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${session.access_token}`,
                          },
                          body: JSON.stringify({ storyData: resetStoryData }),
                        });

                        addNotification(
                          "Story reset! Starting fresh...",
                          "success"
                        );
                        router.push(`/story?storyId=${storyDbId}`);
                        window.location.reload();
                      } catch (error) {
                        console.error("Error replaying story:", error);
                        addNotification("Failed to replay story", "failure");
                      }
                    },
                  });
                }}
                className="px-6 py-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors shadow-md flex items-center justify-center gap-2"
              >
                <span className="text-2xl">🔄</span>
                <div className="text-left">
                  <div>Replay Story</div>
                  <div className="text-xs opacity-80">
                    Start from the beginning
                  </div>
                </div>
              </button>

              <button
                onClick={() => {
                  setConfirmDialog({
                    isOpen: true,
                    title: "New Game Plus",
                    message:
                      "Start a New Game Plus run? You'll keep all achievements, stats, resources, and items, plus earn bonus rewards!",
                    icon: "⭐",
                    confirmText: "Start NG+",
                    confirmButtonClass:
                      "bg-linear-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700",
                    onConfirm: async () => {
                      setConfirmDialog({ ...confirmDialog, isOpen: false });
                      // New Game Plus - keep achievements and increase difficulty
                      if (!storyDbId) return;
                      try {
                        const {
                          data: { session },
                        } = await supabase.auth.getSession();
                        if (!session) {
                          addNotification(
                            "Please sign in for New Game Plus",
                            "warning"
                          );
                          return;
                        }

                        const ngPlusCount =
                          (storyData.newGamePlusCount || 0) + 1;
                        const bonusPoints = ngPlusCount * 50; // 50 points per NG+ run
                        const bonusMomentum = Math.min(ngPlusCount, 3); // Up to +3 max momentum

                        // Reset story but keep achievements, stats, resources, and inventory
                        const ngPlusStoryData: StoryData = {
                          ...storyData,
                          scene: { parts: [] },
                          memory: [],
                          currentChapter: 0,
                          chapters: [],
                          momentum: storyData.momentum,
                          maxMomentum: storyData.maxMomentum + bonusMomentum,
                          points: bonusPoints, // Start with bonus points
                          earnedPointsFromBeats: [],
                          earnedPointsFromChapters: [],
                          earnedPointsFromQuests: [],
                          plot_beats: storyData.plot_beats.map((b) => ({
                            ...b,
                            fulfilled: false,
                          })),
                          // Keep achievements, stats, resources, and inventory!
                          achievements: storyData.achievements,
                          stats: storyData.stats, // Keep stats
                          resources: storyData.resources, // Keep resources
                          inventory: storyData.inventory, // Keep inventory
                          quests:
                            storyData.quests?.map((q) => ({
                              ...q,
                              fulfilled: false,
                              active: false,
                            })) || [],
                          lore: storyData.lore.map((l) => ({
                            ...l,
                            on:
                              l.on_triggers && l.on_triggers.length > 0
                                ? false
                                : true,
                          })),
                          newGamePlusCount: ngPlusCount,
                          newGamePlusMode: true,
                        };

                        await fetch(`/api/stories/${storyDbId}`, {
                          method: "PATCH",
                          headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${session.access_token}`,
                          },
                          body: JSON.stringify({ storyData: ngPlusStoryData }),
                        });

                        addNotification(
                          `New Game Plus ${ngPlusCount} activated! +${bonusPoints} points, +${bonusMomentum} max momentum`,
                          "success"
                        );
                        router.push(`/story?storyId=${storyDbId}`);
                        window.location.reload();
                      } catch (error) {
                        console.error("Error starting NG+:", error);
                        addNotification(
                          "Failed to start New Game Plus",
                          "failure"
                        );
                      }
                    },
                  });
                }}
                className="px-6 py-4 bg-linear-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold rounded-lg transition-colors shadow-md flex items-center justify-center gap-2"
              >
                <span className="text-2xl">⭐</span>
                <div className="text-left">
                  <div>New Game Plus</div>
                  <div className="text-xs opacity-80">
                    Keep achievements + bonuses
                  </div>
                </div>
              </button>

              <button
                onClick={() => router.push("/library")}
                className="px-6 py-4 bg-gray-600 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors shadow-md flex items-center justify-center gap-2"
              >
                <span className="text-2xl">📚</span>
                <div className="text-left">
                  <div>Return to Library</div>
                  <div className="text-xs opacity-80">
                    View all your stories
                  </div>
                </div>
              </button>

              <button
                onClick={() => router.push("/explorer")}
                className="px-6 py-4 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-colors shadow-md flex items-center justify-center gap-2"
              >
                <span className="text-2xl">🗺️</span>
                <div className="text-left">
                  <div>Explore Adventures</div>
                  <div className="text-xs opacity-80">
                    Start a new adventure
                  </div>
                </div>
              </button>
            </div>

            {storyData.newGamePlusCount && storyData.newGamePlusCount > 0 && (
              <div className="mt-6 p-4 bg-linear-to-r from-amber-50 to-purple-50 dark:from-amber-900/20 dark:to-purple-900/20 rounded-lg border border-amber-200 dark:border-amber-800 text-center">
                <div className="font-bold text-lg text-amber-900 dark:text-amber-200">
                  ⭐ New Game Plus: Run #{storyData.newGamePlusCount}
                </div>
                <div className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                  Completed {storyData.newGamePlusCount}{" "}
                  {storyData.newGamePlusCount === 1
                    ? "playthrough"
                    : "playthroughs"}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Show preset selection before starting story
  if (showPresetSelection && storyData) {
    const availablePresets = [
      DEFAULT_PRESET,
      ...(storyData.presets || []).filter((p) => p.id !== "custom"),
    ];

    return (
      <div className="min-h-screen bg-linear-to-br from-blue-50 via-purple-50 to-pink-50 dark:from-gray-900 dark:via-purple-900 dark:to-blue-900 font-sans py-8 px-4 sm:px-8">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 sm:p-8 border border-gray-200 dark:border-gray-700 mb-6">
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-2">
              {storyData.story_name}
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Choose your character preset to begin your adventure
            </p>
          </div>

          {/* Preset Selection */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 sm:p-8 border border-gray-200 dark:border-gray-700">
            <h2 className="text-2xl font-bold mb-2 text-gray-900 dark:text-white">
              🎭 Select Your Character
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
              Choose a character archetype to start with pre-configured stats,
              items, and resources, or create your own custom character.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {availablePresets.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => handlePresetSelect(preset)}
                  className={`border-2 rounded-xl p-4 text-left transition-all hover:shadow-lg ${
                    preset.id === "custom"
                      ? "border-purple-300 dark:border-purple-700 bg-purple-50 dark:bg-purple-900/20 hover:border-purple-400 dark:hover:border-purple-600"
                      : "border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/30 hover:border-purple-400 dark:hover:border-purple-600"
                  }`}
                >
                  <div className="flex items-start gap-3 mb-3">
                    <span className="text-3xl">{preset.icon}</span>
                    <div className="flex-1">
                      <h3 className="font-bold text-lg text-gray-900 dark:text-white">
                        {preset.name}
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {preset.description}
                      </p>
                    </div>
                  </div>

                  {preset.id !== "custom" && (
                    <div className="flex flex-wrap gap-2 text-xs">
                      {preset.stats && preset.stats.length > 0 && (
                        <span className="px-2 py-1 bg-blue-200 dark:bg-blue-800/50 text-blue-800 dark:text-blue-200 rounded-full">
                          {preset.stats.length} Stats
                        </span>
                      )}
                      {preset.resources && preset.resources.length > 0 && (
                        <span className="px-2 py-1 bg-green-200 dark:bg-green-800/50 text-green-800 dark:text-green-200 rounded-full">
                          {preset.resources.length} Resources
                        </span>
                      )}
                      {preset.inventory && preset.inventory.length > 0 && (
                        <span className="px-2 py-1 bg-yellow-200 dark:bg-yellow-800/50 text-yellow-800 dark:text-yellow-200 rounded-full">
                          {preset.inventory.length} Items
                        </span>
                      )}
                    </div>
                  )}

                  {preset.id === "custom" && (
                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className="px-2 py-1 bg-purple-200 dark:bg-purple-800/50 text-purple-800 dark:text-purple-200 rounded-full">
                        Default Stats
                      </span>
                      <span className="px-2 py-1 bg-purple-200 dark:bg-purple-800/50 text-purple-800 dark:text-purple-200 rounded-full">
                        Starting Items
                      </span>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Back Button */}
          <div className="mt-6">
            <button
              onClick={() => router.push("/library")}
              className="px-6 py-3 bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600 hover:border-purple-500 dark:hover:border-purple-400 text-gray-900 dark:text-white font-semibold rounded-lg transition-colors shadow-md"
            >
              ← Back to Library
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-blue-50 via-purple-50 to-pink-50 dark:from-gray-900 dark:via-purple-900 dark:to-blue-900 font-sans py-8 px-4 sm:px-8 pt-24">
      <main className="flex gap-6 w-full max-w-4xl mx-auto flex-col">
        {/* Story Header */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 sm:p-8 border border-gray-200 dark:border-gray-700">
          <div className="flex justify-between items-center">
            <h1 className="text-3xl sm:text-4xl font-bold bg-linear-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
              {storyData.story_name}
            </h1>
            {tokenBalance !== null && (
              <div className="text-xl sm:text-2xl font-semibold text-yellow-500 dark:text-yellow-400 flex items-center gap-2">
                <span>🪙</span>
                <span>{tokenBalance}</span>
              </div>
            )}
          </div>
        </div>
        {/* Buttons for navigation and pages */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-4 sm:p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex flex-row flex-wrap items-center justify-center sm:justify-start gap-3">
            <button
              onClick={() => setCurrentState(StoryState.STORY)}
              className={`px-4 py-2.5 sm:px-6 sm:py-3 text-sm sm:text-base font-semibold rounded-lg transition-all shadow-md ${
                currentState === StoryState.STORY
                  ? "bg-linear-to-r from-gray-700 to-gray-900 text-white ring-2 ring-gray-400 shadow-lg"
                  : "bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-gray-600"
              }`}
            >
              📖 Story
            </button>
            <button
              onClick={() => setCurrentState(StoryState.STATS)}
              className={`px-4 py-2.5 sm:px-6 sm:py-3 text-sm sm:text-base font-semibold rounded-lg transition-all shadow-md ${
                currentState === StoryState.STATS
                  ? "bg-linear-to-r from-blue-600 to-blue-800 text-white ring-2 ring-blue-400 shadow-lg"
                  : "bg-blue-50 dark:bg-blue-900/30 text-blue-900 dark:text-blue-200 hover:bg-blue-100 dark:hover:bg-blue-900/50"
              }`}
            >
              📊 Stats
            </button>
            <button
              onClick={() => setCurrentState(StoryState.LORE)}
              className={`px-4 py-2.5 sm:px-6 sm:py-3 text-sm sm:text-base font-semibold rounded-lg transition-all shadow-md ${
                currentState === StoryState.LORE
                  ? "bg-linear-to-r from-purple-600 to-purple-800 text-white ring-2 ring-purple-400 shadow-lg"
                  : "bg-purple-50 dark:bg-purple-900/30 text-purple-900 dark:text-purple-200 hover:bg-purple-100 dark:hover:bg-purple-900/50"
              }`}
            >
              📜 Lore
            </button>
            <button
              onClick={() => setCurrentState(StoryState.QUESTS)}
              className={`px-4 py-2.5 sm:px-6 sm:py-3 text-sm sm:text-base font-semibold rounded-lg transition-all shadow-md ${
                currentState === StoryState.QUESTS
                  ? "bg-linear-to-r from-blue-600 to-blue-800 text-white ring-2 ring-blue-400 shadow-lg"
                  : "bg-blue-50 dark:bg-blue-900/30 text-blue-900 dark:text-blue-200 hover:bg-blue-100 dark:hover:bg-blue-900/50"
              }`}
            >
              🎯 Quests
            </button>
            <button
              onClick={() => setCurrentState(StoryState.UPGRADES)}
              className={`px-4 py-2.5 sm:px-6 sm:py-3 text-sm sm:text-base font-semibold rounded-lg transition-all shadow-md ${
                currentState === StoryState.UPGRADES
                  ? "bg-linear-to-r from-yellow-600 to-yellow-800 text-white ring-2 ring-yellow-400 shadow-lg"
                  : "bg-yellow-50 dark:bg-yellow-900/30 text-yellow-900 dark:text-yellow-200 hover:bg-yellow-100 dark:hover:bg-yellow-900/50"
              }`}
            >
              🛒 Upgrades
            </button>
            <button
              onClick={() => setCurrentState(StoryState.MENU)}
              className={`px-4 py-2.5 sm:px-6 sm:py-3 text-sm sm:text-base font-semibold rounded-lg transition-all shadow-md ${
                currentState === StoryState.MENU
                  ? "bg-linear-to-r from-green-600 to-green-800 text-white ring-2 ring-green-400 shadow-lg"
                  : "bg-green-50 dark:bg-green-900/30 text-green-900 dark:text-green-200 hover:bg-green-100 dark:hover:bg-green-900/50"
              }`}
            >
              ⚙️ Menu
            </button>
          </div>
        </div>

        {/* Render current page */}
        {currentState === StoryState.STORY && (
          <Story
            storyData={storyData}
            storyText={storyText}
            choices={choices}
            input={input}
            loading={loading}
            momentumMode={momentumMode}
            onMomentumModeChange={setMomentumMode}
            handleChoice={handleChoice}
            handleSelect={handleSelect}
            onCustomInput={handleCustomInput}
            onRetry={handleRetry}
            canRetry={canRetry}
          />
        )}
        {currentState === StoryState.STATS && <StatsPage {...storyData} />}
        {currentState === StoryState.LORE && <LorePage {...storyData} />}
        {currentState === StoryState.QUESTS && <QuestsPage {...storyData} />}
        {currentState === StoryState.UPGRADES && (
          <UpgradesPage storyData={storyData} onPurchase={handlePurchase} />
        )}
        {currentState === StoryState.MENU && (
          <MenuPage
            {...storyData}
            storyDbId={storyDbId}
            onSaveProgress={() => saveProgress(storyData)}
            onUpdateStoryData={updateStoryData}
          />
        )}
      </main>

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        icon={confirmDialog.icon}
        confirmText={confirmDialog.confirmText}
        confirmButtonClass={confirmDialog.confirmButtonClass}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}
      />
    </div>
  );
}

export default function StoryPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-linear-to-br from-blue-50 via-purple-50 to-pink-50 dark:from-gray-900 dark:via-purple-900 dark:to-blue-900 flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 dark:border-purple-400"></div>
        </div>
      }
    >
      <StoryPageContent />
    </Suspense>
  );
}
