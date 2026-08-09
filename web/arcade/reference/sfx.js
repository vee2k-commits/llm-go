const SFX = (function(){
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  function beep(freq, time, type='sine'){
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type; o.frequency.value = freq; o.connect(g); g.connect(ctx.destination);
    g.gain.setValueAtTime(0.001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.01);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + time);
    o.stop(ctx.currentTime + time + 0.02);
  }
  return {
    playJump: ()=>beep(880, 0.12, 'sine'),
    playCollision: ()=>beep(120, 0.18, 'sawtooth'),
    playCoin: ()=>beep(1400, 0.08, 'triangle')
  };
})();
window.SFX = SFX;
