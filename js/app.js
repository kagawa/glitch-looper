// ---------- animation loop ----------
function frame(now){
  if (playing && img){
    const phase = ((now - startT) % LOOP_MS) / LOOP_MS;
    draw(phase);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

buildUI();
// restore from a shared link if present, otherwise open with a gentle random look
const sm = location.hash.match(/[#&]s=([^&]+)/);
if (sm && applyState(sm[1])) setStatus('Loaded settings from link 🎛️ · load an image');
else { randomizeFX(); setStatus('Load an image · random effects ready (🎲 to reroll)'); }
