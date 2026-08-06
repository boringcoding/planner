// Смета. Объёмы берутся из модели, а не набиваются руками: подвинулась стена —
// изменился и метраж кладки, и площадь штукатурки, и число розеток.
// Цены лежат отдельно в data/prices.json и правятся без кода.
//
// Что здесь считается и чего не считается, сказано в разделах: смета, в которой
// не видно границы, всегда «дешевле» настоящей.

import { bill, feedsGeom } from './systems.mjs';
import { roofGeom, verandaGeom, pitGeom, porchGeom, flueTop, blindGeom, drainGeom, foundationBottom } from './roof.mjs';
import { plotGeom } from './plot.mjs';

const m2 = v => v / 1e6;                       // мм² -> м²
const mm = v => v / 1000;                      // мм -> м

// ---------------------------------------------------------------------------
// объёмы из модели
// ---------------------------------------------------------------------------
export function quantities(house, systems) {
  const S = house.shell;
  const W = mm(S.w), H = mm(S.h), t = mm(S.wall);
  const q = {};

  q.footprint = W * H;                          // пятно застройки
  q.perimOuter = 2 * (W + H);                   // по наружной грани
  q.perimAxis = 2 * ((W - t) + (H - t));        // по оси стены — для объёма кладки

  const lv = id => house.levels.find(l => l.id === id);
  const cokol = lv('cokol'), first = lv('first'), second = lv('second');

  // ---- земля и фундамент ---------------------------------------------------
  // Дно котлована — низ фундаментного пирога, тот же foundationBottom, что
  // сажает тела в выгрузке. Раньше смета копала до подбетонки (−3,40), а
  // модель клала песчаную подготовку до −3,70: два ответа на вопрос
  // «докуда копать» — это не смета, а лотерея. Источник теперь один
  const digDepth = mm(-foundationBottom(house));
  q.digDepth = digDepth;
  q.dig = (W + 2) * (H + 2) * digDepth * 1.15;  // с откосами
  // фундаментный пирог — из тех же данных, что и тела в выгрузке
  const F = house.foundation || {};
  const fOut = mm(F.out ?? 200) * 2;
  q.slabArea = (W + fOut) * (H + fOut);         // плита с выпуском за стену
  q.sandbed = q.slabArea * mm(F.sand ?? 300);
  q.lean = q.slabArea * mm(F.lean ?? 100);
  q.slabFoot = q.slabArea * mm(F.slab ?? 400);
  q.rebarFoot = q.slabFoot * 0.1;               // 100 кг/м³
  q.wallCokol = q.perimAxis * mm(cokol.floorToFloor) * t;   // монолитные стены цоколя
  q.rebarCokol = q.wallCokol * 0.08;
  q.waterproof = q.perimAxis * mm(cokol.floorToFloor) + q.slabArea;
  q.xps = q.perimAxis * mm(cokol.floorToFloor) + q.slabArea;
  q.drainage = mm(drainGeom(house).len) + 4;    // кольцо по подошве + сброс в колодец
  q.backfill = q.dig - q.footprint * digDepth;

  // ---- проёмы в наружных стенах -------------------------------------------
  const winArea = L => (L.windows || []).reduce((s, w) => s + mm(w.b - w.a) * mm(w.hz), 0);
  q.openFirst = winArea(first);
  q.openSecond = winArea(second);
  // перемычки — из той же ведомости, что уходит на страницу: сборные и
  // монолитные участки врозь, проёмы монолитного цоколя — вовсе не здесь
  const lint = lintelSchedule(house);
  q.lintels = lint.list.filter(r => !r.mono).reduce((s, r) => s + mm(r.len) * r.n, 0);
  q.lintelMono = lint.list.filter(r => r.mono).reduce((s, r) => s + mm(r.len) * r.n, 0);

  // ---- газоблок и армопояса ------------------------------------------------
  const beamH = 0.3;
  const blockH1 = mm(first.floorToFloor) - beamH;
  const blockH2 = mm(second.floorToFloor) - beamH;
  q.block = q.perimAxis * (blockH1 + blockH2) * t - (q.openFirst + q.openSecond) * t;
  q.beam = q.perimAxis * t * beamH * 2;         // под перекрытием и под мауэрлатом
  q.rebarBeam = q.beam * 0.09;

  // перегородки: длина × высота, толщина из данных
  q.partition = house.levels.reduce((s, L) => s
    + L.walls.reduce((a, w) => {
      const len = mm(Math.max(w.w, w.h)), th = Math.min(w.w, w.h);
      return a + (th <= 150 ? len * mm(L.clear) : 0);
    }, 0), 0);
  q.blockInner = house.levels.reduce((s, L) => s
    + L.walls.reduce((a, w) => {
      const len = mm(Math.max(w.w, w.h)), th = Math.min(w.w, w.h);
      return a + (th > 150 ? len * mm(L.clear) * mm(th) : 0);
    }, 0), 0);

  // ---- перекрытия ----------------------------------------------------------
  const stairHole = st => mm(st.w) * mm(st.h);
  const slabTh = 0.25;                          // 250: пролёт гаража 7,2 м
  q.slabFloor = (q.footprint - stairHole(cokol.stair)) * slabTh
    + (q.footprint - stairHole(first.stair)) * slabTh;
  q.rebarFloor = q.slabFloor * 0.12;

  // ---- деревянное перекрытие и кровля -------------------------------------
  // Раньше уклон и свес стояли здесь числами — 30° и 500, — и смета не знала,
  // что в модели их поменяли. Теперь всё берётся из roof.mjs: правка данных
  // пересчитывает и чертёж, и выгрузку, и деньги
  const R = house.roof, g = roofGeom(house);
  const sect = (a, step) => mm(a[0]) * mm(a[1]) / mm(step);   // м³ бруса на м² ската
  q.roofPlan = g.plan;
  q.roof = g.area;
  // Марша на чердак нет, значит нет и проёма в чердачном перекрытии.
  // Раньше отсюда вычиталась шахта лестницы — 7,5 м² утеплителя, которых
  // на самом деле нет; выгрузка при этом дырки в перекрытии не делала
  q.atticFloor = g.attic;
  q.timber = q.atticFloor * 0.025                                      // подшивка потолка
    + mm(g.tieLen) * mm(R.tie[0]) * mm(R.tie[1])                       // затяжки они же балки
    + 2 * mm(g.hangerLen) * mm(R.hanger[0]) * mm(R.hanger[1])          // бабки, по две доски
    + mm(g.braceLen) * mm(R.brace[0]) * mm(R.brace[1])                 // ветровые связи
    + q.roof * (sect(R.rafter, R.rafterStep) + mm(R.sheathing) + sect(R.counter, R.rafterStep))
    + q.perimAxis * mm(R.mauerlat[0]) * mm(R.mauerlat[1]);             // мауэрлат
  q.gutter = mm(g.gutterLen + g.drainLen);
  q.snowGuard = R.snowGuard ? mm(g.gutterLen) : 0;
  q.woolRoof = q.atticFloor;

  // ---- фасад ---------------------------------------------------------------
  // фронтон подрезан снизу затяжкой, сверху низом стропила — не треугольник
  // «пролёт × подъём», как считалось раньше. Считает roofGeom, здесь только два
  const gable = 2 * g.gable;
  q.facade = q.perimOuter * (mm(first.floorToFloor + second.floorToFloor) + 0.4) + gable
    + g.friezeArea - q.openFirst - q.openSecond;

  // ---- окна и двери --------------------------------------------------------
  const wins = house.levels.flatMap(L => L.windows || []);
  q.windows = wins.filter(w => !w.kind).reduce((s, w) => s + mm(w.b - w.a) * mm(w.hz), 0);
  q.windowCount = wins.filter(w => !w.kind).length;
  q.gates = wins.filter(w => w.kind === 'gate').length;
  q.entries = wins.filter(w => w.kind === 'entrance').length;
  q.terraceDoors = wins.filter(w => w.kind === 'door').length;
  q.innerDoors = house.levels.reduce((s, L) =>
    s + (L.openings || []).filter(o => o.kind !== 'pass').length, 0);

  // ---- отделка -------------------------------------------------------------
  const rooms = house.levels.flatMap(L => L.rooms.map(r => ({ ...r, clear: L.clear, lvl: L.id })));
  const areaOf = r => m2(r.w * r.h);
  const wallOf = r => 2 * (mm(r.w) + mm(r.h)) * mm(r.clear);
  const wet = r => r.tag === 'wet' || /Сауна/.test(r.name);
  const tech = r => ['tech', 'store', 'garage', 'stair'].includes(r.tag);

  q.floorAll = rooms.reduce((s, r) => s + areaOf(r), 0);
  q.floorTech = rooms.filter(tech).reduce((s, r) => s + areaOf(r), 0);
  q.floorTile = rooms.filter(wet).reduce((s, r) => s + areaOf(r), 0);
  q.floorWood = q.floorAll - q.floorTech - q.floorTile;
  q.ceiling = rooms.filter(r => r.tag !== 'garage').reduce((s, r) => s + areaOf(r), 0);
  q.wallsInside = rooms.reduce((s, r) => s + wallOf(r), 0)
    - house.levels.reduce((s, L) => s + (L.openings || []).reduce((a, o) => a + mm(o.w) * mm(o.hz) * 2, 0), 0);
  q.tileWall = rooms.filter(r => r.tag === 'wet').reduce((s, r) => s + 2 * (mm(r.w) + mm(r.h)) * 2.1, 0);
  q.sauna = rooms.filter(r => /Сауна/.test(r.name)).reduce((s, r) => s + wallOf(r) + areaOf(r), 0);
  q.plaster = q.wallsInside - q.tileWall - q.sauna;
  q.bathrooms = rooms.filter(r => r.tag === 'wet').length;

  // ---- лестницы, крыльцо, отмостка, веранда --------------------------------
  const stairs = house.levels.filter(L => L.stair && house.levels[house.levels.indexOf(L) + 1]);
  q.stairConcrete = stairs.reduce((s, L) => {
    const st = L.stair, wF = (mm(st.h) - 0.1) / 2;
    return s + 2 * mm(st.w - st.landing) * wF * 0.35 + mm(st.landing) * mm(st.h) * 0.2;
  }, 0);
  q.steps = stairs.reduce((s, L) => s + L.stair.risers, 0);
  q.railing = stairs.reduce((s, L) => s + 2 * mm(L.stair.w - L.stair.landing) + mm(L.stair.h), 0);
  // отмостка — из той же геометрии, что и выгрузка: полосы с разрывами
  // под выносы, а не «периметр плюс сколько-то»
  const blind = blindGeom(house);
  q.blind = blind.length ? blind.reduce((s, b) => s + mm(Math.max(b.w, b.h)), 0) : q.perimOuter + 8;
  const V = verandaGeom(house);
  q.veranda = V ? V.deckArea : 0;
  q.verandaRoof = V ? V.canopyArea : 0;                      // навес шире настила на свес
  q.verandaRail = V ? mm(V.rail) : 0;
  // приямок люка для дров: коробка со стенками, дном и решёткой
  q.pits = pitGeom(house).length;
  // крыльцо считается по модели, а не «одно, наверное, есть»: наружных дверей
  // с порогом выше земли может стать две, и вторая молча не попадёт в смету
  const porches = porchGeom(house);
  q.porches = porches.length;
  q.porchSteps = porches.reduce((s, q0) => s + q0.steps.length, 0);

  // ---- участок и времянка --------------------------------------------------
  // те же геометрии, что дали генплан и тела в выгрузке: забор — панели
  // минус ворота, покрытия — площади плит, времянка — свои объёмы
  const PG = plotGeom(house);
  if (PG) {
    q.fence = mm(PG.fence.len);
    q.gateDrive = PG.fence.gate ? 1 : 0;
    q.wicket = PG.fence.wicket ? 1 : 0;
    q.paveDrive = m2(PG.drive.w * PG.drive.h);
    q.paveWalk = PG.paths.reduce((s, p) => s + m2(p.w * p.h), 0);
    q.septicAU = PG.septic ? 1 : 0;
    q.wells = systems.flatMap(sys => feedsGeom(house, sys)).reduce((s, f) => s + (f.wells || []).length, 0);
    if (PG.temp) {
      const T = PG.temp;
      q.tempFoot = m2(T.w * T.h);
      q.tempSand = q.tempFoot * 0.3;
      q.tempSlab = q.tempFoot * mm(T.slabTh);
      q.tempBlock = 2 * (mm(T.w) + mm(T.h)) * mm(T.clear ?? 2700) * mm(T.t)
        - [T.door, ...(T.windows || [])].reduce((s, w) => s + mm(w.b - w.a) * mm(w.hz), 0) * mm(T.t);
      q.tempRoof = q.tempFoot;
      q.tempWin = (T.windows || []).reduce((s, w) => s + mm(w.b - w.a) * mm(w.hz), 0);
      q.tempPorch = m2(T.porch.w * T.porch.h);
    }
  }

  // ---- инженерия из собственных ведомостей --------------------------------
  q.sys = {};
  for (const sys of systems) {
    const b = bill(house, sys);
    q.sys[sys.id] = {
      points: sys.points.length,
      mat: Object.fromEntries(b.materials.map(m => [m.mat, m.m])),
      dev: Object.fromEntries(b.devices.map(d => [d.kind, d.n]))
    };
  }
  // оборудование, которое уже стоит в модели предметом
  q.saunaStove = house.levels.reduce((s, L) =>
    s + (L.furniture || []).filter(f => f.sym === 'heaterSauna').length, 0);
  // Дымоход считается от прибора в цоколе до расчётной отметки над кровлей —
  // её же считает flueTop, и она же подписана на плане кровли. Труба печи
  // сауны сюда не попадает: она входит в цену самой печи
  const flues = house.levels[house.levels.length - 1].flues || [];
  q.flue = flues.slice(0, Math.max(0, flues.length - q.saunaStove)).reduce(
    (s, f) => s + mm(flueTop(house, f) - cokol.base), 0);
  return q;
}

