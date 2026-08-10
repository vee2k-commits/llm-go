const dressup = (() => {
  const container = document.getElementById('game-container');
  container.innerHTML = `
  <div class="arcade-game-shell">
    <div class="game-panel">
      <div class="game-status"><span class="status-pill" id="style-status">Create your perfect outfit</span></div>
    </div>
    <div class="game-panel" id="dressup-shell">
      <div class="doll-stage">
        <div id="doll-body"></div>
      </div>
      <aside class="outfit-panel">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <h2>Outfits</h2>
          <div>
            <label for="character-upload" class="primary" style="cursor:pointer;padding:8px 12px;border-radius:8px;">Import Character</label>
            <input id="character-upload" type="file" accept="image/*" style="display:none" />
          </div>
        </div>
        <div style="margin-top:8px;color:rgba(255,255,255,0.8);font-size:0.9rem">You can import the Violet character image or place it at <code>/web/static/assets/characters/violet.png</code> on the server.</div>
        <div class="outfit-grid" id="outfit-grid"></div>
      </aside>
    </div>
  </div>
  `;

  const outfits = [
    { id: 'casual', label: 'Casual', color: '#f472b6', shape: 'rounded' },
    { id: 'adventure', label: 'Adventure', color: '#10b981', shape: 'layered' },
    { id: 'party', label: 'Party', color: '#f59e0b', shape: 'sparkle' },
    { id: 'retro', label: 'Retro', color: '#6366f1', shape: 'graphic' }
  ];

  const outfitGrid = document.getElementById('outfit-grid');
  const dollBody = document.getElementById('doll-body');
  const uploadInput = document.getElementById('character-upload');

  async function tryLoadDefaultCharacter() {
    // Try the companion metadata file first to find the image path
    try {
      const meta = await fetch('/static/assets/characters/violet.json').then(r => r.ok ? r.json() : null);
      const imgPath = meta && meta.imagePath ? meta.imagePath : '/static/assets/characters/violet.png';
      const res = await fetch(imgPath, { method: 'HEAD' });
      if (res.ok) {
        setDollImage(imgPath);
        return true;
      }
    } catch (e) {
      // ignore
    }
    return false;
  }

  function setDollImage(src) {
    dollBody.style.backgroundImage = `url(${src})`;
    dollBody.style.backgroundSize = 'contain';
    dollBody.style.backgroundRepeat = 'no-repeat';
    dollBody.style.backgroundPosition = 'center bottom';
  }

  function renderOutfits() {
    outfitGrid.innerHTML = outfits.map(outfit => `
      <button class="outfit-card" data-id="${outfit.id}" style="border-color: ${outfit.color};">
        <span>${outfit.label}</span>
      </button>
    `).join('');
  }

  function setOutfit(id) {
    const outfit = outfits.find(o => o.id === id);
    if (!outfit) return;
    // If a character image is used, tint overlay instead of solid background
    if (!dollBody.style.backgroundImage) {
      dollBody.style.background = outfit.color;
      dollBody.style.borderRadius = outfit.shape === 'rounded' ? '40%' : outfit.shape === 'layered' ? '16%' : '8%';
    } else {
      // overlay color as CSS variable for subtle vignette
      dollBody.style.boxShadow = `inset 0 0 0 2000px ${hexToRGBA(outfit.color, 0.06)}`;
    }
    document.getElementById('style-status').textContent = `Wearing ${outfit.label}`;
  }

  function hexToRGBA(hex, alpha) {
    const h = hex.replace('#','');
    const bigint = parseInt(h,16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `rgba(${r},${g},${b},${alpha})`;
  }

  outfitGrid.addEventListener('click', event => {
    const button = event.target.closest('button[data-id]');
    if (!button) return;
    setOutfit(button.dataset.id);
  });

  uploadInput.addEventListener('change', event => {
    const f = event.target.files && event.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = e => {
      setDollImage(e.target.result);
      // Persist to localStorage so the imported image stays for this user session
      try { localStorage.setItem('dressup.violet.dataurl', e.target.result); } catch (e) {}
    };
    reader.readAsDataURL(f);
  });

  // allow drag & drop into doll-stage
  const dollStage = document.querySelector('.doll-stage');
  dollStage.addEventListener('dragover', e => e.preventDefault());
  dollStage.addEventListener('drop', e => {
    e.preventDefault();
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = ev => {
      setDollImage(ev.target.result);
      try { localStorage.setItem('dressup.violet.dataurl', ev.target.result); } catch (e) {}
    };
    reader.readAsDataURL(f);
  });

  // load any persisted imported image first
  const persisted = (function(){ try { return localStorage.getItem('dressup.violet.dataurl'); } catch(e){ return null; } })();
  if (persisted) {
    setDollImage(persisted);
  } else {
    // try server-side asset path
    tryLoadDefaultCharacter();
  }

  renderOutfits();
  setOutfit('casual');
})();
