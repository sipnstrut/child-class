// § 5.8 Trade Skill runtime bits. The tool/language Trait and the weapon/
// shield Trait fire through dnd5e's normal advancement chain (authored on the
// Trade Skill feature and the Knack item respectively). What's left to us:
//
//   (c) Roll 2d<KnackHitDie> gp and add to the actor's currency.
//   (d) Compendium prompt for one item the character is proficient with —
//       deferred for MVP (see design § 5.8: "If filtering proves impractical,
//       fall back to an unfiltered browser with a warning line").
//
// Trigger: `updateItem` on a Child class item hitting level 5. Idempotent via
// `flags.child-class.tradeSkillApplied`. Reads Knack hit die from the actor's
// recorded Knack (`flags.child-class.knack`, populated when the Knack is
// granted at level 2 — currently derived by scanning items since we haven't
// yet added the write-the-flag hook; see TODO below).

import { MODULE_ID } from "./config.mjs";
import { CHILD_VARIANTS } from "./variants/index.mjs";
import { KNACK_CLASSES } from "./variants/knack-classes.mjs";
import { KNACK_ID_RE, escape, resolveTargetActor } from "./utils.mjs";

export function registerTradeSkill() {
  const module = game.modules.get(MODULE_ID);
  if (module) {
    module.api ??= {};
    module.api.rollTradeSkillGold = rollTradeSkillGold;
  }
  Hooks.on("updateItem", detectLevel5);
}

function detectLevel5(item, changes, options, userId) {
  if (userId !== game.user.id) return;
  if (!game.settings.get(MODULE_ID, "autoFireDialogs")) return;
  if (item.type !== "class") return;
  if (!(item.system?.identifier in CHILD_VARIANTS)) return;
  const newLevel = foundry.utils.getProperty(changes, "system.levels");
  if (newLevel !== 5) return;
  const actor = item.parent;
  if (!actor) return;
  if (actor.getFlag(MODULE_ID, "tradeSkillApplied")) return;
  rollTradeSkillGold(actor).catch(err => console.error("[child-class] trade skill error:", err));
}

export async function rollTradeSkillGold(actor) {
  actor ??= resolveTargetActor();
  if (!actor) {
    ui.notifications?.warn("Pass an actor: `api.rollTradeSkillGold(actor)`.");
    return;
  }
  const classKey = findKnackClass(actor);
  if (!classKey) {
    ui.notifications?.warn(
      `Cannot roll Trade Skill gold: no Knack item on ${actor.name}. Pick a Knack at level 2 first.`
    );
    return;
  }
  const knack = KNACK_CLASSES[classKey];
  if (!knack?.hitDie) {
    ui.notifications?.warn(`Cannot roll Trade Skill gold: no hit die for Knack class "${classKey}".`);
    return;
  }

  const formula = `2${knack.hitDie}`;
  const roll = new Roll(formula);
  await roll.evaluate();

  const decision = await foundry.applications.api.DialogV2.wait({
    window: { title: "Trade Skill — Gold Roll" },
    content: `
      <div>
        <p>Knack class: <strong>${escape(knack.label)}</strong> (${escape(knack.hitDie)}).</p>
        <p>Roll: <code>${escape(formula)}</code> → <strong>${roll.total} gp</strong>.</p>
        <p style="font-size: 0.9em; color: var(--color-text-secondary, #888);">
          Apply adds the gold to <code>system.currency.gp</code> and marks Trade Skill as applied so it can only fire once.
        </p>
      </div>
    `,
    buttons: [
      { action: "apply", label: "Apply", default: true },
      { action: "cancel", label: "Cancel" }
    ]
  });
  if (decision !== "apply") return;

  const gp = actor.system?.currency?.gp ?? 0;
  await actor.update({
    "system.currency.gp": gp + roll.total,
    [`flags.${MODULE_ID}.tradeSkillApplied`]: Date.now()
  });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div><h3>Trade Skill</h3><p>${escape(knack.label)} Knack: ${escape(formula)} = <strong>${roll.total} gp</strong>.</p></div>`,
    rolls: [roll]
  });

  // (d) One item the character is proficient with — design § 5.8 says "a
  // prompt with a compendium browser filtered to items the character is
  // proficient with. If filtering proves impractical, fall back to an
  // unfiltered browser with a warning line." Filtering by actor's live
  // trait arrays across every enabled compendium isn't practical here, so
  // we open dnd5e's compendium browser at the Equipment tab and note the
  // caveat in a chat card. Player picks and drags to the sheet as normal.
  await promptForProficientItem(actor, knack);
}

async function promptForProficientItem(actor, knack) {
  const proceed = await foundry.applications.api.DialogV2.confirm({
    window: { title: "Trade Skill — Gear" },
    content: `
      <div>
        <p><strong>${escape(actor.name)}</strong> also gains <em>one item they are proficient with</em>. Open the equipment browser?</p>
        <p style="font-size: 0.9em; color: var(--color-text-secondary, #888);">
          The browser opens unfiltered — pick anything your character is proficient with per the ${escape(knack.label)} class list, drag it onto the sheet, and the GM confirms.
        </p>
      </div>
    `
  });
  if (!proceed) return;
  try {
    const browser = dnd5e?.applications?.CompendiumBrowser;
    if (browser?.select) {
      await browser.select({ filters: { locked: { types: new Set(["equipment", "weapon", "consumable", "loot"]) } } });
    } else if (browser) {
      new browser({ tab: "items" }).render(true);
    } else {
      ui.notifications?.info("Open Compendium Packs → dnd5e Items to pick a proficient item, drag to sheet.");
    }
  } catch (err) {
    console.error("[child-class] Trade Skill item browser failed:", err);
    ui.notifications?.info("Open the Compendium Packs sidebar and drag a proficient item onto the sheet.");
  }
}

// Locate the Knack class key from an actor's items. Falls back to the actor's
// `flags.child-class.knack` if the item was renamed. TODO once graduation
// snapshotting lands: write the flag at Knack grant time so this doesn't need
// the item scan (§ 5.4 already calls for the flag write).
function findKnackClass(actor) {
  for (const item of actor.items) {
    const m = item._source?._id?.match(KNACK_ID_RE) ?? item.id?.match(KNACK_ID_RE);
    if (m) return m[2];
  }
  // Fallback: parse the class from the item name if _id was reassigned.
  for (const item of actor.items) {
    if (!item.name?.startsWith("Knack '")) continue;
    const classPart = item.name.replace(/^Knack '\d+:\s*/i, "").toLowerCase().trim();
    if (KNACK_CLASSES[classPart]) return classPart;
  }
  return actor.getFlag(MODULE_ID, "knack") ?? null;
}

