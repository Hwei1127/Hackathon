/* ─────────────────────────────────────────────────────────────
   Procedural 3D car (three.js → .glb)
   Builds a 3D car from an AI spec: body-type silhouette (same shapes as the
   illustrations) scaled to the real length / width / height / wheelbase,
   painted in the identified colour. Exported as a GLB blob URL so the
   existing <model-viewer> shows it with orbit, zoom and AR.
   ───────────────────────────────────────────────────────────── */
import { SHAPES } from "../components/CarArt.jsx";
import { DAMAGE_SCALE } from "./damage.js";

/* Sutherland–Hodgman clip of a polygon against the line (x or y, by axis) = c. below keeps the smaller side. */
function clip(poly, axis, c, below) {
  const inside = (p) => (below ? p[axis] <= c : p[axis] >= c), out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], ia = inside(a), ib = inside(b);
    if (ia) out.push(a);
    if (ia !== ib) {
      const t = (c - a[axis]) / (b[axis] - a[axis]), p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      p[axis] = c;
      out.push(p);
    }
  }
  return out;
}
const clipY = (poly, c, below) => clip(poly, 1, c, below);
/** the part of a polygon between x0 and x1 */
const band = (poly, x0, x1) => clip(clip(poly, 0, x0, false), 0, x1, true);
/** [minX, maxX] where the horizontal line y crosses the polygon */
function xExtent(poly, y) {
  const xs = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    if ((a[1] - y) * (b[1] - y) <= 0 && a[1] !== b[1]) xs.push(a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
  }
  return xs.length ? [Math.min(...xs), Math.max(...xs)] : [0, 0];
}

