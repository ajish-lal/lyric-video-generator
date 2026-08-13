#!/usr/bin/env python
"""
DaVinci Resolve importer for the lyric-video plugin.

Reads a ``*.resolve.json`` produced by ``scripts/resolve/export-resolve.ts`` and
builds a timeline of animated **Text+** titles — one per word — with the baked
per-frame animation applied as Fusion keyframes.

HOW TO RUN (recommended, no environment setup):
  1. Open DaVinci Resolve 20, open/create a project.
  2. Workspace -> Console -> switch to the "Py3" tab.
  3. Paste:
        import sys
        sys.argv = ["resolve_import", r"/full/path/to/output/quick.resolve.json"]
        exec(open(r"/full/path/to/scripts/resolve/resolve_import.py").read())

RUN EXTERNALLY (advanced) after setting RESOLVE_SCRIPT_API / RESOLVE_SCRIPT_LIB /
PYTHONPATH per Blackmagic's README:
        python scripts/resolve/resolve_import.py output/quick.resolve.json

NOTES / LIMITATIONS (validate on your build):
  * Words are inserted sequentially as Text+ titles. This lands them contiguously,
    which matches the quick-render layout (uniform, back-to-back word slots). For
    audio-aligned configs with gaps, set the per-clip durations or add spacers.
  * Text+ "Size" is mapped as sizePx / frameHeight; tweak SIZE_SCALE to taste.
  * Animation is applied on a Transform node inserted after the Text+ node:
    Center <- position, Size <- scale, Blend <- opacity. Blur-in uses a Blur node.
"""

import json
import sys

# Text+ Size is a fraction of frame height, not pixels. Calibration factor.
SIZE_SCALE = 1.0

# Text+ has a separate "Style" input (weight/variant). Its default is often
# "Semibold", which most display fonts (e.g. Impact) don't provide -> "font not
# found" errors. "Regular" is the safe universal style. Override per font below.
DEFAULT_FONT_STYLE = "Regular"

# Optional per-font style overrides if a font's only face isn't called "Regular".
FONT_STYLE_OVERRIDES = {
    # "Some Font": "Book",
}


def get_resolve():
    """Return the Resolve app object, whether run in the Console or externally."""
    resolve_obj = globals().get("resolve")
    if resolve_obj is not None:
        return resolve_obj
    try:
        import DaVinciResolveScript as dvr  # type: ignore
        return dvr.scriptapp("Resolve")
    except Exception as exc:  # pragma: no cover - depends on Resolve env
        raise SystemExit(
            "Could not obtain the Resolve scripting object. Run this from the "
            "Resolve Console (Py3 tab), or set RESOLVE_SCRIPT_API / "
            "RESOLVE_SCRIPT_LIB / PYTHONPATH for external execution.\n" + str(exc)
        )


def hex_to_rgb01(hex_color):
    """'#rrggbb' -> (r, g, b) floats in 0..1."""
    h = hex_color.lstrip("#")
    if len(h) != 6:
        return (1.0, 1.0, 1.0)
    return tuple(int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))


