// Времянка. Раньше здесь была коробка 8 × 8 с плоской плитой сверху —
// три поля в данных и шесть тел в выгрузке. Теперь это разобранная модель
// архитектора: каркасный дом 8,11 × 9,56 с открытой террасой под общей
// двускатной кровлей, на свайном фундаменте.
//
// Хранится решение, считается результат — как и у дома. В данных лежит
// то, что решил архитектор: габариты, толщины, уклон, свес, сетка свай,
// перегородки, помещения и ведомость проёмов. Отметки конька и карниза,
// профиль ската, фронтоны, высота каждой стойки, ступени крыльца и площади
// считаются здесь. Поменялся уклон — пересчитались выгрузка, смета,
// генплан и правила разом, потому что источник у них один.
//
// Координаты в данных ЛОКАЛЬНЫЕ: ноль — юго-западный угол строения, то есть
// наружная грань западной стены и наружная кромка настила террасы, ось y
// растёт от террасы вглубь дома. Так посадка на участке — это два числа
// (x, y), а не сорок. Наружу отдаются уже мировые координаты участка.
//
// Отметка чистого пола (floor) — не «ноль дома»: дом на сваях, и между
// землёй и ростверком обязан остаться продух. Пол на +550 при земле −300
// даёт 288 мм под низом ростверка — это число архитектора, и правило
// держит его от исчезновения.

const RAD = Math.PI / 180;

