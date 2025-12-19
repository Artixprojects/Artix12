const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

let birdY = 250;
let velocity = 0;
const gravity = 0.5;
const jump = -8;

let pipes = [];
let frame = 0;
let score = 0;

document.addEventListener("keydown", () => velocity = jump);

function spawnPipe() {
  const gap = 140;
  const top = Math.random() * 200 + 50;
  pipes.push({ x: 400, top });
}

function update() {
  velocity += gravity;
  birdY += velocity;

  if (frame % 90 === 0) spawnPipe();
  frame++;

  pipes.forEach(p => p.x -= 2);
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // bird
  ctx.fillStyle = "yellow";
  ctx.fillRect(80, birdY, 20, 20);

  // pipes
  ctx.fillStyle = "green";
  pipes.forEach(p => {
    ctx.fillRect(p.x, 0, 40, p.top);
    ctx.fillRect(p.x, p.top + 140, 40, 600);
  });
}

function loop() {
  update();
  draw();
  requestAnimationFrame(loop);
}

loop();
