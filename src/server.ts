/**
 * Stateless REST service.
 *
 *   POST /render     {prompt, profile?, options?} → PNG (Accept: image/png)
 *                    or JSON {pages: [base64...], report} (default)
 *   GET  /healthz    liveness probe
 *   GET  /           landing page
 *   GET  /app        interactive dashboard
 *
 * Privacy: prompts are rendered entirely in memory and never logged or
 * persisted — access logs carry byte counts and timings only.
 */
import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';
import {
  PageLimitError,
  isProfileName,
  renderPrompt,
  type RenderPromptOptions,
} from './core/index.js';

const PORT = Number(process.env.PORT ?? 8018);
const MAX_BODY_BYTES = Number(process.env.P2I_MAX_BODY_BYTES ?? 1_048_576);
const RATE_LIMIT_PER_MIN = Number(process.env.P2I_RATE_LIMIT ?? 120);
const CORS_ORIGIN = process.env.P2I_CORS_ORIGIN ?? '';

// -- static pages (read once; the pages are self-contained single files) -----
const webDir = new URL('../web/', import.meta.url);
function loadPage(name: string): string {
  return readFileSync(fileURLToPath(new URL(name, webDir)), 'utf8');
}
let landingHtml = '';
let appHtml = '';
try {
  landingHtml = loadPage('index.html');
  appHtml = loadPage('app.html');
} catch {
  // Pages are optional — the API works headless.
}

// -- naive fixed-window rate limiter (in-memory, per IP) ---------------------
const windowCounts = new Map<string, { windowStart: number; count: number }>();
function rateLimited(ip: string): boolean {
  if (RATE_LIMIT_PER_MIN <= 0) return false;
  const now = Date.now();
  const entry = windowCounts.get(ip);
  if (!entry || now - entry.windowStart >= 60_000) {
    windowCounts.set(ip, { windowStart: now, count: 1 });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT_PER_MIN;
}
setInterval(() => {
  const cutoff = Date.now() - 120_000;
  for (const [ip, e] of windowCounts) if (e.windowStart < cutoff) windowCounts.delete(ip);
}, 60_000).unref();

function json(res: ServerResponse, status: number, body: unknown): void {
  const data = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(data);
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('request body too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

interface RenderRequestBody {
  prompt?: unknown;
  profile?: unknown;
  options?: Record<string, unknown>;
}

const ALLOWED_OPTIONS = new Set([
  'atlas',
  'scale',
  'maxCols',
  'maxHeightPx',
  'maxPages',
  'reflow',
  'banner',
  'bannerText',
  'background',
  'padX',
  'padY',
  'lineGap',
  'embedOriginal',
]);

function parseRenderOptions(body: RenderRequestBody): { prompt: string; opts: RenderPromptOptions } {
  if (typeof body.prompt !== 'string' || body.prompt.trim().length === 0) {
    throw Object.assign(new Error('"prompt" must be a non-empty string'), { status: 400 });
  }
  const opts: RenderPromptOptions = {};
  if (body.profile !== undefined) {
    if (typeof body.profile !== 'string' || !isProfileName(body.profile)) {
      throw Object.assign(new Error('"profile" must be one of claude|openai|gemini|ocr'), { status: 400 });
    }
    opts.profile = body.profile;
  }
  if (body.options && typeof body.options === 'object') {
    for (const [k, v] of Object.entries(body.options)) {
      if (!ALLOWED_OPTIONS.has(k)) {
        throw Object.assign(new Error(`unknown option "${k}"`), { status: 400 });
      }
      if (k === 'bannerText' && (typeof v !== 'string' || v.length > 200)) {
        throw Object.assign(new Error('"bannerText" must be a string of at most 200 characters'), { status: 400 });
      }
      (opts as Record<string, unknown>)[k] = v;
    }
  }
  return { prompt: body.prompt, opts };
}

async function handleRender(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const raw = await readBody(req);
  let body: RenderRequestBody;
  try {
    body = JSON.parse(raw.toString('utf8')) as RenderRequestBody;
  } catch {
    return json(res, 400, { error: 'body must be valid JSON: {"prompt": "..."}' });
  }
  const { prompt, opts } = parseRenderOptions(body);

  const started = performance.now();
  const { pages, report } = renderPrompt(prompt, opts);
  const ms = Math.round(performance.now() - started);

  const wantsPng = (req.headers.accept ?? '').includes('image/png');
  const reportHeaders = {
    'x-p2i-pages': String(report.pages),
    'x-p2i-text-tokens': String(report.textTokens),
    'x-p2i-image-tokens-anthropic': String(report.imageTokens.anthropic),
    'x-p2i-image-tokens-openai': String(report.imageTokens.openai),
    'x-p2i-image-tokens-gemini': String(report.imageTokens.gemini),
    'x-p2i-dropped-chars': String(report.droppedChars),
    'x-p2i-render-ms': String(ms),
  };

  if (wantsPng) {
    if (pages.length > 1) {
      return json(res, 422, {
        error: `prompt renders to ${pages.length} pages; request JSON (Accept: application/json) to receive all pages`,
        pages: pages.length,
      });
    }
    res.writeHead(200, {
      'content-type': 'image/png',
      'content-length': pages[0]!.png.length,
      ...reportHeaders,
    });
    res.end(Buffer.from(pages[0]!.png));
    return;
  }

  res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', ...reportHeaders });
  res.end(
    JSON.stringify({
      pages: pages.map((p) => ({
        width: p.width,
        height: p.height,
        png: Buffer.from(p.png).toString('base64'),
      })),
      report,
    }),
  );
}

export const server = createServer(async (req, res) => {
  const ip = req.socket.remoteAddress ?? 'unknown';
  if (CORS_ORIGIN) {
    res.setHeader('access-control-allow-origin', CORS_ORIGIN);
    res.setHeader('access-control-allow-headers', 'content-type, accept');
    res.setHeader('access-control-allow-methods', 'POST, GET, OPTIONS');
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const url = new URL(req.url ?? '/', 'http://localhost');
  try {
    if (req.method === 'GET' && url.pathname === '/healthz') {
      return json(res, 200, { ok: true });
    }
    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(landingHtml ? 200 : 404, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(landingHtml || 'not found');
    }
    if (req.method === 'GET' && url.pathname === '/app') {
      res.writeHead(appHtml ? 200 : 404, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(appHtml || 'not found');
    }
    if (url.pathname === '/render') {
      if (req.method !== 'POST') {
        return json(res, 405, { error: 'use POST /render with a JSON body {"prompt": "..."}' });
      }
      if (rateLimited(ip)) {
        return json(res, 429, { error: 'rate limit exceeded' });
      }
      return await handleRender(req, res);
    }
    return json(res, 404, { error: 'not found' });
  } catch (err) {
    if (err instanceof PageLimitError) {
      return json(res, 413, { error: err.message, pagesNeeded: err.pagesNeeded, maxPages: err.maxPages });
    }
    const status = (err as { status?: number }).status ?? 500;
    const message = err instanceof Error ? err.message : 'internal error';
    if (status >= 500) {
      // No prompt content in logs — sizes and timings only.
      console.error(`[p2i] render failed: ${message}`);
    }
    return json(res, status, { error: status >= 500 ? 'internal error' : message });
  }
});

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain || process.env.P2I_LISTEN === '1') {
  server.listen(PORT, () => {
    console.log(`prompt2image listening on http://127.0.0.1:${PORT}  (landing: /  dashboard: /app)`);
  });
}
