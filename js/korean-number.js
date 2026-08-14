/**
 * korean-number.js
 *
 * 한국어 수 읽기 변환기 (한자어 수사 기준, 조 단위까지).
 *
 *   15000 -> toMixed()  : "1만 5000"
 *          -> toHangul() : "만오천"
 *
 * 브라우저에서는 window.KoreanNumber, Node에서는 module.exports 로 노출된다.
 * 내부 계산은 모두 BigInt 이므로 조/경 단위에서도 정밀도가 깨지지 않는다.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.KoreanNumber = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var DIGIT_NAMES = ['영', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];

  // 4자리 그룹 안에서 쓰이는 자리 단위 (큰 자리부터)
  var SMALL_UNITS = [
    { name: '천', value: 1000n },
    { name: '백', value: 100n },
    { name: '십', value: 10n }
  ];

  // 4자리마다 올라가는 큰 단위
  var GROUP_UNITS = ['', '만', '억', '조', '경'];
  var GROUP_BASE = 10000n;

  var DIGIT_MAP = {
    영: 0n, 공: 0n, 일: 1n, 이: 2n, 삼: 3n, 사: 4n,
    오: 5n, 육: 6n, 륙: 6n, 칠: 7n, 팔: 8n, 구: 9n
  };
  var SMALL_MAP = { 십: 10n, 백: 100n, 천: 1000n };
  var BIG_MAP = { 만: 10n ** 4n, 억: 10n ** 8n, 조: 10n ** 12n, 경: 10n ** 16n };
  var BIG_RANK = { 만: 1, 억: 2, 조: 3, 경: 4 };

  /** 숫자/문자열/BigInt 를 BigInt 로. 실패하면 null. */
  function toBigInt(value) {
    if (typeof value === 'bigint') return value;
    if (typeof value === 'number') {
      if (!Number.isInteger(value)) return null;
      return BigInt(value);
    }
    var s = String(value).replace(/[\s,]/g, '');
    if (!/^\d+$/.test(s)) return null;
    return BigInt(s);
  }

  /** 0~9999 한 그룹을 한글로. 0이면 빈 문자열. (십/백/천 앞의 '일'은 생략) */
  function groupToHangul(n) {
    if (n <= 0n) return '';
    var out = '';
    var rest = n;
    for (var i = 0; i < SMALL_UNITS.length; i++) {
      var unit = SMALL_UNITS[i];
      var d = rest / unit.value;
      rest = rest % unit.value;
      if (d === 0n) continue;
      out += (d === 1n ? '' : DIGIT_NAMES[Number(d)]) + unit.name;
    }
    if (rest > 0n) out += DIGIT_NAMES[Number(rest)];
    return out;
  }

  /**
   * 4자리씩 잘라 큰 단위별 그룹 목록을 만든다. 큰 단위 -> 작은 단위 순서.
   * @returns {{index:number, unit:string, value:bigint}[]}  (값이 0인 그룹도 포함)
   */
  function splitGroups(value) {
    var n = toBigInt(value);
    if (n === null) return [];
    var groups = [];
    var rest = n;
    var i = 0;
    do {
      groups.push({ index: i, unit: GROUP_UNITS[i] || '', value: rest % GROUP_BASE });
      rest = rest / GROUP_BASE;
      i++;
    } while (rest > 0n);
    return groups.reverse();
  }

  /**
   * 한글 읽기. 예) 15000 -> "만오천"
   * 규칙
   *  - 십/백/천 앞의 1은 읽지 않는다.        110 -> 백십
   *  - 만 앞의 1도 읽지 않는다.              10000 -> 만
   *  - 억/조 앞의 1은 읽는다.                10^8 -> 일억
   *  - 값이 0인 자리(그룹)는 통째로 건너뛴다. 100020000 -> 일억이만
   * @param {object} [options] options.spaced 가 true 면 만 단위마다 띄어쓴다.
   */
  function toHangul(value, options) {
    var n = toBigInt(value);
    if (n === null) return '';
    if (n === 0n) return '영';
    var spaced = !!(options && options.spaced);
    var parts = [];
    var groups = splitGroups(n);
    for (var i = 0; i < groups.length; i++) {
      var g = groups[i];
      if (g.value === 0n) continue;
      // 만(10^4) 자리에서만 앞의 '일'을 생략한다.
      var head = g.index === 1 && g.value === 1n ? '' : groupToHangul(g.value);
      parts.push(head + g.unit);
    }
    return parts.join(spaced ? ' ' : '');
  }

  /** 숫자 + 단위 표기. 예) 15000 -> "1만 5000" */
  function toMixed(value) {
    var n = toBigInt(value);
    if (n === null) return '';
    if (n === 0n) return '0';
    var parts = [];
    var groups = splitGroups(n);
    for (var i = 0; i < groups.length; i++) {
      var g = groups[i];
      if (g.value === 0n) continue;
      parts.push(String(g.value) + g.unit);
    }
    return parts.join(' ');
  }

  /** 세 자리마다 쉼표. 예) 15000 -> "15,000" */
  function toComma(value) {
    var n = toBigInt(value);
    if (n === null) return '';
    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  /**
   * 한글 읽기 -> 수. 파싱할 수 없으면 null.
   * '일만오천', '만오천', '만 오천' 처럼 허용되는 변형을 모두 같은 값으로 읽는다.
   */
  function parseHangul(input) {
    var s = String(input == null ? '' : input).replace(/\s+/g, '');
    if (!s) return null;
    if (s === '영' || s === '공') return 0n;

    var total = 0n;
    var section = 0n;   // 현재 큰 단위 그룹에 쌓이는 값
    var current = null; // 아직 자리 단위를 만나지 못한 한 자리 수
    var lastRank = Infinity;

    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      if (Object.prototype.hasOwnProperty.call(DIGIT_MAP, ch)) {
        if (current !== null) return null; // '일이' 처럼 숫자가 연달아 오면 오류
        current = DIGIT_MAP[ch];
      } else if (Object.prototype.hasOwnProperty.call(SMALL_MAP, ch)) {
        section += (current === null ? 1n : current) * SMALL_MAP[ch];
        current = null;
      } else if (Object.prototype.hasOwnProperty.call(BIG_MAP, ch)) {
        var rank = BIG_RANK[ch];
        if (rank >= lastRank) return null; // 만억, 억억 같은 순서 오류
        lastRank = rank;
        section += current === null ? 0n : current;
        total += (section === 0n ? 1n : section) * BIG_MAP[ch];
        section = 0n;
        current = null;
      } else {
        return null; // 한글 수사가 아닌 글자
      }
    }
    return total + section + (current === null ? 0n : current);
  }

  /**
   * 숫자+단위 표기 -> 수. 파싱할 수 없으면 null.
   * '1만 5000', '1만5000', '1만 5,000' 을 모두 읽는다. '15000' 도 값으로는 읽힌다.
   */
  function parseMixed(input) {
    var s = String(input == null ? '' : input).replace(/[\s,]/g, '');
    if (!s || !/^[0-9만억조경]+$/.test(s)) return null;
    var tokens = s.match(/\d+[만억조경]?/g);
    if (!tokens || tokens.join('') !== s) return null;

    var total = 0n;
    var lastRank = Infinity;
    for (var i = 0; i < tokens.length; i++) {
      var m = /^(\d+)([만억조경])?$/.exec(tokens[i]);
      if (!m) return null;
      var rank = m[2] ? BIG_RANK[m[2]] : 0;
      if (rank >= lastRank) return null;
      lastRank = rank;
      total += BigInt(m[1]) * (m[2] ? BIG_MAP[m[2]] : 1n);
    }
    return total;
  }

  /**
   * 자리표 / 해설용 분해. 값이 0이 아닌 그룹만 큰 단위부터 돌려준다.
   * @returns {{unit:string, digits:string, hangul:string, place:string}[]}
   */
  function explain(value) {
    var n = toBigInt(value);
    if (n === null || n === 0n) return [];
    var rows = [];
    var groups = splitGroups(n);
    for (var i = 0; i < groups.length; i++) {
      var g = groups[i];
      if (g.value === 0n) continue;
      var head = g.index === 1 && g.value === 1n ? '' : groupToHangul(g.value);
      rows.push({
        unit: g.unit,
        digits: String(g.value),
        hangul: head + g.unit,
        place: '10^' + g.index * 4
      });
    }
    return rows;
  }

  /** 자리표용: 값이 0인 그룹까지 포함해 4자리로 채운 그룹 목록. */
  function placeTable(value) {
    var groups = splitGroups(value);
    return groups.map(function (g, i) {
      return {
        unit: g.unit,
        label: g.unit || '일',
        // 맨 앞 그룹만 자연스럽게 앞의 0을 떼고, 나머지는 4자리로 채운다.
        digits: i === 0 ? String(g.value) : String(g.value).padStart(4, '0'),
        zero: g.value === 0n
      };
    });
  }

  return {
    DIGIT_NAMES: DIGIT_NAMES,
    GROUP_UNITS: GROUP_UNITS,
    toBigInt: toBigInt,
    toHangul: toHangul,
    toMixed: toMixed,
    toComma: toComma,
    parseHangul: parseHangul,
    parseMixed: parseMixed,
    splitGroups: splitGroups,
    explain: explain,
    placeTable: placeTable
  };
});
