export type Filter = 'all' | 'family' | 'portrait' | 'events';
export type View = 'overview' | 'list';
export type Route = { page: View; filter: Filter } | { page: 'project'; slug: string } | { page: 'info' };
const filters: Filter[] = ['all', 'family', 'portrait', 'events'];

export function parseRoute(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#\/?/, '').split('?');
  if (path === 'info') return { page: 'info' };
  if (path.startsWith('project/')) {
    try {
      return { page: 'project', slug: decodeURIComponent(path.slice(8)) };
    } catch {
      return { page: 'project', slug: '' };
    }
  }
  const requested = path === 'list' ? new URLSearchParams(query).get('filter') : null;
  return { page: path === 'list' ? 'list' : 'overview', filter: filters.includes(requested as Filter) ? requested as Filter : 'all' };
}

export function galleryHash(view: View, filter: Filter = 'all'): string {
  return `#/${view}${view === 'list' && filter !== 'all' ? `?filter=${filter}` : ''}`;
}
