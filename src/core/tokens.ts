/**
 * Token-cost estimators for the major vision APIs plus a text-side heuristic.
 * These implement each provider's *published* billing rules; they are
 * estimates, not quotes — providers change resampling and pricing. The point
 * is an honest comparison: the tool reports when plain text is cheaper.
 */

export interface ImageTokenEstimates {
  /** Anthropic Claude: ~pixels/750 after fit-within 1568px-long-edge and ~1.15MP. */
  anthropic: number;
  /** OpenAI GPT-4o-class, detail=high: 85 base + 170 per 512px tile after resize. */
  openai: number;
  /** Google Gemini: 258 per 768px tile (single tile when ≤384px both sides). */
  gemini: number;
}

export function anthropicImageTokens(width: number, height: number): number {
  const long = Math.max(width, height);
  const scale = Math.min(1, 1568 / long, Math.sqrt(1_150_000 / (width * height)));
  return Math.ceil((width * scale * (height * scale)) / 750);
}

export function openaiImageTokens(width: number, height: number): number {
  // detail=high: fit within 2048x2048, then scale so the short side is ≤768.
  let w = width;
  let h = height;
  const fit = Math.min(1, 2048 / Math.max(w, h));
  w *= fit;
  h *= fit;
  const shortSide = Math.min(w, h);
  if (shortSide > 768) {
    const s = 768 / shortSide;
    w *= s;
    h *= s;
  }
  const tiles = Math.ceil(w / 512) * Math.ceil(h / 512);
  return 85 + 170 * tiles;
}

export function geminiImageTokens(width: number, height: number): number {
  if (width <= 384 && height <= 384) return 258;
  return Math.ceil(width / 768) * Math.ceil(height / 768) * 258;
}

export function estimateImageTokens(width: number, height: number): ImageTokenEstimates {
  return {
    anthropic: anthropicImageTokens(width, height),
    openai: openaiImageTokens(width, height),
    gemini: geminiImageTokens(width, height),
  };
}

export function sumImageTokens(pages: Array<{ width: number; height: number }>): ImageTokenEstimates {
  const total: ImageTokenEstimates = { anthropic: 0, openai: 0, gemini: 0 };
  for (const p of pages) {
    const t = estimateImageTokens(p.width, p.height);
    total.anthropic += t.anthropic;
    total.openai += t.openai;
    total.gemini += t.gemini;
  }
  return total;
}

/**
 * BPE-ish text token estimate without a tokenizer dependency: one token per
 * ~4.5 characters of each word run (minimum one), one per symbol, newlines
 * grouped. Within ~±20% of cl100k/o200k on English prose and code — close
 * enough to decide whether an image render is worth it.
 */
export function estimateTextTokens(text: string): number {
  if (text.length === 0) return 0;
  let tokens = 0;
  const runs = text.match(/[A-Za-zÀ-ɏ0-9]+|\s+|[^\sA-Za-zÀ-ɏ0-9]/g) ?? [];
  for (const run of runs) {
    if (/^\s+$/.test(run)) {
      tokens += run.includes('\n') ? 1 : 0; // spaces mostly merge into word tokens
    } else if (/^[A-Za-zÀ-ɏ0-9]/.test(run)) {
      tokens += Math.max(1, Math.round(run.length / 4.5));
    } else {
      tokens += 1;
    }
  }
  return Math.max(1, tokens);
}
