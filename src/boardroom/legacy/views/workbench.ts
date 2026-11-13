// @ts-nocheck
/**
 * Marketing Plan workbench ("cockpit") for the 'marketing-plan' framework card.
 * Founder edits land in a working copy (persisted as the deliverable's draft, never a
 * version). Recalculate / Evolve / one-click reallocation / Save create NEW versions;
 * older versions render read-only and can be restored from the version picker.
 */
import { escapeHtml } from "../markdown";
import {
  GOALS,
  RISKS,
  CHANNEL_STATUSES,
  EXPERIMENT_STATUSES,
  HEALTH_STATES,
  KPI_SLOTS,
  OWNERS,
  computePortfolio,
  effectiveLtv,
  suggestReallocation,
  applyReallocation,
  setChannelStatus,
  setExperimentStatus,
  experimentForChannel,
  outcomeDrift,
  moveTask,
  leversLabel,
  leversEqual,
  fmtMoney,
  fmtNum,
  newId,
  ownerName,
  clampConfidence,
} from "../marketingWorkbench";
import {
  versionWorkbench,
  saveWorkbenchDraft,
  discardWorkbenchDraft,
  commitWorkbench,
} from "../frameworkStore";

const clone = (x) => JSON.parse(JSON.stringify(x));

/** deliverableId -> live session (working copy + committed snapshot). */
const sessions = new Map();
/** deliverableId -> UI-only state that survives re-renders. */
const uiState = new Map();

const OWNER_CLASS = {
  founder: "agent-brass agent-brass-bg",
  marcus: "agent-emerald agent-emerald-bg",
  elena: "agent-rose agent-rose-bg",
  sam: "agent-sky agent-sky-bg",
  priya: "agent-violet agent-violet-bg",
  maya: "agent-cyan agent-cyan-bg",
  david: "agent-amber agent-amber-bg",
  chair: "agent-brass agent-brass-bg",
};
const CH_STATUS_CLASS = {
  Testing: "text-sam",
  Scaling: "text-success",
  Paused: "text-warn",
  Cut: "text-danger",
};
const EXP_ON = {
  Planned: "bg-panel-hover text-slate-100",
  Running: "bg-sam/20 text-sam",
  Won: "bg-success/20 text-success",
  Lost: "bg-danger/20 text-danger",
};
const EXP_BORDER = {
  Planned: "border-subtle",
  Running: "border-sam/40",
  Won: "border-success/40",
  Lost: "border-danger/40",
};
const HEALTH_DOT = { "on-track": "bg-success", "at-risk": "bg-warn", "off-track": "bg-danger" };
const HEALTH_ON = {
  "on-track": "border-success/50 bg-success/10 text-success",
  "at-risk": "border-warn/50 bg-warn/10 text-warn",
  "off-track": "border-danger/50 bg-danger/10 text-danger",
};

const ui = (id) => {
  if (!uiState.has(id))
    uiState.set(id, { selectedTask: null, narrativeOpen: false, flashExp: null });
  return uiState.get(id);
};

function ratioClass(r) {
  if (r == null) return "text-faint";
  if (r >= 3) return "text-success";
  if (r >= 1) return "text-warn";
  return "text-danger";
}
const ratio = (r) => (r == null ? "—" : `${r.toFixed(1)}×`);
const H = (label, extra = "") =>
  `<h4 class="text-[11px] font-semibold uppercase tracking-wider text-brass-light ${extra}">${label}</h4>`;
const L = (label, cls = "text-muted") =>
  `<span class="block text-[10px] font-mono uppercase tracking-wider ${cls} mb-1">${label}</span>`;

/* ------------------------------------------------------------------ */
/* Render                                                               */
/* ------------------------------------------------------------------ */

/**
 * @param deliv the framework deliverable
 * @param version the version being viewed
 * @param ctx { ltvInfo, readOnly }
 */
export function renderWorkbench(deliv, version, { ltvInfo = null, readOnly = false } = {}) {
  const committed = versionWorkbench(deliv, version);
  const draftOk =
    !readOnly &&
    deliv.draft &&
    deliv.draft.basedOnVersion === deliv.currentVersion &&
    deliv.draft.workbench;
  const lastVersion = (deliv.versions || []).reduce(
    (m, v) => Math.max(m, v.version),
    deliv.currentVersion || 1,
  );
  const s = {
    id: deliv.id,
    working: clone(draftOk ? deliv.draft.workbench : committed),
    committed: clone(committed),
    ltvInfo,
    readOnly,
    version: version.version,
    nextVersion: lastVersion + 1,
    changeLog: version.changeLog || [],
    answers: version.answers || null,
    source: version.source,
  };
  sessions.set(deliv.id, s);
  return `<div class="wb space-y-5" data-wb="${deliv.id}">${inner(s)}</div>`;
}

function inner(s) {
  return `
    <div data-wb-alerts>${alertsHtml(s)}</div>
    ${leversHtml(s)}
    <div data-wb-readouts>${readoutsHtml(s)}</div>
    ${changeLogHtml(s)}
    ${narrativeHtml(s)}
    ${portfolioHtml(s)}
    <div data-wb-realloc>${reallocHtml(s)}</div>
    ${experimentsHtml(s)}
    ${launchHtml(s)}
    ${kpiHtml(s)}
    <div data-wb-savebar class="sticky bottom-3 z-10">${saveBarHtml(s)}</div>
  `;
}

const isDirty = (s) => JSON.stringify(s.working) !== JSON.stringify(s.committed);
const leversMoved = (s) => !leversEqual(s.working.levers, s.committed.levers);

function alertsHtml(s) {
  if (s.readOnly) return "";
  const out = [];
  if (leversMoved(s)) {
    out.push(`
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-lg border border-warn/50 bg-warn/5" role="status">
        <div class="text-xs text-slate-200 leading-relaxed">
          <span class="chip text-[10px] py-0 px-1.5 bg-warn/15 text-warn border-warn/40 font-mono mr-1.5">Needs re-synthesis</span>
          Levers moved from <span class="font-mono text-slate-100">${escapeHtml(leversLabel(s.committed.levers))}</span> to <span class="font-mono text-brass-light">${escapeHtml(leversLabel(s.working.levers))}</span>${s.working.levers.goal !== s.committed.levers.goal ? ` · goal ${escapeHtml(s.working.levers.goal)}` : ""}. The plan below still reflects v${s.version}.
        </div>
        <button type="button" data-act="recalc" class="btn btn-primary text-xs py-1.5 px-3 shrink-0">Recalculate with the board</button>
      </div>`);
  }
  const drift = outcomeDrift(s.committed, s.working);
  if (drift.confidence.length) {
    out.push(`
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-lg border border-sam/40 bg-sam/5" role="status">
        <div class="text-xs text-slate-200 leading-relaxed">
          <span class="chip text-[10px] py-0 px-1.5 bg-sam/15 text-sam border-sam/40 font-mono mr-1.5">Evidence in</span>
          Experiment results moved confidence: ${drift.confidence.map((c) => `<span class="font-mono">${escapeHtml(c.name)} ${c.from} → ${c.to}</span>`).join(", ")}. Ask the board to re-plan around the evidence?
        </div>
        <button type="button" data-act="recalc" class="btn btn-ghost text-xs py-1.5 px-3 border border-sam/40 text-sam shrink-0">Re-synthesize</button>
      </div>`);
  }
  return out.length ? `<div class="space-y-2">${out.join("")}</div>` : "";
}

