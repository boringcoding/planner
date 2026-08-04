// Сборка статического сайта в site/: чертежи, экспликации, задание.
// Как и всё остальное, выводится из data/house.json — площади не хранятся, а считаются.

import fs from 'node:fs';
import { renderLevel, renderSystem, explication, areas } from '../src/render.mjs';
import { renderElevation, elevationRooms } from '../src/elev.mjs';
import { bill } from '../src/systems.mjs';
import { ifc } from '../src/ifc.mjs';

const read = n => JSON.parse(fs.readFileSync(new URL(`../data/${n}`, import.meta.url)));
const house = read('house.json');
const brief = read('brief.json');
const systems = read('systems.json').systems;

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const m2 = v => v.toFixed(1).replace('.', ',');
const slug = s => s.replace(/[^a-z0-9]/gi, '');

const levels = house.levels.map(L => {
  const e = explication(L);
  return { L, e, svg: renderLevel(house, L) };
});

const bills = systems.map(sys => ({ sys, b: bill(house, sys) }));
const ifcText = ifc(house, systems, { name: 'house.ifc' });

// Движок web-ifc раздаётся рядом со страницей, если он установлен.
// Нет — страница собирается без 3D: сайт не должен падать из-за смотрелки
const WEB_IFC = ['web-ifc-api-iife.js', 'web-ifc.wasm'];
const engineDir = new URL('../node_modules/web-ifc/', import.meta.url);
const hasEngine = WEB_IFC.every(f => fs.existsSync(new URL(f, engineDir)));
const elevs = house.levels.flatMap(L => elevationRooms(L).map(r => ({ L, r, svg: renderElevation(house, L, r, systems) })));

const totalUseful = levels.reduce((s, { e }) => s + e.total, 0);
const footprint = house.shell.w * house.shell.h / 1e6;

const A = areas(house);
const facts = [
  ['Жилая площадь', `${m2(A.live)} м²`],
  ['Без технических', `${m2(A.living)} м²`],
  ['Всего по полу', `${m2(A.total)} м²`],
  ['Пятно застройки', `${m2(footprint)} м²`],
  ['Габарит', `${m2(house.shell.w / 1000)} × ${m2(house.shell.h / 1000)} м`],
  ['Уровней', String(house.levels.length)],
  ['Точек по разделам', String(systems.reduce((n, s) => n + s.points.length, 0))],
  ['Трасс', `${Math.round(bills.reduce((n, { b }) => n + b.total, 0))} м`],
];

