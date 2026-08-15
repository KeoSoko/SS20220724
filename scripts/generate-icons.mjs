import sharp from 'sharp';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const svgBuffer = readFileSync(join(root, 'public', 'simple-slips-logo.svg'));

// Logo natural dimensions
const LOGO_W = 329;
const LOGO_H = 79;

async function makeSquareIcon(outputRel, size, logoFill = 0.68) {
  const logoW = Math.round(size * logoFill);
  const logoH = Math.round(logoW * (LOGO_H / LOGO_W));
  const offsetX = Math.round((size - logoW) / 2);
  const offsetY = Math.round((size - logoH) / 2);

  const logoBuffer = await sharp(svgBuffer)
    .resize(logoW, logoH, { fit: 'fill' })
    .png()
    .toBuffer();

  await sharp({
    create: { width: size, height: size, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
  })
    .composite([{ input: logoBuffer, left: offsetX, top: offsetY }])
    .png()
    .toFile(join(root, outputRel));

  console.log(`✓ ${outputRel} (${size}×${size})`);
}

async function makeSplash(outputRel, width, height, logoFill = 0.55) {
  const logoW = Math.round(width * logoFill);
  const logoH = Math.round(logoW * (LOGO_H / LOGO_W));
  const offsetX = Math.round((width - logoW) / 2);
  const offsetY = Math.round((height - logoH) / 2);

  const logoBuffer = await sharp(svgBuffer)
    .resize(logoW, logoH, { fit: 'fill' })
    .png()
    .toBuffer();

  await sharp({
    create: { width, height, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
  })
    .composite([{ input: logoBuffer, left: offsetX, top: offsetY }])
    .png()
    .toFile(join(root, outputRel));

  console.log(`✓ ${outputRel} (${width}×${height})`);
}

console.log('── Square icons ──────────────────────────');
await Promise.all([
  // manifest icons (already done, kept for completeness)
  makeSquareIcon('public/Icon-1024.png',  1024),
  makeSquareIcon('public/icon-512.png',   512),
  makeSquareIcon('public/icon-192.png',   192),
  makeSquareIcon('public/Icon-180.png',   180),
  makeSquareIcon('public/Icon-167.png',   167),
  makeSquareIcon('public/Icon-152.png',   152),
  // ios-icon-* set
  makeSquareIcon('public/ios-icon-1024x1024.png', 1024),
  makeSquareIcon('public/ios-icon-180x180.png',   180),
  makeSquareIcon('public/ios-icon-167x167.png',   167),
  makeSquareIcon('public/ios-icon-152x152.png',   152),
  makeSquareIcon('public/ios-icon-120x120.png',   120),
  makeSquareIcon('public/ios-icon-128x128.png',   128),
  makeSquareIcon('public/ios-icon-76x76.png',      76),
  makeSquareIcon('public/ios-icon-64x64.png',      64),
  makeSquareIcon('public/ios-icon-60x60.png',      60),
  makeSquareIcon('public/ios-launch-icon.png',    180),
]);

console.log('\n── Splash screens ────────────────────────');
await Promise.all([
  makeSplash('public/splash-828x1792.png',   828,  1792),
  makeSplash('public/splash-1125x2436.png', 1125,  2436),
  makeSplash('public/splash-1242x2208.png', 1242,  2208),
  makeSplash('public/splash-1536x2048.png', 1536,  2048),
]);

console.log('\nDone.');
