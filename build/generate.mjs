#!/usr/bin/env node
// Generate compendium item JSON sources from variant definitions.
// Reads src/variants/*.mjs (via the registry), writes packs-src/*/*.json.
// Rerun on every pack build so hand-editing generated files is discouraged.
//
// Outputs:
//   packs-src/child-class/    — 2 class items (child14, child24)
//   packs-src/child-knacks/   — 13 '14 Knack items (child24 Knacks deferred to
//                                step 12 per design § 13).
//   packs-src/child-features/ — Youth (§ 5.5), Trade Skill (§ 5.8), and the
//                                two ability-rule feature items (§ 5.3).
//                                Class-linked features granted via ItemGrant
//                                on the class item at the appropriate level.
//
// HP (§ 5.1) and prof (§ 5.2) are applied at runtime via src/hp.mjs — dnd5e's
// ActiveEffect handler only evaluates formulas for keys in FORMULA_FIELDS
// (dnd5e.mjs:24528), which does not include hp.max or prof, so an AE OVERRIDE
// with a formula string cast to NumberField yields NaN → 0. See api-notes.md
// Q4 addendum.

import { writeFileSync, mkdirSync, readdirSync, unlinkSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { CHILD_VARIANTS } from "../src/variants/index.mjs";
import { KNACK_CLASSES } from "../src/variants/knack-classes.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const MODULE_ID = "child-class";
const CLASS_DIR    = join(ROOT, "packs-src", "child-class");
const KNACK_DIR    = join(ROOT, "packs-src", "child-knacks");
const FEATURES_DIR = join(ROOT, "packs-src", "child-features");

// Foundry document _ids must be 16-char alphanumeric. Deterministic derivation
// so re-generation is stable and diffs are readable.
function padId(base) {
  if (base.length > 16) throw new Error(`stable id "${base}" exceeds 16-char limit`);
  return base.padEnd(16, "0");
}
function classItemId(variantId) { return padId(`${variantId}class`); }
function knackItemId(editionKey, classKey) { return padId(`k${editionKey}${classKey}`); }

// LevelDB pack keys — required by foundryvtt-cli's compileClassicLevel; docs
// without `_key` are silently skipped. See api-notes.md Q7 addendum.
function itemKey(id) { return `!items!${id}`; }

// Advancement _ids must be unique within a single parent item. They can repeat
// across items, so short deterministic prefixes are fine.
const ADV_KNACK_PICK    = padId("advKnackPick");
const ADV_FEAT_PICK     = padId("advFeatPick");
const ADV_SKILL_ONE     = padId("advSkillOne");
const ADV_SAVE_ONE      = padId("advSaveOne");
const ADV_WEAPON_ONE    = padId("advWeaponOne");
const ADV_GRANT_YOUTH   = padId("advGrantYouth");
const ADV_GRANT_TRADE   = padId("advGrantTrade");
const ADV_TS_TOOLLANG   = padId("advTsToolLang");

// Feature item ids — shared across editions (features are edition-agnostic).
const FEATURE_YOUTH_ID = padId("featYouth");
const FEATURE_TRADE_ID = padId("featTradeSkill");
const FEATURE_GRADUATE_ID = padId("featGraduate");

// Map dnd5e '14 -> edition key used in knack ids. Kept trivial so step 12
// (child24 Knacks) can extend without ambiguity.
function editionKeyFor(variant) {
  if (variant.id === "child14") return "14";
  if (variant.id === "child24") return "24";
  throw new Error(`no edition key mapping for variant "${variant.id}"`);
}

/* --------------------------------- Class item --------------------------------- */

// § 5.4: level-2 ItemChoice pointing at the edition's Knack pool. Only wired
// up for variants whose OWN knackTable is defined (not inherited) — child24
// inherits child14's knackTable at load time, but the design ships edition-
// specific Knack items ('14 and '24 tables differ), so we don't want child24's
// class to reference '14 Knacks. child24's Knacks land in step 12.
function knackChoiceAdvancement(variant) {
  const editionKey = editionKeyFor(variant);
  const classKeys = Object.keys(variant.knackTable ?? {});
  const pool = classKeys.map(classKey => ({
    uuid: `Compendium.${MODULE_ID}.child-knacks.Item.${knackItemId(editionKey, classKey)}`
  }));
  return {
    _id: ADV_KNACK_PICK,
    type: "ItemChoice",
    level: 2,
    title: "Knack",
    hint: "Pick a class you aspire to. Its Knack item carries the bonus feat, skill, save, and weapon proficiencies granted at levels 2, 3, and 5.",
    configuration: {
      allowDrops: false,
      choices: { "2": { count: 1, replacement: false } },
      pool,
      type: "feat"
    }
  };
}

// § 5.5 / § 5.8: ItemGrant advancements on the class item, granting Youth at
// level 1 and Trade Skill at level 5. The granted items are edition-agnostic
// features shipped in the `child-features` pack. Per api-notes Q3, ItemGrant
// auto-populates `flags.dnd5e.advancementRoot` so the feature's own child
// advancements (Trade Skill's tool/language Trait, etc.) fire on class-level
// change without extra glue.
function grantYouth() {
  return {
    _id: ADV_GRANT_YOUTH,
    type: "ItemGrant",
    level: 1,
    title: "Youth",
    configuration: {
      items: [{ uuid: `Compendium.${MODULE_ID}.child-features.Item.${FEATURE_YOUTH_ID}` }],
      optional: false
    }
  };
}
function grantTradeSkill() {
  return {
    _id: ADV_GRANT_TRADE,
    type: "ItemGrant",
    level: 5,
    title: "Trade Skill",
    configuration: {
      items: [{ uuid: `Compendium.${MODULE_ID}.child-features.Item.${FEATURE_TRADE_ID}` }],
      optional: false
    }
  };
}

function classItem(variant, ownKnackTable) {
  const id = classItemId(variant.id);
  const advancement = {};
  for (const adv of [grantYouth(), grantTradeSkill()]) {
    advancement[adv._id] = adv;
  }
  if (ownKnackTable) {
    const knack = knackChoiceAdvancement(variant);
    advancement[knack._id] = knack;
  }
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
      // rollData sets `item` to a spread of the system data, not the Item
      // itself (Item5e#getRollData:23734), so the class's own levels resolve
      // via `@item.levels` — `@item.system.levels` and bare `@levels` both
      // evaluate to 0. Verified in Foundry on 2026-08-31.
      hd: {
        denomination: "d4",
        additional: "-@item.levels"
      },
      source: { rules: variant.rules },
      description: {
        value: `<p>${variant.label}</p>`,
        chat: ""
      },
      advancement
    }
  };
}

