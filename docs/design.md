# Design Doc — `child-class` Foundry VTT Module

**Target:** Foundry VTT v13/v14, D&D 5e system (`dnd5e`) v5.3.0+
**Source material:** https://www.sipandstrut.com/childclass
**Audience:** Claude Code (implementer)
**Status:** **Implemented and shipped as v0.3.0** against Foundry v14 / dnd5e 5.3.3. Both editions and both ability rules are live. The verification pass in `docs/api-notes.md` is closed out — all three previously-flagged live-Foundry items were resolved during implementation. This document is the design source of truth; the shipped module may deviate in places where playtesting exposed a better approach, and those deviations are called out inline as "Correction YYYY-MM-DD" notes.

---

## 1. Summary

A Foundry module that adds the **Child** class to the `dnd5e` system as a playable option. The Child is a five-level "pre-adventurer" class. It does not conform to standard 5e progression in four significant ways, each of which requires custom code rather than plain compendium data:

1. **Non-standard hit points.** No hit die. Level 1 = 6 + CON mod. Each level after = 1 + CON mod.
2. **Non-standard proficiency bonus.** +1 at levels 1–2, +2 at levels 3–5.
3. **Non-standard ability score generation.** Rolled at creation on a bespoke formula, then rolled again and added at level 4. No point buy, no standard array, and no ability score increases from background or species.
4. **No background.** A Child has no background at all until Graduation. Every other 5e character has one from creation, and the system's creation flow assumes it.
5. **Graduation.** On completing level 5, the character *loses the Child class entirely* and becomes level 1 (or level 2) of a different class, gaining their first background in the process. This is a destructive, one-way character transformation with a partial-retention rule set.

Item 5 is the core engineering problem and the reason this must be a module rather than a hand-built compendium entry.

---

## 2. Non-goals

- No support for multiclassing Child with any other class (explicitly blocked — see § 8.4).
- No support for Child levels above 5.
- No automation of encounter balance, DM tooling, or downtime.
- No reproduction of feat rules text. Feats are referenced by UUID from the user's own installed compendia (§ 7).
- No support for systems other than `dnd5e`.

---

## 2.5 Two editions, two ability rules

The module ships **two sibling class items** — one per D&D edition — and a separate, orthogonal choice of ability-generation rule that applies to either.

| Display name | Identifier | `system.source.rules` | Basis |
|---|---|---|---|
| Child '14 | `child14` | `2014` | 2014 PHB + Tasha's |
| Child '24 | `child24` | `2024` | 2024 PHB |

**Two independent axes. Do not entangle them:**

| Axis | Values | Scope | What it controls |
|---|---|---|---|
| **Edition** (class item) | `child14`, `child24` | per character | Knack feat table, graduation class filter, edition-dependent graduation handling |
| **Ability rule** | Unexceptional, Unremarkable | per world, GM-overridable | Ability score dice only (§ 5.3) |

Everything else — proficiency curve, hit points, XP table, feature list — is **identical across both editions**. Only the three edition fields differ.

**On "Apt 393."** That's a table code identifying games run by one particular DM, not a rules descriptor. Their house rule is the Unremarkable ability scale, which is now simply an option available to any table on either edition. It does not need its own class item. Worth one line in the GM guide so that table knows which switch is theirs.

### 2.5.1 Why class items for edition, a setting for the ability rule

**Edition is per character.** A table can run a '14 Child and a '24 Child side by side, and a player picks theirs from the compendium browser like any other class, with no GM configuration step.

**The ability rule is per world**, because it's a fairness question rather than a character choice — one child rolling `6+1d6` next to a sibling rolling `7+1d4` is an inconsistency at the table, not a build option. Default it world-wide, and allow a GM to override it on a specific actor for the odd case.

This supersedes the `rulesVersion`, `abilityScale`, and `childApt393` concepts from earlier drafts. Delete them.

### 2.5.2 Architecture: two small registries

**Do not fork the code.** Both editions run identical logic and differ only in data, and the ability rules are a second, orthogonal lookup.

```js
// src/variants/child14.mjs — base edition, fully specified
export default {
  id: "child14",
  label: "CHILDCLASS.Variant.Child14",
  rules: "2014",
  profByLevel: [1, 1, 2, 2, 2],     // index = childLevel - 1; same for both editions
  hpFirst: 6,
  hpPerLevel: 1,
  xpTable: [0, 30, 75, 135, 210, 300],
  knackTable: /* … § 5.4 */,
  graduationClassFilter: "2014"
};

// src/variants/child24.mjs — expressed as a delta
export default {
  id: "child24",
  label: "CHILDCLASS.Variant.Child24",
  extends: "child14",
  rules: "2024",
  knackTable: /* … § 5.4, '24 table */,
  graduationClassFilter: "2024"
};

// src/ability-rules.mjs — orthogonal to edition
export const ABILITY_RULES = {
  unexceptional: {
    featureName: "CHILDCLASS.Feature.Unexceptional",
    base: "6 + 1d6",                // per ability, rolled independently
    growth: "1d6",                  // Growth die for the four unpicked abilities
    growthChoice: "2d6kh1"          // Growth die for the two abilities the player picks at 4th level
  },
  unremarkable: {
    featureName: "CHILDCLASS.Feature.Unremarkable",
    base: "7 + 1d4",
    growth: "1d4",
    growthChoice: "2d4kh1"
  }
};
```

**Support an `extends` key** that shallow-merges a variant over its base. `child24.mjs` above is the whole point: reading that file tells you the complete list of edition differences at a glance. Resolve inheritance once at load; don't walk the chain at call sites.

Register editions in a `CHILD_VARIANTS` map keyed by identifier. Every subsystem reads its numbers from the resolved edition or the resolved ability rule. **No subsystem should contain a literal `1d6`, a literal `2014`, or an `if (variant === …)` branch.** If you find yourself writing that branch, the difference belongs in one of the two registries instead.

Adding a future edition should mean one file and one compendium entry. Adding a future ability scale should mean one entry in `ABILITY_RULES` and nothing else.

### 2.5.3 Resolving the active variant

```js
function getChildVariant(actor) {
  const cls = actor.items.find(i => i.type === "class"
    && i.identifier in CHILD_VARIANTS);
  return cls ? CHILD_VARIANTS[cls.identifier] : null;
}

function getAbilityRule(actor) {
  const override = actor.getFlag("child-class", "abilityRule");
  return ABILITY_RULES[override ?? game.settings.get("child-class", "abilityRule")];
}
```

Cache both per actor per prepare cycle; these are called from hot paths.

### 2.5.4 What actually differs between '14 and '24

Beyond the feat table, these are real mechanical divergences that graduation must handle. **Verify each against the 2024 PHB before implementing** — this list is from memory and 2024 content is not fully SRD:

- **Subclass timing.** In 2014, Cleric, Sorcerer, and Warlock choose a subclass at level 1. In 2024, *all* classes choose at level 3. A '14 Child graduating into Cleric at level 1 must immediately pick a Divine Domain; a '24 Child graduating into Cleric does not. The graduation flow must not assume one or the other.
- **Backgrounds grant an Origin feat.** In 2024, the background chosen at graduation grants a feat *and* a +3 ability score spread. The Child already carries a retained Knack feat, so a '24 graduate lands with two feats and an ASI bump. Flag this in the GM guide — it may be intended, but it should be a deliberate choice rather than a surprise.
- **Feat categories.** 2024 sorts feats into Origin / General / Fighting Style / Epic Boon, with General feats gated at level 4+. The Knack grants a feat at Child level 2 and explicitly ignores prerequisites, so this mostly doesn't bind — but the '24 Knack table should prefer Origin feats where a sensible equivalent exists.
- **Fighting styles are feats in 2024**, which is why the '24 Monk Knack grants Blind Fighting directly rather than routing through Fighting Initiate (§ 5.4).
- **Weapon mastery** exists in 2024 and interacts with the Trade Skill weapon proficiency.
- **Species, not race**, and ability score increases moved off it.

