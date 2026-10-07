export type GlassMode = 'liquid' | 'frost' | 'flat';

/** True in Chromium browsers, which can refract the backdrop with SVG filters. */
export const supportsRefraction: boolean;

/** Turn an element into a glass surface. Elements with the `.lg` class are attached automatically. */
export function attach(el: HTMLElement): void;
/** Stop managing an element and remove its filter. */
export function detach(el: HTMLElement): void;
/** Re-render one surface, or all of them when called without arguments. */
export function refresh(el?: HTMLElement): void;
/** Switch every surface between liquid, frosted and flat. */
export function setMode(mode: GlassMode): void;
export function getMode(): GlassMode;

export interface GlassOptions {
  /** Blur in px. Default 10. */
  blur?: number;
  /** Multiplier on edge refraction. Default 1, 0 turns bending off. */
  refraction?: number;
}
/** Change global defaults for every glass surface. */
export function configure(options: GlassOptions): Required<GlassOptions>;
export function getOptions(): Required<GlassOptions>;

export interface ToastOptions {
  /** Milliseconds before the toast leaves. Default 2600. */
  duration?: number;
  /** Optional SVG or HTML string shown before the message. */
  icon?: string;
}
export function toast(message: string, options?: ToastOptions): { dismiss: () => void };

export function openSheet(dialog: HTMLDialogElement | string): void;
export function closeSheet(dialog: HTMLDialogElement | string): void;

export interface LgChangeDetail {
  index: number;
  value: string | null;
}

declare const LiquidGlass: {
  attach: typeof attach;
  detach: typeof detach;
  refresh: typeof refresh;
  setMode: typeof setMode;
  getMode: typeof getMode;
  configure: typeof configure;
  getOptions: typeof getOptions;
  toast: typeof toast;
  openSheet: typeof openSheet;
  closeSheet: typeof closeSheet;
  supportsRefraction: boolean;
};
export default LiquidGlass;

declare global {
  interface HTMLElementTagNameMap {
    'lg-tab-bar': HTMLElement & { readonly index: number; readonly value: string | null; select(i: number, fire?: boolean): void };
    'lg-segmented': HTMLElement & { readonly index: number; readonly value: string | null; select(i: number, fire?: boolean): void };
  }
  interface Window {
    LiquidGlass: typeof LiquidGlass;
  }
}
