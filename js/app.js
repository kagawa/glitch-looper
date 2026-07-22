// ---------- animation loop ----------
let seqNowStep = -1;
function frame(now){
  if (playing && img){
    const phase = ((now - startT) % LOOP_MS) / LOOP_MS;
    draw(phase);
    // move the "current step" highlight in the open sequencer grid
    const step = Math.floor(phase * SEQ_STEPS) % SEQ_STEPS;
    if (step !== seqNowStep){ seqNowStep = step;
      const grid = document.getElementById('seqgrid');
      if (grid && grid.offsetParent){
        grid.querySelectorAll('.seqcell.now').forEach(c=> c.classList.remove('now'));
        grid.querySelectorAll(`.seqcell[data-i="${step}"]`).forEach(c=> c.classList.add('now'));
      }
    }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

buildUI();
// restore from a shared link if present, otherwise open with either a random roll or a random preset.
// Wait for browser-capability probes so the first Random roll already skips unsupported effects.
capsReady.then(() => {
  // Flag effects whose real pipeline can't run in this browser so the card shows a warning.
  const markUnsupported = id => {
    const grp = document.querySelector(`.grp .fxtoggle[data-fx="${id}"]`)?.closest('.grp');
    if (grp) grp.classList.add('unsupported');
  };
  if (!BROWSER_CAPS.webpEncode)   markUnsupported('webp');
  if (!BROWSER_CAPS.audioDatabend) markUnsupported('audio');
  const sm = location.hash.match(/[#&]s=([^&]+)/);
  const fromLink = sm && applyState(sm[1]);
  let openedWith = '🎲 Random';
  if (!fromLink){
    if (Math.random() < 0.5){
      randomizeFX();
    } else {                                          // 50%: open on a random preset instead
      const names = Object.keys(PRESETS).filter(n => n !== 'Clean');
      const pick = names[Math.floor(Math.random()*names.length)];
      applyPreset(pick);
      if (presetSel) presetSel.value = 'builtin:' + pick;
      openedWith = 'Preset · ' + pick;
    }
  }
  loadSample();                 // give the effects something to render; the status says how to swap it
  setStatus(fromLink ? 'Loaded from link 🎛️ · tap the image to use your own'
                     : openedWith + ' · tap the image to load your own');
});
