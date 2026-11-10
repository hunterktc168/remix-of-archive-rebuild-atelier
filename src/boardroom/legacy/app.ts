// @ts-nocheck
/* Ported from the original Boardroom js/app.js. The hash router was replaced by real
 * TanStack routes: BoardShell calls renderPath() whenever the router location changes. */

import { DEFAULT_AGENTS, PHASES, PHASE_AGENTS, THE_CHAIR } from './agents';
import { seedAgentsIfEmpty, getAll, get, getSetting } from './db';
import { escapeHtml } from './markdown';
import { navigateTo } from '../nav';
import * as DashboardView from './views/dashboard';
import * as VentureView from './views/venture';
import * as AgentsView from './views/agents';
import * as SettingsView from './views/settings';

// Application State
const state = {
  currentVenture: {
    id: 'default',
    name: 'Apex Robotics',
    thesis: 'Autonomous micro-fulfillment robotic carts for decentralized grocery hubs',
  },
  currentRoute: '',
  currentParams: {},
  currentPath: '/',
  currentSearch: '',
};

// Route Definitions (path-based; mirror the original hash routes)
const routes = [
  { pattern: /^\/(dashboard\/?)?$/, name: 'dashboard', render: DashboardView.render },
  {
    pattern: /^\/venture\/([^/]+)\/(boardroom|deliverables|notes)\/?$/,
    name: 'venture',
    paramKeys: ['ventureId', 'tab'],
    render: VentureView.render,
  },
  {
    pattern: /^\/venture\/([^/]+)\/phase\/([^/]+)\/?$/,
    name: 'phase',
    paramKeys: ['ventureId', 'phase'],
    render: (root, params) => VentureView.render(root, { ...params, tab: 'boardroom' }),
  },
  {
    pattern: /^\/venture\/([^/]+)\/?$/,
    name: 'venture',
    paramKeys: ['ventureId'],
    render: (root, params) => VentureView.render(root, { ...params, tab: 'boardroom', phase: 'ideation' }),
  },
  { pattern: /^\/agents\/?$/, name: 'agents', render: AgentsView.render },
  { pattern: /^\/settings\/?$/, name: 'settings', render: SettingsView.render },
];

function resolveRoute(pathname, search) {
  let matched = null;
  for (const route of routes) {
    const match = pathname.match(route.pattern);
    if (match) {
      const params = {};
      if (route.paramKeys) {
        route.paramKeys.forEach((key, index) => {
          params[key] = decodeURIComponent(match[index + 1]);
        });
      }
      matched = { route, params };
      break;
    }
  }
  if (!matched) return null;

  if (search) {
    const searchParams = new URLSearchParams(search);
    for (const [key, val] of searchParams.entries()) {
      // TanStack may JSON-quote string search values; strip surrounding quotes.
      matched.params[key] = val.replace(/^"(.*)"$/, '$1');
    }
  }
  return matched;
}

/** Record a URL change that should not re-render the view (silent replace). */
export function noteLocation(pathname, search = '') {
  state.currentPath = pathname;
  state.currentSearch = search;
}

let renderToken = 0;

/**
 * Render the view for a path into #view-root and sync the shell chrome.
 */
export async function renderPath(pathname, search = '') {
  const resolved = resolveRoute(pathname, search);
  const root = document.getElementById('view-root');
  const token = ++renderToken;

  if (!resolved) {
    if (root) root.innerHTML = '';
    return;
  }

  const { route, params } = resolved;
  state.currentRoute = route.name;
  state.currentParams = params;
  state.currentPath = pathname;
  state.currentSearch = search;

  if (params.ventureId) {
    const v = await get('ventures', params.ventureId);
    if (v) {
      state.currentVenture = { id: v.id, name: v.name, thesis: v.oneliner || v.thesis };
    }
  } else {
    const storedName = await getSetting('active_venture_name');
    const storedId = await getSetting('active_venture_id');
    if (storedName) state.currentVenture.name = storedName;
    if (storedId) state.currentVenture.id = storedId;
  }

  // A newer navigation started while we were reading IndexedDB.
  if (token !== renderToken) return;

  if (root && route.render) {
    try {
      await route.render(root, params);
      root.focus({ preventScroll: true });
    } catch (err) {
      console.error('View render error:', err);
      root.innerHTML = `
        <div class="panel p-6 border-danger/40 bg-danger/10 text-danger text-sm">
          <strong>Error rendering view:</strong> ${escapeHtml(err.message || 'Unknown error')}
        </div>
      `;
    }
  }

  updateTopBar(route.name, params);
  await updateSidebar(route.name, params);
  await updateRightRail(params.phase || 'ideation');
  closeMobileDrawer();
}

