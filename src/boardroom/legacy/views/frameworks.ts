// @ts-nocheck
/**
 * Strategic Toolkit UI: framework checklist + generation modal (Boardroom tab) and
 * framework deliverable cards with versions, edit surface and export (Deliverables tab).
 * HTML-string rendering like the rest of the ported views; all content is escaped.
 */
import { escapeHtml } from '../markdown';
import { FRAMEWORKS, getFramework, frameworksForPhase, frameworkLabel, defaultSelection } from '../schemas';
import {
  synthesizeFramework,
  repairFrameworkDeliverable,
  saveEditedVersion,
  restoreVersion,
  isFrameworkDeliverable,
  getFrameworkDeliverables,
  recalculatePlan,
} from '../frameworkStore';
import { getAll, get, getVenture } from '../db';
import { renderWorkbench, wireWorkbench } from './workbench';
import { ltvFromFrameworks, leversLabel } from '../marketingWorkbench';
import { deliverableMarkdown, deliverableHtml } from '../exporter';

/** Generation order: canvases first so later frameworks see them as context. */
const GENERATION_ORDER = ['lean-canvas', 'business-blueprint', 'swot', 'marketing-plan'];

/* ------------------------------------------------------------------ */
/* Inline formatting                                                    */
/* ------------------------------------------------------------------ */

function inline(text = '') {
  return escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, '<strong class="text-slate-100">$1</strong>')
    .replace(/(^|[\s(])_([^_]+)_(?=[\s.,;)]|$)/g, '$1<em class="text-faint">$2</em>')
    .replace(/(^|[\s(])\*([^*]+)\*(?=[\s.,;)]|$)/g, '$1<em class="text-faint">$2</em>');
}

function fmtDate(ts) {
  const d = new Date(ts);
  return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
}

