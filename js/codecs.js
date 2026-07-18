// ---- real JPEG databending ----
// re-encode the current image as JPEG and corrupt real bytes, then decode the wreckage. The Target
// picks which structure gets damaged, each a completely different genuine artifact:
//   Entropy — bytes after the SOS marker → local DCT-block melt (leaves headers/EOI intact).
//   Quant table (DQT) — every block dequantises wrong → global tone/colour ramps.
//   Huffman table (DHT) — the symbol stream desyncs from the first hit → violent collapse.
// A pool of frames is cycled so the glitch animates seamlessly.
function jpegTargetRanges(buf, target){
  if (target===0){                                   // entropy: after SOS → before EOI
    let start=2; for (let i=2;i<buf.length-3;i++){ if (buf[i]===0xFF && buf[i+1]===0xDA){ start=i+2+((buf[i+2]<<8)|buf[i+3]); break; } }
    return { ranges:[[start, buf.length-2]], safe:true };  // safe = avoid faking a marker (0xFF)
  }
  const want = target===1 ? 0xDB : 0xC4;             // DQT / DHT marker
  const ranges=[]; let i=2;
  while (i<buf.length-4){
    if (buf[i]!==0xFF){ i++; continue; }
    const m=buf[i+1];
    if (m===0xDA || m===0xD9) break;                 // reached scan / end
    if (m===0x01 || (m>=0xD0 && m<=0xD7)){ i+=2; continue; }   // standalone markers (no length)
    const len=(buf[i+2]<<8)|buf[i+3];
    if (m===want && len>2) ranges.push([i+4, i+2+len]);        // the table data (skip marker + length)
    i+=2+len;
  }
  return { ranges, safe:false };                     // table data is length-delimited → any byte is fine
}
async function buildJpegFrames(){
  if (!img) return;
  const j = state.jpeg, w = canvas.width, h = canvas.height;
  jsrc.width = w; jsrc.height = h;
  jctx.clearRect(0,0,w,h);
  jctx.drawImage(img, 0, 0, w, h);
  const blob = await new Promise(r=> jsrc.toBlob(r, 'image/jpeg', j.quality));
  const buf = new Uint8Array(await blob.arrayBuffer());

  const target = j.target|0;
  const { ranges, safe } = jpegTargetRanges(buf, target);
  if (!ranges.length){ jpegReady=false; if (state.png.on) schedulePng(); return; }   // no such segment → nothing to glitch
  const total = ranges.reduce((a,r)=>a+(r[1]-r[0]),0);
  const maxHits = target===2 ? 4 : target===1 ? 10 : 40;   // tables desync hard → far fewer hits
  const nFrames = Math.max(1, Math.round(j.frames));
  const out = [];
  for (let f=0; f<nFrames; f++){
    const R = makeRng(RNG_TAG.jpeg + f*101);        // per-frame stream: frames differ, but deterministically
    const copy = buf.slice();
    const hits = 1 + Math.floor(j.amount * maxHits);
    for (let k=0;k<hits;k++){
      let pos = Math.floor(R()*total);              // pick a byte across the target ranges
      for (const r of ranges){ const n=r[1]-r[0]; if (pos<n){ pos=r[0]+pos; break; } pos-=n; }
      if (safe && (copy[pos]===0xFF || copy[pos-1]===0xFF)) continue;   // entropy: don't fake a marker
      const v = Math.floor(R()*255);
      copy[pos] = (safe && v===0xFF) ? 0xFE : v;
    }
    try { out.push(await createImageBitmap(new Blob([copy], {type:'image/jpeg'}))); }
    catch(e){ /* some corruptions are undecodable — just drop that frame */ }
  }
  if (out.length){ jpegFrames = out; jpegReady = true; }
  else { jpegReady = false; }
  if (state.png.on) schedulePng();   // restack PNG glitch on the fresh JPEG result
}
function scheduleJpeg(){
  jpegReady = false;
  clearTimeout(jpegTimer);
  jpegTimer = setTimeout(()=> buildJpegFrames().catch(()=>{}), 120);  // debounce
}

