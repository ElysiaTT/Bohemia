// Regenerate the social-sharing image from the original Bohemia record sleeve.
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const input = fileURLToPath(new URL('../public/images/bohemia-cover.svg', import.meta.url));
const output = fileURLToPath(new URL('../public/images/bohemia-og.png', import.meta.url));
await sharp(input).resize(1200, 630, { fit: 'contain', background: '#27221f' }).png().toFile(output);
console.log('Generated Bohemia sharing image (1200 × 630).');
