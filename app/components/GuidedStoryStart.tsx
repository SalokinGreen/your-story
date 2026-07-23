"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { StaticIcon } from "./StaticIcon";
import { DynamicIcon } from "./DynamicIcon";
import FullScreenView from "./FullScreenView";
import LibraryPickerModal from "./LibraryPickerModal";
import JoinGameModal from "./JoinGameModal";
import { libraryNoteToStoryLore } from "../misc/localNotesLibraryManager";
import { libraryTableToCustomTable } from "../misc/localTablesLibraryManager";
import type { CustomTable, DiceMode, PlayerArchetype, StoryLore } from "../misc/structs";
import type { FreeformPlayerSetup } from "../misc/localStoryManager";
import type { MPBackend } from "../misc/multiplayer/types";
import { ARCHETYPE_INFO } from "../misc/gmAdvice";

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

// Exported so the online-join profile creator (ProfilePickerModal) offers the
// same personality/wish tags as the couch wizard.
export const PERSONALITY_TAGS = [
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

export const WISH_TAGS = [
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
  archetype?: PlayerArchetype;
}

function makePlayer(index: number): WizardPlayer {
  return {
    id: `player_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: "",
    color: PALETTE[index % PALETTE.length],
    personality: [],
    wishTags: [],
    wishText: "",
    archetype: undefined,
  };
}

const ARCHETYPE_OPTIONS = Object.entries(ARCHETYPE_INFO) as [
  PlayerArchetype,
  (typeof ARCHETYPE_INFO)[PlayerArchetype],
][];

type WizardStep = "count" | "player" | "ready";

/**
 * The default way to start a story: a guided freeform setup. Asks how many
 * players are at the table, then walks each player through picking a color,
 * name, personality tags, and what they want from the story - and drops
 * everyone straight into a chat with the GM (no adventure wizard needed).
 */
export default function GuidedStoryStart() {
  const router = useRouter();
  // Shareable invite link (?join=CODE[&provider=BACKEND]). Read from the URL in
  // an effect rather than via useSearchParams so the statically-prerendered
  // home page doesn't need a Suspense boundary / client bailout.
  const [inviteCode, setInviteCode] = useState<string | undefined>(undefined);
  const [inviteBackend, setInviteBackend] = useState<MPBackend | undefined>(
    undefined,
  );
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
  const [showJoinGameModal, setShowJoinGameModal] = useState(false);
  // "Play Online" path: you set up only your own profile and host a room others
  // join over the internet (they build their own profiles on join), rather than
  // seating a fixed couch party up front.
  const [hostOnlineMode, setHostOnlineMode] = useState(false);
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

  // Parse a shareable invite link once on mount and, if present, open the join
  // modal prefilled so a fresh visitor lands straight on the join screen.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("join");
    if (!code) return;
    const VALID_BACKENDS: MPBackend[] = ["torrent", "nostr", "mqtt", "peerjs"];
    const raw = params.get("provider") ?? params.get("backend") ?? undefined;
    setInviteCode(code);
    setInviteBackend(
      VALID_BACKENDS.includes(raw as MPBackend) ? (raw as MPBackend) : undefined,
    );
    setShowJoinGameModal(true);
  }, []);

  const openWizard = () => {
    setStep("count");
    setPlayerIndex(0);
    setPlayers([]);
    setAttachedLore([]);
    setAttachedTables([]);
    setDiceMode("ai");
    setHostOnlineMode(false);
    setOpen(true);
  };

  const chooseCount = (count: number) => {
    setHostOnlineMode(false);
    setPlayers(Array.from({ length: count }, (_, i) => makePlayer(i)));
    setPlayerIndex(0);
    setStep("player");
  };

  // Play Online: just you as host - set up your own profile, then open a room
  // that others join over the internet (each builds their own profile on join).
  const choosePlayOnline = () => {
    setHostOnlineMode(true);
    setPlayers([makePlayer(0)]);
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

  const beginStory = async (hostOnline: boolean = false) => {
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
        archetype: p.archetype,
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
      if (hostOnline) {
        const params = new URLSearchParams({
          storyId: localId,
          hostName: setupPlayers[0]?.name || "Player",
          hostColor: setupPlayers[0]?.color || PALETTE[0],
          hostBackend: "torrent",
        });
        router.push(`/story?${params.toString()}`);
      } else {
        router.push(`/story?storyId=${localId}`);
      }
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
        <button
          onClick={() => setShowJoinGameModal(true)}
          className="mt-3 flex items-center justify-center gap-1.5 mx-auto text-sm text-blue-300/70 hover:text-white transition-colors"
        >
          <DynamicIcon name="Wifi" className="w-3.5 h-3.5" />
          Have a room code? Join a Game
        </button>
      </div>

      <JoinGameModal
        isOpen={showJoinGameModal}
        onClose={() => setShowJoinGameModal(false)}
        initialCode={inviteCode}
        initialBackend={inviteBackend}
      />

      {/* Setup wizard modal */}
      {open && (
        <FullScreenView
          title={
            step === "count"
              ? "Who's playing?"
              : step === "player"
                ? players.length > 1
                  ? `Player ${playerIndex + 1} of ${players.length}`
                  : "Your character"
                : "Ready to play"
          }
          onClose={() => setOpen(false)}
          onBack={
            step !== "count"
              ? () => {
                  if (step === "player") {
                    backFromPlayer();
                  } else {
                    setPlayerIndex(Math.max(0, players.length - 1));
                    setStep(players.length > 0 ? "player" : "count");
                  }
                }
              : undefined
          }
          bodyClassName="p-0"
        >
          <div className="max-w-lg mx-auto">
            {/* Progress dots */}
            <div className="flex items-center justify-center gap-1.5 pt-3">
              <span
                className={`h-1.5 rounded-full transition-all ${
                  step === "count" ? "w-5 bg-purple-400" : "w-1.5 bg-white/15"
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
                            : "rgba(255,255,255,0.15)",
                      }}
                    />
                  ))
                : [<span key="p" className="w-1.5 h-1.5 rounded-full bg-white/15" />]}
              <span
                className={`h-1.5 rounded-full transition-all ${
                  step === "ready" ? "w-5 bg-purple-400" : "w-1.5 bg-white/15"
                }`}
              />
            </div>

            {/* Body */}
            <div className="p-5">
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
                          className="group p-4 rounded-xl bg-white/5 hover:bg-purple-500/10 border border-white/10 hover:border-purple-400/40 transition-all text-center"
                        >
                          <div className="flex items-center justify-center gap-1 mb-2">
                            {Array.from({ length: count }, (_, i) => (
                              <span
                                key={i}
                                className="w-7 h-7 rounded-full flex items-center justify-center border-2 border-[#0d1829] -ml-2 first:ml-0"
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

                  {/* Play Online: host a room others join over the internet -
                      you only set up your own profile; friends build theirs
                      when they join. */}
                  <div className="mt-3 pt-3 border-t border-white/10">
                    <button
                      onClick={choosePlayOnline}
                      className="w-full p-4 rounded-xl bg-linear-to-r from-purple-600/20 to-indigo-600/20 hover:from-purple-600/30 hover:to-indigo-600/30 border border-purple-400/30 hover:border-purple-400/50 transition-all flex items-center justify-center gap-2.5 text-center"
                    >
                      <DynamicIcon name="Wifi" className="w-5 h-5 text-purple-300" />
                      <span className="font-semibold text-white">Play Online</span>
                      <span className="text-xs text-blue-300/60">
                        Friends join over the internet
                      </span>
                    </button>
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
                      className="flex-1 min-w-0 px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-base focus:outline-none focus:ring-2 focus:ring-purple-500"
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
                                ? "ring-2 ring-white ring-offset-2 ring-offset-[#0d1829] scale-110"
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
                                  ? "bg-white/[0.03] border-white/10 text-blue-300/30 cursor-not-allowed"
                                  : "bg-white/5 border-white/10 text-blue-200/70 hover:border-purple-400/40 hover:text-white"
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

                  {/* Player archetype (Robin Laws' player-type taxonomy) */}
                  <div>
                    <label className="block text-xs font-semibold text-blue-200/70 uppercase tracking-wider mb-2">
                      What kind of player are you?{" "}
                      <span className="text-blue-300/40 normal-case font-normal">
                        (optional)
                      </span>
                    </label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {ARCHETYPE_OPTIONS.map(([key, info]) => {
                        const selected = currentPlayer.archetype === key;
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() =>
                              updatePlayer(playerIndex, {
                                archetype: selected ? undefined : key,
                              })
                            }
                            title={info.description}
                            className={`px-3 py-2 rounded-lg text-left text-xs font-medium border transition-all ${
                              selected
                                ? "text-white border-transparent shadow-md"
                                : "bg-blue-900/20 border-blue-700/40 text-blue-200/70 hover:border-purple-500/50 hover:text-white"
                            }`}
                            style={
                              selected
                                ? { backgroundColor: currentPlayer.color }
                                : undefined
                            }
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
                                ? "bg-linear-to-r from-purple-600 to-blue-600 border-transparent text-white shadow-md shadow-purple-950/40"
                                : "bg-white/5 border-white/10 text-blue-200/70 hover:border-purple-400/40 hover:text-white"
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
                      className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm placeholder-blue-400/40 focus:outline-none focus:ring-2 focus:ring-purple-500"
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
                        className="w-full flex items-center gap-3 p-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-colors text-left"
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
                              p.archetype ? ARCHETYPE_INFO[p.archetype].label : "",
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
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        onClick={() => setDiceMode("ai")}
                        className={`p-3 rounded-xl border text-left transition-all ${
                          diceMode === "ai"
                            ? "bg-purple-500/15 border-purple-400/40 ring-1 ring-purple-400/30"
                            : "bg-white/5 border-white/10 hover:border-purple-400/40"
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
                        onClick={() => setDiceMode("physical")}
                        className={`p-3 rounded-xl border text-left transition-all ${
                          diceMode === "physical"
                            ? "bg-purple-500/15 border-purple-400/40 ring-1 ring-purple-400/30"
                            : "bg-white/5 border-white/10 hover:border-purple-400/40"
                        }`}
                      >
                        <span className="flex items-center gap-1.5 text-sm font-semibold text-white mb-0.5">
                          <StaticIcon
                            name="Move3d"
                            className="w-4 h-4 text-purple-300"
                          />
                          Throw 3D dice
                        </span>
                        <span className="block text-xs text-blue-300/50">
                          Drag to throw real physics dice on-screen
                        </span>
                      </button>
                      <button
                        onClick={() => setDiceMode("manual")}
                        className={`p-3 rounded-xl border text-left transition-all ${
                          diceMode === "manual"
                            ? "bg-purple-500/15 border-purple-400/40 ring-1 ring-purple-400/30"
                            : "bg-white/5 border-white/10 hover:border-purple-400/40"
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
                            ? "bg-purple-500/15 border-purple-400/40 text-purple-200"
                            : "bg-white/5 hover:bg-white/10 border-white/10 text-blue-200/70"
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
                      className="flex-1 px-3 py-2.5 rounded-xl border bg-white/5 hover:bg-white/10 border-white/10 text-blue-200/70 text-xs font-medium transition-all flex items-center justify-center gap-1.5"
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

                  {hostOnlineMode ? (
                    <button
                      onClick={() => beginStory(true)}
                      disabled={starting}
                      className="w-full py-3.5 rounded-xl bg-linear-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 active:scale-[0.99] text-white text-base font-semibold shadow-lg shadow-purple-950/40 transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                    >
                      <DynamicIcon name="Wifi" className="w-5 h-5" />
                      {starting ? "Starting..." : "Host Online Game"}
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => beginStory()}
                        disabled={starting}
                        className="w-full py-3.5 rounded-xl bg-linear-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 active:scale-[0.99] text-white text-base font-semibold shadow-lg shadow-purple-950/40 transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                      >
                        <StaticIcon name="Sparkles" className="w-5 h-5" />
                        {starting ? "Starting..." : "Begin Adventure"}
                      </button>
                      <button
                        onClick={() => beginStory(true)}
                        disabled={starting}
                        className="w-full py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 active:scale-[0.99] text-blue-200 text-sm font-semibold transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                        title="Start this story and immediately open it as an online room others can join"
                      >
                        <DynamicIcon name="Wifi" className="w-4 h-4" />
                        Host Online Game
                      </button>
                    </>
                  )}
                  <p className="text-xs text-blue-300/40 text-center">
                    {hostOnlineMode
                      ? "You'll get a room code to share. Friends pick their own characters when they join."
                      : "The GM will ask what kind of world you want - then build it around " +
                        (players.length > 1 ? "your party." : "you.")}
                  </p>
                </div>
              )}
            </div>
          </div>
        </FullScreenView>
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
