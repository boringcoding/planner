// Разделы: точки, трассы, метражи.
//
// Точка — решение проектировщика и лежит в data/systems.json. Трасса — не
// решение, а следствие, и поэтому считается: метраж пересчитывается сам при
// любой правке плана.
//
// Топология взята та, по которой дом и строят, а не «от каждой точки до щита»:
//   магистраль  — от источника до этажного узла (щиток, коллектор, шкаф),
//                 один раз на уровень, по стояку своей системы;
//   группа      — шлейф от узла через свои точки: розетки комнаты, освещение
//                 этажа, извещатели;
//   луч         — отдельная линия от узла к точке там, где шлейф недопустим:
//                 силовая, радиатор, витая пара, подводка воды.
// Звезда от щита к каждой розетке дала бы 1800 м кабеля на дом — столько
// не бывает, и такой метраж хуже отсутствующего.

import { point, pathOnLevel } from './model.mjs';
import { siteMargin, roofGeom } from './roof.mjs';
import { plotGeom, plotLanes } from './plot.mjs';

export const KIND = {
  socket: { l: 'розетка', mat: 'ВВГнг-LS 3×2,5', top: 'chain', by: 'room' },
  socketIP: { l: 'розетка IP44', mat: 'ВВГнг-LS 3×2,5', top: 'chain', by: 'room' },
  power: { l: 'силовая линия', mat: 'ВВГнг-LS 5×4', top: 'star' },
  light: { l: 'светильник', mat: 'ВВГнг-LS 3×1,5', top: 'chain', by: 'level' },
  switch: { l: 'выключатель', mat: 'ВВГнг-LS 3×1,5', top: 'chain', by: 'level' },
  cold: { l: 'холодная вода', mat: 'PEX 20', top: 'star' },
  hot: { l: 'горячая вода', mat: 'PEX 20', top: 'star' },
  drain: { l: 'канализация 50', mat: 'ПП 50', top: 'chain', by: 'level' },
  // унитаз на 50-й трубе не работает — его подводка и стояк только 110
  drain110: { l: 'канализация 110', mat: 'ПП 110', top: 'chain', by: 'level' },
  // стоки цоколя ниже лотка выпуска: самотёком не уходят, качает КНУ
  kns: { l: 'КНУ цокольных стоков', mat: 'ПНД 40, напорная от КНУ', top: 'star' },
  radiator: { l: 'радиатор', mat: 'PEX 16, подача и обратка', top: 'star', k: 2 },
  convector: { l: 'конвектор в полу', mat: 'PEX 16, подача и обратка', top: 'star', k: 2 },
  ufh: { l: 'контур тёплого пола', mat: 'PEX 16, подача и обратка', top: 'star', k: 2 },
  supply: { l: 'приток', mat: 'воздуховод 125', top: 'chain', by: 'level' },
  exhaust: { l: 'вытяжка', mat: 'воздуховод 125', top: 'chain', by: 'level' },
  data: { l: 'RJ45', mat: 'UTP cat.6', top: 'star' },
  tv: { l: 'ТВ', mat: 'RG-6', top: 'star' },
  rack: { l: 'шкаф', mat: 'UTP cat.6', top: 'star' },
  leak: { l: 'датчик протечки', mat: 'КСПВ 2×0,5', top: 'chain', by: 'level' },
  smoke: { l: 'извещатель', mat: 'КСПВ 2×0,5', top: 'chain', by: 'level' }
};

export const RESERVE = 1.12;   // запас на спуски, изгибы и подключение
// шаг укладки контура тёплого пола: метраж трубы — площадь зоны на шаг
export const UFH_STEP = 150;

// вентиляция всегда под потолком: система ОВ разводит отопление по полу,
// но воздуховод на полу — это трасса, которой не может существовать
const AIR = new Set(['supply', 'exhaust']);
const runZ = (sys, L, kind) => (sys.run === 'ceiling' || AIR.has(kind)) ? L.clear - 150 : 100;

// координаты точки в плане: либо посажена на грань, либо задана прямо
export function place(house, p) {
  const L = house.levels.find(l => l.id === p.level);
  if (p.x != null) return { x: p.x, y: p.y, level: L, room: L.rooms.find(r => r.id === p.room) };
  const q = point(house, p);
  return q && { x: q.x, y: q.y, level: L, room: q.room, face: q.face };
}

