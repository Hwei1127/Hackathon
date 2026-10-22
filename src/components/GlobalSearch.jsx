/* ─────────────────────────────────────────────────────────────
   Top-bar search: pages, actions, filtered lists and records in one dropdown.
   Entries come from App (buildSearchIndex): { id, group, icon, title, sub, keys, kind, run, suggest }.
   Ctrl/⌘ K or "/" focuses it; ↑ ↓ to move, Enter to open, Esc to close.
   ───────────────────────────────────────────────────────────── */
import React, { useState, useEffect, useRef } from "react";
import Icon from "./Icon.jsx";

const norm = (s) => String(s ?? "").toLowerCase();
const LIMIT = { Pages: 4, Actions: 5, Lists: 5 }; // record groups show 4 each

function score(e, words, q) {
  if (!words.every((w) => e.hay.includes(w))) return 0;
  const t = norm(e.title);
  return t === q ? 4 : t.startsWith(q) ? 3 : t.includes(q) ? 2 : 1;
}

/** Grouped results for a query; an empty query shows pages and a few quick actions. */
function results(entries, query) {
  const q = norm(query).trim().replace(/\s+/g, " ");
  if (!q) return [
    { label: "Go to", items: entries.filter((e) => e.group === "Pages") },
    { label: "Quick actions", items: entries.filter((e) => e.suggest) },
  ];
  const words = q.split(" ");
  const scored = entries.map((e) => [e, score(e, words, q)]).filter(([, s]) => s).sort((a, b) => b[1] - a[1]);
  // groups keep their usual order, except a group whose best hit matches the title better comes first
  return [...new Set(entries.map((e) => e.group))]
    .map((label) => {
      const hits = scored.filter(([e]) => e.group === label).slice(0, LIMIT[label] || 4);
      return { label, best: hits[0]?.[1] || 0, items: hits.map(([e]) => e) };
    })
    .filter((g) => g.items.length)
    .sort((a, b) => b.best - a.best);
}

/* the first word of the query, highlighted in the title */
function Mark({ text, query }) {
  const w = norm(query).trim().split(/\s+/)[0];
  const i = w ? norm(text).indexOf(w) : -1;
  if (i < 0) return text;
  return <>{text.slice(0, i)}<mark>{text.slice(i, i + w.length)}</mark>{text.slice(i + w.length)}</>;
}

export default function GlobalSearch({ entries }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(0);
  const input = useRef(null), list = useRef(null);
  const indexed = entries.map((e) => ({ ...e, hay: norm([e.title, e.sub, e.keys].join(" ")) }));
  const groups = results(indexed, q);
  const flat = groups.flatMap((g) => g.items);

  useEffect(() => {
    const onKey = (e) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
      if ((e.key.toLowerCase() === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        input.current.focus();
        input.current.select();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => setSel(0), [q]);
  useEffect(() => { list.current?.querySelector(".sr-item.on")?.scrollIntoView({ block: "nearest" }); }, [sel, open]);

  const close = () => { setOpen(false); input.current.blur(); };
  const run = (item) => { setQ(""); close(); item.run(); };
  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setSel((i) => Math.min(flat.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((i) => Math.max(0, i - 1)); }
    else if (e.key === "Enter" && open && flat[sel]) { e.preventDefault(); run(flat[sel]); }
    else if (e.key === "Escape") { e.preventDefault(); q ? setQ("") : close(); }
  };

  return (
    <div className="top-search">
      <span className="si"><Icon n="search" s={14} /></span>
      <input ref={input} value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onKeyDown={onKeyDown}
        placeholder="Search pages, records, actions…" aria-label="Search" role="combobox" aria-expanded={open} aria-controls="gs-list"
        aria-activedescendant={open && flat[sel] ? `gs-${sel}` : undefined} autoComplete="off" spellCheck={false} />
      {!q && <kbd className="si-kbd">Ctrl K</kbd>}
      {open && (
        // mousedown keeps focus in the input, so a click lands before the blur closes the list
        <div className="search-pop" onMouseDown={(e) => e.preventDefault()}>
          <div className="sr-list" id="gs-list" role="listbox" ref={list}>
            {flat.length ? groups.map((g) => (
              <div key={g.label} role="group" aria-label={g.label}>
                <div className="sr-group">{g.label}</div>
                {g.items.map((it) => {
                  const i = flat.indexOf(it);
                  return (
                    <button key={it.id} id={`gs-${i}`} role="option" aria-selected={i === sel} tabIndex={-1} className={`sr-item${i === sel ? " on" : ""}`} onMouseMove={() => i !== sel && setSel(i)} onClick={() => run(it)}>
                      <span className="sr-ic"><Icon n={it.icon} s={14} /></span>
                      <span className="sr-text"><b><Mark text={it.title} query={q} /></b>{it.sub && <small>{it.sub}</small>}</span>
                      <span className="sr-kind">{it.kind}</span>
                    </button>
                  );
                })}
              </div>
            )) : (
              <div className="sr-empty"><Icon n="search" s={20} /><b>No matches for “{q.trim()}”</b>Try a stock ID, VIN, customer, part number, status or page name.</div>
            )}
          </div>
          <div className="sr-foot"><span><kbd>↑</kbd><kbd>↓</kbd>move</span><span><kbd>↵</kbd>open</span><span><kbd>esc</kbd>close</span></div>
        </div>
      )}
    </div>
  );
}
