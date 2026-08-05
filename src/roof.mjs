// Кровля, веранда и приямок — то, чего в модели не было вовсе.
//
// Хранится решение, а не результат: уклон, свесы, сечения и шаг. Всё
// остальное — отметки конька и карниза, площади скатов, длина стропил,
// объём древесины — вычисляется. Поменяли уклон в данных — пересчитались
// и чертёж, и выгрузка, и смета, и правила.
//
// Система координат плана: x вправо, y вниз, отметки z от 0.000.

const rad = d => d * Math.PI / 180;

// ─────────────────────────────────────────────────────────────── кровля
// Двускатная с холодным чердаком. Конёк идёт вдоль длинной оси, скаты
// уходят поперёк: при коньке «y» скат считается по ширине дома.
export function roofGeom(house) {
  const R = house.roof, S = house.shell;
  const p = rad(R.pitch), tan = Math.tan(p);
  const alongY = R.ridge === 'y';
  const span = alongY ? S.w : S.h;          // пролёт поперёк конька
  const len = alongY ? S.h : S.w;           // длина конька по стене
  // Отметка кровли — не «верх стены». На мауэрлате лежит затяжка, на затяжке
  // стропило, на стропиле пирог; и всё это по вертикали, а не по нормали.
  // Пока скат считался прямо от base, конёк и карниз выходили на 400 мм ниже
  // настоящих — а из этой же отметки считается высота труб над кровлей,
  // и обе трубы оказывались короткими, причём правило это пропускало:
  // оно мерило от той же ошибочной плоскости
  const pie = R.counter[0] + R.sheathing;                   // вентзазор и настил
  const deck = R.tie[0] + Math.round((R.rafter[0] + pie) / Math.cos(p));
  const axis = S.wall / 2;                                  // ось мауэрлата
  const planeZ = R.base + deck;                             // верх покрытия над ней
  const half = span / 2 - axis;                             // от оси мауэрлата до конька
  const rise = Math.round(half * tan);
  const ridgeZ = Math.round(planeZ + rise);                 // отметка конька
  const eaveZ = Math.round(planeZ - (axis + R.eave) * tan); // верх покрытия в крайней точке свеса
  const rafterZ = R.base + R.tie[0];                        // низ стропила по оси мауэрлата
  const ground = house.site.ground ?? -300;                 // планировочная отметка земли
  // контур кровли в плане: карниз по скатным сторонам, фронтон по торцам
  const out = alongY
    ? { x: -R.eave, y: -R.gable, w: S.w + 2 * R.eave, h: S.h + 2 * R.gable }
    : { x: -R.gable, y: -R.eave, w: S.w + 2 * R.gable, h: S.h + 2 * R.eave };
  const ridge = alongY
    ? { x1: S.w / 2, y1: out.y, x2: S.w / 2, y2: out.y + out.h }
    : { x1: out.x, y1: S.h / 2, x2: out.x + out.w, y2: S.h / 2 };
  const slopeRun = span / 2 + R.eave;                       // в плане от конька до края
  const slopeLen = Math.round(slopeRun / Math.cos(p));      // по скату
  const slopeW = len + 2 * R.gable;                         // длина ската вдоль конька
  // Фронтон — не треугольник от верха стены до конька: снизу его подрезает
  // затяжка, сверху — низ стропила. Считается интегралом, а не «span × rise»
  const gable = (span * R.tie[0] + 2 * tan * (half * span / 2 - span * span / 8)) / 1e6;
  return {
    pitch: R.pitch, alongY, span, len, half, deck, rise, ridgeZ, eaveZ, rafterZ,
    ground, out, ridge, slopeRun, slopeLen, slopeW,
    area: 2 * slopeLen * slopeW / 1e6,                      // площадь скатов, м²
    plan: out.w * out.h / 1e6,                              // площадь в плане, м²
    attic: (S.w - 2 * S.wall) * (S.h - 2 * S.wall) / 1e6,   // чердачное перекрытие
    gable,                                                  // площадь одного фронтона, м²
    // Ферма на каждую стропильную пару: затяжка она же балка перекрытия,
    // стропила, бабка. Прогона и стоек под ним нет и быть не может —
    // под линией конька несущей стены нет на всю длину дома
    trusses: Math.floor(len / R.rafterStep) + 1,
    tieLen: (Math.floor(len / R.rafterStep) + 1) * (span - 2 * axis),   // затяжки, мм
    hangerLen: (Math.floor(len / R.rafterStep) + 1) * Math.round(half * tan),
    // ветровые связи: по две диагонали на скат, крыша работает жёстким диском
    braceLen: 4 * Math.round(Math.hypot(slopeLen, slopeW / 4)),
    rafters: 2 * (Math.floor(slopeW / R.rafterStep) + 1),   // число стропильных ног
    gutterLen: 2 * slopeW,                                  // жёлоб по обоим карнизам, мм
    // водосточных труб: одна на 10 м жёлоба, но не меньше двух на карниз
    drains: 2 * Math.max(2, Math.ceil(slopeW / 10000)),
    drainLen: 2 * Math.max(2, Math.ceil(slopeW / 10000)) * (eaveZ - ground),
    // отметка верха покрытия над точкой плана — по ней считаются проходы труб
    zAt(x, y) {
      const d = alongY ? Math.abs(x - S.w / 2) : Math.abs(y - S.h / 2);
      return planeZ - (d - half) * tan;
    }
  };
}

