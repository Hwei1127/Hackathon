/* ─────────────────────────────────────────────────────────────
   AutoCore DMS API — Express + MongoDB
   Each record type is its own collection (vehicles, customers, sales, jobs, parts, warranties).
   A record's `id` is its MongoDB _id; `_sort` keeps the order the app shows them in.
   An empty database is seeded once with the sample records from src/data/seed.js.

   Env: MONGODB_URI (default mongodb://127.0.0.1:27017), MONGODB_DB (default autocore), PORT (default 4000)
   ───────────────────────────────────────────────────────────── */
import express from "express";
import { MongoClient } from "mongodb";
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
  app.listen(PORT, () => console.log(`AutoCore API on http://localhost:${PORT} · MongoDB ${URI}/${DB_NAME}`));
} catch (e) {
  console.error(`Couldn't connect to MongoDB at ${URI}: ${e.message}`);
  process.exit(1);
}