function leversHtml(s) {
  const lv = s.working.levers;
  const dis = s.readOnly ? "disabled" : "";
  const max = Math.max(
    20000,
    Math.ceil(Math.max(s.committed.levers.budget * 3, lv.budget) / 1000) * 1000,
  );
  return `
    <section class="rounded-xl border border-brass/30 bg-ink p-4 sm:p-5 space-y-4" aria-label="Plan levers">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <span class="w-1.5 h-1.5 rounded-full bg-brass ${s.readOnly ? "" : "animate-pulse"}"></span>
          <h4 class="text-[11px] font-mono uppercase tracking-[0.2em] text-brass-light">Levers</h4>
        </div>
        <span class="text-[10px] font-mono text-faint">v${s.version} · ${escapeHtml(leversLabel(s.committed.levers))}${s.readOnly ? " · read-only" : ""}</span>
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
        <div class="lg:col-span-5">
          <label for="wb-budget-${s.id}">${L("Monthly budget")}</label>
          <div class="flex items-center gap-3">
            <div class="relative w-32 shrink-0">
              <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-faint text-xs font-mono">$</span>
              <input id="wb-budget-${s.id}" type="number" min="0" step="250" inputmode="numeric" class="input font-mono text-sm pl-6 py-1.5" data-f="lever.budget" value="${lv.budget}" ${dis} />
            </div>
            <input type="range" min="0" max="${max}" step="250" value="${lv.budget}" data-f="lever.budget" class="flex-1 accent-brass" aria-label="Monthly budget slider" ${dis} />
          </div>
        </div>
        <div class="lg:col-span-3">
          <label for="wb-goal-${s.id}">${L("Primary goal")}</label>
          <select id="wb-goal-${s.id}" class="input text-xs py-1.5" data-f="lever.goal" ${dis}>
            ${GOALS.map((g) => `<option value="${g.id}" ${g.id === lv.goal ? "selected" : ""}>${g.label}</option>`).join("")}
          </select>
        </div>
        <div class="lg:col-span-4">
          ${L("Risk appetite")}
          <div class="grid grid-cols-3 rounded-lg border border-subtle bg-base p-0.5" role="radiogroup" aria-label="Risk appetite">
            ${RISKS.map((r) => {
              const on = r.id === lv.risk;
              return `<button type="button" role="radio" aria-checked="${on}" data-act="risk" data-risk="${r.id}" class="px-2 py-1.5 rounded-md text-[11px] font-medium transition-colors ${on ? "bg-brass text-ink" : "text-muted hover:text-slate-200"}" ${dis}>${r.label}</button>`;
            }).join("")}
          </div>
        </div>
      </div>
      ${
        s.readOnly
          ? ""
          : `
      <div class="flex flex-wrap items-center gap-2 pt-3 border-t border-subtle">
        <button type="button" data-act="recalc" data-wb-recalc-btn class="btn ${leversMoved(s) ? "btn-primary" : "btn-ghost border border-subtle"} text-xs py-1.5 px-3">Recalculate with the board</button>
        <button type="button" data-act="evolve" class="btn btn-ghost border border-brass/40 text-brass-light text-xs py-1.5 px-3">Evolve plan…</button>
        <span class="text-[11px] text-faint">Marcus re-plans, Elena audits the money — the result is a new version; v${s.version} stays in the picker.</span>
      </div>`
      }
    </section>`;
}

function readoutsHtml(s) {
  const ltv = effectiveLtv(s.working, s.ltvInfo);
  const pf = computePortfolio(s.working, ltv);
  const budget = s.working.levers.budget;
  const pct = budget > 0 ? Math.min(100, (pf.allocated / budget) * 100) : 0;
  const over = pf.overBy > 0;
  const tile = (label, value, sub = "", valueCls = "text-slate-100") => `
    <div class="p-3 rounded-lg border border-subtle bg-base">
      <div class="text-[10px] font-mono uppercase tracking-wider text-muted">${label}</div>
      <div class="mt-1 font-mono text-lg leading-tight ${valueCls}">${value}</div>
      ${sub}
    </div>`;
  return `
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-2">
      ${tile(
        "Allocated",
        `${fmtMoney(pf.allocated)}<span class="text-xs text-faint"> / ${fmtMoney(budget)}</span>`,
        `<div class="mt-2 h-1 rounded-full bg-panel overflow-hidden"><div class="h-full ${over ? "bg-danger" : "bg-brass"}" style="width:${pct}%"></div></div>`,
        over ? "text-danger" : "text-slate-100",
      )}
      ${tile("Blended CAC", fmtMoney(pf.blendedCac))}
      ${tile("LTV:CAC", ratio(pf.blendedLtvCac), `<div class="text-[10px] text-faint mt-1">${ltv ? `LTV ${fmtMoney(ltv)}` : "Set an LTV below"}</div>`, ratioClass(pf.blendedLtvCac))}
      ${tile("Customers / mo", fmtNum(pf.totalVolume))}
    </div>`;
}

function changeLogHtml(s) {
  if (!s.changeLog.length && !s.answers) return "";
  const a = s.answers;
  return `
    <section class="p-4 rounded-lg border border-brass/30 bg-brass/5 space-y-3">
      ${H(`What the board changed in v${s.version}`)}
      ${
        a
          ? `
        <div class="grid gap-2 sm:grid-cols-3">
          ${[
            ["What changed", a.changed],
            ["What we learned", a.learned],
            ["New constraint", a.constraint],
          ]
            .map(
              ([q, ans]) => `
            <blockquote class="p-2.5 rounded-md border-l-2 border-brass bg-base text-[11px] text-slate-200 leading-snug">
              <span class="block text-[9px] font-mono uppercase text-faint mb-0.5">${q}</span>${ans ? escapeHtml(ans) : '<span class="text-faint italic">No answer</span>'}
            </blockquote>`,
            )
            .join("")}
        </div>`
          : ""
      }
      ${
        s.changeLog.length
          ? `<ul class="space-y-1">${s.changeLog
              .map((c) => {
                const who = c.startsWith("Elena:")
                  ? "elena"
                  : c.startsWith("Marcus:")
                    ? "marcus"
                    : null;
                const text = who ? c.replace(/^(Elena|Marcus):\s*/, "") : c;
                return `<li class="flex items-start gap-2 text-xs text-slate-200 leading-snug">${who ? `<span class="avatar w-5 h-5 text-[8px] font-mono ${OWNER_CLASS[who]} shrink-0">${who === "elena" ? "EV" : "MW"}</span>` : '<span class="text-faint">•</span>'}<span>${escapeHtml(text)}</span></li>`;
              })
              .join("")}</ul>`
          : ""
      }
    </section>`;
}

