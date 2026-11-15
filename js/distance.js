/**
 * distance.js
 *
 * 겹친 거리 구하기의 계산 부분 — 문제 만들기, 채점, 풀이 글. DOM 은 건드리지 않는다.
 *
 * 한 줄 위에 ㉠ ㉡ ㉢ ㉣ 네 곳이 차례로 있다. 이웃한 두 곳 사이를 seg[0], seg[1], seg[2] 라고 한다.
 *
 * 학습지 4-3: ㉠~㉣ 589 m, ㉠~㉢ 436 m, ㉡~㉣ 428 m → ㉡~㉢ = 436 + 428 − 589 = 275 m
 *   두 거리를 더하면 ㉡~㉢ 이 두 번 들어가니, 전체를 빼면 겹친 부분만 남는다.
 * 학습지 4-4: ㉡~㉣ 508 m, ㉠~㉢ 439 m, ㉢~㉣ 235 m → ㉡~㉢ = 508 − 235 = 273, ㉠~㉡ = 439 − 273 = 166 m
 *   두 번 빼야 한다. 먼저 가운데(㉡~㉢)를 구하고, 그걸로 끝 부분을 구한다.
 *
 * 브라우저에서는 window.Distance, Node 에서는 module.exports 로 노출된다.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.Distance = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // part: 한 번 빼기, oguided·overlap: 겹친 부분 (4-3), cguided·chain: 두 번 빼기 (4-4)
  var KINDS = ['part', 'oguided', 'overlap', 'cguided', 'chain'];
  var P = ['㉠', '㉡', '㉢', '㉣'];

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

  // ------------------------------------------------------------------ 거리

  /** ㉠~㉣ 의 i 번째에서 j 번째까지의 거리 */
  function span(q, s) {
    var d = 0;
    for (var k = Math.min(s[0], s[1]); k < Math.max(s[0], s[1]); k++) d += q.seg[k];
    return d;
  }

  /** '㉡~㉢' */
  function name(s) { return P[s[0]] + '~' + P[s[1]]; }

  /** '㉡에서 ㉢까지' */
  function longName(s) { return P[s[0]] + '에서 ' + P[s[1]] + '까지'; }

  /** 이웃한 세 거리. 각 60~399 m, 모두 더해 300~999 m */
  function pickSegs(rng) {
    for (;;) {
      var seg = [randInt(rng, 60, 399), randInt(rng, 60, 399), randInt(rng, 60, 399)];
      var t = seg[0] + seg[1] + seg[2];
      if (t >= 300 && t <= 999) return seg;
    }
  }

  // ------------------------------------------------------------------ 문제

  /**
   * kind 에 맞는 문제 하나.
   * {kind, seg, text: 글로 주는 거리, drawn: [그림에 쓰인 거리…], ask: 묻는 거리, mid?: 가운데(chain), answer: {키: 수}}
   */
  function generate(kind, rng) {
    rng = rng || Math.random;
    var q = { kind: kind, seg: pickSegs(rng) };
    if (kind === 'part') {
      // 한 끝을 같이 쓰는 긴 거리와 짧은 거리 → 나머지
      var outers = [[0, 3], [0, 2], [1, 3]];
      var o = outers[Math.floor(rng() * outers.length)];
      var k = randInt(rng, o[0] + 1, o[1] - 1);
      var fromStart = rng() < 0.5;
      q.text = o;
      q.drawn = [fromStart ? [o[0], k] : [k, o[1]]];
      q.ask = fromStart ? [k, o[1]] : [o[0], k];
    } else if (kind === 'overlap' || kind === 'oguided') {
      q.drawn = [[0, 2], [1, 3]];
      // overlap 은 가끔 거꾸로 — 겹친 부분을 주고 전체를 묻는다
      if (kind === 'overlap' && rng() < 0.25) {
        q.text = [1, 2];
        q.ask = [0, 3];
      } else {
        q.text = [0, 3];
        q.ask = [1, 2];
      }
    } else {
      // 4-4 모양. 반쯤은 좌우를 뒤집는다 (㉢~㉣ 을 묻는다).
      if (rng() < 0.5) {
        q.text = [1, 3];
        q.drawn = [[0, 2], [2, 3]];
        q.ask = [0, 1];
      } else {
        q.text = [0, 2];
        q.drawn = [[0, 1], [1, 3]];
        q.ask = [2, 3];
      }
      q.mid = [1, 2];
    }
    return finish(q);
  }

  /** 학습지 4-3 그대로 */
  function worksheetOverlap() {
    return finish({ kind: 'overlap', seg: [161, 275, 153], text: [0, 3], drawn: [[0, 2], [1, 3]], ask: [1, 2] });
  }

  /** 학습지 4-4 그대로 */
  function worksheetChain() {
    return finish({ kind: 'chain', seg: [166, 273, 235], text: [1, 3], drawn: [[0, 2], [2, 3]], ask: [0, 1], mid: [1, 2] });
  }

  function finish(q) {
    q.answer = { ans: span(q, q.ask) };
    if (q.kind === 'oguided') q.answer.sum = span(q, q.drawn[0]) + span(q, q.drawn[1]);
    if (q.kind === 'cguided') q.answer.mid = span(q, q.mid);
    return q;
  }

  // ------------------------------------------------------------------ 글

  /** 문제 글 */
  function questionText(q) {
    return longName(q.text) + '의 거리가 ' + span(q, q.text) + ' m일 때 ' + longName(q.ask) + '의 거리는 몇 m일까요?';
  }

  /** 그림 위 거리의 표시 */
  function marks(q) {
    return q.drawn.map(function (s) { return { span: s, label: span(q, s) + ' m' }; });
  }

  /**
   * 빈칸 줄. 글자는 문자열, 빈칸은 {input, unit}.
   */
  function lines(q) {
    var t = span(q, q.text);
    if (q.kind === 'oguided') {
      var a = span(q, q.drawn[0]);
      var b = span(q, q.drawn[1]);
      return [
        [name(q.drawn[0]) + '과 ' + name(q.drawn[1]) + '을 더하면 ' + name(q.ask) + '이 두 번 들어가요'],
        [a + ' + ' + b + ' = ', { input: 'sum', unit: 'm' }],
        [name(q.ask) + ' = (더한 거리) − ' + t + ' = ', { input: 'ans', unit: 'm' }]
      ];
    }
    if (q.kind === 'cguided') {
      var whole = q.drawn.filter(function (s) { return s[1] - s[0] === 2; })[0];   // 가운데를 품은 거리
      var piece = q.drawn.filter(function (s) { return s[1] - s[0] === 1; })[0];   // 이웃한 거리
      return [
        ['먼저 가운데 ' + name(q.mid) + '을 구해요'],
        [name(q.mid) + ' = ' + t + ' − ' + span(q, piece) + ' = ', { input: 'mid', unit: 'm' }],
        [name(q.ask) + ' = ' + span(q, whole) + ' − ' + name(q.mid) + ' = ', { input: 'ans', unit: 'm' }]
      ];
    }
    return [[name(q.ask) + ' = ', { input: 'ans', unit: 'm' }]];
  }

  function inputKeys(q) {
    return [].concat.apply([], lines(q)).filter(function (t) { return typeof t !== 'string'; }).map(function (t) { return t.input; });
  }

  /** chain 의 두 그림 거리 — 가운데를 품은 거리(whole), 이웃한 거리(piece) */
  function chainParts(q) {
    return {
      whole: q.drawn.filter(function (s) { return s[1] - s[0] === 2; })[0],
      piece: q.drawn.filter(function (s) { return s[1] - s[0] === 1; })[0]
    };
  }

  /** 풀이 줄 */
  function solutionLines(q) {
    var t = span(q, q.text);
    var ans = span(q, q.ask);
    if (q.kind === 'part') {
      return [name(q.ask) + ' = ' + name(q.text) + ' − ' + name(q.drawn[0]) + ' = ' + t + ' − ' + span(q, q.drawn[0]) + ' = ' + ans];
    }
    if (q.kind === 'overlap' || q.kind === 'oguided') {
      var a = span(q, q.drawn[0]);
      var b = span(q, q.drawn[1]);
      if (q.ask[0] === 0) {
        return [
          name(q.drawn[0]) + '과 ' + name(q.drawn[1]) + '을 더하면 ' + name(q.text) + '을 두 번 센 거예요.',
          a + ' + ' + b + ' = ' + (a + b),
          name(q.ask) + ' = ' + (a + b) + ' − ' + t + ' = ' + ans
        ];
      }
      return [
        name(q.drawn[0]) + '과 ' + name(q.drawn[1]) + '을 더하면 ' + name(q.ask) + '이 두 번 들어가요.',
        a + ' + ' + b + ' = ' + (a + b),
        name(q.ask) + ' = ' + (a + b) + ' − ' + t + ' = ' + ans
      ];
    }
    var cp = chainParts(q);
    var mid = span(q, q.mid);
    return [
      name(q.mid) + ' = ' + name(q.text) + ' − ' + name(cp.piece) + ' = ' + t + ' − ' + span(q, cp.piece) + ' = ' + mid,
      name(q.ask) + ' = ' + name(cp.whole) + ' − ' + name(q.mid) + ' = ' + span(q, cp.whole) + ' − ' + mid + ' = ' + ans
    ];
  }

  // ------------------------------------------------------------------ 채점

  /** '275', ' ２７５ ', '275m', '275 m' → 275 */
  function parseNum(text) {
    var s = String(text == null ? '' : text)
      .replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
      .replace(/[\s,]+/g, '')
      .replace(/(m|ｍ|미터)$/i, '');
    if (!s) return { error: 'empty' };
    if (!/^\d{1,4}$/.test(s)) return { error: 'format' };
    return { value: Number(s) };
  }

  /** 방법은 맞고 한 자리 계산만 틀린 듯한 차이 (받아올림·받아내림 실수) */
  function isSlip(v, expected) {
    return [1, 9, 10, 11, 90, 99, 100, 110].indexOf(Math.abs(v - expected)) >= 0;
  }

  /**
   * 채점. value 는 빈칸 키 → 수.
   * 돌려주는 값: {correct, ok: {키: 맞았나}, mistake, step?}
   *   mistake — added (빼야 할 때 더함), sumOnly (더하기만 함), endPiece (전체에서 하나만 뺌, 끝 부분이 나옴),
   *             diffGiven (그림의 두 거리끼리 뺌), addedMid (겹친 부분을 또 더함),
   *             midOnly (가운데에서 멈춤), wrongPair (엉뚱한 두 거리를 뺌), calc (계산 실수), null (그 밖)
   *   step — 차례로 푸는 문제에서 처음 틀린 칸
   */
  function grade(q, value) {
    var ok = {};
    var keys = inputKeys(q);
    keys.forEach(function (k) { ok[k] = value[k] === q.answer[k]; });
    var correct = keys.every(function (k) { return ok[k]; });
    if (correct) return { correct: true, ok: ok, mistake: null };

    var step = keys.filter(function (k) { return !ok[k]; })[0];
    var v = value[step];
    var exp = q.answer[step];
    var t = span(q, q.text);
    var mistake = null;

    if (q.kind === 'part') {
      var d = span(q, q.drawn[0]);
      if (v === t + d) mistake = 'added';
    } else if (q.kind === 'overlap' || q.kind === 'oguided') {
      var a = span(q, q.drawn[0]);
      var b = span(q, q.drawn[1]);
      if (step === 'sum') {
        if (v === Math.abs(a - b)) mistake = 'diffGiven';
      } else if (q.ask[0] === 0) {
        // 전체를 묻는 경우
        if (v === a + b) mistake = 'sumOnly';
        else if (v === a + b + t) mistake = 'addedMid';
        else if (v === a - t || v === b - t) mistake = 'endPiece';
      } else if (v === a + b) mistake = 'sumOnly';
      else if (v === t - a || v === t - b) mistake = 'endPiece';
      else if (v === Math.abs(a - b)) mistake = 'diffGiven';
      else if (v === a + b + t) mistake = 'added';
    } else {
      var cp = chainParts(q);
      var w = span(q, cp.whole);
      var p = span(q, cp.piece);
      var mid = span(q, q.mid);
      if (step === 'mid') {
        if (v === t + p) mistake = 'added';
        else if (v === Math.abs(t - w)) mistake = 'wrongPair';
      } else if (q.kind === 'chain' && v === mid) mistake = 'midOnly';
      else if (v === Math.abs(w - p) || v === Math.abs(t - w)) mistake = 'wrongPair';
      else if (v === w + mid || v === t + p) mistake = 'added';
    }
    if (!mistake && isSlip(v, exp)) mistake = 'calc';
    return { correct: false, ok: ok, mistake: mistake, step: step };
  }

  return {
    KINDS: KINDS,
    POINTS: P,
    mulberry32: mulberry32,
    span: span,
    name: name,
    longName: longName,
    generate: generate,
    worksheetOverlap: worksheetOverlap,
    worksheetChain: worksheetChain,
    questionText: questionText,
    marks: marks,
    lines: lines,
    inputKeys: inputKeys,
    chainParts: chainParts,
    solutionLines: solutionLines,
    parseNum: parseNum,
    grade: grade
  };
});
