// Effect-local region gating for the live glitch family. Capture the clean input, let the effect
// render normally, then restore pixels outside the selected picture-derived region. Coverage is a
// second axis from Amount: it decides where destruction may happen, not how hard it is there.
function glitchGateBegin(w,h,fx){
  const s=state[fx]; if(!s || !s.on) return null;
  const coverage=s.coverage==null?1:s.coverage, apply=s.applyto|0;
  return (coverage>=1 && apply===0) ? null : ctx.getImageData(0,0,w,h);
}
function glitchGateEnd(w,h,fx,before){
  if(!before) return;
  const s=state[fx], coverage=Math.max(0,Math.min(1,s.coverage==null?1:s.coverage)), apply=s.applyto|0;
  if(coverage<=0){ ctx.putImageData(before,0,0); return; }
  const after=ctx.getImageData(0,0,w,h), a=after.data, b=before.data;
  const tag=fx.split('').reduce((n,ch)=>n*33+ch.charCodeAt(0),0)*.001;
  const smooth=(lo,hi,x)=>{ if(x<=lo)return 0; if(x>=hi)return 1; const t=(x-lo)/(hi-lo); return t*t*(3-2*t); };
  const lum=i=>(b[i]*.299+b[i+1]*.587+b[i+2]*.114)/255;
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){
    const i=(y*w+x)*4; let keep;
    if(apply===0){
      // Coarse cells make partial Coverage read as broken regions, not translucent full-frame FX.
      const cell=12, cx=(x/cell)|0, cy=(y/cell)|0;
      keep=smooth(1-coverage-.08,1-coverage+.08,1-rand(cx*17.1+cy*31.7+tag));
    } else {
      let score=0;
      if(apply===1) score=lum(i);
      else if(apply===2) score=1-lum(i);
      else if(apply===4){ const mx=Math.max(b[i],b[i+1],b[i+2]), mn=Math.min(b[i],b[i+1],b[i+2]); score=mx? (mx-mn)/mx : 0; }
      else { // edge magnitude from the clean input
        const ir=(y*w+Math.min(w-1,x+1))*4, id=(Math.min(h-1,y+1)*w+x)*4;
        score=Math.min(1,(Math.abs(lum(ir)-lum(i))+Math.abs(lum(id)-lum(i)))*3.5);
      }
      keep=smooth(1-coverage-.08,1-coverage+.08,score);
    }
    if(keep<1){ a[i]=b[i]+(a[i]-b[i])*keep; a[i+1]=b[i+1]+(a[i+1]-b[i+1])*keep; a[i+2]=b[i+2]+(a[i+2]-b[i+2])*keep; }
  }
  ctx.putImageData(after,0,0);
}

