"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CircleCheck, KeyRound, WifiOff } from "lucide-react";
import type { ConfirmRequest } from "@/components/dashboard/ConfirmDialog";
import { type Company, type CompanyStatus, type Contact, DEFAULT_SETTINGS, type FinderSettings, type ToolId } from "@/lib/leadFinder";
import { type Mailbox, type ToolStatus, call, send, toCompany, toSettings, toSettingsBody } from "@/lib/leadFinderApi";
import { AgentPage } from "./AgentPage";
import { CompanyReview } from "./CompanyReview";
import { Dashboard } from "./Dashboard";
import { FinderSettingsPanel, type SettingsSection } from "./FinderSettings";
import { Results } from "./Results";

export type View = "dashboard" | "agent" | "results" | "settings";
const BUSY_MS = 3000; // while companies are being looked into, the page follows their steps
const IDLE_MS = 30_000;
const NOT_CONNECTED: Record<ToolId, ToolStatus> = {
  hunter: { connected: false, on: true }, serper: { connected: false, on: true }, verifier: { connected: false, on: true }, places: { connected: false, on: true },
  ai: { connected: false, on: true }, apollo: { connected: false, on: true }, gplaces: { connected: false, on: true },
  openai: { connected: false, on: true }, pdl: { connected: false, on: true },
};

/** What you changed on a person but the server hasn't confirmed yet. Kept on top of what the server sends, so typing isn't undone. */
type Pending = { selected?: boolean; personalLine?: string };

/**
 * Lead Finder: add companies, watch each one being looked into (website, people, emails, verification, personal
 * line), review what was found and approve the right people for a campaign. Everything is stored on the server.
 */
