// § 7.2 setup workflow. GM-facing dialog that scans enabled compendia + world
// items for every feat named in the Child Knack tables, caches the resolved
// UUIDs in the `knackFeatMap` world setting, and surfaces missing / ambiguous
// results so the GM can fix them (usually by importing the feat via Plutonium
// with `Use Advancement-Backing Compendium` on, or by hand into a world
// compendium named e.g. `Knack Feats '14`).
//
// Exposed via `game.modules.get("child-class").api.prepareKnackFeats()` and
// registered as a settings menu button so it appears under Configure Settings.

import { MODULE_ID } from "./config.mjs";
import { buildKnackFeatMap } from "./feat-resolver.mjs";
import { patchKnackPools } from "./knack-pool.mjs";
import { CHILD_VARIANTS } from "./variants/index.mjs";

const STUB_PACK_NAME = "child-class-stub-feats";
const STUB_PACK_LABEL = "Child Class Stub Feats";

export function registerKnackSetup() {
  const module = game.modules.get(MODULE_ID);
  if (module) {
    module.api ??= {};
    module.api.prepareKnackFeats = openDialog;
    module.api.createStubFeats = createStubFeats;
  }
  // On first load in a world where the map has never been populated, nudge
  // the GM once. Skip on subsequent loads regardless of resolution status —
  // GMs will re-run the dialog explicitly when they import more feats.
  const map = game.settings.get(MODULE_ID, "knackFeatMap");
  if (game.user.isGM && (!map || Object.keys(map).length === 0)) {
    ui.notifications?.info(
      "Child Class: no feats resolved yet. Run `game.modules.get(\"child-class\").api.prepareKnackFeats()` from the console (F12) to set up Knack bonus feats."
    );
  }
}

async function openDialog() {
  const map = await buildKnackFeatMap();
  await game.settings.set(MODULE_ID, "knackFeatMap", map);
  await patchKnackPools();
  const stats = summarize(map);
  const content = `
    <div style="min-width: 640px;">
      <p><strong>${stats.resolved}</strong> of <strong>${stats.total}</strong> feats resolved.
      ${stats.missing ? `<span style="color: var(--color-warning, #a55);"><strong>${stats.missing}</strong> missing.</span>` : ""}
      ${stats.ambiguous ? `<span style="color: var(--color-caution, #a80);"><strong>${stats.ambiguous}</strong> ambiguous.</span>` : ""}
      </p>
      <p style="font-size: 0.9em; color: var(--color-text-secondary, #888);">
        Missing feats: import them via Plutonium (enable
        <em>Use Advancement-Backing Compendium</em> so imports land in a scan-able world compendium),
        or drop the feat item into any enabled compendium, then click <em>Rescan</em>.
      </p>
      ${renderTable(map)}
    </div>
  `;
  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: "Prepare Knack Feats" },
    content,
    buttons: [
      { action: "rescan", label: "Rescan", default: true },
      { action: "close",  label: "Close" }
    ]
  });
  if (result === "rescan") return openDialog();
}

function summarize(map) {
  let total = 0, resolved = 0, missing = 0, ambiguous = 0;
  for (const variant of Object.values(map)) {
    for (const feats of Object.values(variant)) {
      for (const feat of feats) {
        total++;
        if (feat.uuid) resolved++;
        else missing++;
        if (feat.candidates?.length > 1) ambiguous++;
      }
    }
  }
  return { total, resolved, missing, ambiguous };
}

function renderTable(map) {
  const rows = [];
  for (const [variantId, classes] of Object.entries(map)) {
    for (const [classKey, feats] of Object.entries(classes)) {
      for (const feat of feats) {
        const status = statusCell(feat);
        rows.push(`
          <tr>
            <td style="white-space: nowrap;">${escape(variantId)}</td>
            <td style="white-space: nowrap;">${escape(classKey)}</td>
            <td>${escape(feat.name)}${feat.source ? ` <em style="color: var(--color-text-secondary);">(${escape(feat.source)})</em>` : ""}</td>
            <td>${status}</td>
          </tr>
        `);
      }
    }
  }
  return `
    <table style="width: 100%; border-collapse: collapse; font-size: 0.9em;">
      <thead>
        <tr style="border-bottom: 1px solid var(--color-border-highlight, #666);">
          <th style="text-align: left;">Variant</th>
          <th style="text-align: left;">Class</th>
          <th style="text-align: left;">Feat</th>
          <th style="text-align: left;">Resolution</th>
        </tr>
      </thead>
      <tbody>${rows.join("")}</tbody>
    </table>
  `;
}

function statusCell(feat) {
  if (!feat.uuid) {
    return `<span style="color: var(--color-warning, #a55);">missing</span>`;
  }
  const first = feat.candidates?.[0];
  const label = escape(first?.packName ?? "unknown pack");
  const ambiguous = feat.candidates?.length > 1
    ? ` <em style="color: var(--color-caution, #a80);">(+${feat.candidates.length - 1} more)</em>`
    : "";
  return `<span style="color: var(--color-text-secondary);">${label}</span>${ambiguous}`;
}

function escape(s) {
  return String(s ?? "").replace(/[&<>"']/g, ch => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]
  ));
}

// Smoke-testing helper. Creates a world compendium and populates it with
// empty feat items named exactly after each Knack feat, so the resolver has
// something to bind to before the GM has imported real feats. Idempotent —
// safe to re-run. Not intended for shipped play; a warning surfaces on each
// stub item's description so nobody mistakes it for real content.
async function createStubFeats() {
  if (!game.user.isGM) {
    ui.notifications?.warn("Only GMs can create the stub feats compendium.");
    return;
  }
  const packId = `world.${STUB_PACK_NAME}`;
  let pack = game.packs.get(packId);
  if (!pack) {
    pack = await CompendiumCollection.createCompendium({
      name: STUB_PACK_NAME,
      label: STUB_PACK_LABEL,
      type: "Item"
    });
  }

  const needed = collectFeatNames();
  const existing = new Set(
    (await pack.getIndex({ fields: ["name"] })).map(e => e.name.trim().toLowerCase())
  );

  const toCreate = [];
  for (const name of needed) {
    if (existing.has(name.trim().toLowerCase())) continue;
    toCreate.push({
      name,
      type: "feat",
      img: "icons/skills/trades/academics-study-reading-book.webp",
      system: {
        type: { value: "", subtype: "" },
        description: {
          value: `<p><strong>Stub</strong> — placeholder created by the Child Class module for smoke testing. Replace with a real Plutonium import (or edit in place) when ready. This item carries no mechanical content.</p>`,
          chat: ""
        }
      }
    });
  }

  if (toCreate.length) {
    await Item.createDocuments(toCreate, { pack: packId, keepId: false });
  }

  ui.notifications?.info(
    `Child Class: ${toCreate.length} stub feats created, ${existing.size} already present. Total in pack: ${existing.size + toCreate.length}. Now run prepareKnackFeats() to resolve them.`
  );
  console.log(
    `[child-class] Created ${toCreate.length} stub feats in compendium "${STUB_PACK_LABEL}" (${packId}).`
  );
}

function collectFeatNames() {
  const names = new Set();
  for (const variant of Object.values(CHILD_VARIANTS)) {
    for (const feats of Object.values(variant.knackTable ?? {})) {
      for (const feat of feats) names.add(feat.name);
    }
  }
  return [...names].sort();
}

