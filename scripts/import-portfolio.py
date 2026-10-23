"""Импорт web-копий из указанного пользователем портфолио, без оригиналов."""
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser
from pathlib import Path
from urllib.request import Request, urlopen
import hashlib
import io
import json
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
ORIGIN = 'https://pereladova.wfolio.pro'

def fetch(url):
    with urlopen(Request(url, headers={'User-Agent': 'Mozilla/5.0'}), timeout=45) as response:
        return response.read()

class Page(HTMLParser):
    def __init__(self, html):
        super().__init__()
        self.images, self.links, self.stack = [], [], []
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'a' and 'href' in attrs:
            self.links.append(attrs)
        if tag == 'img' and 'data-src' in attrs:
            parent = next((a for t, a in reversed(self.stack) if 'data-width' in a), {})
            attrs['originalWidth'] = parent.get('data-width', '0')
            attrs['originalHeight'] = parent.get('data-height', '0')
            attrs['gallery'] = any('gallery' in a.get('class', '') for _, a in self.stack)
            self.images.append(attrs)
        if tag not in ('img', 'br', 'hr', 'meta', 'input', 'link', 'source', 'wbr'):
            self.stack.append((tag, attrs))

    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == tag:
                self.stack = self.stack[:i]
                break

def source_image(image, target=1240):
    variants = []
    for entry in image.get('data-srcset', '').split(','):
        parts = entry.strip().split()
        if len(parts) == 2 and parts[1].endswith('w'):
            variants.append((int(parts[1][:-1]), parts[0]))
    if variants:
        url = min(variants, key=lambda x: abs(x[0] - target))[1]
    else:
        url = image['data-src']
    return 'https:' + url if url.startswith('//') else url

def save_photo(args):
    slug, index, image = args
    url = source_image(image)
    directory = ROOT / 'public/images' / slug
    directory.mkdir(parents=True, exist_ok=True)
    name = f'{index + 1:02}'
    cache = ROOT / '.asset-cache' / hashlib.sha256(url.encode()).hexdigest()
    cache.parent.mkdir(exist_ok=True)
    if not cache.exists():
        cache.write_bytes(fetch(url))
    photo = ImageOps.exif_transpose(Image.open(io.BytesIO(cache.read_bytes()))).convert('RGB')
    photo.thumbnail((1600, 1600))
    width, height = photo.size
    photo.save(directory / f'{name}.webp', 'WEBP', quality=84, method=6)
    photo.thumbnail((640, 640))
    photo.save(directory / f'{name}-small.webp', 'WEBP', quality=80, method=6)
    return {'src': f'images/{slug}/{name}.webp', 'thumbnail': f'images/{slug}/{name}-small.webp',
            'width': width, 'height': height, 'alt': image.get('alt', '').split('. Твой')[0], 'source': url}

def main():
    covers = {}
    for category in ['semeynaya-fotosessiya', 'zhenskiy-portret', 'reportazh-1']:
        listing = Page(fetch(ORIGIN + '/' + category).decode())
        covers.update({image.get('alt', '').replace('\u00a0', ' '): image for image in listing.images})
    for category in ['zhenskiy-portret', 'reportazh-1']:
        page = Page(fetch(ORIGIN + '/' + category).decode())
        print(category, [a['href'] for a in page.links if 'listing-link' in a.get('class', '')])
    config = [
        ('sasha-s-synom-v-otele', 'Саша с сыном в отеле', 'family'),
        ('mama-s-dochkoy', 'Мама с дочкой', 'family'),
        ('korolevskaya-dvoynya', 'Королевская двойня', 'family'),
        ('novogodnie-studiynye', 'Новогодние студийные', 'family'),
    ]
    for category, key in [('zhenskiy-portret', 'portrait'), ('reportazh-1', 'events')]:
        page = Page(fetch(ORIGIN + '/' + category).decode())
        links = [a['href'] for a in page.links if 'listing-link' in a.get('class', '')]
        for link in links[:2]:
            slug = link.strip('/')
            album = Page(fetch(ORIGIN + link).decode())
            title = next((i.get('alt', '').split('. Твой')[0] for i in album.images if i['gallery']), slug)
            config.append((slug, title, key))
    projects = []
    for slug, title, category in config:
        html = fetch(ORIGIN + '/' + slug).decode()
        page = Page(html)
        images = [image for image in page.images if image['gallery']]
        if not images:
            raise RuntimeError(f'No gallery photos: {slug}')
        # A small editorial selection; the full album remains at its source URL.
        selected = images[:8]
        with ThreadPoolExecutor(max_workers=4) as pool:
            photos = list(pool.map(save_photo, [(slug, i, image) for i, image in enumerate(selected)]))
        cover = save_photo((slug, 99, covers[title])) if title in covers else photos[0]
        projects.append({'slug': slug, 'title': title, 'category': category, 'source': ORIGIN + '/' + slug, 'cover': cover, 'photos': photos})
        print(slug, len(images), '=>', len(photos), flush=True)
    contact = Page(fetch(ORIGIN + '/contacts').decode())
    portrait_image = next(image for image in contact.images if image.get('alt', '').startswith('Контакты'))
    profile = save_photo(('profile', 0, {**portrait_image, 'alt': 'Ксения Переладова'}))
    (ROOT / 'src/data/portfolio.json').write_text(json.dumps({'projects': projects, 'portrait': profile}, ensure_ascii=False, indent=2), encoding='utf-8')
    (ROOT / 'docs/research/assets-manifest.json').write_text(json.dumps({'importedAt': '2026-10-23', 'origin': ORIGIN, 'projects': projects, 'portrait': profile}, ensure_ascii=False, indent=2), encoding='utf-8')

if __name__ == '__main__':
    main()
