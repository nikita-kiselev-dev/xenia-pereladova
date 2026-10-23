import '@fontsource/ibm-plex-mono/latin-500.css';
import '@fontsource/ibm-plex-mono/cyrillic-500.css';
import './styles/tokens.css';
import './styles/main.css';
import 'lenis/dist/lenis.css';
import { App } from './app';

new App(document.querySelector<HTMLDivElement>('#app')!);
