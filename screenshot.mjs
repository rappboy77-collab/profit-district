/**
 * screenshot.mjs
 * Usage:  node screenshot.mjs <url> [label]
 * Saves:  ./temporary screenshots/screenshot-N.png
 *         ./temporary screenshots/screenshot-N-<label>.png
 */

import puppeteer from 'puppeteer';
import { writeFile, mkdir, readdir } from 'fs/promises';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const OUT_DIR   = join(__dirname, 'temporary screenshots');

async function nextIndex(dir) {
  try {
    const files = await readdir(dir);
    const nums  = files
      .filter(f => extname(f) === '.png')
      .map(f => parseInt(f.match(/^screenshot-(\d+)/)?.[1] ?? '0', 10))
      .filter(n => !isNaN(n));
    return nums.length ? Math.max(...nums) + 1 : 1;
  } catch {
    return 1;
  }
}

const [,, url = 'http://localhost:3000', label] = process.argv;
if (!url.startsWith('http')) {
  console.error('Usage: node screenshot.mjs <url> [label]');
  process.exit(1);
}

await mkdir(OUT_DIR, { recursive: true });

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

// Short settle for animations
await new Promise(r => setTimeout(r, 800));

const idx      = await nextIndex(OUT_DIR);
const filename = label ? `screenshot-${idx}-${label}.png` : `screenshot-${idx}.png`;
const outPath  = join(OUT_DIR, filename);

const buf = await page.screenshot({ fullPage: true });
await writeFile(outPath, buf);
await browser.close();

console.log(`Saved → ${outPath}`);
