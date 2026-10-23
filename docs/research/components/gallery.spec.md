# Gallery / Header / Footer

Наблюдения: `BEHAVIORS.md`, `design-tokens.json`, reference screenshots 1440/768/390.
Файлы: `src/views/gallery.ts`, `src/app.ts`, `src/styles/main.css`.
Header и Footer — fixed; padding 20px, на <=600px — 15px. Mono 12px.
Overview — ссылки с figure, DOM img и caption; пять колонок на desktop.
На <=1023px Overview — горизонтальная лента с fixed XP поверх неё, на <=600px фото смещены в нижнюю часть viewport, текущая подпись обновляется от ближайшей к центру карточки.
List >=1024px — fixed горизонтальная лента; native вертикальный scroll задаёт translateX.
List <=1023px — текстовые строки серий и крупные инициалы XP.
Фильтры — button aria-pressed, hash сохраняет категорию; на desktop крупные фильтры только в List, в Overview — индекс серии у 1/3 ширины. На mobile фильтры компактные в обоих видах.
Доступность важнее точного low-opacity референса. Номер и название серии обновляются от pointer/focus в Overview.
Виды меняются кликом/Enter. Gallery→Gallery: прямоугольники до/после, GSAP transform, .7s power3.inOut.
Это параметр реализации, точный easing референса не установлен.
После проекта восстанавливаются filter, scroll и focus на видимую ссылку текущего представления.
Не анимировать transform всего main: это превращает его в containing block для fixed-слоёв. Переходы применяются к flow-элементам/карточкам; прямоугольники скрытых карточек с нулевым размером не участвуют в FLIP.
Проверки: `tests/browser-smoke.mjs`, `docs/qa/*smoke.json`.
Намеренные отличия: русский текст, категории и фото Xenia, system display font; finite scrolling.
