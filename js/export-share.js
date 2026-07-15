// ---------- frame capture (deterministic single loop) ----------
function u16(n){ return new Uint8Array([(n>>8)&255, n&255]); }
function download(blob, name){
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 15000);
  return url;
}
function captureFrames(N){
  const wasPlaying=playing; playing=false;          // take over rAF
  const w=canvas.width, h=canvas.height, frames=[];
  for(let f=0; f<N; f++){ draw(f/N); frames.push(ctx.getImageData(0,0,w,h)); }
  playing=wasPlaying; startT=performance.now();
  return frames;
}
const EXPORT_FPS = 20;                                // for APNG/GIF
const EXPORT_N = Math.max(2, Math.round(LOOP_MS/1000*EXPORT_FPS));

// ---------- APNG export (native, reuses PNG helpers, loops infinitely) ----------
async function exportAPNG(){
  setStatus('Generating APNG…');
  const frames=captureFrames(EXPORT_N), w=canvas.width, h=canvas.height, stride=w*4;
  const sig=new Uint8Array([137,80,78,71,13,10,26,10]);
  const ihdr=concat([u32(w),u32(h),new Uint8Array([8,6,0,0,0])]);
  const delayNum=Math.round(LOOP_MS/EXPORT_N), delayDen=1000;
  const chunks=[sig, pngChunk('IHDR',ihdr), pngChunk('acTL', concat([u32(EXPORT_N),u32(0)]))];  // num_plays=0 → infinite
  let seq=0;
  for(let f=0; f<EXPORT_N; f++){
    const px=frames[f].data, raw=new Uint8Array(h*(1+stride));
    for(let y=0;y<h;y++){ const o=y*(1+stride); raw[o]=0; raw.set(px.subarray(y*stride,(y+1)*stride), o+1); }
    const idat=await deflate(raw);
    const fctl=concat([u32(seq++), u32(w),u32(h), u32(0),u32(0), u16(delayNum),u16(delayDen), new Uint8Array([0,0])]);
    chunks.push(pngChunk('fcTL', fctl));
    chunks.push(f===0 ? pngChunk('IDAT', idat) : pngChunk('fdAT', concat([u32(seq++), idat])));
  }
  chunks.push(pngChunk('IEND', new Uint8Array(0)));
  const blob=new Blob([concat(chunks)], {type:'image/png'});
  download(blob, 'loop.png');
  setStatus(`✔ APNG done (${(blob.size/1048576).toFixed(1)}MB) — saved loop.png`);
}

