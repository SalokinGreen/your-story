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
import { StoryLore, CustomTable, Variable } from "@/app/misc/structs";
import { AI_MODELS } from "@/app/misc/ai_prices";

// Saved import data structure
interface SavedPDFImport {
  id: string;
  timestamp: number;
  fileName: string;
  lore: StoryLore[];
  mechanicNotes: StoryLore[];
  customTables: CustomTable[];
  variables: Variable[];
  summary: string;
}

const SAVED_IMPORTS_KEY = "pdf-imports-cache";

interface PDFImporterProps {
  /** Called when import completes with extracted data */
  onImportComplete: (data: {
    lore: StoryLore[];
    mechanicNotes: StoryLore[];
    customTables: CustomTable[];
    variables: Variable[];
    summary: string;
  }) => void;
  /** Optional: Only import specific types */
  importTypes?: ("lore" | "mechanics" | "tables" | "variables")[];
  /** Optional: Custom button text */
  buttonText?: string;
  /** Optional: Compact mode */
  compact?: boolean;
}

type ProcessingStep =
  | "idle"
  | "uploading"
  | "ocr"
  | "summarizing-lore"
  | "summarizing-mechanics"
  | "complete"
  | "error";

export default function PDFImporter({
  onImportComplete,
  importTypes = ["lore", "mechanics", "tables", "variables"],
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

  // Load saved imports on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SAVED_IMPORTS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as SavedPDFImport[];
        // Keep only imports from last 30 days
        const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
        const recent = parsed.filter((imp) => imp.timestamp > thirtyDaysAgo);
        setSavedImports(recent);
        // Clean up old imports
        if (recent.length !== parsed.length) {
          localStorage.setItem(SAVED_IMPORTS_KEY, JSON.stringify(recent));
        }
      }
    } catch (e) {
      console.warn("Failed to load saved PDF imports:", e);
    }
  }, []);

  // Save imports to localStorage
  const saveImport = useCallback(
    (data: {
      lore: StoryLore[];
      mechanicNotes: StoryLore[];
      customTables: CustomTable[];
      variables: Variable[];
      summary: string;
    }) => {
      const newImport: SavedPDFImport = {
        id: `import-${Date.now()}`,
        timestamp: Date.now(),
        fileName:
          selectedFiles.length > 1
            ? `${selectedFiles.length} files`
            : selectedFiles[0]?.name || "Unknown",
        lore: data.lore,
        mechanicNotes: data.mechanicNotes,
        customTables: data.customTables,
        variables: data.variables,
        summary: data.summary,
      };

      setSavedImports((prev) => {
        const updated = [newImport, ...prev].slice(0, 10); // Keep max 10 imports
        try {
          localStorage.setItem(SAVED_IMPORTS_KEY, JSON.stringify(updated));
        } catch (e) {
          console.warn("Failed to save PDF import:", e);
        }
        return updated;
      });
    },
    [selectedFiles]
  );

  // Delete a saved import
  const deleteSavedImport = useCallback((id: string) => {
    setSavedImports((prev) => {
      const updated = prev.filter((imp) => imp.id !== id);
      try {
        localStorage.setItem(SAVED_IMPORTS_KEY, JSON.stringify(updated));
      } catch (e) {
        console.warn("Failed to update saved imports:", e);
      }
      return updated;
    });
  }, []);

  // Use a saved import
  const useSavedImport = useCallback(
    (imp: SavedPDFImport) => {
      onImportComplete({
        lore: imp.lore,
        mechanicNotes: imp.mechanicNotes,
        customTables: imp.customTables,
        variables: imp.variables,
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
        setPageCount((prev) => prev + totalPages);
        setEstimatedCost((prev) => prev + calculateOCRCost(totalPages));
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
        setPageCount((prev) => prev + totalPages);
        setEstimatedCost((prev) => prev + calculateOCRCost(totalPages));
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
    const allVariables: Variable[] = [];
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

        // Step 1: Upload to Supabase
        setStep("uploading");
        setProgress(fileProgressStart + fileProgressRange * 0.1);
        setStatusMessage(`Uploading ${file.name} (${i + 1}/${totalFiles})...`);

        const formData = new FormData();
        formData.append("file", file);

        const uploadResponse = await fetch("/api/ocr/upload", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });

        if (!uploadResponse.ok) {
          const error = await uploadResponse.json();
          throw new Error(`${file.name}: ${error.error || "Upload failed"}`);
        }

        const uploadResult = await uploadResponse.json();
        uploadedFilePaths.push(uploadResult.filePath);
        setProgress(fileProgressStart + fileProgressRange * 0.2);

        // Step 2: OCR Processing
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
            signedUrl: uploadResult.signedUrl,
            includeImages: false,
          }),
        });

        if (!ocrResponse.ok) {
          const error = await ocrResponse.json();
          throw new Error(
            `${file.name}: ${error.error || "OCR processing failed"}`
          );
        }

        const ocrResult: OCRProcessResult & { cost: number } =
          await ocrResponse.json();
        setExtractedMarkdown(
          (prev) => prev + "\n\n---\n\n" + ocrResult.markdown
        );
        totalPagesProcessed += ocrResult.totalPages;
        totalCost += ocrResult.cost;
        setProgress(fileProgressStart + fileProgressRange * 0.4);

        // Step 3: AI Summarization - Lore & World Building
        setStep("summarizing-lore");
        setStatusMessage(
          `Extracting lore from ${file.name} (${i + 1}/${totalFiles})...`
        );

        const loreResponse = await fetch("/api/ocr/summarize", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            markdown: ocrResult.markdown,
            focus: ["lore", "characters", "tables"],
            customInstructions,
            model:
              aiModel === "custom-openrouter" ? customOpenRouterModel : aiModel,
            maxTokens: maxOutputTokens,
            openRouterKey: keys.openRouterKey,
            deepseekKey: keys.deepseekKey,
          }),
        });

        if (!loreResponse.ok) {
          const error = await loreResponse.json();
          throw new Error(
            `${file.name}: ${error.error || "Lore extraction failed"}`
          );
        }

        const loreResult = await loreResponse.json();
        allLore.push(...(loreResult.lore || []));
        allCustomTables.push(...(loreResult.customTables || []));
        setProgress(fileProgressStart + fileProgressRange * 0.7);

        // Step 4: AI Summarization - Game Mechanics
        setStep("summarizing-mechanics");
        setStatusMessage(
          `Extracting mechanics from ${file.name} (${i + 1}/${totalFiles})...`
        );

        const mechanicsResponse = await fetch("/api/ocr/summarize", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            markdown: ocrResult.markdown,
            focus: ["mechanics", "variables"],
            customInstructions:
              customInstructions +
              "\nFocus specifically on game rules, combat mechanics, skill systems, special abilities, and numerical systems.",
            model:
              aiModel === "custom-openrouter" ? customOpenRouterModel : aiModel,
            maxTokens: maxOutputTokens,
            openRouterKey: keys.openRouterKey,
            deepseekKey: keys.deepseekKey,
          }),
        });

        if (!mechanicsResponse.ok) {
          const error = await mechanicsResponse.json();
          throw new Error(
            `${file.name}: ${error.error || "Mechanics extraction failed"}`
          );
        }

        const mechanicsResult = await mechanicsResponse.json();
        allMechanicNotes.push(...(mechanicsResult.mechanicNotes || []));
        allCustomTables.push(...(mechanicsResult.customTables || []));
        allVariables.push(...(mechanicsResult.variables || []));
        setProgress(fileProgressEnd);
      }

      // Step 5: Complete
      setStep("complete");
      setStatusMessage("Import complete!");
      setProgress(100);

      // Prepare import data
      const importData = {
        lore: allLore,
        mechanicNotes: allMechanicNotes,
        customTables: allCustomTables,
        variables: allVariables,
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
      case "summarizing-lore":
        return "BookOpen";
      case "summarizing-mechanics":
        return "Cog";
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
                      <p className="font-medium text-white">{statusMessage}</p>
                      <p className="text-sm text-blue-300/60">
                        {step === "uploading" &&
                          "This may take a moment for large files..."}
                        {step === "ocr" && `Processing ${pageCount} pages...`}
                        {step === "summarizing-lore" &&
                          "Extracting world-building and characters..."}
                        {step === "summarizing-mechanics" &&
                          "Extracting rules and game systems..."}
                        {step === "complete" && "All done!"}
                      </p>
                    </div>
                  </div>
                  <div className="w-full bg-blue-900/50 rounded-full h-2">
                    <div
                      className="bg-linear-to-r from-purple-500 to-blue-500 h-2 rounded-full transition-all duration-500"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
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
                      accept=".pdf,.png,.jpg,.jpeg,.webp"
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
                      <option value="ministral-14b-2512">
                        Ministral 14B (Coins)
                      </option>
                      <option value="mistral-small-2506">
                        Mistral Small 3.2 (Coins)
                      </option>
                      <option value="mistral-medium-2508">
                        Mistral Medium 3.1 (Coins)
                      </option>
                      {keys.deepseekKey && (
                        <option value="deepseek-chat">
                          DeepSeek Chat (BYOK)
                        </option>
                      )}
                      {keys.openRouterKey && (
                        <>
                          <option value="anthropic/claude-3.5-sonnet">
                            Claude 3.5 Sonnet (BYOK)
                          </option>
                          <option value="google/gemini-2.5-flash">
                            Gemini 2.5 Flash (BYOK)
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
                                      {imp.customTables.length} tables •{" "}
                                      {imp.variables.length} variables
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
                                        Use This Import
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
    </>
  );
}
