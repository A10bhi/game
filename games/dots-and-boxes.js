import { connectToRoom, requireSession } from '../js/network.js';

const session = requireSession();
if (session) {
  const { name, roomCode, isHost } = session;
  const N = 4; // 4x4 boxes
  const myRole = isHost ? 'p1' : 'p2';
  const oppRole = isHost ? 'p2' : 'p1';

  document.getElementById('room-code').textContent = roomCode;
  document.getElementById('me-label').textContent = name;

  // ---- state ----
  const hLines = Array.from({ length: N + 1 }, () => Array(N).fill(null));
  const vLines = Array.from({ length: N }, () => Array(N + 1).fill(null));
  const boxes = Array.from({ length: N }, () => Array(N).fill(null));
  const scores = { p1: 0, p2: 0 };
  let currentPlayer = 'p1'; // host always starts
  let gameOver = false;

  // ---- build board DOM ----
  const boardEl = document.getElementById('board');
  const size = 2 * N + 1;
  boardEl.style.gridTemplateColumns = `repeat(${N}, 16px 56px) 16px`;
  boardEl.style.gridTemplateRows = `repeat(${N}, 16px 56px) 16px`;

  const lineEls = {}; // key `${type}-${r}-${c}` -> element
  const boxEls = {};  // key `${r}-${c}` -> element

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const rowEven = r % 2 === 0, colEven = c % 2 === 0;
      if (rowEven && colEven) {
        const dot = document.createElement('div');
        dot.className = 'dot';
        boardEl.appendChild(dot);
      } else if (rowEven && !colEven) {
        const row = r / 2, col = (c - 1) / 2;
        const btn = document.createElement('button');
        btn.className = 'line h-line';
        btn.addEventListener('click', () => tryMove('h', row, col));
        boardEl.appendChild(btn);
        lineEls[`h-${row}-${col}`] = btn;
      } else if (!rowEven && colEven) {
        const row = (r - 1) / 2, col = c / 2;
        const btn = document.createElement('button');
        btn.className = 'line v-line';
        btn.addEventListener('click', () => tryMove('v', row, col));
        boardEl.appendChild(btn);
        lineEls[`v-${row}-${col}`] = btn;
      } else {
        const row = (r - 1) / 2, col = (c - 1) / 2;
        const box = document.createElement('div');
        box.className = 'box';
        boardEl.appendChild(box);
        boxEls[`${row}-${col}`] = box;
      }
    }
  }

  // ---- networking ----
  const overlay = document.getElementById('overlay');
  const overlayText = document.getElementById('overlay-text');
  const room = connectToRoom(roomCode);
  const [sendMove, getMove] = room.makeAction('move');
  const [sendHello, getHello] = room.makeAction('hello');
  const [sendReset, getReset] = room.makeAction('reset');

  let peerHere = false;

  room.onPeerJoin(() => {
    peerHere = true;
    overlay.classList.add('hidden');
    sendHello(name);
  });
  room.onPeerLeave(() => {
    peerHere = false;
    overlayText.textContent = 'Your friend left the room…';
    overlay.classList.remove('hidden');
  });
  getHello((peerName) => {
    document.getElementById('opp-label').textContent = peerName;
  });
  getMove(({ type, r, c }) => applyMove(type, r, c));
  getReset(() => window.location.reload());

  // ---- gameplay ----
  function tryMove(type, r, c) {
    if (gameOver || !peerHere) return;
    if (currentPlayer !== myRole) return;
    const grid = type === 'h' ? hLines : vLines;
    if (grid[r][c]) return;
    applyMove(type, r, c);
    sendMove({ type, r, c });
  }

  function applyMove(type, r, c) {
    const grid = type === 'h' ? hLines : vLines;
    if (grid[r][c]) return; // already drawn, ignore duplicate
    grid[r][c] = currentPlayer;

    const toCheck = type === 'h' ? [[r - 1, c], [r, c]] : [[r, c - 1], [r, c]];
    let completedAny = false;
    toCheck.forEach(([br, bc]) => {
      if (br >= 0 && br < N && bc >= 0 && bc < N && !boxes[br][bc] && boxComplete(br, bc)) {
        boxes[br][bc] = currentPlayer;
        scores[currentPlayer]++;
        completedAny = true;
      }
    });

    if (!completedAny) {
      currentPlayer = currentPlayer === 'p1' ? 'p2' : 'p1';
    }
    render();
    checkGameOver();
  }

  function boxComplete(r, c) {
    return hLines[r][c] && hLines[r + 1][c] && vLines[r][c] && vLines[r][c + 1];
  }

  function render() {
    Object.entries(lineEls).forEach(([key, el]) => {
      const [type, r, c] = key.split('-');
      const drawnBy = (type === 'h' ? hLines : vLines)[r][c];
      el.classList.toggle('filled', !!drawnBy);
      el.classList.remove('p1', 'p2');
      if (drawnBy) el.classList.add(drawnBy);
      el.disabled = !!drawnBy || currentPlayer !== myRole || gameOver;
    });
    Object.entries(boxEls).forEach(([key, el]) => {
      const [r, c] = key.split('-');
      const owner = boxes[r][c];
      el.classList.remove('p1', 'p2');
      if (owner) {
        el.classList.add(owner);
        el.textContent = owner === myRole ? initialsFor(name) : initialsFor('friend');
        el.style.color = '';
      }
    });
    document.getElementById('me-score').textContent = scores[myRole];
    document.getElementById('opp-score').textContent = scores[oppRole];
    const banner = document.getElementById('turn-banner');
    banner.textContent = gameOver ? '' : (currentPlayer === myRole ? 'Your turn' : `${oppLabelText()}'s turn`);
  }

  function oppLabelText() {
    return document.getElementById('opp-label').textContent || 'Friend';
  }
  function initialsFor(label) {
    return (label || '?').trim().charAt(0).toUpperCase();
  }

  function checkGameOver() {
    if (scores.p1 + scores.p2 < N * N) return;
    gameOver = true;
    render();
    const mine = scores[myRole], theirs = scores[oppRole];
    const heading = document.getElementById('result-heading');
    const sub = document.getElementById('result-sub');
    if (mine > theirs) heading.textContent = 'You win! 🎉';
    else if (mine < theirs) heading.textContent = `${oppLabelText()} wins!`;
    else heading.textContent = "It's a tie!";
    sub.textContent = `Final score — you ${mine}, ${oppLabelText()} ${theirs}.`;
    document.getElementById('game-over').classList.remove('hidden');
  }

  document.getElementById('play-again-btn').addEventListener('click', () => {
    sendReset();
    window.location.reload();
  });

  render();
}
