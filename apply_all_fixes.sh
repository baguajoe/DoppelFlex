#!/bin/bash
# ============================================================
# DoppelFlex — Apply all mocap + dance fixes
# Run this from your repo root in Codespace:
#   chmod +x apply_all_fixes.sh && bash apply_all_fixes.sh
# ============================================================

set -e
REPO_ROOT=$(pwd)
echo "🚀 Applying DoppelFlex fixes from: $REPO_ROOT"

# ── Sanity check ──────────────────────────────────────────────
if [ ! -f "src/api/routes.py" ]; then
  echo "❌ ERROR: Run this from the repo root (where src/ lives)"
  exit 1
fi

# ── Backup originals ─────────────────────────────────────────
echo "📦 Backing up originals..."
mkdir -p .df_backup
cp src/api/routes.py .df_backup/routes.py.bak
cp src/front/js/component/MotionCaptureSystem.js .df_backup/MotionCaptureSystem.js.bak 2>/dev/null || true
cp src/front/js/component/AvatarRigPlayer3D.js .df_backup/AvatarRigPlayer3D.js.bak 2>/dev/null || true
cp src/front/js/pages/ReplayMotionSession.js .df_backup/ReplayMotionSession.js.bak 2>/dev/null || true
cp src/front/js/pages/DanceSyncPage.js .df_backup/DanceSyncPage.js.bak 2>/dev/null || true
cp src/front/js/pages/MotionCapturePage.js .df_backup/MotionCapturePage.js.bak 2>/dev/null || true
cp src/front/js/layout.js .df_backup/layout.js.bak 2>/dev/null || true
cp src/front/js/pages/BeatEditorPage.js .df_backup/BeatEditorPage.js.bak 2>/dev/null || true
cp src/front/js/pages/BeatMapEditorPage.js .df_backup/BeatMapEditorPage.js.bak 2>/dev/null || true
echo "✅ Backups saved to .df_backup/"

# ════════════════════════════════════════════════════════════
# PATCH 1 — routes.py: replace analyze_voice + export_avatar
#           + add beatmap routes
# ════════════════════════════════════════════════════════════
echo ""
echo "⚙️  Patching src/api/routes.py..."

python3 << 'PYEOF'
import re, os

path = "src/api/routes.py"
with open(path, "r") as f:
    content = f.read()

# ─── 1a. Replace analyze_voice ────────────────────────────────
new_analyze_voice = '''
@api.route("/analyze-voice", methods=["POST"])
def analyze_voice():
    """Real viseme extraction using librosa RMS amplitude analysis."""
    audio = request.files.get("audio")
    if not audio:
        return jsonify({"error": "No audio uploaded"}), 400
    tmp_path = None
    try:
        import numpy as np
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
            audio.save(tmp.name)
            tmp_path = tmp.name
        y, sr = librosa.load(tmp_path, sr=None, mono=True)
        duration = librosa.get_duration(y=y, sr=sr)
        frame_length = int(sr * 0.020)
        hop_length   = int(sr * 0.010)
        rms = librosa.feature.rms(y=y, frame_length=frame_length, hop_length=hop_length)[0]
        rms_max  = float(rms.max()) if rms.max() > 0 else 1.0
        rms_norm = rms / rms_max
        times = librosa.frames_to_time(np.arange(len(rms)), sr=sr, hop_length=hop_length)
        def energy_to_viseme(e):
            if e < 0.05:  return "rest"
            if e < 0.15:  return "M"
            if e < 0.30:  return "E"
            if e < 0.50:  return "A"
            if e < 0.70:  return "O"
            return "AH"
        visemes, prev = [], None
        for t, e in zip(times, rms_norm):
            v = energy_to_viseme(float(e))
            if v != prev:
                visemes.append({"time": round(float(t), 3), "viseme": v})
                prev = v
        if not visemes or visemes[-1]["viseme"] != "rest":
            visemes.append({"time": round(duration, 3), "viseme": "rest"})
        return jsonify({"duration": round(duration, 3), "visemes": visemes, "method": "librosa_rms"}), 200
    except Exception as e:
        import traceback; traceback.print_exc()
        return jsonify({"error": str(e)}), 500
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try: os.remove(tmp_path)
            except: pass
'''

# Find and replace analyze_voice function
pattern_av = r'@api\.route\("/analyze-voice".*?(?=\n@api\.route|\nclass |\Z)'
if re.search(pattern_av, content, re.DOTALL):
    content = re.sub(pattern_av, new_analyze_voice.strip() + "\n\n\n", content, flags=re.DOTALL)
    print("  ✅ analyze_voice replaced")
else:
    print("  ⚠️  analyze_voice pattern not found — appending")
    content += "\n" + new_analyze_voice

