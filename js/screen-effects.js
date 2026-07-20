function applyCrtTube(w,h){
// ---- CRT tube: barrel geometry + RGB phosphor mask + scanlines + convergence + glow ----
const cr = state.crt;
const crPh = (cr.mask|0)>0 ? P('crt','phosphor') : 0;
const crConv = P('crt','converge');
const crActive = cr.on && (cr.amount>0 || crPh>0 || cr.scan>0 || crConv>0);
if (crActive){
  const k = cr.amount*cr.amount*2.6, corner = cr.corner;   // squared response: gentle at the low end, stronger (and further) at the top
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
  return cr;
}

function applyRegionMask(w,h,phase){
// ---- Region Mask: confine all the effects above to a rectangle; restore the pristine image outside it.
//      (mclean = the untouched original = the "no-effect" plate.) ----
const mk = state.mask;
if (mk.on){
  const feath=mk.feather*Math.min(w,h)*0.12, inv=(mk.invert|0)===1;
  mshape.width=w; mshape.height=h; msx.clearRect(0,0,w,h);
  if ((mk.source|0)===0 || (mk.source|0)===6){
    let x0,x1,y0,y1;
    if ((mk.source|0)===6 || (mk.mode|0)===1){
      const steps=Math.max(1,mk.interval|0), st=Math.floor(phase*steps);
      const sw=(0.2+rand(st*3.3+.1)*0.5)*w, sh=(0.2+rand(st*4.9+.6)*0.5)*h;
      x0=rand(st*1.1+.3)*(w-sw); y0=rand(st*2.7+.7)*(h-sh); x1=x0+sw; y1=y0+sh;
    } else {
      x0=Math.min(mk.x0,mk.x1)/100*w; x1=Math.max(mk.x0,mk.x1)/100*w;
      y0=Math.min(mk.y0,mk.y1)/100*h; y1=Math.max(mk.y0,mk.y1)/100*h;
    }
    if (!inv){ msx.fillStyle='#fff'; msx.fillRect(x0,y0,x1-x0,y1-y0); }
    else { msx.fillStyle='#fff'; msx.fillRect(0,0,w,h); msx.globalCompositeOperation='destination-out'; msx.fillRect(x0,y0,x1-x0,y1-y0); msx.globalCompositeOperation='source-over'; }
  } else {
    msx.drawImage(mclean,0,0);
    const source=msx.getImageData(0,0,w,h), pixels=source.data, luma=new Float32Array(w*h), threshold=mk.threshold;
    for(let i=0,p=0;i<pixels.length;i+=4,p++) luma[p]=(pixels[i]*.299+pixels[i+1]*.587+pixels[i+2]*.114)/255;
    const smooth=(a,b,x)=>{ if(b<=a) return x>=b?1:0; const t=Math.max(0,Math.min(1,(x-a)/(b-a))); return t*t*(3-2*t); };
    const kind=mk.source|0;
    for(let y=0;y<h;y++) for(let x=0;x<w;x++){
      const p=y*w+x, lum=luma[p]; let alpha=0;
      if(kind===1) alpha=1-smooth(Math.max(0,threshold-.2),Math.min(1,threshold+.2),lum);
      else if(kind===2) alpha=Math.max(0,1-Math.abs(lum-threshold)/.3);
      else if(kind===3) alpha=smooth(Math.max(0,threshold-.2),Math.min(1,threshold+.2),lum);
      else if(kind===4){ const right=luma[y*w+Math.min(w-1,x+1)], down=luma[Math.min(h-1,y+1)*w+x], edge=Math.min(1,(Math.abs(lum-right)+Math.abs(lum-down))*5); alpha=smooth(threshold,Math.min(1,threshold+.25),edge); }
      else alpha=rand((x>>3)+(y>>3)*997+Math.floor(phase*Math.max(1,mk.interval))*131)>threshold?1:0;
      pixels[p*4]=pixels[p*4+1]=pixels[p*4+2]=255; pixels[p*4+3]=Math.round(255*(inv?1-alpha:alpha));
    }
    msx.putImageData(source,0,0);
  }
  if(feath>0){
    sc.width=w; sc.height=h; sctx.clearRect(0,0,w,h); sctx.filter=`blur(${feath}px)`; sctx.drawImage(mshape,0,0); sctx.filter='none';
    msx.clearRect(0,0,w,h); msx.drawImage(sc,0,0);
  }
  // effected copy, limited to the mask via its alpha
  sc.width=w; sc.height=h; sctx.clearRect(0,0,w,h); sctx.drawImage(canvas,0,0);
  sctx.globalCompositeOperation='destination-in'; sctx.drawImage(mshape,0,0); sctx.globalCompositeOperation='source-over';
  // clean base underneath, effected-in-mask on top
  ctx.clearRect(0,0,w,h); ctx.drawImage(mclean,0,0); ctx.drawImage(sc,0,0);
}
}

function applyFinalZoom(w,h){
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
}

// shared flat-colour palette for Sparkle / Burst (index 2 = Rainbow, handled per-element via hsv())
const HYPE_TONE = [[255,222,120],[255,255,255],null,[150,225,255],[255,150,220],[130,255,180],[200,150,255],[24,24,34],null,null,null,[12,12,15]];
const HYPE_DARK = new Set([7,11]);   // Ink / Black — need a darkening blend to show on a light background
// multi-colour patterns: each element picks from a curated set (distinct from the full-spectrum Rainbow)
const HYPE_MULTI = {
  8:[[255,95,35],[255,175,45],[255,70,70]],                    // Fire
  9:[[255,120,205],[160,120,255],[120,220,255]],               // Candy
 10:[[255,215,90],[255,120,180],[120,230,255],[150,255,170]],  // Festive
};
// pick a colour for tone at fraction frac∈[0,1): rainbow → hue, multi → set entry, else the flat tone.
// frac lets a spinning burst colour by world position (seamless) and a sparkle scatter by its seed.
// angle-periodic pseudo-noise (0..1) for Burst line widths — integer harmonics keep it periodic over a
// full turn, so a spinning burst that colours/sizes by world angle still meets itself at the loop seam.
function burstNoise(f){
  const v = Math.sin(f*Math.PI*2*7) + 0.8*Math.sin(f*Math.PI*2*13+1.7) + 0.6*Math.sin(f*Math.PI*2*19+4.1);
  return 0.5 + v/4.8;
}
function hypeColor(tone, frac, sat, count){
  frac=((frac%1)+1)%1;
  if (tone===2) return hsv(frac*360, sat, 1);
  const m=HYPE_MULTI[tone];
  if (m){ const c=count||m.length; return m[((Math.floor(frac*c+1e-6)%m.length)+m.length)%m.length]; }
  return HYPE_TONE[tone]||HYPE_TONE[0];
}
// like hypeColor but SMOOTH — for continuous fields (edge glow, colour sweep) where hard colour
// blocks flicker as they rotate. Rainbow → smooth hue; multi-colour → linearly interpolated so the
// pattern reads as one gentle gradient cycling through its colours once per unit of frac (much
// slower/softer than the hard-stepped hypeColor); single tones stay flat.
function hypeLerp(tone, frac, sat){
  frac=((frac%1)+1)%1;
  if (tone===2) return hsv(frac*360, sat, 1);
  const m=HYPE_MULTI[tone];
  if (m){ const L=m.length, f=frac*L, i=Math.floor(f)%L, j=(i+1)%L, u=f-Math.floor(f), a=m[i], b=m[j];
    return [a[0]+(b[0]-a[0])*u, a[1]+(b[1]-a[1])*u, a[2]+(b[2]-a[2])*u]; }
  return HYPE_TONE[tone]||HYPE_TONE[0];
}

function applyBokeh(w,h,phase){
// ---- Bokeh Bloom: soft light discs grown from the picture's own highlights, breathing over the loop ----
const bk = state.bokeh;
if (bk.on && bk.amount>0){
  const amt=P('bokeh','amount'), N=Math.round(10+bk.density*80), thr=bk.thresh, base=5+P('bokeh','size')*48, shape=bk.shape|0, from=bk.from|0;
  const id=ctx.getImageData(0,0,w,h), d=id.data;
  ctx.save(); ctx.globalCompositeOperation='screen';
  for (let i=0;i<N;i++){
    const px=(rand(i*12.9+1)*w)|0, py=(rand(i*78.2+3)*h)|0, si=(py*w+px)*4;
    const R0=d[si],G0=d[si+1],B0=d[si+2], lum=(R0*0.299+G0*0.587+B0*0.114)/255;
    const mx=Math.max(R0,G0,B0), sat=mx? (mx-Math.min(R0,G0,B0))/mx : 0;      // trigger metric: bright, vivid, or either
    const metric = from===1 ? sat : from===2 ? Math.max(lum,sat) : lum;
    if (metric<thr) continue;
    const str=(metric-thr)/(1-thr+1e-3);
    const bob=Math.sin(phase*Math.PI*2 + rand(i*5.7)*6)*10;                        // gentle drift (seamless)
    const pulse=1+0.16*Math.sin(phase*Math.PI*2 + rand(i*3.3)*6);
    const s=base*(0.5+rand(i*9.1)*1.0)*pulse;
    drawBokeh(px, py+bob, s, [d[si],d[si+1],d[si+2]], amt*str*0.6, shape);
  }
  ctx.restore();
}
}
// shared shape paths (used by both Bokeh discs and Sparkle glints)
function _starPath(x,y,s,points,inner){ ctx.beginPath();
  for (let k=0;k<points*2;k++){ const rad=(k%2)?s*inner:s, a=-Math.PI/2+k*Math.PI/points, vx=x+Math.cos(a)*rad, vy=y+Math.sin(a)*rad; k?ctx.lineTo(vx,vy):ctx.moveTo(vx,vy); } ctx.closePath(); }
function _polyPath(x,y,s,sides){ ctx.beginPath();
  for (let k=0;k<sides;k++){ const a=-Math.PI/2+k*(Math.PI*2/sides), vx=x+Math.cos(a)*s, vy=y+Math.sin(a)*s; k?ctx.lineTo(vx,vy):ctx.moveTo(vx,vy); } ctx.closePath(); }
function _heartPath(x,y,s){ const t=s*0.95; ctx.beginPath(); ctx.moveTo(x,y+t*0.55);
  ctx.bezierCurveTo(x+t,y-t*0.35, x+t*0.5,y-t, x,y-t*0.3); ctx.bezierCurveTo(x-t*0.5,y-t, x-t,y-t*0.35, x,y+t*0.55); ctx.closePath(); }

function drawBokeh(x,y,s,col,alpha,shape){
  if (s<1 || alpha<=0.01) return;
  const [r,g,b]=col; ctx.globalAlpha=Math.min(1,alpha);
  if (shape===0){                                                                 // circle: soft disc with a brighter rim
    const rg=ctx.createRadialGradient(x,y,0,x,y,s);
    rg.addColorStop(0,`rgba(${r},${g},${b},0.55)`); rg.addColorStop(0.75,`rgba(${r},${g},${b},0.32)`);
    rg.addColorStop(0.92,`rgba(${r},${g},${b},0.7)`); rg.addColorStop(1,`rgba(${r},${g},${b},0)`);
    ctx.fillStyle=rg; ctx.beginPath(); ctx.arc(x,y,s,0,7); ctx.fill(); return;
  }
  ctx.fillStyle=`rgba(${r},${g},${b},0.55)`;
  switch (shape){                                                                 // hexagon / star5 / heart / diamond, + ported star4/6/8
    case 1: _polyPath(x,y,s,6); break;
    case 2: _starPath(x,y,s,5,0.45); break;
    case 3: _heartPath(x,y,s); break;
    case 4: _polyPath(x,y,s,4); break;
    case 5: _starPath(x,y,s,4,0.45); break;
    case 6: _starPath(x,y,s,6,0.5); break;
    case 7: _starPath(x,y,s,8,0.55); break;
    default: _polyPath(x,y,s,6);
  }
  ctx.fill();
}

function applySparkle(w,h,phase){
// ---- Sparkle: seeded twinkling glints, screened on top — each twinkles an integer number of times
//      over the loop so it lands back where it started (seamless), positions fixed by the seed.
//      Motion adds a per-glint trajectory that plays out during each twinkle's visible arc. For
//      Fall / Rise / Drift, spawn positions are extended past the frame in the opposite direction so
//      glints can enter from off-screen (rain / snow / drifting particles cross the picture instead
//      of appearing mid-frame). Explode fans outward from centre. Life Pattern shapes the alpha/size
//      curve or leaves a trail. Loop stays seamless because each glint's motion is contained inside
//      one twinkle period and integer twinkles/loop returns to the same start at phase 1. ----
const sp = state.sparkle;
if (sp.on && sp.amount>0){
  const a=P('sparkle','amount'), N=Math.round(8+sp.density*90), base=2+sp.size*11, tone=sp.tone|0, spd=sp.speed|0||1, shape=sp.shape|0;
  const motion=sp.motion|0, life=sp.life|0, dist=+(sp.dist||0), driftAng=(sp.angle||0)*Math.PI/180;
  const D=Math.hypot(w,h), cx=w*0.5, cy=h*0.5;
  // Precompute per-life travel vector for directional motions (Fall/Rise/Drift)
  let vxm=0, vym=0;
  if (motion===1)      { vym = dist*D; }                                              // Fall (down)
  else if (motion===2) { vym = -dist*D; }                                             // Rise (up)
  else if (motion===3) { vxm = dist*D*Math.cos(driftAng); vym = dist*D*Math.sin(driftAng); }   // Drift
  const dirMotion = motion>=1 && motion<=3;
  const xW = dirMotion ? w + Math.abs(vxm) : w;                                       // spawn box extended past
  const yH = dirMotion ? h + Math.abs(vym) : h;                                       // frame in the reverse
  const xShift = dirMotion ? Math.max(vxm, 0) : 0;                                    // direction so glints can
  const yShift = dirMotion ? Math.max(vym, 0) : 0;                                    // enter from off-screen
  ctx.save(); ctx.globalCompositeOperation = HYPE_DARK.has(tone) ? 'multiply' : 'screen';   // dark tones darken (for light backgrounds)
  for (let i=0;i<N;i++){
    const freq=(1+(rand(i*3.3)*3|0))*spd, ph=rand(i*5.7+.2);   // integer twinkles/loop → seamless
    const cyc=(phase*freq+ph)%1;                                // 0..1 within one twinkle period
    const tw=Math.sin(cyc*Math.PI*2); if (tw<=0.05) continue;
    const pop=tw*tw;                                            // sharpen the flash
    const s0=base*(0.5+rand(i*9.1)*0.9);
    const col=hypeColor(tone, rand(i*2.1), 0.55);              // seed picks the hue / palette entry
    if (motion===0){                                            // fast path — twinkle in place
      const x=rand(i*12.9+1)*w, y=rand(i*78.2+3)*h;
      drawGlint(x,y, s0*pop, col, a*pop, shape);
      continue;
    }
    const prog=Math.min(1, cyc*2);                              // 0..1 across the visible arc (cyc ∈ [0, 0.5])
    const x0=rand(i*12.9+1)*xW - xShift, y0=rand(i*78.2+3)*yH - yShift;
    let vx, vy;
    if (motion===4){                                            // Explode — from centre, per-glint direction
      const dx=x0-cx, dy=y0-cy, len=Math.hypot(dx,dy)||1;
      vx = dist*D*prog*dx/len; vy = dist*D*prog*dy/len;
    } else {                                                    // Fall / Rise / Drift — shared vector
      vx = vxm*prog; vy = vym*prog;
    }
    const x=x0+vx, y=y0+vy;
    if (life===0){                                              // Fade — sin-shaped in/out
      drawGlint(x,y, s0*pop, col, a*pop, shape);
    } else if (life===1){                                       // Shrink — full at start, shrinks to nothing
      const k=1-prog;
      drawGlint(x,y, s0*k, col, a*k*Math.min(1,prog*8), shape); // brief fade-in so glint appears cleanly
    } else if (life===2){                                       // Burst — grows and fades explosively
      drawGlint(x,y, s0*(0.5+prog*prog*3), col, a*pop*(1-prog*prog), shape);
    } else {                                                    // Trail — fading echoes behind
      for (let t=0;t<4;t++){
        const tp=t/3, tx=x-vx*tp, ty=y-vy*tp, k=(1-tp)*(1-tp)*pop;
        drawGlint(tx,ty, s0*k*1.2, col, a*k, shape);
      }
    }
  }
  ctx.restore();
}
}
function drawGlint(x,y,s,col,alpha,shape){
  if (s<0.4 || alpha<=0.01) return;
  const [r,g,b]=col, A=Math.min(1,alpha);
  ctx.globalAlpha=A;
  const core=(shape===3)?s*1.15:s*0.7;                         // Dot uses a bigger soft core
  const rg=ctx.createRadialGradient(x,y,0,x,y,core);
  rg.addColorStop(0,`rgba(${r},${g},${b},1)`); rg.addColorStop(1,`rgba(${r},${g},${b},0)`);
  ctx.fillStyle=rg; ctx.beginPath(); ctx.arc(x,y,core,0,7); ctx.fill();
  if (shape===3) return;                                       // Dot: no spikes
  if (shape>=4){                                               // filled glints: diamond / hexagon / star5 / heart
    ctx.fillStyle=`rgb(${r},${g},${b})`;
    if (shape===4){ const d=s*1.8; ctx.beginPath(); ctx.moveTo(x,y-d); ctx.lineTo(x+d*0.62,y); ctx.lineTo(x,y+d); ctx.lineTo(x-d*0.62,y); ctx.closePath(); }
    else if (shape===5) _polyPath(x,y,s*1.5,6);                // Hexagon
    else if (shape===6) _starPath(x,y,s*1.9,5,0.45);           // Star (5pt)
    else _heartPath(x,y,s*1.5);                                // Heart
    ctx.fill(); return;
  }
  ctx.strokeStyle=`rgba(${r},${g},${b},0.9)`; ctx.lineWidth=Math.max(1,s*0.16);
  const L=s*2.7, ray=(th,len)=>{ ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+Math.cos(th)*len,y+Math.sin(th)*len); ctx.stroke(); };
  if (shape===1){ for(let k=0;k<6;k++) ray(k*Math.PI/3, L); }                                             // 6-point
  else if (shape===2){ for(let k=0;k<4;k++) ray(k*Math.PI/2, L); for(let k=0;k<4;k++) ray(Math.PI/4+k*Math.PI/2, L*0.5); }  // 8-point
  else { for(let k=0;k<4;k++) ray(k*Math.PI/2, L); }                                                     // 4-point (default)
}

