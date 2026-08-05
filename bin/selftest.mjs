// Проверка проверок. Каждое правило ломается нарочно, и тест требует,
// чтобы оно сработало. Правило, которое ничего не ловит, хуже отсутствующего:
// оно создаёт ощущение проверенности.

import fs from 'node:fs';
import { check } from '../src/rules.mjs';
import { checkSystems } from '../src/sysrules.mjs';

const read = n => JSON.parse(fs.readFileSync(new URL(`../data/${n}`, import.meta.url)));
const house = read('house.json');
const brief = read('brief.json');
const sysd = read('systems.json');
const clone = () => JSON.parse(JSON.stringify(house));
const cloneS = () => JSON.parse(JSON.stringify(sysd));

const sys = (d, id) => d.systems.find(s => s.id === id);
const pt = (d, id) => d.systems.flatMap(s => s.points).find(p => p.id === id);
const kind = (d, sid, k) => sys(d, sid).points.find(p => p.kind === k);

const lvl = (h, id) => h.levels.find(l => l.id === id);
const room = (h, id, name) => lvl(h, id).rooms.find(r => r.name === name);
// ищем по подписи или по символу: подпись у самоочевидных предметов снята
const furn = (h, id, key) => lvl(h, id).furniture.find(f => f.l === key || f.sym === key);
// люк для дров и дверь гаража во двор — они и разводятся по западному фасаду
const hatch = h => lvl(h, 'cokol').windows.find(w => w.kind === 'hatch');
const hatchDoor = h => lvl(h, 'first').windows.find(w => w.kind === 'door' && w.porch);

