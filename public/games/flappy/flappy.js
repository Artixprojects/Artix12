const scoreSounds = [
  new Audio("sounds/score1.mp3"),
  new Audio("sounds/score2.mp3"),
  new Audio("sounds/score3.mp3")
];

const dieSounds = [
  new Audio("sounds/die1.mp3"),
  new Audio("sounds/die2.mp3")
];
scoreSounds.forEach(s => s.volume = 0.6);
dieSounds.forEach(s => s.volume = 0.8);


function playRandom(arr) {
  const s = arr[Math.floor(Math.random() * arr.length)];
  s.currentTime = 0;
  s.play();
}



const birdImg = new Image();
birdImg.src = "assets/bird.jpg";


const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const jumpSound = new Audio("sounds/jump.mp3");
const dieSound = new Audio("sounds/die.mp3");

let bird = {
  x: 60,
  y: 200,
  radius: 12,
  velocity: 0
};

let gravity = 0.5;
let jump = -8;

let pipes = [];
let frame = 0;
let score = 0;
let gameOver = false;

// CONTROLS
document.addEventListener("keydown", flap);
document.addEventListener("click", flap);

function flap() {
  if (gameOver) location.reload();
  bird.velocity = jump;
  jumpSound.play();
}

// GAME LOOP
function loop() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // bird
  bird.velocity += gravity;
  bird.y += bird.velocity;

  ctx.drawImage(
  birdImg,
  bird.x - 16,
  bird.y - 16,
  40,
  40
);


  
  // pipes
  if (frame % 90 === 0) {
    let gap = 140;
    let top = Math.random() * 200 + 50;
    pipes.push({
      x: canvas.width,
      top,
      bottom: top + gap,
      passed: false
    });
  }

  pipes.forEach(p => {
    p.x -= 2;

    ctx.fillStyle = "green";
    ctx.fillRect(p.x, 0, 40, p.top);
    ctx.fillRect(p.x, p.bottom, 40, canvas.height);

    // collision
    if (
      bird.x + bird.radius > p.x &&
      bird.x - bird.radius < p.x + 40 &&
      (bird.y - bird.radius < p.top ||
       bird.y + bird.radius > p.bottom)
    ) {
      endGame();
    }

    // score
    if (!p.passed && p.x + 40 < bird.x) {
      score++;
      playRandom(scoreSounds);
      document.getElementById("score").innerText = score;
      p.passed = true;
    }
  });

  // ground death
  if (bird.y > canvas.height || bird.y < 0) {
    endGame();
  }

  frame++;
  if (!gameOver) requestAnimationFrame(loop);
}

function endGame() {
  if (!gameOver) {
    playRandom(dieSounds);
    gameOver = true;
    ctx.fillStyle = "black";
    ctx.font = "32px Arial";
    ctx.fillText("Game Over", 90, 320);
    ctx.fillText("Click to Restart", 60, 360);
  }
}

loop();
