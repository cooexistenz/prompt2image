/**
 * Core renderer: text → one or more black-on-white (or transparent) PNG pages.
 * Layout is a fixed character grid — each codepoint occupies one atlas cell,
 * scaled by an integer factor. Pages are sized to stay under provider resample
 * caps so every billed pixel actually reaches the vision encoder.
 */
import { getAtlas, type Atlas, type AtlasName } from './atlas.js';
import { encodeGrayAlphaPng, encodeGrayPng, type PngOptions } from './png.js';
import { NEWLINE_MARK, reflow } from './reflow.js';
import { contentCols, minifyText, wrapLines } from './wrap.js';

export interface RenderOptions {
  /** Which glyph atlas to use. dense = 5x8 (vision models), large = 8x16 (OCR engines). */
  atlas?: AtlasName;
  /** Integer pixel scale per glyph pixel. */
  scale?: number;
  /** Wrap width cap, in character cells. Actual width shrinks to the content. */
  maxCols?: number;
  /** Never shrink below this many columns (keeps the banner legible). */
  minCols?: number;
  /** Page height cap in pixels; content beyond it flows to the next page. */
  maxHeightPx?: number;
  /** Hard cap on page count; exceeding it throws PageLimitError. */
  maxPages?: number;
  /** Pack hard newlines into ↵-marked full-width rows (token-optimal for dense text). */
  reflow?: boolean;
  /** Draw a one-line header telling the reader how to interpret the page. */
  banner?: boolean;
  /** Custom banner wording. Default: "user prompt" plus the ↵ legend when
   *  reflow is active and a page counter on multi-page renders. */
  bannerText?: string;
  /** Opaque white or alpha-transparent background. */
  background?: 'white' | 'transparent';
  /** Horizontal / vertical page padding in pixels. */
  padX?: number;
  padY?: number;
  /** Extra blank pixels between text rows (helps classic OCR engines). */
  lineGap?: number;
  /** Embed the exact original prompt as a PNG iTXt chunk in page 1 (lossless recovery). */
  embedOriginal?: boolean;
}

export interface RenderedPage {
  readonly png: Uint8Array;
  readonly width: number;
  readonly height: number;
}

export interface RenderResult {
  readonly pages: RenderedPage[];
  /** Total pixel area across pages (drives image-token cost). */
  readonly pixels: number;
  /** Total encoded PNG bytes. */
  readonly bytes: number;
  /** Codepoints not covered by the atlas, rendered as blank cells. */
  readonly droppedChars: number;
  /** Up to 8 distinct dropped characters, for the report. */
  readonly droppedSample: string[];
  /** Whether reflow was applied. */
  readonly reflowed: boolean;
}

export class PageLimitError extends Error {
  constructor(
    readonly pagesNeeded: number,
    readonly maxPages: number,
  ) {
    super(`prompt needs ${pagesNeeded} pages but maxPages is ${maxPages}`);
    this.name = 'PageLimitError';
  }
}

const DEFAULTS: Required<Omit<RenderOptions, 'embedOriginal' | 'bannerText'>> & {
  embedOriginal: boolean;
  bannerText: string | undefined;
} = {
  atlas: 'dense',
  scale: 1,
  maxCols: 312,
  minCols: 40,
  maxHeightPx: 728,
  maxPages: 8,
  reflow: true,
  banner: true,
  bannerText: undefined,
  background: 'white',
  padX: 4,
  padY: 4,
  lineGap: 0,
  embedOriginal: false,
};

function defaultBannerText(page: number, total: number, reflowed: boolean, custom?: string): string {
  const parts = [custom !== undefined ? custom : 'user prompt'];
  if (custom === undefined && reflowed) parts.push(`${NEWLINE_MARK} = line break`);
  if (total > 1) parts.push(`page ${page}/${total}`);
  return parts.join('  |  ');
}

