import { gsap } from 'gsap';
import Lenis from 'lenis';
import { categories, profile, projects } from './data/projects';
import { GalleryScene } from './gallery-scene';
import type { Box, Mode } from './gallery-layout';
import { Counter, hideChars, maskIn, maskOut, reducedMotion, revealChars, scramble } from './motion';
import { galleryHash, parseRoute, type Route } from './navigation';
import { categoryName, escapeHtml, galleryMarkup, projectNumber } from './views/gallery';
import { projectMarkup } from './views/project';
import { infoMarkup } from './views/info';
import type { GalleryRenderer } from './webgl/gallery-renderer';

type GalleryRoute = Extract<Route, { page: 'overview' | 'list' }>;
type Position = { y: number; slug?: string };
const isGallery = (route: Route): route is GalleryRoute => route.page === 'overview' || route.page === 'list';
const pad = (value: number) => String(value).padStart(2, '0');

export class App {
  private route = parseRoute(location.hash);
  private shownRoute?: Route;
  private renderedHash = location.hash || '#/overview';
  private main: HTMLElement;
  private footer: HTMLElement;
  private header: HTMLElement;
  private lenis?: Lenis;
  private renderer?: GalleryRenderer;
  private scene: GalleryScene;
  private transition?: gsap.core.Timeline;
  private revision = 0;
  private lastGallery = '#/overview';
  private positions = new Map<string, Position>();
  private compact = matchMedia('(max-width: 1023px)');
  private photoObserver?: IntersectionObserver;
  private opening?: string;
  private lastOpened?: string;
  private openedKey?: string;
  private returnRect?: Box;
  private cursorEl: HTMLElement;
  private hovered?: GalleryScene['tiles'][number];
  private mobileSlug?: string;
  private pointer = { x: -100, y: -100, inside: false, mouse: false };
  private cursor = { x: -100, y: -100 };
  private progress: Counter;
  private hoverIndex: Counter;
  private mobileIndex: Counter;
  private photoCounter?: Counter;
  private intro?: { timeline: gsap.core.Timeline; skip: () => void; element: HTMLElement };

  constructor(private root: HTMLElement) {
    history.scrollRestoration = 'manual';
    root.innerHTML = `<header class="site-header"><div class="edge-blur" aria-hidden="true"><i></i><i></i><i></i></div>
      <a class="site-name" href="#/overview" data-reveal data-scramble>${profile.name}</a>
      <p class="site-bio" data-reveal>Фотограф<br>${profile.location}</p>
      <nav class="site-nav" aria-label="Основная навигация">
        <a data-nav="overview" href="#/overview" data-reveal data-scramble>Обзор</a><span class="nav-slash" aria-hidden="true">/</span><a data-nav="list" href="#/list" data-reveal data-scramble>Список</a>
        <a data-nav="info" class="info-nav" href="#/info" data-reveal data-scramble>/ Обо мне</a>
      </nav><a class="site-contact text-link" href="${profile.telegram}" target="_blank" rel="noopener noreferrer" data-reveal data-scramble>Написать в Telegram</a>
    </header><main id="main" tabindex="-1"></main>
    <footer class="site-footer"><div class="edge-blur" aria-hidden="true"><i></i><i></i><i></i></div><a class="copyright" href="#/info" data-reveal data-scramble>© ${new Date().getFullYear()}</a>
      <div class="filters" aria-label="Категории фотографий">${categories.map((category, index) => `<button data-filter="${category.id}" aria-pressed="false" aria-label="${category.title}">${category.title}${index < categories.length - 1 ? ',' : ''}</button>`).join('')}</div>
      <div class="overview-focus" aria-hidden="true"><span class="hover-index" data-hover-index></span><p data-hover-caption></p></div>
      <span class="progress" aria-label="Просмотрено"><span aria-hidden="true">[</span><span data-progress></span><span aria-hidden="true">%]</span></span>
    </footer><div class="noise" aria-hidden="true"></div><div class="cursor" aria-hidden="true"></div>
    <p class="sr-only" role="status" aria-live="polite" data-status></p>`;
    this.main = root.querySelector('main')!;
    this.footer = root.querySelector('.site-footer')!;
    this.header = root.querySelector('.site-header')!;
    this.cursorEl = root.querySelector('.cursor')!;
    this.progress = new Counter(root.querySelector('[data-progress]')!, 3, value => `${Number(value)}%`);
    this.hoverIndex = new Counter(root.querySelector('[data-hover-index]')!, 2);
    const holder = document.createElement('div');
    holder.innerHTML = galleryMarkup();
    this.scene = new GalleryScene(holder.firstElementChild as HTMLElement);
    this.mobileIndex = new Counter(this.scene.root.querySelector('[data-mobile-index]')!, 2);
    try { this.lastGallery = sessionStorage.getItem('xenia:gallery') || this.lastGallery; } catch { /* Storage may be disabled. */ }
    if (!isGallery(parseRoute(this.lastGallery))) this.lastGallery = '#/overview';
    root.addEventListener('click', this.onClick);
    root.addEventListener('focusin', this.onFocusIn);
    root.addEventListener('focusout', this.onFocusOut);
    root.addEventListener('pointerover', this.onPointerOver);
    root.addEventListener('error', this.onImageError, true);
    window.addEventListener('hashchange', this.onHashChange);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('resize', this.onResize);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('blur', this.onPointerLeave);
    document.documentElement.addEventListener('pointerleave', this.onPointerLeave);
    reducedMotion.addEventListener('change', this.onMotionChange);
    this.compact.addEventListener('change', this.onLayoutChange);
    document.querySelector('.skip-link')?.addEventListener('click', this.onSkip);
    if (!reducedMotion.matches) this.lenis = new Lenis({ lerp: .085, smoothWheel: true, syncTouch: false });
    this.go(true);
    gsap.ticker.add(this.tick);
    if (!reducedMotion.matches) void this.mountRenderer();
    if (import.meta.hot) import.meta.hot.dispose(() => this.dispose());
  }

