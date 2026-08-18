"""Local vocal transcription with optional vocal isolation and forced alignment.

Pipeline (each stage degrades gracefully if its optional dependency is missing):
  1. Vocal separation (Demucs) - isolate the singing voice from the mix so
     Whisper is not confused by instruments. Off if `demucs` is not installed.
  2. Transcription (faster-whisper) - the always-required core.
  3. Forced alignment (WhisperX / wav2vec2) - re-time each word against the
     audio for far tighter word boundaries than raw Whisper timestamps. Off if
     `whisperx` is not installed.

Every optional stage can be toggled with a CLI flag or an env var, so the
Node side needs no changes to benefit; it just spawns this script.
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

from faster_whisper import WhisperModel
import ctranslate2


def _env_flag(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in ('1', 'true', 'on', 'yes')


def _log(*message: object) -> None:
    """Progress goes to stderr; the Node side only reads it when we fail."""
    print(*message, file=sys.stderr, flush=True)


# Smallest fallback span when interpolating unplaced word timings.
MIN_DURATION = 0.05


parser = argparse.ArgumentParser()
parser.add_argument('--audio', required=True)
parser.add_argument('--output', required=True)
# Bigger models (medium, large-v3) give noticeably better word timing on sung
# vocals; keep `small` as the fast default and let WHISPER_MODEL override it.
parser.add_argument('--model', default=os.environ.get('WHISPER_MODEL', 'small'))
parser.add_argument('--separate', dest='separate', action='store_true',
                    default=_env_flag('SEPARATE_VOCALS', True),
                    help='Isolate vocals with Demucs before transcribing.')
parser.add_argument('--no-separate', dest='separate', action='store_false')
parser.add_argument('--align', dest='align', action='store_true',
                    default=_env_flag('WORD_ALIGN', True),
                    help='Refine word timestamps with WhisperX forced alignment.')
parser.add_argument('--no-align', dest='align', action='store_false')
parser.add_argument('--interpolate', dest='interpolate', action='store_true',
                    default=_env_flag('WORD_INTERPOLATE', True),
                    help='Keep WhisperX tokens it could not place, interpolating '
                         'their timing. Off drops them (older behaviour).')
parser.add_argument('--no-interpolate', dest='interpolate', action='store_false')
args = parser.parse_args()


def pick_device() -> tuple[str, str]:
    """Prefer CUDA (float16) and fall back to CPU (int8)."""
    if ctranslate2.get_cuda_device_count() > 0:
        return 'cuda', 'float16'
    return 'cpu', 'int8'


def separate_vocals(audio_path: str, work_dir: str) -> str:
    """Return a vocals-only track via Demucs, or the original path on any failure."""
    if not args.separate:
        return audio_path
    try:
        import demucs  # noqa: F401  (import proves availability)
    except ImportError:
        _log('Demucs not installed; transcribing the full mix. '
             'Install it (pip install demucs) for tighter timing on music.')
        return audio_path

    out_dir = Path(work_dir) / 'demucs'
    model_name = os.environ.get('DEMUCS_MODEL', 'htdemucs')
    try:
        # `--two-stems=vocals` only renders vocals + accompaniment, which is much
        # faster than a full 4-stem split. Runs in the same interpreter/venv.
        subprocess.run(
            [sys.executable, '-m', 'demucs', '--two-stems', 'vocals',
             '-n', model_name, '-o', str(out_dir), audio_path],
            check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
    except (subprocess.CalledProcessError, OSError) as error:
        _log('Demucs separation failed; using the full mix instead:', error)
        return audio_path

    stem = out_dir / model_name / Path(audio_path).stem / 'vocals.wav'
    if stem.exists():
        _log('Using isolated vocal stem:', stem)
        return str(stem)
    _log('Demucs produced no vocal stem; using the full mix instead.')
    return audio_path


def transcribe(audio_path: str, device: str, compute_type: str):
    model = WhisperModel(args.model, device=device, compute_type=compute_type)
    # VAD is designed for speech. It removes quiet, sustained, and mixed sung
    # vocals, so it must stay off for music transcription.
    segments, info = model.transcribe(
        audio_path,
        word_timestamps=True,
        vad_filter=False,
        beam_size=5,
        condition_on_previous_text=False,
        compression_ratio_threshold=2.8,
        log_prob_threshold=-1.5,
        no_speech_threshold=0.4,
    )
    return list(segments), info


def to_payload(segments) -> list:
    return [
        {
            'text': segment.text.strip(),
            'start': segment.start,
            'end': segment.end,
            'words': [
                {'text': word.word, 'start': word.start, 'end': word.end}
                for word in (segment.words or [])
            ],
        }
        for segment in segments
    ]


def _interpolate_missing_times(tokens: list, seg_start, seg_end) -> None:
    """Fill start/end for tokens wav2vec2 couldn't place by spreading them evenly
    across the gap between their placed neighbours. Edits `tokens` in place so no
    word is lost. Runs with no placed anchor at all are left untouched."""
    n = len(tokens)
    anchors = [i for i, t in enumerate(tokens) if t['start'] is not None and t['end'] is not None]
    if not anchors:
        return

    lo = float(seg_start) if seg_start is not None else tokens[anchors[0]]['start']
    hi = float(seg_end) if seg_end is not None else tokens[anchors[-1]]['end']

    i = 0
    while i < n:
        if tokens[i]['start'] is not None and tokens[i]['end'] is not None:
            i += 1
            continue
        # Span of consecutive unplaced tokens [i, j).
        j = i
        while j < n and (tokens[j]['start'] is None or tokens[j]['end'] is None):
            j += 1
        left = tokens[i - 1]['end'] if i > 0 else lo
        right = tokens[j]['start'] if j < n else hi
        if right <= left:
            right = left + MIN_DURATION * (j - i + 1)
        step = (right - left) / (j - i + 1)
        for k in range(i, j):
            start = left + step * (k - i)
            tokens[k]['start'] = start
            tokens[k]['end'] = start + step
        i = j


def forced_align(payload: list, audio_path: str, language: str, device: str) -> list:
    """Snap each word onto the audio with WhisperX (wav2vec2). Falls back to the
    raw Whisper word timings if WhisperX (or an alignment model for the detected
    language) is unavailable."""
    if not args.align:
        return payload
    try:
        import whisperx
    except ImportError as error:
        # A broken transitive dependency (torch/numpy/pyannote mismatch) raises
        # ImportError here too, so report the real cause instead of assuming the
        # package is missing.
        _log(f'WhisperX import failed ({sys.executable}); keeping raw Whisper '
             f'word timings. Reason: {error!r}')
        return payload

    # WhisperX alignment runs on CPU fine; only load the model on CUDA when the
    # transcription already used it, to avoid a surprise second GPU allocation.
    align_device = device if device == 'cuda' else 'cpu'
    try:
        model_a, metadata = whisperx.load_align_model(language_code=language, device=align_device)
        audio = whisperx.load_audio(audio_path)
        segments_in = [
            {'start': seg['start'], 'end': seg['end'], 'text': seg['text']}
            for seg in payload if seg['text']
        ]
        if not segments_in:
            return payload
        result = whisperx.align(
            segments_in, model_a, metadata, audio, align_device,
            return_char_alignments=False,
        )
    except Exception as error:  # noqa: BLE001 - alignment is best-effort
        _log('WhisperX alignment failed; keeping raw Whisper word timings:', error)
        return payload

    aligned: list = []
    for seg in result.get('segments', []):
        # Keep every token with text; wav2vec2 leaves start/end off tokens it
        # couldn't place (digits, symbols, some sung syllables). Dropping them
        # loses words, so interpolate their timing from placed neighbours instead.
        tokens = []
        for word in seg.get('words', []):
            text = str(word.get('word', '')).strip()
            if not text:
                continue
            start = word.get('start')
            end = word.get('end')
            tokens.append({
                'text': text,
                'start': float(start) if start is not None else None,
                'end': float(end) if end is not None else None,
            })
        if not tokens:
            continue
        if args.interpolate:
            _interpolate_missing_times(tokens, seg.get('start'), seg.get('end'))
        words = [t for t in tokens if t['start'] is not None and t['end'] is not None]
        if not words:
            continue
        aligned.append({
            'text': ' '.join(w['text'] for w in words),
            'start': words[0]['start'],
            'end': words[-1]['end'],
            'words': words,
        })
    if not aligned:
        _log('WhisperX returned no aligned words; keeping raw Whisper timings.')
        return payload
    _log('Refined word timings with WhisperX forced alignment.')
    return aligned


def main() -> None:
    device, compute_type = pick_device()
    with tempfile.TemporaryDirectory(prefix='lyric-video-audio-') as work_dir:
        audio_path = separate_vocals(args.audio, work_dir)
        try:
            segments, info = transcribe(audio_path, device, compute_type)
        except RuntimeError as error:
            if device == 'cuda':
                _log('CUDA Whisper unavailable; falling back to CPU:', error)
                device, compute_type = 'cpu', 'int8'
                segments, info = transcribe(audio_path, device, compute_type)
            else:
                raise
        language = getattr(info, 'language', None) or 'en'
        payload = to_payload(segments)
        payload = forced_align(payload, audio_path, language, device)
        with open(args.output, 'w', encoding='utf-8') as output:
            json.dump({'segments': payload}, output, ensure_ascii=False)


if __name__ == '__main__':
    main()
