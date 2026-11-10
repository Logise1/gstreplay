const CHAT_URL = 'https://livepill.lonormal.com/chat/widget?room=5d899562308b';
const STORE_KEY = 'gstreplay-chat-decision';
const SESSION_KEY = 'gstreplay-chat-session';

const consent = document.getElementById('chat-consent');
const frameWrap = document.getElementById('chat-frame-wrap');
const frame = document.getElementById('chat-frame');
const keepBox = document.getElementById('chat-keep');
const yesBtn = document.getElementById('chat-yes');
const noBtn = document.getElementById('chat-no');

function readDecision() {
  try {
    const kept = localStorage.getItem(STORE_KEY);
    if (kept === 'yes' || kept === 'no') {
      return kept;
    }
  } catch (err) {
    // ignore
  }
  try {
    const session = sessionStorage.getItem(SESSION_KEY);
    if (session === 'yes' || session === 'no') {
      return session;
    }
  } catch (err) {
    // ignore
  }
  return null;
}

function saveDecision(value, keep) {
  if (keep) {
    try {
      localStorage.setItem(STORE_KEY, value);
      sessionStorage.removeItem(SESSION_KEY);
    } catch (err) {
      // ignore
    }
    return;
  }
  try {
    sessionStorage.setItem(SESSION_KEY, value);
  } catch (err) {
    // ignore
  }
}

function showChat() {
  consent.hidden = true;
  frameWrap.hidden = false;
  if (frame && frame.getAttribute('src') !== CHAT_URL) {
    frame.src = CHAT_URL;
  }
}

function hideAll() {
  consent.hidden = true;
  frameWrap.hidden = true;
  if (frame) {
    frame.src = 'about:blank';
  }
}

function showConsent() {
  frameWrap.hidden = true;
  consent.hidden = false;
}

function applyDecision(value) {
  if (value === 'yes') {
    showChat();
  } else if (value === 'no') {
    hideAll();
  } else {
    showConsent();
  }
}

if (yesBtn) {
  yesBtn.addEventListener('click', () => {
    saveDecision('yes', !!(keepBox && keepBox.checked));
    showChat();
  });
}

if (noBtn) {
  noBtn.addEventListener('click', () => {
    saveDecision('no', !!(keepBox && keepBox.checked));
    hideAll();
  });
}

applyDecision(readDecision());
