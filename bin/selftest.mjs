// Проверка проверок. Каждое правило ломается нарочно, и тест требует,
// чтобы оно сработало. Правило, которое ничего не ловит, хуже отсутствующего:
// оно создаёт ощущение проверенности.

import fs from 'node:fs';
import { check } from '../src/rules.mjs';
import { checkSystems } from '../src/sysrules.mjs';

const read = n => JSON.parse(fs.readFileSync(new URL(`../data/${n}`, import.meta.url)));
const house = read('house.json');
const brief = read('brief.json');
const sysd = read('systems.json');
const clone = () => JSON.parse(JSON.stringify(house));
const cloneS = () => JSON.parse(JSON.stringify(sysd));

const sys = (d, id) => d.systems.find(s => s.id === id);
const pt = (d, id) => d.systems.flatMap(s => s.points).find(p => p.id === id);
const kind = (d, sid, k) => sys(d, sid).points.find(p => p.kind === k);

const lvl = (h, id) => h.levels.find(l => l.id === id);
const room = (h, id, name) => lvl(h, id).rooms.find(r => r.name === name);
// ищем по подписи или по символу: подпись у самоочевидных предметов снята
const furn = (h, id, key) => lvl(h, id).furniture.find(f => f.l === key || f.sym === key);

const CASES = [
  ['помещение за оболочкой', /выходит за внутренний габарит/,
    h => { room(h, 'first', 'Прихожая').x += 500; }],

  ['два помещения внахлёст', /наложение/,
    h => { room(h, 'second', 'Кабинет').x -= 400; }],

  ['проём мимо стены', /не лежит в стене/,
    h => { lvl(h, 'cokol').openings[0].x += 600; }],

  ['помещение отрезано от лестницы', /не связано с лестницей/,
    h => { lvl(h, 'cokol').openings.splice(2, 1); }],

  ['дверь на марше', /открывается на марш/,
    h => { delete lvl(h, 'cokol').openings.find(o => o.kind === 'pass').kind; }],

  ['мебель в зоне подхода к проёму', /перекрывает зону подхода/,
    h => { furn(h, 'cokol', 'washerCol').y = 7800; }],

  ['высокий шкаф перед окном', /загораживает окно/,
    h => { furn(h, 'first', 'fridge').x = 5000; }],

  ['слишком крутая лестница', /подъём ступени/,
    h => { lvl(h, 'first').stair.risers = 12; }],

  ['машины впритык', /между машинами/,
    h => { lvl(h, 'first').furniture[1].x = lvl(h, 'first').furniture[0].x + 2000; }],

  ['кровать вплотную к стене', /от кровати/,
    h => { lvl(h, 'second').furniture.find(f => f.sym === 'bed' && f.w === 1800).x = 2600; }],

  ['шахта стояка разъехалась по уровням', /шахта стояка не совпадает/,
    h => { lvl(h, 'second').riser.x += 200; }],

  ['стояк под мебелью', /стоит на шахте стояка/,
    h => { lvl(h, 'cokol').riser.y = 7400; }],

  ['мокрые помещения не друг над другом', /не совпадают по вертикали|не лежит целиком в мокром/,
    h => { room(h, 'second', 'Санузел').x = 1800; }],

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
    h => { room(h, 'first', 'Прихожая').tag = 'hall'; }],

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

  ['помещение разъехалось со стеной', /не принадлежит ни одному помещению/,
    h => { room(h, 'cokol', 'Мастерская').x += 400; }],

  ['помещение залезло на стену', /налезает на стену/,
    h => { room(h, 'first', 'Гараж').h += 250; }],

  ['мебель встала на вентшахту', /стоит на вентшахте/,
    h => { lvl(h, 'cokol').furniture.find(f => f.l === 'стеллаж').y = 6000; }],

  ['вентшахта разъехалась по уровням', /вентшахт\) не совпадает/,
    h => { lvl(h, 'second').ducts[0].x += 300; }],

  ['элемент без идентификатора', /без идентификатора/,
    h => { delete lvl(h, 'first').walls[0].id; }],

  ['идентификатор повторился', /повторяется/,
    h => { lvl(h, 'second').furniture[1].id = lvl(h, 'second').furniture[0].id; }],

  ['проём под потолок не влезает', /не влезает под потолок/,
    h => { lvl(h, 'cokol').openings[0].hz = 2600; }],

  ['окно выше потолка', /выше потолка/,
    h => { lvl(h, 'second').windows[0].sill = 1600; }],

  ['шкаф выше потолка', /не встаёт под потолок/,
    h => { furn(h, 'cokol', 'wardrobe').hz = 2600; }],

  ['жилая комната с щелью вместо окна', /остекление/,
    h => { lvl(h, 'second').windows.forEach(w => { if (!w.kind) w.hz = 300; }); }],
];

