const socket = io();

const player = document.getElementById("player");
const enemy = document.getElementById("enemy");

let x = 200, y = 200;
const speed = 5;

function draw() {
  player.style.left = x + "px";
  player.style.top = y + "px";
}

document.addEventListener("keydown", e => {
  if (e.key === "ArrowUp") y -= speed;
  if (e.key === "ArrowDown") y += speed;
  if (e.key === "ArrowLeft") x -= speed;
  if (e.key === "ArrowRight") x += speed;

  draw();

  socket.emit("move", { x, y });
});

socket.on("move", data => {
  enemy.style.left = data.x + "px";
  enemy.style.top = data.y + "px";
});

draw();
