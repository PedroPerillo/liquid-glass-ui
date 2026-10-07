/** Set up liquid metal (flow filter, pointer highlight, ripples, slider fill). Runs automatically on import. */
export function init(): void;
/** Ripple strength of the rim (SVG displacement scale). Default 22, 0 = none. */
export function setFlow(scale: number): void;
/** Re-sync a .lm-slider's fill after setting its value from code. */
export function updateSlider(input: HTMLInputElement): void;

declare const LiquidMetal: {
  init: typeof init;
  setFlow: typeof setFlow;
  updateSlider: typeof updateSlider;
};
export default LiquidMetal;

declare global {
  interface Window {
    LiquidMetal: typeof LiquidMetal;
  }
}
