/* ─────────────────────────────────────────────────────────────
   Bell menu: notifications from lib/notifications.js, with read/unread, dismiss and "remind me later".
   Read, dismissed and reminder state is kept in this browser (localStorage), per notification id.
   A reminder brings the notification back as unread when it's due, with a toast.
   ───────────────────────────────────────────────────────────── */
import React, { useState, useEffect, useMemo, useRef } from "react";
import Icon from "./Icon.jsx";
import { buildNotifications, senderInfo } from "../lib/notifications.js";

const KEY = "autocore-notifications-v1";
const EMPTY = { read: {}, dismissed: {}, snoozed: {} };
const load = () => { try { return { ...EMPTY, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch { return EMPTY; } };
const AV_COLORS = ["#f6b26b", "#8fd6ae", "#a59cff", "#7cb7ff", "#f2939b"];
const initials = (name) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
const avColor = (name) => AV_COLORS[[...name].reduce((h, c) => h + c.charCodeAt(0), 0) % AV_COLORS.length];

const clock = (t) => new Date(t).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true });
function when(t, now) {
  const mins = Math.round((now - t) / 60000), d = new Date(t), today = new Date(now);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  if (d.toDateString() === today.toDateString()) return `Today, ${clock(t)}`;
  if (d.toDateString() === new Date(now - 864e5).toDateString()) return `Yesterday, ${clock(t)}`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) + `, ${clock(t)}`;
}
const shortTime = (t) => new Date(t).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });
const fullTime = (t) => new Date(t).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
function remindOptions(now) {
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(9, 0, 0, 0);
  const monday = new Date(now); monday.setDate(monday.getDate() + ((8 - monday.getDay()) % 7 || 7)); monday.setHours(9, 0, 0, 0);
  return [["In 1 hour", now + 36e5], ["In 3 hours", now + 3 * 36e5], ["Tomorrow, 9 AM", tomorrow.getTime()], ["Next Monday, 9 AM", monday.getTime()]];
}

function Avatar({ name, size = 34 }) {
  const s = senderInfo(name);
  return s.system
    ? <span className="nt-av sys" style={{ width: size, height: size }}><Icon n={s.icon} s={size * 0.45} /></span>
    : <span className="nt-av" style={{ width: size, height: size, background: avColor(name) }}>{initials(name)}</span>;
}

