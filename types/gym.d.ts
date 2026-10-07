/** Register the gym elements and start slider syncing. Runs automatically on import. */
export function init(): void;
/** Re-sync a .og-slider's filled track after setting its value from code. */
export function updateSlider(input: HTMLInputElement): void;

declare const Gym: {
  init: typeof init;
  updateSlider: typeof updateSlider;
};
export default Gym;

/** `detail` of the stepper's and wheel's `input` / `change` events. */
export interface OgValueDetail {
  value: number;
}

export interface OgStepperElement extends HTMLElement {
  /** Current value, clamped to min/max. Setting it updates the `value` attribute. */
  value: number;
  disabled: boolean;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  /** Step up (1) or down (-1), `times` steps at once. */
  stepBy(dir: 1 | -1, times?: number): void;
}

export type RestTimerState = 'idle' | 'running' | 'paused' | 'ready';
export interface OgRestTimerElement extends HTMLElement {
  /** Default rest length in seconds (`duration` attribute, default 90). */
  duration: number;
  /** Whole seconds left. */
  readonly left: number;
  readonly state: RestTimerState;
  start(seconds?: number): void;
  pause(): void;
  resume(): void;
  toggle(): void;
  /** Add seconds, or take them away with a negative number. */
  add(seconds: number): void;
  /** End the rest early (fires `rest-end` with `skipped: true`). */
  skip(): void;
  /** Back to a full, stopped timer. */
  reset(): void;
}

/**
 * Attributes: `weeks` (1–104, default 26), `week-start` (0 = Sunday … 6 = Saturday, default 1),
 * `unit`, `today` ('YYYY-MM-DD'), `label`, `less-label`, `more-label`.
 */
export interface OgHeatmapElement extends HTMLElement {
  /** `{ 'YYYY-MM-DD': value }`. Days with a value above 0 are shaded by quartile. */
  data: Record<string, number>;
}

export interface OgLinePoint {
  x: Date | number | string;
  y: number;
  /** Extra text for the point's readout. */
  label?: string;
}
export interface OgLineChartElement extends HTMLElement {
  points: OgLinePoint[];
}

export interface OgSwipeRowElement extends HTMLElement {
  open(side: 'delete' | 'copy', focus?: boolean): void;
  close(animate?: boolean): void;
}

export interface OgWheelElement extends HTMLElement {
  value: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
}

export interface OgElapsedElement extends HTMLElement {
  /** Restart the clock from now, or from a given time. */
  restart(start?: Date | number | string): void;
}

declare global {
  interface HTMLElementTagNameMap {
    'og-stepper': OgStepperElement;
    'og-rest-timer': OgRestTimerElement;
    'og-heatmap': OgHeatmapElement;
    'og-line-chart': OgLineChartElement;
    'og-swipe-row': OgSwipeRowElement;
    'og-wheel': OgWheelElement;
    'og-elapsed': OgElapsedElement;
  }
  interface HTMLElementEventMap {
    'rest-start': CustomEvent<{ seconds: number }>;
    'rest-end': CustomEvent<{ skipped: boolean }>;
    'day': CustomEvent<{ date: string; value: number }>;
    'point': CustomEvent<{ index: number; x: Date; y: number }>;
    'swipe-delete': CustomEvent<Record<string, never>>;
    'swipe-copy': CustomEvent<Record<string, never>>;
  }
  interface Window {
    Gym: typeof Gym;
  }
}
