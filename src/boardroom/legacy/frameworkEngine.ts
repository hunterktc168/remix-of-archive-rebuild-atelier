/**
 * Framework synthesis engine: prompt building, strict-JSON parsing, validation,
 * targeted repair and markdown export for framework deliverables.
 * Pure functions only (no IndexedDB, no network) so the rules are unit-testable.
 */
import { getFramework, frameworkLabel, type Framework, type SectionKind, type SectionSchema } from "./schemas";

export interface TableBody {
  columns: string[];
  rows: string[][];
}
export interface MetricItem {
  label: string;
  value: string;
  note?: string;
}
export type SectionBody = string | string[] | TableBody | MetricItem[];

export interface FrameworkSection {
  id: string;
  heading: string;
  kind: SectionKind;
  body: SectionBody;
}

export interface FrameworkDoc {
  title: string;
  framework: string;
  sections: FrameworkSection[];
}

export interface Issue {
  sectionId: string;
  problem: string;
}

export interface ValidationResult {
  /** Best-effort document: valid sections kept, broken ones present but flagged. */
  doc: FrameworkDoc;
  /** Blocking problems; each names a section the repair pass must regenerate. */
  issues: Issue[];
  /** Non-blocking quality notes (e.g. missing citation). */
  warnings: Issue[];
  /** True when the output could not be parsed as JSON at all. */
  unparseable: boolean;
}

/* ------------------------------------------------------------------ */
/* JSON extraction                                                     */
/* ------------------------------------------------------------------ */

/** Pull the first JSON object out of model text (tolerates code fences and chatter). */
export function extractJson(text: string): unknown {
  if (!text) return null;
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) t = fence[1].trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  const candidate = t.slice(start, end + 1);
  try {
    return JSON.parse(candidate);
  } catch {
    // Common model slip: trailing commas.
    try {
      return JSON.parse(candidate.replace(/,\s*([}\]])/g, "$1"));
    } catch {
      return null;
    }
  }
}

/* ------------------------------------------------------------------ */
/* Value helpers                                                       */
/* ------------------------------------------------------------------ */

/** "$2,500", "2500", "$2.5k" -> 2500. Returns null when no number is present. */
export function parseMoney(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const m = value.replace(/,/g, "").match(/(-?\d+(?:\.\d+)?)\s*([kKmM])?/);
  if (!m?.[1]) return null;
  let n = parseFloat(m[1]);
  if (m[2]?.toLowerCase() === "k") n *= 1_000;
  if (m[2]?.toLowerCase() === "m") n *= 1_000_000;
  return n;
}

export function parsePercent(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value !== "string" || !value.includes("%")) return null;
  const m = value.match(/(-?\d+(?:\.\d+)?)\s*%/);
  return m?.[1] ? parseFloat(m[1]) : null;
}

const CITATION_RE = /(?:_[^_]+_|\*[^*]+\*)\s*\.?\s*$/;

export function stripCitation(bullet: string): string {
  return bullet.replace(CITATION_RE, "").replace(/[\s—–-]+$/, "").trim();
}

export function hasCitation(bullet: string): boolean {
  return CITATION_RE.test(bullet.trim());
}

const GENERIC_PATTERNS: RegExp[] = [
  /\b(strong|great|experienced|passionate|talented|dedicated|good)\s+(team|founders?|leadership|management)\b/i,
  /\b(growing|large|huge|big|expanding)\s+market\b/i,
  /\b(innovative|unique|great|good|quality|superior)\s+(product|solution|technology|idea)\b/i,
  /\bfirst[- ]mover\b/i,
  /\b(brand awareness|customer loyalty|economic downturn|recession|new regulations?|new competitors?)\b/i,
  /\b(lack of|limited)\s+(funding|resources|capital|experience|brand)\b/i,
  /^(competition|competitors|regulation|funding|technology|marketing|pricing)\.?$/i,
];

/**
 * A SWOT bullet is generic when it is too short to be falsifiable, or when it is a
 * stock phrase ("strong team", "growing market") without naming a specific capability,
 * number or mechanism.
 */
export function isGenericBullet(bullet: string): boolean {
  const core = stripCitation(bullet);
  const words = core.split(/\s+/).filter(Boolean);
  if (words.length < 5) return true;
  const specific = /\d|%|\$|because|via|through|within|by\s|vs\.?|versus|named|only\s/i.test(core);
  if (!specific && GENERIC_PATTERNS.some((re) => re.test(core)) && words.length < 14) return true;
  return false;
}

