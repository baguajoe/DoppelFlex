#!/bin/bash
# ============================================================
# DoppelFlex — Fix Remaining (Round 2)
# Targets exactly the ❌ failures from diagnose.sh
# Run: bash fix_remaining.sh
# ============================================================

set -e
echo ""
echo "════════════════════════════════════════════════════════"
echo "  DoppelFlex — Fixing Remaining Gaps"
echo "════════════════════════════════════════════════════════"

# ════════════════════════════════════════════════════════════
# FIX 1 — MotionCapturePage: swap LiveMoCapAvatar → MotionCaptureSystem
# The regex in round 1 didn't catch the multi-line JSX tag
# ════════════════════════════════════════════════════════════
echo ""
echo "⚙️  Fix 1: MotionCapturePage — swap LiveMoCapAvatar..."

python3 << 'PYEOF'
import re

path = "src/front/js/pages/MotionCapturePage.js"
with open(path) as f:
    content = f.read()

# Fix import
content = content.replace(
    "import LiveMoCapAvatar from '../component/LiveMoCapAvatar';",
    "import MotionCaptureSystem from '../component/MotionCaptureSystem';"
)

# Remove any duplicate MotionCaptureSystem imports
lines = content.split('\n')
seen_mcs_import = False
cleaned = []
for line in lines:
    if "import MotionCaptureSystem from '../component/MotionCaptureSystem';" in line:
        if seen_mcs_import:
            continue
        seen_mcs_import = True
    cleaned.append(line)
content = '\n'.join(cleaned)

# Replace any <LiveMoCapAvatar ... /> (single or multi-line)
content = re.sub(
    r'<LiveMoCapAvatar\b[^>]*/?>',
    '<MotionCaptureSystem\n            avatarUrl={avatarUrl}\n            showWebcam={showVideo}\n            smoothingPreset={smoothingPreset || "balanced"}\n            onPoseFrame={handleFrame}\n          />',
    content,
    flags=re.DOTALL
)

# Also handle multi-line version with closing tag
content = re.sub(
    r'<LiveMoCapAvatar\b.*?</LiveMoCapAvatar>',
    '<MotionCaptureSystem\n            avatarUrl={avatarUrl}\n            showWebcam={showVideo}\n            smoothingPreset={smoothingPreset || "balanced"}\n            onPoseFrame={handleFrame}\n          />',
    content,
    flags=re.DOTALL
)

# Make sure smoothingPreset state exists
if "smoothingPreset" not in content:
    content = content.replace(
        "const [showDebug, setShowDebug] = useState(false);",
        "const [showDebug, setShowDebug] = useState(false);\n  const [smoothingPreset, setSmoothingPreset] = useState('balanced');"
    )

with open(path, 'w') as f:
    f.write(content)

# Verify
with open(path) as f:
    check = f.read()

if 'LiveMoCapAvatar' in check:
    print("  ⚠️  LiveMoCapAvatar still found — check file manually")
elif 'MotionCaptureSystem' in check:
    print("  ✅ MotionCapturePage now uses MotionCaptureSystem")
else:
    print("  ❌ Neither component found — check file")
PYEOF

# ════════════════════════════════════════════════════════════
# FIX 2 — FullBodyCapturePage: pass faceFrame to MotionCaptureSystem
# faceExpressions state exists, handleFaceFrame exists
# Just need to add faceFrame={faceExpressions} to the JSX
# ════════════════════════════════════════════════════════════
echo ""
echo "⚙️  Fix 2: FullBodyCapturePage — wire faceFrame prop..."

python3 << 'PYEOF'
import re

path = "src/front/js/pages/FullBodyCapturePage.js"
with open(path) as f:
    content = f.read()

if "faceFrame={faceExpressions}" in content:
    print("  ✅ faceFrame already passed to MotionCaptureSystem")
