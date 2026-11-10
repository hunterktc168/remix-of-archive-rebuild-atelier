import { describe, expect, it } from "vitest";

import { getFramework, defaultSelection, frameworksForPhase, frameworkLabel } from "@/boardroom/legacy/schemas";
import {
  validateFrameworkOutput,
  applyRepair,
  buildFrameworkPrompt,
  buildRepairPrompt,
  isGenericBullet,
  sectionsNeedingRepair,
  extractJson,
} from "@/boardroom/legacy/frameworkEngine";
import { mockFrameworkDoc } from "@/boardroom/legacy/mockFrameworks";

const venture = { name: "Harbor Freight AI", oneliner: "Pricing copilot for trucking fleets", industry: "Logistics", stage: "Idea" };
const fw = (id: string) => getFramework(id)!;
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

describe("framework selection", () => {
  it("Business Plan offers SWOT, Lean Canvas and Business Blueprint", () => {
    expect(frameworksForPhase("business-plan").map((f) => f.id).sort()).toEqual(["business-blueprint", "lean-canvas", "swot"]);
  });
  it("Marketing offers the Marketing Plan plus a SWOT marketing lens", () => {
    expect(frameworksForPhase("marketing").map((f) => f.id)).toEqual(["marketing-plan", "swot"]);
    expect(frameworkLabel(fw("swot"), "marketing")).toBe("SWOT — marketing lens");
  });
  it("pre-checks Lean Canvas for Idea/Prototype and Blueprint for Early Revenue/Growth", () => {
    expect(defaultSelection("business-plan", "Idea")).toEqual(["lean-canvas"]);
    expect(defaultSelection("business-plan", "Prototype")).toEqual(["lean-canvas"]);
    expect(defaultSelection("business-plan", "Early Revenue")).toEqual(["business-blueprint"]);
    expect(defaultSelection("business-plan", "Growth")).toEqual(["business-blueprint"]);
    expect(defaultSelection("marketing", "Idea")).toEqual(["marketing-plan"]);
  });
});

describe("offline demo output passes every framework schema", () => {
  for (const [id, phase] of [["lean-canvas", "business-plan"], ["swot", "business-plan"], ["swot", "marketing"], ["business-blueprint", "business-plan"], ["marketing-plan", "marketing"]] as const) {
    it(`${id} (${phase})`, () => {
      const r = validateFrameworkOutput(JSON.stringify(mockFrameworkDoc(id, venture, phase)), fw(id), phase);
      expect(r.issues).toEqual([]);
    });
  }
});

describe("Lean Canvas", () => {
  it("keeps the nine boxes in Maurya's order", () => {
    expect(fw("lean-canvas").schema.map((s) => s.id)).toEqual([
      "problem", "customer-segments", "uvp", "solution", "channels", "revenue-streams", "cost-structure", "key-metrics", "unfair-advantage",
    ]);
  });
  it("rejects a Solution box with more than three features", () => {
    const doc = clone(mockFrameworkDoc("lean-canvas", venture, "business-plan"));
    doc.sections.find((s) => s.id === "solution")!.body = ["a b c d e", "f g h i j", "k l m n o", "p q r s t"];
    const r = validateFrameworkOutput(doc, fw("lean-canvas"));
    expect(sectionsNeedingRepair(fw("lean-canvas"), r.issues)).toEqual(["solution"]);
  });
  it("requires a price and an LTV assumption in Revenue Streams", () => {
    const doc = clone(mockFrameworkDoc("lean-canvas", venture, "business-plan"));
    doc.sections.find((s) => s.id === "revenue-streams")!.body = ["Subscription revenue from operators"];
    const r = validateFrameworkOutput(doc, fw("lean-canvas"));
    expect(r.issues.filter((i) => i.sectionId === "revenue-streams")).toHaveLength(2);
  });
});

