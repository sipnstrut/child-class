// Shared per-class data used by both editions (§ 5.4). Hit dice, skill/save
// lists, and weapon proficiencies are identical between '14 and '24 for the
// classes shared across editions; storing them once here keeps knackTable
// entries in each variant scoped to what actually differs (feat picks).
//
// Trait keys follow dnd5e's format:
//   - skills: `skills:<abbr>`  — 3-letter dnd5e skill keys
//   - saves:  `saves:<abbr>`   — 3-letter ability keys
//   - weapons:`weapon:<id>`    — specific weapon ids from CONFIG.DND5E.weaponIds
//   - shield: expressed as `armor:shl` in the Trait pool (added when true).
//
// § 5.8 (b): Trade Skill grants ONE specific weapon proficiency from the
// Knack class's list — not a whole category. So `weapons` per class here is
// an explicit list of individual weapon ids the class actually grants,
// enumerated from the 2014 PHB proficiency tables. Player picks one.

// Standard 2014 PHB weapon categories, referenced below.
const SIMPLE = [
  "club", "dagger", "dart", "greatclub", "handaxe", "javelin", "lighthammer",
  "mace", "quarterstaff", "sickle", "spear", "lightcrossbow", "sling"
];
const MARTIAL = [
  "battleaxe", "flail", "glaive", "greataxe", "greatsword", "halberd", "lance",
  "longsword", "maul", "morningstar", "pike", "rapier", "scimitar", "shortsword",
  "trident", "warpick", "warhammer", "whip", "blowgun", "handcrossbow",
  "heavycrossbow", "longbow", "shortbow"
];

// Dedupe helper — some classes have simple + a subset of martial where the
// martial names happen to overlap; keeps the pool stable and iterable.
const uniq = (arr) => [...new Set(arr)];

export const KNACK_CLASSES = {
  barbarian: {
    label: "Barbarian",
    hitDie: "d12",
    skills: ["ani", "ath", "itm", "nat", "prc", "sur"],
    saves: ["str", "con"],
    weapons: uniq([...SIMPLE, ...MARTIAL]),
    shield: true
  },
  bard: {
    label: "Bard",
    hitDie: "d8",
    skills: [
      "acr", "ani", "arc", "ath", "dec", "his", "ins", "itm", "inv",
      "med", "nat", "prc", "prf", "per", "rel", "slt", "ste", "sur"
    ],
    saves: ["dex", "cha"],
    // Simple + hand crossbows, longswords, rapiers, shortswords.
    weapons: uniq([...SIMPLE, "handcrossbow", "longsword", "rapier", "shortsword"]),
    shield: false
  },
  cleric: {
    label: "Cleric",
    hitDie: "d8",
    skills: ["his", "ins", "med", "per", "rel"],
    saves: ["wis", "cha"],
    weapons: SIMPLE.slice(),
    shield: true
  },
  druid: {
    label: "Druid",
    hitDie: "d8",
    skills: ["arc", "ani", "ins", "med", "nat", "prc", "rel", "sur"],
    saves: ["int", "wis"],
    // Specific 2014 druid list.
    weapons: [
      "club", "dagger", "dart", "javelin", "mace", "quarterstaff",
      "scimitar", "sickle", "sling", "spear"
    ],
    shield: true
  },
  fighter: {
    label: "Fighter",
    hitDie: "d10",
    skills: ["acr", "ani", "ath", "his", "ins", "itm", "prc", "sur"],
    saves: ["str", "con"],
    weapons: uniq([...SIMPLE, ...MARTIAL]),
    shield: true
  },
  monk: {
    label: "Monk",
    hitDie: "d8",
    skills: ["acr", "ath", "his", "ins", "rel", "ste"],
    saves: ["str", "dex"],
    // Simple + shortswords.
    weapons: uniq([...SIMPLE, "shortsword"]),
    shield: false
  },
  paladin: {
    label: "Paladin",
    hitDie: "d10",
    skills: ["ath", "ins", "itm", "med", "per", "rel"],
    saves: ["wis", "cha"],
    weapons: uniq([...SIMPLE, ...MARTIAL]),
    shield: true
  },
  ranger: {
    label: "Ranger",
    hitDie: "d10",
    skills: ["ani", "ath", "ins", "inv", "nat", "prc", "ste", "sur"],
    saves: ["str", "dex"],
    weapons: uniq([...SIMPLE, ...MARTIAL]),
    shield: true
  },
  rogue: {
    label: "Rogue",
    hitDie: "d8",
    skills: ["acr", "ath", "dec", "ins", "itm", "inv", "prc", "prf", "per", "slt", "ste"],
    saves: ["dex", "int"],
    // Simple + hand crossbows, longswords, rapiers, shortswords.
    weapons: uniq([...SIMPLE, "handcrossbow", "longsword", "rapier", "shortsword"]),
    shield: false
  },
  sorcerer: {
    label: "Sorcerer",
    hitDie: "d6",
    skills: ["arc", "dec", "ins", "itm", "per", "rel"],
    saves: ["con", "cha"],
    weapons: ["dagger", "dart", "sling", "quarterstaff", "lightcrossbow"],
    shield: false
  },
  warlock: {
    label: "Warlock",
    hitDie: "d8",
    skills: ["arc", "dec", "his", "itm", "inv", "nat", "rel"],
    saves: ["wis", "cha"],
    weapons: SIMPLE.slice(),
    shield: false
  },
  wizard: {
    label: "Wizard",
    hitDie: "d6",
    skills: ["arc", "his", "ins", "inv", "med", "rel"],
    saves: ["int", "wis"],
    weapons: ["dagger", "dart", "sling", "quarterstaff", "lightcrossbow"],
    shield: false
  },
  artificer: {
    label: "Artificer",
    hitDie: "d8",
    skills: ["arc", "his", "inv", "med", "nat", "prc", "slt"],
    saves: ["con", "int"],
    weapons: SIMPLE.slice(),
    shield: true
  }
};
