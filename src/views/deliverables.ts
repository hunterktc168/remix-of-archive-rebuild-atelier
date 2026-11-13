import { exportDeliverableToHtml, exportDeliverableToMarkdown, exportVentureFull } from "../export";
import { getDeliverablesForVenture, getVenture, saveDeliverable } from "../db";
import type {
  BlueprintDeliverable,
  Deliverable,
  FrameworkId,
  LeanCanvasDeliverable,
  MarketingDeliverable,
  SwotDeliverable,
} from "../types/deliverables";
import { renderDeliverable } from "./deliverable";

/**
 * Creates seed deliverables for a venture if none exist yet, ensuring
 * that SWOT, Lean Canvas, Business Blueprint, and Marketing Plan workspaces are immediately functional.
 */
export async function seedDeliverablesIfEmpty(ventureId: string): Promise<Deliverable[]> {
  const existing = await getDeliverablesForVenture(ventureId);
  if (existing.length > 0) return existing;

  const now = new Date().toISOString();

  const swot: SwotDeliverable = {
    id: `deliv_${ventureId}_swot`,
    ventureId,
    phase: "business-plan",
    framework: "swot",
    title: "Apex Robotics — Strategic SWOT Analysis",
    version: 1,
    createdAt: now,
    updatedAt: now,
    sourceMessageIds: ["m1", "m2"],
    frameworkData: {
      quadrants: {
        strengths: [
          {
            text: "Proprietary differential-drive kinematics for narrow 28-inch grocery aisles",
            sourceAgentId: "maya",
          },
          {
            text: "Demonstrated 3.8x faster pick-cycle vs standard manual grocery carts in simulation",
            sourceAgentId: "sam",
          },
          {
            text: "Zero warehouse retrofitting required: navigates standard polished concrete without floor tape",
            sourceAgentId: "priya",
          },
        ],
        weaknesses: [
          {
            text: "High initial bill-of-materials cost ($4,800/unit) at sub-scale fabrication volume",
            sourceAgentId: "elena",
          },
          {
            text: "LiDAR component lead times currently average 8 weeks due to tier-1 supply backlog",
            sourceAgentId: "priya",
          },
        ],
        opportunities: [
          {
            text: "38% CAGR in decentralized grocery micro-fulfillment automation demand nationwide",
            sourceAgentId: "marcus",
          },
          {
            text: "Mid-sized supermarket chains actively seeking automation to defend against Amazon Fresh",
            sourceAgentId: "david",
          },
        ],
        threats: [
          {
            text: "Incumbent automated guided vehicle (AGV) vendors launching low-cost retrofit kits",
            sourceAgentId: "david",
          },
          {
            text: "Tightening OSHA state guidelines for mixed human-robot shared pick corridors",
            sourceAgentId: "priya",
          },
        ],
      },
      strategicImplications: [
        {
          text: "Partner with regional supermarket co-ops to deploy turnkey pilot pods before incumbent retrofits mature",
          tag: "SO",
        },
        {
          text: "Migrate perception stack to commercial off-the-shelf stereo depth cameras to cut sensor BoM by 35%",
          tag: "WO",
        },
        {
          text: "File defensive utility patents on dynamic human-cart aisle yield behavior to block retrofitters",
          tag: "ST",
        },
        {
          text: "Enforce virtual geofenced corridor speed throttling to guarantee OSHA compliance in shared aisles",
          tag: "WT",
        },
      ],
    },
  };

  const leanCanvas: LeanCanvasDeliverable = {
    id: `deliv_${ventureId}_lean_canvas`,
    ventureId,
    phase: "business-plan",
    framework: "lean-canvas",
    title: "Apex Robotics — Lean Startup Canvas",
    version: 1,
    createdAt: now,
    updatedAt: now,
    sourceMessageIds: ["m3"],
    frameworkData: {
      canvasType: "lean-canvas",
      boxes: {
        problem: [
          "In-store online order picking costs grocers $12+ per order, destroying digital grocery margins",
          "Human pickers walk 12–16 miles daily, driving 65% annual warehouse turnover and high injury rates",
          "Alternative: Manual push carts with barcode handhelds (slow, prone to mispicks)",
        ],
        "customer-segments": [
          "Regional supermarket chains with 40–250 physical store footprints",
          "Early adopters: High-volume urban micro-fulfillment dark stores processing >1,500 orders/day",
        ],
        uvp: [
          "Autonomous micro-fulfillment cart fleet that triples picker units per hour with zero store remodeling",
          'The "Roomba for grocery order picking" — drops in and runs in under 48 hours',
        ],
        solution: [
          "Autonomous follow-me cart with dynamic aisle routing and turn-by-turn pick guidance",
          "Integrated precision optical weight verification eliminating packing audit delays",
          "Fleet dispatch manager optimizing multi-order batching across simultaneous pickers",
        ],
        channels: [
          "Direct enterprise sales to VP of Supply Chain & VP of E-Commerce Operations",
          "Live floor demonstration tours at industry trade expos (ProMat, Manifest, NRF)",
          "High-intent SEO and whitepapers on e-grocery unit economics",
        ],
        revenue: [
          "Hardware lease + software platform: $1,200/cart/month on 36-month enterprise agreements",
          "Implementation, floor mapping, and staff onboarding fee: $15,000 per facility",
          "LTV: $48,000 per cart over 3-year operating contract",
        ],
        cost: [
          "Cart hardware manufacturing & sensor BoM: $4,800/unit at pilot scale",
          "Field deployment engineering & initial warehouse laser mapping: $3,200/store",
          "Enterprise sales cycle customer acquisition cost (CAC): $8,500/signed facility",
          "Cloud robotics telemetry & fleet compute: $65/cart/month",
        ],
        metrics: [
          "Pick units per labor hour (PPH) — baseline 60 PPH increasing to target 190 PPH",
          "Cart fleet operational uptime percentage (> 99.4%)",
          "Customer payback period (< 8.5 months based on labor redeployment)",
        ],
        "unfair-advantage": [
          "Patented low-cost optical ground-texture odometry achieving 2mm localization with zero ceiling beacons",
        ],
      },
    },
  };

  const blueprint: BlueprintDeliverable = {
    id: `deliv_${ventureId}_blueprint`,
    ventureId,
    phase: "business-plan",
    framework: "business-blueprint",
    title: "Apex Robotics — Business Model Blueprint",
    version: 1,
    createdAt: now,
    updatedAt: now,
    sourceMessageIds: ["m4"],
    frameworkData: {
      canvasType: "business-blueprint",
      boxes: {
        "key-partnerships": [
          "Contract mechatronics manufacturing partners for scalable frame assembly",
          "Industrial battery cell suppliers guaranteeing 14-hour continuous shift runtime",
          "Regional grocery logistics system integrators offering tier-1 support SLAs",
        ],
        "key-activities": [
          "Autonomous navigation software engineering and dynamic aisle obstacle avoidance",
          "Warehouse facility floor mapping, sensor calibration, and ERP/WMS API integration",
          "Customer success onboarding, picker training, and fleet health monitoring",
        ],
        "key-resources": [
          "Proprietary ground-texture odometry and optical localization patents",
          "Core engineering team across robotics, embedded systems, and supply chain software",
          "Pilot testing facility equipped with standard commercial grocery racking and lighting",
        ],
        "value-proposition": [
          "Turnkey mobile robotics doubling grocery fulfillment capacity with zero downtime",
          "Immediate labor payback and 70% reduction in worker walking fatigue",
          "Seamless integration with SAP, Manhattan Associates, and Blue Yonder WMS platforms",
        ],
        "customer-relationships": [
          "Dedicated enterprise technical account executive and on-site deployment engineer",
          "24/7 automated remote telemetry monitoring with predictive hardware maintenance",
          "Quarterly executive business reviews analyzing labor efficiency and pick accuracy metrics",
        ],
        channels: [
          "Direct enterprise outbound targeting supply chain executives",
          "Strategic partnerships with grocery automation and conveyor integrators",
          "Executive pilot demonstrations in operational customer flagship stores",
        ],
        "customer-segments": [
          "Regional and national supermarket chains with expanding digital pickup volumes",
          "Urban quick-commerce dark store operators requiring high-density throughput",
          "Third-party logistics (3PL) providers operating food and grocery fulfillment hubs",
        ],
        cost: [
          "Hardware contract manufacturing and sensor procurement",
          "Robotics and software engineering payroll",
          "Field deployment, mapping, and customer integration engineering",
          "Enterprise sales commission and trade marketing expenditures",
        ],
        revenue: [
          "Multi-year Robotics-as-a-Service (RaaS) subscription fees per cart",
          "Initial warehouse mapping, software integration, and staff training fees",
          "Premium SLA maintenance and priority 4-hour hardware replacement warranties",
        ],
      },
    },
  };

  const marketing: MarketingDeliverable = {
    id: `deliv_${ventureId}_marketing`,
    ventureId,
    phase: "marketing",
    framework: "marketing-plan",
    title: "Apex Robotics — Marketing Strategy Workbench",
    version: 1,
    createdAt: now,
    updatedAt: now,
    sourceMessageIds: ["m5"],
    levers: {
      monthlyBudget: 10000,
      primaryGoal: "signups",
      riskAppetite: "balanced",
    },
    frameworkData: {
      positioning:
        "For regional grocers losing margin on digital orders, Apex Robotics is the only autonomous cart fleet that triples fulfillment speed without remodeling stores or installing floor beacons.",
      icp: {
        primary: "VP of Supply Chain & Logistics at regional supermarket chains (40–200 stores)",
        secondary: "Head of Operations at high-density urban micro-fulfillment dark stores",
        antiPersona: "Single-location independent grocers without digital fulfillment volume",
      },
      messagingPillars: [
        {
          pillar: "Triple Picker Throughput",
          proof:
            "Field pilots validate jump from 60 to 195 units picked per hour in standard aisles.",
        },
        {
          pillar: "Zero Facility Downtime",
          proof:
            "Vision odometry eliminates floor magnetic tape, ceiling reflectors, and construction delays.",
        },
        {
          pillar: "Sub-9 Month Unit Payback",
          proof:
            "Calculated labor savings offset lease cost within 240 days of standard two-shift operation.",
        },
      ],
      channels: [
        {
          id: "ch_linkedin_abm",
          name: "Executive ABM on LinkedIn",
          role: "top",
          monthlyBudget: 4000,
          cacHypothesis: 1400,
          volumeHypothesis: 12,
          confidence: 4,
          status: "scaling",
        },
        {
          id: "ch_logistics_expos",
          name: "Logistics Industry Expos & Tours",
          role: "mid",
          monthlyBudget: 3500,
          cacHypothesis: 2100,
          volumeHypothesis: 8,
          confidence: 3,
          status: "testing",
        },
        {
          id: "ch_technical_whitepapers",
          name: "SEO & Inbound Unit Economics Whitepapers",
          role: "top",
          monthlyBudget: 1500,
          cacHypothesis: 750,
          volumeHypothesis: 16,
          confidence: 4,
          status: "scaling",
        },
        {
          id: "ch_direct_mail_samples",
          name: "Account-Based Direct Mail & Video Audits",
          role: "bottom",
          monthlyBudget: 1000,
          cacHypothesis: 950,
          volumeHypothesis: 6,
          confidence: 3,
          status: "testing",
        },
      ],
      experiments: [
        {
          id: "exp_1",
          channelId: "ch_linkedin_abm",
          hypothesis:
            "Sending bespoke warehouse floor 3D simulation videos will double meeting booking rate.",
          cost: 1200,
          successMetric: "≥ 8 qualified VP meetings from 40 targeted accounts",
          killCriterion: "< 2 meetings after 3 weeks",
          status: "running",
        },
        {
          id: "exp_2",
          channelId: "ch_logistics_expos",
          hypothesis:
            "Live obstacle-avoidance demonstration in simulated grocery aisle booth drives on-site pilot signups.",
          cost: 2500,
          successMetric: "≥ 15 signed pilot letters of intent (LOI)",
          killCriterion: "< 3 LOIs at Manifest trade expo",
          status: "planned",
        },
        {
          id: "exp_3",
          channelId: "ch_technical_whitepapers",
          hypothesis:
            "Interactive e-grocery labor cost calculator captures organic inbound VP email leads.",
          cost: 800,
          successMetric: "30+ verified enterprise domain downloads per month",
          killCriterion: "< 5 downloads in first 14 days",
          status: "won",
        },
      ],
      launchSequence: [
        {
          phase: "pre-launch",
          tasks: [
            {
              label: "Map top 150 regional grocery chains by store density",
              ownerAgentId: "marcus",
              week: 1,
            },
            {
              label: "Publish whitepaper on labor inflation in retail logistics",
              ownerAgentId: "elena",
              week: 2,
            },
            {
              label: "Produce high-fidelity 90-second autonomous cart video",
              ownerAgentId: "marcus",
              week: 3,
            },
          ],
        },
        {
          phase: "launch",
          tasks: [
            {
              label: "Drop public press release & open executive pilot portal",
              ownerAgentId: "marcus",
              week: 5,
            },
            {
              label: "Host live webinar with pilot grocer operations director",
              ownerAgentId: "sam",
              week: 6,
            },
            {
              label: "Execute outbound follow-ups with all attendees",
              ownerAgentId: "marcus",
              week: 7,
            },
          ],
        },
        {
          phase: "scale",
          tasks: [
            {
              label: "Launch customer referral rebate program for signed chains",
              ownerAgentId: "elena",
              week: 9,
            },
            {
              label: "Expand field sales coverage to Southeast and Western regions",
              ownerAgentId: "marcus",
              week: 11,
            },
          ],
        },
      ],
      kpis: {
        northStar: { name: "Signed Enterprise Pilot Contracts", target: 8, current: 6 },
        weekly: { name: "VP Discovery & Floor Audit Calls", target: 12, current: 10 },
        monthly: { name: "Pipeline Value Generated ($)", target: 450000, current: 380000 },
      },
    },
  };

  await saveDeliverable(swot);
  await saveDeliverable(leanCanvas);
  await saveDeliverable(blueprint);
  await saveDeliverable(marketing);

  return [swot, leanCanvas, blueprint, marketing];
}

