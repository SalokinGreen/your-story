import { ScenePart, StoryData, Choice } from "@/app/misc/structs";

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
!!! END CHAPTER !!! (Optional to end the current chapter)

Choice Syntax:
- ...Prose <use_skill: skill name (DC Number) or none; use_resource: resource name or none; risk_resource: resource name or none; use_item: item name or none; item_loss: true or false>
Example:
- You carefully sneak past the sleeping dragon. <use_skill: Stealth (DC 50); use_item: Stamina Potion; item_loss: true>

Guidelines:
- Always provide at least three choices.
- Choices should be distinct and lead to different outcomes.
- Incorporate the player's stats, resources, inventory, and achievements into the story and choices.
- Adapt the story based on the player's previous choices and current state.
- DC 1 is extremely easy, shouldn't be a DC at all, DC 100 is hard, and DC 200 is almost impossible.`
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
      // Use String.raw so backslashes are preserved for the RegExp constructor
      const re = new RegExp(String.raw`<${tag}[^>]*>([\s\S]*?)<\/${tag}>`, "i");
      const m = src.match(re);
      if (m?.[1]) return m[1];
      // Fallback: naive search, case-insensitive
      const lower = src.toLowerCase();
      const openTag = `<${tag.toLowerCase()}`;
      const closeTag = `</${tag.toLowerCase()}>`;
      const openIdx = lower.indexOf(openTag);
      if (openIdx === -1) return null;
      const gtIdx = lower.indexOf('>', openIdx);
      if (gtIdx === -1) return null;
      const closeIdx = lower.indexOf(closeTag, gtIdx + 1);
      if (closeIdx === -1) return null;
      return src.substring(gtIdx + 1, closeIdx);
    };

    const parseChoice = (line: string): Choice => {
      // Extract metadata from angle brackets: <use_skill: ...; use_item: ...; etc>
      const metaMatch = line.match(/<([^>]+)>/);
      const text = line.replace(/\s*<[^>]*>\s*$/, "").trim();
      
      const choice: Choice = { text };
      
      if (metaMatch) {
        const metadata = metaMatch[1];
        
        // Parse use_skill: name (DC number)
        const skillMatch = metadata.match(/use_skill:\s*([^(;]+?)(?:\s*\(DC\s*(\d+)\))?(?:;|$)/i);
        if (skillMatch) {
          const skillName = skillMatch[1].trim();
          if (skillName.toLowerCase() !== 'none') {
            choice.skill_used = skillName;
            if (skillMatch[2]) {
              choice.skill_dc = parseInt(skillMatch[2], 10);
            }
          }
        }
        
        // Parse use_resource: name
        const resourceMatch = metadata.match(/use_resource:\s*([^;]+?)(?:;|$)/i);
        if (resourceMatch) {
          const resourceName = resourceMatch[1].trim();
          if (resourceName.toLowerCase() !== 'none') {
            choice.resource_used = resourceName;
          }
        }
        
        // Parse risk_resource: name
        const riskMatch = metadata.match(/risk_resource:\s*([^;]+?)(?:;|$)/i);
        if (riskMatch) {
          const riskName = riskMatch[1].trim();
          if (riskName.toLowerCase() !== 'none') {
            choice.risked_resource = riskName;
          }
        }
        
        // Parse use_item: name
        const itemMatch = metadata.match(/use_item:\s*([^;]+?)(?:;|$)/i);
        if (itemMatch) {
          const itemName = itemMatch[1].trim();
          if (itemName.toLowerCase() !== 'none') {
            choice.item_used = itemName;
          }
        }
        
        // Parse item_loss: true/false
        const lossMatch = metadata.match(/item_loss:\s*(true|false)/i);
        if (lossMatch) {
          choice.item_loss = lossMatch[1].toLowerCase() === 'true';
        }
      }
      
      return choice;
    };

    const blockToChoiceList = (block: string | null): Choice[] => {
      if (!block) return [];
      return block
        .split(/\r?\n/)
        .map((l) => l.trim())
        // strip common bullet prefixes: -, *, •
        .map((l) => l.replace(/^[\-\*\u2022]\s+/, ""))
        .filter((l) => l.length > 0)
        .map(parseChoice);
    };

    const blockToList = (block: string | null): string[] => {
      if (!block) return [];
      return block
        .split(/\r?\n/)
        .map((l) => l.trim())
        // strip common bullet prefixes: -, *, •
        .map((l) => l.replace(/^[\-\*\u2022]\s+/, ""))
        .filter((l) => l.length > 0);
    };

    const story = extractBlock("story", text);
    const memoryBlock = extractBlock("memory", text);
    const choicesBlock = extractBlock("choices", text);

    const content = (story ?? text).trim();
    const memoryEntries = blockToList(memoryBlock);
    const choices = blockToChoiceList(choicesBlock);
    
    // Check for end chapter marker
    const endChapter = /!!!\s*END\s+CHAPTER\s*!!!/i.test(text);

    const part: ScenePart = {
      content: content,
      imageUrl: "",
      user: false,
      role: "assistant",
      ...(memoryEntries.length ? { memoryEntries } : {}),
      ...(choices.length ? { choices } : {}),
      ...(endChapter ? { endChapter: true } : {})
    };

    return part;
}

// Back-compat alias used by the API route
export const coerceToScenePart = outputToScenePart;
