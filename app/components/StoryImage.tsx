"use client";

// The one place a picture made in play is shown (docs/image-generation-
// implementation-plan.md S6): the card under a turn's prose, and, through
// useStoredImage, the NPC portrait, the character sheet and a note's picture.
// It reads the bytes from imageStore.ts (their own IndexedDB database, decision
// 59) and follows the job queue (imageJobs.ts), so a card shows pending, done,
// declined, failed or missing, and every one of them is a visible state.

import React, {
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import { DynamicIcon } from "./DynamicIcon";
import { getImage, type StoredImage } from "../misc/imageStore";
import { getImageJobState, subscribeImageJobs } from "../misc/imageJobs";

export type StoredImageView =
  | { status: "none" }
  | { status: "loading" }
  | { status: "pending" }
  | { status: "ready"; url: string; image: StoredImage }
  | { status: "declined"; message: string; categories?: string[] }
  | { status: "failed"; message: string }
  | { status: "missing" };

interface Loaded {
  id: string;
  image: StoredImage | null;
  url: string | null;
}

/**
 * The picture behind an id: its object URL (made in an effect and revoked on
 * cleanup, never during render), or the state of the job still making it.
 */
export function useStoredImage(imageId: string | undefined): StoredImageView {
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  // The job queue is an external store: follow it, and reload the bytes
  // whenever this picture's job changes state (pending -> done).
  const jobState = useSyncExternalStore(
    useCallback(
      (onChange: () => void) =>
        subscribeImageJobs((id) => {
          if (id === imageId) onChange();
        }),
      [imageId],
    ),
    () => (imageId ? getImageJobState(imageId) : undefined),
    () => undefined,
  );
  const jobStatus = jobState?.status;

  useEffect(() => {
    // Nothing is stored yet for a picture still being painted.
    if (!imageId || jobStatus === "pending") return;
    let cancelled = false;
    let objectUrl: string | null = null;
    void getImage(imageId)
      .then((image) => {
        if (cancelled) return;
        objectUrl = image ? URL.createObjectURL(image.blob) : null;
        setLoaded({ id: imageId, image, url: objectUrl });
      })
      .catch(() => {
        if (!cancelled) setLoaded({ id: imageId, image: null, url: null });
      });
    return () => {
      cancelled = true;
      // The previous object URL goes when the picture changes or the card unmounts.
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [imageId, jobStatus]);

  if (!imageId) return { status: "none" };
  if (jobState?.status === "pending") return { status: "pending" };
  // A failure is shown even when an older picture is still stored (a Retry
  // that failed): a job never fails silently.
  if (jobState?.status === "declined") {
    return {
      status: "declined",
      message: jobState.message,
      categories: jobState.categories,
    };
  }
  if (jobState?.status === "failed") {
    return { status: "failed", message: jobState.message };
  }
  if (loaded && loaded.id === imageId && loaded.image && loaded.url) {
    return { status: "ready", url: loaded.url, image: loaded.image };
  }
  if (!loaded || loaded.id !== imageId) return { status: "loading" };
  return { status: "missing" };
}

/**
 * A small picture in place of an avatar, emoji or thumbnail: the stored picture
 * when there is one, a shimmer while it paints, else `children` (what showed
 * before). Used for NPC portraits, the character sheet and notes.
 */
export function StoredPortrait({
  imageId,
  alt,
  className = "",
  children,
}: {
  imageId?: string;
  alt: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const view = useStoredImage(imageId);
  if (view.status === "ready") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={view.url} alt={alt} className={className} />;
  }
  if (view.status === "pending") {
    return (
      <div
        className={`${className} animate-pulse bg-white/10`}
        title="Painting…"
        role="status"
      />
    );
  }
  return <>{children}</>;
}

function formatCost(usd: number): string {
  if (usd <= 0) return "";
  return usd < 0.01 ? `~$${usd.toFixed(4)}` : `~$${usd.toFixed(3)}`;
}

interface StoryImageProps {
  imageId: string;
  /** Runs the picture again; shown on declined, failed and missing cards. */
  onRegenerate?: () => void;
  /** A guest holds no pictures (decision 60): a missing one reads as the host's. */
  isGuest?: boolean;
  className?: string;
}

export default function StoryImage({
  imageId,
  onRegenerate,
  isGuest = false,
  className = "",
}: StoryImageProps) {
  const view = useStoredImage(imageId);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const frame =
    "mt-3 rounded-xl border border-white/10 bg-white/[0.03] overflow-hidden";

  if (view.status === "none") return null;

  if (view.status === "loading") {
    return (
      <div className={`${frame} h-24 animate-pulse ${className}`} aria-busy="true" />
    );
  }

  if (view.status === "pending") {
    return (
      <div
        className={`${frame} flex items-center justify-center gap-2 aspect-[4/3] max-h-64 animate-pulse text-sm text-purple-200/70 ${className}`}
        role="status"
      >
        <DynamicIcon name="Image" className="w-4 h-4" />
        <span>Painting…</span>
      </div>
    );
  }

  if (view.status === "ready") {
    const { image, url } = view;
    const cost = formatCost(image.costUsd);
    return (
      <figure className={`${frame} ${className}`}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="block w-full cursor-zoom-in"
          title="Open full screen"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt="Picture of this moment"
            width={image.width}
            height={image.height}
            className="w-full h-auto max-h-96 object-contain bg-black/30"
          />
        </button>
        {cost && (
          <figcaption className="px-2 py-1 text-[10px] text-blue-200/40">
            {cost} · {image.model}
          </figcaption>
        )}
        {open && (
          <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/90 p-2"
            onClick={() => setOpen(false)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt="Picture of this moment"
              className="max-w-full max-h-full object-contain"
            />
            <button
              type="button"
              aria-label="Close picture"
              className="absolute top-3 right-3 p-2 rounded-full bg-white/10 text-white hover:bg-white/20"
              onClick={() => setOpen(false)}
            >
              <DynamicIcon name="X" className="w-5 h-5" />
            </button>
          </div>
        )}
      </figure>
    );
  }

  // declined, failed or missing: a message, and a way to try again.
  const message =
    view.status === "declined"
      ? `The image service declined this one${
          view.categories && view.categories.length > 0
            ? ` (${view.categories.join(", ")})`
            : ""
        }.`
      : view.status === "failed"
        ? `The picture failed: ${view.message}`
        : isGuest
          ? "Picture on the host's screen."
          : "This picture isn't on this device.";
  const canRetry = !!onRegenerate && !(view.status === "missing" && isGuest);

  return (
    <div
      className={`${frame} flex items-center justify-between gap-3 px-3 py-2 text-xs text-blue-200/60 ${className}`}
      role="status"
    >
      <span className="flex items-center gap-2">
        <DynamicIcon name="ImageOff" className="w-4 h-4 shrink-0" />
        {message}
      </span>
      {canRetry && (
        <button
          type="button"
          onClick={onRegenerate}
          className="shrink-0 px-2 py-1 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-blue-100"
        >
          {view.status === "missing" ? "Regenerate" : "Retry"}
        </button>
      )}
    </div>
  );
}
