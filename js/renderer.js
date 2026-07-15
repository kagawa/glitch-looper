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

  // ---- warp: per-row horizontal displacement (selectable pattern, wraps at edges) ----
  const wp = state.warp;
  if (wp.on && wp.amp>0){
    const amp = P('warp','amp'), fq = wp.freq*0.05, TAU=Math.PI*2, sp = phase*TAU*wp.speed;
    const mode = wp.warpmode|0;
    const pEnv = Math.abs(Math.sin(phase*Math.PI*3));            // Pulse: swell then settle (0 at ends)
    const tri = p => { const f=p-Math.floor(p); return 2*Math.abs(2*f-1)-1; };  // triangle wave
    const stepP = Math.floor(phase*Math.max(1,wp.speed)*3);      // Step/Jitter animation index
    const dxAt = y => {
      switch (mode){
        case 1: return Math.sin(y*fq)*amp*pEnv;                                   // Pulse
        case 2: return (rand(Math.floor(y/3) + stepP*7)*2-1)*amp;                 // Jitter (per-row shake)
        case 3: { const b=Math.floor((y/h)*10); return (rand(b*3.7 + stepP)*2-1)*amp; }  // Step (banded)
        case 4: return amp*(0.6*Math.sin(y*fq*0.5 + sp) + 0.4*Math.sin(y*fq*1.3 - sp*2)); // Drift
        case 5: return amp*((y/h)-0.5)*2*Math.sin(sp);                            // Twist (shear leans)
        case 6: return amp*0.5*(Math.sin(y*fq + sp) + Math.sin(y*fq*1.15 - sp));   // Beat (interference)
        case 7: return tri((y*fq + sp)/TAU)*amp;                                  // Zigzag (triangle)
        default: return Math.sin(y*fq + sp)*amp;                                  // Wave
      }
    };
    sc.width=w; sc.height=h; sctx.clearRect(0,0,w,h); sctx.drawImage(canvas,0,0);
    ctx.clearRect(0,0,w,h);
    for (let y=0;y<h;y++){
      const dx = dxAt(y);
      ctx.drawImage(sc, 0,y,w,1, dx-w,y,w,1);
      ctx.drawImage(sc, 0,y,w,1, dx,  y,w,1);
      ctx.drawImage(sc, 0,y,w,1, dx+w,y,w,1);
    }
  }

  // RGB channel shift — VHS aberration = horizontal, Slice RGB = vertical (distinct axes)
  const gl = state.glitch;
  const hAb  = v.on ? P('vhs','aberration')*(0.7+0.3*Math.sin(t)) : 0;   // horizontal shift (VHS)
  const vRGB = gl.on ? P('glitch','rgb') : 0;                            // vertical shift (Slice)
  if (hAb > 0.5 || vRGB > 0.5){
    const base = ctx.getImageData(0,0,w,h);
    const out = ctx.createImageData(w,h);
    const bd = base.data, od = out.data;
    const hs = Math.round(hAb), vs = Math.round(vRGB);
    for (let y=0;y<h;y++){
      for (let x=0;x<w;x++){
        const i=(y*w+x)*4;
        const rx = Math.min(w-1, x+hs), bx = Math.max(0, x-hs);   // R right / B left
        const ry = Math.min(h-1, y+vs), by = Math.max(0, y-vs);   // R down  / B up
        od[i]   = bd[(ry*w+rx)*4];      // R: horizontal + vertical
        od[i+1] = bd[i+1];             // G stays
        od[i+2] = bd[(by*w+bx)*4+2];   // B: opposite on both axes
        od[i+3] = 255;
      }
    }
    ctx.putImageData(out,0,0);
  }

  // ---- glitch: horizontal slice displacement ----
  if (gl.on && gl.amount>0){
    const slices = gl.slices;
    for (let i=0;i<slices;i++){
      // loop-seamless randomness: seed by slice + quantized phase steps
      const step = Math.floor(phase*slices*2);           // changes over loop, wraps
      const r = rand(i*7.1 + step);
      if (r > 1-Math.min(1, P('glitch','amount'))){
        const sy = Math.floor(h*i/slices);
        const sh = Math.ceil(h/slices)+1;
        const off = (rand(i*3.3+step)-0.5)*2*P('glitch','shift');
        const slice = ctx.getImageData(0,sy,w,sh);
        ctx.clearRect(0,sy,w,sh);
        ctx.putImageData(slice, off, sy);
      }
    }
  }

  // ---- datamosh: modern per-frame corruption ----
  if (state.mosh.on && state.mosh.intensity>0){
    const moshFrame = Math.floor(phase*state.mosh.rate);   // change rate: distinct states per loop
    applyMosh(w,h,moshFrame, envF('mosh','intensity'));
  }

  applyPixelate(w,h);

  // ---- feedback zoom: composite scaled copies of the current frame (droste tunnel) ----
  const fb = state.feedback;
  if (fb.on && fb.amount>0){
    sc.width=w; sc.height=h; sctx.clearRect(0,0,w,h); sctx.drawImage(canvas,0,0);
    const spin = fb.speed*360*phase;                          // whole tunnel rotation (integer → seamless)
    const pulse = 1 + fb.pulse*0.12*Math.sin(phase*Math.PI*2); // breathing zoom (seamless)
    for (let i=1;i<=5;i++){
      ctx.save();
      ctx.globalAlpha = fb.amount*Math.pow(0.75,i-1);
      ctx.translate(w/2,h/2); ctx.rotate((fb.rotate*i + spin)*Math.PI/180);
      const z=Math.pow(fb.zoom,i)*pulse; ctx.scale(z,z); ctx.translate(-w/2,-h/2);
      ctx.drawImage(sc,0,0);
      ctx.restore();
    }
  }

  // ---- melt: per-column pixel drip, breathes 0→max→0 over the loop (seamless) ----
  //      Drip = pixels smear down (top stretches); Wrap = drips off the bottom and re-enters the top,
  //      offsets exceed the height so columns can travel a full loop and come back.
  const ml = state.melt;
  if (ml.on && ml.amount>0){
    const amt=P('melt','amount'), wrap=(ml.mode|0)===1;
    const breathe = Math.max(0, envCurve(phase, ml.curve|0, ml.rate));   // Curve: how the melt evolves over the loop
    const span = amt*h*(wrap?1.0:0.6)*breathe;                   // Wrap can travel a full height and loop back
    const sexp = 0.3 + ml.spread*3;  // Spread: how the drip amount varies per column (low = uniform, high = a few long drips)
    const src=ctx.getImageData(0,0,w,h), out=ctx.createImageData(w,h), sd=src.data, od=out.data;
    for (let x=0;x<w;x++){
      const off=Math.floor(Math.pow(rand(x*0.13), sexp)*span);
      for (let y=0;y<h;y++){
        let sy = y - off;
        sy = wrap ? ((sy%h)+h)%h : (sy>=0?sy:0);                 // Wrap: mod h  ·  Drip: clamp to top
        const si=(sy*w+x)*4, di=(y*w+x)*4;
        od[di]=sd[si]; od[di+1]=sd[si+1]; od[di+2]=sd[si+2]; od[di+3]=255;
      }
    }
    ctx.putImageData(out,0,0);
  }

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

  // ---- Degauss: magnetised CRT — rainbow colour-purity patches (beams hit wrong phosphors).
  //      Breaks COLOUR, not geometry: G (luma) stays put, R/B fringe in blotchy zones. ----
  const dg = state.degauss;
  if (dg.on){
    const amt = P('degauss','amount');
    if (amt>0){
      const TAU=Math.PI*2;
      const amp = Math.sin(phase*Math.PI);              // disturbance rises then settles — 0 at both ends
      const str = amt*amp;
      if (str>0.004){
        const wob = phase*TAU*dg.freq;                  // shimmer / buzz
        const maxShift = str*(10 + 18*(0.4+0.6*dg.color));   // per-blob channel misconvergence (px)
        const a=TAU*2.5/w, b=TAU*1.9/h, cc=TAU*1.7/w, dd=TAU*2.7/h;
        const cX=x=>x<0?0:x>=w?w-1:x, cY=y=>y<0?0:y>=h?h-1:y;
        const src=ctx.getImageData(0,0,w,h), out=ctx.createImageData(w,h), sd=src.data, od=out.data;
        for (let y=0;y<h;y++){
          for (let x=0;x<w;x++){
            const fx=Math.sin(x*a + y*b + wob), fy=Math.sin(x*cc - y*dd - wob*0.8);
            const di=(y*w+x)*4;
            const rX=cX((x+fx*maxShift)|0), rY=cY((y+fy*maxShift)|0);
            const bX=cX((x-fx*maxShift)|0), bY=cY((y-fy*maxShift)|0);
            od[di]   = sd[(rY*w+rX)*4];        // R pulled one way
            od[di+1] = sd[di+1];               // G stays → picture doesn't sway
            od[di+2] = sd[(bY*w+bX)*4+2];      // B pulled the other → rainbow fringing
            od[di+3] = 255;
          }
        }
        ctx.putImageData(out,0,0);
        if (dg.color>0){                        // moving rainbow hue patches ("acid" purity error)
          ctx.save(); ctx.globalCompositeOperation='overlay';
          for (let k=0;k<3;k++){
            const bx=w*(0.15+0.7*(0.5+0.5*Math.sin(wob*0.7+k*2.1)));
            const by=h*(0.15+0.7*(0.5+0.5*Math.cos(wob*0.9+k*1.7)));
            const rad=Math.max(w,h)*(0.3+0.1*k);
            const hue=Math.round(phase*300 + k*120 + wob*24)%360;
            const g=ctx.createRadialGradient(bx,by,0,bx,by,rad);
            g.addColorStop(0,`hsla(${hue},100%,50%,${0.45*str*dg.color})`);
            g.addColorStop(1,'hsla(0,0%,50%,0)');
            ctx.fillStyle=g; ctx.fillRect(0,0,w,h);
          }
          ctx.restore();
        }
      }
    }
  }

  applyIndexedGif(w,h,phase);

  applySonify(w,h);

  applyByteShift(w,h);

  applyBitPlane(w,h);

  // ---- Ghosting: multipath echo — faint offset duplicate(s) of the picture ----
  const gh = state.ghost;
  if (gh.on){
    const gA = P('ghost','amount');
    if (gA>0){
      sc.width=w; sc.height=h; sctx.clearRect(0,0,w,h); sctx.drawImage(canvas,0,0);
      const ech = gh.echoes|0;
      const drawGhost = (off, aMul)=>{                // one ghost = its trailing echoes (+ pre-echo)
        for (let i=1;i<=ech;i++){ ctx.globalAlpha = gA*0.7*(1-(i-1)/(ech+0.5))*aMul; ctx.drawImage(sc, off*i, 0); }
        if (gh.pre>0){ ctx.globalAlpha = gA*0.4*gh.pre*aMul; ctx.drawImage(sc, -off*0.7, 0); }
      };
      ctx.save();
      if (gh.drift<=0){
        drawGhost(gh.offset, 1);                      // static ghost
      } else {
        // Continuous emission: each ghost slides outward ONE-WAY while fading in→out (no back-and-forth);
        // N instances staggered by a phase so as one dies another is born → no gap ("飛び飛び") in between.
        // dr scales how far it travels; amplitude reaches 0 at the cycle ends so the reset is invisible.
        const rate=gh.rate|0, dr=gh.drift, N=2;
        const ss=(lo,hi,x)=>{ if(x<=lo)return 0; if(x>=hi)return 1; const t=(x-lo)/(hi-lo); return t*t*(3-2*t); };
        const insts=[]; let tot=0;
        for (let n=0;n<N;n++){
          const u=((phase*rate)+n/N)%1;
          const amp = ss(0,0.08,u)*(1-ss(0.55,1,u));  // fade in fast → hold → fade to 0 by cycle end
          if (amp<=0.001) continue;
          insts.push({ amp, off: gh.offset*(1 + dr*(u*2.4 - 1)) });   // one-way slide (0…2.4× at dr=1)
          tot+=amp;
        }
        const norm = tot>1 ? 1/tot : 1;               // keep total ghost opacity constant (crossfade)
        for (const it of insts) drawGhost(it.off, it.amp*norm);
      }
      ctx.restore();
    }
  }

  // ---- Dot crawl: composite cross-colour — rainbow shimmer along vertical edges ----
  const dc = state.dotcrawl;
  if (dc.on){
    const dA = P('dotcrawl','amount');
    if (dA>0){
      const im = ctx.getImageData(0,0,w,h), d = im.data;
      const cell = dc.size|0 || 2;
      const crawl = Math.round(phase*dc.speed*2);     // integer steps → seamless checker shift
      for (let y=0;y<h;y++){
        const yc = Math.floor(y/cell);
        for (let x=1;x<w-1;x++){
          const i=(y*w+x)*4;
          const lL = d[i-4]*.3+d[i-3]*.59+d[i-2]*.11;
          const lR = d[i+4]*.3+d[i+5]*.59+d[i+6]*.11;
          const g = lR-lL;                             // signed horizontal luma gradient
          const ag = g<0?-g:g;
          if (ag>10){                                    // lower threshold → more edges shimmer
            const cb = ((Math.floor(x/cell)+yc+crawl)&1)?1:-1;
            const s = Math.min(1,(ag-10)/70)*dA*cb*(g<0?-1:1);   // saturates sooner → stronger
            const hueRow = (yc+crawl)%3;                // cycle opponent colour per row → rainbow
            if (hueRow===0){ d[i]+=s*165; d[i+2]-=s*165; }
            else if (hueRow===1){ d[i+1]+=s*165; d[i]-=s*120; d[i+2]-=s*120; }
            else { d[i+2]+=s*165; d[i]-=s*165; }
          }
        }
      }
      ctx.putImageData(im,0,0);
    }
  }

  // ---- Hum bar: soft dark band(s) rolling up the screen (mains hum) ----
  const hm = state.hum;
  if (hm.on){
    const hA = P('hum','amount');
    if (hA>0){
      const bandH = Math.max(8, h*(0.12+0.3*hm.width));
      const nRoll = Math.max(1, Math.round(hm.speed));
      const yc = (1-((phase*nRoll)%1))*h;              // rolls upward, integer wraps → seamless
      const dark = 0.6*hA;
      ctx.save();
      const band = cy=>{
        const g=ctx.createLinearGradient(0,cy-bandH/2,0,cy+bandH/2);
        g.addColorStop(0,'rgba(0,0,0,0)'); g.addColorStop(.5,`rgba(0,0,0,${dark})`); g.addColorStop(1,'rgba(0,0,0,0)');
        ctx.fillStyle=g; ctx.fillRect(0,cy-bandH/2,w,bandH);
      };
      band(yc); band(yc-h); band(yc+h);                // wrap copies
      ctx.restore();
    }
  }

  // ---- Herringbone: RF interference — moving diagonal weave ----
  const hb = state.herring;
  if (hb.on){
    const hbA = P('herring','amount');
    if (hbA>0){
      const T = Math.max(6, Math.round(28 - hb.freq*2));
      htile.width=T; htile.height=T; htx.clearRect(0,0,T,T);
      const nsp = Math.max(1, Math.round(hb.speed));
      const shp = ((phase*nsp)%1)*T;                   // diagonal drift, integer wraps → seamless
      htx.strokeStyle='#fff'; htx.lineWidth=T*0.32; htx.lineCap='square';
      // slope must be exactly -1 (shift -T over height T) so the diagonals line up across tiles;
      // extend past the edges by e along that same slope so the pattern stays continuous.
      const e=2;
      for (let o=-T;o<=2*T;o+=T){
        htx.beginPath(); htx.moveTo(o+shp+e, -e); htx.lineTo(o+shp-T-e, T+e); htx.stroke();
      }
      const pat = ctx.createPattern(htile,'repeat');
      ctx.save(); ctx.globalCompositeOperation='overlay'; ctx.globalAlpha=hbA*0.5;
      ctx.fillStyle=pat; ctx.fillRect(0,0,w,h); ctx.restore();
    }
  }

  // ---- Signal / Sync: horizontal-sync instability — per-scanline skew/drift/snap + flagging + bad contact ----
  const sg = state.sync;
  if (sg.on){
    const TAU=Math.PI*2, slip=sg.hsync, flagV=P('sync','flag'), ctc=P('sync','contact');
    if (slip!==0 || flagV>0){                        // per-scanline horizontal remap (wraps)
      const snaps=2, u=(phase*snaps)%1;
      const walk=slip*w*0.14*u, skew=slip*w*0.12*u, wob=slip*3, wobP=phase*TAU*6;
      const flagAmt=flagV*w*0.20, flagWave=1+0.3*Math.sin(phase*TAU*3);
      const wrapX=xx=>{ let m=xx%w; if(m<0)m+=w; return m|0; };
      const src=ctx.getImageData(0,0,w,h), out=ctx.createImageData(w,h), sd=src.data, od=out.data;
      for (let y=0;y<h;y++){
        const yy=y/h; let rShift=0;
        if (slip!==0) rShift += walk + skew*(yy-0.5)*2 + wob*Math.sin(y*0.25+wobP);
        if (flagV>0)  rShift += flagAmt*Math.exp(-yy/0.05)*flagWave;   // flagging: strong at top
        const row=y*w;
        for (let x=0;x<w;x++){ const di=(row+x)*4, gx=wrapX(x+rShift);
          od[di]=sd[(row+gx)*4]; od[di+1]=sd[(row+gx)*4+1]; od[di+2]=sd[(row+gx)*4+2]; od[di+3]=255; }
      }
      ctx.putImageData(out,0,0);
    }
    if (flagV>0){                                    // head-switching noise strip at the bottom
      const bandH=Math.max(3,Math.round(h*(0.03+0.02*flagV))), by=h-bandH;
      const sh=Math.round((rand(fseed*0.9+3.1)-0.35)*w*0.3*flagV);
      if (sh){ const band=ctx.getImageData(0,by,w,bandH); ctx.clearRect(0,by,w,bandH);
        ctx.putImageData(band,sh,by); ctx.putImageData(band,sh>0?sh-w:sh+w,by); }
      ctx.save(); ctx.globalAlpha=0.65*flagV;
      for (let yy=0;yy<bandH;yy++){ if (rand(yy*2.3+fseed)>.35){ ctx.fillStyle=rand(yy+fseed*1.7)>.5?'#e8e8e8':'#111'; ctx.fillRect(0,by+yy,w,1);} }
      ctx.restore();
    }
    if (ctc>0){                                      // bad contact: intermittent tears + static bursts
      const nb=2+Math.round(ctc*4);
      for (let b=0;b<nb;b++){
        const center=rand(b*4.7+1.3); let dph=Math.abs(phase-center); dph=Math.min(dph,1-dph);
        const win=0.015+ctc*0.035; if (dph>=win) continue;
        const amt=1-dph/win, bandH=Math.max(4,Math.round(h*0.04*(0.5+ctc))), by=Math.floor(rand(b*2.3)*(h-bandH));
        const shift=Math.round((rand(b*5.1+fseed)-0.5)*w*0.35*amt);
        if (shift){ const band=ctx.getImageData(0,by,w,bandH); ctx.clearRect(0,by,w,bandH);
          ctx.putImageData(band,shift,by); ctx.putImageData(band,shift>0?shift-w:shift+w,by); }
        ctx.save(); ctx.globalAlpha=0.55*amt;
        for (let yy=0;yy<bandH;yy++){ if (rand(yy*1.7+fseed+b)>.5){ ctx.fillStyle=rand(yy+fseed*1.3)>.5?'#fff':'#111'; ctx.fillRect(0,by+yy,w,1);} }
        ctx.restore();
        ctx.save(); ctx.globalCompositeOperation='overlay'; ctx.globalAlpha=0.22*amt;
        ctx.fillStyle=rand(b+fseed)>.5?'#fff':'#000'; ctx.fillRect(0,0,w,h); ctx.restore();
      }
    }
  }

  // ---- CRT tube: barrel geometry + RGB phosphor mask + scanlines + convergence + glow ----
  const cr = state.crt;
  const crPh = (cr.mask|0)>0 ? P('crt','phosphor') : 0;
  const crConv = P('crt','converge');
  const crActive = cr.on && (cr.amount>0 || crPh>0 || cr.scan>0 || crConv>0);
  if (crActive){
    const k = cr.amount*1.8, corner = cr.corner;
    const maskType = cr.mask|0;
    const sp = Math.max(1, Math.round(w/560));   // sub-pixel stripe width
    const period = 3*sp;                          // R-G-B phosphor triad period (px)
    const gLo = 1 - crPh;                         // darkness between phosphor stripes
    const gain = 1 + crPh*0.5;                    // brightness compensation for the mask
    const slotBrk = Math.max(1, Math.round(sp*0.6));
    const scanLo = 1 - cr.scan;
    const cvx = crConv * w * 0.03;                // max convergence offset (px), grows to edges
    const wrapX = xx => { let m=xx%w; if(m<0)m+=w; return m|0; };
    const src = ctx.getImageData(0,0,w,h), out = ctx.createImageData(w,h), sd = src.data, od = out.data;
    for (let y=0;y<h;y++){
      const cy = y/h - 0.5;
      const sw = cr.scan>0 ? ((y % 2) ? scanLo : 1) : 1;   // scanline gap every other row
      for (let x=0;x<w;x++){
        const cx = x/w - 0.5, r2 = cx*cx + cy*cy;
        const f = k ? 1 - k*r2 : 1;
        const sxf = (cx*f + 0.5)*w;
        const syf = (cy*f + 0.5)*h;
        const di = (y*w + x)*4;
        if (syf<0 || syf>=h){ od[di]=od[di+1]=od[di+2]=0; od[di+3]=255; continue; }
        const sy = syf|0;
        const co = cvx * cx * 2;                            // signed convergence (0 centre, ±cvx edge)
        const gx = wrapX(sxf);
        const rx = crConv>0 ? wrapX(sxf+co) : gx;
        const bx = crConv>0 ? wrapX(sxf-co) : gx;
        let R = sd[(sy*w+rx)*4], G = sd[(sy*w+gx)*4+1], B = sd[(sy*w+bx)*4+2];
        if (crPh>0){                                        // RGB phosphor mask
          const colIdx = (maskType===2)                    // shadow mask: stagger rows into a triad grid
            ? Math.floor((((x + sp*Math.floor(y/sp)) % period)+period)%period / sp)
            : Math.floor((x % period) / sp);
          const wR = colIdx===0?1:gLo, wG = colIdx===1?1:gLo, wB = colIdx===2?1:gLo;
          let br = 1;
          if (maskType===3 && (y % period) < slotBrk) br = gLo;   // slot mask: horizontal breaks
          R *= wR*br*gain; G *= wG*br*gain; B *= wB*br*gain;
        }
        let d = 1 - corner*r2*2.2; if (d<0) d=0;
        const m = sw*d;
        od[di]   = R*m>255?255:R*m;
        od[di+1] = G*m>255?255:G*m;
        od[di+2] = B*m>255?255:B*m;
        od[di+3] = 255;
      }
    }
    ctx.putImageData(out,0,0);
  }

  // ---- CRT phosphor glow (blurred highlights, screen-blended) ----
  if (cr.on){
    const gA = P('crt','glow');
    if (gA>0){
      sc.width=w; sc.height=h; sctx.clearRect(0,0,w,h);
      sctx.filter = `blur(${Math.max(2,w*0.006)}px) brightness(1.3)`;
      sctx.drawImage(canvas,0,0); sctx.filter='none';
      ctx.save(); ctx.globalCompositeOperation='screen'; ctx.globalAlpha=gA*0.6;
      ctx.drawImage(sc,0,0); ctx.restore();
    }
  }

  // ---- Region Mask: confine all the effects above to a rectangle; restore the pristine image outside it.
  //      (mclean = the untouched original = the "no-effect" plate.) ----
  const mk = state.mask;
  if (mk.on){
    let x0,x1,y0,y1;
    if ((mk.mode|0)===1){                                 // Roam: random rect, changes per loop step (seamless)
      const steps=Math.max(1,mk.interval|0), st=Math.floor(phase*steps);
      const sw=(0.2+rand(st*3.3+.1)*0.5)*w, sh=(0.2+rand(st*4.9+.6)*0.5)*h;
      x0=rand(st*1.1+.3)*(w-sw); y0=rand(st*2.7+.7)*(h-sh); x1=x0+sw; y1=y0+sh;
    } else {
      x0=Math.min(mk.x0,mk.x1)/100*w; x1=Math.max(mk.x0,mk.x1)/100*w;
      y0=Math.min(mk.y0,mk.y1)/100*h; y1=Math.max(mk.y0,mk.y1)/100*h;
    }
    const feath=mk.feather*Math.min(w,h)*0.12, inv=(mk.invert|0)===1;
    // build alpha shape: white where EFFECTS should show
    mshape.width=w; mshape.height=h; msx.clearRect(0,0,w,h);
    if (!inv){ msx.save(); if(feath>0) msx.filter=`blur(${feath}px)`; msx.fillStyle='#fff'; msx.fillRect(x0,y0,x1-x0,y1-y0); msx.restore(); }
    else { msx.fillStyle='#fff'; msx.fillRect(0,0,w,h);           // everything, then punch a soft hole
           msx.save(); msx.globalCompositeOperation='destination-out'; if(feath>0) msx.filter=`blur(${feath}px)`; msx.fillStyle='#000'; msx.fillRect(x0,y0,x1-x0,y1-y0); msx.restore(); }
    // effected copy, limited to the mask via its alpha
    sc.width=w; sc.height=h; sctx.clearRect(0,0,w,h); sctx.drawImage(canvas,0,0);
    sctx.globalCompositeOperation='destination-in'; sctx.drawImage(mshape,0,0); sctx.globalCompositeOperation='source-over';
    // clean base underneath, effected-in-mask on top
    ctx.clearRect(0,0,w,h); ctx.drawImage(mclean,0,0); ctx.drawImage(sc,0,0);
  }

  // ---- Zoom (applied LAST, after every effect): centre zoom-in on the finished frame ----
  if (state.zoom.on){
    const za = 1 + P('zoom','amount')*0.5;               // up to 1.5×
    if (za>1.001){
      sc.width=w; sc.height=h; sctx.clearRect(0,0,w,h); sctx.drawImage(canvas,0,0);
      const dw=w*za, dh=h*za;
      ctx.clearRect(0,0,w,h);
      ctx.drawImage(sc, -(dw-w)/2, -(dh-h)/2, dw, dh);   // centred
    }
  }

  // ---- HUD / text overlay (drawn last so it stays crisp) ----
  if (state.hud.on) drawHUD(w,h,phase);

  // ---- CRT screen bezel: bulged-rectangle (barrel) silhouette, not a plain round-rect ----
  if (cr.on && (cr.round>0 || cr.frame>0)){
    const inset = cr.frame * Math.min(w,h) * 0.14;
    ctx.save();
    ctx.fillStyle='#000';
    ctx.beginPath();
    ctx.rect(0,0,w,h);                                   // outer (full frame)
    crtScreenPath(ctx, inset, inset, w-2*inset, h-2*inset, cr.round);
    ctx.fill('evenodd');                                 // fill the gap → black bezel around the CRT screen
    ctx.restore();
  }
}
// CRT glass silhouette: big rounded corners + edges that bulge slightly outward.
// k=0 → plain rectangle, k=1 → full barrel "puffed rectangle".
function crtScreenPath(ctx, rx, ry, rw, rh, k){
  const em=0.03*k, cc=0.14*k;
  const X=u=>rx+u*rw, Y=v=>ry+v*rh;
  ctx.moveTo(X(cc), Y(em));
  ctx.quadraticCurveTo(X(0.5),  Y(-em),   X(1-cc), Y(em));    // top edge (bulges up)
  ctx.quadraticCurveTo(X(1-em), Y(em),    X(1-em), Y(cc));    // top-right corner
  ctx.quadraticCurveTo(X(1+em), Y(0.5),   X(1-em), Y(1-cc));  // right edge (bulges right)
  ctx.quadraticCurveTo(X(1-em), Y(1-em),  X(1-cc), Y(1-em));  // bottom-right corner
  ctx.quadraticCurveTo(X(0.5),  Y(1+em),  X(cc),   Y(1-em));  // bottom edge (bulges down)
  ctx.quadraticCurveTo(X(em),   Y(1-em),  X(em),   Y(1-cc));  // bottom-left corner
  ctx.quadraticCurveTo(X(-em),  Y(0.5),   X(em),   Y(cc));    // left edge (bulges left)
  ctx.quadraticCurveTo(X(em),   Y(em),    X(cc),   Y(em));    // top-left corner
  ctx.closePath();
}

