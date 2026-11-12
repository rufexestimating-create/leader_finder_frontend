"use client";

import React, { useRef, useState } from "react";
import { Gauge, Inbox, Mail, MessageSquareText, Minus, Plus, RotateCcw, SlidersHorizontal, Trash2, UserSearch } from "lucide-react";
import {
  COMPANY_TYPES,
  DEFAULT_ROLES,
  DEFAULT_SETTINGS,
  type FinderSettings,
  type LineTemplate,
  TEMPLATE_VARIABLES,
  type ToolId,
  fillTemplate,
} from "@/lib/leadFinder";
import type { ConfirmRequest } from "@/components/dashboard/ConfirmDialog";
import type { Mailbox } from "@/lib/leadFinderApi";
import { ChipInput } from "./Chips";
import { Select } from "./Dropdown";
import { MailboxSettings } from "./MailboxSettings";
import { ToolKeys } from "./ToolKeys";

/** The company each template is tried on, so you can see how a line reads */
const EXAMPLE = { name: "Saffron Line Architects", city: "Lahore", industry: "Architecture", foundedYear: 2009, rating: 4.8, reviews: 126 };
const EXAMPLE_NO_RATING = { ...EXAMPLE, name: "Indus Build Co.", city: "Karachi", industry: "Construction", foundedYear: 1998, rating: null, reviews: null };
const MAX_TEMPLATES = 8;
const ROLE_SUGGESTIONS = ["Owner", "President", "CEO", "Estimator", "Chief Estimator", "Preconstruction Manager", "Project Manager", "Operations Manager", "Business Development", "Principal", "Partner"];
const ROLE_GROUPS = [{ id: "default", label: "Any company" }, ...COMPANY_TYPES.filter((t) => t.id !== "other").map((t) => ({ id: t.id, label: t.label }))];
const MESSAGE_VARS: [string, string][] = [["first_name", "First name"], ["company", "Company"], ["personal_line", "Personal line"]];
const PREVIEW = { first_name: "Sara", company: "Saffron Line Architects", personal_line: "Your Gulberg studio project caught our eye." };
const SPEEDS: [number, string][] = [[1, "Slow"], [2, "Balanced"], [3, "Fast"], [5, "Fastest"]];
const clampDaily = (n: number) => Math.min(500, Math.max(1, Math.round(n)));
const same = (a: string[] = [], b: string[] = []) => a.length === b.length && a.every((x, i) => x === b[i]);

export type SettingsSection = "people" | "message" | "mailbox" | "lines" | "limits" | "advanced";
type Section = SettingsSection;

