/**
 * stack.js
 *
 * 쌓기나무 규칙 찾기의 계산 부분 — 모양 만들기, 그림 좌표, 문제 만들기, 채점. DOM 은 건드리지 않는다.
 *
 * 모양은 세 가지다. 모두 뒤쪽 왼쪽 모서리가 가장 높고 앞·오른쪽으로 갈수록 낮아진다.
 *   stairs  계단        한 줄로 놓은 계단. 위층부터 1, 2, 3, … 개
 *   pyramid 피라미드    정사각형 층을 쌓은 모양. 위층부터 1, 4, 9, … 개 (교과서 그림)
 *   corner  모서리 계단 두 방향으로 내려가는 계단. 위층부터 1, 3, 6, … 개
 *
 * 쌓기나무 하나는 (x, d, z) 로 나타낸다. x 는 왼쪽에서부터, d 는 앞줄에서부터 뒤로,
 * z 는 바닥에서부터 센다. 그림은 교과서처럼 앞면을 정사각형으로 그리고 뒤로 갈수록
 * 오른쪽 위로 비껴 그린다 (사투상).
 *
 * 브라우저에서는 window.Stack, Node 에서는 module.exports 로 노출된다.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.Stack = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /** 뒤로 한 줄 갈 때 그림에서 비껴 가는 양 (쌓기나무 한 변 = 1) */
  var SKEW = { x: 0.5, y: 0.36 };

  var FAMILIES = ['pyramid', 'stairs', 'corner'];
  var FAMILY_NAMES = { stairs: '계단', pyramid: '피라미드', corner: '모서리 계단' };

  var KINDS = ['layers', 'grow', 'next', 'nth'];

  var ORDINALS = ['첫째', '둘째', '셋째', '넷째', '다섯째', '여섯째', '일곱째', '여덟째', '아홉째', '열째',
    '열한째', '열두째'];

  // ------------------------------------------------------------------ 수

  /** n째 모양에서 위에서 k째 층의 쌓기나무 수 */
  function layerCount(family, k) {
    if (family === 'stairs') return k;
    if (family === 'pyramid') return k * k;
    return k * (k + 1) / 2;
  }

  /** n째 모양의 층별 개수, 위층부터 */
  function layers(family, n) {
    var out = [];
    for (var k = 1; k <= n; k++) out.push(layerCount(family, k));
    return out;
  }

  /** n째 모양의 쌓기나무 수 (공식) */
  function total(family, n) {
    if (n <= 0) return 0;
    if (family === 'stairs') return n * (n + 1) / 2;
    if (family === 'pyramid') return n * (n + 1) * (2 * n + 1) / 6;
    return n * (n + 1) * (n + 2) / 6;
  }

  /** (n-1)째에서 n째가 될 때 늘어나는 수 = 새로 깔리는 맨 아래층 */
  function growth(family, n) {
    return total(family, n) - total(family, n - 1);
  }

  function ordinal(n) {
    return ORDINALS[n - 1] || n + '째';
  }

  // ------------------------------------------------------------------ 모양

  /** 바닥 칸 (x, b) 의 높이. b 는 뒷줄에서부터 센다. 칸이 없으면 0. */
  function height(family, n, x, b) {
    if (x < 0 || b < 0 || x >= n) return 0;
    if (family === 'stairs') return b === 0 ? n - x : 0;
    if (b >= n) return 0;
    if (family === 'pyramid') return n - Math.max(x, b);
    return Math.max(0, n - x - b);
  }

  function depthOf(family, n) {
    return family === 'stairs' ? 1 : n;
  }

  /**
   * n째 모양의 쌓기나무를 그리는 순서대로. 먼 줄부터, 아래부터, 왼쪽부터 그리면
   * 나중에 그린 것이 앞에 있는 것이 된다.
   * 각 쌓기나무: {x, d, z, layer, faces: {front, top, right}}  layer 는 위에서부터 1, 2, …
   */
  function cubes(family, n) {
    var depth = depthOf(family, n);
    var has = {};
    var list = [];
    for (var b = 0; b < depth; b++) {
      for (var x = 0; x < n; x++) {
        var h = height(family, n, x, b);
        for (var z = 0; z < h; z++) {
          var c = { x: x, d: depth - 1 - b, z: z, layer: n - z };
          has[key(c.x, c.d, c.z)] = true;
          list.push(c);
        }
      }
    }
    list.sort(function (p, q) { return (q.d - p.d) || (p.z - q.z) || (p.x - q.x); });
    list.forEach(function (c) {
      c.faces = faces(c.x, c.d, c.z);
      // 옆에 붙은 쌓기나무가 없어서 밖으로 드러난 면
      c.exposed = {
        front: !has[key(c.x, c.d - 1, c.z)],
        right: !has[key(c.x + 1, c.d, c.z)],
        top: !has[key(c.x, c.d, c.z + 1)]
      };
      c.visible = c.exposed.front || c.exposed.right || c.exposed.top;
    });
    return list;
  }

  function key(x, d, z) { return x + ',' + d + ',' + z; }

  /** 모형 점 → 그림 점 (y축이 아래, 쌓기나무 한 변 = 1) */
  function project(x, d, z) {
    return { x: x + d * SKEW.x, y: -(z + d * SKEW.y) };
  }

  function faces(x, d, z) {
    var P = project;
    return {
      front: [P(x, d, z), P(x + 1, d, z), P(x + 1, d, z + 1), P(x, d, z + 1)],
      top: [P(x, d, z + 1), P(x + 1, d, z + 1), P(x + 1, d + 1, z + 1), P(x, d + 1, z + 1)],
      right: [P(x + 1, d, z), P(x + 1, d + 1, z), P(x + 1, d + 1, z + 1), P(x + 1, d, z + 1)]
    };
  }

  /** 그림이 차지하는 상자. 바닥 앞 왼쪽 모서리가 (0, 0) 이다. */
  function bounds(family, n) {
    var depth = depthOf(family, n);
    return {
      minX: 0,
      maxX: n + depth * SKEW.x,
      minY: -(n + depth * SKEW.y),
      maxY: 0,
      w: n + depth * SKEW.x,
      h: n + depth * SKEW.y
    };
  }

  /** 보이는 면이 하나라도 있는 쌓기나무 수. 「보이는 것만 센」 답을 알아보는 데 쓴다. */
  function visibleCount(family, n) {
    return cubes(family, n).filter(function (c) { return c.visible; }).length;
  }

  /** 층마다 보이는 쌓기나무 수, 위층부터 */
  function visibleByLayer(family, n) {
    var out = [];
    for (var k = 0; k < n; k++) out.push(0);
    cubes(family, n).forEach(function (c) { if (c.visible) out[c.layer - 1]++; });
    return out;
  }

  // ------------------------------------------------------------------ 문제

  /** 시드를 받는 난수 (테스트에서 같은 문제를 다시 만든다) */
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function randInt(rng, lo, hi) {
    return lo + Math.floor(rng() * (hi - lo + 1));
  }

  /** 교과서 그림인 피라미드를 절반, 나머지 둘을 4분의 1씩 */
  function pickFamily(rng) {
    var r = rng();
    return r < 0.5 ? 'pyramid' : r < 0.75 ? 'stairs' : 'corner';
  }

  // 문제 종류·모양마다 n 의 범위. 그림 한 장에 너무 많이 쌓이지 않게 잡았다.
  var RANGES = {
    layers: { stairs: [3, 6], pyramid: [2, 5], corner: [2, 4] },
    grow: { stairs: [3, 7], pyramid: [2, 5], corner: [2, 5] },
    next: { stairs: [4, 7], pyramid: [4, 6], corner: [4, 6] },
    nth: { stairs: [6, 10], pyramid: [5, 8], corner: [5, 7] }
  };

  /**
   * kind:
   *   layers 한 모양을 층별로 세어 「□ + □ + □ = □」 채우기
   *   grow   앞 모양에서 몇 개 늘었는지
   *   next   개수가 적힌 모양 몇 개를 보고 다음 모양의 개수
   *   nth    처음 네 모양을 보고 n째 모양의 개수 (교과서 문제)
   */
  function generate(kind, rng, family) {
    rng = rng || Math.random;
    family = family || pickFamily(rng);
    var range = RANGES[kind][family];
    var n = randInt(rng, range[0], range[1]);
    var q = { kind: kind, family: family, n: n, layers: layers(family, n), total: total(family, n) };

    if (kind === 'layers') {
      q.answer = q.total;
    } else if (kind === 'grow') {
      q.answer = growth(family, n);
    } else if (kind === 'next') {
      // 바로 앞까지 보여 준다. 모양은 많아야 네 개, 개수는 모두 적는다.
      q.shown = [];
      for (var i = Math.max(1, n - 4); i < n; i++) q.shown.push(i);
      q.answer = q.total;
    } else {
      q.shown = [1, 2, 3, 4];
      q.answer = q.total;
    }
    return q;
  }

  // ------------------------------------------------------------------ 입력·채점

  /** '30', '30개', '３０' → {value: 30}. 빈칸·숫자 아님은 {error}. */
  function parseCount(text) {
    var s = String(text == null ? '' : text)
      .replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
      .replace(/\s+/g, '')
      .replace(/개$/, '');
    if (!s) return { error: 'empty' };
    if (!/^\d{1,6}$/.test(s)) return { error: 'format' };
    return { value: Number(s) };
  }

  /** 앞에서부터 차례로 더한 값 (1, 1+4, 1+4+9, …) */
  function runningTotals(list) {
    var sum = 0;
    return list.map(function (v) { sum += v; return sum; });
  }

  /**
   * 채점. layers 문제는 answer = {layers: [...], total}, 나머지는 숫자.
   * 돌려주는 값: {correct, mistake}  layers 문제는 layerOk·totalOk 도.
   *
   * mistake 는 흔한 실수를 짚는 데 쓴다:
   *   running  층별 개수 대신 앞 모양들의 전체 개수를 썼다 (1 + 5 + 14 …)
   *   visible  보이는 쌓기나무만 셌다
   *   sumSlip  층별 개수는 맞는데 더하기가 틀렸다
   *   whole    늘어난 수 대신 전체 개수를 셌다
   *   bottom   맨 아래층만 셌다 (겉에서 보이는 것만 센 수와도 같다)
   *   linear   늘어나는 수가 매번 같다고 보고 이어 갔다
   *   offByOne 한 칸 앞이나 뒤 모양의 개수다
   */
  function grade(q, answer) {
    if (q.kind === 'layers') return gradeLayers(q, answer);
    var v = answer;
    var res = { correct: v === q.answer, mistake: null };
    if (res.correct) return res;

    var n = q.n;
    var f = q.family;
    if (q.kind === 'grow') {
      if (v === q.total) res.mistake = 'whole';
      else if (v === growth(f, n - 1)) res.mistake = 'offByOne';
      return res;
    }
    // 이 세 모양은 겉에서 보이는 수가 늘 맨 아래층 개수와 같다. 그래서 bottom 을 먼저 본다.
    if (v === layerCount(f, n)) res.mistake = 'bottom';
    else if (v === visibleCount(f, n) && v !== q.total) res.mistake = 'visible';
    else if (v === linearGuess(f, n)) res.mistake = 'linear';
    else if (v === total(f, n - 1) || v === total(f, n + 1)) res.mistake = 'offByOne';
    return res;
  }

  /** 마지막으로 늘어난 수만큼 계속 늘어난다고 잘못 짐작한 값 (계단은 해당 없음) */
  function linearGuess(family, n) {
    var lastStep = growth(family, n - 1);
    var guess = total(family, n - 1) + lastStep;
    return guess === total(family, n) ? null : guess;
  }

  function gradeLayers(q, answer) {
    var given = answer.layers;
    var layerOk = q.layers.map(function (v, i) { return given[i] === v; });
    var totalOk = answer.total === q.total;
    var allLayers = layerOk.every(Boolean);
    var res = { correct: allLayers && totalOk, layerOk: layerOk, totalOk: totalOk, mistake: null };
    if (res.correct) return res;

    var running = runningTotals(q.layers);
    var visible = visibleByLayer(q.family, q.n);
    var wrong = layerOk.map(function (ok, i) { return ok ? -1 : i; }).filter(function (i) { return i >= 0; });
    if (wrong.some(function (i) { return given[i] === running[i] && running[i] !== q.layers[i]; })) {
      res.mistake = 'running';
    } else if (wrong.length && wrong.every(function (i) { return given[i] === visible[i]; })) {
      res.mistake = 'visible';
    } else if (allLayers) {
      res.mistake = 'sumSlip';
    }
    return res;
  }

  /**
   * 숫자 뒤에 붙는 은/는. 읽었을 때 끝소리로 고른다 — 5(오)는, 30(삼십)은, 14(십사)는.
   * 0 으로 끝나면 십·백·천·만으로 끝나니 늘 받침이 있다.
   */
  function topicParticle(n) {
    var d = Math.abs(Math.round(n)) % 10;
    return '0136781'.indexOf(String(d)) >= 0 ? '은' : '는';
  }

  /** '1 + 4 + 9 + 16 = 30' */
  function equation(family, n) {
    return layers(family, n).join(' + ') + ' = ' + total(family, n);
  }

  return {
    SKEW: SKEW,
    FAMILIES: FAMILIES,
    FAMILY_NAMES: FAMILY_NAMES,
    KINDS: KINDS,
    layerCount: layerCount,
    layers: layers,
    total: total,
    growth: growth,
    ordinal: ordinal,
    height: height,
    cubes: cubes,
    project: project,
    bounds: bounds,
    visibleCount: visibleCount,
    visibleByLayer: visibleByLayer,
    mulberry32: mulberry32,
    generate: generate,
    parseCount: parseCount,
    runningTotals: runningTotals,
    linearGuess: linearGuess,
    grade: grade,
    topicParticle: topicParticle,
    equation: equation
  };
});