// camcorder / security-cam style overlay
function drawHUD(w,h,phase){
  const hd=state.hud, base=Math.max(11, Math.round(h*0.035*hd.size));
  let pad=Math.round(base*0.8);
  // when the CRT bezel/curve is active, pull the HUD inside the screen so it isn't hidden under the bezel
  const cr=state.crt;
  if (cr.on){
    const bez = (cr.frame>0||cr.round>0) ? cr.frame*Math.min(w,h)*0.14 : 0;
    pad += Math.round(bez + cr.round*Math.min(w,h)*0.05);
  }
  const now=new Date(), p2=n=>String(n).padStart(2,'0');   // real-time clock
  const date=`${now.getFullYear()}-${p2(now.getMonth()+1)}-${p2(now.getDate())}`;
  const time=`${p2(now.getHours())}:${p2(now.getMinutes())}:${p2(now.getSeconds())}`;
  const recOn = Math.floor(phase*6)%2===0;                 // ~3 blinks per loop
  const col=['#ffffff','#ffb000','#33ff66','#ff3b30','#33e0ff','#000000'][hd.color]||'#fff';
  // VCR tape counter (advances with real time) — H:MM:SS
  const cs=Math.floor(now.getTime()/1000)%36000;
  const ctr=`${Math.floor(cs/3600)}:${p2(Math.floor(cs/60)%60)}:${p2(cs%60)}`;
  const setFont=s=>ctx.font=`${s}px ui-monospace, Menlo, monospace`;
  ctx.save();
  ctx.globalAlpha=hd.opacity;
  ctx.font=`${base}px ui-monospace, Menlo, monospace`;
  ctx.textBaseline='top'; ctx.textAlign='left';
  ctx.shadowColor='rgba(0,0,0,.85)'; ctx.shadowBlur=3; ctx.shadowOffsetY=1;
  const rec=(x,y)=>{ if(recOn){ ctx.fillStyle='#ff3b30'; ctx.beginPath(); ctx.arc(x+base*0.35,y+base*0.55,base*0.32,0,7); ctx.fill(); } ctx.fillStyle=col; ctx.fillText('REC', x+base, y); };
  ctx.fillStyle=col;
  switch(hd.layout){
    case 0: rec(pad,pad); break;
    case 1: ctx.fillText('▶ PLAY', pad, pad); break;
    case 2: ctx.textAlign='right'; ctx.fillText(`${date}  ${time}`, w-pad, h-pad-base); break;
    case 3:                                                 // Camcorder
      rec(pad,pad);
      ctx.textAlign='right';
      ctx.fillText(time, w-pad, pad);
      ctx.fillText('SP', w-pad, pad+base*1.25);
      ctx.fillText(`${date}`, w-pad, h-pad-base);
      ctx.textAlign='left'; ctx.fillText('▶', pad, h-pad-base);
      break;
    case 4:                                                 // Security cam
      ctx.fillText('CAM 01', pad, pad);
      rec(w-pad-base*3.2, pad);
      ctx.textAlign='right'; ctx.fillText(`${date} ${time}`, w-pad, h-pad-base);
      break;
    case 5:{                                                 // TV Channel (OSD on channel change)
      const big=Math.round(base*1.7);
      setFont(big); ctx.fillText('CH 3', pad, pad);
      setFont(base);
      ctx.fillText('VIDEO 1', pad, pad+big+base*0.25);
      ctx.textAlign='right';
      ctx.fillText('STEREO', w-pad, pad);
      ctx.fillText(time, w-pad, h-pad-base);
      break;
    }
    case 6:                                                  // VCR Play
      ctx.fillText('▶ PLAY', pad, pad);
      ctx.fillText('SP', pad, pad+base*1.3);
      ctx.textAlign='right';
      ctx.fillText(ctr, w-pad, pad);
      ctx.fillText('STEREO', w-pad, pad+base*1.3);
      break;
    case 7:                                                  // ON AIR / broadcast bug
      if(recOn){ ctx.fillStyle='#ff3b30'; ctx.beginPath(); ctx.arc(pad+base*0.35,pad+base*0.55,base*0.32,0,7); ctx.fill(); }
      ctx.fillStyle=col; ctx.fillText('ON AIR', pad+base, pad);
      ctx.textAlign='right';
      ctx.fillText(time, w-pad, pad);
      ctx.fillText('CH 4', w-pad, h-pad-base);
      break;
  }
  ctx.restore();
}

