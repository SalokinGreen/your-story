/**
 * Shared OCR-merge call logic behind /api/ocr/merge - see providerCall.ts /
 * ocrSummarizeCall.ts for why this split exists (same code runs server-side
 * for the Vercel-hosted web build and client-side for the standalone
 * Tauri/Capacitor build).
 *
 * Second pass of the OCR import merge step (see ocrMerge.ts): the
 * deterministic pass groups entries by title/alias string similarity, but
 * can't catch two entries that describe the same subject under genuinely
 * different names (a nickname, an alternate title). This asks an AI to spot
 * those and group them; ocrMerge.ts's `mergeLoreEntries` then applies the
 * groups with the same merge logic as the deterministic pass. BYOK only,
 * same key/provider handling as ocrSummarizeCall.ts.
 */

import { attemptJSONRepair } from "@/app/misc/jsonRepair";
import {
  AIProvider,
  callProviderAI,
  inferProvider,
} from "@/app/misc/ocrSummarizeCall";

export interface MergeCandidateEntry {
  index: number;
  kind: "lore" | "mechanic";
  title: string;
  folder?: string;
  tags?: string[];
  aliases?: string[];
  contentPreview: string;
}

export interface OCRMergeRequestBody {
  entries: MergeCandidateEntry[];
  model?: string;
  provider?: AIProvider;
  openRouterKey?: string;
  deepseekKey?: string;
  mistralKey?: string;
  googleKey?: string;
  deepinfraKey?: string;
}

export interface MergeGroup {
  indices: number[];
  targetTitle: string;
}

export interface OCRMergeSuccess {
  success: true;
  groups: MergeGroup[];
}

export interface OCRMergeError {
  error: string;
  status: number;
}

/**
 * Keep only groups that are internally consistent: 2+ distinct in-range
 * indices, and no index claimed by more than one group. Invalid groups are
 * dropped rather than failing the whole response - a single malformed group
 * from the model shouldn't discard every other valid one.
 */
export function validateMergeGroups(
  rawGroups: unknown,
  entryCount: number,
): MergeGroup[] {
  if (!Array.isArray(rawGroups)) return [];

  const claimed = new Set<number>();
  const valid: MergeGroup[] = [];

  for (const raw of rawGroups) {
    if (!raw || typeof raw !== "object") continue;
    const indicesRaw = (raw as { indices?: unknown }).indices;
    const targetTitle = (raw as { targetTitle?: unknown }).targetTitle;
    if (!Array.isArray(indicesRaw) || typeof targetTitle !== "string") {
      continue;
    }

    const indices = Array.from(
      new Set(
        indicesRaw.filter(
          (n): n is number =>
            typeof n === "number" &&
            Number.isInteger(n) &&
            n >= 0 &&
            n < entryCount,
        ),
      ),
    );

    if (indices.length < 2) continue;
    if (indices.some((i) => claimed.has(i))) continue;
    if (!targetTitle.trim()) continue;

    indices.forEach((i) => claimed.add(i));
    valid.push({ indices, targetTitle: targetTitle.trim() });
  }

  return valid;
}

function tryParseGroups(content: string): MergeGroup[] | null {
  const attempts = [content, attemptJSONRepair(content)];
  for (const candidate of attempts) {
    try {
      let jsonStr = candidate.trim();
      const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlockMatch) jsonStr = codeBlockMatch[1].trim();
      const startIndex = jsonStr.indexOf("{");
      if (startIndex !== -1) jsonStr = jsonStr.slice(startIndex);
      const parsed = JSON.parse(jsonStr);
      return Array.isArray(parsed?.groups) ? parsed.groups : [];
    } catch {
      continue;
    }
  }
  return null;
}

function buildMergePrompt(entries: MergeCandidateEntry[]): {
  system: string;
  user: string;
} {
  const system = `You are reviewing notes extracted from different pages of the same document for a text adventure game. Some notes may describe the SAME subject (character, location, faction, rule) under different names - a nickname, a title, an alternate spelling - because they were extracted from different pages without seeing each other.

Find groups of 2+ notes that describe the same subject and should be merged into one. Only group notes you're confident describe the same thing, not just related or similar things. Most notes will not belong to any group - that's expected and correct.

Respond with ONLY a JSON object: {"groups": [{"indices": [0, 3], "targetTitle": "Best/most complete title for the merged entry"}]}. If nothing should be merged, respond {"groups": []}.`;

  const user = `NOTES (index: kind: title [folder] {aliases} - preview):
${entries
  .map(
    (e) =>
      `${e.index}: ${e.kind}: "${e.title}"${e.folder ? ` [${e.folder}]` : ""}${
        e.aliases?.length ? ` {${e.aliases.join(", ")}}` : ""
      } - ${e.contentPreview}`,
  )
  .join("\n")}`;

  return { system, user };
}

export async function mergeOCREntries(
  body: OCRMergeRequestBody,
): Promise<OCRMergeSuccess | OCRMergeError> {
  const {
    entries,
    model = "ministral-14b-2512",
    provider,
    openRouterKey,
    deepseekKey,
    mistralKey,
    googleKey,
    deepinfraKey,
  } = body;

  if (!entries || entries.length < 2) {
    return { success: true, groups: [] };
  }

  const effectiveProvider: AIProvider = provider || inferProvider(model);
  const providerKeys: Record<AIProvider, string | undefined> = {
    openrouter: openRouterKey,
    deepseek: deepseekKey,
    mistral: mistralKey,
    google: googleKey,
    deepinfra: deepinfraKey,
  };
  const apiKey = providerKeys[effectiveProvider];

  if (!apiKey) {
    return {
      error: `No ${effectiveProvider} API key provided. Please add your own key in Settings.`,
      status: 400,
    };
  }

  const { system, user } = buildMergePrompt(entries);

  const aiResponse = await callProviderAI(
    effectiveProvider,
    system,
    user,
    model,
    4000,
    apiKey,
  );

  if (!aiResponse.success) {
    return { error: aiResponse.error || "Merge pass failed", status: 500 };
  }

  const rawGroups = tryParseGroups(aiResponse.content || "");
  if (rawGroups === null) {
    return { error: "Could not parse merge response", status: 502 };
  }

  return { success: true, groups: validateMergeGroups(rawGroups, entries.length) };
}
