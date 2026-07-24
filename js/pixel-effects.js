// Halftone and Pixelate replace the picture outright — that is why they were all-or-nothing.
// Mix blends the result back toward how the picture looked before the effect ran, and Fade ramps
// that blend across the frame, either from a side or by the brightness of the picture itself.
// Coverage is how far the Fade reaches: a fraction of the frame for the directional ramps, and the
// brightness cutoff for Bright/Dark. It is written so that raising it always means "more of the
// picture gets the effect", whichever Fade is chosen.
// Mix 1 + Fade Even leaves the frame untouched, so it costs nothing when it isn't used.
function mixWithOriginal(w,h,before,mix,fade,cover){
  if (mix>=1 && fade===0) return;
  const after = ctx.getImageData(0,0,w,h), ad = after.data, bd = before.data;
  const c = cover;
  // the linear ramps only vary along one axis, so precompute them once instead of per pixel.
  // The ramp hits full strength at 1-c/2 (the centre when Coverage is maxed) and reaches zero
  // c further out, which puts the far edge at ~50% rather than nothing when Coverage is maxed —
  // a low Coverage still confines the effect to a strip near its own side.
  // Guarded at 0, or the division would hand the near edge full strength however low Coverage went.
  const ramp = c<=0 ? (()=>0) : (t => Math.min(1, Math.max(0, (t-1+1.5*c)/c)));
  let gx=null, gy=null;
  if (fade===1||fade===2){ gx=new Float32Array(w); for(let x=0;x<w;x++){ const t=w>1?x/(w-1):1; gx[x]=ramp(fade===1?t:1-t); } }
  else if (fade===3||fade===4){ gy=new Float32Array(h); for(let y=0;y<h;y++){ const t=h>1?y/(h-1):1; gy[y]=ramp(fade===3?t:1-t); } }
  const tonal = fade===5||fade===6;
  const BAND = 0.18;                                  // soft edge on the cutoff, or it looks cut out
  for (let y=0;y<h;y++){
    const gyv = gy?gy[y]:1;
    for (let x=0;x<w;x++){
      const i=(y*w+x)*4;
      let g = gx ? gx[x] : gyv;
      if (tonal){
        // judged on the picture as it was before the effect ran, not on the effect's own output
        const l = (bd[i]*0.299+bd[i+1]*0.587+bd[i+2]*0.114)/255;
        const dist = fade===5 ? l-(1-c) : c-l;        // 5: the bright parts · 6: the dark parts
        g = Math.min(1, Math.max(0, dist/BAND));
      }
      const a = mix*g;
      if (a>=1) continue;
      ad[i]  =bd[i]  +(ad[i]  -bd[i]  )*a;
      ad[i+1]=bd[i+1]+(ad[i+1]-bd[i+1])*a;
      ad[i+2]=bd[i+2]+(ad[i+2]-bd[i+2])*a;
    }
  }
  ctx.putImageData(after,0,0);
}

function applyPixelate(w,h){
// ---- pixelate: downscale then nearest-neighbour upscale (Envelope can drive block size) ----
const px2 = state.pixelate;
if (px2.on && px2.size>1){
  const s=Math.max(1, Math.round(P('pixelate','size')));
  const shape=px2.shape|0, angle=P('pixelate','angle')*Math.PI/180;
  if (s>1){
    const mix=P('pixelate','mix'), fade=px2.fade|0;
    const before = (mix<1||fade) ? ctx.getImageData(0,0,w,h) : null;
    const cover = px2.cover;
    if (shape!==0 || Math.abs(angle)>1e-6){
      const src=ctx.getImageData(0,0,w,h).data; sc.width=w; sc.height=h;
      sctx.setTransform(1,0,0,1,0,0); sctx.globalCompositeOperation='source-over'; sctx.clearRect(0,0,w,h);
      const c=Math.cos(angle), sn=Math.sin(angle), cx0=w/2, cy0=h/2;
      const sample=(x,y)=>{ const ix=Math.max(0,Math.min(w-1,Math.round(x))),iy=Math.max(0,Math.min(h-1,Math.round(y))),i=(iy*w+ix)*4; return [src[i],src[i+1],src[i+2]]; };
      const draw=(x,y,col,kind,rot=angle)=>{ sctx.fillStyle=`rgb(${col[0]},${col[1]},${col[2]})`; const gap=kind===5?0:1, r=(kind===2||kind===3)?s/Math.sqrt(3)+gap:s*.5+gap; sctx.beginPath();
        if(kind===0){ const q=Math.cos(angle)*r, t=Math.sin(angle)*r, u=-t, v=q; sctx.moveTo(x-q-u,y-t-v); sctx.lineTo(x+q-u,y+t-v); sctx.lineTo(x+q+u,y+t+v); sctx.lineTo(x-q+u,y-t+v); sctx.closePath(); }
        else if(kind===1||kind===5) sctx.arc(x,y,r,0,Math.PI*2);
        else if(kind===2){ for(let k=0;k<3;k++){const a=rot-Math.PI/2+k*Math.PI*2/3,qx=x+Math.cos(a)*r,qy=y+Math.sin(a)*r;k?sctx.lineTo(qx,qy):sctx.moveTo(qx,qy);}sctx.closePath(); }
        else if(kind===3){ for(let k=0;k<6;k++){const a=rot-Math.PI/2+k*Math.PI/3,qx=x+Math.cos(a)*r,qy=y+Math.sin(a)*r;k?sctx.lineTo(qx,qy):sctx.moveTo(qx,qy);}sctx.closePath(); }
        else sctx.roundRect(x-r,y-r,r*2,r*2,r*.28);
        sctx.fill(); };
      const place=(u,v,kind,rot=angle)=>{ const x=cx0+u*c-v*sn,y=cy0+u*sn+v*c; if(x>=-s&&x<=w+s&&y>=-s&&y<=h+s) draw(x,y,sample(x,y),kind,rot); };
      const half=Math.hypot(w,h)/2+s;
      if(shape===2){
        const th=s*Math.sqrt(3)/2, rows=Math.ceil(half/th)+2, cols=Math.ceil(half/s)+2, tr=s/Math.sqrt(3);
        for(let row=-rows;row<=rows;row++) for(let col=-cols;col<=cols;col++){
          const shift=(row&1)?s*.5:0;
          place((col+.5)*s+shift,row*th+th/3,2,angle+Math.PI);
          place((col+1)*s+shift,row*th+2*th/3,2,angle);
        }
      } else if(shape===3){
        const hr=s/Math.sqrt(3), dx=hr*Math.sqrt(3), dy=hr*1.5, rows=Math.ceil(half/dy)+2, cols=Math.ceil(half/dx)+2;
        for(let row=-rows;row<=rows;row++) for(let col=-cols;col<=cols;col++) place(col*dx+(row&1)*dx*.5,row*dy,3);
      } else if(shape===5){
        const r=s*.5, dx=2*r, dy=Math.sqrt(3)*r, rows=Math.ceil(half/dy)+2, cols=Math.ceil(half/dx)+2;
        for(let row=-rows;row<=rows;row++) for(let col=-cols;col<=cols;col++) place(col*dx+(row&1)*dx*.5,row*dy,5);
      } else {
        const n=Math.ceil(half/s)+2;
        for(let iy=-n;iy<=n;iy++) for(let ix=-n;ix<=n;ix++){
          const u=(ix+.5)*s,v=(iy+.5)*s; place(u,v,shape);
        }
      }
      ctx.clearRect(0,0,w,h); ctx.drawImage(sc,0,0); if(before) mixWithOriginal(w,h,before,mix,fade,cover); return;
    }
    const pw=Math.max(1,Math.round(w/s)), ph=Math.max(1,Math.round(h/s));
    sc.width=pw; sc.height=ph; sctx.imageSmoothingEnabled=false;
    sctx.clearRect(0,0,pw,ph); sctx.drawImage(canvas,0,0,w,h,0,0,pw,ph);
    ctx.imageSmoothingEnabled=false; ctx.clearRect(0,0,w,h);
    ctx.drawImage(sc,0,0,pw,ph,0,0,w,h);
    ctx.imageSmoothingEnabled=true;
    if (before) mixWithOriginal(w,h,before,mix,fade,cover);
  }
}
}

