/**
 * Core renderer: text → one or more black-on-white (or transparent) PNG pages.
 * Layout is a fixed character grid — each codepoint occupies one atlas cell,
 * scaled by an integer factor. Pages are sized to stay under provider resample
 * caps so every billed pixel actually reaches the vision encoder.
 */
import { type AtlasName } from './atlas.js';
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
export declare class PageLimitError extends Error {
    readonly pagesNeeded: number;
    readonly maxPages: number;
    constructor(pagesNeeded: number, maxPages: number);
}
export declare function renderText(text: string, options?: RenderOptions): RenderResult;
