/**
 * Blood & Bone, AI edition: the Europe by Night setting pack.
 * Original text for the GM, condensed from the author's rulebook
 * (docs/blood-and-bone/rulebook.md). Not copied from any other product
 * (decision 3).
 */
import type { BuiltinNote } from "../types";

export const EUROPE_NOTES: BuiltinNote[] = [
  {
    id: "builtin:blood-and-bone:europe-by-night-overview",
    title: "Europe by Night — Overview",
    type: "lore",
    tags: ["Blood & Bone","Setting"],
    keys: ["Europe","Concord","Vigil","Hollow Roads"],
    content: `# Europe by Night — Overview

Europe has been dying and being reborn for two thousand years, and the things that walk it after dark have watched every cycle. This is a continent where the borders between nations shift every generation or two, but the borders between Kinds are older, harder, and drawn in blood. A Vampire's territory in Vienna was already old when the Habsburgs were young. A Werewolf pack in the Carpathians remembers when the forests covered ground that's now farmland. Ghosts haunt cities that have been leveled and rebuilt three times over, tethered to buildings that no longer exist.

This supplement gives you six major cities to set your chronicle in, a Europe-wide political overview, and enough factions, threats, and hooks to run months of play in any one of them — or to send your characters travelling between them, carrying trouble across borders the way monsters always have.

## The State of the Night

Three continent-spanning forces shape supernatural politics in modern Europe. Every city write-up in this book references at least one of them.

**The Concord** — An unofficial, frequently-broken non-aggression pact between the older Kinds (particularly Vampires and Werewolves) in cities where open warfare would be too costly to hide from mortals. The Concord isn't a government; it's closer to an understanding, city by city, enforced by whoever's strong enough to enforce it. Breaking it doesn't bring legal consequences — it brings retaliation.

**The Vigil** — A loose, informal network of Hunters across the continent who share information, safehouses, and occasionally resources, without any central leadership. Some cells are religious orders centuries old; others are three friends who found out the truth last year and can't look away. The Vigil doesn't trust easily, and infighting between cells is as common as cooperation.

**The Hollow Roads** — Old smuggling and travel routes — literal and supernatural — that predate most modern borders. Originally trade routes, they're now used by every Kind to move people, secrets, and bodies across Europe without official notice. Controlling a stretch of Hollow Road is enormously valuable and enormously dangerous, since it puts you in everyone's business at once.

## Running a Europe-spanning chronicle
If your table wants to move between cities rather than settle in one, use the Hollow Roads as your connective tissue — a group with access to (or conflict over) a stretch of Hollow Road has a built-in reason to travel. Consider these campaign throughlines:

- **The Concord Is Breaking:** Something is causing simultaneous Concord violations across multiple cities. Is it coordinated? Who benefits?
- **A Vigil Purge:** A powerful, disciplined Vigil faction is moving city to city, more organized and more successful than anything local Kinds have faced before.
- **The Ledger Comes Due:** A Warlock centuries old has debts spread across half the continent, and they're calling in every favor at once before something catches up to them first.

Each city in this book can stand alone or link into any of these — pull whichever threads suit your table.`,
  },
  {
    id: "builtin:blood-and-bone:europe-by-night-london",
    title: "Europe by Night — London",
    type: "lore",
    tags: ["Blood & Bone","Setting"],
    keys: ["London"],
    content: `# Europe by Night — London

**Atmosphere:** A city of layers — modern glass towers built over Victorian sewers built over Roman foundations. Everything old in London is still down there somewhere, and so is everything that used to live in it.

**Dominant Presence:** Vampires hold the financial districts, running the city's oldest money through shell companies that have existed since before shell companies had a name. Ghosts are unusually numerous and unusually organized, thanks to centuries of plague pits, fires, and Blitz casualties that never quite left.

**Key Faction — The Undersett:** A council of the city's eldest Vampires, named for the old buildings they claim as their bolt-holes below street level. The Undersett enforces the Concord ruthlessly in London — not out of principle, but because the city's mortal surveillance infrastructure (cameras on every corner) makes discovery catastrophic for everyone. They've been known to destroy their own kind for masquerade breaches faster than any Hunter could.

**Local Threat:** A Wendigo has been operating in London for six months, feeding carefully on the city's enormous homeless population — people who are missed by no official system. The Undersett hasn't acted because the Wendigo hasn't broken the Concord technically, but the body count is drawing Vigil attention.

**Story Hooks:**
- A Ghost tethered to a demolished plague pit resurfaces when construction crews break ground on a new development, and the tether is now attached to a corporate office building full of the living.
- The Vigil cell operating in London has identified the Undersett's meeting location and is planning a raid — someone needs to warn them, or stop the raid, or make sure it succeeds.`,
  },
  {
    id: "builtin:blood-and-bone:europe-by-night-paris",
    title: "Europe by Night — Paris",
    type: "lore",
    tags: ["Blood & Bone","Setting"],
    keys: ["Paris"],
    content: `# Europe by Night — Paris

**Atmosphere:** Paris performs elegance the way a predator performs stillness. Every arrondissement has its own supernatural character, from the tourist-thronged center to the catacomb-riddled outskirts where six million dead residents outnumber the living.

**Dominant Presence:** Witches and Warlocks cluster here, drawn by centuries of accumulated occult tradition and a genuine market for magical services among Paris's wealthy and desperate alike. Werewolves control the outer banlieues, where police presence is thinner and territory is easier to hold.

**Key Faction — L'Atelier:** A loose coven-of-covens, more trade guild than cabal, that regulates magical practice in the city. L'Atelier doesn't care what you do with power — only that you pay your dues (literal and Ledger-based) and don't drag mortal attention onto the trade. Crossing L'Atelier means every witch in the city suddenly finds a reason not to help you.

**Local Threat:** The catacombs beneath Paris have become contested Hollow Road territory. Something ancient has taken up residence in an unmapped chamber, and both a Vampire faction and a Werewolf pack want it removed — or claimed — before it disrupts their smuggling routes.

**Story Hooks:**
- A member of L'Atelier has been secretly binding Ghosts as magical batteries, violating every unspoken rule about how the Kinds treat each other — and the Ghosts are starting to fight back.
- A mortal true-crime podcaster has stumbled onto a pattern of disappearances that traces directly back to a Werewolf dominance challenge gone wrong.`,
  },
  {
    id: "builtin:blood-and-bone:europe-by-night-prague",
    title: "Europe by Night — Prague",
    type: "lore",
    tags: ["Blood & Bone","Setting"],
    keys: ["Prague"],
    content: `# Europe by Night — Prague

**Atmosphere:** Prague never really left the Gothic behind. Spires, alchemists' workshops turned into tourist shops, and a castle that's been a seat of power for a thousand years — the city wears its supernatural history openly, which paradoxically makes it easier to hide in.

**Dominant Presence:** Gargoyles are more numerous and more organized here than almost anywhere else in Europe, thanks to the sheer quantity of Gothic and Baroque architecture offering places to disappear into stone. Vampire presence is old but fractured, split among several rival bloodline-courts that have never fully reconciled.

**Key Faction — The Watching Stone:** A council of Prague's Gargoyles, unusual for being one of the only Gargoyle political structures in Europe with any real cohesion. They've traded their traditional isolation for mutual protection, coordinating territory and warning each other about threats. Mortals who study the city's architecture too closely sometimes vanish.

**Local Threat:** A rival Vampire court has hired a Hunter cell — unknowingly working for monsters — to eliminate a competing bloodline, using the Vigil's own people as a weapon in a vampire succession dispute.

**Story Hooks:**
- A tourist livestreams footage that clearly shows a Gargoyle mid-transformation before the Watching Stone can intervene, and it's already been clipped and shared thousands of times.
- One of the rival Vampire courts wants to end the fractured infighting for good and is quietly recruiting outside help — including, possibly, the player characters.`,
  },
  {
    id: "builtin:blood-and-bone:europe-by-night-rome",
    title: "Europe by Night — Rome",
    type: "lore",
    tags: ["Blood & Bone","Setting"],
    keys: ["Rome"],
    content: `# Europe by Night — Rome

**Atmosphere:** Rome doesn't have supernatural history so much as it *is* supernatural history, layered so thick that half the city's monsters don't fully understand what's buried beneath their own territory.

**Dominant Presence:** Vampires with genuinely ancient lineages treat Rome as something close to sacred ground, and the Church's historical entanglement with the supernatural means the Vigil here is unusually institutional — several cells operate with quiet, unofficial blessing from within the Vatican itself.

**Key Faction — The Curia Umbrae ("Shadow Curia"):** A secretive body within the Church, separate from any official Vatican structure, that has tracked and managed supernatural activity in Rome for centuries. They don't hunt indiscriminately — they catalog, contain, and occasionally recruit. Most Kinds in Rome know better than to draw their attention.

**Local Threat:** A newly-turned Vampire, unaware of the Curia Umbrae's existence, has been feeding recklessly near the Vatican itself, and the Curia is running out of patience for the local Vampire elders to handle it internally.

**Story Hooks:**
- A Hunter working within the Curia Umbrae begins to question whether the organization's "containment" is really just another form of predation.
- Catacombs beneath a minor basilica turn out to be a Ghost's tether — one who died believing themselves a saint, and whose fading grip on that belief is becoming dangerous.`,
  },
  {
    id: "builtin:blood-and-bone:europe-by-night-berlin",
    title: "Europe by Night — Berlin",
    type: "lore",
    tags: ["Blood & Bone","Setting"],
    keys: ["Berlin"],
    content: `# Europe by Night — Berlin

**Atmosphere:** A city rebuilt from rubble twice in one century, Berlin has a rawness other European capitals lack. Its supernatural community is younger, less bound by tradition, and more willing to break old rules.

**Dominant Presence:** Werewolf packs here are unusually egalitarian compared to elsewhere in Europe, having rebuilt their structures from scratch after WWII and the Cold War scattered the old hierarchies. Hunters operate with less centralized structure too — Berlin's Vigil presence is a patchwork of small, independent cells that don't always know about each other.

**Key Faction — The Ninth Ward:** Not a supernatural faction at all, but a mortal underground network — former Stasi informants, hackers, and fixers — who've figured out enough of the truth to quietly profit from it, selling information to whichever Kind pays best. They're dangerous precisely because they don't care about the Concord, the Vigil, or anyone's masquerade.

**Local Threat:** The Ninth Ward has acquired documentation proving a Werewolf pack's involvement in several deaths mortal police have written off as animal attacks, and they're auctioning it to the highest bidder — Vampire courts, rival packs, and at least one Vigil cell are all interested.

**Story Hooks:**
- A young pack member wants to expose the old Cold War-era supernatural cover-ups to the public, believing transparency is safer than secrecy — and the rest of the pack has to decide whether to stop them.
- The Ninth Ward approaches the player characters directly with an offer too useful to easily refuse.`,
  },
  {
    id: "builtin:blood-and-bone:europe-by-night-vienna",
    title: "Europe by Night — Vienna",
    type: "lore",
    tags: ["Blood & Bone","Setting"],
    keys: ["Vienna"],
    content: `# Europe by Night — Vienna

**Atmosphere:** Vienna carries itself with imperial memory even though the empire is long gone. Old money, older grudges, and a supernatural aristocracy that still behaves as though titles mean something.

**Dominant Presence:** Witches and Warlocks with generations-deep family lineages treat magic as inheritance as much as practice, and Vienna's Vampire population is dominated by a handful of old, wealthy bloodlines who intermarry (in every sense) with mortal high society.

**Key Faction — The Salon:** An exclusive social circle that functions as Vienna's real seat of supernatural power, blending old Vampire nobility, Witch dynasties, and enough sympathetic mortal aristocrats to make outsiders unsure who's what. Invitation to the Salon is currency; exclusion from it is a death sentence dressed as a snub.

**Local Threat:** A Salon member has been secretly Indebted to a foreign faction for decades, and the debt is finally coming due in a way that threatens to expose the entire Salon's carefully maintained facade.

**Story Hooks:**
- A mortal debutante, newly introduced to the Salon's world, has to decide whether to run or stay — and the player characters may be the ones who have to make that choice for her.
- A Witch dynasty's Ledger has been quietly manipulated by a rival family, and the coming reckoning could burn down half of Vienna's supernatural high society.`,
  },
];
