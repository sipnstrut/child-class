import { MODULE_ID } from "./config.mjs";

// World settings for the module. Each descriptor is a `[key, overrides]`
// tuple; the loop in registerSettings spreads COMMON_DEFAULTS first and
// lets each override where needed (knackFeatMap opts out of the settings
// UI, snapshotRetentionDays adds a numeric range).
const COMMON_DEFAULTS = Object.freeze({
  scope: "world",
  config: true,
  restricted: true
});

const SETTING_DESCRIPTORS = [
  ["abilityRule", {
    name: "CHILDCLASS.Settings.AbilityRule.Name",
    hint: "CHILDCLASS.Settings.AbilityRule.Hint",
    type: String,
    choices: {
      unexceptional: "CHILDCLASS.Settings.AbilityRule.Unexceptional",
      unremarkable: "CHILDCLASS.Settings.AbilityRule.Unremarkable"
    },
    default: "unexceptional"
  }],

  // Cache written by the § 7.2 Knack-feat setup workflow, keyed by variant.
  // Hidden from the settings UI (config: false).
  ["knackFeatMap", {
    config: false,
    type: Object,
    default: {}
  }],

  ["xpScale", {
    name: "CHILDCLASS.Settings.XpScale.Name",
    hint: "CHILDCLASS.Settings.XpScale.Hint",
    type: String,
    choices: {
      "raw-aligned": "CHILDCLASS.Settings.XpScale.RawAligned",
      compressed: "CHILDCLASS.Settings.XpScale.Compressed"
    },
    default: "raw-aligned"
  }],

  ["xpOnGraduation", {
    name: "CHILDCLASS.Settings.XpOnGraduation.Name",
    hint: "CHILDCLASS.Settings.XpOnGraduation.Hint",
    type: String,
    choices: {
      reset: "CHILDCLASS.Settings.XpOnGraduation.Reset",
      carry: "CHILDCLASS.Settings.XpOnGraduation.Carry",
      milestone: "CHILDCLASS.Settings.XpOnGraduation.Milestone"
    },
    default: "reset"
  }],

  ["healOnGraduation", {
    name: "CHILDCLASS.Settings.HealOnGraduation.Name",
    hint: "CHILDCLASS.Settings.HealOnGraduation.Hint",
    type: Boolean,
    default: true
  }],

  ["enforceMulticlassBlock", {
    name: "CHILDCLASS.Settings.EnforceMulticlassBlock.Name",
    hint: "CHILDCLASS.Settings.EnforceMulticlassBlock.Hint",
    type: Boolean,
    default: true
  }],

  ["snapshotRetentionDays", {
    name: "CHILDCLASS.Settings.SnapshotRetentionDays.Name",
    hint: "CHILDCLASS.Settings.SnapshotRetentionDays.Hint",
    type: Number,
    default: 0,
    range: { min: 0, max: 365, step: 1 }
  }],

  ["allowMixedEditions", {
    name: "CHILDCLASS.Settings.AllowMixedEditions.Name",
    hint: "CHILDCLASS.Settings.AllowMixedEditions.Hint",
    type: Boolean,
    default: true
  }],

  ["autoFireDialogs", {
    name: "CHILDCLASS.Settings.AutoFireDialogs.Name",
    hint: "CHILDCLASS.Settings.AutoFireDialogs.Hint",
    type: Boolean,
    default: true
  }],

  ["verboseLogging", {
    name: "CHILDCLASS.Settings.VerboseLogging.Name",
    hint: "CHILDCLASS.Settings.VerboseLogging.Hint",
    type: Boolean,
    default: false
  }]
];

export function registerSettings() {
  for (const [key, overrides] of SETTING_DESCRIPTORS) {
    game.settings.register(MODULE_ID, key, { ...COMMON_DEFAULTS, ...overrides });
  }
}
