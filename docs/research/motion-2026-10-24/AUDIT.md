# Разбор motion оригинала и текущей реализации

Дата: **24 октября 2026**, Asia/Novosibirsk. Только исследование, без изменения приложения.
Источники: публичные HTML/CSS/JS [Richard Prescott](https://www.richardprescott.com/), встроенный браузер CUA, текущие `src/` и production preview.

## Что удалось установить кодовым разбором

Загружены публичные application chunks, включая динамический `816.e85608c9eabd8436.js`. Его адрес получен из dynamic import в layout и таблицы webpack, а не подобран. Код сайта не запускался через shell: файлы читались как текст. URL, размеры и SHA-256 — в [manifest](source/manifest.json). Для читаемых копий использован Prettier 3.8.0; shaders извлечены из строк без изменения формул.

| Механизм | Свидетельство в сохранённом источнике | Существенные параметры |
|---|---|---|
| Многоступенчатый intro | `source/layout.readable.txt:104–204` | Заголовок: `0.88s`, stagger `0.038`, `power2.inOut`; фото: scale `1.5 → 1.001`, `1.6s`; мелкий текст: visibility stagger `0.045`, delay `0.5`; барабаны цифр: `2.4s`, stagger `0.6`; затем fade `0.5s` и уменьшение фото до `150px` за `0.7s` |
| Передача intro в сцену | `source/webgl.readable.txt:834–1016` | Сначала фото в центре; затем `uAnim` до `0.9` за `0.45s`, scale за `0.6s`, `sine.inOut`; остальные карточки имеют отдельную деформацию `uAnim` |
| Анимированное зерно | `source/global.readable.txt:299–367` | `.noise` opacity `0.9`; `::after`, `/noise2.png`; `noise 2s steps(2) infinite`; слой больше viewport на `20rem`, перемещение по keyframes |
| Типографика с масками | `source/global.readable.txt:252–263, 1049, 1094`; `source/layout.readable.txt:350–417, 585–623` | `overflow:hidden`; стартовые translate/rotate для крупных букв/цифр; мелкий текст открывается посимвольно. Это несколько разных механизмов |
| Hover текстовых ссылок | `source/layout.readable.txt:1692–1705`; `source/info.readable.txt:121–136` | ScrambleText: `duration:1.2`, stagger `0.04`, `{original}`, upperCase, speed `0.1` |
| Hover фото | `source/webgl.readable.txt:450–477, 728–735`; [fragment shader](source/fragmentShader.glsl) | `/disp88.jpeg`, `hoverProgress:0 ↔ 1`, `1.2s expo.out`; две UV-выборки с поворотами `π/4` и `−3π/4`, displacement `0.4`, mix |
| Инерция галереи | `source/webgl.readable.txt:1017–1049` | Сглаживание current к target коэффициентом `0.05` на frame; wheel normalization, множитель `0.005`; target сбрасывается через `150ms` без wheel |
| Циклическая прокрутка | `source/webgl.readable.txt:410–448` | List двигается по x, Overview по y; карточки за границей переносятся на суммарную ширину/высоту; это не конечная прокрутка документа |
| Деформация на scroll | `source/webgl.readable.txt:410–416`; [vertex shader](source/vertexShader.glsl) | `uSpeed = 2.5 × scrollCurrent` при ширине >600, иначе `0.6 ×`; cos по экранному x меняет z. Есть отдельные `uTime`, `uProgress`, `uAnim` |
| Overview ↔ List | `source/webgl.readable.txt:218–400` | Позиции за `1.4s power3.inOut`; scale отдельно, для Overview `1s`; UV resolution обновляется вместе с размером. Footer переключается отдельными timelines |
| Footer | `source/layout.readable.txt:676–857` | Выход старого состава `0.6–0.8s`, masked filters `0.88s` + stagger `0.038`; данные hover — посимвольно; номер серии — барабаны `0.67–1s`, delay `0.2` |
| Выбранное фото → проект | `source/webgl.readable.txt:479–568` | Центрирование `0.65s power4.inOut`, `uAnim` до `0.3`, увеличение `1.2s`; остальные фото уходят в стороны за `1.4s`; возврат через reverse |
| Info | `source/info.readable.txt:54–103` | Fade контейнера `1s` desktop / `0.5s` narrow, delay `0.55`; символы stagger `0.07`; заголовок y/rotate `1s`; портрет scale/opacity `1.2s`, delay `0.86` для обычного входа |
| Проект: текст и progress | `source/project.readable.txt:93–175` | Метаданные stagger `0.075`, delay `0.4`; progress — три цифровых столбца, tween `0.8s power2.out` на scroll |
| Курсор | `source/layout.readable.txt:1376–1396`; `source/global.readable.txt`, `.cursor_cursorInner__9iOd5` | Lerp `0.075`, blur `3px`; текущая реализация позиционирует круг непосредственно по pointer |

Это значения из конкретных веток кода, а не измеренная полная длительность сцены. Delays, параллельные tweens и длина текста влияют на итоговое время. У оригинала встречаются разные пороги `600/800/1024/1100/1140`; их нельзя свести к одному breakpoint без проверки.

### Важные различия эффектов

- Hover фото — переходное жидкое искажение: при `hoverProgress=0` и `1` итоговая выборка снова нейтральная; сильнее всего рисунок меняется между ними. Это не постоянная рябь под курсором и не RGB split. Локальные координаты pointer shader не использует; нужен корректный выбор наведённой карточки и enter/leave progress.
- В найденном прикладном коде галереи scroll управляет скоростью, деформацией и циклическим переносом. Наличие ScrollTrigger в vendor chunk само по себе не доказывает scroll reveal на каждом блоке.
- В прочитанном project chunk изображения после обложки выводятся обычными DOM images; массовый fade-up каждого кадра не подтверждён. Такой эффект в нашей версии был бы дополнительным художественным решением.
- Большая часть характера — согласование intro, сцены, букв, цифр, footer и hover; добавление одинакового translateY всем элементам это не воспроизводит.

## Что сейчас реализовано у Xenia

| Пробел | Текущее свидетельство | Следствие |
|---|---|---|
| Intro зависит от скорости загрузки и только один раз за session | `src/app.ts:343–369` | После decode сразу начинается один выход вверх `0.6s`. На warm cache многоступенчатого появления нет |
| Grain технически есть, но статичен | `src/styles/main.css:91`, `public/noise.svg` | Opacity `0.055`, нет keyframes. Это не движущееся зерно оригинала; менять только opacity недостаточно |
| Shader не имеет hover | `src/webgl/gallery-renderer.ts:25–48, 176–182` | Нет displacement texture, hover progress и смешивания UV. Pointer в `src/app.ts:320–335` меняет лишь круг и подпись |
| Scroll зависит от frame | `src/app.ts:312–314`, `src/webgl/gallery-renderer.ts:102` | Velocity — delta window.scrollY за frame; bend ограничен `±28`; одинаковый жест на разных refresh rate требует отдельной калибровки |
| Геометрия отличается | `src/webgl/gallery-renderer.ts:33–35, 54` | Есть y-изгиб; изменение только z с OrthographicCamera не даёт перспективного изменения масштаба. Нельзя механически скопировать z-формулу оригинала |
| Нет циклического scroll | `src/app.ts:274–277`, `src/styles/main.css:28` | Конечный DOM grid / лента с clamp вместо wrap; сетка выглядит более регулярной |
| Сцена пересоздаётся на route | `src/app.ts:164–174, 247–255` | Renderer уничтожается и монтируется заново; непрерывность mesh/texture между представлениями не обеспечена |
| Общий переход вместо хореографии | `src/app.ts:225–241` | Gallery FLIP `0.7s`, иначе групповой y `18px/0.48s`; собственных exit/enter для большинства текстов нет |
| Scroll observer не анимирует | `src/app.ts:294–300` | Только меняет номер текущего фото |
| Номера меняются мгновенно | `src/app.ts:289–292, 317, 333–334` | `textContent` вместо цифровых барабанов и связанного появления подписи |
| Blur и cursor упрощены | `src/styles/main.css:17,46,92` | Один blur вместо ступенчатых масок; курсор без инерции и blur |

## Browser-свидетельства этого прохода

- Оригинал: начальный экран при стандартной узкой ширине, desktop 1440×900, Overview, wheel, Info и Close. Локально: production preview, Overview и Info на 1440×900.
- [Измерения DOM](browser-samples.json): у оригинала реально применяется `2s steps(2) infinite noise`, URL `noise2.png`, opacity `0.9`; локально `animation:none`, `noise.svg`, opacity `0.055`.
- [Overview оригинала](reference-overview-1440.png), [Overview текущего сайта](current-overview-1440.png), [Info оригинала](reference-info-1440.png), [Info текущего сайта](current-info-1440.png). Overview оригинала снят после scroll/возврата, не в начальной позиции; это не pixel diff и не парный timing-тест.
- Browser export вернул JPEG, сохранённый как PNG без изменения размеров. Фактические размеры — в [screenshot-metadata.json](screenshot-metadata.json): локальный Overview имеет raster 1430×894, остальные 1440×900. Эти файлы не являются доказательством пиксельного совпадения viewport.
- `npm run build` — PASS. Есть предупреждение о JS chunk Three.js >500 kB; это не новый результат оптимизации.
- Vite в текущей production-сборке преобразовал noise URL в `../noise.svg`. Причина незаметного grain не установлена как ошибка repository prefix; такую ошибку не следует объявлять без failed request на опубликованном сайте.

**Не проверено, проверить так:** записать одинаковые сценарии оригинала/новой версии на видео с cold/warm cache; отдельно чистый hover enter/move/leave, 768/390px, настоящий Safari/iPhone и Android, frame/GPU профиль. Текущий CUA API не предоставляет hover/move и записи видео; отдельные screenshots не доказывают временное сходство. Для реализации потребуется browser harness с настоящими pointer actions и записью либо ручной capture. Доступность source кода не заменяет эти проверки.

Сохранённые изображения, shaders и bundles оригинала — исследовательские свидетельства в `docs/research`, не production assets. Новые эффекты реализовать в нашем стеке; texture grain/displacement для публикации подготовить собственные, откалиброванные по этим образцам.
