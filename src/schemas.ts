import type {
  BlueprintBox,
  FrameworkId,
  LeanCanvasBox,
  MarketingGoal,
  PhaseId,
  RiskAppetite,
  SwotQuadrant,
} from "./types/deliverables";

export const LEAN_CANVAS_BOXES: readonly LeanCanvasBox[] = [
  "problem",
  "customer-segments",
  "uvp",
  "solution",
  "channels",
  "revenue",
  "cost",
  "metrics",
  "unfair-advantage",
] as const;

export const BLUEPRINT_BOXES: readonly BlueprintBox[] = [
  "key-partnerships",
  "key-activities",
  "key-resources",
  "value-proposition",
  "customer-relationships",
  "channels",
  "customer-segments",
  "cost",
  "revenue",
] as const;

export const SWOT_QUADRANTS: readonly SwotQuadrant[] = [
  "strengths",
  "weaknesses",
  "opportunities",
  "threats",
] as const;

export const MARKETING_GOALS: readonly MarketingGoal[] = [
  "awareness",
  "signups",
  "revenue",
  "retention",
] as const;

export const RISK_APPETITES: readonly RiskAppetite[] = [
  "conservative",
  "balanced",
  "aggressive",
] as const;

export type FrameworkDefinition =
  | {
      id: "swot";
      label: string;
      phase: PhaseId;
      description: string;
      boxHints: Record<SwotQuadrant, string> | Record<string, string>;
      derivableFrom?: readonly FrameworkId[];
    }
  | {
      id: "lean-canvas";
      label: string;
      phase: PhaseId;
      description: string;
      boxHints: Record<LeanCanvasBox, string>;
      derivableFrom?: readonly FrameworkId[];
    }
  | {
      id: "business-blueprint";
      label: string;
      phase: PhaseId;
      description: string;
      boxHints: Record<BlueprintBox, string>;
      derivableFrom?: readonly FrameworkId[];
    }
  | {
      id: "marketing-plan";
      label: string;
      phase: PhaseId;
      description: string;
      boxHints: Record<string, string>;
      derivableFrom?: readonly FrameworkId[];
    };

export type FrameworkMetadata = FrameworkDefinition;

export const FRAMEWORKS = {
  swot: {
    id: "swot",
    label: "SWOT Analysis",
    phase: "business-plan",
    description:
      "Internal strengths and weaknesses paired with external opportunities and threats.",
    boxHints: {
      strengths:
        "Internal capabilities, unfair technical assets, proprietary data, or distribution leverage.",
      weaknesses:
        "Internal capital constraints, technical debt, organizational gaps, or single points of failure.",
      opportunities:
        "External regulatory shifts, emerging platform tailwinds, competitor vulnerabilities, or market gaps.",
      threats:
        "External platform risks, well-capitalized incumbents, macro downturns, or supply chain shocks.",
    },
    derivableFrom: ["lean-canvas", "business-blueprint"],
  },
  "lean-canvas": {
    id: "lean-canvas",
    label: "Lean Canvas",
    phase: "business-plan",
    description:
      "Ash Maurya's 9-box startup canvas focusing on high-risk hypotheses and rapid falsification.",
    boxHints: {
      problem:
        'Top 3 problems faced by customers; existing alternatives used today (prefix "Alternative:").',
      "customer-segments":
        "Target customer segments and profile of early adopters willing to pay now.",
      uvp: "Single, clear, compelling message that states why you are different and worth buying.",
      solution: "Top 3 features addressing the 3 core problems directly. Kept strictly to three.",
      channels:
        "Pathways to early adopters (inbound content, outbound sales, community, paid ads).",
      revenue:
        "Revenue model, concrete pricing tier, and customer lifetime value (LTV) hypothesis.",
      cost: "Fixed and variable costs for 3–6 months: hosting, CAC, payroll, and operational burn.",
      metrics:
        "3–5 key leading and lagging activity indicators (e.g. activation, retention, payback).",
      "unfair-advantage": "Asset that cannot be easily bought or copied. Never fabricate a moat.",
    },
  },
  "business-blueprint": {
    id: "business-blueprint",
    label: "Business Blueprint",
    phase: "business-plan",
    description:
      "Osterwalder's Business Model Canvas mapping infrastructure, offering, customer, and finance.",
    boxHints: {
      "key-partnerships":
        "Key suppliers, technology partners, and strategic alliances essential for delivery.",
      "key-activities":
        "Crucial operational actions required to produce value, maintain channels, and scale.",
      "key-resources":
        "Physical, intellectual, human, or financial assets required to sustain the model.",
      "value-proposition":
        "The bundle of products and services creating value for each specific customer segment.",
      "customer-relationships":
        "Types of interaction and support maintained with each customer segment.",
      channels:
        "Touchpoints through which customers discover, evaluate, purchase, and receive value.",
      "customer-segments":
        "The different groups of people or organizations the enterprise aims to reach and serve.",
      cost: "The most significant cost drivers incurred while operating the business model.",
      revenue: "The cash generation mechanisms and pricing structures for each customer segment.",
    },
  },
  "marketing-plan": {
    id: "marketing-plan",
    label: "Marketing Plan Workbench",
    phase: "marketing",
    description:
      "Dynamic portfolio workbench: positioning, budgeted channels, live experiments, and launch sequence.",
    boxHints: {
      positioning: "Sharp category definition and differentiated wedge statement.",
      icp: "Primary ideal customer profile, secondary segment, and anti-persona.",
      channels:
        "Acquisition channel portfolio with budget allocations, CAC targets, and confidence.",
      experiments: "Hypothesis-driven experiments with cost caps and kill criteria.",
      launchSequence: "Phased launch roadmap with assigned agent owners and timelines.",
      kpis: "North Star, weekly operational, and monthly board KPI targets.",
    },
  },
} as const satisfies Record<Exclude<FrameworkId, "legacy-plan">, FrameworkDefinition>;

export function getFramework(id: string): FrameworkDefinition | undefined {
  return (FRAMEWORKS as Record<string, FrameworkDefinition | undefined>)[id];
}

export function frameworksForPhase(phase: PhaseId | string): FrameworkDefinition[] {
  return (Object.values(FRAMEWORKS) as FrameworkDefinition[]).filter(
    (f) => f.phase === phase || (f.id === "swot" && phase === "marketing"),
  );
}

export function phaseUsesFrameworks(phase: PhaseId | string): boolean {
  return phase === "business-plan" || phase === "marketing";
}

export function frameworkLabel(framework: FrameworkDefinition, phase?: string): string {
  if (framework.id === "swot" && phase === "marketing") {
    return "SWOT — marketing lens";
  }
  return framework.label;
}

export function defaultSelection(phase: string, stage?: string): string[] {
  if (phase === "business-plan") {
    if (stage === "Early Revenue" || stage === "Growth") {
      return ["business-blueprint"];
    }
    return ["lean-canvas"];
  }
  if (phase === "marketing") {
    return ["marketing-plan"];
  }
  return [];
}
