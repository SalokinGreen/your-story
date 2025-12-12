/**
 * Character Sheet Template System
 *
 * Templates use the syntax: {{FieldName | Description | DefaultValue}}
 * - FieldName: The label shown in the form
 * - Description: Help text explaining what to enter
 * - DefaultValue: Pre-filled value if player doesn't customize
 *
 * Example template:
 * ```
 * # {{Name | Your character's full name | Unnamed Hero}}
 * **Class:** {{Class | Your character's class or profession | Adventurer}}
 * **Background:** {{Background | A brief backstory | A wanderer seeking fortune}}
 *
 * ## Appearance
 * {{Appearance | Describe how your character looks | Weathered traveler in simple clothes}}
 * ```
 */

import {
  CharacterSheetField,
  CharacterSheetTemplate,
} from "@/app/misc/structs";

// Regex to match {{FieldName | Description | DefaultValue}} with flexible whitespace
const FIELD_REGEX =
  /\{\{\s*([^|{}]+?)\s*\|\s*([^|{}]*?)\s*\|\s*([^|{}]*?)\s*\}\}/g;

/**
 * Parse a template string and extract all fields
 */
export function parseTemplateFields(template: string): CharacterSheetField[] {
  const fields: CharacterSheetField[] = [];
  const seen = new Set<string>();

  let match;
  const regex = new RegExp(FIELD_REGEX.source, "g");

  while ((match = regex.exec(template)) !== null) {
    const name = match[1].trim();
    const description = match[2].trim();
    const defaultValue = match[3].trim();

    // Avoid duplicate fields (same name)
    if (!seen.has(name.toLowerCase())) {
      seen.add(name.toLowerCase());
      fields.push({ name, description, defaultValue });
    }
  }

  return fields;
}

/**
 * Create a CharacterSheetTemplate from a template string
 */
export function createCharacterSheetTemplate(
  template: string
): CharacterSheetTemplate {
  return {
    template,
    fields: parseTemplateFields(template),
  };
}

/**
 * Fill a template with provided values
 * @param template The template string with {{FieldName | Description | Default}} placeholders
 * @param values A map of field names to their values
 * @returns The filled template string
 */
export function fillTemplate(
  template: string,
  values: Record<string, string>
): string {
  return template.replace(
    FIELD_REGEX,
    (match, name, description, defaultValue) => {
      const fieldName = name.trim();
      const value = values[fieldName];
      // Use provided value, fall back to default, then empty string
      return value !== undefined && value !== ""
        ? value
        : defaultValue.trim() || "";
    }
  );
}

/**
 * Get default values from a template as a Record
 */
export function getDefaultValues(
  template: CharacterSheetTemplate
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of template.fields) {
    values[field.name] = field.defaultValue;
  }
  return values;
}

/**
 * Validate template syntax - checks for malformed placeholders
 * @returns Array of error messages (empty if valid)
 */
export function validateTemplate(template: string): string[] {
  const errors: string[] = [];

  // Check for unclosed braces
  const openBraces = (template.match(/\{\{/g) || []).length;
  const closeBraces = (template.match(/\}\}/g) || []).length;
  if (openBraces !== closeBraces) {
    errors.push(
      `Mismatched braces: ${openBraces} opening vs ${closeBraces} closing`
    );
  }

  // Check for fields with wrong number of pipes
  const allPlaceholders = template.match(/\{\{[^{}]*\}\}/g) || [];
  for (const placeholder of allPlaceholders) {
    const pipeCount = (placeholder.match(/\|/g) || []).length;
    if (pipeCount !== 2) {
      errors.push(
        `Field "${placeholder}" should have exactly 2 pipes (|) for Name | Description | Default`
      );
    }
  }

  // Check for empty field names
  const regex = new RegExp(FIELD_REGEX.source, "g");
  let match;
  while ((match = regex.exec(template)) !== null) {
    if (!match[1].trim()) {
      errors.push("Found field with empty name");
    }
  }

  return errors;
}

/**
 * Generate a preview of the filled template
 */
export function previewFilledTemplate(
  templateStr: string,
  values: Record<string, string>
): string {
  return fillTemplate(templateStr, values);
}

/**
 * Default character sheet template for adventures that don't define one
 */
