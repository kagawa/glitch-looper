const kcanvas = document.createElement('canvas'), kctx = kcanvas.getContext('2d');  // Kaleidoscope fan scratch

function applyWarp(w,h,phase){
// ---- warp: per-row horizontal displacement (selectable pattern, wraps at edges) ----
const wp = state.warp;
if (wp.on && wp.amp>0){
  const amp = P('warp','amp'), fq = wp.freq*0.05, TAU=Math.PI*2, sp = phase*TAU*wp.speed;
  const mode = wp.warpmode|0;
  const pEnv = Math.abs(Math.sin(phase*Math.PI*3));            // Pulse: swell then settle (0 at ends)
  const tri = p => { const f=p-Math.floor(p); return 2*Math.abs(2*f-1)-1; };  // triangle wave
  const stepP = Math.floor(phase*Math.max(1,wp.speed)*3);      // Step/Jitter animation index
  const dxAt = y => {
    switch (mode){
      case 1: return Math.sin(y*fq)*amp*pEnv;                                   // Pulse
      case 2: return (rand(Math.floor(y/3) + stepP*7)*2-1)*amp;                 // Jitter (per-row shake)
      case 3: { const b=Math.floor((y/h)*10); return (rand(b*3.7 + stepP)*2-1)*amp; }  // Step (banded)
      case 4: return amp*(0.6*Math.sin(y*fq*0.5 + sp) + 0.4*Math.sin(y*fq*1.3 - sp*2)); // Drift
      case 5: return amp*((y/h)-0.5)*2*Math.sin(sp);                            // Twist (shear leans)
      case 6: return amp*0.5*(Math.sin(y*fq + sp) + Math.sin(y*fq*1.15 - sp));   // Beat (interference)
      case 7: return tri((y*fq + sp)/TAU)*amp;                                  // Zigzag (triangle)
      default: return Math.sin(y*fq + sp)*amp;                                  // Wave
    }
  };
  sc.width=w; sc.height=h; sctx.clearRect(0,0,w,h); sctx.drawImage(canvas,0,0);
  ctx.clearRect(0,0,w,h);
  for (let y=0;y<h;y++){
    const dx = dxAt(y);
    ctx.drawImage(sc, 0,y,w,1, dx-w,y,w,1);
    ctx.drawImage(sc, 0,y,w,1, dx,  y,w,1);
    ctx.drawImage(sc, 0,y,w,1, dx+w,y,w,1);
  }
}
}

// Shape of a displacement across an edge, t in [0,1]. Hard steps; Ramp is a slow-fast-slow
// S-curve (smootherstep); Overshoot dips the opposite way first, then past the target and back —
// the anticipation an animator would put on a hard move. Overshoot can return <0 or >1 on purpose.
function edgeEase(t, mode){
  if (t<=0) return 0; if (t>=1) return 1;
  const m=mode|0;
  if (m===2){ const c=1.70158*1.525;                       // easeInOutBack
    return t<0.5 ? (Math.pow(2*t,2)*((c+1)*2*t-c))/2
                 : (Math.pow(2*t-2,2)*((c+1)*(2*t-2)+c)+2)/2; }
  if (m===1) return t*t*t*(t*(t*6-15)+10);                 // smootherstep — a gentle S
  if (m===3){ const r=0.3, k=1/(1-r);                      // linear middle, rounded corners — moves at
    if (t<r)     return 0.5*k/r*t*t;                       // a steady rate, not a slow-fast-slow S, with
    if (t>1-r){ const s=1-t; return 1-0.5*k/r*s*s; }       // the start and stop filleted rather than kinked
    return 0.5*k*r + k*(t-r); }
  return t<0.5 ? 0 : 1;                                    // hard
}

