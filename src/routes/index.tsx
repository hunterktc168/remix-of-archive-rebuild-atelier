import { createFileRoute } from "@tanstack/react-router";

// The dashboard view is rendered into the persistent Boardroom shell by BoardShell.
export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Boardroom" },
      {
        name: "description",
        content: "Your ventures and stage-gate progress with an AI board of directors for startup founders.",
      },
      { property: "og:title", content: "Dashboard — Boardroom" },
      {
        property: "og:description",
        content: "Your ventures and stage-gate progress with an AI board of directors for startup founders.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => null,
});