export function tempGeom(house) {
  const T = house.project && house.project.plot && house.project.plot.temp;
  if (!T) return null;
  const ground = house.site.ground ?? -300;
  const t = T.wall ?? 245;
  const D = T.deck || {}, R = T.roof || {}, P = T.pile || {}, PO = T.post || {};
  const tan = Math.tan((R.pitch ?? 15) * RAD);
  const over = R.over ?? 500, pack = R.pack ?? 317;
  const half = T.w / 2;
  const floor = T.floor ?? 0;                       // отметка чистого пола
  const clear = T.clear ?? 2509;                    // верх карнизной стены от пола

  // мировые координаты: локальный (u, v) -> участок
  const X = u => T.x + u, Y = v => T.y + v;
  const rect = (id, u, v, w, h, more) => ({ id, x: X(u), y: Y(v), w, h, ...more });

  // ---- отметки -----------------------------------------------------------
  // Низ кровельного тела в точке u: от верха карнизной стены поднимается
  // к коньку. Верх покрытия выше на толщину пирога. Обе отметки нужны
  // в трёх местах — стойкам, фронтонам и проверке модели, — и считаются
  // одной формулой, чтобы не разойтись
  // clear — высота в свету, то есть отметка НА ВНУТРЕННЕЙ грани стены,
  // а не на наружной. Разница в толщину стены по уклону: 245 · tg15° = 66 мм,
  // и первая версия теряла их, отсчитывая плоскость от наружной грани. Верх
  // покрытия при этом сходился с моделью архитектора до полуметра миллиметра
  // (pack был подобран как разница), а низ уходил на 66 вверх — вдоль обеих
  // карнизных стен оставался клин пустоты на все 6120 мм, стропила не
  // опирались ни на что, и конёк по низу выходил 3596 вместо 3530.
  // Проверяется тремя точками исходника: 2443 на наружной грани, 2509
  // на внутренней, 3530 на коньке
  const underAt = u => floor + clear + (half - Math.abs(u - half) - t) * tan;
  const topAt = u => underAt(u) + pack;
  const ridgeZ = topAt(half);                       // верх конька
  const eaveZ = topAt(-over);                       // верх покрытия на кромке свеса
  const wallTop = floor + clear;                    // высота в свету у внутренней грани
  const wallBox = clear - t * tan;                  // прямая часть стены, выше неё клин

  // ---- оболочка ----------------------------------------------------------
  // Отапливаемый блок стоит в дальней от улицы части габарита, ближнюю
  // занимает открытая терраса: вход в дом — с неё
  const dh = D.h ?? 2945;                           // глубина открытой части
  const block = { x: T.x, y: Y(dh), w: T.w, h: T.h - dh };
  const inner = { x: T.x + t, y: block.y + t, w: T.w - 2 * t, h: block.h - 2 * t };
  const wallRects = [
    ['S', 0, dh, T.w, t], ['N', 0, T.h - t, T.w, t],
    ['W', 0, dh + t, t, block.h - 2 * t], ['E', T.w - t, dh + t, t, block.h - 2 * t]
  ];
  // Никакая стена под скатом не кончается одной отметкой: низ кровли зависит
  // от x, и меняется он и вдоль стены, и поперёк её толщины. Поэтому у каждой
  // стены и перегородки прямая часть высотой до самой низкой точки над ней,
  // а выше — клин по скату. Профиль клина лежит в x и выдавливается по y,
  // и потому годится обеим ориентациям: продольной перегородке он даёт
  // скос поперёк толщины, поперечной — конёк посередине. Плоская крышка
  // оставляла бы щель до кровли — ту самую, из-за которой у дома появился
  // фризовый пояс, и её не видно ни на одном плане
  const un = u => Math.round(underAt(u) - floor);
  const capOf = (x0, x1) => {
    const hz = Math.min(un(x0 - T.x), un(x1 - T.x));
    const pts = [[0, 0], [0, un(x0 - T.x) - hz],
    ...(x0 - T.x < half && half < x1 - T.x ? [[half - (x0 - T.x), un(half) - hz]] : []),
    [x1 - x0, un(x1 - T.x) - hz], [x1 - x0, 0]];
    const prof = pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1]);
    return { hz, wedge: prof.some(p => p[1] > 1) ? prof : null };
  };
  const parts = (T.parts || []).map(q => {
    const r = rect(q.id, q.x, q.y, q.w, q.h);
    r.horiz = q.w >= q.h;
    Object.assign(r, capOf(r.x, r.x + r.w));
    return r;
  });
  // Щипцовая стена — не «стена плюс отдельный фронтон». Первая версия делала
  // именно так, и витраж 3120 вырезался только из нижней коробки 2509:
  // верхние 611 мм окна сидели внутри глухого треугольника, потому что
  // вычитание ставится на элемент, а фронтон был другим элементом.
  // ArchiCAD показал бы ровно это — светопроём 2509 при объявленных 3120.
  // Теперь фронтон входит в тело своей стены, и один проём режет оба
  const gableProf = [[0, 0], [half, Math.round(half * tan)], [T.w, 0]];
  const walls = wallRects.map(([side, u, v, w, h]) => {
    const r = { ...rect(`${T.id}.w${side}`, u, v, w, h), side };
    Object.assign(r, capOf(r.x, r.x + r.w));
    if (side === 'S' || side === 'N') { r.gable = gableProf; r.wedge = null; }
    return r;
  });
  const rooms = (T.rooms || []).map(q => ({
    ...rect(q.id, q.x, q.y, q.w, q.h), name: q.name, use: q.use, area: q.w * q.h / 1e6
  }));

  // ---- проёмы ------------------------------------------------------------
  // В данных проём лежит привязкой вдоль своей стены (a…b), здесь он
  // превращается в мировой отрезок и получает хозяина. Стороны считаются
  // от блока, а не от габарита: южная стена блока смотрит на террасу
  const along = (side, a, b) => side === 'S' || side === 'N'
    ? { a: X(a), b: X(b) } : { a: Y(a), b: Y(b) };
  const openings = [
    { ...T.door, kind: 'door', sill: 0, ...along(T.door.side, T.door.a, T.door.b) },
    ...(T.windows || []).map(w => ({ ...w, kind: 'window', ...along(w.side, w.a, w.b) }))
  ];
  const door = openings[0];
  const windows = openings.slice(1);
  // внутренние двери привязаны к перегородке, а не к стороне света
  const doors = (T.doors || []).map(q => {
    const host = parts.find(p => p.id === q.part);       // уже в мировых
    const horiz = host && host.horiz;
    return {
      ...q, host, horiz,
      a: horiz ? X(q.a) : Y(q.a), b: horiz ? X(q.b) : Y(q.b),
      at: horiz ? host.y + host.h / 2 : host.x + host.w / 2, th: horiz ? host.h : host.w
    };
  });

  // ---- терраса, ступени, ограждение --------------------------------------
  const din = D.in ?? 54;                           // настил уже габарита стен
  const deckTop = floor - (D.drop ?? 55);
  const deck = { ...rect(`${T.id}.deck`, din, 0, T.w - 2 * din, dh), top: deckTop, rail: D.rail };
  // Ступени считаются, а не задаются: перепад от настила до земли делится
  // на подступёнки не выше нормы. Ровно так же считается крыльцо дома —
  // и по той же причине: земля у нас на −300, а не там, где её нарисовали
  const drop = deckTop - ground;
  const risers = Math.max(1, Math.ceil(drop / 200));
  const rise = drop / risers;
  const St = D.steps || {};
  const tread = St.tread ?? 300;
  const steps = [];
  for (let i = 1; i < risers; i++)
    steps.push({
      ...rect(`${T.id}.step${i}`, St.a ?? 0, -(risers - i) * tread,
        (St.b ?? T.w) - (St.a ?? 0), tread),
      top: Math.round(ground + i * rise)
    });
  const stepOut = (risers - 1) * tread;             // вынос ступеней за габарит
  // Боковые экраны террасы — не ограждение, а стены: у архитектора это
  // реечная ширма с запада и почти глухая доска с востока, обе от настила
  // до низа ската. Терраса от них и читается террасой, а не навесом
  // Экран — не панель, а набор досок с шагом: западный реечный (сквозь него
  // видно двор), восточный почти глухой. Сплошной прямоугольник вместо
  // реек — это картинка, а не модель: на экране они выглядят одинаково,
  // и разницу между ширмой и стеной видно только по телам
  const SC = D.screen || {};
  const sc = SC.th ?? 0;
  const screens = [];
  if (sc) for (const [n, u, spec] of [[1, din - sc, SC.west], [2, T.w - din, SC.east]]) {
    const [bw, step] = spec || [145, 150];
    const z1 = Math.round(underAt(u + sc / 2));
    // доски лежат горизонтально стопкой от настила вверх: у архитектора
    // так, и разница видна сразу — частокол из вертикальных реек читается
    // забором, а стопка досок с просветом читается ширмой
    for (let z = deckTop, i = 0; z + bw <= z1; z += step, i++)
      screens.push({ ...rect(`${T.id}.screen${n}.${i + 1}`, u, 0, sc, dh), z0: z, z1: z + bw, side: n });
  }
  // длина экрана по фасаду — для сметы: досок много, а погонаж один
  const screenLen = sc ? 2 * dh : 0;
  // Открытая кромка настила — фронтальная, и она на 795 над землёй.
  // Сходят с неё по ступеням, всё остальное ограждается
  const rails = [];
  if (D.rail && drop > 600) {
    const rt = 60, [sa, sb] = [St.a ?? 0, St.b ?? T.w];
    if (sa > din) rails.push({ ...rect(`${T.id}.rail1`, din, 0, sa - din, rt), hz: D.rail });
    if (T.w - din > sb) rails.push({ ...rect(`${T.id}.rail2`, sb, 0, T.w - din - sb, rt), hz: D.rail });
  }

  // ---- фундамент ---------------------------------------------------------
  // Свая уходит ниже промерзания с коэффициентом на неотапливаемый грунт —
  // тем же правилом, что и свая веранды. Глубина в данных, отметки здесь
  const piles = [];
  for (const u of P.cx || []) for (const v of P.cy || [])
    piles.push({
      ...rect(`${T.id}.pile${piles.length + 1}`, u, v, P.s ?? 150, P.s ?? 150),
      z0: ground - (P.depth ?? 3000), z1: floor - (P.drop ?? 412) - (P.beam ?? 150)
    });
  const pileBottom = ground - (P.depth ?? 3000);
  const grillTop = floor - (P.drop ?? 412);
  const grillBottom = grillTop - (P.beam ?? 180);
  const grill = [];
  {
    const b = P.beam ?? 180, s = P.s ?? 150, cx = P.cx || [], cy = P.cy || [];
    const u0 = cx[0], u1 = cx[cx.length - 1] + s, v0 = cy[0], v1 = cy[cy.length - 1] + s;
    for (const u of cx)
      grill.push({ ...rect(`${T.id}.grill${grill.length + 1}`, u + (s - b) / 2, v0, b, v1 - v0), z0: grillBottom, z1: grillTop });
    for (const v of cy)
      grill.push({ ...rect(`${T.id}.grill${grill.length + 1}`, u0, v + (s - b) / 2, u1 - u0, b), z0: grillBottom, z1: grillTop });
  }

  // Забирка подполья: дом на сваях, и без неё под полом гуляет ветер,
  // а в 3D модель читается коробкой на ходулях. Доски с зазором — они же
  // продух: закрыть подполье наглухо значит сгноить пол за одну зиму
  const SK = P.skirt || {};
  const skirt = [];
  if (SK.th) {
    const cx = P.cx || [], cy = P.cy || [], s0 = P.s ?? 150, th = SK.th;
    const u0 = cx[0], u1 = cx[cx.length - 1] + s0, v0 = cy[0], v1 = cy[cy.length - 1] + s0;
    const board = SK.board ?? 50, step = SK.step ?? 75;
    for (let z = grillTop - board, i = 0; z >= ground; z -= step, i++)
      for (const [n, u, v, w, h] of [
        ['S', u0, v0, u1 - u0, th], ['N', u0, v1 - th, u1 - u0, th],
        ['W', u0, v0 + th, th, v1 - v0 - 2 * th], ['E', u1 - th, v0 + th, th, v1 - v0 - 2 * th]])
        skirt.push({ ...rect(`${T.id}.skirt${n}${i + 1}`, u, v, w, h), z0: z, z1: z + board });
  }
  const skirtLen = skirt.length ? 2 * ((P.cx[P.cx.length - 1] + (P.s ?? 150) - P.cx[0])
    + (P.cy[P.cy.length - 1] + (P.s ?? 150) - P.cy[0])) : 0;

  // ---- стойки террасы ----------------------------------------------------
  // Высота стойки берётся по низу кровли над ней, а не «до карниза»:
  // над серединой террасы низ ската на метр выше, чем над краем
  const posts = [];
  for (const u of PO.cx || []) for (const v of PO.cy || [])
    posts.push({
      ...rect(`${T.id}.post${posts.length + 1}`, u, v, PO.w ?? 145, PO.d ?? 90),
      z0: deckTop, z1: Math.round(underAt(u + (PO.w ?? 145) / 2))
    });

  // ---- кровля ------------------------------------------------------------
  // Тело ската — призма: сечение поперёк конька выдавливается вдоль него
  // на всю длину со свесами. Конёк идёт вдоль y, посередине ширины
  // каждый скат — отдельное тело: так его видно в модели по имени, и так же
  // его меряет проверка. Профиль в осях (поперёк конька, вверх от пола)
  const slopes = [
    {
      id: `${T.id}.slope1`, prof: [[-over, topAt(-over) - floor], [half, topAt(half) - floor],
      [half, topAt(half) - floor - pack], [-over, topAt(-over) - floor - pack]]
    },
    {
      id: `${T.id}.slope2`, prof: [[half, topAt(half) - floor], [T.w + over, topAt(T.w + over) - floor],
      [T.w + over, topAt(T.w + over) - floor - pack], [half, topAt(half) - floor - pack]]
    }
  ];
  const roof = {
    pitch: R.pitch ?? 15, over, pack, mat: R.mat, slopes,
    ridge: X(half), ridgeZ, eaveZ, underAt,
    box: { x: X(-over), y: Y(-over), w: T.w + 2 * over, h: T.h + 2 * over },
    len: T.h + 2 * over,
    // площадь покрытия по скату, а не в плане: за неё платят
    area: (T.w + 2 * over) / Math.cos((R.pitch ?? 15) * RAD) * (T.h + 2 * over) / 1e6
  };
  const gableArea = half * (half * tan) / 1e6 * 2;

  return {
    ...T, t, ground,
    box: { x: T.x, y: T.y, w: T.w, h: T.h },
    block, inner, walls, parts, rooms,
    door, windows, doors, openings,
    deck, deckTop, board: D.board ?? 28, steps, stepOut, risers, rise: Math.round(rise), rails, screens, screenLen, drop,
    piles, pileBottom, grill, grillTop, grillBottom, posts, skirt, skirtLen,
    roof, gableProf, gableArea, wallBox,
    floor, clear, wallTop, top: ridgeZ,
    area: rooms.reduce((s, r) => s + r.area, 0),
    deckArea: deck.w * deck.h / 1e6
  };
}
