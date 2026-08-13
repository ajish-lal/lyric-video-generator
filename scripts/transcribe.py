import argparse
import json

from faster_whisper import WhisperModel
import ctranslate2

parser = argparse.ArgumentParser()
parser.add_argument('--audio', required=True)
parser.add_argument('--output', required=True)
parser.add_argument('--model', default='small')
args = parser.parse_args()

def transcribe(device, compute_type):
    model = WhisperModel(args.model, device=device, compute_type=compute_type)
    # VAD is designed for speech. It removes quiet, sustained, and mixed sung vocals,
    # so it must stay off for music transcription.
    segments, _ = model.transcribe(
        args.audio,
        word_timestamps=True,
        vad_filter=False,
        beam_size=5,
        condition_on_previous_text=False,
        compression_ratio_threshold=2.8,
        log_prob_threshold=-1.5,
        no_speech_threshold=0.4,
    )
    return list(segments)

if ctranslate2.get_cuda_device_count() > 0:
    try:
        segments = transcribe('cuda', 'float16')
    except RuntimeError as error:
        print('CUDA Whisper unavailable; falling back to CPU:', error)
        segments = transcribe('cpu', 'int8')
else:
    segments = transcribe('cpu', 'int8')
payload = {'segments': [
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
]}
with open(args.output, 'w', encoding='utf-8') as output:
    json.dump(payload, output, ensure_ascii=False)
