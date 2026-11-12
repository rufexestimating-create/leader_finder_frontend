/**
 * Lead Finder: types, labels, sample data and a small simulator.
 *
 * PREVIEW ONLY. Nothing here calls a server: the companies, people and emails are made up, and every link points at a
 * ".example" address (a name reserved for examples, so it never reaches a real site or person). "Finding details" is
 * a timer that walks through the same steps the real enrichment engine will run. When the backend is built, the
 * simulator is replaced by API calls and the screens stay as they are.
 */

export type CompanyStatus = "queued" | "enriching" | "ready" | "approved" | "failed";
export type EmailStatus = "valid" | "catch_all" | "invalid" | "unknown" | "none";
export type StepState = "pending" | "running" | "done" | "failed";
export type CompanySource = "manual" | "search" | "csv";
export type Priority = "" | "high" | "medium" | "low";

/** The steps the enrichment engine runs for every company, in order */
export const STEPS = [
  { id: "website", label: "Find the website", tool: "Hunter, then Google search" },
  { id: "cache", label: "Check if we already have it", tool: "Your saved companies" },
  { id: "read", label: "Read the website", tool: "Home, about, team and contact pages" },
  { id: "extract", label: "Pick out emails, phone and links", tool: "Pattern matching" },
  { id: "people", label: "Find the decision makers", tool: "Hunter and the team page" },
  { id: "emails", label: "Find their emails", tool: "Hunter email finder" },
  { id: "verify", label: "Verify the emails", tool: "Reoon" },
  { id: "line", label: "Write the personal line", tool: "AI writer, else your templates" },
] as const;
export type StepId = (typeof STEPS)[number]["id"];

export interface EnrichStep {
  id: StepId;
  state: StepState;
  note?: string;
}

export interface Contact {
  id: string;
  name: string;
  title: string;
  email: string | null;
  emailStatus: EmailStatus;
  /** Where the email came from: "Hunter", "Website", "Guessed from the company's email pattern" */
  emailSource: string;
  linkedin: string | null;
  personalLine: string;
  selected: boolean;
  /** When the email went out from the user's mailbox; null = not sent */
  sentAt: string | null;
  /** Why the last send failed, if it did */
  sendError: string | null;
}

export interface SourceLink {
  label: string;
  url: string;
  /** Set for what was found there: a sentence from the website or a news headline */
  text?: string;
  when?: string | null;
}

/* ---------- What kind of company ---------- */

export type CompanyTypeId =
  | "gc"
  | "sub"
  | "design_build"
  | "cm"
  | "developer"
  | "home_builder"
  | "remodeler"
  | "architect"
  | "engineer"
  | "interior"
  | "supplier"
  | "other";

export interface CompanyType {
  id: CompanyTypeId;
  label: string;
  hint: string;
  /** US industry codes for this kind of company */
  naics: string[];
  /** Job titles worth emailing at this kind of company, best first */
  roles: string[];
}

export const COMPANY_TYPES: CompanyType[] = [
  { id: "gc", label: "General contractor", hint: "Runs the whole job and hires the trades", naics: ["236"], roles: ["Owner", "President", "Estimator", "Preconstruction Manager", "Project Manager"] },
  { id: "sub", label: "Subcontractor", hint: "Does one trade, like electrical or roofing", naics: ["238"], roles: ["Owner", "Estimator", "Operations Manager"] },
  { id: "design_build", label: "Design-build firm", hint: "Designs and builds under one contract", naics: ["236"], roles: ["Owner", "President", "Preconstruction Manager", "Design Director"] },
  { id: "cm", label: "Construction manager", hint: "Manages projects for the owner", naics: ["236"], roles: ["President", "Preconstruction Manager", "Project Executive"] },
  { id: "developer", label: "Developer", hint: "Buys land and gets buildings built", naics: [], roles: ["Owner", "Development Manager", "Director of Development"] },
  { id: "home_builder", label: "Home builder", hint: "Builds new houses", naics: ["236115", "236117"], roles: ["Owner", "Sales Manager", "Construction Manager"] },
  { id: "remodeler", label: "Remodeler", hint: "Renovations, kitchens, additions", naics: ["236118"], roles: ["Owner", "Sales Manager", "Project Manager"] },
  { id: "architect", label: "Architect", hint: "Designs buildings", naics: ["541310"], roles: ["Principal", "Partner", "Project Architect"] },
  { id: "engineer", label: "Engineer", hint: "Structural, civil or MEP", naics: ["541330"], roles: ["Principal", "Partner", "Project Engineer"] },
  { id: "interior", label: "Interior designer", hint: "Interiors and fit-outs", naics: ["541410"], roles: ["Principal", "Founder", "Senior Designer"] },
  { id: "supplier", label: "Supplier / manufacturer", hint: "Sells materials or products", naics: [], roles: ["Owner", "Sales Manager", "Business Development"] },
  { id: "other", label: "Other", hint: "Something else", naics: [], roles: [] },
];
const TYPE_BY_ID = Object.fromEntries(COMPANY_TYPES.map((t) => [t.id, t])) as Record<CompanyTypeId, CompanyType>;
export const isTypeId = (v: string): v is CompanyTypeId => v in TYPE_BY_ID;
export const typeLabel = (id: string) => (isTypeId(id) ? TYPE_BY_ID[id].label : "");

/** What a subcontractor does. Each trade has its own US industry code. */
export const TRADES: { id: string; label: string; naics: string }[] = [
  { id: "electrical", label: "Electrical", naics: "238210" },
  { id: "plumbing", label: "Plumbing", naics: "238220" },
  { id: "hvac", label: "HVAC", naics: "238220" },
  { id: "concrete", label: "Concrete", naics: "238110" },
  { id: "framing", label: "Framing", naics: "238130" },
  { id: "masonry", label: "Masonry", naics: "238140" },
  { id: "steel", label: "Steel / metal", naics: "238120" },
  { id: "glazing", label: "Glass & windows", naics: "238150" },
  { id: "roofing", label: "Roofing", naics: "238160" },
  { id: "drywall", label: "Drywall & insulation", naics: "238310" },
  { id: "painting", label: "Painting", naics: "238320" },
  { id: "flooring", label: "Flooring", naics: "238330" },
  { id: "tile", label: "Tile & stone", naics: "238340" },
  { id: "carpentry", label: "Finish carpentry", naics: "238350" },
  { id: "sitework", label: "Excavation & demolition", naics: "238910" },
  { id: "fire", label: "Fire protection", naics: "238220" },
  { id: "solar", label: "Solar", naics: "238210" },
  { id: "landscaping", label: "Landscaping", naics: "561730" },
];
const TRADE_LABEL = Object.fromEntries(TRADES.map((t) => [t.id, t.label])) as Record<string, string>;
export const tradeLabel = (id: string) => TRADE_LABEL[id] ?? id;
/** "Subcontractor · Electrical, Solar" */
export const describeType = (type: string, trades: string[]) =>
  [typeLabel(type), trades.length ? trades.map(tradeLabel).join(", ") : ""].filter(Boolean).join(" · ");

