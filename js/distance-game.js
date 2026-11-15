/* 겹친 거리 구하기 게임 */
(function () {
  'use strict';

  var S = window.Distance;
  var STORE_KEY = 'distance-game/v1';
  var CHALLENGE_SECONDS = 90;
  var UNLOCK_STREAK = 3;   // 한 단계에서 이만큼 연속으로 맞히면 다음 단계가 열린다

  var STAGES = [
    { id: 'part', label: '한 번 빼기', hint: '긴 거리에서 짧은 거리를 빼면 나머지 거리' },
    { id: 'oguided', label: '겹친 거리 차례로', hint: '두 거리를 더하고, 전체를 빼서 겹친 부분 구하기' },
    { id: 'overlap', label: '겹친 거리', hint: '㉠~㉢ + ㉡~㉣ − ㉠~㉣ = ㉡~㉢' },
    { id: 'cguided', label: '두 번 빼기 차례로', hint: '가운데 거리를 먼저 구하고, 그걸로 끝 거리 구하기' },
    { id: 'chain', label: '두 번 빼기', hint: '주어진 거리로 가운데부터 차례로 구하기' },
    { id: 'mix', label: '혼합', hint: '모든 문제 무작위 — 실전 연습' }
  ];

  // 문제 종류마다 기본 점수. 여기에 연속 보너스가 붙는다.
  var POINTS = { part: 10, oguided: 18, overlap: 22, cguided: 20, chain: 24 };

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
  var inputs = [];        // {key, input}

  // 터치 화면에서는 입력칸에 바로 초점을 주지 않는다. 자판이 올라와 문제를 가린다.
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
    return q.kind + ':' + q.seg.join(',') + ':' + q.ask.join('');
  }

  function nextQuestion() {
    // 겹친 거리·두 번 빼기 단계의 첫 문제는 학습지 그대로
    if ((state.stageId === 'overlap' || state.stageId === 'chain') && state.lastSig === null) {
      var w = state.stageId === 'overlap' ? S.worksheetOverlap() : S.worksheetChain();
      state.lastSig = signature(w);
      return w;
    }
    var q = S.generate(kindForStage());
    if (signature(q) === state.lastSig) q = S.generate(q.kind);
    state.lastSig = signature(q);
    return q;
  }

  // ------------------------------------------------------------------ 글

  function promptFor(q) {
    if (q.kind === 'oguided' || q.kind === 'cguided') return '그림을 보고 차례로 풀어 보세요';
    return '그림을 보고 답을 써 보세요';
  }

  function hintFor(q) {
    var t = S.span(q, q.text);
    if (q.kind === 'part') {
      return S.name(q.text) + '은 ' + S.name(q.drawn[0]) + '과 ' + S.name(q.ask) + '을 이은 거리예요. 긴 거리에서 아는 부분을 빼요.';
    }
    if (q.kind === 'overlap' || q.kind === 'oguided') {
      if (q.ask[0] === 0) {
        return '그림의 두 거리를 더하면 ㉠~㉣보다 ' + S.name(q.text) + '만큼 길어요. 겹친 부분을 한 번 세었으니 빼요.';
      }
      return '그림의 두 거리를 더하면 가운데 ' + S.name(q.ask) + '을 두 번 센 거예요. 더한 거리에서 ' +
        S.name(q.text) + '(' + t + ' m)을 빼면 두 번 센 부분만 남아요.';
    }
    var cp = S.chainParts(q);
    return '한 번에는 못 구해요. ' + S.name(q.text) + '에서 ' + S.name(cp.piece) + '을 빼면 가운데 ' + S.name(q.mid) +
      '이 나와요. 그다음 ' + S.name(cp.whole) + '에서 가운데를 빼요.';
  }

  /** 틀린 답에 붙는 설명 {head, body} */
  function tipFor(q, value, res) {
    var sol = S.solutionLines(q);
    var body = sol.slice(-2).join('  ·  ');
    switch (res.mistake) {
      case 'added':
        return { head: '더하지 말고 빼요. 긴 거리 안에 짧은 거리가 들어 있어요.', body: sol.join('  ·  ') };
      case 'sumOnly':
        return q.ask[0] === 0
          ? { head: '두 거리를 더하면 겹친 부분을 두 번 센 거예요. 한 번 빼야 해요.', body: body }
          : { head: '더한 다음 ' + S.name(q.text) + '을 빼야 해요.', body: body };
      case 'endPiece':
        return { head: '그건 끝에 있는 거리예요. 묻는 건 ' + S.name(q.ask) + '이에요.', body: body };
      case 'diffGiven':
        return { head: '그림의 두 거리는 빼지 말고 더해요. 그래야 가운데가 두 번 들어가요.', body: body };
      case 'addedMid':
        return { head: '겹친 부분은 더하지 말고 빼요.', body: body };
      case 'midOnly':
        return { head: '그건 가운데 ' + S.name(q.mid) + '이에요. 한 번 더 빼야 ' + S.name(q.ask) + '이 나와요.', body: sol[1] };
      case 'wrongPair':
        return { head: '두 거리가 같은 곳에서 시작하거나 끝나야 빼서 나머지를 구할 수 있어요.', body: sol.join('  ·  ') };
      case 'calc':
        return { head: '방법은 맞아요. 받아올림·받아내림을 다시 살펴보세요.', body: body };
      default:
        return { head: '그림에서 어느 거리를 더하고 빼는지 다시 살펴보세요.', body: sol.join('  ·  ') };
    }
  }

  // ------------------------------------------------------------------ 그림

  var SVG_NS = 'http://www.w3.org/2000/svg';

  function svgEl(tag, attrs, parent) {
    var n = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (parent) parent.appendChild(n);
    return n;
  }

  /**
   * 한 줄 위의 ㉠ ㉡ ㉢ ㉣ 과 거리 표시. 그림에 쓰인 거리는 위쪽 점선 곡선,
   * 묻는 거리는 아래쪽 색 곡선(?), reveal 이면 답을 쓴다.
   */
  function drawDiagram(q, reveal) {
    var W = 460;
    var Y = 108;
    var left = 28;
    var right = W - 28;
    // 너무 짧은 칸은 글자가 겹치니 최소 폭을 둔다
    var total = q.seg[0] + q.seg[1] + q.seg[2];
    var share = q.seg.map(function (s) { return Math.max(s / total, 0.2); });
    var sum = share[0] + share[1] + share[2];
    var xs = [left];
    share.forEach(function (s) { xs.push(xs[xs.length - 1] + (s / sum) * (right - left)); });

    var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' 210', class: 'diagram', role: 'img' });
    svg.setAttribute('aria-label', S.marks(q).map(function (m) { return S.name(m.span) + ' ' + m.label; }).join(', '));

    svgEl('line', { x1: left, y1: Y, x2: right, y2: Y, class: 'road' }, svg);
    xs.forEach(function (x, i) {
      svgEl('line', { x1: x, y1: Y - 7, x2: x, y2: Y + 7, class: 'road' }, svg);
      svgEl('circle', { cx: x, cy: Y + 24, r: 12, class: 'pt-ring' }, svg);
      var t = svgEl('text', { x: x, y: Y + 29.5, class: 'pt-label' }, svg);
      t.textContent = 'ㄱㄴㄷㄹ'.charAt(i);
    });

    function arc(s, up, cls, label) {
      var x1 = xs[s[0]];
      var x2 = xs[s[1]];
      var n = s[1] - s[0];
      var h = up ? 26 + n * 20 : 36;
      var dir = up ? -1 : 1;
      var y0 = up ? Y - 2 : Y + 40;
      var a = up ? x1 : x1 + 4;
      var b = up ? x2 : x2 - 4;
      svgEl('path', {
        d: 'M' + a + ' ' + y0 + ' Q' + (a + b) / 2 + ' ' + (y0 + dir * h * 2) + ' ' + b + ' ' + y0,
        class: cls
      }, svg);
      var mx = (a + b) / 2;
      var my = y0 + dir * h;
      var w = label.length * 11 + 14;
      svgEl('rect', { x: mx - w / 2, y: my - 13, width: w, height: 26, rx: 7, class: cls + '-bg' }, svg);
      var t = svgEl('text', { x: mx, y: my + 6.5, class: cls + '-text' }, svg);
      t.textContent = label;
    }

    S.marks(q).forEach(function (m) { arc(m.span, true, 'given', m.label); });
    arc(q.ask, false, reveal ? 'shown' : 'asked', reveal ? q.answer.ans + ' m' : '? m');
    return svg;
  }

  function renderDiagram(reveal) {
    el.diagram.innerHTML = '';
    el.diagram.appendChild(drawDiagram(state.q, reveal));
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
    el.levelHint.textContent = stageHintText();

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

  function setMsg(cls, msg) {
    el.fieldLines.classList.remove('is-good', 'is-bad');
    if (cls) el.fieldLines.classList.add(cls);
    el.msgLines.textContent = msg || '';
  }

  function span(cls, text, parent) {
    var s = document.createElement('span');
    s.className = cls;
    s.textContent = text;
    if (parent) parent.appendChild(s);
    return s;
  }

  /** 문장 속 수를 강조해 그린다 */
  function renderStory(q) {
    el.story.innerHTML = '';
    S.questionText(q).split(/(\d+)/).forEach(function (part, i) {
      if (i % 2) span('num', part, el.story);
      else if (part) el.story.appendChild(document.createTextNode(part));
    });
  }

  function buildLines(q) {
    el.eqLines.innerHTML = '';
    inputs = [];
    var guided = q.kind === 'oguided' || q.kind === 'cguided';
    S.lines(q).forEach(function (line, li) {
      var row = document.createElement('div');
      row.className = 'eq-line' + (guided && li === 0 ? ' is-note' : '');
      line.forEach(function (t) {
        if (typeof t === 'string') {
          // 「 = 」 마디마다 끊기지 않는 덩어리로
          var text = span('eq-text', '', row);
          t.split(' = ').forEach(function (part, i, parts) {
            if (!part) return;
            span('eq-part', part + (i < parts.length - 1 ? ' =' : ''), text);
            if (i < parts.length - 1) text.appendChild(document.createTextNode(' '));
          });
          return;
        }
        var box = span('in-box', '', row);
        var input = document.createElement('input');
        input.type = 'text';
        input.inputMode = 'numeric';
        input.maxLength = 6;
        input.spellcheck = false;
        input.setAttribute('aria-label', t.input === 'sum' ? '더한 거리' : t.input === 'mid' ? S.name(q.mid) : S.name(q.ask));
        box.appendChild(input);
        if (t.unit) span('u', t.unit, box);
        inputs.push({ key: t.input, input: input });
      });
      el.eqLines.appendChild(row);
    });
  }

  function renderQuestion() {
    var q = state.q;
    state.hint = false;
    el.prompt.textContent = promptFor(q);
    el.story.hidden = false;
    renderStory(q);
    renderDiagram(false);
    buildLines(q);
    el.labelLines.textContent = q.kind === 'oguided' || q.kind === 'cguided' ? '풀이' : '답';
    setMsg(null, '');

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
    if (coarsePointer || !inputs.length) return;
    var empty = inputs.filter(function (t) { return !t.input.value; })[0] || inputs[0];
    empty.input.focus({ preventScroll: true });
  }

  function renderFeedback(q, value, res, gained, unlockedStage) {
    var fb = el.feedback;
    fb.innerHTML = '';
    renderDiagram(true);

    var verdict = document.createElement('div');
    verdict.className = 'verdict ' + (res.correct ? 'good' : 'bad');
    verdict.appendChild(document.createTextNode(
      res.correct ? '정답이에요! 🎉' : value === null ? '정답을 확인해 보세요' : '아쉬워요'));
    if (res.correct && gained > 0) span('score-delta', '+' + gained + '점', verdict);
    fb.appendChild(verdict);

    if (unlockedStage) {
      var unlock = document.createElement('div');
      unlock.className = 'unlock';
      unlock.textContent = '🔓 ' + UNLOCK_STREAK + '연속 정답! 「' + unlockedStage.label + '」 단계가 열렸어요.';
      fb.appendChild(unlock);
    }

    var line = document.createElement('div');
    line.className = 'answer-line';
    S.solutionLines(q).forEach(function (s, i) {
      if (i) line.appendChild(document.createElement('br'));
      line.appendChild(document.createTextNode(s));
    });
    line.appendChild(document.createElement('br'));
    line.appendChild(document.createTextNode('정답: '));
    var b = document.createElement('b');
    b.textContent = S.name(q.ask) + ' ' + q.answer.ans + ' m';
    line.appendChild(b);
    fb.appendChild(line);

    if (!res.correct && value !== null) {
      var tp = tipFor(q, value, res);
      var tip = document.createElement('div');
      tip.className = 'tip';
      var head = document.createElement('b');
      head.textContent = tp.head;
      tip.appendChild(head);
      tip.appendChild(document.createTextNode(' ' + tp.body));
      fb.appendChild(tip);
    }
    fb.hidden = false;
  }

  // ------------------------------------------------------------------ 진행

  function newQuestion() {
    state.q = nextQuestion();
    el.result.hidden = true;
    el.form.hidden = false;
    el.prompt.hidden = false;
    renderQuestion();
    renderStats();
  }

  /** 입력을 읽는다. 빈칸이나 숫자 아닌 칸이 있으면 알려 주고 null */
  function readAnswer() {
    var value = {};
    for (var i = 0; i < inputs.length; i++) {
      var r = S.parseNum(inputs[i].input.value);
      if (r.error) {
        setMsg('is-bad', r.error === 'empty' ? '빈칸을 모두 채워 주세요.' : '숫자로 써 주세요.');
        inputs[i].input.focus();
        return null;
      }
      value[inputs[i].key] = r.value;
    }
    return value;
  }

  function trySubmit() {
    var value = readAnswer();
    if (value !== null) submitAnswer(value);
  }

  /** 채점하고 풀이를 보여 준다. value 가 null 이면 '모르겠어요'. */
  function submitAnswer(value) {
    if (state.phase !== 'answer') return;
    var q = state.q;
    var res = value === null ? { correct: false, ok: {}, mistake: null } : S.grade(q, value);

    state.asked++;
    var gained = 0;
    var unlockedStage = null;
    if (res.correct) {
      state.correct++;
      state.streak++;
      gained = POINTS[q.kind] + Math.min(state.streak - 1, 5) * 2;
      state.score += gained;
      if (state.streak > state.best.streak) state.best.streak = state.streak;

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
    inputs.forEach(function (t) {
      t.input.disabled = true;
      t.input.classList.add(res.ok[t.key] ? 'is-good' : 'is-bad');
    });
    setMsg(null, '');

    el.hintText.hidden = true;
    el.btnHint.setAttribute('aria-pressed', 'false');
    state.hint = false;

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
    state.lastSig = null;
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
    el.story.hidden = true;
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

    el.eqLines.addEventListener('input', function () {
      if (state.phase === 'answer') setMsg(null, '');
    });

    el.btnHint.addEventListener('click', toggleHint);
    el.btnSkip.addEventListener('click', function () { submitAnswer(null); });
    el.btnRestart.addEventListener('click', startRound);

    // Enter 는 여기서 한 번만 처리한다. 입력칸의 암묵적 제출과 겹치면 한 번에 두 단계가 넘어간다.
    // 칸이 여럿이면 비어 있는 다음 칸으로 넘어가고, 다 찼으면 확인한다.
    document.addEventListener('keydown', function (e) {
      if (e.isComposing || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key !== 'Enter') return;
      var tag = e.target.tagName;
      if (tag === 'BUTTON' || tag === 'A' || state.phase === 'over') return;
      e.preventDefault();
      if (state.phase === 'reveal') { advance(); return; }
      var at = -1;
      inputs.forEach(function (t, k) { if (t.input === e.target) at = k; });
      if (at >= 0 && e.target.value) {
        var rest = inputs.slice(at + 1).concat(inputs.slice(0, at)).filter(function (t) { return !t.input.value; })[0];
        if (rest) { rest.input.focus(); return; }
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
      prompt: 'prompt', story: 'story', diagram: 'diagram', hintText: 'hint-text',
      form: 'answer-form', feedback: 'feedback',
      fieldLines: 'field-lines', eqLines: 'eq-lines', labelLines: 'label-lines', msgLines: 'msg-lines',
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
