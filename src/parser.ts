/**
 * A small, dependency-free Markdown parser covering the basic syntax:
 * headings, paragraphs, lists (with nesting), fenced and indented code
 * blocks, blockquotes, horizontal rules, links, images, emphasis and
 * inline code.
 */

const FENCE_RE = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const FENCE_CLOSE_RE = /^\s*(`{3,}|~{3,})\s*$/;
const ATX_HEADING_RE = /^(#{1,6})\s+(.*)$/;
const HR_RE =
  /^\s*(\*[ \t]*){3,}\s*$|^\s*(-[ \t]*){3,}\s*$|^\s*(_[ \t]*){3,}\s*$/;
const QUOTE_RE = /^\s*>/;
const LIST_MARKER_RE = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;

const INLINE_RE =
  /(`+)([^`]+?)\1|!\[([^\]]*)\]\(([^)\s]+)(?:\s+["']([^"']*?)["'])?\)|\[([^\]]+)\]\(([^)\s]+)(?:\s+["']([^"']*?)["'])?\)|\*\*([^*]+?)\*\*|__([^_]+?)__|\*([^*]+?)\*|_([^_]+?)_|\\([\\`*_{}\[\]()#+\-.!|])/g;

export function parseMarkdown(md: string): string {
  const lines = md
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .split("\n");
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const raw = lines[i];

    if (raw.trim() === "") {
      i++;
      continue;
    }

    // Indented code block (4+ leading spaces). This only runs at a block
    // start, so a preceding blank line is implied.
    if (/^ {4}/.test(raw)) {
      const code: string[] = [];
      while (i < lines.length) {
        const l = lines[i];
        if (l.trim() === "" || /^ {4}/.test(l)) {
          code.push(l.replace(/^ {4}/, ""));
          i++;
        } else {
          break;
        }
      }
      out.push(renderCodeBlock(code.join("\n"), ""));
      continue;
    }

    // Fenced code block.
    const fence = raw.match(FENCE_RE);
    if (fence) {
      const marker = fence[1];
      const lang = fence[2].trim();
      const code: string[] = [];
      i++;
      while (i < lines.length) {
        const l = lines[i];
        const close = l.match(FENCE_CLOSE_RE);
        if (close && close[1][0] === marker[0] && close[1].length >= marker.length) {
          i++;
          break;
        }
        code.push(l);
        i++;
      }
      out.push(renderCodeBlock(code.join("\n"), lang));
      continue;
    }

    // ATX heading.
    const heading = raw.match(ATX_HEADING_RE);
    if (heading) {
      const level = heading[1].length;
      out.push(`<h${level}>${renderInline(heading[2].trim())}</h${level}>`);
      i++;
      continue;
    }

    // Setext heading (only when the line is plain paragraph text).
    if (!isBlockStart(raw) && i + 1 < lines.length) {
      const next = lines[i + 1];
      if (/^=+\s*$/.test(next)) {
        out.push(`<h1>${renderInline(raw.trim())}</h1>`);
        i += 2;
        continue;
      }
      if (/^-+\s*$/.test(next)) {
        out.push(`<h2>${renderInline(raw.trim())}</h2>`);
        i += 2;
        continue;
      }
    }

    // Horizontal rule.
    if (HR_RE.test(raw)) {
      out.push("<hr>");
      i++;
      continue;
    }

    // Blockquote.
    if (QUOTE_RE.test(raw)) {
      const quote: string[] = [];
      while (i < lines.length && QUOTE_RE.test(lines[i])) {
        quote.push(lines[i].replace(/^\s*>\s?/, ""));
        i++;
      }
      out.push(`<blockquote>${parseMarkdown(quote.join("\n"))}</blockquote>`);
      continue;
    }

    // List.
    const listStart = raw.match(LIST_MARKER_RE);
    if (listStart) {
      const baseIndent = listStart[1].length;
      const result = parseList(lines, i, baseIndent);
      out.push(result.html);
      i = result.next;
      continue;
    }

    // Paragraph.
    const para: string[] = [];
    while (i < lines.length) {
      const l = lines[i];
      if (l.trim() === "") break;
      if (isBlockStart(l)) break;
      const next = lines[i + 1];
      if (next !== undefined && (/^=+\s*$/.test(next) || /^-+\s*$/.test(next))) {
        break;
      }
      para.push(l.trim());
      i++;
    }
    if (para.length > 0) {
      out.push(`<p>${renderInline(para.join(" "))}</p>`);
    }
  }

  return out.join("\n");
}

interface ListItem {
  content: string[];
}

function parseList(
  lines: string[],
  start: number,
  baseIndent: number
): { html: string; next: number } {
  const items: ListItem[] = [];
  let i = start;
  let listStyle: { ordered: boolean; key: string } | null = null;
  let loose = false;

  while (i < lines.length) {
    const raw = lines[i];
    const m = raw.match(LIST_MARKER_RE);
    if (!m || m[1].length !== baseIndent) break;
    const style = markerStyle(m[2]);
    if (listStyle === null) {
      listStyle = style;
    } else if (style.ordered !== listStyle.ordered || style.key !== listStyle.key) {
      break;
    }

    const content: string[] = [m[3]];
    i++;

    while (i < lines.length) {
      const l = lines[i];

      if (l.trim() === "") {
        let j = i + 1;
        while (j < lines.length && lines[j].trim() === "") j++;
        const next = lines[j];

        if (next === undefined) {
          i = j;
          break;
        }

        const nm = next.match(LIST_MARKER_RE);
        const nind = leadingSpaces(next);
        if (nm && nind === baseIndent) {
          const nextStyle = markerStyle(nm[2]);
          if (
            listStyle !== null &&
            (nextStyle.ordered !== listStyle.ordered || nextStyle.key !== listStyle.key)
          ) {
            break;
          }
          // Blank line between two items: same list, now loose.
          loose = true;
          i = j;
          break;
        }
        if (nm && nind < baseIndent) break;
        if (nind > baseIndent) {
          // Blank + indented content belongs to this item.
          loose = true;
          content.push("");
          i = j;
          continue;
        }
        // Non-indented plain text after a blank line ends the list.
        break;
      }

      const ind = leadingSpaces(l);
      if (ind <= baseIndent) {
        if (!isBlockStart(l)) {
          // Lazy continuation: plain text keeps the item's paragraph going.
          content.push(l.trim());
          i++;
          continue;
        }
        break;
      }

      // Indented continuation or nested content; strip the item's indent.
      content.push(l.slice(Math.min(ind, baseIndent + 2)));
      i++;
    }

    items.push({ content });
  }

  const tag = listStyle?.ordered ? "ol" : "ul";
  const body = items.map((item) => `<li>${renderItem(item.content, loose)}</li>`).join("");
  return { html: `<${tag}>${body}</${tag}>`, next: i };
}

function markerStyle(marker: string): { ordered: boolean; key: string } {
  if (/^\d/.test(marker)) {
    return { ordered: true, key: marker.endsWith(")") ? ")" : "." };
  }
  return { ordered: false, key: marker };
}

function renderItem(content: string[], loose: boolean): string {
  const html = parseMarkdown(content.join("\n"));
  if (!loose) {
    const hasBlocks = /<(?:ul|ol|pre|blockquote|h[1-6]|hr)\b/.test(html);
    if (!hasBlocks) {
      return html.replace(/^<p>(.*)<\/p>$/s, "$1");
    }
  }
  return html;
}

function renderCodeBlock(code: string, lang: string): string {
  const cls = lang ? ` class="language-${escapeHtml(lang)}"` : "";
  return `<pre><code${cls}>${escapeHtml(code)}</code></pre>`;
}

function renderInline(text: string): string {
  let out = "";
  let last = 0;
  INLINE_RE.lastIndex = 0;
  for (const m of text.matchAll(INLINE_RE)) {
    const index = m.index ?? 0;
    out += escapeHtml(text.slice(last, index));
    out += renderInlineMatch(m);
    last = index + m[0].length;
  }
  out += escapeHtml(text.slice(last));
  return out;
}

function renderInlineMatch(m: RegExpMatchArray): string {
  // Capture groups (see INLINE_RE):
  // 1 code ticks, 2 code, 3 img alt, 4 img url, 5 img title,
  // 6 link text, 7 link url, 8 link title, 9/10 bold, 11/12 italic, 13 escape.
  if (m[2] !== undefined) return `<code>${escapeHtml(m[2])}</code>`;
  if (m[3] !== undefined) {
    const title = m[5];
    return (
      `<img src="${safeUrl(m[4])}" alt="${escapeHtml(m[3])}"` +
      (title !== undefined ? ` title="${escapeHtml(title)}"` : "") +
      ">"
    );
  }
  if (m[6] !== undefined) {
    const title = m[8];
    return (
      `<a href="${safeUrl(m[7])}"` +
      (title !== undefined ? ` title="${escapeHtml(title)}"` : "") +
      `>${renderInline(m[6])}</a>`
    );
  }
  if (m[9] !== undefined || m[10] !== undefined) {
    const inner = (m[9] ?? m[10]) as string;
    return `<strong>${renderInline(inner)}</strong>`;
  }
  if (m[11] !== undefined || m[12] !== undefined) {
    const inner = (m[11] ?? m[12]) as string;
    return `<em>${renderInline(inner)}</em>`;
  }
  if (m[13] !== undefined) return m[13];
  return "";
}

function isBlockStart(line: string): boolean {
  if (line.trim() === "") return true;
  if (ATX_HEADING_RE.test(line)) return true;
  if (/^ {0,3}(`{3,}|~{3,})/.test(line)) return true;
  if (QUOTE_RE.test(line)) return true;
  if (HR_RE.test(line)) return true;
  if (LIST_MARKER_RE.test(line)) return true;
  return false;
}

function leadingSpaces(line: string): number {
  const m = line.match(/^ */);
  return m ? m[0].length : 0;
}

function safeUrl(url: string): string {
  const u = (url ?? "").trim();
  if (/^(javascript|vbscript|file):/i.test(u)) return "#";
  return escapeHtml(u);
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
