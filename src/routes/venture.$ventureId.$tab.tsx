import { createFileRoute, notFound } from "@tanstack/react-router";

import { ventureHead } from "@/boardroom/venture-head";

const TABS: Record<string, string> = {
  boardroom: "Boardroom Chamber",
  deliverables: "Deliverables",
  notes: "Venture Notes",
};

export const Route = createFileRoute("/venture/$ventureId/$tab")({
  beforeLoad: ({ params }) => {
    if (!(params.tab in TABS)) throw notFound();
  },
  head: ({ params }) => ventureHead(TABS[params.tab] ?? "Venture"),
  component: () => null,
});
