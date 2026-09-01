import { MODULE_ID } from "./config.mjs";

export function registerSettings() {
  game.settings.register(MODULE_ID, "abilityRule", {
    name: "CHILDCLASS.Settings.AbilityRule.Name",
    hint: "CHILDCLASS.Settings.AbilityRule.Hint",
    scope: "world",
    config: true,
    restricted: true,
    type: String,
    choices: {
      unexceptional: "CHILDCLASS.Settings.AbilityRule.Unexceptional",
      unremarkable: "CHILDCLASS.Settings.AbilityRule.Unremarkable"
    },
    default: "unexceptional"
  });

  // Cache written by the § 7.2 Knack-feat setup workflow, keyed by variant.
  // Hidden from the settings UI (config: false).
  game.settings.register(MODULE_ID, "knackFeatMap", {
    scope: "world",
    config: false,
    type: Object,
    default: {}
  });

  game.settings.register(MODULE_ID, "xpScale", {
    name: "CHILDCLASS.Settings.XpScale.Name",
    hint: "CHILDCLASS.Settings.XpScale.Hint",
    scope: "world",
    config: true,
    restricted: true,
    type: String,
    choices: {
      "raw-aligned": "CHILDCLASS.Settings.XpScale.RawAligned",
      compressed: "CHILDCLASS.Settings.XpScale.Compressed"
    },
    default: "raw-aligned"
  });

  game.settings.register(MODULE_ID, "xpOnGraduation", {
    name: "CHILDCLASS.Settings.XpOnGraduation.Name",
    hint: "CHILDCLASS.Settings.XpOnGraduation.Hint",
    scope: "world",
    config: true,
    restricted: true,
    type: String,
    choices: {
      reset: "CHILDCLASS.Settings.XpOnGraduation.Reset",
      carry: "CHILDCLASS.Settings.XpOnGraduation.Carry",
      milestone: "CHILDCLASS.Settings.XpOnGraduation.Milestone"
    },
    default: "reset"
  });

  game.settings.register(MODULE_ID, "healOnGraduation", {
    name: "CHILDCLASS.Settings.HealOnGraduation.Name",
    hint: "CHILDCLASS.Settings.HealOnGraduation.Hint",
    scope: "world",
    config: true,
    restricted: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, "enforceMulticlassBlock", {
    name: "CHILDCLASS.Settings.EnforceMulticlassBlock.Name",
    hint: "CHILDCLASS.Settings.EnforceMulticlassBlock.Hint",
    scope: "world",
    config: true,
    restricted: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, "snapshotRetentionDays", {
    name: "CHILDCLASS.Settings.SnapshotRetentionDays.Name",
    hint: "CHILDCLASS.Settings.SnapshotRetentionDays.Hint",
    scope: "world",
    config: true,
    restricted: true,
    type: Number,
    default: 0,
    range: { min: 0, max: 365, step: 1 }
  });

  game.settings.register(MODULE_ID, "allowMixedEditions", {
    name: "CHILDCLASS.Settings.AllowMixedEditions.Name",
    hint: "CHILDCLASS.Settings.AllowMixedEditions.Hint",
    scope: "world",
    config: true,
    restricted: true,
    type: Boolean,
    default: true
  });
}