/* --------------------------------- Knack items -------------------------------- */

// § 5.4: each Knack is a `feat`-type Item with `system.type.value === "class"`.
// Per api-notes Q3 this is load-bearing: plain-Feat items short-circuit at
// FeatData#advancementClassLinked and their own advancements will not fire on
// class-level change. "Class Feature" subtype opts in to class-linked firing.

function skillTrait(classKey) {
  const cls = KNACK_CLASSES[classKey];
  return {
    _id: ADV_SKILL_ONE,
    type: "Trait",
    level: 3,
    title: "Mentor's Knowledge (Skill)",
    hint: `Choose one skill proficiency from the ${cls.label} skill list.`,
    configuration: {
      choices: [{
        count: 1,
        pool: cls.skills.map(s => `skills:${s}`)
      }]
    }
  };
}

function saveTrait(classKey) {
  const cls = KNACK_CLASSES[classKey];
  return {
    _id: ADV_SAVE_ONE,
    type: "Trait",
    level: 3,
    title: "Mentor's Knowledge (Save)",
    hint: `Choose one saving throw proficiency from the ${cls.label} class list.`,
    configuration: {
      choices: [{
        count: 1,
        pool: cls.saves.map(s => `saves:${s}`)
      }]
    }
  };
}

// dnd5e's Trait choices UI namespaces weapons by category — a specific
// weapon in a pool needs `weapon:<sim|mar>:<id>`, not just `weapon:<id>`.
// The bare form only appears in the trait-key label helper (keyLabel) and
// won't render as an option in the picker. Categorize each weapon id.
const SIMPLE_WEAPON_IDS = new Set([
  "club", "dagger", "dart", "greatclub", "handaxe", "javelin", "lighthammer",
  "mace", "quarterstaff", "sickle", "spear", "lightcrossbow", "sling"
]);
function weaponTraitKey(id) {
  return SIMPLE_WEAPON_IDS.has(id) ? `weapon:sim:${id}` : `weapon:mar:${id}`;
}

