const frogger = (() => {
  const width = 860;
  const height = 540;
  const laneHeight = 54;
  const frogSize = 24;
  const container = document.getElementById('game-container');
  container.innerHTML = `<div class="arcade-game-shell"><div class="game-panel"><div class="game-status"><span class="status-pill" id="lives">Lives: 3</span><span class="status-pill" id="round">Round: 1</span></div><button class="primary" id="restart">Restart</button></div><canvas id="frogger-canvas" width="${width}" height="${height}"></canvas></div>`;
  const canvas = document.getElementById('frogger-canvas');
  const ctx = canvas.getContext('2d');
  let frogX = width / 2;
  let frogY = height - frogSize - 16;
  let lives = 3;
  let round = 1;
  let logs = [];
  let cars = [];
  let goalReached = false;

  function initTraffic() {
    cars = Array.from({ length: 4 }, (_, i) => ({ x: i % 2 ? width - 100 : 80, y: height - 2*laneHeight - 22 - (i*laneHeight), speed: 3 + i, direction: i % 2 ? 1 : -1 }));
    logs = Array.from({ length: 5 }, (_, i) => ({ x: i % 2 ? width - 180 : 20, y: height - 6*laneHeight + 10 + (i*laneHeight), speed: 2 + (i*0.5), direction: i % 2 ? -1 : 1 }));
  }

  function drawScene() {
    ctx.fillStyle = '#081228';
    ctx.fillRect(0, 0, width, height);

    const zones = [ '#162963', '#123e70', '#1b2955', '#123e70', '#162963', '#1f2547', '#111720' ];
    zones.forEach((color, idx) => {
      ctx.fillStyle = color;
      ctx.fillRect(0, idx * laneHeight, width, laneHeight);
    });
    ctx.fillStyle = '#1a824f';
    ctx.fillRect(0, 0, width, laneHeight);
    ctx.fillStyle = '#57bb8a';
    for (let i = 1; i <= 5; i++) {
      ctx.fillRect(i * 140 - 18, 8, 36, 16);
    }

    cars.forEach(car => {
      ctx.fillStyle = '#fb7185';
      ctx.fillRect(car.x, car.y, 96, 28);
      ctx.fillStyle = '#111827';
      ctx.fillRect(car.x + 12, car.y + 8, 20, 12);
      ctx.fillRect(car.x + 64, car.y + 8, 20, 12);
    });

    logs.forEach(log => {
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(log.x, log.y, 140, 28);
      ctx.fillStyle = '#5f3dc4';
      ctx.fillRect(log.x + 10, log.y + 6, 120, 12);
    });

    ctx.fillStyle = '#7dd3fc';
    ctx.fillRect(0, height - laneHeight, width, laneHeight);
    ctx.fillStyle = '#dbeafe';
    ctx.fillRect(0, height - 2*laneHeight, width, laneHeight);

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(frogX, frogY, frogSize, frogSize);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(frogX + 6, frogY + 8, 12, 8);
  }

  function updateEntities() {
    cars.forEach(car => {
      car.x += car.speed * car.direction;
      if (car.x > width) car.x = -110;
      if (car.x < -110) car.x = width;
    });
    logs.forEach(log => {
      log.x += log.speed * log.direction;
      if (log.x > width) log.x = -160;
      if (log.x < -160) log.x = width;
    });
  }

  function checkCollisions() {
    for (const car of cars) {
      if (frogY > height - 4*laneHeight && frogY < height - 2*laneHeight && frogX + frogSize > car.x && frogX < car.x + 96) {
        loseLife();
      }
    }
    if (frogY < height - 5*laneHeight && frogY > laneHeight) {
      const onLog = logs.some(log => frogX + frogSize > log.x && frogX < log.x + 140 && frogY > log.y - 4 && frogY < log.y + 28);
      if (!onLog) {
        loseLife();
      }
    }
    if (frogY <= laneHeight - 4) {
      scoreRound();
    }
  }

  function loseLife() {
    lives -= 1;
    resetFrog();
    updateStatus();
    if (lives <= 0) resetGame();
  }

  function scoreRound() {
    round += 1;
    resetFrog();
    if (round > 5) round = 1;
    updateStatus();
  }

  function resetFrog() {
    frogX = width / 2;
    frogY = height - frogSize - 16;
  }

  function resetGame() {
    lives = 3;
    round = 1;
    resetFrog();
    updateStatus();
  }

  function updateStatus() {
    document.getElementById('lives').textContent = `Lives: ${lives}`;
    document.getElementById('round').textContent = `Round: ${round}`;
  }

  function update() {
    drawScene();
    updateEntities();
    checkCollisions();
    requestAnimationFrame(update);
  }

  document.addEventListener('keydown', event => {
    const step = 48;
    if (event.key === 'ArrowLeft') frogX = Math.max(0, frogX - step);
    if (event.key === 'ArrowRight') frogX = Math.min(width - frogSize, frogX + step);
    if (event.key === 'ArrowUp') frogY = Math.max(0, frogY - step);
    if (event.key === 'ArrowDown') frogY = Math.min(height - frogSize, frogY + step);
  });
  document.getElementById('restart').addEventListener('click', resetGame);
  initTraffic();
  updateStatus();
  update();
})();