// composite one channel of `tint` over `base` by the named blend mode, at full strength (the
function applyEdgeGlow(w,h,phase){
// ---- RGB Edge Glow: ARGB case-strip AMBIENT bounce. Colour bleeds inward from each border; all four
//      borders contribute ADDITIVELY, so at a corner the two adjacent hues mix and brighten the way
//      real overlapping light does (no hard diagonal seam), and the whole layer is blurred so it reads
//      as a soft indirect glow rather than a crisp frame. Composited with a real canvas blend mode. ----
const eg = state.edgeglow;
if (!(eg.on && eg.amount>0)) return;
const amt=P('edgeglow','amount'), tone=eg.tone|0, spd=eg.speed||0, mode=eg.blend|0, jitter=+eg.jitter||0, segs=Math.max(2,eg.segments|0||8);
const reach=Math.max(6, eg.reach*Math.min(w,h)*0.5);
const shift=spd*phase, P4=2*(w+h), PAL=360;                       // integer turns/loop → seamless (shift wraps)
const pal=new Array(PAL);                                         // per-frame colour ring → avoids a colour calc per pixel
for (let k=0;k<PAL;k++) pal[k]=hypeLerp(tone, k/PAL+shift, 0.9);  // smooth: multi-colour tones cycle once, gently, not 20× hard blocks
const col=f=>pal[((Math.floor(f*PAL)%PAL)+PAL)%PAL];
sc.width=w; sc.height=h;
const glow=sctx.createImageData(w,h), g=glow.data;
for (let y=0;y<h;y++){
  const dt=y, db=h-1-y;
  for (let x=0;x<w;x++){
    const dl=x, dr=w-1-x;
    let lr=0,lg=0,lb=0, ws=0;                                     // additive light from each border in range
    const topSeg=Math.floor(x/(w/segs)), rightSeg=Math.floor(y/(h/segs)), bottomSeg=Math.floor((w-1-x)/(w/segs)), leftSeg=Math.floor((h-1-y)/(h/segs));
    const segNoise=(n,off)=>rand(n*17.31+off*41.7+9.2)*2-1;
    const vTop=reach*(1+jitter*(.32*Math.sin(x*.071+y*.013+phase*6.283)+.38*segNoise(topSeg,0)));
    const vRight=reach*(1+jitter*(.32*Math.sin(y*.067+x*.017+phase*6.283+1.7)+.38*segNoise(rightSeg,1)));
    const vBottom=reach*(1+jitter*(.32*Math.sin(x*.059-y*.019+phase*6.283+3.1)+.38*segNoise(bottomSeg,2)));
    const vLeft=reach*(1+jitter*(.32*Math.sin(y*.083-x*.011+phase*6.283+4.6)+.38*segNoise(leftSeg,3)));
    if (dt<vTop){ const q=(1-dt/vTop)**2,       c=col(x/P4);           lr+=c[0]*q; lg+=c[1]*q; lb+=c[2]*q; ws+=q; }
    if (dr<vRight){ const q=(1-dr/vRight)**2,       c=col((w+y)/P4);       lr+=c[0]*q; lg+=c[1]*q; lb+=c[2]*q; ws+=q; }
    if (db<vBottom){ const q=(1-db/vBottom)**2,       c=col((w+h+(w-x))/P4); lr+=c[0]*q; lg+=c[1]*q; lb+=c[2]*q; ws+=q; }
    if (dl<vLeft){ const q=(1-dl/vLeft)**2,       c=col((2*w+2*h-y)/P4); lr+=c[0]*q; lg+=c[1]*q; lb+=c[2]*q; ws+=q; }
    if (ws<=0) continue;
    const i=(y*w+x)*4;
    g[i]=lr/ws; g[i+1]=lg/ws; g[i+2]=lb/ws;                       // hue = coverage-weighted blend → smooth across corners
    g[i+3]=Math.min(1,ws)*255;                                   // brightness = additive coverage → corners a touch brighter
  }
}
sctx.putImageData(glow,0,0);
const COMP=['source-over','screen','overlay','lighter'];         // Mix / Screen / Overlay / Add
ctx.save();
ctx.globalCompositeOperation=COMP[mode]||'screen';
ctx.globalAlpha=amt;
ctx.filter=`blur(${Math.max(1,reach*0.2).toFixed(1)}px)`;        // soft bokeh-like bleed, no hard frame edge
ctx.drawImage(sc,0,0);
ctx.filter='none';
ctx.restore();
}