/** The US industry codes (NAICS) used most in construction and design */
export const NAICS: Record<string, string> = {
  "236": "Building construction (general contractors, builders)",
  "236115": "New single-family homes",
  "236117": "Home builders (for sale)",
  "236118": "Residential remodelers",
  "236220": "Commercial building construction",
  "237": "Heavy and civil construction",
  "238": "Specialty trades (subcontractors)",
  "238110": "Concrete",
  "238120": "Structural steel",
  "238130": "Framing",
  "238140": "Masonry",
  "238150": "Glass and glazing",
  "238160": "Roofing",
  "238210": "Electrical",
  "238220": "Plumbing, HVAC, fire sprinklers",
  "238310": "Drywall and insulation",
  "238320": "Painting",
  "238330": "Flooring",
  "238340": "Tile and stone",
  "238350": "Finish carpentry",
  "238910": "Site preparation, demolition",
  "541310": "Architects",
  "541330": "Engineers",
  "541410": "Interior designers",
  "561730": "Landscaping",
};
export const naicsLabel = (code: string) => (NAICS[code] ? `${code} · ${NAICS[code]}` : code);
export const COMMON_NAICS = ["236", "236220", "237", "238", "541310", "541330"];

/** NAICS codes that match a company type and its trades */
export function naicsFor(type: string, trades: string[]): string[] {
  const fromTrades = trades.map((id) => TRADES.find((t) => t.id === id)?.naics).filter((c): c is string => !!c);
  // A subcontractor with trades picked is described by the trades' own codes, not the broad "238"
  const fromType = type === "sub" && fromTrades.length ? [] : isTypeId(type) ? TYPE_BY_ID[type].naics : [];
  return [...new Set([...fromType, ...fromTrades])];
}

export const SECTORS = ["Residential", "Commercial", "Industrial", "Institutional", "Hospitality", "Healthcare", "Retail", "Multi-family", "Infrastructure"];
export const PROJECT_TYPES = ["New build", "Renovation / remodel", "Tenant fit-out", "Additions / extensions", "Custom homes", "Restoration"];
/** Employees. Hunter searches 51-200 and 501-1000 as single ranges, so the backend maps 51-100/101-200 onto them. */
export const SIZES = ["1-10", "11-50", "51-100", "101-200", "201-500", "501-1000", "1000+"];
/** "51-100" -> "51–100 people", "1000+" -> "1,000+ people" */
export const sizeLabel = (s: string) => (s === "1000+" ? "1,000+ people" : s === "501-1000" ? "501–1,000 people" : `${s.replace("-", "–")} people`);
export const REVENUES = ["Under $1M", "$1M–$5M", "$5M–$20M", "$20M–$100M", "$100M+"];
export const PROJECT_SIZES = ["Under $100k", "$100k–$1M", "$1M–$10M", "$10M+"];
export const CREDENTIALS = ["Licensed", "Bonded", "Insured", "Union", "Non-union", "LEED certified", "Minority-owned", "Women-owned", "Veteran-owned"];
export const SOFTWARE_SUGGESTIONS = ["Procore", "Buildertrend", "Autodesk Revit", "AutoCAD", "Bluebeam", "SketchUp", "WordPress", "HubSpot"];
export const KEYWORD_SUGGESTIONS = ["residential", "commercial", "luxury", "hospitality", "3d visualization", "tenant improvement"];
export const FOUND_VIA = ["Google search", "LinkedIn", "Referral", "Trade show", "Directory", "Their website", "Existing client"];
export const PRIORITY_LABEL: Record<Exclude<Priority, "">, string> = { high: "High", medium: "Medium", low: "Low" };
export const COUNTRIES = ["United States", "Canada", "United Kingdom", "United Arab Emirates", "Saudi Arabia"];
export const US_STATES = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware", "District of Columbia", "Florida",
  "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts",
  "Michigan", "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey", "New Mexico",
  "New York", "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina",
  "South Dakota", "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming",
];
/** State, NAICS, licence and credentials only apply to US companies, so the form shows them only then */
export const isUS = (country: string) => ["united states", "united states of america", "usa", "us", "u.s.", "u.s.a."].includes(country.trim().toLowerCase());

/* ---------- A company ---------- */

/** What you type in the form (or a CSV row, or a search result) */
export interface CompanyInput {
  name: string;
  website: string;
  country: string;
  state: string;
  city: string;
  companyType: CompanyTypeId | "";
  trades: string[];
  sectors: string[];
  projectTypes: string[];
  size: string;
  revenue: string;
  projectSize: string;
  foundedYear: string;
  serviceArea: string;
  naics: string[];
  licenseNumber: string;
  credentials: string[];
  software: string[];
  contactRoles: string[];
  priority: Priority;
  tags: string[];
  foundVia: string;
  notes: string;
}

export const EMPTY_INPUT: CompanyInput = {
  name: "", website: "", country: "", state: "", city: "", companyType: "", trades: [], sectors: [], projectTypes: [],
  size: "", revenue: "", projectSize: "", foundedYear: "", serviceArea: "", naics: [], licenseNumber: "", credentials: [],
  software: [], contactRoles: [], priority: "", tags: [], foundVia: "", notes: "",
};

/** What enrichment found, revealed step by step while a company is being enriched (simulator only) */
interface Draft {
  failAtWebsite: boolean;
  domain: string;
  foundedYear: number | null;
  rating: number | null;
  reviews: number | null;
  phone: string | null;
  address: string | null;
  socials: SourceLink[];
  pagesRead: string[];
  contacts: Contact[];
  sources: SourceLink[];
  lineTemplate: number | null;
}

export interface Company {
  id: string;
  name: string;
  domain: string | null;
  country: string;
  state: string;
  city: string;
  companyType: CompanyTypeId | "";
  trades: string[];
  /** The company type in words, used by personal lines ({{industry}}) */
  industry: string;
  sectors: string[];
  projectTypes: string[];
  size: string;
  revenue: string;
  projectSize: string;
  serviceArea: string;
  naics: string[];
  licenseNumber: string;
  credentials: string[];
  /** Software they use and what their website is built with */
  technologies: string[];
  /** Job titles to look for here; empty means the Settings list for this company type */
  contactRoles: string[];
  team: { priority: Priority; tags: string[]; foundVia: string; notes: string };
  foundedYear: number | null;
  rating: number | null;
  reviews: number | null;
  phone: string | null;
  address: string | null;
  socials: SourceLink[];
  status: CompanyStatus;
  /** Why it couldn't finish, in plain words */
  error: string | null;
  source: CompanySource;
  addedAt: number;
  steps: EnrichStep[];
  contacts: Contact[];
  sources: SourceLink[];
  draft?: Draft;
}

export const COMPANY_STATUS: Record<CompanyStatus, { label: string; tone: string }> = {
  queued: { label: "Waiting", tone: "neutral" },
  enriching: { label: "Finding details", tone: "info" },
  ready: { label: "Ready to review", tone: "success" },
  approved: { label: "Emailed", tone: "violet" },
  failed: { label: "Couldn't finish", tone: "danger" },
};

