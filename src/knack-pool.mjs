// Injects resolved feat UUIDs into every Knack item's level-2 ItemChoice pool,
// and patches dnd5e's ItemChoiceFlow so the Knack's Bonus Feat picker ignores
// item-level prerequisites (per design § 5.4: "The Knack grants a feat at
// Child level 2 and explicitly ignores prerequisites").
//
// Where earlier drafts hooked `preCreateItem`: doesn't work. The advancement
// flow (dnd5e's `ItemChoiceFlow._prepareContentContext`) reads
// `advancement.configuration.pool` from the *source* Knack item in the
// compendium — the clone actor's item is queued, not created, so preCreateItem
// hasn't fired yet by the time the pool is resolved via `fromUuid`.
//
// Fix, part one: patch each compendium Knack item's advancement pool in-memory
// via `updateSource`, which mutates the loaded document without persisting to
// LevelDB. Any subsequent read (fromUuid, actor clone during advancement flow)
// sees the injected pool. Runs at world `ready` when the map exists, and
// re-runs at the end of the Prepare Knack Feats dialog so newly-resolved
// UUIDs flow through immediately.
//
// Fix, part two — `ensureKnackPool`: part one alone is not enough, because
// that in-memory patch lives in the compendium's *document cache*, which
// Foundry flushes 300s after last access. Once flushed, the pool is empty
// again for whoever opens the picker next. So the pool is also injected at
// render time, straight from the setting, where no cache can expire out from
// under it. Part one still earns its keep for reads that never go through the
// flow (the compendium browser's preview of a Knack item).

import { MODULE_ID } from "./config.mjs";
import { KNACK_ID_RE, verboseLog } from "./utils.mjs";

const KNACK_PACK_ID = `${MODULE_ID}.child-knacks`;

export function registerKnackPool() {
  Hooks.once("setup", () => {
    patchFeatureLevelForKnackFeatPickers();
  });
  Hooks.once("ready", async () => {
    await patchKnackPools();
  });
}

// Bypass ALL feat prerequisites (level, item, repeatable) when the flow is
// rendering our Knack Bonus Feat picker. Per design § 5.4: "The Knack grants
// a feat at Child level 2 and explicitly ignores prerequisites." Two wraps:
//
//   - `ItemChoiceFlow.prototype._prepareContentContext` — sets a module-scoped
//     "we're inside a Knack feat picker render" flag while the wrapped call
//     executes.
//   - `FeatData.prototype.validatePrerequisites` — short-circuits to `true`
//     when that flag is set. Because Foundry is single-threaded within a
//     render pass, the flag is safe even though _prepareContentContext is
//     async: the flag is only observed by synchronous validatePrerequisites
//     calls that happen during the same task.
let inKnackFeatPickerRender = false;

