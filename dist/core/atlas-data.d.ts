export interface AtlasData {
    readonly cellW: number;
    readonly cellH: number;
    /** Sorted codepoints; glyph i's bitmap starts at i * cellH * ceil(cellW/8). */
    readonly codepoints: number[];
    readonly bitmapsBase64: string;
}
export declare const DENSE_ATLAS_DATA: AtlasData;
export declare const LARGE_ATLAS_DATA: AtlasData;
