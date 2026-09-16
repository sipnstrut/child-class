// Regression cover for the v0.3.4 Knack-pool bug: the resolved feat pool was
// injected only into the compendium's document cache, which Foundry flushes
// 300s after last access, so the picker was populated for the GM who had just
// run Prepare Knack Feats and empty for everyone else. `ensureKnackPool` fills
// the pool at render time from the setting instead, where no cache expires.

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { installFoundryGlobals, makeKnackAdvancement } from "./helpers/stubs.mjs";
import { ensureKnackPool } from "../src/knack-pool.mjs";

const KNACK = id => `Compendium.child-class.child-knacks.Item.${id}`;

const FEAT_MAP = {
  child24: {
    fighter: [
      { name: "Tough", uuid: "Compendium.world.feats.Item.aaa" },
      { name: "Savage Attacker", uuid: null },
      { name: "Alert", uuid: "Compendium.world.feats.Item.bbb" }
    ],
    wizard: []
  },
  child14: {
    bard: [{ name: "Actor", uuid: "Compendium.world.feats.Item.ccc" }]
  }
};

let settings;

beforeEach(() => {
  ({ settings } = installFoundryGlobals({
    settings: { "child-class.knackFeatMap": structuredClone(FEAT_MAP) }
  }));
});

describe("ensureKnackPool", () => {
  test("injects the resolved uuids and drops unresolved entries", () => {
    const adv = makeKnackAdvancement(KNACK("k24fighter000000"));

    assert.equal(ensureKnackPool(adv), true);
    assert.deepEqual(adv.configuration.pool, [
      { uuid: "Compendium.world.feats.Item.aaa" },
      { uuid: "Compendium.world.feats.Item.bbb" }
    ]);
  });

  test("hides the drop target once the pool has real entries", () => {
    const adv = makeKnackAdvancement(KNACK("k24fighter000000"));
    ensureKnackPool(adv);

    assert.equal(adv.configuration.allowDrops, false);
  });

  test("maps a '14 Knack id onto the child14 variant", () => {
    const adv = makeKnackAdvancement(KNACK("k14bard000000000"));

    assert.equal(ensureKnackPool(adv), true);
    assert.deepEqual(adv.configuration.pool, [{ uuid: "Compendium.world.feats.Item.ccc" }]);
  });

  test("leaves an already-populated pool alone", () => {
    const existing = [{ uuid: "Compendium.world.feats.Item.zzz" }];
    const adv = makeKnackAdvancement(KNACK("k24fighter000000"), { pool: existing });

    assert.equal(ensureKnackPool(adv), false);
    assert.deepEqual(adv.configuration.pool, existing);
  });

  test("ignores an item that is not one of our Knacks", () => {
    const adv = makeKnackAdvancement("Compendium.dnd5e.classfeatures.Item.NotAKnack");

    assert.equal(ensureKnackPool(adv), false);
    assert.deepEqual(adv.configuration.pool, []);
  });

  for (const via of ["compendiumSource", "dnd5eFlag", "coreFlag", "bareId"]) {
    test(`resolves the Knack id via ${via}`, () => {
      const id = via === "bareId" ? "k24fighter000000" : KNACK("k24fighter000000");
      const adv = makeKnackAdvancement(id, { via });

      assert.equal(ensureKnackPool(adv), true);
      assert.equal(adv.configuration.pool.length, 2);
    });
  }

  describe("when nothing is available to inject", () => {
    test("keeps the drop target for a Knack with no map entry", () => {
      const adv = makeKnackAdvancement(KNACK("k24paladin00000"));

      assert.equal(ensureKnackPool(adv), false);
      assert.equal(adv.configuration.allowDrops, true, "the manual escape hatch must survive");
    });

    test("keeps the drop target when every candidate failed to resolve", () => {
      settings["child-class.knackFeatMap"].child24.fighter = [{ name: "Tough", uuid: null }];
      const adv = makeKnackAdvancement(KNACK("k24fighter000000"));

      assert.equal(ensureKnackPool(adv), false);
      assert.equal(adv.configuration.allowDrops, true);
    });

    test("keeps the drop target when the GM has never run the setup workflow", () => {
      settings["child-class.knackFeatMap"] = {};
      const adv = makeKnackAdvancement(KNACK("k24fighter000000"));

      assert.equal(ensureKnackPool(adv), false);
      assert.equal(adv.configuration.allowDrops, true);
    });

    test("survives settings not being registered yet", () => {
      globalThis.game = { settings: { get: () => { throw new Error("not registered"); } } };
      const adv = makeKnackAdvancement(KNACK("k24fighter000000"));

      assert.doesNotThrow(() => ensureKnackPool(adv));
      assert.equal(ensureKnackPool(adv), false);
    });

    test("tolerates a malformed advancement", () => {
      assert.equal(ensureKnackPool(undefined), false);
      assert.equal(ensureKnackPool({}), false);
      assert.equal(ensureKnackPool({ configuration: { pool: [] } }), false);
    });
  });
});
