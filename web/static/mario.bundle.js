const mario = (() => {
  const width = 920;
  const height = 520;
  const gravity = 0.6;
  const moveSpeed = 4;
  const jumpVelocity = -14;
  const container = document.getElementById('game-container');
  container.innerHTML = `<div class="arcade-game-shell"><div class="game-panel"><div class="game-status"><span class="status-pill" id="coins">Coins: 0</span><span class="status-pill" id="stage">Stage: 1</span></div><button class="primary" id="restart">Restart</button></div><canvas id="mario-canvas" width="${width}" height="${height}"></canvas></div>`;
  const canvas = document.getElementById('mario-canvas');
  const ctx = canvas.getContext('2d');

  let player = { x: 100, y: 360, vx: 0, vy: 0, width: 32, height: 48, onGround: false, coins: 0, stage: 1 };
  const keys = { left: false, right: false, up: false };
  const platforms = [
    { x: 0, y: 420, width: width, height: 100 },
    { x: 260, y: 340, width: 120, height: 20 },
    { x: 500, y: 280, width: 160, height: 20 },
    { x: 760, y: 220, width: 120, height: 20 }
  ];
  const coins = [
    { x: 340, y: 300, collected: false },
    { x: 620, y: 240, collected: false },
    { x: 820, y: 180, collected: false }
  ];

  function drawBackground() {
    ctx.fillStyle = '#7dd3fc';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#bee3f8';
    ctx.fillRect(0, height - 120, width, 120);
    ctx.fillStyle = '#a7f3d0';
    ctx.fillRect(0, height - 120, width, 20);
  }

  function drawPlatforms() {
    ctx.fillStyle = '#333';
    platforms.forEach(p => {
      ctx.fillRect(p.x, p.y, p.width, p.height);
      ctx.strokeStyle = '#111';
      ctx.strokeRect(p.x, p.y, p.width, p.height);
    });
  }

  function drawCoins() {
    coins.forEach(coin => {
      if (!coin.collected) {
        ctx.fillStyle = '#facc15';
        ctx.beginPath();
        ctx.arc(coin.x, coin.y, 10, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }

  function drawPlayer() {
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(player.x, player.y, player.width, player.height);
    ctx.fillStyle = '#111827';
    ctx.fillRect(player.x + 8, player.y + 8, 16, 12);
  }

  function collidePlatform(px, py, pw, ph) {
    return platforms.find(p => px < p.x + p.width && px + pw > p.x && py < p.y + p.height && py + ph > p.y);
  }

  function collectCoins() {
    coins.forEach(coin => {
      if (!coin.collected && player.x + player.width > coin.x - 10 && player.x < coin.x + 10 && player.y + player.height > coin.y - 10 && player.y < coin.y + 10) {
        coin.collected = true;
        player.coins += 1;
        updateStatus();
      }
    });
  }

  function updateStatus() {
    document.getElementById('coins').textContent = `Coins: ${player.coins}`;
    document.getElementById('stage').textContent = `Stage: ${player.stage}`;
  }

  function reset() {
    player = { x: 100, y: 360, vx: 0, vy: 0, width: 32, height: 48, onGround: false, coins: 0, stage: 1 };
    coins.forEach(c => c.collected = false);
    updateStatus();
  }

  function update() {
    if (keys.right) player.vx = moveSpeed;
    else if (keys.left) player.vx = -moveSpeed;
    else player.vx = 0;

    player.vy += gravity;
    player.x += player.vx;
    player.y += player.vy;

    if (player.x < 0) player.x = 0;
    if (player.x + player.width > width) player.x = width - player.width;

    const platform = collidePlatform(player.x, player.y + player.vy, player.width, player.height);
    if (platform && player.vy >= 0) {
      player.y = platform.y - player.height;
      player.vy = 0;
      player.onGround = true;
    } else {
      player.onGround = false;
    }

    if (player.y > height) reset();

    collectCoins();
    drawBackground();
    drawPlatforms();
    drawCoins();
    drawPlayer();
    requestAnimationFrame(update);
  }

  document.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft') keys.left = true;
    if (event.key === 'ArrowRight') keys.right = true;
    if (event.key === 'ArrowUp' && player.onGround) { player.vy = jumpVelocity; player.onGround = false; }
  });

  document.addEventListener('keyup', event => {
    if (event.key === 'ArrowLeft') keys.left = false;
    if (event.key === 'ArrowRight') keys.right = false;
  });

  document.getElementById('restart').addEventListener('click', reset);
  reset();
  update();
})();
