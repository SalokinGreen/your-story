/**
 * Shared logic behind /api/creator/generate-image - see providerCall.ts for
 * why this is split out (same code runs server-side for the Vercel web
 * build and client-side for the standalone Tauri/Capacitor build, via
 * creatorFetch.ts).
 *
 * Generates adventure cover images (thumbnails/banners) via OpenRouter or
 * DeepInfra image models (BYOK only).
 */

import {
  OPENROUTER_IMAGE_MODELS,
  DEEPINFRA_IMAGE_MODELS,
  type ImageModelKey,
  type DeepInfraImageModelKey,
} from "@/app/misc/ai_prices";
import { getProviderFetch } from "@/app/misc/platformFetch";

type OpenRouterImageModelConfig = (typeof OPENROUTER_IMAGE_MODELS)[ImageModelKey];
type DeepInfraImageModelConfig = (typeof DEEPINFRA_IMAGE_MODELS)[DeepInfraImageModelKey];

export interface GenerateImageRequestBody {
  prompt: string;
  model?: string;
  imageType: "thumbnail" | "banner";
  provider?: "openrouter" | "deepinfra";
  openRouterKey?: string;
  deepInfraKey?: string;
}

export interface GenerateImageSuccess {
  imageUrl: string;
  meta: {
    model: string;
    imageType: "thumbnail" | "banner";
    provider: "openrouter" | "deepinfra";
    isByok: true;
    cost?: number;
  };
}

export interface GenerateImageError {
  error: string;
  status: number;
}

function getOpenRouterModelConfig(modelKey: string): OpenRouterImageModelConfig {
  if (modelKey in OPENROUTER_IMAGE_MODELS) {
    return OPENROUTER_IMAGE_MODELS[modelKey as ImageModelKey];
  }
  return OPENROUTER_IMAGE_MODELS["Nano Banana"];
}

function getDeepInfraModelConfig(modelKey: string): DeepInfraImageModelConfig | null {
  if (modelKey in DEEPINFRA_IMAGE_MODELS) {
    return DEEPINFRA_IMAGE_MODELS[modelKey as DeepInfraImageModelKey];
  }
  return null;
}

