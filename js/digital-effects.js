function applyCompression(w,h){
// ---- Compression: heavy-JPEG look — 8×8 block flatten + chroma subsample + luma banding ----
const cp = state.compress;
if (cp.on){
  const amt = P('compress','amount');
  if (amt>0){
    const B = cp.block|0, chb = cp.chroma;
    const qstep = 2 + amt*30;                       // luma quantisation → banding
    const im = ctx.getImageData(0,0,w,h), d = im.data;
    for (let by=0; by<h; by+=B){
      const ye=Math.min(by+B,h);
      for (let bx=0; bx<w; bx+=B){
        const xe=Math.min(bx+B,w);
        let n=0,sY=0,sCb=0,sCr=0;                    // block means (DC term + chroma)
        for (let y=by;y<ye;y++) for(let x=bx;x<xe;x++){
          const i=(y*w+x)*4, r=d[i],g=d[i+1],b=d[i+2], Y=0.299*r+0.587*g+0.114*b;
          sY+=Y; sCb+=b-Y; sCr+=r-Y; n++;
        }
        const mY=sY/n, mCb=sCb/n, mCr=sCr/n;
        for (let y=by;y<ye;y++) for(let x=bx;x<xe;x++){
          const i=(y*w+x)*4, r=d[i],g=d[i+1],b=d[i+2];
          let Y=0.299*r+0.587*g+0.114*b, Cb=b-Y, Cr=r-Y;
          Y += (mY-Y)*amt*0.7;                        // kill high-freq luma toward block mean
          Y = Math.round(Y/qstep)*qstep;              // quantise → banding
          Cb += (mCb-Cb)*chb; Cr += (mCr-Cr)*chb;     // chroma subsample toward block mean
          const R=Y+Cr, Bb=Y+Cb, G=(Y-0.299*R-0.114*Bb)/0.587;
          d[i]=R; d[i+1]=G; d[i+2]=Bb;
        }
      }
    }
    ctx.putImageData(im,0,0);
  }
}
}

function applyPixelSort(w,h){
// ---- Pixel Sort: sort contiguous bright spans by luminance (rows / columns) ----
const ps = state.pixsort;
if (ps.on){
  const amt = P('pixsort','amount');
  if (amt>0){
    const im = ctx.getImageData(0,0,w,h), d=im.data;
    const lo = ps.thresh*255;
    const maxLen = Math.max(4, Math.round((ps.dir===1?h:w)*(0.05+ps.len*0.95)));
    const lum = i => d[i]*0.299+d[i+1]*0.587+d[i+2]*0.114;
    const sortLine = (idx,count)=>{
      let s=0;
      while (s<count){
        if (lum(idx(s))<=lo){ s++; continue; }
        let e=s; while (e<count && lum(idx(e))>lo && (e-s)<maxLen) e++;
        const arr=[];
        for (let k=s;k<e;k++){ const i=idx(k); arr.push([d[i],d[i+1],d[i+2],lum(i)]); }
        arr.sort((a,b)=>a[3]-b[3]);
        for (let k=s;k<e;k++){ const i=idx(k), a=arr[k-s];
          d[i]+=(a[0]-d[i])*amt; d[i+1]+=(a[1]-d[i+1])*amt; d[i+2]+=(a[2]-d[i+2])*amt; }
        s=e;
      }
    };
    if (ps.dir===0||ps.dir===2){ for(let y=0;y<h;y++){ const r=y*w; sortLine(k=>(r+k)*4, w); } }
    if (ps.dir===1||ps.dir===2){ for(let x=0;x<w;x++){ sortLine(k=>(k*w+x)*4, h); } }
    ctx.putImageData(im,0,0);
  }
}
}

