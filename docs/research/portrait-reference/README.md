# Эталон портретной версии оригинала

Снято 24 октября 2026 с https://www.richardprescott.com/ через bundled Playwright и system Chrome headless/SwiftShader: viewport 375 × 812 CSS pixels, DPR 3, mobile=true, touch=true. Это эмуляция размеров iPhone 13 mini; real Safari/iOS не проверялся. JPEG screenshots сохранены в CSS-pixel scale. `reference-contact-sheet.jpg` объединяет 15 ключевых кадров. Весь каталог занимает около 1.6 MB.

## Артефакты

- `live-manifest.json`: фактически загруженные script/style URLs и 28 mobile project rows. Хеши текущих home/layout chunks совпадают с ранее сохранённым source.
- `measured-states.json`: cold reload, Overview → List, List → project, scroll/Close проекта, List → Overview. Задержки в labels — целевые интервалы после возврата Playwright click(); `now` — фактический performance.now(). Это отдельные samples, не точные границы перехода.
- `info-strip-measured-states.json`: успешные Info/Close, native touch swipe ленты, strip → project/Close. В прогоне 23 состояния, 7 JPEG, errors=[] .
- `click-raf-timings.json`, `click-timing-boundaries.json`: requestAnimationFrame measurements относительно фактического DOM click event; screenshots во время измерений не выполнялись.
- `all-project-template-audit.json`: все 28 Slug из текущего public API, HTTP status, template chunks и aspect ratios. Использован собственный route constructor оригинала `/project/` + Slug. Это проверка HTTP/template/metadata; browser animation flows всех 28 проектов не проверялись.
- `live-projects-api.json`, `projects-api-url.txt`: public payload и фактический request URL аудита маршрутов.
- `info-live.css`: текущий stylesheet страницы Info, URL указан в manifest.

## Наблюдения

В cold portrait intro logo находится сверху; descriptive text и небольшой progress располагаются строкой под ним. При 375 × 812 ink logo занимает примерно y60–264, текст начинается около y283, progress расположен справа около y314. Большое фото, имя-заголовок и desktop reels скрыты. Wall-clock длительность cold load включает network/module startup и не равна authored animation duration.

Visible Overview показывает горизонтальную ленту и подпись текущего проекта; visible List — текстовые строки. Внутренние имена view намеренно инвертируются на compact. Logo остаётся на месте, captions/rows сменяются через поэтапные fades и char visibility reveals. Подпись обновляется во время инерционного движения ленты.

Точные границы относительно DOM click в rAF probe:

| Переход | Событие | Время |
| --- | --- | --- |
| Overview → List | caption display:none | 516.7 ms |
| Overview → List | textList display:flex, opacity 1 | 1319.1 ms |
| List → Overview | textList display:none | 775.4 ms |
| List → Overview | caption display:flex | 906.1 ms |
| List → Overview | caption opacity ≥ .999 | 1457.8 ms |

Полное char reveal caption в обратном переходе не закончилось к 3 s. Значения относятся к одному software-rendered прогону; source authored timings остаются свидетельством заданной последовательности.

Успешный native swipe изменил caption 01 → 02 → 03 при settling без navigation. Click по центральной фотографии открыл фактический `/project/project-4`. Его first frame с ratio 1.5 измерен как x18.75, y293.5, width337.5, height225: ровно 90vw, вертикальное центрирование.

Close прокрученного проекта вернул scrollTop 812 → 627 на sample 500 ms, сменил route назад к 1500 ms и восстановил text List к 2800 ms. При Info navigation opacity ещё 0 на sample 800 ms и уже 1 к 1400 ms; Info Close погасил страницу почти до 0 к 350 ms и вернул Overview к 900 ms. Network/software rendering влияют на sampled wall-clock milestones.

Info image скрыт на phone: текущий `/_next/static/css/f592a9c0291326a0.css` содержит при max-width 1140px правило `.contact_colWrapper__GUXqG:last-child{display:none}`. Это колонка imageWrapper. Source сохранён в `info-live.css`.

Все 28 project routes ответили HTTP 200 и загрузили один template `app/project/[slug]/page-d7bfb7a670689d40.js`. Cover aspect ratios: 0.7725..2.449. В project template нет next-project section; для дополнительного local next-project UI эталонная transition отсутствует.

## Неудачный probe

Первый ручной CDP touchStart/touchMove/touchEnd был интерпретирован оригиналом как click и открыл project. Поэтому `strip-swipe-1600ms.jpg` не является эталоном swipe; `last-error-state.jpg` показывает получившееся состояние project. Следующий probe через native `Input.synthesizeScrollGesture` прошёл успешно; его screenshot — `native-strip-swipe-1600ms.jpg`.

Первый sequence также записал исходную page error `Cannot read properties of null (reading offsetHeight)` около cleanup проекта. Неудачные наблюдения сохранены в JSON и не считаются ни успешной проверкой, ни требуемым поведением.