function applyPolygonFill(w,h,phase){
// ---- Polygon Fill: reshape one tessellation into another by POURING pixels linearly. Both From
//      and To are laid down as REAL space-filling tessellations of equal-area (s²) cells; shapes
//      supported are Square, equilateral Triangle, regular Hexagon, 60° Rhombus, and Rectangle
//      (with aspect ratio param). For each To cell we enumerate its interior pixels in row-major
//      order → target stream; for the corresponding From cell (whose centroid is nearest the To
//      centroid in the unrotated tessellation frame) we enumerate its pixels the same way →
//      source stream. Pixel k in the target reads pixel k in the source (even-resampled when
//      discrete counts drift due to integer discretisation of s²). Grid Angle rotates the whole
//      tessellation around the canvas centre — cells rotate together with their content, so
//      identity (same From/To/size) stays identity at any angle.
const fx = state.polymorph;
if (!(fx && fx.on && P('polymorph','amount')>0)) return;
const amount = P('polymorph','amount');
const s = Math.max(4, Math.round(P('polymorph','size')));
const fromShape = fx.from|0, toShape = fx.shape|0;
const aspect = Math.max(0.1, +fx.aspect || 1);                          // only used by Rectangle
const angleRad = P('polymorph','angle') * Math.PI / 180;
const cosA = Math.cos(angleRad), sinA = Math.sin(angleRad);
const cxC = w/2, cyC = h/2;
// Cell metric per shape — everything derives from equal-area s².
const rectW = s * Math.sqrt(aspect), rectH = s / Math.sqrt(aspect);
const triSide = 2*s/Math.pow(3,0.25), triH = triSide*Math.sqrt(3)/2;
const hexHr = s*Math.sqrt(2/(3*Math.sqrt(3))), hexDX = hexHr*Math.sqrt(3), hexDY = hexHr*1.5;
const rhomL = s*Math.pow(2/Math.sqrt(3), 0.5);                          // 60°-rhombus side
const rhomD1 = rhomL, rhomD2 = rhomL*Math.sqrt(3);                      // short / long diagonals
const rhomDX = rhomD1, rhomDY = rhomD2/2;                               // tessellation stride
// Build row-major pixel-offset list for a shape/orient (0=up, 1=down; orient only matters for
// triangle). Offsets are relative to the cell centroid, discretised at integer pixel centres.
const buildPixels = (shape, orient) => {
  const px = [];
  if (shape===0){
    const half = s/2;
    const y0 = -Math.round(half), y1 = y0 + s;
    const x0 = -Math.round(half), x1 = x0 + s;
    for (let dy=y0; dy<y1; dy++) for (let dx=x0; dx<x1; dx++) px.push(dx, dy);
    return px;
  }
  if (shape===1){
    const yTop = orient===0 ? -Math.round(2*triH/3) : -Math.round(triH/3);
    const yBot = orient===0 ?  Math.round(triH/3)   :  Math.round(2*triH/3);
    const span = Math.max(1, yBot - yTop);
    for (let dy=yTop; dy<=yBot; dy++){
      const yFrac = orient===0 ? (dy - yTop)/span : (yBot - dy)/span;
      const halfW = yFrac * triSide / 2;
      const xEx = Math.floor(halfW);
      for (let dx=-xEx; dx<=xEx; dx++) px.push(dx, dy);
    }
    return px;
  }
  if (shape===2){
    const halfW = hexHr*Math.sqrt(3)/2;
    const yTop = -Math.round(hexHr), yBot = Math.round(hexHr);
    for (let dy=yTop; dy<=yBot; dy++){
      const widthAtY = Math.abs(dy) <= hexHr/2 ? halfW*2 : (hexHr - Math.abs(dy))*Math.sqrt(3)*2;
      const xEx = Math.floor(widthAtY/2);
      for (let dx=-xEx; dx<=xEx; dx++) px.push(dx, dy);
    }
    return px;
  }
  if (shape===3){                                                       // 60° Rhombus (diamond)
    const halfD1 = rhomD1/2, halfD2 = rhomD2/2;
    const yTop = -Math.round(halfD2), yBot = Math.round(halfD2);
    for (let dy=yTop; dy<=yBot; dy++){
      // Interior of diamond: |dx|/halfD1 + |dy|/halfD2 <= 1
      const halfW = halfD1 * (1 - Math.abs(dy)/halfD2);
      const xEx = Math.floor(halfW);
      for (let dx=-xEx; dx<=xEx; dx++) px.push(dx, dy);
    }
    return px;
  }
  // 4: Rectangle
  const halfW = rectW/2, halfH = rectH/2;
  const y0 = -Math.round(halfH), y1 = y0 + Math.round(rectH);
  const x0 = -Math.round(halfW), x1 = x0 + Math.round(rectW);
  for (let dy=y0; dy<y1; dy++) for (let dx=x0; dx<x1; dx++) px.push(dx, dy);
  return px;
};
const toPix   = toShape===1   ? [buildPixels(1,0), buildPixels(1,1)] : [buildPixels(toShape,0)];
const fromPix = fromShape===1 ? [buildPixels(1,0), buildPixels(1,1)] : [buildPixels(fromShape,0)];
// Enumerate cell centroids of a tessellation in UNROTATED space. We cover a rectangle centred on
// the canvas centre whose half-extent is the canvas diagonal — this guarantees that after
// rotation by any angle in [-45°, 45°] the covered area still spans the whole canvas.
const halfDiag = Math.hypot(w, h)/2 + Math.max(s, rectW, rectH, triSide, hexDX, rhomDX);
const boxX0 = cxC - halfDiag, boxX1 = cxC + halfDiag;
const boxY0 = cyC - halfDiag, boxY1 = cyC + halfDiag;
const enumerateCells = (shape) => {
  const cells = [];
  if (shape===0){
    const half = s/2;
    const cy0 = Math.floor((boxY0 - half)/s)*s + half;
    const cx0 = Math.floor((boxX0 - half)/s)*s + half;
    for (let cy=cy0; cy<boxY1; cy+=s) for (let cx=cx0; cx<boxX1; cx+=s)
      cells.push(cx, cy, 0);
    return cells;
  }
  if (shape===1){
    const rowStart = Math.floor(boxY0/triH) - 1, rowEnd = Math.ceil(boxY1/triH) + 1;
    const colStart = Math.floor(boxX0/triSide) - 1, colEnd = Math.ceil(boxX1/triSide) + 1;
    for (let row=rowStart; row<rowEnd; row++){
      const shift = ((row%2+2)%2) * triSide/2;
      for (let col=colStart; col<colEnd; col++){
        cells.push((col+0.5)*triSide + shift, row*triH + triH/3, 1);
        cells.push((col+1)*triSide + shift, row*triH + 2*triH/3, 0);
      }
    }
    return cells;
  }
  if (shape===2){
    const rowStart = Math.floor(boxY0/hexDY) - 1, rowEnd = Math.ceil(boxY1/hexDY) + 1;
    const colStart = Math.floor(boxX0/hexDX) - 1, colEnd = Math.ceil(boxX1/hexDX) + 1;
    for (let row=rowStart; row<rowEnd; row++){
      const shift = ((row%2+2)%2) * hexDX/2;
      for (let col=colStart; col<colEnd; col++) cells.push(col*hexDX + shift, row*hexDY, 0);
    }
    return cells;
  }
  if (shape===3){                                                       // Rhombus: hex-like offset lattice
    const rowStart = Math.floor(boxY0/rhomDY) - 1, rowEnd = Math.ceil(boxY1/rhomDY) + 1;
    const colStart = Math.floor(boxX0/rhomDX) - 1, colEnd = Math.ceil(boxX1/rhomDX) + 1;
    for (let row=rowStart; row<rowEnd; row++){
      const shift = ((row%2+2)%2) * rhomDX/2;
      for (let col=colStart; col<colEnd; col++) cells.push(col*rhomDX + shift, row*rhomDY, 0);
    }
    return cells;
  }
  // 4: Rectangle
  const halfW = rectW/2, halfH = rectH/2;
  const cy0 = Math.floor((boxY0 - halfH)/rectH)*rectH + halfH;
  const cx0 = Math.floor((boxX0 - halfW)/rectW)*rectW + halfW;
  for (let cy=cy0; cy<boxY1; cy+=rectH) for (let cx=cx0; cx<boxX1; cx+=rectW)
    cells.push(cx, cy, 0);
  return cells;
};
// Nearest From centroid (unrotated) + orientation for a given unrotated canvas point.
const nearestFrom = (x, y) => {
  if (fromShape===0){
    return { cx:(Math.floor(x/s)+0.5)*s, cy:(Math.floor(y/s)+0.5)*s, orient:0 };
  }
  if (fromShape===1){
    const row0 = Math.floor(y/triH);
    let bx=0, by=0, bo=0, bd=Infinity;
    for (let dr=-1; dr<=1; dr++){
      const row = row0+dr;
      const shift = ((row%2+2)%2) * triSide/2;
      const col0 = Math.floor((x-shift)/triSide);
      for (let dc=-1; dc<=1; dc++){
        const col = col0+dc;
        const dcx = (col+0.5)*triSide + shift, dcy = row*triH + triH/3;
        const dd = (x-dcx)*(x-dcx) + (y-dcy)*(y-dcy);
        if (dd<bd){ bd=dd; bx=dcx; by=dcy; bo=1; }
        const ucx = (col+1)*triSide + shift, ucy = row*triH + 2*triH/3;
        const du = (x-ucx)*(x-ucx) + (y-ucy)*(y-ucy);
        if (du<bd){ bd=du; bx=ucx; by=ucy; bo=0; }
      }
    }
    return { cx:bx, cy:by, orient:bo };
  }
  if (fromShape===2){
    const row0 = Math.floor(y/hexDY);
    let bx=0, by=0, bd=Infinity;
    for (let dr=-1; dr<=1; dr++){
      const row = row0+dr;
      const shift = ((row%2+2)%2) * hexDX/2;
      const col0 = Math.floor((x-shift)/hexDX);
      for (let dc=-1; dc<=1; dc++){
        const col = col0+dc;
        const cx = col*hexDX + shift, cy = row*hexDY;
        const d = (x-cx)*(x-cx) + (y-cy)*(y-cy);
        if (d<bd){ bd=d; bx=cx; by=cy; }
      }
    }
    return { cx:bx, cy:by, orient:0 };
  }
  if (fromShape===3){
    const row0 = Math.floor(y/rhomDY);
    let bx=0, by=0, bd=Infinity;
    for (let dr=-1; dr<=1; dr++){
      const row = row0+dr;
      const shift = ((row%2+2)%2) * rhomDX/2;
      const col0 = Math.floor((x-shift)/rhomDX);
      for (let dc=-1; dc<=1; dc++){
        const col = col0+dc;
        const cx = col*rhomDX + shift, cy = row*rhomDY;
        const d = (x-cx)*(x-cx) + (y-cy)*(y-cy);
        if (d<bd){ bd=d; bx=cx; by=cy; }
      }
    }
    return { cx:bx, cy:by, orient:0 };
  }
  // 4: Rectangle
  return { cx:(Math.floor(x/rectW)+0.5)*rectW, cy:(Math.floor(y/rectH)+0.5)*rectH, orient:0 };
};
const src = ctx.getImageData(0,0,w,h), sd = src.data;
const out = ctx.createImageData(w,h), od = out.data;
od.set(sd);                                                              // uncovered pixels stay = source
const cells = enumerateCells(toShape);
for (let i=0; i<cells.length; i+=3){
  const Tcx0 = cells[i], Tcy0 = cells[i+1], toOrient = cells[i+2];
  const toList = toPix[toOrient];
  const N_to = toList.length / 2;
  if (N_to === 0) continue;
  const from = nearestFrom(Tcx0, Tcy0);
  const fromList = fromPix[from.orient];
  const N_from = fromList.length / 2;
  if (N_from === 0) continue;
  const ratio = N_from / N_to;
  // Rotate centroids into canvas space (around canvas centre).
  const Tcx = cxC + (Tcx0 - cxC)*cosA - (Tcy0 - cyC)*sinA;
  const Tcy = cyC + (Tcx0 - cxC)*sinA + (Tcy0 - cyC)*cosA;
  const Fcx = cxC + (from.cx - cxC)*cosA - (from.cy - cyC)*sinA;
  const Fcy = cyC + (from.cx - cxC)*sinA + (from.cy - cyC)*cosA;
  for (let k=0; k<N_to; k++){
    const tdx = toList[k*2], tdy = toList[k*2+1];
    // Rotate the cell-local offset by the same angle so cell shape rotates with the tessellation.
    const rtdx = cosA*tdx - sinA*tdy, rtdy = sinA*tdx + cosA*tdy;
    const dxi = Math.round(Tcx + rtdx), dyi = Math.round(Tcy + rtdy);
    if (dxi<0 || dxi>=w || dyi<0 || dyi>=h) continue;
    let sk = Math.floor((k + 0.5) * ratio);
    if (sk >= N_from) sk = N_from - 1;
    const fdx = fromList[sk*2], fdy = fromList[sk*2+1];
    const rfdx = cosA*fdx - sinA*fdy, rfdy = sinA*fdx + cosA*fdy;
    let sx = Fcx + rfdx, sy = Fcy + rfdy;
    sx = sx<0 ? 0 : sx>=w ? w-1 : sx|0;
    sy = sy<0 ? 0 : sy>=h ? h-1 : sy|0;
    const si = (sy*w + sx)*4;
    const di = (dyi*w + dxi)*4;
    od[di]   = sd[di]   + (sd[si]   - sd[di])   * amount;
    od[di+1] = sd[di+1] + (sd[si+1] - sd[di+1]) * amount;
    od[di+2] = sd[di+2] + (sd[si+2] - sd[di+2]) * amount;
    od[di+3] = 255;
  }
}
ctx.putImageData(out, 0, 0);
}

