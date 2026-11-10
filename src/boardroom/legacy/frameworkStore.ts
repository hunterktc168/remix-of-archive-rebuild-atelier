// @ts-nocheck
/**
 * Framework deliverables: Chair synthesis per selected framework, targeted repair,
 * versioning, edits and restores. Persists to the IndexedDB 'deliverables' store with
 * kind:'framework' and a `framework` field. One record per (venture, phase, framework);
 * every generation, repair, edit or restore appends a version.
 */
import { stream } from './llm';
import { buildContextPacket, PHASES } from './agents';
import { getAll, get, put, saveVenture, getVenture, getThreadSession } from './db';
import { getFramework, frameworkLabel } from './schemas';
import {
  buildFrameworkPrompt,
  buildRepairPrompt,
  validateFrameworkOutput,
  applyRepair,
  docToMarkdown,
  sectionsNeedingRepair,
  extractJson,
} from './frameworkEngine';
import {
  workbenchFromDoc,
  docFromWorkbench,
  ltvFromFrameworks,
  buildMarcusPrompt,
  buildElenaPrompt,
  leversLabel,
  effectiveLtv,
} from './marketingWorkbench';

const MAX_TOKENS = 4096;

export function frameworkDeliverableId(ventureId, phaseId, frameworkId) {
  return `fw_${ventureId}_${phaseId}_${frameworkId}`;
}

export function isFrameworkDeliverable(d) {
  return d && d.kind === 'framework' && !!d.framework;
}

export async function getFrameworkDeliverables(ventureId) {
  const all = await getAll('deliverables');
  return all.filter(d => d.ventureId === ventureId && isFrameworkDeliverable(d));
}

async function getPhaseTranscript(ventureId, phaseId) {
  const sessions = (await getAll('sessions')).filter(s => s.ventureId === ventureId && s.phase === phaseId);
  const msgs = sessions.flatMap(s => s.messages || s.transcript || []);
  msgs.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  return msgs;
}

function toPrior(d) {
  return { framework: d.framework, title: d.title, sections: d.sections || [] };
}

async function collectText(gen, signal, onChunk) {
  let full = '';
  for await (const chunk of gen) {
    if (signal?.aborted) throw new DOMException('Stopped by user', 'AbortError');
    full += chunk;
    onChunk?.(full);
  }
  return full;
}

function stampVersion(existing, payload) {
  const versions = existing?.versions ? [...existing.versions] : [];
  const version = (versions[versions.length - 1]?.version || 0) + 1;
  const entry = { version, createdAt: Date.now(), ...payload };
  versions.push(entry);
  return { versions, entry };
}

function mirror(deliv, entry, ventureName) {
  const doc = { title: entry.title, framework: deliv.framework, sections: entry.sections };
  return {
    ...deliv,
    title: entry.title,
    sections: entry.sections,
    issues: entry.issues,
    warnings: entry.warnings,
    status: entry.status,
    currentVersion: entry.version,
    sourceMessageIds: entry.sourceMessageIds ?? deliv.sourceMessageIds ?? [],
    derivedFrom: entry.derivedFrom ?? deliv.derivedFrom ?? null,
    contextFrameworkIds: entry.contextFrameworkIds ?? deliv.contextFrameworkIds ?? [],
    workbench: entry.workbench ?? null,
    changeLog: entry.changeLog ?? [],
    // A new version supersedes any unsaved working copy.
    draft: null,
    content: docToMarkdown(doc, { ventureName, version: entry.version }),
    updatedAt: Date.now(),
  };
}

const isPlan = (frameworkId) => frameworkId === 'marketing-plan';

/** Marketing Plan versions carry a structured workbench next to their sections. */
function planPayload(frameworkId, result, prevWorkbench, levers) {
  if (!isPlan(frameworkId)) return { sections: result.doc.sections };
  const workbench = workbenchFromDoc(result.doc, { prev: prevWorkbench, levers });
  // Normalise valid plans so computed columns (shares, volume) match the numbers.
  if (!result.issues.length) return { sections: docFromWorkbench(workbench, result.doc.title).sections, workbench };
  return { sections: result.doc.sections, workbench };
}