export const EMAIL_STATUS: Record<EmailStatus, { label: string; tone: string; hint: string }> = {
  valid: { label: "Verified", tone: "success", hint: "The mailbox exists. Safe to email." },
  catch_all: {
    label: "Risky",
    tone: "warning",
    hint: "This company accepts mail to any address, so this one can't be confirmed. Send these later, a few at a time.",
  },
  invalid: { label: "Invalid", tone: "danger", hint: "This address doesn't exist. It is never emailed." },
  unknown: { label: "Not confirmed", tone: "neutral", hint: "We could not confirm this address exists, so it is not used. Turn Reoon on to check it properly." },
  none: { label: "No email found", tone: "neutral", hint: "We found the person but not their email." },
};

export const SOURCE_LABEL: Record<CompanySource, string> = { manual: "Added by hand", search: "Find companies", csv: "CSV upload" };

/* ---------- Settings ---------- */

export type ToolId = "hunter" | "serper" | "verifier" | "places" | "ai" | "apollo" | "gplaces" | "openai" | "pdl";
/* The services behind each tool, and where users add their own keys, are in components/leadfinder/ToolKeys.tsx */

export interface LineTemplate {
  id: string;
  text: string;
  enabled: boolean;
}

export interface FinderSettings {
  /** Job titles to look for, per company type; "default" is used for any other company */
  roles: Record<string, string[]>;
  skipSites: string[];
  templates: LineTemplate[];
  subject: string;
  message: string;
  dailyLimit: number;
  atOnce: number;
  tools: Record<ToolId, boolean>;
}

export const TEMPLATE_VARIABLES = ["company", "city", "industry", "founded_year", "rating", "reviews"] as const;

export const DEFAULT_ROLES: Record<string, string[]> = {
  default: ["Owner", "Founder", "CEO", "Managing Director", "Principal"],
  ...Object.fromEntries(COMPANY_TYPES.filter((t) => t.roles.length).map((t) => [t.id, t.roles])),
};

export const DEFAULT_SETTINGS: FinderSettings = {
  roles: DEFAULT_ROLES,
  skipSites: ["linkedin.com", "facebook.com", "instagram.com", "yelp.com", "yellowpages.com", "houzz.com", "angi.com", "zameen.com"],
  templates: [
    { id: "t1", text: "Saw {{company}}'s {{rating}}★ rating from {{reviews}} reviews on Google. That's a lot of happy clients.", enabled: true },
    { id: "t2", text: "Noticed {{company}} has been working in {{city}} since {{founded_year}}.", enabled: true },
    { id: "t3", text: "I've been talking to a few {{industry}} firms in {{city}} lately.", enabled: true },
    // Your own opening line, used when nothing more personal was found
    { id: "g1", text: "I have noticed that you do a lot of projects.", enabled: true },
  ],
  // Your generic message. {{personal_line}} replaces its opening sentence with one written for each company.
  subject: "Drafting support for {{company}}",
  message:
    "Hi {{first_name}},\n\n{{personal_line}}\n\nIf your team could use extra drafting capacity, we can assist with revisions, updated plans, and city comment responses, " +
    "helping accelerate approvals while reducing the burden on your internal staff. We specialize in permit-ready plans, drafting, and permit support " +
    "with a proven track record of helping projects move smoothly from submission to approval.\n\nGary | Design Head\nCADTRI | (737) 237-2736",
  dailyLimit: 50,
  atOnce: 2,
  tools: { hunter: true, serper: true, verifier: true, places: true, ai: true, apollo: true, gplaces: true, openai: true, pdl: true },
};

/** Who to look for at a company of this type, from Settings */
export function rolesFor(settings: FinderSettings, type: string): string[] {
  const own = type ? settings.roles[type] : undefined;
  return own?.length ? own : settings.roles.default?.length ? settings.roles.default : DEFAULT_ROLES.default;
}

type Facts = Pick<Company, "name" | "city" | "industry" | "foundedYear" | "rating" | "reviews">;

/** Fills {{company}}, {{city}}… from what was found; null when a variable has no value, so the template is skipped */
export function fillTemplate(text: string, c: Facts): string | null {
  const values: Record<string, string | null> = {
    company: c.name,
    city: c.city || null,
    industry: c.industry ? c.industry.toLowerCase() : null,
    founded_year: c.foundedYear ? String(c.foundedYear) : null,
    rating: c.rating ? c.rating.toFixed(1) : null,
    reviews: c.reviews ? String(c.reviews) : null,
  };
  let missing = false;
  const out = text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => {
    const v = values[key];
    if (v === undefined || v === null) missing = true;
    return v ?? "";
  });
  // "Saffron Line Architects's" -> "Saffron Line Architects'"
  return missing ? null : out.replace(/(\w)s's\b/g, "$1s'");
}

/** The first switched-on template whose details were all found, so a line never says something we don't know */
export function pickLine(c: Facts, templates: LineTemplate[]): { line: string; template: number } | null {
  for (let i = 0; i < templates.length; i++) {
    if (!templates[i].enabled) continue;
    const line = fillTemplate(templates[i].text, c);
    if (line) return { line, template: i + 1 };
  }
  return null;
}

/** The email as this person will get it */
export function renderEmail(settings: FinderSettings, company: Company, contact: Contact) {
  const first = contact.name.split(" ")[0];
  const fill = (s: string) =>
    s
      .replace(/\{\{\s*first_name\s*\}\}/g, first)
      .replace(/\{\{\s*company\s*\}\}/g, company.name)
      .replace(/\{\{\s*personal_line\s*\}\}\n*/g, contact.personalLine ? `${contact.personalLine}\n\n` : "");
  return { subject: fill(settings.subject), body: fill(settings.message).trim() };
}

/** "https://www.saffronline.example/" -> "saffronline.example" */
export function cleanDomain(website: string) {
  return website.trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0].toLowerCase();
}

/* ---------- Sample data ---------- */

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 24);

