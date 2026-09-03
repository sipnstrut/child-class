// § 7.3 feat resolver. Turns Knack feat names into concrete UUIDs by scanning
// available Item compendia and world items. For § 7.1 reasons (Plutonium
// stores content inside the module, not as a compendium), the practical
// resolution surface is:
//   - packs already enabled in the world (dnd5e SRD, Plutonium's
//     Advancement-Backing Compendium, any hand-built world compendium, etc.)
//   - `game.items` — world-level Items, where charactermancer imports may land
//
// Ranking prefers packs whose `system.source.rules` matches the variant's
// edition and honours the § 5.4 `source: "tasha"` markings by preferring
// candidates whose pack label or `system.source.book` mentions Tasha's.

import { CHILD_VARIANTS } from "./variants/index.mjs";

/**
 * Build a case-insensitive name → candidate[] index over every enabled Item
 * compendium and every world-scoped Item. One pass over all packs; the caller
 * looks up each Knack feat name against the returned Map, saving one full
 * pack scan per feat compared to calling `resolveFeat` in a loop.
 * @returns {Promise<Map<string, object[]>>}
 */
export async function buildFeatIndex() {
  const byName = new Map();
  const push = (target, candidate) => {
    const arr = byName.get(target);
    if (arr) arr.push(candidate);
    else byName.set(target, [candidate]);
  };

  for (const pack of game.packs) {
    if (pack.metadata.type !== "Item") continue;
    let index;
    try {
      index = await pack.getIndex({
        fields: ["type", "system.source.rules", "system.source.book"]
      });
    } catch {
      continue;
    }
    for (const entry of index) {
      if (entry.type !== "feat") continue;
      const target = entry.name?.trim().toLowerCase();
      if (!target) continue;
      push(target, {
        uuid: entry.uuid,
        packName: pack.metadata.label,
        rules: entry.system?.source?.rules,
        book: entry.system?.source?.book
      });
    }
  }

  for (const item of game.items ?? []) {
    if (item.type !== "feat") continue;
    const target = item.name?.trim().toLowerCase();
    if (!target) continue;
    push(target, {
      uuid: item.uuid,
      packName: "World Items",
      rules: item.system?.source?.rules,
      book: item.system?.source?.book
    });
  }

  return byName;
}

/**
 * Resolve one feat name against enabled compendia + world items.
 * @param {string} name — display name from the knackTable entry
 * @param {object} [opts]
 * @param {string} [opts.edition]  — variant.rules ("2014" / "2024")
 * @param {string} [opts.source]   — knackTable source hint ("tasha")
 * @param {string} [opts.matchName]— override the name used for compendium
 *   matching when the shipped item name differs from the display name
 *   (e.g. "Magic Initiate: Druid" → matches "Magic Initiate")
 * @param {Map<string, object[]>} [opts.index] — pre-built index from
 *   `buildFeatIndex`; when omitted, one is built on the fly. Callers that
 *   resolve many feats should build the index once and pass it in.
 * @returns {Promise<{ uuid: string | null, candidates: object[] }>}
 */
export async function resolveFeat(name, { edition, source, matchName, index } = {}) {
  const target = (matchName ?? name).trim().toLowerCase();
  const featIndex = index ?? await buildFeatIndex();
  const candidates = featIndex.get(target) ?? [];
  const ranked = rankCandidates(candidates, { edition, source });
  return { uuid: ranked[0]?.uuid ?? null, candidates: ranked };
}

function rankCandidates(cands, { edition, source }) {
  return cands.slice().sort((a, b) => {
    // When the knackTable entry marks a specific source (currently only
    // `source: "tasha"`), a matching source pack trumps edition match —
    // e.g. '24 Sorcerer Knack calls for Metamagic Adept from TCE, which
    // is a 2014-edition item; that TCE match is more faithful than a
    // 2024-edition item that happens to share the name.
    if (source === "tasha") {
      const aTce = looksTce(a) ? 1 : 0;
      const bTce = looksTce(b) ? 1 : 0;
      if (aTce !== bTce) return bTce - aTce;
    }
    // Otherwise prefer items whose source rules match the actor's edition.
    const aEd = a.rules === edition ? 1 : 0;
    const bEd = b.rules === edition ? 1 : 0;
    if (aEd !== bEd) return bEd - aEd;
    return 0;
  });
}

function looksTce(c) {
  const s = `${c.book ?? ""} ${c.packName ?? ""}`.toLowerCase();
  return /tasha|tce/.test(s);
}

/**
 * Build a full (variant → classKey → feats[]) resolution table. Each entry
 * carries the resolved UUID (or null) and all ranked candidates so the setup
 * UI can surface ambiguity. Only variants that own their knackTable (not
 * inherited via `extends`) are resolved — inherited variants defer to their
 * own step (see design § 13).
 * @param {object} [rawByVariantId] — optional override for the "owns knackTable"
 *   test; defaults to importing each variant module.
 * @returns {Promise<object>}
 */
export async function buildKnackFeatMap(rawByVariantId) {
  const map = {};
  const owner = rawByVariantId ?? (await loadRawVariants());
  const index = await buildFeatIndex();
  for (const [variantId, variant] of Object.entries(CHILD_VARIANTS)) {
    if (!owner[variantId]?.knackTable) continue;
    map[variantId] = {};
    for (const [classKey, feats] of Object.entries(owner[variantId].knackTable)) {
      map[variantId][classKey] = [];
      for (const feat of feats) {
        const r = await resolveFeat(feat.name, {
          edition: variant.rules,
          source: feat.source,
          matchName: feat.matchName,
          index
        });
        map[variantId][classKey].push({
          name: feat.name,
          source: feat.source ?? null,
          uuid: r.uuid,
          candidates: r.candidates
        });
      }
    }
  }
  return map;
}

async function loadRawVariants() {
  const out = {};
  for (const id of Object.keys(CHILD_VARIANTS)) {
    const mod = await import(`./variants/${id}.mjs`);
    out[id] = mod.default;
  }
  return out;
}
