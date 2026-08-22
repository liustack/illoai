export type CanvasStrategy = 'paper-border' | 'full-bleed';

export type StyleTier = 'primary' | 'accent';

export interface PaletteSlot {
    name: string;
    role: string;
    defaultValue: string;
}

export interface StyleDefinition {
    name: string;
    displayName: string;
    scenarios: readonly string[];
    prompt: string;
    avoid: readonly string[];
    paletteSlots: readonly PaletteSlot[];
    canvas: {
        strategy: CanvasStrategy;
        guidance: string;
    };
    tier: StyleTier;
    isFallback: boolean;
    coverOnly: boolean;
    requiresScene: boolean;
}
