import sharp from 'sharp';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const svgPath = join(root, 'public', 'simple-slips-logo.svg');
const svgBuffer = readFileSync(svgPath);

// Logo natural dimensions
const LOGO_W = 329;
const LOGO_H = 79;

// Icons to generate: [outputPath, size]
const icons = [
  ['public/Icon-1024.png', 1024],
  ['public/icon-512.png',  512],
  ['public/icon-192.png',  192],
  ['public/Icon-180.png',  180],
  ['public/Icon-167.png',  167],
  ['public/Icon-152.png',  152],
];

// Padding: logo occupies 68% of the icon width
const LOGO_FILL = 0.68;

async function generateIcon(outputRel, size) {
  const logoW = Math.round(size * LOGO_FILL);
  const logoH = Math.round(logoW * (LOGO_H / LOGO_W));
  const offsetX = Math.round((size - logoW) / 2);
  const offsetY = Math.round((size - logoH) / 2);

  // Render SVG at target logo size
  const logoBuffer = await sharp(svgBuffer)
    .resize(logoW, logoH, { fit: 'fill' })
    .png()
    .toBuffer();

  // Composite onto white square background
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite([{ input: logoBuffer, left: offsetX, top: offsetY }])
    .png()
    .toFile(join(root, outputRel));

  console.log(`✓ ${outputRel} (${size}×${size})`);
}

console.log('Generating icons from simple-slips-logo.svg...\n');
for (const [path, size] of icons) {
  await generateIcon(path, size);
}
console.log('\nDone.');
