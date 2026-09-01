import { registerSettings } from "./settings.mjs";
import { registerHpAndProf } from "./hp.mjs";

Hooks.once("init", () => {
  registerSettings();
});

Hooks.once("setup", () => {
  // libWrapper is a required dependency (§ 3, § 5.10). Register the HP/prof
  // wrap in `setup` so `CONFIG.Actor.documentClass` has resolved to Actor5e.
  registerHpAndProf();
});
