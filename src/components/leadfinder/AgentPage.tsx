"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft, ArrowRight, Bot, Building2, Check, CircleAlert, CircleCheck, FileUp, FlaskConical, Globe, Link2, ListPlus, LoaderCircle, Mail, Plus, Radar, RotateCw,
  Send, ShieldCheck, Sparkles, Square, Terminal, Zap,
} from "lucide-react";
import { CountUp, SplitWords } from "@/components/motion";
import type { ConfirmRequest } from "@/components/dashboard/ConfirmDialog";
import { COMPANY_TYPES, COUNTRIES, US_STATES } from "@/lib/leadFinder";
import { AGENT_ACTIVE, type AgentRun, type Mailbox, call, send, toAgentRun } from "@/lib/leadFinderApi";
import { MODE_LABEL, STATUS, canResume, place, progressOf, runName, siteOf, statusLabel, typeLabel } from "./agentRun";
import { AgentsPanel } from "./AgentsPanel";
import { Combobox, Select } from "./Dropdown";
import { DirectoryExtractor } from "./DirectoryExtractor";

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
const MODES: {
  id: "fast" | "smart" | "bulk"; name: string; tag: string; icon: React.ReactNode; desc: string; best: string; tools: string[]; flow: { t: string; d: string }[];
}[] = [
  { id: "fast", name: "Without enrichment", tag: "Free", icon: <Zap size={18} />,
    desc: "Finds companies, reads their websites for emails, and sends everyone the same message.",
    best: "reaching many companies fast", tools: ["Google Maps", "BBB", "OpenStreetMap", "Directories"],
    flow: [
      { t: "Find companies", d: "Searches Google Maps, BBB and OpenStreetMap, or your directory link." },
      { t: "Read their websites", d: "Opens each site's team, about and contact pages for emails." },
      { t: "Check the emails", d: "Asks each mail server so messages don't bounce." },
      { t: "Send your message", d: "Same email for everyone, within your daily limit." },
    ] },
  { id: "smart", name: "With enrichment", tag: "Uses credits", icon: <Sparkles size={18} />,
    desc: "Finds the owner's own email, checks it, and writes each person a personal opening line.",
    best: "fewer, better leads", tools: ["Hunter", "Reoon", "AI writer"],
    flow: [
      { t: "Find companies", d: "Searches Google Maps and directories in your area." },
      { t: "Find the owner", d: "Hunter finds the decision maker and their own email." },
      { t: "Check the email", d: "Reoon confirms it really exists." },
      { t: "Write a personal line", d: "AI writes one opening sentence for each person." },
      { t: "Send your message", d: "Your email with their line, within your daily limit." },
    ] },
  { id: "bulk", name: "Bulk send", tag: "Your list", icon: <ListPlus size={18} />,
    desc: "Paste emails or upload a CSV. Every address is checked, then your message goes out.",
    best: "contacts you already have", tools: ["Your list", "Email check"],
    flow: [
      { t: "Read your list", d: "Pasted emails or a CSV, duplicates removed." },
      { t: "Check every address", d: "Bad and risky emails are taken out." },
      { t: "Send your message", d: "One by one, within your daily limit." },
    ] },
];

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
  smartDefaults,
}: {
  /** Saved subject and message offered on the message step: without enrichment and bulk send */
  bulkDefaults: { subject: string; message: string };
  /** Saved subject and message offered with enrichment ({{personal_line}} is written per person) */
  smartDefaults: { subject: string; message: string };
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
  // The brief is three steps: how it works, where to look (or the list), what it says
  const [step, setStep] = useState<1 | 2 | 3>(1);
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

  /** What is still missing before moving past this step, or null */
  const missing = (upTo: 1 | 2 | 3): string | null => {
    const bulk = form.mode === "bulk";
    const directory = !bulk && form.source === "directory";
    if (upTo >= 2) {
      if (bulk && !recipients.length) return "Paste at least one email, or upload a CSV.";
      if (bulk && recipients.length > 1000) return "At most 1,000 emails in one run.";
      if (directory && !form.directory_url.trim()) return "Paste the directory's link first.";
      if (!bulk && !directory && !form.city.trim()) return "Type a city first.";
    }
    if (upTo >= 3 && (!form.subject.trim() || !form.message.trim())) return "Write a subject and a message.";
    return null;
  };
  const goTo = (n: 1 | 2 | 3) => {
    const gap = n > 2 ? missing(2) : null;
    if (gap) return notify(gap, true);
    setStep(n);
  };

  const start = async () => {
    if (step < 3) return goTo((step + 1) as 2 | 3);
    const bulk = form.mode === "bulk";
    const directory = !bulk && form.source === "directory";
    const gap = missing(3);
    if (gap) return notify(gap, true);
    setStarting(true);
    const target = directory
      ? { source: "directory", directory_url: form.directory_url.trim(), country: "United States", company_type: form.company_type, limit: form.limit }
      : { source: "maps", country: form.country, state: us ? form.state : "", city: form.city, company_type: form.company_type, limit: form.limit };
    const body = bulk
      ? { mode: "bulk", recipients, subject: form.subject, message: form.message }
      : { mode: form.mode, ...target, subject: form.subject, message: form.message };
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

    const title = bulk ? "Your own list" : runName(run);
    const where = bulk
      ? `${c.total ?? run.filters.recipients?.length ?? 0} addresses · ${run.filters.subject ?? ""}`
      : `${run.filters.source === "directory" ? place(run.filters) : [run.filters.city, run.filters.state, run.filters.country].filter(Boolean).join(", ")} · up to ${run.filters.limit} companies`
        + (run.mode === "fast" && run.filters.subject ? ` · “${run.filters.subject.replace(/\{\{\s*(\w+)\s*\}\}/g, "[$1]")}”` : "");
    const bigNote = active ? headline
      : run.status === "done" ? headline
      : run.status === "failed" ? "Couldn't finish"
      : run.status === "stopped" ? "Stopped by you"
      : st.label;
    const notice = run.status === "failed"
      ? { tone: "bad", title: "The agent hit a problem", body: run.error ?? "Something went wrong on this step." }
      : run.status === "stopped"
        ? { tone: "idle", title: "You stopped this agent", body: "Everything it found so far is saved." }
        : run.status === "waiting"
          ? { tone: "warn", title: "Paused until tomorrow", body: "Today's sending limit is reached. It carries on by itself tomorrow." }
          : null;

    return (
      <section className="ag ar">
        <header className="ar-head">
          <div className="ar-crumbs">
            <button type="button" className="ar-back" onClick={onDashboard}><ArrowLeft size={15} aria-hidden="true" /> All agents</button>
            <span className={`ar-pill is-${st.tone}`}><i aria-hidden="true" />{statusLabel(run)}</span>
            <span className="ar-pill">{MODE_LABEL[run.mode]}</span>
            {testMode && <span className="ar-pill"><FlaskConical size={12} aria-hidden="true" /> Test mode</span>}
          </div>

          <div className="ar-hero">
            <div className="ar-hero-text">
              <h2 className="ar-title"><SplitWords text={title} /></h2>
              <p className="ar-sub">{where}</p>
              <div className="ar-actions">
                {canResume(run) && (
                  <button type="button" className="btn btn-accent btn-lg" onClick={resume} disabled={resuming} data-magnetic>
                    <RotateCw size={16} aria-hidden="true" className={resuming ? "spin" : undefined} /> {resuming ? "Carrying on…" : "Continue from where it stopped"}
                  </button>
                )}
                {!active && !canResume(run) && (
                  <button type="button" className="btn btn-accent btn-lg" onClick={newRun} data-magnetic><Zap size={16} aria-hidden="true" /> New mission</button>
                )}
                {active && <button type="button" className="btn btn-secondary btn-lg ar-stop" onClick={stop}><Square size={14} aria-hidden="true" /> Stop agent</button>}
                {(active || canResume(run)) && (
                  <button type="button" className="btn btn-secondary btn-lg" onClick={active ? onNewAgent : newRun}>
                    {active ? <Plus size={16} aria-hidden="true" /> : <Zap size={16} aria-hidden="true" />} {active ? "Start another agent" : "New mission"}
                  </button>
                )}
                {!!c.new && <button type="button" className="btn btn-secondary btn-lg" onClick={() => onSeeResults(run.id)}>See in Results <ArrowRight size={15} aria-hidden="true" /></button>}
              </div>
            </div>
            <div className={`ar-big is-${st.tone}`} aria-live="polite">
              <strong className="ar-pct"><CountUp value={progress} suffix="%" /></strong>
              <span className="ar-note">{bigNote}{active && <span className="ag-caret" aria-hidden="true" />}</span>
            </div>
          </div>

          <div className="ar-bar" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Progress">
            <i className={`is-${st.tone}`} style={{ width: `${Math.max(progress, 1)}%` }} />
          </div>
        </header>

        {notice && (
          <div className={`ar-notice is-${notice.tone}`} role={notice.tone === "bad" ? "alert" : "status"}>
            <span className="ar-notice-icon" aria-hidden="true"><CircleAlert size={20} /></span>
            <div>
              <strong>{notice.title}</strong>
              <p>{notice.body}{canResume(run) ? " Your progress is saved: Continue picks up from this step." : ""}</p>
            </div>
          </div>
        )}

        <ol className="ar-steps">
          {run.steps.map((s, i) => (
            <li key={s.id} className={`ar-step is-${s.state}`}>
              <span className="ar-step-top">
                <span className="ar-step-num">{String(i + 1).padStart(2, "0")}</span>
                <span className="ar-step-icon" aria-hidden="true">
                  {s.state === "done" ? <CircleCheck size={18} /> : s.state === "failed" ? <CircleAlert size={18} /> : s.state === "running" ? <LoaderCircle size={18} className="spin" /> : STEP_ICON[s.id]}
                </span>
              </span>
              <strong>{SHORT[s.id] ?? s.label}</strong>
              <span className="ar-step-note">{s.state === "failed" ? "Stopped here" : s.note || (s.state === "pending" ? "Waiting" : s.state === "done" ? "Done" : "")}</span>
            </li>
          ))}
        </ol>

        <ul className="ar-stats">
          {tiles.map(([label, value]) => (
            <li key={label}><strong><CountUp value={value ?? 0} /></strong><span>{label}</span></li>
          ))}
        </ul>

        <div className="ag-grid">
          <div className="ag-panel ag-term">
            <div className="ag-panel-head">
              <span><Terminal size={15} aria-hidden="true" /> Activity</span>
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
          <h2 className="ag-home-title"><SplitWords text="What should ReachAgent find today?" /></h2>
          <p className="ag-home-sub">Give it a city and a kind of company. It searches Google Maps, BBB and OpenStreetMap, reads every website in depth, finds the emails and sends your message, on its own. Run several agents at once, each with its own city and message.</p>
          <button type="button" className="ag-launch ag-launch--xl" onClick={() => setShowForm(true)} data-magnetic>
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

  const defaults = form.mode === "smart" ? smartDefaults : bulkDefaults;
  const tokens = form.mode === "smart" ? ["{{first_name}}", "{{company}}", "{{personal_line}}"]
    : bulk ? ["{{greeting}}", "{{first_name}}", "{{company}}"] : ["{{greeting}}", "{{first_name}}", "{{company}}", "{{city}}"];
  const tokenHint = form.mode === "smart"
    ? <>{"{{personal_line}}"} is one opening sentence the AI writes for each person from what it found.</>
    : bulk
      ? <>{"{{greeting}}"} is &ldquo;Hi John,&rdquo;, or &ldquo;Hi there,&rdquo; when the list has no name.</>
      : <>{"{{greeting}}"} is &ldquo;Hi John,&rdquo; when the website names someone, else &ldquo;Hi Acme Builders team,&rdquo;.</>;
  const mode = MODES.find((m) => m.id === form.mode) ?? MODES[0];
  const where = bulk
    ? recipients.length ? `${recipients.length} address${recipients.length === 1 ? "" : "es"}` : "No list yet"
    : form.source === "directory" ? (form.directory_url.trim() ? siteOf(form.directory_url.trim()) : "No link yet")
      : form.city.trim() ? `${form.city.trim()}, ${us ? form.state : form.country} · ${form.limit}` : "No city yet";
  const steps = [
    { n: 1 as const, title: "How it works", value: mode.name },
    { n: 2 as const, title: bulk ? "Who gets it" : "Where to look", value: where },
    { n: 3 as const, title: "Your message", value: form.subject.trim() || "Not written yet" },
  ];
  const head = step === 1
    ? { title: "How should it work?", sub: "Click the card that fits you, then press Next at the bottom." }
    : step === 2
      ? bulk ? { title: "Who should get it?", sub: "Paste your list or upload a CSV. Every address is checked first." }
        : { title: "Where should it look?", sub: "A city to search, or a directory page that lists many companies." }
      : { title: "What should it say?", sub: form.mode === "smart"
          ? "Write the email. Where you put {{personal_line}}, the AI adds an opening line written for each person."
          : "Write the email everyone gets. The blanks fill in for each company." };

  return (
    <section className="ag">
      <form className="ag-console ag-brief wz" onSubmit={(e) => { e.preventDefault(); start(); }}>
        <div className="wz-top">
          <span className="ag-eyebrow">New agent</span>
          {testMode && <span className="ag-chip"><FlaskConical size={13} aria-hidden="true" /> Test mode: all emails to {mailbox.email}</span>}
        </div>

        <ol className="wz-steps" aria-label="Steps">
          {steps.map((x) => (
            <li key={x.n} className={x.n === step ? "is-now" : x.n < step ? "is-done" : ""}>
              <button type="button" onClick={() => (x.n < step ? setStep(x.n) : x.n > step ? goTo(x.n) : undefined)} aria-current={x.n === step ? "step" : undefined}>
                <span className="wz-num">{x.n < step ? <Check size={13} strokeWidth={3} aria-hidden="true" /> : `0${x.n}`}</span>
                <span className="wz-text"><small>Step {x.n} of 3</small><strong>{x.title}</strong></span>
              </button>
            </li>
          ))}
        </ol>

        <div className="wz-head" key={`h${step}`}>
          <h2 className="ag-brief-title">{head.title}</h2>
          <p className="ag-sub">{head.sub}</p>
        </div>

        <div className="wz-body" key={`b${step}`}>
          {step === 1 && (
            <>
              <div className="ag-modes ag-modes--3" role="radiogroup" aria-label="How it works">
                {MODES.map((m) => {
                  const on = form.mode === m.id;
                  return (
                    <button key={m.id} type="button" role="radio" aria-checked={on} className={`ag-mode ag-mode2${on ? " is-on" : ""}`}
                      onClick={() => setForm((f) => ({ ...f, mode: m.id, source: m.id === "smart" && f.source === "directory" ? "maps" : f.source }))}>
                      <span className="ag-mode2-top">
                        <span className="ag-mode-icon">{m.icon}</span>
                        <em className="ag-mode2-tag">{m.tag}</em>
                        <span className="ag-mode2-radio" aria-hidden="true">{on && <Check size={12} strokeWidth={3} />}</span>
                      </span>
                      <strong className="ag-mode2-name">{m.name}</strong>
                      <span className="ag-mode2-desc">{m.desc}</span>
                      <span className="ag-mode2-best"><b>Best for</b> {m.best}</span>
                      <span className="ag-mode2-pick">{on ? <><Check size={14} strokeWidth={3} aria-hidden="true" /> Selected</> : "Choose this"}</span>
                    </button>
                  );
                })}
              </div>
              <div className="wz-flow" key={form.mode}>
                <span className="wz-flow-label">After you launch, the agent does this on its own</span>
                <ol>
                  {mode.flow.map((f, i) => (
                    <li key={f.t} style={{ animationDelay: `${i * 70}ms` }}>
                      <span className="wz-flow-num">{String(i + 1).padStart(2, "0")}</span>
                      <strong>{f.t}</strong>
                      <span>{f.d}</span>
                    </li>
                  ))}
                </ol>
                <p className="wz-flow-note">You can watch every step live on the Dashboard, and stop it any time.</p>
              </div>
            </>
          )}

          {step === 2 && (bulk ? (
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
          ) : (
            <>
            <fieldset className="ag-section">
              <legend><span>02</span> Where to look</legend>
              <div className="ag-source" role="radiogroup" aria-label="Where to look">
                <button type="button" role="radio" aria-checked={form.source === "maps"} className={form.source === "maps" ? "is-on" : ""} onClick={() => set("source", "maps")}>
                  <Radar size={17} aria-hidden="true" />
                  <span><strong>City search</strong><em>Google Maps, BBB and OpenStreetMap in one city</em></span>
                </button>
                {/* Directory extract: only available for without-enrichment mode */}
                {form.mode === "fast" && (
                  <button type="button" role="radio" aria-checked={form.source === "directory"} className={form.source === "directory" ? "is-on" : ""} onClick={() => set("source", "directory")}>
                    <Link2 size={17} aria-hidden="true" />
                    <span><strong>Extract from directory</strong><em>Scrape every company listed on a directory page</em></span>
                  </button>
                )}
              </div>
              {form.mode === "fast" && form.source === "directory" ? (
                <DirectoryExtractor />
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

            {!(form.source === "directory") && <fieldset className="ag-section">
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
            </fieldset>}
            </>
          ))}

          {step === 3 && (
            <fieldset className="ag-section">
              <legend><span>04</span> Message</legend>
              <label className="ag-field">
                <span className="ag-label">Subject</span>
                <input className="input" value={form.subject} onChange={(e) => set("subject", e.target.value)} maxLength={200}
                  placeholder={`e.g. ${defaults.subject || "Drafting support for {{company}}"}`} />
              </label>
              <label className="ag-field">
                <span className="ag-label">Message</span>
                <textarea className="input ag-textarea" rows={11} value={form.message} onChange={(e) => set("message", e.target.value)} maxLength={5000}
                  placeholder={defaults.message ? `For example:\n\n${defaults.message}` : "Write your message."} />
              </label>
              <div className="ag-list-tools">
                {!form.message && defaults.message && (
                  <button type="button" className="ag-token ag-token--fill" onClick={() => setForm((f) => ({ ...f, subject: f.subject || defaults.subject, message: defaults.message }))}>
                    Use my saved message
                  </button>
                )}
                {tokens.map((t) => (
                  <button key={t} type="button" className="ag-token" onClick={() => insert(t)}>{t}</button>
                ))}
                <span className="ag-hint">{tokenHint}</span>
              </div>
            </fieldset>
          )}
        </div>

        <div className="ag-launchbar">
          {step === 1 ? <span className="ag-hint wz-next-hint">Picked <strong>{mode.name}</strong>. Next you tell it {bulk ? "who to send to" : "where to look"}.</span>
            : <code className="ag-query"><span>›</span> {query}</code>}
          <div className="ag-launch-row">
            <button type="button" className="ag-btn ag-btn--ghost" onClick={() => (step === 1 ? setShowForm(false) : setStep((step - 1) as 1 | 2))}>
              <ArrowLeft size={16} aria-hidden="true" /> {step === 1 ? "Cancel" : "Back"}
            </button>
            {!(step === 2 && form.mode === "fast" && form.source === "directory") && (
              <button type="submit" className="ag-launch" disabled={starting || (step === 3 && !mailbox.connected)} data-magnetic>
                {starting ? <LoaderCircle size={20} className="spin" aria-hidden="true" /> : step === 3 ? <Zap size={20} aria-hidden="true" /> : null}
                {starting ? "Launching…" : step === 1 ? `Next: ${bulk ? "your list" : "where to look"}` : step === 2 ? "Next: your message" : bulk ? `Send to ${recipients.length}` : "Launch agent"}
                <ArrowRight size={20} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </form>
    </section>
  );
}