// ---- DCT Glitch: the genuine JPEG mechanism, run live — forward 8×8 DCT, bend the coefficients,
//      inverse. Deterministic per block (seeded on block position) so it stays seamless, and because
//      it recomputes every frame it takes an Envelope, unlike the baked real-JPEG pool. ----
const DCT_MATS = {};
function dctMat(N){
  if (DCT_MATS[N]) return DCT_MATS[N];
  const M=new Float32Array(N*N);
  for (let u=0;u<N;u++){ const a=u===0?Math.sqrt(1/N):Math.sqrt(2/N);
    for (let x=0;x<N;x++) M[u*N+x]=a*Math.cos((2*x+1)*u*Math.PI/(2*N)); }
  return DCT_MATS[N]=M;
}
function applyDctGlitch(w,h){
const dg = state.dct;
if (dg.on && dg.amount>0){
  const amt=P('dct','amount'), N=(dg.block|0)||8, mode=dg.mode|0, chroma=dg.chroma, NN=N*N, M=dctMat(N);
  const id=ctx.getImageData(0,0,w,h), d=id.data, np=w*h, orig=d.slice(), mix=P('dct','mix');
  const Y=new Float32Array(np), Cb=new Float32Array(np), Cr=new Float32Array(np);
  for (let p=0,i=0;i<d.length;i+=4,p++){ const r=d[i],g=d[i+1],b=d[i+2];
    Y[p]=0.299*r+0.587*g+0.114*b; Cb[p]=128-0.168736*r-0.331264*g+0.5*b; Cr[p]=128+0.5*r-0.418688*g-0.081312*b; }
  const blk=new Float32Array(NN), tmp=new Float32Array(NN), co=new Float32Array(NN);
  const proc=(plane,strength)=>{
    if (strength<=0) return;
    const s=amt*strength, q=1+s*36, keep=Math.max(2,Math.round(N*1.7*(1-s)));   // keep low freqs so it never flattens to grey
    for (let by=0;by<h;by+=N) for (let bx=0;bx<w;bx+=N){
      const bw=Math.min(N,w-bx), bh=Math.min(N,h-by);
      for (let y=0;y<N;y++){ const sy=(by+Math.min(y,bh-1))*w; for (let x=0;x<N;x++) blk[y*N+x]=plane[sy+bx+Math.min(x,bw-1)]-128; }
      // forward: rowT[y][v]=Σx blk[y][x]M[v][x] ; co[u][v]=Σy M[u][y]rowT[y][v]
      for (let y=0;y<N;y++) for (let v=0;v<N;v++){ let a=0; for (let x=0;x<N;x++) a+=blk[y*N+x]*M[v*N+x]; tmp[y*N+v]=a; }
      for (let u=0;u<N;u++) for (let v=0;v<N;v++){ let a=0; for (let y=0;y<N;y++) a+=M[u*N+y]*tmp[y*N+v]; co[u*N+v]=a; }
      const seed=bx*13.1+by*7.7;
      if (mode===0){ for (let u=0;u<N;u++) for (let v=0;v<N;v++) if (u+v>=keep) co[u*N+v]=0; }
      else if (mode===1){ for (let k=0;k<NN;k++) co[k]=Math.round(co[k]/q)*q; }
      else if (mode===2){ co[0]+=(rand(seed)-0.5)*s*420; }
      else { for (let k=1;k<NN;k++) if (rand(seed+k*1.3)<s*0.6) co[k]+=(rand(seed+k*2.7)-0.5)*s*320; }
      // inverse: t[u][x]=Σv co[u][v]M[v][x] ; blk[y][x]=Σu M[u][y]t[u][x]
      for (let u=0;u<N;u++) for (let x=0;x<N;x++){ let a=0; for (let v=0;v<N;v++) a+=co[u*N+v]*M[v*N+x]; tmp[u*N+x]=a; }
      for (let y=0;y<N;y++) for (let x=0;x<N;x++){ let a=0; for (let u=0;u<N;u++) a+=M[u*N+y]*tmp[u*N+x]; blk[y*N+x]=a; }
      for (let y=0;y<bh;y++){ const dy=(by+y)*w+bx; for (let x=0;x<bw;x++) plane[dy+x]=blk[y*N+x]+128; }
    }
  };
  proc(Y,1); proc(Cb,chroma); proc(Cr,chroma);
  for (let p=0,i=0;i<d.length;i+=4,p++){ const y=Y[p], cb=Cb[p]-128, cr=Cr[p]-128;
    const R=y+1.402*cr, G=y-0.344136*cb-0.714136*cr, B=y+1.772*cb;    // glitched, then blend over the original by Mix
    d[i]=orig[i]+(R-orig[i])*mix; d[i+1]=orig[i+1]+(G-orig[i+1])*mix; d[i+2]=orig[i+2]+(B-orig[i+2])*mix; }
  ctx.putImageData(id,0,0);
}
}

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
    const chb = cp.chroma, ring = P('compress','ring'), sub = cp.sub|0;
    const qstep = 2 + amt*30;                       // luma quantisation → banding
    const im = ctx.getImageData(0,0,w,h), d = im.data;
    // Real chroma subsampling happens BEFORE block quantisation in an actual encoder: colour is
    // averaged over a small fixed grid (4:2:2 = 2×1, 4:2:0 = 2×2) independent of the DCT block size,
    // which is what gives real footage its fine, regular colour-blockiness — distinct from Chroma
    // Bleed's coarser drift toward the whole (much larger) quantisation block's average.
    let Cb2=null, Cr2=null;
    if (sub>0){
      const cw=2, ch=sub===2?2:1;
      Cb2=new Float32Array(w*h); Cr2=new Float32Array(w*h);
      for (let cy=0; cy<h; cy+=ch) for (let cx=0; cx<w; cx+=cw){
        const ye=Math.min(cy+ch,h), xe=Math.min(cx+cw,w);
        let n=0,sCb=0,sCr=0;
        for (let y=cy;y<ye;y++) for(let x=cx;x<xe;x++){ const i=(y*w+x)*4, r=d[i],g=d[i+1],b=d[i+2], Y=0.299*r+0.587*g+0.114*b; sCb+=b-Y; sCr+=r-Y; n++; }
        const mCb=sCb/n, mCr=sCr/n;
        for (let y=cy;y<ye;y++) for(let x=cx;x<xe;x++){ const p=y*w+x; Cb2[p]=mCb; Cr2[p]=mCr; }
      }
    }
    for (let by=0; by<h; by+=B){
      const ye=Math.min(by+B,h);
      for (let bx=0; bx<w; bx+=B){
        const xe=Math.min(bx+B,w);
        let n=0,sY=0,sY2=0,sCb=0,sCr=0;              // block means (DC term + chroma) + luma spread
        for (let y=by;y<ye;y++) for(let x=bx;x<xe;x++){
          const i=(y*w+x)*4, r=d[i],g=d[i+1],b=d[i+2], Y=0.299*r+0.587*g+0.114*b;
          const p=y*w+x, cb=sub>0?Cb2[p]:(b-Y), cr=sub>0?Cr2[p]:(r-Y);
          sY+=Y; sY2+=Y*Y; sCb+=cb; sCr+=cr; n++;
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
          let Y=0.299*r+0.587*g+0.114*b; const p=y*w+x;
          let Cb=sub>0?Cb2[p]:(b-Y), Cr=sub>0?Cr2[p]:(r-Y);
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
    const maxLen = Math.max(4, Math.round((ps.dir===3?Math.hypot(w,h):ps.dir===1?h:w)*(0.05+ps.len*0.95)));
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
    if (ps.dir===3){
      // Angled: bucket every pixel by its coordinate perpendicular to the chosen angle — each bucket
      // is one "line" at that angle, running the whole image. Sort each bucket by its coordinate
      // ALONG the angle to get the pixels' true traversal order, then run the exact same run logic
      // used for rows/columns on that order (idx() is just an array lookup instead of arithmetic).
      const rad=(ps.angle||0)*Math.PI/180, ca=Math.cos(rad), sa=Math.sin(rad);
      let vmin=Infinity, vmax=-Infinity;
      for (const [cx,cy] of [[0,0],[w-1,0],[0,h-1],[w-1,h-1]]){ const v=-cx*sa+cy*ca; if(v<vmin)vmin=v; if(v>vmax)vmax=v; }
      const nBuckets = Math.max(1, Math.round(vmax-vmin)+1), buckets = new Array(nBuckets);
      for (let y=0;y<h;y++) for (let x=0;x<w;x++){
        const bIdx = Math.round(-x*sa+y*ca-vmin), u = x*ca+y*sa;
        (buckets[bIdx] || (buckets[bIdx]=[])).push([u,(y*w+x)*4]);
      }
      for (let b=0;b<nBuckets;b++){
        const arr=buckets[b]; if(!arr||arr.length<2) continue;
        arr.sort((p,q)=>p[0]-q[0]);
        const pix=arr.map(e=>e[1]);
        sortLine(k=>pix[k], pix.length, b+31.4);
      }
    }
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
    const chunk=Math.max(1,db.chunk|0);
    const stepPhase = Math.floor(phase*Math.max(1,db.speed)*4);
    const wrap = xx => { let m=xx%w; if(m<0)m+=w; return m|0; };
    const src = ctx.getImageData(0,0,w,h), out=ctx.createImageData(w,h), sd=src.data, od=out.data;
    for (let y=0;y<h;y++){
      const cy=Math.floor(y/chunk)*chunk;
      let sh = amt*w*( db.skew*0.05*(cy/h) + 0.007*Math.sin(cy*0.04 + phase*TAU*nsp) );
      let chroma=0;
      if (db.scramble>0 && rand(cy*0.7+stepPhase) < db.scramble*0.25){
        sh += (rand(cy*1.9+stepPhase)-0.5)*w*0.033*amt;  // packet break (scaled by amount)
        chroma = (rand(cy*2.3+stepPhase)-0.5)*amt*4;     // misread colour → rainbow
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
  const rowBytes=w*4, error=(P('bmpmisread','width')|0)*4+(P('bmpmisread','padding')|0), length=source.length;
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

function applyWrongFormat(w,h,phase){
// ---- Wrong Format: reinterpret the frame as if decoded with the wrong pixel layout ----
const wf = state.wrongfmt;
if (!(wf.on)) return;
const amt = P('wrongfmt','amount'); if (amt<=0) return;
const mode = wf.mode|0, roam = wf.roam, np = w*h;
const chunk=Math.max(1,wf.chunk|0);
const src = ctx.getImageData(0,0,w,h), s = src.data;
const out = ctx.createImageData(w,h), d = out.data;
const drift = Math.round(phase*w*Math.max(1,Math.round(roam*6)));   // integer px/loop → seamless

if (mode===0){                                     // Planar (triple-ghost): Y / U / V stacked as three squished bands
  for (let y=0;y<h;y++){
    const b = (y*3/h)|0, ly = (y*3 - b*h)|0, sy = ly<0?0:ly>=h?h-1:ly;
    const off = b===0 ? 0 : (b===1 ? drift : -drift);
    for (let x=0;x<w;x++){
      let sx=(x+off)%w; if(sx<0)sx+=w;
      const si=(sy*w+sx)*4, r=s[si],g=s[si+1],bl=s[si+2], lum=0.299*r+0.587*g+0.114*bl;
      let R,G,B;
      if (b===0){ R=G=B=lum; }                       // Y plane → luma ghost
      else if (b===1){ R=lum*0.4; G=lum*0.7+g*0.3; B=bl; }   // U plane → cool ghost
      else { R=r; G=lum*0.5; B=lum*0.4; }            // V plane → warm ghost
      const di=(y*w+x)*4;
      d[di]  =s[di]  +(R-s[di]  )*amt;
      d[di+1]=s[di+1]+(G-s[di+1])*amt;
      d[di+2]=s[di+2]+(B-s[di+2])*amt; d[di+3]=255;
    }
  }
} else if (mode===1){                               // Stride Shear: wrong row stride → diagonal wrap-tear
  const stride = amt*w*0.9;
  for (let y=0;y<h;y++){
    const cy=Math.floor(y/chunk)*chunk, off = (Math.round(cy*stride/h*8) + drift);
    for (let x=0;x<w;x++){
      let sx=(x+off)%w; if(sx<0)sx+=w;
      const si=(y*w+sx)*4, di=(y*w+x)*4;
      d[di]=s[si]; d[di+1]=s[si+1]; d[di+2]=s[si+2]; d[di+3]=255;
    }
  }
} else if (mode===2){                               // Bit Depth (16→8): halved width + hi/lo byte shimmer
  for (let y=0;y<h;y++) for (let x=0;x<w;x++){
    const sx=(Math.round(x*(1+amt))+((drift)|0))%w, sxx=sx<0?sx+w:sx;
    const si=(y*w+sxx)*4, di=(y*w+x)*4, lowByte=(x&1)?(1-amt*0.5):1;
    d[di]  =s[si]  *lowByte; d[di+1]=s[si+1]*lowByte; d[di+2]=s[si+2]*lowByte; d[di+3]=255;
  }
} else {                                            // Channel Planar: RGBRGB read as RRR…GGG…BBB → per-channel ghost
  const gShift=Math.round((np/3+drift)*amt), bShift=Math.round((2*np/3+drift)*amt);
  for (let p=0;p<np;p++){
    const di=p*4;
    let gp=(p+gShift)%np; if(gp<0)gp+=np;
    let bp=(p+bShift)%np; if(bp<0)bp+=np;
    d[di]  =s[di];
    d[di+1]=s[gp*4+1];
    d[di+2]=s[bp*4+2]; d[di+3]=255;
  }
}

}

function applyWeirdFormat(w,h,phase){
  const wf=state.weirdfmt;
  if (!(wf && wf.on && wf.amount>0)) return;
  const src=ctx.getImageData(0,0,w,h), sd=src.data, out=ctx.createImageData(w,h), od=out.data;
  const tile=Math.max(2,wf.tile|0), mode=wf.mode|0, amount=P('weirdfmt','amount'), stride=P('weirdfmt','stride'), pal=P('weirdfmt','palette');
  const cols=Math.ceil(w/tile), rows=Math.ceil(h/tile), frame=Math.floor(phase*8);
  const sample=(x,y,ch)=>{ x=Math.max(0,Math.min(w-1,x|0)); y=Math.max(0,Math.min(h-1,y|0)); return sd[(y*w+x)*4+ch]; };
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){
    const tx=Math.floor(x/tile), ty=Math.floor(y/tile), lx=x%tile, ly=y%tile;
    let sx=x, sy=y;
    if(mode===0){ sx=((tx*tile + ly + frame*tile*stride)|0); sy=((ty*tile + lx - frame*tile*stride)|0); }
    else if(mode===1){ const fx=(tx+((ty+frame)%3))*tile; sx=fx+(tile-1-lx); sy=((ty*tile+ly)+(tx%3)*tile)|0; }
    else if(mode===2){ sx=x+Math.round(Math.sin((ty+frame)*.8)*tile*stride); sy=y; }
    else { sx=x+Math.round((ly-lx)*stride*tile); sy=y+Math.round((lx+ly)*stride*tile*.35); }
    let R=sample(sx,sy,0), G=sample(sx+tile,sy,1), B=sample(sx,sy+tile,2);
    if(mode===2){ R=(R&0xf0)|((G>>4)&15); G=(G&0xf0)|((B>>4)&15); B=(B&0xf0)|((R>>4)&15); }
    const shift=Math.round((rand(tx*13.7+ty*31.1+frame)*2-1)*pal*80);
    R=Math.max(0,Math.min(255,R+shift)); G=Math.max(0,Math.min(255,G-shift*.6)); B=Math.max(0,Math.min(255,B+shift*.8));
    const i=(y*w+x)*4; od[i]=sd[i]+(R-sd[i])*amount; od[i+1]=sd[i+1]+(G-sd[i+1])*amount; od[i+2]=sd[i+2]+(B-sd[i+2])*amount; od[i+3]=255;
  }
  ctx.putImageData(out,0,0);
}

function applyProgressiveLoad(w,h,phase){
  const fx=state.progressive;
  if (!(fx && fx.on && P('progressive','amount')>0)) return;
  const amount=P('progressive','amount'), block=Math.max(2,fx.block|0), speed=Math.max(.1,P('progressive','speed')), mode=fx.mode|0, dither=P('progressive','dither');
  const src=ctx.getImageData(0,0,w,h), s=src.data, out=ctx.createImageData(w,h), d=out.data;
  const p=Math.min(1,(phase*speed)%1), sample=(x,y,c)=>{ x=Math.max(0,Math.min(w-1,x|0)); y=Math.max(0,Math.min(h-1,y|0)); return s[(y*w+x)*4+c]; };
  const smooth=v=>v<=0?0:v>=1?1:v*v*(3-2*v);
  const adam7=[[0,0,8,8],[4,0,8,8],[0,4,4,8],[2,0,4,4],[0,2,2,4],[1,0,2,2],[0,1,1,2]];
  const adamPass=(x,y)=>{ for(let k=0;k<adam7.length;k++){ const a=adam7[k]; if(x>=a[0]&&y>=a[1]&&((x-a[0])%a[2])===0&&((y-a[1])%a[3])===0) return k; } return 6; };
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){
    const bx=Math.floor(x/block), by=Math.floor(y/block), i=(y*w+x)*4; let cx=bx*block+Math.floor(block*.5), cy=by*block+Math.floor(block*.5);
    let reveal;
    if(mode===1){ const field=(y&1)?0.18:0; reveal=smooth((p-field)*1.25); }
    else if(mode===2){ reveal=smooth(p*1.25); }
    else if(mode===3){
      const pass=adamPass(x,y), stage=p*7, level=Math.min(6,Math.floor(stage));
      // Adam7 pass progression is presented as a resolution ladder: each pass doubles
      // horizontal and vertical detail, so the visible mosaic area becomes ~1/4.
      const coarse=Math.max(1,Math.ceil(block/Math.pow(2,level)));
      reveal=pass<stage ? 1 : smooth(stage-pass);
      const mx=Math.floor(x/coarse)*coarse+Math.floor(coarse*.5);
      const my=Math.floor(y/coarse)*coarse+Math.floor(coarse*.5);
      cx=mx; cy=my;
    }
    else reveal=smooth((p*h-y)/(Math.max(1,block)*1.35));
    if(p>.97) reveal=1;
    if(dither>0 && reveal>0 && rand(bx*37.1+by*11.9+Math.floor(p*80))<dither*(1-reveal)) reveal=0;
    for(let c=0;c<3;c++){ const mosaic=sample(cx,cy,c), v=mosaic+(sample(x,y,c)-mosaic)*reveal; d[i+c]=s[i+c]+(v-s[i+c])*amount; }
    d[i+3]=255;
  }
  ctx.putImageData(out,0,0);
}

function applyBankSwap(w,h,phase){
// ---- Bank Swap: tile-grid hardware corruption — the "half-inserted cartridge" look. Divide the
//      frame into fixed tiles; a share (Amount) of them are fetched from a wrong ROM address
//      (Bank Shift), sometimes stuck in a horizontal run (a bus that quit reporting new tiles),
//      and their attribute-table palette is periodically rotated over aligned Attribute Blocks
//      (the NES's 2x2 or 4x4 tile palette regions). Timing shapes how the pattern evolves:
//      Sync ticks the whole grid together (rigid), Async gives each tile its own clock offset
//      (organic churn), Cascade sweeps the reroll across the frame, and Burst holds long stable
//      stretches punctuated by brief flurries. Reroll Rate is the per-loop rate driving it.
const bs = state.bankswap;
if (!(bs.on && P('bankswap','amount')>0)) return;
const amt = P('bankswap','amount');
const tile = Math.max(4, bs.tile|0);
const shift = bs.shift;
const stuck = bs.stuck;
const palette = bs.palette;
const attr = bs.attr|0;                                                // 0=off, 1=2 tiles, 2=4 tiles
const reroll = Math.max(1, bs.reroll|0);
const timing = bs.timing|0;
// Global tick — used by Sync and Burst; per-tile clocks branch off it. All modes wrap seamlessly
// on the loop because reroll is an integer and phase ∈ [0,1).
const pat = Math.floor(phase * reroll);
// Burst mode holds Amount at 0 for most of the loop and blasts up to full during short "impact"
// windows so the whole thing reads as sparse hits instead of a steady patter. Impact positions
// come from a seeded schedule so the loop stays repeatable.
let burstScale = 1;
if (timing===3){
  const impacts = Math.max(1, Math.round(reroll*0.6));                 // fewer, wider hits than Sync
  const width = 0.06 + 0.10*(1-amt);                                   // width of each impact window
  let closest = 1;
  for (let k=0; k<impacts; k++){
    const centre = rand(k*17.3 + 0.31);
    const d = Math.abs(((phase - centre + 1.5) % 1) - 0.5);            // wrapped distance on the loop
    if (d < closest) closest = d;
  }
  burstScale = Math.max(0, 1 - closest/width);                         // 1 at impact centre, 0 outside
  if (burstScale <= 0.01) return;                                      // nothing to render this frame
}
const src = ctx.getImageData(0,0,w,h), s = src.data;
const out = ctx.createImageData(w,h), d = out.data;
const tw = Math.ceil(w/tile), th = Math.ceil(h/tile);
// Per-tile clock. Sync ticks the whole grid at once; Async gives each tile its own phase offset
// so the churn is continuous rather than a shared flip; Cascade rolls a wavefront across the
// frame in a chosen direction. All modes wrap seamlessly on the loop.
const nx = Math.max(1, tw-1), ny = Math.max(1, th-1);
const sweep = bs.sweep|0;
// Higher offset = earlier transition. Down sweep needs top row to transition first → top row
// has the highest offset → offset = (ny - ty) / ny.
const cascadeOff = (tx, ty) => {
  switch (sweep){
    case 0: return (ny - ty) / ny;                                      // Down ↓
    case 1: return ty / ny;                                             // Up ↑
    case 2: return (nx - tx) / nx;                                      // Right →
    case 3: return tx / nx;                                             // Left ←
    case 4: return ((ny - ty) + (nx - tx)) / (nx + ny);                 // Diagonal ↘
    case 5: return (ty + (nx - tx)) / (nx + ny);                        // Diagonal ↗
    default: return (ny - ty) / ny;
  }
};
const tilePatFor = (tx, ty) => {
  if (timing===1){
    const off = rand(tx*5.71 + ty*3.13 + 0.17);
    return Math.floor(((phase + off) % 1) * reroll);
  }
  if (timing===2){
    const off = cascadeOff(tx, ty);
    return Math.floor(((phase + off) % 1) * reroll);
  }
  return pat;                                                          // Sync and Burst: global tick
};
const effAmt = amt * burstScale;                                       // Burst tapers into and out of the impact
const srcTx = new Int32Array(tw*th), srcTy = new Int32Array(tw*th), palRot = new Uint8Array(tw*th);
for (let ty=0; ty<th; ty++){
  for (let tx=0; tx<tw; tx++){
    const idx = ty*tw + tx;
    const p = tilePatFor(tx, ty);
    const roll = rand(tx*3.7 + ty*2.13 + p*11.3);
    if (roll >= effAmt){ srcTx[idx]=tx; srcTy[idx]=ty; continue; }
    // Bank Shift: sample a wrong tile address (wraps around the tile grid)
    const sx = Math.floor((rand(tx*5.3 + ty*1.7 + p*3.1) - 0.5) * tw * shift * 2);
    const sy = Math.floor((rand(tx*7.9 + ty*3.7 + p*5.7) - 0.5) * th * shift);
    srcTx[idx] = ((tx + sx) % tw + tw) % tw;
    srcTy[idx] = ((ty + sy) % th + th) % th;
    // Stuck Run: bus quit reporting mid-row → this tile freezes on its left neighbour's source
    if (stuck>0 && tx>0){
      const stickRoll = rand(tx*1.3 + ty*4.7 + p*7.1);
      if (stickRoll < stuck){ srcTx[idx] = srcTx[idx-1]; srcTy[idx] = srcTy[idx-1]; }
    }
  }
}
// Attribute Blocks: whole regions of tiles share a palette rotation, like the NES attribute table.
// Uses the top-left tile's clock so Async / Cascade also decorrelate the attribute flips.
if (attr>0 && palette>0){
  const rSize = attr===1 ? 2 : 4;
  const rw = Math.ceil(tw/rSize), rh = Math.ceil(th/rSize);
  for (let ry=0; ry<rh; ry++) for (let rx=0; rx<rw; rx++){
    const p = tilePatFor(rx*rSize, ry*rSize);
    const attrRoll = rand(rx*13.1 + ry*17.3 + p*3.7);
    if (attrRoll >= palette * burstScale) continue;
    const rot = 1 + Math.floor(rand(rx*7.1 + ry*11.9 + p*5.3)*3);
    for (let ty=ry*rSize; ty<Math.min(th,(ry+1)*rSize); ty++)
      for (let tx=rx*rSize; tx<Math.min(tw,(rx+1)*rSize); tx++)
        palRot[ty*tw + tx] = rot;
  }
}
for (let y=0; y<h; y++){
  const ty = (y/tile)|0, oy = y - ty*tile;
  for (let x=0; x<w; x++){
    const tx = (x/tile)|0, ox = x - tx*tile;
    const idx = ty*tw + tx;
    const sy = srcTy[idx]*tile + oy, sx = srcTx[idx]*tile + ox;
    const si = ((sy<h?sy:h-1)*w + (sx<w?sx:w-1))*4, di = (y*w+x)*4;
    let r = s[si], g = s[si+1], b = s[si+2];
    const rot = palRot[idx];
    if (rot){                                                          // channel rotation = wrong palette lookup
      if (rot===1){ const t=r; r=g; g=b; b=t; }
      else if (rot===2){ const t=r; r=b; b=g; g=t; }
      else { r=255-r; g=255-g; b=255-b; }                              // rot===3: inverted palette entry
    }
    d[di]=r; d[di+1]=g; d[di+2]=b; d[di+3]=255;
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

// ---- RLE Databend: genuine TGA-style RLE8 packet stream (flat, no per-row reset), corrupt the
//      packet headers, decode the wreckage. A corrupted header desyncs the byte cursor, so every
//      packet after it reads from the wrong offset — the colour runs bleed/shift across the rest
//      of the picture, the signature RLE-desync smear. No browser codec involved, so it's fully
//      live and Envelope-capable — real format corruption, computed like a sim effect.
function rleEncode(idx, n){
  const bytes=[], headerPos=[], pixelPos=[];   // pixelPos[k] = the pixel each header's packet starts at
  let i=0;
  while (i<n){
    let runLen=1; while (i+runLen<n && idx[i+runLen]===idx[i] && runLen<128) runLen++;
    if (runLen>=2){
      headerPos.push(bytes.length); pixelPos.push(i); bytes.push(0x80|(runLen-1)); bytes.push(idx[i]);
      i+=runLen;
    } else {
      let count=0; let j=i;
      while (j<n && count<128){
        let rl=1; while (j+rl<n && idx[j+rl]===idx[j] && rl<128) rl++;
        if (rl>=2) break;
        j++; count++;
      }
      headerPos.push(bytes.length); pixelPos.push(i); bytes.push((count-1)&0x7F);
      for (let k=0;k<count;k++) bytes.push(idx[i+k]);
      i+=count;
    }
  }
  return { bytes:new Uint8Array(bytes), headerPos, pixelPos };
}
function rleDecode(bytes, target, n, palLen){
  let bi=0, pos=0;
  while (bi<bytes.length && pos<n){
    const hdr=bytes[bi++];
    if (hdr & 0x80){
      const count=(hdr&0x7F)+1;
      if (bi>=bytes.length) break;
      const val=bytes[bi++]%palLen, end=Math.min(n,pos+count);
      target.fill(val,pos,end); pos=end;
    } else {
      const count=(hdr&0x7F)+1;
      for (let k=0;k<count && pos<n;k++){ if (bi>=bytes.length) break; target[pos++]=bytes[bi++]%palLen; }
    }
  }
}
function applyRleDatabend(w,h,phase){
const rl = state.rle;
if (!(rl.on)) return;
const amt = P('rle','amount'); if (amt<=0) return;
const colors = Math.max(2, rl.colors|0);
ensureGifPalette(colors);
const pal = gifPal, palLen = pal.length, map = gifMapper, n=w*h;
const im = ctx.getImageData(0,0,w,h), d = im.data;
const idx = new Uint8Array(n);
for (let p=0,i=0;p<n;p++,i+=4) idx[p]=map(d[i],d[i+1],d[i+2]);
const { bytes, headerPos, pixelPos } = rleEncode(idx, n);
if (!headerPos.length) return;                       // flat single-colour image → nothing to corrupt
const speed = Math.max(1, rl.speed|0), step = Math.floor(phase*speed);
const HN = headerPos.length, cbytes = bytes.slice();
const flip = pos => {   // flip the RLE/raw type bit so the packet's byte-length ALWAYS differs from the
  const orig=bytes[pos]; // original — every hit reliably desyncs the cursor onward (not just recolours locally)
  cbytes[pos] = ((orig ^ 0x80) & 0x80) | (Math.floor(rand(step*7.3+pos*0.037+1.7)*128) & 0x7F);
};
// binary-search the header whose packet starts nearest a given PIXEL fraction (not packet-list
// fraction — packet density varies wildly between flat and busy regions, so indexing by pixel
// position keeps Amount meaning "this fraction of the picture, by area" regardless of content).
const headerAt = targetPixel => { let lo=0, hi=HN-1;
  while (lo<hi){ const mid=(lo+hi)>>1; if (pixelPos[mid]<targetPixel) lo=mid+1; else hi=mid; } return headerPos[lo]; };
// Amount picks WHERE the guaranteed desync starts — low Amount corrupts only a small tail of the
// picture, high Amount starts near the top (most of the picture smears). Step-jittered spread keeps
// it from being a single hard edge.
const frac = Math.max(0.02, 1-amt) + (rand(step*3.7+0.4)-0.5)*0.06;
flip(headerAt(Math.min(n-1, Math.max(0, Math.round(frac*n)))));
const extra = 1 + Math.floor(amt*3);                  // a few extra scattered hits add per-step texture
for (let k=0;k<extra;k++) flip(headerPos[Math.floor(rand(step*13.7+k*3.1+0.5)*HN)%HN]);
const idx2 = idx.slice();
rleDecode(cbytes, idx2, n, palLen);
for (let p=0,i=0;p<n;p++,i+=4){ const c=pal[idx2[p]]; d[i]=c[0]; d[i+1]=c[1]; d[i+2]=c[2]; d[i+3]=255; }
ctx.putImageData(im,0,0);
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
    } else if (mode===3){                          // Tremolo — amplitude LFO along the stream → rolling bands
      const k=6.283/Math.max(8,D), dep=amt;
      for (let i=0;i<len;i++){ if((i&3)===3) continue; d[i]=d[i]*(1+dep*Math.sin(i*k)); }
    } else if (mode===4){                           // Ring Mod — multiply by a carrier sine → metallic interference / new colours
      const k=6.283/Math.max(2,D>>1);
      for (let i=0;i<len;i++){ if((i&3)===3) continue; const ring=128+(d[i]-128)*Math.sin(i*k); d[i]=d[i]+(ring-d[i])*amt; }
    } else if (mode===5){                           // Overdrive — sine wavefold → oversaturated neon bands
      const drive=1+amt*6;
      for (let i=0;i<len;i++){ if((i&3)===3) continue; const fold=128+127*Math.sin((d[i]-128)/128*drive*1.5708); d[i]=d[i]+(fold-d[i])*amt; }
    } else if (mode===6){                           // Stutter — repeat short byte runs → horizontal glitch tiles
      const snap=d.slice(), rep=Math.max(16,(P('sonify','delay')*8|0))&~3, span=rep*3;   // ~2–200px tiles across the slider
      for (let i=0;i<len;i++){ if((i&3)===3) continue; const b=Math.floor(i/span)*span, s2=b+((i-b)%rep); d[i]=d[i]+(snap[s2]-d[i])*amt; }
    } else {                                        // Decimate (sample & hold) — hold every N pixels → chunky colour steps
      const snap=d.slice(), hold=Math.max(1,Math.round(P('sonify','delay')*0.6));        // ~1–60px steps
      for (let i=0;i<len;i++){ const ch=i&3; if(ch===3) continue; const held=Math.floor((i>>2)/hold)*hold; d[i]=d[i]+(snap[held*4+ch]-d[i])*amt; }
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
      const cy=Math.floor(y/Math.max(1,bsf.chunk|0))*Math.max(1,bsf.chunk|0);
      const rowShift=px+Math.round(cy*bsf.skew*1.5), row=y*w;
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
// A coarse grid of random motion vectors, bilinear-interpolated — a lightweight optical-flow
// stand-in. Real datamosh drags content along motion vectors estimated from neighbouring frames,
// so nearby blocks move together in a coherent sweep rather than jumping to unrelated offsets;
// this gives block displacement that same coherent, melting/peeling character.
function flowVec(seed,gx,gy){
  const a = rand(seed*31.7+gx*13.1+gy*29.3+3)*Math.PI*2, mag = rand(seed*17.3+gx*7.7+gy*11.3+50);
  return [Math.cos(a)*mag, Math.sin(a)*mag];
}
function sampleFlow(seed,u,v,GX,GY){
  const fx=u*(GX-1), fy=v*(GY-1), gx0=Math.floor(fx), gy0=Math.floor(fy), tx=fx-gx0, ty=fy-gy0;
  const gx1=Math.min(GX-1,gx0+1), gy1=Math.min(GY-1,gy0+1);
  const v00=flowVec(seed,gx0,gy0), v10=flowVec(seed,gx1,gy0), v01=flowVec(seed,gx0,gy1), v11=flowVec(seed,gx1,gy1);
  return [
    v00[0]*(1-tx)*(1-ty)+v10[0]*tx*(1-ty)+v01[0]*(1-tx)*ty+v11[0]*tx*ty,
    v00[1]*(1-tx)*(1-ty)+v10[1]*tx*(1-ty)+v01[1]*(1-tx)*ty+v11[1]*tx*ty,
  ];
}

// Accumulate reconstructs the history since the latest reset from the current loop position. Each
// event reads the pixel buffer after the previous event, so pasted damage itself becomes the source
// of later blocks and genuinely piles up. No mutable history cache is used: preview seeks, temporal
// effects and exporters can request frames out of order and still receive the same result.
function applyAccumulatedMoshBlocks(w,h,phase,intensity,d){
  const m=state.mosh, resets=Math.max(1,m.reset|0), push=m.push|0;
  const loopFrames=Math.max(1,Math.round((typeof LOOP_MS==='number'?LOOP_MS:3000)/1000*30));
  const segment= Math.min(resets-1,Math.floor(phase*resets));
  const local=phase*resets-segment;
  const history=Math.floor(local*loopFrames/resets);     // 0 exactly at reset; then one new event per 30fps frame
  const maxReps=Math.max(1,m.bloom|0), GX=3+Math.round(m.chaos*5), GY=2+Math.round(m.chaos*3);
  for(let frame=0;frame<history;frame++){
    const seed=Math.floor((segment*1009+frame)*(1+m.chaos*4))+1;
    // Accumulation adds one packet per frame. Blocks controls its footprint instead of multiplying
    // the event count, keeping a three-second pile practical even at full-resolution export.
    const bw=Math.max(4,Math.floor((.025+m.blocks*.14)*(.55+.9*rand(seed*3.1))*w));
    const bh=Math.max(2,Math.floor((.008+m.blocks*.065)*(.55+.9*rand(seed*5.7))*h));
    const sx=Math.floor(rand(seed*9.3)*Math.max(1,w-bw)), sy=Math.floor(rand(seed*1.7)*Math.max(1,h-bh));
    let [fvx,fvy]=sampleFlow(seed,(sx+bw/2)/w,(sy+bh/2)/h,GX,GY);
    const mag=Math.max(.14,Math.hypot(fvx,fvy));
    if(push===1){ fvx=0; fvy=mag; }
    else if(push===2){ fvx=0; fvy=-mag; }
    else if(push===3){ fvx=-mag; fvy=0; }
    else if(push===4){ fvx=mag; fvy=0; }
    else if(push===5){ const rx=(sx+bw/2)/w-.5, ry=(sy+bh/2)/h-.5, rl=Math.hypot(rx,ry)||1; fvx=rx/rl*mag; fvy=ry/rl*mag; }
    const dx=Math.round(fvx*w*intensity), dy=Math.round(fvy*h*intensity*(push===0?.4*m.vert:.55));
    const reps=Math.round(1+rand(seed*7.3)*(maxReps-1));
    for(let p=1;p<=reps;p++){
      const ox=dx*p, oy=dy*p;
      const left=Math.max(0,-(sx+ox)), right=Math.min(bw,w-(sx+ox));
      if(right<=left) continue;
      for(let y=0;y<bh;y++){
        const ty=sy+y+oy; if(ty<0||ty>=h) continue;
        // copyWithin is overlap-safe and keeps this a fast row copy. It reads the already-mutated
        // buffer, so later events can pick up damage laid down by earlier simulated frames.
        const si=((sy+y)*w+sx+left)*4, ti=(ty*w+sx+ox+left)*4;
        d.copyWithin(ti,si,si+(right-left)*4);
      }
    }
  }
}
// seed varies per frame; higher chaos = seed jumps more => different breakage each frame
function applyMosh(w,h,fseed,em=1,phase=0){
  const m = state.mosh;
  const intensity = m.intensity*em;
  const seed = Math.floor(fseed*(1+m.chaos*4)) + 1;
  const blockMode=m.mode|0;
  const id = ctx.getImageData(0,0,w,h);
  const d = id.data;
  if(blockMode===4 && m.blocks>0 && intensity>0) applyAccumulatedMoshBlocks(w,h,phase,intensity,d);
  const src = new Uint8ClampedArray(d);        // snapshot to read from

  // 1) block displacement (datamosh smear), dragged along a shared flow field
  //    Bloom mimics P-frame duplication: the same motion vector is applied over and over, so the
  //    block content is dragged another step each time and leaves a copy behind at every stop —
  //    the stretched, trailing look of a real datamosh. It is a ceiling, not a fixed count: each
  //    block draws its own repeat count from 1..Bloom, so the trails come out uneven. 1 = every
  //    block applied once (a plain displacement). Chaos also sets the flow grid's turbulence: calm
  //    = a few broad coherent sweeps, chaotic = many small swirling ones.
  if (m.blocks>0 && blockMode!==4){
    const n = Math.floor(1 + m.blocks*10*intensity);
    const maxReps = Math.max(1, m.bloom|0);
    const push=m.push|0;
    const GX = 3+Math.round(m.chaos*5), GY = 2+Math.round(m.chaos*3);
    for (let k=0;k<n;k++){
      const bw = Math.max(4, Math.floor((0.08+0.35*rand(seed*3.1+k))*w));
      const bh = Math.max(2, Math.floor((0.02+0.14*rand(seed*5.7+k))*h));
      const sx = Math.floor(rand(seed*9.3+k)*(w-bw));
      const sy = Math.floor(rand(seed*1.7+k)*(h-bh));
      let [fvx,fvy] = sampleFlow(seed, (sx+bw/2)/w, (sy+bh/2)/h, GX, GY);
      const mag=Math.max(.18,Math.hypot(fvx,fvy));
      if(push===1){ fvx=0; fvy=mag; }
      else if(push===2){ fvx=0; fvy=-mag; }
      else if(push===3){ fvx=-mag; fvy=0; }
      else if(push===4){ fvx=mag; fvy=0; }
      else if(push===5){ const rx=(sx+bw/2)/w-.5, ry=(sy+bh/2)/h-.5, rl=Math.hypot(rx,ry)||1; fvx=rx/rl*mag; fvy=ry/rl*mag; }
      const dxo = Math.round(fvx*w*intensity);
      const dyo = Math.round(fvy*h*intensity*(push===0?0.4*m.vert:0.55));   // Flow keeps the legacy Vertical Drift; explicit directions own both axes.
      const reps = Math.round(1 + rand(seed*7.3+k)*(maxReps-1));
      const first=blockMode===2?reps:1;                   // Duplicate jumps once; Smear leaves every intermediate copy
      for (let p=first;p<=reps;p++){
        const offx = dxo*p, offy = dyo*p;
        let readX=sx, readY=sy;
        if(blockMode===1){                                // Freeze: repeat a coarse, stable reference tile
          readX=Math.max(0,Math.min(w-bw,Math.floor(Math.floor(rand(k*2.7+1.1)*4)/4*w)));
          readY=Math.max(0,Math.min(h-bh,Math.floor(Math.floor(rand(k*4.1+2.3)*3)/3*h)));
        } else if(blockMode===3){                         // Random Paste: unrelated packet lands in this block
          readX=Math.max(0,Math.floor(rand(seed*12.7+k)*Math.max(1,w-bw)));
          readY=Math.max(0,Math.floor(rand(seed*15.1+k)*Math.max(1,h-bh)));
        }
        for (let y=0;y<bh;y++){
          const ty = sy+y+offy;
          if (ty<0||ty>=h) continue;
          for (let x=0;x<bw;x++){
            const tx = sx+x+offx;
            if (tx<0||tx>=w) continue;
            const si=((readY+y)*w+readX+x)*4, ti=(ty*w+tx)*4;
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
