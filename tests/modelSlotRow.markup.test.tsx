/**
 * Settings -> AI, the Models card's rows (decisions 118-124), rendered to
 * markup: what a row shows for a fresh profile, a saved choice (Reset), a
 * Mixed Default left by an older build, and a model with no key.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/app/misc/APIKeysContext", () => ({
  useAPIKeys: () => ({ hasKey: (field: string) => field === "openRouterKey" }),
}));

import { ModelSlotRow } from "@/app/components/AIConfigTab";
import { setSlotOverride } from "@/app/misc/reasoningTiers";

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

const KEY = "reasoningTierOverrides";

function row(slot: "default" | "advanced"): string {
  return renderToStaticMarkup(
    createElement(ModelSlotRow, {
      slot,
      title: slot === "default" ? "Default" : "Advanced",
      description: "A slot.",
      customModels: [],
    }),
  );
}

beforeEach(() => {
  const storage = new MemoryStorage();
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("window", {
    localStorage: storage,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ModelSlotRow", () => {
  it("a fresh profile shows no Reset, no Mixed line and no missing-key badge", () => {
    const html = row("default");
    expect(html).toContain("Default");
    expect(html).not.toContain("Reset");
    expect(html).not.toContain("Mixed");
    expect(html).not.toContain("No key");
  });

  it("a saved choice shows Reset", () => {
    setSlotOverride("advanced", { modelKey: "Claude Opus 5.5", reasoningEffort: "high" });
    expect(row("advanced")).toContain("Reset");
    expect(row("default")).not.toContain("Reset");
  });

  it("a Default left Mixed by an older build says which tiers differ", () => {
    const base = { modelKey: "GLM 5.3", reasoningEffort: "none" };
    const haiku = { modelKey: "Claude Haiku 5.5", reasoningEffort: "none" };
    localStorage.setItem(KEY, JSON.stringify([haiku, base, base, null]));
    const html = row("default");
    expect(html).toContain("Mixed: tier 0 runs");
    expect(html).toContain("Saving here sets all three.");
    // Advanced never shows the line.
    expect(row("advanced")).not.toContain("Mixed");
  });

  it("flags a model whose provider has no key", () => {
    setSlotOverride("default", { modelKey: "Google Gemini 2.5 Pro", reasoningEffort: "none" });
    expect(row("default")).toContain("No key");
  });
});
