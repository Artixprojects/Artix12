// game.js - client authoritative rendering with interpolation
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const statusEl = document.getElementById('status');
const scoreboard = document.getElementById('scoreboard');
const roomInput = document.getElementById('roomInput');
const joinBtn = document.getElementById('joinBtn');
const rematchBtn = document.getElementById('rematchBtn');

let socket;
let clientId = null;
let roomId = null;
let connected = false;
let serverState = { players: {}, bullets: [], tick:0, running:false };

// local predicted rendering state for interpolation
const renderState = { players: {}, bullets: {} };

const inputState = { up:false, down:false, left:false, right:false, shoot:false, aimX:0, aimY:0 };

function now() { return Date.now(); }

function connectToRoom(rm) {
  if (socket) socket.close();
  roomId = rm || 'default';
  clientId = (Math.random().toString(36).slice(2,9));
  // connect websocket to same host
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = `${protocol}//${location.host}`;
  socket = new WebSocket(url);

  socket.addEventListener('open', () => {
    socket.send(JSON.stringify({ type:'join', room: roomId, clientId }));
    statusEl.innerText = `Connected. Room: ${roomId}`;
    connected = true;
  });

  socket.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);

    if (msg.type === 'joined') {
      clientId = msg.clientId;
      serverState = msg.state;
      statusEl.innerText = `Joined as ${clientId}. Waiting for opponent...`;
      // initialize renderState players
      for (const [pid, p] of Object.entries(serverState.players)) {
        renderState.players[pid] = { x:p.x, y:p.y, renderX:p.x, renderY:p.y };
      }
      return;
    }

    if (msg.type === 'full') {
      statusEl.innerText = 'Room full.';
      return;
    }

    if (msg.type === 'ready') {
      statusEl.innerText = 'Both players connected. Game started.';
      return;
    }

    if (msg.type === 'rematch') {
      serverState = msg.state;
      statusEl.innerText = 'Rematch started';
      // reset render states
      for (const [pid, p] of Object.entries(serverState.players)) {
        renderState.players[pid] = { x:p.x, y:p.y, renderX:p.x, renderY:p.y };
      }
      rematchBtn.style.display = 'none';
      return;
    }

    if (msg.type === 'gameover') {
      serverState = msg.state;
      const winner = msg.winner;
      statusEl.innerText = (winner === clientId) ? 'You won!' : 'You lost!';
      rematchBtn.style.display = 'inline-block';
      updateScoreboard();
      return;
    }

    if (msg.type === 'state') {
      serverState = msg;
      // ensure renderState players exist
      for (const pid of Object.keys(serverState.players)) {
        if (!renderState.players[pid]) {
          renderState.players[pid] = { x: serverState.players[pid].x, y: serverState.players[pid].y, renderX: serverState.players[pid].x, renderY: serverState.players[pid].y };
        }
      }
      updateScoreboard();
    }
  });

  socket.addEventListener('close', () => {
    statusEl.innerText = 'Disconnected';
    connected = false;
  });
}

// send input at 20 times/sec (same as server tick)
setInterval(() => {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  const payload = { type: 'input', input: { ...inputState } };
  socket.send(JSON.stringify(payload));
}, 50);

// rendering loop 60fps
function renderLoop() {
  requestAnimationFrame(renderLoop);

  // interpolate renderState players towards server positions
  for (const [pid, p] of Object.entries(serverState.players || {})) {
    if (!renderState.players[pid]) {
      renderState.players[pid] = { renderX: p.x, renderY: p.y, x: p.x, y: p.y };
    }
    const r = renderState.players[pid];
    // server authoritative pos
    r.x = p.x;
    r.y = p.y;
    // interpolation smoothing
    r.renderX += (r.x - r.renderX) * 0.25;
    r.renderY += (r.y - r.renderY) * 0.25;
  }

  // clear
  ctx.clearRect(0,0,canvas.width,canvas.height);

  // draw bullets
  for (const b of serverState.bullets || []) {
    ctx.fillStyle = '#ffcc00';
    ctx.beginPath();
    ctx.arc(b.x, b.y, 4, 0, Math.PI*2);
    ctx.fill();
  }

  // draw players
  for (const [pid, p] of Object.entries(serverState.players || {})) {
    const r = renderState.players[pid] || { renderX: p.x, renderY: p.y };
    const x = r.renderX, y = r.renderY;
    // body
    ctx.fillStyle = (pid === clientId) ? '#22c55e' : '#60a5fa';
    ctx.beginPath();
    ctx.arc(x, y, 20, 0, Math.PI*2);
    ctx.fill();
    // health
    ctx.fillStyle = '#ff6b6b';
    for (let i=0;i<p.hp;i++){
      ctx.fillRect(x - 18 + i*12, y + 26, 8, 8);
    }
    // name / score
    ctx.fillStyle = '#e6eef8';
    ctx.font = '14px Arial';
    ctx.fillText(`${pid} (${p.score})`, x - 24, y - 28);
    if (!p.connected) {
      ctx.fillStyle = '#f97316';
      ctx.fillText('offline', x - 20, y + 44);
    }
  }

  // HUD optional: nothing else
}

function updateScoreboard() {
  const players = serverState.players || {};
  let html = '';
  for (const [pid, p] of Object.entries(players)) {
    html += `<div>${pid}: score ${p.score} | hp ${p.hp}</div>`;
  }
  scoreboard.innerHTML = html;
}

// input handling
window.addEventListener('keydown', e => {
  if (e.key === 'w' || e.key === 'W') inputState.up = true;
  if (e.key === 's' || e.key === 'S') inputState.down = true;
  if (e.key === 'a' || e.key === 'A') inputState.left = true;
  if (e.key === 'd' || e.key === 'D') inputState.right = true;
  if (e.code === 'Space') inputState.shoot = true;
});

window.addEventListener('keyup', e => {
  if (e.key === 'w' || e.key === 'W') inputState.up = false;
  if (e.key === 's' || e.key === 'S') inputState.down = false;
  if (e.key === 'a' || e.key === 'A') inputState.left = false;
  if (e.key === 'd' || e.key === 'D') inputState.right = false;
  if (e.code === 'Space') inputState.shoot = false;
});

// aim with mouse
canvas.addEventListener('mousemove', (ev) => {
  const rect = canvas.getBoundingClientRect();
  inputState.aimX = ev.clientX - rect.left;
  inputState.aimY = ev.clientY - rect.top;
});

// join button
joinBtn.addEventListener('click', () => {
  const rm = (roomInput.value || 'default').trim();
  connectToRoom(rm);
});

// rematch
rematchBtn.addEventListener('click', () => {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify({ type: 'rematch' }));
  rematchBtn.style.display = 'none';
});

// auto-join if ?room= param in url
const params = new URLSearchParams(location.search);
if (params.get('room')) {
  roomInput.value = params.get('room');
  connectToRoom(params.get('room'));
}

renderLoop();
