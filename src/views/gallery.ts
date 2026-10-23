import { asset, categories, projects, type Category, type Photo, type Project } from '../data/projects';
import type { View } from '../navigation';

export const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);

export function photoMarkup(photo: Photo, options: { webgl?: boolean; eager?: boolean; sizes?: string } = {}): string {
  return `<img ${options.webgl ? 'data-webgl' : ''} src="${asset(photo.thumbnail)}"
    srcset="${asset(photo.thumbnail)} 640w, ${asset(photo.src)} ${Math.max(photo.width, 641)}w"
    sizes="${options.sizes || '(max-width: 600px) 45vw, 22vw'}"
    width="${photo.width}" height="${photo.height}" alt="${escapeHtml(photo.alt)}"
    loading="${options.eager ? 'eager' : 'lazy'}" decoding="async" />`;
}

export function galleryMarkup(view: View, filter: Category): string {
  const selected = projects.filter(project => filter === 'all' || project.category === filter);
  const tiles = [...selected.map(project => ({ project, index: 0 })), ...selected.map(project => ({ project, index: Math.min(3, project.photos.length - 1) }))];
  const categoryName = (project: Project) => categories.find(category => category.id === project.category)!.title;
  const first = selected[0];
  return `<h1 class="sr-only">Фотографии Ксении Переладовой</h1>
    <div class="mobile-wordmark" aria-hidden="true">XP</div>
    <div class="gallery-intro">${view === 'overview' ? `<span data-mobile-index>[${first ? String(projects.indexOf(first) + 1).padStart(2, '0') : '00'}]</span><span data-mobile-title>${escapeHtml(first?.title || 'Нет серий')}</span><span data-mobile-category>${first ? categoryName(first) : ''}</span>` : '<span>Ксения Переладова</span><span>Семья, портрет, события</span>'}</div>
    <div class="gallery ${view === 'list' ? 'gallery--list' : 'gallery--overview'}" data-gallery>
      <div class="list-stage"><div class="gallery-track">
        ${tiles.map(({ project, index }, tileIndex) => {
          const photo = index === 0 ? project.cover : project.photos[index];
          return `<a class="photo-link" data-tile="${project.slug}-${index}" data-project="${project.slug}" href="#/project/${project.slug}" aria-label="Открыть серию «${escapeHtml(project.title)}»">
            <figure><div class="photo-frame" style="--ratio:${photo.width / photo.height}">${photoMarkup(photo, { webgl: true, eager: tileIndex < 10 })}</div>
            <figcaption><span>${escapeHtml(project.title)}</span><span>${String(projects.indexOf(project) + 1).padStart(2, '0')}</span></figcaption></figure>
          </a>`;
        }).join('')}
      </div></div>
      <div class="text-list" aria-label="Серии фотографий">
        ${selected.map(project => `<a href="#/project/${project.slug}" data-project="${project.slug}">
          <span class="text-list-index">[${String(projects.indexOf(project) + 1).padStart(2, '0')}]</span>
          <span class="text-list-name">${escapeHtml(project.title)}<small>${categoryName(project)}</small></span>
          <span class="text-list-open">Смотреть</span>
        </a>`).join('')}
      </div>
      ${selected.length ? '' : '<p class="empty-state">В этой категории пока нет серий. Выберите «все».</p>'}
    </div>`;
}