function narrativeHtml(s) {
  const n = s.working.narrative;
  const dis = s.readOnly ? "disabled" : "";
  return `
    <details class="rounded-lg border border-subtle bg-base" data-wb-narrative ${ui(s.id).narrativeOpen ? "open" : ""}>
      <summary class="cursor-pointer px-4 py-3 flex items-center justify-between gap-3">
        <span class="text-[11px] font-semibold uppercase tracking-wider text-brass-light shrink-0">Positioning &amp; messaging</span>
        <span class="text-[11px] text-faint truncate">${escapeHtml(n.positioning)}</span>
      </summary>
      <div class="px-4 pb-4 grid gap-3 md:grid-cols-2">
        <label class="md:col-span-2">${L("Positioning statement")}<textarea rows="3" class="input text-xs leading-relaxed" data-f="narrative.positioning" ${dis}>${escapeHtml(n.positioning)}</textarea></label>
        <label>${L("ICP & segments · one per line")}<textarea rows="4" class="input text-xs leading-relaxed" data-f="narrative.icp" ${dis}>${escapeHtml(n.icp.join("\n"))}</textarea></label>
        <label>${L("Messaging pillars · one per line")}<textarea rows="4" class="input text-xs leading-relaxed" data-f="narrative.pillars" ${dis}>${escapeHtml(n.pillars.join("\n"))}</textarea></label>
        <label class="md:col-span-2">${L("What we would cut first", "text-danger")}<textarea rows="2" class="input text-xs leading-relaxed" data-f="narrative.cutFirst" ${dis}>${escapeHtml(n.cutFirst)}</textarea></label>
      </div>
    </details>`;
}

function footHtml(pf) {
  return `
    <tr class="bg-panel text-[11px] font-mono">
      <td class="px-2 py-2 text-slate-100 font-semibold" colspan="2">Total</td>
      <td class="px-2 py-2 text-right ${pf.overBy > 0 ? "text-danger" : "text-slate-100"}">${fmtMoney(pf.allocated)}</td>
      <td class="px-2 py-2 text-right text-slate-100">${pf.shareSum}%</td>
      <td class="px-2 py-2 text-right text-muted">${fmtMoney(pf.blendedCac)}</td>
      <td class="px-2 py-2 text-right text-muted">${fmtNum(pf.totalVolume)}/mo</td>
      <td class="px-2 py-2 text-right ${ratioClass(pf.blendedLtvCac)}">${ratio(pf.blendedLtvCac)}</td>
      <td colspan="3"></td>
    </tr>`;
}

function budgetWarnHtml(s, pf) {
  const b = s.working.levers.budget;
  if (pf.overBy > 0)
    return `<p class="text-[11px] text-danger font-medium" role="alert">Channels total ${fmtMoney(pf.allocated)} — ${fmtMoney(pf.overBy)} over the ${fmtMoney(b)} budget lever.</p>`;
  if (pf.unallocated > 0)
    return `<p class="text-[11px] text-muted">${fmtMoney(pf.unallocated)} of the ${fmtMoney(b)} lever is unallocated.</p>`;
  return "";
}

function portfolioHtml(s) {
  const ltv = effectiveLtv(s.working, s.ltvInfo);
  const pf = computePortfolio(s.working, ltv);
  const dis = s.readOnly ? "disabled" : "";
  const num = "input text-xs py-1 px-2 text-right font-mono";
  const rows = pf.rows
    .map(
      (r) => `
    <tr class="bg-base" data-ch="${r.id}">
      <td class="p-1.5"><input class="input text-xs py-1 px-2 min-w-[150px] ${r.status === "Cut" ? "line-through text-faint" : ""}" data-f="ch.name" data-id="${r.id}" value="${escapeHtml(r.name)}" aria-label="Channel name" ${dis} /></td>
      <td class="p-1.5"><input class="input text-xs py-1 px-2 min-w-[140px]" data-f="ch.role" data-id="${r.id}" value="${escapeHtml(r.role)}" aria-label="Role in funnel" ${dis} /></td>
      <td class="p-1.5"><input type="number" min="0" step="50" class="${num} w-24" data-f="ch.budget" data-id="${r.id}" value="${r.budget}" aria-label="Monthly budget for ${escapeHtml(r.name)}" ${dis} /></td>
      <td class="px-2 py-1.5 text-right font-mono text-slate-200" data-cell="share">${r.share}%</td>
      <td class="p-1.5"><input type="number" min="0" step="10" class="${num} w-20" data-f="ch.cac" data-id="${r.id}" value="${r.cac}" aria-label="CAC hypothesis for ${escapeHtml(r.name)}" ${dis} /></td>
      <td class="px-2 py-1.5 text-right font-mono text-muted whitespace-nowrap" data-cell="volume">${fmtNum(r.volume)}/mo</td>
      <td class="px-2 py-1.5 text-right font-mono whitespace-nowrap ${ratioClass(r.ltvCac)}" data-cell="ltvcac">${ratio(r.ltvCac)}</td>
      <td class="p-1.5 text-center">
        <select class="input text-xs py-1 px-1.5 w-14 font-mono" data-f="ch.confidence" data-id="${r.id}" aria-label="Confidence" ${dis}>
          ${[1, 2, 3, 4, 5].map((n) => `<option value="${n}" ${n === r.confidence ? "selected" : ""}>${n}</option>`).join("")}
        </select>
      </td>
      <td class="p-1.5">
        <select class="input text-xs py-1 px-1.5 w-[6.5rem] font-medium ${CH_STATUS_CLASS[r.status]}" data-f="ch.status" data-id="${r.id}" aria-label="Status" ${dis}>
          ${CHANNEL_STATUSES.map((st) => `<option value="${st}" ${st === r.status ? "selected" : ""}>${st}</option>`).join("")}
        </select>
      </td>
      <td class="p-1.5 whitespace-nowrap">
        ${
          s.readOnly
            ? ""
            : `
        <button type="button" data-act="run-exp" data-id="${r.id}" class="btn btn-ghost text-[11px] py-1 px-2 border border-subtle hover:border-brass/50 hover:text-brass-light">Run experiment</button>
        <button type="button" data-act="del-channel" data-id="${r.id}" class="text-faint hover:text-danger px-1.5" aria-label="Remove ${escapeHtml(r.name)}">×</button>`
        }
      </td>
    </tr>`,
    )
    .join("");

  const ltvSource = s.working.ltvOverride
    ? "founder override"
    : s.ltvInfo
      ? `from ${escapeHtml(s.ltvInfo.source)}`
      : "no revenue model found";

  return `
    <section class="space-y-2" data-section="channel-portfolio">
      <div class="flex flex-wrap items-end justify-between gap-2">
        ${H("Channel Portfolio")}
        <div class="flex flex-wrap items-center gap-2 text-[11px]">
          <span class="text-muted font-mono uppercase text-[10px]">LTV</span>
          <span class="font-mono text-slate-100" data-wb-ltv>${fmtMoney(ltv)}</span>
          <span class="text-faint" title="${escapeHtml(s.ltvInfo?.basis || "")}">${ltvSource}</span>
          <input type="number" min="0" step="100" class="input w-28 text-[11px] py-1 px-2 font-mono" placeholder="Override $" data-f="ltvOverride" value="${s.working.ltvOverride ?? ""}" aria-label="LTV override" ${dis} />
        </div>
      </div>
      <div class="overflow-x-auto rounded-lg border border-subtle">
        <table class="w-full text-xs min-w-[1040px]">
          <thead class="bg-panel text-[10px] uppercase tracking-wider text-muted font-mono">
            <tr>
              <th class="px-2 py-2 text-left">Channel</th>
              <th class="px-2 py-2 text-left">Role</th>
              <th class="px-2 py-2 text-right">Monthly $</th>
              <th class="px-2 py-2 text-right">% of budget</th>
              <th class="px-2 py-2 text-right">CAC hyp.</th>
              <th class="px-2 py-2 text-right">Volume hyp.</th>
              <th class="px-2 py-2 text-right">LTV:CAC</th>
              <th class="px-2 py-2 text-center">Conf.</th>
              <th class="px-2 py-2 text-left">Status</th>
              <th class="px-2 py-2"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-subtle">${rows || '<tr><td colspan="10" class="p-4 text-center text-[11px] text-faint italic">No channels yet.</td></tr>'}</tbody>
          <tfoot data-wb-foot>${footHtml(pf)}</tfoot>
        </table>
      </div>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div data-wb-budget-warn>${budgetWarnHtml(s, pf)}</div>
        ${s.readOnly ? "" : '<button type="button" data-act="add-channel" class="text-[11px] text-brass-light hover:underline">+ Add channel</button>'}
      </div>
    </section>`;
}

