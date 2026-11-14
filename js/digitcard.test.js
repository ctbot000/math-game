/* digitcard.js 검증. test.html 에서 실행되고, node js/digitcard.test.js 로도 돌릴 수 있다. */
(function (global) {
  'use strict';

  var C = global.DigitCard || require('./digitcard.js');
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

  function digits(n) { return String(n).split('').map(Number); }

  // ---- 학습지 ---------------------------------------------------------
  var w = C.worksheet();
  eq(C.questionText(w), '0부터 9까지의 수를 한 번씩만 사용하여 두 개의 세 자리 수를 만들려고 합니다. ' +
    '만든 두 수의 차가 가장 작을 때 두 수를 각각 구해 보세요.', '학습지 문장');
  eq(w.best.value, 3, '0~9: 가장 작은 차는 3');
  eq(w.best.answers.map(C.pairText).join(', '), '301과 298, 401과 398, 501과 498, 601과 598, 701과 698', '0~9: 답은 다섯 가지');
  eq(C.solutionLines(w).join(' | '),
    '백의 자리 숫자의 차를 가장 작게: 3과 2 (차가 1) | 큰 수 3□□는 남은 숫자로 가장 작게 → 301 | ' +
    '작은 수 2□□는 남은 숫자로 가장 크게 → 298 | 301 − 298 = 3', '학습지 풀이');

  eq(C.grade(w, [digits(501), digits(498)]).correct, true, '501과 498 정답');
  eq(C.grade(w, [digits(298), digits(301)]).correct, true, '작은 수를 위에 써도 정답');
  var kid = C.grade(w, [digits(345), digits(102)]);
  eq(kid.mistake + ':' + kid.value, 'hundredsGap:243', '345와 102: 백의 자리 차가 큼');
  eq(C.grade(w, [digits(310), digits(298)]).mistake, 'restNotBest', '310과 298: 나머지 자리가 최선이 아님');
  eq(C.grade(w, [digits(312), digits(312)]).mistake, 'reused', '같은 카드 두 번');
  eq(C.grade(w, [[0, 1, 2], digits(345)]).mistake, 'leadingZero', '백의 자리 0');
  eq(C.grade(w, [[3, null, 1], digits(298)]).mistake, 'empty', '빈칸');

  var one9 = C.solve([1, 2, 3, 4, 5, 6, 7, 8, 9], 'diffMin');
  eq(one9.value + ' ' + one9.answers.map(C.pairText).join(', '), '14 412와 398, 512와 498, 612와 598, 712와 698', '1~9: 가장 작은 차 14 (312와 298 은 2가 겹쳐 안 됨)');
  var max09 = C.solve([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 'diffMax');
  eq(max09.value + ' ' + max09.answers.map(C.pairText).join(', '), '885 987과 102', '0~9: 가장 큰 차 987 − 102');

  // ---- 수 하나 --------------------------------------------------------
  eq(C.solve([0, 3, 5, 8], 'min').value + ' ' + C.solve([0, 3, 5, 8], 'max').value, '305 853', '0 3 5 8: 가장 작은 305, 가장 큰 853');
  var sq = { kind: 'single', cards: [0, 3, 5, 8], goal: 'min', rows: 1, best: C.solve([0, 3, 5, 8], 'min') };
  eq(C.grade(sq, [[0, 3, 5]]).mistake, 'leadingZero', '035 는 세 자리 수가 아님');
  eq(C.grade(sq, [[3, 0, 5]]).correct, true, '305 정답');
  eq(C.grade(sq, [[3, 5, 0]]).mistake, 'notBest', '350 은 가장 작은 수가 아님');

  // ---- 연속하는 숫자가 없을 때 ---------------------------------------
  var odd = C.solve([0, 1, 3, 5, 7, 9], 'diffMin');
  eq(odd.value + ' ' + C.pairText(odd.answers[0]), '104 501과 397', '0 1 3 5 7 9: 이웃한 숫자가 없으면 백의 자리 차 2, 차 104');

  // ---- 문제 만들기 ----------------------------------------------------
  C.KINDS.forEach(function (kind) {
    var rng = C.mulberry32(kind.length * 131);
    all(150, kind + ' 문제의 답은 모두 정답으로 채점', function () {
      var q = C.generate(kind, rng);
      if (!q.best.answers.length) return 'no answer ' + q.cards;
      for (var i = 0; i < q.best.answers.length; i++) {
        var a = q.best.answers[i];
        var v = q.rows === 1 ? [digits(a)] : [digits(a[0]), digits(a[1])];
        if (!C.grade(q, v).correct) return 'grade ' + q.cards + ' ' + a;
      }
      if (q.rows === 2 && C.solutionLines(q).slice(-1)[0] !== q.best.answers[0][0] + ' − ' + q.best.answers[0][1] + ' = ' + q.best.value) {
        return 'lines ' + q.cards;
      }
      return null;
    });
  });

  // 차가 가장 작은 답은 늘 「큰 수 나머지 최소, 작은 수 나머지 최대」 꼴 — 풀이 글이 맞는지
  var rngS = C.mulberry32(99);
  all(200, 'diffMin 풀이 글의 꼴', function () {
    var q = C.generate('diffMin', rngS);
    var a = q.best.answers[0];
    var used = digits(a[0]).concat(digits(a[1]));
    var restCards = q.cards.filter(function (c) { return used.indexOf(c) < 0 || c === Math.floor(a[0] / 100) || c === Math.floor(a[1] / 100); });
    var left = q.cards.filter(function (c) { return c !== Math.floor(a[0] / 100) && c !== Math.floor(a[1] / 100); }).sort(function (x, y) { return x - y; });
    var bigRest = left[0] * 10 + left[1];
    var smallRest = left[left.length - 1] * 10 + left[left.length - 2];
    return a[0] % 100 === bigRest && a[1] % 100 === smallRest ? null : q.cards + ' → ' + a + ' ' + restCards;
  });

  global.DIGITCARD_TEST_RESULTS = results;

  if (typeof window === 'undefined' && typeof process !== 'undefined') {
    var failed = results.filter(function (r) { return !r.pass; });
    failed.forEach(function (r) { console.log('✗ ' + r.label + '  기대: ' + r.expected + '  실제: ' + r.actual); });
    console.log((failed.length ? 'FAIL ' + failed.length : 'PASS ' + results.length) + ' / ' + results.length);
    process.exitCode = failed.length ? 1 : 0;
  }
})(typeof window !== 'undefined' ? window : globalThis);
