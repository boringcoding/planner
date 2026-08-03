// Правила проверки планировки. Каждый найденный дефект добавляется сюда,
// а не чинится единичной правкой координаты.

import { labelBoxes, roomBlock, furnText, textBox } from './render.mjs';

export const LIMITS = {
  doorClearance: 900,      // глубина свободной зоны перед проёмом
  entranceClearance: 1200, // то же для входной двери
  passage: 700,            // проход между предметами мебели
  wardrobePassage: 800,    // проход между рядами шкафов
  windowBand: 600,         // полоса у окна, которую нельзя загораживать высокой мебелью
  riserMax: 200,           // максимальный подъём ступени
  treadMin: 250,           // минимальная проступь
  storagePassage: 900,     // проход между рядами стеллажей в кладовой и мастерской
  wetOverlapMin: 700,      // минимальное совпадение мокрых зон по вертикали
  bedSide: 700,            // проход вдоль двуспальной кровати с каждой стороны
  bedFoot: 700,            // проход в изножье
  carGap: 800,             // между машинами в гараже
  carSide: 800,            // от борта машины до стены или до мебели глубже 300
  carFront: 500,           // от бампера до плоскости ворот
  carRear: 700,            // от заднего бампера до стены
  riserMin: 400,           // сторона шахты канализационного стояка
  flueMin: 400,            // сторона шахты дымохода (сэндвич d200 с разделкой)
  ductMin: 400,            // сторона вентшахты (магистраль 200×200 с изоляцией)
  roomMin: 900,            // самая узкая сторона любого помещения
  quietMin: 2400,          // то же для жилой комнаты
  labelClear: 30,          // допуск при проверке подписей на наложение
  tallMin: 1200,           // с этой высоты предмет считается высоким
  doorHzMin: 1900,         // высота дверного проёма
  glazingRatio: 8          // площадь остекления жилой комнаты — не меньше 1/8 пола
};

// шкафы и стеллажи ставят рядами, между рядами нужен проход. Ванна рядом
// со стиральной колонной — не ряд, а ниша: правило о проходе к ней не относится
const STORAGE = new Set(['rack', 'wardrobe', 'dresser']);
const tall = f => (f.hz || 0) >= LIMITS.tallMin;

const rect = (x, y, w, h) => ({ x, y, w, h });
const box = f => f.t === 'c' ? rect(f.x - f.r, f.y - f.r, 2 * f.r, 2 * f.r) : rect(f.x, f.y, f.w, f.h);
const area = r => Math.max(0, r.w) * Math.max(0, r.h);
const inter = (a, b) => rect(
  Math.max(a.x, b.x), Math.max(a.y, b.y),
  Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x),
  Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
);
const overlap = (a, b) => { const i = inter(a, b); return i.w > 0 && i.h > 0 ? i.w * i.h : 0; };
const inside = (a, b) => a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;
const shrink = (r, m) => rect(r.x + m, r.y + m, r.w - 2 * m, r.h - 2 * m);
const openingRect = o => o.dir === 'h' ? rect(o.x, o.y, o.w, o.t) : rect(o.x, o.y, o.t, o.w);
const stairRun = st => rect(st.x + st.landing, st.y, st.w - st.landing, st.h);

function windowRect(win, shell) {
  const t = shell.wall, W = shell.w, H = shell.h;
  if (win.side === 'S') return rect(win.a, 0, win.b - win.a, t);
  if (win.side === 'N') return rect(win.a, H - t, win.b - win.a, t);
  if (win.side === 'W') return rect(0, win.a, t, win.b - win.a);
  return rect(W - t, win.a, t, win.b - win.a);
}

// полоса внутри помещения, примыкающая к окну
function windowBand(win, shell, d) {
  const t = shell.wall, W = shell.w, H = shell.h;
  if (win.side === 'S') return rect(win.a, t, win.b - win.a, d);
  if (win.side === 'N') return rect(win.a, H - t - d, win.b - win.a, d);
  if (win.side === 'W') return rect(t, win.a, d, win.b - win.a);
  return rect(W - t - d, win.a, d, win.b - win.a);
}

// две зоны подхода — по обе стороны проёма
function approachZones(o, depth) {
  if (o.dir === 'h') return [rect(o.x, o.y - depth, o.w, depth), rect(o.x, o.y + o.t, o.w, depth)];
  return [rect(o.x - depth, o.y, depth, o.w), rect(o.x + o.t, o.y, depth, o.w)];
}

