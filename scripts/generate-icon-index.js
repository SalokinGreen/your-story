/**
 * Script to generate icon index from game-icons.net SVGs
 * Run with: node scripts/generate-icon-index.js
 */

const fs = require('fs');
const path = require('path');

const ICONS_DIR = path.join(__dirname, '..', 'public', 'icons');
const OUTPUT_FILE = path.join(__dirname, '..', 'app', 'misc', 'gameIcons.ts');

// Author display names for attribution (from license.txt)
const AUTHOR_DISPLAY_NAMES = {
  'andymeneely': 'Andy Meneely',
  'aussiesim': 'Aussiesim',
  'carl-olsen': 'Carl Olsen',
  'caro-asercion': 'Caro Asercion',
  'cathelineau': 'Cathelineau',
  'catsu': 'Catsu',
  'darkzaitzev': 'DarkZaitzev',
  'delapouite': 'Delapouite',
  'faithtoken': 'Faithtoken',
  'felbrigg': 'Felbrigg',
  'generalace135': 'GeneralAce135',
  'guard13007': 'Guard13007',
  'heavenly-dog': 'HeavenlyDog',
  'irongamer': 'Irongamer',
  'john-colburn': 'John Colburn',
  'john-redman': 'John Redman',
  'kier-heyl': 'Kier Heyl',
  'lorc': 'Lorc',
  'lord-berandas': 'Lord Berandas',
  'lucasms': 'Lucas',
  'pepijn-poolman': 'Pepijn Poolman',
  'pierre-leducq': 'Pierre Leducq',
  'priorblue': 'PriorBlue',
  'quoting': 'Quoting',
  'rihlsul': 'Rihlsul',
  'sbed': 'Sbed',
  'seregacthtuf': 'Seregacthtuf',
  'skoll': 'Skoll',
  'sparker': 'Sparker',
  'spencerdub': 'SpencerDub',
  'starseeker': 'Starseeker',
  'various-artists': 'Various Artists',
  'viscious-speed': 'Viscious Speed',
  'willdabeast': 'Willdabeast',
  'zajkonur': 'Zajkonur',
  'zeromancer': 'Zeromancer',
};

// CC0 authors (no attribution required, but nice to have)
const CC0_AUTHORS = ['viscious-speed', 'zeromancer'];

