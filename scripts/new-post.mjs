import { writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const slug = args[0];
if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
  console.error('用法：npm run new -- my-first-post "我的第一篇文章"\n文件名请使用小写英文、数字和短横线。');
  process.exit(1);
}
const title = args[1] || '一篇新的记录';
const path = fileURLToPath(new URL(`../src/content/posts/${slug}.md`, import.meta.url));
if (existsSync(path)) { console.error('同名文章已存在，不会覆盖。'); process.exit(1); }
const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const content = `---\ntitle: ${JSON.stringify(title)}\ndescription: "在这里写一句文章摘要。"\ndate: ${date}\ncategory: "随想"\ntags: []\ndraft: true\ndemo: false\n---\n\n## 从这里开始\n\n写下你的第一段内容。\n`;
writeFileSync(path, content, { encoding: 'utf8', flag: 'wx' });
console.log(`已创建草稿：${path}\n写完后将 draft 改为 false 即可发布。`);
