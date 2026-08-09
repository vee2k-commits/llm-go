const racer = (() => {
  const width = 960;
  const height = 540;
  const trackWidth = 480;
  const roadX = (width - trackWidth) / 2;
  const container = document.getElementById('game-container');
  container.innerHTML = `<div class="arcade-game-shell"><div class="game-panel"><div class="game-status"><span class="status-pill" id="speed">Speed: 0</span><span class="status-pill" id="distance">Distance: 0</span></div><button class="primary" id="restart">Restart</button></div><canvas id="racer-canvas" width="${width}" height="${height}"></canvas></div>`;
  const canvas = document.getElementById('racer-canvas');
  const ctx = canvas.getContext('2d');
  const player = { x: width / 2, y: height - 120, width: 40, height: 70, speed: 0 };
  let avatarImage = null;
  let useViolet = false;
  const obstacles = [];
  let distance = 0;
  let lane = 0;

  function spawnObstacle() {
    const laneIndex = Math.floor(Math.random() * 3) - 1;
    const x = width / 2 + laneIndex * 140;
    obstacles.push({ x, y: -120, width: 48, height: 90, speed: 4 + distance * 0.01 });
  }

  function drawRoad() {
    ctx.fillStyle = '#07111f';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(roadX, 0, trackWidth, height);
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 2;
    ctx.setLineDash([24, 16]);
    ctx.beginPath();
    ctx.moveTo(width/2, 0);
    ctx.lineTo(width/2, height);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawPlayer() {
    if (avatarImage && useViolet) {
      const w = player.width*1.6, h = player.height*1.6;
      ctx.drawImage(avatarImage, player.x - w/2, player.y - (h - player.height), w, h);
    } else {
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(player.x - player.width/2, player.y, player.width, player.height);
      ctx.fillStyle = '#111827';
      ctx.fillRect(player.x - 14, player.y + 12, 28, 42);
    }
  }

  function drawObstacles() {
    obstacles.forEach(o => {
      ctx.fillStyle = '#f87171';
      ctx.fillRect(o.x - o.width/2, o.y, o.width, o.height);
    });
  }

  function updateObstacles() {
    obstacles.forEach(o => o.y += o.speed);
    while (obstacles.length && obstacles[0].y > height + 100) obstacles.shift();
    if (Math.random() < 0.03) spawnObstacle();
  }

  function detectCollision() {
    return obstacles.some(o => {
      const px = player.x - player.width/2;
      return px < o.x + o.width/2 && px + player.width > o.x - o.width/2 && player.y < o.y + o.height && player.y + player.height > o.y;
    });
  }

  function updateStatus() {
    document.getElementById('speed').textContent = `Speed: ${Math.round(player.speed)}`;
    document.getElementById('distance').textContent = `Distance: ${Math.round(distance)}`;
  }

  function reset() {
    player.speed = 12;
    distance = 0;
    obstacles.length = 0;
    spawnObstacle();
    updateStatus();
  }

  async function tryLoadViolet() {
    try {
      const meta = await fetch('/static/assets/characters/violet.json').then(r => r.ok ? r.json() : null);
      const imgPath = meta && meta.imagePath ? meta.imagePath : '/static/assets/characters/violet.png';
      const res = await fetch(imgPath);
      if (!res.ok) return;
      const blob = await res.blob();
      const img = new Image();
      img.src = URL.createObjectURL(blob);
      await new Promise(r => { img.onload = r; img.onerror = r; });
      avatarImage = img;
      // try server selection to override
      try {
        const sel = await fetch('/api/characters/selected').then(r => r.ok ? r.json() : {});
        if (sel && sel.id) {
          const meta2 = await fetch(`/static/assets/characters/${sel.id}/metadata.json`).then(r => r.ok ? r.json() : null).catch(()=>null);
          const path = meta2 && (meta2.sheet || meta2.imagePath) ? (meta2.sheet || meta2.imagePath) : `/static/assets/characters/${sel.id}/solo.png`;
          const r2 = await fetch(path).catch(()=>null);
          if (r2 && r2.ok) {
            const b2 = await r2.blob();
            const img2 = new Image(); img2.src = URL.createObjectURL(b2);
            await new Promise(r=>{img2.onload=r; img2.onerror=r});
            avatarImage = img2; useViolet = true;
          }
        }
      } catch(e) {}
      // add simple UI to toggle Violet as avatar
      const btn = document.createElement('button');
      btn.className = 'primary';
      btn.style.marginLeft = '12px';
      btn.textContent = 'Use Violet';
      btn.addEventListener('click', () => { useViolet = !useViolet; btn.textContent = useViolet ? 'Using Violet' : 'Use Violet'; });
      document.querySelector('.game-panel').appendChild(btn);
    } catch (e) {
      // ignore
    }
  }

  function update() {
    player.speed = Math.min(24, player.speed + 0.003);
    distance += player.speed * 0.02;
    updateObstacles();
    if (detectCollision()) { try { if (window.SFX) window.SFX.playCollision(); } catch(e){}; reset(); }
    drawRoad();
    drawPlayer();
    drawObstacles();
    updateStatus();
    requestAnimationFrame(update);
  }

  document.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft') player.x = Math.max(roadX + 30, player.x - 140);
    if (event.key === 'ArrowRight') player.x = Math.min(roadX + trackWidth - 30, player.x + 140);
  });

  document.getElementById('restart').addEventListener('click', reset);
  reset();
  tryLoadViolet().then(() => update());
})();
