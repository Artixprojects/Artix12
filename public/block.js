// block.js
(function(){
const { room, clientId, mode } = window.GAME_PARAMS || {};
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const statusEl = document.getElementById('status') || { innerText: '' };
const scoreboard = document.getElementById('scoreboard') || { innerHTML: '' };
const rematchBtn = document.getElementById('rematchBtn');

let socket;
let myId = clientId;
let serverState = { players:{}, grid:{ w:20, h:15, cells:[] }, tick:0, running:false };
const inputState = { up:false,down:false,left:false,right:false, action:null };

function connect() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  socket = new WebSocket(`${protocol}//${location.host}`);
  socket.addEventListener('open', () => {
    socket.send(JSON.stringify({ type:'join', room, clientId: myId, mode:'block' }));
    statusEl.innerText = `Connected (BlockWorld). Room: ${room}`;
  });
  socket.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.type === 'joined') {
      myId = msg.clientId;
      serverState = msg.state || serverState;
      statusEl.innerText = `Joined as ${myId}. Waiting for opponent...`;
    }
    if (msg.type === 'ready') {
      statusEl.innerText = 'Both players connected. Game started.';
    }
    if (msg.type === 'state') {
      serverState = msg;
    }
    if (msg.type === 'rematch') {
      serverState = msg.state;
      statusEl.innerText = 'Rematch started';
      rematchBtn.style.display = 'none';
    }
    if (msg.type === 'gameover') {
      statusEl.innerText = 'Game over';
      rematchBtn.style.display = 'inline-block';
    }
  });
  socket.addEventListener('close', ()=> { statusEl.innerText = 'Disconnected'; });
}

// send input regularly
setInterval(() => {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify({ type:'input', input: inputState }));
}, 50);

// render loop
function renderLoop(){
  requestAnimationFrame(renderLoop);
  ctx.clearRect(0,0,canvas.width,canvas.height);

  const cellSize = 32;
  const grid = serverState.grid || { w:20, h:15, cells:[] };

  // draw grid background
  for (let y=0;y<grid.h;y++){
    for (let x=0;x<grid.w;x++){
      const val = (grid.cells && grid.cells[y] && grid.cells[y][x]) || 0;
      if (val === 1) {
        ctx.fillStyle = '#6b8e23';
        ctx.fillRect(x*cellSize, y*cellSize, cellSize, cellSize);
      } else {
        ctx.fillStyle = '#0f1724';
        ctx.fillRect(x*cellSize, y*cellSize, cellSize, cellSize);
      }
      // grid lines
      ctx.strokeStyle = '#0b2233';
      ctx.strokeRect(x*cellSize, y*cellSize, cellSize, cellSize);
    }
  }

  // draw players
  for (const pid in serverState.players) {
    const p = serverState.players[pid];
    ctx.fillStyle = pid === myId ? '#22c55e' : '#60a5fa';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 12, 0, Math.PI*2);
    ctx.fill();
    ctx.fillStyle = '#e6eef8';
    ctx.font = '12px Arial';
    ctx.fillText(pid, p.x-16, p.y-18);
  }
}
renderLoop();

// input handling
window.addEventListener('keydown', e=>{
  if (e.key === 'w' || e.key === 'W') inputState.up = true;
  if (e.key === 's' || e.key === 'S') inputState.down = true;
  if (e.key === 'a' || e.key === 'A') inputState.left = true;
  if (e.key === 'd' || e.key === 'D') inputState.right = true;
  if (e.key === 'e' || e.key === 'E') { // place block at mouse
    if (lastMouseGrid) inputState.action = { type:'place', gx: lastMouseGrid.x, gy: lastMouseGrid.y };
  }
  if (e.key === 'q' || e.key === 'Q') { // break block
    if (lastMouseGrid) inputState.action = { type:'break', gx: lastMouseGrid.x, gy: lastMouseGrid.y };
  }
});

window.addEventListener('keyup', e=>{
  if (e.key === 'w' || e.key === 'W') inputState.up = false;
  if (e.key === 's' || e.key === 'S') inputState.down = false;
  if (e.key === 'a' || e.key === 'A') inputState.left = false;
  if (e.key === 'd' || e.key === 'D') inputState.right = false;
});

let lastMouseGrid = null;
canvas.addEventListener('mousemove', (ev)=>{
  const rect = canvas.getBoundingClientRect();
  const mx = ev.clientX - rect.left, my = ev.clientY - rect.top;
  const gx = Math.floor(mx / 32), gy = Math.floor(my / 32);
  lastMouseGrid = { x: gx, y: gy };
});

canvas.addEventListener('mousedown', (ev)=>{
  // left click place, right click break
  ev.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const mx = ev.clientX - rect.left, my = ev.clientY - rect.top;
  const gx = Math.floor(mx / 32), gy = Math.floor(my / 32);
  if (ev.button === 0) {
    inputState.action = { type:'place', gx, gy };
  } else if (ev.button === 2) {
    inputState.action = { type:'break', gx, gy };
  }
});

// prevent context menu on right click
canvas.addEventListener('contextmenu', e => e.preventDefault());

rematchBtn.addEventListener('click', ()=>{
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify({ type:'rematch' }));
  rematchBtn.style.display = 'none';
});

connect();
})();
