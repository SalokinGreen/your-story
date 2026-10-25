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
import {
  DEFAULT_OBSERVER_SETTINGS,
  REWRITABLE_FLAG_TYPES,
  countJudgeCalls,
  observerModeOf,
  observerModePatch,
  type ObserverCheckSettings,
  type ObserverMode,
} from "@/app/misc/observer";
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
      "The Observer reviews each completed turn against rules the GM was already given. Every check is on by default: the three that judge the prose rewrite a flagged turn before you see it (the agency check runs on every turn that has your line, so it can), and the other three only flag, after the turn appears. When the GM stops to ask you something, the text written so far is checked and shown first. It never re-rolls a turn. A separate, free consistency check runs alongside it for dead-NPC-narrated-as-present style mistakes and writes to the Debug Logs only.",
    files: "app/misc/observer.ts, app/misc/consistencyCheck.ts",
    aiDriven: true,
  },
];

const OBSERVER_FLAG_INFO: Record<
  ObserverFlagType,
  { label: string; description: string; cost: string; llmBacked: boolean }
> = {
  response_length: {
    label: "Response Length",
    description:
      "A single turn ran far past the Reply Length setting's usual ceiling (word count, free). When it does, a second AI call judges whether the length was earned (a session-zero opening, a big reveal) before flagging it.",
    cost: "One AI call, only on a turn that passes the ceiling.",
    llmBacked: false,
  },
  player_agency: {
    label: "Player Agency",
    description:
      "The GM took a decision away from the player: new meaningful dialogue, a significant choice, or a decided feeling. Narrating your character carrying out what you said is fine. It sees only the current action, not earlier consent, so it can misjudge.",
    cost: "One AI call on every turn.",
    llmBacked: true,
  },
  outcome_narration_mismatch: {
    label: "Outcome/Narration Mismatch",
    description:
      "The narration contradicts the outcome the engine decided for a roll or check this turn (a strong hit, a weak hit, a miss, a true or false comparison). Each result is judged on its own.",
    cost: "One AI call, only on a turn with a roll or check result.",
    llmBacked: true,
  },
  missing_oracle_or_table: {
    label: "Missing Oracle/Table",
    description:
      "An uncertain outcome or random flavor was decided narratively instead of via fate_question/roll_table. Flag only: words cannot fix a tool that did not run.",
    cost: "One AI call on every turn, shared with Missing Scene Increment.",
    llmBacked: true,
  },
  missing_scene_increment: {
    label: "Missing Scene Increment",
    description:
      "The narration moved to a clearly new scene without calling increment_scene. Flag only: words cannot fix a tool that did not run.",
    cost: "One AI call on every turn, shared with Missing Oracle/Table.",
    llmBacked: true,
  },
  tier_escalation_missed: {
    label: "Tier Escalation Missed",
    description:
      "This turn's own complexity or stakes called for a higher reasoning tier than it ran at. Flag only: a rewrite adds no reasoning.",
    cost: "One AI call on every turn below the top tier.",
    llmBacked: true,
  },
};

const OBSERVER_MODE_LABELS: Record<ObserverMode, string> = {
  off: "Off",
  flag: "Flag",
  rewrite: "Rewrite automatically",
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
        description="Reviews each completed turn for rule violations. Applies to every check below that makes an AI call (the response-length word count itself is free, but its follow-up judge call is not), and to a rewrite if you allow one."
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

  // Compared against each type's OWN default: the old test assumed every
  // default was enabled with resets on, so the pristine configuration looked
  // customised once the defaults became flag-only.
  const anyObserverOverride = OBSERVER_FLAG_ORDER.some((type) => {
    const s = observerSettings[type];
    const d = DEFAULT_OBSERVER_SETTINGS[type];
    return (
      s.enabled !== d.enabled ||
      s.triggersReset !== d.triggersReset ||
      s.sensitivity !== d.sensitivity
    );
  });
  const judgeCalls = countJudgeCalls(observerSettings);
  const judgeCallTotal = judgeCalls.always + judgeCalls.sometimes;

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
            Each check is Off, or Flag (a note in the turn&rsquo;s details and a
            heads-up to the GM next turn; the text you read never changes). The
            three that judge the prose can also Rewrite automatically; you can
            undo a revision on its turn. Nothing here ever re-rolls a turn.
          </p>
          <p className="text-xs text-ys-muted">
            While a judge can rewrite, a turn&rsquo;s text appears only after it
            has been checked.
          </p>
          <p className="text-xs text-ys-muted">
            Cost now:{" "}
            {judgeCallTotal === 0
              ? "no judge calls."
              : `up to ${judgeCallTotal} extra AI call${judgeCallTotal === 1 ? "" : "s"} per turn (${judgeCalls.always} on every turn, ${judgeCalls.sometimes} only when there is something to judge)${judgeCalls.rewrites ? ", plus a rewrite call when one fires" : ""}.`}
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
                    <div
                      role="group"
                      aria-label={`${info.label} mode`}
                      className="flex rounded-lg border border-ys-border overflow-hidden"
                    >
                      {(["off", "flag", "rewrite"] as ObserverMode[])
                        .filter(
                          (mode) =>
                            mode !== "rewrite" ||
                            REWRITABLE_FLAG_TYPES.has(type),
                        )
                        .map((mode) => {
                          const active = observerModeOf(settings) === mode;
                          return (
                            <button
                              key={mode}
                              type="button"
                              aria-pressed={active}
                              title={
                                mode === "rewrite"
                                  ? "Rewrite automatically: a turn appears only after it has been checked"
                                  : undefined
                              }
                              onClick={() =>
                                handleFlagPatch(type, observerModePatch(mode))
                              }
                              className={`px-2 py-1 text-xs transition-colors ${
                                active
                                  ? "bg-ys-accent text-ys-on-accent"
                                  : "text-ys-muted hover:text-ys-text"
                              }`}
                            >
                              {OBSERVER_MODE_LABELS[mode]}
                            </button>
                          );
                        })}
                    </div>
                  </div>
                  <p className="text-xs text-ys-muted">
                    {info.description}
                  </p>
                  <p className="text-[10px] text-ys-muted">{info.cost}</p>
                  {settings.enabled && (
                    <>
                      {REWRITABLE_FLAG_TYPES.has(type) &&
                        settings.triggersReset && (
                          <p className="text-[10px] text-ys-warning">
                            Rewrites automatically: changes text you may
                            already have read.
                          </p>
                        )}
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
