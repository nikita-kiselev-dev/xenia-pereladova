import { gsap } from 'gsap';
import Lenis from 'lenis';
import { categories, profile, projects } from './data/projects';
import { galleryHash, parseRoute, type Route } from './navigation';
import { galleryMarkup } from './views/gallery';
import { projectMarkup } from './views/project';
import { infoMarkup } from './views/info';
import type { GalleryRenderer } from './webgl/gallery-renderer';

type Position = { y: number; slug?: string };
const isGallery = (route: Route): route is Extract<Route, { page: 'overview' | 'list' }> => route.page === 'overview' || route.page === 'list';

export class App {
  private route = parseRoute(location.hash);
  private renderedHash = location.hash || '#/overview';
  private main: HTMLElement;
  private footer: HTMLElement;
  private header: HTMLElement;
  private progress: HTMLElement;
  private lenis?: Lenis;
  private renderer?: GalleryRenderer;
  private timeline?: gsap.core.Timeline;
  private revision = 0;
  private lastGallery = '#/overview';
  private positions = new Map<string, Position>();
  private reduced = matchMedia('(prefers-reduced-motion: reduce)');
  private compact = matchMedia('(max-width: 1023px)');
  private previousScroll = 0;
  private photoObserver?: IntersectionObserver;
  private resizeObserver: ResizeObserver;
  private listTrack?: HTMLElement;
  private listDistance = 0;
  private activeSlug?: string;
  private mobileActiveSlug?: string;

  constructor(private root: HTMLElement) {
    history.scrollRestoration = 'manual';
    root.innerHTML = `<header class="site-header">
      <a class="site-name" href="#/overview">${profile.name}</a>
      <p class="site-bio">Фотограф<br>${profile.location}</p>
      <nav class="site-nav" aria-label="Основная навигация">
        <a data-nav="overview" href="#/overview">Обзор</a><span class="nav-slash" aria-hidden="true">/</span><a data-nav="list" href="#/list">Список</a>
        <a data-nav="info" class="info-nav" href="#/info">/ Обо мне</a>
      </nav><a class="site-contact text-link" href="${profile.telegram}" target="_blank" rel="noopener noreferrer">Написать в Telegram</a>
    </header><main id="main" tabindex="-1"></main>
    <footer class="site-footer"><a class="copyright" href="#/info">© ${new Date().getFullYear()}</a>
      <div class="filters" aria-label="Категории фотографий">${categories.map(category => `<button data-filter="${category.id}" aria-pressed="false">${category.title}</button>`).join('')}</div>
      <div class="overview-focus" aria-hidden="true"><span data-hover-index>00</span><p data-hover-caption></p></div>
      <span class="progress" aria-label="Просмотрено">[000%]</span>
    </footer><div class="noise" aria-hidden="true"></div><div class="cursor" aria-hidden="true"></div>
    <p class="sr-only" role="status" aria-live="polite" data-status></p>`;
    this.main = root.querySelector('main')!;
    this.footer = root.querySelector('.site-footer')!;
    this.header = root.querySelector('.site-header')!;
    this.progress = root.querySelector('.progress')!;
    try { this.lastGallery = sessionStorage.getItem('xenia:gallery') || this.lastGallery; } catch { /* Storage may be disabled. */ }
    if (!isGallery(parseRoute(this.lastGallery))) this.lastGallery = '#/overview';
    root.addEventListener('click', this.onClick);
    root.addEventListener('focusin', this.onFocusIn);
    root.addEventListener('error', this.onImageError, true);
    window.addEventListener('hashchange', this.onHashChange);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('resize', this.onResize);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.reduced.addEventListener('change', this.onMotionChange);
    this.compact.addEventListener('change', this.onLayoutChange);
    document.querySelector('.skip-link')?.addEventListener('click', this.onSkip);
    this.resizeObserver = new ResizeObserver(() => this.measureList());
    this.configureScroll();
    this.render(true);
    gsap.ticker.add(this.tick);
    this.setupCursor();
    void this.showIntro();
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
    if (!isGallery(this.route)) return;
    const focused = document.activeElement instanceof HTMLElement ? document.activeElement.closest<HTMLElement>('[data-project]')?.dataset.project : undefined;
    this.positions.set(this.renderedHash, { y: window.scrollY, slug: focused });
  }

