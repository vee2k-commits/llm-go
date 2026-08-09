(function(){
  const W = 960, H = 540;
  const canvasHTML = `<div class="arcade-game-shell"><div class="game-panel"><div class="game-status"><span class="status-pill" id="score">Score: 0</span></div></div><canvas id="sidescroller-canvas" width="${W}" height="${H}"></canvas></div>`;
  const container = document.getElementById('game-container');
  container.innerHTML = canvasHTML;
  const canvas = document.getElementById('sidescroller-canvas');
  const ctx = canvas.getContext('2d');

  // simple world
  const gravity = 0.6;
  const floorY = H - 80;
  const player = { x: 120, y: floorY - 64, vx: 0, vy: 0, w: 48, h: 64, onGround: false };
  const platforms = [ {x:0,y:floorY+40,w:2000,h:400} ];
  let camX = 0;
  let score = 0;
  let keys = {};
  let characterImage = null;
  let spriteSheet = null; // {img, cols, rows, frameW, frameH}
  let anim = { frame: 0, elapsed: 0, fps: 8 };

  async function tryLoadCharacter() {
    try {
      const meta = await fetch('/static/assets/characters/violet.json').then(r => r.ok ? r.json() : null);
      const imgPath = meta && meta.imagePath ? meta.imagePath : '/static/assets/characters/violet.png';
      const res = await fetch(imgPath, { method: 'GET' });
      if (res.ok) {
          const blob = await res.blob();
          const img = new Image();
          img.src = URL.createObjectURL(blob);
          await new Promise(r => { img.onload = r; img.onerror = r; });
          // set as simple image initially
          characterImage = img;
        }
        // Try sprite metadata (sheet) next
        const sheetMetaPath = '/static/assets/characters/violet/metadata.json';
        try {
          const sheetMeta = await fetch(sheetMetaPath).then(r => r.ok ? r.json() : null);
          if (sheetMeta && sheetMeta.sheet) {
            const sheetRes = await fetch(sheetMeta.sheet);
            if (sheetRes.ok) {
              const blob2 = await sheetRes.blob();
              const simg = new Image();
              simg.src = URL.createObjectURL(blob2);
              await new Promise(r => { simg.onload = r; simg.onerror = r; });
              spriteSheet = { img: simg, cols: sheetMeta.cols || sheetMeta.columns || 4, rows: sheetMeta.rows || 1, frameW: sheetMeta.frameWidth || sheetMeta.frameW || 48, frameH: sheetMeta.frameHeight || sheetMeta.frameH || 64 };
            }
          }
        } catch (e) {
          // ignore
        }
      }
    } catch (e) {
      // ignore
    }
  }

  function update() {
    // input
    if (keys.ArrowLeft) player.vx = Math.max(-6, player.vx - 0.6);
    if (keys.ArrowRight) player.vx = Math.min(6, player.vx + 0.6);
    if (!keys.ArrowLeft && !keys.ArrowRight) player.vx *= 0.9;

    player.vy += gravity;
    player.x += player.vx;
    player.y += player.vy;

    // ground collision
    if (player.y + player.h > floorY) {
      player.y = floorY - player.h;
      player.vy = 0;
      player.onGround = true;
    } else {
      player.onGround = false;
    }

    // camera follows
    camX = Math.max(0, player.x - 200);
    score = Math.floor(player.x / 10);
  }

  function draw() {
    ctx.clearRect(0,0,W,H);
    // sky
    const g = ctx.createLinearGradient(0,0,0,H);
    g.addColorStop(0,'#7dd3fc'); g.addColorStop(1,'#7c3aed');
    ctx.fillStyle = g; ctx.fillRect(0,0,W,H);

    ctx.save();
    ctx.translate(-camX,0);

    // ground
    ctx.fillStyle = '#0f172a'; ctx.fillRect(0,floorY,W*4,200);

    // platforms
    ctx.fillStyle = '#334155';
    platforms.forEach(p => ctx.fillRect(p.x, p.y, p.w, p.h));

    // player
    const px = player.x, py = player.y;
    if (spriteSheet) {
      // animate
      const s = spriteSheet;
      const total = s.cols * s.rows;
      anim.elapsed += 1/60;
      const frameDuration = 1 / anim.fps;
      if (anim.elapsed >= frameDuration) {
        anim.frame = (anim.frame + 1) % total;
        anim.elapsed = 0;
      }
      const fx = anim.frame % s.cols;
      const fy = Math.floor(anim.frame / s.cols);
      const sw = s.frameW, sh = s.frameH;
      const dw = player.w*1.6, dh = player.h*1.6;
      ctx.drawImage(s.img, fx*sw, fy*sh, sw, sh, px - dw/2, py - (dh - player.h), dw, dh);
    } else if (characterImage) {
      ctx.drawImage(characterImage, px-12, py-32, player.w*1.4, player.h*1.4);
    } else {
      ctx.fillStyle = '#fde68a'; ctx.fillRect(px, py, player.w, player.h);
      ctx.fillStyle = '#1f2937'; ctx.fillRect(px+8, py+16, player.w-16, player.h-24);
    }

    ctx.restore();

    document.getElementById('score').textContent = `Score: ${score}`;
  }

  function loop() { update(); draw(); requestAnimationFrame(loop); }

  document.addEventListener('keydown', e => {
    keys[e.key] = true;
    if (e.key === ' ' || e.key === 'ArrowUp') {
      if (player.onGround) { player.vy = -12; player.onGround = false; }
    }
  });
  document.addEventListener('keyup', e => { keys[e.key] = false; });

  tryLoadCharacter().then(()=>{ loop(); });
})();
