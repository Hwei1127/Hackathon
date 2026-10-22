/* ─────────────────────────────────────────────────────────────
   AI vehicle identification (local, via Ollama)
   - a vision model running in Ollama on this computer identifies make / model /
     generation / paint / dimensions from the stock record or a photo
   - if Ollama isn't available, an estimate is made from the model name
   The result ("spec") drives the generated 3D model (see car3d.js).
   ───────────────────────────────────────────────────────────── */
import { bodyTypeOf } from "./vehicleMedia.js";
import { tint } from "../components/CarArt.jsx";

const BODY_KEYS = ["sedan", "suv", "hatch", "pickup", "mpv", "coupe"];
export const BODY_LABEL = { sedan: "Sedan", suv: "SUV", hatch: "Hatchback", pickup: "Pickup", mpv: "MPV", coupe: "Coupe" };

// typical exterior dimensions per body type, used when nothing better is known
const TYPICAL = {
  sedan: { lengthMm: 4700, widthMm: 1830, heightMm: 1440, wheelbaseMm: 2850, wheelDiameterIn: 18 },
  suv: { lengthMm: 4650, widthMm: 1880, heightMm: 1700, wheelbaseMm: 2750, wheelDiameterIn: 19 },
  hatch: { lengthMm: 4250, widthMm: 1790, heightMm: 1460, wheelbaseMm: 2620, wheelDiameterIn: 17 },
  pickup: { lengthMm: 5330, widthMm: 1860, heightMm: 1820, wheelbaseMm: 3085, wheelDiameterIn: 18 },
  mpv: { lengthMm: 4950, widthMm: 1850, heightMm: 1900, wheelbaseMm: 3000, wheelDiameterIn: 17 },
  coupe: { lengthMm: 4500, widthMm: 1850, heightMm: 1350, wheelbaseMm: 2700, wheelDiameterIn: 19 },
};

/** Offline estimate from the stock record alone. */
export function estimateSpec(v) {
  const body = bodyTypeOf(v);
  return {
    isVehicle: true, make: v.brand || "", model: v.model || "", generation: "", yearFrom: Number(v.year) || 0, yearTo: Number(v.year) || 0,
    bodyType: body, paintName: v.color || "", paintHex: tint(v.color), confidence: 0.4, matchesRecord: true,
    summary: "Estimated from the model name. Start Ollama to identify vehicles with AI.",
    dimensions: { ...TYPICAL[body] }, source: "estimate", fromPhoto: false, at: Date.now(),
  };
}

const int = { type: "integer" };
const SPEC_SCHEMA = {
  type: "object",
  required: ["isVehicle", "make", "model", "generation", "yearFrom", "yearTo", "bodyType", "paintName", "paintHex", "confidence", "summary", "dimensions"],
  properties: {
    isVehicle: { type: "boolean" },
    make: { type: "string" },
    model: { type: "string" },
    generation: { type: "string" },
    yearFrom: int,
    yearTo: int,
    bodyType: { type: "string", enum: BODY_KEYS },
    paintName: { type: "string" },
    paintHex: { type: "string" },
    confidence: { type: "number" },
    summary: { type: "string" },
    dimensions: {
      type: "object",
      required: ["lengthMm", "widthMm", "heightMm", "wheelbaseMm", "wheelDiameterIn"],
      properties: { lengthMm: int, widthMm: int, heightMm: int, wheelbaseMm: int, wheelDiameterIn: int },
    },
  },
};

const SYSTEM = `You identify vehicles for a car dealership's inventory system (Malaysian market).
Identify the exact make, model, variant and generation (chassis code if known, e.g. G20).
Give the manufacturer's published exterior dimensions for that generation in millimetres (width excluding mirrors); if not known exactly, give your best estimate.
bodyType is one of sedan, suv, hatch, pickup, mpv, coupe. paintHex is the paint colour as an sRGB hex like #1f3a7a.
confidence is 0 to 1. isVehicle is false if a photo does not show a car. summary is one sentence for the salesperson.
Reply with a single JSON object only.`;

