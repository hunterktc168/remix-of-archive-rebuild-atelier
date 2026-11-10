/**
 * Marketing Plan workbench: the structured, adjustable model behind the
 * 'marketing-plan' framework. Pure functions only (no DOM, IndexedDB or network)
 * so every computed number is unit-testable.
 *
 * The framework document (sections) stays the canonical stored/validated form;
 * a Workbench is parsed from it and written back to it on every commit.
 */
import { parseMoney, describeSchema, type FrameworkDoc, type FrameworkSection, type MetricItem, type TableBody } from "./frameworkEngine";
import { getFramework, type Framework } from "./schemas";

export type Goal = "awareness" | "signups" | "revenue" | "retention";
export type Risk = "conservative" | "balanced" | "aggressive";
export type ChannelStatus = "Testing" | "Scaling" | "Paused" | "Cut";
export type ExperimentStatus = "Planned" | "Running" | "Won" | "Lost";
export type Health = "on-track" | "at-risk" | "off-track";
export type LaunchPhaseId = "pre" | "launch" | "scale";
export type KpiKey = "northStar" | "weekly" | "monthly";

export interface Levers {
  budget: number;
  goal: Goal;
  risk: Risk;
}
export interface Channel {
  id: string;
  name: string;
  role: string;
  budget: number;
  cac: number;
  confidence: number;
  status: ChannelStatus;
}
export interface Experiment {
  id: string;
  channelId: string | null;
  test: string;
  hypothesis: string;
  cost: number;
  metric: string;
  kill: string;
  status: ExperimentStatus;
  /** Outcome already applied to the linked channel's confidence. */
  appliedOutcome: "Won" | "Lost" | null;
}
export interface LaunchPhase {
  id: LaunchPhaseId;
  label: string;
  startWeek: number;
  endWeek: number;
}
export interface LaunchTask {
  id: string;
  phase: LaunchPhaseId;
  week: number;
  title: string;
  owner: string;
}
export interface KpiSlot {
  key: KpiKey;
  metric: string;
  target: string;
  current: string;
  health: Health;
}
export interface Narrative {
  positioning: string;
  icp: string[];
  pillars: string[];
  cutFirst: string;
}
export interface Workbench {
  levers: Levers;
  channels: Channel[];
  experiments: Experiment[];
  launch: { phases: LaunchPhase[]; tasks: LaunchTask[] };
  kpis: KpiSlot[];
  narrative: Narrative;
  /** Founder-entered LTV that wins over the one read from the canvases. */
  ltvOverride: number | null;
}
export interface EvolveAnswers {
  changed: string;
  learned: string;
  constraint: string;
}
export interface LtvInfo {
  ltv: number;
  source: string;
  basis: string;
}

/* ------------------------------------------------------------------ */
/* Vocabulary                                                          */
/* ------------------------------------------------------------------ */

export const GOALS: { id: Goal; label: string }[] = [
  { id: "awareness", label: "Awareness" },
  { id: "signups", label: "Signups" },
  { id: "revenue", label: "Revenue" },
  { id: "retention", label: "Retention" },
];
export const RISKS: { id: Risk; label: string }[] = [
  { id: "conservative", label: "Conservative" },
  { id: "balanced", label: "Balanced" },
  { id: "aggressive", label: "Aggressive" },
];
export const CHANNEL_STATUSES: ChannelStatus[] = ["Testing", "Scaling", "Paused", "Cut"];
export const EXPERIMENT_STATUSES: ExperimentStatus[] = ["Planned", "Running", "Won", "Lost"];
export const HEALTH_STATES: { id: Health; label: string }[] = [
  { id: "on-track", label: "On track" },
  { id: "at-risk", label: "At risk" },
  { id: "off-track", label: "Off track" },
];
export const KPI_SLOTS: { key: KpiKey; label: string; docLabel: string }[] = [
  { key: "northStar", label: "North Star", docLabel: "North-star metric" },
  { key: "weekly", label: "Weekly", docLabel: "Weekly review metric" },
  { key: "monthly", label: "Monthly", docLabel: "Monthly review metric" },
];
export const DEFAULT_PHASES: LaunchPhase[] = [
  { id: "pre", label: "Pre-launch", startWeek: 1, endWeek: 4 },
  { id: "launch", label: "Launch", startWeek: 5, endWeek: 8 },
  { id: "scale", label: "Scale", startWeek: 9, endWeek: 16 },
];
export const OWNERS: { id: string; name: string; initials: string; match: RegExp }[] = [
  { id: "founder", name: "Founder", initials: "YOU", match: /founder|\byou\b|\bceo\b/i },
  { id: "marcus", name: "Marcus Webb", initials: "MW", match: /marcus|\bcmo\b/i },
  { id: "elena", name: "Elena Vasquez", initials: "EV", match: /elena|\bcfo\b/i },
  { id: "sam", name: "Sam Torres", initials: "ST", match: /\bsam\b|head of product/i },
  { id: "priya", name: "Priya Raman", initials: "PR", match: /priya|\bcoo\b/i },
  { id: "maya", name: "Maya Chen", initials: "MC", match: /maya|\bcio\b/i },
  { id: "david", name: "David Okafor", initials: "DO", match: /david/i },
  { id: "chair", name: "The Chair", initials: "CH", match: /chair/i },
];

const GOAL_ROLE: Record<Goal, RegExp> = {
  awareness: /awareness|top/i,
  signups: /demand|middle|signup|acquisition/i,
  revenue: /bottom|acquisition|conversion|sales/i,
  retention: /retention|lifecycle|referral|post/i,
};
const NORTH_STAR_BY_GOAL: Record<Goal, (budget: number) => { metric: string; target: string }> = {
  awareness: () => ({ metric: "Monthly qualified visitors from target accounts", target: "5,000" }),
  signups: () => ({ metric: "Weekly qualified signups", target: "40" }),
  revenue: (b) => ({ metric: "New MRR added per month", target: fmtMoney(b * 1.5) }),
  retention: () => ({ metric: "Month-2 retention of new accounts", target: "≥ 70%" }),
};

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const round50 = (n: number) => Math.round(n / 50) * 50;
const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function slugify(s: string): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "item";
}

function uniqueId(base: string, used: Set<string>): string {
  let id = base;
  let n = 2;
  while (used.has(id)) id = `${base}-${n++}`;
  used.add(id);
  return id;
}

export function newId(prefix: string, existing: string[]): string {
  return uniqueId(`${prefix}-${Date.now().toString(36)}`, new Set(existing));
}

