#!/bin/bash
# Fix MotionCapturePage — force replace LiveMoCapAvatar with MotionCaptureSystem

echo "⚙️  Fixing MotionCapturePage..."

python3 << 'PYEOF'
path = "src/front/js/pages/MotionCapturePage.js"
with open(path) as f:
    content = f.read()

print(f"  File size: {len(content)} chars")

# Show what's actually in the import section
import_lines = [l for l in content.split('\n') if 'import' in l and ('MoCap' in l or 'Motion' in l)]
print(f"  Current MoCap imports: {import_lines}")

# Show what component is used in JSX
if 'LiveMoCapAvatar' in content:
    idx = content.index('LiveMoCapAvatar')
    print(f"  LiveMoCapAvatar found at char {idx}")
    print(f"  Context: ...{content[max(0,idx-50):idx+100]}...")

# Force replace ALL occurrences
content = content.replace(
    "import LiveMoCapAvatar from '../component/LiveMoCapAvatar';",
    "import MotionCaptureSystem from '../component/MotionCaptureSystem';"
)

# Handle case where MotionCaptureSystem import already exists (from round 1)
# and LiveMoCapAvatar import is still there but under a different path
import re
content = re.sub(
    r"import LiveMoCapAvatar from ['\"].*?['\"];",
    "// LiveMoCapAvatar replaced",
    content
)

# Replace JSX usage — all forms
# Single line self-closing
content = re.sub(
    r'<LiveMoCapAvatar\s+[^/]*/?>',
    '''<MotionCaptureSystem
            avatarUrl={avatarUrl}
            showWebcam={showVideo}
            smoothingPreset="balanced"
            onPoseFrame={handleFrame}
          />''',
    content,
    flags=re.DOTALL
)

# Multi-line with closing tag
content = re.sub(
    r'<LiveMoCapAvatar[\s\S]*?</LiveMoCapAvatar>',
    '''<MotionCaptureSystem
            avatarUrl={avatarUrl}
            showWebcam={showVideo}
            smoothingPreset="balanced"
            onPoseFrame={handleFrame}
          />''',
    content,
    flags=re.DOTALL
)

# Ensure MotionCaptureSystem is imported (not duplicated)
if "import MotionCaptureSystem" not in content:
    content = content.replace(
        "import React",
        "import MotionCaptureSystem from '../component/MotionCaptureSystem';\nimport React"
    )

# Remove duplicate imports
lines = content.split('\n')
seen = set()
deduped = []
for line in lines:
    key = line.strip()
    if key.startswith('import ') and key in seen:
        continue
    if key.startswith('import '):
        seen.add(key)
    deduped.append(line)
content = '\n'.join(deduped)

with open(path, 'w') as f:
    f.write(content)

# Verify
with open(path) as f:
    final = f.read()

if 'LiveMoCapAvatar' in final and '// LiveMoCapAvatar replaced' not in final:
    print("  ❌ LiveMoCapAvatar still present as component usage")
    # Find it
    for i, line in enumerate(final.split('\n')):
        if 'LiveMoCapAvatar' in line:
            print(f"    Line {i+1}: {line.strip()}")
elif 'MotionCaptureSystem' in final:
    print("  ✅ MotionCapturePage now uses MotionCaptureSystem")
else:
    print("  ❌ Neither component found")
PYEOF

# Verify
echo ""
echo "⚙️  Verifying..."
python3 -c "
path = 'src/front/js/pages/MotionCapturePage.js'
with open(path) as f: c = f.read()
has_mcs = 'MotionCaptureSystem' in c
has_lmca = '<LiveMoCapAvatar' in c
if has_mcs and not has_lmca:
    print('  ✅ PASS — MotionCapturePage uses MotionCaptureSystem')
elif has_lmca:
    print('  ❌ FAIL — LiveMoCapAvatar JSX still present')
    import re
    for m in re.finditer(r'LiveMoCapAvatar', c):
        start = max(0, m.start()-30)
        print(f'    Found at: ...{c[start:m.start()+60]}...')
else:
    print('  ⚠️  Neither component found in JSX')
"

echo ""
echo "✅ Done. Restart frontend: cd src/front && npm start"
