"use client";

import { useEffect, useRef } from "react";
import { DynamicIcon } from "../components/DynamicIcon";
import { useBackHandler } from "@/app/misc/useBackHandler";

interface StoryMenuSheetProps {
  open: boolean;
  onClose: () => void;
  /**
   * True while a full-screen view or dialog that the menu itself opened (the
   * Story Editor, Save Copy, a confirm) is on top. Those live inside this
   * sheet's DOM, so Escape and Tab belong to them, not to the sheet.
   */
  modalOpen?: boolean;
  children: React.ReactNode;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The story menu's container: a bottom sheet on a phone (below `sm`), a 380 px
 * right panel from `sm` up. It scrolls its own body (the story page locks
 * document scrolling), owns keyboard focus while open, and sits at z-50:
 * above the OOC panel (z-40), at the level of the play modals (which come
 * later in the page, so they stack over it) and below toasts (z-100).
 *
 * The panel carries no transform, filter or backdrop-filter, because the
 * full-screen views the menu opens are `fixed` descendants and would be
 * trapped inside a box that has one.
 */
export function StoryMenuSheet({
  open,
  onClose,
  modalOpen = false,
  children,
}: StoryMenuSheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  // Latest props for the window listener, which is bound once per open.
  const onCloseRef = useRef(onClose);
  const modalOpenRef = useRef(modalOpen);
  useEffect(() => {
    onCloseRef.current = onClose;
    modalOpenRef.current = modalOpen;
  });

  // Focus moves to the first row on open and returns to the opener on close.
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const body = panelRef.current?.querySelector<HTMLElement>("[data-sheet-body]");
    body?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    return () => {
      const target =
        opener && opener.isConnected && opener !== document.body
          ? opener
          : document.getElementById("story-menu-button");
      target?.focus();
    };
  }, [open]);

  // Escape closes; Tab stays inside. Both stand down while a view the menu
  // opened is on top of it.
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (modalOpenRef.current) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!panel.contains(active)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  // Android back closes the sheet; anything it opened sits above this entry
  // (decision 133).
  useBackHandler(open, onClose);

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/50 animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Story menu"
        className="fixed z-50 inset-x-0 bottom-0 max-h-[85dvh] flex flex-col rounded-t-2xl border-t border-ys-border bg-ys-surface text-ys-text shadow-2xl sm:inset-x-auto sm:right-0 sm:top-0 sm:max-h-none sm:w-[380px] sm:rounded-none sm:border-t-0 sm:border-l"
      >
        <div className="sm:hidden flex justify-center pt-2 pb-1 shrink-0" aria-hidden="true">
          <span className="h-1 w-10 rounded-full bg-ys-border" />
        </div>
        <div className="hidden sm:flex items-center justify-between shrink-0 px-4 pt-3 pb-1">
          <span className="text-sm font-semibold text-ys-text">Menu</span>
          <button
            type="button"
            onClick={onClose}
            className="focus-ring rounded-lg p-1.5 text-ys-muted hover:text-ys-text hover:bg-ys-bg transition-colors"
            aria-label="Close menu"
            title="Close"
          >
            <DynamicIcon name="X" className="w-4 h-4" />
          </button>
        </div>
        <div
          data-sheet-body
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 pt-1"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
        >
          {children}
        </div>
      </div>
    </>
  );
}
