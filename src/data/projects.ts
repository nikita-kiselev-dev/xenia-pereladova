import portfolio from './portfolio.json';

export type Category = 'all' | 'family' | 'portrait' | 'events';
export interface Photo {
  src: string;
  thumbnail: string;
  width: number;
  height: number;
  alt: string;
  source: string;
}
export interface Project {
  slug: string;
  title: string;
  category: Exclude<Category, 'all'>;
  source: string;
  cover: Photo;
  photos: Photo[];
}
export const projects = portfolio.projects as Project[];
export const portrait = portfolio.portrait as Photo;
export const categories: { id: Category; title: string }[] = [
  { id: 'all', title: 'все' },
  { id: 'family', title: 'семья' },
  { id: 'portrait', title: 'портрет' },
  { id: 'events', title: 'праздники' },
];
export const profile = {
  name: 'Ксения Переладова',
  brand: 'Xenia',
  location: 'Новосибирск',
  description: 'Семейные истории, портреты и праздники. Фотографии о вас и о тех, кто рядом.',
  telegram: 'https://t.me/+79137477927',
  whatsapp: 'https://wa.me/79137477927',
  instagram: 'https://www.instagram.com/pereladushka/',
  phone: '+7 913 747-79-27',
  source: 'https://pereladova.wfolio.pro/',
};
export const asset = (path: string) => `${import.meta.env.BASE_URL}${path}`;
