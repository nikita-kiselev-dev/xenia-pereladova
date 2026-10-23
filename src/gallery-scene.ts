import { gsap } from 'gsap';
import { Observer } from 'gsap/Observer';
import type { Category } from './data/projects';
import { layout, wrap, type Box, type Layout, type Mode } from './gallery-layout';
import { reducedMotion } from './motion';
import type { GalleryRenderer, PhotoState } from './webgl/gallery-renderer';

gsap.registerPlugin(Observer);

interface Tile {
  el: HTMLAnchorElement;
  frame: HTMLElement;
  img: HTMLImageElement;
  key: string;
  slug: string;
  category: string;
  ratio: number;
  box: Box;
  /** Screen box drawn at the last frame: the renderer and picking read it instead of measuring the DOM. */
  rect: Box;
  /** Last written styles, so tiles at rest cost no style recalculation. */
  css: string[];
  /** During transitions boxes are screen coordinates; at rest they live in the cyclic layout space. */
  free: boolean;
  shown: boolean;
  state: PhotoState;
}

type Enter = 'stack' | 'sides';

/**
 * Owns the persistent gallery DOM: cyclic layout, inertia, input, picking and layout transitions.
 * The DOM tiles always sit where the photo is drawn, so focus, hit testing and the no-WebGL fallback match.
 */
export class GalleryScene {
  readonly tiles: Tile[];
  mode: Mode = 'overview';
  filter: Category = 'all';
  enabled = false;
  dragged = false;
  speed = 0;
  private plan: Layout = { boxes: [], axis: 'y', period: 1, margin: 0, cycling: false, max: 0 };
  private offset = 0;
  /** Offset at the previous frame: velocity must include finger drags, which move offset directly. */
  private last = 0;
  private target = 0;
  private velocity = 0;
  private saved = new Map<string, number>();
  private moving?: gsap.core.Timeline;
  private observer: Observer;
  private renderer?: GalleryRenderer;

  constructor(readonly root: HTMLElement) {
    this.tiles = [...root.querySelectorAll<HTMLAnchorElement>('.photo-link')].map(el => {
      const img = el.querySelector('img')!;
      return {
        el, img, frame: el.querySelector('.photo-frame')!,
        key: el.dataset.tile!, slug: el.dataset.project!, category: el.dataset.category!,
        ratio: Number(img.getAttribute('width')) / Number(img.getAttribute('height')),
        box: { x: 0, y: 0, w: 0, h: 0 }, rect: { x: 0, y: 0, w: 0, h: 0 }, css: ['', '', '', ''], free: false, shown: true, state: { hover: 0, anim: 0, opacity: 1, order: 0 },
      };
    });
    root.addEventListener('click', this.onClickCapture, true);
    root.addEventListener('dragstart', event => event.preventDefault());
    this.observer = Observer.create({
      target: window,
      type: 'wheel,touch,pointer',
      tolerance: 2,
      dragMinimum: 6,
      onWheel: self => this.nudge(this.plan.axis === 'x' ? self.deltaY + self.deltaX : self.deltaY),
      onDrag: self => {
        this.dragged = true;
        const delta = -(this.plan.axis === 'x' ? self.deltaX : self.deltaY);
        this.nudge(delta);
        if (this.enabled && !this.moving) this.offset = this.clamp(this.offset + delta);
      },
      onDragEnd: self => {
        this.nudge(-(this.plan.axis === 'x' ? self.velocityX : self.velocityY) * .25);
        setTimeout(() => { this.dragged = false; }, 0);
      },
    });
  }

  attach(renderer?: GalleryRenderer): void {
    this.renderer = renderer;
    renderer?.bind(this.tiles);
  }

  get busy(): boolean { return Boolean(this.moving?.isActive()); }
  get cycling(): boolean { return this.plan.cycling; }

