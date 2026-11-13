"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Bot, Building2, ChevronRight, Download, Search } from "lucide-react";
import { Pagination, usePagination } from "@/components/dashboard/Pagination";
import { Select } from "./Dropdown";
import { COMPANY_STATUS, COMPANY_TYPES, type Company, type CompanyStatus, EMAIL_STATUS, type EmailStatus, SOURCE_LABEL, STEPS, describeType } from "@/lib/leadFinder";
import { type AgentRun, call, toAgentRun } from "@/lib/leadFinderApi";
import { downloadCsv } from "@/lib/exportCsv";

/** Best email found at a company, best first */
const EMAIL_RANK: EmailStatus[] = ["valid", "catch_all", "unknown", "none", "invalid"];

export function timeAgo(ts: number, now: number) {
  const minutes = (now - ts) / 60000;
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${Math.floor(minutes)} min ago`;
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)} h ago`;
  const days = Math.floor(minutes / (60 * 24));
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/** "Step 3 of 8: Read the website" with a thin progress bar */
export function StepProgress({ c }: { c: Company }) {
  const done = c.steps.filter((s) => s.state === "done").length;
  const running = c.steps.findIndex((s) => s.state === "running");
  if (c.status === "queued") return <span className="lf-step-text">Waiting for its turn</span>;
  return (
    <span className="lf-step-progress">
      <span className="lf-bar" aria-hidden="true"><i style={{ transform: `scaleX(${done / STEPS.length})` }} /></span>
      <span className="lf-step-text">{running >= 0 ? `Step ${running + 1} of ${STEPS.length}: ${STEPS[running].label}` : "Finishing…"}</span>
    </span>
  );
}

/** With or without enrichment: companies added before the agent always went through enrichment */
export const MODE = {
  fast: { label: "Without enrichment", tone: "neutral", hint: "Found on Google Maps, email from the company's own website. No API key used." },
  smart: { label: "With enrichment", tone: "violet", hint: "Owners' emails from Hunter, checked by Reoon, personal line by AI." },
  bulk: { label: "Bulk send", tone: "info", hint: "From your own list, checked before sending, with your own message." },
} as const;
export const modeOf = (c: Company): keyof typeof MODE => (c.agentMode === "fast" || c.agentMode === "bulk" ? c.agentMode : "smart");
const runMode = (r: AgentRun): keyof typeof MODE => (r.mode === "fast" || r.mode === "bulk" ? r.mode : "smart");

const RUN_STATUS: Record<AgentRun["status"], { label: string; tone: string }> = {
  queued: { label: "Starting", tone: "neutral" }, running: { label: "Working", tone: "info" }, enriching: { label: "Finding owners", tone: "info" },
  sending: { label: "Sending", tone: "info" }, waiting: { label: "Sends tomorrow", tone: "warning" }, done: { label: "Done", tone: "success" },
  stopped: { label: "Stopped", tone: "neutral" }, failed: { label: "Failed", tone: "danger" },
};
const typeName = (id: string) => COMPANY_TYPES.find((t) => t.id === id)?.label ?? id;
export const runTitle = (r: AgentRun) =>
  r.mode === "bulk"
    ? `Bulk send: ${r.counts.total ?? r.filters.recipients?.length ?? 0} addresses`
    : `${typeName(r.filters.company_type)}s in ${[r.filters.city, r.filters.state].filter(Boolean).join(", ")}`;

export function Results({
  companies,
  now,
  status,
  onStatus,
  run,
  onRun,
  onOpen,
  onOpenRun,
  onAgent,
}: {
  companies: Company[];
  now: number;
  status: "all" | CompanyStatus;
  onStatus: (s: "all" | CompanyStatus) => void;
  /** Show only the companies one agent run found ("all" = every company) */
  run: string;
  onRun: (id: string) => void;
  onOpen: (id: string) => void;
  onOpenRun: (id: string) => void;
  onAgent: () => void;
}) {
  const [tab, setTab] = useState<"companies" | "runs">("companies");
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"all" | "fast" | "smart" | "bulk">("all");
  const [runs, setRuns] = useState<AgentRun[] | null>(null);

  useEffect(() => {
    let live = true;
    call<Record<string, unknown>[]>("/agent/runs").then((res) => {
      if (live) setRuns((res.data ?? []).map(toAgentRun));
    });
    return () => {
      live = false;
    };
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return companies.filter(
      (c) =>
        (status === "all" || c.status === status) &&
        (mode === "all" || modeOf(c) === mode) &&
        (run === "all" || c.agentRunId === run) &&
        (!q || [c.name, c.domain, c.city, c.state, c.country, describeType(c.companyType, c.trades), ...c.team.tags].some((v) => v?.toLowerCase().includes(q))),
    );
  }, [companies, status, mode, run, query]);
  const pager = usePagination(shown, `${status}|${mode}|${run}|${query}`, 25);
  const filtered = status !== "all" || mode !== "all" || run !== "all" || !!query.trim();
  const runById = new Map((runs ?? []).map((r) => [r.id, r]));
  const clear = () => { setQuery(""); setMode("all"); onRun("all"); onStatus("all"); };
  const exportShown = () => {
    const r = run !== "all" ? runById.get(run) : null;
    downloadCsv(shown, r ? `reachagent-${runTitle(r)}-${MODE[runMode(r)].label}-${r.created_at.slice(0, 10)}` : undefined);
  };

  return (
    <div className="dash">
      <header className="dash-head">
        <div>
          <h2>Results</h2>
          <p>Every company the agent found, how it was found, and who was emailed.</p>
        </div>
        <div className="dash-actions">
          <button type="button" className="btn btn-secondary dash-run" disabled={!shown.length} onClick={exportShown}
            title="Download the companies shown below as a spreadsheet">
            <Download size={16} aria-hidden="true" /> Download CSV{filtered ? ` (${shown.length})` : ""}
          </button>
          <button type="button" className="btn btn-primary dash-run" onClick={onAgent}><Bot size={16} aria-hidden="true" /> Run agent</button>
        </div>
      </header>

      <div className="seg-control res-tabs" role="tablist" aria-label="Results">
        <button type="button" role="tab" aria-selected={tab === "companies"} className={tab === "companies" ? "on" : ""} onClick={() => setTab("companies")}>
          Companies <span className="res-count">{companies.length}</span>
        </button>
        <button type="button" role="tab" aria-selected={tab === "runs"} className={tab === "runs" ? "on" : ""} onClick={() => setTab("runs")}>
          Agent runs <span className="res-count">{runs?.length ?? 0}</span>
        </button>
      </div>

      {tab === "runs" ? (
        <div className="card card-flush">
          {!runs ? (
            <div className="empty"><div className="loader" /></div>
          ) : !runs.length ? (
            <div className="empty">
              <div className="empty-icon"><Bot size={24} /></div>
              <h3>No agent runs yet</h3>
              <p>Every run shows up here with what it found, and its own spreadsheet.</p>
            </div>
          ) : (
            <ul className="lf-agent-list">
              {runs.map((r) => {
                const m = MODE[runMode(r)];
                return (
                  <li key={r.id} className="csv-row">
                    <span className="lf-agent-co">
                      <strong>{runTitle(r)}</strong>
                      <span className="muted">
                        {new Date(r.created_at).toLocaleString()} · {r.counts.new ?? 0} companies · {r.counts.emails ?? 0} emails · {r.counts.sent ?? 0} sent
                      </span>
                    </span>
                    <span className="csv-row-actions">
                      <span className={`pill no-dot tone-${m.tone}`} title={m.hint}>{m.label}</span>
                      <span className={`pill no-dot tone-${RUN_STATUS[r.status].tone}`}>{RUN_STATUS[r.status].label}</span>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => onOpenRun(r.id)}>Live view</button>
                      <button type="button" className="btn btn-secondary btn-sm" disabled={!r.counts.new} onClick={() => { onRun(r.id); setTab("companies"); }}>
                        Companies
                      </button>
                      <button type="button" className="btn btn-secondary btn-sm" disabled={!r.counts.new}
                        onClick={() => downloadCsv(companies.filter((c) => c.agentRunId === r.id), `reachagent-${runTitle(r)}-${m.label}-${r.created_at.slice(0, 10)}`)}>
                        <Download size={14} aria-hidden="true" /> CSV
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : (
    <div className="card card-flush" id="lf-results">
      <div className="leads-toolbar">
        <label className="leads-search">
          <Search size={16} aria-hidden="true" />
          <input className="input" placeholder="Search company, type, city or tag" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search companies" />
        </label>
        <Select className="lab-select" ariaLabel="Filter by status" value={status} onChange={(v) => onStatus(v as typeof status)}
          options={[{ value: "all", label: "All statuses" }, ...(Object.keys(COMPANY_STATUS) as CompanyStatus[]).map((s) => ({ value: s, label: COMPANY_STATUS[s].label }))]} />
        <Select className="lab-select" ariaLabel="Filter by enrichment" value={mode} onChange={(v) => setMode(v as typeof mode)}
          options={[{ value: "all", label: "Every mode" }, { value: "fast", label: MODE.fast.label }, { value: "smart", label: MODE.smart.label }, { value: "bulk", label: MODE.bulk.label }]} />
        {!!runs?.length && (
          <Select className="lab-select" ariaLabel="Filter by agent run" value={run} onChange={onRun}
            options={[{ value: "all", label: "All runs" }, ...runs.map((r) => ({ value: r.id, label: `${runTitle(r)} · ${new Date(r.created_at).toLocaleDateString()}` }))]} />
        )}
        {filtered && <button className="link-btn" onClick={clear}>Clear filters</button>}
        <span className="leads-count" aria-live="polite">
          <strong>{shown.length}</strong> compan{shown.length === 1 ? "y" : "ies"}{filtered ? ` of ${companies.length}` : ""}
        </span>
      </div>

      {shown.length === 0 ? (
        <div className="empty">
          <div className="empty-icon"><Building2 size={24} /></div>
          <h3>{companies.length ? "No companies match" : "No companies yet"}</h3>
          <p>{companies.length ? "Try clearing the filters." : "Run the agent: every company it finds shows up here."}</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table lf-table">
            <thead>
              <tr>
                <th>Company</th>
                <th>Location</th>
                <th>Status</th>
                <th>Mode</th>
                <th className="col-num">People</th>
                <th>Best email</th>
                <th>Added</th>
                <th><span className="sr-only">Open</span></th>
              </tr>
            </thead>
            <tbody>
              {pager.pageItems.map((c) => {
                const st = COMPANY_STATUS[c.status];
                const best = c.contacts.length ? EMAIL_RANK.find((r) => c.contacts.some((p) => p.emailStatus === r)) ?? null : null;
                const valid = c.contacts.filter((p) => p.emailStatus === "valid").length;
                return (
                  <tr key={c.id} className={`lf-row${c.status === "failed" ? " row-problem" : ""}`} onClick={() => onOpen(c.id)}>
                    <td>
                      <div className="lead-person">
                        <span className="lf-avatar" aria-hidden="true">{c.name[0]?.toUpperCase()}</span>
                        <div className="lead-person-text">
                          <span className="lf-row-name">
                            <button type="button" className="lf-row-open truncate" onClick={(e) => { e.stopPropagation(); onOpen(c.id); }}>{c.name}</button>
                            {c.team.priority === "high" && <span className="pill no-dot tone-warning lf-priority">High priority</span>}
                          </span>
                          <span className="lead-email truncate">
                            {[describeType(c.companyType, c.trades), c.domain ?? "Website not found yet"].filter(Boolean).join(" · ")}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="nowrap">{c.city}<div className="field-hint">{[c.state, c.country].filter(Boolean).join(", ")}</div></td>
                    <td>
                      <div className="lf-status-cell">
                        <span className={`pill tone-${st.tone}${c.status === "enriching" ? " live" : ""}`}>{st.label}</span>
                        {(c.status === "enriching" || c.status === "queued") && <StepProgress c={c} />}
                        {c.status === "failed" && c.error && <span className="lf-step-text lf-fail-text">{c.error}</span>}
                      </div>
                    </td>
                    <td>
                      <span className={`pill no-dot tone-${MODE[modeOf(c)].tone}`} title={MODE[modeOf(c)].hint}>{MODE[modeOf(c)].label}</span>
                    </td>
                    <td className="col-num"><strong className="lead-emails">{c.contacts.length || "—"}</strong></td>
                    <td>
                      {best && (c.status === "ready" || c.status === "approved") ? (
                        <span className={`pill no-dot tone-${EMAIL_STATUS[best].tone}`} title={EMAIL_STATUS[best].hint}>
                          {best === "valid" ? `${valid} verified` : EMAIL_STATUS[best].label}
                        </span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td className="nowrap">
                      <div className="sent-date">{now ? timeAgo(c.addedAt, now) : ""}</div>
                      <div className="field-hint">{c.agentRunId ? "ReachAgent" : SOURCE_LABEL[c.source]}</div>
                    </td>
                    <td className="lf-chev"><ChevronRight size={16} aria-hidden="true" /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Pagination {...pager} noun="companies" scrollTo="lf-results" />
    </div>
      )}
    </div>
  );
}
