# Lyric Video — Config Reference

This document describes the **JSON configuration** that drives a render. It is
self-contained: give it (plus a set of lyrics) to an LLM and it can produce a
valid config file that you render with:

```bash
npx tsx src/cli.ts render <config.json> --output output/video.mp4
```

Validate without rendering:

```bash
npx tsx src/cli.ts validate <config.json>
```

List every available preset:

```bash
npx tsx src/cli.ts presets            # all categories
npx tsx src/cli.ts presets animation  # one category
```

You can also **generate** a starting config automatically from audio (it
transcribes for timing, aligns your lyrics file when given, inlines a template,
and writes the JSON) with the `create` command:

```bash
npx tsx src/cli.ts create --audio input/song.mp3 --input input/lyrics.txt --template nu-metal
# → writes output/song.json (edit it) and output/song.mp4
```

---

## 1. How authoring works (read this first)

- **Layered styling.** A word's final look is built by merging, in order:
  `typography` (global) → `sections[]` → `lines[]` → `words[]` / `wordStyles`.
  Later, more specific layers win. Only properties you set are applied; the rest
  fall through.
- **Presets are shortcuts.** `emphasis`, `animation`, `treatment`, and section
  `preset` names expand into concrete properties. You can still override any
  individual property after naming a preset.
- **One word on screen at a time.** The render shows words sequentially, timed
  from the lyrics. Font size is fixed per section (no auto-fit), so pick sizes
  that fit 1920×1080.
- **Resolution independent.** `fontSize`, positions and effects are authored at
  a 1080p reference and scaled to the output height.
- **No audio required.** If you don't set `audio`, the video is silent and word
  timings are derived from the lyrics file. To score it, add an audio file and
  set `"audio"`.

---

## 2. Top-level config

```jsonc
{
  "title": "Rise Again",              // optional label
  "audio": "input/song.mp3",          // optional; omit for a silent video
  "lyrics": "input/sample-lyrics.txt",// path to a lyrics text file
  "theme": "dark",                    // "dark" | "white"
  "resolution": { "width": 1920, "height": 1080, "fps": 30 },
  "preset": "…",                      // optional section-preset used as the global base
  "typography": { /* StyleProperties, see §3 */ },
  "animation": "fade_up",             // global default animation (name or object)
  "background": { /* Background, see §5 */ },
  "effects":    { /* Effects, see §6 */ },
  "musicViz":   { /* Music visualizer, see §13 */ },
  "sections":   [ /* SectionConfig, see §4 */ ],
  "lines":      [ /* optional per-line overrides */ ],
  "wordStyles": { "rise": "anger", "dark": { "color": "#9fdcff" } }
}
```

- **`lyrics`** points to a `.txt` file. Section headers in square brackets set
  the section `type`: `[Intro]`, `[Verse]`, `[Chorus]`, `[Bridge]`, etc. Lines
  under a header belong to that section.
- **`wordStyles`** matches by exact (case-insensitive) word text. The value is
  either an emphasis-preset name (`"anger"`) or a full style object.

---

## 3. StyleProperties (typography / per-section / per-word)

Every styling layer accepts this shape (all optional):

| Property | Type | Notes |
|---|---|---|
| `font` | string | Font family, e.g. `"Impact"`, `"Montserrat"`. |
| `fontSize` | number | px at 1080p reference. |
| `fontScale` | number | Multiplier on top of `fontSize` (emphasis presets use this). |
| `fontWeight` | number | 100–900. |
| `color` | string | `#RRGGBB`, `#RGB`, `0xRRGGBB`, or a basic name. |
| `opacity` | number | 0–1. |
| `position` | `{ x?: 0–1, y?: 0–1 }` | Normalized screen position (0.5,0.5 = center). |
| `scale` | number | Extra size multiplier (also scales stroke width). |
| `stroke` | boolean | Enable outline. |
| `strokeWidth` | number | px at 1080p reference. |
| `strokeColor` | string | Outline color. |
| `shadow` | boolean | Enable drop shadow. |
| `shadowColor` | string | Shadow color. |
| `shadowOpacity` | number | 0–1. |
| `shadowBlur` | number | Shadow offset/softness (px at 1080p). |
| `animation` | name or object | See §7. |
| `emphasis` | preset name | See §8. |
| `treatment` | preset name | See §9. |

