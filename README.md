# Child Class — Foundry VTT module

A Foundry VTT module (`dnd5e` system, 5.3.0+) that adds the **Child** class from
Sip 'n' Strut's *Humble Beginnings* to the compendium as a playable option.
Ships the 2014 and 2024 editions as sibling class items in the same module,
plus the Unexceptional (default) and Unremarkable (table-variant)
ability-generation rules.

Read the class online at **[sipandstrut.com/childclass](https://www.sipandstrut.com/childclass)**.

## Status

**In development.** The [design spec](docs/design.md) is rules-complete and
API-verified against `dnd5e` 5.3.3 (see [docs/api-notes.md](docs/api-notes.md)
for the verification findings). Implementation is scaffolded but not
finished — HP override, ability rules, variants registry, and settings are in
place; Growth, the Knack, Mentor's Knowledge, Trade Skill, and the whole
Graduation flow follow the order in `design.md` § 13. **Do not install this
in a live game yet.**

## Repo layout

```
docs/
  design.md         Implementation spec — source of truth
  api-notes.md      dnd5e 5.3.3 verification pass findings
src/                Module code (partially implemented — see design.md § 13)
packs-src/          Hand-authored JSON for compendium packs
build/              Pack build tooling (foundryvtt-cli via build/pack.mjs)
lang/en.json        English strings
module.json         Foundry manifest
```

`packs/` (the built LevelDB) and `node_modules/` are gitignored.

## Build

```bash
npm install
npm run pack        # rebuild packs/ from packs-src/ via foundryvtt-cli
```

## Compatibility

- Foundry VTT v13+ (verified v14)
- `dnd5e` system 5.3.0+ (verified 5.3.3)
- `lib-wrapper` required (declared in `module.json`)

## Credit

Child class by Joseph Avery, Sip 'n' Strut — *Humble Beginnings* (DMs Guild,
2016; revised 2026). This module packages the class for Foundry VTT; the
rules and source material are Joe's.
