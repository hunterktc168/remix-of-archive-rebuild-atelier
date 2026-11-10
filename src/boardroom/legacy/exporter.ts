/**
 * Framework-aware exports (Markdown + standalone HTML) for single deliverables and
 * the full venture. Pure string builders: no DOM, no IndexedDB.
 * Every export header carries a `framework` and `version` tag.
 */
import { escapeHtml, renderMarkdown } from "./markdown";
import { getFramework, frameworkLabel } from "./schemas";
import { sectionToMarkdown, type FrameworkSection, type MetricItem, type TableBody } from "./frameworkEngine";
import {
  workbenchFromDoc,
  workbenchMarkdown,
  computePortfolio,
  effectiveLtv,
  ltvFromFrameworks,
  fmtMoney,
  fmtNum,
  goalLabel,
  ownerName,
  KPI_SLOTS,
  HEALTH_STATES,
  type LtvInfo,
  type Workbench,
} from "./marketingWorkbench";

export interface ExportVersion {
  version: number;
  title: string;
  sections: FrameworkSection[];
  workbench?: Workbench | null;
  changeLog?: string[];
  createdAt?: number;
}
export interface ExportDeliverable {
  id: string;
  kind?: string;
  framework?: string;
  phase: string;
  title?: string;
  content?: string;
  sections?: FrameworkSection[];
  versions?: ExportVersion[];
  currentVersion?: number;
  workbench?: Workbench | null;
  changeLog?: string[];
  createdAt?: number;
}
export interface ExportMessage {
  author?: string;
  role?: string;
  text?: string;
  content?: string;
  timestamp?: number;
}
export interface ExportSession {
  ventureId?: string;
  phase?: string;
  messages?: ExportMessage[];
  transcript?: ExportMessage[];
}
export interface ExportOptions {
  ventureName?: string;
  /** Version to export (defaults to current). */
  version?: number;
  ltvInfo?: LtvInfo | null;
  /** ISO timestamp for the header (injectable for tests). */
  now?: string;
}

const PHASE_ORDER = ["ideation", "validation", "business-plan", "marketing"];
const PHASE_LABEL: Record<string, string> = { ideation: "Ideation", validation: "Validation", "business-plan": "Business Plan", marketing: "Marketing Strategy" };

const isFramework = (d: ExportDeliverable) => d.kind === "framework" && !!d.framework;

/** Stable tag for any deliverable: framework id, or a memo kind. */
export function exportTag(d: ExportDeliverable, version?: number): { framework: string; version: number } {
  if (isFramework(d)) return { framework: d.framework!, version: version ?? d.currentVersion ?? 1 };
  const memo = d.phase === "ideation" ? "idea-brief" : d.phase === "validation" ? "validation-report" : `${d.phase}-memo`;
  return { framework: memo, version: 1 };
}

export function deliverableLabel(d: ExportDeliverable): string {
  if (isFramework(d)) {
    const f = getFramework(d.framework!);
    return f ? frameworkLabel(f, d.phase) : d.framework!;
  }
  if (d.phase === "ideation") return "Idea Brief";
  if (d.phase === "validation") return "Validation Report";
  return `${PHASE_LABEL[d.phase] ?? d.phase} Memo`;
}

function pickVersion(d: ExportDeliverable, n?: number): ExportVersion {
  const vs = d.versions ?? [];
  const want = n ?? d.currentVersion;
  return (
    vs.find((v) => v.version === want) ??
    vs[vs.length - 1] ?? { version: d.currentVersion ?? 1, title: d.title ?? "", sections: d.sections ?? [], workbench: d.workbench ?? null, changeLog: d.changeLog ?? [] }
  );
}

function planWorkbench(d: ExportDeliverable, v: ExportVersion): Workbench {
  return v.workbench ?? workbenchFromDoc({ title: v.title, framework: "marketing-plan", sections: v.sections });
}

/* ------------------------------------------------------------------ */
/* Markdown                                                             */
/* ------------------------------------------------------------------ */

