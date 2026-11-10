// @ts-nocheck
/* Ported verbatim from the original Boardroom vanilla JS app; see src/boardroom/AGENTS.md. */
import { navigateTo, replaceUrlSilently } from '../../nav';
/**
 * Dashboard View Module
 * Route: #/dashboard
 *
 * Implements:
 * - Executive hero with "New Venture" CTA
 * - Search by name & sort by updatedAt/name
 * - Venture cards grid with industry/stage chips, 4-phase dot progress, relative time, message/deliverable counts
 * - Actions: Open, Rename, Duplicate, Delete (with confirm modal)
 * - Empty state with 4 cloneable templates (B2B SaaS, DTC Brand, Marketplace, Local Service)
 * - 2-step keyboard-navigable New Venture modal with 140-char live counter and Phase 1 board preview
 */

import { getAll, saveVenture, deleteVenture, duplicateVenture, getVentureStats, setSetting, put } from '../db';
import { PHASES, PHASE_AGENTS, DEFAULT_AGENTS, THE_CHAIR } from '../agents';

// Tracks the active document-level Escape listener so re-renders don't leak listeners.
let escapeKeyHandler = null;

// Pre-configured Starter Venture Templates
export const SAMPLE_TEMPLATES = [
  {
    name: 'PulseMetrics',
    oneliner: 'Automated telemetry and churn prediction for mid-market vertical SaaS platforms.',
    industry: 'Enterprise Software',
    stage: 'Prototype',
    biggestUnknown: 'Willingness of VP Customer Success to replace existing spreadsheets with automated health scores.',
    welcomeMessage: 'Welcome to Boardroom, founder. Maya Chen, David Okafor, and Sam Torres have convened for Phase 1: Ideation on PulseMetrics. Today we stress-test whether predictive churn scores create an authentic asymmetric wedge.'
  },
  {
    name: 'AuraBotanica',
    oneliner: 'Clinically formulated adaptogenic hydration sticks for endurance athletes and high-output founders.',
    industry: 'Consumer Goods',
    stage: 'Idea',
    biggestUnknown: 'Can organic retention overcome rising paid social CAC on Meta and TikTok?',
    welcomeMessage: 'Welcome to Boardroom. The directors are assembled for Phase 1: Ideation on AuraBotanica. We are examining customer habit formation, contribution margin floors, and organic wedge channels.'
  },
  {
    name: 'MachinistHub',
    oneliner: 'On-demand B2B matching marketplace connecting aerospace engineers with idle CNC milling capacity.',
    industry: 'Manufacturing',
    stage: 'Idea',
    biggestUnknown: 'Chicken-and-egg liquidity: will machine shops quote jobs without guaranteed contract minimums?',
    welcomeMessage: 'The board will come to order. We are reviewing the marketplace dynamics of MachinistHub in Phase 1: Ideation. We will analyze supply-side liquidity, take-rate elasticity, and cold-start wedge strategies.'
  },
  {
    name: 'FleetClean Pro',
    oneliner: 'Automated overnight mobile fleet detailing and maintenance for commercial delivery vans.',
    industry: 'Logistics',
    stage: 'Early Revenue',
    biggestUnknown: 'Unit labor economics: route density required to achieve positive nightly gross margin.',
    welcomeMessage: 'Welcome to Boardroom. Phase 1: Ideation is convened for FleetClean Pro. David Okafor and Sam Torres are reviewing route density assumptions and customer contract lock-in.'
  }
];

