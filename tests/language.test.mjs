import test from 'node:test';
import assert from 'node:assert/strict';
import {setLanguage, initLanguage} from '../src/scripts/language.ts';
import {normalizeLanguage, categoryName, LANGUAGE_KEY} from '../src/lib/i18n.ts';

function fixture(stored = undefined, blocked = false) {
  const storage = new Map(stored ? [[LANGUAGE_KEY, stored]] : []);
  const label = {dataset: {en: 'Explore the columns', zh: '探索专栏'}, textContent: '', closest:()=>null};
  const title = {dataset: {en: 'Writing · bohemia\'s rain', zh: '文章 · bohemia\'s rain'}, textContent: '', closest:()=>null};
  const metadata = {dataset: {i18nAttributes: JSON.stringify({content: ['All articles', '所有文章']})}, attributes: {}, closest:()=>null, setAttribute(key,value){this.attributes[key]=value;}};
  const placeholder = {dataset: {i18nAttributes: JSON.stringify({placeholder: ['Search articles…', '搜索文章…'], 'aria-label': ['Search articles', '搜索文章']})}, attributes: {}, closest:()=>null, setAttribute(key,value) {this.attributes[key] = value;}};
  const button = {disabled: true, attributes: {}, listeners: {}, setAttribute(key,value){this.attributes[key]=value;},getAttribute(key){return this.attributes[key];},addEventListener(key,callback){this.listeners[key]=callback;}};
  const article = {dataset: {en: 'Must not replace this article', zh: '不得替换原文'}, closest:()=>({}), textContent: 'Claude plays robotics 的原文', value: '尚未保存的正文 **Markdown**'};
  globalThis.localStorage = {setItem(key,value){if(blocked)throw Error('storage unavailable'); storage.set(key,value);}};
  globalThis.document = Object.assign(new EventTarget(), {
    documentElement: {dataset: {language: normalizeLanguage(stored)}, lang: 'en'},
    querySelectorAll(selector) {
      return selector === '[data-en][data-zh]' ? [label, title, article] : selector === '[data-i18n-attributes]' ? [placeholder, metadata] : selector === '[data-language-toggle]' ? [button] : [];
    },
  });
  globalThis.window = new EventTarget();
  let notifications = 0;
  document.addEventListener('bohemia:language', () => notifications++);
  return {storage,label,title,metadata,placeholder,button,article,notifications:()=>notifications};
}

test('New visits default to English and initialize a working Chinese switch', () => {
  const view = fixture(); initLanguage();
  assert.equal(document.documentElement.lang, 'en');
  assert.equal(view.label.textContent, 'Explore the columns');
  assert.equal(view.placeholder.attributes.placeholder, 'Search articles…');
  assert.equal(view.button.textContent, '中文');
  assert.equal(view.button.disabled, false);
  assert.equal(view.storage.size, 0);
  assert.equal(normalizeLanguage('zh-CN'), 'en');
});

test('Switching both ways changes text, accessible attributes and metadata without touching article text or fields', () => {
  const view = fixture(); initLanguage();
  for (let index = 0; index < 20; index++) {
    view.button.listeners.click();
    const zh = index % 2 === 0;
    assert.equal(document.documentElement.lang, zh ? 'zh-CN' : 'en');
    assert.equal(view.label.textContent, zh ? '探索专栏' : 'Explore the columns');
    assert.equal(view.placeholder.attributes['aria-label'], zh ? '搜索文章' : 'Search articles');
    assert.equal(view.title.textContent, `${zh ? '文章' : 'Writing'} · bohemia's rain`);
    assert.equal(view.metadata.attributes.content, zh ? '所有文章' : 'All articles');
    assert.equal(view.button.attributes['aria-pressed'], String(zh));
    assert.equal(view.storage.get(LANGUAGE_KEY), zh ? 'zh' : 'en');
    assert.equal(view.article.value, '尚未保存的正文 **Markdown**');
    assert.equal(view.article.textContent, 'Claude plays robotics 的原文');
  }
  assert.equal(view.notifications(), 21);
  assert.equal(categoryName('技术', 'en'), 'Technology');
  assert.equal(categoryName('技术', 'zh'), '技术');
});

test('A remembered preference is restored and storage failure never breaks the switch', () => {
  const remembered = fixture('zh'); initLanguage();
  assert.equal(remembered.label.textContent, '探索专栏');
  const blocked = fixture(undefined, true); initLanguage(); setLanguage('zh');
  assert.equal(blocked.label.textContent, '探索专栏');
  assert.equal(document.documentElement.lang, 'zh-CN');
});

test('Cross-tab language changes do not write storage again', () => {
  const view = fixture(); initLanguage();
  const event = new Event('storage'); Object.assign(event, {key: LANGUAGE_KEY, newValue: 'zh'});
  window.dispatchEvent(event);
  assert.equal(view.label.textContent, '探索专栏');
  assert.equal(view.storage.size, 0);
});
