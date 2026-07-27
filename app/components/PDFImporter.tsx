"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useNotification } from "@/app/misc/NotificationContext";
import { useAPIKeys, APIKeys } from "@/app/misc/APIKeysContext";
import { DynamicIcon } from "@/app/components/DynamicIcon";
import FullScreenView from "@/app/components/FullScreenView";
import {
  validateOCRFile,
  estimateOCRCostUSD,
  MAX_PDF_SIZE_MB,
  OCRProcessResult,
} from "@/app/misc/ocr";
import { ocrFetch } from "@/app/misc/ocrFetch";
import { OCRProcessRequestBody } from "@/app/misc/ocrCall";
import {
  OCRSummarizeRequestBody,
  OCRSummarizeEvent,
  OCRSummarizeSuccess,
  OCRSummarizeError,
  DEFAULT_MAX_CONTINUATION_ROUNDS,
  processParserResult,
} from "@/app/misc/ocrSummarizeCall";
import { streamSummarizeOCR } from "@/app/misc/ocrSummarizeStream";
import {
  PartialExtraction,
  emptyPartialExtraction,
  mergePartialExtraction,
  parsePartialExtraction,
  countPartialExtraction,
} from "@/app/misc/partialNotes";
import ExtractionPreview from "@/app/components/pdf-import/ExtractionPreview";
import { StoryLore, CustomTable } from "@/app/misc/structs";
import { AI_MODELS } from "@/app/misc/ai_prices";
import { mergeExtractedContent } from "@/app/misc/ocrMerge";
import { stripImagesFromPDF } from "@/app/misc/pdfImageStrip";
import { PDFDocument } from "pdf-lib";
import {
  LocalPDFImport,
  FailedPageRange,
  InProgressPDFImport,
  PersistedChunkStatus,
  InProgressPDFImportSettings,
  listPDFImports,
  savePDFImport,
  deletePDFImport,
  migrateFromLocalStorage,
  saveImportInProgress,
  getImportInProgress,
  clearImportInProgress,
} from "@/app/misc/localPDFImportManager";

// Maximum size per PDF chunk for Mistral OCR (in MB)
const MAX_CHUNK_SIZE_MB = 4;
// Pages per chunk (approximate, will be adjusted based on actual size).
// Bigger chunks mean a topic split across pages is less likely to land on a
// chunk boundary (see ocrMerge.ts for the post-import cleanup pass that
// handles the cases this doesn't prevent), but can't grow much further
// without pushing into the OCR payload/summarize-prompt limits below.
const PAGES_PER_CHUNK = 20;
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
// How long a summarize stream may go silent before it counts as dead. This
// is an *idle* timeout, not a cap on the whole extraction: a whole rulebook
// takes several minutes of continuous streaming, and a wall-clock cap kills
// a perfectly healthy extraction and restarts it from nothing.
const SUMMARIZE_IDLE_TIMEOUT_MS = 90000;
// Timeout per OCR upload attempt (4 minutes - server allows 5). Large,
// image-heavy chunks can legitimately take Mistral several minutes.
const OCR_TIMEOUT_MS = 240000;
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

// Persisted "AI Model" + "Advanced Options" form state, so the importer
// remembers your last choices instead of resetting to these defaults every
// time the modal is reopened.
interface PDFImporterSettings {
  aiModel: string;
  customModelProvider: BYOKProvider;
  customModelId: string;
  customInstructions: string;
  maxOutputTokens: number;
  maxContinuationRounds: number;
  mergeDuplicates: boolean;
}

const DEFAULT_PDF_IMPORTER_SETTINGS: PDFImporterSettings = {
  aiModel: "ministral-14b-2512",
  customModelProvider: "openrouter",
  customModelId: "",
  customInstructions: "",
  maxOutputTokens: 16000,
  maxContinuationRounds: DEFAULT_MAX_CONTINUATION_ROUNDS,
  mergeDuplicates: true,
};

// Ceiling for the continuation-rounds slider. Each round re-sends the source
// document, so this caps API spend as much as it caps thoroughness.
const MAX_CONTINUATION_ROUNDS_LIMIT = 15;

const PDF_IMPORTER_SETTINGS_KEY = "pdfImporterSettings";

function loadPDFImporterSettings(): PDFImporterSettings {
  if (typeof window === "undefined") return DEFAULT_PDF_IMPORTER_SETTINGS;
  try {
    const raw = localStorage.getItem(PDF_IMPORTER_SETTINGS_KEY);
    if (!raw) return DEFAULT_PDF_IMPORTER_SETTINGS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_PDF_IMPORTER_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_PDF_IMPORTER_SETTINGS;
  }
}

/**
 * Resolve a settings snapshot to the actual (model, provider) pair to call.
 * Pulled out as a pure function (rather than reading component state
 * directly) so it can be applied identically to the live form state and to
 * a settings snapshot recovered from an interrupted/resumed import.
 */
function resolveModelSelection(settings: {
  aiModel: string;
  // Accepts plain `string` (not just BYOKProvider) so a settings snapshot
  // deserialized from IndexedDB/localStorage - which can't reference this
  // component's type - can be passed straight through.
  customModelProvider: string;
  customModelId: string;
}): { model: string; provider: BYOKProvider } {
  if (settings.aiModel === "custom-model") {
    return {
      model: settings.customModelId.trim(),
      provider: settings.customModelProvider as BYOKProvider,
    };
  }
  const cfg = Object.values(AI_MODELS).find(
    (m) => m.model === settings.aiModel,
  );
  return {
    model: settings.aiModel,
    provider: (cfg?.provider as BYOKProvider) || "openrouter",
  };
}

/**
 * Create a concurrency-limited task runner ("semaphore"): at most
 * `concurrency` tasks submitted through the returned function are in
 * flight at once. Unlike batching (waiting for a whole group of N tasks to
 * finish before starting the next N), a new task is admitted the instant a
 * slot frees up - a fast task never sits blocked behind a slow sibling
 * from the same batch. This is what lets independent limiters (e.g. one for
 * OCR uploads, one for summarize calls) run concurrently with each other
 * while each still enforces its own cap.
 */
function createLimiter(concurrency: number) {
  let active = 0;
  const queue: (() => void)[] = [];

  function schedule() {
    if (active >= concurrency || queue.length === 0) return;
    active++;
    const runNext = queue.shift()!;
    runNext();
  }

  return function run<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      queue.push(() => {
        task()
          .then(resolve, reject)
          .finally(() => {
            active--;
            schedule();
          });
      });
      schedule();
    });
  };
}

/**
 * OCR fetch (via ocrFetch - web build proxies through our API routes,
 * standalone build calls the provider directly) with timeout and retry
 * support. Note extraction doesn't come through here: it streams, and
 * carries its own timeout/retry (see ocrSummarizeStream.ts).
 */