// Труба должна подняться над кровлей — СП 7.13130: ближе 1,5 м от конька
// не ниже 500 над ним, до 3 м — не ниже конька, дальше — не ниже линии,
// проведённой от конька вниз под 10°. И всегда не меньше 500 над скатом.
export function flueTop(house, f) {
  const g = roofGeom(house);
  const cx = f.x + f.w / 2, cy = f.y + f.h / 2;
  const d = g.alongY ? Math.abs(cx - house.shell.w / 2) : Math.abs(cy - house.shell.h / 2);
  const byRidge = d <= 1500 ? g.ridgeZ + 500
    : d <= 3000 ? g.ridgeZ
      : g.ridgeZ - Math.round(d * Math.tan(rad(10)));
  return Math.max(byRidge, Math.round(g.zAt(cx, cy)) + 500);
}

// Шахты, которые протыкают кровлю: дымоходы и вентшахта. Приставная труба
// стоит снаружи стены и попадает под свес — значит в скате нужен проём
export function roofHoles(house) {
  const g = roofGeom(house), out = [];
  const L = house.levels[house.levels.length - 1];
  const add = (o, kind) => {
    const hole = { id: o.id.replace(/^[a-z]+\./, 'roof.'), x: o.x, y: o.y, w: o.w, h: o.h, kind };
    const inside = hole.x >= g.out.x && hole.y >= g.out.y
      && hole.x + hole.w <= g.out.x + g.out.w && hole.y + hole.h <= g.out.y + g.out.h;
    if (inside) out.push(hole);
  };
  for (const f of L.flues || []) add(f, 'дымоход');
  for (const d of L.ducts || []) add(d, 'вентшахта');
  return out;
}

