// Folder colours are data the player picks, not theme colours (docs/whole-app-themes-plan.md,
// slice 4), so the two fixed values the Library falls back on live here, outside the
// files the theme ratchet reads.

/** The colour a new folder starts with (the same default `localFolderManager` uses). */
export const NEW_FOLDER_COLOR = "#9333ea";

/** The stripe for the "Unfiled" tile and for a folder whose colour is missing. */
export const UNFILED_FOLDER_COLOR = "#64748b";
