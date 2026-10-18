(() => {
  'use strict';

  /* ================== УТИЛИТЫ ================== */
  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const BYE = 'BYE';
  const SIZES = [4, 8, 16];
  const NS = 'http://www.w3.org/2000/svg';
  const html = document.documentElement;

  const SAMPLE = ['Львы', 'Орлы', 'Волки', 'Медведи', 'Тигры', 'Соколы', 'Драконы', 'Ястребы',
                  'Пантеры', 'Бизоны', 'Кобры', 'Акулы', 'Мустанги', 'Рыси', 'Грифоны', 'Зубры'];

  const pad = n => String(n).padStart(2, '0');
  const isTeam = t => t !== null && t !== undefined && t !== BYE;
  const FORMATS = {
    single: { label: 'На выбывание', short: 'Single Elimination' },
    double: { label: 'До двух поражений', short: 'Double Elimination' },
    roundrobin: { label: 'Каждый с каждым', short: 'Round Robin' },
    swiss: { label: 'Швейцарская система', short: 'Swiss' },
  };
  const FORMAT_HINTS = {
    single: 'Одно поражение — и команда покидает турнир.',
    double: 'После первого поражения команда падает в нижнюю сетку. Для старта нужна полная сетка.',
    roundrobin: 'Каждая команда играет с каждой. Места определяются по победам и разнице счёта.',
    swiss: 'Команды с близкими результатами встречаются между собой в нескольких раундах.',
  };
  const minTeams = (size, format = 'single') => format === 'single' ? size / 2 + 1 : 4;
  const plural = (n, [a, b, c]) => {
    const m = n % 100, d = n % 10;
    return (m > 10 && m < 20) ? c : d === 1 ? a : (d > 1 && d < 5) ? b : c;
  };
  const shuffle = arr => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };
  const retrigger = (el, cls) => {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  };
  const roundName = (r, R) => {
    const left = R - r;
    if (left === 1) return 'Финал';
    if (left === 2) return 'Полуфинал';
    if (left === 3) return 'Четвертьфинал';
    return `1/${2 ** (left - 1)} финала`;
  };

  /* ================== СОСТОЯНИЕ ================== */
  const state = {
    size: 8,
    count: 8,
    names: Array(16).fill(''),
    format: 'single',
    bestOf: 1,
    title: '',
    teams: [],     // {id, name}
    slots: [],     // слоты первого раунда: team | BYE
    baseOrder: [],
    scores: {},    // key -> { sig, a, b }
    rounds: [],    // вычисляется
    third: null,   // вычисляется
    lowerRounds: [],
    grandMatches: [],
    leagueRounds: [],
    swissRounds: [],
    swissMaxRounds: 0,
    matchesByKey: {},
    standings: [],
    historySaved: false,
    celebrationKey: null,
  };
  let refs = { m: {}, links: [] };

  /* ================== ЗВУК ================== */
  let audioContext = null;
  let audioEnabled = true;
  let musicRun = 0;
  const musicNodes = new Set();

  try { audioEnabled = localStorage.getItem('ts-sound') !== 'off'; } catch {}

  function getAudioContext() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    if (!audioContext) audioContext = new AudioCtx();
    if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
    return audioContext;
  }

  function tone(frequency, at, duration, volume, type = 'triangle', musical = false) {
    const ctx = getAudioContext();
    if (!ctx) return;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, at);
    gain.gain.setValueAtTime(.0001, at);
    gain.gain.exponentialRampToValueAtTime(volume, at + Math.min(.035, duration / 3));
    gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
    oscillator.connect(gain).connect(ctx.destination);
    if (musical) {
      musicNodes.add(oscillator);
      oscillator.addEventListener('ended', () => musicNodes.delete(oscillator), { once: true });
    }
    oscillator.start(at);
    oscillator.stop(at + duration + .04);
  }

  function playClick() {
    if (!audioEnabled) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(720, now);
    oscillator.frequency.exponentialRampToValueAtTime(430, now + .055);
    gain.gain.setValueAtTime(.035, now);
    gain.gain.exponentialRampToValueAtTime(.0001, now + .06);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start(now);
    oscillator.stop(now + .065);
  }

  function stopVictoryMusic() {
    musicRun++;
    musicNodes.forEach(node => { try { node.stop(); } catch {} });
    musicNodes.clear();
  }

  function playVictoryMusic() {
    if (!audioEnabled) return;
    stopVictoryMusic();
    const ctx = getAudioContext();
    if (!ctx) return;
    const startAt = ctx.currentTime + .08;
    const melody = [
      [0, 523.25, .24], [.26, 659.25, .24], [.52, 783.99, .32], [.88, 1046.50, .58],
      [1.52, 987.77, .24], [1.78, 783.99, .24], [2.04, 659.25, .34],
      [2.44, 783.99, .24], [2.70, 880.00, .24], [2.96, 987.77, .34], [3.38, 1046.50, 1.05],
    ];
    melody.forEach(([offset, frequency, duration]) => tone(frequency, startAt + offset, duration, .055, 'triangle', true));
    [[0, 130.81, 1.35], [1.50, 196.00, 1.7], [3.30, 130.81, 1.2]].forEach(([offset, frequency, duration]) => {
      tone(frequency, startAt + offset, duration, .025, 'sine', true);
    });
  }

  function syncSoundButton() {
    const button = $('#soundToggle');
    button.classList.toggle('is-muted', !audioEnabled);
    button.setAttribute('aria-pressed', String(audioEnabled));
    button.setAttribute('aria-label', audioEnabled ? 'Выключить звук' : 'Включить звук');
    button.title = audioEnabled ? 'Звук включён' : 'Звук выключен';
  }

  $('#soundToggle').addEventListener('click', () => {
    audioEnabled = !audioEnabled;
    try { localStorage.setItem('ts-sound', audioEnabled ? 'on' : 'off'); } catch {}
    if (audioEnabled) playClick();
    else stopVictoryMusic();
    syncSoundButton();
  });

  document.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button || button.disabled || button.id === 'soundToggle') return;
    playClick();
  }, true);

  syncSoundButton();

  /* ================== ТЕМА ================== */
  $('#themeToggle').addEventListener('click', () => {
    const next = html.dataset.theme === 'dark' ? 'light' : 'dark';
    html.classList.add('theming');
    html.dataset.theme = next;
    try { localStorage.setItem('ts-theme', next); } catch {}
    setTimeout(() => html.classList.remove('theming'), 450);
  });

  /* ================== НАСТРОЙКА ================== */
  if (false) {
  function saveSetup() {
    try {
      localStorage.setItem('ts-setup', JSON.stringify({
        size: state.size, count: state.count, names: state.names, title: $('#titleInput').value,
      }));
    } catch {}
  }
  function loadSetup() {
    try {
      const s = JSON.parse(localStorage.getItem('ts-setup') || 'null');
      if (!s) return;
      if (SIZES.includes(s.size)) state.size = s.size;
      state.count = Number(s.count) || state.size;
      if (Array.isArray(s.names)) {
        state.names = s.names.map(String).concat(Array(16).fill('')).slice(0, 16);
      }
      $('#titleInput').value = s.title || '';
    } catch {}
  }

  function clampCount() {
    state.count = Math.max(minTeams(state.size), Math.min(state.size, state.count));
  }

  function nameField(i) {
    const w = document.createElement('label');
    w.className = 'name-field pop-in';
    w.style.setProperty('--i', i);
    w.innerHTML = `<span class="seed">${pad(i + 1)}</span>
      <input type="text" maxlength="24" placeholder="Команда ${i + 1}" autocomplete="off" spellcheck="false">`;
    const inp = $('input', w);
    inp.value = state.names[i] || '';
    inp.addEventListener('input', () => { state.names[i] = inp.value; saveSetup(); });
    inp.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const next = w.nextElementSibling;
      next ? $('input', next).focus() : start();
    });
    return w;
  }

  function syncNameFields() {
    const host = $('#names');
    while (host.children.length > state.count) host.lastElementChild.remove();
    while (host.children.length < state.count) host.appendChild(nameField(host.children.length));
  }

  function renderSetup(bump = false) {
    clampCount();
    $$('#sizeSeg button').forEach(b => b.setAttribute('aria-checked', String(+b.dataset.size === state.size)));
    $('#sizeSeg').style.setProperty('--idx', SIZES.indexOf(state.size));

    const out = $('#countOut');
    out.textContent = state.count;
    if (bump) retrigger(out, 'bump');

    const min = minTeams(state.size), free = state.size - state.count;
    $('#minus').disabled = state.count <= min;
    $('#plus').disabled = state.count >= state.size;
    $('#countHint').textContent = `От ${min} до ${state.size}. ` +
      (free ? `Свободных мест: ${free} — эти слоты станут автопроходами.` : 'Сетка заполнена полностью.');
    $('#namesTitle').textContent = `Названия команд · ${state.count}`;
    syncNameFields();
    saveSetup();
  }

  $$('#sizeSeg button').forEach(b => b.addEventListener('click', () => {
    const next = +b.dataset.size;
    if (next === state.size) return;
    if (state.count === state.size) state.count = next; // «полная» сетка остаётся полной
    state.size = next;
    renderSetup(true);
  }));
  $('#minus').addEventListener('click', () => { state.count--; renderSetup(true); });
  $('#plus').addEventListener('click', () => { state.count++; renderSetup(true); });
  $('#titleInput').addEventListener('input', saveSetup);

  $('#sampleBtn').addEventListener('click', () => {
    SAMPLE.forEach((n, i) => { state.names[i] = n; });
    $$('#names input').forEach((inp, i) => { inp.value = state.names[i] || ''; });
    saveSetup();
  });
  $('#clearBtn').addEventListener('click', () => {
    state.names = Array(16).fill('');
    $$('#names input').forEach(inp => { inp.value = ''; });
    saveSetup();
  });

  /* ================== ПЕРЕКЛЮЧЕНИЕ ЭКРАНОВ ================== */
  function show(id) {
    if (id === 'setup') closeCeremony();
    $$('.view').forEach(v => v.classList.toggle('active', v.id === id));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function start() {
    clampCount();
    state.title = $('#titleInput').value.trim() || 'Турнир';
    state.teams = Array.from({ length: state.count }, (_, i) => ({
      id: i,
      name: (state.names[i] || '').trim() || `Команда ${i + 1}`,
    }));
    show('tournament');
    drawLots();
  }
  $('#startBtn').addEventListener('click', start);
  $('#backBtn').addEventListener('click', () => show('setup'));

  /* ================== ЖЕРЕБЬЁВКА ================== */
  function drawLots() {
    const teams = shuffle([...state.teams]);
    const pairs = state.size / 2;
    const order = shuffle([...Array(pairs).keys()]);
    const slots = Array(state.size).fill(BYE);

    // сначала по одной команде в каждую пару, затем добираем вторых — так автопроходы не слипаются
    teams.forEach((t, i) => {
      if (i < pairs) slots[order[i] * 2] = t;
      else slots[order[i - pairs] * 2 + 1] = t;
    });
    for (let p = 0; p < pairs; p++) {
      if (Math.random() < .5) [slots[p * 2], slots[p * 2 + 1]] = [slots[p * 2 + 1], slots[p * 2]];
    }
    state.slots = slots;
    state.picks = {};
    build();
  }

  /* ================== ЛОГИКА СЕТКИ ================== */
  function resolve(a, b, pickId) {
    if (a === null || b === null) return { winner: null, loser: null };           // ждём предыдущий раунд
    if (a === BYE && b === BYE)   return { winner: BYE, loser: BYE, auto: true };
    if (a === BYE)                return { winner: b, loser: BYE, auto: true };
    if (b === BYE)                return { winner: a, loser: BYE, auto: true };
    if (pickId === a.id)          return { winner: a, loser: b };
    if (pickId === b.id)          return { winner: b, loser: a };
    return { winner: null, loser: null };
  }

  function compute() {
    const R = Math.log2(state.size);
    const rounds = [];
    let entries = state.slots;

    for (let r = 0; r < R; r++) {
      const matches = [];
      for (let m = 0; m < entries.length / 2; m++) {
        const a = entries[2 * m], b = entries[2 * m + 1], key = `${r}-${m}`;
        const res = resolve(a, b, state.picks[key]);
        if (key in state.picks && (!res.winner || res.auto)) delete state.picks[key]; // выбор устарел
        matches.push({ key, a, b, ...res });
      }
      rounds.push(matches);
      entries = matches.map(x => x.winner);
    }

    const semis = rounds[R - 2];
    const a = semis[0].loser, b = semis[1].loser;
    const res = resolve(a, b, state.picks.third);
    if ('third' in state.picks && (!res.winner || res.auto)) delete state.picks.third;

    state.rounds = rounds;
    state.third = { key: 'third', a, b, ...res };
  }

  function findMatch(key) {
    if (key === 'third') return state.third;
    const [r, i] = key.split('-').map(Number);
    return state.rounds[r][i];
  }

  function pick(key, side) {
    const m = findMatch(key);
    const t = side ? m.b : m.a;
    if (!isTeam(t) || !isTeam(m.a) || !isTeam(m.b)) return;
    if (state.picks[key] === t.id) delete state.picks[key];
    else state.picks[key] = t.id;
    update();
  }

  $('#capture').addEventListener('click', e => {
    const btn = e.target.closest('.team');
    if (!btn || btn.disabled) return;
    pick(btn.closest('.match').dataset.key, +btn.dataset.side);
  });

  /* ================== ПОСТРОЕНИЕ DOM ================== */
  function makeMatch(key, delay) {
    const root = document.createElement('article');
    root.className = 'match';
    root.dataset.key = key;
    root.style.setProperty('--d', `${delay}ms`);
    root.innerHTML = [0, 1].map(s => `
      <button class="team" type="button" data-side="${s}">
        <span class="seed"></span><span class="tname"></span>
        <span class="tick"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>
      </button>`).join('');
    const rows = $$('.team', root).map(btn => ({ btn, seed: $('.seed', btn), name: $('.tname', btn) }));
    refs.m[key] = { root, rows };
    return root;
  }

  function build() {
    const R = Math.log2(state.size);
    refs = { m: {}, links: [] };

    const host = $('#bracket');
    host.innerHTML = '';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'links');
    svg.setAttribute('aria-hidden', 'true');
    host.appendChild(svg);

    const cols = document.createElement('div');
    cols.className = 'rounds';
    host.appendChild(cols);

    for (let r = 0; r < R; r++) {
      const col = document.createElement('section');
      col.className = 'round' + (r === R - 1 ? ' final' : '');
      const title = document.createElement('h3');
      title.className = 'round-title';
      title.textContent = roundName(r, R);
      const list = document.createElement('div');
      list.className = 'matches';
      const count = state.size / 2 ** (r + 1);
      for (let m = 0; m < count; m++) {
        const slot = document.createElement('div');
        slot.className = 'slot';
        slot.appendChild(makeMatch(`${r}-${m}`, r * 140 + m * 40));
        list.appendChild(slot);
      }
      col.append(title, list);
      cols.appendChild(col);
    }

    const th = $('#thirdHost');
    th.innerHTML = '';
    th.appendChild(makeMatch('third', R * 140));

    $('#capTitle').textContent = state.title;
    const n = state.teams.length;
    $('#capMeta').textContent =
      `${n} ${plural(n, ['команда', 'команды', 'команд'])} · сетка на ${state.size} · ` +
      new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });

    // сброс подиума
    $$('#podium .step').forEach(s => { s.classList.remove('filled'); $('.pname', s).textContent = '—'; });
    state.celebrationKey = null;
    closeCeremony();

    update(true);
    requestAnimationFrame(drawLinks);
  }

  /* ================== ОТРИСОВКА СОСТОЯНИЯ ================== */
  function paint(ref, m) {
    const live = isTeam(m.a) && isTeam(m.b);

    [m.a, m.b].forEach((t, i) => {
      const row = ref.rows[i];
      const k = t === null ? 'p' : t === BYE ? 'b' : 't' + t.id;

      if (row.btn.dataset.k !== k) {
        const had = row.btn.dataset.k !== undefined;
        row.btn.dataset.k = k;
        if (t === null) { row.seed.textContent = '·'; row.name.textContent = 'Ожидание'; }
        else if (t === BYE) { row.seed.textContent = '–'; row.name.textContent = 'Автопроход'; }
        else { row.seed.textContent = pad(t.id + 1); row.name.textContent = t.name; }
        if (had && isTeam(t)) retrigger(row.btn, 'enter');
      }

      row.btn.classList.toggle('is-empty', t === null);
      row.btn.classList.toggle('is-bye', t === BYE);
      row.btn.classList.toggle('is-win', !!m.winner && m.winner === t);
      row.btn.classList.toggle('is-lose', isTeam(m.winner) && isTeam(t) && m.winner !== t);
      row.btn.disabled = !live;
    });

    ref.root.classList.toggle('is-live', live && !m.winner);
    ref.root.classList.toggle('is-done', !!m.winner);
    ref.root.classList.toggle('is-auto', !!m.auto);

    // «хлопок» у нового победителя
    const w = isTeam(m.winner) && !m.auto ? String(m.winner.id) : '';
    const prev = ref.root.dataset.w;
    if (prev !== undefined && w !== '' && w !== prev) {
      retrigger(ref.rows[m.winner === m.a ? 0 : 1].btn, 'pop');
    }
    ref.root.dataset.w = w;
  }

  function setStep(sel, team) {
    const el = $(sel), name = $('.pname', el), txt = team ? team.name : '—';
    if (name.textContent !== txt) {
      name.textContent = txt;
      if (team) retrigger(el, 'bump');
    }
    el.classList.toggle('filled', !!team);
  }

  /* ================== ФИНАЛЬНОЕ НАГРАЖДЕНИЕ ================== */
  let ceremonyHideTimer;
  let ceremonyFxTimer;
  let ceremonyFocus = null;

  function closeCeremony() {
    const ceremony = $('#ceremony');
    clearTimeout(ceremonyFxTimer);
    stopVictoryMusic();
    if (ceremony.hidden) return;
    ceremony.classList.remove('show');
    ceremony.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('ceremony-open');
    clearTimeout(ceremonyHideTimer);
    ceremonyHideTimer = setTimeout(() => {
      ceremony.hidden = true;
      if (ceremonyFocus?.focus) ceremonyFocus.focus({ preventScroll: true });
    }, 360);
  }

  function celebrateWinners(first, second, third) {
    const ceremony = $('#ceremony');
    clearTimeout(ceremonyHideTimer);
    clearTimeout(ceremonyFxTimer);
    ceremonyFocus = document.activeElement;
    $('#ceremonyFirst').textContent = first.name;
    $('#ceremonySecond').textContent = second.name;
    $('#ceremonyThird').textContent = third.name;
    ceremony.hidden = false;
    ceremony.setAttribute('aria-hidden', 'false');
    document.body.classList.add('ceremony-open');
    ceremony.classList.remove('show');
    void ceremony.offsetWidth;
    ceremony.classList.add('show');
    playVictoryMusic();
    ceremonyFxTimer = setTimeout(() => {
      if (ceremony.classList.contains('show')) confetti();
    }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1350);
  }

  $('#ceremonyClose').addEventListener('click', closeCeremony);
  $('#ceremonyDone').addEventListener('click', closeCeremony);
  $('#ceremony').addEventListener('click', event => {
    if (event.target === event.currentTarget) closeCeremony();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !$('#ceremony').hidden) closeCeremony();
  });

  function paintMeta(initial) {
    const R = state.rounds.length;
    const fin = state.rounds[R - 1][0];
    const champ = isTeam(fin.winner) ? fin.winner : null;
    const second = isTeam(fin.loser) ? fin.loser : null;
    const third = isTeam(state.third.winner) ? state.third.winner : null;

    let played = 0;
    state.rounds.forEach(ms => ms.forEach(m => { if (m.winner && !m.auto) played++; }));
    const total = state.teams.length - 1;
    $('#statusText').textContent = champ ? 'Турнир завершён' : `Сыграно ${played} из ${total}`;
    $('#barFill').style.width = `${total ? (played / total) * 100 : 0}%`;

    $('#champ').classList.toggle('is-empty', !champ);
    if (champ) $('#champName').textContent = champ.name;

    setStep('.s1', champ);
    setStep('.s2', second);
    setStep('.s3', third);

    const celebrationKey = champ && second && third ? `${champ.id}:${second.id}:${third.id}` : null;
    if (celebrationKey && celebrationKey !== state.celebrationKey && !initial) {
      celebrateWinners(champ, second, third);
    }
    state.celebrationKey = celebrationKey;
  }

  function update(initial = false) {
    compute();
    state.rounds.forEach((ms, r) => ms.forEach((m, i) => paint(refs.m[`${r}-${i}`], m)));
    paint(refs.m.third, state.third);
    syncLinks();
    paintMeta(initial);
  }

  }

  /* ================== НОВЫЙ ДВИЖОК ТУРНИРОВ ================== */

  const copy = value => JSON.parse(JSON.stringify(value));
  const winsNeeded = () => Math.ceil(state.bestOf / 2);
  const teamCode = team => isTeam(team) ? `t${team.id}` : team === BYE ? 'bye' : 'wait';

  function saveSetupV2() {
    try {
      localStorage.setItem('ts-setup', JSON.stringify({
        size: state.size,
        count: state.count,
        names: state.names,
        title: $('#titleInput').value,
        format: state.format,
        bestOf: state.bestOf,
      }));
    } catch {}
  }

  function loadSetupV2() {
    try {
      const saved = JSON.parse(localStorage.getItem('ts-setup') || 'null');
      if (!saved) return;
      if (SIZES.includes(saved.size)) state.size = saved.size;
      state.count = Number(saved.count) || state.size;
      if (saved.format in FORMATS) state.format = saved.format;
      if ([1, 3, 5, 7].includes(Number(saved.bestOf))) state.bestOf = Number(saved.bestOf);
      if (Array.isArray(saved.names)) state.names = saved.names.map(String).concat(Array(16).fill('')).slice(0, 16);
      $('#titleInput').value = saved.title || '';
    } catch {}
  }

  function clampCountV2() {
    if (state.format === 'double') {
      state.count = state.size;
      return;
    }
    state.count = Math.max(minTeams(state.size, state.format), Math.min(state.size, state.count));
  }

  function nameFieldV2(index) {
    const wrapper = document.createElement('label');
    wrapper.className = 'name-field pop-in';
    wrapper.style.setProperty('--i', index);
    wrapper.innerHTML = `<span class="seed">${pad(index + 1)}</span><input type="text" maxlength="24" placeholder="Команда ${index + 1}" autocomplete="off" spellcheck="false">`;
    const input = $('input', wrapper);
    input.value = state.names[index] || '';
    input.addEventListener('input', () => {
      state.names[index] = input.value;
      saveSetupV2();
    });
    input.addEventListener('keydown', event => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      const next = wrapper.nextElementSibling;
      next ? $('input', next).focus() : startTournament();
    });
    return wrapper;
  }

  function syncNameFieldsV2() {
    const host = $('#names');
    while (host.children.length > state.count) host.lastElementChild.remove();
    while (host.children.length < state.count) host.appendChild(nameFieldV2(host.children.length));
  }

  function renderSetupV2(bump = false) {
    clampCountV2();
    $$('#sizeSeg button').forEach(button => button.setAttribute('aria-checked', String(+button.dataset.size === state.size)));
    $('#sizeSeg').style.setProperty('--idx', SIZES.indexOf(state.size));
    $('#formatSelect').value = state.format;
    $('#bestOfSelect').value = String(state.bestOf);
    $('#formatHint').textContent = FORMAT_HINTS[state.format];

    const output = $('#countOut');
    output.textContent = state.count;
    if (bump) retrigger(output, 'bump');

    const min = minTeams(state.size, state.format);
    const locked = state.format === 'double';
    $('#minus').disabled = locked || state.count <= min;
    $('#plus').disabled = locked || state.count >= state.size;
    if (locked) $('#countHint').textContent = `Полная сетка: ${state.size} команд.`;
    else if (state.format === 'single') {
      const free = state.size - state.count;
      $('#countHint').textContent = `От ${min} до ${state.size}. ` + (free ? `Свободных мест: ${free} — будут автопроходы.` : 'Сетка заполнена полностью.');
    } else $('#countHint').textContent = `От ${min} до ${state.size} команд.`;

    $('#namesTitle').textContent = `Названия команд · ${state.count}`;
    syncNameFieldsV2();
    saveSetupV2();
  }

  $$('#sizeSeg button').forEach(button => button.addEventListener('click', () => {
    const next = +button.dataset.size;
    if (next === state.size) return;
    if (state.count === state.size || state.format === 'double') state.count = next;
    state.size = next;
    renderSetupV2(true);
  }));
  $('#minus').addEventListener('click', () => { state.count--; renderSetupV2(true); });
  $('#plus').addEventListener('click', () => { state.count++; renderSetupV2(true); });
  $('#titleInput').addEventListener('input', saveSetupV2);
  $('#formatSelect').addEventListener('change', event => {
    state.format = event.target.value;
    if (state.format === 'double') state.count = state.size;
    renderSetupV2(true);
  });
  $('#bestOfSelect').addEventListener('change', event => {
    state.bestOf = Number(event.target.value);
    saveSetupV2();
  });
  $('#sampleBtn').addEventListener('click', () => {
    SAMPLE.forEach((name, index) => { state.names[index] = name; });
    $$('#names input').forEach((input, index) => { input.value = state.names[index] || ''; });
    saveSetupV2();
  });
  $('#clearBtn').addEventListener('click', () => {
    state.names = Array(16).fill('');
    $$('#names input').forEach(input => { input.value = ''; });
    saveSetupV2();
  });

  function showView(id) {
    if (id === 'setup') closeCeremonyV2();
    $$('.view').forEach(view => view.classList.toggle('active', view.id === id));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function scoreFor(key, a, b) {
    const signature = `${teamCode(a)}:${teamCode(b)}`;
    let score = state.scores[key];
    if (!score || score.sig !== signature) {
      score = { sig: signature, a: 0, b: 0 };
      state.scores[key] = score;
    }
    return score;
  }

  function resolveSeries(key, a, b) {
    if (a === null || b === null || a === undefined || b === undefined) return { winner: null, loser: null, score: [0, 0] };
    if (a === BYE && b === BYE) return { winner: BYE, loser: BYE, auto: true, score: [0, 0] };
    if (a === BYE) return { winner: b, loser: BYE, auto: true, score: [0, 0] };
    if (b === BYE) return { winner: a, loser: BYE, auto: true, score: [0, 0] };
    const score = scoreFor(key, a, b);
    const needed = winsNeeded();
    if (score.a >= needed) return { winner: a, loser: b, score: [score.a, score.b] };
    if (score.b >= needed) return { winner: b, loser: a, score: [score.a, score.b] };
    return { winner: null, loser: null, score: [score.a, score.b] };
  }

  const resolvedMatch = (key, a, b) => ({ key, a, b, ...resolveSeries(key, a, b) });

  function computeSingle() {
    const roundCount = Math.log2(state.size);
    const rounds = [];
    let entries = state.slots;
    for (let round = 0; round < roundCount; round++) {
      const matches = [];
      for (let index = 0; index < entries.length / 2; index++) {
        matches.push(resolvedMatch(`${round}-${index}`, entries[index * 2], entries[index * 2 + 1]));
      }
      rounds.push(matches);
      entries = matches.map(match => match.winner);
    }
    const semifinals = rounds[roundCount - 2];
    const third = resolvedMatch('third', semifinals[0].loser, semifinals[1].loser);
    state.rounds = rounds;
    state.third = third;
    state.lowerRounds = [];
    state.grandMatches = [];
    state.matchesByKey = Object.fromEntries([...rounds.flat(), third].map(match => [match.key, match]));
    const final = rounds.at(-1)[0];
    state.summary = {
      complete: isTeam(final.winner) && isTeam(third.winner),
      first: isTeam(final.winner) ? final.winner : null,
      second: isTeam(final.loser) ? final.loser : null,
      third: isTeam(third.winner) ? third.winner : null,
    };
  }

  function computeDouble() {
    const roundCount = Math.log2(state.size);
    const upper = [];
    let entries = state.baseOrder;
    for (let round = 0; round < roundCount; round++) {
      const matches = [];
      for (let index = 0; index < entries.length / 2; index++) {
        matches.push(resolvedMatch(`u-${round}-${index}`, entries[index * 2], entries[index * 2 + 1]));
      }
      upper.push(matches);
      entries = matches.map(match => match.winner);
    }

    const lower = [];
    let previous = [];
    for (let index = 0; index < upper[0].length / 2; index++) {
      previous.push(resolvedMatch(`l-0-${index}`, upper[0][index * 2].loser, upper[0][index * 2 + 1].loser));
    }
    lower.push(previous);
    for (let upperRound = 1; upperRound < roundCount; upperRound++) {
      const major = upper[upperRound].map((match, index) => resolvedMatch(`l-${upperRound * 2 - 1}-${index}`, previous[index]?.winner ?? null, match.loser));
      lower.push(major);
      previous = major;
      if (upperRound < roundCount - 1) {
        const minor = [];
        for (let index = 0; index < previous.length / 2; index++) {
          minor.push(resolvedMatch(`l-${upperRound * 2}-${index}`, previous[index * 2].winner, previous[index * 2 + 1].winner));
        }
        lower.push(minor);
        previous = minor;
      }
    }

    const upperChampion = upper.at(-1)[0].winner;
    const lowerChampion = previous[0]?.winner ?? null;
    const grand = resolvedMatch('grand', upperChampion, lowerChampion);
    const resetRequired = isTeam(grand.winner) && grand.winner === lowerChampion;
    const reset = resolvedMatch('grand-reset', resetRequired ? upperChampion : null, resetRequired ? lowerChampion : null);
    const deciding = resetRequired ? reset : grand;

    state.rounds = upper;
    state.lowerRounds = lower;
    state.grandMatches = [grand, reset];
    const all = [...upper.flat(), ...lower.flat(), grand, reset];
    state.matchesByKey = Object.fromEntries(all.map(match => [match.key, match]));
    state.summary = {
      complete: isTeam(deciding.winner),
      first: isTeam(deciding.winner) ? deciding.winner : null,
      second: isTeam(deciding.loser) ? deciding.loser : null,
      third: isTeam(previous[0]?.loser) ? previous[0].loser : null,
    };
  }

  function roundRobinSchedule(teams) {
    const list = [...teams];
    if (list.length % 2) list.push(BYE);
    const rounds = [];
    for (let round = 0; round < list.length - 1; round++) {
      const matches = [];
      for (let index = 0; index < list.length / 2; index++) {
        const a = list[index], b = list[list.length - 1 - index];
        if (a !== BYE && b !== BYE) matches.push({ key: `rr-${round}-${matches.length}`, a, b });
      }
      rounds.push(matches);
      list.splice(1, 0, list.pop());
    }
    return rounds;
  }

  function standingsFrom(matches) {
    const rows = new Map(state.teams.map(team => [team.id, { team, wins: 0, losses: 0, gamesFor: 0, gamesAgainst: 0, byes: 0 }]));
    matches.forEach(match => {
      if (!isTeam(match.winner)) return;
      const winner = rows.get(match.winner.id);
      winner.wins++;
      if (match.auto) winner.byes++;
      if (isTeam(match.loser)) rows.get(match.loser.id).losses++;
      if (!match.auto && isTeam(match.a) && isTeam(match.b)) {
        rows.get(match.a.id).gamesFor += match.score[0];
        rows.get(match.a.id).gamesAgainst += match.score[1];
        rows.get(match.b.id).gamesFor += match.score[1];
        rows.get(match.b.id).gamesAgainst += match.score[0];
      }
    });
    return [...rows.values()].sort((left, right) =>
      right.wins - left.wins ||
      (right.gamesFor - right.gamesAgainst) - (left.gamesFor - left.gamesAgainst) ||
      right.gamesFor - left.gamesFor ||
      left.team.id - right.team.id
    );
  }

  function computeRoundRobin() {
    state.leagueRounds = state.scheduleRounds.map(round => round.map(match => resolvedMatch(match.key, match.a, match.b)));
    const all = state.leagueRounds.flat();
    state.matchesByKey = Object.fromEntries(all.map(match => [match.key, match]));
    state.standings = standingsFrom(all);
    const complete = all.length > 0 && all.every(match => isTeam(match.winner));
    state.summary = {
      complete,
      first: complete ? state.standings[0]?.team : null,
      second: complete ? state.standings[1]?.team : null,
      third: complete ? state.standings[2]?.team : null,
    };
  }

  function swissPairKey(a, b) {
    return [a.id, b.id].sort((x, y) => x - y).join(':');
  }

  function addSwissRound() {
    const index = state.swissPairings.length;
    const previous = new Set();
    state.swissPairings.flat().forEach(match => {
      if (isTeam(match.a) && isTeam(match.b)) previous.add(swissPairKey(match.a, match.b));
    });
    let ordered;
    if (!index) ordered = [...state.baseOrder];
    else ordered = state.standings.map(row => row.team);

    const pairs = [];
    if (ordered.length % 2) {
      const usedByeIds = new Set(state.swissPairings.flat().filter(match => match.b === BYE && isTeam(match.a)).map(match => match.a.id));
      let byeIndex = -1;
      for (let i = ordered.length - 1; i >= 0; i--) {
        if (!usedByeIds.has(ordered[i].id)) { byeIndex = i; break; }
      }
      if (byeIndex < 0) byeIndex = ordered.length - 1;
      const [byeTeam] = ordered.splice(byeIndex, 1);
      pairs.push({ key: `sw-${index}-bye`, a: byeTeam, b: BYE });
    }

    while (ordered.length) {
      const a = ordered.shift();
      let opponentIndex = ordered.findIndex(team => !previous.has(swissPairKey(a, team)));
      if (opponentIndex < 0) opponentIndex = 0;
      const [b] = ordered.splice(opponentIndex, 1);
      pairs.push({ key: `sw-${index}-${pairs.length}`, a, b });
    }
    state.swissPairings.push(pairs);
  }

  function computeSwiss() {
    state.leagueRounds = state.swissPairings.map(round => round.map(match => resolvedMatch(match.key, match.a, match.b)));
    const all = state.leagueRounds.flat();
    state.matchesByKey = Object.fromEntries(all.map(match => [match.key, match]));
    state.standings = standingsFrom(all);
    const currentComplete = state.leagueRounds.at(-1)?.every(match => isTeam(match.winner));
    const complete = state.swissPairings.length === state.swissMaxRounds && currentComplete;
    state.summary = {
      complete,
      first: complete ? state.standings[0]?.team : null,
      second: complete ? state.standings[1]?.team : null,
      third: complete ? state.standings[2]?.team : null,
    };
    return currentComplete && state.swissPairings.length < state.swissMaxRounds;
  }

  function computeTournament() {
    if (state.format === 'single') computeSingle();
    else if (state.format === 'double') computeDouble();
    else if (state.format === 'roundrobin') computeRoundRobin();
    else return computeSwiss();
    return false;
  }

  function makeMatchV2(key, delay = 0) {
    const root = document.createElement('article');
    root.className = 'match';
    root.dataset.key = key;
    root.style.setProperty('--d', `${delay}ms`);
    root.innerHTML = [0, 1].map(side => `
      <button class="team" type="button" data-side="${side}">
        <span class="seed"></span><span class="tname"></span><span class="series-score"></span>
        <span class="tick"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>
      </button>`).join('');
    const rows = $$('.team', root).map(button => ({
      btn: button,
      seed: $('.seed', button),
      name: $('.tname', button),
      score: $('.series-score', button),
    }));
    refs.m[key] = { root, rows };
    return root;
  }

  function roundColumn(titleText, matches, delayBase = 0) {
    const column = document.createElement('section');
    column.className = 'round';
    const title = document.createElement('h3');
    title.className = 'round-title';
    title.textContent = titleText;
    const list = document.createElement('div');
    list.className = 'matches';
    matches.forEach((match, index) => {
      const slot = document.createElement('div');
      slot.className = 'slot';
      slot.appendChild(makeMatchV2(match.key, delayBase + index * 35));
      list.appendChild(slot);
    });
    column.append(title, list);
    return column;
  }

  function roundsLane(label, rounds, titleForRound) {
    const fragment = document.createDocumentFragment();
    if (label) {
      const laneTitle = document.createElement('h3');
      laneTitle.className = 'bracket-lane-title';
      laneTitle.textContent = label;
      fragment.appendChild(laneTitle);
    }
    const lane = document.createElement('div');
    lane.className = 'rounds';
    rounds.forEach((matches, index) => lane.appendChild(roundColumn(titleForRound(index, rounds.length), matches, index * 100)));
    fragment.appendChild(lane);
    return fragment;
  }

  function buildBracketDom() {
    const host = $('#bracket');
    host.innerHTML = '';
    host.classList.toggle('mobile-carousel', state.format === 'single');
    $('.stage-scroll').classList.toggle('round-gated', state.format === 'single');
    refs = { m: {}, links: [] };
    if (state.format === 'single') {
      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('class', 'links');
      svg.setAttribute('aria-hidden', 'true');
      host.appendChild(svg);
      host.appendChild(roundsLane('', state.rounds, (index, total) => roundName(index, total)));
      const thirdHost = $('#thirdHost');
      thirdHost.innerHTML = '';
      thirdHost.appendChild(makeMatchV2('third', state.rounds.length * 120));
      $('#thirdSection').hidden = false;
      $('.bottom').classList.remove('no-third');
    } else if (state.format === 'double') {
      host.classList.add('multi-bracket');
      host.appendChild(roundsLane('Верхняя сетка', state.rounds, (index, total) => roundName(index, total)));
      host.appendChild(roundsLane('Нижняя сетка', state.lowerRounds, index => `Нижняя · раунд ${index + 1}`));
      host.appendChild(roundsLane('Гранд-финал', [state.grandMatches], () => 'Финальные матчи'));
      $('#thirdSection').hidden = true;
      $('.bottom').classList.add('no-third');
    } else {
      host.classList.remove('multi-bracket');
      host.appendChild(roundsLane('', state.leagueRounds, index => `Раунд ${index + 1}`));
      $('#thirdSection').hidden = true;
      $('.bottom').classList.add('no-third');
    }
  }

  function paintMatch(ref, match) {
    if (!ref) return;
    const live = isTeam(match.a) && isTeam(match.b);
    [match.a, match.b].forEach((team, index) => {
      const row = ref.rows[index];
      const code = teamCode(team);
      if (row.btn.dataset.k !== code) {
        const had = row.btn.dataset.k !== undefined;
        row.btn.dataset.k = code;
        if (team === null || team === undefined) { row.seed.textContent = '·'; row.name.textContent = 'Ожидание'; }
        else if (team === BYE) { row.seed.textContent = '–'; row.name.textContent = 'Автопроход'; }
        else { row.seed.textContent = pad(team.id + 1); row.name.textContent = team.name; }
        if (had && isTeam(team)) retrigger(row.btn, 'enter');
      }
      row.score.hidden = state.bestOf === 1 || !isTeam(team);
      row.score.textContent = String(match.score?.[index] || 0);
      row.btn.classList.toggle('is-empty', team === null || team === undefined);
      row.btn.classList.toggle('is-bye', team === BYE);
      row.btn.classList.toggle('is-win', !!match.winner && match.winner === team);
      row.btn.classList.toggle('is-lose', isTeam(match.winner) && isTeam(team) && match.winner !== team);
      row.btn.disabled = !live;
    });
    ref.root.classList.toggle('is-live', live && !match.winner);
    ref.root.classList.toggle('is-done', !!match.winner);
    ref.root.classList.toggle('is-auto', !!match.auto);
  }

  function setPodiumStep(selector, team) {
    const element = $(selector), name = $('.pname', element), text = team ? team.name : '—';
    if (name.textContent !== text) {
      name.textContent = text;
      if (team) retrigger(element, 'bump');
    }
    element.classList.toggle('filled', !!team);
  }

  function renderStandings() {
    const host = $('#standingsHost');
    host.innerHTML = '';
    state.standings.forEach((row, index) => {
      const item = document.createElement('div');
      item.className = 'standing-row';
      item.innerHTML = `<span class="standing-place">${index + 1}</span><strong></strong><span>${row.wins}–${row.losses}</span><span class="standing-diff">${row.gamesFor}:${row.gamesAgainst}</span>`;
      $('strong', item).textContent = row.team.name;
      host.appendChild(item);
    });
  }

  function historyRecords() {
    try { return JSON.parse(localStorage.getItem('ts-history') || '[]'); }
    catch { return []; }
  }

  function historyTeam(team) {
    if (team === BYE) return 'Автопроход';
    return isTeam(team) ? team.name : 'Ожидание';
  }

  function historyMatch(match) {
    return {
      a: historyTeam(match.a),
      b: historyTeam(match.b),
      winner: isTeam(match.winner) ? match.winner.name : '',
      score: Array.isArray(match.score) ? match.score : [0, 0],
    };
  }

  function historyBracketSnapshot() {
    const group = (label, rounds, titleForRound) => ({
      label,
      rounds: rounds.map((matches, index) => ({
        title: titleForRound(index, rounds.length),
        matches: matches.map(historyMatch),
      })),
    });
    if (state.format === 'single') {
      return [
        group('Основная сетка', state.rounds, (index, total) => roundName(index, total)),
        group('3 место', [[state.third]], () => 'Матч за 3 место'),
      ];
    }
    if (state.format === 'double') {
      return [
        group('Верхняя сетка', state.rounds, (index, total) => roundName(index, total)),
        group('Нижняя сетка', state.lowerRounds, index => `Раунд ${index + 1}`),
        group('Гранд-финал', [state.grandMatches.filter(match => isTeam(match.a))], () => 'Финальные матчи'),
      ];
    }
    return [group('Турнирная сетка', state.leagueRounds, index => `Раунд ${index + 1}`)];
  }

  function saveHistory(summary) {
    if (state.historySaved || !summary.complete) return;
    const records = historyRecords();
    records.unshift({
      id: Date.now(),
      date: new Date().toISOString(),
      title: state.title,
      format: state.format,
      bestOf: state.bestOf,
      teams: state.teams.length,
      winners: [summary.first?.name, summary.second?.name, summary.third?.name],
      bracket: historyBracketSnapshot(),
    });
    try { localStorage.setItem('ts-history', JSON.stringify(records.slice(0, 20))); } catch {}
    state.historySaved = true;
  }

  function renderHistory() {
    const host = $('#historyList');
    const records = historyRecords();
    host.innerHTML = '';
    $('#historyClear').hidden = !records.length;
    if (!records.length) {
      const empty = document.createElement('div');
      empty.className = 'history-empty';
      empty.textContent = 'Завершённые турниры появятся здесь.';
      host.appendChild(empty);
      return;
    }
    records.forEach((record, recordIndex) => {
      const item = document.createElement('article');
      item.className = 'history-item';
      item.style.setProperty('--history-delay', `${Math.min(recordIndex, 8) * 55}ms`);
      const date = new Date(record.date).toLocaleString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      item.innerHTML = `<div class="history-item-head"><strong></strong><span></span></div><p class="history-meta"></p><div class="history-layout"><div class="history-bracket" aria-label="Турнирная сетка"></div><div class="history-winners" aria-label="Победители"></div></div>`;
      $('.history-item-head strong', item).textContent = record.title;
      $('.history-item-head span', item).textContent = date;
      $('.history-meta', item).textContent = `${FORMATS[record.format]?.label || record.format} · BO${record.bestOf} · ${record.teams} ${plural(record.teams, ['команда', 'команды', 'команд'])}`;
      const bracket = $('.history-bracket', item);
      if (Array.isArray(record.bracket) && record.bracket.length) {
        record.bracket.forEach(group => {
          const groupEl = document.createElement('div');
          groupEl.className = 'history-bracket-group';
          (group.rounds || []).forEach(round => {
            const roundEl = document.createElement('section');
            roundEl.className = 'history-round';
            const roundTitle = document.createElement('h3');
            roundTitle.className = 'history-round-title';
            roundTitle.textContent = group.label ? `${group.label} · ${round.title}` : round.title;
            roundEl.appendChild(roundTitle);
            (round.matches || []).forEach(match => {
              const matchEl = document.createElement('div');
              matchEl.className = 'history-mini-match';
              [match.a, match.b].forEach((name, side) => {
                const teamEl = document.createElement('div');
                teamEl.className = 'history-mini-team' + (match.winner === name ? ' won' : '');
                const teamName = document.createElement('b');
                teamName.textContent = name || 'Ожидание';
                const score = document.createElement('em');
                score.textContent = String(match.score?.[side] ?? 0);
                teamEl.append(teamName, score);
                matchEl.appendChild(teamEl);
              });
              roundEl.appendChild(matchEl);
            });
            groupEl.appendChild(roundEl);
          });
          bracket.appendChild(groupEl);
        });
      } else {
        const legacy = document.createElement('p');
        legacy.className = 'history-meta';
        legacy.textContent = 'Сетка недоступна для старой записи.';
        bracket.appendChild(legacy);
      }
      const winners = $('.history-winners', item);
      (record.winners || []).forEach((name, index) => {
        const winner = document.createElement('div');
        winner.className = 'history-winner';
        winner.innerHTML = `<span class="history-winner-place">${index + 1}</span><span><strong></strong><small>${['Чемпион', 'Серебро', 'Бронза'][index]}</small></span>`;
        $('strong', winner).textContent = name || '—';
        winners.appendChild(winner);
      });
      host.appendChild(item);
    });
  }

  function openHistory() {
    renderHistory();
    const modal = $('#historyModal');
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('ceremony-open');
    requestAnimationFrame(() => modal.classList.add('show'));
  }

  function closeHistory() {
    const modal = $('#historyModal');
    if (modal.hidden) return;
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('ceremony-open');
    setTimeout(() => { modal.hidden = true; }, 300);
  }

  $('#historyToggle').addEventListener('click', openHistory);
  $('#historyMenuBtn').addEventListener('click', openHistory);
  $('#historyClose').addEventListener('click', closeHistory);
  $('#historyModal').addEventListener('click', event => { if (event.target === event.currentTarget) closeHistory(); });
  $('#historyClear').addEventListener('click', () => {
    try { localStorage.removeItem('ts-history'); } catch {}
    renderHistory();
  });

  let ceremonyHideTimerV2;
  let ceremonyFxTimerV2;
  let ceremonyFocusV2 = null;

  function closeCeremonyV2() {
    const ceremony = $('#ceremony');
    clearTimeout(ceremonyFxTimerV2);
    stopVictoryMusic();
    if (ceremony.hidden) return;
    ceremony.classList.remove('show');
    ceremony.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('ceremony-open');
    clearTimeout(ceremonyHideTimerV2);
    ceremonyHideTimerV2 = setTimeout(() => {
      ceremony.hidden = true;
      if (ceremonyFocusV2?.focus) ceremonyFocusV2.focus({ preventScroll: true });
    }, 360);
  }

  function celebrateWinnersV2(first, second, third) {
    const ceremony = $('#ceremony');
    clearTimeout(ceremonyHideTimerV2);
    clearTimeout(ceremonyFxTimerV2);
    ceremonyFocusV2 = document.activeElement;
    $('#ceremonyFirst').textContent = first.name;
    $('#ceremonySecond').textContent = second.name;
    $('#ceremonyThird').textContent = third.name;
    ceremony.hidden = false;
    ceremony.setAttribute('aria-hidden', 'false');
    document.body.classList.add('ceremony-open');
    ceremony.classList.remove('show');
    void ceremony.offsetWidth;
    ceremony.classList.add('show');
    playVictoryMusic();
    ceremonyFxTimerV2 = setTimeout(() => { if (ceremony.classList.contains('show')) confetti(); }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1350);
  }

  $('#ceremonyClose').addEventListener('click', closeCeremonyV2);
  $('#ceremonyDone').addEventListener('click', closeCeremonyV2);
  $('#ceremony').addEventListener('click', event => { if (event.target === event.currentTarget) closeCeremonyV2(); });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (!$('#historyModal').hidden) closeHistory();
    else if (!$('#ceremony').hidden) closeCeremonyV2();
  });

  function paintMetaV2(initial) {
    const summary = state.summary || {};
    const matches = Object.values(state.matchesByKey);
    const played = matches.filter(match => isTeam(match.winner) && !match.auto).length;
    const total = Math.max(played, matches.filter(match => !match.auto).length);
    let status = summary.complete ? 'Турнир завершён' : `Сыграно ${played} из ${total}`;
    if (state.format === 'swiss' && !summary.complete) status = `Раунд ${state.swissPairings.length} из ${state.swissMaxRounds}`;
    $('#statusText').textContent = status;
    $('#barFill').style.width = `${total ? (played / total) * 100 : 0}%`;
    $('#champ').classList.toggle('is-empty', !summary.first);
    if (summary.first) $('#champName').textContent = summary.first.name;
    setPodiumStep('.s1', summary.first);
    setPodiumStep('.s2', summary.second);
    setPodiumStep('.s3', summary.third);
    if (state.format === 'roundrobin' || state.format === 'swiss') renderStandings();

    const key = summary.complete ? `${state.format}:${summary.first.id}:${summary.second.id}:${summary.third.id}` : null;
    if (key && key !== state.celebrationKey && !initial) celebrateWinnersV2(summary.first, summary.second, summary.third);
    state.celebrationKey = key;
    if (summary.complete) saveHistory(summary);
  }

  function paintTournament(initial = false) {
    Object.values(state.matchesByKey).forEach(match => paintMatch(refs.m[match.key], match));
    syncLinks();
    paintMetaV2(initial);
    syncMobileRoundGate(initial);
  }

  const mobileRoundMedia = matchMedia('(max-width: 640px)');

  function syncMobileRoundGate(initial = false) {
    const nav = $('#mobileRoundNav');
    const stage = $('.stage-scroll');
    const enabled = mobileRoundMedia.matches && state.format === 'single' && state.rounds.length;
    nav.hidden = !enabled;
    $('.swipe-hint').hidden = enabled;
    stage.classList.toggle('round-gated', !!enabled);
    if (!enabled) return;

    let activeRound = state.rounds.findIndex(matches => matches.some(match => !match.winner));
    if (activeRound < 0) activeRound = state.rounds.length - 1;
    const rounds = $$('.bracket > .rounds > .round');
    rounds.forEach((round, index) => {
      const locked = index > activeRound;
      round.classList.toggle('is-current', index === activeRound);
      round.classList.toggle('is-locked', locked);
      round.setAttribute('aria-hidden', String(locked));
    });

    $('#mobileRoundName').textContent = `${roundName(activeRound, state.rounds.length)} · ${activeRound + 1} из ${state.rounds.length}`;
    const dots = $('#mobileRoundDots');
    dots.innerHTML = state.rounds.map((_, index) => `<i class="${index < activeRound ? 'done' : index === activeRound ? 'active' : ''}"></i>`).join('');

    const previous = Number(stage.dataset.mobileRound ?? -1);
    stage.dataset.mobileRound = String(activeRound);
    if (previous === activeRound && !initial) return;
    requestAnimationFrame(() => {
      const target = rounds[activeRound];
      if (!target) return;
      const left = Math.max(0, stage.scrollLeft + target.getBoundingClientRect().left - stage.getBoundingClientRect().left - 16);
      stage.scrollTo({ left, behavior: initial ? 'auto' : 'smooth' });
      if (!initial && previous >= 0) toast(`${roundName(activeRound, state.rounds.length)} открыт`);
    });
  }

  mobileRoundMedia.addEventListener?.('change', () => syncMobileRoundGate(true));

  function buildTournament() {
    computeTournament();
    buildBracketDom();
    $('.hint-line').textContent = state.bestOf === 1
      ? 'Нажмите на команду, чтобы отдать ей победу. Клик по завершённому матчу сбрасывает его результат.'
      : `Каждый клик добавляет команде одну победу в серии BO${state.bestOf}. Клик по завершённому матчу сбрасывает счёт.`;
    $('#standingsWrap').hidden = !(state.format === 'roundrobin' || state.format === 'swiss');
    $('#capTitle').textContent = state.title;
    const count = state.teams.length;
    $('#capMeta').textContent = `${count} ${plural(count, ['команда', 'команды', 'команд'])} · ${new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}`;
    $('#formatBadge').textContent = `${FORMATS[state.format].short} · BO${state.bestOf}`;
    $$('#podium .step').forEach(step => { step.classList.remove('filled'); $('.pname', step).textContent = '—'; });
    closeCeremonyV2();
    paintTournament(true);
    if (state.format === 'single') requestAnimationFrame(drawLinks);
  }

  function updateTournament() {
    const advanceSwiss = computeTournament();
    if (advanceSwiss) {
      addSwissRound();
      buildTournament();
      toast(`Начался раунд ${state.swissPairings.length} из ${state.swissMaxRounds}`);
      return;
    }
    paintTournament(false);
  }

  function prepareTournament(reshuffle = true) {
    state.scores = {};
    state.historySaved = false;
    state.celebrationKey = null;
    if (reshuffle || !state.baseOrder.length) state.baseOrder = shuffle([...state.teams]);
    if (state.format === 'single') {
      const pairs = state.size / 2;
      const order = shuffle([...Array(pairs).keys()]);
      const slots = Array(state.size).fill(BYE);
      state.baseOrder.forEach((team, index) => {
        if (index < pairs) slots[order[index] * 2] = team;
        else slots[order[index - pairs] * 2 + 1] = team;
      });
      for (let pair = 0; pair < pairs; pair++) {
        if (Math.random() < .5) [slots[pair * 2], slots[pair * 2 + 1]] = [slots[pair * 2 + 1], slots[pair * 2]];
      }
      state.slots = slots;
    } else if (state.format === 'roundrobin') {
      state.scheduleRounds = roundRobinSchedule(state.baseOrder);
    } else if (state.format === 'swiss') {
      state.swissPairings = [];
      state.standings = state.baseOrder.map(team => ({ team, wins: 0, losses: 0, gamesFor: 0, gamesAgainst: 0 }));
      state.swissMaxRounds = state.teams.length <= 4 ? 3 : state.teams.length <= 8 ? 4 : 5;
      addSwissRound();
    }
    buildTournament();
  }

  function startTournament() {
    clampCountV2();
    state.format = $('#formatSelect').value;
    state.bestOf = Number($('#bestOfSelect').value);
    state.title = $('#titleInput').value.trim() || 'Турнир';
    state.teams = Array.from({ length: state.count }, (_, index) => ({
      id: index,
      name: (state.names[index] || '').trim() || `Команда ${index + 1}`,
    }));
    state.baseOrder = [];
    showView('tournament');
    prepareTournament(true);
  }

  function recordPoint(key, side) {
    const match = state.matchesByKey[key];
    if (!match || !isTeam(match.a) || !isTeam(match.b)) return;
    if (isTeam(match.winner)) delete state.scores[key];
    else {
      const score = scoreFor(key, match.a, match.b);
      if (side) score.b++;
      else score.a++;
    }
    state.historySaved = false;
    updateTournament();
  }

  $('#capture').addEventListener('click', event => {
    const button = event.target.closest('.team');
    if (!button || button.disabled) return;
    recordPoint(button.closest('.match').dataset.key, +button.dataset.side);
  });

  $('#startBtn').addEventListener('click', () => {
    if (!matchMedia('(max-width: 640px)').matches) {
      startTournament();
      return;
    }
    const setup = $('#setup');
    setup.classList.add('teams-step-active');
    requestAnimationFrame(() => {
      $('#teamsPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
      const firstEmpty = $$('#names input').find(input => !input.value.trim()) || $('#names input');
      setTimeout(() => firstEmpty?.focus({ preventScroll: true }), 420);
    });
  });
  $('#mobileStartBtn').addEventListener('click', startTournament);
  $('#backBtn').addEventListener('click', () => showView('setup'));
  $('#shuffleBtn').addEventListener('click', () => {
    prepareTournament(true);
    toast('Жеребьёвка проведена заново');
  });
  $('#resetBtn').addEventListener('click', () => {
    if (!Object.keys(state.scores).length) return toast('Пока нечего сбрасывать');
    state.scores = {};
    state.historySaved = false;
    state.celebrationKey = null;
    if (state.format === 'swiss') {
      state.swissPairings = [];
      state.standings = state.baseOrder.map(team => ({ team, wins: 0, losses: 0, gamesFor: 0, gamesAgainst: 0 }));
      addSwissRound();
    }
    buildTournament();
    toast('Результаты сброшены');
  });

  loadSetupV2();
  renderSetupV2();

  /* ================== СОЕДИНИТЕЛЬНЫЕ ЛИНИИ ================== */
  function elbow(x1, y1, x2, y2) {
    const xm = x1 + (x2 - x1) / 2, dy = y2 - y1;
    if (Math.abs(dy) < 2) return `M${x1} ${y1}H${x2}`;
    const s = Math.sign(dy), r = Math.min(10, Math.abs(dy) / 2, (x2 - x1) / 2);
    return `M${x1} ${y1}H${xm - r}Q${xm} ${y1} ${xm} ${y1 + s * r}V${y2 - s * r}Q${xm} ${y2} ${xm + r} ${y2}H${x2}`;
  }

  function drawLinks() {
    const host = $('#bracket');
    const svg = $('.links', host);
    if (!svg || !refs.m || !state.rounds.length || !host.offsetWidth) return;

    svg.setAttribute('width', host.scrollWidth);
    svg.setAttribute('height', host.scrollHeight);
    svg.innerHTML = '';
    refs.links = [];

    const R = state.rounds.length;
    for (let r = 0; r < R - 1; r++) {
      state.rounds[r].forEach((_, m) => {
        const from = refs.m[`${r}-${m}`].root;
        const to = refs.m[`${r + 1}-${m >> 1}`].root;
        // offsetLeft/Top не зависят от transform-анимаций
        const x1 = from.offsetLeft + from.offsetWidth;
        const y1 = from.offsetTop + from.offsetHeight / 2;
        const x2 = to.offsetLeft;
        const y2 = to.offsetTop + to.offsetHeight / 2;
        const d = elbow(x1, y1, x2, y2);

        const base = document.createElementNS(NS, 'path');
        base.setAttribute('class', 'base');
        base.setAttribute('d', d);
        const fill = document.createElementNS(NS, 'path');
        fill.setAttribute('class', 'fill');
        fill.setAttribute('d', d);
        fill.setAttribute('pathLength', '1');
        svg.append(base, fill);
        refs.links.push({ key: `${r}-${m}`, d, fill });
      });
    }
    syncLinks();
  }

  function syncLinks() {
    refs.links.forEach(l => {
      const [r, i] = l.key.split('-').map(Number);
      l.fill.classList.toggle('on', isTeam(state.rounds[r][i].winner));
    });
  }

  let resizeT;
  window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(drawLinks, 120); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => requestAnimationFrame(drawLinks));

  /* ================== ТОСТ + ОТМЕНА ================== */
  let toastT;
  function hideToast() { $('#toast').classList.remove('show'); }
  function toast(msg, label, fn) {
    $('#toastMsg').textContent = msg;
    const b = $('#toastBtn');
    b.hidden = !label;
    if (label) { b.textContent = label; b.onclick = () => { fn(); hideToast(); }; }
    $('#toast').classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(hideToast, 5000);
  }

  $('#shuffleBtn').addEventListener('click', () => {
    const snap = { slots: [...state.slots], picks: { ...state.picks } };
    drawLots();
    toast('Жеребьёвка проведена заново', 'Отменить', () => {
      state.slots = snap.slots;
      state.picks = snap.picks;
      build();
    });
  });

  $('#resetBtn').addEventListener('click', () => {
    if (!Object.keys(state.picks).length) return toast('Пока нечего сбрасывать');
    const prev = { ...state.picks };
    state.picks = {};
    update();
    toast('Результаты сброшены', 'Вернуть', () => { state.picks = prev; update(); });
  });

  /* ================== КОНФЕТТИ ================== */
  function confetti() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const cv = $('#confetti'), g = cv.getContext('2d');
    cv.width = innerWidth; cv.height = innerHeight;
    const css = getComputedStyle(html);
    const colors = ['--accent', '--gold', '--ink', '--silver'].map(v => css.getPropertyValue(v).trim());
    const ps = Array.from({ length: 160 }, () => ({
      x: innerWidth / 2 + (Math.random() - .5) * 240,
      y: innerHeight * .38,
      vx: (Math.random() - .5) * 15,
      vy: -Math.random() * 14 - 4,
      w: 6 + Math.random() * 7,
      h: 3 + Math.random() * 5,
      a: Math.random() * 6,
      va: (Math.random() - .5) * .4,
      c: colors[(Math.random() * colors.length) | 0],
    }));
    const t0 = performance.now(), DUR = 3000;
    (function frame(t) {
      const k = t - t0;
      g.clearRect(0, 0, cv.width, cv.height);
      if (k > DUR) return;
      g.globalAlpha = k > DUR - 700 ? Math.max(0, (DUR - k) / 700) : 1;
      ps.forEach(p => {
        p.vy += .38; p.vx *= .992; p.x += p.vx; p.y += p.vy; p.a += p.va;
        g.save();
        g.translate(p.x, p.y); g.rotate(p.a);
        g.fillStyle = p.c;
        g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        g.restore();
      });
      requestAnimationFrame(frame);
    })(t0);
  }

  /* ================== ЭКСПОРТ В PNG ================== */
  async function exportPng() {
    const root = $('#capture');
    try { await document.fonts.ready; } catch {}
    root.classList.add('exporting');
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

    const S = Math.max(2, Math.ceil(window.devicePixelRatio || 1));
    const W = root.offsetWidth, H = root.offsetHeight;
    const cv = document.createElement('canvas');
    cv.width = W * S; cv.height = H * S;
    const g = cv.getContext('2d');
    g.scale(S, S);

    const rr = root.getBoundingClientRect();
    const R = el => { const b = el.getBoundingClientRect(); return { x: b.left - rr.left, y: b.top - rr.top, w: b.width, h: b.height }; };
    const cs = el => getComputedStyle(el);
    const rootCss = getComputedStyle(html);
    const v = n => rootCss.getPropertyValue(n).trim();
    const transparent = c => !c || c === 'transparent' || c === 'rgba(0, 0, 0, 0)';

    const rrect = (x, y, w, h, r) => {
      r = Math.max(0, Math.min(r, w / 2, h / 2));
      g.beginPath();
      g.moveTo(x + r, y);
      g.arcTo(x + w, y, x + w, y + h, r);
      g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r);
      g.arcTo(x, y, x + w, y, r);
      g.closePath();
    };

    const box = el => {
      const c = cs(el), r = R(el);
      const rad = parseFloat(c.borderTopLeftRadius) || 0;
      const bw = parseFloat(c.borderTopWidth) || 0;
      if (!transparent(c.backgroundColor)) { g.fillStyle = c.backgroundColor; rrect(r.x, r.y, r.w, r.h, rad); g.fill(); }
      if (bw) {
        g.lineWidth = bw; g.strokeStyle = c.borderTopColor;
        rrect(r.x + bw / 2, r.y + bw / 2, r.w - bw, r.h - bw, rad - bw / 2);
        g.stroke();
      }
    };

    const fit = (txt, maxW) => {
      if (g.measureText(txt).width <= maxW) return txt;
      while (txt.length > 1 && g.measureText(txt + '…').width > maxW) txt = txt.slice(0, -1);
      return txt + '…';
    };

    const text = el => {
      if (!el || !el.textContent.trim()) return;
      const c = cs(el), r = R(el);
      const pl = parseFloat(c.paddingLeft) || 0, pr = parseFloat(c.paddingRight) || 0;
      let t = el.textContent.trim();
      if (c.textTransform === 'uppercase') t = t.toUpperCase();
      g.font = `${c.fontStyle} ${c.fontWeight} ${c.fontSize} ${c.fontFamily}`;
      g.fillStyle = c.color;
      g.textBaseline = 'middle';
      if ('letterSpacing' in g) g.letterSpacing = c.letterSpacing === 'normal' ? '0px' : c.letterSpacing;
      t = fit(t, r.w - pl - pr);
      let x = r.x + pl;
      if (c.textAlign === 'center') { g.textAlign = 'center'; x = r.x + r.w / 2; }
      else if (c.textAlign === 'right' || c.textAlign === 'end') { g.textAlign = 'right'; x = r.x + r.w - pr; }
      else g.textAlign = 'left';
      g.fillText(t, x, r.y + r.h / 2 + 1);
    };

    // фон листа
    g.fillStyle = cs(root).backgroundColor;
    g.fillRect(0, 0, W, H);

    // шапка
    text($('#capTitle')); text($('#capMeta'));
    const champEl = $('#champ');
    if (!champEl.classList.contains('is-empty')) {
      box(champEl);
      const ico = R($('.champ-ico', champEl));
      g.save();
      g.translate(ico.x, ico.y); g.scale(ico.w / 24, ico.h / 24);
      g.fillStyle = v('--gold');
      g.fill(new Path2D('M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5L3 8z'));
      g.restore();
      text($('.champ-k', champEl)); text($('.champ-name', champEl));
    }

    // линии
    const bo = R($('#bracket'));
    g.save();
    g.translate(bo.x, bo.y);
    g.lineCap = 'round'; g.lineJoin = 'round';
    refs.links.forEach(l => {
      const p = new Path2D(l.d);
      g.lineWidth = 2; g.strokeStyle = v('--line-strong'); g.stroke(p);
      if (l.fill.classList.contains('on')) { g.lineWidth = 2.8; g.strokeStyle = v('--accent'); g.stroke(p); }
    });
    g.restore();

    // заголовки раундов
    $$('.round-title', root).forEach(text);

    // карточки матчей
    $$('.match', root).forEach(m => {
      const c = cs(m), r = R(m);
      const rad = parseFloat(c.borderTopLeftRadius) || 12;
      const bw = parseFloat(c.borderTopWidth) || 1.5;
      const auto = m.classList.contains('is-auto');

      g.save();
      g.shadowColor = 'rgba(0,0,0,.16)'; g.shadowBlur = 12; g.shadowOffsetY = 4;
      g.fillStyle = c.backgroundColor;
      rrect(r.x, r.y, r.w, r.h, rad); g.fill();
      g.restore();

      g.save();
      rrect(r.x, r.y, r.w, r.h, rad); g.clip();
      $$('.team', m).forEach((t, i) => {
        const tr = R(t), tc = cs(t);
        if (!transparent(tc.backgroundColor) && !(auto && t.classList.contains('is-win'))) {
          g.fillStyle = tc.backgroundColor; g.fillRect(tr.x, tr.y, tr.w, tr.h);
        }
        if (i > 0) { g.fillStyle = v('--line'); g.fillRect(tr.x, tr.y, tr.w, 1.5); }
      });
      g.restore();

      g.lineWidth = bw; g.strokeStyle = c.borderTopColor;
      rrect(r.x + bw / 2, r.y + bw / 2, r.w - bw, r.h - bw, rad - bw / 2); g.stroke();

      $$('.team', m).forEach(t => {
        g.save();
        if (t.classList.contains('is-lose')) g.globalAlpha = .5;
        text($('.seed', t)); text($('.tname', t));
        if (t.classList.contains('is-win') && !auto) {
          const k = R($('.tick', t));
          g.fillStyle = v('--accent');
          g.beginPath(); g.arc(k.x + k.w / 2, k.y + k.h / 2, k.w / 2, 0, Math.PI * 2); g.fill();
          g.strokeStyle = v('--accent-ink'); g.lineWidth = 2; g.lineCap = 'round'; g.lineJoin = 'round';
          g.beginPath();
          g.moveTo(k.x + k.w * .28, k.y + k.h * .52);
          g.lineTo(k.x + k.w * .44, k.y + k.h * .67);
          g.lineTo(k.x + k.w * .72, k.y + k.h * .35);
          g.stroke();
        }
        g.restore();
      });
    });

    // низ: заголовок, подиум, подпись
    text($('.bottom-title', root));
    $$('.step', root).forEach(s => { box(s); text($('.place', s)); text($('.pname', s)); });
    text($('.cap-foot', root));

    root.classList.remove('exporting');

    const slug = (state.title || 'tournament').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'tournament';
    cv.toBlob(blob => {
      if (!blob) return toast('Не удалось создать PNG');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${slug}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      toast('PNG сохранён');
    }, 'image/png');
  }
  $('#pngBtn').addEventListener('click', exportPng);

})();
