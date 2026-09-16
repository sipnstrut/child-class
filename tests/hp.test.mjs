// Cover for the § 5.1 HP override, and specifically for the v0.3.4 bug: the
// override replaced `hp.max` outright, discarding the
// `hp.bonuses.level × character level + hp.bonuses.overall` term that dnd5e
// had already folded in — so Tough and every other max-HP effect did nothing
// on a Child.
//
// Both variants use hpFirst 6 / hpPerLevel 1 (child24 inherits them), so the
// baseline at level L with CON mod C is 6 + (L - 1) + L × C.

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  installFoundryGlobals,
  installDnd5e,
  captureLibWrapper,
  makeChildActor
} from "./helpers/stubs.mjs";
import { registerHpAndProf } from "../src/hp.mjs";

let getWrapper;

beforeEach(() => {
  installFoundryGlobals();
  installDnd5e();
  getWrapper = captureLibWrapper();
  registerHpAndProf();
});

/** Run the registered `prepareData` wrapper over an actor and return its hp. */
function prepare(actor) {
  getWrapper().call(actor, () => {});
  return actor.system.attributes.hp;
}

describe("Child HP override", () => {
  test("level 5, CON +2, no bonuses", () => {
    assert.equal(prepare(makeChildActor()).max, 20);
  });

  test("level 1 is hpFirst + CON", () => {
    assert.equal(prepare(makeChildActor({ level: 1, con: 3 })).max, 9);
  });

  test("both editions share the formula", () => {
    assert.equal(
      prepare(makeChildActor({ variant: "child14" })).max,
      prepare(makeChildActor({ variant: "child24" })).max
    );
  });

  test("never drops below 1, however bad the CON", () => {
    assert.equal(prepare(makeChildActor({ level: 1, con: -5 })).max, 1);
  });

  test("leaves a non-Child character untouched", () => {
    const actor = makeChildActor();
    actor.items = [{ type: "class", identifier: "fighter", system: { identifier: "fighter", levels: 5 } }];

    assert.equal(prepare(actor).max, 0, "hp.max should be whatever dnd5e left there");
  });

  describe("max-HP bonuses (the Tough regression)", () => {
    test("a per-level bonus is multiplied by character level", () => {
      // Tough: +2 on system.attributes.hp.bonuses.level. 20 + 2 × 5.
      const hp = prepare(makeChildActor({ bonuses: { level: "+2", overall: "" } }));

      assert.equal(hp.max, 30);
    });

    test("an overall bonus is flat", () => {
      assert.equal(prepare(makeChildActor({ bonuses: { level: "", overall: "5" } })).max, 25);
    });

    test("both apply together", () => {
      assert.equal(prepare(makeChildActor({ bonuses: { level: "+2", overall: "5" } })).max, 35);
    });

    test("the multiplier is character level, not Child level", () => {
      // A level-3 Child inside a level-7 character: baseline 6 + 2 + 3×2 = 14,
      // plus 2 × 7 from Tough.
      const hp = prepare(makeChildActor({
        level: 3,
        characterLevel: 7,
        bonuses: { level: "+2", overall: "" }
      }));

      assert.equal(hp.max, 28);
    });

    test("a negative bonus cannot push max HP below 1", () => {
      assert.equal(prepare(makeChildActor({ level: 1, con: 0, bonuses: { level: "", overall: "-99" } })).max, 1);
    });

    test("degrades to the baseline rather than NaN when simplifyBonus is missing", () => {
      installDnd5e({ withSimplifyBonus: false });

      assert.equal(prepare(makeChildActor({ bonuses: { level: "+2", overall: "" } })).max, 20);
    });
  });

  describe("derived hp fields", () => {
    test("are recomputed against the bonused max", () => {
      const hp = prepare(makeChildActor({ bonuses: { level: "+2", overall: "" } }));

      assert.deepEqual(
        { effectiveMax: hp.effectiveMax, value: hp.value, damage: hp.damage, pct: hp.pct },
        { effectiveMax: 30, value: 30, damage: 0, pct: 100 }
      );
    });

    test("clamp a wounded actor rather than healing it to the new max", () => {
      const hp = prepare(makeChildActor({ sourceHp: 4, bonuses: { level: "+2", overall: "" } }));

      assert.equal(hp.value, 4);
      assert.equal(hp.damage, 26);
    });

    test("a fresh Child with no stored hp.value starts at full", () => {
      const hp = prepare(makeChildActor({ sourceHp: null }));

      assert.equal(hp.value, hp.max);
      assert.equal(hp.damage, 0);
    });
  });

  describe("proficiency bonus", () => {
    test("follows the variant's per-level curve", () => {
      const profAt = level => {
        const actor = makeChildActor({ level });
        prepare(actor);
        return actor.system.attributes.prof;
      };

      assert.deepEqual([1, 2, 3, 4, 5].map(profAt), [1, 1, 2, 2, 2]);
    });
  });
});
