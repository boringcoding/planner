// Грани помещений — то, на что садится всё остальное.
//
// Развёртке по электрике, воде или вентиляции нужна не «стена» вообще,
// а внутренняя поверхность стены конкретного помещения: розетка живёт
// на грани, а не в прямоугольнике. Помещения прямоугольные, поэтому
// грань выводится из помещения, и отдельная модель стен-отрезков не нужна:
// стены остаются тем, чем были, — тем, что рисуется на плане.
//
// Отсчёт `along` устроен так, чтобы юг → восток → север → запад
// разворачивались в одну непрерывную ленту: конец одной грани совпадает
// с началом следующей. Развёртка помещения — это лента, а не четыре картинки.

export const SIDES = ['S', 'E', 'N', 'W'];
export const SIDE_NAME = { S: 'юго-запад', E: 'юго-восток', N: 'северо-восток', W: 'северо-запад' };

const near = (a, b, d = 60) => Math.abs(a - b) <= d;

export function face(room, side) {
  const { x, y, w, h } = room;
  if (side === 'S') return { side, room, len: w, axis: 'x', pos: y, sign: 1, out: -1, at: a => ({ x: x + a, y }), of: p => p.x - x };
  if (side === 'N') return { side, room, len: w, axis: 'x', pos: y + h, sign: -1, out: 1, at: a => ({ x: x + w - a, y: y + h }), of: p => x + w - p.x };
  if (side === 'E') return { side, room, len: h, axis: 'y', pos: x + w, sign: 1, out: 1, at: a => ({ x: x + w, y: y + a }), of: p => p.y - y };
  return { side, room, len: h, axis: 'y', pos: x, sign: -1, out: -1, at: a => ({ x, y: y + h - a }), of: p => y + h - p.y };
}

export const faces = room => SIDES.map(s => face(room, s));
export const perimeter = room => 2 * (room.w + room.h);

// точка, посаженная на грань: {room, side, along} -> координаты плана
export function point(house, host) {
  const L = house.levels.find(l => l.id === host.level);
  const room = L && L.rooms.find(r => r.id === host.room);
  if (!room) return null;
  const f = face(room, host.side);
  const p = f.at(Math.max(0, Math.min(f.len, host.along)));
  return { ...p, room, face: f, level: L };
}

// Прижат ли прямоугольник к грани. Мебель стоит внутри помещения и касается
// грани ближним ребром, проём и окно лежат в толще стены и касаются дальним —
// поэтому достаточно, чтобы к грани подошло любое из двух
export function atFace(f, r, gap = 80) {
  const [n1, n2] = f.axis === 'x' ? [r.y, r.y + r.h] : [r.x, r.x + r.w];
  return near(n1, f.pos, gap) || near(n2, f.pos, gap);
}

// отрезок грани, занятый прямоугольником, — если он к этой грани прижат
export function spanOn(f, r, gap = 80) {
  if (!atFace(f, r, gap)) return null;
  const [lo, hi] = f.axis === 'x' ? [r.x, r.x + r.w] : [r.y, r.y + r.h];
  const a = f.of(f.axis === 'x' ? { x: lo } : { y: lo }), b = f.of(f.axis === 'x' ? { x: hi } : { y: hi });
  const s = Math.max(0, Math.min(a, b)), e = Math.min(f.len, Math.max(a, b));
  return e - s > 100 ? { a: s, b: e } : null;
}

// прямоугольник элемента в плане
const openRect = o => o.dir === 'h' ? { x: o.x, y: o.y, w: o.w, h: o.t } : { x: o.x, y: o.y, w: o.t, h: o.w };
const furnRect = f => f.t === 'c'
  ? { x: f.x - f.r, y: f.y - f.r, w: 2 * f.r, h: 2 * f.r }
  : { x: f.x, y: f.y, w: f.w, h: f.h };

function winRect(win, S) {
  const t = S.wall;
  if (win.side === 'S') return { x: win.a, y: 0, w: win.b - win.a, h: t };
  if (win.side === 'N') return { x: win.a, y: S.h - t, w: win.b - win.a, h: t };
  if (win.side === 'W') return { x: 0, y: win.a, w: t, h: win.b - win.a };
  return { x: S.w - t, y: win.a, w: t, h: win.b - win.a };
}

