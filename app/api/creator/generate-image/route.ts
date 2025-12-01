/**
 * AI Image Generation API
 *
 * Generates adventure cover images (thumbnails/banners) using OpenRouter image models.
 * Returns the generated image URL.
 *
 * Supports two types of models:
 * 1. Chat-based image models (Gemini, GPT-5 Image) - use chat completions API
 * 2. Pure image models (Flux) - use images/generations API
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  hasEnoughTokens,
  deductTokens,
  getUserTokenBalance,
} from "@/app/misc/tokens";
import {
  OPENROUTER_IMAGE_MODELS,
  MARKUP_MULTIPLIER,
  COINS_PER_DOLLAR,
  MINIMUM_COST,
} from "@/app/misc/ai_prices";

export const runtime = "nodejs";
export const maxDuration = 120; // Allow up to 2 minutes for image generation

// Image model config type
type ImageModelKey = keyof typeof OPENROUTER_IMAGE_MODELS;
type ImageModelConfig = (typeof OPENROUTER_IMAGE_MODELS)[ImageModelKey];

interface RequestBody {
  prompt: string;
  model?: string;
  imageType: "thumbnail" | "banner";
}

// Check if model is a pure image generation model (Flux) vs chat-based (Gemini/GPT)
function isPureImageModel(modelId: string): boolean {
  return modelId.includes("flux") || modelId.includes("black-forest-labs");
}

// Get model config
function getImageModelConfig(modelKey: string): ImageModelConfig {
  if (modelKey in OPENROUTER_IMAGE_MODELS) {
    return OPENROUTER_IMAGE_MODELS[modelKey as ImageModelKey];
  }
  // Default to Nano Banana
  return OPENROUTER_IMAGE_MODELS["Nano Banana"];
}

// Calculate cost for image models based on token usage
function calculateImageTokenCost(
  modelKey: string,
  inputTokens: number,
  outputTokens: number
): number {
  const model = getImageModelConfig(modelKey);

  // Calculate raw cost in dollars (prices are per 1M tokens)
  const inputCost = (inputTokens / 1_000_000) * model.inputPrice;
  const outputCost = (outputTokens / 1_000_000) * model.outputPrice;
  const rawCost = inputCost + outputCost;

  // Apply markup and convert to coins
  const costWithMarkup = rawCost * MARKUP_MULTIPLIER;
  const costInCoins = Math.ceil(costWithMarkup * COINS_PER_DOLLAR);

  // Ensure minimum cost
  return Math.max(costInCoins, MINIMUM_COST);
}

// Estimate cost before generation (for validation)
function estimateImageCost(modelKey: string): number {
  const model = getImageModelConfig(modelKey);

  // For pure image models (Flux), use flat cost since no token usage
  if (isPureImageModel(model.model)) {
    return model.cost;
  }

  // For chat-based models, estimate based on typical token usage
  // Input: ~300 tokens for prompt, Output: ~1000 tokens for image URL/response
  const estimatedInputTokens = 300;
  const estimatedOutputTokens = 1000;
  return calculateImageTokenCost(
    modelKey,
    estimatedInputTokens,
    estimatedOutputTokens
  );
}

export async function POST(req: NextRequest) {
  const supabaseUrl = process.env.SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_KEY!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const openrouterKey = process.env.OPENROUTER_API_KEY;

  if (!supabaseUrl || !supabaseKey || !supabaseServiceKey) {
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 }
    );
  }

  if (!openrouterKey) {
    return NextResponse.json(
      { error: "OpenRouter API key not configured" },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

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

  const { prompt, model: requestedModel, imageType } = body;

  if (!prompt?.trim()) {
    return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
  }

  if (!imageType || !["thumbnail", "banner"].includes(imageType)) {
    return NextResponse.json(
      { error: "Invalid image type. Must be 'thumbnail' or 'banner'" },
      { status: 400 }
    );
  }

  // Get model config
  const modelKey = requestedModel || "Nano Banana";
  const modelConfig = getImageModelConfig(modelKey);
  const estimatedCost = estimateImageCost(modelKey);

  console.log(
    "[Image Gen] Model:",
    modelKey,
    "(",
    modelConfig.model,
    ")",
    "Type:",
    imageType,
    "Estimated Cost:",
    estimatedCost
  );

  // Check tokens (use estimated cost for pre-check)
  const hasTokens = await hasEnoughTokens(
    user.id,
    estimatedCost,
    supabaseAdmin
  );
  if (!hasTokens) {
    return NextResponse.json(
      { error: `Insufficient tokens. Estimated: ${estimatedCost} coins` },
      { status: 402 }
    );
  }

  try {
    // Build the image generation prompt with size hints based on type
    const sizeDescription =
      imageType === "thumbnail"
        ? "square or 4:3 aspect ratio cover image suitable for a thumbnail"
        : "wide landscape banner image with approximately 3:1 aspect ratio";

    let imageUrl: string | null = null;
    let actualCost: number;
    let inputTokens = 0;
    let outputTokens = 0;

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
          Authorization: `Bearer ${openrouterKey}`,
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

    // Get token usage for cost calculation
    inputTokens = data.usage?.prompt_tokens || 300;
    outputTokens = data.usage?.completion_tokens || 1000;

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

    // Calculate actual cost based on token usage (or flat cost for pure image models)
    if (isPureImageModel(modelConfig.model)) {
      actualCost = modelConfig.cost;
    } else {
      actualCost = calculateImageTokenCost(modelKey, inputTokens, outputTokens);
    }

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

    // Deduct actual tokens
    await deductTokens(user.id, actualCost, supabaseAdmin);
    const remainingBalance = await getUserTokenBalance(user.id, supabaseAdmin);

    return NextResponse.json({
      imageUrl,
      meta: {
        model: modelKey,
        cost: actualCost,
        remainingBalance,
        imageType,
        inputTokens,
        outputTokens,
      },
    });
  } catch (error) {
    console.error("[Image Gen] Error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Image generation failed";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