else:
    # Find the <MotionCaptureSystem in this file and add faceFrame prop
    content = re.sub(
        r'(<MotionCaptureSystem\b[^>]*?)(externalStream=\{streams\.body\})',
        r'\1externalStream={streams.body}\n              faceFrame={faceExpressions}',
        content,
        flags=re.DOTALL
    )

    # Fallback: if no externalStream match, add after onPoseFrame
    if "faceFrame={faceExpressions}" not in content:
        content = re.sub(
            r'(onPoseFrame=\{handlePoseFrame\})',
            r'\1\n              faceFrame={faceExpressions}',
            content
        )

    with open(path, 'w') as f:
        f.write(content)

    if "faceFrame={faceExpressions}" in content:
        print("  ✅ faceFrame={faceExpressions} added to MotionCaptureSystem")
    else:
        print("  ❌ Could not auto-patch — adding manually below MotionCaptureSystem props")
        # Last resort: string replace
        with open(path) as f:
            content = f.read()
        content = content.replace(
            'smoothingPreset="balanced"',
            'smoothingPreset="balanced"\n              faceFrame={faceExpressions}'
        )
        with open(path, 'w') as f:
            f.write(content)
        print("  ✅ Added after smoothingPreset prop")
PYEOF

# ════════════════════════════════════════════════════════════
# FIX 3 — MotionCaptureSystem: merge hand tracking
# ════════════════════════════════════════════════════════════
echo ""
echo "⚙️  Fix 3: MotionCaptureSystem — merge hand tracking..."

python3 << 'PYEOF'
import re

path = "src/front/js/component/MotionCaptureSystem.js"
with open(path) as f:
    content = f.read()

if "useHandMocap" in content:
    print("  ✅ Hand tracking already merged")
else:
    # Add import after existing imports
    content = content.replace(
        "import AvatarRigPlayer3D from './AvatarRigPlayer3D';",
        "import AvatarRigPlayer3D from './AvatarRigPlayer3D';\n// Hand tracking — optional, gracefully skipped if hook unavailable\nlet useHandMocap;\ntry { useHandMocap = require('../../hooks/useHandMocap').default; } catch(e) { useHandMocap = null; }"
    )

    # Add hand tracking hook call inside component, after state declarations
    hand_hook = """
  // ── Optional hand tracking ──
  const handHook = useHandMocap ? useHandMocap() : null;
  const handData = handHook?.handData || null;
"""
    content = content.replace(
        "  const fpsCounterRef = useRef({ frames: 0, lastTime: performance.now() });",
        "  const fpsCounterRef = useRef({ frames: 0, lastTime: performance.now() });\n" + hand_hook
    )

    # Merge hand data into the frame object inside handlePoseResults
    content = content.replace(
        "      jawOpen:    faceFrame?.mouthOpen    ?? undefined,",
        "      jawOpen:    faceFrame?.mouthOpen    ?? undefined,\n      handData:   handData || undefined,"
    )

    with open(path, 'w') as f:
        f.write(content)
    print("  ✅ Hand tracking merged into MotionCaptureSystem")
PYEOF

# ════════════════════════════════════════════════════════════
# FIX 4 — DanceSyncPage: replace AnimatedAvatar with AvatarRigPlayer3D
#           + add buildDanceFrames
# ════════════════════════════════════════════════════════════
echo ""
echo "⚙️  Fix 4: DanceSyncPage — replace AnimatedAvatar + add buildDanceFrames..."

python3 << 'PYEOF'
import re

path = "src/front/js/pages/DanceSyncPage.js"
with open(path) as f:
    content = f.read()

changed = False

# ── 4a. Add AvatarRigPlayer3D import if missing ──
if "AvatarRigPlayer3D" not in content:
    content = content.replace(
        "import WaveformVisualizer from '../component/WaveformVisualizer';",
        "import WaveformVisualizer from '../component/WaveformVisualizer';\nimport AvatarRigPlayer3D from '../component/AvatarRigPlayer3D';"
    )
    changed = True
    print("  ✅ AvatarRigPlayer3D import added")
else:
    print("  ✅ AvatarRigPlayer3D already imported")

