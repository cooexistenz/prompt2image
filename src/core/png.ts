/**
 * Minimal PNG encoder: 8-bit grayscale (colorType 0) and grayscale+alpha
 * (colorType 4), filter None, single IDAT, optional iTXt chunk. Node-only by
 * design (zlib.deflateSync); no third-party dependencies.
 */
import { deflateSync } from 'node:zlib';

const PNG_SIGNATURE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(...parts: Uint8Array[]): number {
  let c = 0xffffffff;
  for (const p of parts) {
    for (let i = 0; i < p.length; i++) c = CRC_TABLE[(c ^ p[i]!) & 0xff]! ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function u32(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n >>> 0);
  return b;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const out = new Uint8Array(12 + data.length);
  out.set(u32(data.length), 0);
  out.set(typeBytes, 4);
  out.set(data, 8);
  out.set(u32(crc32(typeBytes, data)), 8 + data.length);
  return out;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

function ihdr(width: number, height: number, colorType: number): Uint8Array {
  const d = new Uint8Array(13);
  d.set(u32(width), 0);
  d.set(u32(height), 4);
  d[8] = 8; // bit depth
  d[9] = colorType;
  return d;
}

/** Prepend the per-scanline filter byte (0 = None) required by PNG. */
function addFilterBytes(pixels: Uint8Array, width: number, height: number, bpp: number): Uint8Array {
  const stride = width * bpp;
  const raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw.set(pixels.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }
  return raw;
}

/** iTXt chunk: keyword + UTF-8 text, uncompressed. */
function itxtChunk(keyword: string, text: string): Uint8Array {
  const enc = new TextEncoder();
  const kw = enc.encode(keyword);
  const body = enc.encode(text);
  // keyword \0 compressionFlag(0) compressionMethod(0) langTag \0 translatedKw \0 text
  const data = new Uint8Array(kw.length + 5 + body.length);
  data.set(kw, 0);
  data.set(body, kw.length + 5);
  return chunk('iTXt', data);
}

export interface PngOptions {
  /** Embed the original text losslessly as an iTXt metadata chunk. */
  readonly embeddedText?: { keyword: string; text: string };
}

export function encodeGrayPng(pixels: Uint8Array, width: number, height: number, opts: PngOptions = {}): Uint8Array {
  if (pixels.length !== width * height) {
    throw new Error(`encodeGrayPng: ${pixels.length} bytes != ${width}x${height}`);
  }
  const idat = deflateSync(addFilterBytes(pixels, width, height, 1));
  const parts = [PNG_SIGNATURE, chunk('IHDR', ihdr(width, height, 0))];
  if (opts.embeddedText) parts.push(itxtChunk(opts.embeddedText.keyword, opts.embeddedText.text));
  parts.push(chunk('IDAT', idat), chunk('IEND', new Uint8Array(0)));
  return concat(parts);
}

/** Gray+alpha, interleaved [g, a] per pixel — used for transparent background output. */
export function encodeGrayAlphaPng(
  pixels: Uint8Array,
  width: number,
  height: number,
  opts: PngOptions = {},
): Uint8Array {
  if (pixels.length !== width * height * 2) {
    throw new Error(`encodeGrayAlphaPng: ${pixels.length} bytes != ${width}x${height}x2`);
  }
  const idat = deflateSync(addFilterBytes(pixels, width, height, 2));
  const parts = [PNG_SIGNATURE, chunk('IHDR', ihdr(width, height, 4))];
  if (opts.embeddedText) parts.push(itxtChunk(opts.embeddedText.keyword, opts.embeddedText.text));
  parts.push(chunk('IDAT', idat), chunk('IEND', new Uint8Array(0)));
  return concat(parts);
}