function applyHalftone(w,h){
// ---- halftone: rotatable dot/shape/line matrix with LED, print, CRT-phosphor, blueprint and
//      sepia presets. Grid Angle rotates the LATTICE, not the canvas — sample and dot share the
//      same rotated position so the picture stays put while the dot grid tilts. Triangles and
//      hexagons sit at their true tessellation centroids so neighbours share edges.
const ht = state.halftone;
if (ht.on){
  ctx.setTransform(1,0,0,1,0,0);
  const cell=Math.max(3,Math.round(ht.cell));
  // ^ round: param drift (D) can hand us a fractional cell → fractional pixel indices → NaN → black frame
  const before=ctx.getImageData(0,0,w,h), src=before.data;
  sc.width=w; sc.height=h; sctx.setTransform(1,0,0,1,0,0);
  sctx.globalCompositeOperation='source-over'; sctx.globalAlpha=1; sctx.filter='none';
  sctx.clearRect(0,0,w,h);
  // Background presets: {fill, ink, dark, light, kind}. ink=null → dot uses the pixel's own
  // colour; dark=true → bright pixels get big dots (LED-style size mapping — orthogonal to bg
  // lightness). light=true → the bg fill itself is bright, so CMYK Screen picks the
  // multiply-CMY print mode over the additive-RGB screen mode. `kind` opts into a custom ink
  // transform in inkFor (neon → saturation boost; riso → warm/cool duotone spot colours).
  const BG_PRESETS = [
    { fill:'#0a0a0a', ink:null,          dark:true,  light:false, kind:'pixel' }, // 0 Dark (LED)
    { fill:'#f0ede6', ink:[17,17,17],    dark:false, light:true,  kind:'fixed' }, // 1 Light (print)
    { fill:null,      ink:null,          dark:true,  light:false, kind:'pixel' }, // 2 None
    { fill:'#ffffff', ink:null,          dark:true,  light:true,  kind:'pixel' }, // 3 White LED
    { fill:'#160a00', ink:[255,176,0],   dark:true,  light:false, kind:'fixed' }, // 4 Amber CRT
    { fill:'#001505', ink:[80,255,110],  dark:true,  light:false, kind:'fixed' }, // 5 Green Phosphor
    { fill:'#0b2f5e', ink:[235,235,255], dark:true,  light:false, kind:'fixed' }, // 6 Blueprint
    { fill:'#f4e8d0', ink:[61,40,17],    dark:false, light:true,  kind:'fixed' }, // 7 Sepia
    { fill:'#06000f', ink:null,          dark:true,  light:false, kind:'neon'  }, // 8 Neon
    { fill:'#f5f1e5', ink:null,          dark:false, light:true,  kind:'riso'  }, // 9 Riso
  ];
  const bgP = BG_PRESETS[ht.bg|0] || BG_PRESETS[0];
  if (bgP.fill){ sctx.fillStyle=bgP.fill; sctx.fillRect(0,0,w,h); }
  const shape=ht.shape|0, angle=(+ht.angle||0)*Math.PI/180;
  // Ink Mapping (the field is still named `invert` for state-compat with earlier presets):
  // 0 Normal · 1 Invert · 2 Threshold · 3 Threshold Invert · 4 Mono.
  //   Invert flips which end of the tone range gets big dots.
  //   Threshold cuts sizes to on/off — the pure b&w halftone with no size ramp.
  //   Mono forces the dot to a neutral ink opposite of the bg's brightness, ignoring both the
  //   pixel colour AND any fixed-ink phosphor, so a mono photocopy sits on any background.
  const inkmap=ht.invert|0;
  const invert=(inkmap===1||inkmap===3), threshold=(inkmap===2||inkmap===3), mono=(inkmap===4);
  const dark=bgP.dark;
  const fixedDots=(ht.dotmode|0)===1 && dark;
  const cos=Math.cos(angle), sin=Math.sin(angle);
  const cxC=w/2, cyC=h/2;
  // A rotated grid needs enough reach along both lattice axes to cover the canvas diagonal.
  const halfDiag = Math.hypot(w, h)/2 + cell*2;

  const monoInk = dark ? 'rgb(238,238,238)' : 'rgb(34,34,34)';
  const monoInkRgb = dark ? [238,238,238] : [34,34,34];
  const fixedInk = bgP.ink ? `rgb(${bgP.ink[0]},${bgP.ink[1]},${bgP.ink[2]})` : null;
  const kind = bgP.kind || 'pixel';
  // Neon: push HSV saturation toward 1 so mid-saturated pixels read as vivid arcade / rave dots.
  // Preserve the max channel so hue and brightness stay put; only the min channel is pulled down.
  const neonInk = (r,g,b) => {
    const mx = Math.max(r,g,b), mn = Math.min(r,g,b);
    if (mx===0) return 'rgb(0,0,0)';
    const s = (mx - mn) / mx;
    const s2 = Math.min(1, s*1.9 + 0.12);      // boost + a small floor so pale pixels still pop
    const denom = Math.max(1, mx - mn);
    const scale = (mx - mx*(1 - s2)) / denom;
    const nr = mx - (mx - r) * scale;
    const ng = mx - (mx - g) * scale;
    const nb = mx - (mx - b) * scale;
    return `rgb(${nr|0},${ng|0},${nb|0})`;
  };
  // Riso: two flat spot inks picked by pixel warmth — warm pixels print in fluoro pink, cool
  // pixels in teal, both on off-white paper (the duotone riso print look).
  const risoInk = (r,g,b) => (r > b) ? 'rgb(255,68,130)' : 'rgb(48,190,210)';
  const inkFor = (r,g,b) => {
    if (mono) return monoInk;
    if (kind==='neon') return neonInk(r,g,b);
    if (kind==='riso') return risoInk(r,g,b);
    return fixedInk || `rgb(${r|0},${g|0},${b|0})`;
  };

  const sampleAvg = (px, py, rr) => {
    const x0 = Math.max(0, Math.floor(px - rr));
    const y0 = Math.max(0, Math.floor(py - rr));
    const x1 = Math.min(w, Math.ceil(px + rr));
    const y1 = Math.min(h, Math.ceil(py + rr));
    let r=0, g=0, b=0, n=0;
    for (let yy=y0; yy<y1; yy++) for (let xx=x0; xx<x1; xx++){
      const i=(yy*w+xx)*4; r+=src[i]; g+=src[i+1]; b+=src[i+2]; n++;
    }
    if (n===0){
      const ix=Math.max(0,Math.min(w-1,px|0)), iy=Math.max(0,Math.min(h-1,py|0)), q=(iy*w+ix)*4;
      return {r:src[q], g:src[q+1], b:src[q+2]};
    }
    return {r:r/n, g:g/n, b:b/n};
  };
  const litRad = (r,g,b,maxR) => {
    // Packed Round stays fully packed for pixel-colour LED backgrounds. With a single
    // fixed ink colour, preserve the halftone signal through tile size instead.
    if (shape===6 && !fixedInk) return maxR;
    if (fixedDots) return maxR*0.72;
    const lum=(r*0.3+g*0.59+b*0.11)/255;
    // dark bg → bright pixels big; light bg → dark pixels big; Invert flips that. The XOR-ish
    // (dark===invert) form is the shortest way to express those four combinations.
    let dotness = (dark===invert) ? 1-lum : lum;
    if (threshold) dotness = dotness >= 0.5 ? 1 : 0;
    return Math.sqrt(dotness) * maxR;
  };
  const paint = (px,py,rad,r,g,b,kind,rot=0) => {
    if (rad<0.35) return;
    sctx.fillStyle = inkFor(r,g,b);
    sctx.beginPath();
    if (kind===1){
      // Square rotates with the grid so tilted grids read as a rotated dot matrix, not a
      // tilted lattice of axis-aligned squares.
      const c=Math.cos(rot), s=Math.sin(rot);
      const ax=c*rad, ay=s*rad, bx=-s*rad, by=c*rad;
      sctx.moveTo(px-ax-bx, py-ay-by);
      sctx.lineTo(px+ax-bx, py+ay-by);
      sctx.lineTo(px+ax+bx, py+ay+by);
      sctx.lineTo(px-ax+bx, py-ay+by);
      sctx.closePath();
    } else if (kind===6){
      // Packed Round: rounded-square tiles touch on the four cardinal sides while
      // their corners leave a four-point negative-space star between neighbouring cells.
      sctx.roundRect(px-rad,py-rad,rad*2,rad*2,rad*.48);
    } else if (kind===2){
      for(let k=0;k<3;k++){ const a=rot-Math.PI/2+k*Math.PI*2/3; const qx=px+Math.cos(a)*rad, qy=py+Math.sin(a)*rad; k?sctx.lineTo(qx,qy):sctx.moveTo(qx,qy); }
      sctx.closePath();
    } else if (kind===3){
      for(let k=0;k<6;k++){ const a=rot-Math.PI/2+k*Math.PI/3; const qx=px+Math.cos(a)*rad, qy=py+Math.sin(a)*rad; k?sctx.lineTo(qx,qy):sctx.moveTo(qx,qy); }
      sctx.closePath();
    } else {
      sctx.arc(px, py, rad, 0, Math.PI*2);
    }
    sctx.fill();
  };

  if (shape<2 || shape===6){
    // Square lattice: iterate (ix, iy) in lattice space, rotate to canvas coords.
    const nHalf = Math.ceil(halfDiag/cell) + 1;
    for (let iy=-nHalf; iy<=nHalf; iy++){
      for (let ix=-nHalf; ix<=nHalf; ix++){
        const u=(ix+0.5)*cell, v=(iy+0.5)*cell;
        const x=cxC + u*cos - v*sin, y=cyC + u*sin + v*cos;
        if (x<-cell||x>w+cell||y<-cell||y>h+cell) continue;
        const s=sampleAvg(x, y, cell*0.5);
        const maxR=shape===6 ? cell*0.515 : cell*0.62;
        paint(x, y, litRad(s.r,s.g,s.b,maxR), s.r, s.g, s.b, shape, angle);
      }
    }
  } else if (shape===2){
    // Triangular tessellation. Each strip of height triH holds one down- and one up-pointing
    // triangle per cell width, and adjacent strips are offset horizontally by cell/2 so the
    // vertices line up — otherwise triangles overlap where the offset was missing.
    const triH=cell*Math.sqrt(3)/2, triR=cell/Math.sqrt(3);
    const halfRow=Math.ceil(halfDiag/triH)+1, halfCol=Math.ceil(halfDiag/cell)+1;
    for (let row=-halfRow; row<=halfRow; row++){
      const shift=(row&1) ? cell*0.5 : 0;
      for (let col=-halfCol; col<=halfCol; col++){
        // Down-pointing triangle: vertices (col*cell, 0)-((col+1)*cell, 0)-((col+.5)*cell, triH)
        // in strip 0. Centroid at ((col+.5)*cell, triH/3).
        {
          const u=(col+0.5)*cell+shift, v=row*triH + triH/3;
          const x=cxC + u*cos - v*sin, y=cyC + u*sin + v*cos;
          if (x>=-cell&&x<=w+cell&&y>=-cell&&y<=h+cell){
            const s=sampleAvg(x, y, triR*0.6);
            // maxR bumped by +1 so full-bright neighbours overlap 1px and hide the subpixel
            // seams that otherwise show as thin lines between packed triangles.
            paint(x, y, litRad(s.r,s.g,s.b,triR+1), s.r, s.g, s.b, 2, angle + Math.PI);
          }
        }
        // Up-pointing triangle: vertices (cell, 0)-((.5)cell, triH)-((1.5)cell, triH).
        // Centroid at (cell, 2*triH/3) — shifted by cell/2 from the down triangle.
        {
          const u=(col+1)*cell+shift, v=row*triH + 2*triH/3;
          const x=cxC + u*cos - v*sin, y=cyC + u*sin + v*cos;
          if (x>=-cell&&x<=w+cell&&y>=-cell&&y<=h+cell){
            const s=sampleAvg(x, y, triR*0.6);
            paint(x, y, litRad(s.r,s.g,s.b,triR+1), s.r, s.g, s.b, 2, angle);
          }
        }
      }
    }
  } else if (shape===3){
    // Pointy-top hexagonal tessellation. Rows stack at dy=1.5*hr; adjacent ROWS (not columns)
    // are offset horizontally by dx/2 so corners meet. The previous per-column vertical offset
    // was a flat-top pattern and left the pointy-top hexes overlapping.
    const hr=cell*0.58, dx=hr*Math.sqrt(3), dy=hr*1.5;
    const halfRow=Math.ceil(halfDiag/dy)+1, halfCol=Math.ceil(halfDiag/dx)+1;
    for (let row=-halfRow; row<=halfRow; row++){
      const rowShift=(row&1) ? dx*0.5 : 0;
      for (let col=-halfCol; col<=halfCol; col++){
        const u=col*dx+rowShift, v=row*dy;
        const x=cxC + u*cos - v*sin, y=cyC + u*sin + v*cos;
        if (x<-cell||x>w+cell||y<-cell||y>h+cell) continue;
        const s=sampleAvg(x, y, hr*0.6);
        // maxR bumped by +1 so full-bright neighbouring hexagons overlap 1px and hide seams.
        paint(x, y, litRad(s.r,s.g,s.b,hr+1), s.r, s.g, s.b, 3, angle);
      }
    }
  } else if (shape===7){
    // Packed Circle: circles on a staggered hexagonal close-packing lattice.
    const r=cell*.5, dx=Math.sqrt(3)*r, dy=1.5*r;
    const halfRow=Math.ceil(halfDiag/dy)+1, halfCol=Math.ceil(halfDiag/dx)+1;
    for(let row=-halfRow;row<=halfRow;row++) for(let col=-halfCol;col<=halfCol;col++){
      const u=col*dx+(row&1)*dx*.5,v=row*dy;
      const x=cxC+u*cos-v*sin,y=cyC+u*sin+v*cos;
      if(x<-cell||x>w+cell||y<-cell||y>h+cell) continue;
      const s=sampleAvg(x,y,r*.6); paint(x,y,litRad(s.r,s.g,s.b,r),s.r,s.g,s.b,0,angle);
    }
  } else if (shape===4){
    // Line screen: each row of the lattice is one parallel line whose thickness follows the
    // brightness at every cell along it (the other classic halftone screen, alongside dots).
    // Adjacent bars in the same row butt against each other so a smoothly-varying brightness
    // reads as one continuous line; Grid Angle rotates the whole screen.
    const nHalf = Math.ceil(halfDiag/cell) + 1;
    // +0.5 on both axes overpaints subpixel seams: along-line so adjacent bars in the same
    // row overlap where they butt end-to-end, across-line so full-bright bars in adjacent
    // rows touch cleanly instead of leaving a hairline gap between them.
    const halfW = cell*0.5 + 0.5;                       // along the line — full cell + overpaint
    const ax = cos*halfW, ay = sin*halfW;               // along-line half-extent (fixed)
    for (let iy=-nHalf; iy<=nHalf; iy++){
      for (let ix=-nHalf; ix<=nHalf; ix++){
        const u=(ix+0.5)*cell, v=(iy+0.5)*cell;
        const x=cxC + u*cos - v*sin, y=cyC + u*sin + v*cos;
        if (x<-cell||x>w+cell||y<-cell||y>h+cell) continue;
        const s=sampleAvg(x, y, cell*0.5);
        const half = litRad(s.r,s.g,s.b, cell*0.5 + 0.5); // across-line half-thickness (+ overpaint)
        if (half<0.35) continue;
        const bx = -sin*half, by = cos*half;              // across-line direction (variable)
        sctx.fillStyle = inkFor(s.r, s.g, s.b);
        sctx.beginPath();
        sctx.moveTo(x-ax-bx, y-ay-by);
        sctx.lineTo(x+ax-bx, y+ay-by);
        sctx.lineTo(x+ax+bx, y+ay+by);
        sctx.lineTo(x-ax+bx, y-ay+by);
        sctx.closePath();
        sctx.fill();
      }
    }
  } else if (shape===5){
    // CMYK / RGB Screen: three sub-dots per cell for a real three-channel colour separation.
    // On a light bg the ink is C/M/Y with 'multiply' — proper CMYK print colour where overlaps
    // build toward black. On a dark bg it flips to R/G/B with 'lighter' — additive phosphor,
    // the LCD/LED subpixel look. Ink Mapping's Invert flips per-channel strength, Threshold
    // hard-clips each channel to on/off, Mono forces the sub-dots to a single neutral ink so
    // the 3-per-cell pattern still reads as grayscale.
    const nHalf = Math.ceil(halfDiag/cell) + 1;
    const subR = cell * 0.34;
    const off = cell * 0.22;
    // Triangular arrangement of the 3 sub-positions inside each cell.
    const positions = [
      [-off*Math.cos(Math.PI/6),  off*Math.sin(Math.PI/6)],  // bottom-left
      [ off*Math.cos(Math.PI/6),  off*Math.sin(Math.PI/6)],  // bottom-right
      [0, -off],                                             // top
    ];
    const isPrint = !!bgP.light;
    const inks = isPrint ? [[0,255,255],[255,0,255],[255,255,0]] : [[255,60,60],[60,255,60],[60,120,255]];
    const prevBlend = sctx.globalCompositeOperation;
    sctx.globalCompositeOperation = isPrint ? 'multiply' : 'lighter';
    for (let iy=-nHalf; iy<=nHalf; iy++){
      for (let ix=-nHalf; ix<=nHalf; ix++){
        const u=(ix+0.5)*cell, v=(iy+0.5)*cell;
        const x=cxC + u*cos - v*sin, y=cyC + u*sin + v*cos;
        if (x<-cell||x>w+cell||y<-cell||y>h+cell) continue;
        const s=sampleAvg(x, y, cell*0.5);
        // Print → dot represents ink absorbed (255-channel); screen → dot represents light emitted.
        const chans = isPrint ? [255-s.r, 255-s.g, 255-s.b] : [s.r, s.g, s.b];
        for (let k=0; k<3; k++){
          let strength = chans[k] / 255;
          if (invert) strength = 1 - strength;
          if (threshold) strength = strength >= 0.5 ? 1 : 0;
          const rad = Math.sqrt(strength) * subR;
          if (rad < 0.35) continue;
          const [pu, pv] = positions[k];
          const dx = pu*cos - pv*sin, dy = pu*sin + pv*cos;
          const ink = mono ? monoInkRgb : inks[k];
          sctx.fillStyle = `rgb(${ink[0]},${ink[1]},${ink[2]})`;
          sctx.beginPath();
          sctx.arc(x+dx, y+dy, rad, 0, Math.PI*2);
          sctx.fill();
        }
      }
    }
    sctx.globalCompositeOperation = prevBlend;
  }

  ctx.save(); ctx.setTransform(1,0,0,1,0,0); ctx.drawImage(sc,0,0); ctx.restore();
  mixWithOriginal(w,h,before,P('halftone','mix'),ht.fade|0,ht.cover);
  ctx.setTransform(1,0,0,1,0,0);
}
}

