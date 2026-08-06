// Сборка статического сайта в site/: чертежи, экспликации, задание.
// Как и всё остальное, выводится из data/house.json — площади не хранятся, а считаются.

import fs from 'node:fs';
import { renderLevel, renderSystem, renderRoof, renderPlot, renderFacade, renderSection, FACADE_SIDES, explication, areas } from '../src/render.mjs';
import { roofGeom, verandaGeom, flueTop, plotMargins } from '../src/roof.mjs';
import { plotGeom } from '../src/plot.mjs';
import { feedsGeom } from '../src/systems.mjs';
import { renderElevation, elevationRooms } from '../src/elev.mjs';
import { bill } from '../src/systems.mjs';
import { ifc } from '../src/ifc.mjs';
import { openingSchedule, lintelSchedule } from '../src/cost.mjs';

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

const plotG = plotGeom(house);
const nav = levels.map(({ L }) => `<a href="#${slug(L.id)}">${esc(L.title)}</a>`).join('')
  + '<a href="#facades">Фасады</a><a href="#section">Разрез</a>'
  + (plotG ? '<a href="#plot">Генплан</a>' : '')
  + (house.roof ? '<a href="#roof">Кровля</a>' : '')
  + bills.map(({ sys }) => `<a href="#${slug(sys.id)}">${esc(sys.title.split(' · ')[0])}</a>`).join('')
  + '<a href="#spec">Спецификации</a>'
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

// Фасады и разрез: до них отметки окон жили только в данных, а вертикаль
// дома — в шапках листов. Монтажник и каменщик работают по этим двум
const facadeSection = `
    <section class="sheet" id="facades">
      <div class="sheet-head">
        <h2>Фасады</h2>
        <p class="meta">Оси проёмов и отметки низа каждого окна — те же числа, что держит правило
          осей фасада: совпали или разведены не меньше 600. Отметки в метрах от чистого пола.</p>
      </div>
      ${FACADE_SIDES.map(([sd, name]) => `<figure class="plan"><figcaption style="font-size:12px;letter-spacing:.09em;text-transform:uppercase;color:var(--ink35);padding:10px 14px 0">${esc(name)}</figcaption>${renderFacade(house, sd)}</figure>`).join('\n      ')}
    </section>`;

const sectionSheetHtml = `
    <section class="sheet" id="section">
      <div class="sheet-head">
        <h2>Разрез 1-1</h2>
        <p class="meta">Секущая по лестничной шахте. Дно котлована, фундаментный пирог, толщины
          перекрытий, марши и ферма кровли — вертикаль всего дома одним листом.</p>
      </div>
      <figure class="plan">${renderSection(house)}</figure>
    </section>`;

