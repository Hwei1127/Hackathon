import React, { useState, useEffect, useRef } from "react";
import Icon, { Logo } from "./components/Icon.jsx";
import Vehicle360 from "./components/Vehicle360.jsx";
import MediaManager, { VehicleMediaForm } from "./components/MediaManager.jsx";
import AiIdentify from "./components/AiIdentify.jsx";
import DamageInspector from "./components/DamageInspector.jsx";
import { damageSummary, damagedParts } from "./lib/damage.js";
import { INITIAL } from "./data/seed.js";
import { api, diffDb } from "./lib/api.js";
import { BODY_TYPES, loadSettings, saveSettings, clearAllLocalMedia, getLocalMedia, setLocalMedia } from "./lib/vehicleMedia.js";

/* ───────────────────────── Data ───────────────────────── */
const KEY = "autocore-db-v1";
const BRANCHES = ["Kuala Lumpur", "Petaling Jaya", "Shah Alam"];
const clone = (o) => JSON.parse(JSON.stringify(o));


const STAGES = ["Enquiry", "Qualification", "Quotation", "Awaiting Approval", "Awaiting Payment", "Delivery Prep", "Completed"];

const NAV_MAIN = [
  ["dashboard", "dashboard", "Dashboard"], ["inventory", "car", "Vehicle Inventory"], ["sales", "sales", "Vehicle Sales"],
  ["customers", "users", "Customers"], ["service", "wrench", "Workshop", 4], ["parts", "box", "Spare Parts"],
  ["warranty", "shield", "Warranty & Claims"], ["finance", "wallet", "Finance"],
];
const NAV_INSIGHTS = [["reports", "reports", "Reports & Analytics"], ["settings", "settings", "Administration"]];
const TITLES = {
  dashboard: "Dashboard", inventory: "Vehicle Inventory", sales: "Vehicle Sales", customers: "Customer Management",
  service: "Service & Workshop", parts: "Spare Parts", warranty: "Warranty & Claims", finance: "Finance Overview",
  reports: "Reports & Analytics", settings: "Administration",
};

/* Module config: [key, label, type, optionsOrRequired] */
const CONFIG = {
  inventory: { key: "vehicles", title: "Vehicle Inventory", desc: "Manage vehicle stock, reservations, transfers, and availability.", cols: ["Vehicle ID", "Vehicle", "Registration", "Condition", "Branch", "Status", "Selling Price"], add: "Add vehicle",
    fields: [["id", "Stock ID", "text", true], ["vin", "VIN / Chassis Number", "text", true], ["reg", "Registration Number", "text"], ["brand", "Brand", "text", true], ["model", "Model / Variant", "text", true], ["year", "Model Year", "number", true], ["condition", "Condition", "select", ["New", "Used"]], ["mileage", "Mileage (km)", "number"], ["cost", "Purchase Cost (RM)", "number", true], ["price", "Selling Price (RM)", "number", true], ["branch", "Branch", "select", BRANCHES], ["status", "Status", "select", ["In Transit", "Available", "Reserved", "Allocated", "Sold", "Delivered", "Under Inspection"]], ["color", "Exterior Color", "text"], ["location", "Physical Location", "text"], ["body", "Body Type (for illustration)", "select", BODY_TYPES]] },
  customers: { key: "customers", title: "Customer Management", desc: "A unified view of individual, corporate, and fleet customer relationships.", cols: ["Customer", "Contact", "Type", "Preferred Brand", "Assigned Consultant", "Lifetime Value", "Status"], add: "Add customer",
    fields: [["id", "Customer ID", "text", true], ["name", "Full name / Company", "text", true], ["type", "Customer Type", "select", ["Individual", "Corporate", "Fleet"]], ["email", "Email", "email", true], ["phone", "Phone", "text", true], ["preferred", "Preferred Brand", "text"], ["owner", "Assigned Consultant", "text"], ["branch", "Branch", "select", BRANCHES], ["spent", "Lifetime Value (RM)", "number"], ["status", "Status", "select", ["Active", "Prospect", "Inactive"]]] },
  sales: { key: "sales", title: "Vehicle Sales", desc: "Track opportunities, quotations, orders, payments, and vehicle handovers.", cols: ["Order", "Customer", "Vehicle", "Amount", "Status", "Payment", "Consultant"], add: "Create sales order",
    fields: [["id", "Sales Order ID", "text", true], ["customer", "Customer", "text", true], ["vehicle", "Vehicle", "text", true], ["amount", "Final Amount (RM)", "number", true], ["status", "Sales Stage", "select", ["Enquiry", "Qualification", "Quotation", "Awaiting Approval", "Awaiting Payment", "Delivery Prep", "Completed", "Cancelled"]], ["payment", "Payment Status", "select", ["Not Due", "Pending", "Deposit Paid", "Paid", "Overdue"]], ["consultant", "Sales Consultant", "text", true], ["date", "Order Date", "date", true]] },
  service: { key: "jobs", title: "Service & Workshop", desc: "Coordinate repair orders, technician workload, and vehicle collection.", cols: ["Repair Order", "Customer", "Vehicle", "Service", "Technician", "Status", "Due Date"], add: "Create repair order",
    fields: [["id", "Repair Order ID", "text", true], ["customer", "Customer", "text", true], ["vehicle", "Vehicle", "text", true], ["service", "Service / Repair Description", "text", true], ["technician", "Assigned Technician", "text", true], ["status", "Workshop Status", "select", ["Appointment Scheduled", "Vehicle Checked In", "Inspection", "Awaiting Customer Approval", "Waiting for Parts", "In Progress", "Quality Check", "Ready for Collection", "Completed"]], ["due", "Estimated Completion", "date", true], ["branch", "Branch", "select", BRANCHES]] },
  parts: { key: "parts", title: "Spare Parts", desc: "Manage parts availability, replenishment, stock valuation, and suppliers.", cols: ["Part", "Brand", "Quantity", "Unit Cost", "Selling Price", "Location", "Stock Value"], add: "Add part",
    fields: [["sku", "Part Number / SKU", "text", true], ["name", "Part Name", "text", true], ["brand", "Compatible Brand", "text", true], ["supplier", "Supplier", "text"], ["cost", "Unit Cost (RM)", "number", true], ["price", "Selling Price (RM)", "number", true], ["qty", "Current Quantity", "number", true], ["min", "Minimum Stock Threshold", "number", true], ["location", "Storage Location", "text"], ["branch", "Branch", "select", BRANCHES]] },
  warranty: { key: "warranties", title: "Warranty & Claims", desc: "Monitor coverage, expiry dates, and warranty claim status.", cols: ["Claim / Warranty", "Customer", "Vehicle", "Start Date", "Expiry Date", "Status"], add: "Register warranty",
    fields: [["id", "Warranty ID", "text", true], ["customer", "Customer", "text", true], ["vehicle", "Vehicle", "text", true], ["start", "Warranty Start", "date", true], ["expiry", "Warranty Expiry", "date", true], ["coverage", "Coverage Details", "text", true], ["status", "Status", "select", ["Active", "Expiring Soon", "Claim Submitted", "Approved", "Rejected", "Expired"]]] },
};
const pageForKey = (k) => Object.keys(CONFIG).find((p) => CONFIG[p].key === k);
// repair orders name their vehicle as "Brand Model" (or a stock ID); damage is kept on that vehicle when it's in stock
const vehicleForJob = (db, job) => db.vehicles.find((x) => `${x.brand} ${x.model}` === job.vehicle || x.id === job.vehicle);
const damageOwner = (db, key, id) => {
  const rec = db[key]?.find((x) => x.id === id);
  if (!rec) return null;
  const veh = key === "jobs" ? vehicleForJob(db, rec) : rec;
  return veh ? { key: "vehicles", rec: veh, shape: veh } : { key, rec, shape: { id: rec.id, brand: "", model: rec.vehicle || "", color: "" } };
};

/* ───────────────────────── Helpers ───────────────────────── */
const money = (n) => "RM " + Number(n || 0).toLocaleString("en-MY", { maximumFractionDigits: 0 });
const loadDb = () => { try { return JSON.parse(localStorage.getItem(KEY)) || clone(INITIAL); } catch { return clone(INITIAL); } };
// the browser keeps a copy of the records; MongoDB (through the API) is the shared source of truth
const SYNCED = "autocore-db-synced", PENDING = "autocore-db-pending"; // copy has reached MongoDB once / has edits MongoDB hasn't seen
const flag = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} };
const hadCopy = (() => { try { return !!localStorage.getItem(KEY); } catch { return false; } })();
const matches = (r, q) => Object.values(r).join(" ").toLowerCase().includes(q.toLowerCase());
const initials = (name) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
const AV_COLORS = ["#f6b26b", "#8fd6ae", "#a59cff", "#7cb7ff", "#f2939b"];

