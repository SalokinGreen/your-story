import { ScenePart, StoryData } from "@/app/misc/structs";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export interface BuildPromptInput {
  storyData: StoryData;
  userChoice?: string;
}

export function buildMessages({ storyData }: BuildPromptInput): ChatMessage[] {
  const system = `You are a helpful, creative narrative engine for a choice-driven, text-only adventure game.
Stay in character and respond in the style of an interactive fiction game. You're the narrator and the characters.

Output Format:
<story>
Story prose here.
</story>

<memory>
- New Memory Entry 1
- New Memory Entry 2
</memory>

<choices>
- Choice 1
- Choice 2
</choices>

Choice Syntax:
- Prose <use_skill: skill name (DC Number) or none; use_resource: resource name or none; risk_resource: resource name or none; use_item: item name or none; item_loss: true or false>
Example:
- You carefully sneak past the sleeping dragon. <use_skill: Stealth (DC 15); use_item: Stamina Potion; item_loss: true>

Guidelines:
- Always provide at least three choices.
- Choices should be distinct and lead to different outcomes.
- Incorporate the player's stats, resources, inventory, and achievements into the story and choices.
- Adapt the story based on the player's previous choices and current state.`
  const recentScene = storyData.scene.parts.at(-1)?.content ?? storyData.starting_content;

  

  const info = storyDataToString(storyData)
  let context: ChatMessage[] = [
    { role: "system", content: system },
    { role: "user", content: info }
  ];
  if (storyData.scene.parts.length === 1) {
    context.push({ role: "assistant", content: storyData.starting_content });
    context.push({ role: "user", content: recentScene });
  }
    else {
        storyData.scene.parts.forEach(part => {
            const role = part.user ? "user" : "assistant";
            context.push({ role: role, content: part.content });
        });
    }
  return context
}
export function storyDataToString(storyData: StoryData): string {
  let result = `# Story Name: ${storyData.story_name}\n`;
  result += `${storyData.premise}\n`;

  result += `## Player: ${storyData.player_name}\n`;
  result += `${storyData.player_summary}\n\n`;
  result += storyData.stats.map(stat => `- ${stat.name}: ${stat.value}% (${stat.description})`).join("\n") + "\n\n";
  result += storyData.resources.map(resource => `- ${resource.name}: ${resource.value}/${resource.maxValue} (${resource.description})`).join("\n") + "\n\n";
  result += `## Story Beats:\n`;
  storyData.plot_beats.forEach((beat, index) => {
    result += `${index + 1}. ${beat.content} (Around Chapter ${beat.targetChapter})\n`;
  });
  result += `\n## Current Chapter:\n`;
  const currentChapter = storyData.chapters[storyData.currentChapter];
    if (currentChapter) {
    result += `### Chapter ${storyData.currentChapter}: ${currentChapter.title}\n`;
    result += `${currentChapter.summary}\n\n`;
  }
  result += `## Memory:\n`;
  storyData.memory.forEach((mem, index) => {
    result += `- ${mem}\n`;
  });
  return result;

}
export function outputToScenePart(text: string): ScenePart {
    // Helper: extract inner text of a simple XML-like block
    const extractBlock = (tag: string, src: string): string | null => {
      const re = new RegExp(`<${tag}[^>]*>([\s\S]*?)<\/${tag}>`, "i");
      const m = src.match(re);
      return m?.[1] ?? null;
    };

    const blockToList = (block: string | null): string[] => {
      if (!block) return [];
      return block
        .split(/\r?\n/)
        .map((l) => l.trim())
        // strip common bullet prefixes: -, *, •
        .map((l) => l.replace(/^[\-\*\u2022]\s+/, ""))
        // drop trailing inline metadata like <use_skill: ...>
        .map((l) => l.replace(/\s*<[^>]*>\s*$/g, "").trim())
        .filter((l) => l.length > 0);
    };

    const story = extractBlock("story", text);
    const memoryBlock = extractBlock("memory", text);
    const choicesBlock = extractBlock("choices", text);

    const content = (story ?? text).trim();
    const memoryEntries = blockToList(memoryBlock);
    const choices = blockToList(choicesBlock);

    const part: ScenePart = {
      content,
      imageUrl: "",
      user: false,
      role: "assistant",
      ...(choices.length ? { choices } : {}),
      ...(memoryEntries.length ? { memoryEntries } : {}),
    };

    return part;
}

// Back-compat alias used by the API route
export const coerceToScenePart = outputToScenePart;