const CASES = [
  ['помещение за оболочкой', /выходит за внутренний габарит/,
    h => { room(h, 'cokol', 'Котельная').x -= 200; }],

  ['два помещения внахлёст', /наложение/,
    h => { room(h, 'second', 'Кабинет').x -= 400; }],

  ['проём мимо стены', /не лежит в стене/,
    h => { lvl(h, 'cokol').openings[0].x += 600; }],

  ['помещение отрезано от лестницы', /не связано с лестницей/,
    h => { lvl(h, 'cokol').openings.splice(2, 1); }],

  ['дверь на марше', /открывается на марш/,
    h => { delete lvl(h, 'cokol').openings.find(o => o.kind === 'pass').kind; }],

  ['мебель в зоне подхода к проёму', /перекрывает зону подхода/,
    h => { furn(h, 'cokol', 'washerCol').y = 7800; }],

  ['высокий шкаф перед окном', /загораживает окно/,
    h => { furn(h, 'first', 'fridge').x = 5000; }],

  ['марш не влезает в шахту', /площадка \d+ меньше заданной/,
    h => { lvl(h, 'first').stair.tread = 400; }],

  ['слишком крутая лестница', /подъём ступени/,
    h => { lvl(h, 'first').stair.risers = 12; }],

  ['машины впритык', /между машинами/,
    h => { lvl(h, 'first').furniture[1].x = lvl(h, 'first').furniture[0].x + 2000; }],

  ['кровать вплотную к стене', /от кровати/,
    h => { lvl(h, 'second').furniture.find(f => f.sym === 'bed' && f.w === 1800).x = 2600; }],

  ['шахта стояка разъехалась по уровням', /шахта стояка не совпадает/,
    h => { lvl(h, 'second').riser.x += 200; }],

  ['стояк под мебелью', /стоит на шахте стояка/,
    h => { lvl(h, 'cokol').riser.y = 7400; }],

  ['мокрые помещения не друг над другом', /не совпадают по вертикали|не лежит целиком в мокром/,
    h => { room(h, 'second', 'Санузел').x = 1800; }],

  ['габарит разошёлся с заданием', /расходится с заданием/,
    h => { h.shell.h = 13000; }],

  ['гараж мельче задания', /задание требует/,
    h => { room(h, 'first', 'Гараж').h = 5800; }],

  ['подпись помещения наехала на мебель', /наезжает на мебель/,
    h => { room(h, 'cokol', 'Зона отдыха').label = { x: 5800, y: 11600 }; }],

  ['подписи листа наложились', /подписи наезжают/,
    h => { room(h, 'cokol', 'Лестница').label.y = 7300; }],

  ['подпись мебели не влезает в контур', /не влезает под контур/,
    h => { furn(h, 'cokol', 'щит').l = 'вводно-распределительное'; }],

  ['жилая комната без окна', /без естественного света/,
    h => { lvl(h, 'second').windows = lvl(h, 'second').windows.filter(w => w.id !== 'second.g1'); }],

  ['помещение без назначения', /назначение .* не из списка/,
    h => { room(h, 'second', 'Кабинет').use = 'office'; }],

  ['слишком узкое помещение', /по узкой стороне/,
    h => { room(h, 'second', 'Холл').w = 700; }],

  ['из гаража прямо в дом', /нужен тамбур/,
    h => { room(h, 'first', 'Тамбур').tag = 'hall'; }],

  ['стекла больше нормы', /больше предела/,
    h => { lvl(h, 'second').windows.find(w => w.id === 'second.g1').b = 2800; }],

  ['окна этажа вразнобой по верху', /у остальных окон этажа/,
    h => { lvl(h, 'second').windows.find(w => w.id === 'second.g1').sill = 1000; }],

  ['панорамное окно не помечено', /его помечают pano/,
    h => { delete lvl(h, 'second').windows.find(w => w.id === 'second.g7').pano; }],

  ['окно санузла на уровне глаз', /подоконник \d+ ниже/,
    h => { lvl(h, 'second').windows.find(w => w.id === 'second.g6').sill = 900; }],

  ['люк для дров у пола', /люк .* подоконник/,
    h => { lvl(h, 'cokol').windows.find(w => w.kind === 'hatch').sill = 600; }],

  ['люк ведёт в жилое', /не техническое помещение/,
    h => { room(h, 'cokol', 'Дровяник').use = 'live'; }],

  ['вход сразу в прихожую', /нужен тамбур/,
    h => { room(h, 'first', 'Тамбур').tag = 'store'; }],

  ['машину убрали из гаража', /машин в гараже/,
    h => { lvl(h, 'first').furniture = lvl(h, 'first').furniture.filter(f => f.sym !== 'car' || f.x < 3000); }],

  ['гардеробная исчезла', /требует гардеробную/,
    h => { room(h, 'second', 'Гардеробная').tag = 'store'; }],

  ['вход перенесли на улицу', /вход со стороны/,
    h => { lvl(h, 'first').windows.find(w => w.kind === 'entrance').side = 'S'; }],

  ['в цоколе снова погреб', /задание его не предусматривает/,
    h => { room(h, 'cokol', 'Кладовая').name = 'Погреб'; }],

  ['спальня хозяев уехала к улице', /в уличной половине/,
    h => { room(h, 'second', 'Спальня').y = 900; }],

  ['помещение разъехалось со стеной', /не принадлежит ни одному помещению/,
    h => { room(h, 'cokol', 'Мастерская').x += 400; }],

  ['помещение залезло на стену', /налезает на стену/,
    h => { room(h, 'first', 'Гараж').h += 250; }],

  ['подпись помещения наехала на вентшахту', /наезжает на мебель/,
    h => { const l = room(h, 'second', 'Холл').label; l.x = 7100; l.y = 6400; }],

  ['подпись мебели наехала на шахту', /наезжает на шахту/,
    h => { const f = furn(h, 'cokol', 'стеллаж'); f.x = 7000; f.w = 550; f.y = 5700; f.lup = false; }],

  ['мебель встала на вентшахту', /стоит на вентшахте/,
    h => { const f = lvl(h, 'cokol').furniture.find(x => x.l === 'стеллаж');
           f.x = 6900; f.w = 600; f.y = 6100; f.lup = true; }],

  ['вентшахта разъехалась по уровням', /вентшахт\) не совпадает/,
    h => { lvl(h, 'second').ducts[0].x += 300; }],

  ['элемент без идентификатора', /без идентификатора/,
    h => { delete lvl(h, 'first').walls[0].id; }],

  ['идентификатор повторился', /повторяется/,
    h => { lvl(h, 'second').furniture[1].id = lvl(h, 'second').furniture[0].id; }],

  ['проём под потолок не влезает', /не влезает под потолок/,
    h => { lvl(h, 'cokol').openings[0].hz = 2600; }],

  ['окно выше потолка', /выше потолка/,
    h => { lvl(h, 'second').windows[0].sill = 1600; }],

  ['шкаф выше потолка', /не встаёт под потолок/,
    h => { furn(h, 'second', 'wardrobe').hz = 3100; }],

  ['размер в цепочке мимо оси стены', /не совпадает ни с одной осью стены/,
    h => { lvl(h, 'first').dims.x[1] += 300; }],

  ['цепочка не закрывает габарит', /не от 0 до/,
    h => { lvl(h, 'second').dims.y.pop(); }],

  ['мокрое помещение встало над жилой комнатой', /стоит над жилой/,
    h => { room(h, 'first', 'Санузел').tag = 'quiet'; }],

  ['жилая комната с щелью вместо окна', /остекление/,
    h => { lvl(h, 'second').windows.forEach(w => { if (!w.kind) w.hz = 300; }); }],

  ['мебель разрезала пол пополам', /свободный пол разрезан/,
    h => { const f = lvl(h, 'second').furniture.find(x => x.id === 'second.f5');
           f.x = 4350; f.w = 2800; f.y = 2600; f.h = 700; }],

  ['кровля слишком пологая', /уклон кровли/,
    h => { h.roof.pitch = 8; }],

  ['свес съел отступ до границы', /съедает больше трети отступа/,
    h => { h.project.plot.setback = 1500; }],

  ['дымоход у карниза', /поднимается на \d+ мм над скатом/,
    h => { h.roof.pitch = 45; }],

  ['шахта мимо кровли', /стоит вне контура кровли/,
    h => { h.levels.forEach(L => (L.ducts || []).forEach(d => { d.x = 20000; })); }],

  ['кровли нет вовсе', /кровли в модели нет/,
    h => { delete h.roof; }],

  ['снегозадержания нет', /снегозадержания нет/,
    h => { h.roof.snowGuard = false; }],

  ['настил веранды вровень с домом', /вода пойдёт в дом/,
    h => { lvl(h, 'first').veranda.deck = 0; }],

  ['под прогоном навеса не пройти', /под прогоном навеса/,
    h => { lvl(h, 'first').veranda.attach = 2200; }],

  ['ступень вместо порога на веранду', /это ступень, а не порог/,
    h => { lvl(h, 'first').veranda.deck = -200; }],

  ['свая веранды выше промерзания', /промерзание \d+ требует/,
    h => { lvl(h, 'first').veranda.pileDepth = 2000; }],

  ['окно над навесом тонет в сугробе', /окно зимой в сугробе/,
    h => { lvl(h, 'first').veranda.attach = 3400; }],

  ['коньковый прогон опирать не на что', /прогон опирать не на что/,
    h => { h.roof.purlin = [200, 100]; h.roof.post = [150, 150]; }],

  ['навес режет окно второго этажа', /режет окно/,
    h => { lvl(h, 'first').veranda.attach = 4300; }],

  ['подписи кровли наехали', /кровля: подписи наезжают/,
    h => { h.levels.forEach(L => (L.flues || []).forEach(f => { if (f.id.endsWith('k1')) f.y = 2200; })); }],

  ['приямок под дверью гаража', /выход из неё в яму/,
    h => { lvl(h, 'cokol').windows.find(w => w.kind === 'hatch').a = 2400;
           lvl(h, 'cokol').windows.find(w => w.kind === 'hatch').b = 3300; }],

  ['стеллаж отгородил дверь', /не подойти телом/,
    h => { const f = furn(h, 'cokol', 'стеллаж');
           f.x = 4100; f.y = 6000; f.w = 3000; f.h = 500; }],

  ['крыльцо гаража подошло к приямку', /крыльцо .* по фасаду/,
    h => { const d = hatchDoor(h); d.a = 2600; d.b = 3500; }],

  ['у двери гаража нет крыльца', /а крыльца нет/,
    h => { delete hatchDoor(h).porch; }],

  ['ступень крыльца в один шаг', /подъём ступени/,
    h => { hatchDoor(h).porch.steps = 1; }],

  ['площадка уже дверного полотна', /дверь открывается над ступенью/,
    h => { hatchDoor(h).porch.out = 900; }],

  ['крыльцо съело проход вдоль дома', /до границы остаётся/,
    h => { hatchDoor(h).porch.out = 2000; }],

  ['лоток приямка положе нормы', /уклон \d+°/,
    h => { hatch(h).pit.chute = 20; }],

  ['дно приямка вровень с порогом люка', /порог люка выше дна/,
    h => { hatch(h).pit.below = 0; }],

  ['борт крышки заподлицо с отмосткой', /борт крышки/,
    h => { hatch(h).pit.kerb = 0; }],

  ['люк сыплет дрова мимо поленницы', /попадает на поленницу/,
    h => { furn(h, 'cokol', 'дрова').y = 3130; }],

  ['дымоход встал перед окном', /стоит перед окном/,
    h => { h.levels.forEach(L => (L.flues || []).forEach(f => { if (f.id.endsWith('k2')) f.y = 4400; })); }],

  ['марш сузили', /марш \d+ мм уже/,
    h => { h.levels.forEach(L => { if (L.stair) L.stair.h = 1800; }); }],

  ['шаг лестницы неудобен', /лестница неудобна/,
    h => { h.levels.forEach(L => { if (L.stair) L.stair.tread = 320; }); }],

  ['перекрытие давит на марш', /над маршем \d+ мм/,
    h => { lvl(h, 'first').floorToFloor = 4400; }],

  ['отметки уровней разъехались', /отметки разъехались/,
    h => { lvl(h, 'second').base = 3400; }],

  ['ворота разной ширины при равных полях', /ворота не зеркальны/,
    h => { const g = lvl(h, 'first').windows.find(x => x.id === 'first.g1');
           const g2 = lvl(h, 'first').windows.find(x => x.id === 'first.g2');
           g.b += 200; g2.a += 200; }],

  ['окно над площадкой без ограждения', /над полом на отметке .* нужно 900/,
    h => { delete lvl(h, 'first').windows.find(x => x.id === 'first.g11').guard; }],

  ['записи лестницы разъехались по проступи', /лестница: tread .* расходится/,
    h => { lvl(h, 'second').stair.tread = 300; }],

  ['слоёная стенка без огнестойкости', /не помечена противопожарной/,
    h => { const w = lvl(h, 'first').walls.find(x => x.fire);
           delete w.fire; w.h = 125;
           lvl(h, 'first').walls.push({ ...w, id: 'first.w9', y: w.y + 125 }); }],

  ['марш без ограждения', /ограждение марша/,
    h => { delete lvl(h, 'first').stair.rail; }],

  ['створка уже машиноместа', /уже машиноместа/,
    h => { const g = lvl(h, 'first').windows.find(w => w.id === 'first.g1'); g.b = g.a + 2150; }],

  ['гараж мельче машиноместа', /машиноместу нужно/,
    h => { room(h, 'first', 'Гараж').h = 5200; }],

  ['дверь из гаража без огнестойкости', /не помечена противопожарной/,
    h => { delete lvl(h, 'first').openings.find(o => o.fire).fire; }],

  ['стена гаража без огнестойкости', /стена .* не помечена противопожарной/,
    h => { delete lvl(h, 'first').walls.find(w => w.fire).fire; }],

  ['жилая площадь без света', /числится жилым .* света нет/,
    h => { room(h, 'cokol', 'Зона отдыха').use = 'live'; }],

  ['межкомнатная дверь узка', /дверь .* шириной \d+, нужно 800/,
    h => { lvl(h, 'first').openings.find(o => o.id === 'first.o5').w = 600; }],

  ['дверь санузла узка', /дверь .* шириной \d+, нужно 700/,
    h => { lvl(h, 'first').openings.find(o => o.id === 'first.o4').w = 600; }],

  ['входная дверь узка', /входная дверь .* нужно 900/,
    h => { lvl(h, 'first').windows.find(w => w.kind === 'entrance').b -= 200; }],

  ['этаж просел по высоте', /высота в чистоте/,
    h => { lvl(h, 'second').clear = 2300;
           lvl(h, 'second').windows.forEach(w => { if ((w.sill || 0) + w.hz > 2300) w.sill = 2300 - w.hz; }); }],

  ['низкое окно этажа без ограждения', /подоконник \d+ над полом .* нужно 900/,
    h => { delete lvl(h, 'second').windows.find(w => w.pano).guard; }],

  ['настил со ступенями без ограждения', /ограждение веранды/,
    h => { lvl(h, 'first').veranda.rail = 500; }],

  ['отмостку забыли', /отмостки нет/,
    h => { delete h.site.apron; }],

  ['оси окон почти совпали', /разъехались на \d+ — совместить/,
    h => { const w = lvl(h, 'second').windows.find(x => x.id === 'second.g4'); w.a += 200; w.b += 200; }],

  ['ворота почти симметричны', /почти симметрично хуже, чем симметрично/,
    h => { const w = lvl(h, 'first').windows.find(x => x.id === 'first.g2'); w.a += 100; w.b += 100; }],

  ['окно почти по центру помещения', /почти по центру/,
    h => { const w = lvl(h, 'second').windows.find(x => x.id === 'second.g8'); w.a -= 100; w.b -= 100; }],

  ['открытый проём сузили до щели', /проём .* шириной \d+, нужно 800/,
    h => { lvl(h, 'first').openings.find(o => o.kind === 'pass').w = 450; }],

  ['метку garage сняли', /помещения с меткой garage нет/,
    h => { room(h, 'first', 'Гараж').tag = 'workshop'; }],

  ['проём упёрся в примыкающую стену', /простенку нужно/,
    h => { const w = lvl(h, 'first').windows.find(x => x.id === 'first.g4'); w.a = 6900; w.b = 7800; }],

  ['фундамент снова заглушка', /фундамент не задан/,
    h => { delete h.foundation; }],

  ['подушку фундамента съели', /песчаная подготовка .* тоньше/,
    h => { h.foundation.sand = 100; }],

  ['люк на чердак пропал', /на чердак не попасть/,
    h => { delete lvl(h, 'second').atticHatch; }],

  ['люк на чердак лёг поперёк затяжки', /режет затяжку/,
    h => { lvl(h, 'second').atticHatch.y = 5000; }],

  ['дом придвинули к красной линии', /от красной линии, норма/,
    h => { h.project.plot.red = 4000; }],

  ['времянка вылезла из отступа', /времянка в .* от границы/,
    h => { h.project.plot.temp.y = 25000; }],

  ['времянку сделали деревянной', /противопожарный разрыв/,
    h => { h.project.plot.temp.mat = 'wood'; }],

  ['септик подполз к дому', /септик в .* от дома/,
    h => { h.project.plot.septic.x = 11500; }],

  ['септик прижался к границе', /септик в .* от границы/,
    h => { h.project.plot.septic.x = 15200; }],

  ['въездные ворота сузили', /въездные ворота \d+, проезду/,
    h => { h.project.plot.fence.gate.w = 3000; }],

  ['въезд съехал с оси гаража', /ось въездных ворот/,
    h => { h.project.plot.fence.gate.at = 3000; }],

  ['ворота убрали из забора', /нет въездных ворот/,
    h => { delete h.project.plot.fence.gate; }],

  ['калитку унесли от дорожки', /калитка не напротив дорожки/,
    h => { h.project.plot.fence.wicket.at = 12000; }],

  ['дверь времянки развернули в забор', /дверь времянки/,
    h => { h.project.plot.temp.door.side = 'N'; }],
];