async function fetchWithRetry(
  path: "/api/ocr/process",
  body: OCRProcessRequestBody,
  timeoutMs: number = OCR_TIMEOUT_MS,
  maxRetries: number = MAX_RETRIES,
): Promise<Response> {
  let lastError: Error = new Error("Request failed after retries");

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    try {
      return await ocrFetch(path, body, controller.signal);
    } catch (error: any) {
      if (error.name === "AbortError") {
        // Only aborts fired by our own timeout timer are retryable; any
        // other AbortError came from outside (user cancelled) and must
        // propagate immediately.
        if (!timedOut) {
          throw error;
        }
        lastError = new Error(`Request timed out after ${timeoutMs / 1000}s`);
      } else {
        lastError = error;
      }

      // Wait before retry (exponential backoff)
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
        console.log(
          `Request failed (${lastError.message}), retrying in ${delay}ms (attempt ${
            attempt + 1
          }/${maxRetries})...`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError;
}

// How often the live note preview is refreshed while the model writes.
// Deltas arrive far faster than anyone can read, and a dozen chunks stream
// at once, so re-parsing and re-rendering on every token would burn the
// frame budget for no visible gain.
const LIVE_UPDATE_INTERVAL_MS = 120;

/**
 * Turns a summarize stream into a live view of the notes as they're
 * written.
 *
 * Each round of an extraction is its own self-contained JSON object (see
 * ocrSummarizeCall.ts), so the buffer is parsed leniently while a round is
 * in flight and folded into the committed result the moment the next round
 * starts - the same title-keyed merge the server does, so an entry re-sent
 * in full after being cut off replaces the short version rather than
 * appearing twice.
 */
function createLiveTracker(onUpdate: (live: PartialExtraction) => void) {
  let committed = emptyPartialExtraction();
  let buffer = "";
  let raw = "";
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const flush = () => {
    timer = null;
    if (stopped) return;
    onUpdate(mergePartialExtraction(committed, parsePartialExtraction(buffer)));
  };

  const schedule = () => {
    if (timer !== null || stopped) return;
    timer = setTimeout(flush, LIVE_UPDATE_INTERVAL_MS);
  };

  const commitRound = () => {
    if (!buffer) return;
    committed = mergePartialExtraction(
      committed,
      parsePartialExtraction(buffer),
    );
    buffer = "";
  };

  return {
    onEvent(event: OCRSummarizeEvent) {
      if (event.type === "delta") {
        buffer += event.text;
        raw += event.text;
      } else {
        commitRound();
      }
      schedule();
    },
    /** A retry restarts the extraction from scratch - drop what we had. */
    reset() {
      committed = emptyPartialExtraction();
      buffer = "";
      raw = "";
      schedule();
    },
    /** The model's raw output, for the manual JSON-repair flow. */
    getRaw: () => raw,
    /**
     * Everything parsed out of the stream so far. Normally just a preview,
     * but it is also what survives a connection that drops mid-extraction -
     * see `summarizeWithLive`.
     */
    getPartial: () =>
      mergePartialExtraction(committed, parsePartialExtraction(buffer)),
    stop() {
      stopped = true;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}

/**
 * Turn what a dropped stream managed to write into a usable (incomplete)
 * extraction, or null when nothing finished.
 *
 * Only entries the model actually finished count: a title with no content
 * (or the entry it was midway through when the connection died) would import
 * as an empty note. Everything that survives goes through the same
 * normaliser the server uses, so a salvaged note is shaped exactly like one
 * that came back over a healthy connection.
 */
function salvagePartialExtraction(
  partial: PartialExtraction,
): OCRSummarizeSuccess | null {
  const usableNotes = (notes: PartialExtraction["lore"]) =>
    notes.filter((note) => note.title.trim() && note.content.trim());
  const lore = usableNotes(partial.lore);
  const mechanicNotes = usableNotes(partial.mechanicNotes);
  const customTables = partial.customTables.filter(
    (table) => table.name.trim() && table.entries.length > 0,
  );

  if (lore.length + mechanicNotes.length + customTables.length === 0) {
    return null;
  }

  const processed = processParserResult({
    summary: partial.summary,
    lore,
    mechanicNotes,
    customTables,
  });
  return {
    success: true,
    ...processed,
    detectedContentType: "unknown",
    rawExtractedTables: 0,
    extractionRounds: 0,
    // The rest of the document never arrived, which is exactly what this
    // flag is for - the importer warns about it at the end.
    incomplete: true,
  };
}

/**
 * A response the model clearly wrote content into, that still yielded no
 * notes, is a parsing failure rather than an empty page range - and the one
 * case where offering the manual JSON-repair flow pays off. A genuinely
 * blank chunk writes almost nothing, so it stays a (empty) success.
 */
const UNPARSEABLE_OUTPUT_MIN_CHARS = 200;

function looksUnparseable(result: OCRSummarizeSuccess, raw: string): boolean {
  const extracted =
    result.lore.length + result.mechanicNotes.length + result.customTables.length;
  return extracted === 0 && raw.trim().length >= UNPARSEABLE_OUTPUT_MIN_CHARS;
}

// Maximum length of any error message we surface to the UI. Raw error
// bodies from the platform/CDN (e.g. a 413 "Request Entity Too Large" HTML
// page, or a stack trace) can be many KB of text - rendering that verbatim
// into a toast or a chunk status row is what visually breaks the modal and
// can hang memory-constrained mobile browsers trying to lay it out.
const MAX_ERROR_MESSAGE_LENGTH = 300;

/**
 * Sanitize a raw error string (which may be an HTML error page, a huge
 * stack trace, or arbitrary platform output) into a short, plain-text
 * message safe to render in the UI. Strips HTML tags, collapses
 * whitespace, and truncates to a fixed length.
 */
function sanitizeErrorMessage(raw: string, fallback: string): string {
  if (!raw) return fallback;

  let text = raw;
  // Detect and replace HTML error pages (e.g. Vercel/CDN 413 pages) with a
  // friendly message rather than trying to render markup as text.
  if (/<html|<!doctype html/i.test(text)) {
    return "The file or page is too large for the server to accept. Try a smaller file or fewer pages per chunk.";
  }
  // Strip any remaining tags defensively, then collapse whitespace.
  text = text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

  if (!text) return fallback;

  if (text.length > MAX_ERROR_MESSAGE_LENGTH) {
    text = `${text.slice(0, MAX_ERROR_MESSAGE_LENGTH)}…`;
  }

  return text;
}

/**
 * Extract an error message from a failed fetch Response. Reads the body as
 * text exactly once (a Response body stream can only be consumed once -
 * calling `.json()` and then falling back to `.text()` on parse failure
 * throws "body stream already read", since `.json()` already consumed the
 * stream even though `JSON.parse` failed).
 *
 * A 413 (Entity Too Large) response in particular often has no JSON body
 * at all - the platform/CDN rejects the request before it reaches our
 * handler - so that status is special-cased with a clear, actionable
 * message instead of falling through to whatever raw text came back.
 */
async function extractErrorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  if (response.status === 413) {
    return "File or page too large for the server to accept. Try a smaller file, or fewer pages per chunk.";
  }

  const text = await response.text();
  if (!text) return fallback;
  try {
    const parsed = JSON.parse(text);
    return sanitizeErrorMessage(parsed.error || "", fallback);
  } catch {
    return sanitizeErrorMessage(text, fallback);
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
 * Normalize a pasted document link into a form Mistral's OCR API can
 * fetch directly as `document_url`. Google Drive's "share" links point at
 * an HTML viewer page rather than the raw file, so a Drive share link is
 * rewritten into its direct-download form. Any other URL (Dropbox direct
 * links, self-hosted files, etc.) is passed through unchanged.
 */
function normalizeDocumentLink(url: string): string {
  const trimmed = url.trim();

  // Standard share link: https://drive.google.com/file/d/<id>/view?usp=...
  const fileMatch = trimmed.match(/drive\.google\.com\/file\/d\/([^/]+)/);
  if (fileMatch) {
    return `https://drive.google.com/uc?export=download&id=${fileMatch[1]}`;
  }

  // "open?id=<id>" link form.
  const openMatch = trimmed.match(/drive\.google\.com\/open\?id=([^&]+)/);
  if (openMatch) {
    return `https://drive.google.com/uc?export=download&id=${openMatch[1]}`;
  }

  return trimmed;
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
  arrayBuffer: ArrayBuffer,
  onProgress?: (message: string) => void,
): Promise<PDFChunkPlan> {
  onProgress?.("Loading PDF for splitting...");

  const pdfDoc = await PDFDocument.load(arrayBuffer, {
    ignoreEncryption: true,
  });
  const totalPages = pdfDoc.getPageCount();
  const fileSize = arrayBuffer.byteLength;

  // On memory-constrained devices (or for very large source files), use
  // smaller chunks so fewer pages (and less base64 data) need to be held
  // in memory at any one time.
  const lowMemory = needsConservativeMemoryMode(fileSize);
  const maxChunkSizeMB = lowMemory ? MAX_CHUNK_SIZE_MB / 2 : MAX_CHUNK_SIZE_MB;
  const maxPagesPerChunk = lowMemory
    ? Math.max(1, Math.floor(PAGES_PER_CHUNK / 2))
    : PAGES_PER_CHUNK;

  // Calculate how many pages per chunk based on file size
  const avgPageSize = fileSize / totalPages;
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
 * Extract a single chunk's page range into its own PDF document's bytes.
 */
async function buildPDFChunkBytes(
  pdfDoc: PDFDocument,
  range: PDFChunkRange,
): Promise<Uint8Array> {
  const chunkDoc = await PDFDocument.create();
  const pageIndicesToCopy = Array.from(
    { length: range.endIndex - range.startIndex + 1 },
    (_, i) => range.startIndex + i,
  );

  const copiedPages = await chunkDoc.copyPages(pdfDoc, pageIndicesToCopy);
  copiedPages.forEach((page) => chunkDoc.addPage(page));

  return chunkDoc.save();
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
  return bytesToBase64(await buildPDFChunkBytes(pdfDoc, range));
}

/**
 * Whether an OCR result is effectively blank - no text at all once the
 * `<!-- Page N -->` markers the OCR route interleaves between pages are
 * discarded. Used to tell "we recovered this page's text" apart from "this
 * page was pure image and there was never any text to recover".
 */
function isBlankOCRMarkdown(markdown: string): boolean {
  return markdown.replace(/<!--[\s\S]*?-->/g, "").trim().length === 0;
}

/**
 * Last-resort OCR for a single page whose PDF payload is over the upload
 * size limit: strip the page's embedded images and send just what's left.
 *
 * A single page can't be split any further, so without this the page is
 * simply lost from the import. Since OCR only reads text, a page that
 * carries a real text layer under full-bleed artwork loses nothing that
 * mattered by having the artwork removed - and the payload typically drops
 * by orders of magnitude.
 *
 * The one case this can't rescue is a pure scan, where the text *is* the
 * image: stripping leaves a blank page, so blank output is treated as a
 * failure (with the original "try a lower-resolution scan" advice) rather
 * than being imported as an empty page.
 */
async function ocrPageWithoutImages(
  pdfDoc: PDFDocument,
  range: PDFChunkRange,
  fileNameBase: string,
  mistralKey: string,
): Promise<{ markdown: string; totalPages: number }> {
  const tooLarge = `page ${range.pageStart} is too image-heavy to upload directly (exceeds the server's request size limit)`;

  let base64: string;
  let imagesRemoved: number;
  try {
    // Scoped so the source bytes and the stripped copy are both eligible
    // for collection before the (still multi-MB) base64 string is built.
    const stripped = await stripImagesFromPDF(
      await buildPDFChunkBytes(pdfDoc, range),
    );
    imagesRemoved = stripped.imagesRemoved;
    base64 = imagesRemoved > 0 ? bytesToBase64(stripped.bytes) : "";
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "unknown error";
    throw new Error(
      `${tooLarge}, and removing its images failed too - ${message}. Try a lower-resolution scan of this page.`,
    );
  }

  if (imagesRemoved === 0) {
    throw new Error(
      `${tooLarge}, and it has no embedded images to remove - its size comes from vector art or fonts. Try a flattened, lower-resolution version of this page.`,
    );
  }

  if (base64.length > SAFE_BASE64_PAYLOAD_BYTES) {
    base64 = "";
    throw new Error(
      `${tooLarge} even after removing its ${imagesRemoved} image(s). Try a lower-resolution scan of this page.`,
    );
  }

  let response: Response;
  try {
    response = await fetchWithRetry(
      "/api/ocr/process",
      {
        base64Data: base64,
        fileName: `${fileNameBase}_page_${range.pageStart}_no_images.pdf`,
        mimeType: "application/pdf",
        includeImages: false,
        mistralKey,
      },
      OCR_TIMEOUT_MS,
    );
  } finally {
    base64 = "";
  }

  if (!response.ok) {
    const errorMsg = await extractErrorMessage(
      response,
      "OCR processing failed",
    );
    throw new Error(
      `page ${range.pageStart} (retried without images): ${errorMsg}`,
    );
  }

  const result: OCRProcessResult = await response.json();
  if (isBlankOCRMarkdown(result.markdown || "")) {
    throw new Error(
      `${tooLarge}. Removing its images left no text behind, so the page is a pure scan. Try a lower-resolution scan of this page.`,
    );
  }

  return {
    markdown: `<!-- page ${range.pageStart}: too large to upload, so its ${imagesRemoved} image(s) were removed and only its text layer was read -->\n${result.markdown}`,
    totalPages: result.totalPages,
  };
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
  if (base64.length > SAFE_BASE64_PAYLOAD_BYTES && pageCount === 1) {
    // Can't split a single page any further - sending it anyway would just
    // hit the platform's hard body-size limit and come back as a raw 413
    // ("Entity Too Large"). Strip the page's images and send what's left
    // instead; that recovers the text layer of an illustrated page, and
    // throws with actionable advice when there's no text to recover.
    base64 = "";
    return ocrPageWithoutImages(pdfDoc, range, fileNameBase, mistralKey);
  }
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
    // Use allSettled rather than Promise.all: a single too-image-heavy
    // page failing outright (see the pageCount === 1 branch above)
    // shouldn't discard OCR output already obtained for its sibling
    // half - the rest of the document should still complete, with the
    // failed sub-range's pages simply missing (and noted) from the
    // combined markdown.
    const [firstResult, secondResult] = await Promise.allSettled([
      ocrPDFRange(pdfDoc, firstRange, fileNameBase, mistralKey),
      ocrPDFRange(pdfDoc, secondRange, fileNameBase, mistralKey),
    ]);

    if (
      firstResult.status === "rejected" &&
      secondResult.status === "rejected"
    ) {
      throw firstResult.reason;
    }

    const parts: string[] = [];
    let totalPages = 0;
    for (const result of [firstResult, secondResult]) {
      if (result.status === "fulfilled") {
        parts.push(result.value.markdown);
        totalPages += result.value.totalPages;
      } else {
        const message =
          result.reason instanceof Error
            ? result.reason.message
            : "OCR failed for part of this range";
        parts.push(`<!-- ${message} -->`);
      }
    }

    return {
      markdown: parts.join("\n\n---\n\n"),
      totalPages,
    };
  }

  let response: Response;
  try {
    response = await fetchWithRetry(
      "/api/ocr/process",
      {
        base64Data: base64,
        fileName: `${fileNameBase}_pages_${range.pageStart}-${range.pageEnd}.pdf`,
        mimeType: "application/pdf",
        includeImages: false,
        mistralKey,
      },
      OCR_TIMEOUT_MS,
    );
  } finally {
    // Allow the (potentially multi-MB) base64 string to be garbage
    // collected as soon as the request body has been handed off.
    base64 = "";
  }

  if (!response.ok) {
    // A single page rejected as too large (413) is the same problem the
    // local size check above catches, just measured by the platform rather
    // than by us - JSON field overhead and a lower-than-expected platform
    // limit can both push a page over after it passed our own budget. Give
    // it the same image-stripping retry rather than losing the page.
    if (response.status === 413 && pageCount === 1) {
      return ocrPageWithoutImages(pdfDoc, range, fileNameBase, mistralKey);
    }
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
  /** Optional: mount with the modal already open, skipping the trigger button */
  startOpen?: boolean;
  /** Optional: called whenever the modal closes (cancel or completion) */
  onClose?: () => void;
}

/**
 * The pipeline as the user sees it, for the progress rail. The internal
 * step names are pipeline stages; these are what each one means for the
 * document in front of them.
 */
const PIPELINE_STAGES: {
  id: "uploading" | "ocr" | "summarizing";
  label: string;
  icon: string;
  hint: string;
}[] = [
  {
    id: "uploading",
    label: "Prepare",
    icon: "Upload",
    hint: "Reading the document and splitting it into chunks…",
  },
  {
    id: "ocr",
    label: "Read pages",
    icon: "ScanText",
    hint: "Running OCR over the pages…",
  },
  {
    id: "summarizing",
    label: "Write notes",
    icon: "BookOpen",
    hint: "Turning the text into lore, mechanics and tables…",
  },
];

type ProcessingStep =
  | "idle"
  | "uploading"
  | "ocr"
  | "summarizing"
  | "complete"
  | "error";

// Chunk status for tracking individual chunk processing. `chunkIndex` is
// only unique *within* a file (0-based page-range chunk, or always 0 for a
// file small enough to skip chunking) - `fileIndex` is what disambiguates
// entries across a multi-file import so two files' "chunk 0" don't collide
// in the shared `chunkStatuses` list below.
interface ChunkStatus {
  chunkIndex: number;
  fileIndex: number;
  fileName: string;
  pageStart: number;
  pageEnd: number;
  status: "pending" | "ocr" | "summarizing" | "complete" | "failed";
  ocrMarkdown?: string;
  rawSummarizeOutput?: string;
  error?: string;
  /**
   * Notes parsed out of the model's output while it is still being written
   * (see createLiveTracker). Replaced by `result` once the chunk finishes -
   * this is a preview, not what gets imported.
   */
  live?: PartialExtraction;
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
  startOpen = false,
  onClose,
}: PDFImporterProps) {
  const { keys } = useAPIKeys();
  const { addNotification } = useNotification();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isOpen, setIsOpen] = useState(startOpen);
  const closeModal = useCallback(() => {
    setIsOpen(false);
    onClose?.();
  }, [onClose]);
  const [step, setStep] = useState<ProcessingStep>("idle");
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [estimatedCost, setEstimatedCost] = useState(0);
  const [pageCount, setPageCount] = useState(0);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);

  // Import mode: upload a file directly, or point at a shareable link
  // (e.g. Google Drive) so Mistral fetches the document itself. Link mode
  // skips the client-side chunking pipeline entirely - it's a single OCR
  // call regardless of document size.
  const [importMode, setImportMode] = useState<"file" | "link">("file");
  const [linkUrl, setLinkUrl] = useState("");

  // AI model selection for summarization - initialized from the last
  // saved settings (see loadPDFImporterSettings) rather than a hardcoded
  // default, so the form remembers what you picked last time.
  const [aiModel, setAIModel] = useState(
    () => loadPDFImporterSettings().aiModel,
  );

  // Advanced options
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [customModelProvider, setCustomModelProvider] =
    useState<BYOKProvider>(() => loadPDFImporterSettings().customModelProvider);
  const [customModelId, setCustomModelId] = useState(
    () => loadPDFImporterSettings().customModelId,
  );
  const [customInstructions, setCustomInstructions] = useState(
    () => loadPDFImporterSettings().customInstructions,
  );
  const [maxOutputTokens, setMaxOutputTokens] = useState(
    () => loadPDFImporterSettings().maxOutputTokens,
  );
  // How many extra rounds the model gets to keep writing notes after a
  // response runs out of output length (see ocrSummarizeCall.ts). Each round
  // re-sends the source document, so more rounds means a more complete
  // import at a higher API cost; 0 keeps only what fits in one response.
  const [maxContinuationRounds, setMaxContinuationRounds] = useState(
    () => loadPDFImporterSettings().maxContinuationRounds,
  );
  // Post-import cleanup pass (see ocrMerge.ts) that merges lore/mechanic
  // entries fragmented or duplicated across chunk boundaries. On by default;
  // exposed as a toggle for users who want the raw per-chunk output
  // untouched (e.g. before using the manual JSON-repair flow).
  const [mergeDuplicates, setMergeDuplicates] = useState(
    () => loadPDFImporterSettings().mergeDuplicates,
  );

  // Persist the AI model + advanced options whenever they change, so they
  // survive closing/reopening the importer.
  useEffect(() => {
    const settings: PDFImporterSettings = {
      aiModel,
      customModelProvider,
      customModelId,
      customInstructions,
      maxOutputTokens,
      maxContinuationRounds,
      mergeDuplicates,
    };
    try {
      localStorage.setItem(
        PDF_IMPORTER_SETTINGS_KEY,
        JSON.stringify(settings),
      );
    } catch (e) {
      console.warn("Failed to save PDF importer settings:", e);
    }
  }, [
    aiModel,
    customModelProvider,
    customModelId,
    customInstructions,
    maxOutputTokens,
    maxContinuationRounds,
    mergeDuplicates,
  ]);

  const resetPDFImporterSettings = useCallback(() => {
    setAIModel(DEFAULT_PDF_IMPORTER_SETTINGS.aiModel);
    setCustomModelProvider(DEFAULT_PDF_IMPORTER_SETTINGS.customModelProvider);
    setCustomModelId(DEFAULT_PDF_IMPORTER_SETTINGS.customModelId);
    setCustomInstructions(DEFAULT_PDF_IMPORTER_SETTINGS.customInstructions);
    setMaxOutputTokens(DEFAULT_PDF_IMPORTER_SETTINGS.maxOutputTokens);
    setMaxContinuationRounds(
      DEFAULT_PDF_IMPORTER_SETTINGS.maxContinuationRounds,
    );
    setMergeDuplicates(DEFAULT_PDF_IMPORTER_SETTINGS.mergeDuplicates);
    addNotification("Reset to default AI model and settings", "success");
  }, [addNotification]);

  // Interrupted chunked import recovered from IndexedDB on mount, if any -
  // offered to the user as a "Resume" / "Discard" banner instead of being
  // silently lost.
  const [interruptedImport, setInterruptedImport] =
    useState<InProgressPDFImport | null>(null);
  const [isResuming, setIsResuming] = useState(false);

  // Saved imports
  const [savedImports, setSavedImports] = useState<SavedPDFImport[]>([]);
  const [showSavedImports, setShowSavedImports] = useState(false);
  const [expandedImport, setExpandedImport] = useState<string | null>(null);

  // Chunk tracking state - covers both page-range chunks of large PDFs and
  // (as of the multi-file preview fix) a single whole-file entry for files
  // small enough to skip chunking, so every file in a multi-file import
  // gets a row in the preview panel below.
  const [chunkStatuses, setChunkStatuses] = useState<ChunkStatus[]>([]);
  // Which half of the workspace panel is showing: the notes themselves
  // (default - it's what the import is for) or the per-chunk source list
  // with its retry/repair controls.
  const [workspaceTab, setWorkspaceTab] = useState<"notes" | "sources">(
    "notes",
  );
  // Which chunk currently has its live preview (raw OCR text and/or
  // extracted notes) expanded in the chunk status panel. `chunkIndex` alone
  // isn't unique across files (each file's chunks start at 0), so the
  // owning file is tracked alongside it.
  const [expandedChunkIndex, setExpandedChunkIndex] = useState<number | null>(
    null,
  );
  const [expandedChunkFileIndex, setExpandedChunkFileIndex] = useState<
    number | null
  >(null);
  // Whether the expanded chunk's preview is showing raw OCR markdown
  // ("text") or extracted notes ("notes"). Only meaningful while
  // expandedChunkIndex is set.
  const [chunkPreviewTab, setChunkPreviewTab] = useState<"text" | "notes">(
    "notes",
  );
  // Parsed pdf-lib document of the most recent chunked import, retained so
  // chunks that failed during the OCR phase can be retried from the chunk
  // panel (re-running OCR needs the source pages, not just markdown).
  // Cleared in resetState to release the (potentially large) document.
  const chunkedPdfSourceRef = useRef<{
    pdfDoc: PDFDocument;
    fileName: string;
  } | null>(null);

  // How many summarize responses were still cut off by the model's output
  // limit after every continuation round the server allows (see
  // `incomplete` in ocrSummarizeCall.ts). Those notes are probably missing
  // content from the tail of that chunk, so the user is told rather than
  // quietly getting a partial import.
  const incompleteExtractionsRef = useRef(0);

  // JSON Repair Modal state - for manual fixing of broken chunk output
  const [repairModalOpen, setRepairModalOpen] = useState(false);
  const [repairChunkIndex, setRepairChunkIndex] = useState<number | null>(null);
  const [repairFileIndex, setRepairFileIndex] = useState<number | null>(null);
  const [repairContent, setRepairContent] = useState("");
  const [repairError, setRepairError] = useState("");

  // Resolve the currently selected model + provider, whether it's one of the
  // built-in models or a user-entered custom model ID for any provider.
  const getSelectedModel = useCallback(
    (): { model: string; provider: BYOKProvider } =>
      resolveModelSelection({ aiModel, customModelProvider, customModelId }),
    [aiModel, customModelId, customModelProvider],
  );

  // Post-import cleanup pass shared by every path that finishes an import
  // (fresh, "complete with current results", and resumed) - merges entries
  // fragmented/duplicated across chunk boundaries (see ocrMerge.ts). A no-op
  // passthrough when the user has disabled it in Advanced Options.
  const applyMergePass = useCallback(
    async (
      lore: StoryLore[],
      mechanicNotes: StoryLore[],
      customTables: CustomTable[],
    ) => {
      if (!mergeDuplicates) {
        return { lore, mechanicNotes, customTables, mergedCount: 0 };
      }
      setStatusMessage("Merging duplicate entries...");
      const { model, provider } = getSelectedModel();
      return mergeExtractedContent(lore, mechanicNotes, customTables, {
        model,
        provider,
        keys,
      });
    },
    [mergeDuplicates, getSelectedModel, keys],
  );

  /**
   * Run one note extraction, streaming the notes into the chunk's live
   * preview as the model writes them.
   *
   * Returns the same success/error result the non-streaming call did, plus
   * the raw model output - which is what the manual JSON-repair flow needs
   * when a response comes back unparseable.
   *
   * A stream that dies after the model has already written notes keeps those
   * notes: they are parsed out of what was streamed and returned as an
   * incomplete extraction. Throwing them away would mean re-running the whole
   * document from the first note for the sake of the ones that never arrived.
   */
  const summarizeWithLive = useCallback(
    async (
      body: OCRSummarizeRequestBody,
      onLive: (live: PartialExtraction) => void,
    ): Promise<{
      result: OCRSummarizeSuccess | OCRSummarizeError;
      raw: string;
    }> => {
      const tracker = createLiveTracker(onLive);
      try {
        const result = await streamSummarizeOCR(body, {
          onEvent: tracker.onEvent,
          onRetry: tracker.reset,
          idleTimeoutMs: SUMMARIZE_IDLE_TIMEOUT_MS,
          maxRetries: MAX_RETRIES,
        });
        return { result, raw: tracker.getRaw() };
      } catch (err) {
        const salvaged = salvagePartialExtraction(tracker.getPartial());
        if (!salvaged) throw err;
        console.warn(
          "Summarize stream failed after notes were written - keeping the partial extraction:",
          err,
        );
        return { result: salvaged, raw: tracker.getRaw() };
      } finally {
        tracker.stop();
      }
    },
    [],
  );

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

  // Check for an interrupted chunked import (page reloaded/crashed mid-job)
  // so it can be offered back as a Resume/Discard banner instead of the
  // completed chunks silently being lost.
  useEffect(() => {
    getImportInProgress()
      .then((progress) => {
        if (progress) setInterruptedImport(progress);
      })
      .catch((e) => console.warn("Failed to check for interrupted import:", e));
  }, []);

  // Save imports to IndexedDB
  const saveImport = useCallback(
    async (
      data: {
        lore: StoryLore[];
        mechanicNotes: StoryLore[];
        customTables: CustomTable[];
        summary: string;
        failedPages?: FailedPageRange[];
      },
      fileNameOverride?: string,
    ) => {
      const fileName =
        fileNameOverride ||
        (selectedFiles.length > 1
          ? `${selectedFiles.length} files`
          : selectedFiles[0]?.name || "Unknown");

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
      closeModal();
    },
    [onImportComplete, addNotification, closeModal],
  );

  // Retry a failed chunk. `chunkIndex` is only unique within a file, so
  // `fileIndex` is required to identify the right entry in `chunkStatuses`
  // when a multi-file import has several files' "chunk 0" etc. side by side.
  const retryChunk = useCallback(
    async (fileIndex: number, chunkIndex: number) => {
      const matches = (cs: ChunkStatus) =>
        cs.fileIndex === fileIndex && cs.chunkIndex === chunkIndex;
      const chunk = chunkStatuses.find(matches);
      if (!chunk) return;

      let ocrMarkdown = chunk.ocrMarkdown;

      // Chunks that failed during the OCR phase have no markdown yet -
      // re-run OCR for this chunk's page range from the retained source
      // document before summarizing.
      if (!ocrMarkdown) {
        const source = chunkedPdfSourceRef.current;
        // The retained source document is only ever the most recently
        // chunked file - if this chunk belongs to an earlier file (or the
        // whole-file entry of a non-chunked file, which has no OCR retry
        // path at all), there's nothing to re-run OCR against.
        if (!source || source.fileName !== chunk.fileName) {
          addNotification(
            "Cannot retry: OCR data for this file is no longer available (only the most recently processed file can be retried)",
            "warning",
          );
          return;
        }

        setChunkStatuses((prev) =>
          prev.map((cs) =>
            matches(cs) ? { ...cs, status: "ocr", error: undefined } : cs,
          ),
        );

        try {
          const ocrResult = await ocrPDFRange(
            source.pdfDoc,
            {
              pageStart: chunk.pageStart,
              pageEnd: chunk.pageEnd,
              startIndex: chunk.pageStart - 1,
              endIndex: chunk.pageEnd - 1,
            },
            source.fileName,
            keys.mistralKey,
          );
          ocrMarkdown = ocrResult.markdown;
        } catch (err: unknown) {
          const message =
            err instanceof Error ? err.message : "OCR processing failed";
          setChunkStatuses((prev) =>
            prev.map((cs) =>
              matches(cs) ? { ...cs, status: "failed", error: message } : cs,
            ),
          );
          addNotification(`Retry failed: ${message}`, "failure");
          return;
        }

        const markdown = ocrMarkdown;
        setChunkStatuses((prev) =>
          prev.map((cs) =>
            matches(cs) ? { ...cs, ocrMarkdown: markdown } : cs,
          ),
        );
      }

      // Update status to summarizing
      setChunkStatuses((prev) =>
        prev.map((cs) =>
          matches(cs)
            ? { ...cs, status: "summarizing", error: undefined, live: undefined }
            : cs,
        ),
      );

      try {
        const { result, raw } = await summarizeWithLive(
          {
            markdown: ocrMarkdown,
            focus: ["all"],
            customInstructions:
              customInstructions +
              `\n\nNote: This is pages ${chunk.pageStart}-${chunk.pageEnd} of a larger document.`,
            model: getSelectedModel().model,
            provider: getSelectedModel().provider,
            maxTokens: maxOutputTokens,
            maxContinuationRounds,
            openRouterKey: keys.openRouterKey,
            deepseekKey: keys.deepseekKey,
            mistralKey: keys.mistralKey,
            googleKey: keys.googleKey,
            deepinfraKey: keys.deepinfraKey,
          },
          (live) =>
            setChunkStatuses((prev) =>
              prev.map((cs) => (matches(cs) ? { ...cs, live } : cs)),
            ),
        );

        if ("error" in result) {
          const errorMsg = sanitizeErrorMessage(
            result.error,
            "Note extraction failed",
          );
          setChunkStatuses((prev) =>
            prev.map((cs) =>
              matches(cs) ? { ...cs, status: "failed", error: errorMsg } : cs,
            ),
          );
          addNotification(`Retry failed: ${errorMsg}`, "failure");
          return;
        }

        if (looksUnparseable(result, raw)) {
          setChunkStatuses((prev) =>
            prev.map((cs) =>
              matches(cs)
                ? {
                    ...cs,
                    status: "failed",
                    error: "No notes could be read from the model's output",
                    rawSummarizeOutput: raw,
                  }
                : cs,
            ),
          );
          addNotification(
            "Retry failed: the output couldn't be read. You can try the manual fix.",
            "warning",
          );
          return;
        }

        // Success - update chunk status
        setChunkStatuses((prev) =>
          prev.map((cs) =>
            matches(cs)
              ? {
                  ...cs,
                  status: "complete",
                  error: undefined,
                  rawSummarizeOutput: undefined,
                  live: undefined,
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
        const message = sanitizeErrorMessage(
          err?.message || "",
          "Unknown error",
        );
        setChunkStatuses((prev) =>
          prev.map((cs) =>
            matches(cs)
              ? {
                  ...cs,
                  status: "failed",
                  error: message,
                }
              : cs,
          ),
        );
        addNotification(`Retry failed: ${message}`, "failure");
      }
    },
    [
      chunkStatuses,
      customInstructions,
      getSelectedModel,
      maxOutputTokens,
      maxContinuationRounds,
      keys,
      addNotification,
      summarizeWithLive,
    ],
  );

  // Open repair modal for a failed chunk. `chunkIndex` alone isn't unique
  // across files in a multi-file import, so `fileIndex` disambiguates.
  const openRepairModal = useCallback(
    (fileIndex: number, chunkIndex: number) => {
      const chunk = chunkStatuses.find(
        (cs) => cs.fileIndex === fileIndex && cs.chunkIndex === chunkIndex,
      );
      if (!chunk || !chunk.rawSummarizeOutput) {
        addNotification("No raw output available to repair", "warning");
        return;
      }
      setRepairFileIndex(fileIndex);
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
      if (repairChunkIndex === null || repairFileIndex === null) return;

      try {
        const result = JSON.parse(fixedContent);

        // Update chunk status with parsed results
        setChunkStatuses((prev) =>
          prev.map((cs) =>
            cs.fileIndex === repairFileIndex &&
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
        setRepairFileIndex(null);
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
    [repairChunkIndex, repairFileIndex, addNotification],
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
  const completeWithCurrentResults = useCallback(async () => {
    const results = collectChunkResults();
    const completedCount = chunkStatuses.filter(
      (cs) => cs.status === "complete",
    ).length;
    const failedChunks = chunkStatuses.filter((cs) => cs.status === "failed");
    const failedCount = failedChunks.length;
    const failedPages: FailedPageRange[] = failedChunks.map((cs) => ({
      fileName: cs.fileName,
      pageStart: cs.pageStart,
      pageEnd: cs.pageEnd,
      reason: cs.error || "Unknown error",
    }));

    const merged = await applyMergePass(
      results.lore,
      results.mechanicNotes,
      results.customTables,
    );

    const importData = {
      lore: merged.lore,
      mechanicNotes: merged.mechanicNotes,
      customTables: merged.customTables,
      summary: `Imported ${completedCount} chunks (${failedCount} failed)`,
      failedPages,
    };

    // Save to IndexedDB
    saveImport(importData);

    // Call callback
    onImportComplete(importData);

    // This is the concluding action for the in-progress chunked job (the
    // user is accepting the current partial results), so the recovery
    // record is no longer needed.
    clearImportInProgress().catch((e) =>
      console.warn("Failed to clear in-progress import record:", e),
    );

    const totalItems =
      merged.lore.length + merged.mechanicNotes.length + merged.customTables.length;
    addNotification(
      `Imported ${totalItems} items from ${completedCount} chunks (${failedCount} skipped)` +
        (merged.mergedCount > 0
          ? ` · merged ${merged.mergedCount} duplicate entries`
          : ""),
      failedCount > 0 ? "warning" : "success",
    );

    // Close modal
    closeModal();
    resetState();
  }, [
    collectChunkResults,
    chunkStatuses,
    applyMergePass,
    saveImport,
    onImportComplete,
    addNotification,
    closeModal,
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

  // Run the OCR + summarize pipeline for a chunked PDF's page ranges.
  // Shared by a fresh import (all ranges "pending") and a resumed one
  // (some ranges already "complete"/"failed" from a prior interrupted
  // run) - chunks already marked "complete" are reused as-is rather than
  // reprocessed. Persists progress to IndexedDB after every chunk settles
  // so an accidental reload never discards more than the single in-flight
  // chunk.
  const processChunkedRanges = useCallback(
    async (
      chunkPlan: PDFChunkPlan,
      fileName: string,
      fileIndex: number,
      sourceBytes: ArrayBuffer,
      initialStatuses: ChunkStatus[],
      progressStart: number,
      progressRange: number,
      // Explicit settings snapshot rather than reading aiModel/
      // customInstructions/etc. off component state: a resume calls this
      // right after setAIModel(...)-ing the recovered settings, and those
      // setState calls haven't flushed into this closure yet by the time
      // we'd read them, so passing them in avoids using stale values.
      settings: InProgressPDFImportSettings,
    ): Promise<{
      lore: StoryLore[];
      mechanicNotes: StoryLore[];
      customTables: CustomTable[];
      failedPages: FailedPageRange[];
      totalPagesProcessed: number;
    }> => {
      const { pdfDoc, ranges } = chunkPlan;
      const totalChunks = ranges.length;
      const progressEnd = progressStart + progressRange;
      const { model, provider } = resolveModelSelection(settings);
      const { customInstructions, maxOutputTokens, maxContinuationRounds } =
        settings;

      // Retain the parsed document so failed chunks can re-run OCR from
      // the chunk panel after the import finishes.
      chunkedPdfSourceRef.current = { pdfDoc, fileName };
      // Append this file's chunks rather than replacing the whole list, so
      // a multi-file import keeps every earlier file's preview/status
      // visible instead of each new file wiping out the previous one's.
      setChunkStatuses((prev) => [
        ...prev.filter((cs) => cs.fileIndex !== fileIndex),
        ...initialStatuses,
      ]);

      const persistedStatuses: PersistedChunkStatus[] = initialStatuses.map(
        (cs) => ({
          chunkIndex: cs.chunkIndex,
          pageStart: cs.pageStart,
          pageEnd: cs.pageEnd,
          status:
            cs.status === "complete" || cs.status === "failed"
              ? cs.status
              : "pending",
          ocrMarkdown: cs.ocrMarkdown,
          error: cs.error,
          result: cs.result,
        }),
      );
      const persistProgress = () => {
        saveImportInProgress({
          fileName,
          fileBytes: sourceBytes,
          chunkStatuses: persistedStatuses,
          settings,
        }).catch((e) =>
          console.warn("Failed to persist import progress:", e),
        );
      };
      persistProgress();

      const chunkLore: StoryLore[] = [];
      const chunkMechanics: StoryLore[] = [];
      const chunkTables: CustomTable[] = [];
      const failedPages: FailedPageRange[] = [];
      let totalPagesProcessed = 0;

      // Chunks already complete (resumed from a prior run) contribute
      // their stored results directly, without being reprocessed.
      for (const cs of initialStatuses) {
        if (cs.status === "complete" && cs.result) {
          chunkLore.push(...cs.result.lore);
          chunkMechanics.push(...cs.result.mechanicNotes);
          chunkTables.push(...cs.result.customTables);
        }
      }

      const pendingChunkIndices = initialStatuses
        .filter((cs) => cs.status !== "complete")
        .map((cs) => cs.chunkIndex);

      if (pendingChunkIndices.length === 0) {
        setProgress(progressEnd);
        return {
          lore: chunkLore,
          mechanicNotes: chunkMechanics,
          customTables: chunkTables,
          failedPages,
          totalPagesProcessed,
        };
      }

      setStep("uploading");
      setStatusMessage(`Preparing ${fileName}...`);
      setProgress(progressStart + progressRange * 0.05);

      // Fewer concurrent OCR uploads on memory-constrained devices (or for
      // very large source files), since each chunk carries its own
      // multi-MB base64 payload.
      const ocrConcurrency = needsConservativeMemoryMode(
        sourceBytes.byteLength,
      )
        ? 1
        : MAX_CONCURRENT_OCR_REQUESTS;

      // OCR + note extraction, pipelined per chunk: each chunk's
      // summarize call starts the moment *that chunk's* OCR finishes,
      // instead of waiting for every chunk in the document to clear
      // OCR first. OCR and summarize each keep their own concurrency
      // limiter (OCR uploads carry multi-MB payloads and must stay
      // low for memory reasons; summarize calls are lightweight text
      // requests and can run much more in parallel) so the two stages
      // proceed concurrently with each other across the whole batch.
      //
      // A failed chunk must not abort the whole import (a single
      // timed-out request on a large file used to throw here and
      // discard every other chunk's work). Failed chunks are marked
      // in the status panel and the rest continue; only bail out if
      // *every* pending chunk failed OCR on a completely fresh run.
      setStep("ocr");
      setStatusMessage(
        `Processing ${pendingChunkIndices.length}/${totalChunks} chunks...`,
      );
      setProgress(progressStart + progressRange * 0.1);

      const ocrLimiter = createLimiter(ocrConcurrency);
      const summarizeLimiter = createLimiter(MAX_CONCURRENT_REQUESTS);

      const alreadyDoneStages = (totalChunks - pendingChunkIndices.length) * 2;
      let ocrDone = 0;
      let summarizeDone = 0;
      const reportProgress = () => {
        const stagesDone = alreadyDoneStages + ocrDone + summarizeDone;
        setProgress(
          progressStart +
            progressRange * (0.1 + (stagesDone / (totalChunks * 2)) * 0.85),
        );
        setStatusMessage(
          `OCR: ${alreadyDoneStages / 2 + ocrDone}/${totalChunks} · Notes: ${
            alreadyDoneStages / 2 + summarizeDone
          }/${totalChunks}...`,
        );
      };

      type ChunkPipelineResult = {
        chunkIndex: number;
        pageStart: number;
        pageEnd: number;
      } & (
        | { stage: "ocr"; success: false; error: string }
        | { stage: "summarize"; success: false; error: string }
        | {
            stage: "summarize";
            success: true;
            lore: StoryLore[];
            mechanicNotes: StoryLore[];
            customTables: CustomTable[];
          }
      );

      const chunkPipelines = pendingChunkIndices.map(
        (chunkIdx) => async (): Promise<ChunkPipelineResult> => {
          const range = ranges[chunkIdx];
          setChunkStatuses((prev) =>
            prev.map((cs) =>
              cs.fileIndex === fileIndex && cs.chunkIndex === chunkIdx ? { ...cs, status: "ocr" } : cs,
            ),
          );

          // Build this chunk's base64 payload just-in-time so at most
          // `ocrConcurrency` chunk buffers exist in memory at once,
          // instead of every chunk in the document simultaneously.
          // ocrPDFRange transparently splits further if the actual
          // payload exceeds Vercel's body-size limit.
          let ocrMarkdown: string;
          try {
            const chunkResult = await ocrLimiter(() =>
              ocrPDFRange(pdfDoc, range, fileName, keys.mistralKey),
            );
            ocrMarkdown = chunkResult.markdown;
            totalPagesProcessed += chunkResult.totalPages;
          } catch (err: unknown) {
            const message = sanitizeErrorMessage(
              err instanceof Error ? err.message : "",
              "OCR processing failed",
            );
            console.error(
              `Pages ${range.pageStart}-${range.pageEnd} OCR failed:`,
              message,
            );
            setChunkStatuses((prev) =>
              prev.map((cs) =>
                cs.fileIndex === fileIndex && cs.chunkIndex === chunkIdx
                  ? { ...cs, status: "failed", error: message }
                  : cs,
              ),
            );
            persistedStatuses[chunkIdx] = {
              ...persistedStatuses[chunkIdx],
              status: "failed",
              error: message,
            };
            persistProgress();
            ocrDone++;
            reportProgress();
            return {
              chunkIndex: chunkIdx,
              stage: "ocr",
              success: false,
              error: message,
              pageStart: range.pageStart,
              pageEnd: range.pageEnd,
            };
          }

          setChunkStatuses((prev) =>
            prev.map((cs) =>
              cs.fileIndex === fileIndex && cs.chunkIndex === chunkIdx
                ? { ...cs, ocrMarkdown, status: "summarizing" }
                : cs,
            ),
          );
          ocrDone++;
          reportProgress();

          try {
            const { result: summarizeResult, raw } = await summarizeLimiter(() =>
              summarizeWithLive(
                {
                  markdown: ocrMarkdown,
                  focus: ["all"],
                  customInstructions:
                    customInstructions +
                    `\n\nNote: This is pages ${range.pageStart}-${range.pageEnd} of a larger document.`,
                  model,
                  provider,
                  maxTokens: maxOutputTokens,
                  maxContinuationRounds,
                  openRouterKey: keys.openRouterKey,
                  deepseekKey: keys.deepseekKey,
                  mistralKey: keys.mistralKey,
                  googleKey: keys.googleKey,
                  deepinfraKey: keys.deepinfraKey,
                },
                (live) =>
                  setChunkStatuses((prev) =>
                    prev.map((cs) =>
                      cs.fileIndex === fileIndex && cs.chunkIndex === chunkIdx
                        ? { ...cs, live }
                        : cs,
                    ),
                  ),
              ),
            );

            if ("error" in summarizeResult) {
              const errorMsg = sanitizeErrorMessage(
                summarizeResult.error,
                "Note extraction failed",
              );
              console.error(
                `Pages ${range.pageStart}-${range.pageEnd} summarization failed:`,
                errorMsg,
              );
              setChunkStatuses((prev) =>
                prev.map((cs) =>
                  cs.fileIndex === fileIndex && cs.chunkIndex === chunkIdx
                    ? { ...cs, status: "failed", error: errorMsg }
                    : cs,
                ),
              );
              persistedStatuses[chunkIdx] = {
                ...persistedStatuses[chunkIdx],
                status: "failed",
                error: errorMsg,
                ocrMarkdown,
              };
              persistProgress();
              summarizeDone++;
              reportProgress();
              return {
                chunkIndex: chunkIdx,
                stage: "summarize",
                success: false,
                error: errorMsg,
                pageStart: range.pageStart,
                pageEnd: range.pageEnd,
              };
            }

            // The model wrote plenty but none of it survived parsing -
            // keep the raw output so it can be repaired by hand.
            if (looksUnparseable(summarizeResult, raw)) {
              const parseError = "No notes could be read from the model's output";
              setChunkStatuses((prev) =>
                prev.map((cs) =>
                  cs.fileIndex === fileIndex && cs.chunkIndex === chunkIdx
                    ? {
                        ...cs,
                        status: "failed",
                        error: parseError,
                        rawSummarizeOutput: raw,
                      }
                    : cs,
                ),
              );
              persistedStatuses[chunkIdx] = {
                ...persistedStatuses[chunkIdx],
                status: "failed",
                error: parseError,
                ocrMarkdown,
              };
              persistProgress();
              summarizeDone++;
              reportProgress();
              return {
                chunkIndex: chunkIdx,
                stage: "summarize",
                success: false,
                error: parseError,
                pageStart: range.pageStart,
                pageEnd: range.pageEnd,
              };
            }

            if (summarizeResult.incomplete) incompleteExtractionsRef.current++;

            const chunkOutput = {
              lore: summarizeResult.lore || [],
              mechanicNotes: summarizeResult.mechanicNotes || [],
              customTables: summarizeResult.customTables || [],
            };

            setChunkStatuses((prev) =>
              prev.map((cs) =>
                cs.fileIndex === fileIndex && cs.chunkIndex === chunkIdx
                  ? {
                      ...cs,
                      status: "complete",
                      live: undefined,
                      result: chunkOutput,
                    }
                  : cs,
              ),
            );
            persistedStatuses[chunkIdx] = {
              ...persistedStatuses[chunkIdx],
              status: "complete",
              error: undefined,
              ocrMarkdown: undefined,
              result: chunkOutput,
            };
            persistProgress();
            summarizeDone++;
            reportProgress();
            return {
              chunkIndex: chunkIdx,
              stage: "summarize",
              success: true,
              ...chunkOutput,
              pageStart: range.pageStart,
              pageEnd: range.pageEnd,
            };
          } catch (err: any) {
            const message = sanitizeErrorMessage(
              err?.message || "",
              "Unknown error",
            );
            console.error(
              `Pages ${range.pageStart}-${range.pageEnd} summarization error:`,
              err?.message || err,
            );
            setChunkStatuses((prev) =>
              prev.map((cs) =>
                cs.fileIndex === fileIndex && cs.chunkIndex === chunkIdx
                  ? { ...cs, status: "failed", error: message }
                  : cs,
              ),
            );
            persistedStatuses[chunkIdx] = {
              ...persistedStatuses[chunkIdx],
              status: "failed",
              error: message,
              ocrMarkdown,
            };
            persistProgress();
            summarizeDone++;
            reportProgress();
            return {
              chunkIndex: chunkIdx,
              stage: "summarize",
              success: false,
              error: message,
              pageStart: range.pageStart,
              pageEnd: range.pageEnd,
            };
          }
        },
      );

      const pipelineResults = await Promise.all(
        chunkPipelines.map((task) => task()),
      );

      const failedOcr = pipelineResults.filter(
        (r): r is Extract<ChunkPipelineResult, { stage: "ocr" }> =>
          r.stage === "ocr" && !r.success,
      );
      const succeededOcrCount = pendingChunkIndices.length - failedOcr.length;
      if (failedOcr.length > 0) {
        setWorkspaceTab("sources");
        // Only abort the whole thing if this was a completely fresh run
        // (no chunks already done from a resume) and every single chunk
        // failed OCR - that's almost certainly a systemic problem (bad
        // key, network down), not worth partially completing.
        if (succeededOcrCount === 0 && alreadyDoneStages === 0) {
          throw new Error(
            `OCR failed for all ${totalChunks} chunks. First error: ${failedOcr[0].error}`,
          );
        }
      }
      for (const failed of failedOcr) {
        failedPages.push({
          fileName,
          pageStart: failed.pageStart,
          pageEnd: failed.pageEnd,
          reason: failed.error,
        });
      }

      const failedSummarize = pipelineResults.filter(
        (
          r,
        ): r is Extract<
          ChunkPipelineResult,
          { stage: "summarize"; success: false }
        > => r.stage === "summarize" && !r.success,
      );
      if (failedSummarize.length > 0) {
        console.warn(
          `${failedSummarize.length}/${succeededOcrCount} chunks failed to summarize`,
        );
        setWorkspaceTab("sources");
      }
      for (const failed of failedSummarize) {
        failedPages.push({
          fileName,
          pageStart: failed.pageStart,
          pageEnd: failed.pageEnd,
          reason: failed.error,
        });
      }

      if (failedOcr.length > 0 || failedSummarize.length > 0) {
        const firstError = failedOcr[0]?.error ?? failedSummarize[0]?.error;
        const totalFailed = failedOcr.length + failedSummarize.length;
        addNotification(
          `${totalFailed}/${totalChunks} chunks failed and were skipped (${firstError})`,
          "warning",
        );
      }

      for (const result of pipelineResults) {
        if (result.stage === "summarize" && result.success) {
          chunkLore.push(...result.lore);
          chunkMechanics.push(...result.mechanicNotes);
          chunkTables.push(...result.customTables);
        }
      }

      setProgress(progressEnd);

      return {
        lore: chunkLore,
        mechanicNotes: chunkMechanics,
        customTables: chunkTables,
        failedPages,
        totalPagesProcessed,
      };
    },
    [keys, addNotification, summarizeWithLive],
  );

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
    // Page ranges that failed OCR or note extraction, kept alongside the
    // successfully imported content so the player knows which pages to
    // rework rather than silently ending up with missing content.
    const allFailedPages: FailedPageRange[] = [];
    let totalPagesProcessed = 0;
    incompleteExtractionsRef.current = 0;

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

        if (needsChunking) {
          // Large PDF: read the bytes once (needed both to plan chunks and
          // to persist an in-progress record for resuming after a reload),
          // then run the OCR + summarize pipeline over every chunk.
          setStep("uploading");
          setStatusMessage(`Splitting ${file.name} into chunks...`);
          setProgress(fileProgressStart + fileProgressRange * 0.05);

          let sourceBytes: ArrayBuffer;
          let chunkPlan: PDFChunkPlan;
          try {
            sourceBytes = await file.arrayBuffer();
            chunkPlan = await planPDFChunks(sourceBytes, (msg) =>
              setStatusMessage(msg),
            );
          } catch (err: unknown) {
            const message =
              err instanceof Error
                ? err.message
                : "the file may be too large or corrupted for this device's memory";
            throw new Error(`Failed to read ${file.name}: ${message}`);
          }

          const initialStatuses: ChunkStatus[] = chunkPlan.ranges.map(
            (range, idx) => ({
              chunkIndex: idx,
              fileIndex: i,
              fileName: file.name,
              pageStart: range.pageStart,
              pageEnd: range.pageEnd,
              status: "pending",
            }),
          );

          const chunkResult = await processChunkedRanges(
            chunkPlan,
            file.name,
            i,
            sourceBytes,
            initialStatuses,
            fileProgressStart,
            fileProgressRange,
            {
              aiModel,
              customModelProvider,
              customModelId,
              customInstructions,
              maxOutputTokens,
              maxContinuationRounds,
            },
          );

          allLore.push(...chunkResult.lore);
          allMechanicNotes.push(...chunkResult.mechanicNotes);
          allCustomTables.push(...chunkResult.customTables);
          allFailedPages.push(...chunkResult.failedPages);
          totalPagesProcessed += chunkResult.totalPagesProcessed;
        } else {
          // Small file or non-PDF: Use original single-request approach.
          // Track this file as a single whole-file entry in chunkStatuses
          // so it shows up in the same live preview panel as chunked
          // files - previously only chunked (large) PDFs got any preview
          // at all, so a multi-file import of ordinary-sized files showed
          // no notes/tables preview for any of them.
          setChunkStatuses((prev) => [
            ...prev,
            {
              chunkIndex: 0,
              fileIndex: i,
              fileName: file.name,
              pageStart: 1,
              pageEnd: 1,
              status: "ocr",
            },
          ]);
          const updateFileChunk = (patch: Partial<ChunkStatus>) => {
            setChunkStatuses((prev) =>
              prev.map((cs) =>
                cs.fileIndex === i && cs.chunkIndex === 0
                  ? { ...cs, ...patch }
                  : cs,
              ),
            );
          };

          try {
            if (isTextImportFile(file)) {
              setStep("summarizing");
              updateFileChunk({ status: "summarizing" });
              setProgress(fileProgressStart + fileProgressRange * 0.4);
              setStatusMessage(
                `Extracting notes from ${file.name} (${i + 1}/${totalFiles})...`,
              );

              const textContent = await file.text();
              combinedMarkdown = textContent;
              combinedTotalPages = 0;
              updateFileChunk({ ocrMarkdown: textContent });

              const { result: summarizeResult } = await summarizeWithLive(
                {
                  markdown: combinedMarkdown,
                  focus: ["all"],
                  customInstructions:
                    (customInstructions || "") +
                    `\n\nNote: This content was imported from a text file (${file.name}).`,
                  model: getSelectedModel().model,
                  provider: getSelectedModel().provider,
                  maxTokens: maxOutputTokens,
                  maxContinuationRounds,
                  openRouterKey: keys.openRouterKey,
                  deepseekKey: keys.deepseekKey,
                  mistralKey: keys.mistralKey,
                  googleKey: keys.googleKey,
                  deepinfraKey: keys.deepinfraKey,
                },
                (live) => updateFileChunk({ live }),
              );

              if ("error" in summarizeResult) {
                throw new Error(
                  `${file.name}: ${sanitizeErrorMessage(
                    summarizeResult.error,
                    "Note extraction failed",
                  )}`,
                );
              }

              if (summarizeResult.incomplete) incompleteExtractionsRef.current++;
              const fileResult = {
                lore: summarizeResult.lore || [],
                mechanicNotes: summarizeResult.mechanicNotes || [],
                customTables: summarizeResult.customTables || [],
              };
              allLore.push(...fileResult.lore);
              allMechanicNotes.push(...fileResult.mechanicNotes);
              allCustomTables.push(...fileResult.customTables);
              updateFileChunk({
                status: "complete",
                live: undefined,
                result: fileResult,
              });
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

            const ocrResponse = await ocrFetch("/api/ocr/process", {
              ...ocrPayload,
              includeImages: false,
              mistralKey: keys.mistralKey,
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
            updateFileChunk({
              ocrMarkdown: combinedMarkdown,
              pageEnd: Math.max(1, combinedTotalPages),
              status: "summarizing",
            });

            // Step 3: AI Summarization - Extract all notes (only for non-chunked files)
            setStep("summarizing");
            setStatusMessage(
              `Extracting notes from ${file.name} (${i + 1}/${totalFiles})...`,
            );

            const { result: summarizeResult } = await summarizeWithLive(
              {
                markdown: combinedMarkdown,
                focus: ["all"],
                customInstructions,
                model: getSelectedModel().model,
                provider: getSelectedModel().provider,
                maxTokens: maxOutputTokens,
                maxContinuationRounds,
                openRouterKey: keys.openRouterKey,
                deepseekKey: keys.deepseekKey,
                mistralKey: keys.mistralKey,
                googleKey: keys.googleKey,
                deepinfraKey: keys.deepinfraKey,
              },
              (live) => updateFileChunk({ live }),
            );

            if ("error" in summarizeResult) {
              throw new Error(
                `${file.name}: ${sanitizeErrorMessage(
                  summarizeResult.error,
                  "Note extraction failed",
                )}`,
              );
            }

            if (summarizeResult.incomplete) incompleteExtractionsRef.current++;
            const fileResult = {
              lore: summarizeResult.lore || [],
              mechanicNotes: summarizeResult.mechanicNotes || [],
              customTables: summarizeResult.customTables || [],
            };
            allLore.push(...fileResult.lore);
            allMechanicNotes.push(...fileResult.mechanicNotes);
            allCustomTables.push(...fileResult.customTables);
            updateFileChunk({
              status: "complete",
              live: undefined,
              result: fileResult,
            });
            setProgress(fileProgressEnd);
          } catch (err) {
            // Any failure above (including ones not yet reflected in the
            // chunk status, e.g. a thrown network error) should leave this
            // file's preview entry visibly failed rather than stuck on
            // "ocr"/"summarizing" forever - then propagate so the existing
            // outer error handling (message + toast) still runs.
            updateFileChunk({
              status: "failed",
              error:
                err instanceof Error ? err.message : "Import failed",
            });
            throw err;
          }
        }
      }

      // Step 4: Merge duplicate/fragmented entries, then complete
      const merged = await applyMergePass(
        allLore,
        allMechanicNotes,
        allCustomTables,
      );

      setStep("complete");
      setStatusMessage("Import complete!");
      setProgress(100);

      // Prepare import data
      const importData = {
        lore: merged.lore,
        mechanicNotes: merged.mechanicNotes,
        customTables: merged.customTables,
        summary: `Imported from ${totalFiles} file${totalFiles > 1 ? "s" : ""}`,
        failedPages: allFailedPages,
      };

      // Save to localStorage for recovery
      saveImport(importData);

      // Call the callback with merged results from all files
      onImportComplete(importData);

      // The whole import (all files) finished, so any in-progress chunked
      // job recovery record is no longer needed.
      clearImportInProgress().catch((e) =>
        console.warn("Failed to clear in-progress import record:", e),
      );

      // Show success notification
      const totalItems =
        merged.lore.length + merged.mechanicNotes.length + merged.customTables.length;
      addNotification(
        `Imported ${totalItems} items from ${totalPagesProcessed} pages across ${totalFiles} file${
          totalFiles > 1 ? "s" : ""
        } (~$${estimateOCRCostUSD(totalPagesProcessed).toFixed(3)} in OCR costs, paid to your own API key)` +
          (merged.mergedCount > 0
            ? ` · merged ${merged.mergedCount} duplicate entries`
            : ""),
        "success",
      );
      if (allFailedPages.length > 0) {
        addNotification(
          `${allFailedPages.length} page range${
            allFailedPages.length > 1 ? "s" : ""
          } failed to import and were skipped - see Saved Imports for details on which pages to rework`,
          "warning",
        );
      }
      if (incompleteExtractionsRef.current > 0) {
        addNotification(
          `${incompleteExtractionsRef.current} section${
            incompleteExtractionsRef.current > 1 ? "s" : ""
          } still had more to extract when the import stopped - some notes near the end may be missing. Raise "Continuation Rounds" or "Max Output Size" in Advanced Options and re-import to capture the rest.`,
          "warning",
        );
      }

      // Show reminder about Saved Imports feature
      setTimeout(() => {
        addNotification(
          "💡 Tip: Your import is saved! Re-open the PDF Importer to access 'Saved Imports' anytime.",
          "success",
        );
      }, 2000);

      // Close modal after short delay
      setTimeout(() => {
        closeModal();
        resetState();
      }, 1500);
    } catch (error: any) {
      console.error("PDF import error:", error);
      const message = sanitizeErrorMessage(
        error?.message || "",
        "Import failed",
      );
      setStep("error");
      setStatusMessage(message);
      addNotification(message, "failure");
    } finally {
      // No cleanup needed - files are processed entirely client-side/BYOK now
    }
  };

  // Import a document by URL (e.g. a Google Drive share link) instead of
  // uploading a file. Mistral fetches the document itself from the URL, so
  // there's no local file to chunk - this is always a single OCR call,
  // regardless of the document's size.
  const processLinkImport = async () => {
    const trimmedUrl = linkUrl.trim();
    if (!trimmedUrl) {
      addNotification("Please paste a document link", "warning");
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
    if (!keys.mistralKey) {
      addNotification(
        "Please add your Mistral API key in Settings to use OCR",
        "warning",
      );
      return;
    }

    const documentUrl = normalizeDocumentLink(trimmedUrl);

    try {
      setStep("ocr");
      setProgress(10);
      setStatusMessage("Fetching and extracting text from the link...");

      const ocrResponse = await fetchWithRetry(
        "/api/ocr/process",
        {
          signedUrl: documentUrl,
          includeImages: false,
          mistralKey: keys.mistralKey,
        },
        OCR_TIMEOUT_MS,
        MAX_RETRIES,
      );

      if (!ocrResponse.ok) {
        const errorMsg = await extractErrorMessage(
          ocrResponse,
          "OCR processing failed",
        );
        throw new Error(
          `${errorMsg}. Make sure the link is shared as "Anyone with the link" - very large files may also fail if Drive shows a virus-scan warning page instead of the file; try the file upload option instead in that case.`,
        );
      }

      const ocrResult: OCRProcessResult = await ocrResponse.json();

      setProgress(45);
      setStep("summarizing");
      setStatusMessage("Extracting notes from the document...");

      // A link import is one whole-document pass, but it still gets an
      // entry in the live panel so its notes show up as they're written,
      // the same as an uploaded file's.
      const linkLabel = documentUrl.split("/").pop() || "Linked document";
      setChunkStatuses([
        {
          chunkIndex: 0,
          fileIndex: 0,
          fileName: linkLabel,
          pageStart: 1,
          pageEnd: Math.max(1, ocrResult.totalPages),
          status: "summarizing",
          ocrMarkdown: ocrResult.markdown,
        },
      ]);
      const updateLinkChunk = (patch: Partial<ChunkStatus>) =>
        setChunkStatuses((prev) => prev.map((cs) => ({ ...cs, ...patch })));

      const { result: summarizeResult } = await summarizeWithLive(
        {
          markdown: ocrResult.markdown,
          focus: ["all"],
          customInstructions,
          model: selectedModel.model,
          provider: selectedModel.provider,
          maxTokens: maxOutputTokens,
          maxContinuationRounds,
          openRouterKey: keys.openRouterKey,
          deepseekKey: keys.deepseekKey,
          mistralKey: keys.mistralKey,
          googleKey: keys.googleKey,
          deepinfraKey: keys.deepinfraKey,
        },
        (live) => updateLinkChunk({ live }),
      );

      if ("error" in summarizeResult) {
        const errorMsg = sanitizeErrorMessage(
          summarizeResult.error,
          "Note extraction failed",
        );
        updateLinkChunk({ status: "failed", error: errorMsg });
        throw new Error(errorMsg);
      }

      updateLinkChunk({
        status: "complete",
        live: undefined,
        result: {
          lore: summarizeResult.lore || [],
          mechanicNotes: summarizeResult.mechanicNotes || [],
          customTables: summarizeResult.customTables || [],
        },
      });

      setStep("complete");
      setStatusMessage("Import complete!");
      setProgress(100);

      const importData = {
        lore: summarizeResult.lore || [],
        mechanicNotes: summarizeResult.mechanicNotes || [],
        customTables: summarizeResult.customTables || [],
        summary: "Imported from link",
      };

      saveImport(importData, "Link import");
      onImportComplete(importData);

      const totalItems =
        importData.lore.length +
        importData.mechanicNotes.length +
        importData.customTables.length;
      addNotification(
        `Imported ${totalItems} items from ${ocrResult.totalPages} pages (~$${estimateOCRCostUSD(
          ocrResult.totalPages,
        ).toFixed(3)} in OCR costs, paid to your own API key)`,
        "success",
      );

      setTimeout(() => {
        closeModal();
        resetState();
      }, 1500);
    } catch (error: unknown) {
      console.error("PDF link import error:", error);
      const message = sanitizeErrorMessage(
        error instanceof Error ? error.message : "",
        "Import failed",
      );
      setStep("error");
      setStatusMessage(message);
      addNotification(message, "failure");
    }
  };

  // Resume a chunked import that got interrupted (reload/crash) before it
  // finished - reconstructs the source PDF from the bytes we persisted to
  // IndexedDB and only reprocesses chunks that weren't already complete.
  const resumeInterruptedImport = useCallback(async () => {
    if (!interruptedImport) return;

    const { settings } = interruptedImport;
    if (settings.aiModel === "custom-model" && !settings.customModelId.trim()) {
      addNotification(
        "Cannot resume: the custom model ID used for this import is missing",
        "warning",
      );
      return;
    }
    const { provider } = resolveModelSelection(settings);
    if (!keys[PROVIDER_KEY_FIELD[provider]]) {
      addNotification(
        `Please add your ${PROVIDER_LABELS[provider]} API key in Settings to resume this import`,
        "warning",
      );
      return;
    }

    setIsResuming(true);
    // Reflect the recovered settings in the form too, so they're visible
    // and stay in effect if the user reopens the importer later.
    setAIModel(settings.aiModel);
    setCustomModelProvider(settings.customModelProvider as BYOKProvider);
    setCustomModelId(settings.customModelId);
    setCustomInstructions(settings.customInstructions);
    setMaxOutputTokens(settings.maxOutputTokens);
    if (settings.maxContinuationRounds !== undefined) {
      setMaxContinuationRounds(settings.maxContinuationRounds);
    }

    try {
      const pdfDoc = await PDFDocument.load(interruptedImport.fileBytes, {
        ignoreEncryption: true,
      });
      const ranges: PDFChunkRange[] = interruptedImport.chunkStatuses.map(
        (cs) => ({
          pageStart: cs.pageStart,
          pageEnd: cs.pageEnd,
          startIndex: cs.pageStart - 1,
          endIndex: cs.pageEnd - 1,
        }),
      );
      const initialStatuses: ChunkStatus[] = interruptedImport.chunkStatuses.map(
        (cs) => ({
          chunkIndex: cs.chunkIndex,
          fileIndex: 0,
          fileName: interruptedImport.fileName,
          pageStart: cs.pageStart,
          pageEnd: cs.pageEnd,
          status: cs.status,
          ocrMarkdown: cs.ocrMarkdown,
          error: cs.error,
          result: cs.result,
        }),
      );

      const chunkResult = await processChunkedRanges(
        { pdfDoc, ranges },
        interruptedImport.fileName,
        0,
        interruptedImport.fileBytes,
        initialStatuses,
        0,
        100,
        settings,
      );

      const merged = await applyMergePass(
        chunkResult.lore,
        chunkResult.mechanicNotes,
        chunkResult.customTables,
      );

      setStep("complete");
      setStatusMessage("Import complete!");
      setProgress(100);

      const importData = {
        lore: merged.lore,
        mechanicNotes: merged.mechanicNotes,
        customTables: merged.customTables,
        summary: `Resumed import from ${interruptedImport.fileName}`,
        failedPages: chunkResult.failedPages,
      };

      await saveImport(importData, interruptedImport.fileName);
      onImportComplete(importData);
      await clearImportInProgress();
      setInterruptedImport(null);

      const totalItems =
        merged.lore.length + merged.mechanicNotes.length + merged.customTables.length;
      addNotification(
        `Resumed and imported ${totalItems} items from ${interruptedImport.fileName}` +
          (merged.mergedCount > 0
            ? ` · merged ${merged.mergedCount} duplicate entries`
            : ""),
        chunkResult.failedPages.length > 0 ? "warning" : "success",
      );

      setTimeout(() => {
        closeModal();
        resetState();
      }, 1500);
    } catch (error: unknown) {
      console.error("Resume import error:", error);
      const message = sanitizeErrorMessage(
        error instanceof Error ? error.message : "",
        "Resume failed",
      );
      setStep("error");
      setStatusMessage(message);
      addNotification(message, "failure");
    } finally {
      setIsResuming(false);
    }
  }, [
    interruptedImport,
    keys,
    addNotification,
    processChunkedRanges,
    applyMergePass,
    onImportComplete,
    saveImport,
    closeModal,
  ]);

  // Give up on the interrupted import and discard the recovered progress.
  const discardInterruptedImport = useCallback(async () => {
    try {
      await clearImportInProgress();
    } catch (e) {
      console.warn("Failed to discard interrupted import:", e);
    }
    setInterruptedImport(null);
  }, []);

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
    setLinkUrl("");
    setEstimatedCost(0);
    setPageCount(0);
    setCurrentFileIndex(0);
    setChunkStatuses([]);
    setWorkspaceTab("notes");
    setExpandedChunkIndex(null);
    setExpandedChunkFileIndex(null);
    chunkedPdfSourceRef.current = null;
    setRepairModalOpen(false);
    setRepairChunkIndex(null);
    setRepairFileIndex(null);
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

  // Everything extracted so far across every file/chunk of this import -
  // finished chunks contribute their real results, in-flight ones whatever
  // the model has written by now, folded together the same way the server
  // folds its own rounds.
  const extracted = useMemo(() => {
    let combined = emptyPartialExtraction();
    for (const chunk of chunkStatuses) {
      const part: PartialExtraction | undefined = chunk.result
        ? {
            summary: "",
            lore: chunk.result.lore,
            mechanicNotes: chunk.result.mechanicNotes,
            customTables: chunk.result.customTables,
          }
        : chunk.live;
      if (part) combined = mergePartialExtraction(combined, part);
    }
    return combined;
  }, [chunkStatuses]);

  const extractedCount = countPartialExtraction(extracted);
  const failedChunks = chunkStatuses.filter((cs) => cs.status === "failed");
  const completeChunks = chunkStatuses.filter((cs) => cs.status === "complete");
  const isBusy = step !== "idle" && step !== "error";
  // The workspace column earns its place once there's something to watch.
  const hasWorkspace = isBusy || chunkStatuses.length > 0;
  const stageIndex =
    step === "complete"
      ? PIPELINE_STAGES.length
      : PIPELINE_STAGES.findIndex((stage) => stage.id === step);

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

  const renderChunkRow = (chunk: ChunkStatus) => {
    const isExpanded =
      expandedChunkIndex === chunk.chunkIndex &&
      expandedChunkFileIndex === chunk.fileIndex;
    // A file small enough to skip chunking has a single entry - just its
    // name. A split file gets the page range too, since every file's chunks
    // restart numbering at 1.
    const isMultiChunkFile =
      chunkStatuses.filter((cs) => cs.fileIndex === chunk.fileIndex).length > 1;
    const preview: PartialExtraction | undefined = chunk.result
      ? {
          summary: "",
          lore: chunk.result.lore,
          mechanicNotes: chunk.result.mechanicNotes,
          customTables: chunk.result.customTables,
        }
      : chunk.live;
    const previewCount = preview ? countPartialExtraction(preview) : 0;
    const canPreviewText = !!chunk.ocrMarkdown;
    const canPreview = previewCount > 0 || canPreviewText;

    const tone =
      chunk.status === "complete"
        ? "border-green-500/25 bg-green-500/[0.06]"
        : chunk.status === "failed"
          ? "border-red-500/30 bg-red-500/[0.06]"
          : chunk.status === "pending"
            ? "border-white/10 bg-white/[0.02]"
            : "border-purple-400/25 bg-purple-500/[0.06]";

    return (
      <div
        key={`${chunk.fileIndex}-${chunk.chunkIndex}`}
        className={`rounded-xl border transition-colors ${tone}`}
      >
        <div className="flex items-center gap-2.5 p-2.5">
          <span
            className={`shrink-0 ${
              chunk.status === "complete"
                ? "text-green-400"
                : chunk.status === "failed"
                  ? "text-red-400"
                  : chunk.status === "pending"
                    ? "text-blue-300/40"
                    : "text-purple-300"
            }`}
          >
            {chunk.status === "complete" && (
              <DynamicIcon name="CircleCheck" className="w-5 h-5" />
            )}
            {chunk.status === "failed" && (
              <DynamicIcon name="CircleX" className="w-5 h-5" />
            )}
            {(chunk.status === "ocr" || chunk.status === "summarizing") && (
              <DynamicIcon
                name="LoaderCircle"
                className="w-5 h-5 animate-spin"
              />
            )}
            {chunk.status === "pending" && (
              <DynamicIcon name="Clock" className="w-5 h-5" />
            )}
          </span>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">
              {chunk.fileName}
            </p>
            <p className="text-xs text-blue-300/60 truncate">
              {isMultiChunkFile && (
                <span className="text-blue-300/40">
                  Pages {chunk.pageStart}–{chunk.pageEnd} ·{" "}
                </span>
              )}
              {chunk.status === "pending" && "Queued"}
              {chunk.status === "ocr" && "Reading the pages…"}
              {chunk.status === "summarizing" &&
                (previewCount > 0
                  ? `Writing notes · ${previewCount} so far`
                  : "Writing notes…")}
              {chunk.status === "complete" &&
                `${chunk.result?.lore.length ?? 0} lore · ${
                  chunk.result?.mechanicNotes.length ?? 0
                } mechanics · ${chunk.result?.customTables.length ?? 0} tables`}
              {chunk.status === "failed" && (
                <span className="text-red-300/80" title={chunk.error}>
                  {chunk.error}
                </span>
              )}
            </p>
          </div>

          {canPreview && (
            <button
              onClick={() => {
                setExpandedChunkIndex(isExpanded ? null : chunk.chunkIndex);
                setExpandedChunkFileIndex(isExpanded ? null : chunk.fileIndex);
                setChunkPreviewTab(previewCount > 0 ? "notes" : "text");
              }}
              className="shrink-0 p-1.5 rounded-lg text-blue-200/70 hover:text-white hover:bg-white/10 transition-colors"
              title={isExpanded ? "Hide preview" : "Preview extracted content"}
            >
              <DynamicIcon
                name={isExpanded ? "EyeOff" : "Eye"}
                className="w-4 h-4"
              />
            </button>
          )}

          {chunk.status === "failed" && (
            <div className="flex gap-1 shrink-0">
              <button
                onClick={() => retryChunk(chunk.fileIndex, chunk.chunkIndex)}
                className="px-2 py-1 text-xs bg-blue-600/80 hover:bg-blue-600 text-white rounded-lg transition-colors flex items-center gap-1"
                title="Retry this chunk"
              >
                <DynamicIcon name="RefreshCw" className="w-3 h-3" />
                Retry
              </button>
              {chunk.rawSummarizeOutput && (
                <button
                  onClick={() =>
                    openRepairModal(chunk.fileIndex, chunk.chunkIndex)
                  }
                  className="px-2 py-1 text-xs bg-amber-600/80 hover:bg-amber-600 text-white rounded-lg transition-colors flex items-center gap-1"
                  title="Manually fix the model's output"
                >
                  <DynamicIcon name="Wrench" className="w-3 h-3" />
                  Fix
                </button>
              )}
            </div>
          )}
        </div>

        {isExpanded && canPreview && (
          <div className="px-2.5 pb-2.5 space-y-2">
            <div className="flex gap-1">
              {previewCount > 0 && (
                <button
                  onClick={() => setChunkPreviewTab("notes")}
                  className={`px-2 py-1 text-xs rounded-lg transition-colors ${
                    chunkPreviewTab === "notes"
                      ? "bg-purple-500/25 text-purple-100"
                      : "bg-white/5 text-blue-300/60 hover:bg-white/10"
                  }`}
                >
                  Notes
                </button>
              )}
              {canPreviewText && (
                <button
                  onClick={() => setChunkPreviewTab("text")}
                  className={`px-2 py-1 text-xs rounded-lg transition-colors ${
                    chunkPreviewTab === "text"
                      ? "bg-purple-500/25 text-purple-100"
                      : "bg-white/5 text-blue-300/60 hover:bg-white/10"
                  }`}
                >
                  Raw text
                </button>
              )}
            </div>

            {/* overflow-wrap:anywhere rather than break-words: only
                `anywhere` also shrinks the block's min-content width, and a
                single long token in the source (a rule of dashes, a table
                row, a URL) is otherwise wide enough to push the whole
                importer past the width of a phone. */}
            {chunkPreviewTab === "text" && canPreviewText && (
              <pre className="text-xs text-blue-200/70 whitespace-pre-wrap [overflow-wrap:anywhere] max-h-64 overflow-y-auto bg-black/25 rounded-lg p-2.5">
                {chunk.ocrMarkdown}
              </pre>
            )}

            {chunkPreviewTab === "notes" && preview && (
              <ExtractionPreview
                lore={preview.lore}
                mechanicNotes={preview.mechanicNotes}
                customTables={preview.customTables}
                streaming={chunk.status === "summarizing"}
                emptyMessage="No notes came out of this chunk."
                scrollClass="max-h-72 overflow-y-auto pr-1"
              />
            )}
          </div>
        )}
      </div>
    );
  };

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
        <FullScreenView
          title="Import from PDF"
          subtitle="Extract notes from RPG rulebooks & adventures"
          icon="FileUp"
          className="z-60"
          onClose={() => {
            closeModal();
            resetState();
          }}
          bodyClassName="p-3 sm:p-5"
          headerActions={
            isBusy ? (
              <span className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-lg bg-purple-500/10 ring-1 ring-purple-400/20 text-xs text-purple-100">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
                {extractedCount} extracted
              </span>
            ) : undefined
          }
          footer={
            <div
              className={`mx-auto flex items-center justify-end gap-3 p-4 ${
                hasWorkspace ? "max-w-6xl" : "max-w-2xl"
              }`}
            >
              {step === "idle" && selectedFiles.length > 0 && (
                <p className="mr-auto text-xs text-blue-300/50 hidden sm:block">
                  {selectedFiles.length} file
                  {selectedFiles.length === 1 ? "" : "s"} · ~{pageCount} pages ·
                  ~${estimatedCost.toFixed(3)} OCR
                </p>
              )}
              <button
                onClick={() => {
                  closeModal();
                  resetState();
                }}
                className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg transition-colors"
              >
                {step === "complete" ? "Close" : "Cancel"}
              </button>
              <button
                onClick={
                  importMode === "link" ? processLinkImport : processFiles
                }
                disabled={
                  (importMode === "link"
                    ? !linkUrl.trim()
                    : selectedFiles.length === 0) ||
                  step !== "idle" ||
                  (aiModel === "custom-model" && !customModelId.trim())
                }
                className="px-4 py-2 bg-linear-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center gap-2"
              >
                <DynamicIcon
                  name={isBusy ? "LoaderCircle" : "Sparkles"}
                  className={`w-4 h-4 ${isBusy ? "animate-spin" : ""}`}
                />
                {isBusy ? "Importing…" : "Start Import"}
              </button>
            </div>
          }
        >
          <div className={`mx-auto ${hasWorkspace ? "max-w-6xl" : "max-w-2xl"}`}>
            {/* min-w-0 on the columns: a grid item refuses to shrink below
                its content's min-content width by default, so one wide note
                (a markdown table, a long unbroken string) would otherwise
                stretch the whole workspace past the edge of a phone screen
                instead of scrolling inside its own card. */}
            <div
              className={
                hasWorkspace
                  ? "grid lg:grid-cols-12 gap-4 items-start"
                  : undefined
              }
            >
              {/* Left: what to import, and how far along it is */}
              <div
                className={`space-y-4 min-w-0 ${hasWorkspace ? "lg:col-span-5" : ""}`}
              >
                {/* Interrupted Import Recovery Banner */}
                {interruptedImport && step === "idle" && (
                  <div className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.07] p-4">
                    <div className="flex items-start gap-3">
                      <span className="shrink-0 w-9 h-9 rounded-xl bg-amber-500/15 ring-1 ring-amber-400/25 text-amber-300 flex items-center justify-center">
                        <DynamicIcon name="History" className="w-4 h-4" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-amber-100">
                          Unfinished import found
                        </p>
                        <p className="text-sm text-amber-200/70 mt-0.5 break-words">
                          {interruptedImport.fileName} —{" "}
                          {
                            interruptedImport.chunkStatuses.filter(
                              (cs) => cs.status === "complete",
                            ).length
                          }
                          /{interruptedImport.chunkStatuses.length} chunks
                          already done. Resume to pick up where it left off
                          without redoing finished pages.
                        </p>
                        <div className="flex gap-2 mt-3">
                          <button
                            onClick={resumeInterruptedImport}
                            disabled={isResuming}
                            className="px-3 py-1.5 bg-linear-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm rounded-lg transition-colors flex items-center gap-1.5"
                          >
                            <DynamicIcon
                              name={isResuming ? "LoaderCircle" : "RefreshCw"}
                              className={`w-4 h-4 ${isResuming ? "animate-spin" : ""}`}
                            />
                            {isResuming ? "Resuming…" : "Resume"}
                          </button>
                          <button
                            onClick={discardInterruptedImport}
                            disabled={isResuming}
                            className="px-3 py-1.5 bg-white/5 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed text-amber-100 text-sm rounded-lg transition-colors"
                          >
                            Discard
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Progress */}
                {isBusy && (
                  <div className="rounded-2xl border border-white/10 bg-linear-to-br from-purple-900/25 to-blue-900/10 p-4 space-y-3">
                    <div className="flex items-start gap-3">
                      <span
                        className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${
                          step === "complete"
                            ? "bg-green-500/15 ring-1 ring-green-400/25 text-green-300"
                            : "bg-purple-500/15 ring-1 ring-purple-400/25 text-purple-200"
                        }`}
                      >
                        <DynamicIcon
                          name={getStepIcon()}
                          className={`w-5 h-5 ${
                            step === "complete" ? "" : "animate-pulse"
                          }`}
                        />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-white">
                          {step === "complete"
                            ? "Import complete"
                            : (PIPELINE_STAGES[stageIndex]?.label ??
                              "Working…")}
                        </p>
                        <p className="text-xs text-blue-200/70 mt-0.5 break-words">
                          {statusMessage ||
                            PIPELINE_STAGES[stageIndex]?.hint ||
                            "Ready to use your imported content."}
                        </p>
                      </div>
                      <span className="shrink-0 text-2xl font-bold tabular-nums text-purple-200">
                        {Math.round(progress)}
                        <span className="text-sm font-semibold text-purple-300/60">
                          %
                        </span>
                      </span>
                    </div>

                    <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-linear-to-r from-purple-500 to-blue-400 transition-all duration-300"
                        style={{ width: `${progress}%` }}
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-1.5">
                      {PIPELINE_STAGES.map((stage, i) => {
                        const state =
                          i < stageIndex
                            ? "done"
                            : i === stageIndex
                              ? "active"
                              : "todo";
                        return (
                          <div
                            key={stage.id}
                            className={`rounded-lg px-2 py-1.5 flex items-center gap-1.5 text-[11px] font-medium ${
                              state === "done"
                                ? "bg-green-500/10 text-green-200 ring-1 ring-green-400/20"
                                : state === "active"
                                  ? "bg-purple-500/15 text-purple-100 ring-1 ring-purple-400/25"
                                  : "bg-white/[0.03] text-blue-300/40"
                            }`}
                          >
                            <DynamicIcon
                              name={state === "done" ? "Check" : stage.icon}
                              className={`w-3.5 h-3.5 shrink-0 ${
                                state === "active" ? "animate-pulse" : ""
                              }`}
                            />
                            <span className="truncate">{stage.label}</span>
                          </div>
                        );
                      })}
                    </div>

                    {chunkStatuses.length > 1 && (
                      <p className="text-[11px] text-blue-300/50">
                        {completeChunks.length}/{chunkStatuses.length} chunks
                        done
                        {failedChunks.length > 0 &&
                          ` · ${failedChunks.length} failed`}
                      </p>
                    )}
                  </div>
                )}

                {/* Error State */}
                {step === "error" && (
                  <div className="rounded-2xl border border-red-500/30 bg-red-500/[0.07] p-4">
                    <div className="flex items-start gap-3">
                      <span className="shrink-0 w-9 h-9 rounded-xl bg-red-500/15 ring-1 ring-red-400/25 text-red-300 flex items-center justify-center">
                        <DynamicIcon name="TriangleAlert" className="w-4 h-4" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-red-100">
                          Import failed
                        </p>
                        <p className="text-sm text-red-200/80 mt-0.5 break-words max-h-32 overflow-y-auto">
                          {statusMessage}
                        </p>
                        <button
                          onClick={resetState}
                          className="mt-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 text-red-100 text-sm rounded-lg transition-colors"
                        >
                          Try again
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Setup */}
                {step === "idle" && (
                  <>
                    {/* Import Mode Toggle */}
                    <div className="flex gap-1 p-1 bg-white/5 rounded-xl">
                      {(
                        [
                          { id: "file" as const, label: "Upload files", icon: "Upload" },
                          { id: "link" as const, label: "From a link", icon: "Link" },
                        ]
                      ).map((mode) => (
                        <button
                          key={mode.id}
                          onClick={() => setImportMode(mode.id)}
                          className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${
                            importMode === mode.id
                              ? "bg-linear-to-r from-purple-600 to-blue-600 text-white"
                              : "text-blue-300/70 hover:text-white hover:bg-white/5"
                          }`}
                        >
                          <DynamicIcon name={mode.icon} className="w-4 h-4" />
                          {mode.label}
                        </button>
                      ))}
                    </div>

                    {importMode === "link" ? (
                      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-2">
                        <label className="block text-sm font-semibold text-white">
                          Document link
                        </label>
                        <input
                          type="url"
                          value={linkUrl}
                          onChange={(e) => setLinkUrl(e.target.value)}
                          placeholder="https://drive.google.com/file/d/.../view"
                          className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-blue-300/40 focus:outline-none focus:border-purple-400/40"
                        />
                        <p className="text-xs text-blue-300/50">
                          The file must be shared as “Anyone with the link”.
                          Mistral fetches it directly, so there isn&apos;t an
                          upload size limit here — but very large files can
                          trigger Drive&apos;s virus-scan warning page instead
                          of the file itself; use the upload tab if that
                          happens.
                        </p>
                      </div>
                    ) : (
                      <div
                        onDrop={handleDrop}
                        onDragOver={handleDragOver}
                        onClick={() => fileInputRef.current?.click()}
                        className={`rounded-2xl border-2 border-dashed p-8 text-center cursor-pointer transition-all ${
                          selectedFiles.length > 0
                            ? "border-green-500/40 bg-green-500/[0.06]"
                            : "border-white/15 hover:border-purple-400/50 hover:bg-purple-500/[0.06]"
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
                        <span
                          className={`mx-auto mb-3 w-14 h-14 rounded-2xl flex items-center justify-center ${
                            selectedFiles.length > 0
                              ? "bg-green-500/15 ring-1 ring-green-400/25 text-green-300"
                              : "bg-purple-500/15 ring-1 ring-purple-400/25 text-purple-200"
                          }`}
                        >
                          <DynamicIcon
                            name={
                              selectedFiles.length > 0 ? "FilePlus" : "Upload"
                            }
                            className="w-6 h-6"
                          />
                        </span>
                        <p className="font-semibold text-white">
                          {selectedFiles.length > 0
                            ? "Drop more files, or click to add"
                            : "Drop your rulebooks here"}
                        </p>
                        <p className="text-sm text-blue-300/50 mt-1">
                          PDF, PNG, JPEG, WebP, TXT, MD · up to{" "}
                          {MAX_PDF_SIZE_MB}MB each
                        </p>
                      </div>
                    )}

                    {/* Selected Files */}
                    {importMode === "file" && selectedFiles.length > 0 && (
                      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 space-y-2">
                        <div className="flex items-center justify-between px-1">
                          <p className="text-sm font-semibold text-white">
                            {selectedFiles.length} file
                            {selectedFiles.length === 1 ? "" : "s"} ready
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
                            className="text-xs text-blue-300/50 hover:text-red-300 transition-colors"
                          >
                            Clear all
                          </button>
                        </div>
                        <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1">
                          {selectedFiles.map((file, index) => {
                            const filePages = Math.max(
                              1,
                              Math.ceil(file.size / (100 * 1024)),
                            );
                            return (
                              <div
                                key={`${file.name}-${index}`}
                                className="flex items-center gap-2.5 p-2 bg-white/[0.04] rounded-xl"
                              >
                                <span className="shrink-0 w-8 h-8 rounded-lg bg-blue-500/15 ring-1 ring-blue-400/20 text-blue-300 flex items-center justify-center">
                                  <DynamicIcon name="FileText" className="w-4 h-4" />
                                </span>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm text-white truncate">
                                    {file.name}
                                  </p>
                                  <p className="text-xs text-blue-300/50">
                                    {(file.size / 1024 / 1024).toFixed(2)} MB ·
                                    ~{filePages} pages
                                  </p>
                                </div>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeFile(index);
                                  }}
                                  className="shrink-0 p-1.5 rounded-lg text-blue-300/40 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                                  title="Remove"
                                >
                                  <DynamicIcon name="X" className="w-4 h-4" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                        <div className="flex items-center gap-2 px-1 pt-1 text-xs text-amber-200/70 border-t border-white/5">
                          <span className="shrink-0 text-amber-300/80">
                            <DynamicIcon name="Receipt" className="w-3.5 h-3.5" />
                          </span>
                          <span>
                            ~{pageCount} pages · about $
                            {estimatedCost.toFixed(3)} of OCR, billed to your
                            own Mistral key (the notes model costs extra).
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Model */}
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <label className="text-sm font-semibold text-white">
                          Model that writes the notes
                        </label>
                        <button
                          type="button"
                          onClick={resetPDFImporterSettings}
                          className="text-xs text-blue-300/40 hover:text-blue-200 transition-colors"
                          title="Reset the model and advanced options below back to their defaults"
                        >
                          Reset
                        </button>
                      </div>
                      <select
                        value={aiModel}
                        onChange={(e) => setAIModel(e.target.value)}
                        className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-purple-400/40"
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
                      <p className="text-xs text-blue-300/40">
                        BYOK only — add a provider key in Settings to unlock its
                        models. Your choice is remembered.
                      </p>
                      {!Object.values(PROVIDER_KEY_FIELD).some(
                        (field) => keys[field],
                      ) && (
                        <p className="text-xs text-amber-300/80 flex items-center gap-1.5">
                          <DynamicIcon
                            name="TriangleAlert"
                            className="w-3.5 h-3.5"
                          />
                          No API keys configured yet — add one in Settings to
                          pick a model.
                        </p>
                      )}
                      {aiModel === "custom-model" && (
                        <div className="space-y-2 pt-1">
                          <select
                            value={customModelProvider}
                            onChange={(e) =>
                              setCustomModelProvider(
                                e.target.value as BYOKProvider,
                              )
                            }
                            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-purple-400/40"
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
                            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-blue-300/40 focus:outline-none focus:border-purple-400/40"
                          />
                        </div>
                      )}
                    </div>

                    {/* Advanced Options */}
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
                      <button
                        onClick={() => setShowAdvanced(!showAdvanced)}
                        className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/[0.03] transition-colors"
                      >
                        <span className="flex items-center gap-2 text-sm font-semibold text-white">
                          <span className="text-blue-300/60">
                            <DynamicIcon
                              name="SlidersHorizontal"
                              className="w-4 h-4"
                            />
                          </span>
                          Advanced options
                        </span>
                        <DynamicIcon
                          name={showAdvanced ? "ChevronUp" : "ChevronDown"}
                          className="w-4 h-4 text-blue-300/40"
                        />
                      </button>
                      {showAdvanced && (
                        <div className="px-4 pb-4 space-y-4 border-t border-white/5 pt-4">
                          {/* Max Output Tokens */}
                          <div>
                            <div className="flex items-center justify-between">
                              <label className="text-sm font-medium text-blue-100">
                                Max output size
                              </label>
                              <span className="text-xs tabular-nums text-purple-200">
                                {maxOutputTokens.toLocaleString()} tokens
                              </span>
                            </div>
                            <input
                              type="range"
                              min={4000}
                              max={getModelMaxOutput()}
                              step={1000}
                              value={maxOutputTokens}
                              onChange={(e) =>
                                setMaxOutputTokens(Number(e.target.value))
                              }
                              className="w-full h-2 mt-2 bg-white/5 rounded-lg appearance-none cursor-pointer accent-purple-500"
                            />
                            <div className="flex justify-between text-[11px] text-blue-300/40 mt-1">
                              <span>4K (fast)</span>
                              <span>
                                {(getModelMaxOutput() / 1000).toFixed(0)}K (max)
                              </span>
                            </div>
                            <p className="text-xs text-blue-300/50 mt-1">
                              Higher values extract more per response. Raise it
                              if content is being cut off.
                            </p>
                          </div>

                          {/* Continuation Rounds */}
                          <div>
                            <div className="flex items-center justify-between">
                              <label className="text-sm font-medium text-blue-100">
                                Continuation rounds
                              </label>
                              <span className="text-xs tabular-nums text-purple-200">
                                {maxContinuationRounds}
                              </span>
                            </div>
                            <input
                              type="range"
                              min={0}
                              max={MAX_CONTINUATION_ROUNDS_LIMIT}
                              step={1}
                              value={maxContinuationRounds}
                              onChange={(e) =>
                                setMaxContinuationRounds(Number(e.target.value))
                              }
                              className="w-full h-2 mt-2 bg-white/5 rounded-lg appearance-none cursor-pointer accent-purple-500"
                            />
                            <div className="flex justify-between text-[11px] text-blue-300/40 mt-1">
                              <span>0 (off)</span>
                              <span>
                                {MAX_CONTINUATION_ROUNDS_LIMIT} (thorough)
                              </span>
                            </div>
                            <p className="text-xs text-blue-300/50 mt-1">
                              When a response runs out of length, ask the model
                              to carry on with the notes it hasn&apos;t written
                              yet. Each round re-sends the document, so higher
                              values cost more.
                            </p>
                          </div>

                          {/* Custom Instructions */}
                          <div>
                            <label className="block text-sm font-medium text-blue-100 mb-1.5">
                              Custom instructions
                            </label>
                            <textarea
                              value={customInstructions}
                              onChange={(e) =>
                                setCustomInstructions(e.target.value)
                              }
                              placeholder="e.g. Focus on monster stat blocks, ignore fluff text…"
                              rows={3}
                              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-blue-300/40 resize-none focus:outline-none focus:border-purple-400/40"
                            />
                          </div>

                          {/* Merge Duplicates */}
                          <label className="flex items-start gap-2.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={mergeDuplicates}
                              onChange={(e) =>
                                setMergeDuplicates(e.target.checked)
                              }
                              className="mt-0.5 accent-purple-500"
                            />
                            <span>
                              <span className="block text-sm font-medium text-blue-100">
                                Merge duplicate entries
                              </span>
                              <span className="block text-xs text-blue-300/50">
                                After import, combine notes and tables that were
                                split across chunk boundaries or extracted twice
                                under different names.
                              </span>
                            </span>
                          </label>
                        </div>
                      )}
                    </div>

                    {/* Saved Imports */}
                    {savedImports.length > 0 && (
                      <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
                        <button
                          onClick={() => setShowSavedImports(!showSavedImports)}
                          className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/[0.03] transition-colors"
                        >
                          <span className="flex items-center gap-2 text-sm font-semibold text-white">
                            <span className="text-green-300/70">
                              <DynamicIcon name="History" className="w-4 h-4" />
                            </span>
                            Saved imports
                            <span className="px-1.5 py-0.5 rounded bg-white/5 text-[11px] text-blue-200/60 tabular-nums">
                              {savedImports.length}
                            </span>
                          </span>
                          <DynamicIcon
                            name={showSavedImports ? "ChevronUp" : "ChevronDown"}
                            className="w-4 h-4 text-blue-300/40"
                          />
                        </button>
                        {showSavedImports && (
                          <div className="p-3 space-y-2 max-h-[28rem] overflow-y-auto border-t border-white/5">
                            {savedImports.map((imp) => {
                              const totalNotes =
                                imp.lore.length + imp.mechanicNotes.length;
                              const isExpanded = expandedImport === imp.id;
                              return (
                                <div
                                  key={imp.id}
                                  className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden"
                                >
                                  <div
                                    onClick={() =>
                                      setExpandedImport(
                                        isExpanded ? null : imp.id,
                                      )
                                    }
                                    className="flex items-center gap-2.5 p-2.5 cursor-pointer hover:bg-white/[0.04] transition-colors"
                                  >
                                    <span className="shrink-0 w-8 h-8 rounded-lg bg-green-500/15 ring-1 ring-green-400/20 text-green-300 flex items-center justify-center">
                                      <DynamicIcon name="FileCheck" className="w-4 h-4" />
                                    </span>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium text-white truncate">
                                        {imp.fileName}
                                      </p>
                                      <p className="text-xs text-blue-300/50">
                                        {new Date(
                                          imp.timestamp,
                                        ).toLocaleDateString()}{" "}
                                        · {totalNotes} notes ·{" "}
                                        {imp.customTables.length} tables
                                      </p>
                                    </div>
                                    {imp.failedPages &&
                                      imp.failedPages.length > 0 && (
                                        <span className="shrink-0 px-2 py-0.5 rounded-full bg-red-500/15 text-red-200 text-[10px] ring-1 ring-red-400/20">
                                          {imp.failedPages.length} failed
                                        </span>
                                      )}
                                    <DynamicIcon
                                      name={
                                        isExpanded ? "ChevronUp" : "ChevronDown"
                                      }
                                      className="w-4 h-4 text-blue-300/40 shrink-0"
                                    />
                                  </div>

                                  {isExpanded && (
                                    <div className="px-2.5 pb-2.5 space-y-3 border-t border-white/5 pt-3">
                                      <ExtractionPreview
                                        lore={imp.lore}
                                        mechanicNotes={imp.mechanicNotes}
                                        customTables={imp.customTables}
                                        emptyMessage="This import came back empty."
                                        scrollClass="max-h-80 overflow-y-auto pr-1"
                                      />

                                      {imp.failedPages &&
                                        imp.failedPages.length > 0 && (
                                          <div className="rounded-xl border border-red-500/20 bg-red-500/[0.05] p-2.5">
                                            <p className="text-xs font-semibold text-red-200 mb-1 flex items-center gap-1.5">
                                              <DynamicIcon
                                                name="TriangleAlert"
                                                className="w-3.5 h-3.5"
                                              />
                                              Pages that failed (
                                              {imp.failedPages.length})
                                            </p>
                                            <div className="space-y-1 max-h-28 overflow-y-auto">
                                              {imp.failedPages.map((fp, i) => (
                                                <p
                                                  key={i}
                                                  className="text-xs text-red-200/70 break-words"
                                                  title={fp.reason}
                                                >
                                                  • {fp.fileName} p.
                                                  {fp.pageStart}
                                                  {fp.pageEnd !== fp.pageStart
                                                    ? `–${fp.pageEnd}`
                                                    : ""}
                                                  : {fp.reason}
                                                </p>
                                              ))}
                                            </div>
                                          </div>
                                        )}

                                      <div className="flex gap-2">
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            useSavedImport(imp);
                                          }}
                                          className="flex-1 px-3 py-2 bg-linear-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white text-sm rounded-lg transition-colors flex items-center justify-center gap-1.5"
                                        >
                                          <DynamicIcon
                                            name="Download"
                                            className="w-4 h-4"
                                          />
                                          Use this import
                                        </button>
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            deleteSavedImport(imp.id);
                                          }}
                                          className="px-3 py-2 bg-white/5 hover:bg-red-500/15 text-red-300 rounded-lg transition-colors"
                                          title="Delete this saved import"
                                        >
                                          <DynamicIcon
                                            name="Trash2"
                                            className="w-4 h-4"
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

              {/* Right: the notes, as they're written */}
              {hasWorkspace && (
                <div className="lg:col-span-7 min-w-0 mt-4 lg:mt-0">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
                    <div className="px-3 sm:px-4 py-3 border-b border-white/10 flex items-center gap-2 flex-wrap">
                      <span className="text-purple-300 shrink-0">
                        <DynamicIcon name="Sparkles" className="w-4 h-4" />
                      </span>
                      <h3 className="text-sm font-semibold text-white">
                        {isBusy && step !== "complete"
                          ? "Notes being written"
                          : "Extracted notes"}
                      </h3>
                      <span className="px-1.5 py-0.5 rounded bg-white/5 text-[11px] text-blue-200/60 tabular-nums">
                        {extractedCount}
                      </span>

                      <div className="ml-auto flex items-center gap-1 p-0.5 bg-white/5 rounded-lg">
                        {(
                          [
                            { id: "notes" as const, label: "Notes" },
                            { id: "sources" as const, label: "Sources" },
                          ]
                        ).map((tab) => (
                          <button
                            key={tab.id}
                            onClick={() => setWorkspaceTab(tab.id)}
                            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 ${
                              workspaceTab === tab.id
                                ? "bg-white/10 text-white"
                                : "text-blue-300/60 hover:text-white"
                            }`}
                          >
                            {tab.label}
                            {tab.id === "sources" &&
                              failedChunks.length > 0 && (
                                <span className="px-1 rounded bg-red-500/20 text-red-200 text-[10px]">
                                  {failedChunks.length}
                                </span>
                              )}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* The inner scroll boxes are a desktop affordance: the
                        two columns sit side by side and each keeps its own
                        height. Stacked on mobile there is only one column,
                        so a second scroller inside the page's own scroll
                        just fights the finger that's trying to scroll the
                        page - the panel grows and the body scrolls instead. */}
                    <div className="p-3">
                      {workspaceTab === "notes" ? (
                        <ExtractionPreview
                          lore={extracted.lore}
                          mechanicNotes={extracted.mechanicNotes}
                          customTables={extracted.customTables}
                          streaming={isBusy && step !== "complete"}
                          emptyMessage="Notes will show up here as they're written."
                          scrollClass="lg:max-h-[calc(100dvh-20rem)] lg:overflow-y-auto lg:pr-1"
                        />
                      ) : (
                        <div className="space-y-2 lg:max-h-[calc(100dvh-20rem)] lg:overflow-y-auto lg:pr-1">
                          {chunkStatuses.length === 0 && (
                            <p className="text-xs text-blue-300/50 italic py-2">
                              Nothing being processed yet.
                            </p>
                          )}
                          {chunkStatuses.map(renderChunkRow)}

                          {failedChunks.length > 0 &&
                            completeChunks.length > 0 && (
                              <div className="pt-2 border-t border-white/10">
                                <button
                                  onClick={completeWithCurrentResults}
                                  className="w-full px-4 py-2 bg-linear-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
                                >
                                  <DynamicIcon
                                    name="Download"
                                    className="w-4 h-4"
                                  />
                                  Finish with {completeChunks.length} chunk
                                  {completeChunks.length === 1 ? "" : "s"}
                                </button>
                                <p className="text-xs text-blue-300/40 text-center mt-1">
                                  Skips {failedChunks.length} failed chunk
                                  {failedChunks.length === 1 ? "" : "s"}
                                </p>
                              </div>
                            )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </FullScreenView>
      )}

      {/* JSON Repair Modal - for manually fixing broken chunk output */}
      {repairModalOpen && repairChunkIndex !== null && repairFileIndex !== null && (
        <FullScreenView
          title="Fix the model's output"
          subtitle={(() => {
            const chunk = chunkStatuses.find(
              (cs) =>
                cs.fileIndex === repairFileIndex &&
                cs.chunkIndex === repairChunkIndex,
            );
            if (!chunk) return undefined;
            return `${chunk.fileName} — pages ${chunk.pageStart}–${chunk.pageEnd}`;
          })()}
          icon="Wrench"
          className="z-70"
          onClose={() => {
            setRepairModalOpen(false);
            setRepairChunkIndex(null);
            setRepairFileIndex(null);
            setRepairContent("");
            setRepairError("");
          }}
          bodyClassName="p-0"
          footer={
            <div className="flex items-center justify-between gap-3 p-4">
              <div className="text-xs text-blue-300/40 hidden sm:block">
                Look for missing commas, unclosed brackets, or truncated strings
              </div>
              <div className="flex gap-2 ml-auto">
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
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 text-blue-100 rounded-lg transition-colors"
                >
                  Validate
                </button>
                <button
                  onClick={() => {
                    setRepairModalOpen(false);
                    setRepairChunkIndex(null);
                    setRepairFileIndex(null);
                    setRepairContent("");
                    setRepairError("");
                  }}
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleRepairSave(repairContent)}
                  className="px-4 py-2 bg-linear-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white rounded-lg transition-colors"
                >
                  Save &amp; apply
                </button>
              </div>
            </div>
          }
        >
          <div className="h-full flex flex-col">
            <div className="px-4 py-2.5 bg-red-500/[0.07] border-b border-red-500/20 shrink-0">
              <p className="text-sm text-red-200">
                <span className="font-semibold">Error:</span> {repairError}
              </p>
              <p className="text-xs text-red-200/60 mt-0.5">
                The AI output couldn&apos;t be parsed. Fix the JSON below and
                apply it to recover this chunk.
              </p>
            </div>

            <div className="flex-1 p-4 overflow-hidden flex flex-col min-h-0">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-blue-300/50">
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
                  className="px-3 py-1 text-xs bg-white/5 hover:bg-white/10 text-blue-200 rounded-lg transition-colors"
                >
                  Format JSON
                </button>
              </div>
              <textarea
                value={repairContent}
                onChange={(e) => setRepairContent(e.target.value)}
                className="flex-1 w-full min-h-[400px] bg-white/5 border border-white/10 rounded-lg p-3 font-mono text-sm text-blue-100 resize-y focus:outline-none focus:border-purple-400/40"
                placeholder="Paste or edit JSON content here..."
                spellCheck={false}
              />
            </div>
          </div>
        </FullScreenView>
      )}
    </>
  );
}
