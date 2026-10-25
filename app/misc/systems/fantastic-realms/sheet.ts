/**
 * Fantastic Realms: the character sheet template, the creation steps and the
 * meter set (design 2.8, 5.2). Hearts, Level and XP live in the "Fantastic
 * Realms hero" meter set and the feats in the engine's hero state; the sheet
 * writes them down for the player to read. Original text (decision 3).
 */
import type { CreationStep } from "../../setupSteps";
import type { MeterSet } from "../../structs";

export const FANTASTIC_REALMS_SHEET_TEMPLATE = `# {{Name | Your hero's name | Unnamed}}
**Concept:** {{Concept | One line: who you are and what you do | A wandering knight with a bad knee}}

## Feats (four to start; every level adds one)
{{Feats | Four words or short phrases, separated with semicolons; at least one about who you are and one about something you carry | Brave; Sword; Quick; Old Shield}}

## How you stand
**Hearts:** {{Hearts | Hearts you start with; the meter keeps the count | 3}} | **Level:** {{Level | Starts at 1 | 1}} | **XP:** {{XP | Starts at 0 | 0}}

## Gear
{{Gear | A few things you carry, in words | A traveller's cloak, a waterskin, a lucky coin}}
**Items (feats you carry, with qualities):** {{Items | Any good item that is one of your feats, with its quality words, or none | none}}

## Conditions and scars
**Conditions:** {{Conditions | Words that cost a die for now (the engine keeps them), or none | none}}
**Scars:** {{Scars | Lasting words that cost a die only in their own situation, or none | none}}

## Background
**Realm tie:** {{Realm tie | Why you are in the starting realm | Looking for work on the frontier}}
**Before:** {{Before | Where you come from | Raised by a ferry-keeper}}
**You want:** {{You want | What you hope to get from this adventure | A place to call home}}
`;

const step = (id: string, label: string, hint: string): CreationStep => ({
  id,
  label,
  group: "character",
  scope: "player",
  hint,
});

export const FANTASTIC_REALMS_CREATION_STEPS: CreationStep[] = [
  step(
    "concept",
    "Concept",
    "One line: who the hero is and what they do. Offer two to four ideas from the realm and the tone, and leave room for their own.",
  ),
  step(
    "feats",
    "Feats",
    "Four feats, words or short phrases: at least one about who they are and one about something they carry. Suggest a few drawn from the concept and the realm, say what each is good for, and tell them a magic power is a feat too (a spell), and a good item you carry is one (an item). Offer a calling (FR — Callings) as an option: a calling's kit is its signature feat plus three from its five suggestions, and a freeform hero picks one personal move of the same size, a once-per-rest flourish of their own, instead. Ask for all four feats in one go, under this tag.",
  ),
  step(
    "realm_tie",
    "Realm tie",
    "Why the hero is in the starting realm: an errand, a debt, a flight, a promise or a curiosity. It should point at the first scene.",
  ),
];

export const FANTASTIC_REALMS_HISTORY_HINT =
  "Three short questions, no more: who raised them, what did they leave behind to come here, and what are they proud of. Keep it grounded in everyday life, with no secret powers and no past lives.";

export const FANTASTIC_REALMS_METER_SETS: MeterSet[] = [
  {
    name: "Fantastic Realms hero",
    description: "Hearts, Level and XP for one hero (owner = their name).",
    meters: [
      {
        name: "Hearts",
        min: 0,
        max: 3,
        start: 3,
        description:
          "Harm the hero can take. 0 is down. A rest heals them all; every third level raises the maximum by 1. At 0 the hero is down: out of the scene, and the GM picks a cost.",
      },
      {
        name: "Level",
        min: 1,
        max: 20,
        start: 1,
        description: "Raised by award_xp. Each level gives a new feat.",
      },
      {
        name: "XP",
        min: 0,
        max: 2000,
        start: 0,
        description:
          "Toward the next level, which costs (level + 1) x 1,000. Raised only by award_xp.",
      },
    ],
  },
  {
    name: "Fantastic Realms party",
    description:
      "The party's Supplies (owner = world). Made with create_set on the first journey; the party starts with 3.",
    meters: [
      {
        name: "Supplies",
        min: 0,
        max: 6,
        start: 3,
        description:
          "One Supply feeds the whole party for a day; a journey day costs 1. Buying, foraging or a host's hospitality refills it, up to 6. At 0 the party is Hungry: a condition on every hero that only a meal clears.",
      },
    ],
  },
];
