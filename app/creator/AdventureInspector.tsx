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
import {
  AdventureDraft,
  draftReadiness,
  withSystemToolsSwitch,
} from "@/app/misc/designer_executor";
import { pinnedNoteWarning } from "@/app/misc/contextLimits";
import { LoreType, NPC, StoryLore } from "@/app/misc/structs";
import { resolveSystem } from "@/app/misc/systems/resolve";
import { removeCampaignPart } from "@/app/misc/campaign/designer";
import { campaignWarnings } from "@/app/misc/campaign/validate";
import type { CampaignPart } from "@/app/misc/campaign/validate";

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
  | "campaign"
  | "tables";

const NOTE_TYPE_LABELS: Partial<Record<LoreType, string>> = {
  lore: "Lore",
  secret: "Secret",
  mechanics: "Rules",
  character_sheet: "Character",
  dm_instructions: "GM guidance",
  story_instructions: "Narrator style",
  summary_instructions: "Summary rules",
  gm_plan: "Campaign plan",
};

const NOTE_TYPE_COLORS: Partial<Record<LoreType, string>> = {
  lore: "bg-ys-accent/15 text-ys-accent",
  secret: "bg-ys-warning/15 text-ys-warning",
  mechanics: "bg-ys-surface-2 text-ys-muted",
  character_sheet: "bg-ys-accent/15 text-ys-accent",
  dm_instructions: "bg-ys-surface-2 text-ys-muted",
  story_instructions: "bg-ys-surface-2 text-ys-muted",
  summary_instructions: "bg-ys-surface-2 text-ys-muted",
  gm_plan: "bg-ys-surface-2 text-ys-muted",
};

const ATTITUDE_COLORS: Record<NPC["attitude"], string> = {
  hostile: "bg-ys-danger/15 text-ys-danger",
  unfriendly: "bg-ys-warning/15 text-ys-warning",
  neutral: "bg-ys-surface-2 text-ys-muted",
  friendly: "bg-ys-success/15 text-ys-success",
  allied: "bg-ys-accent/15 text-ys-accent",
};

const inputClass =
  "w-full bg-ys-surface-2 border border-ys-border rounded-lg px-3 py-2 text-sm text-ys-text placeholder:text-ys-muted focus:outline-none focus:border-ys-accent transition-colors";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] uppercase tracking-wide text-ys-muted mb-1.5">
        {label}
      </span>
      {children}
    </label>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-sm text-ys-muted italic py-3 text-center">{children}</p>
  );
}

function campaignItemCount(c: AdventureDraft["campaign"]): number {
  if (!c) return 0;
  return (
    c.factions.length +
    c.fronts.length +
    c.clocks.length +
    c.people.length +
    c.secrets.length +
    c.locations.length +
    (c.beats?.list.length ?? 0) +
    c.endStates.length
  );
}

/**
 * The campaign record, read from the draft with a remove button per part.
 * Writing parts is the Designer's `write_campaign`; the AI and the author see
 * the same record. Removal goes through `removeCampaignPart`, which also
 * clears the links that pointed at the part.
 */
