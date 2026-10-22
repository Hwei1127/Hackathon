/* ─────────────────────────────────────────────────────────────
   Client for the AutoCore API (server/index.js → MongoDB).
   The app keeps working from its browser copy when the API can't be reached.
   ───────────────────────────────────────────────────────────── */
const BASE = (import.meta.env.VITE_API_URL || "/api").replace(/\/+$/, "");

async function call(path, opts = {}) {
  let res;
  try {
    res = await fetch(BASE + path, { ...opts, headers: { "Content-Type": "application/json", ...opts.headers }, signal: AbortSignal.timeout(opts.timeout || 8000) });
  } catch { throw new Error("Can't reach the database server."); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Database server error ${res.status}.`);
  return data;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Per-collection changes from `prev` to `next`: { vehicles: { upsert, delete, order }, ... } (unchanged collections left out). */
export function diffDb(prev, next) {
  const out = {};
  for (const name of Object.keys(next)) {
    const a = prev?.[name] || [], b = next[name] || [];
    if (a === b) continue;
    const before = new Map(a.map((r) => [r.id, r])), ids = new Set(b.map((r) => r.id));
    const upsert = b.filter((r) => !same(before.get(r.id), r));
    const del = a.filter((r) => !ids.has(r.id)).map((r) => r.id);
    const moved = !same(a.map((r) => r.id), b.map((r) => r.id));
    if (upsert.length || del.length || moved) out[name] = { upsert, delete: del, order: b.map((r) => r.id) };
  }
  return out;
}

export const api = {
  health: () => call("/health", { timeout: 3000 }),
  load: () => call("/db"),
  /** send one collection's changes */
  apply: (name, change) => call(`/${encodeURIComponent(name)}`, { method: "PATCH", body: JSON.stringify(change) }),
};