> Reserved: `audioReaction` is validated but has **no runtime effect yet**
> (needs beat detection). Do not rely on it.

---

## 4. SectionConfig

Target lyric sections by `type` or `name`; if neither is set, sections match by
position.

```jsonc
{
  "type": "chorus",          // matches [Chorus] sections (case-insensitive)
  "name": "…",               // alternative selector (matches type or id)
  "style": {
    "preset": "heavy_chorus",// section preset (§10), optional
    "fontSize": 150,
    "animation": "impact",
    "background": "red_room" // section-scoped background preset or object
    /* + any StyleProperties */
  },
  "lines": [                 // optional per-line overrides within the section
    { "index": 0, "style": { "color": "#ffffff" },
      "words": [ { "text": "rise", "style": { "emphasis": "anger" } } ] }
  ]
}
```

---

## 5. Background

Either a **preset name** (string) or an object. Object fields:

| Field | Type | Notes |
|---|---|---|
| `preset` | string | Start from a background preset (§11), then override. |
| `color` | string | Base color. |
| `gradient` | string[] | 2–8 colors as `0xRRGGBB`, animated softly. |
| `image` | string | Path to a still image background. |
| `video` | string | Path to a looping video background. |
| `blur` | number | 0–1 (soft-focus the background). |
| `vignette` | number | 0–1 edge darkening. |
| `grain` | number | 0–1 background grain hint (final grain also comes from `effects.grain`). |
| `overlayColor` | string | Flat color wash over the background. |
| `overlayOpacity` | number | 0–1 strength of the wash. |

```jsonc
"background": {
  "preset": "industrial",
  "gradient": ["0x111114", "0x1c1c21", "0x0d0e11"],
  "vignette": 0.62
}
```

---

## 6. Effects (the cinematic grade)

Frame-level look. All optional; defaults reproduce the built-in cool grade.

| Field | Type | Range / typical | What it does |
|---|---|---|---|
| `bloom` | number | 0–1 (0.38) | Soft highlight glow. |
| `chromaticAberration` | number | 0–6 (2) | RGB edge fringing. `rgbSplit` is an alias. |
| `glitch` | number | 0–1 (0) | Adds temporal noise + widens aberration. |
| `vignette` | number | 0–1 (0.72) | Edge darkening. |
| `grain` | number | 0–100 (≈4–8) | Unified film grain over the whole frame. |
| `saturation` | number | 0–2 (0.55) | Color intensity. |
| `contrast` | number | ~0.8–1.4 (1.18) | Tonal contrast. |
| `bloom` | number | see above | |
| `scanlines` | boolean | false | CRT scanline overlay. |
| `pushIn` | number | 0–0.15 (0.06) | Slow zoom-in over the clip (0.06 = +6%). |
| `temperature` | number | -1…+1 (0) | Grade warmth: −1 cool/blue, +1 warm/orange. |
| `tint` | number | -1…+1 (0) | Grade tint: −1 green, +1 magenta. |

> `temperature`/`tint` map onto the internal color balance. Leaving them unset
> keeps the built-in cool look; set `temperature: 0` for a neutral grade.

---

## 7. Animation presets

Use as a name (`"impact"`) or an object to tune it:

```jsonc
"animation": { "preset": "impact", "duration": 0.12, "intensity": 1.2, "speed": 1 }
```

- `duration` — entrance time (s). `intensity` — scales travel/shake amplitude.
- `speed` — scales shake frequency.

