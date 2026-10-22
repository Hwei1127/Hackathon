/* ─────────────────────────────────────────────────────────────
   Signed-in user and workspace:
   - AccountMenu: top-right avatar menu (profile, switch user, shortcuts, administration, sign out)
   - WorkspaceSwitcher: sidebar card that picks the branch the app works in
   - SignInScreen: shown after signing out (demo workspace: choose an account, no password)
   The user is kept in this browser (localStorage).
   ───────────────────────────────────────────────────────────── */
import React, { useState, useEffect, useRef } from "react";
import Icon, { Logo } from "./Icon.jsx";
import { STAFF } from "../data/staff.js";

const USER_KEY = "autocore-user-v1";
export const loadUser = () => { try { return { ...STAFF[0], ...JSON.parse(localStorage.getItem(USER_KEY) || "{}") }; } catch { return { ...STAFF[0] }; } };
export const saveUser = (u) => { try { localStorage.setItem(USER_KEY, JSON.stringify(u)); } catch {} };

const AV_COLORS = ["#f6b26b", "#8fd6ae", "#a59cff", "#7cb7ff", "#f2939b"];
export const initials = (name = "") => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
const avColor = (name) => AV_COLORS[[...name].reduce((h, c) => h + c.charCodeAt(0), 0) % AV_COLORS.length];
const StaffAv = ({ p, size = 30 }) => <span className="ag-av" style={{ width: size, height: size, background: avColor(p.name) }}>{initials(p.name)}</span>;

/* open state for a popover that closes on outside click or Esc */
function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const down = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    const key = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [open]);
  return [open, setOpen, ref];
}

