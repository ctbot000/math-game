/* 연속하는 수의 합 게임 */
(function () {
  'use strict';

  var S = window.Consec;
  var STORE_KEY = 'consec-game/v1';
  var CHALLENGE_SECONDS = 90;
  var UNLOCK_STREAK = 3;   // 한 단계에서 이만큼 연속으로 맞히면 다음 단계가 열린다

  var STAGES = [
    { id: 'tri', label: '똑같이 셋으로', hint: '□ + □ + □ = 1020 → 900은 300이 셋, 120은 40이 셋' },
    { id: 'cguided', label: '가운데 수로 차례로', hint: '가운데 수를 □라고 하면 세 수의 합은 □ + □ + □' },
    { id: 'cons', label: '연속하는 세 수', hint: '합에서 가운데 수를 구하고, 1씩 빼고 더하기' },
    { id: 'even', label: '세 짝수·홀수', hint: '짝수·홀수는 2씩 차이 나요' },
    { id: 'rguided', label: '짝 지어 차례로', hint: '앞뒤로 짝을 지어 짝의 합 × 짝의 수 + 가운데 수' },
    { id: 'range', label: '모두 더하기', hint: '120부터 140까지의 짝수를 모두 더하기' },
    { id: 'mix', label: '혼합', hint: '모든 문제 무작위 — 실전 연습' }
  ];

  // 문제 종류마다 기본 점수. 여기에 연속 보너스가 붙는다.
  var POINTS = { tri: 10, cguided: 18, cons: 20, even: 22, rguided: 20, range: 24 };

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
    return q.kind + ':' + S.questionText(q);
  }

  function nextQuestion() {
    // 학습지 단계의 첫 문제는 학습지 그대로
    var first = { cons: S.worksheetCons, even: S.worksheetEven, range: S.worksheetRange }[state.stageId];
    if (first && state.lastSig === null) {
      var w = first();
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
    if (q.kind === 'cguided' || q.kind === 'rguided') return '빈칸을 차례로 채워 보세요';
    return '문제를 읽고 답을 써 보세요';
  }

  function hintFor(q) {
    if (q.kind === 'tri') {
      return '똑같은 수 셋으로 나눠요. 자리마다 나누면 쉬워요. 예: 600 = 200 + 200 + 200, 90 = 30 + 30 + 30 → 230';
    }
    if (q.terms) {
      return '처음 수와 끝 수, 둘째 수와 끝에서 둘째 수, … 처럼 앞뒤로 짝을 지으면 짝의 합이 모두 ' + q.a + ' + ' + q.b +
        '로 같아요. 수가 몇 개인지 하나씩 세어 보고, 하나가 남으면 그 가운데 수를 더해요.';
    }
    var s = q.step;
    return '가운데 수를 □라고 하면 세 수는 □ − ' + s + ', □, □ + ' + s + '. 빼고 더한 ' + s + '이 서로 없어지니 합은 □ + □ + □예요. ' +
      '□를 구한 다음 ' + S.ASK_WORD[q.ask] + '를 찾아요.';
  }

  /** 틀린 답에 붙는 설명 {head, body} */
  function tipFor(q, value, res) {
    var sol = S.solutionLines(q);
    var body = sol.slice(-2).join('  ·  ');
    switch (res.mistake) {
      case 'notThird':
        return { head: J(q.total, '은는') + ' 세 수를 더한 값이에요. 셋으로 나눠야 해요.', body: S.thirdLine(q.total) };
      case 'gaveMiddle':
        return { head: '그건 가운데 수예요. 묻는 건 ' + S.ASK_WORD[q.ask] + '예요.', body: sol[2] };
      case 'otherEnd':
        return { head: '반대쪽 끝이에요. ' + S.ASK_WORD[q.ask] + '를 찾아요.', body: sol[2] };
      case 'stepOne':
        return { head: (q.parity === 0 ? '짝수' : '홀수') + '는 2씩 차이 나요. 연속하는 세 ' + (q.parity === 0 ? '짝수' : '홀수') + '는 □ − 2, □, □ + 2예요.', body: sol[2] };
      case 'allNumbers':
        return { head: rangeOnly(q) + '만 더해요. ' + q.a + ', ' + (q.a + 2) + ', ' + (q.a + 4) + ', …처럼 2씩 커지는 수예요.', body: body };
      case 'missedEnd':
        return { head: q.a + '과 ' + q.b + '도 넣어서 세어요. 「부터」와 「까지」는 끝 수를 포함해요.', body: body };
      case 'forgotMiddle':
        return { head: '짝 없이 남는 가운데 ' + J(q.middle, '을를') + ' 더해야 해요.', body: body };
      case 'doubleCount':
        return { head: '짝의 합은 수 두 개를 더한 값이에요. 수의 개수가 아니라 짝의 수만큼 곱해요.', body: body };
      case 'countedNumbers':
        return { head: '수는 ' + q.n + '개지만, 둘씩 짝을 지으면 ' + q.pairs + '쌍이에요.', body: sol[0] };
      case 'calc':
        return { head: '방법은 맞아요. 받아올림·받아내림을 다시 살펴보세요.', body: body };
      default:
        return { head: '풀이를 차례로 따라가 보세요.', body: sol.join('  ·  ') };
    }
  }

  function J(n, pair) { return S.J(n, pair); }
  function rangeOnly(q) { return q.parity === 0 ? '짝수' : '홀수'; }

  // ------------------------------------------------------------------ 그림

  /** 수 칩 줄. 세 수는 □ − s, □, □ + s, 범위는 앞뒤 짝마다 같은 색 */
  function renderStrip(q, reveal) {
    var box = el.strip;
    box.innerHTML = '';
    if (!reveal) { box.hidden = true; return; }
    box.hidden = false;
    var row = document.createElement('div');
    row.className = 'chips';
    if (q.terms) {
      q.terms.forEach(function (x, i) {
        var k = Math.min(i, q.n - 1 - i);
        var c = span('chip ' + (q.middle !== null && i === (q.n - 1) / 2 ? 'chip-mid' : 'chip-p' + (k % 4)), String(x), row);
        c.title = k + 1 + '번째 짝';
      });
      box.appendChild(row);
      span('strip-note', q.pair + ' × ' + q.pairs + (q.middle !== null ? ' + ' + q.middle : '') + ' = ' + q.total + ' · 같은 색끼리 더하면 ' + q.pair, box);
    } else {
      q.nums.forEach(function (x, i) {
        var tag = q.kind === 'tri' ? '□' : ['□ − ' + q.step, '□', '□ + ' + q.step][i];
        var c = span('chip' + (i === 1 ? ' chip-mid' : '') + (q.kind !== 'tri' && q.answer.ans === x ? ' chip-ans' : ''), '', row);
        span('chip-tag', tag, c);
        span('chip-num', String(x), c);
      });
      box.appendChild(row);
      span('strip-note', q.nums.join(' + ') + ' = ' + q.total, box);
    }
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
    var guided = q.kind === 'rguided' || q.kind === 'cguided';
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
        input.setAttribute('aria-label', { m: '가운데 수', pair: '짝 하나의 합', pairs: '짝의 수', middle: '가운데 수', total: '모두 더한 값' }[t.input] || (q.ask ? S.ASK_WORD[q.ask] : '답'));
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
    renderStrip(q, false);
    buildLines(q);
    el.labelLines.textContent = q.kind === 'rguided' || q.kind === 'cguided' ? '풀이' : '답';
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
    renderStrip(q, true);

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
    b.textContent = q.terms ? String(q.total) : q.kind === 'tri' ? '□ = ' + q.m : S.ASK_WORD[q.ask] + ' ' + q.answer.ans;
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
      prompt: 'prompt', story: 'story', strip: 'strip', hintText: 'hint-text',
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
