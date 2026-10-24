"use client";

import { useState } from "react";
import { DynamicIcon } from "./DynamicIcon";
import ModelSelect from "./ModelSelect";
import TurnCostPanel from "./TurnCostPanel";
import { CustomModel } from "@/app/misc/user_settings";
import {
  AnyModelKey,
  REASONING_EFFORTS,
  ReasoningEffort,
} from "@/app/misc/reasoningTiers";
import { ObserverFlagType } from "@/app/misc/structs";
import { ObserverCheckSettings } from "@/app/misc/observer";
import {
  ModelEffortOverride,
  SIDE_AGENT_DEFAULT_MODEL_KEY,
  SIDE_AGENT_DEFAULT_EFFORT,
  getObserverModelOverride,
  setObserverModelOverride,
  getMemoryKeeperModelOverride,
  setMemoryKeeperModelOverride,
  getReflectionModelOverride,
  setReflectionModelOverride,
  getDirectorAssistantModelOverride,
  setDirectorAssistantModelOverride,
  getStoryProgressObserverModelOverride,
  setStoryProgressObserverModelOverride,
  getStoryProgressCheckInterval,
  setStoryProgressCheckInterval,
  getObserverSettings,
  setObserverCheckSetting,
  resetObserverSettings,
} from "@/app/misc/layerSettings";

// What turning a pin on starts from: the model the stage is running on already.
const DEFAULT_OVERRIDE_MODEL: AnyModelKey = SIDE_AGENT_DEFAULT_MODEL_KEY;

interface LayerInfo {
  title: string;
  badge: string;
  summary: string;
  files: string;
  aiDriven: boolean;
}

const LAYERS: LayerInfo[] = [
  {
    title: "State",
    badge: "Layer 1",
    summary:
      "The single source of truth for everything happening in the story - the character sheet, NPCs, threads, goals, combat, inventory-as-prose. Only tool calls can change it; the model never edits it directly.",
    files: "app/misc/structs.ts (StoryData)",
    aiDriven: false,
  },
  {
    title: "Oracle / Entropy",
    badge: "Layer 2",
    summary:
      "Where randomness enters the story: dice formulas the GM proposes and the engine resolves, and a Mythic-style \"chaos factor\" that weights how often fate_question/roll_table answers skew toward yes or no.",
    files: "app/misc/diceFormula.ts, app/misc/mythicChaos.ts",
    aiDriven: false,
  },
  {
    title: "Director / Pacing",
    badge: "Layer 3",
    summary:
      "A deterministic policy that tracks narrative tension and picks from a bounded menu of pacing moves (escalate, complicate, breathe, ...). The model narrates whichever move gets picked - it never picks the move itself. The Director Assistant is a separate AI pass that only judges which threads/NPCs got the spotlight each scene, feeding that as a signal into the same deterministic policy. The Story Progress Observer is a third AI pass, checking in every few turns with a plain-language read on whether the story's overall pacing is on track, dragging, or rushing - neither of the two AI passes ever chooses a move themselves.",
    files:
      "app/misc/structs.ts (AGMTState), selectDirectorMove(), app/misc/directorAssistant.ts, app/misc/storyProgressObserver.ts",
    aiDriven: true,
  },
  {
    title: "Memory",
    badge: "Layer 4",
    summary:
      "Two AI passes keep the story's long-term memory useful: the Memory Keeper decides what from each turn is worth persisting, and Reflection periodically synthesizes higher-level insights from clusters of stored memories (e.g. \"the player consistently prefers negotiation over combat\").",
    files: "app/misc/memoryAgent.ts, app/misc/reflection.ts",
    aiDriven: true,
  },
  {
    title: "Adjudication",
    badge: "Layer 5",
    summary:
      "The Observer reviews each completed turn against rules the GM was already given (player agency, roll-outcome consistency, tool usage) and can force a reset-and-retry on a serious violation. A separate, non-AI consistency check runs alongside it for dead-NPC-narrated-as-present style mistakes.",
    files: "app/misc/observer.ts, app/misc/consistencyCheck.ts",
    aiDriven: true,
  },
];

