"use client";

import { goblin_layer } from "../misc/starter_stories";
import { Scene, StoryData } from "../misc/structs";
import Story from "./story";
import StatsPage from "./stats";
import { useState } from "react";

let story_name = "Goblin Layer";
enum StoryState {
    STORY = "STORY",
    STATS = "STATS",
    INVENTORY = "INVENTORY",
    LORE = "LORE",
    ACHIEVEMENTS = "ACHIEVEMENTS",
    MENU = "MENU"
}
let current_state: StoryState = StoryState.STORY;

let scene: Scene = {
    parts: [
        
    ]
}
const storyData: StoryData = goblin_layer;
export default function StoryPage() {
    const [currentState, setCurrentState] = useState<StoryState>(StoryState.STORY);

    return (
        <div className="min-h-screen bg-linear-to-br from-blue-50 via-purple-50 to-pink-50 dark:from-gray-900 dark:via-purple-900 dark:to-blue-900 font-sans py-8 px-4 sm:px-8">
            <main className="flex gap-6 w-full max-w-4xl mx-auto flex-col">
            {/* Story Header */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 sm:p-8 border border-gray-200 dark:border-gray-700">
                    <h1 className="text-3xl sm:text-4xl font-bold bg-linear-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent text-center sm:text-left">
                        {story_name}
                    </h1>
                </div>
                {/* Buttons for navigation and pages */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-4 sm:p-6 border border-gray-200 dark:border-gray-700">
                    <div className="flex flex-row flex-wrap items-center justify-center sm:justify-start gap-3">
                        <button 
                            onClick={() => setCurrentState(StoryState.STORY)}
                            className={`px-4 py-2.5 sm:px-6 sm:py-3 text-sm sm:text-base font-semibold rounded-lg transition-all shadow-md ${
                                currentState === StoryState.STORY 
                                    ? "bg-linear-to-r from-gray-700 to-gray-900 text-white ring-2 ring-gray-400 shadow-lg" 
                                    : "bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-gray-600"
                            }`}
                        >
                            📖 Story
                        </button>
                        <button 
                            onClick={() => setCurrentState(StoryState.STATS)}
                            className={`px-4 py-2.5 sm:px-6 sm:py-3 text-sm sm:text-base font-semibold rounded-lg transition-all shadow-md ${
                                currentState === StoryState.STATS 
                                    ? "bg-linear-to-r from-blue-600 to-blue-800 text-white ring-2 ring-blue-400 shadow-lg" 
                                    : "bg-blue-50 dark:bg-blue-900/30 text-blue-900 dark:text-blue-200 hover:bg-blue-100 dark:hover:bg-blue-900/50"
                            }`}
                        >
                            📊 Stats
                        </button>
                        <button 
                            onClick={() => setCurrentState(StoryState.LORE)}
                            className={`px-4 py-2.5 sm:px-6 sm:py-3 text-sm sm:text-base font-semibold rounded-lg transition-all shadow-md ${
                                currentState === StoryState.LORE 
                                    ? "bg-linear-to-r from-purple-600 to-purple-800 text-white ring-2 ring-purple-400 shadow-lg" 
                                    : "bg-purple-50 dark:bg-purple-900/30 text-purple-900 dark:text-purple-200 hover:bg-purple-100 dark:hover:bg-purple-900/50"
                            }`}
                        >
                            📜 Lore
                        </button>
                        <button 
                            onClick={() => setCurrentState(StoryState.MENU)}
                            className={`px-4 py-2.5 sm:px-6 sm:py-3 text-sm sm:text-base font-semibold rounded-lg transition-all shadow-md ${
                                currentState === StoryState.MENU 
                                    ? "bg-linear-to-r from-green-600 to-green-800 text-white ring-2 ring-green-400 shadow-lg" 
                                    : "bg-green-50 dark:bg-green-900/30 text-green-900 dark:text-green-200 hover:bg-green-100 dark:hover:bg-green-900/50"
                            }`}
                        >
                            ⚙️ Menu
                        </button>
                    </div>
                </div>

                {/* Render current page */}
                {currentState === StoryState.STORY && <Story {...storyData} />}
                {currentState === StoryState.STATS && <StatsPage {...storyData} />}

            </main>
        </div>
    );
}
