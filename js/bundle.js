/**
 * bundle.js
 *
 * 두 묶음 비교의 계산 부분 — 문제 만들기, 채점, 풀이 글. DOM 은 건드리지 않는다.
 *
 * 학습지 12: 「똑같은 공책 4권과 똑같은 필통 2개의 무게는 1280 g이고, 공책 2권과 필통 2개의 무게는 780 g입니다.
 *   공책 한 권의 무게는 몇 g일까요?」
 *   필통 2개는 두 묶음에 똑같이 있으니 빼면 공책 2권 = 1280 − 780 = 500 g, 공책 한 권 = 500의 반 = 250 g
 *   (중등의 연립방정식 4x + 2y = 1280, 2x + 2y = 780 을 3학년은 「같은 것 빼기」로 푼다.)
 *
 * 문제: p·A + r·B = W1, s·A + r·B = W2 (p > s). 묻는 것은 A 한 개 또는 B 한 개.
 * 브라우저에서는 window.Bundle, Node 에서는 module.exports 로 노출된다.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.Bundle = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // one: 한 개 차이, guided: 두 개 차이 차례로, two: 두 개 차이 (학습지), other: 다른 물건 한 개
  var KINDS = ['one', 'guided', 'two', 'other'];

  /** 장면. what 은 「무게」·「값」, unit 은 수 뒤에 붙는 말 */
  var SCENES = [
    { a: '공책', ac: '권', b: '필통', bc: '개', ae: '📓', be: '👝', what: '무게', unit: ' g', lo: 100, hi: 400 },
    { a: '사과', ac: '개', b: '배', bc: '개', ae: '🍎', be: '🍐', what: '무게', unit: ' g', lo: 150, hi: 450 },
    { a: '동화책', ac: '권', b: '필통', bc: '개', ae: '📕', be: '👝', what: '무게', unit: ' g', lo: 150, hi: 450 },
    { a: '연필', ac: '자루', b: '지우개', bc: '개', ae: '✏️', be: '🧽', what: '값', unit: '원', lo: 200, hi: 900 },
    { a: '컵케이크', ac: '개', b: '우유', bc: '팩', ae: '🧁', be: '🥛', what: '값', unit: '원', lo: 300, hi: 950 }
  ];

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

  function hasBatchim(word) {
    var c = String(word).charCodeAt(String(word).length - 1);
    if (c >= 0xAC00 && c <= 0xD7A3) return (c - 0xAC00) % 28 !== 0;
    return '013678'.indexOf(String(word).slice(-1)) >= 0;
  }

  /** 조사: J('공책', '과와') → '공책과' */
  function J(word, pair) {
    return word + (hasBatchim(word) ? pair.charAt(0) : pair.charAt(1));
  }

  /** 한 권 / 한 개 / 한 자루 */
  function one(count) { return '한 ' + count; }

  /** '250 + 250 = 500' (k 가 1 이면 '250') */
  function repeatText(v, k) {
    var parts = [];
    for (var i = 0; i < k; i++) parts.push(v);
    return k === 1 ? String(v) : parts.join(' + ') + ' = ' + v * k;
  }

  /** 반으로 나누기: 자리마다. 576 → '500의 반은 250, 70의 반은 35, 6의 반은 3 → 250 + 35 + 3 = 288' */
  function halfText(n) {
    var parts = [Math.floor(n / 100) * 100, Math.floor(n / 10) % 10 * 10, n % 10].filter(function (p) { return p > 0; });
    var head = parts.map(function (p) { return p + '의 반은 ' + p / 2; }).join(', ');
    return parts.length > 1 ? head + ' → ' + parts.map(function (p) { return p / 2; }).join(' + ') + ' = ' + n / 2 : head;
  }

  // ------------------------------------------------------------------ 문제

  function make(kind, scene, A, B, p, s, r, ask) {
    var q = { kind: kind, scene: scene, A: A, B: B, p: p, s: s, r: r, ask: ask };
    q.W1 = p * A + r * B;
    q.W2 = s * A + r * B;
    q.d = q.W1 - q.W2;                 // (p − s) 개의 A
    q.k = p - s;
    q.ans = ask === 'a' ? A : B;
    q.answer = { ans: q.ans };
    if (kind === 'guided') q.answer.d = q.d;
    return q;
  }

  function generate(kind, rng) {
    rng = rng || Math.random;
    for (;;) {
      var scene = SCENES[Math.floor(rng() * SCENES.length)];
      var k = kind === 'one' ? 1 : kind === 'other' ? randInt(rng, 1, 2) : 2;
      var s = randInt(rng, 1, 3);
      var p = s + k;
      var r = kind === 'other' ? randInt(rng, 1, 2) : randInt(rng, 1, 3);
      var step = rng() < 0.6 ? 10 : 5;
      var A = Math.round(randInt(rng, scene.lo, scene.hi) / step) * step;
      var B = Math.round(randInt(rng, scene.lo / 2, scene.hi) / step) * step;
      if (A === B) continue;
      var q = make(kind, scene, A, B, p, s, r, kind === 'other' ? 'b' : 'a');
      if (q.W1 > 2500) continue;
      return q;
    }
  }

  function worksheet() { return make('two', SCENES[0], 250, 140, 4, 2, 2, 'a'); }

  // ------------------------------------------------------------------ 글

  function questionText(q) {
    var sc = q.scene;
    var first = '똑같은 ' + sc.a + ' ' + J(q.p + sc.ac, '과와') + ' 똑같은 ' + sc.b + ' ' + q.r + sc.bc;
    var second = sc.a + ' ' + J(q.s + sc.ac, '과와') + ' ' + sc.b + ' ' + q.r + sc.bc;
    var item = q.ask === 'a' ? sc.a + ' ' + one(sc.ac) : sc.b + ' ' + one(sc.bc);
    var tail = sc.what === '값' ? item + '의 값은 얼마일까요?' : item + '의 무게는 몇 g일까요?';
    return first + '의 ' + J(sc.what, '은는') + ' ' + q.W1 + sc.unit + '이고, ' + second + '의 ' + J(sc.what, '은는') + ' ' +
      q.W2 + sc.unit + '입니다. ' + tail;
  }

  /** 빈칸 줄. 글자는 문자열, 빈칸은 {input, unit} */
  function lines(q) {
    var sc = q.scene;
    var u = sc.unit.trim();
    if (q.kind === 'guided') {
      return [
        ['두 묶음에 똑같이 있는 ' + sc.b + ' ' + J(q.r + sc.bc, '을를') + ' 빼면 ' + sc.a + '만 남아요'],
        [sc.a + ' ' + q.k + sc.ac + ' = ' + q.W1 + ' − ' + q.W2 + ' = ', { input: 'd', unit: u }],
        [sc.a + ' ' + one(sc.ac) + ' = ', { input: 'ans', unit: u }]
      ];
    }
    var item = q.ask === 'a' ? sc.a + ' ' + one(sc.ac) : sc.b + ' ' + one(sc.bc);
    return [[item + ': ', { input: 'ans', unit: u }]];
  }

  function inputKeys(q) {
    return [].concat.apply([], lines(q)).filter(function (t) { return typeof t !== 'string'; }).map(function (t) { return t.input; });
  }

  /** 풀이 줄. 마지막 줄 끝은 「→ 답 + 단위」 */
  function solutionLines(q) {
    var sc = q.scene;
    var U = sc.unit;
    var out = [
      sc.a + ' ' + q.p + sc.ac + ' + ' + sc.b + ' ' + q.r + sc.bc + ' = ' + q.W1 + U,
      sc.a + ' ' + q.s + sc.ac + ' + ' + sc.b + ' ' + q.r + sc.bc + ' = ' + q.W2 + U,
      sc.b + ' ' + J(q.r + sc.bc, '은는') + ' 똑같으니 빼면: ' + sc.a + ' ' + q.k + sc.ac + ' = ' + q.W1 + ' − ' + q.W2 + ' = ' + q.d + U
    ];
    out.push(sc.a + ' ' + one(sc.ac) + ': ' + (q.k === 2 ? halfText(q.d) : String(q.A)) + U);
    if (q.ask === 'b') {
      var sA = q.s * q.A;
      var rB = q.r * q.B;
      out.push(sc.a + ' ' + q.s + sc.ac + ' = ' + repeatText(q.A, q.s) + U + '이니 ' + sc.b + ' ' + q.r + sc.bc + ' = ' +
        q.W2 + ' − ' + sA + ' = ' + rB + U);
      out.push(sc.b + ' ' + one(sc.bc) + ': ' + (q.r === 2 ? halfText(rB) : String(q.B)) + U);
    }
    return out;
  }

  // ------------------------------------------------------------------ 채점

  function parseNum(text) {
    var s = String(text == null ? '' : text)
      .replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
      .replace(/[\s,]+/g, '')
      .replace(/(g|원)$/, '');
    if (!s) return { error: 'empty' };
    if (!/^\d{1,5}$/.test(s)) return { error: 'format' };
    return { value: Number(s) };
  }

  function isSlip(v, expected) {
    return [1, 9, 10, 11, 90, 99, 100, 110].indexOf(Math.abs(v - expected)) >= 0;
  }

  /**
   * 채점. value 는 빈칸 키 → 수.
   * 돌려주는 값: {correct, ok, mistake, step}
   *   notHalved (여러 개의 무게를 그대로 — 공책 2권 500), gaveOther (묻지 않은 물건 한 개),
   *   added (두 무게를 더함), perBundle (한 묶음 무게를 물건 수로 나눈 듯한 값은 안 다룸),
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
    if (step === 'd') {
      if (v === q.W1 + q.W2) mistake = 'added';
    } else {
      if (q.ask === 'a' && q.k > 1 && v === q.d) mistake = 'notHalved';
      else if (q.ask === 'b' && q.r > 1 && v === q.r * q.B) mistake = 'notHalved';
      else if (v === (q.ask === 'a' ? q.B : q.A)) mistake = 'gaveOther';
      else if (q.ask === 'b' && v === q.d) mistake = 'stoppedAtA';
      else if (v === q.W1 + q.W2) mistake = 'added';
    }
    if (!mistake && isSlip(v, q.answer[step])) mistake = 'calc';
    return { correct: false, ok: ok, mistake: mistake, step: step };
  }

  return {
    KINDS: KINDS,
    SCENES: SCENES,
    J: J,
    mulberry32: mulberry32,
    halfText: halfText,
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