// Помещения и стены — два описания одного и того же пола, и разъехаться они
// могут молча: невидимый на чертеже прямоугольник помещения ничем себя не
// выдаёт. Разбиваем внутренний габарит по всем координатам граней и смотрим,
// какая клетка осталась ничьей, а какая попала и в стену, и в помещение
function tiling(inner, rooms, walls) {
  const clip = r => rect(Math.max(r.x, inner.x), Math.max(r.y, inner.y),
    Math.min(r.x + r.w, inner.x + inner.w) - Math.max(r.x, inner.x),
    Math.min(r.y + r.h, inner.y + inner.h) - Math.max(r.y, inner.y));
  const R = rooms.map(clip), W = walls.map(clip).filter(w => w.w > 0 && w.h > 0);
  const edges = (k, s) => [...new Set([inner[k], inner[k] + inner[s],
  ...R.flatMap(r => [r[k], r[k] + r[s]]), ...W.flatMap(r => [r[k], r[k] + r[s]])])]
    .filter(v => v >= inner[k] && v <= inner[k] + inner[s]).sort((a, b) => a - b);
  const xs = edges('x', 'w'), ys = edges('y', 'h');
  const free = [], over = [];
  const hit = (l, cx, cy) => l.findIndex(r => cx > r.x && cx < r.x + r.w && cy > r.y && cy < r.y + r.h);
  for (let i = 0; i + 1 < xs.length; i++)
    for (let j = 0; j + 1 < ys.length; j++) {
      const cell = rect(xs[i], ys[j], xs[i + 1] - xs[i], ys[j + 1] - ys[j]);
      if (area(cell) < 10000) continue;
      const cx = xs[i] + cell.w / 2, cy = ys[j] + cell.h / 2;
      const r = hit(R, cx, cy), w = hit(W, cx, cy);
      if (r < 0 && w < 0) free.push(cell);
      if (r >= 0 && w >= 0) over.push({ cell, room: rooms[r] });
    }
  return { free, over };
}

function clearZone(f, shell) {
  if (!f.clear) return null;
  const b = box(f), d = f.clear.d;
  if (f.clear.side === 'N') return rect(b.x, b.y + b.h, b.w, d);
  if (f.clear.side === 'S') return rect(b.x, b.y - d, b.w, d);
  if (f.clear.side === 'W') return rect(b.x - d, b.y, d, b.h);
  return rect(b.x + b.w, b.y, d, b.h);
}

// свободное расстояние от грани предмета до стены помещения с учётом того,
// что стоит на пути
function sideGap(b, room, others, dir) {
  const hitY = o => Math.min(o.y + o.h, b.y + b.h) - Math.max(o.y, b.y) > 100;
  const hitX = o => Math.min(o.x + o.w, b.x + b.w) - Math.max(o.x, b.x) > 100;
  if (dir === 'W') return b.x - others.filter(o => hitY(o) && o.x + o.w <= b.x)
    .reduce((m, o) => Math.max(m, o.x + o.w), room.x);
  if (dir === 'E') return others.filter(o => hitY(o) && o.x >= b.x + b.w)
    .reduce((m, o) => Math.min(m, o.x), room.x + room.w) - (b.x + b.w);
  if (dir === 'S') return b.y - others.filter(o => hitX(o) && o.y + o.h <= b.y)
    .reduce((m, o) => Math.max(m, o.y + o.h), room.y);
  return others.filter(o => hitX(o) && o.y >= b.y + b.h)
    .reduce((m, o) => Math.min(m, o.y), room.y + room.h) - (b.y + b.h);
}

