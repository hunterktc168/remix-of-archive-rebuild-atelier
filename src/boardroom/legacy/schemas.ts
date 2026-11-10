/**
 * Boardroom Strategic Framework Registry
 *
 * Business Plan and Marketing Strategy are toolkits: the founder selects which
 * frameworks The Chair should generate. Each framework produces an independent,
 * versioned deliverable stored with a `framework` field.
 */

export type SectionKind = "prose" | "bullets" | "table" | "metrics";
export type RenderMode = "matrix-2x2" | "canvas-grid" | "plan-workbench";

export interface SectionSchema {
  id: string;
  heading: string;
  kind: SectionKind;
  /** What the Chair must put in this box. */
  guidance: string;
  minItems?: number;
  maxItems?: number;
  /** Fixed column headers for kind:'table'. */
  columns?: string[];
  /** Grid placement for canvas-grid / matrix-2x2 renderers. */
  area?: string;
}

export interface FrameworkContext {
  phase: string;
  stage?: string;
}

export interface Framework {
  id: string;
  label: string;
  /** Primary phase. */
  phase: string;
  /** Other phases where the framework is offered. */
  alsoIn?: string[];
  /** Phase-specific label, e.g. "SWOT — marketing lens". */
  labelByPhase?: Record<string, string>;
  description: string;
  defaultSelected: (ctx: FrameworkContext) => boolean;
  schema: SectionSchema[];
  requiredAgents: string[];
  renderMode: RenderMode;
  chairInstruction: string;
  /** Frameworks this one can be derived from (audit mode). */
  derivableFrom?: string[];
}

const EARLY_STAGES = ["Idea", "Prototype"];
const LATER_STAGES = ["Early Revenue", "Growth"];