// этажный узел: на уровне источника — сам источник, выше и ниже — стояк.
// Воздух — исключение: его узел не стояк отопления, а вентшахта уровня
export function node(house, sys, levelId, kind) {
  const L = house.levels.find(l => l.id === levelId);
  if (AIR.has(kind)) {
    const d = (L.ducts || [])[0];
    if (d) return { x: d.x + d.w / 2, y: d.y + d.h / 2, z: runZ(sys, L, kind), level: L };
  }
  if (levelId === sys.source.level) return { x: sys.source.x, y: sys.source.y, z: sys.source.z, level: L, main: true };
  return { x: sys.vertical.x, y: sys.vertical.y, z: runZ(sys, L), level: L };
}

const seg = (L, a, b) => {
  const p = pathOnLevel(L, a, b);
  return p || { len: Math.abs(a.x - b.x) + Math.abs(a.y - b.y), via: [a, b] };
};

export function groupKey(p) {
  const k = KIND[p.kind] || {};
  if (k.top === 'star') return `${p.kind}:${p.id}`;
  return `${p.kind}:${k.by === 'room' ? p.room : p.level}`;
}

// Магистраль — не звезда от источника к каждому этажу: горизонталь от
// источника до стояка идёт один раз и оплачивается ближайшим уровнем,
// дальше стояк наращивается от соседнего уровня. Звезда считала общий
// участок дважды — и в смете, и в теле выгрузки
export function trunk(house, sys, levelId) {
  const src = sys.source, srcL = house.levels.find(l => l.id === src.level);
  if (levelId === src.level) return null;
  const L = house.levels.find(l => l.id === levelId);
  const dir = Math.sign(L.base - srcL.base);
  const prev = house.levels
    .filter(l => l === srcL || (Math.sign(l.base - srcL.base) === dir
      && Math.abs(l.base - srcL.base) < Math.abs(L.base - srcL.base)))
    .sort((a, b) => Math.abs(b.base - srcL.base) - Math.abs(a.base - srcL.base))[0];
  const first = prev === srcL;
  const up = first ? seg(srcL, { x: src.x, y: src.y }, sys.vertical) : null;
  const rz = runZ(sys, srcL);
  // стояк меряется между плоскостями прокладки, а не между отметками пола
  const prevPlane = prev.base + (prev === srcL ? rz : runZ(sys, prev));
  const rise = Math.abs((L.base + runZ(sys, L)) - prevPlane);
  const len = (first ? up.len + Math.abs(src.z - rz) : 0) + rise;
  return {
    level: L, via: up ? up.via : [], len: Math.round(len * RESERVE),
    mat: sys.trunk || 'магистраль',
    srcLevel: srcL, prevLevel: prev, srcZ: src.z, rz, first, prevPlane
  };
}

// шлейф или луч от этажного узла через точки группы
export function groupRun(house, sys, points) {
  const L = house.levels.find(l => l.id === points[0].level);
  const n = node(house, sys, L.id, points[0].kind);
  const rz = runZ(sys, L, points[0].kind);
  const rest = points.map(p => ({ p, at: place(house, p) })).filter(x => x.at);
  if (!rest.length) return { level: L, points, via: [], len: 0 };   // сажать некуда — это ловит правило
  const order = [];
  let cur = n;
  while (rest.length) {                       // ближайший следующий — шлейф не петляет
    let bi = 0, bd = Infinity;
    rest.forEach((x, i) => {
      const d = Math.abs(x.at.x - cur.x) + Math.abs(x.at.y - cur.y);
      if (d < bd) { bd = d; bi = i; }
    });
    const [next] = rest.splice(bi, 1);
    order.push(next);
    cur = next.at;
  }
  const via = [];
  let len = 0, from = n;
  for (const x of order) {
    const s = seg(L, from, x.at);
    via.push(s.via);
    len += s.len + Math.abs(x.p.z - rz);
    from = x.at;
  }
  len += Math.abs(n.z - rz);
  const k = (KIND[order[0].p.kind] || {}).k || 1;
  return { level: L, points: order.map(x => x.p), via, len: Math.round(len * k * RESERVE), rz, node: n };
}

// ---- трассы в 3D ----------------------------------------------------------
// Осевые отрезки прогона: те же via, что дали метраж, поднятые на высоту
// прокладки, плюс вертикали — от узла к плоскости прокладки и от неё
// к каждой точке. Никакой второй прокладки «для картинки» здесь нет:
// разойтись с метражом эти отрезки не могут, и правило это сторожит.
// Отметки z — в координатах уровня.
export function runSegments3d(run) {
  const segs = [];
  if (!run.via.length) return segs;
  const rz = run.rz;
  if (run.node.z !== rz)
    segs.push({ v: true, x: run.node.x, y: run.node.y, z0: Math.min(run.node.z, rz), z1: Math.max(run.node.z, rz) });
  run.via.forEach((poly, i) => {
    for (let k = 1; k < poly.length; k++)
      if (poly[k].x !== poly[k - 1].x || poly[k].y !== poly[k - 1].y)
        segs.push({ a: poly[k - 1], b: poly[k], z: rz });
    const p = run.points[i], end = poly[poly.length - 1];
    if (p.z !== rz)
      segs.push({ v: true, x: end.x, y: end.y, z0: Math.min(p.z, rz), z1: Math.max(p.z, rz) });
  });
  return segs;
}

