// Which provider and which model make a picture (decisions 57 and 61,
// design §3.4 and §4.3). Pure functions, so the choice is tested without a
// network: the queue (imageJobs.ts) asks, then calls.

import {
  DEEPINFRA_IMAGE_MODELS,
  FAL_IMAGE_MODELS,
  OPENROUTER_IMAGE_MODELS,
} from "./ai_prices";
import type { ImageSettings, ImageKeys } from "./imageSettings";
import type { ImageSubject } from "./structs";

export type ImageProvider = "fal" | "deepinfra" | "openrouter";

/** The provider that paints, or null when no key could. `auto` is fal, then DeepInfra, then OpenRouter. */
export function pickImageProvider(
  settings: Pick<ImageSettings, "provider">,
  keys: ImageKeys,
): ImageProvider | null {
  const has: Record<ImageProvider, boolean> = {
    fal: !!keys.falKey,
    deepinfra: !!keys.deepInfraKey,
    openrouter: !!keys.openRouterKey,
  };
  if (settings.provider !== "auto") {
    return has[settings.provider] ? settings.provider : null;
  }
  if (has.fal) return "fal";
  if (has.deepinfra) return "deepinfra";
  if (has.openrouter) return "openrouter";
  return null;
}

export interface ImageSize {
  width: number;
  height: number;
}

/** Scenes and places are landscape; portraits are upright. About 0.8 megapixel either way. */
export function imageSizeFor(subject: ImageSubject): ImageSize {
  return subject === "npc" || subject === "player"
    ? { width: 768, height: 1024 }
    : { width: 1024, height: 768 };
}

export interface PickedImageModel {
  /** The catalog key (what StoredImage.model keeps and the settings store). */
  modelKey: string;
  /** The provider's own model id. */
  model: string;
  pricePerImage: number;
  /** The model takes reference pictures (fal's edit model only). */
  supportsReferences: boolean;
}

export interface ImageJobShape {
  subject: ImageSubject;
  /** How many of the people in the picture already have a portrait. */
  portraitedCharacters: number;
}

/**
 * Decision 61's table. On fal: a portrait uses the portrait model; a scene
 * with a known face uses the reference (edit) model; any other scene or place
 * uses the scene model. DeepInfra and OpenRouter use their one chosen model
 * and take no reference pictures, so faces drift there (the Settings screen
 * says so).
 */
export function pickImageModel(
  job: ImageJobShape,
  provider: ImageProvider,
  settings: ImageSettings,
): PickedImageModel {
  if (provider === "fal") {
    const isPortrait = job.subject === "npc" || job.subject === "player";
    const wantsRefs = !isPortrait && job.portraitedCharacters > 0;
    let key = isPortrait
      ? settings.portraitModel
      : wantsRefs
        ? settings.referenceModel
        : settings.sceneModel;
    let cfg = FAL_IMAGE_MODELS[key as keyof typeof FAL_IMAGE_MODELS];
    // The reference slot holds a model that cannot take references: use the scene model instead.
    if (wantsRefs && !cfg?.supportsReferences) {
      key = settings.sceneModel;
      cfg = FAL_IMAGE_MODELS[key as keyof typeof FAL_IMAGE_MODELS];
    }
    return {
      modelKey: key,
      model: cfg.model,
      pricePerImage: cfg.pricePerImage,
      supportsReferences: cfg.supportsReferences,
    };
  }
  if (provider === "deepinfra") {
    const key = settings.deepinfraModel as keyof typeof DEEPINFRA_IMAGE_MODELS;
    const cfg = DEEPINFRA_IMAGE_MODELS[key];
    return {
      modelKey: key,
      model: cfg.model,
      pricePerImage: cfg.pricePerImage,
      supportsReferences: false,
    };
  }
  const key = settings.openrouterModel as keyof typeof OPENROUTER_IMAGE_MODELS;
  const cfg = OPENROUTER_IMAGE_MODELS[key];
  return {
    modelKey: key,
    model: cfg.model,
    pricePerImage: cfg.pricePerImage,
    supportsReferences: false,
  };
}
