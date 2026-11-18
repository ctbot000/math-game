/* bundle.js 검증. test.html 에서 실행되고, node js/bundle.test.js 로도 돌릴 수 있다. */
(function (global) {
  'use strict';

  var B = global.Bundle || require('./bundle.js');
  var results = [];

  function eq(actual, expected, label) {
    var a = String(actual);
    var e = String(expected);
    results.push({ pass: a === e, label: label, actual: a, expected: e });
  }

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

  function mistake(q, value) { return B.grade(q, value).mistake; }

  // ---- 학습지 12 --------------------------------------------------------
  var w = B.worksheet();
  eq(B.questionText(w), '똑같은 공책 4권과 똑같은 필통 2개의 무게는 1280 g이고, 공책 2권과 필통 2개의 무게는 780 g입니다. 공책 한 권의 무게는 몇 g일까요?', '12 문장');
  eq(B.solutionLines(w).join(' | '),
    '공책 4권 + 필통 2개 = 1280 g | 공책 2권 + 필통 2개 = 780 g | 필통 2개는 똑같으니 빼면: 공책 2권 = 1280 − 780 = 500 g | 공책 한 권: 500의 반은 250 g',
    '12 풀이, 답 250 g');
  eq(B.grade(w, { ans: 250 }).correct, true, '12 정답');
  eq(mistake(w, { ans: 500 }) + ',' + mistake(w, { ans: 140 }) + ',' + mistake(w, { ans: 2060 }), 'notHalved,gaveOther,added', '12 실수: 2권 무게, 필통, 더하기');
  eq(mistake(w, { ans: 260 }), 'calc', '계산 실수');

  // ---- 반으로 -----------------------------------------------------------
  eq(B.halfText(580), '500의 반은 250, 80의 반은 40 → 250 + 40 = 290', '자리마다 반');
  eq(B.halfText(500), '500의 반은 250', '한 자리만');

  // ---- 조사 -------------------------------------------------------------
  eq([B.J('4권', '과와'), B.J('2개', '과와'), B.J('3자루', '과와'), B.J('1팩', '과와'), B.J('값', '은는'), B.J('무게', '은는')].join(' '),
    '4권과 2개와 3자루와 1팩과 값은 무게는', '과/와, 은/는');

  // ---- 차례로 -----------------------------------------------------------
  var g = B.generate('guided', B.mulberry32(3));
  eq(B.inputKeys(g).join(), 'd,ans', '차례로: 빼서 남은 무게, 한 개');
  eq(mistake(g, { d: g.W1 + g.W2, ans: g.A }), 'added', '빼야 할 것을 더함');

  // ---- 무작위 문제 -------------------------------------------------------
  var rng = B.mulberry32(2026);
  all(2000, '모든 종류: 두 묶음이 맞고, 답이 묻는 물건 한 개, 풀이 끝 = 답, 정답은 정답', function (i) {
    var q = B.generate(B.KINDS[i % B.KINDS.length], rng);
    if (q.p * q.A + q.r * q.B !== q.W1 || q.s * q.A + q.r * q.B !== q.W2) return q.kind + ' 묶음';
    if (q.p <= q.s || q.W1 > 2500) return q.kind + ' 수';
    if (q.ans !== (q.ask === 'a' ? q.A : q.B)) return q.kind + ' 답';
    if ((q.kind === 'one' && q.k !== 1) || ((q.kind === 'two' || q.kind === 'guided') && q.k !== 2)) return q.kind + ' 차이';
    var last = B.solutionLines(q).slice(-1)[0].match(/(\d+)\s*(g|원)$/);
    if (!last || Number(last[1]) !== q.ans) return q.kind + ' 풀이 끝';
    if (/\d(과|을|은) /.test(B.questionText(q).replace(/(권|팩|원)(과|을|은) /g, '')) && /개과|자루과|개을|자루을/.test(B.questionText(q))) return '조사';
    return B.grade(q, q.answer).correct ? null : q.kind + ' 정답 채점';
  });

  // ---- 입력 -------------------------------------------------------------
  eq(['250', ' ２５０ ', '250g', '250 g', '1,280원'].map(function (t) { return B.parseNum(t).value; }).join(','), '250,250,250,250,1280', '숫자 읽기');
  eq(B.parseNum('').error + ':' + B.parseNum('이백').error, 'empty:format', '빈칸·글자');

  global.BUNDLE_TEST_RESULTS = results;

  if (typeof window === 'undefined' && typeof process !== 'undefined') {
    var failed = results.filter(function (x) { return !x.pass; });
    failed.forEach(function (x) { console.log('✗ ' + x.label + '  기대: ' + x.expected + '  실제: ' + x.actual); });
    console.log((failed.length ? 'FAIL ' + failed.length : 'PASS ' + results.length) + ' / ' + results.length);
    process.exitCode = failed.length ? 1 : 0;
  }
})(typeof window !== 'undefined' ? window : globalThis);
