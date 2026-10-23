// Small text/number motion helpers over the installed GSAP plugins. They never own routes.
import { gsap } from 'gsap';
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin';
import { SplitText } from 'gsap/SplitText';

gsap.registerPlugin(SplitText, ScrambleTextPlugin);

export const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const splits = new WeakMap<HTMLElement, SplitText>();
const scrambleSet = 'АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЭЮЯ0123456789';

const plainText = (element: HTMLElement) => {
  const copy = element.cloneNode(true) as HTMLElement;
  copy.querySelectorAll('br').forEach(br => br.replaceWith(' '));
  copy.querySelectorAll('.sr-only').forEach(node => node.remove());
  return copy.textContent!.replace(/\s+/g, ' ').trim();
};

/**
 * Splits once per element (repeat calls reuse it, so wrappers never nest). Links, buttons and headings
 * keep their accessible name via aria-label; other text gets one sr-only copy, so chars are never read one by one.
 */
export function split(element: HTMLElement, mask = false): HTMLElement[] {
  let instance = splits.get(element);
  if (!instance) {
    const named = element.matches('a,button,h1,h2,h3');
    const text = plainText(element);
    instance = SplitText.create(element, {
      type: 'words,chars',
      tag: 'span',
      aria: named ? 'auto' : 'hidden',
      charsClass: 'char',
      wordsClass: 'word',
      ...(mask ? { mask: 'chars' as const } : {}),
      onSplit: self => {
        self.chars.forEach(char => { (char as HTMLElement).dataset.c = char.textContent!; });
        if (named) element.setAttribute('aria-label', element.getAttribute('aria-label') || text);
        else element.insertAdjacentHTML('afterbegin', `<span class="sr-only">${text.replace(/</g, '&lt;')}</span>`);
      },
    });
    splits.set(element, instance);
  }
  return instance.chars as HTMLElement[];
}

const charsOf = (targets: ArrayLike<HTMLElement> | HTMLElement) =>
  (targets instanceof HTMLElement ? [targets] : Array.from(targets)).flatMap(element => split(element));

/** Discrete char-by-char appearance for small service text. */
export function revealChars(targets: ArrayLike<HTMLElement> | HTMLElement, delay = 0, stagger = .045): gsap.core.Tween {
  const chars = charsOf(targets);
  return gsap.fromTo(chars, { autoAlpha: 0 }, { autoAlpha: 1, duration: .01, stagger, delay, overwrite: true });
}

export function hideChars(targets: ArrayLike<HTMLElement> | HTMLElement, stagger = .01): gsap.core.Tween {
  const chars = charsOf(targets);
  return gsap.to(chars, { autoAlpha: 0, duration: .01, stagger: { each: stagger, from: 'end' }, overwrite: true });
}

/** Large type: each letter rises out of its mask with a slight rotation (reduced motion: letters only fade in). */
export function maskIn(element: HTMLElement, vars: gsap.TweenVars = {}): gsap.core.Tween {
  const chars = split(element, true);
  if (reducedMotion.matches) return gsap.fromTo(chars, { yPercent: 0, rotate: 0, autoAlpha: 0 }, { autoAlpha: 1, duration: .6, stagger: .03, ease: 'power1.out', overwrite: true, ...vars });
  return gsap.fromTo(chars, { yPercent: 115, rotate: 12, autoAlpha: 1 }, { yPercent: 0, rotate: 0, duration: .88, stagger: .038, ease: 'power2.inOut', overwrite: true, ...vars });
}

export function maskOut(element: HTMLElement, vars: gsap.TweenVars = {}): gsap.core.Tween {
  const chars = split(element, true);
  if (reducedMotion.matches) return gsap.to(chars, { autoAlpha: 0, duration: .4, stagger: .01, ease: 'power1.in', overwrite: true, ...vars });
  return gsap.to(chars, { yPercent: -115, rotate: -8, duration: .6, stagger: .02, ease: 'power2.in', overwrite: true, ...vars });
}

/** Same word, new place: each letter leaves upward through its mask and rolls back in from below, like a digit reel. */
export function maskRoll(element: HTMLElement): gsap.core.Tween {
  const chars = split(element, true);
  if (reducedMotion.matches) return gsap.set(chars, { yPercent: 0, rotate: 0, autoAlpha: 1, overwrite: true });
  return gsap.to(chars, {
    keyframes: [
      { yPercent: -115, rotate: -8, autoAlpha: 1, duration: .42, ease: 'power3.in' },
      { yPercent: 115, rotate: 12, duration: 0 },
      { yPercent: 0, rotate: 0, duration: .8, ease: 'expo.out' },
    ],
    stagger: .07,
    overwrite: true,
  });
}

/** Short hover scramble for interactive labels; always ends on the original letters. */
export function scramble(element: HTMLElement): void {
  if (reducedMotion.matches) return;
  split(element).forEach((char, index) => gsap.to(char, {
    duration: .5,
    delay: index * .03,
    // 'auto', not true: a hover must not kill a pending reveal/hide of the same letters, or they stay hidden.
    overwrite: 'auto',
    scrambleText: { text: char.dataset.c!, chars: scrambleSet, speed: .6 },
    // Page transitions kill this mid-flight (overwrite: true on the same chars); never leave a random letter.
    onInterrupt: () => { char.textContent = char.dataset.c!; },
  }));
}

/** Number shown as digit reels in masks; only reels whose digit changes are tweened. */
export class Counter {
  private reels: HTMLElement[];
  private digits: number[];
  private label: HTMLElement;

  constructor(private element: HTMLElement, size: number, private format = (value: string) => value) {
    const reel = `<span class="reel-mask"><span class="reel">${[...'0123456789'].map(digit => `<span>${digit}</span>`).join('')}</span></span>`;
    element.innerHTML = `<span class="sr-only"></span><span class="reels" aria-hidden="true">${reel.repeat(size)}</span>`;
    this.reels = [...element.querySelectorAll<HTMLElement>('.reel')];
    this.label = element.querySelector('.sr-only')!;
    this.digits = this.reels.map(() => 0);
    this.set(0, true);
  }

  set(value: number, immediate = false, vars: gsap.TweenVars = {}): void {
    const text = String(Math.max(0, Math.round(value))).padStart(this.reels.length, '0').slice(-this.reels.length);
    const label = this.format(text);
    if (this.label.textContent !== label) this.label.textContent = label;
    this.reels.forEach((reel, index) => {
      const digit = Number(text[index]);
      if (digit === this.digits[index] && !immediate) return;
      this.digits[index] = digit;
      if (immediate || reducedMotion.matches) gsap.set(reel, { yPercent: -digit * 10, overwrite: true });
      else gsap.to(reel, { yPercent: -digit * 10, duration: .8, ease: 'power2.out', overwrite: true, delay: index * .05, ...vars });
    });
  }
}
