import { NextRequest, NextResponse } from "next/server";
import { StoryData } from "@/app/misc/structs";
import { buildMessages, coerceToScenePart, ChatMessage } from "@/app/misc/ai";

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
  const messages: ChatMessage[] = buildMessages({ storyData, userChoice });

  try {
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
        max_tokens: 500,
        stream: false,
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      return NextResponse.json(
        { error: `Deepseek error: ${resp.status} ${resp.statusText}`, details: text },
        { status: 502 }
      );
    }

    const data = (await resp.json()) as DeepseekResponse;
    const content = data.choices?.[0]?.message?.content ?? "";
    const part = coerceToScenePart(content);

    return NextResponse.json({
      part,
      meta: { model: data.model, usage: data.usage }
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to call Deepseek API", details: (err as Error).message },
      { status: 500 }
    );
  }
}
