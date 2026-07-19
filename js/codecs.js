// ---- shared baked-codec helpers ----
const codecSourceAt=(sources,f)=>sources && sources.length ? sources[f%sources.length] : img;
function closeCodecFrames(frames){
  for(const frame of frames||[]) if(frame && typeof frame.close==='function') frame.close();
}
async function codecMixedBitmap(clean, damaged, mix, w, h){
  const m=Math.max(0,Math.min(1,mix==null?1:mix));
  if(m>=.999) return damaged;
  codecBlend.width=w; codecBlend.height=h; codecBlendCtx.clearRect(0,0,w,h);
  codecBlendCtx.globalAlpha=1; codecBlendCtx.drawImage(clean,0,0,w,h);
  codecBlendCtx.globalAlpha=m; codecBlendCtx.drawImage(damaged,0,0,w,h);
  codecBlendCtx.globalAlpha=1;
  const out=await createImageBitmap(codecBlend);
  if(damaged!==clean && damaged.close) damaged.close();
  return out;
}
function damageOffsets(R,total,clusters,burst,spread){
  if(total<=0 || clusters<=0) return [];
  const out=[], size=Math.max(1,burst|0), sp=Math.max(0,Math.min(1,spread==null?1:spread));
  const anchor=Math.floor(R()*total);
  for(let k=0;k<clusters;k++){
    const start=sp>=.999 ? Math.floor(R()*total)
      : Math.max(0,Math.min(total-1,Math.round(anchor+(R()-.5)*total*sp)));
    for(let b=0;b<size && start+b<total;b++) out.push(start+b);
  }
  return out;
}
function rangeOffset(ranges,offset){
  for(const r of ranges){ const n=r[1]-r[0]; if(offset<n)return r[0]+offset; offset-=n; }
  return ranges.length?ranges[ranges.length-1][1]-1:0;
}
function damageWindow(total,mode,size,f,nFrames,R){
  if((mode|0)===0)return [0,total];
  const span=Math.max(1,Math.min(total,Math.round(total*Math.max(.001,Math.min(1,size==null ? .35 : size))))), room=Math.max(0,total-span);
  let start=0;
  if(mode===2)start=Math.round(room*.5);
  else if(mode===3)start=room;
  else if(mode===4)start=Math.round(room*(nFrames>1?f/(nFrames-1):.5));
  else if(mode===5)start=Math.floor(R()*(room+1));
  return [start,span];
}
function mutatePositions(bytes,positions,R,mode,safeFF=false){
  const ps=[...new Set(positions)].filter(p=>p>=0&&p<bytes.length);
  if(!ps.length)return;
  if((mode|0)===6 && ps.length>1){                    // rotate selected chunks without inventing new bytes
    const old=ps.map(p=>bytes[p]), shift=Math.max(1,Math.floor(R()*ps.length));
    for(let i=0;i<ps.length;i++)bytes[ps[i]]=old[(i+shift)%old.length];
    return;
  }
  for(const pos of ps){
    let v;
    switch(mode|0){
      case 1:v=bytes[pos]^(1<<Math.floor(R()*8));break;
      case 2:v=bytes[pos]^(1+Math.floor(R()*255));break;
      case 3:v=0;break;
      case 4:v=255;break;
      case 5:v=bytes[Math.max(0,pos-1)];break;
      default:v=Math.floor(R()*256);
    }
    bytes[pos]=safeFF&&v===255?254:v;
  }
}

