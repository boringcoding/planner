// Правила по разделам. Точка, посаженная мимо, выглядит на плане так же
// уверенно, как посаженная правильно: розетка за шкафом, выключатель на
// дверном полотне и вытяжка, которой нет, — всё это на картинке незаметно.

import { face, faceItems, SIDES } from './model.mjs';
import { KIND, RESERVE, UFH_STEP, place, reach, bill, runSegments3d, trunkSegments3d, segsLen } from './systems.mjs';
import { roomBlock } from './render.mjs';
import { elevBoxes, elevationRooms } from './elev.mjs';

export const SLIMITS = {
  swZ: [800, 1100],     // высота выключателя
  swNear: 1100,         // от края проёма до выключателя
  wetSafe: 600,         // от борта душа или ванны до розетки — зона 1
  minGap: 300,          // между точками одного раздела на плане
  minGapZ: 800,         // ...если они ещё и на одной высоте: решётка над
                        // радиатором стоит там же, но путать их нечем
  socketZ: [100, 1300], // высота розетки
  radiatorZ: 400,       // низ радиатора
  radiatorH: 500,       // высота радиатора: ниже неё за ним ничего не ставится
  sillRadiator: 700     // подоконник ниже — радиатор не встаёт, нужен конвектор в полу
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
        if (p.kind === 'radiator' || p.kind === 'convector') {
          const dev = p.kind === 'convector' ? 'конвектор' : 'радиатор';
          // под окном — там, где окна есть. В цоколе окон нет вовсе,
          // и радиатор там встаёт на свободную стену, а не «не туда»
          const hasWin = SIDES.some(sd => faceItems(house, L, room, sd).some(i => i.kind === 'window'));
          const win = items.find(it => it.kind === 'window'
            && p.along > it.a - 400 && p.along < it.b + 400);
          if (!win && hasWin) E(`${tag}: ${dev} не под окном`);
          else if (win && p.len > win.b - win.a) E(`${tag}: ${dev} ${p.len} длиннее окна ${win.b - win.a}`);
          // подоконник ниже верха радиатора — прибор упирается в стекло.
          // Панорамное окно греется конвектором в полу, и наоборот
          if (win && win.z0 < SLIMITS.sillRadiator && p.kind === 'radiator')
            E(`${tag}: подоконник ${win.z0} ниже ${SLIMITS.sillRadiator} — под таким окном конвектор в полу, а не радиатор`);
          if (win && win.z0 >= SLIMITS.sillRadiator && p.kind === 'convector')
            E(`${tag}: под окном с подоконником ${win.z0} хватает радиатора`);
          // мебель перед радиатором — это отопление шкафа, а не помещения
          for (const it of items) {
            if (it.kind !== 'furn' || it.z1 < 300) continue;
            const ov = Math.min(it.b, p.along + p.len / 2) - Math.max(it.a, p.along - p.len / 2);
            if (ov > 150) E(`${tag}: ${dev} перекрыт мебелью ${it.l || it.sym} на ${Math.round(ov)} мм`);
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

      // 8а. зона контура тёплого пола: лежит в своём помещении, не наезжает
      // на соседний контур, не длиннее нормы и накрывает пол, а не угол
      if (p.kind === 'ufh') {
        if (p.x < room.x || p.y < room.y || p.x + p.w > room.x + room.w || p.y + p.h > room.y + room.h)
          E(`${tag}: зона контура вылезает из «${room.name}»`);
        const len = p.w * p.h / UFH_STEP;
        if (len > 120000)
          E(`${tag}: контур ${Math.round(len / 1000)} м длиннее 120 — делить на два`);
        for (const q of sys.points) {
          if (q === p || q.kind !== 'ufh' || q.room !== p.room) continue;
          if (p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h && p.id < q.id)
            E(`${tag}: зоны контуров ${p.id} и ${q.id} наезжают друг на друга`);
        }
        const cover = sys.points.filter(q => q.kind === 'ufh' && q.room === p.room)
          .reduce((s2, q) => s2 + q.w * q.h, 0);
        if (cover < 0.75 * room.w * room.h)
          E(`${tag}: контуры накрывают ${Math.round(100 * cover / (room.w * room.h))}% пола «${room.name}», нужно 75`);
      }
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
          // отопление: радиатор, либо собственный прибор — печь сауны, котёл.
          // Лестница и гардеробная греются от смежных помещений
          const own = (L.furniture || []).some(g => (g.sym === 'heaterSauna' || g.sym === 'boiler')
            && g.x > r.x && g.x < r.x + r.w && g.y > r.y && g.y < r.y + r.h);
          // помещение, открытое проёмом без полотна, отапливается вместе с соседним
          const open = (L.openings || []).some(o => o.kind === 'pass'
            && o.x > r.x - 300 && o.x < r.x + r.w + 300 && o.y > r.y - 300 && o.y < r.y + r.h + 300);
          if (!['stair', 'wardrobe'].includes(r.tag) && !has(r.id, 'radiator') && !has(r.id, 'convector')
            && !has(r.id, 'ufh') && !own && !open)
            E(`«${r.name}» (${L.title}) ничем не отапливается`);
          // 9а. плитка мокрого помещения без контура в стяжке — ледяной пол
          if (r.tag === 'wet' && !has(r.id, 'ufh'))
            E(`«${r.name}» (${L.title}) без контура тёплого пола`);
          // 9б. нижний уровень стоит плитой на грунте: обитаемое помещение
          // без своей печи греет контур, радиатор греет воздух над холодным полом
          const stove = (L.furniture || []).some(g => g.sym === 'heaterSauna'
            && g.x > r.x && g.x < r.x + r.w && g.y > r.y && g.y < r.y + r.h);
          if (L === house.levels[0] && ['live', 'service'].includes(r.use) && !r.tag
            && !stove && !has(r.id, 'ufh'))
            E(`«${r.name}» (${L.title}): пол по грунту без контура тёплого пола`);
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

    // 10а. 3D-трасса собрана из тех же прогонов, что и метраж: сумма осевых
    // отрезков, умноженная на жилы и запас, обязана дать длину прогона.
    // Разошлись — значит картинка в модели врёт ведомости
    for (const r of b.runs) {
      const segs = runSegments3d(r);
      if (!segs.length) continue;
      const k = (KIND[r.points[0].kind] || {}).k || 1;
      const got = Math.round(segsLen(segs) * k * RESERVE);
      if (Math.abs(got - r.len) > 1)
        E(`трасса ${r.key}: осевые отрезки дают ${got} мм, ведомость ${r.len}`);
    }
    // 10б. и магистрали тоже: стояк наращивается от соседнего уровня,
    // и его тело обязано совпасть со строчкой ведомости
    for (const t of b.trunks) {
      const got = Math.round(segsLen(trunkSegments3d(house, sys, t)) * RESERVE);
      if (Math.abs(got - t.len) > 1)
        E(`магистраль до «${t.level.title}»: тело даёт ${got} мм, ведомость ${t.len}`);
    }
  }

  // 11. за радиатором точек нет. На плане розетка рядом с радиатором
  // выглядит нормально: они на одной стене и не совпадают. На развёртке
  // видно, что она в габарите прибора — вилку туда не воткнуть
  const rads = data.systems.flatMap(s => s.points).filter(p => p.kind === 'radiator');
  for (const sys of data.systems)
    for (const p of sys.points) {
      if (p.kind === 'radiator' || !p.side) continue;
      for (const r of rads) {
        if (r.level !== p.level || r.room !== p.room || r.side !== p.side) continue;
        if (p.z > r.z + SLIMITS.radiatorH) continue;
        if (Math.abs(p.along - r.along) > r.len / 2) continue;
        errs.push(`${sys.id.toUpperCase()}: ${p.id} (${p.kind}) стоит за радиатором ${r.id}`);
      }
    }

  // 12. подписи развёртки не наезжают друг на друга. Метка раздела стоит
  // на своей отметке, подпись предмета от неё уходит вверх — но места
  // может не хватить, и тогда «700 · низ 1500» ляжет поверх «ВЫ»
  for (const L of house.levels)
    for (const room of elevationRooms(L)) {
      const bx = elevBoxes(house, L, room, data.systems);
      for (const c of bx)
        if (!c.fitted) errs.push(`развёртка «${room.name}» (${L.title}): подписи «${c.owner}» некуда встать`);
      for (let i = 0; i < bx.length; i++)
        for (let j = i + 1; j < bx.length; j++) {
          const a = bx[i], c = bx[j];
          if (a.x < c.x + c.w && c.x < a.x + a.w && a.y < c.y + c.h && c.y < a.y + a.h)
            errs.push(`развёртка «${room.name}» (${L.title}): ${a.kind} «${a.owner}» и ${c.kind} «${c.owner}» наезжают`);
        }
    }
  return errs;
}
