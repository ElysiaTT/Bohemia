import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {parseDocument} from 'yaml';
import {createSatteriMarkdownProcessor} from '@astrojs/markdown-satteri';
import {articleHeadings} from '../scripts/article-headings.ts';
import {parseArticle} from '../src/lib/studio-content.ts';
import {translationSourceHash,translationIsCurrent} from '../src/lib/article-translations.ts';
import {searchPostText,displayedSearchPost} from '../src/lib/search-posts.ts';

const source = {title:'标题',description:'摘要',tags:['研究'],coverAlt:'图片',body:'## 原文\r\n\r\n内容\r\n'};
test('Source fingerprints normalize line endings and distinguish changes to translated words', () => {
  const translation = {sourceHash:translationSourceHash(source)};
  assert.equal(translationIsCurrent({...source,body:source.body.replaceAll('\r\n','\n')},translation),true);
  assert.equal(translationIsCurrent({...source,date:'2026-11-21',draft:true},translation),true);
  for (const changed of [{title:'新标题'},{description:'新摘要'},{tags:['新标签']},{coverAlt:'新图片'},{body:'## 新内容'}]) assert.equal(translationIsCurrent({...source,...changed},translation),false);
  assert.equal(translationIsCurrent(source),false);
});

test('English heading IDs are namespaced while original-language anchors remain unchanged', async () => {
  const renderer = await createSatteriMarkdownProcessor({hastPlugins:[articleHeadings()],syntaxHighlight:false});
  const original = await renderer.render('## Shared heading\n\nBody');
  const english = await renderer.render('## Shared heading\n\nEnglish body',{frontmatter:{translationLanguage:'en'}});
  assert.equal(original.metadata.headings[0].slug,'shared-heading');
  assert.equal(english.metadata.headings[0].slug,'en-section-1');
  assert.match(english.code,/id="en-section-1"/);
});

test('English Markdown has valid metadata and current translations preserve sections and reference links', async () => {
  const renderer = await createSatteriMarkdownProcessor({hastPlugins:[articleHeadings()],syntaxHighlight:false});
  const sources = new Set((await readdir('src/content/posts')).filter(name=>name.endsWith('.md')));
  const files = (await readdir('src/content/translations/en')).filter(name=>name.endsWith('.md'));
  for (const file of files) {
    const translatedSource = await readFile('src/content/translations/en/'+file,'utf8');
    const match = translatedSource.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
    assert.ok(match,file);
    const metadata = parseDocument(match[1]).toJS();
    assert.equal(metadata.translationLanguage,'en');
    assert.match(metadata.sourceHash,/^[a-f0-9]{64}$/);
    assert.ok(metadata.title&&metadata.description&&match[2].trim(),file+' complete translation');
    const english = await renderer.render(match[2],{frontmatter:metadata});
    assert.doesNotMatch(english.code,/<h1\b/);
    for (const heading of english.metadata.headings) {
      assert.match(heading.slug,/^en-section-\d+$/);
      assert.ok(english.code.includes(`id="${heading.slug}"`));
    }
    // Publishing, revising, withdrawing or deleting a Chinese article must remain
    // possible without simultaneously creating or refreshing a translation.
    if (!sources.has(file)) continue;
    const original = parseArticle(await readFile('src/content/posts/'+file,'utf8'),file.slice(0,-3));
    if (!translationIsCurrent(original,metadata)) continue;
    assert.equal(metadata.tags.length,original.tags.length,file+' tags');
    const native = await renderer.render(original.body);
    assert.deepEqual(english.metadata.headings.map(h=>h.depth),native.metadata.headings.map(h=>h.depth),file+' sections');
    const ids = [...native.code.matchAll(/\bid="([^"]+)"/g),...english.code.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
    assert.equal(ids.length,new Set(ids).size,file+' unique bilingual anchors');
    const originalLinks = [...original.body.matchAll(/https?:\/\/[^\s)]+/g)].map(m=>m[0]);
    for (const url of originalLinks) assert.ok(match[2].includes(url),file+' preserved reference '+url);
  }
});

test('Search matches either language and presents a single article in the chosen language', () => {
  const post = {title:'机器人研究',description:'中文摘要',tags:['机器人'],body:'选择性干预',category:'技术',url:'/Bohemia/posts/model4robotics/',english:{title:'Robotics research',description:'English summary',tags:['robotics'],body:'Selective intervention'}};
  const indexed = searchPostText(post);
  assert.ok(indexed.includes('选择性干预'));
  assert.ok(indexed.includes('selective intervention'));
  assert.ok(indexed.includes('technology'));
  assert.equal(displayedSearchPost(post,'en').title,'Robotics research');
  assert.equal(displayedSearchPost(post,'zh').title,'机器人研究');
  const {english,...untranslated} = post;
  assert.equal(displayedSearchPost(untranslated,'en').title,'机器人研究');
  assert.equal(post.url,'/Bohemia/posts/model4robotics/');
});
