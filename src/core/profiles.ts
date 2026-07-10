/**
 * Render profiles: per-target presets whose page geometry matches how each
 * consumer resamples and bills images.
 *
 *  - claude: 5x8 cells, pages ≤1568x728px. Anthropic fits images within a
 *    1568px long edge AND ~1.15MP before billing ~px/750, so this page shape
 *    reaches the vision encoder unresampled at maximum character density.
 *  - openai: 8x16 cells (GPT-class models resample harder; 5px glyphs blur),
 *    pages ≤1528x768px — a clean 48x24 grid of the 32px billing patches used
 *    by GPT-5.2+ (also exactly 6 tiles under the legacy 512px tile billing).
 *  - gemini: 8x16 cells, 768x768px pages = exactly one 258-token tile.
 *  - ocr: 8x16 cells at 2x scale with padding and line gaps — tuned for
 *    Tesseract/EasyOCR/PaddleOCR rather than token minimality.
 */
import type { RenderOptions } from './render.js';

export type ProfileName = 'claude' | 'openai' | 'gemini' | 'ocr';

export const PROFILES: Record<ProfileName, RenderOptions> = {
  claude: {
    atlas: 'dense',
    scale: 1,
    maxCols: 312, // 2*4 + 312*5 = 1568px, the exact long-edge bound
    maxHeightPx: 728, // 1568*728 ≈ 1.14MP, under the ~1.15MP area bound
    reflow: true,
    banner: true,
    background: 'white',
    padX: 4,
    padY: 4,
    lineGap: 0,
  },
  openai: {
    atlas: 'large',
    scale: 1,
    maxCols: 190, // 2*4 + 190*8 = 1528px → 3 tiles wide
    maxHeightPx: 768, // short side ≤768 avoids the detail=high downscale
    reflow: true,
    banner: true,
    background: 'white',
    padX: 4,
    padY: 4,
    lineGap: 0,
  },
  gemini: {
    atlas: 'large',
    scale: 1,
    maxCols: 95, // 2*4 + 95*8 = 768px → single tile per page
    maxHeightPx: 768,
    reflow: true,
    banner: true,
    background: 'white',
    padX: 4,
    padY: 4,
    lineGap: 0,
  },
  ocr: {
    atlas: 'large',
    scale: 2,
    maxCols: 100,
    maxHeightPx: 4096,
    reflow: false, // real line breaks; OCR engines have no ↵ convention
    banner: false,
    background: 'white',
    padX: 24,
    padY: 24,
    lineGap: 8,
  },
};

export function isProfileName(v: string): v is ProfileName {
  return v === 'claude' || v === 'openai' || v === 'gemini' || v === 'ocr';
}
