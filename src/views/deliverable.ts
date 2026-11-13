import { exportDeliverableToMarkdown } from "../export";
import type { Deliverable, LegacyDeliverable } from "../types/deliverables";
import { renderCanvas } from "./deliverable-canvas";
import { renderMarketing } from "./deliverable-marketing";
import { renderSwot } from "./deliverable-swot";

function renderLegacy(root: HTMLElement, d: LegacyDeliverable): void {
  root.innerHTML = `
    <div class="legacy-deliverable-workspace space-y-6">
      <div class="panel p-6 border-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div class="flex items-center gap-2 mb-1">
            <span class="chip text-xs bg-brass/10 border-brass/30 text-brass-light font-mono font-semibold uppercase">
              Phase: ${d.phase}
            </span>
            <span class="chip text-xs bg-base border-subtle text-muted font-mono">
              Legacy Memo v${d.version}
            </span>
          </div>
          <h1 class="font-serif text-3xl text-slate-100">${d.title}</h1>
          <p class="text-xs text-muted">Read-only legacy executive deliverable archive.</p>
        </div>
        <button id="copy-legacy-md-btn" class="btn btn-ghost text-xs py-1.5 px-3 border border-subtle text-slate-300 hover:text-white">
          Copy Markdown
        </button>
      </div>

      <div class="space-y-4">
        ${d.sections
          .map(
            (sec) => `
          <div class="panel p-5 border-subtle bg-base space-y-2">
            <h3 class="font-serif text-lg text-slate-200 border-b border-subtle pb-1">${sec.heading}</h3>
            <div class="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">${sec.body}</div>
          </div>
        `,
          )
          .join("")}
      </div>
    </div>
  `;

  root.querySelector("#copy-legacy-md-btn")?.addEventListener("click", async () => {
    const md = exportDeliverableToMarkdown(d);
    await navigator.clipboard.writeText(md);
    const btn = root.querySelector("#copy-legacy-md-btn");
    if (btn) {
      btn.textContent = "Copied!";
      setTimeout(() => {
        btn.textContent = "Copy Markdown";
      }, 1800);
    }
  });
}

/**
 * Main deliverable workspace router.
 * Routes on the discriminated union `d.framework`.
 * Enforces exhaustive compile-time checking so adding a 5th FrameworkId causes a compilation error.
 */
export function renderDeliverable(root: HTMLElement, d: Deliverable): void {
  switch (d.framework) {
    case "swot":
      return renderSwot(root, d);
    case "lean-canvas":
    case "business-blueprint":
      return renderCanvas(root, d);
    case "marketing-plan":
      return renderMarketing(root, d);
    case "legacy-plan":
      return renderLegacy(root, d);
    default: {
      const _never: never = d;
      throw new Error(`Unhandled framework: ${(d as Deliverable).framework}`);
    }
  }
}
