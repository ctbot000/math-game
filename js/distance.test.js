/* distance.js 검증. test.html 에서 실행되고, node js/distance.test.js 로도 돌릴 수 있다. */
(function (global) {
  'use strict';

  var D = global.Distance || require('./distance.js');
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

  function mistake(q, value) { return D.grade(q, value).mistake; }

  // ---- 학습지 4-3 -------------------------------------------------------
  var o = D.worksheetOverlap();
  eq(D.questionText(o), '㉠에서 ㉣까지의 거리가 589 m일 때 ㉡에서 ㉢까지의 거리는 몇 m일까요?', '4-3 문장');
  eq(D.marks(o).map(function (m) { return D.name(m.span) + ' ' + m.label; }).join(', '), '㉠~㉢ 436 m, ㉡~㉣ 428 m', '4-3 그림');
  eq(o.answer.ans, 275, '4-3 답 275 m');
  eq(D.solutionLines(o).join(' | '),
    '㉠~㉢과 ㉡~㉣을 더하면 ㉡~㉢이 두 번 들어가요. | 436 + 428 = 864 | ㉡~㉢ = 864 − 589 = 275', '4-3 풀이');
  eq(D.grade(o, { ans: 275 }).correct, true, '4-3 정답');
  eq(mistake(o, { ans: 864 }), 'sumOnly', '더하기만 함 → sumOnly');
  eq(mistake(o, { ans: 153 }) + ',' + mistake(o, { ans: 161 }), 'endPiece,endPiece', '전체에서 하나만 뺌 → endPiece');
  eq(mistake(o, { ans: 8 }), 'diffGiven', '그림의 두 거리끼리 뺌 → diffGiven');
  eq(mistake(o, { ans: 285 }) + ',' + mistake(o, { ans: 175 }), 'calc,calc', '한 자리 계산 실수 → calc');
  eq(mistake(o, { ans: 305 }), 'null', '알 수 없는 답 → null');

  // ---- 학습지 4-4 -------------------------------------------------------
  var c = D.worksheetChain();
  eq(D.questionText(c), '㉡에서 ㉣까지의 거리가 508 m일 때 ㉠에서 ㉡까지의 거리는 몇 m일까요?', '4-4 문장');
  eq(D.marks(c).map(function (m) { return D.name(m.span) + ' ' + m.label; }).join(', '), '㉠~㉢ 439 m, ㉢~㉣ 235 m', '4-4 그림');
  eq(c.answer.ans, 166, '4-4 답 166 m');
  eq(D.solutionLines(c).join(' | '),
    '㉡~㉢ = ㉡~㉣ − ㉢~㉣ = 508 − 235 = 273 | ㉠~㉡ = ㉠~㉢ − ㉡~㉢ = 439 − 273 = 166', '4-4 풀이');
  eq(mistake(c, { ans: 273 }), 'midOnly', '가운데에서 멈춤 → midOnly');
  eq(mistake(c, { ans: 204 }) + ',' + mistake(c, { ans: 69 }), 'wrongPair,wrongPair', '엉뚱한 두 거리를 뺌 → wrongPair');
  eq(mistake(c, { ans: 176 }), 'calc', '4-4 계산 실수');

  // ---- 차례로 -----------------------------------------------------------
  var og = D.generate('oguided', D.mulberry32(3));
  eq(D.inputKeys(og).join(), 'sum,ans', '겹친 거리 차례로: 빈칸 둘');
  var g1 = D.grade(og, { sum: og.answer.sum, ans: og.answer.ans + 100 });
  eq(g1.correct + ',' + g1.ok.sum + ',' + g1.ok.ans + ',' + g1.step + ',' + g1.mistake, 'false,true,false,ans,calc', '둘째 칸만 틀림');

  var cg = D.generate('cguided', D.mulberry32(5));
  eq(D.inputKeys(cg).join(), 'mid,ans', '두 번 빼기 차례로: 빈칸 둘');
  var cp = D.chainParts(cg);
  var wrongMid = cg.answer.mid + 37;
  var g2 = D.grade(cg, { mid: wrongMid, ans: D.span(cg, cp.whole) - wrongMid });
  eq(g2.step + ',' + g2.ok.ans, 'mid,false', '앞 칸이 틀리면 그 칸부터 알려 준다');
  eq(mistake(cg, { mid: D.span(cg, cg.text) + D.span(cg, cp.piece), ans: 1 }), 'added', '가운데를 더해서 구함 → added');

  // ---- 한 번 빼기 -------------------------------------------------------
  var pt = D.generate('part', D.mulberry32(9));
  eq(mistake(pt, { ans: D.span(pt, pt.text) + D.span(pt, pt.drawn[0]) }), 'added', '한 번 빼기에서 더함 → added');

  // ---- 무작위 문제 -------------------------------------------------------
  var rng = D.mulberry32(2026);
  all(1000, '모든 종류: 거리는 양수, 전체 300~999, 답 = 묻는 거리, 정답은 정답', function (i) {
    var q = D.generate(D.KINDS[i % D.KINDS.length], rng);
    var total = q.seg[0] + q.seg[1] + q.seg[2];
    if (q.seg.some(function (s) { return s < 60 || s > 399; })) return q.kind + ' seg ' + q.seg;
    if (total < 300 || total > 999) return q.kind + ' total ' + total;
    if (q.answer.ans !== D.span(q, q.ask)) return q.kind + ' ans';
    if (!D.grade(q, q.answer).correct) return q.kind + ' 정답 채점';
    // 그림과 글의 거리, 묻는 거리는 서로 다르다
    var spans = [q.text, q.ask].concat(q.drawn).map(String);
    if (spans.some(function (s, k) { return spans.indexOf(s) !== k; })) return q.kind + ' 겹침 ' + spans.join(' ');
    return null;
  });

  all(500, '주어진 거리만으로 답이 정해진다 (풀이 마지막 수 = 답)', function () {
    var q = D.generate(D.KINDS[Math.floor(rng() * D.KINDS.length)], rng);
    var last = D.solutionLines(q).slice(-1)[0];
    return Number(last.split(' = ').slice(-1)[0]) === q.answer.ans ? null : q.kind + ' ' + last;
  });

  var asked = {};
  for (var i = 0; i < 400; i++) {
    var q = D.generate(i % 2 ? 'overlap' : 'chain', rng);
    asked[q.kind + ':' + D.name(q.ask)] = true;
  }
  eq(Object.keys(asked).sort().join(), 'chain:㉠~㉡,chain:㉢~㉣,overlap:㉠~㉣,overlap:㉡~㉢', '문제 모양: 4-4 좌우 뒤집기, 4-3 거꾸로');

  // ---- 입력 -------------------------------------------------------------
  eq(['275', ' ２７５ ', '275m', '275 m', '1,024'].map(function (t) { return D.parseNum(t).value; }).join(','),
    '275,275,275,275,1024', '숫자 읽기');
  eq(D.parseNum('').error + ':' + D.parseNum('이백').error, 'empty:format', '빈칸·글자');

  global.DISTANCE_TEST_RESULTS = results;

  if (typeof window === 'undefined' && typeof process !== 'undefined') {
    var failed = results.filter(function (r) { return !r.pass; });
    failed.forEach(function (r) { console.log('✗ ' + r.label + '  기대: ' + r.expected + '  실제: ' + r.actual); });
    console.log((failed.length ? 'FAIL ' + failed.length : 'PASS ' + results.length) + ' / ' + results.length);
    process.exitCode = failed.length ? 1 : 0;
  }
})(typeof window !== 'undefined' ? window : globalThis);
