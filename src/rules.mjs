// Правила проверки планировки. Каждый найденный дефект добавляется сюда,
// а не чинится единичной правкой координаты.

export const LIMITS = {
  doorClearance: 900,      // глубина свободной зоны перед проёмом
  entranceClearance: 1200, // то же для входной двери
  passage: 700,            // проход между предметами мебели
  wardrobePassage: 800,    // проход между рядами шкафов
  windowBand: 600,         // полоса у окна, которую нельзя загораживать высокой мебелью
  riserMax: 200,           // максимальный подъём ступени
  treadMin: 250,           // минимальная проступь
  wetOverlapMin: 300       // минимальное совпадение мокрых зон по вертикали
};

const rect = (x, y, w, h) => ({ x, y, w, h });
const box = f => f.t === 'c' ? rect(f.x - f.r, f.y - f.r, 2 * f.r, 2 * f.r) : rect(f.x, f.y, f.w, f.h);
const area = r => Math.max(0, r.w) * Math.max(0, r.h);
const inter = (a, b) => rect(
  Math.max(a.x, b.x), Math.max(a.y, b.y),
  Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x),
  Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
);
const overlap = (a, b) => { const i = inter(a, b); return i.w > 0 && i.h > 0 ? i.w * i.h : 0; };
const openingRect = o => o.dir === 'h' ? rect(o.x, o.y, o.w, o.t) : rect(o.x, o.y, o.t, o.w);

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

function clearZone(f, shell) {
  if (!f.clear) return null;
  const b = box(f), d = f.clear.d;
  if (f.clear.side === 'N') return rect(b.x, b.y + b.h, b.w, d);
  if (f.clear.side === 'S') return rect(b.x, b.y - d, b.w, d);
  if (f.clear.side === 'W') return rect(b.x - d, b.y, d, b.h);
  return rect(b.x + b.w, b.y, d, b.h);
}

export function check(house) {
  const errs = [];
  const S = house.shell;
  const inner = rect(S.wall, S.wall, S.w - 2 * S.wall, S.h - 2 * S.wall);
  const E = (lvl, msg) => errs.push(`${lvl.title}: ${msg}`);

  for (const L of house.levels) {
    const rooms = L.rooms, walls = L.walls, opens = L.openings || [], wins = L.windows || [], furn = L.furniture || [];

    // 1. помещения внутри оболочки и без наложений
    for (const r of rooms) {
      if (Math.abs(overlap(r, inner) - area(r)) > 1) E(L, `«${r.name}» выходит за внутренний габарит`);
    }
    for (let i = 0; i < rooms.length; i++)
      for (let j = i + 1; j < rooms.length; j++)
        if (overlap(rooms[i], rooms[j]) > 100) E(L, `наложение «${rooms[i].name}» и «${rooms[j].name}»`);

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

    // 9. высокая мебель не загораживает окна
    for (const w of wins) {
      if (w.kind === 'gate') continue;
      const band = windowBand(w, S, LIMITS.windowBand);
      for (const f of furn)
        if (f.tall && overlap(band, box(f)) > 10000)
          E(L, `${f.l || 'высокая мебель'} загораживает окно ${w.side} ${w.a}–${w.b}`);
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
        if (!(furn[i].tall && furn[j].tall) || furn[i].unit || furn[j].unit) continue;
        const sameRoom = rooms.find(r => overlap(a, r) > 0.9 * area(a) && overlap(b, r) > 0.9 * area(b));
        if (!sameRoom) continue;
        const yOv = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        const xOv = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        if (yOv > 500 && xOv < 0) {
          const gap = Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w);
          if (gap < LIMITS.wardrobePassage) E(L, `проход ${gap} мм между шкафами в «${sameRoom.name}» меньше ${LIMITS.wardrobePassage}`);
        }
        if (xOv > 500 && yOv < 0) {
          const gap = Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h);
          if (gap < LIMITS.passage) E(L, `проход ${gap} мм в «${sameRoom.name}» меньше ${LIMITS.passage}`);
        }
      }

    // 12. машина по центру своей створки ворот
    const gates = wins.filter(w => w.kind === 'gate');
    const cars = furn.filter(f => f.t === 'car');
    for (const g of gates) {
      const gc = (g.a + g.b) / 2;
      const car = cars.find(c => Math.abs(c.x + c.w / 2 - gc) < 150);
      if (!car) E(L, `нет машины по центру ворот ${g.a}–${g.b} (центр ${gc})`);
      else if (car.w + 300 > g.b - g.a) E(L, `створка ${g.b - g.a} мм узка для машины ${car.w} мм`);
    }

    // 13. лестница
    const st = L.stair;
    if (st) {
      const rise = Math.round(L.floorToFloor / st.risers);
      if (rise > LIMITS.riserMax) E(L, `подъём ступени ${rise} мм больше ${LIMITS.riserMax}`);
      if (st.tread < LIMITS.treadMin) E(L, `проступь ${st.tread} мм меньше ${LIMITS.treadMin}`);
      const flight = (Math.ceil(st.risers / 2) - 1) * st.tread;
      if (flight + st.landing > st.w) E(L, `марш ${flight} + площадка ${st.landing} не влезает в шахту ${st.w}`);
      if (st.landing < (st.h - 100) / 2) E(L, `площадка ${st.landing} уже марша`);
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

  return errs;
}
