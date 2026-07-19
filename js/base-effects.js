// Roll speed curve over the loop. The monotonic modes reach exactly 1 at phase 1, so the total
// travel matches the old linear roll and the loop closes the same way. Pendulum returns to 0 at
// both ends (a sway there and back), so it always closes regardless of speed.
function rollEase(p, mode){
  switch (mode|0){
    case 1: return p*p;                          // ease in — start slow, accelerate
    case 2: return 1-(1-p)*(1-p);                // ease out — start fast, settle
    case 3: return p*p*p*(p*(p*6-15)+10);        // ease in-out — slow, fast, slow (smootherstep)
    case 4: return Math.sin(p*Math.PI*2);        // pendulum — sway one way then back (loops at any speed)
    default: return p;                            // linear — constant speed (unchanged)
  }
}
function drawBaseFrame(w,h,phase,t,c,v,rl,fm,fseed){
// ---- base image into scratch canvas, with color/sepia filter ----
let fp = [];
if (c.on){ fp.push(`saturate(${c.saturate})`, `contrast(${c.contrast})`, `brightness(${P('color','bright')})`); if (c.hue) fp.push(`hue-rotate(${c.hue}deg)`); }
if (fm.on && fm.sepia>0){ fp.push(`sepia(${fm.sepia})`); }
// Pick the last successful stage in the real-codec pipeline. Every later pool already contains the
// earlier enabled stages, so selecting only the tail displays the complete stack once (not twice).
let base = img;
if (state.audio.on && audioReady && audioFrames.length){
  // pool is an intensity ramp (weak→strong): drive it by the destruction envelope when Amount's ⓔ
  // is on, else by a seamless triangle pulse so it still breathes.
  const an=audioFrames.length;
  const g = (state.motion.on && state.audio.amount_env)
    ? Math.max(0, Math.min(1, (ENV-0.12)/0.88))
    : 1-Math.abs(2*phase-1);
  base = audioFrames[Math.round(g*(an-1))];
}
else if (state.gifg.on && gifgReady && gifgFrames.length)
  base = gifgFrames[Math.floor(phase*gifgFrames.length) % gifgFrames.length];
else if (state.webp.on && webpReady && webpFrames.length)
  base = webpFrames[Math.floor(phase*webpFrames.length) % webpFrames.length];
else if (state.png.on && pngReady && pngFrames.length)
  base = pngFrames[Math.floor(phase*pngFrames.length) % pngFrames.length];
else if (state.jpeg.on && jpegReady && jpegFrames.length)
  base = jpegFrames[Math.floor(phase*jpegFrames.length) % jpegFrames.length];
tctx.clearRect(0,0,w,h);
tctx.filter = fp.length ? fp.join(' ') : 'none';
tctx.drawImage(base, 0, 0, w, h);
tctx.filter = 'none';

// ---- displacement: VHS wobble (selectable pattern — includes former film gate-weave = Jitter) ----
let ox=0, oy=0;
if (v.on && v.wobble>0){
  const A=v.wobble;
  switch (v.wobmode|0){
    case 1: {                                   // Pulse — periodic jolt that settles
      const n=3, u=(phase*n)%1, env=Math.exp(-u*7), pi=Math.floor(phase*n);
      ox=(rand(pi*1.7)*2-1)*A*env; oy=(rand(pi*2.9)*2-1)*A*0.5*env; break;
    }
    case 2:                                     // Jitter — nervous per-frame shake
      ox=(rand(fseed*1.3)*2-1)*A; oy=(rand(fseed*2.1)*2-1)*A*0.4; break;
    case 3: {                                   // Step — random positions held, jump per step
      const n=6, si=Math.floor(phase*n);
      ox=(rand(si*3.1)*2-1)*A; oy=(rand(si*4.7)*2-1)*A*0.4; break;
    }
    case 4:                                     // Drift — slow meander (snake)
      ox=A*(0.6*Math.sin(t)+0.4*Math.sin(t*2+1.3));
      oy=A*0.35*(0.6*Math.cos(t*1.5)+0.4*Math.sin(t*0.5)); break;
    default:                                    // Wave — smooth sine
      ox=Math.sin(t)*A; oy=Math.cos(t*2)*A*0.3;
  }
}

// ---- roll: wrap-around scroll (slides off one edge, back in the other) ----
let rollX = 0, rollY = 0;
if (rl.on){
  const e = rollEase(phase, rl.ease|0);          // shared speed curve for H and V
  let hx = e * rl.hspeed;
  if (rl.hstep>0){ const q = Math.max(1, Math.round(24*(1-rl.hstep))); hx = Math.round(hx*q)/q; }
  rollX = hx * w;
  rollY = e * rl.vspeed * h;
}

// ---- overscan: zoom in just enough to cover the wobble jitter, so the
//      shake never reveals the wrap seam. Roll keeps its intentional wrap
//      (the zoomed frame is zw×zh wide, so wrapping at that period stays seamless). ----
const wob = v.on ? v.wobble : 0, bld = v.on ? Math.ceil(v.bleed) : 0;
const mX = (wob>0 || bld>0) ? wob + bld + 1 : 0;       // max |ox| = wobble + bleed
const mY = (wob>0)          ? wob*0.5 + 1 : 0;         // max |oy| = up to 0.5·wobble
const zoom = Math.min(1.4, 1 + 2*Math.max(mX/w, mY/h, 0));   // overscan ONLY to hide wobble wrap seams
const zw = w*zoom, zh = h*zoom, baseX = -(zw-w)/2, baseY = -(zh-h)/2;   // (Zoom effect is applied last, post-FX)

ctx.clearRect(0,0,w,h);

// ---- VHS horizontal bleed ----
if (v.on && v.bleed>0){
  ctx.globalCompositeOperation = 'lighter';
  const steps = Math.ceil(v.bleed);
  for (let i=1;i<=steps;i++){
    ctx.globalAlpha = 0.25*(1 - i/steps);
    drawWrap(tmp, baseX+ox+rollX+i, baseY+oy+rollY, zw, zh);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}
drawWrap(tmp, baseX+ox+rollX, baseY+oy+rollY, zw, zh);

// clean plate for Region Mask: the pristine original image (so EVERY effect — incl. roll,
// wobble, JPEG/PNG base-glitch, colour grade — is confined to the mask region).
// Match the base's overscan scale (zw/zh) so the masked & unmasked regions never differ in size.
if (state.mask.on){ mclean.width=w; mclean.height=h; mcx.clearRect(0,0,w,h); mcx.drawImage(img, baseX, baseY, zw, zh); }

// ---- roll seam band (dark tear where the frame wraps) ----
if (rl.on && rl.band>0 && rl.vspeed!==0){
  const seamY = (((baseY+oy+rollY) % zh)+zh)%zh;
  const bh = Math.max(3, h*0.05*rl.band);
  ctx.save();
  ctx.globalCompositeOperation='overlay';
  ctx.globalAlpha = 0.5*rl.band;
  for (let y=0;y<bh;y++){ ctx.fillStyle = rand(y+fseed)>.5?'#fff':'#000'; ctx.fillRect(0,(seamY-bh+y),w,1); }
  ctx.restore();
  ctx.fillStyle = `rgba(0,0,0,${0.35*rl.band})`;
  ctx.fillRect(0, seamY-bh, w, bh);
}
}
