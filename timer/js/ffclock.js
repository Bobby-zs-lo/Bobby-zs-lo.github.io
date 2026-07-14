// Scaled wall clock for fast-forward. Pure logic; injected into TimerEngine as
// its `now` function so the countdown runs at 1x/2x/5x/10x without touching
// timer.js. Virtual time is continuous across speed changes (no jumps).
export function createScaledClock(realNow = () => Date.now()) {
  let speed = 1;
  let rBase = realNow();  // real time at last speed change
  let vBase = rBase;      // virtual time at last speed change

  function now() {
    return vBase + (realNow() - rBase) * speed;
  }

  function setSpeed(s) {
    if (!(Number.isFinite(s) && s > 0)) return;  // ignore invalid speeds
    vBase = now();
    rBase = realNow();
    speed = s;
  }

  return { now, setSpeed, getSpeed: () => speed };
}
