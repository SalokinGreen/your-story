"use client";

// The per-story half of Settings -> Images (docs/image-generation-design.md §6):
// this story's art-style line, the space its pictures take on this device, and
// a button that clears them. The global half (toggle, cap, provider, models)
// lives in the Settings modal's Images tab (ImageSettingsTab.tsx).

import { useEffect, useState } from "react";
import { DynamicIcon } from "../../components/DynamicIcon";
import { DEFAULT_IMAGE_STYLE, getImageSettings } from "../../misc/imageSettings";
import { deleteImagesForStory, storyImageBytes } from "../../misc/imageStore";
import type { StoryData } from "../../misc/structs";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function PictureSettings({
  storyDbId,
  imageStyle,
  onUpdateStoryData,
}: {
  storyDbId: string;
  imageStyle: string | undefined;
  onUpdateStoryData: (updates: Partial<StoryData>) => void;
}) {
  const [bytes, setBytes] = useState<number | null>(null);
  const [clearing, setClearing] = useState(false);
  const [style, setStyle] = useState(imageStyle ?? "");
  const defaultStyle = getImageSettings().defaultStyle || DEFAULT_IMAGE_STYLE;

  useEffect(() => {
    let cancelled = false;
    storyImageBytes(storyDbId)
      .then((n) => {
        if (!cancelled) setBytes(n);
      })
      .catch(() => {
        if (!cancelled) setBytes(null);
      });
    return () => {
      cancelled = true;
    };
  }, [storyDbId, clearing]);

  const clear = async () => {
    if (
      !window.confirm(
        "Delete every picture of this story from this device? The story itself is not changed, and you can paint them again.",
      )
    ) {
      return;
    }
    setClearing(true);
    try {
      await deleteImagesForStory(storyDbId);
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="border border-white/10 rounded-2xl p-4 bg-white/[0.03] backdrop-blur-md space-y-4">
      <p className="text-xs text-blue-200/60">
        Pictures are kept on this device only and are not synced. The global
        switches, the per-scene limit and the models are in Settings, under
        Images.
      </p>
      <div>
        <label className="block text-sm font-medium text-blue-200 mb-2">
          Art style for this story
        </label>
        <input
          type="text"
          value={style}
          onChange={(e) => setStyle(e.target.value)}
          onBlur={() => {
            const next = style.trim();
            if (next !== (imageStyle ?? "")) {
              onUpdateStoryData({ imageStyle: next || undefined });
            }
          }}
          placeholder={defaultStyle}
          className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-400/40 placeholder:text-blue-400/40 transition-colors"
        />
        <p className="text-xs text-blue-200/50 mt-1">
          The same line ends every picture, which is what makes them look like
          one book. Leave empty to use the default.
        </p>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-blue-200/70">
          Space used:{" "}
          <span className="text-white font-semibold">
            {bytes === null ? "…" : formatBytes(bytes)}
          </span>
        </span>
        <button
          type="button"
          onClick={clear}
          disabled={clearing || bytes === 0}
          className="px-3 py-2 text-sm rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-blue-100 disabled:opacity-50 flex items-center gap-2"
        >
          <DynamicIcon name="Trash2" className="w-4 h-4" />
          Clear this story&apos;s pictures
        </button>
      </div>
    </div>
  );
}