function CampaignSection({
  draft,
  onChange,
}: {
  draft: AdventureDraft;
  onChange: (campaign: AdventureDraft["campaign"]) => void;
}) {
  const record = draft.campaign;
  if (!record) {
    return (
      <EmptyHint>
        No campaign record yet. Ask the Designer for one: a style, a pitch and
        tone, then the factions, fronts, clocks, secrets and places the GM runs
        the story on. Anything left out is built with the player in session
        zero.
      </EmptyHint>
    );
  }
  const remove = (part: CampaignPart, ref?: string) => {
    const copy = structuredClone(record);
    const out = removeCampaignPart(copy, part, ref, draft.npcs);
    if (out.ok) onChange(copy);
  };
  const warnings = campaignWarnings(record);
  const npcName = (id: string) =>
    draft.npcs.find((n) => n.id === id)?.name ?? "(missing)";

  const row = (
    key: string,
    title: string,
    detail: string | undefined,
    onRemove: () => void,
  ) => (
    <div
      key={key}
      className="bg-ys-surface-2 border border-ys-border rounded-xl p-3 flex items-start justify-between gap-2"
    >
      <div className="min-w-0 flex-1">
        <span className="font-medium text-ys-text text-sm">{title}</span>
        {detail && <p className="text-xs text-ys-muted mt-1">{detail}</p>}
      </div>
      <button
        onClick={onRemove}
        aria-label={`Remove ${title}`}
        className="p-1.5 rounded-md hover:bg-ys-danger/25 text-ys-muted hover:text-ys-danger transition-colors shrink-0"
      >
        <DynamicIcon name="Trash2" className="w-3.5 h-3.5" />
      </button>
    </div>
  );
  const group = (label: string, rows: React.ReactNode[]) =>
    rows.length > 0 && (
      <div className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-ys-muted">
          {label}
        </h4>
        {rows}
      </div>
    );

  return (
    <div className="space-y-4">
      {warnings.length > 0 && (
        <div className="bg-ys-warning/15 text-ys-warning rounded-xl p-3 text-xs space-y-1">
          {warnings.map((w) => (
            <p key={w}>{w}</p>
          ))}
        </div>
      )}
      <div className="bg-ys-surface-2 border border-ys-border rounded-xl p-3 text-xs space-y-1">
        <p className="text-ys-text">
          <span className="text-ys-muted">Style: </span>
          {record.style ?? "not set"}
        </p>
        {record.pitch && (
          <p className="text-ys-text">
            {record.pitch.premise}{" "}
            <span className="text-ys-muted">[{record.pitch.tone.join(", ")}]</span>
          </p>
        )}
        {record.safety && (
          <p className="text-ys-muted">
            Lines: {record.safety.lines.map((l) => l.text).join("; ") || "none"}
            {" · "}
            Veils: {record.safety.veils.map((l) => l.text).join("; ") || "none"}
          </p>
        )}
      </div>
      {group(
        "Factions",
        record.factions.map((f) =>
          row(f.id, f.name, f.goal, () => remove("faction", f.id)),
        ),
      )}
      {group(
        "Fronts",
        record.fronts.map((f) =>
          row(f.id, f.name, f.doom, () => remove("front", f.id)),
        ),
      )}
      {group(
        "Clocks",
        record.clocks.map((c) =>
          row(
            c.id,
            c.name,
            `${c.segments} segments · ${c.triggers.join(", ")}${c.visible ? "" : " · hidden"}`,
            () => remove("clock", c.id),
          ),
        ),
      )}
      {group(
        "People",
        record.people.map((p) =>
          row(p.npcId, npcName(p.npcId), p.want, () => remove("person", p.npcId)),
        ),
      )}
      {group(
        "Secrets",
        record.secrets.map((s) =>
          row(s.id, s.title, `${s.clues.length} clues`, () => remove("secret", s.id)),
        ),
      )}
      {group(
        "Locations",
        record.locations.map((l) =>
          row(l.id, l.name, l.features.join("; "), () => remove("location", l.id)),
        ),
      )}
      {group(
        "Beats",
        (record.beats?.list ?? []).map((b) =>
          row(b.id, b.title, b.summary, () => remove("beat", b.id)),
        ),
      )}
      {group(
        "End states",
        record.endStates.map((e) =>
          row(e.id, e.text, undefined, () => remove("end_state", e.id)),
        ),
      )}
    </div>
  );
}

