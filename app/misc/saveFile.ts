import { Capacitor } from "@capacitor/core";
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

/**
 * Hand a file to the player.
 *
 * On the web and in the Tauri desktop app this clicks a download link on a
 * blob URL, as the app always did. The Capacitor Android and iOS WebViews
 * ignore `<a download>` on a blob URL, so there the file is written to the
 * app's cache directory and offered through the system share sheet, from
 * which the player can save it to Files, Drive or send it elsewhere.
 *
 * Closing the share sheet without choosing anything is not an error.
 */
export async function saveFile(
  name: string,
  data: Blob | string,
  mimeType: string,
): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await saveNative(name, data);
    return;
  }
  saveWithAnchor(name, data, mimeType);
}

function saveWithAnchor(
  name: string,
  data: Blob | string,
  mimeType: string,
): void {
  const blob = typeof data === "string" ? new Blob([data], { type: mimeType }) : data;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  // Chunked so a large file does not overflow the argument limit of
  // String.fromCharCode.
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

function isShareCancel(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /cancel/i.test(message);
}

async function saveNative(name: string, data: Blob | string): Promise<void> {
  const written =
    typeof data === "string"
      ? await Filesystem.writeFile({
          path: name,
          data,
          directory: Directory.Cache,
          encoding: Encoding.UTF8,
        })
      : await Filesystem.writeFile({
          path: name,
          data: await blobToBase64(data),
          directory: Directory.Cache,
        });

  try {
    const { value } = await Share.canShare();
    if (value) {
      await Share.share({ title: name, files: [written.uri] });
    } else {
      await Share.share({ title: name, url: written.uri });
    }
  } catch (error) {
    if (isShareCancel(error)) return;
    throw error;
  }
}
