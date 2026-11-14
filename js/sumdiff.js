/**
 * sumdiff.js
 *
 * 합과 차로 두 수 구하기의 계산 부분 — 문제 만들기, 채점, 풀이 식. DOM 은 건드리지 않는다.
 *
 * 학습지: 「어느 마을의 인구는 581명이고, 남자가 여자보다 183명 더 많습니다.」
 *   □(큰 수) = △(작은 수) + 183,  △ + 183 + △ = 581
 *   △ + △ = 581 − 183 = 398,  △ = 199,  □ = 199 + 183 = 382
 *
 * 문제 하나는 {kind, total, diff, big, small, ...} 이고, 화면에 그릴 식은 lines 로 준다.
 * lines 는 줄의 배열, 줄은 조각의 배열이다 — 글자 조각은 문자열, 빈칸은 {input: 키, unit?}.
 *
 * 세 사람 문제도 다룬다 (학습지 다음 문제):
 *   「예린, 준서, 현빈 세 사람이 모은 우표는 모두 915장. 준서는 예린이보다 145장 더, 현빈이는 준서의 2배.」
 *   △(예린) + (△ + 145) + (△ + 145) + (△ + 145) = 915 → △ 네 개 = 915 − 435 = 480 → △ = 120,
 *   □(준서) = 265, ○(현빈) = 530
 *
 * 브라우저에서는 window.SumDiff, Node 에서는 module.exports 로 노출된다.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.SumDiff = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var KINDS = ['remove', 'half', 'guided', 'story', 'tguided', 'tstory'];
  var THREE_KINDS = ['tguided', 'tstory'];
  var CIRCLE = '○';
  var BIG = '□';
  var SMALL = '△';
  var MINUS = '−';

  /**
   * 서술 문제의 장면. a·b 가 두 무리이고, 답은 이 순서대로 쓴다. 어느 쪽이 더 큰지는 문제마다 정한다.
   * intro 뒤에 「581명이고,」 가 붙고, ask 는 마지막 물음이다.
   */
  var SCENES = [
    { intro: '어느 마을의 인구는', a: '남자', b: '여자', unit: '명', ask: '이 마을의 남자와 여자는 각각 몇 명인지 구해 보세요.' },
    { intro: '어느 학교의 학생은 모두', a: '남학생', b: '여학생', unit: '명', ask: '이 학교의 남학생과 여학생은 각각 몇 명인지 구해 보세요.' },
    { intro: '형과 동생이 가진 구슬은 모두', a: '형', b: '동생', unit: '개', ask: '형과 동생이 가진 구슬은 각각 몇 개인지 구해 보세요.' },
    { intro: '과수원에서 딴 사과와 배는 모두', a: '사과', b: '배', unit: '개', ask: '딴 사과와 배는 각각 몇 개인지 구해 보세요.' },
    { intro: '빨간 색종이와 파란 색종이는 모두', a: '빨간 색종이', b: '파란 색종이', unit: '장', ask: '빨간 색종이와 파란 색종이는 각각 몇 장인지 구해 보세요.' },
    { intro: '도서관에 있는 동화책과 위인전은 모두', a: '동화책', b: '위인전', unit: '권', ask: '동화책과 위인전은 각각 몇 권인지 구해 보세요.' },
    { intro: '지우와 민준이가 한 줄넘기는 모두', a: '지우', b: '민준이', unit: '번', ask: '지우와 민준이는 줄넘기를 각각 몇 번 했는지 구해 보세요.' }
  ];

  // ------------------------------------------------------------------ 난수

  /** 시드를 주면 같은 문제가 나오는 난수. 테스트용. */
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

  // ------------------------------------------------------------------ 세로셈 실수

  function digits(n, len) {
    var s = String(n);
    while (s.length < len) s = '0' + s;
    return s.split('').map(Number);
  }

  /** 자리마다 큰 수에서 작은 수를 뺀다 (받아내림 없이 거꾸로). 581 − 183 → 402 */
  function swapColumns(a, b) {
    var len = String(a).length;
    var da = digits(a, len);
    var db = digits(b, len);
    return Number(da.map(function (x, i) { return Math.abs(x - db[i]); }).join(''));
  }

  /** 받아내림은 했는데 윗자리를 1 줄이지 않는다. 581 − 183 → 408 */
  function noReduce(a, b) {
    var len = String(a).length;
    var da = digits(a, len);
    var db = digits(b, len);
    return Number(da.map(function (x, i) { return x < db[i] ? x + 10 - db[i] : x - db[i]; }).join(''));
  }

  /** a − b 에서 받아내림이 생기는가 */
  function needsBorrow(a, b) {
    var len = String(a).length;
    var da = digits(a, len);
    var db = digits(b, len);
    return da.some(function (x, i) { return x < db[i]; });
  }

  /** 뺄셈 a − b 의 오답을 알아본다. 모르는 오답이면 null. */
  function subMistake(a, b, value) {
    if (value === a - b) return null;
    if (value === a + b) return 'added';
    if (value === a) return 'noSub';
    if (value === noReduce(a, b)) return 'noReduce';
    if (value === swapColumns(a, b)) return 'swapColumns';
    return null;
  }

  // ------------------------------------------------------------------ 반으로

  /**
   * 짝수 n 을 자리마다 반으로 나눈다. 398 → 300의 반 150, 90의 반 45, 8의 반 4 → 199.
   * 0 인 자리는 뺀다. {parts: [[300, 150], [90, 45], [8, 4]], half: 199}
   */
  function halfSteps(n) {
    var parts = [];
    var place = 1;
    var rest = n;
    while (rest > 0) {
      var d = rest % 10;
      if (d) parts.unshift([d * place, d * place / 2]);
      rest = Math.floor(rest / 10);
      place *= 10;
    }
    return { parts: parts, half: n / 2 };
  }

  function halfLine(n) {
    var s = halfSteps(n);
    if (s.parts.length < 2) return n + '의 반은 ' + s.half;
    return s.parts.map(function (p) { return p[0] + '의 반은 ' + p[1]; }).join(', ') +
      ' → ' + s.parts.map(function (p) { return p[1]; }).join(' + ') + ' = ' + s.half;
  }

  // ------------------------------------------------------------------ 조사

  /** 마지막 글자에 받침이 있는가. 숫자로 끝나면 읽는 소리로 — 1(일)·3(삼)·0(영·십…)은 받침. */
  function hasBatchim(word) {
    var ch = String(word).trim().slice(-1);
    if (/\d/.test(ch)) return '0136781'.indexOf(ch) >= 0;
    var code = ch.charCodeAt(0) - 0xAC00;
    if (code < 0 || code > 11171) return false;
    return code % 28 !== 0;
  }

  /** josa('남자', '이가') → '남자가', josa('동화책', '과와') → '동화책과' */
  function josa(word, pair) {
    return word + (hasBatchim(word) ? pair.charAt(0) : pair.charAt(1));
  }

  // ------------------------------------------------------------------ 문제

  /**
   * 두 수를 정한다. 작은 수 40~449, 차 12~399, 합은 세 자리(150~999).
   * remove·half 는 받아내림이 있는 뺄셈을 더 자주 낸다 — 학습지에서 아이가 틀린 곳이다.
   */
  function pickNumbers(rng, wantBorrow) {
    for (var tries = 0; tries < 200; tries++) {
      var small = randInt(rng, 40, 449);
      var diff = randInt(rng, 12, 399);
      var total = small * 2 + diff;
      if (total < 150 || total > 999) continue;
      if (wantBorrow && !needsBorrow(total, diff)) continue;
      return { small: small, diff: diff, big: small + diff, total: total };
    }
    return { small: 199, diff: 183, big: 382, total: 581 };
  }

  function sceneFor(rng) {
    var scene = SCENES[Math.floor(rng() * SCENES.length)];
    return {
      scene: scene,
      bigIsA: rng() < 0.6,     // 학습지처럼 앞에 나온 쪽이 더 많은 경우를 조금 더 자주
      fewer: rng() < 0.3       // 「더 적습니다」 로 묻기
    };
  }

  /** kind 에 맞는 문제 하나 */
  function generate(kind, rng) {
    rng = rng || Math.random;
    if (THREE_KINDS.indexOf(kind) >= 0) return generateThree(kind, rng);
    var n = pickNumbers(rng, (kind === 'remove' || kind === 'guided') && rng() < 0.75);
    var q = { kind: kind, total: n.total, diff: n.diff, big: n.big, small: n.small };
    if (kind === 'story' || kind === 'guided') {
      var s = sceneFor(rng);
      q.scene = s.scene;
      q.bigIsA = s.bigIsA;
      q.fewer = s.fewer;
    }
    q.answer = answerOf(q);
    q.lines = linesOf(q);
    return q;
  }

  /** 학습지 문제 그대로 */
  function worksheet() {
    var q = {
      kind: 'story', total: 581, diff: 183, big: 382, small: 199,
      scene: SCENES[0], bigIsA: true, fewer: false
    };
    q.answer = answerOf(q);
    q.lines = linesOf(q);
    return q;
  }

  function answerOf(q) {
    switch (q.kind) {
      case 'remove': return { v: q.total - q.diff };
      case 'half': return { v: q.small };
      case 'guided': return { twice: q.small * 2, small: q.small, big: q.big };
      default: return { a: q.bigIsA ? q.big : q.small, b: q.bigIsA ? q.small : q.big };
    }
  }

  function bigName(q) { return q.bigIsA ? q.scene.a : q.scene.b; }
  function smallName(q) { return q.bigIsA ? q.scene.b : q.scene.a; }

  /** 학습지 문장. 「어느 마을의 인구는 581명이고, 남자가 여자보다 183명 더 많습니다. …」 */
  function storyText(q) {
    if (q.three) return threeStoryText(q);
    var s = q.scene;
    var rel = q.fewer
      ? josa(smallName(q), '이가') + ' ' + bigName(q) + '보다 ' + q.diff + s.unit + ' 더 적습니다.'
      : josa(bigName(q), '이가') + ' ' + smallName(q) + '보다 ' + q.diff + s.unit + ' 더 많습니다.';
    return s.intro + ' ' + q.total + s.unit + '이고, ' + rel + ' ' + s.ask;
  }

  function linesOf(q) {
    var T = q.total;
    var D = q.diff;
    switch (q.kind) {
      case 'remove':
        return [
          [SMALL + ' + ' + SMALL + ' + ' + D + ' = ' + T],
          [SMALL + ' + ' + SMALL + ' = ', { input: 'v' }]
        ];
      case 'half':
        return [
          [SMALL + ' + ' + SMALL + ' = ' + q.small * 2],
          [SMALL + ' = ', { input: 'v' }]
        ];
      case 'guided':
        return [
          [BIG + ' = ' + bigName(q) + ' 수,  ' + SMALL + ' = ' + smallName(q) + ' 수'],
          [BIG + ' = ' + SMALL + ' + ' + D],
          [SMALL + ' + ' + D + ' + ' + SMALL + ' = ' + T],
          [SMALL + ' + ' + SMALL + ' = ' + T + ' ' + MINUS + ' ' + D + ' = ', { input: 'twice' }],
          [SMALL + ' = ', { input: 'small' }],
          [BIG + ' = ' + SMALL + ' + ' + D + ' = ', { input: 'big' }]
        ];
      default:
        return [
          [q.scene.a + ': ', { input: 'a', unit: q.scene.unit }],
          [q.scene.b + ': ', { input: 'b', unit: q.scene.unit }]
        ];
    }
  }

  /** 문제의 빈칸 키를 차례대로 */
  function inputKeys(q) {
    var keys = [];
    q.lines.forEach(function (line) {
      line.forEach(function (t) { if (typeof t !== 'string') keys.push(t.input); });
    });
    return keys;
  }


  // ------------------------------------------------------------------ 세 사람

  var PERSON_KEYS = ['a', 'b', 'c'];
  var PERSON_SYMBOL = { a: SMALL, b: BIG, c: CIRCLE };
  var THREE_NAMES = ['예린', '준서', '현빈', '지우', '민준', '서연', '하준', '수아', '도윤', '은우'];
  var THREE_ITEMS = [
    { name: '우표', unit: '장' },
    { name: '딱지', unit: '장' },
    { name: '스티커', unit: '장' },
    { name: '구슬', unit: '개' },
    { name: '칭찬 도장', unit: '개' }
  ];

  /** 받침이 있는 이름에는 「이」 를 붙여 부른다. 예린 → 예린이, 준서 → 준서 */
  function callName(n) {
    return hasBatchim(n) ? n + '이' : n;
  }

  /**
   * △ 40~199, 차 11~199, 합 = △ × 4 + 차 × 3 은 200~999.
   * 학습지처럼 □ = △ + 차, ○ = □ × 2.
   */
  function generateThree(kind, rng) {
    var a, d, total;
    for (var tries = 0; tries < 200; tries++) {
      a = randInt(rng, 40, 199);
      d = randInt(rng, 11, 199);
      total = a * 4 + d * 3;
      if (total >= 200 && total <= 999) break;
    }
    if (total < 200 || total > 999) { a = 120; d = 145; total = 915; }
    var pool = THREE_NAMES.slice();
    var names = [];
    for (var i = 0; i < 3; i++) names.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
    var r = rng();
    var q = {
      kind: kind, three: true, a: a, d: d, b: a + d, c: (a + d) * 2, total: total,
      names: names,
      item: THREE_ITEMS[Math.floor(rng() * THREE_ITEMS.length)],
      ask: r < 0.6 ? 'c' : r < 0.8 ? 'b' : 'a'       // 학습지처럼 ○ 를 묻는 경우를 더 자주
    };
    finishThree(q);
    return q;
  }

  function finishThree(q) {
    q.answer = q.kind === 'tguided'
      ? { four: q.a * 4, two: q.a * 2, a: q.a, b: q.b, c: q.c }
      : { v: q[q.ask] };
    q.lines = threeLines(q);
  }

  /** 학습지 문제 그대로 (세 사람) */
  function worksheetThree() {
    var q = {
      kind: 'tstory', three: true, a: 120, d: 145, b: 265, c: 530, total: 915,
      names: ['예린', '준서', '현빈'], item: THREE_ITEMS[0], ask: 'c'
    };
    finishThree(q);
    return q;
  }

  function threeStoryText(q) {
    var n = q.names;
    var u = q.item.unit;
    var asked = callName(n[PERSON_KEYS.indexOf(q.ask)]);
    return n.join(', ') + ' 세 사람이 모은 ' + josa(q.item.name, '은는') + ' 모두 ' + q.total + u + '입니다. ' +
      josa(callName(n[1]), '은는') + ' ' + callName(n[0]) + '보다 ' + josa(q.d + u, '을를') + ' 더 모았고, ' +
      josa(callName(n[2]), '은는') + ' ' + callName(n[1]) + '의 2배만큼을 모았습니다. ' +
      josa(asked, '이가') + ' 모은 ' + josa(q.item.name, '은는') + ' 몇 ' + u + '일까요?';
  }

  function symbolNote(q) {
    return PERSON_KEYS.map(function (k, i) { return PERSON_SYMBOL[k] + ' = ' + q.names[i]; }).join(',  ');
  }

  function threeLines(q) {
    var D = q.d;
    var T = q.total;
    var unit = SMALL + ' + ' + D;
    if (q.kind === 'tstory') {
      var i = PERSON_KEYS.indexOf(q.ask);
      return [[q.names[i] + ': ', { input: 'v', unit: q.item.unit }]];
    }
    return [
      [symbolNote(q)],
      [BIG + ' = ' + unit + ',  ' + CIRCLE + ' = ' + BIG + ' × 2 = ' + BIG + ' + ' + BIG],
      [SMALL + ' + (' + unit + ') + (' + unit + ') + (' + unit + ') = ' + T],
      [SMALL + ' + ' + SMALL + ' + ' + SMALL + ' + ' + SMALL + ' = ' + T + ' ' + MINUS + ' ' + D + ' ' + MINUS + ' ' + D + ' ' + MINUS + ' ' + D + ' = ', { input: 'four' }],
      [SMALL + ' + ' + SMALL + ' = ', { input: 'two' }],
      [SMALL + ' = ', { input: 'a' }],
      [BIG + ' = ' + unit + ' = ', { input: 'b' }],
      [CIRCLE + ' = ' + BIG + ' × 2 = ', { input: 'c' }]
    ];
  }

  /**
   * 세 사람 채점.
   *   tguided — 처음 틀린 칸이 step. four: subOnce·subTwice(차를 덜 뺌)·뺄셈 실수,
   *             two·a: notHalved·halfWrong, b: bigSame·bigSub·bigWrong, c: cPlus2·cFromA·cWrong
   *   tstory  — wrongPerson(다른 사람의 수) · sumCheck
   */
  function gradeThree(q, value) {
    var ok = {};
    var correct = true;
    Object.keys(q.answer).forEach(function (k) {
      ok[k] = value[k] === q.answer[k];
      if (!ok[k]) correct = false;
    });
    var res = { correct: correct, ok: ok, mistake: null };
    if (correct) return res;
    if (q.kind === 'tstory') {
      var other = PERSON_KEYS.filter(function (k) { return k !== q.ask && q[k] === value.v; })[0];
      res.mistake = other ? 'wrongPerson' : 'sumCheck';
      if (other) res.other = other;
      return res;
    }
    var T = q.total;
    var D = q.d;
    if (!ok.four) {
      res.step = 'four';
      res.mistake = value.four === T - D ? 'subOnce'
        : value.four === T - D * 2 ? 'subTwice'
          : subMistake(T, D * 3, value.four);
    } else if (!ok.two) {
      res.step = 'two';
      res.mistake = halfMistake(q.a * 4, value.two);
    } else if (!ok.a) {
      res.step = 'a';
      res.mistake = halfMistake(q.a * 2, value.a);
    } else if (!ok.b) {
      res.step = 'b';
      res.mistake = value.b === q.a ? 'bigSame' : value.b === q.a - D ? 'bigSub' : 'bigWrong';
    } else {
      res.step = 'c';
      res.mistake = value.c === q.b + 2 ? 'cPlus2' : value.c === q.a * 2 ? 'cFromA' : 'cWrong';
    }
    return res;
  }

  function threeSolutionLines(q) {
    var D = q.d;
    var T = q.total;
    var unit = SMALL + ' + ' + D;
    var last = q.names[2];
    return [
      symbolNote(q) + (hasBatchim(last) ? '이' : '') + '라고 하면',
      BIG + ' = ' + unit + ',  ' + CIRCLE + ' = ' + BIG + ' × 2 = (' + unit + ') + (' + unit + ')',
      SMALL + ' + (' + unit + ') + (' + unit + ') + (' + unit + ') = ' + T,
      SMALL + ' 네 개 = ' + T + ' ' + MINUS + ' ' + D * 3 + ' = ' + q.a * 4 + '  (' + D + ' + ' + D + ' + ' + D + ' = ' + D * 3 + ')',
      SMALL + ' + ' + SMALL + ' = ' + q.a * 2 + '  (' + q.a * 4 + '의 반),  ' + SMALL + ' = ' + q.a + '  (' + q.a * 2 + '의 반)',
      BIG + ' = ' + q.a + ' + ' + D + ' = ' + q.b,
      CIRCLE + ' = ' + q.b + ' × 2 = ' + q.b + ' + ' + q.b + ' = ' + q.c,
      '확인: ' + q.a + ' + ' + q.b + ' + ' + q.c + ' = ' + T
    ];
  }

  // ------------------------------------------------------------------ 테이프 그림

  /**
   * 테이프 그림의 줄. [{label, value, segs: [{kind: 'unit'|'diff', v}]}]
   * 두 수: 큰 수 = 작은 수 + 차. 세 사람: △ / △ + 차 / (△ + 차) × 2.
   */
  function tapeRows(q) {
    if (q.three) {
      var u = { kind: 'unit', v: q.a };
      var df = { kind: 'diff', v: q.d };
      return [
        { label: q.names[0] + ' (' + SMALL + ')', value: q.a, segs: [u] },
        { label: q.names[1] + ' (' + BIG + ')', value: q.b, segs: [u, df] },
        { label: q.names[2] + ' (' + CIRCLE + ')', value: q.c, segs: [u, df, u, df] }
      ];
    }
    var big = q.scene ? bigName(q) + ' (' + BIG + ')' : BIG;
    var small = q.scene ? smallName(q) + ' (' + SMALL + ')' : SMALL;
    return [
      { label: big, value: q.big, segs: [{ kind: 'unit', v: q.small }, { kind: 'diff', v: q.diff }] },
      { label: small, value: q.small, segs: [{ kind: 'unit', v: q.small }] }
    ];
  }

  // ------------------------------------------------------------------ 입력·채점

  /** '199', '１９９', '199명' 을 읽는다. 빈칸이면 {error: 'empty'}, 숫자가 아니면 {error: 'format'}. */
  function parseNum(text) {
    var s = String(text == null ? '' : text)
      .replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
      .replace(/[\s,]+/g, '')
      .replace(/(명|개|장|권|번)$/, '');
    if (!s) return { error: 'empty' };
    if (!/^\d{1,4}$/.test(s)) return { error: 'format' };
    return { value: Number(s) };
  }

  /**
   * 채점. value 는 빈칸 키 → 수.
   * 돌려주는 값: {correct, ok: {키: 맞았나}, mistake, step?}
   *   mistake — added·noSub·noReduce·swapColumns (뺄셈), notHalved·halfWrong (반으로),
   *             swapped·forgotHalf·sumOff·diffOff (서술), bigSame·bigSub·bigWrong (큰 수)
   *   step — guided 에서 처음 틀린 칸
   */
  function grade(q, value) {
    if (q.three) return gradeThree(q, value);
    var ok = {};
    var correct = true;
    Object.keys(q.answer).forEach(function (k) {
      ok[k] = value[k] === q.answer[k];
      if (!ok[k]) correct = false;
    });
    var res = { correct: correct, ok: ok, mistake: null };
    if (correct) return res;

    if (q.kind === 'remove') {
      res.mistake = subMistake(q.total, q.diff, value.v);
    } else if (q.kind === 'half') {
      res.mistake = halfMistake(q.small * 2, value.v);
    } else if (q.kind === 'guided') {
      if (!ok.twice) {
        res.step = 'twice';
        res.mistake = subMistake(q.total, q.diff, value.twice);
      } else if (!ok.small) {
        res.step = 'small';
        res.mistake = halfMistake(q.small * 2, value.small);
      } else {
        res.step = 'big';
        res.mistake = value.big === value.small ? 'bigSame'
          : value.big === value.small - q.diff ? 'bigSub' : 'bigWrong';
      }
    } else {
      res.mistake = storyMistake(q, value);
    }
    return res;
  }

  function halfMistake(n, v) {
    return v === n ? 'notHalved' : 'halfWrong';
  }

  function storyMistake(q, value) {
    var want = q.answer;
    if (value.a === want.b && value.b === want.a) return 'swapped';
    var removed = q.total - q.diff;
    if (value.a === removed || value.b === removed) return 'forgotHalf';
    if (value.a + value.b !== q.total) return 'sumOff';
    return 'diffOff';
  }

  // ------------------------------------------------------------------ 풀이

  /**
   * 풀이 식. 학습지의 흐름 그대로 — 큰 수를 □, 작은 수를 △ 로 두고.
   * 서술 문제가 아니면 이름 없이 □·△ 만 쓴다.
   */
  function solutionLines(q) {
    if (q.three) return threeSolutionLines(q);
    var T = q.total;
    var D = q.diff;
    var R = T - D;
    if (q.kind === 'remove') {
      return [
        '양쪽에서 ' + josa(String(D), '을를') + ' 빼요: ' + SMALL + ' + ' + SMALL + ' = ' + T + ' ' + MINUS + ' ' + D + ' = ' + R
      ];
    }
    if (q.kind === 'half') {
      return [
        halfLine(R) + ',  ' + SMALL + ' = ' + q.small,
        '확인: ' + q.small + ' + ' + q.small + ' = ' + R
      ];
    }
    return [
      BIG + ' = ' + bigName(q) + ' 수,  ' + SMALL + ' = ' + smallName(q) + ' 수라고 하면',
      BIG + ' = ' + SMALL + ' + ' + D,
      SMALL + ' + ' + D + ' + ' + SMALL + ' = ' + T,
      SMALL + ' + ' + SMALL + ' = ' + T + ' ' + MINUS + ' ' + D + ' = ' + R,
      SMALL + ' = ' + q.small + '  (' + halfLine(R) + ')',
      BIG + ' = ' + q.small + ' + ' + D + ' = ' + q.big,
      '확인: ' + q.big + ' + ' + q.small + ' = ' + T + ',  ' + q.big + ' ' + MINUS + ' ' + q.small + ' = ' + D
    ];
  }

  /** 서술 문제의 답 한 줄. 「남자: 382명, 여자: 199명」 */
  function answerText(q) {
    if (q.three) {
      return q.names.map(function (n, i) { return n + ' ' + q[PERSON_KEYS[i]] + q.item.unit; }).join(', ');
    }
    var u = q.scene.unit;
    return q.scene.a + ': ' + q.answer.a + u + ', ' + q.scene.b + ': ' + q.answer.b + u;
  }

  return {
    KINDS: KINDS,
    THREE_KINDS: THREE_KINDS,
    CIRCLE: CIRCLE,
    worksheetThree: worksheetThree,
    callName: callName,
    tapeRows: tapeRows,
    SCENES: SCENES,
    BIG: BIG,
    SMALL: SMALL,
    mulberry32: mulberry32,
    swapColumns: swapColumns,
    noReduce: noReduce,
    needsBorrow: needsBorrow,
    subMistake: subMistake,
    halfSteps: halfSteps,
    halfLine: halfLine,
    josa: josa,
    generate: generate,
    worksheet: worksheet,
    storyText: storyText,
    bigName: bigName,
    smallName: smallName,
    inputKeys: inputKeys,
    parseNum: parseNum,
    grade: grade,
    solutionLines: solutionLines,
    answerText: answerText
  };
});
