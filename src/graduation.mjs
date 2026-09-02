// § 6 Graduation. The Child completes level 5 and transforms.
//
// Design pivot (2026-09-01): the graduation flow does NOT programmatically
// add a new class. It strips all Child-owned items, preserves what the
// design § 6.4 says should be retained, grants a "Graduate" keepsake feature
// summarizing the outcome, and stops. The player then drops their next
// class onto the sheet using dnd5e's normal drag-drop / AdvancementManager
// path — that's the only reliable way to get proper level-up choices,
// subclass at target level, and background integration wired in. XP stays
// untouched so a Knack-matching class drop lands at level 2 naturally.
//
// Retained (per § 6.4):
//   - Ability scores (including Growth increases)
//   - Currency and all items
//   - The Knack's bonus feat (advancement lineage flags stripped so it
//     becomes an ordinary feat)
//   - The Trade Skill tool / language proficiency (already granted via
//     Trait advancement on the actor's trait arrays; not revoked)
//
// Removed:
//   - Child class item (and the transferring HP + prof AEs, plus the
//     runtime overrides via reset.mjs cleanup — actually gated by the
//     graduationInProgress flag so reset skips)
//   - Youth, Trade Skill (feature items), Knack (item), the Knack's own
//     inline advancements (skill / save / weapon Traits)
//
// Not automatically revoked (MVP gap called out in the retention summary):
//   - Mentor's Knowledge skill / save proficiency (granted at Knack level 3)
//   - Trade Skill weapon / shield proficiency (granted at Knack level 5)
//   These live in actor.system.traits arrays without per-source tagging.
//
// Snapshot is written to flags.child-class.preGraduation so a GM can undo.

import { MODULE_ID } from "./config.mjs";
import { CHILD_VARIANTS } from "./variants/index.mjs";

const CHILD_LEVEL_CAP = 5;
const YOUTH_ID = "featYouth0000000";
const TRADE_SKILL_ID = "featTradeSkill00";
const GRADUATE_ID = "featGraduate0000";
const GRADUATE_UUID = `Compendium.${MODULE_ID}.child-features.Item.${GRADUATE_ID}`;
const KNACK_ID_RE = /^k(14|24)([a-z]+)0*$/;

export function registerGraduation() {
  const module = game.modules.get(MODULE_ID);
  if (module) {
    module.api ??= {};
    module.api.graduate = openGraduationDialog;
    module.api.undoGraduation = undoGraduation;
  }
}

/* ---------------------------------- Trigger ----------------------------------- */

export function triggerGraduation(actor) {
  openGraduationDialog(actor).catch(err => {
    console.error("[child-class] graduation error:", err);
    ui.notifications?.error("Graduation failed — see console.");
  });
}

/* ---------------------------------- Main flow --------------------------------- */

export async function openGraduationDialog(actor) {
  actor ??= resolveTargetActor();
  if (!actor) {
    ui.notifications?.warn("Pass an actor: `api.graduate(actor)`.");
    return;
  }
  const childClass = actor.items.find(
    i => i.type === "class" && i.system?.identifier in CHILD_VARIANTS
  );
  if (!childClass) {
    ui.notifications?.warn(`${actor.name} is not a Child. Graduation applies only to Child actors.`);
    return;
  }
  const variant = CHILD_VARIANTS[childClass.system.identifier];

  if ((childClass.system.levels ?? 0) < CHILD_LEVEL_CAP) {
    const proceed = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Graduate Early?" },
      content: `<p>${escape(actor.name)} is only at Child level ${childClass.system.levels}. Graduate anyway?</p>`
    });
    if (!proceed) return;
  }

  const confirmed = await confirmRetention(actor, variant);
  if (!confirmed) return;

  await executeGraduation(actor, variant);
}

/* ------------------------------ Retention summary ----------------------------- */

