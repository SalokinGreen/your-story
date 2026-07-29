/**
 * What slice of the library a tab is currently showing.
 *
 * The same Stories/Adventures/Notes tabs serve two places now: the flat
 * "browse everything" views reached from the home screen, and the inside of
 * a single folder. `all` is the flat case (the tab renders its own folder
 * chips and can move items between folders); the other two pin the tab to
 * one folder and hide that chrome, because in a folder view the folder is
 * already the thing you navigated into.
 */
export type LibraryScope =
  | { kind: "all" }
  | { kind: "folder"; folderId: string }
  | { kind: "unfiled" };

export const ALL_SCOPE: LibraryScope = { kind: "all" };

/** Does an item filed under `folderId` belong in this scope? */
export function scopeMatches(
  scope: LibraryScope,
  folderId: string | null | undefined,
): boolean {
  switch (scope.kind) {
    case "all":
      return true;
    case "unfiled":
      return !folderId;
    case "folder":
      return folderId === scope.folderId;
  }
}

/**
 * Stable identity for a scope, for use as a dependency/key. Scopes are plain
 * object literals, so comparing them by reference would treat every parent
 * re-render as a scope change.
 */
export function scopeKey(scope: LibraryScope): string {
  return scope.kind === "folder" ? `folder:${scope.folderId}` : scope.kind;
}

/** The folder new items created in this scope should land in. */
export function scopeFolderId(scope: LibraryScope): string | null {
  return scope.kind === "folder" ? scope.folderId : null;
}
