# Boardroom module

- `legacy/` holds the ported view/orchestration code from the original app. Edit it in place; keep HTML-string rendering escaped via `escapeHtml`/`renderMarkdown`.
- Tailwind scans these files, so only use full literal class names (no `bg-${x}` construction).