function money(v) {
  const m = String(v ?? '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  let n = parseFloat(m[0]);
  if (/\d\s*k\b/i.test(String(v))) n *= 1000;
  return n;
}

const SOURCE_LABEL = {
  generated: 'Generated',
  derived: 'Derived',
  repaired: 'Repaired',
  edited: 'Edited',
  restored: 'Restored',
  recalculated: 'Recalculated',
  evolved: 'Evolved',
  reallocated: 'Reallocated',
};

/** Picker label: plan versions show their levers, e.g. "v2 · $10k/mo aggressive". */
function versionLabel(deliv, x) {
  const levers = deliv.framework === 'marketing-plan' && x.workbench?.levers ? leversLabel(x.workbench.levers) : null;
  return `v${x.version} · ${levers ? `${levers} · ` : ''}${SOURCE_LABEL[x.source] || x.source}${x.version === deliv.currentVersion ? ' (current)' : ''}`;
}

/* ------------------------------------------------------------------ */
/* Strategic Toolkit panel (Boardroom tab)                              */
/* ------------------------------------------------------------------ */

export function renderToolkitPanel({ venture, phase, deliverables, selected = null, derive = {} }) {
  const list = frameworksForPhase(phase.id);
  // Keep the founder's current picks across in-place refreshes; defaults only on first render.
  const preselected = selected ?? defaultSelection(phase.id, venture.stage);
  const byFramework = Object.fromEntries(
    deliverables.filter(d => isFrameworkDeliverable(d) && d.phase === phase.id).map(d => [d.framework, d])
  );
  const canvases = deliverables.filter(d => isFrameworkDeliverable(d) && ['lean-canvas', 'business-blueprint'].includes(d.framework));

  return `
    <div class="panel p-5 border-subtle space-y-3" id="phase-deliverable-card-container" data-toolkit-phase="${phase.id}">
      <div class="flex items-center justify-between pb-2 border-b border-subtle">
        <h3 class="text-xs font-semibold uppercase tracking-wider text-muted font-mono">Strategic Toolkit</h3>
        <span class="chip text-[10px] py-0 px-1.5 bg-base border-subtle font-mono">Phase 0${phase.number}</span>
      </div>
      <p class="text-[11px] text-muted leading-relaxed">
        Choose which frameworks The Chair should draft. Each becomes its own deliverable with versions you can edit and export.
      </p>

      <div class="space-y-2" role="group" aria-label="Frameworks to generate">
        ${list.map(f => {
          const existing = byFramework[f.id];
          const checked = preselected.includes(f.id);
          const label = frameworkLabel(f, phase.id);
          const statusChip = existing
            ? existing.status === 'needs-repair'
              ? `<span class="chip text-[9px] py-0 px-1.5 bg-warn/10 text-warn border-warn/30 font-mono">v${existing.currentVersion} · needs repair</span>`
              : `<span class="chip text-[9px] py-0 px-1.5 bg-success/10 text-success border-success/30 font-mono">v${existing.currentVersion} ✓</span>`
            : '';
          return `
            <label class="flex items-start gap-2.5 p-2.5 rounded-lg bg-base border border-subtle hover:border-border-strong cursor-pointer transition-colors">
              <input type="checkbox" class="toolkit-fw-checkbox mt-0.5 accent-brass w-4 h-4 shrink-0" value="${f.id}" ${checked ? 'checked' : ''} />
              <span class="min-w-0 flex-1">
                <span class="flex items-center justify-between gap-2">
                  <span class="text-xs font-semibold text-slate-200">${escapeHtml(label)}</span>
                  ${statusChip}
                </span>
                <span class="block text-[11px] text-muted leading-snug mt-0.5">${escapeHtml(f.description)}</span>
                ${f.derivableFrom ? `
                  <span class="mt-2 flex items-center gap-1.5 text-[10px] text-faint" onclick="event.stopPropagation()">
                    <span class="font-mono uppercase">Derive from…</span>
                    <select class="toolkit-derive-select input text-[11px] py-1 px-2 bg-panel w-auto flex-1 min-w-0" data-fw="${f.id}" ${canvases.length ? '' : 'disabled'}>
                      <option value="">Board transcript</option>
                      ${canvases.map(c => `<option value="${c.id}" ${derive[f.id] === c.id ? 'selected' : ''}>Audit ${escapeHtml(frameworkLabel(getFramework(c.framework), c.phase))} (v${c.currentVersion})</option>`).join('')}
                    </select>
                  </span>` : ''}
              </span>
            </label>`;
        }).join('')}
      </div>

      <button id="toolkit-generate-btn" class="btn btn-primary text-xs py-1.5 px-3 w-full">
        Generate selected
      </button>
      <a href="/venture/${venture.id}/deliverables" class="block text-center text-[11px] text-brass-light hover:underline">View all deliverables →</a>
    </div>
  `;
}

/** Snapshot of the checklist so a refresh can restore it. */
export function readToolkitSelection() {
  const panel = document.querySelector('[data-toolkit-phase]');
  if (!panel) return { selected: null, derive: {} };
  return {
    selected: [...panel.querySelectorAll('.toolkit-fw-checkbox:checked')].map(c => c.value),
    derive: Object.fromEntries([...panel.querySelectorAll('.toolkit-derive-select')].map(s => [s.dataset.fw, s.value])),
  };
}

export function wireToolkit({ venture, phase, onChanged, bindTopbar = true }) {
  if (!document.querySelector('[data-toolkit-phase]')) return;

  const generate = () => {
    // Re-query: the panel is re-rendered in place after each run.
    const panel = document.querySelector('[data-toolkit-phase]');
    if (!panel) return;
    const ids = [...panel.querySelectorAll('.toolkit-fw-checkbox:checked')].map(c => c.value);
    if (!ids.length) {
      const btn = panel.querySelector('#toolkit-generate-btn');
      if (btn) {
        btn.textContent = 'Select at least one framework';
        setTimeout(() => { btn.textContent = 'Generate selected'; }, 1800);
      }
      return;
    }
    const jobs = ids
      .sort((a, b) => GENERATION_ORDER.indexOf(a) - GENERATION_ORDER.indexOf(b))
      .map(frameworkId => ({
        type: 'generate',
        frameworkId,
        deriveFromId: panel.querySelector(`.toolkit-derive-select[data-fw="${frameworkId}"]`)?.value || null,
      }));
    runFrameworkJobs({ venture, phaseId: phase.id, jobs, onChanged });
  };

  document.querySelector('[data-toolkit-phase] #toolkit-generate-btn')?.addEventListener('click', generate);
  if (bindTopbar) {
    document.getElementById('topbar-synthesize-btn')?.addEventListener('click', generate);
    document.getElementById('banner-synthesize-btn')?.addEventListener('click', generate);
  }
}

/* ------------------------------------------------------------------ */
/* Generation / repair progress modal                                   */
/* ------------------------------------------------------------------ */

function ensureModal() {
  let modal = document.getElementById('framework-gen-modal');
  if (modal) return modal;
  const root = document.getElementById('view-root') || document.body;
  root.insertAdjacentHTML('beforeend', `
    <div id="framework-gen-modal" class="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 hidden flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="fw-modal-title">
      <div class="panel max-w-xl w-full max-h-[90vh] overflow-hidden border-brass/50 shadow-2xl flex flex-col">
        <div class="p-5 border-b border-subtle flex items-center gap-3 shrink-0">
          <span class="avatar w-10 h-10 text-xs agent-brass-bg agent-brass font-mono font-bold border border-brass/40">CH</span>
          <div class="min-w-0">
            <h3 id="fw-modal-title" class="font-serif text-xl text-slate-100">The Chair — Strategic Toolkit</h3>
            <p id="fw-modal-sub" class="text-xs text-muted">Drafting each framework against its schema.</p>
          </div>
        </div>
        <div id="fw-modal-jobs" class="flex-1 overflow-y-auto p-5 space-y-2.5 bg-base"></div>
        <div class="p-4 border-t border-subtle flex items-center justify-between gap-2 shrink-0">
          <button id="fw-modal-stop" class="btn btn-ghost text-xs text-danger border border-danger/30 hover:bg-danger/10">Stop</button>
          <div class="flex items-center gap-2">
            <button id="fw-modal-close" class="btn btn-ghost text-xs border border-subtle hidden">Close</button>
            <a id="fw-modal-view" class="btn btn-primary text-xs hidden">View in Deliverables →</a>
          </div>
        </div>
      </div>
    </div>`);
  return document.getElementById('framework-gen-modal');
}

function jobRow(job, i) {
  const f = getFramework(job.frameworkId);
  const label = job.label || frameworkLabel(f, job.phaseId);
  return `
    <div class="p-3 rounded-lg border border-subtle bg-panel" data-job="${i}">
      <div class="flex items-center justify-between gap-2">
        <span class="text-xs font-semibold text-slate-200">${escapeHtml(job.type === 'repair' ? `Repair · ${label}` : label)}</span>
        <span class="job-status chip text-[10px] py-0 px-1.5 font-mono">Queued</span>
      </div>
      <div class="job-detail text-[11px] text-muted mt-1.5 leading-relaxed">${job.deriveFromId ? 'Audit mode: deriving from an existing canvas.' : 'Waiting for its turn.'}</div>
    </div>`;
}

function setJob(i, status, detail, tone = 'brass') {
  const row = document.querySelector(`[data-job="${i}"]`);
  if (!row) return;
  const chip = row.querySelector('.job-status');
  const tones = {
    brass: 'agent-brass-bg agent-brass animate-pulse',
    success: 'bg-success/15 text-success border-success/40',
    warn: 'bg-warn/15 text-warn border-warn/40',
    danger: 'bg-danger/15 text-danger border-danger/40',
    muted: '',
  };
  chip.className = `job-status chip text-[10px] py-0 px-1.5 font-mono ${tones[tone] || ''}`;
  chip.textContent = status;
  if (detail !== undefined) row.querySelector('.job-detail').innerHTML = detail;
}

/**
 * Run generate / repair jobs sequentially with live progress.
 * jobs: [{ type:'generate', frameworkId, deriveFromId? } | { type:'repair', frameworkId, deliverableId }]
 */
export async function runFrameworkJobs({ venture, phaseId, jobs, onChanged }) {
  const modal = ensureModal();
  const list = modal.querySelector('#fw-modal-jobs');
  const stopBtn = modal.querySelector('#fw-modal-stop');
  const closeBtn = modal.querySelector('#fw-modal-close');
  const viewBtn = modal.querySelector('#fw-modal-view');

  jobs.forEach(j => { j.phaseId = j.phaseId || phaseId; });
  list.innerHTML = jobs.map(jobRow).join('');
  modal.classList.remove('hidden');
  document.body.classList.add('overflow-hidden');
  stopBtn.classList.remove('hidden');
  closeBtn.classList.add('hidden');
  viewBtn.classList.add('hidden');
  viewBtn.setAttribute('href', `/venture/${venture.id}/deliverables`);

  const controller = new AbortController();
  let changed = false;

  const close = () => {
    controller.abort();
    modal.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
    if (changed) {
      window.dispatchEvent(new CustomEvent('boardroom:sync'));
      onChanged?.();
    }
  };
  stopBtn.onclick = close;
  closeBtn.onclick = close;
  viewBtn.onclick = () => {
    modal.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
    if (changed) {
      window.dispatchEvent(new CustomEvent('boardroom:sync'));
      onChanged?.();
    }
  };

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    if (controller.signal.aborted) break;
    setJob(i, job.type === 'repair' ? 'Repairing' : 'Drafting', 'The Chair is drafting…');
    const onChunk = (text) => setJob(i, job.type === 'repair' ? 'Repairing' : 'Drafting', `Receiving structured draft… ${text.length.toLocaleString()} characters`);

    try {
      // Re-read venture so board memory / completed phases stay fresh between jobs.
      const fresh = (await getVenture(venture.id)) || venture;
      const { deliverable, validation } = job.type === 'repair'
        ? await repairFrameworkDeliverable({ deliverableId: job.deliverableId, signal: controller.signal, onChunk })
        : await synthesizeFramework({ venture: fresh, phaseId: job.phaseId, frameworkId: job.frameworkId, deriveFromId: job.deriveFromId, signal: controller.signal, onChunk });
      changed = true;
      Object.assign(venture, fresh);

      if (deliverable.status === 'needs-repair') {
        const ids = [...new Set((validation.issues || []).map(x => x.sectionId))];
        setJob(i, `v${deliverable.currentVersion} · needs repair`, `
          <div class="text-warn">Saved with ${ids.length} section(s) to fix: ${escapeHtml(ids.join(', '))}. Valid sections were kept.</div>
          <ul class="list-disc pl-4 mt-1 space-y-0.5">${(validation.issues || []).slice(0, 4).map(x => `<li>${escapeHtml(x.problem)}</li>`).join('')}</ul>
          <button class="btn btn-ghost text-[11px] py-1 px-2 mt-2 border border-warn/40 text-warn fw-modal-repair" data-deliv-id="${deliverable.id}" data-fw="${deliverable.framework}">Repair these sections</button>`, 'warn');
      } else {
        setJob(i, `v${deliverable.currentVersion} ✓`, `${escapeHtml(deliverable.title)} saved${validation.warnings?.length ? ` · ${validation.warnings.length} note(s)` : ''}.`, 'success');
      }
    } catch (err) {
      if (err.name === 'AbortError' || controller.signal.aborted) {
        setJob(i, 'Stopped', 'Stopped — nothing was saved for this framework.', 'muted');
        break;
      }
      console.error('Framework job failed:', err);
      setJob(i, 'Failed', `<span class="text-danger">${escapeHtml(err.message || 'Unknown error')}</span>`, 'danger');
    }
  }

  // Mark untouched rows
  for (let i = 0; i < jobs.length; i++) {
    const chip = document.querySelector(`[data-job="${i}"] .job-status`);
    if (chip && chip.textContent === 'Queued') setJob(i, 'Skipped', 'Not run.', 'muted');
  }

  if (!controller.signal.aborted) {
    stopBtn.classList.add('hidden');
    closeBtn.classList.remove('hidden');
    if (changed) viewBtn.classList.remove('hidden');
    list.querySelectorAll('.fw-modal-repair').forEach(btn => {
      btn.addEventListener('click', () => {
        const deliverableId = btn.getAttribute('data-deliv-id');
        const frameworkId = btn.getAttribute('data-fw');
        runFrameworkJobs({ venture, phaseId, jobs: [{ type: 'repair', frameworkId, deliverableId }], onChanged });
      });
    });
  }
}

