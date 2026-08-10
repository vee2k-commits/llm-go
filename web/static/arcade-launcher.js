async function startArcade() {
  try {
    createLoadingState();
    const response = await fetch('/games');
    const games = await response.json();
    const game = games.find(g => g.id === gameId);
    if (!game) {
      setGameInfo('Game not found', 'Return to the arcade list to pick a valid game.');
      throw new Error('Game not found');
    }
    setGameInfo(game.data.name, game.data.description);
    await loadGameScript(`${game.id}.bundle`);
  } catch (error) {
    console.error(error);
    const container = document.getElementById('game-container');
    if (container) {
      container.innerHTML = '<div class="loading-screen error">Unable to load the game. Please try again.</div>';
    }
  }
}

startArcade();
