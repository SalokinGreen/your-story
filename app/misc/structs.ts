// Collection of the various structs used throughout the application

export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Stat {
    name: string;
    value: number;
    description: string;
    symbol: string;
    custom_symbol_url?: string;
}

export interface Resource {
    name: string;
    value: number;
    maxValue: number;
    description: string;
    symbol: string;
    custom_symbol_url?: string;
}

export interface InventoryItem {
    name: string;
    quantity: number;
    description: string;
    type?: string;
    stat?: string;
    resource?: string;
    symbol: string;
    custom_symbol_url?: string;
}

export interface Achievement {
    title: string;
    description: string;
    dateAchieved: Date | null;
    points: number;
    symbol: string;
    custom_symbol_url?: string;
}
export interface StoryLore {
    title: string;
    content: string;
    relatedCharacters: string[];
    relatedLocations: string[];
    secrtet: boolean;
    keys: string[];
}
export interface Chapter {
    title: string;
    summary: string;
    scene: Scene;
    notes: string[];
}
export interface ScenePart {
    content: string;
    imageUrl: string;
    user: boolean;
    role: "system" | "user" | "assistant";
    choices?: Choice[];
    memoryEntries?: string[];
    commands?: string[];
    endChapter?: boolean;
    endStory?: boolean;
    gameOver?: boolean;
}
export interface Choice {
    text: string;
    item_used?: string;
    item_loss?: boolean;
    skill_used?: string;
    skill_dc?: number;
    resource_used?: string;
    risked_resource?: string;

}
export interface Scene {
    parts: ScenePart[];
}
export interface PlotBeat {
    content: string;
    targetChapter: number;
    fulfilled?: boolean;
} 
export interface Choices {
    choices: Choice[];
}
export interface StoryData {
    story_name: string;
    premise: string;
    player_name: string;
    player_summary: string;
    starting_content: string;
    plot_beats: PlotBeat[];
    memory: string[];
    max_chapters: number;
    currentChapter: number;
    chapters: Chapter[];
    scene: Scene;
    stats: Stat[];
    resources: Resource[];
    inventory: InventoryItem[];
    achievements: Achievement[];
    lore: StoryLore[];
    momentum: number;
    maxMomentum: number;
    points: number;
    earnedPointsFromBeats: number[];
    earnedPointsFromChapters: number[];
    author_notes?: string;
    player_notes?: string;
}

// Point system costs
export const UPGRADE_COSTS = {
    STAT_INCREASE: 10,        // 10 points to increase a stat by 1
    RESOURCE_MAX_INCREASE: 15, // 15 points to increase max resource by 10
    ADD_ITEM: 20,             // 20 points to add a new item
    CHAPTER_REWARD: 50,       // Points earned for completing a chapter
    BEAT_REWARD: 25,          // Points earned for completing a story beat
} as const;

export interface Adventure {
    id: string;
    title: string;
    description: string;
    shortDescription: string;
    author: string;
    authorId?: string;
    thumbnailUrl?: string;
    bannerUrl?: string;
    tags: string[];
    difficulty: "Easy" | "Medium" | "Hard" | "Expert";
    estimatedDuration: string; // e.g., "2-3 hours"
    popularity: number; // For sorting/ranking
    rating?: number; // 0-5
    playCount: number;
    createdAt: Date;
    updatedAt: Date;
    isPublished: boolean;
    isFeatured: boolean;
    storyTemplate: Partial<StoryData>; // The actual story data
}

export interface AdventureFilter {
    searchQuery?: string;
    tags?: string[];
    difficulty?: ("Easy" | "Medium" | "Hard" | "Expert")[];
    sortBy?: "popularity" | "newest" | "rating" | "title";
}

export interface Comment {
    id: string;
    adventureId: string;
    userId: string;
    userName: string;
    userAvatar?: string;
    content: string;
    rating?: number; // 1-5 stars, optional
    createdAt: Date;
    updatedAt?: Date;
    likes: number;
    likedBy?: string[]; // User IDs who liked this comment
}

export interface Story {
    id: string;
    adventureId?: string; // Optional - can be null if adventure was deleted
    userId: string;
    storyName: string;
    storyData: StoryData; // Full story state with progress
    isCompleted: boolean;
    isPublic: boolean; // Allow sharing stories
    createdAt: Date;
    updatedAt: Date;
}