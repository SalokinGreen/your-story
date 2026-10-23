"use client";

import { useState, useMemo } from "react";
import { StoryData, NPC, NPCStatus, NPCAttitude } from "../misc/structs";
import { DynamicIcon } from "../components/DynamicIcon";
import { StoredPortrait } from "../components/StoryImage";
import FullScreenView from "../components/FullScreenView";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { preprocessMarkdown } from "../misc/markdownUtils";
import { useBackHandler } from "@/app/misc/useBackHandler";

interface NPCsPageProps extends StoryData {
  onUpdateNPCs?: (updatedNPCs: NPC[]) => void;
  // Paints a portrait for this NPC (page.tsx); unset when no image key is set
  // or on a guest's device.
  onMakePortrait?: (npcId: string) => void;
  // Pre-selects an NPC by id on mount - set when the player clicks a
  // highlighted mention of this NPC in the story prose (see page.tsx).
  initialSelectedId?: string;
}

// Status configuration
const STATUS_CONFIG: Record<
  NPCStatus,
  { label: string; icon: string; color: string; bgColor: string }
> = {
  alive: {
    label: "Alive",
    icon: "Heart",
    color: "text-ys-success",
    bgColor: "bg-ys-success/20",
  },
  dead: {
    label: "Dead",
    icon: "Skull",
    color: "text-ys-muted",
    bgColor: "bg-ys-surface-2",
  },
  missing: {
    label: "Missing",
    icon: "HelpCircle",
    color: "text-ys-warning",
    bgColor: "bg-ys-warning/20",
  },
  unknown: {
    label: "Unknown",
    icon: "Eye",
    color: "text-ys-accent",
    bgColor: "bg-ys-accent/20",
  },
  departed: {
    label: "Departed",
    icon: "LogOut",
    color: "text-ys-muted",
    bgColor: "bg-ys-surface-2",
  },
};

// Attitude configuration
const ATTITUDE_CONFIG: Record<
  NPCAttitude,
  { label: string; icon: string; color: string; bgColor: string }
> = {
  hostile: {
    label: "Hostile",
    icon: "Swords",
    color: "text-ys-danger",
    bgColor: "bg-ys-danger/20",
  },
  unfriendly: {
    label: "Unfriendly",
    icon: "Frown",
    color: "text-ys-warning",
    bgColor: "bg-ys-warning/20",
  },
  neutral: {
    label: "Neutral",
    icon: "Minus",
    color: "text-ys-muted",
    bgColor: "bg-ys-surface-2",
  },
  friendly: {
    label: "Friendly",
    icon: "Smile",
    color: "text-ys-success",
    bgColor: "bg-ys-success/20",
  },
  allied: {
    label: "Allied",
    icon: "Shield",
    color: "text-ys-accent",
    bgColor: "bg-ys-accent/20",
  },
};

// Filter types
type FilterType = "all" | NPCStatus | NPCAttitude;

