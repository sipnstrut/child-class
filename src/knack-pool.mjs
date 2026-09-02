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
// Fix: patch each compendium Knack item's advancement pool in-memory via
// `updateSource`, which mutates the loaded document without persisting to
// LevelDB. Any subsequent read (fromUuid, actor clone during advancement flow)
// sees the injected pool. Runs at world `ready` when the map exists, and
// re-runs at the end of the Prepare Knack Feats dialog so newly-resolved
// UUIDs flow through immediately.

import { MODULE_ID } from "./config.mjs";

const KNACK_ID_RE = /^k(14|24)([a-z]+)0*$/;
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
      console.log("[child-class] Knack feat picker render — bypassing prereqs.");
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

export async function patchKnackPools() {
  const map = game.settings.get(MODULE_ID, "knackFeatMap");
  if (!map || !Object.keys(map).length) return;
  const pack = game.packs.get(KNACK_PACK_ID);
  if (!pack) return;

  const docs = await pack.getDocuments();
  let patched = 0;
  for (const doc of docs) {
    const match = doc.id.match(KNACK_ID_RE);
    if (!match) continue;
    const [, editionKey, classKey] = match;
    const variantId = editionKey === "14" ? "child14" : "child24";
    const entries = map[variantId]?.[classKey];
    if (!entries?.length) continue;

    const pool = entries
      .filter(e => e.uuid)
      .map(e => ({ uuid: e.uuid }));
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
