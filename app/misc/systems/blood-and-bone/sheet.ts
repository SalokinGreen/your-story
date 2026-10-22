/**
 * Blood & Bone's character sheet template, in the app's
 * `{{Field | description | default}}` form. The numbers that change in play
 * (Stress, Beast, Exposure, XP, the Ledger, the Slipping Mask) are meters and
 * the Vows and Conditions are progress tracks, so none of them is written
 * into the sheet's text (design 5.9).
 */
export const BLOOD_AND_BONE_SHEET_TEMPLATE = `# {{Name | Your character's name | Unnamed}}
**Kind:** {{Kind | Vampire, Gargoyle, Wendigo, Werewolf, Witch/Warlock, Hunter or Ghost | Vampire}}
**Archetype:** {{Archetype | One of your Kind's two Archetypes | The Ripper}}
**Path:** {{Path | What you were before this (a Path from the book) | Investigator}}

## Stats (each 1-3; assign 3, 2, 2, 1, 1)
Nerve {{Nerve | Quickness, guns, keeping your head | 2}} | Heart {{Heart | Resolve, compassion, your hold on your humanity | 2}} | Bone {{Bone | Strength and violence up close | 1}} | Shadow {{Shadow | Moving unseen, lying, hunting from the dark | 3}} | Wits {{Wits | What you know and notice | 1}}
Adds cap at +2 per roll; the action score caps at 10.

## Your Kind
**Stress triggers:** {{Stress triggers | The Kind's and Archetype's triggers, each +1 once a scene | Starved, the smell of fresh blood, direct sunlight, the sight of blood}}
**Recover move:** {{Recover move | Sate the Beast (or Steel the Resolve for Hunters) and what it needs | Sate the Beast: drink mortal blood}}
**Weakness:** {{Weakness | Your Kind's Weakness | Sunlight is lethal; cannot cross a mortal threshold uninvited}}
**XP triggers in play:** {{XP triggers | Archetype XP, Alternate XP or both (chosen at session zero) | Archetype XP}}

## Connections (Weak, Steady or Strong)
{{Connections | Two to start: one Steady and one Weak, or two Weak; one line each; separate with semicolons | A friend who asks no questions (Steady); an estranged sibling (Weak)}}

## Burdens
{{Burdens | Doomed or Indebted, and who holds it; none to start | None}}

## Assets (abilities taken)
**Power:** {{Power | Your free starting Power and its first ability | Blood Scent 1}}
**Path ability:** {{Path ability | Your Path's first ability | Investigator 1}}
**Other assets:** {{Other assets | Havens, Companions, Relics, Rites and the abilities taken | None yet}}
**Gear:** {{Gear | Two or three pieces of gear and resources | A car, a phone full of contacts, a safehouse key}}
**Used tonight:** {{Used tonight | Once-per-night abilities spent this session; cleared at dawn | None}}

## Background
**Before:** {{Before | What were you before? | A night-shift nurse}}
**The moment:** {{The moment | When did you know you were not human anymore? | Waking in the morgue}}
**Who knows:** {{Who knows | Who knows what you are, and how they are handling it | No one living}}
`;
