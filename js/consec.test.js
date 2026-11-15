/* consec.js 검증. test.html 에서 실행되고, node js/consec.test.js 로도 돌릴 수 있다. */
(function (global) {
  'use strict';

  var C = global.Consec || require('./consec.js');
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

  function mistake(q, value) { return C.grade(q, value).mistake; }

  // ---- 학습지 7-2 -------------------------------------------------------
  var r = C.worksheetRange();
  eq(C.questionText(r), '120부터 140까지의 짝수를 모두 더한 값을 구해 보세요.', '7-2 문장');
  eq(r.n + ',' + r.pair + ',' + r.pairs + ',' + r.middle + ',' + r.total, '11,260,5,130,1430', '7-2: 11개, 260이 5쌍, 가운데 130, 합 1430');
  eq(C.solutionLines(r).join(' | '),
    '앞뒤로 짝을 지으면 120 + 140 = 260이 5쌍, 가운데 130이 남아요. | 260 × 5 : 260 + 260 + 260 + 260 + 260 = 1300 | 1300 + 130 = 1430',
    '7-2 풀이');
  eq(C.grade(r, { total: 1430 }).correct, true, '7-2 정답');
  eq(mistake(r, { total: 2730 }), 'allNumbers', '홀수까지 모두 더함 → allNumbers');
  eq(mistake(r, { total: 1310 }) + ',' + mistake(r, { total: 1290 }), 'missedEnd,missedEnd', '한 끝을 빠뜨림 → missedEnd');
  eq(mistake(r, { total: 1300 }), 'forgotMiddle', '가운데 수를 안 더함 → forgotMiddle');
  eq(mistake(r, { total: 2860 }), 'doubleCount', '260 × 11 → doubleCount');
  eq(mistake(r, { total: 1215 }), 'null', '사진 속 1215 → 알 수 없는 답');

  // ---- 학습지 7-3 -------------------------------------------------------
  var c = C.worksheetCons();
  eq(C.questionText(c), '연속하는 세 수의 합이 903일 때 연속하는 세 수 중에서 가장 큰 수는 얼마일까요?', '7-3 문장');
  eq(c.nums.join() + ' → ' + c.answer.ans, '300,301,302 → 302', '7-3 답 302');
  eq(C.solutionLines(c).join(' | '),
    '가운데 수를 □라고 하면 □ − 1, □, □ + 1의 합은 □ + □ + □ = 903 | 900 = 300 + 300 + 300, 3 = 1 + 1 + 1 → 300 + 1 = 301 → □ = 301 | 세 수는 300, 301, 302 → 가장 큰 수 302',
    '7-3 풀이');
  eq(mistake(c, { ans: 301 }) + ',' + mistake(c, { ans: 300 }) + ',' + mistake(c, { ans: 903 }), 'gaveMiddle,otherEnd,notThird', '7-3 실수');

  // ---- 학습지 7-4 -------------------------------------------------------
  var e = C.worksheetEven();
  eq(C.questionText(e), '연속하는 세 짝수의 합이 1020일 때 연속하는 세 짝수 중에서 가장 작은 수는 얼마일까요?', '7-4 문장');
  eq(e.answer.ans, 338, '7-4 답 338');
  eq(C.thirdLine(1020), '900 = 300 + 300 + 300, 120 = 40 + 40 + 40 → 300 + 40 = 340', '세 배 나누기');
  eq(mistake(e, { ans: 339 }) + ',' + mistake(e, { ans: 342 }) + ',' + mistake(e, { ans: 340 }), 'stepOne,otherEnd,gaveMiddle', '7-4 실수');
  eq(mistake(e, { ans: 348 }), 'calc', '7-4 계산 실수');

  // ---- 차례로 -----------------------------------------------------------
  var rg = C.generate('rguided', C.mulberry32(4));
  eq(C.inputKeys(rg).join(), rg.middle !== null ? 'pair,pairs,middle,total' : 'pair,pairs,total', '짝 지어 차례로: 빈칸');
  var wrongPairs = {};
  C.inputKeys(rg).forEach(function (k) { wrongPairs[k] = rg.answer[k]; });
  wrongPairs.pairs = rg.n;
  eq(mistake(rg, wrongPairs), 'countedNumbers', '짝의 수 대신 수의 개수 → countedNumbers');

  var cg = C.generate('cguided', C.mulberry32(6));
  eq(C.inputKeys(cg).join(), 'm,ans', '가운데 수로 차례로: 빈칸 둘');

  // ---- 조사 -------------------------------------------------------------
  eq([903, 1002, 1020, 1005].map(function (n) { return C.questionText(C.generate('tri', function () { return 0; })) && C.J(n, '이가'); }).join(' '),
    '903이 1002가 1020이 1005가', '이/가');

  // ---- 무작위 문제 -------------------------------------------------------
  var rng = C.mulberry32(2026);
  all(1200, '세 수: 연속, 합 = 3 × 가운데, 짝수·홀수 맞음, 정답은 정답', function (i) {
    var q = C.generate(['tri', 'cguided', 'cons', 'even'][i % 4], rng);
    if (q.nums[0] + q.nums[1] + q.nums[2] !== q.total) return q.kind + ' 합';
    if (q.kind === 'cons' && q.step !== 1) return 'cons step';
    if (q.kind === 'even' && q.step !== 2) return 'even step';
    if (q.step === 2 && q.nums.some(function (x) { return x % 2 !== q.parity; })) return '짝홀';
    if (q.kind === 'tri' && q.total > 999) return 'tri total ' + q.total;
    if (!C.grade(q, q.answer).correct) return q.kind + ' 정답 채점';
    var last = C.thirdLine(q.total).split(' ').slice(-1)[0];
    return Number(last) === q.m ? null : 'thirdLine ' + q.total;
  });
  all(800, '범위: 마지막 수 = b, 합 = 짝 × 쌍 + 가운데, 정답은 정답', function (i) {
    var q = C.generate(i % 2 ? 'range' : 'rguided', rng);
    if (q.terms[q.n - 1] !== q.b) return 'b';
    if (q.n < 5 || q.n > 11) return 'n ' + q.n;
    if (q.pair * q.pairs + (q.middle || 0) !== q.total) return '합';
    if (!C.grade(q, q.answer).correct) return '정답 채점';
    return Number(C.solutionLines(q).slice(-1)[0].split(' = ').slice(-1)[0]) === q.total ? null : '풀이 끝';
  });

  // ---- 입력 -------------------------------------------------------------
  eq(['1430', ' １４３０ ', '5쌍', '1,430'].map(function (t) { return C.parseNum(t).value; }).join(','), '1430,1430,5,1430', '숫자 읽기');
  eq(C.parseNum('').error + ':' + C.parseNum('삼백').error, 'empty:format', '빈칸·글자');

  global.CONSEC_TEST_RESULTS = results;

  if (typeof window === 'undefined' && typeof process !== 'undefined') {
    var failed = results.filter(function (x) { return !x.pass; });
    failed.forEach(function (x) { console.log('✗ ' + x.label + '  기대: ' + x.expected + '  실제: ' + x.actual); });
    console.log((failed.length ? 'FAIL ' + failed.length : 'PASS ' + results.length) + ' / ' + results.length);
    process.exitCode = failed.length ? 1 : 0;
  }
})(typeof window !== 'undefined' ? window : globalThis);
