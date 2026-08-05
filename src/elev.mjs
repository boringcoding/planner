// Развёртка помещения — лента из четырёх граней подряд: юго-запад, юго-восток,
// северо-восток, северо-запад. Отсчёт along устроен так, что конец одной грани
// совпадает с началом следующей, поэтому помещение разворачивается без разрывов
// и по ленте видно, что на какой стене висит.
//
// На одном листе стоят точки всех разделов сразу: развёртка и нужна затем,
// чтобы розетка не оказалась там же, где вытяжка, а смеситель — за дверью.

import { SIDES, face, faceItems, perimeter } from './model.mjs';
import { SYS_C } from './render.mjs';

const C = {
  ink: '#171C24', ink60: '#6E7178', ink35: '#9A9CA1',
  paper: '#E4E3DC', room: '#FBFAF7',
  furn: 'rgba(23,28,36,0.40)', furnFill: 'rgba(23,28,36,0.06)',
  glass: 'rgba(46,108,140,0.14)'
};
const SIDE_T = { S: 'ЮЗ', E: 'ЮВ', N: 'СВ', W: 'СЗ' };
const GLYPH = {
  socket: 'Р', socketIP: 'Р+', power: '3Ф', light: 'С', switch: 'В',
  cold: 'ХВ', hot: 'ГВ', drain: 'К', radiator: 'РД', convector: 'КВ', supply: 'П', exhaust: 'ВЫ',
  data: 'RJ', tv: 'ТВ', rack: 'Ш', leak: 'ПР', smoke: 'ДЫ'
};

// на развёртке имя важнее, чем на плане: на плане предмет узнаётся по символу,
// здесь он превращается в прямоугольник и без подписи неотличим от соседнего
const NAME = {
  wc: 'унитаз', sink: 'раковина', bath: 'ванна', shower: 'душ', washerCol: 'стирка',
  kitchen: 'кухня', fridge: 'холодильник', wardrobe: 'шкаф', rack: 'стеллаж',
  workbench: 'верстак', machine: 'станок', boiler: 'котёл', tank: 'бак', ahu: 'ПВУ',
  panel: 'щит', firewood: 'дрова', benchSauna: 'полок', heaterSauna: 'печь',
  bed: 'кровать', nightstand: 'тумба', dresser: 'комод', desk: 'стол', sofa: 'диван',
  armchair: 'кресло', table: 'стол', tv: 'ТВ', bench: 'лавка', car: 'машина', drain: 'трап'
};

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const txt = (x, y, t, fs, fill, anchor = 'middle', mono = true) =>
  `<text x="${Math.round(x)}" y="${Math.round(y)}" text-anchor="${anchor}" font-size="${Math.round(fs)}"`
  + (mono ? ' font-family="IBM Plex Mono,monospace"' : '') + ` fill="${fill}">${esc(t)}</text>`;
const line = (x1, y1, x2, y2, st, w, dash) =>
  `<line x1="${Math.round(x1)}" y1="${Math.round(y1)}" x2="${Math.round(x2)}" y2="${Math.round(y2)}" stroke="${st}" stroke-width="${w}"`
  + (dash ? ` stroke-dasharray="${dash}"` : '') + '/>';
const box = (x, y, w, h, st, sw, fill = 'none') =>
  `<rect x="${Math.round(x)}" y="${Math.round(y)}" width="${Math.round(w)}" height="${Math.round(h)}" fill="${fill}" stroke="${st}" stroke-width="${sw}"/>`;

// смещение грани в ленте: S → E → N → W
function offsets(room) {
  const o = {}; let at = 0;
  for (const s of SIDES) { o[s] = at; at += face(room, s).len; }
  return o;
}

function pill(x, y, t, color, scale = 1) {
  const h = 300 * scale, w = Math.max(h, (t.length * 130 + 150) * scale), r = h / 2;
  return `<rect x="${Math.round(x - w / 2)}" y="${Math.round(y - h / 2)}" width="${Math.round(w)}" height="${Math.round(h)}" rx="${Math.round(r)}"`
    + ` fill="${C.room}" stroke="${color}" stroke-width="${Math.round(40 * scale)}"/>`
    + txt(x, y + 76 * scale, t, 190 * scale, color);
}

