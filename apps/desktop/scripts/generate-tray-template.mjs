#!/usr/bin/env node
/**
 * Generate the tray icon set from the Orvilo mark.
 *
 * Renders three files in apps/desktop/resources:
 *   - trayTemplate.png       (@1x, 18x18, macOS)
 *   - trayTemplate@2x.png    (@2x, 36x36, macOS)
 *   - tray.png               (32x32, Windows / Linux)
 *
 * The two `*Template*` files are macOS template images, so they must contain
 * only black pixels plus an alpha channel; macOS then recolors them
 * automatically for the light / dark menu bar. The mark's leaf-shaped counter
 * is a genuine gap between the two arches, so it stays transparent without any
 * even-odd trick.
 *
 * `tray.png` is used on platforms that do not support template images. The
 * Orvilo mark is monochrome, so a bare black or bare ivory glyph would vanish
 * on one of the two taskbar themes. It therefore uses the brand's default
 * composition from docs/assets/brand/orvilo/README.md — white platform
 * background, graphite foreground — which stays legible on both.
 *
 * Run: node apps/desktop/scripts/generate-tray-template.mjs
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, '..', 'resources');

// Geometry is copied verbatim from docs/assets/brand/orvilo/mark.svg.
const UPPER =
  'M47 39C48 26 56 20 68 20H85C100 20 108 28 108 43V64C108 79 99 87 86 87H67C79 79 85 70 85 59C85 47 77 39 64 39Z';
const LOWER =
  'M81 89C80 102 72 108 60 108H43C28 108 20 100 20 85V64C20 49 29 41 42 41H61C49 49 43 58 43 69C43 81 51 89 64 89Z';

// mark.svg's own viewBox is 0 0 128 128, but the ink only spans 20..108, which
// would leave the glyph at 67% of the canvas — visibly smaller in the menu bar
// than the silhouette it replaces (which filled ~90%). Cropping to the ink plus
// 9 units of padding per side puts it back at ~83%, i.e. 15px of glyph in an
// 18px icon. Geometry is untouched; only the frame changes.
const templateSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="11 11 106 106">
  <path fill="#000" d="${UPPER}"/>
  <path fill="#000" d="${LOWER}"/>
</svg>
`;

// The mark's ink spans 20..108 of the 128 viewBox, so scale 0.22 puts the
// glyph at ~60% of the plate and leaves an even margin on every side.
const markOnPlate = `<g fill="#000" transform="translate(16 16) scale(0.22) translate(-64 -64)">
    <path d="${UPPER}"/>
    <path d="${LOWER}"/>
  </g>`;

const colorSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="7.2" fill="#FFFFFF"/>
  ${markOnPlate}
</svg>
`;

async function render(svg, size, outFile) {
  const buf = Buffer.from(svg);
  await sharp(buf, { density: Math.max(72, size * 12) })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(outFile);
  console.log(`wrote ${path.relative(process.cwd(), outFile)} (${size}x${size})`);
}

async function main() {
  await mkdir(outDir, { recursive: true });
  await render(templateSvg, 18, path.join(outDir, 'trayTemplate.png'));
  await render(templateSvg, 36, path.join(outDir, 'trayTemplate@2x.png'));
  await render(colorSvg, 32, path.join(outDir, 'tray.png'));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
