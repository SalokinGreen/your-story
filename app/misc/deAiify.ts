/**
 * "De-AI-ify" pass: swaps out prose vocabulary widely cited as AI writing
 * tics (ozone, palpable, tapestry, testament, ...) for plainer synonyms.
 * Applied once to the finalized story-stage narration text. Each flagged
 * word has a chance of being left alone (KEEP_ORIGINAL_CHANCE) so the
 * output doesn't read like a mechanical thesaurus pass.
 */

interface WordForm {
  regex: RegExp;
  synonyms: string[];
}

const KEEP_ORIGINAL_CHANCE = 0.35;

function form(word: string, synonyms: string[]): WordForm {
  return { regex: new RegExp(`\\b${word}\\b`, "gi"), synonyms };
}

const WORD_FORMS: WordForm[] = [
  form("ozone", [
    "scorched air",
    "burnt-metal tang",
    "electric tang",
    "sulfurous whiff",
    "singed-wire smell",
  ]),
  form("palpable", [
    "tangible",
    "unmistakable",
    "thick in the air",
    "plain to feel",
    "obvious",
  ]),
  form("tapestry", ["weave", "mosaic", "patchwork", "quilt", "web"]),
  form("tapestries", ["weaves", "mosaics", "patchworks", "quilts"]),
  form("testament", ["proof", "evidence", "reminder", "sign", "marker"]),
  form("testaments", ["proofs", "reminders", "signs", "markers"]),
  form("myriad", [
    "countless",
    "a host of",
    "numerous",
    "a swarm of",
    "endless",
  ]),
  form("boundless", [
    "endless",
    "limitless",
    "unbounded",
    "vast",
    "sprawling",
  ]),
  form("unwavering", [
    "steady",
    "resolute",
    "firm",
    "unshaken",
    "dogged",
  ]),
  form("indelible", [
    "lasting",
    "permanent",
    "unforgettable",
    "ineradicable",
    "enduring",
  ]),
  form("profound", ["deep", "weighty", "grave", "heavy", "stark"]),
  form("profoundly", ["deeply", "gravely", "acutely", "utterly"]),
  form("visceral", [
    "gut-level",
    "raw",
    "physical",
    "instinctive",
    "bone-deep",
  ]),
  form("ethereal", [
    "otherworldly",
    "airy",
    "delicate",
    "gossamer",
    "dreamlike",
  ]),
  form("labyrinthine", [
    "mazelike",
    "tangled",
    "winding",
    "convoluted",
    "twisting",
  ]),
  form("kaleidoscope", [
    "riot of color",
    "swirl",
    "jumble",
    "whirl",
    "mosaic",
  ]),
  form("kaleidoscopic", [
    "swirling",
    "riotous",
    "shifting",
    "prismatic",
  ]),
  form("symphony", ["chorus", "medley", "blend", "harmony", "mix"]),
  form("cacophony", [
    "din",
    "racket",
    "clamor",
    "uproar",
    "jumble of noise",
  ]),
  form("bittersweet", [
    "mixed",
    "wistful",
    "melancholy-tinged",
    "sweet and sour",
    "poignant",
  ]),
  form("resilience", [
    "toughness",
    "grit",
    "staying power",
    "endurance",
    "steel",
  ]),
  form("resilient", [
    "tough",
    "hardy",
    "unbreakable",
    "durable",
    "sturdy",
  ]),
  form("solace", ["comfort", "relief", "refuge", "peace", "respite"]),
  form("serendipity", [
    "a lucky break",
    "chance",
    "a happy accident",
    "good fortune",
  ]),
  form("serendipitous", ["lucky", "fortuitous", "chance", "unplanned"]),
  form("juxtaposition", [
    "contrast",
    "pairing",
    "clash",
    "side-by-side pairing",
    "combination",
  ]),
  form("crescendo", ["climax", "peak", "surge", "swell", "high point"]),
  form("steadfast", ["loyal", "firm", "unshakable", "constant", "true"]),
  form("unyielding", [
    "rigid",
    "inflexible",
    "hard",
    "relentless",
    "immovable",
  ]),
  form("newfound", ["new", "recent", "fresh", "just-discovered"]),
  form("delve", ["dig", "look deeper", "dig in", "probe"]),
  form("delves", ["digs", "looks deeper", "probes"]),
  form("delved", ["dug", "dug deeper", "burrowed", "probed"]),
  form("delving", ["digging", "burrowing", "probing"]),
  form("unravel", ["untangle", "pick apart", "work loose", "come apart"]),
  form("unravels", ["untangles", "comes apart", "works loose"]),
  form("unraveled", [
    "came apart",
    "unspooled",
    "came undone",
    "frayed apart",
  ]),
  form("unraveling", ["coming apart", "unspooling", "fraying"]),
];

function matchCase(source: string, replacement: string): string {
  if (source === source.toUpperCase() && source !== source.toLowerCase()) {
    return replacement.toUpperCase();
  }
  if (source[0] === source[0].toUpperCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

/**
 * Runs the flagged-word list over finalized narration text, swapping in a
 * random synonym per occurrence (or leaving the original word, per
 * KEEP_ORIGINAL_CHANCE) so recurring AI vocabulary tics don't pile up
 * across a story.
 */
export function deAiifyText(text: string): string {
  let result = text;
  for (const { regex, synonyms } of WORD_FORMS) {
    result = result.replace(regex, (match) => {
      if (Math.random() < KEEP_ORIGINAL_CHANCE) return match;
      const synonym = synonyms[Math.floor(Math.random() * synonyms.length)];
      return matchCase(match, synonym);
    });
  }
  return result;
}

/** Reads the user's de-AI-ify toggle from localStorage. Defaults to enabled. */
export function isDeAiifyEnabled(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem("deAiifyWords") !== "false";
}
