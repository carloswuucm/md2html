import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startPreviewServer } from "../dist/server.js";

test("preview server serves the output html and 404s for missing files", async () => {
  const dir = mkdtempSync(join(tmpdir(), "md2html-serve-"));
  const out = join(dir, "out.html");
  writeFileSync(out, "<!DOCTYPE html><title>Hello</title>");

  let server;
  const ready = new Promise((resolvePort) => {
    server = startPreviewServer(out, 0, resolvePort);
  });
  const port = await ready;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /text\/html/);
    const body = await res.text();
    assert.ok(body.includes("<title>Hello</title>"));

    const missing = await fetch(`http://127.0.0.1:${port}/nope.png`);
    assert.equal(missing.status, 404);
  } finally {
    server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