function applySliceGlitch(w,h,phase,gl){
// ---- glitch: horizontal slice displacement ----
if (gl.on && gl.amount>0){
  const slices = gl.slices, edge = gl.edge|0, ew = Math.max(1, gl.edgew|0);
  const step = Math.floor(phase*slices*2);             // changes over loop, wraps
  const amt = Math.min(1, P('glitch','amount')), maxOff = P('glitch','shift');
  const jit = gl.jitter;                               // uneven slice heights
  // slice boundaries: even, or jittered around the even spacing (seed steps with the loop → seamless)
  const ys=[0];
  for (let i=1;i<slices;i++){
    let y = h*i/slices;
    if (jit>0) y += (rand(i*4.7+step*1.3)-0.5)*(h/slices)*jit*0.9;
    ys.push(Math.max(1, Math.min(h-1, Math.round(y))));
  }
  ys.push(h); ys.sort((a,b)=>a-b);
  const useScratch = edge!==0;
  if (useScratch){ sc.width=w; sc.height=h; sctx.clearRect(0,0,w,h); sctx.drawImage(canvas,0,0); }
  for (let i=0;i<slices;i++){
    if (rand(i*7.1 + step) <= 1-amt) continue;
    const sy=ys[i], sh=ys[i+1]-sy; if (sh<=0) continue;
    const off=(rand(i*3.3+step)-0.5)*2*maxOff;
    if (edge===0){                                     // hard block — the original path, unchanged
      const slice = ctx.getImageData(0,sy,w,sh);
      ctx.clearRect(0,sy,w,sh);
      ctx.putImageData(slice, Math.round(off), sy);
      continue;
    }
    // ease the shift in over the top edge and back out over the bottom, so the slice doesn't
    // jump to full offset in one line — a hump that returns to the neighbours at both edges.
    // Give every slice its own top and bottom ease widths (seeded on the slice + loop step so it
    // stays seamless) — a fixed width makes every edge ramp at the same angle, which reads as
    // mechanical. Each edge also has a fixed chance of snapping fully Hard (width 0 → the offset
    // lands in one line): mixing genuine hard cuts among the soft ones sells the slice glitch.
    const ewAt = (s)=> rand(s) < 0.25 ? 0 : ew*(0.3 + rand(s*1.7)*1.2);   // 25% hard, else 0.3–1.5×
    const ewTop = ewAt(i*9.3+step*2.1), ewBot = ewAt(i*6.1+step*3.7);
    const eTop = Math.min(0.49, ewTop/sh), eBot = Math.min(0.49, ewBot/sh);
    ctx.clearRect(0,sy,w,sh);
    for (let yy=0; yy<sh; yy++){
      const t=(yy+0.5)/sh;
      const prof=Math.min(edgeEase(Math.min(1,t/eTop),edge), edgeEase(Math.min(1,(1-t)/eBot),edge));
      const shf=((Math.round(off*prof)%w)+w)%w, y=sy+yy;
      ctx.drawImage(sc, 0,y,w-shf,1, shf,y,w-shf,1);
      if (shf>0) ctx.drawImage(sc, w-shf,y,shf,1, 0,y,shf,1);
    }
  }
}
}

