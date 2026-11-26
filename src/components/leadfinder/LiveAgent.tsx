"use client";

import React from "react";
import { ArrowUpRight, Check, ChevronDown, Square, X } from "lucide-react";
import type { AgentRun } from "@/lib/leadFinderApi";
import { STATUS, place, progressOf, runName, statusLabel } from "./agentRun";

const TITLE: Record<string, string> = {
  find: "Find companies", save: "Save", read: "Read websites", emails: "Find emails", enrich: "Find owners", check: "Check emails", send: "Send emails",
};
/** What each step does, said the way a person would explain it */
const HELP: Record<string, string> = {
  find: "Searches Google Maps and business directories for companies that match.",
  save: "Keeps only companies you don't have yet and adds them to your list.",
  read: "Opens each company's website and looks for contact details.",
  enrich: "Finds the owner or decision maker and their email.",
  emails: "Picks the best email address for each company.",
  check: "Checks every address so your emails don't bounce.",
  send: "Sends your email to each company, one by one.",
};
const DOING: Record<string, string> = {
  find: "Looking for companies on Google Maps and directories",
  save: "Adding the new companies to your list",
  read: "Reading company websites for contact details",
  enrich: "Finding owners and their emails",
  emails: "Picking the best email for each company",
  check: "Checking every address so nothing bounces",
  send: "Sending your emails",
};

export function nowLine(run: AgentRun): string {
  if (run.status === "queued") return run.queue_position && run.queue_position > 1 ? `Waiting for a free slot, #${run.queue_position} in line` : "Getting ready to start";
  if (run.status === "waiting") return "Today's sending limit is reached. It carries on by itself tomorrow";
  if (run.counts.current) return `Reading ${run.counts.current}`;
  const step = run.steps.find((s) => s.state === "running");
  return step ? DOING[step.id] ?? step.label : "Getting ready to start";
}

/** One working agent: where it is in its steps, in plain words, with open and stop at hand */
export function LiveCard({ run, onOpen, onStop, onCollapse }: { run: AgentRun; onOpen: (id: string) => void; onStop?: () => void; onCollapse?: () => void }) {
  const st = STATUS[run.status];
  const pct = progressOf(run);
  const nextIdx = run.steps.findIndex((s) => s.state === "pending");
  const running = run.steps.find((s) => s.state === "running");
  const log = run.counts.log ?? [];
  const last = log[log.length - 1];
  const where = run.mode !== "bulk" && run.filters.country ? place(run.filters) : null;

  return (
    <li className={`lc is-${st.tone}`}>
      <div className="lc-top">
        <div className="lc-title">
          <span className="lc-status"><i aria-hidden="true" />{statusLabel(run)}</span>
          <strong>{runName(run)}</strong>
          {where && <span className="lc-where">{where} · up to {run.filters.limit}</span>}
        </div>
        <div className="lc-right">
          <span className="lc-pct" aria-label={`${pct}% done`}>{pct}<small>%</small></span>
          <button type="button" className="lc-btn" onClick={() => onOpen(run.id)} aria-label={`Open ${runName(run)}`}>Open <ArrowUpRight size={14} aria-hidden="true" /></button>
          {onStop && <button type="button" className="lc-btn is-stop" onClick={onStop} aria-label={`Stop ${runName(run)}`}><Square size={10} aria-hidden="true" /> Stop</button>}
          {onCollapse && <button type="button" className="lc-btn lc-collapse" onClick={onCollapse} aria-label="Show less" aria-expanded="true"><ChevronDown size={14} aria-hidden="true" /></button>}
        </div>
      </div>

      <div className="lc-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Progress"><i style={{ width: `${Math.max(pct, 2)}%` }} /></div>

      <ol className="lc-steps" style={{ gridTemplateColumns: `repeat(${run.steps.length}, minmax(0, 1fr))` }}>
        {run.steps.map((s, i) => (
          <li key={s.id} className={`lc-step is-${s.state}${i === nextIdx ? " is-next" : ""}`} title={HELP[s.id]}>
            <span className="lc-node" aria-hidden="true">
              {s.state === "done" ? <Check size={12} strokeWidth={3} /> : s.state === "failed" ? <X size={12} strokeWidth={3} /> : i + 1}
            </span>
            <span className="lc-step-name">{TITLE[s.id] ?? s.label}</span>
            <span className="lc-step-state">{s.state === "done" ? "Done" : s.state === "running" ? "Now" : s.state === "failed" ? "Stopped" : i === nextIdx ? "Next" : "Later"}</span>
          </li>
        ))}
      </ol>

      <div className="lc-now" aria-live="polite">
        <span className="lc-now-tag">Now</span>
        <div>
          <p>{nowLine(run)}<span className="lv-caret" aria-hidden="true" /></p>
          <small>{running && HELP[running.id] ? HELP[running.id] : ""}{last ? `${running && HELP[running.id] ? " · " : ""}Last: ${last.text}` : ""}</small>
        </div>
      </div>
    </li>
  );
}

/** A working agent in one line, for when several run at once; click to see its full card */
export function LiveRow({ run, onExpand, onStop }: { run: AgentRun; onExpand: () => void; onStop: () => void }) {
  const st = STATUS[run.status];
  const pct = progressOf(run);
  return (
    <li className={`lr is-${st.tone}`}>
      <button type="button" className="lr-body" onClick={onExpand} aria-expanded="false" aria-label={`Show the steps of ${runName(run)}`}>
        <i className="lr-dot" aria-hidden="true" />
        <span className="lr-main">
          <strong>{runName(run)}</strong>
          <span className="lr-now">{nowLine(run)}</span>
        </span>
        <span className="lr-steps" aria-label={run.steps.map((s) => `${TITLE[s.id] ?? s.label}: ${s.state}`).join(", ")}>
          {run.steps.map((s) => <i key={s.id} className={`is-${s.state}`} title={`${TITLE[s.id] ?? s.label}: ${s.state === "running" ? "now" : s.state}`} />)}
        </span>
        <span className="lr-pct">{pct}<small>%</small></span>
        <ChevronDown size={16} className="lr-chev" aria-hidden="true" />
      </button>
      <button type="button" className="lr-stop" onClick={onStop} aria-label={`Stop ${runName(run)}`}><Square size={10} aria-hidden="true" /></button>
    </li>
  );
}
