#!/bin/bash
# ============================================================
# DoppelFlex — Diagnostic Script
# Checks what was fixed and what still needs work
# Run: bash diagnose.sh
# ============================================================

PASS="✅"
FAIL="❌"
WARN="⚠️ "

echo ""
echo "════════════════════════════════════════════════════════"
echo "  DoppelFlex — Diagnostic Report"
echo "════════════════════════════════════════════════════════"

# ────────────────────────────────────────────────────────────
# SECTION 1: BACKEND — routes.py
# ────────────────────────────────────────────────────────────
echo ""
echo "── BACKEND (routes.py) ─────────────────────────────────"

ROUTES="src/api/routes.py"

# Lip sync
if grep -q "librosa_rms" "$ROUTES" 2>/dev/null; then
  echo "$PASS Lip sync — real librosa viseme extraction"
else
  echo "$FAIL Lip sync — still using mock data"
fi

# Export avatar
if grep -q "FBX_EXPORT_SUCCESS\|blender_cmd" "$ROUTES" 2>/dev/null; then
  echo "$PASS Export avatar — FBX via Blender + GLB/OBJ/PLY fallback"
else
  echo "$FAIL Export avatar — not patched"
fi

# Beatmap routes
if grep -q "save-beatmap" "$ROUTES" 2>/dev/null; then
  echo "$PASS Beatmap save/load/delete routes — present"
else
  echo "$FAIL Beatmap routes — missing"
fi

# Blender available
if command -v blender &>/dev/null; then
  BLENDER_VER=$(blender --version 2>/dev/null | head -1)
  echo "$PASS Blender installed — $BLENDER_VER (FBX export will work)"
else
  echo "$WARN Blender not installed — FBX falls back to GLB"
  echo "      Fix: sudo apt-get install -y blender"
fi

# MotionAudioSync model has song_name + bpm
if grep -q "song_name" src/api/models.py 2>/dev/null; then
  echo "$PASS MotionAudioSync model has song_name field"
else
  echo "$WARN MotionAudioSync model may be missing song_name/bpm columns"
  echo "      Fix: run flask db migrate && flask db upgrade"
fi

# ────────────────────────────────────────────────────────────
# SECTION 2: MOTION CAPTURE
# ────────────────────────────────────────────────────────────
echo ""
echo "── MOTION CAPTURE ──────────────────────────────────────"

MCS="src/front/js/component/MotionCaptureSystem.js"
ARG="src/front/js/component/AvatarRigPlayer3D.js"
MCP="src/front/js/pages/MotionCapturePage.js"
FBC="src/front/js/pages/FullBodyCapturePage.js"
RMS="src/front/js/pages/ReplayMotionSession.js"

# MotionCaptureSystem — WebSocket listener
if grep -q "socket.on('pose_update'" "$MCS" 2>/dev/null; then
  echo "$PASS WebSocket pose_update listener — wired in MotionCaptureSystem"
else
  echo "$FAIL WebSocket listener — missing from MotionCaptureSystem"
fi

# MotionCaptureSystem — externalStream prop
if grep -q "externalStream" "$MCS" 2>/dev/null; then
  echo "$PASS externalStream prop — present (multi-camera support)"
else
  echo "$FAIL externalStream prop — missing"
fi

# MotionCaptureSystem — faceFrame prop
if grep -q "faceFrame" "$MCS" 2>/dev/null; then
  echo "$PASS faceFrame prop — present (face expressions merged)"
else
  echo "$FAIL faceFrame prop — missing"
fi

# MotionCapturePage uses MotionCaptureSystem not LiveMoCapAvatar
if grep -q "MotionCaptureSystem" "$MCP" 2>/dev/null && ! grep -q "LiveMoCapAvatar" "$MCP" 2>/dev/null; then
  echo "$PASS MotionCapturePage — uses MotionCaptureSystem (correct pipeline)"
elif grep -q "LiveMoCapAvatar" "$MCP" 2>/dev/null; then
  echo "$FAIL MotionCapturePage — still using LiveMoCapAvatar (old pipeline)"
else
  echo "$WARN MotionCapturePage — could not verify"
fi

# AvatarRigPlayer3D — face bones
if grep -q "bones.jaw" "$ARG" 2>/dev/null; then
  echo "$PASS AvatarRigPlayer3D — jaw bone driven by frame.jawOpen"
else
  echo "$FAIL AvatarRigPlayer3D — jaw bone not wired"
fi

if grep -q "bones.leftEye" "$ARG" 2>/dev/null; then
  echo "$PASS AvatarRigPlayer3D — eye blink bones driven"
else
  echo "$FAIL AvatarRigPlayer3D — eye bones not wired"
fi

if grep -q "bones.leftBrow" "$ARG" 2>/dev/null; then
  echo "$PASS AvatarRigPlayer3D — brow bones driven"
else
  echo "$FAIL AvatarRigPlayer3D — brow bones not wired"
fi

# AvatarRigPlayer3D — visemes prop
if grep -q "visemes = \[\]" "$ARG" 2>/dev/null; then
  echo "$PASS AvatarRigPlayer3D — visemes prop for timed lip sync"
