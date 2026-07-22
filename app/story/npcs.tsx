"use client";

import { useState, useMemo } from "react";
import { StoryData, NPC, NPCStatus, NPCAttitude } from "../misc/structs";
import { DynamicIcon } from "../components/DynamicIcon";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { preprocessMarkdown } from "../misc/markdownUtils";

interface NPCsPageProps extends StoryData {
  onUpdateNPCs?: (updatedNPCs: NPC[]) => void;
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
    color: "text-green-400",
    bgColor: "bg-green-500/20",
  },
  dead: {
    label: "Dead",
    icon: "Skull",
    color: "text-gray-400",
    bgColor: "bg-gray-500/20",
  },
  missing: {
    label: "Missing",
    icon: "HelpCircle",
    color: "text-yellow-400",
    bgColor: "bg-yellow-500/20",
  },
  unknown: {
    label: "Unknown",
    icon: "Eye",
    color: "text-blue-400",
    bgColor: "bg-blue-500/20",
  },
  departed: {
    label: "Departed",
    icon: "LogOut",
    color: "text-purple-400",
    bgColor: "bg-purple-500/20",
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
    color: "text-red-400",
    bgColor: "bg-red-500/20",
  },
  unfriendly: {
    label: "Unfriendly",
    icon: "Frown",
    color: "text-orange-400",
    bgColor: "bg-orange-500/20",
  },
  neutral: {
    label: "Neutral",
    icon: "Minus",
    color: "text-gray-400",
    bgColor: "bg-gray-500/20",
  },
  friendly: {
    label: "Friendly",
    icon: "Smile",
    color: "text-green-400",
    bgColor: "bg-green-500/20",
  },
  allied: {
    label: "Allied",
    icon: "Shield",
    color: "text-cyan-400",
    bgColor: "bg-cyan-500/20",
  },
};

// Filter types
type FilterType = "all" | NPCStatus | NPCAttitude;

