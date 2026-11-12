import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  computePortfolio,
  suggestReallocation,
  applyReallocation,
  setExperimentStatus,
  leversLabel,
  type Workbench,
} from "@/boardroom/legacy/marketingWorkbench";
import { deliverableMarkdown, deliverableHtml, orderVentureDeliverables, ventureMarkdown } from "@/boardroom/legacy/exporter";

// In-memory stand-in for the browser database.
const store = new Map<string, Map<string, any>>();
const table = (name: string) => {
  if (!store.has(name)) store.set(name, new Map());
  return store.get(name)!;
};
vi.mock("@/boardroom/legacy/db", () => ({
  getAll: async (name: string) => [...table(name).values()],
  get: async (name: string, key: string) => structuredClone(table(name).get(key)),
  put: async (name: string, value: any) => void table(name).set(value.id, structuredClone(value)),
  getVenture: async (id: string) => table("ventures").get(id),
  saveVenture: async (v: any) => void table("ventures").set(v.id, v),
  getThreadSession: async () => ({ messages: [] }),
  getSetting: async (_k: string, d: unknown) => d,
}));

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

function plan(): Workbench {
  return {
    levers: { budget: 6000, goal: "signups", risk: "balanced" },
    channels: [
      { id: "seo", name: "SEO content", role: "Acquisition", budget: 3000, cac: 150, confidence: 4, status: "Scaling" },
      { id: "li", name: "LinkedIn ads", role: "Acquisition", budget: 2000, cac: 400, confidence: 2, status: "Testing" },
      { id: "ev", name: "Events", role: "Awareness", budget: 1000, cac: 500, confidence: 3, status: "Testing" },
    ],
    experiments: [
      { id: "x1", channelId: "li", test: "Retarget visitors", hypothesis: "", cost: 500, metric: "", kill: "", status: "Running", appliedOutcome: null },
    ],
    launch: { phases: [{ id: "pre", label: "Pre-launch", startWeek: 1, endWeek: 4 }, { id: "launch", label: "Launch", startWeek: 5, endWeek: 8 }, { id: "scale", label: "Scale", startWeek: 9, endWeek: 12 }], tasks: [] },
    kpis: [{ key: "northStar", metric: "Weekly signups", target: "100", current: "", health: "on-track" }],
    narrative: { positioning: "For fleets", icp: ["Fleet owners"], pillars: ["Save money"], cutFirst: "Events" },
    ltvOverride: null,
  };
}

