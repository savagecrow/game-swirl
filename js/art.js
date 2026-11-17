// Rendering helpers: swirls, particles, the snake mascot.
const ART = {
  // 0 orange, 1 blue, 2 purple, 3 green  (player colors in Versus: P1 orange, P2 blue, P3 purple, P4 green)
  colors: ['#ff9a1a', '#3a6bff', '#b43cff', '#33d433'],
  dark: ['#8a4300', '#0d2494', '#5a0f8f', '#0b6b0b'],
  names: ['Orange', 'Blue', 'Purple', 'Green'],
  // each color also has its own spiral shape so the game is readable without color
  shapes: [{ sides: 0, dir: 1 }, { sides: 4, dir: -1 }, { sides: 3, dir: 1 }, { sides: 0, dir: -1 }],
};

// Spirals are pre-rendered once per (color, size, white) into small canvases, then blitted (fast with 900 on screen).
ART._cache = {};
ART.spiral = function (g, cx, cy, r, ci, opts = {}) {
  const rs = Math.round(r * 2) / 2, key = ci + '|' + rs + '|' + (opts.white ? 1 : 0);
  let s = ART._cache[key];
  if (!s) {
    const d = Math.ceil(rs * 2 + 8), c = document.createElement('canvas'); c.width = c.height = d;
    ART._raw(c.getContext('2d'), d / 2, d / 2, rs, ci, { white: opts.white }); s = ART._cache[key] = c;
  }
  g.save(); g.translate(cx, cy); if (opts.rot) g.rotate(opts.rot); g.drawImage(s, -s.width / 2, -s.height / 2); g.restore();
};
ART._raw = function (g, cx, cy, r, ci, opts = {}) {
  const sh = ART.shapes[ci], turns = 2.3, steps = 100;
  const rot = opts.rot || 0, color = opts.white ? '#ffffff' : ART.colors[ci];
  const lw = Math.max(2, r * 0.27);
  g.save(); g.translate(cx, cy); g.rotate(rot);
  g.lineCap = 'round'; g.lineJoin = 'round';
  const path = () => {
    g.beginPath();
    for (let i = 0; i <= steps; i++) {
      const f = i / steps, th = sh.dir * f * turns * Math.PI * 2;
      let rr = r * 0.95 * (0.06 + 0.94 * f);
      if (sh.sides) { const a = (Math.PI * 2) / sh.sides, m = ((th % a) + a) % a; rr *= Math.cos(Math.PI / sh.sides) / Math.cos(m - a / 2); }
      const x = Math.cos(th) * rr, y = Math.sin(th) * rr;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
  };
  path(); g.strokeStyle = '#000'; g.lineWidth = lw + 3; g.stroke();
  path(); g.strokeStyle = opts.white ? '#fff' : ART.dark[ci]; g.lineWidth = lw + 0.5; g.stroke();
  path(); g.strokeStyle = color; g.lineWidth = lw * 0.72; g.stroke();
  g.restore();
};

// ---- particles ----
ART.Particles = class {
  constructor() { this.list = []; this.texts = []; }
  burst(x, y, ci, n, speed = 160, up = 0) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random());
      this.list.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - up, life: 0.5 + Math.random() * 0.6, t: 0, ci, sz: 2 + Math.random() * 3 });
    }
  }
  text(x, y, str, color) { this.texts.push({ x, y, str, color, t: 0 }); }
  update(dt) {
    for (const p of this.list) { p.t += dt; p.vy += 260 * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
    this.list = this.list.filter(p => p.t < p.life);
    for (const p of this.texts) { p.t += dt; p.y -= 30 * dt; }
    this.texts = this.texts.filter(p => p.t < 1.3);
  }
  draw(g) {
    for (const p of this.list) {
      g.globalAlpha = Math.max(0, 1 - p.t / p.life); g.fillStyle = p.ci < 0 ? '#fff' : ART.colors[p.ci];
      g.fillRect(p.x - p.sz / 2, p.y - p.sz / 2, p.sz, p.sz);
    }
    g.globalAlpha = 1; g.textAlign = 'center'; g.font = 'bold 20px Arial';
    for (const p of this.texts) {
      g.globalAlpha = Math.max(0, 1 - p.t / 1.3); g.lineWidth = 4; g.strokeStyle = '#000'; g.strokeText(p.str, p.x, p.y);
      g.fillStyle = p.color; g.fillText(p.str, p.x, p.y);
    }
    g.globalAlpha = 1;
  }
};

