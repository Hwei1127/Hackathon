/* ─────────────────────────────────────────────────────────────
   Vehicle media (3D model + 360° photos), stored in the database (server/index.js → MongoDB GridFS)
   so every user and device loads the same files for a vehicle.
   When the database can't be reached, uploads are kept in this browser (IndexedDB, lib/vehicleMedia.js)
   and sent up by syncLocalMedia() the next time it is.
   ───────────────────────────────────────────────────────────── */
import { getLocalMedia, setLocalMedia, localMediaIds, clearAllLocalMedia, mediaEvents } from "./vehicleMedia.js";

const BASE = (import.meta.env.VITE_API_URL || "/api").replace(/\/+$/, "");
const fileUrl = (url) => BASE + url.replace(/^\/api/, ""); // the server answers with /api/... paths
const changed = (id) => mediaEvents.dispatchEvent(new CustomEvent("change", { detail: id }));

async function call(path, opts = {}) {
  const res = await fetch(BASE + path, { ...opts, signal: AbortSignal.timeout(opts.timeout || 8000) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Media server error ${res.status}.`);
  return data;
}
const upload = (path, file, timeout = 120000) =>
  call(path, { method: "PUT", body: file, timeout, headers: { "Content-Type": file.type || "application/octet-stream", "X-File-Name": encodeURIComponent(file.name || "") } });

/**
 * A vehicle's files: { frames: [{ url } | Blob], glb: { url, name, size } | Blob | null, where: "database" | "browser", offline }.
 * Database files come as URLs; files still waiting in this browser come as Blobs. offline: the database couldn't be asked.
 */
export async function getMedia(id) {
  const local = await getLocalMedia(id);
  const waiting = local.frames?.length || local.glb;
  try {
    const m = await call(`/media/${encodeURIComponent(id)}`, { timeout: 10000 });
    const remote = { frames: m.frames.map((f) => ({ ...f, url: fileUrl(f.url) })), glb: m.glb && { ...m.glb, url: fileUrl(m.glb.url) } };
    // files not uploaded yet win over what the database has, until they're synced
    return { frames: local.frames?.length ? local.frames : remote.frames, glb: local.glb || remote.glb, where: waiting ? "browser" : "database", offline: false };
  } catch {
    return { frames: local.frames || [], glb: local.glb || null, where: "browser", offline: true };
  }
}

/** Ask every open viewer to load its vehicle's files again (e.g. once the database is reachable). */
export const reloadMedia = () => changed("*");

async function sendToDatabase(id, patch) {
  const v = encodeURIComponent(id);
  if ("glb" in patch) await (patch.glb ? upload(`/media/${v}/glb`, patch.glb) : call(`/media/${v}/glb`, { method: "DELETE" }));
  if ("frames" in patch) {
    await call(`/media/${v}/frames`, { method: "DELETE" });
    for (let i = 0; i < patch.frames.length; i++) await upload(`/media/${v}/frames/${i}`, patch.frames[i], 30000);
  }
}

/**
 * Save a vehicle's files: patch is { frames?: File[], glb?: File | null } (an empty value removes it).
 * → "database", or "browser" when the database couldn't be reached (kept here and uploaded later).
 */
export async function setMedia(id, patch) {
  try {
    await sendToDatabase(id, patch);
    // anything of the same kind still waiting in this browser is now out of date
    const local = await getLocalMedia(id);
    if (local.frames?.length || local.glb) await setLocalMedia(id, { ...("frames" in patch && { frames: [] }), ...("glb" in patch && { glb: null }) });
    changed(id);
    return "database";
  } catch {
    await setLocalMedia(id, patch);
    return "browser";
  }
}

/** A vehicle's stock ID changed: move its files to the new ID. */
export async function moveMedia(from, to) {
  const local = await getLocalMedia(from);
  if (local.frames?.length || local.glb) {
    await setLocalMedia(to, { frames: local.frames || [], glb: local.glb || null });
    await setLocalMedia(from, { frames: [], glb: null });
  }
  try { await call(`/media/${encodeURIComponent(from)}/move`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to }) }); } catch {}
  changed(from); changed(to);
}

/** Upload files kept in this browser while the database was unreachable. → how many vehicles were sent up */
let syncing = null;
export function syncLocalMedia() {
  syncing ||= (async () => {
    let sent = 0;
    for (const id of await localMediaIds()) {
      const m = await getLocalMedia(id);
      const patch = { ...(m.frames?.length && { frames: m.frames }), ...(m.glb && { glb: m.glb }) };
      if (!Object.keys(patch).length) continue;
      try { await sendToDatabase(id, patch); await setLocalMedia(id, { frames: [], glb: null }); sent++; } catch { break; }
    }
    return sent;
  })().finally(() => { syncing = null; });
  return syncing;
}

/** Remove every uploaded file, in the database and in this browser. */
export async function clearAllMedia() {
  await clearAllLocalMedia();
  await call("/media", { method: "DELETE" }).catch(() => {});
  changed("*");
}