/* ------------------------------------------------------------------ */
/* Section renderers                                                    */
/* ------------------------------------------------------------------ */

function bulletsHtml(items, cls = '') {
  if (!items?.length) return '<p class="text-[11px] text-faint italic">Empty — repair or edit to fill.</p>';
  return `<ul class="space-y-1.5 ${cls}">${items.map(b => `<li class="flex gap-1.5 text-xs text-slate-200 leading-snug"><span class="text-faint shrink-0">•</span><span>${inline(b)}</span></li>`).join('')}</ul>`;
}

function issueIds(version) {
  return new Set((version.issues || []).map(i => i.sectionId));
}

function boxClass(flagged) {
  return flagged ? 'border-danger/60 bg-danger/5' : 'border-subtle bg-base';
}

function renderMatrix(version, phaseId) {
  const s = Object.fromEntries(version.sections.map(x => [x.id, x]));
  const flagged = issueIds(version);
  const quad = (id, axis, tone) => `
    <div class="p-4 rounded-lg border ${boxClass(flagged.has(id))} space-y-2" data-section="${id}">
      <div class="flex items-center justify-between">
        <h4 class="font-serif text-lg ${tone}">${escapeHtml(s[id]?.heading || id)}</h4>
        <span class="text-[9px] font-mono uppercase text-faint">${axis}</span>
      </div>
      ${bulletsHtml(s[id]?.body)}
    </div>`;
  return `
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      ${quad('strengths', 'Internal · +', 'text-success')}
      ${quad('weaknesses', 'Internal · −', 'text-warn')}
      ${quad('opportunities', 'External · +', 'text-sam')}
      ${quad('threats', 'External · −', 'text-danger')}
    </div>
    <div class="mt-3 p-4 rounded-lg border ${flagged.has('strategic-implications') ? 'border-danger/60 bg-danger/5' : 'border-brass/40 bg-brass/5'} space-y-2" data-section="strategic-implications">
      <h4 class="font-serif text-lg text-brass-light">Strategic Implications</h4>
      ${bulletsHtml(s['strategic-implications']?.body)}
    </div>`;
}

