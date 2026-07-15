// ---------- state ----------
const state = {};
FX.forEach(f => { state[f.id] = { on:f.on, _locked:false };
  f.params.forEach(p => { state[f.id][p.k] = p.def; if (p.env) state[f.id][p.k+'_env'] = !!p.envd; }); });

const LOOP_MS = 3000;   // 1 loop period
let img = null, playing = true, startT = performance.now();

// real JPEG databend: pool of genuinely-corrupted decoded frames, cycled for animation
let jpegFrames = [], jpegReady = false, jpegTimer = null;
const jsrc = document.createElement('canvas');
const jctx = jsrc.getContext('2d');

// real WebP databend: re-encode as low-quality WebP, corrupt bytes in the VP8 payload, decode
let webpFrames = [], webpReady = false, webpTimer = null, webpToken = 0;
const wsrc = document.createElement('canvas');
const wctx = wsrc.getContext('2d');

// real GIF databend: encode a single-frame GIF (median-cut + LZW), then corrupt either the colour
// table (GIF Palette) or the LZW image bytes (GIF Databend) and decode the broken GIF.
let gifgFrames = [], gifgReady = false, gifgTimer = null, gifgToken = 0;
const ggsrc = document.createElement('canvas');
const ggctx = ggsrc.getContext('2d', { willReadFrequently:true });

// real PNG glitch (pnglitch-style): corrupt scanline filter bytes + pixel bytes, re-deflate
let pngFrames = [], pngReady = false, pngTimer = null, pngToken = 0;
const psrc = document.createElement('canvas');
const pctx = psrc.getContext('2d', { willReadFrequently:true });

