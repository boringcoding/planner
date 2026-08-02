// Сборка статического сайта в site/: чертежи, экспликации, задание.
// Как и всё остальное, выводится из data/house.json — площади не хранятся, а считаются.

import fs from 'node:fs';
import { renderLevel, explication } from '../src/render.mjs';

const read = n => JSON.parse(fs.readFileSync(new URL(`../data/${n}`, import.meta.url)));
const house = read('house.json');
const brief = read('brief.json');

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const m2 = v => v.toFixed(1).replace('.', ',');
const slug = s => s.replace(/[^a-z0-9]/gi, '');

const levels = house.levels.map(L => {
  const e = explication(L);
  return { L, e, svg: renderLevel(house, L) };
});

const totalUseful = levels.reduce((s, { e }) => s + e.total, 0);
const footprint = house.shell.w * house.shell.h / 1e6;

const facts = [
  ['Полезная площадь', `${m2(totalUseful)} м²`],
  ['Пятно застройки', `${m2(footprint)} м²`],
  ['Габарит', `${m2(house.shell.w / 1000)} × ${m2(house.shell.h / 1000)} м`],
  ['Уровней', String(house.levels.length)],
];

const nav = levels
  .map(({ L }) => `<a href="#${slug(L.id)}">${esc(L.title)}</a>`)
  .join('');

const sheets = levels.map(({ L, e, svg }) => `
    <section class="sheet" id="${slug(L.id)}">
      <div class="sheet-head">
        <h2>${esc(L.title)}</h2>
        ${L.meta ? `<p class="meta">${esc(L.meta)}</p>` : ''}
      </div>
      <figure class="plan">${svg}</figure>
      <table class="expl">
        <caption>Экспликация</caption>
        <thead><tr><th>№</th><th>Помещение</th><th>Площадь</th></tr></thead>
        <tbody>
          ${e.rows.map(r => `<tr><td class="num">${r.n}</td><td>${esc(r.name)}</td><td class="num">${m2(r.area)} м²</td></tr>`).join('\n          ')}
        </tbody>
        <tfoot><tr><td></td><td>Итого полезной</td><td class="num">${m2(e.total)} м²</td></tr></tfoot>
      </table>
    </section>`).join('\n');