/* damage: optional { [partId]: { s } } → damage view: every part painted white (no damage) → red (severe) */
async function buildScene(spec, damage) {
  const THREE = await import("three");
  const S = SHAPES[spec.bodyType] || SHAPES.sedan;
  const d = spec.dimensions;
  const L = d.lengthMm / 1000, W = d.widthMm / 1000, H = d.heightMm / 1000, WB = d.wheelbaseMm / 1000;
  const R = (d.wheelDiameterIn || 18) * 0.0127 + 0.11; // rim radius + sidewall
  const tw = Math.min(0.3, 0.2 + W * 0.02);

  // silhouette (SVG coords, y down) → metres, car centred on x = 0, ground at y = 0
  const xs = S.body.map((p) => p[0]), rear = Math.min(...xs), front = Math.max(...xs), top = Math.min(...S.body.map((p) => p[1]));
  const groundSvg = 110 + S.r + 4;
  const kx = L / (front - rear), ky = H / (groundSvg - top), mid = (front + rear) / 2;
  const clearance = ["suv", "pickup"].includes(spec.bodyType) ? 0.24 : spec.bodyType === "mpv" ? 0.19 : 0.16;
  const map = ([x, y]) => [(x - mid) * kx, y >= 112 ? clearance : (groundSvg - y) * ky];
  const belt = (groundSvg - Math.max(...S.glass.map((p) => p[1]))) * ky;
  const roofCut = (groundSvg - Math.min(...S.glass.map((p) => p[1]))) * ky;

  // wheels: shape positions, respaced to the real wheelbase
  const wMid = ((S.wheels[0] + S.wheels[1]) / 2 - mid) * kx;
  const wheelX = [wMid + WB / 2, wMid - WB / 2].map((x) => Math.max(-L / 2 + R + 0.1, Math.min(L / 2 - R - 0.1, x))); // front, rear

  // outline with wheel arches cut into the bottom edge (front → rear)
  const outline = S.body.map(map), archR = R + 0.035;
  for (const cx of wheelX) {
    const t0 = Math.asin(Math.max(-1, Math.min(1, (clearance - R) / archR)));
    for (let k = 0; k <= 18; k++) { const t = t0 + ((Math.PI - 2 * t0) * k) / 18; outline.push([cx + archR * Math.cos(t), R + archR * Math.sin(t)]); }
  }

  const paint = new THREE.MeshPhysicalMaterial({ color: spec.paintHex, metalness: 0.55, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.06 });
  const glass = new THREE.MeshPhysicalMaterial({ color: "#0b111b", metalness: 0.2, roughness: 0.04, clearcoat: 1 });
  const dark = new THREE.MeshStandardMaterial({ color: "#0b0e14", roughness: 0.8 });
  const tire = new THREE.MeshStandardMaterial({ color: "#121316", roughness: 0.92 });
  const rimMat = new THREE.MeshStandardMaterial({ color: "#c7ccd4", metalness: 1, roughness: 0.28 });
  const head = new THREE.MeshStandardMaterial({ color: "#eaf4ff", emissive: "#cfe6ff", emissiveIntensity: 1.2 });
  const tail = new THREE.MeshStandardMaterial({ color: "#c0141f", emissive: "#ff1e2d", emissiveIntensity: 0.9 });

  const scene = new THREE.Scene(), car = new THREE.Group();
  car.name = `${spec.make} ${spec.model}`.trim() || "Vehicle";
  scene.add(car);
  const add = (geo, mat, x = 0, y = 0, z = 0, name) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); if (name) m.name = name; car.add(m); return m; };
  const extrude = (poly, width, bevel = 0.035) => {
    const shape = new THREE.Shape(poly.map(([x, y]) => new THREE.Vector2(x, y)));
    const depth = Math.max(0.01, width - 2 * bevel);
    const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 3, curveSegments: 4 });
    g.translate(0, 0, -depth / 2);
    return g;
  };

  // damage view: one material per part; z > 0 is the car's right (it faces +x)
  const neutral = new THREE.MeshStandardMaterial({ color: "#e4e7ec", roughness: 0.6 });
  const part = (id, base) => {
    if (!damage) return base;
    const s = damage[id]?.s || 0, glassy = base === glass;
    const m = new THREE.MeshStandardMaterial({ color: s ? DAMAGE_SCALE[s] : glassy ? "#c9d3df" : DAMAGE_SCALE[0], roughness: glassy ? 0.15 : 0.5, metalness: 0.05,
      emissive: s ? DAMAGE_SCALE[s] : "#000000", emissiveIntensity: s ? 0.3 : 0 });
    m.name = id;
    return m;
  };
  const side = (s) => (s > 0 ? "r" : "l");

  const lower = clipY(outline, belt + 0.01, true), upper = clipY(outline, belt - 0.02, false);
  const [, cabinFront] = xExtent(upper, belt + 0.03);
  if (!damage) {
    add(extrude(lower, W, 0.05), paint, 0, 0, 0, "Body");
    add(extrude(upper, W * 0.8, 0.04), glass, 0, 0, 0, "Glass");
  } else {
    // lower body cut into bumpers / bonnet / boot, with a thin gap between panels
    const lx = lower.map((p) => p[0]), frontX = Math.max(...lx), rearX = Math.min(...lx), bd = Math.min(0.3, L * 0.065), gap = 0.01;
    // windscreen base / rear window base, from the glass outline
    const gxs = S.glass.map((p) => (p[0] - mid) * kx), glassFront = Math.max(...gxs), glassRear = Math.min(...gxs);
    const bootEnd = Math.max(glassRear, rearX + bd + 0.25);
    const panel = (poly, x0, x1, id, name) => x1 - x0 > 0.05 && add(extrude(band(poly, x0 + gap, x1 - gap), W, 0.012), id ? part(id, paint) : neutral, 0, 0, 0, name);
    panel(lower, rearX - 1, rearX + bd, "rear_bumper", "Rear bumper");
    panel(lower, rearX + bd, bootEnd, "boot", "Boot");
    panel(lower, bootEnd, glassFront, null, "Body");
    panel(lower, glassFront, frontX - bd, "bonnet", "Bonnet");
    panel(lower, frontX - bd, frontX + 1, "front_bumper", "Front bumper");
    // bodywork above the belt line ahead of / behind the glass belongs to the bonnet / boot
    panel(upper, glassFront, frontX + 1, "bonnet", "Bonnet");
    panel(upper, rearX - 1, glassRear, "boot", "Boot");

    // side panels: thin plates over each flank, between the sill and the belt line
    const flank = clipY(clipY(lower, clearance + 0.05, false), belt - 0.03, true);
    const pil = S.pillars.map((p) => (p - mid) * kx).sort((a, b) => b - a), rearDoors = pil.length > 0 || spec.bodyType !== "coupe";
    const doorFront = wheelX[0] - archR - 0.03;
    const bPillar = pil[0] ?? glassRear + (glassFront - glassRear) * 0.3;
    const rearDoorEnd = pil[1] ?? Math.max(glassRear + 0.05, wheelX[1] + archR * 0.5);
    const ranges = [["fender", doorFront, frontX - bd], ["door_f", bPillar, doorFront], ...(rearDoors ? [["door_r", rearDoorEnd, bPillar]] : []),
      ["quarter", rearX + bd, rearDoors ? rearDoorEnd : bPillar]];
    for (const [id, x0, x1] of ranges) for (const s of [-1, 1]) {
      if (x1 - x0 < 0.08) continue;
      const pid = id.startsWith("door") ? `${id}${side(s)}` : `${id}_${side(s)}`;
      const g = new THREE.ExtrudeGeometry(new THREE.Shape(band(flank, x0 + 0.015, x1 - 0.015).map(([x, y]) => new THREE.Vector2(x, y))), { depth: 0.008, bevelEnabled: false });
      add(g.translate(0, 0, -0.004), part(pid, paint), 0, 0, s * (W / 2 + 0.006), `${pid}`);
    }

    // glass: windscreen, rear window, and the side windows split down the middle
    const [roofRear, roofFront] = xExtent(outline, roofCut - 0.01);
    add(extrude(band(upper, roofFront - 0.08, glassFront), W * 0.8, 0.012), part("windscreen", glass), 0, 0, 0, "Windscreen");
    add(extrude(band(upper, glassRear, roofRear + 0.08 - gap), W * 0.8, 0.012), part("rear_window", glass), 0, 0, 0, "Rear window");
    for (const s of [-1, 1]) add(extrude(band(upper, roofRear + 0.08, roofFront - 0.08 - gap), W * 0.4 - gap, 0.012), part(`window_${side(s)}`, glass), 0, 0, s * W * 0.2, `Side windows ${side(s)}`);
  }
  add(extrude(clipY(outline, roofCut, false), W * 0.81, 0.04), part("roof", paint), 0, 0, 0, "Roof");
  for (const px of S.pillars) add(new THREE.BoxGeometry(0.075, Math.max(0.05, roofCut - belt), W * 0.815), damage ? neutral : paint, (px - mid) * kx, (belt + roofCut) / 2, 0, "Pillar");

  // arch liners so the wheel wells aren't see-through
  for (const cx of wheelX) add(new THREE.BoxGeometry(archR * 2, R + archR - clearance, Math.max(0.2, W - 2 * tw - 0.12)), dark, cx, (clearance + R + archR) / 2, 0, "WheelWell");

  // lights, grille, mirrors
  const svgY = (y) => (groundSvg - y) * ky;
  const [, fx] = xExtent(lower, svgY(89)), [rx] = xExtent(lower, svgY(90));
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(0.06, 0.07, W * 0.2), part(`headlight_${side(s)}`, head), fx - 0.015, svgY(89), s * W * 0.3, "Headlight");
    add(new THREE.BoxGeometry(0.05, 0.08, W * 0.18), part(`taillight_${side(s)}`, tail), rx + 0.012, svgY(90), s * W * 0.32, "Taillight");
  }
  const [, gx] = xExtent(lower, svgY(97));
  add(new THREE.BoxGeometry(0.05, 0.11, W * 0.42), dark, gx - 0.012, svgY(97), 0, "Grille");
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.17, 0.1, 0.13), part(`mirror_${side(s)}`, paint), cabinFront - 0.18, belt + 0.06, s * (W * 0.4 + 0.07), "Mirror");

  // wheels
  for (const [k, cx] of wheelX.entries()) for (const s of [-1, 1]) {
    const rim = part(`wheel_${k ? "r" : "f"}${side(s)}`, rimMat);
    const z = s * (W / 2 - tw / 2 + 0.015), wheel = new THREE.Group();
    wheel.name = "Wheel";
    wheel.position.set(cx, R, z);
    const t = new THREE.Mesh(new THREE.CylinderGeometry(R, R, tw, 40).rotateX(Math.PI / 2), tire);
    const r = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.64, R * 0.64, tw + 0.012, 32).rotateX(Math.PI / 2), rim);
    wheel.add(t, r);
    for (let k = 0; k < 5; k++) {
      const a = (k * 2 * Math.PI) / 5, sp = new THREE.Mesh(new THREE.BoxGeometry(R * 0.56, R * 0.12, 0.02), rim);
      sp.rotation.z = a;
      sp.position.set(Math.cos(a) * R * 0.3, Math.sin(a) * R * 0.3, s * (tw / 2 + 0.012));
      wheel.add(sp);
    }
    car.add(wheel);
  }
  return { scene, THREE };
}

