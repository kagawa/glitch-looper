// ---------- image loading ----------
const drop = document.getElementById('drop');
const fileInput = document.getElementById('file');
drop.onclick = ()=> fileInput.click();
fileInput.onchange = e => { if (e.target.files[0]) loadImage(e.target.files[0]); };
['dragover','dragenter'].forEach(ev=> drop.addEventListener(ev, e=>{ e.preventDefault(); drop.classList.add('hover'); }));
['dragleave','drop'].forEach(ev=> drop.addEventListener(ev, e=>{ e.preventDefault(); drop.classList.remove('hover'); }));
drop.addEventListener('drop', e=>{ const f=e.dataTransfer.files[0]; if (f) loadImage(f); });
// allow changing the image after one is loaded: toolbar button + drop onto the stage
canvas.addEventListener('click', ()=> fileInput.click());   // click the image itself to change it
const stageEl = document.querySelector('.stage');
['dragover','dragenter'].forEach(ev=> stageEl.addEventListener(ev, e=> e.preventDefault()));
stageEl.addEventListener('drop', e=>{ e.preventDefault(); const f=e.dataTransfer.files[0]; if (f) loadImage(f); });

function loadImage(file){
  const url = URL.createObjectURL(file);
  const im = new Image();
  im.onload = ()=>{
    img = im;
    gifKey = '';                        // rebuild GIF palette for the new image
    // cap size for perf
    const maxW = 720;
    const scale = Math.min(1, maxW/im.width);
    const w = Math.round(im.width*scale), h = Math.round(im.height*scale);
    canvas.width = tmp.width = w;
    canvas.height = tmp.height = h;
    drop.classList.add('hidden');
    canvas.classList.remove('hidden');
    startT = performance.now();
    setStatus(`${im.width}×${im.height} → ${w}×${h}, processing`);
    if (state.jpeg.on) scheduleJpeg();
    if (state.png.on)  schedulePng();
    if (state.webp.on) scheduleWebp();
    if (state.gifg.on) scheduleGifg();
    URL.revokeObjectURL(url);
  };
  im.src = url;
}

// ---------- controls ----------
const recBtn = document.getElementById('recBtn');
const resetBtn = document.getElementById('resetBtn');
const rndBtn = document.getElementById('rndBtn');
const randSeg = document.getElementById('randLevel');
let randLevelVal = 'normal';                                  // default = weakest tier
randSeg.querySelectorAll('button').forEach(b=>{
  b.onclick = ()=>{ randLevelVal = b.dataset.v;
    randSeg.querySelectorAll('button').forEach(x=> x.classList.toggle('active', x===b)); };
});
const linkBtn = document.getElementById('linkBtn');
const shareBtn = document.getElementById('shareBtn');
// popovers: random settings (strength + auto/drift) and share (link / X)
const rndCfgBtn = document.getElementById('rndCfgBtn');
const rndPop = document.getElementById('rndPop');
const shareToggle = document.getElementById('shareToggle');
const sharePop = document.getElementById('sharePop');
const autoBtn = document.getElementById('autoBtn');
const driftBtn = document.getElementById('driftBtn');
const seedLockBtn = document.getElementById('seedLockBtn');
function closeAllPops(){ document.querySelectorAll('.popover').forEach(p=> p.setAttribute('hidden','')); }
function wirePop(btn, pop){
  btn.addEventListener('click', e=>{ e.stopPropagation();
    const willOpen = pop.hasAttribute('hidden'); closeAllPops(); if (willOpen) pop.removeAttribute('hidden'); });
  pop.addEventListener('click', e=> e.stopPropagation());
}
wirePop(rndCfgBtn, rndPop); wirePop(shareToggle, sharePop);
document.addEventListener('click', closeAllPops);
autoBtn.onclick = ()=> toggleAuto();
driftBtn.onclick = ()=> toggleDrift();
seedLockBtn.onclick = ()=>{
  seedLocked = !seedLocked;
  seedLockBtn.classList.toggle('active', seedLocked);
  seedLockBtn.textContent = seedLocked ? `🔒 Seed ${randomSeed}` : '🔓 Seed lock';
};
// sliders: auto-reroll interval + param-drift amount
const autoMsRange = document.getElementById('autoMsRange'), autoMsVal = document.getElementById('autoMsVal');
const driftAmtRange = document.getElementById('driftAmtRange'), driftAmtVal = document.getElementById('driftAmtVal');
autoMsRange.addEventListener('input', ()=>{
  const s = parseFloat(autoMsRange.value); autoMs = Math.round(s*1000);
  autoMsVal.textContent = s.toFixed(1)+'s'; restartAuto();          // apply live if auto is running
});
driftAmtRange.addEventListener('input', ()=>{
  driftAmt = parseInt(driftAmtRange.value)/100; driftAmtVal.textContent = driftAmtRange.value+'%';
});
const statusEl = document.getElementById('status');
function setStatus(s){ statusEl.innerHTML = s; }

