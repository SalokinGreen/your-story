"use client";

import { useState, useMemo } from "react";
import { StoryData, NPC, NPCStatus, NPCAttitude } from "../misc/structs";
import { DynamicIcon } from "../components/DynamicIcon";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { preprocessMarkdown } from "../misc/markdownUtils";

interface NPCsPageProps extends StoryData {
  onUpdateNPCs?: (updatedNPCs: NPC[]) => void;
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
  const { onUpdateNPCs, ...storyData } = props;
  const [selectedNPC, setSelectedNPC] = useState<NPC | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<FilterType>("all");
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editNotes, setEditNotes] = useState("");

  const npcs = storyData.npcs || [];

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
    const updatedNPCs = npcs.map((n) =>
      n.id === selectedNPC.id ? { ...n, notes: editNotes } : n
    );
    onUpdateNPCs(updatedNPCs);
    setSelectedNPC({ ...selectedNPC, notes: editNotes });
    setIsEditing(false);
  };

  // Start editing
  const startEditing = () => {
    if (selectedNPC) {
      setEditNotes(selectedNPC.notes || "");
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
    if (filterType === "all") return "text-cyan-300";
    if (filterType in STATUS_CONFIG)
      return STATUS_CONFIG[filterType as NPCStatus].color;
    if (filterType in ATTITUDE_CONFIG)
      return ATTITUDE_CONFIG[filterType as NPCAttitude].color;
    return "text-cyan-300";
  };

  return (
    <div className="w-full space-y-4">
      {/* Header Section */}
      <div className="bg-linear-to-br from-slate-800/80 to-slate-900/50 rounded-xl border border-slate-700/30 p-4 shadow-lg">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <div className="p-2 bg-cyan-500/20 rounded-lg">
                <DynamicIcon name="Users" className="w-5 h-5 text-cyan-400" />
              </div>
              Characters
            </h2>
            <p className="text-xs text-slate-400 mt-1 ml-11">
              Track NPCs you've encountered
            </p>
          </div>

          {/* Filter Dropdown */}
          <div className="relative">
            <button
              onClick={() => setIsFilterDropdownOpen(!isFilterDropdownOpen)}
              className="flex items-center gap-2 px-3 py-2 bg-slate-800/60 hover:bg-slate-700/60 border border-slate-600/40 rounded-lg text-sm text-white transition-all"
            >
              <DynamicIcon
                name={getFilterIcon()}
                className={`w-4 h-4 ${getFilterColor()}`}
              />
              <span>{getFilterLabel()}</span>
              <span className="px-1.5 py-0.5 rounded text-xs bg-cyan-500/20 text-cyan-300">
                {filterType === "all"
                  ? statusCounts.all
                  : statusCounts[filterType] || 0}
              </span>
              <DynamicIcon
                name={isFilterDropdownOpen ? "ChevronUp" : "ChevronDown"}
                className="w-4 h-4 text-slate-400"
              />
            </button>

            {isFilterDropdownOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setIsFilterDropdownOpen(false)}
                />
                <div className="absolute right-0 mt-2 w-56 bg-slate-900 border border-slate-700/50 rounded-xl shadow-xl z-50 overflow-hidden max-h-96 overflow-y-auto">
                  {/* All option */}
                  <button
                    onClick={() => {
                      setFilterType("all");
                      setIsFilterDropdownOpen(false);
                      setSelectedNPC(null);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-sm transition-all ${
                      filterType === "all"
                        ? "bg-slate-700/50 text-white"
                        : "text-slate-100 hover:bg-slate-800/50"
                    }`}
                  >
                    <div className="p-1.5 rounded-lg bg-cyan-500/20">
                      <DynamicIcon
                        name="Users"
                        className="w-4 h-4 text-cyan-300"
                      />
                    </div>
                    <span className="flex-1 text-left">All NPCs</span>
                    <span className="px-2 py-0.5 rounded-full text-xs bg-cyan-500/20 text-cyan-300">
                      {statusCounts.all}
                    </span>
                  </button>

                  {/* Status filters */}
                  <div className="px-3 py-2 text-xs text-slate-500 uppercase tracking-wider border-t border-slate-700/30">
                    Status
                  </div>
                  {(Object.keys(STATUS_CONFIG) as NPCStatus[]).map((status) => (
                    <button
                      key={status}
                      onClick={() => {
                        setFilterType(status);
                        setIsFilterDropdownOpen(false);
                        setSelectedNPC(null);
                      }}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-sm transition-all ${
                        filterType === status
                          ? "bg-slate-700/50 text-white"
                          : "text-slate-100 hover:bg-slate-800/50"
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
                  ))}

                  {/* Attitude filters */}
                  <div className="px-3 py-2 text-xs text-slate-500 uppercase tracking-wider border-t border-slate-700/30">
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
                            ? "bg-slate-700/50 text-white"
                            : "text-slate-100 hover:bg-slate-800/50"
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

        {/* Search Bar */}
        <div className="relative">
          <input
            type="text"
            placeholder="Search characters..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-2.5 pl-10 bg-slate-800/40 border border-slate-600/30 rounded-xl text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all"
          />
          <DynamicIcon
            name="Search"
            className="absolute left-3 top-3 h-4 w-4 text-slate-500"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              className="absolute right-3 top-2.5 p-0.5 hover:bg-slate-700/50 rounded"
            >
              <DynamicIcon name="X" className="h-4 w-4 text-slate-500" />
            </button>
          )}
        </div>
      </div>

      {/* Main Content - Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {/* NPC List */}
        <div className="bg-linear-to-br from-slate-800/60 to-slate-900/60 rounded-xl border border-slate-700/30 p-3 lg:col-span-1 xl:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <DynamicIcon
                name={getFilterIcon()}
                className={`w-4 h-4 ${getFilterColor()}`}
              />
              {getFilterLabel()}
            </h3>
            <span className="text-xs text-slate-500">
              {filteredNPCs.length} characters
            </span>
          </div>

          {filteredNPCs.length === 0 && !searchTerm && (
            <div className="text-center py-12">
              <div className="p-4 bg-slate-800/30 rounded-full w-16 h-16 mx-auto mb-3 flex items-center justify-center">
                <DynamicIcon name="Users" className="w-8 h-8 text-slate-600" />
              </div>
              <p className="text-sm text-slate-500">
                No characters encountered yet. Continue your adventure!
              </p>
            </div>
          )}

          {filteredNPCs.length === 0 && searchTerm && (
            <div className="text-center py-12">
              <DynamicIcon
                name="SearchX"
                className="w-10 h-10 text-slate-600 mx-auto mb-2"
              />
              <p className="text-sm text-slate-500">
                No characters match your search.
              </p>
            </div>
          )}

          <div className="space-y-1 max-h-[500px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-700/50 scrollbar-track-transparent">
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
                  className={`w-full text-left p-2 rounded-lg border transition-all group ${
                    isSelected
                      ? "border-cyan-500/50 bg-linear-to-r from-cyan-500/15 to-blue-500/10"
                      : "border-slate-700/20 hover:border-slate-600/40 hover:bg-slate-700/20"
                  } ${isDead ? "opacity-60" : ""}`}
                >
                  <div className="flex items-center gap-2">
                    {/* NPC Avatar */}
                    {npc.custom_symbol_url ? (
                      <img
                        src={npc.custom_symbol_url}
                        alt={npc.name}
                        className="w-10 h-10 rounded-lg object-cover border border-slate-600/30 shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-slate-800/50 border border-slate-600/30">
                        <DynamicIcon
                          name={npc.symbol || "User"}
                          className="w-5 h-5 text-slate-500"
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
                        <p className="text-xs text-slate-500 truncate">
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
        <div className="bg-linear-to-br from-slate-800/60 to-slate-900/60 rounded-xl border border-slate-700/30 lg:col-span-2 xl:col-span-4 flex flex-col">
          {!selectedNPC ? (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center">
                <div className="p-6 bg-slate-800/30 rounded-full w-24 h-24 mx-auto mb-4 flex items-center justify-center">
                  <DynamicIcon
                    name="User"
                    className="w-12 h-12 text-slate-600"
                  />
                </div>
                <p className="text-sm text-slate-500 mb-1">
                  Select a character to view details
                </p>
                <p className="text-xs text-slate-600">
                  Click on any character from the list
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Detail Header */}
              <div className="p-4 border-b border-slate-700/30">
                <div className="flex items-start gap-4">
                  {/* Avatar */}
                  {selectedNPC.custom_symbol_url ? (
                    <img
                      src={selectedNPC.custom_symbol_url}
                      alt={selectedNPC.name}
                      className="w-16 h-16 rounded-xl object-cover border border-slate-600/30 shrink-0"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-xl flex items-center justify-center shrink-0 bg-slate-800/50 border border-slate-600/30">
                      <DynamicIcon
                        name={selectedNPC.symbol || "User"}
                        className="w-8 h-8 text-slate-500"
                      />
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <h2 className="text-xl font-bold text-white">
                      {selectedNPC.name}
                    </h2>
                    {selectedNPC.role && (
                      <p className="text-sm text-slate-400">
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
                        <span className="text-xs px-2 py-1 rounded-lg bg-indigo-500/20 text-indigo-300 flex items-center gap-1">
                          <DynamicIcon name="Flag" className="w-3.5 h-3.5" />
                          {selectedNPC.faction}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Edit Button */}
                  {onUpdateNPCs && !isEditing && (
                    <button
                      onClick={startEditing}
                      className="p-2 hover:bg-slate-700/50 rounded-lg transition-colors group"
                      title="Edit notes"
                    >
                      <DynamicIcon
                        name="Pencil"
                        className="w-5 h-5 text-slate-500 group-hover:text-slate-300"
                      />
                    </button>
                  )}
                </div>
              </div>

              {/* Detail Content */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* Relationship */}
                {selectedNPC.relationship && (
                  <div className="p-3 rounded-lg bg-cyan-500/10 border border-cyan-500/30">
                    <h4 className="text-xs font-medium text-slate-400 mb-1 flex items-center gap-1.5">
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
                    <h4 className="text-xs font-medium text-slate-400 mb-2 flex items-center gap-1.5">
                      <DynamicIcon name="FileText" className="w-3.5 h-3.5" />
                      Description
                    </h4>
                    <div className="prose prose-sm prose-invert max-w-none text-slate-300 prose-headings:text-white prose-strong:text-white prose-a:text-cyan-400">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {preprocessMarkdown(selectedNPC.description || "")}
                      </ReactMarkdown>
                    </div>
                  </div>
                )}

                {/* Last Seen */}
                {selectedNPC.lastSeen && (
                  <div>
                    <h4 className="text-xs font-medium text-slate-400 mb-1 flex items-center gap-1.5">
                      <DynamicIcon name="MapPin" className="w-3.5 h-3.5" />
                      Last Seen
                    </h4>
                    <p className="text-sm text-slate-300">
                      {selectedNPC.lastSeen}
                    </p>
                  </div>
                )}

                {/* Notes - Edit Mode or Display Mode */}
                <div className="pt-4 border-t border-slate-700/30">
                  <h4 className="text-xs font-medium text-slate-400 mb-2 flex items-center gap-1.5">
                    <DynamicIcon name="StickyNote" className="w-3.5 h-3.5" />
                    Your Notes
                  </h4>
                  {isEditing ? (
                    <div className="space-y-3">
                      <textarea
                        value={editNotes}
                        onChange={(e) => setEditNotes(e.target.value)}
                        className="w-full h-32 px-4 py-3 bg-slate-800/40 border border-slate-600/30 rounded-xl text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 resize-none"
                        placeholder="Add your own notes about this character..."
                      />
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setIsEditing(false)}
                          className="px-4 py-2 text-sm text-slate-400 hover:bg-slate-700/50 rounded-lg transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleSaveNotes}
                          className="px-4 py-2 text-sm bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-colors flex items-center gap-2"
                        >
                          <DynamicIcon name="Check" className="w-4 h-4" />
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      {selectedNPC.notes ? (
                        <div className="prose prose-sm prose-invert max-w-none text-slate-300">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {preprocessMarkdown(selectedNPC.notes || "")}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        <p className="text-sm text-slate-600 italic">
                          No notes yet. Click the edit button to add your own.
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Metadata */}
                {selectedNPC.createdAt && (
                  <div className="pt-4 border-t border-slate-700/30">
                    <p className="text-xs text-slate-600">
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
    </div>
  );
}
