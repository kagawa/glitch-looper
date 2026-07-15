function applyDegauss(w,h,phase){
// ---- Degauss: magnetised CRT — rainbow colour-purity patches (beams hit wrong phosphors).
//      Breaks COLOUR, not geometry: G (luma) stays put, R/B fringe in blotchy zones. ----
const dg = state.degauss;
if (dg.on){
  const amt = P('degauss','amount');
  if (amt>0){
    const TAU=Math.PI*2;
    const amp = Math.sin(phase*Math.PI);              // disturbance rises then settles — 0 at both ends
    const str = amt*amp;
    if (str>0.004){
      const wob = phase*TAU*dg.freq;                  // shimmer / buzz
      const maxShift = str*(10 + 18*(0.4+0.6*dg.color));   // per-blob channel misconvergence (px)
      const a=TAU*2.5/w, b=TAU*1.9/h, cc=TAU*1.7/w, dd=TAU*2.7/h;
      const cX=x=>x<0?0:x>=w?w-1:x, cY=y=>y<0?0:y>=h?h-1:y;
      const src=ctx.getImageData(0,0,w,h), out=ctx.createImageData(w,h), sd=src.data, od=out.data;
      for (let y=0;y<h;y++){
        for (let x=0;x<w;x++){
          const fx=Math.sin(x*a + y*b + wob), fy=Math.sin(x*cc - y*dd - wob*0.8);
          const di=(y*w+x)*4;
          const rX=cX((x+fx*maxShift)|0), rY=cY((y+fy*maxShift)|0);
          const bX=cX((x-fx*maxShift)|0), bY=cY((y-fy*maxShift)|0);
          od[di]   = sd[(rY*w+rX)*4];        // R pulled one way
          od[di+1] = sd[di+1];               // G stays → picture doesn't sway
          od[di+2] = sd[(bY*w+bX)*4+2];      // B pulled the other → rainbow fringing
          od[di+3] = 255;
        }
      }
      ctx.putImageData(out,0,0);
      if (dg.color>0){                        // moving rainbow hue patches ("acid" purity error)
        ctx.save(); ctx.globalCompositeOperation='overlay';
        for (let k=0;k<3;k++){
          const bx=w*(0.15+0.7*(0.5+0.5*Math.sin(wob*0.7+k*2.1)));
          const by=h*(0.15+0.7*(0.5+0.5*Math.cos(wob*0.9+k*1.7)));
          const rad=Math.max(w,h)*(0.3+0.1*k);
          const hue=Math.round(phase*300 + k*120 + wob*24)%360;
          const g=ctx.createRadialGradient(bx,by,0,bx,by,rad);
          g.addColorStop(0,`hsla(${hue},100%,50%,${0.45*str*dg.color})`);
          g.addColorStop(1,'hsla(0,0%,50%,0)');
          ctx.fillStyle=g; ctx.fillRect(0,0,w,h);
        }
        ctx.restore();
      }
    }
  }
}
}

function applyGhosting(w,h,phase){
// ---- Ghosting: multipath echo — faint offset duplicate(s) of the picture ----
const gh = state.ghost;
if (gh.on){
  const gA = P('ghost','amount');
  if (gA>0){
    sc.width=w; sc.height=h; sctx.clearRect(0,0,w,h); sctx.drawImage(canvas,0,0);
    const ech = gh.echoes|0;
    const drawGhost = (off, aMul)=>{                // one ghost = its trailing echoes (+ pre-echo)
      for (let i=1;i<=ech;i++){ ctx.globalAlpha = gA*0.7*(1-(i-1)/(ech+0.5))*aMul; ctx.drawImage(sc, off*i, 0); }
      if (gh.pre>0){ ctx.globalAlpha = gA*0.4*gh.pre*aMul; ctx.drawImage(sc, -off*0.7, 0); }
    };
    ctx.save();
    if (gh.drift<=0){
      drawGhost(gh.offset, 1);                      // static ghost
    } else {
      // Continuous emission: each ghost slides outward ONE-WAY while fading in→out (no back-and-forth);
      // N instances staggered by a phase so as one dies another is born → no gap ("飛び飛び") in between.
      // dr scales how far it travels; amplitude reaches 0 at the cycle ends so the reset is invisible.
      const rate=gh.rate|0, dr=gh.drift, N=2;
      const ss=(lo,hi,x)=>{ if(x<=lo)return 0; if(x>=hi)return 1; const t=(x-lo)/(hi-lo); return t*t*(3-2*t); };
      const insts=[]; let tot=0;
      for (let n=0;n<N;n++){
        const u=((phase*rate)+n/N)%1;
        const amp = ss(0,0.08,u)*(1-ss(0.55,1,u));  // fade in fast → hold → fade to 0 by cycle end
        if (amp<=0.001) continue;
        insts.push({ amp, off: gh.offset*(1 + dr*(u*2.4 - 1)) });   // one-way slide (0…2.4× at dr=1)
        tot+=amp;
      }
      const norm = tot>1 ? 1/tot : 1;               // keep total ghost opacity constant (crossfade)
      for (const it of insts) drawGhost(it.off, it.amp*norm);
    }
    ctx.restore();
  }
}
}

