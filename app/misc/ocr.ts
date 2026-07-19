/**
 * OCR Types and Utilities for Mistral OCR integration
 *
 * Uses Mistral's OCR API to extract text from PDFs and images,
 * then AI-processes the content into structured RPG notes.
 *
 * BYOK only: the caller provides their own Mistral/OpenRouter/DeepSeek API
 * key and pays the provider directly. Pricing: ~$1 per 1000 pages for OCR,
 * plus the selected model's own AI summarization cost.
 */

import {
  StoryLore,
  Variable,
  CustomTable,
  Stat,
  Resource,
  Ability,
} from "./structs";

// ============================================================================
// OCR API Types (Mistral)
// ============================================================================

export interface OCRPageResult {
  index: number;
  markdown: string;
  images: OCRImage[];
  dimensions: {
    dpi: number;
    height: number;
    width: number;
  };
}

export interface OCRImage {
  id: string;
  top_left_x: number;
  top_left_y: number;
  bottom_right_x: number;
  bottom_right_y: number;
  image_base64?: string;
}

export interface OCRResponse {
  pages: OCRPageResult[];
  model: string;
  usage_info: {
    pages_processed: number;
    doc_size_bytes: number | null;
  };
}

export interface OCRRequest {
  model: "mistral-ocr-latest";
  document: OCRDocumentInput;
  include_image_base64?: boolean;
  pages?: number[]; // 0-indexed page numbers to process
  image_limit?: number;
  image_min_size?: number;
}

export type OCRDocumentInput =
  | { type: "document_url"; document_url: string }
  | { type: "image_url"; image_url: string }
  | { type: "file"; file_data: string }; // base64

// ============================================================================
// PDF Processing Types
// ============================================================================

export interface PDFUploadResult {
  success: boolean;
  fileId: string;
  signedUrl: string;
  pageCount?: number;
  error?: string;
}

export interface OCRProcessResult {
  success: boolean;
  pages: OCRPageResult[];
  totalPages: number;
  markdown: string; // Combined markdown from all pages
  error?: string;
}

export interface PDFSummarizeResult {
  success: boolean;
  lore: StoryLore[];
  variables?: Variable[];
  customTables?: CustomTable[];
  stats?: Stat[];
  resources?: Resource[];
  abilities?: Ability[];
  mechanicNotes?: string; // Raw mechanic rules extracted
  summary?: string; // Brief summary of the document
  error?: string;
}

// ============================================================================
// Processing Options
// ============================================================================

export interface OCRProcessOptions {
  /** Pages to process (0-indexed). If empty, process all pages. */
  pages?: number[];
  /** Include extracted images in response */
  includeImages?: boolean;
  /** Maximum images to extract per page */
  imageLimit?: number;
}

export interface PDFSummarizeOptions {
  /** Focus on specific content types */
  focus?: ("lore" | "mechanics" | "tables" | "characters" | "all")[];
  /** Maximum lore entries to generate */
  maxLoreEntries?: number;
  /** Maximum custom tables to extract */
  maxTables?: number;
  /** Include character stats extraction */
  extractStats?: boolean;
  /** Custom instructions for the AI */
  customInstructions?: string;
  /** AI model to use for summarization */
  model?: string;
  /** Max tokens for AI response */
  maxTokens?: number;
}

// ============================================================================
// Cost Calculation
// ============================================================================

export const OCR_COST_PER_PAGE = 0.001; // $0.001 per page ($1/1000 pages)

/**
 * Estimate OCR cost in USD (for display purposes)
 * @param pageCount Number of pages
 * @returns Estimated cost in USD
 */
export function estimateOCRCostUSD(pageCount: number): number {
  return pageCount * OCR_COST_PER_PAGE;
}

// ============================================================================
// Content Type Detection
// ============================================================================

export type RPGContentType =
  | "character_sheet"
  | "monster_stat_block"
  | "spell_list"
  | "item_list"
  | "lore"
  | "rules"
  | "adventure"
  | "map"
  | "table"
  | "unknown";

/**
 * Detect the type of RPG content in markdown text
 * @param markdown The OCR-extracted markdown
 * @returns Detected content type
 */
