"use client";

import React, { useEffect, useState } from "react";
import { Inbox, Send, ShieldCheck, Trash2 } from "lucide-react";
import type { ConfirmRequest } from "@/components/dashboard/ConfirmDialog";
import { type Mailbox, call, send } from "@/lib/leadFinderApi";

type Note = { ok: boolean; text: string };
type Form = { email: string; password: string; from_name: string; smtp_host: string; smtp_port: number; imap_host: string; imap_port: number };
type SendForm = { send_host: string; send_port: number; send_user: string; send_pass: string };

const HOSTINGER = { smtp_host: "smtp.hostinger.com", smtp_port: 465, imap_host: "imap.hostinger.com", imap_port: 993 };
const BREVO_DEFAULTS = { send_host: "smtp-relay.brevo.com", send_port: 587, send_user: "", send_pass: "" };

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

  // --- Sending server (Brevo) state ---
  const hasSend = !!(mailbox?.send_host);
  const sendFromSaved = (): SendForm => ({
    send_host: mailbox?.send_host || BREVO_DEFAULTS.send_host,
    send_port: mailbox?.send_port || BREVO_DEFAULTS.send_port,
    send_user: mailbox?.send_user || "",
    send_pass: "",
  });
  const [sendForm, setSendForm] = useState<SendForm>(sendFromSaved);
  const [sendEditing, setSendEditing] = useState(false);
  const [sendBusy, setSendBusy] = useState<"save" | "remove" | null>(null);
  const [sendNote, setSendNote] = useState<Note | null>(null);
  const setSend = <K extends keyof SendForm>(k: K, v: SendForm[K]) => setSendForm((f) => ({ ...f, [k]: v }));
  const canSaveSend = sendForm.send_host.trim() && sendForm.send_user.trim() && sendForm.send_pass && !sendBusy;

  const saveSend = async () => {
    if (!canSaveSend) return;
    setSendBusy("save");
    setSendNote(null);
    const res = await call<Mailbox & { message: string }>("/mailbox/smtp", send("PUT", sendForm));
    setSendBusy(null);
    if (res.error || !res.data) return setSendNote({ ok: false, text: res.error ?? "The sending server couldn't be saved." });
    const { message, ...saved } = res.data;
    onChange(saved);
    setSendEditing(false);
    setSend("send_pass", "");
    setSendNote({ ok: true, text: message });
  };

  const removeSend = () =>
    confirm({
      title: "Remove sending server?",
      message: "Emails will go out through your Hostinger mailbox again.",
      confirmLabel: "Remove",
      cancelLabel: "Keep it",
      danger: false,
      onConfirm: async () => {
        setSendBusy("remove");
        const res = await call("/mailbox/smtp", send("DELETE"));
        setSendBusy(null);
        if (res.error) return setSendNote({ ok: false, text: res.error });
        onChange({ ...mailbox!, send_host: "", send_user: "" });
        setSendForm(BREVO_DEFAULTS);
        setSendNote(null);
        notify("Sending server removed. Emails go through Hostinger again.");
      },
    });

  const savedTestTo = mailbox?.test_to && mailbox.test_to !== mailbox.email ? mailbox.test_to : "";
  const [testTo, setTestTo] = useState(savedTestTo);
  useEffect(() => setTestTo(savedTestTo), [savedTestTo]);
  const saveTestTo = async () => {
    const res = await call<Mailbox>("/mailbox", send("PATCH", { test_to: testTo.trim() }));
    if (res.error || !res.data) return notify(res.error ?? "The test inbox couldn't be saved.", true);
    onChange(res.data);
    notify(`Test emails now go to ${res.data.test_to}.`);
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
                  ? `Test mode is on: every email goes to ${mailbox.test_to || mailbox.email}, with the real person's name and address written at the top. Nobody else gets anything.`
                  : "Test mode is off: Send emails the real people."}
              </p>
            )}
            {connected && mailbox.test_mode !== false && (
              <form className="lf-key-row" onSubmit={(e) => { e.preventDefault(); saveTestTo(); }}>
                <label className="field" style={{ flex: 1, margin: 0 }}>
                  <span className="field-label">Send test emails to</span>
                  <input className="input" type="email" value={testTo} placeholder={`${mailbox.email} (your mailbox)`}
                    onChange={(e) => setTestTo(e.target.value)} aria-label="Send test emails to" />
                </label>
                <button type="submit" className="btn btn-secondary btn-sm"
                  disabled={testTo.trim() === savedTestTo}>Save</button>
              </form>
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

          {/* ---- Sending server (Brevo etc.) ---- */}
          {connected && (
            <li className={`lf-key${hasSend ? " is-on" : ""}`}>
              <div className="lf-key-head">
                <span className={`lf-tool-dot${hasSend ? " ok" : ""}`} aria-hidden="true" />
                <strong>Sending server</strong>
                <span className="pill no-dot tone-info">Optional</span>
              </div>
              <p className="lf-key-does">
                {hasSend
                  ? `Emails go out through ${mailbox.send_host} (${mailbox.send_user}). Your Hostinger mailbox is used only for IMAP.`
                  : "By default emails go out through your Hostinger SMTP. Connect Brevo (free: 300/day) to use a dedicated sending server instead."}
              </p>

              {hasSend && !sendEditing && (
                <div className="lf-key-row">
                  <span className="lf-key-mask"><Send size={14} aria-hidden="true" /> {mailbox.send_host}</span>
                  <div className="lf-key-actions">
                    <button type="button" className="btn btn-ghost btn-sm"
                      onClick={() => { setSendForm(sendFromSaved()); setSendEditing(true); setSendNote(null); }}>Change</button>
                    <button type="button" className="btn btn-ghost btn-sm" disabled={sendBusy === "remove"} onClick={removeSend}>
                      {sendBusy === "remove" ? "Removing…" : "Remove"}
                    </button>
                  </div>
                </div>
              )}

              {(!hasSend || sendEditing) && (
                <form className="lf-mailbox-form" onSubmit={(e) => { e.preventDefault(); saveSend(); }}>
                  <div className="lf-mailbox-grid">
                    <label className="field">
                      <span className="field-label">SMTP server</span>
                      <input className="input" value={sendForm.send_host} disabled={!!sendBusy}
                        onChange={(e) => setSend("send_host", e.target.value)} placeholder="smtp-relay.brevo.com" />
                    </label>
                    <label className="field">
                      <span className="field-label">Port</span>
                      <input className="input" type="number" value={sendForm.send_port} disabled={!!sendBusy}
                        onChange={(e) => setSend("send_port", Number(e.target.value) || 587)} />
                    </label>
                    <label className="field">
                      <span className="field-label">Login (SMTP username)</span>
                      <input className="input" autoComplete="off" value={sendForm.send_user} disabled={!!sendBusy}
                        onChange={(e) => setSend("send_user", e.target.value)} placeholder="c3a7c1001@smtp-brevo.com" />
                    </label>
                    <label className="field">
                      <span className="field-label">SMTP key / password</span>
                      <input className="input" type="password" autoComplete="new-password" value={sendForm.send_pass} disabled={!!sendBusy}
                        onChange={(e) => setSend("send_pass", e.target.value)} placeholder="xsmtpsib-…" />
                    </label>
                  </div>
                  <div className="lf-key-actions">
                    <button type="submit" className="btn btn-primary btn-sm" disabled={!canSaveSend}>
                      {sendBusy === "save" ? "Checking…" : "Save and check"}
                    </button>
                    {hasSend && (
                      <button type="button" className="btn btn-ghost btn-sm"
                        onClick={() => { setSendEditing(false); setSendNote(null); }}>Cancel</button>
                    )}
                  </div>
                </form>
              )}

              {sendNote && <p className={`lf-key-note ${sendNote.ok ? "is-ok" : "is-bad"}`} role={sendNote.ok ? "status" : "alert"}>{sendNote.text}</p>}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
