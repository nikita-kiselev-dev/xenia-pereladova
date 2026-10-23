# Локальная проверка Xenia Photo Website

Дата: **23 октября 2026**, Asia/Novosibirsk.
Статус: **техническая версия опубликована и проверена на GitHub Pages; художественная приёмка и реальные устройства остаются открытыми**.

## Реализовано

Vite/TypeScript, hash-навигация, Overview, desktop/mobile List, четыре категории, фотосерии, Info с реальными контактами.
Один WebGL2 canvas, деформация от скорости scroll, GSAP-переходы, Lenis, Intro от загрузки ресурсов.
Прерывание переходов, Back/Forward, прямые ссылки, Close/Escape, возврат focus и контекста галереи, восстановление DOM при GPU error.
Исследовательские артефакты и три spec-файла — в `docs/research`; reference PNG — в `docs/design-references`.

Из переданного пользователем портфолио отобраны **8 серий / 63 кадра**, отдельно **8 обложек и 1 портрет**.
Это **144 WebP-файла** (по два размера на изображение), около **12.73 MB** изображений. Полный `dist` — около **13.46 MB**.
Исходные фотографии не изменялись. Состав первого отбора и написанный для него текст ещё не утверждены.

## Выполненные проверки

| Проверка | Результат | Свидетельство |
|---|---|---|
| Node / npm | Node 24.21.0, npm 11.19.0 | Команды текущей сессии |
| `npm ci` | PASS, 30 packages, 0 vulnerabilities | После остановки Vite устранён Windows EPERM на locked Rolldown binding |
| `npm run typecheck` | PASS | TypeScript 7.0.2 |
| `npm test` | PASS: 3 tests | Маршруты, malformed slug/filter, пути/размеры/alt/source каждого asset |
| `npm run build` | PASS | `dist/index.html`, JS/CSS, fonts, images |
| `npm run build:qa` | PASS | Отдельный `.qa-dist`, fixture отсутствует в production `dist` |
| Desktop production smoke | PASS: 13 групп | [desktop-smoke.json](desktop-smoke.json) |
| Mobile viewport production smoke | PASS: 13 групп | [mobile-smoke.json](mobile-smoke.json) |
| 320×740, 390×844, 768×1024, 1440×900, 1920×1080 | PASS: 20 состояний, Overview/List/Project/Info, нет horizontal overflow | [responsive-smoke.json](responsive-smoke.json) |
| Fallback | PASS: 4 сценария | [fallback-smoke.json](fallback-smoke.json) |
| Repository prefix `/xenia-photo/` | PASS: 13 групп, включая прямой URL и refresh | [prefix-smoke.json](prefix-smoke.json) |
| Focus → номер серии в footer | PASS, вторая серия / индекс 02 | [footer-focus-smoke.json](footer-focus-smoke.json) |
| Resize проекта через breakpoint | PASS, прокрутка не сбрасывается | [resize-smoke.json](resize-smoke.json) |
| Возврат из прокрученной List | PASS, фильтр/focus/контекст сохранены | [scroll-return-smoke.json](scroll-return-smoke.json) |
| Узкий Overview | PASS: подпись меняется от scroll, XP неподвижен, fixed-слой остаётся высотой viewport даже во время Close | [narrow-overview-smoke.json](narrow-overview-smoke.json) |

В core smoke проверены все категории, Overview↔List, Enter/Escape, Info и контактные ссылки, Close, Back/Forward, быстрые переключения, неизвестная серия, direct hash и refresh.
В этих сценариях нет новых runtime errors и ошибок загрузки assets в browser console.
Во время fault injection одна ожидаемая HTTP 404 создаётся намеренно.

Встроенный браузер CUA — Chromium 155 на Windows. Mobile здесь означает **изменение viewport**, не эмуляцию GPU/CPU или реальный телефон.
Browser harness — только `tests/browser-smoke.mjs` через CUA; Python/внешний Playwright для UI не использовались.
Python helper `with_server.py --help` был проверен, серверы запускались через retained exec sessions.

## Fallback: границы доказательства

- **Нет WebGL2:** fixture возвращает null из `getContext('webgl2')`. Проверены обычные изображения, открытие серии и Close.
- **Reduced motion:** fixture подменяет `matchMedia` для JS-ветки. Проверены отсутствие canvas, DOM и доступность сценария; отключение Lenis/GSAP также подтверждено условием в `src/app.ts`. Это не ручное переключение системной настройки; CSS media query на реальном устройстве отдельно не проверена.
- **Context loss:** вызван реальный `WEBGL_lose_context` в текущем Chromium. Canvas удалён, скрытые DOM img восстановлены.
- **Фото недоступно:** fixture подставляет несуществующий URL. Показан placeholder, навигация сохраняется.