// ---------------------------------------------------------------------------
// ведомости: по ним заказывают, а не по строке «окна 19,7 м²»
// ---------------------------------------------------------------------------

// Ведомость заполнений: окна, двери, ворота и люки по маркам-типоразмерам.
// Смета продаёт квадратные метры, а заказ делается по маркам: 12 окон девяти
// типоразмеров с разными подоконниками из одной строки сметы не заказать
export function openingSchedule(house) {
  const rows = new Map();
  const put = (cls, w, h, sill, note, id) => {
    const key = `${cls}:${w}x${h}`;
    if (!rows.has(key)) rows.set(key, { cls, w, h, n: 0, sills: new Set(), notes: new Set(), ids: [] });
    const r = rows.get(key);
    r.n++;
    if (sill != null) r.sills.add(sill);
    if (note) r.notes.add(note);
    r.ids.push(id);
  };
  for (const L of house.levels) {
    for (const o of L.windows || []) {
      const cls = o.kind === 'gate' ? 'В' : o.kind === 'entrance' || o.kind === 'door' ? 'ДН'
        : o.kind === 'hatch' ? 'Л' : 'ОК';
      put(cls, o.b - o.a, o.hz, o.sill || 0,
        o.pano ? 'панорамное' : o.kind === 'hatch' ? 'люк с приямком' : o.kind === 'entrance' ? 'входная' : '', o.id);
    }
    for (const o of (L.openings || []).filter(x => x.kind !== 'pass'))
      put('ДВ', o.w, o.hz, null, o.fire ? 'противопожарная EI 30' : '', o.id);
  }
  const T = plotGeom(house)?.temp;
  if (T) {
    put('ДН', T.door.b - T.door.a, T.door.hz, 0, 'времянка', T.door.id);
    for (const w of T.windows || []) put('ОК', w.b - w.a, w.hz, w.sill || 0, 'времянка', w.id);
  }
  const order = ['ОК', 'ДН', 'ДВ', 'В', 'Л'];
  const list = [...rows.values()].sort((a, b) =>
    order.indexOf(a.cls) - order.indexOf(b.cls) || b.w * b.h - a.w * a.h);
  const cnt = {};
  for (const r of list) {
    cnt[r.cls] = (cnt[r.cls] || 0) + 1;
    r.mark = `${r.cls}-${cnt[r.cls]}`;
  }
  return list;
}