// ---- real JPEG databending ----
// re-encode the current image as JPEG and corrupt real bytes, then decode the wreckage. The Target
// picks which structure gets damaged, each a completely different genuine artifact:
//   Entropy — bytes after the SOS marker → local DCT-block melt (leaves headers/EOI intact).
//   Quant table (DQT) — every block dequantises wrong → global tone/colour ramps.
//   Huffman table (DHT) — the symbol stream desyncs from the first hit → violent collapse.
// A pool of frames is cycled so the glitch animates seamlessly.
function jpegTargetRanges(buf, target, tablepart=0){
  if (target===0){                                   // entropy: after SOS → before EOI
    let start=2; for (let i=2;i<buf.length-3;i++){ if (buf[i]===0xFF && buf[i+1]===0xDA){ start=i+2+((buf[i+2]<<8)|buf[i+3]); break; } }
    return { ranges:[[start, buf.length-2]], safe:true };  // safe = avoid faking a marker (0xFF)
  }
  const ranges=[]; let i=2;
  while (i<buf.length-4){
    if (buf[i]!==0xFF){ i++; continue; }
    const m=buf[i+1];
    if (m===0xDA || m===0xD9) break;                 // reached scan / end
    if (m===0x01 || (m>=0xD0 && m<=0xD7)){ i+=2; continue; }   // standalone markers (no length)
    const len=(buf[i+2]<<8)|buf[i+3];
    const end=Math.min(buf.length,i+2+len);
    if (target===1 && m===0xDB && len>3){             // DQT: [precision/id][64 or 128 values]...
      let p=i+4;
      while(p<end){ const info=buf[p++], precision=info>>4, id=info&15, n=precision?128:64;
        if((tablepart|0)===0 || ((tablepart|0)===1?id===0:id!==0)) ranges.push([p,Math.min(end,p+n)]);
        p+=n;
      }
    } else if(target===2 && m===0xC4 && len>19){       // DHT: [class/id][16 counts][symbols]...
      let p=i+4;
      while(p+17<=end){ const info=buf[p++], cls=info>>4; let symbols=0;
        for(let k=0;k<16;k++) symbols+=buf[p+k];
        const tableEnd=Math.min(end,p+16+symbols);
        if((tablepart|0)===0 || ((tablepart|0)===1?cls===0:cls!==0)) ranges.push([p,tableEnd]);
        p=tableEnd;
      }
    }
    i+=2+len;
  }
  return { ranges, safe:false };                     // table data is length-delimited → any byte is fine
}
async function buildJpegFrames(sources){
  if (!img) return;
  const j = state.jpeg, w = canvas.width, h = canvas.height;
  jsrc.width = w; jsrc.height = h;
  const target = j.target|0;
  const maxHits = target===2 ? 4 : target===1 ? 10 : 40;   // tables desync hard → far fewer hits
  const nFrames = Math.max(1, Math.round(j.frames));
  const out = [], encoded=new Map();
  for (let f=0; f<nFrames; f++){
    const clean=codecSourceAt(sources,f);
    let buf=encoded.get(clean);
    if(!buf){ jctx.clearRect(0,0,w,h); jctx.drawImage(clean,0,0,w,h);
      const blob=await new Promise(r=>jsrc.toBlob(r,'image/jpeg',j.quality));
      buf=new Uint8Array(await blob.arrayBuffer()); encoded.set(clean,buf); }
    const {ranges,safe}=jpegTargetRanges(buf,target,j.tablepart);
    if(!ranges.length) continue;
    const total=ranges.reduce((a,r)=>a+(r[1]-r[0]),0);
    const R = makeRng(RNG_TAG.jpeg + f*101);        // per-frame stream: frames differ, but deterministically
    const copy = buf.slice();
    const safety=j.safety==null?1:j.safety|0, safetyGain=safety===0?.55:safety===2?1.55:1;
    const baseHits=Math.max(1,Math.round((1+Math.floor(j.amount*maxHits))*safetyGain));
    const hits=Math.floor(baseHits*(j.density==null?1:j.density));
    const [winStart,winLen]=damageWindow(total,j.where,j.window,f,nFrames,R), positions=[];
    for(const off of damageOffsets(R,winLen,hits,j.burst,j.spread)){
      const pos=rangeOffset(ranges,winStart+off);
      if (safe && (copy[pos]===0xFF || copy[pos-1]===0xFF)) continue;   // entropy: don't fake a marker
      positions.push(pos);
    }
    mutatePositions(copy,positions,R,j.mutation,safe);
    let damaged=null;
    try { damaged=await createImageBitmap(new Blob([copy],{type:'image/jpeg'})); } catch(e){}
    // Stable/Balanced retry with half the mutations. Wild deliberately keeps the decoder failures.
    if(!damaged && safety<2 && positions.length>1){ const retry=buf.slice(), keep=positions.slice(0,Math.max(1,Math.floor(positions.length/2)));
      mutatePositions(retry,keep,makeRng(RNG_TAG.jpeg+f*101+77),j.mutation,safe);
      try { damaged=await createImageBitmap(new Blob([retry],{type:'image/jpeg'})); } catch(e){} }
    if(damaged) out.push(await codecMixedBitmap(clean,damaged,j.mix,w,h));
  }
  return out;
}

