"use client";

import { Scene, StoryData, Choices, Choice, UPGRADE_COSTS } from "../misc/structs";
import Story from "./story";
import StatsPage from "./stats";
import LorePage from "./lore";
import MenuPage from "./menu";
import UpgradesPage from "./upgrades";
import { useState, useEffect, useRef, Suspense } from "react";
import { useNotification } from "../misc/NotificationContext";
import { useAuth } from "../misc/AuthContext";
import { supabase } from "../misc/supabase";
import { useSearchParams, useRouter } from "next/navigation";
enum StoryState {
  STORY = "STORY",
  STATS = "STATS",
  INVENTORY = "INVENTORY",
  LORE = "LORE",
  ACHIEVEMENTS = "ACHIEVEMENTS",
  UPGRADES = "UPGRADES",
  MENU = "MENU",
}

function processCommands(
  commands: string[],
  storyData: StoryData,
  addNotification: (
    message: string,
    type: "success" | "failure" | "info" | "warning"
  ) => void
) {
  for (const command of commands) {
    const trimmed = command.trim();

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

    // /modify_stat: stat name(amount)
    const statMatch = trimmed.match(/^\/modify_stat:\s*(.+?)\(([+-]?\d+)\)$/i);
    if (statMatch) {
      const statName = statMatch[1].trim();
      const amount = parseInt(statMatch[2], 10);

      const stat = storyData.stats.find((s) => s.name === statName);
      if (stat) {
        const oldValue = stat.value;
        stat.value = Math.max(0, Math.min(100, stat.value + amount));
        addNotification(
          `${statName}: ${oldValue} → ${stat.value}`,
          amount > 0 ? "success" : "warning"
        );
      }
      continue;
    }

    // /modify_resource: resource name(amount)
    const resourceMatch = trimmed.match(
      /^\/modify_resource:\s*(.+?)\(([+-]?\d+)\)$/i
    );
    if (resourceMatch) {
      const resourceName = resourceMatch[1].trim();
      const amount = parseInt(resourceMatch[2], 10);

      const resource = storyData.resources.find((r) => r.name === resourceName);
      if (resource) {
        const oldValue = resource.value;
        resource.value = Math.max(
          0,
          Math.min(resource.maxValue, resource.value + amount)
        );
        addNotification(
          `${resourceName}: ${oldValue} → ${resource.value}/${resource.maxValue}`,
          amount > 0 ? "success" : "warning"
        );
      }
      continue;
    }

    // /add_achievement: achievement title
    const achievementMatch = trimmed.match(/^\/add_achievement:\s*(.+)$/i);
    if (achievementMatch) {
      const achievementTitle = achievementMatch[1].trim();

      const existing = storyData.achievements.find(
        (a) => a.title === achievementTitle
      );
      if (!existing) {
        storyData.achievements.push({
          title: achievementTitle,
          description: "",
          dateAchieved: new Date(),
          points: 10,
          symbol: "🏆",
        });
        addNotification(
          `🏆 Achievement Unlocked: ${achievementTitle}`,
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
      const beatIndex = parseInt(markBeatMatch[1], 10);
      if (beatIndex >= 0 && beatIndex < storyData.plot_beats.length) {
        storyData.plot_beats[beatIndex].fulfilled = true;
        addNotification(`📖 Story beat ${beatIndex} completed`, "success");
        
        // Award points for completing a new beat
        if (!storyData.earnedPointsFromBeats.includes(beatIndex)) {
          storyData.earnedPointsFromBeats.push(beatIndex);
          storyData.points += UPGRADE_COSTS.BEAT_REWARD;
          addNotification(
            `💰 Earned ${UPGRADE_COSTS.BEAT_REWARD} points! Total: ${storyData.points}`,
            "success"
          );
        }
      }
      continue;
    }

    // /edit_beat: edited text (index)
    const editBeatMatch = trimmed.match(/^\/edit_beat:\s*(.+?)\((\d+)\)$/i);
    if (editBeatMatch) {
      const beatText = editBeatMatch[1].trim();
      const beatIndex = parseInt(editBeatMatch[2], 10);
      if (beatIndex >= 0 && beatIndex < storyData.plot_beats.length) {
        storyData.plot_beats[beatIndex].content = beatText;
        addNotification(`📖 Story beat ${beatIndex + 1} updated`, "info");
      }
      continue;
    }

    // /add_beat: beat text (targetChapter)
    const addBeatMatch = trimmed.match(/^\/add_beat:\s*(.+?)\((\d+)\)$/i);
    if (addBeatMatch) {
      const beatText = addBeatMatch[1].trim();
      const targetChapter = parseInt(addBeatMatch[2], 10);
      storyData.plot_beats.push({
        content: beatText,
        targetChapter: targetChapter,
        fulfilled: false,
      });
      addNotification(
        `📖 New story beat added for Chapter ${targetChapter}`,
        "success"
      );
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
      parts: data.scene.parts.slice(-MAX_PERSISTED_PARTS)
    }
  };
}

function StoryPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const storyId = searchParams.get("storyId");

  const { addNotification } = useNotification();
  const { user } = useAuth();
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
  const memory_cap = 5000; // Max memory size in characters
  // Load story from database on mount
  useEffect(() => {
    if (!storyId) {
      addNotification("No story ID provided", "failure");
      setLoadingStory(false);
      return;
    }

    async function loadStory() {
      try {
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

        // story.storyData is already parsed JSONB from database
        const loadedStoryData: StoryData = story.storyData;

        setStoryData(loadedStoryData);

        // Initialize story if no parts yet
        if (loadedStoryData.scene.parts.length === 0) {
          loadedStoryData.scene.parts.push({
            content: loadedStoryData.starting_content,
            imageUrl: "",
            user: false,
            role: "assistant",
            choices: [{ text: "Start Story" }],
          });
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
  }, [storyId, addNotification]);

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
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) return;

        // Trim scene history before saving to reduce data size
        const trimmedData = trimStoryData(updatedStoryData);

        await fetch(`/api/stories/${storyDbId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            storyData: trimmedData,
          }),
        });
      } catch (error) {
        console.error("Error saving progress:", error);
      }
    }, 3000); // 3 second debounce
  }

  // Update story data in state
  function updateStoryData(updates: Partial<StoryData>) {
    if (!storyData) return;
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
    while (
      totalMemoryLength > memory_cap &&
      storyData.memory.length > 0
    ) {
      const removed = storyData.memory.shift();
      if (removed) {
        totalMemoryLength -= removed.length;
      }
    }
    const updatedStory = { ...storyData, ...updates };
    setStoryData(updatedStory);
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

    let dice_roll = Math.floor(Math.random() * 100) + 1;
    let extra = "";
    let text = "> " + choices.choices[key].text;

    if (choice.item_used) {
      const item = storyData.inventory.find((i) => i.name === choice.item_used);
      const item_exists = item !== undefined;
      if (item_exists) {
        extra += `; item used (${choice.item_used})`;
        addNotification(`Used item: ${choice.item_used} (Advantage!)`, "info");
        const second_roll = Math.floor(Math.random() * 100) + 1;
        if (second_roll < dice_roll) {
          dice_roll = second_roll;
        }
        if (momentumMode === "reroll") {
          // Reroll: roll two more times and take the best
          const reroll1 = Math.floor(Math.random() * 100) + 1;
          const reroll2 = Math.floor(Math.random() * 100) + 1;
          dice_roll = Math.min(dice_roll, reroll1, reroll2);
          addNotification(
            `🎲 Reroll used! Best of 3 rolls: ${dice_roll}`,
            "success"
          );
        }
        if (choice.item_loss) {
          addNotification(`Lost item: ${choice.item_used}`, "warning");
          const itemIndex = storyData.inventory.findIndex(
            (i) => i.name === choice.item_used
          );
          if (itemIndex !== -1) {
            if (storyData.inventory[itemIndex].quantity > 1) {
              storyData.inventory[itemIndex].quantity--;
            } else {
              storyData.inventory.splice(itemIndex, 1);
            }
          }
        }
      } else {
        extra += `; item missing (${choice.item_used})`;
        addNotification(
          `Missing item: ${choice.item_used} (Disadvantage!)`,
          "warning"
        );
        const second_roll = Math.floor(Math.random() * 100) + 1;
        if (second_roll > dice_roll) {
          dice_roll = second_roll;
        }
        if (momentumMode === "reroll") {
          // Reroll still helps with disadvantage
          const reroll1 = Math.floor(Math.random() * 100) + 1;
          const reroll2 = Math.floor(Math.random() * 100) + 1;
          dice_roll = Math.min(dice_roll, reroll1, reroll2);
          addNotification(
            `🎲 Reroll used! Best of 3 rolls: ${dice_roll}`,
            "success"
          );
        }
      }
    } else if (momentumMode === "reroll") {
      // No item - just reroll
      const reroll = Math.floor(Math.random() * 100) + 1;
      if (reroll < dice_roll) {
        dice_roll = reroll;
      }
      addNotification(`🎲 Reroll used! Better roll: ${dice_roll}`, "success");
    }

    if (choice.resource_used) {
      const resource = storyData.resources.find(
        (r) => r.name === choice.resource_used
      );
      if (resource) {
        const usage = Math.max(1, Math.floor(resource.maxValue * 0.1));
        resource.value = Math.max(0, resource.value - usage);
        addNotification(
          `Used ${usage} ${choice.resource_used} (${resource.value}/${resource.maxValue} remaining)`,
          "info"
        );
      } else {
        addNotification(
          `Resource not found: ${choice.resource_used}`,
          "warning"
        );
      }
    }

    if (choice.risked_resource) {
      const resource = storyData.resources.find(
        (r) => r.name === choice.risked_resource
      );
      if (resource) {
        addNotification(
          `Risked ${choice.risked_resource} (${resource.value}/${resource.maxValue})`,
          "warning"
        );
      } else {
        addNotification(
          `Resource not found: ${choice.risked_resource}`,
          "warning"
        );
      }
    }

    if (choice.skill_used) {
      const statValue =
        storyData.stats.find((stat) => stat.name === choice.skill_used)
          ?.value || 0;
      const dc = choice.skill_dc || 0;

      // Handle guaranteed success
      if (momentumMode === "guarantee") {
        text += " <Guaranteed Success" + extra + ">";
        addNotification(
          `✓ Guaranteed Success! (${choice.skill_used}: Auto-success with 2 Momentum)`,
          "success"
        );
      } else {
        const total = dice_roll + statValue;
        const dc_passed = dice_roll === 100 || total >= dc;
        if (dc_passed) {
          text += " <Success" + extra + ">";
          addNotification(
            `✓ Check Passed! (${choice.skill_used}: ${dice_roll} + ${statValue} = ${total} ≥ ${dc})`,
            "success"
          );

          // Earn momentum on success (not when using guarantee)
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
        } else {
          text += " <Failure" + extra + ">";
          addNotification(
            `✗ Check Failed! (${choice.skill_used}: ${dice_roll} + ${statValue} = ${total} < ${dc})`,
            "failure"
          );

          if (choice.risked_resource) {
            const resource = storyData.resources.find(
              (r) => r.name === choice.risked_resource
            );
            if (resource) {
              const loss = Math.max(1, Math.floor(resource.maxValue * 0.2));
              resource.value = Math.max(0, resource.value - loss);
              addNotification(
                `Lost ${loss} ${choice.risked_resource} from failure! (${resource.value}/${resource.maxValue} remaining)`,
                "failure"
              );
            }
          }

          if (choice.item_loss && choice.item_used) {
            const itemIndex = storyData.inventory.findIndex(
              (i) => i.name === choice.item_used
            );
            if (itemIndex !== -1) {
              if (storyData.inventory[itemIndex].quantity > 1) {
                storyData.inventory[itemIndex].quantity--;
              } else {
                storyData.inventory.splice(itemIndex, 1);
              }
              addNotification(
                `Lost ${choice.item_used} from failure!`,
                "failure"
              );
            }
          }
        }
      }
    } else {
      text += " <No Skill Used" + extra + ">";
    }

    // Reset momentum mode after use
    setMomentumMode("none");

    for (const mem of storyData.scene.parts.flatMap(
      (p) => p.memoryEntries || []
    )) {
      storyData.memory.push(mem);
    }

    storyData.scene.parts.push({
      content: text,
      imageUrl: "",
      user: true,
      role: "user",
      choices: [...choices.choices],
      memoryEntries: storyData.memory,
    });

    setChoices({ choices: [] });

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      addNotification("Session expired. Please sign in again.", "failure");
      setLoading(false);
      return;
    }

    await fetch("/api/story/next", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        storyData: storyData,
        userChoice: choices.choices[key],
      }),
    })
      .then(async (res) => {
        const data = await res.json();

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

  return (
    <div className="min-h-screen bg-linear-to-br from-blue-50 via-purple-50 to-pink-50 dark:from-gray-900 dark:via-purple-900 dark:to-blue-900 font-sans py-8 px-4 sm:px-8">
      <main className="flex gap-6 w-full max-w-4xl mx-auto flex-col">
        {/* Story Header */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 sm:p-8 border border-gray-200 dark:border-gray-700">
          <h1 className="text-3xl sm:text-4xl font-bold bg-linear-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent text-center sm:text-left">
            {storyData.story_name}
          </h1>
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
          />
        )}
        {currentState === StoryState.STATS && <StatsPage {...storyData} />}
        {currentState === StoryState.LORE && <LorePage {...storyData} />}
        {currentState === StoryState.UPGRADES && (
          <UpgradesPage
            storyData={storyData}
            onPurchase={handlePurchase}
          />
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