/** Blit one glyph into the grayscale framebuffer at pixel (x0, y0). */
function blit(fb: Uint8Array, fbW: number, atlas: Atlas, off: number, x0: number, y0: number, scale: number): void {
  for (let gy = 0; gy < atlas.cellH; gy++) {
    for (let gx = 0; gx < atlas.cellW; gx++) {
      if (!atlas.pixelAt(off, gx, gy)) continue;
      for (let sy = 0; sy < scale; sy++) {
        const row = (y0 + gy * scale + sy) * fbW;
        for (let sx = 0; sx < scale; sx++) {
          fb[row + x0 + gx * scale + sx] = 0;
        }
      }
    }
  }
}

export function renderText(text: string, options: RenderOptions = {}): RenderResult {
  const opt = { ...DEFAULTS, ...options };
  if (text.length === 0) throw new Error('empty text');
  const atlas = getAtlas(opt.atlas);
  const scale = Math.max(1, Math.floor(opt.scale));

  let source = text;
  let reflowed = false;
  if (opt.reflow) {
    const packed = reflow(text);
    if (packed !== null) {
      source = packed;
      reflowed = true;
    } else {
      source = minifyText(text);
    }
  } else {
    source = minifyText(text);
  }

  const cols = Math.max(opt.minCols, contentCols(source, Math.max(1, opt.maxCols)));
  const lines = wrapLines(source, cols);

  const cellW = atlas.cellW * scale;
  const cellH = atlas.cellH * scale + opt.lineGap;
  const bannerRows = opt.banner ? atlas.cellH * scale + opt.lineGap + 3 : 0; // banner line + 1px rule + 2px gap
  const linesPerPage = Math.max(1, Math.floor((opt.maxHeightPx - 2 * opt.padY - bannerRows) / cellH));
  const totalPages = Math.max(1, Math.ceil(lines.length / linesPerPage));
  if (totalPages > opt.maxPages) throw new PageLimitError(totalPages, opt.maxPages);

  const width = 2 * opt.padX + cols * cellW;
  const pages: RenderedPage[] = [];
  let pixels = 0;
  let bytes = 0;
  let droppedChars = 0;
  const droppedSet = new Set<string>();

  for (let p = 0; p < totalPages; p++) {
    const pageLines = lines.slice(p * linesPerPage, (p + 1) * linesPerPage);
    const height = 2 * opt.padY + bannerRows + pageLines.length * cellH;
    const fb = new Uint8Array(width * height).fill(255);

    let y = opt.padY;
    if (opt.banner) {
      const label = defaultBannerText(p + 1, totalPages, reflowed, opt.bannerText);
      let x = opt.padX;
      for (const ch of label) {
        if (x + cellW > width - opt.padX) break;
        const off = atlas.offsetOf(ch.codePointAt(0)!);
        if (off >= 0) blit(fb, width, atlas, off, x, y, scale);
        x += cellW;
      }
      const ruleY = y + atlas.cellH * scale + opt.lineGap + 1;
      for (let rx = opt.padX; rx < width - opt.padX; rx++) fb[ruleY * width + rx] = 140;
      y += bannerRows;
    }

    for (const line of pageLines) {
      let x = opt.padX;
      let col = 0;
      for (const ch of line) {
        if (col >= cols) break;
        const off = atlas.offsetOf(ch.codePointAt(0)!);
        if (off >= 0) {
          blit(fb, width, atlas, off, x, y, scale);
        } else {
          droppedChars++;
          if (droppedSet.size < 8) droppedSet.add(ch);
        }
        x += cellW;
        col++;
      }
      y += cellH;
    }

    const pngOpts: PngOptions =
      opt.embedOriginal && p === 0 ? { embeddedText: { keyword: 'prompt', text } } : {};
    let png: Uint8Array;
    if (opt.background === 'transparent') {
      // Ink stays black; alpha carries the coverage (background fully clear).
      const ga = new Uint8Array(width * height * 2);
      for (let i = 0; i < fb.length; i++) {
        ga[i * 2] = 0;
        ga[i * 2 + 1] = 255 - fb[i]!;
      }
      png = encodeGrayAlphaPng(ga, width, height, pngOpts);
    } else {
      png = encodeGrayPng(fb, width, height, pngOpts);
    }
    pages.push({ png, width, height });
    pixels += width * height;
    bytes += png.length;
  }

  return { pages, pixels, bytes, droppedChars, droppedSample: [...droppedSet], reflowed };
}
