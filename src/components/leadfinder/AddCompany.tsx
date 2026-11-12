"use client";

import React, { useEffect, useRef, useState } from "react";
import { ChevronDown, Download, FileUp, Info, Search, SearchX, Settings2, UserSearch } from "lucide-react";
import {
  COMMON_NAICS,
  COMPANY_TYPES,
  COUNTRIES,
  CREDENTIALS,
  type CompanyInput,
  type CompanyTypeId,
  EMPTY_FILTERS,
  EMPTY_INPUT,
  FOUND_VIA,
  type FinderSettings,
  NAICS,
  PROJECT_SIZES,
  PROJECT_TYPES,
  type Priority,
  REVENUES,
  type SearchFilters,
  SAMPLE_CSV,
  SECTORS,
  SIZES,
  SOFTWARE_SUGGESTIONS,
  TRADES,
  US_STATES,
  csvToCompanies,
  isTypeId,
  isUS,
  naicsFor,
  naicsLabel,
  rolesFor,
  sizeLabel,
  tradeLabel,
  typeLabel,
} from "@/lib/leadFinder";
import { type FoundCompany, call, send, toSearchBody } from "@/lib/leadFinderApi";
import { ChipInput, PickOne, ToggleChips } from "./Chips";
import { Combobox, Select } from "./Dropdown";

const NOT_SURE = { value: "", label: "Not sure" };
const SIZE_OPTIONS = [NOT_SURE, ...SIZES.map((s) => ({ value: s, label: sizeLabel(s) }))];
const REVENUE_OPTIONS = [NOT_SURE, ...REVENUES.map((r) => ({ value: r, label: r }))];
const PROJECT_SIZE_OPTIONS = [NOT_SURE, ...PROJECT_SIZES.map((p) => ({ value: p, label: p }))];

type TextKey = "name" | "website" | "country" | "state" | "city" | "size" | "revenue" | "projectSize" | "foundedYear" | "serviceArea" | "licenseNumber" | "foundVia" | "notes";

const article = (word: string) => (/^[aeiou]/i.test(word) ? "an" : "a");

/* ---------- Form ---------- */

/**
 * The one form. With a company name it looks into that company. With the name left empty it searches for companies of the
 * chosen kind in the chosen place (and size, if known) and lists them to pick from. A CSV file adds many at once.
 * Whatever the user doesn't know, they leave empty.
 */