// правила разделов: ломается data/systems.json, дом остаётся прежним
const SCASES = [
  ['точка вне помещения', /нет помещения/,
    d => { kind(d, 'eom', 'socket').room = 'first.r9'; }],

  ['розетка съехала за грань', /вылезает за грань/,
    d => { kind(d, 'eom', 'socket').along = 99000; }],

  ['розетка в дверном проёме', /попадает в проём/,
    d => { const p = sys(d, 'eom').points.find(x => x.room === 'first.r5' && x.kind === 'socket');
           p.side = 'S'; p.along = 4650; p.z = 300; }],

  ['розетка под потолком', /розетка на отметке/,
    d => { kind(d, 'eom', 'socket').z = 2400; }],

  ['выключатель посреди стены', /выключатель не у проёма/,
    d => { const p = sys(d, 'eom').points.find(x => x.room === 'second.r7' && x.kind === 'switch');
           p.side = 'N'; p.along = 2500; p.z = 900; }],

  ['выключатель на уровне пола', /выключатель на отметке/,
    d => { kind(d, 'eom', 'switch').z = 300; }],

  ['в мокром помещении обычная розетка', /должна быть IP44/,
    d => { kind(d, 'eom', 'socketIP').kind = 'socket'; }],

  ['розетка в зоне брызг', /до «bath»|до «shower»/,
    d => { const p = sys(d, 'eom').points.find(x => x.room === 'second.r4' && x.kind === 'socketIP'); p.side = 'W'; p.along = 400; }],

  ['радиатор не под окном', /радиатор не под окном/,
    d => { const p = sys(d, 'ov').points.find(x => x.room === 'second.r2' && x.kind === 'radiator');
           p.side = 'W'; p.along = 2000; }],

  ['радиатор шире окна', /длиннее окна/,
    d => { sys(d, 'ov').points.find(x => x.room === 'second.r2' && x.kind === 'radiator').len = 4000; }],

  ['помещение без отопления', /ничем не отапливается/,
    d => { const s = sys(d, 'ov'); s.points = s.points.filter(p => !(p.kind === 'radiator' && p.room === 'second.r1')); }],

  ['радиатор под панорамным окном', /конвектор в полу, а не радиатор/,
    d => { const p = sys(d, 'ov').points.find(x => x.kind === 'convector');
           p.kind = 'radiator'; p.z = 150; }],

  ['конвектор под обычным окном', /хватает радиатора/,
    d => { const p = sys(d, 'ov').points.find(x => x.room === 'second.r1' && x.kind === 'radiator');
           p.kind = 'convector'; p.z = 0; }],

  ['радиатор за мебелью', /радиатор перекрыт мебелью/,
    d => { const p = sys(d, 'ov').points.find(x => x.room === 'first.r5' && x.kind === 'radiator');
           p.side = 'N'; p.along = 4000; p.len = 1400; }],

  ['помещение осталось без света', /без светильника/,
    d => { const s = sys(d, 'eom'); s.points = s.points.filter(p => !(p.kind === 'light' && p.room === 'second.r7')); }],

  ['санузел без вытяжки', /без вытяжки/,
    d => { const s = sys(d, 'ov'); s.points = s.points.filter(p => !(p.kind === 'exhaust' && p.room === 'second.r4')); }],

  ['спальня без притока', /без притока/,
    d => { const s = sys(d, 'ov'); s.points = s.points.filter(p => !(p.kind === 'supply' && p.room === 'second.r7')); }],

  ['помещение без извещателя', /без пожарного извещателя/,
    d => { const s = sys(d, 'ss'); s.points = s.points.filter(p => !(p.kind === 'smoke' && p.room === 'first.r1')); }],

  ['прибор без подводки', /без подводки/,
    d => { const s = sys(d, 'vk'); s.points = s.points.filter(p => p.host !== 'second.f11'); }],

  ['стояк системы вне стены', /не попадает ни в стену/,
    d => { sys(d, 'ss').vertical = { x: 1200, y: 3000 }; }],

  ['две точки в одном месте', /стоят ближе/,
    d => { const s = sys(d, 'eom').points.filter(p => p.room === 'second.r7' && p.kind === 'socket');
           s[1].side = s[0].side; s[1].along = s[0].along + 100; s[1].z = s[0].z; }],

  ['точка на подписи помещения', /попадает в подпись/,
    d => { const p = kind(d, 'ss', 'smoke'); const r = house.levels[0].rooms.find(x => x.id === p.room);
           p.x = r.label.x; p.y = r.label.y; }],

  ['идентификатор точки повторился', /повторяется/,
    d => { const s = sys(d, 'eom').points; s[1].id = s[0].id; }],

  ['розетка за радиатором', /стоит за радиатором/,
    d => { const r = sys(d, 'ov').points.find(x => x.kind === 'radiator' && x.room === 'first.r5');
           const p = sys(d, 'eom').points.find(x => x.room === 'first.r5' && x.z === 300);
           p.side = r.side; p.along = r.along; }],

  ['санузел без тёплого пола', /без контура тёплого пола/,
    d => { const s = sys(d, 'ov'); s.points = s.points.filter(p => !(p.kind === 'ufh' && p.room === 'second.r4')); }],

  ['пол по грунту остыл', /пол по грунту без контура/,
    d => { const s = sys(d, 'ov'); s.points = s.points.filter(p => !(p.kind === 'ufh' && p.room === 'cokol.r8')); }],

  ['ввод воды выше промерзания', /выше промерзания/,
    d => { sys(d, 'vk').feeds.find(f => f.kind === 'water').depth = 1200; }],

  ['выпуск канализации без уклона', /самотёку нужно 2/,
    d => { sys(d, 'vk').feeds.find(f => f.kind === 'sewer').slope = 1; }],

  ['дом остался без выпуска', /нет выпуска канализации/,
    d => { sys(d, 'vk').feeds = sys(d, 'vk').feeds.filter(f => f.kind !== 'sewer'); }],

  ['контур длиннее нормы', /длиннее 120/,
    d => { const s = sys(d, 'ov');
           s.points = s.points.filter(p => p.id !== 'ov.p39');
           const p = s.points.find(x => x.id === 'ov.p38'); p.h = 6000; }],

  ['на развёртке подписи некуда встать', /некуда встать|наезжают/,
    d => { const s = sys(d, 'eom'); const p = s.points.find(x => x.room === 'cokol.r7' && x.side);
           for (let i = 0; i < 24; i++)
             s.points.push({ ...p, id: `eom.x${i}`, side: 'N', along: 600 + (i % 6) * 400, z: 300 + Math.floor(i / 6) * 400 }); }],

  ['кабель лёг вплотную к воде', /идут параллельно/,
    d => { sys(d, 'eom').feeds.find(f => f.id === 'eom.in2').enter.at = 20800; }],

  ['сброс остался без напора и уклона', /самотёку нужно 2/,
    d => { delete sys(d, 'vk').feeds.find(f => f.id === 'vk.rel1').pressure; }],

  ['самотёк пришёл в септик слишком глубоко', /глубже 2000/,
    d => { sys(d, 'vk').feeds.find(f => f.id === 'vk.out1').depth = 1900; }],

  ['труба нырнула под времянку', /проходит под времянкой/,
    d => { sys(d, 'vk').feeds.find(f => f.id === 'vk.out2').exit.side = 'W'; }]
];