async function confirmRetention(actor, variant) {
  const knack = actor.getFlag(MODULE_ID, "knack") ?? findKnackClassKey(actor);
  const childLevels = actor.items.find(i => i.type === "class" && i.system?.identifier === variant.id)?.system?.levels ?? CHILD_LEVEL_CAP;

  const kept = [
    "All ability scores (including Growth increases)",
    "All items and gold",
    "The Knack's bonus feat (kept as a pure bonus — no ASI slot consumed)",
    "The Trade Skill tool / language proficiency"
  ];
  const lost = [
    `The Child class item (${escape(variant.displayName)}, ${childLevels} levels)`,
    "The Youth feature",
    "The Knack item itself (its history is preserved in the Graduate keepsake)",
    "The Trade Skill feature description"
  ];
  const added = [
    "A <strong>Graduate</strong> keepsake feature summarizing what you carried out"
  ];

  const listHtml = (items) => `<ul style="margin: 4px 0 8px 0;">${items.map(i => `<li>${i}</li>`).join("")}</ul>`;

  const content = `
    <div>
      <p><strong>${escape(actor.name)}</strong> is graduating from ${escape(variant.displayName)}${knack ? ` — aspiring ${escape(knack)}` : ""}.</p>
      <h4 style="margin: 8px 0 4px 0;">Kept</h4>
      ${listHtml(kept)}
      <h4 style="margin: 8px 0 4px 0;">Lost</h4>
      ${listHtml(lost)}
      <h4 style="margin: 8px 0 4px 0;">Added</h4>
      ${listHtml(added)}
      <p style="font-size: 0.9em; color: var(--color-caution, #a80); margin-top: 8px;">
        <strong>Next step:</strong> after graduation, drag your new class from the compendium onto your sheet — dnd5e's normal level-up flow will handle background, subclass timing, and all class advancements. If your new class matches your Knack, your Child XP total will place you at level 2 automatically.
      </p>
    </div>
  `;

  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: "Graduation — Confirm" },
    content,
    buttons: [
      { action: "confirm", label: "Graduate", default: true },
      { action: "cancel", label: "Cancel" }
    ]
  });
  return result === "confirm";
}

/* ---------------------------------- Execution --------------------------------- */

async function executeGraduation(actor, variant) {
  await captureSnapshot(actor);
  await actor.setFlag(MODULE_ID, "graduationInProgress", true);

  try {
    const childClass = actor.items.find(
      i => i.type === "class" && i.system?.identifier === variant.id
    );
    const childLevel = childClass?.system?.levels ?? CHILD_LEVEL_CAP;

    // Orphan the bonus feat BEFORE deleting anything else — otherwise the
    // Knack delete would clobber the origin flag reference.
    const bonusFeat = findBonusFeat(actor);
    if (bonusFeat) {
      await bonusFeat.update({
        "flags.dnd5e.-=advancementOrigin": null,
        "flags.dnd5e.-=advancementRoot": null
      });
    }

    // Collect Child-owned items to delete.
    const toDelete = [];
    if (childClass) toDelete.push(childClass.id);
    const youth = findYouth(actor);
    if (youth) toDelete.push(youth.id);
    const tradeSkill = findTradeSkill(actor);
    if (tradeSkill) toDelete.push(tradeSkill.id);
    const knack = findKnack(actor);
    if (knack) toDelete.push(knack.id);
    if (toDelete.length) {
      await actor.deleteEmbeddedDocuments("Item", toDelete);
    }

    // Grant the Graduate keepsake.
    const graduateDoc = await fromUuid(GRADUATE_UUID);
    if (graduateDoc) {
      await actor.createEmbeddedDocuments("Item", [graduateDoc.toObject()]);
    }

    // Set graduated flag, clear Child-specific runtime state (but keep
    // preGraduation and preChildAbilities for undo / history).
    const knackKey = actor.getFlag(MODULE_ID, "knack") ?? findKnackClassKey(actor) ?? null;
    const bonusFeatName = bonusFeat?.name ?? null;
    await actor.update({
      [`flags.${MODULE_ID}.graduated`]: {
        from: variant.id,
        childLevel,
        knack: knackKey,
        bonusFeat: bonusFeatName,
        date: Date.now()
      },
      [`flags.${MODULE_ID}.-=scoresRolled`]: null,
      [`flags.${MODULE_ID}.-=growthApplied`]: null,
      [`flags.${MODULE_ID}.-=tradeSkillApplied`]: null,
      [`flags.${MODULE_ID}.-=abilityRule`]: null
    });

    await broadcastGraduationCard(actor, variant, { knack: knackKey, bonusFeat: bonusFeatName, childLevel });
  } finally {
    await actor.unsetFlag(MODULE_ID, "graduationInProgress");
  }
}

/* ---------------------------------- Snapshot ---------------------------------- */