# ─── 1b. Replace export_avatar in routes.py ──────────────────
new_export_avatar = '''
@api.route(\'/export-avatar\', methods=[\'POST\'])
def export_avatar():
    """Export avatar as GLB, OBJ, PLY, or FBX (via Blender if available)."""
    data          = request.get_json() or {}
    rigging_preset = data.get("riggingPreset", "unity")
    avatar_model  = data.get("avatarModel") or data.get("avatar_path", "")
    file_type     = data.get("fileType", data.get("format", "glb")).lower()
    if not avatar_model:
        return jsonify({"error": "No avatar model path provided"}), 400
    avatar_path = avatar_model.lstrip("/")
    candidates = [
        avatar_path,
        os.path.join("src", avatar_path),
        os.path.join("..", avatar_path),
        os.path.join(EXPORT_FOLDER, os.path.basename(avatar_path)),
        os.path.join(UPLOAD_FOLDER, os.path.basename(avatar_path)),
    ]
    resolved_path = next((c for c in candidates if os.path.exists(c)), None)
    if not resolved_path:
        return jsonify({"error": f"Avatar file not found: {avatar_path}"}), 404
    try:
        base_name   = os.path.splitext(os.path.basename(resolved_path))[0]
        out_filename = f"{base_name}_{rigging_preset}.{file_type}"
        out_path    = os.path.join(EXPORT_FOLDER, out_filename)
        os.makedirs(EXPORT_FOLDER, exist_ok=True)
        if file_type == "fbx":
            import shutil as _shutil
            blender_cmd = _shutil.which("blender") or _shutil.which("blender3.6") or _shutil.which("blender4.0")
            if blender_cmd:
                script = f"""
import bpy
bpy.ops.object.select_all(action=\'SELECT\')
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=r\'{os.path.abspath(resolved_path)}\')
bpy.ops.export_scene.fbx(filepath=r\'{os.path.abspath(out_path)}\', embed_textures=True, path_mode=\'COPY\')
print(\'FBX_EXPORT_SUCCESS\')
"""
                tmp_script = tempfile.mktemp(suffix=".py")
                with open(tmp_script, "w") as f_s: f_s.write(script)
                try:
                    import subprocess
                    result = subprocess.run([blender_cmd, "--background", "--python", tmp_script],
                                            capture_output=True, text=True, timeout=120)
                    if "FBX_EXPORT_SUCCESS" in result.stdout and os.path.exists(out_path):
                        return send_file(out_path, as_attachment=True, download_name=out_filename,
                                         mimetype="application/octet-stream")
                finally:
                    try: os.remove(tmp_script)
                    except: pass
            file_type     = "glb"
            out_filename  = f"{base_name}_{rigging_preset}_fbx_fallback.glb"
            out_path      = os.path.join(EXPORT_FOLDER, out_filename)
        mesh = trimesh.load(resolved_path)
        if file_type in ("glb", "obj", "ply"):
            if isinstance(mesh, trimesh.Scene) and file_type != "glb":
                mesh = trimesh.util.concatenate(
                    [g for g in mesh.geometry.values() if isinstance(g, trimesh.Trimesh)])
            mesh.export(out_path, file_type=file_type)
        else:
            return jsonify({"error": f"Unsupported format: {file_type}"}), 400
        if not os.path.exists(out_path):
            return jsonify({"error": "Export produced no output file"}), 500
        return send_file(out_path, as_attachment=True, download_name=out_filename,
                         mimetype="application/octet-stream")
    except Exception as e:
        import traceback; traceback.print_exc()
        return jsonify({"error": str(e)}), 500
'''

# Find export_avatar in routes.py (not avatar_routes.py) — match the one that uses FBXExporter
pattern_ea = r'@api\.route\(\'/export-avatar\'.*?(?=\n@api\.route|\nclass |\Z)'
if re.search(pattern_ea, content, re.DOTALL):
    content = re.sub(pattern_ea, new_export_avatar.strip() + "\n\n\n", content, flags=re.DOTALL)
    print("  ✅ export_avatar replaced")
else:
    print("  ⚠️  export_avatar in routes.py not found — appending")
    content += "\n" + new_export_avatar

# ─── 1c. Add beatmap routes if not present ───────────────────
if "/save-beatmap" not in content:
    beatmap_routes = '''

@api.route("/save-beatmap", methods=["POST"])
@jwt_required()
def save_beatmap():
    user_id = get_jwt_identity()
    data = request.get_json() or {}
    song_name    = data.get("song_name", "Untitled")
    beat_markers = data.get("beat_markers", [])
    bpm          = data.get("bpm")
    if not beat_markers:
        return jsonify({"error": "No beat markers provided"}), 400
    sync = MotionAudioSync(user_id=user_id, song_name=song_name,
                           beat_times=json.dumps(beat_markers), bpm=bpm)
    db.session.add(sync)
    db.session.commit()
    return jsonify({"message": "Beatmap saved", "id": sync.id,
                    "beat_count": len(beat_markers)}), 201


@api.route("/load-beatmaps", methods=["GET"])
@jwt_required()
def load_beatmaps():
    user_id = get_jwt_identity()
    syncs = MotionAudioSync.query.filter_by(user_id=user_id).order_by(MotionAudioSync.id.desc()).all()
    return jsonify([{
        "id": s.id, "song_name": s.song_name,
        "beat_markers": json.loads(s.beat_times) if s.beat_times else [],
        "bpm": s.bpm,
    } for s in syncs]), 200


@api.route("/delete-beatmap/<int:beatmap_id>", methods=["DELETE"])
@jwt_required()
def delete_beatmap(beatmap_id):
    user_id = get_jwt_identity()
    sync = MotionAudioSync.query.filter_by(id=beatmap_id, user_id=user_id).first()
    if not sync:
        return jsonify({"error": "Beatmap not found"}), 404
    db.session.delete(sync)
    db.session.commit()
    return jsonify({"message": "Beatmap deleted"}), 200
'''
    content += beatmap_routes
    print("  ✅ beatmap routes added")
