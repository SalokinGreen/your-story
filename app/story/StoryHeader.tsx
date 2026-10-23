"use client";

import { useEffect, useState } from "react";
import { DynamicIcon } from "../components/DynamicIcon";
import { DEFAULT_READING_FONT } from "./themeTokens";

interface StoryHeaderProps {
  /** The story name, or the page name off the story. */
  title: string;
  /** ‹ : to the Library on the story, back to the story elsewhere. */
  onBack: () => void;
  onOpenMenu: () => void;
  /** The dot on ☰: a sync conflict, an online session, unread OOC chat. */
  attention: boolean;
  /** Label for ‹ (the Library, or the story). */
  backLabel?: string;
}

/**
 * The one 52 px row at the top of the story screen: ‹, the title in the
 * reading font, and ☰ (the story menu). It is the same on every page.
 */
export function StoryHeader({
  title,
  onBack,
  onOpenMenu,
  attention,
  backLabel = "Leave to Library",
}: StoryHeaderProps) {
  // The reading font is a Settings value kept in localStorage. The header
  // only renders once the story has loaded on the client, so reading it in
  // the initialiser cannot mismatch a prerender. Changes come from Settings.
  const [fontFamily, setFontFamily] = useState(() =>
    typeof window === "undefined"
      ? DEFAULT_READING_FONT
      : localStorage.getItem("storyFontFamily") || DEFAULT_READING_FONT,
  );
  useEffect(() => {
    const handleFontChange = (e: Event) => {
      const detail = (e as CustomEvent<{ fontFamily?: string }>).detail;
      if (detail?.fontFamily) setFontFamily(detail.fontFamily);
    };
    window.addEventListener("fontSettingsChanged", handleFontChange);
    return () =>
      window.removeEventListener("fontSettingsChanged", handleFontChange);
  }, []);

  return (
    <header className="h-[52px] shrink-0 flex items-center gap-1 px-1.5 bg-ys-bg text-ys-text border-b border-ys-border">
      <button
        type="button"
        onClick={onBack}
        className="focus-ring shrink-0 rounded-lg p-2 text-ys-muted hover:text-ys-text hover:bg-ys-surface transition-colors"
        title={backLabel}
        aria-label={backLabel}
      >
        <DynamicIcon name="ChevronLeft" className="w-6 h-6" />
      </button>
      <h1
        className="min-w-0 flex-1 truncate text-base font-medium"
        style={{ fontFamily }}
      >
        {title}
      </h1>
      <button
        type="button"
        id="story-menu-button"
        onClick={onOpenMenu}
        className="focus-ring relative shrink-0 rounded-lg p-2 text-ys-muted hover:text-ys-text hover:bg-ys-surface transition-colors"
        title="Menu"
        aria-label={attention ? "Menu (needs attention)" : "Menu"}
        aria-haspopup="dialog"
      >
        <DynamicIcon name="Menu" className="w-6 h-6" />
        {attention && (
          <span
            aria-hidden="true"
            className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-ys-accent"
          />
        )}
      </button>
    </header>
  );
}