// randomize every effect's on/off + params for instant new looks
// per-effect on-probability for Random — keep the heavy/destructive ones rare
const RAND_PROB = { png:.12, jpeg:.15, warp:.18, halftone:.12, feedback:.12, melt:.12,
                    mosh:.25, crt:.2, pixelate:.3, hud:.3, motion:.4,
                    ghost:.14, dotcrawl:.1, hum:.12, herring:.08, sync:.14, zoom:0,
                    compress:.14, pixsort:.14, databend:.12, degauss:.06, gif:.12,
                    sonify:.12, byteshift:.12, bitplane:.1, webp:.1, gifg:.1,
                    // colour-mapping / stylise effects: keep them occasional, emboss rarest
                    duotone:.14, solarize:.14, posterize:.14, emboss:.04 };
// three strength levels: prob = on-probability scale, str = how far params stray from their default
const RAND_LEVELS = { normal:{prob:.5, str:.4}, strong:{prob:1, str:1}, wild:{prob:1.7, str:1} };
function randomizeFX(){
  const lv = RAND_LEVELS[randLevelVal] || RAND_LEVELS.normal;
  if (!seedLocked) randomSeed = Math.floor(Math.random()*1_000_000);
  FX.forEach(f=>{
    if (state[f.id]._locked) return;
    if (f.id==='mask' || f.id==='zoom') return;                // leave Mask & Zoom exactly as the user set them
    if (f.id==='motion'){ state.motion.on = true; return; }    // Envelope always on, but don't randomise its values
    state[f.id].on = Math.random() < Math.min(0.95, (RAND_PROB[f.id] ?? 0.5) * lv.prob);
    f.params.forEach(p=>{
      if (p.type==='select'){ state[f.id][p.k] = p.options[Math.floor(Math.random()*p.options.length)][0]; }
      else {
        const rnd = p.min + Math.random()*(p.max-p.min);
        let val = p.def + (rnd - p.def)*lv.str;                 // blend toward default → gentler at low levels
        val = Math.max(p.min, Math.min(p.max, val));
        state[f.id][p.k] = parseFloat((Math.round(val/p.step)*p.step).toFixed(4));
      }
    });
  });
  // keep the heavy colour-mapping effects from stacking into mush — cap how many run at once
  const TONE = ['duotone','solarize','posterize','emboss'];
  const toneCap = randLevelVal==='wild' ? 2 : 1;
  let onTone = TONE.filter(id=>state[id].on);
  while (onTone.length > toneCap){
    const drop = onTone[Math.floor(Math.random()*onTone.length)];
    state[drop].on = false; onTone = onTone.filter(id=>id!==drop);
  }
  // Envelope/Zoom/Mask render nothing on their own — guarantee a real visible effect is on
  if (!FX.some(f=> !['motion','zoom','mask'].includes(f.id) && state[f.id].on)){
    const pick = ['vhs','glitch','noise','color'][Math.floor(Math.random()*4)];
    state[pick].on = true;
  }
  // (Zoom is left untouched above; the wobble's own zoom is handled by the base overscan that
  //  hides its wrap seam — no separate Zoom-effect coupling.)
  syncUI();
  if (presetSel) presetSel.value = '';
  if (!autoTimer) setStatus('🎲 Randomized — export if you like it');
}
rndBtn.onclick = randomizeFX;

