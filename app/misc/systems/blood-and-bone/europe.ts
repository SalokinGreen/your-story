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
    scope: "cross-europe",
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

Each city in this book can stand alone or link into any of these — pull whichever threads suit your table.

## Where to read more
- **The continent:** Europe by Night — The Hollow Roads; Europe by Night — Powers of the continent; Europe by Night — Who's who.
- **Cities:** London, Paris, Prague, Rome, Berlin, Vienna, Budapest, Edinburgh, Dublin, Amsterdam, Stockholm, Lisbon, Marseille, Venice, Naples, Kraków, Bucharest (each as Europe by Night — <City>). A story carries the cities it is set in; import the rest from the library.
- **Wild places:** Europe by Night — The Carpathians; The Highlands and islands; The Alps and the Black Forest.`,
  },
  {
    id: "builtin:blood-and-bone:europe-by-night-london",
    scope: "London",
    title: "Europe by Night — London",
    type: "lore",
    tags: ["Blood & Bone","Setting"],
    keys: ["London","Undersett","Tidewrights","Thames","Smithfield","Blitz"],
    content: `# Europe by Night — London

**Atmosphere:** A city of layers — modern glass towers built over Victorian sewers built over Roman foundations. Everything old in London is still down there somewhere, and so is everything that used to live in it.

Every corner has a camera and every camera has a log. The night here is not about hiding in the dark. It is about hiding in plain sight, in the lit window of a bank at 3 a.m., in the crowd on the last Tube. The rivers that were built over still run under the pavements. In heavy rain you can hear them.

**Who holds it:** Vampires hold the financial districts, running the city's oldest money through shell companies that have existed since before shell companies had a name. Ghosts are unusually numerous and unusually organized, thanks to centuries of plague pits, fires, and Blitz casualties that never quite left.

**Faction — The Undersett:** A council of the city's eldest Vampires, named for the old buildings they claim as their bolt-holes below street level. The Undersett enforces the Concord ruthlessly in London — not out of principle, but because the city's mortal surveillance infrastructure (cameras on every corner) makes discovery catastrophic for everyone. They've been known to destroy their own kind for masquerade breaches faster than any Hunter could.

**Faction — The Tidewrights:** The Ghosts of the river. Drowned dockers, bombed-out wardens, plague-cart drivers and a few thousand nameless others, organized into watches that follow the tide tables. They keep a ledger of every death on the Thames and every building that has fallen on it. They trade what they see to anyone who will carry out a small task on the living side: a name spoken aloud, a window opened, a grave visited. The Undersett tolerates them because they see everything. They tolerate the Undersett because someone must pay for the trade.

**Local threat:** A Wendigo has been operating in London for six months, feeding carefully on the city's enormous homeless population — people who are missed by no official system. The Undersett hasn't acted because the Wendigo hasn't broken the Concord technically, but the body count is drawing Vigil attention. The truth is that the Wendigo is not hunting alone: a Tidewright watch is feeding it names, trading the locations of the unwatched in exchange for the Wendigo hunting the developers who are digging up their graves.

**Places:**
- **Smithfield after midnight.** The meat market wakes at two, loud with lorries and blood on the cobbles. Beneath it the old plague pit is sealed, and the Undersett's runners use the cold rooms for meetings nobody should be able to overhear.
- **The foreshore at low tide.** Mudlarks search the Thames beach for clay pipes and coins. After dark the Tidewrights wade out and bargain with whoever stands on the stairs.
- **A telephone exchange in Bermondsey.** Disused, still humming. A Ghost operator sits at the board and connects calls between the dead and anyone who knows the number.
- **The bomb-site garden in the City.** A churchyard left roofless since the war. Office workers eat lunch there. At night the Undersett's youngest Vampires are sent to stand watch in it.

**People:**
- **Lady Ottoline Marsh**, eldest of the Undersett, who has not been seen outside a car in forty years. She wants the Wendigo handled without a single Vampire's name attached.
- **Tomasz Wren**, a night-shift outreach worker who knows every sleeper by name. He has noticed which ones stopped coming back and has started keeping a list.
- **Old Gideon**, a Tidewright dockmaster, drowned in 1887. He wants the new development stopped and does not much care who dies to do it.
- **Priya Nair**, a mortal detective sergeant in missing persons. She has seen the pattern and has told no one. She wants someone to tell her it is not what she thinks.
- **The Fell**, a Wendigo who has not given a name in six months. It wants to stay full and unwatched, and it is learning to want more than that.

