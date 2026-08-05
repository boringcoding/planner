// Выгрузка модели в IFC + структурная проверка того, что выгрузилось.
//
// Проверка здесь не формальность: файл, который «вроде записался», открывается
// в чужой программе как пустая площадка, и понять почему — дороже, чем сразу
// пересчитать ссылки и количества.

import fs from 'node:fs';
import { ifc } from '../src/ifc.mjs';
import { roofGeom, verandaGeom, pitGeom, porchGeom, flueTop, gutterGeom, blindGeom, rampGeom, roofHoles, groundGeom, drainGeom } from '../src/roof.mjs';
import { bill, runSegments3d, feedsGeom } from '../src/systems.mjs';

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
// приямок люка — три бетонные стенки на каждый люк
const pits = pitGeom(house);
const V = verandaGeom(house);
const roofOn = house.roof ? 1 : 0;
// стены: перегородки и несущие из данных, четыре наружных на уровень,
// три стенки приямка, два фронтона и два фризовых пояса
const walls = house.levels.reduce((s, L) => s + L.walls.length, 0) + 4 * house.levels.length
  + 3 * pits.length + roofOn * 4;
const opens = house.levels.reduce((s, L) => s + (L.openings || []).length + (L.windows || []).length, 0);
const furn = house.levels.reduce((s, L) => s + (L.furniture || []).filter(f => f.hz).length, 0);
const points = systems.reduce((s, x) => s + x.points.length, 0);
// дырки в перекрытиях: под лестницу и под каждую шахту; продух в каждом фронтоне
const holes = house.levels.reduce((s, L, i) => s
  + (L.stair && house.levels[i + 1] ? 1 : 0) + (L.riser ? 1 : 0)
  + (L.ducts || []).length + (L.flues || []).filter(f => !f.outside).length
  + (L.atticHatch ? 1 : 0), 0);
const vents = roofOn * 2;
const rholes = roofOn ? roofHoles(house).length : 0;

// перекрытия: над каждым уровнем, плита основания, настил веранды, навес,
// два ската, дно и лоток каждого приямка, площадка каждого крыльца,
// полосы отмостки. Считается по модели, а не по глазу
const porches = porchGeom(house);
const apron = blindGeom(house);
const ramps = rampGeom(house);
const F = house.foundation || {};
const slabs = house.levels.length + 1 + (F.lean ? 1 : 0) + (F.sand ? 1 : 0)
  + (V ? 2 : 0) + roofOn * 2
  + 2 * pits.length + porches.length + apron.length + ramps.length;
const flues = house.levels[house.levels.length - 1].flues || [];

// трассы: сегментный элемент на каждый прогон с геометрией и на каждую
// магистраль, плюс жёлоб и трубы водостока. Класс — по виду точки,
// как в экспорте: воздуховоды, трубы, кабельные каналы
const segCls = kind => kind === 'supply' || kind === 'exhaust' ? 'IFCDUCTSEGMENT'
  : ['cold', 'hot', 'drain', 'radiator', 'convector', 'ufh'].includes(kind) ? 'IFCPIPESEGMENT'
    : 'IFCCABLECARRIERSEGMENT';
const nSeg = { IFCPIPESEGMENT: 0, IFCDUCTSEGMENT: 0, IFCCABLECARRIERSEGMENT: 0 };
const bills = systems.map(sys => ({ sys, b: bill(house, sys) }));
for (const { sys, b } of bills) {
  for (const r of b.runs) if (runSegments3d(r).length) nSeg[segCls(r.points[0].kind)]++;
  for (const t of b.trunks) nSeg[sys.id === 'vk' || sys.id === 'ov' ? 'IFCPIPESEGMENT' : 'IFCCABLECARRIERSEGMENT']++;
}
const gut = roofOn ? gutterGeom(house) : null;
if (gut) nSeg.IFCPIPESEGMENT += gut.gutters.length + gut.drains.length;
// пристенный дренаж и наружные вводы
nSeg.IFCPIPESEGMENT += drainGeom(house).ring.length;
for (const sys of systems)
  for (const f of feedsGeom(house, sys))
    nSeg[f.kind === 'power' ? 'IFCCABLECARRIERSEGMENT' : 'IFCPIPESEGMENT']++;

