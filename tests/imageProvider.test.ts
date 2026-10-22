/**
 * Which provider and model paint a picture (decisions 57 and 61), the image
 * settings (clamping, stale model keys) and when the GM is offered the tool.
 * The queue and the executor have their own files.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { pickImageModel, pickImageProvider, imageSizeFor } from "@/app/misc/imageProvider";
import {
  DEFAULT_IMAGE_SETTINGS,
  IMAGE_SETTINGS_KEY,
  getImageSettings,
  isImageToolAvailable,
  setImageSettings,
} from "@/app/misc/imageSettings";
import { FAL_IMAGE_MODELS, resolveImageModelKey } from "@/app/misc/ai_prices";

describe("pickImageProvider", () => {
  const all = { falKey: "f", deepInfraKey: "d", openRouterKey: "o" };

  it("auto: fal first, then DeepInfra, then OpenRouter", () => {
    expect(pickImageProvider({ provider: "auto" }, all)).toBe("fal");
    expect(pickImageProvider({ provider: "auto" }, { deepInfraKey: "d", openRouterKey: "o" })).toBe("deepinfra");
    expect(pickImageProvider({ provider: "auto" }, { openRouterKey: "o" })).toBe("openrouter");
    expect(pickImageProvider({ provider: "auto" }, {})).toBeNull();
  });

  it("a pinned provider needs its own key, and never falls to another", () => {
    expect(pickImageProvider({ provider: "openrouter" }, all)).toBe("openrouter");
    expect(pickImageProvider({ provider: "fal" }, { deepInfraKey: "d" })).toBeNull();
  });
});

describe("pickImageModel (decisions 61 and 111)", () => {
  const s = DEFAULT_IMAGE_SETTINGS;

  it("fal: FLUX.2 pro for scenes, places and portraits (decision 111)", () => {
    expect(pickImageModel({ subject: "scene", portraitedCharacters: 0 }, "fal", s).model).toBe("fal-ai/flux-2-pro");
    expect(pickImageModel({ subject: "location", portraitedCharacters: 0 }, "fal", s).model).toBe("fal-ai/flux-2-pro");
    expect(pickImageModel({ subject: "npc", portraitedCharacters: 0 }, "fal", s).model).toBe("fal-ai/flux-2-pro");
    expect(pickImageModel({ subject: "player", portraitedCharacters: 0 }, "fal", s).model).toBe("fal-ai/flux-2-pro");
  });

  it("fal: a scene with a known face uses the edit model, which takes references", () => {
    const picked = pickImageModel({ subject: "scene", portraitedCharacters: 1 }, "fal", s);
    expect(picked.model).toBe("fal-ai/flux-2-pro/edit");
    expect(picked.supportsReferences).toBe(true);
  });

  it("references only ever come from a model that supports them", () => {
    for (const subject of ["scene", "npc", "player", "location"] as const) {
      for (const n of [0, 2]) {
        const picked = pickImageModel({ subject, portraitedCharacters: n }, "fal", s);
        expect(picked.supportsReferences).toBe(
          FAL_IMAGE_MODELS[picked.modelKey as keyof typeof FAL_IMAGE_MODELS].supportsReferences,
        );
      }
    }
    // A reference slot pinned to a model that cannot take them falls back to the scene model.
    const pinned = { ...s, referenceModel: "FLUX.2 [pro]" };
    expect(pickImageModel({ subject: "scene", portraitedCharacters: 1 }, "fal", pinned).supportsReferences).toBe(false);
  });

  it("DeepInfra and OpenRouter use their one chosen model and no references", () => {
    const di = pickImageModel({ subject: "scene", portraitedCharacters: 3 }, "deepinfra", s);
    expect(di).toMatchObject({ modelKey: "P-Image", supportsReferences: false });
    const or = pickImageModel({ subject: "npc", portraitedCharacters: 0 }, "openrouter", s);
    expect(or).toMatchObject({ modelKey: "Nano Banana", supportsReferences: false });
  });

  it("prices come from the catalog", () => {
    expect(pickImageModel({ subject: "scene", portraitedCharacters: 0 }, "fal", s).pricePerImage).toBe(
      FAL_IMAGE_MODELS["FLUX.2 [pro]"].pricePerImage,
    );
  });

  it("portraits are upright and scenes landscape", () => {
    expect(imageSizeFor("npc")).toEqual({ width: 768, height: 1024 });
    expect(imageSizeFor("scene")).toEqual({ width: 1024, height: 768 });
  });
});

describe("imageSettings", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
  });

  it("defaults: GM pictures on, 2 per scene, automatic provider", () => {
    expect(getImageSettings()).toEqual(DEFAULT_IMAGE_SETTINGS);
    expect(DEFAULT_IMAGE_SETTINGS.gmImagesPerScene).toBe(2);
  });

  it("clamps the per-scene cap to 0..5", () => {
    setImageSettings({ gmImagesPerScene: 99 });
    expect(getImageSettings().gmImagesPerScene).toBe(5);
    setImageSettings({ gmImagesPerScene: -3 });
    expect(getImageSettings().gmImagesPerScene).toBe(0);
  });

  it("a stored model key the catalog dropped reads as the default", () => {
    localStorage.setItem(
      IMAGE_SETTINGS_KEY,
      JSON.stringify({
        sceneModel: "FLUX 9000",
        portraitModel: "constructor",
        deepinfraModel: "Gone Model",
        openrouterModel: "Flux 2 Pro",
        provider: "carrier-pigeon",
      }),
    );
    const s = getImageSettings();
    expect(s.sceneModel).toBe("FLUX.2 [pro]");
    expect(s.portraitModel).toBe("FLUX.2 [pro]");
    expect(s.deepinfraModel).toBe(resolveImageModelKey("deepinfra", "Gone Model"));
    expect(s.openrouterModel).toBe("Nano Banana");
    expect(s.provider).toBe("auto");
  });

  it("survives corrupt JSON", () => {
    localStorage.setItem(IMAGE_SETTINGS_KEY, "{not json");
    expect(getImageSettings()).toEqual(DEFAULT_IMAGE_SETTINGS);
  });

  // Decision 111: the Images tab saves the whole object, so a save from before
  // the change holds schnell whether or not the player chose it.
  it("reads an old save's schnell scene model as the new default", () => {
    localStorage.setItem(IMAGE_SETTINGS_KEY, JSON.stringify({ sceneModel: "FLUX.1 schnell" }));
    expect(getImageSettings().sceneModel).toBe("FLUX.2 [pro]");
  });

  it("keeps schnell when it was picked after the change", () => {
    setImageSettings({ sceneModel: "FLUX.1 schnell" });
    expect(JSON.parse(localStorage.getItem(IMAGE_SETTINGS_KEY)!).settingsVersion).toBe(2);
    expect(getImageSettings().sceneModel).toBe("FLUX.1 schnell");
  });

  it("an old save's other choices survive the migration's first save", () => {
    localStorage.setItem(
      IMAGE_SETTINGS_KEY,
      JSON.stringify({ sceneModel: "FLUX.1 schnell", gmImagesPerScene: 4 }),
    );
    setImageSettings({ defaultStyle: "ink and watercolour" });
    const s = getImageSettings();
    expect(s).toMatchObject({ sceneModel: "FLUX.2 [pro]", gmImagesPerScene: 4, defaultStyle: "ink and watercolour" });
  });
});

describe("isImageToolAvailable", () => {
  const on = { ...DEFAULT_IMAGE_SETTINGS };

  it("needs pictures on, a nonzero cap and a key", () => {
    expect(isImageToolAvailable({ falKey: "f" }, on)).toBe(true);
    expect(isImageToolAvailable({}, on)).toBe(false);
    expect(isImageToolAvailable({ falKey: "f" }, { ...on, gmImagesEnabled: false })).toBe(false);
    expect(isImageToolAvailable({ falKey: "f" }, { ...on, gmImagesPerScene: 0 })).toBe(false);
  });

  it("a pinned provider needs its own key", () => {
    expect(isImageToolAvailable({ falKey: "f" }, { ...on, provider: "openrouter" })).toBe(false);
    expect(isImageToolAvailable({ openRouterKey: "o" }, { ...on, provider: "openrouter" })).toBe(true);
  });
});