**Story hooks:**
- A Ghost tethered to a demolished plague pit resurfaces when construction crews break ground on a new development, and the tether is now attached to a corporate office building full of the living.
- The Vigil cell operating in London has identified the Undersett's meeting location and is planning a raid — someone needs to warn them, or stop the raid, or make sure it succeeds.
- Tomasz Wren brings the characters a name from his list and a scrap of Thames mud. He says the person was last seen walking toward the river with someone nobody else could see.

Use when the story is set in London, or when the characters come to it by train, river or the Hollow Roads from the coast.`,
  },
  {
    id: "builtin:blood-and-bone:europe-by-night-paris",
    scope: "Paris",
    title: "Europe by Night — Paris",
    type: "lore",
    tags: ["Blood & Bone","Setting"],
    keys: ["Paris","L'Atelier","Les Ceintures","catacombs","Père Lachaise","banlieue"],
    content: `# Europe by Night — Paris

**Atmosphere:** Paris performs elegance the way a predator performs stillness. Every arrondissement has its own supernatural character, from the tourist-thronged center to the catacomb-riddled outskirts where six million dead residents outnumber the living.

The center is lit like a stage and nobody who lives there stays long. The real city runs on the Métro's last trains, the café shutters coming down, and the old quarries that undermine a third of the streets. Under every cobbled square there is another room, and most of them have a door. The Belts know which, and so does L'Atelier, and neither has ever told the other everything. The city's most dangerous meetings happen in daylight, on café terraces, between people who have agreed not to look at each other.

**Who holds it:** Witches and Warlocks cluster here, drawn by centuries of accumulated occult tradition and a genuine market for magical services among Paris's wealthy and desperate alike. Werewolves control the outer banlieues, where police presence is thinner and territory is easier to hold.

**Faction — L'Atelier:** A loose coven-of-covens, more trade guild than cabal, that regulates magical practice in the city. L'Atelier doesn't care what you do with power — only that you pay your dues (literal and Ledger-based) and don't drag mortal attention onto the trade. Crossing L'Atelier means every witch in the city suddenly finds a reason not to help you.

**Faction — Les Ceintures:** The Werewolf packs of the ring suburbs, who call themselves the Belts. Each pack holds one stretch of the ring road, one housing estate and one football pitch, and none will cross another's line without a handshake first. They are tired of being treated as muscle by the center, and they are starting to say so in meetings. They pay L'Atelier for charms and resent every cent of it.

**Local threat:** The catacombs beneath Paris have become contested Hollow Road territory. Something ancient has taken up residence in an unmapped chamber, and both a Vampire faction and a Werewolf pack want it removed — or claimed — before it disrupts their smuggling routes. The truth is that the thing is a Ghost, not a monster: a quarryman's wife who has been waiting under the city for six hundred years, and who answers anyone who walks the tunnels with the exact words they most want to hear.

**Places:**
- **The Passage des Panoramas at closing.** A glass-roofed arcade of stamp dealers and tea rooms. L'Atelier hold their dues-day in a bookbinder's back room, and the apprentices stand at the door.
- **A horse butcher's in the 13th.** The packs meet over the counter on Tuesday nights, and the owner has never once asked why.
- **Père Lachaise after the gates close.** The cemetery is a city of stone houses with names on the doors. Ghosts keep open house, and the paths are the only neutral ground in Paris.
- **A courtyard with no sign in the 2nd.** Behind an ordinary door, a Vampire sells passage through the quarries to anyone with cash and no questions.

**People:**
- **Madame Solène Aubrac**, the Atelier's treasurer, who has never lost an argument about money. She wants the debt to the Belts called in before the Belts organize.
- **Jules Marchetti**, alpha of the northern ring, forty, a bus driver by day. He wants to keep his pack out of the catacomb war and is losing the room.
- **Inès Tavernier**, a Witch of the Atelier who has been binding Ghosts. She wants to be the first to make the charms last, and she believes it is harmless.
- **Léo Baptiste**, a mortal true-crime podcaster with forty thousand listeners. He wants the story and has no idea who is listening.
- **Comte Hugues de Vaux**, a Vampire who sells maps of the quarries. He wants the thing in the unmapped chamber to stay unmapped.

