"use client";

import React, { useMemo, useState } from "react";
import {
  ArrowUpRight, BadgeCheck, Building2, ChartPie, ChevronRight, CircleCheck, Funnel, Gauge, LoaderCircle, MapPin, Send, Sparkles, Target, Trophy,
} from "lucide-react";
import type { ConfirmRequest } from "@/components/dashboard/ConfirmDialog";
import type { Company, CompanyStatus } from "@/lib/leadFinder";
import { AGENT_ACTIVE, type AgentRun } from "@/lib/leadFinderApi";
import { CountUp, SplitWords } from "@/components/motion";
import { AgentsPanel } from "./AgentsPanel";
import { MODE_LABEL, runName } from "./agentRun";
import { AreaChart, ChartCard, Donut, Funnel as FunnelChart, RankedBars, Sparkline } from "./DashboardCharts";

const DAY = 86_400_000;
const RANGES = [7, 14, 30];
const dayKey = (t: number) => new Date(t).toDateString();
const dayLabel = (t: number) => new Date(t).toLocaleDateString([], { month: "short", day: "numeric" });

type Counts = { all: number; working: number; waiting: number; ready: number; failed: number; verified: number; risky: number; sent: number };
type Part = { label: string; value: number };

/** Everything the charts show, for the companies and agent runs started in the last `days` days */
function useCharts(companies: Company[], runs: AgentRun[], days: number) {
  return useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = today.getTime() - (days - 1) * DAY;
    const dates = Array.from({ length: days }, (_, i) => start + i * DAY);
    const inRange = companies.filter((c) => c.addedAt >= start);
    const people = inRange.flatMap((c) => c.contacts);
    const count = <T,>(xs: T[], key: (x: T) => string) => xs.reduce<Record<string, number>>((m, x) => ((m[key(x)] = (m[key(x)] ?? 0) + 1), m), {});
    const daily = (m: Record<string, number>) => dates.map((d) => ({ label: dayLabel(d), value: m[dayKey(d)] ?? 0 }));

    const added = count(inRange, (c) => dayKey(c.addedAt));
    const sentTimes = companies.flatMap((c) => c.contacts).map((p) => (p.sentAt ? Date.parse(p.sentAt) : 0)).filter((t) => t >= start);
    const sent = count(sentTimes, dayKey);
    const verified = inRange.reduce<Record<string, number>>((m, c) => {
      const n = c.contacts.filter((p) => p.emailStatus === "valid").length;
      if (n) m[dayKey(c.addedAt)] = (m[dayKey(c.addedAt)] ?? 0) + n;
      return m;
    }, {});
    const by = count(inRange, (c) => c.status);
    const cities = Object.entries(count(inRange, (c) => [c.city, c.state].filter(Boolean).join(", ") || "Unknown")).sort((a, b) => b[1] - a[1]);
    const noEmail = inRange.filter((c) => (c.status === "ready" || c.status === "approved") && !c.contacts.some((p) => p.email)).length;

    const missions = runs.filter((r) => Date.parse(r.created_at) >= start);
    const finding = missions.filter((r) => r.mode !== "bulk");
    const finished = missions.filter((r) => r.status === "done" || r.status === "failed" || r.status === "stopped");
    const sum = (xs: AgentRun[], k: "new" | "emails" | "sent") => xs.reduce((s, r) => s + (r.counts[k] ?? 0), 0);
    const seen: Record<string, number> = {};
    const top = [...missions]
      .sort((a, b) => (b.counts.emails ?? 0) - (a.counts.emails ?? 0))
      .slice(0, 5)
      .map((r) => {
        const base = `${runName(r)} · ${dayLabel(Date.parse(r.created_at))}`;
        seen[base] = (seen[base] ?? 0) + 1;
        return { label: seen[base] > 1 ? `${base} (${seen[base]})` : base, value: r.counts.emails ?? 0 };
      });

    return {
      total: inRange.length,
      sentTotal: sentTimes.length,
      added: daily(added),
      sent: daily(sent),
      verifiedDaily: daily(verified),
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
        { label: "No email found", value: noEmail },
      ],
      found: [
        { label: "ReachAgent", value: inRange.filter((c) => c.agentRunId).length },
        { label: "Find companies", value: inRange.filter((c) => c.source === "search" && !c.agentRunId).length },
        { label: "Added by hand", value: inRange.filter((c) => c.source === "manual").length },
        { label: "File upload", value: inRange.filter((c) => c.source === "csv").length },
      ],
      cities: [...cities.slice(0, 5), ...(cities.length > 5 ? [["Other", cities.slice(5).reduce((s, [, v]) => s + v, 0)] as [string, number]] : [])]
        .map(([label, value]) => ({ label, value })),
      agents: {
        missions: missions.length,
        modes: (["fast", "smart", "bulk"] as const).map((m) => ({ label: MODE_LABEL[m], value: missions.filter((r) => r.mode === m).length })),
        success: finished.length ? Math.round((finished.filter((r) => r.status === "done").length / finished.length) * 100) : null,
        avgCompanies: finding.length ? Math.round(sum(finding, "new") / finding.length) : 0,
        avgEmails: missions.length ? Math.round(sum(missions, "emails") / missions.length) : 0,
        pipeline: [
          { label: "Companies found", value: sum(finding, "new") },
          { label: "Emails found", value: sum(finding, "emails") },
          { label: "Emails sent", value: sum(finding, "sent") },
        ],
        top,
      },
    };
  }, [companies, runs, days]);
}

