"use client";

import {
  StoryData,
  Stat,
  Resource,
  InventoryItem,
  StoryLore,
  Relationship,
  AGMTState,
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
  CouchPlayer,
} from "../../misc/structs";
import { useState, useEffect } from "react";
import { useNotification } from "../../misc/NotificationContext";
import { DynamicIcon } from "../../components/DynamicIcon";
import LoreImageGenerator from "../../components/LoreImageGenerator";
import {
  LibraryNote,
  createLibraryNote,
  updateLibraryNote,
  getLibraryNote,
  libraryNoteToStoryLore,
  storyLoreToLibraryNoteFields,
} from "../../misc/localNotesLibraryManager";
import PDFImporter from "../../components/PDFImporter";
import LibraryPickerModal from "../../components/LibraryPickerModal";

export default function LoreEditor({
  lore,
  variables,
  onUpdate,
  couchPlayers,
}: {
  lore: StoryLore[];
  variables: Variable[];
  onUpdate: (lore: StoryLore[]) => void;
  couchPlayers?: CouchPlayer[];
}) {
  const [localLore, setLocalLore] = useState([...lore]);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [draggedLoreIndex, setDraggedLoreIndex] = useState<number | null>(null);
  const [editingLoreIndex, setEditingLoreIndex] = useState<number | null>(null);
  const [editLore, setEditLore] = useState<Partial<StoryLore>>({});
  const [editLoreAdvancedExpanded, setEditLoreAdvancedExpanded] =
    useState(false);
  const [editLoreTag, setEditLoreTag] = useState("");
  const { addNotification } = useNotification();

  // Import from Notes Library
  const [showLibraryPicker, setShowLibraryPicker] = useState(false);
  // Per-entry library sync state (index -> "pushing" | "pulling" | "saving")
  const [librarySyncBusy, setLibrarySyncBusy] = useState<
    Record<number, "pushing" | "pulling" | "saving">
  >({});

  // Drag-and-drop handlers for lore
  const handleLoreDragStart = (index: number) => {
    setDraggedLoreIndex(index);
  };

  const handleLoreDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedLoreIndex === null || draggedLoreIndex === index) return;

    const items = [...localLore];
    const draggedItem = items[draggedLoreIndex];
    items.splice(draggedLoreIndex, 1);
    items.splice(index, 0, draggedItem);

    setLocalLore(items);
    setDraggedLoreIndex(index);
    onUpdate(items);
  };

  const handleLoreDragEnd = () => {
    setDraggedLoreIndex(null);
  };

  // Arrow button handlers for lore
  const moveLoreUp = (index: number) => {
    if (index === 0) return;
    const items = [...localLore];
    [items[index - 1], items[index]] = [items[index], items[index - 1]];
    setLocalLore(items);
    onUpdate(items);
  };

  const moveLoreDown = (index: number) => {
    if (index === localLore.length - 1) return;
    const items = [...localLore];
    [items[index], items[index + 1]] = [items[index + 1], items[index]];
    setLocalLore(items);
    onUpdate(items);
  };

  // Edit mode handlers for lore
  const startEditLore = (index: number) => {
    setEditingLoreIndex(index);
    setEditLore({ ...localLore[index] });
  };

  const cancelEditLore = () => {
    setEditingLoreIndex(null);
    setEditLore({});
  };

  const saveEditLore = (index: number) => {
    const items = [...localLore];
    const original = items[index];
    // Check if content or title changed - mark as needing re-embedding
    const contentChanged =
      (editLore.content !== undefined &&
        editLore.content !== original.content) ||
      (editLore.title !== undefined && editLore.title !== original.title);
    items[index] = {
      ...items[index],
      ...editLore,
      ...(contentChanged ? { embedded: false } : {}),
    };
    setLocalLore(items);
    onUpdate(items);
    setEditingLoreIndex(null);
    setEditLore({});
  };

  const updateLore = (index: number, field: keyof StoryLore, value: any) => {
    const updated = [...localLore];
    (updated[index] as any)[field] = value;
    // Mark as needing re-embedding if content or title changed
    if (field === "content" || field === "title") {
      updated[index].embedded = false;
    }
    setLocalLore(updated);
    onUpdate(updated);
  };

  const addLore = () => {
    const newLore: StoryLore = {
      title: "New Lore Entry",
      content: "",
      relatedCharacters: [],
      relatedLocations: [],
      secrtet: false,
      keys: [],
      thumbnailUrl: "",
      on: true,
      alwaysOn: false,
      on_triggers: [],
      off_triggers: [],
      trigger_lores: [],
      untrigger_lores: [],
      embedded: false, // Mark new entries for embedding
      tags: [],
      folder: "",
    };
    const updated = [...localLore, newLore];
    setLocalLore(updated);
    onUpdate(updated);
  };

  const removeLore = (index: number) => {
    const updated = localLore.filter((_, i) => i !== index);
    setLocalLore(updated);
    onUpdate(updated);
  };

  // Append notes picked from the shared LibraryPickerModal into this story's
  // lore, tagged with libraryNoteId so they stay linked for push/pull. Random
  // tables come through here too - they're `type: "table"` notes now, not a
  // separate list with its own import path.
  const importSelectedLibraryNotes = (notes: LibraryNote[]) => {
    if (notes.length === 0) return;
    const updated = [...localLore, ...notes.map(libraryNoteToStoryLore)];
    setLocalLore(updated);
    onUpdate(updated);
    addNotification(
      `Imported ${notes.length} note${notes.length === 1 ? "" : "s"} from library`,
      "success",
    );
    setShowLibraryPicker(false);
  };

  // Push this story's edits to the linked library note
  const pushLoreToLibrary = async (index: number) => {
    const item = localLore[index];
    if (!item.libraryNoteId) return;
    setLibrarySyncBusy((prev) => ({ ...prev, [index]: "pushing" }));
    try {
      await updateLibraryNote(item.libraryNoteId, storyLoreToLibraryNoteFields(item));
      addNotification(`Pushed "${item.title}" to your library`, "success");
    } catch (e: any) {
      console.error("Error pushing note to library:", e);
      addNotification(`Failed to push to library: ${e.message}`, "failure");
    } finally {
      setLibrarySyncBusy((prev) => {
        const next = { ...prev };
        delete next[index];
        return next;
      });
    }
  };

  // Pull the latest version of a linked library note back into this story
  const pullLoreFromLibrary = async (index: number) => {
    const item = localLore[index];
    if (!item.libraryNoteId) return;
    setLibrarySyncBusy((prev) => ({ ...prev, [index]: "pulling" }));
    try {
      const note = await getLibraryNote(item.libraryNoteId);
      if (!note) {
        addNotification("That library note no longer exists", "failure");
        return;
      }
      const updated = [...localLore];
      updated[index] = { ...libraryNoteToStoryLore(note), on: item.on };
      setLocalLore(updated);
      onUpdate(updated);
      addNotification(`Pulled latest "${note.title}" from your library`, "success");
    } catch (e: any) {
      console.error("Error pulling note from library:", e);
      addNotification(`Failed to pull from library: ${e.message}`, "failure");
    } finally {
      setLibrarySyncBusy((prev) => {
        const next = { ...prev };
        delete next[index];
        return next;
      });
    }
  };

  // Save an unlinked story-authored note into the global library
  const saveLoreToLibrary = async (index: number) => {
    const item = localLore[index];
    setLibrarySyncBusy((prev) => ({ ...prev, [index]: "saving" }));
    try {
      const note = await createLibraryNote(storyLoreToLibraryNoteFields(item));
      const updated = [...localLore];
      updated[index] = { ...item, libraryNoteId: note.id };
      setLocalLore(updated);
      onUpdate(updated);
      addNotification(`Saved "${item.title}" to your notes library`, "success");
    } catch (e: any) {
      console.error("Error saving note to library:", e);
      addNotification(`Failed to save to library: ${e.message}`, "failure");
    } finally {
      setLibrarySyncBusy((prev) => {
        const next = { ...prev };
        delete next[index];
        return next;
      });
    }
  };

  // Handle a PDF/OCR import: add to this story's live lore/tables AND save to
  // the persistent notes/tables libraries for reuse in other stories.
  const handlePDFImportComplete = async (data: {
    lore: StoryLore[];
    mechanicNotes: StoryLore[];
    tableNotes: StoryLore[];
    summary: string;
  }) => {
    // Tables arrive as notes like everything else the import produced, so
    // they take the same route into the story and into the library.
    const allNotes = [...data.lore, ...data.mechanicNotes, ...data.tableNotes];

    let savedCount = 0;
    const linkedNotes: StoryLore[] = [];
    for (const note of allNotes) {
      try {
        const libraryNote = await createLibraryNote({
          ...storyLoreToLibraryNoteFields(note),
          source: "ocr",
        });
        linkedNotes.push({ ...note, libraryNoteId: libraryNote.id });
        savedCount++;
      } catch (e) {
        console.error("Error saving OCR note to library:", e);
        linkedNotes.push(note);
      }
    }

    if (linkedNotes.length > 0) {
      const updated = [...localLore, ...linkedNotes];
      setLocalLore(updated);
      onUpdate(updated);
    }

    if (allNotes.length === 0) return;

    const tableCount = data.tableNotes.length;
    const parts = [
      `${allNotes.length} note${allNotes.length === 1 ? "" : "s"} (saved ${savedCount} to library)`,
      tableCount > 0
        ? `${tableCount} of them table${tableCount === 1 ? "" : "s"}`
        : null,
    ].filter(Boolean);

    addNotification(`Added ${parts.join(", ")} to this story`, "success");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h4 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
          <span className="p-1.5 rounded-lg bg-purple-500/10 ring-1 ring-purple-400/20">
            <DynamicIcon name="Book" className="w-4 h-4 text-purple-300" />
          </span>
          Lore Entries ({localLore.length})
        </h4>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowLibraryPicker(true)}
            className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-blue-100 text-sm rounded-lg transition-colors flex items-center gap-1.5"
          >
            <DynamicIcon name="Library" className="w-4 h-4" />
            Import from Library
          </button>
          <PDFImporter
            onImportComplete={handlePDFImportComplete}
            buttonText="Import from PDF"
            compact
          />
          <button
            onClick={addLore}
            className="px-3 py-1.5 bg-linear-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white text-sm font-medium rounded-lg shadow-md shadow-emerald-950/40 transition-all"
          >
            + Add Lore
          </button>
        </div>
      </div>
      <div className="space-y-3">
        {localLore.map((loreItem, index) =>
          editingLoreIndex === index ? (
            <div
              key={index}
              className="p-4 bg-white/[0.04] backdrop-blur-xl border border-purple-400/30 rounded-2xl shadow-[0_0_20px_rgba(168,85,247,0.1)]"
            >
              <div className="space-y-3">
                <input
                  type="text"
                  value={editLore.title || ""}
                  onChange={(e) =>
                    setEditLore({ ...editLore, title: e.target.value })
                  }
                  placeholder="Note title"
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white font-semibold focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-400/40 transition-colors"
                />
                <textarea
                  value={editLore.content || ""}
                  onChange={(e) =>
                    setEditLore({ ...editLore, content: e.target.value })
                  }
                  placeholder="Note content (supports Markdown)"
                  className="w-full h-32 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white resize-none focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-400/40 transition-colors"
                />
                {/* Note Type Selector */}
                <div>
                  <label className="block text-sm font-semibold text-blue-200 mb-2">
                    <DynamicIcon
                      name="FileType"
                      className="inline-block w-4 h-4 mr-1"
                    />
                    Note Type
                  </label>
                  <select
                    value={editLore.type || "lore"}
                    onChange={(e) =>
                      setEditLore({
                        ...editLore,
                        type: e.target.value as
                          | "lore"
                          | "mechanics"
                          | "character_sheet"
                          | "table",
                      })
                    }
                    className="w-full px-3 py-2 text-sm bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-400/40 transition-colors"
                  >
                    <option value="lore">📜 Lore (Standard note)</option>
                    <option value="character_sheet">
                      🧙 Character Sheet (Highest priority - character details)
                    </option>
                    <option value="mechanics">⚙️ Mechanics (Game rules)</option>
                    <option value="table">🎲 Table (Random table to roll on)</option>
                  </select>
                  <p className="text-xs text-blue-300/60 mt-1">
                    {editLore.type === "character_sheet"
                      ? "Character sheet notes appear at the very top of AI context for character details."
                      : editLore.type === "mechanics"
                        ? "Mechanics notes are prioritized and always visible to the AI for game rules."
                        : editLore.type === "table"
                          ? "Name a die and list what each number gives (e.g. \"Roll 1d6:\" then \"1. ...\"). The GM rolls it and reads off the result, so anything else you write here - when to roll it, what the results mean - is context it gets to use."
                          : "Standard lore notes are shown based on triggers and visibility."}
                  </p>
                </div>
                {/* Owner assignment - only meaningful for a character sheet
                    in a couch co-op story with more than one player, since a
                    story can genuinely have multiple distinct character
                    sheets (see StoryLore.ownerCouchPlayerId). */}
                {editLore.type === "character_sheet" &&
                  couchPlayers &&
                  couchPlayers.length > 1 && (
                    <div>
                      <label className="block text-sm font-semibold text-blue-200 mb-2">
                        <DynamicIcon
                          name="User"
                          className="inline-block w-4 h-4 mr-1"
                        />
                        Belongs To
                      </label>
                      <select
                        value={editLore.ownerCouchPlayerId || ""}
                        onChange={(e) =>
                          setEditLore({
                            ...editLore,
                            ownerCouchPlayerId: e.target.value || undefined,
                          })
                        }
                        className="w-full px-3 py-2 text-sm bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-400/40 transition-colors"
                      >
                        <option value="">Shared / unspecified</option>
                        {couchPlayers.map((player) => (
                          <option key={player.id} value={player.id}>
                            {player.name}
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-blue-300/60 mt-1">
                        Links this character sheet to a specific player. Leave
                        unspecified if everyone shares one sheet.
                      </p>
                    </div>
                  )}
                <LoreImageGenerator
                  loreTitle={editLore.title}
                  loreContent={editLore.content}
                  currentThumbnailUrl={editLore.thumbnailUrl}
                  onImageGenerated={(url) =>
                    setEditLore({
                      ...editLore,
                      thumbnailUrl: url,
                    })
                  }
                />
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-sm text-blue-200">
                    <input
                      type="checkbox"
                      checked={editLore.secrtet ?? false}
                      onChange={(e) =>
                        setEditLore({ ...editLore, secrtet: e.target.checked })
                      }
                      className="rounded accent-purple-500"
                    />
                    <span>
                      <DynamicIcon
                        name="Lock"
                        className="inline-block w-3 h-3 mr-1"
                      />
                      Secret Lore (hidden until discovered)
                    </span>
                  </label>
                  <label className="flex items-center gap-2 text-sm text-blue-200">
                    <input
                      type="checkbox"
                      checked={editLore.on !== false}
                      onChange={(e) =>
                        setEditLore({ ...editLore, on: e.target.checked })
                      }
                      className="rounded accent-purple-500"
                    />
                    <span>
                      <DynamicIcon
                        name="CheckCircle"
                        className="inline-block w-4 h-4 mr-1 text-green-600"
                      />
                      Enabled
                    </span>
                  </label>
                  <label className="flex items-center gap-2 text-sm text-blue-200">
                    <input
                      type="checkbox"
                      checked={!!editLore.alwaysOn}
                      onChange={(e) =>
                        setEditLore({ ...editLore, alwaysOn: e.target.checked })
                      }
                      className="rounded accent-purple-500"
                    />
                    <span>
                      <DynamicIcon
                        name="Circle"
                        className="inline-block w-4 h-4 mr-1 text-blue-500"
                      />
                      Always On
                    </span>
                  </label>
                </div>

                {/* Folder and Tags for organization */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-blue-200 mb-2">
                      <DynamicIcon
                        name="Folder"
                        className="inline-block w-4 h-4 mr-1 text-yellow-500"
                      />
                      Folder
                    </label>
                    <input
                      type="text"
                      value={editLore.folder || ""}
                      onChange={(e) =>
                        setEditLore({ ...editLore, folder: e.target.value })
                      }
                      placeholder="e.g., Characters, Locations..."
                      list="lore-folders-list"
                      className="w-full px-3 py-2 text-sm bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-400/40 transition-colors"
                    />
                    <datalist id="lore-folders-list">
                      {[
                        ...new Set(
                          localLore.map((l) => l.folder).filter(Boolean),
                        ),
                      ].map((folder) => (
                        <option key={folder} value={folder} />
                      ))}
                    </datalist>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-blue-200 mb-2">
                      <DynamicIcon
                        name="Tag"
                        className="inline-block w-4 h-4 mr-1 text-purple-400"
                      />
                      Tags
                    </label>
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={editLoreTag}
                          onChange={(e) => setEditLoreTag(e.target.value)}
                          placeholder="Add tag..."
                          list="lore-tags-list"
                          className="flex-1 px-3 py-2 text-sm bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-400/40 transition-colors"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              const tag = editLoreTag.trim();
                              if (tag && !(editLore.tags || []).includes(tag)) {
                                setEditLore({
                                  ...editLore,
                                  tags: [...(editLore.tags || []), tag],
                                });
                                setEditLoreTag("");
                              }
                            }
                          }}
                        />
                        <datalist id="lore-tags-list">
                          {[
                            ...new Set(localLore.flatMap((l) => l.tags || [])),
                          ].map((tag) => (
                            <option key={tag} value={tag} />
                          ))}
                        </datalist>
                        <button
                          onClick={() => {
                            const tag = editLoreTag.trim();
                            if (tag && !(editLore.tags || []).includes(tag)) {
                              setEditLore({
                                ...editLore,
                                tags: [...(editLore.tags || []), tag],
                              });
                              setEditLoreTag("");
                            }
                          }}
                          className="px-3 py-2 bg-purple-500/10 hover:bg-purple-500/20 text-purple-200 border border-purple-400/20 text-sm rounded-lg transition-colors"
                        >
                          Add
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {(editLore.tags || []).map((tag, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-1 bg-purple-500/10 text-purple-300 border border-purple-400/20 rounded-full text-xs flex items-center gap-1"
                          >
                            <DynamicIcon name="Tag" className="w-3 h-3" />
                            {tag}
                            <button
                              onClick={() =>
                                setEditLore({
                                  ...editLore,
                                  tags: (editLore.tags || []).filter(
                                    (_, i) => i !== idx,
                                  ),
                                })
                              }
                              className="hover:text-purple-100 transition-colors"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* ON/OFF Trigger Words */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-blue-200 mb-2">
                      <DynamicIcon
                        name="CheckCircle"
                        className="inline-block w-4 h-4 mr-1 text-green-600"
                      />
                      ON Trigger Words
                    </label>
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="e.g., Found the Ancient Map"
                          className="flex-1 px-3 py-2 text-sm bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-400/40 transition-colors"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              const input = e.currentTarget;
                              const value = input.value.trim();
                              if (
                                value &&
                                !(editLore.on_triggers || []).includes(value)
                              ) {
                                setEditLore({
                                  ...editLore,
                                  on_triggers: [
                                    ...(editLore.on_triggers || []),
                                    value,
                                  ],
                                });
                                input.value = "";
                              }
                            }
                          }}
                        />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {(editLore.on_triggers || []).map((trigger, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-1 bg-green-500/10 text-green-300 border border-green-400/20 rounded-full text-xs flex items-center gap-1"
                          >
                            <DynamicIcon
                              name="CheckCircle"
                              className="w-3 h-3"
                            />
                            {trigger}
                            <button
                              onClick={() =>
                                setEditLore({
                                  ...editLore,
                                  on_triggers: (
                                    editLore.on_triggers || []
                                  ).filter((_, i) => i !== idx),
                                })
                              }
                              className="hover:text-green-100 transition-colors"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-blue-200 mb-2">
                      <DynamicIcon
                        name="XCircle"
                        className="inline-block w-4 h-4 mr-1 text-red-600"
                      />
                      OFF Trigger Words
                    </label>
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="e.g., Destroyed the Map"
                          className="flex-1 px-3 py-2 text-sm bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-400/40 transition-colors"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              const input = e.currentTarget;
                              const value = input.value.trim();
                              if (
                                value &&
                                !(editLore.off_triggers || []).includes(value)
                              ) {
                                setEditLore({
                                  ...editLore,
                                  off_triggers: [
                                    ...(editLore.off_triggers || []),
                                    value,
                                  ],
                                });
                                input.value = "";
                              }
                            }
                          }}
                        />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {(editLore.off_triggers || []).map((trigger, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-1 bg-red-500/10 text-red-300 border border-red-400/20 rounded-full text-xs flex items-center gap-1"
                          >
                            <DynamicIcon name="XCircle" className="w-3 h-3" />
                            {trigger}
                            <button
                              onClick={() =>
                                setEditLore({
                                  ...editLore,
                                  off_triggers: (
                                    editLore.off_triggers || []
                                  ).filter((_, i) => i !== idx),
                                })
                              }
                              className="hover:text-red-100 transition-colors"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Advanced Triggers Section (Expandable) */}
                <div className="border border-white/10 rounded-xl overflow-hidden">
                  <button
                    onClick={() =>
                      setEditLoreAdvancedExpanded(!editLoreAdvancedExpanded)
                    }
                    className="w-full px-4 py-3 flex items-center justify-between bg-white/[0.03] hover:bg-white/[0.06] transition-colors"
                  >
                    <span className="text-sm font-semibold text-blue-200">
                      <DynamicIcon
                        name="Settings"
                        className="inline-block w-4 h-4 mr-1"
                      />
                      Advanced Section
                    </span>
                    <span className="text-blue-300/50">
                      {editLoreAdvancedExpanded ? (
                        <DynamicIcon name="ChevronDown" className="w-4 h-4" />
                      ) : (
                        <DynamicIcon name="ChevronRight" className="w-4 h-4" />
                      )}
                    </span>
                  </button>

                  {editLoreAdvancedExpanded && (
                    <div className="p-4 space-y-4">
                      {/* Lore-based Triggers */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-semibold text-blue-200 mb-2">
                            <DynamicIcon
                              name="CheckCircle"
                              className="inline-block w-4 h-4 mr-1 text-green-600"
                            />
                            Lores that turn this ON
                          </label>
                          <div className="max-h-40 overflow-y-auto border border-white/10 rounded-lg p-2 bg-white/[0.03]">
                            {localLore.filter((_, i) => i !== index).length ===
                            0 ? (
                              <p className="text-xs text-blue-300/50 italic">
                                No other lore entries.
                              </p>
                            ) : (
                              localLore
                                .filter((_, i) => i !== index)
                                .map((loreEntry, loreIdx) => (
                                  <label
                                    key={loreIdx}
                                    className="flex items-center gap-2 px-2 py-1 hover:bg-white/5 rounded-lg cursor-pointer transition-colors"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={(
                                        editLore.trigger_lores || []
                                      ).includes(loreEntry.title)}
                                      onChange={(e) => {
                                        const current =
                                          editLore.trigger_lores || [];
                                        setEditLore({
                                          ...editLore,
                                          trigger_lores: e.target.checked
                                            ? [...current, loreEntry.title]
                                            : current.filter(
                                                (t) => t !== loreEntry.title,
                                              ),
                                        });
                                      }}
                                      className="w-4 h-4 rounded accent-green-500"
                                    />
                                    <span className="text-xs text-white">
                                      {loreEntry.title}
                                    </span>
                                  </label>
                                ))
                            )}
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-blue-200 mb-2">
                            <DynamicIcon
                              name="XCircle"
                              className="inline-block w-4 h-4 mr-1 text-red-600"
                            />
                            Lores that turn this OFF
                          </label>
                          <div className="max-h-40 overflow-y-auto border border-white/10 rounded-lg p-2 bg-white/[0.03]">
                            {localLore.filter((_, i) => i !== index).length ===
                            0 ? (
                              <p className="text-xs text-blue-300/50 italic">
                                No other lore entries.
                              </p>
                            ) : (
                              localLore
                                .filter((_, i) => i !== index)
                                .map((loreEntry, loreIdx) => (
                                  <label
                                    key={loreIdx}
                                    className="flex items-center gap-2 px-2 py-1 hover:bg-white/5 rounded-lg cursor-pointer transition-colors"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={(
                                        editLore.untrigger_lores || []
                                      ).includes(loreEntry.title)}
                                      onChange={(e) => {
                                        const current =
                                          editLore.untrigger_lores || [];
                                        setEditLore({
                                          ...editLore,
                                          untrigger_lores: e.target.checked
                                            ? [...current, loreEntry.title]
                                            : current.filter(
                                                (t) => t !== loreEntry.title,
                                              ),
                                        });
                                      }}
                                      className="w-4 h-4 rounded accent-red-500"
                                    />
                                    <span className="text-xs text-white">
                                      {loreEntry.title}
                                    </span>
                                  </label>
                                ))
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Variable Triggers (Boolean) */}
                      {variables.filter((v) => v.type === "boolean").length >
                        0 && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                          <div>
                            <label className="block text-sm font-semibold text-blue-200 mb-2">
                              <DynamicIcon
                                name="ToggleRight"
                                className="inline-block w-4 h-4 mr-1 text-cyan-500"
                              />
                              Variables that turn this ON (when true)
                            </label>
                            <div className="max-h-40 overflow-y-auto border border-white/10 rounded-lg p-2 bg-white/[0.03]">
                              {variables
                                .filter((v) => v.type === "boolean")
                                .map((variable) => (
                                  <label
                                    key={variable.id}
                                    className="flex items-center gap-2 px-2 py-1 hover:bg-white/5 rounded-lg cursor-pointer transition-colors"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={(
                                        editLore.var_on_triggers || []
                                      ).includes(variable.name)}
                                      onChange={(e) => {
                                        const current =
                                          editLore.var_on_triggers || [];
                                        setEditLore({
                                          ...editLore,
                                          var_on_triggers: e.target.checked
                                            ? [...current, variable.name]
                                            : current.filter(
                                                (n) => n !== variable.name,
                                              ),
                                        });
                                      }}
                                      className="w-4 h-4 rounded accent-cyan-500"
                                    />
                                    <span className="text-xs text-white">
                                      {variable.name}
                                    </span>
                                  </label>
                                ))}
                            </div>
                          </div>
                          <div>
                            <label className="block text-sm font-semibold text-blue-200 mb-2">
                              <DynamicIcon
                                name="ToggleLeft"
                                className="inline-block w-4 h-4 mr-1 text-orange-500"
                              />
                              Variables that turn this OFF (when true)
                            </label>
                            <div className="max-h-40 overflow-y-auto border border-white/10 rounded-lg p-2 bg-white/[0.03]">
                              {variables
                                .filter((v) => v.type === "boolean")
                                .map((variable) => (
                                  <label
                                    key={variable.id}
                                    className="flex items-center gap-2 px-2 py-1 hover:bg-white/5 rounded-lg cursor-pointer transition-colors"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={(
                                        editLore.var_off_triggers || []
                                      ).includes(variable.name)}
                                      onChange={(e) => {
                                        const current =
                                          editLore.var_off_triggers || [];
                                        setEditLore({
                                          ...editLore,
                                          var_off_triggers: e.target.checked
                                            ? [...current, variable.name]
                                            : current.filter(
                                                (n) => n !== variable.name,
                                              ),
                                        });
                                      }}
                                      className="w-4 h-4 rounded accent-orange-500"
                                    />
                                    <span className="text-xs text-white">
                                      {variable.name}
                                    </span>
                                  </label>
                                ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => saveEditLore(index)}
                    className="px-4 py-2 bg-linear-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white rounded-lg shadow-md shadow-emerald-950/40 transition-all"
                  >
                    Save
                  </button>
                  <button
                    onClick={cancelEditLore}
                    className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-blue-200 rounded-lg transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div
              key={index}
              draggable
              onDragStart={() => handleLoreDragStart(index)}
              onDragOver={(e) => handleLoreDragOver(e, index)}
              onDragEnd={handleLoreDragEnd}
              className={`p-3 sm:p-4 bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-xl cursor-move hover:bg-white/[0.05] transition-colors ${
                draggedLoreIndex === index ? "opacity-50" : ""
              }`}
            >
              <div className="flex items-start gap-2 sm:gap-3">
                <span className="text-blue-300/40 select-none mt-1">
                  <DynamicIcon
                    name="GripVertical"
                    className="w-4 h-4 sm:w-5 sm:h-5"
                  />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-white flex items-center gap-2">
                    {loreItem.secrtet && (
                      <DynamicIcon
                        name="Lock"
                        className="w-4 h-4 text-blue-300/50"
                      />
                    )}
                    {loreItem.title}
                    {/* On/Off Toggle */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const updated = [...localLore];
                        updated[index] = { ...loreItem, on: !loreItem.on };
                        setLocalLore(updated);
                        onUpdate(updated);
                      }}
                      className={`px-2 py-1 rounded-full text-xs font-semibold transition-colors border ${
                        loreItem.on
                          ? "bg-green-500/15 text-green-300 border-green-400/20 hover:bg-green-500/25"
                          : "bg-white/5 text-blue-300/50 border-white/10 hover:bg-white/10"
                      }`}
                      title={
                        loreItem.on ? "Note is enabled" : "Note is disabled"
                      }
                    >
                      {loreItem.on ? "ON" : "OFF"}
                    </button>
                    {/* Type Badge */}
                    {loreItem.type && loreItem.type !== "lore" && (
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${
                          loreItem.type === "character_sheet"
                            ? "bg-purple-500/15 text-purple-300 border-purple-400/20"
                            : "bg-amber-500/15 text-amber-300 border-amber-400/20"
                        }`}
                        title={
                          loreItem.type === "character_sheet"
                            ? "Character sheet - highest priority"
                            : "Mechanics/Rules"
                        }
                      >
                        {loreItem.type === "character_sheet"
                          ? "🧙 CHAR"
                          : "⚙️ RULES"}
                      </span>
                    )}
                    {loreItem.type === "character_sheet" &&
                      loreItem.ownerCouchPlayerId &&
                      couchPlayers && (
                        <span
                          className="px-2 py-0.5 rounded-full text-xs font-semibold text-white"
                          style={{
                            backgroundColor:
                              couchPlayers.find(
                                (p) => p.id === loreItem.ownerCouchPlayerId,
                              )?.color || "#6b7280",
                          }}
                          title="This character sheet belongs to this player"
                        >
                          {couchPlayers.find(
                            (p) => p.id === loreItem.ownerCouchPlayerId,
                          )?.name || "Unknown player"}
                        </span>
                      )}
                  </div>
                  {loreItem.thumbnailUrl && (
                    <img
                      src={loreItem.thumbnailUrl}
                      alt={loreItem.title}
                      className="mt-2 w-20 h-20 object-cover rounded-lg border border-white/10"
                    />
                  )}
                  <div className="text-sm text-blue-200/60 mt-1 line-clamp-2">
                    {loreItem.content}
                  </div>
                  {loreItem.on_triggers && loreItem.on_triggers.length > 0 && (
                    <div className="text-xs text-green-400/80 mt-1 flex items-center gap-1">
                      <strong className="flex items-center gap-1">
                        <DynamicIcon name="CheckCircle" className="w-3 h-3" />{" "}
                        ON Triggers:
                      </strong>{" "}
                      {loreItem.on_triggers.join(", ")}
                    </div>
                  )}
                  {loreItem.off_triggers &&
                    loreItem.off_triggers.length > 0 && (
                      <div className="text-xs text-red-400/80 mt-1 flex items-center gap-1">
                        <strong className="flex items-center gap-1">
                          <DynamicIcon name="XCircle" className="w-3 h-3" /> OFF
                          Triggers:
                        </strong>{" "}
                        {loreItem.off_triggers.join(", ")}
                      </div>
                    )}
                  {loreItem.var_on_triggers &&
                    loreItem.var_on_triggers.length > 0 && (
                      <div className="text-xs text-cyan-400/80 mt-1 flex items-center gap-1">
                        <strong className="flex items-center gap-1">
                          <DynamicIcon name="ToggleRight" className="w-3 h-3" />{" "}
                          Vars turning ON:
                        </strong>{" "}
                        {loreItem.var_on_triggers.join(", ")}
                      </div>
                    )}
                  {loreItem.var_off_triggers &&
                    loreItem.var_off_triggers.length > 0 && (
                      <div className="text-xs text-orange-400/80 mt-1 flex items-center gap-1">
                        <strong className="flex items-center gap-1">
                          <DynamicIcon name="ToggleLeft" className="w-3 h-3" />{" "}
                          Vars turning OFF:
                        </strong>{" "}
                        {loreItem.var_off_triggers.join(", ")}
                      </div>
                    )}
                </div>
                {/* Controls - inline on desktop, wrap on mobile */}
                <div className="flex items-center gap-1.5 sm:gap-2 mt-2 sm:mt-0 flex-wrap sm:flex-nowrap">
                  <div className="flex gap-0.5">
                    <button
                      onClick={() => moveLoreUp(index)}
                      disabled={index === 0}
                      className="w-7 h-7 sm:w-8 sm:h-8 bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed text-blue-200 border border-white/10 rounded-lg flex items-center justify-center transition-colors"
                      title="Move up"
                    >
                      <DynamicIcon
                        name="ChevronUp"
                        className="w-3.5 h-3.5 sm:w-4 sm:h-4"
                      />
                    </button>
                    <button
                      onClick={() => moveLoreDown(index)}
                      disabled={index === localLore.length - 1}
                      className="w-7 h-7 sm:w-8 sm:h-8 bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed text-blue-200 border border-white/10 rounded-lg flex items-center justify-center transition-colors"
                      title="Move down"
                    >
                      <DynamicIcon
                        name="ChevronDown"
                        className="w-3.5 h-3.5 sm:w-4 sm:h-4"
                      />
                    </button>
                  </div>
                  <div className="flex gap-0.5">
                    {loreItem.libraryNoteId ? (
                      <>
                        <button
                          onClick={() => pushLoreToLibrary(index)}
                          disabled={!!librarySyncBusy[index]}
                          className="w-7 h-7 sm:w-8 sm:h-8 bg-indigo-500/10 hover:bg-indigo-500/20 disabled:opacity-40 text-indigo-200 border border-indigo-400/20 rounded-lg flex items-center justify-center transition-colors"
                          title="Push this version to your notes library"
                        >
                          <DynamicIcon
                            name="UploadCloud"
                            className="w-3.5 h-3.5 sm:w-4 sm:h-4"
                          />
                        </button>
                        <button
                          onClick={() => pullLoreFromLibrary(index)}
                          disabled={!!librarySyncBusy[index]}
                          className="w-7 h-7 sm:w-8 sm:h-8 bg-indigo-500/10 hover:bg-indigo-500/20 disabled:opacity-40 text-indigo-200 border border-indigo-400/20 rounded-lg flex items-center justify-center transition-colors"
                          title="Pull the latest version from your notes library"
                        >
                          <DynamicIcon
                            name="DownloadCloud"
                            className="w-3.5 h-3.5 sm:w-4 sm:h-4"
                          />
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => saveLoreToLibrary(index)}
                        disabled={!!librarySyncBusy[index]}
                        className="w-7 h-7 sm:w-8 sm:h-8 bg-purple-500/10 hover:bg-purple-500/20 disabled:opacity-40 text-purple-200 border border-purple-400/20 rounded-lg flex items-center justify-center transition-colors"
                        title="Save to your notes library for reuse in other stories"
                      >
                        <DynamicIcon
                          name="Bookmark"
                          className="w-3.5 h-3.5 sm:w-4 sm:h-4"
                        />
                      </button>
                    )}
                  </div>
                  <div className="flex gap-0.5">
                    <button
                      onClick={() => startEditLore(index)}
                      className="w-7 h-7 sm:w-8 sm:h-8 bg-purple-500/10 hover:bg-purple-500/20 text-purple-200 border border-purple-400/20 rounded-lg flex items-center justify-center transition-colors"
                      title="Edit"
                    >
                      <DynamicIcon
                        name="Edit"
                        className="w-3.5 h-3.5 sm:w-4 sm:h-4"
                      />
                    </button>
                    <button
                      onClick={() => removeLore(index)}
                      className="w-7 h-7 sm:w-8 sm:h-8 bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-400/20 rounded-lg flex items-center justify-center transition-colors"
                      title="Remove"
                    >
                      <DynamicIcon
                        name="Trash2"
                        className="w-3.5 h-3.5 sm:w-4 sm:h-4"
                      />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ),
        )}
      </div>

      {/* Import from Library Modal */}
      <LibraryPickerModal
        isOpen={showLibraryPicker}
        onClose={() => setShowLibraryPicker(false)}
        title="Import from Library"
        description="Bring saved notes or tables into this story. Imported notes stay linked so you can push/pull updates later."
        confirmLabel="Add Selected"
        onImport={importSelectedLibraryNotes}
      />
    </div>
  );
}

// Relationships Editor