export function clampConfidence(n: number): number {
  return Math.max(1, Math.min(5, Math.round(Number.isFinite(n) ? n : 3)));
}

export function fmtMoney(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

/** 5000 -> "$5k", 7500 -> "$7.5k", 800 -> "$800". */
export function fmtK(n: number): string {
  if (n >= 1000) {
    const k = n / 1000;
    return `$${Number.isInteger(k) ? k : +k.toFixed(1)}k`;
  }
  return `$${Math.round(n)}`;
}

export function fmtNum(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n >= 10 ? Math.round(n).toLocaleString("en-US") : (Math.round(n * 10) / 10).toString();
}

export function leversLabel(l: Levers): string {
  return `${fmtK(l.budget)}/mo ${l.risk}`;
}

export function leversEqual(a: Levers, b: Levers): boolean {
  return a.budget === b.budget && a.goal === b.goal && a.risk === b.risk;
}

export function goalLabel(g: Goal): string {
  return GOALS.find((x) => x.id === g)?.label ?? g;
}

export function normalizeChannelStatus(s: string): ChannelStatus {
  const t = (s || "").toLowerCase();
  if (/\bcut\b|kill|stop/.test(t)) return "Cut";
  if (/pause|hold/.test(t)) return "Paused";
  if (/scal|active|live|double|grow/.test(t)) return "Scaling";
  return "Testing";
}

export function matchOwner(text: string): string | null {
  if (!text) return null;
  return OWNERS.find((o) => o.match.test(text))?.id ?? null;
}

export function ownerName(id: string): string {
  return OWNERS.find((o) => o.id === id)?.name ?? id;
}

const STOP_WORDS = new Set(["the", "and", "for", "ads", "channel", "channels", "paid", "free", "marketing", "with"]);

function channelWords(name: string): string[] {
  return name.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
}

export function channelMentioned(channel: Channel, text: string): boolean {
  const t = (text || "").toLowerCase();
  if (!t) return false;
  if (t.includes(channel.name.toLowerCase())) return true;
  return channelWords(channel.name).some((w) => t.includes(w));
}

/** Best channel for an experiment, by shared significant words. */
export function matchChannel(text: string, channels: Channel[]): string | null {
  const t = (text || "").toLowerCase();
  let best: string | null = null;
  let score = 0;
  for (const c of channels) {
    const s = channelWords(c.name).filter((w) => t.includes(w)).length;
    if (s > score) {
      best = c.id;
      score = s;
    }
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* Document <-> workbench                                              */
/* ------------------------------------------------------------------ */

function planSchema() {
  const f = getFramework("marketing-plan");
  if (!f) throw new Error("marketing-plan framework missing");
  return f.schema;
}
function columnsFor(id: string): string[] {
  return planSchema().find((s) => s.id === id)?.columns ?? [];
}
function headingFor(id: string): string {
  return planSchema().find((s) => s.id === id)?.heading ?? id;
}

function body(doc: FrameworkDoc, id: string) {
  return doc.sections.find((s) => s.id === id)?.body;
}
function asTable(b: unknown): TableBody | null {
  return b && typeof b === "object" && !Array.isArray(b) && Array.isArray((b as TableBody).rows) ? (b as TableBody) : null;
}
function asList(b: unknown): string[] {
  if (Array.isArray(b)) return b.filter((x): x is string => typeof x === "string" && !!x.trim());
  if (typeof b === "string" && b.trim()) return [b];
  return [];
}
function asMetrics(b: unknown): MetricItem[] {
  return Array.isArray(b) ? (b as MetricItem[]).filter((m) => m && typeof m === "object") : [];
}
function colIndex(t: TableBody, re: RegExp, fallback: number): number {
  const i = t.columns.findIndex((c) => re.test(c));
  return i >= 0 ? i : fallback;
}

function parseChannels(doc: FrameworkDoc): Channel[] {
  const t = asTable(body(doc, "channel-portfolio"));
  if (!t) return [];
  const ci = {
    name: colIndex(t, /^channel/i, 0),
    role: colIndex(t, /role/i, 1),
    budget: colIndex(t, /budget/i, 2),
    cac: colIndex(t, /cac/i, 3),
    conf: colIndex(t, /confidence/i, 5),
    status: colIndex(t, /status/i, 6),
  };
  const used = new Set<string>();
  return t.rows
    .filter((r) => (r[ci.name] || "").trim())
    .map((r) => {
      const conf = String(r[ci.conf] ?? "").match(/\d/);
      return {
        id: uniqueId(slugify(r[ci.name] ?? ""), used),
        name: (r[ci.name] ?? "").trim(),
        role: (r[ci.role] ?? "").trim(),
        budget: Math.max(0, Math.round(parseMoney(r[ci.budget]) ?? 0)),
        cac: Math.max(0, Math.round(parseMoney(r[ci.cac]) ?? 0)),
        confidence: clampConfidence(conf ? Number(conf[0]) : 3),
        status: normalizeChannelStatus(r[ci.status] ?? ""),
      };
    });
}

const STATUS_SUFFIX = /\s*\[(planned|running|won|lost)\]\s*$/i;
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

function parseExperiments(doc: FrameworkDoc, channels: Channel[], prev: Workbench | null): Experiment[] {
  const t = asTable(body(doc, "experiment-backlog"));
  if (!t) return [];
  const used = new Set<string>();
  const channelIds = new Set(channels.map((c) => c.id));
  return t.rows
    .filter((r) => r.some((c) => (c || "").trim()))
    .map((r) => {
      let test = (r[0] ?? "").trim();
      let status: ExperimentStatus | null = null;
      const m = test.match(STATUS_SUFFIX);
      if (m?.[1]) {
        status = capitalize(m[1]) as ExperimentStatus;
        test = test.replace(STATUS_SUFFIX, "").trim();
      }
      const hypothesis = (r[1] ?? "").trim();
      const p = prev?.experiments.find((e) => norm(e.test) === norm(test));
      const id = p && !used.has(p.id) ? (used.add(p.id), p.id) : uniqueId(`x-${slugify(test)}`, used);
      const channelId = p?.channelId && channelIds.has(p.channelId) ? p.channelId : matchChannel(`${test} ${hypothesis}`, channels);
      const finalStatus = status ?? p?.status ?? "Planned";
      return {
        id,
        channelId,
        test,
        hypothesis,
        cost: Math.max(0, Math.round(parseMoney(r[2]) ?? 0)),
        metric: (r[3] ?? "").trim(),
        kill: (r[4] ?? "").trim(),
        status: finalStatus,
        appliedOutcome: p ? p.appliedOutcome : finalStatus === "Won" || finalStatus === "Lost" ? finalStatus : null,
      };
    });
}

function parseLaunch(doc: FrameworkDoc): { phases: LaunchPhase[]; tasks: LaunchTask[] } {
  const phases = clone(DEFAULT_PHASES);
  const tasks: LaunchTask[] = [];
  const t = asTable(body(doc, "launch-sequence"));
  if (!t) return { phases, tasks };
  const seen = new Set<LaunchPhaseId>();
  const ids: LaunchPhaseId[] = ["pre", "launch", "scale"];
  t.rows.forEach((r, idx) => {
    const stage = r[0] ?? "";
    const pid: LaunchPhaseId = /pre/i.test(stage) ? "pre" : /scal|grow|expan/i.test(stage) ? "scale" : /launch/i.test(stage) ? "launch" : ids[Math.min(idx, 2)]!;
    const ph = phases.find((p) => p.id === pid)!;
    const nums = (r[1] ?? "").match(/\d+/g)?.map(Number) ?? [];
    if (nums.length) {
      const s = Math.min(...nums);
      const e = Math.max(...nums);
      if (!seen.has(pid)) {
        ph.startWeek = s;
        ph.endWeek = e;
      } else {
        ph.startWeek = Math.min(ph.startWeek, s);
        ph.endWeek = Math.max(ph.endWeek, e);
      }
    }
    seen.add(pid);
    const rowOwner = matchOwner(r[3] ?? "") ?? "founder";
    const raw = r[2] ?? "";
    const parts = (raw.includes(";") ? raw.split(";") : raw.split(",")).map((s) => s.trim()).filter(Boolean);
    parts.forEach((part, i) => {
      const m = part.match(/^w(?:ee)?k\s*(\d+)\s*[:\-–—]\s*(.*)$/i);
      let week = m?.[1] ? Number(m[1]) : null;
      let title = m ? (m[2] ?? "") : part;
      let owner = rowOwner;
      const om = title.match(/\s*\(([^)]+)\)\s*$/);
      if (om?.[1]) {
        const o = matchOwner(om[1]);
        if (o) {
          owner = o;
          title = title.slice(0, om.index);
        }
      }
      if (week == null) {
        const span = ph.endWeek - ph.startWeek + 1;
        week = ph.startWeek + Math.floor((i * span) / Math.max(parts.length, 1));
      }
      tasks.push({ id: `t-${tasks.length + 1}`, phase: pid, week, title: title.trim(), owner });
    });
  });
  return { phases, tasks };
}

function parseKpis(doc: FrameworkDoc, prev: Workbench | null): KpiSlot[] {
  const items = asMetrics(body(doc, "kpis"));
  return KPI_SLOTS.map((slot, i) => {
    const re = slot.key === "northStar" ? /north/i : new RegExp(slot.key, "i");
    const item = items.find((m) => re.test(m.label || "")) ?? items[i];
    const p = prev?.kpis.find((k) => k.key === slot.key);
    if (!item) return p ? { ...p } : { key: slot.key, metric: "", target: "", current: "", health: "on-track" as Health };
    const value = item.value || "";
    const tm = value.match(/\((?:target|goal)\s*:?\s*([^)]*)\)/i);
    const metric = (tm ? value.replace(tm[0], "") : value).replace(/\s{2,}/g, " ").trim();
    const note = item.note || "";
    const cm = note.match(/current\s*:?\s*([^·|]*)/i);
    const health: Health | null = /off.?track/i.test(note) ? "off-track" : /at.?risk/i.test(note) ? "at-risk" : /on.?track/i.test(note) ? "on-track" : null;
    const current = cm?.[1] ? cm[1].trim().replace(/^—$/, "") : "";
    return { key: slot.key, metric, target: tm?.[1]?.trim() ?? "", current: current || p?.current || "", health: health ?? p?.health ?? "on-track" };
  });
}

/**
 * Parse a marketing-plan document into an editable workbench.
 * `prev` carries forward things the document cannot hold (goal, risk, experiment
 * outcomes, KPI readings, LTV override); `levers` overrides lever values.
 */
export function workbenchFromDoc(doc: FrameworkDoc, opts: { prev?: Workbench | null; levers?: Partial<Levers> } = {}): Workbench {
  const prev = opts.prev ?? null;
  const channels = parseChannels(doc);
  const alloc = asMetrics(body(doc, "budget-allocation"));
  const total = parseMoney(alloc.find((m) => /total/i.test(m.label || ""))?.value);
  const docBudget = total ?? sum(channels.map((c) => c.budget));
  const levers: Levers = { budget: Math.max(0, Math.round(docBudget)), goal: prev?.levers.goal ?? "signups", risk: prev?.levers.risk ?? "balanced" };
  for (const [k, v] of Object.entries(opts.levers ?? {})) if (v !== undefined && v !== null) (levers as unknown as Record<string, unknown>)[k] = v;
  return {
    levers,
    channels,
    experiments: parseExperiments(doc, channels, prev),
    launch: parseLaunch(doc),
    kpis: parseKpis(doc, prev),
    narrative: {
      positioning: typeof body(doc, "positioning") === "string" ? (body(doc, "positioning") as string) : asList(body(doc, "positioning")).join(" "),
      icp: asList(body(doc, "icp")),
      pillars: asList(body(doc, "messaging-pillars")),
      cutFirst: typeof body(doc, "cut-first") === "string" ? (body(doc, "cut-first") as string) : asList(body(doc, "cut-first")).join(" "),
    },
    ltvOverride: prev?.ltvOverride ?? null,
  };
}

/** Write the workbench back into the framework's sections (schema order). */
export function docFromWorkbench(wb: Workbench, title: string): FrameworkDoc {
  const shares = allocateShares(wb.channels.map((c) => c.budget));
  const allocated = sum(wb.channels.map((c) => c.budget));
  const healthLabel = (h: Health) => HEALTH_STATES.find((x) => x.id === h)?.label ?? h;
  const phaseTasks = (pid: LaunchPhaseId) => wb.launch.tasks.filter((t) => t.phase === pid).sort((a, b) => a.week - b.week);

  const sec = (id: string, kind: FrameworkSection["kind"], b: FrameworkSection["body"]): FrameworkSection => ({ id, heading: headingFor(id), kind, body: b });
  const totalItem: MetricItem = { label: "Total monthly budget", value: fmtMoney(wb.levers.budget) };
  if (allocated !== wb.levers.budget) totalItem.note = `channels allocate ${fmtMoney(allocated)}`;

  return {
    title,
    framework: "marketing-plan",
    sections: [
      sec("positioning", "prose", wb.narrative.positioning),
      sec("icp", "bullets", [...wb.narrative.icp]),
      sec("messaging-pillars", "bullets", [...wb.narrative.pillars]),
      sec("channel-portfolio", "table", {
        columns: columnsFor("channel-portfolio"),
        rows: wb.channels.map((c) => [c.name, c.role, fmtMoney(c.budget), fmtMoney(c.cac), c.cac > 0 ? `${fmtNum(c.budget / c.cac)} customers/mo` : "—", String(c.confidence), c.status]),
      }),
      sec("budget-allocation", "metrics", [totalItem, ...wb.channels.map((c, i) => ({ label: c.name, value: `${shares[i]}%` }))]),
      sec("experiment-backlog", "table", {
        columns: columnsFor("experiment-backlog"),
        rows: wb.experiments.map((e) => [e.status === "Planned" ? e.test : `${e.test} [${e.status}]`, e.hypothesis, fmtMoney(e.cost), e.metric, e.kill]),
      }),
      sec("launch-sequence", "table", {
        columns: columnsFor("launch-sequence"),
        rows: wb.launch.phases.map((p) => {
          const tasks = phaseTasks(p.id);
          const owners = [...new Set(tasks.map((t) => ownerName(t.owner)))];
          return [p.label, `Weeks ${p.startWeek}–${p.endWeek}`, tasks.map((t) => `Wk ${t.week}: ${t.title} (${ownerName(t.owner)})`).join("; "), owners.join(" + ") || "Founder"];
        }),
      }),
      sec(
        "kpis",
        "metrics",
        wb.kpis.map((k) => {
          const slot = KPI_SLOTS.find((s) => s.key === k.key)!;
          return { label: slot.docLabel, value: `${k.metric}${k.target ? ` (target ${k.target})` : ""}`, note: `current: ${k.current || "—"} · ${healthLabel(k.health)}` };
        }),
      ),
      sec("cut-first", "prose", wb.narrative.cutFirst),
    ],
  };
}

/* ------------------------------------------------------------------ */
/* Computations                                                        */
/* ------------------------------------------------------------------ */

/** Integer percentages that always sum to exactly 100 (largest remainder). */
export function allocateShares(budgets: number[]): number[] {
  const total = sum(budgets);
  if (total <= 0) return budgets.map(() => 0);
  const raw = budgets.map((b) => (b / total) * 100);
  const floors = raw.map(Math.floor);
  let rem = 100 - sum(floors);
  const order = raw.map((r, i) => ({ i, f: r - floors[i]! })).sort((a, b) => b.f - a.f);
  for (let k = 0; rem > 0; k++, rem--) floors[order[k % order.length]!.i]!++;
  return floors;
}

/** Split `total` across weights in $50 steps; the result sums to exactly `total`. */
export function allocateBudget(total: number, weights: number[]): number[] {
  const W = sum(weights);
  if (W <= 0 || total <= 0) return weights.map(() => 0);
  const units = Math.floor(total / 50);
  const raw = weights.map((w) => (w / W) * units);
  const fl = raw.map(Math.floor);
  let rem = units - sum(fl);
  const order = raw.map((r, i) => ({ i, f: r - fl[i]! })).sort((a, b) => b.f - a.f);
  for (let k = 0; rem > 0; k++, rem--) fl[order[k % order.length]!.i]!++;
  const out = fl.map((u) => u * 50);
  const leftover = total - units * 50;
  if (leftover) {
    const maxI = weights.indexOf(Math.max(...weights));
    out[maxI]! += leftover;
  }
  return out;
}

export interface PortfolioRow extends Channel {
  share: number;
  volume: number;
  ltvCac: number | null;
}
export interface Portfolio {
  rows: PortfolioRow[];
  allocated: number;
  shareSum: number;
  overBy: number;
  unallocated: number;
  totalVolume: number;
  blendedCac: number | null;
  blendedLtvCac: number | null;
}

export function computePortfolio(wb: Workbench, ltv: number | null): Portfolio {
  const shares = allocateShares(wb.channels.map((c) => c.budget));
  const rows = wb.channels.map((c, i) => ({
    ...c,
    share: shares[i]!,
    volume: c.cac > 0 ? c.budget / c.cac : 0,
    ltvCac: ltv && c.cac > 0 ? ltv / c.cac : null,
  }));
  const allocated = sum(rows.map((r) => r.budget));
  const totalVolume = sum(rows.map((r) => r.volume));
  const blendedCac = totalVolume > 0 ? allocated / totalVolume : null;
  return {
    rows,
    allocated,
    shareSum: sum(shares),
    overBy: Math.max(0, allocated - wb.levers.budget),
    unallocated: Math.max(0, wb.levers.budget - allocated),
    totalVolume,
    blendedCac,
    blendedLtvCac: ltv && blendedCac ? ltv / blendedCac : null,
  };
}

export function effectiveLtv(wb: Workbench, info: LtvInfo | null): number | null {
  if (wb.ltvOverride && wb.ltvOverride > 0) return wb.ltvOverride;
  return info?.ltv ?? null;
}

/** Read an LTV from a canvas Revenue Streams box. */
export function ltvFromRevenueModel(bullets: string[]): { ltv: number; basis: string } | null {
  const lines = bullets.filter(Boolean);
  const ltvLine = lines.find((b) => /\bLTV\b|lifetime value/i.test(b));
  const moneyRe = /\$\s?\d[\d,]*(?:\.\d+)?\s?[kKmM]?/g;
  if (ltvLine) {
    const tail = ltvLine.split(/≈|=|~/).pop() ?? "";
    const pick = tail.match(moneyRe)?.[0] ?? ltvLine.match(moneyRe)?.pop();
    const n = pick ? parseMoney(pick) : null;
    if (n && n > 0) return { ltv: Math.round(n), basis: ltvLine };
  }
  const text = lines.join(" ");
  const price = text.match(/\$\s?(\d[\d,]*(?:\.\d+)?)\s*(?:\/|per\s+)(?:mo|month)/i);
  if (!price?.[1]) return null;
  const p = parseFloat(price[1].replace(/,/g, ""));
  const churn = text.match(/(\d+(?:\.\d+)?)\s*%\s*(?:monthly\s+)?churn/i);
  const margin = text.match(/(\d+(?:\.\d+)?)\s*%\s*gross margin/i);
  if (churn?.[1] && parseFloat(churn[1]) > 0) {
    const m = margin?.[1] ? parseFloat(margin[1]) / 100 : 1;
    return { ltv: Math.round((p * m) / (parseFloat(churn[1]) / 100)), basis: `$${p}/mo${margin ? ` × ${margin[1]}% margin` : ""} ÷ ${churn[1]}% monthly churn` };
  }
  return { ltv: Math.round(p * 24), basis: `$${p}/mo × an assumed 24-month lifetime` };
}

interface FrameworkLike {
  framework?: string;
  sections?: FrameworkSection[];
  currentVersion?: number;
}

/** LTV from the venture's Lean Canvas, else its Business Blueprint. */
export function ltvFromFrameworks(deliverables: FrameworkLike[]): LtvInfo | null {
  for (const [id, label] of [["lean-canvas", "Lean Canvas"], ["business-blueprint", "Business Blueprint"]] as const) {
    const d = deliverables.find((x) => x.framework === id);
    const rev = d?.sections?.find((s) => s.id === "revenue-streams");
    if (!rev) continue;
    const r = ltvFromRevenueModel(asList(rev.body));
    if (r) return { ltv: r.ltv, basis: r.basis, source: `${label} v${d?.currentVersion ?? 1}` };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Edits                                                               */
/* ------------------------------------------------------------------ */

/** Paused and Cut channels spend nothing; their budget becomes unallocated. */
export function setChannelStatus(wb: Workbench, channelId: string, status: ChannelStatus): Workbench {
  const out = clone(wb);
  const c = out.channels.find((x) => x.id === channelId);
  if (!c) return out;
  c.status = status;
  if (status === "Paused" || status === "Cut") c.budget = 0;
  return out;
}

export interface Reallocation {
  fromId: string;
  toId: string;
  fromName: string;
  toName: string;
  amount: number;
  reason: string;
}

function weakestChannel(channels: Channel[], exclude: string | null = null): Channel | null {
  return (
    channels
      .filter((c) => c.id !== exclude && c.status !== "Cut" && c.status !== "Paused" && c.budget > 0)
      .sort((a, b) => a.confidence - b.confidence || b.cac - a.cac)[0] ?? null
  );
}

/**
 * When a channel is Scaling with confidence >= 4, propose moving half of the
 * weakest channel's budget (in $50 steps) into it.
 */
export function suggestReallocation(wb: Workbench): Reallocation | null {
  const strong = wb.channels.filter((c) => c.status === "Scaling" && c.confidence >= 4).sort((a, b) => b.confidence - a.confidence || a.cac - b.cac)[0];
  if (!strong) return null;
  const weak = weakestChannel(wb.channels, strong.id);
  if (!weak || weak.confidence >= strong.confidence) return null;
  const amount = Math.min(weak.budget, Math.max(50, round50(weak.budget * 0.5)));
  return {
    fromId: weak.id,
    toId: strong.id,
    fromName: weak.name,
    toName: strong.name,
    amount,
    reason: `${strong.name} is Scaling at confidence ${strong.confidence}/5; ${weak.name} is the weakest line at ${weak.confidence}/5 with a ${fmtMoney(weak.cac)} CAC.`,
  };
}

export function applyReallocation(wb: Workbench, r: Reallocation): Workbench {
  const out = clone(wb);
  const from = out.channels.find((c) => c.id === r.fromId);
  const to = out.channels.find((c) => c.id === r.toId);
  if (!from || !to) return out;
  const amount = Math.min(r.amount, from.budget);
  from.budget -= amount;
  to.budget += amount;
  return out;
}

/** Draft a falsifiable test for a channel: hypothesis + kill criterion. */
export function experimentForChannel(channel: Channel, existingIds: string[] = []): Experiment {
  const cac = channel.cac > 0 ? channel.cac : 250;
  const cost = Math.max(50, round50(Math.min(channel.budget > 0 ? channel.budget : cac * 2, cac * 2)));
  const customers = Math.max(1, Math.floor(cost / cac));
  return {
    id: newId(`x-${slugify(channel.name)}`, existingIds),
    channelId: channel.id,
    test: `${channel.name} CAC test`,
    hypothesis: `${channel.name} acquires customers at or below ${fmtMoney(cac)} CAC in its ${channel.role || "funnel"} role.`,
    cost,
    metric: `≥ ${customers} customer${customers > 1 ? "s" : ""} at CAC ≤ ${fmtMoney(cac)} within 4 weeks`,
    kill: `No customer after ${fmtMoney(cost)} spend, or CAC above ${fmtMoney(cac * 1.5)}`,
    status: "Planned",
    appliedOutcome: null,
  };
}

/**
 * Change an experiment's status. Won adds +1 and Lost −1 to the linked channel's
 * confidence; moving away from an outcome reverses what was applied.
 */
export function setExperimentStatus(wb: Workbench, experimentId: string, status: ExperimentStatus): Workbench {
  const out = clone(wb);
  const exp = out.experiments.find((e) => e.id === experimentId);
  if (!exp) return out;
  const value = (s: string | null) => (s === "Won" ? 1 : s === "Lost" ? -1 : 0);
  const delta = value(status) - value(exp.appliedOutcome);
  const ch = exp.channelId ? out.channels.find((c) => c.id === exp.channelId) : null;
  if (ch && delta) ch.confidence = clampConfidence(ch.confidence + delta);
  exp.status = status;
  exp.appliedOutcome = status === "Won" || status === "Lost" ? status : null;
  return out;
}

export interface OutcomeDrift {
  confidence: { channelId: string; name: string; from: number; to: number }[];
  outcomes: { id: string; test: string; status: ExperimentStatus }[];
}

/** What experiment results changed in the working copy since the committed version. */
export function outcomeDrift(committed: Workbench, working: Workbench): OutcomeDrift {
  const confidence = working.channels
    .map((c) => {
      const before = committed.channels.find((x) => x.id === c.id);
      return before && before.confidence !== c.confidence ? { channelId: c.id, name: c.name, from: before.confidence, to: c.confidence } : null;
    })
    .filter((x): x is NonNullable<typeof x> => !!x);
  const outcomes = working.experiments
    .filter((e) => e.appliedOutcome && committed.experiments.find((x) => x.id === e.id)?.appliedOutcome !== e.appliedOutcome)
    .map((e) => ({ id: e.id, test: e.test, status: e.status }));
  return { confidence, outcomes };
}

/** Move a launch task to the phase that owns `week` (or to `phase`, keeping its week inside it). */
export function moveTask(wb: Workbench, taskId: string, target: { phase?: LaunchPhaseId; week?: number }): Workbench {
  const out = clone(wb);
  const t = out.launch.tasks.find((x) => x.id === taskId);
  if (!t) return out;
  if (target.week !== undefined && Number.isFinite(target.week)) {
    t.week = Math.max(1, Math.round(target.week));
    const owner = out.launch.phases.find((p) => t.week >= p.startWeek && t.week <= p.endWeek);
    if (owner && target.phase === undefined) t.phase = owner.id;
  }
  if (target.phase) {
    t.phase = target.phase;
    const ph = out.launch.phases.find((p) => p.id === target.phase)!;
    if (t.week < ph.startWeek || t.week > ph.endWeek) t.week = ph.startWeek;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Deterministic board re-plan (used by the offline demo board)        */
/* ------------------------------------------------------------------ */

function applyAnswers(wb: Workbench, lv: Levers, answers: EvolveAnswers, log: string[]) {
  const changed = (answers.changed || "").trim();
  const learned = (answers.learned || "").trim();
  const constraint = (answers.constraint || "").trim();

  const money = constraint.match(/\$\s?\d[\d,.]*\s?[kK]?\b|\b\d+(?:\.\d+)?\s?[kK]\b/);
  const amount = money ? parseMoney(money[0]) : null;
  if (amount && amount > 0) {
    lv.budget = Math.round(amount);
    log.push(`Constraint — “${truncate(constraint, 90)}”: monthly budget set to ${fmtMoney(lv.budget)}.`);
  } else if (constraint) {
    log.push(`Constraint — “${truncate(constraint, 90)}”: written into What We Would Cut First as a binding rule.`);
  }

  for (const c of wb.channels) {
    const src = [changed, constraint].find((t) => channelMentioned(c, t) && /\b(cut|stop|drop|kill|no more|pause|freeze|can't|cannot)\b/i.test(t));
    if (src) {
      const to: ChannelStatus = /pause|freeze/i.test(src) ? "Paused" : "Cut";
      c.status = to;
      c.budget = 0;
      log.push(`${c.name} → ${to}, per “${truncate(src, 80)}”.`);
    }
  }

  if (learned) {
    const ch = wb.channels.find((c) => channelMentioned(c, learned) && c.status !== "Cut") ?? null;
    const neg = /\b(fail|failed|didn'?t|did not|not work|expensive|worse|lost|poor|weak|below|no one|nobody|churn)/i.test(learned);
    const pos = !neg && /\b(work|worked|works|convert|converted|cheap|cheaper|better|won|strong|great|beat|above|loved|responded)/i.test(learned);
    if (ch && (pos || neg)) {
      const from = ch.confidence;
      ch.confidence = clampConfidence(from + (pos ? 1 : -1));
      log.push(`Learning — “${truncate(learned, 90)}”: ${ch.name} confidence ${from} → ${ch.confidence}.`);
    } else {
      log.push(`Learning — “${truncate(learned, 90)}”: logged as a follow-up experiment.`);
    }
    wb.experiments.push({
      id: newId("x-follow-up", wb.experiments.map((e) => e.id)),
      channelId: ch?.id ?? null,
      test: `Follow-up: ${truncate(learned, 48)}`,
      hypothesis: `The learning “${truncate(learned, 120)}” repeats with a second cohort.`,
      cost: ch ? Math.max(100, round50(ch.cac)) : 250,
      metric: "Same direction and size of effect in cohort 2",
      kill: "Effect disappears or reverses within 2 weeks",
      status: "Planned",
      appliedOutcome: null,
    });
  }

  if (changed) {
    const launch = wb.launch.phases.find((p) => p.id === "launch") ?? DEFAULT_PHASES[1]!;
    wb.launch.tasks.push({ id: newId("t-change", wb.launch.tasks.map((t) => t.id)), phase: "launch", week: launch.startWeek, title: `Respond to: ${truncate(changed, 60)}`, owner: "marcus" });
    log.push(`What changed — “${truncate(changed, 90)}”: added a Week ${launch.startWeek} response task and re-weighted the portfolio around it.`);
  }
}

/** Marcus's deterministic re-plan for new levers (and optional interview answers). */
export function replanForLevers(prev: Workbench, levers: Levers, answers: EvolveAnswers | null = null, fromLevers: Levers = prev.levers): { workbench: Workbench; changeLog: string[] } {
  const wb = clone(prev);
  const log: string[] = [];
  const lv: Levers = { ...levers };
  if (answers) applyAnswers(wb, lv, answers, log);

  for (const c of wb.channels) {
    if (lv.risk === "conservative" && c.status === "Testing" && c.confidence <= 2) {
      c.status = "Paused";
      log.push(`Paused ${c.name} (confidence ${c.confidence}/5) — a conservative posture funds proven channels only.`);
    }
    if (lv.risk === "aggressive" && c.status === "Paused") {
      c.status = "Testing";
      log.push(`Re-opened ${c.name} as a test — an aggressive posture funds upside bets.`);
    }
  }

  if (lv.goal === "retention" && !wb.channels.some((c) => /retention|lifecycle|referral/i.test(`${c.role} ${c.name}`))) {
    const cacs = wb.channels.map((c) => c.cac).filter((n) => n > 0);
    const minCac = cacs.length ? Math.min(...cacs) : 250;
    wb.channels.push({ id: uniqueId("lifecycle-email-referrals", new Set(wb.channels.map((c) => c.id))), name: "Lifecycle email & referrals", role: "Retention (post-signup)", budget: 0, cac: Math.max(50, round50(minCac * 0.6)), confidence: 3, status: "Testing" });
    log.push("Added Lifecycle email & referrals — the retention goal needs a post-signup channel.");
  }

  const before = new Map(wb.channels.map((c) => [c.id, c.budget]));
  const weights = wb.channels.map((c) => {
    if (c.status === "Paused" || c.status === "Cut") return 0;
    let w = Math.max(c.budget, 250);
    if (lv.risk === "conservative") w *= c.confidence / 3;
    if (lv.risk === "aggressive") w *= c.status === "Scaling" ? 1.25 : 1 + (5 - c.confidence) * 0.15;
    if (GOAL_ROLE[lv.goal].test(c.role)) w *= 1.35;
    return w;
  });
  allocateBudget(lv.budget, weights).forEach((b, i) => {
    wb.channels[i]!.budget = b;
  });
  wb.levers = lv;

  const head: string[] = [];
  if (lv.budget !== fromLevers.budget) head.push(`Monthly budget ${fmtMoney(fromLevers.budget)} → ${fmtMoney(lv.budget)}.`);
  if (lv.risk !== fromLevers.risk) head.push(`Risk appetite ${fromLevers.risk} → ${lv.risk}.`);
  if (lv.goal !== fromLevers.goal) {
    const ns = NORTH_STAR_BY_GOAL[lv.goal](lv.budget);
    const slot = wb.kpis.find((k) => k.key === "northStar");
    if (slot) Object.assign(slot, { metric: ns.metric, target: ns.target, current: "", health: "on-track" });
    head.push(`Primary goal ${goalLabel(fromLevers.goal)} → ${goalLabel(lv.goal)}; North Star is now “${ns.metric}”.`);
  }
  wb.channels
    .map((c) => ({ c, d: c.budget - (before.get(c.id) ?? 0) }))
    .filter((x) => x.d !== 0)
    .sort((a, b) => Math.abs(b.d) - Math.abs(a.d))
    .slice(0, 3)
    .forEach(({ c }) => log.push(`${c.name}: ${fmtMoney(before.get(c.id) ?? 0)} → ${fmtMoney(c.budget)}/mo.`));

  const weakest = weakestChannel(wb.channels);
  if (weakest) {
    const base = `${weakest.name} is the weakest funded channel (confidence ${weakest.confidence}/5, CAC ${fmtMoney(weakest.cac)}). Cut it if CAC exceeds ${fmtMoney(weakest.cac * 1.5)} after ${fmtMoney(Math.max(weakest.budget, weakest.cac * 2))} of spend, and move the budget to the strongest Scaling channel.`;
    const context = answers
      ? [answers.changed?.trim() && `Since the last version: ${answers.changed.trim().replace(/\.$/, "")}.`, answers.constraint?.trim() && `New constraint: ${answers.constraint.trim().replace(/\.$/, "")}.`].filter(Boolean).join(" ")
      : "";
    wb.narrative.cutFirst = context ? `${context} ${base}` : base;
  }

  const changeLog = [...head, ...log];
  if (!changeLog.length) changeLog.push("Levers unchanged — the board re-balanced the portfolio around current confidence scores.");
  return { workbench: wb, changeLog };
}

/** Elena's deterministic finance check on a re-plan. */
export function financeReview(wb: Workbench, prev: Workbench | null, ltv: number | null): { workbench: Workbench; changeLog: string[] } {
  const out = clone(wb);
  const log: string[] = [];
  for (const c of out.channels) {
    const p = prev?.channels.find((x) => x.id === c.id);
    if (p && p.budget > 0 && c.budget > p.budget * 1.5 && c.cac > 0) {
      const from = c.cac;
      c.cac = Math.round((c.cac * 1.15) / 10) * 10;
      log.push(`${c.name}: CAC ${fmtMoney(from)} → ${fmtMoney(c.cac)} — spend is up ${Math.round((c.budget / p.budget - 1) * 100)}%, so I priced in diminishing returns.`);
    }
  }
  const pf = computePortfolio(out, ltv);
  if (pf.blendedCac) log.push(`Blended CAC ${fmtMoney(pf.blendedCac)}${pf.blendedLtvCac ? `, LTV:CAC ${pf.blendedLtvCac.toFixed(1)}×` : ""} on ${fmtMoney(pf.allocated)}/mo.`);
  pf.rows
    .filter((r) => r.status === "Scaling" && r.ltvCac !== null && r.ltvCac < 3)
    .forEach((r) => log.push(`${r.name} is Scaling below 3× LTV:CAC (${r.ltvCac!.toFixed(1)}×) — watch payback.`));
  return { workbench: out, changeLog: log };
}

/* ------------------------------------------------------------------ */
/* Markdown (exports + prompts)                                        */
/* ------------------------------------------------------------------ */

const cell = (s: string) => (s || "").replace(/\|/g, "/").replace(/\n+/g, " ");

export function workbenchMarkdown(wb: Workbench, ltvInfo: LtvInfo | null, changeLog: string[] = []): string {
  const ltv = effectiveLtv(wb, ltvInfo);
  const pf = computePortfolio(wb, ltv);
  const x = (n: number | null) => (n == null ? "—" : `${n.toFixed(1)}×`);
  const out: string[] = [];

  out.push(`## Levers\n\n- **Monthly budget:** ${fmtMoney(wb.levers.budget)}\n- **Primary goal:** ${goalLabel(wb.levers.goal)}\n- **Risk appetite:** ${capitalize(wb.levers.risk)}\n- **LTV assumption:** ${ltv ? `${fmtMoney(ltv)}${wb.ltvOverride ? " (founder override)" : ltvInfo ? ` (from ${ltvInfo.source}: ${ltvInfo.basis})` : ""}` : "not set"}`);
  out.push(`## ${headingFor("positioning")}\n\n${wb.narrative.positioning}`);
  out.push(`## ${headingFor("icp")}\n\n${wb.narrative.icp.map((b) => `- ${b}`).join("\n")}`);
  out.push(`## ${headingFor("messaging-pillars")}\n\n${wb.narrative.pillars.map((b) => `- ${b}`).join("\n")}`);

  const rows = pf.rows.map((r) => `| ${cell(r.name)} | ${cell(r.role)} | ${fmtMoney(r.budget)} | ${r.share}% | ${fmtMoney(r.cac)} | ${fmtNum(r.volume)}/mo | ${x(r.ltvCac)} | ${r.confidence}/5 | ${r.status} |`);
  let warn = "";
  if (pf.overBy > 0) warn = `\n\n> ⚠ Channels total ${fmtMoney(pf.allocated)} — ${fmtMoney(pf.overBy)} over the ${fmtMoney(wb.levers.budget)} budget lever.`;
  else if (pf.unallocated > 0) warn = `\n\n> ${fmtMoney(pf.unallocated)} of the ${fmtMoney(wb.levers.budget)} budget lever is unallocated.`;
  out.push(
    `## Channel Portfolio\n\n| Channel | Role | Monthly $ | % of budget | CAC hyp. | Volume hyp. | LTV:CAC | Confidence | Status |\n| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |\n${rows.join("\n")}\n| **Total** | | **${fmtMoney(pf.allocated)}** | **${pf.shareSum}%** | ${fmtMoney(pf.blendedCac)} blended | ${fmtNum(pf.totalVolume)}/mo | ${x(pf.blendedLtvCac)} | | |${warn}`,
  );

  const chName = (id: string | null) => wb.channels.find((c) => c.id === id)?.name ?? "—";
  out.push(
    `## Experiment Backlog\n\n| Test | Status | Hypothesis | Cost | Success metric | Kill criterion | Channel |\n| --- | --- | --- | ---: | --- | --- | --- |\n${wb.experiments
      .map((e) => `| ${cell(e.test)} | ${e.status} | ${cell(e.hypothesis)} | ${fmtMoney(e.cost)} | ${cell(e.metric)} | ${cell(e.kill)} | ${cell(chName(e.channelId))} |`)
      .join("\n")}`,
  );

  out.push(
    `## Launch Sequence\n\n${wb.launch.phases
      .map((p) => {
        const tasks = wb.launch.tasks.filter((t) => t.phase === p.id).sort((a, b) => a.week - b.week);
        return `### ${p.label} · Weeks ${p.startWeek}–${p.endWeek}\n\n${tasks.length ? tasks.map((t) => `- **Week ${t.week}** — ${t.title} · _${ownerName(t.owner)}_`).join("\n") : "- _(no tasks)_"}`;
      })
      .join("\n\n")}`,
  );

  out.push(
    `## KPI Cadence\n\n| Slot | Metric | Target | Current | Health |\n| --- | --- | --- | --- | --- |\n${wb.kpis
      .map((k) => `| ${KPI_SLOTS.find((s) => s.key === k.key)?.label} | ${cell(k.metric)} | ${cell(k.target) || "—"} | ${cell(k.current) || "—"} | ${HEALTH_STATES.find((h) => h.id === k.health)?.label} |`)
      .join("\n")}`,
  );
  out.push(`## ${headingFor("cut-first")}\n\n${wb.narrative.cutFirst}`);
  if (changeLog.length) out.push(`## What the board changed\n\n${changeLog.map((c) => `- ${c}`).join("\n")}`);
  return out.join("\n\n");
}

/* ------------------------------------------------------------------ */
/* Prompts for live providers                                          */
/* ------------------------------------------------------------------ */

export interface RecalcPromptInput {
  framework: Framework;
  contextPacket: string;
  workbench: Workbench;
  fromLevers: Levers;
  levers: Levers;
  ltvInfo: LtvInfo | null;
  answers?: EvolveAnswers | null;
}

export function buildMarcusPrompt(input: RecalcPromptInput): { system: string; user: string } {
  const { framework, contextPacket, workbench, fromLevers, levers, ltvInfo, answers } = input;
  const interview = answers
    ? `\n\n=== FOUNDER'S EVOLUTION INTERVIEW (binding) ===\nWhat changed: ${answers.changed || "(no answer)"}\nWhat we learned: ${answers.learned || "(no answer)"}\nNew constraint: ${answers.constraint || "(no answer)"}\nEvery answer must visibly change the plan (budgets, statuses, experiments, launch tasks or KPIs). If the constraint states a budget, use it as Total monthly budget.`
    : "";
  const system = `You are Marcus Webb, Chief Marketing Officer on the startup's Board of Directors. You are re-planning the venture's living Marketing Plan from the founder's working copy.

${contextPacket}

=== CURRENT PLAN (founder's working copy, with experiment outcomes) ===
${workbenchMarkdown(workbench, ltvInfo)}

=== LEVERS ===
Previous: ${fmtMoney(fromLevers.budget)}/mo · goal ${goalLabel(fromLevers.goal)} · ${fromLevers.risk}
New: ${fmtMoney(levers.budget)}/mo · goal ${goalLabel(levers.goal)} · ${levers.risk}${interview}

=== RULES ===
- Channel monthly budgets must sum to exactly the Total monthly budget.
- Risk appetite: conservative = concentrate on confidence ≥ 4 channels and pause unproven ones; balanced = keep the portfolio shape; aggressive = fund upside tests and scale winners harder.
- The primary goal steers funnel roles and the North-star metric.
- Status is one of Testing, Scaling, Paused, Cut. Confidence is an integer 1–5. Monthly budget and Expected CAC are dollar numbers.
- Keep decided experiments with their [Won] / [Lost] / [Running] suffix in the Test cell; add new tests where the plan needs evidence.
- Launch Sequence: one row each for Pre-launch, Launch, Scale. Actions are "Wk N: task (Owner)" separated by semicolons; weeks are relative to start.
- KPI values read "metric (target X)" and are labelled North-star metric, Weekly review metric, Monthly review metric.
${framework.chairInstruction}

=== REQUIRED SECTIONS (exact ids, in order) ===
${describeSchema(framework.schema)}

=== OUTPUT CONTRACT ===
STRICT JSON only, no fences: { "title": string, "framework": "marketing-plan", "sections": [ ... ], "changeLog": [3–6 short strings, each naming one concrete change${answers ? " and quoting the founder answer it responds to" : ""}] }`;
  return { system, user: answers ? "Evolve the Marketing Plan using the founder's interview. Return strict JSON." : "Recalculate the Marketing Plan for the new levers. Return strict JSON." };
}

export function buildElenaPrompt(input: { framework: Framework; contextPacket: string; workbench: Workbench; ltvInfo: LtvInfo | null }): { system: string; user: string } {
  const ids = ["channel-portfolio", "budget-allocation"];
  const system = `You are Elena Vasquez, Chief Financial Officer on the startup's Board of Directors. Marcus has re-planned the Marketing Plan; audit the money.

${input.contextPacket}

=== MARCUS'S RE-PLAN ===
${workbenchMarkdown(input.workbench, input.ltvInfo)}

=== YOUR CHECKS ===
- CAC hypotheses must be realistic at the new spend (price in diminishing returns where a channel's budget jumps).
- Scaling channels should clear 3× LTV:CAC; flag the ones that do not.
- Channel budgets sum to the Total monthly budget (${fmtMoney(input.workbench.levers.budget)}); Budget Allocation percentages sum to 100%.
- Do not add or remove channels; adjust numbers only.

=== SECTIONS TO RETURN (only these) ===
${describeSchema(input.framework.schema.filter((s) => ids.includes(s.id)))}

=== OUTPUT CONTRACT ===
STRICT JSON only: { "sections": [ ...only ${ids.join(", ")}... ], "changeLog": [1–3 short strings] }`;
  return { system, user: "Audit the re-plan's channel economics. Return strict JSON." };
}
