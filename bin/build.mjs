// Сборка всех листов в out/: планы уровней, планы по разделам, развёртки.

import fs from 'node:fs';
import { renderLevel, renderSystem, renderRoof, renderPlot, explication } from '../src/render.mjs';
import { roofGeom, verandaGeom, plotMargins } from '../src/roof.mjs';
import { plotGeom } from '../src/plot.mjs';
import { renderElevation, elevationRooms } from '../src/elev.mjs';
import { bill } from '../src/systems.mjs';

const read = n => JSON.parse(fs.readFileSync(new URL(`../data/${n}`, import.meta.url)));
const house = read('house.json');
const systems = read('systems.json').systems;

fs.mkdirSync('out', { recursive: true });
for (const L of house.levels) {
  fs.writeFileSync(`out/${L.id}.svg`, renderLevel(house, L));
  const e = explication(L);
  console.log(`${L.title}:`);
  for (const r of e.rows) console.log(`  ${String(r.n).padStart(2)}. ${r.name.padEnd(30)} ${r.area.toFixed(1)} м²`);
  console.log(`      ${'итого полезной'.padEnd(30)} ${e.total.toFixed(1)} м²\n`);
}

fs.writeFileSync('out/roof.svg', renderRoof(house));
{
  const g = roofGeom(house), V = verandaGeom(house);
  console.log('Кровля:');
  console.log(`  ${'скаты'.padEnd(30)} ${g.area.toFixed(1)} м²`);
  console.log(`  ${'чердачное перекрытие'.padEnd(30)} ${g.attic.toFixed(1)} м²`);
  console.log(`  ${'конёк / карниз'.padEnd(30)} ${(g.ridgeZ / 1000).toFixed(3)} / ${(g.eaveZ / 1000).toFixed(3)}`);
  if (V) console.log(`  ${'веранда: настил / навес'.padEnd(30)} ${V.deckArea.toFixed(1)} / ${V.canopyArea.toFixed(1)} м²`);
  console.log('');
}

{
  const svg = renderPlot(house, systems);
  if (svg) {
    fs.writeFileSync('out/plot.svg', svg);
    const g = plotGeom(house), m = plotMargins(house);
    console.log('Генплан:');
    console.log(`  ${'участок'.padEnd(30)} ${(g.lot.w / 1000).toFixed(1)} × ${(g.lot.d / 1000).toFixed(1)} м`);
    console.log(`  ${'отступы дома СЗ/улица/ЮВ/СВ'.padEnd(30)} ${m.W} / ${m.S} / ${m.E} / ${m.N}`);
    if (g.temp) console.log(`  ${'времянка'.padEnd(30)} ${(g.temp.area).toFixed(1)} м², разрыв до дома ${(g.temp.y - house.shell.h) / 1000} м`);
    console.log('');
  }
}

for (const sys of systems) {
  const b = bill(house, sys);
  for (const L of house.levels) fs.writeFileSync(`out/${sys.id}-${L.id}.svg`, renderSystem(house, L, sys, b));
  console.log(`${sys.title}:`);
  for (const d of b.devices) console.log(`  ${(d.l || d.kind).padEnd(24)} ${String(d.n).padStart(3)}`);
  for (const m of b.materials) console.log(`  ${m.mat.padEnd(24)} ${m.m.toFixed(1).padStart(7)} м`);
  console.log('');
}

let n = 0;
for (const L of house.levels)
  for (const r of elevationRooms(L)) {
    fs.writeFileSync(`out/elev-${r.id}.svg`, renderElevation(house, L, r, systems));
    n++;
  }
console.log(`SVG -> out/ · ${house.levels.length} планов, план кровли, ${systems.length * house.levels.length} по разделам, ${n} развёрток`);