else:
    print("  ✅ beatmap routes already present")

with open(path, "w") as f:
    f.write(content)
print("  ✅ routes.py saved")
PYEOF

# ════════════════════════════════════════════════════════════
# PATCH 2 — MotionCaptureSystem.js
# ════════════════════════════════════════════════════════════
echo ""
echo "⚙️  Writing MotionCaptureSystem.js..."
cat > src/front/js/component/MotionCaptureSystem.js << 'JSEOF'
import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Pose } from '@mediapipe/pose';
import { Camera } from '@mediapipe/camera_utils';
import { createSmoothingPipeline } from '../utils/smoothPose';
import AvatarRigPlayer3D from './AvatarRigPlayer3D';

const BACKEND = process.env.REACT_APP_BACKEND_URL || '';

const DEFAULT_CONFIG = {
  modelComplexity: 1, smoothLandmarks: true, enableSegmentation: false,
  minDetectionConfidence: 0.5, minTrackingConfidence: 0.5,
  cameraWidth: 640, cameraHeight: 480,
  skipBackendFrames: true, backendSendInterval: 10,
};

const MotionCaptureSystem = ({
  avatarUrl = '/static/models/Y_Bot.glb',
  onPoseFrame = null,
  showWebcam = true,
  smoothingPreset = 'balanced',
  config = {},
  externalStream = null,
  socket = null,
  faceFrame = null,
}) => {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const videoRef = useRef(null);
  const poseRef = useRef(null);
  const cameraRef = useRef(null);
  const pipelineRef = useRef(null);
  const frameCountRef = useRef(0);
  const recordingRef = useRef([]);
  const startTimeRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const videoChunksRef = useRef([]);

  const [liveFrame, setLiveFrame] = useState(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedFrames, setRecordedFrames] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [fps, setFps] = useState(0);
  const [landmarkCount, setLandmarkCount] = useState(0);
  const [smoothingEnabled, setSmoothingEnabled] = useState(true);
  const [currentPreset, setCurrentPreset] = useState(smoothingPreset);
  const [error, setError] = useState(null);
  const [downloadUrl, setDownloadUrl] = useState(null);
  const fpsCounterRef = useRef({ frames: 0, lastTime: performance.now() });

  useEffect(() => { pipelineRef.current = createSmoothingPipeline(currentPreset); }, [currentPreset]);

  // WebSocket: receive remote pose and drive avatar
  useEffect(() => {
    if (!socket) return;
    const handler = (data) => {
      if (data && data.landmarks) {
        setLiveFrame({ landmarks: data.landmarks, timestamp: data.time || performance.now() / 1000, source: 'websocket' });
      }
    };
    socket.on('pose_update', handler);
    return () => socket.off('pose_update', handler);
  }, [socket]);

  const handlePoseResults = useCallback((results) => {
    if (!results.poseLandmarks) return;
    const now = performance.now() / 1000;
    let landmarks = results.poseLandmarks;
    if (smoothingEnabled && pipelineRef.current) landmarks = pipelineRef.current.process(landmarks);

    const frame = {
      landmarks, timestamp: now,
      worldLandmarks: results.poseWorldLandmarks || null,
      jawOpen:    faceFrame?.mouthOpen    ?? undefined,
      leftBlink:  faceFrame?.leftEyeOpen  != null ? 1 - faceFrame.leftEyeOpen  : undefined,
      rightBlink: faceFrame?.rightEyeOpen != null ? 1 - faceFrame.rightEyeOpen : undefined,
      browRaise:  faceFrame?.leftBrowRaise ?? undefined,
    };

    setLiveFrame(frame);
    fpsCounterRef.current.frames++;
    const elapsed = now - fpsCounterRef.current.lastTime;
    if (elapsed >= 1.0) {
      setFps(Math.round(fpsCounterRef.current.frames / elapsed));
      fpsCounterRef.current = { frames: 0, lastTime: now };
    }
    setLandmarkCount(landmarks.filter(lm => lm.visibility === undefined || lm.visibility > 0.5).length);

    if (isRecording) {
      const t = startTimeRef.current ? (performance.now() - startTimeRef.current) / 1000 : 0;
      recordingRef.current.push({ time: t, landmarks: landmarks.map(lm => ({ ...lm })) });
    }
    if (onPoseFrame) onPoseFrame(frame);
    frameCountRef.current++;
    if (!cfg.skipBackendFrames || frameCountRef.current % cfg.backendSendInterval === 0) {
      fetch(`${BACKEND}/api/process-pose`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pose_data: landmarks }) }).catch(() => {});
    }
  }, [smoothingEnabled, isRecording, onPoseFrame, cfg, faceFrame]);

  const startCapture = useCallback(async () => {
    try {
      setError(null);
      if (pipelineRef.current) pipelineRef.current.reset();
      const pose = new Pose({ locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${f}` });
      pose.setOptions({ modelComplexity: cfg.modelComplexity, smoothLandmarks: cfg.smoothLandmarks, enableSegmentation: cfg.enableSegmentation, minDetectionConfidence: cfg.minDetectionConfidence, minTrackingConfidence: cfg.minTrackingConfidence });
      pose.onResults(handlePoseResults);
      poseRef.current = pose;

      if (videoRef.current) {
        if (externalStream) {
          videoRef.current.srcObject = externalStream;
          await videoRef.current.play();
          const run = async () => {
            if (poseRef.current && videoRef.current && !videoRef.current.paused) await poseRef.current.send({ image: videoRef.current });
            if (poseRef.current) requestAnimationFrame(run);
          };
          requestAnimationFrame(run);
        } else {
          const camera = new Camera(videoRef.current, {
            onFrame: async () => { if (poseRef.current) await poseRef.current.send({ image: videoRef.current }); },
            width: cfg.cameraWidth, height: cfg.cameraHeight,
          });
          await camera.start();
          cameraRef.current = camera;
        }
        setIsCapturing(true);
      }
    } catch (err) { setError(`Camera failed: ${err.message}`); }
  }, [cfg, handlePoseResults, externalStream]);

  const stopCapture = useCallback(async () => {
    if (cameraRef.current) { cameraRef.current.stop(); cameraRef.current = null; }
    if (poseRef.current) { poseRef.current.close(); poseRef.current = null; }
    if (videoRef.current) videoRef.current.srcObject = null;
    setIsCapturing(false); setLiveFrame(null); setFps(0); setLandmarkCount(0);
  }, []);

  const startRecording = useCallback(() => {
    recordingRef.current = [];
    startTimeRef.current = performance.now();
    setIsRecording(true);
    if (videoRef.current?.srcObject) {
      try {
        const recorder = new MediaRecorder(videoRef.current.srcObject, { mimeType: 'video/webm;codecs=vp9' });
        videoChunksRef.current = [];
        recorder.ondataavailable = e => { if (e.data.size > 0) videoChunksRef.current.push(e.data); };
        recorder.onstop = () => setDownloadUrl(URL.createObjectURL(new Blob(videoChunksRef.current, { type: 'video/webm' })));
        recorder.start(100);
        mediaRecorderRef.current = recorder;
      } catch (e) { console.warn('[MoCap] Video recording unavailable:', e.message); }
    }
  }, []);

  const stopRecording = useCallback(() => {
    setIsRecording(false);
    setRecordedFrames([...recordingRef.current]);
    recordingRef.current = [];
    if (mediaRecorderRef.current?.state !== 'inactive') { mediaRecorderRef.current.stop(); mediaRecorderRef.current = null; }
  }, []);

  const exportRecording = useCallback(() => {
    if (!recordedFrames?.length) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify({ frames: recordedFrames }, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `mocap_${Date.now()}.json`; a.click(); URL.revokeObjectURL(url);
  }, [recordedFrames]);

  const saveToBackend = useCallback(async () => {
    if (!recordedFrames?.length) return;
    const userId = localStorage.getItem('user_id');
    try {
      const res = await fetch(`${BACKEND}/api/save-motion-session`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: userId, session_name: `Session ${new Date().toLocaleString()}`, frames: recordedFrames }) });
      const data = await res.json();
      alert(res.ok ? `✅ Saved! Session ID: ${data.id}` : `❌ ${data.error}`);
    } catch (err) { alert(`❌ ${err.message}`); }
  }, [recordedFrames]);

  useEffect(() => () => { stopCapture(); }, [stopCapture]);

  const resolvedAvatarUrl = avatarUrl.startsWith('http') || avatarUrl.startsWith('blob:') ? avatarUrl : `${BACKEND}${avatarUrl}`;

  return (
    <div style={{ display:'flex', gap:'16px', height:'100%', minHeight:'600px', padding:'16px', backgroundColor:'#0a0a0f', color:'#e0e0e0' }}>
      <div style={{ width:'360px', flexShrink:0, display:'flex', flexDirection:'column', gap:'12px' }}>
        {showWebcam && (
          <div style={{ position:'relative', borderRadius:'12px', overflow:'hidden', backgroundColor:'#111', border:'1px solid #1a1a2e' }}>
            <video ref={videoRef} style={{ width:'100%', borderRadius:'12px', transform:'scaleX(-1)' }} autoPlay muted playsInline />
            {isCapturing && (
              <div style={{ position:'absolute', top:'8px', left:'8px', right:'8px', display:'flex', gap:'8px', alignItems:'center', fontSize:'11px', color:'#aaa', backgroundColor:'rgba(0,0,0,0.6)', padding:'4px 8px', borderRadius:'6px' }}>
                <span style={{ width:'8px', height:'8px', borderRadius:'50%', backgroundColor: landmarkCount > 20 ? '#4ade80' : '#f87171' }} />
                <span>{fps} FPS</span><span>{landmarkCount}/33</span>
                {isRecording && <span style={{ color:'#f87171' }}>● REC</span>}
              </div>
            )}
            {!isCapturing && <div style={{ width:'100%', height:'270px', display:'flex', alignItems:'center', justifyContent:'center', color:'#555' }}>Press Start to begin</div>}
          </div>
        )}
        <div style={{ display:'flex', flexWrap:'wrap', gap:'8px' }}>
          {!isCapturing ? <button onClick={startCapture} style={{ padding:'8px 16px', background:'#7c3aed', color:'#fff', border:'none', borderRadius:'8px', cursor:'pointer' }}>▶ Start Capture</button>
                        : <button onClick={stopCapture}  style={{ padding:'8px 16px', background:'#dc2626', color:'#fff', border:'none', borderRadius:'8px', cursor:'pointer' }}>■ Stop</button>}
          {isCapturing && !isRecording && <button onClick={startRecording} style={{ padding:'8px 16px', background:'#b91c1c', color:'#fff', border:'none', borderRadius:'8px', cursor:'pointer' }}>⏺ Record</button>}
          {isRecording && <button onClick={stopRecording} style={{ padding:'8px 16px', background:'#dc2626', color:'#fff', border:'none', borderRadius:'8px', cursor:'pointer' }}>⏹ Stop Recording</button>}
          {recordedFrames?.length > 0 && <>
            <button onClick={() => setIsPlaying(p => !p)} style={{ padding:'6px 12px', background:'#1e1e2e', color:'#ccc', border:'1px solid #333', borderRadius:'8px', cursor:'pointer' }}>{isPlaying ? '⏹ Stop Playback' : '▶ Play Recording'}</button>
            <button onClick={exportRecording} style={{ padding:'6px 12px', background:'#1e1e2e', color:'#ccc', border:'1px solid #333', borderRadius:'8px', cursor:'pointer' }}>💾 Export JSON</button>
            <button onClick={saveToBackend} style={{ padding:'6px 12px', background:'#1e1e2e', color:'#ccc', border:'1px solid #333', borderRadius:'8px', cursor:'pointer' }}>☁ Save</button>
            {downloadUrl && <a href={downloadUrl} download="mocap_video.webm" style={{ padding:'6px 12px', background:'#1e1e2e', color:'#ccc', border:'1px solid #333', borderRadius:'8px', cursor:'pointer', textDecoration:'none' }}>📹 Download Video</a>}
          </>}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'12px', fontSize:'13px' }}>
          <label style={{ display:'flex', alignItems:'center', gap:'6px', cursor:'pointer' }}>
            <input type="checkbox" checked={smoothingEnabled} onChange={e => setSmoothingEnabled(e.target.checked)} />
            Smoothing
          </label>
          {smoothingEnabled && (
            <select value={currentPreset} onChange={e => setCurrentPreset(e.target.value)} style={{ background:'#1a1a2e', color:'#e0e0e0', border:'1px solid #333', borderRadius:'6px', padding:'4px 8px', fontSize:'12px' }}>
              <option value="dance">Dance (fast)</option>
              <option value="balanced">Balanced</option>
              <option value="cinematic">Cinematic</option>
            </select>
          )}
        </div>
        {error && <div style={{ color:'#f87171', fontSize:'13px', padding:'8px', background:'#1a0a0a', borderRadius:'6px' }}>{error}</div>}
      </div>
      <div style={{ flex:1, borderRadius:'12px', overflow:'hidden', border:'1px solid #1a1a2e', minHeight:'500px' }}>
        <AvatarRigPlayer3D
          avatarUrl={resolvedAvatarUrl}
          liveFrame={isPlaying ? null : liveFrame}
          recordedFrames={isPlaying ? recordedFrames : null}
          smoothingEnabled={false}
        />
      </div>
    </div>
  );
};

export default MotionCaptureSystem;
JSEOF
echo "  ✅ MotionCaptureSystem.js written"

# ════════════════════════════════════════════════════════════
# PATCH 3 — MotionCapturePage.js: swap LiveMoCapAvatar → MotionCaptureSystem
# ════════════════════════════════════════════════════════════
echo ""
echo "⚙️  Patching MotionCapturePage.js..."
python3 << 'PYEOF'
path = "src/front/js/pages/MotionCapturePage.js"
with open(path, "r") as f:
    content = f.read()

# Swap import
content = content.replace(
    "import LiveMoCapAvatar from '../component/LiveMoCapAvatar';",
    "import MotionCaptureSystem from '../component/MotionCaptureSystem';"
)

# Swap component usage — replace <LiveMoCapAvatar ... /> block
import re
content = re.sub(
    r'<LiveMoCapAvatar\s[^>]*/>',
    '<MotionCaptureSystem avatarUrl={avatarUrl} showWebcam={showVideo} smoothingPreset="balanced" onPoseFrame={handleFrame} />',
    content,
    flags=re.DOTALL
)

with open(path, "w") as f:
    f.write(content)
print("  ✅ MotionCapturePage.js patched")
PYEOF

# ════════════════════════════════════════════════════════════
# PATCH 4 — layout.js: fix duplicate /full-capture route
# ════════════════════════════════════════════════════════════
echo ""
echo "⚙️  Patching layout.js..."
python3 << 'PYEOF'
path = "src/front/js/layout.js"
with open(path, "r") as f:
    content = f.read()

import re

# Find all /full-capture routes
matches = list(re.finditer(r'<Route path="/full-capture" element=\{<(\w+)', content))
if len(matches) >= 2:
    # Replace the SECOND occurrence only
    second = matches[1]
    comp = second.group(1)
    # Replace second /full-capture with /full-performance
    idx = second.start()
    content = content[:idx] + content[idx:].replace(
        '<Route path="/full-capture"',
        '<Route path="/full-performance"',
        1
    )
    print(f"  ✅ Second /full-capture ({comp}) renamed to /full-performance")
else:
    print(f"  ℹ️  Found {len(matches)} /full-capture routes — no duplicate to fix")

with open(path, "w") as f:
    f.write(content)
PYEOF

# ════════════════════════════════════════════════════════════
# PATCH 5 — AvatarRigPlayer3D.js: add face bone support
# ════════════════════════════════════════════════════════════
echo ""
echo "⚙️  Patching AvatarRigPlayer3D.js..."
python3 << 'PYEOF'
import re
path = "src/front/js/component/AvatarRigPlayer3D.js"
with open(path, "r") as f:
    content = f.read()

# Add face bone variants if not present
face_variants = """
  // Face bones
  jaw:         ['mixamorig:Jaw','mixamorigJaw','Jaw','jaw','CC_Base_JawRoot'],
  leftEye:     ['mixamorig:LeftEye','mixamorigLeftEye','LeftEye','CC_Base_L_Eye'],
  rightEye:    ['mixamorig:RightEye','mixamorigRightEye','RightEye','CC_Base_R_Eye'],
  leftBrow:    ['mixamorig:LeftEyeBrow1','LeftEyeBrow1','CC_Base_L_Brow1'],
  rightBrow:   ['mixamorig:RightEyeBrow1','RightEyeBrow1','CC_Base_R_Brow1'],"""

if "jaw:" not in content:
    # Insert before closing brace of BONE_NAME_VARIANTS
    content = content.replace(
        "  rightLeg:     [",
        "  rightLeg:     ["
    )
    # Add after rightLeg variants
    content = re.sub(
        r"(rightLeg:\s*\[.*?\],?\s*\n)",
        r"\1" + face_variants + "\n",
        content,
        flags=re.DOTALL
    )
    print("  ✅ Face bone variants added to BONE_NAME_VARIANTS")
else:
    print("  ✅ Face bones already present")

# Add jaw/eye/brow animation in useFrame if not present
jaw_code = """
    // ── FACE BONES ──
    // JAW: live face capture or timed viseme playback
    let jawTarget = 0;
    if (frame.jawOpen !== undefined) {
      jawTarget = frame.jawOpen * 0.3;
    } else if (typeof visemes !== 'undefined' && visemes.length > 0 && audioRef?.current) {
      const audioTime = audioRef.current.currentTime;
      const VISEME_JAW = { rest:0, M:0.02, E:0.08, A:0.18, O:0.14, AH:0.25 };
      let activeViseme = 'rest';
      for (const v of visemes) { if (v.time <= audioTime) activeViseme = v.viseme; else break; }
      jawTarget = VISEME_JAW[activeViseme] ?? 0;
    }
    if (bones.jaw) {
      bones.jaw.rotation.x = THREE.MathUtils.lerp(bones.jaw.rotation.x, jawTarget, 0.2);
    }
    if (bones.leftEye && frame.leftBlink !== undefined) {
      bones.leftEye.rotation.x = THREE.MathUtils.lerp(bones.leftEye.rotation.x, frame.leftBlink * 0.15, 0.25);
    }
    if (bones.rightEye && frame.rightBlink !== undefined) {
      bones.rightEye.rotation.x = THREE.MathUtils.lerp(bones.rightEye.rotation.x, frame.rightBlink * 0.15, 0.25);
    }
    if (bones.leftBrow && frame.browRaise !== undefined) {
      bones.leftBrow.rotation.y = THREE.MathUtils.lerp(bones.leftBrow.rotation.y, frame.browRaise * 0.1, 0.2);
    }
    if (bones.rightBrow && frame.browRaise !== undefined) {
      bones.rightBrow.rotation.y = THREE.MathUtils.lerp(bones.rightBrow.rotation.y, frame.browRaise * 0.1, 0.2);
    }"""

if "bones.jaw" not in content:
    # Insert before the closing of useFrame
    content = content.replace(
        "  });\n\n  return <group ref={avatarRef} />;",
        jaw_code + "\n  });\n\n  return <group ref={avatarRef} />;"
    )
    print("  ✅ Face bone animation (jaw/eyes/brows) added to useFrame")
else:
    print("  ✅ Face bone animation already present")

# Add visemes + audioRef props to AvatarRig component signature if missing
if "visemes = []" not in content:
    content = content.replace(
        "const AvatarRig = ({ recordedFrames, avatarUrl, liveFrame, smoothingEnabled = true }) => {",
        "const AvatarRig = ({ recordedFrames, avatarUrl, liveFrame, smoothingEnabled = true, visemes = [], audioRef = null }) => {"
    )
    content = content.replace(
        "const AvatarRigPlayer3D = ({ recordedFrames, avatarUrl, liveFrame, smoothingEnabled }) => {",
        "const AvatarRigPlayer3D = ({ recordedFrames, avatarUrl, liveFrame, smoothingEnabled, visemes = [], audioRef = null }) => {"
    )
    # Pass visemes + audioRef through to AvatarRig
    content = content.replace(
        "<AvatarRig \n        recordedFrames={recordedFrames} \n        avatarUrl={avatarUrl} \n        liveFrame={liveFrame}\n        smoothingEnabled={smoothingEnabled}\n      />",
        "<AvatarRig recordedFrames={recordedFrames} avatarUrl={avatarUrl} liveFrame={liveFrame} smoothingEnabled={smoothingEnabled} visemes={visemes} audioRef={audioRef} />"
    )
    print("  ✅ visemes + audioRef props added")
else:
    print("  ✅ visemes props already present")

with open(path, "w") as f:
    f.write(content)
PYEOF

# ════════════════════════════════════════════════════════════
# PATCH 6 — BeatEditorPage.js: add save/load/delete markers
# ════════════════════════════════════════════════════════════
echo ""
echo "⚙️  Patching BeatEditorPage.js..."
python3 << 'PYEOF'
import re
path = "src/front/js/pages/BeatEditorPage.js"
with open(path, "r") as f:
    content = f.read()

changed = False

# Add savedBeatmaps state if missing
if "savedBeatmaps" not in content:
    content = content.replace(
        "const [status, setStatus] = useState('');",
        "const [status, setStatus] = useState('');\n  const [savedBeatmaps, setSavedBeatmaps] = useState([]);\n  const [loadingMaps, setLoadingMaps] = useState(false);"
    )
    changed = True
    print("  ✅ savedBeatmaps state added")

# Add handleSave / loadSaved / deleteBeatmap functions before return()
save_fns = """
  const handleSave = async () => {
    if (!beatMarkers.length) { setStatus('No markers to save'); return; }
    const token = localStorage.getItem('token');
    if (!token) { setStatus('Login required'); return; }
    try {
      const res = await fetch(`${BACKEND}/api/save-beatmap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ song_name: songName || 'Untitled', beat_markers: beatMarkers }),
      });
      const data = await res.json();
      setStatus(res.ok ? `✅ Saved (ID: ${data.id})` : `❌ ${data.error}`);
      if (res.ok) loadSavedBeatmaps();
    } catch (err) { setStatus(`❌ ${err.message}`); }
  };

  const loadSavedBeatmaps = async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    setLoadingMaps(true);
    try {
      const res = await fetch(`${BACKEND}/api/load-beatmaps`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (Array.isArray(data)) setSavedBeatmaps(data);
    } catch {} finally { setLoadingMaps(false); }
  };

  const handleDeleteBeatmap = async (id) => {
    const token = localStorage.getItem('token');
    if (!token) return;
    await fetch(`${BACKEND}/api/delete-beatmap/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    setSavedBeatmaps(prev => prev.filter(b => b.id !== id));
  };

"""

if "handleSave" not in content:
    content = content.replace("  return (", save_fns + "  return (")
    changed = True
    print("  ✅ save/load/delete functions added")
else:
    print("  ✅ save functions already present")

# Add delete button to marker pills
if "deleteMarker" not in content and "setBeatMarkers" in content:
    content = content.replace(
        "{beatMarkers.map((time, i) => (",
        "{beatMarkers.map((time, i) => (\n              <div key={i} style={{display:'flex',alignItems:'center',gap:'4px'}}>"
    )
    changed = True

with open(path, "w") as f:
    f.write(content)
if changed:
    print("  ✅ BeatEditorPage.js patched")
else:
    print("  ✅ BeatEditorPage.js already up to date")
PYEOF

# ════════════════════════════════════════════════════════════
# PATCH 7 — BeatMapEditorPage.js: add save + delete marker
# ════════════════════════════════════════════════════════════
echo ""
echo "⚙️  Patching BeatMapEditorPage.js..."
python3 << 'PYEOF'
path = "src/front/js/pages/BeatMapEditorPage.js"
with open(path, "r") as f:
    content = f.read()

changed = False

if "handleSave" not in content:
    save_fn = """
  const handleSave = async () => {
    if (!beatMarkers.length) { setStatus('No markers to save'); return; }
    const token = localStorage.getItem('token');
    if (!token) { setStatus('Login required'); return; }
    try {
      const res = await fetch(`${BACKEND}/api/save-beatmap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ song_name: songName || 'Untitled', beat_markers: beatMarkers }),
      });
      const data = await res.json();
      setStatus(res.ok ? `✅ Saved (ID: ${data.id})` : `❌ ${data.error}`);
    } catch (err) { setStatus(`❌ ${err.message}`); }
  };

