// The '24 Knack table's TCE markings (2026-09-25): TCE stands only where the
// 2024 PHB prints no feat of the same name. Driven through the real resolver
// with a hand-built index, so no Foundry is needed.

import { test } from "node:test";
import assert from "node:assert/strict";

import child24 from "../src/variants/child24.mjs";
import { resolveFeat } from "../src/feat-resolver.mjs";

const TCE = (name) => ({ uuid: `tce.${name}`, packName: "Tasha's Feats", rules: "2014", book: "Tasha's Cauldron of Everything" });
const PHB24 = (name) => ({ uuid: `phb24.${name}`, packName: "PHB 2024 Feats", rules: "2024", book: "Player's Handbook" });

function entry(cls, name) {
  return child24.knackTable[cls].find((e) => e.name === name);
}

async function resolve(cls, name, cands) {
  const e = entry(cls, name);
  const index = new Map([[(e.matchName ?? e.name).toLowerCase(), cands]]);
  return (await resolveFeat(e.name, { edition: "2024", source: e.source, matchName: e.matchName, index })).uuid;
}

for (const [cls, name] of [["rogue", "Skill Expert"], ["warlock", "Telepathic"]]) {
  test(`'24 ${name} takes the 2024 PHB printing`, async () => {
    assert.equal(entry(cls, name).source, undefined);
    assert.equal(await resolve(cls, name, [TCE(name), PHB24(name)]), `phb24.${name}`);
  });
}

for (const [cls, name] of [["sorcerer", "Metamagic Adept"], ["artificer", "Gunner"]]) {
  test(`'24 ${name} stays with TCE`, async () => {
    assert.equal(entry(cls, name).source, "tasha");
    assert.equal(await resolve(cls, name, [PHB24(name), TCE(name)]), `tce.${name}`);
  });
}