// Ведомость перемычек: по толщине стены и ширине проёма, опирание 250 на
// сторону. Проёмы монолитного цоколя перемычек не получают — их обрамление
// уходит в КЖ; проём шире lintelWide несёт не сборная перемычка, а
// монолитный участок по расчёту. Раньше всё это была одна строка
// «61,5 п.м», по которой не заказать ничего
export const LINTEL_WIDE = 1750;
export function lintelSchedule(house) {
  const S = house.shell;
  const rows = new Map();
  let cokol = 0;
  const put = (th, span, id) => {
    const mono = span > LINTEL_WIDE;
    const key = `${th}x${span}${mono ? 'm' : ''}`;
    if (!rows.has(key)) rows.set(key, { th, span, len: span + 500, mono, n: 0, ids: [] });
    const r = rows.get(key);
    r.n++;
    r.ids.push(id);
  };
  for (const L of house.levels) {
    // цоколь монолитный: проёмы обрамляются в теле стены, это КЖ
    if (L.base < 0) {
      cokol += (L.windows || []).length + (L.openings || []).length;
      continue;
    }
    for (const o of L.windows || []) put(S.wall, o.b - o.a, o.id);
    for (const o of L.openings || []) put(o.t, o.w, o.id);
  }
  const T = plotGeom(house)?.temp;
  if (T) {
    put(T.t, T.door.b - T.door.a, T.door.id);
    for (const w of T.windows || []) put(T.t, w.b - w.a, w.id);
  }
  const list = [...rows.values()].sort((a, b) => b.th - a.th || b.span - a.span);
  list.forEach((r, i) => { r.mark = r.mono ? `Пм-${i + 1}` : `Пр-${i + 1}`; });
  return { list, cokol };
}

