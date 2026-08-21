import test from "node:test";
import assert from "node:assert/strict";
import { parseMarkdown } from "../dist/parser.js";

test("headings", () => {
  assert.equal(parseMarkdown("# 标题"), "<h1>标题</h1>");
  assert.equal(parseMarkdown("## 二级"), "<h2>二级</h2>");
  assert.equal(parseMarkdown("###### 六级"), "<h6>六级</h6>");
});

test("setext headings", () => {
  assert.equal(parseMarkdown("Title\n====="), "<h1>Title</h1>");
  assert.equal(parseMarkdown("Title\n-----"), "<h2>Title</h2>");
});

test("paragraphs", () => {
  assert.equal(parseMarkdown("a\n\nb"), "<p>a</p>\n<p>b</p>");
  assert.equal(parseMarkdown("line one\nline two"), "<p>line one line two</p>");
});

test("unordered list", () => {
  assert.equal(parseMarkdown("- a\n- b"), "<ul><li>a</li><li>b</li></ul>");
});

test("ordered list", () => {
  assert.equal(parseMarkdown("1. a\n2. b"), "<ol><li>a</li><li>b</li></ol>");
});

test("nested list", () => {
  const html = parseMarkdown("- a\n  - b");
  assert.ok(html.includes("<ul><li>b</li></ul>"));
});

test("fenced code block with language", () => {
  const html = parseMarkdown("```js\nconst x = 1 < 2;\n```");
  assert.ok(html.includes('<pre><code class="language-js">'));
  assert.ok(html.includes("const x = 1 &lt; 2;"));
});

test("indented code block", () => {
  assert.ok(parseMarkdown("    a < b").includes("<pre><code>a &lt; b</code></pre>"));
});

test("links and images", () => {
  const html = parseMarkdown('[text](https://example.com) and ![alt](img.png "t")');
  assert.ok(html.includes('<a href="https://example.com">text</a>'));
  assert.ok(html.includes('<img src="img.png" alt="alt" title="t">'));
});

test("inline styles", () => {
  const html = parseMarkdown("**bold** *italic* `code`");
  assert.ok(html.includes("<strong>bold</strong>"));
  assert.ok(html.includes("<em>italic</em>"));
  assert.ok(html.includes("<code>code</code>"));
});

test("blockquote", () => {
  assert.equal(parseMarkdown("> quote"), "<blockquote><p>quote</p></blockquote>");
});

test("horizontal rule", () => {
  assert.equal(parseMarkdown("---"), "<hr>");
});

test("html is escaped", () => {
  const html = parseMarkdown("<script>alert(1)</script>");
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;"));
});

test("dangerous url schemes are blocked", () => {
  const html = parseMarkdown("[x](javascript:alert(1))");
  assert.ok(html.includes('href="#"'));
});
