#!/usr/bin/env node
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  watchFile,
  unwatchFile,
  writeFileSync,
} from "node:fs";
import { basename, dirname, extname, resolve } from "node:path";
import { convertHtmlToPdf } from "./pdf.js";
import { convertMarkdown } from "./render.js";
import { startPreviewServer } from "./server.js";
import { startUiServer } from "./ui.js";

const HELP = `md2html - convert a Markdown file to a styled HTML file

Usage:
  md2html <input.md> [options]

Options:
  -o, --output <file>   Output HTML file.
                        Defaults to the input filename with a .html extension.
  -c, --css <file>      Use a custom CSS file instead of the built-in style.
  --pdf                 Also convert to PDF using headless Chrome/Edge.
                        Default output: input filename with a .pdf extension.
  --ui                  Start a local web page for uploading Markdown and
                        downloading it as PDF. No input file needed.
  -w, --watch           Watch the input file and rebuild on every change.
  -s, --serve           Serve the HTML on a local HTTP server for preview.
                        Implies --watch (live preview).
  -p, --port <n>        Port for --serve (default: 8080).
  -h, --help            Show this help message.
  -v, --version         Print the version number.

Examples:
  md2html README.md
  md2html README.md -o docs/readme.html
  md2html README.md --css style.css
  md2html README.md --pdf
  md2html --ui --port 3000
  md2html README.md --watch
  md2html README.md --serve --port 3000
`;

interface CliOptions {
  input: string;
  output: string | undefined;
  css: string | undefined;
  pdf: boolean;
  ui: boolean;
  watch: boolean;
  serve: boolean;
  port: number | undefined;
  help: boolean;
  version: boolean;
}

type ParseResult =
  | { ok: true; options: CliOptions }
  | { ok: false; error: string };

function parseArgs(argv: string[]): ParseResult {
  const options: CliOptions = {
    input: "",
    output: undefined,
    css: undefined,
    pdf: false,
    ui: false,
    watch: false,
    serve: false,
    port: undefined,
    help: false,
    version: false,
  };
  const positional: string[] = [];
  let endOfOptions = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (endOfOptions) {
      positional.push(arg);
      continue;
    }
    if (arg === "--") {
      endOfOptions = true;
      continue;
    }
    if (arg === "-o" || arg === "--output") {
      i++;
      if (i >= argv.length) return { ok: false, error: `option ${arg} requires a value` };
      options.output = argv[i];
      continue;
    }
    if (arg.startsWith("--output=")) {
      options.output = arg.slice("--output=".length);
      continue;
    }
    if (arg === "-c" || arg === "--css") {
      i++;
      if (i >= argv.length) return { ok: false, error: `option ${arg} requires a value` };
      options.css = argv[i];
      continue;
    }
    if (arg.startsWith("--css=")) {
      options.css = arg.slice("--css=".length);
      continue;
    }
    if (arg === "--pdf") {
      options.pdf = true;
      continue;
    }
    if (arg === "--ui") {
      options.ui = true;
      continue;
    }
    if (arg === "-p" || arg === "--port") {
      i++;
      if (i >= argv.length) return { ok: false, error: `option ${arg} requires a value` };
      options.port = Number(argv[i]);
      continue;
    }
    if (arg.startsWith("--port=")) {
      options.port = Number(arg.slice("--port=".length));
      continue;
    }
    if (arg === "-w" || arg === "--watch") {
      options.watch = true;
      continue;
    }
    if (arg === "-s" || arg === "--serve") {
      options.serve = true;
      continue;
    }
    if (arg === "-h" || arg === "--help") {
      options.help = true;
      continue;
    }
    if (arg === "-v" || arg === "--version") {
      options.version = true;
      continue;
    }
    if (arg.startsWith("-") && arg !== "-") {
      return { ok: false, error: `unknown option: ${arg}` };
    }
    positional.push(arg);
  }

  if (positional.length > 1) {
    return { ok: false, error: `unexpected extra argument: ${positional[1]}` };
  }
  options.input = positional[0] ?? "";
  return { ok: true, options };
}

function defaultOutputPath(inputPath: string, extension: string): string {
  const ext = extname(inputPath).toLowerCase();
  if (ext === ".md" || ext === ".markdown") {
    return inputPath.slice(0, -ext.length) + extension;
  }
  return `${inputPath}${extension}`;
}