function applyScreentone(w,h){
// ---- Manga Screentone: variable-density dot / line / cross-hatch patterns for manga shading.
//      Different from Halftone (single dot per fixed cell, size varies with luma) — this uses
//      REGULAR cell positions with density mapped to darkness (dots grow larger as tone gets
//      darker, or lines get thicker), with a hard-cut on/off decision at each pixel so the output
//      is BINARY (paper vs ink) instead of continuous. Range filters pick which tone bands get
//      screened: keeping highlights untouched and just screening the mid-tones / shadows is the
//      real manga convention (whites stay whites, shadows get the tone). Ink modes: Black on
//      Paper (standard), White on Ink (inverted, for night scenes), Coloured (keeps source hue
//      but posterises to two tones per band). Pattern types: variable dots (size), lines
//      (thickness), cross-hatch (two-axis lines), radial dots (checker offset), gradient dots
//      (soft-edged for smooth toning).
const st = state.screentone;
if (!(st.on && P('screentone','amount')>0)) return;
const amt = P('screentone','amount');
const pattern = st.pattern|0;
const cell = Math.max(2, st.cell|0);
const angle = (+st.angle || 0) * Math.PI/180;
const range = st.range|0;
const ink = st.ink|0;
const contrast = +st.contrast || 0;
const cs = Math.cos(angle), sn = Math.sin(angle);
const cxC = w/2, cyC = h/2;
const src = ctx.getImageData(0,0,w,h), s = src.data;
const out = ctx.createImageData(w,h), d = out.data;
for (let y=0; y<h; y++){
  for (let x=0; x<w; x++){
    const i = (y*w+x)*4;
    const lum = (0.299*s[i] + 0.587*s[i+1] + 0.114*s[i+2]) / 255;
    // Range gate — smoothly fades at the edges of the selected tone band so it isn't a hard clip.
    let inRange;
    if (range===0) inRange = 1;
    else if (range===1) inRange = lum < 0.72 ? 1 : Math.max(0, 1 - (lum-0.72)/0.18);
    else if (range===2) inRange = lum < 0.4 ? 1 : Math.max(0, 1 - (lum-0.4)/0.15);
    else if (range===3){ const dm=lum-0.5; inRange = Math.max(0, 1 - Math.abs(dm)*4); }
    else                 inRange = lum > 0.68 ? 1 : Math.max(0, 1 - (0.68-lum)/0.18);
    if (inRange < 0.01){
      d[i]=s[i]; d[i+1]=s[i+1]; d[i+2]=s[i+2]; d[i+3]=255; continue;
    }
    // Screen density — darker pixels get more ink. Contrast expands the range so mids can be
    // pushed toward pure dark or pure light.
    let density = 1 - lum;
    density = Math.pow(density, 1 - contrast*0.5) * (1 + contrast*0.4);
    if (density < 0) density = 0; else if (density > 1) density = 1;
    // Rotated screen coord (so all patterns can tilt with Screen Angle).
    const dx = x - cxC, dy = y - cyC;
    const rx = dx*cs - dy*sn, ry = dx*sn + dy*cs;
    // Decide if this pixel is "on ink". Different pattern strategies:
    let onInk = false, softMask = 0;
    if (pattern===0){                                                  // variable dot size
      const px = Math.round(rx/cell)*cell, py = Math.round(ry/cell)*cell;
      const ddx = rx-px, ddy = ry-py;
      const dr = Math.sqrt(ddx*ddx + ddy*ddy);
      const R = cell * 0.5 * Math.sqrt(density);
      onInk = dr <= R;
    } else if (pattern===1){                                           // parallel lines, thickness by density
      const lineP = ry - Math.round(ry/cell)*cell;                     // signed distance to nearest line centre
      onInk = Math.abs(lineP) < cell*density*0.5;
    } else if (pattern===2){                                           // cross-hatch
      const lp1 = ry - Math.round(ry/cell)*cell;
      const lp2 = rx - Math.round(rx/cell)*cell;
      const t = cell*density*0.45;
      onInk = Math.abs(lp1) < t || Math.abs(lp2) < t;
    } else if (pattern===3){                                           // radial dots (offset checker)
      const row = Math.round(ry/cell), col = Math.round(rx/cell);
      const cshift = (row & 1) ? cell*0.5 : 0;
      const px = col*cell + cshift, py = row*cell;
      const ddx = rx-px, ddy = ry-py;
      const dr = Math.sqrt(ddx*ddx + ddy*ddy);
      const R = cell * 0.5 * Math.sqrt(density);
      onInk = dr <= R;
    } else {                                                            // gradient (soft) dots
      const px = Math.round(rx/cell)*cell, py = Math.round(ry/cell)*cell;
      const ddx = rx-px, ddy = ry-py;
      const dr = Math.sqrt(ddx*ddx + ddy*ddy) / (cell*0.5);
      const R = Math.sqrt(density);
      softMask = Math.max(0, Math.min(1, (R - dr) * 3));                // partial-coverage soft dot
      onInk = softMask > 0;
    }
    // Ink and paper colours.
    let paperR, paperG, paperB, inkR, inkG, inkB;
    if (ink===0){                                                       // Black on Paper
      paperR=245; paperG=242; paperB=234; inkR=18; inkG=18; inkB=22;
    } else if (ink===1){                                                // White on Ink
      paperR=15; paperG=14; paperB=18; inkR=232; inkG=232; inkB=228;
    } else {                                                             // Coloured — keep source hue
      // paper = lightened source, ink = darkened source (posterise into two tones)
      paperR = 235 + (s[i]-235)*0.35; paperG = 235 + (s[i+1]-235)*0.35; paperB = 235 + (s[i+2]-235)*0.35;
      inkR = s[i]*0.32; inkG = s[i+1]*0.32; inkB = s[i+2]*0.32;
    }
    let outR, outG, outB;
    if (pattern===4){                                                    // soft dot: alpha-blend paper→ink
      outR = paperR + (inkR - paperR)*softMask;
      outG = paperG + (inkG - paperG)*softMask;
      outB = paperB + (inkB - paperB)*softMask;
    } else if (onInk){ outR=inkR; outG=inkG; outB=inkB; }
    else               { outR=paperR; outG=paperG; outB=paperB; }
    const mix = amt * inRange;
    d[i]   = s[i]   + (outR - s[i])   * mix;
    d[i+1] = s[i+1] + (outG - s[i+1]) * mix;
    d[i+2] = s[i+2] + (outB - s[i+2]) * mix;
    d[i+3] = 255;
  }
}
ctx.putImageData(out, 0, 0);
}

