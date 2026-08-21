import { escapeHtml, parseMarkdown } from "./parser.js";

const DEFAULT_CSS = `
:root {
  color-scheme: light dark;
  --bg: #ffffff;
  --fg: #1f2328;
  --muted: #656d76;
  --accent: #0969da;
  --border: #d0d7de;
  --code-bg: #f6f8fa;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0d1117;
    --fg: #e6edf3;
    --muted: #8b949e;
    --accent: #4493f8;
    --border: #30363d;
    --code-bg: #161b22;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--fg);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans",
    Helvetica, Arial, sans-serif;
  font-size: 16px;
  line-height: 1.65;
}
main { max-width: 46rem; margin: 0 auto; padding: 2.5rem 1.5rem 5rem; }
h1, h2, h3, h4, h5, h6 { line-height: 1.3; margin: 1.6em 0 0.6em; font-weight: 600; }
h1 { font-size: 2em; padding-bottom: 0.3em; border-bottom: 1px solid var(--border); }
h2 { font-size: 1.5em; padding-bottom: 0.3em; border-bottom: 1px solid var(--border); }
h3 { font-size: 1.25em; }
h4 { font-size: 1em; }
p { margin: 0.8em 0; }
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
ul, ol { margin: 0.8em 0; padding-left: 1.7em; }
li { margin: 0.25em 0; }
li > ul, li > ol { margin: 0.25em 0; }
code {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas,
    "Liberation Mono", monospace;
  font-size: 0.9em;
  background: var(--code-bg);
  border-radius: 6px;
  padding: 0.15em 0.4em;
}
pre {
  background: var(--code-bg);
  border-radius: 8px;
  padding: 1em 1.1em;
  overflow-x: auto;
  line-height: 1.5;
}
pre code { background: transparent; padding: 0; font-size: 0.92em; }
blockquote {
  margin: 1em 0;
  padding: 0.1em 1em;
  color: var(--muted);
  border-left: 4px solid var(--border);
}
blockquote > p { margin: 0.6em 0; }
img { max-width: 100%; border-radius: 4px; }
hr { border: none; border-top: 1px solid var(--border); margin: 2em 0; }
`;

export interface RenderOptions {
  title?: string;
  /** Custom CSS; replaces the built-in default style when provided. */
  css?: string;
}

export function renderHtml(body: string, options: RenderOptions = {}): string {
  const title = escapeHtml(options.title ?? "Markdown");
  const css = options.css ?? DEFAULT_CSS;
  return [
    "<!DOCTYPE html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    `<title>${title}</title>`,
    "<style>",
    css,
    "</style>",
    "</head>",
    "<body>",
    "<main>",
    body,
    "</main>",
    "</body>",
    "</html>",
    "",
  ].join("\n");
}

export function extractTitle(md: string): string | undefined {
  const m = md.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : undefined;
}

export function convertMarkdown(
  md: string,
  fallbackTitle = "Markdown",
  options: RenderOptions = {}
): string {
  const clean = md.replace(/^\uFEFF/, "");
  return renderHtml(parseMarkdown(clean), {
    ...options,
    title: extractTitle(clean) ?? fallbackTitle,
  });
}
