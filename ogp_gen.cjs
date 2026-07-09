// GLITCH LOOPER OG image — matches the app's dark glitch aesthetic.
// Renders 1200x630 at 2x -> og.png (2400x1260).
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const fs = require('fs');

GlobalFonts.registerFromPath('/usr/share/fonts/truetype/ubuntu/UbuntuMono-B.ttf', 'UbuntuMono');
GlobalFonts.registerFromPath('/usr/share/fonts/truetype/ubuntu/UbuntuMono-R.ttf', 'UbuntuMonoR');

const SC = 2, W = 1200, H = 630;
const canvas = createCanvas(W * SC, H * SC);
const ctx = canvas.getContext('2d');
ctx.scale(SC, SC);

// app palette (from index.html :root)
const BG = '#0d0d10', FG = '#e6e6ee', MUT = '#8a8a9a', LINE = '#2c2c38';
const CYAN = '#66ccff', MAG = '#ff66cc';
const MONO = 'UbuntuMono', MONOR = 'UbuntuMonoR';

function rr(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// --- background ---
let g = ctx.createLinearGradient(0, 0, W, H);
g.addColorStop(0, '#0e0e13'); g.addColorStop(1, '#09090c');
ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
let rg = ctx.createRadialGradient(980, 100, 40, 980, 100, 760);
rg.addColorStop(0, 'rgba(90,180,255,.13)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
let rg2 = ctx.createRadialGradient(140, 600, 20, 140, 600, 560);
rg2.addColorStop(0, 'rgba(255,90,200,.07)'); rg2.addColorStop(1, 'rgba(0,0,0,0)');
ctx.fillStyle = rg2; ctx.fillRect(0, 0, W, H);
ctx.fillStyle = 'rgba(255,255,255,.020)';
for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);

// ---------- right: glitched "preview" panel ----------
(function preview() {
  const px = 704, py = 150, pw = 416, ph = 330;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 12;
  ctx.fillStyle = '#101014'; rr(px, py, pw, ph, 12); ctx.fill();
  ctx.restore();
  ctx.save();
  rr(px, py, pw, ph, 12); ctx.clip();
  // transparency checkerboard (like the app stage)
  const cs = 16;
  for (let y = py; y < py + ph; y += cs)
    for (let x = px; x < px + pw; x += cs) {
      ctx.fillStyle = (((x - px) / cs + (y - py) / cs) & 1) ? '#16161c' : '#101014';
      ctx.fillRect(x, y, cs, cs);
    }
  // synthetic "processed image": diagonal multi-stop gradient
  const ig = ctx.createLinearGradient(px, py, px + pw, py + ph);
  ig.addColorStop(0, '#3a2a6a'); ig.addColorStop(.35, '#2a6ad0');
  ig.addColorStop(.6, '#d94fa8'); ig.addColorStop(1, '#ff9a3d');
  ctx.globalAlpha = .92; ctx.fillStyle = ig; ctx.fillRect(px, py, pw, ph); ctx.globalAlpha = 1;
  // duotone-ish banding
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = i % 2 ? 'rgba(102,204,255,.10)' : 'rgba(255,102,204,.10)';
    ctx.fillRect(px, py + i * ph / 6, pw, ph / 6);
  }
  // glitch: horizontal slice displacement + RGB split
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 0; i < 9; i++) {
    const sy = py + rnd() * (ph - 18), sh = 6 + rnd() * 22, dx = (rnd() - .5) * 46;
    const band = ctx.getImageData((px) * SC, sy * SC, pw * SC, sh * SC);
    ctx.putImageData(band, (px + dx) * SC, sy * SC);
    // RGB split fringe
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = i % 2 ? 'rgba(255,0,120,.28)' : 'rgba(0,200,255,.28)';
    ctx.fillRect(px + dx + (i % 2 ? 6 : -6), sy, pw, sh);
    ctx.globalCompositeOperation = 'source-over';
  }
  // scanlines
  ctx.fillStyle = 'rgba(0,0,0,.18)';
  for (let y = py; y < py + ph; y += 3) ctx.fillRect(px, y, pw, 1);
  ctx.restore();
  ctx.strokeStyle = 'rgba(102,204,255,.6)'; ctx.lineWidth = 2;
  rr(px + 1, py + 1, pw - 2, ph - 2, 12); ctx.stroke();
  // little "REC ●" tag
  ctx.fillStyle = 'rgba(13,13,16,.72)'; rr(px + 12, py + 12, 92, 30, 8); ctx.fill();
  ctx.fillStyle = '#ff5a5a'; ctx.beginPath(); ctx.arc(px + 30, py + 27, 6, 0, 7); ctx.fill();
  ctx.fillStyle = FG; ctx.font = 'bold 15px ' + MONO; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText('LOOP', px + 44, py + 28);
})();

