"use client";

import React from "react";
import { ArrowUpRight, BadgeCheck, Bot, Building2, ChevronRight, CircleCheck, LoaderCircle, Plus } from "lucide-react";
import { COMPANY_STATUS, type Company, type CompanyStatus, describeType } from "@/lib/leadFinder";
import { StepProgress, timeAgo } from "./Results";

type Counts = { all: number; working: number; waiting: number; ready: number; failed: number; verified: number; risky: number };

type Card = {
  label: string;
  state: string;
  tone: "teal" | "live" | "warm" | "idle" | "green";
  title: string;
  value: number;
  icon: React.ReactNode;
  lines: string[];
  action: string;
  onClick: () => void;
};

export function Dashboard({
  companies,
  counts,
  now,
  onFilter,
  onAdd,
  onAgent,
  onOpen,
}: {
  companies: Company[];
  counts: Counts;
  now: number;
  onFilter: (s: "all" | CompanyStatus) => void;
  onAdd: () => void;
  onAgent: () => void;
  onOpen: (id: string) => void;
}) {
  const running = counts.working + counts.waiting;
  const cards: Card[] = [
    {
      label: "Companies",
      state: "Tracking",
      tone: "teal",
      title: "Pipeline",
      value: counts.all,
      icon: <Building2 size={17} />,
      lines: [counts.failed ? `${counts.failed} couldn't finish` : "Every company you added", "By hand, file or search"],
      action: "View all",
      onClick: () => onFilter("all"),
    },
    {
      label: "Finding details",
      state: running ? "Live now" : "Idle",
      tone: running ? "live" : "idle",
      title: "In progress",
      value: running,
      icon: <LoaderCircle size={17} className={counts.working ? "spin" : undefined} />,
      lines: running ? [`${counts.working} running now`, `${counts.waiting} waiting their turn`] : ["Nothing running right now", "New companies start here"],
      action: "Watch progress",
      onClick: () => onFilter("enriching"),
    },
    {
      label: "Ready to review",
      state: counts.ready ? "Needs you" : "All clear",
      tone: counts.ready ? "warm" : "idle",
      title: "To review",
      value: counts.ready,
      icon: <CircleCheck size={17} />,
      lines: ["Check the people found", "Then approve who to email"],
      action: "Review now",
      onClick: () => onFilter("ready"),
    },
    {
      label: "Verified emails",
      state: "Safe to send",
      tone: "green",
      title: "Verified",
      value: counts.verified,
      icon: <BadgeCheck size={17} />,
      lines: [counts.risky ? `${counts.risky} risky, kept for later` : "No risky emails", "Checked before anything is sent"],
      action: "See people",
      onClick: () => onFilter("ready"),
    },
  ];
  const latest = companies.slice(0, 5);

  return (
    <div className="lf-dash">
      <header className="lf-dash-head">
        <div>
          <span className="lf-dash-eyebrow">Overview</span>
          <h2 className="lf-dash-title">Your pipeline</h2>
          <p className="lf-dash-sub">
            {counts.ready
              ? `${counts.ready} compan${counts.ready === 1 ? "y is" : "ies are"} waiting for your review.`
              : running
                ? `${running} compan${running === 1 ? "y is" : "ies are"} being looked into right now.`
                : "Add a company or search a market to find new leads."}
          </p>
        </div>
        <div className="lf-dash-ctas">
          <button className="btn btn-primary lf-dash-cta" onClick={onAgent}><Bot size={16} aria-hidden="true" /> Run agent</button>
          <button className="btn btn-secondary lf-dash-cta" onClick={onAdd}><Plus size={16} aria-hidden="true" /> Add companies</button>
        </div>
      </header>

      <ul className="lf-tiles">
        {cards.map((c, i) => (
          <li key={c.label} className={`lf-tile lf-tile--${c.tone}`} style={{ animationDelay: `${i * 0.08}s` }}>
            <span className="lf-tile-index" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
            <span className="lf-tile-state"><i aria-hidden="true" />{c.state}</span>
            <div className="lf-tile-value">
              <strong>{c.value}</strong>
              <span>{c.title}</span>
            </div>
            <ul className="lf-tile-lines">
              <li><span className="lf-tile-icon" aria-hidden="true">{c.icon}</span>{c.lines[0]}</li>
              <li><span className="lf-tile-icon" aria-hidden="true"><ChevronRight size={15} /></span>{c.lines[1]}</li>
            </ul>
            <button className="lf-tile-btn" onClick={c.onClick} aria-label={`${c.action}: ${c.label}`}>
              {c.action} <ArrowUpRight size={16} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>

      <section className="card card-flush lf-latest">
        <div className="lf-card-head">
          <h3 className="card-title"><span className="lf-title-icon"><Building2 size={16} aria-hidden="true" /></span> Latest companies</h3>
          {companies.length > 0 && <button className="link-btn lf-inline" onClick={() => onFilter("all")}>See all {companies.length} <ChevronRight size={15} aria-hidden="true" /></button>}
        </div>
        {latest.length === 0 ? (
          <div className="empty">
            <div className="empty-icon"><Building2 size={24} /></div>
            <h3>No companies yet</h3>
            <p>Add one by name, upload a list or search a market. Each one shows up here while we find its details.</p>
            <button className="btn btn-primary btn-sm" onClick={onAdd}><Plus size={14} aria-hidden="true" /> Add companies</button>
          </div>
        ) : (
          <ul className="lf-latest-list">
            {latest.map((c, i) => {
              const st = COMPANY_STATUS[c.status];
              return (
                <li key={c.id} style={{ animationDelay: `${0.3 + i * 0.05}s` }}>
                  <button type="button" onClick={() => onOpen(c.id)}>
                    <span className="lf-person-avatar" aria-hidden="true">{c.name[0]?.toUpperCase()}</span>
                    <span className="lf-latest-name">
                      <strong>{c.name}</strong>
                      <span>{[describeType(c.companyType, c.trades), [c.city, c.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}</span>
                    </span>
                    <span className="lf-latest-status">
                      <span className={`pill tone-${st.tone}${c.status === "enriching" ? " live" : ""}`}>{st.label}</span>
                      {(c.status === "enriching" || c.status === "queued") && <StepProgress c={c} />}
                    </span>
                    <span className="lf-latest-when">{now ? timeAgo(c.addedAt, now) : ""}</span>
                    <ChevronRight size={16} className="lf-latest-chev" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
