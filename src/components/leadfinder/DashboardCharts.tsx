"use client";

import React, { useId, useState } from "react";

/** Plain HTML/SVG charts for the dashboard. Every chart has a table view, and hover and keyboard focus show the same
 * readout. Colors come from the --viz-* tokens (validated categorical slots, light and dark). */

export type Point = { label: string; value: number; tip?: string };
export type Part = { label: string; value: number };

const fmt = (n: number) => n.toLocaleString();
const pct = (v: number, total: number) => (total ? Math.round((v / total) * 100) : 0);

function niceMax(max: number): number {
  if (max <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(max));
  const step = [1, 2, 2.5, 5, 10].map((s) => s * pow).find((s) => s * 4 >= max) ?? pow * 10;
  return step * 4;
}

export function ChartCard({ title, sub, icon, rows, className, children }: {
  title: string; sub?: string; icon?: React.ReactNode; rows: [string, number][]; className?: string; children: React.ReactNode;
}) {
  const [table, setTable] = useState(false);
  return (
    <section className={`card viz-card${className ? ` ${className}` : ""}`}>
      <div className="viz-card-head">
        <div className="viz-card-title">
          {icon && <span className="viz-card-icon" aria-hidden="true">{icon}</span>}
          <div>
            <h4>{title}</h4>
            {sub && <p>{sub}</p>}
          </div>
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

/** One series over time: a 2px line over a soft fill, crosshair and readout on hover, the peak labeled */
export function AreaChart({ points, unit, slot = 1 }: { points: Point[]; unit: string; slot?: number }) {
  const gid = useId().replace(/:/g, "");
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(0, ...points.map((p) => p.value));
  if (!max) return <p className="viz-empty">Nothing in this period yet.</p>;
  const top = niceMax(max);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(top * f));
  const n = points.length;
  const x = (i: number) => (n === 1 ? 50 : (i / (n - 1)) * 100);
  const y = (v: number) => 100 - (v / top) * 100;
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.value)}`).join(" ");
  const area = `${line} L100,100 L0,100 Z`;
  const peak = points.findIndex((p) => p.value === max);
  const every = Math.ceil(n / 7);
  const color = `var(--viz-${slot})`;
  const shown = hover ?? null;

  return (
    <div role="img" aria-label={`${unit} per day: ${points.map((p) => `${p.label} ${p.value}`).join(", ")}`}>
      <div className="viz-area" onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <div key={t} className={`viz-grid${t === 0 ? " is-base" : ""}`} style={{ bottom: `${(t / top) * 100}%` }}><span>{fmt(t)}</span></div>
        ))}
        <svg className="viz-area-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id={`g${gid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.28" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#g${gid})`} />
          <path d={line} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
        <span className="viz-area-peak" style={{ left: `${x(peak)}%`, bottom: `${100 - y(max)}%` }}>{fmt(max)}</span>
        {shown !== null && (
          <>
            <span className="viz-cross" style={{ left: `${x(shown)}%` }} aria-hidden="true" />
            <span className="viz-area-dot" style={{ left: `${x(shown)}%`, bottom: `${100 - y(points[shown].value)}%`, background: color }} aria-hidden="true" />
            <span className={`viz-readout${x(shown) > 70 ? " is-left" : ""}`} style={{ left: `${x(shown)}%` }}>
              <b>{fmt(points[shown].value)} {unit}</b>{points[shown].label}
            </span>
          </>
        )}
        <div className="viz-hits">
          {points.map((p, i) => (
            <span key={p.label} tabIndex={0} aria-label={`${p.label}: ${p.value} ${unit}`}
              onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} />
          ))}
        </div>
      </div>
      <div className="viz-xaxis viz-xaxis--area" aria-hidden="true">
        {points.map((p, i) => (i % every === 0 || i === n - 1)
          ? <span key={p.label} style={{ left: `${x(i)}%` }}>{p.label}</span>
          : null)}
      </div>
    </div>
  );
}

