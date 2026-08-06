import { face as mFace } from './model.mjs';

// Отрисовка плана этажа в SVG. Единицы — миллиметры, viewBox тоже в мм.
//
// Геометрия подписей считается здесь и экспортируется наружу: rules.mjs берёт
// те же рамки и проверяет на наложение ровно то, что попадает на чертёж.
// Пока рамки считались бы в двух местах, они разошлись бы и наложения проскакивали.

const C = {
  ink: '#171C24', ink60: '#6E7178', ink35: '#9A9CA1',
  paper: '#E4E3DC', room: '#FBFAF7', garage: '#E1E4E2', quiet: '#E8EDE9',
  heat: '#C0392B', furn: 'rgba(23,28,36,0.46)',
  furnFill: 'rgba(23,28,36,0.05)',   // мебель
  techFill: 'rgba(23,28,36,0.10)',   // техника и сантехника — чуть плотнее
  tile: 'rgba(23,28,36,0.07)'        // сетка плитки в мокрых помещениях
};

// средняя ширина знака в долях кегля: Plex Mono моноширинный, Sans — оценка
const ADV = { sans: 0.54, mono: 0.60 };
import { roofGeom, roofHoles, flueTop, verandaGeom, pitGeom, porchGeom, outsideBits, rampGeom } from './roof.mjs';

import { plotGeom } from './plot.mjs';
import { feedsGeom } from './systems.mjs';

const MIN_FURN_FS = 165;   // мельче подпись мебели не рисуется — правило это ловит

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const fmt = v => (v / 1e6).toFixed(1).replace('.', ',');
const rect = (x, y, w, h) => ({ x, y, w, h });

const textWidth = (t, fs, font = 'sans', ls = 0) =>
  t.length ? t.length * (fs * ADV[font] + ls) - ls : 0;

// рамка подписи в координатах плана; rot — текст повёрнут на ±90°
export function textBox(d) {
  const w = textWidth(d.t, d.fs, d.font || 'sans', d.ls || 0);
  const h = d.fs * 1.02;
  return d.rot
    ? rect(d.cx - h / 2, d.baseline - w / 2, h, w)
    : rect(d.cx - w / 2, d.baseline - d.fs * 0.78, w, h);
}

// ---------------------------------------------------------------------------
// подписи: один генератор на каждое семейство, его же читают правила
// ---------------------------------------------------------------------------

// блок подписи помещения: кружок с номером, название, площадь.
// mode: full — всё, compact — номер и площадь, num — только номер.
// Кегль подбирается под ширину помещения, поэтому длинные названия
// в узких комнатах не вылезают за стены.
export function roomBlock(r) {
  const mode = (r.label && r.label.mode) || 'full';
  const cx = r.label && r.label.x != null ? r.label.x : r.x + r.w / 2;
  const cy = r.label && r.label.y != null ? r.label.y : r.y + r.h / 2;
  const parts = mode === 'full'
    ? (r.name.includes(' — ') ? r.name.split(' — ')
      : r.name.includes(' / ') ? r.name.split(' / ') : [r.name])
    : [];
  const areaT = `${fmt(r.w * r.h)} м²`;
  const base = (r.label && r.label.fs) || 380;
  const avail = Math.max(700, Math.min(r.w, 4400) - 260);
  const longest = parts.reduce((m, t) => Math.max(m, t.length), 0);
  const fs = longest
    ? Math.max(200, Math.min(base, Math.floor(avail / (longest * ADV.sans))))
    : 0;
  const af = mode === 'num' ? 0
    : Math.max(160, Math.min(Math.round(base * 0.87), Math.floor(avail / (areaT.length * ADV.mono))));
  const R = Math.round(Math.max(170, Math.min(270, (fs || af || 300) * 0.71)));
  const nfs = Math.round(R * 1.26);
  const lh = Math.round((fs || af || 300) * 1.24);
  const gap = 130;
  const alh = af ? Math.round(af * 1.10) : 0;
  const blockH = 2 * R + gap + parts.length * lh + alh;
  const top = cy - blockH / 2;
  const y0 = top + 2 * R + gap;

  const items = [];
  items.push({
    kind: 'num', t: String(r.n), cx, baseline: top + R + nfs * 0.33,
    fs: nfs, font: 'mono', circle: { cx, cy: top + R, r: R }
  });
  parts.forEach((t, i) => items.push({
    kind: 'name', t, cx, baseline: y0 + i * lh + fs * 0.78, fs, font: 'sans'
  }));
  if (alh) items.push({
    kind: 'area', t: areaT, cx, baseline: y0 + parts.length * lh + af * 0.78,
    fs: af, font: 'mono'
  });

  const w = items.reduce((m, d) => Math.max(m,
    d.kind === 'num' ? 2 * R : textWidth(d.t, d.fs, d.font)), 0);
  return { cx, cy, mode, items, box: rect(cx - w / 2, top, w, blockH) };
}

// Подпись оборудования ставится под символом, а не внутри него: внутри её
// перечёркивают собственные линии символа. Кегль ужимается под ширину;
// если и минимальный не влезает — подпись не рисуется, а правило сообщает.
export function furnText(f) {
  let d = null;
  if (f.t === 'c') {
    if (!f.l) return null;
    d = { t: f.l, cx: f.x, baseline: f.y + (f.lup ? -f.r - 90 : f.r + 250), fs: 210, font: 'mono', fit: 2 * f.r + 600 };
  } else if (f.sym === 'car') {
    d = { t: `${f.h} × ${f.w}`, cx: f.x + f.w / 2, baseline: f.y + f.h - 560, fs: 240, font: 'mono', fit: f.w - 440 };
  } else if (f.sym === 'bed') {
    // размер пишется внутри контура, а под узкой кроватью он не помещается.
    // Тогда он уходит наверх, как у прочей мебели: цифра нужнее пустого места
    const t = `${f.w} × ${f.h}`;
    d = { t, cx: f.x + f.w / 2, baseline: f.y + f.h - 320, fs: 240, font: 'mono', fit: f.w - 300 };
    if (Math.floor(d.fit / (t.length * ADV.mono)) < MIN_FURN_FS)
      d = { t, cx: f.x + f.w / 2, baseline: f.y - 90, fs: 210, font: 'mono', fit: Math.max(f.w, 800) + 300 };
  } else {
    if (!f.l) return null;
    d = { t: f.l, cx: f.x + f.w / 2, baseline: f.y + (f.lup ? -90 : f.h + 250), fs: 210, font: 'mono', fit: Math.max(f.w, 800) + 300 };
  }
  d.fs = Math.min(d.fs, Math.floor(d.fit / (d.t.length * ADV.mono)));
  d.fits = d.fs >= MIN_FURN_FS;
  return d;
}

// Геометрия лестницы в одном месте: план, правила и выгрузка обязаны
// понимать её одинаково. Раньше план растягивал ступени по всей шахте,
// а данные говорили проступь 275 — для цоколя это 314 против 275,
// и чертёж расходился с моделью, оставаясь при этом правдоподобным.
// Марш считается по проступи и прижимается к торцу, с которого входят;
// площадка — то, что осталось от шахты
export function stairGeom(st) {
  const steps = Math.ceil(st.risers / 2) - 1;
  const run = steps * st.tread;
  const landing = st.w - run;
  // с какого торца шахты на марш входят: площадка остаётся у противоположного.
  // По умолчанию с восточного — так стояла лестница, когда торец был один
  const east = (st.entry || 'E') === 'E';
  return {
    steps, run, landing, east,
    width: (st.h - 100) / 2,
    runX0: east ? st.x + landing : st.x,          // левый край марша
    landX0: east ? st.x : st.x + run,             // левый край площадки
    // ступень j (от 1) в марше: x её левого края
    stepX: (j, up) => east
      ? st.x + st.w - (up ? j : steps - j + 1) * st.tread
      : st.x + (up ? j - 1 : steps - j) * st.tread
  };
}

// марка лестницы садится на площадку — единственное свободное место в шахте
export function stairText(st) {
  const g = stairGeom(st);
  const fit = g.landing - 160;
  const d = { t: st.label, cx: g.landX0 + g.landing / 2, baseline: st.y + 360, fs: 260, font: 'mono', fit };
  d.fs = Math.max(165, Math.min(d.fs, Math.floor(fit / (d.t.length * ADV.mono))));
  d.fits = fit / (d.t.length * ADV.mono) >= 165;
  return d;
}

function chainTexts(kind, pos, arr) {
  const out = [];
  for (let i = 0; i < arr.length - 1; i++) {
    const a = arr[i], b = arr[i + 1], m = (a + b) / 2;
    out.push(kind === 'x'
      ? { t: String(b - a), cx: m, baseline: pos - 220, fs: 300, font: 'mono' }
      : { t: String(b - a), cx: pos - 220, baseline: m, fs: 300, font: 'mono', rot: -1 });
  }
  return out;
}

function verandaTexts(v) {
  return [
    { t: 'Веранда', cx: v.x + v.w / 2, baseline: v.y + 1100, fs: 420, font: 'sans' },
    { t: `${fmt(v.w * v.h)} м²`, cx: v.x + v.w / 2, baseline: v.y + 1620, fs: 340, font: 'mono' },
    // подпись габарита уходит ниже ступеней: на их месте она читалась как
    // размер ступени, а на чертеже это две разные вещи
    { t: `${v.w} × ${v.h}`, cx: v.x + v.w / 2, baseline: v.y + v.h + v.steps * 300 + 560, fs: 300, font: 'mono' }
  ];
}

// общая раскладка листа. Поля одинаковы для всех уровней, поэтому три плана
// выходят в одном масштабе и их можно сравнивать глазами.
// Размеры по Y идут слева, вплотную к плану: справа место занимает веранда,
// и цепочка, отодвинутая за неё, повисает в пустоте на листах без веранды.
// Поля одинаковы для всех уровней, поэтому три плана выходят в одном масштабе.
export function sheet(house, opt = {}) {
  const S = house.shell;
  const showDims = opt.dims !== false;
  const vExt = Math.max(0, ...house.levels.map(l => (l.veranda ? l.veranda.w : 0)));
  // цепочка отодвигается за то, что вынесено на западный фасад: приямок и
  // крыльцо гаража стоят на грунте слева от плана, и размерная линия,
  // прибитая к −1250, проходит прямо по ступеням
  const wExt = Math.max(0, ...outsideBits(house).filter(b => b.side === 'W').map(b => b.reach));
  const dx = -Math.max(1250, wExt + 400);   // цепочка размеров уровня
  const dx2 = dx - 900;                     // общий габарит
  const wx = dx2 - 850;                     // подпись стороны СЗ
  const ex = S.w + vExt + 800;              // подпись стороны ЮВ — за верандой
  return {
    S, showDims, dx, dx2, wx, ex,
    legendY: S.h + 3050,          // полоса условных обозначений и масштаба
    padL: -wx + 900, padT: 2900, padB: 4800, padR: vExt + 1700
  };
}

// Штамп: лист должен называть сам себя. PNG уходит в переписку без страницы
// вокруг, и без заголовка по нему не сказать даже, какой это уровень
const stampTexts = (house, L) => [
  { t: `${house.project.title} · ${L.title}`, cx: 0, baseline: -2150, fs: 420, font: 'sans', anchor: 'start' },
  ...(L.meta ? [{ t: L.meta, cx: 0, baseline: -1700, fs: 260, font: 'mono', anchor: 'start' }] : []),
  { t: 'размеры в миллиметрах', cx: 0, baseline: -1300, fs: 240, font: 'mono', anchor: 'start' }
];

