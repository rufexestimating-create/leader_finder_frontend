"use client";

import React, { useState } from "react";

/** Plain HTML/CSS charts for the dashboard. Every chart has a table view, and hover and keyboard focus show the same
 * tooltip. Colors come from the --viz-* tokens (validated categorical slots, light and dark). */

export type Point = { label: string; value: number; tip?: string };

const fmt = (n: number) => n.toLocaleString();

function niceMax(max: number): number {
  if (max <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(max));
  const step = [1, 2, 2.5, 5, 10].map((s) => s * pow).find((s) => s * 4 >= max) ?? pow * 10;
  return step * 4;
}

export function ChartCard({ title, sub, rows, children }: { title: string; sub?: string; rows: [string, number][]; children: React.ReactNode }) {
  const [table, setTable] = useState(false);
  return (
    <section className="card viz-card">
      <div className="viz-card-head">
        <div>
          <h4>{title}</h4>
          {sub && <p>{sub}</p>}
        </div>
        <button type="button" className="viz-toggle" aria-pressed={table} onClick={() => setTable((t) => !t)}>{table ? "Chart" : "Table"}</button>
      </div>
      {table ? (
        <table className="viz-table">
          <thead><tr><th scope="col">{title}</th><th scope="col">Count</th></tr></thead>
          <tbody>{rows.map(([k, v]) => <tr key={k}><td>{k}</td><td>{fmt(v)}</td></tr>)}</tbody>
        </table>
      ) : children}
    </section>
  );
}

/** One series over time: columns on a single baseline, the highest one labeled */
export function ColumnChart({ points, unit }: { points: Point[]; unit: string }) {
  const max = Math.max(0, ...points.map((p) => p.value));
  if (!max) return <p className="viz-empty">Nothing in this period yet.</p>;
  const top = niceMax(max);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(top * f));
  const peak = points.findIndex((p) => p.value === max);
  const every = Math.ceil(points.length / 7);
  return (
    <div role="img" aria-label={`${unit} per day: ${points.map((p) => `${p.label} ${p.value}`).join(", ")}`}>
      <div className="viz-cols">
        {ticks.map((t) => (
          <div key={t} className={`viz-grid${t === 0 ? " is-base" : ""}`} style={{ bottom: `${(t / top) * 100}%` }}><span>{fmt(t)}</span></div>
        ))}
        <div className="viz-cols-row">
          {points.map((p, i) => (
            <div key={p.label} className="viz-col" tabIndex={0} data-tip={p.tip ?? `${p.label}: ${fmt(p.value)} ${unit}`}>
              {p.value > 0 && <i style={{ height: `${(p.value / top) * 100}%` }} />}
              {i === peak && <b style={{ bottom: `${(p.value / top) * 100}%` }}>{fmt(p.value)}</b>}
            </div>
          ))}
        </div>
      </div>
      <div className="viz-xaxis" aria-hidden="true">
        {points.map((p, i) => <span key={p.label}>{i % every === 0 || i === points.length - 1 ? p.label : ""}</span>)}
      </div>
    </div>
  );
}

/** One whole split into at most 5 parts, read at a glance. Values print inside only where they fit. */
export function SegmentedBar({ parts }: { parts: { label: string; value: number }[] }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  if (!total) return <p className="viz-empty">No companies yet.</p>;
  const light = new Set([4]); // slot 4 (yellow) takes near-black text
  return (
    <>
      <div className="viz-seg" role="img" aria-label={parts.map((p) => `${p.label} ${p.value}`).join(", ")}>
        {parts.map((p, i) =>
          p.value > 0 ? (
            <span key={p.label} tabIndex={0} className={light.has(i + 1) ? "on-light" : undefined}
              style={{ flexGrow: p.value, background: `var(--viz-${i + 1})` }}
              data-tip={`${p.label}: ${fmt(p.value)} (${Math.round((p.value / total) * 100)}%)`}>
              {p.value / total >= 0.12 ? `${Math.round((p.value / total) * 100)}%` : ""}
            </span>
          ) : null,
        )}
      </div>
      <ul className="viz-legend">
        {parts.map((p, i) => (
          <li key={p.label}><i style={{ background: `var(--viz-${i + 1})` }} aria-hidden="true" />{p.label} <b>{fmt(p.value)}</b></li>
        ))}
      </ul>
    </>
  );
}

/** Parts compared with each other: largest first, one hue, value at the tip */
export function RankedBars({ items, unit }: { items: { label: string; value: number }[]; unit: string }) {
  const max = Math.max(0, ...items.map((i) => i.value));
  if (!max) return <p className="viz-empty">Nothing to show yet.</p>;
  return (
    <ul className="viz-bars">
      {[...items].sort((a, b) => b.value - a.value).map((it) => (
        <li key={it.label}>
          <span title={it.label}>{it.label}</span>
          <span className="viz-bar-track">
            {it.value > 0 && <i tabIndex={0} style={{ width: `${(it.value / max) * 85}%` }} data-tip={`${it.label}: ${fmt(it.value)} ${unit}`} />}
            <b>{fmt(it.value)}</b>
          </span>
        </li>
      ))}
    </ul>
  );
}