**Behavior:** shakes are **phase-locked to the word's entry and decay** into a
burst (they don't buzz forever); pops ease-out with a subtle settle bounce;
fades use a smoothstep ramp.

| Name | Feel |
|---|---|
| `none`, `hard_cut` | Instant, no ease. |
| `fade`, `burn_in` | Opacity fade (burn_in lingers). |
| `fade_up` | Fade while drifting up. |
| `slide_up`, `slide_down` | Slide in from below/above. |
| `pop` | Quick pop with small bounce. |
| `punch_in`, `impact`, `smash` | Increasingly heavy drop-in hits (with a shake jab). |
| `rage`, `scream`, `shake`, `breakdown` | Aggressive shake bursts (varying px/Hz). |
| `whisper`, `ghost`, `void` | Slow, faint, translucent fades. |
| `glitch`, `corrupted`, `static_burst`, `crt`, `distort`, `distortion`, `static` | Digital glitch jitter. |
| `typewriter`, `blur_in` | Reveal / soft focus-in (approximated). |

**Tuning shake (code):** amount/speed live on each preset in
`src/customization/presets/animation.ts` (`shakePx`, `shakeHz`, `overshoot`).
How long a shake lasts is the decay constant `exp(-7*tt)` in
`src/providers/renderers/text-filter.ts` (lower = lingers longer).

---

## 8. Emphasis presets (per-word accents)

Applied via `emphasis` or directly as a `wordStyles` value.

| Name | Effect |
|---|---|
| `normal` | No change. |
| `subtle` | Slightly smaller / dimmer. |
| `emphasis` | +15% size, bold. |
| `strong` | +30% size, heavy, `impact` animation. |
| `shout` | +50% size, `smash` animation. |
| `scream` | +60% size, red `#ff304f`, `scream` animation. |
| `anger` | +35% size, red `#ff2530`, `impact` hit. |
| `whisper` | Smaller, faint, slow fade. |
| `cold` | Icy blue `#9fdcff`, ghostly fade. |
| `corrupted` | Green-ish, glitch treatment + animation. |

---

## 9. Treatment presets (stack on emphasis/animation)

`none`, `glitch`, `corrupted`, `ghost`, `static`, `distort`, `rgb_split`.
These mainly nudge the look and pick a matching glitch/ghost animation.

---

## 10. Section presets

| Name | Summary |
|---|---|
| `nu_metal_verse` | Impact 78, light gray, `fade_up`, `industrial` bg. |
| `heavy_chorus` | Impact 104, white, `impact`, `red_room` bg. |
| `scream_section` | 120, red, `scream`, `static` bg. |
| `breakdown` | 132, white, `breakdown`, `blackout` bg. |
| `dark_bridge` | 82, muted, `ghost`, `dark_grain` bg. |
| `dreamy_bridge` | 84, pale cyan, `fade`, `dark_grain` bg. |
| `final_chorus` | 112, white, `smash`, `red_room` bg. |

---

## 11. Background presets

| Name | Summary |
|---|---|
| `blackout` | Near-black, heavy vignette. |
| `industrial` | Charcoal gradient, moderate grain/vignette. |
| `crt` | Dark green with a faint green wash. |
| `static` | Dark, heavy grain. |
| `red_room` | Deep red gradient with a red wash. |
| `dark_grain` | Very dark, grainy. |
| `camcorder` | Dark with a faint blue wash. |
| `distorted` | Dark, grainy, softly blurred. |

---

## 12. Worked example (nu-metal, silent)

```jsonc
{
  "title": "Rise Again",
  "theme": "dark",
  "lyrics": "input/sample-lyrics.txt",
  "resolution": { "width": 1920, "height": 1080, "fps": 30 },
  "typography": {
    "font": "Impact", "color": "#f2f4f8",
    "shadow": true, "shadowColor": "#000000", "shadowOpacity": 0.72, "shadowBlur": 9
  },
  "background": {
    "preset": "industrial",
    "gradient": ["0x111114", "0x1c1c21", "0x0d0e11"],
    "vignette": 0.62
  },
  "effects": {
    "bloom": 0.4, "chromaticAberration": 3, "vignette": 0.62, "grain": 7,
    "saturation": 0.68, "contrast": 1.2, "pushIn": 0.08, "glitch": 0.03,
    "temperature": 0.1, "tint": 0
  },
  "wordStyles": {
    "rise": "anger",
    "louder": "shout",
    "dark": { "color": "#9fdcff", "animation": "fade" }
  },
  "sections": [
    { "type": "intro",  "style": { "color": "#c4ccd6", "fontSize": 90,  "animation": "fade_up" } },
    { "type": "verse",  "style": { "preset": "nu_metal_verse", "fontSize": 112, "animation": "fade_up" } },
    { "type": "chorus", "style": { "preset": "heavy_chorus",  "fontSize": 150, "animation": "impact" } }
  ]
}
```

---

## 13. Music visualizer (`musicViz`)

An optional audio-reactive strip (waveform / bars / spectrum) composited over
the finished frame with a neon glow and, optionally, a fading reflection. It is
screen-blended, so its black background drops out and only the bright waveform
shows. **Requires an `audio` track** — with no audio there is nothing to react
to and the visualizer is skipped.

```jsonc
"musicViz": {
  "enabled": true,
  "mode": "bars",            // "wave" | "bars" | "spectrum"
  "position": "bottom",      // "top" | "center" | "bottom"
  "colors": ["#eaeaea"],     // cycled across the wave/bars
  "glow": 4,                 // bloom strength (blur sigma); 0 disables
  "height": 0.15,            // strip height as a fraction of frame height
  "reflection": true          // fading mirrored copy beneath the strip
}
```

| Field | Type | Default | Notes |
|---|---|---|---|
| `enabled` | boolean | — | Must be `true` to render the visualizer. |
| `mode` | `wave` \| `bars` \| `spectrum` | `wave` | `wave` = centered line, `bars` = frequency bars, `spectrum` = scrolling spectrogram. |
| `position` | `top` \| `center` \| `bottom` | `bottom` | Where the strip sits. |
| `height` | number (0–1) | `0.18` | Strip height as a fraction of frame height. |
| `margin` | number (0–1) | `0.05` | Gap from the frame edge (fraction of height). |
| `colors` | string[] | cyan→pink | Colours cycled across the wave/bars. |
| `glow` | number | `8` | Neon bloom strength (blur sigma). Lower = crisper; `0` = off. |
| `reflection` | boolean | `false` | Adds a fading mirrored copy below the strip. |

**Tuning tips.** `glow` is the biggest lever on the "processed" look — at high
values the bloom bleeds across the gaps between bars. For a clean read, try
`glow: 2–4` with `reflection: false`; for full neon, raise `glow` and enable
`reflection`. Pure white (`#ffffff`) blooms hardest; a slightly dimmed white like
`#eaeaea` keeps bars distinct.

**CLI shortcuts** (an alternative to JSON; the JSON config wins if both are set):

```bash
# --viz [mode] enables it; --viz-color is repeatable; --viz-reflect adds a reflection
npx tsx src/cli.ts render <config.json> --output output/v.mp4 \
  --viz bars --viz-color "#eaeaea" --viz-reflect
```

To add or update the visualizer **as a separate step** (writes the `musicViz`
block into the config so you can render it, tweak, and re-render):

```bash
npx tsx src/cli.ts viz <config.json> bars --viz-color "#eaeaea" --viz-reflect --glow 4
npx tsx src/cli.ts viz <config.json> --off      # remove it again
```

---

## 14. Rules for generating a config (LLM checklist)

1. Set `lyrics` to the lyrics file path; do not inline lyrics unless asked.
2. Choose ONE `font` (Impact suits aggressive genres) and keep colors within a
   small palette; reserve one saturated color for the hook word only.
3. Give each `[Section]` a `sections[]` entry with a sensible `fontSize`
   (intro ≈ 80–95, verse ≈ 100–120, chorus ≈ 140–160 at 1080p).
4. Use `wordStyles` to accent 1–3 signature words (e.g. the hook) — prefer an
   emphasis preset (`anger`, `shout`) over ad-hoc styling.
5. Only use documented fields and preset names. Validate mentally against §3–§11.
6. Keep `effects` tasteful: grain 5–10, vignette 0.5–0.7, contrast 1.1–1.25,
   pushIn ≤ 0.1. Use `temperature`/`tint` only to correct color, not as a crutch.
7. Do not use `audioReaction` (reserved, no effect yet).
```