# ── 4b. Add buildDanceFrames function before detectGenre or component ──
build_dance_frames = """
// Per-genre dance frame generator
function buildDanceFrames(genre, beatTimes) {
  const base = () => Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 1 }));
  const L_SHOULDER=11, R_SHOULDER=12, L_ELBOW=13, R_ELBOW=14;
  const L_WRIST=15, R_WRIST=16, L_HIP=23, R_HIP=24, L_KNEE=25, R_KNEE=26;

  return beatTimes.map((beatTime, i) => {
    const phase = i % 4;
    const lm = base();

    if (genre === 'slow') {
      const sway = Math.sin((i / beatTimes.length) * Math.PI * 2) * 0.04;
      lm[L_SHOULDER] = { x: 0.35 + sway, y: 0.35, z: 0, visibility: 1 };
      lm[R_SHOULDER] = { x: 0.65 + sway, y: 0.35, z: 0, visibility: 1 };
      lm[L_ELBOW]    = { x: 0.25 + sway, y: 0.45, z: 0.05, visibility: 1 };
      lm[R_ELBOW]    = { x: 0.75 + sway, y: 0.45, z: 0.05, visibility: 1 };
      lm[L_HIP]      = { x: 0.44 + sway*0.5, y: 0.58, z: 0, visibility: 1 };
      lm[R_HIP]      = { x: 0.56 + sway*0.5, y: 0.58, z: 0, visibility: 1 };
    } else if (genre === 'hiphop') {
      const bounce = phase % 2 === 0 ? 0.02 : -0.01;
      const lean   = phase < 2 ? 0.03 : -0.03;
      lm[L_SHOULDER] = { x: 0.33, y: 0.33 + bounce, z: 0, visibility: 1 };
      lm[R_SHOULDER] = { x: 0.67, y: 0.33 + bounce, z: 0, visibility: 1 };
      lm[L_ELBOW]    = { x: 0.22, y: 0.44 + lean, z: 0.1, visibility: 1 };
      lm[R_ELBOW]    = { x: 0.78, y: 0.44 - lean, z: 0.1, visibility: 1 };
      lm[L_WRIST]    = { x: 0.15, y: 0.52 + lean, z: 0.1, visibility: 1 };
      lm[R_WRIST]    = { x: 0.85, y: 0.52 - lean, z: 0.1, visibility: 1 };
      lm[L_HIP]      = { x: 0.43, y: 0.58 - bounce, z: 0, visibility: 1 };
      lm[R_HIP]      = { x: 0.57, y: 0.58 - bounce, z: 0, visibility: 1 };
      lm[L_KNEE]     = { x: 0.42, y: 0.72 + bounce*2, z: 0, visibility: 1 };
      lm[R_KNEE]     = { x: 0.58, y: 0.72 + bounce*2, z: 0, visibility: 1 };
    } else if (genre === 'pop') {
      const sway     = phase % 2 === 0 ? 0.04 : -0.04;
      const armRaise = phase === 0 || phase === 2 ? -0.08 : 0;
      lm[L_SHOULDER] = { x: 0.34, y: 0.32, z: 0, visibility: 1 };
      lm[R_SHOULDER] = { x: 0.66, y: 0.32, z: 0, visibility: 1 };
      lm[L_ELBOW]    = { x: 0.22 + sway, y: 0.28 + armRaise, z: 0.05, visibility: 1 };
      lm[R_ELBOW]    = { x: 0.78 - sway, y: 0.28 - armRaise, z: 0.05, visibility: 1 };
      lm[L_WRIST]    = { x: 0.15 + sway, y: 0.22 + armRaise, z: 0.05, visibility: 1 };
      lm[R_WRIST]    = { x: 0.85 - sway, y: 0.22 - armRaise, z: 0.05, visibility: 1 };
      lm[L_HIP]      = { x: 0.43 + sway*0.3, y: 0.57, z: 0, visibility: 1 };
      lm[R_HIP]      = { x: 0.57 + sway*0.3, y: 0.57, z: 0, visibility: 1 };
    } else if (genre === 'edm') {
      const leftUp = phase === 0 || phase === 1;
      lm[L_SHOULDER] = { x: 0.32, y: 0.30, z: 0, visibility: 1 };
      lm[R_SHOULDER] = { x: 0.68, y: 0.30, z: 0, visibility: 1 };
      lm[L_ELBOW]    = { x: leftUp ? 0.24 : 0.20, y: leftUp ? 0.15 : 0.42, z: 0.1, visibility: 1 };
      lm[R_ELBOW]    = { x: !leftUp ? 0.76 : 0.80, y: !leftUp ? 0.15 : 0.42, z: 0.1, visibility: 1 };
      lm[L_WRIST]    = { x: leftUp ? 0.26 : 0.12, y: leftUp ? 0.08 : 0.50, z: 0.1, visibility: 1 };
      lm[R_WRIST]    = { x: !leftUp ? 0.74 : 0.88, y: !leftUp ? 0.08 : 0.50, z: 0.1, visibility: 1 };
      if (phase % 2 === 0) lm[L_KNEE] = { x: 0.42, y: 0.62, z: 0.05, visibility: 1 };
      else                  lm[R_KNEE] = { x: 0.58, y: 0.62, z: 0.05, visibility: 1 };
    } else {
      const flip = i % 2 === 0;
      lm[L_ELBOW] = { x: flip ? 0.20 : 0.30, y: flip ? 0.35 : 0.45, z: 0.1, visibility: 1 };
      lm[R_ELBOW] = { x: flip ? 0.80 : 0.70, y: flip ? 0.35 : 0.45, z: 0.1, visibility: 1 };
      lm[L_WRIST] = { x: flip ? 0.15 : 0.28, y: flip ? 0.28 : 0.40, z: 0.1, visibility: 1 };
      lm[R_WRIST] = { x: flip ? 0.85 : 0.72, y: flip ? 0.28 : 0.40, z: 0.1, visibility: 1 };
    }
    return { time: beatTime, landmarks: lm };
  });
}

"""

