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
    d = { t: `${f.w} × ${f.h}`, cx: f.x + f.w / 2, baseline: f.y + f.h - 320, fs: 240, font: 'mono', fit: f.w - 300 };
  } else {
    if (!f.l) return null;
    d = { t: f.l, cx: f.x + f.w / 2, baseline: f.y + (f.lup ? -90 : f.h + 250), fs: 210, font: 'mono', fit: Math.max(f.w, 800) + 300 };
  }
  d.fs = Math.min(d.fs, Math.floor(d.fit / (d.t.length * ADV.mono)));
  d.fits = d.fs >= MIN_FURN_FS;
  return d;
}

// марка лестницы садится на площадку — единственное свободное место в шахте
export function stairText(st) {
  const fit = st.landing - 160;
  const d = { t: st.label, cx: st.x + st.landing / 2, baseline: st.y + 360, fs: 260, font: 'mono', fit };
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
    { t: `${v.w} × ${v.h}`, cx: v.x + v.w / 2, baseline: v.y + v.h + 560, fs: 300, font: 'mono' }
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
  const dx = -1250;              // цепочка размеров уровня
  const dx2 = -2150;             // общий габарит
  const wx = -3000;              // подпись стороны СЗ
  const ex = S.w + vExt + 800;   // подпись стороны ЮВ — за верандой
  return {
    S, showDims, dx, dx2, wx, ex,
    legendY: S.h + 3050,          // полоса условных обозначений и масштаба
    padL: 3900, padT: 2900, padB: 4800, padR: vExt + 1700
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
  const run = st.w - st.landing, half = (st.h - 100) / 2;
  const steps = Math.ceil(st.risers / 2) - 1, tread = run / steps;
  for (let i = 1; i <= steps; i++) {
    const x = st.x + st.landing + run - i * tread;
    s += `<line x1="${x}" y1="${st.y}" x2="${x}" y2="${st.y + half}" stroke="${C.furn}" stroke-width="28"/>`;
    s += `<line x1="${x}" y1="${st.y + half + 100}" x2="${x}" y2="${st.y + st.h}" stroke="${C.furn}" stroke-width="28"/>`;
  }
  s += `<line x1="${st.x}" y1="${st.y + half + 50}" x2="${st.x + st.w}" y2="${st.y + half + 50}" stroke="${C.furn}" stroke-width="50"/>`;
  s += `<line x1="${st.x + st.landing}" y1="${st.y}" x2="${st.x + st.landing}" y2="${st.y + st.h}" stroke="${C.furn}" stroke-width="40" stroke-dasharray="120 100"/>`;
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
    const v = L.veranda;
    s += `<rect x="${v.x}" y="${v.y}" width="${v.w}" height="${v.h}" fill="${C.paper}" stroke="${C.ink35}" stroke-width="70" stroke-dasharray="260 180"/>`;
    for (let i = 1; i <= 4; i++) s += `<line x1="${v.x + 200}" y1="${v.y + v.h - 320 * i}" x2="${v.x + v.w - 200}" y2="${v.y + v.h - 320 * i}" stroke="${C.ink35}" stroke-width="40"/>`;
    for (const dy of [250, v.h / 2, v.h - 250]) s += `<rect x="${v.x + v.w - 340}" y="${v.y + dy - 170}" width="340" height="340" fill="${C.ink35}"/>`;
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
// планы по разделам: тот же этаж бледнее, поверх — точки и посчитанные трассы
// ---------------------------------------------------------------------------

export const SYS_C = { eom: '#A8762A', vk: '#2E6C8C', ov: '#B3402F', ss: '#41785C' };

const GLYPH = {
  socket: 'Р', socketIP: 'Р+', power: '3Ф', light: 'С', switch: 'В',
  cold: 'ХВ', hot: 'ГВ', drain: 'К', radiator: 'РД', supply: 'П', exhaust: 'ВЫ',
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
    if (p.kind === 'radiator' && at.face) {
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
  const rows = L.rooms.map(r => ({ n: r.n, name: r.name, area: r.w * r.h / 1e6 }));
  return { rows, total: rows.reduce((s, r) => s + r.area, 0) };
}