function applyAura(w,h,phase){
// ---- Aura: soft radial halos read as bounced/indirect light. Source picks WHERE the halos come
//      from — a fixed anchor (Center / edges / corners / Custom XY, a single glow) OR the picture
//      itself (Image Highlights / Saturated / Any — Bokeh-style: sample pixels, keep the ones that
//      pass a metric, spawn one halo per hit). Rings and Rays are optional and layered on each
//      source. The whole thing is drawn onto a scratch canvas and composited under a heavy blur,
//      like Edge Glow, so it reads as ambient bounce rather than a crisp cutout. Ring Flow and
//      Ray Spin are integer per loop for seamless animation; each source's Pulse gets a stable
//      phase offset so multi-source halos breathe out of sync. ----
const au = state.aura;
if (!(au.on && au.amount>0)) return;
const amt=P('aura','amount'), tone=au.tone|0, blend=au.blend|0, mode=au.mode|0;
const src=au.source|0, anchorRadiusBoost=src<=9?2.5:1, R0=Math.min(w,h)*(+au.radius||0.3)*anchorRadiusBoost;
const core=+au.core||0, soft=+au.soft||0, rings=mode===1?Math.max(1,au.rings|0):au.rings|0, rays=mode===2?Math.max(4,au.rays|0):au.rays|0;
const flow=au.flow|0, spinT=+au.spin||0, pulse=+au.pulse||0;
const streak=+au.streak||0;
if (R0<=0) return;
const TWO=Math.PI*2;

// gather sources: {x, y, str∈(0..1] size/alpha weight, ph∈[0,1] pulse phase offset}
const sources=[];
if (src<=8){                                           // 0..8 → preset anchor (single)
    const AP=[[.5,.5],[.5,-.12],[.5,1.12],[-.12,.5],[1.12,.5],[-.12,-.12],[1.12,-.12],[-.12,1.12],[1.12,1.12]];
  sources.push({x:w*AP[src][0], y:h*AP[src][1], str:1, ph:0, col:null});
} else if (src===9){                                   // Custom XY (single)
    sources.push({x:w*(+au.x||.5), y:h*(+au.y||.5), str:1, ph:0, col:null});
} else {                                               // 10/11/12 → picture-driven, Bokeh-style
  const mode=src-10, N=Math.round(8+((+au.density)||0.5)*96), thr=+au.thresh||0.5;
  const id=ctx.getImageData(0,0,w,h), d=id.data;
  const candidates=[]; const step=Math.max(2,Math.round(Math.min(w,h)/48));
  for (let py=step>>1;py<h;py+=step) for (let px=step>>1;px<w;px+=step){
    const si=(py*w+px)*4;
    const R=d[si],G=d[si+1],B=d[si+2];
    const lum=(R*0.299+G*0.587+B*0.114)/255;
    const mx=Math.max(R,G,B), sat=mx?(mx-Math.min(R,G,B))/mx:0;
    const metric = mode===0 ? lum : mode===1 ? sat : Math.max(lum,sat);
    if (metric>=thr) candidates.push({x:px,y:py,metric,R,G,B});
  }
  candidates.sort((a,b)=>b.metric-a.metric);
  const want=Math.max(3,Math.round(3+(+au.density||0.5)*24)), minGap=Math.max(step*2,Math.min(w,h)*.06);
  for (const c of candidates){ if (sources.length>=want) break;
    if (sources.some(s=>Math.hypot(s.x-c.x,s.y-c.y)<minGap)) continue;
    const str=(c.metric-thr)/(1-thr+1e-3);
    sources.push({x:c.x,y:c.y,str:0.5+str*0.7,ph:rand(c.x*0.013+c.y*0.017),col:[c.R,c.G,c.B]});
  }
}
if (!sources.length) return;

sc.width=w; sc.height=h; sctx.clearRect(0,0,w,h);
const baseC = hypeLerp(tone, phase*flow*0.5, 0.6);
const spinning = rays>0 && Math.abs(spinT)>1e-6;
const ringOff = ((phase*flow)%1+1)%1;
let ks=0, rot=0;
if (spinning){ ks=Math.round(spinT*rays); if (ks===0) ks=spinT>0?1:-1; rot=ks*(TWO/rays)*phase; }

for (let si=0;si<sources.length;si++){
  const s=sources[si];
  const cx=s.x, cy=s.y;
  // pulse per source — a full seamless cycle whose phase is offset by the source seed
  const breath = Math.sin((phase+s.ph)*TWO);
  const pulseA = (1 + pulse*0.55*breath) * s.str;
  const Rp = R0 * s.str * (1 + pulse*0.18*breath);
  // base soft halo — a gentle wash so rings/rays can read on top (kept low so they aren't drowned)
  const sourceC = tone===7 && s.col ? s.col : baseC;
  const cs = a => `rgba(${sourceC[0]|0},${sourceC[1]|0},${sourceC[2]|0},${Math.min(1,Math.max(0,a)).toFixed(3)})`;
  // wide environmental wash, followed by a tighter halo and a small bright core
  const wide=Rp*1.45, env=sctx.createRadialGradient(cx,cy,0,cx,cy,wide);
  env.addColorStop(0,cs(amt*0.10*pulseA)); env.addColorStop(.55,cs(amt*0.06*pulseA)); env.addColorStop(1,cs(0));
  sctx.fillStyle=env; sctx.fillRect(cx-wide,cy-wide,wide*2,wide*2);
  const bg = sctx.createRadialGradient(cx,cy,0, cx,cy,Rp);
  bg.addColorStop(0,    cs(amt*0.45*pulseA));
  bg.addColorStop(0.35, cs(amt*0.18*pulseA));
  bg.addColorStop(1,    cs(0));
  sctx.fillStyle=bg; sctx.fillRect(cx-Rp, cy-Rp, Rp*2, Rp*2);
  if (core>0){ const cr=Math.max(1,Rp*(.06+.16*core)*(1+.12*pulse*breath));
    const cg=sctx.createRadialGradient(cx,cy,0,cx,cy,cr); cg.addColorStop(0,cs(amt*.9*pulseA)); cg.addColorStop(.45,cs(amt*.4*pulseA)); cg.addColorStop(1,cs(0));
    sctx.fillStyle=cg; sctx.fillRect(cx-cr,cy-cr,cr*2,cr*2);
  }
  // rings — soft radial BANDS via gradient stops (never a hard line stroke), but narrow enough to still read as rings after the final blur
  if (rings>0){
    for (let i=0;i<rings;i++){
      const baseT = ((i+ringOff)%rings)/rings;
      const ringJ = (rand(si*91.7+i*17.3+4.1)-.5) * (rings>1?.18:0);
      const t = Math.max(.015,Math.min(.99,baseT + ringJ/rings)), r=t*Rp;
      const shell = Math.min(1,t*5) * (1-t)*(1-t) * (2.7 + rand(si*13.1+i*3.7)*.8); // irregular brightness
      const alpha = amt * shell * pulseA;
      if (alpha<0.02) continue;
      const c = tone===7 && s.col ? s.col : hypeLerp(tone, t + phase*flow*0.5, 0.95);
      const band = Math.max(1, Rp*(.045 + rand(si*31.2+i*2.9)*.055));
      const inner = Math.max(0, r-band), outer = r+band;
      const rg = sctx.createRadialGradient(cx,cy, inner, cx,cy, outer);
      rg.addColorStop(0,   `rgba(${c[0]|0},${c[1]|0},${c[2]|0},0)`);
      rg.addColorStop(0.5, `rgba(${c[0]|0},${c[1]|0},${c[2]|0},${Math.min(1,alpha).toFixed(3)})`);
      rg.addColorStop(1,   `rgba(${c[0]|0},${c[1]|0},${c[2]|0},0)`);
      sctx.fillStyle=rg; sctx.fillRect(cx-outer, cy-outer, outer*2, outer*2);
    }
  }
  // rays — soft triangular wedges (like Burst), coloured by world angle so a spin is seamless
  if (rays>0){
    const rayLen = Rp*1.15, spacing=TWO/rays, halfW = Math.min(spacing*0.16, 0.11);
    for (let i=0;i<rays;i++){
      const a = i*spacing + (rand(si*47.3+i*11.9+2.2)-.5)*spacing*.24 + rot;
      const frac = spinning ? (i/rays) + rot/TWO : (i/rays);
      const c = tone===7 && s.col ? s.col : hypeLerp(tone, frac, 0.95);
      const rayScale=.78+rand(si*23.7+i*7.1)*.44;
      const tipx = cx + Math.cos(a)*rayLen*rayScale, tipy = cy + Math.sin(a)*rayLen*rayScale;
      const aa = Math.min(1, amt*(.72+rand(si*19.4+i*5.3)*.35)*pulseA);
      const rg = sctx.createLinearGradient(cx,cy, tipx,tipy);
      rg.addColorStop(0,   `rgba(${c[0]|0},${c[1]|0},${c[2]|0},${aa.toFixed(3)})`);
      rg.addColorStop(0.4, `rgba(${c[0]|0},${c[1]|0},${c[2]|0},${(aa*0.5).toFixed(3)})`);
      rg.addColorStop(1,   `rgba(${c[0]|0},${c[1]|0},${c[2]|0},0)`);
      sctx.fillStyle=rg;
      sctx.beginPath(); sctx.moveTo(cx,cy);
      const hw=halfW*(.72+rand(si*61.8+i*2.1)*.5), rr=rayLen*rayScale;
      sctx.lineTo(cx+Math.cos(a-hw)*rr, cy+Math.sin(a-hw)*rr);
      sctx.lineTo(cx+Math.cos(a+hw)*rr, cy+Math.sin(a+hw)*rr);
      sctx.closePath(); sctx.fill();
    }
  }
  if (streak>0){
    const dx=cx-w*.5, dy=cy-h*.5, dl=Math.hypot(dx,dy)||1, ex=cx+dx/dl*Rp*1.8, ey=cy+dy/dl*Rp*1.8;
    const sg=sctx.createLinearGradient(cx,cy,ex,ey); sg.addColorStop(0,cs(amt*streak*.7*pulseA)); sg.addColorStop(.35,cs(amt*streak*.18*pulseA)); sg.addColorStop(1,cs(0));
    sctx.save(); sctx.globalCompositeOperation='screen'; sctx.strokeStyle=sg; sctx.lineWidth=Math.max(1,Rp*.035); sctx.beginPath(); sctx.moveTo(cx,cy); sctx.lineTo(ex,ey); sctx.stroke(); sctx.restore();
  }
}

// composite the whole layer under a light blur — enough to keep it reading as bounced light
// without erasing the ring/ray structure (much lighter than before; Softness is the only knob).
// Aura should always read as light, never as a crisp geometric overlay. Keep a small
// baseline blur even when the control is at zero; higher Softness still expands strongly.
const softEff = Math.max(0.2, soft);
const blurPx = 2 + softEff * 22;
const BLEND=['overlay','screen','lighter','soft-light'];
ctx.save();
ctx.globalCompositeOperation = HYPE_DARK.has(tone) ? 'multiply' : (BLEND[blend]||'screen');
ctx.filter=`blur(${blurPx.toFixed(1)}px)`;
ctx.drawImage(sc, 0, 0);
ctx.filter='none';
if (soft>0.65){
  ctx.globalAlpha=amt*(soft-.65)*0.35;
  ctx.filter=`blur(${(blurPx*1.8).toFixed(1)}px)`;
  ctx.drawImage(sc,0,0);
  ctx.filter='none';
}
ctx.restore();
}

