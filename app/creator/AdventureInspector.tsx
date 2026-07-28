"use client";

/**
 * Live view of the adventure the Designer is building, with hand editing.
 *
 * Everything here writes straight into the same draft the AI's tools mutate, so
 * a one-word fix doesn't cost a chat round-trip. The Designer sees hand edits
 * on its next turn via the state block in the system prompt.
 */

import { useState } from "react";
import { DynamicIcon } from "@/app/components/DynamicIcon";
import { AdventureDraft, draftReadiness } from "@/app/misc/designer_executor";
import { LoreType, NPC, StoryLore } from "@/app/misc/structs";

interface AdventureInspectorProps {
  draft: AdventureDraft;
  onChange: (patch: Partial<AdventureDraft>) => void;
}

type SectionId =
  | "overview"
  | "opening"
  | "rules"
  | "notes"
  | "cast"
  | "goals"
  | "tables";

const NOTE_TYPE_LABELS: Partial<Record<LoreType, string>> = {
  lore: "Lore",
  secret: "Secret",
  mechanics: "Rules",
  character_sheet: "Character",
  dm_instructions: "GM guidance",
  story_instructions: "Narrator style",
  gm_plan: "Campaign plan",
};

const NOTE_TYPE_COLORS: Partial<Record<LoreType, string>> = {
  lore: "bg-blue-500/15 text-blue-300",
  secret: "bg-rose-500/15 text-rose-300",
  mechanics: "bg-amber-500/15 text-amber-300",
  character_sheet: "bg-emerald-500/15 text-emerald-300",
  dm_instructions: "bg-purple-500/15 text-purple-300",
  story_instructions: "bg-purple-500/15 text-purple-300",
  gm_plan: "bg-cyan-500/15 text-cyan-300",
};

const ATTITUDE_COLORS: Record<NPC["attitude"], string> = {
  hostile: "bg-red-500/15 text-red-300",
  unfriendly: "bg-orange-500/15 text-orange-300",
  neutral: "bg-gray-500/15 text-gray-300",
  friendly: "bg-green-500/15 text-green-300",
  allied: "bg-emerald-500/15 text-emerald-300",
};

const inputClass =
  "w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-purple-400/50 transition-colors";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] uppercase tracking-wide text-white/40 mb-1.5">
        {label}
      </span>
      {children}
    </label>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-sm text-white/30 italic py-3 text-center">{children}</p>
  );
}

