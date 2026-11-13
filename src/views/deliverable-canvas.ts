import { exportCanvasToHtml, exportCanvasToMarkdown } from "../export";
import { getVenture, saveDeliverable, saveVenture } from "../db";
import { FRAMEWORKS } from "../schemas";
import type {
  BlueprintBox,
  BlueprintData,
  BlueprintDeliverable,
  CoherenceFlag,
  CoherenceIssueKind,
  LeanCanvasBox,
  LeanCanvasData,
  LeanCanvasDeliverable,
} from "../types/deliverables";
import { BLUEPRINT_BOXES, LEAN_CANVAS_BOXES } from "../schemas";

export function evaluateCanvasCoherence(
  d: LeanCanvasData | BlueprintData,
  ventureOneliner?: string,
): CoherenceFlag[] {
  const flags: CoherenceFlag[] = [];
  const onelinerLower = (ventureOneliner ?? "").toLowerCase();

  const isLean = d.canvasType === "lean-canvas";
  const boxKeys = isLean ? LEAN_CANVAS_BOXES : BLUEPRINT_BOXES;

  for (const boxId of boxKeys) {
    const items = isLean
      ? (d as LeanCanvasData).boxes[boxId as LeanCanvasBox]
      : (d as BlueprintData).boxes[boxId as BlueprintBox];

    // 1. Empty Box Check
    if (items.length === 0 || items.every((it) => !it.trim())) {
      flags.push({
        boxId,
        kind: "empty-box",
        message: `Box "${boxId}" is empty. Hypotheses are required to avoid blind spots.`,
      });
      continue;
    }

    // 2. Over-stuffed Box Check (> 5 bullets)
    if (items.length > 5) {
      flags.push({
        boxId,
        kind: "over-stuffed",
        message: `Box "${boxId}" has ${items.length} items (exceeds recommended 5 max focus limit).`,
      });
    }

    // 3. Venture Contradiction Check
    if (onelinerLower) {
      for (const item of items) {
        const textLower = item.toLowerCase();

        // Contradiction: B2B vs Consumer only
        if (
          (onelinerLower.includes("b2b") ||
            onelinerLower.includes("enterprise") ||
            onelinerLower.includes("fleet")) &&
          (textLower.includes("strictly b2c") ||
            textLower.includes("consumer only") ||
            textLower.includes("no business customers"))
        ) {
          flags.push({
            boxId,
            kind: "venture-contradiction",
            message: `Box "${boxId}" specifies consumer-only focus, contradicting enterprise oneliner.`,
          });
        }

        // Contradiction: Hardware/Robotics vs Zero hardware
        if (
          (onelinerLower.includes("robotic") ||
            onelinerLower.includes("hardware") ||
            onelinerLower.includes("cart")) &&
          (textLower.includes("zero hardware") ||
            textLower.includes("pure software only with no hardware"))
        ) {
          flags.push({
            boxId,
            kind: "venture-contradiction",
            message: `Box "${boxId}" claims zero hardware, contradicting physical robotics thesis.`,
          });
        }

        // Contradiction: Free product vs Subscription/Paid thesis
        if (
          (onelinerLower.includes("subscription") ||
            onelinerLower.includes("saas") ||
            onelinerLower.includes("paid")) &&
          (textLower.includes("completely free with no monetization plan") ||
            textLower.includes("never charge users"))
        ) {
          flags.push({
            boxId,
            kind: "venture-contradiction",
            message: `Box "${boxId}" denies monetization, contradicting paid thesis.`,
          });
        }
      }
    }
  }

  return flags;
}

function cloneCanvasData<T extends LeanCanvasData | BlueprintData>(data: T): T {
  if (data.canvasType === "lean-canvas") {
    const boxes = {} as Record<LeanCanvasBox, string[]>;
    for (const b of LEAN_CANVAS_BOXES) {
      boxes[b] = [...data.boxes[b]];
    }
    return { canvasType: "lean-canvas", boxes } as T;
  } else {
    const boxes = {} as Record<BlueprintBox, string[]>;
    for (const b of BLUEPRINT_BOXES) {
      boxes[b] = [...data.boxes[b]];
    }
    return { canvasType: "business-blueprint", boxes } as T;
  }
}