// ---- real WebP databending ----
// re-encode as low-quality WebP and corrupt bytes in the VP8 payload (past the RIFF/VP8 headers).
// VP8's arithmetic decoder is fragile, so corruptions are few & undecodable frames are dropped.
async function buildWebpFrames(){
  if (!img) return;
  const myToken = ++webpToken;
  const wp = state.webp, w = canvas.width, h = canvas.height;
  wsrc.width = w; wsrc.height = h; wctx.clearRect(0,0,w,h); wctx.drawImage(img,0,0,w,h);
  const blob = await new Promise(r=> wsrc.toBlob(r, 'image/webp', wp.quality/100));
  if (!blob || !/webp/.test(blob.type)) { webpReady=false; return; }   // browser can't encode WebP
  const buf = new Uint8Array(await blob.arrayBuffer());
  const start = Math.min(buf.length-1, 40);          // skip RIFF + VP8 chunk headers
  const span = Math.max(1, buf.length - 2 - start);
  const nFrames = Math.max(1, Math.round(wp.frames));
  const out = [];
  for (let f=0; f<nFrames; f++){
    const R = makeRng(RNG_TAG.webp + f*101);
    const copy = buf.slice();
    const hits = 1 + Math.floor(wp.amount * 12);      // keep it low — VP8 desyncs easily
    for (let k=0;k<hits;k++){ const pos = start + Math.floor(R()*span); copy[pos] = Math.floor(R()*256); }
    try { out.push(await createImageBitmap(new Blob([copy], {type:'image/webp'}))); } catch(e){}
  }
  if (myToken!==webpToken) return;
  if (out.length){ webpFrames=out; webpReady=true; } else webpReady=false;
}
function scheduleWebp(){
  webpReady=false; clearTimeout(webpTimer);
  webpTimer=setTimeout(()=> buildWebpFrames().catch(()=>{}), 120);
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

// GIF Databend: corrupt the real GIF file bytes — the colour table (garish colours) and the LZW
// image data (tears the picture). A single pass can only break as much as the browser still decodes,
// so higher Data ITERATES: re-encode the decoded (already-glitched) result and corrupt again. Each
// pass stays within the decode limit but the damage accumulates past the single-pass ceiling.
async function buildGifgFrames(){
  if (!img) return;
  const myToken=++gifgToken; const gg=state.gifg;
  // Decoders behave OPPOSITELY: tolerant ones (Chrome/FF) heal most corruption, strict ones (iOS Safari)
  // wipe everything below the first corrupted code. So keep it gentle and bias hits LATE (the corruption
  // point stays low in the frame → the top of the picture survives on strict decoders too).
  const passes = 1 + Math.round(gg.data*3);                    // 1–4 gentle iterative passes
  const nFrames=Math.max(1, Math.round(gg.frames)), out=[];
  const corrupt = (enc, R)=>{
    const { base, ctStart, ctLen, lzwPos } = enc;
    const lateStart=Math.floor(lzwPos.length*(0.85 - gg.data*0.4));  // Data 0 → last 15%, Data 1 → last 55%
    const palHits=Math.round(gg.palette*ctLen*0.12);           // light per pass → accumulates over passes
    let lz=Math.max(1, Math.round(1 + gg.data*8));             // few hits per pass (stays decodable)
    return async ()=>{                                          // per-pass back-off (falls to palette-only)
      for (let t=0;t<4;t++){
        const copy=base.slice();
        for (let k=0;k<palHits;k++) copy[ctStart+Math.floor(R()*ctLen)]=Math.floor(R()*256);
        if (lz>0 && lzwPos.length>lateStart) for (let k=0;k<lz;k++){ const pos=lzwPos[lateStart+Math.floor(R()*(lzwPos.length-lateStart))]; copy[pos]=Math.floor(R()*256); }
        const bmp=await gifDecode(copy); if (bmp) return bmp;
        lz=Math.floor(lz/2);                                    // t=... eventually lz=0 → palette-only, always decodes
      }
      return null;
    };
  };
  const makeFrame = async (f)=>{
    const R = makeRng(RNG_TAG.gifg + f*101);                     // one stream per frame, shared across its passes
    let cur=img, result=null;
    for (let p=0; p<passes; p++){
      const bmp=await corrupt(gifEncodeBase(cur,64), R)();        // re-encode previous result, corrupt, decode
      if (bmp){ result=bmp; cur=bmp; }                           // success → accumulate; fail → skip, keep going
    }
    return result || await gifDecode(gifEncodeBase(img,64).base.slice());   // fallback: clean re-encode
  };
  for (let f=0; f<nFrames; f++){ const b=await makeFrame(f); if(b) out.push(b); }
  if (myToken!==gifgToken) return;
  if (out.length){ gifgFrames=out; gifgReady=true; } else gifgReady=false;
}
function scheduleGifg(){ gifgReady=false; clearTimeout(gifgTimer); gifgTimer=setTimeout(()=> buildGifgFrames().catch(()=>{}), 120); }

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
async function buildPngFrames(){
  if (!img) return;
  const myToken = ++pngToken;                            // supersede any older in-flight build
  const p=state.png, w=canvas.width, h=canvas.height, stride=w*4, bpp=4;
  // if JPEG databend is also on, glitch its output -> both effects stack (orig→JPEG→PNG)
  const srcImg = (state.jpeg.on && jpegReady && jpegFrames.length) ? jpegFrames[0] : img;
  psrc.width=w; psrc.height=h; pctx.clearRect(0,0,w,h); pctx.drawImage(srcImg,0,0,w,h);
  const px=pctx.getImageData(0,0,w,h).data;

  const sig=new Uint8Array([137,80,78,71,13,10,26,10]);
  const ihdr=concat([u32(w),u32(h),new Uint8Array([8,6,0,0,0])]);   // 8-bit, RGBA
  const rawLen=h*(1+stride);
  const nFrames=Math.max(1,Math.round(p.frames));
  const out=[];
  for(let f=0;f<nFrames;f++){
    const R = makeRng(RNG_TAG.png + f*101);   // filter choice, band runs and hits all come off this stream
    const g=new Uint8Array(rawLen);
    // encode scanlines with a filter chosen per horizontal band (run of rows).
    // Sub=horizontal / Up=vertical / Average・Paeth=diagonal — corruption bleeds in mixed directions.
    const dir=p.dir|0;   // 0=mix 1=horizontal(Sub) 2=vertical(Up) 3=diagonal(Paeth/Avg)
    let y=0;
    while(y<h){
      const ft = dir===1 ? (R()<0.85?1:0)
               : dir===2 ? (R()<0.85?2:0)
               : dir===3 ? (R()<0.5?4:3)
               :           Math.floor(R()*5);
      const run=4+Math.floor(R()*Math.max(1,h*0.25));
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
    const dm = (dir===1||dir===2) ? 4 : 1;
    const amt=p.amount*p.amount, noi=p.noise*p.noise;
    const dhits=Math.floor(amt*rawLen*0.0004*dm);
    for(let k=0;k<dhits;k++){
      const ry=Math.floor(R()*h), ri=Math.floor(R()*stride);
      g[ry*(1+stride)+1+ri]=Math.floor(R()*256);
    }
    // extra chaos: scramble filter bytes + heavier random noise
    const fhits=Math.floor(noi*h*0.08);
    for(let k=0;k<fhits;k++) g[Math.floor(R()*h)*(1+stride)]=Math.floor(R()*5);
    const nhits=Math.floor(noi*rawLen*0.001*dm);
    for(let k=0;k<nhits;k++) g[Math.floor(R()*rawLen)]=Math.floor(R()*256);
    // keep every scanline's filter byte a VALID type (0-4) — an out-of-range value makes the
    // whole PNG un-decodable (createImageBitmap rejects it), which is why glitching sometimes
    // produced no frames at all. The corruption still shows via changed (but valid) filter types.
    for(let yy=0;yy<h;yy++){ const fo=yy*(1+stride); if(g[fo]>4) g[fo]%=5; }

    const idat=await deflate(g);
    const png=concat([sig, pngChunk('IHDR',ihdr), pngChunk('IDAT',idat), pngChunk('IEND',new Uint8Array(0))]);
    try { out.push(await createImageBitmap(new Blob([png],{type:'image/png'}))); } catch(e){}
  }
  if(myToken!==pngToken) return;                         // a newer build already ran — drop stale result
  if(out.length){ pngFrames=out; pngReady=true; } else pngReady=false;
}
function schedulePng(){
  pngReady=false; clearTimeout(pngTimer);
  pngTimer=setTimeout(()=> buildPngFrames().catch(()=>{}), 120);
}

// ---- real audio databend ----
// Treat the raw RGB bytes as an audio signal, run them through a genuine WebAudio graph (echo /
// reverb / bit-crush / filter) rendered offline, and read the processed samples back as pixels.
// Authentic sonification — the corruption is shaped by real DSP, not a hand-coded approximation.
async function buildAudioFrames(){
  if (!img || typeof OfflineAudioContext==='undefined'){ audioReady=false; return; }
  const au = state.audio, w = canvas.width, h = canvas.height, myToken = ++audioToken;
  asrc.width=w; asrc.height=h; actx.clearRect(0,0,w,h); actx.drawImage(img,0,0,w,h);
  const sd = actx.getImageData(0,0,w,h).data, px = w*h, N = px*3;    // RGB samples (leave alpha opaque)
  const mode = au.mode|0, amt = au.amount, nFrames = Math.max(1, Math.round(au.frames)), SR = 44100;
  const out = [];
  for (let f=0; f<nFrames; f++){
    const octx = new OfflineAudioContext(1, N, SR);
    const inBuf = octx.createBuffer(1, N, SR), ch = inBuf.getChannelData(0);
    // planar layout — all R, then all G, then all B — so a filter/echo smears within a channel
    // (horizontal streaks) and keeps colour, instead of blending R/G/B into grey.
    for (let p=0,i=0;p<px;p++,i+=4){ ch[p]=sd[i]/127.5-1; ch[px+p]=sd[i+1]/127.5-1; ch[2*px+p]=sd[i+2]/127.5-1; }
    const source = octx.createBufferSource(); source.buffer = inBuf;
    const t = nFrames>1 ? f/nFrames : 0;                            // per-frame drift → the pool animates
    let node = source;
    if (mode===0){                                                  // echo — delayed copies smear down the scan
      const delay=octx.createDelay(1); delay.delayTime.value = 0.002 + amt*0.02 + t*0.008;
      const fb=octx.createGain(); fb.gain.value = amt*0.6; const mix=octx.createGain();
      source.connect(mix); source.connect(delay); delay.connect(fb); fb.connect(delay); delay.connect(mix); node=mix;
    } else if (mode===1){                                           // reverb — diffuse smear (noise impulse)
      const conv=octx.createConvolver(); const L=Math.max(1,Math.floor(SR*(0.04+amt*0.18)));
      const ir=octx.createBuffer(1,L,SR), ird=ir.getChannelData(0);
      for (let i=0;i<L;i++) ird[i]=(Math.random()*2-1)*Math.pow(1-i/L,2); conv.buffer=ir;
      const wet=octx.createGain(); wet.gain.value=amt; const dry=octx.createGain(); dry.gain.value=1-amt*0.4; const mix=octx.createGain();
      source.connect(dry); dry.connect(mix); source.connect(conv); conv.connect(wet); wet.connect(mix); node=mix;
    } else if (mode===2){                                           // bit-crush — quantise samples (posterise)
      const ws=octx.createWaveShaper(); const steps=Math.max(2,Math.round(16-amt*14));   // 4-bit → 1-bit, visible across the slider
      const curve=new Float32Array(1024); for (let i=0;i<1024;i++){ const x=i/511.5-1; curve[i]=Math.round(x*steps)/steps; }
      ws.curve=curve; source.connect(ws); node=ws;
    } else {                                                        // filter sweep — soften / edge the byte stream
      const bq=octx.createBiquadFilter(); bq.type='lowpass'; bq.frequency.value=200+(1-amt)*8000+t*2500; bq.Q.value=1+amt*8;
      source.connect(bq); node=bq;
    }
    node.connect(octx.destination); source.start();
    const rc = (await octx.startRendering()).getChannelData(0);
    const od = new ImageData(w,h), o = od.data;
    for (let p=0,i=0;p<px;p++,i+=4){
      o[i]  =Math.max(0,Math.min(255,(rc[p]+1)*127.5));
      o[i+1]=Math.max(0,Math.min(255,(rc[px+p]+1)*127.5));
      o[i+2]=Math.max(0,Math.min(255,(rc[2*px+p]+1)*127.5));
      o[i+3]=255;
    }
    try { out.push(await createImageBitmap(od)); } catch(e){}
  }
  if (myToken!==audioToken) return;
  if (out.length){ audioFrames=out; audioReady=true; } else audioReady=false;
}
function scheduleAudio(){
  audioReady=false; clearTimeout(audioTimer);
  audioTimer=setTimeout(()=> buildAudioFrames().catch(()=>{ audioReady=false; }), 140);
}
