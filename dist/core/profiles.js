export const PROFILES = {
    claude: {
        atlas: 'dense',
        scale: 1,
        maxCols: 312, // 2*4 + 312*5 = 1568px, the exact long-edge bound
        maxHeightPx: 728, // 1568*728 ≈ 1.14MP, under the ~1.15MP area bound
        reflow: true,
        banner: true,
        background: 'white',
        padX: 4,
        padY: 4,
        lineGap: 0,
    },
    openai: {
        atlas: 'large',
        scale: 1,
        maxCols: 190, // 2*4 + 190*8 = 1528px → 3 tiles wide
        maxHeightPx: 768, // short side ≤768 avoids the detail=high downscale
        reflow: true,
        banner: true,
        background: 'white',
        padX: 4,
        padY: 4,
        lineGap: 0,
    },
    gemini: {
        atlas: 'large',
        scale: 1,
        maxCols: 95, // 2*4 + 95*8 = 768px → single tile per page
        maxHeightPx: 768,
        reflow: true,
        banner: true,
        background: 'white',
        padX: 4,
        padY: 4,
        lineGap: 0,
    },
    ocr: {
        atlas: 'large',
        scale: 2,
        maxCols: 100,
        maxHeightPx: 4096,
        reflow: false, // real line breaks; OCR engines have no ↵ convention
        banner: false,
        background: 'white',
        padX: 24,
        padY: 24,
        lineGap: 8,
    },
};
export function isProfileName(v) {
    return v === 'claude' || v === 'openai' || v === 'gemini' || v === 'ocr';
}
