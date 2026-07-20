const kcanvas = document.createElement('canvas'), kctx = kcanvas.getContext('2d');  // Kaleidoscope fan scratch

function applyLiquid(w,h,phase){
// ---- Liquid Glass: scattered water/glass droplets, each a little lens that magnifies the picture under
//      it (with a chromatic rim), drifting slowly over the loop. Localised — unlike a full-frame ripple. ----
const lq = state.liquid;
if (lq.on && (lq.amount==null || lq.amount>0) && lq.amp>0){
  const amt=lq.amount==null?1:P('liquid','amount'), refr=P('liquid','amp')*0.6, chroma=lq.chroma;
  const M=Math.round(4+(lq.count||0)*26), baseR=(0.05+(lq.size||0)*0.15)*Math.min(w,h);
  const dcx=new Float64Array(M), dcy=new Float64Array(M), dr=new Float64Array(M), dr2=new Float64Array(M);
  for (let k=0;k<M;k++){                                                     // seeded positions, gently drifting
    const cx=(rand(k*12.9+1)+0.06*Math.sin(phase*Math.PI*2+rand(k*5.7)*6))*w;
    const cy=(rand(k*78.2+3)+0.06*Math.cos(phase*Math.PI*2+rand(k*2.3)*6))*h;
    const r=baseR*(0.55+rand(k*3.3)*1.0);
    dcx[k]=cx; dcy[k]=cy; dr[k]=r; dr2[k]=r*r;
  }
  const cl=(v,m)=>v<0?0:v>=m?m-1:v;
  const src=ctx.getImageData(0,0,w,h), s=src.data, out=ctx.createImageData(w,h), o=out.data;
  for (let y=0;y<h;y++) for (let x=0;x<w;x++){
    const oi=(y*w+x)*4;
    let best=-1, bestT=2;
    for (let k=0;k<M;k++){ const ddx=x-dcx[k], ddy=y-dcy[k], d2=ddx*ddx+ddy*ddy;
      if (d2<dr2[k]){ const t=Math.sqrt(d2)/dr[k]; if (t<bestT){ bestT=t; best=k; } } }
    let sx=x, sy=y, co=0;
    if (best>=0){ const bend=refr*(1-bestT*bestT);                          // magnify toward the droplet centre
      sx=dcx[best]+(x-dcx[best])*(1-bend); sy=dcy[best]+(y-dcy[best])*(1-bend); co=chroma*bestT*bestT*4; }
    const R=s[(cl(sy|0,h)*w+cl((sx+co)|0,w))*4];
    const G=s[(cl(sy|0,h)*w+cl(sx|0,w))*4+1];
    const B=s[(cl(sy|0,h)*w+cl((sx-co)|0,w))*4+2];
    o[oi]=s[oi]+(R-s[oi])*amt; o[oi+1]=s[oi+1]+(G-s[oi+1])*amt; o[oi+2]=s[oi+2]+(B-s[oi+2])*amt; o[oi+3]=255;
  }
  ctx.putImageData(out,0,0);
}
}

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
// ---- glitch: directional slice displacement / duplication / replacement ----
if (gl.on && gl.amount>0){
  const slices = gl.slices, edge = gl.edge|0, ew = Math.max(1, gl.edgew|0), direction=gl.direction|0, fill=gl.fill|0;
  const step = Math.floor(phase*slices*2);             // changes over loop, wraps
  const amt = Math.min(1, P('glitch','amount')), maxOff = P('glitch','shift');
  const jit = gl.jitter;                               // uneven slice heights
  // The original Horizontal + Shift + Hard path is retained by the same operations below. A single
  // snapshot is also the clean source for Duplicate/Freeze, so later slices never feed on earlier ones.
  sc.width=w; sc.height=h; sctx.clearRect(0,0,w,h); sctx.drawImage(canvas,0,0);
  const bounds=(length,seed)=>{
    const out=[0];
    for(let i=1;i<slices;i++){
      let p=length*i/slices;
      if(jit>0) p+=(rand(i*4.7+step*1.3+seed)-.5)*(length/slices)*jit*.9;
      out.push(Math.max(1,Math.min(length-1,Math.round(p))));
    }
    out.push(length); out.sort((a,b)=>a-b); return out;
  };
  const ys=bounds(h,0), xs=bounds(w,91.7);
  for (let i=0;i<slices;i++){
    if (rand(i*7.1 + step) <= 1-amt) continue;
    const vertical = direction===1 || (direction===2 && rand(i*11.9+step+2.7)>.5);
    const bb=vertical?xs:ys, pos=bb[i], thick=bb[i+1]-pos; if(thick<=0) continue;
    const off=(rand(i*3.3+step)-0.5)*2*maxOff;
    if(fill>=3){
      if(fill===4 || fill===5){ ctx.fillStyle=fill===4?'#000':'#fff'; vertical?ctx.fillRect(pos,0,thick,h):ctx.fillRect(0,pos,w,thick); }
      else { const im=vertical?ctx.getImageData(pos,0,thick,h):ctx.getImageData(0,pos,w,thick), d=im.data;
        for(let p=0;p<d.length;p+=4){ d[p]=255-d[p]; d[p+1]=255-d[p+1]; d[p+2]=255-d[p+2]; }
        vertical?ctx.putImageData(im,pos,0):ctx.putImageData(im,0,pos); }
      continue;
    }
    if(fill===2){                                      // Freeze: replace with a stable strip from elsewhere
      const limit=(vertical?w:h)-thick, src=Math.max(0,Math.floor(rand(i*19.3+step*.17+8.1)*Math.max(1,limit)));
      if(vertical) ctx.drawImage(sc,src,0,thick,h,pos,0,thick,h);
      else ctx.drawImage(sc,0,src,w,thick,0,pos,w,thick);
      continue;
    }
    if(fill===1){                                      // Duplicate: shifted copy over the untouched picture
      if(vertical) ctx.drawImage(sc,pos,0,thick,h,pos,Math.round(off),thick,h);
      else ctx.drawImage(sc,0,pos,w,thick,Math.round(off),pos,w,thick);
      continue;
    }
    if(edge===0){                                      // hard wrapped shift
      if(!vertical && direction===0){                  // legacy Horizontal/Shift/Hard path: keep old links pixel-identical
        const slice=ctx.getImageData(0,pos,w,thick); ctx.clearRect(0,pos,w,thick);
        ctx.putImageData(slice,Math.round(off),pos);
      } else if(vertical){
        const shf=((Math.round(off)%h)+h)%h; ctx.clearRect(pos,0,thick,h);
        ctx.drawImage(sc,pos,0,thick,h-shf,pos,shf,thick,h-shf);
        if(shf) ctx.drawImage(sc,pos,h-shf,thick,shf,pos,0,thick,shf);
      } else {
        const shf=((Math.round(off)%w)+w)%w; ctx.clearRect(0,pos,w,thick);
        ctx.drawImage(sc,0,pos,w-shf,thick,shf,pos,w-shf,thick);
        if(shf) ctx.drawImage(sc,w-shf,pos,shf,thick,0,pos,shf,thick);
      }
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
    const eTop = Math.min(0.49, ewTop/thick), eBot = Math.min(0.49, ewBot/thick);
    vertical?ctx.clearRect(pos,0,thick,h):ctx.clearRect(0,pos,w,thick);
    for (let q=0; q<thick; q++){
      const t=(q+0.5)/thick;
      const prof=Math.min(edgeEase(Math.min(1,t/eTop),edge), edgeEase(Math.min(1,(1-t)/eBot),edge));
      if(vertical){ const shf=((Math.round(off*prof)%h)+h)%h, x=pos+q;
        ctx.drawImage(sc,x,0,1,h-shf,x,shf,1,h-shf); if(shf)ctx.drawImage(sc,x,h-shf,1,shf,x,0,1,shf);
      } else { const shf=((Math.round(off*prof)%w)+w)%w, y=pos+q;
        ctx.drawImage(sc,0,y,w-shf,1,shf,y,w-shf,1); if(shf)ctx.drawImage(sc,w-shf,y,shf,1,0,y,shf,1);
      }
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

const EXTRUDE_TINT_RGB=[null,[0,0,0],[255,255,255],[246,197,64],[224,36,58]];   // Original / Black / White / Gold / Red
const EXTRUDE_TINT_TONE={5:2, 6:8, 7:9, 8:10};                                  // Rainbow / Fire / Candy / Festive → hypeLerp tones
function extrudeBlend(mode, base, side){
  if (mode===1) return 255-((255-base)*(255-side))/255;                         // Screen
  if (mode===2) return base*side/255;                                            // Multiply
  if (mode===3){ const s=base+side; return s>255?255:s; }                       // Add
  if (mode===4) return base<128 ? (2*base*side)/255 : 255-(2*(255-base)*(255-side))/255;  // Overlay
  return side;                                                                   // Replace (original behaviour)
}
function applyExtrude(w,h){
// ---- Extrude: pick a band of the picture (tone / colour / edges) and push it out — pseudo-3D.
//      Select By decides what makes it into the "face" that gets pushed: Lightness / Saturation /
//      Hue pick a coloured or tonal region, Edges runs a Sobel-style detect so contours become the
//      face (a pachinko/大当り-style extrusion of the picture's outlines). Push Mode picks the
//      shape of the extrusion — Angle is a single direction, Radial fans it out from a point in
//      the frame (outward or inward). Shading is what sells the pseudo-3D: pixels trailing behind
//      the face darken with depth. Tint replaces the side's colour with a solid or palette-driven
//      colour (Rainbow/Fire/Candy/Festive cycle along the extrusion's depth), blended by Tint
//      Amount so you can keep some of the underlying colour or go all-in. ----
const ex = state.extrude;
if (!ex.on) return;
const dist = P('extrude','dist');
const D = Math.round(dist * Math.min(w,h) * 0.12);
if (D<=0) return;
const im = ctx.getImageData(0,0,w,h), d = im.data;
const src = new Uint8ClampedArray(d);
const key = ex.key|0, c0 = ex.center, wd = ex.width;
// 1. Select the face — one Uint8 mask covering every mode. Edges (key=3) runs a Sobel-style
//    luminance-gradient detect; the tone/colour keys keep the original range logic.
const sel = new Uint8Array(w*h);
let minX=w, maxX=-1, minY=h, maxY=-1;
if (key===3){
  const thresh = Math.max(4, (ex.thresh||0.18)*90), w4=w*4;
  for (let y=1; y<h-1; y++){
    let j=(y*w+1)*4, i=y*w+1;
    for (let x=1; x<w-1; x++, j+=4, i++){
      const c =0.299*src[j]     +0.587*src[j+1]     +0.114*src[j+2];
      const rr=0.299*src[j+4]   +0.587*src[j+5]     +0.114*src[j+6];
      const dd=0.299*src[j+w4]  +0.587*src[j+w4+1]  +0.114*src[j+w4+2];
      if ((Math.abs(rr-c)+Math.abs(dd-c))*2 > thresh){
        sel[i]=1;
        if (x<minX)minX=x; if (x>maxX)maxX=x; if (y<minY)minY=y; if (y>maxY)maxY=y;
      }
    }
  }
} else {
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
}
if (maxX<0) return;                                  // nothing in range → nothing to push
const shade = ex.shade, mode = ex.mode|0;
const tint = ex.tint|0, tmix = (ex.tmix==null?0.7:ex.tmix);
const tintCol = tint>0 ? (t=> EXTRUDE_TINT_RGB[tint] || hypeLerp(EXTRUDE_TINT_TONE[tint], t, 1)) : null;
const dm = new Float32Array(w*h).fill(-1), from = new Int32Array(w*h).fill(-1);

if (mode===1){
  // Radial: every face pixel raycasts along its own direction (from/toward the radial centre). This
  // costs O(N_face * D) rather than the linear sweep the Angle path uses, but that's still fine at
  // typical Distance values. Later rays only overwrite earlier writes if they land nearer.
  const rcx=ex.cx*w, rcy=ex.cy*h, invert=(ex.invert|0)===1;
  for (let fy=0; fy<h; fy++) for (let fx=0; fx<w; fx++){
    const fi=fy*w+fx; if (!sel[fi]) continue;
    dm[fi]=0; from[fi]=fi;
    const vx=fx-rcx, vy=fy-rcy, rl=Math.hypot(vx,vy)||1;
    const stepx=(invert?-vx:vx)/rl, stepy=(invert?-vy:vy)/rl;
    for (let k=1; k<=D; k++){
      const nx=(fx+stepx*k)|0, ny=(fy+stepy*k)|0;
      if (nx<0||nx>=w||ny<0||ny>=h) break;
      const ni=ny*w+nx;
      if (sel[ni]) break;                           // ran into another face — that face owns from here
      if (dm[ni]<0 || dm[ni]>k){ dm[ni]=k; from[ni]=fi; }
    }
  }
} else {
  // Angle: sweep along the push direction so each pixel inherits its answer from the one behind it.
  // dist carries ray length in pixels so diagonals don't come out short.
  const a = ex.angle*Math.PI/180, dx = Math.cos(a), dy = Math.sin(a);
  const adx=Math.abs(dx), ady=Math.abs(dy);
  if (adx>=ady){                                    // mostly sideways → walk columns
    const step = dx>=0?1:-1, ky = dy/adx, per = 1/adx;
    for (let n=0;n<w;n++){
      const x = dx>=0 ? n : w-1-n;
      for (let y=0;y<h;y++){
        const i=y*w+x;
        if (sel[i]){ dm[i]=0; from[i]=i; continue; }
        const px=x-step, py=Math.round(y-ky);
        if (px<0||px>=w||py<0||py>=h) continue;
        const pi=py*w+px, pd=dm[pi];
        if (pd<0) continue;
        const nd=pd+per;
        if (nd>D) continue;
        dm[i]=nd; from[i]=from[pi];
      }
    }
  } else {                                          // mostly up/down → walk rows
    const step = dy>=0?1:-1, kx = dx/ady, per = 1/ady;
    for (let n=0;n<h;n++){
      const y = dy>=0 ? n : h-1-n;
      for (let x=0;x<w;x++){
        const i=y*w+x;
        if (sel[i]){ dm[i]=0; from[i]=i; continue; }
        const py=y-step, px=Math.round(x-kx);
        if (px<0||px>=w||py<0||py>=h) continue;
        const pi=py*w+px, pd=dm[pi];
        if (pd<0) continue;
        const nd=pd+per;
        if (nd>D) continue;
        dm[i]=nd; from[i]=from[pi];
      }
    }
  }
}
// 2. Paint. Face pixels stay untouched; the side (dm>0) is source-pixel × shade, then optionally
//    lerped toward Tint's colour by Tint Amount. Shade multiplies the tint colour too, so flat
//    tints (Black/White/Gold/Red) still fade with depth instead of being a solid colour cutout;
//    palette tints (Rainbow/Fire/Candy/Festive) cycle colour along t=depth/D → coloured stripes
//    down the side, and shade darkens them further as they recede.
//    The final side colour is written to the canvas via Side Blend (Replace/Screen/Multiply/Add/
//    Overlay) at Side Opacity, so the extruded body can be a solid replacement (the original
//    behaviour), a screened-on colour highlight, an add-blend glow, etc.
const bmode = ex.bmode|0, opacity = ex.opacity==null?1:ex.opacity;
for (let i=0;i<w*h;i++){
  if (dm[i]<=0) continue;                            // 0 is the face, -1 was never reached
  const t=dm[i]/D, f=1 - shade*t;
  const o=i*4, s2=from[i]*4;
  let r=src[s2]*f, g=src[s2+1]*f, b=src[s2+2]*f;
  if (tintCol && tmix>0){ const tc=tintCol(t);
    const tr=tc[0]*f, tg=tc[1]*f, tb=tc[2]*f;        // tint also fades with depth (keeps the shade gradient the user set)
    r+=(tr-r)*tmix; g+=(tg-g)*tmix; b+=(tb-b)*tmix;
  }
  if (bmode===0 && opacity>=0.999){                  // fast path: original behaviour byte-for-byte
    d[o]=r; d[o+1]=g; d[o+2]=b;
  } else {
    const br=extrudeBlend(bmode, d[o],   r);
    const bg=extrudeBlend(bmode, d[o+1], g);
    const bb=extrudeBlend(bmode, d[o+2], b);
    d[o]  =d[o]  +(br-d[o])  *opacity;
    d[o+1]=d[o+1]+(bg-d[o+1])*opacity;
    d[o+2]=d[o+2]+(bb-d[o+2])*opacity;
  }
}
ctx.putImageData(im,0,0);
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
function applyRgbShift(w,h,t,v,sliceOnly=null){
// RGB channel shift — VHS aberration = horizontal, Slice RGB = vertical (distinct axes)
const gl = state.glitch;
const hAb  = sliceOnly===true ? 0 : (v.on ? P('vhs','aberration')*(0.7+0.3*Math.sin(t)) : 0);   // horizontal shift (VHS)
const vRGB = sliceOnly===false ? 0 : (gl.on ? P('glitch','rgb') : 0);                            // vertical shift (Slice)
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
function applyStandaloneRgbSplit(w,h,phase){
  const s=state.rgbsplit;
  if (!(s && s.on && s.amount>0)) return;
  const base=ctx.getImageData(0,0,w,h), bd=base.data, out=ctx.createImageData(w,h), od=out.data;
  let dx=P('rgbsplit','x'), dy=P('rgbsplit','y');
  const amt=P('rgbsplit','amount'), mode=s.mode|0;
  if (mode===3||mode===4){ const a=P('rgbsplit','spin')*Math.PI*2*phase, c=Math.cos(a), q=Math.sin(a); [dx,dy]=[dx*c-dy*q,dx*q+dy*c]; }
  dx=Math.round(dx); dy=Math.round(dy);
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){
    const i=(y*w+x)*4, rx=Math.max(0,Math.min(w-1,x+dx)), bx=Math.max(0,Math.min(w-1,x-dx)), ry=Math.max(0,Math.min(h-1,y+dy)), by=Math.max(0,Math.min(h-1,y-dy));
    const ri=(ry*w+rx)*4, bi=(by*w+bx)*4;
    let R=bd[ri],G=bd[i+1],B=bd[bi+2];
    if(mode===4){
      const a=Math.atan2(dy,dx)+Math.PI*2/3, b=Math.atan2(dy,dx)+Math.PI*4/3, mag=Math.hypot(dx,dy);
      const gx=Math.max(0,Math.min(w-1,Math.round(x+Math.cos(a)*mag))), gy=Math.max(0,Math.min(h-1,Math.round(y+Math.sin(a)*mag)));
      const bx2=Math.max(0,Math.min(w-1,Math.round(x+Math.cos(b)*mag))), by2=Math.max(0,Math.min(h-1,Math.round(y+Math.sin(b)*mag)));
      G=bd[(gy*w+gx)*4+1]; B=bd[(by2*w+bx2)*4+2];
    }
    if(mode===1){ G=bd[bi+1]; B=bd[bi+2]; }
    if(mode===2){ G=bd[i+1]; B=bd[ri+2]; }
    const lum=(bd[i]*.299+bd[i+1]*.587+bd[i+2]*.114)/255, mx=Math.max(bd[i],bd[i+1],bd[i+2]), mn=Math.min(bd[i],bd[i+1],bd[i+2]);
    let gate=1, apply=s.apply|0;
    if(apply===1) gate=lum; else if(apply===2) gate=1-lum; else if(apply===4) gate=mx?(mx-mn)/mx:0;
    else if(apply===3){ const x2=Math.min(w-1,x+1), y2=Math.min(h-1,y+1), j=(y*w+x2)*4, k=(y2*w+x)*4; const l2=(bd[j]*.299+bd[j+1]*.587+bd[j+2]*.114)/255, l3=(bd[k]*.299+bd[k+1]*.587+bd[k+2]*.114)/255; gate=Math.min(1,Math.abs(lum-l2)+Math.abs(lum-l3)*1.5); }
    const rd=+s.radial||0, dxn=x/w-.5, dyn=y/h-.5, radial=rd?1-rd*Math.min(1,Math.hypot(dxn,dyn)*2):1, gain=Math.max(0,Math.min(1,amt*gate*radial));
    od[i]=bd[i]+(R-bd[i])*gain; od[i+1]=bd[i+1]+(G-bd[i+1])*gain; od[i+2]=bd[i+2]+(B-bd[i+2])*gain; od[i+3]=255;
  }
  ctx.putImageData(out,0,0);
}
