/* angle.js 검증. test.html 에서 실행되고, node js/angle.test.js 로도 돌릴 수 있다. */
(function (global) {
  'use strict';

  var A = global.Angle || require('./angle.js');
  var results = [];

  function eq(actual, expected, label) {
    var a = String(actual);
    var e = String(expected);
    results.push({ pass: a === e, label: label, actual: a, expected: e });
  }

  /** n건을 검사해 한 줄로 남긴다. check 는 문제가 없으면 null, 있으면 설명을 돌려준다. */
  function all(n, label, check) {
    var fail = 0;
    var sample = null;
    for (var i = 0; i < n; i++) {
      var msg = check(i);
      if (msg) {
        fail++;
        if (!sample) sample = msg;
      }
    }
    eq(fail, 0, label + ' ' + n + '건' + (sample ? ' (첫 실패: ' + sample + ')' : ''));
  }

  // ---- 기하 ------------------------------------------------------------
  eq(Object.is(A.normalize(-0), 0), true, 'normalize(-0) 은 +0');
  eq(A.normalize(360), 0, 'normalize(360)');
  eq(A.normalize(-90), 270, 'normalize(-90)');
  eq(A.normalize(725), 5, 'normalize(725)');

  [[0, null], [1, 'acute'], [89, 'acute'], [90, 'right'], [91, 'obtuse'], [179, 'obtuse'], [180, null]]
    .forEach(function (c) { eq(A.classify(c[0]), c[1], 'classify(' + c[0] + ')'); });

  var up = A.polar(0, 0, 10, 90);
  eq(Math.round(up.x) + ',' + Math.round(up.y), '0,-10', 'polar 90° 는 화면 위쪽 (SVG y 가 줄어든다)');

  all(360, '방향 왕복 polar → direction', function (d) {
    var c = { x: 100, y: 50 };
    var got = A.direction(c, A.polar(c.x, c.y, 80, d));
    var diff = Math.abs(got - d);
    return Math.min(diff, 360 - diff) < 1e-9 ? null : d + ' -> ' + got;
  });

  eq(A.arcPath(0, 0, 10, 0, 90), 'M10 0 A10 10 0 0 0 0 -10', 'arcPath 90° — 시계 반대 방향(sweep-flag 0)');
  eq(A.arcPath(0, 0, 10, 0, 270).indexOf(' 0 1 0 ') !== -1, true, 'arcPath 270° 는 큰 호(large-arc 1)');
  eq(A.rightMarkPath(0, 0, 10, 0), 'M10 0 L10 -10 L0 -10', 'rightMarkPath — ㄴ 표시');

  var rot = A.rotate({ x: 1, y: 0 }, 90);
  eq(Math.round(rot.x) + ',' + Math.round(rot.y), '0,1', 'rotate 90° (모형 좌표)');

  var t = A.fit([{ x: 0, y: 0 }, { x: 10, y: 5 }], { x: 0, y: 0, w: 100, h: 100 });
  var t0 = t.map({ x: 0, y: 0 });
  var t1 = t.map({ x: 10, y: 5 });
  eq([t.scale, t0.x, t0.y, t1.x, t1.y].join(','), '10,0,75,100,25', 'fit — 가운데 맞추고 y 를 뒤집는다');

  // ---- 각도기 ----------------------------------------------------------
  all(362, '각도기 — 맞는 눈금은 정답, 반대쪽 눈금은 180° − 정답', function (i) {
    var side = i % 2 ? 'left' : 'right';
    var deg = Math.floor(i / 2);
    var dir = A.armDirection(side, deg);
    var s = A.readScales(dir);
    var right = A.scaleFor(side);
    var wrong = right === 'inner' ? 'outer' : 'inner';
    if (s[right] !== deg) return side + ' ' + deg + ': ' + right + ' 눈금이 ' + s[right];
    if (s[wrong] !== 180 - deg) return side + ' ' + deg + ': ' + wrong + ' 눈금이 ' + s[wrong];
    if (A.valueFromDirection(side, dir) !== deg) return side + ' ' + deg + ': 되돌리면 ' + A.valueFromDirection(side, dir);
    return null;
  });

  var P = A.PROTRACTOR;
  var marks = A.protractorMarks();
  eq(marks.ticks.length, 181, '각도기 눈금 181개 (0°~180°)');
  eq(marks.ticks.filter(function (k) { return k.size === 'major'; }).length, 19, '긴 눈금 19개 (10°마다)');
  eq(marks.labels.length, 19, '눈금 숫자 19쌍');
  eq(marks.labels[0].inner.text + '/' + marks.labels[0].outer.text, '0/180', '오른쪽 끝: 안쪽 0, 바깥쪽 180');
  eq(marks.labels[18].inner.text + '/' + marks.labels[18].outer.text, '180/0', '왼쪽 끝: 안쪽 180, 바깥쪽 0');
  var at30 = A.direction({ x: P.cx, y: P.cy }, marks.labels[3].inner);
  eq(Math.abs(at30 - 30) < 1e-9, true, '안쪽 30 은 30° 방향에 적힌다');
  all(19, '눈금 숫자가 그림 안에 있다', function (i) {
    var l = marks.labels[i];
    var ok = [l.inner, l.outer].every(function (p) {
      return p.x > 10 && p.x < A.VIEW.w - 10 && p.y > 10 && p.y < P.cy - 3;
    });
    return ok ? null : l.d + '°';
  });
  all(181, '각 그리기 — 손잡이(반지름 12)가 그림 밖으로 나가지 않는다', function (d) {
    var e = A.polar(P.cx, P.cy, P.arm, d);
    return e.x - 12 >= 0 && e.x + 12 <= A.VIEW.w && e.y - 12 >= 0 ? null : d + '°';
  });

  eq(Math.round(A.rayInView({ x: 370, y: 100 }, 0, 50, 8)), 2, 'rayInView — 오른쪽 가장자리에서 멈춘다');
  eq(Math.round(A.rayInView({ x: 190, y: 100 }, 90, 50, 8)), 50, 'rayInView — 여유가 있으면 원하는 길이 그대로');

  eq(A.clampUpper(190), 180, 'clampUpper(190) — 왼쪽 아래는 180');
  eq(A.clampUpper(350), 0, 'clampUpper(350) — 오른쪽 아래는 0');
  eq(A.clampUpper(-10), 0, 'clampUpper(-10)');
  eq(A.clampUpper(135), 135, 'clampUpper(135)');

  // ---- 입력 ------------------------------------------------------------
  [['35', 35], ['35°', 35], [' 35 도', 35], ['３５', 35], ['3 5', 35], ['180', 180], ['0', 0], ['007', 7]]
    .forEach(function (c) { eq(A.parseDegrees(c[0]).value, c[1], 'parseDegrees("' + c[0] + '")'); });
  [['', 'empty'], ['  ', 'empty'], ['°', 'empty'], ['abc', 'format'], ['35.5', 'format'], ['-5', 'format'], ['1000', 'format']]
    .forEach(function (c) { eq(A.parseDegrees(c[0]).error, c[1], 'parseDegrees 거부: "' + c[0] + '"'); });

  // ---- 채점 ------------------------------------------------------------
  var mq = { kind: 'measure', deg: 35, side: 'left', answer: 35 };
  eq(A.grade(mq, 35).correct, true, '각도기 읽기 35 → 정답');
  eq(A.grade(mq, 145).reversed, true, '각도기 읽기 145 → 반대쪽 눈금');
  eq(A.grade(mq, 40).correct + '/' + A.grade(mq, 40).reversed, 'false/false', '각도기 읽기 40 → 그냥 오답');
  eq(A.grade({ kind: 'measure', deg: 90, answer: 90 }, 90).correct, true, '각도기 읽기 90 → 정답 (두 눈금이 같다)');

  var dq = { kind: 'draw', deg: 70, side: 'right', answer: 70 };
  eq(A.grade(dq, 70).perfect, true, '각 그리기 70 → 정확');
  eq(A.grade(dq, 72).correct + '/' + A.grade(dq, 72).perfect, 'true/false', '각 그리기 72 → 2° 안이라 정답');
  eq(A.grade(dq, 73).correct, false, '각 그리기 73 → 오답');
  eq(A.grade(dq, 111).reversed, true, '각 그리기 111 → 반대쪽 눈금 (110 근처)');

  var eqz = { kind: 'estimate', deg: 55, answer: 55 };
  eq([60, 65, 66, 45, 44].map(function (v) {
    var r = A.grade(eqz, v);
    return v + ':' + (r.perfect ? 'great' : r.correct ? 'ok' : 'miss');
  }).join(' '), '60:great 65:ok 66:miss 45:ok 44:miss', '어림하기 55 — 5° 안은 아주 잘, 10° 안은 정답');

  eq(A.grade({ kind: 'classify', answer: 'acute' }, 'acute').correct, true, '예각 고르기 → 정답');
  eq(A.grade({ kind: 'compare', answer: 'same' }, 'a').correct, false, '크기가 같은데 가 → 오답');

  // ---- 문제 만들기 (시드 고정) -----------------------------------------
  var rng = A.mulberry32(20260928);
  function gen(kind) { return A.generate(kind, rng); }
  function step5(n) { return n % 5 === 0; }

  var trapCount = 0;
  var diffCount = 0;
  all(600, '크기 비교 문제', function () {
    var q = gen('compare');
    var a = q.angles[0].deg;
    var b = q.angles[1].deg;
    if (q.answer !== (a > b ? 'a' : b > a ? 'b' : 'same')) return a + ' vs ' + b + ' → ' + q.answer;
    var gap = Math.abs(a - b);
    if (gap !== 0 && (gap < 15 || gap > 70)) return '차이 ' + gap;
    if (!(a >= 20 && a <= 160 && b >= 20 && b <= 160)) return '범위 ' + a + ', ' + b;
    var len = q.angles.map(function (g) { return (g.arms[0] + g.arms[1]) / 2; });
    if (Math.max(len[0], len[1]) < 1.4 * Math.min(len[0], len[1])) return '변 길이 차이가 작다 ' + len;
    if (gap) {
      diffCount++;
      if ((a < b) === (len[0] > len[1])) trapCount++;
    }
    return null;
  });
  var trapShare = trapCount / diffCount;
  eq(trapShare > 0.55 && trapShare < 0.75, true, '크기 비교 — 작은 각에 긴 변을 주는 문제가 약 65% (' + Math.round(trapShare * 100) + '%)');

  var rightCount = 0;
  all(600, '예각·직각·둔각 문제', function () {
    var q = gen('classify');
    if (q.answer !== A.classify(q.deg)) return q.deg + ' → ' + q.answer;
    if (!step5(q.deg) || q.deg < 30 || q.deg > 160) return '각도 ' + q.deg;
    if (q.deg === 90) rightCount++;
    return null;
  });
  eq(rightCount > 140 && rightCount < 220, true, '예각·직각·둔각 — 직각이 약 30% (' + rightCount + '/600)');

  all(400, '각도기 읽기 문제', function () {
    var q = gen('measure');
    if (!step5(q.deg) || q.deg < 10 || q.deg > 170) return '각도 ' + q.deg;
    if (q.side !== 'right' && q.side !== 'left') return 'side ' + q.side;
    return q.answer === q.deg ? null : 'answer ' + q.answer;
  });

  all(400, '각 그리기 문제 — 시작 위치가 목표에서 25° 이상 떨어져 있다', function () {
    var q = gen('draw');
    if (!step5(q.deg) || q.deg < 10 || q.deg > 170) return '각도 ' + q.deg;
    if (Math.abs(q.start - q.deg) < 25 || q.start < 20 || q.start > 160) return q.deg + ' 시작 ' + q.start;
    return null;
  });

  all(400, '어림하기 문제', function () {
    var q = gen('estimate');
    return step5(q.deg) && q.deg >= 30 && q.deg <= 160 ? null : '각도 ' + q.deg;
  });

  /** '180° − 50° − 70° = 60°' → 왼쪽을 계산한 값과 오른쪽 값 */
  function evalEquation(s) {
    var halves = s.split('=');
    var tokens = halves[0].replace(/°/g, '').trim().split(/\s+/);
    var v = Number(tokens[0]);
    for (var i = 1; i < tokens.length; i += 2) {
      v = tokens[i] === '+' ? v + Number(tokens[i + 1]) : v - Number(tokens[i + 1]);
    }
    return { lhs: v, rhs: parseInt(halves[1], 10) };
  }

  function checkEquation(q) {
    var e = A.equation(q);
    var r = evalEquation(e);
    return r.lhs === r.rhs && r.rhs === q.answer ? null : '식이 틀림: ' + e;
  }

  var variants = {};
  all(800, '합과 차 문제 — 답과 풀이 식이 맞는다', function () {
    var q = gen('sum');
    variants[q.variant] = (variants[q.variant] || 0) + 1;
    if (q.variant === 'calc') {
      if (q.answer !== (q.op === '+' ? q.terms[0] + q.terms[1] : q.terms[0] - q.terms[1])) return 'calc ' + q.answer;
      if (q.answer <= 0) return '답이 0 이하 ' + q.answer;
    } else {
      if (q.parts[0] + q.parts[1] !== q.total) return '합이 틀림';
      if (Math.min(q.parts[0], q.parts[1]) < 35 || q.total > 170) return '크기 ' + q.parts;
      if (q.rot < 0 || q.rot + q.total > 180) return '반원 밖 ' + q.rot + '+' + q.total;
      var want = q.variant === 'sum' ? q.total : q.parts[q.unknown];
      if (q.answer !== want) return q.variant + ' ' + q.answer;
    }
    return checkEquation(q);
  });
  eq(!!(variants.calc && variants.sum && variants.diff), true, '합과 차 — 세 가지가 모두 나온다');

  /** 모형 좌표 다각형의 내각 (시계 반대 방향으로 돈다고 보고) */
  function interior(points) {
    var n = points.length;
    return points.map(function (p, i) {
      var next = points[(i + 1) % n];
      var prev = points[(i + n - 1) % n];
      var a1 = Math.atan2(next.y - p.y, next.x - p.x);
      var a2 = Math.atan2(prev.y - p.y, prev.x - p.x);
      return A.normalize((a2 - a1) * 180 / Math.PI);
    });
  }

  var shapes = {};
  all(1500, '삼각형·사각형·직선 문제 — 그림의 각이 적힌 각과 같다', function () {
    var q = gen('shape');
    shapes[q.variant] = (shapes[q.variant] || 0) + 1;
    var whole = q.variant === 'quad' ? 360 : 180;
    var sum = q.angles.reduce(function (s, a) { return s + a; }, 0);
    if (sum !== whole) return q.variant + ' 합 ' + sum;
    if (q.answer !== q.angles[q.unknown]) return '답 ' + q.answer;
    if (q.angles.some(function (a) { return !step5(a) || a < 30; })) return '각 ' + q.angles;
    if (q.variant !== 'line') {
      var got = interior(q.points);
      for (var i = 0; i < got.length; i++) {
        if (Math.abs(got[i] - q.angles[i]) > 1e-6) return q.variant + ' ' + q.angles + ' 인데 그림은 ' + got.map(Math.round);
        var h = Math.atan2(q.points[(i + 1) % got.length].y - q.points[i].y, q.points[(i + 1) % got.length].x - q.points[i].x) * 180 / Math.PI;
        var dh = Math.abs(A.normalize(h) - q.heads[i]);
        if (Math.min(dh, 360 - dh) > 1e-6) return '변의 방향 ' + i;
      }
    }
    return checkEquation(q);
  });
  eq(!!(shapes.line && shapes.triangle && shapes.quad), true, '삼각형·사각형 — 직선·삼각형·사각형이 모두 나온다');

  // ---- 배치: 글자가 선이나 다른 글자와 겹치지 않는다 -------------------
  var W = A.VIEW.w;
  var H = A.VIEW.h;

  function box(p) {
    return { x: p.x - A.LABEL.w / 2, y: p.y - A.LABEL.h / 2, w: A.LABEL.w, h: A.LABEL.h };
  }

  function inView(r, margin) {
    return r.x >= margin && r.y >= margin && r.x + r.w <= W - margin && r.y + r.h <= H - margin;
  }

  function overlaps(a, b) {
    return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  }

  /** 선분이 상자를 지나는가 (Liang–Barsky) */
  function hits(a, b, r) {
    var t0 = 0;
    var t1 = 1;
    var dx = b.x - a.x;
    var dy = b.y - a.y;
    var p = [-dx, dx, -dy, dy];
    var q = [a.x - r.x, r.x + r.w - a.x, a.y - r.y, r.y + r.h - a.y];
    for (var i = 0; i < 4; i++) {
      if (p[i] === 0) {
        if (q[i] < 0) return false;
      } else {
        var k = q[i] / p[i];
        if (p[i] < 0) {
          if (k > t1) return false;
          if (k > t0) t0 = k;
        } else {
          if (k < t0) return false;
          if (k < t1) t1 = k;
        }
      }
    }
    return true;
  }

  /** 점에서 상자까지 가장 가까운 거리 */
  function reachOf(v, r) {
    var dx = Math.max(r.x - v.x, 0, v.x - (r.x + r.w));
    var dy = Math.max(r.y - v.y, 0, v.y - (r.y + r.h));
    return Math.sqrt(dx * dx + dy * dy);
  }

  function pt(p) { return Math.round(p.x) + ',' + Math.round(p.y); }

  all(1500, '삼각형·사각형·직선 배치', function () {
    var q = gen('shape');
    var L;
    var segs = [];
    if (q.variant === 'line') {
      L = A.layoutLine(q);
      segs.push([L.ends[0], L.ends[1]]);
      L.rays.forEach(function (d) {
        var e = A.polar(L.vertex.x, L.vertex.y, L.rayLength, d);
        if (e.y < 8) segs.push(null);
        segs.push([L.vertex, e]);
      });
    } else {
      L = A.layoutPolygon(q);
      L.points.forEach(function (p, i) { segs.push([p, L.points[(i + 1) % L.points.length]]); });
      if (L.points.some(function (p) { return p.x < 10 || p.y < 10 || p.x > W - 10 || p.y > H - 10; })) return '꼭짓점이 그림 밖';
    }
    if (segs.indexOf(null) !== -1) return '반직선이 그림 밖';
    var boxes = [];
    for (var i = 0; i < L.corners.length; i++) {
      var c = L.corners[i];
      if (c.right) continue;                    // ㄴ 표시만 하고 숫자는 쓰지 않는다
      var r = box(c.label);
      if (!inView(r, 2)) return q.variant + ' 글자가 그림 밖 ' + pt(c.label);
      for (var s = 0; s < segs.length; s++) {
        if (hits(segs[s][0], segs[s][1], r)) return q.variant + ' ' + q.angles + ' — ' + c.sweep + '° 글자가 선과 겹침';
      }
      if (reachOf(c.at, r) < 24) return q.variant + ' 글자가 호와 겹침';
      for (var j = 0; j < boxes.length; j++) {
        if (overlaps(r, boxes[j])) return q.variant + ' ' + q.angles + ' — 글자끼리 겹침';
      }
      boxes.push(r);
    }
    return null;
  });

  all(800, '합과 차 배치', function () {
    var q = gen('sum');
    if (q.variant === 'calc') return null;
    var L = A.layoutFan(q);
    var v = L.vertex;
    var segs = L.rays.map(function (d) { return [v, A.polar(v.x, v.y, A.FAN.ray, d)]; });
    if (segs.some(function (sg) { return sg[1].x < 8 || sg[1].x > W - 8 || sg[1].y < 8; })) return '반직선이 그림 밖';
    var labels = L.parts.map(function (p) { return { r: box(p.label), part: true }; });
    labels.push({ r: box(L.whole.label), part: false });
    for (var i = 0; i < labels.length; i++) {
      var r = labels[i].r;
      if (!inView(r, 2)) return '글자가 그림 밖 ' + q.parts;
      for (var s = 0; s < segs.length; s++) {
        if (hits(segs[s][0], segs[s][1], r)) return q.parts + ' — 글자가 반직선과 겹침';
      }
      var near = reachOf(v, r);
      if (labels[i].part && near < A.FAN.part + 3) return q.parts + ' — 글자가 작은 호와 겹침';
      var far = Math.max.apply(null, [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]]
        .map(function (c) { return Math.sqrt(Math.pow(c[0] - v.x, 2) + Math.pow(c[1] - v.y, 2)); }));
      if (labels[i].part && far > A.FAN.whole - 3) return q.parts + ' — 글자가 큰 호와 겹침';
      if (!labels[i].part && near < A.FAN.whole + 3) return q.parts + ' — 전체 각 글자가 큰 호와 겹침';
      for (var j = 0; j < i; j++) {
        if (overlaps(r, labels[j].r)) return q.parts + ' — 글자끼리 겹침';
      }
    }
    return null;
  });

  all(1500, '각 하나(예각·둔각, 어림하기) 배치', function (i) {
    var q = gen(i % 2 ? 'classify' : 'estimate');
    var L = A.layoutSingle(q);
    var v = L.vertex;
    var pts = L.ends.slice();
    for (var d = 0; d <= 180; d += 5) pts.push(A.polar(v.x, v.y, L.reserve, q.rot + d));
    if (pts.some(function (p) { return p.x < 8 || p.y < 8 || p.x > W - 8 || p.y > H - 8; })) return q.kind + ' 선이 그림 밖';
    // 예각·둔각 풀이에서는 직각 점선을 피해 숫자를 쓴다.
    var refs = q.kind === 'classify' ? [90] : [];
    var r = box(L.label);
    if (!inView(r, 2)) return q.kind + ' ' + q.deg + '° 글자가 그림 밖';
    if (L.ends.some(function (e) { return hits(v, e, r); })) return q.kind + ' ' + q.deg + '° 글자가 변과 겹침';
    var reach = Math.min.apply(null, L.ends.map(function (e) { return Math.hypot(e.x - v.x, e.y - v.y); }));
    if (refs.length && hits(v, A.polar(v.x, v.y, reach, q.rot + 90), r)) return q.deg + '° 글자가 직각 점선과 겹침';
    return reachOf(v, r) < 30 ? q.deg + '° 글자가 호와 겹침' : null;
  });

  all(600, '크기 비교 배치 — 가·나가 제 칸 안에 있다', function () {
    var q = gen('compare');
    var bad = null;
    A.layoutCompare(q).forEach(function (L, i) {
      var lo = i * W / 2 + 4;
      var hi = (i + 1) * W / 2 - 4;
      [L.vertex].concat(L.ends).forEach(function (p) {
        if (p.x < lo || p.x > hi || p.y < 4 || p.y > H - 36) bad = (i ? '나' : '가') + ' 가 칸 밖 ' + pt(p);
      });
    });
    return bad;
  });

  global.ANGLE_TEST_RESULTS = results;

  // node js/angle.test.js 로 돌렸을 때만 결과를 찍는다.
  if (typeof window === 'undefined' && typeof process !== 'undefined') {
    var failed = results.filter(function (r) { return !r.pass; });
    failed.forEach(function (r) { console.log('✗ ' + r.label + '  기대: ' + r.expected + '  실제: ' + r.actual); });
    console.log((failed.length ? 'FAIL ' + failed.length : 'PASS ' + results.length) + ' / ' + results.length);
    process.exitCode = failed.length ? 1 : 0;
  }
})(typeof window !== 'undefined' ? window : globalThis);