// lightweight slider refresh (no jpeg/png rebuild) — used by param drift
function syncSlidersLight(){
  controls.querySelectorAll('input[type=range]').forEach(r=>{
    r.value = state[r.dataset.fx][r.dataset.k];
    const el = document.getElementById(`v-${r.dataset.fx}-${r.dataset.k}`);
    if (el) el.textContent = r.value;
  });
}

// hidden: slowly drift every enabled effect's params for organic, always-changing motion (toggle D)
let driftTimer = null; const driftTgt = {};
let autoMs = 4000;      // auto-reroll interval (ms), slider-controlled
let driftAmt = 0.5;     // drift wander range as a fraction of each param's span, slider-controlled
function driftTick(){
  FX.forEach(f=>{
    if (state[f.id]._locked) return;
    if (!state[f.id].on || f.id==='jpeg' || f.id==='png') return;   // skip the heavy real-glitch pools
    if (f.id==='zoom' || f.id==='motion' || f.id==='mask') return;  // Zoom / Envelope / Mask shouldn't wander
    f.params.forEach(p=>{
      if (p.type==='select') return;
      const key=f.id+'.'+p.k, cur=state[f.id][p.k], span=p.max-p.min;
      let t=driftTgt[key];
      if (t===undefined || Math.abs(cur-t) < span*0.03)              // reached target → pick a new nearby one
        t = driftTgt[key] = Math.max(p.min, Math.min(p.max, cur+(Math.random()-0.5)*span*driftAmt));
      state[f.id][p.k] = parseFloat((cur+(t-cur)*0.05).toFixed(4));  // slow ease
    });
  });
  syncSlidersLight();
}

// hidden: auto-reroll random (toggle R); slower when drift is also running
let autoTimer = null;
function autoDelay(){ return autoMs; }
function autoTick(){ randomizeFX(); setStatus(driftTimer ? '🎲🌊 auto + drift · R / D to stop' : '🎲 auto-reroll on · press R to stop'); }
function restartAuto(){ if (autoTimer){ clearInterval(autoTimer); autoTimer=setInterval(autoTick, autoDelay()); } }
function toggleAuto(){
  if (autoTimer){ clearInterval(autoTimer); autoTimer=null; setStatus('⏹ auto-reroll off'); }
  else { autoTick(); autoTimer=setInterval(autoTick, autoDelay()); }
  autoBtn?.classList.toggle('active', !!autoTimer);
}
function toggleDrift(){
  if (driftTimer){ clearInterval(driftTimer); driftTimer=null; setStatus('⏹ param drift off'); }
  else { driftTimer=setInterval(driftTick, 120); setStatus('🌊 param drift on · press D to stop'); }
  restartAuto();                                                    // rebalance reroll cadence
  driftBtn?.classList.toggle('active', !!driftTimer);
}

// hidden: fullscreen "zen" mode — just the image, for leaving it running (toggle F)
function toggleZen(){
  const on = !document.body.classList.contains('zen');
  document.body.classList.toggle('zen', on);
  if (on) document.documentElement.requestFullscreen?.().catch(()=>{});
  else if (document.fullscreenElement) document.exitFullscreen?.();
}
document.addEventListener('fullscreenchange', ()=>{ if (!document.fullscreenElement) document.body.classList.remove('zen'); });

resetBtn.onclick = ()=>{ applyPreset('Clean'); if (presetSel) presetSel.value=''; };
