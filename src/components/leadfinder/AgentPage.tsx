"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  ArrowRight, Bot, Building2, CircleAlert, CircleCheck, FileUp, FlaskConical, Globe, ListPlus, LoaderCircle, Mail, Radar, Send, ShieldCheck, Sparkles,
  Square, Terminal, Zap,
} from "lucide-react";
import type { ConfirmRequest } from "@/components/dashboard/ConfirmDialog";
import { COMPANY_TYPES, COUNTRIES, US_STATES } from "@/lib/leadFinder";
import { AGENT_ACTIVE, type AgentRun, type Mailbox, call, send, toAgentRun } from "@/lib/leadFinderApi";
import { Combobox, Select } from "./Dropdown";

const POLL_MS = 3000;
const SIZES = [10, 20, 30, 50];
const STATUS: Record<AgentRun["status"], { label: string; tone: "live" | "ok" | "warn" | "bad" | "idle" }> = {
  queued: { label: "Booting", tone: "live" },
  running: { label: "Scanning", tone: "live" },
  enriching: { label: "Enriching", tone: "live" },
  sending: { label: "Sending", tone: "live" },
  waiting: { label: "Paused till tomorrow", tone: "warn" },
  done: { label: "Mission complete", tone: "ok" },
  stopped: { label: "Stopped", tone: "idle" },
  failed: { label: "Failed", tone: "bad" },
};
const STEP_ICON: Record<string, React.ReactNode> = {
  find: <Radar size={18} />, save: <Building2 size={18} />, read: <Globe size={18} />, emails: <Mail size={18} />, enrich: <Sparkles size={18} />,
  send: <Send size={18} />, check: <ShieldCheck size={18} />,
};
const SHORT: Record<string, string> = {
  find: "Scan Google Maps", save: "Save companies", read: "Read websites", emails: "Find emails", enrich: "Enrich owners", send: "Send emails", check: "Check emails",
};
type Recipient = { email: string; name: string; company: string };

/** A pasted list or a CSV file: one person per line, "email", "email, name" or "email, name, company" in any order
 * (the email is whichever cell has an @). A header line with "email" in it is skipped. */
export function parseRecipients(text: string): Recipient[] {
  const out: Recipient[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const cells = raw.split(/[,;\t]/).map((c) => c.trim().replace(/^"|"$/g, "")).filter(Boolean);
    const email = cells.find((c) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c));
    if (!email) continue;
    const rest = cells.filter((c) => c !== email);
    out.push({ email: email.toLowerCase(), name: rest[0] ?? "", company: rest[1] ?? "" });
  }
  return out;
}
const typeLabel = (id: string) => COMPANY_TYPES.find((t) => t.id === id)?.label ?? id;
const place = (f: { city: string; state?: string; country: string }) => [f.city, f.state, f.country].filter(Boolean).join(", ");

/** How far the whole run is, 0-100: finding 0-15, saving 15-20, reading or enriching 20-80, sending 80-100 */
function progressOf(run: AgentRun): number {
  if (run.status === "done") return 100;
  const c = run.counts;
  const state = (id: string) => run.steps.find((s) => s.id === id)?.state;
  if (run.mode === "bulk") {
    if (state("send") === "running" || state("send") === "done") return 60 + Math.round(40 * Math.min(1, (c.sent ?? 0) / Math.max(1, c.emails ?? 1)));
    return 2 + Math.round(55 * Math.min(1, (c.checked ?? 0) / Math.max(1, c.total ?? 1)));
  }
  if (state("send") === "running" || state("send") === "done") return 80 + Math.round(20 * Math.min(1, (c.sent ?? 0) / Math.max(1, c.emails ?? 1)));
  if (state("save") === "done") return 20 + Math.round(60 * Math.min(1, (c.read ?? 0) / Math.max(1, c.new ?? 1)));
  if (state("find") === "done") return 18;
  return state("find") === "running" ? 8 : 2;
}