function applyDotCrawl(w,h,phase){
// ---- Dot crawl: composite cross-colour — rainbow shimmer along vertical edges ----
const dc = state.dotcrawl;
if (dc.on){
  const dA = P('dotcrawl','amount');
  if (dA>0){
    const im = ctx.getImageData(0,0,w,h), d = im.data;
    const cell = dc.size|0 || 2;
    const crawl = Math.round(phase*dc.speed*2);     // integer steps → seamless checker shift
    for (let y=0;y<h;y++){
      const yc = Math.floor(y/cell);
      for (let x=1;x<w-1;x++){
        const i=(y*w+x)*4;
        const lL = d[i-4]*.3+d[i-3]*.59+d[i-2]*.11;
        const lR = d[i+4]*.3+d[i+5]*.59+d[i+6]*.11;
        const g = lR-lL;                             // signed horizontal luma gradient
        const ag = g<0?-g:g;
        if (ag>10){                                    // lower threshold → more edges shimmer
          const cb = ((Math.floor(x/cell)+yc+crawl)&1)?1:-1;
          const s = Math.min(1,(ag-10)/70)*dA*cb*(g<0?-1:1);   // saturates sooner → stronger
          const hueRow = (yc+crawl)%3;                // cycle opponent colour per row → rainbow
          if (hueRow===0){ d[i]+=s*165; d[i+2]-=s*165; }
          else if (hueRow===1){ d[i+1]+=s*165; d[i]-=s*120; d[i+2]-=s*120; }
          else { d[i+2]+=s*165; d[i]-=s*165; }
        }
      }
    }
    ctx.putImageData(im,0,0);
  }
}
}

function applyHumBar(w,h,phase){
// ---- Hum bar: soft dark band(s) rolling up the screen (mains hum) ----
const hm = state.hum;
if (hm.on){
  const hA = P('hum','amount');
  if (hA>0){
    const bandH = Math.max(8, h*(0.12+0.3*hm.width));
    const nRoll = Math.max(1, Math.round(hm.speed));
    const yc = (1-((phase*nRoll)%1))*h;              // rolls upward, integer wraps → seamless
    const dark = 0.6*hA;
    ctx.save();
    const band = cy=>{
      const g=ctx.createLinearGradient(0,cy-bandH/2,0,cy+bandH/2);
      g.addColorStop(0,'rgba(0,0,0,0)'); g.addColorStop(.5,`rgba(0,0,0,${dark})`); g.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=g; ctx.fillRect(0,cy-bandH/2,w,bandH);
    };
    band(yc); band(yc-h); band(yc+h);                // wrap copies
    ctx.restore();
  }
}
}

function applyHerringbone(w,h,phase){
// ---- Herringbone: RF interference — moving diagonal weave ----
const hb = state.herring;
if (hb.on){
  const hbA = P('herring','amount');
  if (hbA>0){
    const T = Math.max(6, Math.round(28 - hb.freq*2));
    htile.width=T; htile.height=T; htx.clearRect(0,0,T,T);
    const nsp = Math.max(1, Math.round(hb.speed));
    const shp = ((phase*nsp)%1)*T;                   // diagonal drift, integer wraps → seamless
    htx.strokeStyle='#fff'; htx.lineWidth=T*0.32; htx.lineCap='square';
    // slope must be exactly -1 (shift -T over height T) so the diagonals line up across tiles;
    // extend past the edges by e along that same slope so the pattern stays continuous.
    const e=2;
    for (let o=-T;o<=2*T;o+=T){
      htx.beginPath(); htx.moveTo(o+shp+e, -e); htx.lineTo(o+shp-T-e, T+e); htx.stroke();
    }
    const pat = ctx.createPattern(htile,'repeat');
    ctx.save(); ctx.globalCompositeOperation='overlay'; ctx.globalAlpha=hbA*0.5;
    ctx.fillStyle=pat; ctx.fillRect(0,0,w,h); ctx.restore();
  }
}
}

