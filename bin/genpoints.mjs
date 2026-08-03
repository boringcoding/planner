// Первичная расстановка точек по разделам. Запускается один раз на помещение:
// дальше data/systems.json — источник правды, и точку двигают в нём, а не здесь.
//
// Розетки и выключатели садятся на свободные участки граней: дверь, окно
// и мебель выше самой точки участок занимают. Светильники — по потолку,
// радиаторы — под окнами, сантехнические подводки — по приборам.
// Программа помещения (сколько чего) задаётся руками: это решение, а не расчёт.

import fs from 'node:fs';
import { SIDES, face, faceItems } from '../src/model.mjs';
import { roomBlock } from '../src/render.mjs';

const house = JSON.parse(fs.readFileSync(new URL('../data/house.json', import.meta.url)));

// сколько розеток и на какой высоте, сколько светильников и выключателей
const PROG = {
  'cokol.r1': { sock: [[4, 1100], [2, 300]], power: 1, light: 2, sw: 1 },
  'cokol.r2': { sock: [[4, 1100]], light: 1, sw: 1 },
  'cokol.r3': { sock: [[2, 300]], light: 1, sw: 1 },
  'cokol.r4': { sock: [[2, 1100]], light: 1, sw: 1 },
  'cokol.r5': { light: 1, sw: 2 },
  'cokol.r6': { sock: [[1, 300]], light: 1, sw: 2 },
  'cokol.r7': { power: 1, light: 1 },
  'cokol.r8': { sock: [[4, 300]], light: 2, sw: 2 },
  'first.r1': { sock: [[4, 1100], [2, 300]], power: 1, light: 3, sw: 2 },
  'first.r2': { sock: [[1, 1100]], light: 1, sw: 1 },
  'first.r3': { light: 1, sw: 2 },
  'first.r4': { sock: [[1, 300]], light: 1, sw: 2 },
  'first.r5': { sock: [[6, 1100], [4, 300]], power: 1, light: 4, sw: 3 },
  'second.r1': { sock: [[4, 300]], light: 1, sw: 1 },
  'second.r2': { sock: [[4, 300], [2, 1100]], light: 2, sw: 1 },
  'second.r3': { sock: [[2, 300]], light: 2, sw: 2 },
  'second.r4': { sock: [[1, 1100]], light: 1, sw: 1 },
  'second.r5': { light: 1, sw: 1 },
  'second.r6': { sock: [[1, 300]], light: 1, sw: 2 },
  'second.r7': { sock: [[4, 300], [2, 700]], light: 1, sw: 2 },
  'second.r8': { sock: [[1, 300]], light: 1, sw: 1 }
};

const MARGIN = 350;   // от угла и от края проёма: иначе метки лезут друг на друга
const STEP = 700;     // минимум между точками на одной грани

// свободные участки грани на высоте z
function freeSpans(house, L, room, side, z) {
  const f = face(room, side);
  const blocked = [];
  for (const it of faceItems(house, L, room, side)) {
    if (it.kind === 'furn' && it.z1 <= z + 50) continue;          // ниже точки — не помеха
    if (it.kind === 'window' && (z < it.z0 - 100 || z > it.z1)) continue;
    blocked.push([it.a - MARGIN, it.b + MARGIN]);
  }
  blocked.sort((a, b) => a[0] - b[0]);
  const spans = [];
  let at = MARGIN;
  for (const [a, b] of blocked) {
    if (a > at) spans.push([at, Math.min(a, f.len - MARGIN)]);
    at = Math.max(at, b);
  }
  if (at < f.len - MARGIN) spans.push([at, f.len - MARGIN]);
  return spans.filter(([a, b]) => b - a > 300).map(([a, b]) => ({ side, a, b }));
}

