// Social sharing defaults to Side A; retain separate visual proofs for both covers.
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const input = fileURLToPath(new URL('../public/images/bohemia-cover.svg', import.meta.url));
const output = fileURLToPath(new URL('../public/images/bohemia-og.png', import.meta.url));
await sharp(input).resize(1200, 630, { fit: 'contain', background: '#27221f' }).png().toFile(output);
await sharp(input).resize(800, 640).png().toFile(fileURLToPath(new URL('../docs/side-a-bohemia.png', import.meta.url)));
await sharp(fileURLToPath(new URL('../public/images/endless-refrain-cover.svg', import.meta.url))).resize(800, 640).png().toFile(fileURLToPath(new URL('../docs/side-b-endless-refrain.png', import.meta.url)));
console.log('Generated Bohemia sharing image (1200 × 630).');
