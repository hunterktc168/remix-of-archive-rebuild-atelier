import { exportSwotToHtml, exportSwotToMarkdown } from "../export";
import { saveDeliverable } from "../db";
import { parseChairOutput } from "../lib/parse-chair-output";
import { SWOT_QUADRANTS } from "../schemas";
import type {
  AgentId,
  SwotBullet,
  SwotData,
  SwotDeliverable,
  SwotImplication,
  SwotQuadrant,
} from "../types/deliverables";

const AGENT_INITIALS: Record<AgentId, string> = {
  maya: "MC",
  sam: "ST",
  david: "DO",
  priya: "PR",
  marcus: "MW",
  elena: "EV",
  chair: "CH",
};

const AGENT_COLORS: Record<AgentId, string> = {
  maya: "text-cyan-400 bg-cyan-950/60 border-cyan-800",
  sam: "text-emerald-400 bg-emerald-950/60 border-emerald-800",
  david: "text-rose-400 bg-rose-950/60 border-rose-800",
  priya: "text-amber-400 bg-amber-950/60 border-amber-800",
  marcus: "text-purple-400 bg-purple-950/60 border-purple-800",
  elena: "text-blue-400 bg-blue-950/60 border-blue-800",
  chair: "text-brass-light bg-brass/10 border-brass/40",
};

function isSwotTag(tag: string | undefined): tag is SwotImplication["tag"] {
  return tag === "SO" || tag === "WO" || tag === "ST" || tag === "WT";
}

function countWords(str: string): number {
  return str.trim() ? str.trim().split(/\s+/).length : 0;
}

function cloneSwotData(data: SwotData): SwotData {
  return {
    quadrants: {
      strengths: data.quadrants.strengths.map((b) => ({ ...b })),
      weaknesses: data.quadrants.weaknesses.map((b) => ({ ...b })),
      opportunities: data.quadrants.opportunities.map((b) => ({ ...b })),
      threats: data.quadrants.threats.map((b) => ({ ...b })),
    },
    strategicImplications: data.strategicImplications.map((i) => ({ ...i })),
  };
}

/**
 * Creates a synthetic refreshed SWOT payload for offline/rapid iteration.
 */
function generateRefreshedSwot(prev: SwotData, ventureName: string): SwotData {
  const next = cloneSwotData(prev);
  const stamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  next.quadrants.opportunities.unshift({
    text: `Emerging enterprise demand surge for ${ventureName} logistics solutions [${stamp}].`,
    sourceAgentId: "maya",
  });
  next.strategicImplications.unshift({
    text: `Accelerate pilot onboarding to capture surge window before Q3 lock-in.`,
    tag: "SO",
  });
  return next;
}

