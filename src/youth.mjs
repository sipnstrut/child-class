// § 5.5 Youth prompt on short rest. dnd5e's rest UI doesn't surface custom
// activity uses in its own dialog, so the short-rest completion happens
// without Youth ever appearing. We hook `dnd5e.restCompleted` (fires after
// the actor is updated), check whether the actor holds an unused Youth, and
// offer a follow-up prompt: if accepted, invoke the Heal activity's own
// `.use()` — that path handles the healing roll, the HP write, the uses
// decrement, and the chat card in one call.

import { escape } from "./utils.mjs";

const YOUTH_ID = "featYouth0000000";

export function registerYouth() {
  Hooks.on("dnd5e.restCompleted", onRestCompleted);
}

async function onRestCompleted(actor, result, config) {
  if (config?.type !== "short") return;
  if (!game.user.isGM && !actor.isOwner) return;

  const youth = findYouth(actor);
  if (!youth) return;

  const activity = firstActivity(youth);
  if (!activity) return;

  // uses.value is derived (max - spent). 0 means no charges available.
  if ((activity.uses?.value ?? 0) < 1) return;

  const confirmed = await foundry.applications.api.DialogV2.confirm({
    window: { title: "Youth" },
    content: `<p>${escape(actor.name)} finished a short rest. Use <strong>Youth</strong> to recover half maximum HP (rounded up)?</p><p style="font-size: 0.9em; color: var(--color-text-secondary, #888);">One use per long rest. Cancel to save it for later in this rest cycle.</p>`,
    modal: false
  });
  if (!confirmed) return;

  try {
    await activity.use();
  } catch (err) {
    console.error("[child-class] Youth activation failed:", err);
    ui.notifications?.error("Youth failed to activate — see console.");
  }
}

function findYouth(actor) {
  // Prefer the canonical compendium _id (survives keepId grants), fall back
  // to name match if the item was hand-authored or renamed.
  return actor.items.get(YOUTH_ID)
    ?? actor.items.find(i => i._source?._id === YOUTH_ID)
    ?? actor.items.find(i => i.name === "Youth");
}

function firstActivity(item) {
  const activities = item.system?.activities;
  if (!activities) return null;
  return activities.contents?.[0] ?? [...activities][0]?.[1] ?? null;
}