const ADV = 0.60;                                        // ширина знака моноширинного шрифта
const textRect = (x, y, t, fs, left) => ({ x: left ? x : x - t.length * fs * ADV / 2, y: y - fs * 0.8, w: t.length * fs * ADV, h: fs });
const pillRect = (x, y, t) => { const h = 300, w = Math.max(h, t.length * 130 + 150); return { x: x - w / 2, y: y - h / 2, w, h }; };
const grow = (r, m) => ({ x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m });
const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// Раскладка развёртки считается один раз: по ней рисуется лист и её же
// проверяет правило. Метка раздела стоит на своей отметке — двигать её
// нельзя, поэтому от неё уходит подпись предмета: она поднимается над
// контуром, пока не найдёт свободное место. Не нашла — лист переполнен,
// и об этом должно сказать правило, а не молчащий чертёж
export function elevLayout(house, L, room, systems = []) {
  const per = perimeter(room), H = L.clear, off = offsets(room);
  const Z = z => H - z;
  const shapes = [], pills = [], caps = [], marks = [];

  for (const side of SIDES) {
    const x0 = off[side];
    for (const it of faceItems(house, L, room, side, 260)) {
      const x = x0 + it.a, w = it.b - it.a;
      if (it.kind === 'furn') {
        if (!it.z1) continue;
        shapes.push({ kind: 'furn', x, y: Z(it.z1), w, h: it.z1 });
        const nm = it.l || NAME[it.sym] || '';
        if (nm) caps.push({ t: nm, x: x + w / 2, top: Z(it.z1) - 120, fs: 210, owner: it.id || nm });
      } else if (it.kind === 'window') {
        shapes.push({ kind: 'window', x, y: Z(it.z1), w, h: it.z1 - it.z0 });
        caps.push({ t: `${w} · низ ${it.z0}`, x: x + w / 2, top: Z(it.z1) - 120, fs: 200, owner: it.id });
      } else {
        shapes.push({ kind: it.kind, x, y: Z(it.z1), w, h: it.z1, dash: it.kind === 'pass' });
        caps.push({ t: `${w} × ${it.z1}`, x: x + w / 2, top: Z(it.z1) - 120, fs: 200, owner: it.id });
      }
    }
  }

  for (const sys of systems) {
    const color = SYS_C[sys.id] || C.ink;
    for (const p of sys.points) {
      if (p.room !== room.id || p.level !== L.id || !p.side) continue;
      const x = off[p.side] + p.along, y = Z(p.z);
      if (p.kind === 'radiator' || p.kind === 'convector') {
        const h = p.kind === 'convector' ? 120 : 500;
        shapes.push({ kind: 'radiator', x: x - p.len / 2, y: Z(p.z + h), w: p.len, h, color }); continue;
      }
      // одинаковые места разводим по вертикали. Считается по настоящим
      // рамкам меток: «RJ» шире «Р», и порогом на глаз они разъезжаются
      const t = GLYPH[p.kind] || '?';
      let dy = 0;
      while (pills.some(q => hit(grow(pillRect(x, y + dy, t), 40), pillRect(q.x, q.y, q.t)))) dy -= 360;
      pills.push({ t, x, y: y + dy, color, owner: p.id, z: p.z });
    }
  }

  // отметка пишется только там, где ей есть место: подписанная поверх
  // соседней метки цифра мешает больше, чем помогает. Решается это после
  // того, как расставлены все метки, — сосед справа появляется позже
  const pb = pills.map(q => pillRect(q.x, q.y, q.t));
  pills.forEach((p, i) => {
    const m = { t: String(p.z), x: pb[i].x + pb[i].w + 60, y: p.y + 70, fs: 180, owner: p.owner, left: true };
    const r = textRect(m.x, m.y, m.t, m.fs, true);
    if (pb.some(q => hit(r, q)) || marks.some(o => hit(r, textRect(o.x, o.y, o.t, o.fs, true)))) return;
    marks.push(m);
  });

  // подписи предметов уходят вверх от меток и друг от друга
  const taken = pills.map(q => pillRect(q.x, q.y, q.t))
    .concat(marks.map(m => textRect(m.x, m.y, m.t, m.fs, true)));
  const shifts = [];
  for (let dy = 0; dy >= -1500; dy -= 250)
    for (const dx of [0, 300, -300, 600, -600]) shifts.push([dx, dy]);
  shifts.sort((a, b) => (Math.abs(a[0]) - Math.abs(b[0])) || (b[1] - a[1]));
  for (const c of caps) {
    const x0 = c.x, y0 = c.top;
    c.x = x0; c.y = y0;
    for (const [dx, dy] of shifts) {
      const r = textRect(x0 + dx, y0 + dy, c.t, c.fs);
      if (taken.some(q => hit(r, q))) continue;
      c.x = x0 + dx; c.y = y0 + dy; c.fitted = true; taken.push(r); break;
    }
  }
  return { per, H, off, Z, shapes, pills, caps, marks };
}