Длительное GPU memory profiling и многочасовое открытие/закрытие серий не выполнялись. Отдельная проверка количества canvas после быстрых переключений не показала накопления: не более одного.

## Визуальная сверка

Сохранены пары состояний на 1440, 768 и 390px. Локальные изображения: `overview-*.png`, `list-*.png`, `project-*.png`, `info-*.png`.
Browser tool экспортировал raster с JPEG-сжатием и в отдельных случаях небольшим resample; файлы нормализованы в PNG без изменения экспортированных pixels. Реальные размеры сохранены в `screenshot-metadata.json`; это визуальные свидетельства, не pixel-perfect diff.
Проверены поля, fixed-слои, пропорции изображений, русский текст, desktop-лента и mobile-список.
Overview footer на desktop приведён к наблюдаемой композиции с индексом серии; крупные фильтры находятся в List.
Устранены выявленные mobile overflow и потеря focus в скрытой desktop-карточке. Resize серии больше не возвращает к первому кадру.

Намеренные отличия и незакрытые вопросы:

- Xenia / Ксения Переладова, русские тексты и фотографии заменяют чужие материалы.
- IBM Plex Mono и Arial/Helvetica заменяют шрифты с неустановленной лицензией. Метрики и зерно отличаются.
- Узкий Overview доведён до измеренной композиции с fixed инициалами, подписью и горизонтальной лентой. Размеры/аспекты реальных фото отличаются; native scroll заменяет внутренний виртуальный scroll референса.
- Compact filters на mobile оставлены доступными в обоих видах; у референса они скрываются.
- Геометрия/плотность зависят от отбора 8 серий. По desktop замеру высота thumbnails около 14vh, вертикальный интервал — 15vh.
- Shader, easing, intro, hover-метаданные и переходы — калибруемая аппроксимация. Чистого hover/move API в текущем браузере нет; полного hover sweep не выполнено.
- Видео сравнения motion не записано. Screenshots и частота RAF не доказывают художественное совпадение.

## Производительность

Сохранены короткие замеры **120 RAF-интервалов** при прокрутке, DPR 1, видимая вкладка Chromium 155.
Локальный cold origin дал около **1.25 MB transfer** вместе с QA fixture и первым проходом прокрутки; сервер не сжимал JS/CSS.
Исходные значения и resource entries: [cold desktop](performance-cold-desktop.json), [mobile viewport с warm cache](performance-mobile-viewport.json).
В наблюдавшихся коротких проходах p95 RAF-интервала **6.1–6.2 ms** на том же компьютере, включая узкий Overview с неподвижным заголовком.
Это частота callback на текущем мониторе, не доказательство устойчивого FPS на телефоне, GPU frame time или отсутствия long tasks.
Длительный performance profile, mobile DPR 2/3, Safari и real-device бюджеты остаются открытыми.

Vite предупреждает о Three.js chunk: **529.43 kB minified / 132.09 kB gzip**. Он загружается динамически для gallery; сборка успешна.

## Что осталось до релиза

1. **Визуальная приёмка:** открыть локальный preview, проверить отбор/порядок кадров, описание, подписи, XP и контакты; утвердить адаптивную композицию и motion. Художественное сходство пока не принято.
2. **Реальные устройства — не проверено, проверить так:** `npm run dev -- --host 0.0.0.0`, открыть LAN-адрес на iPhone/Safari и Android/Chrome; пройти scroll в обе стороны, List, категории, серию, Close, поворот экрана, Back и reduced motion. Зафиксировать модель, ОС, браузер и результаты.
3. **GitHub Actions — PASS:** [workflow 39990920004](https://github.com/nikita-kiselev-dev/xenia-pereladova/actions/runs/39990920004), commit `bd801807137b6555f371c9b8999e48ae9c269e51`; установка зависимостей, typecheck, 3 Node-теста, build и deploy успешны.
4. **Published smoke — PASS:** [публичный URL](https://nikita-kiselev-dev.github.io/xenia-pereladova/), HTTP 200. Существующий `runCore` прошёл по 13 групп на 1440×900 и 390×844; категории, открытие/закрытие серии, Info, keyboard/focus, Back/Forward, прерывание переходов, direct hash, refresh и восстановление неизвестной серии. Ошибок runtime/assets в console нет. Свидетельства: [desktop](published-desktop-smoke.json), [mobile viewport](published-mobile-smoke.json), [исходный viewport браузера](published-smoke.json).

Remote: `git@github.com:nikita-kiselev-dev/xenia-pereladova.git`, ветка `main`; Pages source — GitHub Actions. Публикация выполнена по прямому запросу пользователя. Техническая проверка опубликованного сайта не заменяет художественную приёмку и проверку реальных устройств.
