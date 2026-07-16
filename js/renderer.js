// ---------- canvas / rendering ----------
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d', { willReadFrequently:true });
const tmp = document.createElement('canvas');
const tctx = tmp.getContext('2d', { willReadFrequently:true });
const sc = document.createElement('canvas');                 // scratch for warp/pixelate
const sctx = sc.getContext('2d', { willReadFrequently:true });
const htile = document.createElement('canvas');              // small tile for herringbone pattern
const htx = htile.getContext('2d');
const gsrc = document.createElement('canvas');               // small sampler for GIF palette
const gctx = gsrc.getContext('2d', { willReadFrequently:true });
const tacc = document.createElement('canvas');               // Time: trail accumulator (draw() only,
const tax = tacc.getContext('2d');                           //   so drawFrame can't clobber it)
const iacc = document.createElement('canvas');               // Interlace: the lagging field's moment
const iax = iacc.getContext('2d');
const bacc = document.createElement('canvas');               // Stale Blocks: the frame being assembled
const bax = bacc.getContext('2d');
const sacc = document.createElement('canvas');               // Sync Tear: the torn frame assembled
const sax = sacc.getContext('2d');
const mshape = document.createElement('canvas');             // region-mask alpha shape
const msx = mshape.getContext('2d');
const mclean = document.createElement('canvas');             // region-mask clean plate (base, pre-glitch)
const mcx = mclean.getContext('2d');

// GIF indexed-colour palette, cached (rebuilt on image/colour-count change) — a single global table
let gifPal=null, gifMapper=null, gifKey='';
function ensureGifPalette(n){
  const key=String(n);
  if (gifKey===key && gifPal) return;
  const S=72; gsrc.width=S; gsrc.height=S; gctx.clearRect(0,0,S,S); gctx.drawImage(img,0,0,S,S);
  const d=gctx.getImageData(0,0,S,S).data, samp=[];
  for (let i=0;i<d.length;i+=4) samp.push([d[i],d[i+1],d[i+2]]);
  gifPal=medianCut(samp,n); while(gifPal.length<2) gifPal.push([0,0,0]);
  gifMapper=makeMapper(gifPal); gifKey=key;
}

// deterministic pseudo-random keyed on loop phase so recordings are seamless
let randomSeed = Math.floor(Math.random()*1_000_000), seedLocked = false;
function rand(seed){ const x = Math.sin((seed+randomSeed)*12.9898)*43758.5453; return x - Math.floor(x); }

// stream PRNG (mulberry32) for the real-byte codecs. rand() is a stateless hash meant for
// per-pixel/per-row lookups; the codecs instead consume a long *sequence* of numbers, so each
// build takes its own generator seeded off randomSeed + a tag. Same seed + same params ->
// byte-identical corruption, so a fixed Pattern Seed now holds the databending too.
const RNG_TAG = { jpeg:1, png:2, webp:3, gifg:4 };
function makeRng(tag){
  let s = (randomSeed + Math.imul(tag, 2654435761)) >>> 0;
  return ()=>{ s = (s + 0x6D2B79F5)|0;
    let t = Math.imul(s ^ (s>>>15), 1|s);
    t = (t + Math.imul(t ^ (t>>>7), 61|t)) ^ t;
    return ((t ^ (t>>>14))>>>0) / 4294967296; };
}

// draw an image tiled so any offset wraps around (right edge re-enters from left)
function drawWrap(src, ox, oy, w, h){
  ox = ((ox % w) + w) % w;
  oy = ((oy % h) + h) % h;
  ctx.drawImage(src, ox-w, oy-h, w, h);
  ctx.drawImage(src, ox,   oy-h, w, h);
  ctx.drawImage(src, ox-w, oy,   w, h);
  ctx.drawImage(src, ox,   oy,   w, h);
}



