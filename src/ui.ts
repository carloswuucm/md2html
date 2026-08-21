import { readFileSync, rmSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { convertHtmlToPdf } from "./pdf.js";
import { convertMarkdown } from "./render.js";
import { listenWithFallback } from "./server.js";

const MAX_BODY_BYTES = 10 * 1024 * 1024; // 10 MB

type ConvertType = "md-pdf" | "md-html" | "html-pdf";
const CONVERT_TYPES: ConvertType[] = ["md-pdf", "md-html", "html-pdf"];

const UI_PAGE = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Markdown / HTML 转换器</title>
<style>
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
    line-height: 1.6;
  }
  main { max-width: 36rem; margin: 0 auto; padding: 3rem 1.25rem 5rem; }
  h1 { font-size: 1.6rem; margin: 0 0 0.25rem; }
  .sub { color: var(--muted); margin: 0 0 1.6rem; }
  .modes { display: flex; gap: 0.5rem; margin-bottom: 1.25rem; }
  .mode {
    flex: 1;
    padding: 0.5rem 0.4rem;
    font-size: 0.88rem;
    font-weight: 600;
    color: var(--fg);
    background: transparent;
    border: 1px solid var(--border);
    border-radius: 8px;
    cursor: pointer;
  }
  .mode.active {
    background: var(--accent);
    color: #ffffff;
    border-color: var(--accent);
  }
  .drop {
    border: 2px dashed var(--border);
    border-radius: 12px;
    padding: 2.2rem 1.5rem;
    text-align: center;
    cursor: pointer;
    transition: border-color 0.15s ease, background 0.15s ease;
  }
  .drop:hover, .drop.dragover {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 6%, transparent);
  }
  .drop p { margin: 0.25rem 0; }
  .drop .hint { color: var(--muted); font-size: 0.9rem; }
  #convertBtn {
    margin-top: 1.25rem;
    width: 100%;
    padding: 0.7rem 1rem;
    font-size: 1rem;
    font-weight: 600;
    color: #ffffff;
    background: var(--accent);
    border: none;
    border-radius: 8px;
    cursor: pointer;
  }
  #convertBtn:disabled { opacity: 0.5; cursor: not-allowed; }
  .status { margin-top: 1rem; min-height: 1.5rem; font-size: 0.95rem; }
  .status.ok { color: #1a7f37; }
  .status.err { color: #cf222e; }
  #result { margin-top: 1.25rem; }
  .result-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
  }
  #downloadBtn {
    width: auto;
    margin: 0;
    padding: 0.4rem 0.9rem;
    font-size: 0.9rem;
    font-weight: 600;
    color: #ffffff;
    background: var(--accent);
    border: none;
    border-radius: 8px;
    cursor: pointer;
  }
  #preview {
    width: 100%;
    height: 420px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: #ffffff;
  }
  @media (prefers-color-scheme: dark) {
    .status.ok { color: #3fb950; }
    .status.err { color: #f85149; }
  }
</style>
</head>
<body>
<main>
  <h1>Markdown / HTML 转换器</h1>
  <p class="sub">上传文件，一键转换。转换由本机的 md2html 引擎完成，文件不会上传到任何第三方。</p>

  <div class="modes">
    <button type="button" class="mode active" data-mode="md-pdf">Markdown → PDF</button>
    <button type="button" class="mode" data-mode="md-html">Markdown → HTML</button>
    <button type="button" class="mode" data-mode="html-pdf">HTML → PDF</button>
  </div>

  <div id="drop" class="drop">
    <p id="dropPrompt"><strong>点击选择文件</strong>，或把 Markdown 文件拖到这里</p>
    <p id="modeHint" class="hint">支持 .md / .markdown，最大 10MB</p>
    <p id="fileInfo" class="hint" style="margin-top:0.75rem"></p>
    <input type="file" id="fileInput" accept=".md,.markdown,text/markdown,text/plain" hidden>
  </div>

  <button id="convertBtn" type="button" disabled>转换为 PDF</button>
  <div id="status" class="status" role="status" aria-live="polite"></div>

  <div id="result" hidden>
    <div class="result-head">
      <strong>转换结果</strong>
      <button id="downloadBtn" type="button" hidden>下载 HTML</button>
    </div>
    <iframe id="preview" sandbox="" title="HTML 预览" hidden></iframe>
  </div>
</main>

<script>
  var MODES = {
    "md-pdf": {
      accept: ".md,.markdown,text/markdown,text/plain",
      hint: "支持 .md / .markdown，最大 10MB",
      prompt: "或把 Markdown 文件拖到这里",
      button: "转换为 PDF",
      ext: ".pdf"
    },
    "md-html": {
      accept: ".md,.markdown,text/markdown,text/plain",
      hint: "支持 .md / .markdown，最大 10MB",
      prompt: "或把 Markdown 文件拖到这里",
      button: "转换为 HTML",
      ext: ".html"
    },
    "html-pdf": {
      accept: ".html,.htm,text/html,text/plain",
      hint: "支持 .html / .htm，最大 10MB",
      prompt: "或把 HTML 文件拖到这里",
      button: "HTML 转 PDF",
      ext: ".pdf"
    }
  };

  var mode = "md-pdf";
  var selectedFile = null;
  var lastHtml = null;

  var drop = document.getElementById("drop");
  var dropPrompt = document.getElementById("dropPrompt");
  var input = document.getElementById("fileInput");
  var button = document.getElementById("convertBtn");
  var statusEl = document.getElementById("status");
  var fileInfo = document.getElementById("fileInfo");
  var modeHint = document.getElementById("modeHint");
  var resultEl = document.getElementById("result");
  var preview = document.getElementById("preview");
  var downloadBtn = document.getElementById("downloadBtn");

  document.querySelectorAll(".mode").forEach(function (btn) {
    btn.addEventListener("click", function () {
      mode = btn.getAttribute("data-mode");
      document.querySelectorAll(".mode").forEach(function (b) {
        b.classList.toggle("active", b === btn);
      });
      var cfg = MODES[mode];
      input.accept = cfg.accept;
      modeHint.textContent = cfg.hint;
      dropPrompt.innerHTML = "<strong>点击选择文件</strong>，" + cfg.prompt;
      button.textContent = cfg.button;
      reset();
    });
  });

  function reset() {
    selectedFile = null;
    lastHtml = null;
    input.value = "";
    fileInfo.textContent = "";
    button.disabled = true;
    statusEl.textContent = "";
    statusEl.className = "status";
    resultEl.hidden = true;
    preview.hidden = true;
    preview.srcdoc = "";
    downloadBtn.hidden = true;
  }

  drop.addEventListener("click", function () { input.click(); });
  drop.addEventListener("dragover", function (e) {
    e.preventDefault();
    drop.classList.add("dragover");
  });
  drop.addEventListener("dragleave", function () {
    drop.classList.remove("dragover");
  });
  drop.addEventListener("drop", function (e) {
    e.preventDefault();
    drop.classList.remove("dragover");
    if (e.dataTransfer.files.length > 0) selectFile(e.dataTransfer.files[0]);
  });
  input.addEventListener("change", function () {
    if (input.files.length > 0) selectFile(input.files[0]);
  });

  function selectFile(file) {
    selectedFile = file;
    fileInfo.textContent = "已选择：" + file.name + "（" + formatSize(file.size) + "）";
    button.disabled = false;
    statusEl.textContent = "";
    statusEl.className = "status";
    resultEl.hidden = true;
    preview.hidden = true;
    downloadBtn.hidden = true;
  }

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  function baseName(name) {
    return name.replace(/\\.(md|markdown|html?)$/i, "");
  }

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  button.addEventListener("click", async function () {
    if (!selectedFile) return;
    button.disabled = true;
    statusEl.className = "status";
    statusEl.textContent = "转换中，请稍候…";
    try {
      var text = await selectedFile.text();
      var res = await fetch("/convert", {
        method: "POST",
        headers: {
          "Content-Type": mode === "html-pdf" ? "text/html; charset=utf-8" : "text/markdown; charset=utf-8",
          "X-File-Name": encodeURIComponent(selectedFile.name),
          "X-Convert-Type": mode
        },
        body: text
      });
      if (!res.ok) {
        var errMsg = await res.text();
        throw new Error(errMsg || "HTTP " + res.status);
      }

      if (mode === "md-html") {
        lastHtml = await res.text();
        preview.srcdoc = lastHtml;
        preview.hidden = false;
        resultEl.hidden = false;
        downloadBtn.hidden = false;
        statusEl.className = "status ok";
        statusEl.textContent = "转换完成，可在下方预览，或点击“下载 HTML”。";
      } else {
        var blob = await res.blob();
        downloadBlob(blob, baseName(selectedFile.name) + MODES[mode].ext);
        statusEl.className = "status ok";
        statusEl.textContent = "转换完成，已开始下载 " + MODES[mode].ext + " 文件。";
      }
    } catch (err) {
      statusEl.className = "status err";
      statusEl.textContent = "转换失败：" + (err.message || err);
    } finally {
      button.disabled = false;
    }
  });

  downloadBtn.addEventListener("click", function () {
    if (lastHtml === null) return;
    var name = selectedFile ? baseName(selectedFile.name) : "document";
    downloadBlob(new Blob([lastHtml], { type: "text/html;charset=utf-8" }), name + ".html");
  });
</script>
</body>
</html>`;

export function startUiServer(port: number, onReady: (actualPort: number) => void): Server {
  const server = createServer((req, res) => {
    const url = req.url ?? "/";
    if (req.method === "GET" && (url === "/" || url === "/index.html")) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(UI_PAGE);
      return;
    }
    if (req.method === "POST" && url === "/convert") {
      void handleConvert(req, res);
      return;
    }
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not Found");
  });

  listenWithFallback(server, port, onReady);
  return server;
}

async function handleConvert(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const convertType = String(req.headers["x-convert-type"] ?? "md-pdf") as ConvertType;
  if (!CONVERT_TYPES.includes(convertType)) {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Unknown convert type");
    return;
  }

  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of req) {
    const buf = chunk as Buffer;
    size += buf.length;
    if (size > MAX_BODY_BYTES) {
      res.writeHead(413, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("File too large (limit 10MB)");
      return;
    }
    chunks.push(buf);
  }

  if (chunks.length === 0) {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Empty request body");
    return;
  }

  const body = Buffer.concat(chunks).toString("utf8");
  const rawName = Array.isArray(req.headers["x-file-name"])
    ? req.headers["x-file-name"][0]
    : req.headers["x-file-name"] ?? "";
  const baseName = safeBaseName(decodeURIComponent(rawName));
  const outPdf = join(tmpdir(), `md2html-ui-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`);

  try {
    if (convertType === "md-html") {
      const html = convertMarkdown(body, baseName);
      const htmlBuf = Buffer.from(html, "utf8");
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="document.html"; filename*=UTF-8''${encodeURIComponent(baseName + ".html")}`,
        "Content-Length": htmlBuf.length,
      });
      res.end(htmlBuf);
      return;
    }

    if (convertType === "html-pdf") {
      await convertHtmlToPdf(body, outPdf);
    } else {
      const html = convertMarkdown(body, baseName);
      await convertHtmlToPdf(html, outPdf);
    }

    const pdf = readFileSync(outPdf);
    res.writeHead(200, {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="document.pdf"; filename*=UTF-8''${encodeURIComponent(baseName + ".pdf")}`,
      "Content-Length": pdf.length,
    });
    res.end(pdf);
  } catch (err) {
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(`Conversion failed: ${(err as Error).message}`);
  } finally {
    rmSync(outPdf, { force: true });
  }
}

function safeBaseName(name: string): string {
  const cleaned = name
    .replace(/^.*[/\\]/, "")
    .replace(/\.(md|markdown|html?)$/i, "")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .trim();
  return cleaned || "document";
}
