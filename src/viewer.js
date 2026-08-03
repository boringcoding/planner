// Смотрелка IFC на странице. Файл читает web-ifc — тот же движок, что стоит
// за IFC.js: это принципиально, потому что на экране должна быть выгрузка,
// а не наша же геометрия, нарисованная второй раз. Если модель в браузере
// собралась, значит в файле лежит то, что мы думаем.
//
// Рисуется вручную на WebGL2: смотрелке нужны треугольники, орбита и
// выключатели слоёв — три библиотеки ради этого не нужны.

(() => {
  // Типы берутся по имени из самого движка, а не числами: коды IFC-типов
  // у web-ifc меняются от версии к версии, и зашитое число однажды молча
  // перестанет совпадать ни с чем
  const TYPE_GROUP = [
    ['walls', 'Стены', ['IFCWALL', 'IFCWALLSTANDARDCASE']],
    ['slabs', 'Перекрытия', ['IFCSLAB']],
    ['openings', 'Двери и окна', ['IFCDOOR', 'IFCWINDOW']],
    ['stairs', 'Лестница', ['IFCSTAIR', 'IFCSTAIRFLIGHT']],
    ['furniture', 'Мебель', ['IFCFURNISHINGELEMENT', 'IFCFURNITURE']],
    ['shafts', 'Шахты', ['IFCBUILDINGELEMENTPROXY']],
    ['spaces', 'Помещения', ['IFCSPACE']]
  ];
  const COLOR = {
    walls: [0.82, 0.81, 0.78], slabs: [0.70, 0.69, 0.66], openings: [0.42, 0.55, 0.63],
    stairs: [0.60, 0.59, 0.56], furniture: [0.75, 0.74, 0.70], shafts: [0.52, 0.51, 0.49],
    spaces: [0.90, 0.93, 0.90], eom: [0.66, 0.46, 0.16], vk: [0.18, 0.42, 0.55],
    ov: [0.70, 0.25, 0.18], ss: [0.25, 0.47, 0.35]
  };
  const SYS_TITLE = { eom: 'ЭОМ', vk: 'ВК', ov: 'ОВ', ss: 'СС' };
  const DEFAULT_OFF = new Set(['spaces']);

  const VS = `#version 300 es
  in vec3 p; in vec3 n;
  uniform mat4 mvp; uniform mat3 nm;
  out vec3 vn;
  void main(){ vn = normalize(nm * n); gl_Position = mvp * vec4(p,1.0); }`;
  const FS = `#version 300 es
  precision highp float;
  in vec3 vn; out vec4 c;
  uniform vec3 col; uniform float alpha;
  void main(){
    vec3 n = normalize(vn);
    float d = 0.42 + 0.46*max(dot(n, normalize(vec3(0.45,0.85,0.35))),0.0)
                   + 0.16*max(dot(n, normalize(vec3(-0.5,0.3,-0.7))),0.0);
    c = vec4(col*d, alpha);
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
      for (const rid of ids(api.GetLineIDsWithType(model, WebIFC.IFCRELAGGREGATES))) {
        const r = api.GetLine(model, rid);
        if (!storeys.some(s => s.id === r.RelatingObject.value)) continue;
        for (const e of r.RelatedObjects) storeyOf.set(e.value, r.RelatingObject.value);
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

      say('собираю геометрию…');
      const buckets = new Map();          // "группа|этаж" -> {pos,nrm,idx}
      const bucket = k => {
        if (!buckets.has(k)) buckets.set(k, { pos: [], nrm: [], idx: [] });
        return buckets.get(k);
      };
      let tri = 0;
      api.StreamAllMeshes(model, mesh => {
        const eid = mesh.expressID;
        const group = sysOf.get(eid) || typeKey.get(eid) || 'other';
        const st = storeyOf.get(eid);
        const b = bucket(`${group}|${st || 0}`);
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
          }
          for (let k = 0; k < ix.length; k++) b.idx.push(base + ix[k]);
          tri += ix.length / 3;
        }
      });

      // ---- WebGL ----------------------------------------------------------
      const gl = canvas.getContext('webgl2', { antialias: true, alpha: false });
      if (!gl) { say('браузер не умеет WebGL2 — 3D не покажу'); return; }
      const prog = link(gl, VS, FS);
      const uMvp = gl.getUniformLocation(prog, 'mvp');
      const uNm = gl.getUniformLocation(prog, 'nm');
      const uCol = gl.getUniformLocation(prog, 'col');
      const uAlpha = gl.getUniformLocation(prog, 'alpha');

      const parts = [];
      const box = { mn: [1e9, 1e9, 1e9], mx: [-1e9, -1e9, -1e9] };
      for (const [key, b] of buckets) {
        if (!b.idx.length) continue;
        const vao = gl.createVertexArray();
        gl.bindVertexArray(vao);
        attrib(gl, prog, 'p', new Float32Array(b.pos), 3);
        attrib(gl, prog, 'n', new Float32Array(b.nrm), 3);
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
      const centre = box.mn.map((v, i) => (v + box.mx[i]) / 2);
      const span = Math.max(...box.mx.map((v, i) => v - box.mn[i]));

      // ---- слои ------------------------------------------------------------
      const on = new Set();
      const groups = [...new Set(parts.map(p => p.group))];
      const label = g => (TYPE_GROUP.find(t => t[0] === g) || [])[1] || SYS_TITLE[g] || g;
      for (const g of groups) if (!DEFAULT_OFF.has(g)) on.add(g);
      const levelOn = new Set(storeys.map(s => s.id));

      panel.innerHTML = '';
      const chips = (title, items, set, key) => {
        const wrap = document.createElement('div');
        wrap.className = 'v-row';
        wrap.innerHTML = `<span class="v-title">${title}</span>`;
        for (const it of items) {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'v-chip' + (set.has(it[0]) ? ' on' : '');
          b.textContent = it[1];
          if (key) b.style.setProperty('--c', key(it[0]));
          b.onclick = () => {
            set.has(it[0]) ? set.delete(it[0]) : set.add(it[0]);
            b.classList.toggle('on');
            draw();
          };
          wrap.appendChild(b);
        }
        panel.appendChild(wrap);
      };
      const order = ['walls', 'slabs', 'openings', 'stairs', 'furniture', 'shafts', 'spaces', 'eom', 'vk', 'ov', 'ss'];
      chips('слои', order.filter(g => groups.includes(g)).map(g => [g, label(g)]), on,
        g => `rgb(${(COLOR[g] || [0.5, 0.5, 0.5]).map(v => Math.round(v * 255)).join(',')})`);
      chips('уровни', storeys.map(s => [s.id, s.name]), levelOn);

      // ---- камера ------------------------------------------------------------
      let yaw = -0.7, pitch = 0.62, dist = span * 1.5;
      const drag = { on: false, x: 0, y: 0 };
      canvas.addEventListener('pointerdown', e => {
        drag.on = true; drag.x = e.clientX; drag.y = e.clientY;
        canvas.setPointerCapture(e.pointerId);
      });
      canvas.addEventListener('pointerup', e => { drag.on = false; canvas.releasePointerCapture(e.pointerId); });
      canvas.addEventListener('pointermove', e => {
        if (!drag.on) return;
        yaw -= (e.clientX - drag.x) * 0.008;
        pitch = Math.max(-1.45, Math.min(1.45, pitch + (e.clientY - drag.y) * 0.008));
        drag.x = e.clientX; drag.y = e.clientY;
        draw();
      });
      canvas.addEventListener('wheel', e => {
        e.preventDefault();
        dist = Math.max(span * 0.25, Math.min(span * 5, dist * (1 + Math.sign(e.deltaY) * 0.12)));
        draw();
      }, { passive: false });
      canvas.addEventListener('dblclick', () => { yaw = -0.7; pitch = 0.62; dist = span * 1.5; draw(); });

      function draw() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = canvas.clientWidth, h = canvas.clientHeight;
        if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
          canvas.width = w * dpr; canvas.height = h * dpr;
        }
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(0.894, 0.890, 0.863, 1);
        gl.enable(gl.DEPTH_TEST);
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
        for (const p of parts) {
          if (!on.has(p.group) || !levelOn.has(p.storey)) continue;
          const c = COLOR[p.group] || [0.6, 0.6, 0.6];
          gl.uniform3f(uCol, c[0], c[1], c[2]);
          gl.uniform1f(uAlpha, p.group === 'spaces' ? 0.30 : 1);
          gl.bindVertexArray(p.vao);
          gl.drawElements(gl.TRIANGLES, p.count, gl.UNSIGNED_INT, 0);
        }
      }
      new ResizeObserver(draw).observe(canvas);
      draw();
      api.CloseModel(model);
      say(`${(buf.byteLength / 1024).toFixed(0)} КБ · ${tri.toLocaleString('ru')} треугольников · тяните мышью, колесо — приблизить`);
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
