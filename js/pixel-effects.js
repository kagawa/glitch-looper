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
  if (s>1){
    const mix=P('pixelate','mix'), fade=px2.fade|0;
    const before = (mix<1||fade) ? ctx.getImageData(0,0,w,h) : null;
    const cover = px2.cover;
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

function applyHalftone(w,h){
// ---- halftone: dot-matrix (dark=LED colour dots / light=newsprint black dots) ----
const ht = state.halftone;
if (ht.on){
  const cell=Math.max(3,Math.round(ht.cell)), dark=ht.bg===0, before=ctx.getImageData(0,0,w,h), src=before.data;
  // ^ round: param drift (D) can hand us a fractional cell → fractional pixel indices → NaN → black frame
  ctx.fillStyle = dark ? '#0a0a0a' : '#f0ede6'; ctx.fillRect(0,0,w,h);
  for (let cy=0;cy<h;cy+=cell){
    for (let cx=0;cx<w;cx+=cell){
      let r=0,g=0,b=0,n=0;
      for (let y=cy;y<Math.min(h,cy+cell);y++) for (let x=cx;x<Math.min(w,cx+cell);x++){ const i=(y*w+x)*4; r+=src[i];g+=src[i+1];b+=src[i+2];n++; }
      r/=n; g/=n; b/=n;
      const lum=(r*0.3+g*0.59+b*0.11)/255;
      const rad=(dark?Math.sqrt(lum):Math.sqrt(1-lum))*cell*0.62;
      if (rad<0.35) continue;
      ctx.fillStyle = dark ? `rgb(${r|0},${g|0},${b|0})` : '#111';
      ctx.beginPath(); ctx.arc(cx+cell/2, cy+cell/2, rad, 0, 7); ctx.fill();
    }
  }
  mixWithOriginal(w,h,before,P('halftone','mix'),ht.fade|0,ht.cover);
}
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

function applyRainbow(w,h,phase){
// ---- Colour Sweep: a colour field laid over the frame — Full Gradient (colours cycling in place
//      across a static gradient) or Travelling Wave (glowing band(s) that genuinely move across the
//      frame, fading to nothing between passes — the RGB-software colour-wave pulse look). Palette
//      picks Rainbow (full spectrum) or a curated set (Fire / Candy / Festive). Both blend the same. ----
const rb = state.rainbow;
if (rb.on && rb.amount>0){
  const a=P('rainbow','amount'), ang=(rb.angle|0)*Math.PI/180, style=rb.style|0, tone=(rb.palette==null?2:rb.palette)|0;
  const BLEND=['overlay','screen','hue','soft-light'];
  if (style===1){
    const cs=Math.cos(ang), sn=Math.sin(ang), freq=Math.max(1,rb.bands|0), speed=rb.speed|0||1;
    const width=rb.width==null?0.5:rb.width, kf=3.0-width*2.6;                // Wave Width: thin (kf 3.0) → wide (kf 0.4)
    const span=(Math.abs(cs)*w+Math.abs(sn)*h)||1, off0=Math.min(0,cs)*w+Math.min(0,sn)*h;
    const scroll=phase*speed;                                                // integer turns/loop → seamless
    sc.width=w; sc.height=h;
    const im=sctx.createImageData(w,h), d=im.data;
    for (let p=0,i=0;i<d.length;i+=4,p++){
      const x=p%w, y=(p/w)|0, proj=(x*cs+y*sn-off0)/span;
      const bandFrac=((proj*freq-scroll)%1+1)%1, dist=Math.abs(bandFrac-0.5)*2;
      const bp=Math.max(0,1-dist*kf); const bright=bp*bp;                    // squared falloff → a crisp travelling pulse
      if (bright<=0.002) continue;
      const c=hypeLerp(tone, scroll+bandFrac*0.2, 1);                        // colour drifts an integer no. of cycles/loop → seamless
      d[i]=c[0]; d[i+1]=c[1]; d[i+2]=c[2]; d[i+3]=Math.round(255*bright);
    }
    sctx.putImageData(im,0,0);
    ctx.save(); ctx.globalCompositeOperation=BLEND[rb.blend|0]||'overlay'; ctx.globalAlpha=a;
    ctx.drawImage(sc,0,0); ctx.restore();
  } else {
    const cx=w/2, cy=h/2, L=(Math.abs(Math.cos(ang))*w+Math.abs(Math.sin(ang))*h)/2;
    const g=ctx.createLinearGradient(cx-Math.cos(ang)*L, cy-Math.sin(ang)*L, cx+Math.cos(ang)*L, cy+Math.sin(ang)*L);
    const N=24, off=phase*(rb.speed|0||1);                                   // integer cycles/loop → seamless
    for(let i=0;i<=N;i++){ const c=hypeLerp(tone, i/N+off, 1); g.addColorStop(i/N, `rgb(${c[0]|0},${c[1]|0},${c[2]|0})`); }
    ctx.save(); ctx.globalCompositeOperation=BLEND[rb.blend|0]||'overlay'; ctx.globalAlpha=a;
    ctx.fillStyle=g; ctx.fillRect(0,0,w,h); ctx.restore();
  }
}
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
  const amt=P('starf','amount'), thr=st.thresh, len=P('starf','length')*Math.max(w,h)*0.3;
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
    const g=Math.min(1, Math.max(0, lo-lb-thr*0.12)*gain);
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

function applyFoil(w,h,phase){
// ---- Holographic Foil: diagonal rainbow diffraction bands + a moving sheen, screened on the highlights ----
const fl = state.foil;
if (fl.on && fl.amount>0){
  const amt=P('foil','amount'), dens=fl.density|0||1, ang=(fl.angle|0)*Math.PI/180, speed=fl.speed|0, sheen=fl.sheen;
  const cs=Math.cos(ang), sn=Math.sin(ang), span=(Math.abs(cs)*w+Math.abs(sn)*h)||1, off0=Math.min(0,cs)*w+Math.min(0,sn)*h;
  const sweep=((phase*speed)%1+1)%1;
  const id=ctx.getImageData(0,0,w,h), d=id.data;
  for (let y=0;y<h;y++) for (let x=0;x<w;x++){
    const i=(y*w+x)*4, lum=(d[i]*0.299+d[i+1]*0.587+d[i+2]*0.114)/255;
    const proj=(x*cs+y*sn-off0)/span;
    const col=hsv(proj*dens*360 + phase*360*speed, 0.75, 1);             // rainbow bands, hue cycling → seamless
    const band=0.5+0.5*Math.sin(proj*dens*Math.PI*4);                    // fine diffraction ripple
    const shDist=Math.abs(((proj-sweep+1.5)%1)-0.5)*2, sh=Math.max(0,1-shDist*4)*sheen;   // moving sheen band
    const wc=Math.min(1, amt*(0.3+0.7*lum)*(0.4+0.6*band) + amt*sh*lum);
    d[i]  += (255-d[i])  *(col[0]/255)*wc;
    d[i+1]+= (255-d[i+1])*(col[1]/255)*wc;
    d[i+2]+= (255-d[i+2])*(col[2]/255)*wc;
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