function frontMatter(fields: Record<string, string | number>): string {
  const esc = (s: string | number) => (typeof s === "number" ? String(s) : /[:#"'\n]/.test(s) ? JSON.stringify(s) : s);
  return `---\n${Object.entries(fields)
    .map(([k, v]) => `${k}: ${esc(v)}`)
    .join("\n")}\n---`;
}

const list = (b: unknown) => (Array.isArray(b) ? (b as string[]) : []);
const brList = (items: string[]) => items.map((x) => `• ${x.replace(/\|/g, "/")}`).join("<br>");

function swotMarkdown(sections: FrameworkSection[]): string {
  const s = (id: string) => list(sections.find((x) => x.id === id)?.body);
  return [
    "## SWOT Matrix",
    "",
    "| | Helpful | Harmful |",
    "| --- | --- | --- |",
    `| **Internal** | **Strengths**<br>${brList(s("strengths"))} | **Weaknesses**<br>${brList(s("weaknesses"))} |`,
    `| **External** | **Opportunities**<br>${brList(s("opportunities"))} | **Threats**<br>${brList(s("threats"))} |`,
    "",
    "## Strategic Implications",
    "",
    s("strategic-implications").map((x) => `- ${x}`).join("\n"),
  ].join("\n");
}

function canvasMarkdown(frameworkId: string, sections: FrameworkSection[]): string {
  const f = getFramework(frameworkId)!;
  return f.schema
    .map((sch, i) => {
      const sec = sections.find((x) => x.id === sch.id);
      return `## ${i + 1}. ${sch.heading}\n\n${sec ? sectionToMarkdown(sec) : "_(empty)_"}`;
    })
    .join("\n\n");
}

/** Body (no header) of a deliverable in its framework's natural shape. */
export function deliverableBodyMarkdown(d: ExportDeliverable, opts: ExportOptions = {}): string {
  if (!isFramework(d)) return (d.content ?? "").trim();
  const v = pickVersion(d, opts.version);
  const f = getFramework(d.framework!);
  if (!f) return "";
  if (f.renderMode === "matrix-2x2") return swotMarkdown(v.sections);
  if (f.renderMode === "canvas-grid") return canvasMarkdown(f.id, v.sections);
  return workbenchMarkdown(planWorkbench(d, v), opts.ltvInfo ?? null, v.changeLog ?? []);
}

export function deliverableMarkdown(d: ExportDeliverable, opts: ExportOptions = {}): string {
  const v = pickVersion(d, opts.version);
  const tag = exportTag(d, v.version);
  const title = isFramework(d) ? v.title : d.title || deliverableLabel(d);
  const header = frontMatter({
    framework: tag.framework,
    version: tag.version,
    ...(opts.ventureName ? { venture: opts.ventureName } : {}),
    phase: d.phase,
    exported: opts.now ?? new Date().toISOString(),
  });
  let body = deliverableBodyMarkdown(d, opts);
  // Memos usually start with their own H1; avoid a duplicate title.
  if (!isFramework(d)) body = body.replace(/^#\s+.*\n+/, "");
  return `${header}\n\n# ${title}\n\n${body}\n`;
}

/* ------------------------------------------------------------------ */
/* HTML                                                                 */
/* ------------------------------------------------------------------ */

const EXPORT_CSS = `
:root { --ink:#1b2230; --muted:#5b6474; --line:#d9dde4; --brass:#9a7a1f; --soft:#f6f4ee; --ok:#1f7a55; --warn:#a86a07; --bad:#b4372b; }
* { box-sizing: border-box; }
body { margin: 0; font: 14px/1.55 Georgia, "Times New Roman", serif; color: var(--ink); background: #fff; }
main { max-width: 1080px; margin: 0 auto; padding: 40px 32px 64px; }
h1 { font-size: 30px; margin: 0 0 6px; font-weight: normal; }
h2 { font-size: 19px; margin: 28px 0 10px; border-bottom: 1px solid var(--line); padding-bottom: 4px; font-weight: normal; }
h3 { font-size: 15px; margin: 18px 0 6px; }
p, li { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; font-size: 13px; }
ul { padding-left: 18px; margin: 4px 0; }
.tags { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 18px; font: 11px/1 ui-monospace, Menlo, monospace; }
.tags span { border: 1px solid var(--line); border-radius: 4px; padding: 4px 6px; color: var(--muted); }
.tags b { color: var(--ink); font-weight: 600; }
table { width: 100%; border-collapse: collapse; margin: 8px 0 14px; font: 12px/1.4 -apple-system, "Segoe UI", Roboto, sans-serif; }
th, td { border: 1px solid var(--line); padding: 6px 8px; text-align: left; vertical-align: top; }
th { background: var(--soft); font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); }
td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
tfoot td { font-weight: 600; background: var(--soft); }
.box { border: 1px solid var(--line); border-radius: 8px; padding: 10px 12px; break-inside: avoid; }
.box h4 { margin: 0 0 6px; font: 600 11px/1.2 -apple-system, "Segoe UI", sans-serif; text-transform: uppercase; letter-spacing: .06em; color: var(--brass); }
.canvas { display: grid; gap: 8px; grid-template-columns: repeat(10, minmax(0, 1fr)); }
.canvas-lean { grid-template-areas: "problem problem solution solution uvp uvp advantage advantage segments segments" "problem problem metrics metrics uvp uvp channels channels segments segments" "cost cost cost cost cost revenue revenue revenue revenue revenue"; }
.canvas-bmc { grid-template-areas: "partners partners activities activities value value relationships relationships segments segments" "partners partners resources resources value value channels channels segments segments" "cost cost cost cost cost revenue revenue revenue revenue revenue" "notes notes notes notes notes notes notes notes notes notes"; }
.swot { display: grid; grid-template-columns: auto 1fr 1fr; gap: 8px; align-items: stretch; }
.swot .axis { font: 600 10px/1 ui-monospace, Menlo, monospace; text-transform: uppercase; color: var(--muted); display: flex; align-items: center; justify-content: center; }
.swot .axis.v { writing-mode: vertical-rl; transform: rotate(180deg); }
.q-s h4 { color: var(--ok); } .q-w h4 { color: var(--warn); } .q-o h4 { color: #2f6ea8; } .q-t h4 { color: var(--bad); }
.implications { margin-top: 10px; border-color: var(--brass); background: var(--soft); }
.warn { color: var(--bad); font-weight: 600; }
.timeline { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.timeline .box h4 { color: var(--ink); }
.dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 6px; vertical-align: middle; }
.dot.on-track { background: var(--ok); } .dot.at-risk { background: var(--warn); } .dot.off-track { background: var(--bad); }
.memo pre { white-space: pre-wrap; }
.part { break-before: page; }
.part:first-of-type { break-before: auto; }
@media print {
  main { padding: 0; max-width: none; }
  h2, h3 { break-after: avoid; }
  table { break-inside: auto; }
  tr, .box { break-inside: avoid; }
  thead { display: table-header-group; }
}
`;

function inlineHtml(s: string): string {
  return escapeHtml(s)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])_([^_]+)_(?=[\s.,;)]|$)/g, "$1<em>$2</em>");
}
const ulHtml = (items: string[]) => (items.length ? `<ul>${items.map((x) => `<li>${inlineHtml(x)}</li>`).join("")}</ul>` : "<p><em>(empty)</em></p>");

