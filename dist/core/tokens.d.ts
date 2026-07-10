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
export declare function anthropicImageTokens(width: number, height: number): number;
/** Patch-based billing used by GPT-5.2+ (and gpt-4.1-mini/nano/o4-mini class). */
export declare function openaiImageTokens(width: number, height: number, multiplier?: number): number;
/** Legacy tile billing (GPT-4o / GPT-4.1 / GPT-5.1 class, detail=high):
 *  fit 2048px, short side to 768px, then base + perTile per 512px tile. */
export declare function openaiTileImageTokens(width: number, height: number, base?: number, perTile?: number): number;
export declare function geminiImageTokens(width: number, height: number): number;
export declare function estimateImageTokens(width: number, height: number): ImageTokenEstimates;
export declare function sumImageTokens(pages: Array<{
    width: number;
    height: number;
}>): ImageTokenEstimates;
/**
 * BPE-ish text token estimate without a tokenizer dependency: one token per
 * ~4.5 characters of each word run (minimum one), one per symbol, newlines
 * grouped. Within ~±20% of cl100k/o200k on English prose and code — close
 * enough to decide whether an image render is worth it.
 */
export declare function estimateTextTokens(text: string): number;
