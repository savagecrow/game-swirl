// Peer-to-peer link (WebRTC via PeerJS). One host, one guest; the host shares a short room code.
const NET = {
  peer: null, conn: null, code: '', host: false,
  onMsg: null,      // (msg) => void
  onStatus: null,   // ('waiting'|'connecting'|'connected'|'closed'|'error', info) => void
  _status(s, i) { if (this.onStatus) this.onStatus(s, i); },
  _id(code) { return 'swirl-game-' + code; },
  _wire(conn) {
    this.conn = conn;
    conn.on('open', () => this._status('connected'));
    conn.on('data', m => { if (this.onMsg) this.onMsg(m); });
    conn.on('close', () => { if (this.conn === conn) this._status('closed'); });
    conn.on('error', e => this._status('error', String(e && e.message || e)));
    if (conn.open) this._status('connected');
  },
  close() {
    const p = this.peer, c = this.conn; this.peer = null; this.conn = null;
    try { if (c) c.close(); } catch (e) { } try { if (p) p.destroy(); } catch (e) { }
  },
  send(m) { if (this.conn && this.conn.open) this.conn.send(m); },
  get connected() { return !!(this.conn && this.conn.open); },
  // Host: create a room. Retries with a new code if the id is taken.
  hostRoom(tries = 0) {
    this.close(); this.host = true;
    if (typeof Peer === 'undefined') return this._status('error', 'Network library failed to load.');
    const alpha = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let code = '';
    for (let i = 0; i < 4; i++) code += alpha[Math.floor(Math.random() * alpha.length)];
    const peer = new Peer(this._id(code)); this.peer = peer; this.code = code;
    peer.on('open', () => this._status('waiting', code));
    peer.on('connection', c => { if (this.conn && this.conn.open) { c.close(); return; } this._wire(c); });
    peer.on('error', e => {
      if (e.type === 'unavailable-id' && tries < 5) return this.hostRoom(tries + 1);
      this._status('error', e.type === 'network' || e.type === 'server-error' || e.type === 'socket-error' ? 'Could not reach the matchmaking server.' : String(e.type || e));
    });
    peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) { } });
  },
  // Guest: join a room by code.
  joinRoom(code) {
    this.close(); this.host = false; code = String(code || '').trim().toUpperCase();
    if (typeof Peer === 'undefined') return this._status('error', 'Network library failed to load.');
    if (code.length !== 4) return this._status('error', 'Room codes are 4 characters.');
    const peer = new Peer(); this.peer = peer; this.code = code; this._status('connecting');
    peer.on('open', () => {
      const c = peer.connect(this._id(code), { reliable: true });
      let t = setTimeout(() => { if (!c.open) this._status('error', 'No answer. Check the code and try again.'); }, 12000);
      c.on('open', () => clearTimeout(t));
      this._wire(c);
    });
    peer.on('error', e => this._status('error', e.type === 'peer-unavailable' ? 'No room with that code.' : e.type === 'network' || e.type === 'server-error' || e.type === 'socket-error' ? 'Could not reach the matchmaking server.' : String(e.type || e)));
  },
};
