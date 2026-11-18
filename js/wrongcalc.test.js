/* wrongcalc.js 검증. test.html 에서 실행되고, node js/wrongcalc.test.js 로도 돌릴 수 있다. */
(function (global) {
  'use strict';

  var W = global.WrongCalc || require('./wrongcalc.js');
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

  function mistake(q, value) { return W.grade(q, value).mistake; }

  // ---- 학습지 4 ---------------------------------------------------------
  var w = W.worksheet();
  eq(W.questionText(w), '어떤 수에 436을 더한 후 188을 빼야 할 것을 잘못하여 어떤 수에서 436을 뺀 후 188을 더했더니 672가 되었습니다. 바르게 계산한 값은 얼마일까요?', '학습지 4 문장');
  eq(w.x + ' → ' + w.ans, '920 → 1168', '어떤 수 920, 바르게 1168');
  eq(W.solutionLines(w).join(' | '),
    '잘못 계산한 식: □ − 436 + 188 = 672 | 거꾸로 계산해요 (뒤에서부터, 더한 것은 빼고 뺀 것은 더해요): 672 − 188 = 484, 484 + 436 = 920 → 어떤 수는 920 | ' +
    '바르게 계산하면: 920 + 436 = 1356, 1356 − 188 = 1168', '학습지 4 풀이');
  eq(W.grade(w, { ans: 1168 }).correct, true, '학습지 4 정답');
  eq(mistake(w, { ans: 296 }), 'notInverse', '사진 속 296 (□ = 672 − 436 − 188 = 48) → notInverse');
  eq(mistake(w, { ans: 920 }) + ',' + mistake(w, { ans: 672 }), 'gaveX,gaveWrong', '어떤 수·잘못한 값을 씀');
  eq(mistake(w, { ans: 1178 }), 'calc', '계산 실수');

  // ---- 차례로 -----------------------------------------------------------
  var g = W.generate('guided', W.mulberry32(4));
  eq(W.inputKeys(g).join(), 'x,ans', '차례로: 어떤 수, 바른 값');
  var wg = W.worksheet();
  wg.kind = 'guided';
  wg.answer.x = wg.x;
  eq(W.grade(wg, { x: 48, ans: 296 }).step + ',' + mistake(wg, { x: 48, ans: 296 }), 'x,notInverse', '□ = 48 (거꾸로 셈을 안 바꿈) → 어떤 수 칸에서 notInverse');
  eq(mistake(wg, { x: 920, ans: 1544 }), 'opsMixed', '어떤 수는 맞고 920 + 436 − 188 대신 다른 부호');

  // ---- 잘못 본 수 -------------------------------------------------------
  var m = W.generate('misread', W.mulberry32(9));
  eq(String(m.seen).split('').sort().join() === String(m.right[0].n).split('').sort().join() && m.seen !== m.right[0].n, true, '잘못 본 수는 자리를 바꾼 수');
  eq(mistake(m, { ans: m.R }), 'undoRight', '원래 수로 되돌리면 잘못한 값이 그대로 → undoRight');

  // ---- 약속한 기호 ◆ ----------------------------------------------------
  var sy = W.worksheetSymbol();
  eq(W.questionText(sy), '기호 ◆를 ㉠◆㉡ = ㉠ − ㉡이라고 약속할 때 □ 안에 알맞은 수를 구해 보세요. 781◆293 = □◆594', '◆ 문장');
  eq(W.solutionLines(sy).join(' | '), '781◆293 = 781 − 293 = 488 | □◆594 = □ − 594 = 488 | □ = 488 + 594 = 1082', '◆ 풀이, 답 1082');
  eq(mistake(sy, { ans: 488 }), 'stoppedLeft', '사진 속 488 (왼쪽만 계산) → stoppedLeft');
  eq(mistake(sy, { ans: 106 }) + ',' + mistake(sy, { ans: 480 }), 'notInverse,wrongRule', '594 − 488, ◆를 + 로');

  // ---- 무작위 문제 -------------------------------------------------------
  var rng = W.mulberry32(2026);
  all(2000, '모든 종류: 잘못한 식이 맞고, 거꾸로 하면 어떤 수, 중간값 0 이상, 풀이 끝 = 답, 정답은 정답', function (i) {
    var q = W.generate(W.KINDS[i % W.KINDS.length], rng);
    if (q.kind === 'symbol') {
      var lhs = q.rule === '+' ? q.a + q.b : q.a - q.b;
      var x = q.x;
      var rhs = q.box === 'left' ? (q.rule === '+' ? x + q.c : x - q.c) : (q.rule === '+' ? q.c + x : q.c - x);
      if (lhs !== rhs || x < 100) return 'symbol ' + W.symbolExpr(q);
      var lastS = W.solutionLines(q).slice(-1)[0].split(' ').slice(-1)[0];
      return Number(lastS) === x && W.grade(q, q.answer).correct ? null : 'symbol 풀이·채점';
    }
    if (W.apply(q.wrong, q.x) !== q.R) return q.kind + ' 잘못한 식';
    if (W.apply(W.inverse(q.wrong), q.R) !== q.x) return q.kind + ' 거꾸로';
    if (W.chain(q.right, q.x).concat(W.chain(q.wrong, q.x)).some(function (v) { return v < 0; })) return q.kind + ' 음수';
    if (q.x < 100 || q.x > 999) return q.kind + ' 어떤 수 ' + q.x;
    if (/(\d)(을|를|이|가) /.test(W.questionText(q).replace(/(\d+)([을를이가]) /g, function (s, n, p) {
      var hard = '013678'.indexOf(n.slice(-1)) >= 0;
      return ((hard && (p === '을' || p === '이')) || (!hard && (p === '를' || p === '가'))) ? 'ok ' : s;
    }))) return '조사 ' + W.questionText(q);
    var last = W.solutionLines(q).slice(-1)[0].split(' ').slice(-1)[0];
    if (Number(last) !== q.ans) return q.kind + ' 풀이 끝';
    return W.grade(q, q.answer).correct ? null : q.kind + ' 정답 채점';
  });

  // ---- 입력 -------------------------------------------------------------
  eq(['1168', ' １１６８ ', '1,168'].map(function (t) { return W.parseNum(t).value; }).join(','), '1168,1168,1168', '숫자 읽기');
  eq(W.parseNum('').error + ':' + W.parseNum('천').error, 'empty:format', '빈칸·글자');

  global.WRONGCALC_TEST_RESULTS = results;

  if (typeof window === 'undefined' && typeof process !== 'undefined') {
    var failed = results.filter(function (x) { return !x.pass; });
    failed.forEach(function (x) { console.log('✗ ' + x.label + '  기대: ' + x.expected + '  실제: ' + x.actual); });
    console.log((failed.length ? 'FAIL ' + failed.length : 'PASS ' + results.length) + ' / ' + results.length);
    process.exitCode = failed.length ? 1 : 0;
  }
})(typeof window !== 'undefined' ? window : globalThis);