// Условные обозначения собираются по тому, что на листе есть: легенда с
// пунктом, которого на чертеже нет, врёт не меньше, чем отсутствующая
export function legendItems(house, L) {
  const out = [];
  if ((L.walls || []).some(w => w.fire) || (L.openings || []).some(o => o.fire))
    out.push({ sym: 'fire', t: 'противопожарная преграда' });
  if (L.riser) out.push({ sym: 'riser', t: 'стояк канализации' });
  if ((L.ducts || []).length) out.push({ sym: 'duct', t: 'вентшахта' });
  if ((L.flues || []).length) out.push({ sym: 'flue', t: 'дымоход' });
  return out;
}

// две колонки по два пункта: длинный пункт в узкую колонку не влезает,
// а правило о наложении подписей ловит это сразу
const legendText = (g, i) => ({
  t: legendItems.list[i].t, cx: 700 + (i % 2) * 4200,
  baseline: g.legendY + Math.floor(i / 2) * 520, fs: 220, font: 'mono'
});

// все подписи листа одним списком — это и рисуется, и проверяется
export function labelBoxes(house, L, opt = {}) {
  const g = sheet(house, opt), S = g.S, out = [];
  const add = (kind, owner, d) => out.push({ kind, owner, ...textBox(d) });

  for (const r of L.rooms) out.push({ kind: 'room', owner: r.name, ...roomBlock(r).box });
  if (opt.furniture !== false)
    for (const f of L.furniture || []) {
      const d = furnText(f);
      if (d && d.fits) add('furn', f.l || f.t, d);
    }
  if (L.stair) add('stair', 'марка лестницы', stairText(L.stair));
  if (L.veranda) for (const d of verandaTexts(L.veranda)) add('veranda', 'веранда', d);
  if (g.showDims) {
    for (const d of chainTexts('x', S.h + 950, L.dims.x)) add('dim', 'размер X', d);
    for (const d of chainTexts('x', S.h + 1850, [0, S.w])) add('dim', 'габарит X', d);
    for (const d of chainTexts('y', g.dx, L.dims.y)) add('dim', 'размер Y', d);
    for (const d of chainTexts('y', g.dx2, [0, S.h])) add('dim', 'габарит Y', d);
  }
  for (const d of stampTexts(house, L)) {
    const b = textBox(d);
    out.push({ kind: 'stamp', owner: d.t.slice(0, 24), x: d.cx, y: b.y, w: b.w, h: b.h });
  }
  const items = legendItems(house, L);
  legendItems.list = items;
  items.forEach((it, i) => {
    const d = legendText(g, i);
    const b = textBox(d);
    out.push({ kind: 'legend', owner: it.t, x: b.x - 600, y: b.y, w: b.w + 600, h: b.h });
  });
  const sides = house.site.sides;
  add('side', 'ЮЗ', { t: sides.S, cx: S.w / 2, baseline: -700, fs: 400, font: 'mono', ls: 120 });
  add('side', 'СВ', { t: sides.N, cx: S.w / 2, baseline: S.h + 2420, fs: 340, font: 'mono', ls: 120 });
  add('side', 'СЗ', { t: sides.W, cx: g.wx, baseline: S.h / 2, fs: 340, font: 'mono', ls: 80, rot: -1 });
  add('side', 'ЮВ', { t: sides.E, cx: g.ex, baseline: S.h / 2, fs: 340, font: 'mono', ls: 80, rot: 1 });
  return out;
}

// ---------------------------------------------------------------------------
// отрисовка
// ---------------------------------------------------------------------------

const t2svg = (d, fill, extra = '') =>
  `<text x="${Math.round(d.cx)}" y="${Math.round(d.baseline)}" text-anchor="middle" font-size="${Math.round(d.fs)}"`
  + (d.font === 'mono' ? ' font-family="IBM Plex Mono,monospace"' : '')
  + (d.ls ? ` letter-spacing="${d.ls}"` : '')
  + (d.rot ? ` transform="rotate(${d.rot < 0 ? -90 : 90} ${Math.round(d.cx)} ${Math.round(d.baseline)})"` : '')
  + ` fill="${fill}"${extra}>${esc(d.t)}</text>`;

