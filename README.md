# Child Class — Foundry VTT module

A Foundry VTT module (`dnd5e` system, 5.3.0+) that adds the **Child** class from
Sip 'n' Strut's *Humble Beginnings* to the compendium as a playable option.
Ships the 2014 and 2024 editions as sibling class items in the same module,
plus the Unexceptional (default) and Unremarkable (table-variant)
ability-generation rules.

Read the class online at **[sipandstrut.com/childclass](https://www.sipandstrut.com/childclass)**.

## Installation

In Foundry: **Add-on Modules → Install Module → Manifest URL**:

```
https://github.com/sipnstrut/child-class/releases/latest/download/module.json
```

Then, in the world you want to use it in: **Game Settings → Manage Modules**,
enable **Child Class** and its dependencies:

- **lib-wrapper** (required — declared as a hard dependency in `module.json`)
- **Plutonium** (recommended — see setup below)

## Setup

The module ships with two class items (`Child '14`, `Child '24`), 26 Knack
items, and the Youth / Trade Skill / Graduate features. What it does **not**
ship is the actual bonus feats each Knack grants — those are the 26 real 5e
feats (Tough, Grappler, Piercer, Metamagic Adept, and so on) that the module
does not have the right to redistribute. You bring them.

The setup runs once at world start. Every step is idempotent, so re-running
any of them after importing more feats is safe.

### 1. Configure Plutonium's import target

Turn on **Plutonium → Module Settings → Importing → Use Advancement-Backing
Compendium**. This mirrors any feats you import into a Foundry-scannable
compendium. Without it, Plutonium's content lives inside the Plutonium
module itself and can't be found by our resolver.

Optionally, create a dedicated world compendium (right-click **Compendium
Packs** sidebar → **Create Compendium** → **Item** type, name it e.g.
`Feats`) and point Plutonium's Item / Feat import target at it. Not
required — the Advancement-Backing Compendium works just as well.

### 2. Import the Knack feats

Bring the 26 feats named in the Knack tables into any world-scoped Item
compendium. Any of these paths work — the resolver is source-agnostic:

- **Plutonium** — open the feat browser, import each name. Set Plutonium's
  Item / Feat import target to your world compendium (from step 1).
- **The dnd5e SRD compendiums** — many Knack feats ship natively in
  `dnd5e.classfeatures` / `dnd5e.feats24`. If they're already visible in
  your compendium sidebar, no import needed — the resolver will find them.
- **Manual** — right-click your world compendium → Create Item → Feat, name
  it exactly, author its advancement chain. Tedious but always works.
- **Any other module** — anything that lands a feat item with the right
  name in any enabled Item compendium is scan-able.

The `ᵀᶜᴱ` marking on a few entries means "prefer the Tasha's Cauldron of
Everything version if you have both editions imported."

**'14 (2014 rules) — 26 feats total, 13 pairs:**

| Aspiring class | Feat A | Feat B |
|---|---|---|
| Barbarian | Charger | Grappler |
| Bard | Defensive Duelist | Actor |
| Cleric | Healer | Chef |
| Druid | Magic Initiate | Poisoner |
| Fighter | Tough | Fighting Initiate |
| Monk | Tavern Brawler | Martial Adept |
| Paladin | Inspiring Leader | Mounted Combatant |
| Ranger | Dungeon Delver | Keen Mind |
| Rogue | Skulker | Skill Expert ᵀᶜᴱ |
| Sorcerer | Magic Initiate | Metamagic Adept ᵀᶜᴱ |
| Warlock | Magic Initiate | Linguist |
| Wizard | Ritual Caster | Elemental Adept |
| Artificer | Magic Initiate ᵀᶜᴱ | Gunner ᵀᶜᴱ |

**'24 (2024 rules) — 26 feats total, 13 pairs:**

| Aspiring class | Feat A | Feat B |
|---|---|---|
| Barbarian | Savage Attacker | Tough |
| Bard | Musician | Defensive Duelist |
| Cleric | Healer | Chef |
| Druid | Magic Initiate | Poisoner |
| Fighter | Durable | Piercer |
| Monk | Athlete | Blind Fighting |
| Paladin | Inspiring Leader | Mounted Combatant |
| Ranger | Skilled | Observant |
| Rogue | Skulker | Skill Expert ᵀᶜᴱ |
| Sorcerer | Elemental Adept | Metamagic Adept ᵀᶜᴱ |
| Warlock | Actor | Telepathic ᵀᶜᴱ |
| Wizard | Ritual Caster | Keen Mind |
| Artificer | Crafter | Gunner ᵀᶜᴱ |

Sixteen feat names appear in both tables — the resolver keys on
`(edition, name)` so a '14 Child gets the 2014 version of Tough and a '24
Child gets the 2024 version, without them colliding.

You don't need all 52 slots filled to play — a table that only cares about
half the classes can import half the pairs and see the missing entries as
"missing" in the Prepare Knack Feats dialog.

### 3. Resolve the Knack feat pools

```js
await game.modules.get("child-class").api.prepareKnackFeats()
```

A dialog opens showing every Knack feat and where it resolved to (pack +
edition). Anything marked `missing` isn't in a scan-able compendium yet —
import it via Plutonium and hit **Rescan**.

The scan writes a UUID map to the `knackFeatMap` world setting and patches
each Knack item's bonus-feat pool in memory. Level-2 Knack Bonus Feat
pickers now show the correct 2 options per aspiring class.

### 4. Fix Plutonium's ASI configuration quirks

Same dialog's **Fix Plutonium Feats** button, or **Game Settings → Configure
Settings → Module Settings → Child Class → Fix Plutonium Feats**, or:

```js
await game.modules.get("child-class").api.fixPlutoniumFeats()
```

Two preview dialogs list which imported feats will change and how. Both
fixers scan every writable world-scoped Item compendium — you don't have to
tell them where your imports live.

- **`fixPlutoniumLockedFeats`** — `Ability Score Improvement` advancements
  where `locked` is written with Plutonium's semantic ("these are the
  abilities the feat commits to") rather than dnd5e's ("these abilities are
  excluded from selection"). Piercer, Mounted Combatant, and any "+1 to STR
  or DEX" feat is affected.
- **`fixPlutoniumOverpointedASIs`** — advancements where `fixed` already
  grants ≥ 1 point AND `points` is non-zero, producing a "+1 CON auto plus
  one more anywhere" result. Durable is affected.

Both fixers are idempotent — feats already corrected (or never wrong) are
skipped.

### 5. You're done

Drop **Child '14** or **Child '24** from the *Child Class* compendium onto an
actor. The ability roll dialog fires automatically; assign values from the
pool. Level 1 → 2 opens the Knack picker; the Knack Bonus Feat picker at that
same step will show your resolved feats.

## Playing a Child

- **Rolling scores** — auto-fires when the class is first dropped. Pool of
  six values from `6 + 1d6` under Unexceptional (world default) or `7 + 1d4`
  under Unremarkable. Assign each to an ability.
- **Level 2 → Knack** — pick the class you aspire to. Its Knack item is
  granted, and you pick one of its 2 bonus feats. At level 3 that same Knack
  grants a skill and save proficiency; at level 5, a weapon or shield
  proficiency.
- **Level 4 → Growth** — pick two aptitude abilities that roll `2d6kh1`
  (Unexceptional) or `2d4kh1` (Unremarkable) for their growth; the other
  four roll one die of the same rule. All permanent, cap at 20.
- **Youth (level 1)** — once per long rest, when you take a short rest,
  the module prompts to spend Youth to recover half your max HP (rounded up).
- **Trade Skill (level 5)** — tool/language proficiency, weapon or shield
  from your Knack class, `2d<Knack hit die>` gold pieces.
- **Graduation (level 5 → 6)** — trying to level past 5 opens the
  Graduation dialog. Confirm and the module strips your Child items,
  preserves your bonus feat + tool/language proficiency + all ability scores
  and gold, and grants a **Graduate** keepsake feature summarizing what
  carried over. Then drop your next class onto the sheet — dnd5e's normal
  advancement flow takes it from there. If it matches your Knack, your Child
  XP total (300) lands you at level 2 automatically.

## GM console API

All commands under `game.modules.get("child-class").api`:

| Command | What it does |
|---|---|
| `prepareKnackFeats()` | Resolve Knack feats + patch pools. Setup step 3. |
| `fixPlutoniumFeats()` | Run both ASI fixers in sequence. Setup step 4. |
| `fixPlutoniumLockedFeats()` | Run just the locked-inversion fixer. |
| `fixPlutoniumOverpointedASIs()` | Run just the overpointed-ASI fixer. |
| `rollChildAbilities(actor?)` | Manually re-open the ability roll dialog. |
| `rollGrowth(actor?)` | Manually re-open the Growth dialog. |
| `rollTradeSkillGold(actor?)` | Manually re-roll Trade Skill gold. |
| `graduate(actor?)` | Manually open the Graduation dialog. |
| `undoGraduation(actor?)` | Restore an actor from `flags.child-class.preGraduation`. GM only. |

## Compatibility

- Foundry VTT v13+ (verified v14)
- `dnd5e` system 5.3.0+ (verified 5.3.3)
- `lib-wrapper` required
- Plutonium recommended for feat imports; any Foundry compendium containing
  the right feat names will resolve just as well.

## For developers

Repo layout:

```
docs/
  design.md         Implementation spec — source of truth
  api-notes.md      dnd5e 5.3.3 verification pass findings
src/                Module code
packs-src/          Hand-authored JSON for compendium packs
build/              Pack build tooling (foundryvtt-cli via build/pack.mjs)
lang/en.json        English strings
module.json         Foundry manifest
```

`packs/` (the built LevelDB) and `node_modules/` are gitignored.

Build:

```bash
npm install
npm run pack        # rebuild packs/ from packs-src/ via foundryvtt-cli
```

## Credit

Child class by Joseph Avery, Sip 'n' Strut — *Humble Beginnings* (DMs Guild,
2016; revised 2026). This module packages the class for Foundry VTT; the
rules and source material are Joe's.
