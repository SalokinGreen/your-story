import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  buildGMStagePrompt,
  buildLiveBlock,
  estimateTokens,
  formatMetersAndTracksState,
} from "@/app/misc/ai_staged";
import { createMeter, createTrack } from "@/app/misc/metersAndTracks";
import type { StoryData } from "@/app/misc/structs";
import { SYSTEM_TOOL_NAMES } from "@/app/misc/systems/resolve";
import { warmTokenizer } from "./helpers/turnHarness";
import { mockStory } from "./helpers/systemsHarness";

vi.setConfig({ testTimeout: 60_000 });
beforeAll(async () => {
  await warmTokenizer();
});

function story(): StoryData {
  const stress = {
    ...createMeter({ name: "Stress", min: 0, max: 6, start: 3 }, "Mira"),
    cap: 5,
  };
  const beast = createMeter(
    {
      name: "Beast",
      min: 0,
      max: 10,
      start: 1,
      thresholds: [{ at: 3, label: "Stirring" }],
    },
    "Mira",
  );
  const exposure = createMeter(
    {
      name: "Exposure",
      min: 0,
      max: 6,
      start: 3,
      thresholds: [{ at: 3, label: "Rumour" }],
    },
    "Mira",
  );
  const heat = createMeter(
    { name: "Heat", min: 0, max: 6, start: 3, hidden: true },
    "world",
  );
  return mockStory({
    meters: [stress, beast, exposure, heat],
    progressTracks: [
      { ...createTrack("Mira", "Find who is taking the bodies", "vow", "dangerous"), ticks: 12 },
      { ...createTrack("Mira", "Old vow", "vow", "epic"), status: "fulfilled" },
    ],
  });
}

describe("formatMetersAndTracksState", () => {
  it("is empty with nothing to show", () => {
    expect(formatMetersAndTracksState(mockStory())).toBe("");
  });

  it("writes one line per owner and one per active track", () => {
    const text = formatMetersAndTracksState(story());
    expect(text).toContain("## 📊 METERS & TRACKS");
    expect(text).toContain("Mira - Stress 3/6 (cap 5) · Beast 1/10 · Exposure 3/6 (Rumour)");
    expect(text).toContain("world - Heat 3/6 (hidden)");
    expect(text).toContain("Vow: Find who is taking the bodies (Mira) - dangerous, 3 boxes");
    expect(text).not.toContain("Old vow");
  });

  it("names the session once one has ended", () => {
    const s = story();
    s.systemState = { sessionCount: 1, dedupKeys: [] };
    expect(formatMetersAndTracksState(s)).toContain("Session 2");
  });
});

describe("the live block and the tool list", () => {
  it("puts the meters and challenge sections in the live block, not the stable one", () => {
    const s = story();
    s.activeChallenge = {
      id: "c",
      name: "Skirmish",
      rounds: 3,
      currentSuccesses: 0,
      currentFailures: 0,
      active: true,
      createdAt: 0,
      mode: "tally",
      tally: 0,
      recorded: 0,
    };
    const prompt = buildGMStagePrompt({ storyData: s, userChoice: "I go" });
    const live = prompt.messages.filter((m) => typeof m.content === "string" && m.content.includes("LIVE GAME STATE"));
    expect(live.length).toBe(1);
    expect(live[0].content).toContain("METERS & TRACKS");
    expect(live[0].content).toContain("ACTIVE CHALLENGE");
    const others = prompt.messages.filter((m) => m !== live[0]);
    for (const m of others) {
      expect(typeof m.content === "string" ? m.content : "").not.toContain("METERS & TRACKS");
    }
  });

  it("a meter tick changes only the live block", () => {
    const a = story();
    const b = story();
    b.meters![0] = { ...b.meters![0], value: 4 };
    const pa = buildGMStagePrompt({ storyData: a, userChoice: "I go" }).messages;
    const pb = buildGMStagePrompt({ storyData: b, userChoice: "I go" }).messages;
    const differing = pa.map((m, i) => (m.content === pb[i].content ? -1 : i)).filter((i) => i >= 0);
    expect(differing).toHaveLength(1);
    expect(String(pa[differing[0]].content)).toContain("LIVE GAME STATE");
  });

  it("buildLiveBlock tolerates the new sections being absent", () => {
    const out = buildLiveBlock({
      loreSection: "",
      npcList: "",
      goalsSection: "",
      threadsSection: "",
      oracleSection: "",
      combatSection: "",
      timersSection: "",
      pendingEventsSection: "",
      pendingMovesSection: "",
      freshStorySetupBlock: "",
      sessionZeroStartGameReminder: "",
      setupOverdueBlock: "",
      observerNoteBlock: "",
      storyProgressNoteBlock: "",
      repetitionNoteBlock: "",
      knowledgeNoteBlock: "",
      pacingFeedbackLine: "",
      gmAdviceSection: "",
    });
    expect(out).not.toContain("METERS");
  });

  const names = (s: StoryData) =>
    (buildGMStagePrompt({ storyData: s, userChoice: "I go" }).tools as { function: { name: string } }[]).map(
      (t) => t.function.name,
    );

  it("offers the four system tools only when the story uses a system", () => {
    for (const n of SYSTEM_TOOL_NAMES) expect(names(mockStory())).not.toContain(n);
    const on = names(mockStory({ systemState: { usesSystemTools: true, sessionCount: 0, dedupKeys: [] } }));
    for (const n of SYSTEM_TOOL_NAMES) expect(on).toContain(n);
    const off = names(mockStory({ systemState: { usesSystemTools: false, sessionCount: 0, dedupKeys: [] } }));
    for (const n of SYSTEM_TOOL_NAMES) expect(off).not.toContain(n);
  });

  it("shows the sections even when the tools are not offered", () => {
    const s = story();
    expect(names(s)).not.toContain("manage_meter");
    const prompt = buildGMStagePrompt({ storyData: s, userChoice: "I go" });
    expect(JSON.stringify(prompt.messages)).toContain("METERS & TRACKS");
  });

  it("estimateTokens stays importable here (guards the shared import)", () => {
    expect(estimateTokens("abc")).toBeGreaterThan(0);
  });
});