// ореол под текстом должен быть цвета подложки, иначе на тонированных
// помещениях (гараж, спальные) под подписью появляется белая клякса
const roomFill = r => r.tag === 'garage' ? C.garage : r.tag === 'quiet' ? C.quiet : C.room;
const halo = (fill = C.room, w = 160) =>
  ` paint-order="stroke" stroke="${fill}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;

function winRect(w, S) {
  const t = S.wall;
  if (w.side === 'S') return { x: w.a, y: 0, w: w.b - w.a, h: t, l: [[w.a, t / 2], [w.b, t / 2]] };
  if (w.side === 'N') return { x: w.a, y: S.h - t, w: w.b - w.a, h: t, l: [[w.a, S.h - t / 2], [w.b, S.h - t / 2]] };
  if (w.side === 'W') return { x: 0, y: w.a, w: t, h: w.b - w.a, l: [[t / 2, w.a], [t / 2, w.b]] };
  return { x: S.w - t, y: w.a, w: t, h: w.b - w.a, l: [[S.w - t / 2, w.a], [S.w - t / 2, w.b]] };
}

function chain(kind, pos, arr) {
  let s = '';
  for (let i = 0; i < arr.length - 1; i++) {
    const a = arr[i], b = arr[i + 1];
    if (kind === 'x') {
      s += `<line x1="${a}" y1="${pos}" x2="${b}" y2="${pos}" stroke="${C.ink35}" stroke-width="30"/>`;
      s += `<line x1="${a}" y1="${pos - 140}" x2="${a}" y2="${pos + 140}" stroke="${C.ink35}" stroke-width="50"/>`;
      s += `<line x1="${b}" y1="${pos - 140}" x2="${b}" y2="${pos + 140}" stroke="${C.ink35}" stroke-width="50"/>`;
    } else {
      s += `<line x1="${pos}" y1="${a}" x2="${pos}" y2="${b}" stroke="${C.ink35}" stroke-width="30"/>`;
      s += `<line x1="${pos - 140}" y1="${a}" x2="${pos + 140}" y2="${a}" stroke="${C.ink35}" stroke-width="50"/>`;
      s += `<line x1="${pos - 140}" y1="${b}" x2="${pos + 140}" y2="${b}" stroke="${C.ink35}" stroke-width="50"/>`;
    }
  }
  for (const d of chainTexts(kind, pos, arr)) s += t2svg(d, C.ink60);
  return s;
}

function stairGlyph(st) {
  let s = '';
  const g = stairGeom(st), { steps, width: half } = g;
  for (let i = 1; i <= steps; i++) {
    const x = g.stepX(i, true);
    s += `<line x1="${x}" y1="${st.y}" x2="${x}" y2="${st.y + half}" stroke="${C.furn}" stroke-width="28"/>`;
    s += `<line x1="${x}" y1="${st.y + half + 100}" x2="${x}" y2="${st.y + st.h}" stroke="${C.furn}" stroke-width="28"/>`;
  }
  s += `<line x1="${st.x}" y1="${st.y + half + 50}" x2="${st.x + st.w}" y2="${st.y + half + 50}" stroke="${C.furn}" stroke-width="50"/>`;
  const edge = g.east ? st.x + g.landing : st.x + g.run;
  s += `<line x1="${edge}" y1="${st.y}" x2="${edge}" y2="${st.y + st.h}" stroke="${C.furn}" stroke-width="40" stroke-dasharray="120 100"/>`;
  s += t2svg(stairText(st), C.ink60, halo());
  return s;
}

// ---------------------------------------------------------------------------
// символы оборудования
//
// Каждый символ рисуется в местных координатах 0…lw по X и 0…lh по Y,
// лицом к +Y. Поворот задаётся полем face и делается группой, поэтому
// сам символ про ориентацию не знает и остаётся коротким.
// ---------------------------------------------------------------------------

const SW = { out: 30, det: 22, hair: 15 };   // контур, деталь, штриховка
const SOFT = 130;                            // скругление мягкой мебели

const R = (x, y, w, h, r = 0, extra = '') =>
  `<rect x="${Math.round(x)}" y="${Math.round(y)}" width="${Math.round(w)}" height="${Math.round(h)}"${r ? ` rx="${Math.round(r)}"` : ''}${extra}/>`;
const LN = (x1, y1, x2, y2, w = SW.det) =>
  `<line x1="${Math.round(x1)}" y1="${Math.round(y1)}" x2="${Math.round(x2)}" y2="${Math.round(y2)}" stroke-width="${w}"/>`;
const CI = (cx, cy, r, w = SW.det) =>
  `<circle cx="${Math.round(cx)}" cy="${Math.round(cy)}" r="${Math.round(r)}" fill="none" stroke-width="${w}"/>`;
const EL = (cx, cy, rx, ry, w = SW.det, fill = 'none') =>
  `<ellipse cx="${Math.round(cx)}" cy="${Math.round(cy)}" rx="${Math.round(rx)}" ry="${Math.round(ry)}" fill="${fill}" stroke-width="${w}"/>`;

// равномерная раскладка n линий по отрезку — полки, доски, ящики
const combLines = (n, a, b, at) => {
  let s = '';
  for (let i = 1; i <= n; i++) s += at(a + (b - a) * i / (n + 1));
  return s;
};

const SYM = {
  sofa: (w, h) => R(0, 0, w, h, SOFT, ` fill="${C.furnFill}"`)
    + R(0, 0, w, h * 0.34, SOFT, ` fill="none"`)
    + R(0, 0, w * 0.15, h, SOFT, ` fill="none"`)
    + R(w * 0.85, 0, w * 0.15, h, SOFT, ` fill="none"`)
    + combLines(Math.max(1, Math.round(w / 900) - 1), w * 0.15, w * 0.85,
      x => LN(x, h * 0.34, x, h * 0.94, SW.hair)),

  armchair: (w, h) => R(0, 0, w, h, SOFT, ` fill="${C.furnFill}"`)
    + R(0, 0, w, h * 0.36, SOFT, ' fill="none"'),

  bed: (w, h) => R(0, 0, w, h, 90, ` fill="${C.furnFill}"`)
    + R(w * 0.07, h * 0.05, w * 0.4, h * 0.17, 50, ' fill="none"')
    + (w > 1400 ? R(w * 0.53, h * 0.05, w * 0.4, h * 0.17, 50, ' fill="none"') : '')
    + LN(0, h * 0.34, w, h * 0.34),

  nightstand: (w, h) => R(0, 0, w, h, 30, ` fill="${C.furnFill}"`)
    + LN(w * 0.25, h * 0.72, w * 0.75, h * 0.72, SW.hair),

  dresser: (w, h) => R(0, 0, w, h, 20, ` fill="${C.furnFill}"`)
    + combLines(2, 0, w, x => LN(x, 0, x, h, SW.hair))
    + combLines(1, 0, h, y => LN(w * 0.06, y, w * 0.94, y, SW.hair)),

  wardrobe: (w, h) => R(0, 0, w, h, 0, ` fill="${C.furnFill}"`)
    + LN(w * 0.5, 0, w * 0.5, h)
    + LN(w * 0.42, h * 0.5, w * 0.46, h * 0.5, SW.det)
    + LN(w * 0.54, h * 0.5, w * 0.58, h * 0.5, SW.det),

  // стеллаж: полки поперёк длинной стороны
  rack: (w, h) => R(0, 0, w, h, 0, ` fill="${C.furnFill}"`)
    + (w >= h
      ? combLines(Math.max(1, Math.round(w / 700)), 0, w, x => LN(x, 0, x, h, SW.hair))
      : combLines(Math.max(1, Math.round(h / 700)), 0, h, y => LN(0, y, w, y, SW.hair))),

  desk: (w, h) => R(0, 0, w, h, 20, ` fill="${C.furnFill}"`)
    + LN(0, h * 0.78, w, h * 0.78, SW.hair),

  bench: (w, h) => R(0, 0, w, h, 30, ` fill="${C.furnFill}"`)
    + combLines(2, 0, h, y => LN(0, y, w, y, SW.hair)),

  // стол со стульями по длинным сторонам
  table: (w, h) => {
    const n = Math.max(1, Math.floor(w / 700)), cw = Math.min(460, w / n - 90), cd = 420;
    let s = R(0, 0, w, h, 40, ` fill="${C.furnFill}"`);
    for (let i = 0; i < n; i++) {
      const cx = w * (i + 0.5) / n - cw / 2;
      s += R(cx, -cd - 60, cw, cd, 60, ' fill="none"');
      s += R(cx, h + 60, cw, cd, 60, ' fill="none"');
    }
    return s;
  },

  kitchen: (w, h) => R(0, 0, w, h, 0, ` fill="${C.furnFill}"`)
    + LN(0, h * 0.82, w, h * 0.82, SW.hair)
    + R(w * 0.08, h * 0.16, 620, h * 0.62, 60, ' fill="none"')
    + CI(w * 0.08 + 310, h * 0.47, 55, SW.hair)
    + combLines(1, 0, 1, () => '')
    + [[0.42, 0.3], [0.42, 0.7], [0.56, 0.3], [0.56, 0.7]]
      .map(([fx, fy]) => CI(w * fx, h * fy, Math.min(115, h * 0.2), SW.hair)).join('')
    + R(w * 0.72, h * 0.14, w * 0.2, h * 0.66, 30, ' fill="none"'),

  fridge: (w, h) => R(0, 0, w, h, 20, ` fill="${C.techFill}"`)
    + LN(w * 0.86, h * 0.08, w * 0.86, h * 0.92, SW.hair)
    + LN(w * 0.78, h * 0.36, w * 0.78, h * 0.64, SW.det),

  washer: (w, h) => R(0, 0, w, h, 20, ` fill="${C.techFill}"`)
    + CI(w / 2, h * 0.58, Math.min(w, h) * 0.29)
    + LN(w * 0.12, h * 0.16, w * 0.88, h * 0.16, SW.hair),

  washerCol: (w, h) => R(0, 0, w, h, 20, ` fill="${C.techFill}"`)
    + LN(0, h / 2, w, h / 2, SW.det)
    + CI(w / 2, h * 0.28, Math.min(w, h / 2) * 0.29)
    + CI(w / 2, h * 0.78, Math.min(w, h / 2) * 0.29),

  bath: (w, h) => R(0, 0, w, h, 150, ` fill="${C.techFill}"`)
    + R(70, 70, w - 140, h - 140, 110, ' fill="none"')
    + CI(w > h ? w - 330 : w / 2, w > h ? h / 2 : h - 330, 60, SW.hair),

  shower: (w, h) => R(0, 0, w, h, 40, ` fill="${C.techFill}"`)
    + CI(w / 2, h / 2, 70, SW.hair)
    + LN(0, 0, w, h, SW.hair) + LN(w, 0, 0, h, SW.hair),

  wc: (w, h) => R(w * 0.1, 0, w * 0.8, h * 0.26, 20, ` fill="${C.techFill}"`)
    + EL(w / 2, h * 0.62, w * 0.4, h * 0.34, SW.out, C.techFill),

  sink: (w, h) => R(0, 0, w, h, 60, ` fill="${C.techFill}"`)
    + R(90, 110, w - 180, h - 190, 50, ' fill="none"')
    + CI(w / 2, h * 0.16, 55, SW.hair),

  boiler: (w, h) => R(0, 0, w, h, 20, ` fill="${C.techFill}"`)
    + R(w * 0.12, h * 0.55, w * 0.76, h * 0.36, 20, ' fill="none"')
    + LN(w * 0.12, h * 0.42, w * 0.88, h * 0.42, SW.hair),

  tank: r => CI(0, 0, r, SW.out) + CI(0, 0, r * 0.62, SW.hair),

  ahu: (w, h) => R(0, 0, w, h, 20, ` fill="${C.techFill}"`)
    + CI(w * 0.28, h / 2, Math.min(w * 0.2, h * 0.32))
    + LN(w * 0.56, h * 0.2, w * 0.92, h * 0.2, SW.hair)
    + LN(w * 0.56, h * 0.5, w * 0.92, h * 0.5, SW.hair)
    + LN(w * 0.56, h * 0.8, w * 0.92, h * 0.8, SW.hair),

  panel: (w, h) => R(0, 0, w, h, 10, ` fill="${C.techFill}"`)
    + combLines(2, 0, w, x => LN(x, 0, x, h, SW.hair)),

  firewood: (w, h) => R(0, 0, w, h, 20, ` fill="${C.furnFill}"`)
    + [0.18, 0.38, 0.58, 0.78].map(fx => CI(w * fx, h * 0.5, Math.min(h * 0.28, 130), SW.hair)).join(''),

  benchSauna: (w, h) => R(0, 0, w, h, 20, ` fill="${C.furnFill}"`)
    + (w >= h
      ? combLines(Math.max(1, Math.round(h / 220)), 0, h, y => LN(0, y, w, y, SW.hair))
      : combLines(Math.max(1, Math.round(w / 220)), 0, w, x => LN(x, 0, x, h, SW.hair))),

  heaterSauna: r => CI(0, 0, r, SW.out)
    + [[-0.36, -0.3], [0.32, -0.34], [-0.02, 0.02], [-0.4, 0.34], [0.36, 0.3]]
      .map(([fx, fy]) => CI(r * fx, r * fy, r * 0.24, SW.hair)).join(''),

  drain: r => CI(0, 0, r, SW.out) + CI(0, 0, r * 0.34, SW.hair)
    + LN(-r * 0.72, 0, r * 0.72, 0, SW.hair) + LN(0, -r * 0.72, 0, r * 0.72, SW.hair),

  tv: (w, h) => R(0, 0, w, h, 20, ` fill="${C.furnFill}"`)
    + LN(w * 0.5, 0, w * 0.5, h, SW.hair)
    + LN(w * 0.28, h * 0.5, w * 0.72, h * 0.5, SW.hair),

  workbench: (w, h) => R(0, 0, w, h, 10, ` fill="${C.furnFill}"`)
    + combLines(3, 0, h, y => LN(0, y, w, y, SW.hair))
    + R(w - 380, h * 0.18, 300, h * 0.3, 20, ' fill="none"'),

  machine: (w, h) => R(0, 0, w, h, 10, ` fill="${C.techFill}"`)
    + CI(w / 2, h / 2, Math.min(w, h) * 0.26)
    + LN(w * 0.12, h / 2, w * 0.88, h / 2, SW.hair),

  // машина: капот сужается к переду (+Y), колёса по углам
  car: (w, h) => R(0, 0, w, h, 340, ` fill="${C.furnFill}"`)
    + R(w * 0.11, h * 0.16, w * 0.78, h * 0.42, 170, ' fill="none"')
    + LN(w * 0.11, h * 0.58, w * 0.89, h * 0.58, SW.hair)
    + [[0.02, 0.13], [0.02, 0.66], [0.9, 0.13], [0.9, 0.66]]
      .map(([fx, fy]) => R(w * fx, h * fy, w * 0.08, h * 0.21, 40, ' fill="none"')).join('')
};

const FACE = { N: 0, E: 90, S: 180, W: 270 };

function furnGlyph(f) {
  const d = furnText(f);
  const sym = f.sym || (f.t === 'c' ? 'tank' : 'rack');
  const label = d && d.fits ? t2svg(d, C.ink35) : '';
  const attrs = ` fill="none" stroke="${C.furn}" stroke-linejoin="round"`;

  if (f.t === 'c') {
    const draw = SYM[sym] || SYM.tank;
    return `<g transform="translate(${f.x} ${f.y})"${attrs}>`
      + `<circle cx="0" cy="0" r="${f.r}" fill="${sym === 'drain' ? 'none' : C.furnFill}"/>`
      + draw(f.r) + `</g>` + label;
  }

  const deg = FACE[f.face] || 0;
  const swap = deg % 180 !== 0;
  const lw = swap ? f.h : f.w, lh = swap ? f.w : f.h;
  const cx = f.x + f.w / 2, cy = f.y + f.h / 2;
  const draw = SYM[sym] || SYM.rack;
  return `<g transform="rotate(${deg} ${cx} ${cy}) translate(${cx - lw / 2} ${cy - lh / 2})"${attrs}>`
    + draw(lw, lh) + `</g>` + label;
}

// Масштабная линейка: по ней чертёж читается в любом размере — на экране,
// в печати и на скриншоте, где никакого «1:50» уже нет
function scaleBar(x, y) {
  const unit = 1000, n = 3, h = 130;
  let s = '';
  for (let i = 0; i < n; i++)
    s += `<rect x="${x + i * unit}" y="${y}" width="${unit}" height="${h}" fill="${i % 2 ? C.paper : C.ink60}" stroke="${C.ink60}" stroke-width="30"/>`;
  for (let i = 0; i <= n; i++)
    s += t2svg({ t: String(i), cx: x + i * unit, baseline: y - 130, fs: 240, font: 'mono' }, C.ink60);
  return s + t2svg({ t: 'м', cx: x + n * unit + 350, baseline: y - 130, fs: 240, font: 'mono' }, C.ink35);
}

// значок условного обозначения — тот же, что на чертеже, только мельче
function legendGlyph(sym, x, y) {
  const r = 190;
  if (sym === 'fire') return `<rect x="${x - r}" y="${y - r * 0.62}" width="${2 * r}" height="${r * 1.24}" fill="none" stroke="${C.heat}" stroke-width="60"/>`;
  const b = `<rect x="${x - r}" y="${y - r}" width="${2 * r}" height="${2 * r}" fill="none" stroke="${C.ink}" stroke-width="45"/>`;
  if (sym === 'riser') return b
    + `<line x1="${x - r}" y1="${y - r}" x2="${x + r}" y2="${y + r}" stroke="${C.ink}" stroke-width="35"/>`
    + `<line x1="${x + r}" y1="${y - r}" x2="${x - r}" y2="${y + r}" stroke="${C.ink}" stroke-width="35"/>`;
  if (sym === 'flue') return b + `<circle cx="${x}" cy="${y}" r="${r * 0.56}" fill="none" stroke="${C.ink}" stroke-width="35"/>`;
  return b + `<line x1="${x}" y1="${y + r * 0.6}" x2="${x}" y2="${y - r * 0.6}" stroke="${C.ink}" stroke-width="35"/>`
    + `<path d="M${x - r * 0.36} ${y - r * 0.21} L${x} ${y - r * 0.6} L${x + r * 0.36} ${y - r * 0.21}" fill="none" stroke="${C.ink}" stroke-width="35"/>`;
}

function legend(house, L, g) {
  const items = legendItems(house, L);
  legendItems.list = items;
  let s = '';
  items.forEach((it, i) => {
    const d = legendText(g, i);
    s += legendGlyph(it.sym, d.cx - 400, d.baseline - 80);
    s += t2svg(d, C.ink60).replace('text-anchor="middle"', 'text-anchor="start"');
  });
  return s;
}

function compass(cx, cy, az) {
  const a = az * Math.PI / 180, r = 620;
  const nx = cx + r * Math.sin(a), ny = cy - r * Math.cos(a);
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${C.ink35}" stroke-width="35"/>`
    + `<line x1="${cx}" y1="${cy}" x2="${nx}" y2="${ny}" stroke="${C.ink}" stroke-width="70"/>`
    + `<circle cx="${nx}" cy="${ny}" r="110" fill="${C.ink}"/>`
    + t2svg({ t: 'С', cx: nx, baseline: ny + 380, fs: 290, font: 'mono' }, C.ink60);
}