// Category keywords for auto-categorization
const CATEGORY_KEYWORDS = {
  'Weapons': [
    'sword', 'axe', 'dagger', 'spear', 'bow', 'arrow', 'blade', 'mace', 'hammer',
    'knife', 'scythe', 'halberd', 'pike', 'lance', 'crossbow', 'flail', 'club',
    'staff', 'wand', 'trident', 'whip', 'gun', 'pistol', 'rifle', 'cannon',
    'bomb', 'grenade', 'shuriken', 'katana', 'rapier', 'saber', 'cutlass'
  ],
  'Armor & Equipment': [
    'shield', 'helm', 'helmet', 'armor', 'gauntlet', 'boot', 'glove', 'belt',
    'cloak', 'robe', 'vest', 'mail', 'plate', 'bracer', 'greave', 'pauldron',
    'mask', 'hood', 'cape', 'backpack', 'bag', 'pouch', 'quiver'
  ],
  'Magic & Mystical': [
    'magic', 'spell', 'rune', 'crystal', 'gem', 'orb', 'aura', 'glow', 'mystic',
    'enchant', 'arcane', 'wand', 'staff', 'scroll', 'tome', 'book', 'potion',
    'elixir', 'flask', 'vial', 'cauldron', 'pentagram', 'sigil', 'ritual',
    'summon', 'conjure', 'curse', 'blessing', 'holy', 'divine', 'demon', 'angel'
  ],
  'Creatures': [
    'dragon', 'wolf', 'bear', 'lion', 'eagle', 'snake', 'spider', 'bat',
    'rat', 'cat', 'dog', 'horse', 'bird', 'fish', 'shark', 'whale', 'octopus',
    'crab', 'scorpion', 'beetle', 'bee', 'butterfly', 'goblin', 'orc', 'troll',
    'ogre', 'giant', 'dwarf', 'elf', 'fairy', 'demon', 'devil', 'angel',
    'ghost', 'skeleton', 'zombie', 'vampire', 'werewolf', 'phoenix', 'griffin',
    'unicorn', 'hydra', 'minotaur', 'centaur', 'harpy', 'golem', 'elemental',
    'slime', 'beast', 'monster', 'creature', 'animal', 'insect', 'reptile',
    'frog', 'turtle', 'lizard', 'dinosaur', 'mammoth', 'boar', 'deer', 'fox',
    'rabbit', 'mouse', 'owl', 'crow', 'raven', 'hawk', 'falcon'
  ],
  'Body & Health': [
    'heart', 'skull', 'bone', 'brain', 'eye', 'hand', 'foot', 'blood', 'wound',
    'heal', 'health', 'life', 'death', 'poison', 'disease', 'cure', 'bandage',
    'muscle', 'fist', 'arm', 'leg', 'head', 'face', 'ear', 'mouth', 'tooth',
    'claw', 'fang', 'horn', 'wing', 'tail', 'paw', 'hoof'
  ],
  'Nature & Elements': [
    'fire', 'flame', 'water', 'ice', 'snow', 'frost', 'earth', 'stone', 'rock',
    'wind', 'air', 'lightning', 'thunder', 'storm', 'rain', 'cloud', 'sun',
    'moon', 'star', 'tree', 'leaf', 'flower', 'mushroom', 'grass', 'forest',
    'mountain', 'river', 'ocean', 'wave', 'volcano', 'earthquake', 'tornado',
    'nature', 'plant', 'seed', 'root', 'vine', 'thorn', 'berry', 'fruit'
  ],
  'Items & Treasure': [
    'coin', 'gold', 'silver', 'gem', 'diamond', 'ruby', 'emerald', 'sapphire',
    'treasure', 'chest', 'key', 'lock', 'ring', 'crown', 'scepter', 'throne',
    'goblet', 'chalice', 'jewel', 'necklace', 'amulet', 'talisman', 'medal',
    'trophy', 'reward', 'loot', 'prize', 'gift', 'box', 'crate', 'barrel'
  ],
  'Buildings & Places': [
    'castle', 'tower', 'dungeon', 'cave', 'temple', 'church', 'shrine', 'altar',
    'gate', 'door', 'bridge', 'wall', 'fortress', 'citadel', 'palace', 'house',
    'tent', 'camp', 'village', 'city', 'ruins', 'tomb', 'crypt', 'grave',
    'prison', 'cage', 'portal', 'stairs', 'ladder', 'well', 'fountain'
  ],
  'Combat & Skills': [
    'attack', 'defend', 'block', 'dodge', 'parry', 'strike', 'slash', 'stab',
    'thrust', 'swing', 'throw', 'shoot', 'aim', 'target', 'hit', 'miss',
    'critical', 'combo', 'skill', 'ability', 'power', 'strength', 'speed',
    'agility', 'stealth', 'sneak', 'hide', 'trap', 'ambush', 'duel', 'battle',
    'war', 'victory', 'defeat', 'retreat', 'charge', 'rally'
  ],
  'Status & Effects': [
    'buff', 'debuff', 'status', 'effect', 'aura', 'shield', 'barrier', 'ward',
    'curse', 'bless', 'enchant', 'boost', 'weaken', 'stun', 'freeze', 'burn',
    'poison', 'blind', 'silence', 'slow', 'haste', 'regenerate', 'drain',
    'absorb', 'reflect', 'immune', 'resist', 'vulnerable', 'protected'
  ],
  'Tools & Crafting': [
    'hammer', 'anvil', 'forge', 'furnace', 'pickaxe', 'shovel', 'saw', 'axe',
    'wrench', 'gear', 'cog', 'wheel', 'chain', 'rope', 'hook', 'needle',
    'thread', 'cloth', 'leather', 'wood', 'metal', 'ore', 'ingot', 'craft',
    'build', 'repair', 'break', 'mine', 'chop', 'fish', 'hunt', 'cook', 'brew'
  ],
  'People & Professions': [
    'warrior', 'knight', 'soldier', 'guard', 'archer', 'mage', 'wizard', 'witch',
    'priest', 'cleric', 'paladin', 'rogue', 'thief', 'assassin', 'ranger',
    'druid', 'bard', 'monk', 'barbarian', 'king', 'queen', 'prince', 'princess',
    'noble', 'peasant', 'merchant', 'smith', 'hunter', 'fisher', 'farmer',
    'healer', 'alchemist', 'scholar', 'sage', 'prophet', 'hero', 'villain'
  ],
  'Symbols & Abstract': [
    'arrow', 'cross', 'circle', 'triangle', 'square', 'spiral', 'star', 'moon',
    'sun', 'eye', 'hand', 'heart', 'skull', 'crown', 'wing', 'flame', 'drop',
    'bolt', 'burst', 'explosion', 'impact', 'wave', 'swirl', 'vortex', 'portal'
  ],
};

function categorizeIcon(iconName) {
  const lowerName = iconName.toLowerCase();
  const categories = [];
  
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const keyword of keywords) {
      if (lowerName.includes(keyword)) {
        categories.push(category);
        break;
      }
    }
  }
  
  return categories.length > 0 ? categories : ['Miscellaneous'];
}

