// Маршрут прогулки: камера смотрелки проходит все помещения дома со входа
// и далее, на высоте глаз и со скоростью шага.
//
// Хранится решение, а не результат: маршрут не расставлен руками, а выводится
// из data/house.json — граф помещений по проёмам, обход в глубину от входной
// двери, путь внутри помещения по той же решётке 50 мм телом 550, которой
// правило 29 меряет проходимость пола. Подвинулась мебель или дверь —
// маршрут пересчитался сам; правило требует, чтобы он по-прежнему проходил
// все помещения без исключения.
//
// Координаты здесь — плановые, как во всём data/house.json (Y вниз).
// Отражение в мир модели делается один раз при выгрузке tour.json,
// рядом с тем же отражением в src/ifc.mjs.

import { LIMITS } from './rules.mjs';
import { stairGeom } from './render.mjs';

export const TOUR = {
  eye: 1600,    // высота глаз над полом
  speed: 1300   // мм/с — спокойный шаг; лестница замедляет сама, ход длиннее
};

const OFF = 350;  // отступ точки прохода от грани стены: полкорпуса плюс запас

const rect = (x, y, w, h) => ({ x, y, w, h });
const box = f => f.t === 'c' ? rect(f.x - f.r, f.y - f.r, 2 * f.r, 2 * f.r) : rect(f.x, f.y, f.w, f.h);
const openingRect = o => o.dir === 'h' ? rect(o.x, o.y, o.w, o.t) : rect(o.x, o.y, o.t, o.w);
const contains = (r, x, y) => x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h;

// препятствия — те же, что в правиле проходимости: мебель с телом, стояк,
// вентшахты и дымоходы внутри контура. Другой набор дал бы маршрут,
// который правило считает непроходимым, или наоборот
const obstacles = L => [
  ...(L.furniture || []).filter(f => f.hz !== 0).map(box),
  L.riser, ...(L.ducts || []), ...(L.flues || []).filter(f => !f.outside)
].filter(Boolean);

// решётка свободного пола помещения с разметкой связных кусков:
// ближайшая к точке клетка может лежать в кармане за мебелью,
// и путь к ней честно не найдётся — поэтому куски различаются
function grid(room, obst) {
  const S = 50, m = LIMITS.body / 2;
  const nx = Math.max(1, Math.floor(room.w / S)), ny = Math.max(1, Math.floor(room.h / S));
  const at = k => [room.x + Math.floor(k / ny) * S + S / 2, room.y + (k % ny) * S + S / 2];
  const freePt = (x, y) =>
    x - m >= room.x && x + m <= room.x + room.w &&
    y - m >= room.y && y + m <= room.y + room.h &&
    !obst.some(o => x + m > o.x && x - m < o.x + o.w && y + m > o.y && y - m < o.y + o.h);
  const comp = new Int32Array(nx * ny).fill(-1);
  let comps = 0;
  for (let k = 0; k < nx * ny; k++) {
    if (comp[k] >= 0 || !freePt(...at(k))) continue;
    const st = [k]; comp[k] = comps;
    while (st.length) {
      const c = st.pop(), i = Math.floor(c / ny), j = c % ny;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const p = i + di, q = j + dj;
        if (p < 0 || q < 0 || p >= nx || q >= ny) continue;
        const n = p * ny + q;
        if (comp[n] >= 0 || !freePt(...at(n))) continue;
        comp[n] = comps; st.push(n);
      }
    }
    comps++;
  }
  const near = (x, y, want = -1) => {
    let best = -1, bd = Infinity;
    for (let k = 0; k < nx * ny; k++) {
      if (comp[k] < 0 || (want >= 0 && comp[k] !== want)) continue;
      const [px, py] = at(k);
      const d = (px - x) ** 2 + (py - y) ** 2;
      if (d < bd) { bd = d; best = k; }
    }
    return best;
  };
  return { S, nx, ny, at, comp, freePt, near };
}

// прямая видимость телом: отрезок проходим, если тело свободно в каждой
// точке с шагом в полклетки
function clearLine(g, a, b) {
  const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 25));
  for (let i = 0; i <= n; i++)
    if (!g.freePt(a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n)) return false;
  return true;
}