export function detectContentType(markdown: string): RPGContentType {
  const lower = markdown.toLowerCase();

  // Check for character sheet indicators
  if (
    (lower.includes("strength") &&
      lower.includes("dexterity") &&
      lower.includes("constitution")) ||
    lower.includes("character sheet") ||
    lower.includes("hit points") ||
    lower.includes("armor class")
  ) {
    return "character_sheet";
  }

  // Check for monster stat blocks
  if (
    (lower.includes("challenge rating") || lower.includes("cr ")) &&
    (lower.includes("hit points") || lower.includes("hp"))
  ) {
    return "monster_stat_block";
  }

  // Check for spell lists
  if (
    lower.includes("casting time") ||
    lower.includes("spell level") ||
    (lower.includes("range:") && lower.includes("duration:"))
  ) {
    return "spell_list";
  }

  // Check for item lists
  if (
    lower.includes("magic item") ||
    lower.includes("weapon") ||
    lower.includes("armor") ||
    (lower.includes("cost:") && lower.includes("weight:"))
  ) {
    return "item_list";
  }

  // Check for rules/mechanics
  if (
    lower.includes("rule") ||
    lower.includes("mechanic") ||
    lower.includes("saving throw") ||
    lower.includes("ability check") ||
    lower.includes("skill check")
  ) {
    return "rules";
  }

  // Check for tables
  if (markdown.includes("|") && markdown.includes("---")) {
    return "table";
  }

  // Default to lore for narrative content
  if (lower.length > 500) {
    return "lore";
  }

  return "unknown";
}

// ============================================================================
// Markdown Processing Utilities
// ============================================================================

/**
 * Split markdown into logical sections based on headers
 * @param markdown The full markdown text
 * @returns Array of sections with title and content
 */
export function splitIntoSections(
  markdown: string
): { title: string; content: string; level: number }[] {
  const lines = markdown.split("\n");
  const sections: { title: string; content: string; level: number }[] = [];
  let currentSection: {
    title: string;
    content: string[];
    level: number;
  } | null = null;

  for (const line of lines) {
    const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);

    if (headerMatch) {
      // Save previous section
      if (currentSection) {
        sections.push({
          title: currentSection.title,
          content: currentSection.content.join("\n").trim(),
          level: currentSection.level,
        });
      }

      // Start new section
      currentSection = {
        title: headerMatch[2].trim(),
        content: [],
        level: headerMatch[1].length,
      };
    } else if (currentSection) {
      currentSection.content.push(line);
    } else if (line.trim()) {
      // Content before first header
      currentSection = {
        title: "Introduction",
        content: [line],
        level: 0,
      };
    }
  }

  // Save last section
  if (currentSection) {
    sections.push({
      title: currentSection.title,
      content: currentSection.content.join("\n").trim(),
      level: currentSection.level,
    });
  }

  return sections;
}

/**
 * Extract tables from markdown
 * @param markdown The markdown text
 * @returns Array of table data
 */
export function extractTables(
  markdown: string
): { headers: string[]; rows: string[][] }[] {
  const tables: { headers: string[]; rows: string[][] }[] = [];
  const lines = markdown.split("\n");

  let inTable = false;
  let currentHeaders: string[] = [];
  let currentRows: string[][] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.startsWith("|") && line.endsWith("|")) {
      const cells = line
        .split("|")
        .slice(1, -1)
        .map((c) => c.trim());

      if (!inTable) {
        // Check if next line is separator
        const nextLine = lines[i + 1]?.trim() || "";
        if (nextLine.match(/^\|[\s:-]+\|$/)) {
          currentHeaders = cells;
          inTable = true;
          i++; // Skip separator line
          continue;
        }
      }

      if (inTable) {
        currentRows.push(cells);
      }
    } else if (inTable) {
      // End of table
      if (currentHeaders.length > 0) {
        tables.push({
          headers: currentHeaders,
          rows: currentRows,
        });
      }
      inTable = false;
      currentHeaders = [];
      currentRows = [];
    }
  }

  // Handle table at end of document
  if (inTable && currentHeaders.length > 0) {
    tables.push({
      headers: currentHeaders,
      rows: currentRows,
    });
  }

  return tables;
}

/**
 * Clean and normalize markdown from OCR
 * @param markdown Raw OCR markdown
 * @returns Cleaned markdown
 */
export function cleanOCRMarkdown(markdown: string): string {
  return (
    markdown
      // Remove excessive whitespace
      .replace(/\n{3,}/g, "\n\n")
      // Fix common OCR artifacts
      .replace(/\s+([.,;:!?])/g, "$1")
      // Normalize dashes
      .replace(/—/g, "-")
      // Remove image references we can't use
      .replace(/!\[.*?\]\(img-\d+\.jpeg\)/g, "")
      .trim()
  );
}

// ============================================================================
// Validation
// ============================================================================

export const MAX_PDF_SIZE_MB = 100;
export const MAX_PDF_SIZE_BYTES = MAX_PDF_SIZE_MB * 1024 * 1024;
export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
];

/**
 * Validate file for OCR processing
 * @param file The file to validate
 * @returns Validation result
 */
export function validateOCRFile(file: File): {
  valid: boolean;
  error?: string;
} {
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: `Invalid file type: ${file.type}. Supported types: PDF, PNG, JPEG, WebP`,
    };
  }

  if (file.size > MAX_PDF_SIZE_BYTES) {
    return {
      valid: false,
      error: `File too large: ${(file.size / 1024 / 1024).toFixed(
        1
      )}MB. Maximum: ${MAX_PDF_SIZE_MB}MB`,
    };
  }

  return { valid: true };
}
