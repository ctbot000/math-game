/* duration.js 검증. test.html 에서 실행되고, node js/duration.test.js 로도 돌릴 수 있다. */
(function (global) {
  'use strict';

  var D = global.Duration || require('./duration.js');
  var results = [];

  function eq(actual, expected, label) {
    var a = String(actual);
    var e = String(expected);
    results.push({ pass: a === e, label: label, actual: a, expected: e });
  }

  /** n건을 검사해 한 줄로 남긴다. check 는 문제가 없으면 null, 있으면 설명을 돌려준다. */
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

  function j(d) { return JSON.stringify(d); }

  // ---- 수 -------------------------------------------------------------
  // 학습지: 115분 동안 그림, 1시간 3분 46초 동안 산책 → 산책을 51분 14초 더 짧게
  var drawing = { m: 115 };
  var walk = { h: 1, m: 3, s: 46 };
  eq(D.toSec(drawing), 6900, '115분 = 6900초');
  eq(D.toSec(walk), 3826, '1시간 3분 46초 = 3826초');
  eq(j(D.split(6900, ['h', 'm'])), '{"h":1,"m":55}', '115분 = 1시간 55분');
  eq(j(D.split(3826, ['m', 's'])), '{"m":63,"s":46}', '1시간 3분 46초 = 63분 46초');
  eq(j(D.split(6900 - 3826, ['m', 's'])), '{"m":51,"s":14}', '학습지 답 51분 14초');
  eq(j(D.split(3826, ['s', 'h', 'm'])), '{"h":1,"m":3,"s":46}', 'split 은 단위 순서와 상관없이 큰 단위부터');
  eq(D.format(walk), '1시간 3분 46초', 'format');
  eq(D.format({ h: 1, m: 0, s: 5 }), '1시간 5초', 'format 은 0 인 단위를 뺀다');
  eq(D.format({ m: 0, s: 0 }), '0초', 'format 모두 0');
  eq(D.formatAll({ m: 0, s: 30 }, ['m', 's']), '0분 30초', 'formatAll');
  eq(D.normalized({ m: 50, s: 74 }, ['m', 's']), false, '74초는 올려야 한다');
  eq(D.normalized({ m: 115 }, ['m']), true, '가장 큰 단위는 60 을 넘어도 된다');

  // ---- 100 으로 본 실수 ----------------------------------------------
  eq(j(D.hundredConvert({ m: 115 }, ['h', 'm'])), '{"h":1,"m":15}', '115분 → 1시간 15분 (100 으로 봄)');
  eq(j(D.hundredConvert({ s: 226 }, ['m', 's'])), '{"m":2,"s":26}', '226초 → 2분 26초 (100 으로 봄)');
  eq(j(D.hundredConvert({ h: 1, m: 3 }, ['m'])), '{"m":103}', '1시간 3분 → 103분 (100 으로 봄)');
  eq(j(D.hundredConvert(walk, ['m', 's'])), '{"m":103,"s":46}', '1시간 3분 46초 → 103분 46초 (100 으로 봄)');

  // ---- 세로셈 ---------------------------------------------------------
  var c = D.columnSub(drawing, walk, 60, 60);
  eq(c.m + ':' + c.s + ':' + c.borrowed, '51:14:true', '115분 − 63분 46초 = 51분 14초 (받아내림)');
  var c2 = D.columnSub(walk, drawing, 60, 60);
  eq(c2.m + ':' + c2.s, '51:14', '작은 것을 앞에 줘도 큰 것에서 뺀다');
  var c3 = D.columnSub(drawing, walk, 60, 100);
  eq(c3.m + ':' + c3.s, '51:54', '1분을 100초로 내려 받으면 51분 54초');
  eq(j(D.noBorrow(drawing, walk)), '{"m":52,"s":46}', '받아내림 없이 거꾸로 빼면 52분 46초');
  var c4 = D.columnSub(drawing, walk, 100, 60);
  eq(c4.m + ':' + c4.s, '11:14', '1시간을 100분으로 보면 11분 14초');

  // ---- 풀이 -----------------------------------------------------------
  eq(D.convertLine({ m: 115 }, ['h', 'm']), '115분 = 60분 + 55분 = 1시간 55분', '바꾸는 식: 115분');
  eq(D.convertLine({ m: 150 }, ['h', 'm']), '150분 = 120분 + 30분 = 2시간 30분', '바꾸는 식: 150분');
  eq(D.convertLine({ s: 226 }, ['m', 's']), '226초 = 180초 + 46초 = 3분 46초', '바꾸는 식: 226초');
  eq(D.convertLine(walk, ['m', 's']), '1시간 3분 46초 = 60분 + 3분 + 46초 = 63분 46초', '바꾸는 식: 1시간 3분 46초');
  eq(D.convertLine({ h: 2, m: 15 }, ['m']), '2시간 15분 = 120분 + 15분 = 135분', '바꾸는 식: 2시간 15분');
  eq(D.convertLine({ m: 3, s: 46 }, ['s']), '3분 46초 = 180초 + 46초 = 226초', '바꾸는 식: 3분 46초');
  var st = D.diffSteps([drawing, walk]);
  eq(st.convert.join(' / '), '1시간 3분 46초 = 60분 + 3분 + 46초 = 63분 46초', '차 풀이: 바꾸기');
  eq(st.sub, '115분 0초 − 63분 46초 = 114분 60초 − 63분 46초 = 51분 14초', '차 풀이: 빼기');
  eq(D.diffSteps([{ m: 90 }, { h: 1, m: 2, s: 3 }]).sub, '90분 0초 − 62분 3초 = 89분 60초 − 62분 3초 = 27분 57초',
    '차 풀이: 받아내림');

  // ---- 문제 만들기 ----------------------------------------------------
  D.KINDS.forEach(function (kind) {
    var rng = D.mulberry32(11);
    all(1000, kind + ' 문제 만들기', function () {
      var q = D.generate(kind, rng);
      if (q.kind !== kind) return 'kind ' + q.kind;
      if (kind === 'split' || kind === 'join') {
        if (D.toSec(q.answer) !== D.toSec(q.given)) return '크기가 다르다 ' + j(q);
        if (!D.normalized(q.answer, q.units)) return '정답이 60 을 넘는다 ' + j(q);
        if (D.same(q.answer, D.hundredConvert(q.given, q.units), q.units)) return '100 으로 봐도 맞는 문제 ' + j(q);
        if (kind === 'split' && (q.given.m || q.given.s) % 60 === 0) return '나머지가 없다 ' + j(q);
        return null;
      }
      var a = D.toSec(q.items[0]);
      var b = D.toSec(q.items[1]);
      if (a === b) return '두 시간이 같다';
      if (kind === 'compare') {
        var want = q.ask === 'longer' ? (a > b ? 0 : 1) : (a < b ? 0 : 1);
        return q.answer === want ? null : '고를 쪽이 틀렸다 ' + j(q);
      }
      var d = Math.abs(a - b);
      if (d < 300 || d >= 3600) return '차가 범위 밖 ' + d;
      if (D.toSec(q.diff) !== d || !D.normalized(q.diff, ['m', 's'])) return '차 ' + j(q.diff);
      if (q.items.filter(function (x) { return x.h >= 1 && x.m >= 1 && x.s >= 1; }).length !== 1) return '시간·분·초 쪽이 없다';
      if (kind === 'story') {
        if (q.acts[0] === q.acts[1]) return '같은 활동 두 번';
        var picked = D.toSec(q.items[q.answer.pick]);
        var other = D.toSec(q.items[1 - q.answer.pick]);
        if (q.ask === 'shorter' ? picked > other : picked < other) return '고를 활동이 틀렸다';
      }
      return null;
    });
  });

  // ---- 입력 -----------------------------------------------------------
  eq(D.parseNum('55').value, 55, "parseNum('55')");
  eq(D.parseNum(' 5 5 분').value, 55, "parseNum(' 5 5 분')");
  eq(D.parseNum('４６초').value, 46, 'parseNum 전각 숫자');
  eq(D.parseNum('0').value, 0, "parseNum('0')");
  eq(D.parseNum('').error, 'empty', 'parseNum 빈칸');
  eq(D.parseNum('-3').error, 'format', 'parseNum 음수');

  // ---- 채점 -----------------------------------------------------------
  var sq = { kind: 'split', given: { m: 115 }, units: ['h', 'm'], answer: { h: 1, m: 55 } };
  eq(D.grade(sq, { h: 1, m: 55 }).correct, true, '바꾸기: 정답');
  eq(D.grade(sq, { h: 1, m: 15 }).mistake, 'hundred', '바꾸기: 1시간 15분은 hundred');
  eq(D.grade(sq, { h: 0, m: 115 }).mistake, 'unnormalized', '바꾸기: 0시간 115분은 unnormalized');
  eq(D.grade(sq, { h: 1, m: 50 }).mistake, null, '바꾸기: 그냥 틀림');
  var jq = { kind: 'join', given: walk, units: ['m', 's'], answer: { m: 63, s: 46 } };
  eq(D.grade(jq, { m: 103, s: 46 }).mistake, 'hundred', '풀어 바꾸기: 103분 46초는 hundred');

  var cq = { kind: 'compare', items: [drawing, walk], ask: 'shorter', answer: 1 };
  eq(D.grade(cq, 1).correct, true, '비교: 정답');
  eq(D.grade(cq, 0).mistake, 'flip', '비교: 거꾸로 고름');
  // 1시간 5분 vs 70분: 100 으로 읽으면 105분 > 70분 이라 1시간 5분이 길어 보인다
  var cq2 = { kind: 'compare', items: [{ h: 1, m: 5 }, { m: 70 }], ask: 'longer', answer: 1 };
  eq(D.grade(cq2, 0).mistake, 'hundred', '비교: 1시간 5분 > 70분 으로 본 것은 hundred');

  var dq = { kind: 'diff', items: [drawing, walk], units: ['m', 's'], diff: { m: 51, s: 14 }, answer: { m: 51, s: 14 } };
  eq(D.grade(dq, { m: 51, s: 14 }).correct, true, '차: 정답');
  eq(D.grade(dq, { m: 51, s: 54 }).mistake, 'borrow100', '차: 51분 54초는 borrow100');
  eq(D.grade(dq, { m: 52, s: 46 }).mistake, 'noBorrow', '차: 52분 46초는 noBorrow');
  eq(D.grade(dq, { m: 11, s: 14 }).mistake, 'hundred', '차: 11분 14초는 hundred');
  eq(D.grade(dq, { m: 50, s: 74 }).mistake, 'unnormalized', '차: 50분 74초는 unnormalized');
  eq(D.grade(dq, { m: 51, s: 15 }).mistake, null, '차: 그냥 틀림');

  var story = {
    kind: 'story', items: [drawing, walk], units: ['m', 's'], diff: { m: 51, s: 14 },
    ask: 'shorter', answer: { pick: 1, m: 51, s: 14 }
  };
  eq(D.grade(story, { pick: 1, m: 51, s: 14 }).correct, true, '학습지: 산책, 51분 14초');
  var flip = D.grade(story, { pick: 0, m: 51, s: 14 });
  eq(flip.correct + ':' + flip.mistake + ':' + flip.timeOk, 'false:flip:true', '학습지: 그림 그리기를 고름');
  var both = D.grade(story, { pick: 1, m: 51, s: 54 });
  eq(both.pickOk + ':' + both.mistake, 'true:borrow100', '학습지: 활동은 맞고 시간은 borrow100');

  // ---- 조사 -----------------------------------------------------------
  eq(['115분', '46초', '1시간', '산책', '그림 그리기', '현서', '민준', '3'].map(function (w) { return D.josa(w, '과와'); }).join(' '),
    '115분과 46초와 1시간과 산책과 그림 그리기와 현서와 민준과 3과', '와/과');
  eq(D.josa('현서', '은는') + ' ' + D.josa('민준', '은는'), '현서는 민준은', '은/는');

  global.DURATION_TEST_RESULTS = results;

  // node js/duration.test.js 로 돌렸을 때만 결과를 찍는다.
  if (typeof window === 'undefined' && typeof process !== 'undefined') {
    var failed = results.filter(function (r) { return !r.pass; });
    failed.forEach(function (r) { console.log('✗ ' + r.label + '  기대: ' + r.expected + '  실제: ' + r.actual); });
    console.log((failed.length ? 'FAIL ' + failed.length : 'PASS ' + results.length) + ' / ' + results.length);
    process.exitCode = failed.length ? 1 : 0;
  }
})(typeof window !== 'undefined' ? window : globalThis);
