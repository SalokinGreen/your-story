"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/app/misc/AuthContext";
import {
  StoryData,
  Stat,
  Resource,
  InventoryItem,
  PlotBeat,
  StoryLore,
  Achievement,
  Quest,
  Preset,
  UpgradeSettings,
  DEFAULT_UPGRADE_SETTINGS,
} from "@/app/misc/structs";
import { useNotification } from "@/app/misc/NotificationContext";
import { supabase } from "@/app/misc/supabase";
import { compressImage } from "@/app/misc/imageCompression";
import { authenticatedFetch } from "@/app/misc/getAuthToken";
import ConfirmDialog from "@/app/components/ConfirmDialog";
import {
  DEFAULT_PRESET,
  getPresetById,
  createPresetFromCurrentSettings,
  applyPreset,
} from "@/app/misc/presets";
import CreatorAIChat from "@/app/components/CreatorAIChat";

type CreatorStep =
  | "basic"
  | "preset"
  | "premise"
  | "stats"
  | "resources"
  | "inventory"
  | "lore"
  | "achievements"
  | "quests"
  | "plot"
  | "upgrades"
  | "preview";

function AdventureCreatorContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const { addNotification } = useNotification();

  const editAdventureId = searchParams?.get("edit");

  // Redirect if not authenticated (effect only, keep hook order stable)
  useEffect(() => {
    // Wait for auth to finish loading before redirecting
    if (authLoading) return;
    if (!user) {
      router.push("/");
    }
  }, [user, authLoading, router]);

  const [currentStep, setCurrentStep] = useState<CreatorStep>("basic");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<string>("custom");
  const [presets, setPresets] = useState<Preset[]>([DEFAULT_PRESET]);
  const [showPresetForm, setShowPresetForm] = useState(false);
  const [newPresetName, setNewPresetName] = useState("");
  const [newPresetDescription, setNewPresetDescription] = useState("");
  const [newPresetIcon, setNewPresetIcon] = useState("⭐");
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);

  // Upgrade Settings
  const [upgradeSettings, setUpgradeSettings] = useState<UpgradeSettings>(
    DEFAULT_UPGRADE_SETTINGS
  );

  // Basic Info
  const [title, setTitle] = useState("");
  const [shortDescription, setShortDescription] = useState("");
  const [description, setDescription] = useState("");
  const [difficulty, setDifficulty] = useState<
    "Easy" | "Medium" | "Hard" | "Expert"
  >("Medium");
  const [visibility, setVisibility] = useState<"public" | "hidden" | "private">(
    "private"
  );
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");
  const [uploadingThumbnail, setUploadingThumbnail] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    icon?: string;
    confirmText?: string;
    cancelText?: string;
    confirmButtonClass?: string;
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });

  const [isAIMenuOpen, setIsAIMenuOpen] = useState(false);

  const handleApplyAIChanges = (
    data: Partial<StoryData> & {
      title?: string;
      shortDescription?: string;
      description?: string;
    }
  ) => {
    // Apply adventure metadata
    if (data.title !== undefined) setTitle(data.title);
    if (data.shortDescription !== undefined)
      setShortDescription(data.shortDescription);
    if (data.description !== undefined) setDescription(data.description);

    // Apply story data
    if (data.story_name) setTitle(data.story_name);
    if (data.premise) setPremise(data.premise);
    if (data.player_name) setPlayerName(data.player_name);
    if (data.player_summary) setPlayerSummary(data.player_summary);
    if (data.starting_content) setStartingContent(data.starting_content);
    if (data.author_notes) setAuthorNotes(data.author_notes);

    if (data.stats) {
      const newStats = [...stats];
      data.stats.forEach((newStat) => {
        const index = newStats.findIndex((s) => s.name === newStat.name);
        if (index !== -1) {
          newStats[index] = { ...newStats[index], ...newStat };
        } else {
          newStats.push(newStat as Stat);
        }
      });
      setStats(newStats);
    }

    if (data.resources) {
      const newResources = [...resources];
      data.resources.forEach((newRes) => {
        const index = newResources.findIndex((r) => r.name === newRes.name);
        if (index !== -1) {
          newResources[index] = { ...newResources[index], ...newRes };
        } else {
          newResources.push(newRes as Resource);
        }
      });
      setResources(newResources);
    }

    if (data.inventory) {
      const newInventory = [...inventory];
      data.inventory.forEach((newItem) => {
        const index = newInventory.findIndex((i) => i.name === newItem.name);
        if (index !== -1) {
          newInventory[index] = { ...newInventory[index], ...newItem };
        } else {
          newInventory.push(newItem as InventoryItem);
        }
      });
      setInventory(newInventory);
    }

    if (data.plot_beats) {
      const newBeats = [...plotBeats];
      data.plot_beats.forEach((newBeat) => {
        const index = newBeats.findIndex((b) => b.title === newBeat.title);
        if (index !== -1) {
          newBeats[index] = { ...newBeats[index], ...newBeat };
        } else {
          newBeats.push(newBeat as PlotBeat);
        }
      });
      setPlotBeats(newBeats);
    }

    if (data.lore) {
      const newLore = [...lore];
      data.lore.forEach((l) => {
        const index = newLore.findIndex(
          (existing) => existing.title === l.title
        );
        if (index !== -1) {
          newLore[index] = { ...newLore[index], ...l };
        } else {
          newLore.push(l as StoryLore);
        }
      });
      setLore(newLore);
    }

    if (data.achievements) {
      const newAchievements = [...achievements];
      data.achievements.forEach((a) => {
        const index = newAchievements.findIndex(
          (existing) => existing.title === a.title
        );
        if (index !== -1) {
          newAchievements[index] = { ...newAchievements[index], ...a };
        } else {
          newAchievements.push(a as Achievement);
        }
      });
      setAchievements(newAchievements);
    }

    if (data.quests) {
      const newQuests = [...quests];
      data.quests.forEach((q) => {
        const index = newQuests.findIndex(
          (existing) => existing.title === q.title
        );
        if (index !== -1) {
          newQuests[index] = { ...newQuests[index], ...q };
        } else {
          newQuests.push(q as Quest);
        }
      });
      setQuests(newQuests);
    }

    if (data.presets) {
      const newPresets = [...presets];
      data.presets.forEach((p) => {
        const index = newPresets.findIndex((existing) => existing.id === p.id);
        if (index !== -1) {
          newPresets[index] = { ...newPresets[index], ...p };
        } else {
          newPresets.push(p as Preset);
        }
      });
      setPresets(newPresets);
    }

    addNotification("AI changes applied successfully!", "success");
    setIsAIMenuOpen(false);
  };

  // Load adventure data if editing
  useEffect(() => {
    if (!editAdventureId) return;
    if (!user) return; // Wait for auth to be ready

    const loadAdventure = async () => {
      setLoading(true);
      try {
        const response = await authenticatedFetch(
          `/api/adventures/${editAdventureId}`
        );
        if (!response.ok) throw new Error("Failed to load adventure");

        const { adventure } = await response.json();

        // Verify user is the author
        if (adventure.authorId !== user?.id) {
          addNotification("You can only edit your own adventures", "failure");
          router.push("/explorer");
          return;
        }

        // Load basic info
        setTitle(adventure.title || "");
        setShortDescription(adventure.shortDescription || "");
        setDescription(adventure.description || "");
        setDifficulty(adventure.difficulty || "Medium");
        setVisibility(adventure.visibility || "public");
        setTags(adventure.tags || []);
        setThumbnailUrl(adventure.thumbnailUrl || "");
        setBannerUrl(adventure.bannerUrl || "");

        // Load story template data
        const template = adventure.storyTemplate;
        setPlayerName(template.player_name || "");
        setPlayerSummary(template.player_summary || "");
        setPremise(template.premise || "");
        setStartingContent(template.starting_content || "");
        setMaxChapters(template.max_chapters || 8);
        setAuthorNotes(template.author_notes || "");
        setSelectedPreset(
          template.selected_preset || adventure.selectedPreset || "custom"
        );
        setPresets(template.presets || adventure.presets || [DEFAULT_PRESET]);

        // Load stats, resources, inventory, etc.
        setStats(template.stats || []);
        setResources(template.resources || []);
        setInventory(template.inventory || []);
        setPlotBeats(template.plot_beats || []);
        setLore(template.lore || []);
        setAchievements(template.achievements || []);
        setQuests(template.quests || []);
        setUpgradeSettings(
          template.upgradeSettings || DEFAULT_UPGRADE_SETTINGS
        );

        // Load points and momentum
        setPoints(template.points || 0);
        setMomentum(template.momentum || 0);
        setMaxMomentum(template.maxMomentum || 100);

        // After loading from API, overlay any unsaved draft changes
        try {
          const draftKey = `your-story:creator-draft:${editAdventureId}`;
          const raw =
            typeof window !== "undefined"
              ? window.localStorage.getItem(draftKey)
              : null;
          if (raw) {
            const saved = JSON.parse(raw) as any;

            if (saved.title) setTitle(saved.title);
            if (saved.shortDescription)
              setShortDescription(saved.shortDescription);
            if (saved.description) setDescription(saved.description);
            if (saved.difficulty) setDifficulty(saved.difficulty);
            if (saved.visibility) setVisibility(saved.visibility);
            if (Array.isArray(saved.tags)) setTags(saved.tags);
            if (saved.thumbnailUrl) setThumbnailUrl(saved.thumbnailUrl);
            if (saved.bannerUrl) setBannerUrl(saved.bannerUrl);

            if (saved.selectedPreset !== undefined)
              setSelectedPreset(saved.selectedPreset);
            if (Array.isArray(saved.presets)) setPresets(saved.presets);
            if (saved.playerName !== undefined) setPlayerName(saved.playerName);
            if (saved.playerSummary !== undefined)
              setPlayerSummary(saved.playerSummary);
            if (saved.premise !== undefined) setPremise(saved.premise);
            if (saved.startingContent !== undefined)
              setStartingContent(saved.startingContent);
            if (typeof saved.maxChapters === "number")
              setMaxChapters(saved.maxChapters);
            if (saved.authorNotes !== undefined)
              setAuthorNotes(saved.authorNotes);

            if (typeof saved.points === "number") setPoints(saved.points);
            if (typeof saved.momentum === "number") setMomentum(saved.momentum);
            if (typeof saved.maxMomentum === "number")
              setMaxMomentum(saved.maxMomentum);

            if (Array.isArray(saved.stats)) setStats(saved.stats);
            if (Array.isArray(saved.resources)) setResources(saved.resources);
            if (Array.isArray(saved.inventory)) setInventory(saved.inventory);
            if (Array.isArray(saved.plotBeats)) setPlotBeats(saved.plotBeats);
            if (Array.isArray(saved.lore)) setLore(saved.lore);
            if (Array.isArray(saved.achievements))
              setAchievements(saved.achievements);
            if (Array.isArray(saved.quests)) setQuests(saved.quests);
            if (saved.upgradeSettings)
              setUpgradeSettings(saved.upgradeSettings);

            if (
              typeof saved.currentStep === "string" &&
              steps.some((s) => s.id === saved.currentStep)
            ) {
              setCurrentStep(saved.currentStep as CreatorStep);
            }

            addNotification(
              "Adventure loaded with unsaved changes from this device",
              "success"
            );
          } else {
            addNotification("Adventure loaded for editing", "success");
          }
        } catch (err) {
          console.error("Failed to restore draft overlay", err);
          addNotification("Adventure loaded for editing", "success");
        }
      } catch (error) {
        console.error("Error loading adventure:", error);
        addNotification("Failed to load adventure", "failure");
        router.push("/explorer");
      } finally {
        setLoading(false);
        setInitialLoadComplete(true);
      }
    };

    loadAdventure();
  }, [editAdventureId, user, router, addNotification]);

  // Story Data
  const [playerName, setPlayerName] = useState("");
  const [playerSummary, setPlayerSummary] = useState("");
  const [premise, setPremise] = useState("");
  const [startingContent, setStartingContent] = useState("");
  const [maxChapters, setMaxChapters] = useState(8);
  const [authorNotes, setAuthorNotes] = useState("");

  // Points and Momentum
  const [points, setPoints] = useState(0);
  const [momentum, setMomentum] = useState(0);
  const [maxMomentum, setMaxMomentum] = useState(100);

  // Stats
  const [stats, setStats] = useState<Stat[]>([]);
  const [newStat, setNewStat] = useState<Partial<Stat>>({
    name: "",
    value: 50,
    description: "",
    symbol: "⭐",
  });
  const [draggedStatIndex, setDraggedStatIndex] = useState<number | null>(null);
  const [editingStatIndex, setEditingStatIndex] = useState<number | null>(null);
  const [editStat, setEditStat] = useState<Partial<Stat>>({});

  // Resources
  const [resources, setResources] = useState<Resource[]>([]);
  const [newResource, setNewResource] = useState<Partial<Resource>>({
    name: "",
    value: 50,
    maxValue: 100,
    description: "",
    symbol: "💎",
  });
  const [draggedResourceIndex, setDraggedResourceIndex] = useState<
    number | null
  >(null);
  const [editingResourceIndex, setEditingResourceIndex] = useState<
    number | null
  >(null);
  const [editResource, setEditResource] = useState<Partial<Resource>>({});

  // Starting Inventory
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [newItem, setNewItem] = useState<Partial<InventoryItem>>({
    name: "",
    quantity: 1,
    description: "",
    type: "misc",
    symbol: "📦",
  });
  const [draggedInventoryIndex, setDraggedInventoryIndex] = useState<
    number | null
  >(null);
  const [editingInventoryIndex, setEditingInventoryIndex] = useState<
    number | null
  >(null);
  const [editInventoryItem, setEditInventoryItem] = useState<
    Partial<InventoryItem>
  >({});

  // Plot Beats
  const [plotBeats, setPlotBeats] = useState<PlotBeat[]>([]);
  const [newPlotBeat, setNewPlotBeat] = useState<Partial<PlotBeat>>({
    title: "",
    content: "",
    fulfilled: false,
  });
  const [draggedPlotBeatIndex, setDraggedPlotBeatIndex] = useState<
    number | null
  >(null);
  const [editingPlotBeatIndex, setEditingPlotBeatIndex] = useState<
    number | null
  >(null);
  const [editPlotBeat, setEditPlotBeat] = useState<Partial<PlotBeat>>({});

  // Lore
  const [lore, setLore] = useState<StoryLore[]>([]);
  const [newLore, setNewLore] = useState<Partial<StoryLore>>({
    title: "",
    content: "",
    relatedCharacters: [],
    relatedLocations: [],
    secrtet: false,
    keys: [],
    thumbnailUrl: "",
    on: true,
    beats_trigger: [],
    beats_untrigger: [],
  });
  const [newLoreOnTrigger, setNewLoreOnTrigger] = useState("");
  const [newLoreOffTrigger, setNewLoreOffTrigger] = useState("");
  const [newLoreKey, setNewLoreKey] = useState("");
  const [draggedLoreIndex, setDraggedLoreIndex] = useState<number | null>(null);
  const [editingLoreIndex, setEditingLoreIndex] = useState<number | null>(null);
  const [editLore, setEditLore] = useState<Partial<StoryLore>>({});
  const [editLoreOnTrigger, setEditLoreOnTrigger] = useState("");
  const [editLoreOffTrigger, setEditLoreOffTrigger] = useState("");
  const [editLoreKey, setEditLoreKey] = useState("");

  // Achievements
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [newAchievement, setNewAchievement] = useState<Partial<Achievement>>({
    title: "",
    description: "",
    points: 10,
    symbol: "🏆",
  });
  const [draggedAchievementIndex, setDraggedAchievementIndex] = useState<
    number | null
  >(null);
  const [editingAchievementIndex, setEditingAchievementIndex] = useState<
    number | null
  >(null);
  const [editAchievement, setEditAchievement] = useState<Partial<Achievement>>(
    {}
  );

  // Quests
  const [quests, setQuests] = useState<Quest[]>([]);
  const [newQuest, setNewQuest] = useState<Partial<Quest>>({
    title: "",
    shortDescription: "",
    description: "",
    points: 10,
    active: true,
    fulfilled: false,
  });
  const [draggedQuestIndex, setDraggedQuestIndex] = useState<number | null>(
    null
  );
  const [editingQuestIndex, setEditingQuestIndex] = useState<number | null>(
    null
  );
  const [editQuest, setEditQuest] = useState<Partial<Quest>>({});

  // Local draft persistence (separate keys for new vs edit mode)
  const draftKey = editAdventureId
    ? `your-story:creator-draft:${editAdventureId}`
    : "your-story:creator-draft";

  const commonTags = [
    "Fantasy",
    "Sci-Fi",
    "Mystery",
    "Horror",
    "Romance",
    "Comedy",
    "Drama",
    "Action",
    "Adventure",
    "Thriller",
    "Post-Apocalyptic",
    "Cyberpunk",
    "Steampunk",
    "Historical",
    "Contemporary",
    "Magic",
    "Combat",
    "Exploration",
    "Puzzle",
    "Survival",
    "Detective",
    "Noir",
  ];

  const steps: { id: CreatorStep; label: string; icon: string }[] = [
    { id: "basic", label: "Basic Info", icon: "📝" },
    { id: "preset", label: "Character Preset", icon: "🎭" },
    { id: "premise", label: "Story Setup", icon: "📖" },
    { id: "stats", label: "Stats", icon: "📊" },
    { id: "resources", label: "Resources", icon: "💎" },
    { id: "inventory", label: "Starting Items", icon: "🎒" },
    { id: "lore", label: "Lore", icon: "📜" },
    { id: "achievements", label: "Achievements", icon: "🏆" },
    { id: "quests", label: "Quests", icon: "📋" },
    { id: "plot", label: "Plot Beats", icon: "🎬" },
    { id: "upgrades", label: "Upgrade Settings", icon: "⬆️" },
    { id: "preview", label: "Preview", icon: "👁️" },
  ];

  // Load draft on mount (only for new adventures, not edit mode)
  useEffect(() => {
    // Skip if editing - the edit effect handles draft overlay after API load
    if (editAdventureId) return;
    if (!draftKey) return;

    try {
      const raw =
        typeof window !== "undefined"
          ? window.localStorage.getItem(draftKey)
          : null;
      if (!raw) return;
      const saved = JSON.parse(raw) as any;

      if (saved.title) setTitle(saved.title);
      if (saved.shortDescription) setShortDescription(saved.shortDescription);
      if (saved.description) setDescription(saved.description);
      if (saved.difficulty) setDifficulty(saved.difficulty);
      if (saved.visibility) setVisibility(saved.visibility);
      if (Array.isArray(saved.tags)) setTags(saved.tags);
      if (saved.thumbnailUrl) setThumbnailUrl(saved.thumbnailUrl);
      if (saved.bannerUrl) setBannerUrl(saved.bannerUrl);

      if (saved.selectedPreset !== undefined)
        setSelectedPreset(saved.selectedPreset);
      if (Array.isArray(saved.presets)) setPresets(saved.presets);
      if (saved.playerName !== undefined) setPlayerName(saved.playerName);
      if (saved.playerSummary !== undefined)
        setPlayerSummary(saved.playerSummary);
      if (saved.premise !== undefined) setPremise(saved.premise);
      if (saved.startingContent !== undefined)
        setStartingContent(saved.startingContent);
      if (typeof saved.maxChapters === "number")
        setMaxChapters(saved.maxChapters);
      if (saved.authorNotes !== undefined) setAuthorNotes(saved.authorNotes);

      if (typeof saved.points === "number") setPoints(saved.points);
      if (typeof saved.momentum === "number") setMomentum(saved.momentum);
      if (typeof saved.maxMomentum === "number")
        setMaxMomentum(saved.maxMomentum);

      if (Array.isArray(saved.stats)) setStats(saved.stats);
      if (Array.isArray(saved.resources)) setResources(saved.resources);
      if (Array.isArray(saved.inventory)) setInventory(saved.inventory);
      if (Array.isArray(saved.plotBeats)) setPlotBeats(saved.plotBeats);
      if (Array.isArray(saved.lore)) setLore(saved.lore);
      if (Array.isArray(saved.achievements))
        setAchievements(saved.achievements);
      if (Array.isArray(saved.quests)) setQuests(saved.quests);
      if (saved.upgradeSettings) setUpgradeSettings(saved.upgradeSettings);

      if (
        typeof saved.currentStep === "string" &&
        steps.some((s) => s.id === saved.currentStep)
      ) {
        setCurrentStep(saved.currentStep as CreatorStep);
      }

      addNotification(
        "Restored unsaved adventure draft from this device",
        "success"
      );
    } catch (err) {
      console.error("Failed to restore creator draft", err);
    }
    setInitialLoadComplete(true);
    // we intentionally omit dependencies so this runs once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-save draft when fields change
  useEffect(() => {
    // Don't save until initial load is complete to avoid overwriting draft with API data
    if (!initialLoadComplete) return;
    if (!draftKey) return;

    const payload = {
      title,
      shortDescription,
      description,
      difficulty,
      visibility,
      tags,
      thumbnailUrl,
      bannerUrl,
      selectedPreset,
      presets,
      playerName,
      playerSummary,
      premise,
      startingContent,
      maxChapters,
      authorNotes,
      points,
      momentum,
      maxMomentum,
      stats,
      resources,
      inventory,
      plotBeats,
      lore,
      achievements,
      quests,
      upgradeSettings,
      currentStep,
      updatedAt: Date.now(),
    };

    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(draftKey, JSON.stringify(payload));
      }
    } catch (err) {
      console.error("Failed to save creator draft", err);
    }
  }, [
    initialLoadComplete,
    draftKey,
    title,
    shortDescription,
    description,
    difficulty,
    visibility,
    tags,
    thumbnailUrl,
    bannerUrl,
    selectedPreset,
    presets,
    playerName,
    playerSummary,
    premise,
    startingContent,
    maxChapters,
    authorNotes,
    points,
    momentum,
    maxMomentum,
    stats,
    resources,
    inventory,
    plotBeats,
    lore,
    achievements,
    quests,
    upgradeSettings,
    currentStep,
  ]);

  const addTag = () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      setTags([...tags, newTag.trim()]);
      setNewTag("");
    }
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const handleThumbnailUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      addNotification("Please select an image file", "warning");
      return;
    }

    setUploadingThumbnail(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const compressed = await compressImage(file, 400, 300, 0.8);

      const fileExt = file.name.split(".").pop();
      const fileName = `${Date.now()}-thumbnail.${fileExt}`;
      const filePath = `${session.user.id}/adventure-thumbnails/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("adventure-images")
        .upload(filePath, compressed, { cacheControl: "3600", upsert: false });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from("adventure-images")
        .getPublicUrl(filePath);

      setThumbnailUrl(data.publicUrl);
      addNotification("Thumbnail uploaded!", "success");
    } catch (error: any) {
      console.error("Error uploading thumbnail:", error);
      addNotification(`Upload failed: ${error.message}`, "failure");
    } finally {
      setUploadingThumbnail(false);
    }
  };

  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      addNotification("Please select an image file", "warning");
      return;
    }

    setUploadingBanner(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const compressed = await compressImage(file, 1200, 400, 0.85);

      const fileExt = file.name.split(".").pop();
      const fileName = `${Date.now()}-banner.${fileExt}`;
      const filePath = `${session.user.id}/adventure-banners/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("adventure-images")
        .upload(filePath, compressed, { cacheControl: "3600", upsert: false });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from("adventure-images")
        .getPublicUrl(filePath);

      setBannerUrl(data.publicUrl);
      addNotification("Banner uploaded!", "success");
    } catch (error: any) {
      console.error("Error uploading banner:", error);
      addNotification(`Upload failed: ${error.message}`, "failure");
    } finally {
      setUploadingBanner(false);
    }
  };

  const addStat = () => {
    if (newStat.name && newStat.description) {
      setStats([...stats, newStat as Stat]);
      setNewStat({ name: "", value: 50, description: "", symbol: "⭐" });
    }
  };

  const removeStat = (index: number) => {
    setStats(stats.filter((_, i) => i !== index));
  };

  const addResource = () => {
    if (newResource.name && newResource.description) {
      setResources([...resources, newResource as Resource]);
      setNewResource({
        name: "",
        value: 50,
        maxValue: 100,
        description: "",
        symbol: "💎",
      });
    }
  };

  const removeResource = (index: number) => {
    setResources(resources.filter((_, i) => i !== index));
  };

  const addInventoryItem = () => {
    if (newItem.name) {
      setInventory([...inventory, newItem as InventoryItem]);
      setNewItem({
        name: "",
        quantity: 1,
        description: "",
        type: "misc",
        symbol: "📦",
      });
    }
  };

  const removeInventoryItem = (index: number) => {
    setInventory(inventory.filter((_, i) => i !== index));
  };

  const addPlotBeat = () => {
    if (newPlotBeat.title && newPlotBeat.content) {
      setPlotBeats([...plotBeats, newPlotBeat as PlotBeat]);
      setNewPlotBeat({ title: "", content: "", fulfilled: false });
    }
  };

  const removePlotBeat = (index: number) => {
    setPlotBeats(plotBeats.filter((_, i) => i !== index));
  };

  const handlePlotBeatDragStart = (index: number) => {
    setDraggedPlotBeatIndex(index);
  };

  const handlePlotBeatDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedPlotBeatIndex === null || draggedPlotBeatIndex === index) return;

    const newPlotBeats = [...plotBeats];
    const draggedItem = newPlotBeats[draggedPlotBeatIndex];
    newPlotBeats.splice(draggedPlotBeatIndex, 1);
    newPlotBeats.splice(index, 0, draggedItem);

    setPlotBeats(newPlotBeats);
    setDraggedPlotBeatIndex(index);
  };

  const handlePlotBeatDragEnd = () => {
    setDraggedPlotBeatIndex(null);
  };

  const movePlotBeatUp = (index: number) => {
    if (index === 0) return;
    const newPlotBeats = [...plotBeats];
    [newPlotBeats[index - 1], newPlotBeats[index]] = [
      newPlotBeats[index],
      newPlotBeats[index - 1],
    ];
    setPlotBeats(newPlotBeats);
  };

  const movePlotBeatDown = (index: number) => {
    if (index === plotBeats.length - 1) return;
    const newPlotBeats = [...plotBeats];
    [newPlotBeats[index], newPlotBeats[index + 1]] = [
      newPlotBeats[index + 1],
      newPlotBeats[index],
    ];
    setPlotBeats(newPlotBeats);
  };

  const startEditPlotBeat = (index: number) => {
    setEditingPlotBeatIndex(index);
    setEditPlotBeat({ ...plotBeats[index] });
  };

  const cancelEditPlotBeat = () => {
    setEditingPlotBeatIndex(null);
    setEditPlotBeat({});
  };

  const saveEditPlotBeat = () => {
    if (
      editingPlotBeatIndex !== null &&
      editPlotBeat.title &&
      editPlotBeat.content
    ) {
      const updated = [...plotBeats];
      updated[editingPlotBeatIndex] = editPlotBeat as PlotBeat;
      setPlotBeats(updated);
      setEditingPlotBeatIndex(null);
      setEditPlotBeat({});
    }
  };

  // Stat drag-and-drop and edit functions
  const handleStatDragStart = (index: number) => {
    setDraggedStatIndex(index);
  };

  const handleStatDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedStatIndex === null || draggedStatIndex === index) return;

    const newStats = [...stats];
    const draggedItem = newStats[draggedStatIndex];
    newStats.splice(draggedStatIndex, 1);
    newStats.splice(index, 0, draggedItem);

    setStats(newStats);
    setDraggedStatIndex(index);
  };

  const handleStatDragEnd = () => {
    setDraggedStatIndex(null);
  };

  const moveStatUp = (index: number) => {
    if (index === 0) return;
    const newStats = [...stats];
    [newStats[index - 1], newStats[index]] = [
      newStats[index],
      newStats[index - 1],
    ];
    setStats(newStats);
  };

  const moveStatDown = (index: number) => {
    if (index === stats.length - 1) return;
    const newStats = [...stats];
    [newStats[index], newStats[index + 1]] = [
      newStats[index + 1],
      newStats[index],
    ];
    setStats(newStats);
  };

  const startEditStat = (index: number) => {
    setEditingStatIndex(index);
    setEditStat({ ...stats[index] });
  };

  const cancelEditStat = () => {
    setEditingStatIndex(null);
    setEditStat({});
  };

  const saveEditStat = () => {
    if (editingStatIndex !== null && editStat.name && editStat.description) {
      const updated = [...stats];
      updated[editingStatIndex] = editStat as Stat;
      setStats(updated);
      setEditingStatIndex(null);
      setEditStat({});
    }
  };

  // Resource drag-and-drop and edit functions
  const handleResourceDragStart = (index: number) => {
    setDraggedResourceIndex(index);
  };

  const handleResourceDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedResourceIndex === null || draggedResourceIndex === index) return;

    const newResources = [...resources];
    const draggedItem = newResources[draggedResourceIndex];
    newResources.splice(draggedResourceIndex, 1);
    newResources.splice(index, 0, draggedItem);

    setResources(newResources);
    setDraggedResourceIndex(index);
  };

  const handleResourceDragEnd = () => {
    setDraggedResourceIndex(null);
  };

  const moveResourceUp = (index: number) => {
    if (index === 0) return;
    const newResources = [...resources];
    [newResources[index - 1], newResources[index]] = [
      newResources[index],
      newResources[index - 1],
    ];
    setResources(newResources);
  };

  const moveResourceDown = (index: number) => {
    if (index === resources.length - 1) return;
    const newResources = [...resources];
    [newResources[index], newResources[index + 1]] = [
      newResources[index + 1],
      newResources[index],
    ];
    setResources(newResources);
  };

  const startEditResource = (index: number) => {
    setEditingResourceIndex(index);
    setEditResource({ ...resources[index] });
  };

  const cancelEditResource = () => {
    setEditingResourceIndex(null);
    setEditResource({});
  };

  const saveEditResource = () => {
    if (
      editingResourceIndex !== null &&
      editResource.name &&
      editResource.description
    ) {
      const updated = [...resources];
      updated[editingResourceIndex] = editResource as Resource;
      setResources(updated);
      setEditingResourceIndex(null);
      setEditResource({});
    }
  };

  // Inventory drag-and-drop and edit functions
  const handleInventoryDragStart = (index: number) => {
    setDraggedInventoryIndex(index);
  };

  const handleInventoryDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedInventoryIndex === null || draggedInventoryIndex === index)
      return;

    const newInventory = [...inventory];
    const draggedItem = newInventory[draggedInventoryIndex];
    newInventory.splice(draggedInventoryIndex, 1);
    newInventory.splice(index, 0, draggedItem);

    setInventory(newInventory);
    setDraggedInventoryIndex(index);
  };

  const handleInventoryDragEnd = () => {
    setDraggedInventoryIndex(null);
  };

  const moveInventoryUp = (index: number) => {
    if (index === 0) return;
    const newInventory = [...inventory];
    [newInventory[index - 1], newInventory[index]] = [
      newInventory[index],
      newInventory[index - 1],
    ];
    setInventory(newInventory);
  };

  const moveInventoryDown = (index: number) => {
    if (index === inventory.length - 1) return;
    const newInventory = [...inventory];
    [newInventory[index], newInventory[index + 1]] = [
      newInventory[index + 1],
      newInventory[index],
    ];
    setInventory(newInventory);
  };

  const startEditInventoryItem = (index: number) => {
    setEditingInventoryIndex(index);
    setEditInventoryItem({ ...inventory[index] });
  };

  const cancelEditInventoryItem = () => {
    setEditingInventoryIndex(null);
    setEditInventoryItem({});
  };

  const saveEditInventoryItem = () => {
    if (editingInventoryIndex !== null && editInventoryItem.name) {
      const updated = [...inventory];
      updated[editingInventoryIndex] = editInventoryItem as InventoryItem;
      setInventory(updated);
      setEditingInventoryIndex(null);
      setEditInventoryItem({});
    }
  };

  // Lore drag-and-drop functions (edit already exists)
  const handleLoreDragStart = (index: number) => {
    setDraggedLoreIndex(index);
  };

  const handleLoreDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedLoreIndex === null || draggedLoreIndex === index) return;

    const newLore = [...lore];
    const draggedItem = newLore[draggedLoreIndex];
    newLore.splice(draggedLoreIndex, 1);
    newLore.splice(index, 0, draggedItem);

    setLore(newLore);
    setDraggedLoreIndex(index);
  };

  const handleLoreDragEnd = () => {
    setDraggedLoreIndex(null);
  };

  const moveLoreUp = (index: number) => {
    if (index === 0) return;
    const newLore = [...lore];
    [newLore[index - 1], newLore[index]] = [newLore[index], newLore[index - 1]];
    setLore(newLore);
  };

  const moveLoreDown = (index: number) => {
    if (index === lore.length - 1) return;
    const newLore = [...lore];
    [newLore[index], newLore[index + 1]] = [newLore[index + 1], newLore[index]];
    setLore(newLore);
  };

  // Achievement drag-and-drop and edit functions
  const handleAchievementDragStart = (index: number) => {
    setDraggedAchievementIndex(index);
  };

  const handleAchievementDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedAchievementIndex === null || draggedAchievementIndex === index)
      return;

    const newAchievements = [...achievements];
    const draggedItem = newAchievements[draggedAchievementIndex];
    newAchievements.splice(draggedAchievementIndex, 1);
    newAchievements.splice(index, 0, draggedItem);

    setAchievements(newAchievements);
    setDraggedAchievementIndex(index);
  };

  const handleAchievementDragEnd = () => {
    setDraggedAchievementIndex(null);
  };

  const moveAchievementUp = (index: number) => {
    if (index === 0) return;
    const newAchievements = [...achievements];
    [newAchievements[index - 1], newAchievements[index]] = [
      newAchievements[index],
      newAchievements[index - 1],
    ];
    setAchievements(newAchievements);
  };

  const moveAchievementDown = (index: number) => {
    if (index === achievements.length - 1) return;
    const newAchievements = [...achievements];
    [newAchievements[index], newAchievements[index + 1]] = [
      newAchievements[index + 1],
      newAchievements[index],
    ];
    setAchievements(newAchievements);
  };

  const startEditAchievement = (index: number) => {
    setEditingAchievementIndex(index);
    setEditAchievement({ ...achievements[index] });
  };

  const cancelEditAchievement = () => {
    setEditingAchievementIndex(null);
    setEditAchievement({});
  };

  const saveEditAchievement = () => {
    if (
      editingAchievementIndex !== null &&
      editAchievement.title &&
      editAchievement.description
    ) {
      const updated = [...achievements];
      updated[editingAchievementIndex] = editAchievement as Achievement;
      setAchievements(updated);
      setEditingAchievementIndex(null);
      setEditAchievement({});
    }
  };

  const addLoreOnTrigger = () => {
    if (
      newLoreOnTrigger.trim() &&
      !newLore.on_triggers?.includes(newLoreOnTrigger.trim())
    ) {
      setNewLore({
        ...newLore,
        on_triggers: [...(newLore.on_triggers || []), newLoreOnTrigger.trim()],
      });
      setNewLoreOnTrigger("");
    }
  };

  const addLoreOffTrigger = () => {
    if (
      newLoreOffTrigger.trim() &&
      !newLore.off_triggers?.includes(newLoreOffTrigger.trim())
    ) {
      setNewLore({
        ...newLore,
        off_triggers: [
          ...(newLore.off_triggers || []),
          newLoreOffTrigger.trim(),
        ],
      });
      setNewLoreOffTrigger("");
    }
  };

  const addLoreKey = () => {
    if (newLoreKey.trim() && !newLore.keys?.includes(newLoreKey.trim())) {
      setNewLore({
        ...newLore,
        keys: [...(newLore.keys || []), newLoreKey.trim()],
      });
      setNewLoreKey("");
    }
  };

  const addLore = () => {
    if (newLore.title && newLore.content) {
      setLore([...lore, newLore as StoryLore]);
      setNewLore({
        title: "",
        content: "",
        relatedCharacters: [],
        relatedLocations: [],
        secrtet: false,
        keys: [],
        thumbnailUrl: "",
        on: true,
        beats_trigger: [],
        beats_untrigger: [],
      });
    }
  };

  const removeLore = (index: number) => {
    setLore(lore.filter((_, i) => i !== index));
  };

  const startEditLore = (index: number) => {
    setEditingLoreIndex(index);
    setEditLore({ ...lore[index] });
    setEditLoreOnTrigger("");
    setEditLoreOffTrigger("");
    setEditLoreKey("");
  };

  const cancelEditLore = () => {
    setEditingLoreIndex(null);
    setEditLore({});
  };

  const saveEditLore = () => {
    if (editingLoreIndex !== null && editLore.title && editLore.content) {
      const updated = [...lore];
      updated[editingLoreIndex] = editLore as StoryLore;
      setLore(updated);
      setEditingLoreIndex(null);
      setEditLore({});
    }
  };

  const addEditLoreOnTrigger = () => {
    if (
      editLoreOnTrigger.trim() &&
      !editLore.on_triggers?.includes(editLoreOnTrigger.trim())
    ) {
      setEditLore({
        ...editLore,
        on_triggers: [
          ...(editLore.on_triggers || []),
          editLoreOnTrigger.trim(),
        ],
      });
      setEditLoreOnTrigger("");
    }
  };

  const addEditLoreOffTrigger = () => {
    if (
      editLoreOffTrigger.trim() &&
      !editLore.off_triggers?.includes(editLoreOffTrigger.trim())
    ) {
      setEditLore({
        ...editLore,
        off_triggers: [
          ...(editLore.off_triggers || []),
          editLoreOffTrigger.trim(),
        ],
      });
      setEditLoreOffTrigger("");
    }
  };

  const addEditLoreKey = () => {
    if (editLoreKey.trim() && !editLore.keys?.includes(editLoreKey.trim())) {
      setEditLore({
        ...editLore,
        keys: [...(editLore.keys || []), editLoreKey.trim()],
      });
      setEditLoreKey("");
    }
  };

  const addAchievement = () => {
    if (newAchievement.title && newAchievement.description) {
      setAchievements([
        ...achievements,
        { ...newAchievement, dateAchieved: null } as Achievement,
      ]);
      setNewAchievement({
        title: "",
        description: "",
        points: 10,
        symbol: "🏆",
      });
    }
  };

  const removeAchievement = (index: number) => {
    setAchievements(achievements.filter((_, i) => i !== index));
  };

  const handleDiscardChanges = () => {
    if (!editAdventureId) {
      // For new adventures, clear the draft and reset to empty
      if (draftKey && typeof window !== "undefined") {
        window.localStorage.removeItem(draftKey);
      }
      // Reset all fields to defaults
      setTitle("");
      setShortDescription("");
      setDescription("");
      setDifficulty("Medium");
      setVisibility("public");
      setTags([]);
      setThumbnailUrl("");
      setBannerUrl("");
      setPlayerName("");
      setPlayerSummary("");
      setPremise("");
      setStartingContent("");
      setMaxChapters(8);
      setAuthorNotes("");
      setPoints(0);
      setMomentum(0);
      setMaxMomentum(100);
      setStats([]);
      setResources([]);
      setInventory([]);
      setPlotBeats([]);
      setLore([]);
      setAchievements([]);
      setCurrentStep("basic");
      addNotification("Draft cleared", "success");
    } else {
      // For editing, clear the draft and reload from server
      if (draftKey && typeof window !== "undefined") {
        window.localStorage.removeItem(draftKey);
      }
      addNotification("Discarding changes and reloading...", "success");
      // Force a hard reload to fetch fresh data
      if (typeof window !== "undefined") {
        window.location.reload();
      }
    }
  };

  const handleSave = async () => {
    // Validation
    if (!title.trim()) {
      addNotification("Please enter a title", "warning");
      setCurrentStep("basic");
      return;
    }
    if (!premise.trim() || !startingContent.trim()) {
      addNotification("Please fill in the story setup", "warning");
      setCurrentStep("premise");
      return;
    }

    setSaving(true);

    // Build the story data
    const storyData: Partial<StoryData> = {
      story_name: title,
      premise,
      player_name: playerName || "Hero",
      player_summary: playerSummary || "An adventurer",
      starting_content: startingContent,
      plot_beats: plotBeats,
      memory: [],
      max_chapters: maxChapters,
      currentChapter: 0,
      chapters: [],
      scene: { parts: [] },
      stats,
      resources,
      inventory,
      achievements,
      lore,
      quests,
      earnedPointsFromQuests: [],
      momentum,
      maxMomentum,
      points,
      earnedPointsFromBeats: [],
      earnedPointsFromChapters: [],
      author_notes: authorNotes,
      selected_preset: selectedPreset,
      presets: presets,
      upgradeSettings: upgradeSettings,
    };

    // Save to database
    try {
      // Get auth token
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("Not authenticated");
      }

      const isEditing = !!editAdventureId;
      const url = isEditing
        ? `/api/adventures/${editAdventureId}`
        : "/api/adventures";
      const method = isEditing ? "PATCH" : "POST";

      const payload = {
        title,
        shortDescription,
        description,
        thumbnailUrl: thumbnailUrl || null,
        bannerUrl: bannerUrl || null,
        authorId: user!.id,
        tags,
        difficulty: difficulty.toLowerCase(),
        visibility: visibility.toLowerCase(),
        estimatedDuration: "1-2 hours",
        isPublished: true,
        isFeatured: false,
        storyTemplate: storyData,
        selectedPreset: selectedPreset,
        presets: presets,
      };

      // Check payload size
      const payloadSize = JSON.stringify(payload).length;
      console.log(
        `Adventure payload size: ${(payloadSize / 1024).toFixed(2)} KB`
      );

      if (payloadSize > 4 * 1024 * 1024) {
        addNotification(
          "⚠️ Adventure data is very large (>4MB). Consider reducing lore entries or plot beats.",
          "warning"
        );
      }

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(
          error.error ||
            `Failed to ${isEditing ? "update" : "create"} adventure`
        );
      }

      const { adventure } = await response.json();
      addNotification(
        `✨ Adventure ${isEditing ? "updated" : "created"} successfully!`,
        "success"
      );

      // Clear local draft after successful save
      try {
        if (draftKey && typeof window !== "undefined") {
          window.localStorage.removeItem(draftKey);
        }
      } catch (err) {
        console.error("Failed to clear creator draft", err);
      }

      setSaving(false);
      router.push(`/explorer/${adventure.id}`);
    } catch (error: any) {
      console.error("Error saving adventure:", error);
      addNotification(`Failed to save: ${error.message}`, "failure");
      setSaving(false);
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case "basic":
        return (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-bold text-gray-900 dark:text-white mb-2">
                Adventure Title *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., The Dragon's Quest"
                className="w-full px-4 py-3 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:border-purple-500 dark:focus:border-purple-400 focus:ring-2 focus:ring-purple-200 dark:focus:ring-purple-800 transition-colors"
                maxLength={100}
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-900 dark:text-white mb-2">
                Short Description *
              </label>
              <input
                type="text"
                value={shortDescription}
                onChange={(e) => setShortDescription(e.target.value)}
                placeholder="A brief one-line summary"
                className="w-full px-4 py-3 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:border-purple-500 dark:focus:border-purple-400 focus:ring-2 focus:ring-purple-200 dark:focus:ring-purple-800 transition-colors"
                maxLength={150}
              />
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                {shortDescription.length}/150 characters
              </p>
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-900 dark:text-white mb-2">
                Full Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Write a compelling description of your adventure..."
                rows={5}
                className="w-full px-4 py-3 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:border-purple-500 dark:focus:border-purple-400 focus:ring-2 focus:ring-purple-200 dark:focus:ring-purple-800 transition-colors resize-none"
                maxLength={1000}
              />
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                {description.length}/1000 characters
              </p>
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-900 dark:text-white mb-2">
                Difficulty
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {(["Easy", "Medium", "Hard", "Expert"] as const).map((diff) => (
                  <button
                    key={diff}
                    onClick={() => setDifficulty(diff)}
                    className={`px-4 py-3 rounded-lg font-semibold border-2 transition-all ${
                      difficulty === diff
                        ? "bg-purple-600 text-white border-purple-600 ring-2 ring-purple-400"
                        : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-purple-400"
                    }`}
                  >
                    {diff}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-900 dark:text-white mb-2">
                Visibility
              </label>
              <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
                <strong>Public:</strong> Everyone can see and play.{" "}
                <strong>Hidden:</strong> Only accessible via direct link.{" "}
                <strong>Private:</strong> Only you can see.
              </p>
              <div className="grid grid-cols-3 gap-3">
                {(["public", "hidden", "private"] as const).map((vis) => (
                  <button
                    key={vis}
                    onClick={() => setVisibility(vis)}
                    className={`px-4 py-3 rounded-lg font-semibold border-2 transition-all capitalize ${
                      visibility === vis
                        ? "bg-blue-600 text-white border-blue-600 ring-2 ring-blue-400"
                        : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-blue-400"
                    }`}
                  >
                    {vis === "public"
                      ? "🌍 Public"
                      : vis === "hidden"
                      ? "🔗 Hidden"
                      : "🔒 Private"}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-900 dark:text-white mb-2">
                Tags
              </label>
              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) =>
                    e.key === "Enter" && (e.preventDefault(), addTag())
                  }
                  placeholder="Add a tag..."
                  className="flex-1 px-4 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:border-purple-500 dark:focus:border-purple-400 transition-colors"
                />
                <button
                  onClick={addTag}
                  className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors"
                >
                  Add
                </button>
              </div>

              <div className="mb-3">
                <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                  Quick add:
                </p>
                <div className="flex flex-wrap gap-2">
                  {commonTags
                    .filter((t) => !tags.includes(t))
                    .slice(0, 10)
                    .map((tag) => (
                      <button
                        key={tag}
                        onClick={() => setTags([...tags, tag])}
                        className="px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full text-sm hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors"
                      >
                        + {tag}
                      </button>
                    ))}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-3 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full text-sm font-semibold flex items-center gap-2"
                  >
                    {tag}
                    <button
                      onClick={() => removeTag(tag)}
                      className="hover:text-purple-900 dark:hover:text-purple-100"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>

            {/* Thumbnail Upload */}
            <div>
              <label className="block text-sm font-bold text-gray-900 dark:text-white mb-2">
                Thumbnail Image
              </label>
              <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
                Recommended: 400×300px (or 320×180px), max 5MB
              </p>
              <div className="flex items-start gap-4">
                {thumbnailUrl && (
                  <div className="relative">
                    <img
                      src={thumbnailUrl}
                      alt="Thumbnail preview"
                      className="w-32 h-24 object-cover rounded-lg border-2 border-gray-300 dark:border-gray-600"
                    />
                    <button
                      onClick={() => setThumbnailUrl("")}
                      className="absolute -top-2 -right-2 w-6 h-6 bg-red-600 hover:bg-red-700 text-white rounded-full flex items-center justify-center text-xs font-bold"
                    >
                      ×
                    </button>
                  </div>
                )}
                <div className="flex-1">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleThumbnailUpload}
                    disabled={uploadingThumbnail}
                    className="hidden"
                    id="thumbnail-upload"
                  />
                  <label
                    htmlFor="thumbnail-upload"
                    className={`block px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors text-center cursor-pointer ${
                      uploadingThumbnail ? "opacity-50 cursor-not-allowed" : ""
                    }`}
                  >
                    {uploadingThumbnail
                      ? "Uploading..."
                      : thumbnailUrl
                      ? "Change Thumbnail"
                      : "📸 Upload Thumbnail"}
                  </label>
                </div>
              </div>
            </div>

            {/* Banner Upload */}
            <div>
              <label className="block text-sm font-bold text-gray-900 dark:text-white mb-2">
                Banner Image
              </label>
              <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
                Recommended: 1200×400px, max 5MB
              </p>
              <div className="flex items-start gap-4">
                {bannerUrl && (
                  <div className="relative">
                    <img
                      src={bannerUrl}
                      alt="Banner preview"
                      className="w-48 h-16 object-cover rounded-lg border-2 border-gray-300 dark:border-gray-600"
                    />
                    <button
                      onClick={() => setBannerUrl("")}
                      className="absolute -top-2 -right-2 w-6 h-6 bg-red-600 hover:bg-red-700 text-white rounded-full flex items-center justify-center text-xs font-bold"
                    >
                      ×
                    </button>
                  </div>
                )}
                <div className="flex-1">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleBannerUpload}
                    disabled={uploadingBanner}
                    className="hidden"
                    id="banner-upload"
                  />
                  <label
                    htmlFor="banner-upload"
                    className={`block px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors text-center cursor-pointer ${
                      uploadingBanner ? "opacity-50 cursor-not-allowed" : ""
                    }`}
                  >
                    {uploadingBanner
                      ? "Uploading..."
                      : bannerUrl
                      ? "Change Banner"
                      : "🖼️ Upload Banner"}
                  </label>
                </div>
              </div>
            </div>
          </div>
        );

      case "preset":
        return (
          <div className="space-y-6">
            <div className="bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-300 dark:border-blue-700 rounded-lg p-4 mb-6">
              <h3 className="text-lg font-bold text-blue-900 dark:text-blue-100 mb-2">
                🎭 Character Presets
              </h3>
              <p className="text-sm text-blue-800 dark:text-blue-200">
                Create custom character presets for your adventure. Players can
                choose these when starting your adventure to customize their
                character's stats, items, and resources.
              </p>
            </div>

            {/* Create New Preset Button */}
            <div className="flex justify-between items-center mb-4">
              <h4 className="text-lg font-bold text-gray-900 dark:text-white">
                Your Presets
              </h4>
              <button
                onClick={() => {
                  setShowPresetForm(!showPresetForm);
                  setEditingPresetId(null);
                  setNewPresetName("");
                  setNewPresetDescription("");
                  setNewPresetIcon("⭐");
                }}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors"
              >
                {showPresetForm ? "Cancel" : "+ Create Preset"}
              </button>
            </div>

            {/* Preset Form */}
            {showPresetForm && (
              <div className="bg-gray-50 dark:bg-gray-700/50 border-2 border-gray-300 dark:border-gray-600 rounded-lg p-6 mb-6">
                <h5 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
                  {editingPresetId ? "Edit Preset" : "Create New Preset"}
                </h5>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-900 dark:text-white mb-2">
                      Preset Name *
                    </label>
                    <input
                      type="text"
                      value={newPresetName}
                      onChange={(e) => setNewPresetName(e.target.value)}
                      placeholder="e.g., Battle Mage"
                      className="w-full px-4 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:border-purple-500 transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-gray-900 dark:text-white mb-2">
                      Description *
                    </label>
                    <textarea
                      value={newPresetDescription}
                      onChange={(e) => setNewPresetDescription(e.target.value)}
                      placeholder="Describe this character archetype..."
                      rows={2}
                      className="w-full px-4 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:border-purple-500 transition-colors resize-none"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-gray-900 dark:text-white mb-2">
                      Icon *
                    </label>
                    <input
                      type="text"
                      value={newPresetIcon}
                      onChange={(e) => setNewPresetIcon(e.target.value)}
                      placeholder="Enter an emoji"
                      className="w-full px-4 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:border-purple-500 transition-colors"
                      maxLength={4}
                    />
                  </div>

                  <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700 rounded-lg p-3">
                    <p className="text-xs text-yellow-800 dark:text-yellow-200">
                      💡 <strong>Tip:</strong> The preset will copy your current
                      Player Name, Stats, Resources, Inventory, Player Summary,
                      and Author Notes. Make sure they're configured as you want
                      before saving!
                    </p>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        if (
                          !newPresetName.trim() ||
                          !newPresetDescription.trim()
                        ) {
                          addNotification(
                            "Please fill in all fields",
                            "warning"
                          );
                          return;
                        }

                        if (editingPresetId) {
                          // Update existing preset
                          setPresets(
                            presets.map((p) =>
                              p.id === editingPresetId
                                ? {
                                    ...p,
                                    name: newPresetName,
                                    description: newPresetDescription,
                                    icon: newPresetIcon,
                                    playerName,
                                    playerSummary,
                                    stats: JSON.parse(JSON.stringify(stats)),
                                    resources: JSON.parse(
                                      JSON.stringify(resources)
                                    ),
                                    inventory: JSON.parse(
                                      JSON.stringify(inventory)
                                    ),
                                    authorNotes,
                                  }
                                : p
                            )
                          );
                          addNotification("✨ Preset updated!", "success");
                        } else {
                          // Create new preset
                          const newPreset = createPresetFromCurrentSettings(
                            newPresetName,
                            newPresetDescription,
                            newPresetIcon,
                            playerName,
                            playerSummary,
                            stats,
                            resources,
                            inventory,
                            authorNotes
                          );
                          setPresets([...presets, newPreset]);
                          addNotification("✨ Preset created!", "success");
                        }

                        setShowPresetForm(false);
                        setEditingPresetId(null);
                        setNewPresetName("");
                        setNewPresetDescription("");
                        setNewPresetIcon("⭐");
                      }}
                      className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-colors"
                    >
                      {editingPresetId ? "Update Preset" : "Save Preset"}
                    </button>
                    <button
                      onClick={() => {
                        setShowPresetForm(false);
                        setEditingPresetId(null);
                        setNewPresetName("");
                        setNewPresetDescription("");
                        setNewPresetIcon("⭐");
                      }}
                      className="px-4 py-2 bg-gray-400 hover:bg-gray-500 text-white font-semibold rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Preset Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {presets.map((preset) => {
                const isSelected = selectedPreset === preset.id;
                return (
                  <div
                    key={preset.id}
                    className={`relative p-5 rounded-xl border-2 transition-all ${
                      isSelected
                        ? "bg-purple-100 dark:bg-purple-900/30 border-purple-500 dark:border-purple-400 ring-4 ring-purple-300 dark:ring-purple-700"
                        : "bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600"
                    }`}
                  >
                    <button
                      onClick={() => {
                        setSelectedPreset(preset.id);

                        // Apply preset immediately
                        if (preset.id !== "custom") {
                          applyPreset(
                            preset,
                            setPlayerName,
                            setPlayerSummary,
                            setStats,
                            setResources,
                            setInventory,
                            setAuthorNotes
                          );
                          addNotification(
                            `${preset.icon} ${preset.name} preset applied!`,
                            "success"
                          );
                        } else {
                          addNotification(
                            "✨ Custom preset selected - build from scratch!",
                            "success"
                          );
                        }
                      }}
                      className="text-left w-full"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="text-4xl">{preset.icon}</div>
                        {isSelected && (
                          <div className="text-purple-600 dark:text-purple-400 text-xl">
                            ✓
                          </div>
                        )}
                      </div>

                      <h4 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
                        {preset.name}
                      </h4>

                      <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
                        {preset.description}
                      </p>

                      {preset.id !== "custom" && (
                        <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                          <div>📊 {preset.stats?.length || 0} stats</div>
                          <div>
                            💎 {preset.resources?.length || 0} resources
                          </div>
                          <div>
                            🎒 {preset.inventory?.length || 0} starting items
                          </div>
                        </div>
                      )}
                    </button>

                    {/* Edit/Delete buttons for custom presets */}
                    {preset.id !== "custom" && (
                      <div className="flex gap-2 mt-3 pt-3 border-t border-gray-300 dark:border-gray-600">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingPresetId(preset.id);
                            setNewPresetName(preset.name);
                            setNewPresetDescription(preset.description);
                            setNewPresetIcon(preset.icon);
                            setShowPresetForm(true);
                          }}
                          className="flex-1 px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded transition-colors"
                        >
                          ✏️ Edit
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDialog({
                              isOpen: true,
                              title: "Delete Preset?",
                              message: `Delete "${preset.name}" preset? This cannot be undone.`,
                              icon: "🗑️",
                              confirmText: "Delete",
                              confirmButtonClass: "bg-red-600 hover:bg-red-700",
                              onConfirm: () => {
                                setConfirmDialog({
                                  ...confirmDialog,
                                  isOpen: false,
                                });
                                setPresets(
                                  presets.filter((p) => p.id !== preset.id)
                                );
                                if (selectedPreset === preset.id) {
                                  setSelectedPreset("custom");
                                }
                                addNotification("Preset deleted", "success");
                              },
                            });
                          }}
                          className="flex-1 px-3 py-1 text-xs bg-red-600 hover:bg-red-700 text-white font-semibold rounded transition-colors"
                        >
                          🗑️ Delete
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {selectedPreset && selectedPreset !== "custom" && (
              <div className="bg-green-50 dark:bg-green-900/20 border-2 border-green-300 dark:border-green-700 rounded-lg p-4">
                <h4 className="text-sm font-bold text-green-900 dark:text-green-100 mb-2">
                  ✨ Preset Applied
                </h4>
                <p className="text-xs text-green-800 dark:text-green-200">
                  Your character's stats, items, and resources have been
                  pre-configured. You can review and customize them in the
                  following steps.
                </p>
              </div>
            )}
          </div>
        );

      case "premise":
        return (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-bold text-gray-900 dark:text-white mb-2">
                Player Character Name
              </label>
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="e.g., Aria"
                className="w-full px-4 py-3 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:border-purple-500 dark:focus:border-purple-400 focus:ring-2 focus:ring-purple-200 dark:focus:ring-purple-800 transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-900 dark:text-white mb-2">
                Player Character Summary
              </label>
              <textarea
                value={playerSummary}
                onChange={(e) => setPlayerSummary(e.target.value)}
                placeholder="A brief description of who the player character is..."
                rows={3}
                className="w-full px-4 py-3 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:border-purple-500 dark:focus:border-purple-400 focus:ring-2 focus:ring-purple-200 dark:focus:ring-purple-800 transition-colors resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-900 dark:text-white mb-2">
                Story Premise *
              </label>
              <textarea
                value={premise}
                onChange={(e) => setPremise(e.target.value)}
                placeholder="A one-paragraph summary of the story's main conflict or goal..."
                rows={4}
                className="w-full px-4 py-3 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:border-purple-500 dark:focus:border-purple-400 focus:ring-2 focus:ring-purple-200 dark:focus:ring-purple-800 transition-colors resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-900 dark:text-white mb-2">
                Starting Content *
              </label>
              <textarea
                value={startingContent}
                onChange={(e) => setStartingContent(e.target.value)}
                placeholder="The opening text that players will see when they start the adventure..."
                rows={6}
                className="w-full px-4 py-3 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:border-purple-500 dark:focus:border-purple-400 focus:ring-2 focus:ring-purple-200 dark:focus:ring-purple-800 transition-colors resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-900 dark:text-white mb-2">
                Author Notes (Optional)
              </label>
              <textarea
                value={authorNotes}
                onChange={(e) => setAuthorNotes(e.target.value)}
                placeholder="Notes for yourself about the story direction, themes, etc..."
                rows={4}
                className="w-full px-4 py-3 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:border-purple-500 dark:focus:border-purple-400 focus:ring-2 focus:ring-purple-200 dark:focus:ring-purple-800 transition-colors resize-none"
              />
            </div>

            <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4">
              <p className="text-sm text-gray-700 dark:text-gray-300">
                💡 <strong>Tip:</strong> Story Points let players upgrade their
                character. Momentum builds up from dramatic moments and choices.
                Plot beat completion rewards points.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-bold text-gray-900 dark:text-white mb-2">
                  Starting Points
                </label>
                <input
                  type="number"
                  min="0"
                  value={points}
                  onChange={(e) => setPoints(parseInt(e.target.value) || 0)}
                  className="w-full px-4 py-3 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:border-purple-500 dark:focus:border-purple-400 focus:ring-2 focus:ring-purple-200 dark:focus:ring-purple-800 transition-colors"
                />
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                  Points players start with
                </p>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-900 dark:text-white mb-2">
                  Starting Momentum
                </label>
                <input
                  type="number"
                  min="0"
                  max={maxMomentum}
                  value={momentum}
                  onChange={(e) =>
                    setMomentum(
                      Math.min(parseInt(e.target.value) || 0, maxMomentum)
                    )
                  }
                  className="w-full px-4 py-3 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:border-purple-500 dark:focus:border-purple-400 focus:ring-2 focus:ring-purple-200 dark:focus:ring-purple-800 transition-colors"
                />
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                  Current momentum value
                </p>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-900 dark:text-white mb-2">
                  Max Momentum
                </label>
                <input
                  type="number"
                  min="1"
                  value={maxMomentum}
                  onChange={(e) =>
                    setMaxMomentum(Math.max(1, parseInt(e.target.value) || 5))
                  }
                  className="w-full px-4 py-3 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:border-purple-500 dark:focus:border-purple-400 focus:ring-2 focus:ring-purple-200 dark:focus:ring-purple-800 transition-colors"
                />
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                  Maximum momentum capacity
                </p>
              </div>
            </div>
          </div>
        );

      case "stats":
        return (
          <div className="space-y-6">
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <p className="text-sm text-gray-700 dark:text-gray-300">
                💡 <strong>Tip:</strong> Stats represent character attributes
                that can be tested during skill checks (like Strength,
                Intelligence, etc.). They range from 0-100.
              </p>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg border-2 border-gray-300 dark:border-gray-600 p-6">
              <h3 className="text-lg font-bold mb-4 text-gray-900 dark:text-white">
                Add New Stat
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Name *
                  </label>
                  <input
                    type="text"
                    value={newStat.name}
                    onChange={(e) =>
                      setNewStat({ ...newStat, name: e.target.value })
                    }
                    placeholder="e.g., Strength"
                    className="w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Symbol / Emoji
                  </label>
                  <input
                    type="text"
                    value={newStat.symbol}
                    onChange={(e) =>
                      setNewStat({ ...newStat, symbol: e.target.value })
                    }
                    placeholder="e.g., ⭐ or 💪"
                    className="w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    maxLength={4}
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Starting Value (0-100)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={newStat.value}
                    onChange={(e) =>
                      setNewStat({
                        ...newStat,
                        value: parseInt(e.target.value) || 0,
                      })
                    }
                    className="w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Description *
                  </label>
                  <input
                    type="text"
                    value={newStat.description}
                    onChange={(e) =>
                      setNewStat({ ...newStat, description: e.target.value })
                    }
                    placeholder="e.g., Physical power and combat prowess"
                    className="w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
              </div>
              <button
                onClick={addStat}
                disabled={!newStat.name || !newStat.description}
                className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors"
              >
                Add Stat
              </button>
            </div>

            <div className="space-y-3">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                Stats ({stats.length})
              </h3>
              {stats.length === 0 ? (
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  No stats added yet
                </p>
              ) : (
                stats.map((stat, index) =>
                  editingStatIndex === index ? (
                    // Edit mode
                    <div
                      key={index}
                      className="p-4 bg-blue-100 dark:bg-blue-900/40 rounded-lg border-2 border-blue-400 dark:border-blue-600"
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                            Name *
                          </label>
                          <input
                            type="text"
                            value={editStat.name || ""}
                            onChange={(e) =>
                              setEditStat({ ...editStat, name: e.target.value })
                            }
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                            Symbol
                          </label>
                          <input
                            type="text"
                            value={editStat.symbol || ""}
                            onChange={(e) =>
                              setEditStat({
                                ...editStat,
                                symbol: e.target.value,
                              })
                            }
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                            maxLength={4}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                            Value (0-100)
                          </label>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={editStat.value || 0}
                            onChange={(e) =>
                              setEditStat({
                                ...editStat,
                                value: parseInt(e.target.value) || 0,
                              })
                            }
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                            Description *
                          </label>
                          <input
                            type="text"
                            value={editStat.description || ""}
                            onChange={(e) =>
                              setEditStat({
                                ...editStat,
                                description: e.target.value,
                              })
                            }
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                          />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={saveEditStat}
                          disabled={!editStat.name || !editStat.description}
                          className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors text-sm"
                        >
                          💾 Save
                        </button>
                        <button
                          onClick={cancelEditStat}
                          className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors text-sm"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    // View mode with drag-and-drop
                    <div
                      key={index}
                      draggable
                      onDragStart={() => handleStatDragStart(index)}
                      onDragOver={(e) => handleStatDragOver(e, index)}
                      onDragEnd={handleStatDragEnd}
                      className="flex items-center gap-3 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800 cursor-move hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
                      style={{ opacity: draggedStatIndex === index ? 0.5 : 1 }}
                    >
                      <div className="text-gray-400 dark:text-gray-500 cursor-grab active:cursor-grabbing">
                        ⋮⋮
                      </div>
                      <span className="text-2xl">{stat.symbol}</span>
                      <div className="flex-1">
                        <div className="font-bold text-gray-900 dark:text-white">
                          {stat.name}
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          {stat.description}
                        </div>
                        <div className="text-sm text-blue-600 dark:text-blue-400 font-semibold">
                          Value: {stat.value}
                        </div>
                      </div>
                      {/* Button Area */}
                      <div className="flex flex-col items-center gap-2">
                        <div className="flex flex-row items-center gap-1 ml-3">
                          <button
                            onClick={() => moveStatUp(index)}
                            disabled={index === 0}
                            className="w-8 h-8 flex items-center justify-center bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded transition-colors text-sm"
                            title="Move up"
                          >
                            ▲
                          </button>
                          <button
                            onClick={() => moveStatDown(index)}
                            disabled={index === stats.length - 1}
                            className="w-8 h-8 flex items-center justify-center bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded transition-colors text-sm"
                            title="Move down"
                          >
                            ▼
                          </button>
                        </div>
                        <div className="flex flex-row items-center gap-1 ml-3">
                          <button
                            onClick={() => startEditStat(index)}
                            className="px-3 py-1 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg transition-colors text-sm"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => removeStat(index)}
                            className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-sm"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                )
              )}
            </div>
          </div>
        );

      case "resources":
        return (
          <div className="space-y-6">
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
              <p className="text-sm text-gray-700 dark:text-gray-300">
                💡 <strong>Tip:</strong> Resources are consumable values like
                Health, Mana, or Stamina that can be spent or restored during
                the adventure.
              </p>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg border-2 border-gray-300 dark:border-gray-600 p-6">
              <h3 className="text-lg font-bold mb-4 text-gray-900 dark:text-white">
                Add New Resource
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Name *
                  </label>
                  <input
                    type="text"
                    value={newResource.name}
                    onChange={(e) =>
                      setNewResource({ ...newResource, name: e.target.value })
                    }
                    placeholder="e.g., Health"
                    className="w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Symbol / Emoji
                  </label>
                  <input
                    type="text"
                    value={newResource.symbol}
                    onChange={(e) =>
                      setNewResource({ ...newResource, symbol: e.target.value })
                    }
                    placeholder="e.g., 💎 or ❤️"
                    className="w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    maxLength={4}
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Starting Value
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={newResource.value}
                    onChange={(e) =>
                      setNewResource({
                        ...newResource,
                        value: parseInt(e.target.value) || 0,
                      })
                    }
                    className="w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Max Value
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={newResource.maxValue}
                    onChange={(e) =>
                      setNewResource({
                        ...newResource,
                        maxValue: parseInt(e.target.value) || 100,
                      })
                    }
                    className="w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Description *
                  </label>
                  <input
                    type="text"
                    value={newResource.description}
                    onChange={(e) =>
                      setNewResource({
                        ...newResource,
                        description: e.target.value,
                      })
                    }
                    placeholder="e.g., Your life force"
                    className="w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
              </div>
              <button
                onClick={addResource}
                disabled={!newResource.name || !newResource.description}
                className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors"
              >
                Add Resource
              </button>
            </div>

            <div className="space-y-3">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                Resources ({resources.length})
              </h3>
              {resources.length === 0 ? (
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  No resources added yet
                </p>
              ) : (
                resources.map((resource, index) =>
                  editingResourceIndex === index ? (
                    // Edit mode
                    <div
                      key={index}
                      className="p-4 bg-green-100 dark:bg-green-900/40 rounded-lg border-2 border-green-400 dark:border-green-600"
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                            Name *
                          </label>
                          <input
                            type="text"
                            value={editResource.name || ""}
                            onChange={(e) =>
                              setEditResource({
                                ...editResource,
                                name: e.target.value,
                              })
                            }
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                            Symbol
                          </label>
                          <input
                            type="text"
                            value={editResource.symbol || ""}
                            onChange={(e) =>
                              setEditResource({
                                ...editResource,
                                symbol: e.target.value,
                              })
                            }
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                            maxLength={4}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                            Starting Value
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={editResource.value || 0}
                            onChange={(e) =>
                              setEditResource({
                                ...editResource,
                                value: parseInt(e.target.value) || 0,
                              })
                            }
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                            Max Value
                          </label>
                          <input
                            type="number"
                            min="1"
                            value={editResource.maxValue || 1}
                            onChange={(e) =>
                              setEditResource({
                                ...editResource,
                                maxValue: parseInt(e.target.value) || 1,
                              })
                            }
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                            Description *
                          </label>
                          <input
                            type="text"
                            value={editResource.description || ""}
                            onChange={(e) =>
                              setEditResource({
                                ...editResource,
                                description: e.target.value,
                              })
                            }
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                          />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={saveEditResource}
                          disabled={
                            !editResource.name || !editResource.description
                          }
                          className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors text-sm"
                        >
                          💾 Save
                        </button>
                        <button
                          onClick={cancelEditResource}
                          className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors text-sm"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    // View mode with drag-and-drop
                    <div
                      key={index}
                      draggable
                      onDragStart={() => handleResourceDragStart(index)}
                      onDragOver={(e) => handleResourceDragOver(e, index)}
                      onDragEnd={handleResourceDragEnd}
                      className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800 cursor-move hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
                      style={{
                        opacity: draggedResourceIndex === index ? 0.5 : 1,
                      }}
                    >
                      <div className="text-gray-400 dark:text-gray-500 cursor-grab active:cursor-grabbing">
                        ⋮⋮
                      </div>
                      <span className="text-2xl">{resource.symbol}</span>
                      <div className="flex-1">
                        <div className="font-bold text-gray-900 dark:text-white">
                          {resource.name}
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          {resource.description}
                        </div>
                        <div className="text-sm text-green-600 dark:text-green-400 font-semibold">
                          {resource.value}/{resource.maxValue}
                        </div>
                      </div>
                      <div className="flex flex-col items-center gap-2">
                        <div className="flex flex-row items-center gap-1 ml-3">
                          <button
                            onClick={() => moveResourceUp(index)}
                            disabled={index === 0}
                            className="w-8 h-8 flex items-center justify-center bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded transition-colors text-sm"
                            title="Move up"
                          >
                            ▲
                          </button>
                          <button
                            onClick={() => moveResourceDown(index)}
                            disabled={index === resources.length - 1}
                            className="w-8 h-8 flex items-center justify-center bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded transition-colors text-sm"
                            title="Move down"
                          >
                            ▼
                          </button>
                        </div>
                        <div className="flex flex-row items-center gap-1 ml-3">
                          <button
                            onClick={() => startEditResource(index)}
                            className="px-3 py-1 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg transition-colors text-sm"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => removeResource(index)}
                            className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-sm"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                )
              )}
            </div>
          </div>
        );

      case "inventory":
        return (
          <div className="space-y-6">
            <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4">
              <p className="text-sm text-gray-700 dark:text-gray-300">
                💡 <strong>Tip:</strong> Starting inventory items that players
                begin the adventure with.
              </p>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg border-2 border-gray-300 dark:border-gray-600 p-6">
              <h3 className="text-lg font-bold mb-4 text-gray-900 dark:text-white">
                Add Starting Item
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Name *
                  </label>
                  <input
                    type="text"
                    value={newItem.name}
                    onChange={(e) =>
                      setNewItem({ ...newItem, name: e.target.value })
                    }
                    placeholder="e.g., Rusty Sword"
                    className="w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Symbol / Emoji
                  </label>
                  <input
                    type="text"
                    value={newItem.symbol}
                    onChange={(e) =>
                      setNewItem({ ...newItem, symbol: e.target.value })
                    }
                    placeholder="e.g., 🗡️ or 🎒"
                    className="w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    maxLength={4}
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Quantity
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={newItem.quantity}
                    onChange={(e) =>
                      setNewItem({
                        ...newItem,
                        quantity: parseInt(e.target.value) || 1,
                      })
                    }
                    className="w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Type
                  </label>
                  <select
                    value={newItem.type}
                    onChange={(e) =>
                      setNewItem({
                        ...newItem,
                        type: e.target.value as
                          | "normal"
                          | "consumable"
                          | "story"
                          | "misc",
                      })
                    }
                    className="w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value="normal">Normal Item</option>
                    <option value="consumable">Consumable</option>
                    <option value="story">Story Item</option>
                    <option value="misc">Miscellaneous</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Description
                  </label>
                  <input
                    type="text"
                    value={newItem.description}
                    onChange={(e) =>
                      setNewItem({ ...newItem, description: e.target.value })
                    }
                    placeholder="e.g., A worn but reliable blade"
                    className="w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
              </div>
              <button
                onClick={addInventoryItem}
                disabled={!newItem.name}
                className="w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors"
              >
                Add Item
              </button>
            </div>

            <div className="space-y-3">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                Starting Inventory ({inventory.length})
              </h3>
              {inventory.length === 0 ? (
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  No items added yet
                </p>
              ) : (
                inventory.map((item, index) =>
                  editingInventoryIndex === index ? (
                    // Edit mode
                    <div
                      key={index}
                      className="p-4 bg-purple-100 dark:bg-purple-900/40 rounded-lg border-2 border-purple-400 dark:border-purple-600"
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                            Name *
                          </label>
                          <input
                            type="text"
                            value={editInventoryItem.name || ""}
                            onChange={(e) =>
                              setEditInventoryItem({
                                ...editInventoryItem,
                                name: e.target.value,
                              })
                            }
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                            Symbol
                          </label>
                          <input
                            type="text"
                            value={editInventoryItem.symbol || ""}
                            onChange={(e) =>
                              setEditInventoryItem({
                                ...editInventoryItem,
                                symbol: e.target.value,
                              })
                            }
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                            maxLength={4}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                            Quantity
                          </label>
                          <input
                            type="number"
                            min="1"
                            value={editInventoryItem.quantity || 1}
                            onChange={(e) =>
                              setEditInventoryItem({
                                ...editInventoryItem,
                                quantity: parseInt(e.target.value) || 1,
                              })
                            }
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                            Type
                          </label>
                          <select
                            value={editInventoryItem.type || "misc"}
                            onChange={(e) =>
                              setEditInventoryItem({
                                ...editInventoryItem,
                                type: e.target.value as any,
                              })
                            }
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                          >
                            <option value="weapon">Weapon</option>
                            <option value="armor">Armor</option>
                            <option value="consumable">Consumable</option>
                            <option value="misc">Misc</option>
                          </select>
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                            Description
                          </label>
                          <input
                            type="text"
                            value={editInventoryItem.description || ""}
                            onChange={(e) =>
                              setEditInventoryItem({
                                ...editInventoryItem,
                                description: e.target.value,
                              })
                            }
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                          />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={saveEditInventoryItem}
                          disabled={!editInventoryItem.name}
                          className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors text-sm"
                        >
                          💾 Save
                        </button>
                        <button
                          onClick={cancelEditInventoryItem}
                          className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors text-sm"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    // View mode with drag-and-drop
                    <div
                      key={index}
                      draggable
                      onDragStart={() => handleInventoryDragStart(index)}
                      onDragOver={(e) => handleInventoryDragOver(e, index)}
                      onDragEnd={handleInventoryDragEnd}
                      className="flex items-center gap-3 p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800 cursor-move hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors"
                      style={{
                        opacity: draggedInventoryIndex === index ? 0.5 : 1,
                      }}
                    >
                      <div className="text-gray-400 dark:text-gray-500 cursor-grab active:cursor-grabbing">
                        ⋮⋮
                      </div>
                      <span className="text-2xl">{item.symbol}</span>
                      <div className="flex-1">
                        <div className="font-bold text-gray-900 dark:text-white">
                          {item.name} ×{item.quantity}
                        </div>
                        {item.description && (
                          <div className="text-sm text-gray-600 dark:text-gray-400">
                            {item.description}
                          </div>
                        )}
                        <div className="text-xs text-purple-600 dark:text-purple-400">
                          {item.type}
                        </div>
                      </div>
                      <div className="flex flex-col items-center gap-2">
                        <div className="flex flex-row items-center gap-1 ml-3">
                          <button
                            onClick={() => moveInventoryUp(index)}
                            disabled={index === 0}
                            className="w-8 h-8 flex items-center justify-center bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded transition-colors text-sm"
                            title="Move up"
                          >
                            ▲
                          </button>
                          <button
                            onClick={() => moveInventoryDown(index)}
                            disabled={index === inventory.length - 1}
                            className="w-8 h-8 flex items-center justify-center bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded transition-colors text-sm"
                            title="Move down"
                          >
                            ▼
                          </button>
                        </div>
                        <div className="flex flex-row items-center gap-1 ml-3">
                          <button
                            onClick={() => startEditInventoryItem(index)}
                            className="px-3 py-1 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg transition-colors text-sm"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => removeInventoryItem(index)}
                            className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-sm"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                )
              )}
            </div>
          </div>
        );

      case "lore":
        return (
          <div className="space-y-6">
            <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg p-4">
              <p className="text-sm text-gray-700 dark:text-gray-300">
                💡 <strong>Tip:</strong> Lore entries provide background
                information about your world. Keys determine when the lore is
                revealed during gameplay (e.g., "Ancient Ruins", "Dragon
                Defeated").
              </p>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg border-2 border-gray-300 dark:border-gray-600 p-6">
              <h3 className="text-lg font-bold mb-4 text-gray-900 dark:text-white">
                Add Lore Entry
              </h3>
              <div className="space-y-4 mb-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Title *
                  </label>
                  <input
                    type="text"
                    value={newLore.title}
                    onChange={(e) =>
                      setNewLore({ ...newLore, title: e.target.value })
                    }
                    placeholder="e.g., The Ancient Prophecy"
                    className="w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Content *
                  </label>
                  <textarea
                    value={newLore.content}
                    onChange={(e) =>
                      setNewLore({ ...newLore, content: e.target.value })
                    }
                    placeholder="Write the lore entry content..."
                    rows={5}
                    className="w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none"
                  />
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="loreSecret"
                      checked={newLore.secrtet || false}
                      onChange={(e) =>
                        setNewLore({ ...newLore, secrtet: e.target.checked })
                      }
                      className="w-4 h-4 text-purple-600 rounded"
                    />
                    <label
                      htmlFor="loreSecret"
                      className="text-sm text-gray-700 dark:text-gray-300"
                    >
                      🔒 Hidden (only revealed when triggered by keys)
                    </label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="loreOn"
                      checked={newLore.on !== false}
                      onChange={(e) =>
                        setNewLore({ ...newLore, on: e.target.checked })
                      }
                      className="w-4 h-4 text-green-600 rounded"
                    />
                    <label
                      htmlFor="loreOn"
                      className="text-sm text-gray-700 dark:text-gray-300"
                    >
                      Enabled
                    </label>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Thumbnail (optional)
                  </label>
                  <div className="flex items-start gap-3">
                    {newLore.thumbnailUrl ? (
                      <div className="relative">
                        <img
                          src={newLore.thumbnailUrl}
                          alt="Lore thumbnail"
                          className="w-24 h-24 object-cover rounded border"
                        />
                        <button
                          onClick={() =>
                            setNewLore({ ...newLore, thumbnailUrl: "" })
                          }
                          className="absolute -top-2 -right-2 w-6 h-6 bg-red-600 hover:bg-red-700 text-white rounded-full text-xs"
                        >
                          ×
                        </button>
                      </div>
                    ) : (
                      <div className="w-24 h-24 rounded border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center text-xs text-gray-500 dark:text-gray-400">
                        No Preview
                      </div>
                    )}
                    <div>
                      <input
                        id="new-lore-thumb"
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          if (!file.type.startsWith("image/")) {
                            addNotification(
                              "Please select an image file",
                              "warning"
                            );
                            return;
                          }
                          if (file.size > 5 * 1024 * 1024) {
                            addNotification(
                              "Image must be smaller than 5MB",
                              "warning"
                            );
                            return;
                          }
                          try {
                            const {
                              data: { session },
                            } = await supabase.auth.getSession();
                            if (!session) throw new Error("Not authenticated");
                            const ext = file.name.split(".").pop();
                            const fileName = `${
                              user!.id
                            }-${Date.now()}-lore-thumb.${ext}`;
                            const filePath = `lore-thumbnails/${fileName}`;
                            const { error: uploadError } =
                              await supabase.storage
                                .from("adventure-images")
                                .upload(filePath, file, {
                                  cacheControl: "3600",
                                  upsert: false,
                                });
                            if (uploadError) throw uploadError;
                            const { data } = supabase.storage
                              .from("adventure-images")
                              .getPublicUrl(filePath);
                            setNewLore({
                              ...newLore,
                              thumbnailUrl: data.publicUrl,
                            });
                            addNotification("Thumbnail uploaded!", "success");
                          } catch (err: any) {
                            console.error("Upload failed:", err);
                            addNotification(
                              err.message || "Upload failed",
                              "failure"
                            );
                          }
                        }}
                      />
                      <label
                        htmlFor="new-lore-thumb"
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded cursor-pointer inline-block"
                      >
                        📸 Upload Thumbnail
                      </label>
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    ✅ ON Triggers (Words that turn this lore ON)
                  </label>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={newLoreOnTrigger}
                      onChange={(e) => setNewLoreOnTrigger(e.target.value)}
                      onKeyDown={(e) =>
                        e.key === "Enter" &&
                        (e.preventDefault(), addLoreOnTrigger())
                      }
                      placeholder="e.g., 'Ancient Map'"
                      className="flex-1 px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                    <button
                      onClick={addLoreOnTrigger}
                      className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                    >
                      Add
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(newLore.on_triggers || []).map((trigger) => (
                      <span
                        key={trigger}
                        className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full text-sm flex items-center gap-1"
                      >
                        ✅ {trigger}
                        <button
                          onClick={() =>
                            setNewLore({
                              ...newLore,
                              on_triggers: (newLore.on_triggers || []).filter(
                                (t) => t !== trigger
                              ),
                            })
                          }
                          className="hover:text-green-900 dark:hover:text-green-100"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    ❌ OFF Triggers (Words that turn this lore OFF)
                  </label>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={newLoreOffTrigger}
                      onChange={(e) => setNewLoreOffTrigger(e.target.value)}
                      onKeyDown={(e) =>
                        e.key === "Enter" &&
                        (e.preventDefault(), addLoreOffTrigger())
                      }
                      placeholder="e.g., 'Destroyed the Map'"
                      className="flex-1 px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                    <button
                      onClick={addLoreOffTrigger}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                    >
                      Add
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(newLore.off_triggers || []).map((trigger) => (
                      <span
                        key={trigger}
                        className="px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-full text-sm flex items-center gap-1"
                      >
                        ❌ {trigger}
                        <button
                          onClick={() =>
                            setNewLore({
                              ...newLore,
                              off_triggers: (newLore.off_triggers || []).filter(
                                (t) => t !== trigger
                              ),
                            })
                          }
                          className="hover:text-red-900 dark:hover:text-red-100"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
                {newLore.secrtet && (
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                      🔑 Trigger Keys (Words that reveal this lore)
                    </label>
                    <div className="flex gap-2 mb-2">
                      <input
                        type="text"
                        value={newLoreKey}
                        onChange={(e) => setNewLoreKey(e.target.value)}
                        onKeyDown={(e) =>
                          e.key === "Enter" &&
                          (e.preventDefault(), addLoreKey())
                        }
                        placeholder="e.g., 'Dragon Defeated' or 'Ancient Ruins'"
                        className="flex-1 px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                      <button
                        onClick={addLoreKey}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
                      >
                        Add
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(newLore.keys || []).map((key) => (
                        <span
                          key={key}
                          className="px-2 py-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 rounded-full text-sm flex items-center gap-1"
                        >
                          🔑 {key}
                          <button
                            onClick={() =>
                              setNewLore({
                                ...newLore,
                                keys: (newLore.keys || []).filter(
                                  (k) => k !== key
                                ),
                              })
                            }
                            className="hover:text-yellow-900 dark:hover:text-yellow-100"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {/* Plot Beat Triggers */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      ✅ Beats that turn this lore ON
                    </label>
                    <div className="max-h-40 overflow-y-auto border border-gray-300 dark:border-gray-600 rounded-lg p-2 bg-white dark:bg-gray-700">
                      {plotBeats.length === 0 ? (
                        <p className="text-xs text-gray-500 dark:text-gray-400 italic">
                          No plot beats yet. Add them in the Plot Beats step.
                        </p>
                      ) : (
                        plotBeats.map((beat, beatIndex) => (
                          <label
                            key={beatIndex}
                            className="flex items-center gap-2 px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-600 rounded cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={(newLore.beats_trigger || []).includes(
                                beatIndex
                              )}
                              onChange={(e) => {
                                const current = newLore.beats_trigger || [];
                                setNewLore({
                                  ...newLore,
                                  beats_trigger: e.target.checked
                                    ? [...current, beatIndex]
                                    : current.filter((i) => i !== beatIndex),
                                });
                              }}
                              className="w-4 h-4 text-green-600 rounded"
                            />
                            <span className="text-xs text-gray-900 dark:text-white">
                              {beat.title || `Beat ${beatIndex + 1}`}
                            </span>
                          </label>
                        ))
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      ❌ Beats that turn this lore OFF
                    </label>
                    <div className="max-h-40 overflow-y-auto border border-gray-300 dark:border-gray-600 rounded-lg p-2 bg-white dark:bg-gray-700">
                      {plotBeats.length === 0 ? (
                        <p className="text-xs text-gray-500 dark:text-gray-400 italic">
                          No plot beats yet. Add them in the Plot Beats step.
                        </p>
                      ) : (
                        plotBeats.map((beat, beatIndex) => (
                          <label
                            key={beatIndex}
                            className="flex items-center gap-2 px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-600 rounded cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={(newLore.beats_untrigger || []).includes(
                                beatIndex
                              )}
                              onChange={(e) => {
                                const current = newLore.beats_untrigger || [];
                                setNewLore({
                                  ...newLore,
                                  beats_untrigger: e.target.checked
                                    ? [...current, beatIndex]
                                    : current.filter((i) => i !== beatIndex),
                                });
                              }}
                              className="w-4 h-4 text-red-600 rounded"
                            />
                            <span className="text-xs text-gray-900 dark:text-white">
                              {beat.title || `Beat ${beatIndex + 1}`}
                            </span>
                          </label>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <button
                onClick={addLore}
                disabled={!newLore.title || !newLore.content}
                className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors"
              >
                Add Lore Entry
              </button>
            </div>

            <div className="space-y-3">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                Lore Entries ({lore.length})
              </h3>
              {lore.length === 0 ? (
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  No lore entries added yet
                </p>
              ) : (
                lore.map((entry, index) => (
                  <div
                    key={index}
                    draggable={editingLoreIndex !== index}
                    onDragStart={() => handleLoreDragStart(index)}
                    onDragOver={(e) => handleLoreDragOver(e, index)}
                    onDragEnd={handleLoreDragEnd}
                    className="p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border border-indigo-200 dark:border-indigo-800"
                    style={{
                      opacity: draggedLoreIndex === index ? 0.5 : 1,
                      cursor: editingLoreIndex === index ? "default" : "move",
                    }}
                  >
                    {editingLoreIndex === index ? (
                      // Edit mode
                      <div className="space-y-4">
                        <h4 className="text-md font-bold text-indigo-900 dark:text-indigo-100">
                          ✏️ Editing Lore Entry
                        </h4>
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                            Title *
                          </label>
                          <input
                            type="text"
                            value={editLore.title || ""}
                            onChange={(e) =>
                              setEditLore({
                                ...editLore,
                                title: e.target.value,
                              })
                            }
                            className="w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                            Content *
                          </label>
                          <textarea
                            value={editLore.content || ""}
                            onChange={(e) =>
                              setEditLore({
                                ...editLore,
                                content: e.target.value,
                              })
                            }
                            rows={5}
                            className="w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none"
                          />
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              id={`edit-lore-secret-${index}`}
                              checked={editLore.secrtet || false}
                              onChange={(e) =>
                                setEditLore({
                                  ...editLore,
                                  secrtet: e.target.checked,
                                })
                              }
                              className="w-4 h-4 text-purple-600 rounded"
                            />
                            <label
                              htmlFor={`edit-lore-secret-${index}`}
                              className="text-sm text-gray-700 dark:text-gray-300"
                            >
                              Secret
                            </label>
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              id={`edit-lore-on-${index}`}
                              checked={editLore.on !== false}
                              onChange={(e) =>
                                setEditLore({
                                  ...editLore,
                                  on: e.target.checked,
                                })
                              }
                              className="w-4 h-4 text-green-600 rounded"
                            />
                            <label
                              htmlFor={`edit-lore-on-${index}`}
                              className="text-sm text-gray-700 dark:text-gray-300"
                            >
                              Enabled
                            </label>
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                            Thumbnail
                          </label>
                          <div className="flex items-start gap-3">
                            {editLore.thumbnailUrl ? (
                              <div className="relative">
                                <img
                                  src={editLore.thumbnailUrl}
                                  alt="Lore thumb"
                                  className="w-24 h-24 object-cover rounded border"
                                />
                                <button
                                  onClick={() =>
                                    setEditLore({
                                      ...editLore,
                                      thumbnailUrl: "",
                                    })
                                  }
                                  className="absolute -top-2 -right-2 w-6 h-6 bg-red-600 hover:bg-red-700 text-white rounded-full text-xs"
                                >
                                  ×
                                </button>
                              </div>
                            ) : (
                              <div className="w-24 h-24 rounded border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center text-xs text-gray-500 dark:text-gray-400">
                                No Preview
                              </div>
                            )}
                            <div>
                              <input
                                id={`edit-mode-lore-thumb-${index}`}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={async (e) => {
                                  const file = e.target.files?.[0];
                                  if (!file) return;
                                  if (!file.type.startsWith("image/")) {
                                    addNotification(
                                      "Please select an image file",
                                      "warning"
                                    );
                                    return;
                                  }
                                  if (file.size > 5 * 1024 * 1024) {
                                    addNotification(
                                      "Image must be smaller than 5MB",
                                      "warning"
                                    );
                                    return;
                                  }
                                  try {
                                    const {
                                      data: { session },
                                    } = await supabase.auth.getSession();
                                    if (!session)
                                      throw new Error("Not authenticated");
                                    const ext = file.name.split(".").pop();
                                    const fileName = `${
                                      user!.id
                                    }-${Date.now()}-lore-thumb.${ext}`;
                                    const filePath = `lore-thumbnails/${fileName}`;
                                    const { error: uploadError } =
                                      await supabase.storage
                                        .from("adventure-images")
                                        .upload(filePath, file, {
                                          cacheControl: "3600",
                                          upsert: false,
                                        });
                                    if (uploadError) throw uploadError;
                                    const { data } = supabase.storage
                                      .from("adventure-images")
                                      .getPublicUrl(filePath);
                                    setEditLore({
                                      ...editLore,
                                      thumbnailUrl: data.publicUrl,
                                    });
                                    addNotification(
                                      "Thumbnail uploaded!",
                                      "success"
                                    );
                                  } catch (err: any) {
                                    console.error("Upload failed:", err);
                                    addNotification(
                                      err.message || "Upload failed",
                                      "failure"
                                    );
                                  }
                                }}
                              />
                              <label
                                htmlFor={`edit-mode-lore-thumb-${index}`}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded cursor-pointer inline-block text-sm"
                              >
                                📸 Upload Thumbnail
                              </label>
                            </div>
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                            ✅ ON Triggers
                          </label>
                          <div className="flex gap-2 mb-2">
                            <input
                              type="text"
                              value={editLoreOnTrigger}
                              onChange={(e) =>
                                setEditLoreOnTrigger(e.target.value)
                              }
                              onKeyDown={(e) =>
                                e.key === "Enter" &&
                                (e.preventDefault(), addEditLoreOnTrigger())
                              }
                              placeholder="e.g., 'Ancient Map'"
                              className="flex-1 px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            />
                            <button
                              onClick={addEditLoreOnTrigger}
                              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm"
                            >
                              Add
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {(editLore.on_triggers || []).map((trigger) => (
                              <span
                                key={trigger}
                                className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full text-sm flex items-center gap-1"
                              >
                                ✅ {trigger}
                                <button
                                  onClick={() =>
                                    setEditLore({
                                      ...editLore,
                                      on_triggers: (
                                        editLore.on_triggers || []
                                      ).filter((t) => t !== trigger),
                                    })
                                  }
                                  className="hover:text-green-900 dark:hover:text-green-100"
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                            ❌ OFF Triggers
                          </label>
                          <div className="flex gap-2 mb-2">
                            <input
                              type="text"
                              value={editLoreOffTrigger}
                              onChange={(e) =>
                                setEditLoreOffTrigger(e.target.value)
                              }
                              onKeyDown={(e) =>
                                e.key === "Enter" &&
                                (e.preventDefault(), addEditLoreOffTrigger())
                              }
                              placeholder="e.g., 'Destroyed the Map'"
                              className="flex-1 px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            />
                            <button
                              onClick={addEditLoreOffTrigger}
                              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm"
                            >
                              Add
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {(editLore.off_triggers || []).map((trigger) => (
                              <span
                                key={trigger}
                                className="px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-full text-sm flex items-center gap-1"
                              >
                                ❌ {trigger}
                                <button
                                  onClick={() =>
                                    setEditLore({
                                      ...editLore,
                                      off_triggers: (
                                        editLore.off_triggers || []
                                      ).filter((t) => t !== trigger),
                                    })
                                  }
                                  className="hover:text-red-900 dark:hover:text-red-100"
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                          </div>
                        </div>
                        {editLore.secrtet && (
                          <div>
                            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                              🔑 Trigger Keys
                            </label>
                            <div className="flex gap-2 mb-2">
                              <input
                                type="text"
                                value={editLoreKey}
                                onChange={(e) => setEditLoreKey(e.target.value)}
                                onKeyDown={(e) =>
                                  e.key === "Enter" &&
                                  (e.preventDefault(), addEditLoreKey())
                                }
                                placeholder="e.g., 'Dragon Defeated'"
                                className="flex-1 px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                              />
                              <button
                                onClick={addEditLoreKey}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm"
                              >
                                Add
                              </button>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {(editLore.keys || []).map((key) => (
                                <span
                                  key={key}
                                  className="px-2 py-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 rounded-full text-sm flex items-center gap-1"
                                >
                                  🔑 {key}
                                  <button
                                    onClick={() =>
                                      setEditLore({
                                        ...editLore,
                                        keys: (editLore.keys || []).filter(
                                          (k) => k !== key
                                        ),
                                      })
                                    }
                                    className="hover:text-yellow-900 dark:hover:text-yellow-100"
                                  >
                                    ×
                                  </button>
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {/* Plot Beat Triggers */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                              ✅ Beats that turn this lore ON
                            </label>
                            <div className="max-h-40 overflow-y-auto border border-gray-300 dark:border-gray-600 rounded-lg p-2 bg-white dark:bg-gray-700">
                              {plotBeats.length === 0 ? (
                                <p className="text-xs text-gray-500 dark:text-gray-400 italic">
                                  No plot beats yet. Add them in the Plot Beats
                                  step.
                                </p>
                              ) : (
                                plotBeats.map((beat, beatIndex) => (
                                  <label
                                    key={beatIndex}
                                    className="flex items-center gap-2 px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-600 rounded cursor-pointer"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={(
                                        editLore.beats_trigger || []
                                      ).includes(beatIndex)}
                                      onChange={(e) => {
                                        const current =
                                          editLore.beats_trigger || [];
                                        setEditLore({
                                          ...editLore,
                                          beats_trigger: e.target.checked
                                            ? [...current, beatIndex]
                                            : current.filter(
                                                (i) => i !== beatIndex
                                              ),
                                        });
                                      }}
                                      className="w-4 h-4 text-green-600 rounded"
                                    />
                                    <span className="text-xs text-gray-900 dark:text-white">
                                      {beat.title || `Beat ${beatIndex + 1}`}
                                    </span>
                                  </label>
                                ))
                              )}
                            </div>
                          </div>
                          <div>
                            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                              ❌ Beats that turn this lore OFF
                            </label>
                            <div className="max-h-40 overflow-y-auto border border-gray-300 dark:border-gray-600 rounded-lg p-2 bg-white dark:bg-gray-700">
                              {plotBeats.length === 0 ? (
                                <p className="text-xs text-gray-500 dark:text-gray-400 italic">
                                  No plot beats yet. Add them in the Plot Beats
                                  step.
                                </p>
                              ) : (
                                plotBeats.map((beat, beatIndex) => (
                                  <label
                                    key={beatIndex}
                                    className="flex items-center gap-2 px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-600 rounded cursor-pointer"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={(
                                        editLore.beats_untrigger || []
                                      ).includes(beatIndex)}
                                      onChange={(e) => {
                                        const current =
                                          editLore.beats_untrigger || [];
                                        setEditLore({
                                          ...editLore,
                                          beats_untrigger: e.target.checked
                                            ? [...current, beatIndex]
                                            : current.filter(
                                                (i) => i !== beatIndex
                                              ),
                                        });
                                      }}
                                      className="w-4 h-4 text-red-600 rounded"
                                    />
                                    <span className="text-xs text-gray-900 dark:text-white">
                                      {beat.title || `Beat ${beatIndex + 1}`}
                                    </span>
                                  </label>
                                ))
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2 pt-2">
                          <button
                            onClick={saveEditLore}
                            disabled={!editLore.title || !editLore.content}
                            className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-semibold rounded-lg"
                          >
                            ✓ Save Changes
                          </button>
                          <button
                            onClick={cancelEditLore}
                            className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white font-semibold rounded-lg"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      // View mode with drag-and-drop
                      <div className="flex items-start justify-between">
                        <div className="text-gray-400 dark:text-gray-500 cursor-grab active:cursor-grabbing mr-3 mt-1">
                          ⋮⋮
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <div className="font-bold text-gray-900 dark:text-white">
                              {entry.title}
                            </div>
                            {entry.secrtet && (
                              <span className="text-xs px-2 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 rounded-full">
                                🔒 Hidden
                              </span>
                            )}
                            {/* On/Off Toggle */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const updated = [...lore];
                                updated[index] = { ...entry, on: !entry.on };
                                setLore(updated);
                              }}
                              className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                                entry.on
                                  ? "bg-green-600 text-white hover:bg-green-700"
                                  : "bg-gray-400 text-white hover:bg-gray-500"
                              }`}
                              title={
                                entry.on
                                  ? "Lore is enabled"
                                  : "Lore is disabled"
                              }
                            >
                              {entry.on ? "ON" : "OFF"}
                            </button>
                          </div>
                          {entry.thumbnailUrl && (
                            <img
                              src={entry.thumbnailUrl}
                              alt="Lore thumb"
                              className="w-24 h-24 object-cover rounded border mb-2"
                            />
                          )}
                          <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                            {entry.content}
                          </div>
                          {entry.on_triggers &&
                            entry.on_triggers.length > 0 && (
                              <div className="text-xs text-green-700 dark:text-green-400 mb-1">
                                <strong>✅ ON Triggers:</strong>{" "}
                                {entry.on_triggers.join(", ")}
                              </div>
                            )}
                          {entry.off_triggers &&
                            entry.off_triggers.length > 0 && (
                              <div className="text-xs text-red-700 dark:text-red-400 mb-1">
                                <strong>❌ OFF Triggers:</strong>{" "}
                                {entry.off_triggers.join(", ")}
                              </div>
                            )}
                          {entry.secrtet && entry.keys.length > 0 && (
                            <div className="text-xs text-yellow-700 dark:text-yellow-400">
                              <strong>Triggers:</strong> {entry.keys.join(", ")}
                            </div>
                          )}
                          {entry.beats_trigger &&
                            entry.beats_trigger.length > 0 && (
                              <div className="text-xs text-green-700 dark:text-green-400 mb-1">
                                <strong>✅ Beats turning ON:</strong>{" "}
                                {entry.beats_trigger
                                  .map(
                                    (i) =>
                                      plotBeats[i]?.title || `Beat ${i + 1}`
                                  )
                                  .join(", ")}
                              </div>
                            )}
                          {entry.beats_untrigger &&
                            entry.beats_untrigger.length > 0 && (
                              <div className="text-xs text-red-700 dark:text-red-400 mb-1">
                                <strong>❌ Beats turning OFF:</strong>{" "}
                                {entry.beats_untrigger
                                  .map(
                                    (i) =>
                                      plotBeats[i]?.title || `Beat ${i + 1}`
                                  )
                                  .join(", ")}
                              </div>
                            )}
                        </div>
                        <div className="flex flex-col items-center  gap-2 ml-3">
                          <div className="flex flex-row items-center gap-1 ml-3">
                            <button
                              onClick={() => moveLoreUp(index)}
                              disabled={index === 0}
                              className="w-8 h-8 flex items-center justify-center bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded transition-colors text-sm"
                              title="Move up"
                            >
                              ▲
                            </button>
                            <button
                              onClick={() => moveLoreDown(index)}
                              disabled={index === lore.length - 1}
                              className="w-8 h-8 flex items-center justify-center bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded transition-colors text-sm"
                              title="Move down"
                            >
                              ▼
                            </button>
                          </div>
                          <div className="flex flex-row items-center gap-1 ml-3">
                            <button
                              onClick={() => startEditLore(index)}
                              className="px-3 py-1 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg transition-colors text-sm"
                            >
                              ✏️
                            </button>
                            <button
                              onClick={() => removeLore(index)}
                              className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-sm"
                            >
                              🗑️
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        );

      case "achievements":
        return (
          <div className="space-y-6">
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
              <p className="text-sm text-gray-700 dark:text-gray-300">
                💡 <strong>Tip:</strong> Achievements reward players for
                completing specific goals or milestones (optional).
              </p>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg border-2 border-gray-300 dark:border-gray-600 p-6">
              <h3 className="text-lg font-bold mb-4 text-gray-900 dark:text-white">
                Add Achievement
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Title *
                  </label>
                  <input
                    type="text"
                    value={newAchievement.title}
                    onChange={(e) =>
                      setNewAchievement({
                        ...newAchievement,
                        title: e.target.value,
                      })
                    }
                    placeholder="e.g., Dragon Slayer"
                    className="w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Symbol / Emoji
                  </label>
                  <input
                    type="text"
                    value={newAchievement.symbol}
                    onChange={(e) =>
                      setNewAchievement({
                        ...newAchievement,
                        symbol: e.target.value,
                      })
                    }
                    placeholder="e.g., 🏆 or ⭐"
                    className="w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    maxLength={4}
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Points
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={newAchievement.points}
                    onChange={(e) =>
                      setNewAchievement({
                        ...newAchievement,
                        points: parseInt(e.target.value) || 10,
                      })
                    }
                    className="w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Description *{" "}
                    <span className="text-xs text-gray-500">
                      (shown to players)
                    </span>
                  </label>
                  <input
                    type="text"
                    value={newAchievement.description}
                    onChange={(e) =>
                      setNewAchievement({
                        ...newAchievement,
                        description: e.target.value,
                      })
                    }
                    placeholder="e.g., Defeat your first dragon"
                    className="w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    AI Hint{" "}
                    <span className="text-xs text-gray-500">
                      (optional, for precise triggering)
                    </span>
                  </label>
                  <input
                    type="text"
                    value={newAchievement.ai_hint || ""}
                    onChange={(e) =>
                      setNewAchievement({
                        ...newAchievement,
                        ai_hint: e.target.value,
                      })
                    }
                    placeholder="e.g., Trigger when player defeats the red dragon in the mountain lair"
                    className="w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    💡 Keep player description vague to encourage discovery; use
                    AI hint for exact trigger conditions.
                  </p>
                </div>
                <div className="sm:col-span-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newAchievement.hidden || false}
                      onChange={(e) =>
                        setNewAchievement({
                          ...newAchievement,
                          hidden: e.target.checked,
                        })
                      }
                      className="w-4 h-4 text-purple-600 bg-gray-100 border-gray-300 rounded focus:ring-purple-500"
                    />
                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                      🔒 Hidden Achievement
                    </span>
                  </label>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 ml-6">
                    Hidden from player but visible to AI for triggering. Players
                    discover these through gameplay.
                  </p>
                </div>
              </div>
              <button
                onClick={addAchievement}
                disabled={!newAchievement.title || !newAchievement.description}
                className="w-full px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors"
              >
                Add Achievement
              </button>
            </div>

            <div className="space-y-3">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                Achievements ({achievements.length})
              </h3>
              {achievements.length === 0 ? (
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  No achievements added yet
                </p>
              ) : (
                achievements.map((achievement, index) =>
                  editingAchievementIndex === index ? (
                    // Edit mode
                    <div
                      key={index}
                      className="p-4 bg-amber-100 dark:bg-amber-900/40 rounded-lg border-2 border-amber-400 dark:border-amber-600"
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                            Title *
                          </label>
                          <input
                            type="text"
                            value={editAchievement.title || ""}
                            onChange={(e) =>
                              setEditAchievement({
                                ...editAchievement,
                                title: e.target.value,
                              })
                            }
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                            Symbol
                          </label>
                          <input
                            type="text"
                            value={editAchievement.symbol || ""}
                            onChange={(e) =>
                              setEditAchievement({
                                ...editAchievement,
                                symbol: e.target.value,
                              })
                            }
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                            maxLength={4}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                            Points
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={editAchievement.points || 10}
                            onChange={(e) =>
                              setEditAchievement({
                                ...editAchievement,
                                points: parseInt(e.target.value) || 10,
                              })
                            }
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                            Description *{" "}
                            <span className="text-xs text-gray-500">
                              (shown to players)
                            </span>
                          </label>
                          <input
                            type="text"
                            value={editAchievement.description || ""}
                            onChange={(e) =>
                              setEditAchievement({
                                ...editAchievement,
                                description: e.target.value,
                              })
                            }
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                            AI Hint{" "}
                            <span className="text-xs text-gray-500">
                              (optional)
                            </span>
                          </label>
                          <input
                            type="text"
                            value={editAchievement.ai_hint || ""}
                            onChange={(e) =>
                              setEditAchievement({
                                ...editAchievement,
                                ai_hint: e.target.value,
                              })
                            }
                            placeholder="Precise trigger conditions for AI"
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={editAchievement.hidden || false}
                              onChange={(e) =>
                                setEditAchievement({
                                  ...editAchievement,
                                  hidden: e.target.checked,
                                })
                              }
                              className="w-4 h-4 text-purple-600 bg-gray-100 border-gray-300 rounded focus:ring-purple-500"
                            />
                            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                              🔒 Hidden Achievement
                            </span>
                          </label>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={saveEditAchievement}
                          disabled={
                            !editAchievement.title ||
                            !editAchievement.description
                          }
                          className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors text-sm"
                        >
                          💾 Save
                        </button>
                        <button
                          onClick={cancelEditAchievement}
                          className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors text-sm"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    // View mode with drag-and-drop
                    <div
                      key={index}
                      draggable
                      onDragStart={() => handleAchievementDragStart(index)}
                      onDragOver={(e) => handleAchievementDragOver(e, index)}
                      onDragEnd={handleAchievementDragEnd}
                      className="flex items-center gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800 cursor-move hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
                      style={{
                        opacity: draggedAchievementIndex === index ? 0.5 : 1,
                      }}
                    >
                      <div className="text-gray-400 dark:text-gray-500 cursor-grab active:cursor-grabbing">
                        ⋮⋮
                      </div>
                      <span className="text-2xl">{achievement.symbol}</span>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <div className="font-bold text-gray-900 dark:text-white">
                            {achievement.title}
                          </div>
                          {achievement.hidden && (
                            <span className="px-2 py-0.5 bg-purple-200 dark:bg-purple-800/50 text-purple-800 dark:text-purple-200 rounded-full text-xs font-bold">
                              🔒 Hidden
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          {achievement.description}
                        </div>
                        <div className="text-sm text-amber-600 dark:text-amber-400 font-semibold">
                          {achievement.points} points
                        </div>
                      </div>
                      <div className="flex flex-col items-center gap-2">
                        <div className="flex flex-row items-center gap-1">
                          <button
                            onClick={() => moveAchievementUp(index)}
                            disabled={index === 0}
                            className="w-8 h-8 flex items-center justify-center bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded transition-colors text-sm"
                            title="Move up"
                          >
                            ▲
                          </button>
                          <button
                            onClick={() => moveAchievementDown(index)}
                            disabled={index === achievements.length - 1}
                            className="w-8 h-8 flex items-center justify-center bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded transition-colors text-sm"
                            title="Move down"
                          >
                            ▼
                          </button>
                        </div>
                        <div className="flex flex-row items-center gap-1">
                          <button
                            onClick={() => startEditAchievement(index)}
                            className="px-3 py-1 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg transition-colors text-sm"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => removeAchievement(index)}
                            className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-sm"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                )
              )}
            </div>
          </div>
        );

      case "plot":
        return (
          <div className="space-y-6">
            <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4">
              <p className="text-sm text-gray-700 dark:text-gray-300">
                💡 <strong>Tip:</strong> Plot beats are key story moments you
                want to guide the AI toward (optional but helpful for structured
                stories).
              </p>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg border-2 border-gray-300 dark:border-gray-600 p-6">
              <h3 className="text-lg font-bold mb-4 text-gray-900 dark:text-white">
                Add Plot Beat
              </h3>
              <div className="space-y-4 mb-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Title *
                  </label>
                  <input
                    type="text"
                    value={newPlotBeat.title}
                    onChange={(e) =>
                      setNewPlotBeat({ ...newPlotBeat, title: e.target.value })
                    }
                    placeholder="e.g., The Ancient Prophecy"
                    className="w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Content *
                  </label>
                  <textarea
                    value={newPlotBeat.content}
                    onChange={(e) =>
                      setNewPlotBeat({
                        ...newPlotBeat,
                        content: e.target.value,
                      })
                    }
                    placeholder="e.g., The player discovers the truth about the ancient prophecy"
                    rows={3}
                    className="w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Points Reward (optional)
                  </label>
                  <input
                    type="number"
                    value={newPlotBeat.points ?? ""}
                    onChange={(e) =>
                      setNewPlotBeat({
                        ...newPlotBeat,
                        points: e.target.value
                          ? parseInt(e.target.value)
                          : undefined,
                      })
                    }
                    placeholder="Default: 25"
                    min="0"
                    className="w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Leave empty to use default (25 points)
                  </p>
                </div>
              </div>
              <button
                onClick={addPlotBeat}
                disabled={!newPlotBeat.title || !newPlotBeat.content}
                className="w-full px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors"
              >
                Add Plot Beat
              </button>
            </div>

            <div className="space-y-3">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                Plot Beats ({plotBeats.length})
              </h3>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                💡 Drag and drop to reorder (or use arrow buttons on mobile)
              </p>
              {plotBeats.length === 0 ? (
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  No plot beats added yet
                </p>
              ) : (
                plotBeats.map((beat, index) => (
                  <div
                    key={index}
                    draggable={editingPlotBeatIndex !== index}
                    onDragStart={() => handlePlotBeatDragStart(index)}
                    onDragOver={(e) => handlePlotBeatDragOver(e, index)}
                    onDragEnd={handlePlotBeatDragEnd}
                    className={`p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800 transition-opacity ${
                      editingPlotBeatIndex === index ? "" : "cursor-move"
                    } ${
                      draggedPlotBeatIndex === index
                        ? "opacity-50"
                        : "opacity-100"
                    }`}
                  >
                    {editingPlotBeatIndex === index ? (
                      // Edit mode
                      <div className="space-y-4">
                        <h4 className="text-md font-bold text-orange-900 dark:text-orange-100">
                          ✏️ Editing Plot Beat
                        </h4>
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                            Title *
                          </label>
                          <input
                            type="text"
                            value={editPlotBeat.title || ""}
                            onChange={(e) =>
                              setEditPlotBeat({
                                ...editPlotBeat,
                                title: e.target.value,
                              })
                            }
                            className="w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                            Content *
                          </label>
                          <textarea
                            value={editPlotBeat.content || ""}
                            onChange={(e) =>
                              setEditPlotBeat({
                                ...editPlotBeat,
                                content: e.target.value,
                              })
                            }
                            rows={3}
                            className="w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                            Points Reward (optional)
                          </label>
                          <input
                            type="number"
                            value={editPlotBeat.points ?? ""}
                            onChange={(e) =>
                              setEditPlotBeat({
                                ...editPlotBeat,
                                points: e.target.value
                                  ? parseInt(e.target.value)
                                  : undefined,
                              })
                            }
                            placeholder="Default: 25"
                            min="0"
                            className="w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                          />
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            Leave empty to use default (25 points)
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={saveEditPlotBeat}
                            disabled={
                              !editPlotBeat.title || !editPlotBeat.content
                            }
                            className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-semibold rounded-lg"
                          >
                            ✓ Save Changes
                          </button>
                          <button
                            onClick={cancelEditPlotBeat}
                            className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white font-semibold rounded-lg"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      // View mode
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 flex-1">
                          <div className="text-2xl cursor-grab active:cursor-grabbing select-none">
                            ⋮⋮
                          </div>
                          <div className="flex-1">
                            <div className="font-bold text-gray-900 dark:text-white mb-1">
                              {beat.title}
                            </div>
                            <div className="text-sm text-gray-600 dark:text-gray-400">
                              {beat.content}
                            </div>
                            {beat.points !== undefined && (
                              <div className="text-xs text-orange-600 dark:text-orange-400 mt-1 font-semibold">
                                💰 {beat.points} points
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col gap-2">
                          <div className="flex flex-col items-center  gap-2 ml-3">
                            <div className="flex flex-row items-center gap-1 ml-3">
                              <button
                                onClick={() => movePlotBeatUp(index)}
                                disabled={index === 0}
                                className="px-2 py-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded text-xs transition-colors"
                                title="Move up"
                              >
                                ▲
                              </button>
                              <button
                                onClick={() => movePlotBeatDown(index)}
                                disabled={index === plotBeats.length - 1}
                                className="px-2 py-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded text-xs transition-colors"
                                title="Move down"
                              >
                                ▼
                              </button>
                            </div>

                            <div className="flex flex-row items-center gap-1 ml-3">
                              <button
                                onClick={() => startEditPlotBeat(index)}
                                className="px-3 py-1 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg transition-colors text-sm"
                              >
                                ✏️
                              </button>
                              <button
                                onClick={() => removePlotBeat(index)}
                                className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-sm"
                              >
                                🗑️
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        );

      case "quests":
        return (
          <div className="space-y-6">
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <p className="text-sm text-gray-700 dark:text-gray-300">
                💡 <strong>Tip:</strong> Quests provide structured objectives
                for players. They can be created upfront or generated
                dynamically by the AI during gameplay.
              </p>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg border-2 border-gray-300 dark:border-gray-600 p-6">
              <h3 className="text-lg font-bold mb-4 text-gray-900 dark:text-white">
                Add Quest
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Title *
                  </label>
                  <input
                    type="text"
                    value={newQuest.title}
                    onChange={(e) =>
                      setNewQuest({
                        ...newQuest,
                        title: e.target.value,
                      })
                    }
                    placeholder="e.g., Find the Lost Artifact"
                    className="w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Short Description *
                  </label>
                  <input
                    type="text"
                    value={newQuest.shortDescription}
                    onChange={(e) =>
                      setNewQuest({
                        ...newQuest,
                        shortDescription: e.target.value,
                      })
                    }
                    placeholder="e.g., Recover the ancient relic from the temple"
                    className="w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Full Description *
                  </label>
                  <textarea
                    value={newQuest.description}
                    onChange={(e) =>
                      setNewQuest({
                        ...newQuest,
                        description: e.target.value,
                      })
                    }
                    placeholder="Detailed quest description with context and objectives..."
                    rows={3}
                    className="w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Points Reward
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={newQuest.points}
                    onChange={(e) =>
                      setNewQuest({
                        ...newQuest,
                        points: parseInt(e.target.value) || 10,
                      })
                    }
                    className="w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newQuest.active}
                      onChange={(e) =>
                        setNewQuest({
                          ...newQuest,
                          active: e.target.checked,
                        })
                      }
                      className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                      Active
                    </span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newQuest.fulfilled}
                      onChange={(e) =>
                        setNewQuest({
                          ...newQuest,
                          fulfilled: e.target.checked,
                        })
                      }
                      className="w-4 h-4 text-green-600 bg-gray-100 border-gray-300 rounded focus:ring-green-500"
                    />
                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                      Fulfilled
                    </span>
                  </label>
                </div>
              </div>
              <button
                onClick={() => {
                  if (
                    !newQuest.title ||
                    !newQuest.shortDescription ||
                    !newQuest.description
                  ) {
                    addNotification(
                      "Please fill in all required fields",
                      "warning"
                    );
                    return;
                  }
                  const quest: Quest = {
                    id: Date.now().toString(),
                    title: newQuest.title,
                    shortDescription: newQuest.shortDescription,
                    description: newQuest.description,
                    active: newQuest.active ?? true,
                    fulfilled: newQuest.fulfilled ?? false,
                    points: newQuest.points ?? 10,
                    createdAt: new Date(),
                  };
                  setQuests([...quests, quest]);
                  setNewQuest({
                    title: "",
                    shortDescription: "",
                    description: "",
                    active: true,
                    fulfilled: false,
                    points: 10,
                  });
                  addNotification("Quest added!", "success");
                }}
                disabled={
                  !newQuest.title ||
                  !newQuest.shortDescription ||
                  !newQuest.description
                }
                className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors"
              >
                Add Quest
              </button>
            </div>

            <div className="space-y-3">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                Quests ({quests.length})
              </h3>
              {quests.length === 0 ? (
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  No quests added yet
                </p>
              ) : (
                quests.map((quest, index) =>
                  editingQuestIndex === index ? (
                    // Edit mode
                    <div
                      key={quest.id}
                      className="p-4 bg-blue-100 dark:bg-blue-900/40 rounded-lg border-2 border-blue-400 dark:border-blue-600"
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                            Title *
                          </label>
                          <input
                            type="text"
                            value={editQuest.title || ""}
                            onChange={(e) =>
                              setEditQuest({
                                ...editQuest,
                                title: e.target.value,
                              })
                            }
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                            Short Description *
                          </label>
                          <input
                            type="text"
                            value={editQuest.shortDescription || ""}
                            onChange={(e) =>
                              setEditQuest({
                                ...editQuest,
                                shortDescription: e.target.value,
                              })
                            }
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                            Full Description *
                          </label>
                          <textarea
                            value={editQuest.description || ""}
                            onChange={(e) =>
                              setEditQuest({
                                ...editQuest,
                                description: e.target.value,
                              })
                            }
                            rows={3}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm resize-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                            Points
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={editQuest.points || 10}
                            onChange={(e) =>
                              setEditQuest({
                                ...editQuest,
                                points: parseInt(e.target.value) || 10,
                              })
                            }
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                          />
                        </div>
                        <div className="flex items-center gap-4">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={editQuest.active || false}
                              onChange={(e) =>
                                setEditQuest({
                                  ...editQuest,
                                  active: e.target.checked,
                                })
                              }
                              className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                            />
                            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                              Active
                            </span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={editQuest.fulfilled || false}
                              onChange={(e) =>
                                setEditQuest({
                                  ...editQuest,
                                  fulfilled: e.target.checked,
                                })
                              }
                              className="w-4 h-4 text-green-600 bg-gray-100 border-gray-300 rounded focus:ring-green-500"
                            />
                            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                              Fulfilled
                            </span>
                          </label>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            if (
                              !editQuest.title ||
                              !editQuest.shortDescription ||
                              !editQuest.description
                            ) {
                              addNotification(
                                "Please fill in all required fields",
                                "warning"
                              );
                              return;
                            }
                            const updated = [...quests];
                            updated[editingQuestIndex] = editQuest as Quest;
                            setQuests(updated);
                            setEditingQuestIndex(null);
                            setEditQuest({});
                            addNotification("Quest updated!", "success");
                          }}
                          disabled={
                            !editQuest.title ||
                            !editQuest.shortDescription ||
                            !editQuest.description
                          }
                          className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors text-sm"
                        >
                          💾 Save
                        </button>
                        <button
                          onClick={() => {
                            setEditingQuestIndex(null);
                            setEditQuest({});
                          }}
                          className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors text-sm"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    // View mode with drag-and-drop
                    <div
                      key={quest.id || `quest-${index}`}
                      draggable
                      onDragStart={() => setDraggedQuestIndex(index)}
                      onDragOver={(e) => {
                        e.preventDefault();
                        if (
                          draggedQuestIndex !== null &&
                          draggedQuestIndex !== index
                        ) {
                          const updated = [...quests];
                          const [dragged] = updated.splice(
                            draggedQuestIndex,
                            1
                          );
                          updated.splice(index, 0, dragged);
                          setQuests(updated);
                          setDraggedQuestIndex(index);
                        }
                      }}
                      onDragEnd={() => setDraggedQuestIndex(null)}
                      className="flex items-start gap-3 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800 cursor-move hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
                      style={{
                        opacity: draggedQuestIndex === index ? 0.5 : 1,
                      }}
                    >
                      <div className="text-gray-400 dark:text-gray-500 cursor-grab active:cursor-grabbing">
                        ⋮⋮
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="font-bold text-gray-900 dark:text-white">
                            {quest.title}
                          </div>
                          {quest.active && (
                            <span className="px-2 py-0.5 bg-blue-200 dark:bg-blue-800/50 text-blue-800 dark:text-blue-200 rounded-full text-xs font-bold">
                              Active
                            </span>
                          )}
                          {quest.fulfilled && (
                            <span className="px-2 py-0.5 bg-green-200 dark:bg-green-800/50 text-green-800 dark:text-green-200 rounded-full text-xs font-bold">
                              Fulfilled
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                          {quest.shortDescription}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-500 mb-2">
                          {quest.description}
                        </div>
                        <div className="text-sm text-blue-600 dark:text-blue-400 font-semibold">
                          {quest.points} points
                        </div>
                      </div>
                      <div className="flex flex-col items-center  gap-2 ml-3">
                        <div className="flex flex-row items-center gap-1 ml-3">
                          <button
                            onClick={() => {
                              if (index === 0) return;
                              const updated = [...quests];
                              [updated[index - 1], updated[index]] = [
                                updated[index],
                                updated[index - 1],
                              ];
                              setQuests(updated);
                            }}
                            disabled={index === 0}
                            className="w-8 h-8 flex items-center justify-center bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded transition-colors text-sm"
                            title="Move up"
                          >
                            ▲
                          </button>
                          <button
                            onClick={() => {
                              if (index === quests.length - 1) return;
                              const updated = [...quests];
                              [updated[index + 1], updated[index]] = [
                                updated[index],
                                updated[index + 1],
                              ];
                              setQuests(updated);
                            }}
                            disabled={index === quests.length - 1}
                            className="w-8 h-8 flex items-center justify-center bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded transition-colors text-sm"
                            title="Move down"
                          >
                            ▼
                          </button>
                        </div>
                        <div className="flex flex-row items-center gap-1 ml-3">
                          <button
                            onClick={() => {
                              setEditingQuestIndex(index);
                              setEditQuest({ ...quest });
                            }}
                            className="px-3 py-1 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg transition-colors text-sm"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => {
                              setConfirmDialog({
                                isOpen: true,
                                title: "Remove Quest?",
                                message: `Remove quest "${quest.title}"? This cannot be undone.`,
                                icon: "🗑️",
                                confirmText: "Remove",
                                confirmButtonClass:
                                  "bg-red-600 hover:bg-red-700",
                                onConfirm: () => {
                                  setConfirmDialog({
                                    ...confirmDialog,
                                    isOpen: false,
                                  });
                                  setQuests(
                                    quests.filter((_, i) => i !== index)
                                  );
                                  addNotification("Quest removed", "success");
                                },
                              });
                            }}
                            className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-sm"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                )
              )}
            </div>
          </div>
        );

      case "upgrades":
        return (
          <div className="space-y-6">
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <p className="text-sm text-blue-900 dark:text-blue-100">
                💡 Configure the upgrade system for your adventure. Control
                whether players can spend points to upgrade stats, resources, or
                add items, and customize the costs and amounts.
              </p>
            </div>

            {/* Master Toggle */}
            <div className="bg-white dark:bg-gray-800 rounded-lg border-2 border-gray-300 dark:border-gray-600 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">
                    Enable Upgrade System
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Allow players to spend points on upgrades
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={upgradeSettings.enabled}
                    onChange={(e) =>
                      setUpgradeSettings({
                        ...upgradeSettings,
                        enabled: e.target.checked,
                      })
                    }
                    className="sr-only peer"
                  />
                  <div className="w-14 h-7 bg-gray-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 dark:peer-focus:ring-purple-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-4 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all dark:border-gray-600 peer-checked:bg-purple-600"></div>
                </label>
              </div>
            </div>

            {upgradeSettings.enabled && (
              <>
                {/* Stat Upgrades */}
                <div className="bg-white dark:bg-gray-800 rounded-lg border-2 border-gray-300 dark:border-gray-600 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                      📊 Stat Upgrades
                    </h3>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={upgradeSettings.allowStatUpgrade}
                        onChange={(e) =>
                          setUpgradeSettings({
                            ...upgradeSettings,
                            allowStatUpgrade: e.target.checked,
                          })
                        }
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                    </label>
                  </div>

                  {upgradeSettings.allowStatUpgrade && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                          Cost (points)
                        </label>
                        <input
                          type="number"
                          value={upgradeSettings.statUpgradeCost}
                          onChange={(e) =>
                            setUpgradeSettings({
                              ...upgradeSettings,
                              statUpgradeCost: Math.max(
                                1,
                                parseInt(e.target.value) || 1
                              ),
                            })
                          }
                          min="1"
                          className="w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                          Increase Amount
                        </label>
                        <input
                          type="number"
                          value={upgradeSettings.statUpgradeAmount}
                          onChange={(e) =>
                            setUpgradeSettings({
                              ...upgradeSettings,
                              statUpgradeAmount: Math.max(
                                1,
                                parseInt(e.target.value) || 1
                              ),
                            })
                          }
                          min="1"
                          max="10"
                          className="w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Resource Upgrades */}
                <div className="bg-white dark:bg-gray-800 rounded-lg border-2 border-gray-300 dark:border-gray-600 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                      ⚡ Resource Upgrades
                    </h3>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={upgradeSettings.allowResourceUpgrade}
                        onChange={(e) =>
                          setUpgradeSettings({
                            ...upgradeSettings,
                            allowResourceUpgrade: e.target.checked,
                          })
                        }
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-300 dark:peer-focus:ring-green-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-green-600"></div>
                    </label>
                  </div>

                  {upgradeSettings.allowResourceUpgrade && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                          Cost (points)
                        </label>
                        <input
                          type="number"
                          value={upgradeSettings.resourceUpgradeCost}
                          onChange={(e) =>
                            setUpgradeSettings({
                              ...upgradeSettings,
                              resourceUpgradeCost: Math.max(
                                1,
                                parseInt(e.target.value) || 1
                              ),
                            })
                          }
                          min="1"
                          className="w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                          Max Value Increase
                        </label>
                        <input
                          type="number"
                          value={upgradeSettings.resourceUpgradeAmount}
                          onChange={(e) =>
                            setUpgradeSettings({
                              ...upgradeSettings,
                              resourceUpgradeAmount: Math.max(
                                1,
                                parseInt(e.target.value) || 1
                              ),
                            })
                          }
                          min="1"
                          max="50"
                          className="w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Add Item */}
                <div className="bg-white dark:bg-gray-800 rounded-lg border-2 border-gray-300 dark:border-gray-600 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                      🎒 Add Custom Items
                    </h3>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={upgradeSettings.allowAddItem}
                        onChange={(e) =>
                          setUpgradeSettings({
                            ...upgradeSettings,
                            allowAddItem: e.target.checked,
                          })
                        }
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 dark:peer-focus:ring-purple-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-purple-600"></div>
                    </label>
                  </div>

                  {upgradeSettings.allowAddItem && (
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        Cost (points per item)
                      </label>
                      <input
                        type="number"
                        value={upgradeSettings.addItemCost}
                        onChange={(e) =>
                          setUpgradeSettings({
                            ...upgradeSettings,
                            addItemCost: Math.max(
                              1,
                              parseInt(e.target.value) || 1
                            ),
                          })
                        }
                        min="1"
                        className="w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                    </div>
                  )}
                </div>

                {/* Stat Shop */}
                <div className="bg-white dark:bg-gray-800 rounded-lg border-2 border-gray-300 dark:border-gray-600 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                      🏪 Stat Shop
                    </h3>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={upgradeSettings.statShopEnabled}
                        onChange={(e) =>
                          setUpgradeSettings({
                            ...upgradeSettings,
                            statShopEnabled: e.target.checked,
                          })
                        }
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-cyan-300 dark:peer-focus:ring-cyan-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-cyan-600"></div>
                    </label>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-4">
                    Allow players to unlock new stats with points
                  </p>

                  {upgradeSettings.statShopEnabled && (
                    <div className="space-y-3">
                      <button
                        onClick={() => {
                          const newStat = {
                            name: "New Stat",
                            description: "Description...",
                            symbol: "⭐",
                            startingValue: 1,
                            cost: 50,
                          };
                          setUpgradeSettings({
                            ...upgradeSettings,
                            statShop: [...upgradeSettings.statShop, newStat],
                          });
                        }}
                        className="w-full px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white font-semibold rounded-lg"
                      >
                        + Add Shop Stat
                      </button>

                      {upgradeSettings.statShop.map((stat, index) => (
                        <div
                          key={index}
                          className="p-3 bg-cyan-50 dark:bg-cyan-900/20 rounded-lg border border-cyan-200 dark:border-cyan-800"
                        >
                          <div className="grid grid-cols-2 gap-2 mb-2">
                            <input
                              type="text"
                              value={stat.name}
                              onChange={(e) => {
                                const updated = [...upgradeSettings.statShop];
                                updated[index].name = e.target.value;
                                setUpgradeSettings({
                                  ...upgradeSettings,
                                  statShop: updated,
                                });
                              }}
                              placeholder="Name"
                              className="px-2 py-1 text-sm border rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            />
                            <input
                              type="text"
                              value={stat.symbol}
                              onChange={(e) => {
                                const updated = [...upgradeSettings.statShop];
                                updated[index].symbol = e.target.value;
                                setUpgradeSettings({
                                  ...upgradeSettings,
                                  statShop: updated,
                                });
                              }}
                              placeholder="Symbol"
                              className="px-2 py-1 text-sm border rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                              maxLength={2}
                            />
                          </div>
                          <input
                            type="text"
                            value={stat.description}
                            onChange={(e) => {
                              const updated = [...upgradeSettings.statShop];
                              updated[index].description = e.target.value;
                              setUpgradeSettings({
                                ...upgradeSettings,
                                statShop: updated,
                              });
                            }}
                            placeholder="Description"
                            className="w-full px-2 py-1 text-sm border rounded mb-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                          />
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-xs text-gray-600 dark:text-gray-400">
                                Starting Value
                              </label>
                              <input
                                type="number"
                                value={stat.startingValue}
                                onChange={(e) => {
                                  const updated = [...upgradeSettings.statShop];
                                  updated[index].startingValue = parseInt(
                                    e.target.value
                                  );
                                  setUpgradeSettings({
                                    ...upgradeSettings,
                                    statShop: updated,
                                  });
                                }}
                                className="w-full px-2 py-1 text-sm border rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                min="1"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-gray-600 dark:text-gray-400">
                                Cost (points)
                              </label>
                              <input
                                type="number"
                                value={stat.cost}
                                onChange={(e) => {
                                  const updated = [...upgradeSettings.statShop];
                                  updated[index].cost = parseInt(
                                    e.target.value
                                  );
                                  setUpgradeSettings({
                                    ...upgradeSettings,
                                    statShop: updated,
                                  });
                                }}
                                className="w-full px-2 py-1 text-sm border rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                min="1"
                              />
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              const updated = upgradeSettings.statShop.filter(
                                (_, i) => i !== index
                              );
                              setUpgradeSettings({
                                ...upgradeSettings,
                                statShop: updated,
                              });
                            }}
                            className="w-full mt-2 px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-sm rounded"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Resource Shop */}
                <div className="bg-white dark:bg-gray-800 rounded-lg border-2 border-gray-300 dark:border-gray-600 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                      🛒 Resource Shop
                    </h3>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={upgradeSettings.resourceShopEnabled}
                        onChange={(e) =>
                          setUpgradeSettings({
                            ...upgradeSettings,
                            resourceShopEnabled: e.target.checked,
                          })
                        }
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-teal-300 dark:peer-focus:ring-teal-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-teal-600"></div>
                    </label>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-4">
                    Allow players to unlock new resources with points
                  </p>

                  {upgradeSettings.resourceShopEnabled && (
                    <div className="space-y-3">
                      <button
                        onClick={() => {
                          const newResource = {
                            name: "New Resource",
                            description: "Description...",
                            symbol: "💎",
                            startingValue: 10,
                            startingMaxValue: 100,
                            cost: 75,
                          };
                          setUpgradeSettings({
                            ...upgradeSettings,
                            resourceShop: [
                              ...upgradeSettings.resourceShop,
                              newResource,
                            ],
                          });
                        }}
                        className="w-full px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-lg"
                      >
                        + Add Shop Resource
                      </button>

                      {upgradeSettings.resourceShop.map((resource, index) => (
                        <div
                          key={index}
                          className="p-3 bg-teal-50 dark:bg-teal-900/20 rounded-lg border border-teal-200 dark:border-teal-800"
                        >
                          <div className="grid grid-cols-2 gap-2 mb-2">
                            <input
                              type="text"
                              value={resource.name}
                              onChange={(e) => {
                                const updated = [
                                  ...upgradeSettings.resourceShop,
                                ];
                                updated[index].name = e.target.value;
                                setUpgradeSettings({
                                  ...upgradeSettings,
                                  resourceShop: updated,
                                });
                              }}
                              placeholder="Name"
                              className="px-2 py-1 text-sm border rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            />
                            <input
                              type="text"
                              value={resource.symbol}
                              onChange={(e) => {
                                const updated = [
                                  ...upgradeSettings.resourceShop,
                                ];
                                updated[index].symbol = e.target.value;
                                setUpgradeSettings({
                                  ...upgradeSettings,
                                  resourceShop: updated,
                                });
                              }}
                              placeholder="Symbol"
                              className="px-2 py-1 text-sm border rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                              maxLength={2}
                            />
                          </div>
                          <input
                            type="text"
                            value={resource.description}
                            onChange={(e) => {
                              const updated = [...upgradeSettings.resourceShop];
                              updated[index].description = e.target.value;
                              setUpgradeSettings({
                                ...upgradeSettings,
                                resourceShop: updated,
                              });
                            }}
                            placeholder="Description"
                            className="w-full px-2 py-1 text-sm border rounded mb-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                          />
                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <label className="text-xs text-gray-600 dark:text-gray-400">
                                Start Value
                              </label>
                              <input
                                type="number"
                                value={resource.startingValue}
                                onChange={(e) => {
                                  const updated = [
                                    ...upgradeSettings.resourceShop,
                                  ];
                                  updated[index].startingValue = parseInt(
                                    e.target.value
                                  );
                                  setUpgradeSettings({
                                    ...upgradeSettings,
                                    resourceShop: updated,
                                  });
                                }}
                                className="w-full px-2 py-1 text-sm border rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                min="0"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-gray-600 dark:text-gray-400">
                                Max Value
                              </label>
                              <input
                                type="number"
                                value={resource.startingMaxValue}
                                onChange={(e) => {
                                  const updated = [
                                    ...upgradeSettings.resourceShop,
                                  ];
                                  updated[index].startingMaxValue = parseInt(
                                    e.target.value
                                  );
                                  setUpgradeSettings({
                                    ...upgradeSettings,
                                    resourceShop: updated,
                                  });
                                }}
                                className="w-full px-2 py-1 text-sm border rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                min="1"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-gray-600 dark:text-gray-400">
                                Cost (points)
                              </label>
                              <input
                                type="number"
                                value={resource.cost}
                                onChange={(e) => {
                                  const updated = [
                                    ...upgradeSettings.resourceShop,
                                  ];
                                  updated[index].cost = parseInt(
                                    e.target.value
                                  );
                                  setUpgradeSettings({
                                    ...upgradeSettings,
                                    resourceShop: updated,
                                  });
                                }}
                                className="w-full px-2 py-1 text-sm border rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                min="1"
                              />
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              const updated =
                                upgradeSettings.resourceShop.filter(
                                  (_, i) => i !== index
                                );
                              setUpgradeSettings({
                                ...upgradeSettings,
                                resourceShop: updated,
                              });
                            }}
                            className="w-full mt-2 px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-sm rounded"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Item Shop */}
                <div className="bg-white dark:bg-gray-800 rounded-lg border-2 border-gray-300 dark:border-gray-600 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                      🏬 Item Shop
                    </h3>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={upgradeSettings.itemShopEnabled}
                        onChange={(e) =>
                          setUpgradeSettings({
                            ...upgradeSettings,
                            itemShopEnabled: e.target.checked,
                          })
                        }
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-amber-300 dark:peer-focus:ring-amber-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-amber-600"></div>
                    </label>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-4">
                    Provide curated items players can purchase
                  </p>

                  {upgradeSettings.itemShopEnabled && (
                    <div className="space-y-3">
                      <button
                        onClick={() => {
                          const newItem = {
                            name: "New Item",
                            description: "Description...",
                            symbol: "📦",
                            type: "normal" as const,
                            quantity: 1,
                            cost: 30,
                          };
                          setUpgradeSettings({
                            ...upgradeSettings,
                            itemShop: [...upgradeSettings.itemShop, newItem],
                          });
                        }}
                        className="w-full px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-lg"
                      >
                        + Add Shop Item
                      </button>

                      {upgradeSettings.itemShop.map((item, index) => (
                        <div
                          key={index}
                          className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800"
                        >
                          <div className="grid grid-cols-2 gap-2 mb-2">
                            <input
                              type="text"
                              value={item.name}
                              onChange={(e) => {
                                const updated = [...upgradeSettings.itemShop];
                                updated[index].name = e.target.value;
                                setUpgradeSettings({
                                  ...upgradeSettings,
                                  itemShop: updated,
                                });
                              }}
                              placeholder="Name"
                              className="px-2 py-1 text-sm border rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            />
                            <input
                              type="text"
                              value={item.symbol}
                              onChange={(e) => {
                                const updated = [...upgradeSettings.itemShop];
                                updated[index].symbol = e.target.value;
                                setUpgradeSettings({
                                  ...upgradeSettings,
                                  itemShop: updated,
                                });
                              }}
                              placeholder="Symbol"
                              className="px-2 py-1 text-sm border rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                              maxLength={2}
                            />
                          </div>
                          <input
                            type="text"
                            value={item.description}
                            onChange={(e) => {
                              const updated = [...upgradeSettings.itemShop];
                              updated[index].description = e.target.value;
                              setUpgradeSettings({
                                ...upgradeSettings,
                                itemShop: updated,
                              });
                            }}
                            placeholder="Description"
                            className="w-full px-2 py-1 text-sm border rounded mb-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                          />
                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <label className="text-xs text-gray-600 dark:text-gray-400">
                                Type
                              </label>
                              <select
                                value={item.type}
                                onChange={(e) => {
                                  const updated = [...upgradeSettings.itemShop];
                                  updated[index].type = e.target.value as any;
                                  setUpgradeSettings({
                                    ...upgradeSettings,
                                    itemShop: updated,
                                  });
                                }}
                                className="w-full px-2 py-1 text-sm border rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                              >
                                <option value="normal">Normal</option>
                                <option value="consumable">Consumable</option>
                                <option value="story">Story</option>
                                <option value="misc">Misc</option>
                              </select>
                            </div>
                            <div>
                              <label className="text-xs text-gray-600 dark:text-gray-400">
                                Quantity
                              </label>
                              <input
                                type="number"
                                value={item.quantity}
                                onChange={(e) => {
                                  const updated = [...upgradeSettings.itemShop];
                                  updated[index].quantity = parseInt(
                                    e.target.value
                                  );
                                  setUpgradeSettings({
                                    ...upgradeSettings,
                                    itemShop: updated,
                                  });
                                }}
                                className="w-full px-2 py-1 text-sm border rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                min="1"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-gray-600 dark:text-gray-400">
                                Cost (points)
                              </label>
                              <input
                                type="number"
                                value={item.cost}
                                onChange={(e) => {
                                  const updated = [...upgradeSettings.itemShop];
                                  updated[index].cost = parseInt(
                                    e.target.value
                                  );
                                  setUpgradeSettings({
                                    ...upgradeSettings,
                                    itemShop: updated,
                                  });
                                }}
                                className="w-full px-2 py-1 text-sm border rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                min="1"
                              />
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              const updated = upgradeSettings.itemShop.filter(
                                (_, i) => i !== index
                              );
                              setUpgradeSettings({
                                ...upgradeSettings,
                                itemShop: updated,
                              });
                            }}
                            className="w-full mt-2 px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-sm rounded"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        );

      case "preview":
        return (
          <div className="space-y-6">
            <div className="bg-linear-to-r from-purple-600 via-pink-600 to-blue-600 rounded-2xl p-8 text-white">
              <h2 className="text-3xl font-bold mb-2">
                {title || "Untitled Adventure"}
              </h2>
              <p className="text-white/90 mb-4">
                {shortDescription || "No description"}
              </p>
              <div className="flex flex-wrap gap-2">
                <span className="px-3 py-1 bg-white/20 rounded-full text-sm font-semibold">
                  {difficulty}
                </span>
                {tags.slice(0, 3).map((tag) => (
                  <span
                    key={tag}
                    className="px-3 py-1 bg-white/20 rounded-full text-sm"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border border-gray-200 dark:border-gray-700">
              <h3 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">
                Summary
              </h3>
              <div className="space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">
                      Stats:
                    </span>
                    <span className="ml-2 font-semibold text-gray-900 dark:text-white">
                      {stats.length}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">
                      Resources:
                    </span>
                    <span className="ml-2 font-semibold text-gray-900 dark:text-white">
                      {resources.length}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">
                      Starting Items:
                    </span>
                    <span className="ml-2 font-semibold text-gray-900 dark:text-white">
                      {inventory.length}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">
                      Lore Entries:
                    </span>
                    <span className="ml-2 font-semibold text-gray-900 dark:text-white">
                      {lore.length}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">
                      Achievements:
                    </span>
                    <span className="ml-2 font-semibold text-gray-900 dark:text-white">
                      {achievements.length}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">
                      Quests:
                    </span>
                    <span className="ml-2 font-semibold text-gray-900 dark:text-white">
                      {quests.length}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">
                      Plot Beats:
                    </span>
                    <span className="ml-2 font-semibold text-gray-900 dark:text-white">
                      {plotBeats.length}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">
                      Tags:
                    </span>
                    <span className="ml-2 font-semibold text-gray-900 dark:text-white">
                      {tags.length}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">
                      Starting Points:
                    </span>
                    <span className="ml-2 font-semibold text-gray-900 dark:text-white">
                      {points}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">
                      Momentum:
                    </span>
                    <span className="ml-2 font-semibold text-gray-900 dark:text-white">
                      {momentum}/{maxMomentum}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {startingContent && (
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border border-gray-200 dark:border-gray-700">
                <h3 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">
                  Opening Scene
                </h3>
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-6 border-l-4 border-purple-500">
                  <p className="text-gray-800 dark:text-gray-200 italic">
                    "{startingContent}"
                  </p>
                </div>
              </div>
            )}

            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
              <p className="text-sm text-gray-700 dark:text-gray-300">
                ⚠️ <strong>Note:</strong> Once you publish this adventure,
                players will be able to start it. Make sure everything looks
                good before proceeding!
              </p>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  const currentStepIndex = steps.findIndex((s) => s.id === currentStep);

  // Show loading screen when loading adventure data
  if (loading) {
    return (
      <div className="min-h-screen bg-linear-to-br from-blue-50 via-purple-50 to-pink-50 dark:from-gray-900 dark:via-purple-900 dark:to-blue-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 dark:border-purple-400 mx-auto mb-4"></div>
          <p className="text-gray-900 dark:text-white font-semibold">
            Loading adventure...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-blue-50 via-purple-50 to-pink-50 dark:from-gray-900 dark:via-purple-900 dark:to-blue-900">
      <div className="max-w-6xl mx-auto p-4 sm:p-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-3xl sm:text-4xl font-bold bg-linear-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
              {editAdventureId ? "✏️ Edit Adventure" : "✨ Adventure Creator"}
            </h1>
            <div className="flex gap-2">
              <button
                onClick={() => setIsAIMenuOpen(true)}
                className="px-4 py-2 bg-linear-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-semibold rounded-lg transition-all shadow-md flex items-center gap-2"
              >
                <span>🤖</span> AI Assistant
              </button>
              <button
                onClick={handleDiscardChanges}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors shadow-md"
              >
                🗑️ Discard Changes
              </button>
              <button
                onClick={() => router.push("/explorer")}
                className="px-4 py-2 bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600 hover:border-purple-500 dark:hover:border-purple-400 text-gray-900 dark:text-white font-semibold rounded-lg transition-colors shadow-md"
              >
                ← Cancel
              </button>
            </div>
          </div>
        </div>

        {/* Progress Steps */}
        <div className="mb-8 bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-4 border border-gray-200 dark:border-gray-700 overflow-x-auto">
          <div className="flex gap-2 min-w-max">
            {steps.map((step, index) => (
              <button
                key={step.id}
                onClick={() => setCurrentStep(step.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all whitespace-nowrap ${
                  currentStep === step.id
                    ? "bg-purple-600 text-white"
                    : index < currentStepIndex
                    ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"
                    : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                }`}
              >
                <span>{step.icon}</span>
                <span className="hidden sm:inline">{step.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 sm:p-8 border border-gray-200 dark:border-gray-700 mb-8">
          <h2 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">
            {steps.find((s) => s.id === currentStep)?.label}
          </h2>
          {renderStepContent()}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between gap-4 bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 border border-gray-200 dark:border-gray-700">
          <button
            onClick={() => {
              const prevIndex = Math.max(0, currentStepIndex - 1);
              setCurrentStep(steps[prevIndex].id);
            }}
            disabled={currentStepIndex === 0}
            className="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-gray-900 dark:text-white font-semibold rounded-lg transition-colors"
          >
            ← Previous
          </button>

          <div className="text-sm text-gray-600 dark:text-gray-400">
            Step {currentStepIndex + 1} of {steps.length}
          </div>

          {currentStep === "preview" ? (
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2 bg-linear-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 disabled:from-gray-400 disabled:to-gray-500 text-white font-bold rounded-lg transition-all shadow-md hover:shadow-lg"
            >
              {saving ? "Publishing..." : "🚀 Publish Adventure"}
            </button>
          ) : (
            <button
              onClick={() => {
                const nextIndex = Math.min(
                  steps.length - 1,
                  currentStepIndex + 1
                );
                setCurrentStep(steps[nextIndex].id);
              }}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors shadow-md"
            >
              Next →
            </button>
          )}
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        icon={confirmDialog.icon}
        confirmText={confirmDialog.confirmText}
        cancelText={confirmDialog.cancelText}
        confirmButtonClass={confirmDialog.confirmButtonClass}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}
      />

      <CreatorAIChat
        isOpen={isAIMenuOpen}
        onClose={() => setIsAIMenuOpen(false)}
        currentStoryData={{
          story_name: title,
          premise,
          player_name: playerName,
          player_summary: playerSummary,
          starting_content: startingContent,
          author_notes: authorNotes,
          stats,
          resources,
          inventory,
          plot_beats: plotBeats,
          lore,
          achievements,
          quests,
          presets,
        }}
        adventureMetadata={{
          title: title,
          shortDescription: shortDescription,
          description: description,
        }}
        onApplyChanges={handleApplyAIChanges}
      />
    </div>
  );
}

export default function AdventureCreatorPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-linear-to-br from-blue-50 via-purple-50 to-pink-50 dark:from-gray-900 dark:via-purple-900 dark:to-blue-900 flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 dark:border-purple-400"></div>
        </div>
      }
    >
      <AdventureCreatorContent />
    </Suspense>
  );
}
