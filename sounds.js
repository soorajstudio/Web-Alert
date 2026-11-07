// Built-in alarm sounds generated with WebAudio (no audio files needed).
(function () {
  const SOUNDS = {
    none:    { label: 'None' },
    chime:   { label: 'Chime',   type: 'sine',     vol: .25, notes: [[523.25,0,.9],[659.25,.2,.9],[783.99,.4,.9],[1046.5,.6,1.2]] },
    bell:    { label: 'Bell',    type: 'sine',     vol: .28, notes: [[880,0,1.8],[1760,0,1],[2640,0,.6]] },
    gentle:  { label: 'Gentle',  type: 'triangle', vol: .3,  notes: [[392,0,.8],[494,.3,.8],[587,.6,.8],[784,.9,1.2]] },
    beep:    { label: 'Beep',    type: 'square',   vol: .07, notes: [[1000,0,.15],[1000,.25,.15],[1000,.5,.15]] },
    digital: { label: 'Digital', type: 'sawtooth', vol: .06, notes: [[880,0,.12],[660,.15,.12],[880,.3,.12],[660,.45,.12]] }
  };
  function playOnce(ctx, name) {
    const s = SOUNDS[name]; if (!s || !s.notes) return 0;
    const t0 = ctx.currentTime + .02; let end = 0;
    for (const [f, at, d] of s.notes) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = s.type; o.frequency.value = f;
      g.gain.setValueAtTime(.0001, t0 + at);
      g.gain.exponentialRampToValueAtTime(s.vol, t0 + at + .02);
      g.gain.exponentialRampToValueAtTime(.0001, t0 + at + d);
      o.connect(g); g.connect(ctx.destination);
      o.start(t0 + at); o.stop(t0 + at + d + .05);
      end = Math.max(end, at + d);
    }
    return end;
  }
  // ring(name, {loop, maxMs}) -> stop()
  function ring(name, opts = {}) {
    if (!SOUNDS[name] || !SOUNDS[name].notes) return () => {};
    let ctx; try { ctx = new AudioContext(); } catch { return () => {}; }
    let timer, stopped = false;
    const cycle = () => {
      if (stopped) return;
      const len = playOnce(ctx, name);
      if (opts.loop) timer = setTimeout(cycle, (len + 1.5) * 1000);
    };
    cycle();
    const stop = () => { stopped = true; clearTimeout(timer); try { ctx.close(); } catch {} };
    if (opts.maxMs) setTimeout(stop, opts.maxMs);
    return stop;
  }
  window.Sounds = { list: Object.entries(SOUNDS).map(([id, s]) => ({ id, label: s.label })), ring };
})();
