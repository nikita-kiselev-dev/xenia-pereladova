import { categories, projects } from '../data/projects';
import { escapeHtml, photoMarkup } from './gallery';

export function projectMarkup(slug: string): string {
  const project = projects.find(item => item.slug === slug);
  if (!project) return `<section class="not-found"><p>Серия не найдена</p><h1>Вернёмся<br>к фотографиям.</h1><a href="#/overview">Открыть портфолио</a></section>`;
  const index = projects.indexOf(project);
  const next = projects[(index + 1) % projects.length];
  return `<header class="project-heading"><div><span class="project-index">/${String(index + 1).padStart(2, '0')}</span>
    <h1 tabindex="-1">${escapeHtml(project.title)}</h1><p>${categories.find(category => category.id === project.category)!.title}</p>
    <p>${project.photos.length} фотографий</p></div><button class="close-button" data-close aria-label="Закрыть серию">[Закрыть]</button></header>
    <div class="project-photos">${project.photos.map((photo, photoIndex) => `<figure class="project-photo" data-photo-index="${photoIndex + 1}">
      <div class="project-photo-frame" style="--ratio:${photo.width / photo.height}">${photoMarkup(photo, { eager: photoIndex === 0, sizes: '(max-width: 600px) 92vw, 80vw' })}</div>
      <figcaption class="sr-only">${escapeHtml(project.title)}, фотография ${photoIndex + 1} из ${project.photos.length}</figcaption>
    </figure>`).join('')}</div>
    <div class="next-project"><p>Следующая серия</p><a href="#/project/${next.slug}">${escapeHtml(next.title)}<span aria-hidden="true">↗</span></a><button data-close>Ко всем фотографиям</button></div>
    <div class="project-counter" aria-label="Номер фотографии"><span data-current-photo>01</span><span class="counter-total">/${String(project.photos.length).padStart(2, '0')}</span></div>`;
}