// разложить n точек по свободным участкам всех граней, начиная с длинных.
// used — уже занятые места этого помещения: две точки в одной координате
// на плане сливаются в одну кляксу, даже если по высоте они разные
function place(house, L, room, n, z, used = []) {
  const all = SIDES.flatMap(s => freeSpans(house, L, room, s, z))
    .sort((p, q) => (q.b - q.a) - (p.b - p.a));
  const out = [];
  let guard = 0;
  while (out.length < n && guard++ < 40) {
    let placed = false;
    for (const sp of all) {
      if (out.length >= n) break;
      const taken = [...used, ...out];
      // Идём по участку шагом, а не в одну расчётную точку: середина стены
      // бывает занята зоной брызг или подписью, и тогда точке место рядом,
      // а не «нигде». Из подходящих берём самую дальнюю от уже стоящих
      let best = null, bestD = -1;
      for (let pos = sp.a; pos <= sp.b; pos += 100) {
        const pt = { side: sp.side, along: Math.round(pos), z };
        if (inLabel(room, pt) || tooClose(room, pt, taken)) continue;
        if (z < 1500 && splash(L, room, pt)) continue;   // зона брызг — про розетки, не про решётки
        const q = at(room, pt);
        const d = taken.length
          ? Math.min(...taken.map(o => Math.hypot(at(room, o).x - q.x, at(room, o).y - q.y)))
          : Math.min(pos - sp.a, sp.b - pos) + 1e5;
        if (d > bestD) { bestD = d; best = pt; }
      }
      if (!best) continue;
      out.push(best);
      placed = true;
    }
    if (!placed) break;
  }
  return out;
}

const at = (room, p) => p.side ? face(room, p.side).at(p.along) : p;

// на плане важно расстояние по плану, а не по грани: две точки у одного угла
// на разных гранях сливаются, хотя по своим граням стоят далеко
function tooClose(room, pt, others, d = 500) {
  const q = at(room, pt);
  return others.some(o => Math.hypot(at(room, o).x - q.x, at(room, o).y - q.y) < d);
}

// зона брызг: у душа и ванны розетке не место
function splash(L, room, pt, d = 700) {
  const q = at(room, pt);
  return (L.furniture || []).some(g => {
    if (g.sym !== 'shower' && g.sym !== 'bath') return false;
    const dx = Math.max(g.x - q.x, q.x - (g.x + g.w), 0), dy = Math.max(g.y - q.y, q.y - (g.y + g.h), 0);
    return Math.hypot(dx, dy) < d;
  });
}

// блок подписи помещения занят: точка, попавшая в него, на плане нечитаема
const labelBox = room => roomBlock({ ...room, label: { ...(room.label || {}), mode: 'num' } }).box;

function inLabel(room, pt) {
  const b = labelBox(room);
  const q = at(room, pt);
  return q.x > b.x - 250 && q.x < b.x + b.w + 250 && q.y > b.y - 250 && q.y < b.y + b.h + 250;
}

// сдвинуть потолочную точку из-под подписи вдоль длинной стороны помещения
function offLabel(room, pt) {
  if (!inLabel(room, pt)) return pt;
  const b = labelBox(room);
  const alongX = room.w >= room.h;
  for (const d of [1, -1]) {
    const q = alongX
      ? { x: (d > 0 ? b.x + b.w + 500 : b.x - 500), y: pt.y }
      : { x: pt.x, y: (d > 0 ? b.y + b.h + 500 : b.y - 500) };
    if (q.x > room.x + 300 && q.x < room.x + room.w - 300
      && q.y > room.y + 300 && q.y < room.y + room.h - 300 && !inLabel(room, q)) return q;
  }
  return pt;
}

// светильники: по центру, при нескольких — вдоль длинной стороны
function lights(room, n) {
  const out = [], along = room.w >= room.h ? 'x' : 'y';
  for (let i = 1; i <= n; i++) {
    const t = i / (n + 1);
    out.push(along === 'x'
      ? { x: Math.round(room.x + room.w * t), y: Math.round(room.y + room.h / 2) }
      : { x: Math.round(room.x + room.w / 2), y: Math.round(room.y + room.h * t) });
  }
  return out.map(p => offLabel(room, p));
}

// выключатели — у проёмов, внутри помещения, со стороны ручки
function switches(house, L, room, n, used = []) {
  const out = [];
  for (const side of SIDES) {
    for (const it of faceItems(house, L, room, side)) {
      if (it.kind !== 'door' && it.kind !== 'pass') continue;
      if (out.length >= n) break;
      const f = face(room, side);
      const at = it.b + MARGIN < f.len - 150 ? it.b + MARGIN : it.a - MARGIN;
      if (at < 150 || at > f.len - 150) continue;
      const free = freeSpans(house, L, room, side, 900).some(s => at >= s.a && at <= s.b);
      const pt = { side, along: Math.round(at), z: 900 };
      if (free && !inLabel(room, pt) && !used.some(u => u.side === side && Math.abs(u.along - at) < 400))
        out.push(pt);
    }
  }
  return out.slice(0, n);
}

