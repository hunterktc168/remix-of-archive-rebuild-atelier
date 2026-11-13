import type {
  AgentId,
  BlueprintBox,
  BlueprintData,
  Channel,
  ChannelRole,
  ChannelStatus,
  Experiment,
  ExperimentStatus,
  FrameworkId,
  KpiSlot,
  LaunchPhase,
  LaunchTask,
  LeanCanvasBox,
  LeanCanvasData,
  MarketingGoal,
  MarketingPlanData,
  RiskAppetite,
  SwotBullet,
  SwotData,
  SwotImplication,
  SwotQuadrant,
} from "../types/deliverables";
import { BLUEPRINT_BOXES, LEAN_CANVAS_BOXES, SWOT_QUADRANTS } from "../schemas";

const VALID_AGENT_IDS: readonly AgentId[] = [
  "maya",
  "sam",
  "david",
  "priya",
  "marcus",
  "elena",
  "chair",
] as const;

const VALID_SWOT_TAGS: readonly SwotImplication["tag"][] = ["SO", "WO", "ST", "WT"] as const;

const VALID_CHANNEL_ROLES: readonly ChannelRole[] = ["top", "mid", "bottom", "retention"] as const;

const VALID_CHANNEL_STATUSES: readonly ChannelStatus[] = [
  "testing",
  "scaling",
  "paused",
  "cut",
] as const;

const VALID_EXPERIMENT_STATUSES: readonly ExperimentStatus[] = [
  "planned",
  "running",
  "won",
  "lost",
] as const;

const VALID_LAUNCH_PHASES: readonly LaunchPhase["phase"][] = [
  "pre-launch",
  "launch",
  "scale",
] as const;

function isObject(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}

function assertObject(val: unknown, context: string): asserts val is Record<string, unknown> {
  if (!isObject(val)) {
    throw new Error(`Expected object at ${context}, received ${typeof val}`);
  }
}

function assertArray(val: unknown, context: string): asserts val is unknown[] {
  if (!Array.isArray(val)) {
    throw new Error(`Expected array at ${context}, received ${typeof val}`);
  }
}

function assertString(val: unknown, context: string): asserts val is string {
  if (typeof val !== "string") {
    throw new Error(`Expected string at ${context}, received ${typeof val}`);
  }
}

function assertNumber(val: unknown, context: string): asserts val is number {
  if (typeof val !== "number" || Number.isNaN(val)) {
    throw new Error(`Expected number at ${context}, received ${String(val)}`);
  }
}

/**
 * Extracts JSON content from LLM markdown code blocks or raw strings.
 */
export function extractJson(raw: string): string {
  const trimmed = raw.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch?.[1]) {
    return fenceMatch[1].trim();
  }
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }
  return trimmed;
}

export function assertSwotData(x: unknown): asserts x is SwotData {
  assertObject(x, "SwotData");
  const quadrants = x["quadrants"];
  assertObject(quadrants, "SwotData.quadrants");

  for (const q of SWOT_QUADRANTS) {
    const list = quadrants[q];
    assertArray(list, `SwotData.quadrants.${q}`);
    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      assertObject(item, `SwotData.quadrants.${q}[${i}]`);
      assertString(item["text"], `SwotData.quadrants.${q}[${i}].text`);
      const source = item["sourceAgentId"];
      if (source !== undefined) {
        if (!VALID_AGENT_IDS.includes(source as AgentId)) {
          throw new Error(
            `Invalid sourceAgentId "${String(source)}" at SwotData.quadrants.${q}[${i}]`,
          );
        }
      }
    }
  }

  const imps = x["strategicImplications"];
  assertArray(imps, "SwotData.strategicImplications");
  for (let i = 0; i < imps.length; i++) {
    const imp = imps[i];
    assertObject(imp, `SwotData.strategicImplications[${i}]`);
    assertString(imp["text"], `SwotData.strategicImplications[${i}].text`);
    const tag = imp["tag"];
    if (!VALID_SWOT_TAGS.includes(tag as SwotImplication["tag"])) {
      throw new Error(
        `Invalid implication tag "${String(tag)}" at SwotData.strategicImplications[${i}]`,
      );
    }
  }
}

export function assertLeanCanvasData(x: unknown): asserts x is LeanCanvasData {
  assertObject(x, "LeanCanvasData");
  const canvasType = x["canvasType"];
  if (canvasType !== "lean-canvas") {
    throw new Error(`Expected canvasType to be "lean-canvas", received "${String(canvasType)}"`);
  }
  const boxes = x["boxes"];
  assertObject(boxes, "LeanCanvasData.boxes");

  for (const b of LEAN_CANVAS_BOXES) {
    const list = boxes[b];
    if (list === undefined) {
      throw new Error(`Missing required LeanCanvas box "${b}"`);
    }
    assertArray(list, `LeanCanvasData.boxes.${b}`);
    for (let i = 0; i < list.length; i++) {
      assertString(list[i], `LeanCanvasData.boxes.${b}[${i}]`);
    }
  }
}

