/**
 * The adventure's character sheet template reaches the GM during session zero
 * (legacy removal slice 1, design §3.3), in the live block only.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import {
  buildGMStagePrompt,
  buildSheetTemplateBlock,
} from "@/app/misc/ai_staged";
import type { StoryData, StoryLore } from "@/app/misc/structs";
import { BLOOD_AND_BONE } from "@/app/misc/systems/blood-and-bone";
import {
  getLocalStory,
  startAdventureLocally,
} from "@/app/misc/localStoryManager";

const TEMPLATE = "# {{Name | Your name | Nobody}}\n\n**Grit:** {{Grit | 1-3 | 2}}";

function story(overrides: Partial<StoryData> = {}): StoryData {
  return {
    story_name: "Test Story",
    premise: "Test premise",
    player_name: "Test Player",
    player_summary: "Test summary",
    intro: "Test intro",
    scene: { parts: [] },
    lore: [],
    memory: [],
    npcs: [],
    threads: [],
    sessionZeroActive: true,
    characterSheetTemplate: { template: TEMPLATE, fields: [] },
    ...overrides,
  } as StoryData;
}

const sheetNote = {
  title: "Character: Mira",
  content: "Mira. Grit 2.",
  relatedCharacters: [],
  relatedLocations: [],
  secrtet: false,
  keys: [],
  type: "character_sheet",
} as StoryLore;

function messagesFor(s: StoryData) {
  return buildGMStagePrompt({ storyData: s, userChoice: "I look around." })
    .messages;
}

describe("buildSheetTemplateBlock", () => {
  it("carries the template and the instruction in session zero", () => {
    const block = buildSheetTemplateBlock(story());
    expect(block).toContain("CHARACTER SHEET TEMPLATE");
    expect(block).toContain(TEMPLATE);
    expect(block).toContain("create_note");
    expect(block).toContain("character_sheet");
    expect(block).toContain("Character: <name>");
  });

  it("is empty once setup is over or with no template", () => {
    expect(buildSheetTemplateBlock(story({ sessionZeroActive: false }))).toBe("");
    expect(buildSheetTemplateBlock(story({ sessionZeroActive: undefined }))).toBe("");
    expect(
      buildSheetTemplateBlock(story({ characterSheetTemplate: undefined })),
    ).toBe("");
    expect(
      buildSheetTemplateBlock(
        story({ characterSheetTemplate: { template: "", fields: [] } }),
      ),
    ).toBe("");
  });
});

describe("in the GM request", () => {
  it("is carried by the session-zero block, the one setup section", () => {
    const text = messagesFor(story())
      .map((m) => String(m.content))
      .join("\n");
    expect(text).toContain("SESSION ZERO - SETTING UP THE STORY");
    expect(text).not.toContain("FRESH STORY");
    expect(text.match(/## CHARACTER SHEET TEMPLATE/g)).toHaveLength(1);
  });

  it("sits in the live block, not the system prompt or the stable block", () => {
    const messages = messagesFor(story());
    const holders = messages.filter((m) =>
      String(m.content).includes("## CHARACTER SHEET TEMPLATE"),
    );
    expect(holders).toHaveLength(1);
    expect(holders[0].role).toBe("user");
    expect(String(holders[0].content)).toContain("LIVE GAME STATE");
    expect(String(holders[0].content)).toContain(TEMPLATE);
    expect(messages[0].content).not.toContain(TEMPLATE);
    expect(String(messages[1].content)).not.toContain(TEMPLATE);
  });

  it("stays after the first character_sheet note exists", () => {
    const text = messagesFor(story({ lore: [sheetNote] }))
      .map((m) => String(m.content))
      .join("\n");
    expect(text).toContain("## CHARACTER SHEET TEMPLATE");
  });

  it("is gone after start_game and with no template", () => {
    for (const s of [
      story({ sessionZeroActive: false }),
      story({ characterSheetTemplate: undefined }),
    ]) {
      const text = messagesFor(s)
        .map((m) => String(m.content))
        .join("\n");
      expect(text).not.toContain("## CHARACTER SHEET TEMPLATE");
    }
  });

  it("changes the FRESH STORY line to point at the template (outside session zero)", () => {
    const text = messagesFor(story({ sessionZeroActive: false }))
      .map((m) => String(m.content))
      .join("\n");
    expect(text).toContain("FRESH STORY");
    expect(text).toContain("from the CHARACTER SHEET TEMPLATE below");
    expect(text).not.toContain("starting stats/resources/abilities");
  });
});

describe("a Hollow Hour story", () => {
  beforeEach(() => {
    vi.stubGlobal("indexedDB", new IDBFactory());
    const map = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
      setItem: (k: string, v: string) => void map.set(k, String(v)),
      removeItem: (k: string) => void map.delete(k),
      clear: () => map.clear(),
    });
  });

  it("gets the template on its first GM prompt", async () => {
    const id = await startAdventureLocally(
      BLOOD_AND_BONE.starters[0].adventure,
      "Mira",
    );
    const s = (await getLocalStory(id))!.storyData as StoryData;
    const text = messagesFor(s)
      .map((m) => String(m.content))
      .join("\n");
    expect(text).toContain("## CHARACTER SHEET TEMPLATE");
    expect(text).toContain("Nerve");
  });
});