async function ratify(venture, phase, framework, deliv) {
  venture.completedPhases = venture.completedPhases || [];
  if (!venture.completedPhases.includes(phase.id)) venture.completedPhases.push(phase.id);
  const label = frameworkLabel(framework, phase.id);
  const marker = `[Phase 0${phase.number}: ${label} generated]`;
  const stamp = `${marker}\n${label} v${deliv.currentVersion} ratified into the deliverables archive.`;
  if (!venture.boardMemory || !venture.boardMemory.includes(marker)) {
    venture.boardMemory = venture.boardMemory?.trim() ? `${venture.boardMemory.trim()}\n\n${stamp}` : stamp;
  }
  await saveVenture(venture);

  const session = await getThreadSession(venture.id, phase.id, 'all');
  session.messages = session.messages || [];
  session.messages.push({
    id: `m_${Date.now()}_chair_${framework.id}`,
    author: 'The Chair',
    agentId: 'chair',
    role: 'The Chair',
    text: `### Framework Ratified: ${label}\n\nThe board's **${label}** (version ${deliv.currentVersion}) has been entered into the venture repository. Review, edit or export it under the **Deliverables** tab.`,
    timestamp: Date.now(),
  });
  session.updatedAt = Date.now();
  await put('sessions', session);
}

/**
 * Generate one framework deliverable with The Chair.
 * @param deriveFromId optional deliverable id of a Lean Canvas / Blueprint to audit (SWOT "Derive from…").
 */
export async function synthesizeFramework({ venture, phaseId, frameworkId, deriveFromId = null, signal, onChunk }) {
  const framework = getFramework(frameworkId);
  if (!framework) throw new Error(`Unknown framework "${frameworkId}"`);
  const phase = PHASES.find(p => p.id === phaseId) || PHASES[0];

  const transcript = await getPhaseTranscript(venture.id, phase.id);
  const allDeliverables = (await getAll('deliverables')).filter(d => d.ventureId === venture.id);
  const id = frameworkDeliverableId(venture.id, phase.id, framework.id);

  const priorFrameworks = allDeliverables.filter(d => isFrameworkDeliverable(d) && d.id !== id && (d.sections || []).length);
  const validationMemo = allDeliverables.find(d => d.phase === 'validation' && !isFrameworkDeliverable(d));
  const deriveSource = deriveFromId ? allDeliverables.find(d => d.id === deriveFromId && isFrameworkDeliverable(d)) : null;
  if (deriveFromId && !deriveSource) throw new Error('The canvas to derive from no longer exists.');

  const contextPacket = buildContextPacket(venture, phase.id, transcript);
  const { system, user } = buildFrameworkPrompt({
    framework,
    phase: phase.id,
    contextPacket,
    priorFrameworks: priorFrameworks.filter(d => d.id !== deriveSource?.id).map(toPrior),
    validationReport: framework.id === 'lean-canvas' ? validationMemo?.content || null : null,
    deriveFrom: deriveSource ? toPrior(deriveSource) : null,
  });

  const raw = await collectText(
    stream({
      system,
      messages: [{ role: 'user', content: user }],
      maxTokens: MAX_TOKENS,
      temperature: 0.4,
      signal,
      meta: {
        agentId: 'chair',
        action: 'synthesize_framework',
        frameworkId: framework.id,
        phaseId: phase.id,
        venture,
        derivedFromTitle: deriveSource?.title,
      },
    }),
    signal,
    onChunk,
  );

  if (!raw.trim()) throw new Error('The Chair returned an empty draft; nothing was saved.');

  const result = validateFrameworkOutput(raw, framework, phase.id);
  const existing = await get('deliverables', id);
  const prevWb = existing?.workbench || null;
  const payload = planPayload(framework.id, result, prevWb, prevWb ? { goal: prevWb.levers.goal, risk: prevWb.levers.risk } : undefined);
  const { versions, entry } = stampVersion(existing, {
    source: deriveSource ? 'derived' : 'generated',
    title: result.doc.title,
    ...payload,
    issues: result.issues,
    warnings: result.warnings,
    status: result.issues.length ? 'needs-repair' : 'complete',
    sourceMessageIds: transcript.map(m => m.id).filter(Boolean),
    derivedFrom: deriveSource ? { deliverableId: deriveSource.id, framework: deriveSource.framework, version: deriveSource.currentVersion } : null,
    contextFrameworkIds: priorFrameworks.map(d => d.id),
    rawOutput: result.unparseable ? raw.slice(0, 20000) : undefined,
  });

  const base = existing || {
    id,
    kind: 'framework',
    ventureId: venture.id,
    phase: phase.id,
    framework: framework.id,
    renderMode: framework.renderMode,
    createdAt: Date.now(),
  };
  const deliverable = mirror({ ...base, versions }, entry, venture.name);
  await put('deliverables', deliverable);

  if (deliverable.status === 'complete') await ratify(venture, phase, framework, deliverable);

  return { deliverable, validation: result };
}