export const DEFAULT_CHARACTER_SHEET_TEMPLATE = `# {{Name | Your character's name | Unnamed Hero}}

## Background
{{Background | A brief description of your character's history and motivations | A wanderer seeking adventure and purpose in a world full of mystery.}}

## Appearance
{{Appearance | Describe how your character looks | A figure of average height with observant eyes and practical traveling clothes.}}

## Personality
{{Personality | Key personality traits and quirks | Curious and determined, with a dry sense of humor and a strong moral compass.}}

## Goals
{{Goals | What does your character want to achieve? | To uncover the truth behind the mysteries of this world and make a difference.}}`;

/**
 * Simple one-field template for minimal character setup
 */
export const MINIMAL_CHARACTER_SHEET_TEMPLATE = `# {{Name | Your character's name | Hero}}
{{Description | Describe your character in a few sentences | An adventurer ready for whatever challenges await.}}`;

// ============================================
// RPG SYSTEM CHARACTER SHEET TEMPLATES
// ============================================

/**
 * D&D 5e style character sheet template
 */
export const DND5E_CHARACTER_SHEET_TEMPLATE = `# {{Name | Your character's full name | Unnamed Adventurer}}
**Race:** {{Race | Your character's race | Human}}
**Class:** {{Class | Your character's class | Fighter}}
**Level:** {{Level | Starting level | 1}}
**Background:** {{Background | Your character's background | Soldier}}

## Ability Scores
| STR | DEX | CON | INT | WIS | CHA |
|:---:|:---:|:---:|:---:|:---:|:---:|
| {{STR | Strength score (3-18) | 10}} | {{DEX | Dexterity score (3-18) | 10}} | {{CON | Constitution score (3-18) | 10}} | {{INT | Intelligence score (3-18) | 10}} | {{WIS | Wisdom score (3-18) | 10}} | {{CHA | Charisma score (3-18) | 10}} |

## Combat
**Armor Class:** {{AC | Your armor class | 10}}
**Hit Points:** {{HP | Maximum hit points | 10}}
**Speed:** {{Speed | Movement speed in feet | 30 ft}}
**Initiative:** {{Initiative | Initiative modifier | +0}}

## Proficiencies
**Saving Throws:** {{SavingThrows | Proficient saving throws | None}}
**Skills:** {{Skills | Proficient skills | None}}
**Languages:** {{Languages | Languages you speak | Common}}
**Tools:** {{Tools | Tool proficiencies | None}}

## Equipment
{{Equipment | Starting equipment and gear | Traveler's clothes, simple weapon, backpack with basic supplies}}

## Features & Traits
{{Features | Class features, racial traits, and special abilities | None yet}}

## Personality
**Personality Traits:** {{PersonalityTraits | Two personality traits | Curious and cautious}}
**Ideals:** {{Ideals | What drives you | Knowledge. The path to power and self-improvement is through knowledge.}}
**Bonds:** {{Bonds | Connections to people, places, or things | I have a family, but I have no idea where they are.}}
**Flaws:** {{Flaws | A flaw or weakness | I am easily distracted by the promise of information.}}

## Backstory
{{Backstory | Your character's history and how they came to adventure | A brief history of your character's life before the adventure began.}}`;

/**
 * Call of Cthulhu style character sheet template
 */
