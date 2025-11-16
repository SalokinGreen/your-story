"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/app/misc/AuthContext";
import { StoryData, Stat, Resource, InventoryItem, PlotBeat, StoryLore, Achievement } from "@/app/misc/structs";
import { useNotification } from "@/app/misc/NotificationContext";
import { supabase } from "@/app/misc/supabase";

type CreatorStep = "basic" | "premise" | "stats" | "resources" | "inventory" | "lore" | "achievements" | "plot" | "preview";

export default function AdventureCreatorPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { addNotification } = useNotification();

  const editAdventureId = searchParams?.get("edit");

  // Redirect if not authenticated
  if (!user) {
    router.push("/");
    return null;
  }

  const [currentStep, setCurrentStep] = useState<CreatorStep>("basic");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  // Basic Info
  const [title, setTitle] = useState("");
  const [shortDescription, setShortDescription] = useState("");
  const [description, setDescription] = useState("");
  const [difficulty, setDifficulty] = useState<"Easy" | "Medium" | "Hard" | "Expert">("Medium");
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");
  const [uploadingThumbnail, setUploadingThumbnail] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);

  // Load adventure data if editing
  useEffect(() => {
    if (!editAdventureId) return;

    const loadAdventure = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/adventures/${editAdventureId}`);
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

        // Load stats, resources, inventory, etc.
        setStats(template.stats || []);
        setResources(template.resources || []);
        setInventory(template.inventory || []);
        setPlotBeats(template.plot_beats || []);
        setLore(template.lore || []);
        setAchievements(template.achievements || []);

        addNotification("Adventure loaded for editing", "success");
      } catch (error) {
        console.error("Error loading adventure:", error);
        addNotification("Failed to load adventure", "failure");
        router.push("/explorer");
      } finally {
        setLoading(false);
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

  // Stats
  const [stats, setStats] = useState<Stat[]>([]);
  const [newStat, setNewStat] = useState<Partial<Stat>>({
    name: "",
    value: 50,
    description: "",
    symbol: "⭐",
  });

  // Resources
  const [resources, setResources] = useState<Resource[]>([]);
  const [newResource, setNewResource] = useState<Partial<Resource>>({
    name: "",
    value: 50,
    maxValue: 100,
    description: "",
    symbol: "💎",
  });

  // Starting Inventory
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [newItem, setNewItem] = useState<Partial<InventoryItem>>({
    name: "",
    quantity: 1,
    description: "",
    type: "misc",
    symbol: "📦",
  });

  // Plot Beats
  const [plotBeats, setPlotBeats] = useState<PlotBeat[]>([]);
  const [newPlotBeat, setNewPlotBeat] = useState<Partial<PlotBeat>>({
    content: "",
    targetChapter: 0,
    fulfilled: false,
  });

  // Lore
  const [lore, setLore] = useState<StoryLore[]>([]);
  const [newLore, setNewLore] = useState<Partial<StoryLore>>({
    title: "",
    content: "",
    relatedCharacters: [],
    relatedLocations: [],
    secrtet: false,
    keys: [],
  });
  const [newLoreCharacter, setNewLoreCharacter] = useState("");
  const [newLoreLocation, setNewLoreLocation] = useState("");
  const [newLoreKey, setNewLoreKey] = useState("");

  // Achievements
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [newAchievement, setNewAchievement] = useState<Partial<Achievement>>({
    title: "",
    description: "",
    points: 10,
    symbol: "🏆",
  });

  const commonTags = ["Fantasy", "Sci-Fi", "Mystery", "Horror", "Romance", "Comedy", "Drama", "Action", "Adventure", "Thriller", "Post-Apocalyptic", "Cyberpunk", "Steampunk", "Historical", "Contemporary", "Magic", "Combat", "Exploration", "Puzzle", "Survival", "Detective", "Noir"];

  const steps: { id: CreatorStep; label: string; icon: string }[] = [
    { id: "basic", label: "Basic Info", icon: "📝" },
    { id: "premise", label: "Story Setup", icon: "📖" },
    { id: "stats", label: "Stats", icon: "📊" },
    { id: "resources", label: "Resources", icon: "💎" },
    { id: "inventory", label: "Starting Items", icon: "🎒" },
    { id: "lore", label: "Lore", icon: "📜" },
    { id: "achievements", label: "Achievements", icon: "🏆" },
    { id: "plot", label: "Plot Beats", icon: "🎬" },
    { id: "preview", label: "Preview", icon: "👁️" },
  ];

  const addTag = () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      setTags([...tags, newTag.trim()]);
      setNewTag("");
    }
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter(t => t !== tag));
  };

  const handleThumbnailUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      addNotification("Please select an image file", "warning");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      addNotification("Image must be smaller than 5MB", "warning");
      return;
    }

    setUploadingThumbnail(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const fileExt = file.name.split(".").pop();
      const fileName = `${user.id}-${Date.now()}-thumbnail.${fileExt}`;
      const filePath = `adventure-thumbnails/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("adventure-images")
        .upload(filePath, file, { cacheControl: "3600", upsert: false });

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

    if (file.size > 5 * 1024 * 1024) {
      addNotification("Image must be smaller than 5MB", "warning");
      return;
    }

    setUploadingBanner(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const fileExt = file.name.split(".").pop();
      const fileName = `${user.id}-${Date.now()}-banner.${fileExt}`;
      const filePath = `adventure-banners/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("adventure-images")
        .upload(filePath, file, { cacheControl: "3600", upsert: false });

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
      setNewResource({ name: "", value: 50, maxValue: 100, description: "", symbol: "💎" });
    }
  };

  const removeResource = (index: number) => {
    setResources(resources.filter((_, i) => i !== index));
  };

  const addInventoryItem = () => {
    if (newItem.name) {
      setInventory([...inventory, newItem as InventoryItem]);
      setNewItem({ name: "", quantity: 1, description: "", type: "misc", symbol: "📦" });
    }
  };

  const removeInventoryItem = (index: number) => {
    setInventory(inventory.filter((_, i) => i !== index));
  };

  const addPlotBeat = () => {
    if (newPlotBeat.content) {
      setPlotBeats([...plotBeats, newPlotBeat as PlotBeat]);
      setNewPlotBeat({ content: "", targetChapter: 0, fulfilled: false });
    }
  };

  const removePlotBeat = (index: number) => {
    setPlotBeats(plotBeats.filter((_, i) => i !== index));
  };

  const addLoreCharacter = () => {
    if (newLoreCharacter.trim() && !newLore.relatedCharacters?.includes(newLoreCharacter.trim())) {
      setNewLore({
        ...newLore,
        relatedCharacters: [...(newLore.relatedCharacters || []), newLoreCharacter.trim()],
      });
      setNewLoreCharacter("");
    }
  };

  const addLoreLocation = () => {
    if (newLoreLocation.trim() && !newLore.relatedLocations?.includes(newLoreLocation.trim())) {
      setNewLore({
        ...newLore,
        relatedLocations: [...(newLore.relatedLocations || []), newLoreLocation.trim()],
      });
      setNewLoreLocation("");
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
      });
    }
  };

  const removeLore = (index: number) => {
    setLore(lore.filter((_, i) => i !== index));
  };

  const addAchievement = () => {
    if (newAchievement.title && newAchievement.description) {
      setAchievements([...achievements, { ...newAchievement, dateAchieved: null } as Achievement]);
      setNewAchievement({ title: "", description: "", points: 10, symbol: "🏆" });
    }
  };

  const removeAchievement = (index: number) => {
    setAchievements(achievements.filter((_, i) => i !== index));
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
      author_notes: authorNotes,
    };

    // Save to database
    try {
      // Get auth token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("Not authenticated");
      }

      const isEditing = !!editAdventureId;
      const url = isEditing ? `/api/adventures/${editAdventureId}` : "/api/adventures";
      const method = isEditing ? "PATCH" : "POST";

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          title,
          shortDescription,
          description,
          thumbnailUrl: thumbnailUrl || null,
          bannerUrl: bannerUrl || null,
          authorId: user.id,
          authorName: user.user_metadata?.displayName || "Anonymous",
          tags,
          difficulty: difficulty.toLowerCase(),
          estimatedDuration: "1-2 hours",
          isPublished: true,
          isFeatured: false,
          storyTemplate: storyData,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || `Failed to ${isEditing ? "update" : "create"} adventure`);
      }

      const { adventure } = await response.json();
      addNotification(`✨ Adventure ${isEditing ? "updated" : "created"} successfully!`, "success");
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
                {(["Easy", "Medium", "Hard", "Expert"] as const).map(diff => (
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
                Tags
              </label>
              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
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
                <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">Quick add:</p>
                <div className="flex flex-wrap gap-2">
                  {commonTags.filter(t => !tags.includes(t)).slice(0, 10).map(tag => (
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
                {tags.map(tag => (
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
                Recommended: 400x300px, max 5MB
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
                    {uploadingThumbnail ? "Uploading..." : thumbnailUrl ? "Change Thumbnail" : "📸 Upload Thumbnail"}
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
                Recommended: 1200x400px, max 5MB
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
                    {uploadingBanner ? "Uploading..." : bannerUrl ? "Change Banner" : "🖼️ Upload Banner"}
                  </label>
                </div>
              </div>
            </div>
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
                Max Chapters
              </label>
              <input
                type="number"
                min="1"
                max="20"
                value={maxChapters}
                onChange={(e) => setMaxChapters(parseInt(e.target.value) || 8)}
                className="w-full sm:w-48 px-4 py-3 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:border-purple-500 dark:focus:border-purple-400 focus:ring-2 focus:ring-purple-200 dark:focus:ring-purple-800 transition-colors"
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
          </div>
        );

      case "stats":
        return (
          <div className="space-y-6">
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <p className="text-sm text-gray-700 dark:text-gray-300">
                💡 <strong>Tip:</strong> Stats represent character attributes that can be tested during skill checks (like Strength, Intelligence, etc.). They range from 0-100.
              </p>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg border-2 border-gray-300 dark:border-gray-600 p-6">
              <h3 className="text-lg font-bold mb-4 text-gray-900 dark:text-white">Add New Stat</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Name *
                  </label>
                  <input
                    type="text"
                    value={newStat.name}
                    onChange={(e) => setNewStat({ ...newStat, name: e.target.value })}
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
                    onChange={(e) => setNewStat({ ...newStat, symbol: e.target.value })}
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
                    onChange={(e) => setNewStat({ ...newStat, value: parseInt(e.target.value) || 0 })}
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
                    onChange={(e) => setNewStat({ ...newStat, description: e.target.value })}
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
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">Stats ({stats.length})</h3>
              {stats.length === 0 ? (
                <p className="text-gray-600 dark:text-gray-400 text-sm">No stats added yet</p>
              ) : (
                stats.map((stat, index) => (
                  <div key={index} className="flex items-center gap-3 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                    <span className="text-2xl">{stat.symbol}</span>
                    <div className="flex-1">
                      <div className="font-bold text-gray-900 dark:text-white">{stat.name}</div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">{stat.description}</div>
                      <div className="text-sm text-blue-600 dark:text-blue-400 font-semibold">Value: {stat.value}</div>
                    </div>
                    <button
                      onClick={() => removeStat(index)}
                      className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        );

      case "resources":
        return (
          <div className="space-y-6">
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
              <p className="text-sm text-gray-700 dark:text-gray-300">
                💡 <strong>Tip:</strong> Resources are consumable values like Health, Mana, or Stamina that can be spent or restored during the adventure.
              </p>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg border-2 border-gray-300 dark:border-gray-600 p-6">
              <h3 className="text-lg font-bold mb-4 text-gray-900 dark:text-white">Add New Resource</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Name *
                  </label>
                  <input
                    type="text"
                    value={newResource.name}
                    onChange={(e) => setNewResource({ ...newResource, name: e.target.value })}
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
                    onChange={(e) => setNewResource({ ...newResource, symbol: e.target.value })}
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
                    onChange={(e) => setNewResource({ ...newResource, value: parseInt(e.target.value) || 0 })}
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
                    onChange={(e) => setNewResource({ ...newResource, maxValue: parseInt(e.target.value) || 100 })}
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
                    onChange={(e) => setNewResource({ ...newResource, description: e.target.value })}
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
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">Resources ({resources.length})</h3>
              {resources.length === 0 ? (
                <p className="text-gray-600 dark:text-gray-400 text-sm">No resources added yet</p>
              ) : (
                resources.map((resource, index) => (
                  <div key={index} className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                    <span className="text-2xl">{resource.symbol}</span>
                    <div className="flex-1">
                      <div className="font-bold text-gray-900 dark:text-white">{resource.name}</div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">{resource.description}</div>
                      <div className="text-sm text-green-600 dark:text-green-400 font-semibold">
                        {resource.value}/{resource.maxValue}
                      </div>
                    </div>
                    <button
                      onClick={() => removeResource(index)}
                      className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        );

      case "inventory":
        return (
          <div className="space-y-6">
            <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4">
              <p className="text-sm text-gray-700 dark:text-gray-300">
                💡 <strong>Tip:</strong> Starting inventory items that players begin the adventure with.
              </p>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg border-2 border-gray-300 dark:border-gray-600 p-6">
              <h3 className="text-lg font-bold mb-4 text-gray-900 dark:text-white">Add Starting Item</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Name *
                  </label>
                  <input
                    type="text"
                    value={newItem.name}
                    onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
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
                    onChange={(e) => setNewItem({ ...newItem, symbol: e.target.value })}
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
                    onChange={(e) => setNewItem({ ...newItem, quantity: parseInt(e.target.value) || 1 })}
                    className="w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Type
                  </label>
                  <select
                    value={newItem.type}
                    onChange={(e) => setNewItem({ ...newItem, type: e.target.value })}
                    className="w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value="weapon">Weapon</option>
                    <option value="armor">Armor</option>
                    <option value="consumable">Consumable</option>
                    <option value="quest">Quest Item</option>
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
                    onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
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
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">Starting Inventory ({inventory.length})</h3>
              {inventory.length === 0 ? (
                <p className="text-gray-600 dark:text-gray-400 text-sm">No items added yet</p>
              ) : (
                inventory.map((item, index) => (
                  <div key={index} className="flex items-center gap-3 p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
                    <span className="text-2xl">{item.symbol}</span>
                    <div className="flex-1">
                      <div className="font-bold text-gray-900 dark:text-white">{item.name} ×{item.quantity}</div>
                      {item.description && (
                        <div className="text-sm text-gray-600 dark:text-gray-400">{item.description}</div>
                      )}
                      <div className="text-xs text-purple-600 dark:text-purple-400">{item.type}</div>
                    </div>
                    <button
                      onClick={() => removeInventoryItem(index)}
                      className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        );

      case "lore":
        return (
          <div className="space-y-6">
            <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg p-4">
              <p className="text-sm text-gray-700 dark:text-gray-300">
                💡 <strong>Tip:</strong> Lore entries provide background information about your world. Keys determine when the lore is revealed during gameplay (e.g., "Ancient Ruins Discovered", "Dragon Defeated").
              </p>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg border-2 border-gray-300 dark:border-gray-600 p-6">
              <h3 className="text-lg font-bold mb-4 text-gray-900 dark:text-white">Add Lore Entry</h3>
              <div className="space-y-4 mb-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Title *
                  </label>
                  <input
                    type="text"
                    value={newLore.title}
                    onChange={(e) => setNewLore({ ...newLore, title: e.target.value })}
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
                    onChange={(e) => setNewLore({ ...newLore, content: e.target.value })}
                    placeholder="Write the lore entry content..."
                    rows={5}
                    className="w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="loreSecret"
                    checked={newLore.secrtet || false}
                    onChange={(e) => setNewLore({ ...newLore, secrtet: e.target.checked })}
                    className="w-4 h-4 text-purple-600 rounded"
                  />
                  <label htmlFor="loreSecret" className="text-sm text-gray-700 dark:text-gray-300">
                    🔒 Hidden (only revealed when triggered by keys)
                  </label>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Related Characters
                  </label>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={newLoreCharacter}
                      onChange={(e) => setNewLoreCharacter(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addLoreCharacter())}
                      placeholder="Add character name..."
                      className="flex-1 px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                    <button
                      onClick={addLoreCharacter}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
                    >
                      Add
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(newLore.relatedCharacters || []).map(char => (
                      <span
                        key={char}
                        className="px-2 py-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded-full text-sm flex items-center gap-1"
                      >
                        {char}
                        <button
                          onClick={() => setNewLore({
                            ...newLore,
                            relatedCharacters: (newLore.relatedCharacters || []).filter(c => c !== char),
                          })}
                          className="hover:text-indigo-900 dark:hover:text-indigo-100"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Related Locations
                  </label>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={newLoreLocation}
                      onChange={(e) => setNewLoreLocation(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addLoreLocation())}
                      placeholder="Add location name..."
                      className="flex-1 px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                    <button
                      onClick={addLoreLocation}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
                    >
                      Add
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(newLore.relatedLocations || []).map(loc => (
                      <span
                        key={loc}
                        className="px-2 py-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded-full text-sm flex items-center gap-1"
                      >
                        {loc}
                        <button
                          onClick={() => setNewLore({
                            ...newLore,
                            relatedLocations: (newLore.relatedLocations || []).filter(l => l !== loc),
                          })}
                          className="hover:text-indigo-900 dark:hover:text-indigo-100"
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
                      🔑 Trigger Keys (events that reveal this lore)
                    </label>
                    <div className="flex gap-2 mb-2">
                      <input
                        type="text"
                        value={newLoreKey}
                        onChange={(e) => setNewLoreKey(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addLoreKey())}
                        placeholder="e.g., 'Dragon Defeated' or 'Ancient Ruins Discovered'"
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
                      {(newLore.keys || []).map(key => (
                        <span
                          key={key}
                          className="px-2 py-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 rounded-full text-sm flex items-center gap-1"
                        >
                          🔑 {key}
                          <button
                            onClick={() => setNewLore({
                              ...newLore,
                              keys: (newLore.keys || []).filter(k => k !== key),
                            })}
                            className="hover:text-yellow-900 dark:hover:text-yellow-100"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
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
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">Lore Entries ({lore.length})</h3>
              {lore.length === 0 ? (
                <p className="text-gray-600 dark:text-gray-400 text-sm">No lore entries added yet</p>
              ) : (
                lore.map((entry, index) => (
                  <div key={index} className="p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border border-indigo-200 dark:border-indigo-800">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="font-bold text-gray-900 dark:text-white">{entry.title}</div>
                          {entry.secrtet && <span className="text-xs px-2 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 rounded-full">🔒 Hidden</span>}
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">{entry.content}</div>
                        {entry.relatedCharacters.length > 0 && (
                          <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">
                            <strong>Characters:</strong> {entry.relatedCharacters.join(', ')}
                          </div>
                        )}
                        {entry.relatedLocations.length > 0 && (
                          <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">
                            <strong>Locations:</strong> {entry.relatedLocations.join(', ')}
                          </div>
                        )}
                        {entry.secrtet && entry.keys.length > 0 && (
                          <div className="text-xs text-yellow-700 dark:text-yellow-400">
                            <strong>Triggers:</strong> {entry.keys.join(', ')}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => removeLore(index)}
                        className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors ml-3"
                      >
                        Remove
                      </button>
                    </div>
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
                💡 <strong>Tip:</strong> Achievements reward players for completing specific goals or milestones (optional).
              </p>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg border-2 border-gray-300 dark:border-gray-600 p-6">
              <h3 className="text-lg font-bold mb-4 text-gray-900 dark:text-white">Add Achievement</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Title *
                  </label>
                  <input
                    type="text"
                    value={newAchievement.title}
                    onChange={(e) => setNewAchievement({ ...newAchievement, title: e.target.value })}
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
                    onChange={(e) => setNewAchievement({ ...newAchievement, symbol: e.target.value })}
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
                    onChange={(e) => setNewAchievement({ ...newAchievement, points: parseInt(e.target.value) || 10 })}
                    className="w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Description *
                  </label>
                  <input
                    type="text"
                    value={newAchievement.description}
                    onChange={(e) => setNewAchievement({ ...newAchievement, description: e.target.value })}
                    placeholder="e.g., Defeat your first dragon"
                    className="w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
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
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">Achievements ({achievements.length})</h3>
              {achievements.length === 0 ? (
                <p className="text-gray-600 dark:text-gray-400 text-sm">No achievements added yet</p>
              ) : (
                achievements.map((achievement, index) => (
                  <div key={index} className="flex items-center gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                    <span className="text-2xl">{achievement.symbol}</span>
                    <div className="flex-1">
                      <div className="font-bold text-gray-900 dark:text-white">{achievement.title}</div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">{achievement.description}</div>
                      <div className="text-sm text-amber-600 dark:text-amber-400 font-semibold">{achievement.points} points</div>
                    </div>
                    <button
                      onClick={() => removeAchievement(index)}
                      className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        );

      case "plot":
        return (
          <div className="space-y-6">
            <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4">
              <p className="text-sm text-gray-700 dark:text-gray-300">
                💡 <strong>Tip:</strong> Plot beats are key story moments you want to guide the AI toward (optional but helpful for structured stories).
              </p>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg border-2 border-gray-300 dark:border-gray-600 p-6">
              <h3 className="text-lg font-bold mb-4 text-gray-900 dark:text-white">Add Plot Beat</h3>
              <div className="space-y-4 mb-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Content *
                  </label>
                  <textarea
                    value={newPlotBeat.content}
                    onChange={(e) => setNewPlotBeat({ ...newPlotBeat, content: e.target.value })}
                    placeholder="e.g., The player discovers the truth about the ancient prophecy"
                    rows={3}
                    className="w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Target Chapter
                  </label>
                  <input
                    type="number"
                    min="0"
                    max={maxChapters - 1}
                    value={newPlotBeat.targetChapter}
                    onChange={(e) => setNewPlotBeat({ ...newPlotBeat, targetChapter: parseInt(e.target.value) || 0 })}
                    className="w-full sm:w-48 px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
              </div>
              <button
                onClick={addPlotBeat}
                disabled={!newPlotBeat.content}
                className="w-full px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors"
              >
                Add Plot Beat
              </button>
            </div>

            <div className="space-y-3">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">Plot Beats ({plotBeats.length})</h3>
              {plotBeats.length === 0 ? (
                <p className="text-gray-600 dark:text-gray-400 text-sm">No plot beats added yet</p>
              ) : (
                plotBeats.map((beat, index) => (
                  <div key={index} className="p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="text-sm text-orange-600 dark:text-orange-400 font-semibold mb-1">
                          Chapter {beat.targetChapter}
                        </div>
                        <div className="text-gray-900 dark:text-white">{beat.content}</div>
                      </div>
                      <button
                        onClick={() => removePlotBeat(index)}
                        className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors ml-3"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        );

      case "preview":
        return (
          <div className="space-y-6">
            <div className="bg-linear-to-r from-purple-600 via-pink-600 to-blue-600 rounded-2xl p-8 text-white">
              <h2 className="text-3xl font-bold mb-2">{title || "Untitled Adventure"}</h2>
              <p className="text-white/90 mb-4">{shortDescription || "No description"}</p>
              <div className="flex flex-wrap gap-2">
                <span className="px-3 py-1 bg-white/20 rounded-full text-sm font-semibold">
                  {difficulty}
                </span>
                <span className="px-3 py-1 bg-white/20 rounded-full text-sm font-semibold">
                  {maxChapters} Chapters
                </span>
                {tags.slice(0, 3).map(tag => (
                  <span key={tag} className="px-3 py-1 bg-white/20 rounded-full text-sm">
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border border-gray-200 dark:border-gray-700">
              <h3 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">Summary</h3>
              <div className="space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">Stats:</span>
                    <span className="ml-2 font-semibold text-gray-900 dark:text-white">{stats.length}</span>
                  </div>
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">Resources:</span>
                    <span className="ml-2 font-semibold text-gray-900 dark:text-white">{resources.length}</span>
                  </div>
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">Starting Items:</span>
                    <span className="ml-2 font-semibold text-gray-900 dark:text-white">{inventory.length}</span>
                  </div>
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">Lore Entries:</span>
                    <span className="ml-2 font-semibold text-gray-900 dark:text-white">{lore.length}</span>
                  </div>
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">Achievements:</span>
                    <span className="ml-2 font-semibold text-gray-900 dark:text-white">{achievements.length}</span>
                  </div>
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">Plot Beats:</span>
                    <span className="ml-2 font-semibold text-gray-900 dark:text-white">{plotBeats.length}</span>
                  </div>
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">Tags:</span>
                    <span className="ml-2 font-semibold text-gray-900 dark:text-white">{tags.length}</span>
                  </div>
                </div>
              </div>
            </div>

            {startingContent && (
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border border-gray-200 dark:border-gray-700">
                <h3 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">Opening Scene</h3>
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-6 border-l-4 border-purple-500">
                  <p className="text-gray-800 dark:text-gray-200 italic">
                    "{startingContent}"
                  </p>
                </div>
              </div>
            )}

            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
              <p className="text-sm text-gray-700 dark:text-gray-300">
                ⚠️ <strong>Note:</strong> Once you publish this adventure, players will be able to start it. Make sure everything looks good before proceeding!
              </p>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  const currentStepIndex = steps.findIndex(s => s.id === currentStep);

  // Show loading screen when loading adventure data
  if (loading) {
    return (
      <div className="min-h-screen bg-linear-to-br from-blue-50 via-purple-50 to-pink-50 dark:from-gray-900 dark:via-purple-900 dark:to-blue-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 dark:border-purple-400 mx-auto mb-4"></div>
          <p className="text-gray-900 dark:text-white font-semibold">Loading adventure...</p>
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
            <button
              onClick={() => router.push("/explorer")}
              className="px-4 py-2 bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600 hover:border-purple-500 dark:hover:border-purple-400 text-gray-900 dark:text-white font-semibold rounded-lg transition-colors shadow-md"
            >
              ← Cancel
            </button>
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
            {steps.find(s => s.id === currentStep)?.label}
          </h2>
          {renderStepContent()}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 border border-gray-200 dark:border-gray-700">
          <button
            onClick={() => {
              const prevIndex = Math.max(0, currentStepIndex - 1);
              setCurrentStep(steps[prevIndex].id);
            }}
            disabled={currentStepIndex === 0}
            className="px-6 py-3 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-gray-900 dark:text-white font-semibold rounded-lg transition-colors"
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
              className="px-8 py-3 bg-linear-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 disabled:from-gray-400 disabled:to-gray-500 text-white font-bold rounded-lg transition-all shadow-md hover:shadow-lg"
            >
              {saving ? "Publishing..." : "🚀 Publish Adventure"}
            </button>
          ) : (
            <button
              onClick={() => {
                const nextIndex = Math.min(steps.length - 1, currentStepIndex + 1);
                setCurrentStep(steps[nextIndex].id);
              }}
              className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors shadow-md"
            >
              Next →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
