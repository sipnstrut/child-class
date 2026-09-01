// Shared per-class data used by both editions (§ 5.4). Hit dice, skill/save
// lists, and weapon proficiencies are identical between '14 and '24 for the
// classes shared across editions; storing them once here keeps knackTable
// entries in each variant scoped to what actually differs (feat picks).
//
// Trait keys follow dnd5e's format (see dnd5e.mjs FORMULA_FIELDS / traits):
//   - skills: `skills:<abbr>`  — 3-letter dnd5e skill keys
//   - saves:  `saves:<abbr>`   — 3-letter ability keys
//   - weapons:`weapon:<key>`   — either "sim"/"mar" (whole categories) or a
//     specific weapon id. For MVP the Knack level-5 weapon choice pool uses
//     categories: picking "simple weapons" grants the whole category. This
//     is more generous than the source rule ("one weapon proficiency from
//     that class") — refine to a specific weapon list in a follow-up pass.
//   - shield: expressed as `armor:shl` in the Trait pool (added when true).

export const KNACK_CLASSES = {
  barbarian: {
    label: "Barbarian",
    hitDie: "d12",
    skills: ["ani", "ath", "itm", "nat", "prc", "sur"],
    saves: ["str", "con"],
    weapons: ["sim", "mar"],
    shield: true
  },
  bard: {
    label: "Bard",
    hitDie: "d8",
    // "any three" — pool is all 18 skills
    skills: [
      "acr", "ani", "arc", "ath", "dec", "his", "ins", "itm", "inv",
      "med", "nat", "prc", "prf", "per", "rel", "slt", "ste", "sur"
    ],
    saves: ["dex", "cha"],
    weapons: ["sim"],
    shield: false
  },
  cleric: {
    label: "Cleric",
    hitDie: "d8",
    skills: ["his", "ins", "med", "per", "rel"],
    saves: ["wis", "cha"],
    weapons: ["sim"],
    shield: true
  },
  druid: {
    label: "Druid",
    hitDie: "d8",
    skills: ["arc", "ani", "ins", "med", "nat", "prc", "rel", "sur"],
    saves: ["int", "wis"],
    weapons: ["sim"],
    shield: true
  },
  fighter: {
    label: "Fighter",
    hitDie: "d10",
    skills: ["acr", "ani", "ath", "his", "ins", "itm", "prc", "sur"],
    saves: ["str", "con"],
    weapons: ["sim", "mar"],
    shield: true
  },
  monk: {
    label: "Monk",
    hitDie: "d8",
    skills: ["acr", "ath", "his", "ins", "rel", "ste"],
    saves: ["str", "dex"],
    weapons: ["sim"],
    shield: false
  },
  paladin: {
    label: "Paladin",
    hitDie: "d10",
    skills: ["ath", "ins", "itm", "med", "per", "rel"],
    saves: ["wis", "cha"],
    weapons: ["sim", "mar"],
    shield: true
  },
  ranger: {
    label: "Ranger",
    hitDie: "d10",
    skills: ["ani", "ath", "ins", "inv", "nat", "prc", "ste", "sur"],
    saves: ["str", "dex"],
    weapons: ["sim", "mar"],
    shield: true
  },
  rogue: {
    label: "Rogue",
    hitDie: "d8",
    skills: ["acr", "ath", "dec", "ins", "itm", "inv", "prc", "prf", "per", "slt", "ste"],
    saves: ["dex", "int"],
    weapons: ["sim"],
    shield: false
  },
  sorcerer: {
    label: "Sorcerer",
    hitDie: "d6",
    skills: ["arc", "dec", "ins", "itm", "per", "rel"],
    saves: ["con", "cha"],
    weapons: ["sim"],
    shield: false
  },
  warlock: {
    label: "Warlock",
    hitDie: "d8",
    skills: ["arc", "dec", "his", "itm", "inv", "nat", "rel"],
    saves: ["wis", "cha"],
    weapons: ["sim"],
    shield: false
  },
  wizard: {
    label: "Wizard",
    hitDie: "d6",
    skills: ["arc", "his", "ins", "inv", "med", "rel"],
    saves: ["int", "wis"],
    weapons: ["sim"],
    shield: false
  },
  artificer: {
    label: "Artificer",
    hitDie: "d8",
    skills: ["arc", "his", "inv", "med", "nat", "prc", "slt"],
    saves: ["con", "int"],
    weapons: ["sim"],
    shield: true
  }
};
