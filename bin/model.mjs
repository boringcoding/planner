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
import { roofGeom, verandaGeom, pitGeom } from '../src/roof.mjs';

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
  ['roof', ['IFCROOF', 'IFCCHIMNEY']],
  ['openings', ['IFCDOOR', 'IFCWINDOW']],
  ['stairs', ['IFCSTAIR', 'IFCSTAIRFLIGHT']],
  ['outside', ['IFCPILE', 'IFCCOLUMN', 'IFCPLATE', 'IFCBEAM']],
  ['furniture', ['IFCFURNISHINGELEMENT', 'IFCFURNITURE']],
  ['shafts', ['IFCBUILDINGELEMENTPROXY']],
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
      for (let a = 0; a < 3; a++) {
        if (p[a] < s.mn[a]) s.mn[a] = p[a];
        if (p[a] > s.mx[a]) s.mx[a] = p[a];
        if (slopes.has(e)) {
          if (p[a] < slope.mn[a]) slope.mn[a] = p[a];
          if (p[a] > slope.mx[a]) slope.mx[a] = p[a];
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

const need = ['walls', 'slabs', 'roof', 'openings', 'stairs', 'furniture', 'shafts'];
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

// Низ — подошва сваи веранды либо плита основания
const bottom = Math.min(V ? V.pileBottom : 0, house.levels[0].base - 400);
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
  'IFCPLATE', 'IFCCHIMNEY'];
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