function statusClass(s) {
  let cls = "s-gray";
  if (/Available|Active|Completed|Paid|Approved|Ready for Collection/.test(s)) cls = "s-green";
  if (/Reserved|Allocated|Awaiting|Inspection|Transit|Quotation|Deposit|Quality|Expiring|Pending/.test(s)) cls = "s-amber";
  if (/Overdue|Rejected|Waiting for Parts|Cancelled|Low Stock/.test(s)) cls = "s-red";
  if (/Delivery Prep|In Progress|Checked In/.test(s)) cls = "s-blue";
  return cls;
}
const Badge = ({ s }) => <span className={`status ${statusClass(s)}`}>{s}</span>;

const defaultFor = (key, type) => {
  if (key === "year") return 2026;
  if (["qty", "min", "mileage", "cost", "price", "spent", "amount"].includes(key)) return 0;
  if (key === "branch") return "Kuala Lumpur";
  if (key === "status") return { inventory: "Available", customers: "Active", sales: "Enquiry", service: "Appointment Scheduled" }[type] || "Active";
  if (key === "condition") return "New";
  if (key === "type") return "Individual";
  if (key === "payment") return "Not Due";
  if (key === "body") return "Auto";
  return "";
};

/* Table cell renderers, per collection */
const Primary = ({ a, b }) => (<><span className="primary-cell">{a}</span><span className="sub-cell">{b}</span></>);
const VehCell = ({ v }) => <span className="veh-cell"><span className="veh-ic"><Icon n="car" s={15} /></span>{v}</span>;
const CELLS = {
  vehicles: {
    "Vehicle ID": (r) => <Primary a={r.id} b={r.vin} />, Vehicle: (r) => <span className="veh-cell"><span className="veh-ic"><Icon n="car" s={15} /></span><span><span className="primary-cell">{r.brand} {r.model}</span><span className="sub-cell">{r.year} · {r.color}</span></span></span>,
    Registration: (r) => r.reg, Brand: (r) => r.brand, Condition: (r) => r.condition, Branch: (r) => r.branch,
    Status: (r) => <Badge s={r.status} />, "Selling Price": (r) => <b>{money(r.price)}</b>, Mileage: (r) => Number(r.mileage).toLocaleString() + " km",
  },
  customers: {
    Customer: (r) => <Primary a={r.name} b={r.id} />, Contact: (r) => <>{r.email}<span className="sub-cell">{r.phone}</span></>,
    Type: (r) => r.type, "Preferred Brand": (r) => r.preferred, "Assigned Consultant": (r) => r.owner,
    "Lifetime Value": (r) => money(r.spent), Status: (r) => <Badge s={r.status} />, Branch: (r) => r.branch,
  },
  sales: {
    Order: (r) => <Primary a={r.id} b={r.date} />, Customer: (r) => r.customer, Vehicle: (r) => <VehCell v={r.vehicle} />,
    Amount: (r) => <b>{money(r.amount)}</b>, Status: (r) => <Badge s={r.status} />, Payment: (r) => <Badge s={r.payment} />, Consultant: (r) => r.consultant,
  },
  jobs: {
    "Repair Order": (r) => <Primary a={r.id} b={r.due} />, Customer: (r) => r.customer, Vehicle: (r) => <VehCell v={r.vehicle} />, Service: (r) => r.service,
    Technician: (r) => r.technician, Status: (r) => <Badge s={r.status} />, "Due Date": (r) => r.due, Branch: (r) => r.branch,
  },
  parts: {
    Part: (r) => <Primary a={r.name} b={r.sku} />, Brand: (r) => r.brand,
    Quantity: (r) => <><b>{r.qty}</b> {r.qty < r.min && <Badge s="Low Stock" />}<span className="sub-cell">Min: {r.min}</span></>,
    "Unit Cost": (r) => money(r.cost), "Selling Price": (r) => money(r.price), Location: (r) => r.location, "Stock Value": (r) => money(r.qty * r.cost),
  },
  warranties: {
    "Claim / Warranty": (r) => <Primary a={r.id} b={r.coverage} />, Customer: (r) => r.customer, Vehicle: (r) => <VehCell v={r.vehicle} />,
    "Start Date": (r) => r.start, "Expiry Date": (r) => r.expiry, Status: (r) => <Badge s={r.status} />,
  },
};

/* ───────────────────────── Small components ───────────────────────── */
const PageHead = ({ page, title, desc, children }) => (
  <div className="page-head">
    <div><div className="eyebrow">AUTOCORE / {page.toUpperCase()}</div><h1>{title}</h1><p>{desc}</p></div>
    <div className="head-actions">{children}</div>
  </div>
);
const Kpi = ({ label, value, icon, foot }) => (
  <div className="card kpi">
    <div className="kpi-top">{label}<span className="kpi-icon"><Icon n={icon} s={16} /></span></div>
    <div className="kpi-value">{value}</div><div className="kpi-foot">{foot}</div>
  </div>
);
const Bars = ({ items }) => (
  <div className="brand-bars">
    {items.map((x) => (
      <div key={x.label}>
        <div className="bar-label"><span>{x.label}</span><span>{x.right}</span></div>
        <div className="bar-track"><div className="bar-fill" style={{ width: `${x.pct}%`, background: x.color }} /></div>
      </div>
    ))}
  </div>
);
const Delta = ({ v, down }) => <span className={`pill ${down ? "r" : "g"}`}>{down ? "↓" : "↑"} {v}</span>;