function updateTopBar(routeName, params) {
  const ventureEl = document.getElementById('topbar-venture');
  const phaseBadgeEl = document.getElementById('topbar-phase-badge');

  if (ventureEl) {
    ventureEl.textContent = state.currentVenture.name;
  }

  if (phaseBadgeEl) {
    const phaseKey = params.phase || (params.tab === 'boardroom' ? 'ideation' : null);
    if (phaseKey) {
      const p = PHASES.find(item => item.id === phaseKey);
      if (p) {
        phaseBadgeEl.textContent = `Phase 0${p.number}: ${p.label}`;
        phaseBadgeEl.className = 'chip border-brass/40 text-brass-light bg-brass/10 text-xs py-0.5';
      }
    } else if (routeName === 'venture') {
      const tabName = params.tab ? params.tab.toUpperCase() : 'WORKSPACE';
      phaseBadgeEl.textContent = tabName;
      phaseBadgeEl.className = 'chip border-brass/40 text-brass-light bg-brass/10 text-xs py-0.5';
    } else if (routeName === 'dashboard') {
      phaseBadgeEl.textContent = 'Dashboard';
      phaseBadgeEl.className = 'chip text-slate-300 bg-panel text-xs py-0.5 border-subtle';
    } else if (routeName === 'agents') {
      phaseBadgeEl.textContent = 'Board Roster';
      phaseBadgeEl.className = 'chip text-slate-300 bg-panel text-xs py-0.5 border-subtle';
    } else if (routeName === 'settings') {
      phaseBadgeEl.textContent = 'Settings';
      phaseBadgeEl.className = 'chip text-slate-300 bg-panel text-xs py-0.5 border-subtle';
    }
  }
}

/**
 * Sidebar active link & phase stepper: filled dot if messages exist, check if deliverable exists
 */
async function updateSidebar(routeName, params) {
  const sidebarVentureLabel = document.getElementById('sidebar-venture-name');
  if (sidebarVentureLabel) {
    sidebarVentureLabel.textContent = state.currentVenture.name;
  }

  const navLinks = document.querySelectorAll('.sidebar-nav-link');
  navLinks.forEach((link) => {
    const linkRoute = link.getAttribute('data-route');
    if (linkRoute === routeName && !params.ventureId) {
      link.classList.add('bg-white/10', 'text-slate-100', 'font-semibold');
      link.classList.remove('text-slate-300');
    } else {
      link.classList.remove('bg-white/10', 'text-slate-100', 'font-semibold');
      link.classList.add('text-slate-300');
    }
  });

  const activeVentureId = params.ventureId || state.currentVenture.id || 'default';
  let allSessions = [];
  let allDeliverables = [];
  try {
    allSessions = await getAll('sessions');
    allDeliverables = await getAll('deliverables');
  } catch (e) {
    // Graceful fallback
  }

  const phaseLinks = document.querySelectorAll('.phase-step-link');
  phaseLinks.forEach((link, idx) => {
    const phaseKey = link.getAttribute('data-phase');
    const stepNum = link.querySelector('.step-num');

    link.setAttribute('href', `/venture/${activeVentureId}/boardroom?phase=${phaseKey}`);

    const hasDeliverable = allDeliverables.some(d => d.ventureId === activeVentureId && d.phase === phaseKey);
    const hasMessages = allSessions.some(s => s.ventureId === activeVentureId && s.phase === phaseKey && (s.messages || s.transcript || []).length > 0);

    const isCurrentPhase = (routeName === 'phase' || routeName === 'venture') && (params.phase === phaseKey || (!params.phase && params.tab === 'boardroom' && idx === 0));

    if (isCurrentPhase) {
      link.classList.add('bg-brass/10', 'text-brass-light', 'font-semibold', 'border', 'border-brass/30');
      link.classList.remove('text-slate-300');
    } else {
      link.classList.remove('bg-brass/10', 'text-brass-light', 'font-semibold', 'border', 'border-brass/30');
      link.classList.add('text-slate-300');
    }

    if (stepNum) {
      if (hasDeliverable) {
        stepNum.className = 'step-num w-5 h-5 rounded-full bg-brass/20 text-brass-light border border-brass/50 text-[11px] font-bold flex items-center justify-center shrink-0';
        stepNum.textContent = '✓';
      } else if (hasMessages) {
        stepNum.className = 'step-num w-5 h-5 rounded-full bg-slate-300 text-ink text-[9px] font-bold flex items-center justify-center shrink-0';
        stepNum.textContent = '●';
      } else {
        stepNum.className = `step-num w-5 h-5 rounded-full border ${isCurrentPhase ? 'border-brass text-brass-light bg-brass/20' : 'border-subtle text-muted'} text-xs font-mono flex items-center justify-center shrink-0`;
        stepNum.textContent = `${idx + 1}`;
      }
    }
  });
}

