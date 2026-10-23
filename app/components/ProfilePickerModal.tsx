"use client";

import { useBackHandler } from "../misc/useBackHandler";
import { useState } from "react";
import { CouchPlayer, PlayerArchetype } from "../misc/structs";
import { DynamicIcon } from "./DynamicIcon";
import { ARCHETYPE_INFO } from "../misc/gmAdvice";
import { PALETTE } from "../story/menu/CouchPlayersEditor";
import { PERSONALITY_TAGS, WISH_TAGS } from "./GuidedStoryStart";
import type { ClaimedProfile } from "../misc/multiplayer/session";

const ARCHETYPE_OPTIONS = Object.entries(ARCHETYPE_INFO) as [
  PlayerArchetype,
  (typeof ARCHETYPE_INFO)[PlayerArchetype],
][];

const MAX_PERSONALITY_TAGS = 4;

function newProfileId(): string {
  return `player_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// Shown to a guest right after they connect to a room: pick one of the story's
// saved player profiles (resume it from any device) or build a fresh one. The
// chosen profile is what claims a seat on the host (see NetSession.
// announceProfile), and saved profiles persist with the story so returning
// players can just pick themselves next time.
export default function ProfilePickerModal({
  isOpen,
  connecting,
  savedProfiles,
  defaultName,
  defaultColor,
  onClaim,
  onCancel,
}: {
  isOpen: boolean;
  // True while we're still waiting for the host's snapshot (the saved-profile
  // roster) to arrive.
  connecting: boolean;
  savedProfiles: CouchPlayer[];
  defaultName: string;
  defaultColor: string;
  onClaim: (profile: ClaimedProfile) => void;
  onCancel: () => void;
}) {
  const [mode, setMode] = useState<"pick" | "create">("pick");
  const [name, setName] = useState(defaultName);
  const [color, setColor] = useState(defaultColor);
  const [archetype, setArchetype] = useState<PlayerArchetype | "">("");
  const [personalityTags, setPersonalityTags] = useState<string[]>([]);
  const [wishTags, setWishTags] = useState<string[]>([]);

  useBackHandler(isOpen, onCancel);

  if (!isOpen) return null;

  const togglePersonality = (tag: string) => {
    setPersonalityTags((prev) =>
      prev.includes(tag)
        ? prev.filter((t) => t !== tag)
        : prev.length < MAX_PERSONALITY_TAGS
          ? [...prev, tag]
          : prev,
    );
  };

  const toggleWish = (tag: string) => {
    setWishTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  };

  const claimSaved = (p: CouchPlayer) => {
    onClaim({
      profileId: p.id,
      name: p.name,
      color: p.color,
      archetype: p.archetype ?? null,
      personalityTags: p.personalityTags ?? null,
      wishTags: p.wishTags ?? null,
    });
  };

  const claimNew = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onClaim({
      profileId: newProfileId(),
      name: trimmed,
      color,
      archetype: archetype || null,
      personalityTags: personalityTags.length ? personalityTags : null,
      wishTags: wishTags.length ? wishTags : null,
    });
  };

  // Only offer "pick" when there are saved profiles; otherwise jump to create.
  const hasSaved = savedProfiles.length > 0;
  const effectiveMode = hasSaved ? mode : "create";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center ys-modal-backdrop p-4">
      <div className="bg-ys-accent border border-ys-accent/50 rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-ys-accent/40">
          <h3 className="text-base font-bold text-ys-text flex items-center gap-2">
            <DynamicIcon name="UserCircle" className="w-4 h-4 text-ys-accent" />
            Choose your character
          </h3>
          <button
            onClick={onCancel}
            className="p-1.5 text-ys-muted hover:text-ys-text hover:bg-ys-accent/50 rounded-lg transition-colors"
            title="Leave the room"
          >
            <DynamicIcon name="X" className="w-4 h-4" />
          </button>
        </div>

        {connecting ? (
          <div className="p-8 flex flex-col items-center gap-3 text-ys-muted">
            <DynamicIcon name="Loader2" className="w-6 h-6 animate-spin" />
            <span className="text-sm">Connecting to the room…</span>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            {hasSaved && (
              <div className="flex gap-1 p-1 bg-ys-accent/30 rounded-xl">
                <button
                  onClick={() => setMode("pick")}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    effectiveMode === "pick"
                      ? "bg-ys-accent text-ys-on-accent"
                      : "text-ys-muted hover:text-ys-text"
                  }`}
                >
                  Resume a profile
                </button>
                <button
                  onClick={() => setMode("create")}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    effectiveMode === "create"
                      ? "bg-ys-accent text-ys-on-accent"
                      : "text-ys-muted hover:text-ys-text"
                  }`}
                >
                  New profile
                </button>
              </div>
            )}

            {effectiveMode === "pick" ? (
              <div className="space-y-2">
                <p className="text-xs text-ys-muted">
                  Pick the character you played before — your name, color, and
                  personality come back with it.
                </p>
                {savedProfiles.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => claimSaved(p)}
                    className="w-full flex items-center gap-3 p-3 bg-ys-surface hover:bg-ys-accent/10 rounded-xl border border-ys-border hover:border-ys-accent/40 transition-all text-left"
                  >
                    <span
                      className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-ys-text font-bold"
                      style={{ backgroundColor: p.color }}
                    >
                      {(p.name.trim() || "?")[0].toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-ys-text truncate">
                        {p.name}
                      </div>
                      {(p.archetype || (p.personalityTags?.length ?? 0) > 0) && (
                        <div className="text-xs text-ys-muted truncate">
                          {[
                            p.archetype ? ARCHETYPE_INFO[p.archetype]?.label : null,
                            ...(p.personalityTags ?? []),
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                      )}
                    </div>
                    <DynamicIcon
                      name="ChevronRight"
                      className="w-4 h-4 text-ys-muted shrink-0"
                    />
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="w-11 h-11 shrink-0 rounded-lg cursor-pointer bg-transparent border border-ys-accent/40"
                    title="Your bubble color"
                  />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                    maxLength={24}
                    className="flex-1 min-w-0 px-4 py-3 bg-ys-accent/20 border border-ys-accent/40 rounded-xl text-ys-text focus:outline-none focus:ring-2 focus:ring-ys-accent"
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  {PALETTE.map((c) => (
                    <button
                      key={c}
                      onClick={() => setColor(c)}
                      className={`w-8 h-8 rounded-full transition-all ${
                        color === c
                          ? "ring-2 ring-ys-border ring-offset-2 ring-offset-ys-accent scale-110"
                          : "hover:scale-110"
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ys-muted uppercase tracking-wider mb-1.5">
                    Personality{" "}
                    <span className="text-ys-muted normal-case font-normal">
                      (up to {MAX_PERSONALITY_TAGS})
                    </span>
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {PERSONALITY_TAGS.map((tag) => {
                      const selected = personalityTags.includes(tag);
                      return (
                        <button
                          key={tag}
                          onClick={() => togglePersonality(tag)}
                          className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                            selected
                              ? "bg-ys-accent border-ys-accent text-ys-on-accent"
                              : "bg-ys-surface border-ys-border text-ys-muted hover:border-ys-accent/40"
                          }`}
                        >
                          {tag}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ys-muted uppercase tracking-wider mb-1.5">
                    What kind of player are you?{" "}
                    <span className="text-ys-muted normal-case font-normal">
                      (optional)
                    </span>
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {ARCHETYPE_OPTIONS.map(([key, info]) => {
                      const selected = archetype === key;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setArchetype(selected ? "" : key)}
                          title={info.description}
                          className={`px-3 py-2 rounded-lg text-left text-xs font-medium border transition-all ${
                            selected
                              ? "bg-ys-accent border-ys-accent text-ys-on-accent shadow-md"
                              : "bg-ys-accent/20 border-ys-accent/40 text-ys-muted hover:border-ys-accent/50 hover:text-ys-text"
                          }`}
                        >
                          <span className="block font-semibold">
                            {info.label}
                          </span>
                          <span className="block text-[10px] opacity-70 truncate">
                            {info.description}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ys-muted uppercase tracking-wider mb-1.5">
                    What do you want from this story?
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {WISH_TAGS.map((tag) => {
                      const selected = wishTags.includes(tag);
                      return (
                        <button
                          key={tag}
                          onClick={() => toggleWish(tag)}
                          className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                            selected
                              ? "bg-ys-accent border-transparent text-ys-on-accent shadow-md shadow-ys-accent/40"
                              : "bg-ys-surface border-ys-border text-ys-muted hover:border-ys-accent/40"
                          }`}
                        >
                          {tag}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <button
                  onClick={claimNew}
                  disabled={!name.trim()}
                  className="w-full py-3 rounded-xl bg-ys-accent active:scale-[0.99] text-ys-on-accent font-semibold shadow-lg shadow-ys-accent/40 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <DynamicIcon name="Check" className="w-4 h-4" />
                  Join as {name.trim() || "…"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