export function assertBlueprintData(x: unknown): asserts x is BlueprintData {
  assertObject(x, "BlueprintData");
  const canvasType = x["canvasType"];
  if (canvasType !== "business-blueprint") {
    throw new Error(
      `Expected canvasType to be "business-blueprint", received "${String(canvasType)}"`,
    );
  }
  const boxes = x["boxes"];
  assertObject(boxes, "BlueprintData.boxes");

  for (const b of BLUEPRINT_BOXES) {
    const list = boxes[b];
    if (list === undefined) {
      throw new Error(`Missing required Blueprint box "${b}"`);
    }
    assertArray(list, `BlueprintData.boxes.${b}`);
    for (let i = 0; i < list.length; i++) {
      assertString(list[i], `BlueprintData.boxes.${b}[${i}]`);
    }
  }
}

export function assertMarketingPlanData(x: unknown): asserts x is MarketingPlanData {
  assertObject(x, "MarketingPlanData");
  assertString(x["positioning"], "MarketingPlanData.positioning");

  const icp = x["icp"];
  assertObject(icp, "MarketingPlanData.icp");
  assertString(icp["primary"], "MarketingPlanData.icp.primary");
  assertString(icp["secondary"], "MarketingPlanData.icp.secondary");
  assertString(icp["antiPersona"], "MarketingPlanData.icp.antiPersona");

  const pillars = x["messagingPillars"];
  assertArray(pillars, "MarketingPlanData.messagingPillars");
  for (let i = 0; i < pillars.length; i++) {
    const p = pillars[i];
    assertObject(p, `MarketingPlanData.messagingPillars[${i}]`);
    assertString(p["pillar"], `MarketingPlanData.messagingPillars[${i}].pillar`);
    assertString(p["proof"], `MarketingPlanData.messagingPillars[${i}].proof`);
  }

  const channels = x["channels"];
  assertArray(channels, "MarketingPlanData.channels");
  for (let i = 0; i < channels.length; i++) {
    const ch = channels[i];
    assertObject(ch, `MarketingPlanData.channels[${i}]`);
    assertString(ch["id"], `MarketingPlanData.channels[${i}].id`);
    assertString(ch["name"], `MarketingPlanData.channels[${i}].name`);
    const role = ch["role"];
    if (!VALID_CHANNEL_ROLES.includes(role as ChannelRole)) {
      throw new Error(`Invalid role "${String(role)}" at channels[${i}]`);
    }
    assertNumber(ch["monthlyBudget"], `MarketingPlanData.channels[${i}].monthlyBudget`);
    assertNumber(ch["cacHypothesis"], `MarketingPlanData.channels[${i}].cacHypothesis`);
    assertNumber(ch["volumeHypothesis"], `MarketingPlanData.channels[${i}].volumeHypothesis`);

    const conf = ch["confidence"];
    if (conf !== 1 && conf !== 2 && conf !== 3 && conf !== 4 && conf !== 5) {
      throw new Error(
        `Invalid confidence score "${String(conf)}" at channels[${i}] (must be 1, 2, 3, 4, or 5)`,
      );
    }

    const status = ch["status"];
    if (!VALID_CHANNEL_STATUSES.includes(status as ChannelStatus)) {
      throw new Error(`Invalid status "${String(status)}" at channels[${i}]`);
    }
  }

  const exps = x["experiments"];
  assertArray(exps, "MarketingPlanData.experiments");
  for (let i = 0; i < exps.length; i++) {
    const exp = exps[i];
    assertObject(exp, `MarketingPlanData.experiments[${i}]`);
    assertString(exp["id"], `MarketingPlanData.experiments[${i}].id`);
    assertString(exp["channelId"], `MarketingPlanData.experiments[${i}].channelId`);
    assertString(exp["hypothesis"], `MarketingPlanData.experiments[${i}].hypothesis`);
    assertNumber(exp["cost"], `MarketingPlanData.experiments[${i}].cost`);
    assertString(exp["successMetric"], `MarketingPlanData.experiments[${i}].successMetric`);
    assertString(exp["killCriterion"], `MarketingPlanData.experiments[${i}].killCriterion`);
    const expStatus = exp["status"];
    if (!VALID_EXPERIMENT_STATUSES.includes(expStatus as ExperimentStatus)) {
      throw new Error(`Invalid status "${String(expStatus)}" at experiments[${i}]`);
    }
  }

  const seq = x["launchSequence"];
  assertArray(seq, "MarketingPlanData.launchSequence");
  for (let i = 0; i < seq.length; i++) {
    const phase = seq[i];
    assertObject(phase, `MarketingPlanData.launchSequence[${i}]`);
    const phaseName = phase["phase"];
    if (!VALID_LAUNCH_PHASES.includes(phaseName as LaunchPhase["phase"])) {
      throw new Error(`Invalid launch phase "${String(phaseName)}" at launchSequence[${i}]`);
    }
    const tasks = phase["tasks"];
    assertArray(tasks, `MarketingPlanData.launchSequence[${i}].tasks`);
    for (let j = 0; j < tasks.length; j++) {
      const task = tasks[j];
      assertObject(task, `MarketingPlanData.launchSequence[${i}].tasks[${j}]`);
      assertString(task["label"], `MarketingPlanData.launchSequence[${i}].tasks[${j}].label`);
      assertNumber(task["week"], `MarketingPlanData.launchSequence[${i}].tasks[${j}].week`);
      const owner = task["ownerAgentId"];
      if (!VALID_AGENT_IDS.includes(owner as AgentId)) {
        throw new Error(`Invalid ownerAgentId "${String(owner)}" at tasks[${j}]`);
      }
    }
  }

  const kpis = x["kpis"];
  assertObject(kpis, "MarketingPlanData.kpis");
  const validateKpi = (slot: unknown, name: string): void => {
    assertObject(slot, `MarketingPlanData.kpis.${name}`);
    assertString(slot["name"], `MarketingPlanData.kpis.${name}.name`);
    assertNumber(slot["target"], `MarketingPlanData.kpis.${name}.target`);
    assertNumber(slot["current"], `MarketingPlanData.kpis.${name}.current`);
  };
  validateKpi(kpis["northStar"], "northStar");
  validateKpi(kpis["weekly"], "weekly");
  validateKpi(kpis["monthly"], "monthly");
}

