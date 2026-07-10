/**
 * Token-cost estimators for the major vision APIs plus a text-side heuristic.
 * These implement each provider's *published* billing rules; they are
 * estimates, not quotes — providers change resampling and pricing. The point
 * is an honest comparison: the tool reports when plain text is cheaper.
 *
 * Formula sources (verified 2026-07):
 *  - Anthropic: tokens ≈ pixels/750 after fit-to-limits. Current models
 *    (Opus 4.7+, Sonnet 5, Fable 5) accept up to a 2576px long edge with a
 *    ~4784-token per-image cap; older models resample to a 1568px long edge
 *    and ~1.15MP. Both bill identically for images within 1568px — which is
 *    everything this renderer produces in dense profiles.
 *  - OpenAI GPT-5.2 and later (current ChatGPT models): patch-based — the
 *    image is covered by 32x32px patches, tokens = patch count x a per-model
 *    multiplier (1.0 for full-size models, 1.62 mini, 2.46 nano), with a
 *    1,536-patch budget (2,500 on newer full-size models) that triggers a
 *    downscale when exceeded. The older tile formula (base + per-512px-tile)
 *    applies to GPT-4o/4.1/5.1-class models and is exported separately.
 *  - Google Gemini: 258 tokens per 768px tile (one tile when ≤384px).
 */

export interface ImageTokenEstimates {
  /** Anthropic Claude (current models: 2576px long-edge fit, ~4784-token cap). */
  anthropic: number;
  /** OpenAI GPT-5.2+ patch billing (32px patches, x1.0, 1536-patch budget). */
  openai: number;
  /** Google Gemini tile billing. */
  gemini: number;
}

export function anthropicImageTokens(width: number, height: number): number {
  const scale = Math.min(1, 2576 / Math.max(width, height));
  const tokens = Math.ceil((width * scale * (height * scale)) / 750);
  return Math.min(tokens, 4784);
}

const OPENAI_PATCH = 32;
const OPENAI_PATCH_BUDGET = 1536; // conservative: newest full-size models allow 2500

/** Patch-based billing used by GPT-5.2+ (and gpt-4.1-mini/nano/o4-mini class). */
export function openaiImageTokens(width: number, height: number, multiplier = 1.0): number {
  // Fit within the 2048px max dimension first.
  const fit = Math.min(1, 2048 / Math.max(width, height));
  let w = width * fit;
  let h = height * fit;
  let patches = Math.ceil(w / OPENAI_PATCH) * Math.ceil(h / OPENAI_PATCH);
  if (patches > OPENAI_PATCH_BUDGET) {
    // Shrink so the patch grid fits the budget, per the documented formula.
    const s = Math.sqrt((OPENAI_PATCH_BUDGET * OPENAI_PATCH * OPENAI_PATCH) / (w * h));
    w *= s;
    h *= s;
    patches = Math.min(OPENAI_PATCH_BUDGET, Math.ceil(w / OPENAI_PATCH) * Math.ceil(h / OPENAI_PATCH));
  }
  return Math.ceil(patches * multiplier);
}

/** Legacy tile billing (GPT-4o / GPT-4.1 / GPT-5.1 class, detail=high):
 *  fit 2048px, short side to 768px, then base + perTile per 512px tile. */
export function openaiTileImageTokens(
  width: number,
  height: number,
  base = 85,
  perTile = 170,
): number {
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
  return base + perTile * tiles;
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