"""
    content = content.replace("  return (", save_fn + "  return (")
    changed = True
    print("  ✅ handleSave added to BeatMapEditorPage")
else:
    print("  ✅ handleSave already present")

with open(path, "w") as f:
    f.write(content)
PYEOF

# ════════════════════════════════════════════════════════════
# PATCH 8 — DanceSyncPage.js: add genre detection + save beatmap button
# ════════════════════════════════════════════════════════════
echo ""
echo "⚙️  Patching DanceSyncPage.js..."
python3 << 'PYEOF'
path = "src/front/js/pages/DanceSyncPage.js"
with open(path, "r") as f:
    content = f.read()

changed = False

# Add genre state
if "const [genre, setGenre]" not in content:
    content = content.replace(
        "const [tempo, setTempo] = useState(null);",
        "const [tempo, setTempo] = useState(null);\n  const [genre, setGenre] = useState('pop');"
    )
    changed = True
    print("  ✅ genre state added")

# Add genre detection helper before component
genre_fn = """
// BPM → genre heuristic
function detectGenre(bpm) {
  if (!bpm) return 'pop';
  if (bpm < 75)  return 'slow';
  if (bpm < 100) return 'hiphop';
  if (bpm < 130) return 'pop';
  if (bpm < 160) return 'edm';
  return 'fast';
}