/**
 * Normalizes lenient LLM aliases for canvas box names if necessary.
 */
function normalizeCanvasBoxes(boxes: Record<string, unknown>): Record<string, unknown> {
  const norm: Record<string, unknown> = { ...boxes };
  if (norm["revenue-streams"] && !norm["revenue"]) {
    norm["revenue"] = norm["revenue-streams"];
  }
  if (norm["cost-structure"] && !norm["cost"]) {
    norm["cost"] = norm["cost-structure"];
  }
  if (norm["key-metrics"] && !norm["metrics"]) {
    norm["metrics"] = norm["key-metrics"];
  }
  return norm;
}

/**
 * Parses and strictly validates Chair output against the target framework schema.
 * Enforces an exhaustive compile-time check across the FrameworkId union.
 */
export function parseChairOutput(
  raw: string,
  framework: FrameworkId,
):
  | { ok: true; data: SwotData | LeanCanvasData | BlueprintData | MarketingPlanData }
  | { ok: false; reason: string; raw: string } {
  let jsonString = "";
  let parsed: unknown;

  try {
    jsonString = extractJson(raw);
    parsed = JSON.parse(jsonString);
  } catch (err) {
    return {
      ok: false,
      reason: `JSON parse error: ${err instanceof Error ? err.message : String(err)}`,
      raw,
    };
  }

  try {
    switch (framework) {
      case "swot": {
        assertSwotData(parsed);
        return { ok: true, data: parsed };
      }
      case "lean-canvas": {
        if (isObject(parsed)) {
          const boxes = parsed["boxes"];
          if (isObject(boxes)) {
            parsed["boxes"] = normalizeCanvasBoxes(boxes);
          }
        }
        assertLeanCanvasData(parsed);
        return { ok: true, data: parsed };
      }
      case "business-blueprint": {
        if (isObject(parsed)) {
          const boxes = parsed["boxes"];
          if (isObject(boxes)) {
            parsed["boxes"] = normalizeCanvasBoxes(boxes);
          }
        }
        assertBlueprintData(parsed);
        return { ok: true, data: parsed };
      }
      case "marketing-plan": {
        assertMarketingPlanData(parsed);
        return { ok: true, data: parsed };
      }
      case "legacy-plan": {
        return {
          ok: false,
          reason: "Legacy deliverables do not support structured framework parsing.",
          raw,
        };
      }
      default: {
        const _never: never = framework;
        throw new Error(`Unhandled framework: ${String(_never)}`);
      }
    }
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
      raw,
    };
  }
}