function hash(s: string) {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

const FIRST = ["Ayesha", "Bilal", "Sana", "Faraz", "Hina", "Usman", "Maryam", "Omar", "Daniel", "Megan", "Chris", "Laura", "Kevin", "Rachel"];
const LAST = ["Malik", "Siddiqui", "Qureshi", "Tariq", "Sheikh", "Raza", "Khan", "Brooks", "Ortiz", "Walker", "Hayes", "Morgan"];
const DIAL: Record<string, string> = {
  Pakistan: "+92",
  "United Arab Emirates": "+971",
  "Saudi Arabia": "+966",
  "United Kingdom": "+44",
  "United States": "+1",
  Canada: "+1",
};

const allDone = (notes: Partial<Record<StepId, string>>): EnrichStep[] => STEPS.map((s) => ({ id: s.id, state: "done", note: notes[s.id] }));
const allPending = (): EnrichStep[] => STEPS.map((s) => ({ id: s.id, state: "pending" }));
const social = (label: string, name: string): SourceLink => ({ label, url: `https://${label.toLowerCase()}.example/${slug(name)}` });

function person(id: string, name: string, title: string, email: string | null, emailStatus: EmailStatus, emailSource: string, line: string, selected = true): Contact {
  return {
    id,
    name,
    title,
    email,
    emailStatus,
    emailSource,
    linkedin: `https://linkedin.example/in/${slug(name)}`,
    personalLine: line,
    selected: selected && emailStatus === "valid",
    sentAt: null,
    sendError: null,
  };
}

const HOUR = 3600_000;

/** Every field a company can have, empty; sample companies fill in their own */
const BLANK = {
  domain: null,
  state: "",
  companyType: "" as CompanyTypeId | "",
  trades: [] as string[],
  industry: "",
  sectors: [] as string[],
  projectTypes: [] as string[],
  size: "",
  revenue: "",
  projectSize: "",
  serviceArea: "",
  naics: [] as string[],
  licenseNumber: "",
  credentials: [] as string[],
  technologies: [] as string[],
  contactRoles: [] as string[],
  team: { priority: "" as Priority, tags: [] as string[], foundVia: "", notes: "" },
  foundedYear: null,
  rating: null,
  reviews: null,
  phone: null,
  address: null,
  socials: [] as SourceLink[],
  error: null,
  contacts: [] as Contact[],
  sources: [] as SourceLink[],
};

/** Companies already in the list when the preview opens: one of each status, from several countries */
export function sampleCompanies(now: number): Company[] {
  return [
    {
      ...BLANK,
      id: "c6",
      name: "Lone Star Builders",
      domain: "lonestarbuilders.example",
      country: "United States",
      state: "Texas",
      city: "Dallas",
      companyType: "gc",
      industry: "General contractor",
      sectors: ["Commercial", "Multi-family"],
      projectTypes: ["New build", "Tenant fit-out"],
      size: "101-200",
      revenue: "$20M–$100M",
      projectSize: "$1M–$10M",
      serviceArea: "Dallas–Fort Worth",
      naics: ["236220"],
      licenseNumber: "TX-000000 (sample)",
      credentials: ["Licensed", "Bonded", "Insured"],
      technologies: ["Procore", "WordPress"],
      team: { priority: "high", tags: ["Texas", "Commercial"], foundVia: "LinkedIn", notes: "Bids a lot of tenant fit-outs. Good fit for renderings." },
      foundedYear: 2004,
      rating: 4.7,
      reviews: 88,
      phone: "+1 214 000 0000",
      address: "Dallas, Texas",
      socials: [social("LinkedIn", "Lone Star Builders")],
      status: "ready",
      source: "search",
      addedAt: now - 4 * HOUR,
      steps: allDone({
        website: "Found lonestarbuilders.example (Hunter)",
        cache: "New company, nothing saved before",
        read: "Read 4 pages: home, about, team, contact",
        extract: "1 email, 1 phone, 1 social link, “since 2004”",
        people: "3 people match your roles for a general contractor",
        emails: "3 of 3 emails found",
        verify: "2 verified, 1 risky",
        line: "Used template 1",
      }),
      contacts: [
        person("p9", "Daniel Brooks", "President", "daniel@lonestarbuilders.example", "valid", "Hunter",
          "Saw Lone Star Builders' 4.7★ rating from 88 reviews on Google. That's a lot of happy clients."),
        person("p10", "Megan Ortiz", "Senior Estimator", "megan.ortiz@lonestarbuilders.example", "valid", "Website",
          "Saw Lone Star Builders' 4.7★ rating from 88 reviews on Google. That's a lot of happy clients."),
        person("p11", "Chris Walker", "Preconstruction Manager", "chris.walker@lonestarbuilders.example", "catch_all", "Guessed from the company's email pattern",
          "Saw Lone Star Builders' 4.7★ rating from 88 reviews on Google. That's a lot of happy clients."),
      ],
      sources: [
        { label: "Website: Team page", url: "https://lonestarbuilders.example/team" },
        { label: "Hunter: domain search", url: "https://hunter.example/lonestarbuilders.example" },
        { label: "Google: reviews", url: "https://maps.example/lonestarbuilders" },
      ],
    },
    {
      ...BLANK,
      id: "c1",
      name: "Saffron Line Architects",
      domain: "saffronline.example",
      country: "Pakistan",
      city: "Lahore",
      companyType: "architect",
      industry: "Architect",
      sectors: ["Residential", "Commercial"],
      size: "11-50",
      technologies: ["WordPress", "Autodesk Revit"],
      foundedYear: 2009,
      rating: 4.8,
      reviews: 126,
      phone: "+92 42 0000 1234",
      address: "Gulberg III, Lahore",
      socials: [social("LinkedIn", "Saffron Line Architects"), social("Instagram", "Saffron Line Architects")],
      status: "ready",
      source: "search",
      addedAt: now - 3 * HOUR,
      steps: allDone({
        website: "Found saffronline.example (Hunter)",
        cache: "New company, nothing saved before",
        read: "Read 4 pages: home, about, team, contact",
        extract: "1 email, 1 phone, 2 social links, “since 2009”",
        people: "2 people match your roles for an architect",
        emails: "2 of 2 emails found",
        verify: "1 verified, 1 risky",
        line: "Used template 1",
      }),
      contacts: [
        person("p1", "Ayesha Malik", "Principal", "ayesha@saffronline.example", "valid", "Hunter",
          "Saw Saffron Line Architects' 4.8★ rating from 126 reviews on Google. That's a lot of happy clients."),
        person("p2", "Usman Tariq", "Project Architect", "usman.tariq@saffronline.example", "catch_all", "Guessed from the company's email pattern",
          "Saw Saffron Line Architects' 4.8★ rating from 126 reviews on Google. That's a lot of happy clients."),
      ],
      sources: [
        { label: "Website: Team page", url: "https://saffronline.example/team" },
        { label: "Hunter: domain search", url: "https://hunter.example/saffronline.example" },
        { label: "Google: reviews", url: "https://maps.example/saffronline" },
      ],
    },
    {
      ...BLANK,
      id: "c2",
      name: "Indus Build Co.",
      domain: "indusbuild.example",
      country: "Pakistan",
      city: "Karachi",
      companyType: "gc",
      industry: "General contractor",
      sectors: ["Commercial", "Infrastructure"],
      size: "101-200",
      technologies: ["Wix"],
      foundedYear: 1998,
      phone: "+92 21 0000 5678",
      address: "Shahrah-e-Faisal, Karachi",
      socials: [social("Facebook", "Indus Build Co")],
      status: "ready",
      source: "manual",
      addedAt: now - 2 * HOUR,
      steps: allDone({
        website: "Found indusbuild.example (Hunter)",
        cache: "New company, nothing saved before",
        read: "Read 3 pages: home, about, contact",
        extract: "1 email, 1 phone, 1 social link, “since 1998”",
        people: "2 people match your roles for a general contractor",
        emails: "1 of 2 emails found",
        verify: "1 verified",
        line: "Used template 2. No Google rating was found.",
      }),
      contacts: [
        person("p3", "Faraz Siddiqui", "Owner", "faraz@indusbuild.example", "valid", "Website", "Noticed Indus Build Co. has been working in Karachi since 1998."),
        person("p4", "Hina Qureshi", "Estimator", null, "none", "—", "Noticed Indus Build Co. has been working in Karachi since 1998."),
      ],
      sources: [
        { label: "Website: About page", url: "https://indusbuild.example/about" },
        { label: "Hunter: domain search", url: "https://hunter.example/indusbuild.example" },
      ],
    },
    {
      ...BLANK,
      id: "c3",
      name: "Harbor & Stone Interiors",
      domain: "harborandstone.example",
      country: "United Arab Emirates",
      city: "Dubai",
      companyType: "interior",
      industry: "Interior designer",
      sectors: ["Hospitality", "Residential"],
      size: "11-50",
      technologies: ["Squarespace", "HubSpot"],
      rating: 4.6,
      reviews: 58,
      phone: "+971 4 000 0000",
      address: "Business Bay, Dubai",
      socials: [social("Instagram", "Harbor and Stone")],
      status: "ready",
      source: "search",
      addedAt: now - 90 * 60_000,
      steps: allDone({
        website: "Found harborandstone.example (Google search)",
        cache: "New company, nothing saved before",
        read: "Read 4 pages: home, studio, team, contact",
        extract: "2 emails, 1 phone, 1 social link",
        people: "3 people match your roles for an interior designer",
        emails: "3 of 3 emails found",
        verify: "2 verified, 1 invalid",
        line: "Used template 1",
      }),
      contacts: [
        person("p5", "Sana Raza", "Founder", "sana@harborandstone.example", "valid", "Hunter",
          "Saw Harbor & Stone Interiors' 4.6★ rating from 58 reviews on Google. That's a lot of happy clients."),
        person("p6", "Omar Sheikh", "Senior Designer", "omar@harborandstone.example", "valid", "Website",
          "Saw Harbor & Stone Interiors' 4.6★ rating from 58 reviews on Google. That's a lot of happy clients.", false),
        person("p7", "Maryam Khan", "Principal", "m.khan@harborandstone.example", "invalid", "Guessed from the company's email pattern", ""),
      ],
      sources: [
        { label: "Website: Team page", url: "https://harborandstone.example/team" },
        { label: "Google search result", url: "https://search.example/harbor-and-stone-dubai" },
      ],
    },
    {
      ...BLANK,
      id: "c4",
      name: "Crescent Design Studio",
      domain: "crescentstudio.example",
      country: "United Kingdom",
      city: "London",
      companyType: "architect",
      industry: "Architect",
      sectors: ["Residential"],
      projectTypes: ["Additions / extensions"],
      size: "1-10",
      foundedYear: 2016,
      address: "Shoreditch, London",
      status: "approved",
      source: "manual",
      addedAt: now - 26 * HOUR,
      steps: allDone({
        website: "Found crescentstudio.example (Hunter)",
        cache: "New company, nothing saved before",
        read: "Read 3 pages: home, about, contact",
        extract: "1 email, no phone, “since 2016”",
        people: "1 person matches your roles for an architect",
        emails: "1 of 1 email found",
        verify: "1 verified",
        line: "Used template 2",
      }),
      contacts: [person("p8", "Kevin Hayes", "Principal", "kevin@crescentstudio.example", "valid", "Hunter", "Noticed Crescent Design Studio has been working in London since 2016.")],
      sources: [{ label: "Website: About page", url: "https://crescentstudio.example/about" }],
    },
    {
      ...BLANK,
      id: "c5",
      name: "Ravi Design House",
      country: "Pakistan",
      city: "Lahore",
      companyType: "interior",
      industry: "Interior designer",
      size: "1-10",
      status: "failed",
      error: "We couldn't find a website for this company. Add its website and try again.",
      source: "manual",
      addedAt: now - 40 * 60_000,
      steps: STEPS.map((s, i) => ({
        id: s.id,
        state: i === 0 ? "failed" : "pending",
        note: i === 0 ? "Hunter and Google search found no website that matches the name and city" : undefined,
      })),
    },
    {
      // Starts as soon as the page opens, so you can watch the steps run
      ...BLANK,
      id: "c7",
      name: "Bayou Electric Co.",
      domain: "bayouelectric.example",
      country: "United States",
      state: "Texas",
      city: "Houston",
      companyType: "sub",
      trades: ["electrical", "solar"],
      industry: "Subcontractor",
      sectors: ["Commercial", "Industrial"],
      size: "11-50",
      revenue: "$5M–$20M",
      naics: ["238210"],
      credentials: ["Licensed", "Insured", "Union"],
      status: "queued",
      source: "search",
      addedAt: now - 60_000,
      steps: allPending(),
    },
  ];
}

/* ---------- Find companies (sample results) ---------- */

export interface SearchHit {
  name: string;
  domain: string;
  country: string;
  state: string;
  city: string;
  companyType: CompanyTypeId;
  trades: string[];
  sectors: string[];
  projectTypes: string[];
  size: string;
  revenue: string;
  ownership: "Private" | "Partnership" | "Public";
  founded: number;
  technologies: string[];
  keywords: string[];
  naics: string[];
  credentials: string[];
}

type HitInput = Pick<SearchHit, "name" | "domain" | "country" | "city" | "companyType" | "size" | "founded"> & Partial<SearchHit>;
function hit(h: HitInput): SearchHit {
  const trades = h.trades ?? [];
  return {
    state: "", sectors: [], projectTypes: [], revenue: "", ownership: "Private", technologies: [], keywords: [], credentials: [],
    naics: naicsFor(h.companyType, trades),
    ...h,
    trades,
  };
}

export const SAMPLE_HITS: SearchHit[] = [
  hit({ name: "Lone Star Builders", domain: "lonestarbuilders.example", country: "United States", state: "Texas", city: "Dallas", companyType: "gc", size: "101-200", founded: 2004, sectors: ["Commercial", "Multi-family"], projectTypes: ["New build", "Tenant fit-out"], revenue: "$20M–$100M", technologies: ["Procore"], keywords: ["commercial", "tenant improvement"], naics: ["236220"], credentials: ["Licensed", "Bonded", "Insured"] }),
  hit({ name: "Bayou Electric Co.", domain: "bayouelectric.example", country: "United States", state: "Texas", city: "Houston", companyType: "sub", trades: ["electrical", "solar"], size: "11-50", founded: 2010, sectors: ["Commercial", "Industrial"], revenue: "$5M–$20M", keywords: ["commercial"], credentials: ["Licensed", "Insured", "Union"] }),
  hit({ name: "Prairie Home Remodeling", domain: "prairiehome.example", country: "United States", state: "Texas", city: "Austin", companyType: "remodeler", size: "1-10", founded: 2015, sectors: ["Residential"], projectTypes: ["Renovation / remodel", "Additions / extensions"], revenue: "Under $1M", technologies: ["Buildertrend"], keywords: ["residential", "kitchens"], credentials: ["Licensed", "Insured"] }),
  hit({ name: "Peachtree Roofing", domain: "peachtreeroofing.example", country: "United States", state: "Georgia", city: "Atlanta", companyType: "sub", trades: ["roofing"], size: "11-50", founded: 2012, sectors: ["Residential", "Commercial"], revenue: "$1M–$5M", keywords: ["residential", "commercial"], credentials: ["Licensed", "Insured"] }),
  hit({ name: "Summit Design-Build", domain: "summitdb.example", country: "United States", state: "Colorado", city: "Denver", companyType: "design_build", size: "51-100", founded: 2006, sectors: ["Commercial", "Healthcare"], projectTypes: ["New build"], revenue: "$20M–$100M", technologies: ["Procore", "Autodesk Revit"], keywords: ["healthcare", "3d visualization"], credentials: ["Licensed", "Bonded", "LEED certified"] }),
  hit({ name: "Golden Gate Plumbing & HVAC", domain: "goldengateph.example", country: "United States", state: "California", city: "San Francisco", companyType: "sub", trades: ["plumbing", "hvac"], size: "51-100", founded: 1999, sectors: ["Commercial", "Multi-family"], revenue: "$5M–$20M", keywords: ["commercial"], credentials: ["Licensed", "Union"] }),
  hit({ name: "Keystone Concrete", domain: "keystoneconcrete.example", country: "United States", state: "Arizona", city: "Phoenix", companyType: "sub", trades: ["concrete"], size: "101-200", founded: 2001, sectors: ["Commercial", "Infrastructure"], revenue: "$20M–$100M", credentials: ["Licensed", "Bonded", "Insured"] }),
  hit({ name: "Hudson Line Interiors", domain: "hudsonline.example", country: "United States", state: "New York", city: "New York", companyType: "interior", size: "11-50", founded: 2012, sectors: ["Hospitality"], revenue: "$1M–$5M", technologies: ["SketchUp", "HubSpot"], keywords: ["luxury", "hospitality"], credentials: ["Women-owned"] }),
  hit({ name: "Saffron Line Architects", domain: "saffronline.example", country: "Pakistan", city: "Lahore", companyType: "architect", size: "11-50", founded: 2009, sectors: ["Residential", "Commercial"], technologies: ["WordPress", "Autodesk Revit"], keywords: ["residential", "3d visualization"] }),
  hit({ name: "Canal View Architects", domain: "canalview.example", country: "Pakistan", city: "Lahore", companyType: "architect", size: "11-50", founded: 2012, ownership: "Partnership", sectors: ["Residential"], technologies: ["WordPress"], keywords: ["residential"] }),
  hit({ name: "Ravi Electric Works", domain: "ravielectric.example", country: "Pakistan", city: "Lahore", companyType: "sub", trades: ["electrical"], size: "11-50", founded: 2007, sectors: ["Commercial"], keywords: ["commercial"] }),
  hit({ name: "Shalimar Engineering", domain: "shalimareng.example", country: "Pakistan", city: "Lahore", companyType: "engineer", size: "51-100", founded: 2001, sectors: ["Commercial", "Industrial"], technologies: ["AutoCAD"], keywords: ["structural"] }),
  hit({ name: "Indus Build Co.", domain: "indusbuild.example", country: "Pakistan", city: "Karachi", companyType: "gc", size: "101-200", founded: 1998, sectors: ["Commercial", "Infrastructure"], technologies: ["Wix"], keywords: ["commercial"] }),
  hit({ name: "Seaview Developers", domain: "seaviewdev.example", country: "Pakistan", city: "Karachi", companyType: "developer", size: "201-500", founded: 2005, sectors: ["Residential", "Multi-family"], technologies: ["HubSpot"], keywords: ["residential", "high-rise"] }),
  hit({ name: "Margalla Homes", domain: "margallahomes.example", country: "Pakistan", city: "Islamabad", companyType: "home_builder", size: "11-50", founded: 2011, sectors: ["Residential"], projectTypes: ["Custom homes"], keywords: ["residential"] }),
  hit({ name: "Harbor & Stone Interiors", domain: "harborandstone.example", country: "United Arab Emirates", city: "Dubai", companyType: "interior", size: "11-50", founded: 2015, sectors: ["Hospitality", "Residential"], technologies: ["Squarespace", "HubSpot"], keywords: ["luxury"] }),
  hit({ name: "Dune Line Studio", domain: "dunelinestudio.example", country: "United Arab Emirates", city: "Dubai", companyType: "architect", size: "11-50", founded: 2013, sectors: ["Hospitality"], technologies: ["Autodesk Revit"], keywords: ["hospitality", "3d visualization"] }),
  hit({ name: "Gulf Frame Contracting", domain: "gulfframe.example", country: "United Arab Emirates", city: "Abu Dhabi", companyType: "gc", size: "201-500", founded: 2003, sectors: ["Commercial", "Infrastructure"], technologies: ["Procore"], keywords: ["commercial"] }),
  hit({ name: "Crescent Design Studio", domain: "crescentstudio.example", country: "United Kingdom", city: "London", companyType: "architect", size: "1-10", founded: 2016, sectors: ["Residential"], keywords: ["residential", "extensions"] }),
  hit({ name: "Thames Courtyard Architects", domain: "thamescourtyard.example", country: "United Kingdom", city: "London", companyType: "architect", size: "11-50", founded: 2008, ownership: "Partnership", sectors: ["Commercial"], keywords: ["commercial", "heritage"] }),
];

export interface SearchFilters {
  countries: string[];
  states: string[];
  cities: string[];
  companyTypes: string[];
  trades: string[];
  sectors: string[];
  projectTypes: string[];
  sizes: string[];
  revenues: string[];
  ownership: string;
  foundedAfter: string;
  technologies: string[];
  keywords: string[];
  keywordMatch: "any" | "all";
  naics: string[];
  credentials: string[];
  excludeInList: boolean;
  excludeDomains: string[];
  limit: number;
}

export const EMPTY_FILTERS: SearchFilters = {
  countries: [], states: [], cities: [], companyTypes: [], trades: [], sectors: [], projectTypes: [], sizes: [], revenues: [],
  ownership: "", foundedAfter: "", technologies: [], keywords: [], keywordMatch: "any", naics: [], credentials: [],
  excludeInList: true, excludeDomains: [], limit: 25,
};

export type Hit = SearchHit & { inList: boolean };
const lower = (xs: string[]) => xs.map((x) => x.trim().toLowerCase()).filter(Boolean);
const overlaps = (want: string[], have: string[]) => !want.length || want.some((w) => have.includes(w));

/** The same filters Hunter Discover takes; in the preview they run over the sample list */
export function searchSample(f: SearchFilters, inList: Set<string>): Hit[] {
  const states = lower(f.states);
  const cities = lower(f.cities);
  const techs = lower(f.technologies);
  const words = lower(f.keywords);
  const blocked = lower(f.excludeDomains);
  const codes = f.naics.map((c) => c.trim()).filter(Boolean);
  const after = Number(f.foundedAfter) || 0;
  return SAMPLE_HITS.filter((h) => {
    if (f.countries.length && !f.countries.includes(h.country)) return false;
    if (states.length && !states.includes(h.state.toLowerCase())) return false;
    if (cities.length && !cities.includes(h.city.toLowerCase())) return false;
    if (f.companyTypes.length && !f.companyTypes.includes(h.companyType)) return false;
    if (!overlaps(f.trades, h.trades)) return false;
    if (!overlaps(f.sectors, h.sectors)) return false;
    if (!overlaps(f.projectTypes, h.projectTypes)) return false;
    if (f.sizes.length && !f.sizes.includes(h.size)) return false;
    if (f.revenues.length && !f.revenues.includes(h.revenue)) return false;
    if (f.ownership && h.ownership !== f.ownership) return false;
    if (after && h.founded < after) return false;
    if (techs.length && !techs.some((t) => h.technologies.some((x) => x.toLowerCase() === t))) return false;
    if (words.length) {
      const has = (w: string) => h.keywords.some((k) => k.includes(w));
      if (f.keywordMatch === "all" ? !words.every(has) : !words.some(has)) return false;
    }
    // "238" matches every specialty trade code (238210, 238160…)
    if (codes.length && !codes.some((c) => h.naics.some((n) => n.startsWith(c)))) return false;
    if (f.credentials.length && !f.credentials.every((c) => h.credentials.includes(c))) return false;
    if (blocked.some((d) => h.domain.includes(d))) return false;
    if (f.excludeInList && inList.has(h.domain)) return false;
    return true;
  })
    .slice(0, Math.max(1, f.limit))
    .map((h) => ({ ...h, inList: inList.has(h.domain) }));
}

/** A search result as if it had been typed into the form */
export function hitToInput(h: SearchHit): CompanyInput {
  return {
    ...EMPTY_INPUT,
    name: h.name, website: h.domain, country: h.country, state: h.state, city: h.city, companyType: h.companyType, trades: h.trades,
    sectors: h.sectors, projectTypes: h.projectTypes, size: h.size, revenue: h.revenue, foundedYear: String(h.founded),
    naics: h.naics, credentials: h.credentials, software: h.technologies,
  };
}

/* ---------- CSV upload ---------- */

/** Reads a CSV, including quoted cells that contain commas or line breaks */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim()));
}

