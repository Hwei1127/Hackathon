/* ─────────────────────────────────────────────────────────────
   Vehicle media helpers
   - body type detection from the model name
   - IMAGIN.studio render URLs (make / model / year / colour / angle)
   - hosted frame-pattern expansion  e.g. /media/VH-2401/{01..36}.jpg
   - IndexedDB storage for photos and 3D files uploaded in the browser
   ───────────────────────────────────────────────────────────── */

export const BODY_TYPES = ["Auto", "Sedan", "SUV", "Hatchback", "Pickup", "MPV", "Coupe"];

const BODY_RULES = [
  ["pickup", /\b(hilux|ranger|navara|triton|d-?max|bt-?50|tacoma|tundra|f-?150|amarok|gladiator|frontier|l200|cybertruck)\b/i],
  ["mpv", /\b(alphard|vellfire|innova|serena|odyssey|carnival|staria|sienna|alza|avanza|v-?class|touran|ertiga|stargazer|velfire|zenix|noah|voxy)\b/i],
  ["suv", /\b(x[1-7]|ix[1-3]?|x-?trail|cr-?v|hr-?v|br-?v|wr-?v|zr-?v|rav-?4|fortuner|cross|cx-?\d+|tiguan|touareg|t-?roc|t-?cross|kodiaq|karoq|q[2-8]|e-?tron|gl[abces]|eq[abces] suv|outlander|asx|kicks|terra|harrier|land ?cruiser|prado|rush|ativa|aruz|x50|x70|x90|range ?rover|discovery|defender|macan|cayenne|santa ?fe|tucson|kona|sportage|sorento|seltos|forester|xv|crosstrek|xc\d0|ev9|ioniq ?5|model ?[xy]|atto ?3|everest|ux|nx|rx|lx|gx|tank|jolion|h6|seal ?u|sealion)\b/i],
  ["hatch", /\b(golf|polo|jazz|fit|myvi|axia|yaris|swift|mazda ?2|i10|i20|i30|fiesta|focus|corsa|a1|1-?series|1\d\d[id]|mini|cooper|note|march|ioniq|dolphin|picanto|ora|good ?cat|leaf|clio|208|id\.?3)\b/i],
  ["coupe", /\b(coupe|m2|m4|z4|86|gr ?86|brz|supra|mustang|camaro|911|tt|rc|8-?series|4-?series coupe|amg gt|gr ?corolla)\b/i],
];

/** "SUV" | "Sedan" … → internal key, "Auto" → detect from model name */
export function bodyTypeOf(v = {}) {
  const set = (v.body || "Auto").toLowerCase();
  if (set !== "auto") return set === "hatchback" ? "hatch" : set;
  const name = `${v.model || ""}`;
  for (const [type, rx] of BODY_RULES) if (rx.test(name)) return type;
  return "sedan";
}

/* ───────── IMAGIN.studio ───────── */
const slug = (s = "") => s.toLowerCase().trim().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// model families that are two or more words
const MULTI_WORD = ["corolla cross", "yaris cross", "land cruiser", "range rover sport", "range rover evoque", "range rover velar", "range rover", "santa fe", "model 3", "model y", "model s", "model x", "atto 3", "seal u", "grand vitara", "c-hr", "cr-v", "hr-v", "x-trail", "e-tron"];

/** Best guess of IMAGIN's modelFamily from the brand + model text. Override per vehicle with `imaginModel`. */
export function guessModelFamily(brand = "", model = "") {
  const b = brand.toLowerCase(), m = model.toLowerCase().trim();
  if (b === "bmw") {
    let x = m.match(/^(\d)\d\d[a-z]*/); if (x) return `${x[1]}-series`;
    x = m.match(/^(i?x\d|z\d|i\d|m\d|ix)\b/); if (x) return x[1];
  }
  if (/mercedes/.test(b)) { const x = m.match(/^([a-z]{1,3})\s?\d{2,3}/); if (x) return `${x[1]}-class`; }
  if (b === "audi") { const x = m.match(/^((?:rs|s)?\s?[aq]\d|e-tron|tt)/); if (x) return slug(x[1]); }
  const hit = MULTI_WORD.find((w) => m === w || m.startsWith(w + " "));
  if (hit) return slug(hit);
  return slug(m.split(/\s+/)[0] || "");
}

export const DEFAULT_SETTINGS = {
  imaginKey: "",
  imaginAngles: "01,05,09,13,17,21,23,29",
  autoRotate: true,
  ollamaUrl: "http://localhost:11434",
  ollamaModel: "qwen3-vl:4b",
  aiAuto: true,
};
const SETTINGS_KEY = "autocore-settings-v1";
export const loadSettings = () => { try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") }; } catch { return { ...DEFAULT_SETTINGS }; } };
export const saveSettings = (s) => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch {} };

export function imaginUrl(v, key, angle = "01") {
  const p = new URLSearchParams({
    customer: key,
    make: slug(v.brand),
    modelFamily: v.imaginModel ? slug(v.imaginModel) : guessModelFamily(v.brand, v.model),
    angle,
    zoomType: "fullscreen",
  });
  if (v.year) p.set("modelYear", String(v.year));
  if (v.color) p.set("paintDescription", slug(v.color));
  return `https://cdn.imagin.studio/getImage?${p}`;
}
export function imaginFrames(v, settings) {
  if (!settings?.imaginKey) return [];
  const angles = (settings.imaginAngles || "01").split(/[\s,]+/).filter(Boolean);
  return angles.map((a) => imaginUrl(v, settings.imaginKey.trim(), a));
}

/* ───────── hosted frames ───────── */
/** Accepts one URL per line, or a pattern like /media/VH-2401/{01..36}.jpg */
export function expandFrames(text = "") {
  const out = [];
  text.split(/\n+/).map((l) => l.trim()).filter(Boolean).forEach((line) => {
    const m = line.match(/\{(\d+)\.\.(\d+)\}/);
    if (!m) return out.push(line);
    const [a, b] = [m[1], m[2]], pad = a.length, from = +a, to = +b, step = from <= to ? 1 : -1;
    for (let i = from; step > 0 ? i <= to : i >= to; i += step) out.push(line.replace(m[0], String(i).padStart(pad, "0")));
  });
  return out;
}

/* ───────── IndexedDB: uploaded files live in this browser ───────── */
const DB_NAME = "autocore-media", STORE = "media";
let dbPromise;
function openDb() {
  if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) return reject(new Error("IndexedDB not available"));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}
async function tx(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode), s = t.objectStore(STORE), r = fn(s);
    t.oncomplete = () => resolve(r?.result);
    t.onerror = () => reject(t.error);
  });
}
export const mediaEvents = new EventTarget();
const changed = (id) => mediaEvents.dispatchEvent(new CustomEvent("change", { detail: id }));

/** → { frames: Blob[], glb: Blob|null } */
export async function getLocalMedia(id) {
  try { return (await tx("readonly", (s) => s.get(id))) || { frames: [], glb: null }; } catch { return { frames: [], glb: null }; }
}
export async function setLocalMedia(id, patch) {
  const cur = await getLocalMedia(id);
  await tx("readwrite", (s) => s.put({ ...cur, ...patch, updated: Date.now() }, id));
  changed(id);
}
export async function clearAllLocalMedia() {
  try { await tx("readwrite", (s) => s.clear()); changed("*"); } catch {}
}

const natural = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
export const sortFiles = (files) => [...files].sort((a, b) => natural.compare(a.name, b.name));
export const fmtBytes = (n) => (n > 1e6 ? (n / 1e6).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1e3)) + " KB");
