/* ─────────────────────────────────────────────────────────────
   Vehicle damage map
   A vehicle's `damage` is { parts: { [partId]: { s: 1|2|3, note } }, summary, source, at }.
   The damage 3D view (car3d.js) paints each part white (no damage) → red (severe).
   Left / right are the driver's left / right, sitting in the car facing forward.
   ───────────────────────────────────────────────────────────── */

export const SEVERITY = ["No damage", "Minor", "Moderate", "Severe"];
export const DAMAGE_SCALE = ["#f4f5f7", "#fca5a5", "#ef4444", "#b91c1c"];

export const PARTS = [
  ["front_bumper", "Front bumper"], ["bonnet", "Bonnet"], ["windscreen", "Windscreen"], ["roof", "Roof"],
  ["rear_window", "Rear window"], ["boot", "Boot / tailgate"], ["rear_bumper", "Rear bumper"],
  ["headlight_l", "Left headlight"], ["headlight_r", "Right headlight"], ["taillight_l", "Left taillight"], ["taillight_r", "Right taillight"],
  ["fender_l", "Left front wing"], ["fender_r", "Right front wing"],
  ["door_fl", "Front left door"], ["door_fr", "Front right door"], ["door_rl", "Rear left door"], ["door_rr", "Rear right door"],
  ["quarter_l", "Left rear quarter panel"], ["quarter_r", "Right rear quarter panel"],
  ["window_l", "Left side windows"], ["window_r", "Right side windows"], ["mirror_l", "Left mirror"], ["mirror_r", "Right mirror"],
  ["wheel_fl", "Front left wheel"], ["wheel_fr", "Front right wheel"], ["wheel_rl", "Rear left wheel"], ["wheel_rr", "Rear right wheel"],
];
export const PART_IDS = PARTS.map(([id]) => id);
export const PART_LABEL = Object.fromEntries(PARTS);

export const damagedParts = (damage) => Object.entries(damage?.parts || {}).filter(([, p]) => p?.s > 0);
export function damageSummary(damage) {
  const list = damagedParts(damage);
  if (!list.length) return "No damage recorded";
  const worst = Math.max(...list.map(([, p]) => p.s));
  return `${list.length} damaged part${list.length > 1 ? "s" : ""} · worst: ${SEVERITY[worst].toLowerCase()}`;
}

/** Merge new findings into an existing damage record (new findings win per part). */
export function mergeDamage(damage, found, meta = {}) {
  const parts = { ...(damage?.parts || {}) };
  for (const f of found) if (PART_IDS.includes(f.part) && f.s > 0) parts[f.part] = { s: Math.min(3, Math.round(f.s)), note: f.note || "" };
  return { ...damage, ...meta, parts, at: Date.now() };
}

/* ───────── offline parser: "dented rear left door, cracked right headlight" ───────── */
const SEV_WORDS = [[3, /\b(broken|smashed|shattered|crushed|missing|severe|major|torn|pecah|remuk|hancur)\b/i],
  [1, /\b(scratch(ed|es)?|scuff(ed|s)?|minor|light|small|chip(ped)?|calar|sikit)\b/i], [2, /\b(dent(ed|s)?|crack(ed|s)?|bent|moderate|kemik|retak)\b/i]];
const PART_WORDS = [
  ["windscreen", /\b(wind ?screen|wind ?shield|front (glass|window)|cermin depan)\b/i],
  ["rear_window", /\b(rear (wind ?screen|glass|window)|back (glass|window)|cermin belakang)\b/i],
  ["headlight", /\b(head ?(light|lamp)s?|lampu depan)\b/i], ["taillight", /\b(tail ?(light|lamp)s?|rear (light|lamp)s?|brake lights?|lampu belakang)\b/i],
  ["bumper", /\b(bumpers?|bampar)\b/i], ["bonnet", /\b(bonnet|hood)\b/i], ["boot", /\b(boot|trunk|tail ?gate|hatch)\b/i], ["roof", /\b(roof|bumbung)\b/i],
  ["fender", /\b(fenders?|wings?)\b/i], ["quarter", /\b(quarter( panel)?)\b/i], ["mirror", /\b(mirrors?|side mirror|cermin sisi)\b/i],
  ["wheel", /\b(wheels?|rims?|tyres?|tires?|sport rims?|tayar)\b/i], ["window", /\b(side )?(windows?|glass|tingkap)\b/i], ["door", /\b(doors?|pintu)\b/i],
];
const sideOf = (t) => [/\b(left|kiri|passenger)\b/i.test(t) && "l", /\b(right|kanan|driver)\b/i.test(t) && "r"].filter(Boolean);
const endOf = (t) => [/\b(front|depan)\b/i.test(t) && "f", /\b(rear|back|belakang)\b/i.test(t) && "r"].filter(Boolean);

export function parseDamageText(text = "") {
  const found = [];
  for (const clause of text.split(/[,;.\n]|\band\b|\bdan\b/i).map((c) => c.trim()).filter(Boolean)) {
    const s = (SEV_WORDS.find(([, rx]) => rx.test(clause)) || [2])[0];
    const sides = sideOf(clause), ends = endOf(clause);
    const LR = sides.length ? sides : ["l", "r"], FR = ends.length ? ends : ["f"];
    const add = (part) => found.push({ part, s, note: clause });
    const kind = PART_WORDS.find(([, rx]) => rx.test(clause))?.[0];
    if (!kind) continue;
    if (["windscreen", "rear_window", "bonnet", "boot", "roof"].includes(kind)) add(kind);
    else if (kind === "bumper") FR.forEach((e) => add(e === "f" ? "front_bumper" : "rear_bumper"));
    else if (["headlight", "taillight", "fender", "quarter", "mirror", "window"].includes(kind)) LR.forEach((x) => add(`${kind}_${x}`));
    else if (kind === "door" || kind === "wheel") FR.forEach((e) => LR.forEach((x) => add(`${kind}_${e}${x}`)));
  }
  return found;
}
