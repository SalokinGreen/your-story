import { NextRequest, NextResponse } from "next/server";
import { StoryData } from "@/app/misc/structs";
import { buildMessages, coerceToScenePart, ChatMessage } from "@/app/misc/ai";
import { createClient } from "@supabase/supabase-js";
import { hasEnoughTokens, deductTokens, getUserTokenBalance } from "@/app/misc/tokens";

export const runtime = "nodejs";

interface RequestBody {
  storyData: StoryData;
  userChoice?: string;
}

interface DeepseekChoice {
  index: number;
  message: { role: "assistant" | "user" | "system"; content: string };
  finish_reason?: string;
}

interface DeepseekUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

interface DeepseekResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: DeepseekChoice[];
  usage?: DeepseekUsage;
}

export async function POST(req: NextRequest) {
  // Create Supabase client for server-side authentication
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_KEY || process.env.SUPABASE_KEY;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseKey || !supabaseServiceKey) {
    return NextResponse.json(
      { error: "Server not configured: missing Supabase credentials" },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  // Get authentication token from request headers
  const authHeader = req.headers.get('authorization');
  if (!authHeader) {
    return NextResponse.json(
      { error: "Authentication required", code: "AUTH_REQUIRED" },
      { status: 401 }
    );
  }

  // Verify the user's session
  const { data: { user }, error: authError } = await supabase.auth.getUser(
    authHeader.replace('Bearer ', '')
  );

  if (authError || !user) {
    return NextResponse.json(
      { error: "Invalid or expired session", code: "AUTH_INVALID" },
      { status: 401 }
    );
  }

  const userId = user.id;

  // Check token balance (requires 1 token)
  const REQUIRED_TOKENS = 1;
  const hasTokens = await hasEnoughTokens(userId, REQUIRED_TOKENS, supabaseAdmin);
  
  if (!hasTokens) {
    const balance = await getUserTokenBalance(userId, supabaseAdmin);
    return NextResponse.json(
      { 
        error: `Insufficient tokens. You need ${REQUIRED_TOKENS} tokens to generate a story continuation.`,
        code: "INSUFFICIENT_TOKENS",
        balance: balance,
        required: REQUIRED_TOKENS
      },
      { status: 402 } // 402 Payment Required
    );
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch (e) {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const { storyData, userChoice } = body;
  if (!storyData) {
    return NextResponse.json(
      { error: "Missing storyData in request body" },
      { status: 400 }
    );
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  console.log("Using Deepseek API Key:", apiKey ? "FOUND" : "MISSING");
  if (!apiKey) {
    return NextResponse.json(
      { error: "Server not configured: missing DEEPSEEK_API_KEY" },
      { status: 500 }
    );
  }

  const model = process.env.DEEPSEEK_MODEL ?? "deepseek-chat";
  let messages: ChatMessage[] = buildMessages({ storyData, userChoice });
  // Filter out duplicate messages
  messages = messages.filter((msg, index, self) =>
    index === self.findIndex((m) => m.role === msg.role && m.content === msg.content)
  );
  console.log("Built messages for Deepseek. Message count:", messages.length);
  console.log("Last message length:", messages[messages.length - 1]?.content?.length || 0);
  
  try {
    console.log("Calling Deepseek API...");
    
    // Add timeout to prevent hanging requests
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
    
    const resp = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.7,
        max_tokens: 2000,
        stream: false,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    console.log("Deepseek response status:", resp.status);
    
    if (!resp.ok) {
      const text = await resp.text();
      console.error("Deepseek error response:", text);
      return NextResponse.json(
        { error: `Deepseek error: ${resp.status} ${resp.statusText}`, details: text },
        { status: 502 }
      );
    }

    const data = (await resp.json()) as DeepseekResponse;
    console.log("Deepseek response received. Choices:", data.choices?.length || 0);
    
    const content = data.choices?.[0]?.message?.content ?? "";
    console.log("Content length:", content.length);
    console.log("Content preview:", content.substring(0, 200));
    
    let part;
    try {
      part = coerceToScenePart(content);
      console.log("Successfully parsed ScenePart. Choices:", part.choices?.length || 0);
    } catch (parseError) {
      console.error("Error parsing ScenePart:", parseError);
      console.error("Raw content:", content);
      return NextResponse.json(
        { error: "Failed to parse AI response", details: (parseError as Error).message, rawContent: content },
        { status: 500 }
      );
    }

    // Deduct tokens after successful generation
    const deductResult = await deductTokens(userId, REQUIRED_TOKENS, supabaseAdmin);
    if (!deductResult.success) {
      console.error('Failed to deduct tokens after generation:', deductResult.error);
      console.error('User ID:', userId);
      console.error('Service role key configured:', !!supabaseServiceKey);
      // Log error but don't fail the request since generation succeeded
    } else {
      console.log(`Successfully deducted ${REQUIRED_TOKENS} tokens from user ${userId}`);
    }

    // Get updated balance
    const updatedBalance = await getUserTokenBalance(userId, supabaseAdmin);

    return NextResponse.json({
      part,
      meta: { 
        model: data.model, 
        usage: data.usage,
        tokensDeducted: REQUIRED_TOKENS,
        remainingBalance: updatedBalance
      }
    });
  } catch (err) {
    const error = err as Error;
    console.error("Error in /api/story/next:", error);
    
    // Check if it's an abort error (timeout)
    if (error.name === 'AbortError') {
      return NextResponse.json(
        { error: "Request timed out. The AI took too long to respond.", details: "Timeout after 30 seconds" },
        { status: 504 }
      );
    }
    
    return NextResponse.json(
      { error: "Failed to call Deepseek API", details: error.message, stack: error.stack },
      { status: 500 }
    );
  }
}