function Dialog({ title, onClose, children, foot }) {
  useEffect(() => {
    const key = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, []);
  return (
    <div className="modal-backdrop open" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="acctTitle" style={{ width: "min(520px,100%)" }}>
        <div className="modal-head"><h2 id="acctTitle">{title}</h2><button className="close" onClick={onClose} aria-label="Close">×</button></div>
        {children}
        {foot && <div className="modal-foot">{foot}</div>}
      </section>
    </div>
  );
}

function ProfileDialog({ user, branches, onSave, onClose }) {
  const [f, setF] = useState({ name: user.name, email: user.email, phone: user.phone, branch: user.branch });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = (e) => { e.preventDefault(); onSave({ ...f, name: f.name.trim() || user.name, email: f.email.trim(), phone: f.phone.trim() }); };
  return (
    <Dialog title="My profile" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="modal-body">
          <div className="acct-hero"><span className="avatar lg">{initials(f.name)}</span><div><b>{f.name || user.name}</b><small>{user.role} · {f.branch}</small></div></div>
          <div className="form-grid" style={{ marginTop: 16 }}>
            <div className="field full"><label>Full name *</label><input value={f.name} onChange={set("name")} required autoFocus /></div>
            <div className="field"><label>Email</label><input type="email" value={f.email} onChange={set("email")} /></div>
            <div className="field"><label>Phone</label><input value={f.phone} onChange={set("phone")} /></div>
            <div className="field"><label>Role</label><input value={user.role} disabled title="Roles are set in Administration" /></div>
            <div className="field"><label>Home branch</label><select value={f.branch} onChange={set("branch")}><option>All branches</option>{branches.map((b) => <option key={b}>{b}</option>)}</select></div>
          </div>
          <p className="page-note" style={{ margin: "14px 0 0" }}>Your home branch is the workspace you start in after signing in. Roles are managed in Administration.</p>
        </div>
        <div className="modal-foot"><button type="button" className="btn" onClick={onClose}>Cancel</button><button type="submit" className="btn primary">Save profile</button></div>
      </form>
    </Dialog>
  );
}

// [alternative key combinations, what they do]
const SHORTCUTS = [[[["Ctrl", "K"], ["/"]], "Search pages, records and actions"], [[["↑"], ["↓"]], "Move through search results"], [[["Enter"]], "Open the selected result"], [[["Esc"]], "Close a menu, panel or window"]];
const ShortcutsDialog = ({ onClose }) => (
  <Dialog title="Keyboard shortcuts" onClose={onClose} foot={<button className="btn" onClick={onClose}>Close</button>}>
    <div className="modal-body"><div className="kbd-list">
      {SHORTCUTS.map(([combos, what]) => (
        <div key={what}>
          <span>{combos.map((keys, i) => <React.Fragment key={i}>{i > 0 && <em>or</em>}{keys.map((k) => <kbd key={k}>{k}</kbd>)}</React.Fragment>)}</span>{what}
        </div>
      ))}
    </div></div>
  </Dialog>
);

export function AccountMenu({ user, setUser, workspace, setWorkspace, branches, go, toast }) {
  const [open, setOpen, ref] = usePopover();
  const [switching, setSwitching] = useState(false);
  const [dialog, setDialog] = useState(null); // "profile" | "shortcuts"
  useEffect(() => { if (!open) setSwitching(false); }, [open]);
  const act = (fn) => () => { setOpen(false); fn(); };
  const switchTo = (p) => {
    setUser({ ...p, signedOut: false });
    setWorkspace(p.branch);
    setOpen(false);
    toast(`Signed in as ${p.name} (${p.role}).`);
  };
  return (
    <div className="acct-wrap" ref={ref}>
      <button className={`acct-btn${open ? " on" : ""}`} onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-label={`Account: ${user.name}`}>
        <span className="avatar">{initials(user.name)}</span>
        <span className="user">{user.name}<small>{user.role}</small></span>
        <span className="acct-chev"><Icon n="chevron" s={13} /></span>
      </button>
      {open && (
        <div className="acct-pop" role="menu">
          <div className="acct-head">
            <span className="avatar lg">{initials(user.name)}</span>
            <div><b>{user.name}</b><small>{user.role}</small><small>{user.email}</small></div>
          </div>
          <div className="acct-ws"><Icon n="home" s={13} />Working in <b>{workspace === "All branches" ? "all branches" : workspace}</b></div>
          {switching ? (
            <div className="acct-list">
              <button className="acct-item back" onClick={() => setSwitching(false)}><Icon n="left" s={13} w={2.2} />Switch user</button>
              {STAFF.map((p) => (
                <button key={p.email} className={`acct-person${p.email === user.email ? " cur" : ""}`} role="menuitemradio" aria-checked={p.email === user.email} onClick={() => (p.email === user.email ? setOpen(false) : switchTo(p))}>
                  <StaffAv p={p} /><span><b>{p.name}</b><small>{p.role} · {p.branch}</small></span>{p.email === user.email && <Icon n="check" s={14} />}
                </button>
              ))}
            </div>
          ) : (
            <div className="acct-list">
              <button className="acct-item" role="menuitem" onClick={act(() => setDialog("profile"))}><Icon n="users" s={14} />My profile</button>
              <button className="acct-item" role="menuitem" onClick={() => setSwitching(true)}><Icon n="spin" s={14} />Switch user<span className="acct-r"><Icon n="right" s={12} /></span></button>
              <button className="acct-item" role="menuitem" onClick={act(() => setDialog("shortcuts"))}><Icon n="key" s={14} />Keyboard shortcuts<span className="acct-r"><kbd>Ctrl</kbd><kbd>K</kbd></span></button>
              <button className="acct-item" role="menuitem" onClick={act(() => go("settings"))}><Icon n="settings" s={14} />Administration</button>
              <div className="acct-sep" />
              <button className="acct-item danger" role="menuitem" onClick={act(() => setUser({ ...user, signedOut: true }))}><Icon n="arrow" s={14} />Sign out</button>
            </div>
          )}
        </div>
      )}
      {dialog === "profile" && <ProfileDialog user={user} branches={branches} onClose={() => setDialog(null)} onSave={(f) => { setUser({ ...user, ...f }); setDialog(null); toast("Profile updated."); }} />}
      {dialog === "shortcuts" && <ShortcutsDialog onClose={() => setDialog(null)} />}
    </div>
  );
}

export function WorkspaceSwitcher({ workspace, setWorkspace, branches, db, go }) {
  const [open, setOpen, ref] = usePopover();
  const count = (b) => {
    const here = (r) => b === "All branches" || r.branch === b;
    return { vehicles: db.vehicles.filter((v) => here(v) && !["Sold", "Delivered"].includes(v.status)).length, jobs: db.jobs.filter((j) => here(j) && j.status !== "Completed").length };
  };
  const options = ["All branches", ...branches];
  const cur = count(workspace);
  return (
    <div className="ws-wrap" ref={ref}>
      {open && (
        <div className="ws-pop" role="menu">
          <div className="ws-title">Switch workspace</div>
          {options.map((b) => {
            const c = count(b), all = b === "All branches";
            return (
              <button key={b} className={`ws-opt${workspace === b ? " cur" : ""}`} role="menuitemradio" aria-checked={workspace === b} onClick={() => { setWorkspace(b); setOpen(false); }}>
                <span className="branch-icon"><Icon n={all ? "home" : "pin"} s={14} /></span>
                <span><b>{all ? "AutoCore Group" : b}</b><small>{all ? `${branches.length} branches · ` : ""}{c.vehicles} in stock · {c.jobs} open jobs</small></span>
                {workspace === b && <Icon n="check" s={14} />}
              </button>
            );
          })}
          <div className="acct-sep" />
          <button className="acct-item" onClick={() => { setOpen(false); go("settings"); }}><Icon n="settings" s={14} />Branch settings</button>
        </div>
      )}
      <button className={`branch-mini${open ? " on" : ""}`} onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-label="Switch workspace">
        <div className="branch-icon"><Icon n={workspace === "All branches" ? "home" : "pin"} s={15} /></div>
        <div><b>{workspace === "All branches" ? "AutoCore Group" : workspace}</b><small>{workspace === "All branches" ? `${branches.length} active branches` : `${cur.vehicles} in stock · ${cur.jobs} open jobs`}</small></div>
        <span className="ws-chev"><Icon n="chevron" s={14} /></span>
      </button>
    </div>
  );
}

export function SignInScreen({ onSignIn }) {
  return (
    <div className="signin">
      <div className="signin-card">
        <div className="logo"><Logo /></div>
        <h1>You've signed out</h1>
        <p>Choose an account to sign back in to AutoCore.</p>
        <div className="signin-list">
          {STAFF.map((p) => (
            <button key={p.email} className="acct-person" onClick={() => onSignIn(p)}>
              <StaffAv p={p} size={34} /><span><b>{p.name}</b><small>{p.role} · {p.branch}</small></span><Icon n="arrow" s={13} />
            </button>
          ))}
        </div>
        <small className="signin-note">Demo workspace: no password is needed.</small>
      </div>
    </div>
  );
}
