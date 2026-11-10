export function ventureHead(section: string) {
  const title = `${section} — Boardroom`;
  const description =
    "Deliberate with your AI board of directors, challenge assumptions and ratify stage-gate memos for your venture.";
  return {
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  };
}
