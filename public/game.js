<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Game</title>
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <div class="topbar">
    <div id="modeLabel">Mode: -</div>
    <div id="status">Not connected</div>
    <div id="scoreboard"></div>
    <div style="margin-left:auto"><button id="backBtn">Back</button></div>
  </div>

  <canvas id="game" width="800" height="600"></canvas>
  <div class="bottom">
    <button id="rematchBtn" style="display:none">Request Rematch</button>
  </div>

<script>
const params = new URLSearchParams(location.search);
const room = params.get('room') || 'default';
const mode = params.get('mode') || 'shooter';
const clientId = Math.random().toString(36).slice(2,9);

// show mode label
document.getElementById('modeLabel').innerText = 'Mode: ' + mode.toUpperCase();

// load specific script dynamically
const script = document.createElement('script');
script.src = mode === 'block' ? '/block.js' : '/shooter.js';
document.body.appendChild(script);

// provide globals expected by modules
window.GAME_PARAMS = { room, mode, clientId };

document.getElementById('backBtn').onclick = () => {
  window.location = '/';
};
</script>
</body>
</html>
