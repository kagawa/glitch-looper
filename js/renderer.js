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
function rand(seed){ const x = Math.sin(seed*12.9898)*43758.5453; return x - Math.floor(x); }

// draw an image tiled so any offset wraps around (right edge re-enters from left)
function drawWrap(src, ox, oy, w, h){
  ox = ((ox % w) + w) % w;
  oy = ((oy % h) + h) % h;
  ctx.drawImage(src, ox-w, oy-h, w, h);
  ctx.drawImage(src, ox,   oy-h, w, h);
  ctx.drawImage(src, ox-w, oy,   w, h);
  ctx.drawImage(src, ox,   oy,   w, h);
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

function draw(phase){         // phase in [0,1)
  if (!img) return;
  const w = canvas.width, h = canvas.height;
  const t = phase * Math.PI * 2;

  const c = state.color, v = state.vhs, rl = state.roll, fm = state.film;
  const fr = Math.round(LOOP_MS/1000*30);      // frames per loop
  const fseed = Math.floor(phase*fr);          // per-frame seed (seamless)
  ENV = motionMul(phase);                      // destruction envelope (used by P/envF)

  // ---- base image into scratch canvas, with color/sepia filter ----
  let fp = [];
  if (c.on){ fp.push(`saturate(${c.saturate})`, `contrast(${c.contrast})`); if (c.hue) fp.push(`hue-rotate(${c.hue}deg)`); }
  if (fm.on && fm.sepia>0){ fp.push(`sepia(${fm.sepia})`); }
  // pick base image: real PNG glitch > real JPEG databend > real WebP databend > original
  let base = img;
  if (state.png.on && pngReady && pngFrames.length)
    base = pngFrames[Math.floor(phase*pngFrames.length) % pngFrames.length];
  else if (state.jpeg.on && jpegReady && jpegFrames.length)
    base = jpegFrames[Math.floor(phase*jpegFrames.length) % jpegFrames.length];
  else if (state.webp.on && webpReady && webpFrames.length)
    base = webpFrames[Math.floor(phase*webpFrames.length) % webpFrames.length];
  else if (state.gifg.on && gifgReady && gifgFrames.length)
    base = gifgFrames[Math.floor(phase*gifgFrames.length) % gifgFrames.length];
  tctx.clearRect(0,0,w,h);
  tctx.filter = fp.length ? fp.join(' ') : 'none';
  tctx.drawImage(base, 0, 0, w, h);
  tctx.filter = 'none';

  // ---- displacement: VHS wobble (selectable pattern — includes former film gate-weave = Jitter) ----
  let ox=0, oy=0;
  if (v.on && v.wobble>0){
    const A=v.wobble;
    switch (v.wobmode|0){
      case 1: {                                   // Pulse — periodic jolt that settles
        const n=3, u=(phase*n)%1, env=Math.exp(-u*7), pi=Math.floor(phase*n);
        ox=(rand(pi*1.7)*2-1)*A*env; oy=(rand(pi*2.9)*2-1)*A*0.5*env; break;
      }
      case 2:                                     // Jitter — nervous per-frame shake
        ox=(rand(fseed*1.3)*2-1)*A; oy=(rand(fseed*2.1)*2-1)*A*0.4; break;
      case 3: {                                   // Step — random positions held, jump per step
        const n=6, si=Math.floor(phase*n);
        ox=(rand(si*3.1)*2-1)*A; oy=(rand(si*4.7)*2-1)*A*0.4; break;
      }
      case 4:                                     // Drift — slow meander (snake)
        ox=A*(0.6*Math.sin(t)+0.4*Math.sin(t*2+1.3));
        oy=A*0.35*(0.6*Math.cos(t*1.5)+0.4*Math.sin(t*0.5)); break;
      default:                                    // Wave — smooth sine
        ox=Math.sin(t)*A; oy=Math.cos(t*2)*A*0.3;
    }
  }

  // ---- roll: wrap-around scroll (slides off one edge, back in the other) ----
  let rollX = 0, rollY = 0;
  if (rl.on){
    let hx = phase * rl.hspeed;
    if (rl.hstep>0){ const q = Math.max(1, Math.round(24*(1-rl.hstep))); hx = Math.round(hx*q)/q; }
    rollX = hx * w;
    rollY = phase * rl.vspeed * h;
  }

  // ---- overscan: zoom in just enough to cover the wobble jitter, so the
  //      shake never reveals the wrap seam. Roll keeps its intentional wrap
  //      (the zoomed frame is zw×zh wide, so wrapping at that period stays seamless). ----
  const wob = v.on ? v.wobble : 0, bld = v.on ? Math.ceil(v.bleed) : 0;
  const mX = (wob>0 || bld>0) ? wob + bld + 1 : 0;       // max |ox| = wobble + bleed
  const mY = (wob>0)          ? wob*0.5 + 1 : 0;         // max |oy| = up to 0.5·wobble
  const zoom = Math.min(1.4, 1 + 2*Math.max(mX/w, mY/h, 0));   // overscan ONLY to hide wobble wrap seams
  const zw = w*zoom, zh = h*zoom, baseX = -(zw-w)/2, baseY = -(zh-h)/2;   // (Zoom effect is applied last, post-FX)

  ctx.clearRect(0,0,w,h);

  // ---- VHS horizontal bleed ----
  if (v.on && v.bleed>0){
    ctx.globalCompositeOperation = 'lighter';
    const steps = Math.ceil(v.bleed);
    for (let i=1;i<=steps;i++){
      ctx.globalAlpha = 0.25*(1 - i/steps);
      drawWrap(tmp, baseX+ox+rollX+i, baseY+oy+rollY, zw, zh);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
  drawWrap(tmp, baseX+ox+rollX, baseY+oy+rollY, zw, zh);

  // clean plate for Region Mask: the pristine original image (so EVERY effect — incl. roll,
  // wobble, JPEG/PNG base-glitch, colour grade — is confined to the mask region).
  // Match the base's overscan scale (zw/zh) so the masked & unmasked regions never differ in size.
  if (state.mask.on){ mclean.width=w; mclean.height=h; mcx.clearRect(0,0,w,h); mcx.drawImage(img, baseX, baseY, zw, zh); }

  // ---- roll seam band (dark tear where the frame wraps) ----
  if (rl.on && rl.band>0 && rl.vspeed!==0){
    const seamY = (((baseY+oy+rollY) % zh)+zh)%zh;
    const bh = Math.max(3, h*0.05*rl.band);
    ctx.save();
    ctx.globalCompositeOperation='overlay';
    ctx.globalAlpha = 0.5*rl.band;
    for (let y=0;y<bh;y++){ ctx.fillStyle = rand(y+fseed)>.5?'#fff':'#000'; ctx.fillRect(0,(seamY-bh+y),w,1); }
    ctx.restore();
    ctx.fillStyle = `rgba(0,0,0,${0.35*rl.band})`;
    ctx.fillRect(0, seamY-bh, w, bh);
  }

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


// ---------- animation loop ----------
function frame(now){
  if (playing && img){
    const phase = ((now - startT) % LOOP_MS) / LOOP_MS;
    draw(phase);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