// Render one frame of the loop. Pure in the sense that matters: hand it a phase and it paints that
// phase, with no memory of the frame before it. Everything downstream leans on that — the preview
// jumps to whatever phase the wall clock says, and the exporters walk their own frame grids.
// Nothing outside should call this directly; call draw() below.
function drawFrame(phase){    // phase in [0,1)
  if (!img) return;
  const w = canvas.width, h = canvas.height;
  const t = phase * Math.PI * 2;

  const c = state.color, v = state.vhs, rl = state.roll, fm = state.film;
  const fr = Math.round(LOOP_MS/1000*30);      // frames per loop
  const fseed = Math.floor(phase*fr);          // per-frame seed (seamless)
  ENV = motionMul(phase);                      // destruction envelope (used by P/envF)

  drawBaseFrame(w,h,phase,t,c,v,rl,fm,fseed);

  applyWarp(w,h,phase);

  const gl = applyRgbShift(w,h,t,v);

  applySliceGlitch(w,h,phase,gl);

  // ---- datamosh: modern per-frame corruption ----
  if (state.mosh.on && state.mosh.intensity>0){
    const moshFrame = Math.floor(phase*state.mosh.rate);   // change rate: distinct states per loop
    applyMosh(w,h,moshFrame, envF('mosh','intensity'));
  }

  applyPixelate(w,h);

  applyFeedbackZoom(w,h,phase);

  applyMelt(w,h,phase);

  applyExtrude(w,h);

  applyHalftone(w,h);

  applyEmboss(w,h);

  applyPosterize(w,h);

  applySolarize(w,h);

  applyDuotone(w,h);

  applyTracking(w,h,phase,v);

  applyNoise(w,h,phase);

  applyFilm(w,h,fm,fseed);

  applyBloom(w,h);

  applyScanlines(w,h,v);

  applyColorGrade(w,h,c);

  applyCompression(w,h);

  applyPixelSort(w,h);

  applyDatabendShift(w,h,phase);

  applyBmpRowMisread(w,h);

  applyDegauss(w,h,phase);

  applyIndexedGif(w,h,phase);

  applySonify(w,h);

  applyByteShift(w,h);

  applyBitPlane(w,h);

  applyGhosting(w,h,phase);

  applyDotCrawl(w,h,phase);

  applyHumBar(w,h,phase);

  applyHerringbone(w,h,phase);

  applySignalSync(w,h,phase,fseed);

  const cr = applyCrtTube(w,h);

  applyRegionMask(w,h,phase);

  applyFinalZoom(w,h);

  // ---- HUD / text overlay (drawn last so it stays crisp) ----
  if (state.hud.on) drawHUD(w,h,phase);

  applyCrtBezel(w,h,cr);
}