  nudge(delta: number): void {
    if (!this.enabled || this.moving || !Number.isFinite(delta)) return;
    this.target = this.clamp(this.target + delta);
    if (reducedMotion.matches) this.offset = this.target;
  }

  /** 0…100: phase of one cycle, or position inside a short non-cyclic selection. */
  phase(): number {
    const { period, cycling, max } = this.plan;
    if (cycling) return ((this.offset % period) + period) % period / period * 100;
    return max > 0 ? this.offset / max * 100 : 0;
  }

  /** Immediate layout (first paint, resize, breakpoint). Keeps the cycle phase. */
  relayout(mode = this.mode, filter = this.filter): void {
    this.moving?.progress(1).kill();
    this.moving = undefined;
    const phase = this.cycling ? this.phase() / 100 : 0;
    const key = this.prepare(mode, filter);
    this.offset = this.target = this.last = this.plan.cycling ? phase * this.plan.period : this.clamp(this.saved.get(key) ?? 0);
    this.shown().forEach((tile, index) => { tile.box = { ...this.plan.boxes[index] }; tile.free = false; tile.state.opacity = 1; });
    this.write();
  }

  /** Animated change of view/filter: photos travel from where they are drawn to the new composition. */
  morph(mode: Mode, filter: Category): gsap.core.Timeline {
    const before = new Map(this.tiles.map(tile => [tile, tile.shown ? this.screen(tile) : undefined]));
    this.saved.set(this.key(), this.offset);
    this.moving?.kill();
    const key = this.prepare(mode, filter);
    this.offset = this.target = this.clamp(this.saved.get(key) ?? 0);
    const timeline = this.timeline();
    const shown = this.shown();
    for (const tile of this.tiles) {
      const start = before.get(tile);
      const index = shown.indexOf(tile);
      if (index === -1) {
        if (!start) continue;
        tile.el.hidden = false;
        timeline.to(tile.box, { x: this.aside(start), duration: 1.4, ease: 'power3.inOut' }, 0).to(tile.state, { opacity: 0, duration: .6 }, .6);
        continue;
      }
      const end = this.toScreen(this.plan.boxes[index]);
      tile.box = start ? { ...start } : { ...end, x: this.aside(end) };
      if (!start) tile.state.opacity = 0;
      timeline.to(tile.box, { x: end.x, y: end.y, duration: 1.4, ease: 'power3.inOut' }, start ? 0 : .3)
        .to(tile.box, { w: end.w, h: end.h, duration: 1, ease: 'power3.inOut' }, start ? .2 : .3)
        .to(tile.state, { opacity: 1, duration: .6 }, start ? 0 : .5);
    }
    return timeline;
  }

  /** Gallery entry: from the intro stack, from the sides, or with one photo returning from its series. */
  enter(kind: Enter, hero?: { key: string; rect?: Box }): gsap.core.Timeline {
    this.moving?.kill();
    const timeline = this.timeline();
    const shown = this.shown();
    const heroTile = shown.find(tile => tile.key === hero?.key);
    const stackSize = (() => { const box = this.plan.boxes[0]; return box ? { w: box.h * .8, h: box.h } : { w: 100, h: 125 }; })();
    shown.forEach((tile, index) => {
      const end = this.toScreen(this.plan.boxes[index]);
      const isHero = tile === heroTile;
      if (isHero && hero?.rect) { tile.box = { ...hero.rect }; tile.state.opacity = 0; }
      else if (kind === 'stack') tile.box = { x: (innerWidth - stackSize.w) / 2, y: (innerHeight - stackSize.h) / 2, ...stackSize };
      else { tile.box = { ...end, x: this.aside(end) }; tile.state.opacity = 0; }
      tile.state.order = isHero || (kind === 'stack' && index === 0) ? 2 : 0;
      tile.el.style.zIndex = String(tile.state.order);
      const delay = kind === 'sides' && !isHero ? .05 + (index % 6) * .03 : 0;
      timeline.to(tile.box, { x: end.x, y: end.y, duration: 1.4, ease: 'power3.inOut' }, delay)
        .to(tile.box, { w: end.w, h: end.h, duration: 1, ease: 'power3.inOut' }, delay + .2)
        .to(tile.state, { opacity: 1, duration: .8 }, delay);
      const lead = isHero || (kind === 'stack' && index === 0);
      timeline.to(tile.state, { anim: lead ? .9 : .15, duration: .45, ease: 'sine.inOut' }, delay)
        .to(tile.state, { anim: 0, duration: .45, ease: 'sine.inOut' }, delay + (lead ? .6 : 1.15));
    });
    timeline.call(() => shown.forEach(tile => { tile.state.order = 0; tile.el.style.zIndex = ''; }));
    return timeline;
  }