def frames_to_timecode(frame, fps):
    """Whole-frame timecode HH:MM:SS:FF for a given absolute frame."""
    fps_i = int(round(fps))
    f = int(frame)
    ff = f % fps_i
    total_secs = f // fps_i
    ss = total_secs % 60
    mm = (total_secs // 60) % 60
    hh = (total_secs // 3600)
    return "%02d:%02d:%02d:%02d" % (hh, mm, ss, ff)


def load_export(path):
    with open(path, "r", encoding="utf-8") as handle:
        data = json.load(handle)
    if data.get("version") != 1:
        raise SystemExit("Unsupported resolve export version: %r" % data.get("version"))
    return data


def configure_project(project, data):
    """Apply fps / resolution so inserted titles land on the right frames."""
    project.SetSetting("timelineFrameRate", str(int(round(data["fps"]))))
    project.SetSetting("timelineResolutionWidth", str(int(data["width"])))
    project.SetSetting("timelineResolutionHeight", str(int(data["height"])))


def build_transform_chain(comp, has_blur):
    """
    Insert a Transform (and optional Blur) between the Text+ node ("Template")
    and the comp output ("MediaOut1"), returning (template, transform, blur).
    """
    template = comp.FindTool("Template")
    media_out = comp.FindTool("MediaOut1") or comp.FindTool("MediaOut")
    if template is None or media_out is None:
        return None, None, None

    transform = comp.AddTool("Transform", -32768, -32768)
    blur = comp.AddTool("Blur", -32768, -32768) if has_blur else None

    # Wire: Template -> [Blur] -> Transform -> MediaOut
    if blur is not None:
        blur.Input = template.Output
        transform.Input = blur.Output
    else:
        transform.Input = template.Output
    media_out.Input = transform.Output
    return template, transform, blur


def style_text(template, word, height):
    template.StyledText = word["text"]
    font = word["font"]
    template.Font = font
    # Text+ pairs Font with a Style/weight; an unsupported default (e.g.
    # "Semibold") triggers "font not found". Force a face the font actually has.
    template.Style = FONT_STYLE_OVERRIDES.get(font, DEFAULT_FONT_STYLE)
    template.Size = (word["sizePx"] / float(height)) * SIZE_SCALE
    r, g, b = hex_to_rgb01(word["colorHex"])
    template.Red1 = r
    template.Green1 = g
    template.Blue1 = b


def apply_keyframes(transform, blur, keys, frame_offset=0):
    """
    Set per-frame keyframes for Center, Size, Blend (and Blur softness).

    A Fusion Title clip's comp uses timeline-global frames, so a keyframe must be
    written at (clip start frame + comp-local frame). ``frame_offset`` is the
    clip's start frame on the timeline; without it the animation lands off-screen
    in time and nothing appears to move.
    """
    for k in keys:
        f = int(k["f"]) + int(frame_offset)
        # Center is a Point input; assign [x, y] at the (offset) frame.
        transform.Center[f] = [k["cx"], k["cy"]]
        transform.Size[f] = k["size"]
        transform.Blend[f] = k["blend"]
        if blur is not None:
            transform_blur = k.get("blur", 0.0)
            blur.XBlurSize[f] = transform_blur * 10.0


def import_words(timeline, data):
    fps = data["fps"]
    height = float(data["height"])
    words = data["words"]
    inserted = 0

    # Append each title at the running end of the timeline instead of jumping to
    # each word's absolute timecode. Jumping caused inserts to land *inside* the
    # previous (longer) default title clip, which ripple-splits it and scrambles
    # the order. Appending keeps words in sequence and never ripples earlier clips.
    cursor = 0

    for word in words:
        # Drop the next Text+ at the current end of the timeline.
        timeline.SetCurrentTimecode(frames_to_timecode(cursor, fps))
        item = timeline.InsertFusionTitleIntoTimeline("Text+")
        if not item:
            print("WARN: failed to insert Text+ for %r" % word["text"])
            continue

        comp = item.GetFusionCompByIndex(1)
        if comp is None:
            print("WARN: no Fusion comp for %r" % word["text"])
            continue

        has_blur = any("blur" in k for k in word["keys"])
        template, transform, blur = build_transform_chain(comp, has_blur)
        if template is None or transform is None:
            print("WARN: could not build node chain for %r" % word["text"])
            continue

        # Keyframes must be written at the clip's global timeline frame. Prefer
        # the item's real start; fall back to the running cursor.
        try:
            clip_start = int(item.GetStart())
        except Exception:
            clip_start = cursor

        # Lock the comp + batch as one undo so Fusion recomputes once instead of
        # on every keyframe write. This is the main speed win.
        comp.Lock()
        comp.StartUndo("lyric-word")
        try:
            style_text(template, word, height)
            apply_keyframes(transform, blur, word["keys"], clip_start)
        finally:
            comp.EndUndo(True)
            comp.Unlock()

        # Advance the cursor to the end of this clip so the next one appends
        # right after it (no overlap, no ripple).
        try:
            cursor = int(item.GetEnd())
        except Exception:
            cursor += int(word.get("durFrames", 1))
        inserted += 1

    return inserted


def main():
    if len(sys.argv) < 2:
        raise SystemExit("Usage: resolve_import.py <path/to/*.resolve.json>")
    path = sys.argv[1]
    data = load_export(path)

    resolve_obj = get_resolve()
    pm = resolve_obj.GetProjectManager()
    project = pm.GetCurrentProject()
    if project is None:
        raise SystemExit("Open a project in Resolve first.")

    configure_project(project, data)
    media_pool = project.GetMediaPool()
    timeline = media_pool.CreateEmptyTimeline("Lyrics - %s" % data.get("title", "video"))
    if timeline is None:
        raise SystemExit("Could not create a timeline.")
    project.SetCurrentTimeline(timeline)

    count = import_words(timeline, data)
    print("Inserted %d/%d animated Text+ titles onto '%s'." % (
        count, len(data["words"]), timeline.GetName()))


if __name__ == "__main__":
    main()
