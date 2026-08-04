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
  const bodyOf = solids => E('IFCPRODUCTDEFINITIONSHAPE', ['$', '$', L([
    E('IFCSHAPEREPRESENTATION', [sub, str('Body'), str('SweptSolid'), L(solids)])
  ])]);

  const rels = [];
  const propsFor = [];
  const addProps = (el, key, pairs) => propsFor.push({ el, key, pairs });

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
    const body = E('IFCSHAPEREPRESENTATION', [sub, str('Body'), str('SweptSolid'), L([boxSolid(len, th, hz)])]);
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
  const fill = (storey, opening, key, type, name, width, hz, th) => {
    const shape = bodyOf([boxSolid(width - 40, th, hz - 20)]);
    const pl = place(opening.pl, 0, 0, 0);
    const el = type === 'door'
      ? E('IFCDOOR', [G(`door:${key}`), owner, str(name), '$', '$', pl, shape, str(key), num(hz), num(width), '.DOOR.', '.SINGLE_SWING_LEFT.', '$'])
      : E('IFCWINDOW', [G(`win:${key}`), owner, str(name), '$', '$', pl, shape, str(key), num(hz), num(width), '.WINDOW.', '.SINGLE_PANEL.', '$']);
    rels.push(E('IFCRELFILLSELEMENT', [G(`fills:${key}`), owner, '$', '$', opening.op, el]));
    put(storey.st, el);
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
      if (o.kind !== 'pass') fill(s, op, o.id, 'door', 'Дверь', o.w, o.hz, host.th - 40);
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
      fill(s, op, w.id, isDoor ? 'door' : 'window',
        w.kind === 'gate' ? 'Ворота' : isDoor ? 'Наружная дверь' : 'Окно', width, w.hz, host.th - 60);
      addProps(op.op, `op:${w.id}`, [['id', w.id], ['kind', w.kind || 'window'], ['sill', w.sill || 0]]);
    }
  }

  // ---- перекрытия --------------------------------------------------------
  // Сплошная плита запечатывает лестничную шахту и стояки: в модели дом
  // выглядит целым, а подняться по лестнице некуда. Вырезы обязательны
  for (const s of storeys) {
    const lv = s.lv, th = lv.floorToFloor - lv.clear;
    const pl = place(s.pl, S.w / 2, Y(S.h / 2), lv.clear);
    const slab = E('IFCSLAB', [G(`slab:${lv.id}`), owner, str(`Перекрытие над «${lv.title}»`), '$', '$', pl,
      bodyOf([boxSolid(S.w, S.h, th)]), str(`${lv.id}.slab`), '.FLOOR.']);
    put(s.st, slab);
    addProps(slab, `slab:${lv.id}`, [['id', `${lv.id}.slab`], ['thickness', th]]);

    const holes = [
      ...(lv.stair && house.levels[house.levels.indexOf(lv) + 1] ? [[lv.stair, `${lv.id}.stair`]] : []),
      ...(lv.riser ? [[lv.riser, lv.riser.id]] : []),
      ...(lv.ducts || []).map(d => [d, d.id]),
      ...(lv.flues || []).filter(f => !f.outside).map(f => [f, f.id])
    ];
    for (const [q, key] of holes) {
      const hp = place(s.pl, q.x + q.w / 2, Y(q.y + q.h / 2), lv.clear - 60);
      const op = E('IFCOPENINGELEMENT', [G(`slabop:${key}`), owner, str('Проём в перекрытии'), '$', '$', hp,
        bodyOf([boxSolid(q.w, q.h, th + 120)]), str(key), '.OPENING.']);
      rels.push(E('IFCRELVOIDSELEMENT', [G(`slabvoids:${key}`), owner, '$', '$', slab, op]));
    }
  }
  {
    const s0 = storeys[0], base = 400;
    const pl = place(s0.pl, S.w / 2, Y(S.h / 2), -base);
    const slab = E('IFCSLAB', [G('slab:base'), owner, str('Плита основания'), '$', '$', pl,
      bodyOf([boxSolid(S.w, S.h, base)]), str('base.slab'), '.BASESLAB.']);
    put(s0.st, slab);
  }

  // ---- веранда -----------------------------------------------------------
  // Вход в дом по заданию только с неё: без веранды входная дверь
  // открывается в пустоту, и это видно сразу, как только смотришь на модель
  for (const s of storeys) {
    const v = s.lv.veranda;
    if (!v) continue;
    const deck = E('IFCSLAB', [G(`veranda:${s.lv.id}`), owner, str('Веранда'), '$', '$',
      place(s.pl, v.x + v.w / 2, Y(v.y + v.h / 2), -120),
      bodyOf([boxSolid(v.w, v.h, 120)]), str(`${s.lv.id}.veranda`), '.FLOOR.']);
    put(s.st, deck);
    addProps(deck, `veranda:${s.lv.id}`, [['id', `${s.lv.id}.veranda`],
    ['area', (v.w * v.h / 1e6).toFixed(2)]]);
    for (const [dx, dy] of [[v.w - 100, 100], [v.w - 100, v.h / 2], [v.w - 100, v.h - 100]]) {
      const c = E('IFCCOLUMN', [G(`vpost:${s.lv.id}:${dy}`), owner, str('Стойка веранды'), '$', '$',
        place(s.pl, v.x + dx, Y(v.y + dy), 0),
        bodyOf([boxSolid(150, 150, s.lv.clear)]), '$', '.COLUMN.']);
      put(s.st, c);
    }
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
      bodyOf(solids), str(`${s.lv.id}.stair`), '.HALF_TURN_STAIR.']);
    put(s.st, el);
    addProps(el, `stair:${s.lv.id}`, [['risers', st.risers], ['rise', Math.round(rise)], ['tread', st.tread]]);
  }

  // ---- мебель и оборудование ---------------------------------------------
  for (const s of storeys) {
    for (const f of s.lv.furniture || []) {
      if (!f.hz) continue;
      const cx = f.t === 'c' ? f.x : f.x + f.w / 2;
      const cy = f.t === 'c' ? f.y : f.y + f.h / 2;
      const pl = place(s.pl, cx, Y(cy), 0);
      const solid = f.t === 'c' ? cylSolid(f.r, f.hz) : boxSolid(f.w, f.h, f.hz);
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
        bodyOf([boxSolid(q.w, q.h, s.lv.floorToFloor)]), str(q.id), '.ELEMENT.']);
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
    radiator: ['IFCSPACEHEATER', '.CONVECTOR.', 'Радиатор'],
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
      const size = p.kind === 'radiator' ? [p.len || 800, 120, 500]
        : p.kind === 'supply' || p.kind === 'exhaust' ? [200, 200, 200] : [120, 120, 120];
      const pl = place(s.pl, x, Y(y), Math.max(0, p.z - size[2] / 2));
      const args = [G(`mep:${p.id}`), owner, str(name), '$', '$', pl,
        bodyOf([boxSolid(size[0], size[1], size[2])]), str(p.id)];
      const el = E(type, [...args, pd]);
      put(s.st, el);
      own.push(el);
      addProps(el, `mep:${p.id}`, [['id', p.id], ['kind', p.kind], ['z', p.z],
      ['room', p.room], ...(p.host ? [['host', p.host]] : [])]);
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
