import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { basename, dirname, resolve, sep } from "node:path";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

/**
 * Serve the generated HTML (and any relative assets next to it) on a local
 * HTTP server. "/" maps to the output file itself. If `port` is busy, the
 * server tries the next few ports; if `port` is 0, the OS picks a free port.
 */
export function startPreviewServer(
  outputPath: string,
  port: number,
  onReady: (actualPort: number) => void
): Server {
  const dir = dirname(outputPath);
  const defaultFile = basename(outputPath);

  const server = createServer((req, res) => {
    let pathname: string;
    try {
      pathname = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
    } catch {
      res.writeHead(400).end("Bad Request");
      return;
    }

    const relative = pathname === "/" ? `/${defaultFile}` : pathname;
    const filePath = resolve(dir, "." + relative);

    if (filePath !== dir && !filePath.startsWith(dir + sep)) {
      res.writeHead(403).end("Forbidden");
      return;
    }

    let body: Buffer;
    try {
      body = readFileSync(filePath);
    } catch {
      res.writeHead(404).end("Not Found");
      return;
    }

    const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME_TYPES[ext] ?? "application/octet-stream" });
    res.end(body);
  });

  listenWithFallback(server, port, onReady);

  return server;
}

export function listenWithFallback(
  server: Server,
  port: number,
  onReady: (actualPort: number) => void
): void {
  const basePort = port;
  const tryListen = (p: number): void => {
    server.once("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE" && p - basePort < 10) {
        tryListen(p + 1);
      } else {
        console.error(`md2html: cannot listen on port ${p}: ${err.message}`);
      }
    });
    server.listen(p, "127.0.0.1", () => {
      const address = server.address() as { port: number } | null;
      onReady(address?.port ?? p);
    });
  };
  tryListen(port);
}
