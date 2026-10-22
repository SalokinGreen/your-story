// Settings for pictures made in play (docs/image-generation-design.md §6,
// decisions 54-57 and 61). One JSON object in localStorage under
// "imageSettings", synced through syncableSettingsKeys.ts. The fal key is not
// here: keys live in APIKeysContext and never sync (decision 58).

import { FAL_IMAGE_MODELS, resolveImageModelKey } from "./ai_prices";

export const IMAGE_SETTINGS_KEY = "imageSettings";

/** The art-style line every picture of a story ends with, unless the story sets its own. */
export const DEFAULT_IMAGE_STYLE =
  "painterly digital illustration, cinematic lighting";

export const DEFAULT_GM_IMAGES_PER_SCENE = 2;
export const MAX_GM_IMAGES_PER_SCENE = 5;

export type ImageProviderChoice = "auto" | "fal" | "deepinfra" | "openrouter";

export interface ImageSettings {
  /** The GM may call generate_image (decision 56's switch). */
  gmImagesEnabled: boolean;
  /** Cap on GM pictures per scene; the player's own button is not counted. */
  gmImagesPerScene: number;
  provider: ImageProviderChoice;
  /** fal catalog keys, per job (decision 61: schnell / FLUX.2 pro / FLUX.2 pro edit). */
  sceneModel: string;
  portraitModel: string;
  referenceModel: string;
  /** What DeepInfra and OpenRouter paint with; neither takes reference pictures. */
  deepinfraModel: string;
  openrouterModel: string;
  defaultStyle: string;
}

export const DEFAULT_IMAGE_SETTINGS: ImageSettings = {
  gmImagesEnabled: true,
  gmImagesPerScene: DEFAULT_GM_IMAGES_PER_SCENE,
  provider: "auto",
  sceneModel: "FLUX.1 schnell",
  portraitModel: "FLUX.2 [pro]",
  referenceModel: "FLUX.2 [pro] edit",
  deepinfraModel: "P-Image",
  openrouterModel: "Nano Banana",
  defaultStyle: DEFAULT_IMAGE_STYLE,
};

const PROVIDER_CHOICES: ImageProviderChoice[] = [
  "auto",
  "fal",
  "deepinfra",
  "openrouter",
];

function clampCap(n: unknown): number {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.round(n) : NaN;
  if (Number.isNaN(v)) return DEFAULT_GM_IMAGES_PER_SCENE;
  return Math.min(MAX_GM_IMAGES_PER_SCENE, Math.max(0, v));
}

function readRaw(): Partial<ImageSettings> {
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return {};
  }
  try {
    const raw = localStorage.getItem(IMAGE_SETTINGS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? (parsed as Partial<ImageSettings>) : {};
  } catch {
    return {};
  }
}

/** The stored settings with every field checked: a dropped model key reads as the default. */
export function getImageSettings(): ImageSettings {
  const raw = readRaw();
  const d = DEFAULT_IMAGE_SETTINGS;
  const style =
    typeof raw.defaultStyle === "string" && raw.defaultStyle.trim()
      ? raw.defaultStyle.trim()
      : d.defaultStyle;
  const fal = (key: unknown, fallback: string) =>
    typeof key === "string" &&
    Object.prototype.hasOwnProperty.call(FAL_IMAGE_MODELS, key)
      ? key
      : fallback;
  return {
    gmImagesEnabled:
      typeof raw.gmImagesEnabled === "boolean" ? raw.gmImagesEnabled : d.gmImagesEnabled,
    gmImagesPerScene: raw.gmImagesPerScene === undefined ? d.gmImagesPerScene : clampCap(raw.gmImagesPerScene),
    provider: PROVIDER_CHOICES.includes(raw.provider as ImageProviderChoice)
      ? (raw.provider as ImageProviderChoice)
      : d.provider,
    sceneModel: fal(raw.sceneModel, d.sceneModel),
    portraitModel: fal(raw.portraitModel, d.portraitModel),
    referenceModel: fal(raw.referenceModel, d.referenceModel),
    deepinfraModel: resolveImageModelKey(
      "deepinfra",
      typeof raw.deepinfraModel === "string" ? raw.deepinfraModel : d.deepinfraModel,
    ),
    openrouterModel: resolveImageModelKey(
      "openrouter",
      typeof raw.openrouterModel === "string" ? raw.openrouterModel : d.openrouterModel,
    ),
    defaultStyle: style,
  };
}

export function setImageSettings(patch: Partial<ImageSettings>): void {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return;
  const next = { ...getImageSettings(), ...patch };
  next.gmImagesPerScene = clampCap(next.gmImagesPerScene);
  localStorage.setItem(IMAGE_SETTINGS_KEY, JSON.stringify(next));
}

export interface ImageKeys {
  falKey?: string;
  deepInfraKey?: string;
  openRouterKey?: string;
}

/** True when some image provider could run: a key for any of the three. */
export function hasAnyImageKey(keys: ImageKeys): boolean {
  return !!(keys.falKey || keys.deepInfraKey || keys.openRouterKey);
}

/**
 * Whether the GM is offered generate_image: pictures on, a nonzero cap and a
 * key for a provider that could paint them. The prompt lists the tool only
 * then, so the model is never told about a tool that cannot run.
 */
export function isImageToolAvailable(
  keys: ImageKeys,
  settings: ImageSettings = getImageSettings(),
): boolean {
  if (!settings.gmImagesEnabled || settings.gmImagesPerScene <= 0) return false;
  // A pinned provider needs its own key; "auto" takes any.
  switch (settings.provider) {
    case "fal":
      return !!keys.falKey;
    case "deepinfra":
      return !!keys.deepInfraKey;
    case "openrouter":
      return !!keys.openRouterKey;
    default:
      return hasAnyImageKey(keys);
  }
}
