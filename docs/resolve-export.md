# DaVinci Resolve export

Turn an LLM-enriched config JSON into a **DaVinci Resolve** timeline of animated
**Text+** titles — one per word, with the full per-word animation baked in. This
is a self-contained plugin: it never touches the FFmpeg render path.

Two steps: **(1)** export an intermediate JSON in Node, **(2)** import it inside
Resolve with a Python script.

## 1. Export the intermediate JSON (Node)

```bash
npm run export:resolve -- --config output/quick.config.json
```

Writes `output/quick.resolve.json` next to the config. Options:

| Flag | Description |
|---|---|
| `--config`, `-c` | Path to the customization config JSON (required). |
| `--output`, `-o` | Where to write the `*.resolve.json` (default: next to the config). |

The export contains `{ fps, width, height, words[] }`, where each word has its
text, frame range, font/size/color, section type, and a per-frame animation
track (`keys`) already in Resolve's coordinate space.

> Generate a config first with `npm run quick -- --input input/lyrics.txt --config-only`,
> optionally enrich it with an LLM (see `docs/sections-and-config.md`), then export.

## 2. Import into DaVinci Resolve (Python)

Recommended — no environment setup:

1. Open **DaVinci Resolve 20**, open or create a project.
2. **Workspace → Console**, switch to the **Py3** tab.
3. Paste (use full absolute paths):

   ```python
   import sys
   sys.argv = ["resolve_import", r"/full/path/to/output/quick.resolve.json"]
   exec(open(r"/full/path/to/scripts/resolve/resolve_import.py").read())
   ```

This creates a new timeline named `Lyrics - <title>` and inserts one animated
Text+ title per word.

### Running externally (advanced)

After setting `RESOLVE_SCRIPT_API`, `RESOLVE_SCRIPT_LIB`, and `PYTHONPATH` per
Blackmagic's scripting README:

```bash
python scripts/resolve/resolve_import.py output/quick.resolve.json
```

## What gets translated (and what doesn't)

**In:** word text, per-word timing, font, size, color, position, and **full
animation** (fade, fade-up, slide, pop with real scale, shake, glitch, blur-in).

**Out (by design):** background, color grade, bloom, grain, and vignette are
FFmpeg-only effects. Add those in Resolve — this matches the workflow where you
drop your own background video and grade in the editor.

## Tuning

- **Text size** — Text+ `Size` is mapped as `sizePx / frameHeight`. If titles
  look too big/small, adjust `SIZE_SCALE` at the top of
  `scripts/resolve/resolve_import.py`.
- **Word timing** — words are appended one after another in order. Each Text+
  clip keeps Resolve's default title length, so the line plays back-to-back
  (matching quick-render's contiguous layout). Slip the clips or trim on the Edit
  page if you need exact per-word source timing.

## Troubleshooting

- **"Font not found … Semibold"** — Text+ has a separate `Style` input whose
  default weight (e.g. Semibold) may not exist for your font. The importer forces
  `Style = "Regular"`. If a font's only face has another name, add it to
  `FONT_STYLE_OVERRIDES` in `resolve_import.py`.
- **Text shows but nothing animates** — keyframes must be written at the clip's
  global timeline frame, so the importer offsets them by the clip's start
  (`item.GetStart()`). If your Resolve build uses clip-local (0-based) comp time
  instead, set that offset to `0` in `import_words` (pass `0` to
  `apply_keyframes`).
- **Words out of order / import is slow** — titles are appended at the running
  end of the timeline (not inserted at absolute timecodes), which avoids
  ripple-splitting earlier clips. Keyframe writes are batched inside
  `comp.Lock()` / `comp.EndUndo()` so Fusion recomputes once per word.

## Files

- `scripts/resolve/export-resolve.ts` — Node exporter (via `npm run export:resolve`).
- `src/resolve/` — exporter module (schema, animation sampler, flattener).
- `scripts/resolve/resolve_import.py` — Resolve-side importer.
