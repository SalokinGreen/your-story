import Link from "next/link";
import {
  BookOpen,
  Dices,
  Target,
  Wand2,
  Volume2,
  Heart,
  Users,
  Smartphone,
  Compass,
  MessageSquare,
  Sparkles,
  KeyRound,
  Palette,
  HardDrive,
  Zap,
  ChevronRight,
} from "lucide-react";

// Import client components
import LandingAuthSection from "./components/LandingAuthSection";
import GuidedStoryStart from "./components/GuidedStoryStart";
import LastPlayedStories from "./components/LastPlayedStories";
import InfoTabs from "./components/InfoTabs";

// Enable ISR with 5 minute revalidation for the entire page
export const revalidate = 300;

// Roadmap data - static, server-rendered
const road_map: {
  title: string;
  description: string;
  status: "done" | "wip" | "planned";
  Icon: typeof BookOpen;
}[] = [
  {
    title: "Core Story Engine",
    description: "AI-powered narrative generation with branching choices",
    status: "done" as const,
    Icon: BookOpen,
  },
  {
    title: "Improvised Dice & Mechanics",
    description:
      "The AI GM calls dice-roll tools on the fly - no fixed system, fully improvised per adventure",
    status: "done" as const,
    Icon: Dices,
  },
  {
    title: "Goals & Story Threads",
    description:
      "Freeform character sheets, player goals, and ongoing plotlines instead of levels and loot",
    status: "done" as const,
    Icon: Target,
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
    title: "NPC Relationships",
    description: "Freeform relationship tracking that shifts with your choices",
    status: "done" as const,
    Icon: Heart,
  },
  {
    title: "Couch Co-op",
    description: "Pass one device between up to 4 players in the same story",
    status: "done" as const,
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
  { Icon: KeyRound, label: "Bring Your Own API Key" },
  { Icon: Dices, label: "Improvised AI Game Master" },
  { Icon: Volume2, label: "Voice Narration" },
  { Icon: Palette, label: "Custom Adventures" },
  { Icon: HardDrive, label: "Stories Saved Locally" },
  { Icon: Zap, label: "Fast Generation" },
];

export default async function Home() {
  return (
    <div className="min-h-screen bg-[image:var(--ys-gradient)]">
      <main className="max-w-6xl mx-auto px-4 py-6">
        {/* Hero - Static server-rendered */}
        <div className="text-center mb-8">
          <h1 className="text-4xl sm:text-5xl font-bold mb-3 text-ys-accent">
            Endless Adventure
          </h1>
          <p className="text-ys-muted text-lg max-w-xl mx-auto mb-6">
            AI-powered interactive fiction where every choice shapes your unique
            adventure. Bring your own API key - no accounts, no subscriptions,
            stories stay on your device.
          </p>

          {/* Auth Section - Client component */}
          <LandingAuthSection />
        </div>

        {/* Guided freeform story - the default way to play - Client component */}
        <GuidedStoryStart />

        {/* Last played stories - Client component */}
        <LastPlayedStories />

        {/* Entry point into the conversational creator - Static */}
        <div className="mb-8">
          <Link
            href="/creator"
            className="group block max-w-2xl mx-auto rounded-2xl border border-ys-border bg-ys-surface hover:border-ys-accent/40 hover:bg-ys-surface-2 transition-all p-5"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform bg-ys-accent text-ys-on-accent">
                <MessageSquare className="w-6 h-6 text-ys-text" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="font-medium text-ys-text mb-0.5">
                  Design your own adventure
                </h2>
                <p className="text-sm text-ys-muted">
                  Talk it through with a game designer — premise, rules, world
                  and cast, one piece at a time.
                </p>
              </div>
              <ChevronRight className="w-5 h-5 text-ys-muted group-hover:text-ys-accent group-hover:translate-x-0.5 transition-all shrink-0" />
            </div>
          </Link>
        </div>

        {/* How It Works - Static server-rendered */}
        <div className="mb-8">
          <h2 className="text-sm font-medium text-ys-muted uppercase tracking-wider mb-4 text-center">
            How It Works
          </h2>
          <div className="grid grid-cols-3 gap-4 max-w-2xl mx-auto">
            {steps.map((step, i) => (
              <div key={i} className="text-center">
                <div className="w-12 h-12 rounded-full bg-ys-accent/20 flex items-center justify-center mx-auto mb-2">
                  <step.Icon className="w-6 h-6 text-ys-accent" />
                </div>
                <h3 className="font-medium text-ys-text text-sm mb-1">
                  {step.title}
                </h3>
                <p className="text-xs text-ys-muted">{step.description}</p>
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
                className="px-3 py-1.5 bg-ys-surface text-ys-muted rounded-full text-xs flex items-center gap-1.5 border border-ys-border"
              >
                <feature.Icon className="w-3.5 h-3.5" />
                {feature.label}
              </span>
            ))}
          </div>
        </div>

        {/* Roadmap - Static server-rendered with horizontal scroll */}
        <div className="mb-8">
          <h2 className="text-sm font-medium text-ys-muted uppercase tracking-wider mb-4 text-center">
            Roadmap
          </h2>
          <div className="flex gap-3 pb-2 -mx-4 px-4 overflow-x-auto scrollbar-hide">
            {road_map.map((item, i) => (
              <div
                key={i}
                className={`shrink-0 w-48 p-3 rounded-xl border ${
                  item.status === "done"
                    ? "bg-ys-success/10 border-ys-success/30"
                    : item.status === "wip"
                      ? "bg-ys-accent/10 border-ys-accent/30"
                      : "bg-ys-surface border-ys-border"
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <item.Icon
                    className={`w-4 h-4 ${
                      item.status === "done"
                        ? "text-ys-success"
                        : item.status === "wip"
                          ? "text-ys-accent"
                          : "text-ys-muted"
                    }`}
                  />
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded ${
                      item.status === "done"
                        ? "bg-ys-success/20 text-ys-success"
                        : item.status === "wip"
                          ? "bg-ys-accent/20 text-ys-muted"
                          : "bg-ys-surface text-ys-muted"
                    }`}
                  >
                    {item.status === "done"
                      ? "Done"
                      : item.status === "wip"
                        ? "WIP"
                        : "Planned"}
                  </span>
                </div>
                <h3 className="font-medium text-ys-text text-sm mb-1">
                  {item.title}
                </h3>
                <p className="text-xs text-ys-muted line-clamp-2">
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
          <div className="inline-flex flex-col items-center p-6 rounded-2xl border border-ys-accent/20 bg-ys-surface">
            <Heart className="w-8 h-8 text-ys-accent mb-3" />
            <h3 className="text-lg font-medium text-ys-text mb-2">
              Support the Project
            </h3>
            <p className="text-sm text-ys-muted max-w-md mb-4">
              If you believe in what we&apos;re building and want to help keep
              Endless Adventure alive and growing, consider buying us a coffee!
            </p>
            <a
              href="https://ko-fi.com/sgreens"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-ys-accent text-ys-on-accent font-medium rounded-full transition-colors hover:opacity-90"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M23.881 8.948c-.773-4.085-4.859-4.593-4.859-4.593H.723c-.604 0-.679.798-.679.798s-.082 7.324-.022 11.822c.164 2.424 2.586 2.672 2.586 2.672s8.267-.023 11.966-.049c2.438-.426 2.683-2.566 2.658-3.734 4.352.24 7.422-2.831 6.649-6.916zm-11.062 3.511c-1.246 1.453-4.011 3.976-4.011 3.976s-.121.119-.31.023c-.076-.057-.108-.09-.108-.09-.443-.441-3.368-3.049-4.034-3.954-.709-.965-1.041-2.7-.091-3.71.951-1.01 3.005-1.086 4.363.407 0 0 1.565-1.782 3.468-.963 1.904.82 1.832 3.011.723 4.311z" />
              </svg>
              Support on Ko-fi
            </a>
          </div>
        </div>

        {/* Footer - Static server-rendered */}
        <footer className="text-center pt-4 border-t border-ys-border">
          <p className="text-xs text-ys-muted">
            © 2026 Endless Adventure • AI-powered interactive fiction
          </p>
          <div className="mt-2 flex justify-center gap-4">
            <Link
              href="/terms"
              className="text-xs text-ys-muted hover:text-ys-text transition-colors"
            >
              Terms of Service
            </Link>
            <span className="text-ys-muted">•</span>
            <Link
              href="/privacy"
              className="text-xs text-ys-muted hover:text-ys-text transition-colors"
            >
              Privacy Policy
            </Link>
          </div>
        </footer>
      </main>
    </div>
  );
}