export function renderCanvas(
  root: HTMLElement,
  initialDeliverable: LeanCanvasDeliverable | BlueprintDeliverable,
): void {
  let current = initialDeliverable;
  let workingData = cloneCanvasData(current.frameworkData);
  let isDirty = false;
  let activeCritique: string | null = null;
  let isStreamingCritique = false;
  let ventureThesis = "";

  // Fetch venture thesis for coherence check
  void getVenture(current.ventureId)
    .then((v) => {
      if (v) {
        ventureThesis = v.oneliner || v.thesis || "";
        renderUI();
      }
    })
    .catch(() => {
      // Gracefully ignore in non-browser or test environments without IndexedDB
    });

  const getVersionsList = (): Array<LeanCanvasDeliverable | BlueprintDeliverable> => {
    const list: Array<LeanCanvasDeliverable | BlueprintDeliverable> = [];
    if (current.versions && current.versions.length > 0) {
      for (const v of current.versions) {
        if (v.framework === current.framework) {
          list.push(v as LeanCanvasDeliverable | BlueprintDeliverable);
        }
      }
    }
    if (!list.some((v) => v.version === current.version)) {
      list.push(current);
    }
    return list.sort((a, b) => b.version - a.version);
  };

  const renderUI = (): void => {
    const versions = getVersionsList();
    const isLean = workingData.canvasType === "lean-canvas";
    const canvasName = isLean
      ? "Lean Startup Canvas (Ash Maurya)"
      : "Business Model Blueprint (Alex Osterwalder)";
    const coherenceFlags = evaluateCanvasCoherence(workingData, ventureThesis);

    root.innerHTML = `
      <div class="canvas-workspace space-y-6">
        <!-- Top Action Bar -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-xl border border-subtle bg-panel shadow-sm">
          <div class="space-y-1">
            <div class="flex items-center gap-2">
              <span class="chip text-xs bg-brass/10 border-brass/30 text-brass-light font-mono font-semibold">
                PHASE 03 · BUSINESS PLAN
              </span>
              <span class="chip text-xs bg-base border-subtle text-muted font-mono">
                v${current.version}
              </span>
              ${isDirty ? '<span class="chip text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/30 font-mono">Unsaved edits</span>' : ""}
              ${
                coherenceFlags.length > 0
                  ? `<span class="chip text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/30 font-mono">${coherenceFlags.length} coherence flags</span>`
                  : '<span class="chip text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-mono">✓ Coherent</span>'
              }
            </div>
            <h1 class="font-serif text-2xl sm:text-3xl text-slate-100">${canvasName}</h1>
            <p class="text-xs text-muted">
              ${isLean ? "Focus on riskiest assumptions, solution constraints, and early adopter traction." : "Holistic architecture covering partners, infrastructure, value, and unit cash flows."}
            </p>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <!-- Version Select -->
            <div class="flex items-center gap-1.5 bg-base border border-subtle rounded-lg px-2.5 py-1">
              <span class="text-[11px] text-muted font-mono">Version:</span>
              <select id="canvas-version-select" class="bg-transparent text-xs text-slate-200 font-mono focus:outline-none cursor-pointer">
                ${versions
                  .map(
                    (v) => `
                  <option value="${v.version}" ${v.version === current.version ? "selected" : ""}>
                    v${v.version} · ${v.createdAt}
                  </option>
                `,
                  )
                  .join("")}
              </select>
            </div>

            <!-- Save as New Version Button -->
            <button id="canvas-save-btn" class="btn text-xs py-1.5 px-3 border transition-colors ${
              isDirty
                ? "bg-brass text-ink font-semibold hover:bg-brass-light border-brass"
                : "btn-ghost border-subtle text-slate-400 hover:text-slate-200"
            }">
              <span>Save as v${current.version + 1}</span>
            </button>

            <!-- Stress Test with David -->
            <button id="stress-test-btn" class="btn btn-ghost text-xs py-1.5 px-3 border border-rose-500/40 text-rose-400 hover:bg-rose-500/10 flex items-center gap-1.5">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>Stress-test with David</span>
            </button>

            <!-- Export Buttons -->
            <button id="canvas-copy-md-btn" class="btn btn-ghost text-xs py-1.5 px-2.5 border border-subtle text-slate-300 hover:text-slate-100" title="Copy Markdown">
              Copy .md
            </button>
            <button id="canvas-download-md-btn" class="btn btn-ghost text-xs py-1.5 px-2.5 border border-subtle text-slate-300 hover:text-slate-100" title="Download Markdown">
              Download .md
            </button>
            <button id="canvas-download-html-btn" class="btn btn-ghost text-xs py-1.5 px-2.5 border border-subtle text-slate-300 hover:text-slate-100" title="Download HTML">
              .html
            </button>
          </div>
        </div>

        <!-- Coherence Heuristic Audit Bar (if flags exist) -->
        ${
          coherenceFlags.length > 0
            ? `
          <div class="p-4 rounded-xl border border-amber-500/30 bg-amber-500/5 space-y-2 animate-fadeIn">
            <div class="flex items-center gap-2 text-xs font-semibold text-amber-400">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Canvas Coherence Heuristics (${coherenceFlags.length} alerts)</span>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] text-slate-300">
              ${coherenceFlags
                .map(
                  (f) => `
                <div class="flex items-start gap-2 p-2 rounded bg-base/60 border border-subtle">
                  <span class="chip text-[9px] font-mono uppercase bg-amber-500/20 text-amber-300 shrink-0">${f.kind}</span>
                  <span class="leading-snug">${f.message}</span>
                </div>
              `,
                )
                .join("")}
            </div>
          </div>
        `
            : ""
        }

        <!-- Canvas Body (Maurya or Osterwalder Layout) -->
        ${isLean ? renderMauryaLayout(workingData as LeanCanvasData) : renderOsterwalderLayout(workingData as BlueprintData)}

        <!-- David's Stress-Test Critique Panel (Slide-out or Drawer) -->
        ${renderCritiquePanel()}
      </div>
    `;

    bindEvents();
  };

  const renderBox = (boxId: string, title: string, hint: string, items: string[]): string => {
    return `
      <div class="canvas-box flex flex-col justify-between p-3.5 sm:p-4 rounded-xl bg-panel border border-subtle hover:border-slate-600 transition-colors" data-box-id="${boxId}">
        <div>
          <div class="flex items-center justify-between pb-1.5 border-b border-subtle">
            <div class="flex items-center gap-1.5 min-w-0">
              <h3 class="font-serif text-sm font-semibold text-slate-100 truncate">${title}</h3>
              <span class="text-muted hover:text-brass-light cursor-help text-[11px]" title="${hint}">ℹ</span>
            </div>
            <div class="flex items-center gap-1">
              <button class="promote-note-btn text-[10px] font-mono text-muted hover:text-brass-light px-1" data-box="${boxId}" title="Promote box items to founder notes">
                Note →
              </button>
              <button class="add-canvas-item-btn text-xs text-brass-light hover:text-white px-1.5 py-0.5 rounded bg-base border border-subtle" data-box="${boxId}">
                +
              </button>
            </div>
          </div>
          <div class="box-items-container space-y-1.5 pt-2">
            ${
              items.length === 0
                ? '<div class="text-[11px] text-muted italic p-2 text-center border border-dashed border-subtle rounded">No entries</div>'
                : items
                    .map(
                      (item, idx) => `
                  <div class="box-item-row group flex items-start gap-1.5 p-1.5 rounded bg-base border border-subtle hover:border-slate-500">
                    <span class="text-brass-light text-[10px] select-none pt-1">•</span>
                    <textarea class="box-item-textarea flex-1 bg-transparent text-xs text-slate-200 resize-none focus:outline-none leading-snug"
                              rows="1"
                              data-box="${boxId}"
                              data-idx="${idx}">${item}</textarea>
                    <button class="delete-canvas-item-btn text-muted hover:text-rose-400 opacity-60 group-hover:opacity-100 px-1 pt-0.5"
                            data-box="${boxId}"
                            data-idx="${idx}"
                            title="Delete item">✕</button>
                  </div>
                `,
                    )
                    .join("")
            }
          </div>
        </div>
      </div>
    `;
  };

  /**
   * Maurya Layout (Lean Canvas):
   * Left: Problem, Customer Segments
   * Center: UVP, Solution
   * Right: Channels, Revenue
   * Bottom band: Cost, Metrics, Unfair Advantage
   */
  const renderMauryaLayout = (d: LeanCanvasData): string => {
    const hints = FRAMEWORKS["lean-canvas"].boxHints;

    return `
      <div class="lean-canvas-grid space-y-4">
        <!-- Top 3 Columns Grid -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <!-- Col 1: Problem + Customer Segments -->
          <div class="space-y-4 flex flex-col">
            ${renderBox("problem", "Problem", hints["problem"] ?? "", d.boxes.problem)}
            ${renderBox("customer-segments", "Customer Segments", hints["customer-segments"] ?? "", d.boxes["customer-segments"])}
          </div>

          <!-- Col 2: Unique Value Proposition + Solution -->
          <div class="space-y-4 flex flex-col">
            ${renderBox("uvp", "Unique Value Proposition", hints["uvp"] ?? "", d.boxes.uvp)}
            ${renderBox("solution", "Solution", hints["solution"] ?? "", d.boxes.solution)}
          </div>

          <!-- Col 3: Channels + Revenue -->
          <div class="space-y-4 flex flex-col">
            ${renderBox("channels", "Channels", hints["channels"] ?? "", d.boxes.channels)}
            ${renderBox("revenue", "Revenue Streams", hints["revenue"] ?? "", d.boxes.revenue)}
          </div>
        </div>

        <!-- Bottom Band: Cost + Metrics + Unfair Advantage -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-subtle">
          ${renderBox("cost", "Cost Structure", hints["cost"] ?? "", d.boxes.cost)}
          ${renderBox("metrics", "Key Metrics", hints["metrics"] ?? "", d.boxes.metrics)}
          ${renderBox("unfair-advantage", "Unfair Advantage", hints["unfair-advantage"] ?? "", d.boxes["unfair-advantage"])}
        </div>
      </div>
    `;
  };

  /**
   * Osterwalder Layout (Business Blueprint):
   * Top band: Key Partners | Key Activities (with Key Resources below) | Value Proposition | Customer Relationships | Customer Segments
   * Bottom band: Cost Structure | Revenue Streams
   */
  const renderOsterwalderLayout = (d: BlueprintData): string => {
    const hints = FRAMEWORKS["business-blueprint"].boxHints;

    return `
      <div class="blueprint-canvas-grid space-y-4">
        <!-- Top 5 Columns Grid -->
        <div class="grid grid-cols-1 md:grid-cols-5 gap-3">
          <!-- Col 1: Key Partnerships -->
          <div class="flex flex-col">
            ${renderBox("key-partnerships", "Key Partnerships", hints["key-partnerships"] ?? "", d.boxes["key-partnerships"])}
          </div>

          <!-- Col 2: Key Activities (top) & Key Resources (bottom) -->
          <div class="space-y-3 flex flex-col">
            ${renderBox("key-activities", "Key Activities", hints["key-activities"] ?? "", d.boxes["key-activities"])}
            ${renderBox("key-resources", "Key Resources", hints["key-resources"] ?? "", d.boxes["key-resources"])}
          </div>

          <!-- Col 3: Value Proposition -->
          <div class="flex flex-col">
            ${renderBox("value-proposition", "Value Proposition", hints["value-proposition"] ?? "", d.boxes["value-proposition"])}
          </div>

          <!-- Col 4: Customer Relationships (top) & Channels (bottom) -->
          <div class="space-y-3 flex flex-col">
            ${renderBox("customer-relationships", "Customer Relationships", hints["customer-relationships"] ?? "", d.boxes["customer-relationships"])}
            ${renderBox("channels", "Channels", hints["channels"] ?? "", d.boxes.channels)}
          </div>

          <!-- Col 5: Customer Segments -->
          <div class="flex flex-col">
            ${renderBox("customer-segments", "Customer Segments", hints["customer-segments"] ?? "", d.boxes["customer-segments"])}
          </div>
        </div>

        <!-- Bottom Band: Cost Structure (50%) & Revenue Streams (50%) -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-subtle">
          ${renderBox("cost", "Cost Structure", hints["cost"] ?? "", d.boxes.cost)}
          ${renderBox("revenue", "Revenue Streams", hints["revenue"] ?? "", d.boxes.revenue)}
        </div>
      </div>
    `;
  };

  const renderCritiquePanel = (): string => {
    if (!activeCritique && !isStreamingCritique) return "";

    return `
      <div id="critique-side-panel" class="panel p-5 border-rose-500/40 bg-rose-950/20 rounded-xl space-y-3 animate-fadeIn">
        <div class="flex items-center justify-between pb-2 border-b border-rose-500/30">
          <div class="flex items-center gap-2">
            <span class="avatar w-7 h-7 text-xs bg-rose-950 text-rose-400 border border-rose-800 font-mono font-bold">DO</span>
            <div>
              <h4 class="font-serif text-sm font-semibold text-slate-100">David Okafor — Falsification Interrogation</h4>
              <p class="text-[10px] text-muted font-mono">Unsparing stress-test & kill criteria analysis</p>
            </div>
          </div>
          <button id="close-critique-btn" class="btn btn-ghost text-xs p-1 text-muted hover:text-slate-100">✕</button>
        </div>
        <div class="text-xs text-slate-200 leading-relaxed whitespace-pre-wrap font-sans">
          ${activeCritique ?? "Critiquing canvas structure..."}
        </div>
      </div>
    `;
  };

  const bindEvents = (): void => {
    // Version Selector
    const verSel = root.querySelector<HTMLSelectElement>("#canvas-version-select");
    verSel?.addEventListener("change", () => {
      const ver = parseInt(verSel.value, 10);
      const target = getVersionsList().find((v) => v.version === ver);
      if (target) {
        current = target;
        workingData = cloneCanvasData(current.frameworkData);
        isDirty = false;
        renderUI();
      }
    });

    // Save as New Version
    root.querySelector("#canvas-save-btn")?.addEventListener("click", async () => {
      const newVersionNum = current.version + 1;
      const now = new Date().toISOString();
      const newDeliverable = {
        ...current,
        version: newVersionNum,
        updatedAt: now,
        createdAt: now,
        frameworkData: cloneCanvasData(workingData),
        versions: [...getVersionsList(), current],
      } as LeanCanvasDeliverable | BlueprintDeliverable;

      await saveDeliverable(newDeliverable);
      current = newDeliverable;
      isDirty = false;
      renderUI();
    });

    // Stress Test with David
    root.querySelector("#stress-test-btn")?.addEventListener("click", () => {
      isStreamingCritique = true;
      activeCritique = `DAVID OKAFOR'S FALSIFICATION AUDIT:\n\n1. UNFAIR ADVANTAGE AUDIT:\nI scrutinized your moat assumptions. If a well-capitalized competitor with $5M and 10 engineers enters tomorrow, your lead time is under 90 days unless proprietary distribution lock-in is demonstrated.\n\n2. REVENUE/COST RATIO STRESS:\nYour CAC assumption requires high organic referral loops. In sub-scale logistics environments, unit payback often doubles. Add a 14-day falsification threshold.\n\n3. RECOMMENDED KILL CRITERION:\nKill or pivot this hypothesis if early adopter pilot commitments fail to sign within 3 weeks.`;
      renderUI();
    });

    root.querySelector("#close-critique-btn")?.addEventListener("click", () => {
      activeCritique = null;
      isStreamingCritique = false;
      renderUI();
    });

    // Export Buttons
    root.querySelector("#canvas-copy-md-btn")?.addEventListener("click", async () => {
      const md = exportCanvasToMarkdown({ ...current, frameworkData: workingData } as
        LeanCanvasDeliverable | BlueprintDeliverable);
      await navigator.clipboard.writeText(md);
      const btn = root.querySelector("#canvas-copy-md-btn");
      if (btn) {
        btn.textContent = "Copied!";
        setTimeout(() => {
          btn.textContent = "Copy .md";
        }, 1800);
      }
    });

    root.querySelector("#canvas-download-md-btn")?.addEventListener("click", () => {
      const md = exportCanvasToMarkdown({ ...current, frameworkData: workingData } as
        LeanCanvasDeliverable | BlueprintDeliverable);
      downloadFile(
        `${current.ventureId}-${current.framework}-v${current.version}.md`,
        md,
        "text/markdown",
      );
    });

    root.querySelector("#canvas-download-html-btn")?.addEventListener("click", () => {
      const html = exportCanvasToHtml({ ...current, frameworkData: workingData } as
        LeanCanvasDeliverable | BlueprintDeliverable);
      downloadFile(
        `${current.ventureId}-${current.framework}-v${current.version}.html`,
        html,
        "text/html",
      );
    });

    // Box Item Text Edit
    root.querySelectorAll<HTMLTextAreaElement>(".box-item-textarea").forEach((ta) => {
      ta.addEventListener("input", () => {
        const boxId = ta.dataset["box"]!;
        const idx = parseInt(ta.dataset["idx"] ?? "0", 10);
        if (workingData.canvasType === "lean-canvas") {
          workingData.boxes[boxId as LeanCanvasBox][idx] = ta.value;
        } else {
          workingData.boxes[boxId as BlueprintBox][idx] = ta.value;
        }
        isDirty = true;
      });
    });

    // Add Box Item
    root.querySelectorAll<HTMLButtonElement>(".add-canvas-item-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const boxId = btn.dataset["box"]!;
        if (workingData.canvasType === "lean-canvas") {
          workingData.boxes[boxId as LeanCanvasBox].push("");
        } else {
          workingData.boxes[boxId as BlueprintBox].push("");
        }
        isDirty = true;
        renderUI();
      });
    });

    // Delete Box Item
    root.querySelectorAll<HTMLButtonElement>(".delete-canvas-item-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const boxId = btn.dataset["box"]!;
        const idx = parseInt(btn.dataset["idx"] ?? "0", 10);
        if (workingData.canvasType === "lean-canvas") {
          workingData.boxes[boxId as LeanCanvasBox].splice(idx, 1);
        } else {
          workingData.boxes[boxId as BlueprintBox].splice(idx, 1);
        }
        isDirty = true;
        renderUI();
      });
    });

    // Promote Box to Note
    root.querySelectorAll<HTMLButtonElement>(".promote-note-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const boxId = btn.dataset["box"]!;
        const isLean = workingData.canvasType === "lean-canvas";
        const items = isLean
          ? (workingData as LeanCanvasData).boxes[boxId as LeanCanvasBox]
          : (workingData as BlueprintData).boxes[boxId as BlueprintBox];

        const noteSnippet = `\n\n[Promoted from ${current.framework} (${boxId})]:\n${items.map((it) => `- ${it}`).join("\n")}`;
        const venture = await getVenture(current.ventureId);
        if (venture) {
          venture.notes = (venture.notes ?? "") + noteSnippet;
          await saveVenture(venture);
          btn.textContent = "✓ Noted";
          setTimeout(() => {
            btn.textContent = "Note →";
          }, 2000);
        }
      });
    });
  };

  renderUI();
}

function downloadFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8;` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