function applySignalSync(w,h,phase,fseed){
// ---- Signal / Sync: horizontal-sync instability — per-scanline skew/drift/snap + flagging + bad contact ----
const sg = state.sync;
if (sg.on){
  const TAU=Math.PI*2, slip=sg.hsync, flagV=P('sync','flag'), ctc=P('sync','contact');
  if (slip!==0 || flagV>0){                        // per-scanline horizontal remap (wraps)
    const snaps=2, u=(phase*snaps)%1;
    const walk=slip*w*0.14*u, skew=slip*w*0.12*u, wob=slip*3, wobP=phase*TAU*6;
    const flagAmt=flagV*w*0.20, flagWave=1+0.3*Math.sin(phase*TAU*3);
    const wrapX=xx=>{ let m=xx%w; if(m<0)m+=w; return m|0; };
    const src=ctx.getImageData(0,0,w,h), out=ctx.createImageData(w,h), sd=src.data, od=out.data;
    for (let y=0;y<h;y++){
      const yy=y/h; let rShift=0;
      if (slip!==0) rShift += walk + skew*(yy-0.5)*2 + wob*Math.sin(y*0.25+wobP);
      if (flagV>0)  rShift += flagAmt*Math.exp(-yy/0.05)*flagWave;   // flagging: strong at top
      const row=y*w;
      for (let x=0;x<w;x++){ const di=(row+x)*4, gx=wrapX(x+rShift);
        od[di]=sd[(row+gx)*4]; od[di+1]=sd[(row+gx)*4+1]; od[di+2]=sd[(row+gx)*4+2]; od[di+3]=255; }
    }
    ctx.putImageData(out,0,0);
  }
  if (flagV>0){                                    // head-switching noise strip at the bottom
    const bandH=Math.max(3,Math.round(h*(0.03+0.02*flagV))), by=h-bandH;
    const sh=Math.round((rand(fseed*0.9+3.1)-0.35)*w*0.3*flagV);
    if (sh){ const band=ctx.getImageData(0,by,w,bandH); ctx.clearRect(0,by,w,bandH);
      ctx.putImageData(band,sh,by); ctx.putImageData(band,sh>0?sh-w:sh+w,by); }
    ctx.save(); ctx.globalAlpha=0.65*flagV;
    for (let yy=0;yy<bandH;yy++){ if (rand(yy*2.3+fseed)>.35){ ctx.fillStyle=rand(yy+fseed*1.7)>.5?'#e8e8e8':'#111'; ctx.fillRect(0,by+yy,w,1);} }
    ctx.restore();
  }
  if (ctc>0){                                      // bad contact: intermittent tears + static bursts
    const nb=2+Math.round(ctc*4);
    for (let b=0;b<nb;b++){
      const center=rand(b*4.7+1.3); let dph=Math.abs(phase-center); dph=Math.min(dph,1-dph);
      const win=0.015+ctc*0.035; if (dph>=win) continue;
      const amt=1-dph/win, bandH=Math.max(4,Math.round(h*0.04*(0.5+ctc))), by=Math.floor(rand(b*2.3)*(h-bandH));
      const shift=Math.round((rand(b*5.1+fseed)-0.5)*w*0.35*amt);
      if (shift){ const band=ctx.getImageData(0,by,w,bandH); ctx.clearRect(0,by,w,bandH);
        ctx.putImageData(band,shift,by); ctx.putImageData(band,shift>0?shift-w:shift+w,by); }
      ctx.save(); ctx.globalAlpha=0.55*amt;
      for (let yy=0;yy<bandH;yy++){ if (rand(yy*1.7+fseed+b)>.5){ ctx.fillStyle=rand(yy+fseed*1.3)>.5?'#fff':'#111'; ctx.fillRect(0,by+yy,w,1);} }
      ctx.restore();
      ctx.save(); ctx.globalCompositeOperation='overlay'; ctx.globalAlpha=0.22*amt;
      ctx.fillStyle=rand(b+fseed)>.5?'#fff':'#000'; ctx.fillRect(0,0,w,h); ctx.restore();
    }
  }
}
}