export const CALL_OF_CTHULHU_CHARACTER_SHEET_TEMPLATE = `# {{Name | Investigator's full name | John Smith}}
**Occupation:** {{Occupation | Your profession | Private Investigator}}
**Age:** {{Age | Your age | 35}}
**Birthplace:** {{Birthplace | Where you were born | Boston, Massachusetts}}
**Residence:** {{Residence | Where you currently live | Arkham}}

## Characteristics
| STR | CON | SIZ | DEX | APP | INT | POW | EDU |
|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| {{STR | Strength (15-90) | 50}} | {{CON | Constitution (15-90) | 50}} | {{SIZ | Size (40-90) | 60}} | {{DEX | Dexterity (15-90) | 50}} | {{APP | Appearance (15-90) | 50}} | {{INT | Intelligence (40-90) | 60}} | {{POW | Power (15-90) | 50}} | {{EDU | Education (40-90) | 65}} |

## Derived Stats
**Hit Points:** {{HP | (CON + SIZ) / 10 | 11}}
**Sanity:** {{Sanity | Starting Sanity = POW | 50}}
**Magic Points:** {{MP | POW / 5 | 10}}
**Luck:** {{Luck | Roll 3d6 x 5 | 50}}

## Skills
{{Skills | Your investigator's trained skills | Accounting 20%, Library Use 40%, Spot Hidden 35%, Psychology 25%, Listen 30%}}

## Combat
**Damage Bonus:** {{DamageBonus | Based on STR + SIZ | +0}}
**Build:** {{Build | Physical build | 0}}
**Move:** {{Move | Movement rate | 8}}

## Weapons
{{Weapons | Your weapons and their stats | Fists 25% (1d3+DB), .32 Revolver 30% (1d8)}}

## Backstory
**Personal Description:** {{PersonalDescription | Physical appearance | Average height, brown hair, tired eyes}}
**Ideology/Beliefs:** {{Beliefs | What you believe in | Science can explain everything... or so I thought.}}
**Significant People:** {{SignificantPeople | Important people in your life | My sister Mary, who I must protect}}
**Meaningful Locations:** {{MeaningfulLocations | Places that matter to you | The old library where I spent my youth}}
**Treasured Possessions:** {{TreasuredPossessions | Important items | My father's pocket watch}}
**Traits:** {{Traits | Personality quirks | Nervous habit of checking locks twice}}

## Background
{{Background | Your full backstory | How you became an investigator and what drives you to uncover the truth.}}`;

/**
 * Traveller style character sheet template
 */
export const TRAVELLER_CHARACTER_SHEET_TEMPLATE = `# {{Name | Your character's name | Alex Morgan}}
**Species:** {{Species | Your species | Human}}
**Homeworld:** {{Homeworld | Planet of origin | Terra (Sol III)}}
**Age:** {{Age | Your current age | 34}}

## Characteristics
| STR | DEX | END | INT | EDU | SOC |
|:---:|:---:|:---:|:---:|:---:|:---:|
| {{STR | Strength (2-12) | 7}} | {{DEX | Dexterity (2-12) | 8}} | {{END | Endurance (2-12) | 7}} | {{INT | Intelligence (2-12) | 9}} | {{EDU | Education (2-12) | 8}} | {{SOC | Social Standing (2-12) | 6}} |

## Career History
**Terms Served:** {{Terms | Number of 4-year terms | 3}}
**Career Path:** {{CareerPath | Your career(s) | Navy (2 terms), Scout (1 term)}}
**Final Rank:** {{Rank | Highest rank achieved | Lieutenant}}
**Mustering Out Benefits:** {{Benefits | What you got when you left service | Ship shares, weapon, Cr20,000}}

## Skills
{{Skills | Your trained skills and levels | Pilot 2, Astrogation 1, Vacc Suit 1, Gun Combat (Slug) 1, Electronics 0, Medic 0}}

## Equipment
**Weapons:** {{Weapons | Your weapons | Autopistol (3d6-3), Blade (2d6)}}
**Armor:** {{Armor | Your armor | Cloth Armor (TL 10, Protection 5)}}
**Gear:** {{Gear | Other equipment | Comm, Hand Computer, Medkit}}
**Credits:** {{Credits | Starting money | Cr20,000}}

## Ship (if any)
{{Ship | Your starship details | 1 Ship Share toward a Free Trader}}

## Contacts & Allies
{{Contacts | People who owe you favors or who you know | Former Navy buddy stationed at Rhylanor Starport}}

## Enemies
{{Enemies | People who have it out for you | A rival merchant who blames me for a deal gone bad}}

## Background
{{Background | Your character's history through their careers | How you served, what you saw, and why you're now a Traveller.}}`;

/**
 * Monsterhearts style character sheet template
 */
