/* 시간 계산 게임 */
(function () {
  'use strict';

  var D = window.Duration;
  var STORE_KEY = 'time-game/v1';
  var CHALLENGE_SECONDS = 60;
  var UNLOCK_STREAK = 3;   // 한 단계에서 이만큼 연속으로 맞히면 다음 단계가 열린다

  var STAGES = [
    { id: 'split', label: '큰 단위로', hint: '115분 = □시간 □분 — 60씩 묶어 큰 단위로 바꾸기' },
    { id: 'join', label: '작은 단위로', hint: '1시간 3분 46초 = □분 □초 — 60을 곱해 작은 단위로 바꾸기' },
    { id: 'compare', label: '더 긴 시간', hint: '단위를 맞춰서 더 긴 (짧은) 시간 고르기' },
    { id: 'diff', label: '시간의 차', hint: '두 시간이 몇 분 몇 초 차이 나는지 — 받아내림은 60초' },
    { id: 'story', label: '학습지 문제', hint: '어느 것을 몇 분 몇 초 더 짧게 (길게) 했는지 차례로' },
    { id: 'mix', label: '혼합', hint: '모든 문제 무작위 — 실전 연습' }
  ];

  // 문제 종류마다 기본 점수. 여기에 연속 보너스가 붙는다.
  var POINTS = { split: 10, join: 10, compare: 8, diff: 16, story: 20 };

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
    pick: null,           // 학습지 문제에서 고른 활동
    score: 0,
    streak: 0,
    asked: 0,
    correct: 0,
    endsAt: 0,
    timerId: null
  };

  var el = {};
  var timeInputs = [];    // {unit, input}

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
    return D.KINDS[Math.floor(Math.random() * D.KINDS.length)];
  }

  function signature(q) {
    return q.kind + ':' + JSON.stringify(q.given || q.items);
  }

  function nextQuestion() {
    var q = D.generate(kindForStage());
    // 같은 문제가 연달아 나오면 한 번 더 뽑는다.
    if (signature(q) === state.lastSig) q = D.generate(q.kind);
    state.lastSig = signature(q);
    return q;
  }

  // ------------------------------------------------------------------ 글

  function askWord(q) {
    return q.ask === 'longer' ? '길게' : '짧게';
  }

  function promptFor(q) {
    if (q.kind === 'split' || q.kind === 'join') return '□ 안에 알맞은 수를 써 보세요';
    if (q.kind === 'compare') return (q.ask === 'longer' ? '더 긴' : '더 짧은') + ' 시간을 골라 보세요';
    if (q.kind === 'diff') {
      return D.josa(D.format(q.items[0]), '과와') + ' ' + D.josa(D.format(q.items[1]), '은는') +
        ' 몇 분 몇 초 차이가 날까요?';
    }
    return D.josa(q.name, '은는') + ' ' + D.josa(q.acts[0].name, '과와') + ' ' + q.acts[1].name +
      ' 중 어느 것을 몇 분 몇 초 더 ' + askWord(q) + ' 했는지 차례로 써 보세요';
  }

  function storyText(q) {
    return '나는 ' + D.format(q.items[0]) + ' 동안 ' + q.acts[0].and + ', ' +
      D.format(q.items[1]) + ' 동안 ' + q.acts[1].end + '.';
  }

  /** 1시간 = 60분 / 1분 = 60초 중 이 문제에 필요한 것 */
  function unitFact(q) {
    var has = function (u) { return (q.given ? [q.given] : q.items).some(function (x) { return x[u] !== undefined; }); };
    if (q.kind === 'split') return d.m !== undefined ? '1시간 = 60분' : '1분 = 60초';
    var facts = [];
    if (has('h') || (q.units && q.units.indexOf('h') >= 0)) facts.push('1시간 = 60분');
    if (has('s')) facts.push('1분 = 60초');
    return facts.join(', ');
  }

  function hintFor(q) {
    if (q.kind === 'split') {
      var u = D.UNIT_NAME[q.given.m !== undefined ? 'm' : 's'];
      return unitFact(q) + '이에요. ' + D.format(q.given) + '에서 60' + u + '씩 몇 번 묶을 수 있는지 세어 보세요. ' +
        '100' + u + '이 아니에요!';
    }
    if (q.kind === 'join') {
      return unitFact(q) + '이에요. 큰 단위에 60을 곱해서 ' + D.UNIT_NAME[q.units[0]] + '로 바꾼 뒤 더해요.';
    }
    var withH = q.items.filter(function (x) { return x.h; })[0];
    var conv = withH ? ' ' + D.format(withH) + '부터 「□분 □초」로 바꿔 보세요.' : '';
    if (q.kind === 'compare') return '단위를 똑같이 맞춰서 비교해요. ' + unitFact(q) + '.' + conv;
    return '두 시간을 「□분 □초」로 맞춘 뒤 큰 쪽에서 빼요.' + conv +
      ' 초끼리 뺄 수 없으면 1분을 60초로 바꿔 내려요.';
  }

  /** 틀린 답에 붙는 설명 {head, body} */
  function tipFor(q, value, res) {
    switch (res.mistake) {
      case 'hundred':
        if (q.kind === 'split' || q.kind === 'join') {
          return {
            head: (q.kind === 'split' && q.given.s !== undefined) || (q.kind === 'join' && q.units[0] === 's')
              ? '1분은 100초가 아니라 60초예요.' : '1시간은 100분이 아니라 60분이에요.',
            body: D.convertLine(q.given, q.units)
          };
        }
        return {
          head: '1시간은 100분이 아니라 60분이에요.',
          body: q.items.filter(function (x) { return x.h; }).map(function (x) { return D.convertLine(x, ['m', 's']); }).join(' · ')
        };
      case 'unnormalized': {
        var low = q.units[q.units.length - 1];
        var up = D.ORDER[D.ORDER.indexOf(low) - 1];
        return {
          head: '60이 넘으면 큰 단위로 올려요.',
          body: (value[low] || 0) + D.UNIT_NAME[low] + ' = ' + D.format(D.split((value[low] || 0) * (low === 's' ? 1 : 60), [up, low])) +
            '이에요. 크기는 맞았어요.'
        };
      }
      case 'borrow100':
        return {
          head: '1분을 내려 받으면 100초가 아니라 60초예요.',
          body: D.diffSteps(q.items).sub
        };
      case 'noBorrow': {
        var c = D.columnSub(q.items[0], q.items[1], 60, 60);
        return {
          head: '초끼리 뺄 수 없으면 1분을 60초로 바꿔 내려요.',
          body: c.a.s + '초에서 ' + c.b.s + '초를 뺄 수 없다고 ' + c.b.s + ' − ' + c.a.s + '처럼 거꾸로 빼면 안 돼요. ' +
            D.diffSteps(q.items).sub
        };
      }
      case 'flip':
        if (q.kind === 'compare') {
          return {
            head: (q.ask === 'longer' ? '더 긴' : '더 짧은') + ' 것을 묻고 있어요.',
            body: compareLine(q)
          };
        }
        return {
          head: '시간은 맞았어요. 더 ' + askWord(q) + ' 한 것을 골라요.',
          body: D.josa(q.acts[q.answer.pick].name, '을를') + ' ' + D.format(q.items[q.answer.pick]) + ' 동안 했어요. ' + compareLine(q)
        };
      default:
        if (q.kind === 'split' || q.kind === 'join') return { head: unitFact(q) + '이에요.', body: D.convertLine(q.given, q.units) };
        if (q.kind === 'compare') return { head: '단위를 맞춰서 비교해요.', body: compareLine(q) };
        if (q.kind === 'story' && !res.pickOk) {
          return { head: '어느 쪽이 더 ' + askWord(q) + '인지도 다시 보세요.', body: compareLine(q) };
        }
        return { head: '「□분 □초」로 맞춘 뒤 빼요.', body: D.diffSteps(q.items).sub };
    }
  }

  /** 두 시간을 맞출 단위. 분 단위 쌍은 「□분 □초」, 초 단위 쌍(200초와 3분 25초)은 「□초」 */
  function commonUnits(q) {
    return q.items.some(function (x) { return x.h !== undefined || (x.m !== undefined && x.s === undefined); })
      ? ['m', 's'] : ['s'];
  }

  /** '115분 0초 > 63분 46초' 처럼 같은 단위로 맞춘 비교 */
  function compareLine(q) {
    var units = commonUnits(q);
    var a = D.formatAll(D.split(D.toSec(q.items[0]), units), units);
    var b = D.formatAll(D.split(D.toSec(q.items[1]), units), units);
    return a + (D.longerIndex(q.items) === 0 ? ' > ' : ' < ') + b;
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

  function span(cls, text, parent) {
    var s = document.createElement('span');
    s.className = cls;
    s.textContent = text;
    if (parent) parent.appendChild(s);
    return s;
  }

  /**
   * 식을 「 = 」 마디마다 끊기지 않는 덩어리로 붙인다. 좁은 화면에서 「61분 / 1초」 처럼
   * 시간 하나가 두 줄로 갈라지지 않게 한다.
   */
  function appendEquation(parent, text) {
    text.split(' = ').forEach(function (part, i) {
      if (i) parent.appendChild(document.createTextNode(' = '));
      // 설명 문장이 붙은 긴 마디는 보통 글처럼 흐르게 둔다
      if (part.length > 24) parent.appendChild(document.createTextNode(part));
      else span('eq', part, parent);
    });
  }

  /** 「115분 = □시간 □분」, 「□분 □초 더 짧게」 */
  function buildTimeRow(q) {
    el.timeRow.innerHTML = '';
    timeInputs = [];
    if (q.given) {
      span('given', D.format(q.given), el.timeRow);
      span('op', '=', el.timeRow).setAttribute('aria-hidden', 'true');
    }
    q.units.forEach(function (u) {
      var box = document.createElement('label');
      box.className = 'unit-box';
      var input = document.createElement('input');
      input.type = 'text';
      input.inputMode = 'numeric';
      input.maxLength = 4;
      input.spellcheck = false;
      input.setAttribute('aria-label', D.UNIT_NAME[u]);
      box.appendChild(input);
      span('u', D.UNIT_NAME[u], box);
      el.timeRow.appendChild(box);
      timeInputs.push({ unit: u, input: input });
    });
    if (q.kind === 'story') span('tail', '더 ' + askWord(q), el.timeRow);
  }

  /** 두 시간 칸. 비교 문제에서는 누르는 버튼이다 */
  function buildPair(q) {
    el.pair.innerHTML = '';
    q.items.forEach(function (d, i) {
      var tile;
      if (q.kind === 'compare') {
        tile = document.createElement('button');
        tile.type = 'button';
        tile.className = 'tile choice';
        tile.dataset.index = String(i);
        var k = document.createElement('kbd');
        k.textContent = String(i + 1);
        tile.appendChild(k);
      } else {
        tile = document.createElement('div');
        tile.className = 'tile';
      }
      span('tile-text', D.format(d), tile);
      el.pair.appendChild(tile);
    });
  }

  function buildPicks(q) {
    el.picks.innerHTML = '';
    q.acts.forEach(function (a, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'choice';
      b.dataset.index = String(i);
      b.setAttribute('aria-pressed', 'false');
      var k = document.createElement('kbd');
      k.textContent = String(i + 1);
      b.appendChild(k);
      b.appendChild(document.createTextNode(a.name));
      el.picks.appendChild(b);
    });
  }

  function setPick(i) {
    if (state.phase !== 'answer') return;
    state.pick = i;
    Array.prototype.forEach.call(el.picks.children, function (b, j) {
      b.setAttribute('aria-pressed', String(i === j));
    });
    setMsg(el.fieldPick, el.msgPick, null, '');
  }

  function renderQuestion() {
    var q = state.q;
    state.hint = false;
    state.pick = null;
    el.prompt.textContent = promptFor(q);

    var isStory = q.kind === 'story';
    el.story.hidden = !isStory;
    if (isStory) {
      el.storyName.textContent = q.name;
      el.storyText.textContent = storyText(q);
    }
    el.pair.hidden = !(q.kind === 'compare' || q.kind === 'diff');
    if (!el.pair.hidden) buildPair(q);

    el.fieldPick.hidden = !isStory;
    if (isStory) {
      buildPicks(q);
      el.labelPick.textContent = '더 ' + askWord(q) + ' 한 것';
      setMsg(el.fieldPick, el.msgPick, null, '');
    }
    el.fieldTime.hidden = q.kind === 'compare';
    if (q.units) {
      buildTimeRow(q);
      el.labelTime.textContent = isStory ? '몇 분 몇 초' : q.kind === 'diff' ? '차' : '바꾼 시간';
      setMsg(el.fieldTime, el.msgTime, null, '');
    } else {
      el.timeRow.innerHTML = '';
      timeInputs = [];
    }

    el.hintText.hidden = true;
    el.feedback.hidden = true;
    el.feedback.innerHTML = '';
    el.btnSubmit.textContent = '확인';
    el.btnSubmit.hidden = q.kind === 'compare';
    el.btnHint.disabled = false;
    el.btnHint.setAttribute('aria-pressed', 'false');
    el.btnSkip.disabled = false;
    state.phase = 'answer';
    focusAnswer();
  }

  function focusAnswer() {
    if (coarsePointer || !timeInputs.length || state.q.kind === 'compare') return;
    var empty = timeInputs.filter(function (t) { return !t.input.value; })[0] || timeInputs[0];
    empty.input.focus({ preventScroll: true });
  }

  /** 두 시간을 길이대로 막대로. 비교·차·학습지 문제의 풀이 */
  function barChart(q) {
    var wrap = document.createElement('div');
    wrap.className = 'bars';
    var secs = q.items.map(D.toSec);
    var max = Math.max(secs[0], secs[1]);
    var longer = D.longerIndex(q.items);
    var units = commonUnits(q);
    q.items.forEach(function (d, i) {
      var row = document.createElement('div');
      row.className = 'bar-row';
      span('bar-name', q.acts ? q.acts[i].name : D.format(d), row);
      var track = span('bar-track', '', row);
      var bar = span('bar' + (i === longer ? ' is-long' : ''), '', track);
      bar.style.width = (secs[i] / max * 100).toFixed(1) + '%';
      span('bar-value', D.formatAll(D.split(secs[i], units), units), row);
      wrap.appendChild(row);
    });
    if (q.kind !== 'compare') {
      var gap = document.createElement('div');
      gap.className = 'bar-gap';
      gap.textContent = '차이 ' + D.format(q.diff);
      wrap.appendChild(gap);
    }
    return wrap;
  }

  function answerLine(q) {
    var line = document.createElement('div');
    line.className = 'answer-line';
    function t(s) {
      // 「정답: 」 처럼 식이 아닌 조각은 그대로 둔다. 덩어리로 감싸면 끝의 빈칸이 사라진다.
      if (s.indexOf(' = ') >= 0) appendEquation(line, s);
      else line.appendChild(document.createTextNode(s));
    }
    function b(s) {
      var node = document.createElement('b');
      node.textContent = s;
      line.appendChild(node);
    }
    if (q.kind === 'split' || q.kind === 'join') {
      var conv = D.convertLine(q.given, q.units);
      var cut = conv.lastIndexOf(' = ');
      t(conv.slice(0, cut + 3));
      b(conv.slice(cut + 3));
      return line;
    }
    if (q.kind === 'compare') {
      t(compareLine(q) + ' → ' + (q.ask === 'longer' ? '더 긴' : '더 짧은') + ' 것은 ');
      b(D.format(q.items[q.answer]));
      return line;
    }
    var steps = D.diffSteps(q.items);
    steps.convert.forEach(function (c) { t(c); line.appendChild(document.createElement('br')); });
    t(steps.sub);
    if (q.kind === 'story') {
      line.appendChild(document.createElement('br'));
      t('정답: ');
      b(q.acts[q.answer.pick].name + ', ' + D.format(q.diff));
      t(' 더 ' + askWord(q));
    }
    return line;
  }

  function renderFeedback(q, value, res, gained, unlockedStage) {
    var fb = el.feedback;
    fb.innerHTML = '';

    var verdict = document.createElement('div');
    verdict.className = 'verdict ' + (res.correct ? 'good' : 'bad');
    verdict.appendChild(document.createTextNode(
      res.correct ? '정답이에요! 🎉' : value === null ? '정답을 확인해 보세요' : '아쉬워요'));
    if (res.correct && gained > 0) {
      span('score-delta', '+' + gained + '점', verdict);
    }
    fb.appendChild(verdict);

    if (unlockedStage) {
      var unlock = document.createElement('div');
      unlock.className = 'unlock';
      unlock.textContent = '🔓 ' + UNLOCK_STREAK + '연속 정답! 「' + unlockedStage.label + '」 단계가 열렸어요.';
      fb.appendChild(unlock);
    }

    fb.appendChild(answerLine(q));
    if (q.items) fb.appendChild(barChart(q));

    if (!res.correct && value !== null) {
      var tp = tipFor(q, value, res);
      var tip = document.createElement('div');
      tip.className = 'tip';
      var head = document.createElement('b');
      head.textContent = tp.head;
      tip.appendChild(head);
      tip.appendChild(document.createTextNode(' '));
      appendEquation(tip, tp.body);
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
    var q = state.q;
    if (q.kind === 'story' && state.pick === null) {
      setMsg(el.fieldPick, el.msgPick, 'is-bad', '더 ' + askWord(q) + ' 한 것을 골라 주세요.');
      return null;
    }
    var value = {};
    for (var i = 0; i < timeInputs.length; i++) {
      var r = D.parseNum(timeInputs[i].input.value);
      if (r.error) {
        setMsg(el.fieldTime, el.msgTime, 'is-bad', r.error === 'empty' ? '빈칸을 모두 채워 주세요. 없으면 0을 써요.' : '숫자로 써 주세요.');
        timeInputs[i].input.focus();
        return null;
      }
      value[timeInputs[i].unit] = r.value;
    }
    if (q.kind === 'story') value.pick = state.pick;
    return value;
  }

  function trySubmit() {
    if (state.q.kind === 'compare') return;
    var value = readAnswer();
    if (value !== null) submitAnswer(value);
  }

  /** 채점하고 풀이를 보여 준다. value 가 null 이면 '모르겠어요'. */
  function submitAnswer(value) {
    if (state.phase !== 'answer') return;
    var q = state.q;
    var res = value === null ? { correct: false, mistake: null, pickOk: false } : D.grade(q, value);

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
    markAnswer(q, value, res);

    el.hintText.hidden = true;
    el.btnHint.setAttribute('aria-pressed', 'false');
    state.hint = false;

    renderFeedback(q, value, res, gained, unlockedStage);
    el.btnSubmit.hidden = false;
    el.btnSubmit.textContent = '다음 문제 →';
    el.btnHint.disabled = true;
    el.btnSkip.disabled = true;
    renderStats();
    el.btnSubmit.focus({ preventScroll: true });
  }

  /** 입력칸·버튼에 맞고 틀림 표시 */
  function markAnswer(q, value, res) {
    if (q.kind === 'compare') {
      Array.prototype.forEach.call(el.pair.children, function (b, i) {
        b.disabled = true;
        if (i === q.answer) b.classList.add(value === i ? 'is-good' : 'is-answer');
        else if (value === i) b.classList.add('is-bad');
      });
      return;
    }
    if (q.kind === 'story') {
      Array.prototype.forEach.call(el.picks.children, function (b, i) {
        b.disabled = true;
        if (i === q.answer.pick) b.classList.add(value && value.pick === i ? 'is-good' : 'is-answer');
        else if (value && value.pick === i) b.classList.add('is-bad');
      });
    }
    var want = q.kind === 'story' ? q.diff : q.answer;
    timeInputs.forEach(function (t) {
      t.input.disabled = true;
      var ok = value !== null && value[t.unit] === want[t.unit];
      t.input.classList.add(ok ? 'is-good' : 'is-bad');
    });
    setMsg(el.fieldTime, el.msgTime, null, '');
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
    el.pair.hidden = true;
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

    el.pair.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-index]');
      if (b && state.phase === 'answer' && state.q.kind === 'compare') submitAnswer(Number(b.dataset.index));
    });
    el.picks.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-index]');
      if (b) { setPick(Number(b.dataset.index)); focusAnswer(); }
    });

    el.form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (state.phase === 'answer') trySubmit();
      else if (state.phase === 'reveal') advance();
    });

    el.timeRow.addEventListener('input', function () {
      if (state.phase === 'answer') setMsg(el.fieldTime, el.msgTime, null, '');
    });

    el.btnHint.addEventListener('click', toggleHint);
    el.btnSkip.addEventListener('click', function () { submitAnswer(null); });
    el.btnRestart.addEventListener('click', startRound);

    // Enter 는 여기서 한 번만 처리한다. 입력칸의 암묵적 제출과 겹치면 한 번에 두 단계가 넘어간다.
    // 칸이 여럿이면 비어 있는 다음 칸으로 넘어가고, 다 찼으면 확인한다.
    // 1·2 는 입력칸 밖에서 고르기다 (비교는 바로 채점, 학습지 문제는 활동 고르기).
    document.addEventListener('keydown', function (e) {
      if (e.isComposing || e.altKey || e.ctrlKey || e.metaKey) return;
      var tag = e.target.tagName;
      if ((e.key === '1' || e.key === '2') && tag !== 'INPUT' && state.phase === 'answer') {
        var i = Number(e.key) - 1;
        if (state.q.kind === 'compare') { e.preventDefault(); submitAnswer(i); }
        else if (state.q.kind === 'story') { e.preventDefault(); setPick(i); focusAnswer(); }
        return;
      }
      if (e.key !== 'Enter') return;
      if (tag === 'BUTTON' || tag === 'A' || state.phase === 'over') return;   // 버튼은 버튼대로 눌린다
      e.preventDefault();
      if (state.phase === 'reveal') { advance(); return; }
      var at = -1;
      timeInputs.forEach(function (t, k) { if (t.input === e.target) at = k; });
      if (at >= 0 && e.target.value) {
        var rest = timeInputs.slice(at + 1).concat(timeInputs.slice(0, at)).filter(function (t) { return !t.input.value; })[0];
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
      prompt: 'prompt', story: 'story', storyName: 'story-name', storyText: 'story-text',
      pair: 'pair', hintText: 'hint-text',
      form: 'answer-form', feedback: 'feedback',
      fieldPick: 'field-pick', picks: 'picks', labelPick: 'label-pick', msgPick: 'msg-pick',
      fieldTime: 'field-time', timeRow: 'time-row', labelTime: 'label-time', msgTime: 'msg-time',
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