async function updateRightRail(currentPhaseId) {
  const container = document.getElementById('right-rail-agents-list');
  const countBadge = document.getElementById('right-rail-count');
  if (!container) return;

  const stored = await getAll('agents');
  const roster = (stored && stored.length > 0) ? stored : DEFAULT_AGENTS;

  const allowedAgentIds = PHASE_AGENTS[currentPhaseId] || ['maya', 'sam', 'david'];
  const assignedAgents = [
    THE_CHAIR,
    ...roster.filter(a => a.enabled && allowedAgentIds.includes(a.id))
  ];

  if (countBadge) {
    countBadge.textContent = `${assignedAgents.length} Active`;
  }

  container.innerHTML = assignedAgents.map((agent) => {
    const colorClass = `agent-${agent.color || 'cyan'}`;
    const colorBgClass = `agent-${agent.color || 'cyan'}-bg`;

    return `
      <div class="p-3 rounded-lg bg-base border border-subtle hover:border-border-strong transition-all flex items-start gap-3">
        <span class="avatar w-8 h-8 text-xs ${colorBgClass} ${colorClass} border-base shadow-sm font-mono font-bold shrink-0">
          ${escapeHtml(agent.initials || agent.id.toUpperCase().slice(0, 2))}
        </span>
        <div class="min-w-0 flex-1">
          <div class="flex items-center justify-between">
            <div class="text-xs font-semibold text-slate-200 truncate">${escapeHtml(agent.name)}</div>
            <span class="chip text-[9px] py-0 px-1 uppercase font-mono text-muted">${escapeHtml(agent.shortRole)}</span>
          </div>
          <div class="text-[11px] text-muted truncate">${escapeHtml(agent.role)}</div>
        </div>
      </div>
    `;
  }).join('');
}

function openMobileDrawer() {
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('mobile-backdrop');
  if (sidebar && backdrop) {
    sidebar.classList.remove('-translate-x-full');
    backdrop.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
  }
}

function closeMobileDrawer() {
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('mobile-backdrop');
  if (sidebar && backdrop) {
    sidebar.classList.add('-translate-x-full');
    backdrop.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
  }
}

let initialized = false;

/**
 * One-time bootstrap: seed default agents, bind shell controls and in-app link handling.
 */
export async function initShell() {
  if (initialized) return;
  initialized = true;

  try {
    await seedAgentsIfEmpty(DEFAULT_AGENTS);
  } catch (err) {
    console.warn('Initial IndexedDB seed warning:', err);
  }

  document.getElementById('venture-switcher-btn')?.addEventListener('click', () => {
    navigateTo('/');
    closeMobileDrawer();
  });

  document.getElementById('mobile-menu-btn')?.addEventListener('click', openMobileDrawer);
  document.getElementById('close-sidebar-btn')?.addEventListener('click', closeMobileDrawer);
  document.getElementById('mobile-backdrop')?.addEventListener('click', closeMobileDrawer);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMobileDrawer();
  });

  // Route in-app anchors (rendered as HTML strings by the views) through the router.
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const anchor = e.target instanceof Element ? e.target.closest('a[href]') : null;
    if (!anchor) return;
    if (anchor.target && anchor.target !== '_self') return;
    if (anchor.hasAttribute('download')) return;
    const href = anchor.getAttribute('href');
    if (!href || !href.startsWith('/') || href.startsWith('//')) return;
    e.preventDefault();
    navigateTo(href);
  });

  // Cross-view state synchronization (sidebar stepper, right rail)
  window.addEventListener('boardroom:sync', async () => {
    const resolved = resolveRoute(state.currentPath, state.currentSearch);
    if (!resolved) return;
    await updateSidebar(resolved.route.name, resolved.params);
    await updateRightRail(resolved.params.phase || 'ideation');
  });
}