// ─────────────────────────────────────────────────────────────── веранда
// Открытая веранда с навесом: сваи, обвязка, настил, стойки, прогон, скат.
export function verandaGeom(house) {
  const L = house.levels.find(l => l.veranda);
  if (!L) return null;
  const v = L.veranda, p = rad(v.pitch), tan = Math.tan(p);
  const wall = v.x >= house.shell.w ? 'E' : 'W';            // к какой стене примыкает
  const run = v.w;                                          // вынос настила от дома
  const c = v.canopy ?? 300;                                // свес навеса за настил
  const canopyRun = run + c;                                // от стены до края навеса
  const dropZ = Math.round(v.attach - canopyRun * tan);     // низ навеса у наружного края
  // Навес шире настила на свес: иначе вода с него льётся на доски. Площадь
  // считается по этой же коробке, а не по настилу — иначе смета и чертёж разойдутся
  const canopyBox = { x: v.x, y: v.y - c, w: canopyRun, h: v.h + 2 * c };
  // стойки по наружному краю настила, шаг не больше v.postStep
  const n = Math.max(2, Math.ceil(v.h / v.postStep) + 1);
  const posts = [];
  for (let i = 0; i < n; i++) {
    const y = Math.round(v.y + (v.h - v.post) * i / (n - 1));
    posts.push({ id: `veranda.p${i + 1}`, x: v.x + v.w - v.post, y, w: v.post, h: v.post });
  }
  const piles = [];
  const cols = 2, rows = n;
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++)
    piles.push({
      id: `veranda.s${i * cols + j + 1}`,
      x: Math.round(v.x + (j === 0 ? 150 : v.w - 450)), y: Math.round(v.y + (v.h - 300) * i / (rows - 1)),
      w: 300, h: 300
    });
  const deckBottom = v.deck - v.board - v.joist[0];         // низ лаг
  return {
    v, wall, run, c, canopyRun, canopyBox, dropZ, posts, piles,
    deckArea: v.w * v.h / 1e6,
    canopyArea: Math.round(canopyRun / Math.cos(p)) * canopyBox.h / 1e6,
    canopyLen: Math.round(canopyRun / Math.cos(p)),
    joists: Math.floor(v.w / v.joistStep) + 1,
    rail: 2 * v.h + v.w - v.steps * 1000,                   // длина ограждения, мм
    deckBottom, beamBottom: deckBottom - v.beam[0],         // низ обвязки — по ней сваи
    pileTop: deckBottom - v.beam[0],
    pileBottom: (house.site.ground ?? -300) - v.pileDepth,
    // высота стойки считается по низу навеса над самой стойкой, а не над краем
    postZ: Math.round(v.attach - (v.w - v.post / 2) * tan) - v.deck,
    // Низ навеса над настилом у наружного края. По нему раньше проверялся
    // проход — и зря: под навесом висит прогон, и головой встречают именно его.
    clear: dropZ - v.deck,
    beamClear: dropZ - v.beam[0] - v.deck,
    // Снеговой мешок у стены над навесом. Правило «навес ниже подоконника»
    // аттестовало как норму окно, которое всю зиму стоит в сугробе: снег
    // ложится на навес и подпирает стену выше самого навеса
    snowPocket: Math.round(1000 * (v.snowMu ?? 2.5) * (house.site.snow?.sg ?? 1)
      / ((house.site.snow?.density ?? 350) * 9.81 / 1000))
  };
}

// ─────────────────────────────────────────────────────────────── приямок
// Люк в стене цоколя, снаружи бетонная коробка с крышкой: дрова падают
// внутрь, вода уходит в дренаж, крышка держит человека.
//
// Хранится решение — наружный габарит коробки, толщина стенки, насколько дно
// ниже порога люка, высота борта над отмосткой и уклон лотка. Считается всё
// остальное: свет ямы, отметки дна, порога и крышки, длина лотка и запас,
// который яма держит, прежде чем вода пойдёт через порог в дровяник.
//
// Уровень земли — общий для площадки (site.ground), а не свойство приямка:
// два разных «уровня земли» в одном доме однажды разъедутся.
export function pitGeom(house) {
  const out = [];
  for (const L of house.levels)
    for (const w of L.windows || []) {
      if (w.kind !== 'hatch') continue;
      const P = w.pit || {}, S = house.shell, ground = house.site.ground ?? -300;
      const side = P.side ?? 400, depth = P.out ?? 1250, t = P.wall ?? 150;
      const a = w.a - side, b = w.b + side;
      // box — наружный габарит бетонной коробки, стенки стоят внутрь него
      const box = w.side === 'W' ? { x: -depth, y: a, w: depth, h: b - a }
        : w.side === 'E' ? { x: S.w, y: a, w: depth, h: b - a }
          : w.side === 'S' ? { x: a, y: -depth, w: b - a, h: depth }
            : { x: a, y: S.h, w: b - a, h: depth };
      // свет ямы: с трёх сторон стенка, с четвёртой — стена дома
      const horiz = w.side === 'S' || w.side === 'N';
      const clear = horiz
        ? { x: box.x + t, y: w.side === 'S' ? box.y + t : box.y, w: box.w - 2 * t, h: box.h - t }
        : { x: w.side === 'W' ? box.x + t : box.x, y: box.y + t, w: box.w - t, h: box.h - 2 * t };
      const sillZ = L.base + (w.sill || 0);                 // порог люка
      const floor = sillZ - (P.below ?? 200);               // дно приямка
      const kerb = P.kerb ?? 100;
      // лоток: от порога люка вниз-наружу до дальней стенки. Дрова, сброшенные
      // с земли, скатываются в люк, а не остаются лежать на дне ямы
      const run = horiz ? clear.h : clear.w;
      const rise = Math.round(run * Math.tan(rad(P.chute ?? 34)));
      out.push({
        id: w.id.replace(/\.g/, '.pit'), win: w.id, side: w.side, box, clear,
        floor, sillZ, ground, kerb,
        top: ground + kerb,                                 // верх борта и крышки
        depth: ground + kerb - floor,                       // от крышки до дна
        freeboard: sillZ - floor,                           // запас до перелива в дом
        hold: (sillZ - floor) * clear.w * clear.h / 1e9,    // тот же запас, м³
        wall: t,
        chute: P.chute ?? 34, chuteRun: run, chuteTop: floor + (P.below ?? 200) + rise,
        chuteLen: Math.round(Math.hypot(run, rise))
      });
    }
  return out;
}