function reallocHtml(s) {
  if (s.readOnly) return "";
  const r = suggestReallocation(s.working);
  if (!r) return "";
  return `
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-lg border border-success/40 bg-success/5">
      <div class="text-xs text-slate-200 leading-relaxed">
        <span class="chip text-[10px] py-0 px-1.5 bg-success/15 text-success border-success/40 font-mono mr-1.5">Dynamic reallocation</span>
        Shift <span class="font-mono text-slate-100">${fmtMoney(r.amount)}/mo</span> from <strong class="text-slate-100">${escapeHtml(r.fromName)}</strong> → <strong class="text-slate-100">${escapeHtml(r.toName)}</strong>.
        <span class="text-muted">${escapeHtml(r.reason)}</span>
      </div>
      <button type="button" data-act="apply-realloc" class="btn btn-primary text-xs py-1.5 px-3 shrink-0">Apply · creates v${s.nextVersion}</button>
    </div>`;
}

function experimentsHtml(s) {
  const dis = s.readOnly ? "disabled" : "";
  const exps = s.working.experiments;
  const counts = EXPERIMENT_STATUSES.map(
    (st) => `${exps.filter((e) => e.status === st).length} ${st.toLowerCase()}`,
  ).join(" · ");
  const flash = ui(s.id).flashExp;
  const cards = exps
    .map((e) => {
      const ch = s.working.channels.find((c) => c.id === e.channelId);
      return `
      <article class="p-3.5 rounded-lg border ${EXP_BORDER[e.status]} bg-base space-y-2.5 ${flash === e.id ? "ring-2 ring-brass/60" : ""}" data-exp="${e.id}">
        <div class="flex items-start gap-2">
          <input class="input text-xs font-semibold py-1 px-2 flex-1" data-f="exp.test" data-id="${e.id}" value="${escapeHtml(e.test)}" aria-label="Experiment name" ${dis} />
          ${s.readOnly ? "" : `<button type="button" data-act="del-exp" data-id="${e.id}" class="text-faint hover:text-danger px-1 pt-1" aria-label="Remove experiment">×</button>`}
        </div>
        <div class="grid grid-cols-4 rounded-md border border-subtle p-0.5 bg-panel" role="radiogroup" aria-label="Experiment status">
          ${EXPERIMENT_STATUSES.map((st) => {
            const on = st === e.status;
            return `<button type="button" role="radio" aria-checked="${on}" data-act="exp-status" data-id="${e.id}" data-status="${st}" class="text-[10px] py-1 rounded font-medium transition-colors ${on ? EXP_ON[st] : "text-muted hover:text-slate-200"}" ${dis}>${st}</button>`;
          }).join("")}
        </div>
        <label class="block">${L("Hypothesis")}<textarea rows="2" class="input text-[11px] leading-snug" data-f="exp.hypothesis" data-id="${e.id}" ${dis}>${escapeHtml(e.hypothesis)}</textarea></label>
        <div class="grid grid-cols-2 gap-2">
          <label class="block">${L("Cost $")}<input type="number" min="0" step="50" class="input text-[11px] py-1 px-2 font-mono" data-f="exp.cost" data-id="${e.id}" value="${e.cost}" ${dis} /></label>
          <label class="block">${L("Channel")}<select class="input text-[11px] py-1 px-2" data-f="exp.channel" data-id="${e.id}" ${dis}>
            <option value="">None</option>
            ${s.working.channels.map((c) => `<option value="${c.id}" ${c.id === e.channelId ? "selected" : ""}>${escapeHtml(c.name)}</option>`).join("")}
          </select></label>
        </div>
        <label class="block">${L("Success metric", "text-success")}<input class="input text-[11px] py-1 px-2" data-f="exp.metric" data-id="${e.id}" value="${escapeHtml(e.metric)}" ${dis} /></label>
        <label class="block">${L("Kill criterion", "text-danger")}<input class="input text-[11px] py-1 px-2" data-f="exp.kill" data-id="${e.id}" value="${escapeHtml(e.kill)}" ${dis} /></label>
        ${e.appliedOutcome && ch ? `<div class="text-[10px] font-mono ${e.appliedOutcome === "Won" ? "text-success" : "text-danger"}">${e.appliedOutcome === "Won" ? "+1" : "−1"} confidence applied to ${escapeHtml(ch.name)} (now ${ch.confidence}/5)</div>` : ""}
        ${(e.status === "Won" || e.status === "Lost") && !ch ? '<div class="text-[10px] text-faint">Link a channel so this result moves its confidence.</div>' : ""}
      </article>`;
    })
    .join("");
  return `
    <section class="space-y-2" data-section="experiment-backlog">
      <div class="flex flex-wrap items-end justify-between gap-2">
        ${H("Experiment Backlog")}
        <span class="text-[10px] font-mono text-faint">${counts}</span>
      </div>
      <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">${cards || '<p class="text-[11px] text-faint italic">No experiments yet — use “Run experiment” on a channel.</p>'}</div>
      ${s.readOnly ? "" : '<button type="button" data-act="add-exp" class="text-[11px] text-brass-light hover:underline">+ Add experiment</button>'}
    </section>`;
}