type CsvKey = "name" | "website" | "country" | "state" | "city" | "size" | "notes" | "companyType" | "trades";
const COLUMN: Record<string, CsvKey> = {
  name: "name", company: "name", company_name: "name", "company name": "name",
  country: "country", state: "state", province: "state", city: "city",
  website: "website", domain: "website", url: "website",
  type: "companyType", company_type: "companyType", "company type": "companyType",
  trade: "trades", trades: "trades",
  size: "size", company_size: "size", "company size": "size", employees: "size",
  notes: "notes",
};
/** "General contractor", "gc", "Subcontractor", "sub-contractor"… -> the company type */
const TYPE_WORDS: Record<string, CompanyTypeId> = { "general contractor": "gc", "sub-contractor": "sub" };
for (const t of COMPANY_TYPES) {
  TYPE_WORDS[t.id] = t.id;
  TYPE_WORDS[t.label.toLowerCase()] = t.id;
}
const tradeId = (word: string) => TRADES.find((t) => t.id === word.toLowerCase() || t.label.toLowerCase() === word.toLowerCase())?.id;

/** Rows of a CSV as companies; rows without a name, country or city are skipped and counted */
export function csvToCompanies(text: string): { companies: CompanyInput[]; skipped: number; error?: string } {
  const [head, ...rows] = parseCsv(text.replace(/^﻿/, ""));
  if (!head) return { companies: [], skipped: 0, error: "The file is empty." };
  const keys = head.map((h) => COLUMN[h.trim().toLowerCase()]);
  if (!keys.includes("name")) return { companies: [], skipped: 0, error: "The first row needs a column called name (or company)." };
  let skipped = 0;
  const companies: CompanyInput[] = [];
  for (const r of rows) {
    const c: CompanyInput = { ...EMPTY_INPUT };
    keys.forEach((k, i) => {
      const v = (r[i] ?? "").trim();
      if (!k || !v) return;
      if (k === "companyType") c.companyType = TYPE_WORDS[v.toLowerCase()] ?? "";
      else if (k === "trades") c.trades = v.split(/[;|]/).map((t) => tradeId(t.trim())).filter((t): t is string => !!t);
      else c[k] = v;
    });
    if (c.companyType !== "sub") c.trades = [];
    if (isUS(c.country)) c.naics = naicsFor(c.companyType, c.trades);
    if (!c.name || !c.country || !c.city) skipped++;
    else companies.push(c);
  }
  return { companies, skipped };
}

