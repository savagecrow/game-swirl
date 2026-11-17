// CPU opponents. Pure functions over a Board.
const AI = {
  // Pick a group to remove. ctx: {color (player's own color or -1), diff 1..3, mine: bool whether own-color points double}
  pick(board, ctx = {}) {
    const groups = board.allGroups(); if (!groups.length) return null;
    const own = ctx.color == null ? -1 : ctx.color, diff = ctx.diff || 2;
    let best = null, bestV = -Infinity;
    const ownLeft = own >= 0 ? board.colorCount(own) : 0;
    for (const g of groups) {
      const n = g.length, c = g[0].c;
      let v;
      if (ctx.versus) {
        if (n === 1) v = c === own ? -200 : -100; else v = SW.comboPts(n) * (c === own ? 2 : 1);
        if (c === own && n >= ownLeft && ownLeft > 0) v -= 5000; // never remove our own last swirls
        if (c !== own && n > 1) v += 15;                         // taking opponents' colors is good
        if (n === 1 && c !== own) v -= 20;
      } else {
        v = SW.comboPts(n);
        if (n === 1) v -= 400; // singles are a last resort
        if (ctx.double && c === own && n > 1) v *= 2;
      }
      v += Math.random() * (4 - diff) * 40 * (ctx.noise == null ? 1 : ctx.noise); // easier = noisier
      if (diff === 1 && Math.random() < 0.25) v = Math.random() * 100;
      if (v > bestV) { bestV = v; best = g; }
    }
    return best;
  },
  // Clear whole-board solo (used by debug autoplay): prefer big groups, singles last.
  greedy(board) { return AI.pick(board, { diff: 3, noise: 0 }); },
};