/** Everything a non-technical user changes day to day, one topic at a time */
export function FinderSettingsPanel({
  settings,
  toolStatus,
  onSave,
  notify,
  confirm,
  onKeysChanged,
  mailbox,
  onMailbox,
  initialSection = "people",
  onSection,
}: {
  settings: FinderSettings;
  toolStatus: Record<ToolId, { connected: boolean; on: boolean }>;
  onSave: (s: FinderSettings) => void;
  notify: (msg: string, isError?: boolean) => void;
  confirm: (r: ConfirmRequest) => void;
  onKeysChanged: () => void;
  mailbox: Mailbox | null;
  onMailbox: (mb: Mailbox) => void;
  initialSection?: SettingsSection;
  onSection?: (s: SettingsSection) => void;
}) {
  const [draft, setDraft] = useState<FinderSettings>(settings);
  // When the saved settings change (after Save or a reload), start the draft from them again
  const [base, setBase] = useState(settings);
  if (base !== settings) {
    setBase(settings);
    setDraft(settings);
  }
  const [tried, setTried] = useState(false);
  const [section, setSectionState] = useState<Section>(initialSection);
  const setSection = (s: Section) => {
    setSectionState(s);
    onSection?.(s);
  };
  const [roleType, setRoleType] = useState("default");
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const subjectRef = useRef<HTMLInputElement>(null);
  const lastField = useRef<"subject" | "message">("message");

  const set = <K extends keyof FinderSettings>(k: K, v: FinderSettings[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const setTemplate = (id: string, patch: Partial<LineTemplate>) => set("templates", draft.templates.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);
  const noRoles = !draft.roles.default?.length;
  const roleList = draft.roles[roleType] ?? [];
  const toolList: ToolId[] = ["hunter", "verifier", "serper", "ai", "apollo", "pdl"];
  const connectedTools = toolList.filter((t) => toolStatus[t].connected).length;
  const activeLines = draft.templates.filter((t) => t.enabled && t.text.trim()).length;

  const sections: { id: Section; icon: React.ReactNode; title: string; sub: string }[] = [
    { id: "people", icon: <UserSearch size={18} />, title: "Who to look for", sub: `${draft.roles.default?.length ?? 0} job titles` },
    { id: "message", icon: <Mail size={18} />, title: "Your email", sub: draft.subject || "No subject yet" },
    { id: "mailbox", icon: <Inbox size={18} />, title: "Your mailbox", sub: mailbox?.connected ? mailbox.email ?? "Connected" : "Not connected" },
    { id: "lines", icon: <MessageSquareText size={18} />, title: "Personal lines", sub: `${activeLines} in use` },
    { id: "limits", icon: <Gauge size={18} />, title: "Daily limits", sub: `${draft.dailyLimit} a day, ${draft.atOnce} at once` },
    { id: "advanced", icon: <SlidersHorizontal size={18} />, title: "Connect your tools", sub: toolStatus.hunter.connected ? `${connectedTools} of ${toolList.length} connected` : "Hunter key needed" },
  ];

  const save = () => {
    setTried(true);
    if (noRoles) {
      setSection("people");
      setRoleType("default");
      return;
    }
    onSave({ ...draft, templates: draft.templates.filter((t) => t.text.trim()) });
    setTried(false);
  };

  /** Puts {{name}} where the cursor was in the subject or message */
  const insertVar = (name: string) => {
    const token = `{{${name}}}`;
    const field = lastField.current;
    const el = field === "subject" ? subjectRef.current : messageRef.current;
    const value = field === "subject" ? draft.subject : draft.message;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    set(field, value.slice(0, start) + token + value.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  };
  const fill = (text: string) => text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => PREVIEW[k as keyof typeof PREVIEW] ?? `{{${k}}}`);

  return (
    <div className="lf-set">
      <aside className="lf-set-nav" aria-label="Settings sections">
        <span className="lf-dash-eyebrow">Settings</span>
        <ul>
          {sections.map((s) => (
            <li key={s.id}>
              <button type="button" className={section === s.id ? "active" : ""} aria-current={section === s.id ? "true" : undefined} onClick={() => setSection(s.id)}>
                <span className="lf-set-nav-icon" aria-hidden="true">{s.icon}</span>
                <span className="lf-set-nav-text">
                  <strong>{s.title}</strong>
                  <span>{s.sub}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <button type="button" className="lf-set-reset" onClick={() => setDraft(DEFAULT_SETTINGS)}>
          <RotateCcw size={14} aria-hidden="true" /> Reset everything to defaults
        </button>
      </aside>

      <div key={section} className="card lf-set-panel">
        {section === "people" && (
          <>
            <header className="lf-set-head">
              <h3>Who to look for</h3>
              <p>The job titles we search for at each company, most important first.</p>
            </header>
            <label className="field lf-set-narrow">
              <span className="field-label">Kind of company</span>
              <Select value={roleType} onChange={setRoleType}
                options={ROLE_GROUPS.map((g) => ({ value: g.id, label: `${g.label} (${draft.roles[g.id]?.length ?? 0})` }))} />
              <span className="field-hint">Start with &ldquo;Any company&rdquo;. Change a specific kind only if it needs different people.</span>
            </label>
            <ChipInput
              key={roleType}
              id="lf-roles"
              label="Job titles"
              values={roleList}
              onChange={(v) => set("roles", { ...draft.roles, [roleType]: v })}
              placeholder="Type a title and press Enter"
              suggestions={ROLE_SUGGESTIONS}
              hint={
                <>
                  {roleType !== "default" && !roleList.length ? "Empty, so the “Any company” list is used. " : ""}
                  {DEFAULT_ROLES[roleType] && !same(roleList, DEFAULT_ROLES[roleType]) && (
                    <button type="button" className="link-btn" onClick={() => set("roles", { ...draft.roles, [roleType]: DEFAULT_ROLES[roleType] })}>
                      Reset this list
                    </button>
                  )}
                </>
              }
            />
            {tried && noRoles && <span className="lf-error" role="alert">Add at least one job title for &ldquo;Any company&rdquo;.</span>}
          </>
        )}

        {section === "message" && (
          <>
            <header className="lf-set-head">
              <h3>Your email</h3>
              <p>Everyone gets this email. Click a button below to drop in their name, company or personal line.</p>
            </header>
            <div className="lf-set-split">
              <div className="lf-set-col">
                <label className="field">
                  <span className="field-label">Subject</span>
                  <input ref={subjectRef} className="input" value={draft.subject} onFocus={() => (lastField.current = "subject")} onChange={(e) => set("subject", e.target.value)} />
                </label>
                <label className="field">
                  <span className="field-label">Message</span>
                  <textarea ref={messageRef} className="input textarea" rows={10} value={draft.message} onFocus={() => (lastField.current = "message")} onChange={(e) => set("message", e.target.value)} />
                </label>
                <div className="lf-insert">
                  <span>Insert</span>
                  {MESSAGE_VARS.map(([v, label]) => (
                    <button key={v} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => insertVar(v)}>
                      <Plus size={12} aria-hidden="true" /> {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="lf-set-preview" aria-label="Preview">
                <span className="lf-set-preview-label">Preview</span>
                <strong>{fill(draft.subject) || "No subject"}</strong>
                <p>{fill(draft.message)}</p>
                <span className="field-hint">Sent as plain text from your mailbox, exactly as shown here.</span>
              </div>
            </div>
          </>
        )}

        {section === "mailbox" && (
          <>
            <header className="lf-set-head">
              <h3>Your mailbox</h3>
              <p>The address your emails are sent from. A copy of each goes to its Sent folder, and replies arrive in its inbox.</p>
            </header>
            <MailboxSettings mailbox={mailbox} onChange={onMailbox} notify={notify} confirm={confirm} />
          </>
        )}

        {section === "lines" && (
          <>
            <header className="lf-set-head">
              <h3>Personal lines</h3>
              <p>The friendly opening line for each person. We use the first one whose details we found, so it never guesses.</p>
            </header>
            <ol className="lf-lines">
              {draft.templates.map((t, i) => {
                const example = fillTemplate(t.text, EXAMPLE) ?? fillTemplate(t.text, EXAMPLE_NO_RATING);
                return (
                  <li key={t.id} className={t.enabled ? undefined : "is-off"}>
                    <span className="lf-lines-num" aria-hidden="true">{i + 1}</span>
                    <div className="lf-lines-main">
                      <label className="sr-only" htmlFor={`lf-t-${t.id}`}>Line {i + 1}</label>
                      <textarea id={`lf-t-${t.id}`} className="input textarea lf-line" rows={2} value={t.text} onChange={(e) => setTemplate(t.id, { text: e.target.value })} placeholder="e.g. Congrats on {{reviews}} great reviews in {{city}}." />
                      {example && <span className="lf-lines-example">&ldquo;{example}&rdquo;</span>}
                    </div>
                    <div className="lf-lines-side">
                      <label className="switch" title={t.enabled ? "In use" : "Not used"}>
                        <input type="checkbox" checked={t.enabled} onChange={(e) => setTemplate(t.id, { enabled: e.target.checked })} aria-label={`Use line ${i + 1}`} />
                        <span className="switch-track" aria-hidden="true" />
                      </label>
                      <button type="button" className="icon-btn danger" aria-label={`Delete line ${i + 1}`} onClick={() => set("templates", draft.templates.filter((x) => x.id !== t.id))}>
                        <Trash2 size={15} aria-hidden="true" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ol>
            <div className="lf-set-foot">
              <button type="button" className="btn btn-secondary btn-sm" disabled={draft.templates.length >= MAX_TEMPLATES}
                onClick={() => set("templates", [...draft.templates, { id: `t-${Date.now().toString(36)}`, text: "", enabled: true }])}>
                <Plus size={14} aria-hidden="true" /> Add a line
              </button>
              <span className="field-hint">
                You can use {TEMPLATE_VARIABLES.map((v, i) => <React.Fragment key={v}>{i ? ", " : ""}<code>{`{{${v}}}`}</code></React.Fragment>)}.
              </span>
            </div>
          </>
        )}

        {section === "limits" && (
          <>
            <header className="lf-set-head">
              <h3>Daily limits</h3>
              <p>Keeps your search credits under control.</p>
            </header>
            <div className="lf-limits">
              <div className="lf-limit">
                <div className="lf-limit-head">
                  <label className="field-label" htmlFor="lf-daily">Companies per day</label>
                  <span className="field-hint">The rest wait until tomorrow.</span>
                </div>
                <div className="lf-stepper">
                  <button type="button" aria-label="Fewer companies per day" disabled={draft.dailyLimit <= 1}
                    onClick={() => set("dailyLimit", clampDaily(draft.dailyLimit - 10))}><Minus size={18} aria-hidden="true" /></button>
                  <input id="lf-daily" className="lf-stepper-value" type="number" min={1} max={500} inputMode="numeric" value={draft.dailyLimit}
                    onChange={(e) => set("dailyLimit", clampDaily(Number(e.target.value) || 1))} />
                  <button type="button" aria-label="More companies per day" disabled={draft.dailyLimit >= 500}
                    onClick={() => set("dailyLimit", clampDaily(draft.dailyLimit + 10))}><Plus size={18} aria-hidden="true" /></button>
                </div>
                <div className="lf-presets" role="group" aria-label="Quick picks">
                  {[25, 50, 100, 200].map((n) => (
                    <button key={n} type="button" className={draft.dailyLimit === n ? "on" : ""} aria-pressed={draft.dailyLimit === n} onClick={() => set("dailyLimit", n)}>{n}</button>
                  ))}
                </div>
              </div>

              <div className="lf-limit">
                <div className="lf-limit-head">
                  <span className="field-label" id="lf-atonce">Looked into at the same time</span>
                  <span className="field-hint">More is faster but uses credits quicker.</span>
                </div>
                <div className="lf-speed" role="group" aria-labelledby="lf-atonce">
                  {SPEEDS.map(([n, label]) => (
                    <button key={n} type="button" className={draft.atOnce === n ? "on" : ""} aria-pressed={draft.atOnce === n} onClick={() => set("atOnce", n)}>
                      <strong>{n}</strong>
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <p className="lf-limit-summary">
              Up to <strong>{draft.dailyLimit}</strong> compan{draft.dailyLimit === 1 ? "y" : "ies"} a day, about{" "}
              <strong>{(draft.dailyLimit * 30).toLocaleString()}</strong> a month, with <strong>{draft.atOnce}</strong> running at once.
            </p>
          </>
        )}

        {section === "advanced" && (
          <>
            <header className="lf-set-head">
              <h3>Connect your tools</h3>
              <p>ReachAgent finds and checks details through these services. Turn one off and its step is skipped.</p>
            </header>
            <ToolKeys
              tools={draft.tools}
              onTool={(tool, on) => set("tools", { ...draft.tools, [tool]: on })}
              notify={notify}
              confirm={confirm}
              onChanged={onKeysChanged}
            />
            <div className="lf-set-divider" />
            <ChipInput id="lf-skip" label="Websites to skip" values={draft.skipSites} onChange={(v) => set("skipSites", v)} placeholder="e.g. olx.com.pk"
              hint="Directories and social sites are never taken as a company's own website." />
          </>
        )}
      </div>

      <div className={`lf-set-save${dirty ? " is-shown" : ""}`} aria-hidden={!dirty}>
        <span>You have unsaved changes</span>
        <button type="button" className="btn btn-ghost btn-sm" tabIndex={dirty ? 0 : -1} onClick={() => setDraft(settings)}>Discard</button>
        <button type="button" className="btn btn-primary btn-sm" tabIndex={dirty ? 0 : -1} onClick={save}>Save changes</button>
      </div>
    </div>
  );
}