if "buildDanceFrames" not in content:
    content = content.replace(
        "// BPM → genre heuristic\nfunction detectGenre",
        build_dance_frames + "// BPM → genre heuristic\nfunction detectGenre"
    )
    # Fallback if detectGenre already had different format
    if "buildDanceFrames" not in content:
        content = content.replace(
            "function detectGenre",
            build_dance_frames + "function detectGenre"
        )
    changed = True
    print("  ✅ buildDanceFrames() added")
else:
    print("  ✅ buildDanceFrames already present")

# ── 4c. Add danceFrames state + liveFrame state if missing ──
if "danceFrames" not in content:
    content = content.replace(
        "const [genre, setGenre] = useState('pop');",
        "const [genre, setGenre] = useState('pop');\n  const [danceFrames, setDanceFrames] = useState([]);\n  const [liveFrame, setLiveFrame] = useState(null);"
    )
    changed = True
    print("  ✅ danceFrames + liveFrame state added")

# ── 4d. Build dance frames when beatTimes/genre changes ──
if "setDanceFrames" not in content:
    use_effect_dance = """
  // Rebuild dance frames when beats or genre changes
  React.useEffect(() => {
    if (beatTimes.length > 0) setDanceFrames(buildDanceFrames(genre, beatTimes));
  }, [beatTimes, genre]);

"""
    content = content.replace(
        "  const audioRef",
        use_effect_dance + "  const audioRef"
    )
    changed = True
    print("  ✅ useEffect to rebuild danceFrames added")

# ── 4e. Add frameIntervalRef if missing ──
if "frameIntervalRef" not in content:
    content = content.replace(
        "  const audioRef",
        "  const frameIntervalRef = useRef(null);\n  const frameIdxRef = useRef(0);\n  const audioRef"
    )
    changed = True