export function renderLevel(house, L, opt = {}) {
  const g = sheet(house, opt), S = g.S, sides = house.site.sides;
  const showFurn = opt.furniture !== false;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-g.padL} ${-g.padT} ${S.w + g.padL + g.padR} ${S.h + g.padT + g.padB}" font-family="IBM Plex Sans,system-ui,sans-serif">`;
  s += `<rect x="${-g.padL}" y="${-g.padT}" width="${S.w + g.padL + g.padR}" height="${S.h + g.padT + g.padB}" fill="${C.paper}"/>`;

  if (L.veranda) {
    const v = L.veranda, V = verandaGeom(house);
    // настил досками поперёк, свай под ним не видно — они пунктиром
    s += `<rect x="${v.x}" y="${v.y}" width="${v.w}" height="${v.h}" fill="${C.paper}" stroke="${C.ink35}" stroke-width="70"/>`;
    for (let y = v.y + 300; y < v.y + v.h; y += 300)
      s += `<line x1="${v.x + 120}" y1="${y}" x2="${v.x + v.w - 120}" y2="${y}" stroke="${C.ink35}" stroke-width="35"/>`;
    for (const p of V.piles)
      s += `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" fill="none" stroke="${C.ink35}" stroke-width="45" stroke-dasharray="120 90"/>`;
    // контур навеса: он шире настила на свес, иначе вода льётся на доски
    const b = V.canopyBox;
    s += `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="none" stroke="${C.ink35}" stroke-width="55" stroke-dasharray="300 200"/>`;
    for (const p of V.posts) s += `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" fill="${C.ink}"/>`;
    // ступени с дальнего торца
    for (let i = 0; i < v.steps; i++)
      s += `<rect x="${v.x + 400}" y="${v.y + v.h + i * 300}" width="1200" height="300" fill="none" stroke="${C.ink35}" stroke-width="55"/>`;
    const vt = verandaTexts(v);
    s += t2svg(vt[0], C.ink) + t2svg(vt[1], C.ink60) + t2svg(vt[2], C.ink35);
  }

  s += `<rect x="0" y="0" width="${S.w}" height="${S.h}" fill="${C.ink}"/>`;
  s += `<rect x="${S.wall}" y="${S.wall}" width="${S.w - 2 * S.wall}" height="${S.h - 2 * S.wall}" fill="${C.room}"/>`;

  for (const r of L.rooms) {
    const fill = r.tag === 'garage' ? C.garage : r.tag === 'quiet' ? C.quiet : null;
    if (fill) s += `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="${fill}"/>`;
  }
  // сетка плитки: мокрое помещение видно на плане само, без подписи
  for (const r of L.rooms) {
    if (r.tag !== 'wet') continue;
    const step = 300;
    for (let x = r.x + step; x < r.x + r.w; x += step)
      s += `<line x1="${x}" y1="${r.y}" x2="${x}" y2="${r.y + r.h}" stroke="${C.tile}" stroke-width="25"/>`;
    for (let y = r.y + step; y < r.y + r.h; y += step)
      s += `<line x1="${r.x}" y1="${y}" x2="${r.x + r.w}" y2="${y}" stroke="${C.tile}" stroke-width="25"/>`;
  }
  for (const w of L.walls) {
    s += `<rect x="${w.x}" y="${w.y}" width="${w.w}" height="${w.h}" fill="${C.ink}"/>`;
    if (w.fire) s += `<rect x="${w.x}" y="${w.y - 80}" width="${w.w}" height="${w.h + 160}" fill="none" stroke="${C.heat}" stroke-width="60"/>`;
  }
  for (const o of L.openings || []) {
    if (o.dir === 'h') {
      s += `<rect x="${o.x}" y="${o.y - 20}" width="${o.w}" height="${o.t + 40}" fill="${C.room}"/>`;
      if (o.fire) s += `<line x1="${o.x}" y1="${o.y + o.t / 2}" x2="${o.x + o.w}" y2="${o.y + o.t / 2}" stroke="${C.heat}" stroke-width="70"/>`;
    } else {
      s += `<rect x="${o.x - 20}" y="${o.y}" width="${o.t + 40}" height="${o.w}" fill="${C.room}"/>`;
      if (o.fire) s += `<line x1="${o.x + o.t / 2}" y1="${o.y}" x2="${o.x + o.t / 2}" y2="${o.y + o.w}" stroke="${C.heat}" stroke-width="70"/>`;
    }
  }
  // окно, дверь, входная дверь и ворота должны отличаться на глаз,
  // иначе вход в дом читается как окно
  for (const w of L.windows || []) {
    const r = winRect(w, S);
    const horiz = w.side === 'S' || w.side === 'N';
    const [[x1, y1], [x2, y2]] = r.l;
    const off = (d) => horiz ? `x1="${x1}" y1="${y1 + d}" x2="${x2}" y2="${y2 + d}"` : `x1="${x1 + d}" y1="${y1}" x2="${x2 + d}" y2="${y2}"`;
    s += `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="${C.paper}"/>`;
    if (!w.kind) {
      s += `<line ${off(-70)} stroke="${C.ink}" stroke-width="55"/><line ${off(70)} stroke="${C.ink}" stroke-width="55"/>`;
    } else if (w.kind === 'hatch') {
      // люк для дров: проём в стене штрихом, снаружи приямок с крышкой
      s += `<line ${off(0)} stroke="${C.ink}" stroke-width="110" stroke-dasharray="150 120"/>`;
      const P = pitGeom(house).find(q => q.win === w.id);
      if (P) {
        const b = P.box;
        s += `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="${C.paper}" stroke="${C.ink}" stroke-width="90"/>`;
        // решётка крышки: по ней ходят, поэтому она читается как настил, а не как яма
        const step = 220, horizGrid = b.w > b.h;
        for (let t = step; t < (horizGrid ? b.w : b.h); t += step)
          s += horizGrid
            ? `<line x1="${b.x + t}" y1="${b.y + 60}" x2="${b.x + t}" y2="${b.y + b.h - 60}" stroke="${C.ink35}" stroke-width="40"/>`
            : `<line x1="${b.x + 60}" y1="${b.y + t}" x2="${b.x + b.w - 60}" y2="${b.y + t}" stroke="${C.ink35}" stroke-width="40"/>`;
        // лоток: дно ямы падает к люку, и на плане это стрелка уклона.
        // Без неё яма выглядит корытом с ровным дном, а дрова в ней и остаются
        const c = P.clear, cy = c.y + c.h / 2, cx = c.x + c.w / 2;
        s += P.side === 'W' ? arrow(c.x + 100, cy, c.x + c.w - 100, cy)
          : P.side === 'E' ? arrow(c.x + c.w - 100, cy, c.x + 100, cy)
            : P.side === 'S' ? arrow(cx, c.y + 100, cx, c.y + c.h - 100)
              : arrow(cx, c.y + c.h - 100, cx, c.y + 100);
      }
    } else if (w.kind === 'gate') {
      s += `<line ${off(0)} stroke="${C.ink}" stroke-width="110" stroke-dasharray="420 220"/>`;
    } else {
      s += `<line ${off(0)} stroke="${C.ink}" stroke-width="${w.kind === 'entrance' ? 150 : 110}"/>`;
      if (w.kind === 'entrance')
        for (const e of [0, 1]) {
          const px = horiz ? (e ? x2 : x1) : x1, py = horiz ? y1 : (e ? y2 : y1);
          s += horiz
            ? `<line x1="${px}" y1="${py - 200}" x2="${px}" y2="${py + 200}" stroke="${C.ink}" stroke-width="70"/>`
            : `<line x1="${px - 200}" y1="${py}" x2="${px + 200}" y2="${py}" stroke="${C.ink}" stroke-width="70"/>`;
        }
    }
  }
  // Крыльцо: площадка вплотную к стене и ступени от неё наружу. На плане
  // дверь в стене выглядит одинаково и с крыльцом, и без — а без него
  // из гаража шагают в грунт на 300 мм вниз
  for (const q of porchGeom(house)) {
    if (!(L.windows || []).some(w => w.id === q.win)) continue;
    s += `<rect x="${q.pad.x}" y="${q.pad.y}" width="${q.pad.w}" height="${q.pad.h}" fill="${C.paper}" stroke="${C.ink}" stroke-width="90"/>`;
    for (const st of q.steps)
      s += `<rect x="${st.x}" y="${st.y}" width="${st.w}" height="${st.h}" fill="${C.paper}" stroke="${C.ink35}" stroke-width="70"/>`;
  }

  // шахты: стояк канализации крестом, дымоход с кружком внутри
  if (L.riser) {
    const q = L.riser;
    s += `<rect x="${q.x}" y="${q.y}" width="${q.w}" height="${q.h}" fill="none" stroke="${C.ink}" stroke-width="45"/>`;
    s += `<line x1="${q.x}" y1="${q.y}" x2="${q.x + q.w}" y2="${q.y + q.h}" stroke="${C.ink}" stroke-width="35"/>`;
    s += `<line x1="${q.x + q.w}" y1="${q.y}" x2="${q.x}" y2="${q.y + q.h}" stroke="${C.ink}" stroke-width="35"/>`;
  }
  for (const f of L.flues || []) {
    s += `<rect x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}" fill="none" stroke="${C.ink}" stroke-width="45"/>`;
    s += `<circle cx="${f.x + f.w / 2}" cy="${f.y + f.h / 2}" r="${Math.min(f.w, f.h) * 0.28}" fill="none" stroke="${C.ink}" stroke-width="35"/>`;
  }
  // вентшахта — тот же квадрат, но со стрелкой потока
  for (const d of L.ducts || []) {
    const cx = d.x + d.w / 2, cy = d.y + d.h / 2, r = Math.min(d.w, d.h) * 0.3;
    s += `<rect x="${d.x}" y="${d.y}" width="${d.w}" height="${d.h}" fill="none" stroke="${C.ink}" stroke-width="45"/>`;
    s += `<line x1="${cx}" y1="${cy + r}" x2="${cx}" y2="${cy - r}" stroke="${C.ink}" stroke-width="35"/>`;
    s += `<path d="M${cx - r * 0.6} ${cy - r * 0.35} L${cx} ${cy - r} L${cx + r * 0.6} ${cy - r * 0.35}" fill="none" stroke="${C.ink}" stroke-width="35"/>`;
  }
  if (L.stair) s += stairGlyph(L.stair);
  if (showFurn) {
    const g0 = opt.pale ? `<g opacity="${opt.pale}">` : '';
    s += g0;
    for (const f of L.furniture || []) s += furnGlyph(f);
    if (g0) s += '</g>';
  }
  if (opt.overlay) s += opt.overlay;

  if (opt.pale) s += `<g opacity="0.5">`;
  for (const r of L.rooms) {
    const fill = roomFill(r);
    for (const d of roomBlock(r).items) {
      if (d.circle) {
        s += `<circle cx="${Math.round(d.circle.cx)}" cy="${Math.round(d.circle.cy)}" r="${d.circle.r}" fill="${C.ink}"/>`;
        s += t2svg(d, C.room);
      } else s += t2svg(d, d.kind === 'area' ? C.ink60 : C.ink, halo(fill));
    }
  }
  if (opt.pale) s += `</g>`;

  if (g.showDims) {
    s += chain('x', S.h + 950, L.dims.x);
    s += chain('x', S.h + 1850, [0, S.w]);
    s += chain('y', g.dx, L.dims.y);
    s += chain('y', g.dx2, [0, S.h]);
  }

  for (const d of stampTexts(house, L))
    s += t2svg(d, d.fs > 300 ? C.ink : C.ink60).replace('text-anchor="middle"', 'text-anchor="start"');
  s += scaleBar(0, g.legendY + 1150);
  s += legend(house, L, g);

  s += compass(S.w + 1100, -900, house.site.frontAzimuth);
  s += t2svg({ t: sides.S, cx: S.w / 2, baseline: -700, fs: 400, font: 'mono', ls: 120 }, C.ink);
  s += t2svg({ t: sides.N, cx: S.w / 2, baseline: S.h + 2420, fs: 340, font: 'mono', ls: 120 }, C.ink35);
  s += t2svg({ t: sides.W, cx: g.wx, baseline: S.h / 2, fs: 340, font: 'mono', ls: 80, rot: -1 }, C.ink35);
  s += t2svg({ t: sides.E, cx: g.ex, baseline: S.h / 2, fs: 340, font: 'mono', ls: 80, rot: 1 }, C.ink35);
  s += `</svg>`;
  return s;
}

