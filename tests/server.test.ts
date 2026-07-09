import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { server } from '../src/server.js';

let base = '';

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe('REST API', () => {
  it('GET /healthz responds ok', async () => {
    const res = await fetch(`${base}/healthz`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('POST /render returns a PNG with report headers when Accept: image/png', async () => {
    const res = await fetch(`${base}/render`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'image/png' },
      body: JSON.stringify({ prompt: 'Render me as pixels, please.' }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(Number(res.headers.get('x-p2i-text-tokens'))).toBeGreaterThan(0);
    expect(Number(res.headers.get('x-p2i-image-tokens-anthropic'))).toBeGreaterThan(0);
    const body = new Uint8Array(await res.arrayBuffer());
    expect([...body.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it('POST /render returns JSON pages + report by default', async () => {
    const res = await fetch(`${base}/render`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'json mode', profile: 'gemini' }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { pages: { png: string; width: number }[]; report: { profile: string } };
    expect(data.pages.length).toBe(1);
    expect(data.report.profile).toBe('gemini');
    expect(Buffer.from(data.pages[0]!.png, 'base64').subarray(0, 4)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    );
  });

  it('rejects bad input with 400s', async () => {
    const noPrompt = await fetch(`${base}/render`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(noPrompt.status).toBe(400);

    const badProfile = await fetch(`${base}/render`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'x', profile: 'nope' }),
    });
    expect(badProfile.status).toBe(400);

    const badOption = await fetch(`${base}/render`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'x', options: { evil: true } }),
    });
    expect(badOption.status).toBe(400);
  });

  it('422s when a multi-page render is requested as a single PNG', async () => {
    const res = await fetch(`${base}/render`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'image/png' },
      body: JSON.stringify({
        prompt: 'long '.repeat(3000),
        options: { maxHeightPx: 200 },
      }),
    });
    expect(res.status).toBe(422);
  });
});