async function captureSnapshot(actor) {
  const snapshot = {
    timestamp: Date.now(),
    userId: game.user.id,
    actor: actor.toObject()
  };
  await actor.setFlag(MODULE_ID, "preGraduation", snapshot);
}

async function undoGraduation(actor) {
  actor ??= resolveTargetActor();
  if (!actor) {
    ui.notifications?.warn("Pass an actor: `api.undoGraduation(actor)`.");
    return;
  }
  if (!game.user.isGM) {
    ui.notifications?.warn("Only GMs can undo graduation.");
    return;
  }
  const snapshot = actor.getFlag(MODULE_ID, "preGraduation");
  if (!snapshot?.actor) {
    ui.notifications?.warn(`No pre-graduation snapshot exists for ${actor.name}.`);
    return;
  }
  const confirmed = await foundry.applications.api.DialogV2.confirm({
    window: { title: "Undo Graduation" },
    content: `<p>Restore <strong>${escape(actor.name)}</strong> to the pre-graduation snapshot from ${new Date(snapshot.timestamp).toLocaleString()}? This overwrites all current actor state.</p>`
  });
  if (!confirmed) return;

  await actor.setFlag(MODULE_ID, "graduationInProgress", true);
  try {
    const currentIds = actor.items.map(i => i.id);
    if (currentIds.length) await actor.deleteEmbeddedDocuments("Item", currentIds);

    await actor.update({
      system: snapshot.actor.system,
      effects: snapshot.actor.effects,
      flags: snapshot.actor.flags
    }, { diff: false, recursive: false });
    if (snapshot.actor.items?.length) {
      await actor.createEmbeddedDocuments("Item", snapshot.actor.items);
    }
    await actor.unsetFlag(MODULE_ID, "graduated");
    await actor.unsetFlag(MODULE_ID, "preGraduation");
  } finally {
    await actor.unsetFlag(MODULE_ID, "graduationInProgress");
  }

  ui.notifications?.info(`${actor.name}: pre-graduation snapshot restored.`);
}

/* ---------------------------------- Helpers ----------------------------------- */

function findYouth(actor) {
  return actor.items.get(YOUTH_ID)
    ?? actor.items.find(i => i._source?._id === YOUTH_ID)
    ?? actor.items.find(i => i.name === "Youth");
}

function findTradeSkill(actor) {
  return actor.items.get(TRADE_SKILL_ID)
    ?? actor.items.find(i => i._source?._id === TRADE_SKILL_ID)
    ?? actor.items.find(i => i.name === "Trade Skill");
}

function findKnack(actor) {
  return actor.items.find(i => i._source?._id?.match(KNACK_ID_RE) || i.id?.match(KNACK_ID_RE))
    ?? actor.items.find(i => i.name?.startsWith("Knack '"));
}

function findKnackClassKey(actor) {
  const knack = findKnack(actor);
  if (!knack) return null;
  const m = knack._source?._id?.match(KNACK_ID_RE) ?? knack.id?.match(KNACK_ID_RE);
  if (m) return m[2];
  const named = knack.name?.replace(/^Knack '\d+:\s*/i, "").toLowerCase().trim();
  return named || null;
}

function findBonusFeat(actor) {
  return actor.items.find(i =>
    i.type === "feat" &&
    typeof i._source?.flags?.dnd5e?.advancementOrigin === "string" &&
    i._source.flags.dnd5e.advancementOrigin.endsWith(".advFeatPick00000")
  );
}

async function broadcastGraduationCard(actor, variant, details) {
  const content = `
    <div>
      <h3>Graduation</h3>
      <p><strong>${escape(actor.name)}</strong> has finished ${escape(variant.displayName)} at level ${details.childLevel} and grown up.</p>
      <ul>
        ${details.knack ? `<li>Knack: ${escape(details.knack)}</li>` : ""}
        ${details.bonusFeat ? `<li>Retained feat: ${escape(details.bonusFeat)}</li>` : ""}
        <li>Drop your next class onto the sheet to continue.</li>
      </ul>
    </div>
  `;
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content
  });
}

function resolveTargetActor() {
  const controlled = canvas?.tokens?.controlled?.[0];
  if (controlled?.actor) return controlled.actor;
  return game.user.character ?? null;
}

function escape(s) {
  return String(s ?? "").replace(/[&<>"']/g, ch => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]
  ));
}
