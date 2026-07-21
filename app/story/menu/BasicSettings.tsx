"use client";

import {
  StoryData,
  Stat,
  Resource,
  InventoryItem,
  StoryLore,
  Relationship,
  AGMTState,
  CustomTable,
  Variable,
  NumberVariable,
  BooleanVariable,
  StringVariable,
  ListVariable,
  Ability,
  AbilityCost,
  AbilityGrade,
  MemoryEntry,
  getMemoryContent,
  NPC,
  NPCStatus,
  NPCAttitude,
  Adventure,
  DiceMode,
} from "../../misc/structs";
import { DynamicIcon } from "../../components/DynamicIcon";

export interface BasicSettingsForm {
  story_name: string;
  player_name: string;
  player_summary: string;
  premise: string;
  max_chapters: number;
  displayName: string;
  displayAvatar: string;
  diceMode: DiceMode;
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
        <label className="block text-sm font-semibold text-blue-200 mb-2">
          Story Name
        </label>
        <input
          type="text"
          value={form.story_name}
          onChange={(e) => onChange({ ...form, story_name: e.target.value })}
          className="w-full px-4 py-3 bg-blue-900/20 border border-blue-700/40 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
      </div>

      <div>
        <label className="block text-sm font-semibold text-blue-200 mb-2">
          Player/Character Name
        </label>
        <input
          type="text"
          value={form.player_name}
          onChange={(e) => onChange({ ...form, player_name: e.target.value })}
          className="w-full px-4 py-3 bg-blue-900/20 border border-blue-700/40 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
      </div>
      <div>
        <label className="block text-sm font-semibold text-blue-200 mb-2">
          Character Description
        </label>
        <textarea
          value={form.player_summary}
          onChange={(e) =>
            onChange({ ...form, player_summary: e.target.value })
          }
          className="w-full h-32 px-4 py-3 bg-blue-900/20 border border-blue-700/40 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
        />
      </div>
      <div>
        <label className="block text-sm font-semibold text-blue-200 mb-2">
          Story Premise
        </label>
        <textarea
          value={form.premise}
          onChange={(e) => onChange({ ...form, premise: e.target.value })}
          className="w-full h-24 px-4 py-3 bg-blue-900/20 border border-blue-700/40 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
        />
      </div>
      <div>
        <label className="block text-sm font-semibold text-blue-200 mb-2">
          Max Chapters
        </label>
        <input
          type="number"
          value={form.max_chapters}
          onChange={(e) =>
            onChange({ ...form, max_chapters: parseInt(e.target.value) || 0 })
          }
          className="w-full px-4 py-3 bg-blue-900/20 border border-blue-700/40 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
      </div>

      <div>
        <label className="block text-sm font-semibold text-blue-200 mb-2">
          Who Rolls the Dice?
        </label>
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => onChange({ ...form, diceMode: "ai" })}
            className={`p-3 rounded-lg border text-left transition-all ${
              form.diceMode === "ai"
                ? "bg-purple-900/40 border-purple-500/60 ring-1 ring-purple-500/40"
                : "bg-blue-900/20 border-blue-700/40 hover:border-purple-500/40"
            }`}
          >
            <span className="flex items-center gap-1.5 text-sm font-semibold text-white mb-0.5">
              <DynamicIcon name="Sparkles" className="w-4 h-4 text-purple-300" />
              GM rolls
            </span>
            <span className="block text-xs text-blue-300/50">
              The AI rolls digitally and narrates the results
            </span>
          </button>
          <button
            type="button"
            onClick={() => onChange({ ...form, diceMode: "physical" })}
            className={`p-3 rounded-lg border text-left transition-all ${
              form.diceMode === "physical"
                ? "bg-purple-900/40 border-purple-500/60 ring-1 ring-purple-500/40"
                : "bg-blue-900/20 border-blue-700/40 hover:border-purple-500/40"
            }`}
          >
            <span className="flex items-center gap-1.5 text-sm font-semibold text-white mb-0.5">
              <DynamicIcon name="Move3d" className="w-4 h-4 text-purple-300" />
              Throw 3D dice
            </span>
            <span className="block text-xs text-blue-300/50">
              Drag to throw real physics dice on-screen
            </span>
          </button>
          <button
            type="button"
            onClick={() => onChange({ ...form, diceMode: "manual" })}
            className={`p-3 rounded-lg border text-left transition-all ${
              form.diceMode === "manual"
                ? "bg-purple-900/40 border-purple-500/60 ring-1 ring-purple-500/40"
                : "bg-blue-900/20 border-blue-700/40 hover:border-purple-500/40"
            }`}
          >
            <span className="flex items-center gap-1.5 text-sm font-semibold text-white mb-0.5">
              <DynamicIcon name="Dices" className="w-4 h-4 text-purple-300" />
              We roll
            </span>
            <span className="block text-xs text-blue-300/50">
              Roll real dice - the GM pauses and asks for your results
            </span>
          </button>
        </div>
      </div>

    </div>
  );
}
