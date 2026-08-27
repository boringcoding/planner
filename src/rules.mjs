// Правила проверки планировки. Каждый найденный дефект добавляется сюда,
// а не чинится единичной правкой координаты.

import { labelBoxes, roofLabelBoxes, facadeLabelBoxes, sectionLabelBoxes, FACADE_SIDES, roomBlock, furnText, textBox, stairGeom } from './render.mjs';
import { roofGeom, flueTop, roofHoles, verandaGeom, pitGeom, porchGeom, outsideBits, plotMargins } from './roof.mjs';
import { plotGeom } from './plot.mjs';
import { tempGeom } from './temp.mjs';
import { tour } from './tour.mjs';

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
  glazingRatio: 8,         // площадь остекления жилой комнаты — не меньше 1/8 пола
  glazingMax: 4.5,         // и не больше 1/4,5: при −33 °C стекло — это дыра в стене
  glazingPano: 2,          // с панорамным окном — до половины пола, но не больше
  sillPano: 700,           // подоконник ниже — окно панорамное и помечается
  sillWet: 1400,           // подоконник в мокром помещении: не ниже, иначе видно с улицы
  sillHatch: 1200,         // люк в цоколь — под потолком, а не у пола
  roofPitch: [14, 45],     // уклон кровли: ниже 14 фальц течёт, выше 45 парусит
  roofEave: [400, 1000],   // карнизный свес
  flueOverRoof: 2000,      // выше — труба просит растяжек, а не «так сойдёт»
  canopyClear: 2200,       // низ прогона навеса веранды над настилом
  deckStep: 80,            // перепад от порога до настила веранды — отбойник, не ступень
  snowToSill: 100,         // от верха снегового мешка до подоконника окна над навесом
  pitToDoor: 800,          // от края приямка до наружной двери на той же стене
  pitToPorch: 600,         // от бетонного борта приямка до края крыльца
  pitFreeboard: 150,       // порог люка выше дна приямка: запас, пока не потечёт в дом
  pitKerb: 50,             // борт крышки выше отмостки, иначе талая вода идёт в яму
  porchRise: [120, 200],   // подъём ступени крыльца
  porchDepth: 1200,        // глубина площадки перед дверью, открывающейся наружу
  chuteSlope: [30, 45],    // уклон лотка: положе — дрова не едут, круче — летят мимо люка
  chuteHead: 300,          // от верхней кромки лотка до крышки: куда сбрасывать
  hatchOverWood: 0.5,      // доля люка, обязанная попасть на поленницу
  porchStep: 150,          // перепад больше — уже не порог, а крыльцо со ступенями
  facadeGap: 400,          // между любыми двумя выносами на одной стене
  yardPass: 1200,          // ровная земля между самым дальним выносом и границей
  body: 550,               // ширина тела, которым проверяется проходимость пола
  nook: 0.5e6,             // клочок свободного пола мельче — щель, а не проход
  facadeAxisSnap: 600,     // оси окон соседних этажей: совпали или разведены не меньше
  roomAxisSnap: 400,       // окно почти по центру помещения ставится в центр точно
  lowSill: 600,            // ниже — окно выше первого этажа требует ограждения
  guardRail: 900,          // высота ограждения: низкие окна, марши, настилы
  entranceW: 900,          // ширина входной двери — эвакуационный выход
  doorW: 800,              // межкомнатная дверь
  wetDoorW: 700,           // дверь в санузел
  clearLive: 2500,         // чистая высота уровня с жилыми помещениями
  clearService: 2100,      // и любого другого
  stairW: 900,             // ширина марша
  stairHead: 2000,         // от ступени до низа перекрытия над маршем
  stairStep: [600, 650],   // формула удобства 2r + t
  carBay: [2500, 5300],    // машиноместо на створку ворот: ширина и глубина
  apronMin: 800,           // ширина отмостки
  jambMin: 100,            // простенок от наружного проёма до примыкающей стены
  redLine: 5000,           // от красной линии до жилого дома
  sideSetback: 3000,       // от прочих границ до жилого строения
  fireGapStone: 6000,      // разрыв между двумя несгораемыми домами (СП 4.13130)
  fireGapWood: 10000,      // камень — дерево: деревянной времянке тут не встать
  septicToHouse: 5000,     // от станции очистки до жилого дома
  septicToBorder: 1000,    // до границ участка, включая уличную
  septicService: 5000,     // не дальше этого от красной линии: обслуживание с улицы
  gateW: 3500,             // въездные ворота: проезд пожарной машины
  wicketW: 1000,           // калитка
  gateAxisSnap: 150,       // ось въезда против оси гаражного фронта
  lintelMax: 3200,         // шире — не перемычка и не монолитный участок, а балка
  tempAir: 200             // продух между землёй и низом ростверка времянки
};

// шкафы и стеллажи ставят рядами, между рядами нужен проход. Ванна рядом
// со стиральной колонной — не ряд, а ниша: правило о проходе к ней не относится
const STORAGE = new Set(['rack', 'wardrobe', 'dresser']);
// назначение помещения: жилое, бытовое, техническое
export const USE = new Set(['live', 'service', 'tech']);
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
const grow = (r, mx, my = mx) => rect(r.x - mx, r.y - my, r.w + 2 * mx, r.h + 2 * my);
const openingRect = o => o.dir === 'h' ? rect(o.x, o.y, o.w, o.t) : rect(o.x, o.y, o.t, o.w);
const stairRun = st => { const g = stairGeom(st); return rect(g.runX0, st.y, g.run, st.h); };
const stairLanding = st => { const g = stairGeom(st); return rect(g.landX0, st.y, g.landing, st.h); };

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

