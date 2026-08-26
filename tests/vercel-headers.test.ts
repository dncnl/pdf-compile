import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

/**
 * Vercel does not read public/_headers (that's a Netlify/Cloudflare Pages
 * convention) — it needs its own vercel.json "headers" rule, or none of the
 * real security headers described in public/_headers ever reach the browser
 * on a Vercel deployment. This asserts vercel.json carries the same policy.
 */

const VERCEL_JSON_PATH = fileURLToPath(new URL('../vercel.json', import.meta.url));

const REQUIRED_HEADERS: Record<string, string> = {
  'Content-Security-Policy':
    "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' blob: data:; connect-src 'self' blob: data:; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
};

describe('vercel.json security headers', () => {
  it('applies the full security-header policy to every route', async () => {
    const raw = await readFile(VERCEL_JSON_PATH, 'utf-8');
    const config = JSON.parse(raw) as {
      headers?: { source: string; headers: { key: string; value: string }[] }[];
    };

    const rule = config.headers?.find((entry) => entry.source === '/(.*)');
    expect(rule, 'vercel.json must have a headers rule matching every route').toBeDefined();

    const applied = Object.fromEntries(rule!.headers.map(({ key, value }) => [key, value]));

    for (const [key, value] of Object.entries(REQUIRED_HEADERS)) {
      expect(applied[key]).toBe(value);
    }
  });
});