else
  echo "$FAIL AvatarRigPlayer3D — visemes prop missing"
fi

# FullBodyCapturePage passes faceFrame to MotionCaptureSystem
if grep -q "faceFrame" "$FBC" 2>/dev/null; then
  echo "$PASS FullBodyCapturePage — passes faceFrame to MotionCaptureSystem"
else
  echo "$FAIL FullBodyCapturePage — faceFrame not passed to MotionCaptureSystem"
  echo "      Fix needed: add faceFrame={faceExpressions} to <MotionCaptureSystem>"
fi

# Hand tracking merged into MotionCaptureSystem
if grep -q "useHandMocap\|HandMocap" "$MCS" 2>/dev/null; then
  echo "$PASS Hand tracking — merged into MotionCaptureSystem"
else
  echo "$FAIL Hand tracking — not merged into MotionCaptureSystem"
  echo "      Fix needed: import useHandMocap and merge hand data into pose frame"
fi

# ReplayMotionSession — scrubber
if grep -q "type=\"range\"" "$RMS" 2>/dev/null || grep -q "type='range'" "$RMS" 2>/dev/null; then
  echo "$PASS Session replay — scrubber present"
else
  echo "$FAIL Session replay — no scrubber"
fi

# ReplayMotionSession — loop toggle
if grep -q "loop" "$RMS" 2>/dev/null; then
  echo "$PASS Session replay — loop toggle present"
else
  echo "$FAIL Session replay — no loop toggle"
fi

# ReplayMotionSession — audio sync on scrub
if grep -q "audioRef.current.currentTime" "$RMS" 2>/dev/null; then
  echo "$PASS Session replay — audio syncs to scrubber position"
else
  echo "$FAIL Session replay — audio not synced to scrubber"
  echo "      Fix needed: set audioRef.current.currentTime = frames[idx].time on scrub"
fi

# layout.js — duplicate /full-capture fixed
FULLCAP_COUNT=$(grep -c 'path="/full-capture"' src/front/js/layout.js 2>/dev/null || echo 0)
if [ "$FULLCAP_COUNT" -eq 1 ]; then
  echo "$PASS layout.js — /full-capture route no longer duplicated"
elif [ "$FULLCAP_COUNT" -eq 0 ]; then
  echo "$WARN layout.js — /full-capture route not found"
else
  echo "$FAIL layout.js — duplicate /full-capture routes still present ($FULLCAP_COUNT found)"
fi

# ────────────────────────────────────────────────────────────
# SECTION 3: DANCE & MUSIC
# ────────────────────────────────────────────────────────────
echo ""
echo "── DANCE & MUSIC ───────────────────────────────────────"

DSP="src/front/js/pages/DanceSyncPage.js"
BEP="src/front/js/pages/BeatEditorPage.js"
BMP="src/front/js/pages/BeatMapEditorPage.js"

# Genre detection
if grep -q "detectGenre" "$DSP" 2>/dev/null; then
  echo "$PASS DanceSyncPage — BPM→genre detection present"
else
  echo "$FAIL DanceSyncPage — no genre detection"
fi

# Genre state wired to beat analysis
if grep -q "setGenre(detectGenre" "$DSP" 2>/dev/null; then
  echo "$PASS DanceSyncPage — genre auto-detected from beat analysis"
else
  echo "$FAIL DanceSyncPage — genre not wired to beat analysis result"
fi

# Dance frames built per genre
if grep -q "buildDanceFrames\|danceFrames" "$DSP" 2>/dev/null; then
  echo "$PASS DanceSyncPage — per-genre dance frame builder present"
else
  echo "$WARN DanceSyncPage — no per-genre dance frames (avatar may just bob)"
  echo "      Fix needed: add buildDanceFrames() function and wire to beatTimes"
fi

# AvatarRigPlayer3D used in DanceSyncPage (full body)
if grep -q "AvatarRigPlayer3D" "$DSP" 2>/dev/null; then
  echo "$PASS DanceSyncPage — uses AvatarRigPlayer3D (full body moves)"
else
  echo "$FAIL DanceSyncPage — not using AvatarRigPlayer3D (avatar won't move fully)"
  echo "      Fix needed: replace AnimatedAvatar with AvatarRigPlayer3D"
fi

# Visemes wired to audioRef in DanceSyncPage
if grep -q "audioRef" "$DSP" 2>/dev/null && grep -q "visemes" "$DSP" 2>/dev/null; then
  echo "$PASS DanceSyncPage — visemes passed to avatar with audioRef for timed lip sync"
else
  echo "$FAIL DanceSyncPage — visemes not wired to timed lip sync"
  echo "      Fix needed: pass visemes={visemes} audioRef={audioRef} to AvatarRigPlayer3D"
fi

# Save beatmap
if grep -q "handleSaveBeatmap\|save-beatmap" "$DSP" 2>/dev/null; then
  echo "$PASS DanceSyncPage — save beatmap button present"
else
  echo "$FAIL DanceSyncPage — no save beatmap"
fi

# BeatEditorPage — save/load/delete
if grep -q "handleSave" "$BEP" 2>/dev/null; then
  echo "$PASS BeatEditorPage — save function present"
