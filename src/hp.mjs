// § 5.1 / § 5.2 runtime overrides. dnd5e's ActiveEffect handler only evaluates
// formula strings for keys in `ActiveEffect5e.FORMULA_FIELDS`; `hp.max` and
// `prof` are not in that set, so the earlier AE-based approach cast our formula
// string to NumberField and produced NaN → 0.
//
// Runtime pivot: wrap `Actor#prepareData` and write both fields after the
// entire prepare cycle. Wrapping `prepareDerivedData` alone is not sufficient
// because in dnd5e 5.3.x the actor's system DataModel (`CharacterData`) runs
// its own `prepareDerivedData` — including `prepareHitPoints` — separately from
// `Actor5e#prepareDerivedData` (which only tracks summons). Writing before the
// wrapped Actor5e method still lets `CharacterData.prepareDerivedData` clobber
// `hp.max` afterwards. Writing after `prepareData` finishes has the last word
// and we recompute the derived hp fields the sheet reads.

import { MODULE_ID } from "./config.mjs";
import { getChildVariant } from "./variants/index.mjs";

export function registerHpAndProf() {
  const target = "CONFIG.Actor.documentClass.prototype.prepareData";
  libWrapper.register(MODULE_ID, target, function(wrapped, ...args) {
    const result = wrapped.apply(this, args);
    applyChildOverrides(this);
    return result;
  }, "WRAPPER");
}

function applyChildOverrides(actor) {
  if (actor?.type !== "character") return;
  const variant = getChildVariant(actor);
  if (!variant) return;
  const cls = actor.items.find(
    i => i.type === "class" && i.system?.identifier === variant.id
  );
  const level = cls?.system?.levels ?? 0;
  if (level < 1) return;

  const conMod = actor.system?.abilities?.con?.mod ?? 0;
  const hp = actor.system.attributes.hp;
  const rawHp = variant.hpFirst + (level - 1) * variant.hpPerLevel + level * conMod
    + maxHpBonus(actor, hp, level);
  const hpMax = Math.max(1, rawHp);

  const prof = variant.profByLevel[level - 1] ?? variant.profByLevel.at(-1);

  hp.max = hpMax;
  // Recompute the derived hp fields prepareHitPoints computed against the old
  // hp.max — the sheet renders these, not hp.max directly for damage/pct.
  hp.effectiveMax = Math.max(hp.max + (hp.tempmax ?? 0), 0);
  // hp.value was already clamped to the (wrong) old effectiveMax during
  // prepareHitPoints, so read the un-derived source value. If the actor has
  // never had hp.value set (fresh drop of Child class), default to full HP
  // so the character isn't stuck at 0.
  const sourceHp = foundry.utils.getProperty(actor._source ?? {}, "system.attributes.hp.value");
  const rawValue = sourceHp ?? hpMax;
  hp.value = Math.max(0, Math.min(rawValue, hp.effectiveMax));
  hp.damage = hp.effectiveMax - hp.value;
  hp.pct = hp.effectiveMax > 0
    ? Math.max(0, Math.min(100, (hp.value / hp.effectiveMax) * 100))
    : 0;

  actor.system.attributes.prof = prof;
}

/**
 * Max-HP bonuses that dnd5e folded into `hp.max` before we overwrite it.
 *
 * `CharacterData.prepareDerivedData` computes
 *   `simplifyBonus(hp.bonuses.level) * details.level + simplifyBonus(hp.bonuses.overall)`
 * and adds it to `hp.max`. Because `applyChildOverrides` replaces `hp.max`
 * outright rather than adjusting it, that term was being discarded — so any
 * effect targeting `system.attributes.hp.bonuses.*` silently did nothing on a
 * Child. Tough (an AE of `+2` on `hp.bonuses.level`) is the one that surfaced
 * it; Dwarven Toughness, Aid, and a hand-entered bonus all went the same way.
 *
 * The per-level bonus multiplies by *character* level, not Child level, which
 * matches dnd5e and stays correct if `enforceMulticlassBlock` is off.
 *
 * @param {Actor5e} actor
 * @param {object} hp — `actor.system.attributes.hp`, post-prepare
 * @param {number} level — Child class level, the fallback for character level
 * @returns {number}
 */
function maxHpBonus(actor, hp, level) {
  const perLevel = hp?.bonuses?.level;
  const overall = hp?.bonuses?.overall;
  // Both default to "", so the common case costs nothing — worth guarding,
  // since this runs on every prepareData pass.
  if (!perLevel && !overall) return 0;

  const simplifyBonus = globalThis.dnd5e?.utils?.simplifyBonus;
  if (!simplifyBonus) return 0;

  // Safe to build roll data here: we run after the wrapped `prepareData` has
  // returned, so the actor is fully prepared.
  const rollData = actor.getRollData({ deterministic: true });
  const characterLevel = actor.system?.details?.level || level;
  return (simplifyBonus(perLevel, rollData) * characterLevel)
    + simplifyBonus(overall, rollData);
}