/** Wrapper matching the spec: synthesize(ventureId, phase, frameworkId). */
export async function synthesize(ventureId, phaseId, frameworkId, opts = {}) {
  const venture = await getVenture(ventureId);
  if (!venture) throw new Error('Venture not found');
  return synthesizeFramework({ venture, phaseId, frameworkId, ...opts });
}

/**
 * Re-ask The Chair only for the sections flagged in the current version, merge them in,
 * and store the result as a new 'repaired' version. Valid sections are never replaced.
 */
export async function repairFrameworkDeliverable({ deliverableId, signal, onChunk }) {
  const deliv = await get('deliverables', deliverableId);
  if (!isFrameworkDeliverable(deliv)) throw new Error('Deliverable not found');
  const framework = getFramework(deliv.framework);
  const venture = await getVenture(deliv.ventureId);
  const phase = PHASES.find(p => p.id === deliv.phase) || PHASES[0];
  const issues = deliv.issues || [];
  if (!issues.length) return { deliverable: deliv, validation: { issues: [], warnings: deliv.warnings || [] } };

  const transcript = await getPhaseTranscript(venture.id, phase.id);
  const contextPacket = buildContextPacket(venture, phase.id, transcript);
  const doc = { title: deliv.title, framework: deliv.framework, sections: deliv.sections };
  const { system, user, repairIds } = buildRepairPrompt(framework, phase.id, doc, issues, contextPacket);

  const raw = await collectText(
    stream({
      system,
      messages: [{ role: 'user', content: user }],
      maxTokens: MAX_TOKENS,
      temperature: 0.3,
      signal,
      meta: { agentId: 'chair', action: 'repair_framework', frameworkId: framework.id, phaseId: phase.id, venture, repairIds },
    }),
    signal,
    onChunk,
  );

  const result = applyRepair(doc, raw, framework, repairIds, phase.id);
  const { versions, entry } = stampVersion(deliv, {
    source: 'repaired',
    title: result.doc.title,
    ...planPayload(framework.id, result, deliv.workbench, deliv.workbench?.levers),
    issues: result.issues,
    warnings: result.warnings,
    status: result.issues.length ? 'needs-repair' : 'complete',
    note: `Repaired: ${repairIds.join(', ')}`,
  });
  const deliverable = mirror({ ...deliv, versions }, entry, venture.name);
  await put('deliverables', deliverable);
  if (deliverable.status === 'complete') await ratify(venture, phase, framework, deliverable);
  return { deliverable, validation: result };
}

/** Save founder edits as a new version (re-validated so issues stay accurate). */
export async function saveEditedVersion(deliverableId, sections, title) {
  const deliv = await get('deliverables', deliverableId);
  const framework = getFramework(deliv.framework);
  const venture = await getVenture(deliv.ventureId);
  const result = validateFrameworkOutput({ title: title || deliv.title, framework: deliv.framework, sections }, framework, deliv.phase);
  const { versions, entry } = stampVersion(deliv, {
    source: 'edited',
    title: result.doc.title,
    ...planPayload(deliv.framework, result, deliv.workbench, deliv.workbench?.levers),
    issues: result.issues,
    warnings: result.warnings,
    status: result.issues.length ? 'needs-repair' : 'complete',
  });
  const deliverable = mirror({ ...deliv, versions }, entry, venture?.name);
  await put('deliverables', deliverable);
  return deliverable;
}

