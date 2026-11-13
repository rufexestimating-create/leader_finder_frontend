"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Bot, CircleAlert, CircleCheck, CircleDashed, FlaskConical, LoaderCircle, Mail, MapPin, Play, Square } from "lucide-react";
import type { ConfirmRequest } from "@/components/dashboard/ConfirmDialog";
import { COMPANY_TYPES, COUNTRIES, US_STATES } from "@/lib/leadFinder";
import { AGENT_ACTIVE, type AgentRun, type Mailbox, call, send, toAgentRun } from "@/lib/leadFinderApi";
import { Combobox, Select } from "./Dropdown";

const POLL_MS = 3000;
const SIZES = [10, 20, 30, 50];
const STATUS: Record<AgentRun["status"], { label: string; tone: string }> = {
  queued: { label: "Starting", tone: "neutral" },
  running: { label: "Working", tone: "info" },
  sending: { label: "Sending", tone: "info" },
  waiting: { label: "Waiting for tomorrow", tone: "warning" },
  done: { label: "Done", tone: "success" },
  stopped: { label: "Stopped", tone: "neutral" },
  failed: { label: "Failed", tone: "danger" },
};
const typeLabel = (id: string) => COMPANY_TYPES.find((t) => t.id === id)?.label ?? id;
const place = (f: AgentRun["filters"]) => [f.city, f.state, f.country].filter(Boolean).join(", ");

function StepIcon({ state }: { state: string }) {
  if (state === "done") return <CircleCheck size={18} className="lf-agent-ok" aria-hidden="true" />;
  if (state === "running") return <LoaderCircle size={18} className="spin lf-agent-live" aria-hidden="true" />;
  if (state === "failed") return <CircleAlert size={18} className="lf-agent-bad" aria-hidden="true" />;
  return <CircleDashed size={18} className="lf-agent-idle" aria-hidden="true" />;
}

