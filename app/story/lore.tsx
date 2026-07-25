"use client";

import { StoryData, StoryLore, LoreType } from "../misc/structs";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useState, useMemo } from "react";
import { DynamicIcon } from "../components/DynamicIcon";
import FullScreenView from "../components/FullScreenView";
import LoreImageGenerator from "../components/LoreImageGenerator";
import { preprocessMarkdown } from "../misc/markdownUtils";
import { useNotification } from "../misc/NotificationContext";
import {
  createLibraryNote,
  updateLibraryNote,
  getLibraryNote,
  libraryNoteToStoryLore,
  storyLoreToLibraryNoteFields,
} from "../misc/localNotesLibraryManager";

interface LorePageProps extends StoryData {
  onUpdateLore?: (updatedLore: StoryLore[]) => void;
  // Pre-selects a note by title on mount - set when the player clicks a
  // highlighted mention of this note in the story prose (see page.tsx).
  initialSelectedTitle?: string;
}

// Type configuration with icons and colors
const TYPE_CONFIG: Record<
  LoreType | "all" | "secrets",
  { label: string; icon: string; color: string; bgColor: string }
> = {
  all: {
    label: "All Notes",
    icon: "BookOpen",
    color: "text-blue-300",
    bgColor: "bg-blue-500/20",
  },
  character_sheet: {
    label: "Character",
    icon: "User",
    color: "text-emerald-300",
    bgColor: "bg-emerald-500/20",
  },
  gm_notes: {
    label: "GM Notes",
    icon: "BookMarked",
    color: "text-indigo-300",
    bgColor: "bg-indigo-500/20",
  },
  npc: {
    label: "NPC",
    icon: "Users",
    color: "text-pink-300",
    bgColor: "bg-pink-500/20",
  },
  item: {
    label: "Item",
    icon: "Package",
    color: "text-orange-300",
    bgColor: "bg-orange-500/20",
  },
  location: {
    label: "Location",
    icon: "MapPin",
    color: "text-green-300",
    bgColor: "bg-green-500/20",
  },
  faction: {
    label: "Faction",
    icon: "Shield",
    color: "text-red-300",
    bgColor: "bg-red-500/20",
  },
  event: {
    label: "Event",
    icon: "Calendar",
    color: "text-yellow-300",
    bgColor: "bg-yellow-500/20",
  },
  mechanics: {
    label: "Mechanics",
    icon: "Cog",
    color: "text-cyan-300",
    bgColor: "bg-cyan-500/20",
  },
  gm_plan: {
    label: "Campaign Plan",
    icon: "ClipboardList",
    color: "text-teal-300",
    bgColor: "bg-teal-500/20",
  },
  lore: {
    label: "Lore",
    icon: "Globe",
    color: "text-purple-300",
    bgColor: "bg-purple-500/20",
  },
  secret: {
    label: "Secret",
    icon: "Lock",
    color: "text-amber-300",
    bgColor: "bg-amber-500/20",
  },
  dm_instructions: {
    label: "DM Guide",
    icon: "BookMarked",
    color: "text-indigo-300",
    bgColor: "bg-indigo-500/20",
  },
  story_instructions: {
    label: "Story Guide",
    icon: "Feather",
    color: "text-rose-300",
    bgColor: "bg-rose-500/20",
  },
  secrets: {
    label: "Secrets",
    icon: "Lock",
    color: "text-amber-300",
    bgColor: "bg-amber-500/20",
  },
};

// Order the type filter is displayed in. Only entries with a non-zero count
// (plus "all" and the active filter) are actually rendered.
const FILTER_ORDER: (LoreType | "all" | "secrets")[] = [
  "all",
  "character_sheet",
  "gm_plan",
  "mechanics",
  "npc",
  "location",
  "faction",
  "item",
  "event",
  "lore",
  "gm_notes",
  "dm_instructions",
  "story_instructions",
  "secret",
  "secrets",
];

// Note types that are always kept at the top of the list - the sheet the
// player plays from and the GM's campaign plan.
const AUTO_PINNED_TYPES: LoreType[] = ["character_sheet", "gm_plan"];

