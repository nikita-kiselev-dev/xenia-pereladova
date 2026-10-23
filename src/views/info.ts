import { asset, portrait, profile } from '../data/projects';

export function infoMarkup(): string {
  return `<header class="info-heading"><span>Новосибирск / <time data-clock></time></span><a href="${profile.telegram}" target="_blank" rel="noopener noreferrer">Telegram</a><span>Семья, портрет, события</span><button class="close-button" data-close aria-label="Закрыть информацию">[Закрыть]</button></header>
    <section class="info-content">
      <h1 tabindex="-1">Обо мне</h1>
      <div class="info-copy"><p class="info-name">${profile.name}</p><p>${profile.description}</p>
        <div class="info-section"><p class="label">Снимаю в Новосибирске</p><p>Семейные фотосессии<br>Женские портреты<br>Детские праздники</p></div>
        <div class="info-section"><p class="label">Для вашей истории</p><a href="${profile.telegram}" target="_blank" rel="noopener noreferrer">Написать в Telegram</a><a href="${profile.whatsapp}" target="_blank" rel="noopener noreferrer">WhatsApp</a><a href="tel:+79137477927">${profile.phone}</a></div>
      </div>
      <figure class="info-portrait"><img src="${asset(portrait.src)}" width="${portrait.width}" height="${portrait.height}" alt="Ксения Переладова" decoding="async"/><figcaption>${profile.name}<br>Фотограф / Новосибирск</figcaption></figure>
    </section>
    <footer class="info-footer"><span>${profile.name}<br>© ${new Date().getFullYear()}</span><span>Фотографии о вас<br>и о тех, кто рядом</span><a href="${profile.instagram}" target="_blank" rel="noopener noreferrer">Instagram</a></footer>`;
}