/* ------------------------------------------------------------------ */
/* Normalisation                                                       */
/* ------------------------------------------------------------------ */

function asString(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return "";
}

function normalizeBullets(body: unknown): string[] | null {
  if (Array.isArray(body)) {
    const out = body
      .map((b) => (typeof b === "object" && b !== null ? asString((b as Record<string, unknown>)["text"] ?? Object.values(b).join(" — ")) : asString(b)))
      .map((s) => s.replace(/^[-*•]\s*/, ""))
      .filter(Boolean);
    return out;
  }
  if (typeof body === "string") {
    return body
      .split(/\n+/)
      .map((s) => s.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
      .filter(Boolean);
  }
  return null;
}

function normalizeTable(body: unknown, schema: SectionSchema): TableBody | null {
  const columns = schema.columns ?? [];
  if (!body || typeof body !== "object") return null;
  const raw = body as Record<string, unknown>;
  let rows: unknown[] | null = null;
  if (Array.isArray(raw["rows"])) rows = raw["rows"] as unknown[];
  else if (Array.isArray(body)) rows = body as unknown[];
  if (!rows) return null;
  const normRows = rows.map((r) => {
    if (Array.isArray(r)) return columns.map((_, i) => asString(r[i]));
    if (r && typeof r === "object") {
      const obj = r as Record<string, unknown>;
      const keys = Object.keys(obj);
      return columns.map((col, i) => {
        const key = keys.find((k) => k.toLowerCase().replace(/[^a-z]/g, "") === col.toLowerCase().replace(/[^a-z]/g, ""));
        return asString(key ? obj[key] : obj[keys[i] ?? ""]);
      });
    }
    return columns.map(() => "");
  });
  return { columns, rows: normRows };
}

function normalizeMetrics(body: unknown): MetricItem[] | null {
  if (Array.isArray(body)) {
    return body
      .map((m) => {
        if (m && typeof m === "object") {
          const o = m as Record<string, unknown>;
          const item: MetricItem = { label: asString(o["label"] ?? o["name"] ?? o["metric"]), value: asString(o["value"] ?? o["target"]) };
          const note = asString(o["note"]);
          if (note) item.note = note;
          return item;
        }
        const s = asString(m);
        const [label, ...rest] = s.split(/[:|]/);
        return { label: (label ?? "").trim(), value: rest.join(":").trim() };
      })
      .filter((m) => m.label || m.value);
  }
  if (body && typeof body === "object") {
    return Object.entries(body as Record<string, unknown>).map(([label, value]) => ({ label, value: asString(value) }));
  }
  return null;
}

function normalizeBody(kind: SectionKind, body: unknown, schema: SectionSchema): SectionBody | null {
  switch (kind) {
    case "prose": {
      if (Array.isArray(body)) return body.map(asString).join(" ").trim() || null;
      return asString(body) || null;
    }
    case "bullets":
      return normalizeBullets(body);
    case "table":
      return normalizeTable(body, schema);
    case "metrics":
      return normalizeMetrics(body);
  }
}

function emptyBody(kind: SectionKind, schema: SectionSchema): SectionBody {
  if (kind === "prose") return "";
  if (kind === "table") return { columns: schema.columns ?? [], rows: [] };
  return [];
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

function itemCount(section: FrameworkSection): number {
  const b = section.body;
  if (typeof b === "string") return b.trim() ? 1 : 0;
  if (Array.isArray(b)) return b.length;
  return b.rows.length;
}

function validateSection(framework: Framework, schema: SectionSchema, section: FrameworkSection, issues: Issue[], warnings: Issue[]) {
  const count = itemCount(section);
  const id = schema.id;
  if (count === 0) {
    issues.push({ sectionId: id, problem: `${schema.heading} is empty.` });
    return;
  }
  if (schema.minItems && count < schema.minItems) {
    issues.push({ sectionId: id, problem: `${schema.heading} needs at least ${schema.minItems} items (has ${count}).` });
  }
  if (schema.maxItems && count > schema.maxItems) {
    issues.push({ sectionId: id, problem: `${schema.heading} allows at most ${schema.maxItems} items (has ${count}).` });
  }

  // Framework-specific rules
  if (framework.id === "swot" && Array.isArray(section.body)) {
    const bullets = section.body as string[];
    const generic = bullets.filter((b) => isGenericBullet(b));
    if (generic.length) {
      issues.push({ sectionId: id, problem: `Generic entries rejected: ${generic.map((g) => `"${stripCitation(g)}"`).join(", ")}. Name the specific capability, number or mechanism.` });
    }
    const uncited = bullets.filter((b) => !hasCitation(b));
    if (uncited.length && id !== "strategic-implications") {
      warnings.push({ sectionId: id, problem: `${uncited.length} bullet(s) lack an italic board-member citation.` });
    }
  }

  if (framework.id === "lean-canvas" && id === "revenue-streams" && Array.isArray(section.body)) {
    const text = (section.body as string[]).join(" ");
    if (!/\$\s?\d|\d+\s?(usd|eur|€|£)|\d+\s?\/\s?(mo|month|yr|year|seat|user)/i.test(text)) {
      issues.push({ sectionId: id, problem: "Revenue Streams must state a concrete price." });
    }
    if (!/\bLTV\b|lifetime value/i.test(text)) {
      issues.push({ sectionId: id, problem: "Revenue Streams must state an LTV assumption." });
    }
  }

  if (framework.id === "marketing-plan" && id === "channel-portfolio" && !Array.isArray(section.body) && typeof section.body !== "string") {
    const table = section.body;
    const budgetIdx = table.columns.indexOf("Monthly budget");
    const cacIdx = table.columns.indexOf("Expected CAC");
    const bad = table.rows.filter((r) => parseMoney(r[budgetIdx]) === null || parseMoney(r[cacIdx]) === null);
    if (bad.length) {
      issues.push({ sectionId: id, problem: `Every channel needs a numeric Monthly budget and Expected CAC (${bad.map((r) => r[0] || "unnamed").join(", ")} missing).` });
    }
  }

  if (framework.id === "marketing-plan" && id === "budget-allocation" && Array.isArray(section.body)) {
    const items = section.body as MetricItem[];
    const total = items.find((m) => /total/i.test(m.label));
    if (!total || parseMoney(total.value) === null) {
      issues.push({ sectionId: id, problem: "Budget Allocation must start with a numeric 'Total monthly budget'." });
    }
    const pcts = items.filter((m) => !/total/i.test(m.label)).map((m) => parsePercent(m.value));
    if (pcts.some((p) => p === null)) {
      issues.push({ sectionId: id, problem: "Every channel split must be a percentage." });
    } else {
      const sum = (pcts as number[]).reduce((a, b) => a + b, 0);
      if (Math.abs(sum - 100) > 1) issues.push({ sectionId: id, problem: `Channel splits sum to ${sum}%, not 100%.` });
    }
  }
}

/**
 * Validate model output against a framework schema. Accepts raw text or a parsed object.
 * Sections are re-ordered to the schema order; unknown sections are dropped.
 */
export function validateFrameworkOutput(input: unknown, framework: Framework, phase = framework.phase): ValidationResult {
  const parsed = typeof input === "string" ? extractJson(input) : input;
  const issues: Issue[] = [];
  const warnings: Issue[] = [];
  const unparseable = !parsed || typeof parsed !== "object";
  const obj = (unparseable ? {} : parsed) as Record<string, unknown>;
  const rawSections = Array.isArray(obj["sections"]) ? (obj["sections"] as Record<string, unknown>[]) : [];

  const sections: FrameworkSection[] = framework.schema.map((schema) => {
    const raw = rawSections.find((s) => s && (s["id"] === schema.id || asString(s["heading"]).toLowerCase() === schema.heading.toLowerCase()));
    if (!raw) {
      issues.push({ sectionId: schema.id, problem: `Missing section "${schema.heading}".` });
      return { id: schema.id, heading: schema.heading, kind: schema.kind, body: emptyBody(schema.kind, schema) };
    }
    const body = normalizeBody(schema.kind, raw["body"], schema);
    if (body === null) {
      issues.push({ sectionId: schema.id, problem: `${schema.heading} is malformed (expected ${schema.kind}).` });
      return { id: schema.id, heading: schema.heading, kind: schema.kind, body: emptyBody(schema.kind, schema) };
    }
    const section: FrameworkSection = { id: schema.id, heading: schema.heading, kind: schema.kind, body };
    validateSection(framework, schema, section, issues, warnings);
    return section;
  });

  const title = asString(obj["title"]) || frameworkLabel(framework, phase);
  return { doc: { title, framework: framework.id, sections }, issues, warnings, unparseable };
}

/** Section ids that need regeneration, de-duplicated, schema order. */
export function sectionsNeedingRepair(framework: Framework, issues: Issue[]): string[] {
  const ids = new Set(issues.map((i) => i.sectionId));
  return framework.schema.map((s) => s.id).filter((id) => ids.has(id));
}

/**
 * Merge a repair response (only the broken sections) into an existing document and
 * re-validate. Sections that were already valid are never replaced.
 */
export function applyRepair(doc: FrameworkDoc, repairInput: unknown, framework: Framework, repairIds: string[], phase = framework.phase): ValidationResult {
  const parsed = typeof repairInput === "string" ? extractJson(repairInput) : repairInput;
  const repairSections =
    parsed && typeof parsed === "object" && Array.isArray((parsed as Record<string, unknown>)["sections"])
      ? ((parsed as Record<string, unknown>)["sections"] as Record<string, unknown>[])
      : [];

  const merged = {
    title: doc.title,
    framework: framework.id,
    sections: doc.sections.map((s) => {
      if (!repairIds.includes(s.id)) return s;
      const fix = repairSections.find((r) => r && r["id"] === s.id);
      return fix ? { ...s, body: fix["body"] } : s;
    }),
  };
  return validateFrameworkOutput(merged, framework, phase);
}

/* ------------------------------------------------------------------ */
/* Prompts                                                             */
/* ------------------------------------------------------------------ */

function describeSchema(sections: SectionSchema[]): string {
  return sections
    .map((s) => {
      const limits = [s.minItems ? `min ${s.minItems}` : "", s.maxItems ? `max ${s.maxItems}` : ""].filter(Boolean).join(", ");
      const shape =
        s.kind === "bullets"
          ? `body: array of short strings${limits ? ` (${limits})` : ""}`
          : s.kind === "table"
            ? `body: { "columns": ${JSON.stringify(s.columns)}, "rows": [[...one string per column...]] }${limits ? ` (${limits} rows)` : ""}`
            : s.kind === "metrics"
              ? `body: array of { "label": string, "value": string }${limits ? ` (${limits})` : ""}`
              : "body: a single string";
      return `- id "${s.id}" | heading "${s.heading}" | kind "${s.kind}" | ${shape}\n  Content: ${s.guidance}`;
    })
    .join("\n");
}

export interface PriorFramework {
  framework: string;
  title: string;
  sections: FrameworkSection[];
}

export function sectionToMarkdown(s: FrameworkSection): string {
  const b = s.body;
  if (typeof b === "string") return b;
  if (s.kind === "table" && !Array.isArray(b)) {
    if (!b.rows.length) return "_(empty)_";
    const head = `| ${b.columns.join(" | ")} |\n| ${b.columns.map(() => "---").join(" | ")} |`;
    return `${head}\n${b.rows.map((r) => `| ${r.map((c) => c.replace(/\|/g, "/")).join(" | ")} |`).join("\n")}`;
  }
  if (s.kind === "metrics" && Array.isArray(b)) {
    return (b as MetricItem[]).map((m) => `- **${m.label}:** ${m.value}${m.note ? ` (${m.note})` : ""}`).join("\n");
  }
  return (b as string[]).map((x) => `- ${x}`).join("\n");
}

export function docToMarkdown(doc: FrameworkDoc, extra?: { ventureName?: string; version?: number }): string {
  const header = `# ${doc.title}${extra?.ventureName ? `\n\n_Venture: ${extra.ventureName}_` : ""}${extra?.version ? ` · _Version ${extra.version}_` : ""}`;
  return `${header}\n\n${doc.sections.map((s) => `## ${s.heading}\n\n${sectionToMarkdown(s)}`).join("\n\n")}\n`;
}

export interface FrameworkPromptInput {
  framework: Framework;
  phase: string;
  /** Venture dossier + transcript block (buildContextPacket output). */
  contextPacket: string;
  priorFrameworks?: PriorFramework[];
  validationReport?: string | null;
  deriveFrom?: PriorFramework | null;
}

export function buildFrameworkPrompt(input: FrameworkPromptInput): { system: string; user: string } {
  const { framework, phase, contextPacket, priorFrameworks = [], validationReport, deriveFrom } = input;
  const label = frameworkLabel(framework, phase);
  const lens = phase === "marketing" && framework.id === "swot" ? "\nLENS: Marketing. Weight go-to-market, positioning, channel and competitive factors." : "";

  const prior = priorFrameworks.length
    ? `\n\n=== PREVIOUSLY GENERATED FRAMEWORKS (same venture — stay consistent, reuse their facts) ===\n${priorFrameworks
        .map((p) => docToMarkdown({ title: p.title, framework: p.framework, sections: p.sections }))
        .join("\n---\n")}`
    : "";

  const validation = validationReport ? `\n\n=== VALIDATION REPORT (cross-reference hypotheses and evidence) ===\n${validationReport.slice(0, 4000)}` : "";

  const audit = deriveFrom
    ? `\n\n=== AUDIT MODE: DERIVE FROM ${deriveFrom.title.toUpperCase()} ===\nDo NOT start from the transcript. Audit the canvas below box by box: what it proves (strengths), what it leaves exposed (weaknesses), and which external windows and triggers it implies. The transcript is secondary evidence only.\n${docToMarkdown({ title: deriveFrom.title, framework: deriveFrom.framework, sections: deriveFrom.sections })}`
    : "";

  const system = `You are The Chair (Chief of Staff) of the startup's Board of Directors.
Your mission: produce the "${label}" framework deliverable for the founder.${lens}

${contextPacket}${validation}${prior}${audit}

=== FRAMEWORK: ${label.toUpperCase()} (render mode: ${framework.renderMode}) ===
${framework.chairInstruction}

=== REQUIRED SECTIONS (use these exact ids, in this order) ===
${describeSchema(framework.schema)}

=== OUTPUT CONTRACT ===
Respond with STRICT JSON only — no markdown fences, no commentary before or after.
Shape: { "title": string, "framework": "${framework.id}", "sections": [ { "id": string, "heading": string, "kind": "prose"|"bullets"|"table"|"metrics", "body": ... } ] }
Every required section id must be present exactly once. Write specific, falsifiable content for this venture.`;

  const user = deriveFrom
    ? `Derive the ${label} for this venture by auditing the ${deriveFrom.title}. Return strict JSON.`
    : `Synthesize the ${label} for this venture from the board's deliberations. Return strict JSON.`;

  return { system, user };
}

export function buildRepairPrompt(framework: Framework, phase: string, doc: FrameworkDoc, issues: Issue[], contextPacket: string): { system: string; user: string; repairIds: string[] } {
  const repairIds = sectionsNeedingRepair(framework, issues);
  const schemas = framework.schema.filter((s) => repairIds.includes(s.id));
  const label = frameworkLabel(framework, phase);
  const keep = doc.sections.filter((s) => !repairIds.includes(s.id));

  const system = `You are The Chair. A draft of the "${label}" framework failed validation in some boxes only.

${contextPacket}

=== ACCEPTED SECTIONS (keep consistent with these; do not return them) ===
${keep.map((s) => `## ${s.heading}\n${sectionToMarkdown(s)}`).join("\n\n") || "(none)"}

=== PROBLEMS TO FIX ===
${issues.filter((i) => repairIds.includes(i.sectionId)).map((i) => `- [${i.sectionId}] ${i.problem}`).join("\n")}

=== FRAMEWORK RULES ===
${framework.chairInstruction}

=== SECTIONS TO REGENERATE (only these) ===
${describeSchema(schemas)}

=== OUTPUT CONTRACT ===
Respond with STRICT JSON only: { "sections": [ { "id": string, "heading": string, "kind": string, "body": ... } ] } containing ONLY these ids: ${repairIds.join(", ")}.`;

  return { system, user: `Regenerate only: ${repairIds.join(", ")}. Return strict JSON.`, repairIds };
}

export function frameworkById(id: string): Framework {
  const f = getFramework(id);
  if (!f) throw new Error(`Unknown framework: ${id}`);
  return f;
}