// ---------------------------------------------------------------------------
// план кровли
//
// Лист отвечает на три вопроса: куда течёт вода, где кровлю протыкают трубы
// и из чего она собрана. Ничего из этого нельзя увидеть на планах этажей:
// там кровля — пустое место над последним потолком.
//
// Отметки берутся из roof.mjs, а не пишутся в чертёж руками: поменялся уклон —
// поехали и конёк, и карниз, и высота каждой трубы, и подписи под ними.
// ---------------------------------------------------------------------------

const mark = z => (z < 0 ? '−' : '+') + (Math.abs(z) / 1000).toFixed(3).replace('.', ',');

export function roofSheet(house) {
  const g = roofGeom(house), V = verandaGeom(house);
  const b = V && V.canopyBox;
  const ex = g.out.x + g.out.w, ey = g.out.y + g.out.h;
  return {
    g, V, x0: g.out.x, y0: g.out.y,
    x1: b ? Math.max(ex, b.x + b.w) : ex,
    y1: b ? Math.max(ey, b.y + b.h) : ey,
    padL: 3900, padT: 2900, padB: 7700, padR: 1700
  };
}

// состав кровли словами: сечения и шаги живут в данных, поэтому примечание
// не может разойтись со сметой и с выгрузкой
const roofNotes = (R, g) => [
  `покрытие — ${R.cover}`,
  `${g.trusses} висячих ферм с шагом ${R.rafterStep}: стропила ${R.rafter[0]}×${R.rafter[1]}, затяжка ${R.tie[0]}×${R.tie[1]}, бабка 2×${R.hanger[1]}×${R.hanger[0]}`,
  `конькового прогона нет: под линией конька несущей стены нет на всю длину дома, распор замыкает затяжка`,
  `сплошной настил ${R.sheathing} по контробрешётке ${R.counter[0]}×${R.counter[1]}, ветровые связи ${R.brace[1]}×${R.brace[0]}`,
  `мауэрлат ${R.mauerlat[0]}×${R.mauerlat[1]} по армопоясу, отметка ${mark(R.base)}; низ стропила ${mark(g.rafterZ)}`,
  `чердачное перекрытие ${g.attic.toFixed(1).replace('.', ',')} м² по затяжкам, утепление ${R.insulation}`,
  `водосток — жёлоб ø${R.gutter} по карнизу${R.snowGuard ? ', снегозадержание' : ''}`,
  `водосточных труб ${g.drains} × ø${R.downpipe || 100}, длина ${(g.drainLen / 1000).toFixed(1).replace('.', ',')} м`,
  `чердак холодный, продух ${R.vent} в каждом фронтоне`
];

// стрелки уклона: от конька к карнизу, по одной на скат
function slopeArrows(house) {
  const g = roofGeom(house), o = g.out;
  if (g.alongY) {
    const y = Math.round(o.y + o.h * 0.22);
    return [
      { x1: g.ridge.x1, y1: y, x2: o.x + 200, y2: y },
      { x1: g.ridge.x1, y1: y, x2: o.x + o.w - 200, y2: y }
    ];
  }
  const x = Math.round(o.x + o.w * 0.22);
  return [
    { x1: x, y1: g.ridge.y1, x2: x, y2: o.y + 200 },
    { x1: x, y1: g.ridge.y1, x2: x, y2: o.y + o.h - 200 }
  ];
}

// все подписи листа кровли одним списком — рисуются и проверяются из него же
export function roofTexts(house) {
  const q = roofSheet(house), g = q.g, R = house.roof, o = g.out, out = [];
  const add = (kind, owner, d) => out.push({ kind, owner, d });

  add('roof', 'конёк', g.alongY
    ? { t: `конёк ${mark(g.ridgeZ)}`, cx: (g.ridge.x1 + g.ridge.x2) / 2, baseline: o.y + 900, fs: 300, font: 'mono' }
    : { t: `конёк ${mark(g.ridgeZ)}`, cx: o.x + 2600, baseline: (g.ridge.y1 + g.ridge.y2) / 2 - 160, fs: 300, font: 'mono' });

  for (const [i, a] of slopeArrows(house).entries())
    add('roof', `уклон ската ${i + 1}`, {
      t: `i = ${R.pitch}°`, cx: (a.x1 + a.x2) / 2,
      baseline: (a.y1 + a.y2) / 2 - (g.alongY ? 160 : 0), fs: 280, font: 'mono',
      ...(g.alongY ? {} : { rot: -1 })
    });

  const eaveT = `карниз ${mark(g.eaveZ)}`;
  if (g.alongY) {
    add('roof', 'карниз СЗ', { t: eaveT, cx: o.x + 1700, baseline: o.y + o.h * 0.78, fs: 260, font: 'mono' });
    add('roof', 'карниз ЮВ', { t: eaveT, cx: o.x + o.w - 1700, baseline: o.y + o.h * 0.78, fs: 260, font: 'mono' });
  } else {
    add('roof', 'карниз ЮЗ', { t: eaveT, cx: o.x + o.w * 0.78, baseline: o.y + 700, fs: 260, font: 'mono' });
    add('roof', 'карниз СВ', { t: eaveT, cx: o.x + o.w * 0.78, baseline: o.y + o.h - 500, fs: 260, font: 'mono' });
  }

  // труба на плане — квадратик, и без отметки верха по нему ничего не заказать
  for (const h of roofHoles(house)) {
    const cx = h.x + h.w / 2, cy = h.y + h.h / 2;
    const side = cx < (o.x + o.w / 2) ? 1 : -1;
    const lx = cx + side * 1300;
    const src = house.levels[house.levels.length - 1];
    const f = (src.flues || []).concat(src.ducts || []).find(e => e.id.endsWith(h.id.split('.')[1]));
    add('hole', h.id, { t: `${h.kind} ${h.id.split('.')[1]}`, cx: lx, baseline: cy - 60, fs: 240, font: 'mono' });
    add('hole', h.id + ' верх', { t: `верх ${mark(flueTop(house, f))}`, cx: lx, baseline: cy + 300, fs: 240, font: 'mono' });
  }

  if (q.V) {
    const v = q.V.v;
    add('veranda', 'навес', { t: 'навес веранды', cx: v.x + v.w / 2, baseline: v.y + v.h / 2 - 60, fs: 300, font: 'sans' });
    add('veranda', 'уклон навеса', { t: `i = ${v.pitch}°, низ ${mark(q.V.dropZ)}`, cx: v.x + v.w / 2, baseline: v.y + v.h / 2 + 400, fs: 240, font: 'mono' });
  }

  for (const d of chainTexts('x', q.y1 + 950, [o.x, 0, house.shell.w, o.x + o.w])) add('dim', 'свесы X', d);
  for (const d of chainTexts('x', q.y1 + 1850, [o.x, o.x + o.w])) add('dim', 'габарит X', d);
  for (const d of chainTexts('y', q.x0 - 1250, [o.y, 0, house.shell.h, o.y + o.h])) add('dim', 'свесы Y', d);
  for (const d of chainTexts('y', q.x0 - 2150, [o.y, o.y + o.h])) add('dim', 'габарит Y', d);

  const sides = house.site.sides;
  add('side', 'ЮЗ', { t: sides.S, cx: (q.x0 + q.x1) / 2, baseline: q.y0 - 700, fs: 400, font: 'mono', ls: 120 });
  add('side', 'СВ', { t: sides.N, cx: (q.x0 + q.x1) / 2, baseline: q.y1 + 2420, fs: 340, font: 'mono', ls: 120 });
  add('side', 'СЗ', { t: sides.W, cx: q.x0 - 2900, baseline: (q.y0 + q.y1) / 2, fs: 340, font: 'mono', ls: 80, rot: -1 });
  add('side', 'ЮВ', { t: sides.E, cx: q.x1 + 800, baseline: (q.y0 + q.y1) / 2, fs: 340, font: 'mono', ls: 80, rot: 1 });
  return out;
}

// подписи, выключенные влево: штамп сверху и примечания снизу
export function roofLeftTexts(house) {
  const q = roofSheet(house), R = house.roof, g = q.g;
  const out = [
    { kind: 'stamp', owner: 'заголовок', d: { t: `${house.project.title} · Кровля`, cx: q.x0, baseline: q.y0 - 2150, fs: 420, font: 'sans' } },
    { kind: 'stamp', owner: 'тип', d: { t: `${R.type === 'gable' ? 'двускатная' : R.type} ${R.pitch}°, конёк вдоль дома, чердак холодный`, cx: q.x0, baseline: q.y0 - 1700, fs: 260, font: 'mono' } },
    { kind: 'stamp', owner: 'единицы', d: { t: 'размеры в миллиметрах, отметки в метрах', cx: q.x0, baseline: q.y0 - 1300, fs: 240, font: 'mono' } },
    { kind: 'note', owner: 'площади', d: { t: `скаты ${g.area.toFixed(1).replace('.', ',')} м², в плане ${g.plan.toFixed(1).replace('.', ',')} м², стропильных ног ${g.rafters}`, cx: q.x0, baseline: q.y1 + 3350, fs: 220, font: 'mono' } }
  ];
  roofNotes(R, g).forEach((t, i) =>
    out.push({ kind: 'note', owner: t.slice(0, 24), d: { t: `— ${t}`, cx: q.x0, baseline: q.y1 + 3950 + i * 420, fs: 200, font: 'mono' } }));
  return out;
}