function applyBurst(w,h,phase){
// ---- Burst / 集中線: two Styles sharing one wedge-drawing lineage.
//      Speed Lines — radial lines from the centre, faded in from a clear middle, for the classic
//      manga/pachinko look. Spinning it slowly and seamlessly needs rotational symmetry, so a
//      spinning burst uses uniform wedges (N-fold symmetric) and rotates by a whole number of
//      line-spacings; a static burst (spin 0) keeps the irregular, jittered widths for a
//      hand-drawn feel.
//      Fan Blades — fewer, wider blades faded from the hub outward with a trailing streak, an
//      ARGB case-fan look. Each blade is drawn as an indirect glow (a gradient, bright near the
//      hub fading to nothing at the tip) rather than a flat-filled shape, so no hard "light
//      source" edge is ever drawn — it reads as bounced light, not a lit object. ----
const bs = state.burst;
if (bs.on && bs.amount>0){
  const a=P('burst','amount'), tone=bs.tone|0, style=bs.style|0, TWO=Math.PI*2;
  const jit = bs.jitter==null?0.6:bs.jitter;
  sc.width=w; sc.height=h; sctx.clearRect(0,0,w,h);
  if (style===1){
    const cx=(bs.cx==null?0.5:bs.cx)*w, cy=(bs.cy==null?0.5:bs.cy)*h;
    const N=Math.max(2,bs.blades|0);
    const spinT=bs.spin==null?0:bs.spin, spinning=Math.abs(spinT)>1e-6;
    let k=Math.round(spinT*N); if (spinning && k===0) k=spinT>0?1:-1;
    const rot=spinning ? k*(TWO/N)*phase : 0;                                // multiple of 2π/N → seamless
    const R=Math.hypot(w,h)*(0.08+(bs.size==null?0.5:bs.size)*0.6);          // covers well past the corners at max Size
    const streak=bs.streak==null?0.6:bs.streak, K=1+Math.round(streak*4);
    const dir=(k<0)?-1:1, half=(Math.PI/N)*0.27*(1+jit*0.25), step=(Math.PI/N)*0.75*(0.35+streak);
    sctx.save(); sctx.translate(cx,cy);
    for (let i=0;i<N;i++){
      const baseAng=i*(TWO/N)+rot, frac=((baseAng/TWO)%1+1)%1;
      const col=hypeColor(tone, frac, 0.9, N);
      for (let kk=0;kk<K;kk++){
        const ang=baseAng-dir*kk*step, alpha=(1-kk/K)*(K>1?0.5:0.85);
        if (alpha<=0.01) continue;
        const tipx=Math.cos(ang)*R, tipy=Math.sin(ang)*R;
        const rg=sctx.createLinearGradient(0,0,tipx,tipy);                   // bright at the hub, gone by the tip — bounced light, not a drawn blade
        rg.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},${(0.85*alpha).toFixed(3)})`);
        rg.addColorStop(1, `rgba(${col[0]},${col[1]},${col[2]},0)`);
        sctx.fillStyle=rg;
        sctx.beginPath(); sctx.moveTo(0,0);
        sctx.lineTo(Math.cos(ang-half)*R, Math.sin(ang-half)*R);
        sctx.lineTo(Math.cos(ang+half)*R, Math.sin(ang+half)*R);
        sctx.closePath(); sctx.fill();
      }
    }
    sctx.restore();
  } else if (style===2){
    const cx=(bs.cx==null ? .5 : bs.cx)*w, cy=(bs.cy==null ? .5 : bs.cy)*h, R=Math.hypot(w,h)*1.2;
    const N=Math.round(8+(bs.lines==null?.5:bs.lines)*36), spinT=bs.spin==null?0:bs.spin, spinning=Math.abs(spinT)>1e-6;
    let k=Math.round(spinT*N); if(spinning&&k===0) k=spinT>0?1:-1;
    const rot=spinning?k*(TWO/N)*phase:0, beamW=Math.max(1,Math.min(R*.025,1.5+bs.size*4));
    sctx.save(); sctx.translate(cx,cy);
    for(let i=0;i<N;i++){
      const colourTurn=spinT*(1-Math.cos(phase*TWO))*.5;
      const spacing=TWO/N, ang=i*spacing+jit*(burstNoise(i/N)-.5)*spacing*.5+rot, col=hypeColor(tone,((ang/TWO+colourTurn)%1+1)%1,.95,N);
      const originJ=jit*(burstNoise(i/N+9.7)-.5)*Math.min(w,h)*.08, ox=-Math.sin(ang)*originJ, oy=Math.cos(ang)*originJ, ex=ox+Math.cos(ang)*R, ey=oy+Math.sin(ang)*R;
      const g=sctx.createLinearGradient(ox,oy,ex,ey); g.addColorStop(0,`rgba(${col[0]},${col[1]},${col[2]},.95)`); g.addColorStop(.25,`rgba(${col[0]},${col[1]},${col[2]},.55)`); g.addColorStop(1,`rgba(${col[0]},${col[1]},${col[2]},0)`);
      sctx.strokeStyle=g; sctx.lineWidth=beamW; sctx.beginPath(); sctx.moveTo(ox,oy); sctx.lineTo(ex,ey); sctx.stroke();
    }
    sctx.restore();
    const reach=bs.reach==null?0.7:bs.reach, hole=Math.min(.82,reach*.72)*R;
    if (hole>0){
      const mask=sctx.createRadialGradient(cx,cy,0,cx,cy,R);
      mask.addColorStop(0,'rgba(0,0,0,0)');
      mask.addColorStop(Math.min(.98,hole/R),'rgba(0,0,0,0)');
      mask.addColorStop(Math.min(1,hole/R+.12),'rgba(0,0,0,1)');
      mask.addColorStop(1,'rgba(0,0,0,1)');
      sctx.globalCompositeOperation='destination-in'; sctx.fillStyle=mask; sctx.fillRect(0,0,w,h); sctx.globalCompositeOperation='source-over';
    }
  } else {
    const cx=(bs.cx==null ? .5 : bs.cx)*w, cy=(bs.cy==null ? .5 : bs.cy)*h, R=Math.hypot(w,h)*1.5;
    const N=Math.round(12+bs.lines*44);
    const spinT=bs.spin==null?0:bs.spin, spinning=Math.abs(spinT)>1e-6;
    let k=Math.round(spinT*N); if (spinning && k===0) k=spinT>0?1:-1;        // snap to a line-spacing step
    const rot=spinning ? k*(TWO/N)*phase : 0;                                // multiple of 2π/N → seamless
    sctx.save(); sctx.translate(cx,cy); sctx.rotate(rot);
    for (let i=0;i<N;i++){
      const ang=i*(TWO/N);
      const colourTurn=spinT*(1-Math.cos(phase*TWO))*.5;
      const frac=((ang/TWO+colourTurn)%1+1)%1;                                   // seamless colour phase: same hue at loop endpoints
      // Width variation: per-wedge random when static; a smooth angle-periodic noise when spinning, so the
      // widths ride the wedges through the loop and still match at the seam (integer harmonics = periodic).
      const nz = spinning ? burstNoise(frac) : rand(i*7.3);
      const half=(Math.PI/N)*0.55*(1 + jit*(nz*2-1)*0.9);
      const col=hypeColor(tone, frac, 0.9, N);
      sctx.fillStyle=`rgb(${col[0]},${col[1]},${col[2]})`;
      sctx.beginPath(); sctx.moveTo(0,0);
      sctx.lineTo(Math.cos(ang-half)*R, Math.sin(ang-half)*R);
      sctx.lineTo(Math.cos(ang+half)*R, Math.sin(ang+half)*R);
      sctx.closePath(); sctx.fill();
    }
    sctx.restore();
    // Reach controls how far in from the rim the lines run: low = a thin ring near the edge (clear
    // middle), high = all the way to the centre. Lines always fade to nothing at the very centre.
    const reach = bs.reach==null?0.7:bs.reach, s0=Math.min(0.9,0.5*(1-reach)), s1=Math.min(0.98,s0+0.45);
    const rg=sctx.createRadialGradient(cx,cy,0, cx,cy,R);
    rg.addColorStop(0,'rgba(0,0,0,0)');
    if (s0>0.001) rg.addColorStop(s0,'rgba(0,0,0,0)');
    rg.addColorStop(s1,'rgba(0,0,0,.85)'); rg.addColorStop(1,'rgba(0,0,0,1)');
    sctx.globalCompositeOperation='destination-in'; sctx.fillStyle=rg; sctx.fillRect(0,0,w,h); sctx.globalCompositeOperation='source-over';
  }
  const BLEND=['screen','lighter','overlay','source-over','multiply'];
  const pulse=0.8+0.2*Math.sin(phase*Math.PI*2);
  ctx.save(); ctx.globalCompositeOperation=BLEND[bs.blend|0]||'screen'; ctx.globalAlpha=a*pulse;
  const blur=(bs.blur==null?.25:bs.blur);
  if (blur>0) ctx.filter=`blur(${(blur*(style===1?5:12)).toFixed(1)}px)`;
  ctx.drawImage(sc,0,0);
  ctx.filter='none';
  ctx.restore();
}
}

function applyLightLeak(w,h,phase){
// ---- Light Leak: a warm glow bleeds in from an edge and drifts over the loop, screened on top ----
//      A brightening counterpart to all the darkening effects — screen blend only ever lifts pixels.
const lk = state.leak;
if (lk.on && lk.amount>0){
  const TONE = [[255,150,60],[255,200,95],[255,80,55],[255,244,224],[150,205,255]];  // warm/gold/red/white/cool
  const col = TONE[lk.tone|0] || TONE[0];
  const spread = 0.3 + lk.size*0.7;                    // gradient reach as a fraction of the frame
  const r = Math.max(w,h)*spread;
  const bob = Math.sin(phase*Math.PI*2)*0.42*lk.drift; // seamless drift along the entering edge
  let cx, cy;
  switch (lk.pos|0){
    case 1: cx=w*1.02; cy=h*(0.5+bob); break;          // right
    case 2: cx=w*(0.5+bob); cy=-h*0.02; break;         // top
    case 3: cx=w*(0.5+bob); cy=h*1.02; break;          // bottom
    case 4: cx=w*(0.04+0.12*(bob+0.42)); cy=h*(0.04+0.12*(bob+0.42)); break;   // corner
    default: cx=-w*0.02; cy=h*(0.5+bob);               // left
  }
  const g = ctx.createRadialGradient(cx,cy,0, cx,cy,r);
  const cs = a=> `rgba(${col[0]},${col[1]},${col[2]},${a})`;
  g.addColorStop(0, cs(1)); g.addColorStop(0.45, cs(0.4)); g.addColorStop(1, cs(0));
  ctx.save();
  ctx.globalCompositeOperation='screen';
  ctx.globalAlpha = P('leak','amount');
  ctx.fillStyle = g; ctx.fillRect(0,0,w,h);
  ctx.restore();
}
}

function applyCrtBezel(w,h,cr){
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
  const cs=Math.floor(now.getTime()/1000)%36000;           // VCR tape counter — H:MM:SS
  const ctr=`${Math.floor(cs/3600)}:${p2(Math.floor(cs/60)%60)}:${p2(cs%60)}`;
  const sub = s => String(s).replace(/\{date\}/g,date).replace(/\{time\}/g,time).replace(/\{ctr\}/g,ctr);
  const lh=Math.round(base*1.28);
  ctx.save();
  ctx.globalAlpha=hd.opacity;
  ctx.font=`${base}px ui-monospace, Menlo, monospace`;
  ctx.textBaseline='top';
  ctx.shadowColor='rgba(0,0,0,.85)'; ctx.shadowBlur=3; ctx.shadowOffsetY=1;
  // draw one line (which may contain {rec} dots) at anchor ax with the given horizontal alignment
  const drawLine=(line, ax, ay, align)=>{
    const segs = line.split(/(\{rec\})/).filter(s=>s!=='');
    const parts = segs.map(s=> s==='{rec}' ? {dot:true, w:base*0.95} : {t:s, w:ctx.measureText(s).width});
    const total = parts.reduce((a,p)=>a+p.w, 0);
    let x = align==='right' ? ax-total : align==='center' ? ax-total/2 : ax;
    for (const p of parts){
      if (p.dot){ if(recOn){ ctx.fillStyle='#ff3b30'; ctx.beginPath(); ctx.arc(x+base*0.4,ay+base*0.52,base*0.32,0,7); ctx.fill(); } ctx.fillStyle=col; }
      else { ctx.textAlign='left'; ctx.fillStyle=col; ctx.fillText(p.t, x, ay); }
      x += p.w;
    }
  };
  // a slot: token-substitute, split into lines on {n}, then stack from the anchor (top slots grow
  // down, bottom slots grow up, centre grows around the middle) so multi-line text stays in frame
  const slot=(raw, ax, ay, align, vert)=>{
    if (!raw) return;
    const lines = sub(raw).split('{n}');
    for (let i=0;i<lines.length;i++){
      const y = vert==='down' ? ay + i*lh
              : vert==='up'   ? ay - (lines.length-1-i)*lh
              :                 ay + (i - (lines.length-1)/2)*lh;   // centre
      drawLine(lines[i], ax, y, align);
    }
  };
  slot(hd.tl, pad,   pad,        'left',   'down');
  slot(hd.tr, w-pad, pad,        'right',  'down');
  slot(hd.c,  w/2,   h/2-base/2, 'center', 'mid');
  slot(hd.bl, pad,   h-pad-base, 'left',   'up');
  slot(hd.br, w-pad, h-pad-base, 'right',  'up');
  ctx.restore();
}
