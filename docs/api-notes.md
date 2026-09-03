# dnd5e API verification pass

Target: Foundry v13/v14, dnd5e 5.3.0+ (verified against `release-5.3.3`, the latest
5.3.x tag as of 2026-08-18). Compiled from public GitHub sources, the Foundry API
documentation, the Foundry Community Wiki, and the foundryvtt-cli README.

All dnd5e file paths in this report are relative to the repository root of
[foundryvtt/dnd5e](https://github.com/foundryvtt/dnd5e) at tag `release-5.3.3`.
Direct-link raw URLs are of the form
`https://raw.githubusercontent.com/foundryvtt/dnd5e/release-5.3.3/<path>`.

## Q1 - Advancement storage shape

**Finding.** In dnd5e 5.3.x, `system.advancement` on any item that uses the
`AdvancementTemplate` mixin (class, subclass, background, race, feat) is stored
as an **object keyed by advancement `_id`**, not an array. The migration from
the pre-5.3 array shape lives in `AdvancementTemplate.#migrateStorage` and is
invoked from every consumer's `_migrateData`. At runtime the field is wrapped
in an `AdvancementCollection` (a `Collection` subclass) so `.get(id)`, `.has(id)`,
and `.size` are the canonical accessors; iteration via `for...of` yields
Advancement instances. The class item still exposes `this.system.advancement`
as this collection - not the underlying object - so downstream code walks it
with `.byId`, `.byType`, and `.byLevel` (populated in `Item5e#_prepareAdvancement`).
The item flags a source that still has an array via `_needsAdvancementMigration`
in `Item5e#_initializeSource` so pending pre-5.3 packs surface a migration
prompt. This is the change tracked as issue #6226.

**Evidence.**

- `module/data/item/templates/advancement.mjs` (the mixin used by class, background,
  feat, race, subclass):

  ```javascript
  export default class AdvancementTemplate extends SystemDataModel {
    static defineSchema() {
      return {
        advancement: new AdvancementCollectionField({ label: "DND5E.AdvancementTitle" })
      };
    }
    // ...
    static #migrateStorage(source) {
      if ( Array.isArray(source.advancement) ) {
        source.advancement = source.advancement.reduce((obj, advancement) => {
          obj[advancement._id] = advancement;
          return obj;
        }, {});
      }
    }
  }
  ```

- `module/data/fields/advancement-collection-field.mjs`:

  ```javascript
  export default class AdvancementCollectionField extends MappingField {
    constructor(options) { super(new AdvancementField(), options); }
    initialize(value, model, options) {
      ...
      const advancement = Object.values(super.initialize(value, model, options));
      return new AdvancementCollection(model, advancement);
    }
  }
  ```

- `module/data/fields/mapping-field.mjs` shows `MappingField extends foundry.data.fields.TypedObjectField`
  - the underlying storage is a plain object of `{ [id]: <advancement source> }`.

- `module/documents/item.mjs` line 127:

  ```javascript
  Object.defineProperty(this, "_needsAdvancementMigration",
    { value: Array.isArray(data.system?.advancement) });
  ```

  confirms 5.3 detects and flags legacy array-shaped source data.

- Issue tracker: [foundryvtt/dnd5e#6226](https://github.com/foundryvtt/dnd5e/issues/6226)
  ("Migrate advancement data storage from array to object to match activities").

**Implication.** The design doc's assumption in section 5.4 is correct: JSON
sources committed to `packs-src/*.json` must use the object-keyed shape
(`system.advancement: { "abc123...": {...} }`), and any code that walks
advancements should iterate `item.system.advancement` (the collection) or use
`item.advancement.byLevel[n]`, not `Array.prototype.map`.

## Q2 - Custom advancement registration

**Finding.** Advancement types are registered by mutating
`CONFIG.DND5E.advancementTypes` - a plain object keyed by type name whose
values are `{ documentClass, validItemTypes }`. It is populated at load time
in `module/config.mjs` and is not frozen, so a module can add entries during
its own `init` hook (after the dnd5e system has loaded config.mjs but before
any items are prepared). The consumers - `Item5e#createAdvancement`,
`AdvancementTemplate#preCreateAdvancement`, and `Advancement.availableForItem` -
look up entries by type at call time, so late registration works. The
minimum interface for a custom subclass is:

- Extend `dnd5e.documents.advancement.Advancement` (default export of
  `module/documents/advancement/advancement.mjs`).
- Provide `static get metadata()` returning at minimum
  `{ name, label, order, icon, typeIcon, title, hint, multiLevel, validItemTypes,
  apps: { config, flow }, dataModels: { configuration, value } }`. `apps.config`
  must extend `AdvancementConfig` (or its v2 variant); `apps.flow` must extend
  `AdvancementFlow` or the v2 flow.
- Override `apply(level, data, options)` and `reverse(level, options)`
  (both async); `restore(level, data, options)` is optional and defaults to
  a re-apply. The constructor signature is
  `constructor(data, { parent=null, ...options } = {})` where `parent` is
  either the containing `Item5e` or its system data.

**Evidence.**

- `module/config.mjs` line 4451 (the registration table):

  ```javascript
  DND5E.advancementTypes = {
    AbilityScoreImprovement: {
      documentClass: advancement.AbilityScoreImprovementAdvancement,
      validItemTypes: new Set(["background", "class", "race", "feat"])
    },
    HitPoints: { documentClass: advancement.HitPointsAdvancement,
                 validItemTypes: new Set(["class"]) },
    ItemGrant: { documentClass: advancement.ItemGrantAdvancement,
                 validItemTypes: new Set(_ALL_ITEM_TYPES) },
    // ...
  };
  ```

  The object is created with `=`, not `Object.freeze`, so extending it is
  allowed.

- `module/documents/advancement/advancement.mjs` metadata block:

  ```javascript
  static get metadata() {
    return {
      name: "Advancement",
      label: "DOCUMENT.DND5E.Advancement",
      order: 100,
      icon: "icons/svg/upgrade.svg",
      typeIcon: "icons/svg/upgrade.svg",
      title: game.i18n.localize("DND5E.AdvancementTitle"),
      hint: "",
      multiLevel: false,
      validItemTypes: new Set(["background", "class", "race", "subclass"]),
      apps: { config: AdvancementConfig, flow: AdvancementFlow }
    };
  }
  ```

- Lookup at call sites: `module/documents/item.mjs` line 987
  (`const config = CONFIG.DND5E.advancementTypes[type]`) and
  `module/data/item/templates/advancement.mjs` line 63
  (`CONFIG.DND5E.advancementTypes[c.type]`).

**Implication.** The design doc's plan to add a custom "KnackChoice" or similar
Advancement type at `init` is supported. Just push a new entry into
`CONFIG.DND5E.advancementTypes` from the module's `init` hook - no post-init
hook or system-provided registration API is required.

## Q3 - Do advancements on a non-class Feature item fire when the class level changes?

**Finding.** Yes, **provided the feature item satisfies three conditions**
(see below). This is not obvious from the design doc's framing - the
Knack `feat`-type item as described will *not* fire its own advancements on
class-level change, because plain feats short-circuit the class-linking
check. The path that walks advancements on non-class items during
level-up is `AdvancementManager.createLevelChangeSteps`
(`module/applications/advancement/advancement-manager.mjs` line 396), which
does this per owned item:

```javascript
if ( ["class", "subclass"].includes(i.system.advancementRootItem?.type)
     && i.system.advancementClassLinked ) {
  const rootClass = i.system.advancementRootItem.class ?? i.system.advancementRootItem;
  if ( rootClass !== classItem ) return [];
  return this.constructor.flowsForLevel(i, classLevel);
}
return this.constructor.flowsForLevel(i, characterLevel);
```

So for a Knack item to fire its own level-3 / level-5 advancements when the
Child class levels up, all three must be true:

1. **`i.system.advancementRootItem?.type === "class"`.** This is derived
   from the flag `flags.dnd5e.advancementRoot` (see
   `module/data/abstract/item-data-model.mjs` line 61-63):

   ```javascript
   get advancementRootItem() {
     return this.parent?.actor?.items.get(
       this.parent.getFlag("dnd5e", "advancementRoot")?.split(".")?.[0]);
   }
   ```

   That flag is auto-set by `Advancement#createItemData` when an item is
   granted via `ItemGrant`
   (`module/documents/advancement/advancement.mjs` line 325-337):

   ```javascript
   async createItemData(uuid, id) {
     const source = await fromUuid(uuid);
     ...
     const advancementOrigin = `${this.item.id}.${this.id}`;
     return source.clone({
       ...
       "flags.dnd5e.advancementOrigin": advancementOrigin,
       "flags.dnd5e.advancementRoot":
         this.item.getFlag("dnd5e", "advancementRoot") ?? advancementOrigin
     }, { keepId: true }).toObject();
   }
   ```

   The value is `<classItem.id>.<advancementId>`, so the `.split(".")[0]`
   in the getter yields the class item's id.

2. **`i.system.advancementClassLinked === true`.** The default from
   `ItemDataModel` is `true`, but the `feat` data model overrides it to
   *false when the feature is a plain feat*
   (`module/data/item/feat.mjs` line 147-149):

   ```javascript
   get advancementClassLinked() {
     return this.type.value !== "feat";
   }
   ```

   So a Knack encoded as `type: "feat"` with `system.type.value === "feat"`
   (the subtype used for "Feats" like Great Weapon Master) will **not**
   qualify. It must instead be `system.type.value === "class"` -
   i.e., a "Class Feature" - which is the type used for existing dnd5e
   class-granted features (`DND5E.featureTypes.class` in `config.mjs`
   line 1805).

3. **The class item currently being levelled matches the root.** The
   line `if ( rootClass !== classItem ) return [];` means the linkage
   only fires for the specific class whose grant produced the item.

If those three hold, the feature's own advancements will fire at the
correct **class** level (not character level), because `flowsForLevel` is
called with `classLevel`. `advancement.byLevel` on the item is populated
by `Item5e#_prepareAdvancement` from the object-keyed `system.advancement`
using each entry's `level` field.

**Evidence.**

- `advancement-manager.mjs` lines 396-434 (already quoted).
- `item-data-model.mjs` lines 34-63 (defaults + getters).
- `feat.mjs` lines 147-149 (the `feat` override).
- `advancement.mjs` line 325-337 (flag propagation on grant).
- `item.mjs` lines 598-613 (`_prepareAdvancement` walks
  `this.system.advancement` and populates `byLevel`).

**Implication.** The design doc's plan is *conditionally* green-lit:
if Knacks are shipped as `type: "feat"` with `system.type.value === "class"`
(i.e., "Class Feature" in the UI, not "Feat"), granted via `ItemGrant`
advancement on the Child class item, then their own `system.advancement`
entries with `level: 3` and `level: 5` will fire automatically when the
Child class's `system.levels` increments. **No Hooks-based fallback is
needed**, and no reliance on `Actor5e#_onAdvancement` (which does not
exist as a walk-your-item-advancements loop - the walking is done by the
`AdvancementManager.createLevelChangeSteps` static factory instead).

Blocking sub-finding: if the design instead insists Knacks must be
literal "Feat" items (`system.type.value === "feat"`), the automatic
fire path is off and you'd need `flags.child-class.knack` +
`Hooks.on("dnd5e.advancementManagerComplete")` or `dnd5e.preUpdateActor`
to hand-roll the grants. That is a real workaround, but it should not
be the first choice given the built-in mechanism above.

Additional note: the level-up UI (`AdvancementManager`) is invoked from
`CharacterSheet5e._onDropSingleItem` on drag-drop level bump, not from
the class item's `_preUpdate`. Programmatic `class.update({ "system.levels": ... })`
does **not** by itself run the advancement flow - it just writes the value.
If the module bumps class levels via `Actor#update`, the module must also
call `AdvancementManager.forLevelChange(actor, classId, levelDelta).render()`
to trigger the flow, or the granted Knack advancements won't apply.
Evidence: the class item's `_preUpdate` (`module/data/item/class.mjs`
lines 296-320) only clamps the new value; it does not spawn a manager.
The character-sheet drop handler at line 1259 of
`module/applications/actor/character-sheet.mjs` is the one that runs
`AdvancementManager.forLevelChange(...).render({ force: true })`.

## Q4 - ActiveEffect override reach for `hp.max` and `prof`

**Finding.** Both are reachable by an `ActiveEffect` in OVERRIDE mode,
but for slightly different reasons and with a caveat on `hp.max`:

- **`system.attributes.prof`** is computed in `CharacterData#prepareBaseData`
  (`module/data/actor/character.mjs` line 170:
  `this.attributes.prof = Proficiency.calculateMod(this.details.level);`).
  Standard Foundry `Actor.prepareData` runs `prepareBaseData` → then
  `prepareEmbeddedDocuments` (which calls `applyActiveEffects` internally)
  → then `prepareDerivedData`. So an AE writing
  `key: "system.attributes.prof", mode: OVERRIDE, value: N` runs after
  `prof` is set from the level table and cleanly replaces it. Nothing in
  `prepareDerivedData` re-sets it, so downstream consumers (skill mod,
  save DC, attack bonus, sheet display) all see the AE value. **Green-lit.**

- **`system.attributes.hp.max`** is set in
  `CharacterData#prepareDerivedData` via `AttributesFields.prepareHitPoints`
  (`character.mjs` lines 237-246; `attributes.mjs` lines 354-364):

  ```javascript
  // character.mjs
  const hpOptions = {};
  if ( this.attributes.hp.max === null ) {
    hpOptions.advancement = Object.values(this.parent.classes)
      .map(c => c.advancement.byType.HitPoints?.[0]).filter(a => a);
    hpOptions.bonus = (simplifyBonus(this.attributes.hp.bonuses.level, rollData)
      * this.details.level)
      + simplifyBonus(this.attributes.hp.bonuses.overall, rollData);
    hpOptions.mod = this.abilities[...defaultAbilities.hitPoints ?? "con"]?.mod ?? 0;
  }
  AttributesFields.prepareHitPoints.call(this, this.attributes.hp, hpOptions);

  // attributes.mjs
  static prepareHitPoints(hp, { advancement=[], mod=0, bonus=0 }={}) {
    const base = advancement.reduce((total, a) => total + a.getAdjustedTotal(mod), 0);
    hp.max = (hp.max ?? 0) + base + bonus;
    if ( this.parent.hasConditionEffect("halfHealth") ) hp.max *= 0.5;
    hp.max = Math.floor(hp.max);
    ...
  }
  ```

  The schema initialises `hp.max` to `null`. An OVERRIDE-mode AE running
  during `applyActiveEffects` sets `hp.max` to N. Then in
  `prepareDerivedData`, the `hp.max === null` guard fails, so
  `advancement`, `bonus`, and `mod` all stay at their defaults (0 / 0 / 0).
  `prepareHitPoints` then does `hp.max = (N ?? 0) + 0 + 0 = N` and moves on
  to compute `effectiveMax`, `damage`, `pct`. So AE OVERRIDE on `hp.max`
  **does reach the sheet**, but it *bypasses* HP-per-level advancement
  and the `hp.bonuses.level` / `hp.bonuses.overall` formula fields entirely.
  For the Child class (no HP progression, no CON to HP) that behaviour is
  desirable. If the design later wants Child HP to still inherit
  `hp.bonuses.overall` from race/feats/etc., the AE approach won't do
  that automatically and a data-model override would be needed.

  Note: `hp.value` (current HP) is *not* set by an OVERRIDE - user updates
  to `hp.value` go through `Actor#update` normally. If the module uses
  OVERRIDE on `hp.max`, be careful that the source `hp.max` stays `null`
  (the schema default); if any pre-existing character has a non-null source
  value, the OVERRIDE still clobbers, so this is fine, but keep the
  invariant "Child class writes no source `hp.max`" as a design rule.

**Key format.** AE `changes[i].key` is the dotted path from the actor root,
so `system.attributes.hp.max` and `system.attributes.prof` verbatim. Numeric
handling: the schema fields (`NumberField`) coerce string values back to
numbers via `_cast`, but the recommended value is a plain integer string
like `"10"` in JSON (Foundry's AE UI stores values as strings). For
OVERRIDE, dnd5e falls through to Foundry's `applyChangeField`
(`module/documents/active-effect.mjs` line 305).

**Phase caveat.** Foundry v13+ introduced a phase system for AEs
(`CONFIG.ActiveEffect.CHANGE_PHASES` with `"initial"` and `"final"` as
core phases). dnd5e calls `super.applyActiveEffects(phase)` in
`module/documents/actor/actor.mjs` line 350-356 and does not gate by
phase. All AE changes on an actor default to the `"initial"` phase, which
runs during `applyActiveEffects` between base and derived - the standard
place. If a module wants an AE to run *after* `prepareDerivedData` (e.g.
to override the final `hp.max` after `prepareHitPoints` has run its
bonuses.level math), it would need a `"final"`-phase change; **dnd5e 5.3.3
does not schedule any additional post-derived AE pass**, so that path is
theoretical without further module glue.

**Evidence.**

- `module/data/actor/character.mjs` lines 160-192 (`prepareBaseData` sets
  `prof` and `xp.max`) and 218-247 (`prepareDerivedData` computes hp).
- `module/data/actor/templates/attributes.mjs` lines 40-48 (`hp.max`
  schema: `nullable: true, initial: null`) and 354-364 (`prepareHitPoints`).
- `module/documents/actor/actor.mjs` lines 302-310 (`prepareData` outer)
  and 350-356 (`applyActiveEffects(phase)` passthrough).
- Foundry v14 release notes describe migration of `ActiveEffect#changes`
  to `ActiveEffect#system#changes`; dnd5e 5.3.3 is written against v13
  and uses `_applyChangeShim` (`module/documents/active-effect.mjs`
  line 336) to smooth this over. For a v14-targeting module, use
  `foundry.utils.getProperty(effect, "system.changes") ?? effect.changes`
  when building effects programmatically, or push into the pre-shim
  location and let dnd5e's shim handle it.

**Implication.** Section 5.1 (proficiency override) and section 5.2 (HP
max override) are both green-lit via AE OVERRIDE on the exact dotted
paths `system.attributes.prof` and `system.attributes.hp.max`. No
libWrapper is needed for either. The "no HP scaling from CON/level bonuses"
side effect on `hp.max` matches the Child design intent (no hit die, no
progression). No phase gymnastics required - the default `"initial"` phase
runs at the right time.

## Q5 - Class item `system.hd.denomination` nullability

**Finding.** The field cannot be null, empty, or absent. In dnd5e 5.3.x the
field was renamed from `system.hitDice` to `system.hd.denomination` (with a
migration for old data). The schema is:

```javascript
// module/data/item/class.mjs line 46-49
hd: new SchemaField({
  additional: new FormulaField({ deterministic: true, required: true }),
  denomination: new StringField({
    required: true, initial: "d6", blank: false,
    validate: v => /d\d+/.test(v), validationError: "must be a dice value in the format d#"
  }),
  spent: new NumberField({ required: true, nullable: false, integer: true, initial: 0, min: 0 })
})
```

So `denomination` must match `/d\d+/`. The system-wide config lists
allowed values in `CONFIG.DND5E.hitDieTypes = ["d4", "d6", "d8", "d10", "d12"]`
(`config.mjs` line 2895) - this list is used to populate the class-sheet
dropdown, but the schema validator itself accepts any `d<digits>` string.

**Is `d4` a safe placeholder if no HitPoints advancement is attached?**
Yes. The class's derived data uses `hd.denomination` in two consumer paths:

1. `prepareFinalData` (line 217-224 of `class.mjs`) computes
   `hd.max = Math.max(this.levels + this.hd.additional, 0);` and
   `hd.value = Math.max(this.hd.max - this.hd.spent, 0);` - these use
   `levels` and `additional`, not `denomination`. So `hd.max` and
   `hd.value` will be computed but represent nothing physically meaningful.

2. `Actor5e#rollClassHitPoints` (used during automatic HP rolling at level up)
   reads the denomination to build the roll formula. But that flow only fires
   if a `HitPointsAdvancement` is attached and the user runs it. With no
   `HitPointsAdvancement` on the Child class, that path is not reached
   automatically.

3. The hit-dice management UI (short-rest recovery, `Actor5e#_prepareHitDice`)
   groups class HD by denomination. A Child with `denomination: "d4"` and
   `system.levels = 0-5` will therefore contribute an entry to the actor's
   d4 hit-dice pool. If the Child level is 0 (i.e. this is a "cradle to
   graduation" class that starts at 0 or you set `levels: 0`), the schema
   allows `levels: 0` (`min: 0`), and `hd.max = 0`, so the pool will be empty.
   If the Child levels 1-5 exist, the actor will show N d4 hit dice
   they can spend on short rest. That's a real side effect; the module
   should suppress the hit-dice UI for the Child, or set `hd.additional`
   to a negative formula to zero out `hd.max`, or accept the harmless
   pool. **This is a small but real side effect worth calling out to
   the design.**

**Evidence.** Class schema quoted above; `hitDieTypes` in `config.mjs`
line 2895; hit-dice derivation in `class.mjs` line 217-224.

**Implication.** Section 5.5's "the Child has no hit die" cannot be
expressed as `denomination: null` or `denomination: ""`. Use
`denomination: "d4"` as a structural placeholder and either
(a) accept a small d4 hit-dice pool on the actor sheet, or
(b) suppress it via a data-model or sheet override in the module.
Setting `hd.additional: "-@item.system.levels"` (a formula) would give
`hd.max = levels + (-levels) = 0` and zero the pool, though it relies on
the roll data resolving `@item.system.levels` at that scope. Simpler: set
`hd.additional: "0"` and accept the pool, or hide the class from the
short-rest UI via a CSS/HTML tweak.

## Q6 - Hook names

**Finding.** The relevant hooks fire only from the AdvancementManager flow.
There is **no dnd5e hook fired directly on class-level change** - the
class item's `_preUpdate` just clamps the value and returns.
Advancement-related hooks:

| Hook name | When it fires | Signature |
|---|---|---|
| `dnd5e.preAdvancementManagerRender` | Before the level-up wizard renders. Return false to cancel. | `(advancementManager: AdvancementManager)` |
| `dnd5e.preAdvancementManagerComplete` | After the user finishes all flow steps, before the actor/item updates are committed. Return false to abort. | `(advancementManager, actorUpdates, toCreate, toUpdate, toDelete)` |
| `dnd5e.advancementManagerComplete` | After actor/item updates from a completed advancement flow have been applied. | `(advancementManager)` |
| `dnd5e.initializeActorSource` | During `Actor._initializeSource` (module content injection point). | `(actor, source, options)` |
| `dnd5e.initializeItemSource` | During `Item._initializeSource`. | `(item, data, options)` |

For "an item is granted via ItemGrant advancement": there is no dedicated
`dnd5e.itemGranted` hook. Granted items are created via
`Actor#createEmbeddedDocuments("Item", toCreate, { keepId: true, isAdvancement: true })`
inside `AdvancementManager._complete` (line 913-918 of
`advancement-manager.mjs`). To observe grants, a module should listen on
the core `createItem` hook and check the `isAdvancement` option on the
create context, or (more discoverable) listen on
`dnd5e.advancementManagerComplete` and diff the actor's items.

For "a class's `system.levels` changes on an actor": no dedicated hook.
Programmatic level bumps that go through
`AdvancementManager.forLevelChange(actor, classId, delta).render()` will
eventually fire `dnd5e.advancementManagerComplete`. Direct
`class.update({ "system.levels": N })` will only fire the core
`updateItem` hook - listen on that and filter by `changes.system?.levels`
if you need to observe every level change, but note that this path
**does not run the advancement flow**, so it is not a substitute for
using `AdvancementManager.forLevelChange`.

**Evidence.**

- `module/applications/advancement/advancement-manager.mjs` line 543
  (`preAdvancementManagerRender`), 907 (`preAdvancementManagerComplete`),
  926 (`advancementManagerComplete`).
- `module/documents/actor/actor.mjs` line 233
  (`dnd5e.initializeActorSource`).
- `module/documents/item.mjs` line 111
  (`dnd5e.initializeItemSource`).
- `module/data/item/class.mjs` lines 296-320 (class item `_preUpdate` only
  clamps, no hook fired).

**Implication.** Section 6.1 (the "graduation intercept") should hook
`dnd5e.preAdvancementManagerComplete` and inspect the manager's
`clone.items` for the Child class hitting its terminal level, or hook
`dnd5e.advancementManagerComplete` and detect the transition post hoc.
Section 5.4's fallback (Hooks-based Knack grant, if Q3 conditions aren't
met) can hook `dnd5e.advancementManagerComplete` on the class item's
level advance and add the appropriate grants. But given Q3's finding
that `advancementClassLinked + advancementRoot` gives automatic
class-linked firing, the fallback should be a last resort.

## Q7 - Compendium pack build tooling

**Finding.** `@foundryvtt/foundryvtt-cli` is the officially maintained CLI
for building LevelDB packs from JSON source (see the pinned banner on the
Foundry Package Development guides). It is also what the dnd5e system's
own `packs/_source/*.yml` build pipeline uses. Confirmed layout and
behaviour:

- **Install:** `npm install -g @foundryvtt/foundryvtt-cli` (Node 18+).
  Provides the `fvtt` command globally. For per-project scripting, install
  as a devDependency: `npm install --save-dev @foundryvtt/foundryvtt-cli`.

- **Configuration.** Before first use, tell the CLI where the Foundry data
  root lives: `fvtt configure set dataPath <path>`. For pack building you
  don't actually need this if you pass `--in` / `--out` explicitly - the
  data-path is only for auto-resolution.

- **Unpack** (LevelDB pack → JSON source files):
  ```bash
  fvtt package unpack "<compendiumName>" \
    --id <moduleId> --type Module \
    --in "packs/<name>" --out "packs-src/<name>"
  ```
  Add `--yaml` for `.yml` output (what the dnd5e system itself uses).

- **Pack** (JSON source files → LevelDB pack):
  ```bash
  fvtt package pack "<compendiumName>" \
    --id <moduleId> --type Module \
    --in "packs-src/<name>" --out "packs/<name>"
  ```
  Add `--recursive` if source files are grouped in subdirectories.

- **`module.json` manifest.** For a v10+ module the pack entry needs
  `{ name, label, path, type, system? }` where `path` is the directory
  containing the LevelDB files (not a file path - v10 changed this from
  the v9 file-based `.db` reference). The `system` field is required if
  the pack contains system-specific documents (e.g. `dnd5e`).
  Example:
  ```json
  "packs": [
    {
      "name": "child-class",
      "label": "Child Class",
      "path": "packs/child-class",
      "type": "Item",
      "system": "dnd5e"
    }
  ]
  ```
  `private` is optional. The CLI does not enforce these keys itself, but
  Foundry will refuse to load a pack that's missing `type` or has a wrong
  `path`.

- **`_id` preservation.** Confirmed by reading
  `foundryvtt-cli/lib/package.mjs`: the CLI never mutates `_id`. The
  LevelDB key is a composite `!<collection>!<_id>` (or dotted for embedded
  docs). So if you write stable, hand-assigned `_id` fields in your JSON
  sources, they will survive round-trips. This is important for the
  design's plan to reference class/advancement/knack items by stable
  UUIDs in code and in world content.

- **`_key` is required on pack input.** `compileClassicLevel` (line 322
  of `lib/package.mjs`) does `if ( !doc._key ) continue;` — any JSON source
  missing a `_key` field is **silently skipped**, producing a pack that
  looks like it built (`[classic-level] Packing ...`) but is empty. Verified
  in this repo on 2026-08-31: initial pack of `class-child14.json` /
  `class-child24.json` succeeded per CLI output but produced a 0-byte
  write-ahead log; adding `_key: "!items!<id>"` on the top-level Item and
  `_key: "!items.effects!<itemId>.<effectId>"` on each embedded ActiveEffect
  made both `Packed` log lines appear and produced a 989-byte SST file.
  The `_key` format is `!<collection>!<id>` for primary docs and
  `!<parentCollection>.<embeddedCollection>!<parentId>.<embeddedId>` for
  embedded docs — collection names come from `TYPE_COLLECTION_MAP` (line
  186) and the `HIERARCHY` map (line 126). Unpack **adds** `_key`
  automatically, so if you unpack an existing pack and re-pack it the keys
  are preserved; but generators writing JSON from scratch must include them.

**Evidence.**

- [`foundryvtt/foundryvtt-cli`](https://github.com/foundryvtt/foundryvtt-cli) README.
- [`foundryvtt-cli/commands/package.mjs`](https://github.com/foundryvtt/foundryvtt-cli/blob/main/commands/package.mjs)
  for flags.
- [`foundryvtt-cli/lib/package.mjs`](https://raw.githubusercontent.com/foundryvtt/foundryvtt-cli/main/lib/package.mjs)
  for `_id` handling (`_key` is added during compile, deleted before write;
  `_id` is never touched).
- dnd5e's own `packs/_source/` layout at
  https://github.com/foundryvtt/dnd5e/tree/release-5.3.3/packs/_source
  (used as a reference for structural conventions).

**Implication.** Section 7 (pack build tooling) is green-lit. Recommend
`fvtt package pack --recursive --yaml` in a build script, source files
committed with stable `_id`s in `packs-src/*/`, output to `packs/*/`
(add `packs/` to `.gitignore` since it's regenerated). Module manifest
uses v10+ directory-based `path` referring to the output.

## Q8 - Character with no background

**Finding.** dnd5e 5.3.x does **not** require a background item on
characters. `system.details.background` is declared as a
`LocalDocumentField` targeting `foundry.documents.BaseItem` with
`{ required: true, fallback: true }` (`character.mjs` line 89-91). The
`required: true` here means the *field must be present in the schema*, not
that it must resolve to an item. `fallback: true` means: if the referenced
item ID does not resolve to an owned item, return the raw stored value
(usually `""` or an unresolved id string) instead of throwing. The
initial value is null/`""`; if no background is assigned the field just
stays that way.

Consumer paths were audited:

- `CharacterSheet5e._prepareContext` line 338:
  `if ( details.background instanceof dnd5e.documents.Item5e ) context.background = details.background;`
  - guarded, no-op if absent.
- `CharacterSheet5e` line 425-426: constructs a features-tab column
  entry only if the background resolves; if not, no column is added.
- `CharacterSheet5e.canExpand` line 1336 filters `["background", "race",
  "facility"]` from the expandable list - harmless if none present.
- `Actor5e#transformActor` line 2992 handles polymorph settings for
  "background" effects - only a lookup, safe with null.
- No `prepareBaseData` / `prepareDerivedData` path throws or emits a
  console warning when `details.background` is null.

Value handling: the schema stores an item ID string or `""`; treating
"no background" as an empty string (`""`) or omitting the field entirely
in the source data are both accepted. Setting it to `null` explicitly is
not required (and Foundry's cast would convert `null` back to `""` on
save due to the underlying `DocumentIdField`).

The character sheet renders cleanly with no background - the "Background"
row on the Details tab shows an empty drop target, and the features tab
simply omits the "Background" grouping (line 425-426).

**Compendium browser / character creation.** The v13 compendium browser
and the dnd5e character creation flow have no hard prompt that blocks
you from finishing a character without a background. The default
CharacterSheet's "Details" tab has a `drop background here` slot; the
sheet does not gate any UI on a background being present.

**Evidence.**

- `module/data/actor/character.mjs` line 86-108 (details schema).
- `module/data/fields/local-document-field.mjs` full file (semantics of
  `fallback: true`).
- `module/applications/actor/character-sheet.mjs` lines 338, 425-426,
  1336 (consumer guards).

**Implication.** Section 5.9 (no-background Child) is green-lit with
zero intercepts. Just leave `system.details.background` at its default
value on Child actors. The plain-vanilla character sheet handles it
cleanly. No prompt, no warning, no data-preparation exception.
Recommend the module's Child-class documentation explicitly mention
"leave the Background slot empty" so users don't drag a random background
in and unbalance the character.

## Q9 - XP derivation path

**Finding.** `system.details.xp.max` and `xp.min` / `xp.pct` are derived
in `CharacterData#prepareBaseData` (not `prepareDerivedData`):

```javascript
// module/data/actor/character.mjs line 170-187
this.attributes.prof = Proficiency.calculateMod(this.details.level);

const { xp, level } = this.details;
xp.max = level >= CONFIG.DND5E.maxLevel ? Infinity : this.parent.getLevelExp(level || 1);
xp.min = level ? this.parent.getLevelExp(level - 1) : 0;
if ( Number.isFinite(xp.max) ) {
  const required = xp.max - xp.min;
  const pct = Math.round((xp.value - xp.min) * 100 / required);
  xp.pct = Math.clamp(pct, 0, 100);
} else if ( game.settings.get("dnd5e", "levelingMode") === "xpBoons" ) {
  ...
} else {
  xp.pct = 100;
}
```

`getLevelExp` is a plain instance method on `Actor5e`:

```javascript
// module/documents/actor/actor.mjs line 483-487
getLevelExp(level) {
  const levels = CONFIG.DND5E.CHARACTER_EXP_LEVELS;
  return levels[Math.min(level, levels.length - 1)];
}
```

So the chain is: `prepareBaseData` reads
`this.parent.getLevelExp(...)` → `getLevelExp` reads
`CONFIG.DND5E.CHARACTER_EXP_LEVELS` (a shared array). There is
**no per-actor hook** in this chain and no data-model extension point.

**Options for per-actor override, ranked by cleanliness:**

1. **Wrap `Actor5e.prototype.getLevelExp` with libWrapper** and branch
   inside on `this.itemTypes.class.some(c => c.system.identifier === "child")`
   (or whatever marker the module uses). Return the Child threshold array
   for Child actors, delegate to the wrapped function otherwise. This is
   the *only* clean way to also fix `xp.min` and thus `xp.pct` in the
   same operation. All three (`max`, `min`, `pct`) flow from `getLevelExp`.

2. **AE OVERRIDE on `system.details.xp.max`** works to change the display
   value, because AEs run between `prepareBaseData` and
   `prepareDerivedData`. But `xp.pct` is computed inside `prepareBaseData`
   (before AEs), using the pre-override `xp.max` and `xp.min`. So the
   progress bar percentage will lag by one prepareData pass and use the
   wrong denominator on `xp.value` changes. **Not recommended.**

3. **Subclass `CharacterData`** and override `prepareBaseData` to
   substitute the Child thresholds when a Child class is present. This
   requires registering a custom data model for the `character` actor
   type, which is invasive and risks conflicts with any other module doing
   the same. Not recommended.

Note: the array `CONFIG.DND5E.CHARACTER_EXP_LEVELS` is length-fixed at
21 entries (level 0 through 20). The Child design's array
`[0, 30, 75, 135, 210, 300]` has only 6 entries (child levels 0-5). The
libWrapper wrap needs to handle out-of-range indexing by clamping to 5
for level>=5, matching how the vanilla getLevelExp uses
`Math.min(level, levels.length - 1)`.

The `xpBoons` levelling mode branch (line 180) uses
`this.parent.getLevelExp(CONFIG.DND5E.maxLevel)` - if a Child actor ever
somehow reaches maxLevel and the game has boons enabled, the wrap would
need to handle that too, though for a level-cap-5 class this is only
relevant if the Child actor has other classes too.

**Evidence.**

- `character.mjs` lines 170-187 (base-data XP derivation).
- `actor.mjs` lines 480-487 (`getLevelExp` instance method).
- `config.mjs` line ~2400 for `CHARACTER_EXP_LEVELS = [0, 300, 900, 2700,
  ...]` (Cf. `getLevelExp` reference).

**Implication.** Section 5.10 (Child XP thresholds) *cannot* be
implemented without either libWrapper or a data-model subclass. Given
that libWrapper is already going to be a hard dependency of the world
(because of Plutonium per Q10), the design's stated "no libWrapper"
constraint is not achievable for XP. Recommend the module declare
libWrapper as a required dependency and wrap
`dnd5e.documents.Actor5e.prototype.getLevelExp` with a per-actor
branching implementation. This is the same recommendation the
design would have arrived at had the AE-only path not turned out to
have the `xp.pct` timing hole documented above.

## Q10 - libWrapper interaction with dnd5e

**Finding.** libWrapper 1.13.5+ is compatible with Foundry v13 and v14
and there are no documented dnd5e-specific conflicts in the libWrapper
[SYSTEMS.md](https://github.com/ruipin/fvtt-lib-wrapper/blob/master/SYSTEMS.md)
- that document explicitly targets systems, not dnd5e in particular.
Best-practice wrap targets on dnd5e:

- **Stable across 5.3.x:** `Actor5e.prototype.getLevelExp`,
  `Actor5e.prototype.getRollData`, `Actor5e.prototype.getCRExp` - these
  are documented instance methods that have kept their signatures across
  5.x minor versions.
- **Volatile:** `CharacterData.prototype.prepareBaseData` and
  `.prepareDerivedData` are also plain methods but their internals have
  shifted between minors (e.g. the `xpBoons` branch was added mid-5.x).
  Wrapping these is possible but brittle.

Wrap mode recommendation: `MIXED` for `getLevelExp` (you conditionally
delegate to the wrapped function), `WRAPPER` for observation-only cases.
No `OVERRIDE` needed for anything the Child module currently plans.

Compatibility with Plutonium: Plutonium wraps a broad surface, but it
does not (as of any published dnd5e 5.3 build) wrap `getLevelExp`. So
the collision surface for the Child module is minimal - libWrapper's
priority ordering will make Plutonium's other wraps compose fine.

**Evidence.**

- [libWrapper README](https://github.com/ruipin/fvtt-lib-wrapper/blob/master/README.md)
- [libWrapper SYSTEMS.md](https://github.com/ruipin/fvtt-lib-wrapper/blob/master/SYSTEMS.md)
- `module/documents/actor/actor.mjs` line 483-487 (target function).

**Implication.** libWrapper is safe to require and use for Q9's
`getLevelExp` wrap. The design should list libWrapper as a required
module dependency in `module.json`. No conflicts expected with
Plutonium.

---

## Summary

### Green-lit approaches (design assumptions confirmed)

- **Q1.** Advancement storage is object-keyed by advancement `_id` under
  `system.advancement`. Pack JSON sources should use the object shape.
- **Q2.** Custom Advancement types register via
  `CONFIG.DND5E.advancementTypes[TypeName] = { documentClass, validItemTypes }`
  at `init`.
- **Q4.** ActiveEffect OVERRIDE reaches `system.attributes.prof` (set in
  `prepareBaseData`) and `system.attributes.hp.max` (set in
  `prepareDerivedData` but respected when non-null on entry). Both use
  exact dotted paths, no phase gymnastics.
- **Q6.** Hooks `dnd5e.preAdvancementManagerComplete` and
  `dnd5e.advancementManagerComplete` are the intercept points for the
  graduation trigger and any Knack-fallback grant logic.
- **Q7.** `fvtt package pack/unpack` with LevelDB output is the current
  path. Hand-assigned `_id`s survive round-trips.
- **Q8.** No-background characters render cleanly. No intercepts needed.
- **Q10.** libWrapper is dnd5e-safe; wrapping `Actor5e.prototype.getLevelExp`
  is stable and non-conflicting with Plutonium.

### Green-lit *with caveats* (design assumption confirmed but with a
condition attached)

- **Q3.** Class-linked non-class-item advancement firing works, **but only
  if** the Knack item is (a) a `feat` with `system.type.value === "class"`
  (a "Class Feature", not a plain Feat), (b) granted via an `ItemGrant`
  advancement on the Child class item (so `flags.dnd5e.advancementRoot`
  gets auto-populated with the class item's id), and (c) the actor is
  in the same class whose grant produced the item. Under those conditions
  the Knack's own level-3/level-5 `system.advancement` entries fire
  automatically on class-level change via
  `AdvancementManager.createLevelChangeSteps`. **If the design instead
  ships Knacks as plain-Feat-type items**, the automatic path is blocked
  by `FeatData#advancementClassLinked` returning false, and a
  Hooks-based fallback is needed.
- **Q5.** `system.hd.denomination` cannot be null/empty; use `"d4"` as a
  structural placeholder. Side effect: the actor gains N d4 entries in
  the short-rest hit-dice pool. Suppress via `hd.additional: "-@item.system.levels"`
  or accept the small cosmetic pool.

### Blockers requiring design change

- **Q9.** Per-actor XP thresholds cannot be implemented with AE OVERRIDE
  alone - `xp.pct` computation in `prepareBaseData` uses the un-overridden
  `xp.max` and `xp.min`, so the progress bar denominator will be wrong.
  **The clean fix requires wrapping `Actor5e.prototype.getLevelExp` with
  libWrapper.** The design doc's implicit assumption of "no libWrapper"
  for XP is therefore *falsified*. Recommend adding libWrapper as a
  required dependency (which is already true from the world side via
  Plutonium anyway) and implementing the Child XP thresholds as a
  MIXED-mode wrap on `getLevelExp` that branches on the presence of the
  Child class item.

### Live-Foundry verification — resolved during implementation

All three items originally flagged for live verification have been resolved
against Foundry v14 / dnd5e 5.3.3 during the v0.1.0 – v0.2.x work.

- **~~Foundry v14 phased AE application.~~** Moot. The AE-based approach to
  HP / prof was abandoned entirely — see Q4 addendum below. dnd5e's
  `ActiveEffect5e.apply` only evaluates formulas for keys in `FORMULA_FIELDS`
  (`dnd5e.mjs:24528`), and neither `system.attributes.hp.max` nor
  `system.attributes.prof` is in that set. The runtime pivot lives at
  `src/hp.mjs`: a `libWrapper` WRAPPER on `Actor#prepareData` writes both
  fields deterministically after the entire prepare cycle. The AE phase
  question no longer matters for this module.
- **~~`hd.additional` formula resolution scope.~~** Verified in Foundry.
  The correct form is `-@item.levels` — dnd5e's `Item5e#getRollData`
  populates `item` in the rollData as a spread of `this.system`, not the
  item itself, so `@item.system.levels` and bare `@levels` both evaluate
  to 0. `-@item.levels` produces `hd.max = 0` for a Child at any level.
  See generate.mjs's inline comment on the class-item `hd` block.
- **~~`CONFIG.DND5E.CHARACTER_EXP_LEVELS` array contents.~~** Moot. The
  `getLevelExp` wrap in `src/xp.mjs` clamps defensively per
  `Math.max(0, Math.min(level, table.length - 1))` on the Child table,
  and delegates to the wrapped original for non-Child actors — so the
  vanilla array's exact length never affects our path.