export const MONSTERHEARTS_CHARACTER_SHEET_TEMPLATE = `# {{Name | Your character's name | Alex}}
**Skin:** {{Skin | Your supernatural archetype | The Werewolf}}
**Look:** {{Look | Your physical appearance | Brooding, wild eyes, leather jacket}}

## Stats
| Hot | Cold | Volatile | Dark |
|:---:|:---:|:---:|:---:|
| {{Hot | Attractiveness and social power (-1 to +3) | 1}} | {{Cold | Detachment and manipulation (-1 to +3) | -1}} | {{Volatile | Physical action and aggression (-1 to +3) | 2}} | {{Dark | Connection to the supernatural (-1 to +3) | 0}} |

## Harm & Conditions
**Harm:** {{Harm | Current harm (0-4) | 0}} / 4
**Conditions:** {{Conditions | Current conditions | None}}

## Strings
{{Strings | Emotional leverage others have on you, or you have on them | Has 2 Strings on Jordan (my ex), Taylor has 1 String on me}}

## Moves
**Skin Moves:**
{{SkinMoves | Your supernatural abilities from your Skin | Primal Dominance, Spirit Armor, Unstable}}

**Additional Moves:**
{{AdditionalMoves | Moves gained from advancement | None yet}}

## Darkest Self
{{DarkestSelf | What happens when you lose control | When the moon is full or when you're backed into a corner, you transform. You become a predator, hunting those who have wronged you or who are in your way.}}

## Backstory
{{Backstory | How you became what you are | The night of the first transformation, and what you lost.}}

## Relationships
{{Relationships | Your connections to other characters | Conflicted attraction to Jordan, protective of Sam, rivalry with Morgan}}`;

/**
 * Fate Core style character sheet template
 */
export const FATE_CORE_CHARACTER_SHEET_TEMPLATE = `# {{Name | Your character's name | Morgan Chase}}

## High Concept
{{HighConcept | A phrase that sums up who your character is | Disgraced Knight Seeking Redemption}}

## Trouble
{{Trouble | Something that complicates your life | Haunted by the Ghosts of My Past}}

## Other Aspects
{{Aspect1 | Another key aspect of your character | "I Never Leave a Friend Behind"}}
{{Aspect2 | Another key aspect of your character | Quick with a Blade, Slow to Trust}}
{{Aspect3 | Another key aspect of your character | The Old Ways Still Have Power}}

## Skills
**Great (+4):** {{SkillGreat | Your best skill | Fight}}
**Good (+3):** {{SkillGood | Two good skills | Athletics, Will}}
**Fair (+2):** {{SkillFair | Three fair skills | Notice, Rapport, Investigate}}
**Average (+1):** {{SkillAverage | Four average skills | Contacts, Deceive, Stealth, Empathy}}

## Stunts
{{Stunt1 | A special ability | Riposte: When you succeed with style on a Fight defense, you can choose to inflict a 2-shift hit rather than take a boost.}}
{{Stunt2 | A special ability | Always a Way Out: +2 to Stealth when trying to escape from a location.}}
{{Stunt3 | A special ability | (Unlocked at milestone)}}

## Stress
**Physical:** [ ][ ][ ]
**Mental:** [ ][ ][ ]

## Consequences
**Mild (2):** {{MildConsequence | Current mild consequence | None}}
**Moderate (4):** {{ModerateConsequence | Current moderate consequence | None}}
**Severe (6):** {{SevereConsequence | Current severe consequence | None}}

## Refresh
**Fate Points:** {{FatePoints | Starting Fate Points | 3}}

## Background
{{Background | Your character's story | What led you here, what you've done, and what you seek.}}`;

/**
 * Powered by the Apocalypse (general) style character sheet template
 */
export const PBTA_CHARACTER_SHEET_TEMPLATE = `# {{Name | Your character's name | River}}
**Playbook:** {{Playbook | Your character type | The Brainer}}
**Look:** {{Look | Your appearance | Formal wear, dead eyes, bony hands}}

## Stats
| Cool | Hard | Hot | Sharp | Weird |
|:---:|:---:|:---:|:---:|:---:|
| {{Cool | Staying calm under pressure (-2 to +3) | 0}} | {{Hard | Violence and intimidation (-2 to +3) | -1}} | {{Hot | Charm and manipulation (-2 to +3) | 1}} | {{Sharp | Awareness and cunning (-2 to +3) | 1}} | {{Weird | Connection to the psychic maelstrom (-2 to +3) | 2}} |

## Harm
{{Harm | Current harm track | 0 of 6 (12:00)}}
**Conditions:** {{Conditions | Current debilities | None}}

## Moves
**Playbook Moves:**
{{PlaybookMoves | Your special abilities | Unnatural Lust Transfixion, Casual Brain Receptivity, In-Brain Puppet Strings}}

**Basic Moves:**
{{BasicMoves | Moves everyone has | Act Under Fire, Go Aggro, Seduce/Manipulate, Read a Situation, Read a Person, Open Your Brain}}

## Gear
{{Gear | Your equipment | Violation glove (implanted), fashion suitable to your look, oddments worth 2-barter}}

## Hx (History)
{{History | Your relationships with other characters | Keeler knows what I did. Hx+2. I've been watching Dog carefully. Hx+1.}}

## Improvement
**Experience:** {{XP | Current XP | 0}} / 5
**Advances Taken:** {{Advances | Improvements chosen | None yet}}

## Background
{{Background | Your character's story | Who you were before, and what the world did to you.}}`;

