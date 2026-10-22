import React, { useEffect, useRef, useState } from "react";
import Icon from "./Icon.jsx";
import { useLocalMedia } from "./Vehicle360.jsx";
import { BODY_LABEL, estimateSpec, identifyVehicle } from "../lib/carAI.js";

// vehicles currently being identified or that already failed this session (stops auto-runs looping)
const running = new Set(), failedAuto = new Set();
const fmtMm = (n) => Number(n).toLocaleString("en-MY");

/**
 * AI strip for the dashboard's Latest Inventory card.
 * Identifies the vehicle automatically with the local Ollama model (or estimates it if that isn't
 * available) and stores the spec on the record as `ai`; Vehicle360 turns that into a 3D model.
 * "Scan photo" identifies a car from a picture and checks it against the record.
 */
export default function AiIdentify({ vehicle: v, settings, onSaveAi, toast, goSettings }) {
  const local = useLocalMedia(v.id);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const file = useRef(null);
  const url = settings.ollamaUrl?.trim(), model = settings.ollamaModel?.trim();
  const enabled = !!(url && model);
  const ai = v.ai;

  const run = async (photo, auto = false) => {
    if (running.has(v.id)) return;
    setError("");
    if (!enabled) {
      if (photo) { setError("Photo scanning needs the local AI. Set it up in Administration."); return; }
      onSaveAi(v.id, estimateSpec(v));
      return;
    }
    running.add(v.id);
    setBusy(photo ? `Scanning photo with ${model}…` : `Identifying with ${model}…`);
    try {
      // with no photo given, use the first 360° photo uploaded for this vehicle, if any
      const img = photo || (local.frames[0] ? await fetch(local.frames[0]).then((r) => r.blob()) : null);
      const spec = await identifyVehicle(v, { url, model, photo: img, scan: !!photo });
      onSaveAi(v.id, spec);
      if (!auto) toast(`Identified ${spec.make} ${spec.model}${spec.generation ? ` (${spec.generation})` : ""}. 3D model generated.`);
    } catch (e) {
      if (auto) {
        failedAuto.add(v.id);
        if (!ai) onSaveAi(v.id, estimateSpec(v)); // still show a 3D model
      }
      setError(e.message || "Identification failed.");
    } finally {
      running.delete(v.id);
      setBusy("");
    }
  };

  // automatic: identify once per vehicle; upgrade an offline estimate once the local AI is set up
  useEffect(() => {
    if (settings.aiAuto === false || failedAuto.has(v.id)) return;
    if (!ai || (ai.source === "estimate" && enabled)) run(null, true);
  }, [v.id, ai?.source, enabled, settings.aiAuto]);

  const onFile = (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) run(f); };
  const mismatch = ai && ai.fromPhoto && !ai.matchesRecord;
  const years = ai ? (ai.yearFrom && ai.yearTo && ai.yearFrom !== ai.yearTo ? `${ai.yearFrom}–${ai.yearTo}` : ai.yearFrom || "") : "";
  const estimate = ai?.source === "estimate";

  return (
    <div className="ai-strip" aria-live="polite">
      <div className="ai-top">
        <span className="ai-tag"><Icon n="spark" s={12} />AI</span>
        {busy ? <span className="ai-busy">{busy}</span>
          : ai ? (
            <span className="ai-id">
              <b>{ai.make} {ai.model}</b>
              {[ai.generation, years, BODY_LABEL[ai.bodyType]].filter(Boolean).map((x) => <span key={x}> · {x}</span>)}
            </span>
          ) : <span className="muted">Not identified yet</span>}
        {ai && !busy && <span className={`pill ${!estimate && ai.confidence >= 0.7 ? "g" : "n"}`} title={estimate ? "Offline estimate" : `Confidence reported by ${ai.aiModel || "the local AI"}`}>
          {estimate ? "Estimate" : `${Math.round(ai.confidence * 100)}%`}</span>}
        <div className="ai-actions">
          <input ref={file} type="file" accept="image/*" hidden onChange={onFile} />
          <button className="mini-btn" disabled={!!busy} onClick={() => (enabled ? file.current.click() : setError("Photo scanning needs the local AI. Set it up in Administration."))}><Icon n="camera" s={11} />Scan photo</button>
          <button className="mini-btn" disabled={!!busy} onClick={() => run(null)} title="Identify again from the record"><Icon n="spin" s={11} />{ai ? "Re-identify" : "Identify"}</button>
        </div>
      </div>
      {ai && !busy && (
        <div className="ai-meta">
          <span className="ai-paint"><i style={{ background: ai.paintHex }} />{ai.paintName || "—"}</span>
          <span>{fmtMm(ai.dimensions.lengthMm)} × {fmtMm(ai.dimensions.widthMm)} × {fmtMm(ai.dimensions.heightMm)} mm</span>
          <span>WB {fmtMm(ai.dimensions.wheelbaseMm)} mm</span>
          <span>{ai.dimensions.wheelDiameterIn}″ wheels</span>
        </div>
      )}
      {mismatch && <p className="ai-warn"><Icon n="alert" s={12} />The scanned photo looks like a different car from this record ({v.brand} {v.model}). The 3D model shows the car in the photo.</p>}
      {ai?.summary && !busy && !mismatch && <p className="ai-note">{ai.summary}</p>}
      {error && <p className="ai-warn"><Icon n="alert" s={12} />{error} <button className="link-btn" onClick={goSettings}>AI settings</button></p>}
    </div>
  );
}
