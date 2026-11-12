"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  BadgeCheck,
  Building2,
  ChevronDown,
  Circle,
  Globe,
  ListChecks,
  MapPin,
  Newspaper,
  Search,
  Sparkles,
  UserCheck,
  CircleAlert,
  CircleCheck,
  CircleX,
  ExternalLink,
  Info,
  Link2,
  LoaderCircle,
  Mail,
  RefreshCw,
  Send,
  StickyNote,
  Trash2,
  Users,
} from "lucide-react";
import type { ConfirmRequest } from "@/components/dashboard/ConfirmDialog";
import {
  COMPANY_STATUS,
  type Company,
  type Contact,
  EMAIL_STATUS,
  type FinderSettings,
  PRIORITY_LABEL,
  SOURCE_LABEL,
  STEPS,
  describeType,
  naicsLabel,
  renderEmail,
  rolesFor,
  sizeLabel,
} from "@/lib/leadFinder";
import { Select } from "./Dropdown";
import { StepProgress, timeAgo } from "./Results";

const FOUND_PREVIEW = 4;

const canPick = (p: Contact) => !!p.email && (p.emailStatus === "valid" || p.emailStatus === "catch_all");

function StepIcon({ state }: { state: Company["steps"][number]["state"] }) {
  if (state === "done") return <CircleCheck size={18} className="lf-si lf-si--done" aria-label="Done" />;
  if (state === "running") return <LoaderCircle size={18} className="lf-si lf-si--running spin" aria-label="Working on it" />;
  if (state === "failed") return <CircleX size={18} className="lf-si lf-si--failed" aria-label="Failed" />;
  return <Circle size={18} className="lf-si lf-si--pending" aria-label="Not started" />;
}

