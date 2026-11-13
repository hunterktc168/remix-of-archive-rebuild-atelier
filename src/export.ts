import { getDeliverablesForVenture, getVenture } from "./db";
import { budgetPct, formatBudget, ltvCacRatio } from "./lib/marketing-compute";
import type {
  BlueprintDeliverable,
  Deliverable,
  LegacyDeliverable,
  LeanCanvasDeliverable,
  MarketingDeliverable,
  SwotDeliverable,
} from "./types/deliverables";
import { BLUEPRINT_BOXES, LEAN_CANVAS_BOXES, SWOT_QUADRANTS } from "./schemas";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ---- SWOT EXPORTS ----

export function exportSwotToMarkdown(d: SwotDeliverable): string {
  const q = d.frameworkData.quadrants;
  const imps = d.frameworkData.strategicImplications;

  let md = `# ${d.title}\n`;
  md += `Framework: ${d.framework}  \n`;
  md += `Version: ${d.version}  \n`;
  md += `Phase: ${d.phase}  \n`;
  md += `Updated: ${d.updatedAt}\n\n`;

  md += `## 2×2 Matrix\n\n`;
  for (const quad of SWOT_QUADRANTS) {
    const title = quad.charAt(0).toUpperCase() + quad.slice(1);
    md += `### ${title}\n`;
    const bullets = q[quad];
    if (bullets.length === 0) {
      md += `_(No entries recorded)_\n`;
    } else {
      for (const b of bullets) {
        const prov = b.sourceAgentId ? ` _— [${b.sourceAgentId.toUpperCase()}]_` : "";
        md += `- ${b.text}${prov}\n`;
      }
    }
    md += `\n`;
  }

  md += `## Strategic Implications\n\n`;
  if (imps.length === 0) {
    md += `_(No implications defined)_\n`;
  } else {
    for (const imp of imps) {
      md += `- **[${imp.tag}]** ${imp.text}\n`;
    }
  }

  return md;
}

export function exportSwotToHtml(d: SwotDeliverable): string {
  const q = d.frameworkData.quadrants;
  const imps = d.frameworkData.strategicImplications;

  return `
    <article class="deliverable-export swot-export">
      <header>
        <h1>${escapeHtml(d.title)}</h1>
        <p class="meta">Framework: ${escapeHtml(d.framework)} · Version: ${d.version} · Phase: ${escapeHtml(d.phase)}</p>
      </header>
      <div class="swot-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin: 1.5rem 0;">
        ${SWOT_QUADRANTS.map((quad) => {
          const title = quad.charAt(0).toUpperCase() + quad.slice(1);
          return `
            <section class="quadrant quadrant-${quad}" style="border: 1px solid #e2e8f0; padding: 1rem; border-radius: 0.5rem;">
              <h2 style="font-size: 1.1rem; margin-bottom: 0.5rem;">${title}</h2>
              <ul>
                ${q[quad].map((b) => `<li>${escapeHtml(b.text)}${b.sourceAgentId ? ` <small>(${escapeHtml(b.sourceAgentId.toUpperCase())})</small>` : ""}</li>`).join("")}
              </ul>
            </section>
          `;
        }).join("")}
      </div>
      <section class="strategic-implications" style="margin-top: 1.5rem;">
        <h2>Strategic Implications</h2>
        <ul>
          ${imps.map((i) => `<li><strong>[${escapeHtml(i.tag)}]</strong> ${escapeHtml(i.text)}</li>`).join("")}
        </ul>
      </section>
    </article>
  `;
}

// ---- CANVAS EXPORTS ----

export function exportCanvasToMarkdown(d: LeanCanvasDeliverable | BlueprintDeliverable): string {
  let md = `# ${d.title}\n`;
  md += `Framework: ${d.framework}  \n`;
  md += `Version: ${d.version}  \n`;
  md += `Phase: ${d.phase}  \n`;
  md += `Canvas Type: ${d.frameworkData.canvasType}  \n`;
  md += `Updated: ${d.updatedAt}\n\n`;

  if (d.frameworkData.canvasType === "lean-canvas") {
    for (const box of LEAN_CANVAS_BOXES) {
      const heading = box
        .split("-")
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
        .join(" ");
      md += `### ${heading}\n`;
      const items = d.frameworkData.boxes[box];
      if (items.length === 0) {
        md += `_(Empty)_\n`;
      } else {
        for (const item of items) {
          md += `- ${item}\n`;
        }
      }
      md += `\n`;
    }
  } else {
    for (const box of BLUEPRINT_BOXES) {
      const heading = box
        .split("-")
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
        .join(" ");
      md += `### ${heading}\n`;
      const items = d.frameworkData.boxes[box];
      if (items.length === 0) {
        md += `_(Empty)_\n`;
      } else {
        for (const item of items) {
          md += `- ${item}\n`;
        }
      }
      md += `\n`;
    }
  }

  return md;
}

