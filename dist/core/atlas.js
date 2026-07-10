/**
 * Glyph atlas lookup over the generated bitmap data. Two atlases ship:
 *  - dense: 5x8 cells, minimal pixel area per character (vision-model profiles)
 *  - large: 8x16 cells, wider Unicode coverage (OCR-engine and readable profiles)
 * Bitmaps are 1-bit, MSB-first, one byte per row (both cells are ≤8px wide).
 */
import { DENSE_ATLAS_DATA, LARGE_ATLAS_DATA } from './atlas-data.js';
export class Atlas {
    cellW;
    cellH;
    bytesPerRow;
    bitmaps;
    index;
    constructor(data) {
        this.cellW = data.cellW;
        this.cellH = data.cellH;
        this.bytesPerRow = Math.ceil(data.cellW / 8);
        this.bitmaps = new Uint8Array(Buffer.from(data.bitmapsBase64, 'base64'));
        this.index = new Map(data.codepoints.map((cp, i) => [cp, i]));
    }
    has(codepoint) {
        return this.index.has(codepoint);
    }
    /** Byte offset of the glyph's first bitmap row, or -1 when not covered. */
    offsetOf(codepoint) {
        const i = this.index.get(codepoint);
        return i === undefined ? -1 : i * this.cellH * this.bytesPerRow;
    }
    /** Whether pixel (x, y) of the glyph at byte offset `off` is inked. */
    pixelAt(off, x, y) {
        const byte = this.bitmaps[off + y * this.bytesPerRow + (x >> 3)];
        return ((byte >> (7 - (x & 7))) & 1) === 1;
    }
}
export const denseAtlas = new Atlas(DENSE_ATLAS_DATA);
export const largeAtlas = new Atlas(LARGE_ATLAS_DATA);
export function getAtlas(name) {
    return name === 'dense' ? denseAtlas : largeAtlas;
}
