// Small, framework-free interactions; all articles remain readable without JavaScript.
const themeButton = document.querySelector<HTMLButtonElement>('.theme-toggle');
const updateThemeLabel = () => {
  const dark = document.documentElement.dataset.theme === 'dark';
  themeButton?.setAttribute('aria-label', dark ? '切换至浅色模式' : '切换至深色模式');
};
updateThemeLabel();
themeButton?.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('bohemia-theme', next); } catch { /* Browsing without storage is supported. */ }
  updateThemeLabel();
});

const menuButton = document.querySelector<HTMLButtonElement>('.menu-toggle');
const menu = document.querySelector<HTMLElement>('#mobile-nav');
menuButton?.addEventListener('click', () => {
  const open = menuButton.getAttribute('aria-expanded') !== 'true';
  menuButton.setAttribute('aria-expanded', String(open));
  menuButton.setAttribute('aria-label', open ? '关闭导航菜单' : '打开导航菜单');
  if (menu) menu.hidden = !open;
});
const closeMenu = () => {
  if (menu) menu.hidden = true;
  menuButton?.setAttribute('aria-expanded', 'false');
  menuButton?.setAttribute('aria-label', '打开导航菜单');
};
matchMedia('(min-width: 601px)').addEventListener('change', event => { if (event.matches) closeMenu(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && menuButton?.getAttribute('aria-expanded') === 'true') { closeMenu(); menuButton.focus(); } });

type SearchPost = { title: string; description: string; category: string; tags: string[]; body: string; url: string };
const dialog = document.querySelector<HTMLDialogElement>('#search-dialog');
const searchInput = document.querySelector<HTMLInputElement>('#search-input');
const results = document.querySelector<HTMLElement>('#search-results');
let searchPosts: Promise<SearchPost[]> | undefined;
let searchVersion = 0;
const textNode = (tag: string, text: string, className?: string) => {
  const element = document.createElement(tag);
  element.textContent = text;
  if (className) element.className = className;
  return element;
};
const search = async () => {
  const version = ++searchVersion;
  if (!results || !searchInput) return;
  const term = searchInput.value.trim().toLocaleLowerCase();
  results.replaceChildren();
  if (!term) { results.append(textNode('p', '输入关键词，寻找一段感兴趣的文字。', 'search-hint')); return; }
  results.append(textNode('p', '正在寻找…', 'search-hint'));
  try {
    searchPosts ??= fetch(dialog!.dataset.index!).then(response => {
      if (!response.ok) throw new Error('Search index unavailable');
      return response.json();
    });
    const posts = await searchPosts;
    if (version !== searchVersion) return;
    const matches = posts.filter(post => `${post.title} ${post.description} ${post.category} ${post.tags.join(' ')} ${post.body}`.toLocaleLowerCase().includes(term));
    results.replaceChildren(textNode('p', `找到 ${matches.length} 篇文章`, 'search-count'));
    if (!matches.length) results.append(textNode('p', '还没有写到这里。换个关键词试试？', 'search-hint'));
    for (const post of matches) {
      const link = document.createElement('a'); link.href = post.url; link.className = 'search-result';
      link.append(textNode('span', post.category, 'category-label'), textNode('h3', post.title), textNode('p', post.description));
      results.append(link);
    }
  } catch {
    if (version !== searchVersion) return;
    searchPosts = undefined;
    results.replaceChildren(textNode('p', '搜索暂时没有加载成功，请稍后再试。你也可以从归档页浏览文章。', 'search-hint'));
  }
};
const openSearch = () => { dialog?.showModal(); searchInput?.focus(); };
document.querySelectorAll('.search-toggle').forEach(button => button.addEventListener('click', openSearch));
document.querySelector('.search-close')?.addEventListener('click', () => dialog?.close());
dialog?.addEventListener('click', event => { if (event.target === dialog) { const bounds = dialog.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close(); } });
searchInput?.addEventListener('input', search);
document.addEventListener('keydown', event => {
  if (event.key === '/' && !dialog?.open && !(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLTextAreaElement) && !(event.target instanceof HTMLElement && event.target.isContentEditable)) { event.preventDefault(); openSearch(); }
});

const filterButtons = document.querySelectorAll<HTMLButtonElement>('[data-filter]');
const filterItems = document.querySelectorAll<HTMLElement>('[data-filter-item]');
const applyFilter = (category: string, updateUrl = false) => {
  filterButtons.forEach(button => { const selected = button.dataset.filter === category; button.setAttribute('aria-pressed', String(selected)); button.classList.toggle('selected', selected); });
  let count = 0;
  filterItems.forEach(item => { item.hidden = category !== '全部' && item.dataset.category !== category; if (!item.hidden) count++; });
  const countLabel = document.querySelector('[data-filter-count]');
  if (countLabel) countLabel.textContent = `${count} 篇文字`;
  if (updateUrl) { const url = new URL(location.href); if (category === '全部') url.searchParams.delete('category'); else url.searchParams.set('category', category); history.replaceState(null, '', url); }
};
if (filterButtons.length) {
  const initial = new URLSearchParams(location.search).get('category');
  applyFilter(initial && Array.from(filterButtons).some(button => button.dataset.filter === initial) ? initial : '全部');
  filterButtons.forEach(button => button.addEventListener('click', () => applyFilter(button.dataset.filter!, true)));
}

document.querySelectorAll<HTMLElement>('.prose pre').forEach(pre => {
  const button = document.createElement('button'); button.className = 'copy-code'; button.textContent = '复制'; button.setAttribute('aria-label', '复制代码');
  button.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(pre.querySelector('code')?.textContent || ''); button.textContent = '已复制'; } catch { button.textContent = '请手动选择复制'; }
    window.setTimeout(() => { button.textContent = '复制'; }, 2000);
  });
  pre.append(button);
});
document.querySelector<HTMLButtonElement>('[data-share]')?.addEventListener('click', async event => {
  const button = event.currentTarget as HTMLButtonElement;
  const label = button.querySelector('span');
  try { await navigator.clipboard.writeText(location.href); if (label) label.textContent = '链接已复制'; } catch { if (label) label.textContent = '请复制地址栏链接'; }
});
const progress = document.querySelector<HTMLElement>('.reading-progress');
if (progress) {
  const update = () => { const article = document.querySelector<HTMLElement>('.prose'); if (!article) return; const end = article.offsetTop + article.offsetHeight - innerHeight; const ratio = end > 0 ? Math.max(0, Math.min(1, scrollY / end)) : 1; progress.style.transform = `scaleX(${ratio})`; };
  addEventListener('scroll', update, { passive: true }); addEventListener('resize', update); update();
  const headings = document.querySelectorAll<HTMLElement>('.prose h2, .prose h3');
  const tocLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>('.toc a'));
  const observer = new IntersectionObserver(entries => { for (const entry of entries) if (entry.isIntersecting) tocLinks.forEach(link => link.classList.toggle('current', link.hash === `#${entry.target.id}`)); }, { rootMargin: '-10% 0px -70% 0px' });
  headings.forEach(heading => observer.observe(heading));
}
