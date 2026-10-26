/**
 * Common descriptive words (randomness plan R2, review fix). A "name" made only
 * of these is a role label ("Innkeeper", "Hooded Stranger", "The Old Guard"),
 * not a proper name, so `add_npc` takes it without a roll. A proper name still
 * has to be rolled. Newly written for this file (decision 3).
 */
const WORDS = `
a an the of and or to in on at by for with from
old young elder eldest little big small tall short fat thin grey gray pale dark fair red black white brown golden silver
hooded masked veiled cloaked robed scarred one-eyed blind deaf mute lame hunched bearded bald burly wiry stooped weathered
quiet loud nervous tired weary jovial gruff stern kindly sly shifty sullen cheerful grim stout lean ragged well-dressed
stranger traveler traveller wanderer pilgrim vagrant beggar urchin child boy girl man woman lad lass youth maiden fellow figure voice
innkeeper barkeep bartender barmaid publican landlord landlady host hostess cook baker butcher brewer miller farmer shepherd herder
fisher fisherman fisherwoman sailor boatman ferryman ferrywoman captain mate deckhand smith blacksmith farrier cobbler tailor weaver tanner
carpenter mason potter glazier chandler grocer vendor merchant trader peddler hawker tinker clerk scribe archivist librarian
guard watchman watchwoman sentry sentinel soldier sergeant lieutenant officer constable bailiff warden jailer gaoler marshal sheriff
priest priestess monk nun friar abbot abbess deacon verger sexton acolyte preacher healer midwife physician doctor nurse apothecary herbalist
mayor magistrate judge elder chief headman steward chamberlain herald courier messenger runner page squire knight noble lord lady
courtier servant maid valet butler porter doorman gatekeeper groundskeeper gardener coachman driver cabbie conductor
stable stablehand groom hunter trapper poacher ranger scout tracker guide outrider bandit thief pickpocket smuggler fence brigand raider
mercenary sellsword assassin spy informant lookout watcher stalker cultist witch warlock hermit recluse oracle seer mystic
student scholar teacher tutor sage apprentice journeyman master mistress foreman overseer manager owner proprietor keeper
neighbor neighbour local regular patron customer guest visitor tourist reporter journalist photographer officer detective inspector
receptionist concierge clerk cashier waiter waitress attendant usher janitor custodian mechanic technician engineer pilot
elderly teenage grandmother grandfather mother father brother sister uncle aunt cousin widow widower orphan
first second third last other another some any each both several few many
`;

export const ROLE_WORDS: ReadonlySet<string> = new Set(
  WORDS.split(/\s+/).filter(Boolean),
);

/** True when every word of the text is a common descriptive word or role. */
export function isRoleLabel(name: string): boolean {
  const words = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .split(/[^a-z-]+/)
    .filter(Boolean);
  return words.length > 0 && words.every((w) => ROLE_WORDS.has(w));
}
