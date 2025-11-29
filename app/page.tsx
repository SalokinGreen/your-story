import Link from "next/link";
import {
  BookOpen,
  Dices,
  TrendingUp,
  Wand2,
  Volume2,
  Heart,
  Users,
  Smartphone,
  Compass,
  MessageSquare,
  Sparkles,
  Bot,
  Palette,
  Shield,
  Zap,
} from "lucide-react";

// Import client components
import LandingAuthSection from "./components/LandingAuthSection";
import QuickStartGenres from "./components/QuickStartGenres";
import PopularAdventures from "./components/PopularAdventures";
import InfoTabs from "./components/InfoTabs";

// Roadmap data - static, server-rendered
const road_map = [
  {
    title: "Core Story Engine",
    description: "AI-powered narrative generation with branching choices",
    status: "done" as const,
    Icon: BookOpen,
  },
  {
    title: "RPG Systems",
    description: "8 dice systems including PbtA, Fate, YZE, and more",
    status: "done" as const,
    Icon: Dices,
  },
  {
    title: "Character Progression",
    description: "Stats, inventory, achievements, and skill checks",
    status: "done" as const,
    Icon: TrendingUp,
  },
  {
    title: "Adventure Creator",
    description: "Full-featured editor for custom adventures",
    status: "done" as const,
    Icon: Wand2,
  },
  {
    title: "Voice Narration",
    description: "Text-to-speech with custom voice support",
    status: "done" as const,
    Icon: Volume2,
  },
  {
    title: "Relationships",
    description: "NPC relationship tracking and dynamics",
    status: "wip" as const,
    Icon: Heart,
  },
  {
    title: "Multiplayer",
    description: "Collaborative storytelling sessions",
    status: "planned" as const,
    Icon: Users,
  },
  {
    title: "Mobile App",
    description: "Native iOS and Android apps",
    status: "planned" as const,
    Icon: Smartphone,
  },
];

// How it works steps - static
const steps = [
  {
    Icon: Compass,
    title: "Choose",
    description: "Pick an adventure or create your own",
  },
  {
    Icon: MessageSquare,
    title: "Play",
    description: "Make choices, roll dice, shape the story",
  },
  {
    Icon: Sparkles,
    title: "Experience",
    description: "AI crafts unique narratives just for you",
  },
];

// Features - static
const features = [
  { Icon: Bot, label: "9 AI Models" },
  { Icon: Dices, label: "8 RPG Systems" },
  { Icon: Volume2, label: "Voice Narration" },
  { Icon: Palette, label: "Custom Adventures" },
  { Icon: Shield, label: "Private Stories" },
  { Icon: Zap, label: "Fast Generation" },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-linear-to-br from-gray-900 via-blue-950 to-purple-950">
      <main className="max-w-6xl mx-auto px-4 py-6">
        {/* Hero - Static server-rendered */}
        <div className="text-center mb-8">
          <h1 className="text-4xl sm:text-5xl font-bold mb-3 bg-linear-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
            Your Story
          </h1>
          <p className="text-blue-200/60 text-lg max-w-xl mx-auto mb-6">
            AI-powered interactive fiction where every choice shapes your unique
            adventure
          </p>

          {/* Auth Section - Client component */}
          <LandingAuthSection />
        </div>

        {/* Quick Start Genres - Client component */}
        <QuickStartGenres />

        {/* Featured Adventures - Client component with cached API */}
        <PopularAdventures />

        {/* How It Works - Static server-rendered */}
        <div className="mb-8">
          <h2 className="text-sm font-medium text-blue-200/40 uppercase tracking-wider mb-4 text-center">
            How It Works
          </h2>
          <div className="grid grid-cols-3 gap-4 max-w-2xl mx-auto">
            {steps.map((step, i) => (
              <div key={i} className="text-center">
                <div className="w-12 h-12 rounded-full bg-blue-600/20 flex items-center justify-center mx-auto mb-2">
                  <step.Icon className="w-6 h-6 text-blue-400" />
                </div>
                <h3 className="font-medium text-white text-sm mb-1">
                  {step.title}
                </h3>
                <p className="text-xs text-blue-200/40">{step.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Features Pills - Static server-rendered */}
        <div className="mb-8">
          <div className="flex flex-wrap justify-center gap-2">
            {features.map((feature, i) => (
              <span
                key={i}
                className="px-3 py-1.5 bg-blue-950/30 text-blue-200/60 rounded-full text-xs flex items-center gap-1.5 border border-blue-800/20"
              >
                <feature.Icon className="w-3.5 h-3.5" />
                {feature.label}
              </span>
            ))}
          </div>
        </div>

        {/* Roadmap - Static server-rendered with horizontal scroll */}
        <div className="mb-8">
          <h2 className="text-sm font-medium text-blue-200/40 uppercase tracking-wider mb-4 text-center">
            Roadmap
          </h2>
          <div className="flex gap-3 pb-2 -mx-4 px-4 overflow-x-auto scrollbar-hide">
            {road_map.map((item, i) => (
              <div
                key={i}
                className={`shrink-0 w-48 p-3 rounded-xl border ${
                  item.status === "done"
                    ? "bg-green-500/10 border-green-500/30"
                    : item.status === "wip"
                    ? "bg-blue-500/10 border-blue-500/30"
                    : "bg-blue-950/30 border-blue-800/20"
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <item.Icon
                    className={`w-4 h-4 ${
                      item.status === "done"
                        ? "text-green-400"
                        : item.status === "wip"
                        ? "text-blue-400"
                        : "text-blue-200/40"
                    }`}
                  />
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded ${
                      item.status === "done"
                        ? "bg-green-500/20 text-green-300"
                        : item.status === "wip"
                        ? "bg-blue-500/20 text-blue-300"
                        : "bg-blue-800/20 text-blue-200/40"
                    }`}
                  >
                    {item.status === "done"
                      ? "Done"
                      : item.status === "wip"
                      ? "WIP"
                      : "Planned"}
                  </span>
                </div>
                <h3 className="font-medium text-white text-sm mb-1">
                  {item.title}
                </h3>
                <p className="text-xs text-blue-200/40 line-clamp-2">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Info Tabs - Client component */}
        <InfoTabs />

        {/* Footer - Static server-rendered */}
        <footer className="text-center pt-4 border-t border-blue-800/20">
          <p className="text-xs text-blue-200/30">
            © 2025 Your Story • AI-powered interactive fiction
          </p>
          <div className="mt-2 flex justify-center gap-4">
            <Link
              href="/terms"
              className="text-xs text-blue-200/40 hover:text-blue-200/60 transition-colors"
            >
              Terms of Service
            </Link>
            <span className="text-blue-200/20">•</span>
            <Link
              href="/privacy"
              className="text-xs text-blue-200/40 hover:text-blue-200/60 transition-colors"
            >
              Privacy Policy
            </Link>
          </div>
        </footer>
      </main>
    </div>
  );
}
