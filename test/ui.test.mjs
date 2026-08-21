import test from "node:test";
import assert from "node:assert/strict";
import { startUiServer } from "../dist/ui.js";

test("ui server serves the upload page", async () => {
  let server;
  const ready = new Promise((resolvePort) => {
    server = startUiServer(0, resolvePort);
  });
  const port = await ready;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.ok(html.includes("Markdown → PDF"));
    assert.ok(html.includes('id="fileInput"'));
  } finally {
    server.close();
  }
});

test("ui server converts markdown to pdf", async () => {
  let server;
  const ready = new Promise((resolvePort) => {
    server = startUiServer(0, resolvePort);
  });
  const port = await ready;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/convert`, {
      method: "POST",
      headers: {
        "Content-Type": "text/markdown",
        "X-File-Name": encodeURIComponent("测试文档.md"),
      },
      body: "# Hello\n\n| a | b |\n|---|---|\n| 1 | 2 |",
    });
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /application\/pdf/);
    const buf = Buffer.from(await res.arrayBuffer());
    assert.equal(buf.subarray(0, 5).toString(), "%PDF-");
    assert.ok(buf.length > 1000);
  } finally {
    server.close();
  }
});

test("ui server converts markdown to html", async () => {
  let server;
  const ready = new Promise((resolvePort) => {
    server = startUiServer(0, resolvePort);
  });
  const port = await ready;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/convert`, {
      method: "POST",
      headers: {
        "Content-Type": "text/markdown",
        "X-File-Name": encodeURIComponent("doc.md"),
        "X-Convert-Type": "md-html",
      },
      body: "# Hello\n\n- a\n- b",
    });
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /text\/html/);
    const html = await res.text();
    assert.ok(html.includes("<h1>Hello</h1>"));
    assert.ok(html.includes("<ul><li>a</li><li>b</li></ul>"));
  } finally {
    server.close();
  }
});

test("ui server converts html to pdf", async () => {
  let server;
  const ready = new Promise((resolvePort) => {
    server = startUiServer(0, resolvePort);
  });
  const port = await ready;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/convert`, {
      method: "POST",
      headers: {
        "Content-Type": "text/html",
        "X-File-Name": encodeURIComponent("page.html"),
        "X-Convert-Type": "html-pdf",
      },
      body: "<!DOCTYPE html><html><body><h1>Hi</h1></body></html>",
    });
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /application\/pdf/);
    const buf = Buffer.from(await res.arrayBuffer());
    assert.equal(buf.subarray(0, 5).toString(), "%PDF-");
  } finally {
    server.close();
  }
});

test("ui server rejects unknown convert type", async () => {
  let server;
  const ready = new Promise((resolvePort) => {
    server = startUiServer(0, resolvePort);
  });
  const port = await ready;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/convert`, {
      method: "POST",
      headers: { "X-Convert-Type": "nope" },
      body: "# x",
    });
    assert.equal(res.status, 400);
  } finally {
    server.close();
  }
});