export default function Notifications({ db, onOpen, toast }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("all");
  const [viewId, setViewId] = useState(null);
  const [remindOpen, setRemindOpen] = useState(false);
  const [store, setStore] = useState(load);
  const [now, setNow] = useState(Date.now);
  const wrap = useRef(null);

  const all = useMemo(() => buildNotifications(db), [db]);
  const save = (fn) => setStore((s) => { const next = fn(s); try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {} return next; });
  const without = (obj, id) => { const { [id]: _, ...rest } = obj; return rest; };

  // tick every 30s so reminders come due while the app is open
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);
  useEffect(() => {
    const due = all.filter((n) => store.snoozed[n.id] && store.snoozed[n.id] <= now && !store.dismissed[n.id]);
    if (!due.length) return;
    save((s) => ({ ...s, snoozed: due.reduce((m, n) => without(m, n.id), s.snoozed), read: due.reduce((m, n) => without(m, n.id), s.read) }));
    toast(due.length === 1 ? `Reminder from ${due[0].from}: ${due[0].title}` : `${due.length} reminders are due. Open the bell to see them.`);
  }, [now, all]);

  // close on outside click or Esc
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => wrap.current && !wrap.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === "Escape" && (viewId ? setViewId(null) : setOpen(false));
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open, viewId]);
  useEffect(() => setRemindOpen(false), [viewId, open]);

  const live = all.filter((n) => !store.dismissed[n.id]);
  const visible = live.filter((n) => !(store.snoozed[n.id] > now));
  const unread = visible.filter((n) => !store.read[n.id]);
  const snoozed = live.filter((n) => store.snoozed[n.id] > now).sort((a, b) => store.snoozed[a.id] - store.snoozed[b.id]);
  const list = tab === "unread" ? unread : tab === "snoozed" ? snoozed : visible;
  const view = viewId && all.find((n) => n.id === viewId);

  const show = (n) => { setViewId(n.id); save((s) => ({ ...s, read: { ...s.read, [n.id]: true } })); };
  const markAll = () => save((s) => ({ ...s, read: { ...s.read, ...Object.fromEntries(visible.map((n) => [n.id, true])) } }));
  const markUnread = (n) => { save((s) => ({ ...s, read: without(s.read, n.id) })); setViewId(null); };
  const dismiss = (n) => { save((s) => ({ ...s, dismissed: { ...s.dismissed, [n.id]: true }, snoozed: without(s.snoozed, n.id) })); setViewId(null); toast("Notification dismissed."); };
  const remind = (n, label, t) => { save((s) => ({ ...s, snoozed: { ...s.snoozed, [n.id]: t } })); setViewId(null); toast(`Reminder set: ${label.toLowerCase()}.`); };
  const cancelRemind = (n) => save((s) => ({ ...s, snoozed: without(s.snoozed, n.id) }));
  const openRecord = (n) => { setOpen(false); onOpen(n.link); };

  const count = unread.length;
  return (
    <div className="nt-wrap" ref={wrap}>
      <button className={`icon-btn${open ? " on" : ""}`} onClick={() => { setOpen((o) => !o); setViewId(null); }} aria-label={`Notifications, ${count} unread`} aria-expanded={open} title="Notifications">
        <Icon n="bell" s={16} />{count > 0 && <span className="nt-badge">{count > 9 ? "9+" : count}</span>}
      </button>
      {open && (
        <div className="nt-pop" role="dialog" aria-label="Notifications">
          {view ? (
            <div className="nt-detail">
              <div className="nt-dhead">
                <button className="nt-back" onClick={() => setViewId(null)} aria-label="Back to notifications"><Icon n="left" s={13} w={2.2} />Back</button>
                <span className={`nt-reason t-${view.tone}`}>{view.reason}</span>
              </div>
              <div className="nt-body">
                <div className="nt-sender">
                  <Avatar name={view.from} size={40} />
                  <div><b>{view.from}</b><small>{senderInfo(view.from).role}</small></div>
                  {view.priority === "high" && <span className="nt-urgent">Urgent</span>}
                </div>
                <h4>{view.title}</h4>
                <p className="nt-msg">{view.body}</p>
                <dl className="nt-facts">
                  <div><dt>From</dt><dd>{view.from}</dd></div>
                  <div><dt>Reason</dt><dd>{view.reason}</dd></div>
                  <div><dt>Received</dt><dd>{fullTime(view.at)}</dd></div>
                  <div><dt>Priority</dt><dd className={`p-${view.priority}`}>{view.priority[0].toUpperCase() + view.priority.slice(1)}</dd></div>
                  {view.details.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
                </dl>
                {store.snoozed[view.id] > now && (
                  <div className="nt-remind-note"><Icon n="clock" s={13} />Reminder set for {fullTime(store.snoozed[view.id])}<button className="link-btn" onClick={() => cancelRemind(view)}>Cancel</button></div>
                )}
              </div>
              <div className="nt-actions">
                <button className="btn primary" onClick={() => openRecord(view)}>Open record <Icon n="arrow" s={12} /></button>
                <div className="nt-remind">
                  <button className="btn" onClick={() => setRemindOpen((o) => !o)} aria-expanded={remindOpen}><Icon n="clock" s={13} />Remind me</button>
                  {remindOpen && (
                    <div className="nt-menu" role="menu">
                      {remindOptions(Date.now()).map(([label, t]) => <button key={label} role="menuitem" onClick={() => remind(view, label, t)}>{label}<small>{shortTime(t)}</small></button>)}
                    </div>
                  )}
                </div>
                <button className="mini-btn" onClick={() => markUnread(view)}>Mark unread</button>
                <button className="mini-btn danger" onClick={() => dismiss(view)}><Icon n="trash" s={11} />Dismiss</button>
              </div>
            </div>
          ) : (
            <>
              <div className="nt-head">
                <div><b>Notifications</b><small>{count ? `${count} unread` : "You're all caught up"}</small></div>
                {count > 0 && <button className="link-btn" onClick={markAll}>Mark all as read</button>}
              </div>
              <div className="nt-tabs" role="tablist">
                {[["all", "All", visible.length], ["unread", "Unread", count], ["snoozed", "Reminders", snoozed.length]].map(([k, label, n]) => (
                  <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{label}<span>{n}</span></button>
                ))}
              </div>
              <div className="nt-list">
                {list.length ? list.map((n) => {
                  const isUnread = !store.read[n.id] && tab !== "snoozed";
                  return (
                    <button key={n.id} className={`nt-item${isUnread ? " unread" : ""}`} onClick={() => show(n)}>
                      <Avatar name={n.from} />
                      <span className="nt-main">
                        <span className="nt-top"><b>{n.from}</b><time>{tab === "snoozed" ? <><Icon n="clock" s={10} />{shortTime(store.snoozed[n.id])}</> : when(n.at, now)}</time></span>
                        <span className="nt-title">{n.title}</span>
                        <span className="nt-meta"><span className={`nt-reason t-${n.tone}`}>{n.reason}</span>{n.priority === "high" && <span className="nt-urgent">Urgent</span>}</span>
                      </span>
                      {isUnread && <i className="nt-dot" aria-label="Unread" />}
                    </button>
                  );
                }) : (
                  <div className="nt-empty"><Icon n={tab === "snoozed" ? "clock" : "check"} s={20} /><b>{tab === "snoozed" ? "No reminders set" : "Nothing new"}</b>{tab === "snoozed" ? "Open a notification and choose “Remind me” to bring it back later." : "New alerts from the workshop, sales, parts and warranty desks appear here."}</div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
