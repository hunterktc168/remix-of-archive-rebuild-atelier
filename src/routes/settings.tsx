import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings & Keys — Boardroom" },
      {
        name: "description",
        content: "Choose the AI provider for your board, manage keys and the data stored on this device.",
      },
      { property: "og:title", content: "Settings & Keys — Boardroom" },
      {
        property: "og:description",
        content: "Choose the AI provider for your board and manage data stored on this device.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => null,
});
