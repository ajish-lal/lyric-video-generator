# Workflow: Lyrics → Config → FX → Video

Plain, step-by-step process for turning lyrics (or audio) into a finished lyric video. A basic LLM only needs to do **Step 2**. Steps 1 and 3 are commands the user runs.

## The 3 steps

```
[1] Generate BASE config JSON   →   [2] LLM enriches with FX   →   [3] Render video
   (from lyrics.txt or audio)        (add presets by mood)          (final .mp4)
```

## Step 1 — Generate a base config (user runs)
Creates a plain `ProjectConfig` JSON with sections, lines, and word timings. No styling yet.

From a lyrics `.txt`:
```bash
npm run quick -- --input input/lyrics.txt --config-only
# writes output/lyrics.config.json
```
Or from audio — **transcribe only, no lyrics provided** (Whisper generates the words; needs local Whisper setup):
```bash
npm run dev -- create --audio input/song.mp3 --no-render
# writes output/song.json (words + timings straight from the transcript)
```
If you *do* have the exact lyrics, add `--input input/lyrics.txt` to keep your text but adopt the audio's timing.

## Step 2 — LLM adds FX (the LLM's job)
Give the base config JSON to an LLM with this instruction:

> Enrich this config by adding existing presets based on the **mood**, **specific words**, and **section**. Only use preset names from `docs/sections-and-config.md`. Do not invent new effects or change the lyrics/timing.

What the LLM may add (all optional, all documented in [sections-and-config.md](sections-and-config.md)):
- **Section styling** — set each section's `style.preset` (e.g. `heavy_chorus`), `animation`, `fontSize`, `background`.
- **Word emphasis** — `wordStyles` map, e.g. `{ "rise": "anger", "louder": "shout" }`.
- **Global effects grade** — `effects` block: `bloom`, `grain`, `vignette`, `contrast`, `saturation`, `pushIn`, `chromaticAberration`, `glitch`, `temperature`, `tint`.
- **Global look** — `typography`, `background`, or a project `preset`.

Rules for the LLM:
- Keep `text`, `start`, and `end` values unchanged (don't retime words).
- Only use preset names that exist in the registries.
- Match intensity to mood: calm → `fade`/`ghost`; heavy → `impact`/`smash`/`breakdown`.

## Step 3 — Render the final video (user runs)
```bash
npm run dev -- render output/lyrics.config.json --output output/lyrics.mp4
```

## Reference
Full section types, `ProjectConfig` shape, and every preset name: [sections-and-config.md](sections-and-config.md).