function DataTable({ rows, cols, type, onAction, compact }) {
  if (!rows.length) return <div className="empty"><Icon n="search" s={22} /><b>No records found</b>Try adjusting your search or filters.</div>;
  return (
    <div className="table-wrap">
      <table>
        <thead><tr>{cols.map((c) => <th key={c}>{c}</th>)}{!compact && <th>Action</th>}</tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} onClick={compact ? () => onAction("view", type, r.id) : undefined} style={compact ? { cursor: "pointer" } : undefined}>
              {cols.map((c) => <td key={c}>{CELLS[type]?.[c] ? CELLS[type][c](r) : r[c.toLowerCase()] ?? "—"}</td>)}
              {!compact && <td><div className="table-actions">
                <button className="mini-btn" onClick={() => onAction("view", type, r.id)}>View</button>
                <button className="mini-btn" onClick={() => onAction("edit", type, r.id)}>Edit</button>
                {type === "vehicles" && <button className="mini-btn" onClick={() => onAction("media", type, r.id)}><Icon n="spin" s={11} />360°</button>}
                {(type === "vehicles" || type === "jobs") && <button className="mini-btn" onClick={() => onAction("damage", type, r.id)}><Icon n="alert" s={11} />Damage</button>}
              </div></td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ───────────────────────── Record form / view modal ───────────────────────── */
function RecordForm({ cfg, type, record, onSave, onCancel, settings, toast }) {
  const [vals, setVals] = useState(() => Object.fromEntries(cfg.fields.map(([k]) => [k, record?.[k] ?? defaultFor(k, type)])));
  const [media, setMedia] = useState(() => ({ pending: {}, form: { glbUrl: record?.glbUrl || "", framesUrl: record?.framesUrl || "", imaginModel: record?.imaginModel || "" } }));
  const [damage, setDamage] = useState(() => record?.damage || null);
  const [damageOpen, setDamageOpen] = useState(() => damagedParts(record?.damage).length > 0);
  const set = (k, v) => setVals((p) => ({ ...p, [k]: v }));
  const submit = (e) => {
    e.preventDefault();
    const data = { ...vals };
    cfg.fields.forEach(([k, , kind]) => { if (kind === "number") data[k] = Number(data[k]); });
    if (type !== "inventory") return onSave(data);
    Object.entries(media.form).forEach(([k, v]) => { data[k] = v.trim(); });
    if (damage) data.damage = damage;
    onSave(data, media.pending);
  };
  return (
    <form onSubmit={submit}>
      <div className="modal-body">
        <div className="form-grid">
          {cfg.fields.map(([key, label, kind, extra]) => {
            const required = extra === true;
            return (
              <div className="field" key={key}>
                <label>{label}{required ? " *" : ""}</label>
                {kind === "select" ? (
                  <select value={vals[key]} onChange={(e) => set(key, e.target.value)}>{extra.map((o) => <option key={o}>{o}</option>)}</select>
                ) : (
                  <input type={kind} value={vals[key]} required={required} min={kind === "number" ? 0 : undefined} maxLength={key === "vin" ? 40 : undefined} onChange={(e) => set(key, e.target.value)} />
                )}
              </div>
            );
          })}
        </div>
        {type === "inventory" && <VehicleMediaForm vehicle={vals} storedId={record?.id} value={media} onChange={setMedia} settings={settings} toast={toast} />}
        {type === "inventory" && (
          <details className="vm-form" open={damageOpen} onToggle={(e) => setDamageOpen(e.currentTarget.open)}>
            <summary className="media-h"><Icon n="alert" s={15} /><b>Damage inspection</b><span className="muted" style={{ fontSize: 10 }}>{damageSummary(damage)}</span></summary>
            {damageOpen && <DamageInspector vehicle={{ ...record, ...vals }} value={damage} onChange={setDamage} settings={settings} toast={toast} />}
          </details>
        )}
        <p className="page-note" style={{ marginTop: 15 }}>Fields marked * are required. Changes are saved to the database.</p>
      </div>
      <div className="modal-foot">
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn primary">Save record</button>
      </div>
    </form>
  );
}

function DamageModal({ owner, settings, onClose, onSave, toast, goSettings }) {
  const [damage, setDamage] = useState(() => owner.rec.damage || null);
  const { shape } = owner;
  return (
    <div className="modal-backdrop open" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className="modal wide" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
        <div className="modal-head"><h2 id="modalTitle">Damage inspection · {`${shape.brand} ${shape.model}`.trim()} <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>{owner.rec.id}</span></h2><button className="close" onClick={onClose} aria-label="Close">×</button></div>
        <div className="modal-body"><DamageInspector vehicle={shape} value={damage} onChange={setDamage} settings={settings} toast={toast} goSettings={goSettings} /></div>
        <div className="modal-foot">
          <span className="muted" style={{ marginRight: "auto", fontSize: 12 }}>{damageSummary(damage)}</span>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn primary" onClick={() => onSave(owner.key, owner.rec.id, damage)}>Save damage</button>
        </div>
      </section>
    </div>
  );
}

function Modal({ modal, db, settings, onClose, onSave, onSaveMedia, onSaveDamage, openMedia, openDamage, toast, go }) {
  if (!modal) return null;
  const isView = modal.kind === "view";
  const cfg = CONFIG[modal.page];
  if (modal.kind === "damage") {
    const owner = damageOwner(db, modal.key, modal.id);
    return owner && <DamageModal owner={owner} settings={settings} onClose={onClose} onSave={onSaveDamage} toast={toast} goSettings={() => { onClose(); go("settings"); }} />;
  }
  const dmgKey = isView && { inventory: "vehicles", service: "jobs" }[modal.page];
  const dmgOwner = dmgKey && damageOwner(db, dmgKey, modal.record.id);
  if (modal.kind === "media") {
    const v = db.vehicles.find((x) => x.id === modal.id);
    if (!v) return null;
    return (
      <div className="modal-backdrop open" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        <section className="modal wide" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
          <div className="modal-head"><h2 id="modalTitle">360° media · {v.brand} {v.model} <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>{v.id}</span></h2><button className="close" onClick={onClose} aria-label="Close">×</button></div>
          <MediaManager vehicle={v} settings={settings} toast={toast} onClose={onClose} onSave={(patch) => onSaveMedia(v.id, patch)} goSettings={() => { onClose(); go("settings"); }} />
        </section>
      </div>
    );
  }
  const title = isView ? `Record details · ${modal.record.id}` : `${modal.record ? "Edit record" : "Add record"} · ${cfg.title}`;
  return (
    <div className="modal-backdrop open" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
        <div className="modal-head"><h2 id="modalTitle">{title}</h2><button className="close" onClick={onClose} aria-label="Close">×</button></div>
        {isView ? (
          <>
            <div className="modal-body">
              {modal.page === "inventory" && <div className="v-detail" style={{ marginBottom: 8 }}><Vehicle360 vehicle={db.vehicles.find((x) => x.id === modal.record.id) || modal.record} settings={settings} variant="detail" onManage={() => openMedia(modal.record.id)} /></div>}
              {dmgOwner && (
                <div className="detail-row"><span>Damage</span>
                  <div><span className={`pill ${damagedParts(dmgOwner.rec.damage).length ? "r" : "g"}`}>{damageSummary(dmgOwner.rec.damage)}</span>
                    {dmgOwner.rec !== modal.record && dmgOwner.key === "vehicles" && <span className="muted" style={{ fontSize: 11 }}> · on stock vehicle {dmgOwner.rec.id}</span>}</div></div>
              )}
              {Object.entries(modal.record).filter(([k, v]) => (k !== "ai" || v) && k !== "damage").map(([k, v]) => (
                <div className="detail-row" key={k}><span>{k === "ai" ? "AI identification" : k.replace(/([A-Z])/g, " $1")}</span>
                  <div>{k === "ai" ? `${v.make} ${v.model}${v.generation ? ` (${v.generation})` : ""} · ${v.source === "estimate" ? "estimate" : `${Math.round(v.confidence * 100)}% confidence (${v.aiModel || "local AI"})`}` : String(v ?? "")}</div></div>
              ))}
            </div>
            <div className="modal-foot">
              {modal.page === "inventory" && <button className="btn" onClick={() => openMedia(modal.record.id)}><Icon n="spin" s={14} />Manage 360° media</button>}
              {dmgKey && <button className="btn" onClick={() => openDamage(dmgKey, modal.record.id)}><Icon n="alert" s={14} />Damage inspection</button>}
              <button className="btn" style={{ marginLeft: "auto" }} onClick={onClose}>Close</button>
            </div>
          </>
        ) : (
          <RecordForm cfg={cfg} type={modal.page} record={modal.record} onSave={onSave} onCancel={onClose} settings={settings} toast={toast} />
        )}
      </section>
    </div>
  );
}

/* ───────────────────────── Dashboard ───────────────────────── */
const fmtDay = (d) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

function OvCell({ label, value, icon, delta, down, foot = "vs last month", onMore }) {
  return (
    <div className="ov-cell">
      <div className="ov-top">{label}<button aria-label={`Open ${label}`} onClick={onMore}><Icon n="more" s={15} w={2.4} /></button></div>
      <div className="ov-val"><span className="ov-ic"><Icon n={icon} s={15} /></span>{value}</div>
      <div className="ov-foot">{delta ? <Delta v={delta} down={down} /> : <span className="pill n">{foot.split("|")[0]}</span>}<span>{delta ? foot : foot.split("|")[1] || ""}</span></div>
    </div>
  );
}

function RevenueCard({ db, go }) {
  const months = [["May", 62, 24], ["Jun", 74, 28], ["Jul", 58, 22], ["Aug", 88, 34], ["Sep", 79, 30], ["Oct", 96, 38]];
  const max = Math.max(...months.map(([, n, u]) => n + u));
  const total = months[months.length - 1];
  const pins = [["Kuala Lumpur", "KL", 58, 40], ["Petaling Jaya", "PJ", 40, 62], ["Shah Alam", "SA", 22, 38]];
  return (
    <section className="card">
      <div className="rev">
        <div className="rev-pane">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
            <div><div className="rev-label">Revenue · October</div><div className="rev-num">{money((total[1] + total[2]) * 1000 * 19.2)}</div></div>
            <div className="legend"><span><i style={{ background: "#6c63ff" }} />New</span><span><i style={{ background: "#5fd38d" }} />Used</span></div>
          </div>
          <div className="stack">
            {months.map(([m, n, u]) => (
              <div className="stack-col" key={m} title={`${m}: new RM ${n * 19.2}k · used RM ${u * 19.2}k`}>
                <div className="seg used" style={{ height: `${(u / max) * 100}%` }} />
                <div className="seg new" style={{ height: `${(n / max) * 100}%` }} />
              </div>
            ))}
          </div>
          <div className="stack-x">{months.map(([m]) => <span key={m}>{m}</span>)}</div>
        </div>
        <div className="rev-pane">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div><div className="rev-label">Branch network</div><div style={{ fontSize: 13, fontWeight: 500, marginTop: 2 }}>{BRANCHES.length} active branches</div></div>
            <button className="mini-btn" onClick={() => go("reports")}>Report <Icon n="arrow" s={11} /></button>
          </div>
          <div className="map">
            <div className="map-dots" />
            {[[30, 22], [72, 28], [80, 64], [50, 82], [14, 66]].map(([x, y]) => <span key={`${x}${y}`} className="glow" style={{ left: `${x}%`, top: `${y}%` }} />)}
            {pins.map(([b, code, x, y]) => {
              const n = db.vehicles.filter((v) => v.branch === b).length;
              return (
                <button key={b} className="pin" style={{ left: `${x}%`, top: `${y}%` }} title={b} onClick={() => go("inventory")}>
                  <i>{code}</i><small>{n} vehicle{n === 1 ? "" : "s"}</small>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function FeaturedVehicle({ db, go, onAction, settings, openMedia, saveAi, toast }) {
  const list = db.vehicles.length ? db.vehicles : [];
  const [i, setI] = useState(0);
  if (!list.length) return <section className="card"><div className="empty"><b>No vehicles in stock</b></div></section>;
  const v = list[i % list.length];
  const step = (d) => setI((x) => (x + d + list.length) % list.length);
  return (
    <section className="card">
      <div className="card-head">
        <div><h3>Latest Inventory</h3><p>{i % list.length + 1} of {list.length} vehicles</p></div>
        <div className="head-actions">
          <button className="mini-btn" onClick={() => openMedia(v.id)}><Icon n="spin" s={11} />360° media</button>
          <button className="mini-btn" onClick={() => go("inventory")}>View all <Icon n="arrow" s={11} /></button>
        </div>
      </div>
      <div className="feat">
        <div className="feat-stage">
          <Vehicle360 key={v.id} vehicle={v} settings={settings} variant="hero" onManage={() => openMedia(v.id)} />
          <div className="feat-nav"><button aria-label="Previous vehicle" onClick={() => step(-1)}><Icon n="left" s={12} w={2.4} /></button><button aria-label="Next vehicle" onClick={() => step(1)}><Icon n="right" s={12} w={2.4} /></button></div>
        </div>
        <div className="feat-row">
          <div><small>Model</small><b>{v.brand} {v.model}</b></div>
          <div style={{ textAlign: "right" }}><small>Price</small><b>{money(v.price)}</b></div>
        </div>
        <div className="specs">
          <span className="spec"><Icon n="check" s={12} />{v.condition}</span>
          <span className="spec"><Icon n="calendar" s={12} />{v.year}</span>
          <span className="spec"><Icon n="drop" s={12} />{v.color}</span>
          <span className="spec"><Icon n="gauge" s={12} />{Number(v.mileage).toLocaleString()} km</span>
          <span className="spec"><Icon n="pin" s={12} />{v.branch}</span>
          <button className="spec" style={{ cursor: "pointer" }} onClick={() => onAction("view", "vehicles", v.id)}><Badge s={v.status} /></button>
        </div>
        <AiIdentify key={v.id} vehicle={v} settings={settings} onSaveAi={saveAi} toast={toast} goSettings={() => go("settings")} />
      </div>
    </section>
  );
}

function TopConsultants({ db, go }) {
  const by = {};
  db.sales.filter((s) => s.status !== "Cancelled").forEach((s) => { by[s.consultant] = by[s.consultant] || { n: 0, v: 0 }; by[s.consultant].n++; by[s.consultant].v += s.amount; });
  const rows = Object.entries(by).sort((a, b) => b[1].v - a[1].v);
  return (
    <section className="card">
      <div className="card-head"><div><h3>Top Consultants</h3><p>By order value · all branches</p></div></div>
      <div className="agents">
        <div className="ag-row h"><span>Consultant</span><span>Orders</span><span>Value</span></div>
        {rows.slice(0, 4).map(([name, s], k) => (
          <div className="ag-row" key={name}>
            <span className="ag-name"><span className="ag-av" style={{ background: AV_COLORS[k % AV_COLORS.length] }}>{initials(name)}</span><b>{name}</b></span>
            <span>{s.n}</span><span>{money(s.v)}</span>
          </div>
        ))}
        <button className="ag-foot" onClick={() => go("settings")}><b>{rows.length}</b> sales consultants · manage team</button>
      </div>
    </section>
  );
}

function Dashboard({ db, go, onAction, openForm, exportCurrent, toast, settings, openMedia, saveAi }) {
  const completed = db.sales.filter((s) => s.status === "Completed");
  const revenue = completed.reduce((a, s) => a + s.amount, 0) + db.sales.filter((s) => s.status !== "Quotation").reduce((a, s) => a + s.amount * 0.45, 0);
  const lowParts = db.parts.filter((p) => p.qty < p.min);
  const low = lowParts.length;
  const jobCount = (st) => db.jobs.filter((j) => j.status === st).length;
  const jobBars = [["In Progress", "#6c63ff"], ["Waiting for Parts", "#f2b552"], ["Quality Check", "#5fd38d"], ["Awaiting Customer Approval", "#68a2ff", "Awaiting Approval"]];
  const end = new Date(), start = new Date(end.getTime() - 6 * 864e5);
  return (
    <>
      <section className="card">
        <div className="card-head">
          <div><h3 style={{ fontSize: 16 }}>Weekly Overview</h3><p>{fmtDay(start)} – {fmtDay(end)}</p></div>
          <div className="head-actions">
            <select className="select filter-select" onChange={(e) => toast("Dashboard branch filter selected: " + e.target.value)}><option>All branches</option>{BRANCHES.map((b) => <option key={b}>{b}</option>)}</select>
            <button className="btn" onClick={exportCurrent}><Icon n="download" s={14} />Export</button>
            <button className="btn primary" onClick={() => openForm("sales")}><Icon n="plus" s={14} w={2.2} />New order</button>
          </div>
        </div>
        <div className="ov">
          <OvCell label="Vehicles in Stock" icon="car" value={db.vehicles.filter((v) => !["Sold", "Delivered"].includes(v.status)).length} delta="8.2%" onMore={() => go("inventory")} />
          <OvCell label="Units Sold · MTD" icon="sales" value={completed.length + 12} delta="12.5%" onMore={() => go("sales")} />
          <OvCell label="Sales Revenue" icon="wallet" value={money(revenue + 1840000)} delta="9.4%" onMore={() => go("finance")} />
          <OvCell label="Gross Profit" icon="reports" value={money(386400)} delta="2.1%" down onMore={() => go("finance")} />
          <OvCell label="Pending Deliveries" icon="calendar" value={db.sales.filter((s) => s.status !== "Completed").length} foot="2 today|scheduled" onMore={() => go("sales")} />
          <OvCell label="Active Service Orders" icon="wrench" value={db.jobs.filter((j) => j.status !== "Completed").length} foot="2 flagged|need attention" onMore={() => go("service")} />
          <OvCell label="Parts Stock Value" icon="box" value={money(db.parts.reduce((a, p) => a + p.qty * p.cost, 0))} foot={`${low} low|below minimum`} onMore={() => go("parts")} />
          <OvCell label="Outstanding Payments" icon="clock" value={money(db.sales.filter((s) => s.payment !== "Paid").reduce((a, s) => a + s.amount, 0))} foot="3 invoices|to follow up" onMore={() => go("finance")} />
        </div>
      </section>

      <div className="grid row2">
        <RevenueCard db={db} go={go} />
        <FeaturedVehicle db={db} go={go} onAction={onAction} settings={settings} openMedia={openMedia} saveAi={saveAi} toast={toast} />
      </div>

      <div className="grid row2">
        <section className="card">
          <div className="card-head"><div><h3>Recent Sales Orders</h3><p>Latest bookings and handovers across all branches</p></div><button className="mini-btn" onClick={() => go("finance")}>View all <Icon n="arrow" s={11} /></button></div>
          <DataTable rows={db.sales.slice(0, 4)} cols={["Vehicle", "Customer", "Amount", "Status"]} type="sales" onAction={onAction} compact />
        </section>
        <TopConsultants db={db} go={go} />
      </div>

      <div className="grid tri">
        <section className="card">
          <div className="card-head"><div><h3>Workshop Job Status</h3><p>Active repair orders</p></div><button className="mini-btn" onClick={() => go("service")}>Board <Icon n="arrow" s={11} /></button></div>
          <div className="card-body"><Bars items={jobBars.map(([st, color, label]) => ({ label: label || st, right: `${jobCount(st)} jobs`, pct: Math.max(8, jobCount(st) * 24), color }))} /></div>
        </section>
        <section className="card">
          <div className="card-head"><div><h3>Operational Alerts</h3><p>Items that may need attention</p></div><span className="status s-amber">{low + 3} alerts</span></div>
          <div className="card-body"><div className="alert-list">
            {[["alert", "Low parts stock", low ? lowParts.map((p) => p.name).join(", ") : "Brake pad and air filter stock should be reviewed."],
              ["clock", "Customer approval pending", "RO-6214 · Hybrid system diagnosis"],
              ["car", "Delivery preparation", "SO-2026-1042 · Handover in progress"],
              ["shield", "Warranty expiring soon", "1 warranty expires within 60 days"]].map(([m, t, d]) => (
              <div className="alert" key={t}><div className="alert-mark"><Icon n={m} s={14} /></div><div><b>{t}</b><p>{d}</p></div></div>
            ))}
          </div></div>
        </section>
        <section className="card">
          <div className="card-head"><div><h3>Recent Activity</h3><p>Updates from your team</p></div></div>
          <div className="card-body activity">
            {[["sales", "Sales order SO-2026-1042 updated", "Delivery preparation started for Amelia Tan", "Today, 10:42 AM · Daniel Wong"],
              ["box", "Parts inventory reviewed", "Weekly stock count — Kuala Lumpur", "Today, 9:18 AM · Parts Team"],
              ["wrench", "Repair order RO-6216 moved to QC", "Periodic maintenance completed", "Yesterday, 4:35 PM · Arif Hassan"]].map(([i, t, p, tm]) => (
              <div className="activity-item" key={t}><div className="activity-icon"><Icon n={i} s={14} /></div><div><b>{t}</b><p>{p}</p><time>{tm}</time></div></div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

/* ───────────────────────── Module pages ───────────────────────── */
function ModulePage({ page, db, filters, setFilters, pageNum, setPageNum, viewMode, setViewMode, onAction, openForm, exportCurrent, settings, openMedia }) {
  const c = CONFIG[page], pageSize = 6, rows = db[c.key];
  const filtered = rows.filter((r) => matches(r, filters.search) && (!filters.status || r.status === filters.status) && (filters.branch === "All branches" || r.branch === filters.branch));
  const slice = filtered.slice((pageNum - 1) * pageSize, pageNum * pageSize);
  const statuses = page === "inventory" ? CONFIG.inventory.fields.find((f) => f[0] === "status")[3] : [...new Set(rows.map((r) => r.status))].filter(Boolean);
  const setF = (patch) => { setFilters((f) => ({ ...f, ...patch })); setPageNum(1); };
  const placeholder = page === "inventory" ? "VIN, model, stock ID…" : page === "customers" ? "name, email, customer ID…" : "records…";
  const search = (
    <div className="table-search"><span className="si"><Icon n="search" s={14} /></span><input placeholder={`Search ${placeholder}`} value={filters.search} onChange={(e) => setF({ search: e.target.value })} /></div>
  );
  const statusSel = (
    <select className="select filter-select" value={filters.status} onChange={(e) => setF({ status: e.target.value })}>
      <option value="">All statuses</option>{statuses.map((x) => <option key={x}>{x}</option>)}
    </select>
  );

  if (page === "inventory" && viewMode === "cards") {
    return (
      <>
        <PageHead page={page} title={c.title} desc={c.desc}>
          <button className="btn" onClick={() => setViewMode("table")}><Icon n="grid" s={14} />Table view</button>
          <button className="btn primary" onClick={() => openForm(page)}><Icon n="plus" s={14} w={2.2} />{c.add}</button>
        </PageHead>
        <div className="table-toolbar card" style={{ marginBottom: 14 }}>{search}{statusSel}</div>
        <div className="grid vehicle-grid">
          {filtered.map((v) => (
            <div className="card vehicle-card" key={v.id}>
              <div className="vehicle-art"><small>{v.id}</small><Vehicle360 vehicle={v} settings={settings} variant="card" /></div>
              <div className="vehicle-info">
                <h3>{v.brand} {v.model}</h3>
                <p>{v.year} · {v.condition} · {Number(v.mileage).toLocaleString()} km · {v.branch}</p>
                <div style={{ marginBottom: 12 }}><Badge s={v.status} /></div>
                <div className="vehicle-meta"><span className="vehicle-price">{money(v.price)}</span><div className="table-actions"><button className="mini-btn" onClick={() => openMedia(v.id)}><Icon n="spin" s={11} />360°</button><button className="mini-btn" onClick={() => onAction("view", "vehicles", v.id)}>Details <Icon n="arrow" s={11} /></button></div></div>
              </div>
            </div>
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      <PageHead page={page} title={c.title} desc={c.desc}>
        <button className="btn" onClick={exportCurrent}><Icon n="download" s={14} />Export</button>
        <button className="btn primary" onClick={() => openForm(page)}><Icon n="plus" s={14} w={2.2} />{c.add}</button>
      </PageHead>
      {page === "parts" && (
        <div className="grid module-summary">
          <Kpi label="Total SKUs" value={db.parts.length} icon="box" foot="Across all branches" />
          <Kpi label="Low Stock Items" value={db.parts.filter((x) => x.qty < x.min).length} icon="alert" foot="Replenishment recommended" />
          <Kpi label="Stock Valuation" value={money(db.parts.reduce((a, x) => a + x.qty * x.cost, 0))} icon="wallet" foot="At weighted unit cost" />
        </div>
      )}
      <section className="card table-card">
        <div className="table-toolbar">
          {search}{statusSel}
          <select className="select filter-select" value={filters.branch} onChange={(e) => setF({ branch: e.target.value })}>
            <option>All branches</option>{BRANCHES.map((x) => <option key={x}>{x}</option>)}
          </select>
          {page === "inventory" && <button className="btn" onClick={() => setViewMode("cards")}><Icon n="dashboard" s={14} />Card view</button>}
        </div>
        <DataTable rows={slice} cols={c.cols} type={c.key} onAction={onAction} />
        <div className="table-foot">
          <span>Showing {filtered.length ? (pageNum - 1) * pageSize + 1 : 0}–{Math.min(pageNum * pageSize, filtered.length)} of {filtered.length} records</span>
          <div className="pagination">
            <button disabled={pageNum === 1} onClick={() => setPageNum((n) => Math.max(1, n - 1))} aria-label="Previous page">←</button>
            <button className="cur" disabled>{pageNum}</button>
            <button disabled={pageNum * pageSize >= filtered.length} onClick={() => setPageNum((n) => n + 1)} aria-label="Next page">→</button>
          </div>
        </div>
      </section>
    </>
  );
}

function SalesPipeline({ db, onAction, openForm }) {
  const open = db.sales.filter((s) => s.status !== "Completed" && s.status !== "Cancelled");
  return (
    <>
      <PageHead page="sales" title="Sales Pipeline" desc="Follow every opportunity from first enquiry through vehicle handover.">
        <button className="btn primary" onClick={() => openForm("sales")}><Icon n="plus" s={14} w={2.2} />Create sales order</button>
      </PageHead>
      <div className="grid module-summary">
        <Kpi label="Open Opportunities" value={open.length} icon="sales" foot="Across all consultants" />
        <Kpi label="Pipeline Value" value={money(db.sales.filter((s) => s.status !== "Completed").reduce((a, s) => a + s.amount, 0))} icon="wallet" foot="Open orders and quotations" />
        <Kpi label="Completed Orders" value={db.sales.filter((s) => s.status === "Completed").length} icon="check" foot="In current sample dataset" />
      </div>
      <div className="kanban">
        {STAGES.map((st) => {
          const items = db.sales.filter((s) => s.status === st);
          return (
            <div className="kanban-col" key={st}>
              <div className="kanban-head">{st}<span>{items.length}</span></div>
              {items.map((s) => (
                <div className="deal-card" key={s.id}>
                  <b>{s.customer}</b><p>{s.vehicle}</p>
                  <div className="deal-meta"><strong>{money(s.amount)}</strong><span>{s.id}</span></div>
                  <div style={{ marginTop: 10 }}><Badge s={s.payment} /></div>
                  <div style={{ display: "flex", gap: 5, marginTop: 10 }}>
                    <button className="mini-btn" onClick={() => onAction("edit", "sales", s.id)}>Edit</button>
                    <button className="mini-btn" onClick={() => onAction("advance-sale", "sales", s.id)}>Advance stage →</button>
                  </div>
                </div>
              ))}
              {!items.length && <div style={{ fontSize: 11, padding: "10px 4px", color: "var(--dim)" }}>No orders in this stage</div>}
            </div>
          );
        })}
      </div>
      <p className="page-note" style={{ marginTop: 14 }}>Sample pipeline. Use “Advance stage” to move an order through the workflow. Vehicle availability and payments are not connected to external systems in this demo.</p>
    </>
  );
}

function FinancePage({ db, onAction, exportCurrent }) {
  const outstanding = db.sales.filter((s) => s.payment !== "Paid").reduce((a, s) => a + s.amount, 0);
  return (
    <>
      <PageHead page="finance" title="Finance Overview" desc="A consolidated operational view of recorded sales and outstanding balances.">
        <button className="btn" onClick={exportCurrent}><Icon n="download" s={14} />Export transactions</button>
      </PageHead>
      <div className="grid kpis">
        <Kpi label="Recorded Sales" value={money(db.sales.reduce((a, s) => a + s.amount, 0))} icon="wallet" foot="Based on sales order values" />
        <Kpi label="Paid Orders" value={db.sales.filter((s) => s.payment === "Paid").length} icon="check" foot="Marked paid in this demo" />
        <Kpi label="Outstanding Amount" value={money(outstanding)} icon="clock" foot="Includes unpaid and deposit-stage orders" />
        <Kpi label="Est. Vehicle Margin" value={money(db.vehicles.reduce((a, v) => a + v.price - v.cost, 0))} icon="reports" foot="Asking price less purchase cost" />
      </div>
      <section className="card table-card">
        <div className="card-head"><div><h3>Sales transaction overview</h3><p>Order amounts and recorded payment status</p></div><span className="status s-amber">Demo ledger</span></div>
        <DataTable rows={db.sales} cols={CONFIG.sales.cols} type="sales" onAction={onAction} />
      </section>
      <p className="page-note" style={{ marginTop: 14 }}>This is an operational overview, not a full accounting ledger. Amounts are sample records; payment labels do not verify bank settlement, tax compliance, or external accounting entries.</p>
    </>
  );
}

function ReportsPage({ db, go, exportCurrent }) {
  const reports = [["sales", "Vehicle sales performance", "Sales orders, pipeline stages, and order value", "sales"], ["reports", "Revenue & gross profit", "Sales value and indicative inventory margin", "finance"], ["car", "Inventory ageing", "Stock availability, condition, and branch", "inventory"], ["wrench", "Workshop productivity", "Repair orders by status and technician", "service"], ["box", "Spare parts movement", "Current quantities, stock value, and low stock", "parts"], ["shield", "Warranty claims", "Warranty coverage and upcoming expiry dates", "warranty"], ["users", "Customer overview", "Customer types, preferred brands, and lifetime value", "customers"], ["home", "Branch performance", "Vehicle and customer distribution by branch", "inventory"], ["clock", "Outstanding payments", "Sales orders by recorded payment status", "finance"]];
  return (
    <>
      <PageHead page="reports" title="Reports & Analytics" desc="Explore dealership performance and export filtered operational data.">
        <button className="btn" onClick={exportCurrent}><Icon n="download" s={14} />Export dataset</button>
        <button className="btn primary" onClick={() => window.print()}><Icon n="print" s={14} />Print report</button>
      </PageHead>
      <div className="grid report-cards">
        {reports.map(([i, t, d, p]) => (
          <div className="card report-card" key={t}><div className="r-icon"><Icon n={i} s={17} /></div><h3>{t}</h3><p>{d}</p><button className="btn" onClick={() => go(p)}>Open report <Icon n="arrow" s={12} /></button></div>
        ))}
      </div>
      <section className="card" style={{ marginTop: 14 }}>
        <div className="card-head"><div><h3>Inventory snapshot by branch</h3><p>Vehicle count and listed selling value</p></div></div>
        <div className="card-body">
          <Bars items={BRANCHES.map((b) => { const vs = db.vehicles.filter((v) => v.branch === b); return { label: b, right: `${vs.length} vehicles · ${money(vs.reduce((a, v) => a + v.price, 0))}`, pct: Math.max(4, (vs.length / 6) * 100) }; })} />
        </div>
      </section>
    </>
  );
}

function ImagerySettings({ settings, setSettings, db, toast, openMedia }) {
  const [f, setF] = useState(settings);
  const sample = db.vehicles[0];
  const save = () => { setSettings({ ...f, imaginKey: f.imaginKey.trim(), ollamaUrl: f.ollamaUrl.trim(), ollamaModel: f.ollamaModel.trim() }); toast("Vehicle imagery settings saved."); };
  const testAi = async () => {
    const base = f.ollamaUrl.trim().replace(/\/+$/, ""), want = f.ollamaModel.trim();
    try {
      const { models = [] } = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(5000) }).then((r) => r.json());
      const names = models.map((m) => m.name);
      toast(names.includes(want) || names.includes(`${want}:latest`) ? `Connected. ${want} is installed and ready.` : `Ollama is running, but ${want} isn't installed. Run: ollama pull ${want}`);
    } catch { toast(`Can't reach Ollama at ${base}. Make sure it's running.`); }
  };
  return (
    <section className="card" style={{ marginTop: 14 }}>
      <div className="card-head"><div><h3>Vehicle imagery</h3><p>360° viewer sources and studio renders</p></div><span className={`status ${settings.imaginKey ? "s-green" : "s-gray"}`}>{settings.imaginKey ? "Renders on" : "Renders off"}</span></div>
      <div className="card-body imagery">
        <div>
          <div className="field" style={{ marginBottom: 14 }}><label>IMAGIN.studio customer key</label><input value={f.imaginKey} onChange={(e) => setF({ ...f, imaginKey: e.target.value })} placeholder="Paste the key IMAGIN gives you" autoComplete="off" spellCheck={false} /></div>
          <div className="field" style={{ marginBottom: 14 }}><label>Render angles for the spin (comma separated)</label><input value={f.imaginAngles} onChange={(e) => setF({ ...f, imaginAngles: e.target.value })} /></div>
          <div className="form-grid" style={{ marginBottom: 14 }}>
            <div className="field"><label>Local AI (Ollama) address</label><input value={f.ollamaUrl} onChange={(e) => setF({ ...f, ollamaUrl: e.target.value })} placeholder="http://localhost:11434" autoComplete="off" spellCheck={false} /></div>
            <div className="field"><label>Vision model</label><input value={f.ollamaModel} onChange={(e) => setF({ ...f, ollamaModel: e.target.value })} placeholder="qwen3-vl:4b" autoComplete="off" spellCheck={false} /></div>
          </div>
          <label className="check" style={{ marginBottom: 8 }}><input type="checkbox" checked={f.aiAuto} onChange={(e) => setF({ ...f, aiAuto: e.target.checked })} />Identify vehicles automatically on the dashboard</label>
          <label className="check"><input type="checkbox" checked={f.autoRotate} onChange={(e) => setF({ ...f, autoRotate: e.target.checked })} />Auto-rotate vehicles in the viewer</label>
          <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
            <button className="btn primary" onClick={save}>Save imagery settings</button>
            <button className="btn" onClick={testAi}><Icon n="spark" s={14} />Test local AI</button>
            {sample && <button className="btn" onClick={() => { save(); openMedia(sample.id); }}><Icon n="spin" s={14} />Test with {sample.brand} {sample.model}</button>}
          </div>
        </div>
        <ol className="how">
          <li><b>3D models (.glb)</b> give a full orbit with zoom and AR. Upload per vehicle, or host them and link the URL.</li>
          <li><b>360° photos</b>: shoot 12–36 frames around the car at even steps. Upload per vehicle, or place them in <code>public/media/&lt;Stock ID&gt;/</code> and link <code>{"/media/VH-2401/{01..36}.jpg"}</code>.</li>
          <li><b>Studio renders</b> from IMAGIN.studio match each vehicle's make, model, year and colour automatically. You need your own customer key from imagin.studio; the angle codes available depend on your plan.</li>
          <li><b>AI identification</b> runs on this computer with <a className="link-btn" href="https://ollama.com" target="_blank" rel="noreferrer">Ollama</a>; no API key or internet is needed. The vision model identifies each vehicle (from its record, its first 360° photo, or a photo you scan on the dashboard) and a 3D model is generated at its real dimensions and paint colour. Each identification takes about 15–30 seconds. If Ollama isn't running, the 3D model is estimated from the model name.</li>
          <li>Without any of these, a body-type illustration (sedan, SUV, hatchback, pickup, MPV, coupe) is picked from the model name.</li>
        </ol>
      </div>
    </section>
  );
}

function SettingsPage({ toast, resetDemo, settings, setSettings, db, openMedia }) {
  const users = [["Jordan Lee", "Dealer Principal", "All branches"], ["Daniel Wong", "Sales Consultant", "Kuala Lumpur"], ["Sarah Lim", "Sales Manager", "Petaling Jaya"], ["Arif Hassan", "Technician", "Kuala Lumpur"], ["Mei Chen", "Finance Officer", "All branches"]];
  return (
    <>
      <PageHead page="settings" title="Administration" desc="Manage access, branches, and operational preferences.">
        <button className="btn primary" onClick={() => toast("User administration requires a secure backend in production.")}><Icon n="plus" s={14} w={2.2} />Add user</button>
      </PageHead>
      <div className="grid lower-grid">
        <section className="card">
          <div className="card-head"><h3>Users & roles</h3><span className="status s-green">9 active</span></div>
          <div className="table-wrap"><table>
            <thead><tr><th>User</th><th>Role</th><th>Branch</th><th>Status</th></tr></thead>
            <tbody>{users.map((u, k) => <tr key={u[0]}><td><span className="ag-name"><span className="ag-av" style={{ background: AV_COLORS[k % AV_COLORS.length] }}>{initials(u[0])}</span><b>{u[0]}</b></span></td><td>{u[1]}</td><td>{u[2]}</td><td><Badge s="Active" /></td></tr>)}</tbody>
          </table></div>
        </section>
        <section className="card">
          <div className="card-head"><h3>System configuration</h3></div>
          <div className="card-body">
            <div className="field" style={{ marginBottom: 14 }}><label>Default currency</label><select className="select"><option>MYR — Malaysian Ringgit (RM)</option><option>SGD — Singapore Dollar</option><option>USD — US Dollar</option></select></div>
            <div className="field" style={{ marginBottom: 14 }}><label>Default branch</label><select className="select">{BRANCHES.map((b) => <option key={b}>{b}</option>)}</select></div>
            <div className="field" style={{ marginBottom: 14 }}><label>Sales discount approval threshold (%)</label><input type="number" defaultValue={5} min={0} max={100} /></div>
            <button className="btn primary" onClick={() => toast("Preferences saved for this demo session.")}>Save preferences</button>
          </div>
        </section>
      </div>
      <ImagerySettings settings={settings} setSettings={setSettings} db={db} toast={toast} openMedia={openMedia} />
      <section className="card" style={{ marginTop: 14 }}>
        <div className="card-head"><div><h3>Data & environment</h3><p>Demo workspace controls</p></div></div>
        <div className="card-body">
          <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>Records are stored in MongoDB through the AutoCore API (<code>npm run dev</code> starts both), with a copy in this browser for when the server can't be reached. Uploaded 360° photos and 3D files stay in this browser. This demo does not include authentication, backups, or backend-enforced role permissions.</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn" onClick={resetDemo}>Reset sample data</button>
            <button className="btn" onClick={() => window.confirm("Remove all 360° photos and 3D files uploaded in this browser?") && clearAllLocalMedia().then(() => toast("Uploaded media cleared."))}><Icon n="trash" s={14} />Clear uploaded media</button>
          </div>
        </div>
      </section>
    </>
  );
}

/* ───────────────────────── App ───────────────────────── */
const NO_FILTERS = { search: "", status: "", branch: "All branches" };

export default function App() {
  const [db, setDb] = useState(loadDb);
  const [page, setPage] = useState("dashboard");
  const [filters, setFilters] = useState(NO_FILTERS);
  const [pageNum, setPageNum] = useState(1);
  const [viewMode, setViewMode] = useState("table");
  const [modal, setModal] = useState(null);
  const [globalQ, setGlobalQ] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState("");
  const [settings, setSettingsState] = useState(loadSettings);
  const timer = useRef(null);
  const setSettings = (s) => { setSettingsState(s); saveSettings(s); };

  /* ── MongoDB sync: load once, then send each change (only the records that changed) ── */
  const [conn, setConn] = useState("connecting"); // connecting | online | offline | error
  const remote = useRef(null); // what MongoDB holds, as far as this tab knows; null while not connected
  const queue = useRef(Promise.resolve());
  const dbRef = useRef(db), loaded = useRef(db);
  dbRef.current = db;

  const push = () => {
    queue.current = queue.current.then(async () => {
      if (!remote.current) return;
      const target = dbRef.current, changes = diffDb(remote.current, target);
      try {
        for (const [name, change] of Object.entries(changes)) {
          await api.apply(name, change);
          remote.current = { ...remote.current, [name]: target[name] };
        }
        if (dbRef.current === target) flag(PENDING, null);
        setConn("online");
      } catch (e) {
        flag(PENDING, "1");
        setConn("error");
        toast(`${e.message} Your changes are kept in this browser and will be sent when the database is back.`);
      }
    });
  };
  const connect = () => {
    queue.current = queue.current.then(async () => {
      setConn("connecting");
      try {
        const data = await api.load();
        remote.current = data;
        // edits made while offline (or a browser copy from before the database existed) are sent up; otherwise MongoDB wins
        const carry = flag(PENDING) || (hadCopy && !flag(SYNCED));
        flag(SYNCED, "1");
        setConn("online");
        if (carry && Object.keys(diffDb(data, dbRef.current)).length) { push(); toast("Changes saved in this browser were sent to the database."); }
        else if (JSON.stringify(data) !== JSON.stringify(dbRef.current)) setDb(data);
      } catch {
        remote.current = null;
        setConn("offline");
      }
    });
  };
  // pick up other users' changes when coming back to the tab
  const refresh = () => {
    queue.current = queue.current.then(async () => {
      if (!remote.current || Object.keys(diffDb(remote.current, dbRef.current)).length) return;
      try {
        const data = await api.load();
        remote.current = data;
        if (JSON.stringify(data) !== JSON.stringify(dbRef.current)) setDb(data);
      } catch { remote.current = null; setConn("offline"); }
    });
  };

  useEffect(() => {
    connect();
    const onVis = () => document.visibilityState === "visible" && (remote.current ? refresh() : connect());
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch {}
    if (db === loaded.current) return; // the copy loaded at start-up isn't an edit
    if (remote.current) push(); else flag(PENDING, "1");
  }, [db]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") { setModal(null); setMenuOpen(false); } };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const toast = (msg) => { setToastMsg(msg); clearTimeout(timer.current); timer.current = setTimeout(() => setToastMsg(""), 2600); };
  const go = (p, search = "") => { setPage(p); setPageNum(1); setFilters({ ...NO_FILTERS, search }); setGlobalQ(""); setMenuOpen(false); window.scrollTo?.(0, 0); };

  const openForm = (p, record = null) => setModal({ kind: "form", page: p, record });
  const openMedia = (id) => setModal({ kind: "media", page: "inventory", id });
  const saveMedia = (id, patch) => {
    setDb((d) => ({ ...d, vehicles: d.vehicles.map((v) => (v.id === id ? { ...v, ...patch } : v)) }));
    toast("360° media settings saved.");
  };
  const openDamage = (key, id) => setModal({ kind: "damage", page: pageForKey(key), key, id });
  const saveDamage = (key, id, damage) => {
    setDb((d) => ({ ...d, [key]: d[key].map((r) => (r.id === id ? { ...r, damage } : r)) }));
    setModal(null);
    toast(`Damage saved: ${damageSummary(damage).toLowerCase()}.`);
  };
  const saveAi = (id, ai) => setDb((d) => ({ ...d, vehicles: d.vehicles.map((v) => (v.id === id ? { ...v, ai } : v)) }));

  const onAction = (action, key, id) => {
    const r = db[key]?.find((x) => x.id === id);
    if (!r) return;
    if (action === "view") return setModal({ kind: "view", page: pageForKey(key), record: r });
    if (action === "edit") return openForm(pageForKey(key), r);
    if (action === "media") return openMedia(id);
    if (action === "damage") return openDamage(key, id);
    if (action === "advance-sale") {
      const i = STAGES.indexOf(r.status);
      if (i < 0 || i === STAGES.length - 1) return toast("This order is already at a terminal stage.");
      const next = STAGES[i + 1];
      if (next === "Completed" && !window.confirm("Mark this order completed? Confirm the handover and payment outside this demo first.")) return;
      setDb((d) => ({ ...d, sales: d.sales.map((s) => (s.id === id ? { ...s, status: next } : s)) }));
      toast(`${id} moved to ${next}.`);
    }
  };

  // uploads from the vehicle form are stored under the (possibly renamed) Stock ID once the record is accepted
  const storeFormMedia = async (oldId, id, pending) => {
    const moved = oldId && oldId !== id ? await getLocalMedia(oldId) : null;
    if (!moved && !Object.keys(pending).length) return;
    try {
      await setLocalMedia(id, { ...(moved && { frames: moved.frames, glb: moved.glb }), ...pending });
      if (moved) await setLocalMedia(oldId, { frames: [], glb: null });
    } catch { toast("Couldn't save the 360° photos / 3D file in this browser (storage may be full)."); }
  };

  const saveRecord = (data, media) => {
    const { page: p, record } = modal, c = CONFIG[p], next = clone(db), arr = next[c.key], editId = record?.id;
    if (p === "inventory" && arr.some((x) => x.vin === data.vin && x.id !== editId)) return toast("That VIN already exists. Each vehicle must have a unique VIN.");
    if (p === "parts" && arr.some((x) => x.sku === data.sku && x.id !== editId)) return toast("That part number already exists.");
    if (record) {
      const i = arr.findIndex((x) => x.id === editId);
      // a different car (or paint) needs a fresh AI identification
      const stale = p === "inventory" && ["brand", "model", "year", "color", "body"].some((k) => String(arr[i][k] ?? "") !== String(data[k] ?? ""));
      arr[i] = { ...arr[i], ...data, ...(stale ? { ai: null } : {}) };
    } else {
      if (p === "inventory" && arr.some((x) => x.id === data.id)) return toast("Stock ID already exists.");
      if (p === "sales" && data.vehicle) {
        const v = next.vehicles.find((x) => `${x.brand} ${x.model}` === data.vehicle || x.id === data.vehicle);
        if (v && v.status !== "Available") return toast(`Vehicle is ${v.status}; select an available vehicle.`);
        if (v) v.status = "Reserved";
      }
      if (p === "parts" && !data.id) data.id = "PT-" + String(Math.max(0, ...arr.map((x) => parseInt(x.id.slice(3), 10) || 0)) + 1).padStart(5, "0");
      arr.unshift(data);
    }
    setDb(next);
    setModal(null);
    if (media) storeFormMedia(editId, data.id, media);
    toast(record ? "Record updated." : "Record created successfully.");
  };

  const exportCurrent = () => {
    const c = CONFIG[page];
    const rows = c ? db[c.key].filter((r) => matches(r, filters.search) && (!filters.status || r.status === filters.status) && (filters.branch === "All branches" || r.branch === filters.branch))
      : page === "reports" ? db.vehicles : db.sales;
    if (!rows.length) return toast("No records available to export.");
    const keys = [...new Set(rows.flatMap(Object.keys))];
    const cell = (x) => (x && typeof x === "object" ? JSON.stringify(x) : String(x ?? ""));
    const csv = [keys.join(","), ...rows.map((r) => keys.map((k) => `"${cell(r[k]).replace(/"/g, '""')}"`).join(","))].join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    a.download = `autocore-${page}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast("CSV export generated.");
  };

  const resetDemo = () => {
    if (!window.confirm(`Reset all records${conn === "online" ? " in the database (for every user)" : ""} to the original sample data?`)) return;
    setDb(clone(INITIAL));
    toast("Sample data reset.");
  };

  const globalSearch = (e) => {
    if (e.key !== "Enter") return;
    const q = globalQ.trim();
    if (!q) return;
    const found = [["vehicles", "inventory"], ["customers", "customers"], ["sales", "sales"], ["jobs", "service"], ["parts", "parts"], ["warranties", "warranty"]].find(([k]) => db[k].some((r) => matches(r, q)));
    // The sales page is a pipeline board (no search box), so route sales hits to the Finance table instead.
    found ? go(found[1] === "sales" ? "finance" : found[1], q) : toast("No matching record found in the sample workspace.");
  };

  const common = { db, go, onAction, openForm, exportCurrent, toast, settings, openMedia, saveAi };
  let body;
  if (page === "dashboard") body = <Dashboard {...common} />;
  else if (page === "sales") body = <SalesPipeline {...common} />;
  else if (page === "finance") body = <FinancePage {...common} />;
  else if (page === "reports") body = <ReportsPage {...common} />;
  else if (page === "settings") body = <SettingsPage toast={toast} resetDemo={resetDemo} settings={settings} setSettings={setSettings} db={db} openMedia={openMedia} />;
  else body = <ModulePage page={page} {...common} filters={filters} setFilters={setFilters} pageNum={pageNum} setPageNum={setPageNum} viewMode={viewMode} setViewMode={setViewMode} />;

  const NavBtn = ([p, ico, label, count]) => (
    <button key={p} className={page === p ? "active" : ""} onClick={() => go(p)}>
      <span className="ico"><Icon n={ico} s={16} /></span>{label}{count ? <span className="count">{count}</span> : null}
    </button>
  );

  return (
    <div className="app">
      <div className="frame">
        <header className="topbar">
          <button className="icon-btn mobile-menu" onClick={() => setMenuOpen((o) => !o)} aria-label="Open menu"><Icon n="menu" s={17} /></button>
          <div className="brand"><div className="logo"><Logo /></div><b>AUTOCORE</b></div>
          <div className="crumb">Workspace&nbsp; / &nbsp;<span>{TITLES[page]}</span></div>
          <div className="top-search"><span className="si"><Icon n="search" s={14} /></span><input value={globalQ} onChange={(e) => setGlobalQ(e.target.value)} onKeyDown={globalSearch} placeholder="Search here" aria-label="Global search" /></div>
          <div className="top-actions">
            <button className={`db-chip ${conn}`} onClick={conn === "online" ? refresh : connect} disabled={conn === "connecting"}
              title={{ online: "Records are saved in MongoDB. Click to reload.", connecting: "Connecting to the database…", offline: "The database server isn't reachable. Changes are kept in this browser. Click to retry.", error: "The last change couldn't be saved to MongoDB. Click to retry." }[conn]}>
              <i />{{ online: "MongoDB", connecting: "Connecting…", offline: "Offline", error: "Not saved" }[conn]}
            </button>
            <button className="icon-btn hide-sm" title="Administration" onClick={() => go("settings")}><Icon n="settings" s={16} /></button>
            <button className="icon-btn" title="Notifications" onClick={() => toast("You have 4 operational alerts. See Operational Alerts on the dashboard.")}><Icon n="bell" s={16} /><i className="dot" /></button>
            <div className="avatar">JL</div><div className="user">Jordan Lee<small>Dealer Principal</small></div>
          </div>
        </header>

        <div className="shell">
          <div className={`scrim ${menuOpen ? "open" : ""}`} onClick={() => setMenuOpen(false)} />
          <aside className={`sidebar ${menuOpen ? "open" : ""}`}>
            <nav className="nav">{NAV_MAIN.map(NavBtn)}</nav>
            <div className="side-bottom">
              <div className="nav-label">Insights</div>
              <nav className="nav">{NAV_INSIGHTS.map(NavBtn)}</nav>
              <div className="branch-mini"><div className="branch-icon"><Icon n="home" s={15} /></div><div><b>AutoCore Group</b><small>3 active branches</small></div><span style={{ marginLeft: "auto", color: "var(--dim)", display: "flex" }}><Icon n="chevron" s={14} /></span></div>
            </div>
          </aside>

          <main className="main"><div className="content">{body}</div></main>
        </div>
      </div>

      <Modal key={modal ? `${modal.kind}-${modal.page}-${modal.record?.id ?? modal.id ?? "new"}` : "none"} modal={modal} db={db} settings={settings} onClose={() => setModal(null)} onSave={saveRecord} onSaveMedia={saveMedia} onSaveDamage={saveDamage} openMedia={openMedia} openDamage={openDamage} toast={toast} go={go} />
      <div className={`toast ${toastMsg ? "show" : ""}`} role="status">{toastMsg}</div>
    </div>
  );
}
