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

// commit a drawable (Image / canvas) as the working picture, capped for perf. A canvas works
// everywhere img is used — the codecs and palette sampler only ever use it as a drawImage source.
function commitImage(src, sw, sh){
  img = src;
  gifKey = '';                          // rebuild GIF palette for the new image
  const maxW = 720, scale = Math.min(1, maxW/sw);
  const w = Math.round(sw*scale), h = Math.round(sh*scale);
  canvas.width = tmp.width = w;
  canvas.height = tmp.height = h;
  drop.classList.add('hidden');
  canvas.classList.remove('hidden');
  startT = performance.now();
  if (state.jpeg.on) scheduleJpeg();
  if (state.png.on)  schedulePng();
  if (state.webp.on) scheduleWebp();
  if (state.gifg.on) scheduleGifg();
  return { w, h };
}
function loadImage(file){
  const url = URL.createObjectURL(file);
  const im = new Image();
  im.onload = ()=>{
    const { w, h } = commitImage(im, im.width, im.height);
    setStatus(`${im.width}×${im.height} → ${w}×${h}, processing`);
    URL.revokeObjectURL(url);
  };
  im.src = url;
}
// A self-contained sample so the app renders something on first load. A test-card composition —
// colour bars, gradients, hard-edged shapes — happens to be exactly what shows every effect off.
function loadSample(){
  const c = document.createElement('canvas'); c.width = 640; c.height = 480;
  const x = c.getContext('2d'), W = c.width, H = c.height;
  const g = x.createLinearGradient(0,0,W,H);      // sky-ish backdrop (gradients → banding)
  g.addColorStop(0,'#1b2a4a'); g.addColorStop(1,'#c65b7c');
  x.fillStyle = g; x.fillRect(0,0,W,H);
  const bars = ['#fff','#ff0','#0ff','#0f0','#f0f','#f00','#00f'];   // colour bars strip
  const bw = W/bars.length;
  bars.forEach((col,i)=>{ x.fillStyle = col; x.fillRect(i*bw, 0, bw+1, 90); });
  for (let i=0;i<4;i++){                            // concentric rings (curvature / ringing)
    x.strokeStyle = `hsl(${i*60},80%,60%)`; x.lineWidth = 10;
    x.beginPath(); x.arc(W*0.32, H*0.55, 40+i*34, 0, 7); x.stroke();
  }
  x.fillStyle = '#ffcf3a';                          // hard-edged shapes (slice / sort / blocking)
  x.beginPath(); x.moveTo(W*0.68,H*0.3); x.lineTo(W*0.9,H*0.72); x.lineTo(W*0.5,H*0.72); x.closePath(); x.fill();
  x.fillStyle = '#2ee6c0'; x.fillRect(W*0.6, H*0.34, 120, 120);
  const ramp = x.createLinearGradient(0,0,W,0);     // luma ramp (banding / posterise)
  ramp.addColorStop(0,'#000'); ramp.addColorStop(1,'#fff');
  x.fillStyle = ramp; x.fillRect(0, H-56, W, 56);
  x.fillStyle = '#fff'; x.font = 'bold 64px system-ui, sans-serif'; x.textBaseline='middle';
  x.fillText('GLITCH', W*0.06, H*0.34);
  commitImage(c, W, H);
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
const seedInput = document.getElementById('seedInput');
const newSeedBtn = document.getElementById('newSeedBtn');
const seedCurrent = document.getElementById('seedCurrent');
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
function syncSeedUI(){
  seedInput.value = seedLocked ? randomSeed : '';
  seedCurrent.textContent = `Current: ${randomSeed} · ${seedLocked?'fixed':'auto'}`;
}
seedInput.addEventListener('change', ()=>{
  const raw=seedInput.value.trim(), value=Number(raw);
  if(raw==='' || !Number.isFinite(value) || value<0) seedLocked=false;
  else { randomSeed=Math.min(2147483647,Math.floor(value)); seedLocked=true; }
  syncSeedUI(); rebuildCodecs();     // the databending is seeded too — re-corrupt on a new seed
});
newSeedBtn.onclick=()=>{
  randomSeed=Math.floor(Math.random()*1_000_000); seedLocked=true; syncSeedUI(); rebuildCodecs();
};
syncSeedUI();
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
// sliders: how many effects a random roll may turn on (min never above max, and vice versa)
const randMinRange = document.getElementById('randMinRange'), randMinVal = document.getElementById('randMinVal');
const randMaxRange = document.getElementById('randMaxRange'), randMaxVal = document.getElementById('randMaxVal');
randMinRange.addEventListener('input', ()=>{
  randMin = parseInt(randMinRange.value);
  if (randMin > randMax){ randMax = randMin; randMaxRange.value = randMax; randMaxVal.textContent = randMax; }
  randMinVal.textContent = randMin;
});
randMaxRange.addEventListener('input', ()=>{
  randMax = parseInt(randMaxRange.value);
  if (randMax < randMin){ randMin = randMax; randMinRange.value = randMin; randMinVal.textContent = randMin; }
  randMaxVal.textContent = randMax;
});
const statusEl = document.getElementById('status');
function setStatus(s){ statusEl.innerHTML = s; }

// randomize every effect's on/off + params for instant new looks
// per-effect on-probability for Random — keep the heavy/destructive ones rare
const RAND_PROB = { png:.12, jpeg:.15, warp:.18, halftone:.12, feedback:.12, melt:.12,
                    mosh:.25, crt:.2, pixelate:.3, hud:.3, motion:.4,
                    ghost:.14, dotcrawl:.1, hum:.12, herring:.08, sync:.14, zoom:0,
                    compress:.14, pixsort:.14, databend:.12, degauss:.06, gif:.12,
                    sonify:.12, byteshift:.12, bitplane:.1, bmpmisread:.14, webp:.1, gifg:.1,
                    extrude:.12, time:.1, playback:.1, interlace:.1, stale:.1, synctear:.1, chroma:.12,   // these re-render the frame — keep them rare
                    // colour-mapping / stylise effects: keep them occasional, emboss rarest
                    duotone:.14, solarize:.14, posterize:.14, emboss:.04 };
// three strength levels: prob = on-probability scale, str = how far params stray from their default.
// str stays low at Normal so params sit near their (gentle) defaults instead of jumping to extremes.
const RAND_LEVELS = { normal:{prob:.5, str:.22}, strong:{prob:.9, str:.55}, wild:{prob:1.4, str:1} };
let randMin = 1, randMax = 5;              // clamp how many effects a roll turns on (UI: random popover)
function randomizeFX(){
  const lv = RAND_LEVELS[randLevelVal] || RAND_LEVELS.normal;
  if (!seedLocked){ randomSeed = Math.floor(Math.random()*1_000_000); syncSeedUI(); }
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
  let droppableTone = onTone.filter(id=>!state[id]._locked);
  while (onTone.length > toneCap && droppableTone.length){
    const drop = droppableTone[Math.floor(Math.random()*droppableTone.length)];
    state[drop].on = false; onTone = onTone.filter(id=>id!==drop);
    droppableTone = droppableTone.filter(id=>id!==drop);
  }
  // Envelope/Zoom/Mask render nothing on their own — and the Video effects only rework what another
  // effect already moved, so a roll of nothing-but-Video is a blank frame. Guarantee at least one
  // effect that actually puts something on screen, BEFORE the count clamp so the clamp can protect it.
  const PASSIVE = ['motion','zoom','mask','time','playback','stale','synctear','interlace','chroma'];
  const isDrawer = id => !PASSIVE.includes(id);
  if (!FX.some(f=> isDrawer(f.id) && state[f.id].on)){
    const candidates = ['vhs','glitch','noise','color'].filter(id=>!state[id]._locked);
    if (candidates.length) state[candidates[Math.floor(Math.random()*candidates.length)]].on = true;
  }
  // Clamp how many effects are on to [min, max]. Motion/Zoom/Mask never count (Envelope is always on;
  // Zoom/Mask are left as set). Trim the excess or top up at random, never touching a lock, and never
  // removing the last drawer — so max is exact (a min of 0 still yields 1, the guaranteed drawer).
  const UNCOUNTED = ['motion','zoom','mask'];
  const countable = FX.filter(f=> !UNCOUNTED.includes(f.id));
  const lo = Math.min(randMin, randMax), hi = Math.max(randMin, randMax);
  let on = countable.filter(f=> state[f.id].on);
  while (on.length > hi){
    const drawers = on.filter(f=> isDrawer(f.id)).length;   // don't cut the last one that draws
    const cut = on.filter(f=> !state[f.id]._locked && !(isDrawer(f.id) && drawers<=1));
    if (!cut.length) break;
    const pick = cut[Math.floor(Math.random()*cut.length)];
    state[pick.id].on = false; on = on.filter(x=>x!==pick);
  }
  let off = countable.filter(f=> !state[f.id].on && !state[f.id]._locked);
  while (on.length < lo && off.length){
    const f = off.splice(Math.floor(Math.random()*off.length),1)[0];
    state[f.id].on = true; on.push(f);           // its params were already randomised in the pass above
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
