/**
 * Small pieces of the picture feature that need no queue: the shrink fallback,
 * the plain-prompt mode of the DeepInfra/OpenRouter wrapper (no "game cover
 * style" suffix on in-play pictures), the Illustrate button's NPC matching, and
 * the fallback description when the side call fails.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const fetchMock = vi.fn();
vi.mock("@/app/misc/platformFetch", () => ({ getProviderFetch: () => fetchMock }));

import { shrinkGeneratedImage } from "@/app/misc/imageShrink";
import { generateImage } from "@/app/misc/generateImageCall";
import { findMentionedNpcIds } from "@/app/misc/noteMentions";
import { fallbackDescription } from "@/app/misc/imagePromptWriter";
import type { StoryData } from "@/app/misc/structs";

beforeEach(() => fetchMock.mockReset());

describe("shrinkGeneratedImage", () => {
  it("keeps the original bytes and the given size where the engine cannot compress", async () => {
    // Node has no createImageBitmap / OffscreenCanvas: the fallback path.
    const blob = new Blob([new Uint8Array(10)], { type: "image/png" });
    const out = await shrinkGeneratedImage(blob, { width: 1024, height: 768 });
    expect(out.blob).toBe(blob);
    expect(out).toMatchObject({ mime: "image/png", width: 1024, height: 768 });
  });
});

describe("generateImage plainPrompt (in-play pictures)", () => {
  it("DeepInfra: sends the prompt as given, at the requested size", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ data: [{ b64_json: "AAAA" }] }), { status: 200 }),
    );
    const result = await generateImage({
      prompt: "A harbour.\n\nStyle: ink wash.",
      model: "P-Image",
      imageType: "banner",
      provider: "deepinfra",
      deepInfraKey: "k",
      plainPrompt: true,
      size: { width: 1024, height: 768 },
    });
    expect("imageUrl" in result).toBe(true);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.prompt).toBe("A harbour.\n\nStyle: ink wash.");
    expect(body.prompt).not.toContain("game cover style");
    expect(body.size).toBe("1024x768");
  });

  it("the lore-cover buttons still get the cover-art suffix", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ data: [{ b64_json: "AAAA" }] }), { status: 200 }),
    );
    await generateImage({
      prompt: "A harbour",
      model: "P-Image",
      imageType: "thumbnail",
      provider: "deepinfra",
      deepInfraKey: "k",
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.prompt).toContain("game cover style");
    expect(body.size).toBe("1024x1024");
  });

  it("OpenRouter: no cover wrapper in plain mode", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { images: [{ type: "image_url", image_url: { url: "data:image/png;base64,AA" } }] } }],
        }),
        { status: 200 },
      ),
    );
    await generateImage({
      prompt: "A harbour",
      model: "Nano Banana",
      imageType: "banner",
      provider: "openrouter",
      openRouterKey: "k",
      plainPrompt: true,
      size: { width: 1024, height: 768 },
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const content = body.messages[0].content as string;
    expect(content).toContain("A harbour");
    expect(content).not.toContain("text adventure");
    expect(content).not.toContain("game cover style");
  });
});

describe("findMentionedNpcIds", () => {
  const sd = {
    lore: [],
    npcs: [
      { id: "n1", name: "Kessa Vane", aliases: ["the smuggler"] },
      { id: "n2", name: "Brannock" },
      { id: "n3", name: "Unseen" },
    ],
  } as unknown as StoryData;

  it("returns NPCs named by name or alias, once each, in order of first mention", () => {
    const text = "Brannock waved. The smuggler grinned; Kessa Vane lit a pipe, and Brannock sighed.";
    expect(findMentionedNpcIds(sd, text)).toEqual(["n2", "n1"]);
  });

  it("is empty when nobody is named", () => {
    expect(findMentionedNpcIds(sd, "The wind rose over the water.")).toEqual([]);
  });
});

describe("fallbackDescription", () => {
  it("keeps short text whole and cuts long text at a sentence", () => {
    expect(fallbackDescription("A short line.")).toBe("A short line.");
    const long = "The first sentence is a fairly long one. " + "word ".repeat(100);
    const out = fallbackDescription(long, 60);
    expect(out.length).toBeLessThanOrEqual(60);
    expect(out.endsWith("one.")).toBe(true);
  });
});
