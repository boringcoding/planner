// Смета. Объёмы берутся из модели, а не набиваются руками: подвинулась стена —
// изменился и метраж кладки, и площадь штукатурки, и число розеток.
// Цены лежат отдельно в data/prices.json и правятся без кода.
//
// Что здесь считается и чего не считается, сказано в разделах: смета, в которой
// не видно границы, всегда «дешевле» настоящей.

import { bill } from './systems.mjs';

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
  const digDepth = mm(-cokol.base) + 0.4 + 0.1; // до низа подготовки
  q.digDepth = digDepth;
  q.dig = (W + 2) * (H + 2) * digDepth * 1.15;  // с откосами
  q.slabArea = (W + 0.4) * (H + 0.4);           // плита с выпуском по 200
  q.sandbed = q.slabArea * 0.3;
  q.lean = q.slabArea * 0.1;
  q.slabFoot = q.slabArea * 0.4;                // фундаментная плита 400
  q.rebarFoot = q.slabFoot * 0.1;               // 100 кг/м³
  q.wallCokol = q.perimAxis * mm(cokol.floorToFloor) * t;   // монолитные стены цоколя
  q.rebarCokol = q.wallCokol * 0.08;
  q.waterproof = q.perimAxis * mm(cokol.floorToFloor) + q.slabArea;
  q.xps = q.perimAxis * mm(cokol.floorToFloor) + q.slabArea;
  q.drainage = q.perimOuter + 8;
  q.backfill = q.dig - q.footprint * digDepth;

  // ---- проёмы в наружных стенах -------------------------------------------
  const winArea = L => (L.windows || []).reduce((s, w) => s + mm(w.b - w.a) * mm(w.hz), 0);
  q.openFirst = winArea(first);
  q.openSecond = winArea(second);
  q.lintels = house.levels.flatMap(L => [...(L.windows || []), ...(L.openings || [])])
    .reduce((s, o) => s + mm((o.b ? o.b - o.a : o.w) + 500), 0);

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
  const slope = 30 * Math.PI / 180, over = 0.5;
  q.roofPlan = (W + 2 * over) * (H + 2 * over);
  q.roof = q.roofPlan / Math.cos(slope);
  q.atticFloor = q.footprint - stairHole(second.stair);
  q.timber = q.atticFloor * (0.2 * 0.1 / 0.6 + 0.025)      // балки 200×100 и подшивка
    + q.roof * (0.05 * 0.2 / 0.6 + 0.025 * 0.1 / 0.35 + 0.05 * 0.05 / 0.6)
    + q.perimAxis * 0.15 * 0.15 + 12 * 0.15 * 0.15 * 2.5;  // мауэрлат, прогон, стойки
  q.gutter = q.perimOuter + 6;
  q.woolRoof = q.atticFloor;

  // ---- фасад ---------------------------------------------------------------
  const gable = W * (W / 2 * Math.tan(slope)) / 2 * 2;
  q.facade = q.perimOuter * (mm(first.floorToFloor + second.floorToFloor) + 0.4) + gable
    - q.openFirst - q.openSecond;

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
  q.blind = q.perimOuter + 8;
  const ver = house.levels.map(L => L.veranda).find(Boolean);
  q.veranda = ver ? mm(ver.w) * mm(ver.h) : 0;
  q.verandaRoof = q.veranda / Math.cos(slope);
  q.verandaRail = ver ? mm(ver.h) * 2 + mm(ver.w) : 0;

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
  q.flue = house.levels.length * mm(house.levels[0].floorToFloor) + 3;
  // оборудование, которое уже стоит в модели предметом
  q.saunaStove = house.levels.reduce((s, L) =>
    s + (L.furniture || []).filter(f => f.sym === 'heaterSauna').length, 0);
  return q;
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
    ['partition', q.partition], ['lintel', q.lintels],
    ['concrete', q.slabFloor + q.beam], ['rebar', q.rebarFloor + q.rebarBeam],
    ['workFloor', q.slabFloor], ['workBeam', q.beam]
  ]);

  add('Крыша', [
    ['timber', q.timber], ['workTimber', q.atticFloor + q.roof],
    ['roofing', q.roof], ['workRoof', q.roof],
    ['woolRoof', q.woolRoof], ['gutter', q.gutter], ['flue', q.flue]
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
    ['pex20', vk['PEX 20']], ['pp50', vk['ПП 50']], ['pex25', (vk['PEX 25, стояк'] || 0) + (ov['PEX 25, магистраль'] || 0)],
    ['pex16', ov['PEX 16, подача и обратка']], ['duct125', ov['воздуховод 125']],
    ['utp', (ss['UTP cat.6'] || 0) + (ss['UTP cat.6, магистраль'] || 0)],
    ['coax', ss['RG-6']], ['alarmWire', ss['КСПВ 2×0,5']],
    ['pointEom', q.sys.eom.points], ['pointWater', q.sys.vk.points],
    ['radiator', dev('radiator')], ['convector', dev('convector')], ['grille', dev('supply') + dev('exhaust')],
    ['pointSs', q.sys.ss.points],
    ['boiler', 1], ['buffer', 1], ['tank', 1], ['ahu', 1], ['panel', 1]
  ]);

  add('Лестницы, крыльцо, веранда, отмостка', [
    ['stairConcrete', q.stairConcrete], ['stepFinish', q.steps], ['railing', q.railing],
    ['blind', q.blind], ['porch', 1],
    ['verandaDeck', q.veranda], ['verandaRoof', q.verandaRoof], ['verandaRail', q.verandaRail]
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
