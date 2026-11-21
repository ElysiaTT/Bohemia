export type Language = 'en' | 'zh';
export const LANGUAGE_KEY = 'bohemia-language';
export const LANGUAGE_EVENT = 'bohemia:language';
export const normalizeLanguage = (value: unknown): Language => value === 'zh' ? 'zh' : 'en';
export const currentLanguage = (): Language => normalizeLanguage(typeof document === 'undefined' ? undefined : document.documentElement?.dataset.language);
export const text = (en: string, zh: string, language = currentLanguage()) => language === 'zh' ? zh : en;
export const postCount = (count: number, language = currentLanguage()) => text(`${count} ${count === 1 ? 'article' : 'articles'}`, `${count} 篇文章`, language);
export const columnCount = (count: number, language = currentLanguage()) => text(`${count} columns`, `${count} 个专栏`, language);
export const readTime = (minutes: number, language = currentLanguage()) => text(`${minutes} min read`, `${minutes} 分钟阅读`, language);
const categoryNames: Record<string, string> = { '全部': 'All', '技术': 'Technology', '设计': 'Design', '生活': 'Life', '随想': 'Reflections' };
export const categoryName = (category: string, language = currentLanguage()) => text(categoryNames[category] || category, category, language);
export const localized = (en: string, zh: string) => ({ 'data-en': en, 'data-zh': zh });
/** Translate attributes without replacing icons, child links, controls or user text. */
export function attributes(values: Record<string, readonly [string, string]>) {
  return { ...Object.fromEntries(Object.entries(values).map(([key, pair]) => [key, pair[0]])), 'data-i18n-attributes': JSON.stringify(values) };
}
