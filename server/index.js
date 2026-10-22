/* ─────────────────────────────────────────────────────────────
   AutoCore DMS API — Express + MongoDB
   Each record type is its own collection (vehicles, customers, sales, jobs, parts, warranties).
   Vehicles' uploaded 3D models and 360° photos are files in GridFS (media.files / media.chunks).
   A record's `id` is its MongoDB _id; `_sort` keeps the order the app shows them in.
   An empty database is seeded once with the sample records from src/data/seed.js.

   Env: MONGODB_URI (default mongodb://127.0.0.1:27017), MONGODB_DB (default autocore), PORT (default 4000)
   ───────────────────────────────────────────────────────────── */
import express from "express";
import { MongoClient, GridFSBucket, ObjectId } from "mongodb";
import { INITIAL } from "../src/data/seed.js";

const URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";
const DB_NAME = process.env.MONGODB_DB || "autocore";
const PORT = Number(process.env.PORT) || 4000;
const COLLECTIONS = Object.keys(INITIAL);

const client = new MongoClient(URI, { serverSelectionTimeoutMS: 5000 });
const db = client.db(DB_NAME);

const toDoc = (r, sort) => ({ ...r, _id: String(r.id), id: String(r.id), ...(sort != null && { _sort: sort }) });
const toRecord = ({ _id, _sort, ...r }) => r;

async function seed() {
  if (await db.collection("meta").findOne({ _id: "seed" })) return;
  for (const name of COLLECTIONS) {
    const col = db.collection(name);
    if (!(await col.estimatedDocumentCount()) && INITIAL[name].length) await col.insertMany(INITIAL[name].map((r, i) => toDoc(r, i)));
  }
  await db.collection("meta").insertOne({ _id: "seed", at: new Date() });
  console.log(`Seeded "${DB_NAME}" with the sample records.`);
}

const app = express();
app.use(express.json({ limit: "2mb" }));
const collection = (req, res) => {
  if (COLLECTIONS.includes(req.params.col)) return db.collection(req.params.col);
  res.status(404).json({ error: `Unknown collection "${req.params.col}".` });
};

app.get("/api/health", async (req, res) => {
  try { await db.command({ ping: 1 }); res.json({ ok: true, db: DB_NAME }); }
  catch (e) { res.status(503).json({ ok: false, error: e.message }); }
});

/* ─── Vehicle media: each vehicle's 3D model (.glb) and 360° photos, kept in GridFS (bucket "media").
   A file's metadata says whose it is: { vehicleId, kind: "glb" | "frame", index, name, contentType }.
   Registered before the generic /api/:col routes so "media" isn't taken for a collection name. ─── */
const media = new GridFSBucket(db, { bucketName: "media" });
const MEDIA_LIMIT = "100mb";
const raw = express.raw({ type: () => true, limit: MEDIA_LIMIT });
const fileInfo = (f) => ({ id: String(f._id), name: f.metadata.name || f.filename, size: f.length, url: `/api/media/file/${f._id}`, uploadedAt: f.uploadDate });
const mediaFiles = (vehicleId, kind) => media.find({ "metadata.vehicleId": vehicleId, ...(kind && { "metadata.kind": kind }) }).toArray();
const removeAll = async (files) => { for (const f of files) await media.delete(f._id).catch(() => {}); };
function store(buffer, metadata) {
  return new Promise((resolve, reject) => {
    const up = media.openUploadStream(metadata.name || metadata.kind, { metadata });
    up.once("finish", () => resolve(up.id)).once("error", reject).end(buffer);
  });
}
const nameOf = (req, fallback) => { try { return decodeURIComponent(req.get("x-file-name") || "") || fallback; } catch { return fallback; } };