// правила разделов: ломается data/systems.json, дом остаётся прежним
const SCASES = [
  ['точка вне помещения', /нет помещения/,
    d => { kind(d, 'eom', 'socket').room = 'first.r9'; }],

  ['розетка съехала за грань', /вылезает за грань/,
    d => { kind(d, 'eom', 'socket').along = 99000; }],

  ['розетка в дверном проёме', /попадает в проём/,
    d => { const p = sys(d, 'eom').points.find(x => x.id === 'eom.p60'); p.side = 'S'; p.along = 950; }],

  ['розетка под потолком', /розетка на отметке/,
    d => { kind(d, 'eom', 'socket').z = 2400; }],

  ['выключатель посреди стены', /выключатель не у проёма/,
    d => { const p = sys(d, 'eom').points.find(x => x.room === 'second.r7' && x.kind === 'switch');
           p.side = 'N'; p.along = 2500; p.z = 900; }],

  ['выключатель на уровне пола', /выключатель на отметке/,
    d => { kind(d, 'eom', 'switch').z = 300; }],

  ['в мокром помещении обычная розетка', /должна быть IP44/,
    d => { kind(d, 'eom', 'socketIP').kind = 'socket'; }],

  ['розетка в зоне брызг', /до «bath»|до «shower»/,
    d => { const p = sys(d, 'eom').points.find(x => x.room === 'second.r4' && x.kind === 'socketIP'); p.side = 'W'; p.along = 400; }],

  ['радиатор не под окном', /радиатор не под окном/,
    d => { kind(d, 'ov', 'radiator').along = 200; }],

  ['радиатор шире окна', /длиннее окна/,
    d => { kind(d, 'ov', 'radiator').len = 4000; }],

  ['радиатор за мебелью', /радиатор перекрыт мебелью/,
    d => { const p = sys(d, 'ov').points.find(x => x.room === 'first.r5' && x.kind === 'radiator');
           p.side = 'N'; p.along = 5600; p.len = 1400; }],

  ['помещение осталось без света', /без светильника/,
    d => { const s = sys(d, 'eom'); s.points = s.points.filter(p => !(p.kind === 'light' && p.room === 'second.r7')); }],

  ['санузел без вытяжки', /без вытяжки/,
    d => { const s = sys(d, 'ov'); s.points = s.points.filter(p => !(p.kind === 'exhaust' && p.room === 'second.r4')); }],

  ['спальня без притока', /без притока/,
    d => { const s = sys(d, 'ov'); s.points = s.points.filter(p => !(p.kind === 'supply' && p.room === 'second.r7')); }],

  ['помещение без извещателя', /без пожарного извещателя/,
    d => { const s = sys(d, 'ss'); s.points = s.points.filter(p => !(p.kind === 'smoke' && p.room === 'first.r1')); }],

  ['прибор без подводки', /без подводки/,
    d => { const s = sys(d, 'vk'); s.points = s.points.filter(p => p.host !== 'second.f11'); }],

  ['стояк системы вне стены', /не попадает ни в стену/,
    d => { sys(d, 'ss').vertical = { x: 1200, y: 3000 }; }],

  ['две точки в одном месте', /стоят ближе/,
    d => { const s = sys(d, 'eom').points.filter(p => p.room === 'second.r7' && p.kind === 'socket');
           s[1].side = s[0].side; s[1].along = s[0].along + 100; s[1].z = s[0].z; }],

  ['точка на подписи помещения', /попадает в подпись/,
    d => { const p = kind(d, 'ss', 'smoke'); const r = house.levels[0].rooms.find(x => x.id === p.room);
           p.x = r.label.x; p.y = r.label.y; }],

  ['идентификатор точки повторился', /повторяется/,
    d => { const s = sys(d, 'eom').points; s[1].id = s[0].id; }]
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

const sbase = checkSystems(house, sysd);
if (sbase.length) {
  console.log('Разделы уже нарушают правила — сначала почини их:\n');
  sbase.forEach((e, i) => console.log(`${String(i + 1).padStart(2)}. ${e}`));
  process.exit(1);
}

for (const [name, expect, mutate] of SCASES) {
  const d = cloneS();
  mutate(d);
  const errs = checkSystems(house, d);
  if (!errs.some(e => expect.test(e))) {
    bad++;
    console.log(`НЕ ПОЙМАНО: ${name}`);
    console.log(`   ждали: ${expect}`);
    console.log(`   получили: ${errs.length ? errs.slice(0, 3).join(' | ') : 'ни одного нарушения'}\n`);
  }
}

const all = CASES.length + SCASES.length;
if (bad) {
  console.log(`Правил, которые не сработали: ${bad} из ${all}.`);
  process.exit(1);
}
console.log(`Все ${all} правил ловят свой дефект: ${CASES.length} по плану, ${SCASES.length} по разделам.`);