// ---------------------------------------------------------------------------
// смета
// ---------------------------------------------------------------------------
export function estimate(house, systems, prices) {
  const q = quantities(house, systems);
  const P = prices.items;
  const sections = [];
  const add = (title, rows) => sections.push({
    title,
    rows: rows.filter(r => r && r[1] > 0).map(([key, n, note]) => {
      const [l, u, p] = P[key];
      return { l, u, n, p, sum: Math.round(n * p), note };
    })
  });

  const eom = q.sys.eom.mat, vk = q.sys.vk.mat, ov = q.sys.ov.mat, ss = q.sys.ss.mat;
  const dev = k => Object.entries(q.sys).reduce((s, [, v]) => s + (v.dev[k] || 0), 0);

  add('Земляные работы и фундамент', [
    ['dig', q.dig], ['sandbed', q.sandbed], ['lean', q.lean],
    ['concrete', q.slabFoot + q.wallCokol], ['rebar', q.rebarFoot + q.rebarCokol],
    ['workSlab', q.slabFoot], ['workWall', q.wallCokol],
    ['waterproof', q.waterproof], ['xps', q.xps], ['drainage', q.drainage],
    ['backfill', q.backfill]
  ]);

  add('Коробка: стены и перекрытия', [
    ['block', q.block + q.blockInner], ['workBlock', q.block + q.blockInner],
    ['partition', q.partition], ['lintel', q.lintels], ['lintelMono', q.lintelMono],
    ['concrete', q.slabFloor + q.beam], ['rebar', q.rebarFloor + q.rebarBeam],
    ['workFloor', q.slabFloor], ['workBeam', q.beam]
  ]);

  add('Крыша', [
    ['timber', q.timber], ['workTimber', q.atticFloor + q.roof],
    ['roofing', q.roof], ['workRoof', q.roof],
    ['woolRoof', q.woolRoof], ['gutter', q.gutter], ['snowGuard', q.snowGuard],
    ['flue', q.flue]
  ]);

  add('Фасад и утепление', [
    ['woolWall', q.facade], ['facadeSub', q.facade],
    ['siding', q.facade], ['workFacade', q.facade]
  ]);

  add('Окна, двери, ворота', [
    ['window', q.windows], ['workWindow', q.windows],
    ['gate', q.gates], ['doorEntry', q.entries], ['doorTerrace', q.terraceDoors]
  ]);

  add('Инженерия', [
    ['cableP', eom['ВВГнг-LS 3×2,5']], ['cableL', eom['ВВГнг-LS 3×1,5']],
    ['cable5x4', eom['ВВГнг-LS 5×4']], ['cable5x6', eom['ВВГнг-LS 5×6, питающая']],
    ['pex20', vk['PEX 20']], ['pp50', vk['ПП 50']],
    ['pp110i', (vk['ПП 110'] || 0) + (vk['ПП 110, стояк и фановый выход'] || 0)],
    ['knsUnit', dev('kns')], ['knsPipe', vk['ПНД 40, напорная от КНУ']],
    ['pex25', (vk['PEX 25, стояк'] || 0) + (ov['PEX 25, магистраль'] || 0)],
    ['pex16', (ov['PEX 16, подача и обратка'] || 0) + (ov['PEX 16, контур тёплого пола'] || 0)],
    ['duct125', ov['воздуховод 125']],
    ['feedWater', vk['ПНД 32, ввод воды']], ['feedSewer', vk['ПП 110, выпуск канализации']],
    ['feedRelief', vk['ПНД 32, сброс очищенной воды']],
    ['casing', vk['футляр ПНД 110 на пересечениях']],
    ['feedPower', eom['ВВГнг-LS 5×10, кабельный ввод']],
    ['utp', (ss['UTP cat.6'] || 0) + (ss['UTP cat.6, магистраль'] || 0)],
    ['coax', ss['RG-6']], ['alarmWire', ss['КСПВ 2×0,5']],
    ['pointEom', q.sys.eom.points], ['pointWater', q.sys.vk.points],
    ['radiator', dev('radiator')], ['convector', dev('convector')], ['grille', dev('supply') + dev('exhaust')],
    ['pointSs', q.sys.ss.points],
    ['boiler', 1], ['buffer', 1], ['tank', 1], ['ahu', 1], ['panel', 1]
  ]);

  add('Лестницы, крыльцо, веранда, отмостка', [
    ['stairConcrete', q.stairConcrete], ['stepFinish', q.steps], ['railing', q.railing],
    ['atticHatch', house.levels.filter(L => L.atticHatch).length],
    ['blind', q.blind], ['porch', q.porches],
    ['verandaDeck', q.veranda], ['verandaRoof', q.verandaRoof], ['verandaRail', q.verandaRail],
    ['pit', q.pits]
  ]);

  add('Участок и времянка', [
    ['fence', q.fence], ['gateDrive', q.gateDrive], ['wicket', q.wicket],
    ['paveDrive', q.paveDrive], ['paveWalk', q.paveWalk + (q.tempPorch || 0)],
    ['septicAU', q.septicAU], ['well', q.wells],
    ['sandbed', q.tempSand], ['concrete', q.tempSlab], ['workSlab', q.tempSlab],
    ['rebar', (q.tempSlab || 0) * 0.1],
    ['block', q.tempBlock], ['workBlock', q.tempBlock],
    ['tempRoof', q.tempRoof],
    ['window', q.tempWin], ['workWindow', q.tempWin], ['doorEntry', q.tempFoot ? 1 : 0]
  ]);

  add('Отделка', [
    ['screed', q.floorAll], ['plaster', q.plaster], ['paint', q.plaster],
    ['ceiling', q.ceiling], ['tileWall', q.tileWall],
    ['floorWood', q.floorWood], ['floorTile', q.floorTile], ['floorTech', q.floorTech],
    ['sauna', q.sauna], ['saunaStove', q.saunaStove], ['doorInner', q.innerDoors],
    ['bath', q.bathrooms], ['shower', 1], ['trim', q.floorAll]
  ]);

  for (const s of sections) s.sum = s.rows.reduce((a, r) => a + r.sum, 0);
  const base = sections.reduce((a, s) => a + s.sum, 0);
  const delivery = Math.round(base * P.delivery[2] / 100);
  const reserve = Math.round((base + delivery) * prices.reserve);
  return {
    q, sections, base, delivery, reserve,
    total: base + delivery + reserve,
    useful: q.floorAll
  };
}
