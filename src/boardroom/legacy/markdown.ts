// @ts-nocheck
/* Ported verbatim from the original Boardroom vanilla JS app; see src/boardroom/AGENTS.md. */
/**
 * Zero-Dependency Markdown to HTML Parser
 * CRITICAL SECURITY: Escapes all HTML characters FIRST before parsing markdown, preventing XSS.
 */

/**
 * Escape raw HTML entities
 */
export function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Render Markdown string into safe, sanitized HTML
 */
export function renderMarkdown(markdown = "") {
  if (!markdown) return "";

  // 1. Strict HTML escape first — eliminates any raw tags like <script>, <iframe>, <img>
  let text = escapeHtml(markdown);

  // 2. Fenced Code Blocks: ```lang\ncode\n```
  const codeBlocks = [];
  text = text.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (match, lang, code) => {
    const id = `@@CODEBLOCK${codeBlocks.length}@@`;
    codeBlocks.push(
      `<pre class="p-3.5 my-3 rounded-lg bg-[#080B0F] border border-subtle overflow-x-auto font-mono text-xs text-slate-200 leading-relaxed"><code>${code.trim()}</code></pre>`,
    );
    return `\n\n${id}\n\n`;
  });

  // 3. Blockquotes: > quote line
  text = text.replace(/^(?:&gt;|>)[ ]?([\s\S]*?)(?=\n\n|$)/gm, (match, content) => {
    const cleanLines = content
      .split("\n")
      .map((line) => line.replace(/^(?:&gt;|>)[ ]?/, ""))
      .join("<br />");
    return `<blockquote class="p-3 my-2.5 rounded-lg border-l-2 border-brass bg-brass/5 text-xs italic text-slate-200">${cleanLines}</blockquote>`;
  });

  // 4. Headings: # H1, ## H2, ### H3, #### H4
  text = text.replace(
    /^#### (.*?)$/gm,
    '<h5 class="font-serif text-sm text-slate-200 font-semibold mt-3 mb-1">$1</h5>',
  );
  text = text.replace(
    /^### (.*?)$/gm,
    '<h4 class="font-serif text-base text-slate-100 font-semibold mt-4 mb-1.5">$1</h4>',
  );
  text = text.replace(
    /^## (.*?)$/gm,
    '<h3 class="font-serif text-lg text-slate-100 font-semibold mt-4 mb-2">$1</h3>',
  );
  text = text.replace(
    /^# (.*?)$/gm,
    '<h2 class="font-serif text-xl sm:text-2xl text-slate-100 font-bold mt-5 mb-2.5">$1</h2>',
  );

  // 5. Horizontal Rules: --- or ***
  text = text.replace(/^(?:---|\*\*\*|___)$/gm, '<hr class="my-4 border-subtle" />');

  // 6. Inline Code: `code`
  text = text.replace(
    /`([^`\n]+)`/g,
    '<code class="px-1.5 py-0.5 rounded bg-[#080B0F] border border-subtle font-mono text-xs text-brass-light">$1</code>',
  );

  // 7. Bold and Italic
  text = text.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong class="font-bold"><em>$1</em></strong>');
  text = text.replace(
    /\*\*([^*]+)\*\*/g,
    '<strong class="font-semibold text-slate-100">$1</strong>',
  );
  text = text.replace(/__([^_]+)__/g, '<strong class="font-semibold text-slate-100">$1</strong>');
  text = text.replace(/\*([^*\n]+)\*/g, '<em class="italic">$1</em>');
  text = text.replace(/_([^_\n]+)_/g, '<em class="italic">$1</em>');

  // 8. Safe Links: [text](url) - only http, https, mailto, relative #
  text = text.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+|#[^\s)]+)\)/g,
    (match, label, href) => {
      return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="text-brass-light hover:underline font-medium">${label}</a>`;
    },
  );

  // 9. Lists
  // Unordered list items: - item or * item
  text = text.replace(
    /^[-*] (.*?)$/gm,
    '<li class="ml-4 list-disc text-xs text-slate-300 my-0.5">$1</li>',
  );

  // Ordered list items: 1. item
  text = text.replace(
    /^(\d+)\. (.*?)$/gm,
    '<li class="ml-4 list-decimal text-xs text-slate-300 my-0.5">$2</li>',
  );

  // Wrap consecutive <li> elements in <ul> / <ol> with clear surrounding newlines
  text = text.replace(
    /(?:<li class="ml-4 list-disc.*?<\/li>(?:\n|$))+/g,
    (match) => `\n\n<ul class="my-2 space-y-0.5">\n${match.trim()}\n</ul>\n\n`,
  );
  text = text.replace(
    /(?:<li class="ml-4 list-decimal.*?<\/li>(?:\n|$))+/g,
    (match) => `\n\n<ol class="my-2 space-y-0.5">\n${match.trim()}\n</ol>\n\n`,
  );

  // 10. Paragraphs: double newline separated blocks
  const paragraphs = text.split(/\n\n+/);
  text = paragraphs
    .map((p) => {
      p = p.trim();
      if (!p) return "";
      // Don't wrap if already inside a block element
      if (
        p.startsWith("<h") ||
        p.startsWith("<pre") ||
        p.startsWith("<blockquote") ||
        p.startsWith("<ul") ||
        p.startsWith("<ol") ||
        p.startsWith("<hr") ||
        p.startsWith("@@CODEBLOCK")
      ) {
        return p;
      }
      return `<p class="text-xs leading-relaxed text-slate-300 my-1.5">${p.replace(/\n/g, "<br />")}</p>`;
    })
    .filter(Boolean)
    .join("\n");

  // 11. Restore Fenced Code Blocks
  // Use a function replacement so `$` sequences in the code (e.g. `$&`, `$$`) are
  // inserted literally instead of being interpreted as replacement patterns.
  codeBlocks.forEach((codeHtml, idx) => {
    text = text.replace(`@@CODEBLOCK${idx}@@`, () => codeHtml);
  });

  return text;
}
