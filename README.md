# Xenia Photo Website

Статическое портфолио Ксении Переладовой: пространственный Обзор на desktop, горизонтальная галерея с fixed инициалами на узком экране, desktop-лента/мобильный Список, фотосерии и информация о фотографе.
Vite + TypeScript, GSAP, Lenis, Three.js. [Опубликованный сайт](https://nikita-kiselev-dev.github.io/xenia-pereladova/); визуальная приёмка остаётся отдельным этапом.

## Запуск

Node.js 24; версии библиотек закреплены в `package-lock.json`.

```powershell
npm ci
npm run dev
```

Проверка production-сборки:

```powershell
npm run typecheck
npm test
npm run build
npm run preview
```

`npm ci` на Windows выполнять после остановки Vite: работающий процесс удерживает native binding Rolldown.
Сайт открывать через HTTP. Открытие `index.html` через `file://` не поддерживается.

## Контент

Фото и контакты — из [старого портфолио](https://pereladova.wfolio.pro/semeynaya-fotosessiya), переданного пользователем.
Сейчас отобраны 8 серий: 63 кадра, 8 обложек и портрет. Это первый отбор, не весь прежний архив.
Данные — `src/data/portfolio.json`, контакты/имя — `src/data/projects.ts`.
Изображения и WebGL используют тот же manifest; картинки доступны без WebGL.
Даты съёмок и клиентские метаданные не придуманы. Шрифт — IBM Plex Mono OFL; display — Arial/Helvetica.

Повторный импорт (не нужен для обычной сборки):

```powershell
python -m pip install -r scripts/requirements.txt
python scripts/import-portfolio.py
```

Источник каждой web-копии сохранён в `docs/research/assets-manifest.json`. Импорт не меняет старый сайт и исходные оригиналы.

## Навигация и эффекты

Маршруты: `#/overview`, `#/list`, `#/project/<slug>`, `#/info`.
Категория хранится как `?filter=family` внутри hash. Close/Escape возвращают контекст галереи; Back/Forward и refresh поддержаны.
Motion по [WEBSITE_MOTION_PLAN.md](WEBSITE_MOTION_PLAN.md); что реализовано и проверено — [docs/qa/motion-report.md](docs/qa/motion-report.md).
Галерея — одна постоянная DOM-сцена (`src/gallery-scene.ts`, геометрия в `src/gallery-layout.ts`) с циклическим scroll и WebGL-зеркалом (`src/webgl/gallery-renderer.ts`); тексты и барабаны — `src/motion.ts`.
Зерно и displacement — собственные `public/grain.png`, `public/disp.jpg` (`python scripts/make-textures.py`).
Reduced motion отключает intro, Lenis, инерцию и WebGL, зерно статично. Ошибка GPU возвращает DOM-изображения.

Motion-клипы (нужны Chrome и ffmpeg): `node tests/motion-capture.mjs http://127.0.0.1:4173/ docs/qa/motion`.

## Browser QA

Результаты, границы проверки и снимки: [docs/qa/acceptance.md](docs/qa/acceptance.md).
Один browser harness — `tests/browser-smoke.mjs`, использующий документированный CUA tab API в Codex; не предназначен для вставки в browser console.
Функции: `runCore(tab, baseURL)`, `runResponsive(tab, viewport, saveScreenshot)`, `runResizePreservation(tab, viewport)`, `runNarrowOverview(tab, viewport)`, `runFallbacks(tab, qaBaseURL)`.
Node-тесты маршрутов и целостности manifest запускаются обычным `npm test`.

Для fault injection собрать отдельный QA artifact:

```powershell
npm run build:qa
npm run preview -- --mode qa --port 4174
```

Тестовые страницы — `/tests/fixture.html?scenario=no-webgl#/overview`, `reduced-motion`, `context-loss`, `missing-image`, `profile`.
Они присутствуют только в `.qa-dist`, не попадают в `dist` и GitHub Pages.

## GitHub Pages

Workflow подготовлен в `.github/workflows/deploy.yml`, запускается вручную, без автоматической публикации при push.
Он выполняет `npm ci`, typecheck, tests, build и deploy `dist`; `base` берётся из настроек Pages.
Конфигурация опирается на [официальный workflow Vite](https://vite.dev/guide/static-deploy.html#github-pages) и [outputs configure-pages](https://github.com/actions/configure-pages/blob/v6/action.yml).

Репозиторий: [nikita-kiselev-dev/xenia-pereladova](https://github.com/nikita-kiselev-dev/xenia-pereladova), ветка `main`. Pages source — GitHub Actions.
Публикация 23 октября 2026 выполнена: [успешный workflow](https://github.com/nikita-kiselev-dev/xenia-pereladova/actions/runs/39990920004), commit `bd801807137b6555f371c9b8999e48ae9c269e51`.
Для обновления отправить изменения в `main`, затем открыть Actions → «Публикация GitHub Pages» → Run workflow → `main`.
Для ручной проверки project prefix:

```powershell
$env:VITE_BASE_PATH='/xenia-pereladova/'
npm run build
Remove-Item Env:VITE_BASE_PATH
npm run preview -- --base /xenia-pereladova/
```

Smoke опубликованного URL прошёл на desktop 1440×900 и viewport 390×844: по 13 групп, включая direct hash, refresh, фото и отсутствие ошибок console. Результаты — в `docs/qa/published-*-smoke.json`.
Не проверено, проверить так: открыть опубликованный URL на реальных iPhone/Safari и Android/Chrome; проверить scroll, серии, Close, Back и поворот экрана. Утверждение отбора/текста/движения остаётся открытым.