export function LeadFinderPage({
  notify,
  confirm,
  view,
  navTick,
  onView,
  onCount,
}: {
  notify: (msg: string, isError?: boolean) => void;
  confirm: (r: ConfirmRequest) => void;
  view: View;
  navTick: number;
  onView: (v: View) => void;
  onCount: (n: number) => void;
}) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [settings, setSettings] = useState<FinderSettings>(DEFAULT_SETTINGS);
  const [toolStatus, setToolStatus] = useState<Record<ToolId, ToolStatus>>(NOT_CONNECTED);
  const [toolsKnown, setToolsKnown] = useState(false);
  const [mailbox, setMailbox] = useState<Mailbox | null>(null);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("people");
  const [loaded, setLoaded] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [status, setStatus] = useState<"all" | CompanyStatus>("all");
  const [resultsRun, setResultsRun] = useState("all");
  const [agentRun, setAgentRun] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  // A click in the top nav closes any open company review
  const [seenTick, setSeenTick] = useState(navTick);
  if (seenTick !== navTick) {
    setSeenTick(navTick);
    setOpenId(null);
  }
  const [now, setNow] = useState(0);
  const pending = useRef<Record<string, Pending>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const overlay = useCallback((list: Company[]): Company[] => {
    if (!Object.keys(pending.current).length) return list;
    return list.map((c) => ({
      ...c,
      contacts: c.contacts.map((p): Contact => (pending.current[p.id] ? { ...p, ...pending.current[p.id] } : p)),
    }));
  }, []);

  const load = useCallback(async () => {
    const res = await call<Record<string, unknown>[]>("/companies");
    setNow(Date.now());
    if (res.error || !res.data) {
      setProblem(res.error);
      return;
    }
    setProblem(null);
    setCompanies(overlay(res.data.map(toCompany)));
    setLoaded(true);
  }, [overlay]);

  // `statusOnly`: after a key is added or removed, refresh which tools are connected without touching unsaved settings
  const loadSettings = useCallback(async (statusOnly = false) => {
    const res = await call<Record<string, unknown>>("/settings");
    if (res.data) {
      const s = toSettings(res.data);
      if (!statusOnly) setSettings(s.settings);
      setToolStatus(s.status);
      setToolsKnown(true);
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(() => {
      load();
      loadSettings();
      call<Mailbox>("/mailbox").then((res) => setMailbox(res.data ?? { connected: false }));
    }, 0);
    return () => clearTimeout(first);
  }, [load, loadSettings]);

  // Refresh tool status whenever the user navigates back to dashboard so the banner disappears instantly
  useEffect(() => { if (view === "dashboard") loadSettings(true); }, [view, loadSettings]);

  const busy = companies.some((c) => c.status === "queued" || c.status === "enriching");
  useEffect(() => {
    const timer = setInterval(load, busy ? BUSY_MS : IDLE_MS);
    return () => clearInterval(timer);
  }, [busy, load]);

  useEffect(() => {
    const live = timers.current;
    return () => Object.values(live).forEach(clearTimeout);
  }, []);

  const sorted = useMemo(() => [...companies].sort((a, b) => b.addedAt - a.addedAt), [companies]);
  const counts = useMemo(() => {
    const people = companies.filter((c) => c.status === "ready" || c.status === "approved").flatMap((c) => c.contacts);
    return {
      all: companies.length,
      working: companies.filter((c) => c.status === "enriching").length,
      waiting: companies.filter((c) => c.status === "queued").length,
      ready: companies.filter((c) => c.status === "ready").length,
      failed: companies.filter((c) => c.status === "failed").length,
      verified: people.filter((p) => p.emailStatus === "valid").length,
      risky: people.filter((p) => p.emailStatus === "catch_all").length,
      sent: companies.flatMap((c) => c.contacts).filter((p) => p.sentAt).length,
    };
  }, [companies]);

  const open = companies.find((c) => c.id === openId) ?? null;
  const back = useCallback(() => setOpenId(null), []);
  const show = (v: View) => {
    setOpenId(null);
    onView(v);
  };
  useEffect(() => onCount(companies.length), [companies.length, onCount]);
  const filterBy = (s: "all" | CompanyStatus) => {
    setStatus(s);
    show("results");
  };

  /** Pick a person for the campaign or edit their line: shown at once, saved after a short pause */
  const changeContacts = (next: Company) => {
    const before = companies.find((c) => c.id === next.id);
    setCompanies((all) => all.map((c) => (c.id === next.id ? next : c)));
    for (const p of next.contacts) {
      const was = before?.contacts.find((x) => x.id === p.id);
      if (!was) continue;
      const patch: Pending = {};
      if (p.selected !== was.selected) patch.selected = p.selected;
      if (p.personalLine !== was.personalLine) patch.personalLine = p.personalLine;
      if (!Object.keys(patch).length) continue;
      pending.current[p.id] = { ...pending.current[p.id], ...patch };
      clearTimeout(timers.current[p.id]);
      timers.current[p.id] = setTimeout(async () => {
        const sent = pending.current[p.id];
        const res = await call(`/contacts/${p.id}`, send("PATCH", { selected: sent.selected, personal_line: sent.personalLine }));
        if (res.error) notify(`${p.name}'s change wasn't saved: ${res.error}`, true);
        // Only forget it if nothing newer was typed while it was being saved
        if (pending.current[p.id] === sent) delete pending.current[p.id];
        else if (res.error) delete pending.current[p.id];
      }, 600);
    }
  };

  const sendEmails = async (c: Company) => {
    const res = await call<Record<string, unknown>>(`/companies/${c.id}/send`, send("POST"));
    if (res.error || !res.data) return notify(res.error ?? "The emails couldn't be sent.", true);
    if (typeof res.data.test_sent === "number") {
      const n = res.data.test_sent;
      return notify(`Test mode: ${n} email${n === 1 ? "" : "s"} sent to ${mailbox?.email}. Nobody at ${c.name} got anything.`);
    }
    const done = toCompany(res.data);
    setCompanies((all) => all.map((x) => (x.id === done.id ? done : x)));
    const failed = done.contacts.filter((p) => p.selected && !p.sentAt && p.sendError).length;
    const sent = done.contacts.filter((p) => p.sentAt).length;
    if (failed) notify(`${failed} email${failed === 1 ? "" : "s"} to ${done.name} didn't go out. See the reason next to each person.`, true);
    else notify(`Sent to ${sent} ${sent === 1 ? "person" : "people"} at ${done.name} from ${mailbox?.email}. Replies arrive in its inbox.`);
  };

  const retry = async (c: Company, website: string) => {
    const res = await call<Record<string, unknown>>(`/companies/${c.id}/retry`, send("POST", { website }));
    if (res.error || !res.data) return notify(res.error ?? "Couldn't try again.", true);
    const again = toCompany(res.data);
    setCompanies((all) => all.map((x) => (x.id === again.id ? again : x)));
    notify(`Trying ${c.name} again.`);
  };

  const remove = async (c: Company) => {
    const res = await call(`/companies/${c.id}`, send("DELETE"));
    if (res.error) return notify(res.error, true);
    setCompanies((all) => all.filter((x) => x.id !== c.id));
    setOpenId(null);
    notify(`${c.name} removed.`);
  };

  const saveSettings = async (s: FinderSettings) => {
    const res = await call<Record<string, unknown>>("/settings", send("PUT", toSettingsBody(s)));
    if (res.error || !res.data) return notify(res.error ?? "Settings weren't saved.", true);
    const saved = toSettings(res.data);
    setSettings(saved.settings);
    setToolStatus(saved.status);
    notify("Settings saved. They apply to the next companies looked into.");
  };

  const openTools = () => {
    setSettingsSection("advanced");
    show("settings");
  };

  if (!loaded && !problem) return <div className="card empty"><div className="loader" /></div>;

  return (
    <div className="lab-stack lf-page">
      {problem && (
        <div className="alert alert-warning" role="status">
          <WifiOff size={18} />
          <div>{problem}</div>
        </div>
      )}
      {loaded && toolsKnown && !open && !toolStatus.hunter.connected && (
        <div className="alert alert-warning" role="note">
          <KeyRound size={18} />
          <div>
            <strong>Connect your Hunter key to start finding leads.</strong> ReachAgent works through your own tool accounts, so you only use your own credits.{" "}
            <button type="button" className="link-btn" onClick={openTools}>Add your keys</button>
          </div>
        </div>
      )}
      {loaded && toolsKnown && !open && toolStatus.hunter.connected && !toolStatus.verifier.connected && (
        <div className="alert alert-info" role="note">
          <CircleCheck size={18} />
          <div>
            <strong>Reoon isn&apos;t connected.</strong> Emails are then only checked by Hunter, which is less reliable.{" "}
            <button type="button" className="link-btn" onClick={openTools}>Add your Reoon key</button>
          </div>
        </div>
      )}

      {open ? (
        <CompanyReview
          key={open.id}
          company={open}
          settings={settings}
          now={now}
          onBack={back}
          onChange={changeContacts}
          mailbox={mailbox}
          onSend={sendEmails}
          onOpenMailbox={() => { setSettingsSection("mailbox"); show("settings"); }}
          onRetry={(website) => retry(open, website)}
          onRemove={() => remove(open)}
          confirm={confirm}
        />
      ) : (
        <>
          <div key={`${view}-${navTick}`} className="lf-view">
          {view === "dashboard" && (
            <Dashboard companies={companies} counts={counts} onFilter={filterBy} onAgent={() => show("agent")} />
          )}
          {view === "agent" && (
            <AgentPage key={agentRun ?? "home"} mailbox={mailbox} notify={notify} confirm={confirm} openRunId={agentRun}
              bulkDefaults={{ subject: settings.agentSubject, message: settings.agentMessage }}
              onOpenCompany={async (id) => { await load(); setOpenId(id); }}
              onSeeResults={(id) => { setResultsRun(id); setStatus("all"); setAgentRun(null); show("results"); }}
              onClosed={() => setAgentRun(null)}
              onOpenMailbox={() => { setSettingsSection("mailbox"); show("settings"); }} />
          )}
          {view === "results" && (
            <Results companies={sorted} now={now} status={status} onStatus={setStatus} run={resultsRun} onRun={setResultsRun} onOpen={setOpenId}
              onOpenRun={(id) => { setAgentRun(id); show("agent"); }} onAgent={() => { setAgentRun(null); show("agent"); }} />
          )}
          {view === "settings" && (
            <FinderSettingsPanel
              settings={settings}
              toolStatus={toolStatus}
              onSave={saveSettings}
              notify={notify}
              confirm={confirm}
              onKeysChanged={() => loadSettings(true)}
              mailbox={mailbox}
              onMailbox={setMailbox}
              initialSection={settingsSection}
              onSection={setSettingsSection}
            />
          )}
          </div>
        </>
      )}
    </div>
  );
}
