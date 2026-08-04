import fs from 'node:fs';
import { estimate } from '../src/cost.mjs';
import { areas } from '../src/render.mjs';

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
const a = areas(house);
console.log(`\nПЛОЩАДИ`);
for (const l of a.byLevel)
  console.log(`  ${l.title.padEnd(16)} жилая ${l.live.toFixed(1).padStart(5)} · бытовая ${l.service.toFixed(1).padStart(5)} · техническая ${l.tech.toFixed(1).padStart(5)} · всего ${l.total.toFixed(1).padStart(5)} м²`);
console.log(`  ${'—'.repeat(16)} ${a.live.toFixed(1).padStart(11)} · ${a.service.toFixed(1).padStart(13)} · ${a.tech.toFixed(1).padStart(17)} · ${a.total.toFixed(1).padStart(11)} м²`);
console.log(`\n  ${'жилая площадь'.padEnd(46)} ${a.live.toFixed(1).padStart(11)} м²`);
console.log(`  ${'без гаража, лестниц и технических'.padEnd(46)} ${a.living.toFixed(1).padStart(11)} м²`);
console.log(`  ${'всего по полу'.padEnd(46)} ${a.total.toFixed(1).padStart(11)} м²`);
console.log(`\n  ${'на квадрат жилой'.padEnd(46)} ${rub(Math.round(e.total / a.live)).padStart(11)} ₽/м²`);
console.log(`  ${'на квадрат без технических'.padEnd(46)} ${rub(Math.round(e.total / a.living)).padStart(11)} ₽/м²`);
console.log(`\n  ${prices.region}, ${prices.date}`);