// ─────────────────────────────────────────────────────────────── крыльцо
// Наружная дверь с порогом выше земли — это площадка и ступени, а не «дверь
// в стене». На плане их не было, и дверь гаража выходила прямо в грунт.
//
// Хранится решение: глубина площадки, число ступеней, проступь и насколько
// площадка ниже порога. Считается подъём ступени, полный вынос от стены и
// полоса фасада, которую крыльцо занимает, — по ней оно разводится с приямком.
export function porchGeom(house) {
  const out = [];
  for (const L of house.levels)
    for (const w of L.windows || []) {
      if (!w.porch) continue;
      const P = w.porch, S = house.shell, ground = house.site.ground ?? -300;
      const side = P.side ?? 150, depth = P.out ?? 1200;
      const n = P.steps ?? 1, tread = P.tread ?? 300;
      const a = w.a - side, b = w.b + side;
      const landZ = L.base + (w.sill || 0) - (P.drop ?? 30);
      const horiz = w.side === 'S' || w.side === 'N';
      // площадка вплотную к стене, ступени уходят от неё наружу
      const pad = w.side === 'W' ? { x: -depth, y: a, w: depth, h: b - a }
        : w.side === 'E' ? { x: S.w, y: a, w: depth, h: b - a }
          : w.side === 'S' ? { x: a, y: -depth, w: b - a, h: depth }
            : { x: a, y: S.h, w: b - a, h: depth };
      const steps = [];
      for (let i = 0; i < n; i++) {
        const k = i + 1;
        steps.push(w.side === 'W' ? { x: -depth - k * tread, y: a, w: tread, h: b - a }
          : w.side === 'E' ? { x: S.w + depth + (k - 1) * tread, y: a, w: tread, h: b - a }
            : w.side === 'S' ? { x: a, y: -depth - k * tread, w: b - a, h: tread }
              : { x: a, y: S.h + depth + (k - 1) * tread, w: b - a, h: tread });
      }
      out.push({
        id: w.id.replace(/\.g/, '.porch'), win: w.id, side: w.side, pad, steps,
        landZ, ground, tread, horiz,
        sillZ: L.base + (w.sill || 0), drop: P.drop ?? 30,
        depth: horiz ? pad.h : pad.w,
        rise: Math.round((landZ - ground) / n),             // подъём ступени
        reach: depth + n * tread,                           // полный вынос от стены
        band: horiz ? [pad.x, pad.x + pad.w] : [pad.y, pad.y + pad.h]
      });
    }
  return out;
}

// Всё, что вынесено за наружную стену: дымоход, приямок, крыльцо. Собирается
// одним списком, потому что разводятся они друг с другом, а не каждый сам по
// себе, и упираются в один и тот же отступ до границы участка.
export function outsideBits(house) {
  const out = [], seen = new Set();
  for (const L of house.levels)
    for (const f of L.flues || []) {
      if (!f.outside || seen.has(f.id.split('.').pop())) continue;
      seen.add(f.id.split('.').pop());
      const side = f.x + f.w === 0 ? 'W' : f.x === house.shell.w ? 'E'
        : f.y + f.h === 0 ? 'S' : 'N';
      const horiz = side === 'S' || side === 'N';
      out.push({
        id: f.id, kind: 'дымоход', side, box: f,
        reach: horiz ? f.h : f.w, band: horiz ? [f.x, f.x + f.w] : [f.y, f.y + f.h]
      });
    }
  for (const p of pitGeom(house)) {
    const horiz = p.side === 'S' || p.side === 'N';
    out.push({
      id: p.id, kind: 'приямок', side: p.side, box: p.box,
      reach: horiz ? p.box.h : p.box.w,
      band: horiz ? [p.box.x, p.box.x + p.box.w] : [p.box.y, p.box.y + p.box.h]
    });
  }
  for (const q of porchGeom(house))
    out.push({ id: q.id, kind: 'крыльцо', side: q.side, box: q.pad, reach: q.reach, band: q.band });
  return out;
}
