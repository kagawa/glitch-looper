function applyCrtTube(w,h){
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
//      over the loop so it lands back where it started (seamless), positions fixed by the seed ----
const sp = state.sparkle;
if (sp.on && sp.amount>0){
  const a=P('sparkle','amount'), N=Math.round(8+sp.density*90), base=2+sp.size*11, tone=sp.tone|0, spd=sp.speed|0||1, shape=sp.shape|0;
  ctx.save(); ctx.globalCompositeOperation = HYPE_DARK.has(tone) ? 'multiply' : 'screen';   // dark tones darken (for light backgrounds)
  for (let i=0;i<N;i++){
    const freq=(1+(rand(i*3.3)*3|0))*spd, ph=rand(i*5.7+.2);   // integer twinkles/loop → seamless
    const tw=Math.sin((phase*freq+ph)*Math.PI*2); if (tw<=0.05) continue;
    const pop=tw*tw;                                            // sharpen the flash
    const x=rand(i*12.9+1)*w, y=rand(i*78.2+3)*h, s=base*(0.5+rand(i*9.1)*0.9);
    const col=hypeColor(tone, rand(i*2.1), 0.55);              // seed picks the hue / palette entry
    drawGlint(x,y, s*pop, col, a*pop, shape);
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

function applyBurst(w,h,phase){
// ---- Burst / 集中線: radial speed-lines from the centre, faded in from a clear middle, screened on top.
//      Spinning it slowly and seamlessly needs rotational symmetry, so a spinning burst uses uniform
//      wedges (N-fold symmetric) and rotates by a whole number of line-spacings; a static burst (spin 0)
//      keeps the irregular, jittered widths for a hand-drawn manga look. ----
const bs = state.burst;
if (bs.on && bs.amount>0){
  const a=P('burst','amount'), cx=w/2, cy=h/2, R=Math.hypot(w,h)/2*1.1, TWO=Math.PI*2;
  const N=Math.round(12+bs.lines*44), tone=bs.tone|0;
  const spinT=bs.spin==null?0:bs.spin, spinning=Math.abs(spinT)>1e-6;
  let k=Math.round(spinT*N); if (spinning && k===0) k=spinT>0?1:-1;          // snap to a line-spacing step
  const rot=spinning ? k*(TWO/N)*phase : 0;                                  // multiple of 2π/N → seamless
  sc.width=w; sc.height=h; sctx.clearRect(0,0,w,h);
  sctx.save(); sctx.translate(cx,cy); sctx.rotate(rot);
  const jit = bs.jitter==null?0.6:bs.jitter;
  for (let i=0;i<N;i++){
    const ang=i*(TWO/N);
    const frac=spinning ? (i/N)+rot/TWO : i/N;                              // colour/width by world position when spinning
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
  const BLEND=['screen','lighter','overlay','source-over','multiply'];
  const pulse=0.8+0.2*Math.sin(phase*Math.PI*2);
  ctx.save(); ctx.globalCompositeOperation=BLEND[bs.blend|0]||'screen'; ctx.globalAlpha=a*pulse; ctx.drawImage(sc,0,0); ctx.restore();
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
