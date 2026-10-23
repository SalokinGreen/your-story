"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { DynamicIcon } from "@/app/components/DynamicIcon";

/**
 * The shape both a finished note (StoryLore, from the import result) and a
 * half-written one (PartialNote, parsed out of the live stream) satisfy, so
 * the same card renders a note while it is being written and after it has
 * landed.
 */
export interface PreviewNote {
  title: string;
  content: string;
  type?: string;
  folder?: string;
  tags?: string[];
  aliases?: string[];
  keys?: string[];
  relatedCharacters?: string[];
  relatedLocations?: string[];
  secrtet?: boolean;
  /** True while the model is still writing this entry. */
  streaming?: boolean;
}

type NoteKind = "lore" | "mechanics" | "character_sheet" | "table";

const KIND_STYLES: Record<
  NoteKind,
  { label: string; icon: string; chip: string; accent: string; ring: string }
> = {
  lore: {
    label: "Lore",
    icon: "BookOpen",
    chip: "bg-ys-accent/15 text-ys-text ring-1 ring-ys-accent/25",
    accent: "text-ys-muted",
    ring: "hover:border-ys-accent/30",
  },
  mechanics: {
    label: "Mechanics",
    icon: "Dices",
    chip: "bg-ys-warning/15 text-ys-warning ring-1 ring-ys-warning/25",
    accent: "text-ys-warning",
    ring: "hover:border-ys-warning/30",
  },
  character_sheet: {
    label: "Character Sheet",
    icon: "UserRound",
    chip: "bg-ys-success/15 text-ys-success ring-1 ring-ys-success/25",
    accent: "text-ys-success",
    ring: "hover:border-ys-success/30",
  },
  table: {
    label: "Table",
    icon: "Table",
    chip: "bg-ys-accent/15 text-ys-accent ring-1 ring-ys-accent/25",
    accent: "text-ys-accent",
    ring: "hover:border-ys-accent/30",
  },
};

function noteKind(note: PreviewNote, fallback: NoteKind): NoteKind {
  if (
    note.type === "mechanics" ||
    note.type === "character_sheet" ||
    note.type === "table"
  ) {
    return note.type;
  }
  if (note.type === "lore") return "lore";
  return fallback;
}

/** Markdown stripped back to plain text, for the collapsed two-line teaser. */
function toTeaser(content: string): string {
  return content
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#*_>`~|-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function ChipRow({
  icon,
  items,
  className,
}: {
  icon: string;
  items: string[];
  className: string;
}) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="text-ys-muted">
        <DynamicIcon name={icon} className="w-3 h-3" />
      </span>
      {items.map((item, i) => (
        <span
          key={`${item}-${i}`}
          className={`px-1.5 py-0.5 rounded text-[10px] leading-none ${className}`}
        >
          {item}
        </span>
      ))}
    </div>
  );
}

/**
 * One extracted note, as a card: what kind of note it is, where it will be
 * filed, and its actual prose rendered as markdown rather than dumped as a
 * raw string.
 */
export default function NotePreviewCard({
  note,
  fallbackKind = "lore",
  defaultExpanded = false,
}: {
  note: PreviewNote;
  /** Which list this note came from, when the entry has no explicit type. */
  fallbackKind?: NoteKind;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const kind = noteKind(note, fallbackKind);
  const style = KIND_STYLES[kind];
  const teaser = toTeaser(note.content);
  const hasDetail =
    (note.keys?.length ?? 0) > 0 ||
    (note.tags?.length ?? 0) > 0 ||
    (note.aliases?.length ?? 0) > 0 ||
    (note.relatedCharacters?.length ?? 0) > 0 ||
    (note.relatedLocations?.length ?? 0) > 0;

  return (
    <div
      className={`rounded-xl border bg-ys-surface transition-colors ${style.ring} ${
        note.streaming
          ? "border-ys-accent/30 shadow-[0_0_0_1px_rgba(168,85,247,0.12)]"
          : "border-ys-border"
      }`}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left p-3 flex items-start gap-3"
      >
        <span
          className={`shrink-0 mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center ${style.chip}`}
        >
          <DynamicIcon name={style.icon} className="w-4 h-4" />
        </span>

        <span className="flex-1 min-w-0">
          <span className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-ys-text text-sm [overflow-wrap:anywhere]">
              {note.title || (
                <span className="text-ys-muted italic">Writing…</span>
              )}
            </span>
            {note.secrtet && (
              <span className="px-1.5 py-0.5 rounded text-[10px] leading-none bg-ys-accent/15 text-ys-accent ring-1 ring-ys-accent/25 flex items-center gap-1">
                <DynamicIcon name="EyeOff" className="w-2.5 h-2.5" />
                Secret
              </span>
            )}
            {note.folder && (
              <span className="px-1.5 py-0.5 rounded text-[10px] leading-none bg-ys-surface text-ys-text flex items-center gap-1">
                <DynamicIcon name="Folder" className="w-2.5 h-2.5" />
                {note.folder}
              </span>
            )}
          </span>

          {!expanded && (
            <span className="block text-xs text-ys-muted mt-1 line-clamp-2">
              {teaser || (
                <span className="italic text-ys-muted">No content yet</span>
              )}
              {note.streaming && (
                <span className="inline-block w-1.5 h-3 ml-0.5 -mb-0.5 bg-ys-accent/80 animate-pulse rounded-[1px]" />
              )}
            </span>
          )}
        </span>

        <span className="shrink-0 flex items-center gap-1.5">
          <span className={`text-[10px] font-medium ${style.accent}`}>
            {style.label}
          </span>
          <span className="text-ys-muted">
            <DynamicIcon
              name={expanded ? "ChevronUp" : "ChevronDown"}
              className="w-4 h-4"
            />
          </span>
        </span>
      </button>

      {expanded && (
        <div className="px-3 pb-3 -mt-1 space-y-2">
          {/* An extracted note can hold a markdown table or a long unbroken
              string, either of which is wider than a phone screen. Wrap what
              can be wrapped and scroll the rest inside the card, so the card
              never widens the page around it. */}
          <div className="rounded-lg bg-ys-surface p-3 overflow-x-auto [overflow-wrap:anywhere] prose prose-sm max-w-none text-ys-text prose-headings:text-ys-text prose-strong:text-ys-text prose-a:text-ys-accent prose-table:text-xs">
            {note.content ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {note.content}
              </ReactMarkdown>
            ) : (
              <p className="italic text-ys-muted">No content yet</p>
            )}
          </div>

          {hasDetail && (
            <div className="space-y-1.5">
              <ChipRow
                icon="KeyRound"
                items={note.keys ?? []}
                className="bg-ys-accent/10 text-ys-accent/80"
              />
              <ChipRow
                icon="Tag"
                items={note.tags ?? []}
                className="bg-ys-surface text-ys-text"
              />
              <ChipRow
                icon="Repeat"
                items={note.aliases ?? []}
                className="bg-ys-surface text-ys-text"
              />
              <ChipRow
                icon="Users"
                items={note.relatedCharacters ?? []}
                className="bg-ys-success/10 text-ys-success/80"
              />
              <ChipRow
                icon="MapPin"
                items={note.relatedLocations ?? []}
                className="bg-ys-accent/10 text-ys-text"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