function avatar(owner, size = "w-5 h-5 text-[8px]") {
  const o = OWNERS.find((x) => x.id === owner);
  return `<span class="avatar ${size} font-mono ${OWNER_CLASS[owner] || OWNER_CLASS.founder}" title="${escapeHtml(o?.name || owner)}">${escapeHtml(o?.initials || owner.slice(0, 2).toUpperCase())}</span>`;
}

function launchHtml(s) {
  const { phases, tasks } = s.working.launch;
  const sel = ui(s.id).selectedTask;
  const ro = s.readOnly;
  const lanes = phases
    .map((p, i) => {
      const chips = tasks
        .filter((t) => t.phase === p.id)
        .sort((a, b) => a.week - b.week)
        .map(
          (t) => `
      <button type="button" ${ro ? "" : 'draggable="true"'} data-task="${t.id}" data-act="select-task" class="wb-chip inline-flex items-center gap-1.5 pl-0.5 pr-2.5 py-0.5 rounded-full border ${sel === t.id ? "border-brass bg-brass/15" : "border-subtle bg-panel hover:border-border-strong"} text-[11px] text-slate-200 max-w-full" aria-label="Week ${t.week}: ${escapeHtml(t.title)}, owner ${escapeHtml(ownerName(t.owner))}">
        ${avatar(t.owner)}
        <span class="font-mono text-[10px] text-brass-light shrink-0">W${t.week}</span>
        <span class="truncate" data-chip-title>${escapeHtml(t.title)}</span>
      </button>`,
        )
        .join("");
      return `
      <div class="wb-lane relative rounded-lg border border-subtle bg-base p-3 pt-5 min-h-[140px] transition-colors" data-lane="${p.id}">
        <span class="absolute -top-[7px] left-3 w-3.5 h-3.5 rounded-full border-2 border-brass bg-ink"></span>
        <div class="flex items-baseline justify-between gap-2 mb-2.5">
          <span class="text-xs font-semibold text-slate-100"><span class="font-mono text-faint mr-1">0${i + 1}</span>${escapeHtml(p.label)}</span>
          <span class="text-[10px] font-mono text-muted">Week ${p.startWeek}–${p.endWeek}</span>
        </div>
        <div class="flex flex-wrap gap-1.5">${chips || '<span class="text-[11px] text-faint italic">Drop tasks here</span>'}</div>
        ${ro ? "" : `<button type="button" data-act="add-task" data-phase="${p.id}" class="mt-2.5 text-[11px] text-brass-light hover:underline">+ Task</button>`}
      </div>`;
    })
    .join("");

  const t = !ro && sel ? tasks.find((x) => x.id === sel) : null;
  const editor = t
    ? `
    <div class="p-3 rounded-lg border border-brass/30 bg-brass/5 grid gap-2 sm:grid-cols-12 items-end" data-task-editor="${t.id}">
      <label class="sm:col-span-5 block">${L("Task")}<input class="input text-xs py-1 px-2" data-f="task.title" data-id="${t.id}" value="${escapeHtml(t.title)}" /></label>
      <label class="sm:col-span-2 block">${L("Week")}<input type="number" min="1" class="input text-xs py-1 px-2 font-mono" data-f="task.week" data-id="${t.id}" value="${t.week}" /></label>
      <label class="sm:col-span-3 block">${L("Owner")}<select class="input text-xs py-1 px-2" data-f="task.owner" data-id="${t.id}">
        ${OWNERS.map((o) => `<option value="${o.id}" ${o.id === t.owner ? "selected" : ""}>${escapeHtml(o.name)}</option>`).join("")}
      </select></label>
      <label class="sm:col-span-2 block">${L("Phase")}<select class="input text-xs py-1 px-2" data-f="task.phase" data-id="${t.id}">
        ${phases.map((p) => `<option value="${p.id}" ${p.id === t.phase ? "selected" : ""}>${escapeHtml(p.label)}</option>`).join("")}
      </select></label>
      <div class="sm:col-span-12 flex items-center justify-between pt-1">
        <button type="button" data-act="del-task" data-id="${t.id}" class="text-[11px] text-danger hover:underline">Remove task</button>
        <button type="button" data-act="close-task" class="btn btn-ghost text-[11px] py-1 px-2.5 border border-subtle">Done</button>
      </div>
    </div>`
    : "";

  return `
    <section class="space-y-3" data-section="launch-sequence">
      <div class="flex flex-wrap items-end justify-between gap-2">
        ${H("Launch Sequence")}
        <span class="text-[10px] font-mono text-faint">Relative weeks · ${ro ? "read-only" : "drag chips between phases, click to edit"}</span>
      </div>
      <div class="relative grid gap-3 pt-2 lg:grid-cols-3">
        <div class="hidden lg:block absolute top-2 left-3 right-3 h-px bg-brass/40" aria-hidden="true"></div>
        ${lanes}
      </div>
      ${editor}
    </section>`;
}

