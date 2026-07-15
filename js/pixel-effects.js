function applyPixelate(w,h){
// ---- pixelate: downscale then nearest-neighbour upscale (Envelope can drive block size) ----
const px2 = state.pixelate;
if (px2.on && px2.size>1){
  const s=Math.max(1, Math.round(P('pixelate','size')));
  if (s>1){
    const pw=Math.max(1,Math.round(w/s)), ph=Math.max(1,Math.round(h/s));
    sc.width=pw; sc.height=ph; sctx.imageSmoothingEnabled=false;
    sctx.clearRect(0,0,pw,ph); sctx.drawImage(canvas,0,0,w,h,0,0,pw,ph);
    ctx.imageSmoothingEnabled=false; ctx.clearRect(0,0,w,h);
    ctx.drawImage(sc,0,0,pw,ph,0,0,w,h);
    ctx.imageSmoothingEnabled=true;
  }
}
}

function applyHalftone(w,h){
// ---- halftone: dot-matrix (dark=LED colour dots / light=newsprint black dots) ----
const ht = state.halftone;
if (ht.on){
  const cell=Math.max(3,Math.round(ht.cell)), dark=ht.bg===0, src=ctx.getImageData(0,0,w,h).data;
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
