export interface PngOptions {
    /** Embed the original text losslessly as an iTXt metadata chunk. */
    readonly embeddedText?: {
        keyword: string;
        text: string;
    };
}
export declare function encodeGrayPng(pixels: Uint8Array, width: number, height: number, opts?: PngOptions): Uint8Array;
/** Gray+alpha, interleaved [g, a] per pixel — used for transparent background output. */
export declare function encodeGrayAlphaPng(pixels: Uint8Array, width: number, height: number, opts?: PngOptions): Uint8Array;
