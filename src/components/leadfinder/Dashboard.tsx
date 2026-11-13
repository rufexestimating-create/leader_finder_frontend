"use client";

import React, { useMemo, useState } from "react";
import { BadgeCheck, Bot, Building2, ChevronRight, CircleCheck, LoaderCircle, Send } from "lucide-react";
import type { Company, CompanyStatus } from "@/lib/leadFinder";
import { ChartCard, ColumnChart, RankedBars, SegmentedBar } from "./DashboardCharts";

const DAY = 86_400_000;
const RANGES = [7, 14, 30];
const dayKey = (t: number) => new Date(t).toDateString();
const dayLabel = (t: number) => new Date(t).toLocaleDateString([], { month: "short", day: "numeric" });

type Counts = { all: number; working: number; waiting: number; ready: number; failed: number; verified: number; risky: number; sent: number };

/** Everything the charts show, for the companies added in the last `days` days */
function useCharts(companies: Company[], days: number) {
  return useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = today.getTime() - (days - 1) * DAY;
    const dates = Array.from({ length: days }, (_, i) => start + i * DAY);
    const inRange = companies.filter((c) => c.addedAt >= start);
    const people = inRange.flatMap((c) => c.contacts);
    const count = <T,>(xs: T[], key: (x: T) => string) => xs.reduce<Record<string, number>>((m, x) => ((m[key(x)] = (m[key(x)] ?? 0) + 1), m), {});

    const added = count(inRange, (c) => dayKey(c.addedAt));
    const sentTimes = companies.flatMap((c) => c.contacts).map((p) => (p.sentAt ? Date.parse(p.sentAt) : 0)).filter((t) => t >= start);
    const sent = count(sentTimes, dayKey);
    const by = count(inRange, (c) => c.status);
    const cities = Object.entries(count(inRange, (c) => [c.city, c.state].filter(Boolean).join(", ") || "Unknown")).sort((a, b) => b[1] - a[1]);
    const noEmail = inRange.filter((c) => (c.status === "ready" || c.status === "approved") && !c.contacts.some((p) => p.email)).length;

    return {
      total: inRange.length,
      sentTotal: sentTimes.length,
      added: dates.map((d) => ({ label: dayLabel(d), value: added[dayKey(d)] ?? 0 })),
      sent: dates.map((d) => ({ label: dayLabel(d), value: sent[dayKey(d)] ?? 0 })),
      status: [
        { label: "Waiting", value: by.queued ?? 0 },
        { label: "Finding details", value: by.enriching ?? 0 },
        { label: "Ready to review", value: by.ready ?? 0 },
        { label: "Emailed", value: by.approved ?? 0 },
        { label: "Couldn't finish", value: by.failed ?? 0 },
      ],
      quality: [
        { label: "Verified", value: people.filter((p) => p.emailStatus === "valid").length },
        { label: "Risky (may bounce)", value: people.filter((p) => p.emailStatus === "catch_all").length },
        { label: "Not confirmed", value: people.filter((p) => p.email && p.emailStatus === "unknown").length },
        { label: "Invalid", value: people.filter((p) => p.emailStatus === "invalid").length },
        { label: "Company with no email", value: noEmail },
      ],
      found: [
        { label: "ReachAgent", value: inRange.filter((c) => c.agentRunId).length },
        { label: "Find companies", value: inRange.filter((c) => c.source === "search" && !c.agentRunId).length },
        { label: "Added by hand", value: inRange.filter((c) => c.source === "manual").length },
        { label: "File upload", value: inRange.filter((c) => c.source === "csv").length },
      ],
      cities: [...cities.slice(0, 5), ...(cities.length > 5 ? [["Other", cities.slice(5).reduce((s, [, v]) => s + v, 0)] as [string, number]] : [])]
        .map(([label, value]) => ({ label, value })),
    };
  }, [companies, days]);
}

const rowsOf = (xs: { label: string; value: number }[]): [string, number][] => xs.map((x) => [x.label, x.value]);

type Kpi = { label: string; value: number; note: string; icon: React.ReactNode; tone: "primary" | "info" | "warning" | "success" | "violet"; live?: boolean; onClick: () => void };

