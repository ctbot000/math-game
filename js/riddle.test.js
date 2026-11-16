/* riddle.js 검증. test.html 에서 실행되고, node js/riddle.test.js 로도 돌릴 수 있다. */
(function (global) {
  'use strict';

  var R = global.Riddle || require('./riddle.js');
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

  function mistake(q, value) { return R.grade(q, value).mistake; }

  // ---- 학습지 -3 --------------------------------------------------------
  var p = R.worksheetPair();
  eq(R.questionText(p), '덧셈식에서 같은 기호는 같은 수를 나타냅니다. ㉠과 ㉡에 알맞은 수를 각각 구해 보세요.', '-3 문장');
  eq(p.rows.map(R.show).join(' | '), '㉠㉠㉡ | ㉡㉡㉡ | 1000', '-3 식');
  eq(JSON.stringify(p.answer), '{"A":4,"B":5}', '-3 답 ㉠ = 4, ㉡ = 5');
  eq(R.solutionLines(p).join(' | '),
    '일의 자리: ㉡ + ㉡ = 10 → ㉡ = 5, 받아올림 1 (㉡ = 0이어도 끝자리가 0이지만, ㉡은 맨 앞 자리라 0이 될 수 없어요) | ' +
    '십의 자리: ㉠ + 5 + 1 = 10 → ㉠ = 4, 받아올림 1 | 백의 자리: 4 + 5 + 1 = 10 ✓ | 445 + 555 = 1000', '-3 풀이');
  eq(R.bruteForce(p).length, 1, '-3 답은 하나');
  eq(mistake(p, { A: 4, B: 0 }), 'leadingZero', '㉡ = 0 → leadingZero');
  eq(mistake(p, { A: 5, B: 4 }), 'swapped', '㉠·㉡ 바꿈 → swapped');
  eq(mistake(p, { A: 5, B: 5 }), 'forgotCarry', '㉠ + 5 = 10 → 받아올림을 잊음');

  // ---- 학습지 -4 --------------------------------------------------------
  var t = R.worksheetThree();
  eq(R.questionText(t), '세 자리 수 53㉠과 3㉡7의 합이 ㉢23일 때 ㉠ + ㉡ + ㉢의 값은 얼마일까요?', '-4 문장');
  eq(t.nums.join(' + ').replace(/ \+ (\d+)$/, ' = $1') + ' → ' + t.answer.total, '536 + 387 = 923 → 23', '-4 답 23');
  eq(R.solutionLines(t).join(' | '),
    '일의 자리: ㉠ + 7 = 13 → ㉠ = 6, 받아올림 1 | 십의 자리: 3 + ㉡ + 1 = 12 → ㉡ = 8, 받아올림 1 | ' +
    '백의 자리: 5 + 3 + 1 = 9 → ㉢ = 9 | 536 + 387 = 923 → ㉠ + ㉡ + ㉢ = 6 + 8 + 9 = 23', '-4 풀이');
  eq(mistake(t, { total: 923 }) + ',' + mistake(t, { total: 24 }), 'gaveSum,calc', '-4 실수');

  // ---- 차례로 -----------------------------------------------------------
  var g = R.generate('guided', R.mulberry32(3));
  eq(R.inputKeys(g).filter(function (k) { return k.length === 1; }).sort().join() + ',' + R.inputKeys(g).slice(-1), 'A,B,C,total', '자리마다 차례로: 기호 셋과 합');
  eq(R.inputKeys(g).filter(function (k) { return k.charAt(0) === 'c'; }).join(), 'c0,c1', '받아올림 칸 둘');
  var gw = JSON.parse(JSON.stringify(g.answer));
  gw.c0 = 1 - g.answer.c0;
  eq(R.grade(g, gw).step + ',' + mistake(g, gw), 'c0,carry', '받아올림 칸이 틀림');
  // -4 를 차례로: ㉠ = 4 는 ㉠ + 7 = 3 을 7 − 3 으로 거꾸로 뺀 것, ㉡ = 9 는 받아올림을 잊은 것
  var tg = R.build('guided', R.worksheetThree().rows);
  var tw = JSON.parse(JSON.stringify(tg.answer));
  tw.A = 4;
  eq(mistake(tg, tw), 'reversed', '㉠ = 4 → reversed');
  tw.A = 6;
  tw.B = 9;
  eq(R.grade(tg, tw).step + ',' + mistake(tg, tw), 'B,forgotCarry', '㉡ = 9 → forgotCarry');

  // ---- 무작위 문제 -------------------------------------------------------
  var rng = R.mulberry32(2026);
  all(1200, '모든 종류: 답은 하나, 맨 앞은 0이 아님, 식이 맞음, 풀이 끝 = 합, 정답은 정답', function (i) {
    var q = R.generate(R.KINDS[i % R.KINDS.length], rng);
    var sols = R.bruteForce(q);
    if (sols.length !== 1) return q.kind + ' 답 ' + sols.length + '개 ' + q.rows.map(R.show).join(' ');
    if (q.syms.some(function (x) { return sols[0][x] !== q.vals[x]; })) return q.kind + ' 값';
    if (q.nums[0] + q.nums[1] !== q.nums[2]) return q.kind + ' 식';
    if (q.nums[0] < 100 || q.nums[1] < 100) return q.kind + ' 세 자리';
    if (q.syms.length === 3 && (q.vals.A === q.vals.B || q.vals.B === q.vals.C || q.vals.A === q.vals.C)) return '기호 셋이 같은 값';
    if (q.kind === 'three' || q.kind === 'guided') {
      // 기호는 수마다 하나, 자리마다 하나
      var cols = q.rows.map(function (r) { return r.length - 1 - r.findIndex(function (x) { return typeof x === 'string'; }); });
      if (cols.slice().sort().join() !== '0,1,2') return '자리 ' + cols;
    }
    var last = R.solutionLines(q).slice(-1)[0].split(' ').slice(-1)[0];
    if (Number(last) !== (q.kind === 'three' || q.kind === 'guided' ? q.total : q.nums[2])) return '풀이 끝';
    return R.grade(q, q.answer).correct ? null : q.kind + ' 정답 채점';
  });

  var shapes = {};
  for (var i = 0; i < 300; i++) {
    var q = R.generate('pair', rng);
    shapes[q.rows.slice(0, 2).every(function (r) { return r.every(function (x) { return typeof x === 'string'; }); }) ? 'sym' : 'mixed'] = true;
  }
  eq(Object.keys(shapes).sort().join(), 'mixed,sym', '같은 기호: 기호로만 된 수와 숫자가 섞인 수');

  // ---- 조사 -------------------------------------------------------------
  eq([R.J('53㉠', '과와'), R.J('532', '과와'), R.J('5㉠6', '과와')].join(' '), '53㉠과 532와 5㉠6과', '과/와');

  // ---- 입력 -------------------------------------------------------------
  eq(['5', ' ２３ '].map(function (x) { return R.parseNum(x).value; }).join(','), '5,23', '숫자 읽기');
  eq(R.parseNum('').error + ':' + R.parseNum('다섯').error, 'empty:format', '빈칸·글자');

  global.RIDDLE_TEST_RESULTS = results;

  if (typeof window === 'undefined' && typeof process !== 'undefined') {
    var failed = results.filter(function (x) { return !x.pass; });
    failed.forEach(function (x) { console.log('✗ ' + x.label + '  기대: ' + x.expected + '  실제: ' + x.actual); });
    console.log((failed.length ? 'FAIL ' + failed.length : 'PASS ' + results.length) + ' / ' + results.length);
    process.exitCode = failed.length ? 1 : 0;
  }
})(typeof window !== 'undefined' ? window : globalThis);