function getVersion(): string {
  try {
    const pkg = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8")
    ) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  if (!parsed.ok) {
    console.error(`md2html: ${parsed.error}`);
    console.error("Run 'md2html --help' for usage.");
    process.exitCode = 1;
    return;
  }
  const { options } = parsed;

  if (options.help) {
    console.log(HELP);
    return;
  }
  if (options.version) {
    console.log(getVersion());
    return;
  }
  const port = options.port ?? 8080;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error("md2html: --port must be an integer between 1 and 65535");
    process.exitCode = 1;
    return;
  }

  if (options.ui) {
    if (options.serve || options.pdf || options.watch) {
      console.error("md2html: --ui cannot be combined with --serve, --pdf or --watch");
      process.exitCode = 1;
      return;
    }
    if (options.input !== "") {
      console.error("md2html: --ui does not take an input file");
      process.exitCode = 1;
      return;
    }
    const uiServer = startUiServer(port, (actualPort) => {
      console.log(`md2html UI running at http://localhost:${actualPort}/`);
      console.log("Press Ctrl+C to stop.");
    });
    process.on("SIGINT", () => {
      uiServer.close();
      console.log("\nStopped.");
      process.exit(0);
    });
    return;
  }

  if (!options.input) {
    console.error("md2html: missing input file");
    console.error("Run 'md2html --help' for usage.");
    process.exitCode = 1;
    return;
  }

  if (options.pdf && options.serve) {
    console.error("md2html: --pdf cannot be combined with --serve");
    process.exitCode = 1;
    return;
  }

  const inputPath = resolve(options.input);
  const outputExt = options.pdf ? ".pdf" : ".html";
  const outputPath = resolve(options.output ?? defaultOutputPath(inputPath, outputExt));

  if (outputPath === inputPath) {
    console.error("md2html: output file must be different from the input file");
    process.exitCode = 1;
    return;
  }

  let customCss: string | undefined;
  if (options.css !== undefined) {
    try {
      customCss = readFileSync(resolve(options.css), "utf8");
    } catch (err) {
      console.error(`md2html: cannot read CSS file: ${(err as Error).message}`);
      process.exitCode = 1;
      return;
    }
  }

  const timestamp = (): string => new Date().toLocaleTimeString();

  const convert = async (): Promise<boolean> => {
    try {
      const md = readFileSync(inputPath, "utf8");
      const html = convertMarkdown(
        md,
        basename(inputPath),
        customCss !== undefined ? { css: customCss } : {}
      );
      mkdirSync(dirname(outputPath), { recursive: true });
      if (options.pdf) {
        await convertHtmlToPdf(html, outputPath);
        console.log(`${timestamp()} wrote ${outputPath} (${statSync(outputPath).size} bytes)`);
      } else {
        writeFileSync(outputPath, html, "utf8");
        console.log(`${timestamp()} wrote ${outputPath} (${Buffer.byteLength(html)} bytes)`);
      }
      return true;
    } catch (err) {
      console.error(`${timestamp()} error: ${(err as Error).message}`);
      return false;
    }
  };

  const shouldWatch = options.watch || options.serve;

  if (!shouldWatch) {
    if (!(await convert())) process.exitCode = 1;
    return;
  }

  let lastExisted = existsSync(inputPath);
  let timer: NodeJS.Timeout | null = null;
  const schedule = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void convert();
    }, 80);
  };

  if (!lastExisted) {
    console.error(`${timestamp()} ${inputPath} does not exist yet; waiting for it...`);
  } else {
    void convert();
  }
  console.log(`Watching ${inputPath} for changes... (press Ctrl+C to stop)`);

  watchFile(inputPath, { interval: 300 }, (curr, prev) => {
    const exists = existsSync(inputPath);
    if (exists !== lastExisted) {
      lastExisted = exists;
      if (exists) {
        console.log(`${timestamp()} file appeared; converting...`);
        schedule();
      } else {
        console.log(`${timestamp()} file removed; waiting...`);
      }
      return;
    }
    if (exists && (curr.mtimeMs !== prev.mtimeMs || curr.size !== prev.size)) {
      schedule();
    }
  });

  let server: ReturnType<typeof startPreviewServer> | undefined;
  if (options.serve) {
    server = startPreviewServer(outputPath, port, (actualPort) => {
      console.log(`Serving ${outputPath} at http://localhost:${actualPort}/`);
    });
  }

  process.on("SIGINT", () => {
    unwatchFile(inputPath);
    if (server !== undefined) server.close();
    console.log("\nStopped watching.");
    process.exit(0);
  });
}

main().catch((err) => {
  console.error(`md2html: unexpected error: ${(err as Error).message}`);
  process.exitCode = 1;
});