// Генплан: единственный лист, где виден весь участок — посадка дома,
// времянка, забор, септик и наружные сети. Конфликтуют они именно здесь
const plotSection = (() => {
  if (!plotG) return '';
  const m = plotMargins(house);
  const feeds = systems.flatMap(sys => feedsGeom(house, sys));
  const sewerIn = feeds.find(f => f.id === 'vk.out1');
  const rows = [
    ['Участок', `${(plotG.lot.w / 1000).toFixed(1).replace('.', ',')} × ${(plotG.lot.d / 1000).toFixed(1).replace('.', ',')} м, въезд с юго-запада`],
    ['Посадка дома', `${m.S / 1000} м от красной линии, ${m.W / 1000} м от северо-западной границы; до остальных ${m.E / 1000} и ${m.N / 1000} м`],
    ...(plotG.temp ? [['Времянка', `${plotG.temp.w / 1000} × ${plotG.temp.h / 1000} м из блока в дальнем юго-восточном углу — жильё на время стройки; противопожарный разрыв до дома ${((plotG.temp.y - house.shell.h) / 1000).toFixed(1).replace('.', ',')} м (два несгораемых — норма 6)`]] : []),
    ['Забор', `${(plotG.fence.len / 1000).toFixed(0)} м по периметру, въездные ворота ${plotG.fence.gate ? plotG.fence.gate.w / 1000 : '—'} м по оси гаражного фронта, калитка против дорожки`],
    ...(plotG.septic ? [['Канализация', `станция биоочистки у въезда — обслуживание с улицы, без заезда машины; 5 м от обоих домов, ${((plotG.lot.x1 - plotG.septic.x - plotG.septic.w) / 1000).toFixed(1).replace('.', ',')} м до границы; самотёк 2 %${sewerIn ? `, вход ${(sewerIn.pts[sewerIn.pts.length - 1].z / 1000).toFixed(2).replace('.', ',')}` : ''}; очищенная вода — напорным сбросом в кювет`]] : []),
    ['Вода', 'трубой с угла ЮЗ-ЮВ, врезка на улице; к дому и времянке ниже промерзания (−2,80); футляры на пересечении со сбросом и вдоль фундамента'],
    ['Электрика', 'кабельные вводы дома и времянки от одной точки учёта, в полуметре и дальше от труб']
  ];
  return `
    <section class="sheet" id="plot">
      <div class="sheet-head">
        <h2>Генплан</h2>
        <p class="meta">Посадка, забор с воротами, времянка и наружные сети. Все расстояния считаются
          из тех же данных, что и правила: сдвинулся септик — пересчитались трубы, смета и проверки.</p>
      </div>
      <figure class="plan">${renderPlot(house, systems)}</figure>
      <table class="expl">
        <caption>Решение</caption>
        <thead><tr><th>Что</th><th>Как</th></tr></thead>
        <tbody>${rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</tbody>
      </table>
    </section>`;
})();

// Кровля: на планах этажей её нет по определению, а под ней и водосток,
// и высоты труб, и навес веранды. Отдельный лист — единственное место,
// где это видно
const roofSection = (() => {
  if (!house.roof) return '';
  const R = house.roof, g = roofGeom(house), V = verandaGeom(house);
  const top = house.levels[house.levels.length - 1];
  const rows = [
    ['Уклон', `${R.pitch}°, конёк ${g.alongY ? 'вдоль дома' : 'поперёк дома'}`],
    ['Конёк', `${m2(g.ridgeZ / 1000)} м от нуля`],
    ['Карниз', `${m2(g.eaveZ / 1000)} м, свес ${R.eave} и ${R.gable} по фронтону`],
    ['Скаты', `${m2(g.area)} м², в плане ${m2(g.plan)} м²`],
    ['Схема', `${g.trusses} висячих ферм с шагом ${R.rafterStep}: стропила ${R.rafter[0]}×${R.rafter[1]}, затяжка ${R.tie[0]}×${R.tie[1]}, бабка 2×${R.hanger[1]}×${R.hanger[0]}`],
    ['Почему без прогона', 'под линией конька нет несущей стены на всю длину дома — над спальней хозяев её нет вовсе; распор замыкает затяжка'],
    ['Покрытие', R.cover],
    ['Водосток', `жёлоб ø${R.gutter} на ${m2(g.gutterLen / 1000)} м, труб ${g.drains}`],
    ['Чердак', `холодный, утепление перекрытия ${R.insulation}, продух ${R.vent}`],
    ...(top.flues || []).map(f => [`Дымоход ${f.id.split('.')[1]}`, `верх ${m2(flueTop(house, f) / 1000)} м`]),
    ...(top.ducts || []).map(d => [`Вентшахта ${d.id.split('.')[1]}`, `верх ${m2(flueTop(house, d) / 1000)} м`]),
    ...(V ? [['Веранда', `настил ${m2(V.deckArea)} м², навес ${m2(V.canopyArea)} м² под ${V.v.pitch}°`],
    ['Под навесом', `${V.clear} мм у наружного края`]] : [])
  ];
  return `
    <section class="sheet" id="roof">
      <div class="sheet-head">
        <h2>Кровля</h2>
        <p class="meta">Двускатная с холодным чердаком. Отметки конька, карниза и верха каждой трубы
          посчитаны от уклона: поменять уклон в данных — пересчитаются и лист, и выгрузка, и смета.</p>
      </div>
      <figure class="plan">${renderRoof(house)}</figure>
      <table class="expl">
        <caption>Решение</caption>
        <thead><tr><th>Что</th><th>Как</th></tr></thead>
        <tbody>${rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</tbody>
      </table>
    </section>`;
})();

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