else
  echo "$FAIL BeatEditorPage — no save function"
fi

if grep -q "loadSavedBeatmaps\|load-beatmaps" "$BEP" 2>/dev/null; then
  echo "$PASS BeatEditorPage — load saved beatmaps present"
else
  echo "$FAIL BeatEditorPage — no load beatmaps"
fi

if grep -q "handleDeleteBeatmap\|delete-beatmap" "$BEP" 2>/dev/null; then
  echo "$PASS BeatEditorPage — delete beatmap present"
else
  echo "$FAIL BeatEditorPage — no delete beatmap"
fi

# BeatEditorPage — delete marker button in JSX
if grep -q "deleteMarker\|setBeatMarkers.*filter" "$BEP" 2>/dev/null; then
  echo "$PASS BeatEditorPage — individual marker delete button"
else
  echo "$FAIL BeatEditorPage — no per-marker delete button in UI"
  echo "      Fix needed: add ✕ button next to each marker pill"
fi

# BeatEditorPage — drag markers
if grep -q "drag\|mousedown\|onDrag" "$BEP" 2>/dev/null; then
  echo "$PASS BeatEditorPage — drag-to-reposition markers"
else
  echo "$WARN BeatEditorPage — no drag-to-reposition (click-to-add only)"
fi

# BeatEditorPage — preview at marker
if grep -q "preview\|previewBeat\|handlePreview" "$BEP" 2>/dev/null; then
  echo "$PASS BeatEditorPage — preview avatar at marker"
else
  echo "$WARN BeatEditorPage — no avatar preview at marker position"
fi

# BeatMapEditorPage — save
if grep -q "handleSave\|save-beatmap" "$BMP" 2>/dev/null; then
  echo "$PASS BeatMapEditorPage — save present"
else
  echo "$FAIL BeatMapEditorPage — no save"
fi

# BeatMapEditorPage — delete marker
if grep -q "filter\|deleteMarker\|✕\|×" "$BMP" 2>/dev/null; then
  echo "$PASS BeatMapEditorPage — delete individual marker"
else
  echo "$FAIL BeatMapEditorPage — no per-marker delete button"
  echo "      Fix needed: add ✕ button to each marker pill"
fi

# ────────────────────────────────────────────────────────────
# SECTION 4: SUMMARY
# ────────────────────────────────────────────────────────────
echo ""
echo "── SUMMARY ─────────────────────────────────────────────"

PASS_COUNT=$(grep -c "^✅" <<< "$(bash "$0" 2>/dev/null)" 2>/dev/null || echo "?")
FAIL_COUNT=$(grep -c "^❌" <<< "$(bash "$0" 2>/dev/null)" 2>/dev/null || echo "?")

echo ""
echo "Things still needed for 100% Mocap + Dance:"
echo ""

python3 << 'PYEOF'
import subprocess, re

checks = {
    "FullBodyCapturePage passes faceFrame": ("src/front/js/pages/FullBodyCapturePage.js", "faceFrame"),
    "Hand tracking in MotionCaptureSystem": ("src/front/js/component/MotionCaptureSystem.js", "useHandMocap"),
    "Audio sync on replay scrub": ("src/front/js/pages/ReplayMotionSession.js", "audioRef.current.currentTime"),
    "buildDanceFrames in DanceSyncPage": ("src/front/js/pages/DanceSyncPage.js", "buildDanceFrames"),
    "AvatarRigPlayer3D in DanceSyncPage": ("src/front/js/pages/DanceSyncPage.js", "AvatarRigPlayer3D"),
    "Per-marker delete in BeatEditorPage": ("src/front/js/pages/BeatEditorPage.js", "deleteMarker"),
    "Per-marker delete in BeatMapEditorPage": ("src/front/js/pages/BeatMapEditorPage.js", "filter"),
    "Visemes wired to audioRef DanceSyncPage": ("src/front/js/pages/DanceSyncPage.js", "audioRef"),
    "Blender installed for FBX": (None, None),
}

needs_fix = []
all_good  = []

for label, (filepath, search) in checks.items():
    if filepath is None:
        import shutil
        if shutil.which("blender"):
            all_good.append(label)
        else:
            needs_fix.append(label)
        continue
    try:
        with open(filepath) as f:
            content = f.read()
        if search in content:
            all_good.append(label)
        else:
            needs_fix.append(label)
    except FileNotFoundError:
        needs_fix.append(f"{label} (file not found)")

print(f"  Already done ({len(all_good)}):")
for item in all_good:
    print(f"    ✅ {item}")

print(f"\n  Still needed ({len(needs_fix)}):")
for item in needs_fix:
    print(f"    ❌ {item}")

total = len(all_good) + len(needs_fix)
pct = int((len(all_good) / total) * 100) if total > 0 else 0
print(f"\n  Mocap + Dance completion: {pct}% ({len(all_good)}/{total} checks passing)")
PYEOF

echo ""
echo "════════════════════════════════════════════════════════"
echo "  Run:  bash fix_remaining.sh   (generated next)"
echo "════════════════════════════════════════════════════════"
echo ""
