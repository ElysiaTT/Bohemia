import {LANGUAGE_EVENT, LANGUAGE_KEY, normalizeLanguage, type Language} from '../lib/i18n.ts';

export function applyLanguage(language: Language, scope: ParentNode = document) {
  scope.querySelectorAll<HTMLElement>('[data-en][data-zh]').forEach(element => {
    if (element.closest('[data-authored-content]')) return;
    element.textContent = element.dataset[language] || '';
  });
  scope.querySelectorAll<HTMLElement>('[data-i18n-attributes]').forEach(element => {
    if (element.closest('[data-authored-content]')) return;
    const values = JSON.parse(element.dataset.i18nAttributes!) as Record<string, [string, string]>;
    for (const [attribute, pair] of Object.entries(values)) element.setAttribute(attribute, pair[language === 'zh' ? 1 : 0]);
  });
}

export function setLanguage(value: unknown, persist = true) {
  const language = normalizeLanguage(value);
  document.documentElement.dataset.language = language;
  document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
  if (persist) { try { localStorage.setItem(LANGUAGE_KEY, language); } catch { /* The switch also works without storage. */ } }
  applyLanguage(language);
  document.querySelectorAll<HTMLButtonElement>('[data-language-toggle]').forEach(button => {
    button.textContent = language === 'en' ? '中文' : 'EN';
    button.lang = language === 'en' ? 'zh-CN' : 'en';
    button.setAttribute('aria-label', language === 'en' ? '切换到中文' : 'Switch to English');
    button.title = button.getAttribute('aria-label')!;
    button.setAttribute('aria-pressed', String(language === 'zh'));
    button.disabled = false;
  });
  document.dispatchEvent(new CustomEvent(LANGUAGE_EVENT, {detail: {language}}));
}

export function initLanguage() {
  setLanguage(document.documentElement.dataset.language, false);
  document.querySelectorAll<HTMLButtonElement>('[data-language-toggle]').forEach(button => {
    button.addEventListener('click', () => setLanguage(document.documentElement.dataset.language === 'zh' ? 'en' : 'zh'));
  });
  window.addEventListener('storage', event => { if (event.key === LANGUAGE_KEY) setLanguage(event.newValue, false); });
}
