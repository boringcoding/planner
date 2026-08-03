// Выгрузка модели в IFC + структурная проверка того, что выгрузилось.
//
// Проверка здесь не формальность: файл, который «вроде записался», открывается
// в чужой программе как пустая площадка, и понять почему — дороже, чем сразу
// пересчитать ссылки и количества.

import fs from 'node:fs';
import { ifc } from '../src/ifc.mjs';

const read = n => JSON.parse(fs.readFileSync(new URL(`../data/${n}`, import.meta.url)));
const house = read('house.json');
const systems = read('systems.json').systems;

const text = ifc(house, systems, { name: 'house.ifc' });
fs.mkdirSync('out', { recursive: true });
fs.writeFileSync('out/house.ifc', text);

// ---- разбор собственного файла ------------------------------------------
const body = text.slice(text.indexOf('DATA;') + 5, text.lastIndexOf('ENDSEC;'));
const ents = new Map();
for (const m of body.matchAll(/#(\d+)=([A-Z0-9]+)\((.*)\);/g))
  ents.set(+m[1], { type: m[2], args: m[3] });

const errs = [];
const count = t => [...ents.values()].filter(e => e.type === t).length;

// 1. все ссылки разрешаются
for (const [id, e] of ents)
  for (const r of e.args.matchAll(/#(\d+)/g))
    if (!ents.has(+r[1])) errs.push(`#${id} (${e.type}) ссылается на несуществующий #${r[1]}`);

// 2. идентификаторы уникальны
const guids = [...ents.values()].filter(e => /^IFC/.test(e.type))
  .map(e => (e.args.match(/^'([0-9A-Za-z_$]{22})'/) || [])[1]).filter(Boolean);
if (new Set(guids).size !== guids.length) errs.push('GlobalId повторяется');

// 3. количества совпадают с моделью
const rooms = house.levels.reduce((s, L) => s + L.rooms.length, 0);
const walls = house.levels.reduce((s, L) => s + L.walls.length, 0) + 4 * house.levels.length;
const opens = house.levels.reduce((s, L) => s + (L.openings || []).length + (L.windows || []).length, 0);
const furn = house.levels.reduce((s, L) => s + (L.furniture || []).filter(f => f.hz).length, 0);
const points = systems.reduce((s, x) => s + x.points.length, 0);

const want = [
  ['IFCSPACE', rooms], ['IFCWALLSTANDARDCASE', walls], ['IFCOPENINGELEMENT', opens],
  ['IFCFURNISHINGELEMENT', furn], ['IFCBUILDINGSTOREY', house.levels.length],
  ['IFCSYSTEM', systems.length]
];
for (const [t, n] of want)
  if (count(t) !== n) errs.push(`${t}: ${count(t)}, в модели ${n}`);

// 4. каждый проём вырезан из стены, каждое заполнение стоит в проёме
const voids = count('IFCRELVOIDSELEMENT');
if (voids !== opens) errs.push(`проёмов ${opens}, вычитаний из стен ${voids}`);
const fills = count('IFCRELFILLSELEMENT');
const leaves = count('IFCDOOR') + count('IFCWINDOW');
if (fills !== leaves) errs.push(`заполнений ${leaves}, связей с проёмами ${fills}`);

// 5. точки разделов на месте
const mep = ['IFCOUTLET', 'IFCLAMP', 'IFCSWITCHINGDEVICE', 'IFCVALVE', 'IFCWASTETERMINAL',
  'IFCSPACEHEATER', 'IFCAIRTERMINAL', 'IFCCOMMUNICATIONSAPPLIANCE', 'IFCSENSOR']
  .reduce((s, t) => s + count(t), 0);
if (mep !== points) errs.push(`точек разделов ${points}, элементов инженерии ${mep}`);

const kb = (text.length / 1024).toFixed(0);
if (errs.length) {
  console.log(`Файл записан, но не сходится (${errs.length}):\n`);
  errs.forEach((e, i) => console.log(`${String(i + 1).padStart(2)}. ${e}`));
  process.exit(1);
}
console.log(`out/house.ifc · ${ents.size} записей · ${kb} КБ`);
console.log(`  помещений ${rooms} · стен ${walls} · проёмов ${opens} · мебели ${furn} · инженерии ${points}`);