function weaponTrait(classKey) {
  const cls = KNACK_CLASSES[classKey];
  const pool = [
    ...cls.weapons.map(weaponTraitKey),
    ...(cls.shield ? ["armor:shl"] : [])
  ];
  return {
    _id: ADV_WEAPON_ONE,
    type: "Trait",
    level: 5,
    title: "Trade Skill (Weapon / Shield)",
    hint: `Choose one weapon or shield proficiency from the ${cls.label} class list. Lost on graduation.`,
    configuration: {
      choices: [{
        count: 1,
        pool
      }]
    }
  };
}

// Level-2 bonus feat — pool of the two class-specific feats named in the
// knackTable. Feat UUIDs come from the § 7.2 setup workflow, not from the
// module itself; until step 5b lands the pool is empty. `allowDrops: true`
// so the level-2 step doesn't hard-block during smoke testing — the player
// can drag in any feat to satisfy the ItemChoice. When 5b lands and the
// resolver populates the pool, allowDrops flips off (or stays on as a GM
// override, TBD).
function featChoice(_variant, entry) {
  const [featA, featB] = entry ?? [{ name: "Feat A" }, { name: "Feat B" }];
  return {
    _id: ADV_FEAT_PICK,
    type: "ItemChoice",
    level: 2,
    title: "Knack Bonus Feat",
    hint: `Choose one: ${featA.name} or ${featB.name}. The Prepare Knack Feats setup workflow (§ 7.2, step 5b) will populate the pool with the correct UUIDs; until then, drag in the feat from your own compendia.`,
    configuration: {
      allowDrops: true,
      choices: { "2": { count: 1, replacement: false } },
      pool: [],
      type: "feat"
    }
  };
}

function knackItem(variant, editionKey, classKey, entry) {
  const id = knackItemId(editionKey, classKey);
  const cls = KNACK_CLASSES[classKey];
  if (!cls) throw new Error(`knackTable references unknown class "${classKey}"`);

  const advancement = {};
  for (const adv of [
    featChoice(variant, entry),
    skillTrait(classKey),
    saveTrait(classKey),
    weaponTrait(classKey)
  ]) {
    advancement[adv._id] = adv;
  }

  return {
    _id: id,
    _key: itemKey(id),
    name: `Knack '${editionKey}: ${cls.label}`,
    type: "feat",
    img: "icons/skills/trades/academics-study-reading-book.webp",
    effects: [],
    system: {
      // § 5.4 / Q3: sub-type "class" (Class Feature) opts in to class-linked
      // advancement firing on class-level change. Plain "feat" short-circuits.
      type: { value: "class", subtype: "" },
      description: {
        value: `<p>Aspiring ${cls.label} (${cls.hitDie} hit die). Grants a bonus feat at Child level 2, one skill and one saving throw proficiency at level 3, and one weapon or shield proficiency at level 5. Lost on graduation except where noted (§ 5.4, § 5.6, § 5.8).</p>`,
        chat: ""
      },
      source: { rules: variant.rules },
      advancement
    }
  };
}

/* --------------------------------- Features ----------------------------------- */