function patchFeatureLevelForKnackFeatPickers() {
  const flowClass = CONFIG.DND5E?.advancementTypes?.ItemChoice?.documentClass
    ?.metadata?.apps?.flow;
  if (!flowClass?.prototype?._prepareContentContext) {
    console.warn("[child-class] Cannot patch ItemChoiceFlow — flow class not found via CONFIG path.");
    return;
  }

  // Direct prototype patch rather than libWrapper string paths, because the
  // CONFIG.DND5E.advancementTypes chain includes `metadata` which is a
  // static object literal — the libWrapper string evaluator sometimes can't
  // follow that. Monkey-patching directly is louder but works reliably.
  const flowProto = flowClass.prototype;
  const originalPrep = flowProto._prepareContentContext;
  flowProto._prepareContentContext = async function(...args) {
    if (this.advancement?._id?.startsWith("advFeatPick")) {
      verboseLog("Knack feat picker render — bypassing prereqs.");
      if (ensureKnackPool(this.advancement)) {
        // The flow fills `this.pool` with `??=`, which will not refill a
        // non-nullish value — so an earlier render's copy, empty or stale,
        // would survive. Clear it whenever the pool was actually written.
        this.pool = undefined;
      }
      inKnackFeatPickerRender = true;
      try {
        return await originalPrep.apply(this, args);
      } finally {
        inKnackFeatPickerRender = false;
      }
    }
    return originalPrep.apply(this, args);
  };

  // Patch the feat data model's validatePrerequisites to short-circuit while
  // the flag is set. Try both dnd5e.dataModels.item.FeatData and
  // CONFIG.Item.dataModels.feat — different dnd5e minor versions expose it
  // under different paths.
  const featModel = globalThis.dnd5e?.dataModels?.item?.FeatData
    ?? CONFIG.Item?.dataModels?.feat;
  if (!featModel?.prototype?.validatePrerequisites) {
    console.warn("[child-class] Cannot patch FeatData.validatePrerequisites — model not found at dnd5e.dataModels.item.FeatData or CONFIG.Item.dataModels.feat.");
    return;
  }
  const originalValidate = featModel.prototype.validatePrerequisites;
  featModel.prototype.validatePrerequisites = function(...args) {
    if (inKnackFeatPickerRender) {
      return true;
    }
    return originalValidate.apply(this, args);
  };

  // Also skip the ItemChoiceAdvancement's own `_evaluatePrerequisites` for our
  // advancements (fires on apply, dnd5e.mjs:42040), and wrap `restore` to set
  // the render flag around its execution — restore has its own
  // `validatePrerequisites(..., throwError: true)` call at 42064 that would
  // otherwise throw AdvancementError and abort the flow.
  const advancementClass = CONFIG.DND5E?.advancementTypes?.ItemChoice?.documentClass;
  if (advancementClass?.prototype?._evaluatePrerequisites) {
    const originalEval = advancementClass.prototype._evaluatePrerequisites;
    advancementClass.prototype._evaluatePrerequisites = async function(...args) {
      if (this._id?.startsWith("advFeatPick")) {
        return;
      }
      return originalEval.apply(this, args);
    };
  }
  if (advancementClass?.prototype?.restore) {
    const originalRestore = advancementClass.prototype.restore;
    advancementClass.prototype.restore = async function(...args) {
      if (this._id?.startsWith("advFeatPick")) {
        inKnackFeatPickerRender = true;
        try {
          return await originalRestore.apply(this, args);
        } finally {
          inKnackFeatPickerRender = false;
        }
      }
      return originalRestore.apply(this, args);
    };
  }
  console.log(`[child-class] Prereq bypass installed on ${featModel.name} + ItemChoiceAdvancement (apply + restore).`);
}

/**
 * Read the `knackFeatMap` setting. Returns null when it is unset or empty, or
 * when settings aren't registered yet.
 * @returns {object|null}
 */
function readFeatMap() {
  let map;
  try {
    map = game.settings.get(MODULE_ID, "knackFeatMap");
  } catch {
    return null;
  }
  return map && Object.keys(map).length ? map : null;
}

/**
 * Split a Knack item id (`k24fighter000000`) into the variant and class key
 * the feat map is indexed by.
 * @param {string} id
 * @returns {{ variantId: string, classKey: string }|null} — null for any id
 *   that isn't one of our Knack items.
 */
function knackIdentity(id) {
  const match = String(id ?? "").match(KNACK_ID_RE);
  if (!match) return null;
  const [, editionKey, classKey] = match;
  return { variantId: editionKey === "14" ? "child14" : "child24", classKey };
}

/**
 * The ItemChoice pool for one Knack, as resolved by the § 7.2 setup workflow.
 * @param {object} map — from `readFeatMap`
 * @param {{ variantId: string, classKey: string }} identity
 * @returns {{ uuid: string }[]} — empty when nothing resolved for this Knack.
 */
function poolFor(map, { variantId, classKey }) {
  return (map[variantId]?.[classKey] ?? [])
    .filter(e => e.uuid)
    .map(e => ({ uuid: e.uuid }));
}

