import { generateRoomCode } from './network.js';

const nameInput = document.getElementById('name');
const params = new URLSearchParams(window.location.search);
const invitedRoom = params.get('room');

const createBtn = document.getElementById('create-btn');
const joinBtn = document.getElementById('join-btn');
const joinForm = document.getElementById('join-form');
const codeInput = document.getElementById('code-input');
const joinSubmit = document.getElementById('join-submit');
const errorEl = document.getElementById('error');

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.classList.remove('hidden');
}
function clearError() {
  errorEl.classList.add('hidden');
}

function startSession(roomCode, isHost) {
  const name = nameInput.value.trim();
  if (!name) return showError('Enter your name first.');
  sessionStorage.setItem('tg_name', name);
  sessionStorage.setItem('tg_room', roomCode);
  sessionStorage.setItem('tg_host', isHost ? 'true' : 'false');
  window.location.href = 'lobby.html';
}

createBtn.addEventListener('click', () => {
  clearError();
  startSession(generateRoomCode(), true);
});

joinBtn.addEventListener('click', () => {
  clearError();
  joinForm.classList.remove('hidden');
  codeInput.focus();
});

codeInput.addEventListener('input', () => {
  codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
});

joinSubmit.addEventListener('click', () => {
  clearError();
  const code = codeInput.value.trim();
  if (code.length < 4) return showError('Enter the 5-character code your friend sent you.');
  startSession(code, false);
});

codeInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') joinSubmit.click();
});
nameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') createBtn.click();
});

// Arrived via a shared invite link (?room=CODE) — skip straight to the
// join form with the code already filled in, so there's nothing to
// mistype.
if (invitedRoom) {
  joinForm.classList.remove('hidden');
  codeInput.value = invitedRoom.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
  nameInput.focus();
}