// ---- real WebP databending ----
// re-encode as low-quality WebP and corrupt bytes in the VP8 payload (past the RIFF/VP8 headers).
// VP8's arithmetic decoder is fragile, so corruptions are few & undecodable frames are dropped.
function webpPayloadRanges(buf,target=0){
  const ranges=[];
  if(buf.length<20 || String.fromCharCode(...buf.slice(0,4))!=='RIFF' || String.fromCharCode(...buf.slice(8,12))!=='WEBP') return ranges;
  for(let p=12;p+8<=buf.length;){
    const type=String.fromCharCode(...buf.slice(p,p+4));
    const size=(buf[p+4]|(buf[p+5]<<8)|(buf[p+6]<<16)|(buf[p+7]<<24))>>>0, start=p+8, end=Math.min(buf.length,start+size);
    if(type==='VP8 ' || type==='VP8L'){
      const safeStart=Math.min(end,start+(type==='VP8 '?20:5)), span=end-safeStart;
      if(span>0){
        if((target|0)===1) ranges.push([safeStart,safeStart+Math.max(1,Math.floor(span*.45))]);
        else if((target|0)===2) ranges.push([safeStart+Math.floor(span*.45),end]);
        else ranges.push([safeStart,end]);
      }
    }
    p=start+size+(size&1);
  }
  return ranges;
}
async function buildWebpFrames(sources){
  if (!img) return;
  const myToken = ++webpToken;
  const wp = state.webp, w = canvas.width, h = canvas.height;
  wsrc.width = w; wsrc.height = h;
  const nFrames = Math.max(1, Math.round(wp.frames));
  const out = [], encoded=new Map();
  for (let f=0; f<nFrames; f++){
    const clean=codecSourceAt(sources,f);
    let buf=encoded.get(clean);
    if(!buf){ wctx.clearRect(0,0,w,h); wctx.drawImage(clean,0,0,w,h);
      const blob=await new Promise(r=>wsrc.toBlob(r,'image/webp',wp.quality/100));
      if(!blob || !/webp/.test(blob.type))continue;
      buf=new Uint8Array(await blob.arrayBuffer()); encoded.set(clean,buf); }
    const ranges=webpPayloadRanges(buf,wp.target), span=ranges.reduce((n,r)=>n+r[1]-r[0],0);
    if(!span) continue;
    const R = makeRng(RNG_TAG.webp + f*101);
    const copy = buf.slice();
    const safety=wp.safety==null?0:wp.safety|0, gain=safety===0?.45:safety===2?1.5:1;
    const baseHits=Math.max(1,Math.round((1+Math.floor(wp.amount*12))*gain)), hits=Math.floor(baseHits*(wp.density==null?1:wp.density));
    const [winStart,winLen]=damageWindow(span,wp.where,wp.window,f,nFrames,R);
    const positions=damageOffsets(R,winLen,hits,wp.burst,wp.spread).map(off=>rangeOffset(ranges,winStart+off));
    mutatePositions(copy,positions,R,wp.mutation);
    let damaged=null;
    try { damaged=await createImageBitmap(new Blob([copy],{type:'image/webp'})); } catch(e){}
    if(!damaged && safety<2 && positions.length>1){ const retry=buf.slice(), keep=positions.slice(0,Math.max(1,Math.floor(positions.length/2)));
      mutatePositions(retry,keep,makeRng(RNG_TAG.webp+f*101+77),wp.mutation);
      try { damaged=await createImageBitmap(new Blob([retry],{type:'image/webp'})); } catch(e){} }
    if(damaged) out.push(await codecMixedBitmap(clean,damaged,wp.mix,w,h));
  }
  if (myToken!==webpToken){ closeCodecFrames(out); return null; }
  return out;
}

// ---- real GIF databending ----
// Encode the current image as a single-frame GIF (median-cut + LZW), tracking where the colour
// table and LZW image data live so either part can be corrupted, then decode the broken GIF.
function gifEncodeBase(srcImg, ncolors){
  // work at a capped resolution so the many iterative passes stay fast (and it reads more lo-fi)
  const cw=canvas.width, ch=canvas.height, sc=Math.min(1, 384/Math.max(cw,ch));
  const w=Math.max(1,Math.round(cw*sc)), h=Math.max(1,Math.round(ch*sc));
  ggsrc.width=w; ggsrc.height=h; ggctx.clearRect(0,0,w,h); ggctx.drawImage(srcImg,0,0,w,h);
  const data=ggctx.getImageData(0,0,w,h).data;
  const sample=[]; for (let i=0;i<data.length;i+=4*7) sample.push([data[i],data[i+1],data[i+2]]);
  let pal=medianCut(sample, Math.max(2, ncolors|0));
  let gctBits=1; while ((1<<gctBits) < pal.length) gctBits++;
  const gctSize=1<<gctBits; while (pal.length<gctSize) pal.push([0,0,0]);
  const map=makeMapper(pal), idx=new Uint8Array(w*h);
  for (let i=0,pi=0;i<data.length;i+=4,pi++) idx[pi]=map(data[i],data[i+1],data[i+2]);
  const minCode=Math.max(2, gctBits);
  const bytes=[]; const put=(...a)=>{ for(const x of a) bytes.push(x&0xFF); }; const puts=s=>{ for(const ch of s) bytes.push(ch.charCodeAt(0)); };
  puts('GIF89a');
  put(w&255,(w>>8)&255, h&255,(h>>8)&255, 0x80|((gctBits-1)<<4)|(gctBits-1), 0, 0);
  const ctStart=bytes.length; for (const p of pal) put(p[0],p[1],p[2]); const ctLen=bytes.length-ctStart;
  put(0x2C, 0,0,0,0, w&255,(w>>8)&255, h&255,(h>>8)&255, 0x00);
  put(minCode);
  const lzwStart=bytes.length; for (const b of packSubBlocks(gifLZW(idx, minCode))) bytes.push(b);
  put(0x3B);
  const base=new Uint8Array(bytes);
  const lzwPos=[]; let p=lzwStart;
  while (p<base.length-1){ const len=base[p]; if(len===0) break; for(let q=p+1;q<=p+len && q<base.length;q++) lzwPos.push(q); p+=len+1; }
  return { base, ctStart, ctLen, lzwPos };
}
const gifDecode = copy => createImageBitmap(new Blob([copy], {type:'image/gif'})).catch(()=>null);
function mutateGifPalette(copy,ctStart,ctLen,amount,mode,target,R){
  if(amount<=0 || ctLen<3) return;
  const count=Math.floor(ctLen/3), entries=[];
  for(let e=0;e<count;e++){ const i=ctStart+e*3, lum=(copy[i]*.299+copy[i+1]*.587+copy[i+2]*.114)/255;
    if((target|0)===4 && lum<.55)continue; if((target|0)===5 && lum>.45)continue; entries.push(e); }
  if(!entries.length)return;
  const channels=(target|0)>=1&&(target|0)<=3?[(target|0)-1]:[0,1,2];
  const hits=Math.max(1,Math.round(amount*entries.length*.36));
  if((mode|0)===1){                                    // rotate eligible palette entries
    const old=entries.map(e=>channels.map(c=>copy[ctStart+e*3+c])), shift=Math.max(1,Math.round(amount*(entries.length-1)));
    for(let n=0;n<entries.length;n++)for(let q=0;q<channels.length;q++)copy[ctStart+entries[n]*3+channels[q]]=old[(n+shift)%entries.length][q];
  } else if((mode|0)===2){                             // swap entry pairs
    for(let n=0;n<hits;n++){ const a=entries[Math.floor(R()*entries.length)],b=entries[Math.floor(R()*entries.length)];
      for(const c of channels){ const ia=ctStart+a*3+c,ib=ctStart+b*3+c,t=copy[ia];copy[ia]=copy[ib];copy[ib]=t; } }
  } else {
    for(let n=0;n<hits;n++){ const e=entries[Math.floor(R()*entries.length)], i=ctStart+e*3;
      if((mode|0)===4){ const r=copy[i],g=copy[i+1],b=copy[i+2];copy[i]=g;copy[i+1]=b;copy[i+2]=r; }
      else for(const c of channels) copy[i+c]=(mode|0)===3?255-copy[i+c]:Math.floor(R()*256);
    }
  }
}

