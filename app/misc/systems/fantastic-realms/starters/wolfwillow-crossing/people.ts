/**
 * Wolfwillow Crossing's village people as NPCs (what the player sees on the
 * NPCs page; the GM-only wants and secrets are in the campaign record,
 * `campaign.ts`). Seven people from "Wolfwillow Crossing — The village".
 * Original text (decision 3).
 */
import type { NPC, NPCAttitude } from "../../../../structs";

const STARTED_AT = Date.parse("2026-01-01T00:00:00.000Z");

function npc(
  slug: string,
  name: string,
  role: string,
  description: string,
  attitude: NPCAttitude,
  lastSeen: string,
  symbol: string,
): NPC {
  return {
    id: `npc-${slug}`,
    name,
    description,
    role,
    status: "alive",
    relationship: "Not yet met",
    attitude,
    lastSeen,
    symbol,
    faction: "Wolfwillow Crossing",
    createdAt: STARTED_AT,
  };
}

export const WOLFWILLOW_NPCS: NPC[] = [
  npc(
    "orrin-fash",
    "Orrin Fash",
    "Ferry-keeper",
    "A lean old man on the ferry-house steps who counts every face over the bridge and keeps the visitors' book. Careful with his words, kind with his bread.",
    "neutral",
    "The ferry-house steps",
    "📖",
  ),
  npc(
    "hettie-marlow",
    "Hettie Marlow",
    "Baker, cider-maker and runner of the fair",
    "A broad, loud, flour-white woman who is owed a favour by half the valley and will not let a hero go hungry.",
    "friendly",
    "The Cider Barn",
    "🍎",
  ),
  npc(
    "wynn-alderby",
    "Wynn Alderby",
    "Miller at Oakhallow",
    "Built a new dam at the mill this spring and is touchy about it. Proud of his work and quick to take a question as an accusation.",
    "neutral",
    "Oakhallow Mill",
    "⚙️",
  ),
  npc(
    "maeve-oakhallow",
    "Maeve Oakhallow",
    "Wise woman of the ford",
    "Lives in the cottage by the ford. Reads signs in tea leaves and weather, drinks a great deal of tea and gives advice in riddles when she is tired.",
    "friendly",
    "The cottage by the ford",
    "🍵",
  ),
  npc(
    "tobin-sparrowgate",
    "Tobin Sparrowgate",
    "The village runner",
    "Twelve years old and knows every shortcut in the valley. Will run an errand for a coin or a good story.",
    "friendly",
    "Everywhere, at speed",
    "👟",
  ),
  npc(
    "granny-eskel",
    "Granny Eskel",
    "The oldest villager",
    "Nobody remembers her being young. The best storyteller in the valley, and she knows it.",
    "friendly",
    "A chair by the green",
    "🪑",
  ),
  npc(
    "rue-thistledown",
    "Captain Rue Thistledown",
    "Warden of the marches",
    "Captain of six rangers for a hundred miles of woods. Dry, tired and honest, and always short of hands.",
    "friendly",
    "The road into the Hushwood",
    "🏹",
  ),
];