// путь по помещению: BFS по клеткам одного связного куска, потом спрямление.
// null — пути нет, и это дефект данных, а не повод молча срезать сквозь мебель
function route(g, from, to) {
  const a = g.near(...from);
  if (a < 0) return null;
  let b = g.near(...to);
  if (b < 0) return null;
  if (g.comp[b] !== g.comp[a]) b = g.near(...to, g.comp[a]);
  if (b < 0 || Math.hypot(...g.at(b).map((v, i) => v - to[i])) > 700) return null;
  const prev = new Int32Array(g.nx * g.ny).fill(-2);
  prev[a] = -1;
  const q = [a];
  for (let h = 0; h < q.length && prev[b] === -2; h++) {
    const i = Math.floor(q[h] / g.ny), j = q[h] % g.ny;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const p = i + di, r = j + dj;
      if (p < 0 || r < 0 || p >= g.nx || r >= g.ny) continue;
      const n = p * g.ny + r;
      if (g.comp[n] < 0 || prev[n] !== -2) continue;
      prev[n] = q[h]; q.push(n);
    }
  }
  if (prev[b] === -2) return null;
  const cells = [];
  for (let k = b; k !== -1; k = prev[k]) cells.push(g.at(k));
  cells.reverse();
  const pts = [from, ...cells, to];
  const out = [pts[0]];
  let i = 0;
  while (i < pts.length - 1) {
    let k = pts.length - 1;
    while (k > i + 1 && !clearLine(g, pts[i], pts[k])) k--;
    out.push(pts[k]); i = k;
  }
  return out;
}

// точки прохода через проём — по одной с каждой стороны стены. along —
// координата вдоль проёма: дверь проходится по оси, проём лестничной
// шахты — по оси марша, на который входят
function crossPts(o, along) {
  const r = openingRect(o);
  if (o.dir === 'v') {
    const y = along ?? r.y + r.h / 2;
    return [[r.x - OFF, y], [r.x + r.w + OFF, y]];
  }
  const x = along ?? r.x + r.w / 2;
  return [[x, r.y - OFF], [x, r.y + r.h + OFF]];
}

// те же точки, разложенные по помещениям: a — в первом, b — во втором
function doorSides(o, ra, rb, along) {
  const [p, q] = crossPts(o, along);
  return contains(ra, ...p) ? { a: p, b: q } : { a: q, b: p };
}

// ход по лестнице — по маршам, как ходит человек и как её кладёт выгрузка:
// от торца входа вдоль первого марша до площадки с подъёмом на полвысоты,
// разворот, вторым маршем обратно к торцу. Отметка интерполируется по ходу
function stairWalk(st, b0, b1) {
  const g = stairGeom(st);
  const yA = st.y + g.width / 2;                 // марш подъёма
  const yB = st.y + st.h - g.width / 2;          // марш выхода
  const mid = (b0 + b1) / 2, lx = g.landX0 + g.landing / 2;
  // торец хода совпадает с точкой прохода через проём шахты: иначе камера
  // делает шажок назад перед первой ступенью
  const foot = g.east ? st.x + st.w - OFF : st.x + OFF;
  const edge = g.east ? g.runX0 : g.runX0 + g.run;
  return {
    yA, yB,
    pts: [
      { x: foot, y: yA, z: b0 }, { x: edge, y: yA, z: mid },
      { x: lx, y: yA, z: mid }, { x: lx, y: yB, z: mid },
      { x: edge, y: yB, z: mid }, { x: foot, y: yB, z: b1 }
    ]
  };
}

// вход: подход снаружи к двери kind entrance. Настил веранды ниже пола,
// поэтому у стартовых точек своя отметка
function entryPts(win, S, L) {
  const c = (win.a + win.b) / 2, t = S.wall, far = 1800;
  const deck = L.base + (L.veranda ? L.veranda.deck : 0);
  const P = (x, y, z) => ({ x, y, z });
  if (win.side === 'E') return { out: [P(S.w + far, c, deck), P(S.w + 150, c, deck)], door: [S.w - t - OFF, c] };
  if (win.side === 'W') return { out: [P(-far, c, deck), P(-150, c, deck)], door: [t + OFF, c] };
  if (win.side === 'S') return { out: [P(c, -far, deck), P(c, -150, deck)], door: [c, t + OFF] };
  return { out: [P(c, S.h + far, deck), P(c, S.h - 150, deck)], door: [c, S.h - t - OFF] };
}

