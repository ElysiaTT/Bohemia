// Keep the two sleeves independent, with one shared vinyl geometry.
import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { recordVinyl } from './record-vinyl.mjs';

const sleeves = [
  { file: 'bohemia-cover.svg', side: 'A', rim: '#a43840', edge: '#eac194', label: '#e8d5b0', ink: '#86323b', title: 'Bohemia.' },
  { file: 'endless-refrain-cover.svg', side: 'B', rim: '#756683', edge: '#cbb9d4', label: '#c4b1c6', ink: '#4a415b', title: 'refrain.' },
];
for (const sleeve of sleeves) {
  const path = new URL(`../public/images/${sleeve.file}`, import.meta.url);
  const source = await readFile(path, 'utf8');
  const block = /<!-- record-vinyl:start -->[\s\S]*?<!-- record-vinyl:end -->/;
  if (!block.test(source)) throw new Error(`Missing vinyl block: ${sleeve.file}`);
  await writeFile(path, source.replace(block, `<!-- record-vinyl:start -->\n  ${recordVinyl(sleeve)}\n  <!-- record-vinyl:end -->`));
}

const input = fileURLToPath(new URL('../public/images/bohemia-cover.svg', import.meta.url));
const output = fileURLToPath(new URL('../public/images/bohemia-og.png', import.meta.url));
const site = JSON.parse(await readFile(new URL('../src/data/site.json', import.meta.url), 'utf8'));
const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const socialBackground = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#201b1e"/><path d="M44 42h1112M44 588h1112" stroke="#8c715d" stroke-opacity=".4"/><text x="51" y="95" fill="#bda58b" font-family="monospace" font-size="12" letter-spacing="3">A PERSONAL RHAPSODY</text><text x="48" y="265" fill="#f4e6c9" font-family="Georgia,serif" font-size="66" font-style="italic">${escape(site.title.split(' ')[0])}</text><text x="48" y="342" fill="#d8a6ab" font-family="Georgia,serif" font-size="66" font-style="italic">${escape(site.title.split(' ').slice(1).join(' '))}</text><text x="51" y="406" fill="#bda58b" font-family="Georgia,serif" font-size="22" font-style="italic">${escape(site.subtitle)}</text><text x="51" y="550" fill="#bda58b" font-family="monospace" font-size="11" letter-spacing="1.5">TWO SIDES. ONE RECORD.</text></svg>`);
const sleevePreview = await sharp(input).resize(675,540).png().toBuffer();
await sharp(socialBackground).composite([{input: sleevePreview, left:481, top:45}]).png().toFile(output);
await sharp(input).resize(800, 640).png().toFile(fileURLToPath(new URL('../docs/side-a-bohemia.png', import.meta.url)));
await sharp(fileURLToPath(new URL('../public/images/endless-refrain-cover.svg', import.meta.url))).resize(800, 640).png().toFile(fileURLToPath(new URL('../docs/side-b-endless-refrain.png', import.meta.url)));
console.log(`Generated ${site.title} sharing image (1200 × 630) and two aligned sleeve previews.`);
