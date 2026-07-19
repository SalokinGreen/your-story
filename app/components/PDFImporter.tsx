"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useNotification } from "@/app/misc/NotificationContext";
import { useAPIKeys, APIKeys } from "@/app/misc/APIKeysContext";
import { DynamicIcon } from "@/app/components/DynamicIcon";
import {
  validateOCRFile,
  estimateOCRCostUSD,
  MAX_PDF_SIZE_MB,
  OCRProcessResult,
} from "@/app/misc/ocr";
import { StoryLore, CustomTable } from "@/app/misc/structs";
import { AI_MODELS } from "@/app/misc/ai_prices";
import { PDFDocument } from "pdf-lib";
import {
  LocalPDFImport,
  listPDFImports,
  savePDFImport,
  deletePDFImport,
  migrateFromLocalStorage,
} from "@/app/misc/localPDFImportManager";

// Maximum size per PDF chunk for Mistral OCR (in MB)
const MAX_CHUNK_SIZE_MB = 4;
// Pages per chunk (approximate, will be adjusted based on actual size)
const PAGES_PER_CHUNK = 15;
// Maximum concurrent requests - increased for faster processing
const MAX_CONCURRENT_REQUESTS = 10;
// Maximum concurrent OCR uploads while a chunk is being split. Each chunk
// carries its own multi-MB base64 PDF payload, so this must stay much lower
// than MAX_CONCURRENT_REQUESTS (used for the lightweight text-only
// summarize phase) to avoid holding many multi-MB buffers in memory at
// once - the main cause of tab crashes on memory-constrained mobile
// browsers (iOS Safari, Android Chrome).
const MAX_CONCURRENT_OCR_REQUESTS = 2;
// Devices reporting <= this much RAM (via navigator.deviceMemory, in GB)
// are treated as memory-constrained and get smaller chunks / lower
// concurrency to avoid crashing while splitting large PDFs.
const LOW_MEMORY_DEVICE_THRESHOLD_GB = 4;
// Above this raw file size, pdf-lib has to hold a proportionally large
// parsed document in memory for the *entire* OCR phase (it's needed for
// `copyPages` on every chunk, not just the first one) regardless of how
// small each individual chunk ends up being. Treat large source files as
// memory-constrained on their own, independent of device detection.
const VERY_LARGE_FILE_SIZE_MB = 25;
// Timeout for summarize requests (4 minutes - server allows 5)
const SUMMARIZE_TIMEOUT_MS = 240000;
// Retry attempts for failed requests
const MAX_RETRIES = 2;

// Vercel enforces a hard 4.5MB request/response body limit on serverless
// functions that cannot be raised via configuration - exceeding it fails
// with "FUNCTION_PAYLOAD_TOO_LARGE" before the request handler even runs.
const VERCEL_BODY_LIMIT_BYTES = 4.5 * 1024 * 1024;
// Stay comfortably under that hard limit to leave room for JSON field
// overhead (fileName, mimeType, API key, etc.) and for page-size
// estimation error: a chunk planned from the document's *average* page
// size can still land over budget if it happens to contain a few
// image-heavy pages (e.g. a cover or table of contents).
const SAFE_BASE64_PAYLOAD_BYTES = VERCEL_BODY_LIMIT_BYTES - 128 * 1024;
// Below this raw file size, base64-encoding the whole PDF still fits
// under SAFE_BASE64_PAYLOAD_BYTES in one request; larger files must go
// through the chunked path instead, since the single-shot upload path
// sends the whole file as one payload with no further splitting.
const SAFE_SINGLE_UPLOAD_SIZE_MB =
  SAFE_BASE64_PAYLOAD_BYTES / (4 / 3) / (1024 * 1024);

// Providers the OCR summarize endpoint can call directly with a BYOK key.
// NovelAI is excluded - its API doesn't support the structured JSON
// extraction this endpoint relies on.
type BYOKProvider = "openrouter" | "deepseek" | "mistral" | "google" | "deepinfra";

const PROVIDER_KEY_FIELD: Record<BYOKProvider, keyof APIKeys> = {
  openrouter: "openRouterKey",
  deepseek: "deepseekKey",
  mistral: "mistralKey",
  google: "googleKey",
  deepinfra: "deepinfraKey",
};

const PROVIDER_LABELS: Record<BYOKProvider, string> = {
  openrouter: "OpenRouter",
  deepseek: "DeepSeek",
  mistral: "Mistral",
  google: "Google AI Studio",
  deepinfra: "DeepInfra",
};

// All built-in models grouped by provider, for the dropdown below.
const MODELS_BY_PROVIDER: Record<
  BYOKProvider,
  { model: string; name: string }[]
> = (() => {
  const groups: Record<BYOKProvider, { model: string; name: string }[]> = {
    openrouter: [],
    deepseek: [],
    mistral: [],
    google: [],
    deepinfra: [],
  };
  for (const cfg of Object.values(AI_MODELS)) {
    if (cfg.provider in groups) {
      groups[cfg.provider as BYOKProvider].push({
        model: cfg.model,
        name: cfg.name,
      });
    }
  }
  return groups;
})();

/**
 * Helper to run promises with limited concurrency
 */
async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number,
  onProgress?: (completed: number, total: number) => void,
): Promise<T[]> {
  const results: T[] = [];
  let completed = 0;

  // Process in batches
  for (let i = 0; i < tasks.length; i += concurrency) {
    const batch = tasks.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map((task) => task()));
    results.push(...batchResults);
    completed += batch.length;
    onProgress?.(completed, tasks.length);
  }

  return results;
}

/**
 * Fetch with timeout and retry support
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  timeoutMs: number = SUMMARIZE_TIMEOUT_MS,
  maxRetries: number = MAX_RETRIES,
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response;
    } catch (error: any) {
      lastError = error;

      // Don't retry on abort (user cancelled) or auth errors
      if (error.name === "AbortError") {
        throw new Error(`Request timed out after ${timeoutMs / 1000}s`);
      }

      // Wait before retry (exponential backoff)
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
        console.log(
          `Request failed, retrying in ${delay}ms (attempt ${
            attempt + 1
          }/${maxRetries})...`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error("Request failed after retries");
}

/**
 * Extract an error message from a failed fetch Response. Reads the body as
 * text exactly once (a Response body stream can only be consumed once -
 * calling `.json()` and then falling back to `.text()` on parse failure
 * throws "body stream already read", since `.json()` already consumed the
 * stream even though `JSON.parse` failed).
 */
async function extractErrorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  const text = await response.text();
  if (!text) return fallback;
  try {
    const parsed = JSON.parse(text);
    return parsed.error || fallback;
  } catch {
    return text || fallback;
  }
}

function isTextImportFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    name.endsWith(".txt") ||
    name.endsWith(".md") ||
    file.type === "text/plain" ||
    file.type === "text/markdown" ||
    file.type.startsWith("text/")
  );
}

/**
 * Convert bytes to base64 without building one giant string one character at a
 * time (the naive `reduce` + `String.fromCharCode` pattern allocates a new
 * string per byte and can spike memory enough to crash memory-constrained
 * browsers, notably iOS Safari, on real-world multi-MB PDFs).
 */
function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK_SIZE = 0x8000;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    parts.push(
      String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK_SIZE))),
    );
  }
  return btoa(parts.join(""));
}

/**
 * Best-effort detection of memory-constrained devices (mobile phones/
 * tablets) via the non-standard `navigator.deviceMemory` API. Safari
 * (iOS/iPadOS, including desktop-mode iPad) has never implemented that API
 * - the exact devices most prone to crashing on large in-memory PDF
 * parsing - so falling back to "not low memory" there silently disables
 * every mitigation below. Fall back to a mobile/tablet user-agent and
 * touch-capability heuristic instead of assuming desktop-class headroom.
 */
function isLowMemoryDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const deviceMemory = (navigator as Navigator & { deviceMemory?: number })
    .deviceMemory;
  if (typeof deviceMemory === "number") {
    return deviceMemory <= LOW_MEMORY_DEVICE_THRESHOLD_GB;
  }
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod|Android|Mobile/i.test(ua)) return true;
  // iPadOS 13+ reports its UA as a regular Mac, but exposes multi-touch
  // (real desktop Macs don't), so this is the standard way to detect it.
  if (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) {
    return true;
  }
  return false;
}

/**
 * Whether a given file should be processed with the conservative
 * (smaller chunk / lower concurrency) memory settings - either because
 * the device looks memory-constrained, or because the file itself is
 * large enough that pdf-lib's persistent in-memory document (held for the
 * whole OCR phase) is a meaningful memory floor on any device.
 */
function needsConservativeMemoryMode(fileSizeBytes: number): boolean {
  return (
    isLowMemoryDevice() ||
    fileSizeBytes / (1024 * 1024) > VERY_LARGE_FILE_SIZE_MB
  );
}

interface PDFChunkRange {
  pageStart: number; // 1-indexed, inclusive, for display
  pageEnd: number; // 1-indexed, inclusive, for display
  startIndex: number; // 0-indexed, inclusive
  endIndex: number; // 0-indexed, inclusive
}

interface PDFChunkPlan {
  pdfDoc: PDFDocument;
  ranges: PDFChunkRange[];
}

/**
 * Load a large PDF and compute how it should be split into smaller chunks,
 * without actually materializing the base64-encoded chunk bytes yet.
 *
 * Building every chunk's base64 payload upfront (as this used to do) means
 * the browser holds the original ArrayBuffer, the parsed pdf-lib document,
 * *and* every chunk's ~33%-larger-than-binary base64 string in memory at
 * once - multiple times the file's size - before a single byte is
 * uploaded. That's enough to crash memory-constrained mobile browsers
 * (iOS Safari, Android Chrome) on real-world multi-MB PDFs. Callers should
 * build each chunk's base64 on demand (see `buildPDFChunkBase64`) right
 * before uploading it, and let it be released again once the upload
 * request has been sent.
 */