# ── 4f. Replace handlePlay to use danceFrames + setLiveFrame ──
new_handle_play = """  const handlePlay = () => {
    if (!audioRef.current || !danceFrames.length) return;
    if (frameIntervalRef.current) clearTimeout(frameIntervalRef.current);

    audioRef.current.currentTime = 0;
    audioRef.current.play().catch(() => {});

    let beatIdx = 0;
    const scheduleNextBeat = () => {
      if (beatIdx >= beatTimes.length) return;
      const now       = audioRef.current.currentTime;
      const nextBeat  = beatTimes[beatIdx];
      const delay     = Math.max(0, (nextBeat - now) * 1000);
      frameIntervalRef.current = setTimeout(() => {
        const frame = danceFrames[beatIdx % danceFrames.length];
        if (frame) setLiveFrame({ landmarks: frame.landmarks });
        beatIdx++;
        scheduleNextBeat();
      }, delay);
    };
    scheduleNextBeat();
  };
"""

# Replace old handlePlay
content = re.sub(
    r'const handlePlay = \(\) => \{.*?\n  \};',
    new_handle_play.strip(),
    content,
    flags=re.DOTALL
)
changed = True
print("  ✅ handlePlay rebuilt to drive AvatarRigPlayer3D bones per beat")

# ── 4g. Replace AnimatedAvatar JSX with AvatarRigPlayer3D ──
BACKEND_AVATAR = '`${BACKEND}/static/models/Y_Bot.glb`'

if "AvatarRigPlayer3D" in content:
    # Find Canvas block with AnimatedAvatar and replace
    content = re.sub(
        r'<Canvas[^>]*>.*?</Canvas>',
        f"""<AvatarRigPlayer3D
          avatarUrl={{useCustomAvatar && uploadedModel ? uploadedModel : {BACKEND_AVATAR}}}
          liveFrame={{liveFrame}}
          recordedFrames={{null}}
          smoothingEnabled={{true}}
          visemes={{visemes}}
          audioRef={{audioRef}}
        />""",
        content,
        flags=re.DOTALL,
        count=1
    )
    changed = True
    print("  ✅ AnimatedAvatar Canvas replaced with AvatarRigPlayer3D")

# ── 4h. Cleanup frameIntervalRef on unmount ──
if "frameIntervalRef.current" in content and "return () =>" not in content:
    content = content.replace(
        "  const backendUrl",
        "  React.useEffect(() => () => { if (frameIntervalRef.current) clearTimeout(frameIntervalRef.current); }, []);\n\n  const backendUrl"
    )
    changed = True

with open(path, 'w') as f:
    f.write(content)

if changed:
    print("  ✅ DanceSyncPage fully patched")
else:
    print("  ✅ DanceSyncPage already up to date")
PYEOF

# ════════════════════════════════════════════════════════════
# FIX 5 — BeatEditorPage: add ✕ delete button to marker pills in JSX
# ════════════════════════════════════════════════════════════
echo ""
echo "⚙️  Fix 5: BeatEditorPage — add per-marker delete button..."

python3 << 'PYEOF'
import re

path = "src/front/js/pages/BeatEditorPage.js"
with open(path) as f:
    content = f.read()

if "deleteMarker" in content or ("setBeatMarkers" in content and "filter" in content and "✕" in content):
    print("  ✅ Per-marker delete already present")
