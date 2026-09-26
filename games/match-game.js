import { connectToRoom, requireSession } from '../js/network.js';

const QUESTIONS = [
  { type: 'choice', q: 'Beach 🏖️ or mountains 🏔️?', options: ['Beach', 'Mountains'] },
  { type: 'choice', q: 'Pizza 🍕 or tacos 🌮?', options: ['Pizza', 'Tacos'] },
  { type: 'choice', q: 'Morning person or night owl 🦉?', options: ['Morning', 'Night owl'] },
  { type: 'choice', q: 'Dogs 🐶 or cats 🐱?', options: ['Dogs', 'Cats'] },
  { type: 'text', q: "What's your favorite movie of all time?" },
  { type: 'choice', q: 'Sweet 🍫 or savory 🍟?', options: ['Sweet', 'Savory'] },
  { type: 'text', q: 'If you had one superpower, what would it be?' },
  { type: 'choice', q: 'Coffee ☕ or tea 🍵?', options: ['Coffee', 'Tea'] },
  { type: 'choice', q: 'Book 📖 or the movie version 🎬?', options: ['Book', 'Movie'] },
  { type: 'text', q: "What's one place you'd love to visit together?" },
  { type: 'choice', q: 'Texting 💬 or calling 📞?', options: ['Text', 'Call'] },
  { type: 'choice', q: 'Winter ❄️ or summer ☀️?', options: ['Winter', 'Summer'] },
  { type: 'text', q: "What's your ultimate comfort food?" },
  { type: 'choice', q: 'Karaoke 🎤 or dance floor 💃?', options: ['Karaoke', 'Dance floor'] },
  { type: 'text', q: 'Describe your perfect lazy Sunday in five words.' },
  { type: 'choice', q: 'Window seat ✈️ or aisle seat?', options: ['Window', 'Aisle'] },
];

const session = requireSession();
if (session) {
  const { name, roomCode, isHost } = session;

  document.getElementById('room-code').textContent = roomCode;
  document.getElementById('reveal-me-name').textContent = name;

  const questions = seededShuffle(QUESTIONS, roomCode);
  let qIndex = 0;
  let myAnswer = null;
  let peerAnswer = null;
  let myLocked = false;
  let matches = 0;
  let advancing = false;

  // ---- networking ----
  const overlay = document.getElementById('overlay');
  const overlayText = document.getElementById('overlay-text');
  const room = connectToRoom(roomCode);
  const [sendAnswer, getAnswer] = room.makeAction('answer');
  const [sendHello, getHello] = room.makeAction('hello');
  const [sendNext, getNext] = room.makeAction('next');
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
    document.getElementById('reveal-opp-name').textContent = peerName;
  });
  getAnswer(({ qIndex: qi, answer }) => {
    if (qi === qIndex) {
      peerAnswer = answer;
      tryReveal();
    }
  });
  getNext(() => advanceQuestion());
  getReset(() => window.location.reload());

  // ---- DOM refs ----
  const questionText = document.getElementById('question-text');
  const choiceArea = document.getElementById('choice-area');
  const textArea = document.getElementById('text-area');
  const textInput = document.getElementById('text-answer');
  const textLockBtn = document.getElementById('text-lock-btn');
  const waitingNote = document.getElementById('waiting-note');
  const questionCard = document.getElementById('question-card');
  const revealCard = document.getElementById('reveal-card');
  const finalCard = document.getElementById('final-card');
  const qCounter = document.getElementById('q-counter');
  const progressFill = document.getElementById('progress-fill');
  const matchScoreEl = document.getElementById('match-score');

  function renderQuestion() {
    const item = questions[qIndex];
    questionText.textContent = item.q;
    qCounter.textContent = `${qIndex + 1}/${questions.length}`;
    progressFill.style.width = `${(qIndex / questions.length) * 100}%`;
    waitingNote.classList.add('hidden');
    questionCard.classList.remove('hidden');
    revealCard.classList.add('hidden');

    choiceArea.innerHTML = '';
    if (item.type === 'choice') {
      choiceArea.classList.remove('hidden');
      textArea.classList.add('hidden');
      item.options.forEach((opt) => {
        const btn = document.createElement('button');
        btn.className = 'choice-btn';
        btn.textContent = opt;
        btn.addEventListener('click', () => lockIn(opt, btn));
        choiceArea.appendChild(btn);
      });
    } else {
      choiceArea.classList.add('hidden');
      textArea.classList.remove('hidden');
      textInput.value = '';
      textInput.disabled = false;
      textLockBtn.disabled = false;
    }
  }

  function lockIn(answer, btnEl) {
    if (myLocked) return;
    myLocked = true;
    myAnswer = answer;
    sendAnswer({ qIndex, answer });

    if (btnEl) {
      [...choiceArea.children].forEach((b) => (b.disabled = true));
      btnEl.classList.add('picked');
    } else {
      textInput.disabled = true;
      textLockBtn.disabled = true;
    }
    waitingNote.classList.remove('hidden');
    tryReveal();
  }

  textLockBtn.addEventListener('click', () => {
    const val = textInput.value.trim();
    if (!val) return;
    lockIn(val, null);
  });
  textInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') textLockBtn.click();
  });

  function tryReveal() {
    if (myLocked && peerAnswer !== null) reveal();
  }

  function reveal() {
    questionCard.classList.add('hidden');
    revealCard.classList.remove('hidden');
    document.getElementById('reveal-me-ans').textContent = myAnswer;
    document.getElementById('reveal-opp-ans').textContent = peerAnswer;
    const isMatch = myAnswer.trim().toLowerCase() === String(peerAnswer).trim().toLowerCase();
    const banner = document.getElementById('match-banner');
    if (isMatch) {
      matches++;
      banner.textContent = '✅ You matched!';
      banner.className = 'match-banner yes';
    } else {
      banner.textContent = '❌ No match this time';
      banner.className = 'match-banner no';
    }
    matchScoreEl.textContent = matches;
  }

  document.getElementById('next-btn').addEventListener('click', () => {
    sendNext();
    advanceQuestion();
  });

  function advanceQuestion() {
    if (advancing) return;
    advancing = true;
    qIndex++;
    myAnswer = null;
    peerAnswer = null;
    myLocked = false;
    if (qIndex >= questions.length) {
      showFinal();
    } else {
      renderQuestion();
    }
    setTimeout(() => (advancing = false), 200);
  }

  function showFinal() {
    questionCard.classList.add('hidden');
    revealCard.classList.add('hidden');
    progressFill.style.width = '100%';
    finalCard.classList.remove('hidden');
    const pct = Math.round((matches / questions.length) * 100);
    document.getElementById('final-heading').textContent =
      pct >= 75 ? 'Basically the same brain 🧠' : pct >= 40 ? 'Pretty in sync! 💭' : 'Wonderfully different! 🎲';
    document.getElementById('final-sub').textContent =
      `You matched on ${matches} of ${questions.length} questions (${pct}%).`;
  }

  document.getElementById('play-again-btn').addEventListener('click', () => {
    sendReset();
    window.location.reload();
  });

  function seededShuffle(arr, seedStr) {
    let seed = 0;
    for (let i = 0; i < seedStr.length; i++) seed = (seed * 31 + seedStr.charCodeAt(i)) >>> 0;
    const rand = mulberry32(seed || 1);
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  renderQuestion();
}
