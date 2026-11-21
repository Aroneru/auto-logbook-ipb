// Render the extension icons (PNG, transparent) from one SVG with headless Chrome.
// Usage: node tools/make-icons.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './cdp.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'extension', 'icons');
mkdirSync(outDir, { recursive: true });

// A logbook: ink-blue cover with a darker spine, a white name label and the
// page block showing at the edges. Flat colours (the panel's accent), no gradient.
export const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <rect x="26" y="13" width="86" height="109" rx="7" fill="#d9d5c9"/>
  <rect x="16" y="6" width="88" height="110" rx="7" fill="#1f4590"/>
  <path d="M23 6h11v110H23a7 7 0 0 1-7-7V13a7 7 0 0 1 7-7z" fill="#163470"/>
  <rect x="44" y="24" width="50" height="34" rx="3" fill="#fff"/>
  <rect x="51" y="34" width="36" height="5" rx="2.5" fill="#1f4590"/>
  <rect x="51" y="44" width="24" height="5" rx="2.5" fill="#1f4590"/>
</svg>`;

const browser = await launch();
try {
  writeFileSync(join(outDir, 'icon.svg'), ICON_SVG + '\n');
  for (const size of [16, 32, 48, 128]) {
    const page = await browser.newPage('about:blank', { width: size, height: size });
    await page.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
    const html = `<!doctype html><html><body style="margin:0;background:transparent">${ICON_SVG.replace('<svg ', `<svg width="${size}" height="${size}" style="display:block" `)}</body></html>`;
    await page.goto(`data:text/html;base64,${Buffer.from(html).toString('base64')}`);
    const path = join(outDir, `icon-${size}.png`);
    await page.screenshot(path, { x: 0, y: 0, width: size, height: size });
    console.log('wrote', path);
  }
} finally {
  await browser.close();
}
