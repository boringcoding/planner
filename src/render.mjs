// Отрисовка плана этажа в SVG. Единицы — миллиметры, viewBox тоже в мм.
//
// Геометрия подписей считается здесь и экспортируется наружу: rules.mjs берёт
// те же рамки и проверяет на наложение ровно то, что попадает на чертёж.
// Пока рамки считались бы в двух местах, они разошлись бы и наложения проскакивали.

const C = {
  ink: '#171C24', ink60: '#6E7178', ink35: '#9A9CA1',
  paper: '#E4E3DC', room: '#FBFAF7', garage: '#E1E4E2', quiet: '#E8EDE9',
  heat: '#C0392B', furn: 'rgba(23,28,36,0.42)', furnFill: 'rgba(23,28,36,0.055)'
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

// подпись мебели: кегль ужимается под контур предмета.
// Если и минимальный кегль не влезает — подпись не рисуется, а правило сообщает.
export function furnText(f) {
  let d = null;
  if (f.t === 'c') {
    if (!f.l) return null;
    d = { t: f.l, cx: f.x, baseline: f.y + 90, fs: 220, font: 'mono', fit: 2 * f.r - 60 };
  } else if (f.t === 'car') {
    d = { t: `${f.h} × ${f.w}`, cx: f.x + f.w / 2, baseline: f.y + f.h - 560, fs: 240, font: 'mono', fit: f.w - 440 };
  } else if (f.t === 'bed') {
    d = { t: `${f.w} × ${f.h}`, cx: f.x + f.w / 2, baseline: f.y + f.h - 320, fs: 240, font: 'mono', fit: f.w - 300 };
  } else {
    if (!f.l) return null;
    d = { t: f.l, cx: f.x + f.w / 2, baseline: f.y + f.h / 2 + 85, fs: 240, font: 'mono', fit: f.w - 130 };
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
    padL: 3900, padT: 1800, padB: 2900, padR: vExt + 1700
  };
}

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
const halo = (fill = C.room) => ` paint-order="stroke" stroke="${fill}" stroke-width="160"`;

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

function furnGlyph(f) {
  let s = '';
  const d = furnText(f);
  if (f.t === 'c') {
    s += `<circle cx="${f.x}" cy="${f.y}" r="${f.r}" fill="${C.furnFill}" stroke="${C.furn}" stroke-width="28"/>`;
    if (d && d.fits) s += t2svg(d, C.ink35);
    return s;
  }
  const rx = f.t === 'car' ? 350 : f.t === 'bed' ? 80 : 0;
  s += `<rect x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}" rx="${rx}" fill="${C.furnFill}" stroke="${C.furn}" stroke-width="30"/>`;
  if (f.t === 'car')
    s += `<rect x="${f.x + 220}" y="${f.y + 760}" width="${f.w - 440}" height="1350" rx="180" fill="none" stroke="${C.furn}" stroke-width="26"/>`;
  if (f.t === 'bed')
    s += `<line x1="${f.x}" y1="${f.y + 450}" x2="${f.x + f.w}" y2="${f.y + 450}" stroke="${C.furn}" stroke-width="26"/>`;
  if (d && d.fits) s += t2svg(d, C.ink35);
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
    for (let i = 1; i <= 3; i++) s += `<line x1="${v.x + 200}" y1="${v.y + 300 * i}" x2="${v.x + v.w - 200}" y2="${v.y + 300 * i}" stroke="${C.ink35}" stroke-width="40"/>`;
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
  for (const w of L.windows || []) {
    const r = winRect(w, S), thick = w.kind ? 100 : 55;
    s += `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="${C.paper}"/>`;
    s += `<line x1="${r.l[0][0]}" y1="${r.l[0][1]}" x2="${r.l[1][0]}" y2="${r.l[1][1]}" stroke="${C.ink}" stroke-width="${thick}"/>`;
  }
  if (L.riser) {
    const q = L.riser;
    s += `<rect x="${q.x}" y="${q.y}" width="${q.w}" height="${q.h}" fill="none" stroke="${C.ink}" stroke-width="45"/>`;
    s += `<line x1="${q.x}" y1="${q.y}" x2="${q.x + q.w}" y2="${q.y + q.h}" stroke="${C.ink}" stroke-width="35"/>`;
    s += `<line x1="${q.x + q.w}" y1="${q.y}" x2="${q.x}" y2="${q.y + q.h}" stroke="${C.ink}" stroke-width="35"/>`;
  }
  if (L.stair) s += stairGlyph(L.stair);
  if (showFurn) for (const f of L.furniture || []) s += furnGlyph(f);

  for (const r of L.rooms) {
    const fill = roomFill(r);
    for (const d of roomBlock(r).items) {
      if (d.circle) {
        s += `<circle cx="${Math.round(d.circle.cx)}" cy="${Math.round(d.circle.cy)}" r="${d.circle.r}" fill="${C.ink}"/>`;
        s += t2svg(d, C.room);
      } else s += t2svg(d, d.kind === 'area' ? C.ink60 : C.ink, halo(fill));
    }
  }

  if (g.showDims) {
    s += chain('x', S.h + 950, L.dims.x);
    s += chain('x', S.h + 1850, [0, S.w]);
    s += chain('y', g.dx, L.dims.y);
    s += chain('y', g.dx2, [0, S.h]);
  }

  s += compass(S.w + 1100, -900, house.site.frontAzimuth);
  s += t2svg({ t: sides.S, cx: S.w / 2, baseline: -700, fs: 400, font: 'mono', ls: 120 }, C.ink);
  s += t2svg({ t: sides.N, cx: S.w / 2, baseline: S.h + 2420, fs: 340, font: 'mono', ls: 120 }, C.ink35);
  s += t2svg({ t: sides.W, cx: g.wx, baseline: S.h / 2, fs: 340, font: 'mono', ls: 80, rot: -1 }, C.ink35);
  s += t2svg({ t: sides.E, cx: g.ex, baseline: S.h / 2, fs: 340, font: 'mono', ls: 80, rot: 1 }, C.ink35);
  s += `</svg>`;
  return s;
}

export function explication(L) {
  const rows = L.rooms.map(r => ({ n: r.n, name: r.name, area: r.w * r.h / 1e6 }));
  return { rows, total: rows.reduce((s, r) => s + r.area, 0) };
}