// ---------- left text ----------
const LX = 80;

// label chip
ctx.fillStyle = 'rgba(102,204,255,.12)'; rr(LX, 92, 232, 34, 17); ctx.fill();
ctx.fillStyle = CYAN; ctx.font = 'bold 15px ' + MONO; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
letterSpaced('BROWSER GLITCH TOOL', LX + 15, 110, 15, 'bold', MONO);

// glitch title helper
function glitchWord(text, x, y, size, main) {
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.font = 'bold ' + size + 'px ' + MONO;
  ctx.save(); ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = MAG; ctx.fillText(text, x - 5, y + 2);
  ctx.fillStyle = CYAN; ctx.fillText(text, x + 5, y - 1);
  ctx.restore();
  ctx.fillStyle = main; ctx.fillText(text, x, y);
  const w = ctx.measureText(text).width;
  const slices = [[0.28, 0.14, 11, CYAN], [0.66, 0.10, -13, MAG]];
  for (const [top, hF, dx, col] of slices) {
    const sy = y - size * 0.78, sh = size * hF, by = sy + size * 0.78 * top;
    ctx.save(); ctx.beginPath(); ctx.rect(x - 14, by, w + 28, sh); ctx.clip();
    ctx.fillStyle = BG; ctx.fillRect(x - 14, by, w + 28, sh);
    ctx.fillStyle = col; ctx.globalAlpha = .9; ctx.fillText(text, x + dx, y);
    ctx.globalAlpha = 1; ctx.fillStyle = main; ctx.fillText(text, x + dx * .4, y);
    ctx.restore();
  }
  return w;
}
glitchWord('GLITCH', LX, 268, 96, FG);
const lw = glitchWord('LOOPER', LX, 366, 96, CYAN);
// loop arrow ↺ (drawn, to avoid missing-glyph tofu)
(function loopArrow(cx, cy, r) {
  ctx.strokeStyle = MAG; ctx.lineWidth = 9; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI * 0.35, Math.PI * 1.75); ctx.stroke();
  const a = Math.PI * 0.35, ex = cx + Math.cos(a) * r, ey = cy + Math.sin(a) * r;
  ctx.fillStyle = MAG; ctx.beginPath();
  ctx.moveTo(ex + 13, ey - 2); ctx.lineTo(ex - 9, ey - 12); ctx.lineTo(ex - 4, ey + 12); ctx.closePath(); ctx.fill();
})(LX + lw + 44, 334, 26);

// tagline
ctx.fillStyle = MUT; ctx.font = '25px ' + MONOR; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
ctx.fillText('drop an image  ->  glitch it  ->  loop it', LX, 418);

// effect chips (real effects from the app)
const chips = ['DUOTONE', 'SOLARIZE', 'EMBOSS', 'POSTERIZE'];
let cx = LX; const cy = 470;
ctx.font = 'bold 16px ' + MONO; ctx.textBaseline = 'middle';
for (const c of chips) {
  const tw = ctx.measureText(c).width, pad = 14, cw = tw + pad * 2;
  ctx.strokeStyle = LINE; ctx.lineWidth = 1.5; rr(cx, cy - 17, cw, 34, 17); ctx.stroke();
  ctx.fillStyle = MUT; ctx.fillText(c, cx + pad, cy + 1);
  cx += cw + 12;
}

// footer
ctx.fillStyle = MUT; ctx.font = '18px ' + MONOR; ctx.textBaseline = 'alphabetic';
ctx.textAlign = 'left'; ctx.fillText('glitch.kagw.net', LX, H - 40);
ctx.textAlign = 'right'; ctx.fillText('by kagawa', W - 80, H - 40);

function letterSpaced(text, x, y, size, weight, family) {
  ctx.font = (weight ? weight + ' ' : '') + size + 'px ' + family;
  let c = x;
  for (const ch of text) { ctx.fillText(ch, c, y); c += ctx.measureText(ch).width + 2; }
}

fs.writeFileSync(__dirname + '/og.png', canvas.toBuffer('image/png'));
console.log('wrote og.png', fs.statSync(__dirname + '/og.png').size, 'bytes (2400x1260)');
