// Hit dice are identical across editions (§ 5.4), so live here once.
// Trade Skill's gold roll (§ 5.8) is the only consumer.

export const KNACK_CLASSES = {
  barbarian: { label: "Barbarian", hitDie: "d12" },
  bard:      { label: "Bard",      hitDie: "d8"  },
  cleric:    { label: "Cleric",    hitDie: "d8"  },
  druid:     { label: "Druid",     hitDie: "d8"  },
  fighter:   { label: "Fighter",   hitDie: "d10" },
  monk:      { label: "Monk",      hitDie: "d8"  },
  paladin:   { label: "Paladin",   hitDie: "d10" },
  ranger:    { label: "Ranger",    hitDie: "d10" },
  rogue:     { label: "Rogue",     hitDie: "d8"  },
  sorcerer:  { label: "Sorcerer",  hitDie: "d6"  },
  warlock:   { label: "Warlock",   hitDie: "d8"  },
  wizard:    { label: "Wizard",    hitDie: "d6"  },
  artificer: { label: "Artificer", hitDie: "d8"  }
};
