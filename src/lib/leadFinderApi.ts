/** Lead Finder's calls to the backend (/lead-finder/...), and the translation between its rows and the screens' types. */
import { apiFetch, errorMessage, NETWORK_ERROR } from "@/lib/auth";
import {
  type Company,
  type CompanyInput,
  type Contact,
  type EmailStatus,
  type EnrichStep,
  type FinderSettings,
  EMPTY_INPUT,
  type Priority,
  type SearchFilters,
  STEPS,
  type ToolId,
  typeLabel,
} from "@/lib/leadFinder";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface ToolStatus {
  connected: boolean;
  on: boolean;
}

export async function call<T>(path: string, init?: RequestInit): Promise<{ data: T | null; error: string | null }> {
  try {
    const res = await apiFetch(`/lead-finder${path}`, init);
    if (res.status === 204) return { data: null, error: null };
    const body = await res.json().catch(() => null);
    if (!res.ok) return { data: null, error: errorMessage(body, "Something went wrong. Please try again.") };
    return { data: body as T, error: null };
  } catch {
    return { data: null, error: NETWORK_ERROR };
  }
}

const send = (method: string, body?: unknown): RequestInit => ({ method, body: body === undefined ? undefined : JSON.stringify(body) });
export { send };

/* ---------- Rows -> screens ---------- */

function toContact(r: Row): Contact {
  return {
    id: r.id,
    name: r.name,
    title: r.title ?? "",
    email: r.email ?? null,
    emailStatus: (r.email_status ?? "unknown") as EmailStatus,
    emailSource: r.email_source ?? "—",
    linkedin: r.linkedin ?? null,
    personalLine: r.personal_line ?? "",
    selected: !!r.selected,
    sentAt: r.sent_at ?? null,
    sendError: r.send_error ?? null,
  };
}

/** The mailbox emails are sent from; never includes the password */
export interface Mailbox {
  connected: boolean;
  email?: string;
  from_name?: string;
  smtp_host?: string;
  smtp_port?: number;
  imap_host?: string;
  imap_port?: number;
  /** On: every email goes to this mailbox itself instead of the real person */
  test_mode?: boolean;
}

/** Always 8 steps, even for a company that was just added */
function toSteps(raw: Row[] | null): EnrichStep[] {
  const byId = new Map((raw ?? []).map((s) => [s.id, s]));
  return STEPS.map((s) => ({ id: s.id, state: byId.get(s.id)?.state ?? "pending", note: byId.get(s.id)?.note ?? undefined }));
}

export function toCompany(r: Row): Company {
  return {
    id: r.id,
    name: r.name,
    domain: r.domain ?? null,
    country: r.country,
    state: r.state ?? "",
    city: r.city,
    companyType: r.company_type ?? "",
    trades: r.trades ?? [],
    industry: typeLabel(r.company_type ?? ""),
    sectors: r.sectors ?? [],
    projectTypes: r.project_types ?? [],
    size: r.size ?? "",
    revenue: r.revenue ?? "",
    projectSize: r.project_size ?? "",
    serviceArea: r.service_area ?? "",
    naics: r.naics ?? [],
    licenseNumber: r.license_number ?? "",
    credentials: r.credentials ?? [],
    technologies: r.technologies ?? [],
    contactRoles: r.contact_roles ?? [],
    team: { priority: (r.priority ?? "") as Priority, tags: r.tags ?? [], foundVia: r.found_via ?? "", notes: r.notes ?? "" },
    foundedYear: r.founded_year ?? null,
    rating: r.rating === null || r.rating === undefined ? null : Number(r.rating),
    reviews: r.reviews ?? null,
    phone: r.phone ?? null,
    address: r.address ?? null,
    socials: r.socials ?? [],
    status: r.status,
    error: r.error ?? null,
    source: r.source,
    addedAt: Date.parse(r.created_at) || 0,
    steps: toSteps(r.steps),
    contacts: (r.contacts ?? []).map(toContact),
    sources: r.sources ?? [],
  };
}

/* ---------- Screens -> API ---------- */

export function toCompanyBody(c: CompanyInput) {
  const year = /^\d{4}$/.test(c.foundedYear.trim()) ? Number(c.foundedYear) : null;
  return {
    name: c.name, website: c.website, country: c.country, state: c.state, city: c.city, size: c.size, company_type: c.companyType,
    trades: c.trades, contact_roles: c.contactRoles, sectors: c.sectors, project_types: c.projectTypes, revenue: c.revenue,
    project_size: c.projectSize, founded_year: year, service_area: c.serviceArea, software: c.software, naics: c.naics,
    license_number: c.licenseNumber, credentials: c.credentials, priority: c.priority, tags: c.tags, found_via: c.foundVia, notes: c.notes,
  };
}

/* ---------- Find companies ---------- */

/** A company Hunter found: only its name and website are known, so the place and type come from your filters */
export interface FoundCompany {
  name: string;
  domain: string;
  emails: number;
  in_list: boolean;
}

/** Each company found is saved with what you searched for: the place, and the company type or size when you picked one */
export function foundToInput(f: SearchFilters, c: FoundCompany): CompanyInput {
  const one = <T,>(xs: T[]) => (xs.length === 1 ? xs[0] : undefined);
  const type = one(f.companyTypes);
  return {
    ...EMPTY_INPUT,
    name: c.name,
    website: c.domain,
    country: f.countries[0] ?? "",
    state: one(f.states) ?? "",
    city: one(f.cities) ?? one(f.states) ?? f.countries[0] ?? "",
    companyType: (type as CompanyInput["companyType"]) ?? "",
    trades: type === "sub" ? f.trades : [],
    size: one(f.sizes) ?? "",
  };
}

export function toSearchBody(f: SearchFilters) {
  return {
    countries: f.countries, states: f.states, cities: f.cities, company_types: f.companyTypes, trades: f.trades, sizes: f.sizes,
    ownership: f.ownership, keywords: f.keywords, keyword_match: f.keywordMatch, exclude_in_list: f.excludeInList,
    exclude_domains: f.excludeDomains, limit: f.limit,
  };
}

/* ---------- Settings ---------- */

const DEFAULT_STATUS: Record<ToolId, ToolStatus> = {
  hunter: { connected: false, on: true }, serper: { connected: false, on: true },
  verifier: { connected: false, on: true }, places: { connected: false, on: true },
  ai: { connected: false, on: true }, apollo: { connected: false, on: true },
  gplaces: { connected: false, on: true }, openai: { connected: false, on: true },
  pdl: { connected: false, on: true },
};

export function toSettings(r: Row): { settings: FinderSettings; status: Record<ToolId, ToolStatus> } {
  return {
    settings: {
      roles: r.roles, skipSites: r.skip_sites, templates: r.templates, subject: r.subject ?? "", message: r.message ?? "",
      dailyLimit: r.daily_limit, atOnce: r.at_once, tools: r.tools,
    },
    status: { ...DEFAULT_STATUS, ...(r.tool_status ?? {}) },
  };
}

export function toSettingsBody(s: FinderSettings) {
  return {
    roles: s.roles, skip_sites: s.skipSites, templates: s.templates, subject: s.subject, message: s.message,
    daily_limit: s.dailyLimit, at_once: s.atOnce, tools: s.tools,
  };
}