  private onImageError = (event: Event) => {
    const image = event.target;
    if (!(image instanceof HTMLImageElement)) return;
    image.parentElement?.setAttribute('data-failed', 'true');
    image.hidden = true;
    image.style.opacity = '';
  };

  private rememberPosition() {
    if (!this.shownRoute || !isGallery(this.shownRoute)) return;
    const focused = document.activeElement instanceof HTMLElement ? document.activeElement.closest<HTMLElement>('[data-project]')?.dataset.project : undefined;
    this.positions.set(this.renderedHash, { y: window.scrollY, slug: focused || this.positions.get(this.renderedHash)?.slug });
  }

  private onClick = (event: MouseEvent) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (target.closest('[data-close]')) { this.close(); return; }
    const filter = target.closest<HTMLButtonElement>('[data-filter]');
    if (filter && isGallery(this.route)) {
      location.hash = galleryHash(this.route.page, filter.dataset.filter as GalleryRoute['filter']);
      return;
    }
    const link = target.closest<HTMLAnchorElement>('a[href^="#/"]');
    if (link && !event.ctrlKey && !event.metaKey && !event.shiftKey && event.button === 0) {
      event.preventDefault();
      this.opening = link.dataset.tile;
      if (link.dataset.project) this.positions.set(this.renderedHash, { y: window.scrollY, slug: link.dataset.project });
      if (link.hash !== location.hash) location.hash = link.hash;
    }
  };

  private onHashChange = () => {
    this.rememberPosition();
    const previous = this.route;
    const next = parseRoute(location.hash);
    if (isGallery(previous)) {
      this.lastGallery = this.renderedHash;
      try { sessionStorage.setItem('xenia:gallery', this.lastGallery); } catch { /* Optional persistence. */ }
      if (!isGallery(next)) history.replaceState({ ...history.state, xeniaReturn: this.lastGallery }, '');
    }
    this.route = next;
    this.renderedHash = location.hash;
    this.go(false);
  };

  private close() {
    if (history.state?.xeniaReturn === this.lastGallery) history.back();
    else location.hash = this.lastGallery;
  }

  private onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && !isGallery(this.route)) { this.close(); return; }
    if (!this.scene.enabled || event.altKey || event.ctrlKey || event.metaKey) return;
    const steps: Record<string, number> = { ArrowDown: .35, ArrowRight: .35, PageDown: .8, ArrowUp: -.35, ArrowLeft: -.35, PageUp: -.8 };
    if (event.key in steps) {
      event.preventDefault();
      this.scene.nudge(steps[event.key] * (this.scene.mode === 'overview' ? innerHeight : innerWidth));
    }
  };

  private onSkip = (event: Event) => { event.preventDefault(); this.main.focus({ preventScroll: true }); };

  private onFocusIn = (event: FocusEvent) => {
    if (!(event.target instanceof HTMLElement)) return;
    const link = event.target.closest<HTMLElement>('.photo-link');
    if (link && this.scene.enabled) this.scene.bringIntoView(link);
    if (link && !this.pointer.mouse) this.setHover(this.scene.tiles.find(tile => tile.el === link));
  };

  private onFocusOut = () => { if (!this.pointer.mouse) this.setHover(undefined); };

  private onPointerOver = (event: PointerEvent) => {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-scramble]') : null;
    if (target && event.pointerType === 'mouse' && !target.contains(event.relatedTarget as Node | null)) scramble(target);
  };

  private onMotionChange = () => {
    // ponytail: reload instead of re-plumbing every running scene; the OS setting rarely flips mid-visit.
    location.reload();
  };

  private onLayoutChange = () => {
    if (!isGallery(this.route) || !this.shownRoute || !isGallery(this.shownRoute)) return;
    this.transition?.progress(1).kill();
    this.showGallery(this.route, 'instant');
  };

  private onResize = () => {
    this.lenis?.resize();
    if (this.scene.enabled && !this.scene.busy) this.scene.relayout();
  };

  /** Each navigation: exit what is on screen, then enter the requested route. The newest request wins. */
  private go(initial: boolean) {
    const revision = ++this.revision;
    const from = this.shownRoute;
    const to = this.route;
    this.transition?.kill();
    this.transition = undefined;
    if (this.intro && !initial) this.endIntro();
    this.root.dataset.phase = 'transition';
    this.setHover(undefined);
    const enter = () => { if (revision === this.revision) this.enter(from, revision); };
    if (initial || !from || reducedMotion.matches || (isGallery(from) && isGallery(to))) { enter(); return; }

    let exit: gsap.core.Timeline;
    const tile = this.opening && this.scene.tiles.find(item => item.key === this.opening && item.shown);
    this.opening = undefined;
    this.openedKey = undefined;
    if (from.page === 'project' && isGallery(to)) {
      // Close: the series' cover returns from where its first frame was (or the centre) to its gallery place.
      const frame = this.main.querySelector('.project-photo-frame')?.getBoundingClientRect();
      this.returnRect = frame && frame.bottom > 0 && frame.top < innerHeight ? { x: frame.left, y: frame.top, w: frame.width, h: frame.height } : this.firstFrameRect(from.slug);
      this.openedKey = this.lastOpened?.startsWith(`${from.slug}-`) ? this.lastOpened : `${from.slug}-0`;
    }
    if (isGallery(from) && to.page === 'project' && tile && this.scene.enabled) {
      this.lastOpened = tile.key;
      exit = this.scene.open(tile.key, this.firstFrameRect(to.slug));
      exit.add(this.chrome(false), 0);
    } else if (isGallery(from)) {
      exit = this.scene.enabled ? this.scene.leave() : gsap.timeline().to(this.main, { autoAlpha: 0, duration: .4 });
      exit.add(this.chrome(false), 0);
    } else {
      exit = gsap.timeline();
      const heading = this.main.querySelector<HTMLElement>('[data-mask]');
      if (heading) exit.add(maskOut(heading), 0);
      exit.add(hideChars(this.main.querySelectorAll<HTMLElement>('[data-reveal]')), 0)
        .to(this.main, { autoAlpha: 0, duration: .45, ease: 'power2.out' }, .1);
    }
    exit.call(enter);
    this.transition = exit;
  }

  private enter(from: Route | undefined, revision: number) {
    const route = this.route;
    this.shownRoute = route;
    this.photoObserver?.disconnect();
    gsap.set(this.main, { clearProps: 'opacity,visibility' });
    this.root.dataset.page = route.page;
    this.header.hidden = this.footer.hidden = !isGallery(route);
    let timeline: gsap.core.Timeline;
    if (isGallery(route)) {
      timeline = this.showGallery(route, !from ? 'intro' : isGallery(from) ? 'morph' : from.page === 'project' ? 'return' : 'sides');
      if (from && !isGallery(from)) {
        const slug = this.positions.get(this.renderedHash)?.slug;
        const visibleList = route.page === 'list' && this.compact.matches;
        const link = slug ? this.scene.root.querySelector<HTMLElement>(`${visibleList ? '.text-list' : '.gallery-track'} [data-project="${slug}"]:not([hidden])`) : undefined;
        (link || this.main).focus({ preventScroll: true });
      }
    } else {
      timeline = this.showPage(route, from);
    }
    this.root.querySelector<HTMLElement>('[data-status]')!.textContent = isGallery(route)
      ? `${categories.find(category => category.id === route.filter)?.title}. ${this.scene.tiles.filter(tile => tile.shown && tile.key.endsWith('-0')).length} серий.`
      : document.title;
    this.transition = timeline;
    timeline.call(() => { if (revision === this.revision) this.root.dataset.phase = 'ready'; });
    if (reducedMotion.matches) timeline.progress(1);
    this.root.dataset.ready = 'true';
  }

  private sceneMode(route: GalleryRoute): Mode | undefined {
    if (route.page === 'overview') return this.compact.matches ? 'strip' : 'overview';
    return this.compact.matches ? undefined : 'list';
  }

  private showGallery(route: GalleryRoute, how: 'intro' | 'morph' | 'return' | 'sides' | 'instant'): gsap.core.Timeline {
    const mode = this.sceneMode(route);
    const previousView = this.main.dataset.view;
    if (this.scene.root.parentElement !== this.main) this.main.replaceChildren(this.scene.root);
    this.main.className = `gallery-main view-${route.page}`;
    this.main.dataset.view = route.page;
    this.footer.dataset.view = route.page;
    this.root.querySelectorAll<HTMLAnchorElement>('[data-nav]').forEach(link => {
      const page = link.dataset.nav!;
      link.setAttribute('aria-current', page === route.page ? 'page' : 'false');
      link.href = page === 'info' ? '#/info' : galleryHash(page as GalleryRoute['page'], route.filter);
    });
    this.root.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.filter === route.filter)));
    this.lastGallery = galleryHash(route.page, route.filter);
    document.title = `${route.page === 'list' ? 'Серии' : 'Фотографии'} — ${profile.name}`;
    this.renderer?.setActive(Boolean(mode));
    this.scene.enabled = Boolean(mode);
    this.mobileSlug = undefined;

    const timeline = gsap.timeline();
    if (mode) {
      this.lenis?.stop();
      window.scrollTo(0, 0);
      if (how === 'morph' && previousView) timeline.add(this.scene.morph(mode, route.filter), 0);
      else {
        this.scene.relayout(mode, route.filter);
        if (how === 'return') timeline.add(this.scene.enter('sides', { key: this.openedKey || '', rect: this.returnRect }), 0);
        else if (how === 'intro') timeline.add(this.scene.enter('stack'), 0);
        else if (how === 'sides') timeline.add(this.scene.enter('sides'), 0);
      }
    } else {
      this.scene.relayout('list', route.filter);
      this.lenis?.start();
      this.setScroll(this.positions.get(this.renderedHash)?.y || 0);
      const rows = [...this.scene.root.querySelectorAll<HTMLElement>('.text-list>a:not([hidden])')];
      if (how !== 'instant') timeline.fromTo(rows, { y: 16, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: .6, stagger: .045, ease: 'power3.out', clearProps: 'transform,opacity,visibility' }, .1);
    }
    this.openedKey = undefined;
    this.returnRect = undefined;
    this.scene.root.inert = false;
    if (how === 'instant') { timeline.progress(1); return timeline; }
    if (how !== 'morph') timeline.add(this.chrome(true), how === 'intro' ? .2 : .3);
    else {
      // An interrupted entry/exit may have left chrome text hidden: bring back whatever is not visible yet.
      const chars = this.root.querySelectorAll('.site-header .char, .site-footer [data-reveal] .char');
      timeline.to(chars, { autoAlpha: 1, duration: .01, stagger: .005 }, 0).to(this.footer.querySelectorAll('.progress, .overview-focus'), { autoAlpha: 1, duration: .4 }, 0);
      if (previousView !== route.page) timeline.add(this.footerSwap(route.page), 0);
      else if (route.page === 'list') timeline.to(this.footer.querySelectorAll('[data-filter] .char'), { yPercent: 0, rotate: 0, autoAlpha: 1, duration: .6, ease: 'power2.out' }, 0);
    }
    if (how === 'intro' && this.startIntro(timeline)) timeline.pause();
    return timeline;
  }

  /** Header and footer text in/out for gallery entry/exit. */
  private chrome(show: boolean): gsap.core.Timeline {
    const timeline = gsap.timeline();
    const reveal = [...this.root.querySelectorAll<HTMLElement>('.site-header [data-reveal], .site-footer [data-reveal]')];
    const filters = [...this.footer.querySelectorAll<HTMLElement>('[data-filter]')];
    const counters = this.footer.querySelectorAll('.progress, .overview-focus');
    if (show) {
      timeline.add(revealChars(reveal, 0, .03), 0).fromTo(counters, { autoAlpha: 0 }, { autoAlpha: 1, duration: .6 }, .3);
      if (this.footer.dataset.view === 'list') filters.forEach((filter, index) => timeline.add(maskIn(filter), index * .08));
    } else {
      timeline.add(hideChars(reveal), 0).to(counters, { autoAlpha: 0, duration: .4 }, 0);
      if (this.footer.dataset.view === 'list') filters.forEach(filter => timeline.add(maskOut(filter), 0));
    }
    return timeline;
  }

  private footerSwap(view: string): gsap.core.Timeline {
    const timeline = gsap.timeline();
    const filters = [...this.footer.querySelectorAll<HTMLElement>('[data-filter]')];
    if (view === 'list') {
      this.hoverIndex.set(0, true);
      filters.forEach((filter, index) => timeline.add(maskIn(filter), .3 + index * .08));
    } else {
      timeline.fromTo(this.footer.querySelector('.hover-index .reels'), { yPercent: 110, rotate: 6 }, { yPercent: 0, rotate: 0, duration: .88, ease: 'power2.inOut' }, .3);
    }
    return timeline;
  }

  private showPage(route: Route, from?: Route): gsap.core.Timeline {
    this.renderer?.setActive(false);
    this.scene.enabled = false;
    this.lenis?.start();
    const timeline = gsap.timeline();
    const keepGallery = Boolean(from && isGallery(from) && route.page === 'project' && this.lastOpened && this.renderer && this.scene.root.isConnected);
    if (route.page === 'project') {
      this.main.className = 'project-main';
      const project = projects.find(item => item.slug === route.slug);
      document.title = `${project?.title || 'Серия не найдена'} — ${profile.name}`;
      this.main.innerHTML = projectMarkup(route.slug);
      const counter = this.main.querySelector<HTMLElement>('[data-current-photo]');
      if (counter) { this.photoCounter = new Counter(counter, 2, value => `Фотография ${Number(value)}`); this.photoCounter.set(1, true); }
      this.setScroll(0);
      this.observePhotos();
      const first = this.main.querySelector<HTMLImageElement>('.project-photo img');
      if (first && keepGallery) {
        // The open transition left the cover where this frame appears: keep it under the frame until the frame has decoded.
        this.renderer!.setActive(true);
        this.scene.root.inert = true;
        this.main.append(this.scene.root);
        first.style.opacity = '0';
        const ready = Promise.race([first.decode().catch(() => undefined), new Promise(resolve => setTimeout(resolve, 1500))]);
        void ready.then(() => {
          if (this.shownRoute !== route) return;
          gsap.to(first, { opacity: 1, duration: .5, ease: 'power2.out', onComplete: () => {
            first.style.removeProperty('opacity');
            if (this.shownRoute === route) { this.scene.root.remove(); this.renderer?.setActive(false); }
          } });
        });
      } else if (first) {
        timeline.fromTo(first.parentElement, { scale: .92, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: 1.2, ease: 'power3.out', clearProps: 'transform,opacity,visibility' }, 0);
      }
      timeline.add(revealChars(this.main.querySelectorAll<HTMLElement>('.project-heading [data-reveal], .project-counter [data-reveal]'), .4, .02), 0)
        .fromTo(this.main.querySelector('.project-counter'), { autoAlpha: 0 }, { autoAlpha: 1, duration: .6 }, .4);
      const heading = this.main.querySelector<HTMLElement>('[data-mask]');
      if (heading) timeline.add(maskIn(heading), .2).add(revealChars(this.main.querySelectorAll<HTMLElement>('.not-found [data-reveal]'), .3), .2);
      (this.main.querySelector<HTMLElement>('h1') || this.main).focus({ preventScroll: true });
    } else {
      this.main.className = 'info-main';
      this.main.innerHTML = infoMarkup();
      document.title = `Обо мне — ${profile.name}`;
      this.setScroll(0);
      this.updateClock();
      const narrow = innerWidth <= 600;
      timeline.fromTo(this.main, { autoAlpha: 0 }, { autoAlpha: 1, duration: narrow ? .5 : 1, ease: 'power2.out', clearProps: 'opacity,visibility' }, 0)
        .add(maskIn(this.main.querySelector('h1')!, { duration: 1, stagger: .07 }), .55)
        .add(revealChars(this.main.querySelectorAll<HTMLElement>('.info-heading [data-reveal]'), 0, .02), .6)
        .fromTo(this.main.querySelectorAll('.info-copy>p, .info-section'), { y: 24, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: .8, stagger: .08, ease: 'power3.out', clearProps: 'transform,opacity,visibility' }, .7)
        .fromTo(this.main.querySelector('.info-portrait'), { scale: 1.12, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: 1.2, ease: 'power3.out', clearProps: 'transform,opacity,visibility' }, .86)
        .add(revealChars(this.main.querySelectorAll<HTMLElement>('.info-footer [data-reveal]'), 0, .02), 1);
      this.main.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
    }
    return timeline;
  }

  /** Box of a series' first frame at the top of its page (same rule as .project-photo-frame CSS). */
  private firstFrameRect(slug: string): Box {
    const photo = projects.find(project => project.slug === slug)?.photos[0];
    const ratio = photo ? photo.width / photo.height : .8;
    const narrow = innerWidth <= 600;
    const w = Math.min(innerHeight * (narrow ? .66 : .7) * ratio, innerWidth * (narrow ? .92 : .8));
    const h = w / ratio;
    return { x: (innerWidth - w) / 2, y: (innerHeight - h) / 2, w, h };
  }

  private async mountRenderer() {
    try {
      const { GalleryRenderer } = await import('./webgl/gallery-renderer');
      if (reducedMotion.matches) return;
      const renderer = new GalleryRenderer();
      if (renderer.disposed) { this.main.dataset.renderer = 'unavailable'; return; }
      this.renderer = renderer;
      this.scene.attach(renderer);
      renderer.setActive(this.scene.enabled);
    } catch {
      this.main.dataset.renderer = 'unavailable';
    }
  }

  private setScroll(y: number) {
    this.lenis?.resize();
    if (this.lenis) this.lenis.scrollTo(y, { immediate: true, force: true });
    else window.scrollTo(0, y);
  }

  private observePhotos() {
    this.photoObserver = new IntersectionObserver(entries => {
      const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      const index = visible?.target.getAttribute('data-photo-index');
      if (index) this.photoCounter?.set(Number(index));
    }, { threshold: [.25, .5, .75] });
    this.main.querySelectorAll('[data-photo-index]').forEach(photo => this.photoObserver!.observe(photo));
  }

  private updateClock() {
    const clock = this.main.querySelector('time');
    if (clock) { clock.textContent = new Intl.DateTimeFormat('ru', { timeZone: 'Asia/Novosibirsk', hour: '2-digit', minute: '2-digit' }).format(new Date()); clock.dateTime = new Date().toISOString(); }
  }

  private tick = (time: number, deltaMs: number) => {
    if (document.hidden) return;
    const dt = Math.min(deltaMs, 100) / 1000;
    this.lenis?.raf(time * 1000);
    if (this.renderer?.disposed) { this.renderer = undefined; this.scene.attach(undefined); this.main.dataset.renderer = 'unavailable'; }
    this.scene.tick(dt, time);
    if (this.scene.enabled) {
      if (this.pointer.mouse && !this.compact.matches) this.setHover(this.pointer.inside && !this.scene.busy ? this.scene.pick(this.pointer.x, this.pointer.y) : undefined);
      if (this.scene.mode === 'strip') this.updateMobileCaption();
      this.progress.set(this.scene.phase());
    } else if (isGallery(this.route)) {
      const height = document.documentElement.scrollHeight - innerHeight;
      this.progress.set(height > 0 ? Math.min(100, Math.max(0, scrollY / height * 100)) : 0);
    }
    if (this.pointer.mouse && !reducedMotion.matches) {
      // Original lerp 0.075 per 60 Hz frame, made frame-rate independent.
      const k = 1 - Math.pow(1 - .075, dt * 60);
      this.cursor.x += (this.pointer.x - this.cursor.x) * k;
      this.cursor.y += (this.pointer.y - this.cursor.y) * k;
      gsap.set(this.cursorEl, { x: this.cursor.x, y: this.cursor.y, xPercent: -50, yPercent: -50, opacity: this.pointer.inside ? .85 : 0, scale: this.hovered ? 2.4 : 1 });
    }
  };

  private setHover(tile?: GalleryScene['tiles'][number]) {
    if (tile === this.hovered) return;
    const previous = this.hovered;
    this.hovered = tile;
    if (previous) {
      gsap.to(previous.state, { hover: 0, duration: 1.2, ease: 'expo.out', overwrite: 'auto' });
      if (this.scene.mode === 'list') hideChars(previous.el.querySelectorAll<HTMLElement>('figcaption span'));
      previous.el.removeAttribute('data-hover');
    }
    const caption = this.root.querySelector<HTMLElement>('[data-hover-caption]')!;
    gsap.killTweensOf(caption);
    if (!tile) {
      if (this.scene.mode === 'overview') { caption.replaceChildren(); this.hoverIndex.set(0, false, { delay: .1 }); }
      return;
    }
    gsap.to(tile.state, { hover: 1, duration: 1.2, ease: 'expo.out', overwrite: 'auto' });
    tile.el.setAttribute('data-hover', '');
    const project = projects.find(item => item.slug === tile.slug)!;
    if (this.scene.mode === 'list') {
      revealChars(tile.el.querySelectorAll<HTMLElement>('figcaption span'), .08, .03);
    } else {
      this.hoverIndex.set(projectNumber(project), false, { delay: .2 });
      caption.replaceChildren();
      // Short pause, so passing over several photos does not flicker the caption.
      gsap.delayedCall(.08, () => {
        if (this.hovered !== tile) return;
        caption.innerHTML = `<span>${escapeHtml(project.title)}</span><span>${categoryName(project)}</span>`;
        revealChars(caption.querySelectorAll<HTMLElement>('span'), 0, .03);
      });
    }
  }

  private updateMobileCaption() {
    const tile = this.scene.current();
    if (!tile || tile.slug === this.mobileSlug) return;
    this.mobileSlug = tile.slug;
    const project = projects.find(item => item.slug === tile.slug)!;
    this.mobileIndex.set(projectNumber(project));
    const title = this.scene.root.querySelector<HTMLElement>('[data-mobile-title]')!;
    const category = this.scene.root.querySelector<HTMLElement>('[data-mobile-category]')!;
    title.innerHTML = `<span>${escapeHtml(project.title)}</span>`;
    category.innerHTML = `<span>${categoryName(project)}</span>`;
    revealChars([title.firstElementChild as HTMLElement, category.firstElementChild as HTMLElement], .05, .02);
  }

  private onPointerMove = (event: PointerEvent) => {
    this.pointer.mouse = event.pointerType === 'mouse';
    this.pointer.inside = true;
    this.pointer.x = event.clientX;
    this.pointer.y = event.clientY;
  };

  private onPointerLeave = () => { this.pointer.inside = false; if (this.pointer.mouse) this.setHover(undefined); };

  /**
   * Staged entry: grain → masked name/initials → selected cover develops → small text and reels →
   * cover shrinks to its gallery size → the gallery unfolds from it. Returns false when skipped (repeat visit).
   */
  private startIntro(gallery: gsap.core.Timeline): boolean {
    let visited = false;
    try { visited = Boolean(sessionStorage.getItem('xenia:visited')); sessionStorage.setItem('xenia:visited', 'true'); } catch { /* Full intro then. */ }
    if (visited || reducedMotion.matches) return false;
    const hero = this.scene.tiles.find(tile => tile.shown)!;
    const element = document.createElement('div');
    element.className = 'intro';
    element.innerHTML = `<div class="intro-top"><span data-reveal>Xenia / ${profile.name}</span><span data-reveal>Фотография<br>${profile.location}</span></div>
      <div class="intro-initials" aria-hidden="true">XP</div>
      <div class="intro-photo"><img src="${hero.img.currentSrc || hero.img.src}" alt="" /></div>
      <div class="intro-bottom"><p class="intro-name" aria-hidden="true">${profile.name}</p>
        <div class="intro-side"><button type="button" class="intro-skip" data-scramble>Пропустить</button><span class="intro-status" role="status">Загрузка фотографий</span><span class="intro-count" aria-hidden="true"></span></div></div>`;
    this.root.append(element);
    const count = new Counter(element.querySelector('.intro-count')!, 3);
    const photo = element.querySelector<HTMLElement>('.intro-photo')!;
    const status = element.querySelector<HTMLElement>('.intro-status')!;
    const progress = { value: 0 };
    const timeline = gsap.timeline();
    timeline.add(maskIn(element.querySelector('.intro-initials')!), .1)
      .add(maskIn(element.querySelector('.intro-name')!), .2)
      .fromTo(photo, { autoAlpha: 0 }, { autoAlpha: 1, duration: 1.6, ease: 'power2.inOut' }, .1)
      .fromTo(photo.firstElementChild, { scale: 1.5 }, { scale: 1.001, duration: 1.6, ease: 'power2.inOut' }, .1)
      .add(revealChars(element.querySelectorAll<HTMLElement>('[data-reveal]'), 0), .6)
      // The reels show the progress of the staged entry, not downloaded bytes; real loading has its own status line.
      .to(progress, { value: 100, duration: 2.4, ease: 'power2.inOut', onUpdate: () => count.set(progress.value, false, { duration: .3 }) }, .2)
      .addLabel('hold', 2.4);
    // Real readiness: the hero photo and fonts. A slow network extends the hold, capped at 6 s.
    const ready = Promise.race([Promise.allSettled([hero.img.decode(), document.fonts.ready]), new Promise(resolve => setTimeout(resolve, 6000))]);
    let released = false;
    const release = () => {
      if (released || this.intro?.element !== element) return;
      released = true;
      timeline.kill();
      status.textContent = 'Готово';
      const target = hero.el.querySelector('.photo-frame')!.getBoundingClientRect();
      const box = photo.getBoundingClientRect();
      gsap.timeline()
        .add(maskOut(element.querySelector('.intro-initials')!, { duration: .5 }), 0)
        .add(maskOut(element.querySelector('.intro-name')!, { duration: .5 }), 0)
        .to(element.querySelectorAll('.intro-top, .intro-side'), { autoAlpha: 0, duration: .5, ease: 'power2.out' }, 0)
        .to(photo, { x: target.left - box.left + (target.width - box.width) / 2, y: target.top - box.top + (target.height - box.height) / 2, width: target.width, height: target.height, duration: .7, ease: 'power2.out' }, .15)
        .to(element, { backgroundColor: 'rgba(254,254,254,0)', duration: .25 }, .6)
        .call(() => {
          // The gallery stack below now shows the same photo at the same box: drop the DOM copy, unfold the gallery.
          this.endIntro();
          gallery.play();
        });
    };
    const skip = () => { timeline.progress(1); release(); };
    element.querySelector('.intro-skip')!.addEventListener('click', skip);
    timeline.call(() => { void ready.then(release); }, [], 'hold');
    void ready.then(() => { if (!released) status.textContent = 'Фотографии загружены'; });
    this.intro = { timeline, skip, element };
    return true;
  }

  private endIntro() {
    if (!this.intro) return;
    const { element, timeline } = this.intro;
    timeline.kill();
    const focused = element.contains(document.activeElement);
    element.remove();
    this.intro = undefined;
    if (focused) this.main.focus({ preventScroll: true });
    const gallery = this.transition;
    if (gallery?.paused()) gallery.play();
  }

  private dispose() {
    this.revision++;
    this.transition?.kill();
    this.endIntro();
    this.scene.dispose();
    this.renderer?.dispose();
    this.lenis?.destroy();
    this.photoObserver?.disconnect();
    gsap.ticker.remove(this.tick);
    this.root.removeEventListener('click', this.onClick);
    this.root.removeEventListener('focusin', this.onFocusIn);
    this.root.removeEventListener('focusout', this.onFocusOut);
    this.root.removeEventListener('pointerover', this.onPointerOver);
    this.root.removeEventListener('error', this.onImageError, true);
    window.removeEventListener('hashchange', this.onHashChange);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('blur', this.onPointerLeave);
    document.documentElement.removeEventListener('pointerleave', this.onPointerLeave);
    reducedMotion.removeEventListener('change', this.onMotionChange);
    this.compact.removeEventListener('change', this.onLayoutChange);
    document.querySelector('.skip-link')?.removeEventListener('click', this.onSkip);
  }
}