// всё, что видно на грани изнутри помещения
export function faceItems(house, L, room, side) {
  const f = face(room, side), S = house.shell, out = [];
  for (const o of L.openings || []) {
    const s = spanOn(f, openRect(o));
    if (s) out.push({ kind: o.kind === 'pass' ? 'pass' : 'door', id: o.id, ...s, z0: 0, z1: o.hz });
  }
  for (const w of L.windows || []) {
    if (w.side !== side) continue;
    const s = spanOn(f, winRect(w, S));
    if (!s) continue;
    const kind = w.kind === 'gate' ? 'gate' : w.kind === 'entrance' || w.kind === 'door' ? 'door' : 'window';
    out.push({ kind, id: w.id, ...s, z0: w.sill || 0, z1: (w.sill || 0) + w.hz });
  }
  for (const g of L.furniture || []) {
    const s = spanOn(f, furnRect(g));
    if (s) out.push({ kind: 'furn', id: g.id, l: g.l, sym: g.sym, ...s, z0: 0, z1: g.hz || 0 });
  }
  return out.sort((a, b) => a.a - b.a);
}

// граф помещений уровня: ребро — проём, вес — манхэттен между их центрами
export function graph(L) {
  const rooms = L.rooms, edges = rooms.map(() => []);
  for (const o of L.openings || []) {
    const r = openRect(o);
    const grown = o.dir === 'h' ? { x: r.x, y: r.y - 150, w: r.w, h: r.h + 300 } : { x: r.x - 150, y: r.y, w: r.w + 300, h: r.h };
    const hit = rooms.map((rm, i) => ov(grown, rm) > 1000 ? i : -1).filter(i => i >= 0);
    if (hit.length !== 2) continue;
    const c = { x: r.x + r.w / 2, y: r.y + r.h / 2, dir: o.dir };
    edges[hit[0]].push({ to: hit[1], gate: c });
    edges[hit[1]].push({ to: hit[0], gate: c });
  }
  return edges;
}

const ov = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x))
  * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

const man = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

// кратчайший путь по помещениям уровня от точки до точки, ломаная по осям.
// Возвращает длину и вершины: этого хватает и на метраж, и на подсчёт углов
export function pathOnLevel(L, from, to) {
  const rooms = L.rooms, edges = graph(L);
  const inRoom = p => rooms.findIndex(r => p.x >= r.x - 200 && p.x <= r.x + r.w + 200 && p.y >= r.y - 200 && p.y <= r.y + r.h + 200);
  const a = inRoom(from), b = inRoom(to);
  if (a < 0 || b < 0) return null;
  if (a === b) return { len: man(from, to), via: orth([from, to]) };
  const best = rooms.map(() => Infinity), prev = rooms.map(() => null);
  best[a] = 0;
  const q = [a];
  while (q.length) {
    q.sort((i, j) => best[i] - best[j]);
    const i = q.shift();
    const here = prev[i] ? prev[i].gate : from;
    for (const e of edges[i]) {
      const d = best[i] + man(here, e.gate);
      if (d < best[e.to] - 1) { best[e.to] = d; prev[e.to] = { from: i, gate: e.gate }; q.push(e.to); }
    }
  }
  if (!isFinite(best[b])) return null;
  const gates = [];
  for (let i = b; prev[i]; i = prev[i].from) gates.unshift(prev[i].gate);
  const stops = [from, ...gates, to];
  let len = 0;
  for (let i = 1; i < stops.length; i++) len += man(stops[i - 1], stops[i]);
  return { len, via: orth(stops) };
}

// Ломаная строго по осям, и через проём — поперёк стены, а не наискось.
// Длина считается манхэттеном, поэтому и линия обязана идти по осям:
// диагональ на чертеже при манхэттене в ведомости — это расхождение
// картинки с числом, а такие расхождения и есть источник вранья
function orth(stops) {
  const out = [stops[0]];
  for (let i = 1; i < stops.length; i++) {
    const a = out[out.length - 1], b = stops[i], prev = stops[i - 1];
    const xFirst = b.dir === 'h' ? true : b.dir === 'v' ? false : prev.dir === 'h' ? false : true;
    const corner = xFirst ? { x: b.x, y: a.y } : { x: a.x, y: b.y };
    if (corner.x !== a.x || corner.y !== a.y) out.push(corner);
    if (b.x !== corner.x || b.y !== corner.y) out.push({ x: b.x, y: b.y });
  }
  return out;
}