function applyEmboss(w,h){
// ---- emboss: directional-gradient relief ----
const emb = state.emboss;
if (emb.on && emb.amount>0){
  const a=P('emboss','amount')*2.5, mix=emb.mix, rad=emb.angle*Math.PI/180;
  // Keep-colour: ease-out curve so colour ramps in sooner (linear left it near-grey at low values)
  const mixC = mix>0 ? Math.pow(mix, 0.55) : 0;
  let ox=Math.round(Math.cos(rad)), oy=Math.round(Math.sin(rad));
  if (ox===0&&oy===0) ox=1;
  const src=ctx.getImageData(0,0,w,h), out=ctx.createImageData(w,h), sd=src.data, od=out.data;
  for (let y=0;y<h;y++){
    const ny=Math.max(0,Math.min(h-1,y+oy));
    for (let x=0;x<w;x++){
      const i=(y*w+x)*4, nx=Math.max(0,Math.min(w-1,x+ox)), j=(ny*w+nx)*4;
      const lh=sd[i]*0.3+sd[i+1]*0.59+sd[i+2]*0.11, ln=sd[j]*0.3+sd[j+1]*0.59+sd[j+2]*0.11;
      let vv=128+(lh-ln)*a; vv=vv<0?0:vv>255?255:vv;
      if (mix<=0){ od[i]=od[i+1]=od[i+2]=vv; }
      else { const sh=vv/128;
        od[i]  =vv+(sd[i]  *sh-vv)*mixC;
        od[i+1]=vv+(sd[i+1]*sh-vv)*mixC;
        od[i+2]=vv+(sd[i+2]*sh-vv)*mixC; }
      od[i+3]=255;
    }
  }
  ctx.putImageData(out,0,0);
}
}

function applyWireframe(w,h,phase){
// ---- Wireframe: SGI IRIS demo / Tron look. Sobel edges → glowing coloured lines, interior filled
//      with a chosen mode (black, flat posterised shading, dim source, chrome-lit posterise, or
//      transparent). Completely different from Emboss (which is a grey directional relief) — this
//      strips the image to LINES + FILL, the way an early-3DCG polygon renderer showed it before
//      shading. Line Tone picks the phosphor colour, Rainbow uses screen angle for the hue (spins
//      slowly with phase), RGB Per-channel takes edges from R/G/B separately for a chromatic-
//      aberrated wire look. Line Glow softens each edge over Line Thickness, so wide+glowy lines
//      read like a scan-converted CRT vector display.
const wf = state.wireframe;
if (!(wf.on && P('wireframe','amount')>0)) return;
const amt = P('wireframe','amount');
const threshold = 0.03 + wf.threshold*0.35;                            // 0.03..0.38 edge cutoff
const thick = Math.max(0, Math.round(wf.thickness*4));                 // 0..4 dilation radius
const glow = P('wireframe','glow');
const fill = wf.fill|0, tone = wf.tone|0, levels = Math.max(2, wf.levels|0);
const TONES = [
  [230,240,255],[80,240,220],[80,255,120],[255,200,80], null, null,
];
const toneC = TONES[tone];
const src = ctx.getImageData(0,0,w,h), s = src.data;
const out = ctx.createImageData(w,h), d = out.data;
// per-channel gradient magnitudes (for RGB Per-channel tone we keep separate channels; else we
// collapse to luma). Precompute luma once so Sobel is O(N).
const CH = (tone===5) ? 3 : 1;
const chans = new Array(CH);
for (let c=0; c<CH; c++) chans[c] = new Uint8ClampedArray(w*h);
if (CH===1){
  for (let i=0, p=0; i<s.length; i+=4, p++) chans[0][p] = 0.299*s[i] + 0.587*s[i+1] + 0.114*s[i+2];
} else {
  for (let i=0, p=0; i<s.length; i+=4, p++){ chans[0][p]=s[i]; chans[1][p]=s[i+1]; chans[2][p]=s[i+2]; }
}
// gradient magnitude per channel; kept separately so RGB Per-channel can colour each channel's
// edge in its own hue afterwards.
const grads = new Array(CH); for (let c=0; c<CH; c++) grads[c] = new Float32Array(w*h);
for (let c=0; c<CH; c++){
  const src_c = chans[c], dst = grads[c];
  for (let y=1; y<h-1; y++){
    const row = y*w;
    for (let x=1; x<w-1; x++){
      const p = row+x;
      const gxV = -src_c[p-w-1]-2*src_c[p-1]-src_c[p+w-1] + src_c[p-w+1]+2*src_c[p+1]+src_c[p+w+1];
      const gyV = -src_c[p-w-1]-2*src_c[p-w]-src_c[p-w+1] + src_c[p+w-1]+2*src_c[p+w]+src_c[p+w+1];
      dst[p] = Math.sqrt(gxV*gxV + gyV*gyV) / 1020;
    }
  }
}
// Separable dilation (max filter) → line thickness, then a small blur → line glow. Doing the two
// as a single hybrid horiz+vert max pass keeps it O(k) rather than O(k²).
const dilated = new Array(CH); for (let c=0; c<CH; c++) dilated[c] = new Float32Array(w*h);
if (thick>0){
  const temp = new Float32Array(w*h);
  for (let c=0; c<CH; c++){
    const grad = grads[c], dst = dilated[c];
    for (let y=0; y<h; y++) for (let x=0; x<w; x++){
      let mx=0; const x0=Math.max(0,x-thick), x1=Math.min(w-1,x+thick);
      for (let xx=x0; xx<=x1; xx++){ const v=grad[y*w+xx]; if (v>mx) mx=v; }
      temp[y*w+x] = mx;
    }
    for (let y=0; y<h; y++) for (let x=0; x<w; x++){
      let mx=0; const y0=Math.max(0,y-thick), y1=Math.min(h-1,y+thick);
      for (let yy=y0; yy<=y1; yy++){ const v=temp[yy*w+x]; if (v>mx) mx=v; }
      dst[y*w+x] = mx;
    }
  }
} else {
  for (let c=0; c<CH; c++) dilated[c] = grads[c];
}
// Compose output
const cx = w/2, cy = h/2;
for (let y=0; y<h; y++){
  for (let x=0; x<w; x++){
    const i = (y*w+x)*4, p = y*w+x;
    // Edge strength (soft): saturates above threshold, ramps below.
    let e; if (CH===1){
      const v = dilated[0][p];
      e = v>=threshold ? 1 : (v/threshold)*0.35 + glow*(v/threshold)*0.4;
    } else {
      const vr = dilated[0][p], vg = dilated[1][p], vb = dilated[2][p];
      e = Math.max(vr,vg,vb) >= threshold ? 1 : (Math.max(vr,vg,vb)/threshold)*0.35 + glow*0.3;
    }
    // Interior fill
    let fr, fg, fb, fa = 1;
    const lum = 0.299*s[i]+0.587*s[i+1]+0.114*s[i+2];
    if (fill===0){ fr=fg=fb=0; }
    else if (fill===1){                                                // Flat Shade (posterised)
      const lv = Math.round(lum/255*(levels-1))/(levels-1);
      fr = 30 + lv*80; fg = 40 + lv*90; fb = 60 + lv*120;
    } else if (fill===2){                                              // Dim Source
      fr = s[i]*0.28; fg = s[i+1]*0.28; fb = s[i+2]*0.28;
    } else if (fill===3){                                              // Chrome-lit posterise — coloured tone bands
      const lv = Math.round(lum/255*(levels-1))/(levels-1);
      const c = hsv(200 + lv*160 + phase*30, 0.55, 0.15 + lv*0.75);
      fr = c[0]; fg = c[1]; fb = c[2];
    } else { fr=s[i]; fg=s[i+1]; fb=s[i+2]; fa=0; }                    // Transparent (skip fill blend)
    // Line colour
    let lr, lg, lb;
    if (tone===4){                                                     // Rainbow angular
      const ang = (Math.atan2(y-cy, x-cx)/(Math.PI*2) + 0.5 + phase*0.15);
      const c = hsv(ang*360, 0.85, 1);
      lr = c[0]; lg = c[1]; lb = c[2];
    } else if (tone===5){                                              // RGB Per-channel
      const vr=dilated[0][p], vg=dilated[1][p], vb=dilated[2][p];
      const norm = Math.max(1e-4, Math.max(vr,vg,vb));
      lr = 255*(vr/norm); lg = 255*(vg/norm); lb = 255*(vb/norm);
    } else { lr = toneC[0]; lg = toneC[1]; lb = toneC[2]; }
    // Line + optional glow halo
    const boost = 1 + glow*1.2;
    const eE = Math.min(1, e*boost);
    // Compose: line on top of fill (unless fill=Transparent → keep source visible outside lines)
    let outR, outG, outB;
    if (fa===0){                                                       // Transparent fill: only draw lines
      outR = s[i]   + (lr - s[i])   * eE;
      outG = s[i+1] + (lg - s[i+1]) * eE;
      outB = s[i+2] + (lb - s[i+2]) * eE;
    } else {
      outR = fr + (lr - fr) * eE;
      outG = fg + (lg - fg) * eE;
      outB = fb + (lb - fb) * eE;
    }
    d[i]   = s[i]   + (outR - s[i])   * amt;
    d[i+1] = s[i+1] + (outG - s[i+1]) * amt;
    d[i+2] = s[i+2] + (outB - s[i+2]) * amt;
    d[i+3] = 255;
  }
}
ctx.putImageData(out,0,0);
}