// рамки подписей листа кровли — тем же способом, что и на планах этажей
export function roofLabelBoxes(house) {
  const out = roofTexts(house).map(e => ({ kind: e.kind, owner: e.owner, ...textBox(e.d) }));
  for (const e of roofLeftTexts(house)) {
    const b = textBox(e.d);
    out.push({ kind: e.kind, owner: e.owner, x: e.d.cx, y: b.y, w: b.w, h: b.h });
  }
  return out;
}

export function renderRoof(house) {
  const q = roofSheet(house), g = q.g, R = house.roof, S = house.shell, o = g.out;
  const W = q.x1 - q.x0 + q.padL + q.padR, H = q.y1 - q.y0 + q.padT + q.padB;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${q.x0 - q.padL} ${q.y0 - q.padT} ${W} ${H}" font-family="IBM Plex Sans,system-ui,sans-serif">`;
  s += `<rect x="${q.x0 - q.padL}" y="${q.y0 - q.padT}" width="${W}" height="${H}" fill="${C.paper}"/>`;

  // навес веранды — свой скат, ниже основного: рисуется первым и уходит под него
  if (q.V) {
    const b = q.V.canopyBox, my = b.y + b.h / 2;
    s += `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="${C.room}" stroke="${C.ink35}" stroke-width="55" stroke-dasharray="300 200"/>`;
    s += arrow(b.x + 200, my - 900, b.x + b.w - 200, my - 900);
  }

  // скаты: разной светлоты, иначе двускатная и вальмовая на плане одинаковы
  s += `<rect x="${o.x}" y="${o.y}" width="${o.w}" height="${o.h}" fill="${C.room}"/>`;
  if (g.alongY)
    s += `<rect x="${o.x}" y="${o.y}" width="${g.ridge.x1 - o.x}" height="${o.h}" fill="${C.garage}"/>`;
  else
    s += `<rect x="${o.x}" y="${o.y}" width="${o.w}" height="${o.h / 2}" fill="${C.garage}"/>`;

  // жёлоб висит снаружи края ската, водосточные трубы — по концам жёлоба
  const eaves = g.alongY
    ? [{ x: o.x, y: o.y, horiz: false, n: 1 }, { x: o.x + o.w, y: o.y, horiz: false, n: -1 }]
    : [{ x: o.x, y: o.y, horiz: true, n: 1 }, { x: o.x, y: o.y + o.h, horiz: true, n: -1 }];
  const half = R.gutter / 2, dr = R.gutter * 0.7;
  for (const e of eaves) {
    const ends = g.alongY ? [o.y + 700, o.y + o.h - 700] : [o.x + 700, o.x + o.w - 700];
    if (e.horiz) {
      const y = e.y - e.n * half;
      s += `<line x1="${o.x}" y1="${y}" x2="${o.x + o.w}" y2="${y}" stroke="${C.ink60}" stroke-width="${R.gutter}"/>`;
      for (const x of ends) s += `<circle cx="${x}" cy="${y}" r="${dr}" fill="${C.paper}" stroke="${C.ink}" stroke-width="50"/>`;
    } else {
      const x = e.x - e.n * half;
      s += `<line x1="${x}" y1="${o.y}" x2="${x}" y2="${o.y + o.h}" stroke="${C.ink60}" stroke-width="${R.gutter}"/>`;
      for (const y of ends) s += `<circle cx="${x}" cy="${y}" r="${dr}" fill="${C.paper}" stroke="${C.ink}" stroke-width="50"/>`;
    }
  }

  s += `<rect x="${o.x}" y="${o.y}" width="${o.w}" height="${o.h}" fill="none" stroke="${C.ink}" stroke-width="70"/>`;

  // коробка дома под кровлей — пунктиром: по ней читается вылет свеса
  s += `<rect x="0" y="0" width="${S.w}" height="${S.h}" fill="none" stroke="${C.ink35}" stroke-width="55" stroke-dasharray="260 180"/>`;

  // снегозадержание — гребёнка над карнизом: от пунктира коробки её надо
  // отличать на глаз, иначе на листе просто четыре штриховые линии
  if (R.snowGuard) for (const e of eaves) {
    const off = 900 * e.n, tk = 200;
    if (e.horiz) {
      const y = e.y + off;
      s += `<line x1="${o.x + 400}" y1="${y}" x2="${o.x + o.w - 400}" y2="${y}" stroke="${C.ink}" stroke-width="50"/>`;
      for (let x = o.x + 400; x <= o.x + o.w - 400; x += 500)
        s += `<line x1="${x}" y1="${y}" x2="${x}" y2="${y - e.n * tk}" stroke="${C.ink}" stroke-width="50"/>`;
    } else {
      const x = e.x + off;
      s += `<line x1="${x}" y1="${o.y + 400}" x2="${x}" y2="${o.y + o.h - 400}" stroke="${C.ink}" stroke-width="50"/>`;
      for (let y = o.y + 400; y <= o.y + o.h - 400; y += 500)
        s += `<line x1="${x}" y1="${y}" x2="${x - e.n * tk}" y2="${y}" stroke="${C.ink}" stroke-width="50"/>`;
    }
  }

  // конёк
  s += `<line x1="${g.ridge.x1}" y1="${g.ridge.y1}" x2="${g.ridge.x2}" y2="${g.ridge.y2}" stroke="${C.ink}" stroke-width="110"/>`;
  // продухи в обоих фронтонах — чердак холодный, ему нужен сквозняк
  for (const t of [0, 1]) {
    const [vx, vy] = g.alongY
      ? [g.ridge.x1 - R.vent / 2, t ? o.y + o.h - 460 : o.y + 160]
      : [t ? o.x + o.w - 460 : o.x + 160, g.ridge.y1 - R.vent / 2];
    s += `<rect x="${vx}" y="${vy}" width="${g.alongY ? R.vent : 300}" height="${g.alongY ? 300 : R.vent}" fill="none" stroke="${C.ink}" stroke-width="50"/>`;
  }
  for (const a of slopeArrows(house)) s += arrow(a.x1, a.y1, a.x2, a.y2);

  // проходы труб: то, ради чего лист и нужен подрядчику
  for (const h of roofHoles(house)) {
    const hx = h.x + h.w / 2, hy = h.y + h.h / 2;
    const side = hx < (o.x + o.w / 2) ? 1 : -1;
    // выноска: без неё подпись висит рядом с квадратом и не привязана к нему
    s += `<line x1="${hx + side * h.w / 2}" y1="${hy}" x2="${hx + side * 700}" y2="${hy}" stroke="${C.ink60}" stroke-width="45"/>`;
    s += `<rect x="${h.x}" y="${h.y}" width="${h.w}" height="${h.h}" fill="${C.paper}" stroke="${C.ink}" stroke-width="70"/>`;
    s += `<line x1="${h.x}" y1="${h.y}" x2="${h.x + h.w}" y2="${h.y + h.h}" stroke="${C.ink}" stroke-width="45"/>`;
    s += `<line x1="${h.x + h.w}" y1="${h.y}" x2="${h.x}" y2="${h.y + h.h}" stroke="${C.ink}" stroke-width="45"/>`;
  }

  s += chain('x', q.y1 + 950, [o.x, 0, S.w, o.x + o.w]);
  s += chain('x', q.y1 + 1850, [o.x, o.x + o.w]);
  s += chain('y', q.x0 - 1250, [o.y, 0, S.h, o.y + o.h]);
  s += chain('y', q.x0 - 2150, [o.y, o.y + o.h]);

  for (const e of roofTexts(house)) {
    if (e.kind === 'dim') continue;                     // цепочки нарисованы вместе с размерами
    const c = e.kind === 'side' ? C.ink35 : e.kind === 'hole' ? C.ink : C.ink;
    s += t2svg(e.d, e.kind === 'side' && e.owner !== 'ЮЗ' ? C.ink35 : c, halo(C.room, 200));
  }
  for (const e of roofLeftTexts(house))
    s += t2svg(e.d, e.d.fs > 300 ? C.ink : C.ink60).replace('text-anchor="middle"', 'text-anchor="start"');

  s += scaleBar(q.x1 - 3600, q.y1 + 2900);
  s += compass(q.x1 + 1100, q.y0 - 900, house.site.frontAzimuth);
  s += `</svg>`;
  return s;
}

// ---------------------------------------------------------------------------
// генплан
//
// Единственный лист, где виден весь участок разом: посадка дома с отступами,
// времянка в дальнем углу, забор с воротами, септик и все наружные сети.
// По отдельности каждая из этих вещей в норме, а конфликтуют они именно
// здесь — на 19 метрах фронта.
// ---------------------------------------------------------------------------

export function plotSheet(house) {
  const g = plotGeom(house);
  return g && {
    g, x0: g.lot.x0, y0: g.lot.y0, x1: g.lot.x1, y1: g.lot.y1,
    padL: 4100, padT: 2900, padB: 9200, padR: 1700
  };
}

const plotNotes = (house, g, feeds) => {
  const q = g.septic, T = g.temp;
  const S = house.shell;
  const d2 = (a, b) => {
    const dx = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w), 0);
    const dy = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h), 0);
    return (Math.hypot(dx, dy) / 1000).toFixed(1).replace('.', ',');
  };
  const hb = { x: 0, y: 0, w: S.w, h: S.h };
  const sewerIn = feeds.find(f => f.id === 'vk.out1');
  const water = feeds.find(f => f.id === 'vk.in2');
  return [
    `участок ${g.lot.w / 1000} × ${g.lot.d / 1000} м, въезд с юго-запада; дом в ${g.m.S / 1000} м от красной линии и ${g.m.W / 1000} м от северо-западной границы`,
    ...(T ? [`времянка ${T.w / 1000} × ${T.h / 1000} м из блока — в ней живут на время стройки; разрыв до дома ${d2(hb, T.box)} м (несгораемые: норма 6)`] : []),
    ...(q ? [`канализация — станция биоочистки у въезда: до дома ${d2(hb, q.box)} м, до времянки ${T ? d2(T.box, q.box) : '—'} м, до границы ${((g.lot.x1 - q.x - q.w) / 1000).toFixed(1).replace('.', ',')} м`] : []),
    `станция стоит у уличного забора: обслуживание и откачка ила — с улицы, машина на участок не заезжает; полю фильтрации здесь не встать геометрически`,
    ...(sewerIn ? [`самотёк 2 %: вход в станцию ${mark(sewerIn.pts[sewerIn.pts.length - 1].z)}, очищенная вода — напорным сбросом в кювет улицы`] : []),
    `вода — врезка у угла ЮЗ-ЮВ, ниже промерзания (−2,80): магистраль фронтом до ввода дома, тройник, дальше западной полосой к времянке`,
    `футляры на воде ${(feeds.filter(f => f.kind === 'water').reduce((s, f) => s + (f.casingLen || 0), 0) / 1000).toFixed(1).replace('.', ',')} м: пересечение со сбросом и сближение с фундаментом в западной полосе`,
    `кабельные вводы дома и времянки — от одной точки учёта, в 0,5 м и дальше от труб`
  ];
};

