// Class-deletion cleanup. When a Child class item is removed from an actor
// *outside* a graduation flow, undo the state the class placed on that actor:
// restore ability scores from the pre-Child snapshot and clear the Child
// flag namespace. Feature items granted by the class advancement chain
// (Youth, Trade Skill, Knack) are removed by dnd5e's own advancement reverse
// path — this hook only handles what the module wrote outside that path.
//
// Graduation (§ 6) intentionally KEEPS ability scores, tool proficiencies,
// gold, items, and the Knack feat per § 6.4. To distinguish the two paths
// this hook checks `flags.child-class.graduationInProgress` (set by the
// graduation flow when it lands in step 9) and no-ops during graduation.

import { MODULE_ID } from "./config.mjs";
import { CHILD_VARIANTS } from "./variants/index.mjs";
import { ABILITIES } from "./utils.mjs";

const CLEARED_FLAGS = [
  "scoresRolled", "growthApplied", "tradeSkillApplied",
  "abilityRule", "knack",
  "preChildAbilities"
];

export function registerReset() {
  Hooks.on("deleteItem", detectClassDeletion);
}

async function detectClassDeletion(item, options, userId) {
  if (userId !== game.user.id) return;
  if (item.type !== "class") return;
  if (!(item.system?.identifier in CHILD_VARIANTS)) return;
  const actor = item.parent;
  if (!actor) return;
  if (actor.getFlag(MODULE_ID, "graduationInProgress")) return;

  const snapshot = actor.getFlag(MODULE_ID, "preChildAbilities");
  const updates = {};

  if (snapshot) {
    for (const abbr of ABILITIES) {
      if (typeof snapshot[abbr] === "number") {
        updates[`system.abilities.${abbr}.value`] = snapshot[abbr];
      }
    }
  }
  for (const key of CLEARED_FLAGS) {
    updates[`flags.${MODULE_ID}.-=${key}`] = null;
  }

  await actor.update(updates);
  ui.notifications?.info(
    `${actor.name}: Child class removed. ${snapshot ? "Ability scores reverted, " : ""}Child flags cleared.`
  );
}
