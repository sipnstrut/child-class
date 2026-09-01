#!/usr/bin/env node
// Build script: pack/unpack all module compendia via @foundryvtt/foundryvtt-cli.
// Reads/writes packs-src/<name>/ (JSON sources, committed) <-> packs/<name>/ (LevelDB, gitignored).

import { spawnSync } from "node:child_process";
import { readdirSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PACKS_SRC = join(ROOT, "packs-src");
const PACKS_OUT = join(ROOT, "packs");
const MODULE_ID = "child-class";

const mode = process.argv[2] === "unpack" ? "unpack" : "pack";
const [inRoot, outRoot] = mode === "pack"
  ? [PACKS_SRC, PACKS_OUT]
  : [PACKS_OUT, PACKS_SRC];

if (!existsSync(inRoot)) {
  console.log(`${inRoot} does not exist. Nothing to ${mode}.`);
  process.exit(0);
}

const packs = readdirSync(inRoot, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name);

if (packs.length === 0) {
  console.log(`No packs found in ${inRoot}. Nothing to ${mode}.`);
  process.exit(0);
}

mkdirSync(outRoot, { recursive: true });

for (const name of packs) {
  console.log(`[${mode}] ${name}`);
  // fvtt creates a <name>/ subdirectory inside --out, so pass the parent root
  // (packs/ or packs-src/) rather than <root>/<name>, which double-nests.
  const args = [
    "package", mode, name,
    "--id", MODULE_ID,
    "--type", "Module",
    "--in", join(inRoot, name),
    "--out", outRoot
  ];
  const r = spawnSync("fvtt", args, { stdio: "inherit", shell: true });
  if (r.status !== 0) {
    console.error(`fvtt ${mode} failed for "${name}" (exit ${r.status}).`);
    process.exit(r.status ?? 1);
  }
}
