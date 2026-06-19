import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { IncomingMessage, ServerResponse } from 'node:http';

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => { raw += String(chunk); });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : undefined); }
      catch { resolve(undefined); }
    });
    req.on('error', reject);
  });
}

function localApi(): Plugin {
  return {
    name: 'local-api',
    configureServer(server) {
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next) => {
        const url = req.url ?? '/';
        if (!url.startsWith('/api/')) return next();

        const parsed = new URL(url, 'http://localhost');
        const query: Record<string, string> = {};
        parsed.searchParams.forEach((val, key) => { query[key] = val; });

        const body = req.method === 'POST' ? await readJsonBody(req) : undefined;
        const vReq = Object.assign(req, { query, cookies: {}, body }) as unknown as VercelRequest;

        let resolved = false;
        const vRes = new Proxy(res as unknown as VercelResponse, {
          get(target, prop) {
            if (prop === 'status') {
              return (code: number) => { res.statusCode = code; return vRes; };
            }
            if (prop === 'json') {
              return (data: unknown) => {
                if (!resolved) {
                  resolved = true;
                  res.setHeader('Content-Type', 'application/json');
                  res.setHeader('Access-Control-Allow-Origin', '*');
                  res.end(JSON.stringify(data));
                }
                return vRes;
              };
            }
            if (prop === 'send') {
              return (body: unknown) => { if (!resolved) { resolved = true; res.end(String(body)); } return vRes; };
            }
            return Reflect.get(target, prop, target);
          },
        });

        try {
          const apiSegment = parsed.pathname.replace(/^\/api\//, '');
          const mod = await server.ssrLoadModule(`/api/${apiSegment}.ts`);
          await (mod.default as (req: VercelRequest, res: VercelResponse) => Promise<void>)(vReq, vRes);
        } catch (err) {
          if (!resolved) {
            resolved = true;
            res.statusCode = 502;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'api-error' }));
          }
          console.error('[local-api]', err);
          next(err);
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), localApi()],
  test: {
    environment: 'node',
    environmentMatchGlobs: [
      ['src/**/*.test.tsx', 'jsdom'],
    ],
  },
});
