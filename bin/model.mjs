// Проверка готовой модели тем же движком, которым её читает страница.
//
// bin/ifc.mjs разбирает собственный текст: сходятся ссылки, количества и места.
// Этого мало. Файл может быть безупречен по составу и пуст на экране: скаты
// кровли лежали в нём двумя IfcSlab, аккуратно посаженными под уклон, и не
// показывались никогда — часть сборки не входит в пространственную структуру,
// смотрелка искала этаж только по прямому вхождению и прятала их фильтром
// уровней. Ни одна проверка по тексту такого не видит.
//
// Поэтому здесь модель открывается web-ifc, из неё вынимаются треугольники,
// и спрашивается то, что видит глаз: есть ли геометрия у каждого слоя,
// куда достаёт коробка, доходит ли верх до конька, и — главное — не осталось
// ли геометрии, которую смотрелка по своим же правилам никому не покажет.

import fs from 'node:fs';
import { roofGeom, verandaGeom, pitGeom, groundGeom } from '../src/roof.mjs';
import { plotGeom } from '../src/plot.mjs';

const read = n => JSON.parse(fs.readFileSync(new URL(`../data/${n}`, import.meta.url)));
const house = read('house.json');
const file = 'out/house.ifc';
if (!fs.existsSync(file)) {
  console.log(`${file} не собран — сначала npm run ifc`);
  process.exit(1);
}

let WebIFC;
try { WebIFC = await import('web-ifc'); }
catch { console.log('web-ifc не установлен: npm i'); process.exit(1); }

const api = new WebIFC.IfcAPI();
api.SetWasmPath(new URL('../node_modules/web-ifc/', import.meta.url).pathname, true);
await api.Init();
const model = api.OpenModel(new Uint8Array(fs.readFileSync(file)));

const ids = v => { const o = []; for (let i = 0; i < v.size(); i++) o.push(v.get(i)); return o; };
const errs = [];

// Движок отдаёт координаты в метрах независимо от того, в чём записан файл.
// Чертёж и данные — в миллиметрах, поэтому отметки надо вернуть в них, иначе
// «верх модели 1» вместо 9212 читается как поломка, а не как единицы
const lengthUnit = ids(api.GetLineIDsWithType(model, WebIFC.IFCSIUNIT))
  .map(u => api.GetLine(model, u))
  .find(u => u.UnitType && u.UnitType.value === 'LENGTHUNIT');
const prefix = lengthUnit && lengthUnit.Prefix && lengthUnit.Prefix.value;
if (prefix !== 'MILLI') errs.push(`длина в файле в ${prefix || 'метрах'}, а весь репозиторий в миллиметрах`);
const MM = 1000;                                   // из метров движка в миллиметры

// ---- то же распределение по слоям и этажам, что делает смотрелка ----------
// Считается здесь второй раз намеренно: если смотрелка и проверка разойдутся,
// проверка перестанет отвечать на вопрос «а видно ли это на экране».
const GROUPS = [
  ['walls', ['IFCWALL', 'IFCWALLSTANDARDCASE']],
  ['slabs', ['IFCSLAB']],
  // водосток без раздела — кровельный: трубы разделов заберёт sysOf раньше
  ['roof', ['IFCROOF', 'IFCCHIMNEY', 'IFCPIPESEGMENT']],
  ['openings', ['IFCDOOR', 'IFCWINDOW']],
  ['stairs', ['IFCSTAIR', 'IFCSTAIRFLIGHT']],
  ['outside', ['IFCPILE', 'IFCCOLUMN', 'IFCPLATE', 'IFCBEAM', 'IFCRAILING']],
  ['furniture', ['IFCFURNISHINGELEMENT', 'IFCFURNITURE']],
  ['shafts', ['IFCBUILDINGELEMENTPROXY']],
  ['site', ['IFCGEOGRAPHICELEMENT']],
  ['temp', []],                          // времянка: набирается меткой plot.t*
  ['spaces', ['IFCSPACE']]
];

