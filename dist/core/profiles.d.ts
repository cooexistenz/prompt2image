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
export declare const PROFILES: Record<ProfileName, RenderOptions>;
export declare function isProfileName(v: string): v is ProfileName;
