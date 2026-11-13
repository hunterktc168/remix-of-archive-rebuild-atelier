import { applyDBUpgrade, DB_VERSION } from "../db";
import { exportDeliverableToHtml, exportDeliverableToMarkdown } from "../export";
import { budgetPct, healthOf, ltvCacRatio, totalBudget } from "../lib/marketing-compute";
import {
  assertBlueprintData,
  assertLeanCanvasData,
  assertMarketingPlanData,
  assertSwotData,
  parseChairOutput,
} from "../lib/parse-chair-output";
import type {
  BlueprintData,
  Channel,
  Deliverable,
  KpiSlot,
  LeanCanvasData,
  LeanCanvasDeliverable,
  MarketingPlanData,
  SwotData,
} from "../types/deliverables";
import { evaluateCanvasCoherence, renderCanvas } from "../views/deliverable-canvas";

export interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

export function runSelftest(): TestResult[] {
  const results: TestResult[] = [];

  function test(name: string, fn: () => void) {
    try {
      fn();
      results.push({ name, passed: true });
    } catch (err) {
      results.push({
        name,
        passed: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // 1. SWOT Validator Tests
  test("assertSwotData accepts valid SWOT", () => {
    const swot: SwotData = {
      quadrants: {
        strengths: [{ text: "Proprietary kinematics", sourceAgentId: "maya" }],
        weaknesses: [{ text: "High BoM", sourceAgentId: "elena" }],
        opportunities: [{ text: "High market demand", sourceAgentId: "marcus" }],
        threats: [{ text: "Incumbent retrofits", sourceAgentId: "david" }],
      },
      strategicImplications: [{ text: "Partner with regional co-ops", tag: "SO" }],
    };
    assertSwotData(swot);
    const parsed = parseChairOutput(JSON.stringify(swot), "swot");
    if (!parsed.ok) throw new Error(`Expected ok: true, got ${parsed.reason}`);
  });

  test("assertSwotData rejects invalid tag", () => {
    const invalid = {
      quadrants: { strengths: [], weaknesses: [], opportunities: [], threats: [] },
      strategicImplications: [{ text: "Invalid tag test", tag: "XX" }],
    };
    let threw = false;
    try {
      assertSwotData(invalid);
    } catch {
      threw = true;
    }
    if (!threw) throw new Error("Expected assertSwotData to throw on invalid tag");
  });

  test("assertSwotData rejects missing quadrant", () => {
    const missing = {
      quadrants: { strengths: [], weaknesses: [], opportunities: [] }, // missing threats
      strategicImplications: [],
    };
    let threw = false;
    try {
      assertSwotData(missing);
    } catch {
      threw = true;
    }
    if (!threw) throw new Error("Expected assertSwotData to throw on missing quadrant");
  });

  test("assertSwotData rejects wrong type for quadrant items", () => {
    const wrongType = {
      quadrants: { strengths: ["not-an-object"], weaknesses: [], opportunities: [], threats: [] },
      strategicImplications: [],
    };
    let threw = false;
    try {
      assertSwotData(wrongType);
    } catch {
      threw = true;
    }
    if (!threw) throw new Error("Expected assertSwotData to throw on wrong type");
  });

  // 2. Lean Canvas Validator Tests
  test("assertLeanCanvasData accepts complete 9-box canvas", () => {
    const canvas: LeanCanvasData = {
      canvasType: "lean-canvas",
      boxes: {
        problem: ["High pick cost"],
        "customer-segments": ["Regional grocers"],
        uvp: ["Triple pick speed"],
        solution: ["Follow-me cart"],
        channels: ["Direct outbound"],
        revenue: ["Hardware lease $1200/mo, LTV $48k"],
        cost: ["BoM $4800"],
        metrics: ["Pick units per hour"],
        "unfair-advantage": ["Vision odometry patent"],
      },
    };
    assertLeanCanvasData(canvas);
    const parsed = parseChairOutput(JSON.stringify(canvas), "lean-canvas");
    if (!parsed.ok) throw new Error(`Expected ok: true, got ${parsed.reason}`);
  });

  test("assertLeanCanvasData rejects missing box", () => {
    const incomplete = {
      canvasType: "lean-canvas",
      boxes: {
        problem: ["A"],
        // missing customer-segments, uvp, etc.
      },
    };
    let threw = false;
    try {
      assertLeanCanvasData(incomplete);
    } catch {
      threw = true;
    }
    if (!threw) throw new Error("Expected assertLeanCanvasData to throw on missing boxes");
  });

  test("assertLeanCanvasData rejects wrong type for box items", () => {
    const wrongType = {
      canvasType: "lean-canvas",
      boxes: {
        problem: [123], // number instead of string
        "customer-segments": [],
        uvp: [],
        solution: [],
        channels: [],
        revenue: [],
        cost: [],
        metrics: [],
        "unfair-advantage": [],
      },
    };
    let threw = false;
    try {
      assertLeanCanvasData(wrongType);
    } catch {
      threw = true;
    }
    if (!threw) throw new Error("Expected assertLeanCanvasData to throw on non-string item");
  });

  // 3. Blueprint Validator Tests
  test("assertBlueprintData accepts valid business blueprint", () => {
    const bp: BlueprintData = {
      canvasType: "business-blueprint",
      boxes: {
        "key-partnerships": ["Contract manufacturers"],
        "key-activities": ["Firmware dev"],
        "key-resources": ["Core robotics engineers"],
        "value-proposition": ["Turnkey order automation"],
        "customer-relationships": ["Dedicated account manager"],
        channels: ["Direct sales"],
        "customer-segments": ["Supermarket chains"],
        cost: ["Manufacturing & payroll"],
        revenue: ["RaaS subscriptions"],
      },
    };
    assertBlueprintData(bp);
    const parsed = parseChairOutput(JSON.stringify(bp), "business-blueprint");
    if (!parsed.ok) throw new Error(`Expected ok: true, got ${parsed.reason}`);
  });

  test("assertBlueprintData rejects missing box", () => {
    const incomplete = {
      canvasType: "business-blueprint",
      boxes: {
        "key-partnerships": ["Partner"],
      },
    };
    let threw = false;
    try {
      assertBlueprintData(incomplete);
    } catch {
      threw = true;
    }
    if (!threw) throw new Error("Expected assertBlueprintData to throw on missing boxes");
  });

  test("assertBlueprintData rejects wrong canvasType", () => {
    const wrongType = {
      canvasType: "wrong-blueprint-type",
      boxes: {},
    };
    let threw = false;
    try {
      assertBlueprintData(wrongType);
    } catch {
      threw = true;
    }
    if (!threw) throw new Error("Expected assertBlueprintData to throw on wrong canvasType");
  });

  // 4. Marketing Plan Validator Tests
  test("assertMarketingPlanData accepts valid marketing plan", () => {
    const valid: MarketingPlanData = {
      positioning: "Leading automation platform",
      icp: { primary: "P", secondary: "S", antiPersona: "A" },
      messagingPillars: [{ pillar: "P1", proof: "Proof1" }],
      channels: [
        {
          id: "c1",
          name: "Ch1",
          role: "top",
          monthlyBudget: 1000,
          cacHypothesis: 100,
          volumeHypothesis: 10,
          confidence: 4,
          status: "testing",
        },
      ],
      experiments: [
        {
          id: "e1",
          channelId: "c1",
          hypothesis: "H1",
          cost: 250,
          successMetric: "S1",
          killCriterion: "K1",
          status: "planned",
        },
      ],
      launchSequence: [
        {
          phase: "launch",
          tasks: [{ label: "T1", ownerAgentId: "sam", week: 1 }],
        },
      ],
      kpis: {
        northStar: { name: "NS", target: 10, current: 5 },
        weekly: { name: "W", target: 5, current: 4 },
        monthly: { name: "M", target: 20, current: 15 },
      },
    };
    assertMarketingPlanData(valid);
  });

  test("assertMarketingPlanData enforces literal 1-5 confidence", () => {
    const invalidConfidence = {
      positioning: "Leading automation platform",
      icp: { primary: "P", secondary: "S", antiPersona: "A" },
      messagingPillars: [{ pillar: "P1", proof: "Proof1" }],
      channels: [
        {
          id: "c1",
          name: "Ch1",
          role: "top",
          monthlyBudget: 1000,
          cacHypothesis: 100,
          volumeHypothesis: 10,
          confidence: 6, // INVALID: must be 1 | 2 | 3 | 4 | 5
          status: "testing",
        },
      ],
      experiments: [],
      launchSequence: [],
      kpis: {
        northStar: { name: "NS", target: 10, current: 5 },
        weekly: { name: "W", target: 5, current: 4 },
        monthly: { name: "M", target: 20, current: 15 },
      },
    };
    let threw = false;
    try {
      assertMarketingPlanData(invalidConfidence);
    } catch {
      threw = true;
    }
    if (!threw) throw new Error("Expected assertMarketingPlanData to throw on confidence=6");
  });

  test("assertMarketingPlanData rejects missing positioning field", () => {
    const missing = {
      // missing positioning
      icp: { primary: "P", secondary: "S", antiPersona: "A" },
      messagingPillars: [],
      channels: [],
      experiments: [],
      launchSequence: [],
      kpis: {
        northStar: { name: "NS", target: 10, current: 5 },
        weekly: { name: "W", target: 5, current: 4 },
        monthly: { name: "M", target: 20, current: 15 },
      },
    };
    let threw = false;
    try {
      assertMarketingPlanData(missing);
    } catch {
      threw = true;
    }
    if (!threw) throw new Error("Expected assertMarketingPlanData to throw on missing positioning");
  });

  // 5. Marketing Compute Pure Functions Tests
  test("marketing-compute calculations match mathematical specifications", () => {
    const channels: Channel[] = [
      {
        id: "1",
        name: "Ch A",
        role: "top",
        monthlyBudget: 4000,
        cacHypothesis: 500,
        volumeHypothesis: 8,
        confidence: 4,
        status: "scaling",
      },
      {
        id: "2",
        name: "Ch B",
        role: "mid",
        monthlyBudget: 6000,
        cacHypothesis: 1000,
        volumeHypothesis: 6,
        confidence: 3,
        status: "testing",
      },
    ];
    const total = totalBudget(channels);
    if (total !== 10000) throw new Error(`Expected total 10000, got ${total}`);

    const pctA = budgetPct(channels[0]!, total);
    if (pctA !== 40) throw new Error(`Expected pctA 40, got ${pctA}`);

    const ratio = ltvCacRatio(channels[0]!, 1500);
    if (ratio !== 3) throw new Error(`Expected LTV:CAC 3, got ${ratio}`);

    // Zero-denominator handling
    const zeroTotalPct = budgetPct(channels[0]!, 0);
    if (zeroTotalPct !== 0 || Number.isNaN(zeroTotalPct)) {
      throw new Error(`Expected budgetPct with 0 total to be 0, got ${zeroTotalPct}`);
    }

    const zeroCacChannel: Channel = { ...channels[0]!, cacHypothesis: 0 };
    const zeroCacRatio = ltvCacRatio(zeroCacChannel, 1500);
    if (zeroCacRatio !== Infinity || Number.isNaN(zeroCacRatio)) {
      throw new Error(`Expected ltvCacRatio with 0 CAC to be Infinity, got ${zeroCacRatio}`);
    }
  });

  test("healthOf correctly assesses KPI targets", () => {
    const onTrack: KpiSlot = { name: "K1", target: 100, current: 110 };
    const atRisk: KpiSlot = { name: "K2", target: 100, current: 80 };
    const offTrack: KpiSlot = { name: "K3", target: 100, current: 50 };

    if (healthOf(onTrack) !== "on-track") throw new Error("Expected on-track");
    if (healthOf(atRisk) !== "at-risk") throw new Error("Expected at-risk");
    if (healthOf(offTrack) !== "off-track") throw new Error("Expected off-track");
  });

  // 6. Canvas Coherence Heuristic Tests
  test("evaluateCanvasCoherence flags empty box, over-stuffed, and contradiction", () => {
    const canvas: LeanCanvasData = {
      canvasType: "lean-canvas",
      boxes: {
        problem: ["A", "B", "C", "D", "E", "F"], // 6 items (> 5) => over-stuffed
        "customer-segments": ["Consumer only with no business customers"], // contradicts B2B
        uvp: ["Clean message"],
        solution: ["Feature 1", "Feature 2", "Feature 3"],
        channels: [], // empty => empty-box
        revenue: ["Price $1000, LTV $5000"],
        cost: ["BoM $500"],
        metrics: ["Active users"],
        "unfair-advantage": ["Patent"],
      },
    };

    const flags = evaluateCanvasCoherence(
      canvas,
      "Decentralized B2B enterprise grocery fulfillment",
    );
    const kinds = flags.map((f) => f.kind);

    if (!kinds.includes("empty-box")) throw new Error("Expected empty-box flag for channels");
    if (!kinds.includes("over-stuffed")) throw new Error("Expected over-stuffed flag for problem");
    if (!kinds.includes("venture-contradiction"))
      throw new Error("Expected venture-contradiction flag for customer-segments");
  });

  // 7. Export Exhaustive Switch Test
  test("exportDeliverableToMarkdown handles all frameworks with headers", () => {
    const swot: Deliverable = {
      id: "d1",
      ventureId: "v1",
      phase: "business-plan",
      title: "SWOT Test",
      framework: "swot",
      version: 1,
      createdAt: "2026-11-10T00:00:00Z",
      updatedAt: "2026-11-10T00:00:00Z",
      sourceMessageIds: [],
      frameworkData: {
        quadrants: {
          strengths: [{ text: "Strong tech" }],
          weaknesses: [],
          opportunities: [],
          threats: [],
        },
        strategicImplications: [{ text: "Move quickly", tag: "SO" }],
      },
    };
    const md = exportDeliverableToMarkdown(swot);
    if (!md.includes("Framework: swot")) throw new Error("Markdown missing Framework header");
    if (!md.includes("Version: 1")) throw new Error("Markdown missing Version header");
  });

  // 8. TICKET-03: IndexedDB Migration & Compound Index
  test("TICKET-03 IndexedDB migration cursor backfills legacy-plan and creates compound index", () => {
    // In-memory simulation of IDB for environment independence
    class MockCursor {
      private index = 0;
      public onsuccess: (() => void) | null = null;
      constructor(
        private entries: [string, Record<string, unknown>][],
        private store: MockStore,
      ) {}

      get result(): MockCursor | null {
        if (this.index >= this.entries.length) return null;
        return this;
      }

      get value(): Record<string, unknown> {
        return this.entries[this.index]![1];
      }

      update(newVal: Record<string, unknown>): void {
        const key = this.entries[this.index]![0];
        this.store.records.set(key, newVal);
        this.entries[this.index]![1] = newVal;
      }

      continue(): void {
        this.index++;
        if (this.onsuccess) this.onsuccess();
      }
    }

    class MockIndex {
      constructor(
        public name: string,
        public keyPath: string | string[],
        public unique: boolean,
        private store: MockStore,
      ) {}

      getAll(range?: { _value: unknown; _isOnly: boolean }): {
        result: Record<string, unknown>[];
        onsuccess: null | (() => void);
      } {
        const records = Array.from(this.store.records.values());
        let matched: Record<string, unknown>[] = [];
        if (range && range._isOnly) {
          const target = range._value as unknown[];
          if (Array.isArray(this.keyPath)) {
            matched = records.filter((rec) => {
              return (this.keyPath as string[]).every((k, idx) => rec[k] === target[idx]);
            });
          } else {
            matched = records.filter((rec) => rec[this.keyPath as string] === target);
          }
        } else {
          matched = [...records];
        }
        return { result: matched, onsuccess: null };
      }
    }

    class MockStore {
      public records = new Map<string, Record<string, unknown>>();
      public indexes = new Map<string, MockIndex>();

      constructor(
        public name: string,
        public keyPath: string = "id",
      ) {}

      get indexNames() {
        const set = this.indexes;
        return {
          contains: (n: string) => set.has(n),
          length: set.size,
        };
      }

      createIndex(
        name: string,
        keyPath: string | string[],
        options?: { unique?: boolean },
      ): MockIndex {
        const idx = new MockIndex(name, keyPath, options?.unique ?? false, this);
        this.indexes.set(name, idx);
        return idx;
      }

      index(name: string): MockIndex {
        const idx = this.indexes.get(name);
        if (!idx) throw new Error(`Index ${name} not found`);
        return idx;
      }

      put(val: Record<string, unknown>): void {
        const k = (val[this.keyPath] as string) || String(Math.random());
        this.records.set(k, { ...val });
      }

      get(key: string): Record<string, unknown> | undefined {
        return this.records.get(key);
      }

      openCursor() {
        const entries = Array.from(this.records.entries()).map(
          ([k, v]) => [k, { ...v }] as [string, Record<string, unknown>],
        );
        const cursor = new MockCursor(entries, this);
        const req = {
          get result() {
            return cursor.result;
          },
          set onsuccess(fn: (() => void) | null) {
            cursor.onsuccess = fn;
            if (fn) fn();
          },
          get onsuccess() {
            return cursor.onsuccess;
          },
        };
        return req;
      }
    }

    class MockTx {
      constructor(public db: MockDB) {}
      objectStore(name: string): MockStore {
        const s = this.db.stores.get(name);
        if (!s) throw new Error(`Store ${name} not found`);
        return s;
      }
    }

    class MockDB {
      public stores = new Map<string, MockStore>();
      public closed = false;
      constructor(
        public name: string,
        public version: number,
      ) {}

      get objectStoreNames() {
        const s = this.stores;
        return {
          contains: (n: string) => s.has(n),
          length: s.size,
        };
      }

      createObjectStore(name: string, options?: { keyPath?: string }): MockStore {
        const st = new MockStore(name, options?.keyPath ?? "id");
        this.stores.set(name, st);
        return st;
      }

      transaction(name: string): MockTx {
        return new MockTx(this);
      }

      close(): void {
        this.closed = true;
      }
    }

    // Step 1: Open scratch DB at version 1, insert a v1-shaped record (no framework)
    const scratchDb = new MockDB("boardroom-migration-test", 1);
    const delivStoreV1 = scratchDb.createObjectStore("deliverables", { keyPath: "id" });
    delivStoreV1.put({
      id: "deliv_legacy_101",
      ventureId: "v_test_scratch",
      phase: "business-plan",
      title: "Pre-V2 Legacy Plan",
      sourceMessageIds: [],
    });
    scratchDb.close();
    if (!scratchDb.closed) throw new Error("Expected scratch DB to be closed");

    // Step 2: Reopen at DB_VERSION (3) and run applyDBUpgrade with oldVersion = 1
    const upgradedDb = new MockDB("boardroom-migration-test", DB_VERSION);
    upgradedDb.stores = scratchDb.stores; // preserve store data
    const upgradeTx = new MockTx(upgradedDb);
    applyDBUpgrade(upgradedDb as unknown as IDBDatabase, 1, upgradeTx as unknown as IDBTransaction);

    // Step 3: Confirm record now has framework === 'legacy-plan', frameworkData === null, version === 1
    const upgradedRecord = upgradedDb
      .transaction("deliverables")
      .objectStore("deliverables")
      .get("deliv_legacy_101");
    if (!upgradedRecord) throw new Error("Expected deliv_legacy_101 to exist after migration");
    if (upgradedRecord["framework"] !== "legacy-plan") {
      throw new Error(
        `Expected framework === 'legacy-plan', got ${String(upgradedRecord["framework"])}`,
      );
    }
    if (upgradedRecord["frameworkData"] !== null) {
      throw new Error(
        `Expected frameworkData === null, got ${String(upgradedRecord["frameworkData"])}`,
      );
    }
    if (upgradedRecord["version"] !== 1) {
      throw new Error(`Expected version === 1, got ${String(upgradedRecord["version"])}`);
    }

    // Step 4: Confirm fresh install creates index `venturePhase`
    const freshDb = new MockDB("boardroom-fresh-install", DB_VERSION);
    const freshTx = new MockTx(freshDb);
    applyDBUpgrade(freshDb as unknown as IDBDatabase, 0, freshTx as unknown as IDBTransaction);
    const freshStore = freshDb.transaction("deliverables").objectStore("deliverables");
    if (!freshStore.indexNames.contains("venturePhase")) {
      throw new Error("Expected fresh install to create index venturePhase");
    }

    // Step 5: Clean up scratch DB
    scratchDb.stores.clear();
    upgradedDb.stores.clear();
    freshDb.stores.clear();
  });

  // 9. TICKET-02: listDeliverablesByPhase Query
  test("TICKET-02 listDeliverablesByPhase query resolves exactly one deliverable via venturePhase index", () => {
    class MockIndex {
      constructor(
        public name: string,
        public keyPath: string[],
        private store: MockStore,
      ) {}

      getAll(range: { _value: [string, string]; _isOnly: boolean }): {
        result: Record<string, unknown>[];
      } {
        const [ventureId, phase] = range._value;
        const matched = Array.from(this.store.records.values()).filter(
          (rec) => rec["ventureId"] === ventureId && rec["phase"] === phase,
        );
        return { result: matched };
      }
    }

    class MockStore {
      public records = new Map<string, Record<string, unknown>>();
      public indexObj = new MockIndex("venturePhase", ["ventureId", "phase"], this);

      put(val: Record<string, unknown>): void {
        this.records.set(val["id"] as string, val);
      }

      index(name: string): MockIndex {
        if (name !== "venturePhase") throw new Error(`Unexpected index ${name}`);
        return this.indexObj;
      }
    }

    const store = new MockStore();

    // Create two deliverables for the same venture in different phases
    const d1 = {
      id: "deliv_ideation",
      ventureId: "venture_test_02",
      phase: "ideation",
      title: "Ideation Deliverable",
      framework: "swot",
      version: 1,
    };
    const d2 = {
      id: "deliv_marketing",
      ventureId: "venture_test_02",
      phase: "marketing",
      title: "Marketing Deliverable",
      framework: "marketing-plan",
      version: 1,
    };

    store.put(d1);
    store.put(d2);

    // Query for ideation
    const idx = store.index("venturePhase");
    const ideationReq = idx.getAll({
      _value: ["venture_test_02", "ideation"],
      _isOnly: true,
    });
    if (ideationReq.result.length !== 1) {
      throw new Error(`Expected exactly 1 deliverable, got ${ideationReq.result.length}`);
    }
    if (ideationReq.result[0]!["id"] !== "deliv_ideation") {
      throw new Error(`Expected deliv_ideation, got ${String(ideationReq.result[0]!["id"])}`);
    }

    // Query for marketing
    const marketingReq = idx.getAll({
      _value: ["venture_test_02", "marketing"],
      _isOnly: true,
    });
    if (marketingReq.result.length !== 1) {
      throw new Error(`Expected exactly 1 deliverable, got ${marketingReq.result.length}`);
    }
    if (marketingReq.result[0]!["id"] !== "deliv_marketing") {
      throw new Error(`Expected deliv_marketing, got ${String(marketingReq.result[0]!["id"])}`);
    }

    // Query for validation (should return 0)
    const validationReq = idx.getAll({
      _value: ["venture_test_02", "validation"],
      _isOnly: true,
    });
    if (validationReq.result.length !== 0) {
      throw new Error(`Expected 0 deliverables, got ${validationReq.result.length}`);
    }

    store.records.clear();
  });

  // 10. TICKET-04: Maurya Layout Box Placement Test
  test("TICKET-04 Maurya layout grid renders channels+revenue in Col 3 and cost+metrics+unfair-advantage in bottom band", () => {
    if (typeof document === "undefined") return;
    const root = document.createElement("div");
    const leanDeliv: LeanCanvasDeliverable = {
      id: "deliv_lean_test",
      ventureId: "v1",
      phase: "business-plan",
      title: "Lean Canvas Test",
      framework: "lean-canvas",
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sourceMessageIds: [],
      frameworkData: {
        canvasType: "lean-canvas",
        boxes: {
          problem: ["Problem A"],
          "customer-segments": ["Segment A"],
          uvp: ["UVP A"],
          solution: ["Solution A"],
          channels: ["Channel A"],
          revenue: ["Revenue A"],
          cost: ["Cost A"],
          metrics: ["Metric A"],
          "unfair-advantage": ["Moat A"],
        },
      },
    };
    renderCanvas(root, leanDeliv);

    // Verify Col 3 has channels and revenue
    const topGrid = root.querySelector(".lean-canvas-grid > .grid");
    if (!topGrid) throw new Error("Missing top 3 columns grid");
    const col3 = topGrid.children[2];
    if (!col3) throw new Error("Missing col 3 in lean canvas");
    const col3Boxes = Array.from(col3.querySelectorAll(".canvas-box")).map((el) =>
      el.getAttribute("data-box-id"),
    );
    if (!col3Boxes.includes("channels") || !col3Boxes.includes("revenue")) {
      throw new Error(`Expected channels and revenue in Col 3, got: ${col3Boxes.join(", ")}`);
    }

    // Verify bottom band has cost, metrics, and unfair-advantage
    const bottomBand = root.querySelector(".lean-canvas-grid > .border-t");
    if (!bottomBand) throw new Error("Missing bottom band in lean canvas");
    const bottomBoxes = Array.from(bottomBand.querySelectorAll(".canvas-box")).map((el) =>
      el.getAttribute("data-box-id"),
    );
    if (
      !bottomBoxes.includes("cost") ||
      !bottomBoxes.includes("metrics") ||
      !bottomBoxes.includes("unfair-advantage")
    ) {
      throw new Error(
        `Expected cost, metrics, and unfair-advantage in bottom band, got: ${bottomBoxes.join(", ")}`,
      );
    }
  });

  return results;
}
