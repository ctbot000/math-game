/* 한국어 숫자 읽기 게임 */
(function () {
  'use strict';

  var K = window.KoreanNumber;
  var STORE_KEY = 'korean-number-game/v1';
  var CHALLENGE_SECONDS = 60;

  var LEVELS = [
    { id: 'l1', label: '천', hint: '100 ~ 9,999 — 십·백·천 자리 익히기', min: 3, max: 4 },
    { id: 'l2', label: '만', hint: '10,000 ~ 99,999 — 네 자리씩 끊는 감각 잡기', min: 5, max: 5 },
    { id: 'l3', label: '십만~천만', hint: '100,000 ~ 99,999,999 — 만 단위 굳히기', min: 6, max: 8 },
    { id: 'l4', label: '억', hint: '1억 ~ 9,999억 — 억 자리 등장', min: 9, max: 12 },
    { id: 'l5', label: '조', hint: '1조 ~ 999조 — 최고 단계', min: 13, max: 15 },
    { id: 'mix', label: '혼합', hint: '천 ~ 조 무작위 — 실전 연습', min: 3, max: 15 }
  ];

  var MODE_PROMPT = {
    practice: '이 숫자를 한국어로 읽어 보세요',
    challenge: '이 숫자를 한국어로 읽어 보세요',
    reverse: '이 말을 숫자로 써 보세요'
  };

  var state = {
    mode: 'practice',
    levelId: 'l2',
    spaced: false,
    alwaysPlaces: false,
    sound: true,
    best: { streak: 0, challenge: 0 },
    phase: 'answer',      // answer | reveal | over
    current: null,        // BigInt
    lastValue: null,
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
      ['mode', 'levelId', 'spaced', 'alwaysPlaces', 'sound'].forEach(function (k) {
        if (saved[k] !== undefined) state[k] = saved[k];
      });
      if (saved.best) {
        state.best.streak = saved.best.streak || 0;
        state.best.challenge = saved.best.challenge || 0;
      }
      if (!LEVELS.some(function (l) { return l.id === state.levelId; })) state.levelId = 'l2';
      if (!MODE_PROMPT[state.mode]) state.mode = 'practice';
    } catch (e) { /* 저장값이 깨졌으면 기본값으로 시작한다 */ }
  }

  function savePrefs() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        mode: state.mode, levelId: state.levelId, spaced: state.spaced,
        alwaysPlaces: state.alwaysPlaces, sound: state.sound, best: state.best
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

  // ------------------------------------------------------------------ 문제

  function levelById(id) {
    for (var i = 0; i < LEVELS.length; i++) if (LEVELS[i].id === id) return LEVELS[i];
    return LEVELS[1];
  }

  function randomInt(n) { return Math.floor(Math.random() * n); }

  /** 자릿수를 먼저 정하고 한 자리씩 뽑는다. 0을 섞어 '건너뛰는 자리'가 나오게 한다. */
  function randomValue(level) {
    var len = level.min + randomInt(level.max - level.min + 1);
    var s = String(1 + randomInt(9));
    for (var i = 1; i < len; i++) {
      s += Math.random() < 0.25 ? '0' : String(1 + randomInt(9));
    }
    return BigInt(s);
  }

  function nextValue() {
    var level = levelById(state.levelId);
    var v = randomValue(level);
    // 같은 문제가 연달아 나오면 한 번 더 뽑는다.
    if (state.lastValue !== null && v === state.lastValue) v = randomValue(level);
    state.lastValue = v;
    return v;
  }

  // ------------------------------------------------------------------ 채점

  function stripAll(s) { return String(s).replace(/[\s,]/g, ''); }

  function gradeMixed(raw, target) {
    var s = String(raw).trim();
    if (!s) return { ok: false, msg: '입력해 주세요.' };
    var v = K.parseMixed(s);
    var canonical = K.toMixed(target);
    if (v === null) {
      return { ok: false, msg: '숫자와 만·억·조 단위로 입력해 주세요. 예: 1만 5000' };
    }
    if (stripAll(s) === stripAll(canonical)) return { ok: true, msg: '' };
    if (v === target) {
      return {
        ok: false,
        msg: /[만억조]/.test(s)
          ? '값은 맞아요. 표준 표기는 ' + canonical
          : '값은 맞아요. 만·억·조 단위로 끊어서 써 보세요 → ' + canonical
      };
    }
    return { ok: false, msg: '정답은 ' + canonical };
  }

  function gradeHangul(raw, target) {
    var s = String(raw).trim();
    if (!s) return { ok: false, msg: '입력해 주세요.' };
    var canonical = K.toHangul(target);
    if (/[0-9]/.test(s)) return { ok: false, msg: '한글로 읽어 주세요. 예: 만오천' };
    var v = K.parseHangul(s);
    if (v === null) return { ok: false, msg: '한글 수사로 입력해 주세요. 예: 만오천' };
    if (v !== target) return { ok: false, msg: '정답은 ' + K.toHangul(target, { spaced: state.spaced }) };
    if (s.replace(/\s+/g, '') === canonical) return { ok: true, msg: '' };
    return { ok: true, msg: '맞아요. 보통은 「' + canonical + '」처럼 읽어요.' };
  }

  function gradeDigits(raw, target) {
    var s = stripAll(raw);
    if (!s) return { ok: false, msg: '입력해 주세요.' };
    if (!/^\d+$/.test(s)) return { ok: false, msg: '숫자만 입력해 주세요.' };
    if (BigInt(s) !== target) return { ok: false, msg: '정답은 ' + K.toComma(target) };
    return { ok: true, msg: '' };
  }

  /** 이번 문제에서 실제로 물어보는 칸들 */
  function activeFields() {
    if (state.mode === 'reverse') return ['digits'];
    // 10000 미만이면 '숫자+단위' 표기가 숫자 그대로라 물어볼 것이 없다.
    return state.current < 10000n ? ['hangul'] : ['mixed', 'hangul'];
  }

  function pointsFor(value, streakAfter) {
    var groups = K.splitGroups(value).length;          // 1~4 (일/만/억/조)
    return 10 + (groups - 1) * 6 + Math.min(streakAfter - 1, 5) * 2;
  }

  // ------------------------------------------------------------------ 힌트

  function tipFor(value) {
    var groups = K.splitGroups(value);
    var has = function (fn) { return groups.some(fn); };

    if (has(function (g) { return g.index === 1 && g.value === 1n; })) {
      return { head: '만 앞의 1은 읽지 않아요.', body: '10,000 은 「일만」이 아니라 「만」. 단, 억·조는 「일억」·「일조」로 1을 살려 읽습니다.' };
    }
    if (has(function (g) { return g.index >= 2 && g.value === 1n; })) {
      return { head: '억·조 앞의 1은 읽어요.', body: '만과 달리 「일억」, 「일조」처럼 1을 붙여 읽습니다.' };
    }
    var emptyGroup = groups.length > 1 && has(function (g) { return g.value === 0n; });
    var innerZero = has(function (g) { return g.value !== 0n && String(g.value).indexOf('0') !== -1; });
    if (emptyGroup || innerZero) {
      return {
        head: '값이 0인 자리는 읽지 않고 건너뜁니다.',
        body: '801 은 「팔백일」(팔백영십일 ✗), 100,020,000 은 1억 2만 → 「일억이만」. 비어 있는 자리는 아예 빼고 읽어요.'
      };
    }
    if (has(function (g) { return /1/.test(String(g.value).padStart(4, '0').slice(0, 3)); })) {
      return { head: '십·백·천 앞의 1은 읽지 않아요.', body: '110 은 「일백일십」이 아니라 「백십」으로 읽습니다.' };
    }
    return { head: '네 자리씩 끊어서 보세요.', body: '한국어는 세 자리(,)가 아니라 네 자리마다 만 · 억 · 조로 단위가 올라갑니다.' };
  }

  // ------------------------------------------------------------------ 그리기

  function renderLevels() {
    el.levelGroup.innerHTML = '';
    LEVELS.forEach(function (lv) {
      var b = document.createElement('button');
      b.type = 'button';
      b.dataset.level = lv.id;
      b.textContent = lv.label;
      b.setAttribute('aria-pressed', String(lv.id === state.levelId));
      el.levelGroup.appendChild(b);
    });
    el.levelHint.textContent = levelById(state.levelId).hint;
  }

  function syncToggles() {
    Array.prototype.forEach.call(el.modeGroup.children, function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.mode === state.mode));
    });
    Array.prototype.forEach.call(el.levelGroup.children, function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.level === state.levelId));
    });
    Array.prototype.forEach.call(el.displayGroup.children, function (b) {
      var on = b.dataset.toggle === 'spaced' ? state.spaced : state.alwaysPlaces;
      b.setAttribute('aria-pressed', String(on));
    });
    el.btnSound.setAttribute('aria-pressed', String(state.sound));
    el.btnSound.textContent = state.sound ? '🔊' : '🔇';
    el.levelHint.textContent = levelById(state.levelId).hint;
  }

  function renderStats() {
    el.statScore.textContent = String(state.score);
    el.statStreak.textContent = state.streak > 0 ? state.streak + ' 🔥' : '0';
    el.statAccuracy.textContent = state.asked
      ? Math.round((state.correct / state.asked) * 100) + '%'
      : '—';

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

  function renderPlaceTable(value) {
    el.placeTable.innerHTML = '';
    K.placeTable(value).forEach(function (g) {
      var box = document.createElement('div');
      box.className = 'place-group' + (g.zero ? ' is-zero' : '');
      var label = document.createElement('span');
      label.className = 'place-label';
      label.textContent = g.label;
      var digits = document.createElement('span');
      digits.className = 'place-digits';
      digits.textContent = g.digits;
      box.appendChild(label);
      box.appendChild(digits);
      el.placeTable.appendChild(box);
    });
  }

  function setFieldState(name, cls, msg) {
    el['field' + name].classList.remove('is-good', 'is-bad');
    if (cls) el['field' + name].classList.add(cls);
    el['msg' + name].textContent = msg || '';
  }

  function renderQuestion() {
    var v = state.current;
    var reverse = state.mode === 'reverse';

    el.prompt.textContent = MODE_PROMPT[state.mode];
    el.question.classList.toggle('is-hangul', reverse);
    el.question.textContent = reverse
      ? K.toHangul(v, { spaced: state.spaced })
      : K.toComma(v);

    renderPlaceTable(v);
    el.placeTable.hidden = !state.alwaysPlaces || reverse;

    var active = activeFields();
    ['Mixed', 'Hangul', 'Digits'].forEach(function (name) {
      var key = name.toLowerCase();
      var on = active.indexOf(key) !== -1;
      el['field' + name].hidden = !on;
      el['input' + name].value = '';
      el['input' + name].disabled = false;
      setFieldState(name, null, '');
    });

    el.feedback.hidden = true;
    el.feedback.innerHTML = '';
    el.btnSubmit.textContent = '확인';
    el.btnHint.disabled = false;
    el.btnSkip.disabled = false;
    state.phase = 'answer';
    focusFirstField();
  }

  function focusFirstField() {
    var first = activeFields()[0];
    var input = el['input' + first.charAt(0).toUpperCase() + first.slice(1)];
    if (input) input.focus();
  }

  function renderFeedback(allOk, gained) {
    var v = state.current;
    var fb = el.feedback;
    fb.innerHTML = '';

    var verdict = document.createElement('div');
    verdict.className = 'verdict ' + (allOk ? 'good' : 'bad');
    verdict.appendChild(document.createTextNode(allOk ? '정답이에요!' : '다시 한 번 봐요'));
    if (allOk && gained > 0) {
      var delta = document.createElement('span');
      delta.className = 'score-delta';
      delta.textContent = '+' + gained + '점';
      verdict.appendChild(delta);
    }
    fb.appendChild(verdict);

    var line = document.createElement('div');
    line.className = 'answer-line';
    var pieces = [K.toComma(v)];
    if (v >= 10000n) pieces.push(K.toMixed(v));
    pieces.push(K.toHangul(v, { spaced: state.spaced }));
    pieces.forEach(function (p, i) {
      if (i > 0) {
        var sep = document.createElement('span');
        sep.className = 'sep';
        sep.textContent = '=';
        line.appendChild(sep);
      }
      var b = document.createElement('b');
      b.textContent = p;
      line.appendChild(b);
    });
    fb.appendChild(line);

    var rows = K.explain(v);
    if (rows.length > 1) {
      var table = document.createElement('table');
      table.className = 'breakdown';
      table.innerHTML = '<thead><tr><th>자리</th><th>숫자</th><th>읽기</th></tr></thead>';
      var tbody = document.createElement('tbody');
      rows.forEach(function (r) {
        var tr = document.createElement('tr');
        var td1 = document.createElement('td');
        td1.className = 'u';
        td1.textContent = r.unit || '일';
        var td2 = document.createElement('td');
        td2.textContent = r.digits + r.unit;
        var td3 = document.createElement('td');
        td3.className = 'h';
        td3.textContent = r.hangul;
        tr.appendChild(td1); tr.appendChild(td2); tr.appendChild(td3);
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      fb.appendChild(table);
    }

    if (!allOk) {
      var t = tipFor(v);
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
    state.current = nextValue();
    el.result.hidden = true;
    el.form.hidden = false;
    el.question.hidden = false;
    el.prompt.hidden = false;
    renderQuestion();
    renderStats();
  }

  function submit() {
    var v = state.current;
    var active = activeFields();
    var allOk = true;

    active.forEach(function (key) {
      var name = key.charAt(0).toUpperCase() + key.slice(1);
      var raw = el['input' + name].value;
      var res = key === 'mixed' ? gradeMixed(raw, v)
        : key === 'hangul' ? gradeHangul(raw, v)
          : gradeDigits(raw, v);
      setFieldState(name, res.ok ? 'is-good' : 'is-bad', res.msg);
      el['input' + name].disabled = true;
      if (!res.ok) allOk = false;
    });

    state.asked++;
    var gained = 0;
    if (allOk) {
      state.correct++;
      state.streak++;
      gained = pointsFor(v, state.streak);
      state.score += gained;
      if (state.streak > state.best.streak) {
        state.best.streak = state.streak;
        savePrefs();
      }
    } else {
      state.streak = 0;
    }

    beep(allOk ? 'good' : 'bad');
    renderFeedback(allOk, gained);
    renderPlaceTable(v);
    el.placeTable.hidden = state.mode === 'reverse';
    el.btnSubmit.textContent = '다음 문제 →';
    el.btnHint.disabled = true;
    el.btnSkip.disabled = true;
    state.phase = 'reveal';
    renderStats();
    el.btnSubmit.focus();
  }

  function skip() {
    if (state.phase !== 'answer') return;
    var active = activeFields();
    active.forEach(function (key) {
      var name = key.charAt(0).toUpperCase() + key.slice(1);
      el['input' + name].disabled = true;
      setFieldState(name, 'is-bad', '');
    });
    state.asked++;
    state.streak = 0;
    beep('bad');
    renderFeedback(false, 0);
    renderPlaceTable(state.current);
    el.placeTable.hidden = state.mode === 'reverse';
    el.btnSubmit.textContent = '다음 문제 →';
    el.btnHint.disabled = true;
    el.btnSkip.disabled = true;
    state.phase = 'reveal';
    renderStats();
    el.btnSubmit.focus();
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
    el.placeTable.hidden = true;
    el.question.hidden = true;
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
      var b = e.target.closest('button[data-level]');
      if (!b || b.dataset.level === state.levelId) return;
      state.levelId = b.dataset.level;
      savePrefs();
      syncToggles();
      startRound();
    });

    el.displayGroup.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-toggle]');
      if (!b) return;
      if (b.dataset.toggle === 'spaced') state.spaced = !state.spaced;
      else state.alwaysPlaces = !state.alwaysPlaces;
      savePrefs();
      syncToggles();
      if (state.phase === 'answer') renderQuestion();
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
      if (state.phase === 'answer') submit();
      else if (state.phase === 'reveal') advance();
    });

    el.btnHint.addEventListener('click', function () {
      el.placeTable.hidden = !el.placeTable.hidden;
      focusFirstField();
    });

    el.btnSkip.addEventListener('click', skip);
    el.btnRestart.addEventListener('click', startRound);

    // reveal 상태에서는 어디서 Enter 를 눌러도 다음 문제로.
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' || e.isComposing) return;
      if (state.phase === 'reveal' && e.target.tagName !== 'BUTTON') {
        e.preventDefault();
        advance();
      }
    });
  }

  // ------------------------------------------------------------------ 시작

  function cache() {
    var ids = {
      modeGroup: 'mode-group', levelGroup: 'level-group', displayGroup: 'display-group',
      levelHint: 'level-hint', guide: 'guide', btnGuide: 'btn-guide', btnSound: 'btn-sound',
      statScore: 'stat-score', statStreak: 'stat-streak', statAccuracy: 'stat-accuracy',
      statRight: 'stat-right', statRightLabel: 'stat-right-label', statRightTile: 'stat-right-tile',
      prompt: 'prompt', question: 'question', placeTable: 'place-table',
      form: 'answer-form', feedback: 'feedback',
      fieldMixed: 'field-mixed', inputMixed: 'input-mixed', msgMixed: 'msg-mixed',
      fieldHangul: 'field-hangul', inputHangul: 'input-hangul', msgHangul: 'msg-hangul',
      fieldDigits: 'field-digits', inputDigits: 'input-digits', msgDigits: 'msg-digits',
      btnSubmit: 'btn-submit', btnHint: 'btn-hint', btnSkip: 'btn-skip',
      result: 'result', resultTitle: 'result-title', resultScore: 'result-score',
      resultDetail: 'result-detail', btnRestart: 'btn-restart'
    };
    Object.keys(ids).forEach(function (k) { el[k] = document.getElementById(ids[k]); });
  }

  loadPrefs();
  cache();
  renderLevels();
  syncToggles();
  bind();
  startRound();
})();
