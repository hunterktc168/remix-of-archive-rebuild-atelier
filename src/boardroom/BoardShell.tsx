import { memo, useEffect, useRef } from "react";
import { Outlet, useLocation, useRouter } from "@tanstack/react-router";

import { consumeSilentNavigation, setNavigator } from "./nav";

type LegacyApp = typeof import("./legacy/app");

/**
 * Persistent Boardroom chrome (sidebar, top bar, right rail). The ported view modules
 * render into #view-root and update the chrome by element id, so this markup must stay
 * static: React renders it once and never re-renders it.
 */
const ShellChrome = memo(function ShellChrome() {
  return (
    <>
      <a href="#view-root" className="skip-link">
        Skip to main content
      </a>

      <div
        id="mobile-backdrop"
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 hidden md:hidden transition-opacity"
        aria-hidden="true"
      />

      <div className="flex-1 flex w-full min-h-screen">
        <aside
          id="sidebar"
          className="fixed inset-y-0 left-0 z-50 w-64 bg-panel border-r border-subtle flex flex-col transition-transform duration-200 ease-in-out -translate-x-full md:translate-x-0 md:static md:z-auto shrink-0"
        >
          <div className="h-16 px-5 border-b border-subtle flex items-center justify-between shrink-0">
            <a href="/" className="group flex items-center gap-2.5 no-underline">
              <span className="w-8 h-8 rounded-lg bg-brass/10 border border-brass/30 flex items-center justify-center text-brass-light font-serif text-xl group-hover:border-brass transition-colors">
                B
              </span>
              <div className="flex flex-col">
                <span className="font-serif text-2xl tracking-wider text-slate-100 leading-none group-hover:text-brass-light transition-colors">
                  BOARDROOM
                </span>
                <span className="text-[10px] tracking-widest text-muted uppercase font-sans mt-0.5">
                  Executive Advisory
                </span>
              </div>
            </a>
            <button
              id="close-sidebar-btn"
              className="md:hidden p-1.5 text-muted hover:text-slate-100 rounded-lg hover:bg-white/5"
              aria-label="Close navigation drawer"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="p-3 border-b border-subtle">
            <div className="text-[11px] font-semibold text-muted uppercase tracking-wider px-2 mb-1.5">
              Active Venture
            </div>
            <div className="relative">
              <button
                id="venture-switcher-btn"
                className="w-full flex items-center justify-between p-2 rounded-lg bg-base border border-subtle hover:border-border-strong text-left transition-colors"
                aria-expanded="false"
                aria-haspopup="true"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-6 h-6 rounded bg-brass/15 text-brass-light font-semibold text-xs flex items-center justify-center shrink-0">
                    V
                  </span>
                  <span id="sidebar-venture-name" className="text-sm font-medium text-slate-200 truncate">
                    Apex Robotics
                  </span>
                </div>
                <svg className="w-4 h-4 text-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4 4 4-4" />
                </svg>
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
            <div>
              <div className="text-[11px] font-semibold text-muted uppercase tracking-wider px-2 mb-2">Workspace</div>
              <nav className="space-y-1">
                <a
                  href="/"
                  className="sidebar-nav-link flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-slate-300 hover:text-slate-100 hover:bg-white/5 transition-colors"
                  data-route="dashboard"
                >
                  <svg className="w-4 h-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                    />
                  </svg>
                  <span>Dashboard</span>
                </a>
                <a
                  href="/agents"
                  className="sidebar-nav-link flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-slate-300 hover:text-slate-100 hover:bg-white/5 transition-colors"
                  data-route="agents"
                >
                  <svg className="w-4 h-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                    />
                  </svg>
                  <span>Board Members</span>
                  <span className="ml-auto chip text-[10px] py-0 px-1.5 bg-subtle">6+1</span>
                </a>
              </nav>
            </div>

            <div>
              <div className="text-[11px] font-semibold text-muted uppercase tracking-wider px-2 mb-2 flex items-center justify-between">
                <span>Stage-Gate Sequence</span>
                <span className="text-[10px] text-brass-light font-mono">4 PHASES</span>
              </div>
              <nav className="space-y-1" id="phase-stepper">
                {PHASE_LINKS.map((p, i) => (
                  <a
                    key={p.id}
                    href={`/venture/default/phase/${p.id}`}
                    className="phase-step-link flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:text-slate-100 hover:bg-white/5 transition-all group"
                    data-phase={p.id}
                  >
                    <span className="step-num w-5 h-5 rounded-full border border-subtle group-hover:border-slate-400 text-xs font-mono flex items-center justify-center text-muted group-hover:text-slate-200 transition-colors">
                      {i + 1}
                    </span>
                    <div className="flex flex-col">
                      <span className="leading-tight">{p.label}</span>
                      <span className="text-[11px] text-muted group-hover:text-slate-400">{p.hint}</span>
                    </div>
                  </a>
                ))}
              </nav>
            </div>
          </div>

          <div className="p-3 border-t border-subtle shrink-0">
            <a
              href="/settings"
              className="sidebar-nav-link flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-slate-300 hover:text-slate-100 hover:bg-white/5 transition-colors"
              data-route="settings"
            >
              <svg className="w-4 h-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span>Settings &amp; Keys</span>
            </a>
          </div>
        </aside>

        <div className="flex-1 flex flex-col min-w-0 min-h-screen">
          <header className="h-16 border-b border-subtle bg-panel/70 backdrop-blur-md sticky top-0 z-30 px-4 sm:px-6 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <button
                id="mobile-menu-btn"
                className="md:hidden p-2 text-muted hover:text-slate-100 rounded-lg hover:bg-white/5"
                aria-label="Open navigation drawer"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <div className="flex items-center gap-2.5 truncate">
                <span id="topbar-venture" className="font-serif text-lg sm:text-xl text-slate-100 font-medium truncate">
                  Apex Robotics
                </span>
                <span className="text-muted/60 text-sm">/</span>
                <span id="topbar-phase-badge" className="chip border-brass/40 text-brass-light bg-brass/10 text-xs py-0.5">
                  Dashboard
                </span>
              </div>
            </div>
            <div id="topbar-action-slot" className="flex items-center gap-2 shrink-0" />
          </header>

          <div className="flex-1 flex min-w-0">
            <div className="flex-1 min-w-0 flex flex-col">
              <Outlet />
              <main
                id="view-root"
                className="flex-1 p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto w-full min-w-0 focus:outline-none"
                tabIndex={-1}
              />
            </div>

            <aside id="right-rail" className="hidden xl:block w-72 shrink-0 border-l border-subtle p-6 bg-panel/30">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">Board at the Table</h2>
                <span id="right-rail-count" className="chip text-[10px] py-0 px-1.5 bg-subtle">
                  6 Active
                </span>
              </div>
              <p className="text-xs text-muted mb-4 leading-relaxed">
                Directors assigned to deliberate on the current milestone:
              </p>
              <div id="right-rail-agents-list" className="space-y-2.5" />
            </aside>
          </div>
        </div>
      </div>
    </>
  );
});

