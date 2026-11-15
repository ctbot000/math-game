/**
 * near.js
 *
 * 가장 가까운 수의 계산 부분 — 문제 만들기, 채점, 풀이 글. DOM 은 건드리지 않는다.
 *
 * 학습지 8-1: □는 십의 자리 수와 일의 자리 수가 같은 세 자리 수. 202 + □ 가 700 에 가장 가깝게.
 *   □ = 700 − 202 = 498 이면 딱 맞지만 조건에 안 맞는다. 가까운 수 488, 499 → 499
 * 학습지 8-2: 백의 자리 수와 일의 자리 수가 같은 수. 563 + □ 가 999 에 가장 가깝게. 436 → 434, 444 → 434
 * 학습지 8-3: 354 + □ + 268 이 800 에 가장 가깝게. 354 + 268 = 622, 178 → 171, 181 → 181
 * 학습지 8-4: 수 카드 1, 4, 6, 3 중 세 장으로 700 과의 차가 325 에 가장 가까운 세 자리 수.
 *   700 − 325 = 375 → 만들 수 있는 가까운 수 364, 413 → 364
 *
 * 브라우저에서는 window.Near, Node 에서는 module.exports 로 노출된다.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.Near = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // pguided: 조건 수 차례로, tens·hund: 두 수의 합, three: 세 수의 합, cguided·cards: 수 카드
  var KINDS = ['pguided', 'tens', 'hund', 'three', 'cguided', 'cards'];
  var PAT_WORD = { to: '십의 자리 수와 일의 자리 수가 같은', ho: '백의 자리 수와 일의 자리 수가 같은' };
  var PAT_SHORT = { to: '십의 자리와 일의 자리가 같은', ho: '백의 자리와 일의 자리가 같은' };

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

  /** 수 뒤의 조사. 끝자리 0·1·3·6·7·8 은 받침이 있다. J(700, '과와') → '700과' */
  function J(n, pair) {
    return n + ('013678'.indexOf(String(n).slice(-1)) >= 0 ? pair.charAt(0) : pair.charAt(1));
  }

  // ------------------------------------------------------------------ 수

  /** 조건에 맞는 세 자리 수인가. to: 십의 자리 = 일의 자리, ho: 백의 자리 = 일의 자리 */
  function isPat(pat, n) {
    if (n < 100 || n > 999) return false;
    var s = String(n);
    return pat === 'to' ? s[1] === s[2] : s[0] === s[2];
  }

  function patList(pat) {
    var out = [];
    for (var n = 100; n <= 999; n++) if (isPat(pat, n)) out.push(n);
    return out;
  }

  /** 카드 세 장으로 만들 수 있는 세 자리 수 (작은 것부터) */
  function makeable(cards) {
    var out = [];
    for (var i = 0; i < cards.length; i++) {
      for (var j = 0; j < cards.length; j++) {
        for (var k = 0; k < cards.length; k++) {
          if (i === j || j === k || i === k || cards[i] === 0) continue;
          var n = cards[i] * 100 + cards[j] * 10 + cards[k];
          if (out.indexOf(n) < 0) out.push(n);
        }
      }
    }
    return out.sort(function (a, b) { return a - b; });
  }

  /** list 에서 x 바로 아래와 바로 위 */
  function neighbours(list, x) {
    var below = null;
    var above = null;
    list.forEach(function (n) {
      if (n < x) below = n;
      else if (n > x && above === null) above = n;
    });
    return { below: below, above: above };
  }

  /** list 에서 x 에 가장 가까운 수. 둘이 같이 가까우면 null */
  function nearest(list, x) {
    var best = null;
    var tie = false;
    list.forEach(function (n) {
      var d = Math.abs(n - x);
      if (best === null || d < Math.abs(best - x)) { best = n; tie = false; }
      else if (d === Math.abs(best - x) && n !== best) tie = true;
    });
    return tie ? null : best;
  }

  function candidates(q) { return q.cards ? makeable(q.cards) : patList(q.pat); }

  // ------------------------------------------------------------------ 문제

  /** 조건 수 문제. nums 는 □ 말고 주어진 수 (하나 또는 둘) */
  function makePattern(kind, pat, nums, target) {
    var given = nums.reduce(function (t, x) { return t + x; }, 0);
    var q = { kind: kind, pat: pat, nums: nums, given: given, target: target, ideal: target - given };
    var nb = neighbours(patList(pat), q.ideal);
    q.below = nb.below;
    q.above = nb.above;
    q.ans = nearest([nb.below, nb.above].filter(function (n) { return n !== null; }), q.ideal);
    q.sum = q.ans === null ? null : given + q.ans;
    return q;
  }

  /** 수 카드 문제. target 과의 차가 diff 에 가장 가까운 수 */
  function makeCards(kind, cards, target, diff) {
    var q = { kind: kind, cards: cards, target: target, diff: diff, ideal: target - diff };
    var list = makeable(cards);
    var nb = neighbours(list, q.ideal);
    q.below = nb.below;
    q.above = nb.above;
    // 만들 수 있는 모든 수를 차례로 따져 본 답
    var best = null;
    var tie = false;
    list.forEach(function (n) {
      var d = Math.abs(Math.abs(target - n) - diff);
      var bd = best === null ? Infinity : Math.abs(Math.abs(target - best) - diff);
      if (d < bd) { best = n; tie = false; } else if (d === bd) tie = true;
    });
    q.ans = tie ? null : best;
    return q;
  }

  /** 문제로 쓸 만한가: 딱 맞는 수는 조건에 안 맞고, 양쪽 이웃이 있고, 가장 가까운 수가 하나 */
  function usable(q) {
    if (q.below === null || q.above === null || q.ans === null) return false;
    if (q.ideal - q.below === q.above - q.ideal) return false;
    if (candidates(q).indexOf(q.ideal) >= 0) return false;
    return q.ans === (q.ideal - q.below < q.above - q.ideal ? q.below : q.above);
  }

  function randomIdeal(rng) {
    // 백의 자리가 바뀌는 경계(498 → 499, 500)를 자주
    if (rng() < 0.4) return randInt(rng, 1, 9) * 100 + randInt(rng, -6, 6);
    return randInt(rng, 110, 989);
  }

  /** kind 에 맞는 문제 하나 */
  function generate(kind, rng) {
    rng = rng || Math.random;
    for (;;) {
      var q;
      if (kind === 'cards' || kind === 'cguided') {
        var pool = [1, 2, 3, 4, 5, 6, 7, 8, 9];
        if (rng() < 0.2) pool.push(0);
        var cards = [];
        while (cards.length < 4) {
          var c = pick(rng, pool);
          if (cards.indexOf(c) < 0) cards.push(c);
        }
        var t = pick(rng, [500, 600, 700, 700, 800, 900]);
        var ideal = randInt(rng, 120, 880);
        var diff = t - ideal;
        // 차가 같은 수가 target 위쪽에도 생기지 않게: target + diff 는 네 자리
        if (diff < 100 || t + diff < 1000) continue;
        q = makeCards(kind, cards, t, diff);
      } else {
        var pat = kind === 'tens' ? 'to' : kind === 'hund' ? 'ho' : pick(rng, ['to', 'ho']);
        var three = kind === 'three';
        var target = three ? pick(rng, [600, 700, 800, 900, 999]) : pick(rng, [400, 500, 600, 700, 800, 900, 999]);
        var id = randomIdeal(rng);
        if (id < 110 || id > 989) continue;
        var rest = target - id;
        var nums;
        if (three) {
          if (rest < 200) continue;
          var a = randInt(rng, 100, Math.min(899, rest - 100));
          if (rest - a < 100 || rest - a > 899) continue;
          nums = [a, rest - a];
        } else {
          if (rest < 100 || rest > 899) continue;
          nums = [rest];
        }
        q = makePattern(kind, pat, nums, target);
      }
      if (usable(q)) return finish(q);
    }
  }

  function worksheet81() { return finish(makePattern('tens', 'to', [202], 700)); }
  function worksheet82() { return finish(makePattern('hund', 'ho', [563], 999)); }
  function worksheet83() { return finish(makePattern('three', 'ho', [354, 268], 800)); }
  function worksheet84() { return finish(makeCards('cards', [1, 4, 6, 3], 700, 325)); }

  function finish(q) {
    q.answer = { ans: q.ans };
    if (q.kind === 'pguided' || q.kind === 'cguided') {
      q.answer.ideal = q.ideal;
      q.answer.below = q.below;
      q.answer.above = q.above;
    }
    return q;
  }

  /** 문제 글 */
  function questionText(q) {
    if (q.cards) {
      return q.cards.length + '장의 수 카드 ' + q.cards.join(', ') + ' 중 세 장을 골라 ' + J(q.target, '과와') + '의 차가 ' +
        q.diff + '에 가장 가깝게 되는 세 자리 수를 만들어 보세요. (단, 수 카드를 한 번씩만 사용합니다.)';
    }
    return '□ 안의 수는 ' + PAT_WORD[q.pat] + ' 세 자리 수입니다. ' + (q.nums.length === 1 ? '두' : '세') + ' 수의 합이 ' +
      q.target + '에 가장 가까운 수가 되도록 □ 안에 알맞은 수를 구해 보세요.';
  }

  /** 학습지의 네모 칸 속 식. 세 수는 학습지처럼 □ 를 가운데에 */
  function exprText(q) {
    if (q.cards) return q.cards.join(' ');
    return q.nums.length === 1 ? q.nums[0] + ' + □' : q.nums[0] + ' + □ + ' + q.nums[1];
  }

  /** 빈칸 줄. 글자는 문자열, 빈칸은 {input} */
  function lines(q) {
    if (q.kind === 'pguided') {
      return [
        ['먼저 합이 딱 ' + J(q.target, '이가') + ' 되는 □를 구하고, ' + PAT_SHORT[q.pat] + ' 수 중 가까운 수를 찾아요'],
        [q.target + ' − ' + q.given + ' = ', { input: 'ideal' }],
        ['조건에 맞는 바로 아래 수: ', { input: 'below' }],
        ['조건에 맞는 바로 위 수: ', { input: 'above' }],
        ['□ = ', { input: 'ans' }]
      ];
    }
    if (q.kind === 'cguided') {
      return [
        ['먼저 ' + J(q.target, '과와') + '의 차가 딱 ' + q.diff + '인 수를 구하고, 카드로 만들 수 있는 가까운 수를 찾아요'],
        [q.target + ' − ' + q.diff + ' = ', { input: 'ideal' }],
        ['카드로 만든 바로 아래 수: ', { input: 'below' }],
        ['카드로 만든 바로 위 수: ', { input: 'above' }],
        ['만든 수: ', { input: 'ans' }]
      ];
    }
    if (q.cards) return [['만든 수: ', { input: 'ans' }]];
    return [['□ = ', { input: 'ans' }]];
  }

  function inputKeys(q) {
    return [].concat.apply([], lines(q)).filter(function (t) { return typeof t !== 'string'; }).map(function (t) { return t.input; });
  }

  /** 풀이 줄. 마지막 줄 끝 수가 답 */
  function solutionLines(q) {
    var out = [];
    if (q.cards) {
      out.push(q.target + ' − (만든 수) = ' + J(q.diff, '이가') + ' 되려면 만든 수 = ' + q.target + ' − ' + q.diff + ' = ' + q.ideal);
      out.push('카드로 만들 수 있는 수 중 ' + J(q.ideal, '과와') + ' 가까운 수는 ' + q.below + ', ' + q.above);
    } else {
      if (q.nums.length === 2) out.push(q.nums[0] + ' + ' + q.nums[1] + ' = ' + q.given);
      out.push(q.given + ' + □ = ' + J(q.target, '이가') + ' 되려면 □ = ' + q.target + ' − ' + q.given + ' = ' + q.ideal);
      out.push(PAT_SHORT[q.pat] + ' 수 중 ' + J(q.ideal, '과와') + ' 가까운 수는 ' + q.below + ', ' + q.above);
    }
    out.push(q.ideal + ' − ' + q.below + ' = ' + (q.ideal - q.below) + ', ' + q.above + ' − ' + q.ideal + ' = ' +
      (q.above - q.ideal) + ' → 더 가까운 수 ' + q.ans);
    return out;
  }

  /** 맞춘 뒤 확인 한 줄: 202 + 499 = 701 → 700과 1 차이 */
  function checkLine(q) {
    if (q.cards) {
      var d = q.target - q.ans;
      return q.target + ' − ' + q.ans + ' = ' + d + ' → ' + J(q.diff, '과와') + ' ' + Math.abs(d - q.diff) + ' 차이';
    }
    var parts = q.nums.length === 1 ? [q.nums[0], q.ans] : [q.nums[0], q.ans, q.nums[1]];
    return parts.join(' + ') + ' = ' + q.sum + ' → ' + J(q.target, '과와') + ' ' + Math.abs(q.sum - q.target) + ' 차이';
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

  /** 방법은 맞고 한 자리 계산만 틀린 듯한 차이 */
  function isSlip(v, expected) {
    return [1, 2, 9, 10, 11, 90, 100, 110].indexOf(Math.abs(v - expected)) >= 0;
  }

  /** 수 카드로 만든 수 중 diff 자체에 가장 가까운 수 (차가 아니라 수를 맞춘 실수) */
  function closeToDiff(q) {
    return nearest(makeable(q.cards), q.diff);
  }

  /**
   * 채점. value 는 빈칸 키 → 수.
   * 돌려주는 값: {correct, ok: {키: 맞았나}, mistake, step}
   *   ideal (딱 맞는 수를 그대로 씀 — 조건에 안 맞음), gaveSum (합이나 목표 수를 씀), partSum (주어진 두 수의 합),
   *   otherSide (반대쪽 이웃 — 더 멀다), wrongPattern (다른 자리끼리 같은 수), notNearest (조건엔 맞지만 더 먼 수),
   *   notPattern (조건에 안 맞는 수), closeToDiff (차가 아니라 그 수에 가까운 수), notCards (카드로 못 만드는 수),
   *   swapped (아래·위를 바꿔 씀), calc (계산 실수), null (그 밖)
   */
  function grade(q, value) {
    var ok = {};
    var keys = inputKeys(q);
    keys.forEach(function (k) { ok[k] = value[k] === q.answer[k]; });
    if (keys.every(function (k) { return ok[k]; })) return { correct: true, ok: ok, mistake: null };

    var step = keys.filter(function (k) { return !ok[k]; })[0];
    var v = value[step];
    var exp = q.answer[step];
    var list = candidates(q);
    var fits = list.indexOf(v) >= 0;
    var mistake = null;

    if (step === 'below' || step === 'above') {
      if (v === (step === 'below' ? q.above : q.below)) mistake = 'swapped';
      else if (!fits) mistake = q.cards ? 'notCards' : 'notPattern';
      else mistake = 'notNearest';
    } else if (step === 'ans') {
      var other = q.ans === q.below ? q.above : q.below;
      if (v === q.ideal) mistake = 'ideal';
      else if (!q.cards && (v === q.target || v === q.sum)) mistake = 'gaveSum';
      else if (!q.cards && q.nums.length === 2 && v === q.given) mistake = 'partSum';
      else if (v === other) mistake = 'otherSide';
      else if (q.cards && v === closeToDiff(q)) mistake = 'closeToDiff';
      else if (!q.cards && !fits && v === nearest(patList(q.pat === 'to' ? 'ho' : 'to'), q.ideal)) mistake = 'wrongPattern';
      else if (fits) mistake = 'notNearest';
      else if (q.cards && v >= 100 && v <= 999) mistake = 'notCards';   // 카드 답은 계산이 아니라 고르기
      else if (isSlip(v, exp)) mistake = 'calc';
      else if (v >= 100 && v <= 999) mistake = q.cards ? 'notCards' : 'notPattern';
    }
    if (!mistake && isSlip(v, exp)) mistake = 'calc';
    return { correct: false, ok: ok, mistake: mistake, step: step };
  }

  return {
    KINDS: KINDS,
    PAT_WORD: PAT_WORD,
    PAT_SHORT: PAT_SHORT,
    J: J,
    mulberry32: mulberry32,
    isPat: isPat,
    patList: patList,
    makeable: makeable,
    nearest: nearest,
    generate: generate,
    worksheet81: worksheet81,
    worksheet82: worksheet82,
    worksheet83: worksheet83,
    worksheet84: worksheet84,
    questionText: questionText,
    exprText: exprText,
    lines: lines,
    inputKeys: inputKeys,
    solutionLines: solutionLines,
    checkLine: checkLine,
    closeToDiff: closeToDiff,
    parseNum: parseNum,
    grade: grade
  };
});
