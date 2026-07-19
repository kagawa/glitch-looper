// ---------- state ----------
const state = {};
FX.forEach(f => { state[f.id] = { on:f.on, _locked:false, _seq:null };   // _seq: per-step on/off, null = always
  f.params.forEach(p => { state[f.id][p.k] = p.def; if (p.env) state[f.id][p.k+'_env'] = !!p.envd; }); });

const LOOP_MS = 3000;   // 1 loop period
const SEQ_STEPS = 8;    // the loop is split into this many on/off steps for the Sequencer
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

// real audio databend: route the raw RGB bytes through a WebAudio graph and read the samples back
let audioFrames = [], audioReady = false, audioTimer = null, audioToken = 0;
const asrc = document.createElement('canvas');
const actx = asrc.getContext('2d', { willReadFrequently:true });

// Runtime browser capabilities. Not every browser can encode WebP (older iOS Safari falls back
// to a PNG blob) or run an OfflineAudioContext pipeline end-to-end. We probe at startup so
// Random can skip effects whose real pipeline would silently produce nothing on this device.
const BROWSER_CAPS = { webpEncode:true, audioDatabend:true };
const capsReady = (async () => {
  try {                                            // WebP encoding
    const c = document.createElement('canvas'); c.width=c.height=2;
    const cc = c.getContext('2d'); cc.fillStyle='#f00'; cc.fillRect(0,0,2,2);
    const blob = await new Promise(res => c.toBlob(res, 'image/webp', 0.5));
    BROWSER_CAPS.webpEncode = !!(blob && /webp/.test(blob.type));
  } catch { BROWSER_CAPS.webpEncode = false; }
  try {                                            // Audio Databend end-to-end probe
    const OACtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OACtx) throw new Error('no OfflineAudioContext');
    const octx = new OACtx(1, 128, 44100);
    const buf = octx.createBuffer(1, 128, 44100);
    const src = octx.createBufferSource(); src.buffer = buf;
    src.connect(octx.destination); src.start();
    await octx.startRendering();
    // buildAudioFrames also needs createImageBitmap(ImageData) to reach the canvas.
    if (typeof createImageBitmap !== 'function') throw new Error('no createImageBitmap');
    await createImageBitmap(new ImageData(2, 2));
    BROWSER_CAPS.audioDatabend = true;
  } catch { BROWSER_CAPS.audioDatabend = false; }
})();

// Real-codec stages are rebuilt as one dependency chain. One shared blend canvas applies each
// stage's Output Mix before its frames become the input to the next codec.
let codecPipelineTimer = null, codecPipelineToken = 0;
const codecBlend = document.createElement('canvas');
const codecBlendCtx = codecBlend.getContext('2d');
const BAKED_CODEC_IDS = ['jpeg','png','webp','gifg','audio'];