const storeys = ids(api.GetLineIDsWithType(model, WebIFC.IFCBUILDINGSTOREY));
const storeyOf = new Map(), parentOf = new Map();
for (const rid of ids(api.GetLineIDsWithType(model, WebIFC.IFCRELCONTAINEDINSPATIALSTRUCTURE))) {
  const r = api.GetLine(model, rid);
  for (const e of r.RelatedElements) storeyOf.set(e.value, r.RelatingStructure.value);
}
for (const rid of ids(api.GetLineIDsWithType(model, WebIFC.IFCRELAGGREGATES))) {
  const r = api.GetLine(model, rid);
  const owner = r.RelatingObject.value;
  if (storeys.includes(owner)) for (const e of r.RelatedObjects) storeyOf.set(e.value, owner);
  else for (const e of r.RelatedObjects) parentOf.set(e.value, owner);
}
const up = (e, d = 0) => storeyOf.has(e) ? storeyOf.get(e)
  : (parentOf.has(e) && d < 8 ? up(parentOf.get(e), d + 1) : null);
for (const e of parentOf.keys()) { const s = up(e); if (s != null) storeyOf.set(e, s); }

const groupOf = new Map();
for (const [key, names] of GROUPS)
  for (const n of names) {
    const code = WebIFC[n];
    if (typeof code !== 'number') continue;
    for (const e of ids(api.GetLineIDsWithType(model, code))) groupOf.set(e, key);
  }
for (const rid of ids(api.GetLineIDsWithType(model, WebIFC.IFCROOF)))
  for (const [child, owner] of parentOf) if (owner === rid) groupOf.set(child, 'roof');
for (const e of ids(api.GetLineIDsWithType(model, WebIFC.IFCBEAM))) {
  const t = api.GetLine(model, e).Tag;
  if (t && String(t.value).startsWith('roof.')) groupOf.set(e, 'roof');
}
// ограждение бывает и на веранде, и на марше: различает метка элемента
for (const e of ids(api.GetLineIDsWithType(model, WebIFC.IFCRAILING))) {
  const t = api.GetLine(model, e).Tag;
  if (t && String(t.value).endsWith('.srail')) groupOf.set(e, 'stairs');
}
// забор, ворота и покрытия — слой участка, как грунт; времянка целиком —
// свой слой: оба различаются меткой, а не типом, парой со смотрелкой
for (const cls of ['IFCWALL', 'IFCSLAB', 'IFCPLATE', 'IFCDOOR', 'IFCWINDOW',
  'IFCBEAM', 'IFCCOLUMN', 'IFCPILE', 'IFCRAILING'])
  for (const e of ids(api.GetLineIDsWithType(model, WebIFC[cls]))) {
    const t = api.GetLine(model, e).Tag;
    if (!t) continue;
    if (/^plot\.(fence|gate|wicket|drive|walk)/.test(String(t.value))) groupOf.set(e, 'site');
    else if (/^plot\.t/.test(String(t.value))) groupOf.set(e, 'temp');
  }
// Сторож той самой пары. Список классов, у которых вообще смотрят метку,
// живёт в двух файлах, и он обязан совпадать: забудь в нём один класс —
// и 24 сваи, 10 балок ростверка, 8 стоек и 41 ограждение уедут в слой
// «Веранда и крыльцо» и погаснут вместе с верандой. Ни один счётчик этого
// не увидит: слой «Времянка» остаётся непустым, тела в файле на месте.
// Поэтому список сверяется с исходником смотрелки текстом, а метка —
// перебором ВСЕХ типов, а не тех же девяти
{
  const src = fs.readFileSync(new URL('../src/viewer.js', import.meta.url), 'utf8');
  const list = t => {
    const m = t.match(/for \(const cls of \[([^\]]*)\]\)\s*\n?\s*for \(const e of ids\(api\.GetLineIDsWithType\(model, WebIFC\[cls\]\)\)\)/);
    return m ? m[1].replace(/\s+/g, '') : null;
  };
  const mine = list(fs.readFileSync(new URL(import.meta.url), 'utf8')), theirs = list(src);
  if (!mine || !theirs) errs.push('список классов метки plot.t* не читается — сторож пары ослеп');
  else if (mine !== theirs)
    errs.push(`список классов метки расходится: проверка ${mine}, смотрелка ${theirs}`);
}
const sysOf = new Map();
for (const rid of ids(api.GetLineIDsWithType(model, WebIFC.IFCRELASSIGNSTOGROUP))) {
  const r = api.GetLine(model, rid);
  const g = api.GetLine(model, r.RelatingGroup.value);
  const t = ((g.Name && g.Name.value) || '').split(' · ')[0].toLowerCase();
  const key = { 'эом': 'eom', 'вк': 'vk', 'ов': 'ov', 'сс': 'ss' }[t];
  if (key) for (const e of r.RelatedObjects) sysOf.set(e.value, key);
}

