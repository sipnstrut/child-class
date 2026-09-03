// Shared helpers used across the runtime modules. Extracted from what was
// getting duplicated (KNACK_ID_RE, resolveTargetActor, escape, ABILITIES)
// so bug fixes and behavior changes live in one place.

import { MODULE_ID } from "./config.mjs";

/** Matches Knack item _ids of the form `k14fighter000000`, `k24bard000000000`, etc. */
export const KNACK_ID_RE = /^k(14|24)([a-z]+)0*$/;

/** Ability score abbreviations (dnd5e's short keys). */
export const ABILITIES = Object.freeze(["str", "dex", "con", "int", "wis", "cha"]);

/** Display labels keyed by ability abbreviation, used in dialogs / chat cards. */
export const ABILITY_LABELS = Object.freeze({
  str: "Strength", dex: "Dexterity", con: "Constitution",
  int: "Intelligence", wis: "Wisdom", cha: "Charisma"
});

/**
 * HTML-escape a value for safe interpolation into dialog / chat content.
 * Prefers Foundry's built-in `escapeHTML` when available (Foundry 12+),
 * falls back to a local implementation otherwise.
 * @param {*} s
 * @returns {string}
 */
export function escape(s) {
  if (foundry?.utils?.escapeHTML) return foundry.utils.escapeHTML(String(s ?? ""));
  return String(s ?? "").replace(/[&<>"']/g, ch => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]
  ));
}

/**
 * Resolve the target actor for an API call with no explicit actor argument:
 * first the currently controlled token's actor, then the current user's
 * assigned character. Returns null if neither is available.
 * @returns {Actor|null}
 */
export function resolveTargetActor() {
  const controlled = canvas?.tokens?.controlled?.[0];
  if (controlled?.actor) return controlled.actor;
  return game.user.character ?? null;
}

/**
 * Diagnostic log gated behind the `verboseLogging` world setting. Setup /
 * error messages should still use `console.log` / `console.error` directly;
 * this helper is for the per-render / per-frame chatter that GMs sometimes
 * want turned on when debugging but should not fire during normal play.
 * @param {...any} args — forwarded to console.log with a `[child-class]` prefix.
 */
export function verboseLog(...args) {
  try {
    if (!game.settings.get(MODULE_ID, "verboseLogging")) return;
  } catch {
    // Setting may not be registered yet during early init — swallow.
    return;
  }
  console.log("[child-class]", ...args);
}
