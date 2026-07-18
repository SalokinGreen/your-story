"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useNotification } from "@/app/misc/NotificationContext";
import { useAuth } from "@/app/misc/AuthContext";
import { useAPIKeys } from "@/app/misc/APIKeysContext";
import { getAuthToken } from "@/app/misc/getAuthToken";
import { DynamicIcon } from "@/app/components/DynamicIcon";
import {
  validateOCRFile,
  calculateOCRCost,
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
// Timeout for summarize requests (4 minutes - server allows 5)
const SUMMARIZE_TIMEOUT_MS = 240000;
// Retry attempts for failed requests
const MAX_RETRIES = 2;

/**
 * Helper to run promises with limited concurrency
 */
async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number,
  onProgress?: (completed: number, total: number) => void
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
  maxRetries: number = MAX_RETRIES
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
          }/${maxRetries})...`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error("Request failed after retries");
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
 * Split a large PDF into smaller chunks using pdf-lib
 * Returns an array of base64-encoded PDF chunks
 */
async function splitPDFIntoChunks(
  file: File,
  onProgress?: (message: string) => void
): Promise<{ base64: string; pageStart: number; pageEnd: number }[]> {
  onProgress?.("Loading PDF for splitting...");

  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer, {
    ignoreEncryption: true,
  });
  const totalPages = pdfDoc.getPageCount();

  const chunks: { base64: string; pageStart: number; pageEnd: number }[] = [];

  // Calculate how many pages per chunk based on file size
  const avgPageSize = file.size / totalPages;
  const targetChunkSize = MAX_CHUNK_SIZE_MB * 1024 * 1024;
  const pagesPerChunk = Math.max(
    5,
    Math.min(PAGES_PER_CHUNK, Math.floor(targetChunkSize / avgPageSize))
  );

  const totalChunks = Math.ceil(totalPages / pagesPerChunk);

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    const startPage = chunkIndex * pagesPerChunk;
    const endPage = Math.min(startPage + pagesPerChunk - 1, totalPages - 1);

    onProgress?.(
      `Splitting chunk ${chunkIndex + 1}/${totalChunks} (pages ${
        startPage + 1
      }-${endPage + 1})...`
    );

    // Create a new PDF with just the pages for this chunk
    const chunkDoc = await PDFDocument.create();
    const pageIndicesToCopy = Array.from(
      { length: endPage - startPage + 1 },
      (_, i) => startPage + i
    );

    const copiedPages = await chunkDoc.copyPages(pdfDoc, pageIndicesToCopy);
    copiedPages.forEach((page) => chunkDoc.addPage(page));

    // Convert to base64
    const chunkBytes = await chunkDoc.save();
    const base64 = btoa(
      new Uint8Array(chunkBytes).reduce(
        (data, byte) => data + String.fromCharCode(byte),
        ""
      )
    );

    chunks.push({
      base64,
      pageStart: startPage + 1, // 1-indexed for display
      pageEnd: endPage + 1,
    });
  }

  return chunks;
}

// SavedPDFImport interface moved to localPDFImportManager.ts as LocalPDFImport
// Re-export for backward compatibility in this file
type SavedPDFImport = LocalPDFImport;

// Community import data structure (from API)
interface CommunityImport {
  id: string;
  name: string;
  description: string | null;
  source_book: string | null;
  system: string | null;
  tags: string[];
  lore_count: number;
  mechanics_count: number;
  tables_count: number;
  downloads: number;
  is_public: boolean;
  created_at: string;
  user_id: string;
  // Full content (only when fetching single import)
  lore?: StoryLore[];
  mechanic_notes?: StoryLore[];
  custom_tables?: CustomTable[];
}

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
  const { user } = useAuth();
  const { keys } = useAPIKeys();
  const { addNotification } = useNotification();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<ProcessingStep>("idle");
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [estimatedCost, setEstimatedCost] = useState(0);
  const [extractedMarkdown, setExtractedMarkdown] = useState("");
  const [pageCount, setPageCount] = useState(0);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);

  // AI model selection for summarization
  const [aiModel, setAIModel] = useState("ministral-14b-2512");

  // Advanced options
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [customOpenRouterModel, setCustomOpenRouterModel] = useState("");
  const [customInstructions, setCustomInstructions] = useState("");
  const [maxOutputTokens, setMaxOutputTokens] = useState(16000);

  // Saved imports
  const [savedImports, setSavedImports] = useState<SavedPDFImport[]>([]);
  const [showSavedImports, setShowSavedImports] = useState(false);
  const [expandedImport, setExpandedImport] = useState<string | null>(null);

  // Community imports
  const [showCommunityImports, setShowCommunityImports] = useState(false);
  const [communityImports, setCommunityImports] = useState<CommunityImport[]>(
    []
  );
  const [communityLoading, setCommunityLoading] = useState(false);
  const [communitySearch, setCommunitySearch] = useState("");
  const [communitySystem, setCommunitySystem] = useState("");
  const [communitySort, setCommunitySort] = useState<"recent" | "popular">(
    "popular"
  );
  const [communityTotal, setCommunityTotal] = useState(0);

  // Share modal state
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareData, setShareData] = useState<SavedPDFImport | null>(null);
  const [shareName, setShareName] = useState("");
  const [shareDescription, setShareDescription] = useState("");
  const [shareSourceBook, setShareSourceBook] = useState("");
  const [shareSystem, setShareSystem] = useState("");
  const [shareTags, setShareTags] = useState("");
  const [sharePublic, setSharePublic] = useState(true);
  const [shareUploading, setShareUploading] = useState(false);

  // Chunk tracking state for large PDFs
  const [chunkStatuses, setChunkStatuses] = useState<ChunkStatus[]>([]);
  const [showChunkDetails, setShowChunkDetails] = useState(false);

  // JSON Repair Modal state - for manual fixing of broken chunk output
  const [repairModalOpen, setRepairModalOpen] = useState(false);
  const [repairChunkIndex, setRepairChunkIndex] = useState<number | null>(null);
  const [repairContent, setRepairContent] = useState("");
  const [repairError, setRepairError] = useState("");

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
    [selectedFiles]
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
        "success"
      );
      setIsOpen(false);
    },
    [onImportComplete, addNotification]
  );

  // Fetch community imports
  const fetchCommunityImports = useCallback(async () => {
    setCommunityLoading(true);
    try {
      const params = new URLSearchParams();
      if (communitySearch) params.set("search", communitySearch);
      if (communitySystem) params.set("system", communitySystem);
      params.set("sort", communitySort);
      params.set("limit", "20");

      const response = await fetch(`/api/book-imports?${params}`);

      // Handle non-JSON responses (e.g., if table doesn't exist yet)
      if (!response.ok) {
        const text = await response.text();
        console.error("Community imports API error:", response.status, text);
        // Don't show error notification for 403/404 - table might not exist yet
        if (response.status !== 403 && response.status !== 404) {
          addNotification("Failed to load community imports", "failure");
        }
        return;
      }

      const data = await response.json();

      if (data.error) {
        addNotification(data.error, "failure");
        return;
      }

      setCommunityImports(data.imports || []);
      setCommunityTotal(data.total || 0);
    } catch (error) {
      console.error("Failed to fetch community imports:", error);
      // Silently fail - table might not be set up yet
    } finally {
      setCommunityLoading(false);
    }
  }, [communitySearch, communitySystem, communitySort, addNotification]);

  // Load community imports when section opens
  useEffect(() => {
    if (showCommunityImports && communityImports.length === 0) {
      fetchCommunityImports();
    }
  }, [showCommunityImports, fetchCommunityImports, communityImports.length]);

  // Use a community import
  const useCommunityImport = useCallback(
    async (imp: CommunityImport) => {
      try {
        // Fetch full import data if not already loaded
        const token = await getAuthToken();
        const response = await fetch(`/api/book-imports/${imp.id}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });

        if (!response.ok) {
          const text = await response.text();
          console.error("Community import fetch error:", response.status, text);
          addNotification("Failed to load import", "failure");
          return;
        }

        const data = await response.json();

        if (data.error) {
          addNotification(data.error, "failure");
          return;
        }

        const fullImport = data.import;
        onImportComplete({
          lore: fullImport.lore || [],
          mechanicNotes: fullImport.mechanic_notes || [],
          customTables: fullImport.custom_tables || [],
          summary: `Imported from: ${fullImport.name}`,
        });

        addNotification(
          `Loaded ${
            fullImport.lore_count + fullImport.mechanics_count
          } notes, ${fullImport.tables_count} tables from "${fullImport.name}"`,
          "success"
        );
        setIsOpen(false);
      } catch (error) {
        console.error("Failed to use community import:", error);
        addNotification("Failed to load import", "failure");
      }
    },
    [onImportComplete, addNotification]
  );

  // Share a saved import to community
  const shareImportToCommunity = useCallback(async () => {
    if (!shareData || !user) {
      addNotification("Please sign in to share imports", "warning");
      return;
    }

    if (!shareName.trim()) {
      addNotification("Please enter a name for this import", "warning");
      return;
    }

    setShareUploading(true);
    try {
      const token = await getAuthToken();
      const response = await fetch("/api/book-imports", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          name: shareName.trim(),
          description: shareDescription.trim() || null,
          source_book: shareSourceBook.trim() || null,
          system: shareSystem.trim() || null,
          tags: shareTags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
          lore: shareData.lore,
          mechanicNotes: shareData.mechanicNotes,
          customTables: shareData.customTables,
          is_public: sharePublic,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        console.error("Share import error:", response.status, text);
        addNotification(
          "Failed to share import. Make sure you're signed in.",
          "failure"
        );
        return;
      }

      const data = await response.json();

      if (data.error) {
        addNotification(data.error, "failure");
        return;
      }

      addNotification(
        `Successfully shared "${shareName}" to the community!`,
        "success"
      );
      setShowShareModal(false);
      setShareData(null);
      // Reset form
      setShareName("");
      setShareDescription("");
      setShareSourceBook("");
      setShareSystem("");
      setShareTags("");
      setSharePublic(true);
    } catch (error) {
      console.error("Failed to share import:", error);
      addNotification("Failed to share import", "failure");
    } finally {
      setShareUploading(false);
    }
  }, [
    shareData,
    user,
    shareName,
    shareDescription,
    shareSourceBook,
    shareSystem,
    shareTags,
    sharePublic,
    addNotification,
  ]);

  // Open share modal for a saved import
  const openShareModal = useCallback((imp: SavedPDFImport) => {
    setShareData(imp);
    setShareName(imp.fileName);
    setShareDescription(imp.summary || "");
    setShowShareModal(true);
  }, []);

  // Retry a failed chunk
  const retryChunk = useCallback(
    async (chunkIndex: number) => {
      const chunk = chunkStatuses.find((cs) => cs.chunkIndex === chunkIndex);
      if (!chunk || !chunk.ocrMarkdown) {
        addNotification("Cannot retry: OCR data not available", "warning");
        return;
      }

      const token = await getAuthToken();
      if (!token) {
        addNotification("Please sign in to retry", "warning");
        return;
      }

      // Update status to summarizing
      setChunkStatuses((prev) =>
        prev.map((cs) =>
          cs.chunkIndex === chunkIndex
            ? { ...cs, status: "summarizing", error: undefined }
            : cs
        )
      );

      try {
        const summarizeResponse = await fetchWithRetry(
          "/api/ocr/summarize",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              markdown: chunk.ocrMarkdown,
              focus: ["all"],
              customInstructions:
                customInstructions +
                `\n\nNote: This is pages ${chunk.pageStart}-${chunk.pageEnd} of a larger document.`,
              model:
                aiModel === "custom-openrouter"
                  ? customOpenRouterModel
                  : aiModel,
              maxTokens: maxOutputTokens,
              openRouterKey: keys.openRouterKey,
              deepseekKey: keys.deepseekKey,
            }),
          },
          SUMMARIZE_TIMEOUT_MS,
          MAX_RETRIES
        );

        if (!summarizeResponse.ok) {
          const errorMsg = await summarizeResponse.text();
          setChunkStatuses((prev) =>
            prev.map((cs) =>
              cs.chunkIndex === chunkIndex
                ? { ...cs, status: "failed", error: errorMsg }
                : cs
            )
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
                : cs
            )
          );
          addNotification(
            "Retry failed: JSON parse error. You can try manual fix.",
            "warning"
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
              : cs
          )
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
              : cs
          )
        );
        addNotification(`Retry failed: ${err.message}`, "failure");
      }
    },
    [
      chunkStatuses,
      customInstructions,
      aiModel,
      customOpenRouterModel,
      maxOutputTokens,
      keys,
      addNotification,
    ]
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
    [chunkStatuses, addNotification]
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
              : cs
          )
        );

        // Close modal
        setRepairModalOpen(false);
        setRepairChunkIndex(null);
        setRepairContent("");
        setRepairError("");

        addNotification(
          `Chunk ${repairChunkIndex + 1} recovered from fixed JSON!`,
          "success"
        );
      } catch (err) {
        addNotification(
          `Invalid JSON: ${err instanceof Error ? err.message : "Parse error"}`,
          "warning"
        );
      }
    },
    [repairChunkIndex, addNotification]
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
      (cs) => cs.status === "complete"
    ).length;
    const failedCount = chunkStatuses.filter(
      (cs) => cs.status === "failed"
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
      failedCount > 0 ? "warning" : "success"
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
      (m) => m.model === aiModel || m.original_model === aiModel
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
          setEstimatedCost((prev) => prev + calculateOCRCost(totalPages));
        }
      }
    },
    [addNotification]
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
          setEstimatedCost((prev) => prev + calculateOCRCost(totalPages));
        }
      }
    },
    [addNotification]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const processFiles = async () => {
    if (selectedFiles.length === 0 || !user) {
      addNotification("Please select at least one file and sign in", "warning");
      return;
    }

    const token = await getAuthToken();
    if (!token) {
      addNotification("Please sign in to use PDF import", "warning");
      return;
    }

    const uploadedFilePaths: string[] = [];

    // Aggregate results from all files
    const allLore: StoryLore[] = [];
    const allMechanicNotes: StoryLore[] = [];
    const allCustomTables: CustomTable[] = [];
    let totalPagesProcessed = 0;
    let totalCost = 0;

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

        // For large PDFs, we'll split into chunks
        const needsChunking = isPDF && fileSizeMB > MAX_CHUNK_SIZE_MB;

        let combinedMarkdown = "";
        let combinedTotalPages = 0;
        let combinedCost = 0;

        // For chunked processing, we summarize each chunk and merge results
        const chunkLore: StoryLore[] = [];
        const chunkMechanics: StoryLore[] = [];
        const chunkTables: CustomTable[] = [];

        if (needsChunking) {
          // Large PDF: Split into chunks, then OCR all, then summarize all
          setStep("uploading");
          setStatusMessage(`Splitting ${file.name} into chunks...`);
          setProgress(fileProgressStart + fileProgressRange * 0.05);

          const chunks = await splitPDFIntoChunks(file, (msg) =>
            setStatusMessage(msg)
          );

          const totalChunks = chunks.length;

          // Initialize chunk statuses for tracking
          const initialStatuses: ChunkStatus[] = chunks.map((chunk, idx) => ({
            chunkIndex: idx,
            pageStart: chunk.pageStart,
            pageEnd: chunk.pageEnd,
            status: "pending",
          }));
          setChunkStatuses(initialStatuses);

          // Phase 1: OCR all chunks with limited concurrency (5% - 45% progress)
          setStep("ocr");
          setStatusMessage(
            `Running OCR on ${totalChunks} chunks (${MAX_CONCURRENT_REQUESTS} at a time)...`
          );
          setProgress(fileProgressStart + fileProgressRange * 0.1);

          const ocrTasks = chunks.map((chunk, chunkIdx) => async () => {
            // Update status to ocr
            setChunkStatuses((prev) =>
              prev.map((cs) =>
                cs.chunkIndex === chunkIdx ? { ...cs, status: "ocr" } : cs
              )
            );

            const ocrResponse = await fetchWithRetry(
              "/api/ocr/process",
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                  base64Data: chunk.base64,
                  fileName: `${file.name}_pages_${chunk.pageStart}-${chunk.pageEnd}.pdf`,
                  mimeType: "application/pdf",
                  includeImages: false,
                }),
              },
              180000 // 3 minute timeout for OCR
            );

            if (!ocrResponse.ok) {
              let errorMsg = "OCR processing failed";
              try {
                const error = await ocrResponse.json();
                errorMsg = error.error || errorMsg;
              } catch {
                errorMsg = (await ocrResponse.text()) || errorMsg;
              }
              throw new Error(
                `Chunk ${chunkIdx + 1} (pages ${chunk.pageStart}-${
                  chunk.pageEnd
                }): ${errorMsg}`
              );
            }

            const chunkResult: OCRProcessResult & { cost: number } =
              await ocrResponse.json();

            // Update status with OCR markdown
            setChunkStatuses((prev) =>
              prev.map((cs) =>
                cs.chunkIndex === chunkIdx
                  ? { ...cs, ocrMarkdown: chunkResult.markdown }
                  : cs
              )
            );

            return {
              chunkIndex: chunkIdx,
              markdown: chunkResult.markdown,
              pageStart: chunk.pageStart,
              pageEnd: chunk.pageEnd,
              totalPages: chunkResult.totalPages,
              cost: chunkResult.cost,
            };
          });

          const ocrResults = await runWithConcurrency(
            ocrTasks,
            MAX_CONCURRENT_REQUESTS,
            (completed, total) => {
              const ocrProgress = completed / total;
              setProgress(
                fileProgressStart +
                  fileProgressRange * (0.1 + ocrProgress * 0.35)
              );
              setStatusMessage(`OCR: ${completed}/${total} chunks complete...`);
            }
          );

          // Sort by page order and combine results
          ocrResults.sort((a, b) => a.pageStart - b.pageStart);

          for (const ocr of ocrResults) {
            combinedMarkdown +=
              (combinedMarkdown ? "\n\n---\n\n" : "") +
              `<!-- Pages ${ocr.pageStart}-${ocr.pageEnd} -->\n${ocr.markdown}`;
            combinedTotalPages += ocr.totalPages;
            combinedCost += ocr.cost;
          }

          // Update extracted markdown after all OCR is done
          setExtractedMarkdown(
            (prev) => prev + "\n\n---\n\n" + combinedMarkdown
          );
          totalPagesProcessed += combinedTotalPages;
          totalCost += combinedCost;
          setProgress(fileProgressStart + fileProgressRange * 0.45);

          // Phase 2: Summarize all chunks with limited concurrency (45% - 95% progress)
          setStep("summarizing");
          setStatusMessage(
            `Extracting notes from ${ocrResults.length} chunks (${MAX_CONCURRENT_REQUESTS} at a time)...`
          );
          setProgress(fileProgressStart + fileProgressRange * 0.5);

          // Refresh token before summarization phase (may have expired during OCR)
          const freshToken = await getAuthToken();
          if (!freshToken) {
            throw new Error("Session expired. Please sign in again.");
          }

          const summarizeTasks = ocrResults.map((ocr) => async () => {
            // Update status to summarizing
            setChunkStatuses((prev) =>
              prev.map((cs) =>
                cs.chunkIndex === ocr.chunkIndex
                  ? { ...cs, status: "summarizing" }
                  : cs
              )
            );

            try {
              const summarizeResponse = await fetchWithRetry(
                "/api/ocr/summarize",
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${freshToken}`,
                  },
                  body: JSON.stringify({
                    markdown: ocr.markdown,
                    focus: ["all"],
                    customInstructions:
                      customInstructions +
                      `\n\nNote: This is pages ${ocr.pageStart}-${ocr.pageEnd} of a larger document.`,
                    model:
                      aiModel === "custom-openrouter"
                        ? customOpenRouterModel
                        : aiModel,
                    maxTokens: maxOutputTokens,
                    openRouterKey: keys.openRouterKey,
                    deepseekKey: keys.deepseekKey,
                  }),
                },
                SUMMARIZE_TIMEOUT_MS,
                MAX_RETRIES
              );

              if (!summarizeResponse.ok) {
                const errorMsg = await summarizeResponse.text();
                console.error(
                  `Pages ${ocr.pageStart}-${ocr.pageEnd} summarization failed:`,
                  errorMsg
                );
                // Update status to failed
                setChunkStatuses((prev) =>
                  prev.map((cs) =>
                    cs.chunkIndex === ocr.chunkIndex
                      ? { ...cs, status: "failed", error: errorMsg }
                      : cs
                  )
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
                      : cs
                  )
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
                    : cs
                )
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
                err.message || err
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
                    : cs
                )
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
                  fileProgressRange * (0.5 + sumProgress * 0.45)
              );
              setStatusMessage(
                `Creating notes: ${completed}/${total} chunks complete...`
              );
            }
          );

          // Count failures and warn user
          const failedResults = summarizeResults.filter((r) => !r.success);
          const failedCount = failedResults.length;
          if (failedCount > 0) {
            console.warn(
              `${failedCount}/${summarizeResults.length} chunks failed to summarize`
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
              `Extracting notes from ${file.name} (${i + 1}/${totalFiles})...`
            );

            const textContent = await file.text();
            combinedMarkdown = textContent;
            combinedTotalPages = 0;
            combinedCost = 0;

            setExtractedMarkdown(
              (prev) => prev + "\n\n---\n\n" + combinedMarkdown
            );

            const summarizeResponse = await fetchWithRetry(
              "/api/ocr/summarize",
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                  markdown: combinedMarkdown,
                  focus: ["all"],
                  customInstructions:
                    (customInstructions || "") +
                    `\n\nNote: This content was imported from a text file (${file.name}).`,
                  model:
                    aiModel === "custom-openrouter"
                      ? customOpenRouterModel
                      : aiModel,
                  maxTokens: maxOutputTokens,
                  openRouterKey: keys.openRouterKey,
                  deepseekKey: keys.deepseekKey,
                }),
              },
              SUMMARIZE_TIMEOUT_MS,
              MAX_RETRIES
            );

            if (!summarizeResponse.ok) {
              let errorMsg = "Note extraction failed";
              try {
                const error = await summarizeResponse.json();
                errorMsg = error.error || errorMsg;
              } catch {
                errorMsg = (await summarizeResponse.text()) || errorMsg;
              }
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
            `Uploading ${file.name} (${i + 1}/${totalFiles})...`
          );

          let ocrPayload: {
            signedUrl?: string;
            base64Data?: string;
            fileName?: string;
            mimeType?: string;
          } = {};
          let filePath: string | null = null;

          // Try Supabase upload first
          const formData = new FormData();
          formData.append("file", file);

          const uploadResponse = await fetch("/api/ocr/upload", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: formData,
          });

          if (uploadResponse.ok) {
            const uploadResult = await uploadResponse.json();
            filePath = uploadResult.filePath;
            if (filePath) {
              uploadedFilePaths.push(filePath);
            }
            ocrPayload = { signedUrl: uploadResult.signedUrl };
          } else {
            // Fallback to base64 encoding for smaller files
            console.log(
              `Supabase upload failed for ${file.name}, falling back to base64`
            );
            setStatusMessage(
              `Converting ${file.name} to base64 (${i + 1}/${totalFiles})...`
            );

            const arrayBuffer = await file.arrayBuffer();
            const base64 = btoa(
              new Uint8Array(arrayBuffer).reduce(
                (data, byte) => data + String.fromCharCode(byte),
                ""
              )
            );

            ocrPayload = {
              base64Data: base64,
              fileName: file.name,
              mimeType: file.type,
            };
          }
          setProgress(fileProgressStart + fileProgressRange * 0.2);

          // OCR Processing
          setStep("ocr");
          setStatusMessage(
            `Extracting text from ${file.name} (${i + 1}/${totalFiles})...`
          );

          const ocrResponse = await fetch("/api/ocr/process", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              ...ocrPayload,
              includeImages: false,
            }),
          });

          if (!ocrResponse.ok) {
            let errorMsg = "OCR processing failed";
            try {
              const error = await ocrResponse.json();
              errorMsg = error.error || errorMsg;
            } catch {
              errorMsg = (await ocrResponse.text()) || errorMsg;
            }
            throw new Error(`${file.name}: ${errorMsg}`);
          }

          const ocrResult: OCRProcessResult & { cost: number } =
            await ocrResponse.json();

          combinedMarkdown = ocrResult.markdown;
          combinedTotalPages = ocrResult.totalPages;
          combinedCost = ocrResult.cost;

          setExtractedMarkdown(
            (prev) => prev + "\n\n---\n\n" + combinedMarkdown
          );
          totalPagesProcessed += combinedTotalPages;
          totalCost += combinedCost;
          setProgress(fileProgressStart + fileProgressRange * 0.4);

          // Step 3: AI Summarization - Extract all notes (only for non-chunked files)
          setStep("summarizing");
          setStatusMessage(
            `Extracting notes from ${file.name} (${i + 1}/${totalFiles})...`
          );

          const summarizeResponse = await fetch("/api/ocr/summarize", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              markdown: combinedMarkdown,
              focus: ["all"],
              customInstructions,
              model:
                aiModel === "custom-openrouter"
                  ? customOpenRouterModel
                  : aiModel,
              maxTokens: maxOutputTokens,
              openRouterKey: keys.openRouterKey,
              deepseekKey: keys.deepseekKey,
            }),
          });

          if (!summarizeResponse.ok) {
            let errorMsg = "Note extraction failed";
            try {
              const error = await summarizeResponse.json();
              errorMsg = error.error || errorMsg;
            } catch {
              errorMsg = (await summarizeResponse.text()) || errorMsg;
            }
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
        } (${totalCost} coins)`,
        "success"
      );

      // Show reminder about Saved Imports feature
      setTimeout(() => {
        addNotification(
          "💡 Tip: Your import is saved! Re-open the PDF Importer to access 'Saved Imports' anytime.",
          "success"
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
      // Clean up all uploaded files
      for (const filePath of uploadedFilePaths) {
        try {
          await fetch("/api/ocr/upload", {
            method: "DELETE",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ filePath }),
          });
        } catch (e) {
          console.warn("Failed to clean up uploaded file:", e);
        }
      }
    }
  };

  const removeFile = (index: number) => {
    const file = selectedFiles[index];
    const filePages = Math.max(1, Math.ceil(file.size / (100 * 1024)));
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
    setPageCount((prev) => prev - filePages);
    setEstimatedCost((prev) => prev - calculateOCRCost(filePages));
  };

  const resetState = () => {
    setStep("idle");
    setProgress(0);
    setStatusMessage("");
    setSelectedFiles([]);
    setEstimatedCost(0);
    setExtractedMarkdown("");
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
                              (cs) => cs.status === "complete"
                            ).length
                          }
                          /{chunkStatuses.length} complete)
                        </span>
                        {chunkStatuses.some((cs) => cs.status === "failed") && (
                          <span className="px-2 py-0.5 bg-red-900/50 text-red-300 text-xs rounded-full">
                            {
                              chunkStatuses.filter(
                                (cs) => cs.status === "failed"
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
                            (cs) => cs.status === "complete"
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
                                    (cs) => cs.status === "complete"
                                  ).length
                                }{" "}
                                Chunks
                              </button>
                              <p className="text-xs text-blue-300/50 text-center mt-1">
                                Skip{" "}
                                {
                                  chunkStatuses.filter(
                                    (cs) => cs.status === "failed"
                                  ).length
                                }{" "}
                                failed chunk
                                {chunkStatuses.filter(
                                  (cs) => cs.status === "failed"
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
                            Math.ceil(file.size / (100 * 1024))
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
                        name="Coins"
                        className="w-5 h-5 text-amber-400"
                      />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-amber-200">
                          Estimated cost: {estimatedCost} coins
                        </p>
                        <p className="text-xs text-amber-300/60">
                          1 coin per 10 pages (includes OCR + AI summarization)
                        </p>
                      </div>
                    </div>
                  )}

                  {/* AI Model Selection */}
                  <div>
                    <label className="block text-sm font-semibold text-blue-200 mb-1">
                      AI Model for Summarization
                    </label>
                    <select
                      value={aiModel}
                      onChange={(e) => setAIModel(e.target.value)}
                      className="w-full px-3 py-2 bg-blue-900/30 border border-blue-700/40 rounded-lg text-white"
                    >
                      <option value={AI_MODELS["Ministral 14B"].model}>
                        {AI_MODELS["Ministral 14B"].name} (Coins)
                      </option>
                      <option value={AI_MODELS["Mistral Small 3.2"].model}>
                        {AI_MODELS["Mistral Small 3.2"].name} (Coins)
                      </option>
                      <option value={AI_MODELS["Mistral Medium 3.1"].model}>
                        {AI_MODELS["Mistral Medium 3.1"].name} (Coins)
                      </option>
                      {keys.deepseekKey && (
                        <option value={AI_MODELS["Deepseek Chat"].model}>
                          {AI_MODELS["Deepseek Chat"].name} (BYOK)
                        </option>
                      )}
                      {keys.openRouterKey && (
                        <>
                          <option value="anthropic/claude-3.5-sonnet">
                            Claude 3.5 Sonnet (BYOK)
                          </option>
                          <option value={AI_MODELS["Gemini 2.5 Flash"].model}>
                            {AI_MODELS["Gemini 2.5 Flash"].name} (BYOK)
                          </option>
                          <option value="custom-openrouter">
                            Custom OpenRouter Model (BYOK)
                          </option>
                        </>
                      )}
                    </select>
                    {aiModel === "custom-openrouter" && (
                      <input
                        type="text"
                        value={customOpenRouterModel}
                        onChange={(e) =>
                          setCustomOpenRouterModel(e.target.value)
                        }
                        placeholder="e.g., anthropic/claude-3-opus"
                        className="w-full mt-2 px-3 py-2 bg-blue-900/30 border border-blue-700/40 rounded-lg text-white placeholder-blue-300/50"
                      />
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
                                      isExpanded ? null : imp.id
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
                                        imp.timestamp
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
                                      {user && (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            openShareModal(imp);
                                          }}
                                          className="px-3 py-1.5 bg-purple-600/80 hover:bg-purple-600 text-white text-xs rounded-lg transition-colors flex items-center gap-1"
                                          title="Share to community"
                                        >
                                          <DynamicIcon
                                            name="Share2"
                                            className="w-3 h-3"
                                          />
                                          Share
                                        </button>
                                      )}
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

                  {/* Community Imports Section */}
                  <div className="border border-purple-700/40 rounded-lg overflow-hidden">
                    <button
                      onClick={() =>
                        setShowCommunityImports(!showCommunityImports)
                      }
                      className="w-full px-4 py-3 flex items-center justify-between bg-purple-900/20 hover:bg-purple-900/30 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <DynamicIcon
                          name="Globe"
                          className="w-4 h-4 text-purple-400"
                        />
                        <span className="text-sm font-medium text-purple-200">
                          Community Imports
                        </span>
                      </div>
                      <DynamicIcon
                        name={
                          showCommunityImports ? "ChevronUp" : "ChevronDown"
                        }
                        className="w-4 h-4 text-purple-400"
                      />
                    </button>
                    {showCommunityImports && (
                      <div className="p-3 space-y-3 bg-purple-900/10">
                        {/* Search and Filters */}
                        <div className="flex gap-2">
                          <div className="flex-1">
                            <input
                              type="text"
                              value={communitySearch}
                              onChange={(e) =>
                                setCommunitySearch(e.target.value)
                              }
                              placeholder="Search imports..."
                              className="w-full px-3 py-2 bg-purple-900/30 border border-purple-700/40 rounded-lg text-white text-sm placeholder-purple-300/50"
                              onKeyDown={(e) => {
                                if (e.key === "Enter") fetchCommunityImports();
                              }}
                            />
                          </div>
                          <select
                            value={communitySort}
                            onChange={(e) =>
                              setCommunitySort(
                                e.target.value as "recent" | "popular"
                              )
                            }
                            className="px-3 py-2 bg-purple-900/30 border border-purple-700/40 rounded-lg text-white text-sm"
                          >
                            <option value="popular">Popular</option>
                            <option value="recent">Recent</option>
                          </select>
                          <button
                            onClick={fetchCommunityImports}
                            disabled={communityLoading}
                            className="px-3 py-2 bg-purple-600/80 hover:bg-purple-600 disabled:opacity-50 text-white rounded-lg transition-colors"
                          >
                            <DynamicIcon
                              name={communityLoading ? "Loader2" : "Search"}
                              className={`w-4 h-4 ${
                                communityLoading ? "animate-spin" : ""
                              }`}
                            />
                          </button>
                        </div>

                        {/* RPG System Filter */}
                        <div className="flex gap-2 flex-wrap">
                          {[
                            "",
                            "D&D 5e",
                            "Pathfinder",
                            "Call of Cthulhu",
                            "Other",
                          ].map((sys) => (
                            <button
                              key={sys}
                              onClick={() => {
                                setCommunitySystem(sys);
                                setTimeout(fetchCommunityImports, 100);
                              }}
                              className={`px-2 py-1 text-xs rounded-full transition-colors ${
                                communitySystem === sys
                                  ? "bg-purple-600 text-white"
                                  : "bg-purple-900/40 text-purple-300 hover:bg-purple-800/50"
                              }`}
                            >
                              {sys || "All Systems"}
                            </button>
                          ))}
                        </div>

                        {/* Results */}
                        {communityLoading ? (
                          <div className="flex items-center justify-center py-8">
                            <DynamicIcon
                              name="Loader2"
                              className="w-6 h-6 text-purple-400 animate-spin"
                            />
                          </div>
                        ) : communityImports.length === 0 ? (
                          <div className="text-center py-8 text-purple-300/60 text-sm">
                            No community imports found
                          </div>
                        ) : (
                          <div className="space-y-2 max-h-80 overflow-y-auto">
                            {communityImports.map((imp) => (
                              <div
                                key={imp.id}
                                className="bg-purple-900/30 rounded-lg border border-purple-700/40 p-3"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    <p className="font-medium text-white truncate">
                                      {imp.name}
                                    </p>
                                    {imp.description && (
                                      <p className="text-xs text-purple-300/70 line-clamp-2 mt-1">
                                        {imp.description}
                                      </p>
                                    )}
                                    <div className="flex items-center gap-2 mt-2 text-xs text-purple-300/60">
                                      {imp.system && (
                                        <span className="px-2 py-0.5 bg-purple-800/40 rounded-full">
                                          {imp.system}
                                        </span>
                                      )}
                                      <span>
                                        📚 {imp.lore_count} • ⚙️{" "}
                                        {imp.mechanics_count} • 🎲{" "}
                                        {imp.tables_count}
                                      </span>
                                      <span title="Downloads">
                                        ⬇️ {imp.downloads}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2 mt-1 text-xs text-purple-300/40">
                                      <span>
                                        {new Date(
                                          imp.created_at
                                        ).toLocaleDateString()}
                                      </span>
                                    </div>
                                  </div>
                                  <button
                                    onClick={() => useCommunityImport(imp)}
                                    className="px-3 py-1.5 bg-purple-600/80 hover:bg-purple-600 text-white text-xs rounded-lg transition-colors flex items-center gap-1 shrink-0"
                                  >
                                    <DynamicIcon
                                      name="Download"
                                      className="w-3 h-3"
                                    />
                                    Use
                                  </button>
                                </div>
                              </div>
                            ))}
                            {communityTotal > communityImports.length && (
                              <p className="text-center text-xs text-purple-300/50 py-2">
                                Showing {communityImports.length} of{" "}
                                {communityTotal} imports
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
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
                disabled={selectedFiles.length === 0 || step !== "idle"}
                className="px-4 py-2 bg-linear-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center gap-2"
              >
                <DynamicIcon name="Sparkles" className="w-4 h-4" />
                Start Import
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Share Modal */}
      {showShareModal && shareData && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setShowShareModal(false)}
        >
          <div
            className="bg-linear-to-br from-purple-950/95 via-blue-950/95 to-purple-950/95 border border-purple-500/40 rounded-xl shadow-2xl w-full max-w-lg m-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-purple-700/40">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-purple-600/30 flex items-center justify-center">
                  <DynamicIcon
                    name="Share2"
                    className="w-5 h-5 text-purple-300"
                  />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">
                    Share Import to Community
                  </h2>
                  <p className="text-sm text-purple-200/70">
                    Help others discover this content
                  </p>
                </div>
              </div>
            </div>

            <div className="p-4 space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-purple-200 mb-1">
                  Import Name *
                </label>
                <input
                  type="text"
                  value={shareName}
                  onChange={(e) => setShareName(e.target.value)}
                  placeholder="e.g., Monster Manual Lore"
                  className="w-full px-3 py-2 bg-purple-900/40 border border-purple-700/40 rounded-lg text-white placeholder-purple-300/50"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-purple-200 mb-1">
                  Description
                </label>
                <textarea
                  value={shareDescription}
                  onChange={(e) => setShareDescription(e.target.value)}
                  placeholder="What content is included? Any special notes?"
                  rows={2}
                  className="w-full px-3 py-2 bg-purple-900/40 border border-purple-700/40 rounded-lg text-white placeholder-purple-300/50 resize-none"
                />
              </div>

              {/* Source Book */}
              <div>
                <label className="block text-sm font-medium text-purple-200 mb-1">
                  Source Book
                </label>
                <input
                  type="text"
                  value={shareSourceBook}
                  onChange={(e) => setShareSourceBook(e.target.value)}
                  placeholder="e.g., D&D 5e Monster Manual"
                  className="w-full px-3 py-2 bg-purple-900/40 border border-purple-700/40 rounded-lg text-white placeholder-purple-300/50"
                />
              </div>

              {/* System */}
              <div>
                <label className="block text-sm font-medium text-purple-200 mb-1">
                  RPG System
                </label>
                <select
                  value={shareSystem}
                  onChange={(e) => setShareSystem(e.target.value)}
                  className="w-full px-3 py-2 bg-purple-900/40 border border-purple-700/40 rounded-lg text-white"
                >
                  <option value="">Select system...</option>
                  <option value="D&D 5e">D&D 5e</option>
                  <option value="Pathfinder">Pathfinder</option>
                  <option value="Call of Cthulhu">Call of Cthulhu</option>
                  <option value="Blades in the Dark">Blades in the Dark</option>
                  <option value="Fate">Fate</option>
                  <option value="Year Zero Engine">Year Zero Engine</option>
                  <option value="Savage Worlds">Savage Worlds</option>
                  <option value="System Agnostic">System Agnostic</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              {/* Tags */}
              <div>
                <label className="block text-sm font-medium text-purple-200 mb-1">
                  Tags (comma-separated)
                </label>
                <input
                  type="text"
                  value={shareTags}
                  onChange={(e) => setShareTags(e.target.value)}
                  placeholder="e.g., monsters, fantasy, official"
                  className="w-full px-3 py-2 bg-purple-900/40 border border-purple-700/40 rounded-lg text-white placeholder-purple-300/50"
                />
              </div>

              {/* Content Summary */}
              <div className="bg-purple-900/30 rounded-lg p-3 text-sm">
                <p className="text-purple-200 font-medium mb-2">
                  Content to share:
                </p>
                <div className="flex gap-4 text-purple-300/70">
                  <span>📚 {shareData.lore.length} Lore</span>
                  <span>⚙️ {shareData.mechanicNotes.length} Mechanics</span>
                  <span>🎲 {shareData.customTables.length} Tables</span>
                </div>
              </div>

              {/* Public toggle */}
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sharePublic}
                  onChange={(e) => setSharePublic(e.target.checked)}
                  className="w-4 h-4 rounded border-purple-700/40 bg-purple-900/40 text-purple-600 focus:ring-purple-500"
                />
                <span className="text-sm text-purple-200">
                  Make publicly visible (others can browse and use)
                </span>
              </label>
            </div>

            <div className="flex justify-end gap-3 p-4 border-t border-purple-700/40">
              <button
                onClick={() => setShowShareModal(false)}
                className="px-4 py-2 bg-purple-900/40 hover:bg-purple-800/50 text-white rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={shareImportToCommunity}
                disabled={!shareName.trim() || shareUploading}
                className="px-4 py-2 bg-linear-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center gap-2"
              >
                {shareUploading ? (
                  <>
                    <DynamicIcon
                      name="Loader2"
                      className="w-4 h-4 animate-spin"
                    />
                    Sharing...
                  </>
                ) : (
                  <>
                    <DynamicIcon name="Share2" className="w-4 h-4" />
                    Share
                  </>
                )}
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
                        (cs) => cs.chunkIndex === repairChunkIndex
                      )?.pageStart
                    }
                    -
                    {
                      chunkStatuses.find(
                        (cs) => cs.chunkIndex === repairChunkIndex
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
                        /```(?:json)?\s*([\s\S]*?)\s*```/
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
                          endIndex + 1
                        );
                      }

                      const parsed = JSON.parse(jsonContent);
                      setRepairContent(JSON.stringify(parsed, null, 2));
                    } catch {
                      addNotification(
                        "Cannot format - JSON is not valid. Try fixing the errors first.",
                        "warning"
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
                        "warning"
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
