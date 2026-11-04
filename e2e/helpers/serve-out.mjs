// QA scratch server for the static export. Serves out/ on the given port (default 3100)
// so e2e runs never share the real repo's :3000 dev server, and so one built app is
// reused across a run. Maps /settings to settings.html, the way Pages does (no trailingSlash).
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";

const ROOT = join(process.cwd(), "out");
const port = Number(process.argv[2] ?? 3100);
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".txt": "text/plain", ".woff2": "font/woff2", ".ico": "image/x-icon", ".m4a": "audio/mp4" };

createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
  const safe = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  const candidates = [join(ROOT, safe), join(ROOT, safe, "index.html"), join(ROOT, `${safe}.html`)];
  const hit = candidates.find((p) => existsSync(p) && statSync(p).isFile());
  if (!hit) {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
    return;
  }
  res.writeHead(200, { "content-type": TYPES[extname(hit)] ?? "application/octet-stream" });
  res.end(readFileSync(hit));
}).listen(port, () => console.log(`serving ${ROOT} on ${port}`));