const want = [
  ['IFCSPACE', rooms], ['IFCWALL', walls], ['IFCOPENINGELEMENT', opens + holes + vents + rholes],
  ['IFCFURNISHINGELEMENT', furn], ['IFCBUILDINGSTOREY', house.levels.length],
  ['IFCSYSTEM', systems.length],
  ['IFCROOF', roofOn], ['IFCSLAB', slabs],
  ['IFCCHIMNEY', roofOn * flues.length],
  ['IFCPILE', V ? V.piles.length : 0], ['IFCCOLUMN', V ? V.posts.length : 0],
  // балки: обвязка веранды, два мауэрлата, затяжка на каждую ферму,
  // два снегозадержателя
  ['IFCBEAM', (V ? 2 : 0) + roofOn * (2 + roofGeom(house).trusses)
    + roofOn * (house.roof.snowGuard ? 2 : 0)],
  ['IFCPLATE', pits.length + house.levels.filter(L => L.atticHatch).length],
  ['IFCSTAIRFLIGHT', porches.length + (V && V.deckSteps.length ? 1 : 0)],
  // ограждения: марши с решением rail и настил веранды
  ['IFCRAILING', house.levels.reduce((s, L, i) => s
    + (L.stair && L.stair.rail && house.levels[i + 1] ? 1 : 0), 0)
    + (V && V.railSegs.length ? 1 : 0)],
  ['IFCGEOGRAPHICELEMENT', groundGeom(house).length],
  ['IFCPIPESEGMENT', nSeg.IFCPIPESEGMENT],
  ['IFCDUCTSEGMENT', nSeg.IFCDUCTSEGMENT],
  ['IFCCABLECARRIERSEGMENT', nSeg.IFCCABLECARRIERSEGMENT]
];
for (const [t, n] of want)
  if (count(t) !== n) errs.push(`${t}: ${count(t)}, в модели ${n}`);

// 4. каждый проём вырезан из стены или из перекрытия, каждое заполнение
// стоит в проёме. Дырки в перекрытиях — под лестницу и шахты, продухи —
// во фронтонах
const voids = count('IFCRELVOIDSELEMENT');
if (voids !== opens + holes + vents + rholes)
  errs.push(`проёмов ${opens} + ${holes} в перекрытиях + ${vents} продухов + ${rholes} проходов кровли, вычитаний ${voids}`);
const fills = count('IFCRELFILLSELEMENT');
const leaves = count('IFCDOOR') + count('IFCWINDOW');
if (fills !== leaves) errs.push(`заполнений ${leaves}, связей с проёмами ${fills}`);

// 4а. У каждого заполнения есть тип (по нему ArchiCAD собирает дверь
// в параметрический объект) и стилизованная геометрия (по ней — цвет).
// Файл без типов и стилей открывается как серые глыбы — уже открывался
const typedIds = new Set();
for (const e of ents.values()) {
  if (e.type !== 'IFCRELDEFINESBYTYPE') continue;
  for (const r of e.args.matchAll(/#(\d+)/g)) typedIds.add(+r[1]);
}
for (const [n, e] of ents)
  if ((e.type === 'IFCDOOR' || e.type === 'IFCWINDOW') && !typedIds.has(n))
    errs.push(`${e.type} #${n} без IfcDoorType/IfcWindowType`);
if (!count('IFCSTYLEDITEM')) errs.push('в файле нет ни одного стиля поверхности — модель приедет серой');
if (![...ents.values()].some(e => e.type === 'IFCSURFACESTYLERENDERING' && /,0\.65,/.test(e.args)))
  errs.push('стекло непрозрачно: нет IfcSurfaceStyleRendering с Transparency 0.65');

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
    ...(L.flues || []).filter(f => !f.outside).map(f => [f, f.id]),
    ...(L.atticHatch ? [[L.atticHatch, L.atticHatch.id]] : [])
  ];
  for (const [r, key] of q) expect.set(key, [r.x + r.w / 2, S.h - (r.y + r.h / 2)]);
}
// проходы шахт сквозь скаты
if (house.roof)
  for (const h of roofHoles(house))
    expect.set(h.id, [h.x + h.w / 2, S.h - (h.y + h.h / 2)]);