function applyDatabendShift(w,h,phase){
// ---- Databend Shift: per-row horizontal wrap (diagonal shear + wavy) + packet jumps w/ RGB desync ----
const db = state.databend;
if (db.on){
  const amt = P('databend','amount');
  if (amt>0){
    const TAU=Math.PI*2, nsp=Math.round(db.speed);
    const stepPhase = Math.floor(phase*Math.max(1,db.speed)*4);
    const wrap = xx => { let m=xx%w; if(m<0)m+=w; return m|0; };
    const src = ctx.getImageData(0,0,w,h), out=ctx.createImageData(w,h), sd=src.data, od=out.data;
    for (let y=0;y<h;y++){
      let sh = amt*w*( db.skew*0.05*(y/h) + 0.007*Math.sin(y*0.04 + phase*TAU*nsp) );
      let chroma=0;
      if (db.scramble>0 && rand(y*0.7+stepPhase) < db.scramble*0.25){
        sh += (rand(y*1.9+stepPhase)-0.5)*w*0.033*amt;  // packet break (scaled by amount)
        chroma = (rand(y*2.3+stepPhase)-0.5)*amt*4;     // misread colour → rainbow
      }
      const shR=sh+chroma, shG=sh, shB=sh-chroma, row=y*w;
      for (let x=0;x<w;x++){
        const di=(row+x)*4;
        od[di]   = sd[(row+wrap(x-shR))*4];
        od[di+1] = sd[(row+wrap(x-shG))*4+1];
        od[di+2] = sd[(row+wrap(x-shB))*4+2];
        od[di+3] = 255;
      }
    }
    ctx.putImageData(out,0,0);
  }
}
}

function applyIndexedGif(w,h,phase){
// ---- Indexed / GIF: quantise to a cached global palette + dither, then palette-glitch ----
const gf = state.gif;
if (gf.on && img){
  const n = Math.max(2, gf.colors|0);
  ensureGifPalette(n);
  const pal = gifPal, N = pal.length, map = gifMapper;
  const mode = gf.glitch|0, amt = P('gif','amount'), dith = gf.dither;
  let disp = pal;                                       // display palette (scramble/cycle reorder it)
  if (mode===1){                                        // Scramble: swap entries (seeded → static/seamless)
    disp = pal.slice();
    const swaps = Math.round(amt*N);
    for (let s=0;s<swaps;s++){ const a=Math.floor(rand(s*1.7+.3)*N), b=Math.floor(rand(s*2.9+1.1)*N); const t=disp[a]; disp[a]=disp[b]; disp[b]=t; }
  } else if (mode===2){                                 // Colour Cycle: rotate palette (integer turns/loop)
    const cyc=Math.max(1,Math.round(1+amt*5)), rot=Math.floor(phase*N*cyc)%N;
    disp = pal.map((_,i)=>pal[(i+rot)%N]);
  }
  const bayer=[0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5];  // 4×4 ordered dither
  const dAmp = dith*(170/N), streakStep = Math.floor(phase*(4+amt*8));
  const im = ctx.getImageData(0,0,w,h), d = im.data;
  for (let y=0;y<h;y++){
    let bandOff=0;
    if (mode===3){ const band=Math.floor(y/12); bandOff=Math.floor((rand(band*1.3+streakStep)-0.5)*2*amt*N); }
    for (let x=0;x<w;x++){
      const i=(y*w+x)*4;
      let r=d[i], g=d[i+1], b=d[i+2];
      if (dith>0){ const t=(bayer[(y&3)*4+(x&3)]-7.5)/7.5*dAmp;
        r+=t; g+=t; b+=t; r=r<0?0:r>255?255:r; g=g<0?0:g>255?255:g; b=b<0?0:b>255?255:b; }
      let idx = map(r|0,g|0,b|0);
      let c;
      if (mode===3){ idx=(idx+bandOff)%N; if(idx<0)idx+=N; c=pal[idx]; }
      else c = disp[idx];
      d[i]=c[0]; d[i+1]=c[1]; d[i+2]=c[2];
    }
  }
  ctx.putImageData(im,0,0);
}
}

