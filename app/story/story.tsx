'use client';
import { useState } from "react";
import { Choice, Choices, StoryData } from "../misc/structs";
import { outputToScenePart } from "../misc/ai";


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
            choices: [{ text: "Start Story" }],
        });
    }
    if (!started) {
        setStoryText(storyData.scene.parts[storyData.scene.parts.length - 1].content);
        setChoices({ choices: storyData.scene.parts[storyData.scene.parts.length - 1].choices || [] });
        setStarted(true);
    }


    async function handleChoice(key: number) {
        const choice = choices.choices[key];
        // Roll dice against difficulty
        let dice_roll = Math.floor(Math.random() * 100) + 1;
        // extra info
        let extra = "" 
        let text = "> " + choices.choices[key].text;


        // advantage if item used
        if (choice.item_used) {
            extra += `; item used (${choice.item_used})`
            const second_roll = Math.floor(Math.random() * 100) + 1;
            if (second_roll > dice_roll) {
                dice_roll = second_roll;
            }
            // use item if loss
            if (choice.item_loss) {
                // TODO: Implement item loss
            }
        }
        // TODO: Implement how disadvantage works

        // Do the skill check
        if (choice.skill_used) {
        // Now we add the stat 
        dice_roll += storyData.stats.find(stat => stat.name === choice.skill_used)?.value || 0;
        // Check success or failure
        const dc = choice.skill_dc || 0;
        const dc_passed = dice_roll >= dc;
        if (dc_passed) {
            text += " <Success" + extra + ">";
        } else {
            text += " <Failure" + extra + ">";
        }
    } else {
        text += " <No Skill Used" + extra + ">";
    }
        // Add memory to story if exists
        for (const mem of storyData.memory) {
            storyData.memory.push(mem)
        }
        console.log(text)
        storyData.scene.parts.push({
            content: text,
            imageUrl: "",
            user: true,
            role: "user",
            choices: [...choices.choices],
            memoryEntries: storyData.memory
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
            console.log(data)
            storyData.scene.parts.push(data.part);
            setStoryText(data.part.content);
            setChoices({ choices: data.part.choices || [] });
        });
        
        



    }
    return (
        <div className="flex min-h-screen items-start justify-center bg-zinc-50 font-sans dark:bg-black">
        <div className="flex flex-col items-start gap-6 text-center sm:items-start sm:text-left">
            <div className="flex flex-col items-start gap-3 text-center sm:items-start sm:text-left">
                {prettify(storyText)}
                <div className="flex flex-col items-start gap-4 text-center sm:items-start sm:text-left">
                    {choices && choices.choices.map((choice, index) => (
                        <button key={index} className="px-4 py-2 bg-green-700 text-white rounded hover:bg-green-800 hover:cursor-pointer" onClick={() => handleChoice(index)}>
                            {convert_choice_to_text(choice)}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    </div>
    );
}

const prettify = (text: string) => {
    const parts = text.split("\n")
    return (
        parts.map((part, index) => <div key={index}><p>{part}</p></div>)
    )
}
const choice_button_factory = (choice: Choice, index: number, onClick: () => void) => {

}
const convert_choice_to_text = (choice: Choice) => {
    let extra = "";
    if (choice.skill_used) {
        extra += `; use skill (${choice.skill_used}${choice.skill_dc ? ` (DC ${choice.skill_dc})` : ""})`;
    }
    if (choice.item_used) {
        extra += `; use (${choice.item_used})`;
    }
    if (choice.resource_used) {
        extra += `; use resource (${choice.resource_used})`;
    }
    if (choice.risked_resource) {
        extra += `; risk resource (${choice.risked_resource})`;
    }
    return `${choice.text}` + extra;
}