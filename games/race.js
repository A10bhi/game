import { connectToRoom, requireSession } from '../js/network.js';

const session = requireSession();
if (session) {
  const { name, roomCode, isHost } = session;
  document.getElementById('room-code').textContent = roomCode;

  // ---- track geometry: a stadium (two straights + two semicircle ends) ----
  const CX1 = 250, CX2 = 550, CY = 250, R = 150; // centerline
  const TRACK_HALF_WIDTH = 55;

  const CHECKPOINTS = [
    { x: (CX1 + CX2) / 2, y: CY - R, r: 42 }, // 0: start / finish, top straight
    { x: CX2 + R, y: CY, r: 42 },             // 1: right cap
    { x: (CX1 + CX2) / 2, y: CY + R, r: 42 }, // 2: bottom straight
    { x: CX1 - R, y: CY, r: 42 },             // 3: left cap
  ];

  const LAPS_TO_WIN = 3;
  const START = { x: 280, y: CY - R };

  function makeCar(offsetY) {
    return { x: START.x, y: START.y + offsetY, angle: 0, speed: 0, nextCP: 1, laps: 0, finished: false };
  }
  const myCar = makeCar(isHost ? -16 : 16);
  const oppCar = makeCar(isHost ? 16 : -16);
  const myColor = isHost ? '#FFC53D' : '#FF6B6B';
  const oppColor = isHost ? '#FF6B6B' : '#FFC53D';

  // ---- DOM ----
  const canvas = document.getElementById('track');
  const ctx = canvas.getContext('2d');
  const overlay = document.getElementById('overlay');
  const overlayText = document.getElementById('overlay-text');
  const centerOverlay = document.getElementById('center-overlay');
  const centerContent = document.getElementById('center-content');
  const meLapEl = document.getElementById('me-lap');
  const oppLapEl = document.getElementById('opp-lap');
  let oppName = 'Friend';

  // ---- networking ----
  const room = connectToRoom(roomCode);
  const [sendPos, getPos] = room.makeAction('pos');
  const [sendReady, getReady] = room.makeAction('ready');
  const [sendFinish, getFinish] = room.makeAction('finish');
  const [sendHello, getHello] = room.makeAction('hello');
  const [sendReset, getReset] = room.makeAction('reset');

  let peerHere = false;
  let myReady = false, peerReady = false;
  let opponentFinished = false;
  let raceState = 'connecting'; // connecting -> ready -> countdown -> racing -> finished

  room.onPeerJoin(() => {
    peerHere = true;
    overlay.classList.add('hidden');
    sendHello(name);
    if (raceState === 'connecting') showReadyUI();
  });
  room.onPeerLeave(() => {
    peerHere = false;
    overlayText.textContent = 'Your friend left the room…';
    overlay.classList.remove('hidden');
  });
  getHello((peerName) => {
    oppName = peerName;
  });
  getPos((data) => {
    oppCar.x = data.x; oppCar.y = data.y; oppCar.angle = data.angle;
    oppCar.laps = data.laps; oppCar.finished = data.finished;
  });
  getReady(() => {
    peerReady = true;
    updateReadyStatus();
    maybeStartCountdown();
  });
  getFinish(() => {
    opponentFinished = true;
  });
  getReset(() => window.location.reload());

  setInterval(() => {
    sendPos({ x: myCar.x, y: myCar.y, angle: myCar.angle, laps: myCar.laps, finished: myCar.finished });
  }, 50);

  // ---- ready / countdown ----
  function showReadyUI() {
    raceState = 'ready';
    centerOverlay.classList.remove('hidden');
    centerContent.innerHTML = `
      <h2 style="font-family:var(--font-display); margin:0;">Ready to race?</h2>
      <p id="ready-status" class="muted-text" style="margin:0;">Both racers need to hit ready.</p>
      <button class="btn btn-primary" id="ready-btn">I'm ready 🏁</button>
    `;
    document.getElementById('ready-btn').addEventListener('click', () => {
      myReady = true;
      sendReady();
      updateReadyStatus();
      document.getElementById('ready-btn').disabled = true;
      maybeStartCountdown();
    });
  }
  function updateReadyStatus() {
    const el = document.getElementById('ready-status');
    if (!el) return;
    if (myReady && peerReady) el.textContent = "You're both ready…";
    else if (myReady) el.textContent = `Waiting for ${oppName}…`;
    else if (peerReady) el.textContent = `${oppName} is ready — your turn!`;
  }
  function maybeStartCountdown() {
    if (myReady && peerReady && raceState === 'ready') startCountdown();
  }
  function startCountdown() {
    raceState = 'countdown';
    let n = 3;
    centerContent.innerHTML = `<div class="countdown-num">${n}</div>`;
    const timer = setInterval(() => {
      n--;
      if (n > 0) {
        centerContent.innerHTML = `<div class="countdown-num">${n}</div>`;
      } else if (n === 0) {
        centerContent.innerHTML = `<div class="countdown-num">GO!</div>`;
      } else {
        clearInterval(timer);
        centerOverlay.classList.add('hidden');
        raceState = 'racing';
      }
    }, 800);
  }

  // ---- input ----
  const keys = { up: false, down: false, left: false, right: false };
  const keyMap = {
    ArrowUp: 'up', KeyW: 'up',
    ArrowDown: 'down', KeyS: 'down',
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
  };
  window.addEventListener('keydown', (e) => {
    const k = keyMap[e.code];
    if (k) { keys[k] = true; e.preventDefault(); }
  });
  window.addEventListener('keyup', (e) => {
    const k = keyMap[e.code];
    if (k) { keys[k] = false; e.preventDefault(); }
  });

  // ---- physics ----
  const ACCEL = 0.22, MAX_SPEED = 4.2, REVERSE_MAX = -2, FRICTION = 0.985, TURN_RATE = 0.045;

  function updateCar(car) {
    if (keys.up) car.speed = Math.min(car.speed + ACCEL, MAX_SPEED);
    else if (keys.down) car.speed = Math.max(car.speed - ACCEL, REVERSE_MAX);
    else car.speed *= FRICTION;

    const turnFactor = Math.min(Math.abs(car.speed) / MAX_SPEED, 1);
    if (keys.left) car.angle -= TURN_RATE * turnFactor;
    if (keys.right) car.angle += TURN_RATE * turnFactor;

    car.x += Math.cos(car.angle) * car.speed;
    car.y += Math.sin(car.angle) * car.speed;

    const cp = CHECKPOINTS[car.nextCP];
    if (Math.hypot(car.x - cp.x, car.y - cp.y) < cp.r) {
      if (car.nextCP === 0) car.laps++;
      car.nextCP = (car.nextCP + 1) % CHECKPOINTS.length;
    }
  }

  function finishIfDone() {
    if (myCar.finished || myCar.laps < LAPS_TO_WIN) return;
    myCar.finished = true;
    raceState = 'finished';
    sendFinish();
    const place = opponentFinished ? 2 : 1;
    centerOverlay.classList.remove('hidden');
    centerContent.innerHTML = `
      <h2 style="font-family:var(--font-display); margin:0; color:${place === 1 ? 'var(--gold)' : 'var(--coral)'};">
        ${place === 1 ? '🏆 You win!' : '🥈 Good race!'}
      </h2>
      <p style="margin:0;">${place === 1 ? 'You crossed the line first.' : `${oppName} beat you to it.`}</p>
      <button class="btn btn-primary" id="race-again-btn">Race again</button>
    `;
    document.getElementById('race-again-btn').addEventListener('click', () => {
      sendReset();
      window.location.reload();
    });
  }

  // ---- drawing ----
  function stadiumPath(c, r) {
    ctx.beginPath();
    ctx.moveTo(CX1, CY - r);
    ctx.lineTo(CX2, CY - r);
    ctx.arc(CX2, CY, r, -Math.PI / 2, Math.PI / 2, false);
    ctx.lineTo(CX1, CY + r);
    ctx.arc(CX1, CY, r, Math.PI / 2, -Math.PI / 2, false);
    ctx.closePath();
  }

  function drawTrack() {
    ctx.fillStyle = '#cdeccb';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    stadiumPath(ctx, R + TRACK_HALF_WIDTH);
    ctx.fillStyle = '#c9c2d6';
    ctx.fill();

    stadiumPath(ctx, R - TRACK_HALF_WIDTH);
    ctx.fillStyle = '#cdeccb';
    ctx.fill();

    // dashed centerline
    ctx.save();
    ctx.setLineDash([14, 14]);
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#fff';
    stadiumPath(ctx, R);
    ctx.stroke();
    ctx.restore();

    // start/finish line
    const sf = CHECKPOINTS[0];
    ctx.save();
    ctx.strokeStyle = '#2B1B3D';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(sf.x, CY - R - TRACK_HALF_WIDTH);
    ctx.lineTo(sf.x, CY - R + TRACK_HALF_WIDTH);
    ctx.stroke();
    ctx.restore();

    // checkpoint markers (subtle)
    CHECKPOINTS.forEach((cp, i) => {
      if (i === 0) return;
      ctx.beginPath();
      ctx.arc(cp.x, cp.y, 8, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(43,27,61,0.28)';
      ctx.fill();
    });
  }

  function drawCar(car, color) {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    ctx.fillStyle = color;
    ctx.strokeStyle = '#2B1B3D';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(15, 0);
    ctx.lineTo(-9, -8);
    ctx.lineTo(-4, 0);
    ctx.lineTo(-9, 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function render() {
    drawTrack();
    drawCar(oppCar, oppColor);
    drawCar(myCar, myColor);

    meLapEl.textContent = myCar.finished ? 'You: Finished 🏁' : `You: Lap ${myCar.laps}/${LAPS_TO_WIN}`;
    oppLapEl.textContent = oppCar.finished
      ? `${oppName}: Finished 🏁`
      : `${oppName}: Lap ${oppCar.laps}/${LAPS_TO_WIN}`;
  }

  function loop() {
    if (raceState === 'racing' && !myCar.finished) {
      updateCar(myCar);
      finishIfDone();
    }
    render();
    requestAnimationFrame(loop);
  }
  loop();
}