describe("SWOT", () => {
  it("rejects generic bullets", () => {
    expect(isGenericBullet("Strong team _— Maya Chen_")).toBe(true);
    expect(isGenericBullet("Growing market")).toBe(true);
    expect(isGenericBullet("Founder ran dispatch at a 400-truck fleet for 6 years, so buyer access is hard to copy _— Marcus Webb_")).toBe(false);
    const doc = clone(mockFrameworkDoc("swot", venture, "business-plan"));
    (doc.sections.find((s) => s.id === "strengths")!.body as string[]).push("Strong team _— Maya Chen_");
    const r = validateFrameworkOutput(doc, fw("swot"));
    expect(r.issues.some((i) => i.sectionId === "strengths" && /Generic/.test(i.problem))).toBe(true);
  });
  it("flags a missing Strategic Implications section", () => {
    const doc = clone(mockFrameworkDoc("swot", venture, "business-plan"));
    doc.sections = doc.sections.filter((s) => s.id !== "strategic-implications");
    const r = validateFrameworkOutput(doc, fw("swot"));
    expect(sectionsNeedingRepair(fw("swot"), r.issues)).toEqual(["strategic-implications"]);
  });
});

describe("Marketing Plan", () => {
  it("channel table rows need numeric budget and CAC", () => {
    const doc = clone(mockFrameworkDoc("marketing-plan", venture, "marketing"));
    const table = doc.sections.find((s) => s.id === "channel-portfolio")!.body as { rows: string[][] };
    table.rows[0]![3] = "low";
    const r = validateFrameworkOutput(doc, fw("marketing-plan"), "marketing");
    expect(r.issues.map((i) => i.sectionId)).toEqual(["channel-portfolio"]);
  });
  it("budget split must sum to 100%", () => {
    const doc = clone(mockFrameworkDoc("marketing-plan", venture, "marketing"));
    const alloc = doc.sections.find((s) => s.id === "budget-allocation")!.body as { label: string; value: string }[];
    alloc[1]!.value = "50%";
    const r = validateFrameworkOutput(doc, fw("marketing-plan"), "marketing");
    expect(r.issues.some((i) => i.sectionId === "budget-allocation" && /130%/.test(i.problem))).toBe(true);
  });
});

describe("repair pass", () => {
  it("regenerates only broken boxes and keeps the valid ones", () => {
    const good = mockFrameworkDoc("lean-canvas", venture, "business-plan");
    const broken = clone(good);
    broken.sections = broken.sections.filter((s) => !["channels", "key-metrics"].includes(s.id));
    const first = validateFrameworkOutput(JSON.stringify(broken), fw("lean-canvas"));
    const ids = sectionsNeedingRepair(fw("lean-canvas"), first.issues);
    expect(ids).toEqual(["channels", "key-metrics"]);

    const { system } = buildRepairPrompt(fw("lean-canvas"), "business-plan", first.doc, first.issues, "CTX");
    expect(system).toContain('ONLY these ids: channels, key-metrics');

    const fix = { sections: good.sections.filter((s) => ids.includes(s.id)) };
    // Tamper: a repair that also returns another section must not overwrite it.
    fix.sections.push({ id: "problem", heading: "Problem", kind: "bullets", body: ["overwritten"] });
    const repaired = applyRepair(first.doc, JSON.stringify(fix), fw("lean-canvas"), ids);
    expect(repaired.issues).toEqual([]);
    expect(repaired.doc.sections.find((s) => s.id === "problem")!.body).toEqual(good.sections.find((s) => s.id === "problem")!.body);
  });
  it("unparseable output marks every section for repair instead of failing", () => {
    const r = validateFrameworkOutput("Sorry, here is prose instead", fw("swot"));
    expect(r.unparseable).toBe(true);
    expect(sectionsNeedingRepair(fw("swot"), r.issues)).toHaveLength(5);
  });
  it("extracts JSON wrapped in code fences", () => {
    expect(extractJson('Here:\n```json\n{"a":1,}\n```')).toEqual({ a: 1 });
  });
});

describe("prompts", () => {
  it("injects earlier frameworks and audit mode for Derive from…", () => {
    const lean = mockFrameworkDoc("lean-canvas", venture, "business-plan");
    const { system } = buildFrameworkPrompt({
      framework: fw("swot"), phase: "business-plan", contextPacket: "CTX",
      priorFrameworks: [{ framework: "lean-canvas", title: lean.title, sections: lean.sections }],
      deriveFrom: { framework: "lean-canvas", title: lean.title, sections: lean.sections },
    });
    expect(system).toContain("PREVIOUSLY GENERATED FRAMEWORKS");
    expect(system).toContain("AUDIT MODE");
    expect(system).toContain("STRICT JSON");
  });
});
