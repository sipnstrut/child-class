import { MODULE_ID } from "./config.mjs";

// § 5.3 — orthogonal to edition. Both editions may use either rule; the choice
// is a world setting (§ 9), GM-overridable per actor via
// flags.child-class.abilityRule. Cap at 20 is enforced on write (§ 5.3).

export const ABILITY_RULES = {
  unexceptional: {
    id: "unexceptional",
    featureName: "CHILDCLASS.Feature.Unexceptional",
    base: "6 + 1d6",              // per ability, rolled independently → 7-12
    growth: "1d6",                // level-4 Growth die for the four unpicked abilities → +1-6
    growthChoice: "2d6kh1"        // level-4 Growth die for the two abilities the player picks (§ 5.7)
  },

  // Stub — see § 13 step 11. Design specifies:
  //   base: "7 + 1d4", growth: "1d4", growthChoice: "2d4kh1"
  // Wire up after '14 + unexceptional pass the test matrix, to verify that
  // adding an ability rule really is a one-entry change.
  unremarkable: {
    id: "unremarkable"
  }
};

export function getAbilityRule(actor) {
  const flag = actor?.getFlag?.(MODULE_ID, "abilityRule");
  const key = flag ?? game.settings.get(MODULE_ID, "abilityRule");
  return ABILITY_RULES[key];
}
