/* sumdiff.js 검증. test.html 에서 실행되고, node js/sumdiff.test.js 로도 돌릴 수 있다. */
(function (global) {
  'use strict';

  var S = global.SumDiff || require('./sumdiff.js');
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

  // ---- 학습지 ---------------------------------------------------------
  var w = S.worksheet();
  eq(S.storyText(w),
    '어느 마을의 인구는 581명이고, 남자가 여자보다 183명 더 많습니다. 이 마을의 남자와 여자는 각각 몇 명인지 구해 보세요.',
    '학습지 문장');
  eq(JSON.stringify(w.answer), '{"a":382,"b":199}', '학습지 답: 남자 382, 여자 199');
  eq(S.answerText(w), '남자: 382명, 여자: 199명', '답 한 줄');
  eq(S.solutionLines(w).join(' | '),
    '□ = 남자 수,  △ = 여자 수라고 하면 | □ = △ + 183 | △ + 183 + △ = 581 | △ + △ = 581 − 183 = 398 | ' +
    '△ = 199  (300의 반은 150, 90의 반은 45, 8의 반은 4 → 150 + 45 + 4 = 199) | □ = 199 + 183 = 382 | ' +
    '확인: 382 + 199 = 581,  382 − 199 = 183',
    '학습지 풀이');

  // ---- 뺄셈 실수 ------------------------------------------------------
  eq(S.noReduce(581, 183), 408, '받아내림 뒤 윗자리를 안 줄이면 408');
  eq(S.swapColumns(581, 183), 402, '자리마다 거꾸로 빼면 402');
  eq(S.needsBorrow(581, 183) + ':' + S.needsBorrow(586, 183), 'true:false', '받아내림 여부');
  eq([398, 764, 581, 408, 402, 308].map(function (v) { return String(S.subMistake(581, 183, v)); }).join(','),
    'null,added,noSub,noReduce,swapColumns,null', '뺄셈 오답 진단');

  // ---- 반으로 ---------------------------------------------------------
  eq(S.halfLine(398), '300의 반은 150, 90의 반은 45, 8의 반은 4 → 150 + 45 + 4 = 199', '398의 반');
  eq(S.halfLine(406), '400의 반은 200, 6의 반은 3 → 200 + 3 = 203', '0 인 자리는 뺀다');
  eq(S.halfLine(80), '80의 반은 40', '한 자리만');
  all(500, '짝수의 자리별 반의 합 = 반', function (i) {
    var n = (i + 1) * 2;
    var s = S.halfSteps(n);
    var sum = s.parts.reduce(function (t, p) { return t + p[1]; }, 0);
    var whole = s.parts.every(function (p) { return p[1] === Math.floor(p[1]); });
    return sum === n / 2 && whole ? null : n;
  });

  // ---- 채점 -----------------------------------------------------------
  eq(S.grade(w, { a: 382, b: 199 }).correct, true, '학습지 정답');
  eq(S.grade(w, { a: 199, b: 382 }).mistake, 'swapped', '남녀를 바꿔 씀');
  eq(S.grade(w, { a: 398, b: 199 }).mistake, 'forgotHalf', '581 − 183 = 398 을 그대로 씀');
  eq(S.grade(w, { a: 383, b: 199 }).mistake, 'sumOff', '합이 안 맞음');
  eq(S.grade(w, { a: 381, b: 200 }).mistake, 'diffOff', '합은 맞고 차가 틀림');
  var partial = S.grade(w, { a: 382, b: 198 });
  eq(partial.ok.a + ':' + partial.ok.b, 'true:false', '칸마다 맞고 틀림');

  var g = { kind: 'guided', total: 581, diff: 183, big: 382, small: 199, scene: S.SCENES[0], bigIsA: true, fewer: false };
  g.answer = { twice: 398, small: 199, big: 382 };
  var r1 = S.grade(g, { twice: 408, small: 204, big: 387 });
  eq(r1.step + ':' + r1.mistake, 'twice:noReduce', '단계 풀이: 첫 칸 받아내림 실수');
  var r2 = S.grade(g, { twice: 398, small: 398, big: 581 });
  eq(r2.step + ':' + r2.mistake, 'small:notHalved', '단계 풀이: 반으로 안 나눔');
  var r3 = S.grade(g, { twice: 398, small: 199, big: 199 });
  eq(r3.step + ':' + r3.mistake, 'big:bigSame', '단계 풀이: 큰 수에 차를 안 더함');
  var r4 = S.grade(g, { twice: 398, small: 199, big: 16 });
  eq(r4.step + ':' + r4.mistake, 'big:bigSub', '단계 풀이: 차를 뺌');

  // ---- 문제 만들기 -----------------------------------------------------
  S.KINDS.forEach(function (kind) {
    var rng = S.mulberry32(kind.length * 977);
    all(400, kind + ' 문제의 수와 답', function () {
      var q = S.generate(kind, rng);
      if (q.big - q.small !== q.diff || q.big + q.small !== q.total) return 'sum/diff ' + JSON.stringify(q);
      if (q.total < 150 || q.total > 999 || q.small < 40) return 'range ' + q.total + '/' + q.small;
      var keys = S.inputKeys(q);
      if (keys.join() !== Object.keys(q.answer).join()) return 'keys ' + keys + ' vs ' + Object.keys(q.answer);
      var ans = {};
      keys.forEach(function (k) { ans[k] = q.answer[k]; });
      if (!S.grade(q, ans).correct) return 'grade ' + JSON.stringify(q);
      if (q.scene) {
        if (q.kind === 'guided') return null;
        var t = S.storyText(q);
        if (t.indexOf(String(q.total)) < 0 || t.indexOf(String(q.diff)) < 0) return 'text ' + t;
        var bigA = q.answer.a > q.answer.b;
        if (bigA !== q.bigIsA) return 'order ' + JSON.stringify(q.answer);
      }
      return null;
    });
  });
  var borrowRng = S.mulberry32(7);
  var borrowed = 0;
  for (var i = 0; i < 200; i++) {
    var q = S.generate('remove', borrowRng);
    if (S.needsBorrow(q.total, q.diff)) borrowed++;
  }
  eq(borrowed >= 140, true, '빼기 문제는 대부분 받아내림이 있다 (' + borrowed + '/200)');

  var fewer = { kind: 'story', total: 300, diff: 40, big: 170, small: 130, scene: S.SCENES[2], bigIsA: false, fewer: true };
  eq(S.storyText(fewer),
    '형과 동생이 가진 구슬은 모두 300개이고, 형이 동생보다 40개 더 적습니다. 형과 동생이 가진 구슬은 각각 몇 개인지 구해 보세요.',
    '「더 적습니다」 문장');

  // ---- 입력 -----------------------------------------------------------
  eq(['199', ' １９９ ', '199명', '1,000'].map(function (t) { return S.parseNum(t).value; }).join(','),
    '199,199,199,1000', '숫자 읽기');
  eq(S.parseNum('').error + ':' + S.parseNum('백').error, 'empty:format', '빈칸·글자');

  // ---- 조사 -----------------------------------------------------------
  eq(['남자', '여자', '사과', '형', '동화책', '183', '40'].map(function (w2) { return S.josa(w2, '이가'); }).join(' '),
    '남자가 여자가 사과가 형이 동화책이 183이 40이', '이/가');

  global.SUMDIFF_TEST_RESULTS = results;

  // node js/sumdiff.test.js 로 돌렸을 때만 결과를 찍는다.
  if (typeof window === 'undefined' && typeof process !== 'undefined') {
    var failed = results.filter(function (r) { return !r.pass; });
    failed.forEach(function (r) { console.log('✗ ' + r.label + '  기대: ' + r.expected + '  실제: ' + r.actual); });
    console.log((failed.length ? 'FAIL ' + failed.length : 'PASS ' + results.length) + ' / ' + results.length);
    process.exitCode = failed.length ? 1 : 0;
  }
})(typeof window !== 'undefined' ? window : globalThis);
