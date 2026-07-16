function applyCompression(w,h){
// ---- Compression: heavy-JPEG look — 8×8 block flatten + chroma subsample + luma banding ----
const cp = state.compress;
if (cp.on){
  const B = cp.block|0;
  // Softness: a high QP throws away the high-frequency DCT coefficients, so detail smaller than the
  // step is simply gone and the picture goes soft — a starved stream is usually also encoded at a
  // lower resolution and stretched back up. Reproduce that by shrinking through a smoothing filter
  // and scaling back, before the block flatten (the encoder downscales, then blocks). 0 = sharp.
  const soft = P('compress','soft');
  if (soft>0){
    const sf = 1 - soft*0.82;                        // down to ~18% resolution at full
    const dw = Math.max(1, Math.round(w*sf)), dh = Math.max(1, Math.round(h*sf));
    sc.width=dw; sc.height=dh; sctx.imageSmoothingEnabled=true;
    sctx.clearRect(0,0,dw,dh); sctx.drawImage(canvas,0,0,w,h,0,0,dw,dh);   // shrink (averaging)
    ctx.imageSmoothingEnabled=true; ctx.clearRect(0,0,w,h);
    ctx.drawImage(sc,0,0,dw,dh,0,0,w,h);                                   // stretch back, soft
  }
  const amt = P('compress','amount');
  if (amt>0){
    const chb = cp.chroma, ring = P('compress','ring');
    const qstep = 2 + amt*30;                       // luma quantisation → banding
    const im = ctx.getImageData(0,0,w,h), d = im.data;
    for (let by=0; by<h; by+=B){
      const ye=Math.min(by+B,h);
      for (let bx=0; bx<w; bx+=B){
        const xe=Math.min(bx+B,w);
        let n=0,sY=0,sY2=0,sCb=0,sCr=0;              // block means (DC term + chroma) + luma spread
        for (let y=by;y<ye;y++) for(let x=bx;x<xe;x++){
          const i=(y*w+x)*4, r=d[i],g=d[i+1],b=d[i+2], Y=0.299*r+0.587*g+0.114*b;
          sY+=Y; sY2+=Y*Y; sCb+=b-Y; sCr+=r-Y; n++;
        }
        const mY=sY/n, mCb=sCb/n, mCr=sCr/n;
        // Ringing (mosquito noise): a coarsely quantised high-frequency coefficient spreads its
        // error over the whole block, so blocks holding an edge ring while flat blocks stay clean.
        // Standard deviation of luma stands in for how much high-frequency energy the block had.
        let amp=0, ou=0, ov=0;
        if (ring>0){
          const sd = Math.sqrt(Math.max(0, sY2/n - mY*mY));
          amp = ring * Math.min(1, sd/40) * 45;       // flat block → sd≈0 → no ring
          const bseed = bx*0.317 + by*1.913;          // which basis got mangled, per block
          ou = 2 + Math.floor(rand(bseed)*3); ov = 2 + Math.floor(rand(bseed+7.1)*3);
        }
        for (let y=by;y<ye;y++) for(let x=bx;x<xe;x++){
          const i=(y*w+x)*4, r=d[i],g=d[i+1],b=d[i+2];
          let Y=0.299*r+0.587*g+0.114*b, Cb=b-Y, Cr=r-Y;
          Y += (mY-Y)*amt*0.7;                        // kill high-freq luma toward block mean
          Y = Math.round(Y/qstep)*qstep;              // quantise → banding
          if (amp>0.5)                                // lay the mangled basis back over the block
            Y += amp * Math.cos(Math.PI*ou*(x-bx+0.5)/B) * Math.cos(Math.PI*ov*(y-by+0.5)/B);
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
// ---- Pixel Sort: reorder runs of pixels along rows / columns ----
//      Two independent axes, the way the glitch-art lineage treats it: Sort By picks what the run
//      is ordered on (Hue gives rainbow bands, nothing like Lightness), and Interval picks where
//      the runs start and stop. Interval always cuts on brightness/edges regardless of Sort By.
const ps = state.pixsort;
if (ps.on){
  const amt = P('pixsort','amount');
  if (amt>0){
    const im = ctx.getImageData(0,0,w,h), d=im.data;
    const lo = ps.thresh*255;
    const maxLen = Math.max(4, Math.round((ps.dir===1?h:w)*(0.05+ps.len*0.95)));
    const lum = i => d[i]*0.299+d[i+1]*0.587+d[i+2]*0.114;
    const key = ps.key|0, ivl = ps.ivl|0;
    const sortVal =
      key===1 ? i => { const r=d[i],g=d[i+1],b=d[i+2];               // Hue
                       const mx=Math.max(r,g,b), c=mx-Math.min(r,g,b);
                       if (c===0) return 0;
                       const hh = mx===r ? ((g-b)/c)%6 : mx===g ? (b-r)/c+2 : (r-g)/c+4;
                       return hh<0 ? hh*60+360 : hh*60; }
    : key===2 ? i => { const mx=Math.max(d[i],d[i+1],d[i+2]);        // Saturation
                       return mx===0 ? 0 : (mx-Math.min(d[i],d[i+1],d[i+2]))/mx*255; }
    : key===3 ? i => d[i]+d[i+1]+d[i+2]                              // Intensity
    : key===4 ? i => Math.min(d[i],d[i+1],d[i+2])                    // Min RGB
    :           lum;                                                 // Lightness
    // Sort Chance leaves a share of the runs alone. Threshold and Edges cut on the picture itself,
    // so they skip the flat parts for free and the knob can stay linear — but Random, Waves and
    // Whole line tile the line end to end and start out sorting every last pixel of it, so there
    // the knob is squared to push the usable range up into the middle of the travel.
    // 1 = sort every run, either way.
    const chance = (ivl===0||ivl===2) ? ps.chance : ps.chance*ps.chance;
    const take = (lineSeed,j)=> chance>=1 || rand(lineSeed*0.73+j*5.9+0.5) < chance;
    const sortSpan = (idx,s,e)=>{
      const arr=[];
      for (let k=s;k<e;k++){ const i=idx(k); arr.push([d[i],d[i+1],d[i+2],sortVal(i)]); }
      arr.sort((a,b)=>a[3]-b[3]);
      for (let k=s;k<e;k++){ const i=idx(k), a=arr[k-s];
        d[i]+=(a[0]-d[i])*amt; d[i+1]+=(a[1]-d[i+1])*amt; d[i+2]+=(a[2]-d[i+2])*amt; }
    };
    const sortLine = (idx,count,lineSeed)=>{
      switch (ivl){
        case 1: {                                  // Random — runs of scattered length
          let s=0, j=0;
          while (s<count){
            const L = Math.max(2, Math.round(maxLen*(0.25+1.5*rand(lineSeed*1.7+j*3.1))));
            const e = Math.min(count, s+L);
            if (take(lineSeed,j)) sortSpan(idx,s,e);
            s=e; j++;
          }
          break;
        }
        case 2: {                                  // Edges — runs break where the picture does, so
          const th = 6 + ps.thresh*90;             // the subject's outline survives
          let s=0, j=0;
          for (let k=1;k<=count;k++){
            if (k===count || Math.abs(lum(idx(k))-lum(idx(k-1)))>th || (k-s)>=maxLen){
              if (k-s>1 && take(lineSeed,j)) sortSpan(idx,s,k);
              s=k; j++;
            }
          }
          break;
        }
        case 3:                                    // Waves — evenly sized runs
          for (let s=0,j=0;s<count;s+=maxLen,j++)
            if (take(lineSeed,j)) sortSpan(idx,s,Math.min(count,s+maxLen));
          break;
        case 4:                                    // Whole line — one run, so one coin per line
          if (take(lineSeed,0)) sortSpan(idx,0,count);
          break;
        default: {                                 // Threshold — runs of bright pixels
          let s=0, j=0;
          while (s<count){
            if (lum(idx(s))<=lo){ s++; continue; }
            let e=s; while (e<count && lum(idx(e))>lo && (e-s)<maxLen) e++;
            if (take(lineSeed,j)) sortSpan(idx,s,e);
            s=e; j++;
          }
        }
      }
    };
    if (ps.dir===0||ps.dir===2){ for(let y=0;y<h;y++){ const r=y*w; sortLine(k=>(r+k)*4, w, y+1); } }
    if (ps.dir===1||ps.dir===2){ for(let x=0;x<w;x++){ sortLine(k=>(k*w+x)*4, h, 9973+x); } }
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

  // 1) block displacement (datamosh smear)
  //    Bloom mimics P-frame duplication: the same motion vector is applied over and over, so the
  //    block content is dragged another step each time and leaves a copy behind at every stop —
  //    the stretched, trailing look of a real datamosh. It is a ceiling, not a fixed count: each
  //    block draws its own repeat count from 1..Bloom, so the trails come out uneven. 1 = every
  //    block applied once (a plain displacement).
  if (m.blocks>0){
    const n = Math.floor(1 + m.blocks*10*intensity);
    const maxReps = Math.max(1, m.bloom|0);
    for (let k=0;k<n;k++){
      const bw = Math.max(4, Math.floor((0.08+0.35*rand(seed*3.1+k))*w));
      const bh = Math.max(2, Math.floor((0.02+0.14*rand(seed*5.7+k))*h));
      const sx = Math.floor(rand(seed*9.3+k)*(w-bw));
      const sy = Math.floor(rand(seed*1.7+k)*(h-bh));
      const dxo = Math.floor((rand(seed*2.2+k)-0.5)*w*intensity);
      const reps = Math.round(1 + rand(seed*7.3+k)*(maxReps-1));
      for (let p=1;p<=reps;p++){
        const off = dxo*p;
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

  // 3) jitter — bands where the signal comes apart
  const bands = Math.floor(m.chaos*14*intensity);
  for (let k=0;k<bands;k++){
    const y0 = Math.floor(rand(seed*7.7+k)*h);
    const bh = Math.floor((0.01+0.05*rand(seed*3.9+k))*h)+1;
    const ch = Math.floor(rand(seed*5.5+k)*3);
    const yEnd = Math.min(h,y0+bh);
    // each band picks its own kind of break-up, so Jitter reads as a signal coming apart in
    // several ways at once rather than as the same channel smear over and over
    switch (Math.floor(rand(seed*6.9+k)*3)){
      case 1: {                                   // one channel pulled from another row (vertical tear)
        const vs = Math.floor((rand(seed*4.3+k)-0.5)*2*(2+bh*6*intensity));
        for (let y=y0;y<yEnd;y++){
          const sy=Math.max(0,Math.min(h-1,y+vs));
          for (let x=0;x<w;x++) d[(y*w+x)*4+ch]=src[(sy*w+x)*4+ch];
        }
        break;
      }
      case 2: {                                   // channels rotated → the band swings to a wrong hue
        const rot = rand(seed*8.7+k)<0.5;
        for (let y=y0;y<yEnd;y++){
          for (let x=0;x<w;x++){
            const i=(y*w+x)*4, r=src[i], g=src[i+1], b=src[i+2];
            if (rot){ d[i]=g; d[i+1]=b; d[i+2]=r; } else { d[i]=b; d[i+1]=r; d[i+2]=g; }
          }
        }
        break;
      }
      default: {                                  // one channel slid sideways (the original jitter)
        const sh = Math.floor((rand(seed*2.1+k)-0.5)*2*(20+w*0.2*intensity));
        for (let y=y0;y<yEnd;y++){
          for (let x=0;x<w;x++){
            const sx=Math.max(0,Math.min(w-1,x+sh));
            d[(y*w+x)*4+ch]=src[(y*w+sx)*4+ch];
          }
        }
      }
    }
  }

  ctx.putImageData(id,0,0);
}
