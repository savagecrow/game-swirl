// BoardView: one on-screen board (selection, input, effects). Used by every mode.
class BoardView {
  constructor(board, x, y, cell) {
    this.board = board; this.x = x; this.y = y; this.cell = cell;
    this.sel = null; this.cursor = { x: 7, y: 7 }; this.showCursor = false;
    this.fx = new ART.Particles(); this.mood = 'idle'; this.moodT = 0; this.t = 0;
  }
  cellAt(mx, my) {
    const cx = Math.floor((mx - this.x) / this.cell), cy = Math.floor((my - this.y) / this.cell);
    return cx >= 0 && cy >= 0 && cx < this.board.cols && cy < this.board.rows ? { x: cx, y: cy } : null;
  }
  setMood(m, d = 1.2) { this.mood = m; this.moodT = d; }
  selection() { return this.sel ? { n: this.sel.length, color: this.sel[0].c, pts: SW.comboPts(this.sel.length) } : null; }
  // returns {type:'select'|'remove'|'none', ...}
  clickCell(cx, cy) {
    const b = this.board; if (b.busy()) return { type: 'none' };
    const s = b.get(cx, cy);
    if (!s) { this.sel = null; return { type: 'none' }; }
    if (this.sel && this.sel.includes(s)) return this.removeSelected();
    this.sel = b.group(cx, cy); SND.select(this.sel.length);
    return { type: 'select', n: this.sel.length };
  }
  click(mx, my) { const c = this.cellAt(mx, my); if (!c) { this.sel = null; return { type: 'none' }; } this.cursor = c; return this.clickCell(c.x, c.y); }
  selectGroupAt(cx, cy) { if (this.board.busy()) return; const s = this.board.get(cx, cy); if (s) this.sel = this.board.group(cx, cy); }
  removeSelected() {
    const grp = this.sel; this.sel = null; if (!grp || !grp.length) return { type: 'none' };
    return this.removeGroup(grp);
  }
  removeGroup(grp) {
    const n = grp.length, color = grp[0].c, c = this.cell;
    const mx = grp.reduce((a, s) => a + s.px, 0) / n, my = grp.reduce((a, s) => a + s.py, 0) / n;
    for (const s of grp) this.fx.burst(this.x + (s.px + 0.5) * c, this.y + (s.py + 0.5) * c, s.c, n >= 12 ? 5 : 3, 90 + Math.min(n, 30) * 6, n >= 12 ? 120 : 0);
    const at = { x: grp[0].x, y: grp[0].y };
    const info = this.board.remove(grp); info.at = at;
    if (n === 1) { SND.single(); this.setMood('sad'); }
    else { SND.remove(n); this.setMood(n >= 10 ? 'big' : 'happy', n >= 10 ? 2 : 1); }
    if (info.columns >= 2) SND.column(info.columns);
    info.cx = this.x + (mx + 0.5) * c; info.cy = this.y + (my + 0.5) * c;
    info.type = 'remove'; return info;
  }
  popup(info, pts, extra) {
    const col = pts < 0 ? '#ff5050' : '#ffe14a';
    this.fx.text(info.cx, info.cy, (pts > 0 ? '+' : '') + pts, col);
    if (info.columns >= 2) this.fx.text(info.cx, info.cy - 24, `Column Bonus x${info.columns}!`, '#6cf');
    if (extra) this.fx.text(info.cx, info.cy - 48, extra, '#fff');
  }
  moveCursor(dx, dy) {
    this.showCursor = true;
    this.cursor.x = Math.max(0, Math.min(this.board.cols - 1, this.cursor.x + dx));
    this.cursor.y = Math.max(0, Math.min(this.board.rows - 1, this.cursor.y + dy));
  }
  update(dt) {
    this.t += dt; this.board.update(dt); this.fx.update(dt);
    if (this.moodT > 0) { this.moodT -= dt; if (this.moodT <= 0) this.mood = 'idle'; }
    if (this.sel && !this.board.busy() && this.sel.some(s => this.board.get(s.x, s.y) !== s)) this.sel = null;
  }
  draw(g) {
    ART.drawBoard(g, { board: this.board, x: this.x, y: this.y, cell: this.cell, sel: this.sel, cursor: this.showCursor ? this.cursor : null, t: this.t });
    this.fx.draw(g);
    g.strokeStyle = '#555'; g.lineWidth = 2; g.strokeRect(this.x - 1, this.y - 1, this.board.cols * this.cell + 2, this.board.rows * this.cell + 2);
  }
}