// подписи генплана одним списком: рисуются и проверяются из него же
export function plotTexts(house, systems) {
  const q = plotSheet(house);
  if (!q) return [];
  const g = q.g, S = house.shell, out = [];
  const add = (kind, owner, d) => out.push({ kind, owner, d });
  const feeds = systems.flatMap(sys => feedsGeom(house, sys));

  add('bld', 'дом', { t: `дом ${S.w / 1000} × ${(S.h / 1000).toString().replace('.', ',')}`, cx: S.w / 2, baseline: 3600, fs: 340, font: 'sans' });
  if (g.temp) {
    const T = g.temp;
    add('bld', 'времянка', { t: `времянка ${T.w / 1000} × ${T.h / 1000}`, cx: T.x + T.w / 2, baseline: T.y + T.h / 2 - 100, fs: 320, font: 'sans' });
    add('bld', 'времянка-роль', { t: 'жильё на время стройки', cx: T.x + T.w / 2, baseline: T.y + T.h / 2 + 360, fs: 220, font: 'mono' });
  }
  if (g.septic)
    add('net', 'септик', { t: 'септик · АУ', cx: g.septic.x + g.septic.w / 2, baseline: g.septic.y + g.septic.h + 450, fs: 240, font: 'mono' });
  add('net', 'кювет', { t: 'кювет · сброс', cx: 13700, baseline: g.lot.y0 - 350, fs: 220, font: 'mono' });
  add('zone', 'проезд', { t: 'проезд', cx: g.drive.x + g.drive.w / 2, baseline: g.drive.y + g.drive.h / 2 + 80, fs: 260, font: 'mono' });
  add('zone', 'двор', { t: 'двор', cx: 2500, baseline: 16300, fs: 260, font: 'mono' });
  add('zone', 'сад', { t: 'сад', cx: 12200, baseline: 17800, fs: 260, font: 'mono' });

  for (const d of chainTexts('y', q.x0 - 1250, [q.y0, 0, S.h, ...(g.temp ? [g.temp.y, g.temp.y + g.temp.h] : []), q.y1]))
    add('dim', 'посадка Y', d);
  for (const d of chainTexts('x', q.y1 + 950, [q.x0, 0, S.w, q.x1])) add('dim', 'посадка X', d);
  for (const d of chainTexts('x', q.y1 + 1850, g.temp ? [q.x0, g.temp.x, g.temp.x + g.temp.w, q.x1] : [q.x0, q.x1]))
    add('dim', 'времянка X', d);

  const sides = house.site.sides;
  add('side', 'ЮЗ', { t: sides.S, cx: (q.x0 + q.x1) / 2, baseline: q.y0 - 1000, fs: 400, font: 'mono', ls: 120 });
  add('side', 'СВ', { t: sides.N, cx: (q.x0 + q.x1) / 2, baseline: q.y1 + 2500, fs: 340, font: 'mono', ls: 120 });
  add('side', 'СЗ', { t: sides.W, cx: q.x0 - 2900, baseline: (q.y0 + q.y1) / 2, fs: 340, font: 'mono', ls: 80, rot: -1 });
  add('side', 'ЮВ', { t: sides.E, cx: q.x1 + 800, baseline: (q.y0 + q.y1) / 2, fs: 340, font: 'mono', ls: 80, rot: 1 });
  return out;
}

// штамп и примечания, выключенные влево — как на листе кровли
export function plotLeftTexts(house, systems) {
  const q = plotSheet(house);
  if (!q) return [];
  const feeds = systems.flatMap(sys => feedsGeom(house, sys));
  const out = [
    { kind: 'stamp', owner: 'заголовок', d: { t: `${house.project.title} · Генплан`, cx: q.x0, baseline: q.y0 - 2350, fs: 420, font: 'sans' } },
    { kind: 'stamp', owner: 'единицы', d: { t: 'размеры в миллиметрах, отметки в метрах', cx: q.x0, baseline: q.y0 - 1900, fs: 240, font: 'mono' } }
  ];
  plotNotes(house, q.g, feeds).forEach((t, i) =>
    out.push({ kind: 'note', owner: t.slice(0, 24), d: { t: `— ${t}`, cx: q.x0, baseline: q.y1 + 3350 + i * 420, fs: 200, font: 'mono' } }));
  // легенда сетей: линии на чертеже без неё — просто цветные нитки
  [['вода', SYS_C.vk], ['канализация самотёком', SYS_C.vk], ['сброс напорный', SYS_C.vk], ['кабель', SYS_C.eom]]
    .forEach(([t], i) => out.push({
      kind: 'legend', owner: t,
      d: { t, cx: q.x0 + 1050 + (i % 2) * 5200, baseline: q.y1 + 6600 + Math.floor(i / 2) * 480, fs: 210, font: 'mono' }
    }));
  return out;
}

export function plotLabelBoxes(house, systems) {
  const out = plotTexts(house, systems).map(e => ({ kind: e.kind, owner: e.owner, ...textBox(e.d) }));
  for (const e of plotLeftTexts(house, systems)) {
    const b = textBox(e.d);
    out.push({ kind: e.kind, owner: e.owner, x: e.d.cx, y: b.y, w: b.w, h: b.h });
  }
  return out;
}

export function renderPlot(house, systems) {
  const q = plotSheet(house);
  if (!q) return '';
  const g = q.g, S = house.shell;
  const W = q.x1 - q.x0 + q.padL + q.padR, H = q.y1 - q.y0 + q.padT + q.padB;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${q.x0 - q.padL} ${q.y0 - q.padT} ${W} ${H}" font-family="IBM Plex Sans,system-ui,sans-serif">`;
  s += `<rect x="${q.x0 - q.padL}" y="${q.y0 - q.padT}" width="${W}" height="${H}" fill="${C.paper}"/>`;
  // тело участка
  s += `<rect x="${q.x0}" y="${q.y0}" width="${g.lot.w}" height="${g.lot.d}" fill="${C.quiet}"/>`;

  // покрытия: проезд и дорожки
  for (const p of [g.drive, ...g.paths].filter(Boolean))
    s += `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" fill="${C.garage}" stroke="${C.ink35}" stroke-width="35"/>`;
  // пандусы ворот
  for (const r of rampGeom(house))
    s += `<rect x="${r.pad.x}" y="${r.pad.y}" width="${r.pad.w}" height="${r.pad.h}" fill="${C.garage}" stroke="${C.ink35}" stroke-width="35"/>`;

  // дом — контуром кровли, с коньком и пятном стен пунктиром
  const rg = roofGeom(house), o = rg.out;
  s += `<rect x="${o.x}" y="${o.y}" width="${o.w}" height="${o.h}" fill="${C.room}" stroke="${C.ink}" stroke-width="70"/>`;
  s += `<line x1="${rg.ridge.x1}" y1="${rg.ridge.y1}" x2="${rg.ridge.x2}" y2="${rg.ridge.y2}" stroke="${C.ink}" stroke-width="90"/>`;
  s += `<rect x="0" y="0" width="${S.w}" height="${S.h}" fill="none" stroke="${C.ink35}" stroke-width="45" stroke-dasharray="260 180"/>`;
  // веранда с навесом и ступенями
  const V = verandaGeom(house);
  if (V) {
    const v = V.v, b = V.canopyBox;
    s += `<rect x="${v.x}" y="${v.y}" width="${v.w}" height="${v.h}" fill="${C.room}" stroke="${C.ink}" stroke-width="55"/>`;
    s += `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="none" stroke="${C.ink35}" stroke-width="45" stroke-dasharray="300 200"/>`;
    for (const st of V.deckSteps)
      s += `<rect x="${st.x}" y="${st.y}" width="${st.w}" height="${st.h}" fill="none" stroke="${C.ink35}" stroke-width="45"/>`;
  }
  // выносы западного фасада: крыльцо и приямок видны и на генплане
  for (const p of porchGeom(house)) {
    s += `<rect x="${p.pad.x}" y="${p.pad.y}" width="${p.pad.w}" height="${p.pad.h}" fill="${C.room}" stroke="${C.ink}" stroke-width="45"/>`;
    for (const st of p.steps) s += `<rect x="${st.x}" y="${st.y}" width="${st.w}" height="${st.h}" fill="none" stroke="${C.ink35}" stroke-width="40"/>`;
  }
  for (const p of pitGeom(house))
    s += `<rect x="${p.box.x}" y="${p.box.y}" width="${p.box.w}" height="${p.box.h}" fill="${C.room}" stroke="${C.ink}" stroke-width="45"/>`;

  // времянка: стены с дверью, окнами и крыльцом
  if (g.temp) {
    const T = g.temp;
    s += `<rect x="${T.x}" y="${T.y}" width="${T.w}" height="${T.h}" fill="${C.ink}"/>`;
    s += `<rect x="${T.x + T.t}" y="${T.y + T.t}" width="${T.w - 2 * T.t}" height="${T.h - 2 * T.t}" fill="${C.room}"/>`;
    const cut = (side, a, b) => side === 'S' ? `<rect x="${a}" y="${T.y - 20}" width="${b - a}" height="${T.t + 40}" fill="${C.room}"/>`
      : side === 'N' ? `<rect x="${a}" y="${T.y + T.h - T.t - 20}" width="${b - a}" height="${T.t + 40}" fill="${C.room}"/>`
        : side === 'W' ? `<rect x="${T.x - 20}" y="${a}" width="${T.t + 40}" height="${b - a}" fill="${C.room}"/>`
          : `<rect x="${T.x + T.w - T.t - 20}" y="${a}" width="${T.t + 40}" height="${b - a}" fill="${C.room}"/>`;
    s += cut(T.door.side, T.door.a, T.door.b);
    for (const w of T.windows || []) {
      s += cut(w.side, w.a, w.b);
      const horiz = w.side === 'S' || w.side === 'N';
      const at = w.side === 'S' ? T.y + T.t / 2 : w.side === 'N' ? T.y + T.h - T.t / 2
        : w.side === 'W' ? T.x + T.t / 2 : T.x + T.w - T.t / 2;
      s += horiz
        ? `<line x1="${w.a}" y1="${at}" x2="${w.b}" y2="${at}" stroke="${C.ink}" stroke-width="55"/>`
        : `<line x1="${at}" y1="${w.a}" x2="${at}" y2="${w.b}" stroke="${C.ink}" stroke-width="55"/>`;
    }
    s += `<rect x="${T.porch.x}" y="${T.porch.y}" width="${T.porch.w}" height="${T.porch.h}" fill="${C.room}" stroke="${C.ink}" stroke-width="45"/>`;
  }

  // сети: те же трассы, что в модели и в смете. Вода сплошная, самотёк
  // длинным штрихом, напорный сброс коротким, кабель точечным
  const feeds = systems.flatMap(sys => feedsGeom(house, sys).map(f => ({ ...f, sysId: sys.id })));
  for (const f of feeds) {
    const color = SYS_C[f.sysId] || C.ink;
    const dash = f.kind === 'power' ? '80 160' : f.pressure ? '160 160' : f.kind === 'sewer' ? '420 220' : null;
    s += `<polyline points="${f.pts.map(p => `${Math.round(p.x)},${Math.round(p.y)}`).join(' ')}" fill="none"`
      + ` stroke="${color}" stroke-width="60" stroke-linejoin="round" stroke-linecap="round" opacity="0.8"`
      + (dash ? ` stroke-dasharray="${dash}"` : '') + '/>';
    for (const w of f.wells || [])
      s += `<circle cx="${w.x}" cy="${w.y}" r="${w.d / 2 + 60}" fill="${C.room}" stroke="${color}" stroke-width="55"/>`;
    for (const c of f.casings || [])
      s += c.dir === 'v'
        ? `<rect x="${c.x - 130}" y="${c.y - c.len / 2}" width="260" height="${c.len}" fill="none" stroke="${color}" stroke-width="45"/>`
        : `<rect x="${c.x - c.len / 2}" y="${c.y - 130}" width="${c.len}" height="260" fill="none" stroke="${color}" stroke-width="45"/>`;
  }
  // септик
  if (g.septic) {
    const p = g.septic;
    s += `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" fill="${C.room}" stroke="${SYS_C.vk}" stroke-width="80"/>`;
    s += `<circle cx="${p.x + p.w / 2}" cy="${p.y + p.h / 2}" r="${Math.min(p.w, p.h) * 0.3}" fill="none" stroke="${SYS_C.vk}" stroke-width="50"/>`;
  }

  // забор: панели толстой линией, ворота и калитка — засечками с створкой
  for (const f of g.fence.segs)
    s += `<rect x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}" fill="${C.ink}"/>`;
  for (const gt of [g.fence.gate, g.fence.wicket].filter(Boolean)) {
    for (const e of [gt.x, gt.x + gt.w])
      s += `<line x1="${e}" y1="${gt.y - 240}" x2="${e}" y2="${gt.y + gt.h + 240}" stroke="${C.ink}" stroke-width="70"/>`;
    s += `<line x1="${gt.x}" y1="${gt.y + gt.h / 2}" x2="${gt.x + gt.w * 0.9}" y2="${gt.y + gt.h + 900}" stroke="${C.ink60}" stroke-width="45"/>`;
  }

  s += chain('y', q.x0 - 1250, [q.y0, 0, S.h, ...(g.temp ? [g.temp.y, g.temp.y + g.temp.h] : []), q.y1]);
  s += chain('x', q.y1 + 950, [q.x0, 0, S.w, q.x1]);
  s += chain('x', q.y1 + 1850, g.temp ? [q.x0, g.temp.x, g.temp.x + g.temp.w, q.x1] : [q.x0, q.x1]);

  for (const e of plotTexts(house, systems)) {
    if (e.kind === 'dim') continue;
    s += t2svg(e.d, e.kind === 'side' && e.owner !== 'ЮЗ' ? C.ink35 : e.kind === 'zone' ? C.ink60 : C.ink,
      halo(e.kind === 'net' || e.kind === 'zone' ? C.quiet : C.room, 180));
  }
  for (const e of plotLeftTexts(house, systems)) {
    if (e.kind === 'legend') {
      const d = e.d, color = /кабель/.test(d.t) ? SYS_C.eom : SYS_C.vk;
      const dash = d.t === 'вода' ? '' : d.t.startsWith('сброс') ? ' stroke-dasharray="160 160"'
        : d.t === 'кабель' ? ' stroke-dasharray="80 160"' : ' stroke-dasharray="420 220"';
      s += `<line x1="${d.cx - 950}" y1="${d.baseline - 70}" x2="${d.cx - 150}" y2="${d.baseline - 70}" stroke="${color}" stroke-width="60"${dash}/>`;
    }
    s += t2svg(e.d, e.d.fs > 300 ? C.ink : C.ink60).replace('text-anchor="middle"', 'text-anchor="start"');
  }

  s += scaleBar(q.x1 - 3600, q.y1 + 2900);
  s += compass(q.x1 + 1100, q.y0 - 900, house.site.frontAzimuth);
  s += `</svg>`;
  return s;
}