export default function LorePage(props: LorePageProps) {
  const { onUpdateLore, initialSelectedTitle, ...storyData } = props;
  const { addNotification } = useNotification();
  const [selectedLore, setSelectedLore] = useState<StoryLore | null>(() =>
    initialSelectedTitle
      ? storyData.lore.find((l) => l.title === initialSelectedTitle) || null
      : null,
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [showImageGen, setShowImageGen] = useState(false);
  const [syncingLibrary, setSyncingLibrary] = useState(false);
  const [selectedType, setSelectedType] = useState<
    LoreType | "all" | "secrets"
  >("all");
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [editType, setEditType] = useState<LoreType>("lore");
  const [editAliases, setEditAliases] = useState("");
  const [isTypeDropdownOpen, setIsTypeDropdownOpen] = useState(false);
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 100;
  const [newNote, setNewNote] = useState<Partial<StoryLore>>({
    title: "",
    content: "",
    type: "lore",
  });

  const isAutoPinned = (loreItem: StoryLore): boolean =>
    AUTO_PINNED_TYPES.includes((loreItem.type || "lore") as LoreType);

  // Mobile is a single-pane master/detail: picking a note swaps the list out
  // for the note itself so there's nothing to scroll past.
  const selectNote = (loreItem: StoryLore) => {
    setSelectedLore(loreItem);
    setIsEditing(false);
    setShowImageGen(false);
    setIsTypeDropdownOpen(false);
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  // Add a new note
  const handleAddNote = () => {
    if (!onUpdateLore || !newNote.title) return;
    const note: StoryLore = {
      title: newNote.title,
      content: newNote.content || "",
      relatedCharacters: [],
      relatedLocations: [],
      secrtet: newNote.type === "secret",
      keys: [],
      type: newNote.type as LoreType,
      on: true,
      alwaysOn: false,
      on_triggers: [],
      off_triggers: [],
      embedded: false,
    };
    onUpdateLore([...storyData.lore, note]);
    setNewNote({ title: "", content: "", type: "lore" });
    setIsAddingNote(false);
    setSelectedLore(note);
  };

  // Toggle pin status for a note
  const handleTogglePin = (loreItem: StoryLore) => {
    if (!onUpdateLore) return;

    // Character sheets are always pinned
    if (isAutoPinned(loreItem)) return;

    const updatedLore = storyData.lore.map((l) =>
      l.title === loreItem.title ? { ...l, pinned: !l.pinned } : l
    );
    onUpdateLore(updatedLore);
    if (selectedLore?.title === loreItem.title) {
      setSelectedLore({ ...loreItem, pinned: !loreItem.pinned });
    }
  };

  // Save a note discovered/written during play into the cross-story Notes
  // Library, or sync an already-linked note with the global library.
  const handleSaveToLibrary = async () => {
    if (!selectedLore || !onUpdateLore || syncingLibrary) return;
    setSyncingLibrary(true);
    try {
      const note = await createLibraryNote(
        storyLoreToLibraryNoteFields(selectedLore)
      );
      const updatedLore = storyData.lore.map((l) =>
        l.title === selectedLore.title
          ? { ...l, libraryNoteId: note.id }
          : l
      );
      onUpdateLore(updatedLore);
      setSelectedLore({ ...selectedLore, libraryNoteId: note.id });
      addNotification(`Saved "${selectedLore.title}" to your notes library`, "success");
    } catch (e: any) {
      console.error("Error saving note to library:", e);
      addNotification(`Failed to save to library: ${e.message}`, "failure");
    } finally {
      setSyncingLibrary(false);
    }
  };

  const handlePushToLibrary = async () => {
    if (!selectedLore?.libraryNoteId || syncingLibrary) return;
    setSyncingLibrary(true);
    try {
      await updateLibraryNote(
        selectedLore.libraryNoteId,
        storyLoreToLibraryNoteFields(selectedLore)
      );
      addNotification(`Pushed "${selectedLore.title}" to your library`, "success");
    } catch (e: any) {
      console.error("Error pushing note to library:", e);
      addNotification(`Failed to push to library: ${e.message}`, "failure");
    } finally {
      setSyncingLibrary(false);
    }
  };

  const handlePullFromLibrary = async () => {
    if (!selectedLore?.libraryNoteId || !onUpdateLore || syncingLibrary) return;
    setSyncingLibrary(true);
    try {
      const note = await getLibraryNote(selectedLore.libraryNoteId);
      if (!note) {
        addNotification("That library note no longer exists", "failure");
        return;
      }
      const refreshed = { ...libraryNoteToStoryLore(note), pinned: selectedLore.pinned };
      const updatedLore = storyData.lore.map((l) =>
        l.title === selectedLore.title ? refreshed : l
      );
      onUpdateLore(updatedLore);
      setSelectedLore(refreshed);
      addNotification(`Pulled latest "${note.title}" from your library`, "success");
    } catch (e: any) {
      console.error("Error pulling note from library:", e);
      addNotification(`Failed to pull from library: ${e.message}`, "failure");
    } finally {
      setSyncingLibrary(false);
    }
  };

  // Filter lore based on search term and type
  const filteredLore = useMemo(() => {
    const filtered = storyData.lore.filter((loreItem) => {
      // Type filter
      if (selectedType === "secrets") {
        if (!loreItem.secrtet) return false;
      } else if (selectedType !== "all") {
        const itemType = loreItem.type || "lore";
        if (itemType !== selectedType) return false;
        // Don't show secrets in type-specific views unless it's the secrets view
        if (loreItem.secrtet) return false;
      } else {
        // "all" view - show non-secrets only
        if (loreItem.secrtet) return false;
      }

      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      return (
        loreItem.title.toLowerCase().includes(term) ||
        (loreItem.content || "").toLowerCase().includes(term) ||
        (loreItem.relatedCharacters || []).some((char) =>
          char.toLowerCase().includes(term)
        ) ||
        (loreItem.relatedLocations || []).some((loc) =>
          loc.toLowerCase().includes(term)
        )
      );
    });
    // Sort: auto-pinned notes (character sheet, then campaign plan) first,
    // then manually pinned notes, then alphabetically.
    const rank = (l: StoryLore) => {
      const autoIdx = AUTO_PINNED_TYPES.indexOf((l.type || "lore") as LoreType);
      if (autoIdx !== -1) return autoIdx;
      return l.pinned ? AUTO_PINNED_TYPES.length : AUTO_PINNED_TYPES.length + 1;
    };
    return filtered.sort((a, b) => {
      const diff = rank(a) - rank(b);
      if (diff !== 0) return diff;
      return a.title.localeCompare(b.title);
    });
  }, [storyData.lore, selectedType, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredLore.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginatedLore = useMemo(
    () =>
      filteredLore.slice(
        (currentPage - 1) * PAGE_SIZE,
        currentPage * PAGE_SIZE
      ),
    [filteredLore, currentPage]
  );

  // Count entries by type. Seeded from TYPE_CONFIG so every filterable type
  // gets its own bucket (gm_plan etc. used to fall through into `lore`).
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    (Object.keys(TYPE_CONFIG) as (LoreType | "all" | "secrets")[]).forEach(
      (key) => {
        counts[key] = 0;
      }
    );

    storyData.lore.forEach((item) => {
      if (item.secrtet) {
        counts.secrets++;
      } else {
        counts.all++;
        const type = item.type || "lore";
        if (counts[type] !== undefined) {
          counts[type]++;
        } else {
          counts.lore++; // Fallback for unknown types
        }
      }
    });

    return counts;
  }, [storyData.lore]);

  // Only offer filters that would actually return something (plus "All" and
  // whatever is currently selected, so the active chip never disappears).
  const visibleFilters = useMemo(
    () =>
      FILTER_ORDER.filter(
        (type) =>
          type === "all" || type === selectedType || typeCounts[type] > 0
      ),
    [typeCounts, selectedType]
  );

  // Get type badge for a lore item
  const getTypeBadge = (loreItem: StoryLore) => {
    const type = loreItem.type || "lore";
    const config = TYPE_CONFIG[type];
    return (
      <span
        className={`text-xs px-1.5 py-0.5 rounded ${config.bgColor} ${config.color} flex items-center gap-1`}
      >
        <DynamicIcon name={config.icon} className="w-3 h-3" />
        <span>{config.label}</span>
      </span>
    );
  };

  // Handle edit save
  const handleSaveEdit = () => {
    if (!selectedLore || !onUpdateLore) return;

    const aliases = editAliases
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean);
    const updatedLore = storyData.lore.map((l) =>
      l.title === selectedLore.title
        ? { ...l, content: editContent, type: editType, aliases }
        : l
    );
    onUpdateLore(updatedLore);
    setSelectedLore({
      ...selectedLore,
      content: editContent,
      type: editType,
      aliases,
    });
    setIsEditing(false);
  };

  // Start editing
  const startEditing = () => {
    if (selectedLore) {
      setEditContent(selectedLore.content || "");
      setEditType(selectedLore.type || "lore");
      setEditAliases((selectedLore.aliases || []).join(", "));
      setIsEditing(true);
    }
  };

  return (
    <div className="w-full space-y-4">
      {/* Header Section - collapsed away on mobile while reading a note so the
          note starts at the top of the screen */}
      <div
        className={`bg-white/[0.04] backdrop-blur-xl rounded-2xl border border-white/10 p-3 sm:p-4 shadow-[0_4px_24px_rgba(0,0,0,0.3)] ${
          selectedLore ? "hidden lg:block" : ""
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
              <div className="p-2 bg-purple-500/10 ring-1 ring-purple-400/20 rounded-lg shrink-0">
                <DynamicIcon
                  name="BookOpen"
                  className="w-5 h-5 text-purple-300"
                />
              </div>
              Story Notes
            </h2>
            <p className="hidden sm:block text-xs text-blue-200/50 mt-1 ml-11">
              Discover the world, characters, and secrets
            </p>
          </div>

          {/* Add Note Button */}
          {onUpdateLore && (
            <button
              onClick={() => setIsAddingNote(true)}
              className="shrink-0 flex items-center gap-2 px-3 py-2 bg-linear-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 rounded-lg text-sm text-white font-medium shadow-md shadow-emerald-950/40 transition-all"
              title="Add note"
            >
              <DynamicIcon name="Plus" className="w-4 h-4" />
              <span className="hidden sm:inline">Add Note</span>
            </button>
          )}
        </div>

        {/* Search + type filter toggle */}
        <div className="flex items-center gap-2 mt-3">
          <div className="relative flex-1 min-w-0">
            <input
              type="text"
              placeholder="Search notes..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(1);
              }}
              className="w-full px-4 py-2.5 pl-10 bg-white/5 border border-white/10 rounded-xl text-white text-sm placeholder-blue-300/40 focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-400/40 transition-all"
            />
            <DynamicIcon
              name="Search"
              className="absolute left-3 top-3 h-4 w-4 text-blue-300/50"
            />
            {searchTerm && (
              <button
                onClick={() => {
                  setSearchTerm("");
                  setPage(1);
                }}
                className="absolute right-3 top-2.5 p-0.5 hover:bg-white/10 rounded"
              >
                <DynamicIcon name="X" className="h-4 w-4 text-blue-300/50" />
              </button>
            )}
          </div>

          {/* Filter toggle - expands an inline panel below instead of an
              overlay dropdown, which used to be painted under the note cards. */}
          <button
            onClick={() => setIsTypeDropdownOpen(!isTypeDropdownOpen)}
            aria-expanded={isTypeDropdownOpen}
            className={`shrink-0 flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm text-white border transition-all ${
              isTypeDropdownOpen || selectedType !== "all"
                ? "bg-white/10 border-purple-400/40"
                : "bg-white/5 border-white/10 hover:bg-white/10"
            }`}
            title="Filter by type"
          >
            <DynamicIcon
              name={TYPE_CONFIG[selectedType].icon}
              className={`w-4 h-4 ${TYPE_CONFIG[selectedType].color}`}
            />
            <span className="hidden sm:inline">
              {TYPE_CONFIG[selectedType].label}
            </span>
            <DynamicIcon
              name={isTypeDropdownOpen ? "ChevronUp" : "ChevronDown"}
              className="w-4 h-4 text-blue-300"
            />
          </button>
        </div>

        {isTypeDropdownOpen && (
          <div className="mt-3 pt-3 border-t border-white/10 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2">
            {visibleFilters.map((type) => (
              <button
                key={type}
                onClick={() => {
                  setSelectedType(type);
                  setIsTypeDropdownOpen(false);
                  setSelectedLore(null);
                  setPage(1);
                }}
                className={`flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs sm:text-sm border transition-all ${
                  selectedType === type
                    ? "bg-white/10 border-purple-400/40 text-white"
                    : "bg-white/[0.03] border-white/10 text-blue-100 hover:bg-white/[0.07]"
                }`}
              >
                <div className={`p-1.5 rounded-lg shrink-0 ${TYPE_CONFIG[type].bgColor}`}>
                  <DynamicIcon
                    name={TYPE_CONFIG[type].icon}
                    className={`w-4 h-4 ${TYPE_CONFIG[type].color}`}
                  />
                </div>
                <span className="flex-1 text-left truncate">
                  {TYPE_CONFIG[type].label}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-xs shrink-0 ${TYPE_CONFIG[type].bgColor} ${TYPE_CONFIG[type].color}`}
                >
                  {typeCounts[type]}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Main Content - two columns on desktop, single pane on mobile */}
      <div className="grid grid-cols-1 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {/* Lore List - hidden on mobile while a note is open */}
        <div
          className={`bg-white/[0.04] backdrop-blur-xl rounded-2xl border border-white/10 p-3 lg:col-span-1 xl:col-span-2 ${
            selectedLore ? "hidden lg:block" : ""
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-blue-100 flex items-center gap-2">
              <DynamicIcon
                name={TYPE_CONFIG[selectedType].icon}
                className={`w-4 h-4 ${TYPE_CONFIG[selectedType].color}`}
              />
              {TYPE_CONFIG[selectedType].label}
            </h3>
            <span className="text-xs text-blue-300/50">
              {filteredLore.length} entries
            </span>
          </div>

          {filteredLore.length === 0 && !searchTerm && (
            <div className="text-center py-12">
              <div className="p-4 bg-white/5 rounded-full w-16 h-16 mx-auto mb-3 flex items-center justify-center">
                <DynamicIcon
                  name={TYPE_CONFIG[selectedType].icon}
                  className="w-8 h-8 text-blue-400/30"
                />
              </div>
              <p className="text-sm text-blue-200/40">
                {selectedType === "all"
                  ? "No notes discovered yet. Continue your adventure!"
                  : `No ${TYPE_CONFIG[
                      selectedType
                    ].label.toLowerCase()} entries yet.`}
              </p>
            </div>
          )}

          {filteredLore.length === 0 && searchTerm && (
            <div className="text-center py-12">
              <DynamicIcon
                name="SearchX"
                className="w-10 h-10 text-blue-400/20 mx-auto mb-2"
              />
              <p className="text-sm text-blue-200/40">
                No notes match your search.
              </p>
            </div>
          )}

          <div className="space-y-1 max-h-[65vh] lg:max-h-[500px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-blue-800/50 scrollbar-track-transparent">
            {paginatedLore.map((loreItem, index) => {
              const itemType = loreItem.type || "lore";
              const isSecret = loreItem.secrtet;
              const isSelected = selectedLore?.title === loreItem.title;
              const isInactive = loreItem.on === false;
              const autoPinned = isAutoPinned(loreItem);
              const isPinned = !!loreItem.pinned || autoPinned;

              return (
                <div
                  key={index}
                  className={`w-full text-left p-2 rounded-lg border transition-all group ${
                    isSelected
                      ? isSecret
                        ? "border-amber-400/40 bg-linear-to-r from-amber-500/15 to-orange-500/10"
                        : "border-purple-400/40 bg-linear-to-r from-purple-500/15 to-blue-500/10"
                      : isSecret
                      ? "border-amber-500/20 hover:border-amber-400/30 hover:bg-amber-500/5"
                      : "border-white/10 hover:border-white/20 hover:bg-white/5"
                  } ${isInactive ? "opacity-50" : ""} ${
                    isPinned ? "ring-1 ring-yellow-500/30" : ""
                  } card-interactive ${
                    isSecret
                      ? "hover:shadow-[0_4px_16px_rgba(245,158,11,0.15)]"
                      : "hover:shadow-[0_4px_16px_rgba(147,51,234,0.12)]"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer"
                      onClick={() => selectNote(loreItem)}
                    >
                    {loreItem.thumbnailUrl ? (
                      <img
                        src={loreItem.thumbnailUrl}
                        alt={loreItem.title}
                        className={`w-8 h-8 rounded object-cover border shrink-0 ${
                          isSecret
                            ? "border-amber-400/20"
                            : "border-white/10"
                        }`}
                      />
                    ) : (
                      <div
                        className={`w-8 h-8 rounded flex items-center justify-center shrink-0 ${
                          isSecret
                            ? "bg-amber-500/10 border border-amber-400/20"
                            : `${TYPE_CONFIG[itemType].bgColor} border border-white/10`
                        }`}
                      >
                        <DynamicIcon
                          name={isSecret ? "Lock" : TYPE_CONFIG[itemType].icon}
                          className={`w-4 h-4 ${
                            isSecret
                              ? "text-amber-400/60"
                              : TYPE_CONFIG[itemType].color
                          } opacity-60`}
                        />
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-sm text-white truncate flex items-center gap-1.5">
                        {isPinned && (
                          <DynamicIcon
                            name="Pin"
                            className="w-3 h-3 text-yellow-400 shrink-0"
                          />
                        )}
                        {loreItem.title}
                      </h4>
                    </div>

                    {isSecret ? (
                      <DynamicIcon
                        name="Lock"
                        className="w-3 h-3 text-amber-400 shrink-0"
                      />
                    ) : (
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${TYPE_CONFIG[itemType].bgColor} ${TYPE_CONFIG[itemType].color}`}
                      >
                        <DynamicIcon
                          name={TYPE_CONFIG[itemType].icon}
                          className="w-3 h-3"
                        />
                      </span>
                    )}
                    </div>

                    {/* Pin button - inline so it doesn't add a dead row of
                        height on touch devices, where there is no hover. */}
                    {onUpdateLore && !autoPinned && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTogglePin(loreItem);
                        }}
                        className={`shrink-0 p-1.5 rounded transition-colors ${
                          isPinned
                            ? "text-yellow-400 hover:bg-yellow-500/15"
                            : "text-blue-400/40 hover:text-blue-300 hover:bg-white/10 lg:opacity-0 lg:group-hover:opacity-100"
                        }`}
                        title={isPinned ? "Unpin note" : "Pin note to top"}
                      >
                        <DynamicIcon name="Pin" className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-white/10">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="p-1.5 rounded-lg text-blue-300 hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                title="Previous page"
              >
                <DynamicIcon name="ChevronLeft" className="w-4 h-4" />
              </button>
              <span className="text-xs text-blue-300/50">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="p-1.5 rounded-lg text-blue-300 hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                title="Next page"
              >
                <DynamicIcon name="ChevronRight" className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Lore Detail - on mobile this replaces the list entirely */}
        <div
          className={`bg-white/[0.04] backdrop-blur-xl rounded-2xl border border-white/10 lg:col-span-2 xl:col-span-4 flex-col ${
            selectedLore ? "flex" : "hidden lg:flex"
          }`}
        >
          {!selectedLore ? (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center">
                <div className="p-6 bg-white/5 rounded-full w-24 h-24 mx-auto mb-4 flex items-center justify-center">
                  <DynamicIcon
                    name="BookOpen"
                    className="w-12 h-12 text-blue-400/20"
                  />
                </div>
                <p className="text-sm text-blue-200/40 mb-1">
                  Select a note to view details
                </p>
                <p className="text-xs text-blue-300/30">
                  Click on any entry from the list
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Detail Header */}
              <div className="p-4 border-b border-white/10">
                <div className="flex items-start justify-between gap-2 sm:gap-3">
                  {/* Back to list - mobile only, where the list is swapped out */}
                  <button
                    onClick={() => {
                      setSelectedLore(null);
                      setIsEditing(false);
                      setShowImageGen(false);
                    }}
                    className="lg:hidden shrink-0 -ml-1 mt-0.5 p-2 rounded-lg text-blue-300 hover:bg-white/10 hover:text-white transition-colors"
                    title="Back to notes"
                    aria-label="Back to notes"
                  >
                    <DynamicIcon name="ArrowLeft" className="w-5 h-5" />
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {selectedLore.secrtet && (
                        <span className="px-2 py-0.5 bg-amber-500/10 text-amber-300 border border-amber-400/20 rounded text-xs flex items-center gap-1">
                          <DynamicIcon name="Lock" className="w-3 h-3" />
                          Secret
                        </span>
                      )}
                      {!selectedLore.secrtet && getTypeBadge(selectedLore)}
                    </div>
                    <h2 className="text-xl font-bold text-white">
                      {selectedLore.title}
                    </h2>
                  </div>

                  {/* Library sync buttons */}
                  {onUpdateLore && !isEditing && (
                    selectedLore.libraryNoteId ? (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={handlePushToLibrary}
                          disabled={syncingLibrary}
                          className="p-2 hover:bg-white/10 rounded-lg transition-colors group disabled:opacity-50"
                          title="Push this version to your notes library"
                        >
                          <DynamicIcon
                            name="UploadCloud"
                            className="w-5 h-5 text-indigo-300/70 group-hover:text-indigo-200"
                          />
                        </button>
                        <button
                          onClick={handlePullFromLibrary}
                          disabled={syncingLibrary}
                          className="p-2 hover:bg-white/10 rounded-lg transition-colors group disabled:opacity-50"
                          title="Pull the latest version from your notes library"
                        >
                          <DynamicIcon
                            name="DownloadCloud"
                            className="w-5 h-5 text-indigo-300/70 group-hover:text-indigo-200"
                          />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={handleSaveToLibrary}
                        disabled={syncingLibrary}
                        className="p-2 hover:bg-white/10 rounded-lg transition-colors group shrink-0 disabled:opacity-50"
                        title="Save to your notes library for reuse in other stories"
                      >
                        <DynamicIcon
                          name="Bookmark"
                          className="w-5 h-5 text-purple-300/70 group-hover:text-purple-200"
                        />
                      </button>
                    )
                  )}

                  {/* Edit Button */}
                  {onUpdateLore && !isEditing && (
                    <button
                      onClick={startEditing}
                      className="p-2 hover:bg-white/10 rounded-lg transition-colors group"
                      title="Edit note"
                    >
                      <DynamicIcon
                        name="Pencil"
                        className="w-5 h-5 text-blue-300/60 group-hover:text-blue-200"
                      />
                    </button>
                  )}
                </div>
              </div>

              {/* Detail Content */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* Image */}
                {selectedLore.thumbnailUrl && (
                  <div className="relative overflow-hidden rounded-xl border border-white/10 shadow-lg group">
                    <img
                      src={selectedLore.thumbnailUrl}
                      alt={selectedLore.title}
                      className="w-full h-48 sm:h-56 xl:h-64 object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-linear-to-t from-black/60 via-transparent to-transparent" />
                  </div>
                )}

                {/* AI Image Generator */}
                {onUpdateLore && (
                  <div className="border border-white/10 rounded-xl overflow-hidden">
                    <button
                      onClick={() => setShowImageGen(!showImageGen)}
                      className="w-full flex items-center gap-2 px-4 py-3 text-sm text-purple-300 hover:bg-purple-500/10 transition-colors"
                    >
                      <DynamicIcon
                        name={showImageGen ? "ChevronDown" : "ChevronRight"}
                        className="w-4 h-4"
                      />
                      <DynamicIcon name="Sparkles" className="w-4 h-4" />
                      <span>
                        {selectedLore.thumbnailUrl
                          ? "Regenerate Image with AI"
                          : "Generate Image with AI"}
                      </span>
                    </button>
                    {showImageGen && (
                      <div className="px-4 pb-4 pt-2 border-t border-white/10">
                        <LoreImageGenerator
                          loreTitle={selectedLore.title}
                          loreContent={selectedLore.content}
                          currentThumbnailUrl={selectedLore.thumbnailUrl}
                          onImageGenerated={(url) => {
                            const updatedLore = storyData.lore.map((l) =>
                              l.title === selectedLore.title
                                ? { ...l, thumbnailUrl: url }
                                : l
                            );
                            onUpdateLore(updatedLore);
                            setSelectedLore({
                              ...selectedLore,
                              thumbnailUrl: url,
                            });
                          }}
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Content - Edit Mode or Display Mode */}
                {isEditing ? (
                  <div className="space-y-3">
                    {/* Type Selector */}
                    <div>
                      <label className="block text-xs font-medium text-blue-200/70 mb-1">
                        Note Type
                      </label>
                      <select
                        value={editType}
                        onChange={(e) =>
                          setEditType(e.target.value as LoreType)
                        }
                        className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-400/40 text-sm transition-colors"
                      >
                        <option value="lore">📁 World Lore</option>
                        <option value="secret">🔒 Secret</option>
                        <option value="gm_notes">📋 GM Instructions</option>
                        <option value="story_instructions">
                          📝 Story Instructions
                        </option>
                        <option value="mechanics">⚙️ Mechanics</option>
                        <option value="character_sheet">
                          👤 Character Sheet
                        </option>
                        <option value="gm_plan">📋 Campaign Plan</option>
                        <option value="npc">🧑 NPC</option>
                        <option value="item">🗡️ Item</option>
                        <option value="location">📍 Location</option>
                        <option value="faction">⚔️ Faction</option>
                        <option value="event">📅 Event</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-blue-200/70 mb-1">
                        Aliases
                      </label>
                      <input
                        type="text"
                        value={editAliases}
                        onChange={(e) => setEditAliases(e.target.value)}
                        placeholder="Comma-separated alternate names, e.g. Bobby, the old man"
                        className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder-blue-300/40 focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-400/40 transition-colors"
                      />
                      <p className="text-xs text-blue-300/40 mt-1">
                        Also highlighted and clickable in the story text, alongside the title
                      </p>
                    </div>
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="w-full h-64 px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm placeholder-blue-300/40 focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-400/40 resize-none font-mono transition-colors"
                      placeholder="Enter note content (Markdown supported)..."
                    />
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-blue-300/40">
                        Supports Markdown formatting
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setIsEditing(false)}
                          className="px-4 py-2 text-sm text-blue-300 hover:bg-white/10 rounded-lg transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleSaveEdit}
                          className="px-4 py-2 text-sm bg-linear-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white rounded-lg shadow-md shadow-purple-950/40 transition-all flex items-center gap-2"
                        >
                          <DynamicIcon name="Check" className="w-4 h-4" />
                          Save Changes
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="prose prose-sm prose-invert max-w-none text-blue-50/90 prose-headings:text-white prose-strong:text-white prose-a:text-purple-400">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {preprocessMarkdown(selectedLore.content || "")}
                    </ReactMarkdown>
                  </div>
                )}

                {/* Related Info */}
                {!isEditing && (
                  <div className="space-y-3 pt-4 border-t border-white/10">
                    {!!selectedLore.aliases?.length && (
                      <div>
                        <h4 className="text-xs font-medium text-blue-200/50 mb-2 flex items-center gap-2">
                          <DynamicIcon name="AtSign" className="w-3.5 h-3.5" />
                          Aliases
                        </h4>
                        <div className="flex flex-wrap gap-1.5">
                          {selectedLore.aliases.map((alias, idx) => (
                            <span
                              key={idx}
                              className="px-2.5 py-1 bg-purple-500/10 text-purple-300 border border-purple-400/20 rounded-lg text-xs"
                            >
                              {alias}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {selectedLore.relatedCharacters?.length > 0 && (
                      <div>
                        <h4 className="text-xs font-medium text-blue-200/50 mb-2 flex items-center gap-2">
                          <DynamicIcon name="Users" className="w-3.5 h-3.5" />
                          Related Characters
                        </h4>
                        <div className="flex flex-wrap gap-1.5">
                          {selectedLore.relatedCharacters.map((char, idx) => (
                            <span
                              key={idx}
                              className="px-2.5 py-1 bg-blue-500/10 text-blue-300 border border-blue-400/20 rounded-lg text-xs"
                            >
                              {char}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {selectedLore.relatedLocations?.length > 0 && (
                      <div>
                        <h4 className="text-xs font-medium text-blue-200/50 mb-2 flex items-center gap-2">
                          <DynamicIcon name="MapPin" className="w-3.5 h-3.5" />
                          Related Locations
                        </h4>
                        <div className="flex flex-wrap gap-1.5">
                          {selectedLore.relatedLocations.map((loc, idx) => (
                            <span
                              key={idx}
                              className="px-2.5 py-1 bg-green-500/10 text-green-300 border border-green-400/20 rounded-lg text-xs"
                            >
                              {loc}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {selectedLore.keys?.length > 0 && (
                      <div>
                        <h4 className="text-xs font-medium text-blue-200/50 mb-2 flex items-center gap-2">
                          <DynamicIcon name="Tag" className="w-3.5 h-3.5" />
                          Keywords
                        </h4>
                        <div className="flex flex-wrap gap-1.5">
                          {selectedLore.keys.map((key, idx) => (
                            <span
                              key={idx}
                              className="px-2.5 py-1 bg-white/5 text-blue-200/60 border border-white/10 rounded-lg text-xs"
                            >
                              {key}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Add Note Modal */}
      {isAddingNote && (
        <FullScreenView
          title="Add New Note"
          icon="Plus"
          onClose={() => setIsAddingNote(false)}
          bodyClassName="p-4"
          footer={
            <div className="max-w-lg mx-auto flex justify-end gap-2 p-4">
              <button
                onClick={() => setIsAddingNote(false)}
                className="px-4 py-2 text-blue-300 hover:bg-white/10 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddNote}
                disabled={!newNote.title}
                className="px-4 py-2 bg-linear-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 disabled:from-white/10 disabled:to-white/10 disabled:text-blue-400/40 text-white rounded-lg shadow-md shadow-emerald-950/40 disabled:shadow-none transition-all flex items-center gap-2"
              >
                <DynamicIcon name="Plus" className="w-4 h-4" />
                Add Note
              </button>
            </div>
          }
        >
          <div className="max-w-lg mx-auto space-y-4">
          {/* Title */}
              <div>
                <label className="block text-sm font-medium text-blue-200/70 mb-1">
                  Title
                </label>
                <input
                  type="text"
                  value={newNote.title || ""}
                  onChange={(e) =>
                    setNewNote({ ...newNote, title: e.target.value })
                  }
                  placeholder="Note title..."
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-blue-400/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-400/40 transition-colors"
                />
              </div>

              {/* Type */}
              <div>
                <label className="block text-sm font-medium text-blue-200/70 mb-1">
                  Type
                </label>
                <select
                  value={newNote.type || "lore"}
                  onChange={(e) =>
                    setNewNote({ ...newNote, type: e.target.value as LoreType })
                  }
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-400/40 transition-colors"
                >
                  <option value="lore">📁 World Lore</option>
                  <option value="secret">🔒 Secret</option>
                  <option value="gm_notes">📋 GM Instructions</option>
                  <option value="story_instructions">
                    📝 Story Instructions
                  </option>
                  <option value="mechanics">⚙️ Mechanics</option>
                  <option value="character_sheet">👤 Character Sheet</option>
                  <option value="gm_plan">📋 Campaign Plan</option>
                  <option value="npc">🧑 NPC</option>
                  <option value="item">🗡️ Item</option>
                  <option value="location">📍 Location</option>
                  <option value="faction">⚔️ Faction</option>
                  <option value="event">📅 Event</option>
                </select>
              </div>

              {/* Content */}
              <div>
                <label className="block text-sm font-medium text-blue-200/70 mb-1">
                  Content
                </label>
                <textarea
                  value={newNote.content || ""}
                  onChange={(e) =>
                    setNewNote({ ...newNote, content: e.target.value })
                  }
                  placeholder="Note content... (supports Markdown)"
                  rows={6}
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-blue-400/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-400/40 resize-none transition-colors"
                />
              </div>
          </div>
        </FullScreenView>
      )}
    </div>
  );
}
