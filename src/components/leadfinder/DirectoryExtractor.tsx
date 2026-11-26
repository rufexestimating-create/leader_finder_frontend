"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Layers, Square, Terminal, Zap } from "lucide-react";

const EXTRACTOR_URL = process.env.NEXT_PUBLIC_EXTRACTOR_URL ?? "http://127.0.0.1:8000";

const PAGE_OPTS: { label: string; value: number | null }[] = [
  { label: "All", value: null },
  { label: "5", value: 5 },
  { label: "10", value: 10 },
  { label: "20", value: 20 },
  { label: "50", value: 50 },
  { label: "100", value: 100 },
];

type Stat = { total: number; with_website: number; with_email: number; with_phone: number; with_license: number };
const EMPTY: Stat = { total: 0, with_website: 0, with_email: 0, with_phone: 0, with_license: 0 };

export function DirectoryExtractor() {
  const [url, setUrl] = useState("");
  const [fast, setFast] = useState(true);
  const [maxPages, setMaxPages] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stats, setStats] = useState<Stat>(EMPTY);
  const [logs, setLogs] = useState<string[]>([]);
  const logOff = useRef(0);
  const pollId = useRef<ReturnType<typeof setInterval> | null>(null);
  const logEnd = useRef<HTMLLIElement | null>(null);

  const stopPoll = () => { if (pollId.current) { clearInterval(pollId.current); pollId.current = null; } };
  useEffect(() => stopPoll, []);

  const poll = useCallback(async () => {
    try {
      const [sRes, lRes] = await Promise.all([
        fetch(`${EXTRACTOR_URL}/api/status`),
        fetch(`${EXTRACTOR_URL}/api/logs?after=${logOff.current}`),
      ]);
      const s = await sRes.json();
      const l = await lRes.json();
      setProgress(s.progress ?? 0);
      if (s.stats) setStats(s.stats);
      if (l.logs?.length) { setLogs((p) => [...p, ...l.logs]); logOff.current = l.total; }
      if (s.status !== "running") { setRunning(false); stopPoll(); }
    } catch {}
  }, []);

  useEffect(() => { logEnd.current?.scrollIntoView({ behavior: "smooth" }); }, [logs]);

  const start = async () => {
    if (!url.trim()) return;
    setLogs([]); logOff.current = 0; setProgress(0); setStats(EMPTY); setRunning(true);
    try {
      await fetch(`${EXTRACTOR_URL}/api/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), fast, max_pages: maxPages }),
      });
      pollId.current = setInterval(poll, 1200);
    } catch { setRunning(false); }
  };

  const stop = async () => { try { await fetch(`${EXTRACTOR_URL}/api/stop`, { method: "POST" }); } catch {} };

  return (
    <div className="dx">
      <div className="dx-controls">
        <label className="ag-field">
          <span className="ag-label">Directory URL</span>
          <input className="input" type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)}
            disabled={running} placeholder="https://www.theconstructionusa.com/directory/?region=texas" />
        </label>

        <div className="dx-row">
          <div className="ag-source dx-modes" role="radiogroup" aria-label="Extraction mode">
            <button type="button" role="radio" aria-checked={fast} className={fast ? "is-on" : ""}
              onClick={() => setFast(true)} disabled={running}>
              <Zap size={16} aria-hidden="true" />
              <span><strong>Fast Mode</strong><em>Name, website, email, phone</em></span>
            </button>
            <button type="button" role="radio" aria-checked={!fast} className={!fast ? "is-on" : ""}
              onClick={() => setFast(false)} disabled={running}>
              <Layers size={16} aria-hidden="true" />
              <span><strong>Deep Mode</strong><em>All data + website crawl for emails</em></span>
            </button>
          </div>

          <div className="dx-pages" role="group" aria-label="Max pages">
            <span className="ag-label">Pages</span>
            {PAGE_OPTS.map((o) => (
              <button key={String(o.value)} type="button" className={maxPages === o.value ? "is-on" : ""}
                aria-pressed={maxPages === o.value} onClick={() => setMaxPages(o.value)} disabled={running}>
                {o.label}
              </button>
            ))}
          </div>
        </div>

        <button type="button" className={`ag-launch${running ? " dx-stop" : ""}`}
          onClick={running ? stop : start} disabled={!running && !url.trim()}>
          {running
            ? <><Square size={16} aria-hidden="true" /> Stop</>
            : <><Zap size={16} aria-hidden="true" /> Start Extraction</>}
        </button>
      </div>

      {logs.length > 0 && (
        <div className="dx-results">
          <ul className="dx-stats" role="list">
            <li><strong>{stats.with_website}</strong><span>Websites</span></li>
            <li><strong>{stats.with_email}</strong><span>Emails</span></li>
            <li><strong>{stats.with_phone}</strong><span>Phones</span></li>
            <li><strong>{stats.with_license}</strong><span>Licenses</span></li>
            <li><strong>{stats.total}</strong><span>Total</span></li>
          </ul>

          {running && (
            <div className="dx-progress">
              <div className="dx-bar"><i style={{ width: `${Math.max(progress, 1)}%` }} /></div>
              <span className="dx-pct">{Math.round(progress)}%</span>
            </div>
          )}

          <div className="ag-panel ag-term">
            <div className="ag-panel-head">
              <span><Terminal size={15} aria-hidden="true" /> Activity</span>
              {running && <span className="ag-live"><i className="ag-dot is-live" aria-hidden="true" /> Live</span>}
            </div>
            <ol className="ag-log" aria-live="polite">
              {logs.map((line, i) => (
                <li key={i}><time>--</time><span>{line}</span></li>
              ))}
              <li ref={logEnd} style={{ height: 0 }} aria-hidden="true" />
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}