// ---------- GIF export (median-cut palette + LZW, animated + looping) ----------
function medianCut(colors, maxColors){
  let boxes=[colors];
  while(boxes.length<maxColors){
    let bi=-1, best=-1, bestCh=0;
    for(let i=0;i<boxes.length;i++){
      const bx=boxes[i]; if(bx.length<2) continue;
      const lo=[255,255,255], hi=[0,0,0];
      for(const c of bx) for(let ch=0;ch<3;ch++){ if(c[ch]<lo[ch])lo[ch]=c[ch]; if(c[ch]>hi[ch])hi[ch]=c[ch]; }
      for(let ch=0;ch<3;ch++){ const r=hi[ch]-lo[ch]; if(r>best){best=r;bi=i;bestCh=ch;} }
    }
    if(bi<0) break;
    const bx=boxes[bi]; bx.sort((p,q)=>p[bestCh]-q[bestCh]);
    const mid=bx.length>>1;
    boxes.splice(bi,1,bx.slice(0,mid),bx.slice(mid));
  }
  return boxes.map(bx=>{ let r=0,g=0,b=0; for(const c of bx){r+=c[0];g+=c[1];b+=c[2];}
    const n=bx.length||1; return [Math.round(r/n),Math.round(g/n),Math.round(b/n)]; });
}
function makeMapper(pal){
  const cache=new Map();
  return (r,g,b)=>{
    const key=((r>>2)<<12)|((g>>2)<<6)|(b>>2);
    let idx=cache.get(key); if(idx!==undefined) return idx;
    let bi=0, bd=1e9;
    for(let i=0;i<pal.length;i++){ const p=pal[i], dr=r-p[0],dg=g-p[1],db=b-p[2], d=dr*dr+dg*dg+db*db; if(d<bd){bd=d;bi=i;} }
    cache.set(key,bi); return bi;
  };
}
// LZW (omggif algorithm: codes are ints, singleton code == its index)
function gifLZW(indices, minCodeSize){
  const clearCode=1<<minCodeSize, eoiCode=clearCode+1, codeMask=clearCode-1;
  let codeSize=minCodeSize+1, next=eoiCode+1, cur=0, shift=0, table={};
  const out=[];
  const emit=(c)=>{ cur|=c<<shift; shift+=codeSize; while(shift>=8){ out.push(cur&0xFF); cur>>=8; shift-=8; } };
  emit(clearCode);
  let buf=indices[0]&codeMask;
  for(let i=1;i<indices.length;i++){
    const k=indices[i]&codeMask, key=(buf<<8)|k, code=table[key];
    if(code!==undefined){ buf=code; }
    else{
      emit(buf);
      if(next===4096){ emit(clearCode); next=eoiCode+1; codeSize=minCodeSize+1; table={}; }
      else{ if(next>=(1<<codeSize)) codeSize++; table[key]=next++; }
      buf=k;
    }
  }
  emit(buf); emit(eoiCode);
  if(shift>0) out.push(cur&0xFF);
  return out;
}
function packSubBlocks(bytes){
  const out=[];
  for(let i=0;i<bytes.length;i+=255){ const end=Math.min(i+255,bytes.length); out.push(end-i); for(let j=i;j<end;j++) out.push(bytes[j]); }
  out.push(0);
  return out;
}
async function exportGIF(){
  setStatus('Building GIF palette…');
  await new Promise(r=>setTimeout(r,0));
  const frames=captureFrames(EXPORT_N), w=canvas.width, h=canvas.height;
  // sample colours across all frames for a shared palette
  const sample=[];
  for(const fr of frames){ const d=fr.data; for(let i=0;i<d.length;i+=4*7) sample.push([d[i],d[i+1],d[i+2]]); }
  let pal=medianCut(sample,256); while(pal.length<256) pal.push([0,0,0]);
  const map=makeMapper(pal);
  const bytes=[]; const put=(...a)=>{ for(const x of a) bytes.push(x&0xFF); };
  const puts=(s)=>{ for(const ch of s) bytes.push(ch.charCodeAt(0)); };
  puts('GIF89a'); put(w&255,(w>>8)&255, h&255,(h>>8)&255, 0xF7, 0, 0);   // 256-colour global table
  for(const p of pal) put(p[0],p[1],p[2]);
  put(0x21,0xFF,0x0B); puts('NETSCAPE2.0'); put(0x03,0x01,0x00,0x00,0x00); // loop forever
  const delayCs=Math.max(2, Math.round(LOOP_MS/EXPORT_N/10));
  for(let f=0; f<EXPORT_N; f++){
    put(0x21,0xF9,0x04, 0x00, delayCs&255,(delayCs>>8)&255, 0x00, 0x00);   // graphic control
    put(0x2C, 0,0,0,0, w&255,(w>>8)&255, h&255,(h>>8)&255, 0x00);          // image descriptor
    const d=frames[f].data, idx=new Uint8Array(w*h);
    for(let i=0,pi=0;i<d.length;i+=4,pi++) idx[pi]=map(d[i],d[i+1],d[i+2]);
    put(8);                                                                // LZW min code size
    for(const b of packSubBlocks(gifLZW(idx,8))) bytes.push(b);
    setStatus(`Encoding GIF… ${f+1}/${EXPORT_N}`);
    await new Promise(r=>setTimeout(r));                                    // yield so UI/status updates
  }
  put(0x3B);
  const blob=new Blob([new Uint8Array(bytes)], {type:'image/gif'});
  download(blob, 'loop.gif');
  setStatus(`✔ GIF done (${(blob.size/1048576).toFixed(1)}MB, 256 colors) — saved loop.gif`);
}

// about / privacy modal
const aboutModal = document.getElementById('aboutModal');
document.getElementById('aboutBtn').onclick = ()=> aboutModal.classList.add('open');
document.getElementById('aboutClose').onclick = ()=> aboutModal.classList.remove('open');
aboutModal.onclick = e=>{ if (e.target===aboutModal) aboutModal.classList.remove('open'); };

// hidden shortcuts: R = auto-reroll, G = GIF, P = APNG (WebM is the Rec fallback)
window.addEventListener('keydown', e=>{
  if (e.key==='Escape'){ closeAllPops(); aboutModal.classList.remove('open');
    document.body.classList.remove('zen'); if (document.fullscreenElement) document.exitFullscreen?.(); return; }
  if (aboutModal.classList.contains('open')) return;
  const tag=e.target.tagName;
  if (tag==='INPUT'||tag==='SELECT'||tag==='TEXTAREA'||e.metaKey||e.ctrlKey||e.altKey) return;
  const k=e.key.toLowerCase();
  if (k==='r'){ toggleAuto(); return; }             // these work with or without an image
  if (k==='d'){ toggleDrift(); return; }
  if (k==='f'){ toggleZen(); return; }
  if (!img) return;
  if (k==='g') exportGIF().catch(err=>setStatus('GIF failed: '+err.message));
  else if (k==='p') exportAPNG().catch(err=>setStatus('APNG failed: '+err.message));
});