describe("channel portfolio maths", () => {
  it("budget percentages always sum to 100%", () => {
    const wb = plan();
    wb.channels[0]!.budget = 1000;
    wb.channels[1]!.budget = 1000;
    wb.channels[2]!.budget = 1000; // 33.3% each
    const pf = computePortfolio(wb, null);
    expect(pf.shareSum).toBe(100);
    expect(pf.rows.map((r) => r.share).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it("volume is budget ÷ CAC and LTV:CAC is LTV ÷ CAC", () => {
    const pf = computePortfolio(plan(), 1200);
    const seo = pf.rows.find((r) => r.id === "seo")!;
    expect(seo.volume).toBe(20); // 3000 / 150
    expect(seo.ltvCac).toBe(8); // 1200 / 150
    expect(pf.rows.find((r) => r.id === "li")!.ltvCac).toBe(3); // 1200 / 400
  });

  it("warns when channels spend more than the budget lever", () => {
    const wb = plan();
    wb.levers.budget = 5000;
    expect(computePortfolio(wb, null).overBy).toBe(1000);
    wb.levers.budget = 6000;
    expect(computePortfolio(wb, null).overBy).toBe(0);
  });
});

describe("dynamic reallocation", () => {
  it("offers to move budget from the weakest channel when one is Scaling at confidence 4+", () => {
    const r = suggestReallocation(plan())!;
    expect(r.fromId).toBe("li");
    expect(r.toId).toBe("seo");
    const after = applyReallocation(plan(), r);
    expect(after.channels.find((c) => c.id === "seo")!.budget).toBe(3000 + r.amount);
    expect(after.channels.find((c) => c.id === "li")!.budget).toBe(2000 - r.amount);
  });

  it("offers nothing when no channel is Scaling at confidence 4+", () => {
    const wb = plan();
    wb.channels[0]!.confidence = 3;
    expect(suggestReallocation(wb)).toBeNull();
  });
});

describe("experiment results", () => {
  it("Won adds one confidence point to the linked channel, Lost removes one", () => {
    const won = setExperimentStatus(plan(), "x1", "Won");
    expect(won.channels.find((c) => c.id === "li")!.confidence).toBe(3);
    const lost = setExperimentStatus(plan(), "x1", "Lost");
    expect(lost.channels.find((c) => c.id === "li")!.confidence).toBe(1);
    // Switching Won → Lost reverses the earlier point too.
    expect(setExperimentStatus(won, "x1", "Lost").channels.find((c) => c.id === "li")!.confidence).toBe(1);
  });
});

describe("plan versions", () => {
  beforeEach(() => store.clear());

  it("changing the budget creates a new version and the old one can be restored", async () => {
    const { commitWorkbench, restoreVersion } = await import("@/boardroom/legacy/frameworkStore");
    table("ventures").set("v1", { id: "v1", name: "Harbor" });
    const id = "fw_v1_marketing_marketing-plan";
    table("deliverables").set(id, { id, kind: "framework", ventureId: "v1", phase: "marketing", framework: "marketing-plan", title: "Plan", versions: [], currentVersion: 0 });

    await commitWorkbench(id, plan(), { source: "edited" });
    const bigger = clone(plan());
    bigger.levers.budget = 10000;
    bigger.levers.risk = "aggressive";
    const v2 = await commitWorkbench(id, bigger, { source: "recalculated" });

    expect(v2.currentVersion).toBe(2);
    expect(v2.versions).toHaveLength(2);
    expect(v2.versions[0].workbench.levers.budget).toBe(6000);
    expect(leversLabel(v2.versions[1].workbench.levers)).toBe("$10k/mo aggressive");

    const v3 = await restoreVersion(id, 1);
    expect(v3.currentVersion).toBe(3);
    expect(v3.workbench.levers.budget).toBe(6000);
    expect(v3.versions).toHaveLength(3);
  });
});

describe("exports", () => {
  const planDeliv = { id: "p", kind: "framework", framework: "marketing-plan", phase: "marketing", currentVersion: 2, versions: [{ version: 2, title: "Go-to-market", sections: [], workbench: plan() }] };

  it("every export header carries the framework and version tag", () => {
    const md = deliverableMarkdown(planDeliv, { now: "2026-01-01T00:00:00Z" });
    expect(md).toMatch(/^---\nframework: marketing-plan\nversion: 2\n/);
    const html = deliverableHtml(planDeliv, { now: "2026-01-01T00:00:00Z" });
    expect(html).toContain('<meta name="boardroom:framework" content="marketing-plan">');
    expect(html).toContain('<meta name="boardroom:version" content="2">');
    const memo = deliverableMarkdown({ id: "m", phase: "validation", content: "# Report\n\nBody" });
    expect(memo).toMatch(/^---\nframework: validation-report\nversion: 1\n/);
  });

  it("full-venture export follows Idea Brief → Validation → SWOT → Lean Canvas → Blueprint → Marketing Plan, then transcripts", () => {
    const fw = (framework: string, phase = "business-plan") => ({ id: framework + phase, kind: "framework", framework, phase, currentVersion: 1, versions: [{ version: 1, title: framework, sections: [] }] });
    const list = [planDeliv, fw("business-blueprint"), { id: "val", phase: "validation", content: "x" }, fw("lean-canvas"), fw("swot"), { id: "idea", phase: "ideation", content: "x" }];
    expect(orderVentureDeliverables(list).map((d) => d.id)).toEqual(["idea", "val", "swotbusiness-plan", "lean-canvasbusiness-plan", "business-blueprintbusiness-plan", "p"]);
    const md = ventureMarkdown({ name: "Harbor" }, list, [{ phase: "ideation", messages: [{ author: "Marcus", text: "Hello board" }] }], { now: "2026-01-01T00:00:00Z" });
    expect(md.indexOf("# Idea Brief")).toBeLessThan(md.indexOf("# Marketing Plan"));
    expect(md.indexOf("# Marketing Plan")).toBeLessThan(md.indexOf("# Appendix — Board Transcripts"));
    expect(md).toContain("Hello board");
  });
});