function applySonify(w,h){
// ---- Sonify: treat the RGBA byte stream as audio — echo (IIR delay) + reverse blocks ----
const so = state.sonify;
if (so.on){
  const amt = P('sonify','amount');
  if (amt>0){
    const im=ctx.getImageData(0,0,w,h), d=im.data, len=d.length, mode=so.mode|0;
    const D=Math.max(5, Math.round(P('sonify','delay')*37)|1);   // delay in bytes (∤ 4 → channels roll)
    if (mode===0){                                 // Echo — signed delay (echoes the deviation → no white-out)
      const f=amt*0.7;
      for (let i=D;i<len;i++){ if((i&3)===3) continue; d[i]=d[i]+f*(d[i-D]-128); }
    } else if (mode===1){                          // Reverse — mirror a fraction of blocks
      const blocks=Math.max(2, Math.round(4+amt*24)), bs=Math.floor(len/blocks);
      for (let b=0;b<blocks;b++){ if(rand(b*3.1+0.2)>amt) continue;
        for (let lo=b*bs, hi=Math.min(len,(b+1)*bs)-1; lo<hi; lo++,hi--){ const t=d[lo]; d[lo]=d[hi]; d[hi]=t; } }
    } else if (mode===2){                          // Reverb — dense diffuse tail (non-uniform signed taps)
      const f=amt*0.5, D2=Math.round(D*1.7), D3=Math.round(D*2.3), D4=Math.round(D*3.1), st=Math.max(1,D4);
      for (let i=st;i<len;i++){ if((i&3)===3) continue;
        d[i]=d[i]+f*(0.6*(d[i-D]-128)+0.4*(d[i-D2]-128)+0.28*(d[i-D3]-128)+0.18*(d[i-D4]-128)); }
    } else {                                       // Tremolo — amplitude LFO along the stream → rolling bands
      const k=6.283/Math.max(8,D), dep=amt;
      for (let i=0;i<len;i++){ if((i&3)===3) continue; d[i]=d[i]*(1+dep*Math.sin(i*k)); }
    }
    for (let i=3;i<len;i+=4) d[i]=255;              // restore opaque alpha
    ctx.putImageData(im,0,0);
  }
}
}

function applyByteShift(w,h){
// ---- Byte Shift: raw reinterpret — per-row horizontal wrap (diagonal skew) + RGB channel roll ----
const bsf = state.byteshift;
if (bsf.on){
  const amt=P('byteshift','amount');
  if (amt>0){
    const roll=bsf.roll|0, r0=roll%3, r1=(roll+1)%3, r2=(roll+2)%3;
    const px=Math.round(amt*w*0.6);
    const src=ctx.getImageData(0,0,w,h), out=ctx.createImageData(w,h), sd=src.data, od=out.data;
    for (let y=0;y<h;y++){
      const rowShift=px+Math.round(y*bsf.skew*1.5), row=y*w;
      for (let x=0;x<w;x++){
        const i=(row+x)*4, sx=((x+rowShift)%w+w)%w, si=(row+sx)*4;
        od[i]=sd[si+r0]; od[i+1]=sd[si+r1]; od[i+2]=sd[si+r2]; od[i+3]=255;
      }
    }
    ctx.putImageData(out,0,0);
  }
}
}

function applyBitPlane(w,h){
// ---- Bit-plane: split each channel at a bit boundary, displace / XOR / drop the low planes ----
const bpl = state.bitplane;
if (bpl.on){
  const amt=P('bitplane','amount');
  if (amt>0){
    const mode=bpl.mode|0, nb=bpl.bits|0;
    const hiMask=(0xFF<<nb)&0xFF, loMask=0xFF>>(8-nb), shift=Math.round(amt*90)+1;
    const src=ctx.getImageData(0,0,w,h), out=ctx.createImageData(w,h), sd=src.data, od=out.data;
    for (let y=0;y<h;y++){ const row=y*w;
      for (let x=0;x<w;x++){
        const i=(row+x)*4, sx=((x+shift)%w+w)%w, si=(row+sx)*4;
        for (let c=0;c<3;c++){ const a=sd[i+c], b=sd[si+c];
          od[i+c] = mode===0 ? ((a&hiMask)|(b&loMask)) : mode===1 ? (a^(b&loMask)) : (a&hiMask); }
        od[i+3]=255;
      }
    }
    ctx.putImageData(out,0,0);
  }
}
}
