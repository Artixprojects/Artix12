// server.js
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });

// serve static frontend
app.use(express.static(path.join(__dirname, 'public')));

// rooms: { roomId: { players: { clientId: ws,...}, state: {...}, nextBulletId:1 } }
const rooms = new Map();

function makeInitialRoomState() {
  return {
    players: {}, // id -> player state
    bullets: [], // {id,x,y,vx,vy,owner,ttl}
    nextBulletId: 1,
    tick: 0,
    running: true,
    scoreLimit: 5
  };
}

function createPlayer(id) {
  return {
    id,
    x: Math.random() * 600 + 100, // spawn randomish
    y: Math.random() * 300 + 100,
    vx: 0,
    vy: 0,
    width: 28,
    height: 28,
    angle: 0,
    hp: 3,
    score: 0,
    input: { up:false, down:false, left:false, right:false, shoot:false },
    lastShotAt: 0,
    connected: true
  };
}

function broadcast(room, msg) {
  const text = JSON.stringify(msg);
  for (const [pid, client] of Object.entries(room.clients)) {
    if (client.readyState === WebSocket.OPEN) client.send(text);
  }
}

// handle upgrades to /ws
server.on('upgrade', (req, socket, head) => {
  // allow all upgrades to wss
  wss.handleUpgrade(req, socket, head, ws => {
    wss.emit('connection', ws, req);
  });
});

wss.on('connection', (ws, req) => {
  // Each client must send a "join" message with {type:'join', room: 'roomid', name: optional}
  ws.isAlive = true;
  ws.on('pong', () => ws.isAlive = true);

  ws.on('message', message => {
    let msg;
    try { msg = JSON.parse(message); } catch(e) { return; }

    // JOIN
    if (msg.type === 'join') {
      const roomId = msg.room || 'default';
      if (!rooms.has(roomId)) {
        rooms.set(roomId, {
          clients: {}, // clientId -> ws
          state: makeInitialRoomState()
        });
      }
      const room = rooms.get(roomId);

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

      // if no player state exist, create
      if (!room.state.players[clientId]) {
        room.state.players[clientId] = createPlayer(clientId);
      } else {
        room.state.players[clientId].connected = true;
      }

      // send assigned
      ws.send(JSON.stringify({
        type: 'joined',
        clientId,
        roomId,
        state: room.state
      }));

      // if two players present => start or resume
      if (Object.keys(room.clients).length === 2) {
        room.state.running = true;
        broadcast(room, { type: 'ready', message: 'Both players connected. Game running.' });
      }

      return;
    }

    // INPUT
    if (msg.type === 'input') {
      const roomId = ws.roomId;
      if (!roomId) return;
      const room = rooms.get(roomId);
      if (!room) return;
      const player = room.state.players[ws.clientId];
      if (!player) return;
      // update player's input
      player.input = msg.input;
      return;
    }

    // REMATCH
    if (msg.type === 'rematch') {
      const roomId = ws.roomId;
      if (!roomId) return;
      const room = rooms.get(roomId);
      if (!room) return;
      // reset state
      room.state = makeInitialRoomState();
      // recreate players in state to keep same ids
      for (const pid of Object.keys(room.clients)) {
        room.state.players[pid] = createPlayer(pid);
      }
      broadcast(room, { type: 'rematch', state: room.state });
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

    // if empty room -> delete after a short timeout
    if (Object.keys(room.clients).length === 0) {
      setTimeout(() => {
        const r = rooms.get(roomId);
        if (r && Object.keys(r.clients).length === 0) rooms.delete(roomId);
      }, 60 * 1000);
    }
  });
});

// Game loop per room (20 ticks/sec)
setInterval(() => {
  for (const [roomId, room] of rooms.entries()) {
    const state = room.state;
    if (!state.running) continue;

    state.tick++;

    // process player inputs -> velocity
    for (const [pid, p] of Object.entries(state.players)) {
      const inp = p.input;
      const speed = 3;
      // reset velocity
      p.vx = 0; p.vy = 0;
      if (inp.left) p.vx = -speed;
      if (inp.right) p.vx = speed;
      if (inp.up) p.vy = -speed;
      if (inp.down) p.vy = speed;

      // normalize diagonal for consistent speed (optional)
      if (p.vx !==0 && p.vy !==0) {
        p.vx *= 0.7071; p.vy *= 0.7071;
      }

      // apply movement (server authoritative)
      p.x += p.vx;
      p.y += p.vy;

      // clamp to bounds (simple arena)
      p.x = Math.max(20, Math.min(780, p.x));
      p.y = Math.max(20, Math.min(580, p.y));

      // shooting: simple rate-limit (300ms)
      if (inp.shoot) {
        const now = Date.now();
        if (now - (p.lastShotAt || 0) > 300) {
          p.lastShotAt = now;
          // create bullet in direction of mouse aim or simply in the facing direction.
          // We'll accept optional aim in input: input.aimX, input.aimY
          let aimX = inp.aimX, aimY = inp.aimY;
          let bx = p.x, by = p.y;
          let dx = 0, dy = -1;
          if (typeof aimX === 'number' && typeof aimY === 'number') {
            dx = aimX - p.x;
            dy = aimY - p.y;
            const mag = Math.hypot(dx, dy) || 1;
            dx /= mag; dy /= mag;
          } else {
            dy = -1; dx = 0;
          }
          const speedB = 7;
          const bullet = {
            id: (state.nextBulletId++).toString(),
            x: bx + dx * 24,
            y: by + dy * 24,
            vx: dx * speedB,
            vy: dy * speedB,
            owner: p.id,
            ttl: 100 // ticks before disappear
          };
          state.bullets.push(bullet);
        }
      }
    }

    // update bullets
    const bullets = state.bullets;
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.x += b.vx;
      b.y += b.vy;
      b.ttl--;
      // remove if out of bounds or ttl
      if (b.ttl <= 0 || b.x < -50 || b.x > 860 || b.y < -50 || b.y > 630) {
        bullets.splice(i,1);
        continue;
      }

      // collision: check with players (not with owner)
      for (const [pid, p] of Object.entries(state.players)) {
        if (pid === b.owner) continue;
        // simple circle collision
        const dx = p.x - b.x;
        const dy = p.y - b.y;
        const dist2 = dx*dx + dy*dy;
        const r = 20 + 4; // player radius + bullet radius
        if (dist2 <= r*r) {
          // hit!
          p.hp -= 1;
          // award point to owner if hp <=0
          const owner = state.players[b.owner];
          if (p.hp <= 0) {
            if (owner) owner.score += 1;
            // respawn victim
            p.hp = 3;
            p.x = Math.random() * 600 + 100;
            p.y = Math.random() * 300 + 100;
          }
          // remove bullet
          bullets.splice(i,1);
          break;
        }
      }
    }

    // win check
    for (const [pid, p] of Object.entries(state.players)) {
      if (p.score >= state.scoreLimit) {
        state.running = false;
        // broadcast game over with winner
        const payload = { type: 'gameover', winner: pid, state };
        for (const [cid, client] of Object.entries(room.clients)) {
          if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(payload));
        }
      }
    }

    // broadcast state to all clients
    const snap = {
      type: 'state',
      tick: state.tick,
      players: state.players,
      bullets: state.bullets,
      running: state.running
    };
    for (const [cid, client] of Object.entries(room.clients)) {
      if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(snap));
    }
  }
}, 50); // 50ms per tick = 20 ticks/sec

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('Server listening on', PORT);
});
