import { COMPANY_STATUS, EMAIL_STATUS, type Company, describeType } from "@/lib/leadFinder";

const HEADERS = [
  "Company", "Website", "Phone", "Address", "City", "State", "Country", "Company type", "Google rating", "Reviews", "Status",
  "Person", "Job title", "Email", "Email status", "Email found by", "LinkedIn", "Emailed on",
  "Enrichment", "Tools used", "Found by", "Added on",
];

/** Whether the result came with or without the paid enrichment tools, and which tools did the work */
function howFound(c: Company): [string, string, string] {
  if (c.agentMode === "fast") return ["Without enrichment", "Google Maps, company website (no API key)", "ReachAgent"];
  if (c.agentMode === "smart") return ["With enrichment", "Google Maps, Hunter, Reoon, AI", "ReachAgent"];
  if (c.agentMode === "bulk") return ["Bulk send", "Your own list, checked before sending", "ReachAgent bulk send"];
  // Added before the agent: always went through the enrichment pipeline
  return ["With enrichment", "Hunter, Serper, Reoon, AI", c.source === "csv" ? "File upload" : c.source === "manual" ? "Added by hand" : "Find companies"];
}

/** A spreadsheet cell: quoted, and a leading = + - @ is neutralised so Excel never runs it as a formula */
function cell(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

const day = (t: number | string | null) => (t ? new Date(t).toISOString().slice(0, 10) : "");

/** One row per person found; a company with nobody found still gets one row */
export function companiesToCsv(companies: Company[]): string {
  const rows: unknown[][] = [];
  for (const c of companies) {
    const base = [
      c.name, c.domain, c.phone, c.address, c.city, c.state, c.country, describeType(c.companyType, c.trades), c.rating ?? "", c.reviews ?? "",
      COMPANY_STATUS[c.status]?.label ?? c.status,
    ];
    const tail = [...howFound(c), day(c.addedAt)];
    if (!c.contacts.length) rows.push([...base, "", "", "", "", "", "", "", ...tail]);
    for (const p of c.contacts) {
      rows.push([...base, p.title === "Company email" ? "" : p.name, p.title === "Company email" ? "" : p.title, p.email,
        EMAIL_STATUS[p.emailStatus]?.label ?? p.emailStatus, p.emailSource, p.linkedin, day(p.sentAt), ...tail]);
    }
  }
  // The BOM makes Excel read names with accents (Rañon) correctly
  return "﻿" + [HEADERS, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
}

export function downloadCsv(companies: Company[], name = `reachagent-leads-${new Date().toISOString().slice(0, 10)}`) {
  const url = URL.createObjectURL(new Blob([companiesToCsv(companies)], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name.replace(/[^a-z0-9-]+/gi, "-").toLowerCase()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
