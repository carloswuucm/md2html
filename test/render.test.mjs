import test from "node:test";
import assert from "node:assert/strict";
import { convertMarkdown } from "../dist/render.js";

test("custom css replaces the built-in style", () => {
  const html = convertMarkdown("# Hi", "fallback", {
    css: "body { color: red; }",
  });
  assert.ok(html.includes("<style>"));
  assert.ok(html.includes("body { color: red; }"));
  assert.ok(!html.includes("--accent"));
});

test("built-in style is used without custom css", () => {
  const html = convertMarkdown("# Hi");
  assert.ok(html.includes("--accent"));
  assert.ok(html.includes("prefers-color-scheme"));
});

test("fallback title is escaped", () => {
  const html = convertMarkdown("no heading", "<b>bad</b>");
  assert.ok(html.includes("<title>&lt;b&gt;bad&lt;/b&gt;</title>"));
});
