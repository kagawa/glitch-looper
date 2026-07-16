function applyWarp(w,h,phase){
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
}

function applySliceGlitch(w,h,phase,gl){
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
}

function applyFeedbackZoom(w,h,phase){
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
}

// ---- melt: pixel drip, breathes 0→max→0 over the loop (seamless) ----
//      Drip = pixels smear down (top stretches)
//      Wrap = drips off the bottom and re-enters the top, so a column can travel a full height
function applyMelt(w,h,phase){
const ml = state.melt;
if (ml.on && ml.amount>0){
  const amt=P('melt','amount'), wrap=(ml.mode|0)===1;
  const breathe = Math.max(0, envCurve(phase, ml.curve|0, ml.rate));   // Curve: how the melt evolves over the loop
  const span = amt*h*(wrap?1.0:0.6)*breathe;                   // Wrap can travel a full height and loop back
  const sexp = 0.3 + ml.spread*3;  // Spread: how the drip amount varies per band (low = uniform, high = a few long drips)
  const bwAvg = Math.max(1, ml.width|0);
  const src=ctx.getImageData(0,0,w,h), out=ctx.createImageData(w,h), sd=src.data, od=out.data;
  meltBands(w,h,span,sexp,bwAvg,wrap,sd,od);
  ctx.putImageData(out,0,0);
}
}
// Every column of a band is displaced downward by one amount, so the drip front is a smooth hump.
// Bands stay narrow (max 16px) — past that the hump reads as a shape rather than as liquid.
function meltBands(w,h,span,sexp,bwAvg,wrap,sd,od){
  // map each column to a band + its distance from that band's peak. Band widths and peak
  // positions vary, otherwise the humps line up into a comb. Width 1 = one band per column
  // (bandE 0 → taper 1.0 → identical to the original per-column drip).
  const bandOf = new Int32Array(w), bandE = new Float32Array(w);
  if (bwAvg===1){ for (let x=0;x<w;x++){ bandOf[x]=x; bandE[x]=0; } }
  else {
    for (let bi=0, x0=0; x0<w; bi++){
      const bw = Math.max(1, Math.round(bwAvg*(0.5+rand(bi*2.7))));   // 0.5x–1.5x → averages bwAvg
      const x1 = Math.min(w, x0+bw);
      const c = 0.5 + (rand(bi*4.1)-0.5)*0.5;                          // peak sits off-centre
      for (let x=x0;x<x1;x++){
        bandOf[x]=bi;
        const t=(x-x0+0.5)/(x1-x0);
        bandE[x]=(t-c)/Math.max(c,1-c);                                // -1..1, 0 at the peak
      }
      x0=x1;
    }
  }
  for (let x=0;x<w;x++){
    // surface tension: the peak of a band runs furthest, the edges lag
    const e=bandE[x], bulge=1-e*e;
    const off=Math.floor(Math.pow(rand(bandOf[x]*0.13), sexp)*span*(0.55+0.45*bulge));
    for (let y=0;y<h;y++){
      let sy = y - off;
      sy = wrap ? ((sy%h)+h)%h : (sy>=0?sy:0);                 // Wrap: mod h  ·  Drip: clamp to top
      const si=(sy*w+x)*4, di=(y*w+x)*4;
      od[di]=sd[si]; od[di+1]=sd[si+1]; od[di+2]=sd[si+2]; od[di+3]=255;
    }
  }
}
function applyRgbShift(w,h,t,v){
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
  return gl;
}
