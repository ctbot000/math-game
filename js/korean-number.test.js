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

  global.KOREAN_NUMBER_TEST_RESULTS = results;
})(window);
