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
  if ((mk.source|0)===0){
    let x0,x1,y0,y1;
    if ((mk.mode|0)===1){
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
    const source=msx.getImageData(0,0,w,h), pixels=source.data, luma=new Float32Array(w*h);
    for(let i=0,p=0;i<pixels.length;i+=4,p++) luma[p]=(pixels[i]*.299+pixels[i+1]*.587+pixels[i+2]*.114)/255;
    const smooth=(a,b,x)=>{ const t=Math.max(0,Math.min(1,(x-a)/(b-a))); return t*t*(3-2*t); };
    const kind=mk.source|0;
    for(let y=0;y<h;y++) for(let x=0;x<w;x++){
      const p=y*w+x, lum=luma[p]; let alpha=0;
      if(kind===1) alpha=1-smooth(.12,.62,lum);
      else if(kind===2) alpha=Math.max(0,1-Math.abs(lum-.5)/.32);
      else if(kind===3) alpha=smooth(.38,.88,lum);
      else if(kind===4){ const right=luma[y*w+Math.min(w-1,x+1)], down=luma[Math.min(h-1,y+1)*w+x]; alpha=Math.min(1,(Math.abs(lum-right)+Math.abs(lum-down))*5); }
      else alpha=rand((x>>3)+(y>>3)*997+Math.floor(phase*Math.max(1,mk.interval))*131)>.5?1:0;
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
