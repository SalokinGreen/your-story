// The player colours shared by couch co-op, online play and party mode, so a
// player keeps the same colour choices wherever they join from.
export const PLAYER_PALETTE = [
  "#22c55e", // green
  "#ec4899", // pink
  "#3b82f6", // blue
  "#f59e0b", // amber
  "#a855f7", // purple
  "#ef4444", // red
  "#14b8a6", // teal
  "#eab308", // yellow
];

/** The text colour on top of a player's colour: the palette is mid-bright on every theme, so the label is white on all of them. */
export const PLAYER_TEXT_COLOR = "#ffffff";

/** A player with no colour of their own (a sheet whose owner left). */
export const PLAYER_FALLBACK_COLOR = "#6b7280";

/** What a host and a joiner get when the link names no colour. */
export const DEFAULT_HOST_COLOR = PLAYER_PALETTE[4];
export const DEFAULT_JOIN_COLOR = PLAYER_PALETTE[0];

/** A QR code is black on white on every theme, or phones cannot read it. */
export const QR_BACKGROUND = "#ffffff";
export const QR_FOREGROUND = "#000000";
