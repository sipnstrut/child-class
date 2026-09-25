// Minimal stand-ins for the Foundry / dnd5e globals the runtime modules read.
//
// The module's source files touch globals only inside functions, never at
// module scope, so a test file can import from `src/` normally and install
// these before calling anything.

/**
 * Install `game`, `foundry`, and (optionally) `dnd5e` / `libWrapper`.
 * @param {object} [opts]
 * @param {Record<string, unknown>} [opts.settings] — keyed `"<module>.<key>"`,
 *   exactly as `game.settings.get(module, key)` would look them up.
 * @returns {{ settings: Record<string, unknown> }} — mutate `settings` to
 *   change what a later call reads.
 */
export function installFoundryGlobals({ settings = {} } = {}) {
  const store = { "child-class.verboseLogging": false, ...settings };
  globalThis.game = {
    settings: {
      get: (module, key) => store[`${module}.${key}`]
    }
  };
  globalThis.foundry = {
    utils: {
      getProperty: (obj, path) => path.split(".").reduce((acc, k) => acc?.[k], obj)
    }
  };
  return { settings: store };
}

/**
 * dnd5e's formula-bonus helper, reduced to the numeric cases the HP path uses.
 * The real one evaluates a roll formula against roll data; `hp.bonuses.*` in
 * practice holds things like `""`, `"2"`, or `"+2"`.
 */
export function simplifyBonus(formula) {
  if (!formula) return 0;
  const n = Number(String(formula).replace(/^\+/, ""));
  return Number.isFinite(n) ? n : 0;
}

/** Install `globalThis.dnd5e` with the utils the module reaches for. */
export function installDnd5e({ withSimplifyBonus = true } = {}) {
  globalThis.dnd5e = withSimplifyBonus ? { utils: { simplifyBonus } } : {};
}

/**
 * Install a `libWrapper` stub that captures each registered wrapper by target
 * instead of patching anything, so a test can call one directly.
 * @returns {(target?: string) => Function} — the wrapper registered on
 *   `target`, by default `Actor#prepareData`'s
 */
export function captureLibWrapper() {
  const registered = new Map();
  globalThis.libWrapper = { register: (_id, target, fn) => { registered.set(target, fn); } };
  return (target = "CONFIG.Actor.documentClass.prototype.prepareData") => registered.get(target);
}

/**
 * A stand-in for the ItemChoice advancement the Knack feat picker renders.
 * @param {string} sourceId — what identifies the Knack; the actor's copy is a
 *   clone with a fresh `_id`, so this is normally `_stats.compendiumSource`.
 * @param {object} [opts]
 * @param {Array} [opts.pool] — pre-existing pool entries
 * @param {"compendiumSource"|"dnd5eFlag"|"coreFlag"|"bareId"} [opts.via] —
 *   which of dnd5e's source-id spellings to expose the id through
 */
export function makeKnackAdvancement(sourceId, { pool = [], via = "compendiumSource" } = {}) {
  const item = {
    compendiumSource: () => ({ _stats: { compendiumSource: sourceId } }),
    dnd5eFlag: () => ({ flags: { dnd5e: { sourceId } } }),
    coreFlag: () => ({ flags: { core: { sourceId } } }),
    bareId: () => ({ id: sourceId })
  }[via]();

  return {
    _id: "advFeatPick00000",
    configuration: { pool, allowDrops: true },
    item
  };
}

/**
 * A character actor carrying a Child class item, prepared far enough for
 * `applyChildOverrides` to read it.
 * @param {object} [opts]
 * @param {string} [opts.variant] — `"child14"` or `"child24"`
 * @param {number} [opts.level] — Child class level
 * @param {number} [opts.con] — CON modifier
 * @param {number} [opts.characterLevel] — total level, when it differs
 * @param {{level?: string, overall?: string}} [opts.bonuses] — `hp.bonuses`
 * @param {number|null} [opts.sourceHp] — `_source` hp.value; null for a fresh actor
 */
export function makeChildActor({
  variant = "child24",
  level = 5,
  con = 2,
  characterLevel,
  bonuses = { level: "", overall: "" },
  sourceHp = 99
} = {}) {
  return {
    type: "character",
    // getChildVariant matches on `item.identifier`; applyChildOverrides
    // matches on `item.system.identifier`. Both are real on an Item5e.
    items: [{
      type: "class",
      identifier: variant,
      system: { identifier: variant, levels: level }
    }],
    system: {
      abilities: { con: { mod: con } },
      details: { level: characterLevel ?? level },
      attributes: { hp: { value: sourceHp ?? 0, max: 0, tempmax: 0, bonuses } }
    },
    _source: sourceHp === null ? {} : { system: { attributes: { hp: { value: sourceHp } } } },
    getRollData: () => ({})
  };
}