// Свободный пол помещения, разложенный по клеткам 50 мм: клетка проходима,
// если тело шириной LIMITS.body, поставленное в её центр, не задевает ни
// стену помещения, ни предмет. Дальше заливка — и станет видно, что пол
// распался на карманы. Закуток мельче LIMITS.nook — не проход, а щель,
// и в связности он не участвует
function passable(r, obst) {
  const S = 50, m = LIMITS.body / 2;
  const nx = Math.floor(r.w / S), ny = Math.floor(r.h / S);
  const at = (i, j) => [r.x + i * S + S / 2, r.y + j * S + S / 2];
  const free = (i, j) => {
    const [x, y] = at(i, j);
    if (x - m < r.x || x + m > r.x + r.w || y - m < r.y || y + m > r.y + r.h) return false;
    return !obst.some(o => x + m > o.x && x - m < o.x + o.w && y + m > o.y && y - m < o.y + o.h);
  };
  const id = new Int32Array(nx * ny).fill(-1), size = [];
  let comp = 0;
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    if (id[i * ny + j] >= 0 || !free(i, j)) continue;
    const st = [[i, j]]; id[i * ny + j] = comp;
    let n = 0;
    while (st.length) {
      const [a, b] = st.pop(); n++;
      for (const [da, db] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const p = a + da, q = b + db;
        if (p < 0 || q < 0 || p >= nx || q >= ny || id[p * ny + q] >= 0 || !free(p, q)) continue;
        id[p * ny + q] = comp; st.push([p, q]);
      }
    }
    size[comp++] = n * S * S;
  }
  return {
    touch(z) {
      const hit = new Set();
      const i0 = Math.max(0, Math.floor((z.x - r.x) / S)), i1 = Math.min(nx - 1, Math.ceil((z.x + z.w - r.x) / S));
      const j0 = Math.max(0, Math.floor((z.y - r.y) / S)), j1 = Math.min(ny - 1, Math.ceil((z.y + z.h - r.y) / S));
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const c = id[i * ny + j];
        if (c < 0 || size[c] < LIMITS.nook) continue;
        const [x, y] = at(i, j);
        if (x > z.x && x < z.x + z.w && y > z.y && y < z.y + z.h) hit.add(c);
      }
      return [...hit];
    }
  };
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
      // 12а. машиноместо по СП 113: ширина створки
      if (g.b - g.a < LIMITS.carBay[0]) E(L, `створка ${g.b - g.a} мм уже машиноместа ${LIMITS.carBay[0]}`);
    }
    // глубина по ходу заезда — один раз на этаж, а не на каждую створку
    if (gates.length) {
      const bay = rooms.find(r => r.tag === 'garage');
      const depth = bay && (gates[0].side === 'S' || gates[0].side === 'N' ? bay.h : bay.w);
      if (bay && depth < LIMITS.carBay[1])
        E(L, `гараж ${depth} мм в глубину, машиноместу нужно ${LIMITS.carBay[1]}`);
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
      // площадка — остаток шахты за маршем, а не отдельное число:
      // держать два независимых размера значит однажды их разъехать
      const g = stairGeom(st);
      if (g.landing < st.landing) E(L, `площадка ${g.landing} меньше заданной ${st.landing}: марш ${g.run} не влезает в шахту ${st.w}`);
      if (g.landing < g.width) E(L, `площадка ${g.landing} уже марша ${g.width}`);
      // 13а. ширина марша, формула удобства и высота над головой: всё это
      // держалось на текущих числах и уехало бы молча при любой правке шахты
      if (g.width < LIMITS.stairW) E(L, `марш ${g.width} мм уже ${LIMITS.stairW}`);
      const step = 2 * rise + st.tread;
      if (other && (step < LIMITS.stairStep[0] || step > LIMITS.stairStep[1]))
        E(L, `лестница неудобна: 2·${rise} + ${st.tread} = ${step}, норма ${LIMITS.stairStep.join('…')}`);
      // над маршем — вырез в перекрытии; головой встречают его торец
      if (house.levels[i + 1]) {
        const head = house.levels[i + 1].base - L.base - (L.floorToFloor - L.clear);
        if (head < LIMITS.stairHead) E(L, `над маршем ${head} мм до перекрытия, нужно ${LIMITS.stairHead}`);
        // 13в. отметки стыкуются: base следующего уровня обязан быть ровно
        // base + floorToFloor этого — иначе высоты по дому врут молча
        const drift = house.levels[i + 1].base - L.base - L.floorToFloor;
        if (drift !== 0)
          E(L, `отметки разъехались: base «${house.levels[i + 1].title}» ушёл на ${drift} от base + floorToFloor`);
        // 13б. марш с перепадом в этаж без ограждения — падение, а не спуск
        if (!st.rail || st.rail < LIMITS.guardRail)
          E(L, `ограждение марша ${st.rail || 'не задано'}, нужно ${LIMITS.guardRail}`);
      }
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
        // 16б. дверь из гаража в дом — противопожарная. Флаг в данных был,
        // а правила не было: убери его — и прогон оставался чистым
        if (other && !o.fire)
          E(L, `дверь ${o.x},${o.y} из гаража в «${other.name}» не помечена противопожарной`);
      }
      // стена между гаражом и домом — противопожарная по всей длине и толщине.
      // Проверяется разделение, а не отдельная стена: слоёная стенка из двух
      // записей без метки не прячется за соседкой, а торец перпендикулярной
      // стены, доведённой до гаража, не ловит ложняк — его накрывает соседняя
      const fireWalls = walls.filter(w => w.fire);
      for (const rm of rooms) {
        if (rm === garage) continue;
        // полоса между гаражом и помещением: проекции пересекаются по одной
        // оси, по другой между гранями зазор не толще стены
        const ix = inter(garage, rm);
        let band = null;
        if (ix.w > 0 && ix.h <= 0 && -ix.h <= 400) band = rect(ix.x, Math.min(garage.y + garage.h, rm.y + rm.h), ix.w, -ix.h);
        if (ix.h > 0 && ix.w <= 0 && -ix.w <= 400) band = rect(Math.min(garage.x + garage.w, rm.x + rm.w), ix.y, -ix.w, ix.h);
        if (!band || area(band) === 0) continue;
        // разрез полосы гранями противопожарных стен: каждая клетка обязана
        // попасть в одну из них
        const cuts = k => [...new Set([band[k.a], band[k.a] + band[k.s],
        ...fireWalls.flatMap(w => [w[k.a], w[k.a] + w[k.s]])])]
          .filter(v => v >= band[k.a] && v <= band[k.a] + band[k.s]).sort((a, b) => a - b);
        const xs = cuts({ a: 'x', s: 'w' }), ys = cuts({ a: 'y', s: 'h' });
        let bad = null;
        for (let i = 0; i + 1 < xs.length && !bad; i++)
          for (let j = 0; j + 1 < ys.length && !bad; j++) {
            const cx = (xs[i] + xs[i + 1]) / 2, cy = (ys[j] + ys[j + 1]) / 2;
            if ((xs[i + 1] - xs[i]) * (ys[j + 1] - ys[j]) < 100) continue;
            if (!fireWalls.some(w => cx > w.x && cx < w.x + w.w && cy > w.y && cy < w.y + w.h))
              bad = `${Math.round(xs[i])},${Math.round(ys[j])}`;
          }
        if (bad) E(L, `стена между гаражом и «${rm.name}» у ${bad} не помечена противопожарной`);
      }
    }

    // 16а. У помещения есть назначение. Площадь «жилая» считается по нему,
    // а не по имени: имя правится в один клик, и итог поедет молча
    for (const r of rooms)
      if (!USE.has(r.use)) E(L, `«${r.name}»: назначение «${r.use || '—'}» не из списка ${[...USE].join(', ')}`);

    // 17. минимальный размер помещения; жилая комната без окна невозможна
    for (const r of rooms) {
      const min = Math.min(r.w, r.h);
      const lim = r.tag === 'quiet' ? LIMITS.quietMin : LIMITS.roomMin;
      if (min < lim) E(L, `«${r.name}» ${min} мм по узкой стороне, нужно ${lim}`);
      if (r.tag === 'quiet' && !wins.some(w => overlap(windowBand(w, S, 300), r) > 1000))
        E(L, `«${r.name}» без естественного света не может быть жилой комнатой`);
      // 17а. это касается любого помещения, посчитанного в жилую площадь:
      // «зона отдыха» в цоколе без единого окна сидела в 87 м² жилой
      if (r.use === 'live' && r.tag !== 'quiet'
        && !wins.some(w => !w.kind && overlap(windowBand(w, S, 300), r) > 1000))
        E(L, `«${r.name}» числится жилым (use: live), а естественного света нет`);
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
      // 26а. ширина: в санузел уже, межкомнатная не меньше нормы, открытый
      // проём — тоже проход и меньше двери быть не может. Ширина нигде
      // не проверялась — только высоты
      {
        const r = openingRect(o);
        const grown = o.dir === 'h' ? rect(r.x, r.y - 150, r.w, r.h + 300) : rect(r.x - 150, r.y, r.w + 300, r.h);
        const wet = rooms.some(rm => rm.tag === 'wet' && overlap(grown, rm) > 1000);
        const lim = wet && o.kind !== 'pass' ? LIMITS.wetDoorW : LIMITS.doorW;
        if (o.w < lim) E(L, `${o.kind === 'pass' ? 'проём' : 'дверь'} ${o.x},${o.y} шириной ${o.w}, нужно ${lim}`);
      }
    }
    for (const w of wins) {
      const sill = w.sill || 0, hz = w.hz || 0;
      if (hz <= 0) E(L, `окно ${w.side} ${w.a}–${w.b} без высоты`);
      else if (sill + hz > L.clear) E(L, `окно ${w.side} ${w.a}–${w.b}: верх ${sill + hz} выше потолка ${L.clear}`);
      if ((w.kind === 'entrance' || w.kind === 'door') && (sill > 0 || hz < LIMITS.doorHzMin))
        E(L, `дверь ${w.side} ${w.a}–${w.b}: порог ${sill}, высота ${hz}`);
      // 26б. входная дверь — эвакуационный выход, 800 в проёме мало
      if (w.kind === 'entrance' && w.b - w.a < LIMITS.entranceW)
        E(L, `входная дверь ${w.id} шириной ${w.b - w.a}, эвакуационному выходу нужно ${LIMITS.entranceW}`);
      if (w.kind === 'door' && w.b - w.a < LIMITS.doorW)
        E(L, `наружная дверь ${w.id} шириной ${w.b - w.a}, нужно ${LIMITS.doorW}`);
    }
    for (const f of furn)
      if ((f.hz || 0) > L.clear)
        E(L, `${f.l || f.sym} высотой ${f.hz} не встаёт под потолок ${L.clear}`);

    // 26в. высота этажа в чистоте: жилым помещениям — своя норма, прочим —
    // своя. Сравнивать L.clear с минимумом не приходило в голову никому
    {
      const lim = rooms.some(r => r.use === 'live') ? LIMITS.clearLive : LIMITS.clearService;
      if (L.clear < lim) E(L, `высота в чистоте ${L.clear}, помещениям уровня нужно ${lim}`);
    }

    // 27. света в жилой комнате не меньше нормы: площадь светового проёма
    // от 1/8 площади пола. И не больше 1/4,5: при расчётной −33 °C лишнее
    // стекло — это не «светло», а дыра в стене. Панорамное окно — решение,
    // оно помечено в данных, и тогда потолок другой
    for (const r of rooms) {
      if (r.tag !== 'quiet') continue;
      const mine = wins.filter(w => !w.kind && overlap(windowBand(w, S, 300), r) > 1000);
      const glass = mine.reduce((s, w) => s + (w.b - w.a) * (w.hz || 0), 0);
      const pano = mine.some(w => w.pano);
      const need = r.w * r.h / LIMITS.glazingRatio;
      const most = r.w * r.h / (pano ? LIMITS.glazingPano : LIMITS.glazingMax);
      if (glass < need)
        E(L, `«${r.name}»: остекление ${(glass / 1e6).toFixed(1)} м² меньше нормы ${(need / 1e6).toFixed(1)} м²`);
      else if (glass > most)
        E(L, `«${r.name}»: остекление ${(glass / 1e6).toFixed(1)} м² больше предела ${(most / 1e6).toFixed(1)} м² — теплопотери`);
    }

    // 27а. окна этажа стоят по одной отметке верха. Разнобой по верху видно
    // на фасаде сразу, а в списке координат — никогда
    const heads = [...new Set(wins.filter(w => !w.kind).map(w => (w.sill || 0) + (w.hz || 0)))];
    if (heads.length > 1) {
      const main = heads.map(h => [h, wins.filter(w => !w.kind && (w.sill || 0) + (w.hz || 0) === h).length])
        .sort((a, b) => b[1] - a[1])[0][0];
      for (const w of wins) {
        if (w.kind) continue;
        const head = (w.sill || 0) + (w.hz || 0);
        if (head !== main) E(L, `окно ${w.id}: верх ${head}, у остальных окон этажа ${main}`);
      }
    }

    // 27б. подоконник: панорамное окно помечено, мокрое помещение не
    // просматривается с улицы, люк в цоколь — под потолком
    for (const w of wins) {
      const sill = w.sill || 0;
      if (w.kind === 'hatch') {
        if (sill < LIMITS.sillHatch) E(L, `люк ${w.id}: подоконник ${sill} ниже ${LIMITS.sillHatch}`);
        const host = rooms.find(r => overlap(windowBand(w, S, 300), r) > 1000);
        if (host && host.use !== 'tech') E(L, `люк ${w.id} ведёт в «${host.name}» — не техническое помещение`);
        continue;
      }
      if (w.kind) continue;
      if (sill < LIMITS.sillPano && !w.pano)
        E(L, `окно ${w.id}: подоконник ${sill} — это панорамное окно, его помечают pano`);
      if (w.pano && sill >= LIMITS.sillPano)
        E(L, `окно ${w.id} помечено панорамным, а подоконник ${sill}`);
      const host = rooms.find(r => overlap(windowBand(w, S, 300), r) > 1000);
      if (host && host.tag === 'wet' && sill < LIMITS.sillWet)
        E(L, `окно ${w.id} в «${host.name}»: подоконник ${sill} ниже ${LIMITS.sillWet}`);
      // 27г. подоконник ниже 600 над полом, на котором стоят, — за стеклом
      // обрыв; окно над площадкой лестницы меряется от площадки, а не от
      // отметки этажа, и первый этаж тут не исключение
      {
        let floor = 0;
        if (L.stair && overlap(windowBand(w, S, 300), stairLanding(L.stair)) > 1000
          && house.levels[house.levels.indexOf(L) + 1])
          floor = Math.round((house.levels[house.levels.indexOf(L) + 1].base - L.base) / 2);
        const drop = L.base + floor;                       // отметка пола под окном
        if (drop > 0 && sill - floor < LIMITS.lowSill && (!w.guard || w.guard < LIMITS.guardRail))
          E(L, `окно ${w.id}: подоконник ${sill - floor} над полом на отметке ${drop}, ограждение ${w.guard || 'не задано'} — нужно ${LIMITS.guardRail}`);
      }
    }

    // 26г. простенок между наружным проёмом и внутренней стеной, примыкающей
    // к тому же фасаду: перерезанный стеной проём или нулевая кладка между
    // ними — нереализуемый узел, которого на плане не видно
    for (const w of wins) {
      for (const q of walls) {
        const abut = w.side === 'S' ? q.y <= S.wall + 1
          : w.side === 'N' ? q.y + q.h >= S.h - S.wall - 1
            : w.side === 'W' ? q.x <= S.wall + 1 : q.x + q.w >= S.w - S.wall - 1;
        if (!abut) continue;
        const band = w.side === 'S' || w.side === 'N' ? [q.x, q.x + q.w] : [q.y, q.y + q.h];
        const gap = Math.max(band[0] - w.b, w.a - band[1]);
        if (gap < LIMITS.jambMin && gap > -Math.min(band[1] - band[0], w.b - w.a))
          E(L, `проём ${w.id} в ${Math.max(0, Math.round(gap))} мм от стены ${q.id} — простенку нужно ${LIMITS.jambMin}`);
      }
    }

    // 27в. входная дверь ведёт в тамбур, а не сразу в дом
    for (const w of wins) {
      if (w.kind !== 'entrance') continue;
      const host = rooms.find(r => overlap(windowBand(w, S, 300), r) > 1000);
      if (!host) { E(L, `входная дверь ${w.id} никуда не ведёт`); continue; }
      if (host.tag !== 'lock') E(L, `входная дверь ${w.id} ведёт прямо в «${host.name}» — нужен тамбур`);
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

    // 29. свободный пол помещения связен: от каждого проёма до каждого
    // предмета можно пройти телом 550 мм, не переступая через мебель.
    // Попарные проходы этого не ловят: каждый зазор по отдельности шире
    // нормы, а вместе они образуют два кармана без связи между собой
    for (const r of rooms) {
      if (r.tag === 'stair') continue;
      // предмет высотой 0 — трап в полу — телу не мешает
      const obst = [...furn.filter(f => f.hz !== 0).map(box), L.riser, ...(L.ducts || []),
      ...(L.flues || []).filter(f => !f.outside)].filter(Boolean);
      const cells = passable(r, obst);
      // зона подхода растягивается только поперёк проёма: растянутая вдоль,
      // она обошла бы торец стены и «привязала» бы к помещению чужую дверь
      const across = (o, d) => o.dir === 'h' ? grow(openingRect(o), 0, d) : grow(openingRect(o), d, 0);
      const anchors = [
        ...opens.map(o => ({ id: `проём ${o.id}`, own: across(o, 200), z: across(o, 600) })),
        ...wins.filter(w => w.kind === 'entrance' || w.kind === 'door')
          .map(w => ({ id: `дверь ${w.id}`, own: windowBand(w, S, 200), z: windowBand(w, S, 900) })),
        ...furn.map(f => ({ id: `«${f.l || f.sym || f.id}»`, own: box(f), z: grow(box(f), 400) }))
      ].filter(a => overlap(a.own, r) > 1000);
      const comps = anchors.map(a => ({ ...a, c: cells.touch(a.z) }));
      const lost = comps.filter(a => !a.c.length);
      const all = new Set(comps.flatMap(a => a.c));
      if (lost.length)
        E(L, `«${r.name}»: к ${lost[0].id} не подойти телом ${LIMITS.body} мм`);
      else if (all.size > 1)
        E(L, `«${r.name}»: свободный пол разрезан на ${all.size} части — ` +
          `${comps.filter(a => a.c[0] !== comps[0].c[0]).map(a => a.id).join(', ')} в отдельной`);
    }

    // 20. ни одна подпись листа не наезжает на другую
    const boxes = labelBoxes(house, L);
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++)
        if (overlap(shrink(boxes[i], LIMITS.labelClear), shrink(boxes[j], LIMITS.labelClear)) > 0)
          E(L, `подписи наезжают: ${boxes[i].kind} «${boxes[i].owner}» и ${boxes[j].kind} «${boxes[j].owner}»`);
  }

  // 29. кровля. Её не было вовсе, и это было видно только в тексте:
  // «чего в выгрузке нет и не появится само». Теперь она есть, а значит
  // и проверяется — уклон, свес, трубы над скатом, отступ от границы
  if (!house.roof) errs.push('кровли в модели нет');
  else {
    const R = house.roof, g = roofGeom(house);
    if (R.pitch < LIMITS.roofPitch[0] || R.pitch > LIMITS.roofPitch[1])
      errs.push(`уклон кровли ${R.pitch}°, норма ${LIMITS.roofPitch.join('…')}`);
    if (R.eave < LIMITS.roofEave[0] || R.eave > LIMITS.roofEave[1])
      errs.push(`карнизный свес ${R.eave}, норма ${LIMITS.roofEave.join('…')}`);
    if (R.base < S.h * 0 + house.levels[house.levels.length - 1].base + house.levels[house.levels.length - 1].clear)
      errs.push(`мауэрлат на ${R.base} ниже потолка верхнего этажа`);
    const setback = (house.project && house.project.plot && house.project.plot.setback) || 0;
    if (setback && R.eave > setback / 3)
      errs.push(`свес ${R.eave} съедает больше трети отступа ${setback} до границы`);
    // труба, поднятая над скатом слишком высоко, — это растяжки и парусность.
    // Ловится именно приставная труба у карниза: чем дальше от конька, тем выше
    for (const f of (house.levels[house.levels.length - 1].flues || [])) {
      const over = flueTop(house, f) - Math.round(g.zAt(f.x + f.w / 2, f.y + f.h / 2));
      if (over > LIMITS.flueOverRoof)
        errs.push(`дымоход ${f.id} поднимается на ${over} мм над скатом, предел ${LIMITS.flueOverRoof}`);
    }
    // всё, что торчит сквозь кровлю, обязано быть внутри её контура:
    // труба за краем свеса — это отдельно стоящая труба, а не проход
    const holes = roofHoles(house);
    const shafts = [...(house.levels[house.levels.length - 1].flues || []),
    ...(house.levels[house.levels.length - 1].ducts || [])];
    for (const q of shafts)
      if (!holes.some(h => h.x === q.x && h.y === q.y))
        errs.push(`шахта ${q.id} стоит вне контура кровли — она ничем не накрыта`);
    // снегозадержание там, где под карнизом ходят: вход, дверь гаража, люк
    const underEave = house.levels.flatMap(L => (L.windows || [])
      .filter(w => w.kind === 'entrance' || w.kind === 'door' || w.kind === 'hatch')
      .filter(w => (w.side === 'W' || w.side === 'E') === g.alongY));
    if (underEave.length && !R.snowGuard)
      errs.push(`под карнизом ${underEave.length} проёмов, а снегозадержания нет`);

    // 29а. Коньковый прогон опирается на стойки, стойки — на стену, а не
    // на перекрытие. В данных лежал прогон 200×100 по стойкам 150×150, и
    // смета за него платила; под линией конька несущей стены нет на всю длину —
    // над спальней хозяев её нет вовсе. Схема с прогоном разрешена только
    // тогда, когда стена под коньком есть от торца до торца
    if (R.purlin || R.post) {
      const top = house.levels[house.levels.length - 1];
      const cov = (top.walls || []).filter(w => w.kind === 'bearing')
        .filter(w => g.alongY ? w.x <= g.ridge.x1 && w.x + w.w >= g.ridge.x1
          : w.y <= g.ridge.y1 && w.y + w.h >= g.ridge.y1)
        .reduce((s, w) => s + (g.alongY ? w.h : w.w), 0);
      const need = g.alongY ? S.h - 2 * S.wall : S.w - 2 * S.wall;
      if (cov < need)
        errs.push(`коньковый прогон опирать не на что: несущей стены под коньком ${cov} из ${need}`);
    }
    // затяжка есть — значит ферма висячая, и прогон ей не нужен
    if (!R.tie && !R.purlin) errs.push('стропильная схема не задана: ни затяжки, ни прогона');
  }

  // 30. веранда — конструкция, а не пунктир: настил ниже порога, под навесом
  // можно пройти, навес не режет окна этажа выше
  const V = verandaGeom(house);
  if (V) {
    const { v } = V;
    if (v.deck >= 0) errs.push(`настил веранды на ${v.deck} — вода пойдёт в дом`);
    // 30а. Проход меряется под прогоном, а не под плоскостью навеса: головой
    // встречают прогон. Раньше правило мерило по скату и было на 200 добрее,
    // чем жизнь
    if (V.beamClear < LIMITS.canopyClear)
      errs.push(`под прогоном навеса ${V.beamClear} мм, нужно ${LIMITS.canopyClear}`);
    // 30б. Настил у входной двери — водоотбойная ступень, а не спотыкач:
    // из единственного входа в дом шагают вниз ровно здесь
    for (const L of house.levels)
      for (const w of (L.windows || []).filter(x => x.kind === 'entrance' || x.kind === 'door')) {
        if (w.side !== V.wall) continue;
        if (Math.min(w.b, v.y + v.h) - Math.max(w.a, v.y) <= 0) continue;
        const step = L.base + (w.sill || 0) - (L.base + v.deck);
        if (step > LIMITS.deckStep)
          errs.push(`от порога ${w.id} до настила веранды ${step} — это ступень, а не порог`);
      }
    // 30в. Свая ниже промерзания с коэффициентом на неотапливаемое: веранду
    // не греют, и пучение работает по всей глубине
    const need = (house.site.ground ?? -300) - Math.round((house.site.frost || 0) * 1.1);
    if (house.site.frost && V.pileBottom > need)
      errs.push(`низ сваи веранды ${V.pileBottom}, промерзание ${house.site.frost} требует ${need}`);
    // 30д. настил со ступенями или с перепадом от земли ограждается;
    // заявленное ограждение не ниже нормы
    const drop = v.deck - (house.site.ground ?? -300);
    if ((v.steps || drop > 600) && (!v.rail || v.rail < LIMITS.guardRail))
      errs.push(`ограждение веранды ${v.rail || 'не задано'}, нужно ${LIMITS.guardRail}`);
    // 30г. Снеговой мешок у стены над навесом. Прежнее правило сравнивало
    // подоконник с плоскостью навеса и аттестовало как норму окно, которое
    // всю зиму стоит в сугробе: снег ложится НА навес и подпирает стену выше него
    const upper = house.levels[house.levels.length - 1];
    for (const w of upper.windows || []) {
      if (w.kind || w.side !== V.wall) continue;
      if (Math.min(w.b, v.y + v.h) - Math.max(w.a, v.y) <= 0) continue;
      const sillZ = upper.base + (w.sill || 0);
      const top = v.attach + V.snowPocket;
      if (v.attach > sillZ)
        errs.push(`навес веранды на ${v.attach} режет окно ${w.id}: подоконник ${sillZ}`);
      else if (top + LIMITS.snowToSill > sillZ)
        errs.push(`снеговой мешок над навесом до ${top}, подоконник ${w.id} на ${sillZ} — окно зимой в сугробе`);
    }
  }

  // 31. приямок люка: яма у стены не должна оказаться под дверью — из двери
  // выходят на землю, а не в яму. Ровно этот дефект и был на западном фасаде
  for (const p of pitGeom(house)) {
    const band = p.side === 'W' || p.side === 'E' ? [p.box.y, p.box.y + p.box.h] : [p.box.x, p.box.x + p.box.w];
    for (const L of house.levels)
      for (const w of L.windows || []) {
        if (w.kind !== 'door' && w.kind !== 'entrance') continue;
        if (w.side !== p.side) continue;
        const gap = Math.max(band[0] - w.b, w.a - band[1]);
        if (gap < LIMITS.pitToDoor)
          errs.push(`приямок ${p.id} в ${Math.max(0, Math.round(gap))} мм от двери ${w.id} — выход из неё в яму`);
      }
    if (p.floor >= p.ground) errs.push(`дно приямка ${p.id} на ${p.floor} не ниже земли ${p.ground}`);

    // 31а. дно ниже порога люка: этот перепад — не оплошность, а запас.
    // Забьётся дренаж — вода стоит в яме, а не идёт через порог в дровяник
    if (p.freeboard < LIMITS.pitFreeboard)
      errs.push(`приямок ${p.id}: порог люка выше дна на ${p.freeboard}, нужно ${LIMITS.pitFreeboard}`);
    // борт крышки выше отмостки: заподлицо — значит вся талая вода со стены в яме
    if (p.kerb < LIMITS.pitKerb)
      errs.push(`приямок ${p.id}: борт крышки ${p.kerb} над отмосткой, нужно ${LIMITS.pitKerb}`);
    // 31б. лоток. Без него дрова остаются лежать на дне ямы, и «падают прямо
    // к котлу» превращается в «лезь в яму и подавай через порог руками»
    const [lo, hi] = LIMITS.chuteSlope;
    if (p.chute < lo || p.chute > hi)
      errs.push(`лоток приямка ${p.id}: уклон ${p.chute}°, норма ${lo}…${hi}`);
    if (p.top - p.chuteTop < LIMITS.chuteHead)
      errs.push(`лоток приямка ${p.id}: до крышки ${p.top - p.chuteTop} мм, сбрасывать некуда`);
  }

  // 31г. отмостка: она есть, она не уже нормы, и борт приямка меряется
  // от неё не зря — плоскость наконец существует телом в модели
  {
    const A = house.site && house.site.apron;
    if (!A) errs.push('отмостки нет: вода со свесов уходит под фундамент');
    else if ((A.out ?? 0) < LIMITS.apronMin)
      errs.push(`отмостка ${A.out} мм уже ${LIMITS.apronMin}`);
  }

  // 31в. люк выходит на поленницу, а не рядом с ней. На плане люк в стене и
  // штабель дров — две независимые фигуры, и разъезжаются они молча
  for (const L of house.levels)
    for (const w of (L.windows || []).filter(x => x.kind === 'hatch')) {
      const band = windowBand(w, S, 1200);
      const wood = (L.furniture || []).filter(f => f.sym === 'firewood');
      const hit = wood.reduce((s, f) => s + overlap(band, box(f)), 0);
      if (!wood.length) { errs.push(`люк ${w.id}: в помещении нет поленницы`); continue; }
      const need = LIMITS.hatchOverWood * area(band);
      if (hit < need)
        errs.push(`люк ${w.id} попадает на поленницу на ${Math.round(100 * hit / area(band))}%, нужно ${Math.round(100 * LIMITS.hatchOverWood)}%`);
    }

  // 33. крыльцо. Порог наружной двери выше земли — это ступени, а не «дверь
  // в стене»: без них из гаража шагают в пустоту на 300 мм вниз
  for (const L of house.levels)
    for (const w of (L.windows || []).filter(x => x.kind === 'door' || x.kind === 'entrance')) {
      // с веранды шагают на настил, а не в грунт: там отсчёт от настила
      const v = L.veranda;
      const onDeck = v && (v.x >= S.w ? w.side === 'E' : w.side === 'W')
        && Math.min(w.b, v.y + v.h) - Math.max(w.a, v.y) > 0;
      const level = onDeck ? L.base + v.deck : (house.site.ground ?? -300);
      const drop = L.base + (w.sill || 0) - level;
      if (drop > LIMITS.porchStep && !w.porch)
        errs.push(`дверь ${w.id}: порог на ${drop} выше земли, а крыльца нет`);
    }
  for (const q of porchGeom(house)) {
    const [lo, hi] = LIMITS.porchRise;
    if (q.rise < lo || q.rise > hi)
      errs.push(`крыльцо ${q.id}: подъём ступени ${q.rise}, норма ${lo}…${hi}`);
    if (q.tread < LIMITS.treadMin)
      errs.push(`крыльцо ${q.id}: проступь ${q.tread} меньше ${LIMITS.treadMin}`);
    // дверь открывается наружу — полотно проходит над площадкой, и площадка
    // обязана быть глубже полотна, иначе открывающий стоит на ступени
    const d = q.horiz ? q.pad.h : q.pad.w;
    if (d < LIMITS.porchDepth)
      errs.push(`крыльцо ${q.id}: площадка ${d} мельче ${LIMITS.porchDepth} — дверь открывается над ступенью`);
  }

  // 34. выносы за наружную стену — дымоходы, приямок, крыльцо — разводятся
  // друг с другом и упираются в отступ до границы участка. По отдельности
  // каждый помещается; вместе они и составляют фасад, которого нет на плане
  const bits = outsideBits(house);
  const margins = plotMargins(house);
  for (const b of bits) {
    const margin = margins[b.side] || 0;
    if (margin && margin - b.reach < LIMITS.yardPass)
      errs.push(`${b.kind} ${b.id} вынесен на ${b.reach} — до границы остаётся ${margin - b.reach}, нужно ${LIMITS.yardPass} на проход`);
    // наружный дымоход стоит перед стеной, и окно за ним смотрит в трубу
    if (b.kind !== 'дымоход') continue;
    for (const L of house.levels)
      for (const w of L.windows || []) {
        if (w.side !== b.side) continue;
        if (Math.min(w.b, b.band[1]) - Math.max(w.a, b.band[0]) > 0)
          errs.push(`${b.kind} ${b.id} стоит перед окном ${w.id}`);
      }
  }
  for (let i = 0; i < bits.length; i++)
    for (let j = i + 1; j < bits.length; j++) {
      const a = bits[i], b = bits[j];
      if (a.side !== b.side) continue;
      const gap = Math.max(a.band[0] - b.band[1], b.band[0] - a.band[1]);
      // приямок с крыльцом разводятся шире прочего: с крыльца сходят вслепую,
      // а крышка ямы бывает откинута. 400 «на отделку» тут не годятся
      const kinds = [a.kind, b.kind];
      const need = kinds.includes('приямок') && kinds.includes('крыльцо')
        ? LIMITS.pitToPorch : LIMITS.facadeGap;
      if (gap < need)
        errs.push(`${a.kind} ${a.id} и ${b.kind} ${b.id}: по фасаду ${Math.max(0, Math.round(gap))} мм, нужно ${need}`);
    }

  // 32. лист кровли раскладывается теми же рамками, что и планы этажей,
  // и проверяется так же. Подписей на нём мало, но они привязаны к отметкам:
  // стоит поднять уклон — и «конёк +8,809» уезжает в стрелку уклона
  if (house.roof) {
    const rb = roofLabelBoxes(house);
    for (let i = 0; i < rb.length; i++)
      for (let j = i + 1; j < rb.length; j++)
        if (overlap(shrink(rb[i], LIMITS.labelClear), shrink(rb[j], LIMITS.labelClear)) > 0)
          errs.push(`кровля: подписи наезжают: ${rb[i].kind} «${rb[i].owner}» и ${rb[j].kind} «${rb[j].owner}»`);
  }

  // 40. фасады и разрез раскладываются теми же рамками, что и остальные
  // листы, и проверяются тем же способом — по каждому листу отдельно.
  // Оба листа строятся от кровли: без неё их нет, и ругается правило 29
  if (house.roof) {
    const sheets = [...FACADE_SIDES.map(([sd]) => [`фасад ${sd}`, facadeLabelBoxes(house, sd)]),
    ['разрез', sectionLabelBoxes(house)]];
    for (const [name, bx] of sheets)
      for (let i = 0; i < bx.length; i++)
        for (let j = i + 1; j < bx.length; j++)
          if (overlap(shrink(bx[i], LIMITS.labelClear), shrink(bx[j], LIMITS.labelClear)) > 0)
            errs.push(`${name}: подписи наезжают: ${bx[i].kind} «${bx[i].owner}» и ${bx[j].kind} «${bx[j].owner}»`);
  }

  // 36. фундамент — решение, а не заглушка: пирог задан в данных и не тоньше
  // разумного. Плита посчитана на стены трёх уровней, подушка дренирует,
  // подбетонка держит гидроизоляцию — убрать любое из этого молча нельзя
  {
    const F = house.foundation;
    if (!F) errs.push('фундамент не задан: пирог плиты — решение в данных, а не константа в коде');
    else {
      if ((F.slab ?? 0) < 300) errs.push(`фундаментная плита ${F.slab} тоньше 300`);
      if ((F.sand ?? 0) < 200) errs.push(`песчаная подготовка ${F.sand ?? 0} тоньше 200`);
      if ((F.lean ?? 0) < 50) errs.push(`подбетонка ${F.lean ?? 0} тоньше 50`);
      if ((F.out ?? 0) < 100) errs.push(`выпуск плиты за стену ${F.out ?? 0} меньше 100`);
    }
  }

  // 37. на холодный чердак можно попасть: люк в перекрытии верхнего этажа,
  // не мельче лаза и не поперёк затяжки — иначе он нарисован, а не existует
  if (house.roof) {
    const top = house.levels[house.levels.length - 1];
    const hq = top.atticHatch;
    if (!hq) errs.push('на чердак не попасть: люка в чердачном перекрытии нет');
    else {
      if (Math.min(hq.w, hq.h) < 450 || Math.max(hq.w, hq.h) < 500)
        errs.push(`люк на чердак ${hq.w} × ${hq.h} мельче лаза 500 × 450`);
      const g = roofGeom(house);
      const R = house.roof;
      for (let i = 0; i < g.trusses; i++) {
        const t0 = S.wall / 2 + (g.len - S.wall) * i / (g.trusses - 1);
        const band = g.alongY
          ? [t0 - R.tie[1] / 2, t0 + R.tie[1] / 2] : [t0 - R.tie[1] / 2, t0 + R.tie[1] / 2];
        const [a, b] = g.alongY ? [hq.y, hq.y + hq.h] : [hq.x, hq.x + hq.w];
        if (a < band[1] && band[0] < b)
          errs.push(`люк на чердак режет затяжку ${i + 1}: подвинуть между рядами`);
      }
    }
  }

  // 35. фасад: оси окон между этажами либо совпадают, либо разведены
  // не меньше facadeAxisSnap — «почти совпало» читается с земли как ошибка.
  // Парные ворота стоят симметрично к осям фасада. Окно, вставшее почти
  // по центру своего помещения, ставится в центр точно — если оно не
  // держит ось окна другого этажа. Подземное (люк в приямке) — не окно
  {
    const ground = house.site.ground ?? -300;
    for (const side of ['S', 'N', 'E', 'W']) {
      const items = house.levels.flatMap(L => (L.windows || [])
        .filter(w => w.side === side && L.base + (w.sill || 0) + (w.hz || 0) > ground)
        .map(w => ({ w, L, c: (w.a + w.b) / 2 })));
      // 35а. пары с разных уровней
      for (let i = 0; i < items.length; i++)
        for (let j = i + 1; j < items.length; j++) {
          const a = items[i], b = items[j];
          if (a.L === b.L) continue;
          const d = Math.abs(a.c - b.c);
          if (d >= 1 && d < LIMITS.facadeAxisSnap)
            errs.push(`фасад ${side}: оси ${a.w.id} (${a.c}) и ${b.w.id} (${b.c}) разъехались на ${Math.round(d)} — совместить или развести на ${LIMITS.facadeAxisSnap}`);
        }
      // 35б. парные ворота: равные поля от углов фасада
      const gates = items.filter(x => x.w.kind === 'gate');
      if (gates.length === 2) {
        // зеркалятся оба края обеих створок: равные поля при створках разной
        // ширины — всё ещё кривой фасад
        const len = side === 'S' || side === 'N' ? S.w : S.h;
        const [g1, g2] = gates[0].w.a <= gates[1].w.a ? [gates[0].w, gates[1].w] : [gates[1].w, gates[0].w];
        for (const d of [Math.abs(g1.a - (len - g2.b)), Math.abs(g1.b - (len - g2.a))])
          if (d >= 1 && d < LIMITS.facadeAxisSnap) {
            errs.push(`фасад ${side}: ворота не зеркальны — края разъехались на ${Math.round(d)}, почти симметрично хуже, чем симметрично`);
            break;
          }
      }
      // 35в. окно почти по центру помещения
      for (const it of items) {
        if (it.w.kind) continue;
        const host = it.L.rooms.find(r => overlap(windowBand(it.w, S, 300), r) > 1000);
        if (!host) continue;
        // два окна одной комнаты на одной грани — симметричная пара,
        // у неё своя композиция, и «почти центр» к ней не относится
        const twin = items.some(o => o !== it && !o.w.kind && o.L === it.L
          && it.L.rooms.find(r => overlap(windowBand(o.w, S, 300), r) > 1000) === host);
        if (twin) continue;
        const c0 = side === 'S' || side === 'N' ? host.x + host.w / 2 : host.y + host.h / 2;
        const d = Math.abs(it.c - c0);
        // держит ось другого этажа — центр помещения уступает оси фасада
        const holdsAxis = items.some(o => o.L !== it.L && o.c === it.c);
        if (d >= 1 && d < LIMITS.roomAxisSnap && !holdsAxis)
          errs.push(`фасад ${side}: окно ${it.w.id} почти по центру «${host.name}» (${it.c} против ${c0}) — в центр или дальше ${LIMITS.roomAxisSnap}`);
      }
    }
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
  // это одна лестница, записанная трижды: разъехаться не могут не только
  // шахты, но и проступь, площадка, торец входа и ограждение. Число подъёмов
  // своё у каждого марша — этажи разной высоты
  {
    const stairs = house.levels.map(L => L.stair).filter(Boolean);
    for (let i = 1; i < stairs.length; i++)
      for (const k of ['tread', 'landing', 'entry', 'rail'])
        if (stairs[i - 1][k] !== stairs[i][k])
          errs.push(`лестница: ${k} = ${stairs[i][k]} на уровне ${i + 1} расходится с ${stairs[i - 1][k]} ниже`);
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
      // вся гаражная защита — тамбур, огнестойкость, машиноместо — висит
      // на метке garage: убери её, и правила молча погаснут
      if (!allRooms.some(r => r.tag === 'garage'))
        errs.push('задание требует гараж, а помещения с меткой garage нет');
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

  // 39. перемычки. Сборные и монолитные участки раскладывает ведомость,
  // но за 3200 не лезет уже и монолитный участок: такой проём несёт балка
  // по отдельному расчёту, и появиться он должен решением, а не правкой числа
  for (const L of house.levels) {
    if (L.base < 0) continue;                    // цоколь монолитный, там КЖ
    for (const o of [...(L.windows || []).map(w => ({ id: w.id, span: w.b - w.a })),
    ...(L.openings || []).map(q => ({ id: q.id, span: q.w }))])
      if (o.span > LIMITS.lintelMax)
        errs.push(`проём ${o.id} шириной ${o.span} — перемычки такой нет, нужна балка по расчёту`);
  }

  // 38. участок. Дом, времянка и септик разводятся не друг с другом,
  // а с границами: каждый по отдельности стоит нормально, а вместе они
  // делят 19 метров фронта, и лишний метр в одном месте вылезает нехваткой
  // в другом. Расстояния меряются между прямоугольниками, а не «на глаз»
  {
    const PG = plotGeom(house);
    const dist = (a, b) => {
      const dx = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w), 0);
      const dy = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h), 0);
      return Math.hypot(dx, dy);
    };
    if (!PG) errs.push('участок не задан: без границ не проверить ни отступы, ни разрывы, ни септик');
    else {
      const { lot, m, temp, septic, fence, drive, paths } = PG;
      const houseBox = rect(0, 0, S.w, S.h);
      // 38а. посадка: красная линия и боковые отступы — у обоих домов
      if (m.S < LIMITS.redLine)
        errs.push(`дом в ${m.S} от красной линии, норма ${LIMITS.redLine}`);
      for (const [side, v] of [['СЗ', m.W], ['ЮВ', m.E], ['СВ', m.N]])
        if (v < LIMITS.sideSetback)
          errs.push(`дом в ${v} от границы ${side}, норма ${LIMITS.sideSetback}`);
      if (temp) {
        const t = temp.box;
        for (const [side, v] of [['СЗ', t.x - lot.x0], ['ЮВ', lot.x1 - t.x - t.w],
        ['улица', t.y - lot.y0], ['СВ', lot.y1 - t.y - t.h]]) {
          const lim = side === 'улица' ? LIMITS.redLine : LIMITS.sideSetback;
          if (v < lim) errs.push(`времянка в ${Math.round(v)} от границы ${side}, норма ${lim}`);
        }
        // 38б. Противопожарный разрыв. Двум несгораемым домам нужно 6 м,
        // камню против дерева — 10. Присланный архитектором каркасный дом
        // 8,1 × 9,6 не выдерживает десяти ни в одной ориентации: двор
        // за домом 17,5 м, отступ от задней границы 3 м, и остаток —
        // 4,9 м как есть, 6,4 м при повороте на 90°. Разрыв принят
        // отступлением, потому что строение временное; в данных это
        // записано ролью и текстом отступления, а не молчанием.
        //
        // Но отступление не отменяет правила, а меняет его вопрос: раз
        // норму не выдержать, обязан быть выдержан максимум, который
        // участок вообще позволяет. Подвинули времянку к дому, хотя место
        // сзади было, — правило скажет об этом
        const need = temp.mat === 'wood' ? LIMITS.fireGapWood : LIMITS.fireGapStone;
        const gap = dist(houseBox, t);
        const far = { ...t, y: lot.y1 - LIMITS.sideSetback - t.h };   // самая дальняя посадка
        const best = Math.min(need, Math.round(dist(houseBox, far)));
        const mat = temp.mat === 'wood' ? 'камень — дерево' : 'камень — камень';
        if (temp.role === 'temporary') {
          if (!temp.waiver)
            errs.push('времянка помечена временной, а отступление по разрыву не записано');
          if (gap < best)
            errs.push(`противопожарный разрыв дом — времянка ${Math.round(gap)}, а участок даёт ${best}: отступление не оправдывает потерянных метров`);
        } else if (gap < need)
          errs.push(`противопожарный разрыв дом — времянка ${Math.round(gap)}, материалам (${mat}) нужно ${need}`);
        // дверь времянки обращена к дому и дорожке, а не в забор
        if (!['S', 'W'].includes(temp.door.side))
          errs.push(`дверь времянки выходит на сторону ${temp.door.side} — к забору, а не к дому`);
      }
      // 38в. септик: пять метров до каждого жилого дома, отступ от всех
      // границ — и близко к уличному забору: станцию обслуживают с улицы,
      // не загоняя машину на участок. Уползла в глубину — шланг не дотянется
      if (septic) {
        const q = septic.box;
        if (dist(houseBox, q) < LIMITS.septicToHouse)
          errs.push(`септик в ${Math.round(dist(houseBox, q))} от дома, норма ${LIMITS.septicToHouse}`);
        if (temp && dist(temp.box, q) < LIMITS.septicToHouse)
          errs.push(`септик в ${Math.round(dist(temp.box, q))} от времянки, норма ${LIMITS.septicToHouse}`);
        const toBorder = Math.min(q.x - lot.x0, lot.x1 - q.x - q.w, lot.y1 - q.y - q.h, q.y - lot.y0);
        if (toBorder < LIMITS.septicToBorder)
          errs.push(`септик в ${Math.round(toBorder)} от границы участка, норма ${LIMITS.septicToBorder}`);
        if (q.y - lot.y0 > LIMITS.septicService)
          errs.push(`септик в ${Math.round(q.y - lot.y0)} от красной линии — обслуживать с улицы можно с ${LIMITS.septicService}`);
        for (const p of [drive, ...paths].filter(Boolean))
          if (overlap(q, p) > 0) errs.push(`септик под покрытием ${p.id} — крышку не открыть`);
      } else errs.push('септика нет: канализации некуда деваться, центральной сети на улице нет');
      // 38г. въезд: ворота не уже пожарного проезда и напротив гаражного
      // фронта — заезд с улицы прямой, без манёвра поперёк двора
      const gates = house.levels.flatMap(L => (L.windows || []).filter(w => w.kind === 'gate'));
      if (fence.gate && gates.length) {
        if (fence.gate.w < LIMITS.gateW)
          errs.push(`въездные ворота ${fence.gate.w}, проезду нужно ${LIMITS.gateW}`);
        const c0 = (Math.min(...gates.map(w => w.a)) + Math.max(...gates.map(w => w.b))) / 2;
        const c1 = fence.gate.x + fence.gate.w / 2;
        if (Math.abs(c1 - c0) > LIMITS.gateAxisSnap)
          errs.push(`ось въездных ворот ${c1} против оси гаражного фронта ${c0} — заезд с манёвром`);
      } else if (gates.length) errs.push('в заборе нет въездных ворот, а гараж есть');
      // 38д. калитка напротив дорожки к дому
      if (fence.wicket) {
        if (fence.wicket.w < LIMITS.wicketW)
          errs.push(`калитка ${fence.wicket.w}, норма ${LIMITS.wicketW}`);
        const walk = paths[0];
        if (walk && Math.abs((fence.wicket.x + fence.wicket.w / 2) - (walk.x + walk.w / 2)) > 300)
          errs.push(`калитка не напротив дорожки: ось ${fence.wicket.x + fence.wicket.w / 2}, дорожка ${walk.x + walk.w / 2}`);
      } else errs.push('в заборе нет калитки — на участок только через ворота');
      // 38е. забор замкнут: каждая сторона покрыта панелями и створками
      // без щелей и наложений — щель в заборе на чертеже не видна вовсе
      for (const [name, along, at, a0, a1] of [
        ['улица', 'x', lot.y0, lot.x0, lot.x1], ['СВ', 'x', lot.y1, lot.x0, lot.x1],
        ['СЗ', 'y', lot.x0, lot.y0, lot.y1], ['ЮВ', 'y', lot.x1, lot.y0, lot.y1]]) {
        const items = [...fence.segs, fence.gate, fence.wicket].filter(Boolean)
          .filter(q => along === 'x' ? Math.abs(q.y + q.h / 2 - at) < fence.th : Math.abs(q.x + q.w / 2 - at) < fence.th)
          .map(q => along === 'x' ? [q.x, q.x + q.w] : [q.y, q.y + q.h])
          .sort((p, q) => p[0] - q[0]);
        // угол закрывает панель перпендикулярной стороны — допуск в толщину
        let cur = a0 + fence.th;
        for (const [b0, b1] of items) {
          if (b0 > cur + fence.th) { errs.push(`забор (${name}): щель ${Math.round(b0 - cur)} мм у ${Math.round(cur)}`); break; }
          if (b1 < cur - fence.th) { errs.push(`забор (${name}): панели наложились у ${Math.round(b0)}`); break; }
          cur = Math.max(cur, b1);
        }
        if (cur < a1 - fence.th) errs.push(`забор (${name}): не доходит до угла, кончается на ${Math.round(cur)}`);
      }
      // 38ж. покрытия не наезжают друг на друга и на дома; проезд примыкает
      // к воротам забора — иначе от ворот до гаража полоса грунта
      const covers = [drive, ...paths].filter(Boolean);
      for (let i = 0; i < covers.length; i++)
        for (let j = i + 1; j < covers.length; j++)
          if (overlap(covers[i], covers[j]) > 100)
            errs.push(`покрытия ${covers[i].id} и ${covers[j].id} наезжают друг на друга`);
      for (const p of covers) {
        if (overlap(p, houseBox) > 0) errs.push(`покрытие ${p.id} заезжает под дом`);
        if (temp && overlap(p, temp.box) > 0) errs.push(`покрытие ${p.id} заезжает под времянку`);
      }
      if (fence.gate && drive) {
        const [ga, gb] = [fence.gate.x, fence.gate.x + fence.gate.w];
        if (drive.y > lot.y0 + 1 || Math.min(gb, drive.x + drive.w) - Math.max(ga, drive.x) < LIMITS.gateW - 200)
          errs.push('проезд не примыкает к въездным воротам во всю их ширину');
      }
    }
  }

  // 42. Времянка. Пока она была коробкой 8 × 8 с плоской плитой сверху,
  // спрашивать о ней было нечего: четыре стены, дверь и два окна. Присланная
  // архитектором моделью, она стала домом — с планировкой, скатом над головой,
  // свайным полем и настилом на высоте почти метра. Всё это проверяется теми
  // же вопросами, что и дом: покрывают ли помещения внутренний габарит,
  // лежит ли проём в своей стене, дойти ли от входа до каждой комнаты,
  // хватает ли высоты под скатом, ниже ли промерзания свая и не сходят ли
  // с настила в пустоту. Список координат на все эти вопросы не отвечает
  {
    const T = tempGeom(house);
    if (T) {
      const E2 = m => errs.push(`времянка: ${m}`);
      // 42а. помещения и перегородки покрывают внутренний габарит
      const tile = tiling(T.inner, T.rooms, T.parts);
      for (const c of tile.free.slice(0, 3))
        E2(`пол ${c.w} × ${c.h} мм у ${c.x},${c.y} не принадлежит ни одному помещению`);
      for (const o of tile.over.slice(0, 3))
        E2(`«${o.room.name}» налезает на перегородку у ${o.cell.x},${o.cell.y}`);
      for (let i = 0; i < T.rooms.length; i++)
        for (let j = i + 1; j < T.rooms.length; j++)
          if (overlap(T.rooms[i], T.rooms[j]) > 100)
            E2(`наложение «${T.rooms[i].name}» и «${T.rooms[j].name}»`);

      // 42б. наружный проём лежит в своей стене и не режет угол
      for (const o of T.openings) {
        const w = T.walls.find(q => q.side === o.side);
        if (!w) { E2(`проём ${o.id} на стороне ${o.side}, а такой стены нет`); continue; }
        const horiz = o.side === 'S' || o.side === 'N';
        const [lo, hi] = horiz ? [w.x, w.x + w.w] : [w.y, w.y + w.h];
        if (o.a < lo + LIMITS.jambMin || o.b > hi - LIMITS.jambMin)
          E2(`проём ${o.id} ${o.a}…${o.b} не оставляет простенка ${LIMITS.jambMin} в стене ${lo}…${hi}`);
        // потолок над проёмом: у карнизной стены он ровный, у щипцовой
        // поднимается к коньку — витраж в пол упирается именно в скат
        const at = u => Math.round(T.roof.underAt(u - T.x) - T.floor);
        const lim = horiz ? Math.min(at(o.a), at(o.b)) : T.clear;
        if (o.hz + (o.sill || 0) > lim)
          E2(`проём ${o.id} верхом на ${o.hz + (o.sill || 0)}, а низ кровли над ним ${lim}`);
      }
      for (const d of T.doors) {
        const p = T.parts.find(q => q.id === d.part);
        if (!p) { E2(`дверь ${d.id} привязана к перегородке ${d.part}, а такой нет`); continue; }
        const [lo, hi] = d.horiz ? [p.x, p.x + p.w] : [p.y, p.y + p.h];
        if (d.a < lo || d.b > hi) E2(`дверь ${d.id} ${d.a}…${d.b} выходит за перегородку ${lo}…${hi}`);
      }

      // 42в. от входа достижимо каждое помещение: дверь связывает те два,
      // к которым примыкает. Комната, в которую не войти, на плане выглядит
      // ровно так же, как остальные
      const adj = T.rooms.map(() => new Set());
      const link = (r, name) => {
        const hit = T.rooms.map((q, i) => overlap(r, q) > 1000 ? i : -1).filter(i => i >= 0);
        if (hit.length !== 2) E2(`дверь ${name} соединяет ${hit.length} помещений`);
        for (const a of hit) for (const b of hit) if (a !== b) adj[a].add(b);
        return hit;
      };
      for (const d of T.doors)
        link(d.horiz ? rect(d.a, d.host.y - 150, d.b - d.a, d.host.h + 300)
          : rect(d.host.x - 150, d.a, d.host.w + 300, d.b - d.a), d.id);
      const entry = T.rooms.findIndex(q => overlap(
        rect(T.door.a, T.block.y - 150, T.door.b - T.door.a, T.t + 300), q) > 1000);
      if (entry < 0) E2('входная дверь не ведёт ни в одно помещение');
      else {
        const seen = new Set([entry]), st = [entry];
        while (st.length) for (const n of adj[st.pop()]) if (!seen.has(n)) { seen.add(n); st.push(n); }
        T.rooms.forEach((q, i) => { if (!seen.has(i)) E2(`в «${q.name}» не войти от входной двери`); });
      }

      // 42г. Высота под скатом. Это не норма жилого дома — времянку ею
      // мерить незачем, — а вопрос про голову: у карнизной стены потолок
      // самый низкий, и под ним надо проходить не пригибаясь. Из данных
      // это не видно ни в каком виде: там стоит одно число clear
      for (const q of T.rooms) {
        const at = u => T.roof.underAt(u - T.x) - T.floor;
        const low = Math.round(Math.min(at(q.x), at(q.x + q.w)));
        if (low < LIMITS.clearService) E2(`«${q.name}»: под скатом ${low}, пройти можно от ${LIMITS.clearService}`);
      }

      // 42д. кровля перекрывает террасу и не вылезает за участок: свес
      // в 500 мм на трёхметровом отступе съедает шестую часть прохода
      const PGl = plotGeom(house);
      if (PGl) {
        const rb = T.roof.box;
        for (const [name, v] of [['СЗ', rb.x - PGl.lot.x0], ['ЮВ', PGl.lot.x1 - rb.x - rb.w],
        ['улица', rb.y - PGl.lot.y0], ['СВ', PGl.lot.y1 - rb.y - rb.h]])
          if (v < 0) E2(`свес кровли вышел за границу ${name} на ${Math.round(-v)}`);
      }
      if (Math.abs(overlap(T.roof.box, T.deck) - T.deck.w * T.deck.h) > 1)
        E2('кровля не перекрывает настил террасы целиком — с неё будет лить на доски');

      // 42е. свая ниже промерзания с коэффициентом на неотапливаемый грунт,
      // и продух под ростверком: дерево на земле сгниёт за одну зиму
      const need = T.ground - Math.round((house.site.frost || 0) * 1.1);
      if (house.site.frost && T.pileBottom > need)
        E2(`низ сваи ${T.pileBottom}, промерзание ${house.site.frost} требует ${need}`);
      const air = T.grillBottom - T.ground;
      if (air < LIMITS.tempAir) E2(`продух под ростверком ${Math.round(air)}, норма ${LIMITS.tempAir}`);

      // 42ж. с настила сходят по ступеням, а не прыгают: подступёнок в норме,
      // а при перепаде больше нормы кромка ограждается
      if (T.rise > LIMITS.porchRise[1] || T.rise < LIMITS.porchRise[0])
        E2(`подступёнок крыльца ${T.rise}, норма ${LIMITS.porchRise[0]}…${LIMITS.porchRise[1]}`);
      if (T.drop > 600 && !T.rails.length)
        E2(`настил на ${Math.round(T.drop)} над землёй без ограждения`);
      for (const r of T.rails)
        if (r.hz < LIMITS.guardRail) E2(`ограждение настила ${r.hz}, норма ${LIMITS.guardRail}`);
    }
  }

  // 41. прогулка. Маршрут 3D-обхода выводится из этих же данных и уходит
  // на сайт. Помещение, выпавшее из маршрута, или пол, по которому от двери
  // до двери не пройти, — дефект данных: на странице камера молча пролетит
  // мимо, и никто этого не заметит
  try {
    for (const p of tour(house).problems) errs.push(`прогулка: ${p}`);
  } catch (e) {
    errs.push(`прогулка: маршрут не построился — ${e.message}`);
  }

  return errs;
}
