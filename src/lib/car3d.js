/* ─────────────────────────────────────────────────────────────
   Procedural 3D car (three.js → .glb)
   Builds a 3D car from an AI spec: body-type silhouette (same shapes as the
   illustrations) scaled to the real length / width / height / wheelbase,
   painted in the identified colour. Exported as a GLB blob URL so the
   existing <model-viewer> shows it with orbit, zoom and AR.
   ───────────────────────────────────────────────────────────── */
import { SHAPES } from "../components/CarArt.jsx";

/* Sutherland–Hodgman clip of a polygon against the horizontal line y = c. keep(y) decides the side. */
function clipY(poly, c, below) {
  const inside = (p) => (below ? p[1] <= c : p[1] >= c), out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], ia = inside(a), ib = inside(b);
    if (ia) out.push(a);
    if (ia !== ib) { const t = (c - a[1]) / (b[1] - a[1]); out.push([a[0] + (b[0] - a[0]) * t, c]); }
  }
  return out;
}
/** [minX, maxX] where the horizontal line y crosses the polygon */
function xExtent(poly, y) {
  const xs = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    if ((a[1] - y) * (b[1] - y) <= 0 && a[1] !== b[1]) xs.push(a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
  }
  return xs.length ? [Math.min(...xs), Math.max(...xs)] : [0, 0];
}

async function buildScene(spec) {
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
  const rim = new THREE.MeshStandardMaterial({ color: "#c7ccd4", metalness: 1, roughness: 0.28 });
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

  const lower = clipY(outline, belt + 0.01, true);
  add(extrude(lower, W, 0.05), paint, 0, 0, 0, "Body");
  add(extrude(clipY(outline, belt - 0.02, false), W * 0.8, 0.04), glass, 0, 0, 0, "Glass");
  add(extrude(clipY(outline, roofCut, false), W * 0.81, 0.04), paint, 0, 0, 0, "Roof");
  for (const px of S.pillars) add(new THREE.BoxGeometry(0.075, Math.max(0.05, roofCut - belt), W * 0.815), paint, (px - mid) * kx, (belt + roofCut) / 2, 0, "Pillar");

  // arch liners so the wheel wells aren't see-through
  for (const cx of wheelX) add(new THREE.BoxGeometry(archR * 2, R + archR - clearance, Math.max(0.2, W - 2 * tw - 0.12)), dark, cx, (clearance + R + archR) / 2, 0, "WheelWell");

  // lights, grille, mirrors
  const svgY = (y) => (groundSvg - y) * ky;
  const [, fx] = xExtent(lower, svgY(89)), [rx] = xExtent(lower, svgY(90));
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(0.06, 0.07, W * 0.2), head, fx - 0.015, svgY(89), s * W * 0.3, "Headlight");
    add(new THREE.BoxGeometry(0.05, 0.08, W * 0.18), tail, rx + 0.012, svgY(90), s * W * 0.32, "Taillight");
  }
  const [, gx] = xExtent(lower, svgY(97));
  add(new THREE.BoxGeometry(0.05, 0.11, W * 0.42), dark, gx - 0.012, svgY(97), 0, "Grille");
  const [, cabinFront] = xExtent(clipY(outline, belt - 0.02, false), belt + 0.03);
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.17, 0.1, 0.13), paint, cabinFront - 0.18, belt + 0.06, s * (W * 0.4 + 0.07), "Mirror");

  // wheels
  for (const cx of wheelX) for (const s of [-1, 1]) {
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

/** spec → Blob (.glb) */
export async function buildCarGlb(spec) {
  const [{ scene }, { GLTFExporter }] = await Promise.all([buildScene(spec), import("three/examples/jsm/exporters/GLTFExporter.js")]);
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
