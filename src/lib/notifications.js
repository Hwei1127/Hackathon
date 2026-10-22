/* ─────────────────────────────────────────────────────────────
   Notifications, worked out from the records: what needs someone's attention, who raised it and why.
   Each one: { id, from, reason, tone, priority, title, body, details: [[label, value]], link, at }.
   The id includes the record's current status, so a record that moves on raises a fresh notification.
   ───────────────────────────────────────────────────────────── */
const DAY = 864e5;
const money = (n) => "RM " + Number(n || 0).toLocaleString("en-MY", { maximumFractionDigits: 0 });
const dateOf = (d) => new Date(`${d}T00:00`);
export const fmtDate = (d) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

/* staff who send notifications themselves */
const PEOPLE = {
  "Jordan Lee": "Dealer Principal", "Mei Chen": "Finance Officer · All branches",
  "Daniel Wong": "Sales Consultant · Kuala Lumpur", "Jason Tan": "Sales Consultant · Kuala Lumpur", "Sarah Lim": "Sales Manager · Petaling Jaya",
  "Kevin Goh": "Sales Consultant · Petaling Jaya", "Farah Aziz": "Sales Consultant · Shah Alam",
  "Arif Hassan": "Technician · Kuala Lumpur", "Kumar Raj": "Technician · Kuala Lumpur", "Lim Wei Jian": "Technician · Petaling Jaya",
  "Tan Kok Wai": "Technician · Petaling Jaya", "Hafiz Ismail": "Technician · Shah Alam", "Nurul Huda": "Technician · Shah Alam",
};
/* automated senders */
const SYSTEM = {
  "Parts Desk": ["Stock monitor · automated", "box"], "Warranty Desk": ["Warranty tracking · automated", "shield"],
  "Workshop Scheduler": ["Repair order tracking · automated", "clock"], "Service Desk": ["Bookings · automated", "calendar"],
  "Logistics": ["Inbound vehicles · automated", "car"],
};
export const senderInfo = (name) => SYSTEM[name] ? { name, role: SYSTEM[name][0], icon: SYSTEM[name][1], system: true } : { name, role: PEOPLE[name] || "Team member" };

