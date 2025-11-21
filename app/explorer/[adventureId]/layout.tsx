import type { Metadata } from "next";

interface AdventureResponse {
  adventure?: {
    id: string;
    title: string;
    author?: string;
    shortDescription?: string;
    description?: string;
    bannerUrl?: string;
    tags: string[];
    difficulty?: string;
    rating?: number;
    playCount?: number;
    estimatedDuration?: string;
    visibility?: string; // public | hidden | private
    nsfw?: boolean;
    isFeatured?: boolean;
  };
  error?: string;
}

// Helper to build absolute site URL
function getSiteUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL;
  if (!envUrl) return "http://localhost:3000";
  // Ensure we have protocol
  if (envUrl.startsWith("http")) return envUrl.replace(/\/$/, "");
  return `https://${envUrl.replace(/\/$/, "")}`;
}

export async function generateMetadata({
  params,
}: {
  params: { adventureId: string };
}): Promise<Metadata> {
  const baseUrl = getSiteUrl();
  const adventureId = params.adventureId;
  const adventureUrl = `${baseUrl}/explorer/${adventureId}`;

  let adventure: AdventureResponse["adventure"] | undefined;
  try {
    // Fetch without auth: server-side previews should only expose public/hidden adventures
    const res = await fetch(`${baseUrl}/api/adventures/${adventureId}`, {
      // Cache for short period; previews need relative freshness but not on every request
      next: { revalidate: 300 },
    });
    if (res.ok) {
      const data: AdventureResponse = await res.json();
      adventure = data.adventure;
    }
  } catch (e) {
    // Swallow; we'll fallback below
  }

  // Privacy / fallback handling
  const isPrivate = adventure?.visibility === "private";

  // Build personalized metadata
  const title =
    adventure && !isPrivate
      ? `${adventure.title}${adventure.isFeatured ? " ⭐" : ""}`
      : "Your Story Adventure";

  const rawDescription =
    adventure && !isPrivate
      ? adventure.shortDescription ||
        adventure.description ||
        "An interactive, choice-driven AI adventure."
      : "An interactive, choice-driven AI adventure on Your Story.";

  const description =
    rawDescription.length > 240
      ? rawDescription.slice(0, 237).trimEnd() + "..."
      : rawDescription;

  const banner = adventure && !isPrivate ? adventure.bannerUrl : undefined;
  const tags = adventure && !isPrivate ? adventure.tags : [];
  const imageUrl = banner || `${baseUrl}/api/og/adventure-placeholder.png`;

  // Personalized author and stats
  const author =
    adventure && !isPrivate
      ? adventure.author || "Unknown Creator"
      : "Your Story";
  const rating =
    adventure && !isPrivate && adventure.rating
      ? adventure.rating.toFixed(1)
      : null;
  const plays =
    adventure && !isPrivate && adventure.playCount
      ? adventure.playCount.toLocaleString()
      : null;
  const difficulty = adventure && !isPrivate ? adventure.difficulty : null;
  const duration = adventure && !isPrivate ? adventure.estimatedDuration : null;

  // Build rich title with metadata
  const fullTitle = [
    title,
    difficulty && `[${difficulty}]`,
    rating && `★${rating}`,
  ]
    .filter(Boolean)
    .join(" ");

  // Enhanced description with stats
  let enhancedDescription = description;
  if (adventure && !isPrivate) {
    const statsParts = [
      author && `By ${author}`,
      plays && `${plays} plays`,
      duration,
    ].filter(Boolean);

    if (statsParts.length > 0) {
      enhancedDescription = `${description}\n\n${statsParts.join(" • ")}`;
    }
  }

  // Build keywords with adventure-specific tags
  const keywords = [
    "interactive story",
    "ai adventure",
    "choice based",
    "narrative game",
    difficulty && `${difficulty} difficulty`,
    author && `by ${author}`,
    ...tags,
  ].filter(Boolean) as string[];

  return {
    title: fullTitle,
    description: enhancedDescription,
    alternates: { canonical: adventureUrl },
    keywords,
    authors: author ? [{ name: author }] : undefined,
    openGraph: {
      title: fullTitle,
      description: enhancedDescription,
      url: adventureUrl,
      siteName: "Your Story",
      type: "article",
      images: [
        {
          url: imageUrl,
          width: 1200,
          height: 630,
          alt: `${title} – ${author ? `by ${author}` : "Adventure Preview"}`,
        },
      ],
      ...(author && { authors: [author] }),
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description: enhancedDescription,
      images: [imageUrl],
      creator: author ? `@${author.replace(/\s+/g, "")}` : undefined,
    },
    metadataBase: new URL(baseUrl),
  };
}

// Simple layout wrapper (server component) to allow dynamic metadata while keeping client page logic intact.
export default function AdventureLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