// GIF Databend: corrupt the real GIF file bytes — the colour table (garish colours) and the LZW
// image data (tears the picture). A single pass can only break as much as the browser still decodes,
// so higher Data ITERATES: re-encode the decoded (already-glitched) result and corrupt again. Each
// pass stays within the decode limit but the damage accumulates past the single-pass ceiling.
async function buildGifgFrames(sources){
  if (!img) return;
  const myToken=++gifgToken; const gg=state.gifg;
  // Decoders behave OPPOSITELY: tolerant ones (Chrome/FF) heal most corruption, strict ones (iOS Safari)
  // wipe everything below the first corrupted code. So keep it gentle and bias hits LATE (the corruption
  // point stays low in the frame → the top of the picture survives on strict decoders too).
  const passes = (gg.iterations|0)>0 ? Math.max(1,gg.iterations|0) : 1 + Math.round(gg.data*3); // 0 keeps legacy Data-driven passes
  const nFrames=Math.max(1, Math.round(gg.frames)), out=[];
  const corrupt = (enc, R, frameIndex)=>{
    const { base, ctStart, ctLen, lzwPos } = enc;
    const lateStart=Math.floor(lzwPos.length*(0.85 - gg.data*0.4));  // Data 0 → last 15%, Data 1 → last 55%
    let lz=Math.floor(Math.max(1,Math.round(1+gg.data*8))*(gg.density==null?1:gg.density)); // density may reach zero for palette-only / gentle output
    return async ()=>{                                          // per-pass back-off (falls to palette-only)
      for (let t=0;t<4;t++){
        const copy=base.slice();
        mutateGifPalette(copy,ctStart,ctLen,gg.palette,gg.palmode,gg.paltarget,R);
        if(lz>0 && lzwPos.length>lateStart){ const span=lzwPos.length-lateStart;
          const [winStart,winLen]=damageWindow(span,gg.where,gg.window,frameIndex,Math.max(1,gg.frames|0),R);
          const positions=damageOffsets(R,winLen,lz,gg.burst,gg.spread).map(off=>lzwPos[lateStart+winStart+off]);
          mutatePositions(copy,positions,R,gg.mutation); }
        const bmp=await gifDecode(copy); if (bmp) return bmp;
        lz=Math.floor(lz/2);                                    // t=... eventually lz=0 → palette-only, always decodes
      }
      return null;
    };
  };
  const makeFrame = async (f)=>{
    const clean=codecSourceAt(sources,f);
    const R = makeRng(RNG_TAG.gifg + f*101);                     // one stream per frame, shared across its passes
    let cur=clean, result=null;
    for (let p=0; p<passes; p++){
      const bmp=await corrupt(gifEncodeBase(cur,gg.colors||64),R,f)(); // re-encode previous result, corrupt, decode
      if (bmp){ if(result && result!==bmp && result.close) result.close(); result=bmp; cur=bmp; } // success → accumulate; fail → skip
    }
    const damaged=result || await gifDecode(gifEncodeBase(clean,gg.colors||64).base.slice());
    return damaged ? codecMixedBitmap(clean,damaged,gg.mix,canvas.width,canvas.height) : null;
  };
  for (let f=0; f<nFrames; f++){ const b=await makeFrame(f); if(b) out.push(b); }
  if (myToken!==gifgToken){ closeCodecFrames(out); return null; }
  return out;
}