const rowsOf = (xs: Part[]): [string, number][] => xs.map((x) => [x.label, x.value]);

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

type Kpi = {
  label: string; value: number; note: string; icon: React.ReactNode; tone: "primary" | "info" | "warning" | "success" | "violet";
  live?: boolean; spark?: number[]; slot?: number; onClick: () => void;
};

/** The overview: a headline, the user's agents, how they perform, then charts for the chosen period */
export function Dashboard({
  companies,
  counts,
  onFilter,
  onAgent,
  onOpenRun,
  notify,
  confirm,
}: {
  companies: Company[];
  counts: Counts;
  onFilter: (s: "all" | CompanyStatus) => void;
  /** Brief a new agent */
  onAgent: () => void;
  onOpenRun: (runId: string) => void;
  notify: (msg: string, isError?: boolean) => void;
  confirm: (r: ConfirmRequest) => void;
}) {
  const [days, setDays] = useState(14);
  const [tab, setTab] = useState<"agents" | "leads">("agents");
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const ch = useCharts(companies, runs, days);
  // Agents on a mission now, plus the companies the enrichment loop is still looking into
  const liveAgents = runs.filter((r) => AGENT_ACTIVE.includes(r.status)).length;
  const enriching = counts.working + counts.waiting;
  const inProgressNote = [
    liveAgents ? `${liveAgents} agent${liveAgents > 1 ? "s" : ""} working` : "",
    enriching ? `${enriching} compan${enriching > 1 ? "ies" : "y"} enriching` : "",
  ].filter(Boolean).join(" · ") || "Nothing running";
  const ag = ch.agents;
  // Hairlines that follow the pointer across the header, like a drafting crosshair
  const crosshair = (e: React.PointerEvent<HTMLElement>) => {
    if (e.pointerType !== "mouse") return;
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--x", `${e.clientX - r.left}px`);
    el.style.setProperty("--y", `${e.clientY - r.top}px`);
    el.classList.add("xh-on");
  };

  const kpis: Kpi[] = [
    { label: "Companies", value: counts.all, note: counts.failed ? `${counts.failed} couldn't finish` : "All you've found", icon: <Building2 size={18} />, tone: "primary", spark: ch.added.map((p) => p.value), slot: 1, onClick: () => onFilter("all") },
    { label: "In progress", value: liveAgents || enriching, note: inProgressNote, icon: <LoaderCircle size={18} className={liveAgents || counts.working ? "spin" : undefined} />, tone: "info", live: !!(liveAgents || counts.working), onClick: () => onFilter("enriching") },
    { label: "To review", value: counts.ready, note: counts.ready ? "Waiting for you" : "All reviewed", icon: <CircleCheck size={18} />, tone: "warning", onClick: () => onFilter("ready") },
    { label: "Verified emails", value: counts.verified, note: counts.risky ? `${counts.risky} risky kept aside` : "No risky emails", icon: <BadgeCheck size={18} />, tone: "success", spark: ch.verifiedDaily.map((p) => p.value), slot: 3, onClick: () => onFilter("ready") },
    { label: "Emails sent", value: counts.sent, note: "From your mailbox", icon: <Send size={18} />, tone: "violet", spark: ch.sent.map((p) => p.value), slot: 2, onClick: () => onFilter("approved") },
  ];

  const tiles = [
    { label: "Missions", value: <CountUp value={ag.missions} />, note: `in the last ${days} days`, icon: <Target size={17} /> },
    { label: "Success rate", value: ag.success === null ? "–" : <CountUp value={ag.success} suffix="%" />, note: "finished without stopping or failing", icon: <Gauge size={17} /> },
    { label: "Companies per mission", value: <CountUp value={ag.avgCompanies} />, note: "on average", icon: <Building2 size={17} /> },
    { label: "Emails per mission", value: <CountUp value={ag.avgEmails} />, note: "on average", icon: <Sparkles size={17} /> },
  ];

  return (
    <div className="dash dash2">
      <header className="dash2-hero" onPointerMove={crosshair} onPointerLeave={(e) => e.currentTarget.classList.remove("xh-on")}>
        <span className="xh" aria-hidden="true"><i className="xh-h" /><i className="xh-v" /></span>
        <div className="dash2-hero-text">
          <span className="dash2-eyebrow"><b>[01]</b> {greeting()}</span>
          <h2><SplitWords text="Leads on autopilot" /><span className="sw"><span className="sw-i st-dot" style={{ animationDelay: "300ms" }}>.</span></span></h2>
          <p>
            {liveAgents ? `${liveAgents} agent${liveAgents === 1 ? " is" : "s are"} working right now. ` : enriching ? `${enriching} compan${enriching === 1 ? "y is" : "ies are"} being looked into right now. ` : ""}
            {ch.total.toLocaleString()} found and {ch.sentTotal.toLocaleString()} emailed in the last {days} days.
          </p>
        </div>
        <div className="dh-focus">
          {counts.ready ? (
            <button type="button" className="dh-focus-btn" onClick={() => onFilter("ready")}>
              <strong><CountUp value={counts.ready} /></strong>
              <span className="dh-focus-label">compan{counts.ready === 1 ? "y" : "ies"} waiting for your review</span>
              <span className="dh-focus-go">Review now <ArrowUpRight size={15} aria-hidden="true" /></span>
            </button>
          ) : (
            <button type="button" className="dh-focus-btn" onClick={onAgent}>
              <strong><CountUp value={counts.sent} /></strong>
              <span className="dh-focus-label">email{counts.sent === 1 ? "" : "s"} sent so far. Everything is reviewed.</span>
              <span className="dh-focus-go">Start an agent <ArrowUpRight size={15} aria-hidden="true" /></span>
            </button>
          )}
        </div>
      </header>

      <ul className="kpi-grid">
        {kpis.map((k) => (
          <li key={k.label}>
            <button type="button" className={`kpi kpi2 kpi--${k.tone}`} onClick={k.onClick}>
              <span className="kpi-top">
                <span className="kpi-label">{k.label}</span>
                <span className="kpi-icon" aria-hidden="true">{k.icon}</span>
              </span>
              <strong className="kpi-value"><CountUp value={k.value} /></strong>
              {k.spark && <Sparkline values={k.spark} slot={k.slot} />}
              <span className="kpi-note">
                {k.live && <i className="kpi-dot" aria-hidden="true" />}
                {k.note}
                <ChevronRight size={14} className="kpi-chev" aria-hidden="true" />
              </span>
            </button>
          </li>
        ))}
      </ul>

      <AgentsPanel notify={notify} confirm={confirm} onOpen={onOpenRun} onNew={onAgent} onRuns={setRuns} />

      <section className="dash-section ins" aria-label="Insights">
        <div className="ins-head">
          <div>
            <span className="sp-eyebrow"><b>[03]</b> Insights</span>
            <h3>{tab === "agents" ? "How your agents did" : "Your leads and emails"}</h3>
            <p>{tab === "agents"
              ? `Missions in the last ${days} days`
              : `${ch.total.toLocaleString()} compan${ch.total === 1 ? "y" : "ies"} added and ${ch.sentTotal.toLocaleString()} email${ch.sentTotal === 1 ? "" : "s"} sent in the last ${days} days`}</p>
          </div>
          <div className="ins-controls">
            <div className="seg-control ins-period" role="radiogroup" aria-label="Period">
              {RANGES.map((n) => (
                <button key={n} type="button" role="radio" aria-checked={days === n} className={days === n ? "on" : ""} onClick={() => setDays(n)}>
                  {n}d
                </button>
              ))}
            </div>
            <div className="ins-tabs" role="tablist" aria-label="Insights">
              <button type="button" role="tab" aria-selected={tab === "agents"} className={tab === "agents" ? "on" : ""} onClick={() => setTab("agents")}>Agents</button>
              <button type="button" role="tab" aria-selected={tab === "leads"} className={tab === "leads" ? "on" : ""} onClick={() => setTab("leads")}>Leads &amp; emails</button>
            </div>
          </div>
        </div>

        {tab === "agents" ? (
          <div className="ins-body" key="agents">
        <ul className="dash2-tiles">
          {tiles.map((t) => (
            <li key={t.label} className="dash2-tile">
              <span className="dash2-tile-icon" aria-hidden="true">{t.icon}</span>
              <span className="dash2-tile-label">{t.label}</span>
              <strong>{t.value}</strong>
              <span className="dash2-tile-note">{t.note}</span>
            </li>
          ))}
        </ul>

        <div className="dash2-grid-3">
          <ChartCard title="Missions by type" sub="Which kind of agent you run" icon={<ChartPie size={16} />} rows={rowsOf(ag.modes)}>
            <Donut parts={ag.modes} unit="missions" centerLabel="missions" />
          </ChartCard>
          <ChartCard title="Agent pipeline" sub="Found, then emails, then sent (bulk sends left out)" icon={<Funnel size={16} />} rows={rowsOf(ag.pipeline)}>
            <FunnelChart steps={ag.pipeline} />
          </ChartCard>
          <ChartCard title="Top missions" sub="By emails found" icon={<Trophy size={16} />} rows={rowsOf(ag.top)}>
            <RankedBars items={ag.top} unit="emails" />
          </ChartCard>
        </div>
          </div>
        ) : (
          <div className="ins-body" key="leads">
        <div className="lf-dash-grid">
          <ChartCard title="Companies added" sub="Per day" icon={<Building2 size={16} />} rows={rowsOf(ch.added)}>
            <AreaChart points={ch.added} unit="companies" slot={1} />
          </ChartCard>
          <ChartCard title="Emails sent" sub="Per day, from your mailbox (test emails not counted)" icon={<Send size={16} />} rows={rowsOf(ch.sent)}>
            <AreaChart points={ch.sent} unit="emails" slot={2} />
          </ChartCard>
          <ChartCard title="Where companies are" sub="Each company's current step" icon={<ChartPie size={16} />} rows={rowsOf(ch.status)}>
            <Donut parts={ch.status} unit="companies" centerLabel="companies" />
          </ChartCard>
          <ChartCard title="Email quality" sub="How sure we are each email exists" icon={<BadgeCheck size={16} />} rows={rowsOf(ch.quality)}>
            <Donut parts={ch.quality} unit="emails" centerLabel="checked" />
          </ChartCard>
          <ChartCard title="How companies were found" icon={<Target size={16} />} rows={rowsOf(ch.found)}>
            <RankedBars items={ch.found} unit="companies" />
          </ChartCard>
          <ChartCard title="Top cities" icon={<MapPin size={16} />} rows={rowsOf(ch.cities)}>
            <RankedBars items={ch.cities} unit="companies" slot={3} />
          </ChartCard>
        </div>
          </div>
        )}
      </section>
    </div>
  );
}
