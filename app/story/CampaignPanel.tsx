"use client";

import { useState } from "react";
import { DynamicIcon } from "@/app/components/DynamicIcon";
import type { PublicCampaignView } from "@/app/misc/campaign/publicView";
import CampaignBody, { campaignViewHasContent } from "./CampaignBody";

interface CampaignPanelProps {
  /**
   * The player's view of the campaign, from publicCampaignView and nothing
   * else. This component is never given the record, so it cannot show a
   * secret, a doom, a hidden clock or an unfound clue.
   */
  view: PublicCampaignView | null | undefined;
}

/**
 * The Lore page's Campaign panel: the pitch and tone, the table's lines and
 * veils, the clocks the GM has made visible and "What we know", the clues
 * found so far. Renders nothing when there is nothing to show, so a story with
 * no record sees no change. (The party phone uses CampaignBody directly.)
 */
export default function CampaignPanel({ view }: CampaignPanelProps) {
  const [open, setOpen] = useState(true);
  if (!view || !campaignViewHasContent(view)) return null;

  return (
    <section
      className="bg-ys-surface backdrop-blur-xl rounded-2xl border border-ys-border p-3 sm:p-4 shadow-[0_4px_24px_rgba(0,0,0,0.3)]"
      aria-label="Campaign"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 text-left"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 text-sm font-bold text-ys-text min-w-0">
          <DynamicIcon name="Compass" className="w-4 h-4 text-ys-accent shrink-0" />
          <span className="truncate">Campaign</span>
          {view.styleLabel && (
            <span className="ys-chip text-[11px] font-normal">{view.styleLabel}</span>
          )}
        </span>
        <DynamicIcon
          name={open ? "ChevronUp" : "ChevronDown"}
          className="w-4 h-4 text-ys-muted shrink-0"
        />
      </button>

      {open && (
        <div className="mt-3">
          <CampaignBody view={view} />
        </div>
      )}
    </section>
  );
}
