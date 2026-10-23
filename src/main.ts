import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/cyrillic-400.css';
import './styles/tokens.css';
import './styles/main.css';
import 'lenis/dist/lenis.css';
import { App } from './app';

new App(document.querySelector<HTMLDivElement>('#app')!);