export default function NPCsPage(props: NPCsPageProps) {
  const { onUpdateNPCs, initialSelectedId, ...storyData } = props;
  const [selectedNPC, setSelectedNPC] = useState<NPC | null>(() =>
    initialSelectedId
      ? (storyData.npcs || []).find((n) => n.id === initialSelectedId) || null
      : null,
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<FilterType>("all");
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);
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
    if (filterType === "all") return "text-purple-300";
    if (filterType in STATUS_CONFIG)
      return STATUS_CONFIG[filterType as NPCStatus].color;
    if (filterType in ATTITUDE_CONFIG)
      return ATTITUDE_CONFIG[filterType as NPCAttitude].color;
    return "text-purple-300";
  };

  return (
    <div className="w-full space-y-4">
      {/* Header Section */}
      <div className="bg-white/[0.04] backdrop-blur-xl rounded-2xl border border-white/10 p-4 shadow-[0_4px_24px_rgba(0,0,0,0.3)]">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <div className="p-2 bg-purple-500/10 ring-1 ring-purple-400/20 rounded-lg">
                <DynamicIcon name="Users" className="w-5 h-5 text-purple-300" />
              </div>
              Characters
            </h2>
            <p className="text-xs text-blue-200/50 mt-1 ml-11">
              Track NPCs you've encountered
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Add NPC Button */}
            {onUpdateNPCs && (
              <button
                onClick={() => setIsAddingNPC(true)}
                className="flex items-center gap-2 px-3 py-2 bg-linear-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 rounded-lg text-sm text-white font-medium shadow-md shadow-emerald-950/40 transition-all"
              >
                <DynamicIcon name="Plus" className="w-4 h-4" />
                <span className="hidden sm:inline">Add NPC</span>
              </button>
            )}

            {/* Filter Dropdown */}
            <div className="relative">
              <button
                onClick={() => setIsFilterDropdownOpen(!isFilterDropdownOpen)}
                className="flex items-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-sm text-white transition-all"
              >
                <DynamicIcon
                  name={getFilterIcon()}
                  className={`w-4 h-4 ${getFilterColor()}`}
                />
                <span>{getFilterLabel()}</span>
                <span className="px-1.5 py-0.5 rounded text-xs bg-purple-500/20 text-purple-300">
                  {filterType === "all"
                    ? statusCounts.all
                    : statusCounts[filterType] || 0}
                </span>
                <DynamicIcon
                  name={isFilterDropdownOpen ? "ChevronUp" : "ChevronDown"}
                  className="w-4 h-4 text-blue-300/60"
                />
              </button>

              {isFilterDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setIsFilterDropdownOpen(false)}
                  />
                  <div className="absolute right-0 mt-2 w-56 bg-[#0d1829]/95 backdrop-blur-2xl border border-white/10 rounded-xl shadow-2xl shadow-black/50 z-50 overflow-hidden max-h-96 overflow-y-auto">
                    {/* All option */}
                    <button
                      onClick={() => {
                        setFilterType("all");
                        setIsFilterDropdownOpen(false);
                        setSelectedNPC(null);
                      }}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-sm transition-all ${
                        filterType === "all"
                          ? "bg-white/10 text-white"
                          : "text-blue-100 hover:bg-white/5"
                      }`}
                    >
                      <div className="p-1.5 rounded-lg bg-purple-500/10 ring-1 ring-purple-400/20">
                        <DynamicIcon
                          name="Users"
                          className="w-4 h-4 text-purple-300"
                        />
                      </div>
                      <span className="flex-1 text-left">All NPCs</span>
                      <span className="px-2 py-0.5 rounded-full text-xs bg-purple-500/20 text-purple-300">
                        {statusCounts.all}
                      </span>
                    </button>

                    {/* Status filters */}
                    <div className="px-3 py-2 text-xs text-blue-300/40 uppercase tracking-wider border-t border-white/10">
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
                              ? "bg-white/10 text-white"
                              : "text-blue-100 hover:bg-white/5"
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
                    <div className="px-3 py-2 text-xs text-blue-300/40 uppercase tracking-wider border-t border-white/10">
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
                              ? "bg-white/10 text-white"
                              : "text-blue-100 hover:bg-white/5"
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
            className="w-full px-4 py-2.5 pl-10 bg-white/5 border border-white/10 rounded-xl text-white text-sm placeholder-blue-300/40 focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-400/40 transition-all"
          />
          <DynamicIcon
            name="Search"
            className="absolute left-3 top-3 h-4 w-4 text-blue-300/50"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              className="absolute right-3 top-2.5 p-0.5 hover:bg-white/10 rounded"
            >
              <DynamicIcon name="X" className="h-4 w-4 text-blue-300/50" />
            </button>
          )}
        </div>
      </div>

      {/* Main Content - Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {/* NPC List */}
        <div className="bg-white/[0.04] backdrop-blur-xl rounded-2xl border border-white/10 p-3 lg:col-span-1 xl:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-blue-100 flex items-center gap-2">
              <DynamicIcon
                name={getFilterIcon()}
                className={`w-4 h-4 ${getFilterColor()}`}
              />
              {getFilterLabel()}
            </h3>
            <span className="text-xs text-blue-300/50">
              {filteredNPCs.length} characters
            </span>
          </div>

          {filteredNPCs.length === 0 && !searchTerm && (
            <div className="text-center py-12">
              <div className="p-4 bg-white/5 rounded-full w-16 h-16 mx-auto mb-3 flex items-center justify-center">
                <DynamicIcon name="Users" className="w-8 h-8 text-blue-300/30" />
              </div>
              <p className="text-sm text-blue-200/40">
                No characters encountered yet. Continue your adventure!
              </p>
            </div>
          )}

          {filteredNPCs.length === 0 && searchTerm && (
            <div className="text-center py-12">
              <DynamicIcon
                name="SearchX"
                className="w-10 h-10 text-blue-300/20 mx-auto mb-2"
              />
              <p className="text-sm text-blue-200/40">
                No characters match your search.
              </p>
            </div>
          )}

          <div className="space-y-1 max-h-[500px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
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
                  className={`card-interactive w-full text-left p-2 rounded-lg border transition-all group hover:shadow-[0_4px_16px_rgba(147,51,234,0.12)] ${
                    isSelected
                      ? "border-purple-400/40 bg-linear-to-r from-purple-500/15 to-blue-500/10"
                      : "border-white/10 hover:border-white/20 hover:bg-white/5"
                  } ${isDead ? "opacity-60" : ""}`}
                >
                  <div className="flex items-center gap-2">
                    {/* NPC Avatar */}
                    {npc.custom_symbol_url ? (
                      <img
                        src={npc.custom_symbol_url}
                        alt={npc.name}
                        className="w-10 h-10 rounded-lg object-cover border border-white/10 shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-white/5 border border-white/10">
                        <DynamicIcon
                          name={npc.symbol || "User"}
                          className="w-5 h-5 text-blue-300/50"
                        />
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h4 className="font-medium text-sm text-white truncate">
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
                        <p className="text-xs text-blue-300/50 truncate">
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
        <div className="bg-white/[0.04] backdrop-blur-xl rounded-2xl border border-white/10 lg:col-span-2 xl:col-span-4 flex flex-col">
          {!selectedNPC ? (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center">
                <div className="p-6 bg-white/5 rounded-full w-24 h-24 mx-auto mb-4 flex items-center justify-center">
                  <DynamicIcon
                    name="User"
                    className="w-12 h-12 text-blue-300/20"
                  />
                </div>
                <p className="text-sm text-blue-200/40 mb-1">
                  Select a character to view details
                </p>
                <p className="text-xs text-blue-300/30">
                  Click on any character from the list
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Detail Header */}
              <div className="p-4 border-b border-white/10">
                <div className="flex items-start gap-4">
                  {/* Avatar */}
                  {selectedNPC.custom_symbol_url ? (
                    <img
                      src={selectedNPC.custom_symbol_url}
                      alt={selectedNPC.name}
                      className="w-16 h-16 rounded-xl object-cover border border-white/10 shrink-0"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-xl flex items-center justify-center shrink-0 bg-white/5 border border-white/10">
                      <DynamicIcon
                        name={selectedNPC.symbol || "User"}
                        className="w-8 h-8 text-blue-300/50"
                      />
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <h2 className="text-xl font-bold text-white">
                      {selectedNPC.name}
                    </h2>
                    {selectedNPC.role && (
                      <p className="text-sm text-blue-300/60">
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
                        <span className="text-xs px-2 py-1 rounded-lg bg-indigo-500/10 text-indigo-300 border border-indigo-400/20 flex items-center gap-1">
                          <DynamicIcon name="Flag" className="w-3.5 h-3.5" />
                          {selectedNPC.faction}
                        </span>
                      )}
                      {/* Aliases */}
                      {selectedNPC.aliases?.map((alias, idx) => (
                        <span
                          key={idx}
                          className="text-xs px-2 py-1 rounded-lg bg-pink-500/10 text-pink-300 border border-pink-400/20 flex items-center gap-1"
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
                      className="p-2 hover:bg-white/10 rounded-lg transition-colors group"
                      title="Edit notes"
                    >
                      <DynamicIcon
                        name="Pencil"
                        className="w-5 h-5 text-blue-300/50 group-hover:text-blue-200"
                      />
                    </button>
                  )}
                </div>
              </div>

              {/* Detail Content */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* Relationship */}
                {selectedNPC.relationship && (
                  <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-400/20">
                    <h4 className="text-xs font-medium text-blue-300/60 mb-1 flex items-center gap-1.5">
                      <DynamicIcon name="Heart" className="w-3.5 h-3.5" />
                      Relationship
                    </h4>
                    <p className="text-sm text-white italic">
                      "{selectedNPC.relationship}"
                    </p>
                  </div>
                )}

                {/* Description */}
                {selectedNPC.description && (
                  <div>
                    <h4 className="text-xs font-medium text-blue-300/60 mb-2 flex items-center gap-1.5">
                      <DynamicIcon name="FileText" className="w-3.5 h-3.5" />
                      Description
                    </h4>
                    <div className="prose prose-sm prose-invert max-w-none text-blue-100/80 prose-headings:text-white prose-strong:text-white prose-a:text-purple-400">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {preprocessMarkdown(selectedNPC.description || "")}
                      </ReactMarkdown>
                    </div>
                  </div>
                )}

                {/* Last Seen */}
                {selectedNPC.lastSeen && (
                  <div>
                    <h4 className="text-xs font-medium text-blue-300/60 mb-1 flex items-center gap-1.5">
                      <DynamicIcon name="MapPin" className="w-3.5 h-3.5" />
                      Last Seen
                    </h4>
                    <p className="text-sm text-blue-100/80">
                      {selectedNPC.lastSeen}
                    </p>
                  </div>
                )}

                {/* Notes - Edit Mode or Display Mode */}
                <div className="pt-4 border-t border-white/10">
                  <h4 className="text-xs font-medium text-blue-300/60 mb-2 flex items-center gap-1.5">
                    <DynamicIcon name="StickyNote" className="w-3.5 h-3.5" />
                    Your Notes
                  </h4>
                  {isEditing ? (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-blue-300/60 mb-1">
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
                          Also highlighted and clickable in the story text, alongside the name
                        </p>
                      </div>
                      <textarea
                        value={editNotes}
                        onChange={(e) => setEditNotes(e.target.value)}
                        className="w-full h-32 px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm placeholder-blue-300/40 focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-400/40 resize-none transition-colors"
                        placeholder="Add your own notes about this character..."
                      />
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setIsEditing(false)}
                          className="px-4 py-2 text-sm text-blue-300 hover:bg-white/10 rounded-lg transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleSaveNotes}
                          className="px-4 py-2 text-sm bg-linear-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white rounded-lg shadow-md shadow-purple-950/40 transition-all flex items-center gap-2"
                        >
                          <DynamicIcon name="Check" className="w-4 h-4" />
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      {selectedNPC.notes ? (
                        <div className="prose prose-sm prose-invert max-w-none text-blue-100/80">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {preprocessMarkdown(selectedNPC.notes || "")}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        <p className="text-sm text-blue-300/40 italic">
                          No notes yet. Click the edit button to add your own.
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Metadata */}
                {selectedNPC.createdAt && (
                  <div className="pt-4 border-t border-white/10">
                    <p className="text-xs text-blue-300/30">
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
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#0d1829]/95 backdrop-blur-2xl rounded-2xl border border-white/10 w-full max-w-lg shadow-2xl shadow-black/50 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-white/10 sticky top-0 bg-[#0d1829]/95 backdrop-blur-sm">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <DynamicIcon
                  name="UserPlus"
                  className="w-5 h-5 text-emerald-400"
                />
                Add Character
              </h3>
              <button
                onClick={() => setIsAddingNPC(false)}
                className="p-1 hover:bg-white/10 rounded-lg transition-colors"
              >
                <DynamicIcon name="X" className="w-5 h-5 text-blue-300/60" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-blue-200/70 mb-1">
                  Name *
                </label>
                <input
                  type="text"
                  value={newNPC.name || ""}
                  onChange={(e) =>
                    setNewNPC({ ...newNPC, name: e.target.value })
                  }
                  placeholder="Character name..."
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-blue-300/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-400/40 transition-colors"
                />
              </div>

              {/* Role */}
              <div>
                <label className="block text-sm font-medium text-blue-200/70 mb-1">
                  Role
                </label>
                <input
                  type="text"
                  value={newNPC.role || ""}
                  onChange={(e) =>
                    setNewNPC({ ...newNPC, role: e.target.value })
                  }
                  placeholder="e.g. Blacksmith, Guard Captain, Mysterious Stranger..."
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-blue-300/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-400/40 transition-colors"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Status */}
                <div>
                  <label className="block text-sm font-medium text-blue-200/70 mb-1">
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
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-400/40 transition-colors"
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
                  <label className="block text-sm font-medium text-blue-200/70 mb-1">
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
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-400/40 transition-colors"
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
                <label className="block text-sm font-medium text-blue-200/70 mb-1">
                  Relationship
                </label>
                <input
                  type="text"
                  value={newNPC.relationship || ""}
                  onChange={(e) =>
                    setNewNPC({ ...newNPC, relationship: e.target.value })
                  }
                  placeholder="e.g. Trusted mentor, Rival, Secret ally..."
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-blue-300/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-400/40 transition-colors"
                />
              </div>

              {/* Faction */}
              <div>
                <label className="block text-sm font-medium text-blue-200/70 mb-1">
                  Faction
                </label>
                <input
                  type="text"
                  value={newNPC.faction || ""}
                  onChange={(e) =>
                    setNewNPC({ ...newNPC, faction: e.target.value })
                  }
                  placeholder="e.g. The Guild, Royal Guard, Independent..."
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-blue-300/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-400/40 transition-colors"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-blue-200/70 mb-1">
                  Description
                </label>
                <textarea
                  value={newNPC.description || ""}
                  onChange={(e) =>
                    setNewNPC({ ...newNPC, description: e.target.value })
                  }
                  placeholder="Physical appearance, notable traits, background..."
                  rows={4}
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-blue-300/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-400/40 resize-none transition-colors"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 p-4 border-t border-white/10 sticky bottom-0 bg-[#0d1829]/95 backdrop-blur-sm">
              <button
                onClick={() => setIsAddingNPC(false)}
                className="px-4 py-2 text-blue-300 hover:bg-white/10 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddNPC}
                disabled={!newNPC.name}
                className="px-4 py-2 bg-linear-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 disabled:from-white/10 disabled:to-white/10 disabled:text-blue-300/40 text-white rounded-lg shadow-md shadow-emerald-950/40 disabled:shadow-none transition-all flex items-center gap-2"
              >
                <DynamicIcon name="UserPlus" className="w-4 h-4" />
                Add Character
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
