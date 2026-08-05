// Экспорт модели в IFC4 (STEP physical file). Пишется руками, как и всё
// остальное в репозитории: формат текстовый, геометрия у нас коробочная,
// библиотека не нужна.
//
// Две вещи, которые легко сделать неправильно и потом долго искать:
//
// 1. План нарисован в экранных координатах: X вправо, Y вниз. В IFC система
//    правая, Z вверх. Если отдать Y как есть, дом приедет зеркальным — левое
//    станет правым, и это не бросается в глаза, пока не начнёшь искать дверь.
//    Поэтому Y отражается: y_ifc = shell.h - y.
//
// 2. Кириллица в STEP кодируется как \X2\04210442..\X0\ (UTF-16 кодовые
//    единицы). Без этого имена помещений приезжают кашей.
//
// Идентификатор элемента (second.f12) превращается в устойчивый GlobalId:
// один и тот же элемент в двух выгрузках получает один и тот же GUID,
// иначе каждая выгрузка выглядит как новый дом.

const B64 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';

// 128 бит из строки: четыре независимых FNV-1a с разными затравками
function hash128(s) {
  const parts = [];
  for (const seed of [0x811c9dc5, 0x01000193, 0x7f4a7c15, 0x9e3779b9]) {
    let h = seed >>> 0;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    for (let i = s.length - 1; i >= 0; i--) {   // второй проход: короткие строки
      h ^= s.charCodeAt(i) * 131;               // иначе различаются слабо
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    parts.push(h);
  }
  return parts.map(p => p.toString(16).padStart(8, '0')).join('');
}

// сжатый IfcGloballyUniqueId: 128 бит в 22 символа base64 по IFC-алфавиту
export function guid(id) {
  let n = BigInt('0x' + hash128(id));
  let out = '';
  for (let i = 0; i < 22; i++) { out = B64[Number(n % 64n)] + out; n /= 64n; }
  return out;
}

// строка STEP: кавычки удваиваются, всё за пределами ASCII — в \X2\...\X0\
function str(s) {
  let out = '', buf = '';
  const flush = () => { if (buf) { out += `\\X2\\${buf}\\X0\\`; buf = ''; } };
  for (const ch of String(s)) {
    const c = ch.codePointAt(0);
    if (c < 128) { flush(); out += ch === "'" ? "''" : ch === '\\' ? '\\\\' : ch; }
    else for (let i = 0; i < ch.length; i++) buf += ch.charCodeAt(i).toString(16).toUpperCase().padStart(4, '0');
  }
  flush();
  return `'${out}'`;
}

const num = v => {
  const r = Math.round(v * 1000) / 1000;
  return Number.isInteger(r) ? `${r}.` : String(r);
};

import { stairGeom } from './render.mjs';
import { roofGeom, verandaGeom, pitGeom, porchGeom, flueTop, gutterGeom, blindGeom, rampGeom, roofHoles, groundGeom, drainGeom } from './roof.mjs';
import { bill, runSegments3d, trunkSegments3d, feedsGeom, KIND } from './systems.mjs';

export function ifc(house, systems = [], opt = {}) {
  const S = house.shell;
  const lines = [];
  let seq = 0;
  const E = (type, args) => {
    const id = ++seq;
    lines.push(`#${id}=${type}(${args.join(',')});`);
    return `#${id}`;
  };
  const L = arr => `(${arr.join(',')})`;
  const used = new Set();
  const G = key => {
    const g = guid(key);
    if (used.has(g)) throw new Error(`GUID столкнулись на ${key}`);
    used.add(g);
    return str(g);
  };

  // отражение плана в правую систему координат
  const Y = y => S.h - y;

  // ---- шапка ----------------------------------------------------------
  const head = [
    'ISO-10303-21;',
    'HEADER;',
    `FILE_DESCRIPTION(('ViewDefinition [DesignTransferView_V1.0]'),'2;1');`,
    `FILE_NAME(${str(opt.name || 'house.ifc')},${str(opt.stamp || '1970-01-01T00:00:00')},(''),(''),'planner','planner','');`,
    `FILE_SCHEMA(('IFC4'));`,
    'ENDSEC;',
    'DATA;'
  ];

  // ---- контекст, единицы ----------------------------------------------
  const person = E('IFCPERSON', ['$', '$', str(''), '$', '$', '$', '$', '$']);
  const org = E('IFCORGANIZATION', ['$', str('planner'), '$', '$', '$']);
  const po = E('IFCPERSONANDORGANIZATION', [person, org, '$']);
  const app = E('IFCAPPLICATION', [org, str('0.1'), str('planner'), str('planner')]);
  const owner = E('IFCOWNERHISTORY', [po, app, '$', '.NOCHANGE.', '$', '$', '$', '0']);

  const P0 = E('IFCCARTESIANPOINT', [L(['0.', '0.', '0.'])]);
  const DZ = E('IFCDIRECTION', [L(['0.', '0.', '1.'])]);
  const DX = E('IFCDIRECTION', [L(['1.', '0.', '0.'])]);
  const AX0 = E('IFCAXIS2PLACEMENT3D', [P0, DZ, DX]);
  // Север. Азимут фронта — 235°, фронт смотрит на юго-запад; после отражения
  // Y плановый «низ» становится севером модели. TrueNorth — направление
  // севера в осях модели, иначе дом приезжает без связи со сторонами света
  const az = (house.site && house.site.frontAzimuth) || 0;
  const north = (az + 180) * Math.PI / 180;
  const trueNorth = E('IFCDIRECTION', [L([num(Math.sin(north)), num(Math.cos(north))])]);
  const ctx = E('IFCGEOMETRICREPRESENTATIONCONTEXT', ['$', str('Model'), '3', '1.E-05', AX0, trueNorth]);
  const sub = E('IFCGEOMETRICREPRESENTATIONSUBCONTEXT', [str('Body'), str('Model'), '*', '*', '*', '*', ctx, '$', '.MODEL_VIEW.', '$']);
  const subAxis = E('IFCGEOMETRICREPRESENTATIONSUBCONTEXT', [str('Axis'), str('Model'), '*', '*', '*', '*', ctx, '$', '.GRAPH_VIEW.', '$']);
  const units = E('IFCUNITASSIGNMENT', [L([
    E('IFCSIUNIT', ['*', '.LENGTHUNIT.', '.MILLI.', '.METRE.']),
    E('IFCSIUNIT', ['*', '.AREAUNIT.', '$', '.SQUARE_METRE.']),
    E('IFCSIUNIT', ['*', '.VOLUMEUNIT.', '$', '.CUBIC_METRE.']),
    E('IFCSIUNIT', ['*', '.PLANEANGLEUNIT.', '$', '.RADIAN.'])
  ])]);

  const project = E('IFCPROJECT', [G('project'), owner, str(house.project.title), '$', '$', '$', '$', L([ctx]), units]);

  // ---- пространственная структура -------------------------------------
  const sitePl = E('IFCLOCALPLACEMENT', ['$', AX0]);
  const site = E('IFCSITE', [G('site'), owner, str('Участок'), '$', '$', sitePl, '$', '$', '.ELEMENT.', '$', '$', '$', '$', '$']);
  const bldPl = E('IFCLOCALPLACEMENT', [sitePl, AX0]);
  const building = E('IFCBUILDING', [G('building'), owner, str(house.project.title), '$', '$', bldPl, '$', '$', '.ELEMENT.', '$', '$', '$']);

  // точка и оси в координатах этажа
  const pt3 = (x, y, z) => E('IFCCARTESIANPOINT', [L([num(x), num(y), num(z)])]);
  const dir3 = (x, y, z) => E('IFCDIRECTION', [L([num(x), num(y), num(z)])]);
  // Ось и направление задаются вместе или не задаются вовсе: правило
  // IfcAxis2Placement3D.AxisAndRefDirProvision запрещает половину пары,
  // и валидатор ловит это 358 раз подряд
  const place = (rel, x, y, z, ref) => {
    const ax = E('IFCAXIS2PLACEMENT3D', ref
      ? [pt3(x, y, z), DZ, dir3(ref[0], ref[1], 0)]
      : [pt3(x, y, z), '$', '$']);
    return E('IFCLOCALPLACEMENT', [rel, ax]);
  };
  // наклонная посадка: скат кровли и навес веранды лежат не горизонтально,
  // и «плоская плита с уклоном в свойствах» — это не модель, а обещание
  const placeAx = (rel, [x, y, z], axis, ref) =>
    E('IFCLOCALPLACEMENT', [rel, E('IFCAXIS2PLACEMENT3D', [pt3(x, y, z), dir3(...axis), dir3(...ref)])]);

  // прямоугольная призма в локальных осях элемента
  const boxSolid = (w, h, dz, dx = 0, dy = 0, dzOff = 0) => {
    const pos2 = E('IFCAXIS2PLACEMENT2D', [E('IFCCARTESIANPOINT', [L([num(dx), num(dy)])]), '$']);
    const prof = E('IFCRECTANGLEPROFILEDEF', ['.AREA.', '$', pos2, num(w), num(h)]);
    const pos3 = dzOff ? E('IFCAXIS2PLACEMENT3D', [pt3(0, 0, dzOff), '$', '$']) : E('IFCAXIS2PLACEMENT3D', [P0, '$', '$']);
    return E('IFCEXTRUDEDAREASOLID', [prof, pos3, DZ, num(dz)]);
  };
  const cylSolid = (r, dz) => {
    const pos2 = E('IFCAXIS2PLACEMENT2D', [E('IFCCARTESIANPOINT', [L(['0.', '0.'])]), '$']);
    const prof = E('IFCCIRCLEPROFILEDEF', ['.AREA.', '$', pos2, num(r)]);
    return E('IFCEXTRUDEDAREASOLID', [prof, E('IFCAXIS2PLACEMENT3D', [P0, '$', '$']), DZ, num(dz)]);
  };
  // призма, выдавленная вдоль произвольной оси из точки: поручень идёт
  // вдоль марша, а не вдоль мировой оси
  const slantSolid = (w, h, len, [dx, dy, dz], axis, ref) => {
    const pos2 = E('IFCAXIS2PLACEMENT2D', [E('IFCCARTESIANPOINT', [L(['0.', '0.'])]), '$']);
    const prof = E('IFCRECTANGLEPROFILEDEF', ['.AREA.', '$', pos2, num(w), num(h)]);
    return E('IFCEXTRUDEDAREASOLID', [prof,
      E('IFCAXIS2PLACEMENT3D', [pt3(dx, dy, dz), dir3(...axis), dir3(...ref)]), DZ, num(len)]);
  };
  const bodyOf = solids => E('IFCPRODUCTDEFINITIONSHAPE', ['$', '$', L([
    E('IFCSHAPEREPRESENTATION', [sub, str('Body'), str('SweptSolid'), L(solids)])
  ])]);
  // произвольный контур в локальной плоскости XY, выдавленный по Z: фронтон
  // прямоугольником не описывается
  const polySolid = (pts, dz) => {
    const poly = E('IFCPOLYLINE', [L([...pts, pts[0]].map(p => E('IFCCARTESIANPOINT', [L([num(p[0]), num(p[1])])])))]);
    const prof = E('IFCARBITRARYCLOSEDPROFILEDEF', ['.AREA.', '$', poly]);
    return E('IFCEXTRUDEDAREASOLID', [prof, E('IFCAXIS2PLACEMENT3D', [P0, '$', '$']), DZ, num(dz)]);
  };

  // ---- стили поверхностей ----------------------------------------------
  // ArchiCAD (и любой BIM) красит то, что записано в файле, а не то, что
  // рисует наша смотрелка. Без IfcStyledItem модель приезжает серой глыбой,
  // а дверь неотличима от куска стены. Прозрачность — только у стекла
  const PAL = {
    wall: ['Штукатурка', [0.82, 0.81, 0.78]],
    slab: ['Железобетон', [0.70, 0.69, 0.66]],
    roof: ['Фальц, сталь', [0.30, 0.32, 0.35]],
    wood: ['Древесина', [0.58, 0.44, 0.30]],
    doorLeaf: ['Дверь, полотно', [0.47, 0.34, 0.22]],
    doorFrame: ['Дверь, коробка', [0.62, 0.50, 0.36]],
    winFrame: ['Окно, рама', [0.93, 0.93, 0.91]],
    glass: ['Стекло', [0.55, 0.70, 0.78], 0.65],
    gate: ['Ворота, сталь', [0.52, 0.54, 0.57]],
    metal: ['Сталь', [0.45, 0.46, 0.48]],
    stone: ['Бетон', [0.60, 0.59, 0.56]],
    ground: ['Грунт', [0.56, 0.58, 0.48]],
    furn: ['Мебель', [0.75, 0.74, 0.70]],
    eom: ['ЭОМ', [0.66, 0.46, 0.16]],
    vk: ['ВК', [0.18, 0.42, 0.55]],
    ov: ['ОВ', [0.70, 0.25, 0.18]],
    ss: ['СС', [0.25, 0.47, 0.35]]
  };
  const styleCache = new Map();
  const styleOf = kind => {
    if (!styleCache.has(kind)) {
      const [name, [r, g, b], alpha] = PAL[kind];
      const rgb = E('IFCCOLOURRGB', ['$', num(r), num(g), num(b)]);
      const rend = E('IFCSURFACESTYLERENDERING', [rgb, alpha ? num(alpha) : '0.',
        '$', '$', '$', '$', '$', '$', '.NOTDEFINED.']);
      styleCache.set(kind, E('IFCSURFACESTYLE', [str(name), '.BOTH.', L([rend])]));
    }
    return styleCache.get(kind);
  };
  const paint = (solid, kind) => {
    E('IFCSTYLEDITEM', [solid, L([styleOf(kind)]), '$']);
    return solid;
  };

  const rels = [];
  const propsFor = [];
  const addProps = (el, key, pairs) => propsFor.push({ el, key, pairs });
  // стандартные Psets — значения уже в типах IFC (IFCBOOLEAN, IFCIDENTIFIER):
  // по Pset_DoorCommon.IsExternal ArchiCAD отличает наружную дверь от межкомнатной
  const stdFor = [];
  const addStd = (el, key, name, pairs) => stdFor.push({ el, key, name, pairs });
  // материалы: имя -> элементы. Состава стен по слоям в данных нет намеренно,
  // поэтому материал здесь — родовое имя, а не выдуманный пирог
  const matFor = new Map();
  const matOf = (name, el) => {
    if (!matFor.has(name)) matFor.set(name, []);
    matFor.get(name).push(el);
  };

  const storeys = [];
  const contains = new Map();          // этаж -> элементы
  const put = (storey, el) => {
    if (!contains.has(storey)) contains.set(storey, []);
    contains.get(storey).push(el);
  };

  for (const lv of house.levels) {
    const pl = place(bldPl, 0, 0, lv.base);
    const st = E('IFCBUILDINGSTOREY', [G(`storey:${lv.id}`), owner, str(lv.title), '$', '$', pl, '$', '$', '.ELEMENT.', num(lv.base)]);
    storeys.push({ lv, st, pl });
    addProps(st, `storey:${lv.id}`, [['id', lv.id], ['clear', lv.clear], ['floorToFloor', lv.floorToFloor]]);
  }
  rels.push(E('IFCRELAGGREGATES', [G('agg:project'), owner, '$', '$', project, L([site])]));
  rels.push(E('IFCRELAGGREGATES', [G('agg:site'), owner, '$', '$', site, L([building])]));
  rels.push(E('IFCRELAGGREGATES', [G('agg:building'), owner, '$', '$', building, L(storeys.map(s => s.st))]));

  // ---- стены -----------------------------------------------------------
  // Стена задаётся осью и толщиной: так её принимают как стену, а не как
  // произвольное тело. Прямоугольник из данных раскладывается на ось
  // по длинной стороне и толщину по короткой.
  const wallOf = (storey, key, name, rect, hz, kind) => {
    const horiz = rect.w >= rect.h;
    const len = horiz ? rect.w : rect.h, th = horiz ? rect.h : rect.w;
    const cx = rect.x + rect.w / 2, cy = Y(rect.y + rect.h / 2);
    const pl = place(storey.pl, cx, cy, 0, horiz ? [1, 0] : [0, 1]);
    const body = E('IFCSHAPEREPRESENTATION', [sub, str('Body'), str('SweptSolid'), L([paint(boxSolid(len, th, hz), 'wall')])]);
    const axis = E('IFCSHAPEREPRESENTATION', [subAxis, str('Axis'), str('Curve2D'), L([
      E('IFCPOLYLINE', [L([
        E('IFCCARTESIANPOINT', [L([num(-len / 2), '0.'])]),
        E('IFCCARTESIANPOINT', [L([num(len / 2), '0.'])])
      ])])
    ])]);
    const shape = E('IFCPRODUCTDEFINITIONSHAPE', ['$', '$', L([axis, body])]);
    // IfcWall, а не IfcWallStandardCase: последний в IFC4 объявлен устаревшим
    // и требует состава слоёв, которого у нас нет. Придумывать материал ради
    // прохождения правила — то же самое, что правило ради галочки
    const w = E('IFCWALL', [G(`wall:${key}`), owner, str(name), '$', '$', pl, shape, str(key),
      kind === 'bearing' ? '.SOLIDWALL.' : '.PARTITIONING.']);
    put(storey.st, w);
    matOf('Кладка', w);
    return { el: w, pl, len, th, horiz, rect, cx, cy, dir: horiz ? [1, 0] : [0, 1] };
  };

  const wallsByLevel = new Map();
  for (const s of storeys) {
    const lv = s.lv, list = [];
    // наружная оболочка отдельными объектами не хранится: на плане это
    // два прямоугольника. Четыре стены выводятся из габарита и толщины
    const t = S.wall;
    const shellWalls = [
      ['S', { x: 0, y: 0, w: S.w, h: t }],
      ['N', { x: 0, y: S.h - t, w: S.w, h: t }],
      ['W', { x: 0, y: t, w: t, h: S.h - 2 * t }],
      ['E', { x: S.w - t, y: t, w: t, h: S.h - 2 * t }]
    ];
    for (const [side, r] of shellWalls) {
      const w = wallOf(s, `${lv.id}.shell${side}`, `Наружная стена ${side}`, r, lv.clear, 'bearing');
      w.side = side;
      list.push(w);
      addProps(w.el, `wall:${lv.id}.shell${side}`, [['id', `${lv.id}.shell${side}`], ['kind', 'shell']]);
    }
    for (const wl of lv.walls) {
      const w = wallOf(s, wl.id, wl.kind === 'bearing' ? 'Несущая стена' : 'Перегородка', wl, lv.clear, wl.kind);
      list.push(w);
      addProps(w.el, `wall:${wl.id}`, [['id', wl.id], ['kind', wl.kind], ...(wl.fire ? [['fire', 'да']] : [])]);
    }
    wallsByLevel.set(lv.id, list);
  }

  // ---- проёмы и заполнения ---------------------------------------------
  // Проём вычитается из стены отношением IfcRelVoidsElement и живёт
  // в осях этой стены: иначе он приезжает рядом со стеной, а не в ней
  // Смещение вдоль стены проецируется на её ось. Раньше оно считалось
  // формулой на каждую сторону света, и восточная приехала зеркальной:
  // отражение Y переворачивает ось стены, а формула об этом не знала.
  // Проекция знает — она работает с той же осью, что и сама стена
  const alongOf = (host, wx, wy) =>
    (wx - host.cx) * host.dir[0] + (wy - host.cy) * host.dir[1];

  const openingIn = (host, key, wx, wy, width, z0, hz, over = 60) => {
    const pl = place(host.pl, alongOf(host, wx, wy), 0, z0);
    const shape = bodyOf([boxSolid(width, host.th + over, hz)]);
    const op = E('IFCOPENINGELEMENT', [G(`op:${key}`), owner, str('Проём'), '$', '$', pl, shape, str(key), '.OPENING.']);
    rels.push(E('IFCRELVOIDSELEMENT', [G(`voids:${key}`), owner, '$', '$', host.el, op]));
    return { op, pl };
  };
  // Заполнение — не блок на всю толщину стены: ArchiCAD честно показывает
  // то, что дали, и цельный параллелепипед в проёме выглядит куском стены.
  // Дверь — коробка по трём сторонам и полотно 40 в середине толщины;
  // окно — рама по периметру и стеклопакет с прозрачным стилем; ворота
  // и люк — одно полотно 60: секционное полотно и стальная крышка — правда.
  // Все тела лежат в одном Body самой двери: отдельные IfcPlate/IfcMember
  // развалили бы счётчики bin/ifc.mjs
  const typed = new Map();               // подпись типа -> {make, els}
  const fill = (storey, opening, key, kind, name, width, hz, th) => {
    const w = width - 40, h = hz - 20;   // свет коробки, посадка прежняя
    const solids = [];
    const isDoor = kind === 'entrance' || kind === 'door' || kind === 'pass-door' || kind === 'gate';
    const frameD = Math.min(80, th);
    if (kind === 'gate' || kind === 'hatch') {
      solids.push(paint(boxSolid(w, 60, h), kind === 'gate' ? 'gate' : 'metal'));
    } else if (isDoor) {
      const fr = 60;                     // брусок коробки
      solids.push(paint(boxSolid(fr, frameD, h, -(w - fr) / 2), 'doorFrame'));
      solids.push(paint(boxSolid(fr, frameD, h, (w - fr) / 2), 'doorFrame'));
      solids.push(paint(boxSolid(w - 2 * fr, frameD, fr, 0, 0, h - fr), 'doorFrame'));
      solids.push(paint(boxSolid(w - 2 * fr, 40, h - fr), 'doorLeaf'));
    } else {
      const fr = 60, fd = Math.min(70, th);
      solids.push(paint(boxSolid(fr, fd, h, -(w - fr) / 2), 'winFrame'));
      solids.push(paint(boxSolid(fr, fd, h, (w - fr) / 2), 'winFrame'));
      solids.push(paint(boxSolid(w - 2 * fr, fd, fr, 0, 0, h - fr), 'winFrame'));
      solids.push(paint(boxSolid(w - 2 * fr, fd, fr, 0, 0, 0), 'winFrame'));
      solids.push(paint(boxSolid(w - 2 * fr, 24, h - 2 * fr, 0, 0, fr), 'glass'));
    }
    const shape = bodyOf(solids);
    const pl = place(opening.pl, 0, 0, 0);
    // ворота — .GATE. с подъёмом, а не распашная дверь: ArchiCAD ведёт по
    // этим полям спецификацию, и «ворота ROLLINGUP» в ней — не то же самое,
    // что «дверь налево»
    const [pd, op] = kind === 'gate' ? ['.GATE.', '.ROLLINGUP.']
      : isDoor ? ['.DOOR.', '.SINGLE_SWING_LEFT.'] : [null, null];
    const el = isDoor
      ? E('IFCDOOR', [G(`door:${key}`), owner, str(name), '$', '$', pl, shape, str(key), num(hz), num(width), pd, op, '$'])
      : E('IFCWINDOW', [G(`win:${key}`), owner, str(name), '$', '$', pl, shape, str(key), num(hz), num(width), '.WINDOW.', '.SINGLE_PANEL.', '$']);
    rels.push(E('IFCRELFILLSELEMENT', [G(`fills:${key}`), owner, '$', '$', opening.op, el]));
    put(storey.st, el);
    // типы копятся по подписи: ArchiCAD пересобирает дверь в параметрический
    // объект по IfcDoorType с Lining/Panel, без него остаётся глыба
    const sig = `${isDoor ? 'door' : 'win'}:${kind}:${Math.round(width)}x${Math.round(hz)}`;
    if (!typed.has(sig)) typed.set(sig, { isDoor, kind, width, hz, name, els: [] });
    typed.get(sig).els.push(el);
    return el;
  };

  for (const s of storeys) {
    const lv = s.lv, walls = wallsByLevel.get(lv.id);
    // внутренние проёмы
    for (const o of lv.openings || []) {
      const rect = o.dir === 'h' ? { x: o.x, y: o.y, w: o.w, h: o.t } : { x: o.x, y: o.y, w: o.t, h: o.w };
      const host = walls.find(w => w.rect.x <= rect.x + 1 && w.rect.y <= rect.y + 1
        && w.rect.x + w.rect.w >= rect.x + rect.w - 1 && w.rect.y + w.rect.h >= rect.y + rect.h - 1);
      if (!host) continue;
      const op = openingIn(host, o.id, rect.x + rect.w / 2, Y(rect.y + rect.h / 2), o.w, 0, o.hz);
      if (o.kind !== 'pass') {
        const el = fill(s, op, o.id, 'door', 'Дверь', o.w, o.hz, host.th - 40);
        addStd(el, `door:${o.id}`, 'Pset_DoorCommon', [
          ['Reference', `IFCIDENTIFIER(${str(o.id)})`],
          ['IsExternal', 'IFCBOOLEAN(.F.)'],
          ...(o.fire ? [['FireRating', `IFCLABEL(${str('EI 30')})`]] : [])
        ]);
      }
      addProps(op.op, `op:${o.id}`, [['id', o.id], ['kind', o.kind || 'door']]);
    }
    // проёмы в наружных стенах
    for (const w of lv.windows || []) {
      const host = walls.find(x => x.side === w.side);
      if (!host) continue;
      const width = w.b - w.a, c = (w.a + w.b) / 2, t = S.wall;
      const wx = w.side === 'W' ? t / 2 : w.side === 'E' ? S.w - t / 2 : c;
      const wy = w.side === 'S' ? Y(t / 2) : w.side === 'N' ? Y(S.h - t / 2) : Y(c);
      const op = openingIn(host, w.id, wx, wy, width, w.sill || 0, w.hz);
      const isDoor = w.kind === 'entrance' || w.kind === 'door' || w.kind === 'gate';
      const el = fill(s, op, w.id, w.kind || 'window',
        w.kind === 'gate' ? 'Ворота' : isDoor ? 'Наружная дверь' : w.kind === 'hatch' ? 'Люк' : 'Окно', width, w.hz, host.th - 60);
      addStd(el, `${isDoor ? 'door' : 'win'}:${w.id}`, isDoor ? 'Pset_DoorCommon' : 'Pset_WindowCommon', [
        ['Reference', `IFCIDENTIFIER(${str(w.id)})`],
        ['IsExternal', 'IFCBOOLEAN(.T.)']
      ]);
      addProps(op.op, `op:${w.id}`, [['id', w.id], ['kind', w.kind || 'window'], ['sill', w.sill || 0]]);
    }
  }

  // ---- типы заполнений ---------------------------------------------------
  // По IfcDoorType с Lining/Panel ArchiCAD пересобирает дверь в свой
  // параметрический объект; occurrence без типа остаётся глыбой геометрии.
  // Тип на каждую подпись «вид × габарит», а не на каждую дверь
  for (const [sig, t] of typed) {
    const label = `${t.name} ${Math.round(t.width)}×${Math.round(t.hz)}`;
    let type;
    if (t.isDoor) {
      const lining = E('IFCDOORLININGPROPERTIES', [G(`lining:${sig}`), owner, '$', '$',
        num(80), num(60), ...Array(11).fill('$')]);
      const panel = E('IFCDOORPANELPROPERTIES', [G(`panel:${sig}`), owner, '$', '$',
        num(t.kind === 'gate' ? 60 : 40), t.kind === 'gate' ? '.ROLLINGUP.' : '.SWINGING.',
        '$', '.MIDDLE.', '$']);
      type = E('IFCDOORTYPE', [G(`type:${sig}`), owner, str(label), '$', '$',
        L([lining, panel]), '$', '$', '$',
        t.kind === 'gate' ? '.GATE.' : '.DOOR.',
        t.kind === 'gate' ? '.ROLLINGUP.' : '.SINGLE_SWING_LEFT.', '.F.', '$']);
    } else {
      const lining = E('IFCWINDOWLININGPROPERTIES', [G(`lining:${sig}`), owner, '$', '$',
        num(70), num(60), ...Array(10).fill('$')]);
      type = E('IFCWINDOWTYPE', [G(`type:${sig}`), owner, str(label), '$', '$',
        L([lining]), '$', '$', '$', '.WINDOW.', '.SINGLE_PANEL.', '.F.', '$']);
    }
    rels.push(E('IFCRELDEFINESBYTYPE', [G(`typerel:${sig}`), owner, '$', '$', L(t.els), type]));
  }

  // ---- перекрытия --------------------------------------------------------
  // Сплошная плита запечатывает лестничную шахту и стояки: в модели дом
  // выглядит целым, а подняться по лестнице некуда. Вырезы обязательны
  for (const s of storeys) {
    const lv = s.lv, th = lv.floorToFloor - lv.clear;
    const pl = place(s.pl, S.w / 2, Y(S.h / 2), lv.clear);
    const slab = E('IFCSLAB', [G(`slab:${lv.id}`), owner, str(`Перекрытие над «${lv.title}»`), '$', '$', pl,
      bodyOf([paint(boxSolid(S.w, S.h, th), 'slab')]), str(`${lv.id}.slab`), '.FLOOR.']);
    put(s.st, slab);
    matOf('Железобетон', slab);
    addProps(slab, `slab:${lv.id}`, [['id', `${lv.id}.slab`], ['thickness', th]]);

    const holes = [
      ...(lv.stair && house.levels[house.levels.indexOf(lv) + 1] ? [[lv.stair, `${lv.id}.stair`]] : []),
      ...(lv.riser ? [[lv.riser, lv.riser.id]] : []),
      ...(lv.ducts || []).map(d => [d, d.id]),
      ...(lv.flues || []).filter(f => !f.outside).map(f => [f, f.id]),
      ...(lv.atticHatch ? [[lv.atticHatch, lv.atticHatch.id]] : [])
    ];
    for (const [q, key] of holes) {
      const hp = place(s.pl, q.x + q.w / 2, Y(q.y + q.h / 2), lv.clear - 60);
      const op = E('IFCOPENINGELEMENT', [G(`slabop:${key}`), owner, str('Проём в перекрытии'), '$', '$', hp,
        bodyOf([boxSolid(q.w, q.h, th + 120)]), str(key), '.OPENING.']);
      rels.push(E('IFCRELVOIDSELEMENT', [G(`slabvoids:${key}`), owner, '$', '$', slab, op]));
    }
  }
  {
    // Фундаментный пирог — решение в данных, а не заглушка в коде: плита
    // с выпуском за стену, под ней подбетонка, под ней песчаная подготовка.
    // Смета берёт те же числа из того же места
    const s0 = storeys[0], F = house.foundation || {};
    const slabTh = F.slab ?? 400, lean = F.lean ?? 0, sand = F.sand ?? 0, out = F.out ?? 0;
    const pl = place(s0.pl, S.w / 2, Y(S.h / 2), -slabTh);
    const slab = E('IFCSLAB', [G('slab:base'), owner, str('Плита фундаментная'), '$', '$', pl,
      bodyOf([paint(boxSolid(S.w + 2 * out, S.h + 2 * out, slabTh), 'slab')]), str('base.slab'), '.BASESLAB.']);
    put(s0.st, slab);
    matOf('Железобетон', slab);
    addProps(slab, 'slab:base', [['id', 'base.slab'], ['thickness', slabTh], ['out', out]]);
    if (lean) {
      const el = E('IFCSLAB', [G('slab:lean'), owner, str('Подбетонка'), '$', '$',
        place(s0.pl, S.w / 2, Y(S.h / 2), -slabTh - lean),
        bodyOf([paint(boxSolid(S.w + 2 * out + 200, S.h + 2 * out + 200, lean), 'stone')]),
        str('base.lean'), '.BASESLAB.']);
      put(s0.st, el);
      matOf('Бетон', el);
    }
    if (sand) {
      const el = E('IFCSLAB', [G('slab:sand'), owner, str('Песчаная подготовка'), '$', '$',
        place(s0.pl, S.w / 2, Y(S.h / 2), -slabTh - lean - sand),
        bodyOf([paint(boxSolid(S.w + 2 * out + 400, S.h + 2 * out + 400, sand), 'ground')]),
        str('base.sand'), '.BASESLAB.']);
      put(s0.st, el);
      matOf('Песок', el);
    }
    // пристенный дренаж по периметру подошвы: смета платит за длину этого
    // же кольца, а не за «периметр плюс сколько-то»
    const D = drainGeom(house);
    for (const q of D.ring) {
      const horiz = q.w > 0;
      const [pos, axis, ref] = horiz
        ? [[q.x, Y(q.y), D.z - s0.lv.base], [1, 0, 0], [0, 1, 0]]
        : [[q.x, Y(q.y + q.h), D.z - s0.lv.base], [0, 1, 0], [1, 0, 0]];
      const el = E('IFCPIPESEGMENT', [G(`drain:${q.id}`), owner, str('Дренаж пристенный'), '$', '$',
        placeAx(s0.pl, pos, axis, ref), bodyOf([paint(cylSolid(D.r, Math.max(q.w, q.h)), 'vk')]),
        str(q.id), '.RIGIDSEGMENT.']);
      put(s0.st, el);
      matOf('Дренажная труба', el);
    }
  }

  // ---- люк на чердак -----------------------------------------------------
  // Чердак холодный, но обслуживаемый: дымоходы и кровля требуют доступа.
  // Вырез в чердачном перекрытии уже сделан списком дырок, здесь — крышка
  for (const s of storeys) {
    const hq = s.lv.atticHatch;
    if (!hq) continue;
    const el = E('IFCPLATE', [G(`attic:${hq.id}`), owner, str('Люк на чердак'), '$', '$',
      place(s.pl, hq.x + hq.w / 2, Y(hq.y + hq.h / 2), s.lv.clear),
      bodyOf([paint(boxSolid(hq.w, hq.h, 60), 'wood')]), str(hq.id), '.NOTDEFINED.']);
    put(s.st, el);
    matOf('Древесина', el);
    addProps(el, `attic:${hq.id}`, [['id', hq.id]]);
  }

  // ---- веранда -----------------------------------------------------------
  // Вход в дом по заданию только с неё: без веранды входная дверь
  // открывается в пустоту, и это видно сразу, как только смотришь на модель.
  // Выгружается конструкцией, а не одним прямоугольником: сваи, обвязка,
  // настил, стойки и наклонный навес — иначе «веранда есть» ничего не значит
  {
    const V = verandaGeom(house);
    const s = V && storeys.find(x => x.lv.veranda);
    if (V && s) {
      const v = V.v, lv = s.lv;
      const deckTh = v.board + v.joist[0];
      const deck = E('IFCSLAB', [G(`veranda:${lv.id}`), owner, str('Настил веранды'), '$', '$',
        place(s.pl, v.x + v.w / 2, Y(v.y + v.h / 2), v.deck - deckTh),
        bodyOf([paint(boxSolid(v.w, v.h, deckTh), 'wood')]), str(`${lv.id}.veranda`), '.FLOOR.']);
      put(s.st, deck);
      matOf('Древесина', deck);
      addProps(deck, `veranda:${lv.id}`, [['id', `${lv.id}.veranda`],
      ['area', V.deckArea.toFixed(2)], ['deck', v.deck], ['joists', V.joists]]);

      for (const q of V.piles) {
        const el = E('IFCPILE', [G(`vpile:${q.id}`), owner, str('Свая веранды'), '$', '$',
          place(s.pl, q.x + q.w / 2, Y(q.y + q.h / 2), V.pileBottom),
          bodyOf([paint(cylSolid(v.pile / 2, V.pileTop - V.pileBottom), 'metal')]), str(q.id), '.COLUMN_PILE.', '$']);
        put(s.st, el);
        matOf('Сталь', el);
      }
      // обвязка по двум рядам свай — на ней лежат лаги
      for (const [i, q] of V.piles.filter((_, k) => k < 2).entries()) {
        const el = E('IFCBEAM', [G(`vbeam:${lv.id}:${i}`), owner, str('Обвязка веранды'), '$', '$',
          place(s.pl, q.x + q.w / 2, Y(v.y + v.h / 2), V.beamBottom),
          bodyOf([paint(boxSolid(v.beam[1], v.h, v.beam[0]), 'wood')]), str(`${lv.id}.vbeam${i + 1}`), '.BEAM.']);
        put(s.st, el);
        matOf('Древесина', el);
      }
      for (const q of V.posts) {
        const el = E('IFCCOLUMN', [G(`vpost:${q.id}`), owner, str('Стойка веранды'), '$', '$',
          place(s.pl, q.x + q.w / 2, Y(q.y + q.h / 2), v.deck),
          bodyOf([paint(boxSolid(v.post, v.post, V.postZ), 'wood')]), str(q.id), '.COLUMN.']);
        put(s.st, el);
        matOf('Древесина', el);
      }
      // навес: односкатный, от стены дома вниз к наружному краю
      const b = V.canopyBox, p = v.pitch * Math.PI / 180;
      const east = V.wall === 'E' ? 1 : -1;
      const cz = (v.attach + V.dropZ) / 2;
      const canopy = E('IFCSLAB', [G(`vcanopy:${lv.id}`), owner, str('Навес веранды'), '$', '$',
        placeAx(s.pl, [b.x + b.w / 2, Y(b.y + b.h / 2), cz - lv.base + lv.base],
          [east * Math.sin(p), 0, Math.cos(p)], [0, -east, 0]),
        bodyOf([paint(boxSolid(b.h, V.canopyLen, 60), 'roof')]), str(`${lv.id}.canopy`), '.ROOF.']);
      put(s.st, canopy);
      matOf((house.roof && house.roof.cover) || 'Кровельный лист', canopy);
      addProps(canopy, `vcanopy:${lv.id}`, [['id', `${lv.id}.canopy`], ['pitch', v.pitch],
      ['area', V.canopyArea.toFixed(2)], ['clear', V.clear]]);

      // ограждение настила: поручень, средняя царга и стойки по трём краям
      // с разрывом под ступени. Длину этих же отрезков платит смета
      if (V.railSegs.length) {
        const solids = [];
        for (const r of V.railSegs) {
          const cx0 = r.x + r.w / 2 - (v.x + v.w / 2), cy0 = Y(r.y + r.h / 2) - Y(v.y + v.h / 2);
          solids.push(boxSolid(r.w, r.h, 50, cx0, cy0, V.railTop - 50));
          solids.push(boxSolid(r.w, r.h, 30, cx0, cy0, v.deck + 470));
          const horiz = r.w > r.h, len = Math.max(r.w, r.h);
          const n = Math.max(2, Math.ceil(len / 1200) + 1);
          for (let i = 0; i < n; i++) {
            const at = 25 + (len - 50) * i / (n - 1);
            const [px, py] = horiz ? [r.x + at, r.y + r.h / 2] : [r.x + r.w / 2, r.y + at];
            solids.push(boxSolid(50, 50, V.railTop - 50 - v.deck,
              px - (v.x + v.w / 2), Y(py) - Y(v.y + v.h / 2), v.deck));
          }
        }
        const el = E('IFCRAILING', [G(`vrail:${lv.id}`), owner, str('Ограждение веранды'), '$', '$',
          place(s.pl, v.x + v.w / 2, Y(v.y + v.h / 2), 0),
          bodyOf(solids.map(x => paint(x, 'wood'))), str(`${lv.id}.vrail`), '.GUARDRAIL.']);
        put(s.st, el);
        matOf('Древесина', el);
        addProps(el, `vrail:${lv.id}`, [['id', `${lv.id}.vrail`], ['len', V.rail], ['top', V.railTop]]);
      }
      // ступени с настила на землю — без них с веранды сходят в никуда
      if (V.deckSteps.length) {
        const bottom = (house.site.ground ?? -300) - 150;
        const cx = v.x + V.stepW / 2, cy = Y(V.deckSteps[0].y + 150);
        const solids = V.deckSteps.map(st => boxSolid(st.w, st.h, st.top - bottom,
          st.x + st.w / 2 - cx, Y(st.y + st.h / 2) - cy, bottom));
        const el = E('IFCSTAIRFLIGHT', [G(`vsteps:${lv.id}`), owner, str('Ступени веранды'), '$', '$',
          place(s.pl, cx, cy, 0), bodyOf(solids.map(x => paint(x, 'wood'))), str(`${lv.id}.vsteps`),
          String(V.deckSteps.length), String(v.steps),
          num(V.deckSteps[0].rise), num(300), '.STRAIGHT.']);
        put(s.st, el);
        matOf('Древесина', el);
      }
    }
  }

  // ---- кровля ------------------------------------------------------------
  // Два наклонных ската под IfcRoof, мауэрлат по обеим несущим стенам
  // и коньковый прогон. Уклон здесь настоящий: скат посажен наклонной осью,
  // а не положен плашмя с уклоном в свойствах
  if (house.roof) {
    const R = house.roof, g = roofGeom(house), top = storeys[storeys.length - 1];
    const p = R.pitch * Math.PI / 180, th = R.rafter[0];
    const roof = E('IFCROOF', [G('roof'), owner, str('Кровля'), '$', '$',
      place(top.pl, 0, 0, 0), '$', str('roof'), R.type === 'gable' ? '.GABLE_ROOF.' : '.NOTDEFINED.']);
    put(top.st, roof);
    addProps(roof, 'roof', [['pitch', R.pitch], ['area', g.area.toFixed(2)],
    ['ridge', g.ridgeZ], ['eave', g.eaveZ], ['cover', R.cover]]);

    const slopes = [];
    for (const n of [-1, 1]) {                              // ЗАПАД и ВОСТОК либо ЮГ и СЕВЕР
      const cz = (g.ridgeZ + g.eaveZ) / 2 - top.lv.base;
      const [cx, cy, axis, ref] = g.alongY
        ? [g.ridge.x1 + n * (g.span / 2 + R.eave) / 2, Y(S.h / 2),
          [n * Math.sin(p), 0, Math.cos(p)], [0, -n, 0]]
        : [S.w / 2, Y(g.ridge.y1 + n * (g.span / 2 + R.eave) / 2),
          [0, -n * Math.sin(p), Math.cos(p)], [n, 0, 0]];
      const sl = E('IFCSLAB', [G(`roof:slope${n > 0 ? 2 : 1}`), owner, str('Скат кровли'), '$', '$',
        placeAx(top.pl, [cx, cy, cz], axis, ref),
        bodyOf([paint(boxSolid(g.slopeW, g.slopeLen, th, 0, 0, -th), 'roof')]),
        str(`roof.slope${n > 0 ? 2 : 1}`), '.ROOF.']);
      slopes.push(sl);
      matOf(R.cover, sl);
    }
    rels.push(E('IFCRELAGGREGATES', [G('agg:roof'), owner, '$', '$', roof, L(slopes)]));

    // Дымоходы и вентшахта протыкают кровлю — в скате обязан быть вырез.
    // На листе кровли проходы нарисованы давно; тело ската шло сквозь них
    // нерассечённым, и модель расходилась с чертежом
    for (const hole of roofHoles(house)) {
      const cx = hole.x + hole.w / 2, cy = hole.y + hole.h / 2;
      const zc = Math.round(g.zAt(cx, cy)) - top.lv.base;
      const near = g.alongY ? cx < S.w / 2 : cy < S.h / 2;
      const host = slopes[near ? 0 : 1];
      const op = E('IFCOPENINGELEMENT', [G(`roofop:${hole.id}`), owner, str('Проход через кровлю'), '$', '$',
        place(top.pl, cx, Y(cy), zc - g.rafterDrop - 200),
        bodyOf([boxSolid(hole.w, hole.h, g.rafterDrop + 400)]), str(hole.id), '.OPENING.']);
      rels.push(E('IFCRELVOIDSELEMENT', [G(`roofvoids:${hole.id}`), owner, '$', '$', host, op]));
    }

    // мауэрлат по обеим стенам, на которые опираются стропила
    for (const n of [-1, 1]) {
      const [mx, my, mw, mh] = g.alongY
        ? [n < 0 ? S.wall / 2 : S.w - S.wall / 2, Y(S.h / 2), R.mauerlat[0], S.h]
        : [S.w / 2, n < 0 ? Y(S.wall / 2) : Y(S.h - S.wall / 2), S.w, R.mauerlat[0]];
      const el = E('IFCBEAM', [G(`roof:mauerlat${n > 0 ? 2 : 1}`), owner, str('Мауэрлат'), '$', '$',
        place(top.pl, mx, my, R.base - top.lv.base - R.mauerlat[1]),
        bodyOf([paint(boxSolid(mw, mh, R.mauerlat[1]), 'wood')]), str(`roof.mauerlat${n > 0 ? 2 : 1}`), '.BEAM.']);
      put(top.st, el);
      matOf('Древесина', el);
    }
    // Затяжки. Прогона и стоек под ним нет: под линией конька несущей стены
    // нет на всю длину дома — над спальней хозяев она отсутствует вовсе,
    // и стойка прогона встала бы на чердачное перекрытие. Распор замыкает
    // затяжка, она же балка чердачного перекрытия
    for (let i = 0; i < g.trusses; i++) {
      const t0 = S.wall / 2 + (g.len - S.wall) * i / (g.trusses - 1);
      const [tx, ty, tw, tl] = g.alongY
        ? [S.w / 2, Y(t0), S.w - S.wall, R.tie[1]] : [t0, Y(S.h / 2), R.tie[1], S.h - S.wall];
      const el = E('IFCBEAM', [G(`roof:tie${i + 1}`), owner, str('Затяжка фермы'), '$', '$',
        place(top.pl, tx, ty, R.base - top.lv.base),
        bodyOf([paint(boxSolid(tw, tl, R.tie[0]), 'wood')]), str(`roof.tie${i + 1}`), '.BEAM.']);
      put(top.st, el);
      matOf('Древесина', el);
    }
    // Надкровельная часть труб идёт от чердачного перекрытия, а не от
    // плоскости ската: поуровневые шахты кончаются на перекрытии, и кусок,
    // начатый от ската, висел в чердаке на полуметре воздуха
    const overZ0 = R.base - top.lv.base;
    for (const f of top.lv.flues || []) {
      const el = E('IFCCHIMNEY', [G(`chimney:${f.id}`), owner, str('Дымоход над кровлей'), '$', '$',
        place(top.pl, f.x + f.w / 2, Y(f.y + f.h / 2), overZ0),
        bodyOf([paint(boxSolid(f.w, f.h, flueTop(house, f) - top.lv.base - overZ0), 'metal')]),
        str(`${f.id}.over`), '.NOTDEFINED.']);
      put(top.st, el);
      matOf('Сталь', el);
      addProps(el, `chimney:${f.id}`, [['id', `${f.id}.over`], ['top', flueTop(house, f)]]);
    }
    for (const d of top.lv.ducts || []) {
      const el = E('IFCBUILDINGELEMENTPROXY', [G(`ductover:${d.id}`), owner, str('Вентшахта над кровлей'), '$', '$',
        place(top.pl, d.x + d.w / 2, Y(d.y + d.h / 2), overZ0),
        bodyOf([paint(boxSolid(d.w, d.h, flueTop(house, d) - top.lv.base - overZ0), 'wall')]),
        str(`${d.id}.over`), '.ELEMENT.']);
      put(top.st, el);
    }

    // Фронтоны. Без них под скатами открытый треугольник с обоих торцов —
    // дом с дырой на чердак. Профиль один на смету, выгрузку и проверку:
    // он приходит из roofGeom и здесь только выдавливается на толщину стены.
    // Ось экструзии — минус Y модели, поэтому стена сажается за дальнюю
    // по Y грань и выдавливается на себя; обе стены — одним кодом
    const zb = g.gableBase - top.lv.base;
    const gableEnds = g.alongY
      ? [['S', [0, Y(0), zb], [0, -1, 0], [1, 0, 0]], ['N', [0, S.wall, zb], [0, -1, 0], [1, 0, 0]]]
      : [['W', [0, Y(S.h), zb], [1, 0, 0], [0, 1, 0]], ['E', [S.w - S.wall, Y(S.h), zb], [1, 0, 0], [0, 1, 0]]];
    for (const [side, pos, axis, ref] of gableEnds) {
      const pl = placeAx(top.pl, pos, axis, ref);
      const w = E('IFCWALL', [G(`gable:${side}`), owner, str(`Фронтон ${side}`), '$', '$', pl,
        bodyOf([paint(polySolid(g.gableProf, S.wall), 'wall')]), str(`roof.gable${side}`), '.SOLIDWALL.']);
      put(top.st, w);
      matOf('Кладка', w);
      addProps(w, `gable:${side}`, [['id', `roof.gable${side}`], ['area', g.gable.toFixed(2)]]);
      // продух у конька — он уже нарисован на листе кровли, и модель
      // не имеет права разойтись с чертежом
      const v = g.ventBox;
      const op = E('IFCOPENINGELEMENT', [G(`gablevent:${side}`), owner, str('Продух'), '$', '$',
        place(pl, g.span / 2, 0, 0), bodyOf([boxSolid(v.w, v.h, S.wall + 120, 0, v.v, -60)]),
        str(`roof.vent${side}`), '.OPENING.']);
      rels.push(E('IFCRELVOIDSELEMENT', [G(`gableventvoids:${side}`), owner, '$', '$', w, op]));
    }
    // Фризовый клин вдоль карнизных стен: между чердачной плитой и телом
    // ската остаётся щель на всю длину дома, затяжки её не закрывают
    const friezeEnds = g.alongY
      ? [['W', [0, Y(S.wall), zb], [0, -1, 0], [1, 0, 0], true],
      ['E', [S.w - S.wall, Y(S.wall), zb], [0, -1, 0], [1, 0, 0], false]]
      : [['S', [S.wall, Y(S.wall), zb], [1, 0, 0], [0, 1, 0], false],
      ['N', [S.wall, Y(S.h), zb], [1, 0, 0], [0, 1, 0], true]];
    for (const [side, pos, axis, ref, outerFirst] of friezeEnds) {
      // профиль клином: снаружи до низа тела ската, изнутри выше — грань
      // наружу ставится первой точкой профиля
      const prof = outerFirst ? g.friezeProf
        : g.friezeProf.map(([u, z]) => [S.wall - u, z]);
      const pl = placeAx(top.pl, pos, axis, ref);
      const w = E('IFCWALL', [G(`frieze:${side}`), owner, str(`Фризовый пояс ${side}`), '$', '$', pl,
        bodyOf([paint(polySolid(prof, g.friezeLen), 'wall')]), str(`roof.frieze${side}`), '.SOLIDWALL.']);
      put(top.st, w);
      matOf('Кладка', w);
    }
    // снегозадержатели: решение в данных, лист кровли их рисует, смета платит
    if (R.snowGuard) {
      const back = Math.round(900 * Math.cos(p));           // от кромки свеса в плане
      for (const n of [-1, 1]) {
        const at = g.alongY
          ? (n < 0 ? g.out.x + back : g.out.x + g.out.w - back)
          : (n < 0 ? g.out.y + back : g.out.y + g.out.h - back);
        const z = Math.round(g.alongY ? g.zAt(at, 0) : g.zAt(0, at)) + 20 - top.lv.base;
        const [bx, by, bw, bh] = g.alongY
          ? [at, Y(S.h / 2), 60, g.slopeW] : [S.w / 2, Y(at), g.slopeW, 60];
        const el = E('IFCBEAM', [G(`snow:${n > 0 ? 2 : 1}`), owner, str('Снегозадержатель'), '$', '$',
          place(top.pl, bx, by, z), bodyOf([paint(boxSolid(bw, bh, 60), 'metal')]),
          str(`roof.snow${n > 0 ? 2 : 1}`), '.NOTDEFINED.']);
        put(top.st, el);
        matOf('Сталь', el);
      }
    }
    // водосток: жёлоб под кромкой обоих скатов и трубы у стен с коленом
    // под свесом. Числа давно в смете — теперь и тела в модели
    const W = gutterGeom(house);
    for (const q of W.gutters) {
      const [pos, axis, ref] = q.alongY
        ? [[q.edge, Y(q.a1), q.z - top.lv.base], [0, 1, 0], [1, 0, 0]]
        : [[q.a0, Y(q.edge), q.z - top.lv.base], [1, 0, 0], [0, 1, 0]];
      const el = E('IFCPIPESEGMENT', [G(`gutter:${q.id}`), owner, str('Жёлоб водосточный'), '$', '$',
        placeAx(top.pl, pos, axis, ref), bodyOf([paint(cylSolid(q.r, q.a1 - q.a0), 'metal')]),
        str(q.id), '.GUTTER.']);
      put(top.st, el);
      matOf('Сталь', el);
    }
    for (const q of W.drains) {
      const [px, py] = q.alongY ? [q.wall, Y(q.at)] : [q.at, Y(q.wall)];
      const stand = paint(cylSolid(q.r, q.z1 - q.z0), 'metal');
      // колено от жёлоба к стене — горизонтальный отрезок под свесом
      const dx = q.edge - q.wall;
      const [ax, rf] = q.alongY
        ? [[Math.sign(dx), 0, 0], [0, 1, 0]] : [[0, -Math.sign(dx), 0], [1, 0, 0]];
      const elbow = E('IFCEXTRUDEDAREASOLID', [
        E('IFCCIRCLEPROFILEDEF', ['.AREA.', '$',
          E('IFCAXIS2PLACEMENT2D', [E('IFCCARTESIANPOINT', [L(['0.', '0.'])]), '$']), num(q.r)]),
        E('IFCAXIS2PLACEMENT3D', [pt3(0, 0, q.z1 - q.z0), dir3(...ax), dir3(...rf)]),
        DZ, num(Math.abs(dx))]);
      paint(elbow, 'metal');
      const el = E('IFCPIPESEGMENT', [G(`drain:${q.id}`), owner, str('Труба водосточная'), '$', '$',
        place(top.pl, px, py, q.z0 - top.lv.base), bodyOf([stand, elbow]),
        str(q.id), '.RIGIDSEGMENT.']);
      put(top.st, el);
      matOf('Сталь', el);
    }
  }

  // ---- пандусы ворот ------------------------------------------------------
  // Порог ворот выше земли: без съезда машина выезжает в обрыв. Наклонная
  // плита от земли до порога, отмостка под ней разорвана
  for (const q of rampGeom(house)) {
    const s = storeys.find(x => (x.lv.windows || []).some(w => w.id === q.win));
    if (!s) continue;
    const horiz = q.side === 'S' || q.side === 'N';
    const cp = Math.atan2(q.z1 - q.z0, q.run);
    const axis = q.side === 'S' ? [0, Math.sin(cp), Math.cos(cp)]
      : q.side === 'N' ? [0, -Math.sin(cp), Math.cos(cp)]
        : q.side === 'W' ? [Math.sin(cp), 0, Math.cos(cp)] : [-Math.sin(cp), 0, Math.cos(cp)];
    const el = E('IFCSLAB', [G(`ramp:${q.id}`), owner, str('Пандус ворот'), '$', '$',
      placeAx(s.pl, [q.pad.x + q.pad.w / 2, Y(q.pad.y + q.pad.h / 2), (q.z0 + q.z1) / 2 - s.lv.base],
        axis, horiz ? [1, 0, 0] : [0, 1, 0]),
      bodyOf([paint(boxSolid(horiz ? q.pad.w : q.pad.h, q.len, 100, 0, 0, -100), 'stone')]),
      str(q.id), '.NOTDEFINED.']);
    put(s.st, el);
    matOf('Железобетон', el);
    addProps(el, `ramp:${q.id}`, [['id', q.id], ['slope', Math.round(q.slope)], ['len', q.len]]);
  }

  // ---- грунт площадки -----------------------------------------------------
  // Цоколь заглублён, и без тела земли дом выглядит трёхэтажной коробкой
  // на ходулях. Грунт лежит на цокольном этаже — фильтр уровней смотрелки
  // выключает его вместе с цоколем, и подземную часть можно разглядывать
  for (const q of groundGeom(house)) {
    const s0 = storeys[0];
    const el = E('IFCGEOGRAPHICELEMENT', [G(`ground:${q.id}`), owner, str('Грунт площадки'), '$', '$',
      place(s0.pl, q.x + q.w / 2, Y(q.y + q.h / 2), q.bottom - s0.lv.base),
      bodyOf([paint(boxSolid(q.w, q.h, q.top - q.bottom), 'ground')]), str(q.id), '.TERRAIN.']);
    put(s0.st, el);
    matOf('Грунт', el);
  }

  // ---- отмостка -----------------------------------------------------------
  // Полоса по периметру с разрывами под выносы: правило про борт приямка
  // «выше отмостки» наконец ссылается на тело, а не на воображаемую плоскость
  {
    const s0 = storeys.find(x => x.lv.base === 0) || storeys[0];
    for (const q of blindGeom(house)) {
      const el = E('IFCSLAB', [G(`apron:${q.id}`), owner, str('Отмостка'), '$', '$',
        place(s0.pl, q.x + q.w / 2, Y(q.y + q.h / 2), q.top - q.th - s0.lv.base),
        bodyOf([paint(boxSolid(q.w, q.h, q.th), 'stone')]), str(q.id), '.BASESLAB.']);
      put(s0.st, el);
      matOf('Железобетон', el);
    }
  }

  // ---- приямок люка ------------------------------------------------------
  // Коробка дровяника: три бетонные стенки, дно и решётка сверху. Без неё
  // люк открывается в грунт, и «дрова падают прямо к котлу» остаётся словами
  for (const q of pitGeom(house)) {
    const s = storeys.find(x => (x.lv.windows || []).some(w => w.id === q.win));
    if (!s) continue;
    const b = q.box, t = q.wall, horiz = q.side === 'S' || q.side === 'N';
    const sides = horiz
      ? [[b.x, b.y, t, b.h], [b.x + b.w - t, b.y, t, b.h],
      [b.x, q.side === 'S' ? b.y : b.y + b.h - t, b.w, t]]
      : [[b.x, b.y, b.w, t], [b.x, b.y + b.h - t, b.w, t],
      [q.side === 'W' ? b.x : b.x + b.w - t, b.y, t, b.h]];
    sides.forEach((r, i) => {
      const el = E('IFCWALL', [G(`pit:${q.id}:${i}`), owner, str('Стенка приямка'), '$', '$',
        place(s.pl, r[0] + r[2] / 2, Y(r[1] + r[3] / 2), q.floor - s.lv.base),
        bodyOf([paint(boxSolid(r[2], r[3], q.top - q.floor), 'stone')]), str(`${q.id}.w${i + 1}`), '.SOLIDWALL.']);
      put(s.st, el);
      matOf('Железобетон', el);
    });
    const floor = E('IFCSLAB', [G(`pitfloor:${q.id}`), owner, str('Дно приямка'), '$', '$',
      place(s.pl, b.x + b.w / 2, Y(b.y + b.h / 2), q.floor - s.lv.base - t),
      bodyOf([paint(boxSolid(b.w, b.h, t), 'stone')]), str(`${q.id}.floor`), '.BASESLAB.']);
    put(s.st, floor);
    matOf('Железобетон', floor);
    const cover = E('IFCPLATE', [G(`pitcover:${q.id}`), owner, str('Крышка приямка'), '$', '$',
      place(s.pl, b.x + b.w / 2, Y(b.y + b.h / 2), q.top - s.lv.base - 60),
      bodyOf([paint(boxSolid(b.w, b.h, 60), 'metal')]), str(`${q.id}.cover`), '.NOTDEFINED.']);
    put(s.st, cover);
    matOf('Сталь', cover);
    addProps(cover, `pitcover:${q.id}`, [['id', q.id], ['floor', q.floor], ['top', q.top]]);

    // лоток: наклонное дно от порога люка вверх-наружу. Плоское дно в выгрузке
    // выглядит так же, а дрова с него в люк не идут
    const c = q.clear, cp = q.chute * Math.PI / 180;
    const axis = q.side === 'W' ? [Math.sin(cp), 0, Math.cos(cp)]
      : q.side === 'E' ? [-Math.sin(cp), 0, Math.cos(cp)]
        : q.side === 'S' ? [0, -Math.sin(cp), Math.cos(cp)] : [0, Math.sin(cp), Math.cos(cp)];
    const chute = E('IFCSLAB', [G(`pitchute:${q.id}`), owner, str('Лоток приямка'), '$', '$',
      placeAx(s.pl, [c.x + c.w / 2, Y(c.y + c.h / 2), (q.sillZ + q.chuteTop) / 2 - s.lv.base],
        axis, horiz ? [1, 0, 0] : [0, 1, 0]),
      bodyOf([paint(boxSolid(horiz ? c.w : c.h, q.chuteLen, 100, 0, 0, -100), 'stone')]),
      str(`${q.id}.chute`), '.FLOOR.']);
    put(s.st, chute);
    matOf('Железобетон', chute);
    addProps(chute, `pitchute:${q.id}`, [['id', `${q.id}.chute`], ['slope', q.chute], ['len', q.chuteLen]]);
  }

  // ---- крыльцо -----------------------------------------------------------
  // Порог наружной двери выше земли, и без площадки со ступенями из двери
  // шагают в грунт. В модели это видно сразу, на плане — никогда
  for (const q of porchGeom(house)) {
    const s = storeys.find(x => (x.lv.windows || []).some(w => w.id === q.win));
    if (!s) continue;
    const th = 150, cx = q.pad.x + q.pad.w / 2, cy = Y(q.pad.y + q.pad.h / 2);
    const pad = E('IFCSLAB', [G(`porch:${q.id}`), owner, str('Площадка крыльца'), '$', '$',
      place(s.pl, cx, cy, q.landZ - s.lv.base - th),
      bodyOf([paint(boxSolid(q.pad.w, q.pad.h, th), 'stone')]), str(`${q.id}.pad`), '.LANDING.']);
    put(s.st, pad);
    matOf('Железобетон', pad);
    addProps(pad, `porch:${q.id}`, [['id', q.id], ['rise', q.rise], ['tread', q.tread],
    ['reach', q.reach], ['landing', q.landZ]]);

    const bottom = q.ground - th - s.lv.base;
    const solids = q.steps.map((st, i) => boxSolid(st.w, st.h,
      q.landZ - q.rise * (i + 1) - s.lv.base - bottom,
      st.x + st.w / 2 - cx, Y(st.y + st.h / 2) - cy, bottom));
    const flight = E('IFCSTAIRFLIGHT', [G(`porchsteps:${q.id}`), owner, str('Ступени крыльца'), '$', '$',
      place(s.pl, cx, cy, 0), bodyOf(solids.map(x => paint(x, 'stone'))), str(`${q.id}.steps`),
      String(q.steps.length), String(q.steps.length), num(q.rise), num(q.tread), '.STRAIGHT.']);
    put(s.st, flight);
  }

  // ---- помещения ---------------------------------------------------------
  for (const s of storeys) {
    for (const r of s.lv.rooms) {
      const pl = place(s.pl, r.x + r.w / 2, Y(r.y + r.h / 2), 0);
      const sp = E('IFCSPACE', [G(`space:${r.id}`), owner, str(String(r.n)), '$', '$', pl,
        bodyOf([boxSolid(r.w, r.h, s.lv.clear)]), str(r.name), '.ELEMENT.', '.INTERNAL.', num(s.lv.base)]);
      rels.push(E('IFCRELAGGREGATES', [G(`agg:${r.id}`), owner, '$', '$', s.st, L([sp])]));
      addProps(sp, `space:${r.id}`, [['id', r.id], ['name', r.name], ['area', (r.w * r.h / 1e6).toFixed(2)],
      ...(r.tag ? [['tag', r.tag]] : []), ...(r.role ? [['role', r.role]] : [])]);
    }
  }

  // ---- лестница ----------------------------------------------------------
  for (const s of storeys) {
    const st = s.lv.stair;
    if (!st) continue;
    const other = house.levels[house.levels.indexOf(s.lv) + 1];
    if (!other) continue;                       // с верхнего этажа марш не идёт
    const climb = other.base - s.lv.base, rise = climb / st.risers;
    const half = st.risers / 2;                 // маршей два, подъёмов поровну
    const g = stairGeom(st), { steps, landing, width } = g;
    const cx = st.x + st.w / 2, cy = st.y + st.h / 2;

    // Ходим так же, как ходит человек: от восточного торца на запад до
    // площадки, разворот, и с площадки на восток. Раньше второй марш
    // отсчитывался от дальнего конца — после разворота он начинался
    // не от площадки, а от входа, и последняя ступень вылезала из шахты
    const solids = [];
    for (let i = 1; i <= st.risers; i++) {
      const up = i <= half;
      const j = up ? i : i - half;              // номер ступени внутри марша
      if (j > steps) continue;                  // последний подъём — на площадку и на пол
      // оба марша прижаты к торцу, с которого входят и на который выходят
      const x = g.stepX(j, up);
      const y = up ? st.y : st.y + st.h - width;
      solids.push(boxSolid(st.tread, width, rise * i,
        x + st.tread / 2 - cx, Y(y + width / 2) - Y(cy)));
    }
    // промежуточная площадка: на неё приходит первый марш, с неё уходит второй
    solids.push(boxSolid(landing, st.h, climb / 2, g.landX0 + landing / 2 - cx, 0));
    const pl = place(s.pl, st.x + st.w / 2, Y(st.y + st.h / 2), 0);
    const el = E('IFCSTAIR', [G(`stair:${s.lv.id}`), owner, str('Лестница'), '$', '$', pl,
      bodyOf(solids.map(x => paint(x, 'stone'))), str(`${s.lv.id}.stair`), '.HALF_TURN_STAIR.']);
    put(s.st, el);
    addProps(el, `stair:${s.lv.id}`, [['risers', st.risers], ['rise', Math.round(rise)], ['tread', st.tread]]);

    // Ограждение маршей — решение st.rail, наклонный поручень по внутренней
    // кромке каждого марша со стойками. Отдельным элементом, а не телами
    // лестницы: проверка ходьбы по ступеням не должна спотыкаться о перила
    if (st.rail) {
      const climbHalf = rise * (steps + 1);
      const railSolids = [];
      for (const up of [true, false]) {
        const yIn = up ? st.y + width - 50 : st.y + st.h - width;  // внутренняя кромка
        const yc = yIn + 25;
        const zOff = up ? 0 : climbHalf;
        // поручень протянут над серединами первой и последней ступени:
        // направление и торец входа приходят из stepX, зеркалить нечего
        const xA = g.stepX(1, up) + st.tread / 2, xB = g.stepX(steps, up) + st.tread / 2;
        const zA = zOff + rise + st.rail, zB = zOff + rise * steps + st.rail;
        const railLen = Math.round(Math.hypot(xB - xA, zB - zA));
        railSolids.push(slantSolid(50, 50, railLen,
          [xA - cx, Y(yc) - Y(cy), zA],
          [(xB - xA) / railLen, 0, (zB - zA) / railLen], [0, 1, 0]));
        for (const j of [1, Math.ceil(steps / 2), steps]) {
          const px = g.stepX(j, up) + st.tread / 2;
          const zs = zOff + rise * j;
          railSolids.push(boxSolid(50, 50, st.rail, px - cx, Y(yc) - Y(cy), zs));
        }
      }
      const railing = E('IFCRAILING', [G(`stairrail:${s.lv.id}`), owner, str('Ограждение лестницы'), '$', '$',
        place(s.pl, cx, Y(cy), 0), bodyOf(railSolids.map(x => paint(x, 'wood'))),
        str(`${s.lv.id}.srail`), '.HANDRAIL.']);
      put(s.st, railing);
      addProps(railing, `stairrail:${s.lv.id}`, [['rail', st.rail]]);
    }
  }

  // ---- мебель и оборудование ---------------------------------------------
  for (const s of storeys) {
    for (const f of s.lv.furniture || []) {
      if (!f.hz) continue;
      const cx = f.t === 'c' ? f.x : f.x + f.w / 2;
      const cy = f.t === 'c' ? f.y : f.y + f.h / 2;
      const pl = place(s.pl, cx, Y(cy), 0);
      const solid = paint(f.t === 'c' ? cylSolid(f.r, f.hz) : boxSolid(f.w, f.h, f.hz), 'furn');
      const el = E('IFCFURNISHINGELEMENT', [G(`furn:${f.id}`), owner, str(f.l || f.sym), '$', '$', pl, bodyOf([solid]), str(f.id)]);
      put(s.st, el);
      addProps(el, `furn:${f.id}`, [['id', f.id], ['sym', f.sym], ['hz', f.hz]]);
    }
    // шахты
    const shafts = [
      ...(s.lv.riser ? [[s.lv.riser, 'Стояк канализации', 'riser']] : []),
      ...(s.lv.ducts || []).map(d => [d, 'Вентшахта', 'duct']),
      ...(s.lv.flues || []).map(f => [f, 'Дымоход', 'flue'])
    ];
    shafts.forEach(([q, name]) => {
      const pl = place(s.pl, q.x + q.w / 2, Y(q.y + q.h / 2), 0);
      const el = E('IFCBUILDINGELEMENTPROXY', [G(`shaft:${q.id}`), owner, str(name), '$', '$', pl,
        bodyOf([paint(boxSolid(q.w, q.h, s.lv.floorToFloor), 'stone')]), str(q.id), '.ELEMENT.']);
      put(s.st, el);
      addProps(el, `shaft:${q.id}`, [['id', q.id]]);
    });
  }

  // ---- инженерия ----------------------------------------------------------
  // тип элемента выбран по назначению, а не «проксями на всё»: розетка —
  // IfcOutlet, светильник — IfcLamp, радиатор — IfcSpaceHeater. Так их
  // видит любой BIM-инструмент, а не только глаз
  const MEP = {
    socket: ['IFCOUTLET', '.POWEROUTLET.', 'Розетка'],
    socketIP: ['IFCOUTLET', '.POWEROUTLET.', 'Розетка IP44'],
    power: ['IFCOUTLET', '.POWEROUTLET.', 'Силовой вывод'],
    light: ['IFCLAMP', '.NOTDEFINED.', 'Светильник'],
    switch: ['IFCSWITCHINGDEVICE', '.TOGGLESWITCH.', 'Выключатель'],
    cold: ['IFCVALVE', '.ISOLATING.', 'Подводка ХВС'],
    hot: ['IFCVALVE', '.ISOLATING.', 'Подводка ГВС'],
    drain: ['IFCWASTETERMINAL', '.FLOORTRAP.', 'Выпуск канализации'],
    ufh: ['IFCSPACEHEATER', '.NOTDEFINED.', 'Контур тёплого пола'],
    radiator: ['IFCSPACEHEATER', '.RADIATOR.', 'Радиатор'],
    convector: ['IFCSPACEHEATER', '.CONVECTOR.', 'Конвектор внутрипольный'],
    supply: ['IFCAIRTERMINAL', '.DIFFUSER.', 'Приток'],
    exhaust: ['IFCAIRTERMINAL', '.GRILLE.', 'Вытяжка'],
    data: ['IFCOUTLET', '.DATAOUTLET.', 'RJ45'],
    tv: ['IFCOUTLET', '.AUDIOVISUALOUTLET.', 'ТВ'],
    rack: ['IFCCOMMUNICATIONSAPPLIANCE', '.NETWORKAPPLIANCE.', 'Слаботочный шкаф'],
    leak: ['IFCSENSOR', '.MOISTURESENSOR.', 'Датчик протечки'],
    smoke: ['IFCSENSOR', '.FIRESENSOR.', 'Извещатель']
  };

  const sysElems = new Map();
  for (const sys of systems) {
    const own = [];
    for (const p of sys.points) {
      const s = storeys.find(x => x.lv.id === p.level);
      if (!s) continue;
      const room = s.lv.rooms.find(r => r.id === p.room);
      let x, y;
      if (p.x != null) { x = p.x; y = p.y; }
      else if (room) {
        const f = faceAt(room, p.side, p.along);
        x = f.x; y = f.y;
      } else continue;
      const [type, pd, name] = MEP[p.kind] || ['IFCBUILDINGELEMENTPROXY', '.NOTDEFINED.', p.kind];
      // контур тёплого пола — плита зоны укладки в стяжке, а не коробочка
      if (p.kind === 'ufh') {
        const pl2 = place(s.pl, p.x + p.w / 2, Y(p.y + p.h / 2), p.z);
        const el2 = E('IFCSPACEHEATER', [G(`mep:${p.id}`), owner, str('Контур тёплого пола'), '$', '$',
          pl2, bodyOf([paint(boxSolid(p.w, p.h, 30), sys.id)]), str(p.id), '.NOTDEFINED.']);
        put(s.st, el2);
        own.push(el2);
        addProps(el2, `mep:${p.id}`, [['id', p.id], ['kind', p.kind], ['room', p.room],
        ['len', Math.round(p.w * p.h / 150)]]);
        continue;
      }
      let size = p.kind === 'radiator' ? [p.len || 800, 120, 500]
        : p.kind === 'convector' ? [p.len || 800, 250, 120]
        : p.kind === 'supply' || p.kind === 'exhaust' ? [200, 200, 200] : [120, 120, 120];
      // прибор длинной стороной вдоль своей стены: радиатор на восточной
      // грани, вытянутый по X, перегораживал комнату и протыкал фасад
      if (p.side === 'E' || p.side === 'W') size = [size[1], size[0], size[2]];
      // z радиатора и конвектора — их низ (так рисует развёртка), у прочих — ось
      const z0 = p.kind === 'radiator' || p.kind === 'convector'
        ? p.z : Math.max(0, p.z - size[2] / 2);
      const pl = place(s.pl, x, Y(y), z0);
      const args = [G(`mep:${p.id}`), owner, str(name), '$', '$', pl,
        bodyOf([paint(boxSolid(size[0], size[1], size[2]), PAL[sys.id] ? sys.id : 'metal')]), str(p.id)];
      const el = E(type, [...args, pd]);
      put(s.st, el);
      own.push(el);
      addProps(el, `mep:${p.id}`, [['id', p.id], ['kind', p.kind], ['z', p.z],
      ['room', p.room], ...(p.host ? [['host', p.host]] : [])]);
    }
    // ---- трассы раздела ---------------------------------------------------
    // Осевые отрезки берутся из тех же прогонов, по которым посчитан метраж:
    // второй прокладки «для картинки» здесь нет, и разойтись с ведомостью
    // трасса не может. Один элемент на прогон, тела — отрезки с нахлёстом
    // в полсечения на углах, чтобы колена смыкались
    const ROUTE = {
      socket: ['IFCCABLECARRIERSEGMENT', '.CONDUITSEGMENT.', 30],
      socketIP: ['IFCCABLECARRIERSEGMENT', '.CONDUITSEGMENT.', 30],
      power: ['IFCCABLECARRIERSEGMENT', '.CONDUITSEGMENT.', 30],
      light: ['IFCCABLECARRIERSEGMENT', '.CONDUITSEGMENT.', 25],
      switch: ['IFCCABLECARRIERSEGMENT', '.CONDUITSEGMENT.', 25],
      cold: ['IFCPIPESEGMENT', '.RIGIDSEGMENT.', 25],
      hot: ['IFCPIPESEGMENT', '.RIGIDSEGMENT.', 25],
      drain: ['IFCPIPESEGMENT', '.RIGIDSEGMENT.', 60],
      ufh: ['IFCPIPESEGMENT', '.RIGIDSEGMENT.', 25],
      radiator: ['IFCPIPESEGMENT', '.RIGIDSEGMENT.', 25],
      convector: ['IFCPIPESEGMENT', '.RIGIDSEGMENT.', 25],
      supply: ['IFCDUCTSEGMENT', '.RIGIDSEGMENT.', 125],
      exhaust: ['IFCDUCTSEGMENT', '.RIGIDSEGMENT.', 125],
      data: ['IFCCABLECARRIERSEGMENT', '.CONDUITSEGMENT.', 25],
      tv: ['IFCCABLECARRIERSEGMENT', '.CONDUITSEGMENT.', 25],
      rack: ['IFCCABLECARRIERSEGMENT', '.CONDUITSEGMENT.', 25],
      leak: ['IFCCABLECARRIERSEGMENT', '.CONDUITSEGMENT.', 20],
      smoke: ['IFCCABLECARRIERSEGMENT', '.CONDUITSEGMENT.', 20]
    };
    const segSolids = (segs, sec) => segs.map(sg => sg.v
      ? boxSolid(sec, sec, sg.z1 - sg.z0, sg.x, Y(sg.y), sg.z0)
      : sg.a.x !== sg.b.x
        ? boxSolid(Math.abs(sg.b.x - sg.a.x) + sec, sec, sec,
          (sg.a.x + sg.b.x) / 2, Y((sg.a.y + sg.b.y) / 2), sg.z - sec / 2)
        : boxSolid(sec, Math.abs(sg.b.y - sg.a.y) + sec, sec,
          (sg.a.x + sg.b.x) / 2, Y((sg.a.y + sg.b.y) / 2), sg.z - sec / 2));
    const b = bill(house, sys);
    for (const r of b.runs) {
      const segs = runSegments3d(r);
      if (!segs.length) continue;
      const s = storeys.find(x => x.lv.id === r.level.id);
      const [cls, pd, sec] = ROUTE[r.points[0].kind] || ['IFCCABLECARRIERSEGMENT', '.CONDUITSEGMENT.', 25];
      const el = E(cls, [G(`run:${sys.id}:${r.key}`), owner,
        str(`Трасса: ${(KIND[r.points[0].kind] || {}).l || r.points[0].kind}`), '$', '$',
        place(s.pl, 0, 0, 0), bodyOf(segSolids(segs, sec).map(x => paint(x, sys.id))),
        str(`${sys.id}.run.${r.key}`), pd]);
      put(s.st, el);
      own.push(el);
      addProps(el, `run:${sys.id}:${r.key}`, [['len', r.len], ['points', r.points.length]]);
    }
    // наружные сети: ввод и выпуск от границы площадки до стены дома.
    // Без них дом не подключить — а их не было ни в модели, ни в ведомости
    for (const f of feedsGeom(house, sys)) {
      const s0 = storeys[0];
      const [cls, pd, r] = f.kind === 'power'
        ? ['IFCCABLECARRIERSEGMENT', '.CONDUITSEGMENT.', 25]
        : ['IFCPIPESEGMENT', '.RIGIDSEGMENT.', f.kind === 'sewer' ? 55 : 16];
      const dx = f.b.x - f.a.x, dy = f.b.y - f.a.y, dz = f.b.z - f.a.z;
      const len = Math.hypot(dx, dy, dz);
      const el = E(cls, [G(`feed:${f.id}`), owner,
        str(f.kind === 'sewer' ? 'Выпуск канализации' : f.kind === 'water' ? 'Ввод воды' : 'Кабельный ввод'),
        '$', '$', place(s0.pl, 0, 0, 0),
        bodyOf([paint(E('IFCEXTRUDEDAREASOLID', [
          E('IFCCIRCLEPROFILEDEF', ['.AREA.', '$',
            E('IFCAXIS2PLACEMENT2D', [E('IFCCARTESIANPOINT', [L(['0.', '0.'])]), '$']), num(r)]),
          E('IFCAXIS2PLACEMENT3D', [pt3(f.a.x, Y(f.a.y), f.a.z - s0.lv.base),
            dir3(dx / len, -dy / len, dz / len), dir3(0, 0, 1)]),
          DZ, num(Math.round(len))]), sys.id)]),
        str(f.id), pd]);
      put(s0.st, el);
      own.push(el);
      addProps(el, `feed:${f.id}`, [['id', f.id], ['kind', f.kind], ['len', f.len],
      ['depth', f.depth], ...(f.slope ? [['slope', f.slope]] : [])]);
    }
    for (const t of b.trunks) {
      const segs = trunkSegments3d(house, sys, t);
      const s = storeys.find(x => x.lv.id === t.level.id);
      const [cls, pd, sec] = sys.id === 'vk' || sys.id === 'ov'
        ? ['IFCPIPESEGMENT', '.RIGIDSEGMENT.', 32]
        : ['IFCCABLECARRIERSEGMENT', '.CONDUITSEGMENT.', 30];
      const el = E(cls, [G(`trunk:${sys.id}:${t.level.id}`), owner, str(`Магистраль: ${t.mat}`), '$', '$',
        place(s.pl, 0, 0, 0), bodyOf(segSolids(segs, sec).map(x => paint(x, sys.id))),
        str(`${sys.id}.trunk.${t.level.id}`), pd]);
      put(s.st, el);
      own.push(el);
      addProps(el, `trunk:${sys.id}:${t.level.id}`, [['len', t.len], ['to', t.level.id]]);
    }
    sysElems.set(sys, own);
  }

  // системы как группы: раздел остаётся раделом и после выгрузки
  for (const [sys, own] of sysElems) {
    if (!own.length) continue;
    const g = E('IFCSYSTEM', [G(`sys:${sys.id}`), owner, str(sys.title), str(sys.note || ''), '$']);
    rels.push(E('IFCRELASSIGNSTOGROUP', [G(`grp:${sys.id}`), owner, '$', '$', L(own), '$', g]));
    rels.push(E('IFCRELSERVICESBUILDINGS', [G(`srv:${sys.id}`), owner, '$', '$', g, L([building])]));
  }

  // ---- привязка к этажам и свойства ---------------------------------------
  for (const [st, els] of contains)
    rels.push(E('IFCRELCONTAINEDINSPATIALSTRUCTURE', [G(`cont:${st}`), owner, '$', '$', L(els), st]));

  for (const { el, key, pairs } of propsFor) {
    const props = pairs.map(([k, v]) => E('IFCPROPERTYSINGLEVALUE', [str(k), '$',
      typeof v === 'number' ? `IFCINTEGER(${Math.round(v)})` : `IFCTEXT(${str(v)})`, '$']));
    const set = E('IFCPROPERTYSET', [G(`pset:${key}`), owner, str('Pset_planner'), '$', L(props)]);
    rels.push(E('IFCRELDEFINESBYPROPERTIES', [G(`defp:${key}`), owner, '$', '$', L([el]), set]));
  }
  // стандартные Psets: значения уже набраны в типах IFC, писать их как IFCTEXT
  // значило бы соврать про тип — IsExternal обязан быть IFCBOOLEAN
  for (const { el, key, name, pairs } of stdFor) {
    const props = pairs.map(([k, v]) => E('IFCPROPERTYSINGLEVALUE', [str(k), '$', v, '$']));
    const set = E('IFCPROPERTYSET', [G(`stdpset:${key}`), owner, str(name), '$', L(props)]);
    rels.push(E('IFCRELDEFINESBYPROPERTIES', [G(`stddefp:${key}`), owner, '$', '$', L([el]), set]));
  }
  // материал — одной связью на имя, а не на элемент: так его видит любой
  // BIM-инструмент, и спецификация «сколько кладки» собирается сама
  for (const [name, els] of matFor) {
    const m = E('IFCMATERIAL', [str(name), '$', '$']);
    rels.push(E('IFCRELASSOCIATESMATERIAL', [G(`matrel:${name}`), owner, '$', '$', L(els), m]));
  }

  return [...head, ...lines, 'ENDSEC;', 'END-ISO-10303-21;', ''].join('\n');
}

// координата точки на грани помещения — тот же расчёт, что в model.mjs,
// продублирован намеренно: экспорт не должен тянуть за собой отрисовку
function faceAt(room, side, along) {
  const { x, y, w, h } = room;
  const a = Math.max(0, Math.min(along, side === 'S' || side === 'N' ? w : h));
  if (side === 'S') return { x: x + a, y };
  if (side === 'N') return { x: x + w - a, y: y + h };
  if (side === 'E') return { x: x + w, y: y + a };
  return { x, y: y + h - a };
}
