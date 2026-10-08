/* 쌓기나무 규칙 찾기 게임 */
(function () {
  'use strict';

  var S = window.Stack;
  var STORE_KEY = 'stack-game/v1';
  var CHALLENGE_SECONDS = 60;
  var UNLOCK_STREAK = 3;   // 한 단계에서 이만큼 연속으로 맞히면 다음 단계가 열린다
  var SVG_NS = 'http://www.w3.org/2000/svg';

  var STAGES = [
    { id: 'layers', label: '층별로 세기', hint: '위층부터 한 층씩 세어 식 완성하기 — 가려진 쌓기나무도 세요' },
    { id: 'grow', label: '늘어나는 수', hint: '앞 모양보다 몇 개 많은지 — 새로 깔린 층 찾기' },
    { id: 'next', label: '다음 모양', hint: '개수가 늘어나는 규칙으로 다음 모양의 개수 구하기' },
    { id: 'nth', label: '몇째 모양', hint: '규칙을 식으로 써서 멀리 있는 모양의 개수 구하기' },
    { id: 'mix', label: '혼합', hint: '모든 문제 무작위 — 실전 연습' }
  ];

  // 문제 종류마다 기본 점수. 여기에 연속 보너스가 붙는다.
  var POINTS = { layers: 14, grow: 12, next: 12, nth: 18 };

  // 쌓기나무 색: 앞면·윗면·옆면
  var WOOD = ['#e8c28a', '#f6dfb4', '#c9975a'];
  var NEW_LAYER = ['#ffc94d', '#ffe39a', '#dfa21f'];
  var LAYER_HUES = [350, 205, 135, 52, 268, 175, 18, 315, 95, 235];   // 나무색(주황)과 헷갈리는 색은 뒤로

  var state = {
    mode: 'practice',
    stageId: STAGES[0].id,
    unlocked: 0,          // 열려 있는 마지막 단계의 STAGES 인덱스
    sound: true,
    best: { streak: 0, challenge: 0 },
    phase: 'answer',      // answer | reveal | over
    q: null,
    lastSig: null,
    hint: false,
    score: 0,
    streak: 0,
    asked: 0,
    correct: 0,
    endsAt: 0,
    timerId: null
  };

  var el = {};
  var layerInputs = [];   // 층별로 세기의 칸들. 마지막이 합계

  // 터치 화면에서는 입력칸에 바로 초점을 주지 않는다. 자판이 올라와 그림을 가린다.
  var coarsePointer = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);

  // ------------------------------------------------------------------ 저장

  function loadPrefs() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      var saved = JSON.parse(raw);
      ['mode', 'stageId', 'sound'].forEach(function (k) {
        if (saved[k] !== undefined) state[k] = saved[k];
      });
      if (saved.best) {
        state.best.streak = saved.best.streak || 0;
        state.best.challenge = saved.best.challenge || 0;
      }
      state.unlocked = Math.max(0, Math.min(STAGES.length - 1, saved.unlocked | 0));
      if (!STAGES.some(function (s) { return s.id === state.stageId; })) state.stageId = STAGES[0].id;
      // 아직 잠긴 단계가 저장돼 있으면 열려 있는 마지막 단계로 되돌린다.
      if (stageIndex(state.stageId) > state.unlocked) state.stageId = STAGES[state.unlocked].id;
      if (state.mode !== 'practice' && state.mode !== 'challenge') state.mode = 'practice';
    } catch (e) { /* 저장값이 깨졌으면 기본값으로 시작한다 */ }
  }

  function savePrefs() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        mode: state.mode, stageId: state.stageId, unlocked: state.unlocked,
        sound: state.sound, best: state.best
      }));
    } catch (e) { /* 사파리 프라이빗 모드 등 — 저장 못 해도 진행 */ }
  }

  // ------------------------------------------------------------------ 소리

  var audioCtx = null;

  function beep(kind) {
    if (!state.sound) return;
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      audioCtx = audioCtx || new Ctx();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      var freqs = kind === 'good' ? [659.25, 987.77]
        : kind === 'bad' ? [233.08, 185.00]
          : kind === 'unlock' ? [523.25, 659.25, 783.99, 1046.50]
            : [523.25];
      var now = audioCtx.currentTime;
      freqs.forEach(function (f, i) {
        var at = now + i * 0.085;
        var osc = audioCtx.createOscillator();
        var gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = f;
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(0.12, at + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.18);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(at);
        osc.stop(at + 0.2);
      });
    } catch (e) { /* 소리는 부가 기능 */ }
  }

  // ------------------------------------------------------------------ 단계

  function stageIndex(id) {
    for (var i = 0; i < STAGES.length; i++) if (STAGES[i].id === id) return i;
    return 0;
  }

  /** 단계 설명 + 다음 단계 해금까지 남은 연속 정답 수 */
  function stageHintText() {
    var idx = stageIndex(state.stageId);
    var text = STAGES[idx].hint;
    if (idx + 1 >= STAGES.length) return text + ' · 마지막 단계';
    if (idx + 1 > state.unlocked) {
      return text + ' · 연속 ' + Math.min(state.streak, UNLOCK_STREAK) + '/' + UNLOCK_STREAK +
        ' → 「' + STAGES[idx + 1].label + '」 해금';
    }
    return text + ' · 「' + STAGES[idx + 1].label + '」 열림';
  }

  function kindForStage() {
    if (state.stageId !== 'mix') return state.stageId;
    return S.KINDS[Math.floor(Math.random() * S.KINDS.length)];
  }

  function signature(q) {
    return q.kind + ':' + q.family + ':' + q.n;
  }

  function nextQuestion() {
    var q = S.generate(kindForStage());
    // 같은 문제가 연달아 나오면 한 번 더 뽑는다.
    if (signature(q) === state.lastSig) q = S.generate(q.kind);
    state.lastSig = signature(q);
    return q;
  }

  // ------------------------------------------------------------------ 그림

  function svgEl(tag, attrs, parent) {
    var node = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    if (parent) parent.appendChild(node);
    return node;
  }

  function r2(n) { return Math.round(n * 100) / 100; }

  function textAt(x, y, text, cls, parent) {
    var t = svgEl('text', { x: r2(x), y: r2(y), 'class': cls }, parent);
    t.textContent = text;
    return t;
  }

  /** 위에서 k째 층의 색 (앞면·윗면·옆면) */
  function layerColors(k) {
    var h = LAYER_HUES[(k - 1) % LAYER_HUES.length];
    return ['hsl(' + h + ' 72% 68%)', 'hsl(' + h + ' 80% 82%)', 'hsl(' + h + ' 52% 53%)'];
  }

  /**
   * 쌓기나무 모양 하나. (ox, oy) 는 바닥 앞 왼쪽 모서리, s 는 쌓기나무 한 변의 길이.
   * paint(cube) 는 [앞면, 윗면, 옆면] 색을 돌려준다.
   */
  function drawStack(parent, family, n, ox, oy, s, paint) {
    var g = svgEl('g', { 'class': 'stack' }, parent);
    S.cubes(family, n).forEach(function (c) {
      var colors = paint ? paint(c) : WOOD;
      var cg = svgEl('g', { 'class': 'cube' }, g);
      ['front', 'top', 'right'].forEach(function (face, i) {
        var d = c.faces[face].map(function (p, j) {
          return (j ? 'L' : 'M') + r2(ox + p.x * s) + ' ' + r2(oy + p.y * s);
        }).join(' ') + 'Z';
        svgEl('path', { d: d, fill: colors[i] }, cg);
      });
    });
    return g;
  }

  var ROW = { maxW: 520, maxH: 230, pad: 10, gap: 0.9, name: 20, count: 42 };

  /**
   * 그림 한 줄. items: {family, n, name, count, countCls, paint} | {slot, name, count} | {dots} | {arrow}
   * 모든 모양을 같은 크기로 그리고 바닥을 맞춘다.
   */
  function drawRow(items, maxUnit) {
    var withCount = items.some(function (it) { return it.count !== undefined; });
    var withName = items.some(function (it) { return it.name; });
    var below = (withName ? ROW.name : 0) + (withCount ? ROW.count - ROW.name : 0) + (withName || withCount ? 10 : 0);

    var units = items.map(function (it) {
      if (it.dots) return { w: 1.4, h: 1 };
      if (it.arrow) return { w: 1.6, h: 1 };
      if (it.slot) return { w: 2.4, h: 2.4 };
      var b = S.bounds(it.family, it.n);
      return { w: b.w, h: b.h };
    });
    var sumW = units.reduce(function (a, u) { return a + u.w; }, 0) + ROW.gap * (items.length - 1);
    var maxH = Math.max.apply(null, units.map(function (u) { return u.h; }));
    var s = Math.min(maxUnit, (ROW.maxW - 2 * ROW.pad) / sumW, ROW.maxH / maxH);

    var W = sumW * s + 2 * ROW.pad;
    var H = maxH * s + below + 2 * ROW.pad;
    var svg = svgEl('svg', { viewBox: '0 0 ' + r2(W) + ' ' + r2(H), 'class': 'fig', role: 'img' });
    svg.style.maxWidth = Math.round(W) + 'px';
    var base = ROW.pad + maxH * s;      // 바닥 선
    var x = ROW.pad;
    var labels = [];

    items.forEach(function (it, i) {
      var u = units[i];
      var cx = x + u.w * s / 2;
      if (it.dots) {
        textAt(cx, base - s * 0.5, '……', 'fig-dots', svg);
      } else if (it.arrow) {
        var y = base - maxH * s / 2;
        var x0 = x + 0.25 * s;
        var x1 = x + (u.w - 0.25) * s;
        svgEl('path', { d: 'M' + r2(x0) + ' ' + r2(y) + ' H' + r2(x1) + ' M' + r2(x1 - 8) + ' ' + r2(y - 7) +
          ' L' + r2(x1) + ' ' + r2(y) + ' L' + r2(x1 - 8) + ' ' + r2(y + 7), 'class': 'fig-arrow' }, svg);
      } else if (it.slot) {
        var side = Math.min(u.w * s, maxH * s, 2.4 * s);
        svgEl('rect', { x: r2(cx - side / 2), y: r2(base - side), width: r2(side), height: r2(side), rx: 10, 'class': 'fig-slot' }, svg);
        textAt(cx, base - side / 2, '?', 'fig-slot-q', svg);
      } else {
        drawStack(svg, it.family, it.n, x, base, s, it.paint);
        // 이름은 바닥 앞줄 가운데 아래에 둔다. 비껴 그린 뒷부분까지 넣어 가운데를 잡으면 오른쪽으로 쏠려 보인다.
        cx = x + it.n * s / 2;
      }
      if (it.name) labels.push(textAt(cx, base + 6 + ROW.name / 2, it.name, 'fig-name', svg));
      if (it.count !== undefined) {
        labels.push(textAt(cx, base + 6 + ROW.name + 12, String(it.count), 'fig-count' + (it.countCls ? ' ' + it.countCls : ''), svg));
      }
      x += u.w * s + ROW.gap * s;
    });
    svg.setAttribute('aria-label', items.filter(function (it) { return it.name; }).map(function (it) {
      return it.name + (it.count !== undefined ? ' ' + it.count + '개' : '');
    }).join(', '));
    return svg;
  }

  function stackItem(q, n, extra) {
    var it = { family: q.family, n: n, name: S.ordinal(n) };
    Object.keys(extra || {}).forEach(function (k) { it[k] = extra[k]; });
    return it;
  }

  /** 층마다 색을 칠하는 paint */
  function paintLayers(c) { return layerColors(c.layer); }

  /** n째 모양에서 맨 아래층(새로 깔린 층)만 칠하는 paint */
  function paintNewLayer(n) {
    return function (c) { return c.layer === n ? NEW_LAYER : WOOD; };
  }

  function drawQuestion(q, reveal) {
    var items;
    var maxUnit = 40;
    if (q.kind === 'layers') {
      items = [{ family: q.family, n: q.n, paint: reveal || state.hint ? paintLayers : null }];
      maxUnit = 54;
    } else if (q.kind === 'grow') {
      items = [
        stackItem(q, q.n - 1, reveal ? { count: S.total(q.family, q.n - 1) } : {}),
        { arrow: true },
        stackItem(q, q.n, {
          paint: reveal || state.hint ? paintNewLayer(q.n) : null,
          count: reveal ? q.total : undefined
        })
      ];
    } else if (q.kind === 'next') {
      items = q.shown.map(function (n) { return stackItem(q, n, { count: S.total(q.family, n) }); });
      items.push(reveal
        ? stackItem(q, q.n, { count: q.answer, countCls: 'is-answer', paint: paintNewLayer(q.n) })
        : { slot: true, name: S.ordinal(q.n), count: '?', countCls: 'is-unknown' });
    } else {
      items = q.shown.map(function (n) {
        return stackItem(q, n, reveal ? { count: S.total(q.family, n) } : {});
      });
      items.push({ dots: true });
      items.push({ slot: true, name: S.ordinal(q.n), count: reveal ? q.answer : '?', countCls: reveal ? 'is-answer' : 'is-unknown' });
    }
    el.figure.innerHTML = '';
    el.figure.appendChild(drawRow(items, maxUnit));
    renderLegend(q, reveal);
  }

  /** 층마다 색과 개수를 칩으로. 층별로 세기의 힌트·풀이에서만 */
  function renderLegend(q, reveal) {
    el.legend.innerHTML = '';
    var show = q.kind === 'layers' && (reveal || state.hint);
    el.legend.hidden = !show;
    if (!show) return;
    q.layers.forEach(function (v, i) {
      var chip = document.createElement('span');
      var sw = document.createElement('i');
      sw.style.background = layerColors(i + 1)[0];
      chip.appendChild(sw);
      chip.appendChild(document.createTextNode('위에서 ' + (i + 1) + '층' + (reveal ? ' · ' + layerDesc(q.family, i + 1) + '개' : '')));
      el.legend.appendChild(chip);
    });
  }

  /** 위에서 k째 층을 세는 식: 피라미드 3×3 = 9, 모서리 계단 1 + 2 + 3 = 6 */
  function layerDesc(family, k) {
    var v = S.layerCount(family, k);
    if (k === 1) return String(v);
    if (family === 'pyramid') return k + '×' + k + ' = ' + v;
    if (family === 'corner') {
      var parts = [];
      for (var i = 1; i <= k; i++) parts.push(i);
      return (k > 4 ? '1 + 2 + … + ' + k : parts.join(' + ')) + ' = ' + v;
    }
    return String(v);
  }

  function layerShape(family) {
    if (family === 'pyramid') return '층마다 정사각형이에요 — 위에서부터 1×1, 2×2, 3×3, …';
    if (family === 'stairs') return '위에서부터 한 층에 1개, 2개, 3개, … 씩 놓였어요';
    return '층마다 작은 계단 모양이에요 — 위에서부터 1, 1+2, 1+2+3, …';
  }

  // ------------------------------------------------------------------ 글

  function promptFor(q) {
    if (q.kind === 'layers') return '쌓기나무를 위층부터 한 층씩 세어 식을 완성해 보세요';
    if (q.kind === 'grow') {
      return S.ordinal(q.n - 1) + ' 모양이 ' + S.ordinal(q.n) + ' 모양이 되면 쌓기나무가 몇 개 늘어날까요?';
    }
    if (q.kind === 'next') return '규칙을 찾아 ' + S.ordinal(q.n) + ' 모양의 쌓기나무 수를 구해 보세요';
    return '규칙에 따라 쌓기나무를 쌓았어요. ' + S.ordinal(q.n) + ' 모양의 쌓기나무는 모두 몇 개일까요?';
  }

  function hintFor(q) {
    var f = q.family;
    if (q.kind === 'layers') {
      return '층마다 색을 칠했어요. ' + layerShape(f) + '. 뒤쪽과 위층 밑에 가려진 쌓기나무도 세요.';
    }
    if (q.kind === 'grow') {
      return '노란색이 새로 깔린 맨 아래층이에요. 위쪽은 ' + S.ordinal(q.n - 1) +
        ' 모양과 똑같아요. 맨 아래층은 ' + layerDesc(f, q.n) .replace(/ = \d+$/, '') + '개예요.';
    }
    var a = Math.max(1, q.n - 3);
    var lines = [];
    for (var n = a; n <= Math.min(a + 1, q.n - 1); n++) {
      lines.push(S.ordinal(n) + ': ' + (n === 1 ? '1' : S.equation(f, n)));
    }
    return '모양마다 층별로 세어 식으로 써 보세요. ' + lines.join(' · ') +
      ' … 다음 모양은 맨 아래에 한 층이 더 깔려요.';
  }

  function tipFor(q, value, res) {
    var f = q.family;
    var eqn = S.equation(f, q.n);
    switch (res.mistake) {
      case 'running': {
        var running = S.runningTotals(q.layers);
        var i = 0;
        while (i < q.layers.length && !(value.layers[i] === running[i] && running[i] !== q.layers[i])) i++;
        return {
          head: '층마다 놓인 개수를 써요.',
          body: running[i] + S.topicParticle(running[i]) + ' ' + S.ordinal(i + 1) + ' 모양 전체의 개수예요. 위에서 ' + (i + 1) +
            '층에는 ' + layerDesc(f, i + 1) + '개만 놓여 있어요.'
        };
      }
      case 'visible':
        return { head: '가려진 쌓기나무도 세요.', body: '뒤쪽과 위층 밑에 안 보이는 쌓기나무가 있어요. ' + layerShape(f) + '.' };
      case 'sumSlip':
        return { head: '층별 개수는 모두 맞았어요.', body: '더하기를 다시 해 보세요: ' + eqn };
      case 'whole':
        return {
          head: '늘어난 수만 세요.',
          body: q.total + S.topicParticle(q.total) + ' ' + S.ordinal(q.n) + ' 모양 전체의 개수예요. 앞 모양 밑에 맨 아래층 ' +
            S.growth(f, q.n) + '개가 새로 깔렸어요.'
        };
      case 'bottom':
        return {
          head: '맨 아래층만 셌어요.',
          body: (f === 'stairs' ? '' : '겉에서 보이는 것만 세어도 이 수가 나와요. ') +
            S.ordinal(q.n) + ' 모양은 ' + q.n + '층이에요. 위층까지 모두 더해요: ' + eqn
        };
      case 'linear': {
        var lastStep = S.growth(f, q.n - 1);
        return {
          head: '늘어나는 수도 커져요.',
          body: '마지막에 늘어난 ' + lastStep + '개를 한 번 더 더하면 안 돼요. 새로 깔리는 층이 매번 더 커져서 ' +
            S.growth(f, q.n) + '개가 늘어나요.'
        };
      }
      case 'offByOne': {
        if (q.kind === 'grow') {
          return {
            head: '새로 깔리는 층은 ' + S.ordinal(q.n) + ' 모양의 맨 아래층이에요.',
            body: value + S.topicParticle(value) + ' 한 단계 앞에서 늘어난 수예요. 이번에는 ' + layerDesc(f, q.n) + '개가 늘어요.'
          };
        }
        var m = S.total(f, q.n - 1) === value ? q.n - 1 : q.n + 1;
        return { head: '몇째 모양인지 다시 세어 보세요.', body: value + S.topicParticle(value) + ' ' + S.ordinal(m) + ' 모양의 개수예요.' };
      }
      default:
        if (q.kind === 'layers') return { head: '위층부터 한 층씩 세어요.', body: layerShape(f) + '.' };
        if (q.kind === 'grow') return { head: '새로 깔린 맨 아래층을 세어요.', body: '위쪽은 앞 모양과 똑같아요.' };
        return { head: '위층부터 한 층씩 더해요.', body: eqn };
    }
  }

  function answerLine(q) {
    var line = document.createElement('div');
    line.className = 'answer-line';
    function t(s) { line.appendChild(document.createTextNode(s)); }
    function b(s, cls) {
      var node = document.createElement('b');
      if (cls) node.className = cls;
      node.textContent = s;
      line.appendChild(node);
    }
    if (q.kind === 'grow') {
      t(S.total(q.family, q.n) + ' − ' + S.total(q.family, q.n - 1) + ' = ');
      b(String(q.answer), 'is-new');
      t('개 늘어요 · 새로 깔린 맨 아래층 ' + layerDesc(q.family, q.n) + '개');
      return line;
    }
    q.layers.forEach(function (v, i) {
      if (i) t(' + ');
      b(String(v), q.kind !== 'layers' && i === q.layers.length - 1 ? 'is-new' : '');
    });
    t(' = ');
    b(String(q.answer));
    t('개');
    return line;
  }

  /** 개수와 늘어난 수를 줄 세운 표. 다음 모양·몇째 모양의 풀이 */
  function sequenceTable(q) {
    var wrap = document.createElement('div');
    wrap.className = 'seq';
    var table = document.createElement('table');
    var rows = [['모양', 'name'], ['개수', 'count'], ['늘어난 수', 'diff']];
    rows.forEach(function (r) {
      var tr = document.createElement('tr');
      tr.className = r[1];
      var th = document.createElement('th');
      th.textContent = r[0];
      tr.appendChild(th);
      for (var n = 1; n <= q.n; n++) {
        var td = document.createElement('td');
        if (r[1] === 'name') td.textContent = S.ordinal(n);
        else if (r[1] === 'count') td.textContent = String(S.total(q.family, n));
        else td.textContent = n === 1 ? '' : '+' + S.growth(q.family, n);
        if (n === q.n && r[1] !== 'diff') td.className = 'is-asked';
        tr.appendChild(td);
      }
      table.appendChild(tr);
    });
    wrap.appendChild(table);
    return wrap;
  }

  // ------------------------------------------------------------------ 화면

  function renderStages() {
    el.levelGroup.innerHTML = '';
    STAGES.forEach(function (st) {
      var b = document.createElement('button');
      b.type = 'button';
      b.dataset.stage = st.id;
      el.levelGroup.appendChild(b);
    });
    syncStages();
  }

  function syncStages() {
    Array.prototype.forEach.call(el.levelGroup.children, function (b, i) {
      var locked = i > state.unlocked;
      b.disabled = locked;
      b.textContent = (locked ? '🔒 ' : '') + STAGES[i].label;
      b.setAttribute('aria-pressed', String(STAGES[i].id === state.stageId));
      b.title = locked
        ? '「' + STAGES[i - 1].label + '」 단계에서 ' + UNLOCK_STREAK + '연속 정답이면 열려요'
        : STAGES[i].hint;
    });
    el.levelHint.textContent = stageHintText();
  }

  function syncToggles() {
    Array.prototype.forEach.call(el.modeGroup.children, function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.mode === state.mode));
    });
    syncStages();
    el.btnSound.setAttribute('aria-pressed', String(state.sound));
    el.btnSound.textContent = state.sound ? '🔊' : '🔇';
  }

  function renderStats() {
    el.statScore.textContent = String(state.score);
    el.statStreak.textContent = state.streak > 0 ? state.streak + ' 🔥' : '0';
    el.statAccuracy.textContent = state.asked
      ? Math.round((state.correct / state.asked) * 100) + '%'
      : '—';
    el.levelHint.textContent = stageHintText();   // 해금까지 남은 연속 정답 수도 여기서 갱신

    if (state.mode === 'challenge') {
      var left = state.phase === 'over' ? 0 : Math.max(0, Math.ceil((state.endsAt - Date.now()) / 1000));
      el.statRightLabel.textContent = '남은 시간';
      el.statRight.textContent = left + '초';
      el.statRightTile.classList.toggle('is-low', left <= 10);
    } else {
      el.statRightLabel.textContent = '최고 연속';
      el.statRight.textContent = String(state.best.streak);
      el.statRightTile.classList.remove('is-low');
    }
  }

  function setMsg(field, msgEl, cls, msg) {
    field.classList.remove('is-good', 'is-bad');
    if (cls) field.classList.add(cls);
    msgEl.textContent = msg || '';
  }

  /** 「□ + □ + □ = □」 칸 만들기 */
  function buildLayerRow(q) {
    el.layerRow.innerHTML = '';
    layerInputs = [];
    for (var i = 0; i <= q.n; i++) {
      var isTotal = i === q.n;
      if (i) {
        var op = document.createElement('span');
        op.className = 'op';
        op.textContent = isTotal ? '=' : '+';
        op.setAttribute('aria-hidden', 'true');
        el.layerRow.appendChild(op);
      }
      var input = document.createElement('input');
      input.type = 'text';
      input.inputMode = 'numeric';
      input.maxLength = 4;
      input.spellcheck = false;
      input.setAttribute('aria-label', isTotal ? '모두 더한 수' : '위에서 ' + (i + 1) + '층의 개수');
      if (isTotal) input.className = 'is-total';
      el.layerRow.appendChild(input);
      layerInputs.push(input);
    }
  }

  function renderQuestion() {
    var q = state.q;
    state.hint = false;
    el.prompt.textContent = promptFor(q);
    drawQuestion(q, false);

    var isLayers = q.kind === 'layers';
    el.fieldLayers.hidden = !isLayers;
    el.fieldCount.hidden = isLayers;
    if (isLayers) {
      buildLayerRow(q);
      setMsg(el.fieldLayers, el.msgLayers, null, '');
    } else {
      el.inputCount.value = '';
      el.inputCount.disabled = false;
      el.labelCount.textContent = q.kind === 'grow' ? '늘어나는 쌓기나무 수' : S.ordinal(q.n) + ' 모양의 쌓기나무 수';
      setMsg(el.fieldCount, el.msgCount, null, '');
    }

    el.hintText.hidden = true;
    el.feedback.hidden = true;
    el.feedback.innerHTML = '';
    el.btnSubmit.textContent = '확인';
    el.btnHint.disabled = false;
    el.btnHint.setAttribute('aria-pressed', 'false');
    el.btnSkip.disabled = false;
    state.phase = 'answer';
    focusAnswer();
  }

  function focusAnswer() {
    if (coarsePointer) return;
    var target = state.q.kind === 'layers'
      ? layerInputs.filter(function (i) { return !i.value; })[0] || layerInputs[0]
      : el.inputCount;
    target.focus({ preventScroll: true });
  }

  function renderFeedback(q, value, res, gained, unlockedStage) {
    var fb = el.feedback;
    fb.innerHTML = '';

    var verdict = document.createElement('div');
    verdict.className = 'verdict ' + (res.correct ? 'good' : 'bad');
    verdict.appendChild(document.createTextNode(
      res.correct ? '정답이에요! 🎉' : value === null ? '정답을 확인해 보세요' : '아쉬워요'));
    if (res.correct && gained > 0) {
      var delta = document.createElement('span');
      delta.className = 'score-delta';
      delta.textContent = '+' + gained + '점';
      verdict.appendChild(delta);
    }
    fb.appendChild(verdict);

    if (unlockedStage) {
      var unlock = document.createElement('div');
      unlock.className = 'unlock';
      unlock.textContent = '🔓 ' + UNLOCK_STREAK + '연속 정답! 「' + unlockedStage.label + '」 단계가 열렸어요.';
      fb.appendChild(unlock);
    }

    fb.appendChild(answerLine(q));
    if (q.kind === 'next' || q.kind === 'nth') fb.appendChild(sequenceTable(q));

    if (!res.correct && value !== null) {
      var t = tipFor(q, value, res);
      var tip = document.createElement('div');
      tip.className = 'tip';
      var head = document.createElement('b');
      head.textContent = t.head;
      tip.appendChild(head);
      tip.appendChild(document.createTextNode(' ' + t.body));
      fb.appendChild(tip);
    }
    fb.hidden = false;
  }

  // ------------------------------------------------------------------ 진행

  function newQuestion() {
    state.q = nextQuestion();
    el.result.hidden = true;
    el.form.hidden = false;
    el.figure.hidden = false;
    el.prompt.hidden = false;
    renderQuestion();
    renderStats();
  }

  /** 입력을 읽는다. 빈칸이나 숫자 아닌 칸이 있으면 알려 주고 null */
  function readAnswer() {
    var q = state.q;
    if (q.kind !== 'layers') {
      var p = S.parseCount(el.inputCount.value);
      if (p.error) {
        setMsg(el.fieldCount, el.msgCount, 'is-bad', p.error === 'empty' ? '개수를 입력해 주세요.' : '숫자로 써 주세요. 예: 30');
        el.inputCount.focus();
        return null;
      }
      return p.value;
    }
    var values = [];
    for (var i = 0; i < layerInputs.length; i++) {
      var r = S.parseCount(layerInputs[i].value);
      if (r.error) {
        setMsg(el.fieldLayers, el.msgLayers, 'is-bad', r.error === 'empty' ? '빈칸을 모두 채워 주세요.' : '숫자로 써 주세요.');
        layerInputs[i].focus();
        return null;
      }
      values.push(r.value);
    }
    return { layers: values.slice(0, -1), total: values[values.length - 1] };
  }

  function trySubmit() {
    var value = readAnswer();
    if (value !== null) submitAnswer(value);
  }

  /** 채점하고 풀이를 보여 준다. value 가 null 이면 '모르겠어요'. */
  function submitAnswer(value) {
    if (state.phase !== 'answer') return;
    var q = state.q;
    var res = value === null ? { correct: false, mistake: null } : S.grade(q, value);

    state.asked++;
    var gained = 0;
    var unlockedStage = null;
    if (res.correct) {
      state.correct++;
      state.streak++;
      gained = POINTS[q.kind] + Math.min(state.streak - 1, 5) * 2;
      state.score += gained;
      if (state.streak > state.best.streak) state.best.streak = state.streak;

      // 이 단계에서 UNLOCK_STREAK 연속이면 다음 단계를 연다.
      var idx = stageIndex(state.stageId);
      if (state.streak >= UNLOCK_STREAK && idx + 1 < STAGES.length && idx + 1 > state.unlocked) {
        state.unlocked = idx + 1;
        unlockedStage = STAGES[idx + 1];
        syncStages();
      }
      savePrefs();
    } else {
      state.streak = 0;
    }

    state.phase = 'reveal';
    beep(unlockedStage ? 'unlock' : res.correct ? 'good' : 'bad');

    if (q.kind === 'layers') {
      layerInputs.forEach(function (input, i) {
        input.disabled = true;
        var ok = value === null ? false : i < q.n ? res.layerOk[i] : res.totalOk;
        input.classList.add(ok ? 'is-good' : 'is-bad');
      });
      setMsg(el.fieldLayers, el.msgLayers, null, '');
    } else {
      el.inputCount.disabled = true;
      setMsg(el.fieldCount, el.msgCount, res.correct ? 'is-good' : 'is-bad', '');
    }
    el.hintText.hidden = true;
    el.btnHint.setAttribute('aria-pressed', 'false');
    state.hint = false;

    drawQuestion(q, true);
    renderFeedback(q, value, res, gained, unlockedStage);
    el.btnSubmit.textContent = '다음 문제 →';
    el.btnHint.disabled = true;
    el.btnSkip.disabled = true;
    renderStats();
    el.btnSubmit.focus({ preventScroll: true });
  }

  function toggleHint() {
    if (state.phase !== 'answer') return;
    state.hint = !state.hint;
    el.btnHint.setAttribute('aria-pressed', String(state.hint));
    el.hintText.hidden = !state.hint;
    if (state.hint) el.hintText.textContent = hintFor(state.q);
    drawQuestion(state.q, false);
    focusAnswer();
  }

  function advance() {
    if (state.mode === 'challenge' && Date.now() >= state.endsAt) {
      finishChallenge();
      return;
    }
    newQuestion();
  }

  // ------------------------------------------------------------------ 도전 모드

  function startRound() {
    stopTimer();
    state.score = 0;
    state.streak = 0;
    state.asked = 0;
    state.correct = 0;
    state.phase = 'answer';
    if (state.mode === 'challenge') {
      state.endsAt = Date.now() + CHALLENGE_SECONDS * 1000;
      state.timerId = setInterval(onTick, 200);
    }
    newQuestion();
  }

  function onTick() {
    if (state.mode !== 'challenge') { stopTimer(); return; }
    renderStats();
    if (Date.now() >= state.endsAt && state.phase !== 'reveal') finishChallenge();
  }

  function stopTimer() {
    if (state.timerId) { clearInterval(state.timerId); state.timerId = null; }
  }

  function finishChallenge() {
    stopTimer();
    state.phase = 'over';
    beep('done');

    var isBest = state.score > state.best.challenge;
    if (isBest) { state.best.challenge = state.score; savePrefs(); }

    el.form.hidden = true;
    el.feedback.hidden = true;
    el.figure.hidden = true;
    el.legend.hidden = true;
    el.hintText.hidden = true;
    el.prompt.hidden = true;
    el.resultTitle.textContent = isBest ? '신기록! 🎉' : '시간 종료!';
    el.resultScore.textContent = String(state.score);
    el.resultDetail.textContent =
      '정답 ' + state.correct + ' / ' + state.asked +
      ' · 정확도 ' + (state.asked ? Math.round((state.correct / state.asked) * 100) : 0) + '%' +
      ' · 최고 기록 ' + state.best.challenge + '점';
    el.result.hidden = false;
    renderStats();
    el.btnRestart.focus();
  }

  // ------------------------------------------------------------------ 이벤트

  function bind() {
    el.modeGroup.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-mode]');
      if (!b || b.dataset.mode === state.mode) return;
      state.mode = b.dataset.mode;
      savePrefs();
      syncToggles();
      startRound();
    });

    el.levelGroup.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-stage]');
      if (!b || b.disabled || b.dataset.stage === state.stageId) return;
      state.stageId = b.dataset.stage;
      savePrefs();
      syncToggles();
      startRound();
    });

    el.btnSound.addEventListener('click', function () {
      state.sound = !state.sound;
      savePrefs();
      syncToggles();
      if (state.sound) beep('done');
    });

    el.btnGuide.addEventListener('click', function () {
      var open = el.guide.hidden;
      el.guide.hidden = !open;
      el.btnGuide.setAttribute('aria-pressed', String(open));
    });

    el.form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (state.phase === 'answer') trySubmit();
      else if (state.phase === 'reveal') advance();
    });

    el.inputCount.addEventListener('input', function () {
      if (state.phase === 'answer') setMsg(el.fieldCount, el.msgCount, null, '');
    });
    el.layerRow.addEventListener('input', function () {
      if (state.phase === 'answer') setMsg(el.fieldLayers, el.msgLayers, null, '');
    });

    el.btnHint.addEventListener('click', toggleHint);
    el.btnSkip.addEventListener('click', function () { submitAnswer(null); });
    el.btnRestart.addEventListener('click', startRound);

    // Enter 는 여기서 한 번만 처리한다. 입력칸의 암묵적 제출과 겹치면 한 번에 두 단계가 넘어간다.
    // 층별 칸에서는 비어 있는 다음 칸으로 넘어가고, 다 찼으면 확인한다.
    document.addEventListener('keydown', function (e) {
      if (e.isComposing || e.altKey || e.ctrlKey || e.metaKey || e.key !== 'Enter') return;
      var tag = e.target.tagName;
      if (tag === 'BUTTON' || tag === 'A' || state.phase === 'over') return;   // 버튼은 버튼대로 눌린다
      e.preventDefault();
      if (state.phase === 'reveal') { advance(); return; }
      var i = layerInputs.indexOf(e.target);
      if (state.q.kind === 'layers' && i >= 0 && e.target.value) {
        var empty = layerInputs.slice(i + 1).concat(layerInputs.slice(0, i)).filter(function (x) { return !x.value; })[0];
        if (empty) { empty.focus(); return; }
      }
      trySubmit();
    });
  }

  // ------------------------------------------------------------------ 시작

  function cache() {
    var ids = {
      modeGroup: 'mode-group', levelGroup: 'level-group', levelHint: 'level-hint',
      guide: 'guide', btnGuide: 'btn-guide', btnSound: 'btn-sound',
      statScore: 'stat-score', statStreak: 'stat-streak', statAccuracy: 'stat-accuracy',
      statRight: 'stat-right', statRightLabel: 'stat-right-label', statRightTile: 'stat-right-tile',
      prompt: 'prompt', figure: 'figure', legend: 'legend', hintText: 'hint-text',
      form: 'answer-form', feedback: 'feedback',
      fieldLayers: 'field-layers', layerRow: 'layer-row', msgLayers: 'msg-layers',
      fieldCount: 'field-count', inputCount: 'input-count', msgCount: 'msg-count', labelCount: 'label-count',
      btnSubmit: 'btn-submit', btnHint: 'btn-hint', btnSkip: 'btn-skip',
      result: 'result', resultTitle: 'result-title', resultScore: 'result-score',
      resultDetail: 'result-detail', btnRestart: 'btn-restart'
    };
    Object.keys(ids).forEach(function (k) { el[k] = document.getElementById(ids[k]); });
  }

  loadPrefs();
  cache();
  renderStages();
  syncToggles();
  bind();
  startRound();
})();
