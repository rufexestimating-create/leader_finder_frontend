"use client";

import React, { useMemo, useState } from "react";
import { Building2, ChevronRight, Plus, Search } from "lucide-react";
import { Pagination, usePagination } from "@/components/dashboard/Pagination";
import { Select } from "./Dropdown";
import { COMPANY_STATUS, type Company, type CompanyStatus, EMAIL_STATUS, type EmailStatus, SOURCE_LABEL, STEPS, describeType } from "@/lib/leadFinder";

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

export function Results({
  companies,
  now,
  status,
  onStatus,
  onOpen,
  onAdd,
}: {
  companies: Company[];
  now: number;
  status: "all" | CompanyStatus;
  onStatus: (s: "all" | CompanyStatus) => void;
  onOpen: (id: string) => void;
  onAdd: () => void;
}) {
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return companies.filter(
      (c) =>
        (status === "all" || c.status === status) &&
        (!q || [c.name, c.domain, c.city, c.state, c.country, describeType(c.companyType, c.trades), ...c.team.tags].some((v) => v?.toLowerCase().includes(q))),
    );
  }, [companies, status, query]);
  const pager = usePagination(shown, `${status}|${query}`, 25);
  const filtered = status !== "all" || !!query.trim();

  return (
    <div className="card card-flush" id="lf-results">
      <div className="leads-toolbar">
        <label className="leads-search">
          <Search size={16} aria-hidden="true" />
          <input className="input" placeholder="Search company, type, city or tag" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search companies" />
        </label>
        <Select className="lab-select" ariaLabel="Filter by status" value={status} onChange={(v) => onStatus(v as typeof status)}
          options={[{ value: "all", label: "All statuses" }, ...(Object.keys(COMPANY_STATUS) as CompanyStatus[]).map((s) => ({ value: s, label: COMPANY_STATUS[s].label }))]} />
        {filtered && <button className="link-btn" onClick={() => { setQuery(""); onStatus("all"); }}>Clear filters</button>}
        <span className="leads-count" aria-live="polite">
          <strong>{shown.length}</strong> compan{shown.length === 1 ? "y" : "ies"}{filtered ? ` of ${companies.length}` : ""}
        </span>
        <button className="btn btn-primary btn-sm" onClick={onAdd}><Plus size={14} aria-hidden="true" /> Add companies</button>
      </div>

      {shown.length === 0 ? (
        <div className="empty">
          <div className="empty-icon"><Building2 size={24} /></div>
          <h3>{companies.length ? "No companies match" : "No companies yet"}</h3>
          <p>{companies.length ? "Try clearing the search or the status filter." : "Add a company, upload a list or search by filters. Each one shows up here while we find its details."}</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table lf-table">
            <thead>
              <tr>
                <th>Company</th>
                <th>Location</th>
                <th>Status</th>
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
                      <div className="field-hint">{SOURCE_LABEL[c.source]}</div>
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
  );
}