export function exportCanvasToHtml(d: LeanCanvasDeliverable | BlueprintDeliverable): string {
  const isLean = d.frameworkData.canvasType === "lean-canvas";
  const boxes = isLean ? LEAN_CANVAS_BOXES : BLUEPRINT_BOXES;

  return `
    <article class="deliverable-export canvas-export">
      <header>
        <h1>${escapeHtml(d.title)}</h1>
        <p class="meta">Framework: ${escapeHtml(d.framework)} · Version: ${d.version} · Phase: ${escapeHtml(d.phase)}</p>
      </header>
      <div class="canvas-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; margin: 1.5rem 0;">
        ${boxes
          .map((boxKey) => {
            const heading = boxKey
              .split("-")
              .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
              .join(" ");
            // TypeScript knows d is LeanCanvasDeliverable when isLean is true and BlueprintDeliverable otherwise.
            const items = isLean
              ? (d as LeanCanvasDeliverable).frameworkData.boxes[
                  boxKey as (typeof LEAN_CANVAS_BOXES)[number]
                ]
              : (d as BlueprintDeliverable).frameworkData.boxes[
                  boxKey as (typeof BLUEPRINT_BOXES)[number]
                ];
            return `
            <section class="canvas-box" style="border: 1px solid #e2e8f0; padding: 1rem; border-radius: 0.5rem;">
              <h3 style="font-size: 1rem; margin-bottom: 0.5rem;">${escapeHtml(heading)}</h3>
              <ul>
                ${items.map((it) => `<li>${escapeHtml(it)}</li>`).join("")}
              </ul>
            </section>
          `;
          })
          .join("")}
      </div>
    </article>
  `;
}

// ---- MARKETING EXPORTS ----

export function exportMarketingToMarkdown(d: MarketingDeliverable): string {
  const fd = d.frameworkData;
  const total = fd.channels.reduce((sum, ch) => sum + ch.monthlyBudget, 0);
  const estimatedLtv = 1500; // Benchmark LTV for ratio computation

  let md = `# ${d.title}\n`;
  md += `Framework: ${d.framework}  \n`;
  md += `Version: ${d.version}  \n`;
  md += `Phase: ${d.phase}  \n`;
  md += `Monthly Budget Lever: ${formatBudget(d.levers.monthlyBudget)}  \n`;
  md += `Primary Goal: ${d.levers.primaryGoal}  \n`;
  md += `Risk Appetite: ${d.levers.riskAppetite}  \n`;
  md += `Updated: ${d.updatedAt}\n\n`;

  md += `## Positioning\n${fd.positioning}\n\n`;

  md += `## Ideal Customer Profile (ICP)\n`;
  md += `- **Primary:** ${fd.icp.primary}\n`;
  md += `- **Secondary:** ${fd.icp.secondary}\n`;
  md += `- **Anti-Persona:** ${fd.icp.antiPersona}\n\n`;

  md += `## Messaging Pillars\n`;
  for (const pillar of fd.messagingPillars) {
    md += `- **${pillar.pillar}:** ${pillar.proof}\n`;
  }
  md += `\n`;

  md += `## Channel Portfolio\n\n`;
  md += `| Channel | Role | Monthly Budget | % of Budget | Expected CAC | LTV:CAC | Volume | Confidence | Status |\n`;
  md += `| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n`;
  for (const ch of fd.channels) {
    const pct = `${budgetPct(ch, total)}%`;
    const ratio = `${ltvCacRatio(ch, estimatedLtv)}x`;
    md += `| ${ch.name} | ${ch.role} | ${formatBudget(ch.monthlyBudget)} | ${pct} | ${formatBudget(ch.cacHypothesis)} | ${ratio} | ${ch.volumeHypothesis} | ${ch.confidence}/5 | ${ch.status} |\n`;
  }
  md += `\n`;

  md += `## Experiment Backlog\n\n`;
  md += `| Test / Hypothesis | Channel ID | Cost | Success Metric | Kill Criterion | Status |\n`;
  md += `| :--- | :--- | :--- | :--- | :--- | :--- |\n`;
  for (const exp of fd.experiments) {
    md += `| ${exp.hypothesis} | ${exp.channelId} | ${formatBudget(exp.cost)} | ${exp.successMetric} | ${exp.killCriterion} | ${exp.status} |\n`;
  }
  md += `\n`;

  md += `## Launch Sequence\n\n`;
  for (const seq of fd.launchSequence) {
    const phaseLabel = seq.phase
      .split("-")
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join(" ");
    md += `### ${phaseLabel}\n`;
    for (const task of seq.tasks) {
      md += `- [Week ${task.week}] ${task.label} _(Owner: ${task.ownerAgentId.toUpperCase()})_\n`;
    }
    md += `\n`;
  }

  md += `## KPIs & Cadence\n`;
  md += `- **North Star:** ${fd.kpis.northStar.name} (Target: ${fd.kpis.northStar.target}, Current: ${fd.kpis.northStar.current})\n`;
  md += `- **Weekly Review:** ${fd.kpis.weekly.name} (Target: ${fd.kpis.weekly.target}, Current: ${fd.kpis.weekly.current})\n`;
  md += `- **Monthly Review:** ${fd.kpis.monthly.name} (Target: ${fd.kpis.monthly.target}, Current: ${fd.kpis.monthly.current})\n`;

  return md;
}

