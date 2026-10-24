import { MP_BACKEND_OPTIONS, type MPBackend, type RoomId } from "./types";

/**
 * Shareable invite link (?join=CODE&provider=BACKEND), read back by
 * GuidedStoryStart to open the join screen prefilled. Only meaningful on the
 * web build, where `origin` is a site other people can actually open.
 */
export function buildInviteLink(
  origin: string,
  roomId: RoomId,
  backend: MPBackend,
): string {
  const url = new URL(origin);
  url.searchParams.set("join", roomId);
  url.searchParams.set("provider", backend);
  return url.toString();
}

/**
 * Plain-text invite for the native (Tauri/Capacitor) builds. Their origin is
 * the app's own bundle (http://tauri.localhost, capacitor://localhost, ...),
 * so a link built from it opens nothing on anyone else's device - the guest
 * types the code into Join a Game instead, picking the same connection.
 */
export function buildTextInvite(roomId: RoomId, backend: MPBackend): string {
  const connection =
    MP_BACKEND_OPTIONS.find((option) => option.value === backend)?.label ??
    backend;
  return [
    "Join my Endless Adventure game!",
    `Room code: ${roomId}`,
    `Connection: ${connection}`,
    'Open Endless Adventure, choose "Join a Game" and enter the code.',
  ].join("\n");
}