/** The agent's core: rotating rings around a glowing center; a progress ring while it works */
function Core({ state, progress, size = "lg" }: { state: "idle" | "live" | "ok" | "bad" | "warn"; progress?: number; size?: "lg" | "sm" }) {
  const r = 56;
  const len = 2 * Math.PI * r;
  return (
    <div className={`ag-core ag-core--${size} is-${state}`} aria-hidden="true">
      <span className="ag-core-glow" />
      <span className="ag-ring ag-ring--1" />
      <span className="ag-ring ag-ring--2" />
      <span className="ag-ring ag-ring--3" />
      {progress !== undefined && (
        <svg className="ag-progress" viewBox="0 0 128 128">
          <circle cx="64" cy="64" r={r} className="ag-progress-track" />
          <circle cx="64" cy="64" r={r} className="ag-progress-bar" strokeDasharray={len} strokeDashoffset={len * (1 - progress / 100)} />
        </svg>
      )}
      <span className="ag-core-center">
        {progress !== undefined && state !== "idle" ? <strong>{progress}%</strong> : <Bot size={size === "lg" ? 34 : 22} />}
      </span>
    </div>
  );
}

/** ReachAgent's automatic run: brief the agent, launch it, watch it work */
export function AgentPage({
  mailbox,
  notify,
  confirm,
  openRunId,
  onOpenCompany,
  onSeeResults,
  onClosed,
  onOpenMailbox,
  bulkDefaults,
}: {
  /** Subject and message the bulk form starts from (the "without enrichment" message in Settings) */
  bulkDefaults: { subject: string; message: string };
  mailbox: Mailbox | null;
  notify: (msg: string, isError?: boolean) => void;
  confirm: (r: ConfirmRequest) => void;
  /** A run picked in Results to watch; otherwise the run in progress, if any */
  openRunId: string | null;
  onOpenCompany: (id: string) => void;
  onSeeResults: (runId: string) => void;
  onClosed: () => void;
  onOpenMailbox: () => void;
}) {
  const [run, setRun] = useState<AgentRun | null>(null);
  const [form, setForm] = useState({
    country: "United States", state: "Texas", city: "", company_type: "gc", limit: 20, mode: "fast" as "fast" | "smart" | "bulk",
    list: "", subject: "", message: "",
  });
  const recipients = form.mode === "bulk" ? parseRecipients(form.list) : [];
  const [starting, setStarting] = useState(false);
  const [showForm, setShowForm] = useState(false);
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
    const pick = openRunId
      ? Promise.resolve(openRunId)
      : call<Record<string, unknown>[]>("/agent/runs").then((res) => (res.data ?? []).map(toAgentRun).find((r) => AGENT_ACTIVE.includes(r.status))?.id);
    pick.then((id) => {
      if (live && id) loadRun(id);
    });
    return () => {
      live = false;
    };
  }, [loadRun, openRunId]);

  useEffect(() => {
    if (!run || !active) return;
    const t = setInterval(() => loadRun(run.id), POLL_MS);
    return () => clearInterval(t);
  }, [run, active, loadRun]);

  const start = async () => {
    const bulk = form.mode === "bulk";
    if (bulk && !recipients.length) return notify("Paste at least one email, or upload a CSV.", true);
    if (bulk && recipients.length > 1000) return notify("At most 1,000 emails in one run.", true);
    if (bulk && (!form.subject.trim() || !form.message.trim())) return notify("Write a subject and a message.", true);
    if (!bulk && !form.city.trim()) return notify("Type a city first.", true);
    setStarting(true);
    const body = bulk
      ? { mode: "bulk", recipients, subject: form.subject, message: form.message }
      : { mode: form.mode, country: form.country, state: us ? form.state : "", city: form.city, company_type: form.company_type, limit: form.limit };
    const res = await call<Record<string, unknown>>("/agent/runs", send("POST", body));
    setStarting(false);
    if (res.error || !res.data) return notify(res.error ?? "The agent couldn't start.", true);
    setRun(toAgentRun(res.data));
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
    setRun(null);
    setShowForm(false);
    onClosed();
  };

  if (!mailbox) return <div className="ag-console ag-loading"><Core state="live" size="sm" /></div>;

  /* ---------- Mission console: the run, live ---------- */
  if (run) {
    const c = run.counts;
    const st = STATUS[run.status];
    const smart = run.mode === "smart";
    const bulk = run.mode === "bulk";
    const progress = progressOf(run);
    const running = run.steps.find((s) => s.state === "running");
    const headline = !active
      ? run.status === "done" ? `${c.sent ?? 0} email${c.sent === 1 ? "" : "s"} sent${testMode ? " to you (test mode)" : ""}` : run.error ?? st.label
      : c.current ? `Reading ${c.current}` : running ? SHORT[running.id] ?? running.label : "Booting up";
    const tiles: [string, number | undefined][] = bulk
      ? [["On your list", c.total], ["Checked", c.checked], ["Ready to send", c.emails], ["Removed", c.removed], ["Sent", c.sent]]
      : smart
      ? [["On Google Maps", c.found], ["New companies", c.new], ["Enriched", c.read], ["People", c.people], ["Verified emails", c.emails], ["Sent", c.sent]]
      : [["On Google Maps", c.found], ["New companies", c.new], ["Websites read", c.read], ["Emails found", c.emails], ["Sent", c.sent]];
    const log = [...(c.log ?? [])].reverse().slice(0, 40);

    return (
      <section className="ag">
        <div className="ag-console">
          <div className="ag-hero">
            <Core state={st.tone === "live" ? "live" : st.tone} progress={progress} />
            <div className="ag-hero-text">
              <span className="ag-eyebrow">
                <i className={`ag-dot is-${st.tone}`} aria-hidden="true" /> {st.label}
                <span className="ag-sep">/</span> {bulk ? "Bulk send" : smart ? "With enrichment" : "Without enrichment"}
                {testMode && <><span className="ag-sep">/</span><FlaskConical size={13} aria-hidden="true" /> Test mode</>}
              </span>
              <h2 className="ag-title" aria-live="polite">{headline}{active && <span className="ag-caret" aria-hidden="true" />}</h2>
              <p className="ag-sub">
                {bulk
                  ? `${c.total ?? run.filters.recipients?.length ?? 0} addresses from your list · ${run.filters.subject ?? ""}`
                  : `${typeLabel(run.filters.company_type)}s in ${place(run.filters)} · up to ${run.filters.limit} companies`}
              </p>
              <div className="ag-actions">
                {active ? (
                  <button type="button" className="ag-btn ag-btn--ghost" onClick={stop}><Square size={15} aria-hidden="true" /> Stop agent</button>
                ) : (
                  <button type="button" className="ag-btn ag-btn--primary" onClick={newRun}><Zap size={16} aria-hidden="true" /> New mission</button>
                )}
                {!!c.new && <button type="button" className="ag-btn ag-btn--ghost" onClick={() => onSeeResults(run.id)}>See in Results <ArrowRight size={15} aria-hidden="true" /></button>}
              </div>
            </div>
          </div>

          <ol className="ag-pipe" style={{ gridTemplateColumns: `repeat(${run.steps.length}, minmax(0, 1fr))` }}>
            {run.steps.map((s) => (
              <li key={s.id} className={`ag-node is-${s.state}`}>
                <span className="ag-node-dot" aria-hidden="true">
                  {s.state === "done" ? <CircleCheck size={18} /> : s.state === "failed" ? <CircleAlert size={18} /> : s.state === "running" ? <LoaderCircle size={18} className="spin" /> : STEP_ICON[s.id]}
                </span>
                <strong>{SHORT[s.id] ?? s.label}</strong>
                <span>{s.note || (s.state === "pending" ? "Waiting" : "")}</span>
              </li>
            ))}
          </ol>

          <ul className="ag-stats">
            {tiles.map(([label, value]) => (
              <li key={label}><strong>{value ?? 0}</strong><span>{label}</span></li>
            ))}
          </ul>
        </div>

        <div className="ag-grid">
          <div className="ag-panel ag-term">
            <div className="ag-panel-head">
              <span><Terminal size={15} aria-hidden="true" /> Agent log</span>
              {active && <span className="ag-live"><i className="ag-dot is-live" aria-hidden="true" /> Live</span>}
            </div>
            <ol className="ag-log" aria-live="polite">
              {active && <li className="ag-log-now"><time>now</time><span>{headline}<span className="ag-caret" aria-hidden="true" /></span></li>}
              {log.map((e, i) => (
                <li key={`${e.t}-${i}`}>
                  <time dateTime={e.t}>{new Date(e.t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time>
                  <span>{e.text}</span>
                </li>
              ))}
              {!log.length && !active && <li><time>--:--</time><span>Nothing was logged for this run.</span></li>}
            </ol>
          </div>

          <div className="ag-panel">
            <div className="ag-panel-head">
              <span><Building2 size={15} aria-hidden="true" /> Companies</span>
              <span className="ag-count">{run.companies?.length ?? 0}</span>
            </div>
            {!run.companies?.length ? (
              <p className="ag-empty">{active ? "Companies appear here the moment they are found." : "No new companies were found."}</p>
            ) : (
              <ul className="ag-cos">
                {run.companies.map((co) => {
                  const picked = co.contacts.filter((x) => x.selected && x.email);
                  const p = smart || bulk ? picked[0] : co.contacts[0];
                  const waiting = co.status === "enriching" || co.status === "queued";
                  const now = co.status === "enriching" && co.domain === c.current;
                  const state = now ? (smart ? "Enriching" : "Reading") : waiting ? "Queued" : co.status === "failed" ? "Failed"
                    : !p ? (smart ? "No verified email" : "No email") : picked.some((x) => x.sentAt) || p.sentAt ? "Sent"
                    : p.sendError ? "Not sent" : smart ? `${picked.length} verified` : bulk ? "Ready" : "Email found";
                  const tone = state === "Sent" ? "ok" : state === "Not sent" || state === "Failed" ? "bad" : now ? "live"
                    : state === "Email found" || state === "Ready" || state.endsWith("verified") ? "info" : "idle";
                  return (
                    <li key={co.id}>
                      <button type="button" onClick={() => onOpenCompany(co.id)} className={now ? "is-now" : undefined}>
                        <span className="ag-co-avatar" aria-hidden="true">{co.name[0]?.toUpperCase()}</span>
                        <span className="ag-co-text">
                          <strong>{co.name}</strong>
                          <span>{p ? `${p.title === "Company email" ? "" : `${p.name} · `}${p.email}` : [co.domain, co.phone].filter(Boolean).join(" · ")}</span>
                        </span>
                        <span className={`ag-tag is-${tone}`} title={p?.sendError ?? undefined}>{state}</span>
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

  /* ---------- Home: one big button ---------- */
  if (!showForm) {
    return (
      <section className="ag">
        <div className="ag-console ag-home">
          <Core state="idle" />
          <span className="ag-eyebrow"><i className="ag-dot is-ok" aria-hidden="true" /> Agent online</span>
          <h2 className="ag-home-title">What should ReachAgent find today?</h2>
          <p className="ag-home-sub">Give it a city and a kind of company. It scans Google Maps, reads every website, finds the emails and sends your message, on its own.</p>
          <button type="button" className="ag-launch ag-launch--xl" onClick={() => setShowForm(true)}>
            <Zap size={24} aria-hidden="true" /> START AGENT
          </button>
          <ul className="ag-caps">
            <li><Radar size={14} aria-hidden="true" /> Google Maps scan</li>
            <li><Globe size={14} aria-hidden="true" /> Website reading</li>
            <li><Mail size={14} aria-hidden="true" /> Email discovery</li>
            <li><Send size={14} aria-hidden="true" /> Auto outreach</li>
          </ul>
          {testMode && <span className="ag-note"><FlaskConical size={14} aria-hidden="true" /> Test mode is on: every email comes to you</span>}
          {!mailbox.connected && (
            <span className="ag-note is-warn">
              <CircleAlert size={14} aria-hidden="true" /> Connect your mailbox first. <button type="button" className="ag-link" onClick={onOpenMailbox}>Open Settings</button>
            </span>
          )}
        </div>
      </section>
    );
  }

  /* ---------- Mission brief: the form ---------- */
  const bulk = form.mode === "bulk";
  const readFile = (file?: File | null) => {
    if (!file) return;
    file.text().then((t) => set("list", (form.list.trim() ? form.list.trim() + "\n" : "") + t));
  };
  const query = bulk
    ? `bulk send · ${recipients.length} address${recipients.length === 1 ? "" : "es"} · ${form.subject || "no subject yet"}`
    : `${typeLabel(form.company_type).toLowerCase()} in ${[form.city.trim() || "…", us ? form.state : form.country].filter(Boolean).join(", ")} · ${form.limit} companies · ${form.mode === "smart" ? "with" : "without"} enrichment`;
  const insert = (token: string) => set("message", `${form.message}${form.message.endsWith("\n") || !form.message ? "" : " "}${token}`);

  return (
    <section className="ag">
      <form className="ag-console ag-brief" onSubmit={(e) => { e.preventDefault(); start(); }}>
        <div className="ag-brief-head">
          <Core state="live" size="sm" />
          <div>
            <span className="ag-eyebrow"><i className="ag-dot is-live" aria-hidden="true" /> Mission brief</span>
            <h2 className="ag-brief-title">Run agent</h2>
            <p className="ag-sub">Pick how the agent works, then tell it where to look or who to write to.</p>
          </div>
          {testMode && <span className="ag-chip"><FlaskConical size={13} aria-hidden="true" /> Test mode: all emails to {mailbox.email}</span>}
        </div>

        <fieldset className="ag-section">
          <legend><span>01</span> Mode</legend>
          <div className="ag-modes ag-modes--3" role="radiogroup" aria-label="Mode">
            <button type="button" role="radio" aria-checked={form.mode === "fast"} className={`ag-mode${form.mode === "fast" ? " is-on" : ""}`} onClick={() => set("mode", "fast")}>
              <span className="ag-mode-icon"><Zap size={20} aria-hidden="true" /></span>
              <span className="ag-mode-text">
                <strong>Without enrichment <em>Free</em></strong>
                <span>Finds companies on Google Maps and emails them at the address on their own website. Same message for everyone.</span>
                <span className="ag-tools"><i>Google Maps</i><i>Website</i><i>Mail server check</i></span>
              </span>
            </button>
            <button type="button" role="radio" aria-checked={form.mode === "smart"} className={`ag-mode${form.mode === "smart" ? " is-on" : ""}`} onClick={() => set("mode", "smart")}>
              <span className="ag-mode-icon"><Sparkles size={20} aria-hidden="true" /></span>
              <span className="ag-mode-text">
                <strong>With enrichment <em>Uses credits</em></strong>
                <span>The owners&apos; own emails, checked, each with an opening line written by AI.</span>
                <span className="ag-tools"><i>Google Maps</i><i>Hunter</i><i>Reoon</i><i>AI</i></span>
              </span>
            </button>
            <button type="button" role="radio" aria-checked={bulk} className={`ag-mode${bulk ? " is-on" : ""}`} onClick={() => set("mode", "bulk")}>
              <span className="ag-mode-icon"><ListPlus size={20} aria-hidden="true" /></span>
              <span className="ag-mode-text">
                <strong>Bulk send <em>Your list</em></strong>
                <span>Paste your own emails or upload a CSV, write the message, and the agent sends it.</span>
                <span className="ag-tools"><i>Your list</i><i>Email check</i><i>Your message</i></span>
              </span>
            </button>
          </div>
        </fieldset>

        {bulk ? (
          <div className="ag-bulk">
            <fieldset className="ag-section">
              <legend><span>02</span> Your list <em className="ag-legend-count">{recipients.length} email{recipients.length === 1 ? "" : "s"}</em></legend>
              <label className="ag-field">
                <span className="ag-label">One per line: email, name, company (name and company optional)</span>
                <textarea className="input ag-textarea" rows={11} value={form.list} onChange={(e) => set("list", e.target.value)} spellCheck={false}
                  placeholder={"john@acmebuilders.com, John Smith, Acme Builders\nsara@northline.com, Sara Khan\ninfo@lonestar.com"} />
              </label>
              <div className="ag-list-tools">
                <label className="ag-btn ag-btn--ghost ag-upload">
                  <FileUp size={15} aria-hidden="true" /> Upload CSV
                  <input type="file" accept=".csv,text/csv,.txt" className="sr-only" onChange={(e) => { readFile(e.target.files?.[0]); e.target.value = ""; }} />
                </label>
                <span className="ag-hint">Every email is checked before sending. Duplicates and anyone emailed before are skipped.</span>
              </div>
            </fieldset>
            <fieldset className="ag-section">
              <legend><span>03</span> Your message</legend>
              <label className="ag-field">
                <span className="ag-label">Subject</span>
                <input className="input" value={form.subject} onChange={(e) => set("subject", e.target.value)} placeholder={`e.g. ${bulkDefaults.subject || "Drafting support for {{company}}"}`} />
              </label>
              <label className="ag-field">
                <span className="ag-label">Message</span>
                <textarea className="input ag-textarea" rows={9} value={form.message} onChange={(e) => set("message", e.target.value)}
                  placeholder={bulkDefaults.message ? `For example:\n\n${bulkDefaults.message}` : "Write your message. Use {{greeting}} for \"Hi John,\"."} />
              </label>
              <div className="ag-list-tools">
                {!form.message && bulkDefaults.message && (
                  <button type="button" className="ag-token" onClick={() => setForm((f) => ({ ...f, subject: f.subject || bulkDefaults.subject, message: bulkDefaults.message }))}>
                    Use my saved message
                  </button>
                )}
                {["{{greeting}}", "{{first_name}}", "{{company}}"].map((t) => (
                  <button key={t} type="button" className="ag-token" onClick={() => insert(t)}>{t}</button>
                ))}
                <span className="ag-hint">{"{{greeting}}"} is &ldquo;Hi John,&rdquo;, or &ldquo;Hi there,&rdquo; when the list has no name.</span>
              </div>
            </fieldset>
          </div>
        ) : (
          <>
            <fieldset className="ag-section">
              <legend><span>02</span> Target</legend>
              <div className="ag-fields">
                <label className="ag-field">
                  <span className="ag-label">Country</span>
                  <Combobox value={form.country} onChange={(v) => set("country", v)} options={COUNTRIES} placeholder="Pick a country" />
                </label>
                {us && (
                  <label className="ag-field">
                    <span className="ag-label">State</span>
                    <Combobox value={form.state} onChange={(v) => set("state", v)} options={US_STATES} placeholder="e.g. Texas" />
                  </label>
                )}
                <label className="ag-field">
                  <span className="ag-label">City</span>
                  <input className="input" value={form.city} onChange={(e) => set("city", e.target.value)} placeholder="e.g. Houston" />
                </label>
                <label className="ag-field">
                  <span className="ag-label">Kind of company</span>
                  <Select value={form.company_type} onChange={(v) => set("company_type", v)}
                    options={COMPANY_TYPES.filter((t) => t.id !== "other").map((t) => ({ value: t.id, label: t.label }))} />
                </label>
              </div>
            </fieldset>

            <fieldset className="ag-section">
              <legend><span>03</span> How many companies</legend>
              <div className="ag-sizes" role="radiogroup" aria-label="How many companies">
                {SIZES.map((n) => (
                  <button key={n} type="button" role="radio" aria-checked={form.limit === n} className={form.limit === n ? "is-on" : ""} onClick={() => set("limit", n)}>
                    <strong>{n}</strong><span>companies</span>
                  </button>
                ))}
              </div>
            </fieldset>
          </>
        )}

        <div className="ag-launchbar">
          <code className="ag-query"><span>›</span> {query}</code>
          <div className="ag-launch-row">
            <button type="button" className="ag-btn ag-btn--ghost" onClick={() => setShowForm(false)}>Back</button>
            <button type="submit" className="ag-launch" disabled={starting || !mailbox.connected}>
              {starting ? <LoaderCircle size={20} className="spin" aria-hidden="true" /> : <Zap size={20} aria-hidden="true" />}
              {starting ? "Launching…" : bulk ? `Send to ${recipients.length}` : "Launch agent"}
              <ArrowRight size={20} aria-hidden="true" />
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}