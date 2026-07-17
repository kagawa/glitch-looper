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
// restore from a shared link if present, otherwise open with a gentle random look
const sm = location.hash.match(/[#&]s=([^&]+)/);
const fromLink = sm && applyState(sm[1]);
if (!fromLink) randomizeFX();
loadSample();                 // give the effects something to render; the status says how to swap it
setStatus(fromLink ? 'Loaded from link 🎛️ · tap the image to use your own'
                   : 'Sample image · tap it to load your own · 🎲 Random');
