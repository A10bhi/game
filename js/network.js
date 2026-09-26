// network.js
// Connects to the small Python relay server (see /server) over a plain
// WebSocket, instead of a peer-to-peer WebRTC connection. A server both of
// you can always reach beats trying to punch a direct connection through
// two unrelated home/mobile networks — it's what actually fixed the
// "can't connect" issue.
//
// ↓↓↓ REQUIRED: set this to your deployed server's URL after following
// /server/README.md. It must start with wss:// (secure WebSocket).
const SERVER_URL = 'wss://YOUR-SERVICE-NAME.onrender.com';

let socket = null;
let room = null;

function makeRoom(roomCode) {
  const name = sessionStorage.getItem('tg_name') || 'Friend';
  const peerJoinCbs = [];
  const peerLeaveCbs = [];
  const actionHandlers = {};

  if (SERVER_URL.includes('YOUR-SERVICE-NAME')) {
    console.error(
      'Twogether: SERVER_URL in js/network.js is still the placeholder. ' +
      'Deploy /server (see /server/README.md) and paste your real URL in there.'
    );
  }

  socket = new WebSocket(SERVER_URL);

  socket.addEventListener('open', () => {
    socket.send(JSON.stringify({ type: 'join', room: roomCode, name }));
  });

  socket.addEventListener('message', (event) => {
    let msg;
    try { msg = JSON.parse(event.data); } catch (e) { return; }
    if (msg.type === 'peer-joined') {
      peerJoinCbs.forEach((cb) => cb(msg.name));
    } else if (msg.type === 'peer-left') {
      peerLeaveCbs.forEach((cb) => cb());
    } else if (msg.type === 'relay') {
      const handler = actionHandlers[msg.action];
      if (handler) handler(msg.data);
    } else if (msg.type === 'error') {
      console.error('Room error:', msg.message);
      alert(msg.message);
    }
  });

  // Treat losing our own connection the same as the peer leaving — either
  // way the game can't continue until someone reconnects.
  socket.addEventListener('close', () => peerLeaveCbs.forEach((cb) => cb()));
  socket.addEventListener('error', () => {
    console.error('Could not reach the game server — check SERVER_URL in js/network.js.');
  });

  return {
    onPeerJoin(cb) { peerJoinCbs.push(cb); },
    onPeerLeave(cb) { peerLeaveCbs.push(cb); },
    makeAction(actionName) {
      const send = (data) => {
        if (socket && socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'relay', action: actionName, data }));
        }
      };
      const get = (cb) => { actionHandlers[actionName] = cb; };
      return [send, get];
    },
    leave() {
      try { socket.close(); } catch (e) { /* already gone */ }
    },
  };
}

/** Join (or re-join) the given room code. Call once per page. */
export function connectToRoom(roomCode) {
  if (socket) {
    try { socket.close(); } catch (e) { /* already gone */ }
  }
  room = makeRoom(roomCode.trim().toUpperCase());
  return room;
}

export function currentRoom() {
  return room;
}

export function leaveRoom() {
  if (room) {
    try { room.leave(); } catch (e) { /* ignore */ }
    room = null;
  }
}

/** A link that pre-fills this room's code on the home page, so it can be
 * shared instead of read/typed character by character. */
export function buildInviteLink(roomCode) {
  const url = new URL('index.html', window.location.href);
  url.searchParams.set('room', roomCode);
  return url.toString();
}

/** 5-character room code, uppercase, without easily-confused characters. */
export function generateRoomCode() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/** Read the session set up on the home page. Redirects home if missing. */
export function requireSession() {
  const name = sessionStorage.getItem('tg_name');
  const roomCode = sessionStorage.getItem('tg_room');
  const isHost = sessionStorage.getItem('tg_host') === 'true';
  if (!name || !roomCode) {
    const depth = window.location.pathname.includes('/games/') ? '../' : '';
    window.location.href = depth + 'index.html';
    return null;
  }
  return { name, roomCode, isHost };
}
