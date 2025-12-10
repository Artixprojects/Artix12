// shooter.js
(function(){
const { room, clientId, mode } = window.GAME_PARAMS || {};
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const statusEl = document.getElementById('status') || { innerText: '' };
const scoreboard = document.getElementById('scoreboard') || { innerHTML: '' };
const rematchBtn = document.getElementById('rematchBtn');

let socket;
let myId = clientId;
let serverState = { players:{}, bullets:[], tick:0, running:false };

const inputState = { up:false,down:false,left:false,right:false, shoot:false, aimX: null, aimY: null };

function connect() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  socket = new WebSocket(`${protocol}//${location.host}`);
  socket.addEventListener('open', () => {
    socket.send(JSON.stringify({ type:'join', room, clientId: myId, mode:'shooter' }));
    statusEl.innerText = `Connected (shooter). Room: ${room}`;
  });
  socket.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.type === 'joined') {
      myId = msg.clientId;
      serverState = msg.state;
      statusEl.innerText = `Joined as ${myId}. Waiting for opponent...`;
    }
    if (msg.type === 'ready') {
      statusEl.innerText = 'Both players connected. Game started.';
    }
    if (msg.type === 'full') {
      statusEl.innerText = 'Room full.';
    }
    if (msg.type === 'rematch') {
      serverState = msg.state;
      statusEl.innerText = 'Rematch started';
      rematchBtn.style.display = 'none';
    }
    if (msg.type === 'gameover') {
      serverState = msg.state;
      const winner = msg.winner;
      statusEl.innerText = (winner === myId) ? 'You won!' : 'You lost!';
      rematchBtn.style.display = 'inline-block';
      updateScore();
    }
    if (msg.type === 'state') {
      serverState = msg;
      updateScore();
    }
  });
  socket.addEventListener('close', ()=> { statusEl.innerText = 'Disconnected'; });
}

setInterval(() => {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify({ type:'input', input: inputState }));
}, 50);

function updateScore(){
  const players = serverState.players || {};
  let html = '';
  for (const pid in players) {
    html += `<div>${pid}: score ${players[pid].score} | hp ${players[pid].hp}</div>`;
  }
  scoreboard.innerHTML = html;
}

function render() {
  requestAnimationFrame(render);
  ctx.clearRect(0,0,canvas.width,canvas.height);

  // bullets
  for (const b of serverState.bullets || []) {
    ctx.fillStyle = '#ffcc00';
    ctx.beginPath();
    ctx.arc(b.x, b.y, 4, 0, Math.PI*2);
    ctx.fill();
  }

  // players
  for (const pid in serverState.players) {
    const p = serverState.players[pid];
    ctx.fillStyle = pid === myId ? '#22c55e' : '#60a5fa';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 20, 0, Math.PI*2);
    ctx.fill();
    ctx.fillStyle='#e6eef8';
    ctx.font='14px Arial';
    ctx.fillText(`${pid} (${p.score})`, p.x-24, p.y-28);
  }
}
render();

window.addEventListener('keydown', e=>{
  if (e.key === 'w' || e.key === 'W') inputState.up = true;
  if (e.key === 's' || e.key === 'S') inputState.down = true;
  if (e.key === 'a' || e.key === 'A') inputState.left = true;
  if (e.key === 'd' || e.key === 'D') inputState.right = true;
  if (e.code === 'Space') inputState.shoot = true;
});
window.addEventListener('keyup', e=>{
  if (e.key === 'w' || e.key === 'W') inputState.up = false;
  if (e.key === 's' || e.key === 'S') inputState.down = false;
  if (e.key === 'a' || e.key === 'A') inputState.left = false;
  if (e.key === 'd' || e.key === 'D') inputState.right = false;
  if (e.code === 'Space') inputState.shoot = false;
});
canvas.addEventListener('mousemove', (ev)=>{
  const r = canvas.getBoundingClientRect();
  inputState.aimX = ev.clientX - r.left;
  inputState.aimY = ev.clientY - r.top;
});

rematchBtn.addEventListener('click', ()=>{
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify({ type:'rematch' }));
  rematchBtn.style.display = 'none';
});

connect();
})();
