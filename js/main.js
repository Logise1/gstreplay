import '../src/polyfill/css.js';
import {christmasEveOffset} from '../src/lib/time.js';
import {fetchRoute} from '../scenes/modvil/elements/maputils.js';
import '../src/elements/santa-button.js';
import '../scenes/modvil/elements/modvil-tracker.js';

const PATH_MUTE =
    'M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z';
const PATH_UNMUTE =
    'M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z';

window.gtag = window.gtag || function() {};

const asset = (name) => new URL(`../audio/${name}`, import.meta.url).href;

const MUSIC_VOLUME = 0.45;
const MUSIC_LOOP_START = 2.3762376237624;
const MUSIC_LOOP_END = 40.396;

const musicDataPromise = fetch(asset('village.mp3')).then((res) => {
  if (!res.ok) {
    throw new Error('failed to load village music');
  }
  return res.arrayBuffer();
});

let audioCtx = null;
let musicGain = null;
let musicBuffer = null;
let musicSource = null;
let musicPlaying = false;
let musicOffset = 0;
let musicStartedAt = 0;

const ambTop = new Audio(asset('village_amb_top.mp3'));
ambTop.loop = true;
ambTop.preload = 'auto';
const AMB_TOP_VOLUME = 0.32;

const surpriseClips = [
  'village_top_surprise1.mp3',
  'village_top_surprise2.mp3',
  'village_top_surprise3.mp3',
].map((name) => {
  const clip = new Audio(asset(name));
  clip.preload = 'auto';
  return clip;
});

const musicButton = document.getElementById('music-toggle');
const surpriseTimers = [];
let surpriseLoopTimer = 0;
let audioOn = false;

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function setMusicUi(playing) {
  if (!musicButton) {
    return;
  }
  musicButton.path = playing ? PATH_MUTE : PATH_UNMUTE;
  musicButton.color = playing ? '' : 'purple';
  musicButton.ariaLabel = playing ? 'Mute' : 'Unmute';
}

function playSurprise() {
  if (!audioOn) {
    return;
  }
  const proto = surpriseClips[Math.floor(Math.random() * surpriseClips.length)];
  const clip = proto.cloneNode();
  clip.volume = 0.17782794100389 * rand(0.7, 1);
  clip.playbackRate = rand(0.9, 1.3);
  clip.play().catch(() => {});
}

function fireVillageTopSurprise() {
  surpriseTimers.push(window.setTimeout(playSurprise, 500));
  surpriseTimers.push(window.setTimeout(playSurprise, 5000));
}

function clearAmbienceTimers() {
  while (surpriseTimers.length) {
    window.clearTimeout(surpriseTimers.pop());
  }
  if (surpriseLoopTimer) {
    window.clearInterval(surpriseLoopTimer);
    surpriseLoopTimer = 0;
  }
}

function fadeInAmb() {
  ambTop.volume = 0;
  ambTop.play().catch(() => {});
  const start = performance.now();
  const tick = (now) => {
    if (!audioOn) {
      return;
    }
    const t = Math.min(1, (now - start) / 1000);
    ambTop.volume = AMB_TOP_VOLUME * t;
    if (t < 1) {
      requestAnimationFrame(tick);
    }
  };
  requestAnimationFrame(tick);
}

function startAmbience() {
  if (audioOn) {
    return;
  }
  audioOn = true;
  ambTop.currentTime = 0;
  fadeInAmb();
  clearAmbienceTimers();
  surpriseLoopTimer = window.setInterval(fireVillageTopSurprise, 8000);
}

function stopAmbience() {
  audioOn = false;
  ambTop.pause();
  ambTop.currentTime = 0;
  clearAmbienceTimers();
}

function getAudioCtx() {
  if (!audioCtx) {
    audioCtx = new AudioContext();
    musicGain = audioCtx.createGain();
    musicGain.gain.value = MUSIC_VOLUME;
    musicGain.connect(audioCtx.destination);
  }
  return audioCtx;
}

function wrapMusicOffset(pos) {
  if (pos < MUSIC_LOOP_END) {
    return pos;
  }
  const loopLen = MUSIC_LOOP_END - MUSIC_LOOP_START;
  return MUSIC_LOOP_START + ((pos - MUSIC_LOOP_START) % loopLen);
}

function stopMusicSource() {
  if (!musicSource) {
    return;
  }
  try {
    musicSource.stop();
  } catch (err) {
    // already stopped
  }
  musicSource.disconnect();
  musicSource = null;
}

async function loadMusicBuffer() {
  if (musicBuffer) {
    return musicBuffer;
  }
  const ctx = getAudioCtx();
  const data = await musicDataPromise;
  musicBuffer = await ctx.decodeAudioData(data.slice(0));
  return musicBuffer;
}

async function startMusic() {
  try {
    const ctx = getAudioCtx();
    await loadMusicBuffer();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    if (ctx.state !== 'running') {
      throw new Error('audio context suspended');
    }
    stopMusicSource();
    musicSource = ctx.createBufferSource();
    musicSource.buffer = musicBuffer;
    musicSource.loop = true;
    musicSource.loopStart = MUSIC_LOOP_START;
    musicSource.loopEnd = MUSIC_LOOP_END;
    musicSource.connect(musicGain);
    musicSource.start(0, musicOffset);
    musicStartedAt = ctx.currentTime;
    musicPlaying = true;
    startAmbience();
    setMusicUi(true);
    return true;
  } catch (err) {
    musicPlaying = false;
    stopAmbience();
    setMusicUi(false);
    return false;
  }
}

function stopMusic() {
  if (audioCtx && musicPlaying) {
    musicOffset = wrapMusicOffset(musicOffset + (audioCtx.currentTime - musicStartedAt));
  }
  musicPlaying = false;
  stopMusicSource();
  stopAmbience();
  setMusicUi(false);
}

setMusicUi(false);
startMusic();
window.addEventListener('pointerdown', (ev) => {
  if (ev.target.closest && ev.target.closest('#music-toggle')) {
    return;
  }
  if (!musicPlaying) {
    startMusic();
  }
}, {once: true});

if (musicButton) {
  musicButton.addEventListener('click', (ev) => {
    ev.stopPropagation();
    if (musicPlaying) {
      stopMusic();
    } else {
      startMusic();
    }
  });
}

const tracker = document.querySelector('modvil-tracker');
tracker.trackerOffset = christmasEveOffset();
tracker.routeJitter = 10;

const routeUrl =
    'https://firebasestorage.googleapis.com/v0/b/santa-tracker-firebase.appspot.com/o/route%2Fsanta_|LANG|.json?alt=media&2018b';

fetchRoute(routeUrl).then((destinations) => {
  tracker.destinations = destinations || [];
}).catch((err) => {
  console.error('failed to load Santa route', err);
});
