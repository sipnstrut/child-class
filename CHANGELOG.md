# Changelog

All notable changes to the Child Class Foundry VTT module. Dates use ISO-8601.
Version numbers follow semver relative to a hypothetical `1.0.0`; expect
`0.x` versions to shift shape as the module iterates toward a stable API.

## v0.3.0 — 2026-09-02

Big audit-follow-up release. Behavior changes are all opt-in via new
world settings; existing installs upgrade with defaults preserving prior
behavior.

### Added

- **Two new world settings.** `Auto-open Child dialogs` gates the ability
  roll on class drop, Growth on level 4, and Trade Skill on level 5 —
  defaults on. `Verbose console logging` toggles diagnostic messages —
  defaults off.
- **Trade Skill (d): compendium prompt for a proficient item.** After the
  gold roll, the player is asked to open a compendium browser to pick one
  item their character is proficient with. Design § 5.8 (d) finally wired.
- **`child-rules` JournalEntry pack.** Ships eight pages of official
  writeup — overview, editions, ability rules, Knack, no-background
  rationale, XP pacing, graduation GM guide, and design notes.
- **CHANGELOG.md**, curated Knack feat tables in the README, and the
  Plutonium-independence path (SRD / manual / any module) documented.

### Changed

- **`xpOnGraduation`, `healOnGraduation`, `enforceMulticlassBlock`,
  `snapshotRetentionDays` — wired up.** Previously registered but read
  nowhere; each now drives real behavior in the graduation flow / guard
  set. See lang/en.json for the current hint text on each.
- **Fixer preview dialogs** now include a `Pack` column so GMs can see
  which compendium each imported feat came from.
- **Plutonium ASI fixers auto-scan every writable world Item compendium**
  (not just the removed stub compendium). Works out of the box regardless
  of where imports land.
- **Setup guide simplified.** README setup dropped from six steps to five;
  stubs removed from the recipient path entirely.

### Removed

- **`createStubFeats` and the stub compendium codepath.** Was a
  dev-testing helper; not intended for shipped play. GMs should point
  Plutonium at a real world compendium (or use the SRD feats natively).

### Fixed / Efficiency

- **Feat resolver — one-pass index.** `buildKnackFeatMap` now scans every
  Item compendium once and looks up 26 feats against the resulting index,
  down from 26 × N pack fetches. Setup dialog is noticeably faster.
- **Plutonium fixers — shared doc load.** The combined `fixPlutoniumFeats`
  loads feat docs once and hands them to both fixers, halving the
  compendium round-trips.
- **Ability roll dialog accessibility.** Ability labels now use
  `<label for>` for screen-reader association with each SELECT.
- **Stale user-facing text.** "Wait for step 11" and "in the stub
  compendium" messages removed from warn / hint strings.
- **DRY.** `KNACK_ID_RE`, `resolveTargetActor()`, `escape()`, and the
  `ABILITIES` constant extracted to `src/utils.mjs`. Six files were each
  carrying local copies.

## v0.2.4 — 2026-09-01

Trade Skill weapon proficiency picker fix — specific weapons in the pool
now use dnd5e's expected `weapon:<sim|mar>:<id>` format so they actually
render in the level-5 picker alongside shield. Previously only shield
showed up.

## v0.2.3 — 2026-09-01

Resolver `matchName` support — Magic Initiate: Druid / Sorcerer / Warlock
/ Artificer and Ritual Caster: Wizard now resolve against the bare item
names Plutonium (and 2024 dnd5e) actually ship, while keeping the
class-specific display labels in the level-2 pick hint.

## v0.2.2 — 2026-09-01

- Fixers auto-scan every writable world-scoped Item compendium (previously
  defaulted to `world.child-class-stub-feats`).
- `createStubFeats` removed from the public API.
- README setup rewritten around Plutonium's Advancement-Backing Compendium.

## v0.2.1 — 2026-09-01

- Feat resolver source-preference fix. `source: "tasha"`-marked entries
  (like Metamagic Adept) now rank a TCE match ahead of an edition match.
- `fixPlutoniumLockedFeats` and `fixPlutoniumOverpointedASIs` added to
  repair known Plutonium ASI misconfigurations.
- Preview dialogs for the fixers sized properly for long lists.

## v0.2.0 — 2026-09-01

- **Graduation flow (§ 6, step 9).** Snapshot → confirm → execute → undo.
  Strips Child items, preserves the Knack's bonus feat, grants a static
  Graduate keepsake feature. Trigger from level 5 → 6.
- **Prereq bypass on Knack feat picker (§ 5.4).** Monkey-patches
  `ItemChoiceFlow._prepareContentContext`, `FeatData.validatePrerequisites`,
  and `ItemChoiceAdvancement._evaluatePrerequisites` / `restore` so
  2024 General feats like Piercer/Durable are pickable at Child level 2
  without the level filter dropping them.
- **Trade Skill weapon list refined** to specific weapons per class,
  drawn from 2014 PHB proficiency tables.
- **Graduate keepsake feature** added to `child-features` pack.
- Multiclass-block advancement leak fixed via
  `dnd5e.preAdvancementManagerRender` hook.

## v0.1.0 — 2026-08-31

Initial release. Steps 4–8 of the design's implementation order:

- Class items (Child '14, Child '24) with runtime HP/prof overrides via
  `libWrapper` on `Actor#prepareData` (AE-based approach didn't work —
  see api-notes Q4 addendum).
- 26 Knack items, class-linked advancement chains (feat pick at level 2,
  skill/save Traits at level 3, weapon Trait at level 5).
- Feat resolver + `Prepare Knack Feats` setup dialog.
- Ability generation (pool-and-assign, auto-fire on class create) and
  Growth (level-4 aptitude picks + kh1 roll).
- Youth short-rest prompt.
- Trade Skill level-5 gold roll.
- XP track via `libWrapper` wrap on `Actor#getLevelExp` in MIXED mode.
- Guards (level cap, multiclass block both directions, background block,
  edition mixing, Knack edition match).
- Class-delete reset (restores pre-Child ability scores, clears flags).
