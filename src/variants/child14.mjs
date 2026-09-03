// Child '14 — the base edition. Fully specified per § 2.5.2 / § 5.4.

export default {
  id: "child14",
  label: "CHILDCLASS.Variant.Child14",
  displayName: "Child '14",
  rules: "2014",

  profByLevel: [1, 1, 2, 2, 2],     // index = childLevel - 1
  hpFirst: 6,                        // § 5.1
  hpPerLevel: 1,                     // § 5.1
  xpTable: [0, 30, 75, 135, 210, 300],  // § 5.10 raw-aligned

  graduationClassFilter: "2014",

  // § 5.4 '14 Knack table. Each entry is a two-element array of feat picks.
  // `preSelect` carries source-fixed sub-options that the Knack item pre-applies
  // rather than re-prompting. `source: "tasha"` marks TCE entries; the resolver
  // (§ 7.3) prefers a Tasha's source pack when present.
  knackTable: {
    barbarian: [
      { name: "Charger" },
      { name: "Grappler" }
    ],
    bard: [
      { name: "Defensive Duelist" },
      { name: "Actor" }
    ],
    cleric: [
      { name: "Healer" },
      { name: "Chef" }
    ],
    druid: [
      {
        name: "Magic Initiate: Druid",
        matchName: "Magic Initiate",
        preSelect: { cantrips: ["druidcraft", "guidance"], spells: ["animal friendship"] }
      },
      { name: "Poisoner" }
    ],
    fighter: [
      { name: "Tough" },
      { name: "Fighting Initiate" }
    ],
    monk: [
      { name: "Tavern Brawler" },
      {
        name: "Martial Adept",
        preSelect: { maneuvers: ["Disarming Attack", "Evasive Footwork"] }
      }
    ],
    paladin: [
      { name: "Inspiring Leader" },
      { name: "Mounted Combatant" }
    ],
    ranger: [
      { name: "Dungeon Delver" },
      { name: "Keen Mind" }
    ],
    rogue: [
      { name: "Skulker" },
      { name: "Skill Expert", source: "tasha" }
    ],
    sorcerer: [
      {
        name: "Magic Initiate: Sorcerer",
        matchName: "Magic Initiate",
        preSelect: { cantrips: ["minor illusion", "prestidigitation"], spells: ["sleep"] }
      },
      {
        name: "Metamagic Adept",
        source: "tasha",
        preSelect: { metamagic: ["Subtle Spell"] }
      }
    ],
    warlock: [
      {
        name: "Magic Initiate: Warlock",
        matchName: "Magic Initiate",
        preSelect: { cantrips: ["mage hand", "true strike"], spells: ["mage armor"] }
      },
      { name: "Linguist" }
    ],
    wizard: [
      {
        name: "Ritual Caster: Wizard",
        matchName: "Ritual Caster",
        preSelect: { spells: ["detect magic", "find familiar"] }
      },
      { name: "Elemental Adept" }
    ],
    artificer: [
      {
        name: "Magic Initiate: Artificer",
        matchName: "Magic Initiate",
        source: "tasha",
        preSelect: { cantrips: ["mending"], spells: ["alarm"], toolChoice: true }
      },
      { name: "Gunner", source: "tasha" }
    ]
  }
};
