import translations from '../data/studio-english.json';
import {text} from './i18n';
const messages: Record<string, string> = translations;
export const studioText = (zh: string) => text(messages[zh] || zh, zh);
