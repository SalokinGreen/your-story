import { describe, it, expect } from "vitest";
import { getActiveObjectives } from "../app/misc/objectives";
import { StoryData } from "../app/misc/structs";

function baseStoryData(overrides: Partial<StoryData> = {}): StoryData {
  return {
    story_name: "Test",
    goals: [],
    threads: [],
    ...overrides,
  } as StoryData;
}

describe("getActiveObjectives", () => {
  it("returns an empty array when there are no goals or threads", () => {
    expect(getActiveObjectives(baseStoryData())).toEqual([]);
  });

  it("includes only active, unfulfilled goals", () => {
    const storyData = baseStoryData({
      goals: [
        { id: "q1", title: "Find the sword", active: true, fulfilled: false } as any,
        { id: "q2", title: "Completed one", active: true, fulfilled: true } as any,
        { id: "q3", title: "Inactive one", active: false, fulfilled: false } as any,
      ],
    });

    const objectives = getActiveObjectives(storyData);
    expect(objectives).toHaveLength(1);
    expect(objectives[0]).toMatchObject({
      title: "Find the sword",
      kind: "goal",
    });
  });

  it("includes only active threads", () => {
    const storyData = baseStoryData({
      threads: [
        {
          id: "t1",
          title: "The Missing Artifact",
          description: "...",
          status: "active",
          priority: "main",
          createdAt: 0,
        },
        {
          id: "t2",
          title: "Resolved thread",
          description: "...",
          status: "resolved",
          createdAt: 0,
        },
      ],
    });

    const objectives = getActiveObjectives(storyData);
    expect(objectives).toHaveLength(1);
    expect(objectives[0]).toMatchObject({
      title: "The Missing Artifact",
      kind: "thread",
      detail: "main",
    });
  });

  it("combines active goals and threads together", () => {
    const storyData = baseStoryData({
      goals: [{ id: "q1", title: "Goal A", active: true, fulfilled: false } as any],
      threads: [
        {
          id: "t1",
          title: "Thread A",
          description: "...",
          status: "active",
          createdAt: 0,
        },
      ],
    });

    const objectives = getActiveObjectives(storyData);
    expect(objectives.map((o) => o.kind)).toEqual(["goal", "thread"]);
  });
});
