// ---------- shareable state in the URL (restores the exact look) ----------
function encodeState(){
  const o={ _meta:{ seed:randomSeed, seedLocked:seedLocked?1:0, locks:FX.filter(f=>state[f.id]._locked).map(f=>f.id) } };
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
  const meta=o._meta||{};
  if (Number.isFinite(meta.seed)) randomSeed=meta.seed;
  seedLocked=!!meta.seedLocked;
  FX.forEach(f=>{ state[f.id]._locked=Array.isArray(meta.locks)&&meta.locks.includes(f.id); });
  FX.forEach(f=>{ state[f.id].on=false; });
  Object.keys(o).forEach(id=>{ if(id==='_meta'||!state[id]) return; state[id].on=true;
    const e=o[id]; Object.keys(e).forEach(k=>{
      if(k.endsWith('_env')) state[id][k]=!!e[k];
      else if(state[id][k]!==undefined) state[id][k]=e[k];
    });
  });
  syncUI();
  if (typeof syncSeedUI==='function') syncSeedUI();
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
