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
  cold: 'ХВ', hot: 'ГВ', drain: 'К', radiator: 'РД', supply: 'П', exhaust: 'ВЫ',
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

export function renderElevation(house, L, room, systems = []) {
  const per = perimeter(room), H = L.clear, off = offsets(room);
  const padL = 1500, padR = 900, padT = 1500, padB = 2100;
  const Z = z => H - z;                                  // отметка вверх

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

  // проёмы, окна, мебель
  for (const side of SIDES) {
    const x0 = off[side];
    for (const it of faceItems(house, L, room, side)) {
      const x = x0 + it.a, w = it.b - it.a;
      if (it.kind === 'furn') {
        if (!it.z1) continue;
        s += box(x, Z(it.z1), w, it.z1, C.furn, 45, C.furnFill);
        const nm = it.l || NAME[it.sym] || '';
        if (nm) s += txt(x + w / 2, Z(it.z1) - 120, nm, 210, C.ink60);
      } else if (it.kind === 'window') {
        s += box(x, Z(it.z1), w, it.z1 - it.z0, C.ink, 60, C.glass);
        s += txt(x + w / 2, Z(it.z1) - 120, `${w} · низ ${it.z0}`, 200, C.ink60);
      } else {
        const dash = it.kind === 'pass' ? '200 160' : null;
        s += box(x, Z(it.z1), w, it.z1, C.ink, 60, C.room);
        if (dash) s += line(x, Z(it.z1), x + w, Z(it.z1), C.paper, 70, dash);
        s += txt(x + w / 2, Z(it.z1) - 120, `${w} × ${it.z1}`, 200, C.ink60);
      }
    }
  }

  // точки разделов
  const placed = [];
  for (const sys of systems) {
    const color = SYS_C[sys.id] || C.ink;
    for (const p of sys.points) {
      if (p.room !== room.id || p.level !== L.id) continue;
      let x, y = Z(p.z);
      if (p.side) x = off[p.side] + p.along;
      else continue;                                     // потолочные — на плане, не на развёртке
      if (p.kind === 'radiator') {
        s += box(x - p.len / 2, Z(p.z + 500), p.len, 500, color, 50, C.room);
        continue;
      }
      let dy = 0;                                         // одинаковые места разводим по вертикали
      while (placed.some(q => Math.abs(q.x - x) < 320 && Math.abs(q.y - (y + dy)) < 320)) dy -= 340;
      placed.push({ x, y: y + dy });
      s += pill(x, y + dy, GLYPH[p.kind] || '?', color);
      s += txt(x + 250, y + dy + 70, String(p.z), 180, C.ink35, 'start');
    }
  }

  s += txt(0, H + 700, `${room.name} · развёртка · ${L.title}`, 300, C.ink, 'start', false);
  s += txt(per, H + 700, `периметр ${per} · h ${H}`, 260, C.ink60, 'end');
  s += `</svg>`;
  return s;
}

export const elevationRooms = L => L.rooms.filter(r =>
  r.tag === 'wet' || r.tag === 'tech' || /Кухня|Сауна|Мастерская|Гардеробная/.test(r.name));