// Qwen3-VL "thinking" builds reason for minutes before answering and ignore think:false;
// starting the reply with an empty thinking block makes them answer directly (harmless for other models).
const SKIP_THINKING = { role: "assistant", content: "<think>\n\n</think>\n\n" };

/** Resize an image blob to a JPEG (max 1024px on the long side) and return base64. Smaller = faster locally. */
async function toJpegBase64(blob, max = 1024) {
  const bmp = await createImageBitmap(blob);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.88).split(",")[1];
}

const norm = (s = "") => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
/** Same make and the same model name (first word), e.g. "BMW 330i M Sport" ≈ "BMW 3 Series 330i". */
function sameVehicle(spec, v) {
  const [a, b] = [norm(spec.make), norm(v.brand)];
  if (!a || !b || !(a.includes(b) || b.includes(a))) return false;
  const first = norm(v.model).split(" ")[0], m = norm(spec.model);
  return !first || m.split(" ").includes(first) || m.replace(/ /g, "").includes(first.replace(/ /g, ""));
}

/**
 * Identify a vehicle with the local model.
 *   photo: optional image Blob.  scan: true when the photo is a new picture to check against the record
 *   (the record is then not shown to the model, so it describes only what it sees).
 */
export async function identifyVehicle(v, { url, model, photo, scan = false } = {}) {
  const base = (url || "http://localhost:11434").replace(/\/+$/, "");
  const record = ["brand", "model", "year", "color"].map((k) => `${k}: ${v[k] ?? ""}`).join("\n");
  const user = { role: "user" };
  if (photo && scan) user.content = "Identify the car in this photo. If it is unclear, give your best guess with a low confidence.";
  else if (photo) user.content = `Stock record:\n${record}\n\nThe photo shows this vehicle. Identify it, using the photo for the paint colour.`;
  else user.content = `Stock record:\n${record}\n\nIdentify the vehicle in the record.`;
  if (photo) user.images = [await toJpegBase64(photo)];

  let res;
  try {
    res = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(240000),
      body: JSON.stringify({
        model, stream: false, think: false, format: SPEC_SCHEMA,
        options: { temperature: 0, num_predict: 1024 },
        messages: [{ role: "system", content: SYSTEM }, user, SKIP_THINKING],
      }),
    });
  } catch (e) {
    if (e.name === "TimeoutError") throw new Error("The local AI took too long to answer. Try again, or use a smaller model.");
    throw new Error(`Can't reach Ollama at ${base}. Make sure Ollama is running.`);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 404) throw new Error(`The model "${model}" isn't installed. Run: ollama pull ${model}`);
    throw new Error(`Ollama error ${res.status}: ${data.error || res.statusText}`);
  }
  const text = (data.message?.content || "").replace(/<think>[\s\S]*?<\/think>/g, "");
  const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  let spec;
  try { spec = JSON.parse(json); } catch { throw new Error("The local AI didn't return a usable answer. Try again."); }

  if (spec.isVehicle === false) throw new Error("No car was recognised in that photo.");
  if (!BODY_KEYS.includes(spec.bodyType)) spec.bodyType = bodyTypeOf(v);
  if (!/^#[0-9a-f]{6}$/i.test(spec.paintHex || "")) spec.paintHex = tint(spec.paintName || v.color);
  const d = (spec.dimensions ||= {}), t = TYPICAL[spec.bodyType];
  for (const k of Object.keys(t)) if (!(d[k] > 0)) d[k] = t[k];
  return {
    ...spec, make: spec.make || v.brand, model: spec.model || v.model,
    confidence: Math.max(0, Math.min(1, Number(spec.confidence) || 0)),
    matchesRecord: scan ? sameVehicle(spec, v) : true,
    source: "local", aiModel: model, fromPhoto: !!photo, at: Date.now(),
  };
}
