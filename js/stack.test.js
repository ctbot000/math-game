/* stack.js 검증. test.html 에서 실행되고, node js/stack.test.js 로도 돌릴 수 있다. */
(function (global) {
  'use strict';

  var S = global.Stack || require('./stack.js');
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

  // ---- 수 -------------------------------------------------------------
  // 학습지 그림: 1, 5, 14, 30, 55, … 여섯째는 1 + 4 + 9 + 16 + 25 + 36 = 91
  eq([1, 2, 3, 4, 5, 6].map(function (n) { return S.total('pyramid', n); }).join(','), '1,5,14,30,55,91', '피라미드 개수');
  eq(S.equation('pyramid', 6), '1 + 4 + 9 + 16 + 25 + 36 = 91', '피라미드 여섯째 식');
  eq([1, 2, 3, 4, 5].map(function (n) { return S.total('stairs', n); }).join(','), '1,3,6,10,15', '계단 개수');
  eq([1, 2, 3, 4, 5].map(function (n) { return S.total('corner', n); }).join(','), '1,4,10,20,35', '모서리 계단 개수');
  eq(S.layers('corner', 4).join(','), '1,3,6,10', '모서리 계단 층별');
  eq(S.growth('pyramid', 5), 25, '피라미드 넷째 → 다섯째 늘어난 수');
  eq(S.growth('stairs', 7), 7, '계단 여섯째 → 일곱째 늘어난 수');
  eq(S.runningTotals([1, 4, 9, 16]).join(','), '1,5,14,30', '앞에서부터 더한 값');
  eq(S.ordinal(1) + S.ordinal(6) + S.ordinal(10), '첫째여섯째열째', '서수');

  // ---- 모양: 쌓기나무를 직접 세면 공식과 같다 -----------------------
  S.FAMILIES.forEach(function (f) {
    all(10, f + ' 직접 센 개수·층별 개수 = 공식', function (i) {
      var n = i + 1;
      var list = S.cubes(f, n);
      if (list.length !== S.total(f, n)) return n + '째 ' + list.length + '개';
      var per = S.layers(f, n).map(function () { return 0; });
      list.forEach(function (c) { per[c.layer - 1]++; });
      if (per.join() !== S.layers(f, n).join()) return n + '째 층별 ' + per.join();
      return null;
    });
    all(10, f + ' 공중에 뜬 쌓기나무 없음', function (i) {
      var n = i + 1;
      var at = {};
      var list = S.cubes(f, n);
      list.forEach(function (c) { at[c.x + ',' + c.d + ',' + c.z] = true; });
      var bad = list.filter(function (c) { return c.z > 0 && !at[c.x + ',' + c.d + ',' + (c.z - 1)]; })[0];
      return bad ? n + '째 (' + bad.x + ',' + bad.d + ',' + bad.z + ')' : null;
    });
  });

  // 피라미드 셋째: 맨 아래 3×3 의 가운데 뒤쪽 칸들은 위가 덮여 안 보인다.
  eq(S.visibleCount('pyramid', 1), 1, '피라미드 첫째 보이는 수');
  eq(S.visibleCount('stairs', 6), 21, '계단은 모두 보인다');
  eq(S.visibleCount('pyramid', 3) < S.total('pyramid', 3), true, '피라미드 셋째는 가려진 쌓기나무가 있다');
  eq(S.visibleByLayer('pyramid', 3).reduce(function (a, b) { return a + b; }, 0), S.visibleCount('pyramid', 3),
    '층별 보이는 수의 합');

  // ---- 그림: 그리는 순서대로 덮으면 실제로 앞에 있는 쌓기나무가 보인다 ----
  // 그림의 한 점을 지나는 시선은 (x, d, z) + t(−SKEW.x, 1, −SKEW.y). d 가 작을수록 보는 사람 쪽이다.
  function inside(poly, p) {
    var sign = 0;
    for (var i = 0; i < poly.length; i++) {
      var a = poly[i];
      var b = poly[(i + 1) % poly.length];
      var cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
      if (Math.abs(cross) < 1e-9) return false;
      var s = cross > 0 ? 1 : -1;
      if (sign && s !== sign) return false;
      sign = s;
    }
    return true;
  }

  function faceDepth(c, face, p) {
    if (face === 'front') return c.d;
    if (face === 'top') return (-p.y - c.z - 1) / S.SKEW.y;
    return (p.x - c.x - 1) / S.SKEW.x;
  }

  S.FAMILIES.forEach(function (f) {
    var checked = 0;
    all(6, f + ' 그리는 순서 (그림 위 점마다 맨 앞 쌓기나무가 마지막에 그려짐)', function (i) {
      var n = i + 1;
      var list = S.cubes(f, n);
      var b = S.bounds(f, n);
      for (var gx = 0; gx < 60; gx++) {
        for (var gy = 0; gy < 60; gy++) {
          // 모서리에 걸리지 않도록 무리수만큼 비껴 찍는다
          var p = { x: b.minX + (gx + 0.5 + 0.1 * Math.SQRT2) * b.w / 60, y: b.minY + (gy + 0.5 + 0.1 * Math.PI) * b.h / 60 };
          var painted = -1;
          var nearest = -1;
          var best = Infinity;
          list.forEach(function (c, idx) {
            ['front', 'top', 'right'].forEach(function (face) {
              if (!inside(c.faces[face], p)) return;
              painted = idx;
              var dep = faceDepth(c, face, p);
              if (dep < best - 1e-9) { best = dep; nearest = idx; }
            });
          });
          if (painted < 0) continue;
          checked++;
          if (list[painted] !== list[nearest]) {
            return n + '째 점 (' + p.x.toFixed(2) + ',' + p.y.toFixed(2) + ')';
          }
        }
      }
      return null;
    });
    eq(checked > 1000, true, f + ' 그리는 순서 검사에서 실제로 덮인 점을 충분히 봤다');
  });

  // ---- 문제 만들기 ----------------------------------------------------
  S.KINDS.forEach(function (kind) {
    var rng = S.mulberry32(7);
    all(500, kind + ' 문제 만들기', function () {
      var q = S.generate(kind, rng);
      if (S.FAMILIES.indexOf(q.family) < 0) return '모양 ' + q.family;
      if (!(q.n >= 2 && q.n <= 10)) return 'n=' + q.n;
      var expect = kind === 'grow' ? S.growth(q.family, q.n) : S.total(q.family, q.n);
      if (q.answer !== expect) return q.family + ' ' + q.n + ' 답 ' + q.answer;
      if (kind === 'next' && q.shown[q.shown.length - 1] !== q.n - 1) return '바로 앞 모양이 없다';
      if (q.shown && q.shown.length > 4) return '보여 주는 모양 ' + q.shown.length + '개';
      if (kind === 'nth' && q.n <= 4) return 'n째 모양이 이미 그림에 있다';
      return null;
    });
  });
  var famCount = { pyramid: 0, stairs: 0, corner: 0 };
  var frng = S.mulberry32(3);
  for (var k = 0; k < 2000; k++) famCount[S.generate('grow', frng).family]++;
  eq(famCount.pyramid > 850 && famCount.stairs > 400 && famCount.corner > 400, true,
    '모양 고르기: 피라미드 약 절반 (' + famCount.pyramid + '/' + famCount.stairs + '/' + famCount.corner + ')');
  eq(S.generate('nth', S.mulberry32(1), 'pyramid').family, 'pyramid', '모양을 정해서 만들기');

  // ---- 입력 -----------------------------------------------------------
  eq(S.parseCount('30').value, 30, "parseCount('30')");
  eq(S.parseCount(' 3 0 개').value, 30, "parseCount(' 3 0 개')");
  eq(S.parseCount('９１').value, 91, 'parseCount 전각 숫자');
  eq(S.parseCount('').error, 'empty', 'parseCount 빈칸');
  eq(S.parseCount('-3').error, 'format', 'parseCount 음수');
  eq(S.parseCount('삼십').error, 'format', 'parseCount 한글');

  // ---- 채점 -----------------------------------------------------------
  var q4 = { kind: 'layers', family: 'pyramid', n: 4, layers: [1, 4, 9, 16], total: 30, answer: 30 };
  eq(S.grade(q4, { layers: [1, 4, 9, 16], total: 30 }).correct, true, '층별: 정답');
  // 학습지에 실제로 나온 실수: 둘째 모양의 전체 개수 5 를 층 개수로 썼다
  eq(S.grade(q4, { layers: [1, 5, 9, 16], total: 31 }).mistake, 'running', '층별: 1 + 5 + 9 + 16 은 running');
  eq(S.grade(q4, { layers: [1, 5, 14, 30], total: 50 }).mistake, 'running', '층별: 1 + 5 + 14 + 30 은 running');
  eq(S.grade(q4, { layers: [1, 4, 9, 16], total: 31 }).mistake, 'sumSlip', '층별: 더하기만 틀림');
  eq(S.grade(q4, { layers: [1, 4, 9, 16], total: 31 }).layerOk.join(), 'true,true,true,true', '층별: 칸마다 채점');
  var vis = S.visibleByLayer('pyramid', 4);
  eq(S.grade(q4, { layers: vis, total: 30 }).mistake, 'visible', '층별: 보이는 것만 셈 (' + vis.join(',') + ')');

  var g = { kind: 'grow', family: 'pyramid', n: 5, total: 55, answer: 25 };
  eq(S.grade(g, 25).correct, true, '늘어난 수: 정답');
  eq(S.grade(g, 55).mistake, 'whole', '늘어난 수: 전체를 셈');
  eq(S.grade(g, 16).mistake, 'offByOne', '늘어난 수: 한 단계 앞');

  var t = { kind: 'nth', family: 'pyramid', n: 6, total: 91, answer: 91 };
  eq(S.grade(t, 91).correct, true, 'n째: 정답');
  eq(S.grade(t, 36).mistake, 'bottom', 'n째: 맨 아래층만');
  eq(S.grade(t, 55 + 25).mistake, 'linear', 'n째: 늘어나는 수가 같다고 봄 (80)');
  eq(S.grade(t, 55).mistake, 'offByOne', 'n째: 다섯째 개수');
  S.FAMILIES.forEach(function (f) {
    all(8, f + ' 겉에서 보이는 수 = 맨 아래층 개수', function (i) {
      return S.visibleCount(f, i + 1) === S.layerCount(f, i + 1) || f === 'stairs' ? null : (i + 1) + '째';
    });
  });
  eq(S.grade(t, 92).mistake, null, 'n째: 그냥 틀림');
  eq(S.linearGuess('stairs', 5), 14, '계단도 늘어나는 수가 커진다: 10 + 4 = 14 ≠ 15');

  eq([5, 14, 30, 55, 91, 1, 2, 100, 36].map(function (n) { return n + S.topicParticle(n); }).join(' '),
    '5는 14는 30은 55는 91은 1은 2는 100은 36은', '은/는');

  global.STACK_TEST_RESULTS = results;

  // node js/stack.test.js 로 돌렸을 때만 결과를 찍는다.
  if (typeof window === 'undefined' && typeof process !== 'undefined') {
    var failed = results.filter(function (r) { return !r.pass; });
    failed.forEach(function (r) { console.log('✗ ' + r.label + '  기대: ' + r.expected + '  실제: ' + r.actual); });
    console.log((failed.length ? 'FAIL ' + failed.length : 'PASS ' + results.length) + ' / ' + results.length);
    process.exitCode = failed.length ? 1 : 0;
  }
})(typeof window !== 'undefined' ? window : globalThis);
