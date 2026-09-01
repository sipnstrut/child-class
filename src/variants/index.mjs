import child14 from "./child14.mjs";
import child24 from "./child24.mjs";

const RAW = { child14, child24 };

// Resolve `extends` at load time. Shallow-merge overlay over base; caller keys win.
// Every subsystem reads from CHILD_VARIANTS after this — no runtime chain walking.
function resolve() {
  const out = {};
  for (const [id, def] of Object.entries(RAW)) {
    if (!def.extends) {
      out[id] = { ...def };
      continue;
    }
    const base = RAW[def.extends];
    if (!base) throw new Error(`variant "${id}" extends unknown "${def.extends}"`);
    const merged = { ...base, ...def, id };
    delete merged.extends;
    out[id] = merged;
  }
  return out;
}

export const CHILD_VARIANTS = resolve();

export function getChildVariant(actor) {
  const cls = actor?.items?.find(
    i => i.type === "class" && i.identifier in CHILD_VARIANTS
  );
  return cls ? CHILD_VARIANTS[cls.identifier] : null;
}
