"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CircleCheck, KeyRound, WifiOff } from "lucide-react";
import type { ConfirmRequest } from "@/components/dashboard/ConfirmDialog";
import { type Company, type CompanyInput, type CompanyStatus, type Contact, DEFAULT_SETTINGS, type FinderSettings, type SearchFilters, type ToolId } from "@/lib/leadFinder";
import { type FoundCompany, type ToolStatus, call, foundToInput, send, toCompany, toCompanyBody, toSettings, toSettingsBody } from "@/lib/leadFinderApi";
import { AddCompany } from "./AddCompany";
import { CompanyReview } from "./CompanyReview";
import { Dashboard } from "./Dashboard";
import { FinderSettingsPanel, type SettingsSection } from "./FinderSettings";
import { Results } from "./Results";

export type View = "dashboard" | "results" | "add" | "settings";
const BUSY_MS = 3000; // while companies are being looked into, the page follows their steps
const IDLE_MS = 30_000;
const CHUNK = 500; // the server takes at most 500 companies at a time
const NOT_CONNECTED: Record<ToolId, ToolStatus> = {
  hunter: { connected: false, on: true }, serper: { connected: false, on: true }, verifier: { connected: false, on: true }, places: { connected: false, on: true },
  ai: { connected: false, on: true },
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
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("people");
  const [loaded, setLoaded] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [status, setStatus] = useState<"all" | CompanyStatus>("all");
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
    }, 0);
    return () => clearTimeout(first);
  }, [load, loadSettings]);

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

  const add = async (list: CompanyInput[], source: "manual" | "csv" | "search", searchId: string | null = null): Promise<Company[] | null> => {
    const added: Company[] = [];
    for (let i = 0; i < list.length; i += CHUNK) {
      const res = await call<Record<string, unknown>[]>("/companies", send("POST", { companies: list.slice(i, i + CHUNK).map(toCompanyBody), source, search_id: searchId }));
      if (res.error || !res.data) {
        notify(res.error ?? "Couldn't add the companies.", true);
        if (added.length) load();
        return null;
      }
      added.push(...res.data.map(toCompany));
    }
    setCompanies((all) => [...added, ...all]);
    return added;
  };

  const addOne = async (input: CompanyInput) => {
    const added = await add([input], "manual");
    if (!added) return;
    notify(`${added[0].name} added. Watch each step finish here.`);
    setOpenId(added[0].id);
  };

  const upload = async (list: CompanyInput[]) => {
    if (!(await add(list, "csv"))) return;
    notify(`${list.length} compan${list.length === 1 ? "y" : "ies"} added from your file. They are looked into ${settings.atOnce} at a time.`);
    filterBy("all");
  };

  /** Companies picked from "Find companies": saved with the place and type you searched for, then looked into */
  const enrichFound = async (picked: FoundCompany[], filters: SearchFilters, searchId: string | null) => {
    if (!(await add(picked.map((c) => foundToInput(filters, c)), "search", searchId))) return;
    notify(`${picked.length} compan${picked.length === 1 ? "y" : "ies"} added. Finding the people and their emails now.`);
    filterBy("all");
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

  const approve = async (c: Company) => {
    const res = await call<Record<string, unknown>>(`/companies/${c.id}/approve`, send("POST"));
    if (res.error || !res.data) return notify(res.error ?? "Couldn't approve this company.", true);
    const done = toCompany(res.data);
    setCompanies((all) => all.map((x) => (x.id === done.id ? done : x)));
    const n = done.contacts.filter((p) => p.selected).length;
    notify(`${n} ${n === 1 ? "person" : "people"} from ${done.name} approved. Sending isn't connected yet, so nothing was emailed.`);
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
            <strong>Connect your Hunter key to start finding leads.</strong> Lead Finder works through your own tool accounts, so you only use your own credits.{" "}
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
          onApprove={approve}
          onRetry={(website) => retry(open, website)}
          onRemove={() => remove(open)}
          confirm={confirm}
        />
      ) : (
        <>
          <div key={`${view}-${navTick}`} className="lf-view">
          {view === "dashboard" && (
            <Dashboard companies={sorted} counts={counts} now={now} onFilter={filterBy} onAdd={() => show("add")} onOpen={setOpenId} />
          )}
          {view === "results" && <Results companies={sorted} now={now} status={status} onStatus={setStatus} onOpen={setOpenId} onAdd={() => show("add")} />}
          {view === "add" && (
            <AddCompany settings={settings} onAdd={addOne} onUpload={upload} onAddFound={enrichFound} onOpenSettings={() => show("settings")} notify={notify} />
          )}
          {view === "settings" && (
            <FinderSettingsPanel
              settings={settings}
              toolStatus={toolStatus}
              onSave={saveSettings}
              notify={notify}
              confirm={confirm}
              onKeysChanged={() => loadSettings(true)}
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