/** Make an older version current again (appended as a new 'restored' version). */
export async function restoreVersion(deliverableId, versionNumber) {
  const deliv = await get('deliverables', deliverableId);
  const old = (deliv.versions || []).find(v => v.version === versionNumber);
  if (!old) throw new Error('Version not found');
  const venture = await getVenture(deliv.ventureId);
  const { versions, entry } = stampVersion(deliv, {
    source: 'restored',
    title: old.title,
    sections: old.sections,
    issues: old.issues || [],
    warnings: old.warnings || [],
    status: old.status,
    workbench: old.workbench,
    changeLog: old.changeLog,
    note: `Restored from v${versionNumber}${old.workbench ? ` · ${leversLabel(old.workbench.levers)}` : ''}`,
  });
  const deliverable = mirror({ ...deliv, versions }, entry, venture?.name);
  await put('deliverables', deliverable);
  return deliverable;
}

/* ------------------------------------------------------------------ */
/* Marketing Plan workbench                                             */
/* ------------------------------------------------------------------ */

/** The workbench for a version (derived from its sections for older records). */
export function versionWorkbench(deliv, version) {
  if (version?.workbench) return version.workbench;
  const doc = { title: version?.title || deliv.title, framework: deliv.framework, sections: version?.sections || deliv.sections || [] };
  return workbenchFromDoc(doc);
}

/** Persist the founder's unsaved working copy (not a version). */
export async function saveWorkbenchDraft(deliverableId, workbench) {
  const deliv = await get('deliverables', deliverableId);
  if (!deliv) return null;
  deliv.draft = { workbench, basedOnVersion: deliv.currentVersion, updatedAt: Date.now() };
  await put('deliverables', deliv);
  return deliv;
}

export async function discardWorkbenchDraft(deliverableId) {
  const deliv = await get('deliverables', deliverableId);
  if (!deliv) return null;
  deliv.draft = null;
  await put('deliverables', deliv);
  return deliv;
}

/** Commit a workbench as a new version (edits, one-click reallocation). */
export async function commitWorkbench(deliverableId, workbench, { source = 'edited', note, changeLog = [] } = {}) {
  const deliv = await get('deliverables', deliverableId);
  if (!isFrameworkDeliverable(deliv)) throw new Error('Deliverable not found');
  const framework = getFramework(deliv.framework);
  const venture = await getVenture(deliv.ventureId);
  const doc = docFromWorkbench(workbench, deliv.title);
  const result = validateFrameworkOutput(doc, framework, deliv.phase);
  const { versions, entry } = stampVersion(deliv, {
    source,
    title: result.doc.title,
    sections: result.doc.sections,
    workbench,
    changeLog,
    issues: result.issues,
    warnings: result.warnings,
    status: result.issues.length ? 'needs-repair' : 'complete',
    note: note || leversLabel(workbench.levers),
  });
  const deliverable = mirror({ ...deliv, versions }, entry, venture?.name);
  await put('deliverables', deliverable);
  return deliverable;
}

/**
 * "Recalculate with the board": Marcus re-plans for the levers (and the founder's
 * interview answers when evolving), Elena audits the money, and the result is a NEW
 * version. The previous version is never touched.
 * onStage(index, state, detail) drives the progress modal (0 = Marcus, 1 = Elena).
 */
