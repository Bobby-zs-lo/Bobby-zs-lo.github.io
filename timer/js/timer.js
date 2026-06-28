// Wall-clock based countdown. Pure logic; rAF/visibility wiring lives in run.js.
export class TimerEngine {
  constructor(durationMs, opts = {}){
    this.durationMs = durationMs;
    this.now = opts.now || (() => Date.now());
    this.milestones = opts.milestones ?? 5;
    this.onTick = opts.onTick || (() => {});
    this.onMilestone = opts.onMilestone || (() => {});
    this.onComplete = opts.onComplete || (() => {});
    this.state = 'idle';          // idle | running | paused | done
    this._endTime = 0;            // wall-clock ms when timer hits zero
    this._pauseRemaining = durationMs;
    this._lastMilestone = 0;
  }
  start(){
    if (this.state === 'running') return;
    this._endTime = this.now() + this._pauseRemaining;
    this.state = 'running';
  }
  pause(){
    if (this.state !== 'running') return;
    this._pauseRemaining = this.getRemainingMs();
    this.state = 'paused';
  }
  resume(){ if (this.state === 'paused') this.start(); }
  reset(){
    this.state = 'idle';
    this._pauseRemaining = this.durationMs;
    this._lastMilestone = 0;
    this._endTime = 0;
  }
  getRemainingMs(){
    if (this.state === 'running') return Math.max(0, this._endTime - this.now());
    if (this.state === 'done') return 0;
    return this._pauseRemaining;
  }
  getProgress(){
    if (this.durationMs <= 0) return 1;
    return Math.min(1, 1 - this.getRemainingMs() / this.durationMs);
  }
  // Call each animation frame while running.
  tick(){
    if (this.state !== 'running') return;
    const remaining = this.getRemainingMs();
    const progress = this.getProgress();
    // milestones at i/milestones fractions of ELAPSED time
    const reached = Math.floor(progress * this.milestones);
    while (this._lastMilestone < reached && this._lastMilestone < this.milestones){
      this._lastMilestone++;
      this.onMilestone(this._lastMilestone, this.milestones);
    }
    this.onTick(remaining, progress);
    if (remaining <= 0){ this.state = 'done'; this.onComplete(); }
  }
}
