import fs from 'node:fs';
import { estimate } from '../src/cost.mjs';

const read = n => JSON.parse(fs.readFileSync(new URL(`../data/${n}`, import.meta.url)));
const house = read('house.json');
const systems = read('systems.json').systems;
const prices = read('prices.json');

const e = estimate(house, systems, prices);
const rub = v => v.toLocaleString('ru-RU').replace(/ /g, ' ');
const num = v => (v >= 100 ? Math.round(v) : Math.round(v * 10) / 10).toLocaleString('ru-RU');

for (const s of e.sections) {
  console.log(`\n${s.title.toUpperCase()}`);
  for (const r of s.rows)
    console.log(`  ${r.l.padEnd(46)} ${String(num(r.n)).padStart(8)} ${r.u.padEnd(6)} ${rub(r.sum).padStart(12)} ₽`);
  console.log(`  ${'—'.repeat(46)} ${rub(s.sum).padStart(28)} ₽`);
}

console.log(`\nИТОГО`);
console.log(`  ${'работы и материалы'.padEnd(46)} ${rub(e.base).padStart(28)} ₽`);
console.log(`  ${`доставка ${prices.items.delivery[2]} %`.padEnd(46)} ${rub(e.delivery).padStart(28)} ₽`);
console.log(`  ${`резерв ${Math.round(prices.reserve * 100)} %`.padEnd(46)} ${rub(e.reserve).padStart(28)} ₽`);
console.log(`  ${'всего'.padEnd(46)} ${rub(e.total).padStart(28)} ₽`);
console.log(`  ${'на квадрат полезной площади'.padEnd(46)} ${rub(Math.round(e.total / e.useful)).padStart(28)} ₽/м²`);
console.log(`\n  полезная площадь ${e.useful.toFixed(1)} м² · ${prices.region}, ${prices.date}`);
