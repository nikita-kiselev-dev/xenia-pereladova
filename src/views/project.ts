import { projects } from '../data/projects';
import { categoryName, escapeHtml, photoMarkup } from './gallery';

export function projectMarkup(slug: string): string {
  const project = projects.find(item => item.slug === slug);
  if (!project) return `<section class="not-found"><p data-reveal>Серия не найдена</p><h1 tabindex="-1" data-mask>Вернёмся<br>к фотографиям.</h1><a href="#/overview" data-reveal data-scramble>Открыть портфолио</a></section>`;
  const index = projects.indexOf(project);
  const next = projects[(index + 1) % projects.length];
  // The cover opens the series: the photo that flew in from the gallery is its first frame, not a different one.
  const frames = [project.cover, ...project.photos];
  return `<header class="project-heading"><div><span class="project-index" data-reveal>/${String(index + 1).padStart(2, '0')}</span>
    <h1 tabindex="-1" data-reveal>${escapeHtml(project.title)}</h1><p data-reveal>${categoryName(project)}</p>
    <p data-reveal>${frames.length} фотографий</p></div><button class="close-button" data-close data-reveal data-scramble aria-label="Закрыть серию">[Закрыть]</button></header>
    <div class="project-photos">${frames.map((photo, photoIndex) => `<figure class="project-photo" data-photo-index="${photoIndex + 1}">
      <div class="project-photo-frame" style="--ratio:${photo.width / photo.height}">${photoMarkup(photo, { eager: photoIndex === 0, priority: photoIndex === 0, sizes: '(max-width: 600px) 92vw, 80vw' })}</div>
      <figcaption class="sr-only">${escapeHtml(project.title)}, фотография ${photoIndex + 1} из ${frames.length}</figcaption>
    </figure>`).join('')}</div>
    <div class="next-project"><p>Следующая серия</p><a href="#/project/${next.slug}">${escapeHtml(next.title)}<span aria-hidden="true">↗</span></a><button data-close data-scramble>Ко всем фотографиям</button></div>
    <div class="project-counter"><span data-current-photo></span><span class="counter-total" data-reveal>/${String(frames.length).padStart(2, '0')}</span></div>`;
}
