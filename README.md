# AI Lyric Video Generator

A modular TypeScript-based lyric video generation system designed around a provider-agnostic Project IR.

## Project layout

```
input/       Lyrics and audio supplied to the generator
output/      Generated videos and their metadata sidecars
src/         CLI, application logic, core models, renderer, and UI
tests/       Automated tests
```

## Usage

Render the included example (it includes a short demonstration audio track):

```bash
npm run dev -- --input input/sample-lyrics.txt --audio input/demo.mp3 --output output/demo.mp4
```

This creates a real H.264 MP4 and a separate `demo.mp4.json` metadata file.

Lyrics are optional. When `--input` is omitted, the app uses local faster-whisper to extract timestamped lines from the audio. It is free and runs without an API key. Install the one-time Python dependency first:

```bash
# Windows (PowerShell):
.\scripts\setup-local-whisper.ps1

# macOS / Linux: install the dependency listed in scripts/requirements.txt
python3 -m pip install -r scripts/requirements.txt
```

Then run:

```bash
npm run dev -- --audio input/demo.mp3 --output output/audio-visual.mp4
```

If `input/` contains exactly one audio file, `npm run dev` discovers it automatically and writes a same-named MP4 to `output/`.

### One-shot: audio → styled video → editable config (`create`)

The `create` command runs the whole workflow in one step: it transcribes the
audio for word-level timing, applies a template's look, writes a **self-contained
JSON config** you can tweak, and renders the video.

```bash
# Auto-transcribe the lyrics from the audio:
npx tsx src/cli.ts create --audio input/song.mp3 --template nu-metal --viz bars

# Use your own lyrics for 100% accurate words (timing is aligned from the audio):
npx tsx src/cli.ts create --audio input/song.mp3 --input input/lyrics.txt --template nu-metal
```

When `--input` is supplied, your lyrics text is kept exactly as written and the
whisper timestamps are *aligned* onto it (words are yours, timing is real). Use
`[Section]` headers (`[Verse]`, `[Chorus]`, …) to control per-section styling; a
header-less file is treated as a single verse. Outputs:

- `output/<name>.json` — a full, re-editable config (per-line and per-word
  `start`/`end`, inlined template styling, `musicViz`).
- `output/<name>.mp4` — the rendered video.

Edit the JSON and re-render any number of variants:

```bash
npx tsx src/cli.ts render output/<name>.json --output output/variant.mp4
```

### Staged workflow (granular control)

The steps above can be run separately when you want to review each stage before
moving on:

```bash
# 1. Generate the config only (transcribe + align + template), no video yet:
npx tsx src/cli.ts create --audio input/song.mp3 --input input/lyrics.txt --template nu-metal --no-render

# 2. Render the base video and check it looks right:
npx tsx src/cli.ts render output/song.json

# 3. Add the visualizer to the config once you're happy, then re-render:
npx tsx src/cli.ts viz output/song.json bars --viz-color "#eaeaea" --viz-reflect --glow 4
npx tsx src/cli.ts render output/song.json
```

`viz <config.json> [wave|bars|spectrum]` writes/updates the `musicViz` block in
the JSON (options: `--viz-color` repeatable, `--viz-reflect`, `--glow N`,
`--viz-height 0-1`, `--viz-position top|center|bottom`, `--off` to remove it). It
only edits the JSON — run `render` afterwards to produce the video.

### JSON-configured renders

For full control over typography, backgrounds, effects, and the music
visualizer, drive a render from a JSON config instead of flags:

```bash
npx tsx src/cli.ts render examples/viz-white.json --output output/viz.mp4
npx tsx src/cli.ts validate examples/viz-white.json   # check without rendering
npx tsx src/cli.ts presets                            # list every preset
```

The full config schema (typography, presets, effects, and the `musicViz`
visualizer) is documented in [docs/config-reference.md](docs/config-reference.md).

### Music visualizer

Add an audio-reactive strip (waveform / bars / spectrum) over the video. Enable
it in JSON via the `musicViz` block (see the config reference) or with CLI
flags on a render that has an audio track:

```bash
npx tsx src/cli.ts render <config.json> --output output/v.mp4 \
  --viz bars --viz-color "#eaeaea" --viz-reflect
```

`--viz [wave|bars|spectrum]` picks the style, `--viz-color` (repeatable) sets the
colours, and `--viz-reflect` adds a reflection. Tune `glow`/`reflection` in JSON
for a subtler or more neon look.

To open the project-preview UI, run `npm run start:ui` and visit `http://localhost:3012`.

## Development

```bash
npm install
npm test
npm run build
```