export function renderSwot(root: HTMLElement, initialDeliverable: SwotDeliverable): void {
  let current = initialDeliverable;
  // Local working copy of frameworkData for real-time in-place editing
  let workingData = cloneSwotData(current.frameworkData);
  let draggedQuadrant: SwotQuadrant | null = null;
  let draggedIndex: number | null = null;
  let isDirty = false;

  const getVersionsList = (): SwotDeliverable[] => {
    const list: SwotDeliverable[] = [];
    if (current.versions && current.versions.length > 0) {
      for (const v of current.versions) {
        if (v.framework === "swot") list.push(v);
      }
    }
    if (!list.some((v) => v.version === current.version)) {
      list.push(current);
    }
    return list.sort((a, b) => b.version - a.version);
  };

  const renderUI = (): void => {
    const versions = getVersionsList();
    const isMarketing = current.phase === "marketing";
    const frameworkTitle = isMarketing
      ? "SWOT Analysis — Marketing Lens"
      : "SWOT Strategic Analysis";

    root.innerHTML = `
      <div class="swot-workspace space-y-6">
        <!-- Header Toolbar -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-xl border border-subtle bg-panel shadow-sm">
          <div class="space-y-1">
            <div class="flex items-center gap-2">
              <span class="chip text-xs bg-brass/10 border-brass/30 text-brass-light font-mono font-semibold">
                ${isMarketing ? "PHASE 04 · MARKETING" : "PHASE 03 · BUSINESS PLAN"}
              </span>
              <span class="chip text-xs bg-base border-subtle text-muted font-mono">
                v${current.version}
              </span>
              ${isDirty ? '<span class="chip text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/30 font-mono">Unsaved edits</span>' : ""}
            </div>
            <h1 class="font-serif text-2xl sm:text-3xl text-slate-100">${frameworkTitle}</h1>
            <p class="text-xs text-muted">
              2×2 strategic matrix with provenanced bullets and TOWS strategic implications.
            </p>
          </div>

          <!-- Controls Strip -->
          <div class="flex flex-wrap items-center gap-2">
            <!-- Version Picker -->
            <div class="flex items-center gap-1.5 bg-base border border-subtle rounded-lg px-2.5 py-1">
              <span class="text-[11px] text-muted font-mono">Version:</span>
              <select id="swot-version-select" class="bg-transparent text-xs text-slate-200 font-mono focus:outline-none cursor-pointer">
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
            <button id="swot-save-btn" class="btn text-xs py-1.5 px-3 border transition-colors ${
              isDirty
                ? "bg-brass text-ink font-semibold hover:bg-brass-light border-brass"
                : "btn-ghost border-subtle text-slate-400 hover:text-slate-200"
            }">
              <span>Save as v${current.version + 1}</span>
            </button>

            <!-- Refresh Button -->
            <button id="swot-refresh-btn" class="btn btn-ghost text-xs py-1.5 px-3 border border-brass/40 text-brass-light hover:bg-brass/10 flex items-center gap-1.5">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span>Refresh SWOT</span>
            </button>

            <!-- Export Dropdown / Buttons -->
            <div class="flex items-center gap-1">
              <button id="swot-copy-md-btn" class="btn btn-ghost text-xs py-1.5 px-2.5 border border-subtle text-slate-300 hover:text-slate-100" title="Copy Markdown">
                Copy .md
              </button>
              <button id="swot-download-md-btn" class="btn btn-ghost text-xs py-1.5 px-2.5 border border-subtle text-slate-300 hover:text-slate-100" title="Download Markdown">
                Download .md
              </button>
              <button id="swot-download-html-btn" class="btn btn-ghost text-xs py-1.5 px-2.5 border border-subtle text-slate-300 hover:text-slate-100" title="Download HTML">
                .html
              </button>
            </div>
          </div>
        </div>

        <!-- 2×2 Matrix Grid (<640px stacks vertically) -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          ${SWOT_QUADRANTS.map((quad) => renderQuadrant(quad, workingData.quadrants[quad])).join("")}
        </div>

        <!-- Strategic Implications Section (TOWS) -->
        <section class="panel p-5 sm:p-6 border-subtle space-y-4">
          <div class="flex items-center justify-between pb-3 border-b border-subtle flex-wrap gap-2">
            <div>
              <h2 class="font-serif text-xl text-slate-100">Strategic Implications</h2>
              <p class="text-xs text-muted">
                Synthesize cross-quadrant moves: pair Strengths with Opportunities (SO), or mitigate Weaknesses with Threats (WT).
              </p>
            </div>
            <button id="add-implication-btn" class="btn btn-ghost text-xs py-1.5 px-3 border border-subtle text-brass-light hover:bg-brass/10 flex items-center gap-1">
              + Add Implication
            </button>
          </div>

          <div id="implications-list" class="space-y-2.5">
            ${
              workingData.strategicImplications.length === 0
                ? '<div class="text-xs text-muted italic p-4 text-center border border-dashed border-subtle rounded-lg">No strategic implications added yet. Click "+ Add Implication" above.</div>'
                : workingData.strategicImplications
                    .map((imp, idx) => renderImplicationRow(imp, idx))
                    .join("")
            }
          </div>
        </section>
      </div>
    `;

    bindEvents();
  };

  const renderQuadrant = (quad: SwotQuadrant, bullets: SwotBullet[]): string => {
    const titles: Record<SwotQuadrant, { label: string; desc: string; badge: string }> = {
      strengths: {
        label: "Strengths",
        desc: "Internal advantage & proprietary assets",
        badge: "text-emerald-400 bg-emerald-950/40 border-emerald-800/60",
      },
      weaknesses: {
        label: "Weaknesses",
        desc: "Internal limits & critical dependencies",
        badge: "text-amber-400 bg-amber-950/40 border-amber-800/60",
      },
      opportunities: {
        label: "Opportunities",
        desc: "External tailwinds & market vacancies",
        badge: "text-cyan-400 bg-cyan-950/40 border-cyan-800/60",
      },
      threats: {
        label: "Threats",
        desc: "External vulnerabilities & hostile shifts",
        badge: "text-rose-400 bg-rose-950/40 border-rose-800/60",
      },
    };
    const info = titles[quad];

    return `
      <div class="panel p-4 sm:p-5 border-subtle flex flex-col justify-between space-y-3" data-quadrant="${quad}">
        <div class="flex items-center justify-between pb-2 border-b border-subtle">
          <div>
            <div class="flex items-center gap-2">
              <span class="chip text-[10px] font-mono uppercase font-bold border px-1.5 py-0.5 ${info.badge}">${info.label}</span>
              <span class="text-xs font-semibold text-slate-200">${bullets.length} entries</span>
            </div>
            <p class="text-[11px] text-muted mt-0.5">${info.desc}</p>
          </div>
          <button class="add-bullet-btn btn btn-ghost text-xs py-1 px-2 border border-subtle text-slate-300 hover:text-slate-100" data-quad="${quad}">
            + Add
          </button>
        </div>

        <div class="bullet-list space-y-2 flex-1 min-h-[140px]" data-quad="${quad}">
          ${
            bullets.length === 0
              ? `<div class="text-[11px] text-muted italic p-3 text-center border border-dashed border-subtle rounded-lg">No ${info.label.toLowerCase()} added yet.</div>`
              : bullets.map((b, idx) => renderBulletRow(quad, b, idx)).join("")
          }
        </div>
      </div>
    `;
  };

  const renderBulletRow = (quad: SwotQuadrant, bullet: SwotBullet, idx: number): string => {
    const wordCount = countWords(bullet.text);
    const isOverLimit = wordCount > 20;
    const agent = bullet.sourceAgentId;
    const agentTag = agent ? AGENT_INITIALS[agent] : null;
    const colorClass = agent ? AGENT_COLORS[agent] : "text-slate-400 bg-base border-subtle";

    return `
      <div class="bullet-item group flex items-start gap-2 p-2 rounded-lg bg-base border border-subtle hover:border-slate-600 transition-colors"
           draggable="true"
           data-quad="${quad}"
           data-idx="${idx}">
        <!-- Drag Handle -->
        <span class="drag-handle cursor-grab active:cursor-grabbing text-muted hover:text-slate-200 text-sm select-none pt-1" title="Drag to reorder">
          ⠿
        </span>

        <!-- Provenance Chip -->
        <div class="relative shrink-0 pt-0.5">
          <select class="agent-provenance-select text-[10px] font-mono font-bold uppercase rounded border px-1.5 py-0.5 cursor-pointer ${colorClass}"
                  data-quad="${quad}"
                  data-idx="${idx}">
            <option value="" ${!agent ? "selected" : ""}>None</option>
            <option value="maya" ${agent === "maya" ? "selected" : ""}>MC · Maya</option>
            <option value="sam" ${agent === "sam" ? "selected" : ""}>ST · Sam</option>
            <option value="david" ${agent === "david" ? "selected" : ""}>DO · David</option>
            <option value="priya" ${agent === "priya" ? "selected" : ""}>PR · Priya</option>
            <option value="marcus" ${agent === "marcus" ? "selected" : ""}>MW · Marcus</option>
            <option value="elena" ${agent === "elena" ? "selected" : ""}>EV · Elena</option>
            <option value="chair" ${agent === "chair" ? "selected" : ""}>CH · Chair</option>
          </select>
        </div>

        <!-- Text Input with Soft 20-word Limit -->
        <div class="flex-1 min-w-0">
          <textarea class="bullet-textarea w-full bg-transparent text-xs text-slate-200 resize-none focus:outline-none leading-relaxed"
                    rows="2"
                    data-quad="${quad}"
                    data-idx="${idx}"
                    placeholder="Enter bullet point (≤ 20 words soft limit)...">${bullet.text}</textarea>
          <div class="flex items-center justify-between text-[10px] font-mono pt-0.5">
            <span class="${isOverLimit ? "text-amber-400 font-semibold" : "text-faint"}">
              ${wordCount}/20 words ${isOverLimit ? "· consider tightening" : ""}
            </span>
            <!-- Reorder arrows fallback -->
            <div class="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
              <button type="button" class="move-up-btn text-muted hover:text-slate-100 px-1" data-quad="${quad}" data-idx="${idx}" title="Move up">▲</button>
              <button type="button" class="move-down-btn text-muted hover:text-slate-100 px-1" data-quad="${quad}" data-idx="${idx}" title="Move down">▼</button>
            </div>
          </div>
        </div>

        <!-- Delete button -->
        <button class="delete-bullet-btn text-muted hover:text-rose-400 p-1 shrink-0" data-quad="${quad}" data-idx="${idx}" title="Delete bullet">
          ✕
        </button>
      </div>
    `;
  };

  const renderImplicationRow = (imp: SwotImplication, idx: number): string => {
    const tags: Array<SwotImplication["tag"]> = ["SO", "WO", "ST", "WT"];

    return `
      <div class="implication-row flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-2.5 rounded-lg bg-base border border-subtle">
        <!-- Segmented Tag Selector -->
        <div class="inline-flex rounded-lg border border-subtle bg-panel p-0.5 shrink-0" role="group">
          ${tags
            .map(
              (tag) => `
            <button type="button" class="tag-btn px-2 py-1 text-xs font-mono font-semibold rounded transition-colors ${
              imp.tag === tag ? "bg-brass text-ink shadow-sm" : "text-muted hover:text-slate-200"
            }" data-tag="${tag}" data-idx="${idx}">
              ${tag}
            </button>
          `,
            )
            .join("")}
        </div>

        <!-- Text input -->
        <input type="text"
               class="implication-input flex-1 input text-xs py-1.5 px-3 bg-panel"
               data-idx="${idx}"
               value="${imp.text}"
               placeholder="Strategic action pairing specific internal & external levers..." />

        <!-- Delete button -->
        <button class="delete-implication-btn btn btn-ghost text-xs p-1.5 text-muted hover:text-rose-400 shrink-0" data-idx="${idx}" title="Remove implication">
          ✕
        </button>
      </div>
    `;
  };

  const bindEvents = (): void => {
    // 1. Version Switcher
    const verSelect = root.querySelector<HTMLSelectElement>("#swot-version-select");
    verSelect?.addEventListener("change", () => {
      const selectedVer = parseInt(verSelect.value, 10);
      const target = getVersionsList().find((v) => v.version === selectedVer);
      if (target) {
        current = target;
        workingData = cloneSwotData(current.frameworkData);
        isDirty = false;
        renderUI();
      }
    });

    // 2. Save as New Version
    const saveBtn = root.querySelector("#swot-save-btn");
    saveBtn?.addEventListener("click", async () => {
      const newVersionNum = current.version + 1;
      const now = new Date().toISOString();
      const newDeliverable: SwotDeliverable = {
        ...current,
        version: newVersionNum,
        updatedAt: now,
        createdAt: now,
        frameworkData: cloneSwotData(workingData),
        versions: [...getVersionsList(), current],
      };

      await saveDeliverable(newDeliverable);
      current = newDeliverable;
      isDirty = false;
      renderUI();
    });

    // 3. Refresh SWOT
    const refreshBtn = root.querySelector("#swot-refresh-btn");
    refreshBtn?.addEventListener("click", async () => {
      refreshBtn.textContent = "Synthesizing...";
      try {
        const refreshedData = generateRefreshedSwot(workingData, current.title || "Venture");
        const newVersionNum = current.version + 1;
        const now = new Date().toISOString();

        const newDeliverable: SwotDeliverable = {
          ...current,
          version: newVersionNum,
          updatedAt: now,
          createdAt: now,
          frameworkData: refreshedData,
          versions: [...getVersionsList(), current],
        };

        await saveDeliverable(newDeliverable);
        current = newDeliverable;
        workingData = cloneSwotData(refreshedData);
        isDirty = false;
        renderUI();
      } catch (err) {
        console.error("Refresh SWOT failed:", err);
        renderUI();
      }
    });

    // 4. Export Buttons
    root.querySelector("#swot-copy-md-btn")?.addEventListener("click", async () => {
      const md = exportSwotToMarkdown({ ...current, frameworkData: workingData });
      await navigator.clipboard.writeText(md);
      const btn = root.querySelector("#swot-copy-md-btn");
      if (btn) {
        btn.textContent = "Copied!";
        setTimeout(() => {
          btn.textContent = "Copy .md";
        }, 1800);
      }
    });

    root.querySelector("#swot-download-md-btn")?.addEventListener("click", () => {
      const md = exportSwotToMarkdown({ ...current, frameworkData: workingData });
      downloadFile(`${current.ventureId}-swot-v${current.version}.md`, md, "text/markdown");
    });

    root.querySelector("#swot-download-html-btn")?.addEventListener("click", () => {
      const html = exportSwotToHtml({ ...current, frameworkData: workingData });
      downloadFile(`${current.ventureId}-swot-v${current.version}.html`, html, "text/html");
    });

    // 5. Bullet text updates
    root.querySelectorAll<HTMLTextAreaElement>(".bullet-textarea").forEach((ta) => {
      ta.addEventListener("input", () => {
        const quad = ta.dataset["quad"] as SwotQuadrant;
        const idx = parseInt(ta.dataset["idx"] ?? "0", 10);
        const item = workingData.quadrants[quad][idx];
        if (item) {
          item.text = ta.value;
          isDirty = true;
        }
      });
    });

    // 6. Provenance chip updates
    root.querySelectorAll<HTMLSelectElement>(".agent-provenance-select").forEach((sel) => {
      sel.addEventListener("change", () => {
        const quad = sel.dataset["quad"] as SwotQuadrant;
        const idx = parseInt(sel.dataset["idx"] ?? "0", 10);
        const item = workingData.quadrants[quad][idx];
        if (item) {
          item.sourceAgentId = sel.value ? (sel.value as AgentId) : undefined;
          isDirty = true;
          renderUI();
        }
      });
    });

    // 7. Add Bullet
    root.querySelectorAll<HTMLButtonElement>(".add-bullet-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const quad = btn.dataset["quad"] as SwotQuadrant;
        workingData.quadrants[quad].push({
          text: "",
          sourceAgentId: "maya",
        });
        isDirty = true;
        renderUI();
      });
    });

    // 8. Delete Bullet
    root.querySelectorAll<HTMLButtonElement>(".delete-bullet-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const quad = btn.dataset["quad"] as SwotQuadrant;
        const idx = parseInt(btn.dataset["idx"] ?? "0", 10);
        workingData.quadrants[quad].splice(idx, 1);
        isDirty = true;
        renderUI();
      });
    });

    // 9. Move Up / Down
    root.querySelectorAll<HTMLButtonElement>(".move-up-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const quad = btn.dataset["quad"] as SwotQuadrant;
        const idx = parseInt(btn.dataset["idx"] ?? "0", 10);
        if (idx > 0) {
          const list = workingData.quadrants[quad];
          const [moved] = list.splice(idx, 1);
          if (moved) list.splice(idx - 1, 0, moved);
          isDirty = true;
          renderUI();
        }
      });
    });

    root.querySelectorAll<HTMLButtonElement>(".move-down-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const quad = btn.dataset["quad"] as SwotQuadrant;
        const idx = parseInt(btn.dataset["idx"] ?? "0", 10);
        const list = workingData.quadrants[quad];
        if (idx < list.length - 1) {
          const [moved] = list.splice(idx, 1);
          if (moved) list.splice(idx + 1, 0, moved);
          isDirty = true;
          renderUI();
        }
      });
    });

    // 10. Drag and Drop Reordering
    root.querySelectorAll<HTMLElement>(".bullet-item").forEach((item) => {
      item.addEventListener("dragstart", (e) => {
        draggedQuadrant = item.dataset["quad"] as SwotQuadrant;
        draggedIndex = parseInt(item.dataset["idx"] ?? "0", 10);
        e.dataTransfer?.setData("text/plain", `${draggedQuadrant}:${draggedIndex}`);
      });

      item.addEventListener("dragover", (e) => {
        e.preventDefault();
        item.classList.add("border-brass");
      });

      item.addEventListener("dragleave", () => {
        item.classList.remove("border-brass");
      });

      item.addEventListener("drop", (e) => {
        e.preventDefault();
        item.classList.remove("border-brass");
        const targetQuad = item.dataset["quad"] as SwotQuadrant;
        const targetIdx = parseInt(item.dataset["idx"] ?? "0", 10);

        if (draggedQuadrant === targetQuad && draggedIndex !== null && draggedIndex !== targetIdx) {
          const list = workingData.quadrants[targetQuad];
          const [moved] = list.splice(draggedIndex, 1);
          if (moved) list.splice(targetIdx, 0, moved);
          isDirty = true;
          renderUI();
        }
        draggedQuadrant = null;
        draggedIndex = null;
      });
    });

    // 11. Implications Tag Buttons
    root.querySelectorAll<HTMLButtonElement>(".tag-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.dataset["idx"] ?? "0", 10);
        const tag = btn.dataset["tag"];
        const imp = workingData.strategicImplications[idx];
        if (imp && isSwotTag(tag)) {
          imp.tag = tag;
          isDirty = true;
          renderUI();
        }
      });
    });

    // 12. Implications Input
    root.querySelectorAll<HTMLInputElement>(".implication-input").forEach((input) => {
      input.addEventListener("input", () => {
        const idx = parseInt(input.dataset["idx"] ?? "0", 10);
        const imp = workingData.strategicImplications[idx];
        if (imp) {
          imp.text = input.value;
          isDirty = true;
        }
      });
    });

    // 13. Add Implication
    root.querySelector("#add-implication-btn")?.addEventListener("click", () => {
      workingData.strategicImplications.push({
        text: "",
        tag: "SO",
      });
      isDirty = true;
      renderUI();
    });

    // 14. Delete Implication
    root.querySelectorAll<HTMLButtonElement>(".delete-implication-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.dataset["idx"] ?? "0", 10);
        workingData.strategicImplications.splice(idx, 1);
        isDirty = true;
        renderUI();
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