**Story hooks:**
- A member of L'Atelier has been secretly binding Ghosts as magical batteries, violating every unspoken rule about how the Kinds treat each other — and the Ghosts are starting to fight back.
- A mortal true-crime podcaster has stumbled onto a pattern of disappearances that traces directly back to a Werewolf dominance challenge gone wrong.
- Comte Hugues de Vaux's runner arrives with a map and a request: take a lantern to the unmapped chamber, and come back before dawn. The map has one door marked in a hand that is not his.

Use when the story is set in Paris, or when the characters pass through it on the Hollow Roads.`,
  },
  {
    id: "builtin:blood-and-bone:europe-by-night-prague",
    scope: "Prague",
    title: "Europe by Night — Prague",
    type: "lore",
    tags: ["Blood & Bone","Setting"],
    keys: ["Prague","Watching Stone","Bell Court","Charles Bridge","Vyšehrad","Old Town"],
    content: `# Europe by Night — Prague

**Atmosphere:** Prague never really left the Gothic behind. Spires, alchemists' workshops turned into tourist shops, and a castle that's been a seat of power for a thousand years — the city wears its supernatural history openly, which paradoxically makes it easier to hide in.

Tourists photograph the gargoyles and miss the ones that blink. The city is full of cellars: Old Town houses stand on the ground floors of older houses, and the lanes dip where the street level was once raised to beat the floods. At night the bridges empty and the statues are the only crowd. Prague's mortals have lived beside the uncanny for so long that they have a politeness about it: they do not ask, and the city rewards them by not answering. A visitor who asks is remembered.

**Who holds it:** Gargoyles are more numerous and more organized here than almost anywhere else in Europe, thanks to the sheer quantity of Gothic and Baroque architecture offering places to disappear into stone. Vampire presence is old but fractured, split among several rival bloodline-courts that have never fully reconciled.

**Faction — The Watching Stone:** A council of Prague's Gargoyles, unusual for being one of the only Gargoyle political structures in Europe with any real cohesion. They've traded their traditional isolation for mutual protection, coordinating territory and warning each other about threats. Mortals who study the city's architecture too closely sometimes vanish.

**Faction — The Bell Court:** The largest of the Vampire courts, named for the bell it still rings once a year at an hour no one remembers choosing. Its members claim descent from the castle's night-watch and hold Old Town's cellars. The Bell Court wants to be the court the others answer to, and has no interest in sharing. It has made quiet offers of alliance to the Watching Stone. The Stone has not replied.

**Local threat:** A rival Vampire court has hired a Hunter cell — unknowingly working for monsters — to eliminate a competing bloodline, using the Vigil's own people as a weapon in a vampire succession dispute. The truth is that the court behind it is the Bell Court's own heir, who is paying the Hunters through a mortal lawyer, and who wants his own mother's bloodline dead before she names her successor. If the Hunters learn who pays them, they will turn on him within the hour, and the Watching Stone will not lift a claw to save either side. The first sign is a Hunter who is too well equipped for a cell of schoolteachers.

**Places:**
- **Charles Bridge at 4 a.m.** Thirty statues, one of them a Gargoyle that has not moved in forty years and watches every meeting held on the span.
- **A cellar bar under Karlova.** Four floors down, three of them older than the street. The Bell Court's collectors hold court at the lowest table.
- **The Vyšehrad ramparts.** The old fortress hill above the river, with a cemetery for the national dead. Gargoyles keep watch from the church towers, and it is where the Watching Stone meets.
- **The Astronomical Clock before dawn.** The apostles do not turn at night, but a clockmaker's apprentice is paid to wind a second mechanism inside it. Nobody knows what it counts.

**People:**
- **Dobromila Havlíková**, the Watching Stone's speaker, who speaks for four hundred and says nothing herself. She wants the court war ended before it reaches the Gargoyles' stones.
- **Lord Radomír of the Bell Court**, ancient, courteous and ill. He wants to name his heir and cannot find one he trusts.
- **Matyáš Kroupa**, the Bell Court's heir, thirty-one years a Vampire, thin and quick. He wants his mother's line gone and his own name first on the bell.
- **Brother Anselm**, a mortal Hunter of the hired cell, a retired schoolteacher. He wants to believe the money is clean and has stopped asking.
- **Eliška Dvořáková**, a mortal restorer of stonework who has seen one of the statues move. She wants it to be a trick of the scaffolding and has not slept in a week.

