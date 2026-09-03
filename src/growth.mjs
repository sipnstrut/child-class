// § 5.7 Growth at Child level 4. Rolls a die per ability under the rule
// recorded on the actor at generation (NOT the current world setting — that
// invariant matters mid-campaign per § 5.3). Two abilities the player picks
// at Growth time roll `growthChoice` (kh1-style take-higher); the other four
// roll `growth`. Both apply the § 5.3 cap of 20 on write.
//
// The pick is intrinsic to the mechanic, not an opt-in sub-feature — the
// player chooses the two "aptitude" abilities at level 4 as part of Growth
// itself. Design correction applied 2026-09-01.
//
// Trigger: `updateItem` on a Child class item whose new level is 4 opens the
// dialog automatically. Also invocable manually via `api.rollGrowth(actor)`.

import { MODULE_ID } from "./config.mjs";
import { ABILITY_RULES } from "./ability-rules.mjs";
import { CHILD_VARIANTS } from "./variants/index.mjs";
import { ABILITIES, ABILITY_LABELS, escape, resolveTargetActor } from "./utils.mjs";

const CHOICE_COUNT = 2;

export function registerGrowth() {
  const module = game.modules.get(MODULE_ID);
  if (module) {
    module.api ??= {};
    module.api.rollGrowth = openGrowthDialog;
  }
  Hooks.on("updateItem", detectLevel4);
}

function detectLevel4(item, changes) {
  if (!game.settings.get(MODULE_ID, "autoFireDialogs")) return;
  if (item.type !== "class") return;
  if (!(item.system?.identifier in CHILD_VARIANTS)) return;
  const newLevel = foundry.utils.getProperty(changes, "system.levels");
  if (newLevel !== 4) return;
  const actor = item.parent;
  if (!actor) return;
  if (actor.getFlag(MODULE_ID, "growthApplied")) return;
  openGrowthDialog(actor).catch(err => console.error("[child-class] growth error:", err));
}

export async function openGrowthDialog(actor) {
  actor ??= resolveTargetActor();
  if (!actor) {
    ui.notifications?.warn("Pass an actor: `api.rollGrowth(actor)`.");
    return;
  }
  const ruleId = actor.getFlag(MODULE_ID, "abilityRule");
  const rule = ABILITY_RULES[ruleId];
  if (!rule?.growth || !rule?.growthChoice) {
    ui.notifications?.warn(
      `Cannot roll Growth: no ability rule recorded on ${actor.name}, or the rule is incomplete. Run rollChildAbilities first.`
    );
    return;
  }

  const picks = await pickChoiceAbilities(rule);
  if (!picks) return;

  const results = await rollGrowth(actor, rule, picks);
  const applied = await confirmAndApply(actor, rule, results);
  if (applied) await broadcastChatCard(actor, rule, results);
}

// Step 1: pick two abilities to roll `growthChoice` on. Selection UI is a
// checkbox grid inside a DialogV2; the button callback reads state and
// resolves the two chosen abbrs (or null on cancel).
async function pickChoiceAbilities(rule) {
  const rows = ABILITIES.map(a => `
    <label style="display: block; padding: 4px 0;">
      <input type="checkbox" name="pick" value="${a}"> ${ABILITY_LABELS[a]}
    </label>
  `).join("");

  const content = `
    <div>
      <p>Choose <strong>${CHOICE_COUNT}</strong> abilities to roll <code>${escape(rule.growthChoice)}</code> on (take-higher).
      The other four roll <code>${escape(rule.growth)}</code>.</p>
      <form>${rows}</form>
      <p id="child-class-pick-msg" style="min-height: 1.2em; color: var(--color-caution, #a80); font-size: 0.9em;"></p>
    </div>
  `;

  return await foundry.applications.api.DialogV2.wait({
    window: { title: "Growth — Pick Aptitude Abilities" },
    content,
    buttons: [
      {
        action: "roll",
        label: "Roll",
        default: true,
        callback: (event, button, dialog) => {
          const selected = [...dialog.element.querySelectorAll("input[name='pick']:checked")]
            .map(i => i.value);
          if (selected.length !== CHOICE_COUNT) {
            const msg = dialog.element.querySelector("#child-class-pick-msg");
            if (msg) msg.textContent = `Select exactly ${CHOICE_COUNT} abilities (you have ${selected.length}).`;
            throw new Error("bad-pick-count");
          }
          return selected;
        }
      },
      { action: "cancel", label: "Cancel", callback: () => null }
    ],
    rejectClose: false
  }).then(v => Array.isArray(v) ? v : null).catch(() => null);
}

async function rollGrowth(actor, rule, picks) {
  const pickSet = new Set(picks);
  const results = [];
  for (const abbr of ABILITIES) {
    const isChoice = pickSet.has(abbr);
    const formula = isChoice ? rule.growthChoice : rule.growth;
    const roll = new Roll(formula);
    await roll.evaluate();
    const current = actor.system.abilities[abbr]?.value ?? 10;
    const next = Math.min(20, current + roll.total);
    results.push({ ability: abbr, current, formula, growth: roll.total, next, roll, isChoice });
  }
  return results;
}

async function confirmAndApply(actor, rule, results) {
  const rows = results.map(r => {
    const capped = r.current + r.growth > 20;
    return `
      <tr>
        <td style="padding-right: 12px;">${ABILITY_LABELS[r.ability]}${r.isChoice ? " <span title=\"Aptitude — take higher\" style=\"color: var(--color-caution, #a80);\">★</span>" : ""}</td>
        <td style="color: var(--color-text-secondary, #888); padding-right: 12px;">${r.current} + <code>${escape(r.formula)}</code></td>
        <td style="text-align: right; font-weight: bold;">${r.next}${capped ? " <span style=\"color: var(--color-caution, #a80);\">(capped)</span>" : ""}</td>
      </tr>
    `;
  }).join("");

  const decision = await foundry.applications.api.DialogV2.wait({
    window: { title: "Growth — Confirm" },
    content: `
      <div>
        <p>Rule: <strong>${escape(displayLabel(rule))}</strong>. Aptitude picks marked ★.</p>
        <table style="width: 100%; border-collapse: collapse;">${rows}</table>
        <p style="font-size: 0.9em; color: var(--color-text-secondary, #888); margin-top: 8px;">
          Growth is permanent. Applies clamped to the 20 cap. Records
          <code>flags.child-class.growthApplied</code> so it can only fire once.
        </p>
      </div>
    `,
    buttons: [
      { action: "apply", label: "Apply", default: true },
      { action: "cancel", label: "Cancel" }
    ]
  });
  if (decision !== "apply") return false;

  const updates = { [`flags.${MODULE_ID}.growthApplied`]: Date.now() };
  for (const r of results) {
    updates[`system.abilities.${r.ability}.value`] = r.next;
  }
  await actor.update(updates);
  return true;
}

async function broadcastChatCard(actor, rule, results) {
  const body = results.map(r => `
    <div><strong>${ABILITY_LABELS[r.ability]}${r.isChoice ? " ★" : ""}:</strong>
      ${r.current} + <code>${escape(r.formula)}</code> = ${r.next}</div>
  `).join("");
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div><h3>Growth</h3>${body}</div>`,
    rolls: results.map(r => r.roll)
  });
}

function displayLabel(rule) {
  if (!rule) return "unknown";
  return rule.label ?? (rule.id.charAt(0).toUpperCase() + rule.id.slice(1));
}

