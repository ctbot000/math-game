/* 각도 익히기 게임 */
(function () {
  'use strict';

  var A = window.Angle;
  var STORE_KEY = 'angle-game/v1';
  var CHALLENGE_SECONDS = 60;
  var UNLOCK_STREAK = 3;   // 한 단계에서 이만큼 연속으로 맞히면 다음 단계가 열린다
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var CORNER_ARC = 22;     // 비교·도형 그림에서 각을 표시하는 호의 반지름

  var STAGES = [
    { id: 'compare', label: '크기 비교', hint: '두 각 중 더 큰 각 고르기 — 변의 길이는 상관없어요' },
    { id: 'classify', label: '예각·둔각', hint: '직각(90°)보다 작으면 예각, 크면 둔각' },
    { id: 'measure', label: '각도기 읽기', hint: '0에서 시작하는 눈금을 따라 읽기' },
    { id: 'draw', label: '각 그리기', hint: '각도기를 보며 변을 돌려 각 만들기' },
    { id: 'estimate', label: '어림하기', hint: '각도기 없이 짐작하기 — 10° 차이까지 정답' },
    { id: 'sum', label: '합과 차', hint: '각도를 더하고 빼기' },
    { id: 'shape', label: '삼각형·사각형', hint: '직선 180° · 삼각형 세 각의 합 180° · 사각형 네 각의 합 360°' },
    { id: 'mix', label: '혼합', hint: '모든 문제 무작위 — 실전 연습' }
  ];

  // 버튼을 골라 답하는 문제
  var CHOICES = {
    compare: [
      { value: 'a', label: '가' },
      { value: 'b', label: '나' },
      { value: 'same', label: '크기가 같아요' }
    ],
    classify: [
      { value: 'acute', label: '예각' },
      { value: 'right', label: '직각' },
      { value: 'obtuse', label: '둔각' }
    ]
  };

  var PROMPTS = {
    compare: '두 각 중 더 큰 각을 골라 보세요',
    classify: '이 각은 예각, 직각, 둔각 중 무엇일까요?',
    measure: '각도기의 눈금을 읽어 보세요. 이 각은 몇 도일까요?',
    draw: '주황색 점을 끌어서 아래 크기만큼 벌어진 각을 그려 보세요',
    estimate: '각도기 없이 어림해 보세요. 이 각은 몇 도쯤일까요?',
    sum: '?에 알맞은 각도를 구해 보세요',
    shape: '?에 알맞은 각도를 구해 보세요'
  };

  // 문제 종류마다 기본 점수. 여기에 정확 보너스와 연속 보너스가 붙는다.
  var POINTS = { compare: 10, classify: 10, measure: 14, draw: 16, estimate: 14, sum: 14, shape: 16 };

  var state = {
    mode: 'practice',
    stageId: STAGES[0].id,
    unlocked: 0,          // 열려 있는 마지막 단계의 STAGES 인덱스
    sound: true,
    best: { streak: 0, challenge: 0 },
    phase: 'answer',      // answer | reveal | over
    q: null,
    lastSig: null,
    drawValue: 0,         // 각 그리기에서 지금 벌어진 각
    dragging: false,
    hint: false,
    score: 0,
    streak: 0,
    asked: 0,
    correct: 0,
    endsAt: 0,
    timerId: null
  };

  var el = {};
  var fig = {};           // 지금 그림에서 힌트·풀이 때 다시 만질 요소들

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
    return A.KINDS[Math.floor(Math.random() * A.KINDS.length)];
  }

  function signature(q) {
    return q.kind + ':' + (q.variant || '') + ':' + q.answer;
  }

  function nextQuestion() {
    var q = A.generate(kindForStage());
    // 같은 문제가 연달아 나오면 한 번 더 뽑는다.
    if (signature(q) === state.lastSig) q = A.generate(q.kind);
    state.lastSig = signature(q);
    return q;
  }

  // ------------------------------------------------------------------ 그림 도구

  function svgEl(tag, attrs, parent) {
    var node = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    if (parent) parent.appendChild(node);
    return node;
  }

  function r2(n) { return Math.round(n * 100) / 100; }

  function segment(a, b, cls, parent) {
    return svgEl('line', { x1: r2(a.x), y1: r2(a.y), x2: r2(b.x), y2: r2(b.y), 'class': cls }, parent);
  }

  function ray(v, dir, len, cls, parent) {
    return segment(v, A.polar(v.x, v.y, len, dir), cls, parent);
  }

  function textAt(p, text, cls, parent) {
    var t = svgEl('text', { x: r2(p.x), y: r2(p.y), 'class': cls }, parent);
    t.textContent = text;
    return t;
  }

  function dot(p, parent) {
    return svgEl('circle', { cx: r2(p.x), cy: r2(p.y), r: 3.5, 'class': 'fig-vertex' }, parent);
  }

  /** 각 표시: 옅은 부채꼴 위에 호 */
  function arcMark(v, from, sweep, r, extra, parent) {
    var g = svgEl('g', { 'class': 'fig-mark' + (extra ? ' ' + extra : '') }, parent);
    svgEl('path', { d: A.sectorPath(v.x, v.y, r, from, sweep), 'class': 'fig-sector' }, g);
    svgEl('path', { d: A.arcPath(v.x, v.y, r, from, sweep), 'class': 'fig-arc' }, g);
    return g;
  }

  /** 호 끝의 화살촉. pointing 은 화살이 가리키는 방향. */
  function arrowHead(tip, pointing, parent) {
    var a = A.polar(tip.x, tip.y, 7, pointing + 180 - 28);
    var b = A.polar(tip.x, tip.y, 7, pointing + 180 + 28);
    svgEl('path', {
      d: 'M' + r2(a.x) + ' ' + r2(a.y) + ' L' + r2(tip.x) + ' ' + r2(tip.y) + ' L' + r2(b.x) + ' ' + r2(b.y)
    }, parent);
  }

  /** 뒤에 바탕을 깐 글자 — 점선이 밑으로 지나가도 읽힌다 */
  function chipAt(p, text, cls, parent) {
    var g = svgEl('g', { 'class': 'fig-chip' }, parent);
    var w = 14 + text.length * 9;
    svgEl('rect', { x: r2(p.x - w / 2), y: r2(p.y - 12), width: r2(w), height: 24, rx: 12 }, g);
    textAt(p, text, cls, g);
    return g;
  }

  /** 각도 글자. 모르는 각이면 '?' 를 쓰고, 풀이 때 답으로 바꾸도록 기억해 둔다. */
  function angleLabel(p, deg, unknown, parent, extra) {
    var cls = 'fig-label' + (unknown ? ' is-unknown' : extra ? ' ' + extra : '');
    var t = textAt(p, unknown ? '?' : deg + '°', cls, parent);
    if (unknown) fig.unknown = t;
    return t;
  }

  function newFigure(label) {
    var svg = svgEl('svg', {
      viewBox: '0 0 ' + A.VIEW.w + ' ' + A.VIEW.h,
      'class': 'fig',
      role: 'img',
      'aria-label': label
    });
    el.figure.innerHTML = '';
    el.figure.appendChild(svg);
    fig = { svg: svg };
    return svg;
  }

  // ------------------------------------------------------------------ 문제 그림

  function drawCompare(q) {
    var svg = newFigure('두 각 가와 나');
    var names = svgEl('g', {}, null);
    fig.names = A.layoutCompare(q).map(function (L, i) {
      var a = q.angles[i];
      arcMark(L.vertex, a.rot, a.deg, CORNER_ARC, '', svg);
      L.ends.forEach(function (e) { segment(L.vertex, e, 'fig-arm', svg); });
      dot(L.vertex, svg);
      return textAt(L.name, i === 0 ? '가' : '나', 'fig-name', names);
    });
    svg.appendChild(names);
  }

  /** 각 하나 (예각·둔각, 어림하기) */
  function drawSingle(q) {
    var svg = newFigure('각 하나');
    var L = A.layoutSingle(q);
    fig.single = L;
    fig.mark = arcMark(L.vertex, q.rot, q.deg, L.arc, '', svg);
    L.ends.forEach(function (e) { segment(L.vertex, e, 'fig-arm', svg); });
    fig.overlay = svgEl('g', {}, svg);
    dot(L.vertex, svg);
    fig.labels = svgEl('g', {}, svg);
  }

  /** 각도기 읽기·각 그리기: 반원 각도기의 중심이 꼭짓점 */
  function drawProtractorScene(q) {
    var svg = newFigure(q.kind === 'draw' ? '각도기와 움직일 수 있는 변' : '각도기를 댄 각');
    var P = A.PROTRACTOR;
    var v = { x: P.cx, y: P.cy };
    var base = q.side === 'right' ? 0 : 180;
    // 변은 각도기 아래에 깔린다 — 투명한 각도기를 각 위에 올려놓은 모습.
    ray(v, base, P.arm, 'fig-arm', svg);
    if (q.kind === 'measure') {
      var dir = A.armDirection(q.side, q.deg);
      arcMark(v, Math.min(base, dir), q.deg, 30, '', svg);
      ray(v, dir, P.arm, 'fig-arm', svg);
    }
    svgEl('path', {
      d: 'M' + (P.cx - P.r) + ' ' + P.cy + ' A' + P.r + ' ' + P.r + ' 0 0 1 ' + (P.cx + P.r) + ' ' + P.cy + ' Z',
      'class': 'pro-body'
    }, svg);
    if (q.kind === 'draw') {
      fig.penSector = svgEl('path', { 'class': 'pen-sector' }, svg);
      fig.penArm = svgEl('line', { x1: v.x, y1: v.y, x2: v.x, y2: v.y, 'class': 'pen-arm' }, svg);
    }
    fig.scales = drawMarks(svg);
    fig.overlay = svgEl('g', {}, svg);
    dot(v, svg);
    if (q.kind === 'draw') {
      fig.handle = svgEl('circle', { cx: v.x, cy: v.y, r: 12, 'class': 'pen-handle' }, svg);
      svg.classList.add('is-draggable');
      svg.setAttribute('tabindex', '0');
      svg.setAttribute('role', 'slider');
      svg.setAttribute('aria-label', '움직일 변 — 화살표 키로 1°씩 돌려요');
      svg.setAttribute('aria-valuemin', '0');
      svg.setAttribute('aria-valuemax', '180');
      setDrawValue(q.start);
    }
  }

  /** 각도기 눈금과 두 줄의 숫자. 숫자 묶음을 돌려준다 — 풀이 때 맞는 쪽을 강조한다. */
  function drawMarks(svg) {
    var P = A.PROTRACTOR;
    var marks = A.protractorMarks();
    var g = svgEl('g', { 'class': 'pro-marks' }, svg);
    ['minor', 'mid', 'major'].forEach(function (size) {
      var d = marks.ticks.filter(function (t) { return t.size === size; }).map(function (t) {
        return 'M' + r2(t.a.x) + ' ' + r2(t.a.y) + 'L' + r2(t.b.x) + ' ' + r2(t.b.y);
      }).join('');
      svgEl('path', { d: d, 'class': 'pro-tick is-' + size }, g);
    });
    segment({ x: P.cx, y: P.cy }, { x: P.cx, y: P.cy - 16 }, 'pro-tick is-major', g);   // 중심선
    var scales = {
      outer: svgEl('g', { 'class': 'pro-scale is-outer' }, g),
      inner: svgEl('g', { 'class': 'pro-scale is-inner' }, g)
    };
    marks.labels.forEach(function (l) {
      textAt(l.outer, l.outer.text, '', scales.outer);
      textAt(l.inner, l.inner.text, '', scales.inner);
    });
    return scales;
  }

  /** 각 그리기: 움직이는 변을 value 만큼 벌린다 */
  function setDrawValue(value) {
    var q = state.q;
    var P = A.PROTRACTOR;
    value = Math.max(0, Math.min(180, Math.round(value)));
    state.drawValue = value;
    var end = A.polar(P.cx, P.cy, P.arm, A.armDirection(q.side, value));
    fig.penArm.setAttribute('x2', r2(end.x));
    fig.penArm.setAttribute('y2', r2(end.y));
    fig.handle.setAttribute('cx', r2(end.x));
    fig.handle.setAttribute('cy', r2(end.y));
    if (value > 0) {
      fig.penSector.setAttribute('d', A.sectorPath(P.cx, P.cy, 34, q.side === 'right' ? 0 : 180 - value, value));
    } else {
      fig.penSector.removeAttribute('d');
    }
    fig.svg.setAttribute('aria-valuenow', String(value));
    fig.svg.setAttribute('aria-valuetext', value + '°');
  }

  /** 합과 차: 세 반직선 그림, 또는 식 */
  function drawSum(q) {
    var svg = newFigure(q.variant === 'calc' ? '각도 계산식' : '한 점에서 뻗은 세 반직선');
    if (q.variant === 'calc') {
      fig.equation = svgEl('text', { x: A.VIEW.w / 2, y: A.VIEW.h / 2, 'class': 'fig-equation' }, svg);
      setEquation(q, false);
      return;
    }
    var F = A.FAN;
    var L = A.layoutFan(q);
    var v = L.vertex;
    var whole = svgEl('g', { 'class': 'fig-whole' + (L.whole.unknown ? ' is-unknown' : '') }, svg);
    svgEl('path', { d: A.arcPath(v.x, v.y, F.whole, L.whole.from, L.whole.sweep) }, whole);
    var end = L.whole.from + L.whole.sweep;
    arrowHead(A.polar(v.x, v.y, F.whole, L.whole.from), L.whole.from - 90, whole);
    arrowHead(A.polar(v.x, v.y, F.whole, end), end + 90, whole);
    L.parts.forEach(function (p) { arcMark(v, p.from, p.sweep, F.part, p.unknown ? 'is-unknown' : '', svg); });
    L.rays.forEach(function (d) { ray(v, d, F.ray, 'fig-arm', svg); });
    dot(v, svg);
    L.parts.forEach(function (p, i) { angleLabel(p.label, q.parts[i], p.unknown, svg); });
    angleLabel(L.whole.label, q.total, L.whole.unknown, svg, 'is-whole');
  }

  /** 식 문제: '125° + 35° = ?' — 풀이 때는 ? 자리에 답 */
  function setEquation(q, solved) {
    var e = fig.equation;
    e.textContent = q.terms[0] + '° ' + (q.op === '+' ? '+' : '−') + ' ' + q.terms[1] + '° = ';
    var t = svgEl('tspan', { 'class': solved ? 'is-answer' : 'is-unknown' }, e);
    t.textContent = solved ? q.answer + '°' : '?';
  }

  /** 직선 위의 각, 삼각형, 사각형 */
  function drawShape(q) {
    var svg = newFigure(q.variant === 'line' ? '직선 위의 각' : q.variant === 'triangle' ? '삼각형' : '사각형');
    var L;
    if (q.variant === 'line') {
      L = A.layoutLine(q);
      L.corners.forEach(function (c) { corner(c, svg); });
      segment(L.ends[0], L.ends[1], 'fig-arm', svg);
      L.rays.forEach(function (d) { ray(L.vertex, d, L.rayLength, 'fig-arm', svg); });
      dot(L.vertex, svg);
    } else {
      L = A.layoutPolygon(q);
      var pts = L.points.map(function (p) { return r2(p.x) + ',' + r2(p.y); }).join(' ');
      svgEl('polygon', { points: pts, 'class': 'fig-shape-fill' }, svg);
      L.corners.forEach(function (c) { corner(c, svg); });
      svgEl('polygon', { points: pts, 'class': 'fig-shape-line' }, svg);
    }
    L.corners.forEach(function (c) {
      if (!c.right) angleLabel(c.label, c.sweep, c.unknown, svg);
    });
  }

  /** 꼭짓점의 각 표시. 아는 직각은 호 대신 ㄴ 표시. */
  function corner(c, parent) {
    if (c.right) {
      svgEl('path', { d: A.rightMarkPath(c.at.x, c.at.y, 15, c.from), 'class': 'fig-right' }, parent);
    } else {
      arcMark(c.at, c.from, c.sweep, CORNER_ARC, c.unknown ? 'is-unknown' : '', parent);
    }
  }

  // ------------------------------------------------------------------ 힌트·풀이 덧그림

  /** 각 하나 그림에서 꼭짓점부터 짧은 변 끝까지의 길이 */
  function armReach(L) {
    return Math.min.apply(null, L.ends.map(function (e) { return Math.hypot(e.x - L.vertex.x, e.y - L.vertex.y); }));
  }

  /** 꼭짓점에서 dir 방향으로 긋는 보조선. 그림 밖으로 나가지 않게 줄인다. */
  function guide(dir, share, cls, parent) {
    var L = fig.single;
    return ray(L.vertex, dir, A.rayInView(L.vertex, dir, armReach(L) * share, 8), cls, parent);
  }

  /** 한 변(rot)에서 시작하는 직각 점선. 예각·둔각을 가를 때 쓴다. */
  function rightReference(parent) {
    var q = state.q;
    var L = fig.single;
    var g = svgEl('g', { 'class': 'fig-ref' }, parent);
    guide(q.rot + 90, 0.85, '', g);
    svgEl('path', { d: A.rightMarkPath(L.vertex.x, L.vertex.y, 16, q.rot) }, g);
    return g;
  }

  /** 각도기에서 읽기 시작할 0 에 동그라미 */
  function zeroRing(q) {
    var scale = A.scaleFor(q.side);
    var p = A.scalePoint(scale, q.side === 'right' ? 0 : 180);
    svgEl('circle', { cx: r2(p.x), cy: r2(p.y), r: 11, 'class': 'pro-ring is-hint' }, fig.overlay);
  }

  /** 맞는 눈금 줄을 강조하고, 변이 가리키는 자리에 동그라미 */
  function highlightScale(q, dir) {
    var right = A.scaleFor(q.side);
    fig.scales[right].classList.add('is-correct');
    fig.scales[right === 'inner' ? 'outer' : 'inner'].classList.add('is-faded');
    var p = A.scalePoint(right, dir);
    svgEl('circle', { cx: r2(p.x), cy: r2(p.y), r: 12, 'class': 'pro-ring' }, fig.overlay);
  }

  function showHint(q) {
    if (q.kind === 'classify') {
      rightReference(fig.overlay);
    } else if (q.kind === 'estimate') {
      rightReference(fig.overlay);
      guide(q.rot + 45, 0.7, 'fig-ref-half', fig.overlay);
    } else if (q.kind === 'measure' || q.kind === 'draw') {
      zeroRing(q);
    }
  }

  function revealFigure(q, value, res) {
    if (fig.overlay) fig.overlay.textContent = '';
    var L = fig.single;
    switch (q.kind) {
      case 'compare':
        fig.names.forEach(function (t, i) {
          t.textContent = (i === 0 ? '가 ' : '나 ') + q.angles[i].deg + '°';
          if (q.answer === 'same' || q.answer === (i === 0 ? 'a' : 'b')) t.classList.add('is-answer');
        });
        break;
      case 'classify':
        if (q.deg === 90) {
          fig.mark.remove();
          svgEl('path', { d: A.rightMarkPath(L.vertex.x, L.vertex.y, 18, q.rot), 'class': 'fig-right is-answer' }, fig.overlay);
        } else {
          rightReference(fig.overlay);
        }
        chipAt(L.label, q.deg + '°', 'fig-label is-answer', fig.labels);
        break;
      case 'estimate':
        if (value !== null) {
          guide(q.rot + Math.max(0, Math.min(180, value)), 0.9, 'fig-guess', fig.overlay);
        }
        chipAt(L.label, q.deg + '°', 'fig-label is-answer', fig.labels);
        break;
      case 'measure':
        highlightScale(q, A.armDirection(q.side, q.deg));
        break;
      case 'draw':
        var P = A.PROTRACTOR;
        var dir = A.armDirection(q.side, q.deg);
        highlightScale(q, dir);
        ray({ x: P.cx, y: P.cy }, dir, P.arm, 'fig-target', fig.overlay);
        fig.svg.classList.remove('is-draggable');
        fig.svg.classList.add(res.correct ? 'is-good' : 'is-bad');
        fig.svg.removeAttribute('tabindex');
        break;
      default:
        if (q.variant === 'calc') {
          setEquation(q, true);
        } else if (fig.unknown) {
          fig.unknown.textContent = q.answer + '°';
          fig.unknown.setAttribute('class', 'fig-label is-answer');
        }
    }
  }

  // ------------------------------------------------------------------ 글 (힌트·풀이)

  function hintFor(q) {
    switch (q.kind) {
      case 'compare':
        return '두 각을 겹쳐 본다고 생각해 보세요. 변의 길이가 아니라 두 변이 벌어진 정도를 비교해요.';
      case 'classify':
        return '점선이 직각(90°)이에요. 다른 한 변이 점선보다 덜 벌어졌으면 예각, 더 벌어졌으면 둔각이에요.';
      case 'measure':
        return '밑금에 맞춘 변이 가리키는 0(동그라미)에서 시작하는 눈금을 따라 읽어요.';
      case 'draw':
        return '밑금에 맞춘 변이 가리키는 0(동그라미)에서 시작하는 눈금에서 ' + q.deg + '°를 찾아요.';
      case 'estimate':
        return '점선은 직각(90°)과 그 절반(45°)이에요. 어느 쪽에 더 가까운지 견주어 보세요.';
      case 'sum':
        if (q.variant === 'diff') return '전체 각도에서 아는 각도를 빼요.';
        if (q.variant === 'sum') return '두 각을 합치면 전체 각이 돼요. 두 각도를 더해요.';
        return '자연수의 덧셈·뺄셈처럼 계산하고 °를 붙여요.';
      default:
        if (q.variant === 'line') return '직선이 이루는 각은 180°예요.';
        if (q.variant === 'triangle') return '삼각형의 세 각의 크기의 합은 180°예요.';
        return '사각형의 네 각의 크기의 합은 360°예요.';
    }
  }

  /** 변이 더 긴 각 ('a' | 'b') — '변이 길면 큰 각'이라는 착각을 짚어 주려고 */
  function longerArms(q) {
    var len = q.angles.map(function (a) { return a.arms[0] + a.arms[1]; });
    return len[0] > len[1] ? 'a' : 'b';
  }

  function tipFor(q, value, res) {
    var rightNote = q.kind === 'shape' && q.angles.some(function (a, i) { return a === 90 && i !== q.unknown; })
      ? ' ㄴ 표시는 직각(90°)이라는 뜻이에요.' : '';
    switch (q.kind) {
      case 'compare':
        if (q.answer === 'same') {
          return { head: '두 각의 크기가 같아요.', body: '변의 길이나 놓인 방향이 달라도 두 변이 벌어진 정도가 같으면 크기가 같은 각이에요.' };
        }
        if (value === longerArms(q)) {
          return { head: '변이 길다고 큰 각이 아니에요.', body: '각의 크기는 두 변이 벌어진 정도예요. 변을 길게 늘여도 각의 크기는 그대로예요.' };
        }
        return { head: '한 변을 맞춰 겹쳐 보세요.', body: '아래 그림처럼 한 변을 맞춰 겹치면 어느 각이 더 벌어졌는지 한눈에 보여요.' };
      case 'classify':
        return {
          head: '직각(90°)을 기준으로 봐요.',
          body: '0°보다 크고 직각보다 작으면 예각, 직각보다 크고 180°보다 작으면 둔각이에요. 헷갈리면 「힌트」로 직각을 대 보세요.'
        };
      case 'measure':
        if (res.reversed) {
          return {
            head: '반대쪽 눈금을 읽었어요.',
            body: '밑금에 맞춘 변이 가리키는 0에서 시작하는 눈금을 읽어야 해요. 예각이면 90보다 작은 수, 둔각이면 90보다 큰 수가 답이에요.'
          };
        }
        return {
          head: '긴 눈금 사이는 10°, 가장 짧은 눈금 한 칸은 1°예요.',
          body: '0에서 시작하는 눈금을 따라 10°씩 세다가 남은 칸을 더해요. 중간 길이 눈금은 5°예요.'
        };
      case 'draw':
        if (res.reversed) {
          return {
            head: '반대쪽 눈금을 따라 그렸어요.',
            body: '밑금에 맞춘 변이 가리키는 0에서 시작하는 눈금에서 ' + q.deg + '°를 찾아야 해요. 예각이면 직각보다 덜, 둔각이면 더 벌어져요.'
          };
        }
        return {
          head: '점을 끌어 대강 맞춘 뒤 1°씩 맞춰요.',
          body: '◀ ▶ 버튼이나 화살표 키로 1°씩 돌릴 수 있어요. 0에서 시작하는 눈금을 보면서 맞춰요.'
        };
      case 'estimate':
        // 예각을 둔각으로(또는 반대로) 어림했으면 그것부터 짚는다.
        if (value !== null && value !== 90 && q.deg !== 90 && (value < 90) !== (q.deg < 90)) {
          return q.deg > 90
            ? { head: '직각보다 더 벌어진 각이에요.', body: '그러니 90°보다 커요. 직각(90°)에 그 절반(45°)을 더한 135°와 견주어 보세요.' }
            : { head: '직각보다 덜 벌어진 각이에요.', body: '그러니 90°보다 작아요. 직각의 절반인 45°와 견주어 보세요.' };
        }
        return {
          head: '기준이 되는 각과 견주어 봐요.',
          body: '직각은 90°, 그 절반은 45°, 둘을 합하면 135°예요. 가장 가까운 기준에서 조금 더하거나 빼 보세요.'
        };
      case 'sum':
        if (q.variant === 'diff') return { head: '전체에서 아는 부분을 빼요.', body: '전체 각도에서 아는 각도를 빼면 나머지 각도가 나와요.' };
        if (q.variant === 'sum') return { head: '두 각도를 더해요.', body: '두 각을 합친 각의 크기는 두 각도의 합이에요.' };
        return { head: '자연수처럼 계산해요.', body: '각도의 합과 차는 자연수의 덧셈·뺄셈과 같아요. 답에 °를 붙이면 돼요.' };
      default:
        if (q.variant === 'line') return { head: '직선이 이루는 각은 180°예요.', body: '180°에서 아는 각도를 모두 빼요.' + rightNote };
        if (q.variant === 'triangle') {
          return { head: '삼각형의 세 각의 크기의 합은 180°예요.', body: '180°에서 아는 두 각을 빼요.' + rightNote };
        }
        return {
          head: '사각형의 네 각의 크기의 합은 360°예요.',
          body: '사각형은 삼각형 2개로 나눌 수 있어서 180° × 2 = 360°예요. 360°에서 아는 세 각을 빼요.' + rightNote
        };
    }
  }

  function verdictText(q, value, res) {
    if (value === null) return '정답을 확인해 봐요';
    if (!res.correct) return '다시 한번 봐요';
    if (q.kind === 'estimate') return res.perfect ? '아주 잘 어림했어요!' : '잘 어림했어요!';
    if (q.kind === 'draw' && res.perfect) return '정확해요!';
    return '정답이에요!';
  }

  function answerLine(q, value, res) {
    var line = document.createElement('div');
    line.className = 'answer-line';
    function t(s) { line.appendChild(document.createTextNode(s)); }
    function b(s, cls) {
      var n = document.createElement('b');
      n.textContent = s;
      if (cls) n.className = cls;
      line.appendChild(n);
    }
    switch (q.kind) {
      case 'compare':
        if (q.answer === 'same') {
          t('두 각의 크기가 ');
          b('같아요');
        } else {
          t('더 큰 각은 ');
          b(q.answer === 'a' ? '가' : '나');
          t('예요');
        }
        t(' · 가 ');
        b(q.angles[0].deg + '°', 'c-a');
        t(' · 나 ');
        b(q.angles[1].deg + '°', 'c-b');
        break;
      case 'classify':
        b(q.deg + '°');
        if (q.deg === 90) {
          t('라서 ');
        } else {
          t('는 직각(90°)보다 ' + (q.deg < 90 ? '작으니 ' : '크니 '));
        }
        b(A.CLASS_NAMES[q.answer]);
        t('이에요');
        break;
      case 'measure':
        t('정답은 ');
        b(q.deg + '°');
        t('예요');
        if (value !== null && !res.correct) t(' · 내 답 ' + value + '°');
        break;
      case 'draw':
        if (value !== null) {
          t('그린 각 ');
          b(value + '°', 'pen');
          t(' · ');
        }
        t('목표 ');
        b(q.deg + '°');
        if (value !== null && res.diff) t(' · ' + res.diff + '° 차이');
        break;
      case 'estimate':
        if (value !== null) {
          t('어림 ');
          b(value + '°', 'pen');
          t(' · ');
        }
        t('실제 ');
        b(q.deg + '°');
        if (value !== null) t(' · ' + res.diff + '° 차이');
        break;
      default:
        b(A.equation(q));
        if (value !== null && !res.correct) t(' · 내 답 ' + value + '°');
    }
    return line;
  }

  /** 크기 비교 풀이: 두 각을 한 변에 맞춰 겹친 그림 */
  function compareOverlay(q) {
    var wrap = document.createElement('div');
    wrap.className = 'overlay';
    var cap = document.createElement('p');
    cap.className = 'overlay-cap';
    cap.textContent = '한 변을 맞춰 겹쳐 보면';
    wrap.appendChild(cap);
    var svg = svgEl('svg', {
      viewBox: '0 0 380 150', 'class': 'fig', role: 'img', 'aria-label': '두 각을 한 변에 맞춰 겹친 그림'
    }, wrap);
    var v = { x: 190, y: 138 };
    q.angles.forEach(function (a, i) {
      svgEl('path', { d: A.arcPath(v.x, v.y, i === 0 ? 30 : 46, 0, a.deg), 'class': 'ov-arc ' + (i === 0 ? 'c-a' : 'c-b') }, svg);
    });
    ray(v, q.angles[0].deg, 118, 'ov-arm c-a', svg);
    // 크기가 같으면 두 변이 겹친다. 나를 점선으로 그려 둘 다 보이게 한다.
    ray(v, q.angles[1].deg, 118, 'ov-arm c-b' + (q.answer === 'same' ? ' is-dashed' : ''), svg);
    ray(v, 0, 118, 'fig-arm', svg);
    dot(v, svg);
    return wrap;
  }

  // ------------------------------------------------------------------ 그리기

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

  function setFieldState(cls, msg) {
    el.fieldDegrees.classList.remove('is-good', 'is-bad');
    if (cls) el.fieldDegrees.classList.add(cls);
    el.msgDegrees.textContent = msg || '';
  }

  function setNudgeDisabled(off) {
    Array.prototype.forEach.call(el.nudge.children, function (b) { b.disabled = off; });
  }

  function renderQuestion() {
    var q = state.q;
    state.hint = false;
    state.dragging = false;
    el.prompt.textContent = q.kind === 'sum' && q.variant === 'calc' ? '각도의 합과 차를 계산해 보세요' : PROMPTS[q.kind];
    el.target.hidden = q.kind !== 'draw';
    el.target.textContent = q.kind === 'draw' ? q.deg + '°' : '';

    if (q.kind === 'compare') drawCompare(q);
    else if (q.kind === 'classify' || q.kind === 'estimate') drawSingle(q);
    else if (q.kind === 'measure' || q.kind === 'draw') drawProtractorScene(q);
    else if (q.kind === 'sum') drawSum(q);
    else drawShape(q);

    var choices = CHOICES[q.kind];
    el.choices.innerHTML = '';
    el.choices.hidden = !choices;
    if (choices) {
      choices.forEach(function (c, i) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'choice';
        b.dataset.value = c.value;
        b.textContent = c.label;
        var key = document.createElement('kbd');
        key.setAttribute('aria-hidden', 'true');
        key.textContent = String(i + 1);
        b.appendChild(key);
        el.choices.appendChild(b);
      });
    }

    el.fieldDegrees.hidden = !!choices || q.kind === 'draw';
    el.inputDegrees.value = '';
    el.inputDegrees.disabled = false;
    setFieldState(null, '');
    el.labelDegrees.textContent = q.kind === 'estimate' ? '어림한 각도' : q.kind === 'measure' ? '각도' : '?의 각도';
    el.egDegrees.textContent = q.kind === 'estimate' ? '10° 차이까지 정답' : '숫자만 써도 돼요';

    el.nudge.hidden = q.kind !== 'draw';
    setNudgeDisabled(false);
    el.hintText.hidden = true;
    el.feedback.hidden = true;
    el.feedback.innerHTML = '';
    el.btnSubmit.hidden = !!choices;
    el.btnSubmit.textContent = '확인';
    el.btnHint.disabled = false;
    el.btnHint.setAttribute('aria-pressed', 'false');
    el.btnSkip.disabled = false;
    state.phase = 'answer';
    focusAnswer();
  }

  function focusAnswer() {
    var q = state.q;
    if (q.kind === 'draw') {
      fig.svg.focus({ preventScroll: true });
    } else if (!CHOICES[q.kind] && !coarsePointer) {
      el.inputDegrees.focus({ preventScroll: true });
    } else if (document.activeElement && document.activeElement !== document.body) {
      // 고르기 문제에서 Enter 가 엉뚱한 버튼을 누르지 않게 초점을 거둔다. 숫자 1·2·3 으로 고른다.
      document.activeElement.blur();
    }
  }

  function renderFeedback(q, value, res, gained, unlockedStage) {
    var fb = el.feedback;
    fb.innerHTML = '';

    var verdict = document.createElement('div');
    verdict.className = 'verdict ' + (res.correct ? 'good' : 'bad');
    verdict.appendChild(document.createTextNode(verdictText(q, value, res)));
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

    fb.appendChild(answerLine(q, value, res));
    if (q.kind === 'compare') fb.appendChild(compareOverlay(q));

    if (!res.correct) {
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

  /** 입력칸이나 각 그리기에서 '확인' */
  function trySubmit() {
    var q = state.q;
    if (CHOICES[q.kind]) return;               // 고르기 문제는 버튼으로 답한다
    if (q.kind === 'draw') {
      submitAnswer(state.drawValue);
      return;
    }
    var p = A.parseDegrees(el.inputDegrees.value);
    if (p.error) {
      setFieldState('is-bad', p.error === 'empty' ? '각도를 입력해 주세요.' : '숫자로 써 주세요. 예: 45');
      el.inputDegrees.focus();
      return;
    }
    submitAnswer(p.value);
  }

  /** 채점하고 풀이를 보여 준다. value 가 null 이면 '모르겠어요'. */
  function submitAnswer(value) {
    if (state.phase !== 'answer') return;
    var q = state.q;
    var res = value === null ? { correct: false, perfect: false, diff: null, reversed: false } : A.grade(q, value);

    state.asked++;
    var gained = 0;
    var unlockedStage = null;
    if (res.correct) {
      state.correct++;
      state.streak++;
      gained = POINTS[q.kind] + (res.perfect && (q.kind === 'draw' || q.kind === 'estimate') ? 4 : 0) +
        Math.min(state.streak - 1, 5) * 2;
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
    state.dragging = false;
    beep(unlockedStage ? 'unlock' : res.correct ? 'good' : 'bad');

    if (CHOICES[q.kind]) {
      Array.prototype.forEach.call(el.choices.children, function (b) {
        b.disabled = true;
        if (b.dataset.value === q.answer) b.classList.add(value === q.answer ? 'is-good' : 'is-answer');
        else if (b.dataset.value === value) b.classList.add('is-bad');
      });
    }
    if (!el.fieldDegrees.hidden) {
      el.inputDegrees.disabled = true;
      setFieldState(res.correct ? 'is-good' : 'is-bad', '');
    }
    setNudgeDisabled(true);
    el.hintText.hidden = true;
    el.btnHint.setAttribute('aria-pressed', 'false');

    revealFigure(q, value, res);
    renderFeedback(q, value, res, gained, unlockedStage);
    el.btnSubmit.hidden = false;
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
    if (fig.overlay) fig.overlay.textContent = '';
    el.hintText.hidden = !state.hint;
    if (state.hint) {
      el.hintText.textContent = hintFor(state.q);
      showHint(state.q);
    }
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
    state.dragging = false;
    beep('done');

    var isBest = state.score > state.best.challenge;
    if (isBest) { state.best.challenge = state.score; savePrefs(); }

    el.form.hidden = true;
    el.feedback.hidden = true;
    el.figure.hidden = true;
    el.target.hidden = true;
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

  // ------------------------------------------------------------------ 각 그리기 조작

  function isDrawing() {
    return state.phase === 'answer' && state.q && state.q.kind === 'draw';
  }

  /** 포인터 위치를 향하도록 움직이는 변을 돌린다 */
  function dragTo(e) {
    var m = fig.svg.getScreenCTM();
    if (!m) return;
    var inv = m.inverse();
    var p = {
      x: inv.a * e.clientX + inv.c * e.clientY + inv.e,
      y: inv.b * e.clientX + inv.d * e.clientY + inv.f
    };
    var P = A.PROTRACTOR;
    if (Math.abs(p.x - P.cx) + Math.abs(p.y - P.cy) < 14) return;   // 꼭짓점 바로 위에서는 방향이 튄다
    var dir = A.clampUpper(A.direction({ x: P.cx, y: P.cy }, p));
    setDrawValue(A.valueFromDirection(state.q.side, Math.round(dir)));
  }

  /** 화면에서 보이는 대로 돌린다: turn +1 은 시계 반대 방향 (위쪽에서는 왼쪽으로) */
  function turnPen(turn) {
    var sign = state.q.side === 'right' ? 1 : -1;
    setDrawValue(state.drawValue + sign * turn);
  }

  function stopDrag() {
    state.dragging = false;
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

    el.choices.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-value]');
      if (b && !b.disabled) submitAnswer(b.dataset.value);
    });

    // 마우스로 눌러도 초점은 각도기에 남긴다. 그래야 이어서 Enter 로 확인하고 화살표로 돌릴 수 있다.
    el.nudge.addEventListener('mousedown', function (e) { e.preventDefault(); });
    el.nudge.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-turn]');
      if (b && isDrawing()) turnPen(Number(b.dataset.turn));
    });

    el.inputDegrees.addEventListener('input', function () {
      if (state.phase === 'answer') setFieldState(null, '');
    });

    el.btnHint.addEventListener('click', toggleHint);
    el.btnSkip.addEventListener('click', function () { submitAnswer(null); });
    el.btnRestart.addEventListener('click', startRound);

    // 각 그리기: 그림 어디를 눌러도 그쪽으로 변이 돌아간다.
    el.figure.addEventListener('pointerdown', function (e) {
      if (!isDrawing()) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      try { fig.svg.setPointerCapture(e.pointerId); } catch (err) { /* 잡지 못해도 window 에서 따라간다 */ }
      state.dragging = true;
      fig.svg.focus({ preventScroll: true });
      dragTo(e);
    });
    window.addEventListener('pointermove', function (e) {
      if (state.dragging && isDrawing()) dragTo(e);
    });
    window.addEventListener('pointerup', stopDrag);
    window.addEventListener('pointercancel', stopDrag);

    el.figure.addEventListener('keydown', function (e) {
      if (!isDrawing()) return;
      var turn = { ArrowLeft: 1, ArrowRight: -1 }[e.key];
      var delta = { ArrowUp: 1, ArrowDown: -1, PageUp: 10, PageDown: -10 }[e.key];
      if (turn) turnPen(turn);
      else if (delta) setDrawValue(state.drawValue + delta);
      else if (e.key === 'Home') setDrawValue(0);
      else if (e.key === 'End') setDrawValue(180);
      else return;
      e.preventDefault();
    });

    // Enter 는 여기서 한 번만 처리한다. 입력칸의 암묵적 제출과 겹치면 한 번에 두 단계가 넘어간다.
    document.addEventListener('keydown', function (e) {
      if (e.isComposing || e.altKey || e.ctrlKey || e.metaKey) return;
      var tag = e.target.tagName;
      if (e.key === 'Enter') {
        if (tag === 'BUTTON' || tag === 'A' || state.phase === 'over') return;   // 버튼은 버튼대로 눌린다
        e.preventDefault();
        if (state.phase === 'answer') trySubmit();
        else if (state.phase === 'reveal') advance();
        return;
      }
      if (state.phase === 'answer' && CHOICES[state.q.kind] && tag !== 'INPUT') {
        var b = el.choices.children['123'.indexOf(e.key)];
        if (e.key.length === 1 && b) {
          e.preventDefault();
          submitAnswer(b.dataset.value);
        }
      }
    });
  }

  // ------------------------------------------------------------------ 시작

  function cache() {
    var ids = {
      modeGroup: 'mode-group', levelGroup: 'level-group', levelHint: 'level-hint',
      guide: 'guide', btnGuide: 'btn-guide', btnSound: 'btn-sound',
      statScore: 'stat-score', statStreak: 'stat-streak', statAccuracy: 'stat-accuracy',
      statRight: 'stat-right', statRightLabel: 'stat-right-label', statRightTile: 'stat-right-tile',
      prompt: 'prompt', target: 'target', figure: 'figure', hintText: 'hint-text',
      form: 'answer-form', choices: 'choices', nudge: 'nudge', feedback: 'feedback',
      fieldDegrees: 'field-degrees', inputDegrees: 'input-degrees', msgDegrees: 'msg-degrees',
      labelDegrees: 'label-degrees', egDegrees: 'eg-degrees',
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