// ---------- build UI ----------
const controls = document.getElementById('controls');   // wrapper: queries/delegation span both inner panels
const fxPanel = document.getElementById('fxPanel');      // per-frame image effects
const metaPanel = document.getElementById('metaPanel');  // whole-frame (Global) + Sequencer, its own table
const presetsEl = document.getElementById('presets');
let presetSel;
const USER_PRESETS_KEY = 'glitch-looper.user-presets.v1';
let userPresets = loadUserPresets();
const CAT_IDS = {};   // sub-genre label → effect ids (filled by buildUI)
function loadUserPresets(){
  try {
    const saved = JSON.parse(localStorage.getItem(USER_PRESETS_KEY) || '[]');
    if (!Array.isArray(saved)) return [];
    return saved.filter(p=> p && typeof p.name==='string' && p.name.trim() && typeof p.state==='string')
      .map(p=>({ name:p.name.trim(), state:p.state })).slice(0,100);
  } catch(e){ return []; }
}
function storeUserPresets(){
  try { localStorage.setItem(USER_PRESETS_KEY, JSON.stringify(userPresets)); return true; }
  catch(e){ setStatus('Could not save preset — browser storage is unavailable'); return false; }
}
function fillPresetSelect(selected=''){
  presetSel.innerHTML = `<option value="">Select…</option>` +
    PRESET_GROUPS.map(([g,names])=>`<optgroup label="${g}">`+
      names.map(n=>`<option value="builtin:${n}">${n}</option>`).join('')+`</optgroup>`).join('') +
    (userPresets.length ? `<optgroup label="My Presets">`+
      userPresets.map((p,i)=>`<option value="user:${i}">${escapeHtml(p.name)}</option>`).join('')+`</optgroup>` : '');
  presetSel.value = selected;
}
function escapeHtml(s){
  return s.replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function saveUserPreset(){
  const current = presetSel.value.startsWith('user:') ? userPresets[+presetSel.value.slice(5)] : null;
  const raw = prompt('Preset name:', current ? current.name : '');
  if (raw===null) return;
  const name = raw.trim();
  if (!name){ setStatus('Preset name cannot be empty'); return; }
  const existing = userPresets.findIndex(p=>p.name.toLocaleLowerCase()===name.toLocaleLowerCase());
  if (existing>=0 && !confirm(`Overwrite “${userPresets[existing].name}”?`)) return;
  const item = { name, state:encodeState() };
  let index;
  if (existing>=0){ userPresets[existing]=item; index=existing; }
  else { userPresets.push(item); index=userPresets.length-1; }
  if (!storeUserPresets()) return;
  fillPresetSelect(`user:${index}`);
  setStatus(`Saved preset · ${name}`);
}
function deleteUserPreset(){
  if (!presetSel.value.startsWith('user:')) return;
  const index=+presetSel.value.slice(5), item=userPresets[index];
  if (!item || !confirm(`Delete “${item.name}”?`)) return;
  userPresets.splice(index,1);
  if (!storeUserPresets()) return;
  fillPresetSelect();
  setStatus(`Deleted preset · ${item.name}`);
}
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
          : p.type==='text'
          ? `<label class="row rowtext" data-fx="${f.id}" data-param="${p.k}">
               <span class="k">${p.label}</span>
               <input type="text" class="fxtext" data-fx="${f.id}" data-k="${p.k}"
                      value="${String(state[f.id][p.k]).replace(/"/g,'&quot;')}" placeholder="${p.ph||''}">
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
    const cat = document.createElement('div'); cat.className = 'cat'; cat.dataset.cat = label;   // collapsed by default
    const head = document.createElement('div'); head.className = 'cathead';
    head.innerHTML = `<span class="catname">${label}</span><span class="catcount" data-cat="${label}"></span><span class="caret">▶</span>`;
    const body = document.createElement('div'); body.className = 'catbody';
    ids.forEach(id=>{ placed.add(id); body.appendChild(makeCard(byId[id])); });
    head.addEventListener('click', ()=>{ cat.classList.toggle('open'); head.querySelector('.caret').textContent = cat.classList.contains('open')?'▼':'▶'; });
    cat.appendChild(head); cat.appendChild(body);
    (label==='Global' ? metaPanel : fxPanel).appendChild(cat);   // Global goes in the separate table
  };
  FX_GROUPS.forEach(([label,ids])=> addGroup(label, ids));
  addGroup('Other', FX.map(f=>f.id));   // catch any effect missing from FX_GROUPS

  controls.querySelectorAll('input[type=range]').forEach(r=>{
    r.addEventListener('input', ()=>{
      state[r.dataset.fx][r.dataset.k] = parseFloat(r.value);
      document.getElementById(`v-${r.dataset.fx}-${r.dataset.k}`).textContent = r.value;
      if (BAKED_CODEC_IDS.includes(r.dataset.fx)) scheduleCodecPipeline();
      updateRows();     // a show() can key off a slider too, not just a select
    });
  });
  controls.querySelectorAll('.fxtoggle').forEach(c=>{
    c.addEventListener('change', ()=>{
      state[c.dataset.fx].on = c.checked;
      if (BAKED_CODEC_IDS.includes(c.dataset.fx)) scheduleCodecPipeline();
      updateCatCounts();
      if (document.querySelector('.seqcat.open')) buildSeqGrid();   // rows follow which effects are on
    });
  });
  // sequencer cells are added dynamically, so delegate the click from the grid
  controls.addEventListener('click', e=>{
    const cell = e.target.closest('.seqcell'); if (!cell) return;
    toggleSeqCell(cell.dataset.fx, +cell.dataset.i);
    cell.classList.toggle('on');
  });
  controls.querySelectorAll('.fxtext').forEach(t=>{
    t.addEventListener('input', ()=>{ state[t.dataset.fx][t.dataset.k] = t.value; });
  });
  controls.querySelectorAll('.fxsel').forEach(s=>{
    s.addEventListener('change', ()=>{
      state[s.dataset.fx][s.dataset.k] = parseInt(s.value, 10);
      if (BAKED_CODEC_IDS.includes(s.dataset.fx)) scheduleCodecPipeline();
      if (s.dataset.fx==='mask' && s.dataset.k==='source') state.mask.mode=(state.mask.source|0)===6?1:0;
      if (s.dataset.fx==='hud' && s.dataset.k==='layout'){ applyHudPreset(state.hud.layout|0); syncUI(); }
      updateRows();          // any select can gate rows, not just the mask's
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
  fillPresetSelect();
  presetSel.addEventListener('change', ()=>{
    const value=presetSel.value;
    if (value.startsWith('builtin:')) applyPreset(value.slice(8));
    else if (value.startsWith('user:')){
      const item=userPresets[+value.slice(5)];
      if (item && !applyState(item.state)) setStatus('Could not load this preset');
      else if (item) setStatus(`Loaded preset · ${item.name}`);
    }
    deletePresetBtn.disabled=!value.startsWith('user:');
  });
  const savePresetBtn=document.createElement('button'); savePresetBtn.type='button'; savePresetBtn.className='preseticon';
  savePresetBtn.textContent='＋'; savePresetBtn.title='Save current settings as a browser preset'; savePresetBtn.setAttribute('aria-label','Save current settings as a preset');
  const deletePresetBtn=document.createElement('button'); deletePresetBtn.type='button'; deletePresetBtn.className='preseticon';
  deletePresetBtn.textContent='−'; deletePresetBtn.title='Delete selected user preset'; deletePresetBtn.setAttribute('aria-label','Delete selected user preset'); deletePresetBtn.disabled=true;
  savePresetBtn.addEventListener('click', saveUserPreset); deletePresetBtn.addEventListener('click', deleteUserPreset);
  presetsEl.appendChild(lab); presetsEl.appendChild(presetSel); presetsEl.appendChild(savePresetBtn); presetsEl.appendChild(deletePresetBtn);

  // ---- Sequencer: a step grid, one row per ON effect, tap a cell to gate that effect on/off ----
  const seqCat = document.createElement('div'); seqCat.className='cat seqcat open';   // open by default — the grid is a nice thing to see
  const seqHead = document.createElement('div'); seqHead.className='cathead';
  seqHead.innerHTML = `<span class="catname">⏱ Sequencer</span><span class="catcount" id="seqcount"></span><span class="caret">▼</span>`;
  const seqBody = document.createElement('div'); seqBody.className='catbody';
  seqBody.innerHTML = `<div id="seqgrid" class="seqgrid"></div>
    <div class="seqnote">Split the loop into ${SEQ_STEPS} steps · tap a cell to skip that effect there · empty row = always on</div>`;
  seqHead.addEventListener('click', ()=>{ seqCat.classList.toggle('open');
    seqHead.querySelector('.caret').textContent = seqCat.classList.contains('open')?'▼':'▶';
    if (seqCat.classList.contains('open')) buildSeqGrid(); });
  seqCat.appendChild(seqHead); seqCat.appendChild(seqBody); metaPanel.appendChild(seqCat);
  buildSeqGrid();                                    // populate now since it starts open

  updateRows();
}
// effects the sequencer can gate — everything visible (Envelope/Zoom/Mask make no sense to step)
function seqEffects(){ return FX.filter(f=> !['motion','zoom','mask'].includes(f.id) && state[f.id].on); }
function buildSeqGrid(){
  const grid = document.getElementById('seqgrid'); if (!grid) return;
  const on = seqEffects();
  grid.innerHTML = on.length ? '' : `<div class="seqempty">Turn some effects on first.</div>`;
  on.forEach(f=>{
    const seq = state[f.id]._seq;
    const row = document.createElement('div'); row.className='seqrow'; row.dataset.fx=f.id;
    const cells = Array.from({length:SEQ_STEPS}, (_,i)=>{
      const active = !seq || seq[i];
      return `<button class="seqcell${active?' on':''}" data-fx="${f.id}" data-i="${i}" aria-label="${f.name} step ${i+1}"></button>`;
    }).join('');
    row.innerHTML = `<span class="seqname">${f.name}</span><div class="seqcells">${cells}</div>`;
    grid.appendChild(row);
  });
  updateSeqCount();
}
// HUD layout presets, expressed in the 5-slot / token format (tl tr c bl br). Tokens: {rec} blinking
// red dot, {date} {time} {ctr} tape counter, {n} newline. Picking a Preset fills the five text slots.
const HUD_PRESETS = {
  0:{tl:'{rec}REC',        tr:'',              c:'', bl:'',  br:''},
  1:{tl:'▶ PLAY',          tr:'',              c:'', bl:'',  br:''},
  2:{tl:'',                tr:'',              c:'', bl:'',  br:'{date}  {time}'},
  3:{tl:'{rec}REC',        tr:'{time}{n}SP',   c:'', bl:'▶', br:'{date}'},
  4:{tl:'CAM 01',          tr:'{rec}',         c:'', bl:'',  br:'{date} {time}'},
  5:{tl:'CH 3{n}VIDEO 1',  tr:'STEREO',        c:'', bl:'',  br:'{time}'},
  6:{tl:'▶ PLAY{n}SP',     tr:'{ctr}{n}STEREO',c:'', bl:'',  br:''},
  7:{tl:'{rec}ON AIR',     tr:'{time}',        c:'', bl:'',  br:'CH 4'},
};
function applyHudPreset(n){
  const p = HUD_PRESETS[n]; if (!p) return;
  for (const k of ['tl','tr','c','bl','br']) state.hud[k] = p[k];
}
function updateSeqCount(){
  const el = document.getElementById('seqcount'); if (!el) return;
  const n = FX.filter(f=> state[f.id]._seq).length;   // effects with a non-trivial pattern
  el.textContent = n ? n : '';
}
// tapping a cell: give the effect a pattern (all-on) on first touch, flip the cell, and drop the
// pattern back to null (always-on) if it ends up all-on again — keeps state and the share URL clean
function toggleSeqCell(id, i){
  let s = state[id]._seq;
  if (!s){ s = new Array(SEQ_STEPS).fill(true); state[id]._seq = s; }
  s[i] = !s[i];
  if (s.every(v=>v)) state[id]._seq = null;
  updateSeqCount();
}
// Hide the knobs the current selects render inert — a param declares a `show(state)` predicate in
// FX and the row follows it. Purely cosmetic: a hidden param keeps its value and still renders,
// so nothing here can change the picture.
const FX_BY_ID = {}; FX.forEach(f=> FX_BY_ID[f.id]=f);   // hoisted: updateRows runs on every drag
function updateRows(){
  controls.querySelectorAll('label.row[data-fx]').forEach(row=>{
    const f = FX_BY_ID[row.dataset.fx]; if (!f) return;
    const p = f.params.find(q=> q.k===row.dataset.param); if (!p) return;
    row.hidden = p.show ? !p.show(state[f.id]) : false;
  });
}
function applyPreset(name){
  const p = PRESETS[name];
  FX.forEach(f=>{
    const pp = p[f.id] || {};
    state[f.id].on = !!pp.on;
    state[f.id]._seq = (pp._seq && pp._seq.length) ? pp._seq.map(v=>!!v) : null;   // a preset may bake in a sequencer pattern
    // Anything the preset doesn't name goes back to the effect's default rather than keeping
    // whatever the user last had — otherwise a preset renders differently depending on what was
    // fiddled with before it was picked, and picking it twice gives two different looks.
    f.params.forEach(par=>{
      state[f.id][par.k] = pp[par.k] !== undefined ? pp[par.k] : par.def;
      if (par.env) state[f.id][par.k+'_env'] = pp[par.k+'_env'] !== undefined ? !!pp[par.k+'_env'] : !!par.envd;
    });
  });
  applyHudPreset(state.hud.layout|0);   // fill the text slots to match the preset's layout (on or off)
  syncUI();
}
function syncUI(){
  if ((state.mask.source|0)===0 && (state.mask.mode|0)===1) state.mask.source=6;
  controls.querySelectorAll('.fxtoggle').forEach(c=> c.checked = state[c.dataset.fx].on);
  controls.querySelectorAll('input[type=range]').forEach(r=>{
    r.value = state[r.dataset.fx][r.dataset.k];
    document.getElementById(`v-${r.dataset.fx}-${r.dataset.k}`).textContent = r.value;
  });
  controls.querySelectorAll('.fxsel').forEach(s=> s.value = state[s.dataset.fx][s.dataset.k]);
  controls.querySelectorAll('.fxtext').forEach(t=> t.value = state[t.dataset.fx][t.dataset.k]);
  controls.querySelectorAll('.envchk').forEach(c=> c.checked = !!state[c.dataset.fx][c.dataset.k+'_env']);
  controls.querySelectorAll('.fxlock').forEach(button=>{
    const locked = !!state[button.dataset.fx]._locked;
    button.classList.toggle('active', locked); button.textContent = locked ? '🔒' : '🔓';
  });
  updateRows();
  rebuildCodecs();
  updateCatCounts();
  if (document.querySelector('.seqcat.open')) buildSeqGrid();
  updateSeqCount();
}
// (re)build the real-byte codec frame pools for whatever is enabled. Their corruption is seeded off
// randomSeed, so this must also run whenever the Pattern Seed changes — not just on a param change.
function rebuildCodecs(){
  scheduleCodecPipeline();
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
    case 4: { const N=Math.max(1,Math.round(rate*4));         // stutter — stepped random
      return rand(Math.floor(phase*N)%N + 0.5); }             // %N: step 0 again at the loop point
    case 5: return phase<0.25 ? sm(phase/0.25) : phase>0.75 ? sm((1-phase)/0.25) : 1;  // swell — plateau peak
    case 6: { const b=0.18;                                  // drop → build — release then re-build (starts/ends high)
      return phase<b ? 1-sm(phase/b) : (t=>t*t*t)((phase-b)/(1-b)); }
    case 7: return Math.abs(Math.sin(Math.PI*phase*rate)) * hump(phase);   // bounce — decaying bounces within a peak
    case 8: { const N=Math.max(1,rate*3), seg=phase*N, i=Math.floor(seg)%N, j=(i+1)%N, t=seg-Math.floor(seg);
      const a=rand(i+0.5); return a+(rand(j+0.5)-a)*sm(t); }              // wander — smooth random
    case 9: { const N=Math.max(1,Math.round(rate)), seg=phase*N, i=Math.floor(seg)%N, u=seg-Math.floor(seg);
      const width=.08+.16*rand(i*4.7+1.3), center=.12+.76*rand(i*7.1+2.9), d=Math.abs(u-center);
      return d<width ? Math.pow(1-d/width,2) : 0; }                       // burst — narrow seeded impacts
    default: return hump(phase);
  }
}
// per-parameter envelope: only params whose ⓔ checkbox is on get modulated
let ENV = 1;
function envF(fx,k){ return (state.motion.on && state[fx][k+'_env']) ? ENV : 1; }
function P(fx,k){ return state[fx][k] * envF(fx,k); }