Set `system.source.rules` correctly on each class item so the dnd5e system's own edition-dependent behaviour (exhaustion, Jack of All Trades, and so on) matches the variant.



## 3. Environment & verification pass (do this first)

My knowledge of `dnd5e` internals may be stale. **Before writing implementation code, verify the following against the installed system source and the wiki**, and record findings in `docs/api-notes.md`.

> **Status:** verification pass complete against dnd5e 5.3.3 and closed. See `docs/api-notes.md` for findings; the three items originally deferred for live-Foundry verification were all resolved during implementation and are marked as such in the API notes.

| Thing to verify | Where to look |
|---|---|
| Advancement data is stored as an **object**, not an array (breaking change in dnd5e 5.3, issue #6226) | `module/documents/advancement/`, item data models |
| Custom advancement registration path — `CONFIG.DND5E.advancementTypes` | `module/config.mjs` |
| Whether advancements on **non-class Feature items** fire on class level change | `ItemGrant`/`Trait` advancement, `Actor5e#_onAdvancement` or equivalent |
| Whether an ActiveEffect can override `system.attributes.hp.max` and `system.attributes.prof` (and at which prepare phase) | `Actor5e#prepareDerivedData`, `#prepareBaseData` |
| Class item required fields — is `system.hitDice` nullable or must it be `d4`–`d12`? | `module/data/item/class.mjs` |
| Hook names for advancement completion and class level change | dnd5e wiki, `module/documents/actor/actor.mjs` |
| Compendium pack build tooling — `@foundryvtt/foundryvtt-cli`, LevelDB pack format | Foundry CLI docs |

The dnd5e wiki (https://github.com/foundryvtt/dnd5e/wiki) is the authoritative reference. **If an approach below turns out to be unsupported, stop and report rather than inventing a workaround.**

**On libWrapper:** libWrapper is a **required** dependency, driven by § 5.10 (XP thresholds). AE OVERRIDE alone cannot reach `xp.pct`'s denominator, so a MIXED-mode wrap on `Actor5e.prototype.getLevelExp` is the only clean path. Plutonium already forces libWrapper into the world, so this adds no runtime cost — only a manifest declaration. Prof override (§ 5.2) and HP override (§ 5.1) remain AE-based per verification Q4; libWrapper is only invoked for XP. Raw prototype patching is still forbidden.

---

## 4. Module structure

```
child-class/
├── module.json
├── src/
│   ├── module.mjs                 # entry point, hook registration
│   ├── config.mjs                 # constants, shared tables
│   ├── variants/
│   │   ├── index.mjs              # CHILD_VARIANTS registry + getChildVariant
│   │   ├── child14.mjs
│   │   ├── child24.mjs
│   ├── settings.mjs               # world settings (§ 9)
│   ├── hp.mjs                     # § 5.1 HP override
│   ├── proficiency.mjs            # § 5.2 prof bonus override
│   ├── ability-rules.mjs          # § 5.3 ABILITY_RULES registry
│   ├── ability-gen.mjs            # § 5.3 roll + apply flow
│   ├── growth.mjs                 # § 5.7 level-4 Growth
│   ├── knack.mjs                  # § 5.4 knack flag + downstream grants
│   ├── graduation/
│   │   ├── detect.mjs             # intercept level 6
│   │   ├── dialog.mjs             # ApplicationV2 graduation UI
│   │   ├── execute.mjs            # the transformation
│   │   ├── snapshot.mjs           # pre-graduation state capture
│   │   └── undo.mjs               # restore from snapshot
│   ├── feat-resolver.mjs          # § 7
│   └── apps/
│       └── ...                    # any additional ApplicationV2 sheets
├── packs-src/                     # source JSON, committed
│   ├── child-class/
│   ├── child-features/
│   ├── child-knacks/
│   └── child-rules/
├── packs/                         # built LevelDB, gitignored
├── templates/
├── lang/en.json
├── styles/
├── build/
│   └── pack.mjs                   # foundryvtt-cli pack/unpack script
└── docs/
    ├── api-notes.md
    └── gm-guide.md
```

### 4.1 `module.json` essentials

```jsonc
{
  "id": "child-class",
  "compatibility": { "minimum": "13", "verified": "14" },
  "relationships": {
    "systems": [{
      "id": "dnd5e",
      "type": "system",
      "compatibility": { "minimum": "5.3.0", "verified": "5.3.3" }
    }],
    "requires": [{
      "id": "lib-wrapper",
      "type": "module",
      "compatibility": { "minimum": "1.13.0" }
    }]
  },
  "packs": [
    { "name": "child-class",    "type": "Item",         "system": "dnd5e" },
    { "name": "child-features", "type": "Item",         "system": "dnd5e" },
    { "name": "child-knacks",   "type": "Item",         "system": "dnd5e" },
    { "name": "child-rules",    "type": "JournalEntry", "system": "dnd5e" }
  ]
}
```

Pin the dnd5e minimum at 5.3.0 because of the advancement-storage breaking change. Do not attempt to support 5.2.x. libWrapper is required (see § 3, § 5.10) — Plutonium already forces it into the world so declaring the dependency has no user-visible cost.

---

## 5. Class features — implementation

### 5.0 The Child class items

Two `class` Items with identifiers `child14` and `child24`. Everything below applies to both unless noted; numbers come from the edition definition or the active ability rule (§ 2.5.2).

**Authoring:** generate both compendium entries from the variant definitions at build time via `build/pack.mjs`, rather than hand-maintaining two near-identical JSON files. Hand-maintained duplicates drift.

**Base data:**
- Armor proficiencies: none
- Weapon proficiencies: dagger, plus **one simple weapon of the player's choice** (a `Trait` advancement with a choice at level 1)
- Tool proficiencies: none
- Saving throws: none
- Skills: none
- Languages: **none from the class** — see below
- Starting equipment: dagger, commoner's clothes, one keepsake (module-provided item; flavour, no mechanics)

**Languages.** The class grants none and needs no language step at character creation. Languages come from species, as they do for every other character — a child speaks Common or whatever their parents speak because of who their parents are, not because of their class. Do not add a `Trait` advancement for languages, and do not intercept or modify the species language grant. Trade Skill at level 5 may add one (§ 5.8); that is the class's only involvement with languages.

**Hit dice problem:** the class has no hit die. Per verification Q5, `system.hd.denomination` is non-nullable and must match `/d\d+/`, so set it to `"d4"` as a structural placeholder and **do not attach a `HitPoints` advancement** — HP is fully handled by § 5.1. The Trade Skill gold roll (§ 5.8) uses the *Knack class's* hit die, not this one, so nothing else reads this field.

**Side effect to suppress.** With the placeholder in place, the class would contribute N `d4` entries to the actor's short-rest hit-dice pool at level N — visually wrong, and spendable for healing on a short rest. Suppress by setting `system.hd.additional` to a formula that cancels the pool contribution (`"-@item.system.levels"` is the intended shape; the exact roll-data scope is api-notes Q5 unresolved and must be verified against a live Foundry before shipping — the alternative `"-@levels"` may be the correct form). Whichever form works, `class.system.hd.max` should post-prepare to 0. If neither form works, add a sheet CSS rule that hides the hit-dice row on Child items so a GM can't accidentally click a `d4` — degraded but shippable — and file the underlying formula question.

### 5.1 Hit points

**Rule:** Level 1 = `6 + CON mod`. Each subsequent Child level adds `1 + CON mod`.
So max HP = `6 + (childLevel - 1) + (childLevel × CON mod)`.

**Preferred approach:** an ActiveEffect on the Child class item overriding `system.attributes.hp.max` in `override` mode. The formula references that edition's own identifier — `@classes.child14.levels` or `@classes.child24.levels` — so generate the AE per edition at build time from `hpFirst` / `hpPerLevel`. Do not try to write one formula covering both; roll data keys are identifier-specific. HP is unaffected by the ability rule.

**Verify:** that `hp.max` accepts an AE override at the right prepare phase and that it survives CON changes mid-session. If it does not, fall back to a `dnd5e.prepareDerivedData`-adjacent hook (or a registered custom `Advancement` subclass extending the system's `HitPointsAdvancement` with an overridden formula) — **not** libWrapper monkey-patching unless there is no alternative.

The effect must be attached to the class item so that deleting the class on graduation removes the override automatically.

**Edge cases:**
- Negative CON mod: HP floor at 1. Do not allow 0 or negative max HP.
- Current HP when max drops (e.g. CON damage): clamp, don't wrap.
- On graduation the override disappears and the new class's real hit dice take over. Recompute max HP as part of § 6.

### 5.2 Proficiency bonus

**Rule:** +1 at Child levels 1–2, +2 at levels 3–5. Identical across both editions and both ability rules; read from `profByLevel` rather than hardcoded so a future variant could diverge without a code change.

Standard 5e gives +2 at character levels 1–4, so only levels 1–2 actually deviate. Implement as an override on `system.attributes.prof` applied only when the actor's sole class is `child14` or `child24`. **Verify** whether an AE reaches `prof` before it is consumed by skill/save/attack derivation; if not, a prepare-phase hook is required.

**Acceptance test:** a level-1 Child's dagger attack bonus, passive perception, and save DCs all reflect +1, not +2.

### 5.3 Ability score generation

Two named rules. **Which applies is a world setting (§ 9), GM-overridable per actor — it is not tied to edition.** Both editions can use either.

| Rule | Base score (level 1) | Growth die (4 unpicked) | Growth die (2 chosen, § 5.7) | Range at level 5 |
|---|---|---|---|---|
| **Unexceptional** (default) | `6 + 1d6` → 7–12 | `1d6` | `2d6kh1` | 8–18 |
| **Unremarkable** | `7 + 1d4` → 8–11 | `1d4` | `2d4kh1` | 9–15 |

Each of the six abilities is rolled independently.

**Unexceptional** is the default: wide, swingy, and capable of producing a genuinely hopeless child.

**Unremarkable** is the same mechanism with tighter dice — it raises the floor and lowers the ceiling. A child under Unremarkable is never crippled and never gifted, which is the point: *unremarkable*, not *unlucky*. This is the Apt 393 table's house rule.

**Cap.** The standard D&D maximum of 20 applies. Clamp on write in both ability generation and Growth. Neither rule can reach it during childhood — Unexceptional tops out at 18, Unremarkable at 15 — so this is a guard rather than a live constraint, but it should be enforced rather than assumed.

> **Note on the earlier Unremarkable rule.** A previous draft described Unremarkable as a point-buy-style rule — all scores fixed at 6, +1 to every score per Child level. That rule came from a different underlying system and does not fit here. **It is removed entirely.** Nothing in the module should implement fixed-6 scores or an automatic per-level increase to all abilities. If any of that survives into the code, it's a bug.

Both rules are the same code path with different dice, drawn from `ABILITY_RULES` (§ 2.5.2). The only non-numeric difference is the **feature name shown on the sheet**, carried as `featureName` on the rule.

**Implementation:** a "Roll Child Ability Scores" action, exposed both as a macro in the module compendium and as a button on the Child class item sheet in edit mode. It:
1. Rolls each of the six scores using the active rule's `base`.
2. Shows the results in a chat card with the individual dice visible, labelled with the rule's feature name.
3. Writes to `system.abilities.<abbr>.value` **only on confirmation**, never silently.
4. Refuses to run if the actor already has a `flags.child-class.scoresRolled` timestamp, unless the GM explicitly re-rolls (with a confirm dialog).

**Changing the world setting mid-campaign must not retroactively alter existing characters.** Record which rule an actor was generated under in `flags.child-class.abilityRule` at roll time, and read *that* for Growth at level 4 rather than re-reading the setting. A child who rolled under Unexceptional grows on `1d6` even if the table later switches.

### 5.4 The Knack (level 2)

**Rule:** the player picks one of the 13 classes to aspire to and gains one of two bonus feats associated with it. Prerequisites are ignored.

**This choice is load-bearing.** It also determines the Mentor's Knowledge grants (level 3), the Trade Skill weapon/shield proficiency and gold roll (level 5), and whether Graduation starts the character at level 1 or 2. Design accordingly.

**Data model — recommended:** create a `feat`-type Item per class in the `child-knacks` pack, with `system.type.value === "class"` (i.e. the "Class Feature" sub-type, not a plain Feat). This is load-bearing: plain-Feat items short-circuit at `FeatData#advancementClassLinked`, and their own level-3/level-5 advancements will not fire on Child level change. The Knack must also be granted via an `ItemGrant` advancement on the Child class item so that `flags.dnd5e.advancementRoot` is auto-populated with the class item's id — this is what links the Knack's advancements back to the Child class for firing.

Each Knack item is named `Knack: Fighter`, `Knack: Wizard`, etc., and is a self-contained bundle carrying *all* of its class-specific downstream grants as advancements at their correct levels:

| Level | Advancement on the Knack item |
|---|---|
| 2 | `ItemChoice` — one of the two bonus feats for that class |
| 3 | `Trait` — one skill proficiency from that class's skill list |
| 3 | `Trait` — one saving throw proficiency from that class's list |
| 5 | `Trait` — one weapon or shield proficiency from that class's list |

The Child class item's level-2 advancement is a single `ItemChoice` pointing at the `child-knacks` pack. Picking a Knack item pulls in everything else automatically at the right levels.

**Always** write `flags.child-class.knack` on the actor when a Knack is chosen — graduation and Trade Skill both read it, and a flag is cheaper to read than walking the item list.

**Knack table.** Each edition carries its own `knackTable`, and its own set of 13 Knack items in the compendium (`Knack '14: Fighter`, `Knack '24: Fighter`, …). 26 items total, generated at build time from the edition definitions — do not hand-author them. The ability rule does not affect Knacks.

**Hit dice are identical across editions**, so store them once in a shared class table rather than duplicating them in both `knackTable`s. Trade Skill's gold roll (§ 5.8) is the only consumer.

#### '14 table

| Class | Hit Die | Feat A | Feat B |
|---|---|---|---|
| Barbarian | d12 | Charger | Grappler |
| Bard | d8 | Defensive Duelist | Actor |
| Cleric | d8 | Healer | Chef |
| Druid | d8 | Magic Initiate: Druid | Poisoner |
| Fighter | d10 | Tough | Fighting Initiate |
| Monk | d8 | Tavern Brawler | Martial Adept |
| Paladin | d10 | Inspiring Leader | Mounted Combatant |
| Ranger | d10 | Dungeon Delver | Keen Mind |
| Rogue | d8 | Skulker | Skill Expert ᵀᶜᴱ |
| Sorcerer | d6 | Magic Initiate: Sorcerer | Metamagic Adept ᵀᶜᴱ |
| Warlock | d8 | Magic Initiate: Warlock | Linguist |
| Wizard | d6 | Ritual Caster: Wizard | Elemental Adept |
| Artificer | d8 | Magic Initiate: Artificer ᵀᶜᴱ | Gunner ᵀᶜᴱ |

#### '24 table

| Class | Hit Die | Feat A | Feat B |
|---|---|---|---|
| Barbarian | d12 | Savage Attacker | Tough |
| Bard | d8 | Musician | Defensive Duelist |
| Cleric | d8 | Healer | Chef |
| Druid | d8 | Magic Initiate: Druid | Poisoner |
| Fighter | d10 | Durable | Piercer |
| Monk | d8 | Athlete | Blind Fighting |
| Paladin | d10 | Inspiring Leader | Mounted Combatant |
| Ranger | d10 | Skilled | Observant |
| Rogue | d8 | Skulker | Skill Expert ᵀᶜᴱ |
| Sorcerer | d6 | Elemental Adept | Metamagic Adept ᵀᶜᴱ |
| Warlock | d8 | Actor | Telepathic ᵀᶜᴱ |
| Wizard | d6 | Ritual Caster | Keen Mind |
| Artificer | d8 | Crafter | Gunner ᵀᶜᴱ |

ᵀᶜᴱ = sourced from *Tasha's Cauldron of Everything*. The resolver must honour that marking rather than assuming a same-named 2024 PHB entry (§ 7.3).

**Pre-selected sub-options.** Where the source fixes a choice inside a feat, the Knack item pre-applies it rather than re-prompting:

- Magic Initiate: Druid (both editions) — druidcraft, guidance; animal friendship
- Magic Initiate: Sorcerer ('14) — minor illusion, prestidigitation; sleep
- Magic Initiate: Warlock ('14) — mage hand, true strike; mage armor
- Magic Initiate: Artificer ('14) — mending; alarm; one tool proficiency of choice
- Ritual Caster: Wizard ('14) — detect magic, find familiar
- Martial Adept ('14) — Disarming Attack, Evasive Footwork
- Metamagic Adept (both editions) — Subtle Spell

**Notes on the '24 table:**

- **Fighting Initiate is resolved, not substituted.** In 2024 fighting styles are feats in their own right, so the Monk Knack simply grants **Blind Fighting** directly. No stand-in is needed. (The Fighter Knack moved to Durable / Piercer independently.)
- **Feats migrate between classes across editions.** Tough is Fighter in '14 and Barbarian in '24; Actor is Bard then Warlock; Keen Mind is Ranger then Wizard; Elemental Adept is Wizard then Sorcerer. The lookup key is therefore **(edition, class)**, never feat name alone, and the two tables must not be deduplicated against each other.

### 5.5 Youth (level 1)

**Rule:** once per long rest, during a short rest, the Child may heal **half their maximum hit points, rounded up**. Lost on graduation.

Implement as a Feature item with a `Utility` or `Heal` activity, uses = 1, recovery = long rest, healing formula = `ceil(@attributes.hp.max / 2)`.

Rounding up matters here more than it looks. A Child's max HP is small and often odd — 7 HP heals 4, not 3 — and at these totals a single point is a meaningful fraction of the pool.

### 5.6 Mentor's Knowledge (level 3)

**Rule:** gain one skill proficiency and one saving throw proficiency, both drawn from the Knack class's lists. Both are lost on graduation.

Delivered by the Knack item per § 5.4. The *feature description* lives in a `child-features` Feature item so it shows on the sheet; the actual grants come from the Knack.

**Critical:** tag the granted proficiencies so graduation can revoke exactly these and not proficiencies from any other source. Use `flags.child-class.grantedBy = "mentors-knowledge"` on the AE/trait, and record the exact trait keys in the graduation snapshot (§ 6.2) so removal is by recorded key rather than by re-derivation.

### 5.7 Growth (level 4)

**Rule:** at 4th level, pick two abilities; those two roll the active ability rule's `growthChoice` (2 dice, keep the higher) and add the result to the ability's *current* score. The other four abilities each roll `growth` (one die). All six increases are permanent. Die sizes come from the active ability rule — read from `flags.child-class.abilityRule` recorded at generation, not from the current world setting (§ 5.3).

Record the two picks at level 4 in `flags.child-class.growthChoice = ["str", "int"]` at the same time the Growth dialog fires. An earlier draft framed the pair as an optional "Unchained Potential" sub-feature gated by a world setting and locked at 1st level; both aspects have been reversed. The choice is always available and is made when Growth applies, so the player picks the two abilities that best fit the character they've spent five sessions playing.

Implement as a dialog on reaching level 4: pick the two chosen abilities, roll all six, show the dice in chat, apply on confirm. Same confirm-before-write discipline as § 5.3.

### 5.8 Trade Skill (level 5)

**Rule:** gain (a) a tool set or language proficiency of choice — **retained on graduation**; (b) a weapon or shield proficiency from the Knack class — **lost on graduation**; (c) **gold pieces** equal to two hit dice of the Knack class, rolled; (d) one item the character is proficient with.

Note the asymmetry in (a) vs (b) — the doc is explicit that only the weapon/shield proficiency is lost. Tag them separately (`grantedBy: "trade-skill-tool"` vs `"trade-skill-weapon"`).

For (c): roll `2d<knackHitDie>` and add to `system.currency.gp`. The denomination is gold pieces — a Fighter Knack rolls 2d10 gp, a Wizard Knack 2d6 gp.

For (d): a prompt with a compendium browser filtered to items the character is proficient with. If filtering proves impractical, fall back to an unfiltered browser with a warning line.

---

### 5.9 No background

**A Child has no background.** This is a defining feature of the class, not an oversight, and it holds for the entire five levels. The character hasn't lived enough life to have one yet — the background arrives at Graduation, as part of growing up, and is the first one the character has ever had.

This is easy to get wrong because every other 5e character has a background from creation, and the dnd5e character-creation flow assumes one.

**Implementation:**

- **Block background items.** A `preCreateItem` guard rejecting `type: "background"` on any actor holding a Child class, with a notification explaining why. Conversely, block adding a Child class to an actor that already has a background (that character isn't a child anymore).
- **Suppress the prompt.** Verify whether the system or the compendium browser prompts for a background during character creation, and suppress or intercept it. **Verify** how dnd5e 5.3 handles a character with no background item — whether the sheet renders cleanly, whether anything throws, and whether `system.details.background` needs an explicit empty value.
- **Sheet affordance.** Where the background would display, show something that reads as intentional — "None (Child)" or similar — rather than an empty slot that looks like an incomplete character.

**What the Child loses by having no background:** background skill proficiencies, the background feature, background equipment, and background languages. Species languages are unaffected (§ 5.0). This is consistent with the class granting no skills and no saving throws of its own — the Child is deliberately unformed, and Mentor's Knowledge at level 3 is the only skill proficiency they get.

**Species/race is unaffected.** A Child has a normal species. Only the background is withheld.

**This bites hardest under '24.** In the 2024 rules the background is where ability score increases and the Origin feat come from. A '24 Child therefore has *no* ASI source at all during childhood — which is exactly why the class rolls its own scores via Unexceptional and grows them via Growth. Worth stating in the journal so it doesn't read as a balance oversight. It also means the background granted at graduation lands with unusual weight for a '24 character (§ 6.4).

---

### 5.10 Experience progression

The Child runs on its own XP track. The whole five-level arc costs exactly what one RAW level-up costs — childhood is compressed into a single level's worth of experience, and graduation lands the character at the starting line everyone else began at.

**Default table (`xpScale: "raw-aligned"`):**

| Child level | XP to reach | Cumulative |
|---|---|---|
| 1 | — | 0 |
| 2 | 30 | 30 |
| 3 | 45 | 75 |
| 4 | 60 | 135 |
| 5 | 75 | 210 |
| Graduation | 90 | 300 |

Arithmetic, +15 per step. Level 1 is deliberately cheapest (an early death costs little) and level 5 deliberately longest (Trade Skill gets room, and graduation feels earned). The 300 total is chosen so that a Child graduating into their Knack class arrives at level 2 holding exactly the RAW level-2 threshold — no reconciliation with the standard track at all (§ 6.6).

**Alternative table (`xpScale: "compressed"`):** the same shape ÷3 — `0 / 10 / 25 / 45 / 70 / 100`. Rounder numbers, but see the award note below; this one does not work with unmodified awards.

Store both as `xpTable` arrays; `child24` inherits '14's unless overridden. A world setting selects the default for new Children.

**Implementation.** In dnd5e, `system.details.level` derives from summed class levels, not from XP; XP drives the sheet's progress display and the "you can level up" prompt. `xp.max`, `xp.min`, and `xp.pct` are all computed in `Actor5e#prepareBaseData` from a single `Actor5e#getLevelExp` call, so an AE OVERRIDE on `xp.max` reaches the field but leaves `xp.pct` computing its denominator against the un-overridden value. The implementation therefore uses libWrapper to wrap `Actor5e.prototype.getLevelExp` in MIXED mode, branching on the presence of a Child class item on the actor: when present, return the Child XP table's threshold for the requested level; otherwise call the wrapped original. `CONFIG.DND5E.CHARACTER_EXP_LEVELS` is never mutated — it stays global for every non-Child character. Clamp defensively for out-of-range levels (the Child table is length 6; a lookup at level 7+ should fall through to the RAW behaviour rather than throwing).

#### Encounter awards

**On the raw-aligned table, use standard XP awards unmodified.** Awards are divided among the party, and that division does all the scaling needed. For a party of four:

| Child level | XP each | Monster XP for the party | ≈ wolves (CR ¼, 50 XP) |
|---|---|---|---|
| 1 → 2 | 30 | 120 | 2.4 |
| 2 → 3 | 45 | 180 | 3.6 |
| 3 → 4 | 60 | 240 | 4.8 |
| 4 → 5 | 75 | 300 | 6 |
| 5 → graduation | 90 | 360 | 7.2 |
| **Total** | **300** | **1200** | **24** |

The useful framing for the GM guide: *the entire five-level childhood costs the same number of encounters a normal party spends going from level 1 to level 2* — roughly 6–8 fights, about one adventuring day's budget. Each Child level is one or two encounters. This falls out of the 300 total rather than needing tuning.

Two caveats worth a line in the guide:

- **Solo play runs fast.** A lone child receives undivided awards, so a solo prologue progresses about four times faster than a party of four. Scale awards down or run it on milestones.
- **The compressed table does need custom awards.** At 100 total, a party of four splitting a single CR ¼ creature gets 12.5 each against a 10-XP first level — one wolf is more than a level. If a table picks compressed, they should divide standard awards by about 3, or use milestones.

The source material already tells DMs they'll be custom-building encounters for younglings — a Child has 6–12 HP, +1 proficiency, and no armor, so the creatures involved will mostly be CR 0 to ⅛ regardless. That constrains encounter design, but it does not require touching the XP math.

---

## 6. Graduation

The central feature. Treat it as a destructive migration and build it with the same care.

### 6.1 Trigger

Graduation happens when a Child **completes level 5**. There is no level 6.

Intercept at two points:

1. **Preventive:** a `preUpdateItem` / `preCreateItem` guard that blocks any attempt to set Child `system.levels` above 5, and any attempt to add a second class item to an actor with Child levels (§ 8.4). Blocking must be accompanied by a UI notification explaining *why* — never a silent failure.
2. **Affirmative:** a **Graduate** button on the character sheet (or the Child class item sheet), enabled only at Child level 5. This is the intended path.

When a user tries to level from 5 to 6, catch it, cancel the update, and open the Graduation dialog instead.

### 6.2 Snapshot (do this before anything else)

Write a complete pre-graduation snapshot to `flags.child-class.preGraduation`:

- Full `actor.toObject()`, or at minimum: all six ability scores, current/max HP, currency, the full item list with IDs, all trait/proficiency arrays, and every AE.
- Timestamp and the acting user ID.

This exists so § 6.5 can undo a graduation. Do not skip it. Do not compress it lossily.

### 6.3 Dialog

An ApplicationV2 dialog presenting:

- **New class** — dropdown built from every `class`-type Item across enabled compendia, not a hardcoded list. Users have homebrew and premium classes. **Filter hard to classes matching the edition's `graduationClassFilter`** — a '14 Child graduates into 2014 classes only, a '24 Child into 2024 classes only. This is not a default with an override; cross-edition graduation is disallowed, because the Knack feats are edition-specific and a retained 2014 feat has no meaning on a 2024 chassis (§ 8.10). Exclude both Child editions from the list.
- **Starting level** — computed, read-only, with an explanation: **2 if the chosen class matches the recorded Knack, otherwise 1.** Matching is a plain identifier comparison within a single edition — no cross-edition normalization is needed, because the filter above makes that case unreachable.
- **Subclass** — if the target class chooses its subclass at or below the starting level, that choice happens here. This fires for '14 Cleric/Sorcerer/Warlock at level 1 and never for '24 classes (subclass at 3). Drive it off the class item's actual advancement data, not a hardcoded list.
- **Background** — selector. This is the character's **first ever** background (§ 5.9), so it isn't a swap, it's an acquisition. Present it as a real step in the flow, not an afterthought. Allow "choose later," but if deferred, leave the § 5.9 background guard lifted so it can be added afterwards.
- **Retention summary** — a plain-language list of exactly what is kept and what is lost, generated from actual actor state, not from static text. The player should be able to see "you will lose: proficiency in Stealth, proficiency in DEX saves, the Youth feature, your shortsword proficiency" before confirming.
- **XP handling** — per § 9.
- A confirmation step. This is irreversible from the player's perspective.

### 6.4 Execution

Order matters. Wrap in as few atomic document operations as possible; if a step fails, restore from snapshot and abort.

**Retained:**
- The Knack bonus feat (as a normal feat item, no longer tied to the Child). **It is a pure bonus** — it does not consume an ASI slot, a 2024 Origin feat slot, or any other resource, now or later. Do not deduct anything for it, and do not let the graduation flow mark any advancement as spent on its account.
- The Trade Skill tool/language proficiency
- All items and gold
- Ability scores, including all Growth increases

**Removed:**
- The Child class item (and with it the HP override AE and prof override)
- The **Youth** feature
- The **Mentor's Knowledge** feature *and* the skill proficiency and saving throw proficiency it granted
- The Trade Skill **weapon/shield** proficiency
- The Knack item itself (its job is done — but preserve `flags.child-class.knack` as historical record)

**Added:**
- The chosen class at level 1 or 2, with its full advancement chain run normally (this is what supplies real hit dice, saves, and skills). **A level-2 graduate receives both the level-1 and level-2 features** — they are an ordinary level-2 character of that class, not a level-2 character missing their first level. Run the advancement chain from level 0 to the target level, not just the final step.
- The chosen background, with its advancements. The § 5.9 guard must be lifted as part of the transformation — order the operations so the Child class is removed before the background is added, or the guard will reject its own graduation. **Under '24 this grants an Origin feat and a +3 ability score spread on top of the retained Knack feat** — and since the Child had no background at all, this is the character's first ASI and first origin feat arriving at once. Both feats are kept; the Knack feat is a pure bonus and does not displace the background's. Surface this in the dialog's retention summary so it's visible before confirming, not discovered after.

**Recomputed:**
- Max HP entirely from the new class. Set current HP to the new max (the character just spent downtime growing up; starting damaged makes no sense). Make this a setting if it's contentious.
- Proficiency bonus, back to standard.

Post-graduation, write `flags.child-class.graduated = { from: "child", childLevel: 5, knack, newClass, startingLevel, date }` and drop a chat card summarising the transformation.

### 6.5 Undo

A GM-only "Undo Graduation" option, available while `flags.child-class.preGraduation` exists, that restores the snapshot wholesale. Clear the snapshot after a configurable number of days (setting, default: never auto-clear).

### 6.6 XP

On the default raw-aligned table (§ 5.10) this is largely a non-problem, which is the point of choosing 300. A Child arrives at graduation holding exactly 300 XP — the RAW level-2 threshold — so a graduate entering their Knack class at level 2 needs no adjustment whatsoever.

Offer three modes in the dialog, defaulting to the world setting (§ 9):

- **Reset (default)** — set XP to the RAW minimum for the new level: 0 for level 1, 300 for level 2.
- **Carry** — keep the Child XP total. On raw-aligned this is *identical to reset* for a level-2 graduate, and leaves a level-1 graduate 300 XP ahead (immediately eligible to level, which may be intended as a reward for a non-Knack graduation, or may not — warn either way). On compressed it leaves a level-2 graduate 200 XP short of the party.
- **Milestone** — zero it out and don't track XP.

Show the resulting number in the dialog before confirming, alongside the RAW threshold for the target level so the comparison is visible. A player should not discover their XP situation after the fact.

Warn explicitly if the selected mode would leave the character immediately eligible to level up.

---

## 7. Feat resolution (Plutonium-aware)

The Knack feats are a mix of 2014 PHB, Tasha's, and 2024 PHB content. Some are SRD; most are not. **The module must never ship rules text for non-SRD feats** — it references what the GM already has installed.

### 7.1 The Plutonium constraint

This world runs **Plutonium**. That is the intended feat source, but it does *not* work like a normal content module:

- Plutonium **stopped shipping its content as a compendium module**. Its data lives inside the module itself, not in Foundry compendium packs.
- Consequently **there is nothing for a compendium scan to find.** A resolver that walks `game.packs` looking for "Grappler" will come back empty on a Plutonium-only install.
- Plutonium's own guidance is to import via the character sheet's import button or the charactermancer, not by pre-populating compendia, because imported content goes stale relative to the module's ongoing data fixes.
- Plutonium's internal importer matches existing entities **by name only** by default; the `Use Strict Entity Matching` setting (default off) switches it to name + source. Mirror that behaviour — name-first matching is the right default here too.

**Do not reverse-engineer Plutonium's internal API.** It is undocumented, libWrapper-heavy, and updates frequently. A module that hooks its internals will break on the next Plutonium release, probably mid-campaign.

### 7.2 Recommended approach: a one-time GM setup step

Ship a **setup workflow** rather than a runtime scraper.

`Child Class: Prepare Knack Feats` — a GM-only macro/dialog that:

1. Lists every required feat, **grouped by variant**, with current resolution status (found / missing / ambiguous). Only variants actually in use in the world need resolving, so let the GM filter to one variant — a '14-only table shouldn't be asked to import 2024 feats.
2. For missing ones, gives copy-pasteable instructions: import them via Plutonium into a **world compendium** (suggested: `Knack Feats '14`, `Knack Feats '24`), one time, at world setup. Separate compendia per edition keeps name collisions from resolving to the wrong edition — several feats share a name across 2014 and 2024 with different mechanics.
3. Re-scans and confirms.
4. Persists the resolved map in a world setting, **keyed by variant then feat name**, so lookups are a dictionary read.

This is a two-minute setup cost that buys stability. It also means the module works identically whether the GM's feats came from Plutonium, the official PHB module, the SRD, or hand-built homebrew — the module never needs to know which.

Also mention Plutonium's **`Use Advancement-Backing Compendium`** setting (default off) in the GM guide: when enabled, Plutonium copies imported features carrying advancement links into a compendium and references them from there, which produces exactly the kind of stable compendium entry this resolver wants. Worth suggesting, but don't require it — it changes behaviour for the whole world, not just this module.

### 7.3 `feat-resolver.mjs`

Resolution chain, in order:

1. **Cached map** — the world setting written by § 7.2, keyed by variant. Validate that the UUID still resolves; fall through if not.
2. **Compendium scan by name** across enabled packs. Prefer packs whose `system.source.rules` matches the edition's `rules`, and honour the ᵀᶜᴱ markings in § 5.4 by preferring a Tasha's source for those entries. If two candidates match and neither is preferred, treat it as *ambiguous* and report it rather than guessing.

   **Name collisions are the dominant failure mode, not an edge case.** Sixteen of the twenty-six feat names appear in *both* Knack tables — Tough, Defensive Duelist, Healer, Chef, Magic Initiate: Druid, Poisoner, Inspiring Leader, Mounted Combatant, Skulker, Skill Expert, Elemental Adept, Metamagic Adept, Actor, Keen Mind, Ritual Caster, Gunner — and several have materially different mechanics between editions. A resolver that matches on name alone will silently hand a '24 Child a 2014 feat most of the time. This is why § 7.2 insists on separate per-edition world compendia.
3. **Stub fallback** — a feat item carrying only the name, a link to the source page, and a visible note that the full text requires the feat to be imported. Never fabricate rules text. The stub must be structurally valid so nothing downstream throws.

Log unresolved feats once at startup, and surface a persistent (dismissible) GM warning rather than a console line nobody reads.

### 7.4 Feat naming

Each variant's `knackTable` holds its own feat names, so there is no cross-edition alias table to maintain — the '14 table names 2014 feats, the '24 table names 2024 feats. What each entry does need is the pre-selected sub-options where the source specifies them (Magic Initiate spell lists, Martial Adept manoeuvres, Metamagic choices), applied on grant rather than re-prompted.

Where a feat has no counterpart in the other edition, the tables simply name different feats — that is a content decision already made in § 5.4, not something the resolver should try to bridge. Never substitute across editions.

---

## 8. Guards and validation

1. **Level cap.** Child cannot exceed 5. Enforced in `preUpdate`.
2. **No Child multiclass in.** An actor with levels in any other class cannot take a Child level.
3. **No multiclass out.** An actor with Child levels cannot add a second class. Graduation is the only exit.
4. **Both directions notify.** Every block shows a `ui.notifications.warn` explaining the rule and pointing at graduation.
5. **Re-graduation.** An actor with `flags.child-class.graduated` cannot become a Child again without the GM clearing the flag.
6. **Knack required.** Graduation cannot proceed if `flags.child-class.knack` is unset (possible if a GM hand-built the actor). Prompt the GM to pick one retroactively.
7. **One edition per actor.** An actor may hold at most one of `child14` / `child24`. Not configurable — mixing them is incoherent, not a house rule.
8. **Knack must match edition.** A `Knack '24: Fighter` item cannot attach to a `child14` class. Validate on grant; this is the most likely silent-corruption path if the compendium browser isn't filtered properly.
9. **Optional world uniformity.** If `allowMixedEditions` is off, block creating a Child of an edition differing from the one already in use in the world.
10. **No cross-edition graduation.** A Child may only graduate into a class of its own edition. Enforce in the dialog's class filter *and* in the execution path, so a hand-crafted call can't bypass it. The Knack feats are edition-specific and do not carry across.
11. **No background while a Child.** Block `type: "background"` item creation on an actor holding a Child class, and block Child class creation on an actor that already has a background (§ 5.9). Both directions notify. The graduation flow lifts this guard by ordering class removal before background addition.

---

## 9. Settings (world scope, GM only)

| Setting | Type | Default | Notes |
|---|---|---|---|
| `abilityRule` | `"unexceptional"` \| `"unremarkable"` | `"unexceptional"` | Default ability dice for new Children (§ 5.3). GM may override per actor via `flags.child-class.abilityRule` |
| `knackFeatMap` | object | `{}` | Cache written by the § 7.2 setup workflow, keyed by variant. Hidden from the settings UI |
| `xpScale` | `"raw-aligned"` \| `"compressed"` | `"raw-aligned"` | Default Child XP table for new Children (§ 5.10). Variants may override |
| `xpOnGraduation` | `"reset"` \| `"carry"` \| `"milestone"` | `"reset"` | Dialog default (§ 6.6) |
| `healOnGraduation` | boolean | `true` | Full HP after graduating |
| `enforceMulticlassBlock` | boolean | `true` | Escape hatch for GMs who want to break the rules |
| `snapshotRetentionDays` | number | `0` (never clear) | Undo window |
| `allowMixedEditions` | boolean | `true` | Whether a world may contain both '14 and '24 Children. Off = enforce one edition per world |

Add a guard regardless of this setting: **a single actor may never hold more than one Child edition.** That's incoherent, not a house rule.

---

## 10. Content packs

- **`child-class`** — the two Child class Items (`child14`, `child24`), plus a class journal page per edition.
- **`child-features`** — Youth, The Knack, Mentor's Knowledge, Growth, Trade Skill, Graduation, plus **two ability-generation features: Unexceptional and Unremarkable**. Shared across both editions. The class grants whichever ability feature the active rule's `featureName` points at, resolved at creation.
- **`child-knacks`** — 26 items, 13 per edition, named `Knack '14: Fighter` etc. Each Knack Item must carry `system.type.value === "class"` (see § 5.4).
- **`child-rules`** — JournalEntry with the class writeup, a variant comparison page, a **prominent note that the Child has no background** (§ 5.9) since this is the rule most likely to be missed at the table, the XP progression table plus the pacing note from § 5.10 (standard awards used unmodified; the whole arc runs about as long as a normal party's climb from level 1 to 2), a GM guide covering graduation and its irreversibility, and the interpretation notes from § 12.

Author packs as JSON under `packs-src/`, build to LevelDB with `@foundryvtt/foundryvtt-cli` via `build/pack.mjs`. Commit the JSON; gitignore `packs/`. Use stable, hand-assigned `_id`s so re-builds don't orphan references.

---

## 11. Testing

**Manual test matrix** (document results in `docs/testing.md`):

1. Create a Child, roll scores, verify HP = `6 + CON mod` and prof = +1.
2. Level to 2, pick each of the 13 Knacks in turn on scratch actors; verify the correct feat options appear and the correct one is granted.
3. Level to 3; verify skill and save proficiencies match the Knack class's lists.
4. Level to 4; the Growth dialog prompts for the two chosen abilities, then rolls all six. Verify the two chosen use the variant's `growthChoice` (2 dice, keep higher) and the other four use `growth`.
5. Level to 5; verify tool/language choice, weapon/shield choice, gold roll uses the *Knack* hit die, item grant. Also confirm `class.system.hd.max === 0` (the placeholder `d4` pool is suppressed per § 5.0) and no hit dice appear as spendable on the short-rest UI.
6. Attempt to level to 6 → blocked, graduation dialog opens.
7. Graduate into the **same** class as the Knack → starts at level 2 holding **both** the level-1 and level-2 features, indistinguishable from a normally-built level-2 character of that class.
8. Graduate into a **different** class → starts at level 1.
9. Verify post-graduation: feat retained, tool proficiency retained, gold and items retained, ability scores retained; Youth gone, Mentor's Knowledge skill + save gone, weapon/shield proficiency gone, hit dice replaced, prof bonus normal.
10. Undo graduation → actor byte-identical to snapshot.
11. Negative CON modifier: HP never drops below 1.
12. Run with the SRD only, **no feats imported** → stub feats appear, nothing throws, GM warning surfaces.
13. Run the § 7.2 setup workflow against a Plutonium install → all 26 feats resolve, map persists across a world reload.
14. Confirm no fixed-6 ability generation and no per-level all-ability increase exists anywhere in the codebase (§ 5.3 note) — the removed rule should leave no trace.
15. Run both ability rules end to end on each edition: Unexceptional scores 7–12 at level 1 and 8–18 at level 5; Unremarkable scores 8–11 and 9–15.
16. Growth pair: confirm the picks recorded in `flags.child-class.growthChoice` use the variant's `growthChoice` die formula and the other four abilities use `growth`. There is no world setting to gate the pair on — it is always available.
17. Attempt to multiclass in both directions → blocked with a clear message.
18. **Edition isolation:** a '14 and a '24 Child in one party; verify Knack lists and graduation filters stay independent and neither leaks into the other.
19. Attempt to add a second Child edition to one actor → blocked.
20. Graduate a '14 Child into Cleric at level 1 → prompted for a Divine Domain. Graduate a '24 Child into Cleric at level 1 → not prompted.
21. Graduate a '24 Child → confirm the background's Origin feat and ASI spread land, and that the retention summary warned about them beforehand.
22. **Cross-edition graduation is blocked:** a '14 Child's graduation dialog offers no 2024 classes, and a direct call to the execution path with a 2024 class is rejected. Same in reverse.
22b. **Languages:** a new Child's languages come entirely from species and match what the same species would grant a non-Child character. The class adds no language step at creation.
22c. **Ability cap:** clamping at 20 fires correctly if a homebrew rule with larger dice would exceed it; neither shipped rule reaches it.
22d. **Youth healing:** a Child with 7 max HP heals 4, not 3. Confirm rounding up at several odd and even totals.
22f. **Edition-correct feats:** for each of the sixteen names shared between the two Knack tables, confirm a '14 Child receives the 2014 feat and a '24 Child the 2024 one. This is the single highest-value test in the matrix.
22g. **Cross-table integrity:** confirm Tough resolves to the Barbarian Knack under '24 and the Fighter Knack under '14, and likewise for Actor, Keen Mind, and Elemental Adept.
22e. **Feat is pure bonus:** after graduation, confirm no ASI slot is marked spent, and under '24 confirm the character holds both the Knack feat and the background's Origin feat.
22h. **Sub-type correctness.** Confirm every shipped Knack item has `system.type.value === "class"`, and that a level-3 Child holding any Knack has been granted that Knack's level-3 skill and save proficiencies automatically. A regression here is silent — the sheet just quietly lacks the grants.
23. **No background:** create a Child, verify no background is present, the sheet renders cleanly with no errors, and nothing downstream (skills, equipment, sheet tabs) breaks on its absence.
24. Attempt to drag a background onto a Child → blocked with a clear message. Attempt to add a Child class to a character who already has a background → blocked.
25. Graduate → background selector appears, background applies successfully, guard no longer fires.
26. Graduate with "choose later" → guard is lifted and a background can be added afterwards.
27. A '24 Child at level 5: confirm ability scores come only from Unexceptional + Growth, with no background ASI anywhere.
28. **Edition inheritance:** confirm `child24` resolves `profByLevel`, `hpFirst`, and `xpTable` from `child14`, and overrides only `rules`, `knackTable`, and `graduationClassFilter`.
28b. **Axis independence:** set the world ability rule to Unremarkable and confirm it applies identically to a '14 and a '24 Child, and that changing it does not disturb Knacks, HP, prof, or XP.
28c. **Per-actor override:** GM sets `flags.child-class.abilityRule` on one actor; confirm it wins over the world setting and no other actor is affected.
29. **XP track:** a Child's sheet shows the § 5.10 thresholds (30/75/135/210/300 raw-aligned), not the RAW ones. A non-Child character in the same world shows RAW thresholds, unchanged.
30. Confirm `CONFIG.DND5E.CHARACTER_EXP_LEVELS` is never mutated — check it's untouched after a Child is created and after one graduates.
30b. **libWrapper wrap present.** Confirm the module registers exactly one libWrapper wrap on `Actor5e.prototype.getLevelExp` at MIXED mode, and that unregistering it (module disable) restores stock behaviour with no residue on any actor.
31. Graduate on each XP mode: reset → 0 or 300 by level; carry → Child total preserved; milestone → 0. Verify the dialog previewed the correct number beforehand.
32. Raw-aligned, graduating into the Knack class at level 2: confirm reset and carry both yield 300 and the character is *not* flagged as immediately eligible to level.
33. Raw-aligned, graduating into a non-Knack class at level 1 on carry: confirm the immediate-level-eligibility warning fires.

**Automated:** at minimum, unit tests for the HP formula, both ability rules' base and Growth dice, prof formula, graduation starting-level logic (including cross-edition identifier normalization), and feat resolver fallback and ambiguity detection. These are pure functions; keep them pure and test them directly.

---

## 12. Open questions

### Open

**None.** Every rules question raised during design has been answered; both editions are fully specified.

What remains are implementation unknowns about `dnd5e` internals, marked **Verify** inline rather than listed here — chiefly whether ActiveEffects reach `hp.max` and `prof` at the right prepare phase (§ 5.1, § 5.2), whether advancements on granted Feature items fire on class-level change (§ 5.4), how the sheet handles an actor with no background (§ 5.9), and the XP derivation path (§ 5.10). Resolve these in step 1 of § 13 and record findings in `docs/api-notes.md`.

### Closed

- **A.** ~~Apt393's base edition~~ — moot; Apt393 is no longer a class (§ 2.5).
- **B. The '24 Knack table.** Supplied in full (§ 5.4). Fighting Initiate needed no substitute — 2024 makes fighting styles feats, so the Monk Knack grants Blind Fighting directly.
- **C. Youth healing.** Half of *maximum* HP, **rounded up** (§ 5.5).
- **D. Trade Skill gold.** Gold pieces. A Fighter Knack rolls 2d10 gp (§ 5.8).
- **E. Graduation at level 2.** **Both** the level-1 and level-2 features — an ordinary level-2 character (§ 6.4).
- **F.** ~~Ability score cap~~ — merged into K.
- **G. Level 1 weapon proficiency.** Dagger plus one simple weapon of the **player's choice** (§ 5.0).
- **H. Retained feat and ASIs.** The Knack feat is a **pure bonus**. It consumes no ASI slot, no 2024 Origin feat slot, and no other resource. A '24 graduate legitimately holds two feats (§ 6.4).
- **I. Keepsake.** Pure flavour, no mechanics.
- **J.** ~~Knack table by edition~~ — folded into B.
- **K. Ability cap.** The standard D&D cap of 20 applies and is enforced on write (§ 5.3). Neither shipped rule can reach it — Unexceptional caps at 18, Unremarkable at 15 — so it functions as a guard.
- **L. Cross-edition graduation.** **Disallowed.** A Child graduates only into a class of its own edition. The Knack feats are edition-specific and don't carry across, so a retained 2014 feat on a 2024 chassis is incoherent. Enforced in both the dialog filter and the execution path (§ 8.10); no override.
- **M. Proficiency curve.** +1/+1/+2/+2/+2, identical across both editions and both ability rules. Lives on the base edition definition; `child24` inherits it.
- **N. Languages.** Handled by species, not the class. A child speaks Common or their parents' tongue because of their species and upbringing; character creation needs nothing from the Child class to establish it. The class grants no languages and adds no creation step (§ 5.0). Trade Skill may add one at level 5.
- **O. Graduation background restrictions.** None built in; any background is selectable. Individual GMs may restrict at the table.
- **P. XP progression.** Identical across both editions — raw-aligned, `0 / 30 / 75 / 135 / 210 / 300`. `child24` inherits `xpTable`.

## 13. Implementation order

**Build '14 + Unexceptional end to end first, then add the second edition and the second ability rule as pure data.** If adding Child '24 requires touching anything outside `src/variants/` and the compendium build, or adding Unremarkable requires touching anything outside `ABILITY_RULES`, the abstraction has failed and should be fixed before proceeding — that's the checkpoint this ordering exists to create.

1. Verification pass (§ 3) → `docs/api-notes.md`. **Report back before proceeding.** *(Complete for dnd5e 5.3.3 as of 2026-08-18; all three previously-flagged live-Foundry items resolved during implementation.)*
2. Module scaffolding, `module.json`, pack build pipeline, settings.
3. Variant registry and `ABILITY_RULES` (§ 2.5.2), with `child14` and `unexceptional` defined and the others stubbed. Build-time generation of class items from variant definitions.
4. HP override (§ 5.1) and proficiency override (§ 5.2) — the two riskiest system integrations. Prove these work before building anything on top of them.
5. Feat resolver (§ 7.3) + setup workflow (§ 7.2), then the 13 '14 Knack items.
6. Ability generation (§ 5.3) and Growth (§ 5.7).
7. Trade Skill (§ 5.8), Youth (§ 5.5), XP track (§ 5.10 — libWrapper wrap on `Actor5e.prototype.getLevelExp`, MIXED mode).
8. Guards (§ 8), including the one-variant-per-actor rule and the background block (§ 5.9).
9. Graduation: snapshot → dialog → execute → undo, in that order.
10. **Checkpoint:** '14 passes its test matrix.
11. Add the second ability rule (`unremarkable`) — should be one entry in `ABILITY_RULES` plus its feature item. If it touches anything else, the axis separation has failed.
12. Add `child24` — one variant file plus generated packs, plus the graduation edition-handling in § 2.5.4. Fully specified; no blockers.
13. Full test matrix (§ 11), variant comparison journal page, GM guide, release.

Steps 4 and 9 are where this project will actually succeed or fail. Steps 11 and 12 are where you find out whether the two-axis abstraction was real. Budget accordingly, and surface problems early rather than routing around them.
