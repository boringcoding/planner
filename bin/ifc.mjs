// Выгрузка модели в IFC + структурная проверка того, что выгрузилось.
//
// Проверка здесь не формальность: файл, который «вроде записался», открывается
// в чужой программе как пустая площадка, и понять почему — дороже, чем сразу
// пересчитать ссылки и количества.

import fs from 'node:fs';
import { ifc } from '../src/ifc.mjs';

const read = n => JSON.parse(fs.readFileSync(new URL(`../data/${n}`, import.meta.url)));
const house = read('house.json');
const systems = read('systems.json').systems;

const text = ifc(house, systems, { name: 'house.ifc' });
fs.mkdirSync('out', { recursive: true });
fs.writeFileSync('out/house.ifc', text);

// ---- разбор собственного файла ------------------------------------------
// Разбирается именно записанный текст, а не то, из чего он собран: иначе
// проверка повторит ошибку экспорта и подтвердит её.
const body = text.slice(text.indexOf('DATA;') + 5, text.lastIndexOf('ENDSEC;'));
const ents = new Map();
for (const m of body.matchAll(/#(\d+)=([A-Z0-9]+)\((.*)\);/g))
  ents.set(+m[1], { type: m[2], args: m[3] });

const errs = [];
const count = t => [...ents.values()].filter(e => e.type === t).length;

// 1. все ссылки разрешаются
for (const [id, e] of ents)
  for (const r of e.args.matchAll(/#(\d+)/g))
    if (!ents.has(+r[1])) errs.push(`#${id} (${e.type}) ссылается на несуществующий #${r[1]}`);

// 2. идентификаторы уникальны
const guids = [...ents.values()].filter(e => /^IFC/.test(e.type))
  .map(e => (e.args.match(/^'([0-9A-Za-z_$]{22})'/) || [])[1]).filter(Boolean);
if (new Set(guids).size !== guids.length) errs.push('GlobalId повторяется');

// 3. количества совпадают с моделью
const rooms = house.levels.reduce((s, L) => s + L.rooms.length, 0);
const walls = house.levels.reduce((s, L) => s + L.walls.length, 0) + 4 * house.levels.length;
const opens = house.levels.reduce((s, L) => s + (L.openings || []).length + (L.windows || []).length, 0);
const furn = house.levels.reduce((s, L) => s + (L.furniture || []).filter(f => f.hz).length, 0);
const points = systems.reduce((s, x) => s + x.points.length, 0);
// дырки в перекрытиях: под лестницу и под каждую шахту
const holes = house.levels.reduce((s, L, i) => s
  + (L.stair && house.levels[i + 1] ? 1 : 0) + (L.riser ? 1 : 0)
  + (L.ducts || []).length + (L.flues || []).filter(f => !f.outside).length, 0);

const want = [
  ['IFCSPACE', rooms], ['IFCWALL', walls], ['IFCOPENINGELEMENT', opens + holes],
  ['IFCFURNISHINGELEMENT', furn], ['IFCBUILDINGSTOREY', house.levels.length],
  ['IFCSYSTEM', systems.length]
];
for (const [t, n] of want)
  if (count(t) !== n) errs.push(`${t}: ${count(t)}, в модели ${n}`);

// 4. каждый проём вырезан из стены или из перекрытия, каждое заполнение
// стоит в проёме. Дырки в перекрытиях — под лестницу и шахты
const voids = count('IFCRELVOIDSELEMENT');
if (voids !== opens + holes) errs.push(`проёмов ${opens} + ${holes} в перекрытиях, вычитаний ${voids}`);
const fills = count('IFCRELFILLSELEMENT');
const leaves = count('IFCDOOR') + count('IFCWINDOW');
if (fills !== leaves) errs.push(`заполнений ${leaves}, связей с проёмами ${fills}`);

// 5. точки разделов на месте
const mep = ['IFCOUTLET', 'IFCLAMP', 'IFCSWITCHINGDEVICE', 'IFCVALVE', 'IFCWASTETERMINAL',
  'IFCSPACEHEATER', 'IFCAIRTERMINAL', 'IFCCOMMUNICATIONSAPPLIANCE', 'IFCSENSOR']
  .reduce((s, t) => s + count(t), 0);
if (mep !== points) errs.push(`точек разделов ${points}, элементов инженерии ${mep}`);

// 6. Проём стоит там, где ему положено по плану. Место проёма считается
// дважды и разными путями: экспорт кладёт его в осях стены, проверка
// разворачивает цепочку IfcLocalPlacement обратно в мир и сверяет с планом.
// Так нашлись семь зеркальных проёмов восточной стены — включая входную
// дверь, уехавшую на три метра
const arg = s => {
  const out = []; let d = 0, cur = '';
  for (const ch of s) {
    if (ch === '(') d++;
    if (ch === ')') d--;
    if (ch === ',' && d === 0) { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out;
};
const ent = ref => ents.get(+ref.slice(1));
const axis2 = ref => {
  const p = arg(ent(ref).args);
  const [x, y] = arg(ent(p[0]).args.slice(1, -1)).map(Number);
  let a = 0;
  if (p[2] !== '$') { const d = arg(ent(p[2]).args.slice(1, -1)).map(Number); a = Math.atan2(d[1], d[0]); }
  return { x, y, a };
};
const world = ref => {
  if (ref === '$') return { x: 0, y: 0, a: 0 };
  const p = arg(ent(ref).args);
  const up = world(p[0]), me = axis2(p[1]);
  const c = Math.cos(up.a), si = Math.sin(up.a);
  return { x: up.x + c * me.x - si * me.y, y: up.y + si * me.x + c * me.y, a: up.a + me.a };
};

const S = house.shell;
const expect = new Map();
for (const L of house.levels) {
  for (const o of L.openings || []) {
    const r = o.dir === 'h' ? [o.x, o.y, o.w, o.t] : [o.x, o.y, o.t, o.w];
    expect.set(o.id, [r[0] + r[2] / 2, S.h - (r[1] + r[3] / 2)]);
  }
  for (const w of L.windows || []) {
    const c = (w.a + w.b) / 2, t = S.wall;
    expect.set(w.id, [w.side === 'W' ? t / 2 : w.side === 'E' ? S.w - t / 2 : c,
    w.side === 'S' ? S.h - t / 2 : w.side === 'N' ? t / 2 : S.h - c]);
  }
}
// дырки в перекрытиях ждём там же, где шахта или лестница
for (const L of house.levels) {
  const q = [
    ...(L.stair && house.levels[house.levels.indexOf(L) + 1] ? [[L.stair, `${L.id}.stair`]] : []),
    ...(L.riser ? [[L.riser, L.riser.id]] : []),
    ...(L.ducts || []).map(d => [d, d.id]),
    ...(L.flues || []).filter(f => !f.outside).map(f => [f, f.id])
  ];
  for (const [r, key] of q) expect.set(key, [r.x + r.w / 2, S.h - (r.y + r.h / 2)]);
}
let checked = 0;
for (const [n, e] of ents) {
  if (e.type !== 'IFCOPENINGELEMENT') continue;
  const id = arg(e.args)[7].replace(/'/g, ''), want = expect.get(id);
  if (!want) { errs.push(`проём #${n} не опознан по идентификатору`); continue; }
  const w = world(arg(e.args)[5]);
  checked++;
  const d = Math.hypot(w.x - want[0], w.y - want[1]);
  if (d > 1) errs.push(`проём ${id} стоит в ${Math.round(w.x)},${Math.round(w.y)}, по плану ${want[0]},${want[1]} — мимо на ${Math.round(d)} мм`);
}
if (checked !== opens + holes) errs.push(`проверено проёмов ${checked} из ${opens + holes}`);

// 7. Лестница ходится ногами. Ступени пишутся телами в одном представлении,
// и разъехавшийся марш выглядит на списке сущностей ровно так же, как
// правильный: тел столько же, объём похожий. Поэтому проверяются свойства
// ходьбы — каждая ступень внутри шахты, высота растёт равномерно, и со
// ступени на следующую можно шагнуть, а не перепрыгнуть через всю шахту
const rectOf = ref => {
  const p = arg(ent(ref).args);                       // IFCEXTRUDEDAREASOLID
  const prof = arg(ent(p[0]).args);                   // IFCRECTANGLEPROFILEDEF
  const pos = arg(ent(prof[2]).args);                 // IFCAXIS2PLACEMENT2D
  const [dx, dy] = arg(ent(pos[0]).args.slice(1, -1)).map(Number);
  return { dx, dy, w: Number(prof[3]), h: Number(prof[4]), top: Number(p[3]) };
};
const bodyItems = ref => {
  const reps = arg(ent(ref).args)[2].slice(1, -1).split(',');
  for (const r of reps) {
    const a = arg(ent(r).args);
    if (a[1].includes('Body')) return a[3].slice(1, -1).split(',');
  }
  return [];
};

for (const [n, e] of ents) {
  if (e.type !== 'IFCSTAIR') continue;
  const p = arg(e.args), id = p[7].replace(/'/g, '');
  const lv = house.levels.find(L => `${L.id}.stair` === id);
  if (!lv) { errs.push(`лестница ${id}: не нашёл уровень`); continue; }
  const st = lv.stair, at = world(p[5]);
  const next = house.levels[house.levels.indexOf(lv) + 1];
  const rise = (next.base - lv.base) / st.risers;
  const boxes = bodyItems(p[6]).map(rectOf)
    .map(b => ({ ...b, x: at.x + b.dx - b.w / 2, y: at.y + b.dy - b.h / 2 }));
  const steps = boxes.filter(b => b.w <= st.tread + 1);
  const land = boxes.find(b => b.w > st.tread + 1);

  if (steps.length !== st.risers - 2) errs.push(`лестница ${id}: ступеней ${steps.length}, при ${st.risers} подъёмах ждём ${st.risers - 2}`);
  if (!land) errs.push(`лестница ${id}: нет промежуточной площадки`);

  const shaft = { x: st.x, y: S.h - (st.y + st.h), w: st.w, h: st.h };
  for (const b of boxes)
    if (b.x < shaft.x - 1 || b.y < shaft.y - 1
      || b.x + b.w > shaft.x + shaft.w + 1 || b.y + b.h > shaft.y + shaft.h + 1)
      errs.push(`лестница ${id}: ступень ${Math.round(b.x)},${Math.round(b.y)} вылезает из шахты`);

  // Внутри марша: та же нитка, шаг ровно в проступь, подъём ровно один.
  // На повороте: марш меняется, а подъём двойной — потому что подъём
  // на промежуточную площадку ступенью не считается. Всё прочее — не лестница
  const rows = [...new Set(steps.map(b => Math.round(b.y)))];
  if (rows.length !== 2) errs.push(`лестница ${id}: ниток ${rows.length}, а поворотная лестница — это две`);
  let turns = 0;
  for (let i = 1; i < steps.length; i++) {
    const a = steps[i - 1], b = steps[i];
    const dTop = b.top - a.top;
    const dx = Math.abs((a.x + a.w / 2) - (b.x + b.w / 2));
    const dy = Math.abs((a.y + a.h / 2) - (b.y + b.h / 2));
    if (dx < 1 && dy > 1 && Math.abs(dTop - 2 * rise) < 1) { turns++; continue; }
    if (dy > 1 || Math.abs(dx - st.tread) > 1 || Math.abs(dTop - rise) > 1)
      errs.push(`лестница ${id}: со ступени ${i} на ${i + 1} шаг ${Math.round(dx)} × ${Math.round(dy)} мм при подъёме ${Math.round(dTop)} — так не ходят`);
  }
  if (turns !== 1) errs.push(`лестница ${id}: поворотов ${turns}, а марша два`);
}
const kb = (text.length / 1024).toFixed(0);
if (errs.length) {
  console.log(`Файл записан, но не сходится (${errs.length}):\n`);
  errs.forEach((e, i) => console.log(`${String(i + 1).padStart(2)}. ${e}`));
  process.exit(1);
}
console.log(`out/house.ifc · ${ents.size} записей · ${kb} КБ`);
console.log(`  помещений ${rooms} · стен ${walls} · проёмов ${opens} + ${holes} в перекрытиях (место сверено)`);
console.log(`  мебели ${furn} · инженерии ${points}`);
