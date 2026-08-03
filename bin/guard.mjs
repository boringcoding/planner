// Страховка на время перестройки модели: правка, которая не должна менять
// чертёж, не должна менять и байты. Порядок такой —
//   npm run build   (out/*.svg — эталон)
//   правка кода или структуры данных
//   npm run guard   (сравнение с эталоном)
// Расхождение здесь означает, что рефакторинг задел геометрию.

import fs from 'node:fs';
import { renderLevel } from '../src/render.mjs';

const house = JSON.parse(fs.readFileSync(new URL('../data/house.json', import.meta.url)));
let bad = 0, missing = 0;

for (const L of house.levels) {
  const path = `out/${L.id}.svg`;
  if (!fs.existsSync(path)) { console.log(`${path}: эталона нет — сначала npm run build`); missing++; continue; }
  const was = fs.readFileSync(path, 'utf8'), now = renderLevel(house, L);
  if (was === now) { console.log(`${L.title}: байт в байт`); continue; }
  bad++;
  const i = [...now].findIndex((c, k) => c !== was[k]);
  console.log(`${L.title}: РАСХОЖДЕНИЕ с ${i}-го байта (${was.length} -> ${now.length})`);
  console.log(`   было: ${JSON.stringify(was.slice(i, i + 90))}`);
  console.log(`   стало: ${JSON.stringify(now.slice(i, i + 90))}`);
}

if (missing) process.exit(1);
if (bad) { console.log(`\nЧертежей изменилось: ${bad}. Если этого и добивались — npm run build.`); process.exit(1); }
console.log('Чертежи не изменились.');