function kpiHtml(s) {
  const dis = s.readOnly ? "disabled" : "";
  return `
    <section class="space-y-2" data-section="kpis">
      ${H("KPI Cadence")}
      <div class="grid gap-3 md:grid-cols-3">
        ${s.working.kpis
          .map((k) => {
            const slot = KPI_SLOTS.find((x) => x.key === k.key);
            const health = HEALTH_STATES.find((h) => h.id === k.health);
            return `
            <div class="p-3.5 rounded-lg border border-subtle bg-base space-y-2.5" data-kpi="${k.key}">
              <div class="flex items-center justify-between">
                <span class="text-[10px] font-mono uppercase tracking-wider text-brass-light">${slot.label}</span>
                <span class="flex items-center gap-1.5 text-[10px] text-muted"><span class="w-2.5 h-2.5 rounded-full ${HEALTH_DOT[k.health]}"></span>${health?.label}</span>
              </div>
              <input class="input text-xs py-1 px-2" data-f="kpi.metric" data-id="${k.key}" value="${escapeHtml(k.metric)}" aria-label="${slot.label} metric" placeholder="Metric" ${dis} />
              <div class="grid grid-cols-2 gap-2">
                <label class="block">${L("Target")}<input class="input text-[11px] py-1 px-2 font-mono" data-f="kpi.target" data-id="${k.key}" value="${escapeHtml(k.target)}" ${dis} /></label>
                <label class="block">${L("Current")}<input class="input text-[11px] py-1 px-2 font-mono" data-f="kpi.current" data-id="${k.key}" value="${escapeHtml(k.current)}" ${dis} /></label>
              </div>
              <div class="grid grid-cols-3 gap-1" role="radiogroup" aria-label="${slot.label} health">
                ${HEALTH_STATES.map((h) => {
                  const on = h.id === k.health;
                  return `<button type="button" role="radio" aria-checked="${on}" data-act="kpi-health" data-id="${k.key}" data-health="${h.id}" class="flex items-center justify-center gap-1 text-[10px] py-1 rounded border ${on ? HEALTH_ON[h.id] : "border-subtle text-muted hover:text-slate-200"}" ${dis}><span class="w-1.5 h-1.5 rounded-full ${HEALTH_DOT[h.id]}"></span>${h.label}</button>`;
                }).join("")}
              </div>
            </div>`;
          })
          .join("")}
      </div>
    </section>`;
}

function saveBarHtml(s) {
  if (s.readOnly || !isDirty(s)) return "";
  return `
    <div class="flex flex-wrap items-center justify-between gap-2 p-3 rounded-lg border border-brass/40 bg-panel shadow-2xl">
      <span class="text-xs text-slate-200 flex items-center gap-2"><span class="w-2 h-2 rounded-full bg-brass animate-pulse"></span>Working copy differs from v${s.version} · kept on this device</span>
      <div class="flex items-center gap-2">
        <button type="button" data-act="discard" class="btn btn-ghost text-xs py-1.5 px-3 border border-subtle">Discard</button>
        ${
          leversMoved(s)
            ? '<button type="button" data-act="recalc" class="btn btn-primary text-xs py-1.5 px-3">Recalculate with the board</button>'
            : `<button type="button" data-act="save" class="btn btn-primary text-xs py-1.5 px-3">Save as v${s.nextVersion}</button>`
        }
      </div>
    </div>`;
}

/* ------------------------------------------------------------------ */
/* Live refresh (no re-render, keeps focus)                             */
/* ------------------------------------------------------------------ */

function setHtml(host, sel, html) {
  const el = host.querySelector(sel);
  if (el) el.innerHTML = html;
}

function refresh(host, s) {
  const ltv = effectiveLtv(s.working, s.ltvInfo);
  const pf = computePortfolio(s.working, ltv);
  pf.rows.forEach((r) => {
    const tr = host.querySelector(`tr[data-ch="${r.id}"]`);
    if (!tr) return;
    tr.querySelector('[data-cell="share"]').textContent = `${r.share}%`;
    tr.querySelector('[data-cell="volume"]').textContent = `${fmtNum(r.volume)}/mo`;
    const lc = tr.querySelector('[data-cell="ltvcac"]');
    lc.textContent = ratio(r.ltvCac);
    lc.className = `px-2 py-1.5 text-right font-mono whitespace-nowrap ${ratioClass(r.ltvCac)}`;
  });
  setHtml(host, "[data-wb-foot]", footHtml(pf));
  setHtml(host, "[data-wb-budget-warn]", budgetWarnHtml(s, pf));
  setHtml(host, "[data-wb-readouts]", readoutsHtml(s));
  setHtml(host, "[data-wb-realloc]", reallocHtml(s));
  setHtml(host, "[data-wb-alerts]", alertsHtml(s));
  setHtml(host, "[data-wb-savebar]", saveBarHtml(s));
  const ltvEl = host.querySelector("[data-wb-ltv]");
  if (ltvEl) ltvEl.textContent = fmtMoney(ltv);

  const budget = s.working.levers.budget;
  host.querySelectorAll('[data-f="lever.budget"]').forEach((inp) => {
    if (inp.type === "range" && Number(inp.max) < budget)
      inp.max = String(Math.ceil(budget / 1000) * 1000);
    if (inp !== document.activeElement) inp.value = String(budget);
  });
  const btn = host.querySelector("[data-wb-recalc-btn]");
  if (btn) {
    const moved = leversMoved(s);
    btn.classList.toggle("btn-primary", moved);
    btn.classList.toggle("btn-ghost", !moved);
    btn.classList.toggle("border", !moved);
    btn.classList.toggle("border-subtle", !moved);
  }
}

function redraw(host, s) {
  host.innerHTML = inner(s);
}

/* ------------------------------------------------------------------ */
/* Field binding                                                        */
/* ------------------------------------------------------------------ */

const toNum = (v) => {
  const n = Number(String(v).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
};
const lines = (v) =>
  String(v)
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);

/** Apply one field to the working copy. Returns 'refresh' | 'redraw' | 'none'. */
function applyField(s, el) {
  const f = el.dataset.f;
  const id = el.dataset.id;
  const wb = s.working;
  const v = el.value;
  const ch = () => wb.channels.find((c) => c.id === id);
  const ex = () => wb.experiments.find((e) => e.id === id);
  const kp = () => wb.kpis.find((k) => k.key === id);
  const tk = () => wb.launch.tasks.find((t) => t.id === id);

  switch (f) {
    case "lever.budget":
      wb.levers.budget = toNum(v);
      return "refresh";
    case "lever.goal":
      wb.levers.goal = v;
      return "refresh";
    case "ltvOverride":
      wb.ltvOverride = v === "" ? null : toNum(v) || null;
      return "refresh";
    case "ch.name":
      if (ch()) ch().name = v;
      return "refresh";
    case "ch.role":
      if (ch()) ch().role = v;
      return "none";
    case "ch.budget":
      if (ch()) ch().budget = toNum(v);
      return "refresh";
    case "ch.cac":
      if (ch()) ch().cac = toNum(v);
      return "refresh";
    case "ch.confidence":
      if (ch()) ch().confidence = clampConfidence(Number(v));
      return "refresh";
    case "ch.status":
      s.working = setChannelStatus(wb, id, v);
      return "redraw";
    case "exp.test":
      if (ex()) ex().test = v;
      return "none";
    case "exp.hypothesis":
      if (ex()) ex().hypothesis = v;
      return "none";
    case "exp.cost":
      if (ex()) ex().cost = toNum(v);
      return "none";
    case "exp.metric":
      if (ex()) ex().metric = v;
      return "none";
    case "exp.kill":
      if (ex()) ex().kill = v;
      return "none";
    case "exp.channel":
      if (ex()) ex().channelId = v || null;
      return "redraw";
    case "kpi.metric":
      if (kp()) kp().metric = v;
      return "none";
    case "kpi.target":
      if (kp()) kp().target = v;
      return "none";
    case "kpi.current":
      if (kp()) kp().current = v;
      return "none";
    case "task.title":
      if (tk()) tk().title = v;
      return "none";
    case "task.owner":
      if (tk()) tk().owner = v;
      return "redraw";
    case "task.week":
      s.working = moveTask(wb, id, { week: toNum(v) || 1 });
      return "redraw";
    case "task.phase":
      s.working = moveTask(wb, id, { phase: v });
      return "redraw";
    case "narrative.positioning":
      wb.narrative.positioning = v;
      return "none";
    case "narrative.cutFirst":
      wb.narrative.cutFirst = v;
      return "none";
    case "narrative.icp":
      wb.narrative.icp = lines(v);
      return "none";
    case "narrative.pillars":
      wb.narrative.pillars = lines(v);
      return "none";
    default:
      return "none";
  }
}

