/**
 * Glyph atlas lookup over the generated bitmap data. Two atlases ship:
 *  - dense: 5x8 cells, minimal pixel area per character (vision-model profiles)
 *  - large: 8x16 cells, wider Unicode coverage (OCR-engine and readable profiles)
 * Bitmaps are 1-bit, MSB-first, one byte per row (both cells are ≤8px wide).
 */
import { type AtlasData } from './atlas-data.js';
export declare class Atlas {
    readonly cellW: number;
    readonly cellH: number;
    readonly bytesPerRow: number;
    private readonly bitmaps;
    private readonly index;
    constructor(data: AtlasData);
    has(codepoint: number): boolean;
    /** Byte offset of the glyph's first bitmap row, or -1 when not covered. */
    offsetOf(codepoint: number): number;
    /** Whether pixel (x, y) of the glyph at byte offset `off` is inked. */
    pixelAt(off: number, x: number, y: number): boolean;
}
export declare const denseAtlas: Atlas;
export declare const largeAtlas: Atlas;
export type AtlasName = 'dense' | 'large';
export declare function getAtlas(name: AtlasName): Atlas;
