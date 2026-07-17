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

function applySparkle(w,h,phase){
// ---- Sparkle: seeded twinkling glints, screened on top — each twinkles an integer number of times
//      over the loop so it lands back where it started (seamless), positions fixed by the seed ----
const sp = state.sparkle;
if (sp.on && sp.amount>0){
  const a=P('sparkle','amount'), N=Math.round(8+sp.density*90), base=2+sp.size*11, tone=sp.tone|0;
  const TONE=[[255,238,175],[255,255,255]];                    // gold / white (2 = rainbow, per-sparkle hue)
  ctx.save(); ctx.globalCompositeOperation='screen';
  for (let i=0;i<N;i++){
    const freq=1+(rand(i*3.3)*3|0), ph=rand(i*5.7+.2);         // integer twinkles/loop → seamless
    const tw=Math.sin((phase*freq+ph)*Math.PI*2); if (tw<=0.05) continue;
    const pop=tw*tw;                                            // sharpen the flash
    const x=rand(i*12.9+1)*w, y=rand(i*78.2+3)*h, s=base*(0.5+rand(i*9.1)*0.9);
    const col= tone===2 ? hsv(rand(i*2.1)*360,0.55,1) : (TONE[tone]||TONE[0]);
    drawGlint(x,y, s*pop, col, a*pop);
  }
  ctx.restore();
}
}
function drawGlint(x,y,s,col,alpha){
  if (s<0.4 || alpha<=0.01) return;
  const [r,g,b]=col;
  ctx.globalAlpha=Math.min(1,alpha);
  const rg=ctx.createRadialGradient(x,y,0,x,y,s);
  rg.addColorStop(0,`rgba(${r},${g},${b},1)`); rg.addColorStop(1,`rgba(${r},${g},${b},0)`);
  ctx.fillStyle=rg; ctx.beginPath(); ctx.arc(x,y,s,0,7); ctx.fill();
  ctx.strokeStyle=`rgba(${r},${g},${b},0.9)`; ctx.lineWidth=Math.max(1,s*0.16);
  const L=s*2.7; ctx.beginPath();
  ctx.moveTo(x-L,y); ctx.lineTo(x+L,y); ctx.moveTo(x,y-L); ctx.lineTo(x,y+L); ctx.stroke();
}

function applyBurst(w,h,phase){
// ---- Burst / 集中線: radial speed-lines from the centre, faded in from a clear middle, spinning
//      an integer number of turns over the loop (seamless), screened on top ----
const bs = state.burst;
if (bs.on && bs.amount>0){
  const a=P('burst','amount'), cx=w/2, cy=h/2, R=Math.hypot(w,h)/2*1.1;
  const N=Math.round(12+bs.lines*44), spin=(bs.spin|0)*phase*Math.PI*2, tone=bs.tone|0;
  const TONE=[[255,214,88],[255,255,255]];
  sc.width=w; sc.height=h; sctx.clearRect(0,0,w,h);
  sctx.save(); sctx.translate(cx,cy); sctx.rotate(spin);
  for (let i=0;i<N;i++){
    const t=i/N, ang=t*Math.PI*2, half=(Math.PI/N)*(0.25+rand(i*7.3)*0.75);   // jittered wedge width
    const col= tone===2 ? hsv(t*360,0.9,1) : (TONE[tone]||TONE[0]);
    sctx.fillStyle=`rgb(${col[0]},${col[1]},${col[2]})`;
    sctx.beginPath(); sctx.moveTo(0,0);
    sctx.lineTo(Math.cos(ang-half)*R, Math.sin(ang-half)*R);
    sctx.lineTo(Math.cos(ang+half)*R, Math.sin(ang+half)*R);
    sctx.closePath(); sctx.fill();
  }
  sctx.restore();
  // clear the centre so the picture shows through; lines intensify outward
  const rg=sctx.createRadialGradient(cx,cy,R*0.12, cx,cy,R);
  rg.addColorStop(0,'rgba(0,0,0,0)'); rg.addColorStop(0.5,'rgba(0,0,0,.6)'); rg.addColorStop(1,'rgba(0,0,0,1)');
  sctx.globalCompositeOperation='destination-in'; sctx.fillStyle=rg; sctx.fillRect(0,0,w,h); sctx.globalCompositeOperation='source-over';
  const pulse=0.8+0.2*Math.sin(phase*Math.PI*2);
  ctx.save(); ctx.globalCompositeOperation='screen'; ctx.globalAlpha=a*pulse; ctx.drawImage(sc,0,0); ctx.restore();
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
