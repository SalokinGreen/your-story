// The campaign's player view as plain markup: no icons, no state, so the party
// phone page (which bundles no icon set) can use it as well as the Lore page.
import type { PublicCampaignView } from "@/app/misc/campaign/publicView";

/** True when the view has anything the player should see. */
export function campaignViewHasContent(view: PublicCampaignView | null | undefined): boolean {
  if (!view) return false;
  return Boolean(
    view.premise ||
      view.tone.length > 0 ||
      view.lines.length > 0 ||
      view.veils.length > 0 ||
      view.clocks.length > 0 ||
      view.known.length > 0,
  );
}

/**
 * The pitch, tone, lines and veils, visible clocks and "What we know". Takes
 * the projection only, never the record, so it cannot show a secret, a doom, a
 * hidden clock or an unfound clue. Keys come from the data.
 */
export default function CampaignBody({ view }: { view: PublicCampaignView }) {
  return (
    <div className="space-y-4 min-w-0">
      {view.premise && (
        <p className="text-sm leading-relaxed text-ys-text break-words">{view.premise}</p>
      )}

      {view.tone.length > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-label="Tone">
          {view.tone.map((t, i) => (
            <span key={`tone-${i}`} className="ys-chip text-[11px]">
              {t}
            </span>
          ))}
        </div>
      )}

      {(view.lines.length > 0 || view.veils.length > 0) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {view.lines.length > 0 && (
            <div className="min-w-0">
              <h3 className="text-[11px] uppercase tracking-wide text-ys-muted">
                Lines (never shown)
              </h3>
              <ul className="mt-1 space-y-1 text-sm text-ys-text">
                {view.lines.map((l, i) => (
                  <li key={`line-${i}`} className="break-words">
                    {l}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {view.veils.length > 0 && (
            <div className="min-w-0">
              <h3 className="text-[11px] uppercase tracking-wide text-ys-muted">
                Veils (off screen)
              </h3>
              <ul className="mt-1 space-y-1 text-sm text-ys-text">
                {view.veils.map((v, i) => (
                  <li key={`veil-${i}`} className="break-words">
                    {v}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {view.clocks.length > 0 && (
        <div className="min-w-0">
          <h3 className="text-[11px] uppercase tracking-wide text-ys-muted">Clocks</h3>
          <ul className="mt-1 space-y-2">
            {view.clocks.map((c, i) => (
              <li key={`clock-${i}`} className="min-w-0">
                <div className="flex items-baseline justify-between gap-2 text-sm text-ys-text">
                  <span className="min-w-0 break-words">{c.name}</span>
                  <span className="shrink-0 text-xs text-ys-muted">
                    {c.filled} / {c.segments}
                  </span>
                </div>
                <div
                  className="mt-1 flex gap-1"
                  role="img"
                  aria-label={`${c.name}: ${c.filled} of ${c.segments}`}
                >
                  {Array.from({ length: Math.max(0, c.segments) }, (_, n) => (
                    <span
                      key={n}
                      className={`h-2 flex-1 rounded-full ${
                        n < c.filled ? "bg-ys-warning" : "bg-ys-surface-2"
                      }`}
                    />
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {view.known.length > 0 && (
        <div className="min-w-0">
          <h3 className="text-[11px] uppercase tracking-wide text-ys-muted">What we know</h3>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-ys-text">
            {view.known.map((k, i) => (
              <li key={`known-${i}`} className="break-words">
                {k}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