const nav = levels.map(({ L }) => `<a href="#${slug(L.id)}">${esc(L.title)}</a>`).join('')
  + bills.map(({ sys }) => `<a href="#${slug(sys.id)}">${esc(sys.title.split(' · ')[0])}</a>`).join('')
  + '<a href="#elev">Развёртки</a>' + (hasEngine ? '<a href="#ifc">Модель</a>' : '');

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
          ${e.rows.map(r => `<tr><td class="num">${r.n}</td><td>${esc(r.name)}${r.use === 'live' ? '' : `<span class="use"> · ${r.use === 'service' ? 'бытовое' : 'техническое'}</span>`}</td><td class="num">${m2(r.area)} м²</td></tr>`).join('\n          ')}
        </tbody>
        <tfoot>
          <tr><td></td><td>Жилые</td><td class="num">${m2(e.live)} м²</td></tr>
          <tr><td></td><td>Всего по полу</td><td class="num">${m2(e.total)} м²</td></tr>
        </tfoot>
      </table>
    </section>`).join('\n');

const sysSections = bills.map(({ sys, b }) => `
    <section class="sheet" id="${slug(sys.id)}">
      <div class="sheet-head">
        <h2>${esc(sys.title)}</h2>
        <p class="meta">${esc(sys.note)}</p>
      </div>
      ${house.levels.map(L => `<figure class="plan">${renderSystem(house, L, sys, b)}</figure>`).join('\n      ')}
      <table class="expl">
        <caption>Ведомость: оборудование</caption>
        <thead><tr><th>Что</th><th>Кол-во</th></tr></thead>
        <tbody>${b.devices.map(d => `<tr><td>${esc(d.l || d.kind)}</td><td class="num">${d.n}</td></tr>`).join('')}</tbody>
      </table>
      <table class="expl">
        <caption>Ведомость: трассы</caption>
        <thead><tr><th>Материал</th><th>Длина</th></tr></thead>
        <tbody>${b.materials.map(m => `<tr><td>${esc(m.mat)}</td><td class="num">${m2(m.m)} м</td></tr>`).join('')}</tbody>
        <tfoot><tr><td>Итого с запасом ${Math.round((1.12 - 1) * 100)} %</td><td class="num">${m2(b.total)} м</td></tr></tfoot>
      </table>
    </section>`).join('\n');

const elevSection = `
    <section class="sheet" id="elev">
      <div class="sheet-head">
        <h2>Развёртки</h2>
        <p class="meta">Четыре грани помещения подряд: юго-запад, юго-восток, северо-восток, северо-запад.
          Точки всех разделов на одном листе — затем развёртка и нужна.</p>
      </div>
      ${elevs.map(({ L, r, svg }) => `<figure class="plan elev"><figcaption>${esc(r.name)} · ${esc(L.title.toLowerCase())}</figcaption>${svg}</figure>`).join('\n      ')}
    </section>`;

const viewerSection = hasEngine ? `
    <section class="sheet" id="ifc">
      <div class="sheet-head">
        <h2>Модель</h2>
        <p class="meta">Тот же дом в IFC4. Файл читает web-ifc — движок, который ничего не знает
          про этот репозиторий: на экране выгрузка, а не наша геометрия, нарисованная второй раз.</p>
      </div>
      <div class="viewer" id="viewer">
        <div class="v-panel"></div>
        <canvas></canvas>
        <button type="button" class="v-start">Показать модель</button>
        <p class="v-status">7 МБ движка загрузятся по нажатию, не раньше</p>
      </div>
      <p class="note">Выгрузка: <a href="house.ifc" download>house.ifc</a> — ${(ifcText.length / 1024).toFixed(0)} КБ,
        IFC4, единицы миллиметры. Помещения, стены, проёмы с заполнениями, перекрытия, лестница,
        мебель и ${systems.reduce((n, s) => n + s.points.length, 0)} точек разделов, собранных в четыре системы.
        Идентификаторы вида <code>second.f12</code> уходят в свойства элементов, поэтому обратная связь
        с этим репозиторием не теряется.</p>
    </section>` : '';

const html = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Crect width='16' height='16' fill='%23171C24'/%3E%3Crect x='3' y='3' width='10' height='10' fill='%23FBFAF7'/%3E%3Crect x='3' y='9' width='10' height='1' fill='%23171C24'/%3E%3C/svg%3E">
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
  .plan + .plan { margin-top: 16px; }
  .viewer { position: relative; margin-top: 24px; border: 1px solid var(--line); border-radius: 4px;
            background: #E4E3DC; overflow: hidden; }
  .viewer canvas { display: block; width: 100%; height: min(70vh, 560px); touch-action: none; }
  .v-panel { display: flex; flex-direction: column; gap: 6px; padding: 12px 14px 0; }
  .v-row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
  .v-title { font-size: 11px; letter-spacing: 0.09em; text-transform: uppercase; color: #9A9CA1;
             margin-right: 6px; min-width: 52px; }
  .v-chip { --c: #6E7178; font: 13px/1 "IBM Plex Sans", system-ui, sans-serif; color: #6E7178;
            background: transparent; border: 1px solid #CFCDC4; border-radius: 999px;
            padding: 5px 11px; cursor: pointer; }
  .v-chip.on { color: #171C24; border-color: var(--c); box-shadow: inset 0 0 0 1px var(--c); }
  .v-start { position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%);
             font: 15px/1 "IBM Plex Sans", system-ui, sans-serif; color: #171C24; background: #FBFAF7;
             border: 1px solid #171C24; border-radius: 999px; padding: 11px 22px; cursor: pointer; }
  .viewer.ready .v-start, .viewer.busy .v-start { display: none; }
  .v-status { position: absolute; left: 12px; bottom: 10px; margin: 0; font-size: 12px;
              font-family: "IBM Plex Mono", ui-monospace, monospace; color: #6E7178;
              background: rgba(251,250,247,0.82); border-radius: 999px; padding: 4px 10px; }
  .elev figcaption { font-size: 12px; letter-spacing: 0.09em; text-transform: uppercase;
                     color: var(--ink35); padding: 10px 14px 0; }
  table.expl { width: 100%; border-collapse: collapse; margin-top: 24px; font-size: 15px; }
  table.expl caption { text-align: left; font-size: 12px; letter-spacing: 0.09em;
                       text-transform: uppercase; color: var(--ink35); padding-bottom: 8px; }
  .expl th, .expl td { text-align: left; padding: 7px 10px; border-bottom: 1px solid var(--line); }
  .expl th { font-size: 12px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink35); font-weight: 500; }
  .expl td.num, .expl th:first-child, .expl th:last-child { font-family: "IBM Plex Mono", ui-monospace, monospace; }
  .expl td.num { text-align: right; white-space: nowrap; }
  .expl th:last-child { text-align: right; }
  .expl tfoot td { font-weight: 600; border-bottom: none; }
  .expl .use { color: var(--ink35); font-size: 13px; }
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
${sysSections}
${elevSection}
${viewerSection}

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
${hasEngine ? `<script src="viewer.js"></script>
<script>
  (() => {
    const root = document.getElementById('viewer');
    if (!root) return;
    root.querySelector('.v-start').addEventListener('click', () => {
      root.classList.add('busy');
      window.startViewer(root);
    }, { once: true });
  })();
</script>` : ''}
</body>
</html>
`;

fs.rmSync('site', { recursive: true, force: true });
fs.mkdirSync('site', { recursive: true });
fs.writeFileSync('site/index.html', html);
fs.writeFileSync('site/.nojekyll', '');
for (const { L, svg } of levels) fs.writeFileSync(`site/${L.id}.svg`, svg);
for (const { sys, b } of bills)
  for (const L of house.levels) fs.writeFileSync(`site/${sys.id}-${L.id}.svg`, renderSystem(house, L, sys, b));
for (const { r, svg } of elevs) fs.writeFileSync(`site/elev-${r.id}.svg`, svg);
fs.writeFileSync('site/house.ifc', ifcText);
if (hasEngine) {
  fs.copyFileSync(new URL('../src/viewer.js', import.meta.url), 'site/viewer.js');
  for (const f of WEB_IFC) fs.copyFileSync(new URL(f, engineDir), `site/${f}`);
}
console.log(`site/index.html + ${levels.length + bills.length * house.levels.length + elevs.length} SVG`
  + ` + house.ifc${hasEngine ? ' + смотрелка' : ' (движок не установлен, 3D без него)'}`);