export function tour(house) {
  const S = house.shell, levels = house.levels;
  const problems = [], pts = [];
  const visited = new Set();

  let lastTitle = null;
  const push = (p, title) => {
    const q = { x: Math.round(p.x), y: Math.round(p.y), z: Math.round(p.z) };
    const prev = pts[pts.length - 1];
    if (title && title !== lastTitle) { q.t = title; lastTitle = title; }
    if (prev && prev.x === q.x && prev.y === q.y && prev.z === q.z) {
      if (q.t) prev.t = q.t;
      return;
    }
    pts.push(q);
  };

  const grids = new Map();
  const gridOf = (L, room) => {
    if (!grids.has(room.id)) grids.set(room.id, grid(room, obstacles(L)));
    return grids.get(room.id);
  };

  const walk = (L, room, from, to) => {
    if (from[0] === to[0] && from[1] === to[1]) return;
    const r = route(gridOf(L, room), from, to);
    if (!r) {
      problems.push(`в «${room.name}» (${room.id}) телом ${LIMITS.body} не пройти от `
        + `${Math.round(from[0])},${Math.round(from[1])} до ${Math.round(to[0])},${Math.round(to[1])}`);
      push({ x: to[0], y: to[1], z: L.base }, room.name);
      return;
    }
    for (const p of r) push({ x: p[0], y: p[1], z: L.base }, room.name);
  };

  // точка обзора — достижимая от входа клетка, ближайшая к центру помещения.
  // Просто ближайшая к центру может лежать в кармане за мебелью
  const viewpoint = (L, room, from) => {
    const g = gridOf(L, room);
    const a = g.near(...from);
    const k = a < 0 ? -1 : g.near(room.x + room.w / 2, room.y + room.h / 2, g.comp[a]);
    return k < 0 ? from : g.at(k);
  };

  // ---- граф: узлы — помещения без лестничных, рёбра — проёмы и лестницы --
  const nodes = new Map(), stairRoomOf = new Map(), passOf = new Map();
  for (const L of levels) for (const r of L.rooms) {
    if (r.tag === 'stair') stairRoomOf.set(L.id, r);
    else nodes.set(r.id, { room: r, L, edges: [] });
  }
  for (const L of levels) for (const o of L.openings || []) {
    const r = openingRect(o);
    const probe = o.dir === 'v'
      ? [[r.x - 60, r.y + r.h / 2], [r.x + r.w + 60, r.y + r.h / 2]]
      : [[r.x + r.w / 2, r.y - 60], [r.x + r.w / 2, r.y + r.h + 60]];
    const [ra, rb] = probe.map(p => L.rooms.find(rm => contains(rm, ...p)));
    if (!ra || !rb) continue;
    const stair = [ra, rb].find(x => x.tag === 'stair');
    if (stair) passOf.set(L.id, { o, hall: ra === stair ? rb : ra });
    else {
      nodes.get(ra.id).edges.push({ kind: 'door', o, to: rb });
      nodes.get(rb.id).edges.push({ kind: 'door', o, to: ra });
    }
  }
  for (let i = 0; i + 1 < levels.length; i++) {
    const L = levels[i], U = levels[i + 1];
    if (!L.stair) continue;
    const low = passOf.get(L.id), up = passOf.get(U.id);
    const rl = stairRoomOf.get(L.id), ru = stairRoomOf.get(U.id);
    if (!low || !up || !rl || !ru) { problems.push(`лестнице ${L.id} → ${U.id} не найден проём шахты`); continue; }
    const link = { st: L.stair, L, U, low, up, rl, ru };
    nodes.get(low.hall.id).edges.push({ kind: 'stair', link, up: true, to: up.hall, li: i + 1 });
    nodes.get(up.hall.id).edges.push({ kind: 'stair', link, up: false, to: low.hall, li: i });
  }

  // порядок обхода: сначала соседние помещения по номеру экспликации,
  // лестницы после — вниз раньше, чем вверх. Так тур идёт этаж за этажом
  const order = n => n.edges.slice().sort((p, q) => {
    if ((p.kind === 'stair') !== (q.kind === 'stair')) return p.kind === 'stair' ? 1 : -1;
    if (p.kind === 'stair') return p.li - q.li;
    return (p.to.n || 99) - (q.to.n || 99);
  });

  // проход по лестничному ребру в обе стороны: через проём шахты по оси
  // марша, по маршам, наружу через проём другого уровня
  const stairPass = (e, back) => {
    const { link } = e;
    const w = stairWalk(link.st, link.L.base, link.U.base);
    const lowS = doorSides(link.low.o, link.low.hall, link.rl, w.yA);
    const upS = doorSides(link.up.o, link.up.hall, link.ru, w.yB);
    const upward = e.up !== back;
    const inn = upward ? lowS : upS, out = upward ? upS : lowS;
    const seq = upward ? w.pts : w.pts.slice().reverse();
    const zIn = upward ? link.L.base : link.U.base, zOut = upward ? link.U.base : link.L.base;
    push({ x: inn.b[0], y: inn.b[1], z: zIn }, link.rl.name);
    for (const p of seq) push(p);
    push({ x: out.b[0], y: out.b[1], z: zOut });
    visited.add(link.rl.id); visited.add(link.ru.id);
    return { enter: inn.a, arrive: out.a, zOut };
  };
  const stairEnter = e => {
    const w = stairWalk(e.link.st, e.link.L.base, e.link.U.base);
    return e.up ? doorSides(e.link.low.o, e.link.low.hall, e.link.rl, w.yA).a
      : doorSides(e.link.up.o, e.link.up.hall, e.link.ru, w.yB).a;
  };

  let lastNew = 0;
  const dfs = (node, entry) => {
    const { room, L } = node;
    visited.add(room.id);
    const vp = viewpoint(L, room, entry);
    walk(L, room, entry, vp);
    lastNew = pts.length;
    let cur = vp;
    for (const e of order(node)) {
      if (visited.has(e.to.id)) continue;
      if (e.kind === 'door') {
        const sides = doorSides(e.o, room, e.to);
        walk(L, room, cur, sides.a);
        push({ x: sides.b[0], y: sides.b[1], z: L.base }, e.to.name);
        dfs(nodes.get(e.to.id), sides.b);
        push({ x: sides.a[0], y: sides.a[1], z: L.base }, room.name);
        cur = sides.a;
      } else {
        const enter = stairEnter(e);
        walk(L, room, cur, enter);
        const s = stairPass(e, false);
        push({ x: s.arrive[0], y: s.arrive[1], z: s.zOut }, e.to.name);
        dfs(nodes.get(e.to.id), s.arrive);
        const b = stairPass(e, true);
        push({ x: b.arrive[0], y: b.arrive[1], z: b.zOut }, room.name);
        cur = enter;
      }
    }
    // назад к входному проёму: родитель продолжает из него
    walk(L, room, cur, entry);
  };

  // ---- старт: с веранды через входную дверь --------------------------------
  const entL = levels.find(l => (l.windows || []).some(w => w.kind === 'entrance'));
  const ent = entL && entL.windows.find(w => w.kind === 'entrance');
  if (!ent) {
    problems.push('входной двери нет — прогулке неоткуда начаться');
    return { pts, problems };
  }
  const ep = entryPts(ent, S, entL);
  const start = entL.rooms.find(r => r.tag !== 'stair' && contains(r, ...ep.door));
  if (!start) {
    problems.push('за входной дверью не нашлось помещения');
    return { pts, problems };
  }
  for (const p of ep.out) push(p, 'Веранда');
  push({ x: ep.door[0], y: ep.door[1], z: entL.base }, start.name);
  dfs(nodes.get(start.id), ep.door);

  // хвост после последнего нового помещения — чистый возврат, смотреть
  // там нечего: маршрут кончается в последней комнате
  pts.length = lastNew;

  // все помещения без исключения — иначе прогулка врёт своим названием
  for (const L of levels) for (const r of L.rooms)
    if (!visited.has(r.id)) problems.push(`«${r.name}» (${r.id}) не попала в маршрут`);

  return { pts, problems };
}
