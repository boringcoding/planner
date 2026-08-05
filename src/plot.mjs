// Участок. Дом стоит не на бесконечном газоне, а в границах 19 × 35 с
// соседями по трём сторонам и улицей с четвёртой — и почти все решения
// генплана продиктованы именно этим.
//
// Хранится решение, считается результат: в данных лежат посадка дома
// (setback до северо-западной границы, red до красной линии), времянка,
// септик и точки ворот; забор, проезд, дорожки, отступы и трассы наружных
// сетей выводятся отсюда. Подвинулся септик — пересчитались и трубы,
// и смета, и правила расстояний.
//
// Система координат — та же, что у дома: x вправо, y вниз (юг сверху),
// начало в северо-западном углу дома. Участок в ней — прямоугольник
// от (-setback, -red) до (front - setback, depth - red).

import { verandaGeom, plotMargins } from './roof.mjs';

export function plotGeom(house) {
  const P = house.project && house.project.plot;
  if (!P || !P.front) return null;
  const S = house.shell;
  const ground = house.site.ground ?? -300;
  const m = plotMargins(house);
  const lot = { x0: -m.W, y0: -m.S, x1: P.front - m.W, y1: P.depth - m.S, w: P.front, d: P.depth };

  // ---- забор -------------------------------------------------------------
  // Панели по осям границ; во фронтальной линии два разрыва — въездные
  // ворота напротив гаражных и калитка напротив дорожки к веранде
  const F = P.fence || {};
  const th = F.th ?? 60, fh = F.h ?? 1800;
  const gate = F.gate && { ...F.gate, x: F.gate.at, y: lot.y0 - th / 2, w: F.gate.w, h: th, hz: fh };
  const wicket = F.wicket && { ...F.wicket, x: F.wicket.at, y: lot.y0 - th / 2, w: F.wicket.w, h: th, hz: fh };
  const segs = [];
  {
    // фронт: непрерывные куски между проёмами
    const holes = [gate, wicket].filter(Boolean)
      .map(g => [g.x, g.x + g.w]).sort((a, b) => a[0] - b[0]);
    let at = lot.x0, n = 0;
    for (const [a, b] of holes) {
      if (a > at) segs.push({ id: `plot.fence${++n}`, x: at, y: lot.y0 - th / 2, w: a - at, h: th });
      at = Math.max(at, b);
    }
    if (at < lot.x1) segs.push({ id: `plot.fence${++n}`, x: at, y: lot.y0 - th / 2, w: lot.x1 - at, h: th });
    // тыл и боковые: боковые укорочены на толщину, чтобы не двоить углы
    segs.push({ id: `plot.fence${++n}`, x: lot.x0, y: lot.y1 - th / 2, w: lot.x1 - lot.x0, h: th });
    segs.push({ id: `plot.fence${++n}`, x: lot.x0 - th / 2, y: lot.y0 + th / 2, w: th, h: lot.d - th });
    segs.push({ id: `plot.fence${++n}`, x: lot.x1 - th / 2, y: lot.y0 + th / 2, w: th, h: lot.d - th });
  }
  const fence = { h: fh, th, segs, gate, wicket, len: segs.reduce((s, q) => s + Math.max(q.w, q.h), 0) };

  // ---- проезд и дорожки ---------------------------------------------------
  // Проезд — от въездных ворот до пандусов гаража, во всю ширину обоих
  // гаражных проёмов. Дорожка к дому идёт от калитки вдоль восточной
  // отмостки и приходит к ступеням веранды; дорожка к времянке ответвляется
  // от неё, обходит навес веранды с востока и упирается в крыльцо времянки
  const gates = (house.levels.flatMap(L => L.windows || [])).filter(w => w.kind === 'gate');
  const ga = Math.min(...gates.map(w => w.a)) - 150, gb = Math.max(...gates.map(w => w.b)) + 150;
  const drive = { id: 'plot.drive', x: ga, y: lot.y0, w: gb - ga, h: -1500 - lot.y0, top: ground, th: (P.drive && P.drive.th) || 150 };

  const V = verandaGeom(house);
  const walkW = (P.walk && P.walk.w) || 1000, walkTh = (P.walk && P.walk.th) || 100;
  const paths = [];
  const T = P.temp;
  if (V && wicket) {
    // ступени веранды: дорожка встаёт вплотную к их восточной кромке
    const stepX1 = V.v.x + V.stepW;                       // восточный край ступеней
    const stepY0 = V.deckSteps.length ? Math.min(...V.deckSteps.map(q => q.y)) : V.v.y;
    paths.push({ id: 'plot.walk1', x: stepX1, y: lot.y0, w: walkW, h: stepY0 + 300 - lot.y0, top: ground, th: walkTh });
    if (T) {
      // к времянке в северо-западном углу: в обход навеса веранды
      // с востока, за северной отмосткой поперёк двора и к южной двери
      const cb = V.canopyBox;
      const bx = cb.x + cb.w + 100;                        // восточный обход навеса
      const by0 = stepY0 - 1600;                           // связка от дорожки A
      const backY = S.h + (((house.site.apron || {}).out) ?? 1000) + 100;
      const cx = (T.door.a + T.door.b) / 2;
      paths.push({ id: 'plot.walk2', x: stepX1 + walkW, y: by0, w: bx + 800 - (stepX1 + walkW), h: 800, top: ground, th: walkTh });
      paths.push({ id: 'plot.walk3', x: bx, y: by0 + 800, w: 800, h: backY + 800 - (by0 + 800), top: ground, th: walkTh });
      paths.push({ id: 'plot.walk4', x: cx - 400, y: backY, w: bx - (cx - 400), h: 800, top: ground, th: walkTh });
      paths.push({ id: 'plot.walk5', x: cx - 400, y: backY + 800, w: 800, h: T.y - 600 - (backY + 800), top: ground, th: walkTh });
    }
  }

  // ---- времянка -----------------------------------------------------------
  // Коробка 8 × 8 в дальнем от улицы юго-восточном углу: в ней живут, пока
  // строится дом, потом она — гостевая и мастерская. Материал — блок (C0):
  // при разрыве до дома 6,5 м деревянной ей быть нельзя, и правило это держит
  let temp = null;
  if (T) {
    const t = T.wall ?? 300;
    const walls = [
      { id: `${T.id}.wS`, x: T.x, y: T.y, w: T.w, h: t },
      { id: `${T.id}.wN`, x: T.x, y: T.y + T.h - t, w: T.w, h: t },
      { id: `${T.id}.wW`, x: T.x, y: T.y + t, w: t, h: T.h - 2 * t },
      { id: `${T.id}.wE`, x: T.x + T.w - t, y: T.y + t, w: t, h: T.h - 2 * t }
    ];
    // крыльцо-плита перед дверью: порог на 0.000, земля на ground —
    // без промежуточной ступени перепад был бы больше порога
    const porch = {
      id: `${T.id}.porch`, x: T.door.a - 150, y: T.y - 600, w: T.door.b - T.door.a + 300, h: 600,
      top: Math.round(ground / 2), th: 150
    };
    temp = {
      ...T, t, walls, porch,
      box: { x: T.x, y: T.y, w: T.w, h: T.h },
      slabTh: T.slab ?? 300, roofTh: T.roofTh ?? 220,
      roofZ: T.clear ?? 2700,                              // низ кровельной плиты
      top: (T.clear ?? 2700) + (T.roofTh ?? 220),
      area: T.w * T.h / 1e6
    };
  }

  // ---- септик -------------------------------------------------------------
  // Станция биологической очистки, а не септик с полем фильтрации: на
  // фронте 19 м все зоны, где выдержаны разом 5 м от двух домов и отступ
  // от границы, сжимаются в полосу шириной в метр — поле фильтрации с его
  // восьмиметровым отступом сюда не встаёт геометрически. АУ герметична,
  // обслуживается без машины, очищенная вода уходит напорным сбросом в кювет
  let septic = null;
  if (P.septic) {
    const q = P.septic;
    septic = {
      ...q, box: { x: q.x, y: q.y, w: q.w, h: q.h },
      top: ground + 200,                                   // горловина выше земли
      bottom: ground + 200 - (q.body ?? 2500)
    };
  }

  return { lot, m, ground, fence, drive, paths, temp, septic, red: lot.y0 };
}