// ---- геометрия -------------------------------------------------------------
const stat = new Map();                  // слой -> {tri, mn, mx}
const lost = new Map();                  // геометрия, которую смотрелка не покажет
const box = { mn: [1e12, 1e12, 1e12], mx: [-1e12, -1e12, -1e12] };
const nameOf = e => {
  try { const l = api.GetLine(model, e); return (l.Name && l.Name.value) || String(e); }
  catch { return String(e); }
};
let meshes = 0;
const bodied = new Set();
// скаты отдельно от всей кровли: мауэрлат лежит ниже карниза по определению,
// и по нижней точке группы про плоскость ската ничего не скажешь
const slopes = new Set();
for (const e of ids(api.GetLineIDsWithType(model, WebIFC.IFCSLAB))) {
  const t = api.GetLine(model, e).Tag;
  if (t && /^roof\.slope/.test(String(t.value))) slopes.add(e);
}
const slope = { mn: [1e12, 1e12, 1e12], mx: [-1e12, -1e12, -1e12] };
// фронтоны — стены с меткой roof.gable*: их верх обязан дойти до низа
// кровельного тела, иначе под скатами открытый треугольник
const gables = new Set();
for (const e of ids(api.GetLineIDsWithType(model, WebIFC.IFCWALL))) {
  const t = api.GetLine(model, e).Tag;
  if (t && /^roof\.gable/.test(String(t.value))) gables.add(e);
}
const gbox = { mn: [1e12, 1e12, 1e12], mx: [-1e12, -1e12, -1e12] };
// габарит каждого элемента: по нему меряются времянка и прочее адресное
const elBox = new Map();

api.StreamAllMeshes(model, mesh => {
  meshes++;
  const e = mesh.expressID;
  const key = sysOf.get(e) || groupOf.get(e) || 'other';
  const st = storeyOf.get(e);
  if (!stat.has(key)) stat.set(key, { tri: 0, mn: [1e12, 1e12, 1e12], mx: [-1e12, -1e12, -1e12] });
  const s = stat.get(key);
  let tri = 0;
  for (let i = 0; i < mesh.geometries.size(); i++) {
    const pg = mesh.geometries.get(i);
    const g = api.GetGeometry(model, pg.geometryExpressID);
    const v = api.GetVertexArray(g.GetVertexData(), g.GetVertexDataSize());
    tri += g.GetIndexDataSize() / 3;
    const m = pg.flatTransformation;
    for (let k = 0; k < v.length; k += 6) {
      // Движок отдаёт правую систему с осью Y вверх — ту же, в которой рисует
      // смотрелка. Модель у нас Z вверх, поэтому оси возвращаются на место:
      // отметка приезжает в Y, а план по Y — в −Z. Перепутать здесь значит
      // сравнивать конёк с длиной дома и не понять, почему «верх модели 500»
      const p = [
        (m[0] * v[k] + m[4] * v[k + 1] + m[8] * v[k + 2] + m[12]) * MM,
        -(m[2] * v[k] + m[6] * v[k + 1] + m[10] * v[k + 2] + m[14]) * MM,
        (m[1] * v[k] + m[5] * v[k + 1] + m[9] * v[k + 2] + m[13]) * MM
      ];
      let eb = elBox.get(e);
      if (!eb) { eb = { mn: [1e12, 1e12, 1e12], mx: [-1e12, -1e12, -1e12] }; elBox.set(e, eb); }
      for (let a = 0; a < 3; a++) {
        if (p[a] < eb.mn[a]) eb.mn[a] = p[a];
        if (p[a] > eb.mx[a]) eb.mx[a] = p[a];
        if (p[a] < s.mn[a]) s.mn[a] = p[a];
        if (p[a] > s.mx[a]) s.mx[a] = p[a];
        if (slopes.has(e)) {
          if (p[a] < slope.mn[a]) slope.mn[a] = p[a];
          if (p[a] > slope.mx[a]) slope.mx[a] = p[a];
        }
        if (gables.has(e)) {
          if (p[a] < gbox.mn[a]) gbox.mn[a] = p[a];
          if (p[a] > gbox.mx[a]) gbox.mx[a] = p[a];
        }
        if (key === 'spaces') continue;                 // помещения — воздух, габарит не их
        if (p[a] < box.mn[a]) box.mn[a] = p[a];
        if (p[a] > box.mx[a]) box.mx[a] = p[a];
      }
    }
  }
  s.tri += tri;
  if (tri > 0) bodied.add(e);
  // Вот ради этого всё и написано: у элемента есть треугольники, но смотрелка
  // спрашивает этаж, не находит и кладёт его на несуществующий уровень 0
  if (tri > 0 && st == null) {
    const k = `${nameOf(e)} (${key})`;
    lost.set(k, (lost.get(k) || 0) + tri);
  }
});

