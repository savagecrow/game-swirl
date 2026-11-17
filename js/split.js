// Split Screen Challenge: real-time race, one board per player (you + CPUs).
// Own-color combos score double; Singles cost 100. When any player empties a color, that color is wiped from
// every board (no points). An emptied board is replaced by a new one. First to the goal score wins.
class SplitGame {
  constructor(app) {
    this.app = app; const o = app.opts;
    this.n = o.splitPlayers; this.goal = o.goal; this.diff = o.cpu; this.t = 0; this.over = false;
    this.quit = { x: 830, y: 598, w: 110, h: 32 };
    this.players = [];
    const slots = this.n === 2 ? [[0, 160], [480, 160]] : [[0, 0], [480, 0], [0, 320], [480, 320]];
    for (let p = 0; p < this.n; p++) {
      const [sx, sy] = slots[p];
      const view = new BoardView(new Board({ dropIn: true }), sx + 10, sy + 10, 20);
      this.players.push({ p, view, score: 0, round: 0, singles: 0, human: p === 0 && !o.demo, cd: 1 + Math.random() * 1.5, phase: 'think', sx, sy, renew: 0 });
    }
    this.msg = ''; this.msgT = 0;
  }
  mouse(mx, my) {
    if (TXT.inRect(this.quit, mx, my)) return this.app.menu();
    if (this.over) return; const P = this.players[0];
    if (P.renew > 0) return;
    this.act(P, P.view.click(mx, my));
  }
  key(e) {
    if (this.over) return; const P = this.players[0], v = P.view;
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.code];
    if (d) v.moveCursor(d[0], d[1]);
    else if ((e.code === 'Enter' || e.code === 'Space') && P.renew <= 0) { v.showCursor = true; this.act(P, v.clickCell(v.cursor.x, v.cursor.y)); }
  }
  debugStep() { const P = this.players[0]; if (P.view.board.busy() || P.renew > 0) return; const gr = AI.pick(P.view.board, { diff: 3, noise: 0, color: 0, double: true }); if (gr) { P.view.sel = gr; this.act(P, P.view.removeSelected()); } }
  act(P, r) {
    if (r.type !== 'remove' || this.over) return;
    const own = r.color === P.p, base = r.n === 1 ? -100 : r.base * (own ? 2 : 1), pts = base + r.bonus;
    P.score += pts; P.round += pts; if (r.n === 1) P.singles++;
    P.view.popup(r, pts, own && r.n > 1 ? 'x2' : '');
    const b = P.view.board;
    if (r.n >= 1 && b.colorCount(r.color) === 0) this.wipeColor(r.color, P);
    if (b.isEmpty()) { P.renew = 1.1; } // handled in update after the animation
    if (P.score >= this.goal) this.finish(P);
  }
  wipeColor(c, from) {
    this.msg = `${ART.names[c]} cleared - gone from every board!`; this.msgT = 2.2; SND.column(4);
    for (const Q of this.players) {
      if (Q === from) continue; const b = Q.view.board; if (b.busy()) { Q.pendingWipe = (Q.pendingWipe || []).concat(c); continue; }
      const all = []; for (const col of b.cells) for (const s of col) if (s && s.c === c) all.push(s);
      if (all.length) { Q.view.sel = null; Q.view.removeGroup(all); }
      if (b.isEmpty()) Q.renew = 1.1;
    }
  }
  finish(winner) {
    if (this.over) return; this.over = true; winner.p === 0 ? SND.win() : SND.lose();
    const order = [...this.players].sort((a, b) => b.score - a.score);
    const lines = order.map((P, i) => `${i + 1}. <b style="color:${ART.colors[P.p]}">${ART.names[P.p]}</b> (${P.human ? 'You' : 'CPU'}): ${P.score}`);
    this.app.dialog(winner.human ? 'You win!' : `${ART.names[winner.p]} (CPU) wins`, lines, [{ label: 'Rematch', fn: () => this.app.start('split') }, { label: 'Menu', fn: () => this.app.menu() }]);
  }
  update(dt) {
    this.t += dt; if (this.msgT > 0) this.msgT -= dt;
    for (const P of this.players) {
      const v = P.view; v.update(dt);
      if (P.pendingWipe && !v.board.busy()) { for (const c of P.pendingWipe) { const all = []; for (const col of v.board.cells) for (const s of col) if (s && s.c === c) all.push(s); if (all.length) v.removeGroup(all); } P.pendingWipe = null; if (v.board.isEmpty()) P.renew = 1.1; }
      if (P.renew > 0) {
        P.renew -= dt;
        if (P.renew <= 0 && v.board.isEmpty()) { // fresh board; perfect-clear doubling for the finished one
          if (P.singles === 0 && P.round > 0 && !this.over) { P.score += P.round; v.fx.text(v.x + 150, v.y + 150, `No Singles! +${P.round}`, '#6f6'); if (P.score >= this.goal) this.finish(P); }
          v.board.fill(true); P.round = 0; P.singles = 0; v.sel = null;
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
      TXT.t(g, P.human ? 'YOU' : 'CPU', tx + 46, P.sy + 38, { font: 'bold 16px Arial', color: ART.colors[P.p] });
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