export function exportMarketingToHtml(d: MarketingDeliverable): string {
  const fd = d.frameworkData;
  const total = fd.channels.reduce((sum, ch) => sum + ch.monthlyBudget, 0);
  const estimatedLtv = 1500;

  return `
    <article class="deliverable-export marketing-export">
      <header>
        <h1>${escapeHtml(d.title)}</h1>
        <p class="meta">Framework: ${escapeHtml(d.framework)} · Version: ${d.version} · Phase: ${escapeHtml(d.phase)} · Budget: ${formatBudget(d.levers.monthlyBudget)}</p>
      </header>
      <section>
        <h2>Positioning</h2>
        <p>${escapeHtml(fd.positioning)}</p>
      </section>
      <section>
        <h2>Channel Portfolio</h2>
        <table border="1" cellpadding="6" style="border-collapse: collapse; width: 100%; margin: 1rem 0;">
          <thead>
            <tr>
              <th>Channel</th>
              <th>Role</th>
              <th>Monthly Budget</th>
              <th>% of Budget</th>
              <th>Expected CAC</th>
              <th>LTV:CAC</th>
              <th>Volume</th>
              <th>Confidence</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${fd.channels
              .map(
                (ch) => `
              <tr>
                <td>${escapeHtml(ch.name)}</td>
                <td>${escapeHtml(ch.role)}</td>
                <td>${formatBudget(ch.monthlyBudget)}</td>
                <td>${budgetPct(ch, total)}%</td>
                <td>${formatBudget(ch.cacHypothesis)}</td>
                <td>${ltvCacRatio(ch, estimatedLtv)}x</td>
                <td>${ch.volumeHypothesis}</td>
                <td>${ch.confidence}/5</td>
                <td>${escapeHtml(ch.status)}</td>
              </tr>
            `,
              )
              .join("")}
          </tbody>
        </table>
      </section>
      <section>
        <h2>Experiment Backlog</h2>
        <table border="1" cellpadding="6" style="border-collapse: collapse; width: 100%; margin: 1rem 0;">
          <thead>
            <tr><th>Hypothesis</th><th>Channel</th><th>Cost</th><th>Success Metric</th><th>Kill Criterion</th><th>Status</th></tr>
          </thead>
          <tbody>
            ${fd.experiments
              .map(
                (exp) => `
              <tr>
                <td>${escapeHtml(exp.hypothesis)}</td>
                <td>${escapeHtml(exp.channelId)}</td>
                <td>${formatBudget(exp.cost)}</td>
                <td>${escapeHtml(exp.successMetric)}</td>
                <td>${escapeHtml(exp.killCriterion)}</td>
                <td>${escapeHtml(exp.status)}</td>
              </tr>
            `,
              )
              .join("")}
          </tbody>
        </table>
      </section>
      <section>
        <h2>Launch Sequence</h2>
        ${fd.launchSequence
          .map(
            (seq) => `
          <h3>${escapeHtml(seq.phase.toUpperCase())}</h3>
          <ul>
            ${seq.tasks.map((t) => `<li>[Week ${t.week}] ${escapeHtml(t.label)} <em>(${escapeHtml(t.ownerAgentId)})</em></li>`).join("")}
          </ul>
        `,
          )
          .join("")}
      </section>
    </article>
  `;
}