// Extract image URL from OpenRouter response (various formats)
function extractImageFromOpenRouterResponse(data: any): string | null {
  const message = data.choices?.[0]?.message;
  const content = message?.content;

  if (Array.isArray(message?.images)) {
    for (const img of message.images) {
      if (img.type === "image_url" && img.image_url?.url) return img.image_url.url;
      if (img.url) return img.url;
    }
  }

  if (Array.isArray(content)) {
    for (const part of content) {
      if (part.type === "image_url" && part.image_url?.url) return part.image_url.url;
      if (part.type === "image" && part.url) return part.url;
    }
  }

  if (typeof content === "string" && content.trim()) {
    const markdownMatch = content.match(/!\[.*?\]\((.*?)\)/);
    if (markdownMatch) return markdownMatch[1];

    if (content.trim().startsWith("http")) return content.trim().split(/\s/)[0];

    if (content.includes("data:image")) {
      const base64Match = content.match(/(data:image\/[^;]+;base64,[A-Za-z0-9+/=]+)/);
      if (base64Match) return base64Match[1];
    }

    const urlMatch = content.match(/(https?:\/\/[^\s"'<>\]]+)/i);
    if (urlMatch) return urlMatch[1];
  }

  if (message?.image_url) return message.image_url;

  return null;
}

async function handleOpenRouter(
  prompt: string,
  requestedModel: string | undefined,
  imageType: "thumbnail" | "banner",
  openRouterKey: string | undefined,
): Promise<GenerateImageSuccess | GenerateImageError> {
  if (!openRouterKey) {
    return {
      error: "OpenRouter API key required. Please add your API key in Settings.",
      status: 400,
    };
  }

  const modelKey = requestedModel || "Nano Banana";
  const modelConfig = getOpenRouterModelConfig(modelKey);

  try {
    const sizeDescription =
      imageType === "thumbnail"
        ? "square or 4:3 aspect ratio cover image suitable for a thumbnail"
        : "wide landscape banner image with approximately 3:1 aspect ratio";

    const fullPrompt = `Please create a ${sizeDescription} for my text adventure:\n\n${prompt}\n\nStyle: Digital art, game cover style, vibrant colors, professional quality.`;

    const providerFetch = getProviderFetch();
    const response = await providerFetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openRouterKey}`,
        "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL || "https://your-story.app",
        "X-Title": "Your Story - Adventure Cover Generator",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelConfig.model,
        messages: [{ role: "user", content: fullPrompt }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Image Gen] OpenRouter Error:", response.status, errorText);
      throw new Error(`Image generation failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const imageUrl = extractImageFromOpenRouterResponse(data);

    if (!imageUrl) {
      console.error(
        "[Image Gen] Could not extract image URL from OpenRouter response:",
        JSON.stringify(data).substring(0, 1000),
      );
      throw new Error(
        "Could not extract image from AI response. The model may not support image generation.",
      );
    }

    return {
      imageUrl,
      meta: { model: modelKey, imageType, provider: "openrouter", isByok: true, cost: 0 },
    };
  } catch (error) {
    console.error("[Image Gen] OpenRouter Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Image generation failed";
    return { error: errorMessage, status: 500 };
  }
}

async function handleDeepInfra(
  prompt: string,
  requestedModel: string | undefined,
  imageType: "thumbnail" | "banner",
  deepInfraKey: string | undefined,
): Promise<GenerateImageSuccess | GenerateImageError> {
  const modelKey = requestedModel || "Bria 3.2";
  const modelConfig = getDeepInfraModelConfig(modelKey);

  if (!modelConfig) {
    return { error: `Invalid DeepInfra model: ${modelKey}`, status: 400 };
  }

  if (!deepInfraKey) {
    return {
      error: "DeepInfra API key required. Please add your API key in Settings.",
      status: 400,
    };
  }

  try {
    // Note: FLUX 2 Pro has a max width of 1440px
    const sizeDescription = imageType === "thumbnail" ? "1024x1024" : "1440x1024";

    const providerFetch = getProviderFetch();
    const response = await providerFetch(
      "https://api.deepinfra.com/v1/openai/images/generations",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${deepInfraKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: `${prompt}\n\nStyle: Digital art, game cover style, vibrant colors, professional quality.`,
          model: modelConfig.model,
          size: sizeDescription,
          n: 1,
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Image Gen] DeepInfra Error:", response.status, errorText);
      throw new Error(`Image generation failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    let imageUrl: string | null = null;
    if (data.data && Array.isArray(data.data) && data.data.length > 0) {
      const imageData = data.data[0];
      if (imageData.b64_json) {
        imageUrl = `data:image/webp;base64,${imageData.b64_json}`;
      } else if (imageData.url) {
        imageUrl = imageData.url;
      }
    }

    if (!imageUrl) {
      console.error(
        "[Image Gen] Could not extract image from DeepInfra response:",
        JSON.stringify(data).substring(0, 1000),
      );
      throw new Error("Could not extract image from DeepInfra response.");
    }

    return {
      imageUrl,
      meta: { model: modelKey, imageType, provider: "deepinfra", isByok: true },
    };
  } catch (error) {
    console.error("[Image Gen] DeepInfra Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Image generation failed";
    return { error: errorMessage, status: 500 };
  }
}

export async function generateImage(
  body: GenerateImageRequestBody,
): Promise<GenerateImageSuccess | GenerateImageError> {
  const { prompt, model: requestedModel, imageType, provider = "deepinfra", openRouterKey, deepInfraKey } = body;

  if (!prompt?.trim()) {
    return { error: "Prompt is required", status: 400 };
  }

  if (!imageType || !["thumbnail", "banner"].includes(imageType)) {
    return { error: "Invalid image type. Must be 'thumbnail' or 'banner'", status: 400 };
  }

  if (provider === "openrouter") {
    return handleOpenRouter(prompt, requestedModel, imageType, openRouterKey);
  }
  return handleDeepInfra(prompt, requestedModel, imageType, deepInfraKey);
}
