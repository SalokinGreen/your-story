'use client';
import { useState } from "react";
import { Choices, StoryData } from "../misc/structs";


export default function Story(storyData: StoryData) {
    const [choices, setChoices]: [Choices, React.Dispatch<React.SetStateAction<Choices>>] = useState<Choices>({choices: []})
    const [storyText, setStoryText] = useState(storyData.starting_content);
    let [started, setStarted] = useState(false);
    if (storyData.scene.parts.length === 0 && choices.choices.length === 0) {
        storyData.scene.parts.push({
            content: storyData.starting_content,
            imageUrl: "",
            user: false,
            role: "assistant",
            choices: ["Start Story"],
        });
    }
    if (!started) {
        setStoryText(storyData.scene.parts[storyData.scene.parts.length - 1].content);
        setChoices({ choices: storyData.scene.parts[storyData.scene.parts.length - 1].choices || [] });
        setStarted(true);
    }


    async function handleChoice(key: number) {
        storyData.scene.parts.push({
            content: `> ${choices.choices[key]}`,
            imageUrl: "",
            user: true,
            role: "user",
            choices: [...choices.choices]
        });
        
        setChoices({
            choices: []
        });

        await fetch("/api/story/next", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                storyData: storyData,
                userChoice: choices.choices[key]
            })
        }).then(async (res) => {
            const data = await res.json();
            setStoryText(data.storyText);
            setChoices(data.choices);
        });
        
        



    }
    return (
        <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
            {storyData.scene.parts.length <= 0 ? storyData.starting_content : storyData.scene.parts[storyData.scene.parts.length - 1].content}
        <div className="flex flex-col items-center gap-6 text-center sm:items-start sm:text-left">
            <div className="flex flex-col items-center gap-6 text-center sm:items-start sm:text-left">
                <h2 className="max-w-xs text-2xl font-semibold leading-9 tracking-tight text-black dark:text-zinc-50">
                    {storyText}
                </h2>
                <div className="flex flex-col items-center gap-4 text-center sm:items-start sm:text-left">
                    {choices && choices.choices.map((choice, index) => (
                        <button key={index} className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700" onClick={() => handleChoice(index)}>
                            {choice}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    </div>
    );
}