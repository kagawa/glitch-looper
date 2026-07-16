// ---------- effect parameter schema ----------
const FX = [
  { id:'vhs', name:'VHS', hint:'chroma shift · scanlines · bleed', on:false, open:false, params:[
    { k:'aberration', label:'Aberration (H)', min:0, max:20, step:.5, def:6, env:1, envd:1 },
    { k:'scanline',   label:'Scanlines', min:0, max:1,  step:.01, def:.35 },
    { k:'bleed',      label:'Bleed', min:0, max:12, step:.5, def:3 },
    { k:'tracking',   label:'Tracking', min:0, max:1, step:.01, def:.3, env:1 },
    { k:'wobble',     label:'Wobble', min:0, max:20, step:.5, def:5 },
    { k:'wobmode',    label:'Wobble Pattern', type:'select', def:0,
      options:[[0,'Wave'],[1,'Pulse'],[2,'Jitter'],[3,'Step'],[4,'Drift']] },
  ]},
  { id:'glitch', name:'Slice', hint:'horizontal slice shift + RGB split (visual, not real corruption)', on:false, open:false, params:[
    { k:'amount',   label:'Amount', min:0, max:1, step:.01, def:.4, env:1, envd:1 },
    { k:'slices',   label:'Slices', min:1, max:40, step:1, def:14 },
    { k:'shift',    label:'Shift', min:0, max:120, step:1, def:40, env:1, envd:1 },
    { k:'rgb',      label:'RGB Split (V)', min:0, max:30, step:.5, def:8, env:1, envd:1 },
  ]},
  { id:'noise', name:'Noise', hint:'grain', on:false, open:false, params:[
    { k:'grain',    label:'Grain',   min:0, max:1, step:.01, def:.18, env:1, envd:1 },
    { k:'flicker',  label:'Flicker',  min:0, max:1, step:.01, def:.1, env:1, envd:1 },
  ]},
  { id:'color', name:'Color', hint:'grade · fade', on:false, open:false, params:[
    { k:'saturate', label:'Saturation',   min:0, max:2, step:.01, def:1.2 },
    { k:'contrast', label:'Contrast', min:0, max:2, step:.01, def:1.1 },
    { k:'hue',      label:'Hue Rotate', min:-180, max:180, step:1, def:0 },
    { k:'tint',     label:'Tint (blue⇄orange)', min:-1, max:1, step:.01, def:0 },
    { k:'vignette', label:'Vignette', min:0, max:1, step:.01, def:.3 },
  ]},
  { id:'roll', name:'Roll', hint:'scroll / vertical roll (wraps around)', on:false, open:false, params:[
    { k:'hspeed', label:'H-Scroll', min:-2, max:2, step:.05, def:.3 },
    { k:'hstep',  label:'Step', min:0, max:1, step:.01, def:0 },
    { k:'vspeed', label:'V-Roll', min:-2, max:2, step:.05, def:0 },
    { k:'band',   label:'Roll Band', min:0, max:1, step:.01, def:.4 },
  ]},
  { id:'film', name:'Film 8mm', hint:'old film · dust · scratches · burn (shake = VHS Wobble)', on:false, open:false, params:[
    { k:'dust',    label:'Dust', min:0, max:1, step:.01, def:.4, env:1 },
    { k:'scratch', label:'Scratches', min:0, max:1, step:.01, def:.3, env:1 },
    { k:'sepia',   label:'Sepia', min:0, max:1, step:.01, def:.5 },
    { k:'burn',    label:'Burn/Flicker', min:0, max:1, step:.01, def:.3, env:1 },
  ]},
  { id:'mosh', name:'Datamosh (fake)', hint:'mimics gif-corruption look (not real data corruption)', on:false, open:false, params:[
    { k:'intensity', label:'Intensity',   min:0, max:1, step:.01, def:.5, env:1, envd:1 },
    { k:'blocks',    label:'Blocks', min:0, max:1, step:.01, def:.5 },
    { k:'bloom',     label:'Bloom (max repeat)', min:1, max:4, step:1, def:1 },
    { k:'sort',      label:'Pixel Sort', min:0, max:1, step:.01, def:.3 },
    { k:'chaos',     label:'Jitter', min:0, max:1, step:.01, def:.6 },
    { k:'rate',      label:'Change Rate', min:1, max:30, step:1, def:10 },
  ]},
  { id:'jpeg', name:'JPEG databend', hint:'real byte corruption · DCT block melt', on:false, open:false, params:[
    { k:'amount',  label:'Corruption', min:0, max:1, step:.01, def:.3 },
    { k:'quality', label:'Quality (coarse)', min:.05, max:.95, step:.01, def:.35 },
    { k:'frames',  label:'Frames', min:1, max:16, step:1, def:6 },
  ]},
  { id:'png', name:'PNG glitch', hint:'real · scanline-filter corruption (H/V/diagonal bleed + noise)', on:false, open:false, params:[
    { k:'amount', label:'Bleed (filter)', min:0, max:1, step:.01, def:.3 },
    { k:'noise',  label:'Random Noise', min:0, max:1, step:.01, def:.2 },
    { k:'dir',    label:'Bleed Dir', type:'select', def:0,
      options:[[0,'Mix'],[1,'Horizontal (Sub)'],[2,'Vertical (Up)'],[3,'Diagonal (Paeth)']] },
    { k:'frames', label:'Frames', min:1, max:16, step:1, def:6 },
  ]},
  { id:'compress', name:'Compression', hint:'heavy-JPEG look — blocky DCT · chroma bleed · banding', on:false, open:false, params:[
    { k:'amount', label:'Amount', min:0, max:1, step:.01, def:.6, env:1 },
    { k:'chroma', label:'Chroma Bleed', min:0, max:1, step:.01, def:.5 },
    { k:'ring',   label:'Ringing', min:0, max:1, step:.01, def:0, env:1 },
    { k:'block',  label:'Block', min:4, max:16, step:2, def:8 },
  ]},
  { id:'pixsort', name:'Pixel Sort', hint:'reorder runs of pixels by a chosen key (glitch-art staple)', on:false, open:false, params:[
    { k:'amount', label:'Amount', min:0, max:1, step:.01, def:.85, env:1 },
    { k:'key',    label:'Sort By', type:'select', def:0,
      options:[[0,'Lightness'],[1,'Hue'],[2,'Saturation'],[3,'Intensity'],[4,'Min RGB']] },
    { k:'ivl',    label:'Interval', type:'select', def:0,
      options:[[0,'Threshold'],[1,'Random'],[2,'Edges'],[3,'Waves'],[4,'Whole line']] },
    { k:'chance', label:'Sort Chance', min:0, max:1, step:.01, def:1 },
    // Threshold only feeds the two intervals that cut on the picture; Whole line has no run length
    { k:'thresh', label:'Threshold / Edge', min:0, max:1, step:.01, def:.5, show:s=> s.ivl===0 || s.ivl===2 },
    { k:'dir',    label:'Direction', type:'select', def:0, options:[[0,'Rows →'],[1,'Columns ↓'],[2,'Both']] },
    { k:'len',    label:'Max Length', min:0, max:1, step:.01, def:.6, show:s=> s.ivl!==4 },
  ]},
  { id:'databend', name:'Databend Shift', hint:'raw-byte / stride error — diagonal shear + rainbow', on:false, open:false, params:[
    { k:'amount',   label:'Amount', min:0, max:1, step:.01, def:.5, env:1 },
    { k:'skew',     label:'Skew', min:0, max:1, step:.01, def:.4 },
    { k:'scramble', label:'Scramble', min:0, max:1, step:.01, def:.4 },
    { k:'speed',    label:'Speed', min:0, max:8, step:1, def:2 },
  ]},
  { id:'bmpmisread', name:'BMP Row Misread', hint:'wrong row width · padding · bottom-up reinterpretation', on:false, open:false, params:[
    { k:'amount',  label:'Amount', min:0, max:1, step:.01, def:.75, env:1 },
    { k:'width',   label:'Width Error', min:-32, max:32, step:1, def:7 },
    { k:'padding', label:'Row Padding', min:0, max:24, step:1, def:4 },
    { k:'flip',    label:'Row Order', type:'select', def:0, options:[[0,'Top-down'],[1,'BMP bottom-up']] },
  ]},
  { id:'gif', name:'Indexed / GIF', hint:'256-colour palette · dither · scramble / colour-cycle / streaks', on:false, open:false, params:[
    { k:'colors', label:'Colours', min:2, max:64, step:1, def:16 },
    { k:'dither', label:'Dither', min:0, max:1, step:.01, def:.4 },
    { k:'glitch', label:'Palette FX', type:'select', def:0,
      options:[[0,'None'],[1,'Scramble'],[2,'Colour Cycle'],[3,'Index Streaks']] },
    { k:'amount', label:'FX Amount', min:0, max:1, step:.01, def:.5, env:1 },
  ]},
  { id:'sonify', name:'Sonify', hint:'audio-style databend on the raw byte stream — echo / reverse / reverb / tremolo', on:false, open:false, params:[
    { k:'mode',   label:'Effect', type:'select', def:0, options:[[0,'Echo'],[1,'Reverse'],[2,'Reverb'],[3,'Tremolo']] },
    { k:'amount', label:'Amount', min:0, max:1, step:.01, def:.5, env:1 },
    { k:'delay',  label:'Delay / Rate', min:1, max:100, step:1, def:30, env:1 },
  ]},
  { id:'byteshift', name:'Byte Shift', hint:'raw reinterpret — channel roll + diagonal shear', on:false, open:false, params:[
    { k:'amount', label:'Shift', min:0, max:1, step:.01, def:.4, env:1 },
    { k:'roll',   label:'Channel Roll', type:'select', def:1, options:[[0,'RGB'],[1,'GBR'],[2,'BRG']] },
    { k:'skew',   label:'Skew', min:0, max:1, step:.01, def:.3 },
  ]},
  { id:'bitplane', name:'Bit-plane', hint:'split bit planes — displace / XOR / drop for banded glitch', on:false, open:false, params:[
    { k:'mode',   label:'Mode', type:'select', def:0, options:[[0,'Plane Shift'],[1,'XOR'],[2,'Drop Low']] },
    { k:'amount', label:'Amount', min:0, max:1, step:.01, def:.5, env:1 },
    { k:'bits',   label:'Bit Split', min:2, max:7, step:1, def:6 },
  ]},
  { id:'webp', name:'WebP Databend', hint:'real WebP re-encode + byte corruption (VP8 predictive glitch)', on:false, open:false, params:[
    { k:'amount', label:'Corruption', min:0, max:1, step:.01, def:.3 },
    { k:'quality',label:'Quality', min:1, max:90, step:1, def:40 },
    { k:'frames', label:'Frames', min:1, max:12, step:1, def:6 },
  ]},
  { id:'gifg', name:'GIF Databend', hint:'real GIF encode + byte corruption — LZW image data & colour table (separate)', on:false, open:false, params:[
    { k:'data',    label:'Data (LZW)', min:0, max:1, step:.01, def:.5 },
    { k:'palette', label:'Palette', min:0, max:1, step:.01, def:.4 },
    { k:'frames',  label:'Frames', min:1, max:12, step:1, def:6 },
  ]},
  { id:'degauss', name:'Degauss', hint:'degaussing CRT — the picture ripples and the colour goes impure', on:false, open:false, params:[
    { k:'amount', label:'Amount', min:0, max:1, step:.01, def:.6, env:1 },
    { k:'sway',   label:'Screen Ripple', min:0, max:1, step:.01, def:.5, env:1 },
    { k:'freq',   label:'Shimmer', min:1, max:8, step:1, def:4 },
    { k:'color',  label:'Rainbow', min:0, max:1, step:.01, def:.7 },
    { k:'curve',  label:'Curve', type:'select', def:1,
      options:[[0,'Constant (never settles)'],[1,'Peak (settles)'],[2,'Pulse'],[3,'Build → Drop'],[4,'Stutter'],[5,'Swell'],[6,'Drop → Build'],[7,'Bounce'],[8,'Wander']] },
    { k:'rate',   label:'Rate', min:1, max:8, step:1, def:2, show:s=> [2,4,7,8].includes(s.curve|0) },
  ]},
  { id:'warp', name:'Warp', hint:'horizontal displacement — heat-haze / underwater / shear', on:false, open:false, params:[
    { k:'amp',   label:'Amplitude', min:0, max:10, step:.25, def:5, env:1 },
    // Jitter/Step have no spatial wave to set a frequency on, and Twist shears the whole frame;
    // Pulse swells in place, so it never reads a speed
    { k:'freq',  label:'Frequency', min:1, max:20, step:1, def:6, show:s=> ![2,3,5].includes(s.warpmode|0) },
    { k:'speed', label:'Speed', min:0, max:6, step:1, def:2, show:s=> (s.warpmode|0)!==1 },
    { k:'warpmode', label:'Pattern', type:'select', def:0,
      options:[[0,'Wave'],[1,'Pulse'],[2,'Jitter'],[3,'Step'],[4,'Drift'],[5,'Twist'],[6,'Beat'],[7,'Zigzag']] },
  ]},
  { id:'pixelate', name:'Pixelate', hint:'mosaic / retro blocks (Envelope can pulse block size)', on:false, open:false, params:[
    { k:'size', label:'Block Size', min:1, max:48, step:1, def:8, env:1 },
    { k:'mix',  label:'Mix', min:0, max:1, step:.01, def:1, env:1 },
    { k:'fade',  label:'Fade', type:'select', def:0,
      options:[[0,'Even'],[1,'Right'],[2,'Left'],[3,'Bottom'],[4,'Top'],[5,'Bright areas'],[6,'Dark areas']] },
    { k:'cover', label:'Coverage', min:0, max:1, step:.01, def:.5, env:1, show:s=> s.fade!==0 },
  ]},
  { id:'hud', name:'HUD / Text', hint:'REC ● · camcorder · TV / VCR on-screen text', on:false, open:false, params:[
    { k:'layout',  label:'Layout', type:'select', def:3,
      options:[[0,'REC ●'],[1,'▶ PLAY'],[2,'Timestamp'],[3,'Camcorder'],[4,'Security Cam'],
               [5,'TV Channel'],[6,'VCR Play'],[7,'ON AIR']] },
    { k:'color',   label:'Text Color', type:'select', def:0,
      options:[[0,'White'],[1,'Amber'],[2,'Green'],[3,'Red'],[4,'Cyan'],[5,'Black']] },
    { k:'size',    label:'Size', min:.5, max:2.5, step:.1, def:1 },
    { k:'opacity', label:'Opacity', min:0, max:1, step:.01, def:.9 },
  ]},
  { id:'bloom', name:'Bloom', hint:'glow / light bleed on highlights', on:false, open:false, params:[
    { k:'amount', label:'Amount', min:0, max:1, step:.01, def:.5, env:1 },
    { k:'size',   label:'Radius', min:1, max:30, step:1, def:8 },
  ]},
  { id:'halftone', name:'Halftone', hint:'dot-matrix / newsprint dots', on:false, open:false, params:[
    { k:'cell', label:'Cell Size', min:3, max:20, step:1, def:6 },
    { k:'bg',   label:'Background', type:'select', def:0, options:[[0,'Dark (LED)'],[1,'Light (print)']] },
    { k:'mix',  label:'Mix', min:0, max:1, step:.01, def:1, env:1 },
    { k:'fade',  label:'Fade', type:'select', def:0,
      options:[[0,'Even'],[1,'Right'],[2,'Left'],[3,'Bottom'],[4,'Top'],[5,'Bright areas'],[6,'Dark areas']] },
    { k:'cover', label:'Coverage', min:0, max:1, step:.01, def:.5, env:1, show:s=> s.fade!==0 },
  ]},
  { id:'crt', name:'CRT', hint:'tube curve · RGB phosphor mask · scanlines · convergence · glow', on:false, open:false, params:[
    { k:'amount',   label:'Curvature',     min:0, max:1, step:.01, def:.3 },
    { k:'round',    label:'Screen Bulge',  min:0, max:1, step:.01, def:.2 },
    { k:'corner',   label:'Corner Dark',   min:0, max:1, step:.01, def:.5 },
    { k:'frame',    label:'Bezel',         min:0, max:1, step:.01, def:.08 },
    { k:'mask',     label:'Phosphor', type:'select', def:1,
      options:[[0,'None'],[1,'Aperture Grille'],[2,'Shadow Mask'],[3,'Slot Mask']] },
    { k:'phosphor', label:'Mask Depth',    min:0, max:1, step:.01, def:.5, env:1 },
    { k:'scan',     label:'Scanlines',     min:0, max:1, step:.01, def:.4 },
    { k:'converge', label:'Convergence',   min:0, max:1, step:.01, def:.25, env:1 },
    { k:'glow',     label:'Phosphor Glow', min:0, max:1, step:.01, def:.3, env:1 },
  ]},
  { id:'sync', name:'Signal / Sync', hint:'horizontal-sync instability — diagonal skew · flagging · bad contact', on:false, open:false, params:[
    { k:'hsync',   label:'H-Sync',      min:-1, max:1, step:.01, def:0 },
    { k:'flag',    label:'Flagging',    min:0, max:1, step:.01, def:0, env:1 },
    { k:'contact', label:'Bad Contact', min:0, max:1, step:.01, def:0, env:1 },
  ]},
  { id:'ghost', name:'Ghosting', hint:'multipath echo — faint offset duplicate(s), can drift over the loop', on:false, open:false, params:[
    { k:'amount', label:'Amount', min:0, max:1, step:.01, def:.5, env:1 },
    { k:'offset', label:'Offset', min:2, max:80, step:1, def:22 },
    { k:'echoes', label:'Echoes', min:1, max:3, step:1, def:2 },
    { k:'pre',    label:'Pre-echo', min:0, max:1, step:.01, def:.3 },
    { k:'drift',  label:'Drift', min:0, max:1, step:.01, def:0 },
    { k:'rate',   label:'Drift Rate', min:1, max:4, step:1, def:1 },
  ]},
  { id:'dotcrawl', name:'Dot Crawl', hint:'composite cross-colour — rainbow shimmer on vertical edges', on:false, open:false, params:[
    { k:'amount', label:'Amount', min:0, max:1, step:.01, def:.6, env:1 },
    { k:'size',   label:'Dot Size', min:1, max:5, step:1, def:2 },
    { k:'speed',  label:'Crawl', min:1, max:12, step:1, def:6 },
  ]},
  { id:'hum', name:'Hum Bar', hint:'mains-hum brightness band rolling up the screen', on:false, open:false, params:[
    { k:'amount', label:'Darkness', min:0, max:1, step:.01, def:.4, env:1 },
    { k:'width',  label:'Band Width', min:0, max:1, step:.01, def:.4 },
    { k:'speed',  label:'Roll Speed', min:1, max:8, step:1, def:2 },
  ]},
  { id:'herring', name:'Herringbone', hint:'RF interference — moving diagonal weave', on:false, open:false, params:[
    { k:'amount', label:'Amount', min:0, max:1, step:.01, def:.4, env:1 },
    { k:'freq',   label:'Density', min:1, max:10, step:1, def:5 },
    { k:'speed',  label:'Drift', min:1, max:8, step:1, def:2 },
  ]},
  { id:'feedback', name:'Feedback Zoom', hint:'droste tunnel — nested copies that flow over the loop', on:false, open:false, params:[
    { k:'amount', label:'Amount', min:0, max:1, step:.01, def:.5, env:1 },
    { k:'zoom',   label:'Zoom (under 1 = nested)', min:.6, max:1.4, step:.01, def:.82 },
    { k:'copies', label:'Copies', min:2, max:8, step:1, def:5 },
    { k:'feather',label:'Edge Feather', min:0, max:1, step:.01, def:.35 },
    { k:'flow',   label:'Flow (steps/loop)', min:-3, max:3, step:1, def:1 },
    { k:'rotate', label:'Twist (° per step → slow spin)', min:-45, max:45, step:.5, def:8 },
    { k:'speed',  label:'Fast Spin (whole turns/loop)', min:-1, max:1, step:1, def:0 },
    { k:'pulse',  label:'Zoom Pulse', min:0, max:1, step:.01, def:0 },
  ]},
  { id:'melt', name:'Melt', hint:'pixel drip (breathes over the loop) — Drip or vertical Wrap', on:false, open:false, params:[
    { k:'amount', label:'Amount', min:0, max:1, step:.01, def:.4, env:1 },
    { k:'mode',   label:'Mode', type:'select', def:0, options:[[0,'Drip'],[1,'Wrap']] },
    { k:'width',  label:'Drip Width', min:1, max:16, step:1, def:1 },
    { k:'spread', label:'Spread', min:0, max:1, step:.01, def:.5 },
    { k:'curve',  label:'Curve', type:'select', def:1,
      options:[[1,'Peak'],[2,'Pulse'],[3,'Build → Drop'],[4,'Stutter'],[5,'Swell'],[6,'Drop → Build'],[7,'Bounce'],[8,'Wander']] },
    { k:'rate',   label:'Rate', min:1, max:8, step:1, def:2, show:s=> [2,4,7,8].includes(s.curve|0) },
  ]},
  { id:'emboss', name:'Emboss', hint:'directional relief — carved / raised metal look', on:false, open:false, params:[
    { k:'amount', label:'Amount', min:0, max:1, step:.01, def:.7, env:1 },
    { k:'angle',  label:'Light angle', min:0, max:360, step:15, def:135 },
    { k:'mix',    label:'Keep colour', min:0, max:1, step:.01, def:0 },
  ]},
  { id:'posterize', name:'Posterize', hint:'reduce colours — banding / retro (optional dither)', on:false, open:false, params:[
    { k:'levels', label:'Levels', min:2, max:12, step:1, def:5 },
    { k:'dither', label:'Dither', min:0, max:1, step:.01, def:0 },
  ]},
  { id:'duotone', name:'Duotone', hint:'map brightness to a 2-colour gradient', on:false, open:false, params:[
    { k:'preset', label:'Palette', type:'select', def:0,
      options:[[0,'Teal / Peach'],[1,'Blue / Orange'],[2,'Purple / Yellow'],[3,'Magenta / Cyan'],[4,'Green / Pink'],[5,'Mono']] },
    { k:'amount', label:'Amount', min:0, max:1, step:.01, def:.85, env:1 },
  ]},
  { id:'solarize', name:'Solarize', hint:'invert tones past a threshold (Sabattier)', on:false, open:false, params:[
    { k:'threshold', label:'Threshold', min:0, max:1, step:.01, def:.55 },
    { k:'amount',    label:'Amount', min:0, max:1, step:.01, def:.8, env:1 },
  ]},
  { id:'zoom', name:'Zoom', hint:'enlarge / overscan (also hides wobble wrap seams)', on:false, open:false, params:[
    { k:'amount', label:'Amount', min:0, max:1, step:.01, def:.3, env:1 },
  ]},
  { id:'mask', name:'Region Mask', hint:'confine effects to a rectangle — fixed / roaming / invertable', on:false, open:false, params:[
    { k:'source',   label:'Mask Source', type:'select', def:0, options:[[0,'Rectangle'],[6,'Roaming Rectangle'],[1,'Shadows'],[2,'Midtones'],[3,'Highlights'],[4,'Edges'],[5,'Noise']] },
    { k:'threshold',label:'Threshold', min:0, max:1, step:.01, def:.5, show:s=> s.source!==0 && s.source!==6 },
    { k:'mode',     label:'Mode', type:'select', def:0, options:[[0,'Fixed'],[1,'Roam']], show:()=>false },  // legacy: kept so old links still decode
    { k:'x0',       label:'X start %', min:0, max:100, step:1, def:20, show:s=> s.source===0 },
    { k:'x1',       label:'X end %',   min:0, max:100, step:1, def:80, show:s=> s.source===0 },
    { k:'y0',       label:'Y start %', min:0, max:100, step:1, def:20, show:s=> s.source===0 },
    { k:'y1',       label:'Y end %',   min:0, max:100, step:1, def:80, show:s=> s.source===0 },
    { k:'invert',   label:'Invert', type:'select', def:0, options:[[0,'Effects inside'],[1,'Effects outside']] },
    { k:'interval', label:'Roam Steps', min:1, max:12, step:1, def:4, show:s=> s.source===5 || s.source===6 },
    { k:'feather',  label:'Feather', min:0, max:1, step:.01, def:.08 },
  ]},
  { id:'motion', name:'Envelope', hint:'makes destruction breathe over the loop (pick targets via ⓔ)', on:false, open:false, params:[
    { k:'mode', label:'Curve', type:'select', def:1,
      options:[[0,'Constant'],[1,'Peak (crash mid)'],[2,'Pulse'],[3,'Build → Drop'],[4,'Stutter'],[5,'Swell'],[6,'Drop → Build'],[7,'Bounce'],[8,'Wander']] },
    { k:'depth', label:'Depth', min:0, max:1, step:.01, def:.7 },
    { k:'rate',  label:'Rate / Count', min:1, max:12, step:1, def:3, show:s=> [2,4,7,8].includes(s.mode|0) },
  ]},
];

