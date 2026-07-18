// Local, purely client-side folder management for organizing library stories/adventures.
// Backed by localStorage since folders are small metadata records.

export interface LocalFolder {
  id: string;
  name: string;
  color: string;
  icon: string;
  createdAt: string;
  updatedAt: string;
}

const STORAGE_KEY = "yourStory_folders";

function readFolders(): LocalFolder[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeFolders(folders: LocalFolder[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(folders));
}

export function listLocalFolders(): LocalFolder[] {
  return readFolders().sort((a, b) => a.name.localeCompare(b.name));
}

export function createLocalFolder(
  name: string,
  icon: string = "Folder",
  color: string = "#9333ea",
): LocalFolder {
  const now = new Date().toISOString();
  const folder: LocalFolder = {
    id: `folder_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    name,
    icon,
    color,
    createdAt: now,
    updatedAt: now,
  };
  const folders = readFolders();
  folders.push(folder);
  writeFolders(folders);
  return folder;
}

export function updateLocalFolder(
  folderId: string,
  updates: Partial<Pick<LocalFolder, "name" | "icon" | "color">>,
): LocalFolder | undefined {
  const folders = readFolders();
  const index = folders.findIndex((f) => f.id === folderId);
  if (index === -1) return undefined;
  folders[index] = {
    ...folders[index],
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  writeFolders(folders);
  return folders[index];
}

export function deleteLocalFolder(folderId: string): void {
  const folders = readFolders().filter((f) => f.id !== folderId);
  writeFolders(folders);
}