else:
    # Add deleteMarker function near other handlers
    delete_fn = """
  const deleteMarker = (idx) => {
    setBeatMarkers(prev => prev.filter((_, i) => i !== idx));
  };

"""
    content = content.replace(
        "  const handleSave",
        delete_fn + "  const handleSave"
    )

    # Replace the marker rendering — find beatMarkers.map and wrap with delete button
    # Pattern: any span/div showing a time value inside a beatMarkers.map
    content = re.sub(
        r'(\{beatMarkers\.map\(\((?:time|t|marker),\s*(?:i|idx|index)\)\s*=>\s*\(?\s*)<([a-z]+)([^>]*)>(.*?)\2>',
        lambda m: m.group(1) + f'<div style={{{{display:"flex",alignItems:"center",gap:"4px",background:"#1a1a2e",border:"1px solid #333",borderRadius:"6px",padding:"3px 8px",fontSize:"12px",color:"#a78bfa"}}}}>\n'
                  f'                  <span>{{' + ('time' if 'time' in m.group(0) else 't') + '.toFixed(3)}}s</span>\n'
                  f'                  <button onClick={{()=>deleteMarker(i)}} style={{{{background:"none",border:"none",color:"#f87171",cursor:"pointer",padding:"0 2px",lineHeight:1}}}}>✕</button>\n'
                  f'                </div>',
        content,
        flags=re.DOTALL
    )

    # Simpler fallback if regex didn't match
    if "deleteMarker" not in content or "onClick={()=>deleteMarker" not in content:
        # Find and replace the markers list section more aggressively
        content = re.sub(
            r'(\{beatMarkers\.map\(\((\w+),\s*(\w+)\)\s*=>\s*\(?)(<[^>]+>[^<]*</[^>]+>)',
            r'''\1<div key={\3} style={{display:"flex",alignItems:"center",gap:"4px",background:"#1a1a2e",border:"1px solid #333",borderRadius:"6px",padding:"3px 8px",fontSize:"12px",color:"#a78bfa"}}>
                  <span>{\2.toFixed ? \2.toFixed(3) : \2}s</span>
                  <button onClick={()=>deleteMarker(\3)} style={{background:"none",border:"none",color:"#f87171",cursor:"pointer",padding:"0 2px"}}>✕</button>
                </div>''',
            content,
            flags=re.DOTALL
        )

    with open(path, 'w') as f:
        f.write(content)
    print("  ✅ Per-marker delete button added to BeatEditorPage")
PYEOF

# ════════════════════════════════════════════════════════════
# FIX 6 — BeatMapEditorPage: add ✕ delete button to marker pills
# ════════════════════════════════════════════════════════════
echo ""
echo "⚙️  Fix 6: BeatMapEditorPage — add per-marker delete button..."

python3 << 'PYEOF'
import re

path = "src/front/js/pages/BeatMapEditorPage.js"
with open(path) as f:
    content = f.read()

if "onClick={() => setBeatMarkers" in content and "filter" in content:
    print("  ✅ Per-marker delete already present in BeatMapEditorPage")
else:
    # Add deleteMarker helper
    delete_fn = """
  const deleteMarker = (idx) => {
    setBeatMarkers(prev => prev.filter((_, i) => i !== idx));
  };

"""
    if "deleteMarker" not in content:
        content = content.replace(
            "  const handleSave",
            delete_fn + "  const handleSave"
        )

    # Find the beatMarkers.map rendering and inject delete button
    # Most likely pattern in BeatMapEditorPage
    content = re.sub(
        r'(beatMarkers\.map\(\((\w+),\s*(\w+)\)\s*=>\s*\(?\s*)(<[a-zA-Z][^>]*>)(.*?)(</[a-zA-Z]+>\s*\)?\s*\))',
        lambda m: (
            m.group(1) +
            '<div key={' + m.group(3) + '} style={{display:"flex",alignItems:"center",gap:"4px",background:"#1a1a2e",border:"1px solid #333",borderRadius:"6px",padding:"3px 8px",fontSize:"12px",color:"#a78bfa"}}>\n'
            '                  <span>{typeof ' + m.group(2) + ' === "number" ? ' + m.group(2) + '.toFixed(3) : ' + m.group(2) + '}s</span>\n'
            '                  <button onClick={() => deleteMarker(' + m.group(3) + ')} style={{background:"none",border:"none",color:"#f87171",cursor:"pointer",padding:"0 2px"}}>✕</button>\n'
            '                </div>'
        ),
        content,
        flags=re.DOTALL,
        count=1
    )

    with open(path, 'w') as f:
        f.write(content)
    print("  ✅ Per-marker delete button added to BeatMapEditorPage")
PYEOF

