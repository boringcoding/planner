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
  supply: { l: 'приток', mat: 'воздуховод 125', top: 'chain', by: 'level' },
  exhaust: { l: 'вытяжка', mat: 'воздуховод 125', top: 'chain', by: 'level' },
  data: { l: 'RJ45', mat: 'UTP cat.6', top: 'star' },
  tv: { l: 'ТВ', mat: 'RG-6', top: 'star' },
  rack: { l: 'шкаф', mat: 'UTP cat.6', top: 'star' },
  leak: { l: 'датчик протечки', mat: 'КСПВ 2×0,5', top: 'chain', by: 'level' },
  smoke: { l: 'извещатель', mat: 'КСПВ 2×0,5', top: 'chain', by: 'level' }
};

export const RESERVE = 1.12;   // запас на спуски, изгибы и подключение

const runZ = (sys, L) => sys.run === 'ceiling' ? L.clear - 150 : 100;

// координаты точки в плане: либо посажена на грань, либо задана прямо
export function place(house, p) {
  const L = house.levels.find(l => l.id === p.level);
  if (p.x != null) return { x: p.x, y: p.y, level: L, room: L.rooms.find(r => r.id === p.room) };
  const q = point(house, p);
  return q && { x: q.x, y: q.y, level: L, room: q.room, face: q.face };
}

// этажный узел: на уровне источника — сам источник, выше и ниже — стояк
export function node(house, sys, levelId) {
  const L = house.levels.find(l => l.id === levelId);
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

// магистраль от источника до этажного узла
export function trunk(house, sys, levelId) {
  const src = sys.source, srcL = house.levels.find(l => l.id === src.level);
  if (levelId === src.level) return null;
  const L = house.levels.find(l => l.id === levelId);
  const up = seg(srcL, { x: src.x, y: src.y }, sys.vertical);
  const len = up.len + Math.abs(L.base - srcL.base) + Math.abs(src.z - runZ(sys, srcL));
  return { level: L, via: up.via, len: Math.round(len * RESERVE), mat: sys.trunk || 'магистраль' };
}

// шлейф или луч от этажного узла через точки группы
export function groupRun(house, sys, points) {
  const L = house.levels.find(l => l.id === points[0].level);
  const n = node(house, sys, L.id);
  const rz = runZ(sys, L);
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
  return { level: L, points: order.map(x => x.p), via, len: Math.round(len * k * RESERVE) };
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
  return pathOnLevel(at.level, node(house, sys, at.level.id), at);
}

export const byLevel = (sys, id) => sys.points.filter(p => p.level === id);