// продухи фронтонов: посадка идёт от начала профиля вдоль торца
if (house.roof) {
  const g = roofGeom(house);
  if (g.alongY) {
    expect.set('roof.ventS', [g.span / 2, S.h]);
    expect.set('roof.ventN', [g.span / 2, S.wall]);
  } else {
    expect.set('roof.ventW', [0, g.span / 2]);
    expect.set('roof.ventE', [S.w - S.wall, g.span / 2]);
  }
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
if (checked !== opens + holes + vents + rholes)
  errs.push(`проверено проёмов ${checked} из ${opens + holes + vents + rholes}`);

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
// 8. Скат кровли посажен наклонной осью, и «уклон в свойствах» этого не
// заменит. Отметки конька и карниза считаются вторым путём — разворотом
// посадки обратно в мир — и сверяются с roofGeom. Ошибка в знаке нормали
// кладёт скат зеркально, и на списке сущностей это выглядит правильно
if (house.roof) {
  const g = roofGeom(house);
  const zAxis = ref => {
    let z = 0, axis = [0, 0, 1], cur = ref;
    while (cur && cur !== '$') {
      const p = arg(ent(cur).args), a = arg(ent(p[1]).args);
      z += arg(ent(a[0]).args.slice(1, -1)).map(Number)[2] || 0;
      if (a[1] !== '$') {
        const d = arg(ent(a[1]).args.slice(1, -1)).map(Number);
        if (d.length === 3 && (d[0] || d[1])) axis = d;
      }
      cur = p[0];
    }
    return { z, axis };
  };
  const vec = ref => arg(ent(ref).args.slice(1, -1)).map(Number);
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  // где кровля стоит по плану: X при коньке вдоль Y, отражённый Y при коньке вдоль X
  const o = g.out;
  const ridgePos = g.alongY ? g.ridge.x1 : S.h - g.ridge.y1;
  const eavePos = g.alongY
    ? { 1: o.x, 2: o.x + o.w } : { 1: S.h - o.y, 2: S.h - (o.y + o.h) };
  let slopes = 0;
  for (const e of ents.values()) {
    if (e.type !== 'IFCSLAB') continue;
    const p = arg(e.args), tag = p[7].replace(/'/g, '');
    const m = /^roof\.slope(\d)$/.exec(tag);
    if (!m) continue;
    slopes++;
    const { z, axis } = zAxis(p[5]);
    const pitch = Math.acos(axis[2]) * 180 / Math.PI;
    if (Math.abs(pitch - house.roof.pitch) > 0.01)
      errs.push(`${tag}: посажен под ${pitch.toFixed(1)}°, в модели ${house.roof.pitch}°`);
    // Скат разворачивается из собственных осей: перевёрнутая нормаль даёт
    // ту же отметку в середине и ту же площадь — и кровлю ложбиной вместо конька.
    // Ловится только тем, что верхний край обязан оказаться на коньке
    const ax = arg(ent(arg(ent(p[5]).args)[1]).args);
    const nrm = vec(ax[1]), rf = vec(ax[2]);
    const lx = rf.map((c, i) => c - dot(rf, nrm) * nrm[i]);
    const nl = Math.hypot(...lx);
    const ly = cross(nrm, lx.map(c => c / nl));
    const c0 = world(p[5]), half = g.slopeLen / 2;
    const at = k => ({
      pos: g.alongY ? c0.x + ly[0] * k * half : c0.y + ly[1] * k * half,
      z: z + ly[2] * k * half
    });
    const [hi, lo] = [at(1), at(-1)].sort((a, b) => b.z - a.z);
    for (const [what, got, wantV] of [
      ['конёк', hi.z, g.ridgeZ], ['карниз', lo.z, g.eaveZ]])
      if (Math.abs(got - wantV) > 1) errs.push(`${tag}: ${what} на ${Math.round(got)}, по модели ${wantV}`);
    if (Math.abs(hi.pos - ridgePos) > 1)
      errs.push(`${tag}: верхний край на ${Math.round(hi.pos)}, конёк на ${ridgePos} — скат перевёрнут`);
    if (Math.abs(lo.pos - eavePos[m[1]]) > 1)
      errs.push(`${tag}: карниз на ${Math.round(lo.pos)}, по модели ${eavePos[m[1]]}`);
  }
  if (slopes !== 2) errs.push(`скатов кровли ${slopes}, а двускатная — это два`);

  // труба обязана выйти на расчётную отметку: её считает flueTop, а здесь
  // складывается посадка и высота тела
  for (const e of ents.values()) {
    if (e.type !== 'IFCCHIMNEY') continue;
    const p = arg(e.args), tag = p[7].replace(/'/g, '');
    const { z } = zAxis(p[5]);
    const solid = arg(arg(ent(arg(ent(p[6]).args)[2].slice(1, -1)).args)[3].slice(1, -1))[0];
    const top = z + Number(arg(ent(solid).args)[3]);
    const f = (house.levels[house.levels.length - 1].flues || []).find(x => `${x.id}.over` === tag);
    const wantTop = f && flueTop(house, f);
    if (f && Math.abs(top - wantTop) > 1)
      errs.push(`${tag}: верх на ${Math.round(top)}, по расчёту ${wantTop}`);
  }
}

// 9. Крыльцо ходится ногами так же, как лестница: нижняя ступень обязана лечь
// на землю, а не повиснуть над ней. Тела ступеней разворачиваются обратно
// в отметки — ошибка в знаке подъёма даёт то же число тел и ту же площадь
for (const q of porches) {
  const e = [...ents.values()].find(x => x.type === 'IFCSTAIRFLIGHT'
    && arg(x.args)[7].replace(/'/g, '') === `${q.id}.steps`);
  if (!e) { errs.push(`крыльцо ${q.id}: ступеней в выгрузке нет`); continue; }
  const p = arg(e.args);
  const base = house.levels.find(L => (L.windows || []).some(w => w.id === q.win)).base;
  const tops = bodyItems(p[6]).map(rectOf).map(b => base + b.dx * 0 + b.top).sort((a, b) => b - a);
  // ступени пишутся от низа −150 под землёй: верх i-й = landZ − rise·(i+1)
  const bottom = q.ground - 150;
  const got = tops.map(t => Math.round(bottom + t));
  const want = q.steps.map((_, i) => q.landZ - q.rise * (i + 1));
  for (let i = 0; i < want.length; i++)
    if (Math.abs(got[i] - want[i]) > 1)
      errs.push(`крыльцо ${q.id}: ступень ${i + 1} на ${got[i]}, по расчёту ${want[i]}`);
  // нижняя проступь на один подъём выше земли: последний шаг делается с грунта
  if (got.length && Math.abs(got[got.length - 1] - (q.ground + q.rise)) > 1)
    errs.push(`крыльцо ${q.id}: нижняя ступень на ${got[got.length - 1]}, земля ${q.ground} плюс подъём ${q.rise}`);
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
if (house.roof) {
  const g = roofGeom(house);
  console.log(`  кровля ${g.area.toFixed(1)} м² под ${house.roof.pitch}°, конёк ${(g.ridgeZ / 1000).toFixed(3)} (отметки сверены)`);
}
if (V) console.log(`  веранда: свай ${V.piles.length} · стоек ${V.posts.length} · навес ${V.canopyArea.toFixed(1)} м²`);
if (pits.length) console.log(`  приямков ${pits.length} · стенок ${3 * pits.length} · крышек ${pits.length}`);