**Story hooks:**
- A tourist livestreams footage that clearly shows a Gargoyle mid-transformation before the Watching Stone can intervene, and it's already been clipped and shared thousands of times.
- One of the rival Vampire courts wants to end the fractured infighting for good and is quietly recruiting outside help — including, possibly, the player characters.
- Eliška brings the characters a chip of limestone with a handprint in it, and asks them to tell her who left it on her scaffolding.

Use when the story is set in Prague, or when the characters travel there along the Hollow Roads from the east.`,
  },
  {
    id: "builtin:blood-and-bone:europe-by-night-rome",
    scope: "Rome",
    title: "Europe by Night — Rome",
    type: "lore",
    tags: ["Blood & Bone","Setting"],
    keys: ["Rome","Curia Umbrae","Hill Houses","catacombs","Tiber","Aventine"],
    content: `# Europe by Night — Rome

**Atmosphere:** Rome doesn't have supernatural history so much as it *is* supernatural history, layered so thick that half the city's monsters don't fully understand what's buried beneath their own territory.

You cannot dig anywhere in Rome without finding a floor. Every church was built on a temple that was built on a house. The Tiber embankment is high walls and plane trees, and after dark the city belongs to cats, stray dogs and the people who watch them. Rome's monsters are patient in a way that outlasts empires. Nothing is ever settled here; it is merely postponed, and the postponements have been accumulating interest for a very long time.

**Who holds it:** Vampires with genuinely ancient lineages treat Rome as something close to sacred ground, and the Vigil here is unusually organised: its cells share safe houses in the city's old convents and parish halls, and nobody in an official office knows they exist.

**Faction — The Curia Umbrae ("Shadow Curia"):** An invented secret order, answerable to no church and no state, that uses churches, sacristies and crypts as its places and has tracked and managed supernatural activity in Rome for centuries. They don't hunt indiscriminately — they catalog, contain, and occasionally recruit. Most Kinds in Rome know better than to draw their attention.

**Faction — The Hill Houses:** The old Vampire lineages, each named for the hill its founder first claimed. They are not friends. They have kept the peace for fifteen hundred years by never being in the same room without a witness, and the witness has always been a Ghost. They treat the Concord as a courtesy they extend to guests. They are very good at letting someone else pay for their quarrels. A Hill House invitation is a summons dressed as a courtesy, and anyone who has accepted one knows what it costs to refuse the second.

**Local threat:** A newly-turned Vampire, unaware of the Curia Umbrae's existence, has been feeding recklessly near St Peter's Square, and the Curia is running out of patience for the local Vampire elders to handle it internally. The truth is that the newcomer was turned on purpose by an elder of one of the Hill Houses, and set loose so that the Curia would be forced to act against a rival house. The elder expects the Curia to take the newcomer and, with him, the rival's name. The first sign is that Fabio keeps saying a stranger told him where to feed, and describes the stranger's ring.

**Places:**
- **The Aventine keyhole at midnight.** The orange garden above the Tiber, with a famous door. The Hill Houses' stewards meet there to arrange who will not be in the room.
- **A basilica crypt in Trastevere.** Pilgrims by day. At night a priest named in no register unlocks the lower door for anyone the Curia has marked. The Curia borrows the building; the parish knows nothing.
- **The Protestant Cemetery by the pyramid.** Poets and cats under cypresses. A Ghost sits at the gate and keeps the ledger of who has come to be buried there.
- **Termini station, platform 1, last train.** The Hollow Roads come into Rome here. A Werewolf porter checks whoever steps off.

**People:**
- **Monsignor Ettore Valsecchi**, a Curia Umbrae archivist, sixty, gentle and patient. He wants the newcomer alive, caged and studied.
- **Donna Lucrezia Orsolani**, eldest of the Hill Houses, three centuries older than she looks. She wants her rival's house humbled without her name on it.
- **Fabio**, the newly-turned Vampire, nineteen, from Naples. He wants someone to explain what has happened to him.
- **Suor Agnese**, a mortal Hunter of an unofficial cell, a hospital nurse. She wants Fabio staked before the Curia gets him and will use anyone to do it.
- **The Gatekeeper of the Protestant Cemetery**, a Ghost who keeps the book. It wants the book read before it fades.

**Story hooks:**
- A Hunter working within the Curia Umbrae begins to question whether the organization's "containment" is really just another form of predation.
- Catacombs beneath a minor basilica turn out to be a Ghost's tether — one who died believing themselves a saint, and whose fading grip on that belief is becoming dangerous.
- Fabio finds the characters first. He has been told by a stranger where to hide and has just noticed the stranger has been following him for three nights.

