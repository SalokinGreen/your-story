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

export const runtime = "nodejs";

interface RequestBody {
  messages: ChatMessage[];
  currentStoryData: Partial<StoryData>;
  adventureMetadata?: {
    title?: string;
    shortDescription?: string;
    description?: string;
  };
  model?: string;
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
  } = body;

  // Model config
  // Find model key by model string or use default
  const modelEntry = Object.entries(AI_MODELS).find(
    ([_, m]) => m.model === requestedModel
  );
  const modelKey = modelEntry ? modelEntry[0] : "Prometheus";
  const modelConfig = getModelConfig(modelKey);

  // Estimate tokens
  // Rough estimate: 4 chars per token for input
  const inputText = JSON.stringify(messages) + JSON.stringify(currentStoryData);
  const estimatedInputTokens = Math.ceil(inputText.length / 4);
  const estimatedOutputTokens = 2000;

  // Calculate estimated cost using dynamic pricing
  const requiredCoins = calculateTokenCost(
    modelKey,
    estimatedInputTokens,
    estimatedOutputTokens
  );

  const hasTokens = await hasEnoughTokens(
    user.id,
    requiredCoins,
    supabaseAdmin
  );

  if (!hasTokens) {
    return NextResponse.json(
      { error: `Insufficient tokens. Estimated cost: ${requiredCoins} coins` },
      { status: 402 }
    );
  }

  let apiKey: string | undefined;
  let apiUrl: string;

  if (modelConfig.provider === "openrouter") {
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
        max_tokens: 12000, // Allow larger output for JSON
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
    const content = data.choices?.[0]?.message?.content ?? "";

    // Calculate actual cost
    const usage = data.usage || {
      prompt_tokens: estimatedInputTokens,
      completion_tokens: 0,
      total_tokens: estimatedInputTokens,
    }; // Fallback if no usage data

    const promptTokens = (usage as any).prompt_tokens || 0;
    // For some providers completion_tokens might be missing if empty?
    const completionTokens =
      (usage as any).completion_tokens ||
      (usage.total_tokens ? usage.total_tokens - promptTokens : 0);

    // Calculate actual cost using dynamic pricing
    const coinsToDeduct = calculateTokenCost(
      modelKey,
      promptTokens,
      completionTokens
    );

    // Deduct tokens
    await deductTokens(user.id, coinsToDeduct, supabaseAdmin);
    const remainingBalance = await getUserTokenBalance(user.id, supabaseAdmin);

    return NextResponse.json({
      content,
      meta: {
        usage: data.usage,
        remainingBalance,
        cost: coinsToDeduct,
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
