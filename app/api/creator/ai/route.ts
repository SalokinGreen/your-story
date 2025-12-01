import { NextRequest, NextResponse } from "next/server";
import { StoryData } from "@/app/misc/structs";
import { buildCreatorMessages } from "@/app/misc/creator_ai";
import { ChatMessage } from "@/app/misc/ai";
import { createClient } from "@supabase/supabase-js";
import {
  hasEnoughTokens,
  deductTokens,
  getUserTokenBalance,
} from "@/app/misc/tokens";
import {
  getModelConfig,
  AI_MODELS,
  calculateTokenCost,
} from "@/app/misc/ai_prices";
import { convertMessagesToPrompt, NOVELAI_MODEL } from "@/app/misc/novelai";

export const runtime = "nodejs";

// NovelAI API endpoint
const NOVELAI_API_URL = "https://text.novelai.net/oa/v1/completions";

interface RequestBody {
  messages: ChatMessage[];
  currentStoryData: Partial<StoryData>;
  adventureMetadata?: {
    title?: string;
    shortDescription?: string;
    description?: string;
  };
  model?: string;
  novelaiKey?: string;
}

interface AIResponse {
  id: string;
  choices: {
    message: { content: string };
  }[];
  usage?: {
    total_tokens: number;
  };
  model: string;
}

export async function POST(req: NextRequest) {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_KEY || process.env.SUPABASE_KEY;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey || !supabaseServiceKey) {
    return NextResponse.json(
      { error: "Server configuration error" },
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
  } catch (e) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const {
    messages,
    currentStoryData,
    adventureMetadata,
    model: requestedModel,
    novelaiKey,
  } = body;

  // Model config - requestedModel is the model key (e.g., "Deepseek Chat")
  // Use getModelConfig which handles fallback to Deepseek Chat if model not found
  const modelKey = requestedModel || "Deepseek Chat";
  const modelConfig = getModelConfig(modelKey);
  const isNovelAI = modelConfig.provider === "novelai";

  console.log(
    "[Creator AI] Model requested:",
    requestedModel,
    "Using:",
    modelKey,
    "Provider:",
    modelConfig.provider
  );

  // Estimate tokens
  // Rough estimate: 4 chars per token for input
  const inputText = JSON.stringify(messages) + JSON.stringify(currentStoryData);
  const estimatedInputTokens = Math.ceil(inputText.length / 4);
  const estimatedOutputTokens = 2000;

  // Calculate estimated cost using dynamic pricing (0 for NovelAI BYOK)
  const requiredCoins = isNovelAI
    ? 0
    : calculateTokenCost(modelKey, estimatedInputTokens, estimatedOutputTokens);

  // Skip token check for NovelAI (BYOK - user pays directly)
  if (!isNovelAI) {
    const hasTokens = await hasEnoughTokens(
      user.id,
      requiredCoins,
      supabaseAdmin
    );

    if (!hasTokens) {
      return NextResponse.json(
        {
          error: `Insufficient tokens. Estimated cost: ${requiredCoins} coins`,
        },
        { status: 402 }
      );
    }
  }

  // Validate NovelAI key if using NovelAI
  if (isNovelAI && !novelaiKey) {
    return NextResponse.json(
      { error: "NovelAI API key required for NovelAI models" },
      { status: 400 }
    );
  }

  let apiKey: string | undefined;
  let apiUrl: string;

  if (modelConfig.provider === "novelai") {
    apiKey = novelaiKey;
    apiUrl = NOVELAI_API_URL;
  } else if (modelConfig.provider === "openrouter") {
    apiKey = process.env.OPENROUTER_API_KEY;
    apiUrl = "https://openrouter.ai/api/v1/chat/completions";
  } else {
    apiKey = process.env.DEEPSEEK_API_KEY;
    apiUrl = "https://api.deepseek.com/chat/completions";
  }

  if (!apiKey) {
    return NextResponse.json(
      { error: "Provider API key missing" },
      { status: 500 }
    );
  }

  const aiMessages = buildCreatorMessages({
    messages,
    currentStoryData,
    adventureMetadata,
  });

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000); // 45s timeout for creator (might generate large JSON)

    let content: string;
    let promptTokens = estimatedInputTokens;
    let completionTokens = 0;

    if (isNovelAI) {
      // NovelAI uses completions API, not chat
      const prompt = convertMessagesToPrompt(aiMessages);

      const resp = await fetch(apiUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: NOVELAI_MODEL,
          prompt: prompt,
          max_tokens: Math.min(modelConfig.maxOutputTokens, 1000), // NovelAI has 1K limit
          temperature: 0.7,
          top_p: 0.95,
          top_k: 40,
          stream: false,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!resp.ok) {
        const text = await resp.text();
        console.error("NovelAI API error:", text);
        return NextResponse.json(
          { error: `NovelAI error: ${resp.status}` },
          { status: 502 }
        );
      }

      const data = await resp.json();
      content = data.choices?.[0]?.text ?? "";
      // NovelAI doesn't provide detailed usage, estimate from content
      completionTokens = Math.ceil(content.length / 4);
    } else {
      // Standard chat completions API (DeepSeek, OpenRouter)
      const headers: Record<string, string> = {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      };

      if (modelConfig.provider === "openrouter") {
        headers["HTTP-Referer"] =
          process.env.NEXT_PUBLIC_SITE_URL || "https://your-story.app";
        headers["X-Title"] = "Your Story Creator";
      }

      const resp = await fetch(apiUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: modelConfig.model,
          messages: aiMessages,
          temperature: 0.7,
          max_tokens: Math.min(modelConfig.maxOutputTokens, 8000), // Respect model limits, cap at 8000 for safety
          stream: false,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!resp.ok) {
        const text = await resp.text();
        console.error("Creator AI API error:", text);
        return NextResponse.json(
          { error: `AI Provider error: ${resp.status}` },
          { status: 502 }
        );
      }

      const data = (await resp.json()) as AIResponse;
      content = data.choices?.[0]?.message?.content ?? "";

      // Calculate actual cost from usage
      const usage = data.usage || {
        prompt_tokens: estimatedInputTokens,
        completion_tokens: 0,
        total_tokens: estimatedInputTokens,
      };

      promptTokens = (usage as any).prompt_tokens || 0;
      completionTokens =
        (usage as any).completion_tokens ||
        (usage.total_tokens ? usage.total_tokens - promptTokens : 0);
    }

    // Calculate actual cost using dynamic pricing (0 for NovelAI)
    const coinsToDeduct = isNovelAI
      ? 0
      : calculateTokenCost(modelKey, promptTokens, completionTokens);

    // Deduct tokens (skip for NovelAI)
    if (!isNovelAI && coinsToDeduct > 0) {
      await deductTokens(user.id, coinsToDeduct, supabaseAdmin);
    }
    const remainingBalance = await getUserTokenBalance(user.id, supabaseAdmin);

    return NextResponse.json({
      content,
      meta: {
        usage: {
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
        },
        remainingBalance,
        cost: coinsToDeduct,
        isByok: isNovelAI,
      },
    });
  } catch (err) {
    console.error("Error in creator AI route:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
