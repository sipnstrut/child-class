// § 8 guards and validation. Enforces:
//   1  Level cap (Child cannot exceed 5) — clamp on update.
//   2  No Child multiclass IN — an actor with a non-Child class rejects Child.
//   3  No multiclass OUT — an actor with a Child class rejects any other class.
//   5  Re-graduation — an already-graduated actor can't become a Child again
//      without a GM clearing the flag.
//   7  One edition per actor — never both child14 and child24 on the same
//      actor; enforced independently of the world-uniformity toggle (rule 9).
//   8  Knack must match edition — a `Knack '24: X` cannot attach to a
//      `child14` class and vice versa.
//   9  Optional world uniformity — when `allowMixedEditions` is off, block
//      creating a Child of a different edition than the one already in use
//      in the world.
//   11 No background while a Child — background items rejected on Child-
//      holding actors, and Child rejected on already-backgrounded actors.
//
// Every block emits `ui.notifications.warn` explaining the rule and pointing
// at graduation as the escape hatch where applicable (§ 8.4).

import { MODULE_ID } from "./config.mjs";
import { CHILD_VARIANTS } from "./variants/index.mjs";
import { triggerGraduation } from "./graduation.mjs";

const CHILD_LEVEL_CAP = 5;
const KNACK_ID_RE = /^k(14|24)([a-z]+)0*$/;

export function registerGuards() {
  Hooks.on("preUpdateItem", enforceLevelCap);
  Hooks.on("preCreateItem", enforceCreationRules);
  Hooks.on("dnd5e.preAdvancementManagerRender", enforceAdvancementRules);
}

// The `preCreateItem` guard alone isn't enough when the class comes in via
// the dnd5e AdvancementManager. Blocking the class in `preCreateItem` leaves
// the advancement-granted feats (Youth, Trade Skill) still in the same
// `createEmbeddedDocuments` batch — they pass their own preCreate hooks and
// land on the actor even though their parent class was rejected. Hooking
// `dnd5e.preAdvancementManagerRender` and returning `false` aborts the whole
// flow *before* the wizard renders, so no items are created at all.
function enforceAdvancementRules(advancementManager) {
  const actor = advancementManager?.actor;
  const clone = advancementManager?.clone;
  if (!actor || !clone) return;
  const existingIds = new Set(actor.items.map(i => i.id));
  for (const cloneItem of clone.items) {
    if (existingIds.has(cloneItem.id)) continue; // pre-existing on actor
    let result;
    if (cloneItem.type === "class") {
      const identifier = cloneItem.system?.identifier;
      const isChild = identifier in CHILD_VARIANTS;
      result = isChild
        ? checkAddChild(actor, identifier, cloneItem.name)
        : checkAddNonChild(actor, cloneItem.name);
    } else if (cloneItem.type === "background") {
      result = checkAddBackground(actor);
    }
    if (result === false) return false;
  }
}

/* --------------------------------- Level cap ---------------------------------- */

function enforceLevelCap(item, changes) {
  if (item.type !== "class") return;
  const id = item.system?.identifier;
  if (!(id in CHILD_VARIANTS)) return;
  const newLevels = foundry.utils.getProperty(changes, "system.levels");
  if (newLevels === undefined || newLevels <= CHILD_LEVEL_CAP) return;

  // 5 → 6 attempts open the graduation dialog and cancel the level bump.
  // Any other level attempt above 5 (like 3 → 8, direct edit) is clamped
  // with a warning; graduation only fires from a legitimate 5 → 6 step.
  const currentLevels = item.system?.levels ?? 0;
  if (currentLevels === CHILD_LEVEL_CAP && newLevels === CHILD_LEVEL_CAP + 1) {
    triggerGraduation(item.parent, item);
    return false;
  }
  ui.notifications?.warn(
    `The Child class is capped at level ${CHILD_LEVEL_CAP}. Use graduation to advance beyond level ${CHILD_LEVEL_CAP} (level up to ${CHILD_LEVEL_CAP + 1} from ${CHILD_LEVEL_CAP} to trigger).`
  );
  foundry.utils.setProperty(changes, "system.levels", CHILD_LEVEL_CAP);
}

/* --------------------------------- Creation rules ----------------------------- */

