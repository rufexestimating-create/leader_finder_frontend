"use client";

import React, { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, Bot, Building2, CircleCheck, Mail, MapPin, Plus, Radar, Rocket, Send, Square, TriangleAlert } from "lucide-react";
import type { ConfirmRequest } from "@/components/dashboard/ConfirmDialog";
import { AGENT_ACTIVE, type AgentRun, call, send, toAgentRun } from "@/lib/leadFinderApi";
import { MODE_LABEL, STATUS, place, progressOf, runName, statusLabel } from "./agentRun";

const LIVE_MS = 4000;
const IDLE_MS = 30_000;
const RECENT = 4;

function ago(iso: string | null, now: number): string {
  if (!iso || !now) return "";
  const m = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

/** The user's agent fleet, styled as mission control: live agents orbit and scan, finished ones keep their report one click away */
export function AgentsPanel({
  notify,
  confirm,
  onOpen,
  onNew,
  onRuns,
}: {
  notify: (msg: string, isError?: boolean) => void;
  confirm: (r: ConfirmRequest) => void;
  onOpen: (runId: string) => void;
  onNew: () => void;
  /** Hands every loaded run to the page, so its charts share this one poll */
  onRuns?: (runs: AgentRun[]) => void;
}) {
  const [runs, setRuns] = useState<AgentRun[] | null>(null);
  const [now, setNow] = useState(0);

  const load = useCallback(async () => {
    const res = await call<Record<string, unknown>[]>("/agent/runs?limit=50");
    if (!res.data) return;
    const list = res.data.map(toAgentRun);
    setNow(Date.now());
    setRuns(list);
    onRuns?.(list);
  }, [onRuns]);

  const all = runs ?? [];
  const active = all.filter((r) => AGENT_ACTIVE.includes(r.status));
  const recent = all.filter((r) => !AGENT_ACTIVE.includes(r.status)).slice(0, RECENT);
  const completed = all.filter((r) => r.status === "done").length;
  const sent = all.reduce((s, r) => s + (r.counts.sent ?? 0), 0);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const t = setInterval(load, active.length ? LIVE_MS : IDLE_MS);
    return () => { clearTimeout(first); clearInterval(t); };
  }, [load, active.length]);

  const stop = (run: AgentRun) =>
    confirm({
      title: "Stop this agent?",
      message: `${runName(run)}: it stops after the step it is on. Companies already found stay in Results, and no more emails are sent from this agent. Your other agents keep working.`,
      confirmLabel: "Stop",
      cancelLabel: "Keep going",
      danger: true,
      onConfirm: async () => {
        const res = await call(`/agent/runs/${run.id}/stop`, send("POST"));
        if (res.error) return notify(res.error, true);
        notify("Agent stopped.");
        load();
      },
    });

  const card = (run: AgentRun, idx: number) => {
    const st = STATUS[run.status];
    const live = AGENT_ACTIVE.includes(run.status);
    const c = run.counts;
    const progress = progressOf(run);
    const shown = live ? Math.max(progress, 4) : progress;
    const loc = run.mode !== "bulk" && run.filters.country ? place(run.filters) : null;
    const when = live ? `started ${ago(run.created_at, now)}` : ago(run.finished_at ?? run.created_at, now);
    const coreIcon = live ? <Bot size={20} /> : st.tone === "ok" ? <CircleCheck size={20} /> : st.tone === "bad" ? <TriangleAlert size={20} /> : <Bot size={20} />;
    const stats = [
      ...(run.mode !== "bulk" ? [{ k: "Companies", v: c.new ?? 0, icon: <Building2 size={13} /> }] : []),
      { k: "Emails", v: c.emails ?? 0, icon: <Mail size={13} /> },
      { k: "Sent", v: c.sent ?? 0, icon: <Send size={13} /> },
    ];

    return (
      <li key={run.id} className={`sp-card is-${st.tone} is-${run.mode}${live ? " is-live" : ""}`} style={{ animationDelay: `${idx * 70}ms` }}>
        <button type="button" className="sp-card-body" onClick={() => onOpen(run.id)} aria-label={`Open ${runName(run)}`}>
          <span className="sp-card-top">
            <span className="sp-core" aria-hidden="true">
              <span className="sp-orbit"><i /></span>
              <span className="sp-core-inner">{coreIcon}</span>
            </span>
            <span className="sp-card-id">
              <span className="sp-chip">{MODE_LABEL[run.mode]}</span>
              <span className="sp-card-name">{runName(run)}</span>
            </span>
          </span>

          <span className="sp-status">
            <span className="sp-status-dot" aria-hidden="true" />
            <span className="sp-status-text">{statusLabel(run)}</span>
            {when && <span className="sp-when">{when}</span>}
          </span>

          <span className="sp-progress">
            <span className="sp-bar" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Progress">
              <span className="sp-bar-fill" style={{ width: `${shown}%` }} />
            </span>
            <span className="sp-pct">{progress}%</span>
          </span>

          {run.status === "failed" && run.error ? (
            <span className="sp-error">{run.error}</span>
          ) : (
            <span className="sp-stats">
              {stats.map((s) => (
                <span key={s.k} className="sp-stat">
                  <span className="sp-stat-k">{s.icon}{s.k}</span>
                  <strong>{s.v.toLocaleString()}</strong>
                </span>
              ))}
            </span>
          )}

          <span className="sp-foot">
            {loc ? <span className="sp-loc"><MapPin size={12} aria-hidden="true" />{loc}{run.filters.limit ? ` · max ${run.filters.limit}` : ""}</span> : <span />}
            <span className="sp-open">{live ? "Watch live" : "View report"} <ArrowUpRight size={13} aria-hidden="true" /></span>
          </span>
        </button>

        {live && (
          <button type="button" className="sp-stop" onClick={() => stop(run)} aria-label={`Stop ${runName(run)}`}>
            <Square size={10} aria-hidden="true" /> Stop
          </button>
        )}
      </li>
    );
  };

  return (
    <section className="sp" aria-label="Your agents">
      <span className="sp-stars" aria-hidden="true" />
      <span className="sp-stars sp-stars--far" aria-hidden="true" />
      <span className="sp-nebula" aria-hidden="true" />
      <span className="sp-floor" aria-hidden="true" />

      <div className="sp-head">
        <div className="sp-head-text">
          <span className="sp-eyebrow"><Radar size={13} aria-hidden="true" /> Mission control</span>
          <h3>Your agents</h3>
          <p>
            {runs === null
              ? "Connecting to your fleet…"
              : active.length
                ? `${active.length} agent${active.length === 1 ? " is" : "s are"} on a mission right now. Click one to watch it live.`
                : "All agents are docked. Launch one or several at once, each with its own city and message."}
          </p>
        </div>
        <div className="sp-head-side">
          <ul className="sp-counters" aria-label="Fleet totals">
            <li className={active.length ? "is-live" : undefined}><strong>{active.length}</strong><span>Active</span></li>
            <li><strong>{completed}</strong><span>Completed</span></li>
            <li><strong>{sent.toLocaleString()}</strong><span>Emails sent</span></li>
          </ul>
          <button type="button" className="sp-launch" onClick={onNew}>
            <span className="sp-launch-glow" aria-hidden="true" />
            <Plus size={16} aria-hidden="true" /> New agent
          </button>
        </div>
      </div>

      {runs !== null && !active.length && !recent.length && (
        <div className="sp-empty">
          <span className="sp-radar" aria-hidden="true"><span /><Rocket size={22} /></span>
          <div>
            <strong>Awaiting your first mission</strong>
            <p>Launch an agent and it appears here the moment it takes off.</p>
          </div>
        </div>
      )}

      {!!active.length && (
        <>
          <p className="sp-label"><span className="sp-label-dot is-live" aria-hidden="true" /> Active missions</p>
          <ul className="sp-grid">{active.map(card)}</ul>
        </>
      )}

      {!!recent.length && (
        <>
          <p className="sp-label"><span className="sp-label-dot" aria-hidden="true" /> Mission log</p>
          <ul className="sp-grid">{recent.map(card)}</ul>
        </>
      )}
    </section>
  );
}