// ---- чего ждём -------------------------------------------------------------
const g = roofGeom(house), V = verandaGeom(house), pits = pitGeom(house);
const S = house.shell;

if (lost.size)
  for (const [what, tri] of lost)
    errs.push(`${what}: ${Math.round(tri)} треугольников не привязаны к этажу — смотрелка их не покажет`);

const need = ['walls', 'slabs', 'roof', 'openings', 'stairs', 'furniture', 'shafts',
  'site', 'temp', 'eom', 'vk', 'ov', 'ss'];
for (const k of need)
  if (!stat.has(k) || stat.get(k).tri === 0) errs.push(`слой «${k}» пуст: геометрии нет вовсе`);
if (V && (!stat.has('outside') || stat.get('outside').tri === 0))
  errs.push('веранда есть в модели, а свай и стоек на экране нет');

// Верх модели — конёк. Плоская крыша, положенная плашмя, даёт ту же площадь,
// то же число тел и то же число треугольников; ловится только отметкой
const top = box.mx[2];
if (Math.abs(top - g.ridgeZ) > 5)
  errs.push(`верх модели ${Math.round(top)}, конёк по расчёту ${g.ridgeZ}`);
const roofStat = stat.get('roof');
if (!slopes.size) errs.push('скатов кровли в модели нет вовсе');
else {
  // Скат обязан прийти в конёк верхом и в карниз низом. Плоская крыша,
  // положенная плашмя, даёт ту же площадь, то же число тел и те же
  // треугольники — расходятся только отметки
  // толщина ската меряется по нормали, поэтому по вертикали она даёт
  // rafter·cos, а не rafter/cos: перепутать — разойтись на 58 мм и долго искать
  const cos = Math.cos(g.pitch * Math.PI / 180);
  const bottom = g.eaveZ - Math.round(house.roof.rafter[0] * cos);
  if (Math.abs(slope.mx[2] - g.ridgeZ) > 5)
    errs.push(`верх ската ${Math.round(slope.mx[2])}, конёк по расчёту ${g.ridgeZ}`);
  if (Math.abs(slope.mn[2] - bottom) > 5)
    errs.push(`низ ската ${Math.round(slope.mn[2])}, карниз ${g.eaveZ} минус стропило по нормали даёт ${bottom}`);
  if (Math.abs((slope.mx[0] - slope.mn[0]) - g.out.w) > 5)
    errs.push(`скаты накрывают ${Math.round(slope.mx[0] - slope.mn[0])} поперёк, контур кровли ${g.out.w}`);
}

// Фронтоны: два, во всю ширину пролёта, от чердачного перекрытия до низа
// кровельного тела. Скаты достают до конька и без них — «верх модели»
// дыру на торцах не ловит, поэтому фронтоны меряются отдельно
if (house.roof) {
  if (gables.size !== 2) errs.push(`фронтонов ${gables.size}, а двускатной кровле нужно два`);
  else {
    if (Math.abs(gbox.mx[2] - g.gableApexZ) > 5)
      errs.push(`верх фронтона ${Math.round(gbox.mx[2])}, низ кровельного тела на коньке ${g.gableApexZ}`);
    if (Math.abs(gbox.mn[2] - g.gableBase) > 5)
      errs.push(`низ фронтона ${Math.round(gbox.mn[2])}, чердачное перекрытие ${g.gableBase}`);
    const across = g.alongY ? gbox.mx[0] - gbox.mn[0] : gbox.mx[1] - gbox.mn[1];
    if (Math.abs(across - g.span) > 5)
      errs.push(`фронтон закрывает ${Math.round(across)} поперёк, пролёт ${g.span}`);
  }
}

