"use client";
import { useState } from "react";
import { Choice, Choices, StoryData } from "../misc/structs";
import { outputToScenePart, storyDataToString } from "../misc/ai";
import ReactMarkdown from "react-markdown";
import { useNotification } from "../misc/NotificationContext";
import { useAuth } from "../misc/AuthContext";
import { supabase } from "../misc/supabase";

function processCommands(commands: string[], storyData: StoryData, addNotification: (message: string, type: "success" | "failure" | "info" | "warning") => void) {
  for (const command of commands) {
    const trimmed = command.trim();
    
    // /modify_item: item name(amount)
    const itemMatch = trimmed.match(/^\/modify_item:\s*(.+?)\(([+-]?\d+)\)$/i);
    if (itemMatch) {
      const itemName = itemMatch[1].trim();
      const amount = parseInt(itemMatch[2], 10);
      
      const itemIndex = storyData.inventory.findIndex(i => i.name === itemName);
      if (itemIndex !== -1) {
        storyData.inventory[itemIndex].quantity += amount;
        if (storyData.inventory[itemIndex].quantity <= 0) {
          storyData.inventory.splice(itemIndex, 1);
          addNotification(`Removed ${itemName} from inventory`, "info");
        } else {
          addNotification(`${amount > 0 ? 'Added' : 'Removed'} ${Math.abs(amount)} ${itemName}`, "info");
        }
      } else if (amount > 0) {
        // Add new item if positive amount and doesn't exist
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
      
      const stat = storyData.stats.find(s => s.name === statName);
      if (stat) {
        const oldValue = stat.value;
        stat.value = Math.max(0, Math.min(100, stat.value + amount));
        addNotification(`${statName}: ${oldValue} → ${stat.value}`, amount > 0 ? "success" : "warning");
      }
      continue;
    }
    
    // /modify_resource: resource name(amount)
    const resourceMatch = trimmed.match(/^\/modify_resource:\s*(.+?)\(([+-]?\d+)\)$/i);
    if (resourceMatch) {
      const resourceName = resourceMatch[1].trim();
      const amount = parseInt(resourceMatch[2], 10);
      
      const resource = storyData.resources.find(r => r.name === resourceName);
      if (resource) {
        const oldValue = resource.value;
        resource.value = Math.max(0, Math.min(resource.maxValue, resource.value + amount));
        addNotification(`${resourceName}: ${oldValue} → ${resource.value}/${resource.maxValue}`, amount > 0 ? "success" : "warning");
      }
      continue;
    }
    
    // /add_achievement: achievement title
    const achievementMatch = trimmed.match(/^\/add_achievement:\s*(.+)$/i);
    if (achievementMatch) {
      const achievementTitle = achievementMatch[1].trim();
      
      const existing = storyData.achievements.find(a => a.title === achievementTitle);
      if (!existing) {
        storyData.achievements.push({
          title: achievementTitle,
          description: "",
          dateAchieved: new Date(),
          points: 10,
          symbol: "🏆",
        });
        addNotification(`🏆 Achievement Unlocked: ${achievementTitle}`, "success");
      }
      continue;
    }
    
    // /mark_beat: beat index
    const markBeatMatch = trimmed.match(/^\/mark_beat:\s*(\d+)$/i);
    if (markBeatMatch) {
      const beatIndex = parseInt(markBeatMatch[1], 10);
      if (beatIndex >= 0 && beatIndex < storyData.plot_beats.length) {
        storyData.plot_beats[beatIndex].fulfilled = true;
        addNotification(`📖 Story beat ${beatIndex + 1} completed`, "success");
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
      addNotification(`📖 New story beat added for Chapter ${targetChapter}`, "success");
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

export default function Story(storyData: StoryData) {
  const { addNotification } = useNotification();
  const { user } = useAuth();
  const [choices, setChoices]: [
    Choices,
    React.Dispatch<React.SetStateAction<Choices>>
  ] = useState<Choices>({ choices: [] });
  const [input, setInput] = useState<Record<string, boolean>>({});
  const [storyText, setStoryText] = useState(storyData.starting_content);
  const [loading, setLoading] = useState(false);
  let [started, setStarted] = useState(false);
  if (storyData.scene.parts.length === 0 && choices.choices.length === 0) {
    storyData.scene.parts.push({
      content: storyData.starting_content,
      imageUrl: "",
      user: false,
      role: "assistant",
      choices: [{ text: "Start Story" }],
    });
  }
  if (!started) {
    setStoryText(
      storyData.scene.parts[storyData.scene.parts.length - 1].content
    );
    setChoices({
      choices:
        storyData.scene.parts[storyData.scene.parts.length - 1].choices || [],
    });
    const inputs =
      storyData.scene.parts[storyData.scene.parts.length - 1].choices?.reduce(
        (acc, choice) => ({ ...acc, [choice.text]: false }),
        {} as Record<string, boolean>
      ) || {};
    setInput(inputs);
    setStarted(true);
  }

  async function handleChoice() {
    const choice = choices.choices.find((c) => input[c.text]);
    if (!choice) return;
    const key = choices.choices.indexOf(choice);

    // Check if user is authenticated
    if (!user) {
      addNotification("Please sign in to continue the story", "warning");
      return;
    }

    setLoading(true);

    // Roll dice against difficulty
    let dice_roll = Math.floor(Math.random() * 100) + 1;
    // extra info
    let extra = "";
    let text = "> " + choices.choices[key].text;

    // advantage if item used
    if (choice.item_used) {
      const item = storyData.inventory.find((i) => i.name === choice.item_used);
      const item_exists = item !== undefined;
      // roll with advantage
      if (item_exists) {
        extra += `; item used (${choice.item_used})`;
        addNotification(`Used item: ${choice.item_used} (Advantage!)`, "info");
        const second_roll = Math.floor(Math.random() * 100) + 1;
        if (second_roll < dice_roll) {
          dice_roll = second_roll;
        }
        // use item if loss
        if (choice.item_loss) {
          addNotification(`Lost item: ${choice.item_used}`, "warning");
          // Remove item from inventory
          const itemIndex = storyData.inventory.findIndex(i => i.name === choice.item_used);
          if (itemIndex !== -1) {
            if (storyData.inventory[itemIndex].quantity > 1) {
              storyData.inventory[itemIndex].quantity--;
            } else {
              storyData.inventory.splice(itemIndex, 1);
            }
          }
        }
      } else {
        // roll with disadvantage
        extra += `; item missing (${choice.item_used})`;
        addNotification(
          `Missing item: ${choice.item_used} (Disadvantage!)`,
          "warning"
        );
        const second_roll = Math.floor(Math.random() * 100) + 1;
        if (second_roll > dice_roll) {
          dice_roll = second_roll;
        }
      } 
    }

    // Check resource usage
    if (choice.resource_used) {
      const resource = storyData.resources.find(r => r.name === choice.resource_used);
      if (resource) {
        // Use 10% of max value (minimum 1)
        const usage = Math.max(1, Math.floor(resource.maxValue * 0.1));
        resource.value = Math.max(0, resource.value - usage);
        addNotification(`Used ${usage} ${choice.resource_used} (${resource.value}/${resource.maxValue} remaining)`, "info");
      } else {
        addNotification(`Resource not found: ${choice.resource_used}`, "warning");
      }
    }

    // Check risked resource (will be lost on failure)
    if (choice.risked_resource) {
      const resource = storyData.resources.find(r => r.name === choice.risked_resource);
      if (resource) {
        addNotification(`Risked ${choice.risked_resource} (${resource.value}/${resource.maxValue})`, "warning");
      } else {
        addNotification(`Resource not found: ${choice.risked_resource}`, "warning");
      }
    }

    // Do the skill check
    if (choice.skill_used) {
      // Now we add the stat
      // Check success or failure. DC is stat value + skill dc and it has to be equal or under the roll. 1 is automatic success.
      const dc =
        (storyData.stats.find((stat) => stat.name === choice.skill_used)
          ?.value || 0) + (choice.skill_dc || 0);
      const dc_passed = dice_roll === 1 || dice_roll <= dc;
      if (dc_passed) {
        text += " <Success" + extra + ">";
        addNotification(
          `✓ Check Passed! (${choice.skill_used}: ${dice_roll} ≤ ${dc})`,
          "success"
        );
      } else {
        text += " <Failure" + extra + ">";
        addNotification(
          `✗ Check Failed! (${choice.skill_used}: ${dice_roll} > ${dc})`,
          "failure"
        );
        
        // Lose risked resource on failure (20% of max value, minimum 1)
        if (choice.risked_resource) {
          const resource = storyData.resources.find(r => r.name === choice.risked_resource);
          if (resource) {
            const loss = Math.max(1, Math.floor(resource.maxValue * 0.2));
            resource.value = Math.max(0, resource.value - loss);
            addNotification(
              `Lost ${loss} ${choice.risked_resource} from failure! (${resource.value}/${resource.maxValue} remaining)`,
              "failure"
            );
          }
        }
        
        // Lose item on failure if item_loss is true
        if (choice.item_loss && choice.item_used) {
          const itemIndex = storyData.inventory.findIndex(i => i.name === choice.item_used);
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
    } else {
      text += " <No Skill Used" + extra + ">";
    }
    // Add memory to story if exists
    for (const mem of storyData.scene.parts.flatMap(p => p.memoryEntries || [])) {
      storyData.memory.push(mem);
    }
    console.log(text);
    storyData.scene.parts.push({
      content: text,
      imageUrl: "",
      user: true,
      role: "user",
      choices: [...choices.choices],
      memoryEntries: storyData.memory,
    });

    setChoices({
      choices: [],
    });

    // Get the user's session token
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      addNotification("Session expired. Please sign in again.", "failure");
      setLoading(false);
      return;
    }

    await fetch("/api/story/next", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        storyData: storyData,
        userChoice: choices.choices[key],
      }),
    })
      .then(async (res) => {
        const data = await res.json();
        
        // Handle insufficient tokens
        if (res.status === 402) {
          addNotification(
            `❌ ${data.error}`,
            "failure"
          );
          if (data.balance) {
            addNotification(
              `Your balance: ${data.balance.tradable} tradable, ${data.balance.locked} locked`,
              "info"
            );
          }
          setLoading(false);
          setChoices({ choices: storyData.scene.parts[storyData.scene.parts.length - 1].choices || [] });
          return;
        }

        // Handle authentication errors
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
          setChoices({ choices: storyData.scene.parts[storyData.scene.parts.length - 1].choices || [] });
          return;
        }
        
        console.log(data);
        
        // Show token deduction notification
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
        
        // Process commands from the AI response
        if (data.part.commands && data.part.commands.length > 0) {
          processCommands(data.part.commands, storyData, addNotification);
        }
        
        // Add new memory entries
        if (data.part.memoryEntries && data.part.memoryEntries.length > 0) {
          storyData.memory.push(...data.part.memoryEntries);
        }
        
        storyData.scene.parts.push(data.part);
        setStoryText(data.part.content);
        setChoices({ choices: data.part.choices || [] });
        setLoading(false);
      })
      .catch((error) => {
        console.error("Error fetching next story part:", error);
        addNotification("Network error. Please try again.", "failure");
        setLoading(false);
        setChoices({ choices: storyData.scene.parts[storyData.scene.parts.length - 1].choices || [] });
      });
  }
  function handleSelect(index: number): void {
    const key = choices.choices[index]?.text;
    if (!key) return;
    let newInput = input;
    // Toggle selection unless already selected
    if (!newInput[key]) {
      newInput[key] = true;
    }
    // untoggle all others
    Object.keys(newInput).forEach((k) => {
      if (k !== key) {
        newInput[k] = false;
      }
    });

    setInput({ ...newInput });
  }

  return (
    <div className="w-full">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 sm:p-8 border border-gray-200 dark:border-gray-700">
        <div className="flex flex-col gap-6">
          {prettify(storyText)}

          {loading ? (
            <div className="flex flex-col items-center justify-center w-full py-8 border-t border-gray-200 dark:border-gray-700">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 dark:border-purple-400"></div>
              <p className="mt-4 text-gray-600 dark:text-gray-400 text-sm font-medium">Weaving your tale...</p>
            </div>
          ) : (
            <div className="w-full space-y-3">
              <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <p className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
                  Choose your path
                </p>
              </div>
              {choices &&
                choices.choices.map((choice, index) => (
                  <div
                    key={index}
                    className={`flex flex-row items-start cursor-pointer rounded-lg transition-all p-4 border-2 ${
                      input[choice.text]
                        ? "border-purple-500 bg-purple-100 dark:bg-purple-900/40 shadow-md"
                        : "border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/30 hover:border-purple-300 dark:hover:border-purple-600 hover:shadow-md"
                    }`}
                    onClick={() => handleSelect(index)}
                  >
                    <input
                      type="checkbox"
                      checked={input[choice.text] || false}
                      className="mt-1 cursor-pointer shrink-0 w-4 h-4 text-purple-600 focus:ring-purple-500"
                      readOnly
                    />
                    <div className="flex-1 pl-3 text-sm sm:text-base text-gray-900 dark:text-gray-100">
                      {convert_choice_to_text(choice, storyData)}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
        <div className="flex justify-center w-full pt-6 border-t border-gray-200 dark:border-gray-700 mt-6">
          <button
            onClick={handleChoice}
            className="cursor-pointer px-8 py-4 text-lg font-semibold bg-linear-to-r from-purple-600 to-pink-600 text-white hover:from-purple-700 hover:to-pink-700 rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-lg"
            disabled={!Object.values(input).some((v) => v) || loading}
          >
            {loading ? "Generating..." : "✨ Continue Story"}
          </button>
        </div>
      </div>
    </div>
  );
}

const prettify = (text: string) => {
  return (
    <div className="prose prose-sm sm:prose prose-zinc dark:prose-invert max-w-none">
      <ReactMarkdown
        components={{
          p: ({ node, ...props }) => <p className="mb-3 sm:mb-4" {...props} />,
          h1: ({ node, ...props }) => (
            <h1
              className="text-xl sm:text-2xl font-bold mb-3 sm:mb-4 mt-4 sm:mt-6"
              {...props}
            />
          ),
          h2: ({ node, ...props }) => (
            <h2
              className="text-lg sm:text-xl font-bold mb-2 sm:mb-3 mt-3 sm:mt-5"
              {...props}
            />
          ),
          h3: ({ node, ...props }) => (
            <h3
              className="text-base sm:text-lg font-bold mb-2 mt-3 sm:mt-4"
              {...props}
            />
          ),
          strong: ({ node, ...props }) => (
            <strong
              className="font-bold text-black dark:text-white"
              {...props}
            />
          ),
          em: ({ node, ...props }) => <em className="italic" {...props} />,
          ul: ({ node, ...props }) => (
            <ul className="list-disc ml-4 sm:ml-6 mb-3 sm:mb-4" {...props} />
          ),
          ol: ({ node, ...props }) => (
            <ol className="list-decimal ml-4 sm:ml-6 mb-3 sm:mb-4" {...props} />
          ),
          li: ({ node, ...props }) => <li className="mb-1" {...props} />,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
};
const choice_button_factory = (
  choice: Choice,
  index: number,
  onClick: () => void
) => {};
const convert_choice_to_text = (choice: Choice, storyData: StoryData) => {
  let extra = "";
  if (choice.skill_used) {
    const skill = storyData.stats.find(
      (stat) => stat.name === choice.skill_used
    );
    extra += ` ${skill?.symbol}`;
  }

  return `${choice.text}` + extra;
};