export function AddCompany({
  settings,
  onAdd,
  onUpload,
  onAddFound,
  onOpenSettings,
  notify,
}: {
  settings: FinderSettings;
  onAdd: (c: CompanyInput) => void;
  onUpload: (list: CompanyInput[]) => void;
  onAddFound: (found: FoundCompany[], filters: SearchFilters, searchId: string | null) => void;
  onOpenSettings: () => void;
  notify: (msg: string, isError?: boolean) => void;
}) {
  const [form, setForm] = useState<CompanyInput>(EMPTY_INPUT);
  // Job titles and NAICS codes fill themselves from the company type until you change them
  const [rolesTouched, setRolesTouched] = useState(false);
  const [naicsTouched, setNaicsTouched] = useState(false);
  const [tried, setTried] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [found, setFound] = useState<{ results: FoundCompany[]; total: number; searchId: string | null; filters: SearchFilters } | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const hitsRef = useRef<HTMLElement>(null);

  // The results appear under the form: bring them into view when the search starts and again when they arrive
  useEffect(() => {
    hitsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [searching, found, searchError]);

  const set = <K extends keyof CompanyInput>(k: K, v: CompanyInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const text = (k: TextKey) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const v = e.target.value;
    setForm((f) => ({ ...f, [k]: v }));
  };
  const pickType = (id: CompanyTypeId | "") => setForm((f) => ({ ...f, companyType: id, trades: id === "sub" ? f.trades : [] }));

  const us = isUS(form.country);
  const typeName = typeLabel(form.companyType);
  const roles = rolesTouched ? form.contactRoles : rolesFor(settings, form.companyType);
  const naics = naicsTouched ? form.naics : naicsFor(form.companyType, form.trades);
  // A name looks into that company (country and city needed). No name searches for companies (country and type needed).
  const searchMode = !form.name.trim();
  const missing = { country: !form.country.trim(), city: !searchMode && !form.city.trim(), type: searchMode && !form.companyType };
  const invalid = missing.country || missing.city || missing.type;
  const moreFilled = [
    form.sectors.length, form.projectTypes.length, form.revenue, form.projectSize, form.foundedYear, form.serviceArea,
    form.software.length, us && form.licenseNumber, us && form.credentials.length, us && naicsTouched,
  ].filter(Boolean).length;
  const teamFilled = [form.priority, form.tags.length, form.foundVia, form.notes].filter(Boolean).length;

  const reset = () => {
    setForm(EMPTY_INPUT);
    setRolesTouched(false);
    setNaicsTouched(false);
    setTried(false);
    setFound(null);
    setSearchError(null);
  };

  const runSearch = async () => {
    const filters: SearchFilters = {
      ...EMPTY_FILTERS,
      countries: [form.country.trim()],
      states: us && form.state.trim() ? [form.state.trim()] : [],
      cities: form.city.trim() ? [form.city.trim()] : [],
      companyTypes: [form.companyType],
      trades: form.companyType === "sub" ? form.trades : [],
      sizes: form.size ? [form.size] : [],
      limit: 25,
    };
    setSearching(true);
    setSearchError(null);
    setPicked([]);
    const res = await call<{ results: FoundCompany[]; total: number; search_id: string | null }>("/search", send("POST", toSearchBody(filters)));
    setSearching(false);
    if (res.error || !res.data) return setSearchError(res.error ?? "The search didn't work. Try again.");
    setFound({ results: res.data.results, total: res.data.total, searchId: res.data.search_id, filters });
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (invalid) return document.querySelector<HTMLInputElement>(".lf-add-form [aria-invalid='true']")?.focus();
    if (searchMode) return void runSearch();
    onAdd({ ...form, contactRoles: roles, naics: us ? naics : [] });
    reset();
  };

  const selectable = (found?.results ?? []).filter((r) => !r.in_list);
  const allPicked = selectable.length > 0 && selectable.every((r) => picked.includes(r.domain));
  const toggle = (domain: string) => setPicked((p) => (p.includes(domain) ? p.filter((d) => d !== domain) : [...p, domain]));
  const where = [form.city.trim(), us ? form.state.trim() : "", form.country.trim()].filter(Boolean).join(", ");

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    const { companies, skipped, error } = csvToCompanies(await file.text());
    if (fileRef.current) fileRef.current.value = "";
    if (error) return notify(error, true);
    if (!companies.length) return notify("No companies were added: every row needs a name, country and city.", true);
    onUpload(companies);
    if (skipped) notify(`Added ${companies.length} compan${companies.length === 1 ? "y" : "ies"}. ${skipped} row${skipped === 1 ? " was" : "s were"} skipped: they had no name, country or city.`);
  };

  return (
    <div className="lf-add">
      <div className="lf-add-main">
      <form className="card lf-add-form" onSubmit={submit} noValidate>
        <div className="card-head">
          <div>
            <span className="lf-form-eyebrow">New search</span>
            <h2 className="lf-form-title">Add companies</h2>
            <p className="card-sub">
              Know the company? Type its name. Don&apos;t? <strong>Leave the name empty</strong> and we find companies for you from the place and the kind of company.
              Anything you don&apos;t know, leave empty.
            </p>
          </div>
        </div>

        {/* 1. The company */}
        <fieldset className="lf-group">
          <legend className="lf-group-title"><span className="step-num" aria-hidden="true">1</span> The company</legend>
          <div className="lf-form-grid">
            <label className="field lf-span-2">
              <span className="field-label">Company name <span className="mb-muted">(leave empty to search for companies)</span></span>
              <input className="input" value={form.name} onChange={text("name")} placeholder="e.g. Lone Star Builders" autoComplete="off" />
            </label>
            <label className="field lf-span-2">
              <span className="field-label">Website <span className="mb-muted">(optional)</span></span>
              <input className="input" value={form.website} onChange={text("website")} placeholder="e.g. lonestarbuilders.com" inputMode="url" autoComplete="off" />
              <span className="field-hint">If you know it, add it: we skip the search and the results are more accurate.</span>
            </label>
            <label className="field">
              <span className="field-label">Country <span className="lf-req" aria-hidden="true">*</span></span>
              <Combobox value={form.country} onChange={(v) => set("country", v)} options={COUNTRIES} placeholder="Pick or type a country"
                invalid={tried && missing.country} required />
              {tried && missing.country && <span className="lf-error" role="alert">Pick the country.</span>}
            </label>
            {us && (
              <label className="field">
                <span className="field-label">State <span className="mb-muted">(optional)</span></span>
                <Combobox value={form.state} onChange={(v) => set("state", v)} options={US_STATES} placeholder="e.g. Texas" />
              </label>
            )}
            <label className="field">
              <span className="field-label">City {searchMode ? <span className="mb-muted">(optional)</span> : <span className="lf-req" aria-hidden="true">*</span>}</span>
              <input className="input" value={form.city} onChange={text("city")} placeholder={us ? "e.g. Dallas" : "e.g. Lahore"}
                aria-invalid={tried && missing.city} aria-required={!searchMode} autoComplete="off" />
              {tried && missing.city && <span className="lf-error" role="alert">Type the city.</span>}
            </label>
            <label className="field">
              <span className="field-label">Company size <span className="mb-muted">(optional)</span></span>
              <Select value={form.size} onChange={(v) => set("size", v)} options={SIZE_OPTIONS} />
              <span className="field-hint">Number of employees.</span>
            </label>
          </div>
        </fieldset>

        {/* 2. Company type */}
        <fieldset className="lf-group">
          <legend className="lf-group-title"><span className="step-num" aria-hidden="true">2</span> What kind of company is it? {searchMode ? <span className="lf-req" aria-hidden="true">*</span> : <span className="mb-muted">(optional)</span>}</legend>
          <p className={`field-hint lf-group-hint${tried && missing.type ? " lf-error" : ""}`} role={tried && missing.type ? "alert" : undefined}>
            {searchMode ? "Needed for the search: it is the kind of company we look for. " : ""}It also decides who we look for{us ? " and which industry codes we use" : ""}. Click again to clear.
          </p>
          <div className="lf-types">
            {COMPANY_TYPES.map((t) => {
              const on = form.companyType === t.id;
              return (
                <button key={t.id} type="button" className={`lf-type${on ? " on" : ""}`} aria-pressed={on} onClick={() => pickType(on ? "" : t.id)}>
                  <strong>{t.label}</strong>
                  <span>{t.hint}</span>
                </button>
              );
            })}
          </div>
          {form.companyType === "sub" && (
            <div className="lf-sub-trades">
              <ToggleChips label="Which trade? Pick all that apply" options={TRADES.map((t) => t.id)} labelOf={tradeLabel}
                values={form.trades} onChange={(v) => set("trades", v)} />
            </div>
          )}
        </fieldset>

        {/* 3. Who to look for */}
        <fieldset className="lf-group">
          <legend className="lf-group-title"><span className="step-num" aria-hidden="true">3</span> Who should we look for?</legend>
          <ChipInput
            id="lf-add-roles"
            label="Job titles, best first"
            values={roles}
            onChange={(v) => {
              setRolesTouched(true);
              set("contactRoles", v);
            }}
            placeholder="e.g. Owner"
            hint={
              rolesTouched ? (
                <>
                  Your own list for this company.{" "}
                  <button type="button" className="link-btn" onClick={() => setRolesTouched(false)}>Go back to the usual list</button>
                </>
              ) : (
                <>
                  The usual people at {typeName ? `${article(typeName)} ${typeName.toLowerCase()}` : "any company"}. Change them here for this company, or{" "}
                  <button type="button" className="link-btn" onClick={onOpenSettings}>edit the lists in Settings</button>.
                </>
              )
            }
          />
        </fieldset>

        {/* More details: collapsed so the form stays short */}
        <details className="lf-more">
          <summary>
            <span className="lf-more-title">More details</span>
            <span className="lf-more-meta">optional{moreFilled ? ` · ${moreFilled} filled` : ""}</span>
            <ChevronDown size={16} className="lf-section-chevron" aria-hidden="true" />
          </summary>
          <div className="lf-more-body">
            <div className="lf-subgroup">
              <h4>Their work</h4>
              <ToggleChips label="Market sector" options={SECTORS} values={form.sectors} onChange={(v) => set("sectors", v)} />
              <ToggleChips label="Project types" options={PROJECT_TYPES} values={form.projectTypes} onChange={(v) => set("projectTypes", v)} />
            </div>

            <div className="lf-subgroup">
              <h4>Revenue and projects</h4>
              <div className="lf-form-grid">
                <label className="field">
                  <span className="field-label">Annual revenue</span>
                  <Select value={form.revenue} onChange={(v) => set("revenue", v)} options={REVENUE_OPTIONS} />
                </label>
                <label className="field">
                  <span className="field-label">Typical project size</span>
                  <Select value={form.projectSize} onChange={(v) => set("projectSize", v)} options={PROJECT_SIZE_OPTIONS} />
                </label>
                <label className="field">
                  <span className="field-label">Founded</span>
                  <input className="input" inputMode="numeric" maxLength={4} placeholder="e.g. 2004" value={form.foundedYear}
                    onChange={(e) => set("foundedYear", e.target.value.replace(/\D/g, ""))} />
                </label>
              </div>
            </div>

            <div className="lf-subgroup">
              <h4>Where and how they work</h4>
              <label className="field">
                <span className="field-label">Service area</span>
                <input className="input" value={form.serviceArea} onChange={text("serviceArea")} placeholder={us ? "e.g. Dallas–Fort Worth, or within 50 miles of Dallas" : "e.g. Lahore and Islamabad"} />
              </label>
              <ChipInput id="lf-add-software" label="Software they use" values={form.software} onChange={(v) => set("software", v)}
                placeholder="e.g. Procore" suggestions={SOFTWARE_SUGGESTIONS} hint="Leave it empty and we read it from their website." />
            </div>

            {us ? (
              <div className="lf-subgroup lf-subgroup--us">
                <h4>United States</h4>
                <ChipInput
                  id="lf-add-naics"
                  label="Industry codes (NAICS)"
                  values={naics}
                  onChange={(v) => {
                    setNaicsTouched(true);
                    set("naics", v);
                  }}
                  placeholder="e.g. 236220"
                  options={Object.keys(NAICS)}
                  suggestions={COMMON_NAICS}
                  labelOf={naicsLabel}
                  hint={
                    naicsTouched ? (
                      <button type="button" className="link-btn" onClick={() => setNaicsTouched(false)}>Fill in from the company type again</button>
                    ) : isTypeId(form.companyType) && naics.length ? (
                      "Filled in from the company type and trade."
                    ) : (
                      "Pick a company type above and these fill themselves."
                    )
                  }
                />
                <div className="lf-form-grid">
                  <label className="field">
                    <span className="field-label">License number</span>
                    <input className="input" value={form.licenseNumber} onChange={text("licenseNumber")} placeholder="e.g. TX-123456" autoComplete="off" />
                  </label>
                </div>
                <ToggleChips label="Credentials" options={CREDENTIALS} values={form.credentials} onChange={(v) => set("credentials", v)} />
              </div>
            ) : (
              <p className="field-hint lf-us-note">Industry codes (NAICS), license number and credentials appear when the country is United States.</p>
            )}
          </div>
        </details>

        {/* For your team: notes that are never searched for */}
        <details className="lf-more">
          <summary>
            <span className="lf-more-title">For your team</span>
            <span className="lf-more-meta">optional{teamFilled ? ` · ${teamFilled} filled` : ""}</span>
            <ChevronDown size={16} className="lf-section-chevron" aria-hidden="true" />
          </summary>
          <div className="lf-more-body">
            <PickOne<Priority>
              id="lf-add-priority"
              label="Priority"
              value={form.priority}
              onChange={(v) => set("priority", v)}
              options={[{ value: "", label: "None" }, { value: "high", label: "High" }, { value: "medium", label: "Medium" }, { value: "low", label: "Low" }]}
            />
            <ChipInput id="lf-add-tags" label="Tags" values={form.tags} onChange={(v) => set("tags", v)} placeholder="e.g. Texas, Trade show 2026" />
            <div className="lf-form-grid">
              <label className="field">
                <span className="field-label">Where you found them</span>
                <Combobox value={form.foundVia} onChange={(v) => set("foundVia", v)} options={FOUND_VIA} placeholder="e.g. LinkedIn" />
              </label>
            </div>
            <label className="field">
              <span className="field-label">Notes</span>
              <textarea className="input textarea lf-notes" rows={3} value={form.notes} onChange={text("notes")} placeholder="Anything your team should know" />
            </label>
          </div>
        </details>

        <div className="lf-form-actions">
          <button type="submit" className="btn btn-primary" disabled={searching}>
            <Search size={15} aria-hidden="true" /> {searchMode ? (searching ? "Searching…" : "Search companies") : "Find details"}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={reset}>Clear form</button>
          {tried && invalid && <span className="lf-error">Fill in the fields marked *.</span>}
        </div>
      </form>

      {(searching || searchError || found) && (
        <section ref={hitsRef} className="card card-flush lf-hits" aria-live="polite" aria-busy={searching}>
          {searchError && (
            <div className="alert alert-danger" role="alert" style={{ margin: "1rem" }}>
              <Info size={18} />
              <div>{searchError}</div>
            </div>
          )}
          {searching ? (
            <div className="empty"><div className="loader" /><p>Searching companies…</p></div>
          ) : found && found.results.length === 0 ? (
            <div className="empty">
              <div className="empty-icon"><SearchX size={24} /></div>
              <h3>No new companies</h3>
              <p>
                {found.total
                  ? "Everything found is already in your list."
                  : `Nothing matched in ${where || "that place"}. Check that the city is really in that state, then try a bigger city, another size, or leave the city and size empty.`}
              </p>
            </div>
          ) : found ? (
            <>
              <div className="lf-hits-head">
                <label className="lf-check">
                  <input type="checkbox" checked={allPicked} disabled={!selectable.length} onChange={() => setPicked(allPicked ? [] : selectable.map((r) => r.domain))} />
                  <span><strong>{found.results.length}</strong> shown{found.total > found.results.length ? ` of ${found.total.toLocaleString()} found` : ""}</span>
                </label>
                <button type="button" className="btn btn-primary btn-sm" disabled={!picked.length}
                  onClick={() => {
                    onAddFound(found.results.filter((r) => picked.includes(r.domain)), found.filters, found.searchId);
                    setFound(null);
                    setPicked([]);
                  }}>
                  <UserSearch size={14} aria-hidden="true" /> {picked.length ? `Look into ${picked.length}` : "Pick companies first"}
                </button>
              </div>
              <ul className="lf-hit-list">
                {found.results.map((r) => (
                  <li key={r.domain} className={`lf-hit${picked.includes(r.domain) ? " is-picked" : ""}${r.in_list ? " is-muted" : ""}`}>
                    <input type="checkbox" aria-label={`Pick ${r.name}`} checked={picked.includes(r.domain)} disabled={r.in_list} onChange={() => toggle(r.domain)} />
                    <div className="lf-hit-main">
                      <div className="lf-hit-name">
                        <strong>{r.name}</strong>
                        {r.in_list && <span className="pill no-dot tone-neutral">Already in your list</span>}
                      </div>
                      <span className="lf-hit-sub"><a href={`https://${r.domain}`} target="_blank" rel="noopener noreferrer">{r.domain}</a>{where ? ` · ${where}` : ""}</span>
                    </div>
                    <div className="lf-hit-meta"><span>{r.emails.toLocaleString()} email{r.emails === 1 ? "" : "s"} known to Hunter</span></div>
                  </li>
                ))}
              </ul>
              <p className="lf-hits-note"><Info size={14} aria-hidden="true" /> Searching is free. Each company you look into then uses 1–4 Hunter credits. Hunter lists the biggest companies first: pick a small size to find smaller ones.</p>
            </>
          ) : null}
        </section>
      )}
      </div>

      <aside className="lf-add-side">
        <div className="card">
          <h3 className="card-title"><FileUp size={17} aria-hidden="true" /> Have a list?</h3>
          <p className="card-sub">
            Upload a CSV with <code>name</code>, <code>country</code> and <code>city</code>. You can also add <code>state</code>, <code>website</code>,{" "}
            <code>company_type</code>, <code>trades</code> (split with ;) and <code>size</code>.
          </p>
          <div className="lf-side-actions">
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="sr-only" id="lf-csv" onChange={(e) => readFile(e.target.files?.[0])} />
            <label htmlFor="lf-csv" className="btn btn-secondary btn-sm"><FileUp size={14} aria-hidden="true" /> Upload CSV</label>
            <a className="link-btn lf-inline" href={`data:text/csv;charset=utf-8,${encodeURIComponent(SAMPLE_CSV)}`} download="lead-finder-sample.csv">
              <Download size={14} aria-hidden="true" /> Sample file
            </a>
          </div>
        </div>
        <div className="card lf-tip">
          <Settings2 size={16} aria-hidden="true" />
          <p>Every company goes through the same 8 steps. Open it in <strong>Results</strong> to watch each one finish.</p>
        </div>
      </aside>
    </div>
  );
}
