import { readFile, stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, resolve, sep } from 'node:path';
const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

async function readableFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

export function createStaticFileHandler(root: string) {
  const absoluteRoot = resolve(root);
  const indexPath = resolve(absoluteRoot, 'index.html');
  return async (
    request: IncomingMessage,
    response: ServerResponse,
    url: URL,
  ): Promise<boolean> => {
    if (request.method !== 'GET' && request.method !== 'HEAD') return false;
    let pathname: string;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      return false;
    }
    const requested = resolve(absoluteRoot, `.${pathname}`);
    if (requested !== absoluteRoot && !requested.startsWith(`${absoluteRoot}${sep}`)) {
      return false;
    }
    const path = (await readableFile(requested)) ? requested : indexPath;
    if (!(await readableFile(path))) return false;
    const extension = extname(path).toLowerCase();
    const immutable = pathname.startsWith('/assets/') && path === requested;
    response.writeHead(200, {
      'Content-Type': CONTENT_TYPES[extension] ?? 'application/octet-stream',
      'Cache-Control': immutable
        ? 'public, max-age=31536000, immutable'
        : 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    if (request.method === 'HEAD') {
      response.end();
    } else {
      response.end(await readFile(path));
    }
    return true;
  };
}
