import React, { useEffect, useMemo, useRef, useState } from "react";
import CarArt from "./CarArt.jsx";
import Icon from "./Icon.jsx";
import { bodyTypeOf, expandFrames, getLocalMedia, imaginFrames, mediaEvents } from "../lib/vehicleMedia.js";
import { carGlbUrl, specKey } from "../lib/car3d.js";

/* Loads the photos / 3D file uploaded for a vehicle in this browser (IndexedDB) as object URLs. */
export function useLocalMedia(id) {
  const [media, setMedia] = useState({ frames: [], glb: null, glbName: "", count: 0 });
  useEffect(() => {
    let urls = [], alive = true;
    const load = async () => {
      const m = await getLocalMedia(id);
      if (!alive) return;
      urls.forEach(URL.revokeObjectURL);
      const frames = (m.frames || []).map((b) => URL.createObjectURL(b));
      const glb = m.glb ? URL.createObjectURL(m.glb) : null;
      urls = [...frames, ...(glb ? [glb] : [])];
      setMedia({ frames, glb, glbName: m.glb?.name || "", glbSize: m.glb?.size || 0, framesSize: (m.frames || []).reduce((a, b) => a + b.size, 0) });
    };
    load();
    const onChange = (e) => (e.detail === id || e.detail === "*") && load();
    mediaEvents.addEventListener("change", onChange);
    return () => { alive = false; mediaEvents.removeEventListener("change", onChange); urls.forEach(URL.revokeObjectURL); };
  }, [id]);
  return media;
}

/* Generated 3D model (.glb object URL) for a vehicle's AI spec, or null while building / when there is none. */
export function useAiModel(spec, enabled = true) {
  const key = specKey(spec);
  const [url, setUrl] = useState(null);
  useEffect(() => {
    setUrl(null);
    if (!spec || !enabled) return;
    let alive = true;
    carGlbUrl(spec).then((u) => alive && setUrl(u)).catch(() => {});
    return () => { alive = false; };
  }, [key, enabled]);
  return url;
}

/* Drag / swipe / arrow-key spinner over an ordered set of frames. */
function FrameSpinner({ frames, auto, still, onFail, label }) {
  const n = frames.length;
  const [i, setI] = useState(0);
  const [loaded, setLoaded] = useState(0);
  const drag = useRef(null), touched = useRef(0), box = useRef(null);
  const sig = frames.join("|");

  useEffect(() => { setI(0); setLoaded(0); }, [sig]);
  useEffect(() => {
    if (still || !auto || n < 2) return;
    const t = setInterval(() => {
      if (drag.current || Date.now() - touched.current < 2500 || loaded < n) return;
      setI((x) => (x + 1) % n);
    }, n >= 16 ? 90 : 260);
    return () => clearInterval(t);
  }, [still, auto, n, loaded]);

  const down = (e) => { if (still || n < 2) return; drag.current = { x: e.clientX, i }; touched.current = Date.now(); e.currentTarget.setPointerCapture?.(e.pointerId); };
  const move = (e) => {
    if (!drag.current) return;
    const per = Math.max(4, (box.current?.clientWidth || 300) / Math.max(n, 12));
    const d = Math.round((e.clientX - drag.current.x) / per);
    setI((((drag.current.i - d) % n) + n) % n);
  };
  const up = () => { drag.current = null; touched.current = Date.now(); };
  const key = (e) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); touched.current = Date.now(); setI((x) => (x + (e.key === "ArrowRight" ? 1 : -1) + n) % n); }
  };

  const shown = still ? [frames[0]] : frames;
  return (
    <div ref={box} className={`spin ${still || n < 2 ? "still" : ""}`} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
      onKeyDown={key} tabIndex={still || n < 2 ? -1 : 0} role={still || n < 2 ? "img" : "slider"} aria-label={label}
      aria-valuemin={still ? undefined : 1} aria-valuemax={still ? undefined : n} aria-valuenow={still ? undefined : i + 1}>
      {shown.map((u, k) => (
        <img key={u} src={u} alt="" draggable={false} style={{ opacity: k === (still ? 0 : i) ? 1 : 0 }}
          onLoad={() => setLoaded((x) => x + 1)} onError={k === 0 ? onFail : undefined} />
      ))}
      {!still && n > 1 && loaded < n && <div className="spin-load"><i style={{ width: `${(loaded / n) * 100}%` }} /></div>}
      {!still && n > 1 && loaded >= n && <div className="spin-hint"><Icon n="spin" s={11} />Drag to rotate</div>}
    </div>
  );
}

