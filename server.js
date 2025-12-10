// server.js
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });

app.use(express.static(path.join(__dirname, 'public')));
// Serve game page for /game route
app.get('/game', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'game.html'));
});


// Rooms map
// rooms: roomId -> { clients: {clientId: ws}, state: {...} }
const rooms = new Map();

function makeInitialRoomState(mode = 'shooter') {
  if (mode === 'block') {
    return {
      mode: 'block',
      players: {},              // id -> player state
      grid: makeGrid(20, 15),   // simple block grid width x height
      tick: 0,
      running: true,
      scoreLimit: 5
    };
  }
  // shooter default
  return {
    mode: 'shooter',
    players: {},   // id -> player state
    bullets: [],
    nextBulletId: 1,
    tick: 0,
    running: true,
    scoreLimit: 5
  };
}

function makeGrid(w, h) {
  const g = [];
  for (let y=0;y<h;y++){
    g[y] = [];
    for (let x=0;x<w;x++){
      g[y][x] = 0; // 0 = empty, 1 = block
    }
  }
  return { w, h, cells: g };
}

function createPlayer(id, mode) {
  if (mode === 'block') {
    return {
      id,
      x: Math.floor(Math.random() * (20)) * 32 + 32,
      y: Math.floor(Math.random() * (15)) * 32 + 32,
      vx:0, vy:0,
      width:28, height:28,
      hp:3,
      score:0,
      input: { up:false,down:false,left:false,right:false, action:null }, // action for block: {type:'place'|'break', gx, gy}
      connected:true
    };
  }
  // shooter
  return {
    id,
    x: Math.random() * 600 + 100,
    y: Math.random() * 300 + 100,
    vx:0, vy:0,
    width:28, height:28,
    hp:3,
    score:0,
    input: { up:false,down:false,left:false,right:false, shoot:false, aimX:null, aimY:null },
    lastShotAt:0,
    connected:true
  };
}

function broadcast(room, msg) {
  const text = JSON.stringify(msg);
  for (const [cid, client] of Object.entries(room.clients)) {
    if (client.readyState === WebSocket.OPEN) client.send(text);
  }
}

// WebSocket upgrade handling
server.on('upgrade', (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, ws => {
    wss.emit('connection', ws, req);
  });
});

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => ws.isAlive = true);

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch (e) { return; }
    // JOIN: { type:'join', room:'abc', clientId:'id', mode:'block'|'shooter' (optional) }
    if (msg.type === 'join') {
      const roomId = msg.room || 'default';
      const chosenMode = msg.mode || 'shooter';

      // create room if needed, mode is set only on first create
      if (!rooms.has(roomId)) {
        rooms.set(roomId, {
          clients: {},
          state: makeInitialRoomState(chosenMode)
        });
      }
      const room = rooms.get(roomId);

      // if existing room has different mode, override client's requested mode to room.mode
      const roomMode = room.state.mode;

      // allow max 2 players
      if (Object.keys(room.clients).length >= 2 && !room.clients[msg.clientId]) {
        ws.send(JSON.stringify({ type: 'full' }));
        ws.close();
        return;
      }

      const clientId = msg.clientId || (Math.random().toString(36).slice(2,9));
      ws.clientId = clientId;
      ws.roomId = roomId;
      room.clients[clientId] = ws;

      if (!room.state.players[clientId]) {
        room.state.players[clientId] = createPlayer(clientId, roomMode);
      } else {
        room.state.players[clientId].connected = true;
      }

      ws.send(JSON.stringify({
        type: 'joined',
        clientId,
        roomId,
        mode: roomMode,
        state: room.state
      }));

      if (Object.keys(room.clients).length === 2) {
        room.state.running = true;
        broadcast(room, { type: 'ready', message: 'Both players connected', mode: roomMode });
      }
      return;
    }

    // INPUT: { type:'input', input: {...} }
    if (msg.type === 'input') {
      const roomId = ws.roomId;
      if (!roomId) return;
      const room = rooms.get(roomId);
      if (!room) return;
      const player = room.state.players[ws.clientId];
      if (!player) return;
      // assign input; for block mode input.action can be set for place/break
      player.input = msg.input;
      return;
    }

    // REMATCH
    if (msg.type === 'rematch') {
      const roomId = ws.roomId;
      if (!roomId) return;
      const room = rooms.get(roomId);
      if (!room) return;
      const mode = room.state.mode;
      room.state = makeInitialRoomState(mode);
      for (const pid of Object.keys(room.clients)) {
        room.state.players[pid] = createPlayer(pid, mode);
      }
      broadcast(room, { type: 'rematch', state: room.state });
      return;
    }

    // optional: client can request mode change if alone in room (not recommended live)
    if (msg.type === 'setMode') {
      const roomId = ws.roomId || msg.room;
      if (!roomId) return;
      const room = rooms.get(roomId);
      if (!room) return;
      // only allow if room empty or single player
      if (Object.keys(room.clients).length <= 1) {
        room.state = makeInitialRoomState(msg.mode || 'shooter');
        // re-create players
        for (const pid of Object.keys(room.clients)) {
          room.state.players[pid] = createPlayer(pid, room.state.mode);
        }
        broadcast(room, { type: 'modeChanged', mode: room.state.mode, state: room.state });
      }
      return;
    }
  });

  ws.on('close', () => {
    const roomId = ws.roomId;
    const clientId = ws.clientId;
    if (!roomId || !rooms.has(roomId)) return;
    const room = rooms.get(roomId);
    if (room.clients[clientId]) delete room.clients[clientId];
    if (room.state.players[clientId]) room.state.players[clientId].connected = false;

    if (Object.keys(room.clients).length === 0) {
      setTimeout(() => {
        const r = rooms.get(roomId);
        if (r && Object.keys(r.clients).length === 0) rooms.delete(roomId);
      }, 60 * 1000);
    }
  });
});

