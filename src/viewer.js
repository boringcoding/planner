// Смотрелка IFC на странице. Файл читает web-ifc — тот же движок, что стоит
// за IFC.js: это принципиально, потому что на экране должна быть выгрузка,
// а не наша же геометрия, нарисованная второй раз. Если модель в браузере
// собралась, значит в файле лежит то, что мы думаем.
//
// Рисуется вручную на WebGL2: смотрелке нужны треугольники, орбита и
// выключатели слоёв — три библиотеки ради этого не нужны.
//
// Инструменты повешены на то, что уже есть в буферах, а не на новую
// геометрию: срез и изоляция помещения — это клип-бокс в шейдере,
// выбор элемента — номер сущности, записанный атрибутом в каждую вершину.

(() => {
  // Типы берутся по имени из самого движка, а не числами: коды IFC-типов
  // у web-ifc меняются от версии к версии, и зашитое число однажды молча
  // перестанет совпадать ни с чем
  const TYPE_GROUP = [
    ['walls', 'Стены', ['IFCWALL', 'IFCWALLSTANDARDCASE']],
    ['slabs', 'Перекрытия', ['IFCSLAB']],
    // водосток без раздела — кровельный: трубы разделов заберёт группа системы
    ['roof', 'Кровля', ['IFCROOF', 'IFCCHIMNEY', 'IFCPIPESEGMENT']],
    ['openings', 'Двери и окна', ['IFCDOOR', 'IFCWINDOW']],
    ['stairs', 'Лестница', ['IFCSTAIR', 'IFCSTAIRFLIGHT']],
    ['outside', 'Веранда и крыльцо', ['IFCPILE', 'IFCCOLUMN', 'IFCPLATE', 'IFCBEAM', 'IFCRAILING']],
    ['furniture', 'Мебель', ['IFCFURNISHINGELEMENT', 'IFCFURNITURE']],
    ['shafts', 'Шахты', ['IFCBUILDINGELEMENTPROXY']],
    ['site', 'Участок', ['IFCGEOGRAPHICELEMENT']],
    ['spaces', 'Помещения', ['IFCSPACE']]
  ];
  const COLOR = {
    walls: [0.82, 0.81, 0.78], slabs: [0.70, 0.69, 0.66], roof: [0.44, 0.45, 0.47],
    openings: [0.42, 0.55, 0.63], stairs: [0.60, 0.59, 0.56], outside: [0.66, 0.62, 0.55],
    furniture: [0.75, 0.74, 0.70], shafts: [0.52, 0.51, 0.49],
    site: [0.56, 0.58, 0.48],
    spaces: [0.90, 0.93, 0.90], eom: [0.66, 0.46, 0.16], vk: [0.18, 0.42, 0.55],
    ov: [0.70, 0.25, 0.18], ss: [0.25, 0.47, 0.35]
  };
  const SYS_TITLE = { eom: 'ЭОМ', vk: 'ВК', ov: 'ОВ', ss: 'СС' };
  const DEFAULT_OFF = new Set(['spaces']);
  // полупрозрачный режим гасит оболочку, чтобы видеть начинку
  const SHELL = new Set(['walls', 'slabs', 'roof']);

  const VS = `#version 300 es
  in vec3 p; in vec3 n; in float e;
  uniform mat4 mvp; uniform mat3 nm;
  out vec3 vn; out vec3 vw; flat out float ve;
  void main(){ vn = normalize(nm * n); vw = p; ve = e; gl_Position = mvp * vec4(p,1.0); }`;
  const FS = `#version 300 es
  precision highp float;
  in vec3 vn; in vec3 vw; flat in float ve;
  out vec4 c;
  uniform vec3 col; uniform float alpha;
  uniform vec3 clipMin; uniform vec3 clipMax;
  uniform float sel; uniform float pickPass;
  void main(){
    if (any(lessThan(vw, clipMin)) || any(greaterThan(vw, clipMax))) discard;
    if (pickPass > 0.5) {
      float id = ve;
      c = vec4(mod(id, 256.0) / 255.0, mod(floor(id / 256.0), 256.0) / 255.0,
               floor(id / 65536.0) / 255.0, 1.0);
      return;
    }
    vec3 n = normalize(vn);
    float d = 0.42 + 0.46*max(dot(n, normalize(vec3(0.45,0.85,0.35))),0.0)
                   + 0.16*max(dot(n, normalize(vec3(-0.5,0.3,-0.7))),0.0);
    vec3 base = col*d;
    if (sel >= 0.0 && abs(ve - sel) < 0.5) base = mix(base, vec3(0.95,0.52,0.12), 0.55);
    c = vec4(base, alpha);
  }`;

  // матрицы по столбцам, как их ждёт WebGL: перемножение по строкам даёт
  // транспонированный результат, и модель просто не попадает в кадр
  const mul = (a, b) => {
    const o = new Float32Array(16);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++)
      o[i * 4 + j] = a[j] * b[i * 4] + a[4 + j] * b[i * 4 + 1] + a[8 + j] * b[i * 4 + 2] + a[12 + j] * b[i * 4 + 3];
    return o;
  };
  const persp = (fov, asp, n, f) => {
    const t = 1 / Math.tan(fov / 2);
    return new Float32Array([t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, 2 * f * n / (n - f), 0]);
  };
  const lookAt = (e, c, u) => {
    const z = norm([e[0] - c[0], e[1] - c[1], e[2] - c[2]]);
    const x = norm(cross(u, z)), y = cross(z, x);
    return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0,
      -dot(x, e), -dot(y, e), -dot(z, e), 1]);
  };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const norm = a => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

  async function load(script) {
    return new Promise((ok, no) => {
      const s = document.createElement('script');
      s.src = script; s.onload = ok; s.onerror = () => no(new Error('не загрузился ' + script));
      document.head.appendChild(s);
    });
  }

  window.startViewer = async function (root) {
    const canvas = root.querySelector('canvas');
    const status = root.querySelector('.v-status');
    const panel = root.querySelector('.v-panel');
    const say = t => { status.textContent = t; };

    try {
      say('загружаю движок…');
      await load('web-ifc-api-iife.js');
      const api = new WebIFC.IfcAPI();
      api.SetWasmPath('./');
      await api.Init();

      say('читаю house.ifc…');
      const buf = await (await fetch('house.ifc')).arrayBuffer();
      const model = api.OpenModel(new Uint8Array(buf));

      // элемент -> этаж и элемент -> раздел: связи берём из файла, а не
      // угадываем по типу, иначе розетка данных уедет в электрику
      const storeyOf = new Map(), sysOf = new Map();
      const storeys = [];
      for (const sid of ids(api.GetLineIDsWithType(model, WebIFC.IFCBUILDINGSTOREY))) {
        const st = api.GetLine(model, sid);
        storeys.push({ id: sid, name: (st.Name && st.Name.value) || String(sid) });
      }
      for (const rid of ids(api.GetLineIDsWithType(model, WebIFC.IFCRELCONTAINEDINSPATIALSTRUCTURE))) {
        const r = api.GetLine(model, rid);
        const s = r.RelatingStructure.value;
        for (const e of r.RelatedElements) storeyOf.set(e.value, s);
      }
      // Сборка (IfcRoof) стоит на этаже, а геометрию несут её части — скаты.
      // Часть в пространственной структуре не лежит и не должна: по IFC она
      // принадлежит сборке. Раньше смотрелка искала этаж только по прямому
      // вхождению, части получали этаж 0, и фильтр уровней прятал их всегда —
      // крыша была в файле и не была на экране. Этаж наследуется от родителя
      const parentOf = new Map();
      for (const rid of ids(api.GetLineIDsWithType(model, WebIFC.IFCRELAGGREGATES))) {
        const r = api.GetLine(model, rid);
        const owner = r.RelatingObject.value;
        if (storeys.some(s => s.id === owner))
          for (const e of r.RelatedObjects) storeyOf.set(e.value, owner);
        else
          for (const e of r.RelatedObjects) parentOf.set(e.value, owner);
      }
      const storeyUp = (e, depth = 0) => {
        if (storeyOf.has(e)) return storeyOf.get(e);
        const p = parentOf.get(e);
        return p == null || depth > 8 ? null : storeyUp(p, depth + 1);
      };
      for (const e of parentOf.keys()) {
        const s = storeyUp(e);
        if (s != null) storeyOf.set(e, s);
      }
      for (const rid of ids(api.GetLineIDsWithType(model, WebIFC.IFCRELASSIGNSTOGROUP))) {
        const r = api.GetLine(model, rid);
        const g = api.GetLine(model, r.RelatingGroup.value);
        const t = ((g.Name && g.Name.value) || '').split(' · ')[0].toLowerCase();
        const key = { 'эом': 'eom', 'вк': 'vk', 'ов': 'ov', 'сс': 'ss' }[t];
        if (!key) continue;
        for (const e of r.RelatedObjects) sysOf.set(e.value, key);
      }

      const typeKey = new Map();
      for (const [key, , names] of TYPE_GROUP)
        for (const name of names) {
          const code = WebIFC[name];
          if (typeof code !== 'number') continue;
          for (const e of ids(api.GetLineIDsWithType(model, code))) typeKey.set(e, key);
        }
      // скат кровли — тоже IfcSlab, но выключать его надо вместе с кровлей,
      // а не вместе с перекрытиями: части сборки идут в слой сборки
      for (const rid of ids(api.GetLineIDsWithType(model, WebIFC.IFCROOF)))
        for (const [child, owner] of parentOf) if (owner === rid) typeKey.set(child, 'roof');
      // балка бывает и мауэрлатом, и обвязкой веранды: по типу их не различить,
      // различает метка элемента — она же идентификатор из data/house.json
      for (const e of ids(api.GetLineIDsWithType(model, WebIFC.IFCBEAM))) {
        const t = api.GetLine(model, e).Tag;
        if (t && String(t.value).startsWith('roof.')) typeKey.set(e, 'roof');
      }
      // ограждение бывает и на веранде, и на марше: различает метка
      for (const e of ids(api.GetLineIDsWithType(model, WebIFC.IFCRAILING))) {
        const t = api.GetLine(model, e).Tag;
        if (t && String(t.value).endsWith('.srail')) typeKey.set(e, 'stairs');
      }

      say('собираю геометрию…');
      const buckets = new Map();          // "группа|этаж" -> {pos,nrm,eid,idx}
      const bucket = k => {
        if (!buckets.has(k)) buckets.set(k, { pos: [], nrm: [], eid: [], idx: [] });
        return buckets.get(k);
      };
      let tri = 0;
      const seen = new Set();
      api.StreamAllMeshes(model, mesh => {
        const eid = mesh.expressID;
        const group = sysOf.get(eid) || typeKey.get(eid) || 'other';
        const st = storeyOf.get(eid);
        const b = bucket(`${group}|${st || 0}`);
        seen.add(eid);
        for (let i = 0; i < mesh.geometries.size(); i++) {
          const pg = mesh.geometries.get(i);
          const g = api.GetGeometry(model, pg.geometryExpressID);
          const v = api.GetVertexArray(g.GetVertexData(), g.GetVertexDataSize());
          const ix = api.GetIndexArray(g.GetIndexData(), g.GetIndexDataSize());
          const m = pg.flatTransformation, base = b.pos.length / 3;
          for (let k = 0; k < v.length; k += 6) {
            const x = v[k], y = v[k + 1], z = v[k + 2];
            b.pos.push(m[0] * x + m[4] * y + m[8] * z + m[12],
              m[1] * x + m[5] * y + m[9] * z + m[13],
              m[2] * x + m[6] * y + m[10] * z + m[14]);
            const nx = v[k + 3], ny = v[k + 4], nz = v[k + 5];
            b.nrm.push(m[0] * nx + m[4] * ny + m[8] * nz,
              m[1] * nx + m[5] * ny + m[9] * nz,
              m[2] * nx + m[6] * ny + m[10] * nz);
            b.eid.push(eid);
          }
          for (let k = 0; k < ix.length; k++) b.idx.push(base + ix[k]);
          tri += ix.length / 3;
        }
      });

      // Габариты помещений — для изоляции клип-боксом. Движок меши IfcSpace
      // не отдаёт вовсе, поэтому габарит читается из самого файла: профиль
      // призмы и цепочка посадок. Посадки помещений в этой выгрузке без
      // поворотов, и разворот цепочки — простое сложение
      const spaceBox = new Map();
      const originOf = pl => {
        let x = 0, y = 0, z = 0, cur = pl;
        for (let d = 0; cur && d < 8; d++) {
          const rel = cur.RelativePlacement && api.GetLine(model, cur.RelativePlacement.value);
          const pt = rel && rel.Location && api.GetLine(model, rel.Location.value);
          if (pt && pt.Coordinates) {
            x += pt.Coordinates[0].value; y += pt.Coordinates[1].value;
            z += (pt.Coordinates[2] && pt.Coordinates[2].value) || 0;
          }
          cur = cur.PlacementRelTo && cur.PlacementRelTo.value
            ? api.GetLine(model, cur.PlacementRelTo.value) : null;
        }
        return [x, y, z];
      };
      for (const e of ids(api.GetLineIDsWithType(model, WebIFC.IFCSPACE))) {
        try {
          const sp = api.GetLine(model, e);
          // мешей у помещения нет, и в общую карту имён оно не попало
          seen.add(e);
          const [ox, oy, oz] = originOf(api.GetLine(model, sp.ObjectPlacement.value));
          const shape = api.GetLine(model, sp.Representation.value);
          const rep0 = api.GetLine(model, shape.Representations[0].value);
          const solid = api.GetLine(model, rep0.Items[0].value);
          const prof = api.GetLine(model, solid.SweptArea.value);
          const w = prof.XDim.value, h = prof.YDim.value, dz = solid.Depth.value;
          // мм и Z-вверх файла -> метры и Y-вверх движка (план Y уходит в -Z)
          const mm = 1 / 1000;
          spaceBox.set(e, {
            mn: [(ox - w / 2) * mm, oz * mm, -(oy + h / 2) * mm],
            mx: [(ox + w / 2) * mm, (oz + dz) * mm, -(oy - h / 2) * mm]
          });
        } catch { /* помещение без призмы — не изолируем */ }
      }

      // имена и метки — пока модель открыта: после CloseModel строк не достать
      const info = new Map();
      for (const e of seen) {
        try {
          const l = api.GetLine(model, e);
          info.set(e, {
            name: (l.Name && l.Name.value) || (l.LongName && l.LongName.value) || '',
            long: (l.LongName && l.LongName.value) || '',
            tag: (l.Tag && l.Tag.value) || ''
          });
        } catch { /* строка без имени — не повод падать */ }
      }
      const storeyName = new Map(storeys.map(s => [s.id, s.name]));

      // ---- WebGL ----------------------------------------------------------
      const gl = canvas.getContext('webgl2', { antialias: true, alpha: false });
      if (!gl) { say('браузер не умеет WebGL2 — 3D не покажу'); return; }
      const prog = link(gl, VS, FS);
      const U = n => gl.getUniformLocation(prog, n);
      const uMvp = U('mvp'), uNm = U('nm'), uCol = U('col'), uAlpha = U('alpha');
      const uClipMin = U('clipMin'), uClipMax = U('clipMax');
      const uSel = U('sel'), uPick = U('pickPass');

      const parts = [];
      const box = { mn: [1e9, 1e9, 1e9], mx: [-1e9, -1e9, -1e9] };
      for (const [key, b] of buckets) {
        if (!b.idx.length) continue;
        const vao = gl.createVertexArray();
        gl.bindVertexArray(vao);
        attrib(gl, prog, 'p', new Float32Array(b.pos), 3);
        attrib(gl, prog, 'n', new Float32Array(b.nrm), 3);
        attrib(gl, prog, 'e', new Float32Array(b.eid), 1);
        const eb = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, eb);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(b.idx), gl.STATIC_DRAW);
        gl.bindVertexArray(null);
        const [group, storey] = key.split('|');
        parts.push({ group, storey: +storey, vao, count: b.idx.length });
        for (let i = 0; i < b.pos.length; i += 3)
          for (let a = 0; a < 3; a++) {
            const v = b.pos[i + a];
            if (v < box.mn[a]) box.mn[a] = v;
            if (v > box.mx[a]) box.mx[a] = v;
          }
      }
      const centre0 = box.mn.map((v, i) => (v + box.mx[i]) / 2);
      const span = Math.max(...box.mx.map((v, i) => v - box.mn[i]));
      let centre = [...centre0];

      // ---- состояние вида -------------------------------------------------
      const on = new Set();
      const groups = [...new Set(parts.map(p => p.group))];
      const label = g => (TYPE_GROUP.find(t => t[0] === g) || [])[1] || SYS_TITLE[g] || g;
      for (const g of groups) if (!DEFAULT_OFF.has(g)) on.add(g);
      const levelOn = new Set(storeys.map(s => s.id));
      const pad = span * 0.01;
      const clip = {
        mn: box.mn.map(v => v - pad), mx: box.mx.map(v => v + pad),
        topFull: box.mx[1] + pad, top: box.mx[1] + pad
      };
      let ghost = false;                  // полупрозрачная оболочка
      let sel = -1;                       // подсвеченный элемент
      const baseline = () => `${(buf.byteLength / 1024).toFixed(0)} КБ · ${tri.toLocaleString('ru')} треугольников · тяните мышью, колесо — приблизить, клик — что это`;

      panel.innerHTML = '';
      const chipRows = [];
      const chips = (title, items, set) => {
        const wrap = document.createElement('div');
        wrap.className = 'v-row';
        wrap.innerHTML = `<span class="v-title">${title}</span>`;
        const btns = [];
        for (const it of items) {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'v-chip' + (set.has(it[0]) ? ' on' : '');
          b.textContent = it[1];
          if (it[2]) b.style.setProperty('--c', it[2]);
          // alt-клик — solo: показать только этот слой; второй alt-клик
          // возвращает как было
          b.onclick = ev => {
            if (ev.altKey) {
              if (set.size === 1 && set.has(it[0]) && wrap._snap) {
                set.clear(); for (const k of wrap._snap) set.add(k); wrap._snap = null;
              } else {
                // снапшот делается один раз при входе в solo: переключение
                // между solo-слоями не должно затирать исходный набор
                if (!wrap._snap) wrap._snap = [...set];
                set.clear(); set.add(it[0]);
              }
            } else { set.has(it[0]) ? set.delete(it[0]) : set.add(it[0]); wrap._snap = null; }
            for (let i = 0; i < items.length; i++)
              btns[i].classList.toggle('on', set.has(items[i][0]));
            draw();
          };
          btns.push(b);
          wrap.appendChild(b);
        }
        panel.appendChild(wrap);
        chipRows.push(wrap);
        return wrap;
      };
      // Порядок фишек задан руками, и слой, забытый в этом списке, рисуется,
      // но выключить его нечем: кровля так и приехала на страницу без фишки.
      // Поэтому список только сортирует, а не решает, чему быть
      const order = ['walls', 'slabs', 'roof', 'openings', 'stairs', 'outside',
        'furniture', 'shafts', 'site', 'spaces', 'eom', 'vk', 'ov', 'ss'];
      const sorted = [...groups].sort((a, b) =>
        (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
      chips('слои', sorted.map(g => [g, label(g),
        `rgb(${(COLOR[g] || [0.5, 0.5, 0.5]).map(v => Math.round(v * 255)).join(',')})`]), on);
      chips('уровни', storeys.map(s => [s.id, s.name]), levelOn);

      // ---- камера ---------------------------------------------------------
      let yaw = -0.7, pitch = 0.62, dist = span * 1.5;
      const HOME = { yaw: -0.7, pitch: 0.62 };
      // соответствие выверено по TrueNorth выгрузки: план рисуется Y вниз,
      // экспорт отражает Y, движок отдаёт Y вверх — угол здесь не выводится
      // в уме, а проверяется скриншотом фасада с воротами (юго-запад)
      const VIEWS = [
        ['изометрия', HOME], ['план', { yaw: 0, pitch: 1.42 }],
        ['юз', { yaw: Math.PI, pitch: 0.06 }], ['юв', { yaw: Math.PI / 2, pitch: 0.06 }],
        ['св', { yaw: 0, pitch: 0.06 }], ['сз', { yaw: -Math.PI / 2, pitch: 0.06 }]
      ];
      {
        const wrap = document.createElement('div');
        wrap.className = 'v-row';
        wrap.innerHTML = `<span class="v-title">камера</span>`;
        for (const [name, v] of VIEWS) {
          const b = document.createElement('button');
          b.type = 'button'; b.className = 'v-chip'; b.textContent = name;
          b.onclick = () => { yaw = v.yaw; pitch = v.pitch; dist = span * 1.5; draw(); };
          wrap.appendChild(b);
        }
        // полупрозрачная оболочка: стены, перекрытия и кровля пропускают
        // взгляд к начинке — трассам, мебели, лестнице
        const ghostBtn = document.createElement('button');
        ghostBtn.type = 'button'; ghostBtn.className = 'v-chip'; ghostBtn.textContent = 'оболочка 40%';
        ghostBtn.onclick = () => { ghost = !ghost; ghostBtn.classList.toggle('on', ghost); draw(); };
        wrap.appendChild(ghostBtn);
        panel.appendChild(wrap);
      }
      // ---- срез и помещение ----------------------------------------------
      {
        const wrap = document.createElement('div');
        wrap.className = 'v-row';
        wrap.innerHTML = `<span class="v-title">срез</span>`;
        const range = document.createElement('input');
        range.type = 'range'; range.min = '0'; range.max = '1000'; range.value = '1000';
        range.className = 'v-range';
        range.oninput = () => {
          const t = +range.value / 1000;
          clip.top = clip.mn[1] + (clip.topFull - clip.mn[1]) * t;
          draw();
        };
        wrap.appendChild(range);

        const sel2 = document.createElement('select');
        sel2.className = 'v-select';
        const opt0 = document.createElement('option');
        opt0.value = ''; opt0.textContent = 'весь дом';
        sel2.appendChild(opt0);
        const spaceList = [...spaceBox.keys()].map(e => ({
          e, i: info.get(e) || {}, st: storeyName.get(storeyOf.get(e)) || ''
        })).sort((a, b) => (a.st + a.i.name).localeCompare(b.st + b.i.name, 'ru'));
        for (const s of spaceList) {
          const o = document.createElement('option');
          o.value = String(s.e);
          o.textContent = `${s.i.long || s.i.name || s.e} · ${s.st.toLowerCase()}`;
          sel2.appendChild(o);
        }
        // изоляция помещения — клип-бокс по его габариту с припуском на стены:
        // видно стены, проёмы, мебель и точки разделов именно этого помещения
        sel2.onchange = () => {
          if (!sel2.value) {
            clip.mn = box.mn.map(v => v - pad); clip.mx = box.mx.map(v => v + pad);
            clip.topFull = box.mx[1] + pad; clip.top = clip.topFull;
            centre = [...centre0]; dist = span * 1.5;
          } else {
            const sb = spaceBox.get(+sel2.value), m = span * 0.02;
            clip.mn = sb.mn.map(v => v - m); clip.mx = sb.mx.map(v => v + m);
            clip.topFull = sb.mx[1] + m; clip.top = clip.topFull;
            centre = sb.mn.map((v, i) => (v + sb.mx[i]) / 2);
            dist = Math.max(...sb.mx.map((v, i) => v - sb.mn[i])) * 2.2;
          }
          range.value = '1000';
          draw();
        };
        wrap.appendChild(sel2);
        panel.appendChild(wrap);
      }

      const drag = { on: false, x: 0, y: 0, moved: 0 };
      canvas.addEventListener('pointerdown', e => {
        drag.on = true; drag.x = e.clientX; drag.y = e.clientY; drag.moved = 0;
        canvas.setPointerCapture(e.pointerId);
      });
      canvas.addEventListener('pointerup', e => {
        drag.on = false; canvas.releasePointerCapture(e.pointerId);
        if (drag.moved < 5) pick(e);
      });
      canvas.addEventListener('pointermove', e => {
        if (!drag.on) return;
        drag.moved += Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y);
        yaw -= (e.clientX - drag.x) * 0.008;
        pitch = Math.max(-1.45, Math.min(1.45, pitch + (e.clientY - drag.y) * 0.008));
        drag.x = e.clientX; drag.y = e.clientY;
        draw();
      });
      canvas.addEventListener('wheel', e => {
        e.preventDefault();
        dist = Math.max(span * 0.1, Math.min(span * 5, dist * (1 + Math.sign(e.deltaY) * 0.12)));
        draw();
      }, { passive: false });
      canvas.addEventListener('dblclick', () => {
        yaw = HOME.yaw; pitch = HOME.pitch; dist = span * 1.5; centre = [...centre0]; draw();
      });

      function scene(pickPass) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w; canvas.height = h;
        }
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(0.894, 0.890, 0.863, 1);
        gl.enable(gl.DEPTH_TEST);
        gl.depthMask(true);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        const eye = [
          centre[0] + dist * Math.cos(pitch) * Math.sin(yaw),
          centre[1] + dist * Math.sin(pitch),
          centre[2] + dist * Math.cos(pitch) * Math.cos(yaw)
        ];
        const vp = mul(persp(0.9, w / h, span * 0.02, span * 12), lookAt(eye, centre, [0, 1, 0]));
        gl.useProgram(prog);
        gl.uniformMatrix4fv(uMvp, false, vp);
        gl.uniformMatrix3fv(uNm, false, new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]));
        gl.uniform3f(uClipMin, clip.mn[0], clip.mn[1], clip.mn[2]);
        gl.uniform3f(uClipMax, clip.mx[0], Math.min(clip.mx[1], clip.top), clip.mx[2]);
        gl.uniform1f(uSel, pickPass ? -1 : sel);
        gl.uniform1f(uPick, pickPass ? 1 : 0);
        const alphaOf = p => p.group === 'spaces' ? 0.30 : ghost && SHELL.has(p.group) ? 0.40 : 1;
        const visible = parts.filter(p => on.has(p.group) && levelOn.has(p.storey));
        // прозрачное рисуется после непрозрачного и не пишет глубину,
        // иначе порядок вёдер решает, что видно
        for (const solid of [true, false])
          for (const p of visible) {
            const a = alphaOf(p);
            if (pickPass && a < 1) continue;   // сквозь оболочку кликается начинка
            if (solid !== (a >= 1)) continue;
            gl.depthMask(a >= 1);
            const c = COLOR[p.group] || [0.6, 0.6, 0.6];
            gl.uniform3f(uCol, c[0], c[1], c[2]);
            gl.uniform1f(uAlpha, a);
            gl.bindVertexArray(p.vao);
            gl.drawElements(gl.TRIANGLES, p.count, gl.UNSIGNED_INT, 0);
          }
        gl.depthMask(true);
      }
      const draw = () => scene(false);

      // выбор элемента: пиксель под курсором в проходе, где цвет — номер
      // сущности. Луч в коробочную геометрию не нужен: GPU уже всё посчитал
      function pick(e) {
        scene(true);
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const r = canvas.getBoundingClientRect();
        const px = Math.round((e.clientX - r.left) * dpr);
        const py = Math.round(canvas.height - (e.clientY - r.top) * dpr);
        // сглаживание смешивает ид-цвета на рёбрах: читается окно 3×3,
        // выбирается номер, который встретился чаще и существует в файле
        const b = new Uint8Array(4 * 9);
        gl.readPixels(Math.max(0, px - 1), Math.max(0, py - 1), 3, 3, gl.RGBA, gl.UNSIGNED_BYTE, b);
        const votes = new Map();
        for (let i = 0; i < 9; i++) {
          const v = b[i * 4] + b[i * 4 + 1] * 256 + b[i * 4 + 2] * 65536;
          if (v > 0 && info.has(v)) votes.set(v, (votes.get(v) || 0) + 1);
        }
        const id = [...votes.entries()].sort((a, c) => c[1] - a[1])[0]?.[0] || 0;
        if (id > 0 && info.has(id)) {
          sel = id;
          const i = info.get(id);
          const st = storeyName.get(storeyOf.get(id));
          say([i.name || i.long, i.tag, st].filter(Boolean).join(' · '));
        } else {
          sel = -1;
          say(baseline());
        }
        draw();
      }

      new ResizeObserver(draw).observe(canvas);
      draw();
      api.CloseModel(model);
      say(baseline());
      root.classList.add('ready');
    } catch (e) {
      say('не получилось: ' + e.message);
    }
  };

  function ids(v) { const o = []; for (let i = 0; i < v.size(); i++) o.push(v.get(i)); return o; }
  function attrib(gl, prog, name, data, size) {
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, name);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
  }
  function link(gl, vs, fs) {
    const sh = (t, src) => {
      const s = gl.createShader(t);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  }
})();
