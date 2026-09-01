#!/usr/bin/env node
// Generate class item JSON sources from variant definitions.
// Reads src/variants/*.mjs (via the registry), writes packs-src/child-class/class-<id>.json.
// Rerun on every pack build so hand-editing the generated files is discouraged.
//
// Emits:
//   - class item shell (identifier, hd placeholder, source rules, empty advancement)
// Advancements (Knack ItemChoice, Trait choices, etc.) attach in later steps.
// HP (§ 5.1) and prof (§ 5.2) are applied at runtime via src/hp.mjs — dnd5e's
// ActiveEffect handler only evaluates formulas for keys in FORMULA_FIELDS
// (dnd5e.mjs:24528), which does not include hp.max or prof, so an AE OVERRIDE
// with a formula string cast to NumberField yields NaN → 0. See api-notes.md
// Q4 addendum.

import { writeFileSync, mkdirSync, readdirSync, unlinkSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { CHILD_VARIANTS } from "../src/variants/index.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT_DIR = join(ROOT, "packs-src", "child-class");
const FILE_PREFIX = "class-";

// Foundry document _ids must be 16-char alphanumeric. Hand-derived from
// variantId + suffix so re-generation is stable and diffs are readable.
function itemId(variantId, suffix) {
  const base = `${variantId}${suffix}`;
  if (base.length > 16) {
    throw new Error(`stable id "${base}" exceeds 16-char limit`);
  }
  return base.padEnd(16, "0");
}

// LevelDB pack keys — required by foundryvtt-cli's compileClassicLevel
// (docs without `_key` are silently skipped). Top-level Items live under
// `!items!<id>`; embedded ActiveEffects under `!items.effects!<itemId>.<effectId>`.
function itemKey(itemId) {
  return `!items!${itemId}`;
}

function classItem(variant) {
  const id = itemId(variant.id, "class");
  return {
    _id: id,
    _key: itemKey(id),
    name: variant.displayName,
    type: "class",
    img: "icons/skills/social/diplomacy-handshake.webp",
    effects: [],
    system: {
      identifier: variant.id,
      levels: 1,
      hitDice: "d4",
      // § 5.0 side effect: suppress the placeholder d4 hit-dice pool.
      // The class item's rollData sets `item` to a spread of the system data
      // (Item5e#getRollData line 23734: `item: { ...this.system }`), not the
      // Item itself — so the correct path to the class's own levels is
      // `@item.levels`, not `@item.system.levels` and not the bare `@levels`
      // (which is undefined on actor rollData). Verified in Foundry on
      // 2026-08-31 — the earlier two forms both evaluated to 0 and left the
      // pool at levels + 0 = N.
      hd: {
        denomination: "d4",
        additional: "-@item.levels"
      },
      source: { rules: variant.rules },
      description: {
        value: `<p>${variant.label}</p>`,
        chat: ""
      },
      advancement: {}
    }
  };
}

mkdirSync(OUT_DIR, { recursive: true });

if (existsSync(OUT_DIR)) {
  for (const f of readdirSync(OUT_DIR)) {
    if (f.startsWith(FILE_PREFIX) && f.endsWith(".json")) {
      unlinkSync(join(OUT_DIR, f));
    }
  }
}

let count = 0;
for (const [id, variant] of Object.entries(CHILD_VARIANTS)) {
  const item = classItem(variant);
  const filename = `${FILE_PREFIX}${id}.json`;
  writeFileSync(join(OUT_DIR, filename), JSON.stringify(item, null, 2) + "\n");
  console.log(`generated: packs-src/child-class/${filename}`);
  count++;
}

console.log(`Generated ${count} class item(s).`);
