/**
 * angle.js
 *
 * 각도 게임의 계산 부분 — 문제 만들기, 그림 배치, 채점. DOM 은 건드리지 않는다.
 *
 * 각도는 수학 관례를 따른다. 오른쪽이 0°이고 시계 반대 방향으로 커진다.
 * 도형은 y축이 위를 향하는 모형 좌표로 만들고, SVG 좌표(y축이 아래)로 옮길 때만 y를 뒤집는다.
 * 그래서 방향을 나타내는 각도는 모형에서나 화면에서나 뜻이 같다.
 *
 * 브라우저에서는 window.Angle, Node 에서는 module.exports 로 노출된다.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.Angle = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var RAD = Math.PI / 180;
  var MINUS = '−';

  /** 모든 그림은 같은 크기의 SVG 에 그린다. */
  var VIEW = { w: 380, h: 230 };

  /** 각도기 그림 (각도기 읽기·각 그리기). 각도기 중심이 곧 꼭짓점이다. outer/inner 는 두 눈금 숫자의 반지름. */
  var PROTRACTOR = { cx: 190, cy: 204, r: 158, arm: 176, outer: 134, inner: 117 };

  /** 합과 차 그림: 한 꼭짓점에서 뻗은 반직선 세 개. part/whole 은 작은 각·전체 각 호의 반지름. */
  var FAN = { cx: 190, cy: 206, ray: 172, part: 40, whole: 138 };

  /** 각도 글자 하나가 차지하는 상자. 폭은 「165°」(약 40), 높이는 크게 쓰는 「?」(약 25) 기준에 여유를 더했다. */
  var LABEL = { w: 44, h: 26 };

  var DRAW_TOLERANCE = 2;    // 각 그리기: 목표와 이만큼 차이까지 정답
  var ESTIMATE_OK = 10;      // 어림하기: 이만큼 차이까지 정답
  var ESTIMATE_GREAT = 5;    // 어림하기: 이만큼 차이 안이면 '아주 잘'

  var KINDS = ['compare', 'classify', 'measure', 'draw', 'estimate', 'sum', 'shape'];
  var CLASS_NAMES = { acute: '예각', right: '직각', obtuse: '둔각' };

  // ------------------------------------------------------------------ 기하

  /** 0 이상 360 미만으로. -0 도 0 이 된다. */
  function normalize(deg) {
    return ((deg % 360) + 360) % 360;
  }

  /** 0°보다 크고 180°보다 작은 각의 종류. 범위 밖이면 null. */
  function classify(deg) {
    if (!(deg > 0 && deg < 180)) return null;
    if (deg < 90) return 'acute';
    return deg === 90 ? 'right' : 'obtuse';
  }

  /** 모형 좌표: 원점에서 deg 방향으로 len 만큼 간 점 */
  function along(deg, len) {
    return { x: len * Math.cos(deg * RAD), y: len * Math.sin(deg * RAD) };
  }

  /** 모형 좌표: 원점을 중심으로 deg 만큼 돌린 점 */
  function rotate(p, deg) {
    var c = Math.cos(deg * RAD);
    var s = Math.sin(deg * RAD);
    return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
  }

  /** SVG 좌표: (cx, cy)에서 deg 방향으로 r 만큼 간 점 */
  function polar(cx, cy, r, deg) {
    return { x: cx + r * Math.cos(deg * RAD), y: cy - r * Math.sin(deg * RAD) };
  }

  /** SVG 좌표: from 에서 to 를 바라보는 방향 (0 이상 360 미만) */
  function direction(from, to) {
    return normalize(Math.atan2(from.y - to.y, to.x - from.x) / RAD);
  }

  function num(n) {
    return String(Math.round(n * 100) / 100);
  }

  function arcTo(cx, cy, r, from, sweep) {
    var b = polar(cx, cy, r, from + sweep);
    // SVG 의 sweep-flag 0 은 화면에서 시계 반대 방향이다 (y축이 아래라서).
    return ' A' + num(r) + ' ' + num(r) + ' 0 ' + (sweep > 180 ? 1 : 0) + ' 0 ' + num(b.x) + ' ' + num(b.y);
  }

  /** from° 에서 시계 반대 방향으로 sweep° 만큼 도는 호 (SVG path) */
  function arcPath(cx, cy, r, from, sweep) {
    var a = polar(cx, cy, r, from);
    return 'M' + num(a.x) + ' ' + num(a.y) + arcTo(cx, cy, r, from, sweep);
  }

  /** 꼭짓점과 호로 닫은 부채꼴 (SVG path) */
  function sectorPath(cx, cy, r, from, sweep) {
    var a = polar(cx, cy, r, from);
    return 'M' + num(cx) + ' ' + num(cy) + ' L' + num(a.x) + ' ' + num(a.y) + arcTo(cx, cy, r, from, sweep) + ' Z';
  }

  /** 한 변이 dir 방향인 직각에 그리는 ㄴ 모양 표시 (SVG path) */
  function rightMarkPath(cx, cy, size, dir) {
    var a = polar(cx, cy, size, dir);
    var c = polar(cx, cy, size, dir + 90);
    return 'M' + num(a.x) + ' ' + num(a.y) +
      ' L' + num(a.x + c.x - cx) + ' ' + num(a.y + c.y - cy) +
      ' L' + num(c.x) + ' ' + num(c.y);
  }

  /**
   * 각의 이등분선 위에서 글자 상자가 두 변에 닿지 않는 가장 가까운 거리.
   * 글자는 기울이지 않고 반듯하게 쓰므로, 변마다 그 변의 법선 방향으로 상자가 뻗는 폭을 따진다.
   */
  function clearDistance(from, sweep, box, gap) {
    var need = 0;
    [from, from + sweep].forEach(function (d) {
      var reach = (box.w / 2) * Math.abs(Math.sin(d * RAD)) + (box.h / 2) * Math.abs(Math.cos(d * RAD));
      need = Math.max(need, reach + gap);
    });
    return need / Math.sin(Math.min(sweep / 2, 90) * RAD);
  }

  /** 꼭짓점에서 (cx, cy)만큼 떨어진 글자 상자의 가장 가까운 점까지 거리 */
  function boxReach(cx, cy) {
    var dx = Math.max(Math.abs(cx) - LABEL.w / 2, 0);
    var dy = Math.max(Math.abs(cy) - LABEL.h / 2, 0);
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * 각 안에 글자를 놓을 자리 (SVG 좌표).
   * 각 안으로 다른 선이 지나가면(obstacles: from 에서 잰 각도) 가장 넓은 틈을 고른다.
   * opts.clear: 글자 상자가 꼭짓점에서 이만큼은 떨어진다 — 호와 겹치지 않게.
   * 상자의 가운데가 아니라 가장 가까운 모서리로 재야 한다. 비스듬한 방향에서는 모서리가 훨씬 가깝다.
   */
  function labelAt(v, from, sweep, opts) {
    opts = opts || {};
    var cuts = [0, sweep];
    (opts.obstacles || []).forEach(function (o) {
      if (o > 0 && o < sweep) cuts.push(o);
    });
    cuts.sort(function (a, b) { return a - b; });
    var at = 0;
    var width = -1;
    for (var i = 1; i < cuts.length; i++) {
      if (cuts[i] - cuts[i - 1] > width) {
        width = cuts[i] - cuts[i - 1];
        at = cuts[i - 1];
      }
    }
    var dir = from + at + width / 2;
    var ux = Math.cos(dir * RAD);
    var uy = Math.sin(dir * RAD);
    var dist = clearDistance(from + at, width, LABEL, 4);
    while (boxReach(dist * ux, dist * uy) < (opts.clear || 0)) dist += 1;
    return polar(v.x, v.y, dist, dir);
  }

  /** SVG 좌표의 v 에서 dir 방향으로, 그림 가장자리에서 margin 안쪽까지 그을 수 있는 길이 (want 이하) */
  function rayInView(v, dir, want, margin) {
    var dx = Math.cos(dir * RAD);
    var dy = -Math.sin(dir * RAD);
    var len = want;
    if (dx > 1e-9) len = Math.min(len, (VIEW.w - margin - v.x) / dx);
    if (dx < -1e-9) len = Math.min(len, (margin - v.x) / dx);
    if (dy > 1e-9) len = Math.min(len, (VIEW.h - margin - v.y) / dy);
    if (dy < -1e-9) len = Math.min(len, (margin - v.y) / dy);
    return Math.max(0, len);
  }

  /** 모형 좌표의 점들을 box 안 가운데에 담는 변환. y 를 뒤집어 SVG 좌표로 낸다. */
  function fit(points, box, maxScale) {
    var minX = Infinity;
    var maxX = -Infinity;
    var minY = Infinity;
    var maxY = -Infinity;
    points.forEach(function (p) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    });
    var w = Math.max(maxX - minX, 1e-9);
    var h = Math.max(maxY - minY, 1e-9);
    var s = Math.min(maxScale || Infinity, box.w / w, box.h / h);
    var ox = box.x + (box.w - s * w) / 2 - s * minX;
    var oy = box.y + (box.h - s * h) / 2 + s * maxY;
    return {
      scale: s,
      map: function (p) { return { x: ox + s * p.x, y: oy - s * p.y }; }
    };
  }

  // ------------------------------------------------------------------ 각도기

  /*
   * 각도기의 눈금은 두 줄이다.
   *   안쪽 눈금  : 오른쪽 끝이 0, 시계 반대 방향으로 커진다 → 방향 d 에서 d
   *   바깥쪽 눈금: 왼쪽 끝이 0, 시계 방향으로 커진다      → 방향 d 에서 180 − d
   * 밑금에 맞춘 변이 오른쪽을 향하면 안쪽 눈금을, 왼쪽을 향하면 바깥쪽 눈금을 읽는다.
   * 반대쪽 눈금을 읽으면 (180° − 정답)이 나온다 — 가장 흔한 실수다.
   */

  function readScales(dir) {
    return { inner: dir, outer: 180 - dir };
  }

  function scaleFor(side) {
    return side === 'right' ? 'inner' : 'outer';
  }

  /** 밑금에 맞춘 변이 side 쪽을 향할 때, 벌어진 각이 value 인 다른 변의 방향 */
  function armDirection(side, value) {
    return side === 'right' ? value : 180 - value;
  }

  /** armDirection 의 반대: 다른 변의 방향 → 벌어진 각 */
  function valueFromDirection(side, dir) {
    return side === 'right' ? dir : 180 - dir;
  }

  /** 반원 각도기 아래로 내려간 방향은 가까운 끝(0° 또는 180°)에 붙인다. */
  function clampUpper(dir) {
    var d = normalize(dir);
    if (d <= 180) return d;
    return d < 270 ? 180 : 0;
  }

  /** 눈금 숫자의 자리. 양 끝(0·180)의 숫자는 밑금에 겹치지 않게 조금 올린다. */
  function scalePoint(scale, dir) {
    var P = PROTRACTOR;
    var p = polar(P.cx, P.cy, scale === 'inner' ? P.inner : P.outer, dir);
    if (dir <= 4 || dir >= 176) p.y -= 9;
    return p;
  }

  /** 각도기 눈금 (1°마다)과 숫자 (10°마다) */
  function protractorMarks() {
    var P = PROTRACTOR;
    var ticks = [];
    var labels = [];
    for (var d = 0; d <= 180; d++) {
      var size = d % 10 === 0 ? 'major' : d % 5 === 0 ? 'mid' : 'minor';
      var len = size === 'major' ? 13 : size === 'mid' ? 8.5 : 4.5;
      ticks.push({ d: d, size: size, a: polar(P.cx, P.cy, P.r, d), b: polar(P.cx, P.cy, P.r - len, d) });
      if (d % 10 === 0) {
        var op = scalePoint('outer', d);
        var ip = scalePoint('inner', d);
        labels.push({
          d: d,
          outer: { x: op.x, y: op.y, text: String(180 - d) },
          inner: { x: ip.x, y: ip.y, text: String(d) }
        });
      }
    }
    return { ticks: ticks, labels: labels };
  }

  // ------------------------------------------------------------------ 난수

  /** 시드를 주면 늘 같은 순서로 나오는 난수 (테스트용) */
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

  /** lo 부터 hi 까지 step 간격의 값 중 하나 */
  function randStep(rng, lo, hi, step) {
    return lo + step * randInt(rng, 0, Math.floor((hi - lo) / step));
  }

  function pick(rng, list) {
    return list[Math.floor(rng() * list.length)];
  }

  function rotateList(list, k) {
    return list.slice(k).concat(list.slice(0, k));
  }

  // ------------------------------------------------------------------ 문제

  /** 크기 비교: 두 각 중 더 큰 각 (같을 때도 있다) */
  function makeCompare(rng) {
    var a = randStep(rng, 20, 160, 5);
    var b = a;
    if (rng() >= 0.15) {
      do {
        b = randStep(rng, 20, 160, 5);
      } while (Math.abs(a - b) < 15 || Math.abs(a - b) > 70);
    }
    // 변이 길면 큰 각이라고 착각하기 쉽다. 그래서 작은 각에 긴 변을 주는 문제를 더 자주 낸다.
    var trap = rng() < 0.65;
    var longArms = [randInt(rng, 88, 100)];
    longArms.push(longArms[0] - randInt(rng, 0, 12));
    var shortArms = [randInt(rng, 46, 58)];
    shortArms.push(shortArms[0] - randInt(rng, 0, 8));
    var aIsSmall = a < b || (a === b && rng() < 0.5);
    var small = trap ? longArms : shortArms;
    var big = trap ? shortArms : longArms;
    return {
      kind: 'compare',
      angles: [
        { deg: a, rot: randInt(rng, 0, 359), arms: aIsSmall ? small : big },
        { deg: b, rot: randInt(rng, 0, 359), arms: aIsSmall ? big : small }
      ],
      answer: a > b ? 'a' : b > a ? 'b' : 'same'
    };
  }

  /** 예각·직각·둔각 */
  function makeClassify(rng) {
    var r = rng();
    var deg;
    if (r < 0.3) deg = 90;
    else if (r < 0.4) deg = pick(rng, [80, 85]);
    else if (r < 0.5) deg = pick(rng, [95, 100]);
    else if (r < 0.75) deg = randStep(rng, 30, 75, 5);
    else deg = randStep(rng, 105, 160, 5);
    // 셋 중 하나는 변을 가로·세로에 맞춘다. 나머지는 비스듬히 — 기울어진 직각도 알아봐야 한다.
    var rot = rng() < 0.3 ? pick(rng, [0, 90, 180, 270]) : randInt(rng, 0, 359);
    return {
      kind: 'classify', deg: deg, rot: rot,
      arms: [randInt(rng, 115, 150), randInt(rng, 115, 150)],
      answer: classify(deg)
    };
  }

  /** 각도기 읽기: side 는 밑금에 맞춘 변이 향하는 쪽 */
  function makeMeasure(rng) {
    var deg = randStep(rng, 10, 170, 5);
    return { kind: 'measure', deg: deg, side: rng() < 0.5 ? 'right' : 'left', answer: deg };
  }

  /** 각 그리기: start 는 처음에 벌어져 있는 각 (목표와 충분히 떨어뜨린다) */
  function makeDraw(rng) {
    var deg = randStep(rng, 10, 170, 5);
    var start;
    do {
      start = randStep(rng, 20, 160, 5);
    } while (Math.abs(start - deg) < 25);
    return { kind: 'draw', deg: deg, side: rng() < 0.5 ? 'right' : 'left', start: start, answer: deg };
  }

  /** 어림하기 */
  function makeEstimate(rng) {
    var deg = randStep(rng, 30, 160, 5);
    return {
      kind: 'estimate', deg: deg, rot: randInt(rng, 0, 359),
      arms: [randInt(rng, 115, 150), randInt(rng, 115, 150)],
      answer: deg
    };
  }

  /** 합과 차: 그림으로 (전체 = 두 부분의 합) 또는 식으로 */
  function makeSum(rng) {
    var r = rng();
    if (r < 0.3) {
      var op = rng() < 0.5 ? '+' : '-';
      var x;
      var y;
      if (op === '+') {
        x = randStep(rng, 25, 175, 5);
        y = randStep(rng, 15, 150, 5);
      } else {
        x = randStep(rng, 60, 180, 5);
        y = randStep(rng, 15, x - 15, 5);
      }
      return { kind: 'sum', variant: 'calc', op: op, terms: [x, y], answer: op === '+' ? x + y : x - y };
    }
    // 작은 부분이 35°보다 좁으면 그 안의 글자가 전체 각의 큰 호까지 밀려난다.
    var p1;
    var p2;
    do {
      p1 = randStep(rng, 35, 135, 5);
      p2 = randStep(rng, 35, 135, 5);
    } while (p1 + p2 > 170);
    var total = p1 + p2;
    var q = { kind: 'sum', parts: [p1, p2], total: total, rot: randStep(rng, 0, 180 - total, 5) };
    if (r < 0.65) {
      q.variant = 'sum';
      q.unknown = 'total';
      q.answer = total;
    } else {
      q.variant = 'diff';
      q.unknown = rng() < 0.5 ? 0 : 1;
      q.answer = q.parts[q.unknown];
    }
    return q;
  }

  /** 직선 위의 각: 두세 부분의 합이 180° */
  function makeLine(rng) {
    var parts;
    if (rng() < 0.65) {
      var p = randStep(rng, 30, 150, 5);
      parts = [p, 180 - p];
    } else {
      do {
        parts = [randStep(rng, 30, 120, 5), randStep(rng, 30, 120, 5)];
        parts.push(180 - parts[0] - parts[1]);
      } while (parts[2] < 30);
    }
    var unknown = randInt(rng, 0, parts.length - 1);
    return { kind: 'shape', variant: 'line', angles: parts, unknown: unknown, answer: parts[unknown] };
  }

  function triangleAngles(rng) {
    if (rng() < 0.2) {                       // 직각삼각형
      var b = randStep(rng, 30, 60, 5);
      return rotateList([90, b, 90 - b], randInt(rng, 0, 2));
    }
    var a;
    var c;
    var d;
    do {
      a = randStep(rng, 30, 120, 5);
      c = randStep(rng, 30, 120, 5);
      d = 180 - a - c;
    } while (d < 30 || d > 120);
    return [a, c, d];
  }

  function quadAngles(rng) {
    if (rng() < 0.25) {                      // 직각이 둘인 사다리꼴
      var x;
      do {
        x = randStep(rng, 60, 120, 5);
      } while (x === 90);
      return rotateList([90, 90, x, 180 - x], randInt(rng, 0, 3));
    }
    var a;
    var b;
    var c;
    var d;
    do {
      a = randStep(rng, 60, 140, 5);
      b = randStep(rng, 60, 140, 5);
      c = randStep(rng, 60, 140, 5);
      d = 360 - a - b - c;
    } while (d < 60 || d > 140);
    return [a, b, c, d];
  }

  /**
   * 내각이 angles 인 볼록다각형 (모형 좌표, 시계 반대 방향으로 돈다).
   * 변을 따라 가다가 꼭짓점마다 (180° − 내각)만큼 왼쪽으로 꺾는다. heads[i] 는 i번 꼭짓점에서
   * 다음 꼭짓점으로 가는 변의 방향이고, i번 꼭짓점의 내각은 heads[i] 에서 시계 반대 방향으로 angles[i] 만큼이다.
   * 변의 길이는 삼각형이면 사인법칙으로, 사각형이면 두 변을 정한 뒤 도형이 닫히도록 나머지 두 변을 풀어 정한다.
   * 모양이 너무 찌그러지면 null.
   */
  function polygon(angles, rng) {
    var n = angles.length;
    var heads = [0];
    for (var i = 1; i < n; i++) heads.push(heads[i - 1] + 180 - angles[i]);
    var sides = null;
    if (n === 3) {
      sides = [1, Math.sin(angles[0] * RAD) / Math.sin(angles[2] * RAD)];
    } else {
      var u = heads.map(function (h) { return along(h, 1); });
      var det = u[2].x * u[3].y - u[2].y * u[3].x;
      for (var t = 0; t < 40 && !sides; t++) {
        var s1 = 0.6 + rng() * 0.8;
        var rx = -(u[0].x + s1 * u[1].x);
        var ry = -(u[0].y + s1 * u[1].y);
        var s2 = (rx * u[3].y - ry * u[3].x) / det;
        var s3 = (u[2].x * ry - u[2].y * rx) / det;
        if (s2 >= 0.55 && s2 <= 1.8 && s3 >= 0.55 && s3 <= 1.8) sides = [1, s1, s2];
      }
      if (!sides) return null;
    }
    var points = [{ x: 0, y: 0 }];
    for (var k = 0; k < n - 1; k++) {
      var step = along(heads[k], sides[k]);
      points.push({ x: points[k].x + step.x, y: points[k].y + step.y });
    }
    return { points: points, heads: heads };
  }

  /**
   * 밑변으로 눕힐 변. 시계 반대 방향으로 도므로 눕힌 변의 위쪽이 도형 안이다.
   * 아무 변이나 고르면 가늘고 높은 모양이 나와 그림이 작아지고 밑변 양 끝의 글자가 겹친다.
   * 그래서 그림이 가장 크게 들어가는 변과 거의 비슷한 변들 중에서만 고른다.
   */
  function pickBase(rng, poly) {
    var scales = poly.heads.map(function (h) {
      var pts = poly.points.map(function (p) { return rotate(p, -h); });
      var xs = pts.map(function (p) { return p.x; });
      var ys = pts.map(function (p) { return p.y; });
      var w = Math.max.apply(null, xs) - Math.min.apply(null, xs);
      var hh = Math.max.apply(null, ys) - Math.min.apply(null, ys);
      return Math.min(SHAPE_BOX.w / w, SHAPE_BOX.h / hh);
    });
    var top = Math.max.apply(null, scales);
    var choices = [];
    scales.forEach(function (s, k) {
      if (s >= 0.85 * top) choices.push(k);
    });
    return pick(rng, choices);
  }

  function makePolygon(rng, n) {
    for (var tries = 0; tries < 100; tries++) {
      var angles = n === 3 ? triangleAngles(rng) : quadAngles(rng);
      var poly = polygon(angles, rng);
      if (!poly) continue;
      var rot = -poly.heads[pickBase(rng, poly)] + randInt(rng, -12, 12);
      var unknown = randInt(rng, 0, n - 1);
      var q = {
        kind: 'shape',
        variant: n === 3 ? 'triangle' : 'quad',
        angles: angles,
        unknown: unknown,
        answer: angles[unknown],
        points: poly.points.map(function (p) { return rotate(p, rot); }),
        heads: poly.heads.map(function (h) { return normalize(h + rot); })
      };
      // 짧은 변 양 끝의 글자가 서로 겹치는 모양은 버리고 다시 만든다.
      if (!labelsCollide(layoutPolygon(q).corners)) return q;
    }
    throw new Error('도형을 만들지 못했습니다 (꼭짓점 ' + n + '개)');
  }

  /** 직선·삼각형·사각형에서 모르는 각 구하기 */
  function makeShape(rng) {
    var r = rng();
    if (r < 0.25) return makeLine(rng);
    return makePolygon(rng, r < 0.65 ? 3 : 4);
  }

  var MAKERS = {
    compare: makeCompare,
    classify: makeClassify,
    measure: makeMeasure,
    draw: makeDraw,
    estimate: makeEstimate,
    sum: makeSum,
    shape: makeShape
  };

  /** kind 종류의 문제 하나. rng 를 주면 그 난수로 만든다. */
  function generate(kind, rng) {
    return MAKERS[kind](rng || Math.random);
  }

  // ------------------------------------------------------------------ 배치 (SVG 좌표)

  var SINGLE_BOX = { x: 16, y: 14, w: VIEW.w - 32, h: VIEW.h - 28 };
  var SINGLE_RESERVE = 60;   // 풀이 때 덧그리는 선(직각 점선, 어림한 변)이 적어도 이만큼은 보이도록 비워 둘 반원
  var SINGLE_ARC = 28;       // 각을 표시하는 호의 반지름
  var SHAPE_BOX = { x: 26, y: 18, w: VIEW.w - 52, h: VIEW.h - 36 };

  /**
   * 각 하나 (예각·둔각, 어림하기): 꼭짓점, 두 변의 끝, 풀이 때 각도를 쓸 자리.
   * 풀이 때 덧그릴 선과 글자 자리까지 담아 가운데 맞춘다. 예각·둔각의 풀이에는 직각 점선이 지나가므로
   * 둔각이면 그 선을 피해 글자를 놓는다.
   */
  function layoutSingle(q) {
    var base = [{ x: 0, y: 0 }, along(q.rot, q.arms[0]), along(q.rot + q.deg, q.arms[1])];
    for (var d = 0; d <= 180; d += 10) base.push(along(q.rot + d, SINGLE_RESERVE));
    var off = labelAt({ x: 0, y: 0 }, q.rot, q.deg, {
      clear: SINGLE_ARC + 4,
      obstacles: q.kind === 'classify' ? [90] : []
    });
    // 글자는 그림과 함께 줄지 않는다. 좁은 각이면 꼭짓점에서 멀리 놓이므로 그 상자까지 담아서 맞춘다.
    var s = 1;
    var t = null;
    for (var k = 0; k < 6; k++) {
      var pts = base.slice();
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (c) {
        pts.push({ x: (off.x + c[0] * LABEL.w / 2) / s, y: -(off.y + c[1] * LABEL.h / 2) / s });
      });
      t = fit(pts, SINGLE_BOX, 1);
      if (Math.abs(t.scale - s) < 1e-4) break;
      s = t.scale;
    }
    var v = t.map(base[0]);
    return {
      vertex: v,
      ends: [t.map(base[1]), t.map(base[2])],
      reserve: SINGLE_RESERVE * t.scale,
      arc: SINGLE_ARC,
      label: { x: v.x + off.x, y: v.y + off.y }
    };
  }

  /** 두 각 비교: 가는 왼쪽 절반, 나는 오른쪽 절반. name 은 '가'·'나'를 쓸 자리. */
  function layoutCompare(q) {
    var half = VIEW.w / 2;
    return q.angles.map(function (a, i) {
      var pts = [{ x: 0, y: 0 }, along(a.rot, a.arms[0]), along(a.rot + a.deg, a.arms[1])];
      for (var d = 0; d <= a.deg; d += 10) pts.push(along(a.rot + d, 24));   // 각을 표시하는 호
      var t = fit(pts, { x: i * half + 14, y: 12, w: half - 28, h: VIEW.h - 52 }, 1);
      return {
        vertex: t.map(pts[0]),
        ends: [t.map(pts[1]), t.map(pts[2])],
        name: { x: i * half + half / 2, y: VIEW.h - 17 }
      };
    });
  }

  /** 합과 차: 반직선 세 개의 방향, 두 부분의 호, 전체를 감싸는 큰 호 */
  function layoutFan(q) {
    var v = { x: FAN.cx, y: FAN.cy };
    var dirs = [q.rot, q.rot + q.parts[0], q.rot + q.total];
    var parts = q.parts.map(function (p, i) {
      return {
        from: dirs[i],
        sweep: p,
        unknown: q.unknown === i,
        label: labelAt(v, dirs[i], p, { clear: FAN.part + 4 })
      };
    });
    // 전체 각의 숫자는 가운데 반직선을 피해 더 큰 부분 쪽, 큰 호 바깥에 쓴다.
    var big = q.parts[0] >= q.parts[1] ? 0 : 1;
    var dir = dirs[big] + q.parts[big] / 2;
    var dist = FAN.whole;
    while (boxReach(dist * Math.cos(dir * RAD), dist * Math.sin(dir * RAD)) < FAN.whole + 6) dist += 1;
    var whole = {
      from: dirs[0],
      sweep: q.total,
      unknown: q.unknown === 'total',
      label: polar(v.x, v.y, dist, dir)
    };
    return { vertex: v, rays: dirs, parts: parts, whole: whole };
  }

  /** 꼭짓점 하나의 각 표시. 모르는 각이 아닌 직각은 숫자 대신 ㄴ 표시를 한다. */
  function cornerAt(p, from, sweep, i, q, clear) {
    return {
      at: p,
      from: from,
      sweep: sweep,
      unknown: i === q.unknown,
      right: sweep === 90 && i !== q.unknown,
      label: labelAt(p, from, sweep, { clear: clear })
    };
  }

  /** 직선 위의 각: 가로 직선과 위로 뻗은 반직선 */
  function layoutLine(q) {
    var v = { x: VIEW.w / 2, y: 186 };
    var from = 0;
    var rays = [];
    var corners = q.angles.map(function (a, i) {
      var c = cornerAt(v, from, a, i, q, 26);
      from += a;
      if (i < q.angles.length - 1) rays.push(from);
      return c;
    });
    return {
      vertex: v,
      ends: [{ x: 22, y: v.y }, { x: VIEW.w - 22, y: v.y }],
      rays: rays,
      rayLength: 142,
      corners: corners
    };
  }

  /** 모서리 글자끼리 겹치는가. ㄴ 표시만 하는 모서리에는 글자가 없다. */
  function labelsCollide(corners) {
    var spots = corners.filter(function (c) { return !c.right; }).map(function (c) { return c.label; });
    for (var i = 0; i < spots.length; i++) {
      for (var j = 0; j < i; j++) {
        if (Math.abs(spots[i].x - spots[j].x) < LABEL.w + 2 && Math.abs(spots[i].y - spots[j].y) < LABEL.h + 2) return true;
      }
    }
    return false;
  }

  /** 삼각형·사각형: 꼭짓점과 각 표시 */
  function layoutPolygon(q) {
    var t = fit(q.points, SHAPE_BOX);
    var points = q.points.map(t.map);
    return {
      points: points,
      corners: points.map(function (p, i) { return cornerAt(p, q.heads[i], q.angles[i], i, q, 26); })
    };
  }

  // ------------------------------------------------------------------ 채점

  /**
   * 각도 입력 → { value } 또는 { error: 'empty' | 'format' }.
   * '35', '35°', '35 도', 전각 숫자 '３５' 를 모두 35 로 읽는다.
   */
  function parseDegrees(raw) {
    var s = String(raw == null ? '' : raw)
      .replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
      .replace(/\s+/g, '')
      .replace(/(°|º|˚|도)$/, '');
    if (!s) return { error: 'empty' };
    if (!/^\d{1,3}$/.test(s)) return { error: 'format' };
    return { value: Number(s) };
  }

  /**
   * 채점. answer 는 고르기 문제면 값('a', 'acute' …), 나머지는 각도(수).
   * @returns {{correct:boolean, perfect:boolean, diff:?number, reversed:boolean}}
   *   reversed: 각도기의 반대쪽 눈금을 읽은 답 (180° − 정답)
   */
  function grade(q, answer) {
    var res = { correct: false, perfect: false, diff: null, reversed: false };
    if (q.kind === 'compare' || q.kind === 'classify') {
      res.correct = res.perfect = answer === q.answer;
      return res;
    }
    var diff = Math.abs(answer - q.answer);
    res.diff = diff;
    if (q.kind === 'draw') {
      res.correct = diff <= DRAW_TOLERANCE;
      res.perfect = diff === 0;
    } else if (q.kind === 'estimate') {
      res.correct = diff <= ESTIMATE_OK;
      res.perfect = diff <= ESTIMATE_GREAT;
    } else {
      res.correct = res.perfect = diff === 0;
    }
    if (!res.correct && (q.kind === 'measure' || q.kind === 'draw')) {
      res.reversed = Math.abs(answer - (180 - q.answer)) <= (q.kind === 'draw' ? DRAW_TOLERANCE : 0);
    }
    return res;
  }

  /** 풀이 식. 예) '180° − 50° − 70° = 60°'. 식으로 풀지 않는 문제는 빈 문자열. */
  function equation(q) {
    var v = q.variant;
    if (v === 'calc') {
      return q.terms[0] + '° ' + (q.op === '+' ? '+' : MINUS) + ' ' + q.terms[1] + '° = ' + q.answer + '°';
    }
    if (v === 'sum') return q.parts[0] + '° + ' + q.parts[1] + '° = ' + q.total + '°';
    if (v === 'diff') return q.total + '° ' + MINUS + ' ' + q.parts[1 - q.unknown] + '° = ' + q.answer + '°';
    if (v === 'line' || v === 'triangle' || v === 'quad') {
      var terms = [(v === 'quad' ? 360 : 180) + '°'];
      q.angles.forEach(function (a, i) {
        if (i !== q.unknown) terms.push(a + '°');
      });
      return terms.join(' ' + MINUS + ' ') + ' = ' + q.answer + '°';
    }
    return '';
  }

  return {
    VIEW: VIEW,
    PROTRACTOR: PROTRACTOR,
    FAN: FAN,
    LABEL: LABEL,
    KINDS: KINDS,
    CLASS_NAMES: CLASS_NAMES,
    DRAW_TOLERANCE: DRAW_TOLERANCE,
    ESTIMATE_OK: ESTIMATE_OK,
    ESTIMATE_GREAT: ESTIMATE_GREAT,
    normalize: normalize,
    classify: classify,
    along: along,
    rotate: rotate,
    polar: polar,
    direction: direction,
    arcPath: arcPath,
    sectorPath: sectorPath,
    rightMarkPath: rightMarkPath,
    clearDistance: clearDistance,
    labelAt: labelAt,
    fit: fit,
    rayInView: rayInView,
    readScales: readScales,
    scaleFor: scaleFor,
    armDirection: armDirection,
    valueFromDirection: valueFromDirection,
    clampUpper: clampUpper,
    scalePoint: scalePoint,
    protractorMarks: protractorMarks,
    mulberry32: mulberry32,
    generate: generate,
    polygon: polygon,
    layoutSingle: layoutSingle,
    layoutCompare: layoutCompare,
    layoutFan: layoutFan,
    layoutLine: layoutLine,
    layoutPolygon: layoutPolygon,
    parseDegrees: parseDegrees,
    grade: grade,
    equation: equation
  };
});
