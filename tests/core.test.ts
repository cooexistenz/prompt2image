import { describe, expect, it } from 'vitest';
import { denseAtlas, largeAtlas } from '../src/core/atlas.js';
import { dereflow, reflow, NEWLINE_MARK } from '../src/core/reflow.js';
import { expandTabs, minifyText, wrapLines, contentCols } from '../src/core/wrap.js';
import {
  anthropicImageTokens,
  estimateTextTokens,
  geminiImageTokens,
  openaiImageTokens,
  openaiTileImageTokens,
} from '../src/core/tokens.js';

describe('atlas', () => {
  it('covers printable ASCII in both sizes', () => {
    for (let cp = 0x20; cp <= 0x7e; cp++) {
      expect(denseAtlas.has(cp), `dense U+${cp.toString(16)}`).toBe(true);
      expect(largeAtlas.has(cp), `large U+${cp.toString(16)}`).toBe(true);
    }
  });

  it('covers German umlauts and the marker glyphs', () => {
    for (const ch of 'äöüÄÖÜß€') {
      expect(denseAtlas.has(ch.codePointAt(0)!), ch).toBe(true);
    }
    expect(denseAtlas.has(0x21b5)).toBe(true); // ↵
    expect(denseAtlas.has(0x2192)).toBe(true); // →
    expect(largeAtlas.has(0x21b5)).toBe(true);
    expect(largeAtlas.has(0x2192)).toBe(true);
  });

  it('renders "A" with some ink', () => {
    const off = denseAtlas.offsetOf(0x41);
    expect(off).toBeGreaterThanOrEqual(0);
    let inked = 0;
    for (let y = 0; y < denseAtlas.cellH; y++) {
      for (let x = 0; x < denseAtlas.cellW; x++) {
        if (denseAtlas.pixelAt(off, x, y)) inked++;
      }
    }
    expect(inked).toBeGreaterThan(4);
  });
});

describe('wrap', () => {
  it('expands tabs to visible markers at 4-column stops', () => {
    expect(expandTabs('a\tb')).toBe('a→  b');
    expect(expandTabs('\tx')).toBe('→   x');
  });

  it('wraps at the column limit by codepoint', () => {
    const lines = wrapLines('abcdefghij', 4);
    expect(lines).toEqual(['abcd', 'efgh', 'ij']);
  });

  it('preserves empty lines and caps blank runs via minify', () => {
    expect(minifyText('a  \nb\n\n\n\n\nc')).toBe('a\nb\n\n\nc');
  });

  it('measures content width capped at maxCols', () => {
    expect(contentCols('short\nmuch-longer-line', 100)).toBe(16);
    expect(contentCols('x'.repeat(500), 100)).toBe(100);
  });
});

describe('reflow', () => {
  it('round-trips: dereflow(reflow(x)) === minified x', () => {
    const src = 'first line\nsecond\tline\n\nfourth line with trailing   \nlast';
    const packed = reflow(src);
    expect(packed).not.toBeNull();
    expect(packed).toContain(NEWLINE_MARK);
    expect(dereflow(packed!)).toBe(minifyText(src).split('\n').map(expandTabs).join('\n'));
  });

  it('bails when the source already contains the sentinel', () => {
    expect(reflow(`already has ${NEWLINE_MARK} marker`)).toBeNull();
  });
});

describe('token estimators', () => {
  it('anthropic: bills px/750, fits to 2576px long edge, caps at 4784', () => {
    expect(anthropicImageTokens(750, 100)).toBe(100);
    // 1568x728 is under every bound → billed at full pixel count
    expect(anthropicImageTokens(1568, 728)).toBe(Math.ceil((1568 * 728) / 750));
    // Oversized image gets scaled to the 2576px edge; never exceeds the cap
    expect(anthropicImageTokens(3136, 1456)).toBeLessThanOrEqual(4784);
    expect(anthropicImageTokens(6000, 6000)).toBe(4784);
  });

  it('openai (GPT-5.2+): 32px patches at multiplier 1.0, 1536-patch budget', () => {
    expect(openaiImageTokens(512, 512)).toBe(16 * 16);
    expect(openaiImageTokens(908, 27)).toBe(29); // dense strip: 29x1 patches
    expect(openaiImageTokens(1528, 768)).toBe(48 * 24);
    expect(openaiImageTokens(4096, 4096)).toBeLessThanOrEqual(1536);
    // mini-class multiplier
    expect(openaiImageTokens(512, 512, 1.62)).toBe(Math.ceil(256 * 1.62));
  });

  it('openai legacy tile formula (GPT-4o/4.1/5.1 class)', () => {
    expect(openaiTileImageTokens(512, 512)).toBe(85 + 170);
    expect(openaiTileImageTokens(1528, 768)).toBe(85 + 170 * 6);
  });

  it('gemini: 258 per 768px tile, small images one tile', () => {
    expect(geminiImageTokens(300, 200)).toBe(258);
    expect(geminiImageTokens(768, 768)).toBe(258);
    expect(geminiImageTokens(1536, 768)).toBe(516);
  });

  it('text estimate lands in a plausible range for English prose', () => {
    const text = 'The quick brown fox jumps over the lazy dog near the riverbank every morning.';
    const t = estimateTextTokens(text);
    expect(t).toBeGreaterThan(10);
    expect(t).toBeLessThan(30);
  });
});