async function planPDFChunks(
  file: File,
  onProgress?: (message: string) => void,
): Promise<PDFChunkPlan> {
  onProgress?.("Loading PDF for splitting...");

  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer, {
    ignoreEncryption: true,
  });
  const totalPages = pdfDoc.getPageCount();

  // On memory-constrained devices (or for very large source files), use
  // smaller chunks so fewer pages (and less base64 data) need to be held
  // in memory at any one time.
  const lowMemory = needsConservativeMemoryMode(file.size);
  const maxChunkSizeMB = lowMemory ? MAX_CHUNK_SIZE_MB / 2 : MAX_CHUNK_SIZE_MB;
  const maxPagesPerChunk = lowMemory
    ? Math.max(1, Math.floor(PAGES_PER_CHUNK / 2))
    : PAGES_PER_CHUNK;

  // Calculate how many pages per chunk based on file size
  const avgPageSize = file.size / totalPages;
  const targetChunkSize = maxChunkSizeMB * 1024 * 1024;
  const pagesPerChunk = Math.max(
    1,
    Math.min(maxPagesPerChunk, Math.floor(targetChunkSize / avgPageSize)),
  );

  const totalChunks = Math.ceil(totalPages / pagesPerChunk);
  const ranges: PDFChunkRange[] = [];

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    const startIndex = chunkIndex * pagesPerChunk;
    const endIndex = Math.min(startIndex + pagesPerChunk - 1, totalPages - 1);
    ranges.push({
      startIndex,
      endIndex,
      pageStart: startIndex + 1, // 1-indexed for display
      pageEnd: endIndex + 1,
    });
  }

  onProgress?.(`Planned ${totalChunks} chunk(s) from ${totalPages} pages...`);

  return { pdfDoc, ranges };
}

/**
 * Build the base64-encoded PDF bytes for a single chunk. Intended to be
 * called lazily, immediately before uploading that chunk, so at most a
 * handful of chunk payloads exist in memory simultaneously rather than
 * every chunk in the document at once.
 */
async function buildPDFChunkBase64(
  pdfDoc: PDFDocument,
  range: PDFChunkRange,
): Promise<string> {
  const chunkDoc = await PDFDocument.create();
  const pageIndicesToCopy = Array.from(
    { length: range.endIndex - range.startIndex + 1 },
    (_, i) => range.startIndex + i,
  );

  const copiedPages = await chunkDoc.copyPages(pdfDoc, pageIndicesToCopy);
  copiedPages.forEach((page) => chunkDoc.addPage(page));

  const chunkBytes = await chunkDoc.save();
  return bytesToBase64(chunkBytes);
}

/**
 * OCR a PDF page range via /api/ocr/process, splitting it in half and
 * recursing if the actual base64 payload turns out to exceed Vercel's
 * hard body-size limit. Chunk ranges are planned from the document's
 * *average* page size (see `planPDFChunks`), so a range can still land
 * over budget in practice if it happens to contain a few image-heavy
 * pages - splitting on the actual measured size, rather than trusting the
 * estimate, is what keeps this from failing outright.
 */
async function ocrPDFRange(
  pdfDoc: PDFDocument,
  range: PDFChunkRange,
  fileNameBase: string,
  mistralKey: string,
): Promise<{ markdown: string; totalPages: number }> {
  let base64: string;
  try {
    base64 = await buildPDFChunkBase64(pdfDoc, range);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "out of memory";
    throw new Error(
      `pages ${range.pageStart}-${range.pageEnd}: failed to prepare chunk for upload - ${message}`,
    );
  }

  const pageCount = range.endIndex - range.startIndex + 1;
  if (base64.length > SAFE_BASE64_PAYLOAD_BYTES && pageCount > 1) {
    base64 = "";
    const half = Math.floor(pageCount / 2);
    const firstRange: PDFChunkRange = {
      startIndex: range.startIndex,
      endIndex: range.startIndex + half - 1,
      pageStart: range.pageStart,
      pageEnd: range.pageStart + half - 1,
    };
    const secondRange: PDFChunkRange = {
      startIndex: range.startIndex + half,
      endIndex: range.endIndex,
      pageStart: range.pageStart + half,
      pageEnd: range.pageEnd,
    };
    const [first, second] = await Promise.all([
      ocrPDFRange(pdfDoc, firstRange, fileNameBase, mistralKey),
      ocrPDFRange(pdfDoc, secondRange, fileNameBase, mistralKey),
    ]);
    return {
      markdown: `${first.markdown}\n\n---\n\n${second.markdown}`,
      totalPages: first.totalPages + second.totalPages,
    };
  }

  let response: Response;
  try {
    response = await fetchWithRetry(
      "/api/ocr/process",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          base64Data: base64,
          fileName: `${fileNameBase}_pages_${range.pageStart}-${range.pageEnd}.pdf`,
          mimeType: "application/pdf",
          includeImages: false,
          mistralKey,
        }),
      },
      180000, // 3 minute timeout for OCR
    );
  } finally {
    // Allow the (potentially multi-MB) base64 string to be garbage
    // collected as soon as the request body has been handed off.
    base64 = "";
  }

  if (!response.ok) {
    const errorMsg = await extractErrorMessage(
      response,
      "OCR processing failed",
    );
    throw new Error(`pages ${range.pageStart}-${range.pageEnd}: ${errorMsg}`);
  }

  const result: OCRProcessResult = await response.json();
  return { markdown: result.markdown, totalPages: result.totalPages };
}

// SavedPDFImport interface moved to localPDFImportManager.ts as LocalPDFImport
// Re-export for backward compatibility in this file
type SavedPDFImport = LocalPDFImport;

interface PDFImporterProps {
  /** Called when import completes with extracted data */
  onImportComplete: (data: {
    lore: StoryLore[];
    mechanicNotes: StoryLore[];
    customTables: CustomTable[];
    summary: string;
  }) => void;
  /** Optional: Only import specific types */
  importTypes?: ("lore" | "mechanics" | "tables")[];
  /** Optional: Custom button text */
  buttonText?: string;
  /** Optional: Compact mode */
  compact?: boolean;
}

type ProcessingStep =
  | "idle"
  | "uploading"
  | "ocr"
  | "summarizing"
  | "complete"
  | "error";

// Chunk status for tracking individual chunk processing
interface ChunkStatus {
  chunkIndex: number;
  pageStart: number;
  pageEnd: number;
  status: "pending" | "ocr" | "summarizing" | "complete" | "failed";
  ocrMarkdown?: string;
  rawSummarizeOutput?: string;
  error?: string;
  result?: {
    lore: StoryLore[];
    mechanicNotes: StoryLore[];
    customTables: CustomTable[];
  };
}