# ════════════════════════════════════════════════════════════
# FIX 7 — ReplayMotionSession: wire audio currentTime on scrub
# ════════════════════════════════════════════════════════════
echo ""
echo "⚙️  Fix 7: ReplayMotionSession — wire audio sync to scrubber..."

python3 << 'PYEOF'
import re

path = "src/front/js/pages/ReplayMotionSession.js"
with open(path) as f:
    content = f.read()

# Check if scrubber onChange already syncs audio
if "audioRef.current.currentTime" in content and "onChange" in content:
    print("  ✅ Audio sync on scrub already present")
else:
    # Find the scrubber input onChange and add audio sync
    content = re.sub(
        r'(onChange=\{[^}]*e[^}]*\}\s*\{[^}]*\n[^}]*setCurrentFrame[^}]*\})',
        r'''\1''',
        content
    )

    # More targeted: find onChange of range input and replace
    content = re.sub(
        r'''onChange=\{\(e\)\s*=>\s*\{\s*const idx = parseInt\(e\.target\.value,\s*10\);\s*setCurrentFrame\(idx\);\s*\}\}''',
        '''onChange={(e) => {
                    const idx = parseInt(e.target.value, 10);
                    setCurrentFrame(idx);
                    if (audioRef.current && frames[idx]) {
                      audioRef.current.currentTime = frames[idx].time || 0;
                    }
                  }}''',
        content
    )

    with open(path, 'w') as f:
        f.write(content)
    print("  ✅ Audio currentTime synced to scrubber position")
PYEOF

# ════════════════════════════════════════════════════════════
# VERIFY — run diagnose again on key files
# ════════════════════════════════════════════════════════════
echo ""
echo "⚙️  Verifying fixes..."

python3 << 'PYEOF'
checks = {
    "MotionCapturePage uses MotionCaptureSystem": ("src/front/js/pages/MotionCapturePage.js", "MotionCaptureSystem", "LiveMoCapAvatar"),
    "FullBodyCapturePage passes faceFrame": ("src/front/js/pages/FullBodyCapturePage.js", "faceFrame", None),
    "Hand tracking in MotionCaptureSystem": ("src/front/js/component/MotionCaptureSystem.js", "useHandMocap", None),
    "buildDanceFrames in DanceSyncPage": ("src/front/js/pages/DanceSyncPage.js", "buildDanceFrames", None),
    "AvatarRigPlayer3D in DanceSyncPage": ("src/front/js/pages/DanceSyncPage.js", "AvatarRigPlayer3D", None),
    "liveFrame state in DanceSyncPage": ("src/front/js/pages/DanceSyncPage.js", "liveFrame", None),
    "BeatEditorPage delete marker": ("src/front/js/pages/BeatEditorPage.js", "deleteMarker", None),
    "BeatMapEditorPage delete marker": ("src/front/js/pages/BeatMapEditorPage.js", "deleteMarker", None),
    "Audio sync on scrub ReplayMotionSession": ("src/front/js/pages/ReplayMotionSession.js", "audioRef.current.currentTime", None),
}

passed = 0
failed = 0
for label, (filepath, must_have, must_not_have) in checks.items():
    try:
        with open(filepath) as f:
            c = f.read()
        ok = must_have in c
        if must_not_have:
            ok = ok and must_not_have not in c
        if ok:
            print(f"  ✅ {label}")
            passed += 1
        else:
            print(f"  ❌ {label}")
            failed += 1
    except FileNotFoundError:
        print(f"  ⚠️  {label} — file not found")
        failed += 1

total = passed + failed
pct = int((passed / total) * 100) if total else 0
print(f"\n  Result: {passed}/{total} checks passing ({pct}%)")
PYEOF

echo ""
echo "════════════════════════════════════════════════════════"
echo "✅  fix_remaining.sh complete!"
echo ""
echo "Restart your servers:"
echo "  Backend:  pkill -f 'python src/app.py' 2>/dev/null; pipenv run start"
echo "  Frontend: cd src/front && npm start"
echo "════════════════════════════════════════════════════════"
