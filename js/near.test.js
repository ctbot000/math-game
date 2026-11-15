/* near.js 검증. test.html 에서 실행되고, node js/near.test.js 로도 돌릴 수 있다. */
(function (global) {
  'use strict';

  var N = global.Near || require('./near.js');
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

  function mistake(q, value) { return N.grade(q, value).mistake; }

  // ---- 학습지 8-1 -------------------------------------------------------
  var a = N.worksheet81();
  eq(N.questionText(a), '□ 안의 수는 십의 자리 수와 일의 자리 수가 같은 세 자리 수입니다. 두 수의 합이 700에 가장 가까운 수가 되도록 □ 안에 알맞은 수를 구해 보세요.', '8-1 문장');
  eq(N.exprText(a), '202 + □', '8-1 식');
  eq(a.below + ',' + a.ideal + ',' + a.above + ' → ' + a.ans, '488,498,499 → 499', '8-1 답 499');
  eq(N.solutionLines(a).join(' | '),
    '202 + □ = 700이 되려면 □ = 700 − 202 = 498 | 십의 자리와 일의 자리가 같은 수 중 498과 가까운 수는 488, 499 | 498 − 488 = 10, 499 − 498 = 1 → 더 가까운 수 499',
    '8-1 풀이');
  eq(N.checkLine(a), '202 + 499 = 701 → 700과 1 차이', '8-1 확인');
  eq(mistake(a, { ans: 498 }), 'ideal', '사진 속 498 → ideal (조건에 안 맞음)');
  eq(mistake(a, { ans: 488 }) + ',' + mistake(a, { ans: 500 }), 'otherSide,notNearest', '488은 반대쪽, 500은 더 멂');
  eq(mistake(a, { ans: 701 }) + ',' + mistake(a, { ans: 700 }), 'gaveSum,gaveSum', '합을 씀');
  eq(mistake(a, { ans: 494 }), 'wrongPattern', '백·일의 자리가 같은 수 → wrongPattern');
  eq(mistake(a, { ans: 598 }), 'notPattern', '조건에 안 맞는 수');

  // ---- 학습지 8-2 -------------------------------------------------------
  var b = N.worksheet82();
  eq(N.exprText(b) + ' → ' + b.ans, '563 + □ → 434', '8-2 답 434');
  eq(N.checkLine(b), '563 + 434 = 997 → 999와 2 차이', '8-2 확인 (999와)');
  eq(mistake(b, { ans: 436 }) + ',' + mistake(b, { ans: 444 }), 'ideal,otherSide', '8-2 실수');

  // ---- 학습지 8-3 -------------------------------------------------------
  var c = N.worksheet83();
  eq(N.questionText(c).indexOf('세 수의 합이 800에') > 0, true, '8-3 문장: 세 수');
  eq(N.exprText(c), '354 + □ + 268', '8-3 식: □ 가 가운데');
  eq(N.solutionLines(c)[0] + ' / ' + c.ans, '354 + 268 = 622 / 181', '8-3 답 181');
  eq(mistake(c, { ans: 622 }) + ',' + mistake(c, { ans: 171 }) + ',' + mistake(c, { ans: 178 }), 'partSum,otherSide,ideal', '8-3 실수');

  // ---- 학습지 8-4 -------------------------------------------------------
  var d = N.worksheet84();
  eq(N.questionText(d), '4장의 수 카드 1, 4, 6, 3 중 세 장을 골라 700과의 차가 325에 가장 가깝게 되는 세 자리 수를 만들어 보세요. (단, 수 카드를 한 번씩만 사용합니다.)', '8-4 문장');
  eq(d.below + ',' + d.ideal + ',' + d.above + ' → ' + d.ans, '364,375,413 → 364', '8-4 답 364');
  eq(N.checkLine(d), '700 − 364 = 336 → 325와 11 차이', '8-4 확인');
  eq(N.makeable([1, 4, 6, 3]).length, 24, '카드 네 장 → 세 자리 수 24개');
  eq(N.makeable([0, 4, 6, 3]).indexOf(46), -1, '0은 백의 자리에 못 와요');
  eq(mistake(d, { ans: 375 }) + ',' + mistake(d, { ans: 413 }) + ',' + mistake(d, { ans: 316 }), 'ideal,otherSide,closeToDiff', '8-4 실수');
  eq(mistake(d, { ans: 361 }) + ',' + mistake(d, { ans: 366 }), 'notNearest,notCards', '더 먼 수, 못 만드는 수');

  // ---- 차례로 -----------------------------------------------------------
  var pg = N.generate('pguided', N.mulberry32(3));
  eq(N.inputKeys(pg).join(), 'ideal,below,above,ans', '조건 수 차례로: 빈칸 넷');
  var w = { ideal: pg.ideal, below: pg.above, above: pg.above, ans: pg.ans };
  eq(N.grade(pg, w).step + ',' + mistake(pg, w), 'below,swapped', '아래·위를 바꿔 씀');
  var cg = N.generate('cguided', N.mulberry32(5));
  eq(N.inputKeys(cg).join(), 'ideal,below,above,ans', '카드 차례로: 빈칸 넷');

  // ---- 무작위 문제 -------------------------------------------------------
  var rng = N.mulberry32(2026);
  all(2000, '모든 종류: 답은 조건에 맞고, 모든 후보 중 유일하게 가장 가깝고, 풀이 끝 = 답, 정답은 정답', function (i) {
    var q = N.generate(N.KINDS[i % N.KINDS.length], rng);
    var list = q.cards ? N.makeable(q.cards) : N.patList(q.pat);
    if (list.indexOf(q.ans) < 0) return q.kind + ' 조건 ' + q.ans;
    if (list.indexOf(q.ideal) >= 0) return q.kind + ' 딱 맞는 수가 조건에 맞음';
    // 문제 그대로 모든 후보를 따져 본다
    var score = function (n) {
      return q.cards ? Math.abs(Math.abs(q.target - n) - q.diff) : Math.abs(q.given + n - q.target);
    };
    var best = list.map(score).reduce(function (m, s) { return Math.min(m, s); }, Infinity);
    var winners = list.filter(function (n) { return score(n) === best; });
    if (winners.length !== 1 || winners[0] !== q.ans) return q.kind + ' 최선 ' + winners;
    if (!q.cards && (q.nums.some(function (x) { return x < 100 || x > 899; }))) return q.kind + ' 주어진 수 ' + q.nums;
    var last = N.solutionLines(q).slice(-1)[0].split(' ').slice(-1)[0];
    if (Number(last) !== q.ans) return q.kind + ' 풀이 끝';
    return N.grade(q, q.answer).correct ? null : q.kind + ' 정답 채점';
  });

  // ---- 조사 -------------------------------------------------------------
  eq([700, 999, 325, 1000].map(function (n) { return N.J(n, '과와'); }).join(' '), '700과 999와 325와 1000과', '과/와');

  // ---- 입력 -------------------------------------------------------------
  eq(['499', ' ４９９ ', '1,024'].map(function (t) { return N.parseNum(t).value; }).join(','), '499,499,1024', '숫자 읽기');
  eq(N.parseNum('').error + ':' + N.parseNum('사백').error, 'empty:format', '빈칸·글자');

  global.NEAR_TEST_RESULTS = results;

  if (typeof window === 'undefined' && typeof process !== 'undefined') {
    var failed = results.filter(function (x) { return !x.pass; });
    failed.forEach(function (x) { console.log('✗ ' + x.label + '  기대: ' + x.expected + '  실제: ' + x.actual); });
    console.log((failed.length ? 'FAIL ' + failed.length : 'PASS ' + results.length) + ' / ' + results.length);
    process.exitCode = failed.length ? 1 : 0;
  }
})(typeof window !== 'undefined' ? window : globalThis);