export const SAMPLE_CSV =
  "name,country,state,city,website,company_type,trades,size\n" +
  "Lone Star Builders,United States,Texas,Dallas,lonestarbuilders.example,General contractor,,101-200\n" +
  "Bayou Electric Co.,United States,Texas,Houston,,Subcontractor,Electrical;Solar,11-50\n" +
  "Canal View Architects,Pakistan,,Lahore,canalview.example,Architect,,11-50\n";

/* ---------- Simulator ---------- */

let seq = 0;
const newId = () => `co-${Date.now().toString(36)}-${(seq++).toString(36)}`;

/** A company added by hand, from a file or from a search, waiting its turn */
export function newCompany(input: CompanyInput & { source: CompanySource; now: number }): Company {
  const us = isUS(input.country);
  const year = /^\d{4}$/.test(input.foundedYear.trim()) ? Number(input.foundedYear) : null;
  return {
    ...BLANK,
    id: newId(),
    name: input.name.trim(),
    domain: input.website.trim() ? cleanDomain(input.website) : null,
    country: input.country.trim(),
    state: us ? input.state.trim() : "",
    city: input.city.trim(),
    companyType: input.companyType,
    trades: input.companyType === "sub" ? input.trades : [],
    industry: typeLabel(input.companyType),
    sectors: input.sectors,
    projectTypes: input.projectTypes,
    size: input.size,
    revenue: input.revenue,
    projectSize: input.projectSize,
    serviceArea: input.serviceArea.trim(),
    naics: us ? input.naics : [],
    licenseNumber: us ? input.licenseNumber.trim() : "",
    credentials: us ? input.credentials : [],
    technologies: input.software,
    contactRoles: input.contactRoles,
    team: { priority: input.priority, tags: input.tags, foundVia: input.foundVia.trim(), notes: input.notes.trim() },
    foundedYear: year,
    status: "queued",
    source: input.source,
    addedAt: input.now,
    steps: allPending(),
  };
}