  /** Gallery exit before Info: photos leave sideways while the background and grain stay. */
  leave(): gsap.core.Timeline {
    this.moving?.kill();
    this.saved.set(this.key(), this.offset);
    const timeline = this.timeline();
    this.shown().forEach((tile, index) => {
      tile.box = this.screen(tile);
      timeline.to(tile.box, { x: this.aside(tile.box), duration: .9, ease: 'power3.in' }, (index % 6) * .025)
        .to(tile.state, { opacity: 0, duration: .5 }, .35);
    });
    return timeline;
  }

  /** Selected photo centres, bends and grows to the first frame's box; the others move aside. */
  open(key: string, rect: Box): gsap.core.Timeline {
    this.moving?.kill();
    this.saved.set(this.key(), this.offset);
    const timeline = this.timeline();
    for (const tile of this.shown()) {
      tile.box = this.screen(tile);
      if (tile.key !== key) {
        timeline.to(tile.box, { x: this.aside(tile.box), duration: 1.4, ease: 'power4.inOut' }, 0);
        continue;
      }
      tile.state.order = 2;
      tile.el.style.zIndex = '2';
      timeline.to(tile.box, { x: (innerWidth - tile.box.w) / 2, y: (innerHeight - tile.box.h) / 2, duration: .65, ease: 'power4.inOut' }, 0)
        .to(tile.state, { anim: .3, hover: 0, duration: .5, ease: 'power4.inOut' }, 0)
        .to(tile.box, { ...rect, duration: 1.2, ease: 'power3.inOut' }, .65)
        .to(tile.state, { anim: 0, duration: 1.2, ease: 'power4.inOut' }, .65);
    }
    return timeline;
  }

  /** Tile under a viewport point, from the drawn boxes (no forced layout, unlike elementFromPoint). */
  pick(x: number, y: number): Tile | undefined {
    let hit: Tile | undefined;
    for (const tile of this.tiles) {
      const { x: left, y: top, w, h } = tile.rect;
      if (tile.shown && x >= left && x < left + w && y >= top && y < top + h && (!hit || tile.state.order > hit.state.order)) hit = tile;
    }
    return hit;
  }

  /** Tile nearest to the viewport centre (narrow Overview caption). */
  current(): Tile | undefined {
    let best: Tile | undefined;
    let distance = Infinity;
    for (const tile of this.shown()) {
      const box = this.screen(tile);
      const delta = Math.abs(box.x + box.w / 2 - innerWidth / 2);
      if (delta < distance) { distance = delta; best = tile; }
    }
    return best;
  }

  bringIntoView(el: Element): void {
    const tile = this.tiles.find(item => item.el === el);
    if (!tile || this.moving) return;
    const box = this.screen(tile);
    const axis = this.plan.axis;
    const size = axis === 'x' ? box.w : box.h;
    const viewport = axis === 'x' ? innerWidth : innerHeight;
    if (box[axis] >= 70 && box[axis] + size <= viewport - 90) return;
    this.target = this.clamp(this.offset + box[axis] + size / 2 - viewport / 2);
    if (reducedMotion.matches) this.offset = this.target;
  }

