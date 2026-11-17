// Split Screen Challenge: real-time race, one board per player (you + CPUs, or you + a friend online).
// Own-color combos score double; Singles cost 100. When any player empties a color, that color is wiped from
// every board (no points). An emptied board is replaced by a new one. First to the goal score wins.
//
// Online (2 players): every client runs its OWN board for real and shows the friend's board as a mirror.
// The owner of a board is the authority; it sends an ordered event log (move / wipe / fill) and the other
// side replays it once its mirror board has settled. Scores come from the owner. Host is authoritative for the winner.
class SplitGame {
  constructor(app) {
    this.app = app; const o = app.opts; this.online = app.online || null;
    this.n = this.online ? 2 : o.splitPlayers; this.goal = this.online ? this.online.goal : o.goal; this.diff = o.cpu; this.t = 0; this.over = false;
    this.me = this.online ? this.online.me : 0;
    this.quit = { x: 830, y: 598, w: 110, h: 32 };
    this.players = [];
    const slots = this.n === 2 ? [[0, 160], [480, 160]] : [[0, 0], [480, 0], [0, 320], [480, 320]];
    for (let p = 0; p < this.n; p++) {
      const slot = this.online ? (p === this.me ? 0 : 1) : p; // online: you are always on the left
      const [sx, sy] = slots[slot];
      const rng = this.online ? new RNG(this.online.seed + p * 7919 + 1) : undefined;
      const view = new BoardView(new Board({ dropIn: true, rng }), sx + 10, sy + 10, 20);
      const human = this.online ? p === this.me : (p === 0 && !o.demo);
      this.players.push({ p, view, score: 0, round: 0, singles: 0, human, remote: !!this.online && p !== this.me, q: [], cd: 1 + Math.random() * 1.5, phase: 'think', sx, sy, renew: 0 });
    }
    this.L = this.players[this.me];
    this.msg = ''; this.msgT = 0;
  }
  sendEv(ev) { if (this.online) NET.send(Object.assign({ t: 'ev' }, ev)); }
  mouse(mx, my) {
    if (TXT.inRect(this.quit, mx, my)) return this.online ? this.app.leaveOnline() : this.app.menu();
    if (this.over) return; const P = this.L;
    if (P.renew > 0) return;
    this.act(P, P.view.click(mx, my));
  }
  key(e) {
    if (this.over) return; const P = this.L, v = P.view;
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.code];
    if (d) v.moveCursor(d[0], d[1]);
    else if ((e.code === 'Enter' || e.code === 'Space') && P.renew <= 0) { v.showCursor = true; this.act(P, v.clickCell(v.cursor.x, v.cursor.y)); }
  }
  debugStep() { const P = this.L; if (P.view.board.busy() || P.renew > 0) return; const gr = AI.pick(P.view.board, { diff: 3, noise: 0, color: P.p, double: true }); if (gr) { P.view.sel = gr; this.act(P, P.view.removeSelected()); } }
  act(P, r) {
    if (r.type !== 'remove' || this.over) return;
    const own = r.color === P.p, base = r.n === 1 ? -100 : r.base * (own ? 2 : 1), pts = base + r.bonus;
    P.score += pts; P.round += pts; if (r.n === 1) P.singles++;
    P.view.popup(r, pts, own && r.n > 1 ? 'x2' : '');
    if (this.online && !P.remote) this.sendEv({ k: 'move', x: r.at.x, y: r.at.y, n: r.n, pts, score: P.score });
    const b = P.view.board;
    if (r.n >= 1 && b.colorCount(r.color) === 0) this.wipeColor(r.color, P);
    if (b.isEmpty()) { P.renew = 1.1; } // handled in update after the animation
    if (P.score >= this.goal) this.goalReached(P);
  }
  // Remove color c from player Q's board (no points).
  applyWipe(Q, c) {
    const b = Q.view.board, all = []; for (const col of b.cells) for (const s of col) if (s && s.c === c) all.push(s);
    if (all.length) { Q.view.sel = null; Q.view.removeGroup(all); if (this.online) this.sendEv({ k: 'wipe', c }); }
    if (b.isEmpty()) Q.renew = 1.1;
  }
  wipeColor(c, from) {
    this.msg = `${ART.names[c]} cleared - gone from every board!`; this.msgT = 2.2; SND.column(4);
    for (const Q of this.players) {
      if (Q === from || Q.remote) continue; // online: the friend's mirror changes only through their events
      if (Q.view.board.busy()) { Q.pendingWipe = (Q.pendingWipe || []).concat(c); continue; }
      this.applyWipe(Q, c);
    }
  }
  goalReached(P) {
    if (this.over) return;
    if (!this.online) return this.finish(P);
    if (this.me === 0) { this.finish(P); NET.send({ t: 'result', winner: P.p }); } // host decides
    else NET.send({ t: 'claim' });                                                  // guest asks the host
  }
  finish(winner) {
    if (this.over) return; this.over = true; winner.p === this.me ? SND.win() : SND.lose();
    const order = [...this.players].sort((a, b) => b.score - a.score);
    const who = P => P.human ? 'You' : this.online ? 'Friend' : 'CPU';
    const lines = order.map((P, i) => `${i + 1}. <b style="color:${ART.colors[P.p]}">${ART.names[P.p]}</b> (${who(P)}): ${P.score}`);
    const btns = this.online ? [{ label: 'Rematch', fn: () => this.app.requestRematch() }, { label: 'Menu', fn: () => this.app.leaveOnline() }]
      : [{ label: 'Rematch', fn: () => this.app.start('split') }, { label: 'Menu', fn: () => this.app.menu() }];
    this.app.dialog(winner.human ? 'You win!' : this.online ? 'Your friend wins' : `${ART.names[winner.p]} (CPU) wins`, lines, btns);
  }
  // ---- online plumbing ----
  net(m) {
    const R = this.players[1 - this.me];
    if (m.t === 'ev') R.q.push(m);
    else if (m.t === 'claim' && this.me === 0 && !this.over) { this.finish(R); NET.send({ t: 'result', winner: R.p }); }
    else if (m.t === 'result') this.finish(this.players[m.winner]);
    else if (m.t === 'rematchReq' && this.me === 0) this.app.requestRematch();
    else if (m.t === 'sync') this.sendState();
    else if (m.t === 'state') this.applyState(R, m);
    else if (m.t === 'bye') this.peerLeft();
  }
  peerLeft() {
    if (this.over) return; this.over = true;
    this.app.dialog('Friend disconnected', ['The connection was closed.'], [{ label: 'Menu', fn: () => this.app.leaveOnline() }]);
  }
  sendState() { // full snapshot of MY board, used to repair a mirror that fell out of step
    const b = this.L.view.board; let cells = '';
    for (let x = 0; x < b.cols; x++) for (let y = 0; y < b.rows; y++) { const s = b.cells[x][y]; cells += s ? s.c : '.'; }
    NET.send({ t: 'state', cells, score: this.L.score });
  }
  applyState(R, m) {
    const b = R.view.board; b.cells = [];
    for (let x = 0; x < b.cols; x++) { const col = []; for (let y = 0; y < b.rows; y++) { const ch = m.cells[x * b.rows + y]; col.push(ch === '.' ? null : { c: +ch, x, y, px: x, py: y, vy: 0, id: Math.random() }); } b.cells.push(col); }
    b.dying = []; R.view.sel = null; R.score = m.score; R.q.length = 0; R.waiting = false;
  }
  desync(R) { R.q.length = 0; if (!R.waiting) { R.waiting = true; NET.send({ t: 'sync' }); } console.warn('swirl: mirror out of step, resyncing'); }
  runQueue(R) {
    const v = R.view, b = v.board; if (R.waiting || b.busy() || !R.q.length) return;
    const ev = R.q.shift();
    if (ev.k === 'move') {
      const grp = b.group(ev.x, ev.y); if (!grp.length || grp.length !== ev.n) return this.desync(R);
      v.sel = null; const r = v.removeGroup(grp); R.score = ev.score;
      v.popup(r, ev.pts, r.color === R.p && r.n > 1 ? 'x2' : '');
      if (!this.over && b.colorCount(r.color) === 0) this.wipeColor(r.color, R); // the friend emptied a color: wipe it from MY board
    } else if (ev.k === 'wipe') {
      const all = []; for (const col of b.cells) for (const s of col) if (s && s.c === ev.c) all.push(s);
      if (all.length) { v.sel = null; v.removeGroup(all); }
    } else if (ev.k === 'fill') {
      b.rng = new RNG(ev.seed); b.fill(true); v.sel = null; R.score = ev.score;
      if (ev.bonus) v.fx.text(v.x + 150, v.y + 150, `No Singles! +${ev.bonus}`, '#6f6');
    }
  }
  update(dt) {
    this.t += dt; if (this.msgT > 0) this.msgT -= dt;
    for (const P of this.players) {
      const v = P.view; v.update(dt);
      if (P.remote) { this.runQueue(P); continue; }
      if (P.pendingWipe && !v.board.busy()) { const cs = P.pendingWipe; P.pendingWipe = null; for (const c of cs) this.applyWipe(P, c); }
      if (P.renew > 0) {
        P.renew -= dt;
        if (P.renew <= 0 && v.board.isEmpty()) { // fresh board; perfect-clear doubling for the finished one
          let bonus = 0;
          if (P.singles === 0 && P.round > 0 && !this.over) { bonus = P.round; P.score += bonus; v.fx.text(v.x + 150, v.y + 150, `No Singles! +${bonus}`, '#6f6'); }
          let seed = 0; if (this.online) { seed = Math.floor(Math.random() * 2147483647) + 1; v.board.rng = new RNG(seed); }
          v.board.fill(true); P.round = 0; P.singles = 0; v.sel = null;
          if (this.online && !this.over) this.sendEv({ k: 'fill', seed, score: P.score, bonus });
          if (bonus && P.score >= this.goal) this.goalReached(P);
        }
        continue;
      }
      if (P.human || this.over) continue;
      if (v.board.busy()) continue;
      P.cd -= dt;
      if (P.cd <= 0) {
        if (P.phase === 'think') {
          const grp = AI.pick(v.board, { diff: this.diff, color: P.p, double: true });
          if (grp) { v.sel = grp; P.phase = 'go'; P.cd = 0.25; } else P.cd = 0.5;
        } else { this.act(P, v.removeSelected()); P.phase = 'think'; P.cd = [0, 2.4, 1.5, 0.9][this.diff] * (0.7 + Math.random() * 0.6); }
      }
    }
  }
  draw(g) {
    for (const P of this.players) {
      const v = P.view; v.draw(g);
      const tx = P.sx + 330;
      ART.spiral(g, tx + 20, P.sy + 40, 18, P.p, { rot: this.t * 2 });
      TXT.t(g, P.human ? 'YOU' : this.online ? 'FRIEND' : 'CPU', tx + 46, P.sy + 38, { font: 'bold 16px Arial', color: ART.colors[P.p] });
      TXT.t(g, String(P.score), tx, P.sy + 90, { font: 'bold 28px Arial', color: '#fc3' });
      TXT.t(g, `Goal ${this.goal}`, tx, P.sy + 112, { font: '13px Arial', color: '#9ac' });
      g.fillStyle = '#222'; g.fillRect(tx, P.sy + 122, 130, 8); g.fillStyle = ART.colors[P.p]; g.fillRect(tx, P.sy + 122, 130 * Math.max(0, Math.min(1, P.score / this.goal)), 8);
      const sel = v.selection();
      if (P.human && sel) TXT.t(g, `Combo ${sel.n} : ${sel.color === P.p && sel.n > 1 ? sel.pts * 2 : sel.pts}`, tx, P.sy + 160, { font: 'bold 16px Arial', color: '#fc3' });
    }
    if (this.msgT > 0) { g.globalAlpha = Math.min(1, this.msgT); TXT.t(g, this.msg, 480, 312, { align: 'center', font: 'bold 26px Arial', color: '#fff' }); g.globalAlpha = 1; }
    TXT.button(g, this.quit, 'Menu');
  }
}
