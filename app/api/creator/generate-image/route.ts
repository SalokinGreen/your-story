/**
 * AI Image Generation API
 *
 * Generates adventure cover images (thumbnails/banners) using OpenRouter image models.
 * Returns the generated image URL.
 *
 * Supports two types of models:
 * 1. Chat-based image models (Gemini, GPT-5 Image) - use chat completions API
 * 2. Pure image models (Flux) - use flat per-image pricing
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  OPENROUTER_IMAGE_MODELS,
  type ImageModelKey,
} from "@/app/misc/ai_prices";

export const runtime = "nodejs";
export const maxDuration = 120; // Allow up to 2 minutes for image generation

// Image model config type
type ImageModelConfig = (typeof OPENROUTER_IMAGE_MODELS)[ImageModelKey];

interface RequestBody {
  prompt: string;
  model?: string;
  imageType: "thumbnail" | "banner";
  openRouterKey?: string;
}

// Get model config
function getImageModelConfig(modelKey: string): ImageModelConfig {
  if (modelKey in OPENROUTER_IMAGE_MODELS) {
    return OPENROUTER_IMAGE_MODELS[modelKey as ImageModelKey];
  }
  // Default to Nano Banana
  return OPENROUTER_IMAGE_MODELS["Nano Banana"];
}

export async function POST(req: NextRequest) {
  const supabaseUrl = process.env.SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_KEY!;

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Auth check
  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));

  if (authError || !user) {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { prompt, model: requestedModel, imageType, openRouterKey } = body;

  if (!prompt?.trim()) {
    return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
  }

  if (!imageType || !["thumbnail", "banner"].includes(imageType)) {
    return NextResponse.json(
      { error: "Invalid image type. Must be 'thumbnail' or 'banner'" },
      { status: 400 }
    );
  }

  // Validate OpenRouter key (BYOK required)
  if (!openRouterKey) {
    return NextResponse.json(
      {
        error:
          "OpenRouter API key required. Please add your API key in Settings.",
      },
      { status: 400 }
    );
  }

  // Get model config
  const modelKey = requestedModel || "Nano Banana";
  const modelConfig = getImageModelConfig(modelKey);

  console.log(
    "[Image Gen] Model:",
    modelKey,
    "(",
    modelConfig.model,
    ")",
    "Type:",
    imageType
  );

  try {
    // Build the image generation prompt with size hints based on type
    const sizeDescription =
      imageType === "thumbnail"
        ? "square or 4:3 aspect ratio cover image suitable for a thumbnail"
        : "wide landscape banner image with approximately 3:1 aspect ratio";

    let imageUrl: string | null = null;

    // All OpenRouter models use chat/completions endpoint
    const fullPrompt = `Please create a ${sizeDescription} for my text adventure:\n\n${prompt}\n\nStyle: Digital art, game cover style, vibrant colors, professional quality.`;

    console.log(
      "[Image Gen] Using chat completions API for",
      modelConfig.model
    );

    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openRouterKey}`,
          "HTTP-Referer":
            process.env.NEXT_PUBLIC_SITE_URL || "https://your-story.app",
          "X-Title": "Your Story - Adventure Cover Generator",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: modelConfig.model,
          messages: [
            {
              role: "user",
              content: fullPrompt,
            },
          ],
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Image Gen] API Error:", response.status, errorText);
      throw new Error(
        `Image generation failed: ${response.status} - ${errorText}`
      );
    }

    const data = await response.json();
    console.log("[Image Gen] Response structure:", Object.keys(data));

    // Extract image from response - different models return images differently
    const message = data.choices?.[0]?.message;
    const content = message?.content;

    // Log response for debugging
    console.log(
      "[Image Gen] Message keys:",
      message ? Object.keys(message) : "no message"
    );

    // Check for images array on message (Gemini format)
    // Format: message.images = [{ type: "image_url", image_url: { url: "data:image/png;base64,..." } }]
    if (!imageUrl && Array.isArray(message?.images)) {
      for (const img of message.images) {
        if (img.type === "image_url" && img.image_url?.url) {
          imageUrl = img.image_url.url;
          break;
        }
        if (img.url) {
          imageUrl = img.url;
          break;
        }
      }
    }

    // Check for image in multimodal content array format
    if (!imageUrl && Array.isArray(content)) {
      // Multimodal response: [{ type: "image_url", image_url: { url: "..." } }, ...]
      for (const part of content) {
        if (part.type === "image_url" && part.image_url?.url) {
          imageUrl = part.image_url.url;
          break;
        }
        if (part.type === "image" && part.url) {
          imageUrl = part.url;
          break;
        }
      }
    }

    // Check for URL in text content
    if (!imageUrl && typeof content === "string" && content.trim()) {
      console.log("[Image Gen] Content preview:", content.substring(0, 300));

      // Check for markdown image: ![alt](url)
      const markdownMatch = content.match(/!\[.*?\]\((.*?)\)/);
      if (markdownMatch) {
        imageUrl = markdownMatch[1];
      }

      // Check for direct URL at start
      if (!imageUrl && content.trim().startsWith("http")) {
        imageUrl = content.trim().split(/\s/)[0];
      }

      // Check for base64 data URL
      if (!imageUrl && content.includes("data:image")) {
        const base64Match = content.match(
          /(data:image\/[^;]+;base64,[A-Za-z0-9+/=]+)/
        );
        if (base64Match) {
          imageUrl = base64Match[1];
        }
      }

      // Check for any URL (image models often return just a URL)
      if (!imageUrl) {
        const urlMatch = content.match(/(https?:\/\/[^\s"'<>\]]+)/i);
        if (urlMatch) {
          imageUrl = urlMatch[1];
        }
      }
    }

    // Some image models return the image directly without content field
    if (!imageUrl && message?.image_url) {
      imageUrl = message.image_url;
    }

    // All providers use BYOK - no cost calculation or token billing

    if (!imageUrl) {
      console.error(
        "[Image Gen] Could not extract image URL from response. Full response:",
        JSON.stringify(data).substring(0, 1000)
      );
      throw new Error(
        "Could not extract image from AI response. The model may not support image generation or the response format is unexpected."
      );
    }

    console.log(
      "[Image Gen] Successfully extracted image URL, length:",
      imageUrl.length
    );

    return NextResponse.json({
      imageUrl,
      meta: {
        model: modelKey,
        imageType,
        isByok: true,
      },
    });
  } catch (error) {
    console.error("[Image Gen] Error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Image generation failed";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