  tick(dt: number, time: number): void {
    if (!this.moving) {
      this.offset += (this.target - this.offset) * (1 - Math.pow(1 - .085, dt * 60));
      if (Math.abs(this.target - this.offset) < .05) this.offset = this.target;
      this.velocity = dt > 0 ? (this.offset - this.last) / dt : 0;
    } else this.velocity = 0;
    this.last = this.offset;
    // Bend in px at screen centre: fast flicks give a clear curve, rest returns to a flat photo.
    const bend = Math.max(-260, Math.min(260, this.velocity * (innerWidth > 600 ? .06 : .025)));
    this.speed += (bend - this.speed) * (1 - Math.pow(1 - .1, dt * 60));
    if (Math.abs(this.speed) < .01) this.speed = 0;
    this.write();
    this.renderer?.update(this.speed, time);
  }

  dispose(): void {
    this.moving?.kill();
    this.observer.kill();
  }

  private key(): string { return `${this.mode}:${this.filter}`; }
  private shown(): Tile[] { return this.tiles.filter(tile => tile.shown); }
  private clamp(value: number): number { return this.plan.cycling ? value : Math.max(0, Math.min(this.plan.max, value)); }
  private aside(box: Box): number { return box.x + box.w / 2 < innerWidth / 2 ? -box.w - innerWidth * .15 : innerWidth * 1.15; }

  private prepare(mode: Mode, filter: Category): string {
    this.mode = mode;
    this.filter = filter;
    for (const tile of this.tiles) {
      tile.shown = filter === 'all' || tile.category === filter;
      tile.el.hidden = !tile.shown;
    }
    this.root.querySelectorAll<HTMLElement>('.text-list>a').forEach(row => { row.hidden = filter !== 'all' && row.dataset.category !== filter; });
    this.plan = layout(mode, this.shown().map(tile => tile.ratio), innerWidth, innerHeight);
    return this.key();
  }

  private timeline(): gsap.core.Timeline {
    const timeline = gsap.timeline({
      onComplete: () => {
        for (const tile of this.tiles) {
          if (!tile.shown) { tile.el.hidden = true; continue; }
          const axis = this.plan.axis;
          tile.box = { ...tile.box, [axis]: tile.box[axis] + this.offset };
          tile.free = false;
        }
        if (this.moving === timeline) this.moving = undefined;
      },
    });
    for (const tile of this.tiles) tile.free = true;
    this.moving = timeline;
    if (reducedMotion.matches) queueMicrotask(() => timeline.progress(1));
    return timeline;
  }

  private toScreen(box: Box): Box {
    const axis = this.plan.axis;
    const value = box[axis] - this.offset;
    return { ...box, [axis]: this.plan.cycling ? wrap(value, this.plan.period, this.plan.margin) : value };
  }

  private screen(tile: Tile): Box { return tile.free ? { ...tile.box } : this.toScreen(tile.box); }

  private write(): void {
    for (const tile of this.tiles) {
      if (!tile.shown && !tile.free) continue;
      const box = tile.rect = this.screen(tile);
      const css = [`translate3d(${box.x.toFixed(2)}px,${box.y.toFixed(2)}px,0)`, `${box.w.toFixed(2)}px`, `${box.h.toFixed(2)}px`, tile.state.opacity < .999 ? tile.state.opacity.toFixed(3) : ''];
      if (css[0] !== tile.css[0]) tile.el.style.transform = css[0];
      if (css[1] !== tile.css[1]) tile.frame.style.width = css[1];
      if (css[2] !== tile.css[2]) tile.frame.style.height = css[2];
      if (css[3] !== tile.css[3]) tile.el.style.opacity = css[3];
      tile.css = css;
    }
  }

  private readonly onClickCapture = (event: MouseEvent): void => {
    if (!this.dragged) return;
    event.preventDefault();
    event.stopPropagation();
  };
}
