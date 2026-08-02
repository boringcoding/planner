import fs from 'node:fs';
import { renderLevel, explication } from '../src/render.mjs';
const house = JSON.parse(fs.readFileSync(new URL('../data/house.json', import.meta.url)));
fs.mkdirSync('out', { recursive: true });
for (const L of house.levels) {
  fs.writeFileSync(`out/${L.id}.svg`, renderLevel(house, L));
  const e = explication(L);
  console.log(`${L.title}:`);
  for (const r of e.rows) console.log(`  ${String(r.n).padStart(2)}. ${r.name.padEnd(30)} ${r.area.toFixed(1)} м²`);
  console.log(`      ${'итого полезной'.padEnd(30)} ${e.total.toFixed(1)} м²\n`);
}
console.log('SVG -> out/');