// ---- real PNG glitch (inspired by ucnv/pnglitch) ----
// PNG is structurally valid (re-deflated, correct CRCs); the glitch lives in the
// filtered scanline data. Corrupting each row's filter-type byte makes the decoder
// un-filter with the wrong predictor -> Sub=horizontal, Up=vertical, Avg/Paeth=diagonal
// colour bleed. Flipping pixel bytes adds pure random noise.
const CRC_TABLE = (()=>{ const t=new Uint32Array(256);
  for(let n=0;n<256;n++){ let c=n; for(let k=0;k<8;k++) c = c&1 ? 0xEDB88320^(c>>>1) : c>>>1; t[n]=c>>>0; }
  return t; })();
function crc32(bytes){ let c=0xFFFFFFFF;
  for(let i=0;i<bytes.length;i++) c = CRC_TABLE[(c^bytes[i])&255] ^ (c>>>8);
  return (c^0xFFFFFFFF)>>>0; }
function u32(n){ return new Uint8Array([(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255]); }
function concat(arrays){ let len=0; for(const a of arrays) len+=a.length;
  const out=new Uint8Array(len); let o=0; for(const a of arrays){ out.set(a,o); o+=a.length; } return out; }
function pngChunk(type, data){
  const tb=new Uint8Array([type.charCodeAt(0),type.charCodeAt(1),type.charCodeAt(2),type.charCodeAt(3)]);
  const body=concat([tb, data]);
  return concat([u32(data.length), body, u32(crc32(body))]);
}
async function deflate(bytes){
  const cs=new CompressionStream('deflate');           // zlib wrapper = PNG IDAT format
  const wr=cs.writable.getWriter(); wr.write(bytes); wr.close();
  return new Uint8Array(await new Response(cs.readable).arrayBuffer());
}
function paeth(a,b,c){ const p=a+b-c, pa=Math.abs(p-a), pb=Math.abs(p-b), pc=Math.abs(p-c);
  return (pa<=pb && pa<=pc) ? a : (pb<=pc) ? b : c; }
async function buildPngFrames(sources){
  if (!img) return;
  const myToken = ++pngToken;                            // supersede any older in-flight build
  const p=state.png, w=canvas.width, h=canvas.height, stride=w*4, bpp=4;
  psrc.width=w; psrc.height=h;

  const sig=new Uint8Array([137,80,78,71,13,10,26,10]);
  const ihdr=concat([u32(w),u32(h),new Uint8Array([8,6,0,0,0])]);   // 8-bit, RGBA
  const rawLen=h*(1+stride);
  const nFrames=Math.max(1,Math.round(p.frames));
  const out=[];
  for(let f=0;f<nFrames;f++){
    const clean=codecSourceAt(sources,f);
    pctx.clearRect(0,0,w,h); pctx.drawImage(clean,0,0,w,h);
    const px=pctx.getImageData(0,0,w,h).data;
    const R = makeRng(RNG_TAG.png + f*101);   // filter choice, band runs and hits all come off this stream
    const g=new Uint8Array(rawLen);
    // Encode scanlines using an explicit pattern. Small bands/per-row make controlled local faults;
    // Sweep confines the active predictor to a window that advances across the baked frame pool.
    // Sub=horizontal / Up=vertical / Average・Paeth=diagonal — corruption bleeds in mixed directions.
    const dir=p.dir|0, pattern=p.pattern|0, band=Math.max(1,p.band|0);
    const pickFilter=()=>dir===1?1:dir===2?2:dir===3?4:dir===4?3:dir===5?0:Math.floor(R()*5);
    let bandIndex=0;
    let y=0;
    while(y<h){
      let ft=pickFilter(), run=pattern===1?1:Math.min(band,1+Math.floor(R()*band));
      if(pattern===2){ run=Math.min(band,h-y); ft=(bandIndex++&1)?0:pickFilter(); }
      if(pattern===3){ run=1; const center=((f+.5)/nFrames)*h, half=band*.5; ft=Math.abs(y-center)<=half?pickFilter():0; }
      for(let r=0;r<run && y<h; r++,y++){
        const o=y*(1+stride), rb=y*stride, ab=(y-1)*stride;
        g[o]=ft;
        for(let i=0;i<stride;i++){
          const cur=px[rb+i];
          const a=i>=bpp?px[rb+i-bpp]:0;                          // left
          const b=y>0?px[ab+i]:0;                                 // up
          const c=(y>0&&i>=bpp)?px[ab+i-bpp]:0;                   // upper-left
          let v;
          switch(ft){ case 0:v=cur;break; case 1:v=cur-a;break; case 2:v=cur-b;break;
                      case 3:v=cur-((a+b)>>1);break; default:v=cur-paeth(a,b,c); }
          g[o+1+i]=v&255;
        }
      }
    }
    // corrupt filtered pixel data -> propagates along each band's filter direction.
    // amount/noise use a squared response + gentle coefficients: because each hit BLEEDS along
    // its filter direction, a few hits already streak a lot — so keep the low/mid range subtle.
    // per-direction gain: Sub(H)/Up(V) bleed only along a 1-D line, while Paeth/Average(diagonal)
    // and Mix cascade in 2-D — so boost the 1-D filters to keep impact comparable across dir.
    const dm = (dir===1||dir===2) ? 4 : 1, density=p.density==null?1:p.density;
    const amt=p.amount*p.amount, noi=p.noise*p.noise;
    const dhits=Math.floor(amt*rawLen*0.0004*dm*density);
    const [pixelStart,pixelLen]=damageWindow(h*stride,p.where,p.window,f,nFrames,R);
    const pixelPositions=damageOffsets(R,pixelLen,dhits,p.burst,p.spread).map(off=>{ const q=pixelStart+off, ry=Math.floor(q/stride), ri=q%stride; return ry*(1+stride)+1+ri; });
    mutatePositions(g,pixelPositions,R,p.mutation);
    // extra chaos: scramble filter bytes + heavier random noise
    const fhits=Math.floor(noi*h*0.08*density);
    const [rowStart,rowLen]=damageWindow(h,p.where,p.window,f,nFrames,R);
    for(const off of damageOffsets(R,rowLen,fhits,1,p.spread)) g[(rowStart+off)*(1+stride)]=Math.floor(R()*5);
    const nhits=Math.floor(noi*rawLen*0.001*dm*density);
    const [rawStart,rawSpan]=damageWindow(rawLen,p.where,p.window,f,nFrames,R);
    const noisePositions=damageOffsets(R,rawSpan,nhits,p.burst,p.spread).map(off=>rawStart+off);
    mutatePositions(g,noisePositions,R,p.mutation);
    // keep every scanline's filter byte a VALID type (0-4) — an out-of-range value makes the
    // whole PNG un-decodable (createImageBitmap rejects it), which is why glitching sometimes
    // produced no frames at all. The corruption still shows via changed (but valid) filter types.
    for(let yy=0;yy<h;yy++){ const fo=yy*(1+stride); if(g[fo]>4) g[fo]%=5; }

    const idat=await deflate(g);
    const png=concat([sig, pngChunk('IHDR',ihdr), pngChunk('IDAT',idat), pngChunk('IEND',new Uint8Array(0))]);
    try { const damaged=await createImageBitmap(new Blob([png],{type:'image/png'})); out.push(await codecMixedBitmap(clean,damaged,p.mix,w,h)); } catch(e){}
  }
  if(myToken!==pngToken){ closeCodecFrames(out); return null; }   // a newer build already ran — drop stale result
  return out;
}

// ---- real audio databend ----
// Treat the raw RGB bytes as an audio signal, run them through a genuine WebAudio graph (echo /
// reverb / bit-crush / filter) rendered offline, and read the processed samples back as pixels.
// Authentic sonification — the corruption is shaped by real DSP, not a hand-coded approximation.
async function buildAudioFrames(sources){
  if (!img || typeof OfflineAudioContext==='undefined'){ audioReady=false; return; }
  const au = state.audio, w = canvas.width, h = canvas.height, myToken = ++audioToken;
  asrc.width=w; asrc.height=h;
  const px = w*h, N = px*3;    // RGB samples (leave alpha opaque)
  const mode = au.mode|0, amt = au.amount, nFrames = Math.max(1, Math.round(au.frames)), SR = 44100;
  const out = [];
  for (let f=0; f<nFrames; f++){
    const clean=codecSourceAt(sources,f);
    actx.clearRect(0,0,w,h); actx.drawImage(clean,0,0,w,h);
    const sd=actx.getImageData(0,0,w,h).data, R=makeRng(RNG_TAG.audio+f*101);
    const octx = new OfflineAudioContext(1, N, SR);
    const inBuf = octx.createBuffer(1, N, SR), ch = inBuf.getChannelData(0);
    // Byte Layout changes the one-dimensional signal path without changing the source pixels.
    const layout=au.layout|0;
    const seqIndex=(p,c)=>{
      if(layout===1)return p*3+c;                         // packed RGB, row-major
      if(layout===2){const x=p%w,y=(p/w)|0;return (x*h+y)*3+c;} // packed RGB, column-major
      if(layout===3){const plane=c===1?0:c===2?1:2;return plane*px+p;} // G...B...R
      return c*px+p;                                     // planar R...G...B (legacy)
    };
    for (let p=0,i=0;p<px;p++,i+=4)for(let c=0;c<3;c++)ch[seqIndex(p,c)]=sd[i+c]/127.5-1;
    const source = octx.createBufferSource(); source.buffer = inBuf;
    // Bake the pool as an intensity RAMP (weak→strong). The renderer indexes it by the destruction
    // envelope (ENV) when Amount's ⓔ is on, or by a seamless triangle pulse otherwise — so the
    // effect breathes/animates without a live audio graph. t rides the ramp for extra drift.
    const t = nFrames>1 ? f/(nFrames-1) : 1;
    const a = amt*(0.12 + 0.88*t);
    const custom=(au.tune|0)===1, wet=au.wet==null?1:au.wet, delayCtl=au.delay==null?.45:au.delay, fbCtl=au.feedback==null?.55:au.feedback;
    const cutoffCtl=au.cutoff==null?.5:au.cutoff, resCtl=au.resonance==null?.45:au.resonance, driveCtl=au.drive==null?.5:au.drive;
    const drift = nFrames>1 ? t : 0;   // positional drift only — stays at 0 (no shift) when there's a single frame
    let node = source;
    if (mode===0){                                                  // echo — delayed copies smear down the scan
      const delay=octx.createDelay(1); delay.delayTime.value = custom ? .001+delayCtl*.045+t*.006 : .002+a*.02+t*.008;
      const fb=octx.createGain(); fb.gain.value = custom ? Math.min(.92,a*(.15+fbCtl*.75)) : a*.6; const mix=octx.createGain();
      source.connect(mix); source.connect(delay); delay.connect(fb); fb.connect(delay); delay.connect(mix); node=mix;
    } else if (mode===1){                                           // reverb — diffuse smear (noise impulse)
      const conv=octx.createConvolver(); const L=Math.max(1,Math.floor(SR*(0.04+a*0.18)));
      const ir=octx.createBuffer(1,L,SR), ird=ir.getChannelData(0);
      for (let i=0;i<L;i++) ird[i]=(R()*2-1)*Math.pow(1-i/L,2); conv.buffer=ir;
      const wet=octx.createGain(); wet.gain.value=a; const dry=octx.createGain(); dry.gain.value=1-a*0.4; const mix=octx.createGain();
      source.connect(dry); dry.connect(mix); source.connect(conv); conv.connect(wet); wet.connect(mix); node=mix;
    } else if (mode===2){                                           // bit-crush — quantise samples (posterise)
      const ws=octx.createWaveShaper(); const steps=custom?Math.max(2,Math.round(32-a*(8+driveCtl*22))):Math.max(2,Math.round(16-a*14));
      const curve=new Float32Array(1024); for (let i=0;i<1024;i++){ const x=i/511.5-1; curve[i]=Math.round(x*steps)/steps; }
      ws.curve=curve; source.connect(ws); node=ws;
    } else if (mode===3){                                           // low-pass sweep → smear
      const bq=octx.createBiquadFilter(); bq.type='lowpass'; bq.frequency.value=custom?120+Math.pow(cutoffCtl,2)*10000+(1-a)*2500+t*1200:200+(1-a)*8000+t*2500; bq.Q.value=custom?1+resCtl*18*a:1+a*8;
      source.connect(bq); node=bq;
    } else if (mode===4){                                           // high-pass → edge emphasis kept OVER the picture (no grey-out)
      const bq=octx.createBiquadFilter(); bq.type='highpass'; bq.frequency.value=custom?80+Math.pow(cutoffCtl,2)*9000*a+t*1200:200+a*7000+t*2000; bq.Q.value=custom?1+resCtl*18*a:1+a*8;
      const wet=octx.createGain(); wet.gain.value=0.6+a*0.8; const dry=octx.createGain(); dry.gain.value=1; const mix=octx.createGain();
      source.connect(dry); dry.connect(mix); source.connect(bq); bq.connect(wet); wet.connect(mix); node=mix;
    } else if (mode===5){                                           // band-pass → tinted band emphasised over the picture
      const bq=octx.createBiquadFilter(); bq.type='bandpass'; bq.frequency.value=custom?120+Math.pow(cutoffCtl,2)*10000+t*1800:300+a*5000+t*4000; bq.Q.value=custom?1+resCtl*24*a:2+a*14;
      const wet=octx.createGain(); wet.gain.value=0.5+a; const dry=octx.createGain(); dry.gain.value=0.7; const mix=octx.createGain();
      source.connect(dry); dry.connect(mix); source.connect(bq); bq.connect(wet); wet.connect(mix); node=mix;
    } else if (mode===6){                                           // comb — short delay + feedback → resonant colour ripples
      const delay=octx.createDelay(0.08); delay.delayTime.value=custom?.0004+delayCtl*.012+t*.001:.0006+a*.004+t*.0012;
      const fb=octx.createGain(); fb.gain.value=custom?Math.min(.92,.15+fbCtl*.72*a):.4+a*.45; const mix=octx.createGain();
      source.connect(mix); source.connect(delay); delay.connect(fb); fb.connect(delay); delay.connect(mix); node=mix;
    } else if (mode===7){                                           // distortion — waveshaper fuzz + per-frame drift so it visibly moves
      const pre=octx.createDelay(0.05); pre.delayTime.value=drift*0.007;
      const ws=octx.createWaveShaper(), k=(custom?10+a*(40+driveCtl*180):20+a*140)*(0.5+t), deg=Math.PI/180, curve=new Float32Array(1024);
      for (let i=0;i<1024;i++){ const x=i/511.5-1; curve[i]=(3+k)*x*20*deg/(Math.PI+k*Math.abs(x)); }
      ws.curve=curve; ws.oversample='2x'; source.connect(pre); pre.connect(ws); node=ws;
    } else if (mode===8){                                           // compressor — pumping; makeup restores level (no grey) + per-frame drift
      const pre=octx.createDelay(0.05); pre.delayTime.value=drift*0.007;
      const comp=octx.createDynamicsCompressor();
      comp.threshold.value=custom?-6-a*(20+driveCtl*30)+t*18:-6-a*44+t*24; comp.ratio.value=custom?2+a*(6+driveCtl*16):2+a*18; comp.knee.value=6; comp.attack.value=0.003; comp.release.value=0.05;
      const makeup=octx.createGain(); makeup.gain.value=1+a*1.6;
      source.connect(pre); pre.connect(comp); comp.connect(makeup); node=makeup;
    } else {                                                        // chorus / flanger — LFO-modulated delay → wavy colour shimmer
      const delay=octx.createDelay(0.05); delay.delayTime.value=custom?.003+a*(.004+(au.depth==null?.5:au.depth)*.014):.004+a*.012;
      const lfo=octx.createOscillator(); lfo.frequency.value=custom?.15+(au.rate==null?.4:au.rate)*7+t*1.5:.5+t*4+a*3;
      const lg=octx.createGain(); lg.gain.value=custom?.001+(au.depth==null?.5:au.depth)*.014*a:.002+a*.01; lfo.connect(lg); lg.connect(delay.delayTime); lfo.start();
      const wet=octx.createGain(); wet.gain.value=0.7; const dry=octx.createGain(); dry.gain.value=0.7; const mix=octx.createGain();
      source.connect(dry); dry.connect(mix); source.connect(delay); delay.connect(wet); wet.connect(mix); node=mix;
    }
    node.connect(octx.destination); source.start();
    const rc = (await octx.startRendering()).getChannelData(0);
    const od = new ImageData(w,h), o = od.data;
    for (let p=0,i=0;p<px;p++,i+=4){
      for(let c=0;c<3;c++){const raw=ch[seqIndex(p,c)]*(1-wet)+rc[seqIndex(p,c)]*wet;o[i+c]=Math.max(0,Math.min(255,(raw+1)*127.5));}
      o[i+3]=255;
    }
    try { const damaged=await createImageBitmap(od); out.push(await codecMixedBitmap(clean,damaged,au.mix,w,h)); } catch(e){}
  }
  if (myToken!==audioToken){ closeCodecFrames(out); return null; }
  return out;
}

// ---- real-codec pipeline ----
// Each enabled stage receives the frame pool produced by the previous stage. Frame indices map by
// modulo instead of forming every combination, so stack cost grows roughly with the sum of Frames,
// not their product. Output Mix is already baked into every stage before it becomes the next input.
async function buildCodecPipeline(token){
  if(!img || token!==codecPipelineToken)return;
  let sources=[img];
  const replace=(oldFrames,next,set)=>{ closeCodecFrames(oldFrames); set(next||[]); };
  const stages=[
    ['jpeg',buildJpegFrames,()=>jpegFrames,v=>{jpegFrames=v;jpegReady=v.length>0;}],
    ['png',buildPngFrames,()=>pngFrames,v=>{pngFrames=v;pngReady=v.length>0;}],
    ['webp',buildWebpFrames,()=>webpFrames,v=>{webpFrames=v;webpReady=v.length>0;}],
    ['gifg',buildGifgFrames,()=>gifgFrames,v=>{gifgFrames=v;gifgReady=v.length>0;}],
    ['audio',buildAudioFrames,()=>audioFrames,v=>{audioFrames=v;audioReady=v.length>0;}],
  ];
  for(const [id,build,get,set] of stages){
    if(token!==codecPipelineToken)return;
    if(!state[id].on){ replace(get(),[],set); continue; }
    const frames=await build(sources);
    if(token!==codecPipelineToken){ closeCodecFrames(frames); return; }
    replace(get(),frames||[],set);
    if(frames && frames.length)sources=frames;
  }
}
function scheduleCodecPipeline(){
  const token=++codecPipelineToken;
  clearTimeout(codecPipelineTimer);
  codecPipelineTimer=setTimeout(()=>buildCodecPipeline(token).catch(()=>{}),140);
}
// Keep the existing call sites small; changing any baked codec can affect every downstream stage.
function scheduleJpeg(){ scheduleCodecPipeline(); }
function schedulePng(){ scheduleCodecPipeline(); }
function scheduleWebp(){ scheduleCodecPipeline(); }
function scheduleGifg(){ scheduleCodecPipeline(); }
function scheduleAudio(){ scheduleCodecPipeline(); }