// preCreateItem hook signature: (item, data, options, userId). Returning
// `false` (or hook returning false) cancels the creation. dnd5e's Actor
// createEmbeddedDocuments respects that cancellation.
function enforceCreationRules(item, data, options) {
  const actor = item.parent;
  if (!actor) return;

  // Skip guard checks during advancement-driven grants — Knacks, Youth, and
  // Trade Skill are all created via ItemGrant on the Child class, and the
  // multiclass / edition-match checks would false-positive on those.
  const advancementDriven = options?.isAdvancement === true
    || item._source?.flags?.dnd5e?.advancementOrigin;

  if (item.type === "class") {
    const identifier = item.system?.identifier;
    const isChild = identifier in CHILD_VARIANTS;
    if (isChild) return checkAddChild(actor, identifier, item.name);
    return checkAddNonChild(actor, item.name);
  }

  if (item.type === "background") {
    return checkAddBackground(actor);
  }

  if (item.type === "feat" && !advancementDriven) {
    const knackMatch = item._source?._id?.match(KNACK_ID_RE);
    if (knackMatch) return checkKnackEdition(actor, knackMatch[1], item.name);
  }
}

function checkAddChild(actor, editionIdentifier, itemName) {
  // Rule 5: already graduated.
  if (actor.getFlag(MODULE_ID, "graduated")) {
    warn(`${actor.name} has already graduated. A GM must clear \`flags.child-class.graduated\` before this actor can become a Child again.`);
    return false;
  }

  // Rule 2: no Child multiclass in — reject if any non-Child class exists.
  const existingClasses = actor.items.filter(i => i.type === "class");
  const foreignClass = existingClasses.find(c => !(c.system?.identifier in CHILD_VARIANTS));
  if (foreignClass) {
    warn(`${actor.name} already holds the ${foreignClass.name} class. Child cannot multiclass in — a Child must have no other class levels.`);
    return false;
  }

  // Rule 7: one edition per actor.
  const existingChild = existingClasses.find(c => c.system?.identifier in CHILD_VARIANTS);
  if (existingChild && existingChild.system.identifier !== editionIdentifier) {
    warn(`${actor.name} already holds ${existingChild.name}. Only one Child edition per actor — remove the existing one first.`);
    return false;
  }

  // Rule 11: no background while a Child.
  const existingBg = actor.items.find(i => i.type === "background");
  if (existingBg) {
    warn(`${actor.name} already has the ${existingBg.name} background. A Child has no background until graduation — remove the background first.`);
    return false;
  }

  // Rule 9: world uniformity when allowMixedEditions is off.
  const allowMixed = game.settings.get(MODULE_ID, "allowMixedEditions");
  if (!allowMixed) {
    const worldEdition = findExistingWorldChildEdition();
    if (worldEdition && worldEdition !== editionIdentifier) {
      warn(`The world already has ${worldEdition} Children and \`allowMixedEditions\` is off. Change the world setting or use ${worldEdition} instead of ${editionIdentifier}.`);
      return false;
    }
  }
}

function checkAddNonChild(actor, itemName) {
  // Rule 3: no multiclass out — reject if actor has a Child class.
  const child = actor.items.find(i => i.type === "class" && i.system?.identifier in CHILD_VARIANTS);
  if (child) {
    warn(`${actor.name} is a Child (${child.name}). Non-Child class levels can only be gained through Graduation, not multiclassing.`);
    return false;
  }
}

function checkAddBackground(actor) {
  // Rule 11: no background while a Child.
  const child = actor.items.find(i => i.type === "class" && i.system?.identifier in CHILD_VARIANTS);
  if (!child) return;
  if (actor.getFlag(MODULE_ID, "graduationInProgress")) return; // Lifted during graduation.
  warn(`${actor.name} is a Child. Backgrounds are granted at Graduation — one can't be added while the Child class is present.`);
  return false;
}

function checkKnackEdition(actor, knackEditionKey, itemName) {
  const knackVariantId = knackEditionKey === "14" ? "child14" : "child24";
  const child = actor.items.find(i => i.type === "class" && i.system?.identifier in CHILD_VARIANTS);
  if (!child) {
    // No Child class on actor — Knacks don't attach to non-Children in
    // ordinary play, but this is the "hand-drop a Knack onto a level-0
    // character" edge case. Reject rather than silently allowing.
    warn(`${itemName} can only be attached to a Child actor.`);
    return false;
  }
  if (child.system.identifier !== knackVariantId) {
    warn(`${itemName} belongs to ${knackVariantId}; ${actor.name} holds ${child.system.identifier}. Knack items must match the Child edition.`);
    return false;
  }
}

/* --------------------------------- Helpers ------------------------------------ */

function findExistingWorldChildEdition() {
  for (const actor of game.actors) {
    for (const item of actor.items) {
      if (item.type !== "class") continue;
      if (item.system?.identifier in CHILD_VARIANTS) return item.system.identifier;
    }
  }
  return null;
}

function warn(msg) {
  console.warn(`[child-class] ${msg}`);
  ui.notifications?.warn(msg);
}
