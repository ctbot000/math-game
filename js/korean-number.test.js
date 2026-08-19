/* korean-number.js 검증. test.html 에서 실행된다. */
(function (global) {
  'use strict';

  var K = global.KoreanNumber;
  var results = [];

  function eq(actual, expected, label) {
    var a = typeof actual === 'bigint' ? actual.toString() : String(actual);
    var e = typeof expected === 'bigint' ? expected.toString() : String(expected);
    results.push({ pass: a === e, label: label, actual: a, expected: e });
  }

  // ---- toMixed / toHangul ----------------------------------------------
  var pairs = [
    [0, '0', '영'],
    [1, '1', '일'],
    [7, '7', '칠'],
    [10, '10', '십'],
    [11, '11', '십일'],
    [90, '90', '구십'],
    [100, '100', '백'],
    [110, '110', '백십'],
    [1000, '1000', '천'],
    [1111, '1111', '천백십일'],
    [9999, '9999', '구천구백구십구'],
    [10000, '1만', '만'],
    [15000, '1만 5000', '만오천'],
    [20000, '2만', '이만'],
    [100000, '10만', '십만'],
    [123456, '12만 3456', '십이만삼천사백오십육'],
    [1000000, '100만', '백만'],
    [10000000, '1000만', '천만'],
    [100000000, '1억', '일억'],
    [100010000, '1억 1만', '일억만'],
    [100000001, '1억 1', '일억일'],
    [123456789, '1억 2345만 6789', '일억이천삼백사십오만육천칠백팔십구'],
    [1002003004, '10억 200만 3004', '십억이백만삼천사'],
    ['1000000000000', '1조', '일조'],
    ['1000000010000', '1조 1만', '일조만'],
    ['1234567890123', '1조 2345억 6789만 123', '일조이천삼백사십오억육천칠백팔십구만백이십삼'],
    ['999000000000000', '999조', '구백구십구조']
  ];
  pairs.forEach(function (p) {
    eq(K.toMixed(p[0]), p[1], 'toMixed(' + p[0] + ')');
    eq(K.toHangul(p[0]), p[2], 'toHangul(' + p[0] + ')');
  });

  eq(K.toHangul(1234567890123n, { spaced: true }),
    '일조 이천삼백사십오억 육천칠백팔십구만 백이십삼', 'toHangul spaced');
  eq(K.toComma(1234567890123n), '1,234,567,890,123', 'toComma');
  eq(K.toComma(0), '0', 'toComma(0)');

  // ---- parseHangul -----------------------------------------------------
  var hangulCases = [
    ['만오천', '15000'],
    ['일만오천', '15000'],
    ['만 오천', '15000'],
    ['  만오천  ', '15000'],
    ['천백십일', '1111'],
    ['일천일백일십일', '1111'],
    ['억', '100000000'],
    ['일억', '100000000'],
    ['조', '1000000000000'],
    ['영', '0'],
    ['일억이천삼백사십오만육천칠백팔십구', '123456789'],
    ['일조이천삼백사십오억육천칠백팔십구만백이십삼', '1234567890123'],
    ['일조 이천삼백사십오억 육천칠백팔십구만 백이십삼', '1234567890123'],
    ['십억이백만삼천사', '1002003004']
  ];
  hangulCases.forEach(function (c) {
    eq(K.parseHangul(c[0]), c[1], 'parseHangul("' + c[0] + '")');
  });

  eq(K.parseHangul('오천만천'), '50001000', 'parseHangul("오천만천")');

  ['', '만억', '억억', '일이', 'abc', '만오천원', '15000'].forEach(function (bad) {
    eq(K.parseHangul(bad) === null, 'true', 'parseHangul 거부: "' + bad + '"');
  });

  // ---- parseMixed ------------------------------------------------------
  var mixedCases = [
    ['1만 5000', '15000'],
    ['1만5000', '15000'],
    ['1만 5,000', '15000'],
    ['15000', '15000'],
    ['1조 2345억 6789만 123', '1234567890123'],
    ['1억 1만', '100010000']
  ];
  mixedCases.forEach(function (c) {
    eq(K.parseMixed(c[0]), c[1], 'parseMixed("' + c[0] + '")');
  });

  ['', '만5000', '1만 2억', '1만만', '1만 5000원', '만', 'abc'].forEach(function (bad) {
    eq(K.parseMixed(bad) === null, 'true', 'parseMixed 거부: "' + bad + '"');
  });

  // ---- 왕복 검사 (랜덤 2000개) -----------------------------------------
  var rtFail = 0;
  var rtSample = null;
  for (var i = 0; i < 2000; i++) {
    var len = 1 + Math.floor(Math.random() * 15);
    var s = String(1 + Math.floor(Math.random() * 9));
    for (var j = 1; j < len; j++) s += String(Math.floor(Math.random() * 10));
    var n = BigInt(s);
    var okH = K.parseHangul(K.toHangul(n)) === n;
    var okHS = K.parseHangul(K.toHangul(n, { spaced: true })) === n;
    var okM = K.parseMixed(K.toMixed(n)) === n;
    if (!(okH && okHS && okM)) {
      rtFail++;
      if (!rtSample) {
        rtSample = s + ' -> ' + K.toHangul(n) + ' / ' + K.toMixed(n);
      }
    }
  }
  eq(rtFail, 0, '왕복 변환 2000건' + (rtSample ? ' (첫 실패: ' + rtSample + ')' : ''));

  // ---- explain / placeTable -------------------------------------------
  var ex = K.explain(15000);
  eq(ex.length, 2, 'explain(15000).length');
  eq(ex[0].digits + ex[0].unit + '=' + ex[0].hangul, '1만=만', 'explain(15000)[0]');
  eq(ex[1].digits + ex[1].unit + '=' + ex[1].hangul, '5000=오천', 'explain(15000)[1]');

  var pt = K.placeTable(100010000);
  eq(pt.map(function (r) { return r.label + ':' + r.digits; }).join(' '),
    '억:1 만:0001 일:0000', 'placeTable(100010000)');

  // ---- unitCounts / subjectParticle -----------------------------------
  function countsOf(v) {
    return K.unitCounts(v).map(function (r) {
      return r.label + ':' + r.count + '/' + r.unitValue;
    }).join(' ');
  }

  eq(countsOf(503690), '만:50/10000 일:3690/1', 'unitCounts(503690)');
  eq(countsOf(15000), '만:1/10000 일:5000/1', 'unitCounts(15000)');
  eq(countsOf(500000), '만:50/10000', 'unitCounts(500000) — 0인 단위는 빠진다');
  eq(countsOf(500023), '만:50/10000 일:23/1', 'unitCounts(500023) — 개수가 4자리 미만');
  eq(countsOf(100020000), '억:1/100000000 만:2/10000', 'unitCounts(100020000)');
  eq(countsOf('1234567890123'),
    '조:1/1000000000000 억:2345/100000000 만:6789/10000 일:123/1', 'unitCounts(1조대)');
  eq(countsOf(3690), '1000:3/1000 100:6/100 10:9/10', 'unitCounts(3690) — 10000 미만은 자리별로');
  eq(countsOf(9999), '1000:9/1000 100:9/100 10:9/10 1:9/1', 'unitCounts(9999)');
  eq(countsOf(700), '100:7/100', 'unitCounts(700)');
  eq(K.unitCounts(0).length, 0, 'unitCounts(0)');

  eq(K.subjectParticle('만'), '이', 'subjectParticle(만)');
  eq(K.subjectParticle('억'), '이', 'subjectParticle(억)');
  eq(K.subjectParticle('조'), '가', 'subjectParticle(조) — 받침이 없다');
  eq(K.subjectParticle('일'), '이', 'subjectParticle(일)');
  eq(K.subjectParticle('1000'), '이', 'subjectParticle(1000) -> 천이');
  eq(K.subjectParticle('100'), '이', 'subjectParticle(100) -> 백이');
  eq(K.subjectParticle('10'), '이', 'subjectParticle(10) -> 십이');
  eq(K.subjectParticle('1'), '이', 'subjectParticle(1) -> 일이');

  // 단위별 개수를 다시 더하면 원래 수가 나와야 한다
  var ucFail = 0;
  var ucSample = null;
  for (var u = 0; u < 1000; u++) {
    var ulen = 1 + Math.floor(Math.random() * 15);
    var us = String(1 + Math.floor(Math.random() * 9));
    for (var uj = 1; uj < ulen; uj++) us += String(Math.floor(Math.random() * 10));
    var un = BigInt(us);
    var sum = K.unitCounts(un).reduce(function (acc, r) {
      return acc + r.count * r.unitValue;
    }, 0n);
    if (sum !== un) { ucFail++; if (!ucSample) ucSample = us + ' -> ' + sum; }
  }
  eq(ucFail, 0, '단위 개수 합산 1000건' + (ucSample ? ' (첫 실패: ' + ucSample + ')' : ''));

  global.KOREAN_NUMBER_TEST_RESULTS = results;
})(window);
