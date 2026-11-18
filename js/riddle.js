/**
 * riddle.js
 *
 * 기호가 있는 덧셈식의 계산 부분 — 문제 만들기, 자리마다 풀기, 채점, 풀이 글. DOM 은 건드리지 않는다.
 *
 * 학습지 -3: ㉠㉠㉡ + ㉡㉡㉡ = 1000 에서 ㉠, ㉡ 구하기.
 *   일의 자리 ㉡ + ㉡ = 10 → ㉡ = 5 (0 + 0 = 0 도 되지만 ㉡ 은 맨 앞 자리라 0 이 아니다), 받아올림 1
 *   십의 자리 ㉠ + 5 + 1 = 10 → ㉠ = 4. 445 + 555 = 1000
 * 학습지 -4: 53㉠ + 3㉡7 = ㉢23 일 때 ㉠ + ㉡ + ㉢.
 *   ㉠ + 7 = 13 → ㉠ = 6, 3 + ㉡ + 1 = 12 → ㉡ = 8, 5 + 3 + 1 = 9 → ㉢ = 9. 6 + 8 + 9 = 23
 *
 * 수는 칸(토큰)의 배열로 적는다. 숫자는 0~9, 기호는 'A'·'B'·'C' (㉠·㉡·㉢).
 * 브라우저에서는 window.Riddle, Node 에서는 module.exports 로 노출된다.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.Riddle = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // guided·three: 기호 셋이 한 자리씩, pguided·pair: 같은 기호가 여러 번, sub: 뺄셈식 (후보를 넣어 보기)
  var KINDS = ['guided', 'three', 'pguided', 'pair', 'sub'];
  var SYM = { A: '㉠', B: '㉡', C: '㉢' };
  var COL = ['일의 자리', '십의 자리', '백의 자리'];

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

  // ------------------------------------------------------------------ 칸

  function isSym(t) { return typeof t === 'string'; }

  function digits(n) { return String(n).split('').map(Number); }

  /** 칸 배열을 글로: [5, 3, 'A'] → '53㉠' */
  function show(tokens) {
    return tokens.map(function (t) { return isSym(t) ? SYM[t] : String(t); }).join('');
  }

  /** 기호에 값을 넣은 수 */
  function value(tokens, vals) {
    return Number(tokens.map(function (t) { return isSym(t) ? vals[t] : t; }).join(''));
  }

  /** 문제에 나오는 기호 (A, B, C 순) */
  function symbols(q) {
    var out = [];
    q.rows.forEach(function (r) { r.forEach(function (t) { if (isSym(t) && out.indexOf(t) < 0) out.push(t); }); });
    return out.sort();
  }

  /** 맨 앞 자리에 오는 기호 — 0 이 될 수 없다 */
  function leads(q, s) {
    return q.rows.some(function (r) { return r[0] === s; });
  }

  /** 끝의 받침: ㉠·㉡·㉢ 은 모두 받침이 있다 (기역·니은·디귿) */
  function J(text, pair) {
    var last = String(text).slice(-1);
    var hard = /[㉠㉡㉢]/.test(last) || '013678'.indexOf(last) >= 0;
    return text + (hard ? pair.charAt(0) : pair.charAt(1));
  }

  // ------------------------------------------------------------------ 풀기

  /**
   * 일의 자리부터 자리마다 푼다. 자리마다 새 기호가 많아야 하나이고, 그 값이 하나로 정해져야 한다.
   * 돌려주는 값: {ok, vals, steps: [{col, terms, sumTok, carryIn, carryOut, total, sym, where, k, zeroOut, alt}]}
   *   where: 'add' (더하는 수 속 기호) | 'sum' (합 속 기호) | null (새 기호 없음 — 맞는지 확인만)
   *   zeroOut: 0 도 맞지만 맨 앞 자리라 뺀 경우의 「0일 때 합」
   *   alt: 받아올림을 잊었을 때 나오는 값 (실수 진단)
   */
  function solve(q) {
    var top = q.rows[0], bot = q.rows[1], sum = q.rows[2];
    var vals = {};
    var steps = [];
    var c = 0;
    for (var i = 0; i < 3; i++) {
      var last = i === 2;
      var terms = [top[2 - i], bot[2 - i]];
      var sumTok = sum[sum.length - 1 - i];
      // 마지막 자리는 합의 남은 앞부분 전체와 같아야 한다 (1000 이면 10)
      var head = last ? sum.slice(0, sum.length - 2) : [sumTok];
      var fresh = [];
      terms.concat(head).forEach(function (t) {
        if (isSym(t) && !(t in vals) && fresh.indexOf(t) < 0) fresh.push(t);
      });
      if (fresh.length > 1) return { ok: false };
      var step = { col: i, terms: terms, sumTok: sumTok, carryIn: c, sym: fresh[0] || null, where: null, k: 0, zeroOut: null, alt: null };
      var known = 0;
      terms.forEach(function (t) {
        if (isSym(t) && !(t in vals)) step.k++;
        else known += isSym(t) ? vals[t] : t;
      });
      if (step.sym && step.k > 0) {
        if (head.some(function (t) { return t === step.sym; })) return { ok: false };
        step.where = 'add';
        var target = last ? value(head, vals) : null;
        var cands = [];
        var cand0 = [];
        for (var x = 0; x <= 9; x++) {
          var lhs = step.k * x + known + c;
          var fits = last ? lhs === target : lhs % 10 === sumTok;
          if (!fits) continue;
          if (x === 0 && leads(q, step.sym)) { cand0.push(lhs); continue; }
          cands.push(x);
        }
        if (cands.length !== 1) return { ok: false };
        if (cand0.length) step.zeroOut = cand0[0];
        vals[step.sym] = cands[0];
        // 받아올림을 잊으면: c 없이 같은 셈
        if (c) {
          for (var y = 0; y <= 9; y++) {
            if ((step.k * y + known) % 10 === (last ? target % 10 : sumTok)) { step.alt = y; break; }
          }
        }
        step.reversed = step.k === 1 && known + c - (last ? target : sumTok) >= 0 ? known + c - (last ? target : sumTok) : null;
      } else if (step.sym) {
        step.where = 'sum';
        if (last && head.length !== 1) return { ok: false };
        var v = last ? known + c : (known + c) % 10;
        if (v > 9 || (v === 0 && leads(q, step.sym))) return { ok: false };
        vals[step.sym] = v;
        if (c) step.alt = last ? known : known % 10;
      }
      var tot = terms.reduce(function (t, x2) { return t + (isSym(x2) ? vals[x2] : x2); }, 0) + c;
      step.total = tot;
      if (last) {
        if (tot !== value(head, vals)) return { ok: false };
        step.carryOut = 0;
      } else {
        if (tot % 10 !== (isSym(sumTok) ? vals[sumTok] : sumTok)) return { ok: false };
        step.carryOut = Math.floor(tot / 10);
      }
      c = step.carryOut;
      steps.push(step);
    }
    return { ok: true, vals: vals, steps: steps };
  }

  /** 값을 넣었을 때 식이 맞는가. 뺄셈식은 rows[0] − rows[1] = rows[2] */
  function holds(q, vals) {
    var a = value(q.rows[0], vals), b = value(q.rows[1], vals), c = value(q.rows[2], vals);
    return q.op === '−' ? a - b === c : a + b === c;
  }

  /** 모든 값을 넣어 보고 맞는 답을 모두 찾는다 (검증용) */
  function bruteForce(q) {
    var syms = symbols(q);
    var out = [];
    var n = Math.pow(10, syms.length);
    for (var m = 0; m < n; m++) {
      var vals = {};
      var r = m;
      syms.forEach(function (s) { vals[s] = r % 10; r = Math.floor(r / 10); });
      if (syms.some(function (s) { return vals[s] === 0 && leads(q, s); })) continue;
      if (holds(q, vals)) out.push(vals);
    }
    return out;
  }

  // ------------------------------------------------------------------ 문제

  function finish(q, sol) {
    q.sol = sol;
    q.vals = sol.vals;
    q.syms = symbols(q);
    q.nums = q.rows.map(function (r) { return value(r, sol.vals); });
    q.total = q.syms.reduce(function (t, s) { return t + sol.vals[s]; }, 0);
    q.answer = {};
    if (q.kind === 'three') q.answer.total = q.total;
    else q.syms.forEach(function (s) { q.answer[s] = sol.vals[s]; });
    if (q.kind === 'guided' || q.kind === 'pguided') {
      sol.steps.forEach(function (st) { if (st.col < 2) q.answer['c' + st.col] = st.carryOut; });
      if (q.kind === 'guided') q.answer.total = q.total;
    }
    return q;
  }

  function build(kind, rows) {
    var q = { kind: kind, rows: rows };
    var sol = solve(q);
    return sol.ok ? finish(q, sol) : null;
  }

  /** 기호 셋: 더하는 두 수와 합에 기호가 한 자리씩, 자리는 서로 다르게 */
  function genThree(kind, rng) {
    for (;;) {
      var a = randInt(rng, 101, 898);
      var b = randInt(rng, 101, 999 - a);
      if (b < 100) continue;
      var s = a + b;
      var carries = (a % 10 + b % 10 >= 10 ? 1 : 0) + (Math.floor(a / 10) % 10 + Math.floor(b / 10) % 10 + (a % 10 + b % 10 >= 10 ? 1 : 0) >= 10 ? 1 : 0);
      if (carries === 0 && rng() < 0.8) continue;
      var perm = pick(rng, [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]]);
      var rows = [digits(a), digits(b), digits(s)];
      var used = [];
      ['A', 'B', 'C'].forEach(function (sym, r) {
        var at = 2 - perm[r];
        used.push(rows[r][at]);
        rows[r][at] = sym;
      });
      if (used[0] === used[1] || used[1] === used[2] || used[0] === used[2]) continue;
      var q = build(kind, rows);
      if (q) return q;
    }
  }

  /** 같은 기호: 두 수가 ㉠·㉡ 로만 되어 있고 합은 숫자 */
  function genPair(kind, rng) {
    for (;;) {
      var x = randInt(rng, 0, 9);
      var y = randInt(rng, 0, 9);
      if (x === y) continue;
      // 학습지처럼 기호로만 된 수가 반, 나머지는 숫자 칸이 섞인 수
      var mixDigits = rng() < 0.5;
      var pat = function () {
        return [0, 1, 2].map(function (i) {
          if (mixDigits && rng() < 0.3) return randInt(rng, i === 0 ? 1 : 0, 9);
          return rng() < 0.5 ? 'A' : 'B';
        });
      };
      var top = pat();
      var bot = pat();
      var all = top.concat(bot);
      if (all.indexOf('A') < 0 || all.indexOf('B') < 0) continue;
      if (!top.some(isSym) || !bot.some(isSym)) continue;
      var vals = { A: x, B: y };
      if ((isSym(top[0]) && vals[top[0]] === 0) || (isSym(bot[0]) && vals[bot[0]] === 0)) continue;
      var s = value(top, vals) + value(bot, vals);
      var q = build(kind, [top, bot, digits(s)]);
      if (q && bruteForce(q).length === 1) return q;
    }
  }

  // ------------------------------------------------------------------ 뺄셈식

  /**
   * 뺄셈식은 자리마다 한 기호씩 풀리지 않는다 (학습지 9: ㉠㉡㉠ − ㉡㉠㉡ = ㉡55 의 일의 자리는 ㉠ − ㉡).
   * 그래서 학습지 풀이처럼 일의 자리로 후보를 추리고, 하나씩 넣어 본다.
   * 후보: 일의 자리 끝자리가 맞고, 빼지는 수가 빼는 수보다 큰 (㉠, ㉡)
   */
  function subCandidates(q) {
    var out = [];
    for (var a = 0; a <= 9; a++) {
      for (var b = 0; b <= 9; b++) {
        if (a === b) continue;
        var vals = { A: a, B: b };
        if (q.syms.some(function (s) { return vals[s] === 0 && leads(q, s); })) continue;
        var top = value(q.rows[0], vals), bot = value(q.rows[1], vals);
        if (top <= bot) continue;
        var ones = function (r) { var t = r[r.length - 1]; return isSym(t) ? vals[t] : t; };
        if ((ones(q.rows[0]) - ones(q.rows[1]) + 10) % 10 !== ones(q.rows[2])) continue;
        out.push(vals);
      }
    }
    return out;
  }

  function buildSub(kind, rows) {
    var q = { kind: kind, op: '−', rows: rows };
    q.syms = symbols(q);
    var sols = bruteForce(q).filter(function (v) { return v.A !== v.B; });
    if (sols.length !== 1) return null;
    q.vals = sols[0];
    q.cands = subCandidates(q);
    if (q.cands.length < 2 || q.cands.length > 6) return null;
    q.nums = rows.map(function (r) { return value(r, q.vals); });
    q.total = q.vals.A + q.vals.B;
    q.answer = { A: q.vals.A, B: q.vals.B };
    return q;
  }

  /** 뺄셈식: 두 수는 ㉠·㉡ (숫자가 섞이기도), 차는 숫자인데 ㉠·㉡ 과 같은 숫자는 기호로 쓰기도 */
  function genSub(kind, rng) {
    for (;;) {
      var x = randInt(rng, 0, 9);
      var y = randInt(rng, 0, 9);
      if (x === y) continue;
      var mixDigits = rng() < 0.4;
      var pat = function () {
        return [0, 1, 2].map(function (i) {
          if (mixDigits && rng() < 0.3) return randInt(rng, i === 0 ? 1 : 0, 9);
          return rng() < 0.5 ? 'A' : 'B';
        });
      };
      var top = pat();
      var bot = pat();
      var all = top.concat(bot);
      if (all.indexOf('A') < 0 || all.indexOf('B') < 0) continue;
      if (!isSym(top[2]) && !isSym(bot[2])) continue;
      var vals = { A: x, B: y };
      var d = value(top, vals) - value(bot, vals);
      if (d < 100) continue;
      var diff = digits(d).map(function (t) {
        if (t === x && rng() < 0.6) return 'A';
        if (t === y && rng() < 0.6) return 'B';
        return t;
      });
      var q = buildSub(kind, [top, bot, diff]);
      if (q) return q;
    }
  }

  function worksheetSub() { return buildSub('sub', [['A', 'B', 'A'], ['B', 'A', 'B'], ['B', 5, 5]]); }

  function generate(kind, rng) {
    rng = rng || Math.random;
    if (kind === 'sub') return genSub(kind, rng);
    return kind === 'three' || kind === 'guided' ? genThree(kind, rng) : genPair(kind, rng);
  }

  function worksheetPair() { return build('pair', [['A', 'A', 'B'], ['B', 'B', 'B'], [1, 0, 0, 0]]); }
  function worksheetThree() { return build('three', [[5, 3, 'A'], [3, 'B', 7], ['C', 2, 3]]); }

  // ------------------------------------------------------------------ 글

  function questionText(q) {
    if (q.kind === 'sub') return '뺄셈식에서 같은 기호는 같은 수를 나타낼 때 ㉠과 ㉡에 알맞은 수를 각각 구해 보세요.';
    if (q.kind === 'three' || q.kind === 'guided') {
      return '세 자리 수 ' + J(show(q.rows[0]), '과와') + ' ' + show(q.rows[1]) + '의 합이 ' + show(q.rows[2]) + '일 때 ' +
        q.syms.map(function (s) { return SYM[s]; }).join(' + ') + '의 값은 얼마일까요?';
    }
    return '덧셈식에서 같은 기호는 같은 수를 나타냅니다. ' + q.syms.map(function (s) { return SYM[s]; }).join('과 ') +
      '에 알맞은 수를 각각 구해 보세요.';
  }

  /** 빈칸 줄. 글자는 문자열, 빈칸은 {input} */
  function lines(q) {
    var out = [];
    if (q.kind === 'guided' || q.kind === 'pguided') {
      out.push(['일의 자리부터 차례로 구해요. 받아올림을 잊지 마세요']);
      q.sol.steps.forEach(function (st) {
        var line = [COL[st.col] + ': '];
        if (st.sym) line.push(SYM[st.sym] + ' = ', { input: st.sym });
        if (st.col < 2) line.push({ input: 'c' + st.col, label: '받아올림' });
        if (line.length > 1) out.push(line);
      });
      if (q.kind === 'guided') out.push([q.syms.map(function (s) { return SYM[s]; }).join(' + ') + ' = ', { input: 'total' }]);
      return out;
    }
    if (q.kind === 'three') return [[q.syms.map(function (s) { return SYM[s]; }).join(' + ') + ' = ', { input: 'total' }]];
    return q.syms.map(function (s) { return [SYM[s] + ' = ', { input: s }]; });
  }

  function inputKeys(q) {
    return [].concat.apply([], lines(q)).filter(function (t) { return typeof t !== 'string'; }).map(function (t) { return t.input; });
  }

  /** 자리 하나의 식: 새 기호는 기호로, 아는 기호는 값으로 */
  function columnExpr(q, st) {
    var parts = st.terms.map(function (t) {
      if (!isSym(t)) return String(t);
      return t === st.sym && st.where === 'add' ? SYM[t] : String(q.vals[t]);
    });
    if (st.carryIn) parts.push(String(st.carryIn));
    return parts.join(' + ');
  }

  /** 풀이 줄 */
  function solutionLines(q) {
    if (q.kind === 'sub') return subLines(q);
    var out = q.sol.steps.map(function (st) {
      var line = COL[st.col] + ': ' + columnExpr(q, st) + ' = ' + st.total;
      if (st.sym) line += ' → ' + SYM[st.sym] + ' = ' + q.vals[st.sym];
      else line += ' ✓';
      if (st.carryOut) line += ', 받아올림 ' + st.carryOut;
      if (st.zeroOut !== null) {
        var d = st.zeroOut % 10;
        line += ' (' + SYM[st.sym] + ' = 0이어도 끝자리가 ' + d + ('013678'.indexOf(String(d)) >= 0 ? '이' : '') + '지만, ' +
          SYM[st.sym] + '은 맨 앞 자리라 0이 될 수 없어요)';
      }
      return line;
    });
    var eqLine = q.nums[0] + ' + ' + q.nums[1] + ' = ' + q.nums[2];
    if (q.kind === 'three' || q.kind === 'guided') {
      eqLine += ' → ' + q.syms.map(function (s) { return SYM[s]; }).join(' + ') + ' = ' +
        q.syms.map(function (s) { return q.vals[s]; }).join(' + ') + ' = ' + q.total;
    }
    out.push(eqLine);
    return out;
  }

  /** 뺄셈식 풀이: 일의 자리로 후보를 추리고 하나씩 넣어 보기 */
  function subLines(q) {
    var o = function (r) { var t = r[r.length - 1]; return isSym(t) ? SYM[t] : String(t); };
    var pair = function (v) { return '(' + v.A + ', ' + v.B + ')'; };
    var out = [
      '일의 자리: ' + o(q.rows[0]) + ' − ' + o(q.rows[1]) + '의 끝자리가 ' + o(q.rows[2]) +
        '이고 빼지는 수가 더 커야 해요 → (㉠, ㉡) = ' + q.cands.map(pair).join(', ')
    ];
    var hasSym = q.rows[2].some(isSym);
    q.cands.forEach(function (v) {
      var a = value(q.rows[0], v), b = value(q.rows[1], v), c = value(q.rows[2], v);
      var line = pair(v) + ': ' + a + ' − ' + b + ' = ' + (a - b);
      if (a - b === c) line += ' ✓';
      else line += ' ≠ ' + (hasSym ? show(q.rows[2]) + '(' + c + ')' : String(c)) + ' ✗';
      out.push(line);
    });
    out.push('㉠ = ' + q.vals.A + ', ㉡ = ' + q.vals.B + ' → ' + q.nums[0] + ' − ' + q.nums[1] + ' = ' + q.nums[2]);
    return out;
  }

  /** 정답 글: '㉠ = 4, ㉡ = 5' 또는 '23' */
  function answerText(q) {
    if (q.kind === 'three') return String(q.total);
    var s = q.syms.map(function (x) { return SYM[x] + ' = ' + q.vals[x]; }).join(', ');
    return q.kind === 'guided' ? s + ' → 합 ' + q.total : s;
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

  /** 기호 칸의 자리 (풀이 순서대로 채점하려고) */
  function stepOf(q, sym) {
    return q.sol.steps.filter(function (st) { return st.sym === sym; })[0];
  }

  /**
   * 채점. value 는 빈칸 키 → 수.
   * 돌려주는 값: {correct, ok: {키: 맞았나}, mistake, step}
   *   forgotCarry (받아올림을 안 더함), reversed (㉠ + 7 = 3 을 7 − 3 으로), leadingZero (맨 앞 자리 기호에 0),
   *   swapped (㉠·㉡ 을 바꿔 씀), carry (받아올림 칸), gaveSum (합의 수를 그대로), calc (덧셈 실수), null (그 밖)
   */
  function grade(q, value) {
    var ok = {};
    var keys = inputKeys(q);
    keys.forEach(function (k) { ok[k] = value[k] === q.answer[k]; });
    if (keys.every(function (k) { return ok[k]; })) return { correct: true, ok: ok, mistake: null };

    // 풀이 순서: 일의 자리부터 기호와 받아올림, 마지막에 합
    var order = [];
    if (q.sol) q.sol.steps.forEach(function (st) {
      if (st.sym && keys.indexOf(st.sym) >= 0) order.push(st.sym);
      if (keys.indexOf('c' + st.col) >= 0) order.push('c' + st.col);
    });
    if (keys.indexOf('total') >= 0) order.push('total');
    if (q.kind === 'sub') {
      var sw = value.A === q.vals.B && value.B === q.vals.A;
      var onesOnly = q.cands.some(function (v) { return v.A === value.A && v.B === value.B; });
      return { correct: false, ok: ok, mistake: sw ? 'swapped' : onesOnly ? 'onesOnly' : null, step: ok.A ? 'B' : 'A' };
    }
    var step = order.filter(function (k) { return !ok[k]; })[0];
    var v = value[step];
    var mistake = null;

    if (q.syms.length === 2 && value.A === q.vals.B && value.B === q.vals.A) {
      mistake = 'swapped';
    } else if (step === 'total') {
      var alt = 0;
      var anyAlt = false;
      q.sol.steps.forEach(function (st) {
        if (!st.sym) return;
        if (st.alt !== null) { alt += st.alt; anyAlt = true; } else alt += q.vals[st.sym];
      });
      if (v === q.nums[2]) mistake = 'gaveSum';
      else if (anyAlt && v === alt) mistake = 'forgotCarry';
      else if (Math.abs(v - q.total) === 1 || Math.abs(v - q.total) === 10) mistake = 'calc';
    } else if (step.charAt(0) === 'c') {
      mistake = 'carry';
    } else {
      var st = stepOf(q, step);
      if (st.alt !== null && v === st.alt) mistake = 'forgotCarry';
      else if (st.zeroOut !== null && v === 0) mistake = 'leadingZero';
      else if (st.reversed !== null && st.reversed !== undefined && v === st.reversed) mistake = 'reversed';
    }
    return { correct: false, ok: ok, mistake: mistake, step: step };
  }

  return {
    KINDS: KINDS,
    SYM: SYM,
    COL: COL,
    J: J,
    mulberry32: mulberry32,
    show: show,
    value: value,
    symbols: symbols,
    solve: solve,
    bruteForce: bruteForce,
    build: build,
    generate: generate,
    worksheetPair: worksheetPair,
    worksheetThree: worksheetThree,
    worksheetSub: worksheetSub,
    questionText: questionText,
    lines: lines,
    inputKeys: inputKeys,
    solutionLines: solutionLines,
    answerText: answerText,
    parseNum: parseNum,
    grade: grade
  };
});
