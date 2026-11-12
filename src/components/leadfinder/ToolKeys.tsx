"use client";

import React, { useEffect, useState } from "react";
import { ExternalLink, KeyRound, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import type { ConfirmRequest } from "@/components/dashboard/ConfirmDialog";
import type { ToolId } from "@/lib/leadFinder";
import { call, send } from "@/lib/leadFinderApi";

type Provider = "hunter" | "reoon" | "serper" | "ai" | "apollo" | "gplaces" | "openai" | "pdl";
type KeyState = { connected: boolean; last4: string | null };
type Note = { ok: boolean; text: string };

/** The four services ReachAgent uses. Each user connects their own account, so they pay only for what they use. */
const CARDS: { provider: Provider; name: string; required?: boolean; does: string; link: string; switches: { tool: ToolId; label: string }[] }[] = [
  {
    provider: "hunter",
    name: "Hunter",
    required: true,
    does: "Finds companies, the people who run them and their emails. Nothing works without it.",
    link: "https://hunter.io/api-keys",
    switches: [{ tool: "hunter", label: "In use" }],
  },
  {
    provider: "reoon",
    name: "Reoon",
    does: "Checks that every email really exists, so you don't send to addresses that bounce.",
    link: "https://reoon.com/email-verifier/",
    switches: [{ tool: "verifier", label: "In use" }],
  },
  {
    provider: "serper",
    name: "Serper (Google)",
    does: "Finds a website Hunter can't, and adds the Google rating, phone, address and recent news.",
    link: "https://serper.dev/api-keys",
    switches: [{ tool: "serper", label: "Website search" }, { tool: "places", label: "Google rating" }],
  },
  {
    provider: "ai",
    name: "Google Gemini",
    does: "Writes the personal opening line of each email from what was found. Without it, your own lines are used.",
    link: "https://aistudio.google.com/apikey",
    switches: [{ tool: "ai", label: "In use" }],
  },
  {
    provider: "apollo",
    name: "Apollo.io",
    does: "Fallback contact finder: when Hunter can't find a person's email, Apollo tries its 275M+ contact database.",
    link: "https://app.apollo.io/#/settings/integrations/api",
    switches: [{ tool: "apollo", label: "In use" }],
  },
  {
    provider: "gplaces",
    name: "Google Places API",
    does: "Finds local businesses by city and type with accurate phone, address, rating and website directly from Google Maps.",
    link: "https://console.cloud.google.com/apis/library/places-backend.googleapis.com",
    switches: [{ tool: "gplaces", label: "In use" }],
  },
  {
    provider: "openai",
    name: "OpenAI",
    does: "Fallback AI writer: if Gemini is unavailable, OpenAI (GPT-4o mini) writes the personal opening line instead.",
    link: "https://platform.openai.com/api-keys",
    switches: [{ tool: "openai", label: "In use" }],
  },
  {
    provider: "pdl",
    name: "People Data Labs",
    does: "Adds professional background, job history and LinkedIn data to each contact, improving personalisation.",
    link: "https://dashboard.peopledatalabs.com/api-keys",
    switches: [{ tool: "pdl", label: "In use" }],
  },
];

export function ToolKeys({
  tools,
  onTool,
  notify,
  confirm,
  onChanged,
}: {
  tools: Record<ToolId, boolean>;
  onTool: (tool: ToolId, on: boolean) => void;
  notify: (msg: string, isError?: boolean) => void;
  confirm: (r: ConfirmRequest) => void;
  onChanged: () => void;
}) {
  const [keys, setKeys] = useState<Record<Provider, KeyState> | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Partial<Record<Provider, string>>>({});
  const [editing, setEditing] = useState<Partial<Record<Provider, boolean>>>({});
  const [notes, setNotes] = useState<Partial<Record<Provider, Note>>>({});
  const [busy, setBusy] = useState<Provider | null>(null);

  useEffect(() => {
    let live = true;
    call<Record<Provider, KeyState>>("/keys").then((res) => {
      if (!live) return;
      if (res.data) setKeys(res.data);
      else setProblem(res.error ?? "Your keys couldn't be loaded.");
    });
    return () => {
      live = false;
    };
  }, []);

  const note = (p: Provider, n: Note | null) =>
    setNotes((all) => {
      const next = { ...all };
      if (n) next[p] = n;
      else delete next[p];
      return next;
    });

  const save = async (p: Provider) => {
    const key = (drafts[p] ?? "").trim();
    if (!key) return;
    setBusy(p);
    note(p, null);
    const res = await call<{ last4: string; message: string }>(`/keys/${p}`, send("PUT", { key }));
    setBusy(null);
    if (res.error || !res.data) return note(p, { ok: false, text: res.error ?? "The key couldn't be saved." });
    const saved = res.data;
    setKeys((all) => (all ? { ...all, [p]: { connected: true, last4: saved.last4 } } : all));
    setDrafts((d) => ({ ...d, [p]: "" }));
    setEditing((e) => ({ ...e, [p]: false }));
    note(p, { ok: true, text: saved.message });
    onChanged();
  };

  const check = async (p: Provider) => {
    setBusy(p);
    note(p, null);
    const res = await call<{ ok: boolean; message: string }>(`/keys/${p}/test`, send("POST"));
    setBusy(null);
    note(p, res.data ? { ok: res.data.ok, text: res.data.message } : { ok: false, text: res.error ?? "The key couldn't be checked." });
  };

  const remove = (p: Provider, name: string) =>
    confirm({
      title: `Remove your ${name} key?`,
      message: `${name} steps stop working until you add a key again. Companies already found stay as they are.`,
      confirmLabel: "Remove",
      cancelLabel: "Keep it",
      danger: true,
      onConfirm: async () => {
        const res = await call(`/keys/${p}`, send("DELETE"));
        if (res.error) return notify(res.error, true);
        setKeys((all) => (all ? { ...all, [p]: { connected: false, last4: null } } : all));
        note(p, null);
        notify(`${name} key removed.`);
        onChanged();
      },
    });

  return (
    <div className="lf-keys-wrap">
      <p className="lf-keys-intro">
        <ShieldCheck size={16} aria-hidden="true" />
        <span>These are your own accounts, so you only use your own credits. Keys are saved encrypted and only the last four characters are ever shown again.</span>
      </p>

      {problem && (
        <div className="alert alert-warning" role="alert">
          <div>{problem}</div>
        </div>
      )}

      {!keys && !problem ? (
        <div className="empty"><div className="loader" /></div>
      ) : keys ? (
        <ul className="lf-keys">
          {CARDS.map((card) => {
            const p = card.provider;
            const state = keys[p];
            const connected = state.connected;
            const showForm = !connected || !!editing[p];
            const working = busy === p;
            const n = notes[p];
            return (
              <li key={p} className={`lf-key${connected ? " is-on" : ""}`}>
                <div className="lf-key-head">
                  <span className={`lf-tool-dot${connected ? " ok" : ""}`} aria-hidden="true" />
                  <strong>{card.name}</strong>
                  <span className={`pill no-dot ${card.required ? "tone-warning" : "tone-neutral"}`}>{card.required ? "Required" : "Optional"}</span>
                  {connected && (
                    <div className="lf-key-switches">
                      {card.switches.map((s) => (
                        <label key={s.tool} className="lf-key-switch">
                          <span>{s.label}</span>
                          <span className="switch">
                            <input type="checkbox" checked={tools[s.tool]} onChange={(e) => onTool(s.tool, e.target.checked)} aria-label={`${card.name}: ${s.label}`} />
                            <span className="switch-track" aria-hidden="true" />
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                <p className="lf-key-does">{card.does}</p>

                {connected && !showForm && (
                  <div className="lf-key-row">
                    <span className="lf-key-mask"><KeyRound size={14} aria-hidden="true" /> ••••{state.last4}</span>
                    <div className="lf-key-actions">
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => check(p)} disabled={working}>
                        <RefreshCw size={14} aria-hidden="true" className={working ? "spin" : undefined} /> {working ? "Checking…" : "Check credits"}
                      </button>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing((e) => ({ ...e, [p]: true }))}>Replace</button>
                      <button type="button" className="icon-btn danger" aria-label={`Remove your ${card.name} key`} onClick={() => remove(p, card.name)}>
                        <Trash2 size={15} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                )}

                {showForm && (
                  <>
                    <form className="lf-key-form" onSubmit={(e) => { e.preventDefault(); save(p); }}>
                      <label className="sr-only" htmlFor={`lf-key-${p}`}>{card.name} API key</label>
                      <input
                        id={`lf-key-${p}`}
                        className="input"
                        type="password"
                        autoComplete="off"
                        spellCheck={false}
                        placeholder={`Paste your ${card.name} API key`}
                        value={drafts[p] ?? ""}
                        disabled={working}
                        onChange={(e) => setDrafts((d) => ({ ...d, [p]: e.target.value }))}
                      />
                      <button type="submit" className="btn btn-primary btn-sm" disabled={!(drafts[p] ?? "").trim() || working}>
                        {working ? "Checking…" : "Save and check"}
                      </button>
                      {connected && (
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setEditing((e) => ({ ...e, [p]: false })); setDrafts((d) => ({ ...d, [p]: "" })); note(p, null); }}>
                          Cancel
                        </button>
                      )}
                    </form>
                    <a className="lf-key-get" href={card.link} target="_blank" rel="noopener noreferrer">
                      Get a {card.name} key <ExternalLink size={12} aria-hidden="true" />
                    </a>
                  </>
                )}

                {n && <p className={`lf-key-note ${n.ok ? "is-ok" : "is-bad"}`} role={n.ok ? "status" : "alert"}>{n.text}</p>}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
