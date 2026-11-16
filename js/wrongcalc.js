/**
 * wrongcalc.js
 *
 * 잘못 계산한 식의 계산 부분 — 문제 만들기, 채점, 풀이 글. DOM 은 건드리지 않는다.
 *
 * 학습지 4: 「어떤 수에 436을 더한 후 188을 빼야 할 것을 잘못하여 어떤 수에서 436을 뺀 후 188을 더했더니 672」
 *   잘못한 식 □ − 436 + 188 = 672 → 거꾸로 □ = 672 − 188 + 436 = 920
 *   바르게: 920 + 436 − 188 = 1168
 *   사진 속 답 296 은 □ = 672 − 436 − 188 = 48 처럼 거꾸로 셈을 바꾸지 않고 뺀 것 (48 + 436 − 188 = 296).
 *
 * 셈은 [{op: '+'|'−', n}] 의 배열이다.
 * 브라우저에서는 window.WrongCalc, Node 에서는 module.exports 로 노출된다.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.WrongCalc = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // one: 더하기·빼기를 바꿈, misread: 수를 잘못 봄, guided·two: 두 번 계산을 거꾸로
  var KINDS = ['one', 'misread', 'guided', 'two'];
  var PLUS = '+';
  var MINUS = '−';

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

  // ------------------------------------------------------------------ 말

  /** 수 뒤의 조사. 끝자리 0·1·3·6·7·8 은 받침이 있다. J(436, '을를') → '436을' */
  function J(n, pair) {
    return n + ('013678'.indexOf(String(n).slice(-1)) >= 0 ? pair.charAt(0) : pair.charAt(1));
  }

  // ------------------------------------------------------------------ 셈

  function flip(op) { return op === PLUS ? MINUS : PLUS; }

  /** x 에 셈을 차례로. 중간에 0 보다 작아지면 null */
  function apply(ops, x) {
    var v = x;
    for (var i = 0; i < ops.length; i++) {
      v = ops[i].op === PLUS ? v + ops[i].n : v - ops[i].n;
      if (v < 0) return null;
    }
    return v;
  }

  /** 중간값까지: [x, x ± a, …] */
  function chain(ops, x) {
    var out = [x];
    ops.forEach(function (o) { out.push(o.op === PLUS ? out[out.length - 1] + o.n : out[out.length - 1] - o.n); });
    return out;
  }

  /** 거꾸로 할 셈: 뒤에서부터, 더하기는 빼기로 */
  function inverse(ops) {
    return ops.slice().reverse().map(function (o) { return { op: flip(o.op), n: o.n }; });
  }

  /** ' − 436 + 188' */
  function opsText(ops) {
    return ops.map(function (o) { return ' ' + o.op + ' ' + o.n; }).join('');
  }

  // ------------------------------------------------------------------ 문제

  function make(kind, x, right, wrong) {
    var q = { kind: kind, x: x, right: right, wrong: wrong };
    q.R = apply(wrong, x);
    q.ans = apply(right, x);
    return q;
  }

  function finish(q) {
    q.answer = { ans: q.ans };
    if (q.kind === 'guided') q.answer.x = q.x;
    return q;
  }

  /** 문제로 쓸 만한가: 중간값이 모두 0 이상, 답·잘못한 값·어떤 수가 서로 다르다 */
  function usable(q) {
    if (q.R === null || q.ans === null || q.R < 10) return false;
    if (apply(inverse(q.wrong), q.R) !== q.x) return false;
    return q.ans !== q.R && q.ans !== q.x && q.R !== q.x;
  }

  /** 세 자리 수의 두 자리를 바꾼 수 (맨 앞은 0 이 아니게) */
  function misreadOf(a, rng) {
    var d = String(a).split('');
    var pairs = [[0, 1], [1, 2], [0, 2]];
    for (var t = 0; t < 6; t++) {
      var p = pairs[Math.floor(rng() * pairs.length)];
      var e = d.slice();
      var tmp = e[p[0]];
      e[p[0]] = e[p[1]];
      e[p[1]] = tmp;
      var b = Number(e.join(''));
      if (e[0] !== '0' && b !== a) return b;
    }
    return null;
  }

  function generate(kind, rng) {
    rng = rng || Math.random;
    for (;;) {
      var x = randInt(rng, 120, 960);
      var a = randInt(rng, 102, 489);
      var q;
      if (kind === 'one') {
        var op = rng() < 0.5 ? PLUS : MINUS;
        q = make(kind, x, [{ op: op, n: a }], [{ op: flip(op), n: a }]);
      } else if (kind === 'misread') {
        var op2 = rng() < 0.5 ? PLUS : MINUS;
        var seen = misreadOf(a, rng);
        if (seen === null) continue;
        q = make(kind, x, [{ op: op2, n: a }], [{ op: op2, n: seen }]);
        q.seen = seen;
      } else {
        var b = randInt(rng, 102, 489);
        if (b === a) continue;
        // 학습지처럼 「더한 후 빼야 할 것을 뺀 후 더했더니」가 더 자주
        var first = rng() < 0.7 ? PLUS : MINUS;
        var right = [{ op: first, n: a }, { op: flip(first), n: b }];
        q = make(kind, x, right, [{ op: flip(first), n: a }, { op: first, n: b }]);
      }
      if (usable(q)) return finish(q);
    }
  }

  function worksheet() {
    return finish(make('two', 920, [{ op: PLUS, n: 436 }, { op: MINUS, n: 188 }], [{ op: MINUS, n: 436 }, { op: PLUS, n: 188 }]));
  }

  // ------------------------------------------------------------------ 글

  /** 「어떤 수에 436을 더한 후 188을 빼야」 같은 말 */
  function doing(ops, tail) {
    var verbs = ops.map(function (o, i) {
      var last = i === ops.length - 1;
      var num = J(o.n, '을를');
      if (o.op === PLUS) return num + ' ' + (last ? '더' + tail.plus : '더한 후');
      return num + ' ' + (last ? tail.minus : '뺀 후');
    });
    return (ops[0].op === PLUS ? '어떤 수에 ' : '어떤 수에서 ') + verbs.join(' ');
  }

  function questionText(q) {
    var end = ' ' + J(q.R, '이가') + ' 되었습니다. 바르게 계산한 값은 얼마일까요?';
    if (q.kind === 'one') {
      return doing(q.right, { plus: '해야 할 것을', minus: '빼야 할 것을' }) + ' 잘못하여 ' +
        (q.wrong[0].op === PLUS ? '더했더니' : '뺐더니') + end;
    }
    if (q.kind === 'misread') {
      return doing(q.right, { plus: '해야 할 것을', minus: '빼야 할 것을' }) + ' 잘못하여 ' + J(q.seen, '을를') + ' ' +
        (q.wrong[0].op === PLUS ? '더했더니' : '뺐더니') + end;
    }
    return doing(q.right, { plus: '해야 할 것을', minus: '빼야 할 것을' }) + ' 잘못하여 ' +
      doing(q.wrong, { plus: '했더니', minus: '뺐더니' }) + end;
  }

  /** 빈칸 줄. 글자는 문자열, 빈칸은 {input} */
  function lines(q) {
    if (q.kind === 'guided') {
      return [
        ['잘못 계산한 식을 쓰고, 거꾸로 계산해 어떤 수 □를 구한 다음 바르게 계산해요'],
        ['잘못한 식: □' + opsText(q.wrong) + ' = ' + q.R],
        ['□ = ' + q.R + opsText(inverse(q.wrong)) + ' = ', { input: 'x' }],
        ['바르게: □' + opsText(q.right) + ' = ', { input: 'ans' }]
      ];
    }
    return [['바르게 계산한 값: ', { input: 'ans' }]];
  }

  function inputKeys(q) {
    return [].concat.apply([], lines(q)).filter(function (t) { return typeof t !== 'string'; }).map(function (t) { return t.input; });
  }

  /** '672 − 188 = 484, 484 + 436 = 920' */
  function chainText(ops, x) {
    var c = chain(ops, x);
    return ops.map(function (o, i) { return c[i] + ' ' + o.op + ' ' + o.n + ' = ' + c[i + 1]; }).join(', ');
  }

  /** 풀이 줄. 마지막 줄 끝 수가 답 */
  function solutionLines(q) {
    var inv = inverse(q.wrong);
    return [
      '잘못 계산한 식: □' + opsText(q.wrong) + ' = ' + q.R,
      '거꾸로 계산해요 (' + (inv.length > 1 ? '뒤에서부터, ' : '') + '더한 것은 빼고 뺀 것은 더해요): ' + chainText(inv, q.R) + ' → 어떤 수는 ' + q.x,
      '바르게 계산하면: ' + chainText(q.right, q.x)
    ];
  }

  // ------------------------------------------------------------------ 채점

  function parseNum(text) {
    var s = String(text == null ? '' : text)
      .replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
      .replace(/[\s,]+/g, '');
    if (!s) return { error: 'empty' };
    if (!/^\d{1,5}$/.test(s)) return { error: 'format' };
    return { value: Number(s) };
  }

  function isSlip(v, expected) {
    return [1, 9, 10, 11, 90, 99, 100, 110, 1000].indexOf(Math.abs(v - expected)) >= 0;
  }

  /** 셈의 부호를 모두 바꿔 본 것들 */
  function signVariants(ops) {
    var out = [];
    for (var m = 0; m < 1 << ops.length; m++) {
      out.push(ops.map(function (o, i) { return { op: m & (1 << i) ? MINUS : PLUS, n: o.n }; }));
    }
    return out;
  }

  /** 거꾸로 셈을 잘못 해서 나온 「어떤 수」들 (진짜는 빼고) */
  function wrongXs(q) {
    var out = [];
    var bases = [q.wrong];
    if (q.kind === 'misread') bases.push(q.right);   // 되돌릴 때 잘못 본 수가 아니라 원래 수를 씀
    bases.forEach(function (ops) {
      signVariants(ops).forEach(function (v) {
        var x = apply(v, q.R);
        if (x !== null && x !== q.x && out.indexOf(x) < 0) out.push(x);
      });
    });
    return out;
  }

  /**
   * 채점. value 는 빈칸 키 → 수.
   * 돌려주는 값: {correct, ok: {키: 맞았나}, mistake, step}
   *   notInverse (거꾸로 셈을 안 바꿈 — 사진 속 296), undoRight (잘못 본 수가 아니라 원래 수로 되돌림),
   *   gaveX (어떤 수를 답으로), gaveWrong (잘못 계산한 값 그대로), opsMixed (어떤 수는 맞고 바르게 셈을 잘못),
   *   calc (계산 실수), null (그 밖)
   */
  function grade(q, value) {
    var ok = {};
    var keys = inputKeys(q);
    keys.forEach(function (k) { ok[k] = value[k] === q.answer[k]; });
    if (keys.every(function (k) { return ok[k]; })) return { correct: true, ok: ok, mistake: null };

    var step = keys.filter(function (k) { return !ok[k]; })[0];
    var v = value[step];
    var mistake = null;
    var xs = wrongXs(q);

    if (step === 'x') {
      if (v === q.R) mistake = 'gaveWrong';
      else if (xs.indexOf(v) >= 0) mistake = q.kind === 'misread' && v === apply(inverse(q.right), q.R) ? 'undoRight' : 'notInverse';
    } else {
      if (v === q.x) mistake = 'gaveX';
      else if (q.kind === 'misread' && v === q.R) mistake = 'undoRight';
      else if (v === q.R) mistake = 'gaveWrong';
      // 어떤 수를 바르게 써 놓았다면 거꾸로 셈은 맞은 것
      else if (!ok.x && xs.some(function (x) { return apply(q.right, x) === v; })) mistake = 'notInverse';
      else if (signVariants(q.right).some(function (o) { return apply(o, q.x) === v; })) mistake = 'opsMixed';
    }
    if (!mistake && isSlip(v, q.answer[step])) mistake = 'calc';
    return { correct: false, ok: ok, mistake: mistake, step: step };
  }

  return {
    KINDS: KINDS,
    J: J,
    mulberry32: mulberry32,
    apply: apply,
    chain: chain,
    inverse: inverse,
    opsText: opsText,
    generate: generate,
    worksheet: worksheet,
    questionText: questionText,
    lines: lines,
    inputKeys: inputKeys,
    solutionLines: solutionLines,
    parseNum: parseNum,
    grade: grade
  };
});
