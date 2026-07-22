"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { DynamicIcon } from "./DynamicIcon";

interface CustomFont {
  id: string;
  name: string;
  data: string; // Base64 encoded font data
  format: string; // woff2, woff, ttf, otf
}

interface FontSettingsTabProps {
  addNotification: (
    message: string,
    type: "success" | "failure" | "warning"
  ) => void;
}

// IndexedDB helpers for font storage
const DB_NAME = "your-story-fonts";
const DB_VERSION = 1;
const STORE_NAME = "fonts";

async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
  });
}

async function saveFont(font: CustomFont): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(font);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

async function deleteFont(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(id);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

async function getAllFonts(): Promise<CustomFont[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

// Inject font into document
function injectFont(font: CustomFont) {
  const existingStyle = document.getElementById(`custom-font-${font.id}`);
  if (existingStyle) {
    existingStyle.remove();
  }

  const style = document.createElement("style");
  style.id = `custom-font-${font.id}`;
  style.textContent = `
    @font-face {
      font-family: "${font.name}";
      src: url(data:font/${font.format};base64,${font.data}) format("${
    font.format === "ttf"
      ? "truetype"
      : font.format === "otf"
      ? "opentype"
      : font.format
  }");
      font-display: swap;
    }
  `;
  document.head.appendChild(style);
}

// Remove font from document
function removeInjectedFont(fontId: string) {
  const style = document.getElementById(`custom-font-${fontId}`);
  if (style) {
    style.remove();
  }
}

// Default font options - only system/web-safe fonts (no CDN dependencies for GDPR compliance)
const DEFAULT_FONTS = [
  {
    name: "System Default",
    value:
      "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  {
    name: "Serif (Georgia)",
    value: "Georgia, 'Times New Roman', Times, serif",
  },
  {
    name: "Serif (Palatino)",
    value: "'Palatino Linotype', 'Book Antiqua', Palatino, serif",
  },
  { name: "Serif (Times)", value: "'Times New Roman', Times, serif" },
  { name: "Sans-Serif (Arial)", value: "Arial, Helvetica, sans-serif" },
  { name: "Sans-Serif (Verdana)", value: "Verdana, Geneva, sans-serif" },
  {
    name: "Sans-Serif (Trebuchet)",
    value: "'Trebuchet MS', Helvetica, sans-serif",
  },
  { name: "Sans-Serif (Tahoma)", value: "Tahoma, Geneva, sans-serif" },
  { name: "Monospace (Consolas)", value: "Consolas, 'Courier New', monospace" },
  { name: "Monospace (Courier)", value: "'Courier New', Courier, monospace" },
  { name: "Cursive", value: "'Segoe Script', 'Brush Script MT', cursive" },
];

// Theme presets for story background and text colors
const THEME_PRESETS = [
  {
    id: "default",
    name: "Ocean Blue",
    background: "rgb(23, 37, 84)", // blue-950
    text: "rgb(239, 246, 255)", // blue-50
    accent: "rgb(59, 130, 246)", // blue-500
  },
  {
    id: "sepia",
    name: "Sepia",
    background: "rgb(68, 52, 35)",
    text: "rgb(245, 235, 220)",
    accent: "rgb(194, 154, 108)",
  },
  {
    id: "dark",
    name: "Pure Dark",
    background: "rgb(17, 17, 17)",
    text: "rgb(229, 229, 229)",
    accent: "rgb(168, 162, 158)",
  },
  {
    id: "paper",
    name: "Paper White",
    background: "rgb(250, 250, 248)",
    text: "rgb(41, 37, 36)",
    accent: "rgb(87, 83, 78)",
  },
  {
    id: "forest",
    name: "Forest",
    background: "rgb(20, 30, 22)",
    text: "rgb(220, 237, 222)",
    accent: "rgb(74, 124, 89)",
  },
  {
    id: "sunset",
    name: "Sunset",
    background: "rgb(45, 25, 30)",
    text: "rgb(255, 235, 230)",
    accent: "rgb(220, 120, 95)",
  },
  {
    id: "nord",
    name: "Nord",
    background: "rgb(46, 52, 64)",
    text: "rgb(236, 239, 244)",
    accent: "rgb(136, 192, 208)",
  },
  {
    id: "solarized",
    name: "Solarized Dark",
    background: "rgb(0, 43, 54)",
    text: "rgb(253, 246, 227)",
    accent: "rgb(38, 139, 210)",
  },
];

// Font size presets
const FONT_SIZE_PRESETS = [
  { name: "Small", value: 14 },
  { name: "Normal", value: 16 },
  { name: "Large", value: 18 },
  { name: "Extra Large", value: 20 },
  { name: "Huge", value: 24 },
];

export default function FontSettingsTab({
  addNotification,
}: FontSettingsTabProps) {
  const [fontSize, setFontSize] = useState(16);
  const [fontFamily, setFontFamily] = useState(
    "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
  );
  const [lineHeight, setLineHeight] = useState(1.6);
  const [paragraphSpacing, setParagraphSpacing] = useState(0.5);
  const [theme, setTheme] = useState("default");
  const [customFonts, setCustomFonts] = useState<CustomFont[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Get current theme colors
  const currentTheme =
    THEME_PRESETS.find((t) => t.id === theme) || THEME_PRESETS[0];

  // Load settings from localStorage and fonts from IndexedDB
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedFontSize = localStorage.getItem("storyFontSize");
      const savedFontFamily = localStorage.getItem("storyFontFamily");
      const savedLineHeight = localStorage.getItem("storyLineHeight");
      const savedParagraphSpacing = localStorage.getItem(
        "storyParagraphSpacing"
      );
      const savedTheme = localStorage.getItem("storyTheme");

      if (savedFontSize) setFontSize(parseInt(savedFontSize, 10));
      if (savedFontFamily) setFontFamily(savedFontFamily);
      if (savedLineHeight) setLineHeight(parseFloat(savedLineHeight));
      if (savedParagraphSpacing)
        setParagraphSpacing(parseFloat(savedParagraphSpacing));
      if (savedTheme) setTheme(savedTheme);

      // Load custom fonts from IndexedDB
      getAllFonts()
        .then((fonts) => {
          setCustomFonts(fonts);
          // Inject all saved fonts into the document
          fonts.forEach(injectFont);
        })
        .catch(console.error);
    }
  }, []);

  // Apply font settings to CSS custom properties
  const applyFontSettings = useCallback(
    (
      size: number,
      family: string,
      height: number,
      pSpacing: number,
      themeId: string
    ) => {
      if (typeof window !== "undefined") {
        const themeData =
          THEME_PRESETS.find((t) => t.id === themeId) || THEME_PRESETS[0];

        document.documentElement.style.setProperty(
          "--story-font-size",
          `${size}px`
        );
        document.documentElement.style.setProperty(
          "--story-font-family",
          family
        );
        document.documentElement.style.setProperty(
          "--story-line-height",
          `${height}`
        );
        document.documentElement.style.setProperty(
          "--story-paragraph-spacing",
          `${pSpacing}em`
        );
        document.documentElement.style.setProperty(
          "--story-bg-color",
          themeData.background
        );
        document.documentElement.style.setProperty(
          "--story-text-color",
          themeData.text
        );
        document.documentElement.style.setProperty(
          "--story-accent-color",
          themeData.accent
        );

        // Dispatch event so story page can react
        window.dispatchEvent(
          new CustomEvent("fontSettingsChanged", {
            detail: {
              fontSize: size,
              fontFamily: family,
              lineHeight: height,
              paragraphSpacing: pSpacing,
              theme: themeId,
              themeColors: {
                background: themeData.background,
                text: themeData.text,
                accent: themeData.accent,
              },
            },
          })
        );
      }
    },
    []
  );

  // Apply settings whenever they change
  useEffect(() => {
    applyFontSettings(
      fontSize,
      fontFamily,
      lineHeight,
      paragraphSpacing,
      theme
    );
  }, [
    fontSize,
    fontFamily,
    lineHeight,
    paragraphSpacing,
    theme,
    applyFontSettings,
  ]);

  const handleFontSizeChange = (newSize: number) => {
    setFontSize(newSize);
    localStorage.setItem("storyFontSize", newSize.toString());
  };

  const handleFontFamilyChange = (newFamily: string) => {
    setFontFamily(newFamily);
    localStorage.setItem("storyFontFamily", newFamily);
  };

  const handleLineHeightChange = (newHeight: number) => {
    setLineHeight(newHeight);
    localStorage.setItem("storyLineHeight", newHeight.toString());
  };

  const handleParagraphSpacingChange = (newSpacing: number) => {
    setParagraphSpacing(newSpacing);
    localStorage.setItem("storyParagraphSpacing", newSpacing.toString());
  };

  const handleThemeChange = (newTheme: string) => {
    setTheme(newTheme);
    localStorage.setItem("storyTheme", newTheme);
  };

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validExtensions = [".woff2", ".woff", ".ttf", ".otf"];
    const extension = file.name
      .substring(file.name.lastIndexOf("."))
      .toLowerCase();
    if (!validExtensions.includes(extension)) {
      addNotification(
        "Please upload a .woff2, .woff, .ttf, or .otf font file",
        "warning"
      );
      return;
    }

    // Check file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      addNotification("Font file too large. Maximum size is 5MB.", "warning");
      return;
    }

    setIsUploading(true);

    try {
      // Read file as base64
      const reader = new FileReader();
      const base64Data = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          // Extract base64 data (remove data URL prefix)
          const base64 = result.split(",")[1];
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // Get font name from filename (remove extension)
      const fontName = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
      const format = extension.replace(".", "");

      const newFont: CustomFont = {
        id: crypto.randomUUID(),
        name: fontName,
        data: base64Data,
        format,
      };

      // Save to IndexedDB
      await saveFont(newFont);

      // Inject into document
      injectFont(newFont);

      // Update state
      setCustomFonts((prev) => [...prev, newFont]);

      // Save font list to localStorage for quick reference
      const fontList = [...customFonts, newFont].map((f) => ({
        id: f.id,
        name: f.name,
      }));
      localStorage.setItem("customFontList", JSON.stringify(fontList));

      addNotification(`Font "${fontName}" uploaded successfully!`, "success");
    } catch (error) {
      console.error("Failed to upload font:", error);
      addNotification("Failed to upload font. Please try again.", "failure");
    } finally {
      setIsUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleDeleteFont = async (font: CustomFont) => {
    try {
      await deleteFont(font.id);
      removeInjectedFont(font.id);
      setCustomFonts((prev) => prev.filter((f) => f.id !== font.id));

      // Update localStorage list
      const fontList = customFonts
        .filter((f) => f.id !== font.id)
        .map((f) => ({ id: f.id, name: f.name }));
      localStorage.setItem("customFontList", JSON.stringify(fontList));

      // If this was the selected font, reset to default
      if (fontFamily === `"${font.name}"`) {
        handleFontFamilyChange("system-ui, -apple-system, sans-serif");
      }

      addNotification(`Font "${font.name}" removed`, "success");
    } catch (error) {
      console.error("Failed to delete font:", error);
      addNotification("Failed to remove font", "failure");
    }
  };

  return (
    <div className="space-y-6">
      {/* Theme Selection */}
      <div className="space-y-3">
        <label className="text-sm font-medium text-blue-200/80 flex items-center gap-2">
          <DynamicIcon name="Palette" className="w-4 h-4" />
          Color Theme
        </label>

        <div className="grid grid-cols-4 gap-2">
          {THEME_PRESETS.map((themeOption) => (
            <button
              key={themeOption.id}
              onClick={() => handleThemeChange(themeOption.id)}
              className={`relative p-1 rounded-lg transition-all ${
                theme === themeOption.id
                  ? "ring-2 ring-purple-500 ring-offset-2 ring-offset-[#0d1829]"
                  : "hover:ring-1 hover:ring-white/20"
              }`}
              title={themeOption.name}
            >
              <div
                className="w-full aspect-square rounded-md flex items-center justify-center"
                style={{ backgroundColor: themeOption.background }}
              >
                <span
                  className="text-xs font-medium truncate px-1"
                  style={{ color: themeOption.text }}
                >
                  Aa
                </span>
              </div>
              <span className="text-[10px] text-blue-300/50 block text-center mt-1 truncate">
                {themeOption.name}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Font Size */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-blue-200/80 flex items-center gap-2">
            <DynamicIcon name="Type" className="w-4 h-4" />
            Font Size
          </label>
          <span className="text-sm text-purple-300 font-medium">
            {fontSize}px
          </span>
        </div>

        <div className="flex gap-2">
          {FONT_SIZE_PRESETS.map((preset) => (
            <button
              key={preset.value}
              onClick={() => handleFontSizeChange(preset.value)}
              className={`flex-1 py-2 px-2 text-xs font-medium rounded-lg transition-colors ${
                fontSize === preset.value
                  ? "bg-linear-to-r from-purple-600 to-blue-600 text-white shadow-md shadow-purple-950/40"
                  : "bg-white/5 text-blue-200/70 hover:bg-white/10"
              }`}
            >
              {preset.name}
            </button>
          ))}
        </div>

        <input
          type="range"
          min="12"
          max="32"
          value={fontSize}
          onChange={(e) => handleFontSizeChange(parseInt(e.target.value, 10))}
          className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-purple-500"
        />
      </div>

      {/* Line Height */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-blue-200/80 flex items-center gap-2">
            <DynamicIcon name="AlignJustify" className="w-4 h-4" />
            Line Spacing
          </label>
          <span className="text-sm text-purple-300 font-medium">
            {lineHeight.toFixed(1)}
          </span>
        </div>

        <input
          type="range"
          min="1.2"
          max="2.2"
          step="0.1"
          value={lineHeight}
          onChange={(e) => handleLineHeightChange(parseFloat(e.target.value))}
          className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-purple-500"
        />
        <div className="flex justify-between text-xs text-blue-300/50">
          <span>Compact</span>
          <span>Normal</span>
          <span>Spacious</span>
        </div>
      </div>

      {/* Paragraph Spacing */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-blue-200/80 flex items-center gap-2">
            <DynamicIcon name="SeparatorHorizontal" className="w-4 h-4" />
            Paragraph Spacing
          </label>
          <span className="text-sm text-purple-300 font-medium">
            {paragraphSpacing.toFixed(1)}em
          </span>
        </div>

        <input
          type="range"
          min="0"
          max="2"
          step="0.1"
          value={paragraphSpacing}
          onChange={(e) =>
            handleParagraphSpacingChange(parseFloat(e.target.value))
          }
          className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-purple-500"
        />
        <div className="flex justify-between text-xs text-blue-300/50">
          <span>None</span>
          <span>Normal</span>
          <span>Wide</span>
        </div>
      </div>

      {/* Font Family */}
      <div className="space-y-3">
        <label className="text-sm font-medium text-blue-200/80 flex items-center gap-2">
          <DynamicIcon name="TextCursorInput" className="w-4 h-4" />
          Font Family
        </label>

        <select
          value={fontFamily}
          onChange={(e) => handleFontFamilyChange(e.target.value)}
          className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
        >
          <optgroup label="Built-in Fonts">
            {DEFAULT_FONTS.map((font) => (
              <option key={font.value} value={font.value}>
                {font.name}
              </option>
            ))}
          </optgroup>
          {customFonts.length > 0 && (
            <optgroup label="Your Custom Fonts">
              {customFonts.map((font) => (
                <option key={font.id} value={`"${font.name}"`}>
                  {font.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </div>

      {/* Font Preview */}
      <div
        className="p-4 rounded-lg border border-white/10"
        style={{ backgroundColor: currentTheme.background }}
      >
        <p className="text-xs text-blue-300/50 mb-2">Preview</p>
        <div
          style={{
            fontFamily: fontFamily,
            fontSize: `${fontSize}px`,
            lineHeight: lineHeight,
            color: currentTheme.text,
          }}
        >
          <p style={{ marginBottom: `${paragraphSpacing}em` }}>
            The quick brown fox jumps over the lazy dog. You stand at the
            entrance of the ancient dungeon, torch in hand.
          </p>
          <p style={{ marginBottom: `${paragraphSpacing}em` }}>
            Ready to face whatever awaits within, you take a deep breath and
            step forward into the darkness.
          </p>
          <p>
            The air grows cold as you descend deeper into the forgotten depths.
          </p>
        </div>
      </div>

      {/* Custom Font Upload */}
      <div className="space-y-3 pt-4 border-t border-white/10">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-blue-200/80 flex items-center gap-2">
            <DynamicIcon name="Upload" className="w-4 h-4" />
            Custom Fonts
          </label>
          <span className="text-xs text-blue-300/50">
            .woff2, .woff, .ttf, .otf
          </span>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".woff2,.woff,.ttf,.otf"
          onChange={handleFileUpload}
          className="hidden"
        />

        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="w-full py-3 px-4 border-2 border-dashed border-white/15 rounded-lg text-sm text-blue-300/60 hover:border-purple-400 hover:text-purple-300 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {isUploading ? (
            <>
              <DynamicIcon name="Loader2" className="w-4 h-4 animate-spin" />
              Uploading...
            </>
          ) : (
            <>
              <DynamicIcon name="Plus" className="w-4 h-4" />
              Upload Font File
            </>
          )}
        </button>

        {/* Uploaded Fonts List */}
        {customFonts.length > 0 && (
          <div className="space-y-2">
            {customFonts.map((font) => (
              <div
                key={font.id}
                className="flex items-center justify-between p-2 bg-white/5 rounded-lg"
              >
                <div className="flex items-center gap-2">
                  <DynamicIcon
                    name="FileText"
                    className="w-4 h-4 text-blue-300/50"
                  />
                  <span
                    className="text-sm text-blue-200/80"
                    style={{ fontFamily: `"${font.name}"` }}
                  >
                    {font.name}
                  </span>
                  <span className="text-xs text-blue-300/40 uppercase">
                    .{font.format}
                  </span>
                </div>
                <button
                  onClick={() => handleDeleteFont(font)}
                  className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                  title="Remove font"
                >
                  <DynamicIcon name="Trash2" className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        <p className="text-xs text-blue-300/50">
          Fonts are stored locally on your device. Max file size: 5MB.
        </p>
      </div>
    </div>
  );
}

// Export a hook for components to use font settings
export function useFontSettings() {
  const [settings, setSettings] = useState({
    fontSize: 16,
    fontFamily:
      "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    lineHeight: 1.6,
    paragraphSpacing: 0.5,
    theme: "default",
    themeColors: {
      background: "rgb(23, 37, 84)",
      text: "rgb(239, 246, 255)",
      accent: "rgb(59, 130, 246)",
    },
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Load initial settings
    const loadSettings = () => {
      const themeId = localStorage.getItem("storyTheme") || "default";
      const themeData =
        THEME_PRESETS.find((t) => t.id === themeId) || THEME_PRESETS[0];

      setSettings({
        fontSize: parseInt(localStorage.getItem("storyFontSize") || "16", 10),
        fontFamily:
          localStorage.getItem("storyFontFamily") ||
          "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        lineHeight: parseFloat(
          localStorage.getItem("storyLineHeight") || "1.6"
        ),
        paragraphSpacing: parseFloat(
          localStorage.getItem("storyParagraphSpacing") || "0.5"
        ),
        theme: themeId,
        themeColors: {
          background: themeData.background,
          text: themeData.text,
          accent: themeData.accent,
        },
      });
    };

    loadSettings();

    // Listen for changes
    const handleChange = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setSettings(detail);
    };

    window.addEventListener("fontSettingsChanged", handleChange);
    return () =>
      window.removeEventListener("fontSettingsChanged", handleChange);
  }, []);

  return settings;
}

// Initialize fonts on app load
export async function initializeFonts() {
  if (typeof window === "undefined") return;

  try {
    const fonts = await getAllFonts();
    fonts.forEach(injectFont);

    // Apply saved settings
    const fontSize = localStorage.getItem("storyFontSize");
    const fontFamily = localStorage.getItem("storyFontFamily");
    const lineHeight = localStorage.getItem("storyLineHeight");
    const paragraphSpacing = localStorage.getItem("storyParagraphSpacing");
    const themeId = localStorage.getItem("storyTheme") || "default";
    const themeData =
      THEME_PRESETS.find((t) => t.id === themeId) || THEME_PRESETS[0];

    if (fontSize) {
      document.documentElement.style.setProperty(
        "--story-font-size",
        `${fontSize}px`
      );
    }
    if (fontFamily) {
      document.documentElement.style.setProperty(
        "--story-font-family",
        fontFamily
      );
    }
    if (lineHeight) {
      document.documentElement.style.setProperty(
        "--story-line-height",
        lineHeight
      );
    }
    if (paragraphSpacing) {
      document.documentElement.style.setProperty(
        "--story-paragraph-spacing",
        `${paragraphSpacing}em`
      );
    }
    document.documentElement.style.setProperty(
      "--story-bg-color",
      themeData.background
    );
    document.documentElement.style.setProperty(
      "--story-text-color",
      themeData.text
    );
    document.documentElement.style.setProperty(
      "--story-accent-color",
      themeData.accent
    );
  } catch (error) {
    console.error("Failed to initialize fonts:", error);
  }
}
