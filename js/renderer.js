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

// What everything else calls. It is a plain pass-through today; it exists as the one place a
// temporal effect can live — frame drop, trails, a starved-bitrate hold — because those need to
// reach across frames and drawFrame() deliberately cannot. Putting them inside drawFrame would
// recurse; putting them in each caller would mean the preview, the MP4 and the GIF each doing it
// their own way, on three different frame grids (rAF / 30fps / 20fps).
function draw(phase){
  drawFrame(phase);
}