/** One company: what was found, where it came from, who to email and how the email will read */
export function CompanyReview({
  company: c,
  settings,
  now,
  onBack,
  onChange,
  onApprove,
  onRetry,
  onRemove,
  confirm,
}: {
  company: Company;
  settings: FinderSettings;
  now: number;
  onBack: () => void;
  onChange: (c: Company) => void;
  onApprove: (c: Company) => void;
  onRetry: (website: string) => void;
  onRemove: () => void;
  confirm: (r: ConfirmRequest) => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const [website, setWebsite] = useState("");
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [showAllFound, setShowAllFound] = useState(false);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    ref.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onBack();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onBack]);

  const st = COMPANY_STATUS[c.status];
  const working = c.status === "queued" || c.status === "enriching";
  const done = c.status === "ready" || c.status === "approved";
  const picked = c.contacts.filter((p) => p.selected);
  const risky = picked.filter((p) => p.emailStatus === "catch_all").length;
  const withEmail = c.contacts.filter((p) => p.email && p.emailStatus !== "invalid");
  const preview = withEmail.find((p) => p.id === previewId) ?? picked[0] ?? withEmail[0];
  const email = preview && done ? renderEmail(settings, c, preview) : null;

  const setContact = (id: string, patch: Partial<Contact>) => onChange({ ...c, contacts: c.contacts.map((p) => (p.id === id ? { ...p, ...patch } : p)) });

  const approve = () =>
    confirm({
      title: `Approve ${picked.length} ${picked.length === 1 ? "person" : "people"}?`,
      message: (
        <>
          <strong>{picked.map((p) => `${p.name} (${p.email})`).join(", ")}</strong>
          <span className="lf-dialog-note">
            Nothing is emailed yet: sending from ReachAgent is connected in a later step. Approving marks them as chosen, with their own personal line.
            Risky emails will go last, a few at a time.
          </span>
        </>
      ),
      confirmLabel: "Approve",
      cancelLabel: "Not yet",
      onConfirm: () => onApprove(c),
    });

  const lookAgain = () =>
    confirm({
      title: `Look into ${c.name} again?`,
      message: "All 8 steps run again and what was found replaces what is shown now. It uses Hunter credits again.",
      confirmLabel: "Look again",
      cancelLabel: "Keep this",
      onConfirm: () => onRetry(""),
    });

  const remove = () =>
    confirm({
      title: `Remove ${c.name}?`,
      message: "It disappears from ReachAgent with the people and emails we found. You can add it again later.",
      confirmLabel: "Remove",
      cancelLabel: "Keep it",
      danger: true,
      onConfirm: onRemove,
    });

  const list = (xs: string[]) => (xs.length ? xs.join(", ") : null);
  // [label, value, always shown]: what enrichment looks for is always listed ("Not found"), the rest only when known
  const facts: [string, React.ReactNode, boolean][] = [
    ["Website", c.domain ? <a href={`https://${c.domain}`} target="_blank" rel="noopener noreferrer">{c.domain}</a> : null, true],
    ["Phone", c.phone, true],
    ["Address", c.address, true],
    ["Founded", c.foundedYear, true],
    ["Google rating", c.rating ? `${c.rating.toFixed(1)} ★ from ${c.reviews} reviews` : null, true],
    ["Company size", c.size ? sizeLabel(c.size) : null, true],
    ["Company type", describeType(c.companyType, c.trades) || null, false],
    ["Market sector", list(c.sectors), false],
    ["Project types", list(c.projectTypes), false],
    ["Annual revenue", c.revenue || null, false],
    ["Typical project", c.projectSize || null, false],
    ["Service area", c.serviceArea || null, false],
    ["NAICS", c.naics.length ? <span className="lf-codes">{c.naics.map((n) => <span key={n}>{naicsLabel(n)}</span>)}</span> : null, false],
    ["License", c.licenseNumber || null, false],
    ["Credentials", list(c.credentials), false],
    ["Software", list(c.technologies), false],
    [
      "Social",
      c.socials.length ? (
        <span className="lf-links">
          {c.socials.map((s) => <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer">{s.label}</a>)}
        </span>
      ) : null,
      true,
    ],
  ];
  const lookingFor = c.contactRoles.length ? c.contactRoles : rolesFor(settings, c.companyType);
  const hasNotes = !!(c.team.priority || c.team.tags.length || c.team.foundVia || c.team.notes);
  const verified = c.contacts.filter((p) => p.emailStatus === "valid").length;
  const stepsDone = c.steps.filter((s) => s.state === "done").length;
  const stats: [React.ReactNode, string, string, React.ReactNode][] = [
    [<Users key="i" size={18} />, "People found", String(c.contacts.length), "primary"],
    [<BadgeCheck key="i" size={18} />, "Verified emails", String(verified), "success"],
    [<UserCheck key="i" size={18} />, "Picked to approve", String(picked.length), "info"],
    [<ListChecks key="i" size={18} />, "Steps done", `${stepsDone}/${STEPS.length}`, "warm"],
  ];
  const found = c.sources.filter((s) => s.text);
  const pages = c.sources.filter((s) => !s.text);
  const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");

  return (
    <section ref={ref} className="lf-review" tabIndex={-1} aria-labelledby="lf-review-title">
      <button type="button" className="link-btn wu-back" onClick={onBack}><ArrowLeft size={16} /> All companies</button>

      <div className="lf-hero">
        <div className="lf-hero-top">
          <div className="lf-head-main">
            <span className="lf-hero-avatar" aria-hidden="true">{c.name[0]?.toUpperCase()}</span>
            <div className="lf-head-text">
              <span className="lf-hero-tags">
                <span className={`pill tone-${st.tone}${c.status === "enriching" ? " live" : ""}`}>{st.label}</span>
                {c.companyType && <span className="pill no-dot tone-primary">{describeType(c.companyType, c.trades)}</span>}
                {c.team.priority && (
                  <span className={`pill no-dot ${c.team.priority === "high" ? "tone-warning" : "tone-neutral"}`}>{PRIORITY_LABEL[c.team.priority]} priority</span>
                )}
              </span>
              <h2 id="lf-review-title">{c.name}</h2>
              <span className="lf-hero-meta">
                <span><MapPin size={14} aria-hidden="true" /> {[c.city, c.state, c.country].filter(Boolean).join(", ")}</span>
                {c.size && <span><Users size={14} aria-hidden="true" /> {sizeLabel(c.size)}</span>}
                {c.domain && (
                  <a href={`https://${c.domain}`} target="_blank" rel="noopener noreferrer"><Globe size={14} aria-hidden="true" /> {c.domain}</a>
                )}
                <span className="muted">{SOURCE_LABEL[c.source]}{now ? ` · ${timeAgo(c.addedAt, now)}` : ""}</span>
              </span>
            </div>
          </div>
          <div className="lf-head-actions">
          {done && (
            <button className="btn btn-primary btn-sm" disabled={!picked.length || c.status === "approved"} onClick={approve}
              title={!picked.length ? "Tick at least one person with a verified or risky email" : undefined}>
              <Send size={14} aria-hidden="true" />
              {c.status === "approved" ? "Approved" : picked.length ? `Approve ${picked.length}` : "Approve"}
            </button>
          )}
          {done && c.status !== "approved" && (
            <button className="btn btn-secondary btn-sm" onClick={lookAgain} title="Run all 8 steps again, for example if the website was down">
              <RefreshCw size={14} aria-hidden="true" /> Look again
            </button>
          )}
            <button className="btn btn-ghost btn-sm" onClick={remove}><Trash2 size={14} aria-hidden="true" /> Remove</button>
          </div>
        </div>

        <ul className="lf-stats">
          {stats.map(([icon, label, value, tone]) => (
            <li key={label} className={`lf-stat lf-stat--${tone}`}>
              <span className="lf-stat-icon" aria-hidden="true">{icon}</span>
              <span className="lf-stat-text">
                <strong>{value}</strong>
                <span>{label}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      {working && (
        <div className="alert alert-info" role="status">
          <LoaderCircle size={18} className="spin" />
          <div>
            <strong>{c.status === "queued" ? "Waiting for its turn." : "Finding details."}</strong> This page fills in as each step finishes. You can leave it and come back.
            <div style={{ marginTop: "0.5rem" }}><StepProgress c={c} /></div>
          </div>
        </div>
      )}
      {c.status === "failed" && (
        <div className="alert alert-danger" role="alert">
          <CircleAlert size={18} />
          <div className="lf-retry">
            <strong>{c.error}</strong>
            <form
              className="lf-retry-form"
              onSubmit={(e) => {
                e.preventDefault();
                onRetry(website);
                setWebsite("");
              }}
            >
              <label className="sr-only" htmlFor="lf-retry-site">Website</label>
              <input id="lf-retry-site" className="input" placeholder="Their website, e.g. ravidesign.com" value={website} onChange={(e) => setWebsite(e.target.value)} inputMode="url" />
              <button type="submit" className="btn btn-secondary btn-sm"><RefreshCw size={14} aria-hidden="true" /> {website.trim() ? "Try again with this website" : "Try again"}</button>
            </form>
          </div>
        </div>
      )}
      {c.status === "approved" && (
        <div className="alert alert-success" role="status">
          <CircleCheck size={18} />
          <div><strong>Approved.</strong> Nothing was emailed: sending from ReachAgent is connected in a later step.</div>
        </div>
      )}

      <div className="lf-review-grid">
        <div className="lf-col">
          <div className="card card-flush">
            <div className="lf-card-head">
              <h3 className="card-title"><span className="lf-title-icon"><Users size={16} aria-hidden="true" /></span> People</h3>
              {done && c.contacts.length > 0 && <span className="lf-count-chip">{picked.length} of {c.contacts.length} picked</span>}
              <span className="lf-looking">
                Looking for {lookingFor.map((r) => <span key={r} className="lf-role">{r}</span>)}
              </span>
            </div>
            {c.contacts.length === 0 ? (
              <p className="field-hint lf-pad">{working ? "People show up here once step 5 finishes." : "No one matching your roles was found."}</p>
            ) : (
              <ul className="lf-people-list">
                {c.contacts.map((p) => {
                  const es = EMAIL_STATUS[p.emailStatus];
                  const pickable = done && c.status !== "approved" && canPick(p);
                  return (
                    <li key={p.id} className={`lf-person${p.selected ? " is-picked" : ""}${p.emailStatus === "invalid" ? " is-bad" : ""}${pickable ? "" : " is-locked"}`}>
                      <label className="lf-person-pick" title={!canPick(p) ? (p.email ? "This email can't be used" : "No email to send to") : undefined}>
                        <input type="checkbox" aria-label={`Add ${p.name} to the approved list`} checked={p.selected} disabled={!pickable}
                          onChange={(e) => setContact(p.id, { selected: e.target.checked })} />
                        <span className="lf-tick" aria-hidden="true" />
                      </label>
                      <span className="lf-person-avatar" aria-hidden="true">{initials(p.name)}</span>
                      <div className="lf-person-who">
                        <strong>{p.name}</strong>
                        <span>{p.title}</span>
                        {p.linkedin && <a className="lf-inline lf-small" href={p.linkedin} target="_blank" rel="noopener noreferrer"><Link2 size={12} aria-hidden="true" /> LinkedIn</a>}
                      </div>
                      <div className="lf-person-mail">
                        <span className="lf-email">{p.email ?? (working ? "Looking…" : "No email found")}</span>
                        <span className="lf-person-meta">
                          <span className={`pill no-dot tone-${es.tone}`} title={es.hint}>{working && p.emailStatus === "unknown" ? "Checking…" : es.label}</span>
                          {p.emailSource && <span className="muted">via {p.emailSource}</span>}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {done && risky > 0 && (
              <p className="lf-note"><Info size={14} aria-hidden="true" /> {risky} picked email{risky === 1 ? " is" : "s are"} risky: they go out last, a few at a time, so a bounce can&apos;t hurt your mailbox.</p>
            )}
          </div>

          <div className="card">
            <div className="card-head">
              <div>
                <h3 className="card-title"><span className="lf-title-icon"><Mail size={16} aria-hidden="true" /></span> Email preview</h3>
                <p className="card-sub">Your message from Settings, with this person&apos;s name and personal line filled in.</p>
              </div>
              {done && withEmail.length > 1 && (
                <Select className="lab-select" ariaLabel="Preview the email for" value={preview?.id ?? ""} onChange={setPreviewId}
                  options={withEmail.map((p) => ({ value: p.id, label: p.name }))} />
              )}
            </div>
            {!email || !preview ? (
              <p className="field-hint">{working ? "The preview appears when all steps are done." : "There is no one with an email to preview."}</p>
            ) : (
              <>
                <div className="lf-mail" key={preview.id}>
                  <div className="lf-mail-top">
                    <span className="lf-person-avatar" aria-hidden="true">{initials(preview.name)}</span>
                    <div className="lf-mail-to">
                      <strong>{preview.name}</strong>
                      <span>{preview.email}</span>
                    </div>
                  </div>
                  <div className="lf-mail-subject">{email.subject}</div>
                  <div className="lf-mail-body">{email.body}</div>
                </div>
                <label className="field">
                  <span className="field-label">Personal line for {preview.name.split(" ")[0]}</span>
                  <textarea className="input textarea lf-line" rows={2} value={preview.personalLine} disabled={c.status === "approved"}
                    placeholder="Leave empty to start the email without a personal line"
                    onChange={(e) => setContact(preview.id, { personalLine: e.target.value })} />
                  <span className="field-hint">The opening line of your message, written from what was found about this company. Change it if you like.</span>
                </label>
              </>
            )}
          </div>

          {(found.length > 0 || pages.length > 0) && (
            <div className="card">
              <div className="card-head">
                <div>
                  <h3 className="card-title"><span className="lf-title-icon"><Search size={16} aria-hidden="true" /></span> What we found about them</h3>
                  {found.length > 0 && <p className="card-sub">The email&apos;s opening line is written from one of these.</p>}
                </div>
                {found.length > 0 && <span className="lf-count-chip">{found.length} facts</span>}
              </div>
              {found.length > 0 && (
                <>
                  <ul className="lf-found">
                    {(showAllFound ? found : found.slice(0, FOUND_PREVIEW)).map((s, i) => {
                      const news = s.label === "News";
                      return (
                        <li key={`${s.url}-${i}`} className={news ? "is-news" : undefined}>
                          <span className="lf-found-icon" aria-hidden="true">{news ? <Newspaper size={15} /> : <Globe size={15} />}</span>
                          <span className="lf-found-text">
                            {s.text}
                            <span className="lf-found-meta">{news ? "News" : "Their website"}{s.when ? ` · ${s.when}` : ""}</span>
                          </span>
                          <a className="lf-found-link" href={s.url} target="_blank" rel="noopener noreferrer" aria-label={`Open the source of: ${s.text}`}>
                            <ExternalLink size={14} aria-hidden="true" />
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                  {found.length > FOUND_PREVIEW && (
                    <button type="button" className="lf-show-more" onClick={() => setShowAllFound(!showAllFound)} aria-expanded={showAllFound}>
                      {showAllFound ? "Show less" : `Show ${found.length - FOUND_PREVIEW} more`}
                      <ChevronDown size={15} aria-hidden="true" className={showAllFound ? "is-up" : undefined} />
                    </button>
                  )}
                </>
              )}
              {pages.length > 0 && (
                <div className="lf-source-row">
                  <span className="lf-source-label">Sources</span>
                  <span className="lf-source-chips">
                    {pages.map((s) => (
                      <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer">{s.label} <ExternalLink size={11} aria-hidden="true" /></a>
                    ))}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="lf-col">
          <div className="card">
            <h3 className="card-title"><span className="lf-title-icon"><Building2 size={16} aria-hidden="true" /></span> Company details</h3>
            <dl className="lf-facts">
              {facts
                .filter(([, value, always]) => always || (value !== null && value !== ""))
                .map(([label, value]) => (
                  <React.Fragment key={label}>
                    <dt>{label}</dt>
                    <dd>{value ?? <span className="muted">{working ? "Looking…" : "Not found"}</span>}</dd>
                  </React.Fragment>
                ))}
            </dl>
          </div>

          <details className="card lf-timeline" open={!done}>
            <summary>
              <span className="card-title"><span className="lf-title-icon"><Sparkles size={16} aria-hidden="true" /></span> How <strong>ReachAgent</strong> found this</span>
              <span className="lf-timeline-progress">
                <span className="lf-bar" aria-hidden="true"><i style={{ transform: `scaleX(${stepsDone / STEPS.length})` }} /></span>
                {stepsDone}/{STEPS.length}
              </span>
              <ChevronDown size={18} className="lf-timeline-chev" aria-hidden="true" />
            </summary>
            <ol className="lf-steps">
              {c.steps.map((s, i) => (
                <li key={s.id} className={`lf-step is-${s.state}`} style={{ animationDelay: `${i * 0.04}s` }}>
                  <StepIcon state={s.state} />
                  <div className="lf-step-body">
                    <strong>{STEPS[i].label}</strong>
                    {s.note && <span className="lf-step-note">{s.note}</span>}
                    <span className="lf-step-tool">{STEPS[i].tool}</span>
                  </div>
                </li>
              ))}
            </ol>
          </details>

          {hasNotes && (
            <div className="card">
              <h3 className="card-title"><span className="lf-title-icon"><StickyNote size={16} aria-hidden="true" /></span> Your team&apos;s notes</h3>
              <dl className="lf-facts">
                {c.team.priority && (<><dt>Priority</dt><dd>{PRIORITY_LABEL[c.team.priority]}</dd></>)}
                {c.team.tags.length > 0 && (
                  <><dt>Tags</dt><dd><span className="lf-tags">{c.team.tags.map((t) => <span key={t} className="lf-tag">{t}</span>)}</span></dd></>
                )}
                {c.team.foundVia && (<><dt>Found via</dt><dd>{c.team.foundVia}</dd></>)}
                {c.team.notes && (<><dt>Notes</dt><dd className="lf-pre">{c.team.notes}</dd></>)}
              </dl>
            </div>
          )}

        </div>
      </div>
    </section>
  );
}