// рамки всех подписей листа: правило смотрит те же прямоугольники,
// по которым чертёж и рисуется
export function elevBoxes(house, L, room, systems = []) {
  const g = elevLayout(house, L, room, systems);
  return [
    ...g.pills.map(p => ({ ...pillRect(p.x, p.y, p.t), kind: 'метка', owner: p.owner, fitted: true })),
    ...g.marks.map(m => ({ ...textRect(m.x, m.y, m.t, m.fs, true), kind: 'отметка', owner: m.owner, fitted: true })),
    ...g.caps.map(c => ({ ...textRect(c.x, c.y, c.t, c.fs), kind: 'подпись', owner: c.owner, fitted: !!c.fitted }))
  ];
}

export function renderElevation(house, L, room, systems = []) {
  const g = elevLayout(house, L, room, systems);
  const { per, H, off, Z } = g;
  const padL = 1500, padR = 900, padT = 1500, padB = 2100;

  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-padL} ${-padT} ${per + padL + padR} ${H + padT + padB}" font-family="IBM Plex Sans,system-ui,sans-serif">`;
  s += `<rect x="${-padL}" y="${-padT}" width="${per + padL + padR}" height="${H + padT + padB}" fill="${C.paper}"/>`;
  s += `<rect x="0" y="0" width="${per}" height="${H}" fill="${C.room}"/>`;

  // пол, потолок, углы
  s += line(0, 0, per, 0, C.ink, 60);
  s += line(0, H, per, H, C.ink, 90);
  for (const side of SIDES) {
    const x = off[side];
    if (x > 0) s += line(x, 0, x, H, C.ink35, 40, '180 140');
    s += txt(x + face(room, side).len / 2, -400, `${SIDE_T[side]} · ${face(room, side).len}`, 260, C.ink60);
  }

  // отметки высот слева
  for (const [z, t] of [[0, '0'], [H, String(H)]])
    s += txt(-200, Z(z) + 90, t, 240, C.ink60, 'end');

  // проёмы, окна, мебель, радиаторы
  for (const sh of g.shapes) {
    if (sh.kind === 'furn') s += box(sh.x, sh.y, sh.w, sh.h, C.furn, 45, C.furnFill);
    else if (sh.kind === 'window') s += box(sh.x, sh.y, sh.w, sh.h, C.ink, 60, C.glass);
    else if (sh.kind === 'radiator') s += box(sh.x, sh.y, sh.w, sh.h, sh.color, 50, C.room);
    else {
      s += box(sh.x, sh.y, sh.w, sh.h, C.ink, 60, C.room);
      if (sh.dash) s += line(sh.x, sh.y, sh.x + sh.w, sh.y, C.paper, 70, '200 160');
    }
  }
  for (const c of g.caps) s += txt(c.x, c.y, c.t, c.fs, C.ink60);
  for (const p of g.pills) s += pill(p.x, p.y, p.t, p.color);
  for (const m of g.marks) s += txt(m.x, m.y, m.t, m.fs, C.ink35, 'start');

  s += txt(0, H + 700, `${room.name} · развёртка · ${L.title}`, 300, C.ink, 'start', false);
  s += txt(0, H + 1180, `периметр ${per} · h ${H}`, 250, C.ink60, 'start');
  s += `</svg>`;
  return s;
}

export const elevationRooms = L => L.rooms.filter(r =>
  r.tag === 'wet' || r.tag === 'tech' || /Кухня|Сауна|Мастерская|Гардеробная/.test(r.name));
