// Страховка на время перестройки модели: правка, которая не должна менять
// чертёж, не должна менять и байты. Порядок такой —
//   npm run build   (out/*.svg — эталон)
//   правка кода или структуры данных
//   npm run guard   (сравнение с эталоном)
// Расхождение здесь означает, что рефакторинг задел геометрию.
//
// Сверялись только три плана этажей, и это делало команду бесполезной ровно
// там, где она нужнее всего: времянка нарисована на генплане и больше нигде,
// поэтому её перестройка из коробки в дом прошла мимо guard целиком — три
// плана этажей байт в байт, «чертежи не изменились». То же и с кровлей,
// фасадами, разрезом, листами разделов и развёртками. Теперь сверяются все
// листы, которые собирает npm run build, и список берётся не руками:
// разошёлся состав out/ с этим списком — это тоже расхождение.

import fs from 'node:fs';
import { renderLevel, renderSystem, renderRoof, renderPlot, renderFacade, renderSection, FACADE_SIDES } from '../src/render.mjs';
import { renderElevation, elevationRooms } from '../src/elev.mjs';
import { bill } from '../src/systems.mjs';

const read = n => JSON.parse(fs.readFileSync(new URL(`../data/${n}`, import.meta.url)));
const house = read('house.json');
const systems = read('systems.json').systems;

// тот же порядок и те же вызовы, что в bin/build.mjs: лист, которого нет
// здесь, не проверяется ничем
const sheets = [];
for (const L of house.levels) sheets.push([`${L.id}.svg`, L.title, () => renderLevel(house, L)]);
sheets.push(['roof.svg', 'Кровля', () => renderRoof(house)]);
for (const [side, title] of FACADE_SIDES) sheets.push([`facade-${side}.svg`, `Фасад ${title || side}`, () => renderFacade(house, side)]);
sheets.push(['section.svg', 'Разрез 1-1', () => renderSection(house)]);
sheets.push(['plot.svg', 'Генплан', () => renderPlot(house, systems)]);
for (const sys of systems) {
  const b = bill(house, sys);
  for (const L of house.levels)
    sheets.push([`${sys.id}-${L.id}.svg`, `${sys.id.toUpperCase()} · ${L.title}`, () => renderSystem(house, L, sys, b)]);
}
for (const L of house.levels)
  for (const r of elevationRooms(L))
    sheets.push([`elev-${r.id}.svg`, `Развёртка ${r.id}`, () => renderElevation(house, L, r, systems)]);

let bad = 0, missing = 0;
for (const [file, title, make] of sheets) {
  const path = `out/${file}`;
  if (!fs.existsSync(path)) { console.log(`${path}: эталона нет — сначала npm run build`); missing++; continue; }
  const was = fs.readFileSync(path, 'utf8'), now = make() || '';
  if (was === now) continue;
  bad++;
  const i = [...now].findIndex((c, k) => c !== was[k]);
  console.log(`${title} (${file}): РАСХОЖДЕНИЕ с ${i}-го байта (${was.length} -> ${now.length})`);
  console.log(`   было: ${JSON.stringify(was.slice(i, i + 90))}`);
  console.log(`   стало: ${JSON.stringify(now.slice(i, i + 90))}`);
}

// лист, который собрался, но никем не сверяется, — та же дыра, что и раньше
const known = new Set(sheets.map(s => s[0]));
const stray = fs.existsSync('out') ? fs.readdirSync('out').filter(n => n.endsWith('.svg') && !known.has(n)) : [];
for (const n of stray) console.log(`out/${n}: лист есть, а в списке guard его нет — сверять нечем`);

if (missing) process.exit(1);
if (bad || stray.length) {
  if (bad) console.log(`\nЧертежей изменилось: ${bad} из ${sheets.length}. Если этого и добивались — npm run build.`);
  process.exit(1);
}
console.log(`Чертежи не изменились: ${sheets.length} листов байт в байт.`);
