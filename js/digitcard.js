/**
 * digitcard.js
 *
 * 숫자 카드로 세 자리 수 만들기의 계산 부분 — 문제 만들기, 가장 좋은 답 찾기, 채점, 풀이 글. DOM 은 건드리지 않는다.
 *
 * 학습지: 「0부터 9까지의 수를 한 번씩만 사용하여 두 개의 세 자리 수를 만들려고 합니다.
 *          만든 두 수의 차가 가장 작을 때 두 수를 각각 구해 보세요.」
 *   백의 자리는 차가 1인 두 숫자, 큰 수의 나머지는 가장 작게(01), 작은 수의 나머지는 가장 크게(98).
 *   301 − 298 = 3. 답은 다섯 가지다 — 301·298, 401·398, 501·498, 601·598, 701·698.
 *
 * 가장 좋은 답은 규칙으로 만들지 않고 모든 경우를 세어 찾는다 (카드 10장이면 15만 가지 남짓).
 * 그래서 답이 여러 개여도 모두 정답으로 받는다.
 *
 * 브라우저에서는 window.DigitCard, Node 에서는 module.exports 로 노출된다.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.DigitCard = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // single: 수 하나 (가장 큰 / 가장 작은), diffMax·diffMin: 두 수의 차가 가장 큰 / 작은, sheet: 학습지형 (0~9 또는 1~9)
  var KINDS = ['single', 'diffMax', 'diffMin', 'sheet'];

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

  /** 0~9 에서 서로 다른 숫자 n 개, 작은 순서로 */
  function pickDigits(rng, n, withZero) {
    var pool = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    var out = withZero ? [0] : [];
    while (out.length < n) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
    return out.sort(function (a, b) { return a - b; });
  }

  function range(lo, hi) {
    var out = [];
    for (var i = lo; i <= hi; i++) out.push(i);
    return out;
  }

  // ------------------------------------------------------------------ 가장 좋은 답

  function num(ds) { return ds[0] * 100 + ds[1] * 10 + ds[2]; }

  /** 카드로 만들 수 있는 세 자리 수 (백의 자리 0 제외). used 의 카드는 빼고. */
  function eachNumber(cards, used, fn) {
    for (var i = 0; i < cards.length; i++) {
      if (used[i] || cards[i] === 0) continue;
      for (var j = 0; j < cards.length; j++) {
        if (j === i || used[j]) continue;
        for (var k = 0; k < cards.length; k++) {
          if (k === i || k === j || used[k]) continue;
          fn(cards[i] * 100 + cards[j] * 10 + cards[k], [i, j, k]);
        }
      }
    }
  }

  /**
   * 가장 좋은 답을 모두 찾는다.
   *   single  goal 'max'|'min' → {value, answers: [n]}
   *   pair    goal 'diffMax'|'diffMin' → {value: 차, answers: [[큰 수, 작은 수], …]} (큰 수 오름차순)
   */
  function solve(cards, goal) {
    var none = cards.map(function () { return false; });
    if (goal === 'max' || goal === 'min') {
      var best = null;
      eachNumber(cards, none, function (n) {
        if (best === null || (goal === 'max' ? n > best : n < best)) best = n;
      });
      return { value: best, answers: [best] };
    }
    var bestD = null;
    var list = [];
    eachNumber(cards, none, function (a, idx) {
      var used = none.slice();
      idx.forEach(function (i) { used[i] = true; });
      eachNumber(cards, used, function (b) {
        if (b >= a) return;                       // a 가 큰 수
        var d = a - b;
        if (bestD === null || (goal === 'diffMax' ? d > bestD : d < bestD)) {
          bestD = d;
          list = [[a, b]];
        } else if (d === bestD) {
          list.push([a, b]);
        }
      });
    });
    list.sort(function (x, y) { return x[0] - y[0]; });
    return { value: bestD, answers: list };
  }

  // ------------------------------------------------------------------ 문제

  /** kind 에 맞는 문제 하나. {kind, cards, goal, rows, best} */
  function generate(kind, rng) {
    rng = rng || Math.random;
    var q;
    if (kind === 'single') {
      q = { kind: kind, cards: pickDigits(rng, rng() < 0.5 ? 4 : 5, rng() < 0.6), goal: rng() < 0.5 ? 'max' : 'min' };
    } else if (kind === 'diffMax' || kind === 'diffMin') {
      q = { kind: kind, cards: pickDigits(rng, 6, rng() < 0.6), goal: kind };
    } else {
      var from = rng() < 0.6 ? 0 : 1;
      q = { kind: 'sheet', from: from, cards: range(from, 9), goal: rng() < 0.7 ? 'diffMin' : 'diffMax' };
    }
    return finish(q);
  }

  /** 학습지 문제 그대로 */
  function worksheet() {
    return finish({ kind: 'sheet', from: 0, cards: range(0, 9), goal: 'diffMin' });
  }

  function finish(q) {
    q.rows = q.goal === 'max' || q.goal === 'min' ? 1 : 2;
    q.best = solve(q.cards, q.goal);
    return q;
  }

  /** 문제 글 */
  function questionText(q) {
    if (q.kind === 'sheet') {
      return q.from + '부터 9까지의 수를 한 번씩만 사용하여 두 개의 세 자리 수를 만들려고 합니다. ' +
        '만든 두 수의 차가 가장 ' + (q.goal === 'diffMin' ? '작을' : '클') + ' 때 두 수를 각각 구해 보세요.';
    }
    var cards = q.cards.join(', ');
    if (q.rows === 1) {
      return '숫자 카드 ' + cards + ' 중 3장을 골라 한 번씩만 사용하여 가장 ' +
        (q.goal === 'max' ? '큰' : '작은') + ' 세 자리 수를 만들어 보세요.';
    }
    return '숫자 카드 ' + cards + ('0136781'.indexOf(cards.slice(-1)) >= 0 ? '을' : '를') + ' 한 번씩만 사용하여 두 개의 세 자리 수를 만들려고 합니다. ' +
      '두 수의 차가 가장 ' + (q.goal === 'diffMin' ? '작게' : '크게') + ' 되도록 만들어 보세요.';
  }

  // ------------------------------------------------------------------ 채점

  /**
   * value: 줄마다 자리 숫자 배열. 빈칸은 null. [[3, 0, 1], [2, 9, 8]]
   * 돌려주는 값: {correct, mistake, numbers, value}
   *   mistake — empty·reused·leadingZero (만들 수 없는 수),
   *             notBest(single), hundredsGap·restNotBest(diffMin), notBest(diffMax)
   *   numbers — 만든 수 (두 줄이면 큰 수, 작은 수 순서), value — 만든 수 또는 차
   */
  function grade(q, value) {
    var flat = [].concat.apply([], value);
    if (flat.some(function (d) { return d === null || d === undefined; })) return { correct: false, mistake: 'empty' };
    var count = {};
    for (var i = 0; i < flat.length; i++) {
      count[flat[i]] = (count[flat[i]] || 0) + 1;
      if (q.cards.indexOf(flat[i]) < 0 || count[flat[i]] > 1) return { correct: false, mistake: 'reused' };
    }
    if (value.some(function (row) { return row[0] === 0; })) return { correct: false, mistake: 'leadingZero' };

    var nums = value.map(num);
    if (q.rows === 1) {
      var ok = nums[0] === q.best.value;
      return { correct: ok, mistake: ok ? null : 'notBest', numbers: nums, value: nums[0] };
    }
    nums.sort(function (a, b) { return b - a; });
    var d = nums[0] - nums[1];
    if (d === q.best.value) return { correct: true, mistake: null, numbers: nums, value: d };
    var mistake = 'notBest';
    if (q.goal === 'diffMin') {
      var gap = Math.floor(nums[0] / 100) - Math.floor(nums[1] / 100);
      var bestGap = Math.floor(q.best.answers[0][0] / 100) - Math.floor(q.best.answers[0][1] / 100);
      mistake = gap > bestGap ? 'hundredsGap' : 'restNotBest';
    }
    return { correct: false, mistake: mistake, numbers: nums, value: d };
  }

  // ------------------------------------------------------------------ 풀이

  function rest(n) {
    var r = n % 100;
    return r < 10 ? '0' + r : String(r);
  }

  /** 풀이 줄. 첫 번째 가장 좋은 답을 예로 든다. */
  function solutionLines(q) {
    var b = q.best;
    if (q.goal === 'max') {
      return ['높은 자리부터 큰 숫자를 차례로 놓아요 → ' + b.value];
    }
    if (q.goal === 'min') {
      var lines = ['높은 자리부터 작은 숫자를 차례로 놓아요.'];
      if (q.cards.indexOf(0) >= 0) lines.push('0은 백의 자리에 놓을 수 없으니 십의 자리에 놓아요.');
      lines.push('가장 작은 수는 ' + b.value);
      return lines;
    }
    var big = b.answers[0][0];
    var small = b.answers[0][1];
    if (q.goal === 'diffMax') {
      var ls = [
        '큰 수는 가장 크게: 가장 큰 숫자 세 개를 큰 순서로 → ' + big,
        '작은 수는 남은 숫자로 가장 작게' + (q.cards.indexOf(0) >= 0 ? ' (0은 백의 자리에 못 와요)' : '') + ' → ' + small,
        big + ' − ' + small + ' = ' + b.value
      ];
      return ls;
    }
    var H = Math.floor(big / 100);
    var h = Math.floor(small / 100);
    return [
      '백의 자리 숫자의 차를 가장 작게: ' + H + josaGwa(H) + ' ' + h + (H - h === 1 ? ' (차가 1)' : ''),
      '큰 수 ' + H + '□□는 남은 숫자로 가장 작게 → ' + H + rest(big),
      '작은 수 ' + h + '□□는 남은 숫자로 가장 크게 → ' + h + rest(small),
      big + ' − ' + small + ' = ' + b.value
    ];
  }

  /** '301과 298' */
  function pairText(p) {
    return p[0] + josaGwa(p[0]) + ' ' + p[1];
  }

  /** 숫자 뒤의 과/와. 끝자리 2·4·5·9 는 받침이 없다. */
  function josaGwa(n) {
    return '0136781'.indexOf(String(n).slice(-1)) >= 0 ? '과' : '와';
  }

  return {
    KINDS: KINDS,
    mulberry32: mulberry32,
    solve: solve,
    generate: generate,
    worksheet: worksheet,
    questionText: questionText,
    grade: grade,
    solutionLines: solutionLines,
    pairText: pairText,
    josaGwa: josaGwa
  };
});
