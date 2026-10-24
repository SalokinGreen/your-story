"use client";

// The pieces of the story page that draw a turn: the player's line, the GM's
// one quiet line of working, and the prose itself (docs/story-screen-plan.md
// slice 3). Pure of page state, so the markup tests render them directly.

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import StoryImage from "../components/StoryImage";
import { DynamicIcon } from "../components/DynamicIcon";
import type { CouchPlayer, SceneImageRef } from "../misc/structs";
import {
  type TimelineBlock,
  buildSavedTimeline,
  narrationCameFromGMStage,
  extractVisibleText,
  redactForPlayer,
} from "../misc/turnTimeline";
import { getToolProgressLabel } from "../misc/gmToolLabels";
import {
  type MentionMatcher,
  splitTextWithMentions,
} from "../misc/noteMentions";
import { getTierModelDisplayName, slotForTier } from "../misc/reasoningTiers";
import { parsePlayerLine } from "./playerLine";
import { formatTurnWork, summarizeTurnWork } from "./turnWork";

// Display-only shape for the "Advanced" tag at the end of the work
// line - covers both a saved ScenePart's stored fields and a live in-progress
// ResolvedTier (see generation.ts:onReasoningTierResolved).
export interface ReasoningTierDisplay {
  tier: number;
  modelKey: string;
  effort: string;
}

export interface FontSettings {
  fontSize: number;
  fontFamily: string;
  lineHeight: number;
  paragraphSpacing: number;
  theme?: string;
}

// A single minimized, expandable thinking/tool row - click to see the full
// text or tool result. Collapsed by default; these now sit under the turn's
// work line and open from it, in their original order.
export function TimelineEntryPill({ block }: { block: TimelineBlock }) {
  const [override, setOverride] = React.useState<boolean | null>(null);
  if (block.kind === "text") return null; // handled by the caller directly
  // A roll made behind the GM's screen. Not rendered at all - not even as a
  // collapsed pill, since the pill itself would tell the player the GM
  // rolled for something.
  if (block.hidden) return null;

  const isTool = block.kind === "tool";
  // A streaming thought no longer opens itself: the work line says
  // "Thinking…" and the player opens it if they want to read it.
  const expanded = override ?? false;

  const label = isTool
    ? getToolProgressLabel(block.toolName || "")
    : block.streaming
      ? "Thinking"
      : block.isReasoning
        ? "Thought"
        : "Thinking";
  // The player's view of a note the GM read or reasoned about: a hidden or
  // secret note's text shows as "(hidden note)" (turnTimeline.ts redactForPlayer).
  const detail = isTool
    ? block.contextForStory
    : block.content
      ? redactForPlayer(block.content)
      : block.content;
  const canExpand = !!detail;

  return (
    <div className="my-1 text-xs">
      <button
        type="button"
        onClick={() => canExpand && setOverride(!expanded)}
        className={`flex items-center gap-1.5 text-ys-muted ${
          canExpand ? "hover:text-ys-text cursor-pointer" : "cursor-default"
        } transition-colors`}
      >
        {isTool ? (
          <DynamicIcon
            name={block.success === false ? "X" : "Check"}
            className={`w-3.5 h-3.5 shrink-0 ${
              block.success === false ? "text-ys-danger" : "text-ys-success"
            }`}
          />
        ) : (
          <DynamicIcon
            name="Brain"
            className={`w-3.5 h-3.5 shrink-0 ${block.streaming ? "animate-pulse text-ys-accent" : ""}`}
          />
        )}
        <span>
          {label}
          {block.streaming ? "…" : ""}
        </span>
        {canExpand && (
          <DynamicIcon
            name={expanded ? "ChevronUp" : "ChevronDown"}
            className="w-3 h-3 text-ys-muted"
          />
        )}
      </button>
      {expanded && detail && (
        <p className="mt-1 ml-5 pl-2 border-l-2 border-ys-border text-ys-muted italic whitespace-pre-wrap max-h-60 overflow-y-auto">
          {detail}
          {block.streaming && (
            <span className="animate-pulse text-ys-accent">▌</span>
          )}
        </p>
      )}
    </div>
  );
}

