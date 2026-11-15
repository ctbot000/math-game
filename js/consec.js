/**
 * consec.js
 *
 * 연속하는 수의 합의 계산 부분 — 문제 만들기, 채점, 풀이 글. DOM 은 건드리지 않는다.
 *
 * 학습지 7-2: 120부터 140까지의 짝수를 모두 더한 값 → 앞뒤로 짝을 지으면 260 이 5쌍, 가운데 130 이 남는다.
 *   260 × 5 + 130 = 1430
 * 학습지 7-3: 연속하는 세 수의 합이 903 → 가운데 수를 □ 라 하면 □ − 1, □, □ + 1, 합은 □ + □ + □.
 *   903 = 300 + 300 + 300 과 1 + 1 + 1 → □ = 301, 가장 큰 수 302
 * 학습지 7-4: 연속하는 세 짝수의 합이 1020 → □ − 2, □, □ + 2. □ = 340, 가장 작은 수 338
 *
 * 브라우저에서는 window.Consec, Node 에서는 module.exports 로 노출된다.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.Consec = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // tri: □ + □ + □, cguided·cons·even: 연속하는 세 수, rguided·range: 범위의 수를 모두 더하기
  var KINDS = ['tri', 'cguided', 'cons', 'even', 'rguided', 'range'];
  var THREE = ['cguided', 'cons', 'even'];
  var ASK_WORD = { small: '가장 작은 수', mid: '가운데 수', big: '가장 큰 수' };

  // ------------------------------------------------------------------ 난수

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

  function pick(rng, list) {
    return list[Math.floor(rng() * list.length)];
  }

  // ------------------------------------------------------------------ 말

  /** 수 뒤의 조사. 끝자리 0·1·3·6·7·8 은 받침이 있다. J(903, '이가') → '903이' */
  function J(n, pair) {
    return n + ('013678'.indexOf(String(n).slice(-1)) >= 0 ? pair.charAt(0) : pair.charAt(1));
  }

  /** 903이니까 / 1002니까 */
  function copula(n, tail) {
    return n + ('013678'.indexOf(String(n).slice(-1)) >= 0 ? '이' : '') + tail;
  }

  /** 연속하는 세 수 / 세 짝수 / 세 홀수 */
  function threeWord(q) {
    return '연속하는 세 ' + (q.step === 1 ? '수' : q.parity === 0 ? '짝수' : '홀수');
  }

  /** 짝수 / 홀수 / 수 */
  function rangeWord(q) {
    return q.step === 1 ? '수' : q.parity === 0 ? '짝수' : '홀수';
  }

  // ------------------------------------------------------------------ 문제

  /** 가운데 수 m 과 간격 step 으로 세 수 문제 */
  function makeThree(kind, m, step, ask) {
    var q = { kind: kind, m: m, step: step, parity: m % 2, ask: ask };
    q.nums = [m - step, m, m + step];
    q.total = 3 * m;
    return q;
  }

  /** a 부터 b 까지 step 간격의 수 */
  function makeRange(kind, a, b, step) {
    var q = { kind: kind, a: a, b: b, step: step, parity: a % 2 };
    q.terms = [];
    for (var x = a; x <= b; x += step) q.terms.push(x);
    q.n = q.terms.length;
    q.total = q.terms.reduce(function (t, x) { return t + x; }, 0);
    q.pair = a + b;
    q.pairs = Math.floor(q.n / 2);
    q.middle = q.n % 2 ? q.terms[(q.n - 1) / 2] : null;
    return q;
  }

  /** kind 에 맞는 문제 하나 */
  function generate(kind, rng) {
    rng = rng || Math.random;
    var q;
    if (kind === 'tri') {
      q = makeThree('tri', randInt(rng, 34, 333), 0, 'mid');
    } else if (THREE.indexOf(kind) >= 0) {
      var step = kind === 'cons' ? 1 : kind === 'even' ? 2 : rng() < 0.5 ? 1 : 2;
      var m = randInt(rng, 101, 499);
      // 짝수·홀수 문제는 반쯤 홀수로
      if (step === 2 && (kind === 'cguided' ? rng() < 0.5 : rng() < 0.7) !== (m % 2 === 0)) m++;
      q = makeThree(kind, m, step, kind === 'cguided' ? pick(rng, ['small', 'big']) : pick(rng, ['small', 'big', 'big', 'small', 'mid']));
    } else {
      var st = rng() < 0.75 ? 2 : 1;
      var n = st === 1 ? randInt(rng, 5, 9) : randInt(rng, 5, 11);
      var a = randInt(rng, 100, 400);
      if (st === 2 && rng() < 0.7 && a % 2) a++;    // 짝수가 더 자주
      q = makeRange(kind, a, a + (n - 1) * st, st);
    }
    return finish(q);
  }

  function worksheetRange() { return finish(makeRange('range', 120, 140, 2)); }
  function worksheetCons() { return finish(makeThree('cons', 301, 1, 'big')); }
  function worksheetEven() { return finish(makeThree('even', 340, 2, 'small')); }

  function finish(q) {
    if (q.terms) {
      q.answer = { total: q.total };
      if (q.kind === 'rguided') {
        q.answer.pair = q.pair;
        q.answer.pairs = q.pairs;
        if (q.middle !== null) q.answer.middle = q.middle;
      }
    } else {
      q.answer = { ans: q.nums[{ small: 0, mid: 1, big: 2 }[q.ask]] };
      if (q.kind === 'cguided') q.answer.m = q.m;
    }
    return q;
  }

  /** 문제 글 */
  function questionText(q) {
    if (q.kind === 'tri') return '똑같은 수 세 개를 더했더니 ' + J(q.total, '이가') + ' 되었어요. □ + □ + □ = ' + q.total + '일' + ' 때 □는 얼마일까요?';
    if (q.terms) return q.a + '부터 ' + q.b + '까지의 ' + rangeWord(q) + '를 모두 더한 값을 구해 보세요.';
    return threeWord(q) + '의 합이 ' + q.total + '일' + ' 때 ' + threeWord(q) + ' 중에서 ' + ASK_WORD[q.ask] + '는 얼마일까요?';
  }

  /** 빈칸 줄. 글자는 문자열, 빈칸은 {input} */
  function lines(q) {
    if (q.kind === 'tri') return [['□ = ', { input: 'ans' }]];
    if (q.kind === 'cguided') {
      var s = q.step;
      return [
        ['가운데 수를 □라고 하면 세 수는 □ − ' + s + ', □, □ + ' + s + '예요'],
        ['□ + □ + □ = ' + copula(q.total, '니까') + ' □ = ', { input: 'm' }],
        [ASK_WORD[q.ask] + ' = □ ' + (q.ask === 'small' ? '−' : '+') + ' ' + s + ' = ', { input: 'ans' }]
      ];
    }
    if (q.kind === 'rguided') {
      var out = [
        ['앞뒤로 짝을 지어요: ' + q.terms[0] + ' + ' + q.terms[q.n - 1] + ', ' + q.terms[1] + ' + ' + q.terms[q.n - 2] + ', …'],
        ['짝 하나의 합: ' + q.a + ' + ' + q.b + ' = ', { input: 'pair' }],
        ['짝의 수: ', { input: 'pairs' }, '쌍']
      ];
      if (q.middle !== null) out.push(['짝 없이 남는 가운데 수: ', { input: 'middle' }]);
      out.push(['모두 더한 값 = ', { input: 'total' }]);
      return out;
    }
    if (q.terms) return [['모두 더한 값 = ', { input: 'total' }]];
    return [[ASK_WORD[q.ask] + ' = ', { input: 'ans' }]];
  }

  function inputKeys(q) {
    return [].concat.apply([], lines(q)).filter(function (t) { return typeof t !== 'string'; }).map(function (t) { return t.input; });
  }

  /**
   * 세 배를 자리마다 나눠 보이기. 1020 → '900 = 300 + 300 + 300, 120 = 40 + 40 + 40 → 300 + 40 = 340'
   */
  function thirdLine(total) {
    var m = total / 3;
    var parts = [Math.floor(m / 100) * 100, Math.floor(m / 10) % 10 * 10, m % 10].filter(function (p) { return p > 0; });
    var head = parts.map(function (p) { return 3 * p + ' = ' + p + ' + ' + p + ' + ' + p; }).join(', ');
    return head + ' → ' + (parts.length > 1 ? parts.join(' + ') + ' = ' + m : String(m));
  }

  /** '260 + 260 + 260 + 260 + 260 = 1300' */
  function repeatLine(v, k) {
    var out = [];
    for (var i = 0; i < k; i++) out.push(v);
    return out.join(' + ') + ' = ' + v * k;
  }

  /** 풀이 줄 */
  function solutionLines(q) {
    if (q.kind === 'tri') return ['□ + □ + □ = ' + q.total, thirdLine(q.total) + ' → □ = ' + q.m];
    if (q.terms) {
      var out = [
        '앞뒤로 짝을 지으면 ' + q.a + ' + ' + q.b + ' = ' + J(q.pair, '이가') + ' ' + q.pairs + '쌍' +
          (q.middle !== null ? ', 가운데 ' + J(q.middle, '이가') + ' 남아요.' : '이에요.'),
        q.pair + ' × ' + q.pairs + ' : ' + repeatLine(q.pair, q.pairs)
      ];
      out.push(q.middle !== null
        ? q.pair * q.pairs + ' + ' + q.middle + ' = ' + q.total
        : '모두 더한 값 = ' + q.total);
      return out;
    }
    var s = q.step;
    var lines2 = [
      '가운데 수를 □라고 하면 □ − ' + s + ', □, □ + ' + s + '의 합은 □ + □ + □ = ' + q.total,
      thirdLine(q.total) + ' → □ = ' + q.m
    ];
    lines2.push('세 수는 ' + q.nums.join(', ') + ' → ' + ASK_WORD[q.ask] + ' ' + q.answer.ans);
    return lines2;
  }

  // ------------------------------------------------------------------ 채점

  function parseNum(text) {
    var s = String(text == null ? '' : text)
      .replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
      .replace(/[\s,]+/g, '')
      .replace(/(쌍|개)$/, '');
    if (!s) return { error: 'empty' };
    if (!/^\d{1,5}$/.test(s)) return { error: 'format' };
    return { value: Number(s) };
  }

  /** 방법은 맞고 한 자리 계산만 틀린 듯한 차이 */
  function isSlip(v, expected) {
    return [1, 9, 10, 11, 90, 99, 100, 110, 1000].indexOf(Math.abs(v - expected)) >= 0;
  }

  /**
   * 채점. value 는 빈칸 키 → 수.
   * 돌려주는 값: {correct, ok: {키: 맞았나}, mistake, step}
   *   세 수 — notThird (합을 그대로 씀), gaveMiddle (가운데 수를 씀), otherEnd (반대쪽 끝), stepOne (짝수·홀수인데 1씩)
   *   범위 — allNumbers (짝수·홀수만이 아니라 모든 수), missedEnd (한 끝을 빠뜨림), forgotMiddle (가운데 수를 안 더함),
   *          doubleCount (짝의 합 × 수의 개수), countedNumbers (짝의 수 대신 수의 개수)
   *   공통 — calc (계산 실수), null (그 밖)
   */
  function grade(q, value) {
    var ok = {};
    var keys = inputKeys(q);
    keys.forEach(function (k) { ok[k] = value[k] === q.answer[k]; });
    if (keys.every(function (k) { return ok[k]; })) return { correct: true, ok: ok, mistake: null };

    var step = keys.filter(function (k) { return !ok[k]; })[0];
    var v = value[step];
    var exp = q.answer[step];
    var mistake = null;

    if (!q.terms) {
      if (v === q.total) mistake = 'notThird';
      else if (step === 'ans' && q.kind !== 'tri') {
        var other = q.ask === 'small' ? q.nums[2] : q.ask === 'big' ? q.nums[0] : null;
        if (q.ask !== 'mid' && v === q.m) mistake = 'gaveMiddle';
        else if (v === other) mistake = 'otherEnd';
        else if (q.step === 2 && (v === q.m - 1 || v === q.m + 1)) mistake = 'stepOne';
      }
    } else if (step === 'pairs') {
      if (v === q.n) mistake = 'countedNumbers';
    } else if (step === 'total') {
      var all = 0;
      for (var x = q.a; x <= q.b; x++) all += x;
      if (q.step === 2 && v === all) mistake = 'allNumbers';
      else if (v === q.total - q.a || v === q.total - q.b) mistake = 'missedEnd';
      else if (q.middle !== null && v === q.total - q.middle) mistake = 'forgotMiddle';
      else if (v === q.pair * q.n) mistake = 'doubleCount';
    }
    if (!mistake && isSlip(v, exp)) mistake = 'calc';
    return { correct: false, ok: ok, mistake: mistake, step: step };
  }

  return {
    KINDS: KINDS,
    ASK_WORD: ASK_WORD,
    J: J,
    mulberry32: mulberry32,
    generate: generate,
    worksheetRange: worksheetRange,
    worksheetCons: worksheetCons,
    worksheetEven: worksheetEven,
    threeWord: threeWord,
    rangeWord: rangeWord,
    questionText: questionText,
    lines: lines,
    inputKeys: inputKeys,
    thirdLine: thirdLine,
    repeatLine: repeatLine,
    solutionLines: solutionLines,
    parseNum: parseNum,
    grade: grade
  };
});
