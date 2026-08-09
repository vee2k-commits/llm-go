const tetris = (() => {
  const cols = 10;
  const rows = 20;
  const blockSize = 28;
  const colors = ['#111827', '#f87171', '#60a5fa', '#34d399', '#fbbf24', '#a78bfa', '#38bdf8', '#fb7185'];
  const pieces = [
    [[1,1,1,1]],
    [[2,2],[2,2]],
    [[0,3,0],[3,3,3]],
    [[0,4,4],[4,4,0]],
    [[5,5,0],[0,5,5]],
    [[6,0,0],[6,6,6]],
    [[0,0,7],[7,7,7]],
  ];

  const container = document.getElementById('game-container');
  container.innerHTML = `<div class="arcade-game-shell"><div class="game-panel"><div class="game-status"><span class="status-pill" id="score">Score: 0</span><span class="status-pill" id="level">Level: 1</span><span class="status-pill" id="lines">Lines: 0</span></div><button class="primary" id="restart">Restart</button></div><canvas id="tetris-canvas" width="${cols*blockSize}" height="${rows*blockSize}"></canvas></div>`;
  const canvas = document.getElementById('tetris-canvas');
  const ctx = canvas.getContext('2d');
  let board, current, score, level, lines, dropInterval, dropCounter, lastTime;

  function reset() {
    board = Array.from({ length: rows }, () => Array(cols).fill(0));
    current = createPiece();
    score = 0; level = 1; lines = 0;
    dropInterval = 700;
    dropCounter = 0;
    lastTime = 0;
    updateStatus();
  }

  function createPiece() {
    const index = Math.floor(Math.random() * pieces.length);
    return { shape: pieces[index], x: 3, y: 0, color: index + 1 };
  }

  function collide() {
    const { shape, x, y } = current;
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (shape[r][c] && (board[y+r] && board[y+r][x+c]) !== 0) return true;
        if (shape[r][c] && (y+r) >= rows) return true;
      }
    }
    return false;
  }

  function merge() {
    current.shape.forEach((row, r) => row.forEach((value, c) => {
      if (value) board[current.y + r][current.x + c] = current.color;
    }));
  }

  function rotate(matrix) {
    return matrix[0].map((_, i) => matrix.map(row => row[row.length - 1 - i]));
  }

  function playerDrop() {
    current.y++;
    if (collide()) {
      current.y--;
      merge();
      resetPiece();
      sweepLines();
      updateStatus();
    }
    dropCounter = 0;
  }

  function resetPiece() {
    current = createPiece();
    if (collide()) {
      reset();
    }
  }

  function sweepLines() {
    let rowCount = 0;
    outer: for (let y = rows - 1; y >= 0; y--) {
      for (let x = 0; x < cols; x++) {
        if (!board[y][x]) continue outer;
      }
      const row = board.splice(y, 1)[0].fill(0);
      board.unshift(row);
      y++;
      rowCount++;
    }
    if (rowCount > 0) {
      lines += rowCount;
      score += rowCount * 100 * level;
      level = Math.min(10, Math.floor(lines / 10) + 1);
      dropInterval = 700 - (level - 1) * 55;
    }
  }

  function drawMatrix(matrix, offset) {
    matrix.forEach((row, y) => {
      row.forEach((value, x) => {
        if (!value) return;
        ctx.fillStyle = colors[value];
        ctx.fillRect((x + offset.x) * blockSize, (y + offset.y) * blockSize, blockSize - 2, blockSize - 2);
      });
    });
  }

  function drawBoard() {
    ctx.fillStyle = '#090c1d';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    board.forEach((row, y) => row.forEach((value, x) => {
      if (value) {
        ctx.fillStyle = colors[value];
        ctx.fillRect(x * blockSize, y * blockSize, blockSize - 2, blockSize - 2);
      }
    }));
    drawMatrix(current.shape, { x: current.x, y: current.y });
  }

  function updateStatus() {
    document.getElementById('score').textContent = `Score: ${score}`;
    document.getElementById('level').textContent = `Level: ${level}`;
    document.getElementById('lines').textContent = `Lines: ${lines}`;
  }

  function update(time = 0) {
    const deltaTime = time - lastTime;
    lastTime = time;
    dropCounter += deltaTime;
    if (dropCounter > dropInterval) {
      playerDrop();
    }
    drawBoard();
    requestAnimationFrame(update);
  }

  document.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft') { current.x--; if (collide()) current.x++; }
    if (event.key === 'ArrowRight') { current.x++; if (collide()) current.x--; }
    if (event.key === 'ArrowDown') { playerDrop(); }
    if (event.key === 'ArrowUp') {
      current.shape = rotate(current.shape);
      if (collide()) current.shape = rotate(rotate(rotate(current.shape)));
    }
    updateStatus();
  });

  document.getElementById('restart').addEventListener('click', reset);

  reset();
  update();
})();