function applyFeedbackZoom(w,h,phase){
// ---- feedback zoom: composite scaled copies of the current frame (droste tunnel) ----
//      Zoom under 1 is where a tunnel is actually legible: each copy is smaller than the frame, so
//      they nest as distinct rings. At 1 and over every copy still fills the frame, so they all
//      overlap completely and only blend — a look, but not a tunnel.
//      Flow slides the whole stack along the zoom ladder over the loop. Advancing by exactly one
//      rung lands each copy where the next one was, so with an integer Flow and a window that fades
//      copies in at one end of the ladder and out at the other, the tunnel travels forever and
//      still meets itself at the loop point.
const fb = state.feedback;
if (fb.on && fb.amount>0){
  const amt = P('feedback','amount');
  if (amt<=0) return;
  sc.width=w; sc.height=h; sctx.clearRect(0,0,w,h); sctx.drawImage(canvas,0,0);
  // Under zoom 1 a copy is smaller than the frame, so its rectangular border sits in plain sight.
  // Every copy is drawn from this one snapshot, so fading the snapshot's edges once softens all of
  // them. destination-in multiplies the alpha already there, so four one-sided ramps compound into
  // a soft border with rounded corners.
  const fth = fb.feather;
  if (fth>0){
    const F = Math.max(1, Math.min(w,h)*0.35*fth);
    sctx.globalCompositeOperation='destination-in';
    const ramp = (x0,y0,x1,y1)=>{                 // transparent at (x0,y0) → opaque at (x1,y1)
      const g=sctx.createLinearGradient(x0,y0,x1,y1);
      g.addColorStop(0,'rgba(0,0,0,0)'); g.addColorStop(1,'rgba(0,0,0,1)');
      sctx.fillStyle=g; sctx.fillRect(0,0,w,h);
    };
    // the far ends anchor on w-1 / h-1: the last pixel, not one past it, or that column keeps
    // a sliver of opacity and the very edge stays visible
    ramp(0,0,F,0); ramp(w-1,0,w-1-F,0); ramp(0,0,0,F); ramp(0,h-1,0,h-1-F);
    sctx.globalCompositeOperation='source-over';
  }
  const N = Math.max(2, fb.copies|0), flow = fb.flow|0;
  const frac = flow ? ((phase*flow)%1+1)%1 : 0;             // position between rungs, wraps each step
  // Rotation comes in two flavours and only one of them can be slow.
  // Fast Spin turns the whole stack at once, so the loop only closes on a whole number of turns —
  // one turn per 3s loop, 120°/s, is its floor.
  // Twist is the slow one: it tilts each ring a little further than the last, and Flow walks the
  // rings along that spiral. A ring leaving one end is replaced by the one arriving at the other,
  // so the picture repeats however small the angle per step is — Twist×Flow degrees per loop,
  // down to 0.7°/s. Twist without Flow is a still spiral: the rings only turn by travelling.
  const spin = fb.speed*360*phase;
  const pulse = 1 + fb.pulse*0.12*Math.sin(phase*Math.PI*2); // breathing zoom (seamless)
  const items=[]; let W=0;
  for (let j=0;j<N;j++){
    const s = j+frac;                                       // rung on the zoom ladder
    const wt = Math.max(0, Math.sin(Math.PI*s/N));          // zero at both ends of the ladder
    W += wt;
    items.push({ s, wt, z: Math.pow(fb.zoom,s)*pulse });
  }
  if (W<=0) return;
  // Amount is how much of the frame the tunnel takes: the copies' alphas are set so what shows
  // through underneath is exactly (1-Amount), whatever Copies is — otherwise stacking more copies
  // just buried the picture.
  const keep = Math.max(0.02, 1-amt);
  items.sort((a,b)=> b.z-a.z);                              // paint far → near so the rings nest
  for (const it of items){
    if (it.wt<=0) continue;
    ctx.save();
    ctx.globalAlpha = 1-Math.pow(keep, it.wt/W);
    ctx.translate(w/2,h/2); ctx.rotate((fb.rotate*it.s + spin)*Math.PI/180);
    ctx.scale(it.z,it.z); ctx.translate(-w/2,-h/2);
    ctx.drawImage(sc,0,0);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}
}

function applyKaleido(w,h,phase){
// ---- Kaleidoscope: fold the frame into N mirrored wedges around a centre; spin by whole sectors ----
//      The output has N-fold symmetry, so rotating by a whole sector maps it onto itself — that lets
//      the spin be slow (one sector per loop) and still meet itself at the seam. Only one source wedge
//      is ever sampled (chosen by Source Angle), so the sample content never rotates.
const kd = state.kaleido;
if (kd.on && (kd.amount==null || kd.amount>0)){
  const amt = kd.amount==null?1:P('kaleido','amount');
  const seg=Math.max(2,kd.seg|0), sector=Math.PI*2/seg, half=sector/2;
  const off=(kd.angle|0)*Math.PI/180;
  const rot=(kd.spin|0)*sector*phase;                        // whole sectors/loop → seamless
  const mode=kd.mode==null?1:(kd.mode|0);
  if (mode===1){
    // Rotate copies → a fan of WHOLE-image blades. Each blade is the entire frame, pushed out from the
    // hub by Fan Spread and turned a sector further, so what sat at the picture's centre now rides out
    // into the blade. Averaging N blades is order-independent and the blade set is a permutation under
    // the spin, so it loops seamlessly.
    const hubX=w*kd.cx, hubY=h*kd.cy, scale=1-(kd.zoom||0)*0.6, bladeR=(kd.spread||0)*Math.min(w,h)*0.6;
    sc.width=w; sc.height=h; sctx.clearRect(0,0,w,h); sctx.drawImage(canvas,0,0);      // original frame
    kcanvas.width=w; kcanvas.height=h; kctx.clearRect(0,0,w,h);
    for (let k=0;k<seg;k++){
      kctx.setTransform(1,0,0,1,0,0); kctx.globalAlpha=1/(k+1);                        // running average → equal weight
      kctx.translate(hubX,hubY); kctx.rotate(k*sector+rot+off); kctx.translate(bladeR,0);
      kctx.scale(scale,scale); kctx.translate(-w/2,-h/2); kctx.drawImage(sc,0,0);
    }
    kctx.setTransform(1,0,0,1,0,0); kctx.globalAlpha=1;
    ctx.save(); ctx.globalAlpha=amt; ctx.drawImage(kcanvas,0,0); ctx.restore();        // fan over the original by Amount
  } else {
    // Mirror: per-pixel radial fold with a reflection — a crisp, symmetric kaleidoscope (one wedge).
    // Fan Spread shifts the sampled radius outward (|r-spread|), so the picture's centre lands on a ring
    // out in the wedges instead of at the hub — the mirror-mode counterpart of the fan's push-out.
    const cx=w*kd.cx, cy=h*kd.cy, scale=1+(kd.zoom||0)*2.5, bladeR=(kd.spread||0)*Math.min(w,h)*0.6;
    const src=ctx.getImageData(0,0,w,h), s=src.data, out=ctx.createImageData(w,h), o=out.data;
    for (let y=0;y<h;y++) for (let x=0;x<w;x++){
      const oi=(y*w+x)*4, dx=x-cx, dy=y-cy, r=Math.abs(Math.sqrt(dx*dx+dy*dy)*scale-bladeR);
      let a=(Math.atan2(dy,dx)-rot)%sector; if (a<0) a+=sector; if (a>half) a=sector-a; a+=off;
      let sx=(cx+r*Math.cos(a))|0, sy=(cy+r*Math.sin(a))|0;
      sx = sx<0?0:sx>=w?w-1:sx; sy = sy<0?0:sy>=h?h-1:sy;
      const si=(sy*w+sx)*4;
      o[oi]  = s[oi]  +(s[si]  -s[oi])  *amt;
      o[oi+1]= s[oi+1]+(s[si+1]-s[oi+1])*amt;
      o[oi+2]= s[oi+2]+(s[si+2]-s[oi+2])*amt;
      o[oi+3]= 255;
    }
    ctx.putImageData(out,0,0);
  }
}
}

function applyExtrude(w,h){
// ---- Extrude: pick a band of the picture by tone or colour and push it out — pseudo-3D ----
//      The shading is what sells it. Drag a region along a direction with its own colour and you
//      get a smear; a real extrusion shows a SIDE, lit differently from the face, so the pixels
//      trailing behind darken with depth. Without that this is a directional blur.
//      The face keeps its original pixels; only the body behind it is shaded.
const ex = state.extrude;
if (ex.on){
  const dist = P('extrude','dist');
  // 0.12: at 0.35 the top of the slider pushed ~190px on a 540-tall frame, well past anything
  // readable, and every useful setting was crammed into the bottom of the travel. Top is now ~65px.
  const D = Math.round(dist * Math.min(w,h) * 0.12);
  if (D>0){
    const im = ctx.getImageData(0,0,w,h), d = im.data;
    const src = new Uint8ClampedArray(d);
    const key = ex.key|0, c0 = ex.center, wd = ex.width;
    // which pixels get pushed: distance from the range centre, in the chosen key
    const sel = new Uint8Array(w*h);
    let minX=w, maxX=-1, minY=h, maxY=-1;
    for (let y=0,i=0;y<h;y++) for (let x=0;x<w;x++,i++){
      const j=i*4, r=src[j], g=src[j+1], b=src[j+2];
      let dd;
      if (key===2){                                   // Hue
        const mx=Math.max(r,g,b), ch=mx-Math.min(r,g,b);
        if (ch===0) continue;                         // a grey pixel has no hue to match against
        let hh = mx===r ? ((g-b)/ch)%6 : mx===g ? (b-r)/ch+2 : (r-g)/ch+4;
        hh*=60; if (hh<0) hh+=360;
        dd = Math.abs(hh - c0*360);
        if (dd>180) dd = 360-dd;                      // hue is a circle — the short way round
        dd /= 180;
      } else if (key===1){                            // Saturation
        const mx=Math.max(r,g,b);
        dd = Math.abs((mx ? (mx-Math.min(r,g,b))/mx : 0) - c0);
      } else {                                        // Lightness
        dd = Math.abs((0.299*r+0.587*g+0.114*b)/255 - c0);
      }
      if (dd<=wd){ sel[i]=1;
        if (x<minX)minX=x; if (x>maxX)maxX=x; if (y<minY)minY=y; if (y>maxY)maxY=y; }
    }
    if (maxX<0) return;                               // nothing in range → nothing to push
    const a = ex.angle*Math.PI/180, dx = Math.cos(a), dy = Math.sin(a), shade = ex.shade;
    // Sweep along the push instead of searching back from every pixel. Asking each pixel "what is
    // behind me?" costs the whole distance for every pixel that finds nothing — the emptier the
    // selection the slower it got, which is backwards. Walking in the direction of the push lets
    // each pixel inherit its answer from the one behind it, already solved: one pass, whatever the
    // distance. dist carries ray length so the diagonals don't come out short.
    const adx=Math.abs(dx), ady=Math.abs(dy);
    const dist=new Float32Array(w*h).fill(-1), from=new Int32Array(w*h).fill(-1);
    if (adx>=ady){                                    // mostly sideways → walk columns
      const step = dx>=0?1:-1, ky = dy/adx, per = 1/adx;
      for (let n=0;n<w;n++){
        const x = dx>=0 ? n : w-1-n;
        for (let y=0;y<h;y++){
          const i=y*w+x;
          if (sel[i]){ dist[i]=0; from[i]=i; continue; }   // the face seeds the sweep
          const px=x-step, py=Math.round(y-ky);
          if (px<0||px>=w||py<0||py>=h) continue;
          const pi=py*w+px, pd=dist[pi];
          if (pd<0) continue;
          const nd=pd+per;
          if (nd>D) continue;                              // past the extrusion's reach
          dist[i]=nd; from[i]=from[pi];
        }
      }
    } else {                                          // mostly up/down → walk rows
      const step = dy>=0?1:-1, kx = dx/ady, per = 1/ady;
      for (let n=0;n<h;n++){
        const y = dy>=0 ? n : h-1-n;
        for (let x=0;x<w;x++){
          const i=y*w+x;
          if (sel[i]){ dist[i]=0; from[i]=i; continue; }
          const py=y-step, px=Math.round(x-kx);
          if (px<0||px>=w||py<0||py>=h) continue;
          const pi=py*w+px, pd=dist[pi];
          if (pd<0) continue;
          const nd=pd+per;
          if (nd>D) continue;
          dist[i]=nd; from[i]=from[pi];
        }
      }
    }
    for (let i=0;i<w*h;i++){
      if (dist[i]<=0) continue;                       // 0 is the face, -1 was never reached
      const f = 1 - shade*(dist[i]/D);                // the side falls away with depth
      const o=i*4, s2=from[i]*4;
      d[o]=src[s2]*f; d[o+1]=src[s2+1]*f; d[o+2]=src[s2+2]*f;
    }
    ctx.putImageData(im,0,0);
  }
}
}

// ---- melt: pixel drip, breathes 0→max→0 over the loop (seamless) ----
//      Drip = pixels smear down (top stretches)
//      Wrap = drips off the bottom and re-enters the top, so a column can travel a full height
function applyMelt(w,h,phase){
const ml = state.melt;
if (ml.on && ml.amount>0){
  const amt=P('melt','amount'), wrap=(ml.mode|0)===1;
  const breathe = Math.max(0, envCurve(phase, ml.curve|0, ml.rate));   // Curve: how the melt evolves over the loop
  const span = amt*h*(wrap?1.0:0.6)*breathe;                   // Wrap can travel a full height and loop back
  const sexp = 0.3 + ml.spread*3;  // Spread: how the drip amount varies per band (low = uniform, high = a few long drips)
  const bwAvg = Math.max(1, ml.width|0);
  const src=ctx.getImageData(0,0,w,h), out=ctx.createImageData(w,h), sd=src.data, od=out.data;
  meltBands(w,h,span,sexp,bwAvg,wrap,sd,od);
  ctx.putImageData(out,0,0);
}
}
// Every column of a band is displaced downward by one amount, so the drip front is a smooth hump.
// Bands stay narrow (max 16px) — past that the hump reads as a shape rather than as liquid.
function meltBands(w,h,span,sexp,bwAvg,wrap,sd,od){
  // map each column to a band + its distance from that band's peak. Band widths and peak
  // positions vary, otherwise the humps line up into a comb. Width 1 = one band per column
  // (bandE 0 → taper 1.0 → identical to the original per-column drip).
  const bandOf = new Int32Array(w), bandE = new Float32Array(w);
  if (bwAvg===1){ for (let x=0;x<w;x++){ bandOf[x]=x; bandE[x]=0; } }
  else {
    for (let bi=0, x0=0; x0<w; bi++){
      const bw = Math.max(1, Math.round(bwAvg*(0.5+rand(bi*2.7))));   // 0.5x–1.5x → averages bwAvg
      const x1 = Math.min(w, x0+bw);
      const c = 0.5 + (rand(bi*4.1)-0.5)*0.5;                          // peak sits off-centre
      for (let x=x0;x<x1;x++){
        bandOf[x]=bi;
        const t=(x-x0+0.5)/(x1-x0);
        bandE[x]=(t-c)/Math.max(c,1-c);                                // -1..1, 0 at the peak
      }
      x0=x1;
    }
  }
  for (let x=0;x<w;x++){
    // surface tension: the peak of a band runs furthest, the edges lag
    const e=bandE[x], bulge=1-e*e;
    const off=Math.floor(Math.pow(rand(bandOf[x]*0.13), sexp)*span*(0.55+0.45*bulge));
    for (let y=0;y<h;y++){
      let sy = y - off;
      sy = wrap ? ((sy%h)+h)%h : (sy>=0?sy:0);                 // Wrap: mod h  ·  Drip: clamp to top
      const si=(sy*w+x)*4, di=(y*w+x)*4;
      od[di]=sd[si]; od[di+1]=sd[si+1]; od[di+2]=sd[si+2]; od[di+3]=255;
    }
  }
}
function applyRgbShift(w,h,t,v){
// RGB channel shift — VHS aberration = horizontal, Slice RGB = vertical (distinct axes)
const gl = state.glitch;
const hAb  = v.on ? P('vhs','aberration')*(0.7+0.3*Math.sin(t)) : 0;   // horizontal shift (VHS)
const vRGB = gl.on ? P('glitch','rgb') : 0;                            // vertical shift (Slice)
if (hAb > 0.5 || vRGB > 0.5){
  const base = ctx.getImageData(0,0,w,h);
  const out = ctx.createImageData(w,h);
  const bd = base.data, od = out.data;
  const hs = Math.round(hAb), vs = Math.round(vRGB);
  for (let y=0;y<h;y++){
    for (let x=0;x<w;x++){
      const i=(y*w+x)*4;
      const rx = Math.min(w-1, x+hs), bx = Math.max(0, x-hs);   // R right / B left
      const ry = Math.min(h-1, y+vs), by = Math.max(0, y-vs);   // R down  / B up
      od[i]   = bd[(ry*w+rx)*4];      // R: horizontal + vertical
      od[i+1] = bd[i+1];             // G stays
      od[i+2] = bd[(by*w+bx)*4+2];   // B: opposite on both axes
      od[i+3] = 255;
    }
  }
  ctx.putImageData(out,0,0);
}
  return gl;
}