// Renders a turn's timeline in reading order. `only` picks one half of it:
// the text blocks as flowing prose (the narration), or the thinking and tool
// blocks as pills (the expanded work line).
export function TimelineView({
  blocks,
  animate,
  showHiddenMessages,
  fontSettings,
  mentionMatcher,
  onMentionClick,
  only,
}: {
  blocks: TimelineBlock[];
  animate: boolean;
  showHiddenMessages: boolean;
  fontSettings?: FontSettings;
  mentionMatcher?: MentionMatcher | null;
  onMentionClick?: (kind: "lore" | "npc", id: string) => void;
  only?: "text" | "work";
}) {
  // Keyed by position, not block.id: ids come from a module counter
  // (turnTimeline.ts), so a saved timeline rebuilt on a re-render gets new
  // ones, which would remount the prose and replay its fade-in. A turn's
  // blocks only ever grow at the end, so position is a stable key.
  return (
    <>
      {blocks.map((block, i) =>
        block.kind === "text" ? (
          only === "work" ? null : (
            <React.Fragment key={`text-${i}`}>
              <ProseBlock
                text={block.content || ""}
                animate={animate}
                showHiddenMessages={showHiddenMessages}
                fontSettings={fontSettings}
                mentionMatcher={mentionMatcher}
                onMentionClick={onMentionClick}
              />
              {block.streaming && (
                <span className="animate-pulse text-ys-accent">▌</span>
              )}
            </React.Fragment>
          )
        ) : only === "text" ? null : (
          <TimelineEntryPill key={`${block.kind}-${i}`} block={block} />
        ),
      )}
    </>
  );
}