export default function AdventureInspector({
  draft,
  onChange,
}: AdventureInspectorProps) {
  const [openSection, setOpenSection] = useState<SectionId>("overview");
  const [editingNote, setEditingNote] = useState<string | null>(null);

  const readiness = draftReadiness(draft);

  const mechanicsNotes = draft.lore.filter((l) => l.type === "mechanics");
  const sheetNotes = draft.lore.filter((l) => l.type === "character_sheet");
  // Random tables are notes now, so they're edited like every other note -
  // they just get their own section instead of being mixed into world notes.
  const tableNotes = draft.lore.filter((l) => l.type === "table");
  const otherNotes = draft.lore.filter(
    (l) =>
      l.type !== "mechanics" &&
      l.type !== "character_sheet" &&
      l.type !== "table",
  );

  const updateNote = (title: string, patch: Partial<StoryLore>) => {
    onChange({
      lore: draft.lore.map((l) => (l.title === title ? { ...l, ...patch } : l)),
    });
  };

  const removeNote = (title: string) => {
    onChange({ lore: draft.lore.filter((l) => l.title !== title) });
  };

  const sections: { id: SectionId; label: string; icon: string; count?: number }[] =
    [
      { id: "overview", label: "Overview", icon: "BookOpen" },
      { id: "opening", label: "Opening", icon: "Play" },
      {
        id: "rules",
        label: "Rules & Character",
        icon: "Dices",
        count: mechanicsNotes.length + sheetNotes.length,
      },
      { id: "notes", label: "World notes", icon: "ScrollText", count: otherNotes.length },
      { id: "cast", label: "Cast", icon: "Users", count: draft.npcs.length },
      { id: "goals", label: "Goals", icon: "Target", count: draft.goals.length },
      {
        id: "tables",
        label: "Tables",
        icon: "Table",
        count: tableNotes.length,
      },
    ];

  const renderNoteCard = (note: StoryLore) => {
    const isEditing = editingNote === note.title;
    const type = (note.type ?? "lore") as LoreType;
    return (
      <div
        key={note.title}
        className="bg-white/[0.03] border border-white/10 rounded-xl p-3"
      >
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-white text-sm truncate">
                {note.title}
              </span>
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                  NOTE_TYPE_COLORS[type] ?? "bg-white/10 text-white/60"
                }`}
              >
                {NOTE_TYPE_LABELS[type] ?? type}
              </span>
              {note.alwaysOn && (
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-white/10 text-white/50">
                  always on
                </span>
              )}
            </div>
            {note.keys && note.keys.length > 0 && (
              <p className="text-[11px] text-white/35 mt-1 truncate">
                triggers: {note.keys.join(", ")}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => setEditingNote(isEditing ? null : note.title)}
              className="p-1.5 rounded-md hover:bg-white/10 text-white/40 hover:text-white transition-colors"
              title={isEditing ? "Collapse" : "Edit"}
            >
              <DynamicIcon
                name={isEditing ? "ChevronUp" : "Pencil"}
                className="w-3.5 h-3.5"
              />
            </button>
            <button
              onClick={() => removeNote(note.title)}
              className="p-1.5 rounded-md hover:bg-red-500/20 text-white/40 hover:text-red-300 transition-colors"
              title="Delete note"
            >
              <DynamicIcon name="Trash2" className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        {isEditing ? (
          <textarea
            value={note.content}
            onChange={(e) => updateNote(note.title, { content: e.target.value })}
            rows={10}
            className={`${inputClass} font-mono text-xs leading-relaxed`}
          />
        ) : (
          <p className="text-xs text-white/50 line-clamp-3 whitespace-pre-wrap">
            {note.content || "(empty)"}
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-black/20">
      {/* Readiness banner */}
      <div className="px-4 py-3 border-b border-white/10 shrink-0">
        {readiness.ready ? (
          <div className="flex items-center gap-2 text-sm text-emerald-300">
            <DynamicIcon name="CheckCircle2" className="w-4 h-4 shrink-0" />
            <span>Ready to play</span>
          </div>
        ) : (
          <div className="flex items-start gap-2 text-sm text-amber-300/90">
            <DynamicIcon name="CircleDashed" className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="text-xs leading-relaxed">
              Still needs {readiness.missing.join(", ")}
            </span>
          </div>
        )}
      </div>

      {/* Section tabs */}
      <div className="flex flex-wrap gap-1 px-3 py-2 border-b border-white/10 shrink-0">
        {sections.map((section) => (
          <button
            key={section.id}
            onClick={() => setOpenSection(section.id)}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
              openSection === section.id
                ? "bg-purple-500/20 text-purple-200"
                : "text-white/45 hover:text-white/80 hover:bg-white/5"
            }`}
          >
            <DynamicIcon name={section.icon} className="w-3.5 h-3.5" />
            {section.label}
            {section.count !== undefined && section.count > 0 && (
              <span className="text-[10px] text-white/40">{section.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Section body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {openSection === "overview" && (
          <>
            <Field label="Title">
              <input
                value={draft.title}
                onChange={(e) => onChange({ title: e.target.value })}
                placeholder="Untitled adventure"
                className={inputClass}
              />
            </Field>
            <Field label="Hook (library card)">
              <input
                value={draft.shortDescription}
                onChange={(e) => onChange({ shortDescription: e.target.value })}
                placeholder="One line that sells it"
                className={inputClass}
              />
            </Field>
            <Field label="Description">
              <textarea
                value={draft.description}
                onChange={(e) => onChange({ description: e.target.value })}
                rows={5}
                placeholder="What the player reads before starting"
                className={inputClass}
              />
            </Field>
            <Field label="Tags (comma separated)">
              <input
                value={draft.tags.join(", ")}
                onChange={(e) =>
                  onChange({
                    tags: e.target.value
                      .split(",")
                      .map((t) => t.trim())
                      .filter(Boolean),
                  })
                }
                placeholder="noir, mystery"
                className={inputClass}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Difficulty">
                <select
                  value={draft.difficulty}
                  onChange={(e) =>
                    onChange({
                      difficulty: e.target
                        .value as AdventureDraft["difficulty"],
                    })
                  }
                  className={inputClass}
                >
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                  <option value="expert">Expert</option>
                </select>
              </Field>
              <Field label="Play time">
                <input
                  value={draft.estimatedDuration}
                  onChange={(e) =>
                    onChange({ estimatedDuration: e.target.value })
                  }
                  className={inputClass}
                />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm text-white/60 cursor-pointer">
              <input
                type="checkbox"
                checked={draft.nsfw}
                onChange={(e) => onChange({ nsfw: e.target.checked })}
                className="rounded border-white/20 bg-black/30"
              />
              Contains adult content
            </label>
          </>
        )}

        {openSection === "opening" && (
          <>
            <Field label="Premise (GM-facing)">
              <textarea
                value={draft.premise}
                onChange={(e) => onChange({ premise: e.target.value })}
                rows={6}
                placeholder="The situation the story opens on"
                className={inputClass}
              />
            </Field>
            <Field label="Opening prose (what the player reads first)">
              <textarea
                value={draft.intro}
                onChange={(e) => onChange({ intro: e.target.value })}
                rows={10}
                placeholder="The first words of the story"
                className={inputClass}
              />
            </Field>
            <Field label="Author notes (private)">
              <textarea
                value={draft.authorNotes}
                onChange={(e) => onChange({ authorNotes: e.target.value })}
                rows={4}
                placeholder="Tone, themes, things to avoid"
                className={inputClass}
              />
            </Field>

            <div>
              <span className="block text-[11px] uppercase tracking-wide text-white/40 mb-2">
                Opening choices
              </span>
              {draft.startingChoices.length === 0 ? (
                <EmptyHint>
                  No opening choices — the player sees a plain Start button.
                </EmptyHint>
              ) : (
                <div className="space-y-2">
                  {draft.startingChoices.map((choice, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <input
                        value={choice.text}
                        onChange={(e) => {
                          const updated = [...draft.startingChoices];
                          updated[index] = {
                            ...updated[index],
                            text: e.target.value,
                          };
                          onChange({ startingChoices: updated });
                        }}
                        className={inputClass}
                      />
                      <button
                        onClick={() =>
                          onChange({
                            startingChoices: draft.startingChoices.filter(
                              (_, i) => i !== index,
                            ),
                          })
                        }
                        className="p-2 rounded-md hover:bg-red-500/20 text-white/40 hover:text-red-300 transition-colors shrink-0"
                      >
                        <DynamicIcon name="Trash2" className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {openSection === "rules" && (
          <>
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[11px] uppercase tracking-wide text-white/40">
                  Mechanics
                </span>
                <span className="text-[11px] text-white/25">
                  how dice work at the table
                </span>
              </div>
              {mechanicsNotes.length === 0 ? (
                <EmptyHint>
                  No mechanics note yet. Ask the designer to write one — the GM
                  needs it to run checks consistently.
                </EmptyHint>
              ) : (
                <div className="space-y-2">
                  {mechanicsNotes.map(renderNoteCard)}
                </div>
              )}
            </div>
            <div>
              <span className="block text-[11px] uppercase tracking-wide text-white/40 mb-2">
                Character sheet
              </span>
              {sheetNotes.length === 0 ? (
                <EmptyHint>No character sheet note yet.</EmptyHint>
              ) : (
                <div className="space-y-2">{sheetNotes.map(renderNoteCard)}</div>
              )}
            </div>
            {draft.presets.length > 0 && (
              <div>
                <span className="block text-[11px] uppercase tracking-wide text-white/40 mb-2">
                  Pre-made characters
                </span>
                <div className="space-y-2">
                  {draft.presets.map((preset) => (
                    <div
                      key={preset.id}
                      className="bg-white/[0.03] border border-white/10 rounded-xl p-3 flex items-start gap-3"
                    >
                      <span className="text-xl shrink-0">{preset.icon}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-white truncate">
                          {preset.name}
                        </p>
                        <p className="text-xs text-white/45 line-clamp-2">
                          {preset.description}
                        </p>
                      </div>
                      <button
                        onClick={() =>
                          onChange({
                            presets: draft.presets.filter(
                              (p) => p.id !== preset.id,
                            ),
                          })
                        }
                        className="p-1.5 rounded-md hover:bg-red-500/20 text-white/40 hover:text-red-300 transition-colors shrink-0"
                      >
                        <DynamicIcon name="Trash2" className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {openSection === "notes" &&
          (otherNotes.length === 0 ? (
            <EmptyHint>
              No world notes yet. Talk to the designer about the setting.
            </EmptyHint>
          ) : (
            <div className="space-y-2">{otherNotes.map(renderNoteCard)}</div>
          ))}

        {openSection === "cast" &&
          (draft.npcs.length === 0 ? (
            <EmptyHint>No NPCs yet.</EmptyHint>
          ) : (
            <div className="space-y-2">
              {draft.npcs.map((npc) => (
                <div
                  key={npc.id}
                  className="bg-white/[0.03] border border-white/10 rounded-xl p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {npc.symbol && <span>{npc.symbol}</span>}
                        <span className="font-medium text-white text-sm">
                          {npc.name}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] ${
                            ATTITUDE_COLORS[npc.attitude]
                          }`}
                        >
                          {npc.attitude}
                        </span>
                      </div>
                      <p className="text-[11px] text-white/40 mt-0.5">
                        {npc.role}
                        {npc.faction ? ` · ${npc.faction}` : ""}
                      </p>
                      <p className="text-xs text-white/50 mt-1.5 line-clamp-3">
                        {npc.description}
                      </p>
                      {npc.notes && (
                        <p className="text-[11px] text-amber-300/50 mt-1.5 line-clamp-2">
                          GM: {npc.notes}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() =>
                        onChange({
                          npcs: draft.npcs.filter((n) => n.id !== npc.id),
                        })
                      }
                      className="p-1.5 rounded-md hover:bg-red-500/20 text-white/40 hover:text-red-300 transition-colors shrink-0"
                    >
                      <DynamicIcon name="Trash2" className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ))}

        {openSection === "goals" &&
          (draft.goals.length === 0 ? (
            <EmptyHint>No goals yet.</EmptyHint>
          ) : (
            <div className="space-y-2">
              {draft.goals.map((goal) => (
                <div
                  key={goal.id}
                  className="bg-white/[0.03] border border-white/10 rounded-xl p-3 flex items-start justify-between gap-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-white text-sm">
                        {goal.title}
                      </span>
                      {!goal.active && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-white/10 text-white/45">
                          hidden at start
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-white/50 mt-1">
                      {goal.shortDescription}
                    </p>
                  </div>
                  <button
                    onClick={() =>
                      onChange({
                        goals: draft.goals.filter((g) => g.id !== goal.id),
                      })
                    }
                    className="p-1.5 rounded-md hover:bg-red-500/20 text-white/40 hover:text-red-300 transition-colors shrink-0"
                  >
                    <DynamicIcon name="Trash2" className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ))}

        {openSection === "tables" &&
          (tableNotes.length === 0 ? (
            <EmptyHint>
              No random tables yet. A table is a note that names a die and
              lists what each number gives — the GM rolls it during play.
            </EmptyHint>
          ) : (
            <div className="space-y-2">{tableNotes.map(renderNoteCard)}</div>
          ))}
      </div>
    </div>
  );
}
