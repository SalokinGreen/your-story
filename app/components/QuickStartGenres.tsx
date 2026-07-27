"use client";

/**
 * Genre shortcuts on the landing page.
 *
 * These used to launch the staged batch generator with a size/time budget.
 * That generator is gone — adventures are built by talking to the designer
 * now — so a genre click just opens the creator with an opening line ready to
 * send. The author still starts the conversation.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { StaticIcon } from "./StaticIcon";
import FullScreenView from "./FullScreenView";

const genres = [
  {
    name: "Fantasy",
    icon: "Sword",
    description: "Epic quests, magic, mythical creatures, and heroic journeys",
  },
  {
    name: "Sci-Fi",
    icon: "Rocket",
    description:
      "Space exploration, advanced technology, alien encounters, and futuristic societies",
  },
  {
    name: "Horror",
    icon: "Ghost",
    description:
      "Survival horror, psychological terror, supernatural threats, and dark mysteries",
  },
  {
    name: "Mystery",
    icon: "Search",
    description:
      "Crime solving, detective work, puzzles, intrigue, and uncovering secrets",
  },
  {
    name: "Romance",
    icon: "Heart",
    description:
      "Love stories, relationship drama, emotional connections, and heartfelt moments",
  },
  {
    name: "Western",
    icon: "Sun",
    description:
      "Frontier life, outlaws and lawmen, dusty towns, and rugged adventures",
  },
  {
    name: "Comedy",
    icon: "Laugh",
    description:
      "Hilarious situations, witty dialogue, absurd scenarios, and laugh-out-loud moments",
  },
  {
    name: "Superheroes",
    icon: "Zap",
    description:
      "Superpowers, epic battles, secret identities, and saving the world from villains",
  },
];

export default function QuickStartGenres() {
  const router = useRouter();
  const [selectedGenre, setSelectedGenre] = useState<(typeof genres)[0] | null>(
    null,
  );
  const [concept, setConcept] = useState("");

  const handleStart = () => {
    if (!selectedGenre) return;
    const opener = concept.trim()
      ? `I want to build a ${selectedGenre.name.toLowerCase()} adventure. ${concept.trim()}`
      : `I want to build a ${selectedGenre.name.toLowerCase()} adventure. Ask me what I'm going for.`;
    router.push(`/creator?start=${encodeURIComponent(opener)}`);
  };

  return (
    <>
      <div className="mb-8">
        <h2 className="text-sm font-medium text-blue-200/40 uppercase tracking-wider mb-3 text-center">
          Start a New Adventure
        </h2>
        <div className="flex flex-wrap justify-center gap-2">
          {genres.map((genre) => (
            <button
              key={genre.name}
              onClick={() => {
                setSelectedGenre(genre);
                setConcept("");
              }}
              className="px-4 py-2 bg-white/5 hover:bg-white/10 text-blue-200 rounded-lg border border-white/10 transition-all hover:border-purple-400/40 flex items-center gap-2"
            >
              <StaticIcon name={genre.icon} className="w-4 h-4" />
              {genre.name}
            </button>
          ))}
        </div>
      </div>

      {selectedGenre && (
        <FullScreenView
          title={`${selectedGenre.name} Adventure`}
          subtitle={selectedGenre.description}
          icon={selectedGenre.icon}
          onClose={() => setSelectedGenre(null)}
          footer={
            <div className="flex gap-3 p-4">
              <button
                onClick={() => setSelectedGenre(null)}
                className="flex-1 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleStart}
                className="flex-1 px-4 py-2.5 bg-linear-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white rounded-lg shadow-md shadow-purple-950/40 transition-all font-medium flex items-center justify-center gap-2"
              >
                <StaticIcon name="MessageSquare" className="w-4 h-4" />
                Start Designing
              </button>
            </div>
          }
        >
          <div className="max-w-lg mx-auto">
            <div className="mb-4">
              <label className="block text-sm font-medium text-blue-200 mb-2">
                What&apos;s the idea?{" "}
                <span className="text-blue-400/60">(optional)</span>
              </label>
              <textarea
                value={concept}
                onChange={(e) => setConcept(e.target.value)}
                placeholder={`A hook, a mood, a first scene — or leave it blank and talk it through.`}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-blue-400/40 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                rows={3}
              />
            </div>

            <div className="bg-purple-500/[0.06] border border-purple-400/20 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <StaticIcon
                  name="Sparkles"
                  className="w-4 h-4 text-purple-400 mt-0.5 shrink-0"
                />
                <div className="text-sm text-purple-200/80">
                  <p className="font-medium mb-1">
                    You&apos;ll build this in conversation
                  </p>
                  <p className="text-purple-300/60 text-xs">
                    A game designer works through the premise, rules, world and
                    cast with you — a piece at a time, so you can push back as
                    it goes.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </FullScreenView>
      )}
    </>
  );
}