const html = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(house.project.title)} — планировка</title>
<meta name="description" content="Планировка жилого дома: ${levels.map(({ L }) => esc(L.title.toLowerCase())).join(', ')}. Чертежи и экспликации собраны из одного файла геометрии.">
<style>
  :root {
    --paper: #E4E3DC; --card: #FBFAF7; --ink: #171C24;
    --ink60: #6E7178; --ink35: #9A9CA1; --line: #CFCDC4;
  }
  @media (prefers-color-scheme: dark) {
    :root { --paper: #14171C; --ink: #E8E7E0; --ink60: #9A9CA1; --ink35: #6E7178; --line: #2A2E35; }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--paper); color: var(--ink);
    font: 16px/1.55 "IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
    -webkit-text-size-adjust: 100%;
  }
  .wrap { max-width: 940px; margin: 0 auto; padding: 0 20px 96px; }
  header { padding: 64px 0 40px; border-bottom: 1px solid var(--line); }
  h1 { margin: 0 0 8px; font-size: clamp(28px, 6vw, 44px); font-weight: 600; letter-spacing: -0.01em; }
  .lede { margin: 0; color: var(--ink60); max-width: 60ch; }
  .facts { display: flex; flex-wrap: wrap; gap: 12px 40px; margin-top: 28px; }
  .facts div { min-width: 120px; }
  .facts dt { font-size: 12px; letter-spacing: 0.09em; text-transform: uppercase; color: var(--ink35); }
  .facts dd { margin: 2px 0 0; font: 500 21px/1.2 "IBM Plex Mono", ui-monospace, monospace; }
  nav { display: flex; flex-wrap: wrap; gap: 8px; padding: 20px 0; position: sticky; top: 0;
        background: var(--paper); border-bottom: 1px solid var(--line); z-index: 2; }
  nav a { font-size: 14px; text-decoration: none; color: var(--ink60);
          border: 1px solid var(--line); border-radius: 999px; padding: 5px 14px; }
  nav a:hover { color: var(--ink); border-color: var(--ink35); }
  .sheet { padding-top: 56px; scroll-margin-top: 72px; }
  .sheet-head h2 { margin: 0; font-size: 24px; font-weight: 600; }
  .meta { margin: 4px 0 0; color: var(--ink60); font-family: "IBM Plex Mono", ui-monospace, monospace; font-size: 14px; }
  .plan { margin: 24px 0 0; background: #E4E3DC; border: 1px solid var(--line); border-radius: 4px; overflow: hidden; }
  .plan svg { display: block; width: 100%; height: auto; }
  table.expl { width: 100%; border-collapse: collapse; margin-top: 24px; font-size: 15px; }
  table.expl caption { text-align: left; font-size: 12px; letter-spacing: 0.09em;
                       text-transform: uppercase; color: var(--ink35); padding-bottom: 8px; }
  .expl th, .expl td { text-align: left; padding: 7px 10px; border-bottom: 1px solid var(--line); }
  .expl th { font-size: 12px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink35); font-weight: 500; }
  .expl td.num, .expl th:first-child, .expl th:last-child { font-family: "IBM Plex Mono", ui-monospace, monospace; }
  .expl td.num { text-align: right; white-space: nowrap; }
  .expl th:last-child { text-align: right; }
  .expl tfoot td { font-weight: 600; border-bottom: none; }
  .brief { padding-top: 72px; }
  .brief h2 { font-size: 24px; margin: 0 0 20px; }
  .brief h3 { font-size: 13px; letter-spacing: 0.09em; text-transform: uppercase;
              color: var(--ink35); margin: 32px 0 10px; font-weight: 500; }
  .brief ul { margin: 0; padding-left: 20px; }
  .brief li { margin-bottom: 6px; }
  .params { border-collapse: collapse; width: 100%; max-width: 560px; font-size: 15px; }
  .params td { padding: 6px 10px 6px 0; border-bottom: 1px solid var(--line); vertical-align: top; }
  .params td:last-child { font-family: "IBM Plex Mono", ui-monospace, monospace; text-align: right; }
  .note { margin-top: 28px; padding: 14px 16px; border-left: 2px solid var(--ink35);
          color: var(--ink60); font-size: 14px; background: rgba(127,127,127,0.06); }
  footer { margin-top: 72px; padding-top: 20px; border-top: 1px solid var(--line);
           color: var(--ink35); font-size: 13px; }
  @media print {
    nav, footer { display: none; }
    .sheet { break-before: page; }
  }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>${esc(house.project.title)}</h1>
    <p class="lede">${levels.map(({ L }) => esc(L.title)).join(' · ')}. Геометрия хранится в одном
      файле в миллиметрах; чертежи, экспликации и площади выводятся из него, поэтому подпись
      и рисунок разойтись не могут.</p>
    <dl class="facts">
      ${facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('\n      ')}
    </dl>
  </header>

  <nav>${nav}<a href="#brief">Задание</a></nav>
${sheets}

  <section class="brief" id="brief">
    <h2>Задание</h2>
    <h3>Что зафиксировано</h3>
    <ul>${brief.fixed.map(t => `<li>${esc(t)}</li>`).join('')}</ul>
    <h3>Ограничения площадки</h3>
    <table class="params">
      ${brief.site.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('\n      ')}
    </table>
    <p class="note">${esc(brief.privacy)}</p>
  </section>

  <footer>Собрано из <code>data/house.json</code>. Размеры в миллиметрах, площади посчитаны по геометрии.</footer>
</div>
</body>
</html>
`;

fs.rmSync('site', { recursive: true, force: true });
fs.mkdirSync('site', { recursive: true });
fs.writeFileSync('site/index.html', html);
fs.writeFileSync('site/.nojekyll', '');
for (const { L, svg } of levels) fs.writeFileSync(`site/${L.id}.svg`, svg);
console.log(`site/index.html + ${levels.length} SVG`);