/**
 * Fill an in-flight Knack advancement's feat pool directly from the
 * `knackFeatMap` setting, bypassing the compendium entirely.
 *
 * `patchKnackPools` writes the same pool onto the compendium documents, but
 * that patch is in-memory only and lives in `CompendiumCollection`'s document
 * cache — which Foundry flushes 300s after the pack was last touched
 * (`CACHE_LIFETIME_SECONDS`). After a flush the next `fromUuid` refetches
 * clean source data, so the advancement gets cloned with an empty pool and
 * `allowDrops: true` again. That is why the picker looked populated for the
 * GM who had just run Prepare Knack Feats and empty for everyone else: the
 * players' `ready`-time patch had long since expired.
 *
 * Injecting at render time is independent of the cache, so it holds for any
 * client at any point in the session.
 *
 * A populated pool is not assumed current. The actor's copy of a Knack keeps
 * whatever pool was baked in when the item was added, so re-running Prepare
 * Knack Feats — after importing a better-matching feat, say — would otherwise
 * leave existing characters pointed at the old UUIDs forever. Any pool that
 * disagrees with the map is replaced.
 *
 * @param {Advancement} advancement — the ItemChoice advancement being rendered
 * @returns {boolean} — true when the pool was written, whether filled or
 *   refreshed. The caller must discard any cached copy of it.
 */
export function ensureKnackPool(advancement) {
  const config = advancement?.configuration;
  if (!config) return false;

  const item = advancement.item;
  // dnd5e's own source-id chain (see its `_stats.compendiumSource ??
  // flags.dnd5e.sourceId` reads): the actor's copy of the Knack is a clone
  // with a fresh _id, so the compendium source is what identifies it.
  const sourceId = item?._stats?.compendiumSource
    ?? item?.flags?.dnd5e?.sourceId
    ?? item?.flags?.core?.sourceId
    ?? item?.id;
  const identity = knackIdentity(String(sourceId ?? "").split(".").pop());
  if (!identity) return false;

  const map = readFeatMap();
  if (!map) return false;
  const pool = poolFor(map, identity);
  if (!pool.length) return false;

  const stale = config.pool?.length ?? 0;
  if (samePool(config.pool, pool)) return false;

  config.pool = pool;
  config.allowDrops = false;
  verboseLog(
    stale
      ? `Refreshed the ${identity.variantId}/${identity.classKey} Knack pool at render: ${stale} stale feat(s) -> ${pool.length}.`
      : `Injected ${pool.length} feat(s) into the ${identity.variantId}/${identity.classKey} Knack pool at render.`
  );
  return true;
}

/**
 * Whether a pool already matches what the map resolves to. Order matters: the
 * map preserves knackTable order, so a reordering is a real change.
 * @param {{uuid: string}[]|undefined} current
 * @param {{uuid: string}[]} next
 * @returns {boolean}
 */
function samePool(current, next) {
  if ((current?.length ?? 0) !== next.length) return false;
  return next.every((entry, i) => current[i]?.uuid === entry.uuid);
}

export async function patchKnackPools() {
  const map = readFeatMap();
  if (!map) return;
  const pack = game.packs.get(KNACK_PACK_ID);
  if (!pack) return;

  const docs = await pack.getDocuments();
  let patched = 0;
  for (const doc of docs) {
    const identity = knackIdentity(doc.id);
    if (!identity) continue;

    const pool = poolFor(map, identity);
    if (!pool.length) continue;

    const advIds = Object.keys(doc._source?.system?.advancement ?? {});
    const featAdvId = advIds.find(id => id.startsWith("advFeatPick"));
    if (!featAdvId) continue;

    doc.updateSource({
      [`system.advancement.${featAdvId}.configuration.pool`]: pool,
      // Drop-target is a fallback for when the resolver hasn't populated the
      // pool — now that we have UUIDs, hide the drop area. If a GM later wipes
      // the map, the JSON default (`allowDrops: true`) re-applies on world
      // load, so the escape hatch reappears when it's actually needed.
      [`system.advancement.${featAdvId}.configuration.allowDrops`]: false
    });
    patched++;
  }
  if (patched) console.log(`[child-class] Patched ${patched} Knack item(s) with resolved feat pools.`);
}