Use when the story is set in Rome, or when the characters have business with the Curia Umbrae.`,
  },
  {
    id: "builtin:blood-and-bone:europe-by-night-berlin",
    scope: "Berlin",
    title: "Europe by Night — Berlin",
    type: "lore",
    tags: ["Blood & Bone","Setting"],
    keys: ["Berlin","Ninth Ward","Spree Table","Stasi","Tempelhof","Spree"],
    content: `# Europe by Night — Berlin

**Atmosphere:** A city rebuilt from rubble twice in one century, Berlin has a rawness other European capitals lack. Its supernatural community is younger, less bound by tradition, and more willing to break old rules.

The night never really ends here. Clubs open Friday and close Monday. Courtyards hide bunkers, and the U-Bahn has ghost stations that the trains pass without slowing. The Wall is a line in the paving and a dividing line in the memory of everyone over fifty. Berlin sells what it knows: the supernatural world here has a market, and the market has hours, and the hours are the same as the clubs'.

**Who holds it:** Werewolf packs here are unusually egalitarian compared to elsewhere in Europe, having rebuilt their structures from scratch after WWII and the Cold War scattered the old hierarchies. Hunters operate with less centralized structure too — Berlin's Vigil presence is a patchwork of small, independent cells that don't always know about each other.

**Faction — The Ninth Ward:** Not a supernatural faction at all, but a mortal underground network — former Stasi informants, hackers, and fixers — who've figured out enough of the truth to quietly profit from it, selling information to whichever Kind pays best. They're dangerous precisely because they don't care about the Concord, the Vigil, or anyone's masquerade.

**Faction — The Spree Table:** The Werewolf packs' council, which sits round a literal table in the back of an allotment-garden clubhouse. Every pack has a seat and a vote, and nothing passes without all of them. It works because nobody is allowed to be the boss. It fails whenever something needs a quick answer. The Table has begun to wonder whether it needs a leader after all. Katja Brandt's month in the chair has made that question louder than anyone wants it, and a pack that breaks away would be the first Berlin has seen since the Wall.

**Local threat:** The Ninth Ward has acquired documentation proving a Werewolf pack's involvement in several deaths mortal police have written off as animal attacks, and they're auctioning it to the highest bidder — Vampire courts, rival packs, and at least one Vigil cell are all interested. The truth is that the pack in the file is innocent: the deaths were done by a Vampire who borrowed a wolf's scent, and the Ward knows it and is selling the lie because the lie sells higher. The Ward's buyers will act on the file within days, so the characters have a short window to prove it false. The first sign is that the dead are bitten, and the bite does not match the teeth of any wolf in the file.

**Places:**
- **The Tempelhof runway at dawn.** The old airport field is a public park. Packs gather on the tarmac at first light and settle disputes under a very big sky.
- **A pre-war brewery in Prenzlauer Berg.** Now a club, once an arsenal. The Ninth Ward auctions in the cold cellar, where phones do not work.
- **The Spreepark ruins.** A former amusement park, now a building site for its reopening, with the rebuilt Ferris wheel standing still. The Ghosts of its old attendants keep the gate and work the wheel only after the crews go home.
- **A U-Bahn ghost station.** The trains pass it without stopping. A single maintenance hatch leads in, and the Hollow Roads cross there.

**People:**
- **Katja Brandt**, chair of the Spree Table this month, thirty, a bike courier. She wants the Table to survive the auction without splitting.
- **Wolfgang "Wolle" Lindner**, a former Stasi clerk and the Ninth Ward's auctioneer, seventy-one. He wants the money and a long retirement, and has insured himself against both.
- **Jonas Reiter**, the young pack member who wants to go public. He has a USB stick and a journalist's number, and wants to be right.
- **Sigrid Falk**, a Hunter, mortal, ex-police. She wants the file for the Vigil and is willing to burn the Ward to get it.
- **Mikhail Dorn**, a Vampire who arrived in 1990 and never left. He wants the scent trick to stay hidden, and has already sent one witness away.

**Story hooks:**
- A young pack member wants to expose the old Cold War-era supernatural cover-ups to the public, believing transparency is safer than secrecy — and the rest of the pack has to decide whether to stop them.
- The Ninth Ward approaches the player characters directly with an offer too useful to easily refuse.
- Katja brings the characters one of the dead and a bag of fur. She says the wolf hair is real and the bite is wrong, and asks them to find out who has been wearing her pack's scent.