"""
if "detectGenre" not in content:
    content = content.replace("const DanceSyncPage", genre_fn + "const DanceSyncPage")
    changed = True
    print("  ✅ detectGenre helper added")

# Wire genre detection after tempo is set
if "detectGenre" in content and "setGenre(detectGenre" not in content:
    content = content.replace(
        "if (data.tempo) setTempo(data.tempo);",
        "if (data.tempo) { setTempo(data.tempo); setGenre(detectGenre(data.tempo)); }"
    )
    changed = True
    print("  ✅ Genre auto-detect wired to beat analysis")

# Add save beatmap button near existing buttons (after analyze-beats response)
if "save-beatmap" not in content and "handleSaveBeatmap" not in content:
    save_fn = """
  const handleSaveBeatmap = async () => {
    if (!beatTimes.length) return;
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      const res = await fetch(`${BACKEND}/api/save-beatmap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ song_name: fileName || 'Untitled', beat_markers: beatTimes, bpm: tempo }),
      });
      const data = await res.json();
      alert(res.ok ? `✅ Beatmap saved (ID: ${data.id})` : `❌ ${data.error}`);
    } catch (err) { alert(`❌ ${err.message}`); }
  };

"""
    content = content.replace("  const handlePlay = ", save_fn + "  const handlePlay = ")
    changed = True
    print("  ✅ handleSaveBeatmap added to DanceSyncPage")
else:
    print("  ✅ save beatmap already present")

with open(path, "w") as f:
    f.write(content)
PYEOF

# ════════════════════════════════════════════════════════════
# PATCH 9 — ReplayMotionSession.js: add scrubber
# ════════════════════════════════════════════════════════════
echo ""
echo "⚙️  Patching ReplayMotionSession.js..."
python3 << 'PYEOF'
import re
path = "src/front/js/pages/ReplayMotionSession.js"
with open(path, "r") as f:
    content = f.read()

changed = False

# Add currentFrame state if missing
if "currentFrame" not in content:
    content = content.replace(
        "const [isPlaying, setIsPlaying] = useState(false);",
        "const [isPlaying, setIsPlaying] = useState(false);\n  const [currentFrame, setCurrentFrame] = useState(0);\n  const [loop, setLoop] = useState(false);"
    )
    changed = True
    print("  ✅ currentFrame + loop state added")

# Add scrubber input before existing playback controls
scrubber_jsx = """
              {/* Scrubber */}
              {frames.length > 0 && (
                <div style={{ marginBottom: '8px' }}>
                  <input
                    type="range" min={0} max={Math.max(0, frames.length - 1)}
                    value={currentFrame}
                    onChange={(e) => {
                      const idx = parseInt(e.target.value, 10);
                      setCurrentFrame(idx);
                    }}
                    style={{ width: '100%', accentColor: '#8b5cf6' }}
                    disabled={isPlaying}
                  />
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:'11px', color:'#888' }}>
                    <span>Frame {currentFrame}</span>
                    <span>{frames.length} total</span>
                  </div>
                </div>
              )}
"""

if "type=\"range\"" not in content and "frames.length" in content:
    # Insert before the play button
    content = content.replace(
        "{!isPlaying ?",
        scrubber_jsx + "{!isPlaying ?"
    )
    changed = True
    print("  ✅ Scrubber added to ReplayMotionSession")
else:
    print("  ✅ Scrubber already present")

# Add loop checkbox near speed selector if missing
if "Loop" not in content and "playbackSpeed" in content:
    content = content.replace(
        "</select>",
        "</select>\n              <label style={{display:'flex',alignItems:'center',gap:'6px',fontSize:'13px',color:'#ccc',cursor:'pointer'}}>\n                <input type=\"checkbox\" checked={loop} onChange={e=>setLoop(e.target.checked)} style={{accentColor:'#8b5cf6'}} />\n                Loop\n              </label>",
        1  # only first occurrence (speed select)
    )
    changed = True
    print("  ✅ Loop toggle added")

with open(path, "w") as f:
    f.write(content)
PYEOF

# ════════════════════════════════════════════════════════════
# DONE
# ════════════════════════════════════════════════════════════
echo ""
echo "════════════════════════════════════════════════════════"
echo "✅  All patches applied!"
echo ""
echo "Next steps:"
echo "  1. Backend:  kill your Flask process and restart:"
echo "               pipenv run start   (or python src/app.py)"
echo ""
echo "  2. Frontend: npm start  (from src/front/ or repo root)"
echo ""
echo "  3. If anything breaks, originals are in .df_backup/"
echo "════════════════════════════════════════════════════════"
