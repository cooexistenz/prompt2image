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
export declare function anthropicImageTokens(width: number, height: number): number;
export declare function openaiImageTokens(width: number, height: number): number;
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