/* Google <model-viewer> for .glb files — loaded only when a 3D file exists. */
export function ModelBox({ src, auto, onFail, label, orbit = "35deg 75deg auto" }) {
  const [ready, setReady] = useState(() => typeof customElements !== "undefined" && !!customElements.get("model-viewer"));
  const ref = useRef(null);
  useEffect(() => {
    if (ready) return;
    import("@google/model-viewer").then(() => setReady(true)).catch(() => onFail());
  }, [ready]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const h = () => onFail();
    el.addEventListener("error", h);
    return () => el.removeEventListener("error", h);
  }, [ready, src]);
  if (!ready) return <div className="spin-msg">Loading 3D viewer…</div>;
  const opts = auto ? { "auto-rotate": "" } : {};
  return (
    <>
      <model-viewer ref={ref} src={src} alt={label} camera-controls="" touch-action="pan-y" ar="" ar-modes="webxr scene-viewer quick-look"
        shadow-intensity="1" exposure="1.05" camera-orbit={orbit} interaction-prompt="none" {...opts}
        style={{ width: "100%", height: "100%", background: "transparent", "--poster-color": "transparent" }} />
      <div className="spin-hint"><Icon n="spin" s={11} />Drag to orbit · scroll to zoom</div>
    </>
  );
}

/**
 * Picks the best available imagery for a vehicle:
 *   1. 3D model (.glb)        uploaded here, or a hosted URL       → full 3D orbit
 *   2. AI 3D model            generated from the AI-identified spec (body, dimensions, paint)
 *   3. 360° photo frames      uploaded here, or hosted pattern     → drag-to-spin
 *   4. IMAGIN studio renders  (needs a customer key in Settings)   → spin across angles
 *   5. Illustration            body type detected from the model name
 * If a source fails to load, the next one is used automatically.
 * variant: "hero" | "detail" (interactive) or "card" (single still image)
 * media: optional { frames, glb } object URLs shown instead of what is stored for v.id (unsaved uploads)
 */
export default function Vehicle360({ vehicle: v, settings, variant = "hero", onManage, media }) {
  const stored = useLocalMedia(v.id);
  const local = media || stored;
  const hosted = useMemo(() => expandFrames(v.framesUrl || ""), [v.framesUrl]);
  const renders = useMemo(() => imaginFrames(v, settings), [v.brand, v.model, v.year, v.color, v.imaginModel, settings?.imaginKey, settings?.imaginAngles]);
  const glb = local.glb || v.glbUrl;
  const aiGlb = useAiModel(v.ai, !glb && variant !== "card");
  const [failed, setFailed] = useState({});
  useEffect(() => setFailed({}), [v.id, v.glbUrl, v.framesUrl, settings?.imaginKey]);

  const sources = [];
  if (glb && variant !== "card") sources.push({ id: "3d:" + glb, kind: "3d", src: glb });
  if (aiGlb) sources.push({ id: "ai:" + aiGlb, kind: "3d", src: aiGlb, ai: true });
  if (local.frames.length) sources.push({ id: "local:" + local.frames[0], kind: "photos", frames: local.frames });
  if (hosted.length) sources.push({ id: "hosted:" + hosted[0], kind: "photos", frames: hosted });
  if (renders.length) sources.push({ id: "render:" + renders[0], kind: "render", frames: renders });
  sources.push({ id: "art", kind: "art" });
  const src = sources.find((s) => !failed[s.id]);
  const fail = () => setFailed((f) => ({ ...f, [src.id]: true }));

  const label = `${v.brand} ${v.model}`;
  const still = variant === "card";
  const auto = settings?.autoRotate !== false;
  const badge = src.ai ? "AI 3D" : src.kind === "3d" ? "3D" : src.kind === "photos" ? (src.frames.length > 1 ? `360° · ${src.frames.length}` : "Photo")
    : src.kind === "render" ? (src.frames.length > 1 ? "360° render" : "Render") : glb ? "3D available" : "Illustration";

  return (
    <div className={`v360 v360-${variant}`}>
      {src.kind === "3d" && <ModelBox key={src.id} src={src.src} auto={auto} onFail={fail} label={label} />}
      {(src.kind === "photos" || src.kind === "render") && <FrameSpinner key={src.id} frames={src.frames} auto={auto} still={still} onFail={fail} label={`${label}, 360° view`} />}
      {src.kind === "art" && <div className="art"><CarArt color={v.color} body={bodyTypeOf(v)} /></div>}
      <span className={`v-badge k-${src.kind}`}>{badge}</span>
      {src.kind === "art" && onManage && !still && (
        <button className="v-add" onClick={onManage}><Icon n="plus" s={11} w={2.4} />Add 360° photos or 3D</button>
      )}
    </div>
  );
}
