import { exportMarketingToHtml, exportMarketingToMarkdown } from "../export";
import { getDeliverablesForVenture, getVenture, saveDeliverable } from "../db";
import {
  budgetPct,
  formatBudget,
  healthOf,
  ltvCacRatio,
  totalBudget,
} from "../lib/marketing-compute";
import { MARKETING_GOALS, RISK_APPETITES } from "../schemas";
import type {
  AgentId,
  Channel,
  ChannelRole,
  ChannelStatus,
  EvolveInterview,
  Experiment,
  ExperimentStatus,
  KpiSlot,
  LaunchPhase,
  LaunchTask,
  MarketingDeliverable,
  MarketingGoal,
  MarketingLevers,
  MarketingPlanData,
  RiskAppetite,
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

function clonePlanData(data: MarketingPlanData): MarketingPlanData {
  return {
    positioning: data.positioning,
    icp: { ...data.icp },
    messagingPillars: data.messagingPillars.map((p) => ({ ...p })),
    channels: data.channels.map((c) => ({ ...c })),
    experiments: data.experiments.map((e) => ({ ...e })),
    launchSequence: data.launchSequence.map((seq) => ({
      phase: seq.phase,
      tasks: seq.tasks.map((t) => ({ ...t })),
    })),
    kpis: {
      northStar: { ...data.kpis.northStar },
      weekly: { ...data.kpis.weekly },
      monthly: { ...data.kpis.monthly },
    },
  };
}

function cloneLevers(levers: MarketingLevers): MarketingLevers {
  return { ...levers };
}

export function renderMarketing(root: HTMLElement, initialDeliverable: MarketingDeliverable): void {
  let current = initialDeliverable;
  let workingData = clonePlanData(current.frameworkData);
  let workingLevers = cloneLevers(current.levers);
  let planDirty = false;
  let canvasLtv = 1500; // Default benchmark LTV
  let showEvolveModal = false;
  let pendingConfidencePrompt: {
    experimentId: string;
    channelId: string;
    newStatus: "won" | "lost";
  } | null = null;

  // Retrieve canvas LTV from business-plan canvas if stored
  void getDeliverablesForVenture(current.ventureId).then((all) => {
    for (const d of all) {
      if (d.framework === "lean-canvas") {
        const revBullets = d.frameworkData.boxes.revenue;
        for (const b of revBullets) {
          const match = b.match(/LTV[:\s]*\$?([0-9,]+)/i);
          if (match?.[1]) {
            const parsed = parseInt(match[1].replace(/,/g, ""), 10);
            if (Number.isFinite(parsed) && parsed > 0) canvasLtv = parsed;
          }
        }
      }
    }
    renderUI();
  });

  const getVersionsList = (): MarketingDeliverable[] => {
    const list: MarketingDeliverable[] = [];
    if (current.versions && current.versions.length > 0) {
      for (const v of current.versions) {
        if (v.framework === "marketing-plan") {
          list.push(v as MarketingDeliverable);
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
    const totalAllocated = totalBudget(workingData.channels);
    const isOverBudget = totalAllocated > workingLevers.monthlyBudget;
    const overBudgetAmount = totalAllocated - workingLevers.monthlyBudget;

    root.innerHTML = `
      <div class="marketing-workspace space-y-6">
        <!-- 1. TOP STRIP — Levers & Workbench Control -->
        <div class="panel p-5 rounded-xl border border-subtle bg-panel space-y-4 shadow-sm">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-subtle">
            <div class="space-y-1">
              <div class="flex items-center gap-2">
                <span class="chip text-xs bg-brass/10 border-brass/30 text-brass-light font-mono font-semibold">
                  PHASE 04 · MARKETING
                </span>
                <span class="chip text-xs bg-base border-subtle text-muted font-mono">
                  v${current.version}
                </span>
                ${
                  planDirty
                    ? '<span class="chip text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/30 font-mono">Levers adjusted · Recalculation required</span>'
                    : '<span class="chip text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-mono">Balanced & Ratified</span>'
                }
              </div>
              <h1 class="font-serif text-2xl sm:text-3xl text-slate-100">Marketing Strategy Workbench</h1>
              <p class="text-xs text-muted">
                Adjust capital levers, track live channel CAC/LTV payback, cycle experiment milestones, and evolve with board feedback.
              </p>
            </div>

            <div class="flex flex-wrap items-center gap-2">
              <!-- Version Picker -->
              <div class="flex items-center gap-1.5 bg-base border border-subtle rounded-lg px-2.5 py-1">
                <span class="text-[11px] text-muted font-mono">Version:</span>
                <select id="marketing-version-select" class="bg-transparent text-xs text-slate-200 font-mono focus:outline-none cursor-pointer">
                  ${versions
                    .map(
                      (v) => `
                    <option value="${v.version}" ${v.version === current.version ? "selected" : ""}>
                      v${v.version} · ${formatBudget(v.levers.monthlyBudget)}/mo · ${v.levers.riskAppetite}
                    </option>
                  `,
                    )
                    .join("")}
                </select>
              </div>

              <!-- Recalculate with Board Button (Enabled when planDirty) -->
              <button id="recalculate-btn" class="btn text-xs py-1.5 px-3 border transition-colors flex items-center gap-1.5 ${
                planDirty
                  ? "bg-brass text-ink font-semibold hover:bg-brass-light border-brass shadow-sm"
                  : "btn-ghost border-subtle text-muted opacity-60 cursor-not-allowed"
              }" ${!planDirty ? "disabled" : ""}>
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span>Recalculate with the Board</span>
              </button>

              <!-- Save as new version button (disabled when planDirty) -->
              <button id="marketing-save-btn" class="btn text-xs py-1.5 px-3 border transition-colors ${
                !planDirty
                  ? "btn-ghost border-subtle text-slate-300 hover:text-white"
                  : "opacity-40 cursor-not-allowed border-subtle text-muted"
              }" ${planDirty ? "disabled" : ""}>
                Save as v${current.version + 1}
              </button>

              <!-- Evolve Plan Interview Button -->
              <button id="evolve-plan-btn" class="btn btn-ghost text-xs py-1.5 px-3 border border-brass/40 text-brass-light hover:bg-brass/10 flex items-center gap-1.5">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <span>Evolve Plan</span>
              </button>

              <!-- Export Tools -->
              <button id="marketing-copy-md-btn" class="btn btn-ghost text-xs py-1.5 px-2.5 border border-subtle text-slate-300 hover:text-slate-100" title="Copy Markdown">
                Copy .md
              </button>
              <button id="marketing-download-md-btn" class="btn btn-ghost text-xs py-1.5 px-2.5 border border-subtle text-slate-300 hover:text-slate-100" title="Download Markdown">
                .md
              </button>
            </div>
          </div>

          <!-- Levers Control Strip -->
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 rounded-xl bg-base border border-subtle">
            <!-- Lever 1: Monthly Budget -->
            <div class="space-y-2">
              <div class="flex items-center justify-between text-xs">
                <label for="lever-budget-num" class="font-medium text-slate-200">Monthly Budget</label>
                <span class="font-mono text-brass-light font-bold text-sm" id="budget-display">${formatBudget(workingLevers.monthlyBudget)}</span>
              </div>
              <div class="flex items-center gap-2">
                <input type="range"
                       id="lever-budget-slider"
                       min="500"
                       max="50000"
                       step="250"
                       class="flex-1 accent-brass cursor-pointer"
                       value="${workingLevers.monthlyBudget}" />
                <input type="number"
                       id="lever-budget-num"
                       min="500"
                       max="200000"
                       step="100"
                       class="input text-xs w-24 py-1 px-2 font-mono text-right"
                       value="${workingLevers.monthlyBudget}" />
              </div>
            </div>

            <!-- Lever 2: Primary Goal -->
            <div class="space-y-2">
              <label for="lever-primary-goal" class="text-xs font-medium text-slate-200">Primary Goal</label>
              <select id="lever-primary-goal" class="input text-xs py-1.5 px-2.5 bg-panel w-full cursor-pointer">
                ${MARKETING_GOALS.map(
                  (goal) => `
                  <option value="${goal}" ${workingLevers.primaryGoal === goal ? "selected" : ""}>
                    ${goal.toUpperCase()}
                  </option>
                `,
                ).join("")}
              </select>
            </div>

            <!-- Lever 3: Risk Appetite 3-way Toggle -->
            <div class="space-y-2">
              <span class="text-xs font-medium text-slate-200">Risk Appetite</span>
              <div class="grid grid-cols-3 gap-1 p-0.5 rounded-lg border border-subtle bg-panel" role="group">
                ${RISK_APPETITES.map(
                  (appetite) => `
                  <button type="button"
                          class="risk-toggle-btn text-[11px] font-mono py-1 rounded transition-colors ${
                            workingLevers.riskAppetite === appetite
                              ? "bg-brass text-ink font-bold shadow-sm"
                              : "text-muted hover:text-slate-200"
                          }"
                          data-risk="${appetite}">
                    ${appetite.slice(0, 4).toUpperCase()}
                  </button>
                `,
                ).join("")}
              </div>
            </div>
          </div>
        </div>

        <!-- 2. CHANNEL PORTFOLIO TABLE -->
        <section class="panel p-5 rounded-xl border border-subtle space-y-3">
          <div class="flex items-center justify-between pb-2 border-b border-subtle flex-wrap gap-2">
            <div>
              <div class="flex items-center gap-2">
                <h2 class="font-serif text-xl text-slate-100">Channel Portfolio</h2>
                <span class="chip text-xs font-mono ${isOverBudget ? "bg-rose-500/10 text-rose-400 border border-rose-500/30" : "bg-base border-subtle text-muted"}">
                  Total Allocated: ${formatBudget(totalAllocated)} / ${formatBudget(workingLevers.monthlyBudget)}
                </span>
                ${
                  isOverBudget
                    ? `<span class="chip text-[10px] bg-rose-500 text-white font-bold px-1.5 py-0.5 animate-pulse">Over by ${formatBudget(overBudgetAmount)}!</span>`
                    : ""
                }
              </div>
              <p class="text-[11px] text-muted">
                Benchmark LTV from model: <span class="text-brass-light font-mono font-semibold">${formatBudget(canvasLtv)}</span>. LTV:CAC multiple computed live per channel.
              </p>
            </div>
            <button id="add-channel-btn" class="btn btn-ghost text-xs py-1.5 px-3 border border-subtle text-brass-light hover:bg-brass/10">
              + Add Channel
            </button>
          </div>

          <div class="overflow-x-auto rounded-lg border border-subtle">
            <table class="w-full text-left text-xs border-collapse">
              <thead class="bg-base text-[10px] uppercase font-mono text-muted border-b border-subtle">
                <tr>
                  <th class="p-2.5">Channel Name</th>
                  <th class="p-2.5">Role</th>
                  <th class="p-2.5 text-right">Budget</th>
                  <th class="p-2.5 text-right">% Budget</th>
                  <th class="p-2.5 text-right">Target CAC</th>
                  <th class="p-2.5 text-right">LTV:CAC</th>
                  <th class="p-2.5 text-right">Exp. Vol</th>
                  <th class="p-2.5 text-center">Confidence (1–5)</th>
                  <th class="p-2.5">Status</th>
                  <th class="p-2.5 text-center">Action</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-subtle">
                ${workingData.channels
                  .map((ch, idx) => {
                    const pct = budgetPct(ch, totalAllocated);
                    const ratio = ltvCacRatio(ch, canvasLtv);
                    const highlightClass = isOverBudget ? "bg-rose-950/20" : "";

                    return `
                    <tr class="hover:bg-base/60 transition-colors ${highlightClass}" data-channel-idx="${idx}">
                      <!-- Name -->
                      <td class="p-2">
                        <input type="text"
                               class="channel-name-input input text-xs py-1 px-2 font-medium bg-transparent"
                               value="${ch.name}"
                               data-idx="${idx}" />
                      </td>

                      <!-- Role -->
                      <td class="p-2">
                        <select class="channel-role-select text-[11px] py-1 px-1.5 rounded border border-subtle bg-base font-mono cursor-pointer" data-idx="${idx}">
                          <option value="top" ${ch.role === "top" ? "selected" : ""}>Top</option>
                          <option value="mid" ${ch.role === "mid" ? "selected" : ""}>Mid</option>
                          <option value="bottom" ${ch.role === "bottom" ? "selected" : ""}>Bottom</option>
                          <option value="retention" ${ch.role === "retention" ? "selected" : ""}>Retention</option>
                        </select>
                      </td>

                      <!-- Budget -->
                      <td class="p-2 text-right">
                        <input type="number"
                               class="channel-budget-input input text-xs py-1 px-2 w-20 font-mono text-right"
                               value="${ch.monthlyBudget}"
                               data-idx="${idx}" />
                      </td>

                      <!-- % of Budget -->
                      <td class="p-2 text-right font-mono text-slate-300 tabular-nums">
                        ${pct}%
                      </td>

                      <!-- Target CAC -->
                      <td class="p-2 text-right">
                        <input type="number"
                               class="channel-cac-input input text-xs py-1 px-2 w-20 font-mono text-right"
                               value="${ch.cacHypothesis}"
                               data-idx="${idx}" />
                      </td>

                      <!-- LTV:CAC -->
                      <td class="p-2 text-right font-mono tabular-nums ${ratio >= 3 ? "text-emerald-400 font-bold" : ratio >= 1.5 ? "text-amber-400" : "text-rose-400"}">
                        ${ratio}x
                      </td>

                      <!-- Volume -->
                      <td class="p-2 text-right">
                        <input type="number"
                               class="channel-vol-input input text-xs py-1 px-2 w-16 font-mono text-right"
                               value="${ch.volumeHypothesis}"
                               data-idx="${idx}" />
                      </td>

                      <!-- Confidence 1-5 Control -->
                      <td class="p-2 text-center">
                        <div class="inline-flex rounded border border-subtle bg-base p-0.5">
                          ${([1, 2, 3, 4, 5] as const)
                            .map(
                              (lvl) => `
                            <button type="button"
                                    class="channel-conf-btn text-[10px] font-mono px-1.5 py-0.5 rounded ${
                                      ch.confidence === lvl
                                        ? "bg-brass text-ink font-bold"
                                        : "text-muted hover:text-slate-200"
                                    }"
                                    data-idx="${idx}"
                                    data-conf="${lvl}">
                              ${lvl}
                            </button>
                          `,
                            )
                            .join("")}
                        </div>
                      </td>

                      <!-- Status -->
                      <td class="p-2">
                        <select class="channel-status-select text-[11px] py-1 px-1.5 rounded border border-subtle bg-base font-mono cursor-pointer" data-idx="${idx}">
                          <option value="testing" ${ch.status === "testing" ? "selected" : ""}>Testing</option>
                          <option value="scaling" ${ch.status === "scaling" ? "selected" : ""}>Scaling</option>
                          <option value="paused" ${ch.status === "paused" ? "selected" : ""}>Paused</option>
                          <option value="cut" ${ch.status === "cut" ? "selected" : ""}>Cut</option>
                        </select>
                      </td>

                      <!-- Action: Run Experiment -->
                      <td class="p-2 text-center">
                        <div class="flex items-center justify-center gap-1">
                          <button class="run-exp-btn btn btn-ghost text-[10px] font-mono py-1 px-2 border border-subtle text-brass-light hover:bg-brass/10"
                                  data-ch-id="${ch.id}"
                                  title="Create linked experiment">
                            Run Exp
                          </button>
                          <button class="delete-ch-btn text-muted hover:text-rose-400 px-1" data-idx="${idx}" title="Delete channel">
                            ✕
                          </button>
                        </div>
                      </td>
                    </tr>
                  `;
                  })
                  .join("")}
              </tbody>
            </table>
          </div>
        </section>

        <!-- 3. EXPERIMENT BACKLOG -->
        <section class="panel p-5 rounded-xl border border-subtle space-y-3">
          <div class="flex items-center justify-between pb-2 border-b border-subtle">
            <div>
              <h2 class="font-serif text-xl text-slate-100">Experiment Backlog</h2>
              <p class="text-xs text-muted">Cycle status: Planned → Running → Won / Lost. Won/Lost prompt updates confidence automatically.</p>
            </div>
            <button id="add-exp-btn" class="btn btn-ghost text-xs py-1.5 px-3 border border-subtle text-brass-light hover:bg-brass/10">
              + New Test
            </button>
          </div>

          <!-- Pending Confidence Update Prompt Banner (if triggered) -->
          ${
            pendingConfidencePrompt
              ? `
            <div class="p-3.5 rounded-lg border border-brass/40 bg-brass/10 flex items-center justify-between gap-3 animate-fadeIn">
              <div class="text-xs text-slate-100">
                <span>Experiment completed as <strong class="uppercase font-mono">${pendingConfidencePrompt.newStatus}</strong>. Update linked channel confidence accordingly?</span>
              </div>
              <div class="flex items-center gap-2 shrink-0">
                <button id="apply-conf-update-btn" class="btn btn-primary text-xs py-1 px-3">
                  Apply Confidence Adjustment
                </button>
                <button id="dismiss-conf-update-btn" class="btn btn-ghost text-xs py-1 px-2 border border-subtle">
                  Dismiss
                </button>
              </div>
            </div>
          `
              : ""
          }

          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            ${workingData.experiments
              .map((exp, idx) => {
                const statusColors: Record<ExperimentStatus, string> = {
                  planned: "border-slate-700 bg-slate-900/50 text-slate-300",
                  running: "border-cyan-600 bg-cyan-950/40 text-cyan-300",
                  won: "border-emerald-600 bg-emerald-950/40 text-emerald-300",
                  lost: "border-rose-600 bg-rose-950/40 text-rose-300",
                };

                return `
                <div class="p-3.5 rounded-xl border border-subtle bg-base flex flex-col justify-between space-y-2.5" data-exp-idx="${idx}">
                  <div class="space-y-1.5">
                    <div class="flex items-center justify-between gap-2">
                      <span class="chip text-[9px] font-mono uppercase bg-panel border-subtle text-muted">
                        ${exp.channelId}
                      </span>
                      <!-- Status Toggle Button -->
                      <button class="cycle-exp-status-btn chip text-[10px] font-mono uppercase px-2 py-0.5 border cursor-pointer hover:brightness-110 ${statusColors[exp.status]}"
                              data-idx="${idx}">
                        ${exp.status} ⟳
                      </button>
                    </div>

                    <p class="text-xs font-semibold text-slate-200 leading-snug">${exp.hypothesis}</p>
                    <div class="text-[11px] text-muted space-y-0.5">
                      <div><strong class="text-slate-300">Cost cap:</strong> ${formatBudget(exp.cost)}</div>
                      <div><strong class="text-slate-300">Success metric:</strong> ${exp.successMetric}</div>
                      <div><strong class="text-slate-300">Kill criterion:</strong> ${exp.killCriterion}</div>
                    </div>
                  </div>

                  <div class="flex items-center justify-end pt-1 border-t border-subtle">
                    <button class="delete-exp-btn text-muted hover:text-rose-400 text-xs px-1" data-idx="${idx}">
                      Remove test
                    </button>
                  </div>
                </div>
              `;
              })
              .join("")}
          </div>
        </section>

        <!-- 4. LAUNCH SEQUENCE -->
        <section class="panel p-5 rounded-xl border border-subtle space-y-3">
          <div class="flex items-center justify-between pb-2 border-b border-subtle">
            <div>
              <h2 class="font-serif text-xl text-slate-100">Launch Roadmap Sequence</h2>
              <p class="text-xs text-muted">Draggable multi-director execution sequence across 3 stage horizons.</p>
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            ${workingData.launchSequence
              .map((phase, pIdx) => {
                const phaseLabels: Record<LaunchPhase["phase"], string> = {
                  "pre-launch": "Pre-Launch (Wks 1–4)",
                  launch: "Public Launch (Wks 5–8)",
                  scale: "Scale & Channel Optimization",
                };

                return `
                <div class="p-3.5 rounded-xl border border-subtle bg-base space-y-3" data-phase-idx="${pIdx}">
                  <div class="flex items-center justify-between border-b border-subtle pb-1.5">
                    <span class="text-xs font-semibold text-slate-200">${phaseLabels[phase.phase]}</span>
                    <button class="add-task-btn text-xs text-brass-light hover:text-white px-1.5 py-0.5 rounded bg-panel border border-subtle" data-phase-idx="${pIdx}">
                      + Task
                    </button>
                  </div>

                  <div class="launch-tasks-list space-y-2 min-h-[120px]" data-phase-idx="${pIdx}">
                    ${phase.tasks
                      .map((t, tIdx) => {
                        const agentClass =
                          AGENT_COLORS[t.ownerAgentId] ?? "text-slate-300 bg-panel border-subtle";
                        return `
                        <div class="task-chip flex items-start justify-between gap-2 p-2 rounded-lg bg-panel border border-subtle hover:border-slate-500 cursor-grab active:cursor-grabbing"
                             draggable="true"
                             data-phase-idx="${pIdx}"
                             data-task-idx="${tIdx}">
                          <div class="space-y-1 min-w-0">
                            <span class="avatar w-5 h-5 text-[9px] font-mono font-bold shrink-0 border inline-flex items-center justify-center mr-1 ${agentClass}">
                              ${AGENT_INITIALS[t.ownerAgentId]}
                            </span>
                            <span class="text-xs text-slate-200 leading-snug">${t.label}</span>
                          </div>
                          <div class="flex flex-col items-end gap-1 shrink-0">
                            <span class="chip text-[9px] font-mono px-1 py-0 bg-base border-subtle">Wk ${t.week}</span>
                            <button class="delete-task-btn text-muted hover:text-rose-400 text-xs" data-phase-idx="${pIdx}" data-task-idx="${tIdx}">✕</button>
                          </div>
                        </div>
                      `;
                      })
                      .join("")}
                  </div>
                </div>
              `;
              })
              .join("")}
          </div>
        </section>

        <!-- 5. KPI CADENCE -->
        <section class="panel p-5 rounded-xl border border-subtle space-y-3">
          <div class="flex items-center justify-between pb-2 border-b border-subtle">
            <div>
              <h2 class="font-serif text-xl text-slate-100">KPI Cadence & Metric Health</h2>
              <p class="text-xs text-muted">Pure function computed health dot: On Track (≥100%), At Risk (70–99%), Off Track (&lt;70%).</p>
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            ${renderKpiSlot("northStar", "North Star Metric", workingData.kpis.northStar)}
            ${renderKpiSlot("weekly", "Weekly Operational Metric", workingData.kpis.weekly)}
            ${renderKpiSlot("monthly", "Monthly Review Metric", workingData.kpis.monthly)}
          </div>
        </section>

        <!-- Evolve Plan Interview Sheet Modal (if open) -->
        ${renderEvolveModal()}
      </div>
    `;

    bindEvents();
  };

  const renderKpiSlot = (
    key: "northStar" | "weekly" | "monthly",
    label: string,
    slot: KpiSlot,
  ): string => {
    const health = healthOf(slot);
    const healthStyles: Record<typeof health, { dot: string; label: string; text: string }> = {
      "on-track": { dot: "bg-emerald-500", label: "On Track", text: "text-emerald-400" },
      "at-risk": { dot: "bg-amber-500", label: "At Risk", text: "text-amber-400" },
      "off-track": { dot: "bg-rose-500", label: "Off Track", text: "text-rose-400" },
    };
    const currentStyle = healthStyles[health];

    return `
      <div class="p-4 rounded-xl border border-subtle bg-base space-y-3" data-kpi-key="${key}">
        <div class="flex items-center justify-between">
          <span class="text-xs font-semibold text-slate-200">${label}</span>
          <div class="flex items-center gap-1.5">
            <span class="w-2 h-2 rounded-full ${currentStyle.dot}"></span>
            <span class="text-[10px] font-mono ${currentStyle.text}">${currentStyle.label}</span>
          </div>
        </div>

        <input type="text"
               class="kpi-name-input input text-xs py-1.5 px-2.5 font-medium"
               data-kpi="${key}"
               value="${slot.name}"
               placeholder="Metric description..." />

        <div class="grid grid-cols-2 gap-2 text-xs font-mono">
          <div>
            <label class="block text-[10px] text-muted uppercase">Target</label>
            <input type="number"
                   class="kpi-target-input input text-xs py-1 px-2 font-mono"
                   data-kpi="${key}"
                   value="${slot.target}" />
          </div>
          <div>
            <label class="block text-[10px] text-muted uppercase">Current</label>
            <input type="number"
                   class="kpi-current-input input text-xs py-1 px-2 font-mono"
                   data-kpi="${key}"
                   value="${slot.current}" />
          </div>
        </div>
      </div>
    `;
  };

  const renderEvolveModal = (): string => {
    if (!showEvolveModal) return "";

    return `
      <div id="evolve-modal-backdrop" class="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div class="panel max-w-xl w-full border-brass/50 p-6 space-y-4 animate-fadeIn shadow-2xl">
          <div class="flex items-center justify-between pb-3 border-b border-subtle">
            <div class="flex items-center gap-2">
              <span class="avatar w-8 h-8 text-xs bg-brass/10 text-brass-light border border-brass/40 font-mono font-bold">CH</span>
              <div>
                <h3 class="font-serif text-lg text-slate-100">Founder Interview — Evolve Plan</h3>
                <p class="text-[11px] text-muted">Input real-world feedback to synthesize an updated version.</p>
              </div>
            </div>
            <button id="close-evolve-btn" class="btn btn-ghost text-xs p-1 text-muted hover:text-white">✕</button>
          </div>

          <form id="evolve-interview-form" class="space-y-3">
            <div>
              <label class="block text-xs font-medium text-slate-200 mb-1">What changed in market conditions or traction?</label>
              <textarea id="evolve-what-changed" class="input text-xs w-full py-2 px-3" rows="2" placeholder="e.g. Inbound leads slowed down; pilot customers demanded faster setup..." required></textarea>
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-200 mb-1">What did we learn from recent tests or sales calls?</label>
              <textarea id="evolve-what-learned" class="input text-xs w-full py-2 px-3" rows="2" placeholder="e.g. CAC on Google Search doubled; LinkedIn outbound had a 15% booking rate..." required></textarea>
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-200 mb-1">What is our new operational or financial constraint?</label>
              <textarea id="evolve-new-constraint" class="input text-xs w-full py-2 px-3" rows="2" placeholder="e.g. Keep monthly burn under $8,000 until seed close..." required></textarea>
            </div>

            <div class="flex items-center justify-end gap-2 pt-3 border-t border-subtle">
              <button type="button" id="cancel-evolve-btn" class="btn btn-ghost text-xs py-1.5 px-3 border border-subtle">Cancel</button>
              <button type="submit" class="btn btn-primary text-xs py-1.5 px-4 font-semibold">
                Submit & Synthesize New Version
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
  };

  const bindEvents = (): void => {
    // 1. Version Switcher
    const verSel = root.querySelector<HTMLSelectElement>("#marketing-version-select");
    verSel?.addEventListener("change", () => {
      const ver = parseInt(verSel.value, 10);
      const target = getVersionsList().find((v) => v.version === ver);
      if (target) {
        current = target;
        workingData = clonePlanData(current.frameworkData);
        workingLevers = cloneLevers(current.levers);
        planDirty = false;
        renderUI();
      }
    });

    // 2. Lever Changes (Budget Slider & Number Input)
    const budgetSlider = root.querySelector<HTMLInputElement>("#lever-budget-slider");
    const budgetNum = root.querySelector<HTMLInputElement>("#lever-budget-num");

    const updateBudget = (val: number) => {
      workingLevers.monthlyBudget = val;
      planDirty = true;
      renderUI();
    };

    budgetSlider?.addEventListener("input", () => {
      updateBudget(parseInt(budgetSlider.value, 10));
    });

    budgetNum?.addEventListener("change", () => {
      updateBudget(parseInt(budgetNum.value, 10));
    });

    // Lever Goal
    root
      .querySelector<HTMLSelectElement>("#lever-primary-goal")
      ?.addEventListener("change", (e) => {
        workingLevers.primaryGoal = (e.target as HTMLSelectElement).value as MarketingGoal;
        planDirty = true;
        renderUI();
      });

    // Lever Risk Appetite
    root.querySelectorAll<HTMLButtonElement>(".risk-toggle-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        workingLevers.riskAppetite = btn.dataset["risk"] as RiskAppetite;
        planDirty = true;
        renderUI();
      });
    });

    // 3. Recalculate with Board
    root.querySelector("#recalculate-btn")?.addEventListener("click", async () => {
      if (!planDirty) return;
      const newVersionNum = current.version + 1;
      const now = new Date().toISOString();

      // Recalculate channel weights to balance with new budget lever
      const total = totalBudget(workingData.channels);
      const factor = total > 0 ? workingLevers.monthlyBudget / total : 1;
      const rebalancedChannels = workingData.channels.map((ch) => ({
        ...ch,
        monthlyBudget: Math.round(ch.monthlyBudget * factor),
      }));

      const newPlanData: MarketingPlanData = {
        ...workingData,
        channels: rebalancedChannels,
      };

      const newDeliverable: MarketingDeliverable = {
        ...current,
        version: newVersionNum,
        createdAt: now,
        updatedAt: now,
        levers: cloneLevers(workingLevers),
        frameworkData: newPlanData,
        versions: [...getVersionsList(), current],
      };

      await saveDeliverable(newDeliverable);
      current = newDeliverable;
      workingData = clonePlanData(newPlanData);
      planDirty = false;
      renderUI();
    });

    // 4. Save as New Version (Manual Edits)
    root.querySelector("#marketing-save-btn")?.addEventListener("click", async () => {
      if (planDirty) return;
      const newVersionNum = current.version + 1;
      const now = new Date().toISOString();

      const newDeliverable: MarketingDeliverable = {
        ...current,
        version: newVersionNum,
        createdAt: now,
        updatedAt: now,
        levers: cloneLevers(workingLevers),
        frameworkData: clonePlanData(workingData),
        versions: [...getVersionsList(), current],
      };

      await saveDeliverable(newDeliverable);
      current = newDeliverable;
      renderUI();
    });

    // 5. Channel Field Inputs
    root.querySelectorAll<HTMLInputElement>(".channel-name-input").forEach((input) => {
      input.addEventListener("input", () => {
        const idx = parseInt(input.dataset["idx"] ?? "0", 10);
        workingData.channels[idx]!.name = input.value;
      });
    });

    root.querySelectorAll<HTMLSelectElement>(".channel-role-select").forEach((sel) => {
      sel.addEventListener("change", () => {
        const idx = parseInt(sel.dataset["idx"] ?? "0", 10);
        workingData.channels[idx]!.role = sel.value as ChannelRole;
      });
    });

    root.querySelectorAll<HTMLInputElement>(".channel-budget-input").forEach((input) => {
      input.addEventListener("change", () => {
        const idx = parseInt(input.dataset["idx"] ?? "0", 10);
        const val = parseInt(input.value, 10);
        workingData.channels[idx]!.monthlyBudget = Number.isFinite(val) ? val : 0;
        renderUI();
      });
    });

    root.querySelectorAll<HTMLInputElement>(".channel-cac-input").forEach((input) => {
      input.addEventListener("change", () => {
        const idx = parseInt(input.dataset["idx"] ?? "0", 10);
        const val = parseInt(input.value, 10);
        workingData.channels[idx]!.cacHypothesis = Number.isFinite(val) ? val : 0;
        renderUI();
      });
    });

    root.querySelectorAll<HTMLInputElement>(".channel-vol-input").forEach((input) => {
      input.addEventListener("change", () => {
        const idx = parseInt(input.dataset["idx"] ?? "0", 10);
        const val = parseInt(input.value, 10);
        workingData.channels[idx]!.volumeHypothesis = Number.isFinite(val) ? val : 0;
      });
    });

    root.querySelectorAll<HTMLButtonElement>(".channel-conf-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.dataset["idx"] ?? "0", 10);
        const conf = parseInt(btn.dataset["conf"] ?? "3", 10) as 1 | 2 | 3 | 4 | 5;
        workingData.channels[idx]!.confidence = conf;
        renderUI();
      });
    });

    root.querySelectorAll<HTMLSelectElement>(".channel-status-select").forEach((sel) => {
      sel.addEventListener("change", () => {
        const idx = parseInt(sel.dataset["idx"] ?? "0", 10);
        workingData.channels[idx]!.status = sel.value as ChannelStatus;
      });
    });

    // Add Channel
    root.querySelector("#add-channel-btn")?.addEventListener("click", () => {
      const newId = `ch_${Date.now()}`;
      workingData.channels.push({
        id: newId,
        name: "New Acquisition Channel",
        role: "top",
        monthlyBudget: 1000,
        cacHypothesis: 150,
        volumeHypothesis: 10,
        confidence: 3,
        status: "testing",
      });
      renderUI();
    });

    // Delete Channel
    root.querySelectorAll<HTMLButtonElement>(".delete-ch-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.dataset["idx"] ?? "0", 10);
        workingData.channels.splice(idx, 1);
        renderUI();
      });
    });

    // Per-row "Run experiment" action
    root.querySelectorAll<HTMLButtonElement>(".run-exp-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const chId = btn.dataset["chId"]!;
        const channel = workingData.channels.find((c) => c.id === chId);
        const chName = channel?.name ?? "Channel";
        const newExp: Experiment = {
          id: `exp_${Date.now()}`,
          channelId: chId,
          hypothesis: `Targeted creative test on ${chName} to validate <$${channel?.cacHypothesis ?? 100} CAC hurdle`,
          cost: Math.round((channel?.monthlyBudget ?? 1000) * 0.25),
          successMetric: `≥ 15 qualified conversions in 14 days`,
          killCriterion: `Zero activation after $${Math.round((channel?.monthlyBudget ?? 1000) * 0.25)} spend`,
          status: "planned",
        };
        workingData.experiments.unshift(newExp);
        renderUI();
      });
    });

    // 6. Experiment Status Toggle Cycling
    root.querySelectorAll<HTMLButtonElement>(".cycle-exp-status-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.dataset["idx"] ?? "0", 10);
        const exp = workingData.experiments[idx];
        if (!exp) return;

        const cycle: Record<ExperimentStatus, ExperimentStatus> = {
          planned: "running",
          running: "won",
          won: "lost",
          lost: "planned",
        };
        const nextStatus = cycle[exp.status];
        exp.status = nextStatus;

        if (nextStatus === "won" || nextStatus === "lost") {
          pendingConfidencePrompt = {
            experimentId: exp.id,
            channelId: exp.channelId,
            newStatus: nextStatus,
          };
        } else {
          pendingConfidencePrompt = null;
        }

        renderUI();
      });
    });

    // Apply confidence update prompt
    root.querySelector("#apply-conf-update-btn")?.addEventListener("click", () => {
      if (pendingConfidencePrompt) {
        const ch = workingData.channels.find((c) => c.id === pendingConfidencePrompt!.channelId);
        if (ch) {
          if (pendingConfidencePrompt.newStatus === "won") {
            ch.confidence = Math.min(5, ch.confidence + 1) as 1 | 2 | 3 | 4 | 5;
          } else {
            ch.confidence = Math.max(1, ch.confidence - 1) as 1 | 2 | 3 | 4 | 5;
          }
          planDirty = true;
        }
        pendingConfidencePrompt = null;
        renderUI();
      }
    });

    root.querySelector("#dismiss-conf-update-btn")?.addEventListener("click", () => {
      pendingConfidencePrompt = null;
      renderUI();
    });

    // Add & Delete Experiment
    root.querySelector("#add-exp-btn")?.addEventListener("click", () => {
      workingData.experiments.push({
        id: `exp_${Date.now()}`,
        channelId: workingData.channels[0]?.id ?? "organic",
        hypothesis: "New messaging sprint testing angle falsification",
        cost: 500,
        successMetric: "Conversion rate > 5%",
        killCriterion: "Zero signups in 7 days",
        status: "planned",
      });
      renderUI();
    });

    root.querySelectorAll<HTMLButtonElement>(".delete-exp-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.dataset["idx"] ?? "0", 10);
        workingData.experiments.splice(idx, 1);
        renderUI();
      });
    });

    // 7. Launch Sequence Add & Delete Task
    root.querySelectorAll<HTMLButtonElement>(".add-task-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const pIdx = parseInt(btn.dataset["phaseIdx"] ?? "0", 10);
        workingData.launchSequence[pIdx]!.tasks.push({
          label: "New sprint action item",
          ownerAgentId: "marcus",
          week: 1,
        });
        renderUI();
      });
    });

    root.querySelectorAll<HTMLButtonElement>(".delete-task-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const pIdx = parseInt(btn.dataset["phaseIdx"] ?? "0", 10);
        const tIdx = parseInt(btn.dataset["taskIdx"] ?? "0", 10);
        workingData.launchSequence[pIdx]!.tasks.splice(tIdx, 1);
        renderUI();
      });
    });

    // 8. KPI Inputs
    root.querySelectorAll<HTMLInputElement>(".kpi-name-input").forEach((input) => {
      input.addEventListener("input", () => {
        const kpi = input.dataset["kpi"] as "northStar" | "weekly" | "monthly";
        workingData.kpis[kpi].name = input.value;
      });
    });

    root.querySelectorAll<HTMLInputElement>(".kpi-target-input").forEach((input) => {
      input.addEventListener("change", () => {
        const kpi = input.dataset["kpi"] as "northStar" | "weekly" | "monthly";
        workingData.kpis[kpi].target = parseInt(input.value, 10) || 0;
        renderUI();
      });
    });

    root.querySelectorAll<HTMLInputElement>(".kpi-current-input").forEach((input) => {
      input.addEventListener("change", () => {
        const kpi = input.dataset["kpi"] as "northStar" | "weekly" | "monthly";
        workingData.kpis[kpi].current = parseInt(input.value, 10) || 0;
        renderUI();
      });
    });

    // 9. Evolve Plan Modal Triggers
    root.querySelector("#evolve-plan-btn")?.addEventListener("click", () => {
      showEvolveModal = true;
      renderUI();
    });

    root.querySelector("#close-evolve-btn")?.addEventListener("click", () => {
      showEvolveModal = false;
      renderUI();
    });

    root.querySelector("#cancel-evolve-btn")?.addEventListener("click", () => {
      showEvolveModal = false;
      renderUI();
    });

    root
      .querySelector<HTMLFormElement>("#evolve-interview-form")
      ?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const whatChanged = (
          root.querySelector<HTMLTextAreaElement>("#evolve-what-changed")?.value ?? ""
        ).trim();
        const whatWeLearned = (
          root.querySelector<HTMLTextAreaElement>("#evolve-what-learned")?.value ?? ""
        ).trim();
        const newConstraint = (
          root.querySelector<HTMLTextAreaElement>("#evolve-new-constraint")?.value ?? ""
        ).trim();

        const interview: EvolveInterview = { whatChanged, whatWeLearned, newConstraint };
        const newVersionNum = current.version + 1;
        const now = new Date().toISOString();

        // Create evolved plan reflecting the interview
        const evolvedData: MarketingPlanData = clonePlanData(workingData);
        evolvedData.positioning = `${evolvedData.positioning}\n\n[Evolved in v${newVersionNum}]: Learned that ${interview.whatWeLearned}. Constraint: ${interview.newConstraint}`;
        evolvedData.experiments.unshift({
          id: `exp_${Date.now()}`,
          channelId: evolvedData.channels[0]?.id ?? "organic",
          hypothesis: `Test adjustment based on feedback: ${interview.whatChanged.slice(0, 80)}`,
          cost: 400,
          successMetric: "Validated in 10 customer interviews",
          killCriterion: "No signal within 1 week",
          status: "planned",
        });

        const newDeliverable: MarketingDeliverable = {
          ...current,
          version: newVersionNum,
          createdAt: now,
          updatedAt: now,
          levers: cloneLevers(workingLevers),
          frameworkData: evolvedData,
          versions: [...getVersionsList(), current],
        };

        await saveDeliverable(newDeliverable);
        current = newDeliverable;
        workingData = clonePlanData(evolvedData);
        showEvolveModal = false;
        planDirty = false;
        renderUI();
      });

    // 10. Export Buttons
    root.querySelector("#marketing-copy-md-btn")?.addEventListener("click", async () => {
      const md = exportMarketingToMarkdown({
        ...current,
        frameworkData: workingData,
        levers: workingLevers,
      });
      await navigator.clipboard.writeText(md);
      const btn = root.querySelector("#marketing-copy-md-btn");
      if (btn) {
        btn.textContent = "Copied!";
        setTimeout(() => {
          btn.textContent = "Copy .md";
        }, 1800);
      }
    });

    root.querySelector("#marketing-download-md-btn")?.addEventListener("click", () => {
      const md = exportMarketingToMarkdown({
        ...current,
        frameworkData: workingData,
        levers: workingLevers,
      });
      downloadFile(
        `${current.ventureId}-marketing-plan-v${current.version}.md`,
        md,
        "text/markdown",
      );
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