  private onClick = (event: MouseEvent) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (target.closest('[data-close]')) { this.close(); return; }
    const filter = target.closest<HTMLButtonElement>('[data-filter]');
    if (filter && isGallery(this.route)) {
      this.rememberPosition();
      location.hash = galleryHash(this.route.page, filter.dataset.filter as typeof this.route.filter);
      return;
    }
    const link = target.closest<HTMLAnchorElement>('a[href^="#/"]');
    if (link && !event.ctrlKey && !event.metaKey && !event.shiftKey && event.button === 0) {
      event.preventDefault();
      this.rememberPosition();
      if (link.hash !== location.hash) location.hash = link.hash;
    }
  };

  private onHashChange = () => {
    this.rememberPosition();
    const next = parseRoute(location.hash);
    const previous = this.route;
    if (isGallery(previous)) {
      this.lastGallery = this.renderedHash;
      try { sessionStorage.setItem('xenia:gallery', this.lastGallery); } catch { /* Optional persistence. */ }
      if (!isGallery(next)) history.replaceState({ ...history.state, xeniaReturn: this.lastGallery }, '');
    }
    this.route = next;
    this.renderedHash = location.hash;
    this.render(false, previous);
  };

  private close() {
    if (history.state?.xeniaReturn === this.lastGallery) history.back();
    else location.hash = this.lastGallery;
  }

  private onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && !isGallery(this.route)) this.close();
  };

  private onSkip = (event: Event) => { event.preventDefault(); this.main.focus({ preventScroll: true }); };

  private onFocusIn = (event: FocusEvent) => {
    if (!(event.target instanceof HTMLElement)) return;
    const link = event.target.closest<HTMLElement>('.photo-link');
    if (this.route.page === 'overview') this.setActiveProject(link?.dataset.project);
    if (!this.listTrack || !link) return;
    const rect = link.getBoundingClientRect();
    if (rect.left < 20 || rect.right > innerWidth - 20) this.setScroll(Math.max(0, Math.min(this.listDistance, window.scrollY + rect.left - (innerWidth - rect.width) / 2)));
  };

  private configureScroll() {
    this.lenis?.destroy();
    this.lenis = undefined;
    if (!this.reduced.matches) this.lenis = new Lenis({ lerp: .085, smoothWheel: true, syncTouch: false });
  }

  private onMotionChange = () => {
    const revision = ++this.revision;
    this.timeline?.progress(1).kill();
    this.root.dataset.phase = 'ready';
    this.configureScroll();
    this.renderer?.dispose();
    this.renderer = undefined;
    if (this.reduced.matches) this.root.querySelector('.intro')?.remove();
    else if (isGallery(this.route)) void this.mountRenderer(revision);
  };

  private onLayoutChange = () => { if (isGallery(this.route)) { this.rememberPosition(); this.render(true); } };
  private onResize = () => { this.measureList(); this.lenis?.resize(); };
  private onVisibilityChange = () => { this.previousScroll = window.scrollY; };

  private render(initial: boolean, previous?: Route) {
    const revision = ++this.revision;
    const savedRects = new Map<string, DOMRect>();
    if (previous && isGallery(previous) && isGallery(this.route)) {
      this.main.querySelectorAll<HTMLElement>('[data-tile]').forEach(element => savedRects.set(element.dataset.tile!, element.getBoundingClientRect()));
    }
    this.timeline?.kill();
    this.renderer?.dispose();
    this.renderer = undefined;
    this.photoObserver?.disconnect();
    this.resizeObserver.disconnect();
    this.listTrack = undefined;
    this.mobileActiveSlug = undefined;
    this.listDistance = 0;
    const gallery = isGallery(this.route);
    this.root.dataset.page = this.route.page;
    this.root.dataset.phase = 'ready';
    this.header.hidden = !gallery;
    this.footer.hidden = !gallery;
    this.footer.dataset.view = this.route.page;
    this.setActiveProject(undefined);
    this.main.className = gallery ? `gallery-main view-${this.route.page}` : `${this.route.page}-main`;
    this.main.style.minHeight = '';
    if (gallery) {
      const route = this.route as Extract<Route, { page: 'overview' | 'list' }>;
      this.main.innerHTML = galleryMarkup(route.page, route.filter);
      this.root.querySelectorAll<HTMLAnchorElement>('[data-nav]').forEach(link => {
        const page = link.dataset.nav!;
        link.setAttribute('aria-current', page === route.page ? 'page' : 'false');
        link.href = page === 'info' ? '#/info' : galleryHash(page as 'overview' | 'list', route.filter);
      });
      this.root.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.filter === route.filter)));
      this.lastGallery = galleryHash(route.page, route.filter);
      if ((route.page === 'list' && !this.compact.matches) || (route.page === 'overview' && this.compact.matches)) this.listTrack = this.main.querySelector('.gallery-track')!;
      if (this.listTrack) this.resizeObserver.observe(this.listTrack);
      this.measureList();
      const position = this.positions.get(this.renderedHash);
      this.setScroll(position?.y || 0);
      if (!initial && previous && !isGallery(previous)) {
        const visibleList = route.page === 'list' && this.compact.matches;
        const link = position?.slug ? this.main.querySelector<HTMLAnchorElement>(`${visibleList ? '.text-list' : '.gallery-track'} [data-project="${position.slug}"]`) : undefined;
        (link || this.main).focus({ preventScroll: true });
      }
      document.title = `${route.page === 'list' ? 'Серии' : 'Фотографии'} — ${profile.name}`;
      if (!this.reduced.matches) void this.mountRenderer(revision);
    } else if (this.route.page === 'project') {
      this.main.innerHTML = projectMarkup(this.route.slug);
      document.title = `${projects.find(item => this.route.page === 'project' && item.slug === this.route.slug)?.title || 'Серия не найдена'} — ${profile.name}`;
      this.setScroll(0);
      this.observePhotos();
      if (!initial) (this.main.querySelector<HTMLElement>('h1') || this.main).focus({ preventScroll: true });
    } else {
      this.main.innerHTML = infoMarkup();
      document.title = `Обо мне — ${profile.name}`;
      this.setScroll(0);
      this.updateClock();
      if (!initial) this.main.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
    }
    this.main.querySelectorAll<HTMLImageElement>('img').forEach(image => {
      if (image.complete && image.naturalWidth === 0) image.dispatchEvent(new Event('error'));
    });
    this.lenis?.resize();
    if (!initial && !this.reduced.matches) {
      this.root.dataset.phase = 'transition';
      this.timeline = gsap.timeline({ onComplete: () => { if (revision === this.revision) this.root.dataset.phase = 'ready'; } });
      if (savedRects.size && gallery) {
        this.main.querySelectorAll<HTMLElement>('[data-tile]').forEach(element => {
          const old = savedRects.get(element.dataset.tile!);
          const rect = element.getBoundingClientRect();
          if (!old?.width || !old.height || !rect.width || !rect.height) return;
          this.timeline!.from(element, { x: old.x - rect.x, y: old.y - rect.y, scaleX: old.width / rect.width, scaleY: old.height / rect.height, transformOrigin: '0 0', duration: .7, ease: 'power3.inOut', clearProps: 'transform' }, 0);
        });
      }
      if (!this.timeline.getChildren().length) {
        const targets = this.main.querySelectorAll('.photo-link,.text-list>a,.project-photo,.info-copy,.info-portrait,.not-found');
        if (targets.length) this.timeline.from(targets, { y: 18, duration: .48, ease: 'power3.out', clearProps: 'transform' });
        else this.root.dataset.phase = 'ready';
      }
    }
    this.root.querySelector<HTMLElement>('[data-status]')!.textContent = gallery ? `${categories.find(category => isGallery(this.route) && category.id === this.route.filter)?.title}. ${this.main.querySelectorAll('.text-list>a').length} серий.` : document.title;
    this.root.dataset.ready = 'true';
  }

  private async mountRenderer(revision: number) {
    try {
      const { GalleryRenderer } = await import('./webgl/gallery-renderer');
      if (revision !== this.revision || this.reduced.matches || !isGallery(this.route)) return;
      if (this.route.page === 'list' && this.compact.matches) return;
      this.renderer = new GalleryRenderer(this.main);
    } catch {
      this.main.dataset.renderer = 'unavailable';
    }
  }

  private setScroll(y: number) {
    this.lenis?.resize();
    if (this.lenis) this.lenis.scrollTo(y, { immediate: true, force: true });
    else window.scrollTo(0, y);
    this.previousScroll = y;
    this.updateList();
  }

  private measureList() {
    if (!this.listTrack) return;
    this.listDistance = Math.max(0, this.listTrack.scrollWidth - window.innerWidth);
    this.main.style.minHeight = `${window.innerHeight + this.listDistance}px`;
    this.updateList();
    this.lenis?.resize();
  }

  private updateList() {
    if (!this.listTrack) return;
    this.listTrack.style.transform = `translate3d(${-Math.min(window.scrollY, this.listDistance)}px,0,0)`;
    if (this.route.page !== 'overview' || !this.compact.matches) return;
    let nearest: HTMLElement | undefined;
    let distance = Infinity;
    for (const element of this.listTrack.querySelectorAll<HTMLElement>('.photo-link')) {
      const delta = Math.abs(element.offsetLeft + element.offsetWidth / 2 - window.scrollY - innerWidth / 2);
      if (delta < distance) { distance = delta; nearest = element; }
    }
    const slug = nearest?.dataset.project;
    if (slug === this.mobileActiveSlug) return;
    this.mobileActiveSlug = slug;
    const project = projects.find(project => project.slug === slug);
    if (!project) return;
    this.main.querySelector<HTMLElement>('[data-mobile-index]')!.textContent = `[${String(projects.indexOf(project) + 1).padStart(2, '0')}]`;
    this.main.querySelector<HTMLElement>('[data-mobile-title]')!.textContent = project.title;
    this.main.querySelector<HTMLElement>('[data-mobile-category]')!.textContent = categories.find(category => category.id === project.category)!.title;
  }

  private observePhotos() {
    this.photoObserver = new IntersectionObserver(entries => {
      const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      const index = visible?.target.getAttribute('data-photo-index');
      if (index) this.main.querySelector<HTMLElement>('[data-current-photo]')!.textContent = index.padStart(2, '0');
    }, { threshold: [.25, .5, .75] });
    this.main.querySelectorAll('[data-photo-index]').forEach(photo => this.photoObserver!.observe(photo));
  }

  private updateClock() {
    const clock = this.main.querySelector('time');
    if (clock) { clock.textContent = new Intl.DateTimeFormat('ru', { timeZone: 'Asia/Novosibirsk', hour: '2-digit', minute: '2-digit' }).format(new Date()); clock.dateTime = new Date().toISOString(); }
  }

  private tick = (time: number) => {
    if (document.hidden) return;
    this.lenis?.raf(time * 1000);
    this.updateList();
    const velocity = window.scrollY - this.previousScroll;
    this.previousScroll = window.scrollY;
    this.renderer?.update(velocity);
    const height = document.documentElement.scrollHeight - window.innerHeight;
    const percent = height > 0 ? Math.round(window.scrollY / height * 100) : 0;
    this.progress.textContent = `[${String(Math.max(0, Math.min(100, percent))).padStart(3, '0')}%]`;
  };

  private pointerMove = (event: PointerEvent) => {
    const cursor = this.root.querySelector<HTMLElement>('.cursor')!;
    if (event.pointerType === 'touch' || this.reduced.matches) return;
    if (this.route.page === 'overview') this.setActiveProject(event.target instanceof Element ? event.target.closest<HTMLElement>('[data-project]')?.dataset.project : undefined);
    cursor.style.opacity = '.8';
    cursor.style.left = `${event.clientX}px`;
    cursor.style.top = `${event.clientY}px`;
  };

  private setActiveProject(slug?: string) {
    if (this.activeSlug === slug) return;
    this.activeSlug = slug;
    const project = projects.find(project => project.slug === slug);
    this.root.querySelector<HTMLElement>('[data-hover-index]')!.textContent = project ? String(projects.indexOf(project) + 1).padStart(2, '0') : '00';
    this.root.querySelector<HTMLElement>('[data-hover-caption]')!.textContent = project ? project.title : '';
  }

  private pointerLeave = () => { this.root.querySelector<HTMLElement>('.cursor')!.style.opacity = '0'; this.setActiveProject(undefined); };
  private setupCursor() {
    window.addEventListener('pointermove', this.pointerMove);
    document.addEventListener('pointerleave', this.pointerLeave);
  }

  private async showIntro() {
    if (this.reduced.matches) return;
    try { if (sessionStorage.getItem('xenia:visited')) return; } catch { /* Intro still has timeout. */ }
    const intro = document.createElement('div');
    intro.className = 'intro';
    intro.setAttribute('role', 'status');
    intro.setAttribute('aria-label', 'Загрузка портфолио');
    intro.innerHTML = `<div class="intro-top"><span>Xenia / ${profile.name}</span><span>Фотография<br>${profile.location}</span></div><div class="intro-name" aria-hidden="true">XP</div><div class="intro-bottom"><button>Открыть портфолио</button><span class="intro-progress" aria-hidden="true">000</span></div>`;
    this.root.append(intro);
    const critical = [...this.main.querySelectorAll<HTMLImageElement>('img[loading="eager"]')].slice(0, 5);
    let complete = 0;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      const active = intro.contains(document.activeElement);
      gsap.to(intro, { yPercent: -102, duration: .6, ease: 'power3.inOut', onComplete: () => { intro.remove(); if (active) this.main.focus({ preventScroll: true }); } });
      try { sessionStorage.setItem('xenia:visited', 'true'); } catch { /* No persistent requirement. */ }
    };
    intro.querySelector('button')!.addEventListener('click', finish, { once: true });
    const loaded = critical.map(image => image.decode().catch(() => undefined).then(() => {
      complete++;
      intro.querySelector<HTMLElement>('.intro-progress')!.textContent = String(Math.round(complete / Math.max(1, critical.length) * 100)).padStart(3, '0');
    }));
    const timeout = window.setTimeout(finish, 3500);
    await Promise.allSettled([...loaded, document.fonts.ready]);
    clearTimeout(timeout);
    finish();
  }

  private dispose() {
    this.revision++;
    this.timeline?.kill();
    this.renderer?.dispose();
    this.lenis?.destroy();
    this.photoObserver?.disconnect();
    this.resizeObserver.disconnect();
    gsap.ticker.remove(this.tick);
    this.root.removeEventListener('click', this.onClick);
    this.root.removeEventListener('focusin', this.onFocusIn);
    this.root.removeEventListener('error', this.onImageError, true);
    window.removeEventListener('hashchange', this.onHashChange);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('pointermove', this.pointerMove);
    document.removeEventListener('pointerleave', this.pointerLeave);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.reduced.removeEventListener('change', this.onMotionChange);
    this.compact.removeEventListener('change', this.onLayoutChange);
    document.querySelector('.skip-link')?.removeEventListener('click', this.onSkip);
  }
}