// магистраль в координатах своего уровня: горизонталь источника — только
// у первой от источника, стояк — от плоскости соседнего уровня
export function trunkSegments3d(house, sys, t) {
  const segs = [], base = t.level.base;
  if (t.first) {
    const zRun = t.srcLevel.base + t.rz - base;
    if (t.srcZ !== t.rz) {
      const a = t.srcLevel.base + t.srcZ - base;
      segs.push({ v: true, x: sys.source.x, y: sys.source.y, z0: Math.min(a, zRun), z1: Math.max(a, zRun) });
    }
    for (let k = 1; k < t.via.length; k++)
      if (t.via[k].x !== t.via[k - 1].x || t.via[k].y !== t.via[k - 1].y)
        segs.push({ a: t.via[k - 1], b: t.via[k], z: zRun });
  }
  const z0 = t.prevPlane - base, z1 = runZ(sys, t.level);
  segs.push({
    v: true, x: sys.vertical.x, y: sys.vertical.y,
    z0: Math.min(z0, z1), z1: Math.max(z0, z1)
  });
  return segs;
}

// длина осевых отрезков прогона — для правила «3D сходится с метражом»
export const segsLen = segs => segs.reduce((s, x) =>
  s + (x.v ? x.z1 - x.z0 : Math.abs(x.b.x - x.a.x) + Math.abs(x.b.y - x.a.y)), 0);