export const FRAMEWORKS: Framework[] = [
  {
    id: "lean-canvas",
    label: "Lean Canvas",
    phase: "business-plan",
    description: "Ash Maurya's 9-box startup canvas: is the riskiest assumption true?",
    defaultSelected: ({ phase, stage }) =>
      phase === "business-plan" && (!stage || EARLY_STAGES.includes(stage)),
    requiredAgents: ["david", "elena", "priya"],
    renderMode: "canvas-grid",
    schema: [
      { id: "problem", heading: "Problem", kind: "bullets", area: "problem", minItems: 2, maxItems: 6, guidance: "Top 3 problems, then the existing alternatives customers use today (prefix those with 'Alternative:')." },
      { id: "customer-segments", heading: "Customer Segments", kind: "bullets", area: "segments", minItems: 2, maxItems: 5, guidance: "Target segment, then early adopters (prefix with 'Early adopters:')." },
      { id: "uvp", heading: "Unique Value Proposition", kind: "bullets", area: "uvp", minItems: 1, maxItems: 3, guidance: "One clear sentence, then the high-level 'X for Y' concept." },
      { id: "solution", heading: "Solution", kind: "bullets", area: "solution", minItems: 1, maxItems: 3, guidance: "Exactly the top 3 features, one per problem. Never more than three." },
      { id: "channels", heading: "Channels", kind: "bullets", area: "channels", minItems: 1, maxItems: 5, guidance: "Path to early adopters, free and paid." },
      { id: "revenue-streams", heading: "Revenue Streams", kind: "bullets", area: "revenue", minItems: 1, maxItems: 5, guidance: "Revenue model, a concrete price, and the LTV assumption (state 'LTV')." },
      { id: "cost-structure", heading: "Cost Structure", kind: "bullets", area: "cost", minItems: 1, maxItems: 6, guidance: "Fixed and variable costs for the next 3–6 months." },
      { id: "key-metrics", heading: "Key Metrics", kind: "bullets", area: "metrics", minItems: 3, maxItems: 5, guidance: "3–5 leading indicators." },
      { id: "unfair-advantage", heading: "Unfair Advantage", kind: "bullets", area: "advantage", minItems: 1, maxItems: 3, guidance: "Something that cannot be easily copied, or 'None yet — plan to build one: …'. Never fabricate a moat." },
    ],
    chairInstruction: `Fill this as a startup canvas, not a corporate plan. The Solution box must stay to three features. Revenue Streams must carry a price and an LTV assumption. Unfair Advantage may be "None yet — here is the plan to build one"; do not fabricate a moat. If a Validation Report is supplied, pull its hypotheses and evidence into Problem, Customer Segments, and Key Metrics.`,
  },
  {
    id: "swot",
    label: "SWOT Analysis",
    phase: "business-plan",
    alsoIn: ["marketing"],
    labelByPhase: { marketing: "SWOT — marketing lens" },
    description: "Strengths, weaknesses, opportunities and threats, closed with concrete strategic moves.",
    defaultSelected: () => false,
    requiredAgents: ["david", "elena", "priya", "marcus"],
    renderMode: "matrix-2x2",
    derivableFrom: ["lean-canvas", "business-blueprint"],
    schema: [
      { id: "strengths", heading: "Strengths", kind: "bullets", area: "s", minItems: 2, maxItems: 6, guidance: "Internal, positive. Anchor each to evidence or an asset." },
      { id: "weaknesses", heading: "Weaknesses", kind: "bullets", area: "w", minItems: 2, maxItems: 6, guidance: "Internal, negative. Name the consequence." },
      { id: "opportunities", heading: "Opportunities", kind: "bullets", area: "o", minItems: 2, maxItems: 6, guidance: "External, positive. Name the window or timing." },
      { id: "threats", heading: "Threats", kind: "bullets", area: "t", minItems: 2, maxItems: 6, guidance: "External, negative. Name the trigger or catalyst." },
      { id: "strategic-implications", heading: "Strategic Implications", kind: "bullets", area: "implications", minItems: 2, maxItems: 3, guidance: "2–3 concrete actions, each pairing a Strength with an Opportunity or mitigating a Weakness against a Threat." },
    ],
    chairInstruction: `Every bullet must be specific to this venture and falsifiable. Reject generic entries ("strong team" is invalid unless it names the capability and why it is hard to copy). Keep bullets short (one line), not prose. End every bullet with an italic note citing the board member whose input grounds it, e.g. "… _— Elena Vasquez_". Strategic Implications is mandatory.`,
  },
  {
    id: "business-blueprint",
    label: "Business Blueprint",
    phase: "business-plan",
    description: "Business Model Canvas: can this business deliver and capture value repeatably?",
    defaultSelected: ({ phase, stage }) =>
      phase === "business-plan" && !!stage && LATER_STAGES.includes(stage),
    requiredAgents: ["priya", "elena", "marcus"],
    renderMode: "canvas-grid",
    schema: [
      { id: "key-partnerships", heading: "Key Partnerships", kind: "bullets", area: "partners", minItems: 1, maxItems: 5, guidance: "Partners and suppliers the model depends on." },
      { id: "key-activities", heading: "Key Activities", kind: "bullets", area: "activities", minItems: 1, maxItems: 5, guidance: "What the business must do well every week." },
      { id: "key-resources", heading: "Key Resources", kind: "bullets", area: "resources", minItems: 1, maxItems: 5, guidance: "Assets required to deliver the value proposition." },
      { id: "value-proposition", heading: "Value Proposition", kind: "bullets", area: "value", minItems: 1, maxItems: 4, guidance: "The bundle of value delivered to each segment." },
      { id: "customer-relationships", heading: "Customer Relationships", kind: "bullets", area: "relationships", minItems: 1, maxItems: 4, guidance: "How each segment is acquired, kept and grown." },
      { id: "channels", heading: "Channels", kind: "bullets", area: "channels", minItems: 1, maxItems: 5, guidance: "How value reaches customers." },
      { id: "customer-segments", heading: "Customer Segments", kind: "bullets", area: "segments", minItems: 1, maxItems: 4, guidance: "Who the business serves." },
      { id: "cost-structure", heading: "Cost Structure", kind: "bullets", area: "cost", minItems: 1, maxItems: 6, guidance: "Major cost drivers, fixed vs variable." },
      { id: "revenue-streams", heading: "Revenue Streams", kind: "bullets", area: "revenue", minItems: 1, maxItems: 5, guidance: "How and how much each segment pays." },
      { id: "consistency-notes", heading: "Consistency Notes", kind: "bullets", area: "notes", minItems: 1, maxItems: 5, guidance: "Flag any block that contradicts another, naming both blocks. If none, say so explicitly." },
    ],
    chairInstruction: `This is the "how the whole machine runs" canvas. Where Lean Canvas asks "is the riskiest assumption true?", Blueprint asks "can this business deliver and capture value repeatably?" Every block must be internally consistent with the others; flag any block that contradicts another in the closing Consistency Notes section.`,
  },
  {
    id: "marketing-plan",
    label: "Marketing Plan",
    phase: "marketing",
    description: "Living, versioned plan: positioning, budgeted channels with CAC, experiments, launch and KPIs.",
    defaultSelected: ({ phase }) => phase === "marketing",
    requiredAgents: ["marcus", "elena", "sam", "priya"],
    renderMode: "plan-workbench",
    schema: [
      { id: "positioning", heading: "Positioning Statement", kind: "prose", guidance: "For [ICP] who [need], [product] is a [category] that [benefit]. Unlike [alternative], we [differentiator]." },
      { id: "icp", heading: "ICP & Segments", kind: "bullets", minItems: 3, maxItems: 5, guidance: "Primary segment, secondary segment, and an anti-persona (prefix each: 'Primary:', 'Secondary:', 'Anti-persona:')." },
      { id: "messaging-pillars", heading: "Messaging Pillars", kind: "bullets", minItems: 3, maxItems: 3, guidance: "Exactly 3 pillars, each 'Pillar — proof point; proof point'." },
      { id: "channel-portfolio", heading: "Channel Portfolio", kind: "table", minItems: 2, maxItems: 8, columns: ["Channel", "Role in funnel", "Monthly budget", "Expected CAC", "Expected volume", "Confidence (1–5)", "Status"], guidance: "One row per channel. Monthly budget and Expected CAC must be numbers in dollars (e.g. 2500), never words." },
      { id: "budget-allocation", heading: "Budget Allocation", kind: "metrics", minItems: 2, guidance: "First item label 'Total monthly budget' with a dollar value, then one item per channel with a percentage value; channel percentages must sum to 100%." },
      { id: "experiment-backlog", heading: "Experiment Backlog", kind: "table", minItems: 3, maxItems: 5, columns: ["Test", "Hypothesis", "Cost", "Success metric", "Kill criterion"], guidance: "3–5 cheap tests." },
      { id: "launch-sequence", heading: "Launch Sequence", kind: "table", minItems: 3, maxItems: 6, columns: ["Stage", "Weeks", "Actions", "Owner"], guidance: "Rows for Pre-launch, Launch and Scale with week ranges and owners." },
      { id: "kpis", heading: "KPIs & Cadence", kind: "metrics", minItems: 3, maxItems: 6, guidance: "North-star metric, weekly review metric, monthly review metric (label each that way) with target values." },
      { id: "cut-first", heading: "What We Would Cut First", kind: "prose", guidance: "Name the weakest channel and the trigger for cutting it." },
    ],
    chairInstruction: `Start from the Business Blueprint's Channels and the Lean Canvas's UVP when they are supplied. Every channel line must carry a numeric monthly budget and a CAC hypothesis, not a vibe. Budget Allocation percentages must sum to 100%. Close with "What We Would Cut First", naming the weakest channel and the trigger for cutting it.`,
  },
];

export function getFramework(id: string): Framework | undefined {
  return FRAMEWORKS.find((f) => f.id === id);
}

export function frameworksForPhase(phase: string): Framework[] {
  const list = FRAMEWORKS.filter((f) => f.phase === phase || f.alsoIn?.includes(phase));
  // Primary-phase frameworks first, cross-phase extras (e.g. SWOT refresh) last.
  return [...list.filter((f) => f.phase === phase), ...list.filter((f) => f.phase !== phase)];
}

export function phaseUsesFrameworks(phase: string): boolean {
  return frameworksForPhase(phase).length > 0;
}

export function frameworkLabel(framework: Framework, phase: string): string {
  return framework.labelByPhase?.[phase] ?? framework.label;
}

export function defaultSelection(phase: string, stage?: string): string[] {
  const ctx: FrameworkContext = stage ? { phase, stage } : { phase };
  return frameworksForPhase(phase)
    .filter((f) => f.defaultSelected(ctx))
    .map((f) => f.id);
}
