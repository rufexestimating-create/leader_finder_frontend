"use client";

import React, { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, Plus, RotateCw } from "lucide-react";
import type { ConfirmRequest } from "@/components/dashboard/ConfirmDialog";
import { AGENT_ACTIVE, type AgentRun, call, send, toAgentRun } from "@/lib/leadFinderApi";
import { LiveCard, LiveRow } from "./LiveAgent";
import { MODE_LABEL, STATUS, canResume, runName, statusLabel } from "./agentRun";

const LIVE_MS = 4000;
const IDLE_MS = 30_000;
const RECENT = 5;
/** Running agents shown before "Show all" */
const MANY = 4;

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
  // With several agents running, each is one line; the one opened here shows its full steps
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
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

  const [resuming, setResuming] = useState<string | null>(null);
  const resume = async (run: AgentRun) => {
    setResuming(run.id);
    const res = await call(`/agent/runs/${run.id}/resume`, send("POST"));
    setResuming(null);
    if (res.error) return notify(res.error, true);
    notify("The agent carries on from where it stopped.");
    load();
  };

  const row = (run: AgentRun) => {
    const st = STATUS[run.status];
    const c = run.counts;
    const when = ago(run.finished_at ?? run.created_at, now);
    const bits = [
      run.mode !== "bulk" ? `${c.new ?? 0} new` : null,
      `${c.emails ?? 0} email${c.emails === 1 ? "" : "s"}`,
      `${c.sent ?? 0} sent`,
    ].filter(Boolean).join(" · ");
    return (
      <li key={run.id} className={`rc is-${st.tone}`}>
        <button type="button" className="rc-body" onClick={() => onOpen(run.id)} aria-label={`Open ${runName(run)}`}>
          <i className="rc-dot" aria-hidden="true" />
          <span className="rc-main">
            <span className="rc-name">{runName(run)}</span>
            <span className="rc-meta">{statusLabel(run)}{when ? ` · ${when}` : ""} · {MODE_LABEL[run.mode]}</span>
          </span>
          <span className="rc-stats">{bits}</span>
          <ArrowUpRight size={16} className="rc-go" aria-hidden="true" />
        </button>
        {canResume(run) && (
          <button type="button" className="rc-act" onClick={() => resume(run)} disabled={resuming === run.id} aria-label={`Continue ${runName(run)} from where it stopped`}>
            <RotateCw size={11} aria-hidden="true" className={resuming === run.id ? "spin" : undefined} /> Continue
          </button>
        )}
      </li>
    );
  };

  return (
    <section className="aw" aria-label="Your agents">
      <div className="aw-head">
        <div>
          <span className="sp-eyebrow"><b>[02]</b> Your agents</span>
          <h3>{runs === null ? "Loading agents…" : active.length ? `${active.length} agent${active.length === 1 ? "" : "s"} working now` : "No agent running"}</h3>
        </div>
        <div className="aw-side">
          <ul className="aw-counts" aria-label="Agent totals">
            <li className={active.length ? "is-live" : undefined}><strong>{active.length}</strong><span>Running</span></li>
            <li><strong>{completed}</strong><span>Completed</span></li>
            <li><strong>{sent}</strong><span>Emails sent</span></li>
          </ul>
        </div>
      </div>

      <div className={`aw-grid${active.length ? " has-live" : ""}`}>
        <div className="aw-live">
          <p className="aw-label">Running now{active.length ? ` · ${active.length}` : ""}</p>
          {active.length ? (
            active.length === 1 ? (
              <ul className="lc-list"><LiveCard run={active[0]} onOpen={onOpen} onStop={() => stop(active[0])} /></ul>
            ) : (
              <>
                <ul className="lc-list lc-list--many">
                  {(showAll ? active : active.slice(0, MANY)).map((r) => (r.id === expanded
                    ? <LiveCard key={r.id} run={r} onOpen={onOpen} onStop={() => stop(r)} onCollapse={() => setExpanded(null)} />
                    : <LiveRow key={r.id} run={r} onExpand={() => setExpanded(r.id)} onStop={() => stop(r)} />))}
                </ul>
                {active.length > MANY && (
                  <button type="button" className="aw-more" onClick={() => setShowAll((v) => !v)}>
                    {showAll ? "Show fewer" : `Show all ${active.length} running agents`}
                  </button>
                )}
              </>
            )
          ) : (
            <div className="aw-idle">
              <strong>Nothing is running right now</strong>
              <p>Start an agent and you can follow every step here: finding companies, reading their websites, finding emails and sending.</p>
              <button type="button" className="btn btn-secondary btn-sm" onClick={onNew}><Plus size={14} aria-hidden="true" /> Start an agent</button>
            </div>
          )}
        </div>
        <div className="aw-recent">
          <p className="aw-label">Recent</p>
          {recent.length ? <ul className="rc-list">{recent.map(row)}</ul> : <p className="aw-none">{runs === null ? "Loading…" : "Finished agents show up here."}</p>}
        </div>
      </div>
    </section>
  );
}