export default function NPCsPage(props: NPCsPageProps) {
  const { onUpdateNPCs, initialSelectedId, onMakePortrait, ...storyData } = props;
  const [selectedNPC, setSelectedNPC] = useState<NPC | null>(() =>
    initialSelectedId
      ? (storyData.npcs || []).find((n) => n.id === initialSelectedId) || null
      : null,
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<FilterType>("all");
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);
  useBackHandler(isFilterDropdownOpen, () => setIsFilterDropdownOpen(false));
  const [isEditing, setIsEditing] = useState(false);
  const [editNotes, setEditNotes] = useState("");
  const [editAliases, setEditAliases] = useState("");
  const [isAddingNPC, setIsAddingNPC] = useState(false);
  const [newNPC, setNewNPC] = useState<Partial<NPC>>({
    name: "",
    description: "",
    role: "",
    status: "alive",
    attitude: "neutral",
  });

  const npcs = storyData.npcs || [];

  // Add new NPC
  const handleAddNPC = () => {
    if (!onUpdateNPCs || !newNPC.name) return;
    const npc: NPC = {
      id: `npc_${Date.now()}`,
      name: newNPC.name,
      description: newNPC.description || "",
      role: newNPC.role || "",
      status: (newNPC.status as NPCStatus) || "alive",
      attitude: (newNPC.attitude as NPCAttitude) || "neutral",
      relationship: newNPC.relationship || "",
      faction: newNPC.faction || "",
      createdAt: Date.now(),
    };
    onUpdateNPCs([...npcs, npc]);
    setNewNPC({
      name: "",
      description: "",
      role: "",
      status: "alive",
      attitude: "neutral",
    });
    setIsAddingNPC(false);
    setSelectedNPC(npc);
  };

  // Filter NPCs
  const filteredNPCs = useMemo(() => {
    return npcs.filter((npc) => {
      // Type filter
      if (filterType !== "all") {
        if (
          filterType in STATUS_CONFIG &&
          npc.status !== (filterType as NPCStatus)
        ) {
          return false;
        }
        if (
          filterType in ATTITUDE_CONFIG &&
          npc.attitude !== (filterType as NPCAttitude)
        ) {
          return false;
        }
      }

      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      return (
        npc.name.toLowerCase().includes(term) ||
        (npc.description || "").toLowerCase().includes(term) ||
        (npc.role || "").toLowerCase().includes(term) ||
        (npc.faction || "").toLowerCase().includes(term) ||
        (npc.relationship || "").toLowerCase().includes(term)
      );
    });
  }, [npcs, filterType, searchTerm]);

  // Count by status
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: npcs.length,
      alive: 0,
      dead: 0,
      missing: 0,
      unknown: 0,
      departed: 0,
    };
    npcs.forEach((npc) => {
      if (npc.status && counts[npc.status] !== undefined) {
        counts[npc.status]++;
      }
    });
    return counts;
  }, [npcs]);

  // Handle save notes
  const handleSaveNotes = () => {
    if (!selectedNPC || !onUpdateNPCs) return;
    const aliases = editAliases
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean);
    const updatedNPCs = npcs.map((n) =>
      n.id === selectedNPC.id ? { ...n, notes: editNotes, aliases } : n
    );
    onUpdateNPCs(updatedNPCs);
    setSelectedNPC({ ...selectedNPC, notes: editNotes, aliases });
    setIsEditing(false);
  };

  // Start editing
  const startEditing = () => {
    if (selectedNPC) {
      setEditNotes(selectedNPC.notes || "");
      setEditAliases((selectedNPC.aliases || []).join(", "));
      setIsEditing(true);
    }
  };

  // Get filter label
  const getFilterLabel = () => {
    if (filterType === "all") return "All NPCs";
    if (filterType in STATUS_CONFIG)
      return STATUS_CONFIG[filterType as NPCStatus].label;
    if (filterType in ATTITUDE_CONFIG)
      return ATTITUDE_CONFIG[filterType as NPCAttitude].label;
    return "All NPCs";
  };

  // Get filter icon
  const getFilterIcon = () => {
    if (filterType === "all") return "Users";
    if (filterType in STATUS_CONFIG)
      return STATUS_CONFIG[filterType as NPCStatus].icon;
    if (filterType in ATTITUDE_CONFIG)
      return ATTITUDE_CONFIG[filterType as NPCAttitude].icon;
    return "Users";
  };

  // Get filter color
  const getFilterColor = () => {
    if (filterType === "all") return "text-ys-accent";
    if (filterType in STATUS_CONFIG)
      return STATUS_CONFIG[filterType as NPCStatus].color;
    if (filterType in ATTITUDE_CONFIG)
      return ATTITUDE_CONFIG[filterType as NPCAttitude].color;
    return "text-ys-accent";
  };

  return (
    <div className="w-full space-y-4">
      {/* Header Section */}
      <div className="bg-ys-surface backdrop-blur-xl rounded-2xl border border-ys-border p-4 shadow-lg">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-xl font-bold text-ys-text flex items-center gap-2">
              <div className="p-2 bg-ys-accent/10 ring-1 ring-ys-accent/20 rounded-lg">
                <DynamicIcon name="Users" className="w-5 h-5 text-ys-accent" />
              </div>
              Characters
            </h2>
            <p className="text-xs text-ys-muted mt-1 ml-11">
              Track NPCs you've encountered
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Add NPC Button */}
            {onUpdateNPCs && (
              <button
                onClick={() => setIsAddingNPC(true)}
                className="flex items-center gap-2 px-3 py-2 bg-ys-success/15 rounded-lg text-sm text-ys-success font-medium transition-all border border-ys-success/40"
              >
                <DynamicIcon name="Plus" className="w-4 h-4" />
                <span className="hidden sm:inline">Add NPC</span>
              </button>
            )}

            {/* Filter Dropdown */}
            <div className="relative">
              <button
                onClick={() => setIsFilterDropdownOpen(!isFilterDropdownOpen)}
                className="flex items-center gap-2 px-3 py-2 bg-ys-surface hover:bg-ys-surface-2 border border-ys-border rounded-lg text-sm text-ys-text transition-all"
              >
                <DynamicIcon
                  name={getFilterIcon()}
                  className={`w-4 h-4 ${getFilterColor()}`}
                />
                <span>{getFilterLabel()}</span>
                <span className="px-1.5 py-0.5 rounded text-xs bg-ys-accent/20 text-ys-accent">
                  {filterType === "all"
                    ? statusCounts.all
                    : statusCounts[filterType] || 0}
                </span>
                <DynamicIcon
                  name={isFilterDropdownOpen ? "ChevronUp" : "ChevronDown"}
                  className="w-4 h-4 text-ys-muted"
                />
              </button>

              {isFilterDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setIsFilterDropdownOpen(false)}
                  />
                  <div className="absolute right-0 mt-2 w-56 bg-ys-surface/95 backdrop-blur-2xl border border-ys-border rounded-xl shadow-2xl z-50 overflow-hidden max-h-96 overflow-y-auto">
                    {/* All option */}
                    <button
                      onClick={() => {
                        setFilterType("all");
                        setIsFilterDropdownOpen(false);
                        setSelectedNPC(null);
                      }}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-sm transition-all ${
                        filterType === "all"
                          ? "bg-ys-surface-2 text-ys-text"
                          : "text-ys-text hover:bg-ys-surface-2"
                      }`}
                    >
                      <div className="p-1.5 rounded-lg bg-ys-accent/10 ring-1 ring-ys-accent/20">
                        <DynamicIcon
                          name="Users"
                          className="w-4 h-4 text-ys-accent"
                        />
                      </div>
                      <span className="flex-1 text-left">All NPCs</span>
                      <span className="px-2 py-0.5 rounded-full text-xs bg-ys-accent/20 text-ys-accent">
                        {statusCounts.all}
                      </span>
                    </button>

                    {/* Status filters */}
                    <div className="px-3 py-2 text-xs text-ys-muted uppercase tracking-wider border-t border-ys-border">
                      Status
                    </div>
                    {(Object.keys(STATUS_CONFIG) as NPCStatus[]).map(
                      (status) => (
                        <button
                          key={status}
                          onClick={() => {
                            setFilterType(status);
                            setIsFilterDropdownOpen(false);
                            setSelectedNPC(null);
                          }}
                          className={`w-full flex items-center gap-3 px-4 py-3 text-sm transition-all ${
                            filterType === status
                              ? "bg-ys-surface-2 text-ys-text"
                              : "text-ys-text hover:bg-ys-surface-2"
                          }`}
                        >
                          <div
                            className={`p-1.5 rounded-lg ${STATUS_CONFIG[status].bgColor}`}
                          >
                            <DynamicIcon
                              name={STATUS_CONFIG[status].icon}
                              className={`w-4 h-4 ${STATUS_CONFIG[status].color}`}
                            />
                          </div>
                          <span className="flex-1 text-left">
                            {STATUS_CONFIG[status].label}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs ${STATUS_CONFIG[status].bgColor} ${STATUS_CONFIG[status].color}`}
                          >
                            {statusCounts[status]}
                          </span>
                        </button>
                      )
                    )}

                    {/* Attitude filters */}
                    <div className="px-3 py-2 text-xs text-ys-muted uppercase tracking-wider border-t border-ys-border">
                      Attitude
                    </div>
                    {(Object.keys(ATTITUDE_CONFIG) as NPCAttitude[]).map(
                      (attitude) => (
                        <button
                          key={attitude}
                          onClick={() => {
                            setFilterType(attitude);
                            setIsFilterDropdownOpen(false);
                            setSelectedNPC(null);
                          }}
                          className={`w-full flex items-center gap-3 px-4 py-3 text-sm transition-all ${
                            filterType === attitude
                              ? "bg-ys-surface-2 text-ys-text"
                              : "text-ys-text hover:bg-ys-surface-2"
                          }`}
                        >
                          <div
                            className={`p-1.5 rounded-lg ${ATTITUDE_CONFIG[attitude].bgColor}`}
                          >
                            <DynamicIcon
                              name={ATTITUDE_CONFIG[attitude].icon}
                              className={`w-4 h-4 ${ATTITUDE_CONFIG[attitude].color}`}
                            />
                          </div>
                          <span className="flex-1 text-left">
                            {ATTITUDE_CONFIG[attitude].label}
                          </span>
                        </button>
                      )
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <input
            type="text"
            placeholder="Search characters..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-2.5 pl-10 bg-ys-surface border border-ys-border rounded-xl text-ys-text text-sm placeholder-ys-muted focus:outline-none focus:ring-2 focus:ring-ys-accent/40 focus:border-ys-accent/40 transition-all"
          />
          <DynamicIcon
            name="Search"
            className="absolute left-3 top-3 h-4 w-4 text-ys-muted"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              className="absolute right-3 top-2.5 p-0.5 hover:bg-ys-surface-2 rounded"
            >
              <DynamicIcon name="X" className="h-4 w-4 text-ys-muted" />
            </button>
          )}
        </div>
      </div>

      {/* Main Content - Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {/* NPC List */}
        <div className="bg-ys-surface backdrop-blur-xl rounded-2xl border border-ys-border p-3 lg:col-span-1 xl:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-ys-text flex items-center gap-2">
              <DynamicIcon
                name={getFilterIcon()}
                className={`w-4 h-4 ${getFilterColor()}`}
              />
              {getFilterLabel()}
            </h3>
            <span className="text-xs text-ys-muted">
              {filteredNPCs.length} characters
            </span>
          </div>

          {filteredNPCs.length === 0 && !searchTerm && (
            <div className="text-center py-12">
              <div className="p-4 bg-ys-surface rounded-full w-16 h-16 mx-auto mb-3 flex items-center justify-center">
                <DynamicIcon name="Users" className="w-8 h-8 text-ys-muted" />
              </div>
              <p className="text-sm text-ys-muted">
                No characters encountered yet. Continue your adventure!
              </p>
            </div>
          )}

          {filteredNPCs.length === 0 && searchTerm && (
            <div className="text-center py-12">
              <DynamicIcon
                name="SearchX"
                className="w-10 h-10 text-ys-muted mx-auto mb-2"
              />
              <p className="text-sm text-ys-muted">
                No characters match your search.
              </p>
            </div>
          )}

          <div className="space-y-1 max-h-[500px] overflow-y-auto pr-1">
            {filteredNPCs.map((npc) => {
              const isSelected = selectedNPC?.id === npc.id;
              const statusConfig = STATUS_CONFIG[npc.status || "unknown"];
              const attitudeConfig = ATTITUDE_CONFIG[npc.attitude || "neutral"];
              const isDead = npc.status === "dead";

              return (
                <button
                  key={npc.id}
                  onClick={() => {
                    setSelectedNPC(npc);
                    setIsEditing(false);
                  }}
                  className={`card-interactive w-full text-left p-2 rounded-lg border transition-all group hover:shadow-[0_4px_16px_color-mix(in_srgb,var(--ys-accent)_12%,transparent)] ${
                    isSelected
                      ? "border-ys-accent/40 bg-ys-accent/15"
                      : "border-ys-border hover:border-ys-border hover:bg-ys-surface-2"
                  } ${isDead ? "opacity-60" : ""}`}
                >
                  <div className="flex items-center gap-2">
                    {/* NPC Avatar */}
                    <StoredPortrait
                      imageId={npc.portraitImageId}
                      alt={npc.name}
                      className="w-10 h-10 rounded-lg object-cover border border-ys-border shrink-0"
                    >
                      {npc.custom_symbol_url ? (
                        <img
                          src={npc.custom_symbol_url}
                          alt={npc.name}
                          className="w-10 h-10 rounded-lg object-cover border border-ys-border shrink-0"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-ys-surface border border-ys-border">
                          <DynamicIcon
                            name={npc.symbol || "User"}
                            className="w-5 h-5 text-ys-muted"
                          />
                        </div>
                      )}
                    </StoredPortrait>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h4 className="font-medium text-sm text-ys-text truncate">
                          {npc.name}
                        </h4>
                        {/* Attitude indicator */}
                        <span
                          className={`shrink-0 ${attitudeConfig.color}`}
                          title={attitudeConfig.label}
                        >
                          <DynamicIcon
                            name={attitudeConfig.icon}
                            className="w-3.5 h-3.5"
                          />
                        </span>
                      </div>
                      {npc.role && (
                        <p className="text-xs text-ys-muted truncate">
                          {npc.role}
                        </p>
                      )}
                    </div>

                    {/* Status badge */}
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${statusConfig.bgColor} ${statusConfig.color}`}
                    >
                      <DynamicIcon
                        name={statusConfig.icon}
                        className="w-3 h-3"
                      />
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* NPC Detail */}
        <div className="bg-ys-surface backdrop-blur-xl rounded-2xl border border-ys-border lg:col-span-2 xl:col-span-4 flex flex-col">
          {!selectedNPC ? (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center">
                <div className="p-6 bg-ys-surface rounded-full w-24 h-24 mx-auto mb-4 flex items-center justify-center">
                  <DynamicIcon
                    name="User"
                    className="w-12 h-12 text-ys-muted"
                  />
                </div>
                <p className="text-sm text-ys-muted mb-1">
                  Select a character to view details
                </p>
                <p className="text-xs text-ys-muted">
                  Click on any character from the list
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Detail Header */}
              <div className="p-4 border-b border-ys-border">
                <div className="flex items-start gap-4">
                  {/* Avatar */}
                  <div className="shrink-0 flex flex-col items-center gap-1.5">
                    <StoredPortrait
                      imageId={
                        npcs.find((n) => n.id === selectedNPC.id)
                          ?.portraitImageId ?? selectedNPC.portraitImageId
                      }
                      alt={selectedNPC.name}
                      className="w-24 h-24 rounded-xl object-cover border border-ys-border shrink-0"
                    >
                      {selectedNPC.custom_symbol_url ? (
                        <img
                          src={selectedNPC.custom_symbol_url}
                          alt={selectedNPC.name}
                          className="w-16 h-16 rounded-xl object-cover border border-ys-border shrink-0"
                        />
                      ) : (
                        <div className="w-16 h-16 rounded-xl flex items-center justify-center shrink-0 bg-ys-surface border border-ys-border">
                          <DynamicIcon
                            name={selectedNPC.symbol || "User"}
                            className="w-8 h-8 text-ys-muted"
                          />
                        </div>
                      )}
                    </StoredPortrait>
                    {onMakePortrait && (
                      <button
                        type="button"
                        onClick={() => onMakePortrait(selectedNPC.id)}
                        className="text-[11px] px-2 py-0.5 rounded-md border border-ys-border bg-ys-surface hover:bg-ys-surface-2 text-ys-muted hover:text-ys-text transition-colors"
                        title="Paint a portrait from this character's description"
                      >
                        {npcs.find((n) => n.id === selectedNPC.id)
                          ?.portraitImageId
                          ? "Replace"
                          : "Make portrait"}
                      </button>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <h2 className="text-xl font-bold text-ys-text">
                      {selectedNPC.name}
                    </h2>
                    {selectedNPC.role && (
                      <p className="text-sm text-ys-muted">
                        {selectedNPC.role}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      {/* Status badge */}
                      <span
                        className={`text-xs px-2 py-1 rounded-lg flex items-center gap-1 ${
                          STATUS_CONFIG[selectedNPC.status || "unknown"].bgColor
                        } ${
                          STATUS_CONFIG[selectedNPC.status || "unknown"].color
                        }`}
                      >
                        <DynamicIcon
                          name={
                            STATUS_CONFIG[selectedNPC.status || "unknown"].icon
                          }
                          className="w-3.5 h-3.5"
                        />
                        {STATUS_CONFIG[selectedNPC.status || "unknown"].label}
                      </span>
                      {/* Attitude badge */}
                      <span
                        className={`text-xs px-2 py-1 rounded-lg flex items-center gap-1 ${
                          ATTITUDE_CONFIG[selectedNPC.attitude || "neutral"]
                            .bgColor
                        } ${
                          ATTITUDE_CONFIG[selectedNPC.attitude || "neutral"]
                            .color
                        }`}
                      >
                        <DynamicIcon
                          name={
                            ATTITUDE_CONFIG[selectedNPC.attitude || "neutral"]
                              .icon
                          }
                          className="w-3.5 h-3.5"
                        />
                        {
                          ATTITUDE_CONFIG[selectedNPC.attitude || "neutral"]
                            .label
                        }
                      </span>
                      {/* Faction badge */}
                      {selectedNPC.faction && (
                        <span className="text-xs px-2 py-1 rounded-lg bg-ys-accent/10 text-ys-accent border border-ys-accent/20 flex items-center gap-1">
                          <DynamicIcon name="Flag" className="w-3.5 h-3.5" />
                          {selectedNPC.faction}
                        </span>
                      )}
                      {/* Aliases */}
                      {selectedNPC.aliases?.map((alias, idx) => (
                        <span
                          key={idx}
                          className="text-xs px-2 py-1 rounded-lg bg-ys-accent/10 text-ys-accent border border-ys-accent/20 flex items-center gap-1"
                        >
                          <DynamicIcon name="AtSign" className="w-3.5 h-3.5" />
                          {alias}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Edit Button */}
                  {onUpdateNPCs && !isEditing && (
                    <button
                      onClick={startEditing}
                      className="p-2 hover:bg-ys-surface-2 rounded-lg transition-colors group"
                      title="Edit notes"
                    >
                      <DynamicIcon
                        name="Pencil"
                        className="w-5 h-5 text-ys-muted group-hover:text-ys-text"
                      />
                    </button>
                  )}
                </div>
              </div>

              {/* Detail Content */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* Relationship */}
                {selectedNPC.relationship && (
                  <div className="p-3 rounded-lg bg-ys-accent/10 border border-ys-accent/20">
                    <h4 className="text-xs font-medium text-ys-muted mb-1 flex items-center gap-1.5">
                      <DynamicIcon name="Heart" className="w-3.5 h-3.5" />
                      Relationship
                    </h4>
                    <p className="text-sm text-ys-text italic">
                      "{selectedNPC.relationship}"
                    </p>
                  </div>
                )}

                {/* Description */}
                {selectedNPC.description && (
                  <div>
                    <h4 className="text-xs font-medium text-ys-muted mb-2 flex items-center gap-1.5">
                      <DynamicIcon name="FileText" className="w-3.5 h-3.5" />
                      Description
                    </h4>
                    <div className="prose prose-sm max-w-none text-ys-text/80 prose-headings:text-ys-text prose-strong:text-ys-text prose-a:text-ys-accent">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {preprocessMarkdown(selectedNPC.description || "")}
                      </ReactMarkdown>
                    </div>
                  </div>
                )}

                {/* Last Seen */}
                {selectedNPC.lastSeen && (
                  <div>
                    <h4 className="text-xs font-medium text-ys-muted mb-1 flex items-center gap-1.5">
                      <DynamicIcon name="MapPin" className="w-3.5 h-3.5" />
                      Last Seen
                    </h4>
                    <p className="text-sm text-ys-text/80">
                      {selectedNPC.lastSeen}
                    </p>
                  </div>
                )}

                {/* Notes - Edit Mode or Display Mode */}
                <div className="pt-4 border-t border-ys-border">
                  <h4 className="text-xs font-medium text-ys-muted mb-2 flex items-center gap-1.5">
                    <DynamicIcon name="StickyNote" className="w-3.5 h-3.5" />
                    Your Notes
                  </h4>
                  {isEditing ? (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-ys-muted mb-1">
                          Aliases
                        </label>
                        <input
                          type="text"
                          value={editAliases}
                          onChange={(e) => setEditAliases(e.target.value)}
                          placeholder="Comma-separated alternate names, e.g. Bobby, the old man"
                          className="w-full px-3 py-2 bg-ys-surface border border-ys-border rounded-lg text-ys-text text-sm placeholder-ys-muted focus:outline-none focus:ring-2 focus:ring-ys-accent/40 focus:border-ys-accent/40 transition-colors"
                        />
                        <p className="text-xs text-ys-muted mt-1">
                          Also highlighted and clickable in the story text, alongside the name
                        </p>
                      </div>
                      <textarea
                        value={editNotes}
                        onChange={(e) => setEditNotes(e.target.value)}
                        className="w-full h-32 px-4 py-3 bg-ys-surface border border-ys-border rounded-xl text-ys-text text-sm placeholder-ys-muted focus:outline-none focus:ring-2 focus:ring-ys-accent/40 focus:border-ys-accent/40 resize-none transition-colors"
                        placeholder="Add your own notes about this character..."
                      />
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setIsEditing(false)}
                          className="px-4 py-2 text-sm text-ys-accent hover:bg-ys-surface-2 rounded-lg transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleSaveNotes}
                          className="px-4 py-2 text-sm bg-ys-accent text-ys-on-accent rounded-lg shadow-md shadow-ys-accent/40 transition-all flex items-center gap-2"
                        >
                          <DynamicIcon name="Check" className="w-4 h-4" />
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      {selectedNPC.notes ? (
                        <div className="prose prose-sm max-w-none text-ys-text/80">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {preprocessMarkdown(selectedNPC.notes || "")}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        <p className="text-sm text-ys-muted italic">
                          No notes yet. Click the edit button to add your own.
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Metadata */}
                {selectedNPC.createdAt && (
                  <div className="pt-4 border-t border-ys-border">
                    <p className="text-xs text-ys-muted">
                      First encountered:{" "}
                      {new Date(selectedNPC.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Add NPC Modal */}
      {isAddingNPC && (
        <FullScreenView
          title="Add Character"
          icon="UserPlus"
          onClose={() => setIsAddingNPC(false)}
          bodyClassName="p-4"
          footer={
            <div className="max-w-lg mx-auto flex justify-end gap-2 p-4">
              <button
                onClick={() => setIsAddingNPC(false)}
                className="px-4 py-2 text-ys-accent hover:bg-ys-surface-2 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddNPC}
                disabled={!newNPC.name}
                className="px-4 py-2 bg-ys-success/15 disabled:text-ys-muted text-ys-success rounded-lg transition-all flex items-center gap-2 border border-ys-success/40"
              >
                <DynamicIcon name="UserPlus" className="w-4 h-4" />
                Add Character
              </button>
            </div>
          }
        >
          <div className="max-w-lg mx-auto space-y-4">
          {/* Name */}
              <div>
                <label className="block text-sm font-medium text-ys-muted mb-1">
                  Name *
                </label>
                <input
                  type="text"
                  value={newNPC.name || ""}
                  onChange={(e) =>
                    setNewNPC({ ...newNPC, name: e.target.value })
                  }
                  placeholder="Character name..."
                  className="w-full px-3 py-2 bg-ys-surface border border-ys-border rounded-lg text-ys-text placeholder-ys-muted focus:outline-none focus:ring-2 focus:ring-ys-success/40 focus:border-ys-success/40 transition-colors"
                />
              </div>

              {/* Role */}
              <div>
                <label className="block text-sm font-medium text-ys-muted mb-1">
                  Role
                </label>
                <input
                  type="text"
                  value={newNPC.role || ""}
                  onChange={(e) =>
                    setNewNPC({ ...newNPC, role: e.target.value })
                  }
                  placeholder="e.g. Blacksmith, Guard Captain, Mysterious Stranger..."
                  className="w-full px-3 py-2 bg-ys-surface border border-ys-border rounded-lg text-ys-text placeholder-ys-muted focus:outline-none focus:ring-2 focus:ring-ys-success/40 focus:border-ys-success/40 transition-colors"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Status */}
                <div>
                  <label className="block text-sm font-medium text-ys-muted mb-1">
                    Status
                  </label>
                  <select
                    value={newNPC.status || "alive"}
                    onChange={(e) =>
                      setNewNPC({
                        ...newNPC,
                        status: e.target.value as NPCStatus,
                      })
                    }
                    className="w-full px-3 py-2 bg-ys-surface border border-ys-border rounded-lg text-ys-text focus:outline-none focus:ring-2 focus:ring-ys-success/40 focus:border-ys-success/40 transition-colors"
                  >
                    {(Object.keys(STATUS_CONFIG) as NPCStatus[]).map(
                      (status) => (
                        <option key={status} value={status}>
                          {STATUS_CONFIG[status].label}
                        </option>
                      )
                    )}
                  </select>
                </div>

                {/* Attitude */}
                <div>
                  <label className="block text-sm font-medium text-ys-muted mb-1">
                    Attitude
                  </label>
                  <select
                    value={newNPC.attitude || "neutral"}
                    onChange={(e) =>
                      setNewNPC({
                        ...newNPC,
                        attitude: e.target.value as NPCAttitude,
                      })
                    }
                    className="w-full px-3 py-2 bg-ys-surface border border-ys-border rounded-lg text-ys-text focus:outline-none focus:ring-2 focus:ring-ys-success/40 focus:border-ys-success/40 transition-colors"
                  >
                    {(Object.keys(ATTITUDE_CONFIG) as NPCAttitude[]).map(
                      (attitude) => (
                        <option key={attitude} value={attitude}>
                          {ATTITUDE_CONFIG[attitude].label}
                        </option>
                      )
                    )}
                  </select>
                </div>
              </div>

              {/* Relationship */}
              <div>
                <label className="block text-sm font-medium text-ys-muted mb-1">
                  Relationship
                </label>
                <input
                  type="text"
                  value={newNPC.relationship || ""}
                  onChange={(e) =>
                    setNewNPC({ ...newNPC, relationship: e.target.value })
                  }
                  placeholder="e.g. Trusted mentor, Rival, Secret ally..."
                  className="w-full px-3 py-2 bg-ys-surface border border-ys-border rounded-lg text-ys-text placeholder-ys-muted focus:outline-none focus:ring-2 focus:ring-ys-success/40 focus:border-ys-success/40 transition-colors"
                />
              </div>

              {/* Faction */}
              <div>
                <label className="block text-sm font-medium text-ys-muted mb-1">
                  Faction
                </label>
                <input
                  type="text"
                  value={newNPC.faction || ""}
                  onChange={(e) =>
                    setNewNPC({ ...newNPC, faction: e.target.value })
                  }
                  placeholder="e.g. The Guild, Royal Guard, Independent..."
                  className="w-full px-3 py-2 bg-ys-surface border border-ys-border rounded-lg text-ys-text placeholder-ys-muted focus:outline-none focus:ring-2 focus:ring-ys-success/40 focus:border-ys-success/40 transition-colors"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-ys-muted mb-1">
                  Description
                </label>
                <textarea
                  value={newNPC.description || ""}
                  onChange={(e) =>
                    setNewNPC({ ...newNPC, description: e.target.value })
                  }
                  placeholder="Physical appearance, notable traits, background..."
                  rows={4}
                  className="w-full px-3 py-2 bg-ys-surface border border-ys-border rounded-lg text-ys-text placeholder-ys-muted focus:outline-none focus:ring-2 focus:ring-ys-success/40 focus:border-ys-success/40 resize-none transition-colors"
                />
              </div>
          </div>
        </FullScreenView>
      )}
    </div>
  );
}