/** All current notifications for the records in `db`, newest first. */
export function buildNotifications(db, now = Date.now()) {
  const out = [];
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const daysFrom = (d) => Math.round((dateOf(d) - today) / DAY);
  // a stable time of day for a record's date, never in the future
  const at = (day, key) => {
    const h = hash(key), t = new Date(day);
    t.setHours(8 + (h % 9), h % 60, 0, 0);
    return Math.min(t.getTime(), now - ((h % 50) + 5) * 60000);
  };
  const ago = (key, maxDays = 2) => at(today.getTime() - (hash(key) % (maxDays + 1)) * DAY, key);

  for (const j of db.jobs || []) {
    if (j.status === "Completed") continue;
    const left = daysFrom(j.due), late = left < 0 && j.status !== "Ready for Collection";
    const base = {
      link: { key: "jobs", id: j.id }, from: j.technician,
      details: [["Repair order", j.id], ["Customer", j.customer], ["Vehicle", j.vehicle], ["Service", j.service], ["Status", j.status], ["Branch", j.branch], ["Due", `${fmtDate(dateOf(j.due))}${late ? ` · ${-left} day${left === -1 ? "" : "s"} late` : ""}`]],
    };
    const lateNote = late ? ` It was due on ${fmtDate(dateOf(j.due))}, so please let the customer know the new completion time.` : "";
    const id = `job-${j.id}-${j.status}`, when = at(dateOf(j.due).getTime() - DAY, id);
    if (j.status === "Awaiting Customer Approval")
      out.push({ ...base, id, at: when, reason: "Customer approval needed", tone: "amber", priority: "high", title: `${j.id} is waiting for ${j.customer}'s approval`,
        body: `I've finished the diagnosis on the ${j.vehicle} (${j.service.toLowerCase()}) and sent the quotation. Work is on hold until the customer approves it. Could the service desk follow up with them today?${lateNote}` });
    else if (j.status === "Waiting for Parts")
      out.push({ ...base, id, at: when, reason: "Waiting for parts", tone: "amber", priority: late ? "high" : "normal", title: `${j.id} is on hold for parts`,
        body: `${j.service} on ${j.customer}'s ${j.vehicle} can't continue until the parts arrive. I'll pick it up as soon as they're in. Please chase the supplier if there's no delivery date yet.${lateNote}` });
    else if (j.status === "Ready for Collection")
      out.push({ ...base, id, at: when, reason: "Ready for collection", tone: "green", priority: "normal", title: `${j.vehicle} is ready for ${j.customer}`,
        body: `${j.service} is done and the car has passed quality check. Please call ${j.customer} to arrange collection and settle the invoice.` });
    else if (j.status === "Appointment Scheduled")
      out.push({ ...base, id, from: "Service Desk", at: ago(id), reason: "Upcoming appointment", tone: "blue", priority: "low", title: `${j.customer} is booked in on ${fmtDate(dateOf(j.due))}`,
        body: `${j.customer} is bringing in the ${j.vehicle} for ${j.service.toLowerCase()} at ${j.branch}. ${j.technician} is assigned. Check the parts are in stock before the day.` });
    else if (late)
      out.push({ ...base, id: `${id}-late`, from: "Workshop Scheduler", at: at(today.getTime(), id), reason: "Past due date", tone: "red", priority: "high", title: `${j.id} is ${-left} day${left === -1 ? "" : "s"} overdue`,
        body: `${j.service} on the ${j.vehicle} was due on ${fmtDate(dateOf(j.due))} and is still at "${j.status}". Please check with ${j.technician} and update ${j.customer}.` });
  }

  for (const s of db.sales || []) {
    const base = {
      link: { key: "sales", id: s.id },
      details: [["Sales order", s.id], ["Customer", s.customer], ["Vehicle", s.vehicle], ["Amount", money(s.amount)], ["Stage", s.status], ["Payment", s.payment], ["Consultant", s.consultant], ["Order date", fmtDate(dateOf(s.date))]],
    };
    const id = `sale-${s.id}-${s.status}-${s.payment}`, when = at(dateOf(s.date).getTime(), id);
    if (s.payment === "Overdue")
      out.push({ ...base, id, from: "Mei Chen", at: ago(id, 1), reason: "Payment overdue", tone: "red", priority: "high", title: `Payment overdue on ${s.id}`,
        body: `The invoice for ${s.customer}'s ${s.vehicle} (${money(s.amount)}) is past its due date. I've sent a reminder. ${s.consultant}, could you check whether there's anything holding up payment?` });
    else if (s.status === "Awaiting Approval")
      out.push({ ...base, id, from: s.consultant, at: when, reason: "Your approval needed", tone: "amber", priority: "high", title: `${s.id} needs your sign-off`,
        body: `${s.customer} has agreed terms on the ${s.vehicle} at ${money(s.amount)}. The order needs your approval before we can take payment and allocate the car.` });
    else if (s.status === "Awaiting Payment")
      out.push({ ...base, id, from: "Mei Chen", at: when, reason: "Payment pending", tone: "amber", priority: "normal", title: `Waiting for payment on ${s.id}`,
        body: `${s.payment === "Deposit Paid" ? "The deposit has been received; the balance" : "No payment has been received yet; the full amount"} for ${s.customer}'s ${s.vehicle} (${money(s.amount)}) is outstanding. Delivery can't be scheduled until it's paid.` });
    else if (s.status === "Delivery Prep")
      out.push({ ...base, id, from: s.consultant, at: when, reason: "Delivery preparation", tone: "blue", priority: "normal", title: `Prepare handover of ${s.vehicle}`,
        body: `${s.customer}'s ${s.vehicle} is in delivery prep (payment: ${s.payment.toLowerCase()}). Please make sure the pre-delivery inspection, registration and handover pack are ready.` });
    else if (["Enquiry", "Qualification"].includes(s.status))
      out.push({ ...base, id, from: s.consultant, at: when, reason: "New lead", tone: "blue", priority: "low", title: `New ${s.status.toLowerCase()} from ${s.customer}`,
        body: `${s.customer} is interested in the ${s.vehicle} (${money(s.amount)}). I'll follow up with a test drive and a quotation.` });
  }

  for (const p of db.parts || []) {
    if (!(p.qty < p.min)) continue;
    const reorder = Math.max(p.min * 2 - p.qty, p.min), id = `part-${p.id}-${p.qty}`;
    out.push({
      id, from: "Parts Desk", at: ago(id), link: { key: "parts", id: p.id },
      reason: p.qty ? "Low stock" : "Out of stock", tone: p.qty ? "amber" : "red", priority: p.qty ? "normal" : "high",
      title: `${p.name} ${p.qty ? `is down to ${p.qty}` : "is out of stock"}`,
      body: `${p.name} (${p.sku}) is below its minimum of ${p.min}. Suggested reorder: ${reorder} units from ${p.supplier}, about ${money(reorder * p.cost)} at current cost.`,
      details: [["Part", p.name], ["Part number", p.sku], ["In stock", String(p.qty)], ["Minimum", String(p.min)], ["Location", p.location], ["Supplier", p.supplier]],
    });
  }

  for (const w of db.warranties || []) {
    const base = { from: "Warranty Desk", link: { key: "warranties", id: w.id }, details: [["Warranty", w.id], ["Customer", w.customer], ["Vehicle", w.vehicle], ["Coverage", w.coverage], ["Expiry", fmtDate(dateOf(w.expiry))], ["Status", w.status]] };
    const id = `warranty-${w.id}-${w.status}`, left = daysFrom(w.expiry);
    if (w.status === "Expiring Soon")
      out.push({ ...base, id, at: ago(id), reason: "Warranty expiring", tone: "amber", priority: "normal", title: `${w.customer}'s warranty ends in ${left} day${left === 1 ? "" : "s"}`,
        body: `Coverage on the ${w.vehicle} (${w.coverage}) ends on ${fmtDate(dateOf(w.expiry))}. Offer ${w.customer} an extended warranty or a final inspection before it lapses.` });
    else if (w.status === "Claim Submitted")
      out.push({ ...base, id, at: ago(id), reason: "Claim submitted", tone: "blue", priority: "normal", title: `Warranty claim lodged for ${w.customer}`,
        body: `A claim on the ${w.vehicle} has been sent to the manufacturer. We're waiting for their decision; keep the related repair order on hold until it's approved.` });
    else if (w.status === "Rejected")
      out.push({ ...base, id, at: ago(id), reason: "Claim rejected", tone: "red", priority: "normal", title: `Warranty claim rejected for ${w.customer}`,
        body: `The manufacturer rejected the claim on the ${w.vehicle}. Let ${w.customer} know and send a quotation for the repair as customer-paid work.` });
  }

  for (const v of db.vehicles || []) {
    if (v.status !== "In Transit") continue;
    const id = `vehicle-${v.id}-${v.status}`;
    out.push({
      id, from: "Logistics", at: ago(id), link: { key: "vehicles", id: v.id }, reason: "Arriving soon", tone: "blue", priority: "low",
      title: `${v.brand} ${v.model} is on its way to ${v.branch}`,
      body: `Stock ${v.id} (${v.color}) is in transit. Book a pre-delivery inspection slot and a showroom space for when it arrives.`,
      details: [["Stock ID", v.id], ["Vehicle", `${v.year} ${v.brand} ${v.model}`], ["Colour", v.color], ["Branch", v.branch], ["VIN", v.vin]],
    });
  }

  return out.sort((a, b) => b.at - a.at);
}