const base = check(house, brief);
if (base.length) {
  console.log('Исходные данные уже нарушают правила — сначала почини их:\n');
  base.forEach((e, i) => console.log(`${String(i + 1).padStart(2)}. ${e}`));
  process.exit(1);
}

let bad = 0;
for (const [name, expect, mutate] of CASES) {
  const h = clone();
  mutate(h);
  const errs = check(h, brief);
  const hit = errs.some(e => expect.test(e));
  if (!hit) {
    bad++;
    console.log(`НЕ ПОЙМАНО: ${name}`);
    console.log(`   ждали: ${expect}`);
    console.log(`   получили: ${errs.length ? errs.slice(0, 3).join(' | ') : 'ни одного нарушения'}\n`);
  }
}

const sbase = checkSystems(house, sysd);
if (sbase.length) {
  console.log('Разделы уже нарушают правила — сначала почини их:\n');
  sbase.forEach((e, i) => console.log(`${String(i + 1).padStart(2)}. ${e}`));
  process.exit(1);
}

for (const [name, expect, mutate] of SCASES) {
  const d = cloneS();
  mutate(d);
  const errs = checkSystems(house, d);
  if (!errs.some(e => expect.test(e))) {
    bad++;
    console.log(`НЕ ПОЙМАНО: ${name}`);
    console.log(`   ждали: ${expect}`);
    console.log(`   получили: ${errs.length ? errs.slice(0, 3).join(' | ') : 'ни одного нарушения'}\n`);
  }
}

const all = CASES.length + SCASES.length;
if (bad) {
  console.log(`Правил, которые не сработали: ${bad} из ${all}.`);
  process.exit(1);
}
console.log(`Все ${all} правил ловят свой дефект: ${CASES.length} по плану, ${SCASES.length} по разделам.`);
