export type AgentId = "maya" | "sam" | "david" | "priya" | "marcus" | "elena" | "chair";

export type PhaseId = "ideation" | "validation" | "business-plan" | "marketing";

export type SectionKind = "prose" | "bullets" | "table" | "metrics";

export interface Section {
  id: string;
  heading: string;
  body: string; // markdown
  kind: SectionKind;
}

export interface DeliverableBase {
  id: string;
  ventureId: string;
  phase: PhaseId;
  title: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  sourceMessageIds: string[];
  versions?: Deliverable[] | undefined;
}

// ---- SWOT ----
export type SwotQuadrant = "strengths" | "weaknesses" | "opportunities" | "threats";

export interface SwotBullet {
  text: string;
  sourceAgentId?: AgentId | undefined;
}

export interface SwotImplication {
  text: string;
  tag: "SO" | "WO" | "ST" | "WT";
}

export interface SwotData {
  quadrants: Record<SwotQuadrant, SwotBullet[]>;
  strategicImplications: SwotImplication[];
}

export interface SwotDeliverable extends DeliverableBase {
  framework: "swot";
  frameworkData: SwotData;
}

// ---- Canvas (Lean Canvas & Business Blueprint share the shape) ----
export type LeanCanvasBox =
  | "problem"
  | "customer-segments"
  | "uvp"
  | "solution"
  | "channels"
  | "revenue"
  | "cost"
  | "metrics"
  | "unfair-advantage";

export type BlueprintBox =
  | "customer-segments"
  | "value-proposition"
  | "channels"
  | "customer-relationships"
  | "revenue"
  | "key-resources"
  | "key-activities"
  | "key-partnerships"
  | "cost";

export interface LeanCanvasData {
  canvasType: "lean-canvas";
  boxes: Record<LeanCanvasBox, string[]>; // strict: missing box = compile error
}

export interface BlueprintData {
  canvasType: "business-blueprint";
  boxes: Record<BlueprintBox, string[]>;
}

export interface LeanCanvasDeliverable extends DeliverableBase {
  framework: "lean-canvas";
  frameworkData: LeanCanvasData;
}

export interface BlueprintDeliverable extends DeliverableBase {
  framework: "business-blueprint";
  frameworkData: BlueprintData;
}

// ---- Marketing Plan ----
export type MarketingGoal = "awareness" | "signups" | "revenue" | "retention";
export type RiskAppetite = "conservative" | "balanced" | "aggressive";

export interface MarketingLevers {
  monthlyBudget: number;
  primaryGoal: MarketingGoal;
  riskAppetite: RiskAppetite;
}

export type ChannelRole = "top" | "mid" | "bottom" | "retention";
export type ChannelStatus = "testing" | "scaling" | "paused" | "cut";

export interface Channel {
  id: string;
  name: string;
  role: ChannelRole;
  monthlyBudget: number;
  cacHypothesis: number;
  volumeHypothesis: number;
  confidence: 1 | 2 | 3 | 4 | 5; // literal union — invalid values won't compile
  status: ChannelStatus;
}

export type ExperimentStatus = "planned" | "running" | "won" | "lost";

export interface Experiment {
  id: string;
  channelId: string;
  hypothesis: string;
  cost: number;
  successMetric: string;
  killCriterion: string;
  status: ExperimentStatus;
}

export interface LaunchTask {
  label: string;
  ownerAgentId: AgentId;
  week: number;
}

export interface LaunchPhase {
  phase: "pre-launch" | "launch" | "scale";
  tasks: LaunchTask[];
}

export interface KpiSlot {
  name: string;
  target: number;
  current: number;
}

export interface MarketingPlanData {
  positioning: string;
  icp: { primary: string; secondary: string; antiPersona: string };
  messagingPillars: Array<{ pillar: string; proof: string }>;
  channels: Channel[];
  experiments: Experiment[];
  launchSequence: LaunchPhase[];
  kpis: { northStar: KpiSlot; weekly: KpiSlot; monthly: KpiSlot };
}

export interface MarketingDeliverable extends DeliverableBase {
  framework: "marketing-plan";
  frameworkData: MarketingPlanData;
  levers: MarketingLevers;
}

// ---- Legacy (migration target for pre-TS deliverables) ----
export interface LegacyDeliverable extends DeliverableBase {
  framework: "legacy-plan";
  frameworkData: null;
  sections: Section[]; // legacy shape preserved for read-only rendering
}

export type Deliverable =
  | SwotDeliverable
  | LeanCanvasDeliverable
  | BlueprintDeliverable
  | MarketingDeliverable
  | LegacyDeliverable;

export type FrameworkId = Deliverable["framework"];

// ---- Coherence & Audit Types ----
export type CoherenceIssueKind = "empty-box" | "over-stuffed" | "venture-contradiction";

export interface CoherenceFlag {
  boxId: string;
  kind: CoherenceIssueKind;
  message: string;
}

// ---- Evolve Plan Interview Sheet ----
export interface EvolveInterview {
  whatChanged: string;
  whatWeLearned: string;
  newConstraint: string;
}