function renderCanvas(version, framework) {
  const flagged = issueIds(version);
  const cls = framework.id === 'lean-canvas' ? 'canvas-lean' : 'canvas-bmc';
  return `
    <div class="canvas-grid ${cls}">
      ${framework.schema.map((sch, idx) => {
        const sec = version.sections.find(x => x.id === sch.id);
        return `
          <div class="canvas-box p-3.5 rounded-lg border ${boxClass(flagged.has(sch.id))} space-y-2" data-area="${sch.area}" data-section="${sch.id}">
            <div class="flex items-center gap-2">
              ${framework.id === 'lean-canvas' ? `<span class="w-5 h-5 rounded-full border border-brass/40 text-brass-light text-[10px] font-mono flex items-center justify-center shrink-0">${idx + 1}</span>` : ''}
              <h4 class="text-[11px] font-semibold uppercase tracking-wider text-brass-light">${escapeHtml(sch.heading)}</h4>
            </div>
            ${bulletsHtml(sec?.body)}
          </div>`;
      }).join('')}
    </div>`;
}

function tableHtml(body, numericCols = []) {
  if (!body?.rows?.length) return '<p class="text-[11px] text-faint italic">Empty — repair or edit to fill.</p>';
  return `
    <div class="overflow-x-auto rounded-lg border border-subtle">
      <table class="w-full text-xs">
        <thead class="bg-panel text-[10px] uppercase tracking-wider text-muted font-mono">
          <tr>${body.columns.map((c, i) => `<th class="px-3 py-2 text-left whitespace-nowrap ${numericCols.includes(i) ? 'text-right' : ''}">${escapeHtml(c)}</th>`).join('')}</tr>
        </thead>
        <tbody class="divide-y divide-subtle">
          ${body.rows.map(r => `<tr class="bg-base">${r.map((c, i) => `<td class="px-3 py-2 align-top text-slate-200 ${numericCols.includes(i) ? 'text-right font-mono whitespace-nowrap' : ''}">${inline(c)}</td>`).join('')}</tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function renderPlan(version) {
  const s = Object.fromEntries(version.sections.map(x => [x.id, x]));
  const flagged = issueIds(version);
  const wrap = (id, inner, extra = '') => `
    <section class="space-y-2 ${extra}" data-section="${id}">
      <h4 class="text-[11px] font-semibold uppercase tracking-wider ${flagged.has(id) ? 'text-danger' : 'text-brass-light'}">${escapeHtml(s[id]?.heading || id)}${flagged.has(id) ? ' · needs repair' : ''}</h4>
      ${inner}
    </section>`;

  // Channel table + totals
  const ch = s['channel-portfolio']?.body;
  let totals = '';
  if (ch?.rows?.length) {
    const bi = ch.columns.indexOf('Monthly budget');
    const vi = ch.columns.indexOf('Expected volume');
    const budget = ch.rows.reduce((a, r) => a + (money(r[bi]) || 0), 0);
    const volume = ch.rows.reduce((a, r) => a + (money(r[vi]) || 0), 0);
    totals = `
      <div class="flex flex-wrap gap-2 text-[11px] font-mono">
        <span class="chip">Total budget $${budget.toLocaleString()}/mo</span>
        ${volume ? `<span class="chip">Expected volume ${volume.toLocaleString()}</span><span class="chip">Blended CAC $${Math.round(budget / volume).toLocaleString()}</span>` : ''}
      </div>`;
  }

  const alloc = Array.isArray(s['budget-allocation']?.body) ? s['budget-allocation'].body : [];
  const total = alloc.find(m => /total/i.test(m.label));
  const splits = alloc.filter(m => !/total/i.test(m.label));
  const allocHtml = alloc.length ? `
    <div class="space-y-2">
      ${total ? `<div class="text-xs text-slate-200">Total monthly budget: <span class="font-mono text-brass-light">${escapeHtml(total.value)}</span></div>` : ''}
      ${splits.map(m => {
        const pct = Math.max(0, Math.min(100, parseFloat(String(m.value)) || 0));
        return `
          <div class="space-y-1">
            <div class="flex justify-between text-[11px]"><span class="text-slate-300">${escapeHtml(m.label)}</span><span class="font-mono text-muted">${escapeHtml(m.value)}</span></div>
            <div class="h-1.5 rounded-full bg-panel overflow-hidden"><div class="h-full bg-brass" style="width:${pct}%"></div></div>
          </div>`;
      }).join('')}
    </div>` : '<p class="text-[11px] text-faint italic">Empty — repair or edit to fill.</p>';

  const kpis = Array.isArray(s['kpis']?.body) ? s['kpis'].body : [];

  return `
    <div class="space-y-6">
      ${wrap('positioning', `<blockquote class="p-4 rounded-lg border-l-2 border-brass bg-brass/5 text-sm text-slate-100 leading-relaxed font-serif">${inline(s['positioning']?.body || '')}</blockquote>`)}
      <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
        ${wrap('icp', bulletsHtml(s['icp']?.body))}
        ${wrap('messaging-pillars', bulletsHtml(s['messaging-pillars']?.body))}
      </div>
      ${wrap('channel-portfolio', `${tableHtml(ch, [2, 3, 4, 5])}${totals}`)}
      ${wrap('budget-allocation', allocHtml)}
      ${wrap('experiment-backlog', tableHtml(s['experiment-backlog']?.body, [2]))}
      ${wrap('launch-sequence', tableHtml(s['launch-sequence']?.body))}
      ${wrap('kpis', kpis.length ? `<div class="grid grid-cols-1 sm:grid-cols-3 gap-2">${kpis.map(k => `
        <div class="p-3 rounded-lg border border-subtle bg-base">
          <div class="text-[10px] uppercase font-mono text-muted">${escapeHtml(k.label)}</div>
          <div class="text-xs text-slate-100 mt-1">${inline(k.value)}</div>
        </div>`).join('')}</div>` : '<p class="text-[11px] text-faint italic">Empty — repair or edit to fill.</p>')}
      ${wrap('cut-first', `<div class="p-3.5 rounded-lg border border-danger/30 bg-danger/5 text-xs text-slate-200 leading-relaxed">${inline(s['cut-first']?.body || '')}</div>`)}
    </div>`;
}

function renderBody(version, framework, phaseId) {
  if (framework.renderMode === 'matrix-2x2') return renderMatrix(version, phaseId);
  if (framework.renderMode === 'canvas-grid') return renderCanvas(version, framework);
  return renderPlan(version);
}

/* ------------------------------------------------------------------ */
/* Edit surface                                                         */
/* ------------------------------------------------------------------ */

function renderEditor(version, framework) {
  return `
    <form class="fw-edit-form space-y-4">
      <div>
        <label class="block text-[11px] font-mono uppercase text-muted mb-1">Title</label>
        <input class="input text-xs" name="title" value="${escapeHtml(version.title)}" />
      </div>
      ${framework.schema.map(sch => {
        const sec = version.sections.find(x => x.id === sch.id) || { body: sch.kind === 'table' ? { columns: sch.columns, rows: [] } : sch.kind === 'prose' ? '' : [] };
        const hint = sch.kind === 'bullets' ? 'One bullet per line' : sch.kind === 'metrics' ? 'One per line: Label | Value' : sch.kind === 'table' ? 'Edit cells directly' : 'Paragraph';
        let field = '';
        if (sch.kind === 'prose') {
          field = `<textarea class="input text-xs leading-relaxed" rows="3" data-edit="${sch.id}" data-kind="prose">${escapeHtml(sec.body || '')}</textarea>`;
        } else if (sch.kind === 'bullets') {
          field = `<textarea class="input text-xs leading-relaxed font-mono" rows="${Math.max(3, (sec.body || []).length + 1)}" data-edit="${sch.id}" data-kind="bullets">${escapeHtml((sec.body || []).join('\n'))}</textarea>`;
        } else if (sch.kind === 'metrics') {
          field = `<textarea class="input text-xs leading-relaxed font-mono" rows="${Math.max(3, (sec.body || []).length + 1)}" data-edit="${sch.id}" data-kind="metrics">${escapeHtml((sec.body || []).map(m => `${m.label} | ${m.value}`).join('\n'))}</textarea>`;
        } else {
          const cols = sch.columns || sec.body.columns || [];
          field = `
            <div class="overflow-x-auto rounded-lg border border-subtle" data-edit="${sch.id}" data-kind="table">
              <table class="w-full text-xs">
                <thead class="bg-panel text-[10px] uppercase text-muted font-mono"><tr>${cols.map(c => `<th class="px-2 py-1.5 text-left whitespace-nowrap">${escapeHtml(c)}</th>`).join('')}<th></th></tr></thead>
                <tbody>
                  ${(sec.body.rows || []).map(r => tableEditRow(cols, r)).join('')}
                </tbody>
              </table>
              <button type="button" class="fw-add-row btn btn-ghost text-[11px] py-1 px-2 m-2 border border-subtle" data-cols="${escapeHtml(JSON.stringify(cols))}">+ Add row</button>
            </div>`;
        }
        return `
          <div>
            <div class="flex items-center justify-between mb-1">
              <label class="text-[11px] font-semibold uppercase tracking-wider text-brass-light">${escapeHtml(sch.heading)}</label>
              <span class="text-[10px] text-faint font-mono">${hint}</span>
            </div>
            ${field}
          </div>`;
      }).join('')}
      <div class="flex items-center justify-end gap-2 pt-2 border-t border-subtle">
        <button type="button" class="btn btn-ghost text-xs border border-subtle fw-edit-cancel">Cancel</button>
        <button type="submit" class="btn btn-primary text-xs">Save as new version</button>
      </div>
    </form>`;
}

function tableEditRow(cols, row = []) {
  return `<tr class="border-t border-subtle">${cols.map((_, i) => `<td class="p-1"><input class="input text-[11px] py-1 px-2 min-w-[110px]" value="${escapeHtml(row[i] || '')}" /></td>`).join('')}<td class="p-1"><button type="button" class="fw-del-row text-faint hover:text-danger px-1.5" aria-label="Remove row">×</button></td></tr>`;
}

function collectEdits(form, framework) {
  return framework.schema.map(sch => {
    const el = form.querySelector(`[data-edit="${sch.id}"]`);
    let body;
    if (sch.kind === 'prose') body = el.value.trim();
    else if (sch.kind === 'bullets') body = el.value.split('\n').map(s => s.trim()).filter(Boolean);
    else if (sch.kind === 'metrics') body = el.value.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
      const [label, ...rest] = l.split('|');
      return { label: (label || '').trim(), value: rest.join('|').trim() };
    });
    else body = {
      columns: sch.columns,
      rows: [...el.querySelectorAll('tbody tr')].map(tr => [...tr.querySelectorAll('input')].map(i => i.value.trim())).filter(r => r.some(Boolean)),
    };
    return { id: sch.id, heading: sch.heading, kind: sch.kind, body };
  });
}