// ---- LEGACY EXPORTS ----

export function exportLegacyToMarkdown(d: LegacyDeliverable): string {
  let md = `# ${d.title}\n`;
  md += `Framework: ${d.framework}  \n`;
  md += `Version: ${d.version}  \n`;
  md += `Phase: ${d.phase}  \n`;
  md += `Updated: ${d.updatedAt}\n\n`;

  for (const sec of d.sections) {
    md += `## ${sec.heading}\n\n${sec.body}\n\n`;
  }
  return md;
}

export function exportLegacyToHtml(d: LegacyDeliverable): string {
  return `
    <article class="deliverable-export legacy-export">
      <header>
        <h1>${escapeHtml(d.title)}</h1>
        <p class="meta">Framework: ${escapeHtml(d.framework)} · Version: ${d.version} · Phase: ${escapeHtml(d.phase)}</p>
      </header>
      ${d.sections
        .map(
          (sec) => `
        <section>
          <h2>${escapeHtml(sec.heading)}</h2>
          <div>${escapeHtml(sec.body)}</div>
        </section>
      `,
        )
        .join("")}
    </article>
  `;
}

// ---- EXHAUSTIVE SWITCH EXPORTS ----

export function exportDeliverableToMarkdown(d: Deliverable): string {
  switch (d.framework) {
    case "swot":
      return exportSwotToMarkdown(d);
    case "lean-canvas":
    case "business-blueprint":
      return exportCanvasToMarkdown(d);
    case "marketing-plan":
      return exportMarketingToMarkdown(d);
    case "legacy-plan":
      return exportLegacyToMarkdown(d);
    default: {
      const _never: never = d;
      throw new Error(`Unhandled framework: ${(d as Deliverable).framework}`);
    }
  }
}

export function exportDeliverableToHtml(d: Deliverable): string {
  switch (d.framework) {
    case "swot":
      return exportSwotToHtml(d);
    case "lean-canvas":
    case "business-blueprint":
      return exportCanvasToHtml(d);
    case "marketing-plan":
      return exportMarketingToHtml(d);
    case "legacy-plan":
      return exportLegacyToHtml(d);
    default: {
      const _never: never = d;
      throw new Error(`Unhandled framework: ${(d as Deliverable).framework}`);
    }
  }
}

export async function exportVentureFull(ventureId: string): Promise<string> {
  const venture = await getVenture(ventureId);
  const deliverables = await getDeliverablesForVenture(ventureId);

  let out = `# ${venture?.name ?? "Venture"} Full Repository Export\n\n`;
  out += `**Venture ID:** ${ventureId}  \n`;
  out += `**Thesis:** ${venture?.oneliner ?? venture?.thesis ?? "N/A"}  \n`;
  out += `**Industry:** ${venture?.industry ?? "Technology"}  \n`;
  out += `**Stage:** ${venture?.stage ?? "Idea"}  \n`;
  out += `**Exported At:** ${new Date().toISOString()}\n\n`;

  out += `## Milestone Deliverables\n\n`;
  if (deliverables.length === 0) {
    out += `_(No ratified deliverables in venture repository.)_\n`;
  } else {
    for (const d of deliverables) {
      switch (d.framework) {
        case "swot":
        case "lean-canvas":
        case "business-blueprint":
        case "marketing-plan":
        case "legacy-plan":
          out += exportDeliverableToMarkdown(d) + "\n\n---\n\n";
          break;
        default: {
          const _never: never = d;
          throw new Error(`Unhandled framework: ${(d as Deliverable).framework}`);
        }
      }
    }
  }

  return out;
}
