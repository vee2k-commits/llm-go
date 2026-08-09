async function loadGames() {
  const res = await fetch('/games');
  const games = await res.json();
  const list = document.getElementById('game-list');
  list.innerHTML = games.map(game => `
    <article class="game-card">
      <h2>${game.data.name}</h2>
      <p>${game.data.description}</p>
      <div class="game-tags">
        ${((game.data.tags || [])).map(tag => `<span class="game-tag">${tag}</span>`).join('')}
      </div>
      <a href="/arcade/${game.id}">Play</a>
    </article>
  `).join('');
}

loadGames().catch(error => {
  console.error(error);
  const list = document.getElementById('game-list');
  list.innerHTML = '<p class="error">Unable to load games right now.</p>';
});
