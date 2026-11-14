/* 숫자 카드로 세 자리 수 만들기 게임 */
(function () {
  'use strict';

  var C = window.DigitCard;
  var STORE_KEY = 'digit-game/v1';
  var CHALLENGE_SECONDS = 90;
  var UNLOCK_STREAK = 3;   // 한 단계에서 이만큼 연속으로 맞히면 다음 단계가 열린다

  var STAGES = [
    { id: 'single', label: '가장 큰·작은 수', hint: '카드 3장으로 가장 큰 (작은) 세 자리 수 — 0은 백의 자리에 못 와요' },
    { id: 'diffMax', label: '차가 가장 크게', hint: '카드 6장으로 두 수 — 큰 수는 가장 크게, 작은 수는 가장 작게' },
    { id: 'diffMin', label: '차가 가장 작게', hint: '카드 6장으로 두 수 — 백의 자리 차는 작게, 나머지는 반대로' },
    { id: 'sheet', label: '학습지 문제', hint: '0(1)부터 9까지 한 번씩 — 두 수의 차가 가장 작게 (크게)' },
    { id: 'mix', label: '혼합', hint: '모든 문제 무작위 — 실전 연습' }
  ];

  var POINTS = { single: 8, diffMax: 14, diffMin: 18, sheet: 22 };

  var state = {
    mode: 'practice',
    stageId: STAGES[0].id,
    unlocked: 0,
    sound: true,
    best: { streak: 0, challenge: 0 },
    phase: 'answer',      // answer | reveal | over
    q: null,
    lastSig: null,
    hint: false,
    slots: [],            // 칸마다 놓인 카드의 q.cards 인덱스 또는 null (줄 순서대로 3칸씩)
    placed: [],           // 놓은 칸 순서 (⌫ 로 마지막 것부터 뺀다)
    active: 0,            // 다음에 카드가 들어갈 칸
    score: 0,
    streak: 0,
    asked: 0,
    correct: 0,
    endsAt: 0,
    timerId: null
  };

  var el = {};

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
    return C.KINDS[Math.floor(Math.random() * C.KINDS.length)];
  }

  function signature(q) {
    return q.kind + ':' + q.goal + ':' + q.cards.join('');
  }

  function nextQuestion() {
    // 학습지 문제 단계의 첫 문제는 학습지 그대로
    if (state.stageId === 'sheet' && state.lastSig === null) {
      var w = C.worksheet();
      state.lastSig = signature(w);
      return w;
    }
    var q = C.generate(kindForStage());
    for (var i = 0; i < 3 && signature(q) === state.lastSig; i++) q = C.generate(q.kind);
    state.lastSig = signature(q);
    return q;
  }

  // ------------------------------------------------------------------ 글

  function hintFor(q) {
    if (q.goal === 'max') return '백의 자리에 가장 큰 숫자, 십의 자리에 그다음 큰 숫자, 일의 자리에 그다음 숫자를 놓아요.';
    if (q.goal === 'min') {
      return '백의 자리에 가장 작은 숫자를 놓아요.' + (q.cards.indexOf(0) >= 0 ? ' 0은 백의 자리에 올 수 없으니 0이 아닌 가장 작은 숫자를 놓아요.' : '');
    }
    if (q.goal === 'diffMax') return '큰 수는 가장 큰 숫자 세 개로 가장 크게, 작은 수는 남은 숫자로 가장 작게 만들어요.';
    return '두 수의 백의 자리 숫자가 가장 가깝게 (차가 1이면 가장 좋아요) 골라요. 그다음 큰 수의 나머지 두 자리는 ' +
      '가장 작게, 작은 수의 나머지 두 자리는 가장 크게 만들면 차가 줄어요.';
  }

  /** 틀린 답에 붙는 설명 {head, body} */
  function tipFor(q, res) {
    var best = q.best;
    switch (res.mistake) {
      case 'leadingZero':
        return { head: '0이 백의 자리에 있으면 세 자리 수가 아니에요.', body: '0은 십의 자리나 일의 자리에 놓아요.' };
      case 'hundredsGap':
        return {
          head: '백의 자리 숫자의 차가 너무 커요.',
          body: '만든 두 수: ' + res.numbers[0] + ' − ' + res.numbers[1] + ' = ' + res.value + '. 백의 자리를 ' +
            Math.floor(best.answers[0][0] / 100) + C.josaGwa(Math.floor(best.answers[0][0] / 100)) + ' ' + Math.floor(best.answers[0][1] / 100) +
            '처럼 가깝게 하면 차가 훨씬 작아져요.'
        };
      case 'restNotBest':
        return {
          head: '백의 자리는 좋아요. 나머지 두 자리를 바꿔 보세요.',
          body: '만든 두 수의 차는 ' + res.value + '. 큰 수의 나머지는 가장 작게, 작은 수의 나머지는 가장 크게 하면 ' + best.value + '까지 줄어요.'
        };
      default:
        if (q.rows === 1) {
          return { head: '더 ' + (q.goal === 'max' ? '큰' : '작은') + ' 수를 만들 수 있어요.', body: '만든 수 ' + res.value + ', 가장 ' + (q.goal === 'max' ? '큰' : '작은') + ' 수 ' + best.value };
        }
        return {
          head: '차를 더 크게 만들 수 있어요.',
          body: '만든 두 수: ' + res.numbers[0] + ' − ' + res.numbers[1] + ' = ' + res.value + ', 가장 큰 차는 ' + best.value
        };
    }
  }

  // ------------------------------------------------------------------ 판

  function rowValues() {
    var q = state.q;
    var rows = [];
    for (var r = 0; r < q.rows; r++) {
      rows.push([0, 1, 2].map(function (c) {
        var ci = state.slots[r * 3 + c];
        return ci === null ? null : q.cards[ci];
      }));
    }
    return rows;
  }

  function usedCard(ci) {
    return state.slots.indexOf(ci) >= 0;
  }

  function buildBoard() {
    var q = state.q;
    el.board.innerHTML = '';
    var labels = q.rows === 1 ? ['만든 수'] : ['큰 수', '작은 수'];
    labels.forEach(function (lab, r) {
      var row = document.createElement('div');
      row.className = 'board-row';
      var l = span('row-label', '', row);
      if (r === 1) span('op', '−', l);
      l.appendChild(document.createTextNode(lab));
      var slots = span('slots', '', row);
      for (var c = 0; c < 3; c++) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'slot';
        b.dataset.slot = String(r * 3 + c);
        b.setAttribute('aria-label', lab + ' ' + ['백', '십', '일'][c] + '의 자리');
        slots.appendChild(b);
      }
      el.board.appendChild(row);
      if (q.rows === 2 && r === 1) {
        var line = document.createElement('div');
        line.className = 'board-line';
        el.board.appendChild(line);
      }
    });
    el.cards.innerHTML = '';
    q.cards.forEach(function (d, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'digit-card';
      b.dataset.card = String(i);
      b.textContent = String(d);
      el.cards.appendChild(b);
    });
  }

  function syncBoard() {
    var q = state.q;
    var answering = state.phase === 'answer';
    Array.prototype.forEach.call(el.board.querySelectorAll('.slot'), function (b) {
      var i = Number(b.dataset.slot);
      var ci = state.slots[i];
      b.textContent = ci === null ? '' : String(q.cards[ci]);
      b.classList.toggle('is-filled', ci !== null);
      b.classList.toggle('is-active', answering && i === state.active);
      b.disabled = !answering;
    });
    Array.prototype.forEach.call(el.cards.children, function (b) {
      b.disabled = !answering || usedCard(Number(b.dataset.card));
    });
    // 다 채우면 만든 수와 차를 바로 보여 준다
    var rows = rowValues();
    var full = rows.every(function (r) { return r.every(function (d) { return d !== null; }); });
    if (!full) { el.live.textContent = ''; return; }
    var nums = rows.map(function (r) { return r[0] * 100 + r[1] * 10 + r[2]; });
    if (rows.some(function (r) { return r[0] === 0; })) { el.live.textContent = '백의 자리에 0이 있어요'; return; }
    el.live.textContent = q.rows === 1 ? '만든 수: ' + nums[0] : '차: ' + Math.abs(nums[0] - nums[1]);
  }

  function nextEmpty(from) {
    var n = state.slots.length;
    for (var k = 0; k < n; k++) {
      var i = (from + k) % n;
      if (state.slots[i] === null) return i;
    }
    return -1;
  }

  function placeCard(ci) {
    if (state.phase !== 'answer' || usedCard(ci)) return;
    var at = state.slots[state.active] === null ? state.active : nextEmpty(state.active);
    if (at < 0) return;
    state.slots[at] = ci;
    state.placed.push(at);
    var nx = nextEmpty(at);
    state.active = nx < 0 ? at : nx;
    setMsg(null, '');
    syncBoard();
  }

  function clearSlot(i) {
    if (state.phase !== 'answer') return;
    if (state.slots[i] !== null) {
      state.slots[i] = null;
      state.placed = state.placed.filter(function (p) { return p !== i; });
    }
    state.active = i;
    setMsg(null, '');
    syncBoard();
  }

  function undo() {
    var last = state.placed.pop();
    if (last === undefined) return;
    state.slots[last] = null;
    state.active = last;
    syncBoard();
  }

  /** 정답 하나를 판에 놓는다 ('모르겠어요') */
  function showAnswerOnBoard() {
    var q = state.q;
    var a = q.best.answers[0];
    var nums = q.rows === 1 ? [a] : a;
    var taken = {};
    state.slots = [];
    nums.forEach(function (n) {
      String(n).split('').forEach(function (ch) {
        var ci = q.cards.indexOf(Number(ch));
        taken[ci] = true;
        state.slots.push(ci);
      });
    });
  }

  // ------------------------------------------------------------------ 화면

  function setMsg(cls, msg) {
    el.fieldBoard.classList.remove('is-good', 'is-bad');
    if (cls) el.fieldBoard.classList.add(cls);
    el.msgBoard.textContent = msg || '';
  }

  function span(cls, text, parent) {
    var s = document.createElement('span');
    s.className = cls;
    s.textContent = text;
    if (parent) parent.appendChild(s);
    return s;
  }

  /** 문제 글. 가장 큰/작은 같은 핵심 말을 굵게 */
  function renderStory(q) {
    el.story.innerHTML = '';
    C.questionText(q).split(/(가장 (?:큰|작은|작을|클|작게|크게))/).forEach(function (part, i) {
      if (i % 2) { var b = document.createElement('b'); b.textContent = part; el.story.appendChild(b); }
      else if (part) el.story.appendChild(document.createTextNode(part));
    });
  }

  function renderQuestion() {
    var q = state.q;
    state.hint = false;
    state.slots = [];
    for (var i = 0; i < q.rows * 3; i++) state.slots.push(null);
    state.placed = [];
    state.active = 0;
    state.phase = 'answer';
    renderStory(q);
    buildBoard();
    syncBoard();
    setMsg(null, '');

    el.hintText.hidden = true;
    el.feedback.hidden = true;
    el.feedback.innerHTML = '';
    el.btnSubmit.textContent = '확인';
    el.btnHint.disabled = false;
    el.btnHint.setAttribute('aria-pressed', 'false');
    el.btnSkip.disabled = false;
  }

  function renderFeedback(q, res, gained, unlockedStage, skipped) {
    var fb = el.feedback;
    fb.innerHTML = '';

    var verdict = document.createElement('div');
    verdict.className = 'verdict ' + (res.correct ? 'good' : 'bad');
    verdict.appendChild(document.createTextNode(res.correct ? '정답이에요! 🎉' : skipped ? '정답을 확인해 보세요' : '아쉬워요'));
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
    C.solutionLines(q).forEach(function (s, i) {
      if (i) line.appendChild(document.createElement('br'));
      line.appendChild(document.createTextNode(s));
    });
    if (q.rows === 2) {
      var n = q.best.answers.length;
      line.appendChild(document.createElement('br'));
      var all = span('all', (n > 1 ? '답이 ' + n + '가지예요: ' : '답: ') +
        q.best.answers.map(C.pairText).join(', '), line);
      all.title = '차가 ' + q.best.value + '인 두 수';
    }
    fb.appendChild(line);

    if (!res.correct && !skipped) {
      var tp = tipFor(q, res);
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
    el.story.hidden = false;
    renderQuestion();
    renderStats();
  }

  function trySubmit() {
    var res = C.grade(state.q, rowValues());
    if (res.mistake === 'empty') {
      setMsg('is-bad', '빈칸을 모두 채워 주세요.');
      return;
    }
    submitAnswer(res);
  }

  /** 채점 결과를 반영하고 풀이를 보여 준다. res 가 null 이면 '모르겠어요'. */
  function submitAnswer(res) {
    if (state.phase !== 'answer') return;
    var q = state.q;
    var skipped = res === null;
    if (skipped) res = { correct: false, mistake: null };

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
    if (skipped) showAnswerOnBoard();
    syncBoard();
    Array.prototype.forEach.call(el.board.querySelectorAll('.slot'), function (b) {
      b.classList.add(res.correct || skipped ? 'is-good' : 'is-bad');
    });
    setMsg(null, '');

    el.hintText.hidden = true;
    el.btnHint.setAttribute('aria-pressed', 'false');
    state.hint = false;

    renderFeedback(q, res, gained, unlockedStage, skipped);
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
  }

  function advance() {
    if (state.mode === 'challenge' && Date.now() >= state.endsAt) {
      finishChallenge();
      return;
    }
    newQuestion();
  }

  // ------------------------------------------------------------------ 단계 화면

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

    el.cards.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-card]');
      if (b) placeCard(Number(b.dataset.card));
    });
    el.board.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-slot]');
      if (b) clearSlot(Number(b.dataset.slot));
    });

    el.form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (state.phase === 'answer') trySubmit();
      else if (state.phase === 'reveal') advance();
    });

    el.btnHint.addEventListener('click', toggleHint);
    el.btnSkip.addEventListener('click', function () { submitAnswer(null); });
    el.btnRestart.addEventListener('click', startRound);

    // 숫자 키는 카드 놓기, ⌫ 는 마지막 카드 빼기, Enter 는 확인·다음 문제
    document.addEventListener('keydown', function (e) {
      if (e.isComposing || e.altKey || e.ctrlKey || e.metaKey) return;
      if (state.phase === 'answer' && /^[0-9]$/.test(e.key)) {
        var ci = state.q.cards.indexOf(Number(e.key));
        if (ci >= 0) { e.preventDefault(); placeCard(ci); }
        return;
      }
      if (state.phase === 'answer' && e.key === 'Backspace') { e.preventDefault(); undo(); return; }
      if (e.key !== 'Enter') return;
      var tag = e.target.tagName;
      if (tag === 'A' || state.phase === 'over') return;
      if (tag === 'BUTTON' && e.target.type !== 'submit' && !e.target.dataset.card && !e.target.dataset.slot) return;
      e.preventDefault();
      if (state.phase === 'reveal') advance();
      else trySubmit();
    });
  }

  // ------------------------------------------------------------------ 시작

  function cache() {
    var ids = {
      modeGroup: 'mode-group', levelGroup: 'level-group', levelHint: 'level-hint',
      guide: 'guide', btnGuide: 'btn-guide', btnSound: 'btn-sound',
      statScore: 'stat-score', statStreak: 'stat-streak', statAccuracy: 'stat-accuracy',
      statRight: 'stat-right', statRightLabel: 'stat-right-label', statRightTile: 'stat-right-tile',
      story: 'story', hintText: 'hint-text',
      form: 'answer-form', feedback: 'feedback',
      fieldBoard: 'field-board', board: 'board', live: 'live', cards: 'cards', msgBoard: 'msg-board',
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