// effect cards are shown grouped by sub-genre (order here = display order)
const FX_GROUPS = [
  ['Binary Glitch',   ['jpeg','png','webp','gifg','sonify','byteshift','bitplane']],
  ['Pixel Glitch',    ['glitch','mosh','compress','pixsort','databend','bmpmisread','gif']],
  ['Analog / Tape',   ['vhs','sync','roll','film','noise','ghost','dotcrawl','hum','herring']],
  ['Screen / Optics', ['crt','degauss','halftone','hud','bloom']],
  ['Distort',         ['warp','melt','feedback','pixelate']],
  ['Colour / Tone',   ['color','duotone','solarize','posterize','emboss']],
  ['Global',          ['zoom','mask','motion']],
];

const PRESETS = {
  // ---- Classic ----
  'VHS Tape':    { vhs:{on:1,aberration:8,scanline:.45,bleed:4,tracking:.4,wobble:7}, glitch:{on:0}, noise:{on:1,grain:.22,flicker:.15}, color:{on:1,saturate:1.1,contrast:1.05,hue:0,tint:.15,vignette:.4} },
  '8mm Film':    { vhs:{on:1,aberration:0,scanline:0,bleed:0,tracking:0,wobble:1,wobmode:2}, glitch:{on:0}, noise:{on:1,grain:.14,flicker:.2}, color:{on:1,saturate:.8,contrast:1.1,hue:0,tint:.1,vignette:.5}, film:{on:1,dust:.6,scratch:.5,sepia:.6,burn:.4}, roll:{on:0}, mosh:{on:0} },
  'Dreamy':      { vhs:{on:1,aberration:12,scanline:.1,bleed:8,tracking:.1,wobble:3}, glitch:{on:0}, noise:{on:1,grain:.08,flicker:.03}, color:{on:1,saturate:1.4,contrast:.95,hue:0,tint:-.3,vignette:.5} },
  'CRT':         { vhs:{on:1,aberration:5,scanline:0,bleed:2,tracking:.1,wobble:1}, glitch:{on:0}, noise:{on:1,grain:.1,flicker:.08}, color:{on:1,saturate:1.2,contrast:1.1,hue:0,tint:.05,vignette:.35}, crt:{on:1,amount:.35,round:.5,corner:.5,frame:.08,mask:2,phosphor:.5,scan:.5,converge:.3,glow:.35}, sync:{on:1,hsync:0,flag:0.15,contact:0.12} },
  'Trinitron':   { vhs:{on:1,aberration:4,scanline:0,bleed:2,tracking:.05,wobble:1}, glitch:{on:0}, noise:{on:1,grain:.05,flicker:.04}, color:{on:1,saturate:1.25,contrast:1.12,hue:0,tint:.03,vignette:.3}, film:{on:0}, roll:{on:0}, mosh:{on:0}, crt:{on:1,amount:.22,round:.35,corner:.45,frame:.09,mask:1,phosphor:.6,scan:.45,converge:.2,glow:.4} },
  'Dead Channel':{ vhs:{on:1,aberration:7,scanline:0,bleed:2,tracking:.6,wobble:5}, glitch:{on:0}, noise:{on:1,grain:.3,flicker:.35}, color:{on:1,saturate:.85,contrast:1.2,hue:0,tint:-.05,vignette:.5}, film:{on:0}, roll:{on:0}, mosh:{on:0}, crt:{on:1,amount:.3,round:.4,corner:.55,frame:.1,mask:2,phosphor:.5,scan:.4,converge:.5,glow:.3}, sync:{on:1,hsync:0.35,flag:0.55,contact:0.7}, motion:{on:1,mode:4,depth:.6,rate:5} },
  'Pixel Flow':  { vhs:{on:0}, glitch:{on:0}, noise:{on:1,grain:.05,flicker:.03}, color:{on:1,saturate:1.25,contrast:1.08,hue:0,tint:0,vignette:.3}, film:{on:0}, roll:{on:0}, mosh:{on:0}, pixsort:{on:1,amount:.9,thresh:.45,dir:1,len:.8} },
  'Databent':    { vhs:{on:1,aberration:5,scanline:0,bleed:2,tracking:.2,wobble:2}, glitch:{on:0}, noise:{on:1,grain:.1,flicker:.06}, color:{on:1,saturate:1.1,contrast:1.1,hue:0,tint:0,vignette:.3}, film:{on:0}, roll:{on:0}, mosh:{on:0}, compress:{on:1,amount:.6,chroma:.6,ring:.5,block:8}, databend:{on:1,amount:.9,skew:.5,scramble:.5,speed:2} },
  'Degauss':     { vhs:{on:1,aberration:4,scanline:0,bleed:2,tracking:.1,wobble:1}, glitch:{on:0}, noise:{on:1,grain:.06,flicker:.05}, color:{on:1,saturate:1.2,contrast:1.1,hue:0,tint:.03,vignette:.35}, film:{on:0}, roll:{on:0}, mosh:{on:0}, degauss:{on:1,amount:.7,sway:.6,freq:4,color:.7,curve:1,rate:2}, crt:{on:1,amount:.3,round:.4,corner:.5,frame:.09,mask:1,phosphor:.5,scan:.4,converge:.25,glow:.35} },
  'Backrooms':   { vhs:{on:1,aberration:4,scanline:.28,bleed:2,tracking:.22,wobble:2}, glitch:{on:0}, noise:{on:1,grain:.2,flicker:.14}, color:{on:1,saturate:.85,contrast:1.12,hue:12,tint:.4,vignette:.55}, film:{on:0}, roll:{on:0}, mosh:{on:0} },
  'Broken TV':   { vhs:{on:1,aberration:6,scanline:.45,bleed:2,tracking:.9,wobble:8}, glitch:{on:1,amount:.2,slices:18,shift:20,rgb:5}, noise:{on:1,grain:.35,flicker:.3}, color:{on:1,saturate:.7,contrast:1.15,hue:0,tint:0,vignette:.45}, roll:{on:1,hspeed:0,hstep:0,vspeed:.35,band:.6}, crt:{on:1,amount:.3,round:.45,corner:.5,frame:.07,mask:2,phosphor:.45,scan:.4,converge:.4,glow:.3}, sync:{on:1,hsync:0,flag:0.45,contact:0.5}, motion:{on:1,mode:4,depth:.6,rate:6} },
  // ---- Glitch ----
  'Digital Decay':{ vhs:{on:1,aberration:4,scanline:.15,bleed:1,tracking:.2,wobble:2}, glitch:{on:1,amount:.45,slices:22,shift:30,rgb:10}, noise:{on:1,grain:.1,flicker:.05}, color:{on:0}, compress:{on:1,amount:.5,chroma:.5,ring:.6,block:8} },
  'Datamosh':    { vhs:{on:0}, glitch:{on:0}, noise:{on:1,grain:.08,flicker:0}, color:{on:1,saturate:1.3,contrast:1.1,hue:0,tint:0,vignette:.2}, roll:{on:0}, film:{on:0}, mosh:{on:1,intensity:.75,blocks:.65,bloom:3,sort:.55,chaos:.85,rate:12} },
  'JPEG Databend':{ vhs:{on:0}, glitch:{on:0}, noise:{on:1,grain:.06,flicker:.05}, color:{on:0}, roll:{on:0}, film:{on:0}, mosh:{on:0}, jpeg:{on:1,amount:.35,quality:.3,frames:8}, png:{on:0} },
  'PNG Glitch':  { vhs:{on:0}, glitch:{on:0}, noise:{on:0}, color:{on:0}, roll:{on:0}, film:{on:0}, mosh:{on:0}, jpeg:{on:0}, png:{on:1,amount:.3,noise:.15,dir:0,frames:8} },
  'Roll Break':  { vhs:{on:1,aberration:6,scanline:.3,bleed:2,tracking:.5,wobble:4}, glitch:{on:1,amount:.22,slices:16,shift:18,rgb:6}, noise:{on:1,grain:.15,flicker:.1}, color:{on:0}, roll:{on:1,hspeed:1.5,hstep:.4,vspeed:.5,band:.5}, film:{on:0}, mosh:{on:0} },
  // ---- Horror ----
  'Cursed Tape': { vhs:{on:1,aberration:10,scanline:.5,bleed:3,tracking:.85,wobble:9}, glitch:{on:1,amount:.18,slices:20,shift:18,rgb:6}, noise:{on:1,grain:.4,flicker:.45}, color:{on:1,saturate:.55,contrast:1.35,hue:-25,tint:-.2,vignette:.75}, film:{on:1,dust:.35,scratch:.35,sepia:0,burn:.35}, roll:{on:1,hspeed:0,hstep:0,vspeed:.15,band:.4}, mosh:{on:0}, motion:{on:1,mode:4,depth:.7,rate:5} },
  'Haunted Film':{ vhs:{on:1,aberration:0,scanline:0,bleed:0,tracking:0,wobble:3,wobmode:2}, glitch:{on:0}, noise:{on:1,grain:.35,flicker:.5}, color:{on:1,saturate:.4,contrast:1.3,hue:15,tint:.15,vignette:.8}, film:{on:1,dust:.8,scratch:.7,sepia:.55,burn:.7}, roll:{on:0}, mosh:{on:0}, motion:{on:1,mode:2,depth:.6,rate:4} },
  'Corruption':  { vhs:{on:1,aberration:6,scanline:.2,bleed:1,tracking:.3,wobble:2}, glitch:{on:1,amount:.28,slices:24,shift:25,rgb:10}, noise:{on:1,grain:.2,flicker:.2}, color:{on:1,saturate:.7,contrast:1.2,hue:-40,tint:-.1,vignette:.7}, film:{on:0}, mosh:{on:1,intensity:.6,blocks:.7,bloom:2,sort:.4,chaos:.9,rate:14}, png:{on:1,amount:.25,noise:.15,dir:2,frames:8}, motion:{on:1,mode:3,depth:.8,rate:2} },
  'Red Room':    { vhs:{on:1,aberration:7,scanline:.35,bleed:2,tracking:.4,wobble:3}, glitch:{on:1,amount:.15,slices:14,shift:16,rgb:8}, noise:{on:1,grain:.25,flicker:.55}, color:{on:1,saturate:1.3,contrast:1.4,hue:-120,tint:.1,vignette:.7}, film:{on:0}, mosh:{on:0}, motion:{on:1,mode:2,depth:.7,rate:6} },
  'Meltdown':    { vhs:{on:1,aberration:6,scanline:.2,bleed:2,tracking:.25,wobble:3}, glitch:{on:0}, noise:{on:1,grain:.15,flicker:.15}, color:{on:1,saturate:.7,contrast:1.2,hue:-30,tint:-.1,vignette:.6}, film:{on:0}, mosh:{on:0}, warp:{on:1,amp:4,freq:5,speed:1}, melt:{on:1,amount:.55,width:10}, motion:{on:1,mode:1,depth:.6,rate:2} },
  // ---- Vivid ----
  'Y2K':         { vhs:{on:1,aberration:14,scanline:.2,bleed:5,tracking:.15,wobble:4}, glitch:{on:1,amount:.2,slices:20,shift:18,rgb:12}, noise:{on:1,grain:.12,flicker:.06}, color:{on:1,saturate:1.6,contrast:1.05,hue:0,tint:0,vignette:.25} },
  'Neon':        { vhs:{on:1,aberration:16,scanline:.3,bleed:4,tracking:.1,wobble:2}, glitch:{on:0}, noise:{on:1,grain:.1,flicker:.05}, color:{on:1,saturate:1.8,contrast:1.15,hue:60,tint:-.2,vignette:.5} },
  'Vaporwave':   { vhs:{on:1,aberration:11,scanline:.18,bleed:5,tracking:.1,wobble:3}, glitch:{on:0}, noise:{on:1,grain:.07,flicker:.04}, color:{on:1,saturate:1.7,contrast:1.0,hue:-35,tint:-.15,vignette:.4}, film:{on:0}, roll:{on:0}, mosh:{on:0} },
  'LED Board':   { vhs:{on:0}, glitch:{on:0}, noise:{on:0}, color:{on:1,saturate:1.6,contrast:1.1,hue:0,tint:0,vignette:.25}, halftone:{on:1,cell:7,bg:0}, bloom:{on:1,amount:.5,size:6} },
  'Arcade':      { vhs:{on:1,aberration:3,scanline:.55,bleed:1,tracking:.05,wobble:0}, glitch:{on:0}, noise:{on:1,grain:.06,flicker:.06}, color:{on:1,saturate:1.6,contrast:1.15,hue:0,tint:0,vignette:.35}, pixelate:{on:1,size:4}, bloom:{on:1,amount:.4,size:5}, crt:{on:1,amount:.4,round:.55,corner:.55,frame:.1,mask:1,phosphor:.6,scan:.55,converge:.15,glow:.4} },
  // ---- Camera / Scene ----
  'Security Cam':{ vhs:{on:1,aberration:3,scanline:.35,bleed:1,tracking:.15,wobble:1}, glitch:{on:0}, noise:{on:1,grain:.28,flicker:.1}, color:{on:1,saturate:.5,contrast:1.15,hue:-15,tint:-.05,vignette:.6}, film:{on:0}, roll:{on:0}, mosh:{on:0}, hud:{on:1,layout:4,size:1,opacity:.85} },
  'Camcorder':   { vhs:{on:1,aberration:5,scanline:.25,bleed:3,tracking:.3,wobble:5}, glitch:{on:0}, noise:{on:1,grain:.2,flicker:.12}, color:{on:1,saturate:1.1,contrast:1.05,hue:0,tint:.1,vignette:.4}, film:{on:0}, roll:{on:0}, mosh:{on:0}, hud:{on:1,layout:3,size:1,opacity:.9} },
  'Broadcast':   { vhs:{on:1,aberration:8,scanline:.4,bleed:3,tracking:.6,wobble:6}, glitch:{on:0}, noise:{on:1,grain:.2,flicker:.2}, color:{on:1,saturate:1.05,contrast:1.05,hue:0,tint:.05,vignette:.4}, film:{on:0}, roll:{on:1,hspeed:0,hstep:0,vspeed:.2,band:.5}, mosh:{on:0}, hud:{on:1,layout:0,color:0,size:1,opacity:.9} },
  'Fisheye Cam': { vhs:{on:1,aberration:3,scanline:.3,bleed:1,tracking:.15,wobble:1}, glitch:{on:0}, noise:{on:1,grain:.22,flicker:.1}, color:{on:1,saturate:.6,contrast:1.15,hue:-10,tint:-.05,vignette:.4}, film:{on:0}, roll:{on:0}, mosh:{on:0}, crt:{on:1,amount:.5,round:.4,corner:.6,frame:.1,mask:0,phosphor:0,scan:0,converge:0,glow:0}, hud:{on:1,layout:4,color:2,size:.9,opacity:.85} },
  'Analog TV':   { vhs:{on:1,aberration:5,scanline:0,bleed:2,tracking:.15,wobble:2}, glitch:{on:0}, noise:{on:1,grain:.08,flicker:.06}, color:{on:1,saturate:1.2,contrast:1.1,hue:0,tint:.04,vignette:.35}, film:{on:0}, roll:{on:0}, mosh:{on:0}, dotcrawl:{on:1,amount:.5,size:2,speed:6}, crt:{on:1,amount:.28,round:.4,corner:.5,frame:.09,mask:1,phosphor:.55,scan:.45,converge:.25,glow:.35}, sync:{on:1,hsync:0,flag:0.15,contact:0.1}, hud:{on:1,layout:5,color:0,size:1,opacity:.95} },
  'Bad Reception':{ vhs:{on:1,aberration:6,scanline:0,bleed:2,tracking:.3,wobble:3}, glitch:{on:0}, noise:{on:1,grain:.3,flicker:.18}, color:{on:1,saturate:.85,contrast:1.1,hue:0,tint:0,vignette:.45}, film:{on:0}, roll:{on:0}, mosh:{on:0}, ghost:{on:1,amount:.6,offset:26,echoes:2,pre:.4}, hum:{on:1,amount:.35,width:.4,speed:2}, herring:{on:1,amount:.3,freq:5,speed:2}, crt:{on:1,amount:.25,round:.35,corner:.5,frame:.08,mask:1,phosphor:.4,scan:.35,converge:.3,glow:.3}, sync:{on:1,hsync:0,flag:0.25,contact:0.2} },
  'Retro Game':  { vhs:{on:1,aberration:3,scanline:.4,bleed:0,tracking:0,wobble:0}, glitch:{on:0}, noise:{on:1,grain:.04,flicker:.16}, color:{on:1,saturate:1.5,contrast:1.15,hue:0,tint:0,vignette:.3}, film:{on:0}, roll:{on:0}, mosh:{on:0}, pixelate:{on:1,size:7}, hud:{on:0}, motion:{on:1,mode:2,depth:.5,rate:3} },
  'Underwater':  { vhs:{on:1,aberration:6,scanline:.1,bleed:4,tracking:.1,wobble:2}, glitch:{on:0}, noise:{on:1,grain:.08,flicker:.05}, color:{on:1,saturate:1.2,contrast:1.0,hue:120,tint:-.2,vignette:.5}, film:{on:0}, roll:{on:0}, mosh:{on:0}, warp:{on:1,amp:8,freq:5,speed:2}, degauss:{on:1,amount:.35,sway:.85,freq:2,color:.12,curve:0,rate:2}, hud:{on:0} },
  // ---- Lens / FX ----
  'Peephole':    { vhs:{on:1,aberration:4,scanline:.3,bleed:2,tracking:.1,wobble:2}, glitch:{on:0}, noise:{on:1,grain:.18,flicker:.08}, color:{on:1,saturate:.9,contrast:1.1,hue:0,tint:.05,vignette:.2}, crt:{on:1,amount:.95,round:.6,corner:.9,frame:.15,mask:0,phosphor:0,scan:0,converge:0,glow:0} },
  'Trip':        { vhs:{on:1,aberration:8,scanline:.1,bleed:4,tracking:.1,wobble:3}, glitch:{on:0}, noise:{on:1,grain:.05,flicker:.04}, color:{on:1,saturate:1.7,contrast:1.05,hue:90,tint:0,vignette:.35}, warp:{on:1,amp:7,freq:7,speed:3}, bloom:{on:1,amount:.5,size:8}, motion:{on:1,mode:2,depth:.6,rate:3} },
  'Newsprint':   { vhs:{on:0}, glitch:{on:0}, noise:{on:1,grain:.1,flicker:.05}, color:{on:1,saturate:.9,contrast:1.2,hue:0,tint:.05,vignette:.3}, halftone:{on:1,cell:6,bg:1} },
  'Dream Bloom': { vhs:{on:1,aberration:8,scanline:.1,bleed:6,tracking:.1,wobble:2}, glitch:{on:0}, noise:{on:1,grain:.06,flicker:.03}, color:{on:1,saturate:1.3,contrast:.95,hue:0,tint:-.2,vignette:.4}, bloom:{on:1,amount:.6,size:10} },
  'Heat Haze':   { vhs:{on:1,aberration:5,scanline:.1,bleed:3,tracking:.1,wobble:2}, glitch:{on:0}, noise:{on:1,grain:.07,flicker:.05}, color:{on:1,saturate:1.15,contrast:1.05,hue:15,tint:.25,vignette:.4}, warp:{on:1,amp:6,freq:4,speed:2} },
  'Wormhole':    { vhs:{on:1,aberration:10,scanline:.15,bleed:4,tracking:.1,wobble:2}, glitch:{on:0}, noise:{on:1,grain:.06,flicker:.03}, color:{on:1,saturate:1.5,contrast:1.05,hue:-60,tint:0,vignette:.5}, feedback:{on:1,amount:.6,zoom:.84,copies:6,flow:1,rotate:20,speed:0,pulse:.5} },
  // ---- Art ----
  'Cinematic':   { vhs:{on:0}, glitch:{on:0}, noise:{on:1,grain:.05,flicker:.02}, color:{on:1,saturate:1.0,contrast:1.1,hue:0,tint:0,vignette:.45}, bloom:{on:1,amount:.3,size:8}, duotone:{on:1,preset:0,amount:.7} },
  'Acid':        { vhs:{on:1,aberration:6,scanline:.1,bleed:2,tracking:.1,wobble:2}, glitch:{on:1,amount:.25,slices:16,shift:20,rgb:8}, noise:{on:1,grain:.06,flicker:.05}, color:{on:1,saturate:1.5,contrast:1.1,hue:40,tint:0,vignette:.3}, solarize:{on:1,threshold:.5,amount:.85} },
  'Risograph':   { vhs:{on:0}, glitch:{on:0}, noise:{on:1,grain:.12,flicker:.03}, color:{on:1,saturate:1.1,contrast:1.15,hue:0,tint:0,vignette:.35}, posterize:{on:1,levels:4,dither:.6}, duotone:{on:1,preset:1,amount:.55} },
  'Metal':       { vhs:{on:0}, glitch:{on:0}, noise:{on:1,grain:.04,flicker:.02}, color:{on:1,saturate:.8,contrast:1.3,hue:0,tint:0,vignette:.4}, emboss:{on:1,amount:.8,angle:135,mix:.4} },
  // ---- Reset ----
  'Clean':       { vhs:{on:0}, glitch:{on:0}, noise:{on:0}, color:{on:0} },
};
// select layout (group label → preset names)
const PRESET_GROUPS = [
  ['Classic', ['VHS Tape','8mm Film','Dreamy','CRT','Trinitron','Dead Channel','Broken TV','Backrooms']],
  ['Glitch',  ['Digital Decay','Datamosh','JPEG Databend','PNG Glitch','Databent','Pixel Flow','Roll Break']],
  ['Horror',  ['Cursed Tape','Haunted Film','Corruption','Red Room','Meltdown']],
  ['Vivid',   ['Y2K','Neon','Vaporwave','LED Board','Arcade']],
  ['Camera',  ['Security Cam','Camcorder','Broadcast','Analog TV','Bad Reception','Fisheye Cam','Retro Game','Underwater']],
  ['Lens/FX', ['Peephole','Trip','Newsprint','Dream Bloom','Heat Haze','Wormhole','Degauss']],
  ['Art',     ['Cinematic','Acid','Risograph','Metal']],
];

// duotone palettes: [shadow rgb, highlight rgb]
const DUO_PAIRS = [
  [[6,42,58],   [255,217,160]],   // Teal / Peach
  [[4,20,58],   [255,154,61]],    // Blue / Orange
  [[26,10,58],  [255,225,77]],    // Purple / Yellow
  [[42,10,42],  [77,240,255]],    // Magenta / Cyan
  [[4,34,15],   [255,143,208]],   // Green / Pink
  [[0,0,0],     [255,255,255]],   // Mono
];
