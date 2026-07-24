# GLITCH LOOPER — Working Notes for Claude

Browser-only glitch/loop tool. `index.html` opens directly (no build, no server), so JavaScript uses plain `<script src>` in a fixed order — NOT ES Modules.

## File map (only what you usually need)

- `js/config.js` — every effect's `{ id, name, hint, params:[{k,label,min,max,step,def,env,show}] }`. Adding/renaming a param starts here.
- `js/renderer.js` — the `drawFrame()` pipeline (order matters); scratch canvases; `rand()`; `P()` (envelope-applied reader).
- `js/state-ui.js` — `state` object auto-built from FX; `BROWSER_CAPS` probes.
- `js/controls.js` — `RAND_PROB` per-effect probability + `randomizeFX()` + HEAVY_TEMPORAL cap.
- Effect implementations live in files named after their category:
  `pixel-effects.js`, `analog-effects.js`, `digital-effects.js`, `signal-effects.js`, `distort-effects.js`, `screen-effects.js`, `base-effects.js`, `codecs.js`.
- `effects.html` — bilingual (EN/JP) reference doc. **Every effect edit needs a matching update here** (name, description, params line).

## Deploy

`git add … && git commit && git push origin main && npx wrangler deploy`. Cloudflare Worker at `glitch-looper-app.kagawa3.workers.dev`. Wrangler bundles the whole repo as static assets per `wrangler.jsonc`.

## Conventions

- **Loop is seamless**: any per-frame animation must repeat cleanly at `phase = 0` and `phase = 1`. Use integer turns/loop for spins, `phase * n` shape drivers, or `Math.floor(phase * rate)` for discrete ticks.
- **Pull, don't push**: for warp / reshape / tessellation effects, iterate DESTINATION pixels and sample the source, so no holes or overlaps.
- **`envF()` / `P()`**: use these — not `state.foo.bar` — for any param that has `env:1` so Envelope drives it.
- **Comments are for WHY / non-obvious constraints**, not what the code does. See existing effects for tone.
- **Params in `effects.html`**: format `Name — brief description · Name — brief description`. Keep hints in `config.js` short (~50 chars); long prose belongs in effects.html.
- **New effect checklist**:
  1. FX entry in `js/config.js` (with `env:1` on animatable amounts)
  2. Add id to the right `CATEGORIES` list at the bottom of `config.js`
  3. Implement `applyFooEffect(w,h,phase)` in the category-appropriate file
  4. Wire the call into `drawFrame()` at the right pipeline stage in `renderer.js`
  5. Entry in `effects.html` (EN + JP + Params line)
  6. Sensible `RAND_PROB[id]` in `controls.js` (0.05–0.15 for loud/destructive)
  7. `for f in js/*.js; do node -c "$f"; done` — syntax check before saying "done"

## Delegation — SAVE THE USER'S TOKENS

The user has cost concerns. Prefer cheap paths over doing it all in the main session.

- **File / symbol lookups → `Explore` (built-in, Haiku, read-only)**. Not `grep` dumps in the coordinator. Any question of the form "where is X defined / which file uses Y / list all effects that have Z" → send `Explore`.
- **Fork yourself** for open-ended research / audits so tool noise stays out of the main context. Never Read/tail the fork's output_file.
- **Boilerplate mirror edits → `effect-scribe` (Haiku)**. Mirroring a config change into `effects.html`, adding a `RAND_PROB` entry, updating a hint, adding a `show:` conditional — all mechanical, cheap.
- **Straightforward implementation → `effect-builder` (Sonnet)**. Adding a new effect from a fully-specified brief (params list, mechanism, file to touch, pipeline stage). The coordinator writes the brief; the builder writes the code.
- **Design decisions / debugging visual output / user dialogue → keep in coordinator**. Don't delegate what needs judgment or iteration with the user.

Rule of thumb: if the task boils down to "do X in Y file the way we always do it," delegate. If it needs figuring out what X should be, do it here.
