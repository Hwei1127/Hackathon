import React, { useEffect, useState } from "react";
import Icon from "./Icon.jsx";
import Vehicle360, { useVehicleMedia } from "./Vehicle360.jsx";
import { BODY_TYPES, bodyTypeOf, expandFrames, fmtBytes, guessModelFamily, sortFiles } from "../lib/vehicleMedia.js";
import { setMedia } from "../lib/mediaStore.js";

/* Shrink photos before storing them (max 1600px wide, JPEG) so 36 frames stay a few MB. */
async function shrink(file, max = 1600) {
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, max / bmp.width);
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, file.type === "image/png" ? "image/png" : "image/jpeg", 0.86));
    return blob ? new File([blob], file.name, { type: blob.type }) : file;
  } catch { return file; }
}

function DropZone({ accept, multiple, onFiles, icon, title, hint }) {
  const [over, setOver] = useState(false);
  return (
    <label className={`drop ${over ? "over" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); onFiles([...e.dataTransfer.files]); }}>
      <input type="file" accept={accept} multiple={multiple} onChange={(e) => { onFiles([...e.target.files]); e.target.value = ""; }} />
      <span className="drop-ic"><Icon n={icon} s={18} /></span>
      <b>{title}</b><small>{hint}</small>
    </label>
  );
}

/* Validates and shrinks dropped photos → File[] in play order, or null (after telling the user why). */
export async function preparePhotos(files, toast, setBusy) {
  const imgs = sortFiles(files.filter((f) => f.type.startsWith("image/")));
  if (!imgs.length) { toast("Choose image files (JPG, PNG or WebP)."); return null; }
  if (imgs.length > 72) { toast("Use 72 photos or fewer."); return null; }
  setBusy(`Optimising ${imgs.length} photos…`);
  const frames = [];
  try { for (const f of imgs) frames.push(await shrink(f)); } finally { setBusy(""); }
  return frames;
}
export function pickGlb(files, toast) {
  const f = files.find((x) => /\.glb$/i.test(x.name));
  if (!f) toast("Choose a .glb 3D file (binary glTF).");
  return f || null;
}

/* Upload, hosted-link and render fields — shared by the 360° media window and the Add / Edit vehicle form.
   info: { frames, framesSize, glbName, glbSize } describing what is currently attached. */
export function MediaFields({ id, model, info, form, set, onPhotos, onModel, onRemovePhotos, onRemoveModel, settings, goSettings, guess, withBody = true }) {
  const hostedCount = expandFrames(form.framesUrl).length;
  const ph = id || "<Stock ID>";
  return (
    <>
      <div className="media-sec">
        <div className="media-h"><Icon n="image" s={15} /><b>360° photos</b>
          {info.frames > 0 && <span className="pill g">{info.frames} photos · {fmtBytes(info.framesSize)}</span>}</div>
        <DropZone accept="image/*" multiple onFiles={onPhotos} icon="upload" title="Upload or drop photos"
          hint="12–36 shots taken at even steps around the car. They play in file-name order (01.jpg, 02.jpg…)." />
        {info.frames > 0 && <button type="button" className="mini-btn danger" onClick={onRemovePhotos}><Icon n="trash" s={12} />Remove photos</button>}
      </div>

      <div className="media-sec">
        <div className="media-h"><Icon n="cube" s={15} /><b>3D model</b>
          {info.glbName && <span className="pill g">{info.glbName} · {fmtBytes(info.glbSize)}</span>}</div>
        <DropZone accept=".glb,model/gltf-binary" onFiles={onModel} icon="upload" title="Upload or drop a .glb file"
          hint="Full 3D orbit with zoom, and AR on supported phones. Use a model you're licensed to use." />
        {info.glbName && <button type="button" className="mini-btn danger" onClick={onRemoveModel}><Icon n="trash" s={12} />Remove 3D model</button>}
      </div>
      <p className="page-note" style={{ marginTop: -4 }}>{info.where === "browser" && (info.frames > 0 || info.glbName)
        ? <><b>Waiting to upload:</b> the database can't be reached, so these files are kept in this browser for now. They upload automatically when it's back.</>
        : <>Uploads are saved to the database, so every user and device loads the same files for this vehicle.</>}</p>

      <div className="media-sec">
        <div className="media-h"><Icon n="link" s={15} /><b>Hosted files</b><span className="muted" style={{ fontSize: 10 }}>visible to everyone</span></div>
        <div className="form-grid">
          <div className="field full"><label>3D model URL (.glb)</label><input value={form.glbUrl} onChange={set("glbUrl")} placeholder={`/media/${ph}/model.glb`} /></div>
          <div className="field full"><label>360° photo URLs {hostedCount > 0 && <span className="muted">· {hostedCount} frames</span>}</label>
            <textarea value={form.framesUrl} onChange={set("framesUrl")} placeholder={`/media/${ph}/{01..36}.jpg\n(or one URL per line)`} /></div>
        </div>
      </div>

      <div className="media-sec">
        <div className="media-h"><Icon n="key" s={15} /><b>{withBody ? <>Studio renders &amp; illustration</> : "Studio renders"}</b>
          <span className={`pill ${settings.imaginKey ? "g" : "n"}`}>{settings.imaginKey ? "IMAGIN connected" : "No render key"}</span></div>
        <div className="form-grid">
          <div className="field"><label>Model family for renders</label><input value={form.imaginModel} onChange={set("imaginModel")} placeholder={`auto: ${guess || "—"}`} /></div>
          {withBody && <div className="field"><label>Body type</label><select value={form.body} onChange={set("body")}>{BODY_TYPES.map((b) => <option key={b} value={b}>{b === "Auto" ? `Auto (${bodyTypeOf({ model })})` : b}</option>)}</select></div>}
        </div>
        {!settings.imaginKey && <p className="page-note" style={{ margin: "10px 0 0" }}>Add your IMAGIN.studio customer key under {goSettings ? <button type="button" className="link-btn" onClick={goSettings}>Administration → Vehicle imagery</button> : <b>Administration → Vehicle imagery</b>} to show photo-realistic renders of every model automatically.</p>}
      </div>
    </>
  );
}

/* 360° / 3D section of the Add / Edit vehicle form. Uploads wait in `value.pending` until the record is saved:
   { frames?: File[], glb?: File|null } — a missing key keeps what is stored, an empty value removes it. */
export function VehicleMediaForm({ vehicle, storedId, value, onChange, settings, toast }) {
  const stored = useVehicleMedia(storedId ?? "");
  const [busy, setBusy] = useState("");
  const [urls, setUrls] = useState({});
  const { pending, form } = value;
  useEffect(() => {
    const frames = pending.frames?.map((f) => URL.createObjectURL(f));
    const glb = pending.glb ? URL.createObjectURL(pending.glb) : pending.glb;
    setUrls("glb" in pending ? { frames, glb } : { frames });
    return () => { frames?.forEach(URL.revokeObjectURL); glb && URL.revokeObjectURL(glb); };
  }, [pending.frames, pending.glb]);

  const setPending = (patch) => onChange({ ...value, pending: { ...pending, ...patch } });
  const set = (k) => (e) => onChange({ ...value, form: { ...form, [k]: e.target.value } });
  const frames = pending.frames ? urls.frames || [] : stored.frames;
  const glb = "glb" in pending ? urls.glb ?? null : stored.glb;
  const info = pending.frames
    ? { frames: pending.frames.length, framesSize: pending.frames.reduce((a, b) => a + b.size, 0) }
    : { frames: stored.frames.length, framesSize: stored.framesSize };
  if (pending.glb) Object.assign(info, { glbName: pending.glb.name, glbSize: pending.glb.size });
  else if (!("glb" in pending) && stored.glb) Object.assign(info, { glbName: stored.glbName || "model.glb", glbSize: stored.glbSize });

  const addPhotos = async (files) => {
    const f = await preparePhotos(files, toast, setBusy).catch(() => null);
    if (!f) return;
    setPending({ frames: f });
    if (f.length < 8) toast("Use 12 or more photos for a smooth spin.");
  };
  const addModel = (files) => { const f = pickGlb(files, toast); if (f) setPending({ glb: f }); };

  return (
    <div className="vm-form">
      <div className="media-h"><Icon n="spin" s={15} /><b>360° view &amp; 3D model</b><span className="muted" style={{ fontSize: 10 }}>optional · saved with the record</span>
        {busy && <span className="muted" style={{ marginLeft: "auto", fontSize: 11 }}>{busy}</span>}</div>
      <div className="v-detail">
        <Vehicle360 key={frames.length + (frames[0] || "") + (glb || "")} vehicle={{ ...vehicle, ...form }} media={{ frames, glb }} settings={settings} variant="detail" />
      </div>
      <MediaFields id={vehicle.id} model={vehicle.model} info={info} form={form} set={set} settings={settings} withBody={false}
        guess={guessModelFamily(vehicle.brand, vehicle.model)} onPhotos={addPhotos} onModel={addModel}
        onRemovePhotos={() => setPending({ frames: [] })} onRemoveModel={() => setPending({ glb: null })} />
    </div>
  );
}

export default function MediaManager({ vehicle: v, settings, onSave, onClose, toast, goSettings }) {
  const local = useVehicleMedia(v.id);
  const [busy, setBusy] = useState("");
  const [form, setForm] = useState({ glbUrl: v.glbUrl || "", framesUrl: v.framesUrl || "", imaginModel: v.imaginModel || "", body: v.body || "Auto" });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const preview = { ...v, ...form };
  const info = { where: local.where, frames: local.frames.length, framesSize: local.framesSize,...(local.glb ? { glbName: local.glbName || "model.glb", glbSize: local.glbSize } : {}) };

  // saved to the database; if it can't be reached the files wait in this browser and upload later
  const save = async (patch, busyText, done) => {
    setBusy(busyText);
    try {
      const where = await setMedia(v.id, patch);
      toast(where === "database" ? done : `${done.replace(/\.$/, "")} in this browser for now. It will upload to the database when it's reachable.`);
    } catch { toast("Couldn't save the files (browser storage may be full)."); }
    finally { setBusy(""); }
  };
  const addPhotos = async (files) => {
    const frames = await preparePhotos(files, toast, setBusy).catch(() => null);
    if (frames) await save({ frames }, `Uploading ${frames.length} photos…`, `${frames.length} photos saved for ${v.id}.${frames.length < 8 ? " Use 12 or more for a smooth spin." : ""}`);
  };
  const addModel = async (files) => {
    const f = pickGlb(files, toast);
    if (f) await save({ glb: f }, "Uploading 3D model…", `3D model saved for ${v.id}.`);
  };

  return (
    <>
      <div className="modal-body">
        <div className="v-detail"><Vehicle360 key={JSON.stringify(form) + local.frames.length + (local.glb || "")} vehicle={preview} settings={settings} variant="detail" /></div>
        <p className="page-note" style={{ margin: "10px 0 16px" }}>
          The viewer uses the best source available: <b>3D model</b> → <b>360° photos</b> → <b>studio renders</b> → <b>illustration</b>.
        </p>
        <MediaFields id={v.id} model={v.model} info={info} form={form} set={set} settings={settings} goSettings={goSettings}
          guess={guessModelFamily(v.brand, v.model)} onPhotos={addPhotos} onModel={addModel}
          onRemovePhotos={() => save({ frames: [] }, "Removing photos…", "Photos removed.")}
          onRemoveModel={() => save({ glb: null }, "Removing 3D model…", "3D model removed.")} />
      </div>
      <div className="modal-foot">
        {busy && <span className="muted" style={{ marginRight: "auto", fontSize: 12 }}>{busy}</span>}
        <button type="button" className="btn" onClick={onClose}>Close</button>
        <button type="button" className="btn primary" onClick={() => onSave({ ...form, glbUrl: form.glbUrl.trim(), framesUrl: form.framesUrl.trim(), imaginModel: form.imaginModel.trim() })}>Save settings</button>
      </div>
    </>
  );
}
