import { createFileRoute } from "@tanstack/react-router";

import { ventureHead } from "@/boardroom/venture-head";

const PHASES: Record<string, string> = {
  ideation: "Ideation",
  validation: "Validation",
  "business-plan": "Business Plan",
  marketing: "Marketing Strategy",
};

export const Route = createFileRoute("/venture/$ventureId/phase/$phase")({
  head: ({ params }) => ventureHead(`${PHASES[params.phase] ?? "Phase"} Review`),
  component: () => null,
});
