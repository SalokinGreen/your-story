import { goblin_layer } from "../misc/starter_stories";
import { Scene, StoryData } from "../misc/structs";
import Story from "./story";

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
    return (
        <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
            <main className="flex min-h-screen gap-6 w-full max-w-3xl flex-col items-center justify-start py-32 px-16 bg-white dark:bg-black sm:items-start">
            {/* Story Header */}
                <h1 className="max-w-xs text-3xl font-semibold leading-10 tracking-tight text-black dark:text-zinc-50">
                    {story_name}
                </h1>
                {/* Buttons for navigation and pages */}
                {current_state === StoryState.STORY && (
                    <div className="flex flex-col items-center gap-6 text-center sm:items-start sm:text-left">
                <div className="flex flex-row items-center gap-6 text-center sm:items-start sm:text-left">
                    <button className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 hover:cursor-pointer">
                        Stats
                    </button>
                    <button className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 hover:cursor-pointer">
                        Inventory
                    </button>
                    <button className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 hover:cursor-pointer">
                        Lore
                    </button>
                    <button className="px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700 hover:cursor-pointer">
                        Achievements
                    </button>
                    <button className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 hover:cursor-pointer">
                        Menu
                    </button>
                </div>
            </div>)}
             <Story {...storyData} />

            </main>
        </div>
    );
}