const OBSERVER_FLAG_INFO: Record<
  ObserverFlagType,
  { label: string; description: string; llmBacked: boolean }
> = {
  response_length: {
    label: "Response Length",
    description:
      "A single turn ran far past the Reply Length setting's usual ceiling (word count, deterministic). If it does, a second AI pass judges whether the length was earned (e.g. a session-zero opening, a big reveal) before flagging it.",
    llmBacked: false,
  },
  player_agency: {
    label: "Player Agency",
    description:
      "The GM took a decision away from the player: new meaningful dialogue, a significant choice, or a decided feeling. Narrating your character carrying out what you said is fine.",
    llmBacked: true,
  },
  outcome_narration_mismatch: {
    label: "Outcome/Narration Mismatch",
    description:
      "The narration contradicts the mechanical result (success/failure) of the last roll made this turn.",
    llmBacked: true,
  },
  missing_oracle_or_table: {
    label: "Missing Oracle/Table",
    description:
      "An uncertain outcome or random flavor was decided narratively instead of via fate_question/roll_table.",
    llmBacked: true,
  },
  missing_scene_increment: {
    label: "Missing Scene Increment",
    description:
      "The narration moved to a clearly new scene without calling increment_scene.",
    llmBacked: true,
  },
  tier_escalation_missed: {
    label: "Tier Escalation Missed",
    description:
      "This turn's own complexity/stakes called for a higher reasoning tier than it ran at, and the GM never self-escalated. Unlike the other resettable flags, this can't be fixed by rewriting the narration - a reset forces the retry onto a higher tier.",
    llmBacked: true,
  },
};

const OBSERVER_FLAG_ORDER: ObserverFlagType[] = [
  "player_agency",
  "outcome_narration_mismatch",
  "missing_oracle_or_table",
  "missing_scene_increment",
  "tier_escalation_missed",
  "response_length",
];

function sensitivityLabel(sensitivity: number): string {
  if (sensitivity <= 2) return "Very lenient";
  if (sensitivity <= 4) return "Lenient";
  if (sensitivity <= 6) return "Balanced";
  if (sensitivity <= 8) return "Strict";
  return "Very strict";
}

/** Toggle switch, matching the existing peer-checked pattern used throughout AIConfigTab.tsx. */
function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="relative inline-flex items-center cursor-pointer shrink-0">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only peer"
      />
      <div className="w-11 h-6 bg-ys-border peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-ys-accent rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-ys-border after:content-[''] after:absolute after:top-0.5 after:start-0.5 after:bg-ys-bg after:border-ys-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-ys-accent" />
    </label>
  );
}

/**
 * A model + reasoning-effort override for one AI side-call stage (Observer,
 * Memory Keeper, Reflection). Off by default - the stage runs on
 * SIDE_AGENT_DEFAULT_MODEL_KEY (decision 51); `offNote` replaces that line
 * for a stage whose unpinned default is not just that (the Observer, whose
 * rewrite follows the Default model, decisions 52 and 118).
 */
