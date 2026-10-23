# Структура страницы

1. Intro поверх содержимого: фактическая готовность первых изображений / fonts, ограниченный timeout.
2. Header fixed: имя слева, город на 1/3, переключение справа, контакт у правого поля.
3. Main route: Overview / List / Project / Info. Только один владелец слушателей и ticker — app.
4. WebGL canvas fixed, pointer-events:none: геометрия из DOM, никаких собственных input routes.
5. Gallery footer fixed: copyright, фильтры и progress. Проект: номер текущего фото.
6. Noise overlay pointer-events:none; создаётся собственным SVG filter, без переноса texture референса.

Для gallery DOM — источник данных/семантики. Project и Info используют обычные img.
List desktop преобразует вертикальное native scroll в горизонтальное перемещение.
На <=1023px Overview также использует горизонтальную ленту, fixed XP и подпись ближайшей к центру серии; List показывает текстовые строки и инициалы.
На <=600px компактная навигация; фото Overview расположены в нижней части viewport, как в измеренном референсе.
В референсе wheel менял canvas и текущую подпись при window.scrollY=0; здесь драйвер — native вертикальный scroll, без отдельного input state внутри renderer.