function toDisplayName(filename) {
  // Convert kebab-case to Title Case
  return filename
    .replace(/\.svg$/, '')
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function scanIcons() {
  const icons = [];
  const seenIds = new Set(); // Track seen icon IDs to avoid duplicates
  const authors = fs.readdirSync(ICONS_DIR);
  
  // Sort authors to ensure consistent priority (lorc and delapouite first as main contributors)
  const authorPriority = ['lorc', 'delapouite'];
  authors.sort((a, b) => {
    const aIdx = authorPriority.indexOf(a);
    const bIdx = authorPriority.indexOf(b);
    if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
    if (aIdx !== -1) return -1;
    if (bIdx !== -1) return 1;
    return a.localeCompare(b);
  });
  
  for (const author of authors) {
    const authorPath = path.join(ICONS_DIR, author);
    if (!fs.statSync(authorPath).isDirectory()) continue;
    
    const files = fs.readdirSync(authorPath).filter(f => f.endsWith('.svg'));
    
    for (const file of files) {
      const id = file.replace('.svg', '');
      
      // Skip duplicates - keep the first one (from higher priority author)
      if (seenIds.has(id)) {
        continue;
      }
      seenIds.add(id);
      
      icons.push({
        id,
        name: toDisplayName(file),
        author,
        authorDisplayName: AUTHOR_DISPLAY_NAMES[author] || author,
        path: `/icons/${author}/${file}`,
        categories: categorizeIcon(id),
        isCC0: CC0_AUTHORS.includes(author),
      });
    }
  }
  
  return icons;
}

function generateTypeScript(icons) {
  // Group by category for easy access
  const byCategory = {};
  for (const icon of icons) {
    for (const cat of icon.categories) {
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(icon.id);
    }
  }
  
  // Create a lookup map
  const iconMap = {};
  for (const icon of icons) {
    iconMap[icon.id] = {
      author: icon.author,
      path: icon.path,
    };
  }
  
  // Get unique authors for attribution
  const uniqueAuthors = [...new Set(icons.map(i => i.author))].map(a => ({
    id: a,
    name: AUTHOR_DISPLAY_NAMES[a] || a,
    isCC0: CC0_AUTHORS.includes(a),
  }));

  const output = `// Auto-generated by scripts/generate-icon-index.js
// Do not edit manually - regenerate with: node scripts/generate-icon-index.js

export interface GameIconInfo {
  author: string;
  path: string;
}

export interface GameIconAuthor {
  id: string;
  name: string;
  isCC0: boolean;
}

// Total icons: ${icons.length}
export const GAME_ICON_COUNT = ${icons.length};

// All icon authors for attribution
export const GAME_ICON_AUTHORS: GameIconAuthor[] = ${JSON.stringify(uniqueAuthors, null, 2)};

// Icon lookup map: id -> { author, path }
export const GAME_ICONS: Record<string, GameIconInfo> = ${JSON.stringify(iconMap, null, 2)};

// Icons organized by category
export const GAME_ICON_CATEGORIES: Record<string, string[]> = ${JSON.stringify(byCategory, null, 2)};

// All icon IDs for search
export const ALL_GAME_ICON_IDS: string[] = ${JSON.stringify(icons.map(i => i.id), null, 2)};

// Get icon info by ID
export function getGameIcon(id: string): GameIconInfo | undefined {
  return GAME_ICONS[id];
}

// Get icon path by ID (returns undefined if not found)
export function getGameIconPath(id: string): string | undefined {
  return GAME_ICONS[id]?.path;
}

// Check if an icon ID exists
export function isGameIcon(id: string): boolean {
  return id in GAME_ICONS;
}

// Get author display name for attribution
export function getIconAuthorName(authorId: string): string {
  const author = GAME_ICON_AUTHORS.find(a => a.id === authorId);
  return author?.name || authorId;
}

// Search icons by name (case-insensitive partial match)
export function searchGameIcons(query: string, limit = 100): string[] {
  if (!query) return ALL_GAME_ICON_IDS.slice(0, limit);
  const lowerQuery = query.toLowerCase();
  return ALL_GAME_ICON_IDS
    .filter(id => id.toLowerCase().includes(lowerQuery))
    .slice(0, limit);
}

// Get icons by category
export function getIconsByCategory(category: string): string[] {
  return GAME_ICON_CATEGORIES[category] || [];
}

// Get all category names
export function getAllCategories(): string[] {
  return Object.keys(GAME_ICON_CATEGORIES);
}
`;

  return output;
}

// Run the script
console.log('Scanning icons...');
const icons = scanIcons();
console.log(`Found ${icons.length} icons from ${new Set(icons.map(i => i.author)).size} authors`);

console.log('Generating TypeScript...');
const typescript = generateTypeScript(icons);

console.log(`Writing to ${OUTPUT_FILE}...`);
fs.writeFileSync(OUTPUT_FILE, typescript);

console.log('Done!');

// Print category stats
const categories = {};
for (const icon of icons) {
  for (const cat of icon.categories) {
    categories[cat] = (categories[cat] || 0) + 1;
  }
}
console.log('\nIcons per category:');
for (const [cat, count] of Object.entries(categories).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${cat}: ${count}`);
}
