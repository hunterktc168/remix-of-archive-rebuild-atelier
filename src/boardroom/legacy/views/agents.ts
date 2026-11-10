// @ts-nocheck
/* Ported verbatim from the original Boardroom vanilla JS app; see src/boardroom/AGENTS.md. */
import { navigateTo, replaceUrlSilently } from '../../nav';
/**
 * Board Members Roster View Module
 * Route: #/agents
 *
 * Acceptance: Roster renders from IndexedDB, edits persist across reload,
 * interactive enable/disable toggle, prompt preview coherent, reset to defaults.
 */

import { DEFAULT_AGENTS, THE_CHAIR, getAgent } from '../agents';
import { getAll, getSetting, put, resetAgentsToDefault, seedAgentsIfEmpty } from '../db';

let selectedAgent = null;
// Tracks the document-level Escape handler so it can be removed before re-binding
// on each render (render() runs repeatedly; without this, handlers accumulate).
let escapeKeyHandler = null;

export async function render(container, params = {}) {
  // Update Topbar action slot
  const actionSlot = document.getElementById('topbar-action-slot');
  if (actionSlot) {
    actionSlot.innerHTML = `
      <button id="reset-roster-btn" class="btn btn-ghost text-xs py-1.5 px-3 border border-subtle hover:border-danger hover:text-danger transition-colors">
        <svg class="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        Reset Roster to Defaults
      </button>
    `;
  }

  // Ensure default agents seeded in IndexedDB
  await seedAgentsIfEmpty(DEFAULT_AGENTS);

  // Load roster strictly from IndexedDB
  const storedAgents = await getAll('agents');
  // Sort by order or fallback to DEFAULT_AGENTS order
  const agents = (storedAgents && storedAgents.length > 0)
    ? storedAgents.sort((a, b) => (a.order || 0) - (b.order || 0))
    : DEFAULT_AGENTS;

  const activeCount = agents.filter(a => a.enabled).length;

  container.innerHTML = `
    <div class="space-y-6 animate-fadeIn">
      <!-- Roster Header -->
      <div class="panel p-6 border-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div class="inline-flex items-center gap-2 chip text-xs bg-brass/10 text-brass-light border-brass/30 mb-2">
            <span class="w-1.5 h-1.5 rounded-full bg-brass-light"></span>
            Executive Board of Directors
          </div>
          <h1 class="font-serif text-3xl sm:text-4xl text-slate-100">
            Board Members Roster
          </h1>
          <p class="text-xs sm:text-sm text-muted mt-1 max-w-2xl leading-relaxed">
            Click any director to inspect their analytical voice, background, and exact live system prompt. Toggle active status to customize the deliberation quorum.
          </p>
        </div>
        <div class="flex items-center gap-3 shrink-0">
          <div class="chip text-xs py-1 px-3 border-subtle bg-base">
            <span class="text-slate-100 font-semibold font-mono" id="active-agents-badge">${activeCount}</span>
            <span class="text-muted">/ ${agents.length} Active Directors</span>
          </div>
        </div>
      </div>

      <!-- Chair Spotlight Strip -->
      <div class="panel p-4 border-brass/40 bg-brass/5 flex items-center justify-between gap-4 flex-wrap cursor-pointer hover:border-brass transition-all group" id="chair-spotlight-card">
        <div class="flex items-center gap-3.5 min-w-0">
          <span class="avatar w-12 h-12 text-sm agent-brass-bg agent-brass font-mono font-bold border-2 border-brass/50 shadow-md">
            ${THE_CHAIR.initials}
          </span>
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <h2 class="font-serif text-lg text-slate-100 group-hover:text-brass-light transition-colors">
                ${THE_CHAIR.name}
              </h2>
              <span class="chip text-[10px] py-0 px-2 agent-brass-bg agent-brass uppercase font-mono font-bold">
                Orchestrator
              </span>
            </div>
            <p class="text-xs text-muted truncate">
              ${THE_CHAIR.role} · Convenes sessions, manages founder interjections, drafts deliverables.
            </p>
          </div>
        </div>
        <button class="btn btn-ghost text-xs py-1.5 px-3 border border-brass/30 text-brass-light group-hover:bg-brass/10">
          Inspect Chair Prompt
        </button>
      </div>

      <!-- Agent Cards Grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-5" id="agent-cards-grid">
        ${agents.map((agent) => {
          const colorClass = `agent-${agent.color || 'cyan'}`;
          const colorBgClass = `agent-${agent.color || 'cyan'}-bg`;

          return `
            <div class="panel p-5 border-subtle hover:border-border-strong hover:-translate-y-0.5 transition-all flex flex-col justify-between group cursor-pointer relative ${!agent.enabled ? 'opacity-60 grayscale-[40%]' : ''}" data-agent-id="${agent.id}">
              <div>
                <!-- Card Header -->
                <div class="flex items-start justify-between gap-3 mb-4">
                  <div class="flex items-center gap-3.5">
                    <span class="avatar w-14 h-14 text-base ${colorBgClass} ${colorClass} font-mono font-bold border-2 border-current shadow-md group-hover:scale-105 transition-transform">
                      ${agent.initials || agent.id.toUpperCase().slice(0, 2)}
                    </span>
                    <div>
                      <h3 class="font-serif text-xl text-slate-100 group-hover:text-slate-50 transition-colors flex items-center gap-2">
                        <span>${agent.name}</span>
                      </h3>
                      <div class="text-xs font-medium text-slate-300">
                        ${agent.role}
                      </div>
                      <div class="text-[11px] text-muted font-mono uppercase tracking-wider mt-0.5">
                        ${agent.shortRole}
                      </div>
                    </div>
                  </div>

                  <!-- Enabled / Disabled Toggle Switch -->
                  <div class="flex items-center gap-2" onclick="event.stopPropagation()">
                    <label class="relative inline-flex items-center cursor-pointer" title="${agent.enabled ? 'Disable Director' : 'Enable Director'}">
                      <input 
                        type="checkbox" 
                        class="sr-only peer agent-toggle-checkbox" 
                        data-agent-id="${agent.id}" 
                        ${agent.enabled ? 'checked' : ''} 
                      />
                      <div class="w-9 h-5 bg-base border border-subtle peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-muted peer-checked:after:bg-brass-light after:border-border-subtle after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brass/20 peer-checked:border-brass/40"></div>
                    </label>
                  </div>
                </div>

                <!-- One-line Bio -->
                <p class="text-xs text-slate-300 leading-relaxed mb-4 line-clamp-2">
                  ${agent.bio}
                </p>

                <!-- Expertise Chips -->
                <div class="flex flex-wrap gap-1.5 mb-4">
                  ${(agent.expertise || []).map(exp => `
                    <span class="chip text-[11px] py-0.5 px-2 bg-base border-subtle/80 text-slate-300">
                      ${exp}
                    </span>
                  `).join('')}
                </div>
              </div>

              <!-- Card Footer: Phases & Action -->
              <div class="pt-3 border-t border-subtle flex items-center justify-between text-xs">
                <div class="flex items-center gap-1.5 overflow-hidden">
                  <span class="text-[11px] text-muted mr-1">Phases:</span>
                  ${(agent.phases || []).map(p => `
                    <span class="chip text-[10px] py-0 px-1.5 bg-panel border-subtle uppercase font-mono">
                      ${p}
                    </span>
                  `).join('')}
                </div>

                <span class="text-xs text-brass-light group-hover:translate-x-0.5 transition-transform flex items-center gap-1 font-medium">
                  Inspect
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                  </svg>
                </span>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>

    <!-- Agent Detail Modal / Drawer Backdrop -->
    <div id="agent-modal-backdrop" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 hidden flex items-center justify-center p-4 transition-opacity">
      <div id="agent-modal-content" class="panel max-w-2xl w-full max-h-[90vh] overflow-y-auto border-subtle shadow-2xl animate-fadeIn p-6 sm:p-8 space-y-6" onclick="event.stopPropagation()">
        <!-- Modal body injected dynamically -->
      </div>
    </div>

    <!-- Reset Roster Confirmation Modal -->
    <div id="reset-roster-modal" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 hidden flex items-center justify-center p-4">
      <div class="panel max-w-md w-full border-danger/40 p-6 space-y-4" onclick="event.stopPropagation()">
        <div class="flex items-center gap-2 text-danger font-semibold text-sm">
          <svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          Reset Board Member Roster
        </div>
        <p class="text-xs text-muted leading-relaxed">
          Reset all board member personas and system instructions back to system defaults? Any disabled statuses will be restored.
        </p>
        <div class="flex justify-end gap-2 pt-2">
          <button id="cancel-reset-modal-btn" class="btn btn-ghost text-xs border border-subtle">Cancel</button>
          <button id="confirm-reset-modal-btn" class="btn btn-ghost border border-danger/40 text-danger hover:bg-danger/10 hover:border-danger text-xs">
            Confirm Reset
          </button>
        </div>
      </div>
    </div>
  `;

  // Attach Event Handlers
  wireEventListeners(container, agents);
}

/**
 * Wire click and toggle handlers
 */
function wireEventListeners(container, agents) {
  // Reset roster modal triggers
  const resetBtn = document.getElementById('reset-roster-btn');
  const resetModal = document.getElementById('reset-roster-modal');
  const cancelResetBtn = document.getElementById('cancel-reset-modal-btn');
  const confirmResetBtn = document.getElementById('confirm-reset-modal-btn');

  if (resetBtn && resetModal) {
    resetBtn.addEventListener('click', () => {
      resetModal.classList.remove('hidden');
    });

    cancelResetBtn?.addEventListener('click', () => {
      resetModal.classList.add('hidden');
    });

    // Close on backdrop click (inner panel stops propagation via onclick)
    resetModal.addEventListener('click', (e) => {
      if (e.target === resetModal) resetModal.classList.add('hidden');
    });

    confirmResetBtn?.addEventListener('click', async () => {
      resetModal.classList.add('hidden');
      await resetAgentsToDefault(DEFAULT_AGENTS);
      render(container);
    });
  }

  // Chair Spotlight Card click
  const chairCard = document.getElementById('chair-spotlight-card');
  if (chairCard) {
    chairCard.addEventListener('click', () => {
      openAgentDrawer(THE_CHAIR);
    });
  }

  // Agent Card clicks for inspection.
  // Scope to the card panel only: a bare [data-agent-id] selector would also match
  // the enable/disable <input> (which carries the same attribute) and open the drawer
  // every time a director is toggled.
  const cards = container.querySelectorAll('.panel[data-agent-id]');
  cards.forEach(card => {
    card.addEventListener('click', () => {
      const id = card.getAttribute('data-agent-id');
      const agent = agents.find(a => a.id === id);
      if (agent) {
        openAgentDrawer(agent);
      }
    });
  });

  // Enable/Disable Toggles
  const toggles = container.querySelectorAll('.agent-toggle-checkbox');
  toggles.forEach(toggle => {
    toggle.addEventListener('change', async (e) => {
      const id = toggle.getAttribute('data-agent-id');
      const agent = agents.find(a => a.id === id);
      if (agent) {
        agent.enabled = e.target.checked;
        await put('agents', agent);

        // Update card visual state
        const card = container.querySelector(`[data-agent-id="${id}"]`);
        if (card) {
          if (agent.enabled) {
            card.classList.remove('opacity-60', 'grayscale-[40%]');
          } else {
            card.classList.add('opacity-60', 'grayscale-[40%]');
          }
        }

        // Update badge count
        const activeCount = agents.filter(a => a.enabled).length;
        const countBadge = document.getElementById('active-agents-badge');
        if (countBadge) countBadge.textContent = activeCount;
      }
    });
  });

  // Modal backdrop close
  const backdrop = document.getElementById('agent-modal-backdrop');
  if (backdrop) {
    backdrop.addEventListener('click', closeAgentDrawer);
  }

  if (escapeKeyHandler) document.removeEventListener('keydown', escapeKeyHandler);
  escapeKeyHandler = (e) => {
    if (e.key !== 'Escape') return;
    // Reset modal sits above the drawer; close it first if open.
    if (resetModal && !resetModal.classList.contains('hidden')) {
      resetModal.classList.add('hidden');
    } else {
      closeAgentDrawer();
    }
  };
  document.addEventListener('keydown', escapeKeyHandler);
}

/**
 * Open Director Detail Drawer / Modal
 */
async function openAgentDrawer(agent) {
  const backdrop = document.getElementById('agent-modal-backdrop');
  const modal = document.getElementById('agent-modal-content');
  if (!backdrop || !modal) return;

  const colorClass = `agent-${agent.color || 'cyan'}`;
  const colorBgClass = `agent-${agent.color || 'cyan'}-bg`;

  // Query participation statistics from IndexedDB sessions
  const sessions = await getAll('sessions');
  const currentVentureId = (await getSetting('active_venture_id', 'default')) || 'default';
  const currentVentureName = (await getSetting('active_venture_name', 'Apex Robotics')) || 'Apex Robotics';

  let turnsCount = 0;
  for (const session of sessions) {
    if (!session.ventureId || session.ventureId === currentVentureId || session.ventureId === 'default') {
      const messages = session.messages || session.transcript || [];
      for (const msg of messages) {
        const matchId = msg.agentId === agent.id || msg.authorId === agent.id;
        const matchName = msg.author && msg.author.toLowerCase().includes(agent.name.toLowerCase());
        const matchRole = msg.role && msg.role.toLowerCase() === agent.shortRole.toLowerCase();
        const matchChair = agent.id === 'chair' && (msg.author === 'The Chair' || msg.agentId === 'chair');
        if (matchId || matchName || matchRole || matchChair) {
          turnsCount++;
        }
      }
    }
  }

  // Generate live sample system prompt
  const fullAgent = getAgent(agent.id) || agent;
  let samplePrompt = '';
  if (typeof fullAgent.systemPromptTemplate === 'function') {
    samplePrompt = fullAgent.systemPromptTemplate({
      venture: {
        name: currentVentureName,
        thesis: 'Autonomous micro-fulfillment robotic carts for decentralized grocery hubs',
        audience: 'Mid-sized regional supermarket chains',
        problem: 'Skyrocketing pick/pack labor costs for on-demand grocery delivery',
        solution: 'Self-navigating autonomous shelf-crawler carts delivering 4x pick density',
        notes: 'Pre-seed stage, 3 supermarket chains evaluating refundable pilot LOIs.'
      },
      phase: agent.phases && agent.phases[0] ? agent.phases[0] : 'ideation',
      transcript: [
        { author: 'The Chair', text: 'Welcome board. Today we evaluate the core thesis of Apex Robotics in Phase 1: Ideation.' },
        { author: 'Founder', text: 'We have 3 regional grocery chains expressing interest in our pilot carts.' }
      ],
      priorAgentReplies: ''
    });
  } else {
    samplePrompt = 'No prompt template defined.';
  }

  modal.innerHTML = `
    <!-- Modal Header -->
    <div class="flex items-start justify-between gap-4 pb-4 border-b border-subtle">
      <div class="flex items-center gap-3.5">
        <span class="avatar w-14 h-14 text-base ${colorBgClass} ${colorClass} font-mono font-bold border-2 border-current shadow-lg">
          ${agent.initials || agent.id.toUpperCase().slice(0, 2)}
        </span>
        <div>
          <h2 class="font-serif text-2xl text-slate-100">${agent.name}</h2>
          <div class="text-sm font-medium text-slate-300">${agent.role}</div>
          <div class="text-xs text-muted font-mono uppercase tracking-wider">${agent.shortRole}</div>
        </div>
      </div>
      <button id="close-modal-btn" class="p-2 text-muted hover:text-slate-100 rounded-lg hover:bg-white/5 transition-colors" aria-label="Close dialog">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>

    <!-- Summary Statistic Card: Board Participation & Deliberation Turns -->
    <div class="p-4 rounded-xl bg-base border border-subtle">
      <div class="flex items-center justify-between mb-3">
        <div class="flex items-center gap-2">
          <span class="w-2 h-2 rounded-full ${agent.enabled ? 'bg-success' : 'bg-muted'}"></span>
          <h4 class="text-xs font-semibold uppercase tracking-wider text-muted">
            Board Participation & Engagement
          </h4>
        </div>
        <span class="chip text-[10px] py-0.5 px-2 bg-panel font-mono border-subtle text-slate-300">
          Venture: ${escapeHtml(currentVentureName)}
        </span>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div class="p-3 rounded-lg bg-panel border border-subtle/80 flex flex-col justify-between">
          <div class="text-[10px] uppercase font-mono tracking-wider text-muted font-medium">Deliberation Turns</div>
          <div class="text-2xl font-mono font-bold text-brass-light mt-1">
            ${turnsCount}
          </div>
          <div class="text-[10px] text-faint mt-1">Contributed remarks</div>
        </div>

        <div class="p-3 rounded-lg bg-panel border border-subtle/80 flex flex-col justify-between">
          <div class="text-[10px] uppercase font-mono tracking-wider text-muted font-medium">Stage-Gate Quorum</div>
          <div class="text-2xl font-mono font-bold text-slate-100 mt-1">
            ${(agent.phases || []).length} <span class="text-xs font-normal text-muted">/ 4</span>
          </div>
          <div class="text-[10px] text-faint mt-1">Assigned milestones</div>
        </div>

        <div class="p-3 rounded-lg bg-panel border border-subtle/80 flex flex-col justify-between col-span-2 sm:col-span-1">
          <div class="text-[10px] uppercase font-mono tracking-wider text-muted font-medium">Participation Status</div>
          <div class="text-xs font-semibold text-slate-200 mt-2 flex items-center gap-1.5 truncate">
            <span class="w-1.5 h-1.5 rounded-full ${turnsCount > 0 ? 'bg-brass' : 'bg-muted'}"></span>
            ${turnsCount > 0 ? `${turnsCount} Recorded Turns` : 'Awaiting First Call'}
          </div>
          <div class="text-[10px] text-faint mt-1">Active session transcript</div>
        </div>
      </div>
    </div>

    <!-- Biography & Persona Tone -->
    <div class="space-y-4">
      <div>
        <h4 class="text-xs font-semibold uppercase tracking-wider text-muted mb-1.5">Executive Mandate & Bio</h4>
        <p class="text-sm text-slate-200 leading-relaxed">${agent.bio}</p>
      </div>

      <div>
        <h4 class="text-xs font-semibold uppercase tracking-wider text-muted mb-1.5">Persona Tone & Analytical Stance</h4>
        <div class="p-3 rounded-lg bg-base border border-subtle text-xs text-slate-300">
          ${agent.tone || 'Direct, structured, executive.'}
        </div>
      </div>

      <!-- Core Expertise Areas -->
      <div>
        <h4 class="text-xs font-semibold uppercase tracking-wider text-muted mb-1.5">Key Disciplines</h4>
        <div class="flex flex-wrap gap-2">
          ${(agent.expertise || []).map(exp => `
            <span class="chip text-xs py-1 px-2.5 bg-base border-subtle text-slate-200">
              ${exp}
            </span>
          `).join('')}
        </div>
      </div>

      <!-- Stage-Gate Assignments -->
      <div>
        <h4 class="text-xs font-semibold uppercase tracking-wider text-muted mb-1.5">Active Stage-Gate Phases</h4>
        <div class="flex gap-2">
          ${(agent.phases || []).map(p => `
            <span class="chip text-xs py-0.5 px-2.5 bg-panel border-subtle uppercase font-mono text-slate-300">
              Phase: ${p}
            </span>
          `).join('')}
        </div>
      </div>

      <!-- Live Generated System Prompt (Read-only collapsible) -->
      <div class="pt-2">
        <details class="group rounded-lg border border-subtle bg-base overflow-hidden" open>
          <summary class="p-3 text-xs font-semibold uppercase tracking-wider text-slate-300 cursor-pointer flex items-center justify-between hover:bg-white/5 transition-colors">
            <span class="flex items-center gap-2">
              <svg class="w-4 h-4 text-brass" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
              Exact Live System Prompt (Sample Venture Preview)
            </span>
            <span class="text-[10px] text-muted font-mono group-open:rotate-180 transition-transform">▼</span>
          </summary>
          <div class="p-4 border-t border-subtle bg-[#080B0F]">
            <pre class="font-mono text-xs text-slate-300 whitespace-pre-wrap leading-relaxed max-h-72 overflow-y-auto select-all selection:bg-brass/30">${escapeHtml(samplePrompt)}</pre>
          </div>
        </details>
      </div>
    </div>

    <!-- Modal Footer -->
    <div class="pt-4 border-t border-subtle flex items-center justify-end">
      <button id="close-modal-footer-btn" class="btn btn-ghost border border-subtle text-xs px-4">
        Done
      </button>
    </div>
  `;

  backdrop.classList.remove('hidden');
  document.body.classList.add('overflow-hidden');

  const closeBtn = document.getElementById('close-modal-btn');
  const footerBtn = document.getElementById('close-modal-footer-btn');
  if (closeBtn) closeBtn.addEventListener('click', closeAgentDrawer);
  if (footerBtn) footerBtn.addEventListener('click', closeAgentDrawer);
}

function closeAgentDrawer() {
  const backdrop = document.getElementById('agent-modal-backdrop');
  if (backdrop) {
    backdrop.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
  }
}

function escapeHtml(str) {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