// Участок: грунт обязан дотянуться до границ, забор — обойти их, времянка —
// стоять коробкой в дальнем углу. Список сущностей всё это подтверждает
// и с пустой геометрией; здесь меряются треугольники
{
  const PG = plotGeom(house);
  if (PG) {
    const st = stat.get('site');
    if (!st) errs.push('слой «Участок» пуст — ни грунта, ни забора');
    else {
      if (st.mn[0] > PG.lot.x0 - 100 + 200 || st.mx[0] < PG.lot.x1 - 200)
        errs.push(`участок в модели ${Math.round(st.mn[0])}…${Math.round(st.mx[0])} по x, границы ${PG.lot.x0}…${PG.lot.x1}`);
      const fenceTop = (PG.ground ?? -300) + PG.fence.h;
      if (Math.abs(st.mx[2] - fenceTop) > 50)
        errs.push(`верх слоя «Участок» ${Math.round(st.mx[2])}, верх забора ${fenceTop}`);
    }
    // Времянка перестала быть коробкой, и «габарит слоя» о ней больше ничего
    // не говорит: у неё свес 500 по кругу, и общий габарит шире стен ровно
    // на него. Поэтому меряется по частям — стены отдельно, скаты отдельно,
    // и каждая часть отвечает на свой вопрос
    if (PG.temp) {
      const T = PG.temp;
      const tag = e => { const t = api.GetLine(model, e).Tag; return t ? String(t.value) : ''; };
      // метка сильнее типа: тело с plot.t* обязано оказаться в слое «Времянка»,
      // какого бы класса оно ни было. Проёмы сюда не идут — они вычитаются,
      // а не рисуются, и геометрии у них нет по определению
      for (const [e, b] of elBox) {
        if (!/^plot\.t/.test(tag(e))) continue;
        if (groupOf.get(e) !== 'temp')
          errs.push(`${tag(e)} рисуется в слое «${groupOf.get(e) || 'без слоя'}», а не во «Времянке» — класса нет в списке метки`);
      }
      const pick = re => {
        const b = { mn: [1e12, 1e12, 1e12], mx: [-1e12, -1e12, -1e12], n: 0 };
        for (const [e, q] of elBox) {
          if (!re.test(tag(e))) continue;
          b.n++;
          for (let a = 0; a < 3; a++) {
            if (q.mn[a] < b.mn[a]) b.mn[a] = q.mn[a];
            if (q.mx[a] > b.mx[a]) b.mx[a] = q.mx[a];
          }
        }
        return b;
      };
      // движок отдаёт план по y отражённым, как вся выгрузка: обратно в план
      const py0 = b => S.h - b.mx[1], py1 = b => S.h - b.mn[1];
      const all = pick(/^plot\.temp/);
      if (!all.n) errs.push('времянки в модели нет вовсе');
      else {
        const near = (a, b, d = 5) => Math.abs(a - b) <= d;
        // стены блока стоят ровно в пятне генплана
        const w = pick(/^plot\.temp\.w[SNWE]$/);
        if (!w.n) errs.push('наружных стен времянки в модели нет');
        else if (!near(w.mn[0], T.block.x) || !near(w.mx[0], T.block.x + T.block.w)
          || !near(py0(w), T.block.y) || !near(py1(w), T.block.y + T.block.h))
          errs.push(`блок времянки стоит в ${Math.round(w.mn[0])}…${Math.round(w.mx[0])} × ${Math.round(py0(w))}…${Math.round(py1(w))}, по генплану ${T.block.x}…${T.block.x + T.block.w} × ${T.block.y}…${T.block.y + T.block.h}`);
        // карнизная стена кончается прямой частью, клин над ней достаёт
        // до низа ската у внутренней грани — щели между ними быть не может
        const ew = pick(/^plot\.temp\.wW$|^plot\.temp\.wE$/), cap = pick(/^plot\.temp\.w[WE]\.up$/);
        if (ew.n && !near(ew.mx[2], T.floor + T.wallBox))
          errs.push(`верх карнизных стен времянки ${Math.round(ew.mx[2])}, по расчёту ${Math.round(T.floor + T.wallBox)}`);
        if (cap.n !== 2) errs.push(`клиньев над карнизными стенами времянки ${cap.n}, а не 2`);
        else if (!near(cap.mn[2], T.floor + T.wallBox) || !near(cap.mx[2], T.wallTop))
          errs.push(`клин над карнизной стеной ${Math.round(cap.mn[2])}…${Math.round(cap.mx[2])}, по расчёту ${Math.round(T.floor + T.wallBox)}…${Math.round(T.wallTop)}`);
        // скаты: свес по кругу и конёк на своей отметке
        const r = pick(/^plot\.temp\.slope/);
        if (r.n !== 2) errs.push(`скатов кровли времянки в модели ${r.n}, а не 2`);
        else {
          if (!near(r.mx[2], T.top)) errs.push(`конёк времянки ${Math.round(r.mx[2])}, по расчёту ${Math.round(T.top)}`);
          if (!near(r.mn[2], T.roof.eaveZ - T.roof.pack))
            errs.push(`низ карниза времянки ${Math.round(r.mn[2])}, по расчёту ${Math.round(T.roof.eaveZ - T.roof.pack)}`);
          for (const [name, got, want] of [
            ['западу', T.box.x - r.mn[0], T.roof.over], ['востоку', r.mx[0] - (T.box.x + T.box.w), T.roof.over],
            ['югу', T.box.y - py0(r), T.roof.over], ['северу', py1(r) - (T.box.y + T.box.h), T.roof.over]])
            if (!near(got, want)) errs.push(`свес кровли времянки по ${name} ${Math.round(got)}, по данным ${want}`);
        }
        // Фронтон лежит в теле щипцовой стены, и меряется по ней: он обязан
        // дойти до низа конька, иначе на торце открытый треугольник.
        // Отдельным телом его выпускать нельзя — тогда проём режет только
        // нижнюю коробку, а верх витража остаётся в глухом
        const gb = pick(/^plot\.temp\.w[SN]$/);
        if (gb.n !== 2) errs.push(`щипцовых стен времянки в модели ${gb.n}, а не 2`);
        else if (!near(gb.mx[2], T.top - T.roof.pack, 6))
          errs.push(`верх щипцовых стен времянки ${Math.round(gb.mx[2])}, низ конька ${Math.round(T.top - T.roof.pack)}`);
        // и каждый проём щипцовой стены вычтен из неё целиком, а не по пояс
        for (const o of T.openings) {
          if (o.side !== 'S' && o.side !== 'N') continue;
          const q = pick(new RegExp(`^${o.id}$`));
          if (!q.n) { errs.push(`заполнения ${o.id} в модели нет`); continue; }
          const need = T.floor + (o.sill || 0) + o.hz;
          if (q.mx[2] > gb.mx[2] + 1)
            errs.push(`${o.id} верхом на ${Math.round(q.mx[2])} выше щипцовой стены ${Math.round(gb.mx[2])}`);
          if (Math.abs(q.mx[2] - (need - 20)) > 2)
            errs.push(`${o.id} верхом на ${Math.round(q.mx[2])}, по данным ${need - 20}`);
        }
        // низ — свая ниже промерзания, а не «свая в данных»
        const pl = pick(/^plot\.temp\.pile/);
        if (pl.n !== T.piles.length) errs.push(`свай времянки в модели ${pl.n}, по расчёту ${T.piles.length}`);
        else if (!near(pl.mn[2], T.pileBottom)) errs.push(`низ свай времянки ${Math.round(pl.mn[2])}, по расчёту ${T.pileBottom}`);
        // терраса: настил, стойки и ступени — то, чего у коробки не было
        for (const [re, name, n] of [[/^plot\.temp\.deck$/, 'настила террасы', 1],
        [/^plot\.temp\.post/, 'стоек террасы', T.posts.length],
        [/^plot\.temp\.step/, 'ступеней крыльца', T.steps.length],
        [/^plot\.temp\.rail/, 'ограждения террасы', T.rails.length],
        [/^plot\.temp\.screen/, 'экранов террасы', T.screens.length],
        [/^plot\.temp\.skirt/, 'забирки подполья', T.skirt.length]]) {
          const q = pick(re);
          if (q.n !== n) errs.push(`${name} времянки в модели ${q.n}, по расчёту ${n}`);
        }
      }
    }
  }
}

