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

function applyMelt(w,h,phase){
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
}
