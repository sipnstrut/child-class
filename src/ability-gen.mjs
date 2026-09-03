// § 5.3 ability generation. Rolls a pool of six values under the actor's
// active rule, lets the player assign each value to an ability of their
// choice, then writes on Apply.
//
// The pool-and-assign shape (vs. one-roll-per-ability) is the D&D convention
// for rolled generation and matches how the source rule is played at the
// table; the earlier "each ability rolled independently" language in § 5.3
// was interpreted too literally in the first pass. Correction 2026-09-01.
//
// Guardrails:
//   - Refuses to re-roll if `flags.child-class.scoresRolled` is set, unless
//     the GM confirms an explicit re-roll.
//   - Records `flags.child-class.abilityRule` at roll time — Growth (§ 5.7)
//     reads *that*, not the current world setting, so changing the world
//     rule later never retroactively alters an existing character.
//   - Clamps at 20 on write per § 5.3 (neither shipped rule can reach 20 at
//     level 1, but the cap is enforced defensively).

import { MODULE_ID } from "./config.mjs";
import { getAbilityRule } from "./ability-rules.mjs";
import { CHILD_VARIANTS } from "./variants/index.mjs";
import { ABILITIES, ABILITY_LABELS, escape, resolveTargetActor } from "./utils.mjs";

export function registerAbilityGen() {
  const module = game.modules.get(MODULE_ID);
  if (module) {
    module.api ??= {};
    module.api.rollChildAbilities = openRollDialog;
  }
  Hooks.on("createItem", detectLevel1);
}

function detectLevel1(item, options, userId) {
  if (userId !== game.user.id) return;
  if (!game.settings.get(MODULE_ID, "autoFireDialogs")) return;
  if (item.type !== "class") return;
  if (!(item.system?.identifier in CHILD_VARIANTS)) return;
  const actor = item.parent;
  if (!actor || actor.type !== "character") return;
  if (actor.getFlag(MODULE_ID, "scoresRolled")) return;
  openRollDialog(actor).catch(err => console.error("[child-class] ability roll error:", err));
}

export async function openRollDialog(actor) {
  actor ??= resolveTargetActor();
  if (!actor) {
    ui.notifications?.warn(
      "Select a token or set your player character first, or pass an actor: `api.rollChildAbilities(actor)`."
    );
    return;
  }
  if (actor.type !== "character") {
    ui.notifications?.warn("Ability generation applies to characters only.");
    return;
  }

  const rule = getAbilityRule(actor);
  if (!rule?.base) {
    ui.notifications?.warn(
      `Ability rule "${displayLabel(rule)}" is not fully specified (missing 'base' formula). Check the world's Ability score generation setting.`
    );
    return;
  }

  const alreadyRolled = actor.getFlag(MODULE_ID, "scoresRolled");
  if (alreadyRolled) {
    if (!game.user.isGM) {
      ui.notifications?.warn(`${actor.name} already has ability scores rolled. Ask the GM to re-roll.`);
      return;
    }
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Re-roll Ability Scores" },
      content: `<p>${escape(actor.name)} already has ability scores set (recorded ${new Date(alreadyRolled).toLocaleString()}). Roll again?</p>`
    });
    if (!confirmed) return;
  }

  const pool = await rollPool(rule.base);
  const assignments = await confirmAndAssign(actor, rule, pool);
  if (!assignments) return;

  await applyAssignments(actor, rule, assignments, pool);
  await broadcastChatCard(actor, rule, pool, assignments);
}

async function rollPool(formula) {
  const pool = [];
  for (let i = 0; i < ABILITIES.length; i++) {
    const roll = new Roll(formula);
    await roll.evaluate();
    pool.push({ index: i, formula, total: roll.total, roll });
  }
  return pool;
}