/**
 * Blades in the Dark style character sheet template
 */
export const BLADES_IN_THE_DARK_CHARACTER_SHEET_TEMPLATE = `# {{Name | Your character's name | Silence}}
**Alias:** {{Alias | Your street name | "The Ghost"}}
**Playbook:** {{Playbook | Your criminal specialty | Lurk}}
**Heritage:** {{Heritage | Where you're from | Skovlan}}
**Background:** {{Background | What you did before | Military}}

## Actions
**Insight**
| Hunt | Study | Survey | Tinker |
|:---:|:---:|:---:|:---:|
| {{Hunt | Tracking and marksmanship (0-4) | 1}} | {{Study | Research and analysis (0-4) | 0}} | {{Survey | Observation and perception (0-4) | 2}} | {{Tinker | Crafting and sabotage (0-4) | 0}} |

**Prowess**
| Finesse | Prowl | Skirmish | Wreck |
|:---:|:---:|:---:|:---:|
| {{Finesse | Dexterity and precision (0-4) | 1}} | {{Prowl | Stealth and infiltration (0-4) | 2}} | {{Skirmish | Close combat (0-4) | 1}} | {{Wreck | Destruction and force (0-4) | 0}} |

**Resolve**
| Attune | Command | Consort | Sway |
|:---:|:---:|:---:|:---:|
| {{Attune | Supernatural connection (0-4) | 1}} | {{Command | Leadership (0-4) | 0}} | {{Consort | Socializing with criminals (0-4) | 1}} | {{Sway | Influence and manipulation (0-4) | 0}} |

## Stress & Trauma
**Stress:** {{Stress | Current stress (0-9) | 0}} / 9
**Trauma:** {{Trauma | Permanent conditions | None}}

## Harm
{{Harm | Current injuries | None}}

## Special Abilities
{{Abilities | Your playbook abilities | Infiltrator, Ambush, Shadow}}

## Load
**Current Load:** {{Load | Light (3), Normal (5), or Heavy (6) | Normal (5)}}
**Items:** {{Items | What you're carrying | Fine lockpicks, light climbing gear, dark clothes}}

## Contacts
{{Contacts | People you know | Telda, a beggar. Darmot, a bluecoat.}}

## Vice
{{Vice | Your indulgence | Pleasure (gambling at the Silver Swan)}}

## Backstory
{{Backstory | Your criminal history | How you ended up in the shadows of Doskvol.}}`;

/**
 * World of Darkness / Chronicles of Darkness style template
 */
