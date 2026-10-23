/**
 * The Android back gesture's stack (decision 133). Every dismissible surface
 * (a dialog, the menu sheet, a full-screen picture) registers its own close
 * function while it is open, through `useBackHandler`; the native button
 * (`NativeBackButton`) calls the top one. Off Android nothing reads the stack,
 * so registering is harmless on the web and desktop.
 *
 * Entries are keyed by a token, never by the function, so a rerender that
 * passes a new callback updates the entry in place and never reorders it.
 * A surface removes its own entry when it closes; `popBackHandler` only calls
 * the top one, so a second back before the surface has unmounted would call it
 * again. That is harmless for a close function (it sets a flag to false).
 */

interface BackEntry {
  token: symbol;
  fn: () => void;
}

const stack: BackEntry[] = [];
let routeBack: (() => void | boolean) | null = null;

/** Adds an entry on top, or updates the function of one already there. */
export function pushBackHandler(token: symbol, fn: () => void): void {
  const existing = stack.find((e) => e.token === token);
  if (existing) {
    existing.fn = fn;
    return;
  }
  stack.push({ token, fn });
}

export function removeBackHandler(token: symbol): void {
  const i = stack.findIndex((e) => e.token === token);
  if (i !== -1) stack.splice(i, 1);
}

/** Calls the top entry's function. False when nothing is open. */
export function popBackHandler(): boolean {
  const top = stack[stack.length - 1];
  if (!top) return false;
  top.fn();
  return true;
}

/** The page's own back (story to Library, and so on); null for none. */
export function setRouteBack(fn: (() => void | boolean) | null): void {
  routeBack = fn;
}

/** Clears the route back only if `fn` is still the one set (a page leaving). */
export function clearRouteBack(fn: () => void | boolean): void {
  if (routeBack === fn) routeBack = null;
}

/** False when there is none, or it returned false (declined: the app goes to the background). */
export function runRouteBack(): boolean {
  if (!routeBack) return false;
  return routeBack() !== false;
}

/** Test seam. */
export function resetBackStackForTests(): void {
  stack.length = 0;
  routeBack = null;
}
