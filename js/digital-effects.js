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

function applyBmpRowMisread(w,h){
  const effect=state.bmpmisread;
  if(!effect.on) return;
  const amount=P('bmpmisread','amount');
  if(amount<=0) return;
  const src=ctx.getImageData(0,0,w,h), out=ctx.createImageData(w,h), source=src.data, target=out.data;
  const rowBytes=w*4, error=(effect.width|0)*4+(effect.padding|0), length=source.length;
  for(let y=0;y<h;y++){
    const sourceY=(effect.flip|0)===1?h-1-y:y;
    const rowStart=sourceY*rowBytes+y*error;
    for(let x=0;x<w;x++){
      const outputIndex=(y*w+x)*4;
      let sourceIndex=(rowStart+x*4)%length; if(sourceIndex<0) sourceIndex+=length;
      for(let channel=0;channel<3;channel++) target[outputIndex+channel]=source[outputIndex+channel]+(source[(sourceIndex+channel)%length]-source[outputIndex+channel])*amount;
      target[outputIndex+3]=255;
    }
  }
  ctx.putImageData(out,0,0);
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
// ---------- datamosh: block smear + pixel sort + channel corruption ----------
// seed varies per frame; higher chaos = seed jumps more => different breakage each frame
function applyMosh(w,h,fseed,em=1){
  const m = state.mosh;
  const intensity = m.intensity*em;
  const seed = Math.floor(fseed*(1+m.chaos*4)) + 1;
  const id = ctx.getImageData(0,0,w,h);
  const d = id.data;
  const src = new Uint8ClampedArray(d);        // snapshot to read from

  // Block Noise only breaks blocks that the displacement below actually dragged something into, so
  // record which noise-grid cells each pasted block lands on. No displacement → no noise.
  const np = Math.max(1, m.npix|0);
  const nbx = Math.ceil(w/np), nby = Math.ceil(h/np);
  const moshMask = m.noise>0 ? new Uint8Array(nbx*nby) : null;

  // 1) block displacement (datamosh smear)
  //    Bloom mimics P-frame duplication: the same motion vector is applied over and over, so the
  //    block content is dragged another step each time and leaves a copy behind at every stop —
  //    the stretched, trailing look of a real datamosh. 1 = applied once (a plain displacement).
  if (m.blocks>0){
    const n = Math.floor(1 + m.blocks*10*intensity);
    const reps = Math.max(1, m.bloom|0);
    for (let k=0;k<n;k++){
      const bw = Math.max(4, Math.floor((0.08+0.35*rand(seed*3.1+k))*w));
      const bh = Math.max(2, Math.floor((0.02+0.14*rand(seed*5.7+k))*h));
      const sx = Math.floor(rand(seed*9.3+k)*(w-bw));
      const sy = Math.floor(rand(seed*1.7+k)*(h-bh));
      const dxo = Math.floor((rand(seed*2.2+k)-0.5)*w*intensity);
      for (let p=1;p<=reps;p++){
        const off = dxo*p;
        if (moshMask){                          // mark where this paste lands
          const tx0=Math.max(0,sx+off), tx1=Math.min(w-1,sx+off+bw-1);
          if (tx1>=tx0){
            const bx0=(tx0/np)|0, bx1=(tx1/np)|0, by0=(sy/np)|0, by1=((sy+bh-1)/np)|0;
            for (let by=by0;by<=by1;by++) for (let bx=bx0;bx<=bx1;bx++) moshMask[by*nbx+bx]=1;
          }
        }
        for (let y=0;y<bh;y++){
          for (let x=0;x<bw;x++){
            const tx = sx+x+off;
            if (tx<0||tx>=w) continue;
            const si=((sy+y)*w+sx+x)*4, ti=((sy+y)*w+tx)*4;
            d[ti]=src[si]; d[ti+1]=src[si+1]; d[ti+2]=src[si+2];
          }
        }
      }
    }
  }

  // 2) pixel sort (random horizontal bands sorted by luminance)
  if (m.sort>0){
    const segs = Math.floor(1 + m.sort*7*intensity);
    for (let k=0;k<segs;k++){
      const y0 = Math.floor(rand(seed*4.4+k)*h);
      const band = 2 + Math.floor(rand(seed*6.1+k)*4);
      const x0 = Math.floor(rand(seed*6.6+k)*w*0.6);
      const x1 = Math.min(w, x0 + Math.floor((0.2+0.5*rand(seed*8.8+k))*w));
      for (let yy=y0; yy<Math.min(h,y0+band); yy++){
        const arr=[];
        for (let x=x0;x<x1;x++){ const i=(yy*w+x)*4; arr.push([d[i],d[i+1],d[i+2], d[i]*0.3+d[i+1]*0.59+d[i+2]*0.11]); }
        arr.sort((a,b)=>a[3]-b[3]);
        for (let x=x0;x<x1;x++){ const i=(yy*w+x)*4,p=arr[x-x0]; d[i]=p[0]; d[i+1]=p[1]; d[i+2]=p[2]; }
      }
    }
  }

  // 3) channel corruption (shift a single RGB channel on random rows)
  const bands = Math.floor(m.chaos*6*intensity);
  for (let k=0;k<bands;k++){
    const y0 = Math.floor(rand(seed*7.7+k)*h);
    const bh = Math.floor((0.01+0.05*rand(seed*3.9+k))*h)+1;
    const ch = Math.floor(rand(seed*5.5+k)*3);
    const sh = Math.floor((rand(seed*2.1+k)-0.5)*80);
    for (let y=y0;y<Math.min(h,y0+bh);y++){
      for (let x=0;x<w;x++){
        const sx=Math.max(0,Math.min(w-1,x+sh));
        d[(y*w+x)*4+ch]=src[(y*w+sx)*4+ch];
      }
    }
  }

  // 4) block noise — the macroblock look of a starved stream. Blocks sit on the screen grid rather
  //    than at random positions, otherwise they read as plain noise instead of as broken blocks.
  //    Confined to the blocks the displacement dragged into, so the colour breaks up where the
  //    mosh is, instead of speckling the untouched picture.
  if (m.noise>0){
    const nmode = m.nmode|0, amtN = m.noise*intensity;
    for (let by=0; by<nby; by++){
      for (let bx=0; bx<nbx; bx++){
        if (!moshMask[by*nbx+bx]) continue;                         // nothing was moshed here
        if (rand(seed*11.3 + bx*0.31 + by*7.7) >= amtN) continue;   // this block survived
        const a = rand(seed*4.7 + bx*1.9 + by*0.53), b = rand(seed*8.3 + bx*0.77 + by*2.9);
        const x0=bx*np, y0=by*np, x1=Math.min(w,x0+np), y1=Math.min(h,y0+np);
        let nr=0, ng=0, nb=0, cb=0, cr=0;
        if (nmode===0){                       // Replace: a flat block of a fully saturated hue
          const hh=a*6, i6=Math.floor(hh)%6, f=hh-Math.floor(hh);
          const seg=[[1,f,0],[1-f,1,0],[0,1,f],[0,1-f,1],[f,0,1],[1,0,1-f]][i6];
          nr=seg[0]*255; ng=seg[1]*255; nb=seg[2]*255;
        } else if (nmode===1){                // Chroma: keep the luma, blow out the colour difference
          cb=(a*2-1)*180; cr=(b*2-1)*180;     // — the picture stays readable but the colour is wrong
        } else {                              // Add: signed offset, keeps the texture underneath
          const c = rand(seed*2.3 + bx*3.1 + by*1.7);
          nr=(a*2-1)*140; ng=(b*2-1)*140; nb=(c*2-1)*140;
        }
        for (let y=y0;y<y1;y++){
          for (let x=x0;x<x1;x++){
            const i=(y*w+x)*4;
            if (nmode===0){ d[i]=nr; d[i+1]=ng; d[i+2]=nb; }
            else if (nmode===1){
              const Y = 0.299*d[i] + 0.587*d[i+1] + 0.114*d[i+2];
              d[i]=Y+1.402*cr; d[i+1]=Y-0.344136*cb-0.714136*cr; d[i+2]=Y+1.772*cb;
            }
            else { d[i]+=nr; d[i+1]+=ng; d[i+2]+=nb; }
          }
        }
      }
    }
  }

  ctx.putImageData(id,0,0);
}
