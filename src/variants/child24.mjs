// Child '24 — 2024 edition. Inherits everything but the three edition-specific
// fields (`rules`, `knackTable`, `graduationClassFilter`) and the display name.
// Feat picks per design § 5.4 '24 table.

export default {
  id: "child24",
  label: "CHILDCLASS.Variant.Child24",
  displayName: "Child '24",
  extends: "child14",
  rules: "2024",
  graduationClassFilter: "2024",

  // § 5.4 '24 Knack table. `preSelect` carries source-fixed sub-options that
  // the Knack item pre-applies rather than re-prompting. `source: "tasha"`
  // marks TCE entries; the feat resolver (§ 7.3) prefers Tasha's when named.
  knackTable: {
    barbarian: [
      { name: "Savage Attacker" },
      { name: "Tough" }
    ],
    bard: [
      { name: "Musician" },
      { name: "Defensive Duelist" }
    ],
    cleric: [
      { name: "Healer" },
      { name: "Chef" }
    ],
    druid: [
      {
        name: "Magic Initiate: Druid",
        preSelect: { cantrips: ["druidcraft", "guidance"], spells: ["animal friendship"] }
      },
      { name: "Poisoner" }
    ],
    fighter: [
      { name: "Durable" },
      { name: "Piercer" }
    ],
    monk: [
      { name: "Athlete" },
      { name: "Blind Fighting" }
    ],
    paladin: [
      { name: "Inspiring Leader" },
      { name: "Mounted Combatant" }
    ],
    ranger: [
      { name: "Skilled" },
      { name: "Observant" }
    ],
    rogue: [
      { name: "Skulker" },
      { name: "Skill Expert", source: "tasha" }
    ],
    sorcerer: [
      { name: "Elemental Adept" },
      {
        name: "Metamagic Adept",
        source: "tasha",
        preSelect: { metamagic: ["Subtle Spell"] }
      }
    ],
    warlock: [
      { name: "Actor" },
      { name: "Telepathic", source: "tasha" }
    ],
    wizard: [
      { name: "Ritual Caster" },
      { name: "Keen Mind" }
    ],
    artificer: [
      { name: "Crafter" },
      { name: "Gunner", source: "tasha" }
    ]
  }
};
