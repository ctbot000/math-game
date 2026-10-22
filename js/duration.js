/**
 * duration.js
 *
 * 시간 계산의 계산 부분 — 시간·분·초 바꾸기, 비교, 차 구하기, 학습지형 서술 문제. DOM 은 건드리지 않는다.
 *
 * 시간 하나는 {h, m, s} 로 나타낸다. 적힌 단위만 들어 있다 — 115분은 {m: 115},
 * 1시간 3분 46초는 {h: 1, m: 3, s: 46}. 답할 단위는 units 로 정한다 (['m', 's'] 는 「□분 □초」).
 *
 * 브라우저에서는 window.Duration, Node 에서는 module.exports 로 노출된다.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.Duration = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var ORDER = ['h', 'm', 's'];
  var UNIT_SEC = { h: 3600, m: 60, s: 1 };
  var UNIT_NAME = { h: '시간', m: '분', s: '초' };

  var KINDS = ['split', 'join', 'compare', 'diff', 'story'];

  // 학습지의 「나는 115분 동안 그림을 그리고, 1시간 3분 46초 동안 산책을 했어.」 꼴
  var ACTIVITIES = [
    { name: '그림 그리기', and: '그림을 그리고', end: '그림을 그렸어' },
    { name: '산책', and: '산책을 하고', end: '산책을 했어' },
    { name: '책 읽기', and: '책을 읽고', end: '책을 읽었어' },
    { name: '피아노 연습', and: '피아노 연습을 하고', end: '피아노 연습을 했어' },
    { name: '숙제', and: '숙제를 하고', end: '숙제를 했어' },
    { name: '줄넘기', and: '줄넘기를 하고', end: '줄넘기를 했어' },
    { name: '축구', and: '축구를 하고', end: '축구를 했어' },
    { name: '수영', and: '수영을 하고', end: '수영을 했어' },
    { name: '블록 놀이', and: '블록 놀이를 하고', end: '블록 놀이를 했어' },
    { name: '영화 보기', and: '영화를 보고', end: '영화를 봤어' }
  ];
  var NAMES = ['현서', '지우', '민준', '서연', '하준', '도윤', '수아', '예린'];

  // ------------------------------------------------------------------ 수

  function toSec(d) {
    return (d.h || 0) * 3600 + (d.m || 0) * 60 + (d.s || 0);
  }

  /** sec 를 units 로 나눈다. 큰 단위부터 채운다 — split(6900, ['h', 'm']) = {h: 1, m: 55} */
  function split(sec, units) {
    var out = {};
    var rest = sec;
    sortUnits(units).forEach(function (u) {
      out[u] = Math.floor(rest / UNIT_SEC[u]);
      rest -= out[u] * UNIT_SEC[u];
    });
    return out;
  }

  function sortUnits(units) {
    return ORDER.filter(function (u) { return units.indexOf(u) >= 0; });
  }

  function unitsOf(d) {
    return ORDER.filter(function (u) { return d[u] !== undefined; });
  }

  /** '1시간 3분 46초'. 0 인 단위는 뺀다. 모두 0 이면 '0초' 처럼 가장 작은 단위로. */
  function format(d) {
    var us = unitsOf(d);
    var parts = us.filter(function (u) { return d[u]; }).map(function (u) { return d[u] + UNIT_NAME[u]; });
    return parts.length ? parts.join(' ') : '0' + UNIT_NAME[us[us.length - 1] || 's'];
  }

  /** 단위를 빼지 않고 '0분 30초' 처럼 모두 쓴다 */
  function formatAll(d, units) {
    return sortUnits(units).map(function (u) { return (d[u] || 0) + UNIT_NAME[u]; }).join(' ');
  }

  function same(a, b, units) {
    return sortUnits(units).every(function (u) { return (a[u] || 0) === (b[u] || 0); });
  }

  /** 60 을 넘는 아래 단위가 없는가 (가장 큰 단위는 얼마든 된다) */
  function normalized(d, units) {
    return sortUnits(units).slice(1).every(function (u) { return (d[u] || 0) < 60; });
  }

  /**
   * 「1시간 = 100분, 1분 = 100초」 로 잘못 본 변환. 115분 → 1시간 15분, 1시간 3분 → 103분.
   * 가장 흔한 실수라 따로 계산해 둔다.
   */
  function hundredConvert(given, units) {
    var idx = function (u) { return ORDER.indexOf(u); };
    var lowest = Math.max.apply(null, unitsOf(given).concat(units).map(idx));
    var v = 0;
    unitsOf(given).forEach(function (u) { v += given[u] * Math.pow(100, lowest - idx(u)); });
    var out = {};
    sortUnits(units).forEach(function (u) {
      var w = Math.pow(100, lowest - idx(u));
      out[u] = Math.floor(v / w);
      v -= out[u] * w;
    });
    return out;
  }

  /** 1시간 = 100분, 1분 = 100초로 읽은 크기 (비교에서 잘못 고른 이유를 찾는 데 쓴다) */
  function hundredValue(d) {
    return ((d.h || 0) * 100 + (d.m || 0)) * 100 + (d.s || 0);
  }

  /**
   * 「□분 □초」 끼리 세로셈으로 뺀다. 큰 것에서 작은 것을 뺀다.
   *   minPerHour 시간을 분으로 바꿀 때 (맞게는 60)
   *   borrow     1분을 내려 받을 때의 초 (맞게는 60)
   * 돌려주는 값: {m, s, borrowed, a: {m, s}, b: {m, s}}  a 가 큰 쪽
   */
  function columnSub(x, y, minPerHour, borrow) {
    var a = { m: (x.h || 0) * minPerHour + (x.m || 0), s: x.s || 0 };
    var b = { m: (y.h || 0) * minPerHour + (y.m || 0), s: y.s || 0 };
    if (a.m < b.m || (a.m === b.m && a.s < b.s)) { var t = a; a = b; b = t; }
    var m = a.m - b.m;
    var s = a.s - b.s;
    var borrowed = s < 0;
    if (borrowed) { s += borrow; m -= 1; }
    return { m: m, s: s, borrowed: borrowed, a: a, b: b };
  }

  // ------------------------------------------------------------------ 문제

  /** 시드를 받는 난수 (테스트에서 같은 문제를 다시 만든다) */
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

  /** lo~hi 에서 60 의 배수가 아닌 수 (115분처럼 바꾸면 나머지가 남는 수) */
  function notRound(rng, lo, hi) {
    var v;
    do { v = randInt(rng, lo, hi); } while (v % 60 === 0);
    return v;
  }

  function pick(rng, list) {
    return list[Math.floor(rng() * list.length)];
  }

  /**
   * 학습지처럼 「115분」 과 「1시간 3분 46초」 한 쌍. 차는 5분~59분 59초.
   * 분만 쓴 쪽은 61~179분, 다른 쪽은 시간·분·초가 모두 0 이 아니다.
   */
  function minutePair(rng) {
    var v = notRound(rng, 61, 179);
    var a = { m: v };
    var b;
    do {
      var delta = randInt(rng, 300, 3599) * (rng() < 0.5 ? -1 : 1);
      b = split(v * 60 + delta, ['h', 'm', 's']);
    } while (!(b.h >= 1 && b.m >= 1 && b.s >= 1));
    return [a, b];
  }

  /** 「200초」 와 「3분 25초」 한 쌍. 차는 5~50초 */
  function secondPair(rng) {
    var v = notRound(rng, 70, 299);
    var b;
    do {
      b = split(v + randInt(rng, 5, 50) * (rng() < 0.5 ? -1 : 1), ['m', 's']);
    } while (!(b.m >= 1 && b.s >= 1));
    return [{ s: v }, b];
  }

  function shuffled(rng, pair) {
    return rng() < 0.5 ? [pair[0], pair[1]] : [pair[1], pair[0]];
  }

  /**
   * kind:
   *   split   작은 단위 하나를 큰 단위로 — 115분 = □시간 □분, 226초 = □분 □초
   *   join    큰 단위를 작은 단위로 — 1시간 3분 = □분, 3분 46초 = □초, 1시간 3분 46초 = □분 □초
   *   compare 두 시간 중 더 긴 (짧은) 것 고르기
   *   diff    두 시간의 차를 □분 □초로
   *   story   학습지 문제 — 두 활동 중 어느 것을 몇 분 몇 초 더 짧게 (길게) 했는지
   */
  function generate(kind, rng) {
    rng = rng || Math.random;
    var q = { kind: kind };
    var r = rng();

    if (kind === 'split') {
      q.given = r < 0.6 ? { m: notRound(rng, 61, 179) } : { s: notRound(rng, 61, 299) };
      q.units = q.given.m !== undefined ? ['h', 'm'] : ['m', 's'];
      q.answer = split(toSec(q.given), q.units);
    } else if (kind === 'join') {
      if (r < 0.35) {
        q.given = { h: randInt(rng, 1, 2), m: randInt(rng, 1, 59) };
        q.units = ['m'];
      } else if (r < 0.65) {
        q.given = { m: randInt(rng, 1, 4), s: randInt(rng, 1, 59) };
        q.units = ['s'];
      } else {
        q.given = { h: 1, m: randInt(rng, 1, 59), s: randInt(rng, 1, 59) };
        q.units = ['m', 's'];
      }
      q.answer = split(toSec(q.given), q.units);
    } else if (kind === 'compare') {
      q.items = shuffled(rng, r < 0.65 ? minutePair(rng) : secondPair(rng));
      q.ask = rng() < 0.5 ? 'longer' : 'shorter';
      q.answer = q.ask === 'longer' ? longerIndex(q.items) : 1 - longerIndex(q.items);
    } else {
      q.items = shuffled(rng, minutePair(rng));
      q.units = ['m', 's'];
      var d = Math.abs(toSec(q.items[0]) - toSec(q.items[1]));
      q.diff = split(d, q.units);
      q.answer = q.diff;
      if (kind === 'story') {
        q.name = pick(rng, NAMES);
        var i = Math.floor(rng() * ACTIVITIES.length);
        var j = (i + 1 + Math.floor(rng() * (ACTIVITIES.length - 1))) % ACTIVITIES.length;
        q.acts = [ACTIVITIES[i], ACTIVITIES[j]];
        q.ask = rng() < 0.5 ? 'shorter' : 'longer';
        var longer = longerIndex(q.items);
        q.answer = { pick: q.ask === 'longer' ? longer : 1 - longer, m: q.diff.m, s: q.diff.s };
      }
    }
    return q;
  }

  function longerIndex(items) {
    return toSec(items[0]) > toSec(items[1]) ? 0 : 1;
  }

  // ------------------------------------------------------------------ 입력·채점

  /** '55', '５５', ' 5 5 분' → {value: 55}. 빈칸·숫자 아님은 {error}. */
  function parseNum(text) {
    var s = String(text == null ? '' : text)
      .replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
      .replace(/\s+/g, '')
      .replace(/(시간|분|초)$/, '');
    if (!s) return { error: 'empty' };
    if (!/^\d{1,4}$/.test(s)) return { error: 'format' };
    return { value: Number(s) };
  }

  /**
   * 채점.
   *   split·join·diff  answer = {h?, m?, s?}
   *   compare          answer = 0 | 1 (고른 쪽)
   *   story            answer = {pick, m, s}
   * 돌려주는 값: {correct, mistake}  story 는 pickOk·timeOk 도.
   *
   * mistake 는 흔한 실수를 짚는 데 쓴다:
   *   hundred      1시간을 100분 (1분을 100초) 으로 봤다 — 115분 → 1시간 15분
   *   unnormalized 크기는 맞는데 60 이 넘는 단위를 올리지 않았다 — 50분 74초
   *   borrow100    빼면서 1분을 100초로 내려 받았다 — 51분 54초
   *   noBorrow     초끼리 거꾸로 뺐다 (46 − 0) — 52분 46초
   *   flip         더 긴 (짧은) 쪽을 거꾸로 골랐다
   */
  function grade(q, answer) {
    if (q.kind === 'compare') {
      var res = { correct: answer === q.answer, mistake: null };
      if (!res.correct) {
        // 100 으로 읽으면 고른 쪽이 묻는 쪽이 되는가
        var h0 = hundredValue(q.items[0]);
        var h1 = hundredValue(q.items[1]);
        var hLonger = h0 > h1 ? 0 : h1 > h0 ? 1 : -1;
        var hPick = q.ask === 'longer' ? hLonger : hLonger < 0 ? -1 : 1 - hLonger;
        res.mistake = hPick === answer ? 'hundred' : 'flip';
      }
      return res;
    }
    if (q.kind === 'story') {
      var t = gradeTime(q, answer);
      var pickOk = answer.pick === q.answer.pick;
      return {
        correct: pickOk && t.correct,
        pickOk: pickOk,
        timeOk: t.correct,
        mistake: t.correct ? (pickOk ? null : 'flip') : t.mistake
      };
    }
    return gradeTime(q, answer);
  }

  function gradeTime(q, answer) {
    var units = q.units;
    var want = q.kind === 'story' ? q.diff : q.answer;
    var res = { correct: same(answer, want, units), mistake: null };
    if (res.correct) return res;

    if (q.kind === 'split' || q.kind === 'join') {
      if (same(answer, hundredConvert(q.given, units), units)) res.mistake = 'hundred';
      else if (toSec(answer) === toSec(want) && !normalized(answer, units)) res.mistake = 'unnormalized';
      return res;
    }
    var x = q.items[0];
    var y = q.items[1];
    if (toSec(answer) === toSec(want) && !normalized(answer, units)) res.mistake = 'unnormalized';
    else if (same(answer, columnSub(x, y, 60, 100), units)) res.mistake = 'borrow100';
    else if (same(answer, noBorrow(x, y), units)) res.mistake = 'noBorrow';
    else if (same(answer, columnSub(x, y, 100, 60), units) || same(answer, columnSub(x, y, 100, 100), units)) {
      res.mistake = 'hundred';
    }
    return res;
  }

  /** 자리마다 큰 수에서 작은 수를 뺀 값 (받아내림을 안 한 실수) */
  function noBorrow(x, y) {
    var c = columnSub(x, y, 60, 60);
    return { m: Math.abs(c.a.m - c.b.m), s: Math.abs(c.a.s - c.b.s) };
  }

  // ------------------------------------------------------------------ 풀이

  /**
   * 바꾸는 식 한 줄.
   *   115분 → ['h','m']       '115분 = 60분 + 55분 = 1시간 55분'
   *   150분 → ['h','m']       '150분 = 120분 + 30분 = 2시간 30분'
   *   1시간 3분 46초 → ['m','s'] '1시간 3분 46초 = 60분 + 3분 + 46초 = 63분 46초'
   */
  function convertLine(given, units) {
    var res = split(toSec(given), units);
    var us = unitsOf(given);
    var top = sortUnits(units)[0];
    if (us.length === 1 && ORDER.indexOf(us[0]) > ORDER.indexOf(top)) {
      var u = us[0];
      var big = res[top] * (UNIT_SEC[top] / UNIT_SEC[u]);
      var rest = given[u] - big;
      return given[u] + UNIT_NAME[u] + ' = ' + big + UNIT_NAME[u] +
        (rest ? ' + ' + rest + UNIT_NAME[u] : '') + ' = ' + format(res);
    }
    var parts = us.filter(function (v) { return given[v]; }).map(function (v) {
      if (ORDER.indexOf(v) < ORDER.indexOf(top)) return given[v] * (UNIT_SEC[v] / UNIT_SEC[top]) + UNIT_NAME[top];
      return given[v] + UNIT_NAME[v];
    });
    return format(given) + ' = ' + parts.join(' + ') + ' = ' + format(res);
  }

  /**
   * 두 시간을 「□분 □초」 로 맞춰 빼는 풀이. {convert: [바꾸는 식…], sub: '빼는 식'}
   *   115분 − 1시간 3분 46초 → convert ['1시간 3분 46초 = 60분 + 3분 + 46초 = 63분 46초'],
   *   sub '115분 0초 − 63분 46초 = 114분 60초 − 63분 46초 = 51분 14초'
   */
  function diffSteps(items) {
    var convert = items.filter(function (d) { return d.h; }).map(function (d) { return convertLine(d, ['m', 's']); });
    var c = columnSub(items[0], items[1], 60, 60);
    var ms = function (v) { return v.m + '분 ' + v.s + '초'; };
    var sub = ms(c.a) + ' − ' + ms(c.b) + ' = ';
    if (c.borrowed) sub += (c.a.m - 1) + '분 ' + (c.a.s + 60) + '초 − ' + ms(c.b) + ' = ';
    return { convert: convert, sub: sub + ms(c), borrowed: c.borrowed };
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

  /** josa('115분', '과와') → '115분과', josa('산책', '은는') → '산책은' */
  function josa(word, pair) {
    return word + (hasBatchim(word) ? pair.charAt(0) : pair.charAt(1));
  }

  return {
    ORDER: ORDER,
    UNIT_NAME: UNIT_NAME,
    KINDS: KINDS,
    ACTIVITIES: ACTIVITIES,
    NAMES: NAMES,
    toSec: toSec,
    split: split,
    format: format,
    formatAll: formatAll,
    same: same,
    normalized: normalized,
    hundredConvert: hundredConvert,
    hundredValue: hundredValue,
    columnSub: columnSub,
    noBorrow: noBorrow,
    mulberry32: mulberry32,
    generate: generate,
    longerIndex: longerIndex,
    parseNum: parseNum,
    grade: grade,
    convertLine: convertLine,
    diffSteps: diffSteps,
    hasBatchim: hasBatchim,
    josa: josa
  };
});
