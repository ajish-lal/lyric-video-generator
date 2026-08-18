# Generate config (`generate.config.json`)

Run the whole pipeline from a single JSON file — no CLI flags:

```bash
npm run generate                     # uses ./generate.config.json
npm run generate -- my-song.config.json
```

It transcribes the audio (WhisperX-aligned), optionally aligns your own lyrics,
writes a re-editable project config, and renders the video.

## Full example

```json
{
  "audio": "input/song.mp3",
  "lyrics": "",
  "output": "output/song.mp4",
  "config": "output/song.json",
  "render": true,
  "template": "",
  "resolution": { "width": 1920, "height": 1080, "fps": 30 },
  "encoder": "cpu",
  "transcription": {
    "model": "small",
    "separateVocals": true,
    "wordAlign": true,
    "demucsModel": "htdemucs",
    "leadSeconds": 0,
    "holdSeconds": 0
  },
  "wordDisplay": {
    "mode": "single-word",
    "hold": "next-word",
    "spacing": 0.25
  },
  "viz": {
    "enabled": false,
    "mode": "wave",
    "position": "bottom",
    "colors": ["#00e5ff"],
    "reflection": false
  }
}
```

## Top-level fields

| Field | Type | Default | Notes |
|---|---|---|---|
| `audio` | string | — (required) | Path to the audio file. Must exist. |
| `lyrics` | string | `""` | Optional `.txt` lyrics. Empty = Whisper generates the words; provided = your exact words, real timing. |
| `output` | string | `output/<audio>.mp4` | Rendered video path. |
| `config` | string | `output/<audio>.json` | The re-editable project config that gets written. |
| `render` | boolean | `true` | `false` writes only the config JSON, skips rendering. |
| `template` | string | `""` | One of: `nu-metal`, `rock`, `pop`, `cinematic`, `clean-light`. Empty = default look. |
| `resolution` | object | `1920×1080 @30` | `{ width, height, fps }`. |
| `encoder` | string | `cpu` | `cpu` (libx264) or `nvenc`/`gpu` (NVIDIA hardware). |

## `transcription`

Maps to the environment variables the Python transcriber reads.

| Field | Type | Default | Effect |
|---|---|---|---|
| `model` | string | `small` | `small` \| `medium` \| `large-v3`. Bigger = better timing on singing, larger download, slower. |
| `separateVocals` | boolean | `true` | Demucs vocal isolation before transcribing. |
| `wordAlign` | boolean | `true` | WhisperX (wav2vec2) forced alignment for tight word boundaries. |
| `demucsModel` | string | `htdemucs` | Demucs model name. |
| `leadSeconds` | number | `0` | Shows each word this many seconds **early** (start shifted earlier, clamped to the previous word / 0). |
| `holdSeconds` | number | `0` | Extends a held word's **end** by up to this much toward the next onset (covers sung vowels). `0` keeps the aligner's exact ends. |
| `interpolateWords` | boolean | `true` | Keep WhisperX tokens it couldn't place, interpolating their timing from neighbours. `false` drops them (older behaviour). |

Optional stages degrade gracefully: if Demucs or WhisperX isn't installed, the
run logs a note and falls back. See [enhanced-transcription.md](enhanced-transcription.md).

## `wordDisplay`

Controls how words appear per line.

| Field | Type | Default | Effect |
|---|---|---|---|
| `mode` | string | `single-word` | `single-word` shows one word at a time; `cumulative` appends words within a line (`The` → `The storms` → `The storms are` …). |
| `hold` | string | `next-word` | `next-word` keeps a word up until the next word starts; `word-end` clears it at the word's end. |
| `spacing` | number | `0.25` | Gap between words in cumulative mode. In the preview it's `em`; in the render each `0.25` maps to one extra space. |

## `viz`

Audio-reactive visualizer drawn over the frame (needs an audio track).

| Field | Type | Default | Effect |
|---|---|---|---|
| `enabled` | boolean | `false` | Turn the visualizer on. |
| `mode` | string | `wave` | `wave` \| `bars` \| `spectrum`. |
| `position` | string | `bottom` | `top` \| `center` \| `bottom`. |
| `colors` | string[] | `["#00e5ff"]` | Colours cycled across the waveform/bars. |
| `reflection` | boolean | `false` | Adds a fading mirrored reflection. |

## After generating

The written `config` JSON is fully re-editable. Load it (plus the audio) in the
timing editor (`npm run start:ui`) to fine-tune per-word timing, then export and
re-render. Sustained words automatically get a brighter, softer treatment; short
words a punchier one.
