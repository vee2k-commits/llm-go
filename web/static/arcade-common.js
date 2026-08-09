const gameId = location.pathname.split('/').filter(Boolean).pop();
function setGameInfo(title, description) {
  const titleEl = document.getElementById('game-title');
  const descEl = document.getElementById('game-description');
  if (titleEl) titleEl.textContent = title;
  if (descEl) descEl.textContent = description;
}
function createLoadingState() {
  const container = document.getElementById('game-container');
  if (container) {
    container.innerHTML = '<div class="loading-screen">Loading game…</div>';
  }
}
function loadGameScript(name) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `/static/${name}.js`;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${name}.js`));
    document.body.appendChild(script);
  });
}
