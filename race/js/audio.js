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
    smack()   { const t = now(); tone(140, t, .12, { type: 'square', vol: .5, slide: -60 }); noise(t, .08, { vol: .4, freq: 1800, q: .7 }); },
    squish()  { const t = now(); noise(t, .28, { vol: .5, freq: 900, q: 2, slideTo: 160 }); tone(320, t, .22, { type: 'sine', vol: .3, slide: -240 }); },
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
  /* announcer: Danish or English, toggleable; falls back to the engine's default voice per lang */
  let lang = localStorage.getItem('gsr-lang') === 'en' ? 'en' : 'da';
  const LANGTAG = { da: 'da-DK', en: 'en-GB' };
  const voices = { da: null, en: null };
  function pickVoices() {
    const all = speechSynthesis.getVoices();
    const best = (pre, names) => {
      const vs = all.filter(v => v.lang.toLowerCase().startsWith(pre));
      return vs.find(v => /natural|neural/i.test(v.name)) || vs.find(v => names.test(v.name)) || vs[0] || null;
    };
    voices.da = best('da', /Helle|Dansk|Danish/i);
    voices.en = best('en', /Google UK English Male|Daniel|Male/i);
  }
  if ('speechSynthesis' in window) {
    pickVoices();
    speechSynthesis.onvoiceschanged = pickVoices;
  }
  function announce(text, { rate = 1.0, pitch = 0.6 } = {}) {
    if (muted || !('speechSynthesis' in window)) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = LANGTAG[lang];
      if (voices[lang]) u.voice = voices[lang];
      u.rate = rate; u.pitch = pitch; u.volume = 1;
      speechSynthesis.speak(u);
    } catch (e) { /* announcer is optional */ }
  }

  /* announcer lines: [da, en, rate, pitch] — {n} is replaced by a player name */
  const PHRASES = {
    ready:    ['Klar til ræs!', 'Ready to race!', 1.0, 0.55],
    go:       ['Klar? Start!', 'Ready? Go!', 1.05, 0.55],
    finished: ['{n} er i mål!', '{n} finished!', 1.05, 0.6],
    allclear: ['Alle nåede i mål! Fantastisk!', 'Everyone made it! Amazing!', 1.0, 0.6],
    time:     ['Tiden er gået!', 'Time!', 0.9, 0.45],
    winner:   ['Vinderen er {n}!', 'The winner is {n}!', 1.0, 0.55],
  };
  function say(key, name) {
    const ph = PHRASES[key];
    if (!ph) return;
    const text = (lang === 'da' ? ph[0] : ph[1]).replace('{n}', name || '');
    announce(text, { rate: ph[2], pitch: ph[3] });
  }
  function setLang(l) {
    lang = l === 'en' ? 'en' : 'da';
    localStorage.setItem('gsr-lang', lang);
    announce(lang === 'da' ? 'Dansk!' : 'English!', { rate: 1.0, pitch: 0.6 });
  }

  function setMuted(m) {
    muted = m;
    localStorage.setItem('gsr-muted', m ? '1' : '0');
    if (master) master.gain.value = m ? 0 : 0.9;
    if (m && 'speechSynthesis' in window) speechSynthesis.cancel();
  }

  window.GameAudio = { sfx: SFX, musicStart, musicStop, announce, say, setLang, getLang: () => lang, setMuted, isMuted: () => muted, unlock: ac };
})();