// Спецификации: по ним заказывают. Окна девяти типоразмеров с разными
// подоконниками и перемычки трёх толщин стен из строк сметы не заказать —
// а из данных они собираются сами
const specSection = (() => {
  const ops = openingSchedule(house);
  const lint = lintelSchedule(house);
  const sills = r => [...r.sills].sort((a, b) => a - b).map(v => v).join(' / ');
  return `
    <section class="sheet" id="spec">
      <div class="sheet-head">
        <h2>Спецификации</h2>
        <p class="meta">Ведомости заполнений и перемычек — из той же геометрии, что планы и смета.
          Направление открывания створок — при заказе, по месту; это допущение, а не потеря.</p>
      </div>
      <table class="expl">
        <caption>Ведомость заполнений проёмов</caption>
        <thead><tr><th>Марка</th><th>Что</th><th>Ширина × высота</th><th>Низ от пола</th><th>Кол-во</th><th>Примечание</th></tr></thead>
        <tbody>${ops.map(r => `<tr>
          <td class="num">${r.mark}</td>
          <td>${{ 'ОК': 'окно', 'ДН': 'дверь наружная', 'ДВ': 'дверь внутренняя', 'В': 'ворота', 'Л': 'люк' }[r.cls]}</td>
          <td class="num">${r.w} × ${r.h}</td>
          <td class="num">${r.sills.size ? sills(r) : '—'}</td>
          <td class="num">${r.n}</td>
          <td>${esc([...r.notes].join(', ') || '')}<span class="use"> · ${esc(r.ids.join(', '))}</span></td>
        </tr>`).join('\n        ')}</tbody>
      </table>
      <table class="expl">
        <caption>Гильзы и закладные в монолите — заложить до заливки</caption>
        <thead><tr><th>Трасса</th><th>Здание</th><th>Стена</th><th>По стене</th><th>Ось</th><th>Гильза</th></tr></thead>
        <tbody>${systems.flatMap(sys => feedsGeom(house, sys)).filter(f => !f.pressure).map(f => {
    const dn = f.kind === 'sewer' ? 'DN 200' : f.kind === 'water' ? 'DN 75' : 'DN 110';
    const tmp = !!f.target;
    const p = f.exit ? f.pts[0] : tmp ? f.pts[f.pts.length - 1] : f.pts[0];
    const side = f.exit ? f.exit.side : tmp ? f.enter.side : f.side;
    const at = f.exit ? f.exit.at : tmp ? f.enter.at : f.at;
    return `<tr><td>${esc(f.id)} · ${f.kind === 'sewer' ? 'канализация' : f.kind === 'water' ? 'вода' : 'кабель'}</td>
          <td>${tmp || f.exit ? 'времянка' : 'дом'}</td><td class="num">${side}</td>
          <td class="num">${at}</td><td class="num">${(p.z / 1000).toFixed(2).replace('.', ',')}</td><td class="num">${dn}</td></tr>`;
  }).join('\n        ')}</tbody>
      </table>
      <table class="expl">
        <caption>Ведомость перемычек (опирание 250 на сторону)</caption>
        <thead><tr><th>Марка</th><th>Стена</th><th>Проём</th><th>Длина</th><th>Кол-во</th><th>Тип</th></tr></thead>
        <tbody>${lint.list.map(r => `<tr>
          <td class="num">${r.mark}</td>
          <td class="num">${r.th}</td>
          <td class="num">${r.span}</td>
          <td class="num">${r.len}</td>
          <td class="num">${r.n}</td>
          <td>${r.mono ? 'монолитный участок, армирование по расчёту КЖ' : 'сборная / U-блок'}<span class="use"> · ${esc(r.ids.join(', '))}</span></td>
        </tr>`).join('\n        ')}
        <tr><td></td><td colspan="4">проёмов в монолите цоколя — обрамление в теле стены, уходит в КЖ</td><td class="num">${lint.cokol}</td></tr></tbody>
      </table>
    </section>`;
})();

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
          про этот репозиторий: на экране выгрузка, а не наша геометрия, нарисованная второй раз.
          Клик по элементу говорит, что это; alt-клик по фишке слоя оставляет только его;
          срез режет дом по высоте, список помещений изолирует одно; «оболочка 40%»
          показывает трассы разделов сквозь стены.</p>
      </div>
      <div class="viewer" id="viewer">
        <div class="v-panel"></div>
        <canvas></canvas>
        <button type="button" class="v-start">Показать модель</button>
        <p class="v-status">7 МБ движка загрузятся по нажатию, не раньше</p>
      </div>
      <p class="note">Выгрузка: <a href="house.ifc" download>house.ifc</a> — ${(ifcText.length / 1024).toFixed(0)} КБ,
        IFC4, единицы миллиметры. Помещения, стены с фронтонами, проёмы с заполнениями — дверь
        здесь коробка с полотном, окно — рама со стеклом, у каждого IfcDoorType/IfcWindowType,
        стили поверхностей и материалы, поэтому в ArchiCAD файл открывается домом, а не серыми
        блоками. Кровля с водостоком и снегозадержанием, отмостка, ограждения, лестница, мебель,
        ${systems.reduce((n, s) => n + s.points.length, 0)} точек разделов и трассы, собранные
        в четыре системы, — те же прогоны, по которым посчитаны ведомости.
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
  .v-range { flex: 0 1 180px; accent-color: #6E7178; }
  .v-select { font: 13px/1.2 "IBM Plex Sans", system-ui, sans-serif; color: #171C24;
              background: #FBFAF7; border: 1px solid #CFCDC4; border-radius: 999px;
              padding: 5px 11px; max-width: 260px; }
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
${facadeSection}
${sectionSheetHtml}
${plotSection}
${roofSection}
${sysSections}
${specSection}
${elevSection}
${viewerSection}

  <section class="brief" id="engineer">
    <h2>Передаётся конструктору</h2>
    <p class="lede">Геометрия решена и проверена, конструктив — расчётная работа, и выдавать
      её «по опыту» при сейсмике 8 баллов нельзя. На расчёт уходят:</p>
    <ul>
      <li>армирование фундаментной плиты 400 и монолитных стен цоколя (грунт — по изысканиям);</li>
      <li>перекрытия: пролёт 7,2 м над гаражом, проёмы лестничной шахты и стояков;</li>
      <li>антисейсмические пояса и сердечники кладки — площадка 8 баллов;</li>
      <li>монолитные участки над проёмами шире 1,75 м (ведомость перемычек выше);</li>
      <li>узлы висячей фермы: опирание на мауэрлат, узел бабка–затяжка, стык затяжки на пролёте 7,6 м;</li>
      <li>основание: инженерная геология и УГВ не выполнены — до откопки котлована обязательны
        изыскания, посадка и дренаж приняты по условному грунту.</li>
    </ul>
    <p class="note">Гильзы и закладные для вводов — в таблице раздела «Спецификации»: их кладут
      в опалубку до заливки, сверлить монолит при сейсмике — портить расчётное сечение.</p>
  </section>

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
if (house.roof) fs.writeFileSync('site/roof.svg', renderRoof(house));
if (plotG) fs.writeFileSync('site/plot.svg', renderPlot(house, systems));
for (const [sd] of FACADE_SIDES) fs.writeFileSync(`site/facade-${sd}.svg`, renderFacade(house, sd));
fs.writeFileSync('site/section.svg', renderSection(house));
fs.writeFileSync('site/house.ifc', ifcText);
if (hasEngine) {
  fs.copyFileSync(new URL('../src/viewer.js', import.meta.url), 'site/viewer.js');
  for (const f of WEB_IFC) fs.copyFileSync(new URL(f, engineDir), `site/${f}`);
}
console.log(`site/index.html + ${levels.length + (house.roof ? 1 : 0) + bills.length * house.levels.length + elevs.length} SVG`
  + ` + house.ifc${hasEngine ? ' + смотрелка' : ' (движок не установлен, 3D без него)'}`);
