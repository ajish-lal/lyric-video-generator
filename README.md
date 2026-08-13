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

Lyrics are optional. When `--input` is omitted, the app uses local faster-whisper to extract timestamped lines from the audio. It is free and runs without an API key. Install the one-time local Python dependency first:

```bash
.\scripts\setup-local-whisper.ps1
npm run dev -- --audio input/demo.mp3 --output output/audio-visual.mp4
```

If `input/` contains exactly one audio file, `npm run dev` discovers it automatically and writes a same-named MP4 to `output/`.

To open the project-preview UI, run `npm run start:ui` and visit `http://localhost:3012`.

## Development

```bash
npm install
npm test
npm run build
```
