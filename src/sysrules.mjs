// Правила по разделам. Точка, посаженная мимо, выглядит на плане так же
// уверенно, как посаженная правильно: розетка за шкафом, выключатель на
// дверном полотне и вытяжка, которой нет, — всё это на картинке незаметно.

import { face, faceItems, SIDES } from './model.mjs';
import { KIND, place, reach, bill } from './systems.mjs';
import { roomBlock } from './render.mjs';

export const SLIMITS = {
  swZ: [800, 1100],     // высота выключателя
  swNear: 1100,         // от края проёма до выключателя
  wetSafe: 600,         // от борта душа или ванны до розетки — зона 1
  minGap: 300,          // между точками одного раздела на плане
  minGapZ: 800,         // ...если они ещё и на одной высоте: решётка над
                        // радиатором стоит там же, но путать их нечем
  socketZ: [100, 1300], // высота розетки
  radiatorZ: 400        // низ радиатора
};

const WET_SYM = new Set(['shower', 'bath']);

export function checkSystems(house, data) {
  const errs = [];
  const ids = new Set();
  const lv = id => house.levels.find(l => l.id === id);

  for (const sys of data.systems) {
    const E = m => errs.push(`${sys.id.toUpperCase()}: ${m}`);

    // 1. стояк системы существует на каждом уровне: в стене или в шахте
    for (const L of house.levels) {
      if (L.id === sys.source.level) continue;
      const v = sys.vertical;
      const inWall = (L.walls || []).some(w => v.x > w.x && v.x < w.x + w.w && v.y > w.y && v.y < w.y + w.h);
      const shafts = [L.riser, ...(L.ducts || []), ...(L.flues || [])].filter(Boolean);
      const inShaft = shafts.some(q => v.x > q.x && v.x < q.x + q.w && v.y > q.y && v.y < q.y + q.h);
      if (!inWall && !inShaft) E(`стояк ${v.x},${v.y} на уровне «${L.title}» не попадает ни в стену, ни в шахту`);
    }

    const seen = [];
    for (const p of sys.points) {
      const tag = `${p.id} (${p.kind})`;
      if (ids.has(p.id)) E(`идентификатор ${p.id} повторяется`);
      ids.add(p.id);

      const L = lv(p.level);
      if (!L) { E(`${tag}: нет уровня ${p.level}`); continue; }
      const room = L.rooms.find(r => r.id === p.room);
      if (!room) { E(`${tag}: нет помещения ${p.room}`); continue; }
      const at = place(house, p);
      if (!at) { E(`${tag}: не удалось посадить на план`); continue; }

      // 2. высота в пределах этажа
      if (p.z < 0 || p.z > L.clear) E(`${tag}: отметка ${p.z} вне высоты этажа ${L.clear}`);
      if ((p.kind === 'socket' || p.kind === 'socketIP')
        && (p.z < SLIMITS.socketZ[0] || p.z > SLIMITS.socketZ[1]))
        E(`${tag}: розетка на отметке ${p.z}, норма ${SLIMITS.socketZ.join('…')}`);
      if (p.kind === 'switch' && (p.z < SLIMITS.swZ[0] || p.z > SLIMITS.swZ[1]))
        E(`${tag}: выключатель на отметке ${p.z}, норма ${SLIMITS.swZ.join('…')}`);

      if (p.side) {
        const f = face(room, p.side);
        if (p.along < 0 || p.along > f.len) { E(`${tag}: вылезает за грань ${p.side} (${p.along} из ${f.len})`); continue; }
        const items = faceItems(house, L, room, p.side);

        // 3. точка не попадает в проём и не прячется за мебелью выше себя
        for (const it of items) {
          const on = p.along > it.a - 60 && p.along < it.b + 60;
          if (!on) continue;
          if ((it.kind === 'door' || it.kind === 'pass' || it.kind === 'gate') && p.z < it.z1)
            E(`${tag}: попадает в проём ${it.id}`);
          if (it.kind === 'window' && p.z > it.z0 - 100 && p.z < it.z1)
            E(`${tag}: попадает в окно ${it.id}`);
          if (it.kind === 'furn' && it.z1 > p.z + 50 && p.kind !== 'radiator' && it.id !== p.host)
            E(`${tag}: закрыт(а) мебелью ${it.l || it.sym || it.id}`);
        }

        // 4. выключатель — у проёма, а не посреди стены
        if (p.kind === 'switch') {
          const near = items.some(it => (it.kind === 'door' || it.kind === 'pass')
            && (Math.abs(p.along - it.b) < SLIMITS.swNear || Math.abs(p.along - it.a) < SLIMITS.swNear));
          if (!near) E(`${tag}: выключатель не у проёма`);
        }

        // 5. радиатор не длиннее своего окна и стоит под ним
        if (p.kind === 'radiator') {
          const win = items.find(it => it.kind === 'window'
            && p.along > it.a - 400 && p.along < it.b + 400);
          if (!win) E(`${tag}: радиатор не под окном`);
          else if (p.len > win.b - win.a) E(`${tag}: радиатор ${p.len} длиннее окна ${win.b - win.a}`);
          // мебель перед радиатором — это отопление шкафа, а не помещения
          for (const it of items) {
            if (it.kind !== 'furn' || it.z1 < 300) continue;
            const ov = Math.min(it.b, p.along + p.len / 2) - Math.max(it.a, p.along - p.len / 2);
            if (ov > 150) E(`${tag}: радиатор перекрыт мебелью ${it.l || it.sym} на ${Math.round(ov)} мм`);
          }
        }
      }

      // 6. розетка в мокром помещении: только IP44 и не в зоне брызг
      if (room.tag === 'wet') {
        if (p.kind === 'socket') E(`${tag}: в мокром помещении розетка должна быть IP44`);
        if (p.kind === 'socketIP' || p.kind === 'socket') {
          for (const g of L.furniture || []) {
            if (!WET_SYM.has(g.sym)) continue;
            const dx = Math.max(g.x - at.x, at.x - (g.x + g.w), 0);
            const dy = Math.max(g.y - at.y, at.y - (g.y + g.h), 0);
            if (Math.hypot(dx, dy) < SLIMITS.wetSafe)
              E(`${tag}: ${Math.round(Math.hypot(dx, dy))} мм до «${g.sym}», нужно ${SLIMITS.wetSafe}`);
          }
        }
      }

      // 7. точка не наезжает на подпись помещения и на соседнюю точку
      // на листах разделов от подписи остаётся только номер: место нужно точкам
      const lb = roomBlock({ ...room, label: { ...(room.label || {}), mode: 'num' } }).box;
      if (at.x > lb.x - 150 && at.x < lb.x + lb.w + 150 && at.y > lb.y - 150 && at.y < lb.y + lb.h + 150)
        E(`${tag}: попадает в подпись «${room.name}»`);
      for (const q of seen) {
        if (q.room !== p.room) continue;   // соседние помещения делят стену — это норма
        if (q.host && p.host && q.host === p.host) continue;   // подводки одного прибора
        if (Math.abs(q.z - p.z) >= SLIMITS.minGapZ) continue;
        if (Math.hypot(q.at.x - at.x, q.at.y - at.y) < SLIMITS.minGap)
          E(`${tag} и ${q.id} стоят ближе ${SLIMITS.minGap} мм`);
      }
      seen.push({ ...p, at });

      // 8. до точки есть трасса
      if (!reach(house, sys, p)) E(`${tag}: не удалось проложить трассу от узла`);
    }

    // 9. программа: свет и извещатель в каждом помещении, вытяжка в мокрых,
    // приток в жилых, подводка и выпуск у каждого мокрого прибора
    const has = (roomId, kind) => sys.points.some(p => p.room === roomId && p.kind === kind);
    for (const L of house.levels)
      for (const r of L.rooms) {
        if (sys.id === 'eom' && !has(r.id, 'light')) E(`«${r.name}» (${L.title}) без светильника`);
        if (sys.id === 'ss' && r.tag !== 'stair' && !has(r.id, 'smoke'))
          E(`«${r.name}» (${L.title}) без пожарного извещателя`);
        if (sys.id === 'ov') {
          const wet = r.tag === 'wet' || /Кухня|Сауна|Котельная|Гараж/.test(r.name);
          if (wet && !has(r.id, 'exhaust')) E(`«${r.name}» (${L.title}) без вытяжки`);
          if (r.tag === 'quiet' && !has(r.id, 'supply')) E(`«${r.name}» (${L.title}) без притока`);
        }
      }
    if (sys.id === 'vk')
      for (const L of house.levels)
        for (const g of L.furniture || []) {
          const need = { sink: ['cold', 'drain'], wc: ['cold', 'drain'], bath: ['cold', 'drain'], shower: ['cold', 'drain'], washerCol: ['cold', 'drain'], kitchen: ['cold', 'drain'] }[g.sym];
          if (!need) continue;
          for (const k of need)
            if (!sys.points.some(p => p.host === g.id && p.kind === k))
              E(`«${g.sym}» ${g.id} без подводки «${KIND[k].l}»`);
        }

    // 10. ведомость считается целиком: точка без метража — дыра в смете
    const b = bill(house, sys);
    if (!b.total) E('ведомость пуста');
  }
  return errs;
}
