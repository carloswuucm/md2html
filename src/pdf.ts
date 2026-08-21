import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const BROWSER_CANDIDATES: string[] = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/microsoft-edge",
];

export function findBrowser(): string | undefined {
  const envPath = process.env.CHROME_PATH;
  if (envPath !== undefined && existsSync(envPath)) return envPath;
  for (const candidate of BROWSER_CANDIDATES) {
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

/**
 * Convert an HTML string to a PDF using headless Chrome/Chromium/Edge.
 * Requires one of the browsers in BROWSER_CANDIDATES or CHROME_PATH.
 */
export function convertHtmlToPdf(html: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const browser = findBrowser();
    if (browser === undefined) {
      reject(
        new Error(
          "no supported browser found for PDF conversion " +
            "(install Chrome/Chromium/Edge or set CHROME_PATH)"
        )
      );
      return;
    }

    const dir = mkdtempSync(join(tmpdir(), "md2html-pdf-"));
    const htmlPath = join(dir, "page.html");
    const pdfPath = join(dir, "out.pdf");
    writeFileSync(htmlPath, html, "utf8");

    const child = spawn(
      browser,
      [
        "--headless=new",
        "--disable-gpu",
        "--no-pdf-header-footer",
        `--print-to-pdf=${pdfPath}`,
        pathToFileURL(htmlPath).href,
      ],
      { stdio: ["ignore", "ignore", "pipe"] }
    );

    let stderr = "";
    let settled = false;
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    const timer = setTimeout(() => {
      child.kill();
      finish(new Error("PDF conversion timed out"));
    }, 30000);

    function finish(err: Error | null): void {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        if (err !== null) {
          reject(err);
          return;
        }
        if (!existsSync(pdfPath)) {
          reject(new Error("browser did not produce a PDF"));
          return;
        }
        renameSync(pdfPath, outputPath);
        resolve();
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }

    child.on("error", (err) => finish(err));
    child.on("close", (code) => {
      if (code === 0) {
        finish(null);
      } else {
        finish(new Error(`browser exited with code ${code}: ${stderr.trim()}`));
      }
    });
  });
}
