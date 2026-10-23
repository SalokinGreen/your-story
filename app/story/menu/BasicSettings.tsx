"use client";

import {
  StoryData,
  StoryLore,
  AGMTState,
  CustomTable,
  MemoryEntry,
  getMemoryContent,
  NPC,
  NPCStatus,
  NPCAttitude,
  Adventure,
  DiceMode,
  PlayerArchetype,
} from "../../misc/structs";
import { DynamicIcon } from "../../components/DynamicIcon";
import { ARCHETYPE_INFO } from "../../misc/gmAdvice";

const ARCHETYPE_OPTIONS = Object.entries(ARCHETYPE_INFO) as [
  PlayerArchetype,
  (typeof ARCHETYPE_INFO)[PlayerArchetype],
][];

export interface BasicSettingsForm {
  story_name: string;
  player_name: string;
  player_summary: string;
  premise: string;
  max_chapters: number;
  displayName: string;
  displayAvatar: string;
  diceMode: DiceMode;
  playerArchetype?: PlayerArchetype;
  autoGenerateChoices?: boolean;
}


export default function BasicSettings({
  form,
  onChange,
}: {
  form: BasicSettingsForm;
  onChange: (form: BasicSettingsForm) => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <label className="block text-sm font-semibold text-ys-text mb-2">
          Story Name
        </label>
        <input
          type="text"
          value={form.story_name}
          onChange={(e) => onChange({ ...form, story_name: e.target.value })}
          className="w-full px-4 py-3 bg-ys-surface border border-ys-border rounded-xl text-ys-text focus:outline-none focus:ring-2 focus:ring-ys-accent/40 focus:border-ys-accent/40 transition-colors"
        />
      </div>

      <div>
        <label className="block text-sm font-semibold text-ys-text mb-2">
          Player/Character Name
        </label>
        <input
          type="text"
          value={form.player_name}
          onChange={(e) => onChange({ ...form, player_name: e.target.value })}
          className="w-full px-4 py-3 bg-ys-surface border border-ys-border rounded-xl text-ys-text focus:outline-none focus:ring-2 focus:ring-ys-accent/40 focus:border-ys-accent/40 transition-colors"
        />
      </div>
      <div>
        <label className="block text-sm font-semibold text-ys-text mb-2">
          Character Description
        </label>
        <textarea
          value={form.player_summary}
          onChange={(e) =>
            onChange({ ...form, player_summary: e.target.value })
          }
          className="w-full h-32 px-4 py-3 bg-ys-surface border border-ys-border rounded-xl text-ys-text focus:outline-none focus:ring-2 focus:ring-ys-accent/40 focus:border-ys-accent/40 resize-none transition-colors"
        />
      </div>
      <div>
        <label className="block text-sm font-semibold text-ys-text mb-2">
          Story Premise
        </label>
        <textarea
          value={form.premise}
          onChange={(e) => onChange({ ...form, premise: e.target.value })}
          className="w-full h-24 px-4 py-3 bg-ys-surface border border-ys-border rounded-xl text-ys-text focus:outline-none focus:ring-2 focus:ring-ys-accent/40 focus:border-ys-accent/40 resize-none transition-colors"
        />
      </div>
      <div>
        <label className="block text-sm font-semibold text-ys-text mb-2">
          Max Chapters
        </label>
        <input
          type="number"
          value={form.max_chapters}
          onChange={(e) =>
            onChange({ ...form, max_chapters: parseInt(e.target.value) || 0 })
          }
          className="w-full px-4 py-3 bg-ys-surface border border-ys-border rounded-xl text-ys-text focus:outline-none focus:ring-2 focus:ring-ys-accent/40 focus:border-ys-accent/40 transition-colors"
        />
      </div>

      <div>
        <label className="block text-sm font-semibold text-ys-text mb-2">
          Who Rolls the Dice?
        </label>
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => onChange({ ...form, diceMode: "ai" })}
            className={`p-3 rounded-xl border text-left transition-all ${
              form.diceMode === "ai"
                ? "bg-ys-accent/10 border-ys-accent/40 ring-1 ring-ys-accent/30 shadow-[0_0_16px_color-mix(in_srgb,var(--ys-accent)_15%,transparent)]"
                : "bg-ys-surface border-ys-border hover:border-ys-accent/30 hover:bg-ys-surface-2"
            }`}
          >
            <span className="flex items-center gap-1.5 text-sm font-semibold text-ys-text mb-0.5">
              <DynamicIcon name="Sparkles" className="w-4 h-4 text-ys-accent" />
              GM rolls
            </span>
            <span className="block text-xs text-ys-muted">
              The AI rolls digitally and narrates the results
            </span>
          </button>
          <button
            type="button"
            onClick={() => onChange({ ...form, diceMode: "physical" })}
            className={`p-3 rounded-xl border text-left transition-all ${
              form.diceMode === "physical"
                ? "bg-ys-accent/10 border-ys-accent/40 ring-1 ring-ys-accent/30 shadow-[0_0_16px_color-mix(in_srgb,var(--ys-accent)_15%,transparent)]"
                : "bg-ys-surface border-ys-border hover:border-ys-accent/30 hover:bg-ys-surface-2"
            }`}
          >
            <span className="flex items-center gap-1.5 text-sm font-semibold text-ys-text mb-0.5">
              <DynamicIcon name="Move3d" className="w-4 h-4 text-ys-accent" />
              Throw 3D dice
            </span>
            <span className="block text-xs text-ys-muted">
              Drag to throw real physics dice on-screen
            </span>
          </button>
          <button
            type="button"
            onClick={() => onChange({ ...form, diceMode: "manual" })}
            className={`p-3 rounded-xl border text-left transition-all ${
              form.diceMode === "manual"
                ? "bg-ys-accent/10 border-ys-accent/40 ring-1 ring-ys-accent/30 shadow-[0_0_16px_color-mix(in_srgb,var(--ys-accent)_15%,transparent)]"
                : "bg-ys-surface border-ys-border hover:border-ys-accent/30 hover:bg-ys-surface-2"
            }`}
          >
            <span className="flex items-center gap-1.5 text-sm font-semibold text-ys-text mb-0.5">
              <DynamicIcon name="Dices" className="w-4 h-4 text-ys-accent" />
              We roll
            </span>
            <span className="block text-xs text-ys-muted">
              Roll real dice - the GM pauses and asks for your results
            </span>
          </button>
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-ys-text mb-2">
          Your Player Type{" "}
          <span className="text-xs font-normal text-ys-muted">
            (used for solo play - tells the GM how to engage you)
          </span>
        </label>
        <div className="grid grid-cols-2 gap-2">
          {ARCHETYPE_OPTIONS.map(([key, info]) => {
            const selected = form.playerArchetype === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() =>
                  onChange({
                    ...form,
                    playerArchetype: selected ? undefined : key,
                  })
                }
                title={info.description}
                className={`p-2.5 rounded-lg border text-left transition-all ${
                  selected
                    ? "bg-ys-accent/40 border-ys-accent/60 ring-1 ring-ys-accent/40"
                    : "bg-ys-accent/20 border-ys-accent/40 hover:border-ys-accent/40"
                }`}
              >
                <span className="block text-sm font-semibold text-ys-text">
                  {info.label}
                </span>
                <span className="block text-xs text-ys-muted">
                  {info.description}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-ys-text mb-2">
          Suggested Choices
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onChange({ ...form, autoGenerateChoices: false })}
            className={`p-3 rounded-xl border text-left transition-all ${
              !form.autoGenerateChoices
                ? "bg-ys-accent/10 border-ys-accent/40 ring-1 ring-ys-accent/30 shadow-[0_0_16px_color-mix(in_srgb,var(--ys-accent)_15%,transparent)]"
                : "bg-ys-surface border-ys-border hover:border-ys-accent/30 hover:bg-ys-surface-2"
            }`}
          >
            <span className="flex items-center gap-1.5 text-sm font-semibold text-ys-text mb-0.5">
              <DynamicIcon name="PenLine" className="w-4 h-4 text-ys-accent" />
              Off
            </span>
            <span className="block text-xs text-ys-muted">
              Freeform text only - type or say what you do
            </span>
          </button>
          <button
            type="button"
            onClick={() => onChange({ ...form, autoGenerateChoices: true })}
            className={`p-3 rounded-xl border text-left transition-all ${
              form.autoGenerateChoices
                ? "bg-ys-accent/10 border-ys-accent/40 ring-1 ring-ys-accent/30 shadow-[0_0_16px_color-mix(in_srgb,var(--ys-accent)_15%,transparent)]"
                : "bg-ys-surface border-ys-border hover:border-ys-accent/30 hover:bg-ys-surface-2"
            }`}
          >
            <span className="flex items-center gap-1.5 text-sm font-semibold text-ys-text mb-0.5">
              <DynamicIcon name="List" className="w-4 h-4 text-ys-accent" />
              On
            </span>
            <span className="block text-xs text-ys-muted">
              Also suggest a few tappable actions after each turn
            </span>
          </button>
        </div>
      </div>

    </div>
  );
}