function applyPosterize(w,h){
// ---- posterize: quantise channels to N levels, optional ordered (Bayer) dither ----
const pz = state.posterize;
if (pz.on){
  const L=Math.max(2,Math.round(pz.levels)), step=255/(L-1), dith=pz.dither;
  const bayer=[0,8,2,10, 12,4,14,6, 3,11,1,9, 15,7,13,5];
  const id=ctx.getImageData(0,0,w,h), d=id.data;
  for (let y=0;y<h;y++){ const brow=(y&3)*4;
    for (let x=0;x<w;x++){ const i=(y*w+x)*4;
      const dofs = dith>0 ? (bayer[brow+(x&3)]/16-0.5)*step*dith : 0;
      for (let c=0;c<3;c++){ let v=d[i+c]+dofs; v=v<0?0:v>255?255:v; d[i+c]=Math.round(v/step)*step; }
    }
  }
  ctx.putImageData(id,0,0);
}
}

function applySolarize(w,h){
// ---- solarize: per-channel invert above a threshold (Sabattier) ----
const sol = state.solarize;
if (sol.on && sol.amount>0){
  const t=sol.threshold*255, a=P('solarize','amount');
  const id=ctx.getImageData(0,0,w,h), d=id.data;
  for (let i=0;i<d.length;i+=4){
    for (let c=0;c<3;c++){ const vv=d[i+c]; const sv=vv>t?255-vv:vv; d[i+c]=vv+(sv-vv)*a; }
  }
  ctx.putImageData(id,0,0);
}
}

function applyDuotone(w,h){
// ---- duotone: map luminance onto a two-colour gradient ----
const duo = state.duotone;
if (duo.on && duo.amount>0){
  const pr=DUO_PAIRS[duo.preset]||DUO_PAIRS[0], s=pr[0], hi=pr[1], a=P('duotone','amount');
  const id=ctx.getImageData(0,0,w,h), d=id.data;
  for (let i=0;i<d.length;i+=4){
    const lum=(d[i]*0.3+d[i+1]*0.59+d[i+2]*0.11)/255;
    const r=s[0]+(hi[0]-s[0])*lum, g=s[1]+(hi[1]-s[1])*lum, b=s[2]+(hi[2]-s[2])*lum;
    d[i]=d[i]+(r-d[i])*a; d[i+1]=d[i+1]+(g-d[i+1])*a; d[i+2]=d[i+2]+(b-d[i+2])*a;
  }
  ctx.putImageData(id,0,0);
}
}

// shared HSV→RGB (used by the rainbow/gold hype effects). h in degrees, s/v in 0..1 → [r,g,b] 0..255
function hsv(h,s,v){ h=((h%360)+360)%360/60; const c=v*s, x=c*(1-Math.abs(h%2-1)), m=v-c;
  let r,g,b; if(h<1){r=c;g=x;b=0;} else if(h<2){r=x;g=c;b=0;} else if(h<3){r=0;g=c;b=x;}
  else if(h<4){r=0;g=x;b=c;} else if(h<5){r=x;g=0;b=c;} else {r=c;g=0;b=x;}
  return [Math.round((r+m)*255),Math.round((g+m)*255),Math.round((b+m)*255)]; }

function applyGold(w,h,phase){
// ---- Metallic: map luma to a metallic gradient (gold/chrome/rose/bronze/rainbow) with a shine band
//      sweeping over the loop. (id stays 'gold' for preset/URL compatibility.) ----
const gd = state.gold;
if (gd.on && gd.amount>0){
  const a = P('gold','amount'), shine = gd.shine, tone = gd.tone|0;
  // ramp: shadow → body → bright → specular
  const RAMPS = { 0:[[40,20,0],[150,95,10],[240,190,60],[255,244,200]],      // Gold
                  1:[[24,27,33],[120,128,140],[205,212,222],[255,255,255]],  // Silver / chrome
                  3:[[40,14,14],[168,90,88],[240,168,158],[255,236,226]],    // Rose
                  4:[[30,14,4],[128,68,28],[210,130,66],[255,222,180]] };    // Bronze / copper
  const ramp = RAMPS[tone] || RAMPS[0];
  const lerp3=(c0,c1,t)=>[c0[0]+(c1[0]-c0[0])*t, c0[1]+(c1[1]-c0[1])*t, c0[2]+(c1[2]-c0[2])*t];
  const map=(lum)=> tone===2 ? hsv(40+lum*90, 0.85, 0.2+lum*0.8)            // Rainbow-gold: hue swings with luma
    : lum<0.5 ? lerp3(ramp[0],ramp[1],lum/0.5)
    : lum<0.8 ? lerp3(ramp[1],ramp[2],(lum-0.5)/0.3)
    :           lerp3(ramp[2],ramp[3],(lum-0.8)/0.2);
  const speed=gd.speed|0||1, ang=(gd.angle|0)*Math.PI/180, cs=Math.cos(ang), sn=Math.sin(ang);
  const span=(Math.abs(cs)*w+Math.abs(sn)*h)||1, off0=Math.min(0,cs)*w+Math.min(0,sn)*h;   // normalise the projection to 0..1
  const bandPos=((phase*speed)%1+1)%1;                                       // shine sweeps along the angle, speed cycles/loop
  const id=ctx.getImageData(0,0,w,h), d=id.data;
  for (let p=0,i=0;i<d.length;i+=4,p++){
    const lum=(d[i]*0.3+d[i+1]*0.59+d[i+2]*0.11)/255;
    let c=map(lum), r=c[0], g=c[1], b=c[2];
    if (shine>0){
      const x=p%w, y=(p/w)|0, proj=(x*cs+y*sn-off0)/span;
      const dist=Math.abs(((proj-bandPos+1.5)%1)-0.5)*2;                     // wrapped → seamless at the loop
      const boost=Math.max(0,1-dist*6)*shine*190;                           // narrow specular band
      r=Math.min(255,r+boost); g=Math.min(255,g+boost); b=Math.min(255,b+boost*0.8);
    }
    d[i]+=(r-d[i])*a; d[i+1]+=(g-d[i+1])*a; d[i+2]+=(b-d[i+2])*a;
  }
  ctx.putImageData(id,0,0);
}
}

function applyChromeReflect(w,h,phase){
// ---- Chrome Reflect: environment-mapped chrome — a REFLECTION model, not a tonemap. The picture's
//      luma is a HEIGHT map giving per-pixel surface normals; the view is reflected around each
//      normal and the resulting direction samples an env-map. Three things make it read as chrome
//      instead of Emboss (which is what a smooth env would collapse to): env is a HIGH-FREQUENCY
//      studio card (sharp coloured horizontal bars, not a smooth gradient) so small normal shifts
//      cause big colour flips; a bright SUN hot spot sits in the env at a position tied to Light
//      Angle, so flat regions light up whenever their reflection direction points at the sun (real
//      chrome's give-away — you always see the light source in it); Blinn-Phong specular + Fresnel
//      rim glow add hot glints on ridges and bright edges at glancing angles. Light Spin walks the
//      sun around the frame at integer turns/loop, so a seamless "sun travelling over polished
//      chrome" pass rolls through the surface.
const cr = state.chrome;
if (!(cr.on && P('chrome','amount')>0)) return;
const amt = P('chrome','amount');
const bump = +cr.bump || 0, spec = P('chrome','spec');
const env = cr.env|0;
const spin = cr.spin|0;
const bumpScale = 6 * bump + 0.8;                                      // never fully zero so detail always reads
const lightRad = (cr.light|0)*Math.PI/180 + phase*spin*Math.PI*2;      // seamless (integer spin)
const Lx = Math.cos(lightRad)*0.85, Ly = Math.sin(lightRad)*0.85, Lz = 0.55;
const Ll = Math.hypot(Lx,Ly,Lz);
const nLx = Lx/Ll, nLy = Ly/Ll, nLz = Lz/Ll;
// Sun sits in env near the reflection direction of the light. Tracks Light Spin so as the light
// moves, the sun in the reflection walks across the frame at the same rate.
const sunX = nLx*0.7, sunY = nLy*0.7 - 0.15;
// Env presets: banded studio cards + colour hot palette. High-frequency bands with a bright
// specular sun disc — small normal variations cause visible flips between bands, exactly the
// "shifting mirror" look real chrome has (and what a smooth gradient env can never fake).
const ENVS = [
  { bars:[[6,4,10],[28,44,110],[110,170,240],[240,240,248],[220,170,110],[70,45,20],[8,6,4]],
    sun:[255,244,220], sunR:0.28 },   // 0 Sky / Ground
  { bars:[[8,4,32],[220,84,180],[8,6,20],[16,220,220],[6,8,40],[220,80,180],[10,4,30]],
    sun:[255,120,255], sunR:0.24 },   // 1 Neon
  { bars:[[80,40,140],[220,80,120],[255,150,80],[255,200,120],[220,140,50],[100,50,20],[20,10,6]],
    sun:[255,220,180], sunR:0.32 },   // 2 Sunset
  { bars:[[255,255,255],[210,210,215],[130,130,138],[70,70,76],[30,30,34],[10,10,12]],
    sun:[255,255,255], sunR:0.36 },   // 3 Studio Grey — classic product-shot lighting card
  null,                                // 4 Rainbow — computed
  { bars:[[180,210,250],[230,240,255],[255,250,220],[200,150,110],[80,55,35],[25,18,12]],
    sun:[255,242,200], sunR:0.22 },   // 5 Chrome Ball — smoother chrome-sphere card
];
const envSpec = ENVS[env] || ENVS[0];
const src = ctx.getImageData(0,0,w,h), s = src.data;
const out = ctx.createImageData(w,h), d = out.data;
const clamp = (v,m) => v<0?0:v>=m?m-1:v;
for (let y=0; y<h; y++){
  const posY = y/h*2 - 1;                                               // -1 top, +1 bottom — small env bias per row
  for (let x=0; x<w; x++){
    const i = (y*w+x)*4;
    // Sobel-ish gradient from luma differences of the 4 axis neighbours = local surface tilt.
    const iL=(y*w+clamp(x-1,w))*4, iR=(y*w+clamp(x+1,w))*4;
    const iU=(clamp(y-1,h)*w+x)*4, iD=(clamp(y+1,h)*w+x)*4;
    const lL=0.299*s[iL]+0.587*s[iL+1]+0.114*s[iL+2];
    const lR=0.299*s[iR]+0.587*s[iR+1]+0.114*s[iR+2];
    const lU=0.299*s[iU]+0.587*s[iU+1]+0.114*s[iU+2];
    const lD=0.299*s[iD]+0.587*s[iD+1]+0.114*s[iD+2];
    const gx=(lR-lL)/255, gy=(lD-lU)/255;
    let nx = -gx*bumpScale, ny = -gy*bumpScale, nz = 1;
    const nl = Math.sqrt(nx*nx + ny*ny + 1);
    nx /= nl; ny /= nl; nz /= nl;
    // Reflect view v=(0,0,-1) around N → r = (2·Nz·Nx, 2·Nz·Ny, ·).
    const rx = 2*nz*nx, ry = 2*nz*ny;
    // Env lookup uses reflection direction combined with a small posY bias so even flat regions
    // (nearly-uniform normals across a plateau) still see env variation from top to bottom.
    const envRx = rx, envRy = ry*0.9 + posY*0.25;
    let er, eg, eb;
    if (env===4){
      const ang = (Math.atan2(envRy, envRx)/(Math.PI*2) + 0.5 + phase*0.25);
      const c = hsv(ang*360, 0.85, 0.85);
      er = c[0]; eg = c[1]; eb = c[2];
    } else {
      const bars = envSpec.bars;
      const t = Math.max(0, Math.min(0.9999, envRy*0.5 + 0.5));
      const bp = t * (bars.length - 1);
      const b0 = bars[bp|0], b1 = bars[(bp|0)+1] || bars[bars.length-1];
      const bf = bp - (bp|0);
      er = b0[0] + (b1[0]-b0[0])*bf;
      eg = b0[1] + (b1[1]-b0[1])*bf;
      eb = b0[2] + (b1[2]-b0[2])*bf;
      // Sun hot spot: bright disc that flares wherever the reflection direction is close to the
      // light. THIS is what tells the eye "chrome" — a real light source visible in the mirror.
      const dxs = envRx - sunX, dys = envRy - sunY;
      const dSun = dxs*dxs + dys*dys;
      const glow = Math.max(0, 1 - dSun/(envSpec.sunR*envSpec.sunR));
      const g2 = glow*glow*glow;                                       // sharpen the sun disc
      er = Math.min(255, er + envSpec.sun[0]*g2);
      eg = Math.min(255, eg + envSpec.sun[1]*g2);
      eb = Math.min(255, eb + envSpec.sun[2]*g2);
    }
    // Blinn-Phong specular: bright where the half-vector between light and view (V=(0,0,1))
    // aligns with the normal. Shape-aware — clings to ridges instead of a global slab of shine.
    const hx = nLx, hy = nLy, hz = nLz + 1;
    const hl = Math.hypot(hx, hy, hz);
    const Hx = hx/hl, Hy = hy/hl, Hz = hz/hl;
    const ndoth = Math.max(0, nx*Hx + ny*Hy + nz*Hz);
    const shine = Math.pow(ndoth, 12 + 60*spec) * spec * 1.4;
    er = Math.min(255, er + 255*shine);
    eg = Math.min(255, eg + 255*shine);
    eb = Math.min(255, eb + 250*shine);
    // Fresnel rim — normals tilted far from view (small nz) catch a bright grazing highlight,
    // as they do on any real polished surface.
    const fresnel = Math.pow(1 - nz, 3.5);
    const rim = fresnel * 0.4;
    er = Math.min(255, er + (255-er)*rim);
    eg = Math.min(255, eg + (255-eg)*rim);
    eb = Math.min(255, eb + (255-eb)*rim);
    d[i]   = s[i]   + (er - s[i])   * amt;
    d[i+1] = s[i+1] + (eg - s[i+1]) * amt;
    d[i+2] = s[i+2] + (eb - s[i+2]) * amt;
    d[i+3] = 255;
  }
}
ctx.putImageData(out,0,0);
}

