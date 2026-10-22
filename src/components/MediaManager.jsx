import React, { useState } from "react";
import Icon from "./Icon.jsx";
import Vehicle360, { useLocalMedia } from "./Vehicle360.jsx";
import { BODY_TYPES, bodyTypeOf, expandFrames, fmtBytes, guessModelFamily, setLocalMedia, sortFiles } from "../lib/vehicleMedia.js";

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

export default function MediaManager({ vehicle: v, settings, onSave, onClose, toast, goSettings }) {
  const local = useLocalMedia(v.id);
  const [busy, setBusy] = useState("");
  const [form, setForm] = useState({ glbUrl: v.glbUrl || "", framesUrl: v.framesUrl || "", imaginModel: v.imaginModel || "", body: v.body || "Auto" });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const preview = { ...v, ...form };
  const guess = guessModelFamily(v.brand, v.model);
  const hostedCount = expandFrames(form.framesUrl).length;

  const addPhotos = async (files) => {
    const imgs = sortFiles(files.filter((f) => f.type.startsWith("image/")));
    if (!imgs.length) return toast("Choose image files (JPG, PNG or WebP).");
    if (imgs.length > 72) return toast("Use 72 photos or fewer.");
    setBusy(`Optimising ${imgs.length} photos…`);
    try {
      const frames = [];
      for (const f of imgs) frames.push(await shrink(f));
      await setLocalMedia(v.id, { frames });
      toast(`${frames.length} photos saved for ${v.id}.${frames.length < 8 ? " Use 12 or more for a smooth spin." : ""}`);
    } catch { toast("Couldn't save the photos in this browser (storage may be full)."); }
    setBusy("");
  };
  const addModel = async (files) => {
    const f = files.find((x) => /\.glb$/i.test(x.name));
    if (!f) return toast("Choose a .glb 3D file (binary glTF).");
    setBusy("Saving 3D model…");
    try { await setLocalMedia(v.id, { glb: f }); toast(`3D model saved for ${v.id}.`); }
    catch { toast("Couldn't save the 3D file in this browser (storage may be full)."); }
    setBusy("");
  };

  return (
    <>
      <div className="modal-body">
        <div className="v-detail"><Vehicle360 key={JSON.stringify(form) + local.frames.length + (local.glb || "")} vehicle={preview} settings={settings} variant="detail" /></div>
        <p className="page-note" style={{ margin: "10px 0 16px" }}>
          The viewer uses the best source available: <b>3D model</b> → <b>360° photos</b> → <b>studio renders</b> → <b>illustration</b>.
        </p>

        <div className="media-sec">
          <div className="media-h"><Icon n="image" s={15} /><b>360° photos</b>
            {local.frames.length > 0 && <span className="pill g">{local.frames.length} photos · {fmtBytes(local.framesSize)}</span>}</div>
          <DropZone accept="image/*" multiple onFiles={addPhotos} icon="upload" title="Upload or drop photos"
            hint="12–36 shots taken at even steps around the car. They play in file-name order (01.jpg, 02.jpg…)." />
          {local.frames.length > 0 && <button className="mini-btn danger" onClick={() => setLocalMedia(v.id, { frames: [] }).then(() => toast("Photos removed."))}><Icon n="trash" s={12} />Remove photos</button>}
        </div>

        <div className="media-sec">
          <div className="media-h"><Icon n="cube" s={15} /><b>3D model</b>
            {local.glb && <span className="pill g">{local.glbName || "model.glb"} · {fmtBytes(local.glbSize)}</span>}</div>
          <DropZone accept=".glb,model/gltf-binary" onFiles={addModel} icon="upload" title="Upload or drop a .glb file"
            hint="Full 3D orbit with zoom, and AR on supported phones. Use a model you're licensed to use." />
          {local.glb && <button className="mini-btn danger" onClick={() => setLocalMedia(v.id, { glb: null }).then(() => toast("3D model removed."))}><Icon n="trash" s={12} />Remove 3D model</button>}
        </div>
        <p className="page-note" style={{ marginTop: -4 }}>Uploads are stored in this browser only. To share them with every user, host the files and link them below.</p>

        <div className="media-sec">
          <div className="media-h"><Icon n="link" s={15} /><b>Hosted files</b><span className="muted" style={{ fontSize: 10 }}>visible to everyone</span></div>
          <div className="form-grid">
            <div className="field full"><label>3D model URL (.glb)</label><input value={form.glbUrl} onChange={set("glbUrl")} placeholder={`/media/${v.id}/model.glb`} /></div>
            <div className="field full"><label>360° photo URLs {hostedCount > 0 && <span className="muted">· {hostedCount} frames</span>}</label>
              <textarea value={form.framesUrl} onChange={set("framesUrl")} placeholder={`/media/${v.id}/{01..36}.jpg\n(or one URL per line)`} /></div>
          </div>
        </div>

        <div className="media-sec">
          <div className="media-h"><Icon n="key" s={15} /><b>Studio renders &amp; illustration</b>
            <span className={`pill ${settings.imaginKey ? "g" : "n"}`}>{settings.imaginKey ? "IMAGIN connected" : "No render key"}</span></div>
          <div className="form-grid">
            <div className="field"><label>Model family for renders</label><input value={form.imaginModel} onChange={set("imaginModel")} placeholder={`auto: ${guess || "—"}`} /></div>
            <div className="field"><label>Body type</label><select value={form.body} onChange={set("body")}>{BODY_TYPES.map((b) => <option key={b} value={b}>{b === "Auto" ? `Auto (${bodyTypeOf({ model: v.model })})` : b}</option>)}</select></div>
          </div>
          {!settings.imaginKey && <p className="page-note" style={{ margin: "10px 0 0" }}>Add your IMAGIN.studio customer key under <button className="link-btn" onClick={goSettings}>Administration → Vehicle imagery</button> to show photo-realistic renders of every model automatically.</p>}
        </div>
      </div>
      <div className="modal-foot">
        {busy && <span className="muted" style={{ marginRight: "auto", fontSize: 12 }}>{busy}</span>}
        <button type="button" className="btn" onClick={onClose}>Close</button>
        <button type="button" className="btn primary" onClick={() => onSave({ ...form, glbUrl: form.glbUrl.trim(), framesUrl: form.framesUrl.trim(), imaginModel: form.imaginModel.trim() })}>Save settings</button>
      </div>
    </>
  );
}
