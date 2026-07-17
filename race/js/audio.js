/* All audio is synthesized (Web Audio API) + speechSynthesis announcer. No asset files. */
(function () {
  'use strict';
  let ctx = null, master = null, musicGain = null, noiseBuf = null;
  let muted = localStorage.getItem('gsr-muted') === '1';
  let musicTimer = null;

  function ac() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.9;
      master.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.gain.value = 0.32;
      musicGain.connect(master);
      const len = ctx.sampleRate * 1;
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  /* one enveloped oscillator note */
  function tone(freq, t0, dur, { type = 'square', vol = 0.25, slide = 0, dest } = {}) {
    if (!ac()) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g).connect(dest || master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  function noise(t0, dur, { vol = 0.3, freq = 1200, q = 1, slideTo = 0, dest } = {}) {
    if (!ac()) return;
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = q;
    f.frequency.setValueAtTime(freq, t0);
    if (slideTo) f.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(f).connect(g).connect(dest || master);
    src.start(t0); src.stop(t0 + dur + 0.05);
  }

  const now = () => (ac() ? ctx.currentTime : 0);

  const SFX = {
    click()   { tone(600, now(), 0.06, { type: 'triangle', vol: .2 }); },
    coinPick(){ tone(880, now(), 0.08, { type: 'square', vol: .18 }); tone(1320, now() + .06, 0.1, { type: 'square', vol: .15 }); },
    stamp()   { const t = now(); noise(t, .12, { vol: .5, freq: 3000, q: .6 }); tone(180, t, .18, { type: 'square', vol: .4, slide: -120 }); tone(2400, t + .01, .25, { type: 'triangle', vol: .22, slide: -800 }); },
    unlock()  { tone(500, now(), .1, { type: 'triangle', vol: .2, slide: -250 }); },
    lockFanfare() { const t = now(); [523, 659, 784, 1047].forEach((f, i) => tone(f, t + i * .07, .16, { type: 'square', vol: .16 })); },
    ready()   { const t = now(); tone(392, t, .5, { type: 'sawtooth', vol: .2, slide: 392 }); noise(t, .5, { vol: .12, freq: 900, slideTo: 3500 }); },
    slash()   { const t = now(); noise(t, .35, { vol: .5, freq: 5000, q: .4, slideTo: 500 }); },
    count()   { tone(440, now(), .18, { type: 'square', vol: .3 }); },
    go()      { const t = now(); tone(880, t, .5, { type: 'square', vol: .35 }); tone(1108, t, .5, { type: 'square', vol: .25 }); },
    press()   { tone(300, now(), .09, { type: 'square', vol: .3, slide: 200 }); },
    collect() { const t = now(); [784, 988, 1319, 1568].forEach((f, i) => tone(f, t + i * .05, .14, { type: 'triangle', vol: .22 })); noise(t, .15, { vol: .1, freq: 6000, q: .8 }); },
    finish()  { const t = now(); [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, t + i * .09, .3, { type: 'square', vol: .2 })); noise(t + .5, .8, { vol: .18, freq: 2000, q: .3 }); },
    tick()    { tone(1200, now(), .05, { type: 'square', vol: .22 }); },
    blast()   { const t = now(); tone(60, t, 1.1, { type: 'sawtooth', vol: .6, slide: -30 }); noise(t, 1.2, { vol: .65, freq: 300, q: .4, slideTo: 60 }); noise(t, .3, { vol: .5, freq: 2500, q: .3, slideTo: 300 }); },
    charred() { tone(900, now(), .7, { type: 'sine', vol: .3, slide: -750 }); },
    jingle()  { const t = now(); [659, 784, 988, 1319, 988, 1319, 1568].forEach((f, i) => tone(f, t + i * .12, .22, { type: 'triangle', vol: .22 })); },
  };

  /* ---- background music: 148 BPM synth-rock loop, lookahead scheduler ---- */
  const BPM = 148, STEP = 60 / BPM / 2;   // 8th notes
  const BASS = [55, 55, 82, 55, 65, 65, 98, 65, 49, 49, 73, 49, 62, 62, 92, 62];
  const LEAD = [440, 0, 523, 587, 659, 0, 587, 523, 494, 0, 587, 659, 740, 659, 587, 494];
  let step = 0, nextT = 0;

  function schedule() {
    while (nextT < ctx.currentTime + 0.2) {
      const i = step % 16;
      tone(BASS[i], nextT, STEP * 0.9, { type: 'sawtooth', vol: .3, dest: musicGain });
      if (i % 4 === 0) { tone(70, nextT, .12, { type: 'sine', vol: .9, slide: -45, dest: musicGain }); }         // kick
      if (i % 4 === 2) { noise(nextT, .09, { vol: .35, freq: 6500, q: .8, dest: musicGain }); }                  // hat/snare
      if (LEAD[i] && (Math.floor(step / 16) % 2 === 1)) tone(LEAD[i], nextT, STEP * .8, { type: 'square', vol: .12, dest: musicGain });
      nextT += STEP; step++;
    }
  }
  function musicStart() {
    if (!ac() || musicTimer) return;
    step = 0; nextT = ctx.currentTime + 0.06;
    musicTimer = setInterval(schedule, 90);
  }
  function musicStop() { clearInterval(musicTimer); musicTimer = null; }

  /* ---- announcer (speechSynthesis) ---- */
  let voice = null;
  function pickVoice() {
    const vs = speechSynthesis.getVoices().filter(v => v.lang.startsWith('en'));
    voice = vs.find(v => /Google UK English Male|Daniel|Male/i.test(v.name)) || vs[0] || null;
  }
  if ('speechSynthesis' in window) {
    pickVoice();
    speechSynthesis.onvoiceschanged = pickVoice;
  }
  function announce(text, { rate = 1.0, pitch = 0.6 } = {}) {
    if (muted || !('speechSynthesis' in window)) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      if (voice) u.voice = voice;
      u.rate = rate; u.pitch = pitch; u.volume = 1;
      speechSynthesis.speak(u);
    } catch (e) { /* announcer is optional */ }
  }

  function setMuted(m) {
    muted = m;
    localStorage.setItem('gsr-muted', m ? '1' : '0');
    if (master) master.gain.value = m ? 0 : 0.9;
    if (m && 'speechSynthesis' in window) speechSynthesis.cancel();
  }

  window.GameAudio = { sfx: SFX, musicStart, musicStop, announce, setMuted, isMuted: () => muted, unlock: ac };
})();
