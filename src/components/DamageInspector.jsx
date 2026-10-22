import React, { useEffect, useRef, useState } from "react";
import Icon from "./Icon.jsx";
import { ModelBox } from "./Vehicle360.jsx";
import { assessDamage, estimateSpec } from "../lib/carAI.js";
import { damageGlbUrl, specKey } from "../lib/car3d.js";
import { DAMAGE_SCALE, PARTS, PART_LABEL, SEVERITY, damagedParts, mergeDamage, parseDamageText } from "../lib/damage.js";

/**
 * Damage inspection on the generated 3D model: each part is painted white (no damage) → red (severe).
 * Damaged parts come from a written description or a photo, read by the local AI (a description is
 * parsed offline when Ollama isn't available), and can be corrected in the list below the model.
 * value / onChange: the vehicle's `damage` record (see lib/damage.js).
 */
export default function DamageInspector({ vehicle: v, value, onChange, settings, toast, goSettings }) {
  const spec = v.ai || estimateSpec(v);
  const parts = value?.parts || {};
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const file = useRef(null);
  const ai = { url: settings.ollamaUrl?.trim(), model: settings.ollamaModel?.trim() };
  const enabled = !!(ai.url && ai.model);
  const list = damagedParts(value);
  const sevKey = JSON.stringify(list.map(([k, p]) => [k, p.s]).sort());

  useEffect(() => {
    let alive = true;
    setFailed(false);
    damageGlbUrl(spec, parts).then((u) => alive && setUrl(u)).catch(() => alive && setFailed(true));
    return () => { alive = false; };
  }, [specKey(spec), sevKey]);

  const apply = (found, meta) => {
    if (!found.length) { toast("No damaged parts were found."); return; }
    onChange(mergeDamage(value, found, meta));
    toast(`${found.length} damaged part${found.length > 1 ? "s" : ""} highlighted.`);
  };
  const fromText = async () => {
    if (!text.trim()) return setError("Describe the damage first, e.g. “dented rear left door, cracked right headlight”.");
    setError("");
    if (!enabled) return apply(parseDamageText(text), { source: "text" });
    setBusy(`Reading the description with ${ai.model}…`);
    try {
      const r = await assessDamage(v, { ...ai, text });
      apply(r.parts, { summary: r.summary || value?.summary, source: "local", aiModel: ai.model });
    } catch (e) {
      const found = parseDamageText(text);
      setError(`${e.message}${found.length ? " Used the offline reader instead." : ""}`);
      if (found.length) apply(found, { source: "text" });
    } finally { setBusy(""); }
  };
  const fromPhoto = async (photo) => {
    setError("");
    setBusy(`Looking for damage with ${ai.model}…`);
    try {
      const r = await assessDamage(v, { ...ai, text, photo });
      apply(r.parts, { summary: r.summary || value?.summary, source: "local", aiModel: ai.model, fromPhoto: true });
    } catch (e) { setError(e.message || "Damage detection failed."); }
    finally { setBusy(""); }
  };
  const onFile = (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) fromPhoto(f); };
  const setPart = (id, s) => {
    const next = { ...parts };
    if (s > 0) next[id] = { note: "", ...next[id], s }; else delete next[id];
    onChange({ ...value, parts: next, at: Date.now() });
  };
  const unlisted = PARTS.filter(([id]) => !(parts[id]?.s > 0));

  return (
    <div className="dmg">
      <div className="v-detail dmg-view">
        {failed ? <div className="spin-msg">Couldn't build the 3D damage view.</div>
          : url ? <ModelBox key={url} src={url} auto={settings.autoRotate !== false} onFail={() => setFailed(true)} label={`${v.brand} ${v.model} damage map`} />
          : <div className="spin-msg">Building damage view…</div>}
        <span className="v-badge k-3d">Damage map</span>
      </div>
      <div className="dmg-legend" aria-hidden="true">
        {SEVERITY.map((s, i) => <span key={s}><i style={{ background: DAMAGE_SCALE[i] }} />{s}</span>)}
      </div>

      <div className="media-sec">
        <div className="media-h"><Icon n="spark" s={15} /><b>Find damage with AI</b>
          <span className={`pill ${enabled ? "g" : "n"}`}>{enabled ? ai.model : "Offline reader"}</span></div>
        <div className="field full"><textarea value={text} onChange={(e) => setText(e.target.value)} disabled={!!busy}
          placeholder="Describe the damage, e.g. “dented rear left door, scratched front bumper, cracked right headlight”" /></div>
        <div className="dmg-actions">
          <button type="button" className="btn primary" disabled={!!busy} onClick={fromText}><Icon n="spark" s={14} />Highlight damage</button>
          <input ref={file} type="file" accept="image/*" hidden onChange={onFile} />
          <button type="button" className="btn" disabled={!!busy} onClick={() => (enabled ? file.current.click() : setError("Photo detection needs the local AI. Set it up in Administration."))}><Icon n="camera" s={14} />Detect from photo</button>
          {busy && <span className="muted" style={{ fontSize: 11 }}>{busy}</span>}
        </div>
        {error && <p className="ai-warn"><Icon n="alert" s={12} />{error} {goSettings && <button type="button" className="link-btn" onClick={goSettings}>AI settings</button>}</p>}
        <p className="page-note" style={{ margin: 0 }}>Left and right are the driver's left and right. AI results are suggestions: check them against the car and correct them below.</p>
      </div>

      <div className="media-sec">
        <div className="media-h"><Icon n="alert" s={15} /><b>Damaged parts</b>
          {list.length > 0 && <button type="button" className="mini-btn danger" onClick={() => onChange({ ...value, parts: {}, summary: "", at: Date.now() })}><Icon n="trash" s={12} />Clear all</button>}</div>
        {value?.summary && list.length > 0 && <p className="ai-note" style={{ fontSize: 11 }}>{value.summary}</p>}
        {list.length === 0 && <p className="muted" style={{ margin: 0, fontSize: 12 }}>No damage recorded. Every part shows white.</p>}
        {list.map(([id, p]) => (
          <div className="dmg-row" key={id}>
            <i style={{ background: DAMAGE_SCALE[p.s] }} />
            <span><b>{PART_LABEL[id]}</b>{p.note && <small>{p.note}</small>}</span>
            <select value={p.s} onChange={(e) => setPart(id, Number(e.target.value))} aria-label={`${PART_LABEL[id]} severity`}>
              {SEVERITY.map((s, i) => <option key={s} value={i}>{s}</option>)}
            </select>
          </div>
        ))}
        <select className="select" value="" onChange={(e) => e.target.value && setPart(e.target.value, 2)} aria-label="Add a damaged part">
          <option value="">+ Add a damaged part…</option>
          {unlisted.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
      </div>
    </div>
  );
}