// The player's action: a short muted line above the GM's answer, with a thin
// rule on its left, in the UI font (not the reading font) at 0.9x its size.
// One row per speaker: a queued couch or party turn holds several.
export function PlayerLine({
  content,
  couchPlayers = [],
  isComment = false,
  fontSettings,
}: {
  content: string;
  couchPlayers?: CouchPlayer[];
  isComment?: boolean;
  fontSettings?: FontSettings;
}) {
  const segments = isComment
    ? [{ speaker: undefined, name: undefined, body: content, ooc: false }]
    : parsePlayerLine(content, couchPlayers);
  const style = fontSettings
    ? { fontSize: `${fontSettings.fontSize * 0.9}px` }
    : undefined;
  if (segments.length === 0) return null;
  return (
    <div className="space-y-1">
      {segments.map((seg, i) => {
        const tag = isComment ? "comment" : seg.ooc ? "to the GM" : null;
        return (
          <div
            key={i}
            className="border-l-2 border-ys-border pl-3 text-ys-muted font-sans"
            style={style}
          >
            {seg.name && (
              <span
                className="font-semibold mr-1.5"
                style={seg.speaker ? { color: seg.speaker.color } : undefined}
              >
                {seg.name}
              </span>
            )}
            <span
              className={`whitespace-pre-wrap ${
                seg.ooc || isComment ? "italic" : ""
              }`}
            >
              {seg.body}
            </span>
            {tag && (
              <span className="ml-2 text-[10px] uppercase tracking-wide not-italic border border-ys-border rounded px-1 align-middle">
                {tag}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// The button at the end of a turn's work line that opens the same actions row
// a tap on the prose does, for keyboards and screen readers.
export function TurnActionsToggle({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-label="Turn actions"
      title="Turn actions"
      className="ml-auto shrink-0 p-1 rounded text-ys-muted opacity-40 hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ys-accent transition-opacity"
    >
      <DynamicIcon name="Ellipsis" className="w-4 h-4" />
    </button>
  );
}

// The row of actions under a tapped turn. Each handler is the condition: a
// missing one hides its button (the page passes Retry, Undo, Illustrate and
// Read aloud for the latest turn only; an earlier turn gets Edit alone).
export interface TurnActionsProps {
  onRetry?: () => void;
  onUndo?: () => void;
  // The Observer revised this turn: Undo puts the GM's original back.
  undoTitle?: string;
  undoLabel?: string;
  onEdit?: () => void;
  onIllustrate?: () => void;
  onReadAloud?: () => void;
  // Opens the feedback form for this turn; absent for an online guest and
  // where the feedback address is not set (docs/feedback-design.md).
  onFeedback?: () => void;
  disabled?: boolean;
}

export function TurnActions({
  onRetry,
  onUndo,
  undoTitle = "Undo last action",
  undoLabel = "Undo",
  onEdit,
  onIllustrate,
  onReadAloud,
  onFeedback,
  disabled = false,
}: TurnActionsProps) {
  const action = (
    label: string,
    icon: string,
    onClick: (() => void) | undefined,
    title: string = label,
    off: boolean = disabled,
  ) =>
    onClick && (
      <button
        key={label}
        type="button"
        onClick={onClick}
        disabled={off}
        aria-label={label}
        title={title}
        className="w-10 h-10 flex items-center justify-center rounded-lg text-ys-muted hover:text-ys-text hover:bg-ys-surface active:bg-ys-border focus-visible:ring-2 focus-visible:ring-ys-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed touch-manipulation"
      >
        <DynamicIcon name={icon} className="w-5 h-5" />
      </button>
    );
  return (
    <div
      role="toolbar"
      aria-label="Turn actions"
      className="flex items-center gap-1 -ml-2"
    >
      {action("Retry", "RotateCcw", onRetry, "Regenerate response")}
      {action(undoLabel, "Undo2", onUndo, undoTitle)}
      {action("Edit", "Pencil", onEdit, "Edit response")}
      {action("Illustrate", "Image", onIllustrate, "Paint a picture of this moment")}
      {action("Read aloud", "Volume2", onReadAloud)}
      {action("Feedback", "MessageSquare", onFeedback, "Feedback on this turn")}
    </div>
  );
}

// The GM's working, folded into one quiet line: dice spelled out, everything
// else counted, the "Advanced" tag at its end (a Default turn shows nothing). Tapping it opens the pills in
// their original order. While the turn streams it shows what the GM is doing
// ("Thinking…", pulsing) and stays closed.
export function TurnWorkLine({
  blocks,
  reasoningTier,
  streaming = false,
  trailing,
}: {
  blocks: TimelineBlock[];
  reasoningTier?: ReasoningTierDisplay;
  streaming?: boolean;
  // The "Turn actions" button, which sits at the end of the line - or alone
  // when the turn did no work worth a line.
  trailing?: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const summary = summarizeTurnWork(blocks);
  // Only an Advanced turn is tagged (decision 124); Default turns say nothing.
  const advancedTier =
    reasoningTier && slotForTier(reasoningTier.tier) === "advanced"
      ? reasoningTier
      : undefined;
  const live = streaming ? (summary.live ?? "Thinking…") : undefined;
  if (summary.isEmpty && !live && !advancedTier) {
    // No work line to sit at the end of: a lone "…" above the prose reads as
    // a glitch, and touch players open the row by tapping the turn anyway.
    // The toggle stays for keyboard users, shown once it has focus.
    return trailing ? (
      <div className="sr-only focus-within:not-sr-only flex text-xs text-ys-muted">
        {trailing}
      </div>
    ) : null;
  }

  const text = formatTurnWork(summary);
  const hasPills = blocks.some((b) => b.kind !== "text" && !b.hidden);
  const canOpen = hasPills && !streaming;
  const shown = live ?? text;

  return (
    <div className="text-xs text-ys-muted">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => canOpen && setOpen(!open)}
          className={`min-w-0 text-left ${
            canOpen ? "hover:text-ys-text cursor-pointer" : "cursor-default"
          } ${live ? "animate-pulse" : ""} transition-colors`}
          aria-expanded={canOpen ? open : undefined}
        >
          {/* The die marks a turn whose line leads with a roll (design §2). */}
          {!live && summary.rolls.length > 0 && (
            <span aria-hidden="true" className="mr-1">
              ⚄
            </span>
          )}
          {shown}
          {canOpen && (
            <DynamicIcon
              name={open ? "ChevronUp" : "ChevronDown"}
              className="inline w-3 h-3 ml-1 align-text-bottom"
            />
          )}
        </button>
        {advancedTier && (
          <span
            className="text-[10px] text-ys-muted border border-ys-border rounded px-1 leading-tight cursor-default shrink-0"
            title={`${getTierModelDisplayName(advancedTier.modelKey)} · ${advancedTier.effort} effort`}
          >
            Advanced
          </span>
        )}
        {trailing}
      </div>
      {open && canOpen && (
        <div className="mt-1">
          <TimelineView
            blocks={blocks}
            animate={false}
            showHiddenMessages={false}
            only="work"
          />
        </div>
      )}
    </div>
  );
}

export interface GMTurnProps {
  content: string;
  /** True only on the latest exchange: the prose fades in. */
  animate?: boolean;
  isStreaming?: boolean;
  showHiddenMessages?: boolean;
  fontSettings?: FontSettings;
  // Saved GM conversation for a historical turn - rebuilds its timeline
  // (see turnTimeline.ts:buildSavedTimeline).
  gmConversation?: Array<{
    role: "assistant" | "tool";
    content: string;
    reasoning?: string;
    tool_calls?: Array<{
      id: string;
      function: { name: string; arguments: string };
    }>;
    tool_call_id?: string;
  }>;
  toolResults?: Map<
    string,
    {
      success: boolean;
      contextForStory: string;
      toolName: string;
      hiddenFromPlayer?: boolean;
    }
  >;
  // The story stage's own native reasoning (ScenePart.reasoning).
  storyReasoning?: string;
  reasoningTier?: ReasoningTierDisplay;
  // Live timeline for the turn currently generating - undefined for
  // historical turns, which rebuild theirs from gmConversation.
  liveTimeline?: TimelineBlock[];
  mentionMatcher?: MentionMatcher | null;
  onMentionClick?: (kind: "lore" | "npc", id: string) => void;
  images?: SceneImageRef[];
  isGuest?: boolean;
  onRegenerateImage?: (ref: SceneImageRef) => void;
  // Turn actions on tap (slice 4). `onTap` fires for a tap that is not on a
  // control; `onToggleActions` is the "Turn actions" button; `actions` is the
  // row, shown under the prose while `actionsOpen`.
  onTap?: () => void;
  onToggleActions?: () => void;
  actionsOpen?: boolean;
  actions?: React.ReactNode;
}

// A tap that landed on something with its own job, or that ended a text
// selection, is not a request for the actions row.
export function isTurnTap(
  target: EventTarget | null,
  selectedText: string,
): boolean {
  if (selectedText.length > 0) return false;
  const el = target as { closest?: (selector: string) => unknown } | null;
  if (typeof el?.closest !== "function") return true;
  return !el.closest(
    'button, a, [role="button"], img, video, [data-no-turn-tap]',
  );
}

// One GM turn: pictures first and full bleed, then the work line, then the
// prose with no card, avatar or name.
export function GMTurn({
  content,
  animate = false,
  isStreaming = false,
  showHiddenMessages = false,
  fontSettings,
  gmConversation,
  toolResults,
  storyReasoning,
  reasoningTier,
  liveTimeline,
  mentionMatcher,
  onMentionClick,
  images,
  isGuest = false,
  onRegenerateImage,
  onTap,
  onToggleActions,
  actionsOpen = false,
  actions,
}: GMTurnProps) {
  // The narration has exactly one source per turn:
  //  - streaming: the live blocks' text;
  //  - a saved turn whose GM stage wrote the prose itself (its visible text
  //    reproduces `content`): the text blocks rebuilt from gmConversation;
  //  - any other saved turn (a separate story stage, an edited turn - handleEdit
  //    changes `content` and leaves gmConversation alone, so the match fails -
  //    or an old save with none): `content` through prettify, and the rebuilt
  //    blocks contribute only their pills.
  const narrationInline = React.useMemo(
    () =>
      gmConversation ? narrationCameFromGMStage(gmConversation, content) : false,
    [gmConversation, content],
  );
  const savedTimeline = React.useMemo(
    () =>
      gmConversation || storyReasoning
        ? buildSavedTimeline(
            gmConversation,
            toolResults,
            narrationInline,
            storyReasoning,
          )
        : [],
    [gmConversation, toolResults, narrationInline, storyReasoning],
  );

  const isLive = liveTimeline !== undefined;
  const timeline = isLive ? liveTimeline : savedTimeline;
  const showSeparateContent = !isLive && !narrationInline;

  return (
    <div
      className="space-y-3"
      data-turn=""
      onClick={
        onTap
          ? (e) => {
              if (isTurnTap(e.target, window.getSelection()?.toString() ?? "")) {
                onTap();
              }
            }
          : undefined
      }
    >
      {images && images.length > 0 && (
        <div className="-mx-4 space-y-2" data-no-turn-tap="">
          {images.map((ref) => (
            <StoryImage
              key={ref.imageId}
              imageId={ref.imageId}
              isGuest={isGuest}
              onRegenerate={
                onRegenerateImage ? () => onRegenerateImage(ref) : undefined
              }
            />
          ))}
        </div>
      )}
      <div data-no-turn-tap="" className="empty:hidden">
        <TurnWorkLine
          blocks={timeline}
          reasoningTier={reasoningTier}
          streaming={isStreaming}
          trailing={
            onToggleActions ? (
              <TurnActionsToggle
                open={actionsOpen}
                onToggle={onToggleActions}
              />
            ) : undefined
          }
        />
      </div>
      {!showSeparateContent && (
        <TimelineView
          blocks={timeline}
          only="text"
          animate={animate}
          showHiddenMessages={showHiddenMessages}
          fontSettings={fontSettings}
          mentionMatcher={mentionMatcher}
          onMentionClick={onMentionClick}
        />
      )}
      {showSeparateContent && (
        <ProseBlock
          text={content}
          animate={animate}
          showHiddenMessages={showHiddenMessages}
          fontSettings={fontSettings}
          mentionMatcher={mentionMatcher}
          onMentionClick={onMentionClick}
        />
      )}
      {actionsOpen && actions}
    </div>
  );
}

// react-markdown hands every component a `node` prop that must not reach the DOM.
const stripNode = <P extends { node?: unknown }>(props: P): Omit<P, "node"> => {
  const copy = { ...props };
  delete copy.node;
  return copy;
};

// Parse hidden text: ||hidden text|| becomes either hidden or visible based on setting
export const parseHiddenText = (text: string, showHidden: boolean): string => {
  if (showHidden) {
    // Show hidden text with special styling marker
    // Use markers that won't be affected by markdown processing
    return text.replace(/\|\|([\s\S]*?)\|\|/g, "⟦HIDDEN_START⟧$1⟦HIDDEN_END⟧");
  } else {
    // Remove hidden text entirely (use non-greedy match to handle nested ||)
    return text.replace(/\|\|[\s\S]*?\|\|/g, "");
  }
};

// prettify builds react-markdown's custom components inline, so every call
// makes new component types and React remounts the whole passage, replaying
// its fade-in. Memoized on its (stable) props, a passage re-renders only when
// its text, the font settings or the mentions actually change, not whenever
// anything else on the page does (tapping a turn, opening the menu).
const ProseBlock = React.memo(function ProseBlock({
  text,
  animate,
  showHiddenMessages,
  fontSettings,
  mentionMatcher,
  onMentionClick,
}: {
  text: string;
  animate: boolean;
  showHiddenMessages: boolean;
  fontSettings?: FontSettings;
  mentionMatcher?: MentionMatcher | null;
  onMentionClick?: (kind: "lore" | "npc", id: string) => void;
}) {
  return prettify(
    text,
    animate,
    showHiddenMessages,
    fontSettings,
    mentionMatcher,
    onMentionClick,
  );
});

export const prettify = (
  text: string,
  animate: boolean = true,
  showHiddenMessages: boolean = false,
  fontSettings?: FontSettings,
  mentionMatcher?: MentionMatcher | null,
  onMentionClick?: (kind: "lore" | "npc", id: string) => void,
) => {
  // Process tags and hidden text before rendering - defensive against a
  // stray tag even though content is expected to already be clean by the
  // time it reaches here (see turnTimeline.ts:extractVisibleText).
  const cleanedText = extractVisibleText(text);
  const processedText = parseHiddenText(cleanedText, showHiddenMessages);

  const customStyle = fontSettings
    ? {
        fontSize: `${fontSettings.fontSize}px`,
        fontFamily: fontSettings.fontFamily,
        lineHeight: fontSettings.lineHeight,
        // Set inline, not inherited: the typography plugin's `prose` class
        // gives paragraphs its own grey, which would win over the feed's.
        color: "var(--ys-text)",
      }
    : undefined;

  const paragraphStyle = fontSettings
    ? {
        marginBottom: `${fontSettings.paragraphSpacing}em`,
      }
    : undefined;

  return (
    <div
      className={`prose prose-sm max-w-none ${
        animate ? "animate-fade-in" : ""
      }`}
      style={customStyle}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: (allProps) => {
            const { children, ...props } = stripNode(allProps);
            // Track hidden state across all children
            let inHidden = false;

            // Process children to handle hidden text markers
            const processChildren = (
              child: React.ReactNode,
              key: number | string,
            ): React.ReactNode => {
              if (typeof child === "string") {
                const parts = child.split(/(⟦HIDDEN_START⟧|⟦HIDDEN_END⟧)/);
                return parts.map((part, i) => {
                  if (part === "⟦HIDDEN_START⟧") {
                    inHidden = true;
                    return null;
                  }
                  if (part === "⟦HIDDEN_END⟧") {
                    inHidden = false;
                    return null;
                  }
                  if (part === "") return null;
                  if (inHidden) {
                    return (
                      <span
                        key={`${key}-${i}`}
                        className="bg-ys-accent/20 text-ys-text px-1 rounded border border-ys-border"
                        title="Hidden message (only visible with setting enabled)"
                      >
                        {part}
                      </span>
                    );
                  }
                  return part;
                });
              }
              // Handle React elements (like <em>, <strong>) that might be inside hidden text
              if (React.isValidElement(child)) {
                if (inHidden) {
                  // Wrap the entire element in hidden styling
                  return (
                    <span
                      key={key}
                      className="bg-ys-accent/20 text-ys-text px-1 rounded border border-ys-border"
                      title="Hidden message (only visible with setting enabled)"
                    >
                      {child}
                    </span>
                  );
                }
                return child;
              }
              return child;
            };

            const processedChildren: React.ReactNode[] = [];
            React.Children.forEach(children, (child, index) => {
              const result = processChildren(child, index);
              if (Array.isArray(result)) {
                processedChildren.push(...result);
              } else if (result !== null) {
                processedChildren.push(result);
              }
            });

            // Second pass: highlight lore-title/NPC-name mentions within the
            // plain-text segments (leaves hidden-text spans and other
            // elements from the pass above untouched).
            const withMentions: React.ReactNode[] = mentionMatcher
              ? processedChildren.flatMap((node, idx): React.ReactNode[] => {
                  if (typeof node !== "string" || !node) return [node];
                  const segments = splitTextWithMentions(node, mentionMatcher);
                  if (segments.length === 1 && !segments[0].mention) {
                    return [node];
                  }
                  return segments.map((seg, i) =>
                    seg.mention ? (
                      <span
                        key={`mention-${idx}-${i}`}
                        role="button"
                        tabIndex={0}
                        onClick={() =>
                          onMentionClick?.(seg.mention!.kind, seg.mention!.id)
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onMentionClick?.(seg.mention!.kind, seg.mention!.id);
                          }
                        }}
                        className={`${seg.mention.colorClass} underline decoration-dotted decoration-1 underline-offset-2 cursor-pointer hover:brightness-125 transition-[filter]`}
                        title={`Open note: ${seg.mention.label}`}
                      >
                        {seg.text}
                      </span>
                    ) : (
                      seg.text
                    ),
                  );
                })
              : processedChildren;

            return (
              <p
                className="leading-relaxed last:mb-0"
                style={paragraphStyle}
                {...props}
              >
                {withMentions}
              </p>
            );
          },
          h1: (props) => (
            <h1 className="text-xl font-bold mb-2 mt-3 first:mt-0" {...stripNode(props)} />
          ),
          h2: (props) => (
            <h2 className="text-lg font-bold mb-2 mt-3 first:mt-0" {...stripNode(props)} />
          ),
          h3: (props) => (
            <h3
              className="text-base font-bold mb-1.5 mt-2 first:mt-0"
              {...stripNode(props)}
            />
          ),
          strong: (props) => (
            <strong className="font-bold" {...stripNode(props)} />
          ),
          em: (props) => (
            <em className="italic opacity-90" {...stripNode(props)} />
          ),
          ul: (props) => (
            <ul
              className="list-disc ml-4 mb-2 space-y-0.5 last:mb-0"
              {...stripNode(props)}
            />
          ),
          ol: (props) => (
            <ol
              className="list-decimal ml-4 mb-2 space-y-0.5 last:mb-0"
              {...stripNode(props)}
            />
          ),
          li: (props) => (
            <li className="leading-relaxed" {...stripNode(props)} />
          ),
          blockquote: (props) => (
            <blockquote
              className="border-l-2 pl-3 italic opacity-70 my-2"
              style={{ borderColor: "currentColor" }}
              {...stripNode(props)}
            />
          ),
        }}
      >
        {processedText}
      </ReactMarkdown>
    </div>
  );
};
