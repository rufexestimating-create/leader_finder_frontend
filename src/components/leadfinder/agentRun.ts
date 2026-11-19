import { COMPANY_TYPES } from "@/lib/leadFinder";
import type { AgentRun } from "@/lib/leadFinderApi";

export type Tone = "live" | "ok" | "warn" | "bad" | "idle";

export const STATUS: Record<AgentRun["status"], { label: string; tone: Tone }> = {
  queued: { label: "Queued", tone: "live" },
  running: { label: "Scanning", tone: "live" },
  enriching: { label: "Enriching", tone: "live" },
  sending: { label: "Sending", tone: "live" },
  waiting: { label: "Paused till tomorrow", tone: "warn" },
  done: { label: "Mission complete", tone: "ok" },
  stopped: { label: "Stopped", tone: "idle" },
  failed: { label: "Failed", tone: "bad" },
};

export const MODE_LABEL: Record<AgentRun["mode"], string> = { fast: "Without enrichment", smart: "With enrichment", bulk: "Bulk send" };

export const typeLabel = (id: string) => COMPANY_TYPES.find((t) => t.id === id)?.label ?? id;

/** "theconstructionusa.com" from the directory link */
export function siteOf(url?: string): string {
  try {
    return new URL(/^https?:\/\//i.test(url ?? "") ? url! : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return url ?? "";
  }
}

type Where = { city: string; state?: string; country: string; source?: string; directory_url?: string };
/** Where the run looks: "Houston, Texas, United States", or the directory's site */
export const place = (f: Where) => (f.source === "directory" ? siteOf(f.directory_url) : [f.city, f.state, f.country].filter(Boolean).join(", "));

/** What the run is after, in a few words: "General contractors in Houston, Texas" or "… from theconstructionusa.com" */
export function runName(run: AgentRun): string {
  if (run.mode === "bulk") return `Your list · ${run.filters.recipients?.length ?? run.counts.total ?? 0} addresses`;
  const kind = `${typeLabel(run.filters.company_type)}s`;
  if (run.filters.source === "directory") return `${kind} from ${siteOf(run.filters.directory_url)}`;
  return `${kind} in ${[run.filters.city, run.filters.state].filter(Boolean).join(", ")}`;
}

/** A failed or stopped run can carry on from where it ended */
export const canResume = (run: AgentRun) => run.status === "failed" || run.status === "stopped";

export function statusLabel(run: AgentRun): string {
  if (run.status === "queued" && run.queue_position) {
    return run.queue_position === 1 ? "Queued · starts next" : `Queued · #${run.queue_position} in line`;
  }
  return STATUS[run.status].label;
}

/** How far the whole run is, 0-100: finding 0-15, saving 15-20, reading or enriching 20-80, sending 80-100 */
export function progressOf(run: AgentRun): number {
  if (run.status === "done") return 100;
  const c = run.counts;
  const state = (id: string) => run.steps.find((s) => s.id === id)?.state;
  if (run.mode === "bulk") {
    if (state("send") === "running" || state("send") === "done") return 60 + Math.round(40 * Math.min(1, (c.sent ?? 0) / Math.max(1, c.emails ?? 1)));
    return 2 + Math.round(55 * Math.min(1, (c.checked ?? 0) / Math.max(1, c.total ?? 1)));
  }
  if (state("send") === "running" || state("send") === "done") return 80 + Math.round(20 * Math.min(1, (c.sent ?? 0) / Math.max(1, c.emails ?? 1)));
  if (state("save") === "done") return 20 + Math.round(60 * Math.min(1, (c.read ?? 0) / Math.max(1, c.new ?? 1)));
  if (state("find") === "done") return 18;
  return state("find") === "running" ? 8 : 2;
}
