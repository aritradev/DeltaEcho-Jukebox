import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)));
const DEFAULT_PORT = 5173;
const MAX_FALLBACKS = 10;
let port = Number(process.env.PORT) || DEFAULT_PORT;
let fallbacks = 0;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';
    const filePath = join(root, normalize(pathname).replace(/^([/\\])+/, ''));
    if (!filePath.startsWith(root)) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    const info = await stat(filePath);
    const target = info.isDirectory() ? join(filePath, 'index.html') : filePath;
    const body = await readFile(target);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(target).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
  }
});

server.on('listening', () => {
  console.log(`Earth Information Jukebox running at http://localhost:${port}/`);
});

// If the requested port is busy (another dev server, a stale process), walk
// forward until a free one is found instead of crashing.
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE' && fallbacks < MAX_FALLBACKS) {
    fallbacks += 1;
    const busy = port;
    port += 1;
    console.warn(`Port ${busy} is in use, trying ${port}...`);
    server.listen(port);
    return;
  }
  console.error(`Server error: ${error.message}`);
  process.exitCode = 1;
});

server.listen(port);
