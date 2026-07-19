"use client";

import {
  StoryData,
  Stat,
  Resource,
  InventoryItem,
  Achievement,
  StoryLore,
  Quest,
  Relationship,
  Condition,
  ConditionTier,
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
} from "../../misc/structs";
import { DynamicIcon } from "../../components/DynamicIcon";

export interface BasicSettingsForm {
  story_name: string;
  player_name: string;
  player_summary: string;
  premise: string;
  max_chapters: number;
  points: number;
  momentum: number;
  maxMomentum: number;
  displayName: string;
  displayAvatar: string;
  rpgSystem:
    | "3d6"
    | "1d20"
    | "1d100"
    | "percentile"
    | "pbta"
    | "fate"
    | "yze"
    | "explosive"
    | "narrative";
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

      {/* Points Section */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold text-blue-200 mb-2">
            Points
          </label>
          <input
            type="number"
            min={0}
            value={form.points}
            onChange={(e) =>
              onChange({ ...form, points: parseInt(e.target.value) || 0 })
            }
            className="w-full px-4 py-3 bg-blue-900/20 border border-blue-700/40 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <p className="text-xs text-blue-200/60 mt-1">
            Earned from achievements, quests, and challenges
          </p>
        </div>
      </div>

      {/* Momentum Section */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold text-blue-200 mb-2">
            Momentum
          </label>
          <input
            type="number"
            min={0}
            value={form.momentum}
            onChange={(e) =>
              onChange({ ...form, momentum: parseInt(e.target.value) || 0 })
            }
            className="w-full px-4 py-3 bg-blue-900/20 border border-blue-700/40 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-blue-200 mb-2">
            Max Momentum
          </label>
          <input
            type="number"
            min={1}
            value={form.maxMomentum}
            onChange={(e) =>
              onChange({ ...form, maxMomentum: parseInt(e.target.value) || 1 })
            }
            className="w-full px-4 py-3 bg-blue-900/20 border border-blue-700/40 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
      </div>

      {/* RPG System Selection */}
      <div>
        <label className="block text-sm font-semibold text-blue-200 mb-2">
          RPG Dice System
        </label>
        <p className="text-xs text-blue-200/60 mb-3">
          Change the core dice mechanics. Affects DCs, upgrade values, and
          resource scaling.
        </p>
        <div className="grid grid-cols-2 gap-3">
          {[
            {
              id: "3d6" as const,
              name: "3d6",
              desc: "Roll 3-18, add to stat",
              icon: "Dices",
            },
            {
              id: "1d20" as const,
              name: "1d20",
              desc: "Roll 1-20, add to stat",
              icon: "Dices",
            },
            {
              id: "1d100" as const,
              name: "1d100",
              desc: "Roll 1-100, add to stat",
              icon: "Dices",
            },
            {
              id: "percentile" as const,
              name: "Classic Percentile",
              desc: "Roll 1-100, under stat wins",
              icon: "TrendingDown",
            },
            {
              id: "pbta" as const,
              name: "PbtA",
              desc: "2d6+mod: 10+ success, 7-9 partial",
              icon: "Zap",
              fullWidth: true,
            },
            {
              id: "fate" as const,
              name: "Fate Core",
              desc: "4dF+ladder: fail/tie/succeed/style",
              icon: "Scale",
              fullWidth: true,
            },
            {
              id: "yze" as const,
              name: "Year Zero Engine",
              desc: "d6 pool (count 6s), stress dice + panic",
              icon: "Skull",
              fullWidth: true,
            },
            {
              id: "explosive" as const,
              name: "Exploding Dice",
              desc: "Stat?die size (d4-d20), max rolls explode!",
              icon: "Flame",
              fullWidth: true,
            },
            {
              id: "narrative" as const,
              name: "Narrative (No Dice)",
              desc: "Pure storytelling, outcomes from dramatic logic",
              icon: "BookHeart",
              fullWidth: true,
            },
          ].map((sys) => (
            <button
              key={sys.id}
              onClick={() => onChange({ ...form, rpgSystem: sys.id })}
              className={`px-4 py-3 rounded-lg font-semibold border-2 transition-all text-left ${
                (sys as any).fullWidth ? "col-span-2" : ""
              } ${
                form.rpgSystem === sys.id
                  ? "bg-purple-600 text-white border-purple-600"
                  : "bg-blue-900/30 text-blue-200 border-blue-700/40 hover:border-purple-400"
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <DynamicIcon name={sys.icon} className="w-4 h-4" />
                <span className="text-sm font-bold">{sys.name}</span>
              </div>
              <div className="text-xs opacity-75">{sys.desc}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// Stats & Resources Editor