// Helper: Relative time formatter
function formatRelativeTime(timestamp) {
  if (!timestamp) return 'Recently';
  const diffSec = Math.floor((Date.now() - timestamp) / 1000);
  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`;
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export async function render(container, params = {}) {
  // Update Topbar action slot
  const actionSlot = document.getElementById('topbar-action-slot');
  if (actionSlot) {
    actionSlot.innerHTML = `
      <button id="topbar-new-venture-btn" class="btn btn-primary text-xs py-1.5 px-3">
        <svg class="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
        </svg>
        New Venture
      </button>
    `;
  }

  // Load all ventures
  let ventures = await getAll('ventures');
  
  // Calculate stats for each venture
  const ventureStats = {};
  for (const v of ventures) {
    ventureStats[v.id] = await getVentureStats(v.id);
  }

  container.innerHTML = `
    <div class="space-y-8 animate-fadeIn max-w-5xl mx-auto">
      <!-- Executive Hero Panel -->
      <section class="panel p-6 sm:p-8 relative overflow-hidden border-subtle">
        <div class="absolute -right-8 -top-8 w-64 h-64 bg-brass/5 rounded-full blur-3xl pointer-events-none"></div>
        <div class="max-w-2xl relative z-10">
          <div class="inline-flex items-center gap-2 chip border-brass/30 bg-brass/10 text-brass-light text-xs mb-3">
            <span class="w-1.5 h-1.5 rounded-full bg-brass-light"></span>
            Autonomous Founder Advisory
          </div>
          <h1 class="font-serif text-3xl sm:text-4xl lg:text-5xl text-slate-100 tracking-tight leading-tight mb-2">
            BOARDROOM
          </h1>
          <p class="text-sm sm:text-base text-muted leading-relaxed mb-6">
            A local-first board of directors for startup founders. Stress-test your venture across 
            <strong class="text-slate-200">Ideation</strong>, <strong class="text-slate-200">Validation</strong>, 
            <strong class="text-slate-200">Business Plan</strong>, and <strong class="text-slate-200">Marketing Strategy</strong>.
          </p>
          <div class="flex flex-wrap items-center gap-3">
            <button id="hero-new-venture-btn" class="btn btn-primary">
              <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
              </svg>
              <span>Convene New Venture</span>
            </button>
            <a href="/agents" class="btn btn-ghost border border-subtle text-xs">
              Review Director Personas
            </a>
          </div>
        </div>
      </section>

      <!-- Search, Sort & Header Controls -->
      <section class="space-y-4">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 class="font-serif text-2xl text-slate-100">Your Ventures</h2>
            <p class="text-xs text-muted">Select an active portfolio company or clone a pre-seeded model</p>
          </div>

          <div class="flex items-center gap-2.5 flex-wrap">
            <!-- Search Input -->
            <div class="relative">
              <input 
                type="text" 
                id="venture-search-input" 
                class="input text-xs py-1.5 pl-8 pr-3 w-48 sm:w-56" 
                placeholder="Search ventures..." 
              />
              <svg class="w-3.5 h-3.5 text-muted absolute left-2.5 top-2.5 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>

            <!-- Sort Dropdown -->
            <select id="venture-sort-select" class="input text-xs py-1.5 px-2.5 w-36 bg-base">
              <option value="updated_desc">Recently Updated</option>
              <option value="name_asc">Name (A–Z)</option>
              <option value="created_desc">Newest First</option>
            </select>
          </div>
        </div>

        <!-- Venture Cards Container -->
        <div id="ventures-grid-container">
          <!-- Rendered dynamically -->
        </div>
      </section>
    </div>

    <!-- 2-Step New Venture Modal -->
    <div id="new-venture-modal-backdrop" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 hidden flex items-center justify-center p-4 transition-opacity" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div id="new-venture-modal-content" class="panel max-w-xl w-full border-subtle shadow-2xl animate-fadeIn p-6 sm:p-7 space-y-6" onclick="event.stopPropagation()">
        <!-- Modal content rendered dynamically -->
      </div>
    </div>

    <!-- Rename Venture Modal -->
    <div id="rename-modal-backdrop" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 hidden flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div class="panel max-w-md w-full border-subtle p-6 space-y-4" onclick="event.stopPropagation()">
        <h3 class="font-serif text-xl text-slate-100">Rename Venture</h3>
        <input type="text" id="rename-input" class="input text-sm" placeholder="Venture name" />
        <div class="flex justify-end gap-2 pt-2">
          <button id="cancel-rename-btn" class="btn btn-ghost text-xs border border-subtle">Cancel</button>
          <button id="confirm-rename-btn" class="btn btn-primary text-xs">Save Name</button>
        </div>
      </div>
    </div>

    <!-- Delete Confirmation Modal -->
    <div id="delete-modal-backdrop" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 hidden flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div class="panel max-w-md w-full border-danger/40 p-6 space-y-4" onclick="event.stopPropagation()">
        <div class="flex items-center gap-2.5 text-danger font-semibold text-sm">
          <svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          Permanently Delete Venture
        </div>
        <p class="text-xs text-muted leading-relaxed" id="delete-modal-msg">
          Are you sure you want to delete this venture? All recorded session transcripts and deliverables will be permanently removed.
        </p>
        <div class="flex justify-end gap-2 pt-2">
          <button id="cancel-delete-btn" class="btn btn-ghost text-xs border border-subtle">Cancel</button>
          <button id="confirm-delete-btn" class="btn btn-ghost border border-danger/40 text-danger hover:bg-danger/10 hover:border-danger text-xs">
            Confirm Delete
          </button>
        </div>
      </div>
    </div>
  `;

  // Filter & Render logic
  function renderGrid() {
    const gridContainer = document.getElementById('ventures-grid-container');
    if (!gridContainer) return;

    const searchTerm = (document.getElementById('venture-search-input')?.value || '').toLowerCase().trim();
    const sortVal = document.getElementById('venture-sort-select')?.value || 'updated_desc';

    // Filter
    let filtered = ventures.filter(v => 
      v.name.toLowerCase().includes(searchTerm) || 
      (v.oneliner && v.oneliner.toLowerCase().includes(searchTerm)) ||
      (v.industry && v.industry.toLowerCase().includes(searchTerm))
    );

    // Sort
    if (sortVal === 'name_asc') {
      filtered.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortVal === 'created_desc') {
      filtered.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    } else {
      // updated_desc
      filtered.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    }

    // Empty state
    if (filtered.length === 0) {
      if (ventures.length === 0) {
        // Zero ventures overall: Show starter templates
        gridContainer.innerHTML = renderEmptyStateWithTemplates();
        wireTemplateCloners();
      } else {
        // Search returned zero results
        gridContainer.innerHTML = `
          <div class="panel p-8 text-center border-subtle space-y-3">
            <div class="w-10 h-10 rounded-full bg-base border border-subtle text-muted flex items-center justify-center mx-auto">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <h3 class="font-serif text-lg text-slate-200">No matching ventures found</h3>
            <p class="text-xs text-muted max-w-sm mx-auto">
              No portfolio company matches "${searchTerm}". Try a different search query or clear the filter.
            </p>
          </div>
        `;
      }
      return;
    }

    // Render Cards Grid
    gridContainer.innerHTML = `
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        ${filtered.map(v => renderVentureCard(v, ventureStats[v.id] || { messageCount: 0, deliverableCount: 0 })).join('')}
      </div>
    `;

    wireCardActions();
  }

  // Initial render of cards
  renderGrid();

  // Search & Sort event listeners
  document.getElementById('venture-search-input')?.addEventListener('input', renderGrid);
  document.getElementById('venture-sort-select')?.addEventListener('change', renderGrid);

  // Wire Modal triggers
  document.getElementById('hero-new-venture-btn')?.addEventListener('click', openNewVentureModal);
  document.getElementById('topbar-new-venture-btn')?.addEventListener('click', openNewVentureModal);

  // Wire template cloners in empty state
  function wireTemplateCloners() {
    const cloneBtns = container.querySelectorAll('.clone-template-btn');
    cloneBtns.forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const index = parseInt(btn.getAttribute('data-template-index'), 10);
        const template = SAMPLE_TEMPLATES[index];
        if (template) {
          await createVentureFromTemplate(template);
        }
      });
    });
  }

  // Wire Action buttons (Open, Rename, Duplicate, Delete)
  function wireCardActions() {
    // Open action
    container.querySelectorAll('.open-venture-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const v = ventures.find(item => item.id === id);
        if (v) {
          await setSetting('active_venture_id', v.id);
          await setSetting('active_venture_name', v.name);
          navigateTo(`/venture/${v.id}/boardroom`);
        }
      });
    });

    // Rename action
    container.querySelectorAll('.rename-venture-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        const v = ventures.find(item => item.id === id);
        if (v) openRenameModal(v);
      });
    });

    // Duplicate action
    container.querySelectorAll('.duplicate-venture-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        btn.disabled = true;
        try {
          const copy = await duplicateVenture(id);
          ventures = await getAll('ventures');
          ventureStats[copy.id] = await getVentureStats(copy.id);
          renderGrid();
        } catch (err) {
          console.error('Failed to duplicate venture:', err);
          btn.disabled = false;
          const card = btn.closest('.panel');
          if (card) {
            const errEl = document.createElement('div');
            errEl.className = 'text-[11px] text-danger font-mono mt-2 p-1.5 rounded bg-danger/10 border border-danger/30';
            errEl.textContent = `Duplication failed: ${err.message}`;
            card.appendChild(errEl);
            setTimeout(() => errEl.remove(), 4000);
          }
        }
      });
    });

    // Delete action
    container.querySelectorAll('.delete-venture-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        const v = ventures.find(item => item.id === id);
        if (v) openDeleteModal(v);
      });
    });
  }

  // Rename modal logic
  let renamingVenture = null;
  function openRenameModal(venture) {
    renamingVenture = venture;
    const modal = document.getElementById('rename-modal-backdrop');
    const input = document.getElementById('rename-input');
    if (modal && input) {
      input.value = venture.name;
      modal.classList.remove('hidden');
      input.focus();
    }
  }

  document.getElementById('cancel-rename-btn')?.addEventListener('click', () => {
    document.getElementById('rename-modal-backdrop')?.classList.add('hidden');
    renamingVenture = null;
  });

  document.getElementById('confirm-rename-btn')?.addEventListener('click', async () => {
    const input = document.getElementById('rename-input');
    const newName = input?.value.trim();
    if (newName && renamingVenture) {
      renamingVenture.name = newName;
      renamingVenture.updatedAt = Date.now();
      await saveVenture(renamingVenture);
      document.getElementById('rename-modal-backdrop')?.classList.add('hidden');
      ventures = await getAll('ventures');
      renderGrid();
    }
  });

  // Delete modal logic
  let deletingVenture = null;
  function openDeleteModal(venture) {
    deletingVenture = venture;
    const modal = document.getElementById('delete-modal-backdrop');
    const msg = document.getElementById('delete-modal-msg');
    if (modal && msg) {
      msg.textContent = `Are you sure you want to permanently delete "${venture.name}"? All recorded sessions, transcripts, and deliverables will be removed.`;
      modal.classList.remove('hidden');
    }
  }

  document.getElementById('cancel-delete-btn')?.addEventListener('click', () => {
    document.getElementById('delete-modal-backdrop')?.classList.add('hidden');
    deletingVenture = null;
  });

  document.getElementById('confirm-delete-btn')?.addEventListener('click', async () => {
    if (deletingVenture) {
      await deleteVenture(deletingVenture.id);
      document.getElementById('delete-modal-backdrop')?.classList.add('hidden');
      ventures = await getAll('ventures');
      renderGrid();
    }
  });

  // Backdrop-click close for all three modals (inner panel stops propagation via onclick)
  const newVentureBackdrop = document.getElementById('new-venture-modal-backdrop');
  const renameBackdrop = document.getElementById('rename-modal-backdrop');
  const deleteBackdrop = document.getElementById('delete-modal-backdrop');

  newVentureBackdrop?.addEventListener('click', (e) => {
    if (e.target === newVentureBackdrop) closeNewVentureModal();
  });
  renameBackdrop?.addEventListener('click', (e) => {
    if (e.target === renameBackdrop) {
      renameBackdrop.classList.add('hidden');
      renamingVenture = null;
    }
  });
  deleteBackdrop?.addEventListener('click', (e) => {
    if (e.target === deleteBackdrop) {
      deleteBackdrop.classList.add('hidden');
      deletingVenture = null;
    }
  });

  // Escape closes whichever dashboard modal is open (single shared listener, rebind-safe)
  if (escapeKeyHandler) document.removeEventListener('keydown', escapeKeyHandler);
  escapeKeyHandler = (e) => {
    if (e.key !== 'Escape') return;
    if (newVentureBackdrop && !newVentureBackdrop.classList.contains('hidden')) {
      closeNewVentureModal();
    } else if (renameBackdrop && !renameBackdrop.classList.contains('hidden')) {
      renameBackdrop.classList.add('hidden');
      renamingVenture = null;
    } else if (deleteBackdrop && !deleteBackdrop.classList.contains('hidden')) {
      deleteBackdrop.classList.add('hidden');
      deletingVenture = null;
    }
  };
  document.addEventListener('keydown', escapeKeyHandler);
}

/**
 * Render single Venture Card
 */
function renderVentureCard(venture, stats) {
  const completedPhases = venture.completedPhases || [];
  
  return `
    <div class="panel p-5 border-subtle hover:border-border-strong transition-all flex flex-col justify-between group">
      <div>
        <!-- Top bar: Chips & Time -->
        <div class="flex items-start justify-between gap-2 mb-2.5">
          <div class="flex items-center gap-1.5 flex-wrap">
            <span class="chip text-[11px] py-0 px-2 bg-base font-medium text-slate-300">
              ${escapeHtml(venture.industry || 'Tech')}
            </span>
            <span class="chip text-[11px] py-0 px-2 bg-brass/10 border-brass/30 text-brass-light font-medium">
              ${escapeHtml(venture.stage || 'Idea')}
            </span>
          </div>
          <span class="text-[11px] font-mono text-muted shrink-0">
            ${formatRelativeTime(venture.updatedAt)}
          </span>
        </div>

        <!-- Name & One-liner -->
        <h3 class="font-serif text-2xl text-slate-100 group-hover:text-brass-light transition-colors mb-1.5 truncate">
          ${escapeHtml(venture.name)}
        </h3>
        <p class="text-xs text-muted leading-relaxed line-clamp-2 mb-4">
          ${escapeHtml(venture.oneliner || 'No description provided.')}
        </p>

        <!-- 4-Phase Progress Dots -->
        <div class="p-2.5 rounded-lg bg-base border border-subtle mb-4">
          <div class="flex items-center justify-between mb-1.5 text-[10px] font-mono text-muted">
            <span>STAGE-GATE COMPLETION</span>
            <span class="text-brass-light">${completedPhases.length}/4</span>
          </div>
          <div class="grid grid-cols-4 gap-1.5">
            ${PHASES.map((p, idx) => {
              const isDone = completedPhases.includes(p.id);
              return `
                <div class="h-1.5 rounded-full transition-colors ${isDone ? 'bg-brass' : 'bg-subtle'}" title="Phase 0${idx+1}: ${p.label} (${isDone ? 'Completed' : 'Pending'})"></div>
              `;
            }).join('')}
          </div>
          <div class="flex justify-between text-[9px] font-mono text-faint mt-1">
            <span>01 IDE</span>
            <span>02 VAL</span>
            <span>03 BIZ</span>
            <span>04 GTM</span>
          </div>
        </div>
      </div>

      <!-- Footer: Metrics & Actions -->
      <div class="pt-3 border-t border-subtle flex items-center justify-between flex-wrap gap-2 text-xs">
        <!-- Message & Deliverable Counters -->
        <div class="flex items-center gap-3 text-muted">
          <span class="inline-flex items-center gap-1 font-mono text-[11px]" title="Deliberation remarks recorded">
            <svg class="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            ${stats.messageCount}
          </span>
          <span class="inline-flex items-center gap-1 font-mono text-[11px]" title="Synthesized deliverables">
            <svg class="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            ${stats.deliverableCount}
          </span>
        </div>

        <!-- Action Buttons -->
        <div class="flex items-center gap-1">
          <button class="open-venture-btn btn btn-primary text-xs py-1 px-3" data-id="${venture.id}">
            Open
          </button>
          <button class="rename-venture-btn p-1.5 text-muted hover:text-slate-100 hover:bg-white/5 rounded" title="Rename venture" data-id="${venture.id}">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>
          <button class="duplicate-venture-btn p-1.5 text-muted hover:text-slate-100 hover:bg-white/5 rounded" title="Duplicate venture" data-id="${venture.id}">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>
          <button class="delete-venture-btn p-1.5 text-muted hover:text-danger hover:bg-white/5 rounded" title="Delete venture" data-id="${venture.id}">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  `;
}

/**
 * Render Empty State with Sample Cloneable Templates
 */
function renderEmptyStateWithTemplates() {
  return `
    <div class="space-y-6">
      <div class="panel p-8 text-center border-subtle relative overflow-hidden">
        <div class="inline-flex items-center gap-2 chip text-xs bg-brass/10 text-brass-light border-brass/30 mb-2">
          <span>Portfolio Empty</span>
        </div>
        <h3 class="font-serif text-3xl text-slate-100 mb-2">
          No Ventures in the Boardroom Yet
        </h3>
        <p class="text-xs sm:text-sm text-muted max-w-md mx-auto leading-relaxed mb-6">
          Create your first venture from scratch or clone one of our four pre-configured startup models below to inspect the boardroom in action.
        </p>
        <button id="empty-state-new-btn" class="btn btn-primary" onclick="document.getElementById('hero-new-venture-btn').click()">
          <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          Create New Venture
        </button>
      </div>

      <!-- 4 Cloneable Starter Templates -->
      <div>
        <div class="flex items-center justify-between mb-3 px-1">
          <h4 class="text-xs font-semibold uppercase tracking-wider text-muted font-mono">
            Or Clone a Pre-Seeded Startup Model
          </h4>
          <span class="text-[11px] text-faint">Instant Setup</span>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          ${SAMPLE_TEMPLATES.map((tmpl, idx) => `
            <div class="panel p-5 border-subtle hover:border-brass/40 transition-all flex flex-col justify-between group">
              <div>
                <div class="flex items-center justify-between mb-2">
                  <span class="chip text-[10px] py-0 px-2 bg-base font-medium text-slate-300">
                    ${tmpl.industry}
                  </span>
                  <span class="chip text-[10px] py-0 px-2 bg-brass/10 text-brass-light border-brass/30 font-medium">
                    ${tmpl.stage}
                  </span>
                </div>
                <h5 class="font-serif text-xl text-slate-100 group-hover:text-brass-light transition-colors mb-1">
                  ${tmpl.name}
                </h5>
                <p class="text-xs text-muted leading-relaxed mb-3">
                  ${tmpl.oneliner}
                </p>
                <div class="p-2.5 rounded bg-base border border-subtle text-[11px] text-slate-300 mb-4">
                  <strong class="text-faint uppercase font-mono text-[9px] block mb-0.5">Core Question:</strong>
                  "${tmpl.biggestUnknown}"
                </div>
              </div>

              <div class="pt-3 border-t border-subtle flex items-center justify-between">
                <span class="text-[11px] text-muted">Seeds Phase 1 Ideation</span>
                <button class="clone-template-btn btn btn-ghost border border-subtle text-xs py-1 px-3 group-hover:border-brass/50 group-hover:text-brass-light" data-template-index="${idx}">
                  Clone & Convene →
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;
}

/**
 * Helper to clone and launch a sample template
 */
async function createVentureFromTemplate(template) {
  const venture = await saveVenture({
    name: template.name,
    oneliner: template.oneliner,
    thesis: template.oneliner,
    industry: template.industry,
    stage: template.stage,
    biggestUnknown: template.biggestUnknown,
    completedPhases: []
  });

  // Seed welcome session in Phase 1: Ideation
  const sessionId = `s_${venture.id}_ideation`;
  await put('sessions', {
    id: sessionId,
    ventureId: venture.id,
    phase: 'ideation',
    messages: [
      {
        id: `m_${Date.now()}`,
        author: 'The Chair',
        role: 'chair',
        text: template.welcomeMessage,
        timestamp: Date.now()
      }
    ],
    updatedAt: Date.now()
  });

  // Set active
  await setSetting('active_venture_id', venture.id);
  await setSetting('active_venture_name', venture.name);

  // Navigate to boardroom
  navigateTo(`/venture/${venture.id}/boardroom`);
}

/**
 * 2-Step New Venture Modal Logic
 */
let newVentureState = {
  step: 1,
  name: '',
  oneliner: '',
  industry: 'Enterprise Software',
  stage: 'Idea',
  biggestUnknown: ''
};

function openNewVentureModal() {
  newVentureState = {
    step: 1,
    name: '',
    oneliner: '',
    industry: 'Enterprise Software',
    stage: 'Idea',
    biggestUnknown: ''
  };

  const backdrop = document.getElementById('new-venture-modal-backdrop');
  if (backdrop) {
    backdrop.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
    renderModalStep();
  }
}

function closeNewVentureModal() {
  const backdrop = document.getElementById('new-venture-modal-backdrop');
  if (backdrop) {
    backdrop.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
  }
}

function renderModalStep() {
  const container = document.getElementById('new-venture-modal-content');
  if (!container) return;

  if (newVentureState.step === 1) {
    // Step 1: Venture Fundamentals
    container.innerHTML = `
      <div class="flex items-start justify-between pb-3 border-b border-subtle">
        <div>
          <div class="chip text-[10px] py-0 px-2 bg-brass/10 text-brass-light border-brass/30 mb-1 font-mono">
            STEP 1 OF 2 · FUNDAMENTALS
          </div>
          <h3 id="modal-title" class="font-serif text-2xl text-slate-100">
            Convene a New Venture
          </h3>
        </div>
        <button id="close-modal-x-btn" class="p-1.5 text-muted hover:text-slate-100 rounded-lg hover:bg-white/5" aria-label="Close modal">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <form id="new-venture-step1-form" class="space-y-4">
        <!-- Name -->
        <div>
          <label for="nv-name" class="block text-xs font-medium text-slate-300 mb-1">
            Venture Name <span class="text-brass-light">*</span>
          </label>
          <input 
            type="text" 
            id="nv-name" 
            class="input text-xs" 
            placeholder="e.g. Acme Robotics" 
            required 
            value="${escapeHtml(newVentureState.name)}" 
          />
        </div>

        <!-- One-liner with live 140-char counter -->
        <div>
          <div class="flex items-center justify-between mb-1">
            <label for="nv-oneliner" class="block text-xs font-medium text-slate-300">
              One-Line Core Thesis <span class="text-brass-light">*</span>
            </label>
            <span id="oneliner-counter" class="text-[11px] font-mono text-muted">
              ${newVentureState.oneliner.length}/140
            </span>
          </div>
          <input 
            type="text" 
            id="nv-oneliner" 
            class="input text-xs" 
            maxlength="140" 
            placeholder="Autonomous fulfillment carts for regional grocery hubs..." 
            required 
            value="${escapeHtml(newVentureState.oneliner)}" 
          />
        </div>

        <!-- Industry & Stage -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label for="nv-industry" class="block text-xs font-medium text-slate-300 mb-1">
              Industry Domain
            </label>
            <select id="nv-industry" class="input text-xs bg-base">
              <option ${newVentureState.industry === 'Enterprise Software' ? 'selected' : ''}>Enterprise Software</option>
              <option ${newVentureState.industry === 'FinTech' ? 'selected' : ''}>FinTech</option>
              <option ${newVentureState.industry === 'Healthcare' ? 'selected' : ''}>Healthcare</option>
              <option ${newVentureState.industry === 'E-Commerce' ? 'selected' : ''}>E-Commerce</option>
              <option ${newVentureState.industry === 'Consumer Goods' ? 'selected' : ''}>Consumer Goods</option>
              <option ${newVentureState.industry === 'Manufacturing' ? 'selected' : ''}>Manufacturing</option>
              <option ${newVentureState.industry === 'Logistics' ? 'selected' : ''}>Logistics</option>
              <option ${newVentureState.industry === 'AI / DevTools' ? 'selected' : ''}>AI / DevTools</option>
              <option ${newVentureState.industry === 'Other' ? 'selected' : ''}>Other</option>
            </select>
          </div>

          <div>
            <label for="nv-stage" class="block text-xs font-medium text-slate-300 mb-1">
              Venture Stage
            </label>
            <select id="nv-stage" class="input text-xs bg-base">
              <option ${newVentureState.stage === 'Idea' ? 'selected' : ''}>Idea</option>
              <option ${newVentureState.stage === 'Prototype' ? 'selected' : ''}>Prototype</option>
              <option ${newVentureState.stage === 'Early Revenue' ? 'selected' : ''}>Early Revenue</option>
              <option ${newVentureState.stage === 'Growth' ? 'selected' : ''}>Growth</option>
            </select>
          </div>
        </div>

        <!-- Founder's Biggest Unknown (Optional) -->
        <div>
          <label for="nv-unknown" class="block text-xs font-medium text-slate-300 mb-1">
            Founder's Biggest Unknown <span class="text-faint text-[10px]">(Optional)</span>
          </label>
          <textarea 
            id="nv-unknown" 
            rows="2" 
            class="input text-xs resize-none" 
            placeholder="What keeps you up at night regarding product-market fit or unit economics?"
          >${escapeHtml(newVentureState.biggestUnknown)}</textarea>
        </div>

        <!-- Footer Buttons -->
        <div class="pt-3 border-t border-subtle flex items-center justify-end gap-2">
          <button type="button" id="step1-cancel-btn" class="btn btn-ghost text-xs border border-subtle">
            Cancel
          </button>
          <button type="submit" class="btn btn-primary text-xs">
            Next: Board Preview →
          </button>
        </div>
      </form>
    `;

    // Live character counter
    const onelinerInput = document.getElementById('nv-oneliner');
    const onelinerCounter = document.getElementById('oneliner-counter');
    if (onelinerInput && onelinerCounter) {
      onelinerInput.addEventListener('input', (e) => {
        const len = e.target.value.length;
        onelinerCounter.textContent = `${len}/140`;
        if (len >= 135) {
          onelinerCounter.classList.add('text-brass-light');
        } else {
          onelinerCounter.classList.remove('text-brass-light');
        }
      });
    }

    // Close button
    document.getElementById('close-modal-x-btn')?.addEventListener('click', closeNewVentureModal);
    document.getElementById('step1-cancel-btn')?.addEventListener('click', closeNewVentureModal);

    // Form submit -> Step 2
    document.getElementById('new-venture-step1-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      newVentureState.name = document.getElementById('nv-name')?.value.trim();
      newVentureState.oneliner = document.getElementById('nv-oneliner')?.value.trim();
      newVentureState.industry = document.getElementById('nv-industry')?.value;
      newVentureState.stage = document.getElementById('nv-stage')?.value;
      newVentureState.biggestUnknown = document.getElementById('nv-unknown')?.value.trim();

      newVentureState.step = 2;
      renderModalStep();
    });

  } else {
    // Step 2: Board Preview for Ideation
    const ideationAgentIds = PHASE_AGENTS['ideation'] || ['maya', 'sam', 'david'];
    const assignedAgents = [THE_CHAIR, ...DEFAULT_AGENTS.filter(a => ideationAgentIds.includes(a.id))];

    container.innerHTML = `
      <div class="flex items-start justify-between pb-3 border-b border-subtle">
        <div>
          <div class="chip text-[10px] py-0 px-2 bg-brass/10 text-brass-light border-brass/30 mb-1 font-mono">
            STEP 2 OF 2 · BOARD PREVIEW
          </div>
          <h3 id="modal-title" class="font-serif text-2xl text-slate-100">
            Convene Phase 1: Ideation
          </h3>
        </div>
        <button id="close-modal-x-btn" class="p-1.5 text-muted hover:text-slate-100 rounded-lg hover:bg-white/5" aria-label="Close modal">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div class="space-y-4 text-xs">
        <!-- Venture Summary Review -->
        <div class="p-3.5 rounded-lg bg-base border border-subtle">
          <div class="flex items-center justify-between mb-1">
            <h4 class="font-serif text-base text-slate-100">${escapeHtml(newVentureState.name)}</h4>
            <span class="chip text-[10px] py-0 px-1.5 bg-panel">${newVentureState.industry} · ${newVentureState.stage}</span>
          </div>
          <p class="text-muted leading-relaxed">${escapeHtml(newVentureState.oneliner)}</p>
        </div>

        <!-- Seated Board Preview -->
        <div>
          <h4 class="text-xs font-semibold uppercase tracking-wider text-muted mb-2 font-mono">
            Your Board at the Table (Phase 1 Ideation Quorum):
          </h4>
          <div class="grid grid-cols-2 gap-2">
            ${assignedAgents.map(a => `
              <div class="p-2.5 rounded bg-base border border-subtle flex items-center gap-2.5">
                <span class="avatar w-8 h-8 text-xs agent-${a.color}-bg agent-${a.color} border-base font-mono font-bold shrink-0">
                  ${a.initials}
                </span>
                <div class="min-w-0">
                  <div class="font-semibold text-slate-200 truncate">${a.name}</div>
                  <div class="text-[10px] text-muted truncate">${a.role}</div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Phase 1 Note -->
        <div class="p-3 rounded-lg border border-brass/30 bg-brass/5 text-slate-300 leading-relaxed text-[11px]">
          <strong class="text-brass-light">What happens in Phase 1:</strong> The Chair will convene the board to challenge your core thesis. Maya Chen will surface non-obvious adjacent angles, David Okafor will stress-test your evidence standards, and Sam Torres will scrutinize customer workflow friction before compiling your official <em>Opportunity Brief</em>.
        </div>

        <!-- Footer Buttons -->
        <div class="pt-3 border-t border-subtle flex items-center justify-between">
          <button type="button" id="step2-back-btn" class="btn btn-ghost text-xs border border-subtle">
            ← Back to Details
          </button>
          <button type="button" id="launch-venture-btn" class="btn btn-primary text-xs py-2 px-4">
            Convene Boardroom & Launch →
          </button>
        </div>
      </div>
    `;

    document.getElementById('close-modal-x-btn')?.addEventListener('click', closeNewVentureModal);

    document.getElementById('step2-back-btn')?.addEventListener('click', () => {
      newVentureState.step = 1;
      renderModalStep();
    });

    document.getElementById('launch-venture-btn')?.addEventListener('click', async () => {
      const launchBtn = document.getElementById('launch-venture-btn');
      if (launchBtn) launchBtn.disabled = true;

      // 1. Save venture to IndexedDB
      const venture = await saveVenture({
        name: newVentureState.name,
        oneliner: newVentureState.oneliner,
        thesis: newVentureState.oneliner,
        industry: newVentureState.industry,
        stage: newVentureState.stage,
        biggestUnknown: newVentureState.biggestUnknown,
        completedPhases: []
      });

      // 2. Create initial system message in ideation welcoming the founder
      const welcomeText = `The Board will come to order. Welcome, founder. We are convening Phase 1: Ideation for **${venture.name}** ("${venture.oneliner}"). 
      
Maya Chen, David Okafor, and Sam Torres are seated at the table. Our objective today is to explore contrarian wedge opportunities, examine customer jobs-to-be-done, and establish our foundational hypothesis testing roadmap.`;

      const sessionId = `s_${venture.id}_ideation`;
      await put('sessions', {
        id: sessionId,
        ventureId: venture.id,
        phase: 'ideation',
        messages: [
          {
            id: `m_${Date.now()}`,
            author: 'The Chair',
            role: 'chair',
            text: welcomeText,
            timestamp: Date.now()
          }
        ],
        updatedAt: Date.now()
      });

      // 3. Set as active venture
      await setSetting('active_venture_id', venture.id);
      await setSetting('active_venture_name', venture.name);

      closeNewVentureModal();

      // 4. Navigate to boardroom
      navigateTo(`/venture/${venture.id}/boardroom`);
    });
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
