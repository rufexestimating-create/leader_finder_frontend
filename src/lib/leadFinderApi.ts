/** Lead Finder's calls to the backend (/lead-finder/...), and the translation between its rows and the screens' types. */
import { apiFetch, errorMessage, NETWORK_ERROR } from "@/lib/auth";
import {
  type Company,
  type Contact,
  type EmailStatus,
  type EnrichStep,
  type FinderSettings,
  type Priority,
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
    agentRunId: r.agent_run_id ?? null,
    agentMode: r.agent_mode ?? null,
    addedAt: Date.parse(r.created_at) || 0,
    steps: toSteps(r.steps),
    contacts: (r.contacts ?? []).map(toContact),
    sources: r.sources ?? [],
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
      agentSubject: r.agent_subject ?? "", agentMessage: r.agent_message ?? "", emailsPerDay: r.emails_per_day ?? 30,
    },
    status: { ...DEFAULT_STATUS, ...(r.tool_status ?? {}) },
  };
}

export function toSettingsBody(s: FinderSettings) {
  return {
    roles: s.roles, skip_sites: s.skipSites, templates: s.templates, subject: s.subject, message: s.message,
    daily_limit: s.dailyLimit, at_once: s.atOnce, tools: s.tools,
    agent_subject: s.agentSubject, agent_message: s.agentMessage, emails_per_day: s.emailsPerDay,
  };
}

/* ---------- Agent runs ---------- */

export type AgentStatus = "queued" | "running" | "enriching" | "sending" | "waiting" | "done" | "stopped" | "failed";

export interface AgentRun {
  id: string;
  status: AgentStatus;
  mode: "fast" | "smart" | "bulk";
  filters: { country: string; state: string; city: string; company_type: string; limit: number; mode: string; subject?: string; recipients?: unknown[] };
  steps: { id: string; label: string; state: "pending" | "running" | "done" | "failed"; note: string }[];
  counts: {
    found?: number; new?: number; read?: number; emails?: number; people?: number; sent?: number; skipped?: number; failed?: number;
    /** Bulk send: addresses on the list, checked so far, and removed by the check */
    total?: number; checked?: number; removed?: number;
    /** The website being read right now */
    current?: string | null;
    log?: { t: string; text: string }[];
  };
  error: string | null;
  created_at: string;
  finished_at: string | null;
  companies?: Company[];
}

export const AGENT_ACTIVE: AgentStatus[] = ["queued", "running", "enriching", "sending", "waiting"];

export function toAgentRun(r: Row): AgentRun {
  return { ...(r as AgentRun), companies: r.companies ? (r.companies as Row[]).map(toCompany) : undefined };
}
