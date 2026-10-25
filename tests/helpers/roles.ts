import { expect } from "vitest";

/**
 * Strict-alternation models (DeepInfra Gemma 3, Mistral Small 3.2) reject two
 * messages of the same role in a row. After any system messages the roles must
 * go user, assistant, user, ... and the request must end on a user message
 * (a trailing assistant message is a prefill, which Claude 5.5 rejects).
 */
export function expectAlternatingRoles(messages: { role: string }[]): void {
  const roles = messages.map((m) => m.role).filter((r) => r !== "system");
  roles.forEach((role, i) =>
    expect(role, `message ${i} of ${roles.join(",")}`).toBe(i % 2 === 0 ? "user" : "assistant"),
  );
  expect(roles[roles.length - 1]).toBe("user");
}
