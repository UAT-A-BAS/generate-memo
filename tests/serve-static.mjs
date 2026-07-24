import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, relative, resolve } from "node:path";

const root = resolve("out");
const port = 3002;
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

async function existingFile(pathname) {
  const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const candidates = extname(relativePath)
    ? [relativePath]
    : [`${relativePath}.html`, join(relativePath, "index.html")];

  for (const candidate of candidates) {
    const absolutePath = resolve(root, candidate);
    const relativeToRoot = relative(root, absolutePath);
    if (relativeToRoot.startsWith("..") || relativeToRoot === "") continue;
    try {
      if ((await stat(absolutePath)).isFile()) return absolutePath;
    } catch {
      // Try the next static-export path.
    }
  }
  return null;
}

createServer(async (request, response) => {
  let pathname = "/";
  try {
    pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
  } catch {
    response.writeHead(400).end("Bad request");
    return;
  }

  const filePath = await existingFile(pathname);
  if (!filePath) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("Not found");
    return;
  }

  response.writeHead(200, {
    "cache-control": "no-store",
    "content-type": contentTypes[extname(filePath)] ?? "application/octet-stream",
  });
  createReadStream(filePath).pipe(response);
}).listen(port, "127.0.0.1");
