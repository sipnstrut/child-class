import { MODULE_ID } from "./config.mjs";

// § 5.3 — orthogonal to edition. Both editions may use either rule; the choice
// is a world setting (§ 9), GM-overridable per actor via
// flags.child-class.abilityRule. Cap at 20 is enforced on write (§ 5.3).
//
// § 5.7 Growth: at level 4, every ability rolls `growth`, EXCEPT two abilities
// the player picks at that moment which roll `growthChoice` (a kh1-style
// take-higher formula). This is not opt-in — the pick step is part of the
// Growth flow itself, not a separate feature toggle. Design correction
// applied 2026-09-01.

export const ABILITY_RULES = {
  unexceptional: {
    id: "unexceptional",
    label: "Unexceptional",
    featureName: "CHILDCLASS.Feature.Unexceptional",
    base: "6 + 1d6",              // per ability, rolled independently → 7-12
    growth: "1d6",                // level-4 Growth die for the four unpicked abilities → +1-6
    growthChoice: "2d6kh1"        // level-4 Growth die for the two abilities the player picks
  },

  unremarkable: {
    id: "unremarkable",
    label: "Unremarkable",
    featureName: "CHILDCLASS.Feature.Unremarkable",
    base: "7 + 1d4",              // per ability → 8-11
    growth: "1d4",                // level-4 Growth die for unpicked abilities → +1-4
    growthChoice: "2d4kh1"        // level-4 Growth die for aptitude picks
  }
};

export function getAbilityRule(actor) {
  const flag = actor?.getFlag?.(MODULE_ID, "abilityRule");
  const key = flag ?? game.settings.get(MODULE_ID, "abilityRule");
  return ABILITY_RULES[key];
}