// стрелка уклона: линия с наконечником на карнизном конце
function arrow(x1, y1, x2, y2) {
  const a = Math.atan2(y2 - y1, x2 - x1), h = 320, w = 0.34;
  const p = (t) => `${Math.round(x2 - h * Math.cos(a + t))} ${Math.round(y2 - h * Math.sin(a + t))}`;
  return `<line x1="${Math.round(x1)}" y1="${Math.round(y1)}" x2="${Math.round(x2)}" y2="${Math.round(y2)}" stroke="${C.ink60}" stroke-width="55"/>`
    + `<circle cx="${Math.round(x1)}" cy="${Math.round(y1)}" r="90" fill="${C.ink60}"/>`
    + `<path d="M${p(-w)} L${Math.round(x2)} ${Math.round(y2)} L${p(w)}" fill="none" stroke="${C.ink60}" stroke-width="55"/>`;
}

// ---------------------------------------------------------------------------
// планы по разделам: тот же этаж бледнее, поверх — точки и посчитанные трассы
// ---------------------------------------------------------------------------

export const SYS_C = { eom: '#A8762A', vk: '#2E6C8C', ov: '#B3402F', ss: '#41785C' };

const GLYPH = {
  socket: 'Р', socketIP: 'Р+', power: '3Ф', light: 'С', switch: 'В',
  cold: 'ХВ', hot: 'ГВ', drain: 'К', radiator: 'РД', convector: 'КВ', supply: 'П', exhaust: 'ВЫ',
  data: 'RJ', tv: 'ТВ', rack: 'Ш', leak: 'ПР', smoke: 'ДЫ'
};

// метка точки: пилюля по ширине глифа, чтобы двухбуквенные не вылезали
function pill(x, y, t, color, scale = 1) {
  const h = 360 * scale, w = Math.max(h, (t.length * 150 + 180) * scale), r = h / 2;
  return `<rect x="${Math.round(x - w / 2)}" y="${Math.round(y - h / 2)}" width="${Math.round(w)}" height="${Math.round(h)}" rx="${Math.round(r)}"`
    + ` fill="${C.room}" stroke="${color}" stroke-width="${Math.round(46 * scale)}"/>`
    + t2svg({ t, cx: x, baseline: y + 92 * scale, fs: Math.round(230 * scale), font: 'mono' }, color);
}

const poly = (pts, color, dash) =>
  `<polyline points="${pts.map(p => `${Math.round(p.x)},${Math.round(p.y)}`).join(' ')}" fill="none"`
  + ` stroke="${color}" stroke-width="55" stroke-linejoin="round" stroke-linecap="round" opacity="0.55"`
  + (dash ? ` stroke-dasharray="${dash}"` : '') + '/>';

export function renderSystem(house, L, sys, bill) {
  const color = SYS_C[sys.id] || C.ink, S = house.shell;
  const here = p => p.level === L.id;
  const drawn = [];
  let ov = '';

  // магистраль видна на листе источника: там она и проложена, дальше — стояк
  if (sys.source.level === L.id && bill.trunks.length) ov += poly(bill.trunks[0].via, color, '300 200');
  for (const r of bill.runs) {
    if (r.level.id !== L.id) continue;
    for (const v of r.via) ov += poly(v, color);
  }

  // этажный узел
  const n = sys.source.level === L.id ? sys.source : sys.vertical;
  ov += `<rect x="${n.x - 260}" y="${n.y - 260}" width="520" height="520" fill="${C.room}" stroke="${color}" stroke-width="70"/>`;
  ov += t2svg({ t: sys.source.level === L.id ? '⌁' : '↕', cx: n.x, baseline: n.y + 120, fs: 340, font: 'mono' }, color);

  for (const p of sys.points) {
    if (!here(p)) continue;
    const at = sysPlace(house, p);
    if (!at) continue;
    if ((p.kind === 'radiator' || p.kind === 'convector') && at.face) {
      const f = at.face, a = f.at(p.along - p.len / 2), b = f.at(p.along + p.len / 2);
      const dx = f.axis === 'x' ? 0 : 1, dy = f.axis === 'x' ? 1 : 0;
      const d = 180 * f.out * -1;
      ov += `<rect x="${Math.min(a.x, b.x) + (dx ? d - 90 : 0)}" y="${Math.min(a.y, b.y) + (dy ? d - 90 : 0)}"`
        + ` width="${Math.abs(b.x - a.x) + (dx ? 180 : 0)}" height="${Math.abs(b.y - a.y) + (dy ? 180 : 0)}"`
        + ` fill="${C.room}" stroke="${color}" stroke-width="55"/>`;
      continue;
    }
    // метки, попавшие в одну точку плана (решётка над радиатором, розетка
    // под выключателем), раздвигаются от стены: иначе одна прячет другую
    const stack = drawn.filter(q => Math.hypot(q.x - at.x, q.y - at.y) < 300).length;
    const off = (at.face ? 240 : 0) + stack * 420;
    const px = at.x - (at.face && at.face.axis === 'y' ? at.face.out * off : 0);
    const py = at.y - (at.face && at.face.axis === 'x' ? at.face.out * off : -stack * 420);
    drawn.push({ x: at.x, y: at.y });
    ov += pill(px, py, GLYPH[p.kind] || '?', color, 0.78);
  }

  // легенда под планом, на месте размерных цепочек
  const used = bill.devices.filter(d => d.n);
  const cols = 2, rowH = 440, colW = (S.w - 400) / cols;
  used.forEach((d, i) => {
    const cx = 400 + (i % cols) * colW, cy = S.h + 900 + Math.floor(i / cols) * rowH;
    ov += pill(cx, cy, GLYPH[d.kind] || '?', color, 0.8);
    ov += t2svg({ t: `${d.l} · ${d.n}`, cx: cx + 340, baseline: cy + 90, fs: 250, font: 'mono' }, C.ink60)
      .replace('text-anchor="middle"', 'text-anchor="start"');
  });
  ov += t2svg({ t: sys.title, cx: S.w / 2, baseline: S.h + 500, fs: 320 }, C.ink);

  // подпись помещения ужимается до номера: имя и площадь есть в экспликации,
  // а место на листе нужно точкам раздела
  const numbered = { ...L, rooms: L.rooms.map(r => ({ ...r, label: { ...(r.label || {}), mode: 'num' } })) };
  return renderLevel(house, numbered, { dims: false, pale: 0.3, overlay: ov });
}

// координаты точки для отрисовки — тот же расчёт, что в systems.mjs
function sysPlace(house, p) {
  const L = house.levels.find(l => l.id === p.level);
  if (!L) return null;
  if (p.x != null) return { x: p.x, y: p.y };
  const room = L.rooms.find(r => r.id === p.room);
  if (!room) return null;
  const f = mFace(room, p.side);
  return { ...f.at(Math.max(0, Math.min(f.len, p.along))), face: f };
}

export function explication(L) {
  const rows = L.rooms.map(r => ({ n: r.n, name: r.name, use: r.use, area: r.w * r.h / 1e6 }));
  const by = u => rows.filter(r => r.use === u).reduce((s, r) => s + r.area, 0);
  return {
    rows,
    total: rows.reduce((s, r) => s + r.area, 0),
    live: by('live'), service: by('service'), tech: by('tech')
  };
}

// площади дома по назначению помещений
export function areas(house) {
  const e = house.levels.map(explication);
  const sum = k => e.reduce((s, x) => s + x[k], 0);
  return {
    byLevel: house.levels.map((L, i) => ({ title: L.title, ...e[i] })),
    total: sum('total'), live: sum('live'), service: sum('service'), tech: sum('tech'),
    living: sum('live') + sum('service')     // без гаража, лестниц и технических
  };
}