export default function PDFImporter({
  onImportComplete,
  importTypes = ["lore", "mechanics", "tables"],
  buttonText = "Import from PDF",
  compact = false,
}: PDFImporterProps) {
  const { keys } = useAPIKeys();
  const { addNotification } = useNotification();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<ProcessingStep>("idle");
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [estimatedCost, setEstimatedCost] = useState(0);
  const [pageCount, setPageCount] = useState(0);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);

  // AI model selection for summarization
  const [aiModel, setAIModel] = useState("ministral-14b-2512");

  // Advanced options
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [customModelProvider, setCustomModelProvider] =
    useState<BYOKProvider>("openrouter");
  const [customModelId, setCustomModelId] = useState("");
  const [customInstructions, setCustomInstructions] = useState("");
  const [maxOutputTokens, setMaxOutputTokens] = useState(16000);

  // Saved imports
  const [savedImports, setSavedImports] = useState<SavedPDFImport[]>([]);
  const [showSavedImports, setShowSavedImports] = useState(false);
  const [expandedImport, setExpandedImport] = useState<string | null>(null);

  // Chunk tracking state for large PDFs
  const [chunkStatuses, setChunkStatuses] = useState<ChunkStatus[]>([]);
  const [showChunkDetails, setShowChunkDetails] = useState(false);

  // JSON Repair Modal state - for manual fixing of broken chunk output
  const [repairModalOpen, setRepairModalOpen] = useState(false);
  const [repairChunkIndex, setRepairChunkIndex] = useState<number | null>(null);
  const [repairContent, setRepairContent] = useState("");
  const [repairError, setRepairError] = useState("");

  // Resolve the currently selected model + provider, whether it's one of the
  // built-in models or a user-entered custom model ID for any provider.
  const getSelectedModel = useCallback((): {
    model: string;
    provider: BYOKProvider;
  } => {
    if (aiModel === "custom-model") {
      return { model: customModelId.trim(), provider: customModelProvider };
    }
    const cfg = Object.values(AI_MODELS).find((m) => m.model === aiModel);
    return {
      model: aiModel,
      provider: (cfg?.provider as BYOKProvider) || "openrouter",
    };
  }, [aiModel, customModelId, customModelProvider]);

  // Load saved imports from IndexedDB on mount
  useEffect(() => {
    const loadImports = async () => {
      try {
        // First, migrate any existing localStorage data
        await migrateFromLocalStorage();
        // Then load from IndexedDB
        const imports = await listPDFImports();
        setSavedImports(imports);
      } catch (e) {
        console.warn("Failed to load saved PDF imports:", e);
      }
    };
    loadImports();
  }, []);

  // Save imports to IndexedDB
  const saveImport = useCallback(
    async (data: {
      lore: StoryLore[];
      mechanicNotes: StoryLore[];
      customTables: CustomTable[];
      summary: string;
    }) => {
      const fileName =
        selectedFiles.length > 1
          ? `${selectedFiles.length} files`
          : selectedFiles[0]?.name || "Unknown";

      try {
        const newImport = await savePDFImport(data, fileName);
        setSavedImports((prev) => [newImport, ...prev]);
      } catch (e) {
        console.warn("Failed to save PDF import:", e);
      }
    },
    [selectedFiles],
  );

  // Delete a saved import from IndexedDB
  const deleteSavedImport = useCallback(async (id: string) => {
    try {
      await deletePDFImport(id);
      setSavedImports((prev) => prev.filter((imp) => imp.id !== id));
    } catch (e) {
      console.warn("Failed to delete saved import:", e);
    }
  }, []);

  // Use a saved import
  const useSavedImport = useCallback(
    (imp: SavedPDFImport) => {
      onImportComplete({
        lore: imp.lore,
        mechanicNotes: imp.mechanicNotes,
        customTables: imp.customTables,
        summary: imp.summary,
      });
      addNotification(
        `Loaded ${imp.lore.length + imp.mechanicNotes.length} notes, ${
          imp.customTables.length
        } tables from saved import`,
        "success",
      );
      setIsOpen(false);
    },
    [onImportComplete, addNotification],
  );

  // Retry a failed chunk
  const retryChunk = useCallback(
    async (chunkIndex: number) => {
      const chunk = chunkStatuses.find((cs) => cs.chunkIndex === chunkIndex);
      if (!chunk || !chunk.ocrMarkdown) {
        addNotification("Cannot retry: OCR data not available", "warning");
        return;
      }

      // Update status to summarizing
      setChunkStatuses((prev) =>
        prev.map((cs) =>
          cs.chunkIndex === chunkIndex
            ? { ...cs, status: "summarizing", error: undefined }
            : cs,
        ),
      );

      try {
        const summarizeResponse = await fetchWithRetry(
          "/api/ocr/summarize",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              markdown: chunk.ocrMarkdown,
              focus: ["all"],
              customInstructions:
                customInstructions +
                `\n\nNote: This is pages ${chunk.pageStart}-${chunk.pageEnd} of a larger document.`,
              model: getSelectedModel().model,
              provider: getSelectedModel().provider,
              maxTokens: maxOutputTokens,
              openRouterKey: keys.openRouterKey,
              deepseekKey: keys.deepseekKey,
              mistralKey: keys.mistralKey,
              googleKey: keys.googleKey,
              deepinfraKey: keys.deepinfraKey,
            }),
          },
          SUMMARIZE_TIMEOUT_MS,
          MAX_RETRIES,
        );

        if (!summarizeResponse.ok) {
          const errorMsg = await summarizeResponse.text();
          setChunkStatuses((prev) =>
            prev.map((cs) =>
              cs.chunkIndex === chunkIndex
                ? { ...cs, status: "failed", error: errorMsg }
                : cs,
            ),
          );
          addNotification(`Retry failed: ${errorMsg}`, "failure");
          return;
        }

        const resultText = await summarizeResponse.text();
        let result;
        try {
          result = JSON.parse(resultText);
        } catch {
          setChunkStatuses((prev) =>
            prev.map((cs) =>
              cs.chunkIndex === chunkIndex
                ? {
                    ...cs,
                    status: "failed",
                    error: "JSON parse error",
                    rawSummarizeOutput: resultText,
                  }
                : cs,
            ),
          );
          addNotification(
            "Retry failed: JSON parse error. You can try manual fix.",
            "warning",
          );
          return;
        }

        // Success - update chunk status
        setChunkStatuses((prev) =>
          prev.map((cs) =>
            cs.chunkIndex === chunkIndex
              ? {
                  ...cs,
                  status: "complete",
                  error: undefined,
                  rawSummarizeOutput: undefined,
                  result: {
                    lore: result.lore || [],
                    mechanicNotes: result.mechanicNotes || [],
                    customTables: result.customTables || [],
                  },
                }
              : cs,
          ),
        );
        addNotification(`Chunk ${chunkIndex + 1} retry successful!`, "success");
      } catch (err: any) {
        setChunkStatuses((prev) =>
          prev.map((cs) =>
            cs.chunkIndex === chunkIndex
              ? {
                  ...cs,
                  status: "failed",
                  error: err.message || "Unknown error",
                }
              : cs,
          ),
        );
        addNotification(`Retry failed: ${err.message}`, "failure");
      }
    },
    [
      chunkStatuses,
      customInstructions,
      getSelectedModel,
      maxOutputTokens,
      keys,
      addNotification,
    ],
  );

  // Open repair modal for a failed chunk
  const openRepairModal = useCallback(
    (chunkIndex: number) => {
      const chunk = chunkStatuses.find((cs) => cs.chunkIndex === chunkIndex);
      if (!chunk || !chunk.rawSummarizeOutput) {
        addNotification("No raw output available to repair", "warning");
        return;
      }
      setRepairChunkIndex(chunkIndex);
      setRepairContent(chunk.rawSummarizeOutput);
      setRepairError(chunk.error || "JSON parse error");
      setRepairModalOpen(true);
    },
    [chunkStatuses, addNotification],
  );

  // Handle repair save - apply manually fixed JSON
  const handleRepairSave = useCallback(
    (fixedContent: string) => {
      if (repairChunkIndex === null) return;

      try {
        const result = JSON.parse(fixedContent);

        // Update chunk status with parsed results
        setChunkStatuses((prev) =>
          prev.map((cs) =>
            cs.chunkIndex === repairChunkIndex
              ? {
                  ...cs,
                  status: "complete",
                  error: undefined,
                  rawSummarizeOutput: undefined,
                  result: {
                    lore: result.lore || [],
                    mechanicNotes: result.mechanicNotes || [],
                    customTables: result.customTables || [],
                  },
                }
              : cs,
          ),
        );

        // Close modal
        setRepairModalOpen(false);
        setRepairChunkIndex(null);
        setRepairContent("");
        setRepairError("");

        addNotification(
          `Chunk ${repairChunkIndex + 1} recovered from fixed JSON!`,
          "success",
        );
      } catch (err) {
        addNotification(
          `Invalid JSON: ${err instanceof Error ? err.message : "Parse error"}`,
          "warning",
        );
      }
    },
    [repairChunkIndex, addNotification],
  );

  // Collect all chunk results (for completing import after fixing)
  const collectChunkResults = useCallback(() => {
    const allLore: StoryLore[] = [];
    const allMechanicNotes: StoryLore[] = [];
    const allCustomTables: CustomTable[] = [];

    for (const chunk of chunkStatuses) {
      if (chunk.status === "complete" && chunk.result) {
        allLore.push(...chunk.result.lore);
        allMechanicNotes.push(...chunk.result.mechanicNotes);
        allCustomTables.push(...chunk.result.customTables);
      }
    }

    return {
      lore: allLore,
      mechanicNotes: allMechanicNotes,
      customTables: allCustomTables,
    };
  }, [chunkStatuses]);

  // Complete import with current chunk results (even if some failed)
  const completeWithCurrentResults = useCallback(() => {
    const results = collectChunkResults();
    const completedCount = chunkStatuses.filter(
      (cs) => cs.status === "complete",
    ).length;
    const failedCount = chunkStatuses.filter(
      (cs) => cs.status === "failed",
    ).length;

    const importData = {
      lore: results.lore,
      mechanicNotes: results.mechanicNotes,
      customTables: results.customTables,
      summary: `Imported ${completedCount} chunks (${failedCount} failed)`,
    };

    // Save to IndexedDB
    saveImport(importData);

    // Call callback
    onImportComplete(importData);

    const totalItems =
      results.lore.length +
      results.mechanicNotes.length +
      results.customTables.length;
    addNotification(
      `Imported ${totalItems} items from ${completedCount} chunks (${failedCount} skipped)`,
      failedCount > 0 ? "warning" : "success",
    );

    // Close modal
    setIsOpen(false);
    resetState();
  }, [
    collectChunkResults,
    chunkStatuses,
    saveImport,
    onImportComplete,
    addNotification,
  ]);

  // Get max output limit based on selected model
  const getModelMaxOutput = () => {
    // Look up actual model limits from AI_MODELS config
    const modelEntry = Object.values(AI_MODELS).find(
      (m) => m.model === aiModel || m.original_model === aiModel,
    );
    // Use actual maxOutputTokens from config, or 100k for custom/unknown models
    // Cap at 100k for sanity
    return Math.min(modelEntry?.maxOutputTokens || 100000, 100000);
  };

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      if (files.length === 0) return;

      const validFiles: File[] = [];
      let totalPages = 0;

      for (const file of files) {
        if (isTextImportFile(file)) {
          validFiles.push(file);
          continue;
        }

        const validation = validateOCRFile(file);
        if (!validation.valid) {
          addNotification(`${file.name}: ${validation.error}`, "failure");
          continue;
        }
        validFiles.push(file);
        // Estimate cost (rough estimate based on file size)
        // ~100KB per page for typical PDFs
        totalPages += Math.max(1, Math.ceil(file.size / (100 * 1024)));
      }

      if (validFiles.length > 0) {
        setSelectedFiles((prev) => [...prev, ...validFiles]);
        if (totalPages > 0) {
          setPageCount((prev) => prev + totalPages);
          setEstimatedCost((prev) => prev + estimateOCRCostUSD(totalPages));
        }
      }
    },
    [addNotification],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const files = Array.from(e.dataTransfer.files);
      if (files.length === 0) return;

      const validFiles: File[] = [];
      let totalPages = 0;

      for (const file of files) {
        if (isTextImportFile(file)) {
          validFiles.push(file);
          continue;
        }

        const validation = validateOCRFile(file);
        if (!validation.valid) {
          addNotification(`${file.name}: ${validation.error}`, "failure");
          continue;
        }
        validFiles.push(file);
        totalPages += Math.max(1, Math.ceil(file.size / (100 * 1024)));
      }

      if (validFiles.length > 0) {
        setSelectedFiles((prev) => [...prev, ...validFiles]);
        if (totalPages > 0) {
          setPageCount((prev) => prev + totalPages);
          setEstimatedCost((prev) => prev + estimateOCRCostUSD(totalPages));
        }
      }
    },
    [addNotification],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const processFiles = async () => {
    if (selectedFiles.length === 0) {
      addNotification("Please select at least one file", "warning");
      return;
    }

    const selectedModel = getSelectedModel();
    if (!selectedModel.model) {
      addNotification("Please enter a custom model ID", "warning");
      return;
    }
    if (!keys[PROVIDER_KEY_FIELD[selectedModel.provider]]) {
      addNotification(
        `Please add your ${PROVIDER_LABELS[selectedModel.provider]} API key in Settings`,
        "warning",
      );
      return;
    }

    // Aggregate results from all files
    const allLore: StoryLore[] = [];
    const allMechanicNotes: StoryLore[] = [];
    const allCustomTables: CustomTable[] = [];
    let totalPagesProcessed = 0;

    try {
      const totalFiles = selectedFiles.length;

      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        setCurrentFileIndex(i);

        // Calculate progress range for this file
        const fileProgressStart = (i / totalFiles) * 100;
        const fileProgressEnd = ((i + 1) / totalFiles) * 100;
        const fileProgressRange = fileProgressEnd - fileProgressStart;

        // Check file size to determine processing strategy
        const fileSizeMB = file.size / (1024 * 1024);
        const isPDF =
          file.type === "application/pdf" ||
          file.name.toLowerCase().endsWith(".pdf");

        // For large PDFs, we'll split into chunks. The threshold is based
        // on the *safe base64 upload size*, not MAX_CHUNK_SIZE_MB, since a
        // single-shot upload (below) sends the whole file as one base64
        // payload with no further splitting - it must fit under Vercel's
        // body-size limit on its own.
        const needsChunking = isPDF && fileSizeMB > SAFE_SINGLE_UPLOAD_SIZE_MB;

        let combinedMarkdown = "";
        let combinedTotalPages = 0;

        // For chunked processing, we summarize each chunk and merge results
        const chunkLore: StoryLore[] = [];
        const chunkMechanics: StoryLore[] = [];
        const chunkTables: CustomTable[] = [];

        if (needsChunking) {
          // Large PDF: Plan chunk page-ranges, then OCR all (building each
          // chunk's base64 payload lazily, right before it's uploaded),
          // then summarize all.
          setStep("uploading");
          setStatusMessage(`Splitting ${file.name} into chunks...`);
          setProgress(fileProgressStart + fileProgressRange * 0.05);

          let chunkPlan: PDFChunkPlan;
          try {
            chunkPlan = await planPDFChunks(file, (msg) =>
              setStatusMessage(msg),
            );
          } catch (err: unknown) {
            const message =
              err instanceof Error
                ? err.message
                : "the file may be too large or corrupted for this device's memory";
            throw new Error(`Failed to read ${file.name}: ${message}`);
          }

          const { pdfDoc, ranges } = chunkPlan;
          const totalChunks = ranges.length;
          // Fewer concurrent OCR uploads on memory-constrained devices (or
          // for very large source files), since each chunk carries its
          // own multi-MB base64 payload.
          const ocrConcurrency = needsConservativeMemoryMode(file.size)
            ? 1
            : MAX_CONCURRENT_OCR_REQUESTS;

          // Initialize chunk statuses for tracking
          const initialStatuses: ChunkStatus[] = ranges.map((range, idx) => ({
            chunkIndex: idx,
            pageStart: range.pageStart,
            pageEnd: range.pageEnd,
            status: "pending",
          }));
          setChunkStatuses(initialStatuses);

          // Phase 1: OCR all chunks with limited concurrency (5% - 45% progress)
          setStep("ocr");
          setStatusMessage(
            `Running OCR on ${totalChunks} chunks (${ocrConcurrency} at a time)...`,
          );
          setProgress(fileProgressStart + fileProgressRange * 0.1);

          const ocrTasks = ranges.map((range, chunkIdx) => async () => {
            // Update status to ocr
            setChunkStatuses((prev) =>
              prev.map((cs) =>
                cs.chunkIndex === chunkIdx ? { ...cs, status: "ocr" } : cs,
              ),
            );

            // Build this chunk's base64 payload just-in-time so at most
            // `ocrConcurrency` chunk buffers exist in memory at once,
            // instead of every chunk in the document simultaneously.
            // ocrPDFRange transparently splits further if the actual
            // payload exceeds Vercel's body-size limit.
            let chunkResult: { markdown: string; totalPages: number };
            try {
              chunkResult = await ocrPDFRange(
                pdfDoc,
                range,
                file.name,
                keys.mistralKey,
              );
            } catch (err: unknown) {
              const message =
                err instanceof Error ? err.message : "OCR processing failed";
              throw new Error(`Chunk ${chunkIdx + 1} (${message})`);
            }

            // Update status with OCR markdown
            setChunkStatuses((prev) =>
              prev.map((cs) =>
                cs.chunkIndex === chunkIdx
                  ? { ...cs, ocrMarkdown: chunkResult.markdown }
                  : cs,
              ),
            );

            return {
              chunkIndex: chunkIdx,
              markdown: chunkResult.markdown,
              pageStart: range.pageStart,
              pageEnd: range.pageEnd,
              totalPages: chunkResult.totalPages,
            };
          });

          const ocrResults = await runWithConcurrency(
            ocrTasks,
            ocrConcurrency,
            (completed, total) => {
              const ocrProgress = completed / total;
              setProgress(
                fileProgressStart +
                  fileProgressRange * (0.1 + ocrProgress * 0.35),
              );
              setStatusMessage(`OCR: ${completed}/${total} chunks complete...`);
            },
          );

          // Sort by page order and combine results
          ocrResults.sort((a, b) => a.pageStart - b.pageStart);

          for (const ocr of ocrResults) {
            combinedMarkdown +=
              (combinedMarkdown ? "\n\n---\n\n" : "") +
              `<!-- Pages ${ocr.pageStart}-${ocr.pageEnd} -->\n${ocr.markdown}`;
            combinedTotalPages += ocr.totalPages;
          }

          totalPagesProcessed += combinedTotalPages;
          setProgress(fileProgressStart + fileProgressRange * 0.45);

          // Phase 2: Summarize all chunks with limited concurrency (45% - 95% progress)
          setStep("summarizing");
          setStatusMessage(
            `Extracting notes from ${ocrResults.length} chunks (${MAX_CONCURRENT_REQUESTS} at a time)...`,
          );
          setProgress(fileProgressStart + fileProgressRange * 0.5);

          const summarizeTasks = ocrResults.map((ocr) => async () => {
            // Update status to summarizing
            setChunkStatuses((prev) =>
              prev.map((cs) =>
                cs.chunkIndex === ocr.chunkIndex
                  ? { ...cs, status: "summarizing" }
                  : cs,
              ),
            );

            try {
              const summarizeResponse = await fetchWithRetry(
                "/api/ocr/summarize",
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    markdown: ocr.markdown,
                    focus: ["all"],
                    customInstructions:
                      customInstructions +
                      `\n\nNote: This is pages ${ocr.pageStart}-${ocr.pageEnd} of a larger document.`,
                    model: getSelectedModel().model,
                    provider: getSelectedModel().provider,
                    maxTokens: maxOutputTokens,
                    openRouterKey: keys.openRouterKey,
                    deepseekKey: keys.deepseekKey,
                    mistralKey: keys.mistralKey,
                    googleKey: keys.googleKey,
                    deepinfraKey: keys.deepinfraKey,
                  }),
                },
                SUMMARIZE_TIMEOUT_MS,
                MAX_RETRIES,
              );

              if (!summarizeResponse.ok) {
                const errorMsg = await summarizeResponse.text();
                console.error(
                  `Pages ${ocr.pageStart}-${ocr.pageEnd} summarization failed:`,
                  errorMsg,
                );
                // Update status to failed
                setChunkStatuses((prev) =>
                  prev.map((cs) =>
                    cs.chunkIndex === ocr.chunkIndex
                      ? { ...cs, status: "failed", error: errorMsg }
                      : cs,
                  ),
                );
                return {
                  chunkIndex: ocr.chunkIndex,
                  success: false,
                  error: errorMsg,
                };
              }

              const resultText = await summarizeResponse.text();
              let result;
              try {
                result = JSON.parse(resultText);
              } catch (parseError) {
                // Store raw output for manual repair
                setChunkStatuses((prev) =>
                  prev.map((cs) =>
                    cs.chunkIndex === ocr.chunkIndex
                      ? {
                          ...cs,
                          status: "failed",
                          error: "JSON parse error",
                          rawSummarizeOutput: resultText,
                        }
                      : cs,
                  ),
                );
                return {
                  chunkIndex: ocr.chunkIndex,
                  success: false,
                  error: "JSON parse error",
                  rawOutput: resultText,
                };
              }

              // Update status to complete with results
              setChunkStatuses((prev) =>
                prev.map((cs) =>
                  cs.chunkIndex === ocr.chunkIndex
                    ? {
                        ...cs,
                        status: "complete",
                        result: {
                          lore: result.lore || [],
                          mechanicNotes: result.mechanicNotes || [],
                          customTables: result.customTables || [],
                        },
                      }
                    : cs,
                ),
              );

              return {
                chunkIndex: ocr.chunkIndex,
                success: true,
                lore: result.lore || [],
                mechanicNotes: result.mechanicNotes || [],
                customTables: result.customTables || [],
              };
            } catch (err: any) {
              console.error(
                `Pages ${ocr.pageStart}-${ocr.pageEnd} summarization error:`,
                err.message || err,
              );
              // Update status to failed
              setChunkStatuses((prev) =>
                prev.map((cs) =>
                  cs.chunkIndex === ocr.chunkIndex
                    ? {
                        ...cs,
                        status: "failed",
                        error: err.message || "Unknown error",
                      }
                    : cs,
                ),
              );
              return {
                chunkIndex: ocr.chunkIndex,
                success: false,
                error: err.message,
              };
            }
          });

          const summarizeResults = await runWithConcurrency(
            summarizeTasks,
            MAX_CONCURRENT_REQUESTS,
            (completed, total) => {
              const sumProgress = completed / total;
              setProgress(
                fileProgressStart +
                  fileProgressRange * (0.5 + sumProgress * 0.45),
              );
              setStatusMessage(
                `Creating notes: ${completed}/${total} chunks complete...`,
              );
            },
          );

          // Count failures and warn user
          const failedResults = summarizeResults.filter((r) => !r.success);
          const failedCount = failedResults.length;
          if (failedCount > 0) {
            console.warn(
              `${failedCount}/${summarizeResults.length} chunks failed to summarize`,
            );
            // Show chunk details panel for failed chunks
            setShowChunkDetails(true);
          }

          // Collect results from successful summarizations
          for (const result of summarizeResults) {
            if (result.success) {
              chunkLore.push(...(result.lore || []));
              chunkMechanics.push(...(result.mechanicNotes || []));
              chunkTables.push(...(result.customTables || []));
            }
          }

          // Add chunk results to totals
          allLore.push(...chunkLore);
          allMechanicNotes.push(...chunkMechanics);
          allCustomTables.push(...chunkTables);
          setProgress(fileProgressEnd);
        } else {
          // Small file or non-PDF: Use original single-request approach
          if (isTextImportFile(file)) {
            setStep("summarizing");
            setProgress(fileProgressStart + fileProgressRange * 0.4);
            setStatusMessage(
              `Extracting notes from ${file.name} (${i + 1}/${totalFiles})...`,
            );

            const textContent = await file.text();
            combinedMarkdown = textContent;
            combinedTotalPages = 0;

            const summarizeResponse = await fetchWithRetry(
              "/api/ocr/summarize",
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  markdown: combinedMarkdown,
                  focus: ["all"],
                  customInstructions:
                    (customInstructions || "") +
                    `\n\nNote: This content was imported from a text file (${file.name}).`,
                  model: getSelectedModel().model,
                  provider: getSelectedModel().provider,
                  maxTokens: maxOutputTokens,
                  openRouterKey: keys.openRouterKey,
                  deepseekKey: keys.deepseekKey,
                  mistralKey: keys.mistralKey,
                  googleKey: keys.googleKey,
                  deepinfraKey: keys.deepinfraKey,
                }),
              },
              SUMMARIZE_TIMEOUT_MS,
              MAX_RETRIES,
            );

            if (!summarizeResponse.ok) {
              const errorMsg = await extractErrorMessage(
                summarizeResponse,
                "Note extraction failed",
              );
              throw new Error(`${file.name}: ${errorMsg}`);
            }

            const summarizeResult = await summarizeResponse.json();
            allLore.push(...(summarizeResult.lore || []));
            allMechanicNotes.push(...(summarizeResult.mechanicNotes || []));
            allCustomTables.push(...(summarizeResult.customTables || []));
            setProgress(fileProgressEnd);
            continue;
          }

          setStep("uploading");
          setProgress(fileProgressStart + fileProgressRange * 0.1);
          setStatusMessage(
            `Preparing ${file.name} (${i + 1}/${totalFiles})...`,
          );

          const arrayBuffer = await file.arrayBuffer();
          const base64 = bytesToBase64(new Uint8Array(arrayBuffer));

          const ocrPayload: {
            base64Data?: string;
            fileName?: string;
            mimeType?: string;
          } = {
            base64Data: base64,
            fileName: file.name,
            mimeType: file.type,
          };
          setProgress(fileProgressStart + fileProgressRange * 0.2);

          // OCR Processing
          setStep("ocr");
          setStatusMessage(
            `Extracting text from ${file.name} (${i + 1}/${totalFiles})...`,
          );

          const ocrResponse = await fetch("/api/ocr/process", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              ...ocrPayload,
              includeImages: false,
              mistralKey: keys.mistralKey,
            }),
          });

          if (!ocrResponse.ok) {
            const errorMsg = await extractErrorMessage(
              ocrResponse,
              "OCR processing failed",
            );
            throw new Error(`${file.name}: ${errorMsg}`);
          }

          const ocrResult: OCRProcessResult = await ocrResponse.json();

          combinedMarkdown = ocrResult.markdown;
          combinedTotalPages = ocrResult.totalPages;

          totalPagesProcessed += combinedTotalPages;
          setProgress(fileProgressStart + fileProgressRange * 0.4);

          // Step 3: AI Summarization - Extract all notes (only for non-chunked files)
          setStep("summarizing");
          setStatusMessage(
            `Extracting notes from ${file.name} (${i + 1}/${totalFiles})...`,
          );

          const summarizeResponse = await fetch("/api/ocr/summarize", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              markdown: combinedMarkdown,
              focus: ["all"],
              customInstructions,
              model: getSelectedModel().model,
              provider: getSelectedModel().provider,
              maxTokens: maxOutputTokens,
              openRouterKey: keys.openRouterKey,
              deepseekKey: keys.deepseekKey,
              mistralKey: keys.mistralKey,
              googleKey: keys.googleKey,
              deepinfraKey: keys.deepinfraKey,
            }),
          });

          if (!summarizeResponse.ok) {
            const errorMsg = await extractErrorMessage(
              summarizeResponse,
              "Note extraction failed",
            );
            throw new Error(`${file.name}: ${errorMsg}`);
          }

          const summarizeResult = await summarizeResponse.json();
          allLore.push(...(summarizeResult.lore || []));
          allMechanicNotes.push(...(summarizeResult.mechanicNotes || []));
          allCustomTables.push(...(summarizeResult.customTables || []));
          setProgress(fileProgressEnd);
        }
      }

      // Step 4: Complete
      setStep("complete");
      setStatusMessage("Import complete!");
      setProgress(100);

      // Prepare import data
      const importData = {
        lore: allLore,
        mechanicNotes: allMechanicNotes,
        customTables: allCustomTables,
        summary: `Imported from ${totalFiles} file${totalFiles > 1 ? "s" : ""}`,
      };

      // Save to localStorage for recovery
      saveImport(importData);

      // Call the callback with merged results from all files
      onImportComplete(importData);

      // Show success notification
      const totalItems =
        allLore.length + allMechanicNotes.length + allCustomTables.length;
      addNotification(
        `Imported ${totalItems} items from ${totalPagesProcessed} pages across ${totalFiles} file${
          totalFiles > 1 ? "s" : ""
        } (~$${estimateOCRCostUSD(totalPagesProcessed).toFixed(3)} in OCR costs, paid to your own API key)`,
        "success",
      );

      // Show reminder about Saved Imports feature
      setTimeout(() => {
        addNotification(
          "💡 Tip: Your import is saved! Re-open the PDF Importer to access 'Saved Imports' anytime.",
          "success",
        );
      }, 2000);

      // Close modal after short delay
      setTimeout(() => {
        setIsOpen(false);
        resetState();
      }, 1500);
    } catch (error: any) {
      console.error("PDF import error:", error);
      setStep("error");
      setStatusMessage(error.message || "Import failed");
      addNotification(error.message || "PDF import failed", "failure");
    } finally {
      // No cleanup needed - files are processed entirely client-side/BYOK now
    }
  };

  const removeFile = (index: number) => {
    const file = selectedFiles[index];
    const filePages = Math.max(1, Math.ceil(file.size / (100 * 1024)));
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
    setPageCount((prev) => prev - filePages);
    setEstimatedCost((prev) => prev - estimateOCRCostUSD(filePages));
  };

  const resetState = () => {
    setStep("idle");
    setProgress(0);
    setStatusMessage("");
    setSelectedFiles([]);
    setEstimatedCost(0);
    setPageCount(0);
    setCurrentFileIndex(0);
    setChunkStatuses([]);
    setShowChunkDetails(false);
    setRepairModalOpen(false);
    setRepairChunkIndex(null);
    setRepairContent("");
    setRepairError("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const getStepIcon = () => {
    switch (step) {
      case "uploading":
        return "Upload";
      case "ocr":
        return "ScanText";
      case "summarizing":
        return "BookOpen";
      case "complete":
        return "CheckCircle";
      case "error":
        return "XCircle";
      default:
        return "FileText";
    }
  };

  const getStepColor = () => {
    switch (step) {
      case "complete":
        return "text-green-400";
      case "error":
        return "text-red-400";
      default:
        return "text-blue-400";
    }
  };

  // Compact button mode
  if (compact && !isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="mx-auto px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors flex items-center gap-2"
      >
        <DynamicIcon name="FileUp" className="w-4 h-4" />
        {buttonText}
      </button>
    );
  }

  return (
    <>
      {/* Trigger Button */}
      {!compact && (
        <button
          onClick={() => setIsOpen(true)}
          className="w-full p-4 bg-linear-to-r from-purple-900/30 to-blue-900/30 hover:from-purple-800/40 hover:to-blue-800/40 border border-purple-700/50 rounded-lg transition-all flex items-center gap-3"
        >
          <div className="w-12 h-12 rounded-full bg-purple-600/30 flex items-center justify-center">
            <DynamicIcon name="FileUp" className="w-6 h-6 text-purple-300" />
          </div>
          <div className="text-left flex-1">
            <h4 className="font-semibold text-white">{buttonText}</h4>
            <p className="text-sm text-blue-300/60">
              Import notes from RPG PDFs using AI-powered OCR
            </p>
          </div>
          <DynamicIcon
            name="ChevronRight"
            className="w-5 h-5 text-purple-400"
          />
        </button>
      )}

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-blue-950 border border-blue-700/50 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-blue-700/40">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-purple-600/30 flex items-center justify-center">
                  <DynamicIcon
                    name="FileUp"
                    className="w-5 h-5 text-purple-300"
                  />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">
                    Import from PDF
                  </h3>
                  <p className="text-sm text-blue-300/60">
                    Extract notes from RPG rulebooks & adventures
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsOpen(false);
                  resetState();
                }}
                className="p-2 hover:bg-blue-800/50 rounded-lg transition-colors"
              >
                <DynamicIcon name="X" className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            {/* Content */}
            <div className="p-4 space-y-4">
              {/* Processing State */}
              {step !== "idle" && step !== "error" && (
                <div className="bg-blue-900/30 rounded-lg p-4 border border-blue-700/40">
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`animate-pulse ${getStepColor()}`}>
                      <DynamicIcon name={getStepIcon()} className="w-6 h-6" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-white">
                        {step === "uploading" && "Step 1/3: Uploading"}
                        {step === "ocr" && "Step 2/3: Text Extraction"}
                        {step === "summarizing" && "Step 3/3: Creating Notes"}
                        {step === "complete" && "✓ Import Complete"}
                      </p>
                      <p className="text-sm text-blue-300/70 mt-0.5">
                        {statusMessage}
                      </p>
                      <p className="text-xs text-blue-300/50 mt-1">
                        {step === "uploading" &&
                          "Uploading your PDF to secure storage..."}
                        {step === "ocr" &&
                          `Running OCR on ${pageCount} page${
                            pageCount !== 1 ? "s" : ""
                          }...`}
                        {step === "summarizing" &&
                          "AI is creating lore, mechanics, and character sheet notes..."}
                        {step === "complete" &&
                          "Ready to use your imported content!"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-purple-300">
                        {Math.round(progress)}%
                      </p>
                    </div>
                  </div>
                  <div className="w-full bg-blue-900/50 rounded-full h-2.5">
                    <div
                      className="bg-linear-to-r from-purple-500 to-blue-500 h-2.5 rounded-full transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-blue-300/40 mt-1">
                    <span>Upload</span>
                    <span>OCR</span>
                    <span>Notes</span>
                  </div>
                </div>
              )}

              {/* Chunk Details Panel - Shows status of individual chunks */}
              {chunkStatuses.length > 0 &&
                (step === "summarizing" ||
                  step === "complete" ||
                  step === "error" ||
                  chunkStatuses.some((cs) => cs.status === "failed")) && (
                  <div className="bg-blue-900/20 rounded-lg border border-blue-700/40 overflow-hidden">
                    <button
                      onClick={() => setShowChunkDetails(!showChunkDetails)}
                      className="w-full px-4 py-3 flex items-center justify-between hover:bg-blue-900/30 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <DynamicIcon
                          name="Layers"
                          className="w-4 h-4 text-blue-400"
                        />
                        <span className="text-sm font-medium text-blue-200">
                          Chunk Status (
                          {
                            chunkStatuses.filter(
                              (cs) => cs.status === "complete",
                            ).length
                          }
                          /{chunkStatuses.length} complete)
                        </span>
                        {chunkStatuses.some((cs) => cs.status === "failed") && (
                          <span className="px-2 py-0.5 bg-red-900/50 text-red-300 text-xs rounded-full">
                            {
                              chunkStatuses.filter(
                                (cs) => cs.status === "failed",
                              ).length
                            }{" "}
                            failed
                          </span>
                        )}
                      </div>
                      <DynamicIcon
                        name={showChunkDetails ? "ChevronUp" : "ChevronDown"}
                        className="w-4 h-4 text-blue-400"
                      />
                    </button>

                    {showChunkDetails && (
                      <div className="p-3 pt-0 space-y-2 max-h-60 overflow-y-auto">
                        {chunkStatuses.map((chunk) => (
                          <div
                            key={chunk.chunkIndex}
                            className={`flex items-center gap-3 p-2 rounded-lg ${
                              chunk.status === "complete"
                                ? "bg-green-900/20 border border-green-700/30"
                                : chunk.status === "failed"
                                  ? "bg-red-900/20 border border-red-700/30"
                                  : chunk.status === "summarizing" ||
                                      chunk.status === "ocr"
                                    ? "bg-blue-900/30 border border-blue-700/30"
                                    : "bg-gray-900/20 border border-gray-700/30"
                            }`}
                          >
                            <div className="shrink-0">
                              {chunk.status === "complete" && (
                                <DynamicIcon
                                  name="CheckCircle"
                                  className="w-5 h-5 text-green-400"
                                />
                              )}
                              {chunk.status === "failed" && (
                                <DynamicIcon
                                  name="XCircle"
                                  className="w-5 h-5 text-red-400"
                                />
                              )}
                              {(chunk.status === "summarizing" ||
                                chunk.status === "ocr") && (
                                <DynamicIcon
                                  name="Loader2"
                                  className="w-5 h-5 text-blue-400 animate-spin"
                                />
                              )}
                              {chunk.status === "pending" && (
                                <DynamicIcon
                                  name="Clock"
                                  className="w-5 h-5 text-gray-400"
                                />
                              )}
                            </div>

                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-white">
                                Chunk {chunk.chunkIndex + 1}: Pages{" "}
                                {chunk.pageStart}-{chunk.pageEnd}
                              </p>
                              {chunk.status === "complete" && chunk.result && (
                                <p className="text-xs text-green-300/70">
                                  {chunk.result.lore.length} lore,{" "}
                                  {chunk.result.mechanicNotes.length} mechanics,{" "}
                                  {chunk.result.customTables.length} tables
                                </p>
                              )}
                              {chunk.status === "failed" && chunk.error && (
                                <p
                                  className="text-xs text-red-300/70 truncate"
                                  title={chunk.error}
                                >
                                  {chunk.error}
                                </p>
                              )}
                              {chunk.status === "summarizing" && (
                                <p className="text-xs text-blue-300/70">
                                  Creating notes...
                                </p>
                              )}
                              {chunk.status === "ocr" && (
                                <p className="text-xs text-blue-300/70">
                                  Extracting text...
                                </p>
                              )}
                            </div>

                            {/* Actions for failed chunks */}
                            {chunk.status === "failed" && (
                              <div className="flex gap-1 shrink-0">
                                <button
                                  onClick={() => retryChunk(chunk.chunkIndex)}
                                  className="px-2 py-1 text-xs bg-blue-600/80 hover:bg-blue-600 text-white rounded transition-colors flex items-center gap-1"
                                  title="Retry this chunk"
                                >
                                  <DynamicIcon
                                    name="RefreshCw"
                                    className="w-3 h-3"
                                  />
                                  Retry
                                </button>
                                {chunk.rawSummarizeOutput && (
                                  <button
                                    onClick={() =>
                                      openRepairModal(chunk.chunkIndex)
                                    }
                                    className="px-2 py-1 text-xs bg-amber-600/80 hover:bg-amber-600 text-white rounded transition-colors flex items-center gap-1"
                                    title="Manually fix JSON"
                                  >
                                    <DynamicIcon
                                      name="Wrench"
                                      className="w-3 h-3"
                                    />
                                    Fix
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        ))}

                        {/* Complete with current results button */}
                        {chunkStatuses.some((cs) => cs.status === "failed") &&
                          chunkStatuses.some(
                            (cs) => cs.status === "complete",
                          ) && (
                            <div className="pt-2 border-t border-blue-700/30">
                              <button
                                onClick={completeWithCurrentResults}
                                className="w-full px-4 py-2 bg-linear-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
                              >
                                <DynamicIcon
                                  name="Download"
                                  className="w-4 h-4"
                                />
                                Complete Import with{" "}
                                {
                                  chunkStatuses.filter(
                                    (cs) => cs.status === "complete",
                                  ).length
                                }{" "}
                                Chunks
                              </button>
                              <p className="text-xs text-blue-300/50 text-center mt-1">
                                Skip{" "}
                                {
                                  chunkStatuses.filter(
                                    (cs) => cs.status === "failed",
                                  ).length
                                }{" "}
                                failed chunk
                                {chunkStatuses.filter(
                                  (cs) => cs.status === "failed",
                                ).length !== 1
                                  ? "s"
                                  : ""}
                              </p>
                            </div>
                          )}
                      </div>
                    )}
                  </div>
                )}

              {/* Error State */}
              {step === "error" && (
                <div className="bg-red-900/30 rounded-lg p-4 border border-red-700/40">
                  <div className="flex items-center gap-3">
                    <DynamicIcon
                      name="XCircle"
                      className="w-6 h-6 text-red-400"
                    />
                    <div className="flex-1">
                      <p className="font-medium text-red-300">
                        {statusMessage}
                      </p>
                      <button
                        onClick={resetState}
                        className="text-sm text-red-400 hover:text-red-300 underline mt-1"
                      >
                        Try again
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* File Selection */}
              {step === "idle" && (
                <>
                  {/* Drop Zone */}
                  <div
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all ${
                      selectedFiles.length > 0
                        ? "border-green-500/50 bg-green-900/20"
                        : "border-blue-700/50 hover:border-purple-500/50 hover:bg-purple-900/20"
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.md"
                      onChange={handleFileSelect}
                      multiple
                      className="hidden"
                    />
                    <div className="space-y-2">
                      <DynamicIcon
                        name={selectedFiles.length > 0 ? "FilePlus" : "Upload"}
                        className={`w-10 h-10 mx-auto ${
                          selectedFiles.length > 0
                            ? "text-green-400"
                            : "text-blue-400"
                        }`}
                      />
                      <p className="font-medium text-white">
                        {selectedFiles.length > 0
                          ? "Drop more files or click to add"
                          : "Drop your PDFs here or click to browse"}
                      </p>
                      <p className="text-sm text-blue-300/60">
                        Supports multiple files • PDF, PNG, JPEG, WebP • Max{" "}
                        {MAX_PDF_SIZE_MB}MB each
                      </p>
                    </div>
                  </div>

                  {/* Selected Files List */}
                  {selectedFiles.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-blue-200">
                          Selected Files ({selectedFiles.length})
                        </p>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedFiles([]);
                            setEstimatedCost(0);
                            setPageCount(0);
                            if (fileInputRef.current)
                              fileInputRef.current.value = "";
                          }}
                          className="text-xs text-red-400 hover:text-red-300"
                        >
                          Clear all
                        </button>
                      </div>
                      <div className="max-h-40 overflow-y-auto space-y-1">
                        {selectedFiles.map((file, index) => {
                          const filePages = Math.max(
                            1,
                            Math.ceil(file.size / (100 * 1024)),
                          );
                          return (
                            <div
                              key={`${file.name}-${index}`}
                              className="flex items-center gap-2 p-2 bg-blue-900/30 rounded-lg group"
                            >
                              <DynamicIcon
                                name="FileText"
                                className="w-4 h-4 text-blue-400 shrink-0"
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-white truncate">
                                  {file.name}
                                </p>
                                <p className="text-xs text-blue-300/60">
                                  {(file.size / 1024 / 1024).toFixed(2)} MB • ~
                                  {filePages} pages
                                </p>
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeFile(index);
                                }}
                                className="p-1 hover:bg-red-900/30 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <DynamicIcon
                                  name="X"
                                  className="w-4 h-4 text-red-400"
                                />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                      <p className="text-xs text-blue-300/60 text-right">
                        Total: ~{pageCount} pages
                      </p>
                    </div>
                  )}

                  {/* Cost Estimate */}
                  {selectedFiles.length > 0 && (
                    <div className="bg-amber-900/20 border border-amber-700/40 rounded-lg p-3 flex items-center gap-3">
                      <DynamicIcon
                        name="DollarSign"
                        className="w-5 h-5 text-amber-400"
                      />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-amber-200">
                          Estimated OCR cost: ~${estimatedCost.toFixed(3)}
                        </p>
                        <p className="text-xs text-amber-300/60">
                          BYOK: paid directly to your Mistral API key. AI
                          summarization costs extra via your selected model.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* AI Model Selection */}
                  <div>
                    <label className="block text-sm font-semibold text-blue-200 mb-1">
                      AI Model for Summarization
                    </label>
                    <p className="text-xs text-blue-300/50 mb-1.5">
                      BYOK only - add a provider key in Settings to unlock its
                      models.
                    </p>
                    <select
                      value={aiModel}
                      onChange={(e) => setAIModel(e.target.value)}
                      className="w-full px-3 py-2 bg-blue-900/30 border border-blue-700/40 rounded-lg text-white"
                    >
                      {(Object.keys(PROVIDER_LABELS) as BYOKProvider[]).map(
                        (provider) => {
                          if (!keys[PROVIDER_KEY_FIELD[provider]]) return null;
                          const models = MODELS_BY_PROVIDER[provider];
                          if (models.length === 0) return null;
                          return (
                            <optgroup
                              key={provider}
                              label={PROVIDER_LABELS[provider]}
                            >
                              {models.map((m) => (
                                <option key={m.model} value={m.model}>
                                  {m.name}
                                </option>
                              ))}
                            </optgroup>
                          );
                        },
                      )}
                      <optgroup label="Custom">
                        <option value="custom-model">
                          Custom Model (any provider)
                        </option>
                      </optgroup>
                    </select>
                    {!Object.values(PROVIDER_KEY_FIELD).some(
                      (field) => keys[field],
                    ) && (
                      <p className="text-xs text-amber-400/80 mt-1">
                        No API keys configured yet - add one in Settings to
                        pick a model.
                      </p>
                    )}
                    {aiModel === "custom-model" && (
                      <div className="mt-2 space-y-2">
                        <select
                          value={customModelProvider}
                          onChange={(e) =>
                            setCustomModelProvider(
                              e.target.value as BYOKProvider,
                            )
                          }
                          className="w-full px-3 py-2 bg-blue-900/30 border border-blue-700/40 rounded-lg text-white"
                        >
                          {(
                            Object.keys(PROVIDER_LABELS) as BYOKProvider[]
                          ).map((provider) => (
                            <option key={provider} value={provider}>
                              {PROVIDER_LABELS[provider]}
                              {!keys[PROVIDER_KEY_FIELD[provider]]
                                ? " (no key set)"
                                : ""}
                            </option>
                          ))}
                        </select>
                        <input
                          type="text"
                          value={customModelId}
                          onChange={(e) => setCustomModelId(e.target.value)}
                          placeholder="Model ID, e.g. anthropic/claude-opus-4.1"
                          className="w-full px-3 py-2 bg-blue-900/30 border border-blue-700/40 rounded-lg text-white placeholder-blue-300/50"
                        />
                      </div>
                    )}
                  </div>

                  {/* Advanced Options */}
                  <div className="border border-blue-700/40 rounded-lg">
                    <button
                      onClick={() => setShowAdvanced(!showAdvanced)}
                      className="w-full px-4 py-3 flex items-center justify-between hover:bg-blue-900/20 rounded-lg transition-colors"
                    >
                      <span className="text-sm font-medium text-blue-200">
                        Advanced Options
                      </span>
                      <DynamicIcon
                        name={showAdvanced ? "ChevronUp" : "ChevronDown"}
                        className="w-4 h-4 text-blue-400"
                      />
                    </button>
                    {showAdvanced && (
                      <div className="p-4 pt-0 space-y-4">
                        {/* Max Output Tokens Slider */}
                        <div>
                          <label className="block text-sm font-semibold text-blue-200 mb-1">
                            Max Output Size: {maxOutputTokens.toLocaleString()}{" "}
                            tokens
                          </label>
                          <input
                            type="range"
                            min={4000}
                            max={getModelMaxOutput()}
                            step={1000}
                            value={maxOutputTokens}
                            onChange={(e) =>
                              setMaxOutputTokens(Number(e.target.value))
                            }
                            className="w-full h-2 bg-blue-900/50 rounded-lg appearance-none cursor-pointer accent-purple-500"
                          />
                          <div className="flex justify-between text-xs text-blue-300/60 mt-1">
                            <span>4K (Fast)</span>
                            <span>
                              {(getModelMaxOutput() / 1000).toFixed(0)}K (Max)
                            </span>
                          </div>
                          <p className="text-xs text-blue-300/60 mt-1">
                            Higher values extract more content but take longer.
                            Increase if content is being cut off.
                          </p>
                        </div>

                        {/* Custom Instructions */}
                        <div>
                          <label className="block text-sm font-semibold text-blue-200 mb-1">
                            Custom Instructions (optional)
                          </label>
                          <textarea
                            value={customInstructions}
                            onChange={(e) =>
                              setCustomInstructions(e.target.value)
                            }
                            placeholder="e.g., Focus on monster stat blocks, ignore fluff text..."
                            rows={3}
                            className="w-full px-3 py-2 bg-blue-900/30 border border-blue-700/40 rounded-lg text-white resize-none"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Saved Imports Section */}
                  {savedImports.length > 0 && (
                    <div className="border border-green-700/40 rounded-lg overflow-hidden">
                      <button
                        onClick={() => setShowSavedImports(!showSavedImports)}
                        className="w-full px-4 py-3 flex items-center justify-between bg-green-900/20 hover:bg-green-900/30 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <DynamicIcon
                            name="History"
                            className="w-4 h-4 text-green-400"
                          />
                          <span className="text-sm font-medium text-green-200">
                            Saved Imports ({savedImports.length})
                          </span>
                        </div>
                        <DynamicIcon
                          name={showSavedImports ? "ChevronUp" : "ChevronDown"}
                          className="w-4 h-4 text-green-400"
                        />
                      </button>
                      {showSavedImports && (
                        <div className="p-3 space-y-2 max-h-80 overflow-y-auto bg-green-900/10">
                          {savedImports.map((imp) => {
                            const totalNotes =
                              imp.lore.length + imp.mechanicNotes.length;
                            const isExpanded = expandedImport === imp.id;
                            return (
                              <div
                                key={imp.id}
                                className="bg-blue-900/30 rounded-lg border border-blue-700/40 overflow-hidden"
                              >
                                {/* Import Header */}
                                <div
                                  onClick={() =>
                                    setExpandedImport(
                                      isExpanded ? null : imp.id,
                                    )
                                  }
                                  className="flex items-center gap-3 p-3 cursor-pointer hover:bg-blue-800/30 transition-colors"
                                >
                                  <DynamicIcon
                                    name="FileText"
                                    className="w-5 h-5 text-green-400 shrink-0"
                                  />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-white truncate">
                                      {imp.fileName}
                                    </p>
                                    <p className="text-xs text-blue-300/60">
                                      {new Date(
                                        imp.timestamp,
                                      ).toLocaleDateString()}{" "}
                                      • {totalNotes} notes •{" "}
                                      {imp.customTables.length} tables
                                    </p>
                                  </div>
                                  <DynamicIcon
                                    name={
                                      isExpanded ? "ChevronUp" : "ChevronDown"
                                    }
                                    className="w-4 h-4 text-blue-400 shrink-0"
                                  />
                                </div>

                                {/* Expanded Content */}
                                {isExpanded && (
                                  <div className="px-3 pb-3 space-y-3 border-t border-blue-700/30">
                                    {/* Lore Preview */}
                                    {imp.lore.length > 0 && (
                                      <div className="mt-3">
                                        <p className="text-xs font-semibold text-blue-300 mb-1">
                                          📚 Lore ({imp.lore.length})
                                        </p>
                                        <div className="space-y-1 max-h-24 overflow-y-auto">
                                          {imp.lore.slice(0, 5).map((l, i) => (
                                            <p
                                              key={i}
                                              className="text-xs text-blue-200/80 truncate"
                                            >
                                              • {l.title}
                                            </p>
                                          ))}
                                          {imp.lore.length > 5 && (
                                            <p className="text-xs text-blue-300/50 italic">
                                              +{imp.lore.length - 5} more...
                                            </p>
                                          )}
                                        </div>
                                      </div>
                                    )}

                                    {/* Mechanics Preview */}
                                    {imp.mechanicNotes.length > 0 && (
                                      <div>
                                        <p className="text-xs font-semibold text-amber-300 mb-1">
                                          ⚙️ Mechanics (
                                          {imp.mechanicNotes.length})
                                        </p>
                                        <div className="space-y-1 max-h-24 overflow-y-auto">
                                          {imp.mechanicNotes
                                            .slice(0, 5)
                                            .map((m, i) => (
                                              <p
                                                key={i}
                                                className="text-xs text-amber-200/80 truncate"
                                              >
                                                • {m.title}
                                              </p>
                                            ))}
                                          {imp.mechanicNotes.length > 5 && (
                                            <p className="text-xs text-amber-300/50 italic">
                                              +{imp.mechanicNotes.length - 5}{" "}
                                              more...
                                            </p>
                                          )}
                                        </div>
                                      </div>
                                    )}

                                    {/* Tables Preview */}
                                    {imp.customTables.length > 0 && (
                                      <div>
                                        <p className="text-xs font-semibold text-purple-300 mb-1">
                                          🎲 Tables ({imp.customTables.length})
                                        </p>
                                        <div className="space-y-1">
                                          {imp.customTables
                                            .slice(0, 3)
                                            .map((t, i) => (
                                              <p
                                                key={i}
                                                className="text-xs text-purple-200/80 truncate"
                                              >
                                                • {t.name} ({t.entries.length}{" "}
                                                entries)
                                              </p>
                                            ))}
                                          {imp.customTables.length > 3 && (
                                            <p className="text-xs text-purple-300/50 italic">
                                              +{imp.customTables.length - 3}{" "}
                                              more...
                                            </p>
                                          )}
                                        </div>
                                      </div>
                                    )}

                                    {/* Action Buttons */}
                                    <div className="flex gap-2 pt-2 border-t border-blue-700/30">
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          useSavedImport(imp);
                                        }}
                                        className="flex-1 px-3 py-1.5 bg-green-600/80 hover:bg-green-600 text-white text-xs rounded-lg transition-colors flex items-center justify-center gap-1"
                                      >
                                        <DynamicIcon
                                          name="Download"
                                          className="w-3 h-3"
                                        />
                                        Use
                                      </button>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          deleteSavedImport(imp.id);
                                        }}
                                        className="px-3 py-1.5 bg-red-900/50 hover:bg-red-800/50 text-red-300 text-xs rounded-lg transition-colors"
                                      >
                                        <DynamicIcon
                                          name="Trash2"
                                          className="w-3 h-3"
                                        />
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-3 p-4 border-t border-blue-700/40">
              <button
                onClick={() => {
                  setIsOpen(false);
                  resetState();
                }}
                className="px-4 py-2 bg-blue-900/40 hover:bg-blue-800/50 text-white rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={processFiles}
                disabled={
                  selectedFiles.length === 0 ||
                  step !== "idle" ||
                  (aiModel === "custom-model" && !customModelId.trim())
                }
                className="px-4 py-2 bg-linear-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center gap-2"
              >
                <DynamicIcon name="Sparkles" className="w-4 h-4" />
                Start Import
              </button>
            </div>
          </div>
        </div>
      )}

      {/* JSON Repair Modal - for manually fixing broken chunk output */}
      {repairModalOpen && repairChunkIndex !== null && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-blue-950 border border-blue-700/50 rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-blue-700/30">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
                  <DynamicIcon
                    name="Wrench"
                    className="w-5 h-5 text-amber-400"
                  />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">
                    Fix JSON Output
                  </h3>
                  <p className="text-sm text-blue-300/60">
                    Chunk {repairChunkIndex + 1}: Pages{" "}
                    {
                      chunkStatuses.find(
                        (cs) => cs.chunkIndex === repairChunkIndex,
                      )?.pageStart
                    }
                    -
                    {
                      chunkStatuses.find(
                        (cs) => cs.chunkIndex === repairChunkIndex,
                      )?.pageEnd
                    }
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setRepairModalOpen(false);
                  setRepairChunkIndex(null);
                  setRepairContent("");
                  setRepairError("");
                }}
                className="p-2 text-blue-300/60 hover:text-white transition-colors"
              >
                <DynamicIcon name="X" className="w-5 h-5" />
              </button>
            </div>

            {/* Error message */}
            <div className="px-4 py-2 bg-red-900/20 border-b border-red-700/30">
              <p className="text-sm text-red-300">
                <span className="font-semibold">Error:</span> {repairError}
              </p>
              <p className="text-xs text-red-300/70 mt-1">
                The AI output couldn&apos;t be parsed. You can try to fix the
                JSON manually below.
              </p>
            </div>

            {/* Editor area */}
            <div className="flex-1 p-4 overflow-hidden flex flex-col min-h-0">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-blue-300/60">
                  Raw output ({repairContent.length.toLocaleString()} chars)
                </span>
                <button
                  onClick={() => {
                    try {
                      // Try to format JSON nicely
                      let jsonContent = repairContent.trim();
                      const jsonBlockMatch = jsonContent.match(
                        /```(?:json)?\s*([\s\S]*?)\s*```/,
                      );
                      if (jsonBlockMatch) {
                        jsonContent = jsonBlockMatch[1].trim();
                      }
                      jsonContent = jsonContent
                        .replace(/```json\s*/gi, "")
                        .replace(/```\s*/g, "");

                      const startIndex = jsonContent.indexOf("{");
                      const endIndex = jsonContent.lastIndexOf("}");
                      if (startIndex !== -1 && endIndex !== -1) {
                        jsonContent = jsonContent.slice(
                          startIndex,
                          endIndex + 1,
                        );
                      }

                      const parsed = JSON.parse(jsonContent);
                      setRepairContent(JSON.stringify(parsed, null, 2));
                    } catch {
                      addNotification(
                        "Cannot format - JSON is not valid. Try fixing the errors first.",
                        "warning",
                      );
                    }
                  }}
                  className="px-3 py-1 text-xs bg-blue-800/50 hover:bg-blue-700/50 text-blue-300 rounded transition-colors"
                >
                  Format JSON
                </button>
              </div>
              <textarea
                value={repairContent}
                onChange={(e) => setRepairContent(e.target.value)}
                className="flex-1 w-full min-h-[400px] bg-blue-900/30 border border-blue-700/30 rounded-lg p-3 font-mono text-sm text-blue-100 resize-y focus:outline-none focus:border-blue-500"
                placeholder="Paste or edit JSON content here..."
                spellCheck={false}
              />
            </div>

            {/* Footer with actions */}
            <div className="flex items-center justify-between p-4 border-t border-blue-700/30 bg-blue-900/20">
              <div className="text-xs text-blue-300/50">
                Tip: Look for missing commas, unclosed brackets, or truncated
                strings
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    try {
                      JSON.parse(repairContent);
                      addNotification("JSON is valid!", "success");
                    } catch (e) {
                      addNotification(
                        `Invalid JSON: ${
                          e instanceof Error ? e.message : "Parse error"
                        }`,
                        "warning",
                      );
                    }
                  }}
                  className="px-4 py-2 bg-blue-800/50 hover:bg-blue-700/50 text-blue-200 rounded-lg transition-colors"
                >
                  Validate
                </button>
                <button
                  onClick={() => {
                    setRepairModalOpen(false);
                    setRepairChunkIndex(null);
                    setRepairContent("");
                    setRepairError("");
                  }}
                  className="px-4 py-2 bg-blue-900/40 hover:bg-blue-800/50 text-white rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleRepairSave(repairContent)}
                  className="px-4 py-2 bg-linear-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white rounded-lg transition-colors"
                >
                  Save & Apply
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
