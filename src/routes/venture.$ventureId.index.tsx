import { createFileRoute } from "@tanstack/react-router";

import { ventureHead } from "@/boardroom/venture-head";

export const Route = createFileRoute("/venture/$ventureId/")({
  head: () => ventureHead("Boardroom Chamber"),
  component: () => null,
});
