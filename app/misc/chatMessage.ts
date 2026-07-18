/**
 * Shared message type for LLM API calls (OpenAI/DeepSeek-style chat format).
 * Single source of truth - previously ai.ts and ai_staged.ts each defined
 * their own copy of this same shape.
 */
export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  reasoning?: string; // AI reasoning/thinking
  reasoning_details?: any[]; // Structured reasoning tokens (ReasoningDetail[])
  tool_calls?: any[]; // OpenAI/DeepSeek format tool calls
  tool_call_id?: string; // For tool role messages
};
