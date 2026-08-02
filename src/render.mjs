// Отрисовка плана этажа в SVG. Единицы — миллиметры, viewBox тоже в мм.

const C = {
  ink: '#171C24', ink60: '#6E7178', ink35: '#9A9CA1',
  paper: '#E4E3DC', room: '#FBFAF7', garage: '#E1E4E2', quiet: '#E8EDE9',
  heat: '#C0392B', furn: 'rgba(23,28,36,0.42)', furnFill: 'rgba(23,28,36,0.055)'
};

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const fmt = v => (v / 1e6).toFixed(1).replace('.', ',');

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
    const a = arr[i], b = arr[i + 1], m = (a + b) / 2;
    if (kind === 'x') {
      s += `<line x1="${a}" y1="${pos}" x2="${b}" y2="${pos}" stroke="${C.ink35}" stroke-width="30"/>`;
      s += `<line x1="${a}" y1="${pos - 140}" x2="${a}" y2="${pos + 140}" stroke="${C.ink35}" stroke-width="50"/>`;
      s += `<line x1="${b}" y1="${pos - 140}" x2="${b}" y2="${pos + 140}" stroke="${C.ink35}" stroke-width="50"/>`;
      s += `<text x="${m}" y="${pos - 220}" text-anchor="middle" font-size="300" font-family="IBM Plex Mono,monospace" fill="${C.ink60}">${b - a}</text>`;
    } else {
      s += `<line x1="${pos}" y1="${a}" x2="${pos}" y2="${b}" stroke="${C.ink35}" stroke-width="30"/>`;
      s += `<line x1="${pos - 140}" y1="${a}" x2="${pos + 140}" y2="${a}" stroke="${C.ink35}" stroke-width="50"/>`;
      s += `<line x1="${pos - 140}" y1="${b}" x2="${pos + 140}" y2="${b}" stroke="${C.ink35}" stroke-width="50"/>`;
      s += `<text x="${pos - 220}" y="${m}" text-anchor="middle" font-size="300" font-family="IBM Plex Mono,monospace" fill="${C.ink60}" transform="rotate(-90 ${pos - 220} ${m})">${b - a}</text>`;
    }
  }
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
  s += `<text x="${st.x + 560}" y="${st.y + st.h / 2 + 100}" text-anchor="middle" font-size="260" font-family="IBM Plex Mono,monospace" fill="${C.ink60}">${st.label}</text>`;
  return s;
}

function furnGlyph(f) {
  let s = '';
  if (f.t === 'c') {
    s += `<circle cx="${f.x}" cy="${f.y}" r="${f.r}" fill="${C.furnFill}" stroke="${C.furn}" stroke-width="28"/>`;
    if (f.l) s += `<text x="${f.x}" y="${f.y + 90}" text-anchor="middle" font-size="220" font-family="IBM Plex Mono,monospace" fill="${C.ink35}">${esc(f.l)}</text>`;
    return s;
  }
  const rx = f.t === 'car' ? 350 : f.t === 'bed' ? 80 : 0;
  s += `<rect x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}" rx="${rx}" fill="${C.furnFill}" stroke="${C.furn}" stroke-width="30"/>`;
  if (f.t === 'car') {
    s += `<rect x="${f.x + 220}" y="${f.y + 750}" width="${f.w - 440}" height="1350" rx="180" fill="none" stroke="${C.furn}" stroke-width="26"/>`;
    s += `<text x="${f.x + f.w / 2}" y="${f.y + f.h - 550}" text-anchor="middle" font-size="240" font-family="IBM Plex Mono,monospace" fill="${C.ink35}">${f.h} × ${f.w}</text>`;
  } else if (f.t === 'bed') {
    s += `<line x1="${f.x}" y1="${f.y + 450}" x2="${f.x + f.w}" y2="${f.y + 450}" stroke="${C.furn}" stroke-width="26"/>`;
    s += `<text x="${f.x + f.w / 2}" y="${f.y + f.h - 350}" text-anchor="middle" font-size="240" font-family="IBM Plex Mono,monospace" fill="${C.ink35}">${f.w} × ${f.h}</text>`;
  } else if (f.l) {
    s += `<text x="${f.x + f.w / 2}" y="${f.y + f.h / 2 + 90}" text-anchor="middle" font-size="240" font-family="IBM Plex Mono,monospace" fill="${C.ink35}">${esc(f.l)}</text>`;
  }
  return s;
}

function compass(cx, cy, az) {
  const a = (az - 0) * Math.PI / 180, r = 620;
  const nx = cx + r * Math.sin(a), ny = cy - r * Math.cos(a);
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${C.ink35}" stroke-width="35"/>`
    + `<line x1="${cx}" y1="${cy}" x2="${nx}" y2="${ny}" stroke="${C.ink}" stroke-width="70"/>`
    + `<circle cx="${nx}" cy="${ny}" r="110" fill="${C.ink}"/>`
    + `<text x="${nx}" y="${ny + 380}" text-anchor="middle" font-size="290" font-family="IBM Plex Mono,monospace" fill="${C.ink60}">С</text>`;
}

