"use client";

import React, { useState } from "react";
import { Inbox, Send, ShieldCheck, Trash2 } from "lucide-react";
import type { ConfirmRequest } from "@/components/dashboard/ConfirmDialog";
import { type Mailbox, call, send } from "@/lib/leadFinderApi";

type Note = { ok: boolean; text: string };
type Form = { email: string; password: string; from_name: string; smtp_host: string; smtp_port: number; imap_host: string; imap_port: number };

const HOSTINGER = { smtp_host: "smtp.hostinger.com", smtp_port: 465, imap_host: "imap.hostinger.com", imap_port: 993 };

/** The user's own mailbox: emails go out from it and replies arrive in its inbox */
export function MailboxSettings({
  mailbox,
  onChange,
  notify,
  confirm,
}: {
  mailbox: Mailbox | null;
  onChange: (mb: Mailbox) => void;
  notify: (msg: string, isError?: boolean) => void;
  confirm: (r: ConfirmRequest) => void;
}) {
  const fromSaved = (): Form => ({
    email: mailbox?.email ?? "",
    password: "",
    from_name: mailbox?.from_name ?? "",
    smtp_host: mailbox?.smtp_host || HOSTINGER.smtp_host,
    smtp_port: mailbox?.smtp_port || HOSTINGER.smtp_port,
    imap_host: mailbox?.imap_host || HOSTINGER.imap_host,
    imap_port: mailbox?.imap_port || HOSTINGER.imap_port,
  });
  const [form, setForm] = useState<Form>(fromSaved);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<"save" | "test" | null>(null);
  const [note, setNote] = useState<Note | null>(null);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const connected = !!mailbox?.connected;
  const showForm = !connected || editing;
  const canSave = form.email.trim() && form.password && form.smtp_host.trim() && !busy;

  const save = async () => {
    if (!canSave) return;
    setBusy("save");
    setNote(null);
    const res = await call<Mailbox & { message: string }>("/mailbox", send("PUT", form));
    setBusy(null);
    if (res.error || !res.data) return setNote({ ok: false, text: res.error ?? "The mailbox couldn't be saved." });
    const { message, ...saved } = res.data;
    onChange(saved);
    setEditing(false);
    set("password", "");
    setNote({ ok: true, text: message });
  };

  const test = async () => {
    setBusy("test");
    setNote(null);
    const res = await call<{ message: string }>("/mailbox/test", send("POST"));
    setBusy(null);
    setNote(res.data ? { ok: true, text: res.data.message } : { ok: false, text: res.error ?? "The test email couldn't be sent." });
  };

  const setTestMode = (on: boolean) => {
    const apply = async () => {
      const res = await call<Mailbox>("/mailbox", send("PATCH", { test_mode: on }));
      if (res.error || !res.data) return notify(res.error ?? "Test mode couldn't be changed.", true);
      onChange(res.data);
      notify(on ? "Test mode on: every email now comes to you." : "Test mode off: emails now go to the real people.");
    };
    if (on) return apply();
    confirm({
      title: "Turn off test mode?",
      message: "From now on, Send emails the real people at each company. Only do this once your tests look right.",
      confirmLabel: "Send to real people",
      cancelLabel: "Keep testing",
      danger: true,
      onConfirm: apply,
    });
  };

  const remove = () =>
    confirm({
      title: "Disconnect your mailbox?",
      message: "Emails can't be sent until you connect a mailbox again. Emails already sent stay in its Sent folder.",
      confirmLabel: "Disconnect",
      cancelLabel: "Keep it",
      danger: true,
      onConfirm: async () => {
        const res = await call("/mailbox", send("DELETE"));
        if (res.error) return notify(res.error, true);
        onChange({ connected: false });
        setForm({ ...HOSTINGER, email: "", password: "", from_name: "" });
        setNote(null);
        notify("Mailbox disconnected.");
      },
    });

  return (
    <div className="lf-keys-wrap">
      <p className="lf-keys-intro">
        <ShieldCheck size={16} aria-hidden="true" />
        <span>Emails go out from your own address, so replies land in its inbox. The password is saved encrypted and never shown again.</span>
      </p>

      {!mailbox ? (
        <div className="empty"><div className="loader" /></div>
      ) : (
        <ul className="lf-keys">
          <li className={`lf-key${connected ? " is-on" : ""}`}>
            <div className="lf-key-head">
              <span className={`lf-tool-dot${connected ? " ok" : ""}`} aria-hidden="true" />
              <strong>{connected ? mailbox.email : "Your mailbox"}</strong>
              <span className="pill no-dot tone-warning">Needed to send</span>
              {connected && (
                <div className="lf-key-switches">
                  <label className="lf-key-switch">
                    <span>Test mode</span>
                    <span className="switch">
                      <input type="checkbox" checked={mailbox.test_mode !== false} onChange={(e) => setTestMode(e.target.checked)} aria-label="Test mode" />
                      <span className="switch-track" aria-hidden="true" />
                    </span>
                  </label>
                </div>
              )}
            </div>
            {connected && (
              <p className={`lf-key-note ${mailbox.test_mode !== false ? "is-ok" : "is-bad"}`}>
                {mailbox.test_mode !== false
                  ? `Test mode is on: every email goes to ${mailbox.email}, with the real person's name and address written at the top. Nobody else gets anything.`
                  : "Test mode is off: Send emails the real people."}
              </p>
            )}
            <p className="lf-key-does">
              {connected
                ? `Sending as ${mailbox.from_name ? `${mailbox.from_name} <${mailbox.email}>` : mailbox.email} through ${mailbox.smtp_host}.`
                : "Use the email address and password you log in to Hostinger webmail with."}
            </p>

            {connected && !showForm && (
              <div className="lf-key-row">
                <span className="lf-key-mask"><Inbox size={14} aria-hidden="true" /> {mailbox.email}</span>
                <div className="lf-key-actions">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={test} disabled={!!busy}>
                    <Send size={14} aria-hidden="true" /> {busy === "test" ? "Sending…" : "Send a test email"}
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setForm(fromSaved()); setEditing(true); setNote(null); }}>Change</button>
                  <button type="button" className="icon-btn danger" aria-label="Disconnect your mailbox" onClick={remove}>
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                </div>
              </div>
            )}

            {showForm && (
              <form className="lf-mailbox-form" onSubmit={(e) => { e.preventDefault(); save(); }}>
                <div className="lf-mailbox-grid">
                  <label className="field">
                    <span className="field-label">Email address</span>
                    <input className="input" type="email" autoComplete="off" placeholder="you@yourcompany.com" value={form.email}
                      disabled={!!busy} onChange={(e) => set("email", e.target.value)} />
                  </label>
                  <label className="field">
                    <span className="field-label">Password</span>
                    <input className="input" type="password" autoComplete="new-password" placeholder="Your mailbox password" value={form.password}
                      disabled={!!busy} onChange={(e) => set("password", e.target.value)} />
                  </label>
                  <label className="field">
                    <span className="field-label">Your name</span>
                    <input className="input" autoComplete="off" placeholder="e.g. Ameer Hamza" value={form.from_name}
                      disabled={!!busy} onChange={(e) => set("from_name", e.target.value)} />
                    <span className="field-hint">Shown as the sender. Leave empty to show only the address.</span>
                  </label>
                </div>
                <details className="lf-mailbox-advanced">
                  <summary>Server settings (Hostinger is filled in)</summary>
                  <div className="lf-mailbox-grid">
                    <label className="field">
                      <span className="field-label">Outgoing (SMTP) server</span>
                      <input className="input" value={form.smtp_host} disabled={!!busy} onChange={(e) => set("smtp_host", e.target.value)} />
                    </label>
                    <label className="field">
                      <span className="field-label">SMTP port</span>
                      <input className="input" type="number" value={form.smtp_port} disabled={!!busy} onChange={(e) => set("smtp_port", Number(e.target.value) || 465)} />
                    </label>
                    <label className="field">
                      <span className="field-label">Incoming (IMAP) server</span>
                      <input className="input" value={form.imap_host} disabled={!!busy} onChange={(e) => set("imap_host", e.target.value)} />
                    </label>
                    <label className="field">
                      <span className="field-label">IMAP port</span>
                      <input className="input" type="number" value={form.imap_port} disabled={!!busy} onChange={(e) => set("imap_port", Number(e.target.value) || 993)} />
                    </label>
                  </div>
                </details>
                <div className="lf-key-actions">
                  <button type="submit" className="btn btn-primary btn-sm" disabled={!canSave}>{busy === "save" ? "Checking…" : "Save and check"}</button>
                  {connected && (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setEditing(false); setNote(null); }}>Cancel</button>
                  )}
                </div>
              </form>
            )}

            {note && <p className={`lf-key-note ${note.ok ? "is-ok" : "is-bad"}`} role={note.ok ? "status" : "alert"}>{note.text}</p>}
          </li>
        </ul>
      )}
    </div>
  );
}