// Низ — грунт площадки, а под ним ничего: сваи и плита в земле
const grounds = groundGeom(house);
const bottom = Math.min(V ? V.pileBottom : 0, house.levels[0].base - 400,
  ...grounds.map(q => q.bottom));
if (Math.abs(box.mn[2] - bottom) > 5)
  errs.push(`низ модели ${Math.round(box.mn[2])}, ожидалось ${bottom}`);

// В плане модель обязана накрыть кровлю со свесами и достать до края навеса.
// Y в выгрузке отражён, поэтому границы считаются от отражённых координат
const planX = [g.out.x, V ? Math.max(g.out.x + g.out.w, V.canopyBox.x + V.canopyBox.w) : g.out.x + g.out.w];
const pitX = Math.min(...pits.map(p => p.box.x), planX[0]);
if (box.mn[0] > pitX + 5) errs.push(`модель начинается с x ${Math.round(box.mn[0])}, приямок и свес уходят до ${pitX}`);
if (box.mx[0] < planX[1] - 5) errs.push(`модель кончается на x ${Math.round(box.mx[0])}, навес доходит до ${planX[1]}`);

// У каждого элемента, который должен быть виден, тело есть. Потерянное тело
// не меняет в файле ни одной ссылки: состав сходится, а предмета нет.
// IfcRoof — сборка без собственной геометрии, проём — пустота, помещение —
// воздух: движок их и не должен отдавать
const SOLID = ['IFCWALL', 'IFCSLAB', 'IFCDOOR', 'IFCWINDOW', 'IFCSTAIR', 'IFCSTAIRFLIGHT',
  'IFCFURNISHINGELEMENT', 'IFCBUILDINGELEMENTPROXY', 'IFCBEAM', 'IFCPILE', 'IFCCOLUMN',
  'IFCPLATE', 'IFCCHIMNEY', 'IFCRAILING', 'IFCPIPESEGMENT', 'IFCDUCTSEGMENT',
  'IFCCABLECARRIERSEGMENT', 'IFCGEOGRAPHICELEMENT', 'IFCTANK', 'IFCDISTRIBUTIONCHAMBERELEMENT'];