/** streams one stored file (cached for good: a replaced file gets a new id) */
app.get("/api/media/file/:fileId", async (req, res, next) => {
  try {
    const [f] = ObjectId.isValid(req.params.fileId) ? await media.find({ _id: new ObjectId(req.params.fileId) }).toArray() : [];
    if (!f) return res.status(404).json({ error: "File not found." });
    res.set({ "Content-Type": f.metadata?.contentType || "application/octet-stream", "Content-Length": f.length, "Cache-Control": "public, max-age=31536000, immutable" });
    media.openDownloadStream(f._id).on("error", next).pipe(res);
  } catch (e) { next(e); }
});
/** what is stored for a vehicle: { glb: {id,name,size,url} | null, frames: [{id,name,size,url}] } in play order */
app.get("/api/media/:vehicleId", async (req, res, next) => {
  try {
    const files = await mediaFiles(req.params.vehicleId);
    const glb = files.filter((f) => f.metadata.kind === "glb").sort((a, b) => b.uploadDate - a.uploadDate)[0];
    const frames = files.filter((f) => f.metadata.kind === "frame").sort((a, b) => a.metadata.index - b.metadata.index);
    res.json({ glb: glb ? fileInfo(glb) : null, frames: frames.map(fileInfo) });
  } catch (e) { next(e); }
});
/** upload / replace the 3D model (raw body, file name in the X-File-Name header) */
app.put("/api/media/:vehicleId/glb", raw, async (req, res, next) => {
  if (!req.body?.length) return res.status(400).json({ error: "The file is empty." });
  try {
    const old = await mediaFiles(req.params.vehicleId, "glb");
    const id = await store(req.body, { vehicleId: req.params.vehicleId, kind: "glb", name: nameOf(req, "model.glb"), contentType: "model/gltf-binary" });
    await removeAll(old);
    res.json({ ok: true, id: String(id) });
  } catch (e) { next(e); }
});
app.delete("/api/media/:vehicleId/glb", async (req, res, next) => {
  try { await removeAll(await mediaFiles(req.params.vehicleId, "glb")); res.json({ ok: true }); } catch (e) { next(e); }
});
/** upload / replace one 360° photo at a position in the spin */
app.put("/api/media/:vehicleId/frames/:index", raw, async (req, res, next) => {
  const index = Number(req.params.index);
  if (!Number.isInteger(index) || index < 0 || index > 199) return res.status(400).json({ error: "Invalid photo position." });
  if (!req.body?.length) return res.status(400).json({ error: "The file is empty." });
  try {
    const old = (await mediaFiles(req.params.vehicleId, "frame")).filter((f) => f.metadata.index === index);
    const id = await store(req.body, { vehicleId: req.params.vehicleId, kind: "frame", index, name: nameOf(req, `${index + 1}.jpg`), contentType: req.get("content-type") || "image/jpeg" });
    await removeAll(old);
    res.json({ ok: true, id: String(id) });
  } catch (e) { next(e); }
});
app.delete("/api/media/:vehicleId/frames", async (req, res, next) => {
  try { await removeAll(await mediaFiles(req.params.vehicleId, "frame")); res.json({ ok: true }); } catch (e) { next(e); }
});
/** a vehicle's stock ID changed: its files follow it (whatever the new ID already had is replaced) */
app.post("/api/media/:vehicleId/move", async (req, res, next) => {
  const to = String(req.body?.to || "").trim();
  if (!to) return res.status(400).json({ error: "Expected { to: newVehicleId }." });
  try {
    const moving = await mediaFiles(req.params.vehicleId);
    if (moving.length) {
      const kinds = new Set(moving.map((f) => f.metadata.kind));
      await removeAll((await mediaFiles(to)).filter((f) => kinds.has(f.metadata.kind)));
      await db.collection("media.files").updateMany({ "metadata.vehicleId": req.params.vehicleId }, { $set: { "metadata.vehicleId": to } });
    }
    res.json({ ok: true, moved: moving.length });
  } catch (e) { next(e); }
});
/** remove every uploaded file (Administration → Clear uploaded media) */
app.delete("/api/media", async (req, res, next) => {
  try { await media.drop().catch(() => {}); res.json({ ok: true }); } catch (e) { next(e); }
});

/** every collection at once: { vehicles: [...], customers: [...], ... } */
app.get("/api/db", async (req, res, next) => {
  try {
    const lists = await Promise.all(COLLECTIONS.map((name) => db.collection(name).find().sort({ _sort: 1, _id: 1 }).toArray()));
    res.json(Object.fromEntries(COLLECTIONS.map((name, i) => [name, lists[i].map(toRecord)])));
  } catch (e) { next(e); }
});

app.get("/api/:col", async (req, res, next) => {
  const col = collection(req, res);
  if (!col) return;
  try { res.json((await col.find().sort({ _sort: 1, _id: 1 }).toArray()).map(toRecord)); } catch (e) { next(e); }
});

app.get("/api/:col/:id", async (req, res, next) => {
  const col = collection(req, res);
  if (!col) return;
  try {
    const doc = await col.findOne({ _id: req.params.id });
    doc ? res.json(toRecord(doc)) : res.status(404).json({ error: "Record not found." });
  } catch (e) { next(e); }
});

/**
 * Apply the app's changes to one collection in a single round trip:
 *   { upsert: [records], delete: [ids], order: [ids] } — order is the full display order, required with upserts.
 */
app.patch("/api/:col", async (req, res, next) => {
  const col = collection(req, res);
  if (!col) return;
  const { upsert = [], delete: del = [], order } = req.body || {};
  if (!Array.isArray(upsert) || !Array.isArray(del) || (order && !Array.isArray(order)) || (upsert.length && !order))
    return res.status(400).json({ error: "Expected { upsert: [], delete: [], order: [] }." });
  if (upsert.some((r) => !r || typeof r !== "object" || r.id == null || r.id === "")) return res.status(400).json({ error: "Every record needs an id." });
  const pos = new Map((order || []).map((id, i) => [String(id), i]));
  const ops = [
    ...del.map((id) => ({ deleteOne: { filter: { _id: String(id) } } })),
    ...upsert.map((r) => ({ replaceOne: { filter: { _id: String(r.id) }, replacement: toDoc(r, pos.get(String(r.id)) ?? -1), upsert: true } })),
    // unchanged records may have moved (a record was added or removed above them)
    ...[...pos].filter(([id]) => !upsert.some((r) => String(r.id) === id)).map(([id, i]) => ({ updateOne: { filter: { _id: id }, update: { $set: { _sort: i } } } })),
  ];
  try {
    if (ops.length) await col.bulkWrite(ops, { ordered: true });
    res.json({ ok: true, upserted: upsert.length, deleted: del.length });
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ error: "A record with that unique value (VIN or part number) already exists." });
    next(e);
  }
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || "Server error." });
});

try {
  await client.connect();
  await seed();
  // the app already checks these; the indexes keep the data consistent for any other client too
  await db.collection("vehicles").createIndex({ vin: 1 }, { unique: true, partialFilterExpression: { vin: { $type: "string" } } });
  await db.collection("parts").createIndex({ sku: 1 }, { unique: true, partialFilterExpression: { sku: { $type: "string" } } });
  await db.collection("media.files").createIndex({ "metadata.vehicleId": 1, "metadata.kind": 1 });
  app.listen(PORT, () => console.log(`AutoCore API on http://localhost:${PORT} · MongoDB ${URI}/${DB_NAME}`));
} catch (e) {
  console.error(`Couldn't connect to MongoDB at ${URI}: ${e.message}`);
  process.exit(1);
}
