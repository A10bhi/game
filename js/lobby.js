import { connectToRoom, requireSession, buildInviteLink } from './network.js';

const session = requireSession();
if (session) {
  const { name, roomCode } = session;

  document.getElementById('room-code').textContent = roomCode;

  const statusEl = document.getElementById('status');
  const statusText = document.getElementById('status-text');
  const troubleshootEl = document.getElementById('troubleshoot');
  const gameButtonsEl = document.getElementById('game-buttons');
  const tiles = [...gameButtonsEl.querySelectorAll('.game-tile')];
  setGameButtonsEnabled(false);

  const room = connectToRoom(roomCode);
  const [sendGameChoice, getGameChoice] = room.makeAction('game');

  let navigating = false;

  // If nobody's joined after a while, surface troubleshooting tips instead
  // of leaving people staring at a spinner with no idea what to check.
  const troubleshootTimer = setTimeout(() => {
    troubleshootEl.classList.remove('hidden');
  }, 15000);

  room.onPeerJoin(() => {
    clearTimeout(troubleshootTimer);
    troubleshootEl.classList.add('hidden');
    statusEl.className = 'status connected';
    statusText.textContent = "Friend's here! Pick a game 🎉";
    setGameButtonsEnabled(true);
  });

  room.onPeerLeave(() => {
    statusEl.className = 'status waiting';
    statusText.textContent = 'Your friend left the room.';
    setGameButtonsEnabled(false);
  });

  const copyLinkBtn = document.getElementById('copy-link-btn');
  copyLinkBtn.addEventListener('click', async () => {
    const link = buildInviteLink(roomCode);
    try {
      await navigator.clipboard.writeText(link);
      copyLinkBtn.textContent = '✅ Copied!';
    } catch (e) {
      // Clipboard API can be blocked in some contexts — fall back to a
      // prompt so the link is still copyable by hand.
      window.prompt('Copy this link and send it to your friend:', link);
    }
    setTimeout(() => (copyLinkBtn.textContent = '🔗 Copy invite link'), 2000);
  });

  getGameChoice((game) => goToGame(game));

  tiles.forEach((btn) => {
    btn.addEventListener('click', () => {
      const game = btn.dataset.game;
      sendGameChoice(game);
      goToGame(game);
    });
  });

  document.getElementById('leave-btn').addEventListener('click', () => {
    room.leave();
    sessionStorage.clear();
    window.location.href = 'index.html';
  });

  function setGameButtonsEnabled(enabled) {
    tiles.forEach((btn) => (btn.disabled = !enabled));
  }

  function goToGame(game) {
    if (navigating) return;
    navigating = true;
    const map = {
      dots: 'games/dots-and-boxes.html',
      match: 'games/match-game.html',
      race: 'games/race.html',
    };
    window.location.href = map[game] || 'index.html';
  }
}
