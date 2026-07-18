function applyTracking(w,h,phase,v){
// ---- tracking noise band (VHS) ----
if (v.on && v.tracking>0){
  const trk = P('vhs','tracking');
  const bandY = ((phase* -1.5) % 1 + 1)%1 * h;   // scrolls upward, loops
  const bh = h*0.06*trk + 4;
  ctx.save();
  ctx.globalCompositeOperation='overlay';
  ctx.globalAlpha = 0.5*trk;
  for (let y=0;y<bh;y++){
    ctx.fillStyle = rand(y+phase*100) > .5 ? '#fff' : '#000';
    ctx.fillRect(0, (bandY+y)%h, w, 1);
  }
  ctx.restore();
}
}

function applyNoise(w,h,phase){
// ---- noise grain + flicker ----
const n = state.noise;
if (n.on && (n.grain>0 || n.flicker>0)){
  if (n.grain>0){
    const g = ctx.getImageData(0,0,w,h);
    const d = g.data;
    const amp = P('noise','grain')*90;
    const seed = Math.floor(phase*30);   // 30 grain frames per loop
    const type = n.type|0;
    const sz = 1 + Math.round((n.size||0)*11);       // grain cell size: 1px (fine) → chunky blocks
    const cw = Math.ceil(w/sz);                       // cells per row (a whole cell shares one noise value)
    const density = (type===2||type===3) ? P('noise','grain')*0.15 : 0;
    // Smooth softens the square cell edges that show up at large Grain Size — for Luma/Chroma it
    // blends between block noise and a bilinearly-interpolated version (per-pixel weighted average
    // of the four neighbouring cells' values), for Specks it turns each square-cell dot into a soft
    // radial one that fades from the cell centre outward, so a big-Size speck reads as a round soft
    // point instead of a hard block. Only meaningful when cells are >1px.
    const smooth = sz>1 ? (n.smooth||0) : 0;
    const nzC = (cx,cy,off)=> rand((cy*cw+cx)*0.37 + seed + off);
    for (let p=0,i=0;i<d.length;i+=4,p++){
      const x=p%w, y=(p/w)|0;
      if (type>=2){                                   // sparse specks
        const cid = (y/sz|0)*cw + (x/sz|0);
        if (rand(cid*0.37+seed*1.7)<density){
          let sr, sg, sb;
          if (type===3){ const c=hsv(rand(cid*0.71+seed)*360,0.95,1); sr=c[0]; sg=c[1]; sb=c[2]; }             // vivid colour specks
          else { const v=rand(cid*0.53+seed)>0.5?255:0; sr=v; sg=v; sb=v; }                                   // salt & pepper
          if (smooth>0){                              // radial falloff from the cell centre → soft round dot
            const fxr=x/sz-((x/sz)|0)-0.5, fyr=y/sz-((y/sz)|0)-0.5;
            const dr=Math.sqrt(fxr*fxr+fyr*fyr)*2;    // 0 at centre, √2 at corners
            const fade=1 - (dr>1?1:dr)*smooth;        // lerps between hard block (smooth=0) and dot fully vanishing at corners (smooth=1)
            d[i]+=(sr-d[i])*fade; d[i+1]+=(sg-d[i+1])*fade; d[i+2]+=(sb-d[i+2])*fade;
          } else {
            d[i]=sr; d[i+1]=sg; d[i+2]=sb;
          }
        }
      } else if (smooth>0){                           // Luma / Chroma with bilinear blend
        const cxf=x/sz, cyf=y/sz, gx=cxf|0, gy=cyf|0, fx=cxf-gx, fy=cyf-gy;
        const bl=(o)=>{ const v00=nzC(gx,gy,o), v10=nzC(gx+1,gy,o), v01=nzC(gx,gy+1,o), v11=nzC(gx+1,gy+1,o);
          const sV=v00*(1-fx)*(1-fy)+v10*fx*(1-fy)+v01*(1-fx)*fy+v11*fx*fy;
          return (v00+(sV-v00)*smooth - 0.5)*amp; };  // lerp block↔smooth by Smooth, then centre & scale
        if (type===0){ const nz=bl(0); d[i]+=nz; d[i+1]+=nz; d[i+2]+=nz; }
        else { d[i]+=bl(0); d[i+1]+=bl(11.3); d[i+2]+=bl(27.7); }
      } else {                                        // Luma / Chroma — original block path (unchanged, fast)
        const cid = (y/sz|0)*cw + (x/sz|0);
        if (type===1){
          d[i]+=(rand(cid*0.37+seed)-0.5)*amp; d[i+1]+=(rand(cid*0.37+seed+11.3)-0.5)*amp; d[i+2]+=(rand(cid*0.37+seed+27.7)-0.5)*amp;
        } else {
          const nz=(rand(cid*0.37+seed)-0.5)*amp; d[i]+=nz; d[i+1]+=nz; d[i+2]+=nz;
        }
      }
    }
    ctx.putImageData(g,0,0);
  }
  if (n.flicker>0){
    ctx.save();
    ctx.globalCompositeOperation='overlay';
    const f = (rand(Math.floor(phase*24))-0.5)*P('noise','flicker');
    ctx.fillStyle = f>0 ? `rgba(255,255,255,${f})` : `rgba(0,0,0,${-f})`;
    ctx.fillRect(0,0,w,h);
    ctx.restore();
  }
}
}