/* ------------------------------------------------------------------ */
/* Deliverable card                                                     */
/* ------------------------------------------------------------------ */

function versionOf(deliv, n) {
  const versions = deliv.versions || [];
  return versions.find(v => v.version === n) || versions[versions.length - 1] || {
    version: deliv.currentVersion || 1, title: deliv.title, sections: deliv.sections || [], issues: deliv.issues || [], warnings: deliv.warnings || [], status: deliv.status, source: 'generated', createdAt: deliv.createdAt,
  };
}

export function renderFrameworkCard(deliv, { viewVersion, editing = false, ltvInfo = null } = {}) {
  const framework = getFramework(deliv.framework);
  if (!framework) return '';
  const v = versionOf(deliv, viewVersion ?? deliv.currentVersion);
  const isCurrent = v.version === deliv.currentVersion;
  const label = frameworkLabel(framework, deliv.phase);
  const isPlan = framework.id === 'marketing-plan';
  const issues = v.issues || [];
  const warnings = v.warnings || [];
  const derived = deliv.derivedFrom && isCurrent ? `<span class="chip text-[10px] py-0 px-1.5 font-mono">Derived from ${escapeHtml(getFramework(deliv.derivedFrom.framework)?.label || deliv.derivedFrom.framework)} v${deliv.derivedFrom.version}</span>` : '';

  return `
    <div class="panel p-5 sm:p-7 border-subtle space-y-4 deliverable-print-card" data-fw-card="${deliv.id}" data-view-version="${v.version}">
      <div class="flex flex-col lg:flex-row lg:items-start justify-between gap-3 pb-4 border-b border-subtle">
        <div class="space-y-1.5 min-w-0">
          <div class="flex flex-wrap items-center gap-1.5">
            <span class="chip text-[10px] py-0 px-2 bg-brass/10 text-brass-light border-brass/30 uppercase font-mono">${escapeHtml(label)}</span>
            <span class="chip text-[10px] py-0 px-1.5 font-mono">Phase: ${escapeHtml(deliv.phase)}</span>
            ${v.status === 'needs-repair'
              ? `<span class="chip text-[10px] py-0 px-1.5 bg-warn/10 text-warn border-warn/30 font-mono">Needs repair</span>`
              : `<span class="chip text-[10px] py-0 px-1.5 bg-success/10 text-success border-success/30 font-mono">✓ Valid</span>`}
            ${derived}
          </div>
          <h3 class="font-serif text-2xl text-slate-100">${escapeHtml(v.title)}</h3>
          <div class="text-[11px] font-mono text-muted">
            v${v.version} · ${SOURCE_LABEL[v.source] || 'Generated'} · ${fmtDate(v.createdAt)}${v.note ? ` · ${escapeHtml(v.note)}` : ''}
            ${deliv.sourceMessageIds?.length ? ` · grounded in ${deliv.sourceMessageIds.length} remarks` : ''}
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-1.5 shrink-0">
          <label class="sr-only" for="ver-${deliv.id}">Version</label>
          <select id="ver-${deliv.id}" class="fw-version-select input text-[11px] py-1.5 px-2 bg-base w-auto">
            ${[...(deliv.versions || [])].reverse().map(x => `<option value="${x.version}" ${x.version === v.version ? 'selected' : ''}>${escapeHtml(versionLabel(deliv, x))}</option>`).join('')}
          </select>
          ${!editing && !isPlan ? `<button class="fw-edit-btn btn btn-ghost text-xs py-1.5 px-2.5 border border-subtle">Edit</button>` : ''}
          <button class="fw-regen-btn btn btn-ghost text-xs py-1.5 px-2.5 border border-subtle">Regenerate</button>
          <button class="fw-copy-btn btn btn-ghost text-xs py-1.5 px-2.5 border border-subtle"><span>Copy</span></button>
          <button class="fw-md-btn btn btn-ghost text-xs py-1.5 px-2.5 border border-subtle">.md</button>
          <button class="fw-html-btn btn btn-ghost text-xs py-1.5 px-2.5 border border-subtle">.html</button>
          <button class="fw-json-btn btn btn-ghost text-xs py-1.5 px-2.5 border border-subtle">.json</button>
        </div>
      </div>

      ${!isCurrent ? `
        <div class="flex flex-wrap items-center justify-between gap-2 p-3 rounded-lg border border-brass/30 bg-brass/5 text-xs text-slate-200">
          <span>Viewing an older version (v${v.version}). The current version is v${deliv.currentVersion}.</span>
          <button class="fw-restore-btn btn btn-ghost text-[11px] py-1 px-2.5 border border-brass/40 text-brass-light">Restore as current</button>
        </div>` : ''}

      ${issues.length ? `
        <div class="p-3.5 rounded-lg border border-warn/40 bg-warn/5 space-y-2">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span class="text-xs font-semibold text-warn">${issues.length} problem(s) in ${new Set(issues.map(i => i.sectionId)).size} section(s) — the rest of the draft is kept.</span>
            ${isCurrent ? `<button class="fw-repair-btn btn btn-ghost text-[11px] py-1 px-2.5 border border-warn/40 text-warn">Repair flagged sections</button>` : ''}
          </div>
          <ul class="list-disc pl-4 text-[11px] text-slate-300 space-y-0.5">${issues.map(i => `<li><span class="font-mono text-faint">${escapeHtml(i.sectionId)}</span> — ${escapeHtml(i.problem)}</li>`).join('')}</ul>
        </div>` : ''}

      ${warnings.length && !issues.length ? `
        <div class="text-[11px] text-muted">Notes: ${warnings.map(w => escapeHtml(w.problem)).join(' ')}</div>` : ''}

      <div class="fw-body">
        ${editing ? renderEditor(v, framework) : isPlan ? renderWorkbench(deliv, v, { ltvInfo, readOnly: !isCurrent }) : renderBody(v, framework, deliv.phase)}
      </div>
    </div>`;
}