function sectionHtml(s: FrameworkSection): string {
  const b = s.body;
  if (typeof b === "string") return `<p>${inlineHtml(b)}</p>`;
  if (s.kind === "table" && !Array.isArray(b)) {
    const t = b as TableBody;
    return `<table><thead><tr>${t.columns.map((c) => `<th>${escapeHtml(c)}</th>`).join("")}</tr></thead><tbody>${t.rows.map((r) => `<tr>${r.map((c) => `<td>${inlineHtml(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  }
  if (s.kind === "metrics") return ulHtml((b as MetricItem[]).map((m) => `**${m.label}:** ${m.value}${m.note ? ` (${m.note})` : ""}`));
  return ulHtml(b as string[]);
}

function canvasHtml(frameworkId: string, sections: FrameworkSection[]): string {
  const f = getFramework(frameworkId)!;
  const cls = frameworkId === "lean-canvas" ? "canvas-lean" : "canvas-bmc";
  return `<div class="canvas ${cls}">${f.schema
    .map((sch, i) => {
      const sec = sections.find((x) => x.id === sch.id);
      return `<div class="box" style="grid-area:${sch.area}"><h4>${frameworkId === "lean-canvas" ? `${i + 1}. ` : ""}${escapeHtml(sch.heading)}</h4>${ulHtml(list(sec?.body))}</div>`;
    })
    .join("")}</div>`;
}

function swotHtml(sections: FrameworkSection[]): string {
  const q = (id: string, heading: string, cls: string) => `<div class="box ${cls}"><h4>${heading}</h4>${ulHtml(list(sections.find((x) => x.id === id)?.body))}</div>`;
  return `<div class="swot">
    <div></div><div class="axis">Helpful</div><div class="axis">Harmful</div>
    <div class="axis v">Internal</div>${q("strengths", "Strengths", "q-s")}${q("weaknesses", "Weaknesses", "q-w")}
    <div class="axis v">External</div>${q("opportunities", "Opportunities", "q-o")}${q("threats", "Threats", "q-t")}
  </div>
  <div class="box implications"><h4>Strategic Implications</h4>${ulHtml(list(sections.find((x) => x.id === "strategic-implications")?.body))}</div>`;
}

function planHtml(wb: Workbench, ltvInfo: LtvInfo | null, changeLog: string[]): string {
  const ltv = effectiveLtv(wb, ltvInfo);
  const pf = computePortfolio(wb, ltv);
  const x = (n: number | null) => (n == null ? "—" : `${n.toFixed(1)}×`);
  const chName = (id: string | null) => wb.channels.find((c) => c.id === id)?.name ?? "—";
  const warn = pf.overBy > 0 ? `<p class="warn">Channels total ${fmtMoney(pf.allocated)} — ${fmtMoney(pf.overBy)} over the ${fmtMoney(wb.levers.budget)} budget lever.</p>` : "";
  return `
  <h2>Levers</h2>
  <table><tbody>
    <tr><th>Monthly budget</th><td class="num">${fmtMoney(wb.levers.budget)}</td><th>Primary goal</th><td>${escapeHtml(goalLabel(wb.levers.goal))}</td><th>Risk appetite</th><td>${escapeHtml(wb.levers.risk)}</td><th>LTV</th><td class="num">${fmtMoney(ltv)}</td></tr>
  </tbody></table>
  <h2>Positioning Statement</h2><p>${inlineHtml(wb.narrative.positioning)}</p>
  <h2>ICP &amp; Segments</h2>${ulHtml(wb.narrative.icp)}
  <h2>Messaging Pillars</h2>${ulHtml(wb.narrative.pillars)}
  <h2>Channel Portfolio</h2>
  <table>
    <thead><tr><th>Channel</th><th>Role</th><th class="num">Monthly $</th><th class="num">% of budget</th><th class="num">CAC hyp.</th><th class="num">Volume hyp.</th><th class="num">LTV:CAC</th><th class="num">Confidence</th><th>Status</th></tr></thead>
    <tbody>${pf.rows
      .map((r) => `<tr><td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.role)}</td><td class="num">${fmtMoney(r.budget)}</td><td class="num">${r.share}%</td><td class="num">${fmtMoney(r.cac)}</td><td class="num">${fmtNum(r.volume)}/mo</td><td class="num">${x(r.ltvCac)}</td><td class="num">${r.confidence}/5</td><td>${r.status}</td></tr>`)
      .join("")}</tbody>
    <tfoot><tr><td>Total</td><td></td><td class="num">${fmtMoney(pf.allocated)}</td><td class="num">${pf.shareSum}%</td><td class="num">${fmtMoney(pf.blendedCac)}</td><td class="num">${fmtNum(pf.totalVolume)}/mo</td><td class="num">${x(pf.blendedLtvCac)}</td><td></td><td></td></tr></tfoot>
  </table>${warn}
  <h2>Experiment Backlog</h2>
  <table>
    <thead><tr><th>Test</th><th>Status</th><th>Hypothesis</th><th class="num">Cost</th><th>Success metric</th><th>Kill criterion</th><th>Channel</th></tr></thead>
    <tbody>${wb.experiments
      .map((e) => `<tr><td>${escapeHtml(e.test)}</td><td>${e.status}</td><td>${escapeHtml(e.hypothesis)}</td><td class="num">${fmtMoney(e.cost)}</td><td>${escapeHtml(e.metric)}</td><td>${escapeHtml(e.kill)}</td><td>${escapeHtml(chName(e.channelId))}</td></tr>`)
      .join("")}</tbody>
  </table>
  <h2>Launch Sequence</h2>
  <div class="timeline">${wb.launch.phases
    .map((p) => {
      const tasks = wb.launch.tasks.filter((t) => t.phase === p.id).sort((a, b) => a.week - b.week);
      return `<div class="box"><h4>${escapeHtml(p.label)} · Weeks ${p.startWeek}–${p.endWeek}</h4>${ulHtml(tasks.map((t) => `**Week ${t.week}** — ${t.title} · _${ownerName(t.owner)}_`))}</div>`;
    })
    .join("")}</div>
  <h2>KPI Cadence</h2>
  <table>
    <thead><tr><th>Slot</th><th>Metric</th><th>Target</th><th>Current</th><th>Health</th></tr></thead>
    <tbody>${wb.kpis
      .map((k) => `<tr><td>${KPI_SLOTS.find((s) => s.key === k.key)?.label}</td><td>${escapeHtml(k.metric)}</td><td>${escapeHtml(k.target || "—")}</td><td>${escapeHtml(k.current || "—")}</td><td><span class="dot ${k.health}"></span>${HEALTH_STATES.find((h) => h.id === k.health)?.label}</td></tr>`)
      .join("")}</tbody>
  </table>
  <h2>What We Would Cut First</h2><p>${inlineHtml(wb.narrative.cutFirst)}</p>
  ${changeLog.length ? `<h2>What the board changed</h2>${ulHtml(changeLog)}` : ""}`;
}

export function deliverableBodyHtml(d: ExportDeliverable, opts: ExportOptions = {}): string {
  if (!isFramework(d)) return `<div class="memo">${renderMarkdown((d.content ?? "").replace(/^#\s+.*\n+/, ""))}</div>`;
  const v = pickVersion(d, opts.version);
  const f = getFramework(d.framework!);
  if (!f) return "";
  if (f.renderMode === "matrix-2x2") return swotHtml(v.sections);
  if (f.renderMode === "canvas-grid") return canvasHtml(f.id, v.sections);
  return planHtml(planWorkbench(d, v), opts.ltvInfo ?? null, v.changeLog ?? []);
}

function tagsHtml(fields: Record<string, string | number>): string {
  return `<div class="tags">${Object.entries(fields)
    .map(([k, v]) => `<span>${escapeHtml(k)}: <b>${escapeHtml(String(v))}</b></span>`)
    .join("")}</div>`;
}

function htmlDocument(title: string, metas: Record<string, string | number>, inner: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
${Object.entries(metas)
  .map(([k, v]) => `<meta name="boardroom:${escapeHtml(k)}" content="${escapeHtml(String(v))}">`)
  .join("\n")}
<style>${EXPORT_CSS}</style>
</head>
<body><main>
${inner}
</main></body>
</html>
`;
}

export function deliverableHtml(d: ExportDeliverable, opts: ExportOptions = {}): string {
  const v = pickVersion(d, opts.version);
  const tag = exportTag(d, v.version);
  const title = isFramework(d) ? v.title : d.title || deliverableLabel(d);
  const fields = { framework: tag.framework, version: tag.version, ...(opts.ventureName ? { venture: opts.ventureName } : {}), phase: d.phase, exported: opts.now ?? new Date().toISOString() };
  return htmlDocument(title, { framework: tag.framework, version: tag.version }, `<header><h1>${escapeHtml(title)}</h1>${tagsHtml(fields)}</header>\n${deliverableBodyHtml(d, opts)}`);
}

/* ------------------------------------------------------------------ */
/* Full venture                                                         */
/* ------------------------------------------------------------------ */

/**
 * Sensible reading order: Idea Brief → Validation Report → SWOT → Lean Canvas →
 * Business Blueprint → Marketing Plan → SWOT (marketing lens) → any other memos.
 */
export function orderVentureDeliverables(deliverables: ExportDeliverable[]): ExportDeliverable[] {
  const rank = (d: ExportDeliverable): number => {
    if (!isFramework(d)) return d.phase === "ideation" ? 0 : d.phase === "validation" ? 1 : 10 + PHASE_ORDER.indexOf(d.phase);
    if (d.framework === "swot") return d.phase === "marketing" ? 6 : 2;
    return { "lean-canvas": 3, "business-blueprint": 4, "marketing-plan": 5 }[d.framework!] ?? 9;
  };
  return [...deliverables].sort((a, b) => rank(a) - rank(b) || (a.createdAt ?? 0) - (b.createdAt ?? 0));
}

function transcriptByPhase(sessions: ExportSession[]): { phase: string; messages: ExportMessage[] }[] {
  return PHASE_ORDER.map((phase) => {
    const msgs = sessions.filter((s) => s.phase === phase).flatMap((s) => s.messages ?? s.transcript ?? []);
    msgs.sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
    return { phase, messages: msgs.filter((m) => (m.text ?? m.content ?? "").trim()) };
  }).filter((g) => g.messages.length);
}

const when = (ts?: number) => (ts ? new Date(ts).toISOString().replace("T", " ").slice(0, 16) : "");

export interface VentureLike {
  name?: string;
  oneliner?: string;
  thesis?: string;
}

export function ventureMarkdown(venture: VentureLike, deliverables: ExportDeliverable[], sessions: ExportSession[], opts: { now?: string } = {}): string {
  const ordered = orderVentureDeliverables(deliverables);
  const ltvInfo = ltvFromFrameworks(deliverables.filter(isFramework).map((d) => ({ framework: d.framework, sections: pickVersion(d).sections, currentVersion: d.currentVersion })));
  const contents = ordered.map((d) => {
    const t = exportTag(d);
    return `${t.framework}@v${t.version}`;
  });
  const header = frontMatter({ framework: "full-venture", version: 1, venture: venture.name ?? "Venture", contents: contents.join(", "), exported: opts.now ?? new Date().toISOString() });
  const parts = ordered.map((d) => {
    const t = exportTag(d);
    const v = pickVersion(d);
    const title = isFramework(d) ? v.title : d.title || deliverableLabel(d);
    let body = deliverableBodyMarkdown(d, { ltvInfo });
    if (!isFramework(d)) body = body.replace(/^#\s+.*\n+/, "");
    // Demote the deliverable's own headings one level under its part heading.
    body = body.replace(/^(#{1,5})\s/gm, "#$1 ");
    return `# ${deliverableLabel(d)}: ${title}\n\n> framework: \`${t.framework}\` · version: \`${t.version}\` · phase: ${PHASE_LABEL[d.phase] ?? d.phase}\n\n${body}`;
  });
  const groups = transcriptByPhase(sessions);
  const appendix = groups.length
    ? `# Appendix — Board Transcripts\n\n${groups
        .map((g) => `## ${PHASE_LABEL[g.phase] ?? g.phase}\n\n${g.messages.map((m) => `**${m.author ?? m.role ?? "Board"}**${m.timestamp ? ` · ${when(m.timestamp)}` : ""}\n\n${(m.text ?? m.content ?? "").trim()}`).join("\n\n---\n\n")}`)
        .join("\n\n")}`
    : "";
  const intro = `# ${venture.name ?? "Venture"} — Full Venture Export${venture.oneliner || venture.thesis ? `\n\n_${venture.oneliner || venture.thesis}_` : ""}\n\n**Contents:** ${ordered.map((d) => deliverableLabel(d)).join(" → ") || "none yet"}${appendix ? " · Transcripts appendix" : ""}`;
  return `${header}\n\n${[intro, ...parts, appendix].filter(Boolean).join("\n\n")}\n`;
}

export function ventureHtml(venture: VentureLike, deliverables: ExportDeliverable[], sessions: ExportSession[], opts: { now?: string } = {}): string {
  const ordered = orderVentureDeliverables(deliverables);
  const ltvInfo = ltvFromFrameworks(deliverables.filter(isFramework).map((d) => ({ framework: d.framework, sections: pickVersion(d).sections, currentVersion: d.currentVersion })));
  const name = venture.name ?? "Venture";
  const parts = ordered.map((d) => {
    const t = exportTag(d);
    const v = pickVersion(d);
    const title = isFramework(d) ? v.title : d.title || deliverableLabel(d);
    return `<section class="part"><h1>${escapeHtml(deliverableLabel(d))}: ${escapeHtml(title)}</h1>${tagsHtml({ framework: t.framework, version: t.version, phase: PHASE_LABEL[d.phase] ?? d.phase })}${deliverableBodyHtml(d, { ltvInfo })}</section>`;
  });
  const groups = transcriptByPhase(sessions);
  const appendix = groups.length
    ? `<section class="part"><h1>Appendix — Board Transcripts</h1>${groups
        .map((g) => `<h2>${escapeHtml(PHASE_LABEL[g.phase] ?? g.phase)}</h2>${g.messages.map((m) => `<h3>${escapeHtml(m.author ?? m.role ?? "Board")}${m.timestamp ? ` <small>· ${when(m.timestamp)}</small>` : ""}</h3>${renderMarkdown((m.text ?? m.content ?? "").trim())}`).join("")}`)
        .join("")}</section>`
    : "";
  const contents = ordered.map((d) => `${exportTag(d).framework}@v${exportTag(d).version}`).join(", ");
  const head = `<header><h1>${escapeHtml(name)} — Full Venture Export</h1>${tagsHtml({ framework: "full-venture", version: 1, contents: contents || "none", exported: opts.now ?? new Date().toISOString() })}</header>`;
  return htmlDocument(`${name} — Full Venture Export`, { framework: "full-venture", version: 1 }, `${head}\n${parts.join("\n")}\n${appendix}`);
}

export function exportSlug(ventureName: string | undefined, suffix: string): string {
  return `${(ventureName || "venture").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${suffix}`;
}
