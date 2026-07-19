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
import FreeformStoryStart from "./components/FreeformStoryStart";
import InfoTabs from "./components/InfoTabs";

// Enable ISR with 5 minute revalidation for the entire page
export const revalidate = 300;

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

export default async function Home() {
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

        {/* Freeform Story - skip setup, talk to the GM directly - Client component */}
        <FreeformStoryStart />

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

        {/* Support Section */}
        <div className="mb-8 text-center">
          <div className="inline-flex flex-col items-center p-6 rounded-2xl bg-linear-to-br from-pink-500/10 via-purple-500/10 to-blue-500/10 border border-pink-500/20">
            <Heart className="w-8 h-8 text-pink-400 mb-3" />
            <h3 className="text-lg font-medium text-white mb-2">
              Support the Project
            </h3>
            <p className="text-sm text-blue-200/60 max-w-md mb-4">
              If you believe in what we&apos;re building and want to help keep
              Your Story alive and growing, consider buying us a coffee!
            </p>
            <a
              href="https://ko-fi.com/sgreens"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-pink-500 hover:bg-pink-400 text-white font-medium rounded-full transition-colors"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M23.881 8.948c-.773-4.085-4.859-4.593-4.859-4.593H.723c-.604 0-.679.798-.679.798s-.082 7.324-.022 11.822c.164 2.424 2.586 2.672 2.586 2.672s8.267-.023 11.966-.049c2.438-.426 2.683-2.566 2.658-3.734 4.352.24 7.422-2.831 6.649-6.916zm-11.062 3.511c-1.246 1.453-4.011 3.976-4.011 3.976s-.121.119-.31.023c-.076-.057-.108-.09-.108-.09-.443-.441-3.368-3.049-4.034-3.954-.709-.965-1.041-2.7-.091-3.71.951-1.01 3.005-1.086 4.363.407 0 0 1.565-1.782 3.468-.963 1.904.82 1.832 3.011.723 4.311z" />
              </svg>
              Support on Ko-fi
            </a>
          </div>
        </div>

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