// § 5.5 Youth. Feat-type Item with `system.type.value === "class"` (Q3 rules
// for class-linked firing). Ships one heal Activity: uses = 1, recovery = long
// rest, formula = ceil(@attributes.hp.max / 2) — the wording is "half maximum
// hit points, rounded up" so ceil is authoritative when the roll of max is
// odd (§ 5.5's own callout).
function youthFeature() {
  const actId = padId("actYouthHeal");
  return {
    _id: FEATURE_YOUTH_ID,
    _key: itemKey(FEATURE_YOUTH_ID),
    name: "Youth",
    type: "feat",
    img: "icons/svg/regen.svg",
    system: {
      type: { value: "class", subtype: "" },
      description: {
        value: `<p><em>Level 1 Child feature.</em></p><p>Once per long rest, during a short rest, you may recover hit points equal to half your maximum HP, <strong>rounded up</strong>. Lost on graduation.</p>`,
        chat: ""
      },
      activities: {
        [actId]: {
          _id: actId,
          type: "heal",
          name: "Youthful Recovery",
          img: "icons/svg/regen.svg",
          activation: { type: "special", value: null, condition: "During a short rest." },
          consumption: {
            targets: [{ type: "activityUses", target: "", value: "1" }],
            scaling: { allowed: false, max: "" }
          },
          uses: {
            spent: 0,
            max: "1",
            recovery: [{ period: "lr", type: "recoverAll", formula: "" }]
          },
          healing: {
            bonus: "",
            custom: { enabled: true, formula: "ceil(@attributes.hp.max / 2)" },
            types: ["healing"]
          }
        }
      },
      source: { rules: "2014" }
    }
  };
}

// § 5.8 Trade Skill. Description-only for the Weapon/Shield choice — that
// Trait is authored on each Knack item (§ 5.4) and already fires via the
// Knack's class-linked advancement chain. The Tool/Language Trait, the gold
// roll, and the item-choice prompt live here / in trade-skill.mjs.
function tradeSkillFeature() {
  return {
    _id: FEATURE_TRADE_ID,
    _key: itemKey(FEATURE_TRADE_ID),
    name: "Trade Skill",
    type: "feat",
    img: "icons/skills/trades/smithing-anvil-silver-red.webp",
    system: {
      type: { value: "class", subtype: "" },
      description: {
        value: `<p><em>Level 5 Child feature.</em></p><ul>
<li>Gain proficiency with <strong>one tool set or language</strong> of your choice. <em>Retained on graduation.</em></li>
<li>Gain proficiency with <strong>one weapon or shield</strong> from your Knack class's list. <em>Lost on graduation.</em> (Granted via your Knack item.)</li>
<li>Roll <strong>2d&lt;Knack hit die&gt;</strong> and gain that many gold pieces.</li>
<li>Gain <strong>one item</strong> the character is proficient with (compendium prompt).</li>
</ul>`,
        chat: ""
      },
      advancement: {
        [ADV_TS_TOOLLANG]: {
          _id: ADV_TS_TOOLLANG,
          type: "Trait",
          level: 5,
          title: "Trade Skill (Tool / Language)",
          hint: "Choose one tool proficiency or one language. Retained on graduation.",
          configuration: {
            choices: [{
              count: 1,
              // dnd5e trait keys — `tool:*` covers any tool, `languages:*` any
              // language. If either wildcard isn't accepted by the Trait UI in
              // 5.3.x we'll refine to the explicit category set.
              pool: ["tool:*", "languages:*"]
            }]
          }
        }
      },
      source: { rules: "2014" }
    }
  };
}

