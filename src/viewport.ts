import type { Box } from './gallery-layout';

export const compactQuery = '(max-width: 1023px), (orientation: portrait)';
export interface Insets { top: number; right: number; bottom: number; left: number }
export interface Viewport extends Insets { width: number; height: number }
const noInsets: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

/** Shared by CSS and the moving photos: one available rectangle, including browser bars and cutouts. */
export function portraitLayout(width: number, height: number, insets: Insets = noInsets) {
  const phone = width <= 600;
  const top = (phone ? 55 : 75) + insets.top;
  const available = height - top - insets.bottom - 64;
  const photoHeight = Math.min(height * .3, Math.max(24, available * .42), Math.max(24, available - 128));
  const photoTop = Math.min(height * .775 + photoHeight / 2, height - insets.bottom - 64) - photoHeight;
  const captionGap = phone ? 20 : 15;
  const wordmark = Math.max(0, Math.min(
    phone ? width * .7 : (width - insets.left - insets.right - 30) / 1.37,
    (photoTop - top - captionGap - 88) / .815,
  ));
  return { top, wordmark, captionTop: top + wordmark * .815 + captionGap, photoTop, photoHeight };
}

export function frameBounds(view: Viewport) {
  const phone = view.width <= 600;
  const top = (phone ? 112 : 124) + view.top;
  const bottom = (phone ? 120 : 100) + view.bottom;
  return {
    top, bottom,
    width: (view.width - view.left - view.right) * (phone ? .9 : .8),
    height: Math.min(view.height * .7, Math.max(40, view.height - top - bottom)),
  };
}

export function projectFrame(ratio: number, view: Viewport): Box {
  const bounds = frameBounds(view);
  const w = Math.min(bounds.width, bounds.height * ratio);
  const h = w / ratio;
  // Phones stack the series without full-screen slides, so the first frame sits right under the heading.
  const y = view.width <= 600 ? bounds.top : bounds.top + (view.height - bounds.top - bounds.bottom - h) / 2;
  return { x: view.left + (view.width - view.left - view.right - w) / 2, y, w, h };
}

export function readViewport(): Viewport {
  const style = getComputedStyle(document.documentElement);
  const visible = window.visualViewport;
  const visualHeight = visible && visible.height > 0 && visible.scale > 0 ? visible.height * visible.scale : innerHeight;
  return {
    // Normalize pinch zoom so magnification never rearranges the gallery under the fingers.
    width: innerWidth, height: Math.round(Math.min(innerHeight, visualHeight)),
    top: parseFloat(style.getPropertyValue('--safe-top')) || 0,
    right: parseFloat(style.getPropertyValue('--safe-right')) || 0,
    bottom: parseFloat(style.getPropertyValue('--safe-bottom')) || 0,
    left: parseFloat(style.getPropertyValue('--safe-left')) || 0,
  };
}

export function applyViewport(view = readViewport()): Viewport {
  const portrait = portraitLayout(view.width, view.height, view);
  const frame = frameBounds(view);
  const values = {
    'viewport-height': view.height,
    'wm': portrait.wordmark,
    'wm-top': portrait.top,
    'gallery-caption-top': portrait.captionTop,
    'project-top': frame.top,
    'project-bottom': frame.bottom,
    'project-width': frame.width,
    'project-height': frame.height,
  };
  for (const [name, value] of Object.entries(values)) document.documentElement.style.setProperty(`--${name}`, `${value}px`);
  return view;
}
