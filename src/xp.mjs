// § 5.10 experience track. Per api-notes Q9, `Actor5e#getLevelExp` is the
// single point where `xp.max` / `xp.min` / `xp.pct` all derive their
// thresholds, so a MIXED-mode libWrapper wrap here is enough to make a Child's
// sheet display the Child XP curve while every non-Child character continues
// to use `CONFIG.DND5E.CHARACTER_EXP_LEVELS` unmodified.
//
// The variant's `xpTable` is the source of truth; a world `xpScale` setting
// can override to the compressed table for tables that want rounder numbers.
// Out-of-range levels clamp to the last entry (matches the vanilla behaviour
// of `Math.min(level, levels.length - 1)`).

import { MODULE_ID } from "./config.mjs";
import { getChildVariant } from "./variants/index.mjs";

const COMPRESSED = [0, 10, 25, 45, 70, 100];

export function registerXp() {
  const target = "CONFIG.Actor.documentClass.prototype.getLevelExp";
  libWrapper.register(MODULE_ID, target, function(wrapped, level) {
    const variant = getChildVariant(this);
    if (!variant) return wrapped.call(this, level);
    const table = xpTableFor(variant);
    const clamped = Math.max(0, Math.min(level ?? 0, table.length - 1));
    return table[clamped];
  }, "MIXED");
}

function xpTableFor(variant) {
  const scale = game.settings.get(MODULE_ID, "xpScale");
  if (scale === "compressed") return COMPRESSED;
  return variant.xpTable ?? [0, 30, 75, 135, 210, 300];
}