// Game loop runs for all rooms; inside we branch by mode
setInterval(() => {
  for (const [roomId, room] of rooms.entries()) {
    const state = room.state;
    if (!state.running) continue;
    state.tick++;

    if (state.mode === 'shooter') {
      // --- shooter logic (similar to previous)
      for (const [pid, p] of Object.entries(state.players)) {
        const inp = p.input || {};
        const speed = 3;
        p.vx = 0; p.vy = 0;
        if (inp.left) p.vx = -speed;
        if (inp.right) p.vx = speed;
        if (inp.up) p.vy = -speed;
        if (inp.down) p.vy = speed;
        if (p.vx !==0 && p.vy !==0) { p.vx *= 0.7071; p.vy *= 0.7071; }
        p.x += p.vx; p.y += p.vy;
        p.x = Math.max(20, Math.min(780, p.x));
        p.y = Math.max(20, Math.min(580, p.y));

        if (inp.shoot) {
          const now = Date.now();
          if (now - (p.lastShotAt || 0) > 300) {
            p.lastShotAt = now;
            let aimX = inp.aimX, aimY = inp.aimY;
            let dx = 0, dy = -1;
            if (typeof aimX === 'number' && typeof aimY === 'number') {
              dx = aimX - p.x; dy = aimY - p.y;
              const mag = Math.hypot(dx,dy) || 1; dx/=mag; dy/=mag;
            } else { dy = -1; dx = 0; }
            const speedB = 7;
            const bullet = {
              id: (state.nextBulletId++).toString(),
              x: p.x + dx*24,
              y: p.y + dy*24,
              vx: dx*speedB,
              vy: dy*speedB,
              owner: p.id,
              ttl: 100
            };
            state.bullets.push(bullet);
          }
        }
      }

      // bullets update & collision
      for (let i = state.bullets.length - 1; i >= 0; i--) {
        const b = state.bullets[i];
        b.x += b.vx; b.y += b.vy; b.ttl--;
        if (b.ttl <= 0 || b.x < -50 || b.x > 860 || b.y < -50 || b.y > 630) { state.bullets.splice(i,1); continue; }
        for (const [pid, p] of Object.entries(state.players)) {
          if (pid === b.owner) continue;
          const dx = p.x - b.x, dy = p.y - b.y;
          if (dx*dx + dy*dy <= (20+4)*(20+4)) {
            p.hp -= 1;
            const owner = state.players[b.owner];
            if (p.hp <= 0 && owner) {
              owner.score += 1;
              p.hp = 3;
              p.x = Math.random()*600 + 100; p.y = Math.random()*300 + 100;
            }
            state.bullets.splice(i,1);
            break;
          }
        }
      }

      // win check
      for (const [pid,p] of Object.entries(state.players)) {
        if (p.score >= state.scoreLimit) {
          state.running = false;
          const payload = { type:'gameover', winner: pid, state };
          broadcast(room, payload);
        }
      }

      // broadcast shooter state
      const snap = { type:'state', tick: state.tick, players: state.players, bullets: state.bullets, running: state.running };
      broadcast(room, snap);
    }

    else if (state.mode === 'block') {
      // --- block world logic (very simple)
      // process movement inputs
      for (const [pid, p] of Object.entries(state.players)) {
        const inp = p.input || {};
        const speed = 3;
        p.vx = 0; p.vy = 0;
        if (inp.left) p.vx = -speed;
        if (inp.right) p.vx = speed;
        if (inp.up) p.vy = -speed;
        if (inp.down) p.vy = speed;
        if (p.vx !==0 && p.vy !==0) { p.vx *= 0.7071; p.vy *= 0.7071; }
        p.x += p.vx; p.y += p.vy;
        // clamp to canvas sized by grid
        const maxX = state.grid.w * 32 - 16;
        const maxY = state.grid.h * 32 - 16;
        p.x = Math.max(16, Math.min(maxX, p.x));
        p.y = Math.max(16, Math.min(maxY, p.y));

        // process action if exists (place or break)
        if (inp.action && typeof inp.action === 'object') {
          const a = inp.action;
          const gx = a.gx, gy = a.gy;
          if (gx >= 0 && gy >=0 && gx < state.grid.w && gy < state.grid.h) {
            if (a.type === 'place') {
              // place block if empty
              if (state.grid.cells[gy][gx] === 0) {
                state.grid.cells[gy][gx] = 1;
              }
            } else if (a.type === 'break') {
              // remove block if present
              if (state.grid.cells[gy][gx] === 1) {
                state.grid.cells[gy][gx] = 0;
              }
            }
          }
          // clear action after processed (so it doesn't repeat)
          p.input.action = null;
        }
      }

      // broadcast block state
      const snap = { type:'state', tick: state.tick, players: state.players, grid: state.grid, running: state.running };
      broadcast(room, snap);
    } // end block mode
  } // end for rooms
}, 50); // 20 ticks/sec

// ping-pong to keep client alive ; cleanup dead sockets
setInterval(() => {
  wss.clients.forEach(ws => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Server listening on', PORT));

