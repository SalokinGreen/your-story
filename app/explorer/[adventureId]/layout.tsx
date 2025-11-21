import type { Metadata } from "next";

interface AdventureResponse {
  adventure?: {
    id: string;
    title: string;
    shortDescription?: string;
    description?: string;
    bannerUrl?: string;
    tags: string[];
    difficulty?: string;
    rating?: number;
    playCount?: number;
    visibility?: string; // public | hidden | private
    nsfw?: boolean;
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
  const title =
    adventure && !isPrivate ? adventure.title : "Your Story Adventure";
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
  const imageUrl = banner || `${baseUrl}/api/og/adventure-placeholder.png`; // Placeholder; ensure asset exists or adjust

  // Build keywords
  const keywords = [
    "interactive story",
    "ai adventure",
    "choice based",
    "narrative game",
    ...tags,
  ];

  return {
    title,
    description,
    alternates: { canonical: adventureUrl },
    keywords,
    openGraph: {
      title,
      description,
      url: adventureUrl,
      siteName: "Your Story",
      type: "website",
      images: [
        {
          url: imageUrl,
          alt: `${title} – Adventure Preview`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [imageUrl],
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
