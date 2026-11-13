import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/agents")({
  head: () => ({
    meta: [
      { title: "Board Members — Boardroom" },
      {
        name: "description",
        content:
          "Meet the six directors and The Chair who advise your venture: innovation, validation, strategy, marketing, finance and product.",
      },
      { property: "og:title", content: "Board Members — Boardroom" },
      {
        property: "og:description",
        content: "Meet the six directors and The Chair who advise your venture.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => null,
});