function StageOverrideCard({
  icon,
  title,
  description,
  override,
  onChange,
  customModels,
  offNote,
}: {
  icon: string;
  title: string;
  description: string;
  override: ModelEffortOverride | null;
  onChange: (override: ModelEffortOverride | null) => void;
  customModels: CustomModel[];
  offNote?: string;
}) {
  const pinned = override !== null;
  const effective: ModelEffortOverride = override ?? {
    modelKey: DEFAULT_OVERRIDE_MODEL,
    reasoningEffort: SIDE_AGENT_DEFAULT_EFFORT,
  };

  return (
    <div className="p-4 ys-card rounded-lg space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <DynamicIcon name={icon} className="w-4 h-4 text-ys-accent shrink-0" />
          <h4 className="text-sm font-medium text-ys-text truncate">{title}</h4>
        </div>
        <Toggle
          checked={pinned}
          onChange={(checked) => onChange(checked ? effective : null)}
        />
      </div>
      <p className="text-xs text-ys-muted">{description}</p>
      {pinned ? (
        <div className="flex items-center gap-2">
          <ModelSelect
            value={effective.modelKey}
            onChange={(modelKey) => onChange({ ...effective, modelKey })}
            customModels={customModels}
            className="flex-1 min-w-0 text-xs ys-input px-2 py-1.5"
          />
          <select
            value={effective.reasoningEffort}
            onChange={(e) =>
              onChange({
                ...effective,
                reasoningEffort: e.target.value as ReasoningEffort,
              })
            }
            className="w-24 shrink-0 text-xs ys-input px-2 py-1.5 capitalize"
          >
            {REASONING_EFFORTS.map((effort) => (
              <option key={effort} value={effort}>
                {effort}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <p className="text-xs text-ys-muted italic">
          {offNote ??
            `Off - runs on ${SIDE_AGENT_DEFAULT_MODEL_KEY}, effort ${SIDE_AGENT_DEFAULT_EFFORT}.`}
        </p>
      )}
    </div>
  );
}

/**
 * The five side-agent pickers (Memory Keeper, Reflection, Director Assistant,
 * Story Progress Observer with its check-in interval, Observer). They live
 * under AI > Advanced settings (decision 121); the Architecture tab only points
 * there. `customModels` is the live list, so a model added in Settings shows
 * here without a reopen.
 */
export function SideAgentPickers({
  customModels,
}: {
  customModels: CustomModel[];
}) {
  const [observerModelOverride, setObserverModelOverrideState] = useState<
    ModelEffortOverride | null
  >(() => getObserverModelOverride());
  const [memoryKeeperModelOverride, setMemoryKeeperModelOverrideState] =
    useState<ModelEffortOverride | null>(() => getMemoryKeeperModelOverride());
  const [reflectionModelOverride, setReflectionModelOverrideState] = useState<
    ModelEffortOverride | null
  >(() => getReflectionModelOverride());
  const [directorAssistantModelOverride, setDirectorAssistantModelOverrideState] =
    useState<ModelEffortOverride | null>(() => getDirectorAssistantModelOverride());
  const [
    storyProgressObserverModelOverride,
    setStoryProgressObserverModelOverrideState,
  ] = useState<ModelEffortOverride | null>(() =>
    getStoryProgressObserverModelOverride(),
  );
  const [storyProgressCheckInterval, setStoryProgressCheckIntervalState] =
    useState<number>(() => getStoryProgressCheckInterval());

  const handleObserverModelChange = (override: ModelEffortOverride | null) => {
    setObserverModelOverride(override);
    setObserverModelOverrideState(override);
  };
  const handleMemoryKeeperModelChange = (
    override: ModelEffortOverride | null,
  ) => {
    setMemoryKeeperModelOverride(override);
    setMemoryKeeperModelOverrideState(override);
  };
  const handleReflectionModelChange = (override: ModelEffortOverride | null) => {
    setReflectionModelOverride(override);
    setReflectionModelOverrideState(override);
  };
  const handleDirectorAssistantModelChange = (
    override: ModelEffortOverride | null,
  ) => {
    setDirectorAssistantModelOverride(override);
    setDirectorAssistantModelOverrideState(override);
  };
  const handleStoryProgressObserverModelChange = (
    override: ModelEffortOverride | null,
  ) => {
    setStoryProgressObserverModelOverride(override);
    setStoryProgressObserverModelOverrideState(override);
  };
  const handleStoryProgressCheckIntervalChange = (turns: number) => {
    setStoryProgressCheckInterval(turns);
    setStoryProgressCheckIntervalState(getStoryProgressCheckInterval());
  };

  return (
    <div className="space-y-6">
      {/* Memory Keeper */}
      <StageOverrideCard
        icon="Database"
        title="Memory Keeper"
        description="Runs once per turn, after the turn is final, deciding what's worth persisting to long-term memory (promises, deadlines, codes, plot clues)."
        override={memoryKeeperModelOverride}
        onChange={handleMemoryKeeperModelChange}
        customModels={customModels}
      />

      {/* Reflection */}
      <StageOverrideCard
        icon="Sparkles"
        title="Reflection"
        description="Runs periodically (once enough memory has accumulated) to synthesize higher-level insights from clusters of recent memories."
        override={reflectionModelOverride}
        onChange={handleReflectionModelChange}
        customModels={customModels}
      />

      {/* Director Assistant */}
      <StageOverrideCard
        icon="Focus"
        title="Director Assistant"
        description="Runs once per scene, after the turn is final, judging which active threads/NPCs got the spotlight. Only feeds a neglect signal into the existing deterministic pacing policy - it never picks a move itself."
        override={directorAssistantModelOverride}
        onChange={handleDirectorAssistantModelChange}
        customModels={customModels}
      />

      {/* Story Progress Observer */}
      <div className="space-y-3">
        <StageOverrideCard
          icon="Compass"
          title="Story Progress Observer"
          description="Checks in every few turns (not every turn) with a plain-language read on the story's overall pacing - on track, dragging, or rushing - and hands the GM one or two sentences of direct feedback. Never shown to the player."
          override={storyProgressObserverModelOverride}
          onChange={handleStoryProgressObserverModelChange}
          customModels={customModels}
        />
        <div className="p-4 ys-card rounded-lg space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-ys-text">Check-in interval</span>
            <span className="text-ys-accent font-medium text-xs">
              Every {storyProgressCheckInterval} turns
            </span>
          </div>
          <p className="text-xs text-ys-muted">
            How many accepted turns pass between check-ins.
          </p>
          <input
            type="range"
            min="2"
            max="50"
            step="1"
            value={storyProgressCheckInterval}
            onChange={(e) =>
              handleStoryProgressCheckIntervalChange(parseInt(e.target.value, 10))
            }
            className="w-full h-2 bg-ys-surface-2 rounded-lg appearance-none cursor-pointer accent-ys-accent"
          />
        </div>
      </div>

      {/* Observer */}
      <StageOverrideCard
        icon="ShieldCheck"
        title="Observer"
        description="Reviews each completed turn for rule violations. Applies to all of the LLM-backed checks below; the response-length check is free and doesn't use a model."
        override={observerModelOverride}
        onChange={handleObserverModelChange}
        customModels={customModels}
        offNote={`Off - checks run on ${SIDE_AGENT_DEFAULT_MODEL_KEY}, effort ${SIDE_AGENT_DEFAULT_EFFORT}; rewrites use the Default model and its effort.`}
      />
    </div>
  );
}

export default function ArchitectureSettingsTab() {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const toggleExpanded = (index: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const [observerSettings, setObserverSettingsState] = useState(() =>
    getObserverSettings(),
  );

  const handleFlagPatch = (
    type: ObserverFlagType,
    patch: Partial<ObserverCheckSettings>,
  ) => {
    setObserverCheckSetting(type, patch);
    setObserverSettingsState(getObserverSettings());
  };

  const handleResetObserverSettings = () => {
    resetObserverSettings();
    setObserverSettingsState(getObserverSettings());
  };

  const anyObserverOverride = OBSERVER_FLAG_ORDER.some((type) => {
    const s = observerSettings[type];
    return s.enabled !== true || s.triggersReset !== true || s.sensitivity !== 5;
  });

  return (
    <div className="space-y-6">
      {/* Every model override on this tab is another AI call per turn, so
          the running cost belongs at the top of it, not buried in Settings
          > AI Config. */}
      <TurnCostPanel defaultExpanded />

      {/* Architecture Overview */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-ys-text flex items-center gap-2">
          <DynamicIcon name="Layers" className="w-4 h-4" />
          The Five-Layer Architecture
        </h4>
        <p className="text-xs text-ys-muted">
          The GM is an AI that narrates and proposes tool calls; a
          deterministic engine executes them. Everything below is that
          engine&rsquo;s five layers - tap one to read what it does.
        </p>
        <div className="space-y-1.5">
          {LAYERS.map((layer, index) => {
            const isOpen = expanded.has(index);
            return (
              <div
                key={layer.title}
                className="bg-ys-surface-2 rounded-lg border border-ys-border overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => toggleExpanded(index)}
                  className="w-full flex items-center justify-between gap-2 p-3 text-left"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-ys-accent bg-ys-accent/15 px-1.5 py-0.5 rounded">
                      {layer.badge}
                    </span>
                    <span className="text-sm text-ys-text truncate">
                      {layer.title}
                    </span>
                    {layer.aiDriven && (
                      <span
                        title="Uses its own AI call(s), configurable under AI > Advanced settings"
                        className="shrink-0 text-[10px] text-ys-muted flex items-center gap-1"
                      >
                        <DynamicIcon name="Sparkles" className="w-3 h-3" />
                        AI
                      </span>
                    )}
                  </div>
                  <DynamicIcon
                    name={isOpen ? "ChevronUp" : "ChevronDown"}
                    className="w-4 h-4 text-ys-muted shrink-0"
                  />
                </button>
                {isOpen && (
                  <div className="px-3 pb-3 space-y-1.5">
                    <p className="text-xs text-ys-muted">{layer.summary}</p>
                    <p className="text-[10px] text-ys-muted font-mono">
                      {layer.files}
                    </p>
                    {layer.aiDriven && (
                      <p className="text-xs text-ys-muted">
                        Its model is set in AI &rarr; Advanced settings.
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Observer Checks (the Observer's model is picked under AI > Advanced settings) */}
      <div className="space-y-3">
        <div className="p-4 ys-card rounded-lg space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-ys-text flex items-center gap-2">
              <DynamicIcon name="ListChecks" className="w-4 h-4" />
              Observer Checks
            </h4>
            {anyObserverOverride && (
              <button
                onClick={handleResetObserverSettings}
                className="text-xs text-ys-accent hover:underline"
              >
                Reset all to defaults
              </button>
            )}
          </div>
          <p className="text-xs text-ys-muted">
            Per-check controls: turn a check off entirely, decide whether a
            &ldquo;major&rdquo; instance of it is allowed to reset the turn
            and force a retry, and how readily it flags something in the
            first place.
          </p>
          <div className="space-y-2">
            {OBSERVER_FLAG_ORDER.map((type) => {
              const info = OBSERVER_FLAG_INFO[type];
              const settings = observerSettings[type];
              return (
                <div
                  key={type}
                  className="p-3 bg-ys-surface-2 rounded-lg border border-ys-border space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-ys-text">{info.label}</span>
                    <Toggle
                      checked={settings.enabled}
                      onChange={(enabled) =>
                        handleFlagPatch(type, { enabled })
                      }
                    />
                  </div>
                  <p className="text-xs text-ys-muted">
                    {info.description}
                  </p>
                  {settings.enabled && (
                    <>
                      <label className="flex items-center justify-between gap-2 text-xs text-ys-muted">
                        <span>Allow this check to reset the turn</span>
                        <input
                          type="checkbox"
                          checked={settings.triggersReset}
                          onChange={(e) =>
                            handleFlagPatch(type, {
                              triggersReset: e.target.checked,
                            })
                          }
                          className="accent-ys-accent w-4 h-4"
                        />
                      </label>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-ys-muted">
                            Sensitivity
                          </span>
                          <span className="text-ys-accent font-medium">
                            {settings.sensitivity} -{" "}
                            {sensitivityLabel(settings.sensitivity)}
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="10"
                          step="1"
                          value={settings.sensitivity}
                          onChange={(e) =>
                            handleFlagPatch(type, {
                              sensitivity: parseInt(e.target.value, 10),
                            })
                          }
                          className="w-full h-2 bg-ys-surface-2 rounded-lg appearance-none cursor-pointer accent-ys-accent"
                        />
                        {!info.llmBacked && (
                          <p className="text-[10px] text-ys-muted">
                            Scales the overage multiplier - higher fires on a
                            smaller overage.
                          </p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
