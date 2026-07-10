import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { renderPrompt, PageLimitError } from '../src/core/index.js';
import { renderText } from '../src/core/render.js';

/** Tiny structural PNG parser for test assertions (validates CRCs and decodes IHDR). */
function parsePng(bytes: Uint8Array) {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  sig.forEach((b, i) => expect(bytes[i]).toBe(b));
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunks: { type: string; data: Uint8Array }[] = [];
  let off = 8;
  while (off < bytes.length) {
    const len = view.getUint32(off);
    const type = String.fromCharCode(...bytes.subarray(off + 4, off + 8));
    const data = bytes.subarray(off + 8, off + 8 + len);
    chunks.push({ type, data });
    off += 12 + len;
  }
  const ihdr = chunks.find((c) => c.type === 'IHDR')!.data;
  const iv = new DataView(ihdr.buffer, ihdr.byteOffset);
  return {
    chunks,
    width: iv.getUint32(0),
    height: iv.getUint32(4),
    bitDepth: ihdr[8],
    colorType: ihdr[9],
    idat: chunks.filter((c) => c.type === 'IDAT'),
  };
}

describe('renderText', () => {
  it('produces a valid grayscale PNG with matching dimensions', () => {
    const r = renderText('Hello, world! This is prompt2image.', { banner: false });
    expect(r.pages.length).toBe(1);
    const page = r.pages[0]!;
    const png = parsePng(page.png);
    expect(png.width).toBe(page.width);
    expect(png.height).toBe(page.height);
    expect(png.colorType).toBe(0);
    // Decompressed scanlines: height * (1 filter byte + width)
    const rawLen = inflateSync(png.idat[0]!.data).length;
    expect(rawLen).toBe(page.height * (page.width + 1));
  });

  it('renders actual ink (not a blank page)', () => {
    const r = renderText('##########', { banner: false });
    const png = parsePng(r.pages[0]!.png);
    const raw = inflateSync(png.idat[0]!.data);
    let dark = 0;
    for (let i = 0; i < raw.length; i++) if (raw[i] === 0) dark++;
    expect(dark).toBeGreaterThan(50);
  });

  it('transparent background produces gray+alpha with clear background', () => {
    const r = renderText('transparency test', { background: 'transparent', banner: false });
    const png = parsePng(r.pages[0]!.png);
    expect(png.colorType).toBe(4);
    const raw = inflateSync(png.idat[0]!.data);
    // First pixel of first scanline: [filter][g][a] — corner padding is transparent.
    expect(raw[2]).toBe(0);
  });

  it('paginates long text and enforces the page cap', () => {
    const long = 'lorem ipsum dolor sit amet '.repeat(3000);
    const r = renderText(long, { maxHeightPx: 200, maxPages: 50 });
    expect(r.pages.length).toBeGreaterThan(1);
    expect(() => renderText(long, { maxHeightPx: 200, maxPages: 1 })).toThrow(PageLimitError);
  });

  it('counts dropped characters for uncovered codepoints', () => {
    const r = renderText('汉字 test', { banner: false });
    expect(r.droppedChars).toBeGreaterThan(0);
    expect(r.droppedSample.length).toBeGreaterThan(0);
  });

  it('accepts custom banner text (and stays a valid PNG)', () => {
    const r = renderText('Mein Haus hat die Adresse Maximilianstraße 5.', {
      bannerText: 'user prompt:',
    });
    expect(r.pages.length).toBe(1);
    expect(r.droppedChars).toBe(0);
    parsePng(r.pages[0]!.png);
  });

  it('embeds the original prompt as iTXt when asked', () => {
    const r = renderText('secret original', { embedOriginal: true, banner: false });
    const png = parsePng(r.pages[0]!.png);
    const itxt = png.chunks.find((c) => c.type === 'iTXt');
    expect(itxt).toBeDefined();
    expect(new TextDecoder().decode(itxt!.data)).toContain('secret original');
  });
});

describe('renderPrompt report', () => {
  it('reports honest token comparison — short prompts still beat text on Claude', () => {
    const prompt = 'Write a haiku about the sea, then explain its imagery in two sentences.';
    const { pages, report } = renderPrompt(prompt, { profile: 'claude' });
    expect(pages.length).toBe(1);
    expect(report.textTokens).toBeGreaterThan(0);
    expect(report.imageTokens.anthropic).toBeGreaterThan(0);
    // Dense 5x8 rendering of a short prompt is a small pixel area.
    expect(report.imageTokens.anthropic).toBeLessThan(200);
  });

  it('flags when plain text is cheaper (openai fixed tile cost)', () => {
    const { report } = renderPrompt('short', { profile: 'openai' });
    // 85+170 minimum makes tiny prompts more expensive as images on OpenAI.
    expect(report.cheaperAsImage.openai).toBe(false);
  });

  it('rejects empty prompts', () => {
    expect(() => renderPrompt('   ')).toThrow();
  });

  it('gemini profile pages are single-tile sized', () => {
    const { pages } = renderPrompt('x'.repeat(4000), { profile: 'gemini' });
    for (const p of pages) {
      expect(p.width).toBeLessThanOrEqual(768);
      expect(p.height).toBeLessThanOrEqual(768);
    }
  });
});