// Assignment UI: six SELECTs (one per ability), each populated with the pool
// values. On change, disable already-picked values in the other selects so the
// user can't double-assign. Submit callback re-validates and returns the
// { ability → poolIndex } map.
async function confirmAndAssign(actor, rule, pool) {
  const options = pool.map(p => `<option value="${p.index}">${p.total}</option>`).join("");
  const abilityRows = ABILITIES.map(a => `
    <tr>
      <td style="padding: 4px 12px 4px 0;"><label for="ability-${a}">${ABILITY_LABELS[a]}</label></td>
      <td><select id="ability-${a}" name="ability-${a}" data-ability="${a}">
        <option value="">—</option>
        ${options}
      </select></td>
    </tr>
  `).join("");

  const poolDisplay = pool.map(p => `<code>${p.total}</code>`).join(", ");

  const content = `
    <div>
      <p>Rule: <strong>${escape(displayLabel(rule))}</strong>. Six rolls of <code>${escape(rule.base)}</code>. Assign each to an ability — each value used exactly once.</p>
      <p>Pool: ${poolDisplay}</p>
      <table style="width: 100%;">${abilityRows}</table>
      <p id="child-class-assign-msg" style="min-height: 1.2em; color: var(--color-caution, #a80); font-size: 0.9em; margin: 4px 0 0 0;"></p>
      <p style="font-size: 0.9em; color: var(--color-text-secondary, #888); margin-top: 6px;">
        Apply records the rule choice on <code>flags.child-class</code>. Growth at level 4 will use this rule regardless of any later world-setting change.
      </p>
    </div>
  `;

  return await foundry.applications.api.DialogV2.wait({
    window: { title: "Roll & Assign Ability Scores" },
    content,
    render: (event, dialog) => {
      const selects = dialog.element.querySelectorAll("select[data-ability]");
      const refresh = () => {
        const chosen = new Set(
          [...selects].map(s => s.value).filter(v => v !== "")
        );
        for (const sel of selects) {
          for (const opt of sel.options) {
            if (opt.value === "" || opt.value === sel.value) {
              opt.disabled = false;
            } else {
              opt.disabled = chosen.has(opt.value);
            }
          }
        }
      };
      selects.forEach(s => s.addEventListener("change", refresh));
    },
    buttons: [
      {
        action: "apply",
        label: "Apply",
        default: true,
        callback: (event, button, dialog) => {
          const selects = dialog.element.querySelectorAll("select[data-ability]");
          const assignments = {};
          const used = new Set();
          for (const sel of selects) {
            if (sel.value === "") {
              showAssignError(dialog, "Assign a value to every ability.");
              throw new Error("incomplete");
            }
            if (used.has(sel.value)) {
              showAssignError(dialog, "Each pool value can only be used once.");
              throw new Error("duplicate");
            }
            used.add(sel.value);
            assignments[sel.dataset.ability] = parseInt(sel.value, 10);
          }
          return assignments;
        }
      },
      { action: "cancel", label: "Cancel", callback: () => null }
    ],
    rejectClose: false
  }).then(v => (v && typeof v === "object") ? v : null).catch(() => null);
}

function showAssignError(dialog, msg) {
  const el = dialog.element.querySelector("#child-class-assign-msg");
  if (el) el.textContent = msg;
}

async function applyAssignments(actor, rule, assignments, pool) {
  const updates = {
    [`flags.${MODULE_ID}.scoresRolled`]: Date.now(),
    [`flags.${MODULE_ID}.abilityRule`]: rule.id
  };
  // Snapshot the actor's pre-Child ability scores so class deletion (outside
  // a graduation flow) can revert cleanly. Only snapshots on the first roll —
  // a GM re-roll doesn't overwrite the original pre-Child state.
  if (!actor.getFlag(MODULE_ID, "preChildAbilities")) {
    const snapshot = {};
    for (const abbr of ABILITIES) {
      snapshot[abbr] = actor.system.abilities[abbr]?.value ?? 10;
    }
    updates[`flags.${MODULE_ID}.preChildAbilities`] = snapshot;
  }
  for (const [abbr, idx] of Object.entries(assignments)) {
    updates[`system.abilities.${abbr}.value`] = Math.min(20, pool[idx].total);
  }
  await actor.update(updates);
}

async function broadcastChatCard(actor, rule, pool, assignments) {
  const body = ABILITIES.map(a => {
    const p = pool[assignments[a]];
    return `<div><strong>${ABILITY_LABELS[a]}:</strong> ${escape(p.formula)} = ${p.total}</div>`;
  }).join("");
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div><h3>${escape(displayLabel(rule))}</h3>${body}</div>`,
    rolls: pool.map(p => p.roll)
  });
}

function displayLabel(rule) {
  if (!rule) return "unknown";
  return rule.label ?? (rule.id.charAt(0).toUpperCase() + rule.id.slice(1));
}