/** The overview: headline numbers, then charts for the chosen period */
export function Dashboard({
  companies,
  counts,
  onFilter,
  onAgent,
}: {
  companies: Company[];
  counts: Counts;
  onFilter: (s: "all" | CompanyStatus) => void;
  onAgent: () => void;
}) {
  const [days, setDays] = useState(14);
  const ch = useCharts(companies, days);
  const running = counts.working + counts.waiting;

  const kpis: Kpi[] = [
    { label: "Companies", value: counts.all, note: counts.failed ? `${counts.failed} couldn't finish` : "All you've found", icon: <Building2 size={18} />, tone: "primary", onClick: () => onFilter("all") },
    { label: "In progress", value: running, note: running ? `${counts.working} running, ${counts.waiting} waiting` : "Nothing running", icon: <LoaderCircle size={18} className={counts.working ? "spin" : undefined} />, tone: "info", live: !!counts.working, onClick: () => onFilter("enriching") },
    { label: "To review", value: counts.ready, note: counts.ready ? "Waiting for you" : "All reviewed", icon: <CircleCheck size={18} />, tone: "warning", onClick: () => onFilter("ready") },
    { label: "Verified emails", value: counts.verified, note: counts.risky ? `${counts.risky} risky kept aside` : "No risky emails", icon: <BadgeCheck size={18} />, tone: "success", onClick: () => onFilter("ready") },
    { label: "Emails sent", value: counts.sent, note: "From your mailbox", icon: <Send size={18} />, tone: "violet", onClick: () => onFilter("approved") },
  ];

  return (
    <div className="dash">
      <header className="dash-head">
        <div>
          <h2>Overview</h2>
          <p>
            {counts.ready
              ? `${counts.ready} compan${counts.ready === 1 ? "y is" : "ies are"} waiting for your review.`
              : running
                ? `${running} compan${running === 1 ? "y is" : "ies are"} being looked into right now.`
                : "Run the agent to find new leads."}
          </p>
        </div>
        <div className="dash-actions">
          <button type="button" className="btn btn-primary dash-run" onClick={onAgent}><Bot size={17} aria-hidden="true" /> Run agent</button>
        </div>
      </header>

      <ul className="kpi-grid">
        {kpis.map((k) => (
          <li key={k.label}>
            <button type="button" className={`kpi kpi--${k.tone}`} onClick={k.onClick}>
              <span className="kpi-top">
                <span className="kpi-label">{k.label}</span>
                <span className="kpi-icon" aria-hidden="true">{k.icon}</span>
              </span>
              <strong className="kpi-value">{k.value.toLocaleString()}</strong>
              <span className="kpi-note">
                {k.live && <i className="kpi-dot" aria-hidden="true" />}
                {k.note}
                <ChevronRight size={14} className="kpi-chev" aria-hidden="true" />
              </span>
            </button>
          </li>
        ))}
      </ul>

      <section className="dash-section" aria-label="Charts">
        <div className="dash-bar">
          <div>
            <h3>Activity</h3>
            <p>{ch.total} compan{ch.total === 1 ? "y" : "ies"} added and {ch.sentTotal} email{ch.sentTotal === 1 ? "" : "s"} sent in the last {days} days</p>
          </div>
          <div className="seg-control" role="radiogroup" aria-label="Period">
            {RANGES.map((n) => (
              <button key={n} type="button" role="radio" aria-checked={days === n} className={days === n ? "on" : ""} onClick={() => setDays(n)}>
                {n}d
              </button>
            ))}
          </div>
        </div>

        <div className="lf-dash-grid">
          <ChartCard title="Companies added" sub="Per day" rows={rowsOf(ch.added)}>
            <ColumnChart points={ch.added} unit="companies" />
          </ChartCard>
          <ChartCard title="Emails sent" sub="Per day, from your mailbox (test emails not counted)" rows={rowsOf(ch.sent)}>
            <ColumnChart points={ch.sent} unit="emails" />
          </ChartCard>
          <ChartCard title="Where companies are" sub="Each company's current step" rows={rowsOf(ch.status)}>
            <SegmentedBar parts={ch.status} />
          </ChartCard>
          <ChartCard title="Email quality" sub="How sure we are each email exists" rows={rowsOf(ch.quality)}>
            <RankedBars items={ch.quality} unit="emails" />
          </ChartCard>
          <ChartCard title="How companies were found" rows={rowsOf(ch.found)}>
            <RankedBars items={ch.found} unit="companies" />
          </ChartCard>
          <ChartCard title="Top cities" rows={rowsOf(ch.cities)}>
            <RankedBars items={ch.cities} unit="companies" />
          </ChartCard>
        </div>
      </section>
    </div>
  );
}
