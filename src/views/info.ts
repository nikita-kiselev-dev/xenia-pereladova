import { asset, portrait, profile } from '../data/projects';

export function infoMarkup(): string {
  return `<header class="info-heading"><span data-reveal>Новосибирск / <time data-clock></time></span><a href="${profile.telegram}" target="_blank" rel="noopener noreferrer" data-reveal data-scramble>Telegram</a><span data-reveal>Семья, портрет, события</span><button class="close-button" data-close data-reveal data-scramble aria-label="Закрыть информацию">[Закрыть]</button></header>
    <section class="info-content">
      <h1 tabindex="-1" data-mask>Обо мне</h1>
      <div class="info-copy"><p class="info-name">${profile.name}</p><p>${profile.description}</p>
        <div class="info-section"><p class="label">Снимаю в Новосибирске</p><p>Семейные фотосессии<br>Женские портреты<br>Детские праздники</p></div>
        <div class="info-section"><p class="label">Для вашей истории</p><a href="${profile.telegram}" target="_blank" rel="noopener noreferrer" data-scramble>Написать в Telegram</a><a href="${profile.whatsapp}" target="_blank" rel="noopener noreferrer" data-scramble>WhatsApp</a><a href="tel:+79137477927" data-scramble>${profile.phone}</a></div>
      </div>
      <figure class="info-portrait"><img src="${asset(portrait.src)}" width="${portrait.width}" height="${portrait.height}" alt="Ксения Переладова" decoding="async"/><figcaption>${profile.name}<br>Фотограф / Новосибирск</figcaption></figure>
    </section>
    <footer class="info-footer"><a href="https://t.me/+79059394963" target="_blank" rel="noopener noreferrer" aria-label="Создание стильных веб-платформ: Triple Jump Development" data-reveal>Создание стильных веб-платформ:<br>Triple Jump Development<br>© ${new Date().getFullYear()}</a><span data-reveal>Фотографии о вас<br>и о тех, кто рядом</span><a href="${profile.instagram}" target="_blank" rel="noopener noreferrer" data-reveal data-scramble>Instagram</a></footer>`;
}
