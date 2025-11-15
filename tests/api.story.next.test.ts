import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "../app/api/story/next/route";
import { NextRequest } from "next/server";
import { goblin_layer } from "../app/misc/starter_stories";

// Mock the fetch function
global.fetch = vi.fn();

describe("POST /api/story/next", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set required env var for tests
    process.env.DEEPSEEK_API_KEY = "test-api-key";
  });

  it("returns 400 when request body is invalid JSON", async () => {
    const req = new NextRequest("http://localhost:3000/api/story/next", {
      method: "POST",
      body: "not valid json",
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("Invalid JSON");
  });

  it("returns 400 when storyData is missing", async () => {
    const req = new NextRequest("http://localhost:3000/api/story/next", {
      method: "POST",
      body: JSON.stringify({ userChoice: "some choice" }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("Missing storyData");
  });

  it("returns 500 when DEEPSEEK_API_KEY is missing", async () => {
    delete process.env.DEEPSEEK_API_KEY;

    const req = new NextRequest("http://localhost:3000/api/story/next", {
      method: "POST",
      body: JSON.stringify({ storyData: goblin_layer }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toContain("missing DEEPSEEK_API_KEY");
  });

  it("returns 502 when DeepSeek API returns an error", async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
      text: async () => "Rate limit exceeded",
    });

    const req = new NextRequest("http://localhost:3000/api/story/next", {
      method: "POST",
      body: JSON.stringify({ storyData: goblin_layer }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(502);
    expect(data.error).toContain("Deepseek error");
  });

  it("returns ScenePart when DeepSeek API succeeds", async () => {
    const mockResponse = {
      id: "chatcmpl-123",
      object: "chat.completion",
      created: 1234567890,
      model: "deepseek-chat",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: `<story>
You enter the goblin lair. The air is thick with the smell of decay.
</story>

<memory>
- Entered the goblin lair
</memory>

<choices>
- Attack the nearest goblin <use_skill: Combat (DC 25)>
- Try to sneak past <use_skill: Stealth (DC 30)>
- Negotiate with the goblins
</choices>`,
          },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: 150,
        completion_tokens: 80,
        total_tokens: 230,
      },
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const req = new NextRequest("http://localhost:3000/api/story/next", {
      method: "POST",
      body: JSON.stringify({
        storyData: goblin_layer,
        userChoice: "Enter the lair",
      }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.part).toBeDefined();
    expect(data.part.content).toContain("goblin lair");
    expect(data.part.role).toBe("assistant");
    expect(data.part.user).toBe(false);
    expect(data.part.memoryEntries).toContain("Entered the goblin lair");
    expect(data.part.choices).toHaveLength(3);
    expect(data.part.choices[0].text).toContain("Attack");
    expect(data.part.choices[0].skill_used).toBe("Combat");
    expect(data.part.choices[0].skill_dc).toBe(25);
    expect(data.meta.model).toBe("deepseek-chat");
    expect(data.meta.usage.total_tokens).toBe(230);
  });

  it("calls DeepSeek API with correct parameters", async () => {
    const mockFetch = global.fetch as any;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: "test",
        object: "chat.completion",
        created: 123,
        model: "deepseek-chat",
        choices: [{ index: 0, message: { role: "assistant", content: "Test" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }),
    });

    const req = new NextRequest("http://localhost:3000/api/story/next", {
      method: "POST",
      body: JSON.stringify({ storyData: goblin_layer }),
      headers: { "Content-Type": "application/json" },
    });

    await POST(req);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.deepseek.com/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-api-key",
          "Content-Type": "application/json",
        }),
        body: expect.stringContaining("deepseek-chat"),
      })
    );

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody.model).toBe("deepseek-chat");
    expect(callBody.temperature).toBe(0.7);
    expect(callBody.max_tokens).toBe(500);
    expect(callBody.stream).toBe(false);
    expect(callBody.messages).toBeDefined();
    expect(callBody.messages.length).toBeGreaterThan(0);
  });

  it("handles network errors gracefully", async () => {
    (global.fetch as any).mockRejectedValueOnce(new Error("Network error"));

    const req = new NextRequest("http://localhost:3000/api/story/next", {
      method: "POST",
      body: JSON.stringify({ storyData: goblin_layer }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toContain("Failed to call Deepseek API");
    expect(data.details).toContain("Network error");
  });
});
