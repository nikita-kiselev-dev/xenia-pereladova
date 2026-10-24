import { asset, categories, projects, type Photo, type Project } from '../data/projects';

export const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
export const categoryName = (project: Project) => categories.find(category => category.id === project.category)!.title;
export const projectNumber = (project: Project) => projects.indexOf(project) + 1;

export function photoMarkup(photo: Photo, options: { webgl?: boolean; eager?: boolean; priority?: boolean; sizes?: string } = {}): string {
  return `<img ${options.webgl ? 'data-webgl draggable="false"' : ''} src="${asset(photo.thumbnail)}"
    srcset="${asset(photo.thumbnail)} 640w, ${asset(photo.src)} ${Math.max(photo.width, 641)}w"
    sizes="${options.sizes || '(max-width: 600px) 45vw, 22vw'}"
    width="${photo.width}" height="${photo.height}" alt="${escapeHtml(photo.alt)}"
    loading="${options.eager ? 'eager' : 'lazy'}"${options.priority ? ' fetchpriority="high"' : ''} decoding="async" />`;
}

/** Built once with every series; filters and views only hide/move tiles, so photos stay continuous. */
export function galleryMarkup(): string {
  const tiles = [...projects.map(project => ({ project, index: 0 })), ...projects.map(project => ({ project, index: Math.min(3, project.photos.length - 1) }))];
  return `<div class="gallery" data-gallery>
    <h1 class="sr-only">Фотографии Ксении Переладовой</h1>
    <div class="mobile-wordmark" aria-hidden="true">XP</div>
    <div class="gallery-intro gallery-intro--overview" aria-hidden="true"><span>[<span data-mobile-index></span>]</span><span data-mobile-title></span><span data-mobile-category></span></div>
    <div class="gallery-intro gallery-intro--list"><span>Ксения Переладова</span><span>Семья, портрет, события</span></div>
    <div class="list-stage"><div class="gallery-track">
      ${tiles.map(({ project, index }, tileIndex) => {
        const photo = index === 0 ? project.cover : project.photos[index];
        return `<a class="photo-link" draggable="false" data-tile="${project.slug}-${index}" data-project="${project.slug}" data-category="${project.category}" href="#/project/${project.slug}" aria-label="Открыть серию «${escapeHtml(project.title)}»">
          <figure><div class="photo-frame">${photoMarkup(photo, { webgl: true, eager: tileIndex < 10, priority: tileIndex === 0, sizes: '(max-width: 1023px) 40vw, 12vw' })}</div>
          <figcaption aria-hidden="true"><span>${escapeHtml(project.title)}</span><span>${String(projectNumber(project)).padStart(2, '0')}</span></figcaption></figure>
        </a>`;
      }).join('')}
    </div></div>
    <div class="text-list" aria-label="Серии фотографий">
      ${projects.map(project => `<a href="#/project/${project.slug}" data-project="${project.slug}" data-category="${project.category}">
        <span class="text-list-index">[${String(projectNumber(project)).padStart(2, '0')}]</span>
        <span class="text-list-name">${escapeHtml(project.title)}<small>${categoryName(project)}</small></span>
        <span class="text-list-open">Смотреть</span>
      </a>`).join('')}
    </div>
  </div>`;
}
