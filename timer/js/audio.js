// Minimal chiptune synth: square/triangle/noise voices + tracker-style loop + SFX.
const NOTES = { C:0,'C#':1,D:2,'D#':3,E:4,F:5,'F#':6,G:7,'G#':8,A:9,'A#':10,B:11 };
function freq(note, oct){ return 440 * Math.pow(2, (NOTES[note] + (oct-4)*12 - 9)/12); }

export class ChiptuneEngine {
  constructor(){ this.ctx=null; this.master=null; this.muted=false; this._loop=null; this._loopTimer=null; }
  unlock(){ // call on first user gesture
    if (this.ctx) return;
    this.ctx = new (window.AudioContext||window.webkitAudioContext)();
    this.master = this.ctx.createGain(); this.master.gain.value = this.muted?0:0.25;
    this.master.connect(this.ctx.destination);
    if (this.ctx.state==='suspended') this.ctx.resume();
  }
  setMuted(m){ this.muted=m; if(this.master) this.master.gain.value=m?0:0.25; }
  _voice(type, f, t, dur, gain=0.3){
    if(!this.ctx) return;
    const o=this.ctx.createOscillator(), g=this.ctx.createGain();
    o.type = type==='square'?'square':type==='tri'?'triangle':'sawtooth';
    o.frequency.value=f;
    g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(gain,t+0.01);
    g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t+dur);
  }
  _noise(t, dur, gain=0.3){
    if(!this.ctx) return;
    const n=this.ctx.createBufferSource();
    const buf=this.ctx.createBuffer(1, this.ctx.sampleRate*dur, this.ctx.sampleRate);
    const d=buf.getChannelData(0); for(let i=0;i<d.length;i++) d[i]=Math.random()*2-1;
    n.buffer=buf; const g=this.ctx.createGain();
    g.gain.setValueAtTime(gain,t); g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
    n.connect(g); g.connect(this.master); n.start(t); n.stop(t+dur);
  }
  // SFX library
  sfx(name){
    if(!this.ctx) return; const t=this.ctx.currentTime;
    switch(name){
      case 'click':  this._voice('square', 660, t, 0.06); break;
      case 'build':  this._voice('square', 220, t, 0.05); this._noise(t,0.05,0.15); break;
      case 'hit':    this._noise(t,0.12,0.3); this._voice('saw',140,t,0.12); break;
      case 'coin':   this._voice('square',988,t,0.06); this._voice('square',1319,t+0.06,0.1); break;
      case 'win':    [523,659,784,1047].forEach((f,i)=>this._voice('square',f,t+i*0.12,0.18)); break;
      case 'alarm':  [880,0,880,0].forEach((f,i)=>f&&this._voice('square',f,t+i*0.15,0.12)); break;
      case 'magic':  [1319,988,659].forEach((f,i)=>this._voice('square',f,t+i*0.06,0.07,0.22)); break;
    }
  }
  // Background loop: array of {note,oct,dur,type}. Schedules and re-arms.
  playTrack(seq, bpm=120){
    this.stopTrack(); if(!this.ctx) return;
    const beat = 60/bpm;
    const total = seq.reduce((s,n)=>s+n.dur,0)*beat;
    const schedule = ()=>{ let t=this.ctx.currentTime+0.05;
      for(const n of seq){ if(n.note) this._voice(n.type||'square', freq(n.note,n.oct), t, n.dur*beat*0.95, 0.12); t+=n.dur*beat; } };
    schedule();
    this._loopTimer = setInterval(schedule, total*1000);
  }
  stopTrack(){ if(this._loopTimer){ clearInterval(this._loopTimer); this._loopTimer=null; } }
}
export const audio = new ChiptuneEngine();