// Наружные сети: вводы, выпуски и сброс — трассы по участку. Решение
// (точка входа в здание, глубина, уклон, назначение) лежит в данных
// системы, маршрут считается по коридорам участка: самотёк — к септику,
// напор — в кювет, вода и кабель времянки — вдоль юго-восточной границы.
// Каждая трасса — полилиния точек с отметками; самотёчная набирает
// глубину по накопленной длине, и вход в септик получается сам
export function feedsGeom(house, sys) {
  const S = house.shell;
  const g = plotGeom(house), lanes = plotLanes(house);
  const wallPt = (side, at) => side === 'S' ? { x: at, y: 0 } : side === 'N' ? { x: at, y: S.h }
    : side === 'W' ? { x: 0, y: at } : { x: S.w, y: at };
  const out = [];
  for (const f of sys.feeds || []) {
    // без участка — прямой отрезок до отступа, как жил дом до генплана
    if (!g) {
      const m = siteMargin(house);
      const z0 = -f.depth, z1 = z0 - (f.slope ? Math.round(m * f.slope / 100) : 0);
      const p0 = wallPt(f.side, f.at);
      const p1 = f.side === 'S' ? { x: f.at, y: -m } : f.side === 'N' ? { x: f.at, y: S.h + m }
        : f.side === 'W' ? { x: -m, y: f.at } : { x: S.w + m, y: f.at };
      out.push({ ...f, pts: [{ ...p0, z: z0 }, { ...p1, z: z1 }], wells: [], len: Math.round(Math.hypot(m, z0 - z1)) });
      continue;
    }
    const T = g.temp, Q = g.septic, lot = g.lot;
    // точка на стене времянки
    const tempPt = (side, at) => side === 'S' ? { x: at, y: T.y } : side === 'N' ? { x: at, y: T.y + T.h }
      : side === 'W' ? { x: T.x, y: at } : { x: T.x + T.w, y: at };
    let xy = [], wells = [];
    if (f.target === 'temp' && f.enter && T) {
      // от узла у красной линии — фронтальной горизонталью, потом боковой
      // полосой (с той стороны, где стоит времянка) и в её стену. Вода
      // ответвляется тройником от магистрали в точке ввода дома
      const main = (sys.feeds || []).find(q => q.kind === f.kind && !q.target && !q.from);
      const x0 = main ? main.at : f.enter.at;
      const [laneX, laneY] = f.kind === 'water' ? [lanes.waterX, lanes.waterY] : [lanes.powerX, lanes.powerY];
      const end = tempPt(f.enter.side, f.enter.at);
      // вода — просто труба: ответвление тройником в грунте, без колодца
      const start = f.kind === 'water' && lanes.tapX != null
        ? { x: x0, y: laneY }                         // тройник на магистрали от угла
        : { x: x0, y: lot.y0 };
      xy = [start, { x: x0, y: laneY }, { x: laneX, y: laneY }, { x: laneX, y: end.y }, end];
    } else if (f.from === 'septic' && Q) {
      // напорный сброс очищенной воды: от станции к кювету улицы
      xy = [{ x: lanes.relX, y: Q.y }, { x: lanes.relX, y: lot.y0 }];
    } else if (f.to === 'septic' && Q) {
      // септик стоит у уличного забора — его обслуживают с улицы, не загоняя
      // машину. Самотёк собирается в коридоре, у станции перед домом линия
      // соединения проходит севернее её корпуса и входит с северного торца
      const front = Q.y + Q.h <= 0;
      const inY = front ? Q.y + Q.h + 1000 : Q.y + Q.h / 2;
      if (f.exit && T) {
        // выпуск времянки: к коридору самотёка и на юг, в общий колодец
        const p0 = tempPt(f.exit.side, f.exit.at);
        xy = f.exit.side === 'E' || f.exit.side === 'W'
          ? [p0, { x: lanes.sewerX, y: p0.y }, { x: lanes.sewerX, y: inY }]
          : [p0, { x: p0.x, y: inY }, { x: lanes.sewerX, y: inY }];
        wells = [f.exit.side === 'E' || f.exit.side === 'W'
          ? { id: `${f.id}.w1`, x: lanes.sewerX, y: p0.y, d: 425 }
          : { id: `${f.id}.w1`, x: p0.x, y: inY, d: 425 }];
      } else {
        const p0 = wallPt(f.side, f.at);
        const inX = Q.x + 300;
        xy = front
          ? [p0, { x: lanes.sewerX, y: p0.y }, { x: lanes.sewerX, y: inY },
          { x: inX, y: inY }, { x: inX, y: Q.y + Q.h }]
          : [p0, { x: lanes.sewerX, y: p0.y }, { x: lanes.sewerX, y: inY }, { x: Q.x, y: inY }];
        // колодцы на поворотах самотёка; второй — общий с веткой времянки
        wells = [{ id: `${f.id}.w1`, x: lanes.sewerX, y: p0.y, d: 425 },
        { id: `${f.id}.w2`, x: lanes.sewerX, y: inY, d: 425 }];
      }
    } else {
      const p0 = wallPt(f.side, f.at);
      if (f.kind === 'water' && lanes.tapX != null && f.side === 'S') {
        // уличная магистраль подходит к углу ЮЗ-ЮВ: труба входит на участок
        // у угла и идёт фронтальной полосой до точки ввода — колодец не наш,
        // врезка остаётся на улице
        xy = [p0, { x: f.at, y: lanes.waterY }, { x: lanes.tapX, y: lanes.waterY }, { x: lanes.tapX, y: lot.y0 }];
      } else {
        // прямой ввод от красной линии
        const p1 = f.side === 'S' ? { x: f.at, y: lot.y0 } : f.side === 'N' ? { x: f.at, y: lot.y1 }
          : f.side === 'W' ? { x: lot.x0, y: f.at } : { x: lot.x1, y: f.at };
        xy = [p0, p1];
      }
    }
    xy = xy.filter((p, i) => !i || p.x !== xy[i - 1].x || p.y !== xy[i - 1].y);
    // отметки: напор и вода идут на одной глубине, самотёк набирает уклон
    let run = 0;
    const pts = xy.map((p, i) => {
      if (i) run += Math.hypot(p.x - xy[i - 1].x, p.y - xy[i - 1].y);
      const z = -f.depth - (f.slope && !f.pressure ? Math.round(run * f.slope / 100) : 0);
      return { ...p, z };
    });
    const len = pts.reduce((s, p, i) => i ? s + Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y, p.z - pts[i - 1].z) : 0, 0);
    out.push({ ...f, pts, wells, len: Math.round(len) });
  }
  // Футляр на водопроводе там, где он проходит под канализацией: вода ниже
  // промерзания, самотёк мельче, и в каждом пересечении вода оказывается
  // под трубой стоков — норма в таком узле требует защитной трубы 5 + 5 м
  const sewers = out.filter(f => f.kind === 'sewer');
  for (const f of out.filter(x => x.kind === 'water')) {
    f.casings = [];
    for (let i = 1; i < f.pts.length; i++) {
      const a = f.pts[i - 1], b = f.pts[i];
      for (const s of sewers)
        for (let j = 1; j < s.pts.length; j++) {
          const c = s.pts[j - 1], d = s.pts[j];
          const cross = crossAt(a, b, c, d);
          if (cross && cross.z1 < cross.z2)
            f.casings.push({ x: cross.x, y: cross.y, len: 10000, dir: a.y === b.y ? 'h' : 'v' });
        }
      // боковые полосы уже пяти метров, и вода вдоль дома идёт ближе трёх
      // к фундаменту — стеснённые условия: весь участок сближения в футляре
      if (a.x === b.x) {
        const gap = a.x < 0 ? -a.x : a.x > S.w ? a.x - S.w : 0;
        const y0 = Math.max(Math.min(a.y, b.y), 0), y1 = Math.min(Math.max(a.y, b.y), S.h);
        if (gap && gap < 3000 && y1 - y0 > 500)
          f.casings.push({ x: a.x, y: (y0 + y1) / 2, len: y1 - y0 + 2000, dir: 'v' });
      }
    }
    f.casingLen = f.casings.reduce((s, c) => s + c.len, 0);
  }
  return out;
}

