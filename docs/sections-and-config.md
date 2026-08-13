# Sections & Config Standard

Canonical reference for how a project is structured and how to generate a config. An LLM can read this and emit a valid `ProjectConfig` JSON (or a lyrics `.txt`) that the renderer accepts.

## Two ways to define a project
1. **Lyrics file (`.txt`)** — plain lyrics with `[Section]` headings. Timing is auto-assigned. Simplest.
2. **Config JSON (`ProjectConfig`)** — full control: explicit sections, per-word timing, styles, effects, audio.

Both flow through the same renderer. Audio is optional — omit it for a silent video; include `"audio": "input/song.mp3"` to sync/pull duration from a track.

## Section types
Headings go in `[...]`. Recognized types (anything else → `unknown`, which uses the global style):

| Heading | Type |
|---|---|
| `[Intro]` | `intro` |
| `[Verse]`, `[Verse 1]` | `verse` |
| `[Chorus]`, `[Pre-Chorus]` | `chorus` |
| `[Bridge]` | `bridge` |
| `[Breakdown]` | `breakdown` |
| `[Outro]` | `outro` |

A template (e.g. `nu-metal`) maps each type to a coordinated look.

Lyrics file example:
```
[Intro]
City lights are calling out my name

[Chorus]
Rise again, we rise again
```

## `ProjectConfig` shape
Top-level keys (all optional unless noted):

| Key | Meaning |
|---|---|
| `title` | Project name. |
| `theme` | `dark` \| `white`. |
| `audio` | Path to audio track. Omit → silent video. |
| `lyrics` | Path to a lyrics `.txt` (instead of inline `sections`/`lines`). |
| `resolution` | `{ width, height, fps }`. |
| `preset` | Global base style preset. |
| `typography` | Global `StyleProperties` (font, color, shadow…). |
| `animation` | Global default animation. |
| `background` | Global background preset/object. |
| `effects` | Global grade: `bloom`, `grain`, `vignette`, `contrast`, `saturation`, `pushIn`, `chromaticAberration`, `glitch`, `temperature`, `tint`. |
| `sections` | Typed sections with lines/words. |
| `lines` | Inline lines (single implicit section) — use when there are no section types. |
| `wordStyles` | Map exact word (case-insensitive) → emphasis name or style object. |

Inline sections with explicit timing (seconds). Provide `words[]` with sequential `start`/`end` for word-by-word display:
```json
{
  "title": "song",
  "theme": "dark",
  "sections": [
    {
      "type": "verse",
      "style": { "preset": "nu_metal_verse", "fontSize": 90, "animation": "fade_up" },
      "lines": [
        {
          "text": "city lights are calling",
          "start": 0, "end": 4,
          "words": [
            { "text": "city",    "start": 0, "end": 1 },
            { "text": "lights",  "start": 1, "end": 2 },
            { "text": "are",     "start": 2, "end": 3 },
            { "text": "calling", "start": 3, "end": 4 }
          ]
        }
      ]
    }
  ]
}
```
If `words` is omitted, the line's words are auto-spread across `start`..`end`. If `start`/`end` are omitted, defaults are derived by index.

## Style layering
Styles cascade, later wins: **global → section → line → word**. Each `style` accepts: `preset`, `font`, `fontSize`, `fontWeight`, `color`, `opacity`, `animation`, `emphasis`, `background`, plus stroke/shadow props.

### Section presets (`style.preset`)
`nu_metal_verse`, `heavy_chorus`, `scream_section`, `breakdown`, `dark_bridge`, `dreamy_bridge`, `final_chorus`

### Emphasis presets (word-level: `emphasis` or `wordStyles`)
`normal`, `subtle`, `emphasis`, `strong`, `shout`, `scream`, `whisper`, `anger`, `cold`, `corrupted`

### Animation presets (`animation`)
`none`, `fade`, `fade_up`, `slide_up`, `slide_down`, `typewriter`, `pop`, `blur_in`, `punch_in`, `impact`, `smash`, `rage`, `scream`, `shake`, `whisper`, `ghost`, `void`, `burn_in`, `glitch`, `corrupted`, `static_burst`, `crt`, `distort`, `static`, `breakdown`, `hard_cut`

### Background presets (`style.background` or global `background`)
`blackout`, `industrial`, `crt`, `static`, `red_room`, `dark_grain`, `camcorder`, `distorted`

### Templates
`nu-metal`, `rock`, `pop`, `clean-light`, `cinematic`. Applied via `--template <name>` at render time; layers under explicit config (your settings win).

## Generate a config JSON from lyrics.txt
Turn a lyrics `.txt` into a `ProjectConfig` JSON (auto-timed, one word at a time) without rendering:
```bash
npm run quick -- --input input/lyrics.txt --config-only
```
Writes `output/lyrics.config.json` (named after the input). Options:
```bash
# custom output path (the .config.json name is derived from it)
npm run quick -- --input input/lyrics.txt --output output/song.mp4 --config-only

# bake in seconds-per-word, theme, and template
npm run quick -- --input input/lyrics.txt --sec 1 --bg dark --template nu-metal --config-only
```
Drop `--config-only` to also render the video in the same step.

## Generate a config JSON from audio (auto-transcribe)
Transcribe an audio track (local Whisper) into a timed config JSON. Add `--no-render` to only write the JSON:
```bash
npm run dev -- create --audio input/song.mp3 --no-render
```
Writes `output/song.json` with word timings from the transcript. This is **transcribe-only** — no lyrics file needed; Whisper generates the words. Options:
```bash
# align KNOWN lyrics to the audio timing (better text than raw transcription)
npm run dev -- create --audio input/song.mp3 --input input/lyrics.txt --no-render

# bake in a template + custom config path (omit --no-render to also render)
npm run dev -- create --audio input/song.mp3 --template nu-metal --config output/song.json

# auto-detect a single audio file in input/ (omit --audio)
npm run dev -- create --no-render
```
Prerequisite: the transcription path needs the local faster-whisper Python setup (`scripts/setup-local-whisper.ps1`, `scripts/requirements.txt`). Without it, use the lyrics `.txt` path above.

## Rendering
```bash
# From a config JSON
npm run dev -- render path/to/config.json --output output/song.mp4 [--template nu-metal]

# From a lyrics .txt (auto-timed, silent)
npm run dev -- --input input/song.txt --output output/song.mp4
```
