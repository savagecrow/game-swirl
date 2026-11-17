// App shell: screens, options, scores, loop, input.
const APP = (() => {
  const $ = id => document.getElementById(id);
  const cv = $('cv'), g = cv.getContext('2d'), stage = $('stage');
  const defaults = { sound: true, timed: false, cpu: 2, vsPlayers: 2, vsHumans: 1, splitPlayers: 4, goal: 5000 };
  const saved = (() => { try { return JSON.parse(localStorage.getItem('swirl.opts')) || {}; } catch (e) { return {}; } })();
  const opts = Object.assign({}, defaults, saved);
  let mode = null, last = performance.now(), mx = 0, my = 0;
  const app = { opts, g };

  function fit() { const s = Math.min(innerWidth / 960, innerHeight / 640); stage.style.transform = `translate(-50%,-50%) scale(${s})`; }
  addEventListener('resize', fit); fit();

  function show(id) { for (const el of document.querySelectorAll('.screen')) el.classList.toggle('on', el.id === id); $('dialog').classList.remove('on'); }
  app.menu = () => { mode = null; show('title'); };
  app.dialog = (title, lines, buttons) => {
    $('dtitle').textContent = title; $('dbody').innerHTML = lines.map(l => `<p>${l}</p>`).join('');
    const b = $('dbtns'); b.innerHTML = '';
    for (const x of buttons) { const e = document.createElement('button'); e.textContent = x.label; e.onclick = () => { $('dialog').classList.remove('on'); x.fn(); }; b.appendChild(e); }
    $('dialog').classList.add('on');
  };
  // ---- online (split screen vs a friend) ----
  app.online = null;
  const newSeed = () => Math.floor(Math.random() * 2147483646) + 1;
  app.startOnline = (me, seed, goal) => app.start('split', { me, seed, goal });
  const hostStart = () => { const seed = newSeed(), goal = opts.goal; NET.send({ t: 'start', seed, goal }); app.startOnline(0, seed, goal); }; // host picks the goal
  app.requestRematch = () => {
    if (NET.host) hostStart();
    else { NET.send({ t: 'rematchReq' }); app.dialog('Rematch', ['Waiting for the host to start...'], [{ label: 'Menu', fn: () => app.leaveOnline() }]); }
  };
  app.leaveOnline = () => { NET.send({ t: 'bye' }); app.online = null; app.menu(); setTimeout(() => NET.close(), 300); };
  const setOn = t => { $('onstatus').textContent = t || ''; };
  NET.onMsg = m => {
    if (m.t === 'start') { app.startOnline(1, m.seed, m.goal); return; }
    if (mode && mode.online && mode.net) mode.net(m);
  };
  NET.onStatus = (s, info) => {
    const inGame = mode && mode.online;
    if (s === 'waiting') { $('oncode').textContent = info; setOn('Waiting for your friend. Send them this code (or the link to the game).'); }
    else if (s === 'connecting') setOn('Connecting...');
    else if (s === 'connected') {
      if (NET.host && !inGame) hostStart();
      else if (!NET.host) setOn('Connected! Waiting for the host to start...');
    } else if (s === 'closed') { if (inGame) mode.peerLeft(); else setOn('Connection closed.'); }
    else if (s === 'error') { if (inGame && !mode.over) mode.peerLeft(); else setOn(info || 'Connection error.'); }
  };
  $('onhost').onclick = () => { $('oncode').textContent = ''; setOn('Contacting matchmaking server...'); NET.hostRoom(); };
  $('onjoin').onclick = () => { setOn(''); NET.joinRoom($('onin').value); };
  $('onin').addEventListener('keydown', e => { if (e.key === 'Enter') $('onjoin').click(); });

  app.start = (m, online) => {
    app.online = online || null;
    SND.on = opts.sound; SND.init();
    for (const el of document.querySelectorAll('.screen')) el.classList.remove('on');
    if (m === 'level') mode = new SoloGame(app, { levelMode: true, timed: opts.timed });
    else if (m === 'single') mode = new SoloGame(app, { levelMode: false, timed: opts.timed });
    else if (m === 'versus') mode = new VersusGame(app);
    else if (m === 'split') mode = new SplitGame(app);
    app.mode = mode;
  };

  // ---- scores ----
  const loadScores = () => { try { return JSON.parse(localStorage.getItem('swirl.scores')) || {}; } catch (e) { return {}; } };
  app.saveScore = (kind, score, level) => {
    if (score <= 0) return false;
    const all = loadScores(), list = all[kind] || [];
    list.push({ score, level, date: new Date().toISOString().slice(0, 10) }); list.sort((a, b) => b.score - a.score);
    const isBest = list[0].score === score && list[0].level === level; all[kind] = list.slice(0, 8);
    try { localStorage.setItem('swirl.scores', JSON.stringify(all)); } catch (e) { }
    return isBest;
  };
  function renderScores() {
    const all = loadScores(); let h = '';
    for (const [k, label] of [['level', 'Level Challenge'], ['single', 'Single Game']]) {
      h += `<table><tr><th colspan=3>${label}</th></tr>`;
      const l = all[k] || []; if (!l.length) h += '<tr><td colspan=3 style="color:#888">no scores yet</td></tr>';
      l.forEach((e, i) => h += `<tr><td>${i + 1}.</td><td>${e.score}</td><td>${k === 'level' ? 'Level ' + e.level : ''} <span style="color:#778">${e.date}</span></td></tr>`);
      h += '</table><br>';
    }
    $('scoretbl').innerHTML = h;
  }

  // ---- options ----
  function renderOptions() {
    const rows = [
      ['Sound', 'sound', [[true, 'On'], [false, 'Off']]],
      ['Timed games (Level / Single) - 120 seconds', 'timed', [[false, 'Untimed'], [true, 'Timed']]],
      ['CPU skill', 'cpu', [[1, 'Easy'], [2, 'Normal'], [3, 'Hard']]],
      ['Versus: players', 'vsPlayers', [[2, '2'], [3, '3'], [4, '4']]],
      ['Versus: human players', 'vsHumans', [[1, '1'], [2, '2'], [3, '3'], [4, '4']]],
      ['Split Screen: players (you + CPUs)', 'splitPlayers', [[2, '2'], [3, '3'], [4, '4']]],
      ['Split Screen: goal score', 'goal', [[3000, '3k'], [5000, '5k'], [10000, '10k'], [25000, '25k']]],
    ];
    const box = $('optrows'); box.innerHTML = '';
    for (const [label, key, choices] of rows) {
      const r = document.createElement('div'); r.className = 'row'; r.innerHTML = `<span>${label}</span><span></span>`;
      for (const [val, txt] of choices) {
        const b = document.createElement('button'); b.textContent = txt; if (opts[key] === val) b.className = 'sel';
        b.onclick = () => { opts[key] = val; if (key === 'vsPlayers' && opts.vsHumans > val) opts.vsHumans = val; SND.on = opts.sound; try { localStorage.setItem('swirl.opts', JSON.stringify(opts)); } catch (e) { } renderOptions(); };
        r.lastChild.appendChild(b);
      }
      box.appendChild(r);
    }
  }

  document.addEventListener('click', e => {
    const m = e.target.dataset && e.target.dataset.m; if (!m) return;
    SND.init();
    if (m === 'title') { NET.close(); show('title'); }
    else if (m === 'online') { $('oncode').textContent = ''; setOn(''); show('online'); }
    else if (m === 'options') { renderOptions(); show('options'); }
    else if (m === 'scores') { renderScores(); show('scores'); }
    else if (m === 'rules') show('rules');
    else app.start(m);
  });

  function pos(e) { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * 960 / r.width, (e.clientY - r.top) * 640 / r.height]; }
  cv.addEventListener('mousedown', e => { SND.init(); [mx, my] = pos(e); if (mode && mode.mouse) mode.mouse(mx, my); });
  cv.addEventListener('mousemove', e => { [mx, my] = pos(e); if (mode && mode.hover) mode.hover(mx, my); });
  addEventListener('keydown', e => { if (mode && mode.key && !$('dialog').classList.contains('on')) { if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault(); mode.key(e); } });

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    g.fillStyle = '#000'; g.fillRect(0, 0, 960, 640);
    if (mode) { mode.update(dt); mode.draw(g); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ---- debug / test hooks: index.html#mode=level&auto=8&speed=40 ----
  const h = new URLSearchParams(location.hash.slice(1));
  if (h.get('mode')) {
    for (const k of ['vsPlayers', 'vsHumans', 'splitPlayers', 'goal', 'cpu']) if (h.get(k)) opts[k] = +h.get(k);
    if (h.get('timed')) opts.timed = true;
    opts.demo = !!h.get('demo'); // all-CPU split screen (spectate)
    app.start(h.get('mode'));
    for (let k = 0; k < 60; k++) mode.update(0.05); // settle the drop-in animation (headless screenshots)
    if (h.get('easygoals') && mode.ls) mode.ls.goals = { combo: 1, singles: 999, columns: 0, moves: 999, score: 1 };
    const sim = +h.get('sim') || 0; // fast-forward N ticks of 0.05s synchronously (autoplay if the mode has debugStep)
    for (let k = 0; k < sim && mode; k++) { mode.update(0.05); if (k % 4 === 0 && mode.debugStep) mode.debugStep(); }
    const n = sim ? 0 : (+h.get('auto') || 0);
    if (n) {
      let i = 0; const iv = setInterval(() => {
        if (!mode || i++ >= n) return clearInterval(iv);
        if (mode.debugStep) mode.debugStep();
        else if (mode.view && !mode.over) { const b = mode.view.board; if (b.busy()) { i--; return; } const gr = AI.greedy(b); if (gr) { mode.view.clickCell(gr[0].x, gr[0].y); mode.view.clickCell(gr[0].x, gr[0].y); } }
      }, 120);
    }
    if (h.get('sel') && mode.view) setTimeout(() => { const b = mode.view.board; const gr = AI.greedy(b); if (gr) mode.view.clickCell(gr[0].x, gr[0].y); }, +h.get('sel'));
  }
  if (h.get('screen')) document.querySelector(`[data-m="${h.get('screen')}"]`).click();
  window.APP = app; return app;
})();
