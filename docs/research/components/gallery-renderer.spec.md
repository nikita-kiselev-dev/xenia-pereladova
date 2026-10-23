# GalleryRenderer

## Назначение и свидетельство
Исследование 23.10.2026: `reference-overview-1440.png`, `reference-list-1440.png`.
Референс рисует фотографии в одном fixed canvas; DOM главной не содержит img.
Overview — ряды разного размера; List — одна горизонтальная лента по центру.
При wheel заметен изгиб краёв изображений; после остановки плоскости распрямляются.
Точный shader, коэффициенты скорости и easing оригинала не установлены.
Реализация ниже — калибруемая аппроксимация, без заявления pixel-perfect motion.

## Контракт реализации
Файл: `src/webgl/gallery-renderer.ts`, экспорт `GalleryRenderer`.
Конструктор `(container: HTMLElement)` получает текущую галерею.
Внутри — DOM img `[data-webgl]` с object-fit: cover, object-position: center.
Источник текстуры — `img.currentSrc || img.src`, размеры — getBoundingClientRect.
Canvas fixed inset 0, pointer-events none, aria-hidden true, z-index 2.
DOM-ссылки и подписи поверх canvas, один manifest, никаких роутов/обработчиков ввода внутри renderer.
Публичные методы `update(velocity: number): void`, `dispose(): void`.
`update` вызывается приложением из GSAP ticker; своего RAF нет.
При скорости 0 изображения в точности совпадают с DOM-прямоугольниками и crop.
При движении небольшая signed дуга плоскости с сегментами, сила ограничена.
Не подменять motion обычным rotate/skew всего изображения.
Размеры камеры orthographic = viewport CSS pixels, DPR <= 1.5.
Один renderer/context, общий PlaneGeometry (20 x 20 достаточно), отдельные uniforms.
Установить SRGBColorSpace текстурам; не менять цвет/контраст фотографий.
Скрывать конкретный DOM img только после успешной загрузки текстуры; opacity 0, alt остаётся.
Рендерить только видимые + 250px фотографии; текстуры удалять после ухода далеко (>2 viewport).
Запрос текстуры только после img complete, не загружать все альбомы.
При отсутствии WebGL2, ошибке, contextlost: вернуть DOM opacity и уничтожить ресурсы.
Не перехватывать input, не блокировать навигацию при сбое GPU.
Reduced motion обрабатывает владелец приложения: renderer вообще не создаётся.
Resize обрабатывается внутри renderer; remove listener при dispose.
dispose повторяемый, безопасен при завершении асинхронной загрузки после dispose.
Не править файлы других владельцев, package.json и общие CSS.

## Проверка
`npm run typecheck`; интеграционные browser checks выполняет основной агент.
Геометрия на 1440x900 и 390x844, возврат DOM при утрате context.
Открытие/закрытие серий не накапливает canvases, textures и listeners.
