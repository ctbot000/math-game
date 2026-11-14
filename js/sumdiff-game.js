/* 합과 차로 두 수 구하기 게임 */
(function () {
  'use strict';

  var S = window.SumDiff;
  var STORE_KEY = 'sumdiff-game/v1';
  var CHALLENGE_SECONDS = 90;
  var UNLOCK_STREAK = 3;   // 한 단계에서 이만큼 연속으로 맞히면 다음 단계가 열린다

  var STAGES = [
    { id: 'remove', label: '차 빼기', hint: '△ + △ + 183 = 581 → △ + △ = □ — 전체에서 차를 빼기' },
    { id: 'half', label: '반으로', hint: '△ + △ = 398 → △ = □ — 똑같은 두 수로 나누기' },
    { id: 'guided', label: '차례로 풀기', hint: '학습지 풀이 순서대로 빈칸 채우기' },
    { id: 'story', label: '학습지 문제', hint: '문제를 읽고 두 수를 각각 구하기' },
    { id: 'tguided', label: '세 사람 차례로', hint: '□ = △ + 145, ○ = □ × 2 를 모두 △ 로 나타내 차례로 풀기' },
    { id: 'tstory', label: '세 사람 문제', hint: '세 사람이 모은 수 — 한 사람이 모은 수 구하기' },
    { id: 'mix', label: '혼합', hint: '모든 문제 무작위 — 실전 연습' }
  ];

  // 문제 종류마다 기본 점수. 여기에 연속 보너스가 붙는다.
  var POINTS = { remove: 10, half: 10, guided: 18, story: 22, tguided: 24, tstory: 28 };

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
    return q.kind + ':' + q.total + ':' + (q.three ? q.d : q.diff);
  }

  function nextQuestion() {
    // 학습지 문제 단계의 첫 문제는 학습지 그대로
    if ((state.stageId === 'story' || state.stageId === 'tstory') && state.lastSig === null) {
      var w = state.stageId === 'story' ? S.worksheet() : S.worksheetThree();
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
    if (q.kind === 'remove') return '△ + △ 는 얼마일까요?';
    if (q.kind === 'half') return '똑같은 수 두 개를 더했어요. △ 는 얼마일까요?';
    if (q.kind === 'guided') return '□와 △를 써서 차례로 풀어 보세요';
    if (q.kind === 'tguided') return '△, □, ○를 써서 차례로 풀어 보세요';
    return '문제를 읽고 답을 써 보세요';
  }

  /** 수 뒤의 조사. J(183, '을를') → '183을' */
  function J(n, pair) { return S.josa(String(n), pair); }
  /** 581이에요 / 382예요 */
  function isN(n) { return J(n, '이') === String(n) + '이' ? n + '이에요' : n + '예요'; }

  function hintFor(q) {
    if (q.three) {
      return '○는 □의 2배라서 □ 두 개예요. □ = △ + ' + q.d + '이니까 셋을 모두 △로 나타내면 △ 네 개와 ' +
        J(q.d, '이가') + ' 세 번 들어 있어요. 전체에서 ' + J(q.d, '을를') + ' 세 번 빼고, 반의 반을 구해요.';
    }
    var R = q.total - q.diff;
    if (q.kind === 'remove') {
      return '△ + △ 에 ' + J(q.diff, '을를') + ' 더하면 ' + isN(q.total) + '. 그러니까 △ + △ 는 ' + q.total + '에서 ' +
        J(q.diff, '을를') + ' 뺀 수예요. 받아내림을 하면 윗자리 숫자를 1 줄여요.';
    }
    if (q.kind === 'half') {
      return J(R, '을를') + ' 똑같이 둘로 나눠요. 자리마다 반을 구해서 더하면 쉬워요. 예: ' + S.halfLine(R === 398 ? 586 : 398);
    }
    return '큰 쪽에서 더 많은 ' + q.diff + '만큼을 떼어 내면 두 쪽이 똑같아져요. ' +
      '전체에서 ' + J(q.diff, '을를') + ' 빼고, 반으로 나누면 작은 수예요. 큰 수는 작은 수 + ' + q.diff + '.';
  }

  /** 세 사람 문제의 틀린 답 설명 */
  function tipForThree(q, value, res) {
    var T = q.total;
    var D = q.d;
    var four = q.a * 4;
    var sub = T + ' − ' + D * 3 + ' = ' + four + '  (' + D + ' + ' + D + ' + ' + D + ' = ' + D * 3 + ')';
    var name = function (k) { return q.names[['a', 'b', 'c'].indexOf(k)]; };
    switch (res.mistake) {
      case 'subOnce':
      case 'subTwice':
        return { head: J(D, '은는') + ' 세 번 들어 있어요. □에 한 번, ○ = □ + □에 두 번이에요.', body: sub };
      case 'added': case 'noSub': case 'noReduce': case 'swapColumns': case null:
        return { head: '전체에서 ' + J(D, '을를') + ' 세 번 빼요.', body: sub };
      case 'notHalved':
        return res.step === 'two'
          ? { head: '△ 네 개의 반이 △ 두 개예요.', body: four + '의 반은 ' + q.a * 2 }
          : { head: '△ 두 개의 반이 △ 하나예요.', body: q.a * 2 + '의 반은 ' + q.a };
      case 'halfWrong': {
        var n = res.step === 'two' ? four : q.a * 2;
        var v = value[res.step];
        return { head: v + ' + ' + v + ' = ' + (v * 2) + (J(v * 2, '이') === String(v * 2) + '이' ? '이라서 ' : '라서 ') + J(n, '이가') + ' 아니에요.', body: S.halfLine(n) };
      }
      case 'bigSame': case 'bigSub': case 'bigWrong':
        return { head: '□는 △보다 ' + D + ' 더 커요.', body: '□ = ' + q.a + ' + ' + D + ' = ' + q.b };
      case 'cPlus2':
        return { head: '2배는 2를 더하는 게 아니라 두 번 더하는 거예요.', body: '○ = ' + q.b + ' + ' + q.b + ' = ' + q.c };
      case 'cFromA':
        return { head: '○는 △가 아니라 □의 2배예요.', body: '○ = ' + q.b + ' × 2 = ' + q.c };
      case 'cWrong':
        return { head: '○ = □ × 2 = □ + □예요.', body: q.b + ' + ' + q.b + ' = ' + q.c };
      case 'wrongPerson':
        return {
          head: J(value.v, '은는') + ' ' + S.josa(S.callName(name(res.other)), '이가') + ' 모은 수예요.',
          body: '묻는 사람은 ' + isN(name(q.ask)) + '. ' + S.answerText(q)
        };
      default:
        return { head: '세 사람의 수를 더하면 ' + J(T, '이가') + ' 되어야 해요.', body: sub };
    }
  }

  /** 틀린 답에 붙는 설명 {head, body} */
  function tipFor(q, value, res) {
    if (q.three) return tipForThree(q, value, res);
    var T = q.total;
    var D = q.diff;
    var R = T - D;
    var sub = T + ' − ' + D + ' = ' + R;
    switch (res.mistake) {
      case 'added':
        return { head: '더하지 말고 빼요.', body: '△ + △ 에 ' + J(D, '을를') + ' 더해야 ' + J(T, '이가') + ' 되니까 △ + △ 는 ' + T + '보다 작아요. ' + sub };
      case 'noSub':
        return { head: '전체에서 차를 빼야 해요.', body: sub };
      case 'noReduce':
        return { head: '받아내림을 했으면 윗자리 숫자를 1 줄여요.', body: '아랫자리에 10을 빌려 주면 그 자리는 1 작아져요. ' + sub };
      case 'swapColumns':
        return { head: '위 숫자가 더 작으면 거꾸로 빼지 말고 윗자리에서 10을 빌려 와요.', body: sub };
      case 'notHalved':
        return { head: '△ + △ 는 △가 두 개예요. 반으로 나눠요.', body: S.halfLine(R) };
      case 'halfWrong': {
        var v = q.kind === 'guided' ? value.small : value.v;
        return { head: v + ' + ' + v + ' = ' + (v * 2) + (J(v * 2, '이') === String(v * 2) + '이' ? '이라서 ' : '라서 ') + J(R, '이가') + ' 아니에요.', body: S.halfLine(R) };
      }
      case 'bigSame':
      case 'bigSub':
      case 'bigWrong':
        return { head: '큰 수는 작은 수보다 ' + D + ' 더 커요.', body: '□ = △ + ' + D + ' = ' + q.small + ' + ' + D + ' = ' + q.big };
      case 'swapped':
        return {
          head: '두 수는 맞았는데 자리가 바뀌었어요.',
          body: S.josa(S.bigName(q), '이가') + ' ' + S.smallName(q) + '보다 많아요. ' + S.answerText(q)
        };
      case 'forgotHalf':
        return { head: J(R, '은는') + ' 똑같은 두 수를 더한 수예요. 반으로 나눠야 해요.', body: S.halfLine(R) };
      case 'sumOff':
        return { head: '두 수를 더하면 ' + J(T, '이가') + ' 되어야 해요.', body: value.a + ' + ' + value.b + ' = ' + (value.a + value.b) };
      case 'diffOff': {
        var hi = Math.max(value.a, value.b);
        var lo = Math.min(value.a, value.b);
        return { head: '더하면 ' + J(T, '은는') + ' 맞아요. 두 수의 차가 ' + J(D, '이가') + ' 되어야 해요.', body: hi + ' − ' + lo + ' = ' + (hi - lo) };
      }
      default:
        // 뺄셈에서 알아보지 못한 실수 (remove, 또는 guided 의 첫 칸)
        return { head: '전체에서 차를 빼요. 받아내림을 다시 살펴보세요.', body: sub };
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
    S.storyText(q).split(/(\d+)/).forEach(function (part, i) {
      if (i % 2) span('num', part, el.story);
      else if (part) el.story.appendChild(document.createTextNode(part));
    });
  }

  /** 「남자: □명, 여자: □명」 처럼 이름 옆에 답을 쓰는 문제 */
  function isAnswerRow(q) {
    return q.kind === 'story' || q.kind === 'tstory';
  }

  function buildLines(q) {
    el.eqLines.innerHTML = '';
    inputs = [];
    var isStory = isAnswerRow(q);
    el.eqLines.classList.toggle('is-long', q.kind === 'tguided');
    var row = null;
    q.lines.forEach(function (line, li) {
      var hasInput = line.some(function (t) { return typeof t !== 'string'; });
      // 서술 문제의 답은 「남자: □명, 여자: □명」 한 줄에
      if (isStory && row) {
        line.forEach(function (t) { addToken(row, t, q); });
        return;
      }
      row = document.createElement('div');
      row.className = 'eq-line' + (isStory ? ' is-names' : '') +
        ((q.kind === 'guided' || q.kind === 'tguided') && li === 0 ? ' is-note' : !hasInput ? ' is-given' : '');
      line.forEach(function (t) { addToken(row, t, q); });
      el.eqLines.appendChild(row);
    });
  }

  function addToken(row, t, q) {
    if (typeof t === 'string') {
      if (isAnswerRow(q)) {
        // 이름과 칸을 한 덩어리로 묶어 줄바꿈에 갈라지지 않게
        var box = span('name-box', '', row);
        span('eq-text', t, box);
        row = box;
      } else {
        // 「 = 」 마디마다 끊기지 않는 덩어리로. 좁은 화면에서 「= 666」 만 따로 떨어지지 않게
        var text = span('eq-text', '', row);
        t.split(' = ').forEach(function (part, i, parts) {
          span('eq-part', part + (i < parts.length - 1 ? ' =' : ''), text);
          if (i < parts.length - 1) text.appendChild(document.createTextNode(' '));
        });
      }
      return;
    }
    var target = isAnswerRow(q) ? row.lastChild : row;
    var input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'numeric';
    input.maxLength = 4;
    input.spellcheck = false;
    input.setAttribute('aria-label', labelFor(q, t.input));
    target.appendChild(input);
    if (t.unit) span('u', t.unit, target);
    inputs.push({ key: t.input, input: input });
  }

  function labelFor(q, key) {
    if (q.three) {
      return { v: q.names[['a', 'b', 'c'].indexOf(q.ask)], four: '△ 네 개', two: '△ + △', a: '△', b: '□', c: '○' }[key];
    }
    if (key === 'a') return q.scene.a;
    if (key === 'b') return q.scene.b;
    if (key === 'twice') return '△ + △';
    if (key === 'big') return '□';
    return '△';
  }

  function renderQuestion() {
    var q = state.q;
    state.hint = false;
    el.prompt.textContent = promptFor(q);
    el.story.hidden = !(q.scene || q.three);
    if (!el.story.hidden) renderStory(q);
    buildLines(q);
    el.labelLines.textContent = isAnswerRow(q) ? '답' : q.kind === 'guided' || q.kind === 'tguided' ? '풀이' : '□ 안에 알맞은 수';
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

  /** 테이프 그림. 같은 길이의 △(파랑)와 차(주황) 조각으로 각자의 수를 그린다 */
  function tapeDiagram(q) {
    var wrap = document.createElement('div');
    wrap.className = 'tape';
    var rows = S.tapeRows(q);
    var max = Math.max.apply(null, rows.map(function (r) { return r.value; }));
    var unit = q.three ? q.item.unit : q.scene ? q.scene.unit : '';
    rows.forEach(function (r) {
      span('tape-name', r.label, wrap);
      var track = span('tape-track', '', wrap);
      r.segs.forEach(function (sg) {
        var seg = span('seg seg-' + (sg.kind === 'diff' ? 'diff' : 'small'), (sg.kind === 'diff' ? '+' : '') + sg.v, track);
        seg.style.width = (sg.v / max * 100).toFixed(1) + '%';
      });
      span('tape-value', r.value + unit, wrap);
    });
    span('tape-total', q.three
      ? '모두 ' + q.total + unit
      : '합 ' + q.total + unit + ' · 차 ' + q.diff + unit, wrap);
    return wrap;
  }

  function renderFeedback(q, value, res, gained, unlockedStage) {
    var fb = el.feedback;
    fb.innerHTML = '';

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
    if (q.scene || q.three) {
      line.appendChild(document.createElement('br'));
      line.appendChild(document.createTextNode('정답: '));
      var b = document.createElement('b');
      b.textContent = q.kind === 'tstory'
        ? q.names[['a', 'b', 'c'].indexOf(q.ask)] + ' ' + q.answer.v + q.item.unit
        : S.answerText(q);
      line.appendChild(b);
    } else {
      line.appendChild(document.createTextNode(' → 정답 '));
      var b2 = document.createElement('b');
      b2.textContent = String(q.answer.v);
      line.appendChild(b2);
    }
    fb.appendChild(line);
    if (q.scene || q.three) fb.appendChild(tapeDiagram(q));

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
      prompt: 'prompt', story: 'story', hintText: 'hint-text',
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
