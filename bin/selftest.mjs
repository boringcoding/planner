// Проверка проверок. Каждое правило ломается нарочно, и тест требует,
// чтобы оно сработало. Правило, которое ничего не ловит, хуже отсутствующего:
// оно создаёт ощущение проверенности.

import fs from 'node:fs';
import { check } from '../src/rules.mjs';

const read = n => JSON.parse(fs.readFileSync(new URL(`../data/${n}`, import.meta.url)));
const house = read('house.json');
const brief = read('brief.json');
const clone = () => JSON.parse(JSON.stringify(house));

const lvl = (h, id) => h.levels.find(l => l.id === id);
const room = (h, id, name) => lvl(h, id).rooms.find(r => r.name === name);
// ищем по подписи или по символу: подпись у самоочевидных предметов снята
const furn = (h, id, key) => lvl(h, id).furniture.find(f => f.l === key || f.sym === key);

const CASES = [
  ['помещение за оболочкой', /выходит за внутренний габарит/,
    h => { room(h, 'first', 'Тамбур').x += 500; }],

  ['два помещения внахлёст', /наложение/,
    h => { room(h, 'second', 'Кабинет').x -= 400; }],

  ['проём мимо стены', /не лежит в стене/,
    h => { lvl(h, 'cokol').openings[0].y += 600; }],

  ['помещение отрезано от лестницы', /не связано с лестницей/,
    h => { lvl(h, 'cokol').openings.splice(2, 1); }],

  ['мебель в зоне подхода к проёму', /перекрывает зону подхода/,
    h => { furn(h, 'cokol', 'washerCol').y = 8100; }],

  ['высокий шкаф перед окном', /загораживает окно/,
    h => { furn(h, 'first', 'fridge').x = 5000; }],

  ['слишком крутая лестница', /подъём ступени/,
    h => { lvl(h, 'first').stair.risers = 12; }],

  ['машины впритык', /между машинами/,
    h => { lvl(h, 'first').furniture[1].x = lvl(h, 'first').furniture[0].x + 2000; }],

  ['кровать вплотную к стене', /от кровати/,
    h => { lvl(h, 'second').furniture.find(f => f.t === 'bed' && f.w === 1800).x = 2600; }],

  ['шахта стояка разъехалась по уровням', /шахта стояка не совпадает/,
    h => { lvl(h, 'second').riser.x += 200; }],

  ['стояк под мебелью', /стоит на шахте стояка/,
    h => { lvl(h, 'cokol').riser.y = 7400; }],

  ['мокрые помещения не друг над другом', /не совпадают по вертикали|не лежит целиком в мокром/,
    h => { room(h, 'second', 'Санузел').x = 400; }],

  ['габарит разошёлся с заданием', /расходится с заданием/,
    h => { h.shell.h = 13000; }],

  ['гараж мельче задания', /задание требует/,
    h => { room(h, 'first', 'Гараж').h = 5800; }],

  ['подпись помещения наехала на мебель', /наезжает на мебель/,
    h => { room(h, 'cokol', 'Зона отдыха').label = { x: 5800, y: 11600 }; }],

  ['подписи листа наложились', /подписи наезжают/,
    h => { room(h, 'cokol', 'Лестница').label.y = 7300; }],

  ['подпись мебели не влезает в контур', /не влезает под контур/,
    h => { furn(h, 'cokol', 'щит').l = 'вводно-распределительное'; }],

  ['жилая комната без окна', /без естественного света/,
    h => { lvl(h, 'second').windows = lvl(h, 'second').windows.filter(w => !(w.side === 'S' && w.a === 900) && !(w.side === 'W' && w.a === 1800)); }],

  ['слишком узкое помещение', /по узкой стороне/,
    h => { room(h, 'second', 'Холл').w = 700; }],

  ['из гаража прямо в дом', /нужен тамбур/,
    h => { room(h, 'first', 'Тамбур').tag = 'hall'; }],

  ['машину убрали из гаража', /машин в гараже/,
    h => { lvl(h, 'first').furniture = lvl(h, 'first').furniture.filter(f => f.sym !== 'car' || f.x < 3000); }],

  ['гардеробная исчезла', /требует гардеробную/,
    h => { room(h, 'second', 'Гардеробная').tag = 'store'; }],

  ['вход перенесли на улицу', /вход со стороны/,
    h => { lvl(h, 'first').windows.find(w => w.kind === 'entrance').side = 'S'; }],

  ['в цоколе снова погреб', /задание его не предусматривает/,
    h => { room(h, 'cokol', 'Кладовая').name = 'Погреб'; }],

  ['спальня хозяев уехала к улице', /в уличной половине/,
    h => { room(h, 'second', 'Спальня').y = 900; }],
];

const base = check(house, brief);
if (base.length) {
  console.log('Исходные данные уже нарушают правила — сначала почини их:\n');
  base.forEach((e, i) => console.log(`${String(i + 1).padStart(2)}. ${e}`));
  process.exit(1);
}

let bad = 0;
for (const [name, expect, mutate] of CASES) {
  const h = clone();
  mutate(h);
  const errs = check(h, brief);
  const hit = errs.some(e => expect.test(e));
  if (!hit) {
    bad++;
    console.log(`НЕ ПОЙМАНО: ${name}`);
    console.log(`   ждали: ${expect}`);
    console.log(`   получили: ${errs.length ? errs.slice(0, 3).join(' | ') : 'ни одного нарушения'}\n`);
  }
}

if (bad) {
  console.log(`Правил, которые не сработали: ${bad} из ${CASES.length}.`);
  process.exit(1);
}
console.log(`Все ${CASES.length} правил ловят свой дефект.`);
