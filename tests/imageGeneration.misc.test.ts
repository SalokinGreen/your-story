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
import { imageUrlToDataUri } from "@/app/misc/imageFetch";
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

describe("imageUrlToDataUri (a provider that answers with a link)", () => {
  it("passes a data: image through and fetches an https link once", async () => {
    const same = await imageUrlToDataUri("data:image/png;base64,AAAA");
    expect(same).toEqual({ ok: true, dataUri: "data:image/png;base64,AAAA" });

    fetchMock.mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "content-type": "image/webp" },
      }),
    );
    const fetched = await imageUrlToDataUri("https://cdn.example/p.webp");
    expect(fetched).toEqual({ ok: true, dataUri: "data:image/webp;base64,AQID" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refuses an error page, an empty body, a non-https link and a failed fetch", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("<html>", { status: 200, headers: { "content-type": "text/html" } }),
    );
    expect((await imageUrlToDataUri("https://x.example/a")).ok).toBe(false);
    fetchMock.mockResolvedValueOnce(new Response("nope", { status: 403 }));
    expect((await imageUrlToDataUri("https://x.example/b")).ok).toBe(false);
    expect((await imageUrlToDataUri("http://x.example/c")).ok).toBe(false);
    fetchMock.mockRejectedValueOnce(new Error("blocked by scope"));
    const failed = await imageUrlToDataUri("https://x.example/d");
    expect(failed).toMatchObject({ ok: false });
    if (!failed.ok) expect(failed.message).toContain("blocked by scope");
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