/* ------------------------------------------------------------------ */
/* Evolve plan interview                                                */
/* ------------------------------------------------------------------ */

function openEvolveSheet(onSubmit) {
  document.getElementById("wb-evolve-sheet")?.remove();
  const root = document.getElementById("view-root") || document.body;
  root.insertAdjacentHTML(
    "beforeend",
    `
    <div id="wb-evolve-sheet" class="fixed inset-0 z-50 flex justify-end bg-base-80 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="wb-evolve-title">
      <form class="w-full max-w-md h-full overflow-y-auto bg-panel border-l border-brass/40 shadow-2xl p-6 space-y-5" novalidate>
        <div class="flex items-start justify-between gap-3">
          <div>
            <span class="text-[10px] font-mono uppercase tracking-[0.2em] text-brass-light">Founder interview</span>
            <h3 id="wb-evolve-title" class="font-serif text-2xl text-slate-100 mt-1">Evolve the plan</h3>
            <p class="text-xs text-muted mt-1 leading-relaxed">Three questions. Marcus re-plans around your answers, Elena checks the money, and the result is a new version you can compare against the last.</p>
          </div>
          <button type="button" data-evolve-close class="p-1.5 text-muted hover:text-slate-100 rounded-lg" aria-label="Close">✕</button>
        </div>
        ${[
          [
            "changed",
            "1 · What changed?",
            "e.g. A competitor launched a free tier; our biggest pilot churned.",
          ],
          [
            "learned",
            "2 · What did we learn?",
            "e.g. LinkedIn ads converted at half the expected CAC.",
          ],
          [
            "constraint",
            "3 · What is the new constraint?",
            "e.g. Budget is capped at $3k/month until the seed closes.",
          ],
        ]
          .map(
            ([name, label, ph]) => `
          <label class="block">
            <span class="block text-xs font-semibold text-slate-100 mb-1.5">${label}</span>
            <textarea name="${name}" rows="3" class="input text-xs leading-relaxed" placeholder="${escapeHtml(ph)}"></textarea>
          </label>`,
          )
          .join("")}
        <p data-evolve-error class="hidden text-[11px] text-danger">Answer at least one question so the board has something to work with.</p>
        <div class="flex items-center justify-end gap-2 pt-2 border-t border-subtle">
          <button type="button" data-evolve-close class="btn btn-ghost text-xs border border-subtle">Cancel</button>
          <button type="submit" class="btn btn-primary text-xs">Re-synthesize with the board</button>
        </div>
      </form>
    </div>`,
  );
  const sheet = document.getElementById("wb-evolve-sheet");
  const form = sheet.querySelector("form");
  const close = () => {
    sheet.remove();
    document.removeEventListener("keydown", onKey);
  };
  const onKey = (e) => {
    if (e.key === "Escape") close();
  };
  document.addEventListener("keydown", onKey);
  sheet.addEventListener("click", (e) => {
    if (e.target === sheet || e.target.closest("[data-evolve-close]")) close();
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const answers = {
      changed: form.changed.value.trim(),
      learned: form.learned.value.trim(),
      constraint: form.constraint.value.trim(),
    };
    if (!answers.changed && !answers.learned && !answers.constraint) {
      form.querySelector("[data-evolve-error]").classList.remove("hidden");
      return;
    }
    close();
    onSubmit(answers);
  });
  form.querySelector("textarea")?.focus();
}

/* ------------------------------------------------------------------ */
/* Wiring                                                               */
/* ------------------------------------------------------------------ */

/**
 * Event delegation for every workbench inside `root`.
 * rerender(id): re-read the deliverable and re-render its card.
 * runRecalc({ deliverableId, workbench, fromLevers, answers }): run Marcus + Elena.
 */
