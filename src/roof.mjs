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
  const p = rad(R.pitch);
  const alongY = R.ridge === 'y';
  const span = alongY ? S.w : S.h;          // пролёт поперёк конька
  const len = alongY ? S.h : S.w;           // длина конька по стене
  const rise = Math.round(span / 2 * Math.tan(p));
  const ridgeZ = R.base + rise;             // отметка конька
  const eaveZ = Math.round(R.base - R.eave * Math.tan(p));  // низ свеса
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
  return {
    pitch: R.pitch, alongY, span, len, rise, ridgeZ, eaveZ, ground, out, ridge,
    slopeRun, slopeLen, slopeW,
    area: 2 * slopeLen * slopeW / 1e6,                      // площадь скатов, м²
    plan: out.w * out.h / 1e6,                              // площадь в плане, м²
    attic: (S.w - 2 * S.wall) * (S.h - 2 * S.wall) / 1e6,   // чердачное перекрытие
    rafters: 2 * (Math.floor(slopeW / R.rafterStep) + 1),   // число стропильных ног
    gutterLen: 2 * slopeW,                                  // жёлоб по обоим карнизам, мм
    // водосточных труб: одна на 10 м жёлоба, но не меньше двух на карниз
    drains: 2 * Math.max(2, Math.ceil(slopeW / 10000)),
    drainLen: 2 * Math.max(2, Math.ceil(slopeW / 10000)) * (eaveZ - ground),
    // отметка кровли над точкой плана — по ней считаются проходы труб
    zAt(x, y) {
      const d = alongY ? Math.abs(x - S.w / 2) : Math.abs(y - S.h / 2);
      return R.base - (d - span / 2) * Math.tan(p);
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
    // низ навеса над настилом у наружного края — по нему проверяется проход
    clear: dropZ - v.deck
  };
}

// ─────────────────────────────────────────────────────────────── приямок
// Люк в стене цоколя, снаружи бетонная коробка с решёткой: дрова падают
// внутрь, вода уходит в дренаж, крышка держит человека.
export function pitGeom(house) {
  const out = [];
  for (const L of house.levels)
    for (const w of L.windows || []) {
      if (w.kind !== 'hatch') continue;
      const P = w.pit || {}, S = house.shell, ground = house.site.ground ?? -300;
      const side = P.side ?? 250, depth = P.out ?? 900;
      const a = w.a - side, b = w.b + side;
      const box = w.side === 'W' ? { x: -depth, y: a, w: depth, h: b - a }
        : w.side === 'E' ? { x: S.w, y: a, w: depth, h: b - a }
          : w.side === 'S' ? { x: a, y: -depth, w: b - a, h: depth }
            : { x: a, y: S.h, w: b - a, h: depth };
      out.push({
        id: w.id.replace(/\.g/, '.pit'), win: w.id, side: w.side, box,
        floor: L.base + (w.sill || 0) - (P.below ?? 200),   // дно приямка
        top: P.ground ?? ground,                            // отметка земли и крышки
        wall: P.wall ?? 150
      });
    }
  return out;
}