/** Part of a whole, at most 5 parts: a donut with the total in the middle; hover a slice to read it there */
export function Donut({ parts, unit, centerLabel }: { parts: Part[]; unit: string; centerLabel?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const total = parts.reduce((s, p) => s + p.value, 0);
  if (!total) return <p className="viz-empty">Nothing to show yet.</p>;
  const r = 46;
  const C = 2 * Math.PI * r;
  const live = parts.filter((p) => p.value > 0).length;
  const gap = live > 1 ? 1.6 : 0;
  const lens = parts.map((p) => (p.value / total) * C);
  const slices = parts.map((p, i) => ({
    i, p, len: Math.max(0, lens[i] - gap), off: -lens.slice(0, i).reduce((s, l) => s + l, 0),
  }));
  const cur = hover !== null ? parts[hover] : null;

  return (
    <div className="viz-donut-wrap">
      <div className="viz-donut" role="img" aria-label={parts.map((p) => `${p.label} ${p.value}`).join(", ")} onMouseLeave={() => setHover(null)}>
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <circle cx="60" cy="60" r={r} fill="none" stroke="var(--surface-3)" strokeWidth="14" />
          {slices.map((s) => s.p.value > 0 && (
            <circle key={s.p.label} cx="60" cy="60" r={r} fill="none"
              stroke={`var(--viz-${s.i + 1})`} strokeWidth={hover === s.i ? 17 : 14}
              strokeDasharray={`${s.len} ${C}`} strokeDashoffset={s.off}
              className={hover !== null && hover !== s.i ? "is-dim" : undefined}
              onMouseEnter={() => setHover(s.i)} />
          ))}
        </svg>
        <div className="viz-donut-center">
          <strong>{fmt(cur ? cur.value : total)}</strong>
          <span>{cur ? `${cur.label} · ${pct(cur.value, total)}%` : centerLabel ?? `total ${unit}`}</span>
        </div>
      </div>
      <ul className="viz-donut-legend">
        {parts.map((p, i) => (
          <li key={p.label} tabIndex={0} className={hover === i ? "is-on" : undefined}
            onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}>
            <i style={{ background: `var(--viz-${i + 1})` }} aria-hidden="true" />
            <span>{p.label}</span>
            <b>{fmt(p.value)}</b>
            <em>{pct(p.value, total)}%</em>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Ordered steps that narrow: each bar sized to the first, with the share kept from the step before */
export function Funnel({ steps }: { steps: Part[] }) {
  const first = steps[0]?.value ?? 0;
  if (!first) return <p className="viz-empty">Run an agent to see its pipeline.</p>;
  return (
    <ol className="viz-funnel">
      {steps.map((s, i) => (
        <li key={s.label}>
          <div className="viz-funnel-top">
            <span>{s.label}</span>
            <b>{fmt(s.value)}</b>
          </div>
          <span className="viz-funnel-track">
            <i style={{ width: `${Math.max(2, (s.value / first) * 100)}%`, opacity: 1 - i * 0.18 }} tabIndex={0}
              data-tip={`${s.label}: ${fmt(s.value)}${i ? ` (${pct(s.value, steps[i - 1].value)}% of the step before)` : ""}`} />
          </span>
          {i > 0 && <em className="viz-funnel-rate">{pct(s.value, steps[i - 1].value)}% of {steps[i - 1].label.toLowerCase()}</em>}
        </li>
      ))}
    </ol>
  );
}

/** Tiny trend line for a stat tile; decorative, the tile's number carries the value */
export function Sparkline({ values, slot = 1 }: { values: number[]; slot?: number }) {
  const gid = useId().replace(/:/g, "");
  const max = Math.max(1, ...values);
  const n = values.length;
  if (n < 2) return null;
  const pts = values.map((v, i) => `${(i / (n - 1)) * 100},${34 - (v / max) * 30}`);
  const line = `M${pts.join(" L")}`;
  const color = `var(--viz-${slot})`;
  return (
    <svg className="viz-spark" viewBox="0 0 100 36" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={`s${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L100,36 L0,36 Z`} fill={`url(#s${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

/** Parts compared with each other: largest first, one hue, value at the tip */
export function RankedBars({ items, unit, slot = 1 }: { items: Part[]; unit: string; slot?: number }) {
  const max = Math.max(0, ...items.map((i) => i.value));
  if (!max) return <p className="viz-empty">Nothing to show yet.</p>;
  return (
    <ul className="viz-bars">
      {[...items].sort((a, b) => b.value - a.value).map((it) => (
        <li key={it.label}>
          <span title={it.label}>{it.label}</span>
          <span className="viz-bar-track">
            {it.value > 0 && <i tabIndex={0} style={{ width: `${(it.value / max) * 85}%`, background: `var(--viz-${slot})` }} data-tip={`${it.label}: ${fmt(it.value)} ${unit}`} />}
            <b>{fmt(it.value)}</b>
          </span>
        </li>
      ))}
    </ul>
  );
}
