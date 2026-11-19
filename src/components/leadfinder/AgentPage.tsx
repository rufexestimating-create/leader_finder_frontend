"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft, ArrowRight, Bot, Building2, CircleAlert, CircleCheck, FileUp, FlaskConical, Globe, LayoutDashboard, Link2, ListPlus, LoaderCircle, Mail, Plus, Radar, RotateCw,
  Send, ShieldCheck, Sparkles, Square, Terminal, Zap,
} from "lucide-react";
import type { ConfirmRequest } from "@/components/dashboard/ConfirmDialog";
import { COMPANY_TYPES, COUNTRIES, US_STATES } from "@/lib/leadFinder";
import { AGENT_ACTIVE, type AgentRun, type Mailbox, call, send, toAgentRun } from "@/lib/leadFinderApi";
import { MODE_LABEL, STATUS, canResume, progressOf, runName, siteOf, statusLabel, typeLabel } from "./agentRun";
import { AgentsPanel } from "./AgentsPanel";
import { Combobox, Select } from "./Dropdown";

const POLL_MS = 3000;
const SIZES = [10, 25, 50, 100, 250, 500, 1000, 1500, 2000, 2500, 3000, 3500, 4000, 4500, 5000, 6000, 7500, 10000];
const STEP_ICON: Record<string, React.ReactNode> = {
  find: <Radar size={18} />, save: <Building2 size={18} />, read: <Globe size={18} />, emails: <Mail size={18} />, enrich: <Sparkles size={18} />,
  send: <Send size={18} />, check: <ShieldCheck size={18} />,
};
const SHORT: Record<string, string> = {
  find: "Find companies", save: "Save companies", read: "Read websites", emails: "Find emails", enrich: "Enrich owners", send: "Send emails", check: "Check emails",
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

/** ReachAgent's automatic runs: brief an agent, launch it, watch it work. Several can work at once, each its own run. */
export function AgentPage({
  mailbox,
  notify,
  confirm,
  openRunId,
  startWithBrief = false,
  onOpenCompany,
  onSeeResults,
  onClosed,
  onNewAgent,
  onOpenRun,
  onDashboard,
  onOpenMailbox,
  bulkDefaults,
}: {
  /** Subject and message the message pages start from (the "without enrichment" message in Settings) */
  bulkDefaults: { subject: string; message: string };
  mailbox: Mailbox | null;
  notify: (msg: string, isError?: boolean) => void;
  confirm: (r: ConfirmRequest) => void;
  /** The run to watch; none shows the agent home with every agent working */
  openRunId: string | null;
  /** Open the brief straight away ("New agent") */
  startWithBrief?: boolean;
  onOpenCompany: (id: string) => void;
  onSeeResults: (runId: string) => void;
  onClosed: () => void;
  onNewAgent: () => void;
  onOpenRun: (runId: string) => void;
  onDashboard: () => void;
  onOpenMailbox: () => void;
}) {
  const [run, setRun] = useState<AgentRun | null>(null);
  const [runMissing, setRunMissing] = useState(false);
  const [form, setForm] = useState({
    country: "United States", state: "Texas", city: "", company_type: "gc", limit: 10, mode: "fast" as "fast" | "smart" | "bulk",
    source: "maps" as "maps" | "directory", directory_url: "",
    list: "", subject: "", message: "",
  });
  // "Check link": page 1 of the pasted directory, opened by the server
  const [dirCheck, setDirCheck] = useState<{ url: string; state: "checking" | "ok" | "bad"; text: string } | null>(null);
  const recipients = form.mode === "bulk" ? parseRecipients(form.list) : [];
  const [starting, setStarting] = useState(false);
  const [showForm, setShowForm] = useState(startWithBrief);
  // Without enrichment the brief has a second page: the message this agent sends
  const [page, setPage] = useState<"brief" | "message">("brief");
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const us = form.country === "United States";
  const testMode = mailbox?.connected && mailbox.test_mode !== false;
  const active = !!run && AGENT_ACTIVE.includes(run.status);

  const loadRun = useCallback(async (id: string) => {
    const res = await call<Record<string, unknown>>(`/agent/runs/${id}`);
    if (res.data) setRun(toAgentRun(res.data));
    else setRunMissing(true);
  }, []);

  useEffect(() => {
    if (!openRunId) return;
    const first = setTimeout(() => loadRun(openRunId), 0);
    return () => clearTimeout(first);
  }, [loadRun, openRunId]);

  useEffect(() => {
    if (!run || !active) return;
    const t = setInterval(() => loadRun(run.id), POLL_MS);
    return () => clearInterval(t);
  }, [run, active, loadRun]);

  const start = async () => {
    const bulk = form.mode === "bulk";
    const fast = form.mode === "fast";
    if (bulk && !recipients.length) return notify("Paste at least one email, or upload a CSV.", true);
    if (bulk && recipients.length > 1000) return notify("At most 1,000 emails in one run.", true);
    const directory = !bulk && form.source === "directory";
    if (directory && !form.directory_url.trim()) return notify("Paste the directory's link first.", true);
    if (!bulk && !directory && !form.city.trim()) return notify("Type a city first.", true);
    if (fast && page === "brief") {
      // Next: the message page, starting from the saved message the first time
      setForm((f) => ({ ...f, subject: f.subject || bulkDefaults.subject, message: f.message || bulkDefaults.message }));
      setPage("message");
      return;
    }
    if ((bulk || fast) && (!form.subject.trim() || !form.message.trim())) return notify("Write a subject and a message.", true);
    setStarting(true);
    const target = directory
      ? { source: "directory", directory_url: form.directory_url.trim(), country: "United States", company_type: form.company_type, limit: form.limit }
      : { source: "maps", country: form.country, state: us ? form.state : "", city: form.city, company_type: form.company_type, limit: form.limit };
    const body = bulk
      ? { mode: "bulk", recipients, subject: form.subject, message: form.message }
      : fast
        ? { mode: "fast", ...target, subject: form.subject, message: form.message }
        : { mode: form.mode, ...target };
    const res = await call<Record<string, unknown>>("/agent/runs", send("POST", body));
    setStarting(false);
    if (res.error || !res.data) return notify(res.error ?? "The agent couldn't start.", true);
    setRun(toAgentRun(res.data));
  };

  const checkDirectory = async () => {
    const url = form.directory_url.trim();
    if (!url) return notify("Paste the directory's link first.", true);
    setDirCheck({ url, state: "checking", text: "Opening page 1…" });
    const res = await call<{ site: string; companies: number; tested: boolean }>("/agent/directory/check", send("POST", { url }));
    if (res.error || !res.data) return setDirCheck({ url, state: "bad", text: res.error ?? "This link couldn't be checked." });
    const d = res.data;
    setDirCheck({
      url, state: "ok",
      text: `${d.companies} companies on page 1 of ${d.site}. ${d.tested
        ? "This directory is supported: the agent goes through its pages until it has enough."
        : "This directory hasn't been tested yet: the agent will try, but some links it finds may not be companies."}`,
    });
  };

  const stop = () =>
    run &&
    confirm({
      title: "Stop the agent?",
      message: "It stops after the step it is on. Companies already found stay in Results, and no more emails are sent from this agent. Your other agents keep working.",
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

  const [resuming, setResuming] = useState(false);
  const resume = async () => {
    if (!run) return;
    setResuming(true);
    const res = await call<Record<string, unknown>>(`/agent/runs/${run.id}/resume`, send("POST"));
    setResuming(false);
    if (res.error || !res.data) return notify(res.error ?? "The agent couldn't carry on.", true);
    setRun(toAgentRun(res.data));
    notify("The agent carries on from where it stopped.");
  };

  const newRun = () => {
    setRun(null);
    setShowForm(false);
    onClosed();
  };

  // While an opened agent's report loads, hold a loader instead of flashing the home screen
  if (!mailbox || (openRunId && !run && !runMissing)) return <div className="ag-console ag-loading"><Core state="live" size="sm" /></div>;

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
      : run.status === "queued" ? (run.queue_position && run.queue_position > 1 ? `Waiting for a free slot (#${run.queue_position} in line)` : "Starting up")
      : c.current ? `Reading ${c.current}` : running ? SHORT[running.id] ?? running.label : "Booting up";
    const tiles: [string, number | undefined][] = bulk
      ? [["On your list", c.total], ["Checked", c.checked], ["Ready to send", c.emails], ["Removed", c.removed], ["Sent", c.sent]]
      : smart
      ? [["On Google Maps", c.found], ["New companies", c.new], ["Enriched", c.read], ["People", c.people], ["Emails picked", c.emails], ["Sent", c.sent]]
      : [["Found", c.found], ["New companies", c.new], ["Websites read", c.read], ["Emails found", c.emails], ["Sent", c.sent]];
    const log = [...(c.log ?? [])].reverse().slice(0, 40);

    return (
      <section className="ag">
        <div className="ag-console">
          <div className="ag-hero">
            <Core state={st.tone === "live" ? "live" : st.tone} progress={progress} />
            <div className="ag-hero-text">
              <span className="ag-eyebrow">
                <i className={`ag-dot is-${st.tone}`} aria-hidden="true" /> {statusLabel(run)}
                <span className="ag-sep">/</span> {MODE_LABEL[run.mode]}
                {testMode && <><span className="ag-sep">/</span><FlaskConical size={13} aria-hidden="true" /> Test mode</>}
              </span>
              <h2 className="ag-title" aria-live="polite">{headline}{active && <span className="ag-caret" aria-hidden="true" />}</h2>
              <p className="ag-sub">
                {bulk
                  ? `${c.total ?? run.filters.recipients?.length ?? 0} addresses from your list · ${run.filters.subject ?? ""}`
                  : `${runName(run)}${run.filters.source === "directory" ? "" : `, ${run.filters.country}`} · up to ${run.filters.limit} companies`
                    + (run.mode === "fast" && run.filters.subject ? ` · “${run.filters.subject}”` : "")}
              </p>
              <div className="ag-actions">
                {active && <button type="button" className="ag-btn ag-btn--ghost" onClick={stop}><Square size={15} aria-hidden="true" /> Stop agent</button>}
                {canResume(run) && (
                  <button type="button" className="ag-btn ag-btn--primary" onClick={resume} disabled={resuming}>
                    <RotateCw size={16} aria-hidden="true" className={resuming ? "spin" : undefined} /> {resuming ? "Carrying on…" : "Continue from where it stopped"}
                  </button>
                )}
                <button type="button" className={`ag-btn ${active || canResume(run) ? "ag-btn--ghost" : "ag-btn--primary"}`} onClick={active ? onNewAgent : newRun}>
                  {active ? <Plus size={16} aria-hidden="true" /> : <Zap size={16} aria-hidden="true" />} {active ? "Start another agent" : "New mission"}
                </button>
                <button type="button" className="ag-btn ag-btn--ghost" onClick={onDashboard}><LayoutDashboard size={15} aria-hidden="true" /> All agents</button>
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
                    : !p ? (smart ? "No usable email" : "No email") : picked.some((x) => x.sentAt) || p.sentAt ? "Sent"
                    : p.sendError ? "Not sent" : smart ? (p.emailStatus === "valid" ? `${picked.length} verified` : "Risky, picked") : bulk ? "Ready" : "Email found";
                  const tone = state === "Sent" ? "ok" : state === "Not sent" || state === "Failed" ? "bad" : now ? "live"
                    : state === "Email found" || state === "Ready" || state === "Risky, picked" || state.endsWith("verified") ? "info" : "idle";
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
          <p className="ag-home-sub">Give it a city and a kind of company. It searches Google Maps, BBB and OpenStreetMap, reads every website in depth, finds the emails and sends your message, on its own. Run several agents at once, each with its own city and message.</p>
          <button type="button" className="ag-launch ag-launch--xl" onClick={() => setShowForm(true)}>
            <Zap size={24} aria-hidden="true" /> START AGENT
          </button>
          <ul className="ag-caps">
            <li><Radar size={14} aria-hidden="true" /> Maps and directories</li>
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
        <div className="ag-home-agents">
          <AgentsPanel notify={notify} confirm={confirm} onOpen={onOpenRun} onNew={() => setShowForm(true)} />
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
    : `${typeLabel(form.company_type).toLowerCase()} ${form.source === "directory"
      ? `from ${form.directory_url.trim() ? siteOf(form.directory_url.trim()) : "…"}`
      : `in ${[form.city.trim() || "…", us ? form.state : form.country].filter(Boolean).join(", ")}`} · ${form.limit} companies · ${form.mode === "smart" ? "with" : "without"} enrichment`;
  const insert = (token: string) => set("message", `${form.message}${form.message.endsWith("\n") || !form.message ? "" : " "}${token}`);

  /* ---------- Without enrichment, page 2: the message this agent sends ---------- */
  if (form.mode === "fast" && page === "message") {
    return (
      <section className="ag">
        <form className="ag-console ag-brief" onSubmit={(e) => { e.preventDefault(); start(); }}>
          <div className="ag-brief-head">
            <Core state="live" size="sm" />
            <div>
              <span className="ag-eyebrow"><i className="ag-dot is-live" aria-hidden="true" /> Mission brief · step 2 of 2</span>
              <h2 className="ag-brief-title">Your message</h2>
              <p className="ag-sub">Everyone this agent finds gets this message. It starts from your saved message; changes here are for this agent only.</p>
            </div>
            {testMode && <span className="ag-chip"><FlaskConical size={13} aria-hidden="true" /> Test mode: all emails to {mailbox.email}</span>}
          </div>

          <fieldset className="ag-section">
            <legend><span>04</span> Message</legend>
            <label className="ag-field">
              <span className="ag-label">Subject</span>
              <input className="input" value={form.subject} onChange={(e) => set("subject", e.target.value)} maxLength={200}
                placeholder="e.g. Drafting support for {{company}}" />
            </label>
            <label className="ag-field">
              <span className="ag-label">Message</span>
              <textarea className="input ag-textarea" rows={12} value={form.message} onChange={(e) => set("message", e.target.value)} maxLength={5000}
                placeholder={"Write your message. Use {{greeting}} for \"Hi John,\" or \"Hi Acme Builders team,\"."} />
            </label>
            <div className="ag-list-tools">
              {(form.subject !== bulkDefaults.subject || form.message !== bulkDefaults.message) && bulkDefaults.message && (
                <button type="button" className="ag-token" onClick={() => setForm((f) => ({ ...f, subject: bulkDefaults.subject, message: bulkDefaults.message }))}>
                  Back to my saved message
                </button>
              )}
              {["{{greeting}}", "{{first_name}}", "{{company}}", "{{city}}"].map((t) => (
                <button key={t} type="button" className="ag-token" onClick={() => insert(t)}>{t}</button>
              ))}
              <span className="ag-hint">{"{{greeting}}"} is &ldquo;Hi John,&rdquo; when the website names someone, else &ldquo;Hi Acme Builders team,&rdquo;.</span>
            </div>
          </fieldset>

          <div className="ag-launchbar">
            <code className="ag-query"><span>›</span> {query}</code>
            <div className="ag-launch-row">
              <button type="button" className="ag-btn ag-btn--ghost" onClick={() => setPage("brief")}><ArrowLeft size={16} aria-hidden="true" /> Back</button>
              <button type="submit" className="ag-launch" disabled={starting || !mailbox.connected}>
                {starting ? <LoaderCircle size={20} className="spin" aria-hidden="true" /> : <Zap size={20} aria-hidden="true" />}
                {starting ? "Launching…" : "Launch agent"}
                <ArrowRight size={20} aria-hidden="true" />
              </button>
            </div>
          </div>
        </form>
      </section>
    );
  }

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
                <span>Finds companies on Google Maps, BBB and OpenStreetMap or on a directory you paste, reads their team, about and contact pages, and emails them. Same message for everyone.</span>
                <span className="ag-tools"><i>Google Maps</i><i>BBB</i><i>OpenStreetMap</i><i>Directories</i><i>Deep website read</i><i>Mail server check</i></span>
              </span>
            </button>
            <button type="button" role="radio" aria-checked={form.mode === "smart"} className={`ag-mode${form.mode === "smart" ? " is-on" : ""}`} onClick={() => setForm((f) => ({ ...f, mode: "smart" }))}>
              <span className="ag-mode-icon"><Sparkles size={20} aria-hidden="true" /></span>
              <span className="ag-mode-text">
                <strong>With enrichment <em>Uses credits</em></strong>
                <span>The owners&apos; own emails, checked, each with an opening line written by AI.</span>
                <span className="ag-tools"><i>Google Maps</i><i>Directories</i><i>Hunter</i><i>Reoon</i><i>AI</i></span>
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
              <div className="ag-source" role="radiogroup" aria-label="Where to look">
                <button type="button" role="radio" aria-checked={form.source === "maps"} className={form.source === "maps" ? "is-on" : ""} onClick={() => set("source", "maps")}>
                  <Radar size={17} aria-hidden="true" />
                  <span><strong>City search</strong><em>Google Maps, BBB and OpenStreetMap in one city</em></span>
                </button>
                <button type="button" role="radio" aria-checked={form.source === "directory"} className={form.source === "directory" ? "is-on" : ""} onClick={() => set("source", "directory")}>
                  <Link2 size={17} aria-hidden="true" />
                  <span><strong>Directory link</strong><em>Every company on a directory you paste</em></span>
                </button>
              </div>
              {form.source === "directory" ? (
                <div className="ag-fields">
                  <div className="ag-field ag-field--wide">
                    <span className="ag-label" id="dir-url-label">Directory link (the page that lists many companies)</span>
                    <div className="ag-dir-row">
                      <input className="input" type="url" inputMode="url" aria-labelledby="dir-url-label" value={form.directory_url} spellCheck={false}
                        onChange={(e) => { set("directory_url", e.target.value); setDirCheck(null); }}
                        placeholder="https://www.theconstructionusa.com/directory/?secteur=general-contractor&region=texas" />
                      <button type="button" className="ag-btn ag-btn--ghost" onClick={checkDirectory} disabled={dirCheck?.state === "checking"}>
                        {dirCheck?.state === "checking" ? <LoaderCircle size={15} className="spin" aria-hidden="true" /> : <ShieldCheck size={15} aria-hidden="true" />}
                        Check link
                      </button>
                    </div>
                    {dirCheck && dirCheck.url === form.directory_url.trim() && (
                      <span className={`ag-dir-check is-${dirCheck.state}`} role="status">
                        {dirCheck.state === "ok" ? <CircleCheck size={14} aria-hidden="true" /> : dirCheck.state === "bad" ? <CircleAlert size={14} aria-hidden="true" /> : null}
                        {dirCheck.text}
                      </span>
                    )}
                    <span className="ag-hint">
                      Works best with theconstructionusa.com, exchange.construction and other GeoDirectory sites. Sites behind a
                      &ldquo;checking your browser&rdquo; screen may not open. Companies you already have are skipped.
                    </span>
                  </div>
                  <label className="ag-field">
                    <span className="ag-label">Kind of company</span>
                    <Select value={form.company_type} onChange={(v) => set("company_type", v)}
                      options={COMPANY_TYPES.filter((t) => t.id !== "other").map((t) => ({ value: t.id, label: t.label }))} />
                  </label>
                </div>
              ) : (
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
              )}
            </fieldset>

            <fieldset className="ag-section">
              <legend><span>03</span> How many companies</legend>
              <div className="ag-field ag-size-pick">
                <Select ariaLabel="How many companies" value={String(form.limit)} onChange={(v) => set("limit", Number(v))}
                  options={SIZES.map((n) => ({ value: String(n), label: `${n.toLocaleString("en-US")} companies` }))} />
                <p className="ag-hint">
                  {form.mode === "smart" && form.limit > 50
                    ? "Every company spends Hunter, Reoon and AI credits: make sure your plans have enough for this many."
                    : form.limit > 1000
                      ? "A big run takes hours: every website is read one by one, and emails go out within your daily limit."
                      : "The agent stops as soon as it has this many new companies with a website."}
                </p>
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
              {starting ? "Launching…" : bulk ? `Send to ${recipients.length}` : form.mode === "fast" ? "Next: your message" : "Launch agent"}
              <ArrowRight size={20} aria-hidden="true" />
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}