/** Makes up what enrichment "finds" for a company: the same answer every time for the same company */
function invent(c: Company, settings: FinderSettings, isRetry: boolean): Draft {
  const h = hash(c.name + c.city);
  const domain = c.domain ?? `${slug(c.name) || "company"}.example`;
  // About one company in seven has no website we can find, unless you gave one or it is a second try
  const failAtWebsite = !c.domain && !isRetry && h % 7 === 3;
  const hasRating = h % 3 !== 0;
  const foundedYear = c.foundedYear ?? (h % 4 === 0 ? null : 1995 + (h % 27));
  // >>> (unsigned shift): the hash can be above 2^31, where >> would turn it negative
  const rating = hasRating ? 4 + ((h >>> 3) % 10) / 10 : null;
  const reviews = hasRating ? 12 + ((h >>> 5) % 180) : null;
  const roles = c.contactRoles.length ? c.contactRoles : rolesFor(settings, c.companyType);
  const picked = pickLine({ name: c.name, city: c.city, industry: c.industry, foundedYear, rating, reviews }, settings.templates);
  const statuses: EmailStatus[] = ["valid", h % 2 ? "catch_all" : "valid", "none"];
  const contacts = Array.from({ length: 1 + (h % 3) }, (_, i) => {
    const first = FIRST[(h >>> (i * 3)) % FIRST.length];
    const last = LAST[(h >>> (i * 4 + 1)) % LAST.length];
    const status = statuses[i];
    const email = status === "none" ? null : i === 0 ? `${first.toLowerCase()}@${domain}` : `${first.toLowerCase()}.${last.toLowerCase()}@${domain}`;
    const from = status === "none" ? "—" : i === 0 ? "Hunter" : status === "catch_all" ? "Guessed from the company's email pattern" : "Website";
    return person(`${c.id}-p${i}`, `${first} ${last}`, roles[i % roles.length], email, status, from, picked?.line ?? "");
  });
  const dial = DIAL[c.country] ?? "+00";
  return {
    failAtWebsite,
    domain,
    foundedYear,
    rating,
    reviews,
    phone: h % 5 === 0 ? null : `${dial} ${100 + (h % 800)} 000 ${String(h % 10000).padStart(4, "0")}`,
    address: [c.city, c.state, c.country].filter(Boolean).join(", ") || null,
    socials: [social("LinkedIn", c.name)],
    pagesRead: ["home", "about", h % 2 ? "team" : "projects", "contact"],
    contacts,
    sources: [
      { label: "Website: About page", url: `https://${domain}/about` },
      { label: "Hunter: domain search", url: `https://hunter.example/${domain}` },
    ],
    lineTemplate: picked?.template ?? null,
  };
}

