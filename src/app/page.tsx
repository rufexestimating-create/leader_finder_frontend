"use client";
import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Bot, CheckCircle2, LayoutGrid, ListChecks, LogOut, PlusCircle, Settings2, WifiOff } from "lucide-react";
import { Brand } from "@/components/AuthShell";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ConfirmDialog, type ConfirmRequest } from "@/components/dashboard/ConfirmDialog";
import { apiFetch, clearToken, getToken, type AuthUser } from "@/lib/auth";
import { LeadFinderPage, type View } from "@/components/leadfinder/LeadFinderPage";

const NAV: { id: View; label: string; icon: React.ReactNode }[] = [
  { id: "dashboard", label: "Dashboard", icon: <LayoutGrid size={15} aria-hidden="true" /> },
  { id: "agent", label: "Agent", icon: <Bot size={15} aria-hidden="true" /> },
  { id: "add", label: "Add companies", icon: <PlusCircle size={15} aria-hidden="true" /> },
  { id: "results", label: "Results", icon: <ListChecks size={15} aria-hidden="true" /> },
  { id: "settings", label: "Settings", icon: <Settings2 size={15} aria-hidden="true" /> },
];

export default function Home() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [sessionError, setSessionError] = useState(false);
  // navTick changes on every nav click, so clicking the open section also closes a company review
  const [nav, setNav] = useState<{ view: View; tick: number }>({ view: "dashboard", tick: 0 });
  const [resultCount, setResultCount] = useState(0);
  const go = useCallback((view: View) => setNav((n) => ({ view, tick: n.tick + 1 })), []);
  const [toast, setToast] = useState<{ msg: string; isError: boolean; key: number } | null>(null);
  const [confirmReq, setConfirmReq] = useState<ConfirmRequest | null>(null);

  const notify = useCallback((msg: string, isError = false) => setToast({ msg, isError, key: Date.now() }), []);
  const closeConfirm = useCallback(() => setConfirmReq(null), []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.isError ? 7000 : 4500);
    return () => clearTimeout(t);
  }, [toast]);

  const checkSession = useCallback(() => {
    if (!getToken()) { router.replace("/login"); return; }
    apiFetch("/auth/me")
      .then(async (res) => {
        if (res.ok) { setSessionError(false); setUser(await res.json()); }
        else if (res.status !== 401) setSessionError(true);
      })
      .catch(() => setSessionError(true));
  }, [router]);

  useEffect(() => {
    const t = setTimeout(checkSession, 0);
    return () => clearTimeout(t);
  }, [checkSession]);

  const logOut = () => { clearToken(); router.replace("/login"); };

  if (!user) {
    return (
      <div className="loading-screen">
        {sessionError ? (
          <>
            <div className="empty-icon"><WifiOff size={26} /></div>
            <h3>We couldn&apos;t load your account.</h3>
            <p>Please check your connection and try again.</p>
            <div style={{ display: "flex", gap: "0.6rem" }}>
              <button className="btn btn-primary" onClick={checkSession}>Try again</button>
              <button className="btn btn-secondary" onClick={logOut}>Log out</button>
            </div>
          </>
        ) : (
          <><div className="loader" />Loading&hellip;</>
        )}
      </div>
    );
  }

  return (
    <div className="app">
      <a href="#main" className="skip-link">Skip to main content</a>
      <header className="topbar">
        <div className="topbar-surface" aria-hidden="true" />
        <div className="topbar-inner">
          <button type="button" className="topbar-brand" onClick={() => go("dashboard")} aria-label="Go to the dashboard"><Brand /></button>
          <nav className="lf-nav lf-topnav" aria-label="ReachAgent sections">
            {NAV.map((t) => (
              <button key={t.id} type="button" aria-current={nav.view === t.id ? "page" : undefined} className={nav.view === t.id ? "active" : ""} onClick={() => go(t.id)}>
                {t.icon}
                <span className="lf-topnav-label">{t.label}</span>
                {t.id === "results" && resultCount > 0 ? <span className="lf-tab-count">{resultCount}</span> : null}
              </button>
            ))}
          </nav>
          <div className="topbar-actions">
            <ThemeToggle />
            <button className="btn btn-ghost btn-sm" onClick={logOut}
              style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <LogOut size={15} aria-hidden="true" /> Log out
            </button>
          </div>
        </div>
      </header>
      <main className="main" id="main" tabIndex={-1}>
        <LeadFinderPage notify={notify} confirm={setConfirmReq} view={nav.view} navTick={nav.tick} onView={go} onCount={setResultCount} />
      </main>
      {toast && (
        <div key={toast.key} className={`toast${toast.isError ? " error" : ""}`} role={toast.isError ? "alert" : "status"}>
          {toast.isError ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
          <span>{toast.msg}</span>
        </div>
      )}
      <ConfirmDialog request={confirmReq} onClose={closeConfirm} />
    </div>
  );
}
