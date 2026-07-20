"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { StaticIcon } from "./StaticIcon";
import { DynamicIcon } from "./DynamicIcon";
import LibraryPickerModal from "./LibraryPickerModal";
import { libraryNoteToStoryLore } from "../misc/localNotesLibraryManager";
import { libraryTableToCustomTable } from "../misc/localTablesLibraryManager";
import type { CustomTable, DiceMode, StoryLore } from "../misc/structs";
import type { FreeformPlayerSetup } from "../misc/localStoryManager";

// Same palette as CouchPlayersEditor so colors stay consistent across the app
const PALETTE = [
  "#22c55e", // green
  "#ec4899", // pink
  "#3b82f6", // blue
  "#f59e0b", // amber
  "#a855f7", // purple
  "#ef4444", // red
  "#14b8a6", // teal
  "#eab308", // yellow
];

const MAX_PLAYERS = 4;
const MAX_PERSONALITY_TAGS = 4;

const PERSONALITY_TAGS = [
  "Brave",
  "Cunning",
  "Curious",
  "Charming",
  "Chaotic",
  "Cautious",
  "Hot-headed",
  "Kind-hearted",
  "Mysterious",
  "Funny",
  "Ruthless",
  "Loyal",
  "Sneaky",
  "Scholarly",
  "Stubborn",
  "Optimistic",
];

const WISH_TAGS = [
  "Epic battles",
  "Deep roleplay",
  "Mystery & secrets",
  "Exploration",
  "Romance",
  "Laughs & chaos",
  "Dark & gritty",
  "Political intrigue",
  "Becoming powerful",
  "Horror & tension",
  "Found family",
  "Moral dilemmas",
];

interface WizardPlayer {
  id: string;
  name: string;
  color: string;
  personality: string[];
  wishTags: string[];
  wishText: string;
}

