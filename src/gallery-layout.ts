// Pure geometry for the cyclic gallery: no DOM, so it can be checked with node --test.
import { portraitLayout, type Insets } from './viewport.ts';
export type Mode = 'overview' | 'list' | 'strip';
export interface Box { x: number; y: number; w: number; h: number }
export interface Layout { boxes: Box[]; axis: 'x' | 'y'; period: number; margin: number; cycling: boolean; max: number }

const gap = 4;
// Free composition of the original: anchors as share of the free width, groups of 1–2 touching photos.
const rows: { a: number; n: number }[][] = [
  [{ a: 0, n: 1 }, { a: .335, n: 2 }, { a: 1, n: 1 }],
  [{ a: 0, n: 1 }, { a: .625, n: 1 }, { a: 1, n: 1 }],
  [{ a: 0, n: 2 }, { a: .385, n: 1 }, { a: .6, n: 1 }, { a: 1, n: 1 }],
  [{ a: .17, n: 1 }, { a: .5, n: 2 }, { a: .84, n: 1 }],
];

export function layout(mode: Mode, ratios: number[], vw: number, vh: number, insets?: Insets): Layout {
  const edge = vw <= 600 ? 15 : 20;
  if (mode === 'overview') {
    const h = Math.max(96, vh * .137);
    const pitch = h * 2.2;
    const boxes: Box[] = [];
    let row = 0;
    while (boxes.length < ratios.length) {
      for (const group of rows[row % rows.length]) {
        const widths = ratios.slice(boxes.length, boxes.length + group.n).map(ratio => h * Math.min(ratio, 2));
        if (!widths.length) break;
        const total = widths.reduce((sum, w) => sum + w, 0) + gap * (widths.length - 1);
        let x = edge + group.a * (vw - edge * 2 - total);
        for (const w of widths) { boxes.push({ x, y: 52 + row * pitch, w, h }); x += w + gap; }
      }
      row++;
    }
    return finish(boxes, 'y', row * pitch, h + 20, vh);
  }
  // Strip (every compact width, phone to tablet portrait): low band under the fixed initials and caption.
  const portrait = portraitLayout(vw, vh, insets);
  const h = mode === 'list' ? Math.max(130, vh * .18) : portrait.photoHeight;
  const y = mode === 'strip' ? portrait.photoTop : (vh - h) / 2;
  let x = mode === 'list' ? vw * .08 : vw * .25;
  const boxes = ratios.map(ratio => { const w = h * Math.min(ratio, 2); const box = { x, y, w, h }; x += w + gap; return box; });
  const widest = Math.max(0, ...boxes.map(box => box.w));
  return finish(boxes, 'x', x - (boxes[0]?.x ?? 0), widest + 20, vw);
}

// Cycling needs one full period beyond the viewport, otherwise a photo would visibly jump.
// A short selection is centred instead and scrolls only if it still overflows.
function finish(boxes: Box[], axis: 'x' | 'y', period: number, margin: number, viewport: number): Layout {
  const cycling = period >= viewport + margin;
  let max = Infinity;
  if (!cycling) {
    const size = axis === 'x' ? 'w' : 'h';
    const lo = Math.min(...boxes.map(box => box[axis]));
    const hi = Math.max(...boxes.map(box => box[axis] + box[size]));
    const shift = boxes.length && hi - lo < viewport * .8 ? (viewport - (hi - lo)) / 2 - lo : 0;
    for (const box of boxes) box[axis] += shift;
    max = boxes.length ? Math.max(0, hi + shift + 80 - viewport) : 0;
  }
  return { boxes, axis, period: Math.max(period, 1), margin, cycling, max };
}

/** Position along the cyclic axis, kept in [-margin, period - margin). */
export function wrap(value: number, period: number, margin: number): number {
  return ((value + margin) % period + period) % period - margin;
}

/** Copy of `target` (modulo period) closest to `from`, so transitions take the short way. */
export function nearest(target: number, from: number, period: number): number {
  return target + Math.round((from - target) / period) * period;
}