function applyRainbow(w,h,phase){
// ---- Colour Sweep: a colour field laid over the frame. Three styles share the same palette /
//      angle / speed axes. Full Gradient: colours cycling in place across a static gradient.
//      Travelling Wave: glowing band(s) that move across the frame, fading to nothing between
//      passes — the RGB-software colour-wave pulse look. Foil: fine diagonal diffraction bands
//      modulated by the picture's own luminance plus a moving sheen highlight — the hologram-
//      sticker look, only appears on brighter areas. Palette picks Rainbow or a curated set
//      (Fire / Candy / Festive). All three blend the same. ----
const rb = state.rainbow;
if (rb.on && rb.amount>0){
  const a=P('rainbow','amount'), ang=(rb.angle|0)*Math.PI/180, style=rb.style|0, tone=(rb.palette==null?2:rb.palette)|0;
  const tileN=Math.round(2+(+rb.tiles||0)*18), tileRot=(rb.tilemotion|0)===1;
  const tileSide=tileN>2 ? Math.min(w,h)/tileN : 0, tileCols=tileSide?Math.ceil(w/tileSide):0, tileRows=tileSide?Math.ceil(h/tileSide):0;
  const tileOX=tileSide?(w-tileCols*tileSide)/2:0, tileOY=tileSide?(h-tileRows*tileSide)/2:0;
  const tileAt=(x,y)=>{ const tx=tileSide?Math.max(0,Math.min(tileCols-1,Math.floor((x-tileOX)/tileSide))):0, ty=tileSide?Math.max(0,Math.min(tileRows-1,Math.floor((y-tileOY)/tileSide))):0; return {tx,ty,lx:tileSide?(x-(tileOX+tx*tileSide))/tileSide:.5,ly:tileSide?(y-(tileOY+ty*tileSide))/tileSide:.5}; };
  const BLEND=['overlay','screen','hue','soft-light'];
  if (style===1){
    const cs=Math.cos(ang), sn=Math.sin(ang), freq=Math.max(1,rb.bands|0), speed=+rb.speed||0;
    const width=rb.width==null?0.5:rb.width, kf=3.0-width*2.6;                // Wave Width: thin (kf 3.0) → wide (kf 0.4)
    const span=(Math.abs(cs)*w+Math.abs(sn)*h)||1, off0=Math.min(0,cs)*w+Math.min(0,sn)*h;
    const scroll=phase*speed;                                                // integer turns/loop → seamless
    sc.width=w; sc.height=h;
    const im=sctx.createImageData(w,h), d=im.data;
    for (let p=0,i=0;i<d.length;i+=4,p++){
      const x=p%w, y=(p/w)|0, proj=(x*cs+y*sn-off0)/span;
      const ti=tileAt(x,y), lx=ti.lx, ly=ti.ly, rr=tileRot ? phase*speed*Math.PI*2 : 0, lxx=lx-.5, lyy=ly-.5;
      const localProj=tileN>2 ? (tileRot ? (Math.atan2(lyy,lxx)/(Math.PI*2)+.5+phase*speed) % 1 : (lx*cs+ly*sn+1)/2) : proj, tilePhase=0;
      const bandFrac=((localProj*freq-scroll+tilePhase)%1+1)%1, dist=Math.abs(bandFrac-0.5)*2;
      const bp=Math.max(0,1-dist*kf); const bright=bp*bp;                    // squared falloff → a crisp travelling pulse
      if (bright<=0.002) continue;
      const c=hypeLerp(tone, scroll+bandFrac*0.2, 1);                        // colour drifts an integer no. of cycles/loop → seamless
      d[i]=c[0]; d[i+1]=c[1]; d[i+2]=c[2]; d[i+3]=Math.round(255*bright);
    }
    sctx.putImageData(im,0,0);
    ctx.save(); ctx.globalCompositeOperation=BLEND[rb.blend|0]||'overlay'; ctx.globalAlpha=a;
    ctx.drawImage(sc,0,0); ctx.restore();
  } else if (style===2){
    // Foil: fine diffraction bands modulated by picture luminance + a moving sheen across.
    // Reads on brighter areas (as a real hologram sticker only shows against light), so a dark
    // frame stays dark. Bands = band count, Sheen = strength of the sweeping specular highlight.
    const cs=Math.cos(ang), sn=Math.sin(ang), dens=Math.max(1,rb.bands|0), speed=+rb.speed||0;
    const span=(Math.abs(cs)*w+Math.abs(sn)*h)||1, off0=Math.min(0,cs)*w+Math.min(0,sn)*h;
    const sweep=((phase*speed)%1+1)%1;                                       // integer turns/loop → seamless
    const sheen=(+rb.sheen||0);
    const id=ctx.getImageData(0,0,w,h), d=id.data;
    for (let y=0;y<h;y++) for (let x=0;x<w;x++){
      const i=(y*w+x)*4, lum=(d[i]*0.299+d[i+1]*0.587+d[i+2]*0.114)/255;
      const proj=(x*cs+y*sn-off0)/span;
      const ti=tileAt(x,y), lx=ti.lx, ly=ti.ly, lxx=lx-.5, lyy=ly-.5;
      const localProj=tileRot ? (Math.atan2(lyy,lxx)/(Math.PI*2)+.5+phase*speed)%1 : (lx*cs+ly*sn+1)/2, tilePhase=0;
      const c=hypeLerp(tone, localProj*dens + phase*speed + tilePhase, 0.9); // each tile owns its foil phase
      const band=0.5+0.5*Math.sin(proj*dens*Math.PI*4);                      // fine ripple within each band
      const shDist=Math.abs(((proj-sweep+1.5)%1)-0.5)*2, sh=Math.max(0,1-shDist*4)*sheen;
      const wc=Math.min(1, a*(0.3+0.7*lum)*(0.4+0.6*band) + a*sh*lum);
      d[i]  +=(255-d[i])  *(c[0]/255)*wc;
      d[i+1]+=(255-d[i+1])*(c[1]/255)*wc;
      d[i+2]+=(255-d[i+2])*(c[2]/255)*wc;
    }
    ctx.putImageData(id,0,0);
  } else {
    if (tileN>2){
      const im=sctx.createImageData(w,h), d=im.data, rot=(rb.tilemotion|0)===1?phase*(+rb.speed||0)*Math.PI*2:0;
      for(let p=0,i=0;i<d.length;i+=4,p++){
        const x=p%w,y=(p/w)|0,ti=tileAt(x,y),lx=ti.lx-.5,ly=ti.ly-.5;
        const local=(rb.tilemotion|0)===1?(Math.atan2(ly,lx)/(Math.PI*2)+.5+phase*(+rb.speed||0)):( (ti.lx*Math.cos(ang)+ti.ly*Math.sin(ang)+1)/2 );
        const c=hypeLerp(tone,local,1);
        d[i]=c[0]; d[i+1]=c[1]; d[i+2]=c[2]; d[i+3]=255;
      }
      sctx.putImageData(im,0,0); ctx.save(); ctx.globalCompositeOperation=BLEND[rb.blend|0]||'overlay'; ctx.globalAlpha=a; ctx.drawImage(sc,0,0); ctx.restore();
      return;
    }
    const cx=w/2, cy=h/2, L=(Math.abs(Math.cos(ang))*w+Math.abs(Math.sin(ang))*h)/2;
    const g=ctx.createLinearGradient(cx-Math.cos(ang)*L, cy-Math.sin(ang)*L, cx+Math.cos(ang)*L, cy+Math.sin(ang)*L);
    const N=24, off=phase*(+rb.speed||0);                                     // zero speed = a still foil
    for(let i=0;i<=N;i++){ const c=hypeLerp(tone, i/N+off, 1); g.addColorStop(i/N, `rgb(${c[0]|0},${c[1]|0},${c[2]|0})`); }
    ctx.save(); ctx.globalCompositeOperation=BLEND[rb.blend|0]||'overlay'; ctx.globalAlpha=a;
    ctx.fillStyle=g; ctx.fillRect(0,0,w,h); ctx.restore();
  }
}
}