// ---------- build UI ----------
const controls = document.getElementById('controls');
const presetsEl = document.getElementById('presets');
let presetSel;
const CAT_IDS = {};   // sub-genre label → effect ids (filled by buildUI)
function updateCatCounts(){
  controls.querySelectorAll('.catcount').forEach(el=>{
    const ids = CAT_IDS[el.dataset.cat] || [];
    const n = ids.filter(id=> state[id] && state[id].on).length;
    el.textContent = n ? n : '';
  });
}
function buildUI(){
  const byId = {}; FX.forEach(f=> byId[f.id]=f);
  const placed = new Set();
  const makeCard = (f)=>{
    const g = document.createElement('div');
    g.className = 'grp' + (f.open ? ' open':'');
    g.innerHTML = `
      <div class="head">
        <input type="checkbox" ${state[f.id].on?'checked':''} data-fx="${f.id}" class="fxtoggle">
        <span class="name">${f.name}<small>${f.hint}</small></span>
        <button type="button" class="fxlock${state[f.id]._locked?' active':''}" data-fx="${f.id}" title="Protect from Random and Drift" aria-label="Protect ${f.name} from Random and Drift">${state[f.id]._locked?'🔒':'🔓'}</button>
        <span class="caret">▶</span>
      </div>
      <div class="body">
        ${f.params.map(p=> p.type==='select'
          ? `<label class="row" data-fx="${f.id}" data-param="${p.k}">
               <span class="k">${p.label}</span>
               <select class="fxsel" data-fx="${f.id}" data-k="${p.k}">
                 ${p.options.map(o=>`<option value="${o[0]}" ${state[f.id][p.k]==o[0]?'selected':''}>${o[1]}</option>`).join('')}
               </select>
               <span class="val"></span>
             </label>`
          : `<label class="row${p.env?' hasenv':''}" data-fx="${f.id}" data-param="${p.k}">
               <span class="k">${p.label}</span>
               <input type="range" min="${p.min}" max="${p.max}" step="${p.step}"
                      value="${state[f.id][p.k]}" data-fx="${f.id}" data-k="${p.k}">
               <span class="val" id="v-${f.id}-${p.k}">${state[f.id][p.k]}</span>
               ${p.env?`<input type="checkbox" class="envchk" data-fx="${f.id}" data-k="${p.k}" title="Apply Envelope" ${state[f.id][p.k+'_env']?'checked':''}>`:''}
             </label>`
        ).join('')}
      </div>`;
    g.querySelector('.head').addEventListener('click', e=>{
      if (e.target.classList.contains('fxtoggle') || e.target.classList.contains('fxlock')) return;
      g.classList.toggle('open');
      g.querySelector('.caret').textContent = g.classList.contains('open') ? '▼':'▶';
    });
    g.querySelector('.caret').textContent = f.open ? '▼':'▶';
    return g;
  };
  const addGroup = (label, ids)=>{
    ids = ids.filter(id=> byId[id] && !placed.has(id));
    if (!ids.length) return;
    CAT_IDS[label] = ids;
    const cat = document.createElement('div'); cat.className = 'cat';   // collapsed by default
    const head = document.createElement('div'); head.className = 'cathead';
    head.innerHTML = `<span class="catname">${label}</span><span class="catcount" data-cat="${label}"></span><span class="caret">▶</span>`;
    const body = document.createElement('div'); body.className = 'catbody';
    ids.forEach(id=>{ placed.add(id); body.appendChild(makeCard(byId[id])); });
    head.addEventListener('click', ()=>{ cat.classList.toggle('open'); head.querySelector('.caret').textContent = cat.classList.contains('open')?'▼':'▶'; });
    cat.appendChild(head); cat.appendChild(body); controls.appendChild(cat);
  };
  FX_GROUPS.forEach(([label,ids])=> addGroup(label, ids));
  addGroup('Other', FX.map(f=>f.id));   // catch any effect missing from FX_GROUPS

  controls.querySelectorAll('input[type=range]').forEach(r=>{
    r.addEventListener('input', ()=>{
      state[r.dataset.fx][r.dataset.k] = parseFloat(r.value);
      document.getElementById(`v-${r.dataset.fx}-${r.dataset.k}`).textContent = r.value;
      if (r.dataset.fx==='jpeg') scheduleJpeg();
      if (r.dataset.fx==='png')  schedulePng();
      if (r.dataset.fx==='webp') scheduleWebp();
      if (r.dataset.fx==='gifg') scheduleGifg();
    });
  });
  controls.querySelectorAll('.fxtoggle').forEach(c=>{
    c.addEventListener('change', ()=>{
      state[c.dataset.fx].on = c.checked;
      if (c.dataset.fx==='jpeg'){ if (c.checked) scheduleJpeg(); else if (state.png.on) schedulePng(); }
      if (c.dataset.fx==='png'  && c.checked) schedulePng();
      if (c.dataset.fx==='webp' && c.checked) scheduleWebp();
      if (c.dataset.fx==='gifg' && c.checked) scheduleGifg();
      updateCatCounts();
    });
  });
  controls.querySelectorAll('.fxsel').forEach(s=>{
    s.addEventListener('change', ()=>{
      state[s.dataset.fx][s.dataset.k] = parseInt(s.value, 10);
      if (s.dataset.fx==='png') schedulePng();
      if (s.dataset.fx==='mask') updateMaskRows();
    });
  });
  controls.querySelectorAll('.envchk').forEach(c=>{
    c.addEventListener('change', ()=>{ state[c.dataset.fx][c.dataset.k+'_env'] = c.checked; });
  });
  controls.querySelectorAll('.fxlock').forEach(button=>{
    button.addEventListener('click', ()=>{
      const effect = state[button.dataset.fx];
      effect._locked = !effect._locked;
      button.classList.toggle('active', effect._locked);
      button.textContent = effect._locked ? '🔒' : '🔓';
    });
  });

  const lab = document.createElement('span'); lab.className='presetlab'; lab.textContent='Preset';
  presetSel = document.createElement('select'); presetSel.className='presetsel';
  presetSel.innerHTML = `<option value="">Select…</option>` +
    PRESET_GROUPS.map(([g,names])=>`<optgroup label="${g}">`+
      names.map(n=>`<option value="${n}">${n}</option>`).join('')+`</optgroup>`).join('');
  presetSel.addEventListener('change', ()=>{ if (presetSel.value) applyPreset(presetSel.value); });
  presetsEl.appendChild(lab); presetsEl.appendChild(presetSel);
  updateMaskRows();
}
function updateMaskRows(){
  const source=state.mask.source|0, roam=(state.mask.mode|0)===1;
  controls.querySelectorAll('label[data-fx="mask"]').forEach(row=>{
    const key=row.dataset.param;
    let visible=true;
    if (['mode','x0','x1','y0','y1'].includes(key)) visible=source===0;
    if (key==='threshold') visible=source!==0;
    if (key==='interval') visible=(source===0&&roam)||source===5;
    row.hidden=!visible;
  });
}
function applyPreset(name){
  const p = PRESETS[name];
  FX.forEach(f=>{
    const pp = p[f.id] || {};
    state[f.id].on = !!pp.on;
    f.params.forEach(par=>{ if (pp[par.k] !== undefined) state[f.id][par.k] = pp[par.k]; });
  });
  syncUI();
}
function syncUI(){
  controls.querySelectorAll('.fxtoggle').forEach(c=> c.checked = state[c.dataset.fx].on);
  controls.querySelectorAll('input[type=range]').forEach(r=>{
    r.value = state[r.dataset.fx][r.dataset.k];
    document.getElementById(`v-${r.dataset.fx}-${r.dataset.k}`).textContent = r.value;
  });
  controls.querySelectorAll('.fxsel').forEach(s=> s.value = state[s.dataset.fx][s.dataset.k]);
  controls.querySelectorAll('.envchk').forEach(c=> c.checked = !!state[c.dataset.fx][c.dataset.k+'_env']);
  controls.querySelectorAll('.fxlock').forEach(button=>{
    const locked = !!state[button.dataset.fx]._locked;
    button.classList.toggle('active', locked); button.textContent = locked ? '🔒' : '🔓';
  });
  updateMaskRows();
  if (state.jpeg.on) scheduleJpeg(); else jpegReady = false;
  if (state.png.on)  schedulePng();  else pngReady  = false;
  if (state.webp.on) scheduleWebp(); else webpReady = false;
  if (state.gifg.on) scheduleGifg(); else gifgReady = false;
  updateCatCounts();
}
// envelope multiplier for destructive effects — makes the glitch "breathe" over the loop
function motionMul(phase){
  const mo = state.motion; if (!mo.on) return 1;
  const e = envCurve(phase, mo.mode, mo.rate);
  return (1-mo.depth) + mo.depth*e*2;   // trough → clean, peak → ~2x
}
// shared envelope curve (used by the Envelope effect and Melt's own Curve) — returns 0..1 over the loop.
// Eased with smootherstep / cubic (Penner-style) so the motion accelerates and settles naturally.
function envCurve(phase, mode, rate){
  const sm = t => t<=0?0 : t>=1?1 : t*t*t*(t*(t*6-15)+10);   // smootherstep (soft ends, fast middle)
  const hump = p => p<0.5 ? sm(p*2) : sm((1-p)*2);           // eased 0→1→0 (seamless)
  switch(mode){
    case 0: return 1;                                        // constant
    case 1: return hump(phase);                              // peak — eased rise & fall
    case 2: return hump((phase*rate)%1);                     // pulse — eased repeating humps
    case 3: { const b=0.82;                                  // build → drop — accelerating build, eased release
      const t=phase/b; return phase<b ? t*t*t : 1-sm((phase-b)/(1-b)); }
    case 4: return rand(Math.floor(phase*rate*4)+0.5);       // stutter — stepped random
    case 5: return phase<0.25 ? sm(phase/0.25) : phase>0.75 ? sm((1-phase)/0.25) : 1;  // swell — plateau peak
    case 6: { const b=0.18;                                  // drop → build — release then re-build (starts/ends high)
      return phase<b ? 1-sm(phase/b) : (t=>t*t*t)((phase-b)/(1-b)); }
    case 7: return Math.abs(Math.sin(Math.PI*phase*rate)) * hump(phase);   // bounce — decaying bounces within a peak
    case 8: { const N=Math.max(1,rate*3), seg=phase*N, i=Math.floor(seg)%N, j=(i+1)%N, t=seg-Math.floor(seg);
      const a=rand(i+0.5); return a+(rand(j+0.5)-a)*sm(t); }              // wander — smooth random
    default: return hump(phase);
  }
}
// per-parameter envelope: only params whose ⓔ checkbox is on get modulated
let ENV = 1;
function envF(fx,k){ return (state.motion.on && state[fx][k+'_env']) ? ENV : 1; }
function P(fx,k){ return state[fx][k] * envF(fx,k); }