function makePlayer(index: number): WizardPlayer {
  return {
    id: `player_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: "",
    color: PALETTE[index % PALETTE.length],
    personality: [],
    wishTags: [],
    wishText: "",
  };
}

type WizardStep = "count" | "player" | "ready";

/**
 * The default way to start a story: a guided freeform setup. Asks how many
 * players are at the table, then walks each player through picking a color,
 * name, personality tags, and what they want from the story - and drops
 * everyone straight into a chat with the GM (no adventure wizard needed).
 */
export default function GuidedStoryStart() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<WizardStep>("count");
  const [playerIndex, setPlayerIndex] = useState(0);
  const [players, setPlayers] = useState<WizardPlayer[]>([]);
  const [starting, setStarting] = useState(false);
  const [pickerMode, setPickerMode] = useState<"notes" | "character" | null>(
    null,
  );
  const [attachedLore, setAttachedLore] = useState<StoryLore[]>([]);
  const [attachedTables, setAttachedTables] = useState<CustomTable[]>([]);
  const [diceMode, setDiceMode] = useState<DiceMode>("ai");
  const nameInputRef = useRef<HTMLInputElement>(null);

  const characterAttached = attachedLore.some(
    (l) => l.type === "character_sheet",
  );
  const noteCount = attachedLore.filter(
    (l) => l.type !== "character_sheet",
  ).length;

  useEffect(() => {
    if (open && step === "player") {
      const timer = setTimeout(() => nameInputRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
  }, [open, step, playerIndex]);

  const openWizard = () => {
    setStep("count");
    setPlayerIndex(0);
    setPlayers([]);
    setAttachedLore([]);
    setAttachedTables([]);
    setDiceMode("ai");
    setOpen(true);
  };

  const chooseCount = (count: number) => {
    setPlayers(Array.from({ length: count }, (_, i) => makePlayer(i)));
    setPlayerIndex(0);
    setStep("player");
  };

  const updatePlayer = (index: number, updates: Partial<WizardPlayer>) => {
    setPlayers((prev) =>
      prev.map((p, i) => (i === index ? { ...p, ...updates } : p)),
    );
  };

  const currentPlayer = players[playerIndex];

  const nextFromPlayer = () => {
    if (playerIndex < players.length - 1) {
      setPlayerIndex(playerIndex + 1);
    } else {
      setStep("ready");
    }
  };

  const backFromPlayer = () => {
    if (playerIndex > 0) {
      setPlayerIndex(playerIndex - 1);
    } else {
      setStep("count");
    }
  };

  const beginStory = async () => {
    if (starting) return;
    setStarting(true);
    try {
      const setupPlayers: FreeformPlayerSetup[] = players.map((p, i) => ({
        id: p.id,
        name: p.name.trim() || `Player ${i + 1}`,
        color: p.color,
        personality: p.personality,
        wishTags: p.wishTags,
        wishText: p.wishText.trim(),
      }));
      const { startFreeformStoryLocally } = await import(
        "../misc/localStoryManager"
      );
      const localId = await startFreeformStoryLocally(
        setupPlayers[0]?.name || "Player",
        attachedLore.length ? attachedLore : undefined,
        { players: setupPlayers, diceMode },
        attachedTables.length ? attachedTables : undefined,
      );
      router.push(`/story?storyId=${localId}`);
    } catch (error) {
      console.error("Error starting freeform story:", error);
      setStarting(false);
    }
  };

  // Colors already claimed by other players (so two players can't match)
  const takenColors = new Set(
    players.filter((_, i) => i !== playerIndex).map((p) => p.color),
  );

  return (
    <div className="mb-10">
      {/* Hero card - the default "just play" entry point */}
      <div className="max-w-xl mx-auto rounded-2xl bg-linear-to-br from-purple-900/40 via-blue-950/60 to-blue-900/40 border border-purple-500/30 shadow-xl shadow-purple-950/30 p-6 text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
          <StaticIcon name="Sparkles" className="w-5 h-5 text-purple-300" />
          <h2 className="text-xl font-bold text-white">Start a Story</h2>
        </div>
        <p className="text-sm text-blue-200/60 mb-5 max-w-md mx-auto">
          No setup, no forms - your AI Game Master builds the world with you.
          Play solo or pass the phone around the couch.
        </p>
        <button
          onClick={openWizard}
          disabled={starting}
          className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-linear-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 active:scale-[0.98] text-white text-base font-semibold shadow-lg shadow-purple-950/40 transition-all flex items-center justify-center gap-2 mx-auto disabled:opacity-60"
        >
          <StaticIcon name="Play" className="w-5 h-5" />
          {starting ? "Starting..." : "Play Now"}
        </button>
      </div>

      {/* Setup wizard modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-blue-950 border border-blue-700/50 rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-blue-800/40">
              <div className="flex items-center gap-2 min-w-0">
                {step !== "count" && (
                  <button
                    onClick={() => {
                      if (step === "player") {
                        backFromPlayer();
                      } else {
                        setPlayerIndex(Math.max(0, players.length - 1));
                        setStep(players.length > 0 ? "player" : "count");
                      }
                    }}
                    className="p-1.5 -ml-1.5 text-blue-300 hover:text-white hover:bg-blue-900/50 rounded-lg transition-colors"
                    title="Back"
                  >
                    <DynamicIcon name="ArrowLeft" className="w-4 h-4" />
                  </button>
                )}
                <h3 className="text-base font-bold text-white truncate">
                  {step === "count" && "Who's playing?"}
                  {step === "player" &&
                    (players.length > 1
                      ? `Player ${playerIndex + 1} of ${players.length}`
                      : "Your character")}
                  {step === "ready" && "Ready to play"}
                </h3>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 text-blue-300/60 hover:text-white hover:bg-blue-900/50 rounded-lg transition-colors"
                title="Close"
              >
                <DynamicIcon name="X" className="w-4 h-4" />
              </button>
            </div>

            {/* Progress dots */}
            <div className="flex items-center justify-center gap-1.5 pt-3">
              <span
                className={`h-1.5 rounded-full transition-all ${
                  step === "count" ? "w-5 bg-purple-400" : "w-1.5 bg-blue-700"
                }`}
              />
              {players.length > 0
                ? players.map((p, i) => (
                    <span
                      key={p.id}
                      className={`h-1.5 rounded-full transition-all ${
                        step === "player" && i === playerIndex
                          ? "w-5"
                          : "w-1.5"
                      }`}
                      style={{
                        backgroundColor:
                          step === "player" && i === playerIndex
                            ? p.color
                            : "#1d4ed8",
                      }}
                    />
                  ))
                : [<span key="p" className="w-1.5 h-1.5 rounded-full bg-blue-700" />]}
              <span
                className={`h-1.5 rounded-full transition-all ${
                  step === "ready" ? "w-5 bg-purple-400" : "w-1.5 bg-blue-700"
                }`}
              />
            </div>

            {/* Body */}
            <div className="p-5 overflow-y-auto">
              {step === "count" && (
                <div>
                  <p className="text-sm text-blue-200/60 mb-4 text-center">
                    Everyone plays on this device - the GM gives each player
                    their own character and spotlight.
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    {Array.from({ length: MAX_PLAYERS }, (_, i) => i + 1).map(
                      (count) => (
                        <button
                          key={count}
                          onClick={() => chooseCount(count)}
                          className="group p-4 rounded-xl bg-blue-900/30 hover:bg-purple-900/40 border border-blue-700/40 hover:border-purple-500/50 transition-all text-center"
                        >
                          <div className="flex items-center justify-center gap-1 mb-2">
                            {Array.from({ length: count }, (_, i) => (
                              <span
                                key={i}
                                className="w-7 h-7 rounded-full flex items-center justify-center border-2 border-blue-950 -ml-2 first:ml-0"
                                style={{ backgroundColor: PALETTE[i] }}
                              >
                                <DynamicIcon
                                  name="User"
                                  className="w-3.5 h-3.5 text-white"
                                />
                              </span>
                            ))}
                          </div>
                          <span className="block font-semibold text-white">
                            {count === 1 ? "Solo" : `${count} Players`}
                          </span>
                          <span className="block text-xs text-blue-300/50 mt-0.5">
                            {count === 1
                              ? "Just you and the GM"
                              : "Couch co-op"}
                          </span>
                        </button>
                      ),
                    )}
                  </div>
                </div>
              )}

              {step === "player" && currentPlayer && (
                <div className="space-y-5">
                  {/* Name + color preview */}
                  <div className="flex items-center gap-3">
                    <span
                      className="w-12 h-12 shrink-0 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-lg transition-colors"
                      style={{ backgroundColor: currentPlayer.color }}
                    >
                      {(currentPlayer.name.trim() ||
                        `P${playerIndex + 1}`)[0].toUpperCase()}
                    </span>
                    <input
                      ref={nameInputRef}
                      type="text"
                      value={currentPlayer.name}
                      onChange={(e) =>
                        updatePlayer(playerIndex, { name: e.target.value })
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          nextFromPlayer();
                        }
                      }}
                      placeholder={`Player ${playerIndex + 1} name`}
                      maxLength={24}
                      className="flex-1 min-w-0 px-4 py-3 bg-blue-900/20 border border-blue-700/40 rounded-xl text-white text-base focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>

                  {/* Color picker */}
                  <div>
                    <label className="block text-xs font-semibold text-blue-200/70 uppercase tracking-wider mb-2">
                      Pick a color
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {PALETTE.map((color) => {
                        const taken = takenColors.has(color);
                        const selected = currentPlayer.color === color;
                        return (
                          <button
                            key={color}
                            onClick={() =>
                              !taken &&
                              updatePlayer(playerIndex, { color })
                            }
                            disabled={taken}
                            className={`w-9 h-9 rounded-full transition-all ${
                              selected
                                ? "ring-2 ring-white ring-offset-2 ring-offset-blue-950 scale-110"
                                : taken
                                  ? "opacity-25 cursor-not-allowed"
                                  : "hover:scale-110"
                            }`}
                            style={{ backgroundColor: color }}
                            title={taken ? "Taken by another player" : color}
                          />
                        );
                      })}
                    </div>
                  </div>

                  {/* Personality tags */}
                  <div>
                    <label className="block text-xs font-semibold text-blue-200/70 uppercase tracking-wider mb-2">
                      Personality{" "}
                      <span className="text-blue-300/40 normal-case font-normal">
                        (pick up to {MAX_PERSONALITY_TAGS})
                      </span>
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {PERSONALITY_TAGS.map((tag) => {
                        const selected =
                          currentPlayer.personality.includes(tag);
                        const full =
                          currentPlayer.personality.length >=
                          MAX_PERSONALITY_TAGS;
                        return (
                          <button
                            key={tag}
                            onClick={() =>
                              updatePlayer(playerIndex, {
                                personality: selected
                                  ? currentPlayer.personality.filter(
                                      (t) => t !== tag,
                                    )
                                  : full
                                    ? currentPlayer.personality
                                    : [...currentPlayer.personality, tag],
                              })
                            }
                            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                              selected
                                ? "text-white border-transparent shadow-md"
                                : full
                                  ? "bg-blue-900/20 border-blue-800/30 text-blue-300/30 cursor-not-allowed"
                                  : "bg-blue-900/20 border-blue-700/40 text-blue-200/70 hover:border-purple-500/50 hover:text-white"
                            }`}
                            style={
                              selected
                                ? { backgroundColor: currentPlayer.color }
                                : undefined
                            }
                          >
                            {tag}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Story wishes */}
                  <div>
                    <label className="block text-xs font-semibold text-blue-200/70 uppercase tracking-wider mb-2">
                      What do you want from this story?
                    </label>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {WISH_TAGS.map((tag) => {
                        const selected = currentPlayer.wishTags.includes(tag);
                        return (
                          <button
                            key={tag}
                            onClick={() =>
                              updatePlayer(playerIndex, {
                                wishTags: selected
                                  ? currentPlayer.wishTags.filter(
                                      (t) => t !== tag,
                                    )
                                  : [...currentPlayer.wishTags, tag],
                              })
                            }
                            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                              selected
                                ? "bg-purple-600 border-transparent text-white shadow-md"
                                : "bg-blue-900/20 border-blue-700/40 text-blue-200/70 hover:border-purple-500/50 hover:text-white"
                            }`}
                          >
                            {tag}
                          </button>
                        );
                      })}
                    </div>
                    <input
                      type="text"
                      value={currentPlayer.wishText}
                      onChange={(e) =>
                        updatePlayer(playerIndex, {
                          wishText: e.target.value,
                        })
                      }
                      placeholder="Anything else? (optional)"
                      maxLength={200}
                      className="w-full px-4 py-2.5 bg-blue-900/20 border border-blue-700/40 rounded-xl text-white text-sm placeholder-blue-400/40 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>

                  <button
                    onClick={nextFromPlayer}
                    className="w-full py-3 rounded-xl bg-linear-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold transition-all flex items-center justify-center gap-2"
                  >
                    {playerIndex < players.length - 1 ? (
                      <>
                        Next: Player {playerIndex + 2}
                        <DynamicIcon name="ArrowRight" className="w-4 h-4" />
                      </>
                    ) : (
                      <>
                        Continue
                        <DynamicIcon name="ArrowRight" className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              )}

              {step === "ready" && (
                <div className="space-y-4">
                  {/* Party summary */}
                  <div className="space-y-2">
                    {players.map((p, i) => (
                      <button
                        key={p.id}
                        onClick={() => {
                          setPlayerIndex(i);
                          setStep("player");
                        }}
                        className="w-full flex items-center gap-3 p-3 bg-blue-900/20 hover:bg-blue-900/40 border border-blue-700/30 rounded-xl transition-colors text-left"
                        title="Edit this player"
                      >
                        <span
                          className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-white font-bold shadow"
                          style={{ backgroundColor: p.color }}
                        >
                          {(p.name.trim() || `P${i + 1}`)[0].toUpperCase()}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-white truncate">
                            {p.name.trim() || `Player ${i + 1}`}
                          </span>
                          <span className="block text-xs text-blue-300/50 truncate">
                            {[
                              p.personality.join(", "),
                              p.wishTags.slice(0, 3).join(", "),
                            ]
                              .filter(Boolean)
                              .join(" · ") || "No preferences set"}
                          </span>
                        </span>
                        <DynamicIcon
                          name="Pencil"
                          className="w-3.5 h-3.5 text-blue-300/40 shrink-0"
                        />
                      </button>
                    ))}
                  </div>

                  {/* Dice mode: who rolls? */}
                  <div>
                    <label className="block text-xs font-semibold text-blue-200/70 uppercase tracking-wider mb-2">
                      Who rolls the dice?
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setDiceMode("ai")}
                        className={`p-3 rounded-xl border text-left transition-all ${
                          diceMode === "ai"
                            ? "bg-purple-900/40 border-purple-500/60 ring-1 ring-purple-500/40"
                            : "bg-blue-900/20 border-blue-700/40 hover:border-purple-500/40"
                        }`}
                      >
                        <span className="flex items-center gap-1.5 text-sm font-semibold text-white mb-0.5">
                          <StaticIcon
                            name="Sparkles"
                            className="w-4 h-4 text-purple-300"
                          />
                          GM rolls
                        </span>
                        <span className="block text-xs text-blue-300/50">
                          The AI rolls digitally and narrates the results
                        </span>
                      </button>
                      <button
                        onClick={() => setDiceMode("manual")}
                        className={`p-3 rounded-xl border text-left transition-all ${
                          diceMode === "manual"
                            ? "bg-purple-900/40 border-purple-500/60 ring-1 ring-purple-500/40"
                            : "bg-blue-900/20 border-blue-700/40 hover:border-purple-500/40"
                        }`}
                      >
                        <span className="flex items-center gap-1.5 text-sm font-semibold text-white mb-0.5">
                          <StaticIcon
                            name="Dices"
                            className="w-4 h-4 text-purple-300"
                          />
                          We roll
                        </span>
                        <span className="block text-xs text-blue-300/50">
                          Use real dice - the GM asks for your results
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Optional library attachments */}
                  <div className="flex items-center gap-2">
                    {players.length === 1 && (
                      <button
                        onClick={() => setPickerMode("character")}
                        className={`flex-1 px-3 py-2.5 rounded-xl border text-xs font-medium transition-all flex items-center justify-center gap-1.5 ${
                          characterAttached
                            ? "bg-purple-900/40 border-purple-600/50 text-purple-200"
                            : "bg-blue-900/20 hover:bg-blue-900/40 border-blue-700/40 text-blue-200/70"
                        }`}
                      >
                        <DynamicIcon name="User" className="w-4 h-4" />
                        {characterAttached
                          ? "Character attached"
                          : "Use saved character"}
                      </button>
                    )}
                    <button
                      onClick={() => setPickerMode("notes")}
                      className="flex-1 px-3 py-2.5 rounded-xl border bg-blue-900/20 hover:bg-blue-900/40 border-blue-700/40 text-blue-200/70 text-xs font-medium transition-all flex items-center justify-center gap-1.5"
                    >
                      <DynamicIcon name="Library" className="w-4 h-4" />
                      {noteCount > 0 || attachedTables.length > 0
                        ? [
                            noteCount > 0
                              ? `${noteCount} note${noteCount === 1 ? "" : "s"}`
                              : null,
                            attachedTables.length > 0
                              ? `${attachedTables.length} table${attachedTables.length === 1 ? "" : "s"}`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(", ") + " attached"
                        : "Bring world notes"}
                    </button>
                  </div>

                  <button
                    onClick={beginStory}
                    disabled={starting}
                    className="w-full py-3.5 rounded-xl bg-linear-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 active:scale-[0.99] text-white text-base font-semibold shadow-lg shadow-purple-950/40 transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    <StaticIcon name="Sparkles" className="w-5 h-5" />
                    {starting ? "Starting..." : "Begin Adventure"}
                  </button>
                  <p className="text-xs text-blue-300/40 text-center">
                    The GM will ask what kind of world you want - then build
                    it around {players.length > 1 ? "your party" : "you"}.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <LibraryPickerModal
        isOpen={pickerMode === "character"}
        onClose={() => setPickerMode(null)}
        title="Start as an Existing Character"
        description="Pick a character sheet you've saved to your library."
        confirmLabel="Attach & Continue"
        filterType="character_sheet"
        multiSelect={false}
        onImport={(notes) => {
          const chosen = notes.map(libraryNoteToStoryLore);
          setAttachedLore((prev) => [
            ...prev.filter((l) => l.type !== "character_sheet"),
            ...chosen,
          ]);
          setPickerMode(null);
        }}
      />

      <LibraryPickerModal
        isOpen={pickerMode === "notes"}
        onClose={() => setPickerMode(null)}
        title="Bring World Notes"
        description="Attach saved lore, mechanics, GM notes, or random tables before you start."
        confirmLabel="Attach & Continue"
        includeTables
        onImport={(notes, tables) => {
          const chosen = notes.map(libraryNoteToStoryLore);
          setAttachedLore((prev) => [
            ...prev,
            ...chosen.filter(
              (c) => !prev.some((p) => p.libraryNoteId === c.libraryNoteId),
            ),
          ]);
          const chosenTables = tables.map(libraryTableToCustomTable);
          setAttachedTables((prev) => [
            ...prev,
            ...chosenTables.filter(
              (c) =>
                !prev.some((p) => p.libraryTableId === c.libraryTableId),
            ),
          ]);
          setPickerMode(null);
        }}
      />
    </div>
  );
}
