#!/usr/bin/env bash
# build-verified.sh — the AP-11 teeth: build + marker gate + the manifest.
# Exit 0 = the artifact is gate-clean; exit 1 = the named marker diff.
# Usage: scripts/build-verified.sh [--skip-build]  (verify the existing dist)
set -euo pipefail
cd "$(dirname "$0")/.."
BASELINE=".trident/dist-marker-baseline.json"
BUNDLE="dist/index.js"
MANIFEST=".trident/artifact-manifest.json"

[ -f "$BASELINE" ] || { echo "GATE FAIL: no baseline at $BASELINE"; exit 1; }
if [ "${1:-}" != "--skip-build" ]; then
  bun build src/index.ts --outdir dist --target bun --format esm --bundle \
    || { echo "GATE FAIL: build error"; exit 1; }
fi
[ -f "$BUNDLE" ] || { echo "GATE FAIL: no bundle at $BUNDLE"; exit 1; }

FAIL=0
while IFS=$'\t' read -r marker floor; do
  c=$(grep -cF -- "$marker" "$BUNDLE" || true)
  if [ "$c" -lt "$floor" ]; then
    echo "MARKER FAIL: '$marker' count=$c < floor=$floor"; FAIL=1
  else
    echo "marker ok: '$marker' count=$c (floor $floor)"
  fi
done < <(jq -r '.min_markers | to_entries[] | .key + "\t" + (.value | tostring)' "$BASELINE")

while IFS=$'\t' read -r marker ceiling; do
  c=$(grep -cF -- "$marker" "$BUNDLE" || true)
  if [ "$c" -gt "$ceiling" ]; then
    echo "FORBIDDEN FAIL: '$marker' count=$c > ceiling=$ceiling"; FAIL=1
  else
    echo "forbidden ok: '$marker' count=$c (ceiling $ceiling)"
  fi
done < <(jq -r '.max_markers | to_entries[] | .key + "\t" + (.value | tostring)' "$BASELINE")

[ "$FAIL" -eq 0 ] || { echo "BUILD GATE: FAIL"; exit 1; }

SHA=$(sha256sum "$BUNDLE" | cut -d' ' -f1)
echo "$SHA  $BUNDLE" > .trident/artifact.sha

# --- the manifest emission (the label binds to the bytes) ---
PREV="null"
[ -f "$MANIFEST" ] && PREV="\"$(jq -r .dist_sha256 "$MANIFEST")\""
python3 - "$SHA" "$(stat -c %s "$BUNDLE")" "$PREV" "$BASELINE" "$BUNDLE" << 'PYM'
import json, subprocess, sys, datetime
sha, size, prev, baseline_path, bundle = sys.argv[1:6]
srcfp = subprocess.run("git ls-files src/ 2>/dev/null | sort | xargs cat 2>/dev/null | sha256sum",
                       shell=True, capture_output=True, text=True).stdout.split()[0] or "untracked"
baseline = json.load(open(baseline_path))
counts = {}
for m in list(baseline["min_markers"]) + list(baseline["max_markers"]):
    out = subprocess.run(["grep", "-cF", m, bundle], capture_output=True, text=True)
    counts[m] = int(out.stdout.strip() or 0)
manifest = {
    "schema": 1,
    "built_at": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "dist_sha256": sha,
    "dist_bytes": int(size),
    "source_fingerprint": srcfp,
    "marker_counts": counts,
    "baseline_version": baseline["version"],
    "gate": "PASS",
    "lineage": {"predecessor_sha": None if prev == "null" else prev,
                "checkpoint_ref": "the sealed snapshots (historical reference only)"},
}
open(".trident/artifact-manifest.json", "w").write(json.dumps(manifest, indent=2))
print("MANIFEST: .trident/artifact-manifest.json (sha " + sha[:16] + ")")
PYM

echo "BUILD GATE: PASS — dist sha ${SHA:0:16}"