// Shared canvas text helpers
const TXT = {
  t(g, s, x, y, o = {}) {
    g.font = o.font || 'bold 18px Arial'; g.textAlign = o.align || 'left'; g.textBaseline = 'alphabetic';
    if (o.shadow !== false) { g.fillStyle = '#000'; g.fillText(s, x + 1, y + 1); }
    g.fillStyle = o.color || '#fff'; g.fillText(s, x, y);
  },
  button(g, r, label, hot) {
    g.fillStyle = hot ? '#3b3b9a' : '#222266'; g.fillRect(r.x, r.y, r.w, r.h);
    g.strokeStyle = '#8888ff'; g.lineWidth = 2; g.strokeRect(r.x, r.y, r.w, r.h);
    TXT.t(g, label, r.x + r.w / 2, r.y + r.h / 2 + 6, { align: 'center', font: 'bold 16px Arial' });
  },
  inRect(r, x, y) { return x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h; },
};

// ---------------------------------------------------------------------------------------------
// Level Challenge and Single Game (Practice) share one class.
class SoloGame {
  constructor(app, { levelMode, timed }) {
    this.app = app; this.levelMode = levelMode; this.timed = timed;
    this.level = 1; this.total = 0; this.over = false; this.ending = 0; this.t = 0;
    this.quit = { x: 655, y: 594, w: 110, h: 32 }; this.check = { x: 655, y: 150, w: 90, h: 28 };
    this.flashGoals = 0; this.newBoard();
  }
  newBoard() {
    this.view = new BoardView(new Board({ dropIn: true }), 20, 20, 40);
    this.ls = new LevelState(this.level); this.score = 0; this.singles = 0; this.moves = 0; this.largest = 0;
    this.timeLeft = SW.TIME_LIMIT; this.ending = 0; this.over = false; this.lastTick = 0; this.msg = '';
  }
  mouse(mx, my) {
    if (TXT.inRect(this.quit, mx, my)) return this.app.menu();
    if (this.levelMode && TXT.inRect(this.check, mx, my)) { this.flashGoals = 2.5; return; }
    if (this.over || this.ending) return;
    this.handle(this.view.click(mx, my));
  }
  key(e) {
    if (e.code === 'KeyX' || e.code === 'KeyG') { this.flashGoals = 2.5; return; }
    if (this.over || this.ending) return;
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.code];
    if (d) this.view.moveCursor(d[0], d[1]);
    else if (e.code === 'Enter' || e.code === 'Space') { this.view.showCursor = true; this.handle(this.view.clickCell(this.view.cursor.x, this.view.cursor.y)); }
  }
  debugStep() { if (this.over || this.ending || this.view.board.busy()) return; const gr = AI.greedy(this.view.board); if (gr) { this.view.sel = gr; this.handle(this.view.removeSelected()); } }
  handle(r) {
    if (r.type !== 'remove') return;
    this.view.popup(r, r.base + r.bonus);
    this.score += r.base + r.bonus; this.moves++; if (r.n === 1) this.singles++; this.largest = Math.max(this.largest, r.n);
    this.ls.apply(r);
    if (this.view.board.isEmpty()) this.ending = 1.0;
  }
  update(dt) {
    this.t += dt; this.view.update(dt); if (this.flashGoals > 0) this.flashGoals -= dt;
    if (this.timed && !this.over && !this.ending) {
      this.timeLeft -= dt; if (this.timeLeft <= 10 && Math.floor(this.timeLeft) !== this.lastTick) { this.lastTick = Math.floor(this.timeLeft); SND.tick(); }
      if (this.timeLeft <= 0) { this.timeLeft = 0; this.over = true; this.timeOut(); }
    }
    if (this.ending > 0) { this.ending -= dt; if (this.ending <= 0) { this.ending = 0; this.finishBoard(); } }
  }
  timeOut() {
    SND.lose(); this.app.saveScore(this.levelMode ? 'level' : 'single', this.total + this.score, this.levelMode ? this.level : 0);
    this.app.dialog("Time's up!", [`You ran out of time with ${this.view.board.count()} swirls left.`, `Score: ${this.total + this.score}`], [
      { label: 'Play Again', fn: () => this.app.start(this.levelMode ? 'level' : 'single') }, { label: 'Menu', fn: () => this.app.menu() }]);
  }
  finishBoard() {
    this.over = true;
    const noSingles = this.singles === 0, bonusTime = this.timed ? Math.ceil(this.timeLeft) * SW.TIME_BONUS : 0;
    const final = (noSingles ? this.score * 2 : this.score) + bonusTime;
    const lines = [`Board score: ${this.score}${noSingles ? '  x2 (no Singles!) = ' + this.score * 2 : ''}`];
    if (this.timed) lines.push(`Time bonus: ${bonusTime}`);
    if (!this.levelMode) {
      SND.win(); lines.push(`Final score: ${final}`);
      const best = this.app.saveScore('single', final, 0); if (best) lines.push('New high score!');
      return this.app.dialog('Board cleared!', lines, [{ label: 'Play Again', fn: () => this.app.start('single') }, { label: 'Menu', fn: () => this.app.menu() }]);
    }
    const st = this.ls.status(), ok = this.ls.allMet();
    for (const s of st) lines.push(`${s.ok ? '✔' : '✘'} ${s.label}: ${s.have} (need ${s.need})`);
    if (ok) {
      this.total += final; SND.win(); lines.push(`Level ${this.level} score: ${final}   Total: ${this.total}`);
      this.app.dialog(`Level ${this.level} complete!`, lines, [{ label: `Level ${this.level + 1}`, fn: () => { this.level++; this.newBoard(); } }, { label: 'Quit', fn: () => { this.app.saveScore('level', this.total, this.level); this.app.menu(); } }]);
    } else {
      SND.lose(); this.app.saveScore('level', this.total, this.level);
      lines.push('Goals not met - level failed.');
      this.app.dialog(`Level ${this.level} failed`, lines, [{ label: 'Retry Level', fn: () => this.newBoard() }, { label: 'Menu', fn: () => this.app.menu() }]);
    }
  }
  draw(g) {
    const v = this.view; v.draw(g);
    const px = 640;
    if (this.levelMode) {
      TXT.t(g, `Level ${this.level}`, px + 20, 50, { font: 'italic bold 34px Georgia', color: '#ff9a1a' });
      TXT.t(g, 'Goals', px + 20, 100, { font: 'italic bold 30px Georgia', color: '#6f6' });
      TXT.t(g, `${this.ls.metCount()} / 5`, px + 20, 138, { font: 'italic bold 30px Georgia', color: '#b43cff' });
      TXT.button(g, this.check, 'Check', this.flashGoals > 0);
      const st = this.ls.status(); let y = 215;
      for (const s of st) {
        const hot = this.flashGoals > 0 && Math.floor(this.t * 6) % 2;
        TXT.t(g, `${s.ok ? '✔' : '•'} ${s.label}`, px + 20, y, { font: 'bold 14px Arial', color: s.ok ? '#6f6' : (hot ? '#fff' : '#ccc') });
        TXT.t(g, `${s.have} / ${s.need}`, px + 40, y + 16, { font: '13px Arial', color: '#9ac' }); y += 40;
      }
    } else {
      TXT.t(g, 'Single Game', px + 20, 50, { font: 'italic bold 30px Georgia', color: '#ff9a1a' });
      TXT.t(g, 'Practice Mode', px + 20, 76, { font: '15px Arial', color: '#9ac' });
      TXT.t(g, `Singles removed: ${this.singles}`, px + 20, 130, { color: '#ccc', font: '15px Arial' });
      TXT.t(g, `Combos made: ${this.moves}`, px + 20, 154, { color: '#ccc', font: '15px Arial' });
      TXT.t(g, `Largest combo: ${this.largest}`, px + 20, 178, { color: '#ccc', font: '15px Arial' });
      TXT.t(g, 'Clear all swirls with no Singles', px + 20, 215, { color: '#6f6', font: '13px Arial' });
      TXT.t(g, 'to DOUBLE your score!', px + 20, 232, { color: '#6f6', font: '13px Arial' });
    }
    const sel = v.selection();
    TXT.t(g, 'Current Combo:', px + 20, 440, { font: '13px Arial', color: '#c93' });
    TXT.t(g, sel ? `${sel.n} : ${sel.pts}` : '0 : 0', px + 20, 462, { font: 'bold 20px Arial', color: sel && sel.pts < 0 ? '#f66' : '#fc3' });
    TXT.t(g, 'Your Score:', px + 20, 495, { font: '13px Arial', color: '#c93' });
    TXT.t(g, String(this.score + this.total), px + 20, 520, { font: 'bold 26px Arial', color: '#fc3' });
    if (this.timed) TXT.t(g, `Time: ${Math.ceil(this.timeLeft)}`, px + 200, 520, { font: 'bold 22px Arial', color: this.timeLeft < 15 ? '#f55' : '#fff' });
    ART.drawSnake(g, 820, 520, 90, v.mood, v.t);
    TXT.button(g, this.quit, 'Menu');
  }
}