const P = [];
let seq = { eom: 0, vk: 0, ov: 0, ss: 0 };
const add = (sys, o) => P.push({ id: `${sys}.p${++seq[sys]}`, sys, ...o });

for (const L of house.levels) {
  for (const room of L.rooms) {
    const prog = PROG[room.id] || {}, used = [];
    for (const [n, z] of prog.sock || [])
      for (const p of place(house, L, room, n, z, used)) {
        used.push(p);
        add('eom', { level: L.id, room: room.id, ...p, kind: room.tag === 'wet' ? 'socketIP' : 'socket' });
      }
    for (let i = 0; i < (prog.power || 0); i++) {
      const p = place(house, L, room, 1, 600, used)[0];
      if (p) { used.push(p); add('eom', { level: L.id, room: room.id, ...p, kind: 'power' }); }
    }
    for (const p of lights(room, prog.light || 0))
      add('eom', { level: L.id, room: room.id, ...p, z: L.clear, kind: 'light' });
    for (const p of switches(house, L, room, prog.sw || 0, used)) {
      used.push(p);
      add('eom', { level: L.id, room: room.id, ...p, kind: 'switch' });
    }

    // ВК: подводки по приборам
    const WATER = { sink: ['cold', 'hot', 'drain'], wc: ['cold', 'drain'], bath: ['cold', 'hot', 'drain'], shower: ['cold', 'hot', 'drain'], washerCol: ['cold', 'drain'], kitchen: ['cold', 'hot', 'drain'], tank: ['cold', 'hot'], boiler: ['cold', 'hot'] };
    const ZW = { cold: 600, hot: 600, drain: 300 };
    for (const g of L.furniture || []) {
      const kinds = WATER[g.sym];
      if (!kinds) continue;
      const gx = g.t === 'c' ? g.x : g.x + g.w / 2, gy = g.t === 'c' ? g.y : g.y + g.h / 2;
      if (gx < room.x || gx > room.x + room.w || gy < room.y || gy > room.y + room.h) continue;
      let side = null, mid = 0, span = 0;
      for (const s of SIDES) {
        const it = faceItems(house, L, room, s).find(i => i.id === g.id);
        if (it) { side = s; mid = (it.a + it.b) / 2; span = it.b - it.a; break; }
      }
      // прибор посреди помещения (бойлер, буфер) грани не касается —
      // подводка ставится по месту, а не на стену
      kinds.forEach((k, i) => {
        const t = (i + 1) / (kinds.length + 1) - 0.5;
        add('vk', side
          ? { level: L.id, room: room.id, side, along: Math.round(mid + t * (span || 400)), z: ZW[k], kind: k, host: g.id }
          : { level: L.id, room: room.id, x: Math.round(gx + t * 400), y: Math.round(gy), z: ZW[k], kind: k, host: g.id });
      });
    }

    // ОВ: радиатор под каждым окном, вытяжка в мокрых и на кухне,
    // приток в жилых — под потолком
    for (const side of SIDES) {
      const items = faceItems(house, L, room, side);
      for (const it of items) {
        if (it.kind !== 'window') continue;
        const mid = (it.a + it.b) / 2, len = Math.max(600, it.b - it.a - 200);
        // под окном может стоять кухонный фронт: радиатор туда не встаёт,
        // он грел бы шкаф. Такое окно остаётся без радиатора — тепло берут соседние
        const blocked = items.some(g => g.kind === 'furn' && g.z1 >= 300
          && Math.min(g.b, mid + len / 2) - Math.max(g.a, mid - len / 2) > 150);
        if (blocked) continue;
        add('ov', { level: L.id, room: room.id, side, along: Math.round(mid), z: 150, kind: 'radiator', len });
      }
    }
    // помещение без окон радиатора не получило бы вовсе: в цоколе окон нет,
    // а отапливать его надо. Ставим на самый длинный свободный участок стены
    const NOHEAT = ['stair', 'wardrobe'];
    const heated = !NOHEAT.includes(room.tag) && !/Сауна/.test(room.name);
    if (heated && !P.some(x => x.sys === 'ov' && x.kind === 'radiator' && x.room === room.id)) {
      const sp = SIDES.flatMap(x => freeSpans(house, L, room, x, 150))
        .sort((a, b) => (b.b - b.a) - (a.b - a.a))[0];
      if (sp) {
        const len = Math.min(1200, Math.max(600, Math.round((sp.b - sp.a) * 0.6)));
        add('ov', { level: L.id, room: room.id, side: sp.side, along: Math.round((sp.a + sp.b) / 2), z: 150, kind: 'radiator', len });
      }
    }

    const wetish = room.tag === 'wet' || /Кухня|Сауна|Котельная|Гараж/.test(room.name);
    if (wetish || room.tag === 'quiet' || room.tag === 'hall') {
      const kind = wetish ? 'exhaust' : 'supply';
      const p = place(house, L, room, 1, L.clear - 400)[0];
      if (p) add('ov', { level: L.id, room: room.id, ...p, kind });
    }

    // СС: интернет и ТВ там, где сидят; протечка — в мокрых; дым — везде
    const SS = { 'first.r5': ['data', 'tv'], 'second.r2': ['data', 'data'], 'second.r1': ['data'], 'second.r7': ['data', 'tv'], 'cokol.r8': ['data', 'tv'], 'cokol.r2': ['rack'] };
    const usedSS = [];
    for (const k of SS[room.id] || []) {
      const p = place(house, L, room, 1, k === 'tv' ? 1200 : 300, usedSS)[0];
      if (p) { usedSS.push(p); add('ss', { level: L.id, room: room.id, ...p, kind: k }); }
    }
    const mid = () => offLabel(room, { x: Math.round(room.x + room.w / 2), y: Math.round(room.y + room.h / 2) });
    if (room.tag === 'wet') add('ss', { level: L.id, room: room.id, ...mid(), z: 0, kind: 'leak' });
    if (room.tag !== 'stair') {
      const c = mid();
      const shifted = offLabel(room, { x: c.x, y: c.y + (room.tag === 'wet' ? 500 : 0) });
      add('ss', { level: L.id, room: room.id, ...shifted, z: L.clear, kind: 'smoke' });
    }
  }
}