// ---------- datamosh: block smear + pixel sort + channel corruption ----------
// seed varies per frame; higher chaos = seed jumps more => different breakage each frame
function applyMosh(w,h,fseed,em=1){
  const m = state.mosh;
  const intensity = m.intensity*em;
  const seed = Math.floor(fseed*(1+m.chaos*4)) + 1;
  const id = ctx.getImageData(0,0,w,h);
  const d = id.data;
  const src = new Uint8ClampedArray(d);        // snapshot to read from

  // 1) block displacement (datamosh smear)
  if (m.blocks>0){
    const n = Math.floor(1 + m.blocks*10*intensity);
    for (let k=0;k<n;k++){
      const bw = Math.max(4, Math.floor((0.08+0.35*rand(seed*3.1+k))*w));
      const bh = Math.max(2, Math.floor((0.02+0.14*rand(seed*5.7+k))*h));
      const sx = Math.floor(rand(seed*9.3+k)*(w-bw));
      const sy = Math.floor(rand(seed*1.7+k)*(h-bh));
      const dxo = Math.floor((rand(seed*2.2+k)-0.5)*w*intensity);
      for (let y=0;y<bh;y++){
        for (let x=0;x<bw;x++){
          const tx = sx+x+dxo;
          if (tx<0||tx>=w) continue;
          const si=((sy+y)*w+sx+x)*4, ti=((sy+y)*w+tx)*4;
          d[ti]=src[si]; d[ti+1]=src[si+1]; d[ti+2]=src[si+2];
        }
      }
    }
  }

  // 2) pixel sort (random horizontal bands sorted by luminance)
  if (m.sort>0){
    const segs = Math.floor(1 + m.sort*7*intensity);
    for (let k=0;k<segs;k++){
      const y0 = Math.floor(rand(seed*4.4+k)*h);
      const band = 2 + Math.floor(rand(seed*6.1+k)*4);
      const x0 = Math.floor(rand(seed*6.6+k)*w*0.6);
      const x1 = Math.min(w, x0 + Math.floor((0.2+0.5*rand(seed*8.8+k))*w));
      for (let yy=y0; yy<Math.min(h,y0+band); yy++){
        const arr=[];
        for (let x=x0;x<x1;x++){ const i=(yy*w+x)*4; arr.push([d[i],d[i+1],d[i+2], d[i]*0.3+d[i+1]*0.59+d[i+2]*0.11]); }
        arr.sort((a,b)=>a[3]-b[3]);
        for (let x=x0;x<x1;x++){ const i=(yy*w+x)*4,p=arr[x-x0]; d[i]=p[0]; d[i+1]=p[1]; d[i+2]=p[2]; }
      }
    }
  }

  // 3) channel corruption (shift a single RGB channel on random rows)
  const bands = Math.floor(m.chaos*6*intensity);
  for (let k=0;k<bands;k++){
    const y0 = Math.floor(rand(seed*7.7+k)*h);
    const bh = Math.floor((0.01+0.05*rand(seed*3.9+k))*h)+1;
    const ch = Math.floor(rand(seed*5.5+k)*3);
    const sh = Math.floor((rand(seed*2.1+k)-0.5)*80);
    for (let y=y0;y<Math.min(h,y0+bh);y++){
      for (let x=0;x<w;x++){
        const sx=Math.max(0,Math.min(w-1,x+sh));
        d[(y*w+x)*4+ch]=src[(y*w+sx)*4+ch];
      }
    }
  }

  ctx.putImageData(id,0,0);
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