// ---- Time: the one stage that works on the footage rather than on a frame ----
// Which frame a given moment actually shows, once frames have been held and dropped. Deliberately a
// function of the frame index alone and nothing else: no memory, no accumulator. That is what lets
// the preview (rAF), the MP4 (30fps) and the GIF (20fps) all agree — each samples this same 90-frame
// grid at its own rate and gets the same answer, where anything stateful would drift apart.
function timeFrame(fi, NF, drop){
  const tm = state.time;
  const wrap = k => ((k % NF) + NF) % NF;
  let e = wrap(fi);
  const hold = Math.max(1, tm.hold|0);
  if (hold>1) e -= e % hold;                  // hold divides NF, so no short group at the seam
  if (drop>0){
    // Walk back to the last frame that wasn't dropped. Seeded on the WRAPPED index, or the pattern
    // would break where the loop meets itself — rand(-1) is not rand(89). The guard has to span the
    // whole loop: cut it short and every frame walks back the same fixed number of steps, which is
    // a bijection — the footage just shifts in time instead of losing anything. Drop tops out below
    // 1 so the walk terminates on merit rather than on the guard.
    const slots = Math.ceil(NF/hold);
    let k=e, guard=0;
    while (rand(wrap(k)*3.7+0.5) < drop && guard++ < slots) k -= hold;
    e = wrap(k);
  }
  return e;
}
// What everything else calls: drawFrame plus the Time stage. A temporal effect cannot live inside
// drawFrame (it would recurse) and should not live in the callers (the preview, the MP4 and the GIF
// would each do it their own way, on three different frame grids).
function draw(phase){
  const NF = Math.round(LOOP_MS/1000*30);
  const tm = state.time, il = state.interlace, st = state.stale;
  const sy0 = state.synctear;
  const timeOn  = tm.on && (tm.hold>1 || tm.drop>0 || tm.trail>0);
  const ilOn    = il.on && il.amount>0;
  const staleOn = st.on && st.amount>0;
  const syncOn0 = sy0.on && sy0.amount>0;
  // nothing temporal is on → keep the raw, unquantised phase rather than snapping to the frame grid
  if (!timeOn && !ilOn && !staleOn && !syncOn0){ drawFrame(phase); return; }
  // P() reads the ENV that drawFrame sets for the frame it is painting — the wrong one to ask here,
  // and for trails it belongs to a frame further back in time. Take the envelope for the moment
  // being shown instead. Clamped because motionMul peaks above 1: an unclamped Trails would weigh
  // the older frames heavier than the newest and run the smear backwards.
  const env = state.motion.on ? motionMul(phase) : 1;
  const pv = (fx,k,hi) => Math.max(0, Math.min(hi, state[fx][k] * (state[fx][k+'_env'] ? env : 1)));
  const fi = Math.floor(phase*NF);
  const drop  = timeOn ? pv('time','drop', .9) : 0;
  const trail = timeOn ? pv('time','trail', 1) : 0;
  const w = canvas.width, h = canvas.height;
  // The footage at one display frame: Time's transport, plus its trails. Anything that needs a
  // second moment in time just asks for another one — no history buffer, because drawFrame will
  // paint any phase on demand. The price is a render, which is why these stack multiplicatively.
  const moment = (f)=>{
    if (!timeOn){ drawFrame((((f%NF)+NF)%NF)/NF); return; }
    const K = trail>0 ? Math.max(2, tm.trailn|0) : 1;
    if (K<=1){ drawFrame(timeFrame(f,NF,drop)/NF); return; }
    // Trails as a plain weighted average — no running buffer. It needs no warm-up, it is the same
    // on every frame grid, and it closes the loop by itself because the frames it reaches wrap.
    const gap = Math.max(1, tm.gap|0);        // how far back each step reaches, in frames
    const wts=[]; for (let k=0;k<K;k++) wts.push(Math.pow(trail,k));    // newest 1, older decaying
    tacc.width=w; tacc.height=h; tax.clearRect(0,0,w,h);
    let S=0;
    for (let k=K-1;k>=0;k--){                 // oldest first, folding each into a running average
      drawFrame(timeFrame(f-k*gap,NF,drop)/NF);
      S += wts[k];
      tax.globalAlpha = wts[k]/S;             // incremental weighted mean → alpha 1 on the first
      tax.drawImage(canvas,0,0);
    }
    tax.globalAlpha = 1;
    ctx.clearRect(0,0,w,h); ctx.drawImage(tacc,0,0);
  };
  // ---- Stale Blocks: what a starved stream looks like ----
  // A decoder short of data doesn't refresh every block, so parts of the picture sit on an older
  // frame while the rest moves on. The lag is fixed per block rather than re-rolled every frame:
  // re-rolling makes noise, fixing it makes the damage sit somewhere you can see. That also keeps
  // it a pure function of the block's coordinates — no buffer, no warm-up. It re-rolls on its own
  // schedule instead, so blocks freeze, catch up, and others freeze.
  const footage = (f)=>{
    if (!staleOn){ moment(f); return; }
    const amt = pv('stale','amount',1);
    const bs = Math.max(4, st.block|0), steps = Math.max(1, Math.min(3, st.steps|0));
    const age = Math.max(1, st.age|0);
    const pat = Math.floor((((f%NF)+NF)%NF) * Math.max(1,st.rate|0) / NF);   // which re-roll we are in
    const nbx = Math.ceil(w/bs), nby = Math.ceil(h/bs);
    // which lag each block is stuck at: 0 = keeping up, 1..steps = that many ages behind
    const lvl = new Uint8Array(nbx*nby);
    for (let by=0;by<nby;by++) for (let bx=0;bx<nbx;bx++){
      if (rand(pat*7.1 + bx*0.37 + by*2.13) >= amt) continue;     // this block is keeping up
      lvl[by*nbx+bx] = 1 + Math.floor(rand(pat*3.3 + bx*1.7 + by*0.91)*steps);
    }
    moment(f);                                   // the blocks that are keeping up
    bacc.width=w; bacc.height=h; bax.clearRect(0,0,w,h); bax.drawImage(canvas,0,0);
    for (let l=1;l<=steps;l++){
      if (!lvl.includes(l)) continue;            // nothing is stuck this far back — skip the render
      moment(f - Math.round(age*l/steps));
      for (let by=0;by<nby;by++) for (let bx=0;bx<nbx;bx++){
        if (lvl[by*nbx+bx]!==l) continue;
        const x=bx*bs, y=by*bs, bw=Math.min(bs,w-x), bh=Math.min(bs,h-y);
        bax.drawImage(canvas, x,y,bw,bh, x,y,bw,bh);
      }
    }
    ctx.clearRect(0,0,w,h); ctx.drawImage(bacc,0,0);
  };
  // ---- Sync Tear: the raster torn where the signal lost horizontal lock ----
  // The frame breaks into a few horizontal bands, each grabbed at a slightly different moment and
  // slid sideways — the picture doesn't just lag in places, it steps left or right at the tear,
  // the way a broadcast looks when the sync is failing. Where the tears sit re-rolls on a schedule.
  const sy = state.synctear;
  const syncOn = sy.on && sy.amount>0;
  const torn = (f)=>{
    if (!syncOn){ footage(f); return; }
    const amt = pv('synctear','amount',1);
    const nT = Math.max(1, sy.tears|0), maxD = Math.max(0, sy.delay|0), maxS = sy.shift|0;
    const pat = Math.floor((((f%NF)+NF)%NF) * Math.max(1,sy.rate|0) / NF);
    // band boundaries down the frame, jittered per re-roll window; each band its own lag + shift
    const ys=[0]; for (let i=1;i<nT;i++) ys.push(Math.round(h*i/nT + (rand(pat*5.3+i*1.7)-0.5)*(h/nT)*0.7));
    ys.push(h); ys.sort((a,b)=>a-b);
    const band=[];
    for (let i=0;i<nT;i++){
      const lag = Math.round(rand(pat*2.1+i*3.7)*maxD*amt);           // amt scales both, so amt 0 = clean
      const sh  = Math.round((rand(pat*8.9+i*0.53)*2-1)*maxS*amt);
      band.push({ y0:ys[i], y1:ys[i+1], lag, sh });
    }
    sacc.width=w; sacc.height=h; sax.clearRect(0,0,w,h);
    for (const lag of [...new Set(band.map(b=>b.lag))]){              // render each distinct lag once
      footage(f-lag);
      for (const b of band){
        const bh=b.y1-b.y0; if (b.lag!==lag || bh<=0) continue;
        const shf=((b.sh%w)+w)%w;                                     // horizontal slide, wrapped
        sax.drawImage(canvas, 0,b.y0,w-shf,bh, shf,b.y0,w-shf,bh);
        if (shf>0) sax.drawImage(canvas, w-shf,b.y0,shf,bh, 0,b.y0,shf,bh);
      }
    }
    ctx.clearRect(0,0,w,h); ctx.drawImage(sacc,0,0);
  };
  if (!ilOn){ torn(fi); return; }
  // ---- Interlace: the two fields were never scanned at the same instant ----
  // A field carries every other line and is grabbed a moment after the other, so anything that
  // moved between them lands in a different place on each — which is why the tell is teeth along
  // moving edges, and why a still part of the picture stays perfectly clean. Paint both moments
  // and weave them.
  const amt = pv('interlace','amount',1);
  torn(fi - Math.max(1, il.delay|0));         // the field that lags
  iacc.width=w; iacc.height=h; iax.clearRect(0,0,w,h); iax.drawImage(canvas,0,0);
  torn(fi);                                   // the field that leads
  const th = Math.max(1, il.thick|0);
  const lagParity = (il.swap|0)===0 ? 1 : 0;
  ctx.globalAlpha = amt;
  for (let y=0;y<h;y+=th){
    if ((((y/th)|0) & 1) !== lagParity) continue;
    const bh = Math.min(th, h-y);
    ctx.drawImage(iacc, 0,y,w,bh, 0,y,w,bh);
  }
  ctx.globalAlpha = 1;
}