// § 6 Graduate keepsake. Granted by the graduation flow, not by class-level
// advancement — its purpose is to leave a visible record on the sheet of
// what the character carried out of Child. Static description; the specific
// Knack / feat / proficiency the character retained are already visible as
// their own items on the sheet.
function graduateFeature() {
  return {
    _id: FEATURE_GRADUATE_ID,
    _key: itemKey(FEATURE_GRADUATE_ID),
    name: "Graduate",
    type: "feat",
    img: "icons/skills/social/diplomacy-handshake.webp",
    system: {
      type: { value: "class", subtype: "" },
      description: {
        value: `<p><em>Graduated from the Child class.</em></p>
<p>You retain from your childhood:</p>
<ul>
<li>The bonus feat you chose during your Knack (kept as a normal feat — a pure bonus, consuming no ASI or Origin slot).</li>
<li>The tool set or language proficiency you gained from Trade Skill.</li>
<li>All ability scores, including any increases from Growth at level 4.</li>
<li>All items and gold you gathered as a Child.</li>
</ul>
<p>To continue building your character, drag a class from the compendium onto your sheet — dnd5e's normal advancement flow will apply. If you graduated into the class matching your Knack, your Child XP total will place you at level 2 automatically.</p>`,
        chat: ""
      },
      source: { rules: "2014" }
    }
  };
}

/* ------------------------------- Emit + housekeeping -------------------------- */

// RAW variants (pre-`extends` resolution) — used to distinguish "owns its own
// knackTable" (child14) from "inherits knackTable" (child24). Only owners get
// generated Knacks in this pass; inherited variants defer to their step 12.
async function loadRawVariants() {
  const rawByModule = await Promise.all(
    Object.keys(CHILD_VARIANTS).map(async id => {
      const mod = await import(`../src/variants/${id}.mjs`);
      return [id, mod.default];
    })
  );
  return Object.fromEntries(rawByModule);
}

function cleanDir(dir, prefix) {
  if (!existsSync(dir)) return;
  for (const f of readdirSync(dir)) {
    if (prefix ? f.startsWith(prefix) : f.endsWith(".json")) {
      unlinkSync(join(dir, f));
    }
  }
}

const rawVariants = await loadRawVariants();

// Class items
mkdirSync(CLASS_DIR, { recursive: true });
cleanDir(CLASS_DIR, "class-");

let classCount = 0;
for (const [id, variant] of Object.entries(CHILD_VARIANTS)) {
  const ownsKnackTable = Boolean(rawVariants[id]?.knackTable);
  const item = classItem(variant, ownsKnackTable);
  const filename = `class-${id}.json`;
  writeFileSync(join(CLASS_DIR, filename), JSON.stringify(item, null, 2) + "\n");
  console.log(`generated: packs-src/child-class/${filename}`);
  classCount++;
}

// Knack items — one file per class per variant that owns its own knackTable.
mkdirSync(KNACK_DIR, { recursive: true });
cleanDir(KNACK_DIR);

let knackCount = 0;
for (const [id, variant] of Object.entries(CHILD_VARIANTS)) {
  const raw = rawVariants[id];
  if (!raw?.knackTable) continue;
  const editionKey = editionKeyFor(variant);
  for (const [classKey, entry] of Object.entries(raw.knackTable)) {
    const item = knackItem(variant, editionKey, classKey, entry);
    const filename = `knack-${editionKey}-${classKey}.json`;
    writeFileSync(join(KNACK_DIR, filename), JSON.stringify(item, null, 2) + "\n");
    knackCount++;
  }
}

// Features — Youth + Trade Skill (edition-agnostic; ability-rule feature
// items land in step 11's Unremarkable wiring).
mkdirSync(FEATURES_DIR, { recursive: true });
cleanDir(FEATURES_DIR);

let featureCount = 0;
for (const feature of [youthFeature(), tradeSkillFeature(), graduateFeature()]) {
  writeFileSync(join(FEATURES_DIR, `${feature.name.toLowerCase().replace(/\s+/g, "-")}.json`),
    JSON.stringify(feature, null, 2) + "\n");
  featureCount++;
}

console.log(`Generated ${classCount} class item(s), ${knackCount} knack item(s), ${featureCount} feature item(s).`);