// пересечение двух осевых отрезков в плане: один горизонтален, другой
// вертикален; z обеих труб в точке пересечения — по линейной интерполяции
function crossAt(a, b, c, d) {
  const h1 = a.y === b.y, h2 = c.y === d.y;
  if (h1 === h2) return null;
  const [ha, hb, va, vb] = h1 ? [a, b, c, d] : [c, d, a, b];
  const x = va.x, y = ha.y;
  if (x <= Math.min(ha.x, hb.x) || x >= Math.max(ha.x, hb.x)) return null;
  if (y <= Math.min(va.y, vb.y) || y >= Math.max(va.y, vb.y)) return null;
  const zh = ha.z + (hb.z - ha.z) * Math.abs(x - ha.x) / Math.abs(hb.x - ha.x);
  const zv = va.z + (vb.z - va.z) * Math.abs(y - va.y) / Math.abs(vb.y - va.y);
  return { x, y, z1: h1 ? zh : zv, z2: h1 ? zv : zh };
}

// ведомость: сколько чего и сколько метров какого материала
export function bill(house, sys) {
  const groups = new Map();
  for (const p of sys.points) {
    const g = groupKey(p);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(p);
  }
  const runs = [...groups].map(([key, pts]) => ({ key, ...groupRun(house, sys, pts) }));
  const trunks = house.levels.map(L => trunk(house, sys, L.id)).filter(Boolean);

  const mat = new Map(), dev = new Map();
  const addM = (m, v) => mat.set(m, (mat.get(m) || 0) + v);
  for (const t of trunks) addM(t.mat, t.len);
  for (const r of runs) addM((KIND[r.points[0].kind] || {}).mat || '—', r.len);
  // сам контур — труба по зоне укладки: площадь на шаг, без запаса —
  // запас уже сидит в шаге; подводка посчитана прогоном выше
  for (const p of sys.points)
    if (p.kind === 'ufh') addM('PEX 16, контур тёплого пола', Math.round(p.w * p.h / UFH_STEP));
  // канализационный стояк 110 — вертикаль на три уровня плюс фановый выход
  // над кровлей: трубы, которой не было ни в ведомости, ни в смете
  if (sys.id === 'vk' && house.levels.some(L => L.riser)) {
    const top = house.levels[house.levels.length - 1];
    const q = top.riser;
    const up = q && house.roof
      ? Math.round(roofGeom(house).zAt(q.x + q.w / 2, q.y + q.h / 2)) + 300
      : top.base + top.clear;
    addM('ПП 110, стояк и фановый выход', up - house.levels[0].base);
  }
  // наружные вводы и выпуски — прямые участки, без запаса на изгибы;
  // футляры на пересечениях с канализацией — отдельной строкой
  for (const f of feedsGeom(house, sys)) {
    addM(f.mat, f.len);
    if (f.casingLen) addM('футляр ПНД 110 на пересечениях', f.casingLen);
  }
  for (const p of sys.points) dev.set(p.kind, (dev.get(p.kind) || 0) + 1);

  return {
    runs, trunks,
    devices: [...dev].map(([kind, n]) => ({ kind, n, ...(KIND[kind] || {}) })).sort((a, b) => b.n - a.n),
    materials: [...mat].map(([m, mm]) => ({ mat: m, m: mm / 1000 })).sort((a, b) => b.m - a.m),
    total: [...mat.values()].reduce((s, v) => s + v, 0) / 1000
  };
}

// есть ли путь от этажного узла до точки — трасса, а не длина
export function reach(house, sys, p) {
  const at = place(house, p);
  if (!at) return null;
  return pathOnLevel(at.level, node(house, sys, at.level.id, p.kind), at);
}

export const byLevel = (sys, id) => sys.points.filter(p => p.level === id);