Use when the story is set in Berlin, or when the characters need information that is for sale.`,
  },
  {
    id: "builtin:blood-and-bone:europe-by-night-vienna",
    scope: "Vienna",
    title: "Europe by Night — Vienna",
    type: "lore",
    tags: ["Blood & Bone","Setting"],
    keys: ["Vienna","Salon","Inheritors","Ringstrasse","Hofburg","Zentralfriedhof"],
    content: `# Europe by Night — Vienna

**Atmosphere:** Vienna carries itself with imperial memory even though the empire is long gone. Old money, older grudges, and a supernatural aristocracy that still behaves as though titles mean something.

The city keeps its rules in its manners. Coffee houses stay open late and nobody is rushed out. The ring road circles the old centre like a ribbon around a gift. Under the polish, the sewers run broad enough for a carriage, and the catacombs are older than the Habsburgs' tombs. Everything in Vienna is done properly, which is why when it goes wrong it goes wrong with a straight back and a clean collar, and nobody mentions it until it is far too late.

**Who holds it:** Witches and Warlocks with generations-deep family lineages treat magic as inheritance as much as practice, and Vienna's Vampire population is dominated by a handful of old, wealthy bloodlines who intermarry (in every sense) with mortal high society.

**Faction — The Salon:** An exclusive social circle that functions as Vienna's real seat of supernatural power, blending old Vampire nobility, Witch dynasties, and enough sympathetic mortal aristocrats to make outsiders unsure who's what. Invitation to the Salon is currency; exclusion from it is a death sentence dressed as a snub.

**Faction — The Inheritors:** The Witch dynasties' own circle, six families who keep their Ledgers in a strongroom under a private bank and settle accounts between themselves every spring. They sit inside the Salon and outside it. They hold more debts than anyone in Vienna, Vampires included, and they are the only ones who can say what any invitation is really worth. Salon guests who cross a Ledger House find that their own debts have been sold to someone they have never met.

**Local threat:** A Salon member has been secretly Indebted to a foreign faction for decades, and the debt is finally coming due in a way that threatens to expose the entire Salon's carefully maintained facade. The truth is that the debtor is not a Vampire as everyone assumes but a Warlock of the Inheritors, who has been paying with the Salon's secrets a little at a time and is now out of things to pay with. The next payment is the Salon's guest list, and the Courier does not bargain. The first sign is that Dr. Brandauer has begun refusing invitations, and the Salon has begun to notice.

**Places:**
- **A coffee house on the Ringstrasse.** Marble tables, a hundred newspapers on wooden spines. The Salon's receptions are held in the back room, and the waiter knows every guest by their order.
- **The Hofburg's night corridors.** The imperial palace is offices and museums by day. After dark a few of its rooms are lent, for a fee, to people who need old walls.
- **The Zentralfriedhof on a Sunday evening.** Rows of honoured graves. The Inheritors bury their dead here and meet at the family plots to read the year's accounts.
- **A strongroom under a private bank in the Inner City.** Brass doors, six keys, a lamp that never goes out. The Ledgers are kept in it.

**People:**
- **Baroness Konstanze von Eltz**, the Salon's hostess, eighty and a Vampire for half of that. She wants the Salon never to be put in the position of choosing a side.
- **Dr. Leopold Brandauer**, a Warlock of the Inheritors, sixty, a lecturer in law. He wants the debt cleared and has run out of ways to do it quietly.
- **Marietta Hofer**, the debutante, nineteen, mortal, newly invited. She wants to know what she has been invited to, and is quicker than she looks.
- **Florian Gruber**, the head waiter, who has served three generations of guests. He wants to retire without being asked to remember anything.
- **The Courier**, a faceless woman from the foreign faction, who calls once a season. She wants the payment, and she has never been refused.

**Story hooks:**
- A mortal debutante, newly introduced to the Salon's world, has to decide whether to run or stay — and the player characters may be the ones who have to make that choice for her.
- A Witch dynasty's Ledger has been quietly manipulated by a rival family, and the coming reckoning could burn down half of Vienna's supernatural high society.
- Florian Gruber slips the characters a folded bill with a table number and a date. He says it is the last time the Courier will be seated, and asks them to be at the next table.

Use when the story is set in Vienna, or when the characters need to be introduced into polite company.`,
  },
];
