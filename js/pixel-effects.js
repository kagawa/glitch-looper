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
// ---- Gold / Chrome: map luma to a metallic gradient with a shine band sweeping over the loop ----
const gd = state.gold;
if (gd.on && gd.amount>0){
  const a = P('gold','amount'), shine = gd.shine, tone = gd.tone|0;
  // ramp: shadow → body → bright → specular
  const RAMPS = { 0:[[40,20,0],[150,95,10],[240,190,60],[255,244,200]],      // Gold
                  1:[[24,27,33],[120,128,140],[205,212,222],[255,255,255]] };// Silver / chrome
  const ramp = RAMPS[tone] || RAMPS[0];
  const lerp3=(c0,c1,t)=>[c0[0]+(c1[0]-c0[0])*t, c0[1]+(c1[1]-c0[1])*t, c0[2]+(c1[2]-c0[2])*t];
  const map=(lum)=> tone===2 ? hsv(40+lum*90, 0.85, 0.2+lum*0.8)            // Rainbow-gold: hue swings with luma
    : lum<0.5 ? lerp3(ramp[0],ramp[1],lum/0.5)
    : lum<0.8 ? lerp3(ramp[1],ramp[2],(lum-0.5)/0.3)
    :           lerp3(ramp[2],ramp[3],(lum-0.8)/0.2);
  const bandPos=((phase%1)+1)%1;                                             // sweeps the diagonal each loop
  const id=ctx.getImageData(0,0,w,h), d=id.data;
  for (let p=0,i=0;i<d.length;i+=4,p++){
    const lum=(d[i]*0.3+d[i+1]*0.59+d[i+2]*0.11)/255;
    let c=map(lum), r=c[0], g=c[1], b=c[2];
    if (shine>0){
      const x=p%w, y=(p/w)|0, diag=(x/w+y/h)/2;
      const dist=Math.abs(((diag-bandPos+1.5)%1)-0.5)*2;                     // wrapped → seamless at the loop
      const boost=Math.max(0,1-dist*6)*shine*190;                           // narrow specular band
      r=Math.min(255,r+boost); g=Math.min(255,g+boost); b=Math.min(255,b+boost*0.8);
    }
    d[i]+=(r-d[i])*a; d[i+1]+=(g-d[i+1])*a; d[i+2]+=(b-d[i+2])*a;
  }
  ctx.putImageData(id,0,0);
}
}

function applyRainbow(w,h,phase){
// ---- Rainbow: a full-spectrum gradient whose hues cycle over the loop, blended on top ----
const rb = state.rainbow;
if (rb.on && rb.amount>0){
  const a=P('rainbow','amount'), ang=(rb.angle|0)*Math.PI/180;
  const cx=w/2, cy=h/2, L=(Math.abs(Math.cos(ang))*w+Math.abs(Math.sin(ang))*h)/2;
  const g=ctx.createLinearGradient(cx-Math.cos(ang)*L, cy-Math.sin(ang)*L, cx+Math.cos(ang)*L, cy+Math.sin(ang)*L);
  const N=12, off=phase*(rb.speed|0||1);                                     // integer cycles/loop → seamless
  for(let i=0;i<=N;i++) g.addColorStop(i/N, `hsl(${((i/N+off)%1)*360},100%,55%)`);
  const BLEND=['overlay','screen','hue','soft-light'];
  ctx.save(); ctx.globalCompositeOperation=BLEND[rb.blend|0]||'overlay'; ctx.globalAlpha=a;
  ctx.fillStyle=g; ctx.fillRect(0,0,w,h); ctx.restore();
}
}