for (const t of SOLID) {
  const code = WebIFC[t];
  if (typeof code !== 'number') { errs.push(`движок не знает типа ${t}`); continue; }
  const all = ids(api.GetLineIDsWithType(model, code));
  const без = all.filter(e => !bodied.has(e));
  if (без.length) errs.push(`${t}: ${без.length} из ${all.length} без геометрии (${без.slice(0, 3).map(nameOf).join(', ')})`);
}

api.CloseModel(model);

// Проверять надо то, что уехало на страницу, а не то, что осталось в out/.
// Байты сверяются, а не пересобираются: два прогона сборки дают одинаковый
// файл только пока это правда, и проверить это дешевле, чем предположить
const deployed = 'site/house.ifc';
if (fs.existsSync(deployed)) {
  const a = fs.readFileSync(file), b = fs.readFileSync(deployed);
  if (!a.equals(b))
    errs.push(`${deployed} отличается от ${file}: на странице лежит не то, что проверено`);
}

const order = [...stat.entries()].sort((a, b) => b[1].tri - a[1].tri);
if (errs.length) {
  console.log(`Модель собралась, но на экране не то (${errs.length}):\n`);
  errs.forEach((e, i) => console.log(`${String(i + 1).padStart(2)}. ${e}`));
  process.exit(1);
}
console.log(`${file} прочитан web-ifc · ${meshes} тел · ${Math.round(order.reduce((s, [, v]) => s + v.tri, 0))} треугольников`);
console.log(`  ${order.map(([k, v]) => `${k} ${Math.round(v.tri)}`).join(' · ')}`);
console.log(`  габарит ${Math.round(box.mn[0])}…${Math.round(box.mx[0])} × ${Math.round(box.mn[1])}…${Math.round(box.mx[1])} × ${Math.round(box.mn[2])}…${Math.round(box.mx[2])}`);
console.log(`  скаты ${Math.round(slope.mn[2])}…${Math.round(slope.mx[2])} — карниз ${g.eaveZ}, конёк ${g.ridgeZ}`);
console.log(`  вся геометрия привязана к этажам, слоёв ${order.length}`);