/** ReachAgent's automatic run: fill in a place and a company type, press Start, watch every step */
export function AgentPage({
  mailbox,
  notify,
  confirm,
  onOpenCompany,
  onOpenMailbox,
}: {
  mailbox: Mailbox | null;
  notify: (msg: string, isError?: boolean) => void;
  confirm: (r: ConfirmRequest) => void;
  onOpenCompany: (id: string) => void;
  onOpenMailbox: () => void;
}) {
  const [runs, setRuns] = useState<AgentRun[] | null>(null);
  const [run, setRun] = useState<AgentRun | null>(null);
  const [form, setForm] = useState({ country: "United States", state: "Texas", city: "", company_type: "gc", limit: 20 });
  const [starting, setStarting] = useState(false);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const us = form.country === "United States";
  const testMode = mailbox?.connected && mailbox.test_mode !== false;
  const active = !!run && AGENT_ACTIVE.includes(run.status);

  const loadRun = useCallback(async (id: string) => {
    const res = await call<Record<string, unknown>>(`/agent/runs/${id}`);
    if (res.data) setRun(toAgentRun(res.data));
  }, []);

  useEffect(() => {
    let live = true;
    call<Record<string, unknown>[]>("/agent/runs").then((res) => {
      if (!live) return;
      const list = (res.data ?? []).map(toAgentRun);
      setRuns(list);
      const current = list.find((r) => AGENT_ACTIVE.includes(r.status));
      if (current) loadRun(current.id);
    });
    return () => {
      live = false;
    };
  }, [loadRun]);

  useEffect(() => {
    if (!run || !active) return;
    const t = setInterval(() => loadRun(run.id), POLL_MS);
    return () => clearInterval(t);
  }, [run, active, loadRun]);

  const start = async () => {
    if (!form.city.trim()) return notify("Type a city first.", true);
    setStarting(true);
    const res = await call<Record<string, unknown>>("/agent/runs", send("POST", { ...form, state: us ? form.state : "", mode: "fast" }));
    setStarting(false);
    if (res.error || !res.data) return notify(res.error ?? "The agent couldn't start.", true);
    const started = toAgentRun(res.data);
    setRun(started);
    setRuns((all) => [started, ...(all ?? [])]);
  };

  const stop = () =>
    run &&
    confirm({
      title: "Stop the agent?",
      message: "It stops after the step it is on. Companies already found stay in Results, and no more emails are sent from this run.",
      confirmLabel: "Stop",
      cancelLabel: "Keep going",
      danger: true,
      onConfirm: async () => {
        const res = await call<Record<string, unknown>>(`/agent/runs/${run.id}/stop`, send("POST"));
        if (res.error || !res.data) return notify(res.error ?? "The agent couldn't be stopped.", true);
        setRun(toAgentRun(res.data));
        notify("Agent stopped.");
      },
    });

  const newRun = () => {
    if (run) setRuns((all) => [run, ...(all ?? []).filter((r) => r.id !== run.id)]);
    setRun(null);
  };

  if (!mailbox) return <div className="card empty"><div className="loader" /></div>;

  /* ---------- A run: live steps and companies ---------- */
  if (run) {
    const c = run.counts;
    const st = STATUS[run.status];
    const tiles: [string, number | undefined][] = [["On Google Maps", c.found], ["New companies", c.new], ["Websites read", c.read], ["Emails found", c.emails], ["Emails sent", c.sent]];
    return (
      <section className="lf-agent">
        <div className="card lf-agent-head">
          <div className="lf-agent-title">
            <span className="lf-agent-icon"><Bot size={22} aria-hidden="true" /></span>
            <div>
              <span className="lf-hero-tags">
                <span className={`pill tone-${st.tone}${active ? " live" : ""}`}>{st.label}</span>
                <span className="pill no-dot tone-primary">Without enrichment</span>
                {testMode && <span className="pill no-dot tone-warning"><FlaskConical size={12} aria-hidden="true" /> Test mode: all emails come to you</span>}
              </span>
              <h2>{typeLabel(run.filters.company_type)}s in {place(run.filters)}</h2>
              <p className="muted"><MapPin size={13} aria-hidden="true" /> Up to {run.filters.limit} companies, found on Google Maps, emails from their own websites</p>
            </div>
          </div>
          <div className="lf-head-actions">
            {active ? (
              <button className="btn btn-secondary btn-sm" onClick={stop}><Square size={14} aria-hidden="true" /> Stop</button>
            ) : (
              <button className="btn btn-primary btn-sm" onClick={newRun}><Play size={14} aria-hidden="true" /> New run</button>
            )}
          </div>
        </div>

        {run.error && (
          <div className="alert alert-danger" role="alert"><CircleAlert size={18} /><div>{run.error}</div></div>
        )}

        <ul className="lf-stats lf-agent-tiles">
          {tiles.map(([label, value]) => (
            <li key={label} className="lf-stat lf-stat--primary">
              <span className="lf-stat-text"><strong>{value ?? 0}</strong><span>{label}</span></span>
            </li>
          ))}
        </ul>

        <div className="lf-review-grid">
          <div className="card">
            <h3 className="card-title"><span className="lf-title-icon"><Bot size={16} aria-hidden="true" /></span> What the agent is doing</h3>
            <ol className="lf-agent-steps">
              {run.steps.map((s) => (
                <li key={s.id} className={`is-${s.state}`}>
                  <StepIcon state={s.state} />
                  <div><strong>{s.label}</strong>{s.note && <span>{s.note}</span>}</div>
                </li>
              ))}
            </ol>
          </div>

          <div className="card card-flush">
            <div className="lf-card-head">
              <h3 className="card-title"><span className="lf-title-icon"><Mail size={16} aria-hidden="true" /></span> Companies</h3>
              <span className="lf-count-chip">{run.companies?.length ?? 0}</span>
            </div>
            {!run.companies?.length ? (
              <p className="field-hint lf-pad">{active ? "Companies show up here as soon as they are found." : "No new companies were found."}</p>
            ) : (
              <ul className="lf-agent-list">
                {run.companies.map((co) => {
                  const p = co.contacts[0];
                  const state = !p ? "No email" : p.sentAt ? "Sent" : p.sendError ? "Not sent" : co.status === "enriching" ? "Reading…" : "Email found";
                  const tone = state === "Sent" ? "success" : state === "Email found" ? "info" : state === "Not sent" ? "danger" : "neutral";
                  return (
                    <li key={co.id}>
                      <button type="button" onClick={() => onOpenCompany(co.id)}>
                        <span className="lf-agent-co">
                          <strong>{co.name}</strong>
                          <span className="muted">{[co.domain, co.phone].filter(Boolean).join(" · ")}</span>
                        </span>
                        <span className="lf-agent-mail">
                          <span>{p ? `${p.title === "Company email" ? "" : `${p.name} · `}${p.email}` : co.status === "enriching" ? "Reading website…" : "—"}</span>
                          <span className={`pill no-dot tone-${tone}`} title={p?.sendError ?? undefined}>{state}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </section>
    );
  }

  /* ---------- No run open: the form ---------- */
  return (
    <section className="lf-agent">
      <div className="card lf-agent-form">
        <header className="lf-set-head">
          <h3><Bot size={20} aria-hidden="true" /> Run the agent</h3>
          <p>Pick a place and a kind of company. The agent finds them on Google Maps, reads their websites, finds an email for each and sends your agent message. You just watch.</p>
        </header>

        {!mailbox.connected && (
          <div className="alert alert-warning" role="note">
            <CircleAlert size={18} />
            <div>Connect your mailbox first, so the agent can send. <button type="button" className="link-btn" onClick={onOpenMailbox}>Open Settings</button></div>
          </div>
        )}
        {testMode && (
          <div className="alert alert-info" role="note">
            <FlaskConical size={18} />
            <div><strong>Test mode is on:</strong> every email comes to {mailbox.email}, nobody else gets anything.</div>
          </div>
        )}

        <div className="lf-mailbox-grid">
          <label className="field">
            <span className="field-label">Country</span>
            <Combobox value={form.country} onChange={(v) => set("country", v)} options={COUNTRIES} placeholder="Pick a country" />
          </label>
          {us && (
            <label className="field">
              <span className="field-label">State</span>
              <Combobox value={form.state} onChange={(v) => set("state", v)} options={US_STATES} placeholder="e.g. Texas" />
            </label>
          )}
          <label className="field">
            <span className="field-label">City</span>
            <input className="input" value={form.city} onChange={(e) => set("city", e.target.value)} placeholder="e.g. Houston" />
          </label>
          <label className="field">
            <span className="field-label">Kind of company</span>
            <Select value={form.company_type} onChange={(v) => set("company_type", v)}
              options={COMPANY_TYPES.filter((t) => t.id !== "other").map((t) => ({ value: t.id, label: t.label }))} />
          </label>
        </div>

        <div className="field">
          <span className="field-label">How many companies</span>
          <div className="lf-presets" role="group" aria-label="How many companies">
            {SIZES.map((n) => (
              <button key={n} type="button" className={form.limit === n ? "on" : ""} aria-pressed={form.limit === n} onClick={() => set("limit", n)}>{n}</button>
            ))}
          </div>
        </div>

        <fieldset className="lf-agent-modes">
          <legend className="field-label">How</legend>
          <label className="lf-agent-mode is-on">
            <input type="radio" name="mode" checked readOnly />
            <span><strong>Without enrichment</strong><span>Free: no API key. Emails come from the companies&apos; own websites.</span></span>
          </label>
          <label className="lf-agent-mode is-off" title="Coming next">
            <input type="radio" name="mode" disabled />
            <span><strong>With enrichment</strong><span>Coming next: owners&apos; emails through Hunter, checked by Reoon, personal lines by AI.</span></span>
          </label>
        </fieldset>

        <div className="lf-key-actions">
          <button type="button" className="btn btn-primary" disabled={starting || !mailbox.connected} onClick={start}>
            <Play size={15} aria-hidden="true" /> {starting ? "Starting…" : "Start the agent"}
          </button>
        </div>
      </div>

      {!!runs?.length && (
        <div className="card card-flush">
          <div className="lf-card-head"><h3 className="card-title">Earlier runs</h3></div>
          <ul className="lf-agent-list">
            {runs.slice(0, 8).map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => loadRun(r.id)}>
                  <span className="lf-agent-co">
                    <strong>{typeLabel(r.filters.company_type)}s in {place(r.filters)}</strong>
                    <span className="muted">{new Date(r.created_at).toLocaleString()}</span>
                  </span>
                  <span className="lf-agent-mail">
                    <span>{r.counts.new ?? 0} companies · {r.counts.emails ?? 0} emails · {r.counts.sent ?? 0} sent</span>
                    <span className={`pill no-dot tone-${STATUS[r.status].tone}`}>{STATUS[r.status].label}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
