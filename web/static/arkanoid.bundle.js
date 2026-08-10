const arkanoid = (() => {
  const width = 920;
  const height = 540;
  const paddleWidth = 140;
  const paddleHeight = 18;
  const ballRadius = 10;
  const rows = 5;
  const cols = 10;
  const brickWidth = 80;
  const brickHeight = 26;
  const brickPadding = 10;
  const offsetTop = 50;
  const offsetLeft = 40;

  const container = document.getElementById('game-container');
  container.innerHTML = `<div class="arcade-game-shell"><div class="game-panel"><div class="game-status"><span class="status-pill" id="score">Score: 0</span><span class="status-pill" id="lives">Lives: 3</span></div><button class="primary" id="restart">Restart</button></div><canvas id="arkanoid-canvas" width="${width}" height="${height}"></canvas></div>`;
  const canvas = document.getElementById('arkanoid-canvas');
  const ctx = canvas.getContext('2d');

  let paddleX = (width - paddleWidth) / 2;
  let ballX = width / 2;
  let ballY = height - 40;
  let dx = 5;
  let dy = -5;
  let score = 0;
  let lives = 3;
  let bricks = [];
  let leftPressed = false;
  let rightPressed = false;

  function initBricks() {
    bricks = Array.from({ length: cols }, (_, i) => Array.from({ length: rows }, (_, j) => ({ x: 0, y: 0, status: 1, hits: j + 1 })));
  }

  function drawBricks() {
    bricks.forEach((col, i) => col.forEach((brick, j) => {
      if (brick.status) {
        const x = i * (brickWidth + brickPadding) + offsetLeft;
        const y = j * (brickHeight + brickPadding) + offsetTop;
        brick.x = x; brick.y = y;
        ctx.fillStyle = `hsl(${36 * j + 20}, 90%, 64%)`;
        ctx.fillRect(x, y, brickWidth, brickHeight);
        ctx.strokeStyle = '#0f172a';
        ctx.strokeRect(x, y, brickWidth, brickHeight);
      }
    }));
  }

  function drawPaddle() {
    ctx.fillStyle = '#a78bfa';
    ctx.fillRect(paddleX, height - paddleHeight - 10, paddleWidth, paddleHeight);
  }

  function drawBall() {
    ctx.beginPath();
    ctx.arc(ballX, ballY, ballRadius, 0, Math.PI*2);
    ctx.fillStyle = '#fb7185';
    ctx.fill();
    ctx.closePath();
  }

  function collisionDetection() {
    bricks.forEach(col => col.forEach(brick => {
      if (brick.status) {
        if (ballX > brick.x && ballX < brick.x + brickWidth && ballY > brick.y && ballY < brick.y + brickHeight) {
          dy = -dy;
          brick.status = 0;
          score += 20;
          updateStatus();
        }
      }
    }));
  }

  function draw() {
    ctx.fillStyle = '#070b18';
    ctx.fillRect(0, 0, width, height);
    drawBricks();
    drawPaddle();
    drawBall();
  }

  function update() {
    draw();
    collisionDetection();

    if (ballX + dx > width - ballRadius || ballX + dx < ballRadius) dx = -dx;
    if (ballY + dy < ballRadius) dy = -dy;
    else if (ballY + dy > height - ballRadius - paddleHeight - 10) {
      if (ballX > paddleX && ballX < paddleX + paddleWidth) {
        dy = -dy;
      } else {
        lives -= 1;
        updateStatus();
        if (!lives) {
          reset();
          return;
        }
        ballX = width / 2;
        ballY = height - 40;
        dx = 5;
        dy = -5;
        paddleX = (width - paddleWidth) / 2;
      }
    }

    if (leftPressed && paddleX > 0) paddleX -= 8;
    if (rightPressed && paddleX < width - paddleWidth) paddleX += 8;

    ballX += dx;
    ballY += dy;
    requestAnimationFrame(update);
  }

  function updateStatus() {
    document.getElementById('score').textContent = `Score: ${score}`;
    document.getElementById('lives').textContent = `Lives: ${lives}`;
  }

  function reset() {
    paddleX = (width - paddleWidth) / 2;
    ballX = width / 2;
    ballY = height - 40;
    dx = 5;
    dy = -5;
    score = 0;
    lives = 3;
    initBricks();
    updateStatus();
  }

  document.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft') leftPressed = true;
    if (event.key === 'ArrowRight') rightPressed = true;
  });
  document.addEventListener('keyup', event => {
    if (event.key === 'ArrowLeft') leftPressed = false;
    if (event.key === 'ArrowRight') rightPressed = false;
  });

  document.getElementById('restart').addEventListener('click', reset);
  reset();
  update();
})();