function applyFilm(w,h,fm,fseed){
// ---- film 8mm overlays: burn/flicker, scratches, dust ----
if (fm.on){
  if (fm.burn>0){
    const burn=P('film','burn');
    ctx.save(); ctx.globalCompositeOperation='overlay';
    const fl=(rand(fseed*1.9)-0.5)*burn;
    ctx.fillStyle = fl>0?`rgba(255,240,210,${fl})`:`rgba(40,20,0,${-fl})`;
    ctx.fillRect(0,0,w,h); ctx.restore();
    if (rand(fseed*0.7) < burn*0.25){                    // occasional burn blotch
      const bx=rand(fseed*11)*w, by=rand(fseed*13)*h, br=(0.1+0.2*rand(fseed*17))*w;
      const g=ctx.createRadialGradient(bx,by,0,bx,by,br);
      g.addColorStop(0,`rgba(255,230,180,${0.5*burn})`); g.addColorStop(1,'rgba(255,230,180,0)');
      ctx.fillStyle=g; ctx.fillRect(0,0,w,h);
    }
  }
  if (fm.scratch>0){                                     // flickering vertical scratches
    const scr=P('film','scratch'); const ns=Math.floor(scr*5)+1;
    for (let k=0;k<ns;k++){
      if (rand(fseed*3.3+k*17) > 0.45) continue;
      const x=Math.floor(rand(fseed*7.1+k*13)*w);
      ctx.fillStyle = rand(k)>.5?`rgba(255,255,255,${0.15+0.3*scr})`:`rgba(0,0,0,${0.2+0.3*scr})`;
      ctx.fillRect(x,0,1,h);
    }
  }
  if (fm.dust>0){                                        // dust specks
    const dst=P('film','dust'); const nd=Math.floor(dst*45);
    for (let k=0;k<nd;k++){
      const x=rand(fseed*5.1+k*2.1)*w, y=rand(fseed*9.7+k*3.3)*h;
      const s=1+Math.floor(rand(k+fseed)*2);
      ctx.fillStyle = rand(k*1.7)>.4?`rgba(20,15,10,${0.5*dst})`:`rgba(255,250,240,${0.6*dst})`;
      ctx.fillRect(x,y,s,s);
    }
  }
}
}

function applyBloom(w,h){
// ---- bloom: blurred bright pass screened back over ----
const bl = state.bloom;
if (bl.on && bl.amount>0){
  // Halation lowers the contrast of the bright pass so mid-tones survive it too — the glow spreads
  // across the whole frame and lifts it (high-key), instead of only blooming the highlights.
  const g = P('bloom','glow');
  const contrast = 1.8 - 1.15*g;      // 1.8 (tight highlights) → 0.65 (whole frame veils)
  const bright   = 1.5 + 0.45*g;      // push it brighter as the veil widens
  sc.width=w; sc.height=h; sctx.clearRect(0,0,w,h);
  sctx.filter=`blur(${bl.size}px) brightness(${bright}) contrast(${contrast})`;
  sctx.drawImage(canvas,0,0); sctx.filter='none';
  ctx.save(); ctx.globalCompositeOperation='screen'; ctx.globalAlpha=P('bloom','amount'); ctx.drawImage(sc,0,0); ctx.restore();
}
}

function applyScanlines(w,h,v){
// ---- scanlines (VHS) ----
if (v.on && v.scanline>0){
  ctx.save();
  ctx.globalCompositeOperation='multiply';
  ctx.globalAlpha = v.scanline;
  for (let y=0;y<h;y+=2){ ctx.fillStyle='#000'; ctx.fillRect(0,y,w,1); }
  ctx.restore();
}
}

function applyColorGrade(w,h,c){
// ---- color tint + vignette ----
if (c.on){
  if (c.tint !== 0){
    ctx.save();
    ctx.globalCompositeOperation='overlay';
    ctx.globalAlpha = Math.abs(c.tint)*0.6;
    ctx.fillStyle = c.tint>0 ? '#ff8a3d' : '#3d7bff';
    ctx.fillRect(0,0,w,h);
    ctx.restore();
  }
  if (c.vignette>0){
    const g = ctx.createRadialGradient(w/2,h/2,Math.min(w,h)*0.3, w/2,h/2,Math.max(w,h)*0.75);
    g.addColorStop(0,'rgba(0,0,0,0)');
    g.addColorStop(1,`rgba(0,0,0,${c.vignette})`);
    ctx.fillStyle=g; ctx.fillRect(0,0,w,h);
  }
}
}
