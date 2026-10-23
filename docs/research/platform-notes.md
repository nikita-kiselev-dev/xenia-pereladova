# GitHub Pages и стек анимации: проверенные ограничения

Дата проверки источников: **23 октября 2026**, часовой пояс пользователя — Asia/Novosibirsk.

Это справочная заметка к плану сайта. Выполнено чтение официальной документации и исходников библиотек; сайт не реализован, сборка, GitHub Actions, DNS, браузеры и реальные устройства не проверялись. Наличие библиотеки в предлагаемом стеке не означает, что она обнаружена на Richard Prescott.

## 1. Что позволяет GitHub Pages

GitHub Pages публикует статические HTML, CSS и JavaScript из репозитория, в том числе после build step. Проектный сайт по умолчанию находится на `https://<owner>.github.io/<repositoryname>/`, пользовательский — на `https://<owner>.github.io/`. Сервиса достаточно для исполнения клиентских анимаций и WebGL. Собственный серверный обработчик формы сюда не разворачивается; обработку обращений нужно отдельно выбрать при реализации. Источник: [What is GitHub Pages?](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages).

GitHub позволяет собственный домен: apex, `www` или иной subdomain. Перед привязкой рекомендует верифицировать домен. Настройка domain/DNS — отдельный этап после появления адреса репозитория и доступа к домену. Источник: [About custom domains](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/about-custom-domains-and-github-pages).

## 2. Ограничения, влияющие на план

Pages ограничивает business/e-commerce и транзакционные сценарии. Для educational copy предусмотрены отдельные условия: свой код, отсутствие сбора данных и обозначение учебной копии. До публикации сверить назначение сайта с [GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits).

Там же: сайт до **1 GB**, soft bandwidth **100 GB/месяц**, deployment timeout **10 минут**; лимит **10 builds/час** имеет исключение для custom Actions. Практическое решение: публиковать web-версии фотографий, originals хранить отдельно.

## 3. Vite → GitHub Pages

- `npm run build` создаёт `dist`; `npm run preview` проверяет готовую сборку локально и не является production server.
- Для project site нужен `base: '/<REPO>/'`; для user site и собственного домена — `base: '/'`.
- Официальный путь Vite: Settings → Pages → Source → GitHub Actions; workflow выполняет установку зависимостей, build, upload `dist`, deploy.
- Практическая проверка плана: отдельно открыть опубликованный адрес, проверить пути CSS/JS, изображений и shader assets под repository prefix. Не ограничиваться работающим localhost.
- Решение для навигации в первом релизе: hash URLs `#/project/<slug>` и `#/info`, чтобы refresh работал без server rewrites. Clean URLs оригинала не воспроизводим. Это проектное решение, не утверждение о реализации референса.

Источник: [Vite — Deploying a Static Site, GitHub Pages](https://vite.dev/guide/static-deploy.html#github-pages).

## 4. Минимальный предлагаемый стек для движения

| Слой | Выбор и основание | Практическое решение |
|---|---|---|
| Сборка | Vite + TypeScript + обычные CSS и DOM; Vite документирует статический deploy | Без React, Next.js, Tailwind, shadcn и обязательного SSR/backend |
| DOM-анимации | GSAP timelines; ScrollTrigger умеет привязывать progress к scroll, `scrub`, `pin`, `snap` | Не подключать ScrollTrigger для каждого простого hover; использовать по подтверждённому эффекту |
| Smooth scroll | Lenis поддерживает native scroll, WebGL synchronization, интеграцию с GSAP ticker | Добавлять после базовой галереи; один источник кадров для Lenis и анимаций, без двух независимых RAF loops |
| Деформация фото | Three.js `WebGLRenderer` + `ShaderMaterial` с custom GLSL и uniforms | Небольшой отдельный prototype на 3–5 разрешённых фото; подключать к основной галерее после визуальной проверки |
| Responsive motion | `gsap.matchMedia()` поддерживает media queries и cleanup | Отдельные условия для mobile/desktop и `prefers-reduced-motion`; контент доступен при сокращении анимации |

Источники: [GSAP ScrollTrigger](https://gsap.com/docs/v3/Plugins/ScrollTrigger/), [GSAP matchMedia](https://gsap.com/docs/v3/GSAP/gsap.matchMedia()/), [Lenis README, setup и GSAP integration](https://github.com/darkroomengineering/lenis#setup), [официальный ShaderMaterial source](https://github.com/mrdoob/three.js/blob/dev/src/materials/ShaderMaterial.js).

Текущий официальный source `WebGLRenderer` указывает WebGL 2; WebGL 1 не поддерживается с r163. Поэтому в плане нужен fallback на DOM-изображения при отсутствии подходящего WebGL context. Зафиксировать конкретные package versions и lockfile следует при реализации, а не выводить их из изменяемой ветки `dev`. Источник: [официальный WebGLRenderer source](https://github.com/mrdoob/three.js/blob/dev/src/renderers/WebGLRenderer.js).

## 5. Граница достоверности

Выбор Three.js, GSAP и Lenis — предложение реализации, а не установленный стек Richard Prescott. В этой заметке не подтверждены точный shader, easing, длительности, mobile behavior и лицензии assets референса. Проверка исходников Three.js использована потому, что открытие отдельных страниц его текущей документации вернуло 404; это не свидетельство ошибки библиотеки. Реальные frame times, расход памяти и визуальное сходство можно установить только на prototype и целевых устройствах.
