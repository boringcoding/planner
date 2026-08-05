// Снимок собранной страницы в настоящем браузере.
//
// Главное правило репозитория — не отдавать результат, не посмотрев на него
// глазами. Для планов это делает npm run shot; для модели глаз не было вовсе,
// и крыша уехала на страницу невидимой: в файле она лежала, проверки по тексту
// сходились, а смотрелка прятала её фильтром уровней. Увидеть это можно было
// только на экране.
//
// Здесь site/ поднимается на localhost, открывается Chromium, нажимается
// «Показать модель», и снимок кладётся в out/. Дальше на него надо посмотреть.
//
// Браузер в devDependencies не тащится: playwright-core берёт тот Chromium,
// который уже стоит в системе. Нет браузера — команда честно говорит об этом
// и не притворяется, что проверила.

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const root = 'site';
if (!fs.existsSync(`${root}/index.html`)) {
  console.log('site/ не собран — сначала npm run site');
  process.exit(1);
}

let chromium;
try { ({ chromium } = await import('playwright-core')); }
catch { console.log('playwright-core не установлен: npm i'); process.exit(1); }

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm', '.ifc': 'application/octet-stream', '.css': 'text/css'
};

const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(root, rel === '/' ? 'index.html' : rel);
  if (!path.resolve(file).startsWith(path.resolve(root))) { res.writeHead(403).end(); return; }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise(ok => server.listen(0, '127.0.0.1', ok));
const port = server.address().port;

// Chromium уже стоит в системе, качать его не надо. Путь ищется, а не
// зашивается: версия в имени папки меняется, и жёсткий путь однажды молча
// перестанет существовать — ровно так этот скрипт и упал в первый раз
const findChrome = () => {
  if (process.env.PLAYWRIGHT_CHROMIUM) return process.env.PLAYWRIGHT_CHROMIUM;
  const dir = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (!fs.existsSync(dir)) return null;
  for (const d of fs.readdirSync(dir).filter(n => n.startsWith('chromium')).sort().reverse()) {
    const p = path.join(dir, d, 'chrome-linux', 'chrome');
    if (fs.existsSync(p)) return p;
  }
  return null;
};
const exe = findChrome();
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 2 });

const problems = [];
page.on('pageerror', e => problems.push(`ошибка страницы: ${e.message}`));
page.on('console', m => { if (m.type() === 'error') problems.push(`консоль: ${m.text()}`); });

await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
await page.locator('.v-start').click();
// смотрелка сама пишет, что делает; ждём, пока перестанет
await page.waitForFunction(
  () => /тел|треугольник|готов|слоёв|м²|·/.test(document.querySelector('.v-status')?.textContent || ''),
  null, { timeout: 120000 }
).catch(() => problems.push('смотрелка не досчитала за две минуты'));
await page.waitForTimeout(1500);

const status = await page.locator('.v-status').textContent();
fs.mkdirSync('out', { recursive: true });
await page.locator('#viewer').screenshot({ path: 'out/viewer.png' });
await page.screenshot({ path: 'out/site.png', fullPage: false });
await browser.close();
server.close();

console.log(`out/viewer.png · out/site.png`);
console.log(`  смотрелка: ${status.trim()}`);
if (problems.length) {
  console.log(`  браузер ругается (${problems.length}):`);
  problems.slice(0, 5).forEach(p => console.log(`    ${p}`));
  process.exit(1);
}
