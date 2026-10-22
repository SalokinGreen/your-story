/**
 * The picture store (docs/image-generation-design.md §5, decision 59): bytes in
 * their own IndexedDB database, ids in StoryData. Covers save/get, deleting a
 * story's pictures, the orphan sweep that runs on story load, the space
 * figure, and collectImageIds walking all four places a picture can hang.
 */
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import {
  blobToDataUri,
  clearImageIds,
  collectImageIds,
  missingImageIds,
  dataUriToBlob,
  deleteImage,
  deleteImagesForStory,
  deleteOrphans,
  getImage,
  saveImage,
  storyImageBytes,
  type StoredImage,
} from "@/app/misc/imageStore";
import type { StoryData } from "@/app/misc/structs";

function image(id: string, storyId: string, bytes = 100): StoredImage {
  return {
    id,
    storyId,
    blob: new Blob([new Uint8Array(bytes)], { type: "image/webp" }),
    mime: "image/webp",
    width: 1024,
    height: 768,
    subject: "scene",
    prompt: "a harbour at dawn",
    provider: "fal",
    model: "FLUX.1 schnell",
    costUsd: 0.0024,
    createdAt: 1,
  };
}

beforeEach(async () => {
  await deleteImagesForStory("story-a");
  await deleteImagesForStory("story-b");
});

describe("imageStore", () => {
  it("saves a picture and reads it back with its bytes and metadata", async () => {
    await saveImage(image("img-1", "story-a", 250));
    const got = await getImage("img-1");
    expect(got?.storyId).toBe("story-a");
    expect(got?.prompt).toBe("a harbour at dawn");
    expect(got?.blob.size).toBe(250);
    expect(await getImage("nope")).toBeNull();
  });

  it("deletes one story's pictures and leaves the others", async () => {
    await saveImage(image("a1", "story-a"));
    await saveImage(image("a2", "story-a"));
    await saveImage(image("b1", "story-b"));
    await deleteImagesForStory("story-a");
    expect(await getImage("a1")).toBeNull();
    expect(await getImage("a2")).toBeNull();
    expect(await getImage("b1")).not.toBeNull();
  });

  it("deletes one picture by id", async () => {
    await saveImage(image("a1", "story-a"));
    await deleteImage("a1");
    expect(await getImage("a1")).toBeNull();
  });

  it("sweeps only the pictures nothing points to, and counts them", async () => {
    await saveImage(image("kept", "story-a"));
    await saveImage(image("orphan-1", "story-a"));
    await saveImage(image("orphan-2", "story-a"));
    await saveImage(image("other-story", "story-b"));
    const removed = await deleteOrphans("story-a", new Set(["kept"]));
    expect(removed).toBe(2);
    expect(await getImage("kept")).not.toBeNull();
    expect(await getImage("orphan-1")).toBeNull();
    // A sweep never reaches into another story.
    expect(await getImage("other-story")).not.toBeNull();
  });

  it("adds up the space a story's pictures take", async () => {
    await saveImage(image("a1", "story-a", 300));
    await saveImage(image("a2", "story-a", 200));
    await saveImage(image("b1", "story-b", 999));
    expect(await storyImageBytes("story-a")).toBe(500);
    expect(await storyImageBytes("nothing")).toBe(0);
  });
});

describe("collectImageIds", () => {
  it("walks scene parts, NPC portraits, notes and the player portrait", () => {
    const sd = {
      scene: {
        parts: [
          { content: "x", user: false, images: [{ imageId: "scene-1", requestedBy: "gm" }] },
          { content: "y", user: true },
          {
            content: "z",
            user: false,
            images: [
              { imageId: "scene-2", requestedBy: "player" },
              { imageId: "scene-3", requestedBy: "gm" },
            ],
          },
        ],
      },
      npcs: [{ id: "n1", portraitImageId: "npc-1" }, { id: "n2" }],
      lore: [{ title: "Harbour", imageId: "lore-1" }, { title: "Other" }],
      playerPortraitImageId: "player-1",
    } as unknown as StoryData;
    expect(collectImageIds(sd)).toEqual(
      new Set(["scene-1", "scene-2", "scene-3", "npc-1", "lore-1", "player-1"]),
    );
  });

  it("is empty for a story with no pictures, and tolerates missing arrays", () => {
    expect(collectImageIds({ scene: { parts: [] } } as unknown as StoryData).size).toBe(0);
    expect(collectImageIds({} as unknown as StoryData).size).toBe(0);
  });
});

describe("missingImageIds and clearImageIds (engine review 7)", () => {
  it("reports the ids with no stored file for the story", async () => {
    await saveImage(image("here", "story-a"));
    await saveImage(image("elsewhere", "story-b"));
    expect(await missingImageIds("story-a", ["here", "gone", "elsewhere"])).toEqual(
      new Set(["gone", "elsewhere"]),
    );
    expect(await missingImageIds("story-a", [])).toEqual(new Set());
  });

  it("drops every picture id from scene parts, NPCs, notes and the player", () => {
    const sd = {
      scene: {
        parts: [
          { content: "x", user: false, images: [{ imageId: "s1", requestedBy: "gm" }] },
          { content: "y", user: true },
        ],
      },
      npcs: [{ id: "n1", name: "K", portraitImageId: "p1" }, { id: "n2", name: "B" }],
      lore: [{ title: "Harbour", imageId: "l1", thumbnailUrl: "data:keep" }],
      playerPortraitImageId: "me",
    } as unknown as StoryData;
    const cleared = { ...sd, ...clearImageIds(sd) } as StoryData;
    expect(collectImageIds(cleared).size).toBe(0);
    // Everything else on them is untouched.
    expect(cleared.scene.parts[0].content).toBe("x");
    expect(cleared.lore[0].thumbnailUrl).toBe("data:keep");
    expect(cleared.npcs[0].name).toBe("K");
  });
});

describe("data: URI helpers", () => {
  it("round-trips bytes through a base64 data URI", async () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 255]);
    const uri = await blobToDataUri(new Blob([bytes], { type: "image/png" }));
    expect(uri.startsWith("data:image/png;base64,")).toBe(true);
    const back = dataUriToBlob(uri);
    expect(back.type).toBe("image/png");
    expect(new Uint8Array(await back.arrayBuffer())).toEqual(bytes);
  });
});