export const WORLD_OF_DARKNESS_CHARACTER_SHEET_TEMPLATE = `# {{Name | Your character's name | Marcus Cole}}
**Concept:** {{Concept | A brief character concept | Haunted Ex-Cop}}
**Chronicle:** {{Chronicle | The game's name | Shadows of Chicago}}
**Virtue:** {{Virtue | Your guiding virtue | Justice}}
**Vice:** {{Vice | Your weakness | Wrath}}

## Attributes
**Mental**
| Intelligence | Wits | Resolve |
|:---:|:---:|:---:|
| {{Intelligence | Mental capacity (1-5) | 2}} | {{Wits | Quick thinking (1-5) | 3}} | {{Resolve | Mental fortitude (1-5) | 2}} |

**Physical**
| Strength | Dexterity | Stamina |
|:---:|:---:|:---:|
| {{Strength | Raw power (1-5) | 2}} | {{Dexterity | Coordination (1-5) | 2}} | {{Stamina | Endurance (1-5) | 3}} |

**Social**
| Presence | Manipulation | Composure |
|:---:|:---:|:---:|
| {{Presence | Force of personality (1-5) | 2}} | {{Manipulation | Influence (1-5) | 2}} | {{Composure | Mental calm (1-5) | 2}} |

## Skills
**Mental Skills:**
{{MentalSkills | Your mental skills | Investigation 3, Medicine 1, Occult 2}}

**Physical Skills:**
{{PhysicalSkills | Your physical skills | Athletics 2, Brawl 2, Firearms 3, Stealth 2}}

**Social Skills:**
{{SocialSkills | Your social skills | Empathy 2, Intimidation 2, Streetwise 3}}

## Merits
{{Merits | Your special advantages | Contacts (Police) 2, Danger Sense 2, Iron Stamina 2}}

## Health & Willpower
**Health:** {{Health | Health boxes | 8}}
**Willpower:** {{Willpower | Willpower dots | 4}}

## Morality / Integrity
**Integrity:** {{Integrity | Your moral center (1-10) | 7}}
**Breaking Points:** {{BreakingPoints | What could shake you | Letting an innocent die, Using lethal force}}

## Conditions
{{Conditions | Current conditions | None}}

## Equipment
{{Equipment | Your gear | Service pistol, flashlight, badge (expired), flask}}

## Background
{{Background | Your character's history | What you've seen that changed everything, and why you can't let it go.}}`;

// ============================================
// PRESET TEMPLATES COLLECTION
// ============================================

export interface CharacterSheetPresetTemplate {
  id: string;
  name: string;
  description: string;
  system: string; // "dnd5e", "coc", "traveller", "monsterhearts", "fate", "pbta", "bitd", "wod", "generic"
  template: string;
}

export const CHARACTER_SHEET_PRESET_TEMPLATES: CharacterSheetPresetTemplate[] =
  [
    {
      id: "generic",
      name: "Generic Adventure",
      description: "Simple template for any adventure",
      system: "generic",
      template: DEFAULT_CHARACTER_SHEET_TEMPLATE,
    },
    {
      id: "dnd5e",
      name: "D&D 5th Edition",
      description:
        "Classic fantasy with six ability scores, classes, and feats",
      system: "dnd5e",
      template: DND5E_CHARACTER_SHEET_TEMPLATE,
    },
    {
      id: "coc",
      name: "Call of Cthulhu",
      description: "Horror investigation with sanity mechanics",
      system: "coc",
      template: CALL_OF_CTHULHU_CHARACTER_SHEET_TEMPLATE,
    },
    {
      id: "traveller",
      name: "Traveller",
      description: "Sci-fi exploration with career paths",
      system: "traveller",
      template: TRAVELLER_CHARACTER_SHEET_TEMPLATE,
    },
    {
      id: "monsterhearts",
      name: "Monsterhearts",
      description: "Supernatural teen drama with Strings mechanics",
      system: "monsterhearts",
      template: MONSTERHEARTS_CHARACTER_SHEET_TEMPLATE,
    },
    {
      id: "fate",
      name: "Fate Core",
      description: "Narrative-focused with Aspects and Fate Points",
      system: "fate",
      template: FATE_CORE_CHARACTER_SHEET_TEMPLATE,
    },
    {
      id: "pbta",
      name: "Powered by the Apocalypse",
      description: "Playbook-based with moves and Hx",
      system: "pbta",
      template: PBTA_CHARACTER_SHEET_TEMPLATE,
    },
    {
      id: "bitd",
      name: "Blades in the Dark",
      description: "Criminal heists with stress and vice",
      system: "bitd",
      template: BLADES_IN_THE_DARK_CHARACTER_SHEET_TEMPLATE,
    },
    {
      id: "wod",
      name: "World of Darkness",
      description: "Modern horror with Virtues, Vices, and Integrity",
      system: "wod",
      template: WORLD_OF_DARKNESS_CHARACTER_SHEET_TEMPLATE,
    },
  ];

/**
 * Get a preset template by ID
 */
export function getPresetTemplateById(
  id: string
): CharacterSheetPresetTemplate | undefined {
  return CHARACTER_SHEET_PRESET_TEMPLATES.find((t) => t.id === id);
}

/**
 * Get preset templates by system type
 */
export function getPresetTemplatesBySystem(
  system: string
): CharacterSheetPresetTemplate[] {
  return CHARACTER_SHEET_PRESET_TEMPLATES.filter((t) => t.system === system);
}