export default function AdventureInspector({
  draft,
  onChange,
}: AdventureInspectorProps) {
  const [openSection, setOpenSection] = useState<SectionId>("overview");
  const [editingNote, setEditingNote] = useState<string | null>(null);

  const readiness = draftReadiness(draft);
  // The derived answer, for the "Automatic" option's label (the hand switch
  // is left out so it shows what automatic would do).
  const resolvedSystem = resolveSystem({
    lore: draft.lore,
    systemState: { sessionCount: 0, dedupKeys: [] },
  });

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
        id: "campaign",
        label: "Campaign",
        icon: "Compass",
        count: campaignItemCount(draft.campaign),
      },
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
        className="bg-ys-surface-2 border border-ys-border rounded-xl p-3"
      >
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-ys-text text-sm truncate">
                {note.title}
              </span>
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                  NOTE_TYPE_COLORS[type] ?? "bg-ys-surface-2 text-ys-muted"
                }`}
              >
                {NOTE_TYPE_LABELS[type] ?? type}
              </span>
              {note.alwaysOn && (
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-ys-surface-2 text-ys-muted">
                  always on
                </span>
              )}
            </div>
            {note.keys && note.keys.length > 0 && (
              <p className="text-[11px] text-ys-muted mt-1 truncate">
                triggers: {note.keys.join(", ")}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => setEditingNote(isEditing ? null : note.title)}
              className="p-1.5 rounded-md hover:bg-ys-surface-2 text-ys-muted hover:text-ys-text transition-colors"
              title={isEditing ? "Collapse" : "Edit"}
            >
              <DynamicIcon
                name={isEditing ? "ChevronUp" : "Pencil"}
                className="w-3.5 h-3.5"
              />
            </button>
            <button
              onClick={() => removeNote(note.title)}
              className="p-1.5 rounded-md hover:bg-ys-danger/25 text-ys-muted hover:text-ys-danger transition-colors"
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
          <p className="text-xs text-ys-muted line-clamp-3 whitespace-pre-wrap">
            {note.content || "(empty)"}
          </p>
        )}
        {pinnedNoteWarning(note) && (
          <p
            role="status"
            className="mt-2 text-[11px] leading-relaxed text-ys-warning"
          >
            {pinnedNoteWarning(note)}
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-ys-surface">
      {/* Readiness banner */}
      <div className="px-4 py-3 border-b border-ys-border shrink-0">
        {readiness.ready ? (
          <div className="flex items-center gap-2 text-sm text-ys-success">
            <DynamicIcon name="CheckCircle2" className="w-4 h-4 shrink-0" />
            <span>Ready to play</span>
          </div>
        ) : (
          <div className="flex items-start gap-2 text-sm text-ys-warning">
            <DynamicIcon name="CircleDashed" className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="text-xs leading-relaxed">
              Still needs {readiness.missing.join(", ")}
            </span>
          </div>
        )}
      </div>

      {/* Section tabs */}
      <div className="flex flex-wrap gap-1 px-3 py-2 border-b border-ys-border shrink-0">
        {sections.map((section) => (
          <button
            key={section.id}
            onClick={() => setOpenSection(section.id)}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
              openSection === section.id
                ? "bg-ys-accent/20 text-ys-accent"
                : "text-ys-muted hover:text-ys-text hover:bg-ys-surface-2"
            }`}
          >
            <DynamicIcon name={section.icon} className="w-3.5 h-3.5" />
            {section.label}
            {section.count !== undefined && section.count > 0 && (
              <span className="text-[10px] text-ys-muted">{section.count}</span>
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
            <label className="flex items-center gap-2 text-sm text-ys-muted cursor-pointer">
              <input
                type="checkbox"
                checked={draft.nsfw}
                onChange={(e) => onChange({ nsfw: e.target.checked })}
                className="rounded border-ys-border bg-ys-surface"
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
              <span className="block text-[11px] uppercase tracking-wide text-ys-muted mb-2">
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
                        className="p-2 rounded-md hover:bg-ys-danger/25 text-ys-muted hover:text-ys-danger transition-colors shrink-0"
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
              <Field label="Use meters, tracks and action rolls">
                <select
                  className={inputClass}
                  value={
                    draft.systemState?.usesSystemTools === undefined
                      ? "auto"
                      : draft.systemState.usesSystemTools
                        ? "on"
                        : "off"
                  }
                  onChange={(e) => {
                    const v = e.target.value;
                    onChange({
                      systemState: withSystemToolsSwitch(
                        draft.systemState,
                        v === "auto" ? undefined : v === "on",
                      ),
                    });
                  }}
                >
                  <option value="auto">
                    Automatic (
                    {resolvedSystem.system
                      ? `on: ${resolvedSystem.system.title} notes found`
                      : "off: no built-in system's notes here"}
                    )
                  </option>
                  <option value="on">On</option>
                  <option value="off">Off</option>
                </select>
              </Field>
              <p className="text-[11px] text-ys-muted mt-1">
                Offers the GM meters, progress tracks, session ends and the
                action roll. Automatic turns them on when this adventure
                carries a built-in system&apos;s rules notes.
              </p>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[11px] uppercase tracking-wide text-ys-muted">
                  Mechanics
                </span>
                <span className="text-[11px] text-ys-muted">
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
              <span className="block text-[11px] uppercase tracking-wide text-ys-muted mb-2">
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
                <span className="block text-[11px] uppercase tracking-wide text-ys-muted mb-2">
                  Pre-made characters
                </span>
                <div className="space-y-2">
                  {draft.presets.map((preset) => (
                    <div
                      key={preset.id}
                      className="bg-ys-surface-2 border border-ys-border rounded-xl p-3 flex items-start gap-3"
                    >
                      <span className="text-xl shrink-0">{preset.icon}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-ys-text truncate">
                          {preset.name}
                        </p>
                        <p className="text-xs text-ys-muted line-clamp-2">
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
                        className="p-1.5 rounded-md hover:bg-ys-danger/25 text-ys-muted hover:text-ys-danger transition-colors shrink-0"
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
                  className="bg-ys-surface-2 border border-ys-border rounded-xl p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {npc.symbol && <span>{npc.symbol}</span>}
                        <span className="font-medium text-ys-text text-sm">
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
                      <p className="text-[11px] text-ys-muted mt-0.5">
                        {npc.role}
                        {npc.faction ? ` · ${npc.faction}` : ""}
                      </p>
                      <p className="text-xs text-ys-muted mt-1.5 line-clamp-3">
                        {npc.description}
                      </p>
                      {npc.notes && (
                        <p className="text-[11px] text-ys-warning mt-1.5 line-clamp-2">
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
                      className="p-1.5 rounded-md hover:bg-ys-danger/25 text-ys-muted hover:text-ys-danger transition-colors shrink-0"
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
                  className="bg-ys-surface-2 border border-ys-border rounded-xl p-3 flex items-start justify-between gap-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-ys-text text-sm">
                        {goal.title}
                      </span>
                      {!goal.active && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-ys-surface-2 text-ys-muted">
                          hidden at start
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-ys-muted mt-1">
                      {goal.shortDescription}
                    </p>
                  </div>
                  <button
                    onClick={() =>
                      onChange({
                        goals: draft.goals.filter((g) => g.id !== goal.id),
                      })
                    }
                    className="p-1.5 rounded-md hover:bg-ys-danger/25 text-ys-muted hover:text-ys-danger transition-colors shrink-0"
                  >
                    <DynamicIcon name="Trash2" className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ))}

        {openSection === "campaign" && (
          <CampaignSection
            draft={draft}
            onChange={(campaign) => onChange({ campaign })}
          />
        )}

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