function download(filename, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Event delegation for all framework cards inside `root`.
 */
export function wireFrameworkCards({ venture, root }) {
  if (!root || root.dataset.fwWired) return;
  root.dataset.fwWired = '1';

  const rerender = async (id, opts = {}) => {
    const deliv = await get('deliverables', id);
    const card = root.querySelector(`[data-fw-card="${id}"]`);
    if (!deliv || !card) return;
    const ltvInfo = ltvFromFrameworks(await getFrameworkDeliverables(venture.id));
    card.outerHTML = renderFrameworkCard(deliv, { ltvInfo, ...opts });
  };

  wireWorkbench(root, {
    rerender: (id) => rerender(id),
    runRecalc: (args) => runPlanRecalc({ venture, ...args, onDone: () => rerender(args.deliverableId) }),
  });

  root.addEventListener('change', async (e) => {
    const sel = e.target.closest?.('.fw-version-select');
    if (!sel) return;
    const card = sel.closest('[data-fw-card]');
    await rerender(card.dataset.fwCard, { viewVersion: parseInt(sel.value, 10) });
  });

  root.addEventListener('submit', async (e) => {
    const form = e.target.closest?.('.fw-edit-form');
    if (!form) return;
    e.preventDefault();
    const card = form.closest('[data-fw-card]');
    const deliv = await get('deliverables', card.dataset.fwCard);
    const framework = getFramework(deliv.framework);
    const sections = collectEdits(form, framework);
    await saveEditedVersion(deliv.id, sections, form.querySelector('[name="title"]').value.trim());
    await rerender(deliv.id);
    window.dispatchEvent(new CustomEvent('boardroom:sync'));
  });

  root.addEventListener('click', async (e) => {
    const t = e.target;
    const card = t.closest?.('[data-fw-card]');
    if (!card) return;
    const id = card.dataset.fwCard;
    const viewVersion = parseInt(card.dataset.viewVersion, 10);

    if (t.closest('.fw-add-row')) {
      const btn = t.closest('.fw-add-row');
      const cols = JSON.parse(btn.getAttribute('data-cols') || '[]');
      btn.parentElement.querySelector('tbody').insertAdjacentHTML('beforeend', tableEditRow(cols));
      return;
    }
    if (t.closest('.fw-del-row')) {
      t.closest('tr')?.remove();
      return;
    }
    if (t.closest('.fw-edit-btn')) return rerender(id, { viewVersion, editing: true });
    if (t.closest('.fw-edit-cancel')) return rerender(id, { viewVersion });

    const deliv = await get('deliverables', id);
    if (!deliv) return;
    const v = versionOf(deliv, viewVersion);
    const doc = { title: v.title, framework: deliv.framework, sections: v.sections };
    const slug = `${(venture.name || 'venture').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${deliv.framework}-v${v.version}`;

    const exportOpts = { ventureName: venture.name, version: v.version, ltvInfo: ltvFromFrameworks(await getFrameworkDeliverables(venture.id)) };
    if (t.closest('.fw-copy-btn')) {
      await navigator.clipboard.writeText(deliverableMarkdown(deliv, exportOpts));
      const span = t.closest('.fw-copy-btn').querySelector('span');
      span.textContent = '✓ Copied';
      setTimeout(() => { span.textContent = 'Copy'; }, 1800);
    } else if (t.closest('.fw-md-btn')) {
      download(`${slug}.md`, deliverableMarkdown(deliv, exportOpts), 'text/markdown;charset=utf-8');
    } else if (t.closest('.fw-html-btn')) {
      download(`${slug}.html`, deliverableHtml(deliv, exportOpts), 'text/html;charset=utf-8');
    } else if (t.closest('.fw-json-btn')) {
      const payload = { ...doc, framework: deliv.framework, workbench: v.workbench || undefined, venture: venture.name, phase: deliv.phase, version: v.version, source: v.source, createdAt: new Date(v.createdAt).toISOString(), sourceMessageIds: deliv.sourceMessageIds || [], derivedFrom: deliv.derivedFrom || null };
      download(`${slug}.json`, JSON.stringify(payload, null, 2), 'application/json');
    } else if (t.closest('.fw-restore-btn')) {
      await restoreVersion(id, v.version);
      await rerender(id);
    } else if (t.closest('.fw-repair-btn')) {
      runFrameworkJobs({ venture, phaseId: deliv.phase, jobs: [{ type: 'repair', frameworkId: deliv.framework, deliverableId: id }], onChanged: () => rerender(id) });
    } else if (t.closest('.fw-regen-btn')) {
      runFrameworkJobs({ venture, phaseId: deliv.phase, jobs: [{ type: 'generate', frameworkId: deliv.framework, deriveFromId: null }], onChanged: () => rerender(id) });
    }
  });
}

/* ------------------------------------------------------------------ */
/* Marketing Plan: "Recalculate with the board" progress                */
/* ------------------------------------------------------------------ */

async function runPlanRecalc({ venture, deliverableId, workbench, fromLevers, answers, onDone }) {
  const modal = ensureModal();
  const list = modal.querySelector('#fw-modal-jobs');
  const stopBtn = modal.querySelector('#fw-modal-stop');
  const closeBtn = modal.querySelector('#fw-modal-close');
  const viewBtn = modal.querySelector('#fw-modal-view');
  modal.querySelector('#fw-modal-title').textContent = answers ? 'Evolving the Marketing Plan' : 'Recalculating with the board';
  modal.querySelector('#fw-modal-sub').textContent = `Marcus re-plans for ${leversLabel(workbench.levers)}, then Elena audits the money.`;
  const stages = [
    { name: 'Marcus Webb · re-plan', wait: answers ? 'Reading your interview answers next.' : 'Re-planning channels for the new levers.' },
    { name: 'Elena Voss · money audit', wait: 'Checks CAC, LTV:CAC and the budget split after Marcus.' },
  ];
  list.innerHTML = stages.map((st, i) => `
    <div class="p-3 rounded-lg border border-subtle bg-panel" data-job="${i}">
      <div class="flex items-center justify-between gap-2">
        <span class="text-xs font-semibold text-slate-200">${escapeHtml(st.name)}</span>
        <span class="job-status chip text-[10px] py-0 px-1.5 font-mono">Queued</span>
      </div>
      <div class="job-detail text-[11px] text-muted mt-1.5 leading-relaxed">${escapeHtml(st.wait)}</div>
    </div>`).join('');
  modal.classList.remove('hidden');
  document.body.classList.add('overflow-hidden');
  stopBtn.classList.remove('hidden');
  closeBtn.classList.add('hidden');
  viewBtn.classList.add('hidden');

  const controller = new AbortController();
  let saved = false;
  const close = () => {
    controller.abort();
    modal.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
    modal.querySelector('#fw-modal-title').textContent = 'The Chair — Strategic Toolkit';
    modal.querySelector('#fw-modal-sub').textContent = 'Drafting each framework against its schema.';
    if (saved) {
      window.dispatchEvent(new CustomEvent('boardroom:sync'));
      onDone?.();
    }
  };
  stopBtn.onclick = close;
  closeBtn.onclick = close;

  try {
    const { deliverable } = await recalculatePlan({
      deliverableId, workbench, fromLevers, answers, signal: controller.signal,
      onStage: (i, state, detail) => {
        if (state === 'start') setJob(i, 'Working', i === 0 ? 'Marcus is re-planning…' : 'Elena is auditing the numbers…');
        else if (state === 'chunk') setJob(i, 'Working', `Receiving plan… ${Number(detail).toLocaleString()} characters`);
        else setJob(i, 'Done', `${detail} change(s) logged.`, 'success');
      },
    });
    saved = true;
    modal.querySelector('#fw-modal-sub').textContent = `Saved as v${deliverable.currentVersion} · ${leversLabel(deliverable.workbench.levers)}. The previous version stays in the picker.`;
    if (deliverable.status === 'needs-repair') {
      modal.querySelector('#fw-modal-sub').textContent += ' Some sections need repair.';
    }
  } catch (err) {
    if (err.name === 'AbortError' || controller.signal.aborted) return;
    console.error('Plan recalculation failed:', err);
    const running = [...list.querySelectorAll('.job-status')].findIndex(c => c.textContent !== 'Done');
    setJob(Math.max(0, running), 'Failed', `<span class="text-danger">${escapeHtml(err.message || 'Unknown error')} — nothing was saved.</span>`, 'danger');
  }
  stopBtn.classList.add('hidden');
  closeBtn.classList.remove('hidden');
}

export { FRAMEWORKS };