export async function recalculatePlan({ deliverableId, workbench, fromLevers, answers = null, signal, onStage }) {
  const deliv = await get('deliverables', deliverableId);
  if (!isFrameworkDeliverable(deliv) || !isPlan(deliv.framework)) throw new Error('Marketing Plan not found');
  const framework = getFramework(deliv.framework);
  const venture = await getVenture(deliv.ventureId);
  const phase = PHASES.find(p => p.id === deliv.phase) || PHASES[0];
  const transcript = await getPhaseTranscript(venture.id, phase.id);
  const contextPacket = buildContextPacket(venture, phase.id, transcript);
  const ltvInfo = ltvFromFrameworks(await getFrameworkDeliverables(venture.id));
  const ltv = effectiveLtv(workbench, ltvInfo);
  const levers = { ...workbench.levers };
  const from = fromLevers || versionWorkbench(deliv, deliv.versions?.[deliv.versions.length - 1]).levers;

  // 1) Marcus re-plans
  onStage?.(0, 'start');
  const mp = buildMarcusPrompt({ framework, contextPacket, workbench, fromLevers: from, levers, ltvInfo, answers });
  const marcusRaw = await collectText(
    stream({
      system: mp.system,
      messages: [{ role: 'user', content: mp.user }],
      maxTokens: MAX_TOKENS,
      temperature: 0.4,
      signal,
      meta: { agentId: 'marcus', action: 'workbench_marcus', venture, workbench, levers, fromLevers: from, answers, title: deliv.title },
    }),
    signal,
    (t) => onStage?.(0, 'chunk', t.length),
  );
  const marcusJson = extractJson(marcusRaw);
  if (!marcusJson) throw new Error("Marcus's re-plan could not be read as a plan; nothing was saved.");
  const marcusResult = validateFrameworkOutput(marcusJson, framework, phase.id);
  // Without an interview the founder's budget lever is binding; an interview may set a new one.
  const replanned = workbenchFromDoc(marcusResult.doc, { prev: workbench, levers: answers ? { goal: levers.goal, risk: levers.risk } : levers });
  const marcusLog = Array.isArray(marcusJson.changeLog) ? marcusJson.changeLog.map(String) : [];
  onStage?.(0, 'done', marcusLog.length);

  // 2) Elena audits channel economics (only money sections may change)
  onStage?.(1, 'start');
  const ep = buildElenaPrompt({ framework, contextPacket, workbench: replanned, ltvInfo });
  const elenaRaw = await collectText(
    stream({
      system: ep.system,
      messages: [{ role: 'user', content: ep.user }],
      maxTokens: MAX_TOKENS,
      temperature: 0.3,
      signal,
      meta: { agentId: 'elena', action: 'workbench_elena', venture, workbench: replanned, prevWorkbench: workbench, ltv },
    }),
    signal,
    (t) => onStage?.(1, 'chunk', t.length),
  );
  const elenaJson = extractJson(elenaRaw);
  const elenaLog = Array.isArray(elenaJson?.changeLog) ? elenaJson.changeLog.map(String) : [];
  const moneyIds = ['channel-portfolio', 'budget-allocation'];
  const audited = elenaJson
    ? applyRepair(docFromWorkbench(replanned, deliv.title), elenaJson, framework, moneyIds, phase.id)
    : null;
  const finalWb = audited && !audited.issues.some(i => moneyIds.includes(i.sectionId))
    ? workbenchFromDoc(audited.doc, { prev: replanned, levers: replanned.levers })
    : replanned;
  onStage?.(1, 'done', elenaLog.length);

  const doc = docFromWorkbench(finalWb, marcusResult.doc.title || deliv.title);
  const result = validateFrameworkOutput(doc, framework, phase.id);
  const changeLog = [
    ...marcusLog.map(c => `Marcus: ${c}`),
    ...elenaLog.map(c => `Elena: ${c}`),
  ];
  const { versions, entry } = stampVersion(deliv, {
    source: answers ? 'evolved' : 'recalculated',
    title: result.doc.title,
    sections: result.doc.sections,
    workbench: finalWb,
    changeLog,
    answers: answers || undefined,
    issues: result.issues,
    warnings: result.warnings,
    status: result.issues.length ? 'needs-repair' : 'complete',
    note: leversLabel(finalWb.levers),
    sourceMessageIds: transcript.map(m => m.id).filter(Boolean),
  });
  const deliverable = mirror({ ...deliv, versions }, entry, venture.name);
  await put('deliverables', deliverable);
  return { deliverable, validation: result };
}

export { sectionsNeedingRepair };
