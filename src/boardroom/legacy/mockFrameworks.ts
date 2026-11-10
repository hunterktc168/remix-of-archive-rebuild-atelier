/**
 * Offline demo board: deterministic, venture-aware framework JSON so the toolkit
 * works end-to-end without an AI key. Output always satisfies the schema rules.
 */
import type { FrameworkDoc } from "./frameworkEngine";

export interface MockVenture {
  name?: string;
  oneliner?: string;
  thesis?: string;
  industry?: string;
  stage?: string;
  biggestUnknown?: string;
}

function ctx(v: MockVenture) {
  const name = v.name || "the venture";
  const what = (v.oneliner || v.thesis || "the core product").replace(/\.$/, "");
  const industry = v.industry || "the target industry";
  const unknown = (v.biggestUnknown || "whether buyers will commit budget").replace(/\.$/, "");
  return { name, what, industry, unknown, stage: v.stage || "Idea" };
}

export function mockFrameworkDoc(frameworkId: string, venture: MockVenture, phase: string, derivedFromTitle?: string): FrameworkDoc {
  const { name, what, industry, unknown } = ctx(venture);

  switch (frameworkId) {
    case "lean-canvas":
      return {
        title: `Lean Canvas — ${name}`,
        framework: "lean-canvas",
        sections: [
          { id: "problem", heading: "Problem", kind: "bullets", body: [
            `Operators in ${industry} lose 6–10 hours a week on manual work that ${name} automates`,
            "Decisions are made on stale data, causing avoidable margin leakage of 3–5%",
            "Existing tools need a 3-month rollout before showing any value",
            "Alternative: spreadsheets plus a part-time analyst",
            "Alternative: an enterprise suite at $40k+/year with 12-month lock-in",
          ] },
          { id: "customer-segments", heading: "Customer Segments", kind: "bullets", body: [
            `Mid-size ${industry} operators with 20–200 staff and no in-house data team`,
            "Early adopters: operations leads already exporting data to spreadsheets weekly",
          ] },
          { id: "uvp", heading: "Unique Value Proposition", kind: "bullets", body: [
            `${what} — live answers in under 4 minutes from sign-up`,
            `High-level concept: "Autopilot for ${industry} operations"`,
          ] },
          { id: "solution", heading: "Solution", kind: "bullets", body: [
            "One-click data import from the tools operators already use",
            "Daily exception alerts ranked by margin impact",
            "Weekly one-page report the ops lead can forward to the CFO",
          ] },
          { id: "channels", heading: "Channels", kind: "bullets", body: [
            "Free: founder-led outreach to 50 named operations leads",
            "Free: ROI calculator content shared in two industry communities",
            "Paid: $1,500/month LinkedIn test aimed at ops titles",
          ] },
          { id: "revenue-streams", heading: "Revenue Streams", kind: "bullets", body: [
            "SaaS subscription at $299/month per site, annual prepay at 2 months free",
            "LTV assumption: $299 × 80% gross margin ÷ 2.5% monthly churn ≈ $9,600",
          ] },
          { id: "cost-structure", heading: "Cost Structure", kind: "bullets", body: [
            "Fixed: 2 engineers + founder ≈ $38k/month for the next 6 months",
            "Variable: cloud and AI inference ≈ $22 per active site per month",
            "Variable: onboarding support ≈ 3 hours per new customer",
          ] },
          { id: "key-metrics", heading: "Key Metrics", kind: "bullets", body: [
            "Time-to-first-insight (target < 4 minutes)",
            "Week-4 active sites ÷ activated sites (target ≥ 60%)",
            "Pilot-to-paid conversion (target ≥ 30%)",
            "Alerts acted on per site per week (target ≥ 3)",
          ] },
          { id: "unfair-advantage", heading: "Unfair Advantage", kind: "bullets", body: [
            "None yet — plan to build one: accumulate labelled exception data from the first 30 sites to train ranking no new entrant can match",
          ] },
        ],
      };

    case "swot": {
      const lens = phase === "marketing";
      return {
        title: `${lens ? "SWOT — Marketing Lens" : "SWOT Analysis"} — ${name}`,
        framework: "swot",
        sections: [
          { id: "strengths", heading: "Strengths", kind: "bullets", body: [
            `Time-to-first-insight under 4 minutes vs a 3-month incumbent rollout _— Sam Torres_`,
            "Cost to serve ≈ $22/site/month keeps gross margin near 80% at $299 pricing _— Elena Vasquez_",
            lens
              ? "Founder has direct access to 50 named ops leads, giving a $0 CAC first cohort _— Marcus Webb_"
              : "Import connectors for the 3 most common tools cut onboarding to under 1 hour _— Priya Raman_",
          ] },
          { id: "weaknesses", heading: "Weaknesses", kind: "bullets", body: [
            "Zero paid pilots yet, so pricing at $299/month is untested — risk of a 40% discount at first close _— David Okafor_",
            "Single founder-led sales motion caps pipeline at ~15 demos/month _— Marcus Webb_",
            "No data moat until ~30 sites are live, so a funded copycat can match features within 6 months _— Priya Raman_",
          ] },
          { id: "opportunities", heading: "Opportunities", kind: "bullets", body: [
            `Budget planning for ${industry} operators resets in Q1, a 10-week window to land annual pilots _— Elena Vasquez_`,
            "Incumbent price rises of 15–20% this year push mid-size buyers to evaluate alternatives _— Marcus Webb_",
            "Two industry communities (≈ 8k ops members) have no vendor-neutral benchmarking content _— Maya Chen_",
          ] },
          { id: "threats", heading: "Threats", kind: "bullets", body: [
            "If the main incumbent bundles a free 'lite' tier, mid-market win rate could halve within one quarter _— Priya Raman_",
            `Unresolved: ${unknown} — a failed 14-day pilot test would stall fundraising _— David Okafor_`,
            "AI inference price changes above 2× would push cost to serve past $45/site and erode margin _— Elena Vasquez_",
          ] },
          { id: "strategic-implications", heading: "Strategic Implications", kind: "bullets", body: [
            "S×O: Use the 4-minute time-to-value to run 10 Q1 pilots with $500 refundable deposits before budgets lock",
            "W×T: Pre-sell annual contracts to the first 30 sites to build the exception-data moat before an incumbent free tier lands",
            "W×T: Hire a second seller only after 5 paid pilots prove the $299 price holds without discounting",
          ] },
        ],
      };
    }

    case "business-blueprint":
      return {
        title: `Business Blueprint — ${name}`,
        framework: "business-blueprint",
        sections: [
          { id: "key-partnerships", heading: "Key Partnerships", kind: "bullets", body: ["Data-source software vendors (integration listings)", "Two industry associations for benchmarking content", "Cloud and AI inference provider with committed-use pricing"] },
          { id: "key-activities", heading: "Key Activities", kind: "bullets", body: ["Maintain import connectors", "Tune exception ranking weekly from customer feedback", "Founder-led sales and pilot onboarding"] },
          { id: "key-resources", heading: "Key Resources", kind: "bullets", body: ["Labelled exception dataset from live sites", "Two-engineer product team", "Founder's network of 50 ops leads"] },
          { id: "value-proposition", heading: "Value Proposition", kind: "bullets", body: [`${what}`, "Live insight in under 4 minutes, no implementation project", "Weekly CFO-ready margin report"] },
          { id: "customer-relationships", heading: "Customer Relationships", kind: "bullets", body: ["Self-serve onboarding with a 30-minute kickoff call", "Monthly review call for annual accounts", "In-product alerts as the daily touchpoint"] },
          { id: "channels", heading: "Channels", kind: "bullets", body: ["Founder outreach to named ops leads", "Community benchmarking content", "Integration marketplace listings"] },
          { id: "customer-segments", heading: "Customer Segments", kind: "bullets", body: [`Mid-size ${industry} operators (20–200 staff)`, "Multi-site groups with a central ops lead"] },
          { id: "cost-structure", heading: "Cost Structure", kind: "bullets", body: ["Fixed: team ≈ $38k/month", "Variable: ≈ $22/site/month infrastructure", "Variable: ≈ 3 support hours per onboarding"] },
          { id: "revenue-streams", heading: "Revenue Streams", kind: "bullets", body: ["$299/month per site subscription", "Annual prepay (2 months free) for cash-flow", "Future: $99/month benchmarking add-on"] },
          { id: "consistency-notes", heading: "Consistency Notes", kind: "bullets", body: ["Customer Relationships promises monthly review calls, but Key Activities has no account-management capacity — cap annual accounts at 20 until a CSM is hired", "Channels rely on founder outreach while Key Resources lists no second seller; growth beyond ~15 demos/month contradicts the team plan"] },
        ],
      };

    case "marketing-plan":
      return {
        title: `Marketing Plan — ${name}`,
        framework: "marketing-plan",
        sections: [
          { id: "positioning", heading: "Positioning Statement", kind: "prose", body: `For operations leads at mid-size ${industry} companies who need margin answers without a data team, ${name} is an operations autopilot that surfaces ranked exceptions in under 4 minutes. Unlike enterprise suites that need a 3-month rollout, we deliver value on day one at $299/month.` },
          { id: "icp", heading: "ICP & Segments", kind: "bullets", body: [`Primary: ops leads at ${industry} companies with 20–200 staff exporting data to spreadsheets weekly`, "Secondary: finance managers at multi-site groups who own the margin target", "Anti-persona: enterprises with in-house BI teams and 12-month procurement"] },
          { id: "messaging-pillars", heading: "Messaging Pillars", kind: "bullets", body: ["Value in minutes — 4-minute time-to-first-insight; no implementation project", "Margin you can see — ranked alerts tied to dollar impact; weekly CFO report", "Priced for mid-size — $299/month per site; cancel any month"] },
          { id: "channel-portfolio", heading: "Channel Portfolio", kind: "table", body: { columns: ["Channel", "Role in funnel", "Monthly budget", "Expected CAC", "Expected volume", "Confidence (1–5)", "Status"], rows: [
            ["Founder outreach", "Acquisition (bottom)", "$1,000", "$250", "4 customers", "4", "Active"],
            ["Community content", "Awareness (top)", "$1,500", "$500", "3 customers", "3", "Planned"],
            ["LinkedIn ads", "Demand capture (middle)", "$2,000", "$1,000", "2 customers", "2", "Test"],
            ["Integration marketplace", "Acquisition (bottom)", "$500", "$250", "2 customers", "3", "Planned"],
          ] } },
          { id: "budget-allocation", heading: "Budget Allocation", kind: "metrics", body: [
            { label: "Total monthly budget", value: "$5,000" },
            { label: "Founder outreach", value: "20%" },
            { label: "Community content", value: "30%" },
            { label: "LinkedIn ads", value: "40%" },
            { label: "Integration marketplace", value: "10%" },
          ] },
          { id: "experiment-backlog", heading: "Experiment Backlog", kind: "table", body: { columns: ["Test", "Hypothesis", "Cost", "Success metric", "Kill criterion"], rows: [
            ["ROI calculator landing page", "Ops leads trade an email for a margin estimate", "$300", "≥ 8% visitor-to-lead", "< 3% after 500 visits"],
            ["Deposit-backed pilot offer", "Prospects pay $500 refundable to start", "$0", "≥ 3 of 10 pitched pay", "< 2 of 12 pitched pay"],
            ["LinkedIn title targeting", "Ops titles click at ≥ 0.8% CTR", "$1,000", "CAC ≤ $1,000 by week 6", "No customer after $2,000"],
          ] } },
          { id: "launch-sequence", heading: "Launch Sequence", kind: "table", body: { columns: ["Stage", "Weeks", "Actions", "Owner"], rows: [
            ["Pre-launch", "Weeks 1–4", "Waitlist, ROI calculator, 10 deposit pilots", "Founder"],
            ["Launch", "Weeks 5–8", "Public pricing, community AMA, marketplace listing", "Marcus (CMO)"],
            ["Scale", "Weeks 9–16", "Double the best channel, hire first SDR at 15 customers", "Founder + Elena (CFO)"],
          ] } },
          { id: "kpis", heading: "KPIs & Cadence", kind: "metrics", body: [
            { label: "North-star metric", value: "Weekly active sites acting on ≥ 3 alerts" },
            { label: "Weekly review metric", value: "Qualified demos booked (target 6)" },
            { label: "Monthly review metric", value: "Blended CAC (target ≤ $500) and payback (≤ 6 months)" },
          ] },
          { id: "cut-first", heading: "What We Would Cut First", kind: "prose", body: "LinkedIn ads are the weakest channel (confidence 2, highest CAC). Cut them if blended CAC from ads exceeds $1,000 after $2,000 spend or week 6, whichever comes first, and move the budget to community content." },
        ],
      };

    default:
      return { title: name, framework: frameworkId, sections: [] };
  }
}

export function mockRepairResponse(frameworkId: string, ids: string[], venture: MockVenture, phase: string) {
  const doc = mockFrameworkDoc(frameworkId, venture, phase);
  return { sections: doc.sections.filter((s) => ids.includes(s.id)) };
}
