/**
 * Blood & Bone's meter sets (design 4.2, 5.5). `manage_meter create_set`
 * makes a whole set for one owner. Threshold notes are what the engine
 * reports to the GM when a meter crosses them, so each says what to do.
 */
import type { MeterSet } from "../../structs";

export const BLOOD_AND_BONE_METER_SETS: MeterSet[] = [
  {
    name: "Blood & Bone character",
    description: "Stress, Beast, Exposure and XP for one character.",
    meters: [
      {
        name: "Stress",
        min: 0,
        max: 6,
        start: 2,
        description: "Immediate pressure. At its cap: a Time Skip.",
      },
      {
        name: "Beast",
        min: 0,
        max: 10,
        start: 0,
        onlyUp: true,
        description: "Permanent loss of self. Never falls.",
        thresholds: [
          {
            at: 3,
            label: "The First Crack",
            note: "The player lowers one stat by 1 (minimum 1); edit the sheet. Narrate the Kind's change for this step.",
          },
          {
            at: 6,
            label: "The Slipping",
            note: "manage_meter set_cap Stress to 5. Narrate the Kind's change for this step.",
          },
          {
            at: 9,
            label: "The Last Warning",
            note: "manage_meter set_cap Stress to 4 and set_floor Stress to 1. Narrate the Kind's change for this step.",
          },
          {
            at: 10,
            label: "The Beast takes control",
            note: "The character is gone, no roll: an Epic antagonist now. The player makes a Successor with an Epic Vow (B&B — Time Skip and the Turning).",
          },
        ],
      },
      {
        name: "Exposure",
        min: 0,
        max: 6,
        start: 0,
        description: "Evidence of you personally in the world.",
        thresholds: [
          { at: 3, label: "Attention", note: "Someone is actively looking: bring in an investigator, journalist, hunter or rival. -1 to Slip Away in the home city." },
          { at: 4, label: "Pressure", note: "A Haven is compromised and watched; a Connection drops a rank." },
          { at: 5, label: "Hunted", note: "Something competent is hunting them. No Stress recovery in the home city until pursuit is dealt with." },
          { at: 6, label: "Burned", note: "They are known. Take the Doomed Burden now; they must leave the city." },
        ],
      },
      {
        name: "XP",
        min: 0,
        max: 999,
        start: 0,
        description: "Experience to spend (asset 2, next ability 3, Connection rank 3, stat 10).",
      },
    ],
  },
  {
    name: "Witch",
    description: "The Witch/Warlock's Ledger.",
    meters: [
      {
        name: "Ledger",
        min: 0,
        max: 10,
        start: 0,
        description: "Marks owed to the source of the power.",
        thresholds: [
          {
            at: 10,
            label: "The source's demand",
            note: "The source makes its demand; you set it. No working that costs marks until it is met. Meeting it drops the Ledger to 5 (0 with The Clean Slate).",
          },
        ],
      },
    ],
  },
  {
    name: "Wendigo",
    description: "The Wendigo's Slipping Mask.",
    meters: [
      {
        name: "Slipping Mask",
        min: 0,
        max: 3,
        start: 0,
        description: "How much of the human face is left.",
        thresholds: [
          { at: 1, label: "Strained", note: "The mask takes effort." },
          { at: 2, label: "Cracking", note: "Anyone who looks closely sees something wrong." },
          { at: 3, label: "Slipped", note: "The human face is gone." },
        ],
      },
    ],
  },
  {
    name: "City",
    description: "Heat for the city; make it for owner world.",
    meters: [
      {
        name: "Heat",
        min: 0,
        max: 6,
        start: 0,
        description: "Mortal institutional attention to the supernatural.",
        thresholds: [
          { at: 3, label: "A pattern", note: "Mortal authorities see a pattern; investigations become a recurring obstacle." },
          { at: 4, label: "A dedicated unit", note: "A dedicated unit exists; supernatural factions start enforcing the Concord violently to bring Heat down." },
          { at: 5, label: "Public awareness", note: "Amateur hunters, viral footage, panic. Every Kind in the city is in danger from ordinary people." },
          { at: 6, label: "The city is lost", note: "Mass exodus of the supernatural, or open conflict. The chronicle changes permanently." },
        ],
      },
    ],
  },
];
