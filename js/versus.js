// Versus Challenge: 2-4 players (human hot-seat or CPU) take turns on ONE shared board.
// Each player owns a color (P1 orange, P2 blue, P3 purple, P4 green): combos of your own color score double,
// your own Singles cost 200, other Singles 100. When the last swirl of your color is gone you are knocked out.
class VersusGame {
  constructor(app) {
    this.app = app; const o = app.opts;
    this.n = o.vsPlayers; this.humans = Math.min(o.vsHumans, this.n); this.diff = o.cpu;
    this.view = new BoardView(new Board({ dropIn: true }), 20, 20, 40);
    this.scores = Array(this.n).fill(0); this.out = Array(this.n).fill(false);
    this.turn = 0; this.timer = 0; this.phase = 'wait'; this.over = false; this.ending = 0; this.t = 0; this.note = '';
    this.quit = { x: 655, y: 594, w: 110, h: 32 };
    this.beginTurn();
  }
  debugStep() { if (this.phase !== 'human' || this.view.board.busy() || this.over) return; const gr = AI.pick(this.view.board, { versus: true, color: this.turn, diff: 3 }); if (gr) { this.view.sel = gr; this.handle(this.view.removeSelected()); } }
  isHuman(p) { return p < this.humans; }
  beginTurn() { this.phase = this.isHuman(this.turn) ? 'human' : 'think'; this.timer = 0.9; this.view.sel = null; }
  mouse(mx, my) {
    if (TXT.inRect(this.quit, mx, my)) return this.app.menu();
    if (this.over || this.ending || this.phase !== 'human') return;
    this.handle(this.view.click(mx, my));
  }
  key(e) {
    if (this.over || this.ending || this.phase !== 'human') return;
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.code];
    if (d) this.view.moveCursor(d[0], d[1]);
    else if (e.code === 'Enter' || e.code === 'Space') { this.view.showCursor = true; this.handle(this.view.clickCell(this.view.cursor.x, this.view.cursor.y)); }
  }
  handle(r) {
    if (r.type !== 'remove') return;
    const p = this.turn, own = r.color === p;
    const base = r.n === 1 ? (own ? -200 : -100) : r.base * (own ? 2 : 1), pts = base + r.bonus;
    this.scores[p] += pts; this.view.popup(r, pts, own && r.n > 1 ? 'Your color x2!' : '');
    const b = this.view.board;
    for (let q = 0; q < this.n; q++) if (!this.out[q] && b.colorCount(q) === 0) { this.out[q] = true; this.note = `${ART.names[q]} is knocked out!`; this.view.fx.text(480, 300, this.note, ART.colors[q]); }
    this.phase = 'anim'; this.timer = 0.55;
    if (this.out.every(Boolean) || b.isEmpty()) this.ending = 0.9;
  }
  nextTurn() { let k = this.turn; for (let i = 0; i < this.n; i++) { k = (k + 1) % this.n; if (!this.out[k]) break; } this.turn = k; this.beginTurn(); }
  update(dt) {
    this.t += dt; this.view.update(dt);
    if (this.ending > 0) { this.ending -= dt; if (this.ending <= 0) this.finish(); return; }
    if (this.over) return;
    if (this.view.board.busy()) return;
    if (this.phase === 'anim') { this.timer -= dt; if (this.timer <= 0) this.nextTurn(); }
    else if (this.phase === 'think') {
      this.timer -= dt; if (this.timer <= 0) {
        const grp = AI.pick(this.view.board, { versus: true, color: this.turn, diff: this.diff });
        if (!grp) return this.finish();
        this.view.sel = grp; SND.select(grp.length); this.phase = 'confirm'; this.timer = 0.65;
      }
    } else if (this.phase === 'confirm') { this.timer -= dt; if (this.timer <= 0) this.handle(this.view.removeSelected()); }
  }
  finish() {
    if (this.over) return; this.over = true; SND.win();
    const order = [...Array(this.n).keys()].sort((a, b) => this.scores[b] - this.scores[a]);
    const lines = order.map((p, i) => `${i + 1}. <b style="color:${ART.colors[p]}">${ART.names[p]}</b> (${this.isHuman(p) ? 'Player ' + (p + 1) : 'CPU'}): ${this.scores[p]}`);
    this.app.dialog(`${ART.names[order[0]]} wins!`, lines, [{ label: 'Rematch', fn: () => this.app.start('versus') }, { label: 'Menu', fn: () => this.app.menu() }]);
  }
  draw(g) {
    const v = this.view; v.draw(g); const px = 640;
    TXT.t(g, 'Versus Challenge', px + 20, 46, { font: 'italic bold 28px Georgia', color: '#b87cff' });
    for (let p = 0; p < this.n; p++) {
      const y = 80 + p * 92, cur = p === this.turn && !this.over;
      g.fillStyle = cur ? '#1c1c4a' : '#0a0a18'; g.fillRect(px + 10, y, 290, 80);
      g.strokeStyle = cur ? ART.colors[p] : '#333'; g.lineWidth = 2; g.strokeRect(px + 10, y, 290, 80);
      ART.spiral(g, px + 44, y + 40, 22, p, { rot: cur ? this.t * 3 : 0 });
      TXT.t(g, `${ART.names[p]}  ${this.isHuman(p) ? '(Player ' + (p + 1) + ')' : '(CPU)'}`, px + 76, y + 28, { font: 'bold 16px Arial', color: this.out[p] ? '#777' : '#fff' });
      TXT.t(g, String(this.scores[p]), px + 76, y + 60, { font: 'bold 26px Arial', color: this.out[p] ? '#666' : '#fc3' });
      TXT.t(g, this.out[p] ? 'OUT' : `${v.board.colorCount(p)} left`, px + 290, y + 28, { align: 'right', font: 'bold 14px Arial', color: this.out[p] ? '#f55' : '#9ac' });
      if (cur) TXT.t(g, this.phase === 'human' ? 'YOUR TURN' : '...', px + 290, y + 62, { align: 'right', font: 'bold 14px Arial', color: '#6f6' });
    }
    const sel = v.selection();
    if (sel) {
      const own = sel.color === this.turn, pts = sel.n === 1 ? (own ? -200 : -100) : sel.pts * (own ? 2 : 1);
      TXT.t(g, `Combo: ${sel.n} : ${pts}`, px + 20, 470, { font: 'bold 20px Arial', color: pts < 0 ? '#f66' : '#fc3' });
    }
    ART.drawSnake(g, 825, 510, 90, v.mood, v.t);
    TXT.button(g, this.quit, 'Menu');
  }
}