export function wireWorkbench(root, { rerender, runRecalc }) {
  const timers = new Map();

  const ctxFor = (el) => {
    const host = el?.closest?.("[data-wb]");
    if (!host) return null;
    const s = sessions.get(host.dataset.wb);
    return s && !s.readOnly ? { s, host } : null;
  };
  const persist = async (s) => {
    clearTimeout(timers.get(s.id));
    timers.delete(s.id);
    await saveWorkbenchDraft(s.id, s.working);
  };
  const schedule = (s) => {
    clearTimeout(timers.get(s.id));
    timers.set(
      s.id,
      setTimeout(() => persist(s), 400),
    );
  };
  const commit = async (s, wb, opts) => {
    await persist(s);
    await commitWorkbench(s.id, wb, opts);
    ui(s.id).selectedTask = null;
    await rerender(s.id);
    window.dispatchEvent(new CustomEvent("boardroom:sync"));
  };

  root.addEventListener("input", (e) => {
    const el = e.target;
    if (!el?.dataset?.f || el.tagName === "SELECT") return;
    const ctx = ctxFor(el);
    if (!ctx) return;
    const res = applyField(ctx.s, el);
    if (el.dataset.f === "task.title") {
      const chip = ctx.host.querySelector(`[data-task="${el.dataset.id}"] [data-chip-title]`);
      if (chip) chip.textContent = el.value;
    }
    if (res === "refresh" || res === "none") refresh(ctx.host, ctx.s);
    schedule(ctx.s);
  });

  root.addEventListener("change", async (e) => {
    const el = e.target;
    if (!el?.dataset?.f) return;
    const ctx = ctxFor(el);
    if (!ctx) return;
    const res = applyField(ctx.s, el);
    if (res === "redraw") redraw(ctx.host, ctx.s);
    else refresh(ctx.host, ctx.s);
    await persist(ctx.s);
  });

  root.addEventListener("click", async (e) => {
    const summary = e.target.closest?.("[data-wb-narrative] > summary");
    if (summary) {
      const host = summary.closest("[data-wb]");
      const details = summary.parentElement;
      ui(host.dataset.wb).narrativeOpen = !details.open;
      return;
    }
    const btn = e.target.closest?.("[data-act]");
    if (!btn || !btn.closest("[data-wb]")) return;
    const ctx = ctxFor(btn);
    if (!ctx) return;
    const { s, host } = ctx;
    const act = btn.dataset.act;
    const id = btn.dataset.id;
    const st = ui(s.id);
    st.flashExp = null;
    const change = async (wb) => {
      s.working = wb;
      redraw(host, s);
      await persist(s);
    };

    switch (act) {
      case "risk":
        s.working.levers.risk = btn.dataset.risk;
        return change(s.working);
      case "recalc":
        await persist(s);
        return runRecalc({
          deliverableId: s.id,
          workbench: clone(s.working),
          fromLevers: s.committed.levers,
          answers: null,
        });
      case "evolve":
        await persist(s);
        return openEvolveSheet((answers) =>
          runRecalc({
            deliverableId: s.id,
            workbench: clone(s.working),
            fromLevers: s.committed.levers,
            answers,
          }),
        );
      case "add-channel": {
        const wb = clone(s.working);
        wb.channels.push({
          id: newId(
            "ch",
            wb.channels.map((c) => c.id),
          ),
          name: "New channel",
          role: "Acquisition",
          budget: 0,
          cac: 250,
          confidence: 3,
          status: "Testing",
        });
        return change(wb);
      }
      case "del-channel": {
        const wb = clone(s.working);
        wb.channels = wb.channels.filter((c) => c.id !== id);
        wb.experiments.forEach((x) => {
          if (x.channelId === id) x.channelId = null;
        });
        return change(wb);
      }
      case "run-exp": {
        const c = s.working.channels.find((x) => x.id === id);
        if (!c) return;
        const wb = clone(s.working);
        const exp = experimentForChannel(
          c,
          wb.experiments.map((x) => x.id),
        );
        wb.experiments.push(exp);
        st.flashExp = exp.id;
        await change(wb);
        const card = host.querySelector(`[data-exp="${exp.id}"]`);
        card?.scrollIntoView({ block: "nearest", behavior: "smooth" });
        card?.querySelector("input")?.focus({ preventScroll: true });
        return;
      }
      case "apply-realloc": {
        const r = suggestReallocation(s.working);
        if (!r) return;
        btn.disabled = true;
        return commit(s, applyReallocation(s.working, r), {
          source: "reallocated",
          changeLog: [
            `Shifted ${fmtMoney(r.amount)}/mo from ${r.fromName} to ${r.toName}. ${r.reason}`,
          ],
        });
      }
      case "add-exp": {
        const wb = clone(s.working);
        const exp = {
          id: newId(
            "x",
            wb.experiments.map((x) => x.id),
          ),
          channelId: null,
          test: "New experiment",
          hypothesis: "",
          cost: 0,
          metric: "",
          kill: "",
          status: "Planned",
          appliedOutcome: null,
        };
        wb.experiments.push(exp);
        st.flashExp = exp.id;
        return change(wb);
      }
      case "del-exp": {
        // Undo any confidence this result applied before removing it.
        const wb = setExperimentStatus(s.working, id, "Planned");
        wb.experiments = wb.experiments.filter((x) => x.id !== id);
        return change(wb);
      }
      case "exp-status":
        return change(setExperimentStatus(s.working, id, btn.dataset.status));
      case "kpi-health": {
        const wb = clone(s.working);
        const k = wb.kpis.find((x) => x.key === id);
        if (k) k.health = btn.dataset.health;
        return change(wb);
      }
      case "add-task": {
        const wb = clone(s.working);
        const ph = wb.launch.phases.find((p) => p.id === btn.dataset.phase);
        const task = {
          id: newId(
            "t",
            wb.launch.tasks.map((t) => t.id),
          ),
          phase: ph.id,
          week: ph.startWeek,
          title: "New task",
          owner: "founder",
        };
        wb.launch.tasks.push(task);
        st.selectedTask = task.id;
        await change(wb);
        host.querySelector(`[data-task-editor] input`)?.select();
        return;
      }
      case "select-task":
        st.selectedTask = st.selectedTask === btn.dataset.task ? null : btn.dataset.task;
        return redraw(host, s);
      case "close-task":
        st.selectedTask = null;
        return redraw(host, s);
      case "del-task": {
        const wb = clone(s.working);
        wb.launch.tasks = wb.launch.tasks.filter((t) => t.id !== id);
        st.selectedTask = null;
        return change(wb);
      }
      case "discard":
        clearTimeout(timers.get(s.id));
        await discardWorkbenchDraft(s.id);
        st.selectedTask = null;
        return rerender(s.id);
      case "save":
        btn.disabled = true;
        return commit(s, s.working, { source: "edited" });
    }
  });

  /* Launch chips: drag between phases */
  let dragging = null;
  const clearLanes = () =>
    root
      .querySelectorAll("[data-lane]")
      .forEach((l) => l.classList.remove("border-brass", "bg-brass/5"));
  root.addEventListener("dragstart", (e) => {
    const chip = e.target.closest?.("[data-task]");
    if (!chip || !ctxFor(chip)) return;
    dragging = chip.dataset.task;
    e.dataTransfer.setData("text/plain", dragging);
    e.dataTransfer.effectAllowed = "move";
    chip.classList.add("opacity-50");
  });
  root.addEventListener("dragend", (e) => {
    e.target.closest?.("[data-task]")?.classList.remove("opacity-50");
    dragging = null;
    clearLanes();
  });
  root.addEventListener("dragover", (e) => {
    const lane = e.target.closest?.("[data-lane]");
    if (!lane || !dragging || !ctxFor(lane)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    clearLanes();
    lane.classList.add("border-brass", "bg-brass/5");
  });
  root.addEventListener("drop", async (e) => {
    const lane = e.target.closest?.("[data-lane]");
    const ctx = ctxFor(lane);
    if (!lane || !ctx) return;
    e.preventDefault();
    const taskId = e.dataTransfer.getData("text/plain") || dragging;
    dragging = null;
    clearLanes();
    if (!taskId) return;
    const overId = e.target.closest?.("[data-task]")?.dataset.task;
    const over =
      overId && overId !== taskId ? ctx.s.working.launch.tasks.find((t) => t.id === overId) : null;
    ctx.s.working = moveTask(
      ctx.s.working,
      taskId,
      over ? { phase: lane.dataset.lane, week: over.week } : { phase: lane.dataset.lane },
    );
    redraw(ctx.host, ctx.s);
    await persist(ctx.s);
  });
}