const PHASE_LINKS = [
  { id: "ideation", label: "Ideation", hint: "Gaps & Blue Ocean" },
  { id: "validation", label: "Validation", hint: "Hypotheses & Tests" },
  { id: "business-plan", label: "Business Plan", hint: "Model & Economics" },
  { id: "marketing", label: "Marketing Strategy", hint: "GTM & Channels" },
];

/** Loads the browser-only view modules after hydration and re-renders on every navigation. */
function RouteSync() {
  const router = useRouter();
  const location = useLocation();
  const appRef = useRef<Promise<LegacyApp> | null>(null);

  useEffect(() => {
    setNavigator((href, opts) => {
      void router.navigate({ href, replace: opts?.replace ?? false });
    });
    return () => setNavigator(null);
  }, [router]);

  useEffect(() => {
    if (!appRef.current) {
      appRef.current = import("./legacy/app").then(async (app) => {
        await app.initShell();
        return app;
      });
    }
    const href = location.href;
    const pathname = location.pathname;
    const search = location.searchStr;
    void appRef.current.then((app) => {
      if (consumeSilentNavigation(href)) {
        app.noteLocation(pathname, search);
        return;
      }
      return app.renderPath(pathname, search);
    });
  }, [location.href, location.pathname, location.searchStr]);

  return null;
}

export function BoardShell() {
  return (
    <>
      <RouteSync />
      <ShellChrome />
    </>
  );
}