function applyDreamPalette(w,h,phase){
// ---- Dream Palette: psychedelic hue rotation on the source image itself. Colour Sweep lays a
//      new colour FIELD over the picture; this one instead ROTATES the picture's own hue so
//      colours drift as if the image is under LSD. Speed sets integer hue cycles per loop
//      (seamless), Spatial Pattern adds per-region phase offsets so different parts of the frame
//      cycle out of sync (Vertical / Horizontal bands, Radial rings, seeded Region grid, and
//      Kaleido wedges around the frame centre), Wave scales that spatial offset, Saturation
//      Boost pushes everything toward vivid, Flat Shading posterises Value into N flat plateaus
//      for a comic / cel-shaded read, and Hue Jitter adds a small per-pixel scatter so smooth
//      gradients read as flickery/noisy hues (that queasy dream feel). Everything is a pure
//      function of pixel + phase, so the loop closes cleanly.
const dr = state.dream;
if (!(dr.on && P('dream','amount')>0)) return;
const amt = P('dream','amount');
const speed = Math.max(0, dr.speed|0);                                 // integer turns/loop → seamless
const pattern = dr.pattern|0;
const wave = pattern===0 ? 0 : (+dr.wave || 0);
const sat = +dr.saturate || 1;
const flat = Math.max(1, dr.flat|0);
const jit = +dr.jitter || 0;
const globalHueTurns = phase * speed;                                  // in "turns" (0..speed)
const cx = w/2, cy = h/2, maxR = Math.hypot(cx, cy) || 1;
const src = ctx.getImageData(0,0,w,h), d = src.data;
for (let y=0; y<h; y++){
  for (let x=0; x<w; x++){
    const i = (y*w+x)*4;
    let spatial = 0;
    switch (pattern){
      case 1: spatial = (x/w) * wave; break;                            // Vertical Bands — hue shifts across x
      case 2: spatial = (y/h) * wave; break;                            // Horizontal Bands
      case 3: spatial = Math.hypot(x-cx, y-cy)/maxR * wave; break;      // Radial
      case 4:                                                            // Region Grid — chunky per-region hue
        spatial = rand(((x/32)|0)*13.7 + ((y/32)|0)*7.3) * wave; break;
      case 5:                                                            // Kaleido Wedges — hue by angle
        spatial = (Math.atan2(y-cy, x-cx)/(Math.PI*2) + 0.5) * wave; break;
    }
    const jitter = jit ? (rand(x*0.31 + y*0.17)*2 - 1) * jit * 0.5 : 0;
    const hueShiftDeg = ((globalHueTurns + spatial + jitter) % 1) * 360;
    const r = d[i], g = d[i+1], b = d[i+2];
    // Inline RGB → HSV so we don't allocate per pixel.
    const mx = r>g ? (r>b?r:b) : (g>b?g:b);
    const mn = r<g ? (r<b?r:b) : (g<b?g:b);
    const delta = mx - mn;
    let hh;
    if (delta===0) hh = 0;
    else if (mx===r) hh = ((g-b)/delta) % 6;
    else if (mx===g) hh = (b-r)/delta + 2;
    else             hh = (r-g)/delta + 4;
    hh = ((hh*60 + hueShiftDeg) % 360 + 360) % 360;
    let ss = mx===0 ? 0 : delta/mx;
    ss = Math.min(1, ss * sat);
    let vv = mx/255;
    if (flat>1) vv = Math.round(vv*(flat-1))/(flat-1);                 // posterise Value for flat shading
    const c = hsv(hh, ss, vv);                                          // shared hsv() → [0..255]
    d[i]   = d[i]   + (c[0] - d[i])   * amt;
    d[i+1] = d[i+1] + (c[1] - d[i+1]) * amt;
    d[i+2] = d[i+2] + (c[2] - d[i+2]) * amt;
  }
}
ctx.putImageData(src,0,0);
}

function applyPrism(w,h,phase){
// ---- Soft Prism: a few tinted, offset, blurred copies screened on top — smooth chromatic dispersion ----
const pr = state.prism;
if (pr.on && pr.amount>0){
  const amt=P('prism','amount'), spread=P('prism','spread')*22, blur=pr.blur*4;
  const rot=(pr.rot|0)*phase*Math.PI*2;                      // integer turns/loop → seamless
  const COLS=[[255,60,150],[70,220,255],[240,235,70]];       // magenta / cyan / yellow dispersion
  ctx.save(); ctx.globalCompositeOperation='screen'; ctx.globalAlpha=amt;
  for (let i=0;i<3;i++){
    const a=rot + i*(Math.PI*2/3), dx=Math.cos(a)*spread, dy=Math.sin(a)*spread;
    sc.width=w; sc.height=h; sctx.clearRect(0,0,w,h);
    sctx.filter = blur>0?`blur(${blur}px)`:'none'; sctx.drawImage(canvas,dx,dy); sctx.filter='none';
    sctx.globalCompositeOperation='multiply'; sctx.fillStyle=`rgb(${COLS[i][0]},${COLS[i][1]},${COLS[i][2]})`; sctx.fillRect(0,0,w,h);
    sctx.globalCompositeOperation='destination-in'; sctx.drawImage(canvas,dx,dy);   // keep only the shifted copy (no edge fill)
    sctx.globalCompositeOperation='source-over';
    ctx.drawImage(sc,0,0);
  }
  ctx.restore();
}
}

function applyStarFilter(w,h,phase){
// ---- Star Filter: isolate highlights, streak them along a few ray directions, screen back on ----
const st = state.starf;
if (st.on && st.amount>0){
  const amt=P('starf','amount'), thr=st.thresh, len=P('starf','length')*Math.max(w,h)*0.3, colour=st.colour|0;
  if (len<1) return;
  const RAYS=[4,6,8,2][st.rays|0]||4, base=(st.angle|0)*Math.PI/180;
  // local-highlight pass: keep each pixel by how much brighter it is than its blurred surroundings,
  // tinted by its OWN colour. A uniform (even white) area has no local excess → nothing streaks; only
  // genuine local highlights of any hue do. Black elsewhere = a no-op under the screen blend below.
  const R=Math.max(2, Math.min(w,h)*0.05), gain=3+(1-thr)*6;
  sc.width=w; sc.height=h; sctx.clearRect(0,0,w,h);
  sctx.filter=`blur(${R}px)`; sctx.drawImage(canvas,0,0); sctx.filter='none';
  const bl=sctx.getImageData(0,0,w,h).data, og=ctx.getImageData(0,0,w,h).data;
  const bp=sctx.createImageData(w,h), b=bp.data;
  for (let i=0;i<og.length;i+=4){
    const lo=(og[i]*0.299+og[i+1]*0.587+og[i+2]*0.114)/255;
    const lb=(bl[i]*0.299+bl[i+1]*0.587+bl[i+2]*0.114)/255;
    let match=1;
    if (colour>0){
      const mx=Math.max(og[i],og[i+1],og[i+2]), mn=Math.min(og[i],og[i+1],og[i+2]), sat=mx?((mx-mn)/mx):0;
      if (colour===8) match=sat<.18 ? 1 : 0;
      else { const h=(Math.atan2(Math.sqrt(3)*(og[i+1]-og[i+2]),2*og[i]-og[i+1]-og[i+2])/ (Math.PI*2)+1)%1; const target=[0,.08,.17,.33,.5,.67,.83][colour-1]||0; let d=Math.abs(h-target); d=Math.min(d,1-d); match=Math.max(0,1-d/.11)*Math.min(1,sat*2); }
    }
    const g=Math.min(1, Math.max(0, lo-lb-thr*0.12)*gain)*match;
    b[i]=og[i]*g; b[i+1]=og[i+1]*g; b[i+2]=og[i+2]*g; b[i+3]=255;
  }
  sctx.putImageData(bp,0,0);
  const K=10;
  ctx.save(); ctx.globalCompositeOperation='screen';
  const dirs = st.rays===3 ? [base,base+Math.PI] : Array.from({length:RAYS},(_,d)=>base+d*(Math.PI*2/RAYS));
  for (const a of dirs){
    const ux=Math.cos(a), uy=Math.sin(a);
    for (let k=1;k<=K;k++){ const t=k/K; ctx.globalAlpha=amt*(1-t)*0.5; ctx.drawImage(sc, ux*len*t, uy*len*t); }
  }
  ctx.restore();
}
}

function applyIridescence(w,h,phase){
// ---- Iridescent Film: an oil-slick sheen whose hue rides the edges and tones, drifting over the loop ----
const ir = state.iris;
if (ir.on && ir.amount>0){
  const amt=P('iris','amount'), aScale=ir.angscale, lScale=ir.lumascale, t=phase*360*(ir.speed|0), edgeOnly=(ir.edge|0)===1;
  const id=ctx.getImageData(0,0,w,h), d=id.data, luma=new Float32Array(w*h);
  for (let p=0,i=0;i<d.length;i+=4,p++) luma[p]=(d[i]*0.299+d[i+1]*0.587+d[i+2]*0.114)/255;
  for (let y=0;y<h;y++) for (let x=0;x<w;x++){
    const p=y*w+x, lum=luma[p];
    const gx=luma[y*w+Math.min(w-1,x+1)]-lum, gy=luma[Math.min(h-1,y+1)*w+x]-lum;
    const edge=Math.min(1,Math.hypot(gx,gy)*6), edgeAng=Math.atan2(gy,gx)/(Math.PI*2)*360;
    const col=hsv(edgeAng*aScale + lum*360*lScale + t, 0.8, 1);
    const wgt=amt*(edgeOnly ? edge : 0.35+0.65*edge), i4=p*4;
    d[i4]  += (255-d[i4])  *(col[0]/255)*wgt;
    d[i4+1]+= (255-d[i4+1])*(col[1]/255)*wgt;
    d[i4+2]+= (255-d[i4+2])*(col[2]/255)*wgt;
  }
  ctx.putImageData(id,0,0);
}
}

function applyPaper(w,h){
// ---- Paper Cutout: posterise into flat layers and drop a soft shadow where a taller layer sits above ----
const pp = state.paper;
if (pp.on && (pp.amount==null || pp.amount>0)){
  const amt=pp.amount==null?1:P('paper','amount'), N=Math.max(2,pp.levels|0);
  const depth=Math.round(pp.depth*Math.min(w,h)*0.03)+1, ang=(pp.angle|0)*Math.PI/180, tex=pp.texture;
  const ldx=Math.cos(ang), ldy=Math.sin(ang);
  const src=ctx.getImageData(0,0,w,h), s=src.data, L=new Uint8Array(w*h);
  for (let p=0,i=0;i<s.length;i+=4,p++){ const lum=(s[i]*0.299+s[i+1]*0.587+s[i+2]*0.114)/255; L[p]=Math.min(N-1,(lum*N)|0); }
  const q=(v)=>Math.min(255, Math.round(((v/255*N|0)+0.5)/N*255));       // flatten a channel toward its band
  const out=ctx.createImageData(w,h), o=out.data;
  for (let y=0;y<h;y++) for (let x=0;x<w;x++){
    const p=y*w+x, i=p*4, lv=L[p];
    let R=q(s[i]), G=q(s[i+1]), B=q(s[i+2]);
    let shadow=0;
    for (let dd=1; dd<=depth; dd++){ const nx=(x-ldx*dd)|0, ny=(y-ldy*dd)|0; if(nx<0||ny<0||nx>=w||ny>=h) break;
      if (L[ny*w+nx]>lv){ shadow=1-(dd-1)/depth; break; } }
    const sh=1-shadow*0.5; R*=sh; G*=sh; B*=sh;
    if (tex>0){ const n=(rand(x*0.7+y*1.3+0.5)-0.5)*tex*38; R+=n; G+=n; B+=n; }
    o[i]  = s[i]  +(R-s[i])  *amt;
    o[i+1]= s[i+1]+(G-s[i+1])*amt;
    o[i+2]= s[i+2]+(B-s[i+2])*amt;
    o[i+3]= 255;
  }
  ctx.putImageData(out,0,0);
}
}