// ---------- recording (one seamless loop) → returns a video Blob ----------
recBtn.onclick = ()=>{
  if (!img){ setStatus('Load an image first'); return; }
  recBtn.disabled = true;
  recordLoopBlob().then(({blob,ext})=>{
    recBtn.disabled = false; recBtn.textContent = '⏺ Rec';
    const file = new File([blob], `glitch-loop.${ext}`, { type: blob.type });
    const coarse = matchMedia('(pointer:coarse)').matches;      // phone/tablet
    // mobile: navigator.share() needs a FRESH tap (recording used up the original one),
    // so show a button — tapping it opens the share sheet within a valid user gesture.
    if (coarse && navigator.canShare && navigator.canShare({ files:[file] })){
      setStatus(`✔ Ready (${(blob.size/1048576).toFixed(1)}MB) — <button id="doShare" class="rec">📤 Save / Share</button>`);
      document.getElementById('doShare').onclick = async ()=>{
        try { await navigator.share({ files:[file] }); setStatus('Saved / shared 🎉'); }
        catch(e){ if (e.name!=='AbortError') downloadRec(blob,ext); }
      };
    } else {
      downloadRec(blob,ext);   // desktop: plain download link
    }
  });
};
function downloadRec(blob, ext){
  const url = URL.createObjectURL(blob);
  setStatus(`✔ Done (${(blob.size/1048576).toFixed(1)}MB) — <a class="dl" href="${url}" download="loop.${ext}">download loop.${ext}</a>`);
}
function recordLoopBlob(){
  return new Promise(resolve=>{
    const fps = 30;
    const stream = canvas.captureStream(fps);
    const types = ['video/mp4;codecs=avc1.42E01E','video/mp4;codecs=avc1','video/mp4;codecs=h264','video/mp4',
                   'video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'];
    const mime = types.find(t=> MediaRecorder.isTypeSupported(t)) || 'video/webm';
    const ext = mime.startsWith('video/mp4') ? 'mp4' : 'webm';
    const rec = new MediaRecorder(stream, { mimeType:mime, videoBitsPerSecond: 8_000_000 });
    const chunks = [];
    rec.ondataavailable = e=>{ if (e.data.size) chunks.push(e.data); };
    const wasPlaying = playing;
    rec.onstop = ()=>{ playing = wasPlaying; startT = performance.now(); resolve({ blob:new Blob(chunks,{type:mime}), ext }); };
    // drive rendering deterministically across exactly one loop
    playing = false;
    const totalFrames = Math.round(LOOP_MS/1000*fps);
    let f = 0;
    rec.start();
    const tick = ()=>{
      draw(f/totalFrames);
      setStatus(`⏺ Recording… ${f}/${totalFrames}`);
      f++;
      if (f <= totalFrames){ setTimeout(tick, 1000/fps); }
      else rec.stop();
    };
    tick();
  });
}

// ---------- shareable state in the URL (restores the exact look) ----------
function encodeState(){
  const o={};
  FX.forEach(f=>{ if(!state[f.id].on) return; const e={};
    f.params.forEach(p=>{ e[p.k]=state[f.id][p.k]; if(p.env && state[f.id][p.k+'_env']) e[p.k+'_env']=1; });
    o[f.id]=e;
  });
  return btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function applyState(str){
  let o; try{
    let b=str.replace(/-/g,'+').replace(/_/g,'/'); b+='==='.slice((b.length+3)%4);
    o=JSON.parse(decodeURIComponent(escape(atob(b))));
  }catch(e){ return false; }
  FX.forEach(f=>{ state[f.id].on=false; });
  Object.keys(o).forEach(id=>{ if(!state[id]) return; state[id].on=true;
    const e=o[id]; Object.keys(e).forEach(k=>{
      if(k.endsWith('_env')) state[id][k]=!!e[k];
      else if(state[id][k]!==undefined) state[id][k]=e[k];
    });
  });
  syncUI();
  return true;
}
function shareURL(){ return location.origin+location.pathname+'#s='+encodeState(); }

linkBtn.onclick = async ()=>{
  const url=shareURL();
  try { await navigator.clipboard.writeText(url); setStatus('🔗 Link copied — opens with these exact settings'); }
  catch(e){ prompt('Copy this link:', url); }
};

// ---------- share to X / Twitter: still image + params-encoded link ----------
shareBtn.onclick = ()=>{
  if (!img){ setStatus('Load an image first'); return; }
  shareBtn.disabled = true;
  shareToX().finally(()=>{ shareBtn.disabled = false; });
};
async function shareToX(){
  const url = shareURL(), text = 'made with GLITCH LOOPER ↺';
  const blob = await new Promise(r=> canvas.toBlob(r, 'image/png'));
  const file = new File([blob], 'glitch.png', { type:'image/png' });
  const intent = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
  // 1) mobile / supported desktop: OS share sheet with the image already attached
  if (navigator.canShare && navigator.canShare({ files:[file] })){
    try { await navigator.share({ files:[file], text, url }); setStatus('Shared 🎉'); return; }
    catch(e){ if (e.name==='AbortError'){ setStatus('Share cancelled'); return; } }
  }
  // 2) desktop: copy the still to the clipboard, open the composer → just paste (⌘/Ctrl+V)
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    window.open(intent, '_blank', 'noopener');
    setStatus('📋 Image copied — paste (⌘/Ctrl+V) into the X post that just opened');
    return;
  } catch(e){ /* clipboard image not supported → fall through to download */ }
  // 3) last resort: download the still + open the composer for manual attach
  const dl=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=dl; a.download='glitch.png'; a.click();
  setTimeout(()=>URL.revokeObjectURL(dl), 15000);
  window.open(intent, '_blank', 'noopener');
  setStatus('Image downloaded — attach it to the X post (the link restores the exact look)');
}
