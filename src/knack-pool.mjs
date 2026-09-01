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

// Override `ItemChoiceFlow.prototype.featureLevel` so that when the flow is
// rendering our Knack Bonus Feat picker (advancement _id starts with
// `advFeatPick`), it returns a large number instead of the Child's class
// level. That defeats dnd5e's `prerequisites.level` filter (dnd5e.mjs
// 41136 + 75754), which otherwise drops 2024 General feats at Child level 2.
// Doing this via `Object.defineProperty` rather than libWrapper because
// featureLevel is a getter, and libWrapper only wraps methods.
function patchFeatureLevelForKnackFeatPickers() {
  const flowProto = CONFIG.DND5E?.advancementTypes?.ItemChoice?.documentClass
    ?.metadata?.apps?.flow?.prototype;
  if (!flowProto) {
    console.warn("[child-class] Cannot patch ItemChoiceFlow.featureLevel — flow prototype not found.");
    return;
  }
  const original = Object.getOwnPropertyDescriptor(flowProto, "featureLevel")?.get;
  if (!original) {
    console.warn("[child-class] ItemChoiceFlow.featureLevel getter not found.");
    return;
  }
  Object.defineProperty(flowProto, "featureLevel", {
    configurable: true,
    get() {
      if (this.advancement?._id?.startsWith("advFeatPick")) {
        // § 5.4 — ignore item-level prerequisites for the Knack Bonus Feat pool.
        return Number.MAX_SAFE_INTEGER;
      }
      return original.call(this);
    }
  });
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
