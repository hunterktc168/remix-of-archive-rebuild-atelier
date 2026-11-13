<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.

<!-- LOVABLE:END -->

## Project rules

- Boardroom's screens are the original vanilla view modules in `src/boardroom/legacy/` (`// @ts-nocheck`), rendered client-side into `#view-root` by `src/boardroom/BoardShell.tsx`; each source path has a TanStack route file that renders `null`. Why: faithful port of the source app without a full React rewrite.
- The shell chrome in `BoardShell.tsx` must stay static (ids and classes are mutated by the legacy modules); never give it changing props or React children inside `#view-root`.
- Legacy views navigate via `navigateTo`/`replaceUrlSilently` from `src/boardroom/nav.ts`, never `window.location.hash`. Why: keeps TanStack Router in sync.
- App data stays in the browser's IndexedDB (`boardroom_db`) and AI calls go from the browser with founder-supplied keys; there is no backend. Why: user chose to keep data on-device.
- Business Plan and Marketing deliverables are framework-based: the registry lives in `src/boardroom/legacy/schemas.ts`, pure validation/prompt/repair logic in `frameworkEngine.ts` (unit-tested in `src/test/frameworks.test.ts`), persistence/versioning in `frameworkStore.ts`, UI in `views/frameworks.ts`. Why: keeps the rules testable and separate from HTML rendering.
- Framework deliverables are one IndexedDB record per (venture, phase, framework) with `kind:'framework'`; every generate/derive/repair/edit/restore appends to `versions[]` and the top-level fields mirror the current version. Why: independent deliverables with history.
- The offline demo provider must return schema-valid JSON for every framework (`mockFrameworks.ts`); a test enforces it. Why: the toolkit must work without an AI key.