const SYS = [
  {
    id: 'eom', trunk: 'ВВГнг-LS 5×6, питающая', title: 'ЭОМ · электрооборудование и освещение',
    source: { level: 'cokol', x: 7200, y: 2725, z: 1600, l: 'щит' },
    vertical: { x: 2460, y: 7500 }, run: 'ceiling',
    note: 'Ввод 30 кВт / 380 В. Кабель по потолку в гофре, спуски в штрабах.'
  },
  {
    id: 'vk', trunk: 'PEX 25, стояк', title: 'ВК · водоснабжение и канализация',
    source: { level: 'cokol', x: 550, y: 8100, z: 400, l: 'ввод и стояк' },
    vertical: { x: 550, y: 8100 }, run: 'floor',
    note: 'Ввод с юго-запада. Один стояк на три уровня, разводка по полу в гильзах.'
  },
  {
    id: 'ov', trunk: 'PEX 25, магистраль', title: 'ОВ · отопление и вентиляция',
    source: { level: 'cokol', x: 7150, y: 1450, z: 800, l: 'котёл' },
    vertical: { x: 2460, y: 8600 }, run: 'floor',
    note: 'Котёл на твёрдом топливе с буфером. Приточно-вытяжная установка в цоколе, магистраль через вентшахту.'
  },
  {
    id: 'ss', trunk: 'UTP cat.6, магистраль', title: 'СС · слаботочные системы',
    source: { level: 'cokol', x: 7200, y: 2400, z: 1600, l: 'слаботочный шкаф' },
    vertical: { x: 2460, y: 7000 }, run: 'ceiling',
    note: 'Витая пара звездой от шкафа, извещатели и датчики протечки — шлейфом.'
  }
];

const out = { systems: SYS.map(s => ({ ...s, points: P.filter(p => p.sys === s.id).map(({ sys, ...p }) => p) })) };
const json = JSON.stringify(out, (k, v) => v, 1)
  .replace(/\n\s+"(id|level|room|side|along|z|kind|len|host|x|y)": /g, ' "$1": ')
  .replace(/\{\n?\s*"id"/g, '{ "id"')
  .replace(/\s*\n\s*\}/g, ' }');
fs.writeFileSync(new URL('../data/systems.json', import.meta.url), json + '\n');

for (const s of SYS) console.log(`${s.id}: ${P.filter(p => p.sys === s.id).length} точек`);
