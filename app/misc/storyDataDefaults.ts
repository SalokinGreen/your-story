import { StoryData } from "./structs";

/**
 * Backfills every array StoryData declares as required, in place, and
 * returns the same object.
 *
 * A story doesn't always arrive with all of them. The Game Designer's
 * draftToAdventure() only writes what the GM reads, so its story template has
 * none of the legacy stat-block arrays (stats, resources, inventory,
 * abilities, relationships) and no npcs when the cast is empty, and
 * startAdventureLocally() copies that template as-is. Stories saved that way
 * before this existed are already in IndexedDB, and older saves can predate
 * goals. Code throughout the app still reads these as plain arrays, so the
 * story start and the story load both run this rather than every reader
 * guarding on its own. Existing values are never replaced.
 */
export function ensureStoryDataArrays(storyData: StoryData): StoryData {
  storyData.memory ??= [];
  storyData.chapters ??= [];
  storyData.scene ??= { parts: [] };
  storyData.scene.parts ??= [];
  storyData.stats ??= [];
  storyData.resources ??= [];
  storyData.inventory ??= [];
  storyData.abilities ??= [];
  storyData.lore ??= [];
  storyData.goals ??= [];
  storyData.relationships ??= [];
  storyData.npcs ??= [];
  return storyData;
}