export function check(house, brief) {
  const errs = [];
  const S = house.shell;
  const inner = rect(S.wall, S.wall, S.w - 2 * S.wall, S.h - 2 * S.wall);
  const E = (lvl, msg) => errs.push(`${lvl.title}: ${msg}`);
  const ids = new Set();

  for (const L of house.levels) {
    const rooms = L.rooms, walls = L.walls, opens = L.openings || [], wins = L.windows || [], furn = L.furniture || [];

    // 1. помещения внутри оболочки и без наложений
    for (const r of rooms) {
      if (Math.abs(overlap(r, inner) - area(r)) > 1) E(L, `«${r.name}» выходит за внутренний габарит`);
    }
    for (let i = 0; i < rooms.length; i++)
      for (let j = i + 1; j < rooms.length; j++)
        if (overlap(rooms[i], rooms[j]) > 100) E(L, `наложение «${rooms[i].name}» и «${rooms[j].name}»`);

    // 1а. помещения и стены вместе покрывают внутренний габарит без зазоров
    // и без наложений. Прямоугольник помещения на чертеже не виден, поэтому
    // разъехаться со стенами он может незаметно — глазами это не ловится
    const tile = tiling(inner, rooms, walls);
    for (const c of tile.free.slice(0, 3))
      E(L, `пол ${c.w} × ${c.h} мм у ${c.x},${c.y} не принадлежит ни одному помещению`);
    for (const o of tile.over.slice(0, 3))
      E(L, `«${o.room.name}» налезает на стену у ${o.cell.x},${o.cell.y}`);

    // 2. проёмы лежат в стенах
    for (const o of opens) {
      const r = openingRect(o);
      const hit = walls.some(w => overlap(r, w) > 0.6 * area(r));
      if (!hit) E(L, `проём ${o.x},${o.y} не лежит в стене`);
    }

    // 3. каждый проём соединяет ровно два помещения
    const adj = rooms.map(() => new Set());
    for (const o of opens) {
      const r = openingRect(o);
      const grown = o.dir === 'h' ? rect(r.x, r.y - 150, r.w, r.h + 300) : rect(r.x - 150, r.y, r.w + 300, r.h);
      const hit = rooms.map((rm, i) => overlap(grown, rm) > 1000 ? i : -1).filter(i => i >= 0);
      if (hit.length !== 2) E(L, `проём ${o.x},${o.y} соединяет ${hit.length} помещений (${hit.map(i => rooms[i].name).join(', ') || '—'})`);
      for (const a of hit) for (const b of hit) if (a !== b) adj[a].add(b);
    }

    // 4. все помещения достижимы от лестницы
    const start = rooms.findIndex(r => r.tag === 'stair');
    if (start < 0) E(L, 'нет помещения с тегом stair');
    else {
      const seen = new Set([start]), st = [start];
      while (st.length) for (const n of adj[st.pop()]) if (!seen.has(n)) { seen.add(n); st.push(n); }
      rooms.forEach((r, i) => { if (!seen.has(i)) E(L, `«${r.name}» не связано с лестницей`); });
    }

    // 5. каждое окно принадлежит ровно одному помещению
    for (const w of wins) {
      const band = windowBand(w, S, 300);
      const hit = rooms.filter(r => overlap(band, r) > 1000);
      if (hit.length !== 1) E(L, `окно ${w.side} ${w.a}–${w.b} относится к ${hit.length} помещениям`);
      const wr = windowRect(w, S);
      if (wr.x < 0 || wr.y < 0 || wr.x + wr.w > S.w || wr.y + wr.h > S.h)
        E(L, `окно ${w.side} ${w.a}–${w.b} выходит за оболочку`);
    }

    // 6. мебель целиком внутри одного помещения и не пересекается
    for (const f of furn) {
      const b = box(f);
      const host = rooms.find(r => overlap(b, r) > 0.98 * area(b));
      if (!host) E(L, `мебель ${f.l || f.t} ${f.x},${f.y} не помещается целиком ни в одно помещение`);
    }
    for (let i = 0; i < furn.length; i++)
      for (let j = i + 1; j < furn.length; j++)
        if (overlap(box(furn[i]), box(furn[j])) > 100)
          E(L, `мебель пересекается: ${furn[i].l || furn[i].t} и ${furn[j].l || furn[j].t}`);

    // 7. зоны подхода к проёмам свободны от мебели
    for (const o of opens) {
      if (o.kind === 'pass') continue;
      for (const z of approachZones(o, LIMITS.doorClearance))
        for (const f of furn)
          if (overlap(z, box(f)) > 10000)
            E(L, `${f.l || f.t} перекрывает зону подхода к проёму ${o.x},${o.y}`);
    }

    // 8. зоны подхода к наружным дверям
    for (const w of wins) {
      if (w.kind !== 'entrance' && w.kind !== 'door') continue;
      const z = windowBand(w, S, w.kind === 'entrance' ? LIMITS.entranceClearance : LIMITS.doorClearance);
      for (const f of furn)
        if (overlap(z, box(f)) > 10000)
          E(L, `${f.l || f.t} перекрывает зону подхода к двери ${w.side} ${w.a}–${w.b}`);
    }

    // 9. мебель не загораживает окна. Загораживает та, что поднимается выше
    // подоконника: машина под высоким окном гаража свет не отнимает
    for (const w of wins) {
      if (w.kind === 'gate') continue;
      const band = windowBand(w, S, LIMITS.windowBand);
      for (const f of furn)
        if ((f.hz || 0) > (w.sill || 0) + 300 && overlap(band, box(f)) > 10000)
          E(L, `${f.l || f.sym || 'мебель'} загораживает окно ${w.side} ${w.a}–${w.b}`);
    }

    // 10. свободная зона перед сантехникой и кухонным фронтом
    for (const f of furn) {
      const z = clearZone(f, S);
      if (!z) continue;
      for (const g of furn)
        if (g !== f && overlap(z, box(g)) > 10000)
          E(L, `${g.l || g.t} стоит в зоне обслуживания «${f.l}»`);
    }

    // 11. проход между высокой мебелью в одном помещении
    for (let i = 0; i < furn.length; i++)
      for (let j = i + 1; j < furn.length; j++) {
        const a = box(furn[i]), b = box(furn[j]);
        if (!(STORAGE.has(furn[i].sym) && STORAGE.has(furn[j].sym))) continue;
        const sameRoom = rooms.find(r => overlap(a, r) > 0.9 * area(a) && overlap(b, r) > 0.9 * area(b));
        if (!sameRoom) continue;
        const yOv = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        const xOv = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const need = sameRoom.tag === 'store' ? LIMITS.storagePassage : LIMITS.wardrobePassage;
        if (yOv > 500 && xOv < 0) {
          const gap = Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w);
          if (gap < need) E(L, `проход ${gap} мм между шкафами в «${sameRoom.name}» меньше ${need}`);
        }
        if (xOv > 500 && yOv < 0) {
          const gap = Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h);
          if (gap < LIMITS.passage) E(L, `проход ${gap} мм в «${sameRoom.name}» меньше ${LIMITS.passage}`);
        }
      }

    // 12. машина по центру своей створки ворот
    const gates = wins.filter(w => w.kind === 'gate');
    const cars = furn.filter(f => f.sym === 'car');
    for (const g of gates) {
      const gc = (g.a + g.b) / 2;
      const car = cars.find(c => Math.abs(c.x + c.w / 2 - gc) < 150);
      if (!car) E(L, `нет машины по центру ворот ${g.a}–${g.b} (центр ${gc})`);
      else if (car.w + 300 > g.b - g.a) E(L, `створка ${g.b - g.a} мм узка для машины ${car.w} мм`);
    }

    // 13. лестница
    const st = L.stair;
    if (st) {
      // марш связывает этот уровень со следующим, а на верхнем уровне —
      // с предыдущим: брать floorToFloor своего этажа неверно
      const i = house.levels.indexOf(L);
      const other = house.levels[i + 1] || house.levels[i - 1];
      const climb = other ? Math.abs(other.base - L.base) : L.floorToFloor;
      const rise = Math.round(climb / st.risers);
      if (rise > LIMITS.riserMax) E(L, `подъём ступени ${rise} мм больше ${LIMITS.riserMax}`);
      if (st.tread < LIMITS.treadMin) E(L, `проступь ${st.tread} мм меньше ${LIMITS.treadMin}`);
      const flight = (Math.ceil(st.risers / 2) - 1) * st.tread;
      if (flight + st.landing > st.w) E(L, `марш ${flight} + площадка ${st.landing} не влезает в шахту ${st.w}`);
      if (st.landing < (st.h - 100) / 2) E(L, `площадка ${st.landing} уже марша`);
    }

    // 14. дверь не открывается на марш. Перед полотном нужен ровный пол;
    // ступень вместо него — это падение с порога. Открытый проём (kind: 'pass')
    // — другое дело: там нет полотна, и низ марша начинается сразу за ним
    if (st) {
      const run = stairRun(st);
      for (const o of opens) {
        if (o.kind === 'pass') continue;
        for (const z of approachZones(o, LIMITS.doorClearance))
          if (overlap(z, run) > 10000)
            E(L, `проём ${o.x},${o.y} открывается на марш лестницы`);
      }
    }

    // 15. проходы вокруг кровати: к двуспальной подходят с обеих сторон
    for (const f of furn) {
      if (f.sym !== 'bed') continue;
      const b = box(f);
      const room = rooms.find(r => overlap(b, r) > 0.98 * area(b));
      if (!room) continue;
      // тумба у изголовья — это и есть подход, а не помеха: считаем только
      // высокую мебель, мимо которой действительно не пройти
      const others = furn.filter(g => g !== f && tall(g)).map(box);
      // если в комнате два проёма, изножье — транзит между ними, а не тупик
      const doors = opens.filter(o => overlap(openingRect(o), rect(room.x - 200, room.y - 200, room.w + 400, room.h + 400)) > 0).length;
      const footMin = doors >= 2 ? 900 : LIMITS.bedFoot;
      const foot = sideGap(b, room, others, 'N');
      if (foot < footMin) E(L, `в изножье кровати в «${room.name}» ${Math.round(foot)} мм, нужно ${footMin}`);
      if (f.w >= 1400) {
        for (const [d, name] of [['W', 'слева'], ['E', 'справа']]) {
          const g = sideGap(b, room, others, d);
          if (g < LIMITS.bedSide) E(L, `${name} от кровати в «${room.name}» ${Math.round(g)} мм, нужно ${LIMITS.bedSide}`);
        }
      }
    }

    // 16. проходы в гараже. Стеллаж глубиной от 300 считается стеной:
    // высадка упирается в него, а не в штукатурку
    const garage = rooms.find(r => r.tag === 'garage');
    if (garage && cars.length) {
      const sorted = [...cars].sort((a, b) => a.x - b.x);
      for (let i = 1; i < sorted.length; i++) {
        const gap = sorted[i].x - (sorted[i - 1].x + sorted[i - 1].w);
        if (gap < LIMITS.carGap) E(L, `между машинами ${Math.round(gap)} мм, нужно ${LIMITS.carGap}`);
      }
      const walls300 = furn.filter(f => f.t !== 'car' && Math.min(f.w || 0, f.h || 0) >= 300 && overlap(box(f), garage) > 0).map(box);
      for (const c of cars) {
        const b = box(c), others = cars.filter(o => o !== c).map(box).concat(walls300);
        for (const [d, name, lim] of [['W', 'слева', LIMITS.carSide], ['E', 'справа', LIMITS.carSide],
        ['S', 'до ворот', LIMITS.carFront], ['N', 'сзади', LIMITS.carRear]]) {
          const g = sideGap(b, garage, others, d);
          if (g < lim) E(L, `от машины ${name} ${Math.round(g)} мм, нужно ${lim}`);
        }
      }
      // гараж сообщается с домом только через тамбур
      for (const o of opens) {
        const r = openingRect(o);
        const grown = o.dir === 'h' ? rect(r.x, r.y - 150, r.w, r.h + 300) : rect(r.x - 150, r.y, r.w + 300, r.h);
        if (overlap(grown, garage) < 1000) continue;
        const other = rooms.find(rm => rm !== garage && overlap(grown, rm) > 1000);
        if (other && other.tag !== 'lock')
          E(L, `проём ${o.x},${o.y} ведёт из гаража прямо в «${other.name}» — нужен тамбур`);
      }
    }

    // 17. минимальный размер помещения; жилая комната без окна невозможна
    for (const r of rooms) {
      const min = Math.min(r.w, r.h);
      const lim = r.tag === 'quiet' ? LIMITS.quietMin : LIMITS.roomMin;
      if (min < lim) E(L, `«${r.name}» ${min} мм по узкой стороне, нужно ${lim}`);
      if (r.tag === 'quiet' && !wins.some(w => overlap(windowBand(w, S, 300), r) > 1000))
        E(L, `«${r.name}» без естественного света не может быть жилой комнатой`);
    }

    // 18. шахта стояка внутри мокрого помещения и свободна от оборудования
    if (L.riser) {
      const q = L.riser;
      if (Math.min(q.w, q.h) < 250 || Math.max(q.w, q.h) < LIMITS.riserMin)
        E(L, `шахта стояка ${q.w} × ${q.h} мельче ${LIMITS.riserMin} × 250`);
      const wet = rooms.filter(r => r.tag === 'wet');
      if (!wet.some(r => inside(q, r))) E(L, 'шахта стояка не лежит целиком в мокром помещении');
      for (const f of furn)
        if (overlap(q, box(f)) > 0) E(L, `${f.l || f.t} стоит на шахте стояка`);
    } else if (rooms.some(r => r.tag === 'wet')) E(L, 'у мокрого помещения не задана шахта стояка');

    // 18а. дымоходы: сквозная шахта от прибора до кровли, ничем не занятая
    for (const f of L.flues || []) {
      if (Math.min(f.w, f.h) < LIMITS.flueMin) E(L, `дымоход ${f.w} × ${f.h} мельче ${LIMITS.flueMin}`);
      if (f.outside) {
        // наружный дымоход: снаружи оболочки и вплотную к ней
        if (overlap(f, rect(0, 0, S.w, S.h)) > 0) E(L, `наружный дымоход ${f.x},${f.y} заходит внутрь дома`);
        const touch = f.x + f.w === 0 || f.x === S.w || f.y + f.h === 0 || f.y === S.h;
        if (!touch) E(L, `наружный дымоход ${f.x},${f.y} не примыкает к стене`);
      } else if (!rooms.some(r => inside(f, r))) E(L, `дымоход ${f.x},${f.y} не лежит целиком в помещении`);
      for (const g of furn)
        if (overlap(f, box(g)) > 0) E(L, `${g.l || g.t} стоит на дымоходе ${f.x},${f.y}`);
      if (L.riser && overlap(f, L.riser) > 0) E(L, `дымоход ${f.x},${f.y} пересекается со стояком`);
    }

    // 18в. вентшахта: сквозная от установки в цоколе до кровли, внутри
    // помещения и ничем не занятая
    for (const d of L.ducts || []) {
      if (Math.min(d.w, d.h) < LIMITS.ductMin) E(L, `вентшахта ${d.w} × ${d.h} мельче ${LIMITS.ductMin}`);
      if (!rooms.some(r => inside(d, r))) E(L, `вентшахта ${d.x},${d.y} не лежит целиком в помещении`);
      for (const g of furn)
        if (overlap(d, box(g)) > 0) E(L, `${g.l || g.sym} стоит на вентшахте`);
      if (L.riser && overlap(d, L.riser) > 0) E(L, `вентшахта ${d.x},${d.y} пересекается со стояком`);
    }

    // 18б. подпись оборудования: влезает по ширине, лежит в своём помещении
    // и не наезжает на соседнюю мебель
    for (const f of furn) {
      const d = furnText(f);
      if (!d) continue;
      if (!d.fits) { E(L, `подпись «${d.t}» не влезает под контур ${f.x},${f.y} — короче слово или крупнее предмет`); continue; }
      const lb = textBox(d);
      const host = rooms.find(r => overlap(box(f), r) > 0.98 * area(box(f)));
      if (host && !inside(lb, host)) E(L, `подпись «${d.t}» вылезает за «${host.name}»`);
      for (const g of furn)
        if (g !== f && overlap(shrink(lb, 15), box(g)) > 0) E(L, `подпись «${d.t}» наезжает на ${g.l || g.sym || g.t}`);
      for (const q of [L.riser, ...(L.ducts || []), ...(L.flues || []).filter(x => !x.outside)])
        if (q && overlap(shrink(lb, 15), q) > 0) E(L, `подпись «${d.t}» наезжает на шахту ${q.x},${q.y}`);
    }

    // 19. блок подписи помещения лежит в своём помещении и не наезжает на мебель
    const obstacles = furn.map(box);
    if (L.stair) obstacles.push(stairRun(L.stair));
    if (L.riser) obstacles.push(L.riser);
    for (const d of L.ducts || []) obstacles.push(d);
    for (const f of L.flues || []) if (!f.outside) obstacles.push(f);
    for (const r of rooms) {
      const b = roomBlock(r).box;
      if (!inside(b, r)) E(L, `подпись «${r.name}» вылезает за границы помещения`);
      for (const o of obstacles)
        if (overlap(shrink(b, 20), o) > 0) E(L, `подпись «${r.name}» наезжает на мебель`);
    }

    // 25. у каждого элемента есть свой идентификатор. Развёртки по электрике
    // и сантехнике будут ссылаться на стену, прибор и проём по нему: имя
    // помещения и порядок в массиве меняются, идентификатор — нет
    for (const [what, list] of [['стена', walls], ['помещение', rooms],
    ['проём', opens], ['окно', wins], ['мебель', furn]]) {
      for (const el of list) {
        if (!el.id) { E(L, `${what} ${el.x},${el.y} без идентификатора`); continue; }
        if (ids.has(el.id)) E(L, `идентификатор ${el.id} повторяется`);
        ids.add(el.id);
      }
    }

    // 26. высоты: проём умещается под потолок, дверь не ниже человека,
    // ни один предмет не выше чистой высоты этажа
    for (const o of opens) {
      const hz = o.hz || 0;
      if (hz < LIMITS.doorHzMin) E(L, `проём ${o.x},${o.y} высотой ${hz} ниже ${LIMITS.doorHzMin}`);
      if (hz > L.clear) E(L, `проём ${o.x},${o.y} высотой ${hz} не влезает под потолок ${L.clear}`);
    }
    for (const w of wins) {
      const sill = w.sill || 0, hz = w.hz || 0;
      if (hz <= 0) E(L, `окно ${w.side} ${w.a}–${w.b} без высоты`);
      else if (sill + hz > L.clear) E(L, `окно ${w.side} ${w.a}–${w.b}: верх ${sill + hz} выше потолка ${L.clear}`);
      if ((w.kind === 'entrance' || w.kind === 'door') && (sill > 0 || hz < LIMITS.doorHzMin))
        E(L, `дверь ${w.side} ${w.a}–${w.b}: порог ${sill}, высота ${hz}`);
    }
    for (const f of furn)
      if ((f.hz || 0) > L.clear)
        E(L, `${f.l || f.sym} высотой ${f.hz} не встаёт под потолок ${L.clear}`);

    // 27. света в жилой комнате не меньше нормы: площадь светового проёма
    // от 1/8 площади пола
    for (const r of rooms) {
      if (r.tag !== 'quiet') continue;
      const glass = wins.filter(w => !w.kind && overlap(windowBand(w, S, 300), r) > 1000)
        .reduce((s, w) => s + (w.b - w.a) * (w.hz || 0), 0);
      const need = r.w * r.h / LIMITS.glazingRatio;
      if (glass < need)
        E(L, `«${r.name}»: остекление ${(glass / 1e6).toFixed(1)} м² меньше нормы ${(need / 1e6).toFixed(1)} м²`);
    }

    // 28. размерная цепочка описывает то, что нарисовано. Цифра в цепочке
    // берётся из данных и на чертёж попадает как есть: разъехаться с осью
    // стены она может молча, а читают чертёж именно по ней
    for (const [axis, size] of [['x', S.w], ['y', S.h]]) {
      const arr = (L.dims && L.dims[axis]) || [];
      if (arr.length < 2 || arr[0] !== 0 || arr[arr.length - 1] !== size)
        E(L, `цепочка ${axis} не от 0 до ${size}`);
      for (let i = 1; i < arr.length; i++)
        if (arr[i] <= arr[i - 1]) E(L, `цепочка ${axis} идёт назад на ${arr[i]}`);
      for (const v of arr.slice(1, -1)) {
        const hit = walls.some(w => {
          const [a, b] = axis === 'x' ? [w.x, w.x + w.w] : [w.y, w.y + w.h];
          return Math.abs((a + b) / 2 - v) <= 10;
        });
        if (!hit) E(L, `отметка ${v} в цепочке ${axis} не совпадает ни с одной осью стены`);
      }
    }

    // 20. ни одна подпись листа не наезжает на другую
    const boxes = labelBoxes(house, L);
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++)
        if (overlap(shrink(boxes[i], LIMITS.labelClear), shrink(boxes[j], LIMITS.labelClear)) > 0)
          E(L, `подписи наезжают: ${boxes[i].kind} «${boxes[i].owner}» и ${boxes[j].kind} «${boxes[j].owner}»`);
  }

  // 14. мокрые помещения строго друг над другом
  const wets = house.levels.map(L => ({ L, r: L.rooms.filter(r => r.tag === 'wet') }));
  for (let i = 1; i < wets.length; i++) {
    const a = wets[i - 1], b = wets[i];
    if (!a.r.length || !b.r.length) continue;
    const ok = a.r.some(x => b.r.some(y => { const it = inter(x, y); return it.w >= LIMITS.wetOverlapMin && it.h >= LIMITS.wetOverlapMin; }));
    if (!ok) errs.push(`мокрые помещения «${a.L.title}» и «${b.L.title}» не совпадают по вертикали — потребуется второй стояк`);
  }

  // 21. лестница, стояк и дымоходы стоят в одной шахте на всех уровнях
  const same = (a, b) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
  for (const [what, get] of [['лестницы', L => L.stair], ['стояка', L => L.riser]]) {
    const shafts = house.levels.map(get).filter(Boolean);
    for (let i = 1; i < shafts.length; i++)
      if (!same(shafts[i - 1], shafts[i]))
        errs.push(`шахта ${what} не совпадает между уровнями ${i} и ${i + 1}`);
  }
  for (const [what, key] of [['дымоходов', 'flues'], ['вентшахт', 'ducts']])
    for (let i = 1; i < house.levels.length; i++) {
      const a = house.levels[i - 1][key] || [], b = house.levels[i][key] || [];
      if (a.length !== b.length) { errs.push(`число ${what} расходится между уровнями ${i} и ${i + 1}`); continue; }
      a.forEach((f, k) => { if (!same(f, b[k])) errs.push(`шахта ${k + 1} (${what}) не совпадает между уровнями ${i} и ${i + 1}`); });
    }

  // 23. мокрое помещение не встаёт над жилой комнатой
  for (let i = 1; i < house.levels.length; i++) {
    const below = house.levels[i - 1].rooms.filter(r => r.tag === 'quiet');
    for (const w of house.levels[i].rooms.filter(r => r.tag === 'wet'))
      for (const q of below)
        if (overlap(w, q) > 10000)
          errs.push(`${house.levels[i].title}: «${w.name}» стоит над жилой «${q.name}»`);
  }

  // 22. габарит дома совпадает с заданием
  if (brief && brief.shell) {
    if (brief.shell.w !== S.w || brief.shell.h !== S.h)
      errs.push(`габарит ${S.w} × ${S.h} расходится с заданием ${brief.shell.w} × ${brief.shell.h}`);
    if (brief.garageDepthMin) {
      for (const L of house.levels)
        for (const r of L.rooms)
          if (r.tag === 'garage' && r.h < brief.garageDepthMin)
            errs.push(`${L.title}: гараж ${r.h} мм в глубину, задание требует ${brief.garageDepthMin}`);
    }

    // 24. остальные фиксированные пункты задания. Раньше проверялись только
    // габарит и глубина гаража, а прочие пять пунктов не проверял никто:
    // из данных можно было убрать гардеробную или машину и получить чистый прогон
    const c = brief.checks || {};
    const allRooms = house.levels.flatMap(L => L.rooms);
    const allFurn = house.levels.flatMap(L => L.furniture || []);

    if (c.cars) {
      const n = allFurn.filter(f => f.sym === 'car').length;
      if (n < c.cars) errs.push(`машин в гараже ${n}, задание требует ${c.cars}`);
    }
    if (c.wardrobe && !allRooms.some(r => r.tag === 'wardrobe'))
      errs.push('задание требует гардеробную, в доме её нет');
    for (const bad of c.forbidRooms || [])
      if (allRooms.some(r => r.name.includes(bad)))
        errs.push(`«${bad}» есть в доме, а задание его не предусматривает`);
    if (c.entranceSide) {
      const ent = house.levels.flatMap(L => L.windows || []).filter(w => w.kind === 'entrance');
      if (!ent.length) errs.push('входной двери нет ни на одном уровне');
      for (const w of ent)
        if (w.side !== c.entranceSide)
          errs.push(`вход со стороны ${w.side}, задание требует только с ${c.entranceSide} — с веранды`);
    }
    if (c.masterInFarHalf) {
      const master = allRooms.find(r => r.role === 'master');
      if (!master) errs.push('спальня хозяев не отмечена ролью master');
      else if (master.y + master.h / 2 < S.h / 2)
        errs.push(`спальня хозяев «${master.name}» стоит в уличной половине дома`);
    }
  }

  return errs;
}
