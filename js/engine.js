// Swirl engine: pure game logic (no DOM). Scoring numbers:
//  combo of n  = 4n^2 - 4n - 4   (2->4, 3->20, 9->284, 31->3716, 40->6236)
//  single      = -100
//  column bonus for k columns emptied in one move = 25*k*(k+1)/2  (25,75,150,250,375,525,700,900,1125,1375)
//  clearing a board with zero singles doubles that board's score
const SW = {
  COLS: 15, ROWS: 15, NCOLORS: 4,
  comboPts: n => (n <= 1 ? -100 : 4 * n * n - 4 * n - 4),
  colBonus: k => (k <= 0 ? 0 : 25 * k * (k + 1) / 2),
  TIME_LIMIT: 120, TIME_BONUS: 50,
  // Level goals: a rising curve across 5 categories.
  goalsFor(level) {
    return {
      combo: Math.min(8 + level * 2, 34),            // largest single combo at least this
      singles: Math.max(10 - level, 2),              // remove at most this many singles
      columns: Math.min(2 + Math.floor((level + 1) / 2), 9), // empty this many columns in one move
      moves: Math.max(100 - level * 4, 60),           // clear the board in no more than this many combos
      score: 1500 + (level - 1) * 700,               // level score at least this
    };
  },
};

class RNG { // seeded so tests are reproducible
  constructor(seed) { this.s = (seed >>> 0) || 123456789; }
  next() { let x = this.s; x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; this.s = x; return x / 4294967296; }
}

class Board {
  constructor(opts = {}) {
    this.cols = opts.cols || SW.COLS; this.rows = opts.rows || SW.ROWS;
    this.ncolors = opts.ncolors || SW.NCOLORS;
    this.rng = opts.rng || { next: Math.random };
    this.dying = []; // swirls being animated out
    this.fill(opts.dropIn);
  }
  fill(dropIn) {
    this.cells = [];
    for (let x = 0; x < this.cols; x++) {
      const col = [];
      for (let y = 0; y < this.rows; y++) {
        const s = { c: Math.floor(this.rng.next() * this.ncolors), x, y, px: x, py: y, vy: 0, id: Math.random() };
        if (dropIn) s.py = y - this.rows - 2 - this.rng.next() * 3 - x * 0.1;
        col.push(s);
      }
      this.cells.push(col);
    }
    this.dying = [];
  }
  get(x, y) { return x >= 0 && y >= 0 && x < this.cols && y < this.rows ? this.cells[x][y] : null; }
  count() { let n = 0; for (const col of this.cells) for (const s of col) if (s) n++; return n; }
  colorCount(c) { let n = 0; for (const col of this.cells) for (const s of col) if (s && s.c === c) n++; return n; }
  isEmpty() { return this.count() === 0; }
  group(x, y) {
    const s0 = this.get(x, y); if (!s0) return [];
    const seen = new Set([x * 100 + y]), st = [s0], out = [];
    while (st.length) {
      const s = st.pop(); out.push(s);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = this.get(s.x + dx, s.y + dy);
        if (!n || n.c !== s0.c) continue;
        const k = n.x * 100 + n.y; if (seen.has(k)) continue;
        seen.add(k); st.push(n);
      }
    }
    return out;
  }
  allGroups() {
    const seen = new Set(), res = [];
    for (let x = 0; x < this.cols; x++) for (let y = 0; y < this.rows; y++) {
      if (!this.get(x, y) || seen.has(x * 100 + y)) continue;
      const g = this.group(x, y); for (const s of g) seen.add(s.x * 100 + s.y); res.push(g);
    }
    return res;
  }
  // Remove a group. Returns {n, color, base, columns, bonus}. Gravity then slide-left are applied logically; visuals tween.
  remove(group) {
    const n = group.length, color = group[0].c;
    const before = new Set(); for (let x = 0; x < this.cols; x++) if (this.cells[x].some(Boolean)) before.add(x);
    for (const s of group) { this.cells[s.x][s.y] = null; s.t = 0; this.dying.push(s); }
    for (let x = 0; x < this.cols; x++) {
      const live = this.cells[x].filter(Boolean);
      const col = Array(this.rows - live.length).fill(null).concat(live);
      live.forEach((s, i) => { s.y = this.rows - live.length + i; });
      this.cells[x] = col;
    }
    let columns = 0;
    for (const x of before) if (!this.cells[x].some(Boolean)) columns++;
    const kept = this.cells.filter(c => c.some(Boolean));
    while (kept.length < this.cols) kept.push(Array(this.rows).fill(null));
    this.cells = kept;
    for (let x = 0; x < this.cols; x++) for (const s of this.cells[x]) if (s) s.x = x;
    return { n, color, base: SW.comboPts(n), columns, bonus: SW.colBonus(columns) };
  }
  busy() {
    for (const col of this.cells) for (const s of col) if (s && (Math.abs(s.py - s.y) > 0.002 || Math.abs(s.px - s.x) > 0.002)) return true;
    return false;
  }
  update(dt) {
    for (const col of this.cells) for (const s of col) {
      if (!s) continue;
      if (s.py < s.y) { s.vy += 150 * dt; s.py = Math.min(s.y, s.py + s.vy * dt); if (s.py >= s.y) s.vy = 0; }
      else if (s.py > s.y) s.py = s.y;
      if (s.py >= s.y - 0.002) { // fall done -> slide left
        const d = s.x - s.px; if (Math.abs(d) > 0.002) s.px += Math.sign(d) * Math.min(Math.abs(d), 16 * dt); else s.px = s.x;
      }
    }
    for (const s of this.dying) s.t += dt;
    this.dying = this.dying.filter(s => s.t < 0.45);
  }
}

// Level goal tracking for Level Challenge.
class LevelState {
  constructor(level) {
    this.level = level; this.goals = SW.goalsFor(level);
    this.score = 0; this.moves = 0; this.singles = 0; this.largest = 0; this.bestCols = 0;
  }
  apply(info) { // info from Board.remove
    this.moves++; this.score += info.base + info.bonus;
    if (info.n === 1) this.singles++;
    this.largest = Math.max(this.largest, info.n); this.bestCols = Math.max(this.bestCols, info.columns);
  }
  status() {
    const g = this.goals;
    return [
      { key: 'combo', label: 'Largest Combo', need: `${g.combo}+`, have: this.largest, ok: this.largest >= g.combo },
      { key: 'singles', label: 'Singles', need: `max ${g.singles}`, have: this.singles, ok: this.singles <= g.singles },
      { key: 'columns', label: 'Big Column Bonus', need: `${g.columns} columns`, have: this.bestCols, ok: this.bestCols >= g.columns },
      { key: 'moves', label: 'Total Combos', need: `max ${g.moves}`, have: this.moves, ok: this.moves <= g.moves },
      { key: 'score', label: 'Score', need: `${g.score}`, have: this.score, ok: this.score >= g.score },
    ];
  }
  metCount() { return this.status().filter(s => s.ok).length; }
  allMet() { return this.metCount() === 5; }
  // Finalise when the board is empty: doubles if no singles. Returns final level score (before time bonus).
  finalScore() { return this.singles === 0 ? this.score * 2 : this.score; }
}

if (typeof module !== 'undefined') module.exports = { SW, Board, LevelState, RNG };
