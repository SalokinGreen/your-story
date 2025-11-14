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
}

export interface Resource {
    name: string;
    value: number;
    maxValue: number;
    description: string;
}

export interface InventoryItem {
    name: string;
    quantity: number;
    description: string;
    type: string;
    stat: string;
    resource: string;
}

export interface Achievement {
    title: string;
    description: string;
    dateAchieved: Date | null;
    points: number;
}
export interface StoryLore {
    title: string;
    content: string;
    relatedCharacters: string[];
    relatedLocations: string[];
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
    endChapter?: boolean;
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
}