function noteFor(step: StepId, d: Draft, c: Company): string {
  const withEmail = d.contacts.filter((p) => p.email).length;
  const valid = d.contacts.filter((p) => p.emailStatus === "valid").length;
  const risky = d.contacts.filter((p) => p.emailStatus === "catch_all").length;
  const s = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const kind = typeLabel(c.companyType).toLowerCase();
  switch (step) {
    case "website":
      return c.domain ? `Using the website you gave: ${d.domain}` : `Found ${d.domain} (Hunter)`;
    case "cache":
      return "New company, nothing saved before";
    case "read":
      return `Read ${d.pagesRead.length} pages: ${d.pagesRead.join(", ")}`;
    case "extract":
      return `${s(withEmail ? 1 : 0, "email")}, ${s(d.phone ? 1 : 0, "phone")}, ${s(d.socials.length, "social link")}${d.foundedYear ? `, “since ${d.foundedYear}”` : ""}`;
    case "people":
      return `${d.contacts.length} ${d.contacts.length === 1 ? "person matches" : "people match"} your roles${kind ? ` for ${/^[aeiou]/.test(kind) ? "an" : "a"} ${kind}` : ""}`;
    case "emails":
      return `${withEmail} of ${s(d.contacts.length, "email")} found`;
    case "verify":
      return [valid && `${valid} verified`, risky && `${risky} risky`].filter(Boolean).join(", ") || "Nothing to verify";
    case "line":
      return d.lineTemplate ? `Used template ${d.lineTemplate}` : "No template fit, so the message starts without a personal line";
  }
}

/**
 * One tick of the simulator: every company being enriched moves one step forward, then waiting companies start
 * until `atOnce` are running. No clock and no randomness, so React may safely call it twice.
 */
export function tick(list: Company[], settings: FinderSettings): Company[] {
  let next = list.map((c): Company => {
    if (c.status !== "enriching" || !c.draft) return c;
    const d = c.draft;
    const i = c.steps.findIndex((s) => s.state === "running");
    if (i < 0) return c;
    if (i === 0 && d.failAtWebsite) {
      return {
        ...c,
        status: "failed",
        error: "We couldn't find a website for this company. Add its website and try again.",
        steps: c.steps.map((s, k) => (k === 0 ? { ...s, state: "failed", note: "Hunter and Google search found no website that matches the name and city" } : s)),
        draft: undefined,
      };
    }
    const steps = c.steps.map((s, k): EnrichStep =>
      k === i ? { ...s, state: "done", note: noteFor(s.id, d, c) } : k === i + 1 ? { ...s, state: "running" } : s,
    );
    // Reveal what has been found so far, so an open review page fills in while you watch
    const found: Partial<Company> = {};
    const id = STEPS[i].id;
    if (id === "website") found.domain = d.domain;
    if (id === "extract") Object.assign(found, { phone: d.phone, address: d.address, socials: d.socials, foundedYear: d.foundedYear, rating: d.rating, reviews: d.reviews });
    if (id === "people") found.contacts = d.contacts.map((p) => ({ ...p, email: null, emailStatus: "unknown", emailSource: "—", personalLine: "", selected: false }));
    if (id === "emails") found.contacts = d.contacts.map((p) => ({ ...p, emailStatus: p.email ? "unknown" : "none", personalLine: "", selected: false }));
    if (id === "verify") found.contacts = d.contacts.map((p) => ({ ...p, personalLine: "" }));
    if (i === STEPS.length - 1) return { ...c, ...found, steps, status: "ready", contacts: d.contacts, sources: d.sources, draft: undefined };
    return { ...c, ...found, steps };
  });

  let running = next.filter((c) => c.status === "enriching").length;
  const waiting = next.filter((c) => c.status === "queued").sort((a, b) => a.addedAt - b.addedAt);
  for (const w of waiting) {
    if (running >= Math.max(1, settings.atOnce)) break;
    running++;
    next = next.map((c): Company =>
      c.id === w.id
        ? {
            ...c,
            status: "enriching",
            error: null,
            steps: c.steps.map((s, k) => ({ id: s.id, state: k === 0 ? "running" : "pending" })),
            draft: invent(c, settings, c.error !== null),
          }
        : c,
    );
  }
  return next;
}

/** Put a company that couldn't finish back in the queue, with the website if you added one */
export function requeue(c: Company, website?: string): Company {
  return { ...c, domain: website?.trim() ? cleanDomain(website) : c.domain, status: "queued", steps: allPending(), contacts: [], draft: undefined };
}
