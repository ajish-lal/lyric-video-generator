# Enhanced transcription quality (optional)

The lyric timing pipeline runs on **`faster-whisper`** alone out of the box. Two
optional stages sharpen word timing considerably, especially for real songs.
Each stage is **best-effort**: if its package isn't installed, the pipeline logs
a note and falls back to the previous behaviour — nothing crashes.

| Stage | Package | What it does | Toggle off |
|---|---|---|---|
| 1. Vocal isolation | `demucs` | Splits the vocal off the instrumental so Whisper isn't confused by the mix | `SEPARATE_VOCALS=0` |
| 2. Transcription | `faster-whisper` (required) | Core speech-to-text with word timestamps | — |
| 3. Forced alignment | `whisperx` | Re-times each word onto the audio (wav2vec2) for tight boundaries | `WORD_ALIGN=0` |

## Quick start

Everything is listed in [`scripts/requirements.txt`](../scripts/requirements.txt):

```bash
pip install -r scripts/requirements.txt
```

If the combined install fails (usually a WhisperX dependency conflict), install
in layers so the core still works and the optional stages are best-effort:

```bash
pip install faster-whisper      # required core
pip install demucs              # optional: vocal isolation
pip install whisperx            # optional: forced alignment
```

On Windows, the setup script does the same thing inside a virtualenv:

```powershell
scripts\setup-local-whisper.ps1
```

## Quality knobs (environment variables)

| Variable | Default | Effect |
|---|---|---|
| `WHISPER_MODEL` | `small` | `medium` or `large-v3` give much better timing on singing (bigger download, slower). |
| `SEPARATE_VOCALS` | `1` | Set `0` to skip Demucs vocal isolation. |
| `DEMUCS_MODEL` | `htdemucs` | Demucs model name. |
| `WORD_ALIGN` | `1` | Set `0` to skip WhisperX forced alignment. |

Example — highest quality on a GPU machine:

```bash
WHISPER_MODEL=large-v3 npm run dev -- create --audio input/song.mp3 --no-render
```

Example — fastest / lightest (core only):

```bash
SEPARATE_VOCALS=0 WORD_ALIGN=0 npm run dev -- create --audio input/song.mp3 --no-render
```

## Disk / download footprint

**Python packages** (one-time; dominated by PyTorch):

| Component | Approx size |
|---|---|
| PyTorch (CPU wheel) | ~0.2 GB |
| PyTorch (CUDA wheel) | ~2.5–3 GB |
| Demucs | ~50 MB (+ torch) |
| WhisperX (+ pyannote, transformers) | ~300–500 MB (+ torch) |

**Models** (downloaded on first run, cached under `~/.cache`):

| Model | Size |
|---|---|
| Demucs `htdemucs` | ~80 MB |
| Whisper `small` (default) | ~460 MB |
| Whisper `medium` | ~1.5 GB |
| Whisper `large-v3` | ~2.9 GB |
| WhisperX align (wav2vec2, English) | ~360 MB |

**Realistic totals:**
- CPU + `small`: **~2.5–3 GB**
- GPU + `large-v3`: **~7–8 GB**

## Windows notes

- `faster-whisper`, `ctranslate2`, and `demucs` ship prebuilt wheels — no
  compiler required.
- Plain `pip install torch` on Windows installs the **CPU** wheel (works, but no
  GPU). For CUDA, install the matching wheel from the
  [PyTorch index](https://pytorch.org/get-started/locally/) first.
- `whisperx` has the tightest dependency pins (pulls `pyannote.audio`,
  `transformers`, sometimes a pinned `numba`/`torch`). If the combined install
  fails, install it last on its own; the pipeline runs without it.
- Prefer a **Python 3.10 / 3.11** virtualenv if a 3.12 install of `whisperx`
  reports dependency errors.
- The wav2vec2 alignment model used here does **not** require a Hugging Face
  token. (Some other pyannote pipelines do — not used by this project.)

## How it degrades

The stages are independent. Any of these is a valid, working setup:

- `faster-whisper` only → original behaviour.
- `+ demucs` → cleaner input, better recognition.
- `+ whisperx` → precise per-word boundaries.

When you pass your own lyrics (`--input lyrics.txt`), the app keeps your exact
words and only adopts the audio timings; unmatched words are spread across the
gap weighted by syllable count. Better upstream timing (Demucs + WhisperX) makes
that mapping land more accurately.