/** spec (+ optional damage parts) → Blob (.glb) */
export async function buildCarGlb(spec, damage) {
  const [{ scene }, { GLTFExporter }] = await Promise.all([buildScene(spec, damage), import("three/examples/jsm/exporters/GLTFExporter.js")]);
  const buf = await new GLTFExporter().parseAsync(scene, { binary: true });
  return new Blob([buf], { type: "model/gltf-binary" });
}

// one object URL per distinct spec, reused across viewers
const cache = new Map();
export const specKey = (spec) => spec ? JSON.stringify([spec.bodyType, spec.paintHex, spec.dimensions]) : "";
export function carGlbUrl(spec) {
  const key = specKey(spec);
  if (!cache.has(key)) cache.set(key, buildCarGlb(spec).then((b) => URL.createObjectURL(b)).catch((e) => { cache.delete(key); throw e; }));
  return cache.get(key);
}

// damage views change with every edit: keep only the most recent few
const damageCache = new Map();
export function damageGlbUrl(spec, parts = {}) {
  const sev = Object.fromEntries(Object.entries(parts).filter(([, p]) => p?.s > 0).map(([k, p]) => [k, { s: p.s }]));
  const key = specKey(spec) + JSON.stringify(Object.entries(sev).sort());
  if (!damageCache.has(key)) {
    damageCache.set(key, buildCarGlb(spec, sev).then((b) => URL.createObjectURL(b)).catch((e) => { damageCache.delete(key); throw e; }));
    while (damageCache.size > 12) {
      const [old, p] = damageCache.entries().next().value;
      damageCache.delete(old);
      p.then(URL.revokeObjectURL, () => {});
    }
  }
  return damageCache.get(key);
}