// коридоры наружных сетей: все выводятся из границ участка, септика и
// посадки времянки, а не назначаются каждой трубе отдельно — иначе
// однажды разъедутся
export function plotLanes(house) {
  const g = plotGeom(house);
  if (!g) return null;
  // времянка у западной границы — её вода и кабель идут западной полосой:
  // сравниваются расстояния до боковых границ, а не центры
  const west = g.temp
    ? g.temp.x - g.lot.x0 < g.lot.x1 - (g.temp.x + g.temp.w) : false;
  const tap = (house.project.plot || {}).tap;
  return {
    waterX: west ? g.lot.x0 + 800 : g.lot.x1 - 800,
    powerX: west ? g.lot.x0 + 300 : g.lot.x1 - 250,
    waterY: g.lot.y0 + 1200,       // фронтальные горизонтали — в полосе перед домом
    powerY: g.lot.y0 + 600,
    // точка врезки воды: уличная магистраль подходит к углу ЮЗ-ЮВ
    tapX: tap ? (tap.corner === 'SE' ? g.lot.x1 - (tap.off ?? 700) : g.lot.x0 + (tap.off ?? 700)) : null,
    sewerX: g.septic ? g.septic.x - 600 : 0,               // самотёк к септику
    relX: g.septic ? g.septic.x + g.septic.w / 2 : 0       // напорный сброс в кювет
  };
}