// ---- board drawing ----
// view = {board, x, y, cell, sel(array of swirls), cursor{x,y}|null, t}
ART.drawBoard = function (g, view) {
  const b = view.board, c = view.cell;
  g.save(); g.beginPath(); g.rect(view.x, view.y, b.cols * c, b.rows * c); g.clip();
  g.fillStyle = '#000'; g.fillRect(view.x, view.y, b.cols * c, b.rows * c);
  const pulse = (Math.sin(view.t * 9) + 1) / 2;
  for (const col of b.cells) for (const s of col) {
    if (!s) continue;
    const cx = view.x + (s.px + 0.5) * c, cy = view.y + (s.py + 0.5) * c;
    const hl = view.sel && view.sel.includes(s);
    if (hl) { g.fillStyle = `rgba(255,255,255,${0.14 + 0.16 * pulse})`; g.fillRect(cx - c / 2, cy - c / 2, c, c); }
    ART.spiral(g, cx, cy, c * 0.46, s.c, { white: hl && pulse > 0.5, rot: hl ? view.t * 3 : 0 });
  }
  for (const s of b.dying) { // pop: swell and fade
    const k = s.t / 0.45, cx = view.x + (s.px + 0.5) * c, cy = view.y + (s.py + 0.5) * c - k * c * 0.8;
    g.globalAlpha = 1 - k; ART.spiral(g, cx, cy, c * 0.46 * (1 + k * 0.7), s.c, { rot: k * 6 }); g.globalAlpha = 1;
  }
  if (view.cursor) {
    g.strokeStyle = '#fff'; g.lineWidth = 2; g.setLineDash([4, 3]);
    g.strokeRect(view.x + view.cursor.x * c + 1.5, view.y + view.cursor.y * c + 1.5, c - 3, c - 3); g.setLineDash([]);
  }
  g.restore();
};

// ---- snake mascot (Dreamcast version): coils in a corner and reacts ----
// mood: 'idle' | 'happy' | 'sad' | 'big'
ART.drawSnake = function (g, x, y, size, mood, t) {
  g.save(); g.translate(x, y); g.scale(size / 100, size / 100);
  const bob = mood === 'happy' || mood === 'big' ? Math.sin(t * 14) * 4 : Math.sin(t * 2) * 1.5;
  const shake = mood === 'sad' ? Math.sin(t * 30) * 6 : 0;
  // coiled body: orange spiral
  g.lineCap = 'round'; g.strokeStyle = '#7a3500'; g.lineWidth = 17;
  const coil = () => { g.beginPath(); for (let i = 0; i <= 60; i++) { const f = i / 60, a = f * Math.PI * 5.2, r = 8 + f * 40; const px = 50 + Math.cos(a) * r, py = 80 + Math.sin(a) * r * 0.5; i ? g.lineTo(px, py) : g.moveTo(px, py); } };
  coil(); g.stroke(); g.strokeStyle = '#ff9a1a'; g.lineWidth = 12; coil(); g.stroke();
  // neck + head
  const hx = 50 + shake, hy = 28 + bob;
  g.strokeStyle = '#7a3500'; g.lineWidth = 19; g.beginPath(); g.moveTo(50, 72); g.quadraticCurveTo(50, 50, hx, hy + 6); g.stroke();
  g.strokeStyle = '#ffb23a'; g.lineWidth = 14; g.beginPath(); g.moveTo(50, 72); g.quadraticCurveTo(50, 50, hx, hy + 6); g.stroke();
  g.fillStyle = '#ffb23a'; g.strokeStyle = '#7a3500'; g.lineWidth = 3;
  g.beginPath(); g.ellipse(hx, hy, 17, 14, 0, 0, 7); g.fill(); g.stroke();
  // eyes
  const look = mood === 'idle' ? Math.sin(t * 0.8) * 2 : 0;
  g.fillStyle = '#fff';
  for (const ex of [-7, 7]) {
    if (mood === 'big' || mood === 'happy') { g.strokeStyle = '#000'; g.lineWidth = 2.5; g.beginPath(); g.arc(hx + ex, hy - 2, 4, Math.PI, 0); g.stroke(); }
    else { g.beginPath(); g.arc(hx + ex, hy - 3, 5, 0, 7); g.fill(); g.fillStyle = '#000'; g.beginPath(); g.arc(hx + ex + look, hy - 3, 2.4, 0, 7); g.fill(); g.fillStyle = '#fff'; }
  }
  // mouth
  g.strokeStyle = '#000'; g.lineWidth = 2.5; g.beginPath();
  if (mood === 'sad') g.arc(hx, hy + 12, 6, Math.PI * 1.15, Math.PI * 1.85); else g.arc(hx, hy + 2, 7, Math.PI * 0.15, Math.PI * 0.85);
  g.stroke();
  if (mood === 'big') { g.fillStyle = '#e02020'; g.beginPath(); g.ellipse(hx, hy + 11, 3, 5, 0, 0, 7); g.fill(); }
  g.restore();
};
