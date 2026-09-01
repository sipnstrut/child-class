import { registerSettings } from "./settings.mjs";
import { registerHpAndProf } from "./hp.mjs";
import { registerGuards } from "./guards.mjs";
import { registerKnackPool } from "./knack-pool.mjs";
import { registerKnackSetup } from "./knack-setup.mjs";
import { registerAbilityGen } from "./ability-gen.mjs";
import { registerGrowth } from "./growth.mjs";
import { registerXp } from "./xp.mjs";
import { registerTradeSkill } from "./trade-skill.mjs";
import { registerYouth } from "./youth.mjs";
import { registerReset } from "./reset.mjs";

Hooks.once("init", () => {
  registerSettings();
  registerGuards();
  registerKnackPool();
});

Hooks.once("setup", () => {
  // libWrapper is a required dependency (§ 3, § 5.10). Register the HP/prof
  // wrap in `setup` so `CONFIG.Actor.documentClass` has resolved to Actor5e.
  registerHpAndProf();
  registerXp();
});

Hooks.once("ready", () => {
  // Setup workflow needs game.settings + game.modules ready — safe from
  // `ready`. Compendium scanning happens on-demand when the GM opens the
  // dialog, not at load.
  registerKnackSetup();
  registerAbilityGen();
  registerGrowth();
  registerTradeSkill();
  registerYouth();
  registerReset();
});