export async function renderDeliverables(
  root: HTMLElement,
  params: { ventureId?: string; deliverableId?: string; phase?: string; framework?: string } = {},
): Promise<void> {
  const ventureId = params.ventureId || "default";
  const venture = await getVenture(ventureId);
  const ventureName = venture?.name || "Apex Robotics";

  // Seed default deliverables if empty so user has immediate access to all 3 workspaces
  const allDeliverables = await seedDeliverablesIfEmpty(ventureId);

  // Active filter or selected deliverable
  let activeFramework: FrameworkId | "all" = (params.framework as FrameworkId) || "swot";
  let selectedDeliverableId: string | null = params.deliverableId || null;

  const renderUI = (): void => {
    // If a specific deliverable is selected, render its dedicated workspace
    if (selectedDeliverableId) {
      const selected = allDeliverables.find((d) => d.id === selectedDeliverableId);
      if (selected) {
        root.innerHTML = `
          <div class="space-y-4">
            <div class="flex items-center justify-between pb-2">
              <button id="back-to-archive-btn" class="btn btn-ghost text-xs py-1.5 px-3 border border-subtle text-slate-300 hover:text-white flex items-center gap-1.5">
                ← Back to Deliverables Archive
              </button>
              <div class="text-xs text-muted font-mono">
                Viewing: <strong class="text-slate-200">${selected.framework}</strong> (v${selected.version})
              </div>
            </div>
            <div id="workspace-mount-root"></div>
          </div>
        `;

        const mount = root.querySelector<HTMLElement>("#workspace-mount-root");
        if (mount) {
          renderDeliverable(mount, selected);
        }

        root.querySelector("#back-to-archive-btn")?.addEventListener("click", () => {
          selectedDeliverableId = null;
          renderUI();
        });
        return;
      }
    }

    // Otherwise render the Deliverables Archive with workspace tabs
    const filteredDeliverables =
      activeFramework === "all"
        ? allDeliverables
        : allDeliverables.filter((d) => d.framework === activeFramework);

    root.innerHTML = `
      <div class="deliverables-archive space-y-6">
        <!-- Archive Header -->
        <div class="panel p-6 border-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div class="flex items-center gap-2 mb-1">
              <span class="chip text-xs bg-brass/10 border-brass/30 text-brass-light font-mono font-semibold">
                EXECUTIVE DELIVERABLES ARCHIVE
              </span>
              <span class="chip text-xs bg-base border-subtle text-muted font-mono">
                ${allDeliverables.length} Frameworks Ratified
              </span>
            </div>
            <h1 class="font-serif text-3xl text-slate-100">${ventureName} — Strategic Deliverables</h1>
            <p class="text-xs text-muted">
              Explore, edit, stress-test, and export official board milestone frameworks.
            </p>
          </div>

          <div class="flex items-center gap-2">
            <button id="full-export-md-btn" class="btn btn-ghost text-xs py-1.5 px-3 border border-subtle text-slate-300 hover:text-white flex items-center gap-1.5">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              <span>Export Full Dossier (.md)</span>
            </button>
          </div>
        </div>

        <!-- Framework Workspace Selector Bar -->
        <div class="flex items-center gap-1 border-b border-subtle overflow-x-auto pb-px" role="tablist">
          <button type="button" class="tab-btn px-4 py-2.5 text-xs font-mono font-semibold border-b-2 transition-all shrink-0 ${
            activeFramework === "swot"
              ? "border-brass text-brass-light"
              : "border-transparent text-muted hover:text-slate-200"
          }" data-fw="swot">
            1. SWOT Workspace
          </button>
          <button type="button" class="tab-btn px-4 py-2.5 text-xs font-mono font-semibold border-b-2 transition-all shrink-0 ${
            activeFramework === "lean-canvas"
              ? "border-brass text-brass-light"
              : "border-transparent text-muted hover:text-slate-200"
          }" data-fw="lean-canvas">
            2. Lean Canvas Workspace
          </button>
          <button type="button" class="tab-btn px-4 py-2.5 text-xs font-mono font-semibold border-b-2 transition-all shrink-0 ${
            activeFramework === "business-blueprint"
              ? "border-brass text-brass-light"
              : "border-transparent text-muted hover:text-slate-200"
          }" data-fw="business-blueprint">
            3. Blueprint Workspace
          </button>
          <button type="button" class="tab-btn px-4 py-2.5 text-xs font-mono font-semibold border-b-2 transition-all shrink-0 ${
            activeFramework === "marketing-plan"
              ? "border-brass text-brass-light"
              : "border-transparent text-muted hover:text-slate-200"
          }" data-fw="marketing-plan">
            4. Marketing Plan Workbench
          </button>
          <button type="button" class="tab-btn px-4 py-2.5 text-xs font-mono font-semibold border-b-2 transition-all shrink-0 ${
            activeFramework === "all"
              ? "border-brass text-brass-light"
              : "border-transparent text-muted hover:text-slate-200"
          }" data-fw="all">
            All Archive Cards
          </button>
        </div>

        <!-- Embedded Workspace View (when a specific framework is active) -->
        ${
          activeFramework !== "all"
            ? `<div id="embedded-workspace-container"></div>`
            : `
          <!-- Archive List Grid -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            ${filteredDeliverables
              .map(
                (d) => `
              <div class="panel p-5 border-subtle flex flex-col justify-between space-y-4 hover:border-slate-500 transition-colors">
                <div class="space-y-2">
                  <div class="flex items-center justify-between gap-2">
                    <span class="chip text-[10px] font-mono uppercase bg-brass/10 border-brass/30 text-brass-light">
                      ${d.framework}
                    </span>
                    <span class="text-xs font-mono text-muted">v${d.version} · Phase: ${d.phase}</span>
                  </div>
                  <h3 class="font-serif text-xl text-slate-100">${d.title}</h3>
                  <p class="text-xs text-muted leading-relaxed">
                    Last ratified: ${new Date(d.updatedAt).toLocaleDateString()} at ${new Date(d.updatedAt).toLocaleTimeString()}
                  </p>
                </div>

                <div class="flex items-center justify-between pt-3 border-t border-subtle">
                  <button class="open-workspace-btn btn btn-primary text-xs py-1.5 px-3" data-id="${d.id}">
                    Open Workspace →
                  </button>
                  <button class="copy-card-md-btn btn btn-ghost text-xs py-1.5 px-2.5 border border-subtle" data-id="${d.id}">
                    Copy .md
                  </button>
                </div>
              </div>
            `,
              )
              .join("")}
          </div>
        `
        }
      </div>
    `;

    // If an embedded workspace is rendered, mount it directly
    if (activeFramework !== "all") {
      const targetDeliv = allDeliverables.find((d) => d.framework === activeFramework);
      const container = root.querySelector<HTMLElement>("#embedded-workspace-container");
      if (targetDeliv && container) {
        renderDeliverable(container, targetDeliv);
      }
    }

    bindArchiveEvents();
  };

  const bindArchiveEvents = (): void => {
    // Tab switching
    root.querySelectorAll<HTMLButtonElement>(".tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeFramework = btn.dataset["fw"] as FrameworkId | "all";
        renderUI();
      });
    });

    // Open Workspace button
    root.querySelectorAll<HTMLButtonElement>(".open-workspace-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        selectedDeliverableId = btn.dataset["id"]!;
        renderUI();
      });
    });

    // Copy card Markdown
    root.querySelectorAll<HTMLButtonElement>(".copy-card-md-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset["id"]!;
        const target = allDeliverables.find((d) => d.id === id);
        if (target) {
          const md = exportDeliverableToMarkdown(target);
          await navigator.clipboard.writeText(md);
          btn.textContent = "Copied!";
          setTimeout(() => {
            btn.textContent = "Copy .md";
          }, 1800);
        }
      });
    });

    // Full dossier export
    root.querySelector("#full-export-md-btn")?.addEventListener("click", async () => {
      const full = await exportVentureFull(ventureId);
      const blob = new Blob([full], { type: "text/markdown;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${ventureName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-full-dossier.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  };

  renderUI();
}