export function renderLevel(house, L, opt = {}) {
  const S = house.shell, sides = house.site.sides;
  const showFurn = opt.furniture !== false, showDims = opt.dims !== false;
  const padL = 2400, padR = L.veranda ? 4900 : 2700, padT = 1800, padB = 2700;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-padL} ${-padT} ${S.w + padL + padR} ${S.h + padT + padB}" font-family="IBM Plex Sans,system-ui,sans-serif">`;
  s += `<rect x="${-padL}" y="${-padT}" width="${S.w + padL + padR}" height="${S.h + padT + padB}" fill="${C.paper}"/>`;

  if (L.veranda) {
    const v = L.veranda;
    s += `<rect x="${v.x}" y="${v.y}" width="${v.w}" height="${v.h}" fill="${C.paper}" stroke="${C.ink35}" stroke-width="70" stroke-dasharray="260 180"/>`;
    for (let i = 1; i <= 3; i++) s += `<line x1="${v.x + 200}" y1="${v.y + 300 * i}" x2="${v.x + v.w - 200}" y2="${v.y + 300 * i}" stroke="${C.ink35}" stroke-width="40"/>`;
    for (const dy of [250, v.h / 2, v.h - 250]) s += `<rect x="${v.x + v.w - 340}" y="${v.y + dy - 170}" width="340" height="340" fill="${C.ink35}"/>`;
    s += `<text x="${v.x + v.w / 2}" y="${v.y + 1100}" text-anchor="middle" font-size="420" fill="${C.ink}">Веранда</text>`;
    s += `<text x="${v.x + v.w / 2}" y="${v.y + 1620}" text-anchor="middle" font-size="340" font-family="IBM Plex Mono,monospace" fill="${C.ink60}">${fmt(v.w * v.h)} м²</text>`;
    s += `<text x="${v.x + v.w / 2}" y="${v.y + v.h + 560}" text-anchor="middle" font-size="300" font-family="IBM Plex Mono,monospace" fill="${C.ink35}">${v.w} × ${v.h}</text>`;
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
  if (L.stair) s += stairGlyph(L.stair);
  if (showFurn) for (const f of L.furniture || []) s += furnGlyph(f);

  for (const r of L.rooms) {
    const cx = r.x + r.w / 2;
    const cy = r.label ? r.label.y : (r.tag === 'garage' || r.h > 3400 ? r.y + Math.min(r.h * 0.28, 1300) : r.y + r.h / 2);
    const parts = r.name.includes(' — ') ? r.name.split(' — ') : r.name.includes(' / ') ? r.name.split(' / ') : [r.name];
    const small = r.name.length > 15 && r.w < 4200;
    s += `<circle cx="${cx}" cy="${cy - 850}" r="270" fill="${C.ink}"/>`;
    s += `<text x="${cx}" y="${cy - 750}" text-anchor="middle" font-size="340" font-family="IBM Plex Mono,monospace" fill="${C.room}">${r.n}</text>`;
    parts.forEach((t, i) => {
      s += `<text x="${cx}" y="${cy - 50 + i * 480}" text-anchor="middle" font-size="${small ? 310 : 380}" fill="${C.ink}" paint-order="stroke" stroke="${C.room}" stroke-width="160">${esc(t)}</text>`;
    });
    s += `<text x="${cx}" y="${cy - 50 + parts.length * 480 + 60}" text-anchor="middle" font-size="330" font-family="IBM Plex Mono,monospace" fill="${C.ink60}" paint-order="stroke" stroke="${C.room}" stroke-width="160">${fmt(r.w * r.h)} м²</text>`;
  }

  if (showDims) {
    s += chain('x', S.h + 950, L.dims.x);
    s += chain('x', S.h + 1850, [0, S.w]);
    const dx = L.veranda ? S.w + 3900 : S.w + 1350;
    s += chain('y', dx, L.dims.y);
    s += chain('y', dx + 950, [0, S.h]);
  }

  s += compass(-1350, 1350, house.site.frontAzimuth);
  s += `<text x="${S.w / 2}" y="-700" text-anchor="middle" font-size="400" font-family="IBM Plex Mono,monospace" letter-spacing="120" fill="${C.ink}">${sides.S}</text>`;
  s += `<text x="${S.w / 2}" y="${S.h + 2420}" text-anchor="middle" font-size="340" font-family="IBM Plex Mono,monospace" letter-spacing="120" fill="${C.ink35}">${sides.N}</text>`;
  s += `<text x="-1350" y="${S.h / 2 + 1200}" text-anchor="middle" font-size="340" font-family="IBM Plex Mono,monospace" letter-spacing="80" fill="${C.ink35}" transform="rotate(-90 ${-1350} ${S.h / 2 + 1200})">${sides.W}</text>`;
  const ex = L.veranda ? S.w + 2550 : S.w + 750;
  s += `<text x="${ex}" y="${S.h / 2}" text-anchor="middle" font-size="340" font-family="IBM Plex Mono,monospace" letter-spacing="80" fill="${C.ink35}" transform="rotate(90 ${ex} ${S.h / 2})">${sides.E}</text>`;
  s += `</svg>`;
  return s;
}

export function explication(L) {
  const rows = L.rooms.map(r => ({ n: r.n, name: r.name, area: r.w * r.h / 1e6 }));
  return { rows, total: rows.reduce((s, r) => s + r.area, 0) };
}
