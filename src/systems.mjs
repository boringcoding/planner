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
import { siteMargin } from './roof.mjs';

export const KIND = {
  socket: { l: 'розетка', mat: 'ВВГнг-LS 3×2,5', top: 'chain', by: 'room' },
  socketIP: { l: 'розетка IP44', mat: 'ВВГнг-LS 3×2,5', top: 'chain', by: 'room' },
  power: { l: 'силовая линия', mat: 'ВВГнг-LS 5×4', top: 'star' },
  light: { l: 'светильник', mat: 'ВВГнг-LS 3×1,5', top: 'chain', by: 'level' },
  switch: { l: 'выключатель', mat: 'ВВГнг-LS 3×1,5', top: 'chain', by: 'level' },
  cold: { l: 'холодная вода', mat: 'PEX 20', top: 'star' },
  hot: { l: 'горячая вода', mat: 'PEX 20', top: 'star' },
  drain: { l: 'канализация', mat: 'ПП 50', top: 'chain', by: 'level' },
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

// Наружные сети: ввод и выпуск — от границы площадки до стены дома.
// Решение (сторона, место, глубина, уклон) лежит в данных системы,
// длина считается от того же отступа, что и грунт площадки
export function feedsGeom(house, sys) {
  const S = house.shell, m = siteMargin(house);
  return (sys.feeds || []).map(f => {
    const z0 = -f.depth;                                    // у стены дома
    const z1 = -f.depth - (f.slope ? Math.round(m * f.slope / 100) : 0);   // у границы
    const [a, b] = f.side === 'S' ? [{ x: f.at, y: 0, z: z0 }, { x: f.at, y: -m, z: z1 }]
      : f.side === 'N' ? [{ x: f.at, y: S.h, z: z0 }, { x: f.at, y: S.h + m, z: z1 }]
        : f.side === 'W' ? [{ x: 0, y: f.at, z: z0 }, { x: -m, y: f.at, z: z1 }]
          : [{ x: S.w, y: f.at, z: z0 }, { x: S.w + m, y: f.at, z: z1 }];
    return { ...f, a, b, len: Math.round(Math.hypot(m, z0 - z1)) };
  });
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
  // наружные вводы и выпуски — прямые участки, без запаса на изгибы
  for (const f of feedsGeom(house, sys)) addM(f.mat, f.len);
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
